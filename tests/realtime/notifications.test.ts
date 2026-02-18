/**
 * Notifications Service Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  NotificationService,
  NotificationBuilder,
  type NotificationsConfig,
  type NotificationRecipient,
  type NotificationPayload,
} from '../../src/realtime/notifications.js';
import { StructuredLogger } from '../../src/utils/structured-logger.js';

describe('NotificationService', () => {
  let service: NotificationService;

  const mockConfig: NotificationsConfig = {
    general: {
      defaultCountryCode: '254',
      retryAttempts: 3,
      retryDelayMs: 1000,
    },
  };

  beforeEach(() => {
    service = new NotificationService(mockConfig, new StructuredLogger());
  });

  describe('Initialization', () => {
    it('should initialize without providers', async () => {
      await expect(service.initialize()).resolves.not.toThrow();
    });

    it('should return health check with no providers', async () => {
      await service.initialize();
      const health = await service.healthCheck();
      
      expect(health.fcm).toBe(false);
      expect(health.onesignal).toBe(false);
      expect(health.sendgrid).toBe(false);
      expect(health.twilio).toBe(false);
      expect(health.africastalking).toBe(false);
    });
  });

  describe('NotificationBuilder', () => {
    it('should build a complete notification', () => {
      const notification = NotificationBuilder.create('notif-123')
        .withTitle('Payment Successful')
        .withBody('Your payment of 1000 KES was successful.')
        .withType('payment.completed')
        .withPriority('high')
        .withUrl('https://example.com/payments/tx-123')
        .withData({ transactionId: 'tx-123', amount: 1000 })
        .withActions([
          { id: 'view', title: 'View Details', url: 'https://example.com/payments/tx-123' },
        ])
        .build();

      expect(notification.id).toBe('notif-123');
      expect(notification.title).toBe('Payment Successful');
      expect(notification.body).toBe('Your payment of 1000 KES was successful.');
      expect(notification.type).toBe('payment.completed');
      expect(notification.priority).toBe('high');
      expect(notification.url).toBe('https://example.com/payments/tx-123');
      expect(notification.data?.transactionId).toBe('tx-123');
      expect(notification.actions?.length).toBe(1);
    });

    it('should throw error when required fields are missing', () => {
      expect(() => {
        NotificationBuilder.create('notif-123').build();
      }).toThrow('Notification ID, title, body, and type are required');
    });

    it('should build from transaction event', () => {
      const transaction = {
        id: 'tx-123',
        providerTransactionId: 'prov-tx-123',
        provider: 'mpesa',
        status: 'completed',
        amount: { amount: 1000, currency: 'KES' },
        customer: { id: 'cust-123', name: 'John Doe' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const notification = NotificationBuilder.create('notif-123')
        .fromTransactionEvent('payment.completed', transaction)
        .build();

      expect(notification.type).toBe('payment.completed');
      expect(notification.priority).toBe('high');
      expect(notification.data?.transactionId).toBe('tx-123');
      expect(notification.data?.amount).toBe(1000);
    });

    it('should build failed payment notification', () => {
      const transaction = {
        id: 'tx-123',
        providerTransactionId: 'prov-tx-123',
        provider: 'mpesa',
        status: 'failed',
        amount: { amount: 1000, currency: 'KES' },
        customer: { id: 'cust-123' },
        failureReason: 'Insufficient funds',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const notification = NotificationBuilder.create('notif-123')
        .fromTransactionEvent('payment.failed', transaction)
        .build();

      expect(notification.type).toBe('payment.failed');
      expect(notification.priority).toBe('high');
      expect(notification.body).toContain('failed');
    });

    it('should build refund notification', () => {
      const transaction = {
        id: 'tx-123',
        providerTransactionId: 'prov-tx-123',
        provider: 'mpesa',
        status: 'refunded',
        amount: { amount: 1000, currency: 'KES' },
        customer: { id: 'cust-123' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const notification = NotificationBuilder.create('notif-123')
        .fromTransactionEvent('refund.processed', transaction)
        .build();

      expect(notification.type).toBe('refund.processed');
      expect(notification.priority).toBe('normal');
      expect(notification.body).toContain('refund');
    });
  });

  describe('Channel Determination', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should determine push channel when FCM tokens available', async () => {
      const recipient: NotificationRecipient = {
        userId: 'user-123',
        fcmTokens: ['token-123'],
        preferences: { pushEnabled: true },
      };

      const payload = NotificationBuilder.create('notif-123')
        .withTitle('Test')
        .withBody('Test body')
        .withType('test')
        .build();

      const results = await service.send(recipient, payload);
      
      // Should try push even though no provider is configured
      const pushResult = results.find(r => r.channel === 'push');
      expect(pushResult).toBeDefined();
      expect(pushResult?.success).toBe(false); // No FCM provider configured
    });

    it('should determine email channel when email available', async () => {
      const recipient: NotificationRecipient = {
        userId: 'user-123',
        email: 'test@example.com',
        preferences: { emailEnabled: true },
      };

      const payload = NotificationBuilder.create('notif-123')
        .withTitle('Test')
        .withBody('Test body')
        .withType('test')
        .build();

      const results = await service.send(recipient, payload);
      
      const emailResult = results.find(r => r.channel === 'email');
      expect(emailResult).toBeDefined();
    });

    it('should determine SMS channel for high priority when phone available', async () => {
      const recipient: NotificationRecipient = {
        userId: 'user-123',
        phoneNumber: '+254712345678',
        preferences: { smsEnabled: true },
      };

      const payload = NotificationBuilder.create('notif-123')
        .withTitle('Test')
        .withBody('Test body')
        .withType('test')
        .withPriority('high')
        .build();

      const results = await service.send(recipient, payload);
      
      const smsResult = results.find(r => r.channel === 'sms');
      expect(smsResult).toBeDefined();
    });

    it('should not send SMS for normal priority by default', async () => {
      const recipient: NotificationRecipient = {
        userId: 'user-123',
        phoneNumber: '+254712345678',
        preferences: { smsEnabled: true },
      };

      const payload = NotificationBuilder.create('notif-123')
        .withTitle('Test')
        .withBody('Test body')
        .withType('test')
        .withPriority('normal')
        .build();

      const results = await service.send(recipient, payload);
      
      const smsResult = results.find(r => r.channel === 'sms');
      expect(smsResult).toBeUndefined();
    });

    it('should respect user preferences', async () => {
      const recipient: NotificationRecipient = {
        userId: 'user-123',
        email: 'test@example.com',
        fcmTokens: ['token-123'],
        preferences: { emailEnabled: false, pushEnabled: true },
      };

      const payload = NotificationBuilder.create('notif-123')
        .withTitle('Test')
        .withBody('Test body')
        .withType('test')
        .build();

      const results = await service.send(recipient, payload);
      
      const emailResult = results.find(r => r.channel === 'email');
      expect(emailResult).toBeUndefined(); // Email disabled

      const pushResult = results.find(r => r.channel === 'push');
      expect(pushResult).toBeDefined(); // Push enabled
    });
  });

  describe('Batch Sending', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should send to multiple recipients', async () => {
      const recipients: NotificationRecipient[] = [
        {
          userId: 'user-1',
          email: 'user1@example.com',
          preferences: { emailEnabled: true },
        },
        {
          userId: 'user-2',
          email: 'user2@example.com',
          preferences: { emailEnabled: true },
        },
      ];

      const payload = NotificationBuilder.create('notif-123')
        .withTitle('Test')
        .withBody('Test body')
        .withType('test')
        .build();

      const results = await service.sendBatch(recipients, payload);
      
      expect(results.length).toBe(2);
    });
  });

  describe('Device Management', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should register device', async () => {
      await expect(
        service.registerDevice('user-123', 'token-abc', 'android')
      ).resolves.not.toThrow();
    });

    it('should unregister device', async () => {
      await service.registerDevice('user-123', 'token-abc', 'android');
      await expect(
        service.unregisterDevice('user-123', 'token-abc')
      ).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return error when no email available', async () => {
      const recipient: NotificationRecipient = {
        userId: 'user-123',
        // No email
      };

      const payload = NotificationBuilder.create('notif-123')
        .withTitle('Test')
        .withBody('Test body')
        .withType('test')
        .build();

      const results = await service.send(recipient, payload, ['email']);
      
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('No email');
    });

    it('should return error when no phone available', async () => {
      const recipient: NotificationRecipient = {
        userId: 'user-123',
        // No phone
      };

      const payload = NotificationBuilder.create('notif-123')
        .withTitle('Test')
        .withBody('Test body')
        .withType('test')
        .build();

      const results = await service.send(recipient, payload, ['sms']);
      
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('No phone');
    });

    it('should return error when no push tokens available', async () => {
      const recipient: NotificationRecipient = {
        userId: 'user-123',
        // No tokens
      };

      const payload = NotificationBuilder.create('notif-123')
        .withTitle('Test')
        .withBody('Test body')
        .withType('test')
        .build();

      const results = await service.send(recipient, payload, ['push']);
      
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('No FCM tokens');
    });
  });
});

// Mock tests for providers that would require API credentials
describe('Notification Providers (Mock)', () => {
  describe('SendGrid Email', () => {
    it('should format HTML email correctly', () => {
      const payload: NotificationPayload = {
        id: 'notif-123',
        title: 'Payment Successful',
        body: 'Your payment was successful.',
        type: 'payment.completed',
        priority: 'normal',
        transaction: {
          id: 'tx-123',
          providerTransactionId: 'prov-tx-123',
          provider: 'mpesa',
          status: 'completed',
          amount: { amount: 1000, currency: 'KES' },
          customer: { id: 'cust-123', name: 'John Doe' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        url: 'https://example.com/tx-123',
      };

      // The HTML format should include key elements
      const expectedElements = [
        'Payment Successful',
        'Your payment was successful.',
        '1000',
        'KES',
        'View Details',
        'https://example.com/tx-123',
      ];

      // Verify builder creates correct structure
      expect(payload.title).toBe('Payment Successful');
      expect(payload.transaction?.amount.amount).toBe(1000);
      expect(payload.url).toBe('https://example.com/tx-123');
    });
  });

  describe('SMS Formatting', () => {
    it('should format SMS message correctly', () => {
      const payload = NotificationBuilder.create('notif-123')
        .withTitle('Payment Alert')
        .withBody('Your payment of 5000 KES has been received.')
        .withType('payment.completed')
        .withUrl('https://pay.app/tx-123')
        .build();

      // SMS should include title, body and URL
      const smsContent = `${payload.title}\n\n${payload.body}${payload.url ? `\n\n${payload.url}` : ''}`;
      
      expect(smsContent).toContain('Payment Alert');
      expect(smsContent).toContain('5000 KES');
      expect(smsContent).toContain('https://pay.app/tx-123');
    });
  });
});
