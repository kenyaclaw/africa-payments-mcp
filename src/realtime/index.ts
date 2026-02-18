/**
 * Real-time Event Streaming Module
 * Exports all real-time functionality
 */

// WebSocket Server
export {
  PaymentWebSocketServer,
  initializeWebSocketServer,
  getWebSocketServer,
  setWebSocketServer,
  type WebSocketConfig,
  type AuthenticatedSocket,
  type WebSocketEvent,
  type SubscriptionRequest,
} from './websocket.js';

// Event Streaming
export {
  EventStreamingFactory,
  StreamingEventBuilder,
  InMemoryEventClient,
  initializeEventStreaming,
  getEventStreamingClient,
  setEventStreamingClient,
  type EventBrokerType,
  type EventStreamConfig,
  type KafkaConfig,
  type RabbitMQConfig,
  type GeneralEventConfig,
  type StreamingEvent,
  type PaymentEventPayload,
  type EventMetadata,
  type EventHandler,
  type ConsumerGroup,
  type ConsumerOptions,
  type IEventStreamingClient,
} from './events.js';

// Notifications
export {
  NotificationService,
  NotificationBuilder,
  initializeNotifications,
  getNotificationService,
  setNotificationService,
  type NotificationsConfig,
  type FCMConfig,
  type OneSignalConfig,
  type SendGridConfig,
  type TwilioConfig,
  type AfricasTalkingConfig,
  type GeneralNotificationConfig,
  type NotificationChannel,
  type NotificationPriority,
  type NotificationRecipient,
  type NotificationPayload,
  type NotificationAction,
  type NotificationResult,
  type NotificationTemplate,
  type INotificationService,
} from './notifications.js';
