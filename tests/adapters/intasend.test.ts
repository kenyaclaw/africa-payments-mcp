/**
 * IntaSend Adapter Tests
 * 
 * Test suite for the IntaSend API adapter.
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { IntaSendAdapter } from '../../src/adapters/intasend/index.js';
import { 
  IntaSendConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams 
} from '../../src/types/index.js';

const mockConfig: IntaSendConfig = {
  enabled: true,
  environment: 'sandbox',
  publishableKey: 'pk_test_intasend_123',
  secretKey: 'sk_test_intasend_456',
  serviceProvider: 'M-PESA',
};

describe('IntaSendAdapter', () => {
  let adapter: IntaSendAdapter;

  beforeEach(() => {
    adapter = new IntaSendAdapter(mockConfig);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('intasend');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('IntaSend');
    });

    it('should support Kenya and Nigeria', () => {
      expect(adapter.countries).toContain('KE');
      expect(adapter.countries).toContain('NG');
    });

    it('should support KES and NGN', () => {
      expect(adapter.currencies).toContain('KES');
      expect(adapter.currencies).toContain('NGN');
    });

    it('should support multiple payment methods', () => {
      expect(adapter.supportedMethods).toContain('mobile_money');
      expect(adapter.supportedMethods).toContain('card');
      expect(adapter.supportedMethods).toContain('bank_transfer');
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await expect(adapter.initialize({})).resolves.not.toThrow();
    });
  });

  describe('sendMoney', () => {
    const sendMoneyParams: SendMoneyParams = {
      recipient: {
        phone: {
          countryCode: '254',
          nationalNumber: '712345678',
          formatted: '+254712345678',
        },
        name: 'John Doe',
      },
      amount: {
        amount: 5000,
        currency: 'KES',
      },
      description: 'Test payout',
    };

    it('should initiate payout successfully', async () => {
      const transaction = await adapter.sendMoney(sendMoneyParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('intasend_payout_');
      expect(transaction.provider).toBe('intasend');
      expect(transaction.status).toBe('pending');
      expect(transaction.amount.amount).toBe(5000);
      expect(transaction.amount.currency).toBe('KES');
    });

    it('should generate unique transaction IDs', async () => {
      const tx1 = await adapter.sendMoney(sendMoneyParams);
      jest.advanceTimersByTime(1000);
      const tx2 = await adapter.sendMoney(sendMoneyParams);

      expect(tx1.id).not.toBe(tx2.id);
    });
  });

  describe('requestPayment', () => {
    const requestPaymentParams: RequestPaymentParams = {
      customer: {
        phone: {
          countryCode: '254',
          nationalNumber: '712345678',
          formatted: '+254712345678',
        },
        name: 'Jane Doe',
        email: 'jane@example.com',
      },
      amount: {
        amount: 3000,
        currency: 'KES',
      },
      description: 'Test collection',
    };

    it('should initiate collection successfully', async () => {
      const transaction = await adapter.requestPayment(requestPaymentParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('intasend_');
      expect(transaction.provider).toBe('intasend');
      expect(transaction.status).toBe('pending');
      expect(transaction.metadata?.checkoutUrl).toContain('intasend');
    });
  });

  describe('verifyTransaction', () => {
    it('should return transaction status', async () => {
      const transaction = await adapter.verifyTransaction('intasend_test_123');

      expect(transaction).toBeDefined();
      expect(transaction.status).toBe('completed');
      expect(transaction.completedAt).toBeDefined();
    });
  });

  describe('refund', () => {
    it('should process refund', async () => {
      const refundParams: RefundParams = {
        originalTransactionId: 'intasend_test_123',
        reason: 'Customer request',
      };

      const transaction = await adapter.refund(refundParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('intasend_refund_');
      expect(transaction.status).toBe('completed');
    });
  });

  describe('getBalance', () => {
    it('should return balance', async () => {
      const balance = await adapter.getBalance();

      expect(balance).toBeDefined();
      expect(balance.amount).toBe(100000);
      expect(balance.currency).toBe('KES');
    });
  });
});
