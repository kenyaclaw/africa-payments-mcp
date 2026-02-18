# Real-time Event Streaming for Africa Payments MCP

Production-ready real-time event streaming infrastructure with WebSocket support, event streaming (Kafka/RabbitMQ), and multi-channel notifications.

## Features

### 🚀 WebSocket Server (`websocket.ts`)
- **Socket.io** implementation with room-based broadcasting
- JWT authentication middleware
- Per-user and per-tenant rooms
- Rate limiting (configurable per minute)
- Max connections per user
- Connection metrics and health checks
- Auto-reconnection support

### 📡 Event Streaming (`events.ts`)
- **Pluggable brokers**: Kafka, RabbitMQ, or in-memory (for dev)
- **Consumer groups** with load balancing
- **Event filtering** by tenant and provider
- **Dead letter queues** for failed events
- **Retry mechanism** with exponential backoff
- **Event schema versioning** for backward compatibility

### 📧 Notifications (`notifications.ts`)
- **Push notifications** via Firebase Cloud Messaging (FCM)
- **Alternative push** via OneSignal
- **Email** via SendGrid with HTML templates
- **SMS** via Twilio or Africa's Talking (optimized for Africa)
- **Smart channel selection** based on user preferences
- **High-priority SMS** for critical events

### 📊 Real-time Dashboard (`tools/realtime-dashboard.html`)
- Live transaction feed with filtering
- Success/failure rate charts
- Provider distribution pie chart
- Volume trends
- Connection status indicator
- Export to CSV

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file:

```env
# WebSocket
JWT_SECRET=your-secret-key

# Event Streaming (choose one)
EVENT_BROKER=memory  # For development
# EVENT_BROKER=kafka
# KAFKA_BROKERS=localhost:9092
# EVENT_BROKER=rabbitmq
# RABBITMQ_URL=amqp://localhost:5672

# Notifications (optional)
FCM_PROJECT_ID=your-fcm-project
FCM_SERVICE_ACCOUNT={...}

SENDGRID_API_KEY=SG.xxx
TWILIO_ACCOUNT_SID=AC.xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_FROM_NUMBER=+1234567890

AT_USERNAME=your-at-username
AT_API_KEY=your-at-api-key
```

### 3. Basic Usage

```typescript
import { createServer } from 'http';
import {
  PaymentWebSocketServer,
  initializeEventStreaming,
  initializeNotifications,
  NotificationBuilder,
} from './realtime/index.js';

const httpServer = createServer();

// Initialize WebSocket
const wsServer = new PaymentWebSocketServer(httpServer, {
  jwtSecret: process.env.JWT_SECRET!,
});

// Initialize Event Streaming
const eventClient = await initializeEventStreaming({
  broker: 'kafka',
  kafka: { brokers: ['localhost:9092'] },
});

// Initialize Notifications
const notificationService = await initializeNotifications({
  fcm: { projectId: '...', serviceAccount: {} },
  sendgrid: { apiKey: '...', fromEmail: '...' },
});

httpServer.listen(3000);
```

## WebSocket API

### Connection

```javascript
const socket = io('ws://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});

socket.on('connect', () => {
  console.log('Connected');
});
```

### Subscribe to Events

```javascript
socket.emit('subscribe', {
  eventTypes: ['payment.completed', 'payment.failed'],
  filters: {
    providers: ['mpesa', 'paystack'],
    currencies: ['KES', 'NGN'],
  }
});

socket.on('payment.completed', (data) => {
  console.log('Payment completed:', data);
});
```

### Join Tenant Room

```javascript
socket.emit('join-tenant', 'tenant-123', (response) => {
  if (response.success) {
    console.log('Joined tenant room');
  }
});
```

## Event Types

| Event Type | Description | Priority |
|------------|-------------|----------|
| `payment.initiated` | Payment started | Normal |
| `payment.completed` | Payment successful | High |
| `payment.failed` | Payment failed | High |
| `payment.pending` | Payment pending | Normal |
| `payment.processing` | Payment processing | Normal |
| `payment.refunded` | Payment refunded | Normal |
| `refund.processed` | Refund completed | Normal |
| `transfer.success` | Transfer successful | High |
| `transfer.failed` | Transfer failed | High |

## Notification Channels

### Push (FCM)

```typescript
const notification = NotificationBuilder.create('notif-123')
  .withTitle('Payment Successful')
  .withBody('Your payment of 1000 KES was successful.')
  .withType('payment.completed')
  .withPriority('high')
  .build();

await notificationService.send({
  userId: 'user-123',
  fcmTokens: ['device-token-abc'],
}, notification);
```

### Email

```typescript
await notificationService.send({
  userId: 'user-123',
  email: 'user@example.com',
}, notification);
```

### SMS

```typescript
await notificationService.send({
  userId: 'user-123',
  phoneNumber: '+254712345678',
}, notification, ['sms']);
```

## Consumer Groups

```typescript
await eventClient.subscribe({
  id: 'analytics-processor',
  eventTypes: ['payment.completed'],
  handler: async (event) => {
    // Process event
    await updateAnalytics(event);
  },
  options: {
    tenantFilter: ['tenant-123'],
    batchSize: 100,
  },
});
```

## Dashboard

Open `tools/realtime-dashboard.html` in a browser or serve it via your web server:

```bash
# Using Python
python3 -m http.server 8080

# Using Node.js
npx serve .
```

Then navigate to `http://localhost:8080/tools/realtime-dashboard.html`

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   WebSocket     │────▶│  Event Stream   │────▶│  Consumers      │
│   (Socket.io)   │     │  (Kafka/Rabbit) │     │  - Analytics    │
└─────────────────┘     └─────────────────┘     │  - Fraud Check  │
         │                                      │  - Audit Log    │
         │                                      └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Notifications  │
│  - Push (FCM)   │
│  - Email        │
│  - SMS          │
└─────────────────┘
```

## Production Checklist

- [ ] Set up Kafka or RabbitMQ cluster
- [ ] Configure FCM credentials
- [ ] Set up SendGrid for email
- [ ] Configure Twilio or Africa's Talking for SMS
- [ ] Enable SSL/TLS for WebSocket
- [ ] Set up Redis for Socket.io adapter (multi-server)
- [ ] Configure monitoring and alerts
- [ ] Set up dead letter queue monitoring
- [ ] Implement circuit breakers for external services

## Testing

```bash
# Run all tests
npm test

# Run WebSocket tests only
npm test -- tests/realtime/websocket.test.ts

# Run Event tests only
npm test -- tests/realtime/events.test.ts

# Run Notification tests only
npm test -- tests/realtime/notifications.test.ts
```

## License

MIT
