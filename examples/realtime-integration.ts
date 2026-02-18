/**
 * Real-time Integration Example
 * Shows how to use WebSocket, Event Streaming, and Notifications together
 */

import { createServer } from 'http';
import express from 'express';
import {
  PaymentWebSocketServer,
  initializeEventStreaming,
  initializeNotifications,
  NotificationBuilder,
  StreamingEventBuilder,
  getGlobalEventEmitter,
  type WebSocketConfig,
  type EventStreamConfig,
  type NotificationsConfig,
} from '../src/realtime/index.js';
import { StructuredLogger } from '../src/utils/structured-logger.js';

const logger = new StructuredLogger();

// ==================== Configuration ====================

const wsConfig: WebSocketConfig = {
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  corsOrigins: ['http://localhost:3000', 'https://yourdomain.com'],
  maxConnectionsPerUser: 5,
  rateLimitPerMinute: 100,
};

const eventStreamConfig: EventStreamConfig = {
  broker: (process.env.EVENT_BROKER as 'kafka' | 'rabbitmq' | 'memory') || 'memory',
  kafka: process.env.KAFKA_BROKERS ? {
    brokers: process.env.KAFKA_BROKERS.split(','),
    clientId: 'africa-payments-mcp',
    groupId: 'payment-processors',
  } : undefined,
  rabbitmq: process.env.RABBITMQ_URL ? {
    url: process.env.RABBITMQ_URL,
    prefetchCount: 10,
  } : undefined,
  general: {
    paymentTopic: 'payment.events',
    deadLetterTopic: 'payment.events.dlq',
    retryTopic: 'payment.events.retry',
    maxRetries: 3,
    retryDelayMs: 5000,
  },
};

const notificationsConfig: NotificationsConfig = {
  fcm: process.env.FCM_PROJECT_ID ? {
    projectId: process.env.FCM_PROJECT_ID,
    serviceAccount: process.env.FCM_SERVICE_ACCOUNT || {},
    defaultIcon: '/icon.png',
    defaultSound: true,
  } : undefined,
  sendgrid: process.env.SENDGRID_API_KEY ? {
    apiKey: process.env.SENDGRID_API_KEY,
    fromEmail: 'notifications@yourdomain.com',
    fromName: 'Africa Payments',
  } : undefined,
  twilio: process.env.TWILIO_ACCOUNT_SID ? {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: process.env.TWILIO_FROM_NUMBER || '',
  } : undefined,
  africasTalking: process.env.AT_USERNAME ? {
    username: process.env.AT_USERNAME,
    apiKey: process.env.AT_API_KEY || '',
    from: 'AFRIPAY',
  } : undefined,
};

// ==================== Main Application ====================

async function main() {
  const app = express();
  const httpServer = createServer(app);

  // Initialize services
  logger.info('🚀 Initializing real-time services...');

  // 1. Initialize WebSocket Server
  const wsServer = new PaymentWebSocketServer(httpServer, wsConfig, logger);
  logger.info('✅ WebSocket server initialized');

  // 2. Initialize Event Streaming
  const eventClient = await initializeEventStreaming(eventStreamConfig, logger);
  logger.info('✅ Event streaming initialized');

  // 3. Initialize Notifications
  const notificationService = await initializeNotifications(notificationsConfig, logger);
  logger.info('✅ Notification service initialized');

  // 4. Setup Event Pipeline
  setupEventPipeline(wsServer, eventClient, notificationService);

  // 5. Setup HTTP endpoints
  setupHttpEndpoints(app, wsServer);

  // 6. Setup Event Consumers
  await setupEventConsumers(eventClient, notificationService);

  // Start server
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    logger.info(`🌐 Server listening on port ${PORT}`);
    logger.info(`📊 Dashboard available at http://localhost:${PORT}/dashboard`);
  });
}

// ==================== Event Pipeline ====================

function setupEventPipeline(
  wsServer: PaymentWebSocketServer,
  eventClient: any,
  notificationService: any
) {
  const eventEmitter = getGlobalEventEmitter();

  // Listen for all payment events from webhook events
  eventEmitter.onAllPaymentEvents(async (eventData) => {
    logger.debug('📨 Processing payment event', { type: eventData.eventType });

    // 1. Broadcast via WebSocket
    wsServer.broadcastPaymentEvent(eventData);

    // 2. Publish to event stream
    const streamingEvent = StreamingEventBuilder.create()
      .fromPaymentEventData(eventData)
      .build();
    
    try {
      await eventClient.publish(streamingEvent);
    } catch (error) {
      logger.error('Failed to publish to event stream', { error: (error as Error).message });
    }

    // 3. Send notifications for important events
    if (shouldNotify(eventData.eventType)) {
      await sendNotification(eventData, notificationService);
    }
  });
}

function shouldNotify(eventType: string): boolean {
  const notifyEvents = [
    'payment.completed',
    'payment.failed',
    'refund.processed',
  ];
  return notifyEvents.includes(eventType);
}

async function sendNotification(eventData: any, notificationService: any) {
  if (!eventData.transaction) return;

  const customer = eventData.transaction.customer;
  if (!customer) return;

  const notification = NotificationBuilder.create(`notif-${Date.now()}`)
    .fromTransactionEvent(eventData.eventType, eventData.transaction)
    .withUrl(`https://yourdomain.com/transactions/${eventData.transaction.id}`)
    .build();

  const recipient = {
    userId: customer.id || 'anonymous',
    email: customer.email,
    phoneNumber: customer.phone?.formatted,
    preferences: {
      emailEnabled: true,
      pushEnabled: true,
      smsEnabled: eventData.eventType === 'payment.failed',
    },
  };

  try {
    const results = await notificationService.send(recipient, notification);
    logger.info('📧 Notifications sent', {
      userId: recipient.userId,
      results: results.map((r: any) => ({ channel: r.channel, success: r.success })),
    });
  } catch (error) {
    logger.error('Failed to send notifications', { error: (error as Error).message });
  }
}

// ==================== HTTP Endpoints ====================

function setupHttpEndpoints(app: express.Application, wsServer: PaymentWebSocketServer) {
  app.use(express.json());

  // Health check
  app.get('/health', async (req, res) => {
    const wsConnections = wsServer.getConnectionCount();
    
    res.json({
      status: 'healthy',
      websocket: {
        connections: wsConnections,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Dashboard
  app.get('/dashboard', (req, res) => {
    res.redirect('/tools/realtime-dashboard.html');
  });

  // Send notification API
  app.post('/api/notify', async (req, res) => {
    try {
      const { userId, title, body, channels } = req.body;

      const notification = NotificationBuilder.create(`api-${Date.now()}`)
        .withTitle(title)
        .withBody(body)
        .withType('api.notification')
        .build();

      const recipient = {
        userId,
        email: req.body.email,
        phoneNumber: req.body.phoneNumber,
      };

      const notificationService = (await import('../src/realtime/notifications.js')).getNotificationService();
      
      if (!notificationService) {
        return res.status(503).json({ error: 'Notification service not available' });
      }

      const results = await notificationService.send(recipient, notification, channels);

      res.json({
        success: true,
        results: results.map(r => ({
          channel: r.channel,
          success: r.success,
          error: r.error,
        })),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  // Broadcast message to all connected clients
  app.post('/api/broadcast', (req, res) => {
    try {
      const { event, payload } = req.body;
      wsServer.broadcast(event, payload);
      
      res.json({
        success: true,
        connections: wsServer.getConnectionCount(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  // Send to specific user
  app.post('/api/send-to-user', (req, res) => {
    try {
      const { userId, event, payload } = req.body;
      wsServer.sendToUser(userId, event, payload);
      
      res.json({
        success: true,
        userId,
        sockets: wsServer.getUserSockets(userId).length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    });
  });

  // Send to specific tenant
  app.post('/api/send-to-tenant', (req, res) => {
    try {
      const { tenantId, event, payload } = req.body;
      wsServer.sendToTenant(tenantId, event, payload);
      
      res.json({
        success: true,
        tenantId,
        sockets: wsServer.getTenantSockets(tenantId).length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    });
  });

  // WebSocket metrics
  app.get('/api/metrics/websocket', (req, res) => {
    const metrics = wsServer.getMetrics();
    
    res.json({
      totalConnections: metrics.totalConnections,
      authenticatedConnections: metrics.authenticatedConnections,
      uniqueUsers: metrics.connectionsByUser.size,
      uniqueTenants: metrics.connectionsByTenant.size,
      messagesSent: metrics.messagesSent,
      messagesReceived: metrics.messagesReceived,
      errors: metrics.errors,
    });
  });
}

// ==================== Event Consumers ====================

async function setupEventConsumers(eventClient: any, notificationService: any) {
  // Consumer 1: Analytics Processor
  await eventClient.subscribe({
    id: 'analytics-processor',
    eventTypes: ['payment.completed', 'payment.failed'],
    handler: async (event: any) => {
      logger.debug('📊 Processing analytics for event', { type: event.type });
      // Update analytics database, send to data warehouse, etc.
    },
  });

  // Consumer 2: Fraud Detection
  await eventClient.subscribe({
    id: 'fraud-detection',
    eventTypes: ['payment.initiated', 'payment.completed'],
    handler: async (event: any) => {
      logger.debug('🔍 Checking fraud for event', { type: event.type });
      // Run fraud detection algorithms
    },
  });

  // Consumer 3: Audit Logger
  await eventClient.subscribe({
    id: 'audit-logger',
    eventTypes: [
      'payment.initiated',
      'payment.completed',
      'payment.failed',
      'refund.processed',
    ],
    handler: async (event: any) => {
      logger.debug('📝 Logging audit event', { type: event.type });
      // Write to audit log, compliance systems, etc.
    },
    options: {
      autoAck: true,
    },
  });

  logger.info('✅ Event consumers registered');
}

// ==================== Run ====================

main().catch((error) => {
  logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});
