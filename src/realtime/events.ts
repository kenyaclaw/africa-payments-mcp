/**
 * Event Streaming Infrastructure
 * Supports Kafka and RabbitMQ with unified interface
 */

import { ILogger, StructuredLogger } from '../utils/structured-logger.js';
import { PaymentEventData, PaymentEventType } from '../webhook/events.js';
import { Transaction } from '../types/index.js';

// ==================== Configuration Types ====================

export type EventBrokerType = 'kafka' | 'rabbitmq' | 'memory';

export interface EventStreamConfig {
  /** Event broker type */
  broker: EventBrokerType;
  /** Kafka-specific config */
  kafka?: KafkaConfig;
  /** RabbitMQ-specific config */
  rabbitmq?: RabbitMQConfig;
  /** General config */
  general?: GeneralEventConfig;
}

export interface KafkaConfig {
  /** Comma-separated list of brokers */
  brokers: string[];
  /** Client ID */
  clientId?: string;
  /** Consumer group ID */
  groupId?: string;
  /** SSL configuration */
  ssl?: boolean | object;
  /** SASL configuration */
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
  /** Number of partitions per topic */
  numPartitions?: number;
  /** Replication factor */
  replicationFactor?: number;
}

export interface RabbitMQConfig {
  /** Connection URL */
  url: string;
  /** Prefetch count */
  prefetchCount?: number;
  /** Heartbeat interval in seconds */
  heartbeat?: number;
  /** Reconnect timeout in ms */
  reconnectTimeout?: number;
  /** Maximum reconnect attempts */
  maxReconnectAttempts?: number;
}

export interface GeneralEventConfig {
  /** Default topic/queue name for payment events */
  paymentTopic?: string;
  /** Dead letter topic/queue */
  deadLetterTopic?: string;
  /** Retry topic/queue */
  retryTopic?: string;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Retry delay in ms */
  retryDelayMs?: number;
  /** Enable message compression */
  compression?: boolean;
  /** Message retention period in hours */
  retentionHours?: number;
}

// ==================== Event Types ====================

export interface StreamingEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: PaymentEventType;
  /** Event payload */
  payload: PaymentEventPayload;
  /** Event metadata */
  metadata: EventMetadata;
  /** Timestamp */
  timestamp: Date;
  /** Event version for schema evolution */
  version: string;
}

export interface PaymentEventPayload {
  /** Payment transaction */
  transaction: Transaction;
  /** Payment provider */
  provider: string;
  /** Raw provider payload */
  rawPayload: unknown;
  /** Previous status (for status change events) */
  previousStatus?: string;
  /** Event-specific data */
  data?: Record<string, unknown>;
}

export interface EventMetadata {
  /** Tenant ID */
  tenantId?: string;
  /** User ID */
  userId?: string;
  /** Correlation ID for request tracking */
  correlationId?: string;
  /** Source service */
  source: string;
  /** Source IP */
  ip?: string;
  /** User agent */
  userAgent?: string;
  /** Retry count */
  retryCount?: number;
  /** Original event ID (for retries) */
  originalEventId?: string;
}

export type EventHandler = (event: StreamingEvent) => Promise<void> | void;

export interface ConsumerGroup {
  /** Group ID */
  id: string;
  /** Event types to consume */
  eventTypes: PaymentEventType[];
  /** Handler function */
  handler: EventHandler;
  /** Consumer options */
  options?: ConsumerOptions;
}

export interface ConsumerOptions {
  /** Auto-acknowledge messages */
  autoAck?: boolean;
  /** Batch size for processing */
  batchSize?: number;
  /** Processing timeout in ms */
  timeoutMs?: number;
  /** Enable dead letter queue */
  deadLetterEnabled?: boolean;
  /** Filter by tenant ID */
  tenantFilter?: string[];
  /** Filter by provider */
  providerFilter?: string[];
}

// ==================== Event Streaming Interface ====================

export interface IEventStreamingClient {
  /** Connect to the broker */
  connect(): Promise<void>;
  /** Disconnect from the broker */
  disconnect(): Promise<void>;
  /** Publish an event */
  publish(event: StreamingEvent): Promise<void>;
  /** Subscribe to events */
  subscribe(group: ConsumerGroup): Promise<void>;
  /** Unsubscribe from events */
  unsubscribe(groupId: string): Promise<void>;
  /** Create topic/queue if it doesn't exist */
  createTopic(name: string, partitions?: number): Promise<void>;
  /** Check connection health */
  healthCheck(): Promise<boolean>;
  /** Get consumer lag (if supported) */
  getConsumerLag?(groupId: string): Promise<Record<string, number>>;
}

// ==================== In-Memory Implementation (for development/testing) ====================

export class InMemoryEventClient implements IEventStreamingClient {
  private logger: ILogger;
  private connected = false;
  private topics: Map<string, StreamingEvent[]> = new Map();
  private consumers: Map<string, ConsumerGroup> = new Map();
  private consumerIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(logger?: ILogger) {
    this.logger = logger || new StructuredLogger();
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.logger.info('🔗 In-memory event client connected');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    // Clear all consumer intervals
    this.consumerIntervals.forEach(interval => clearInterval(interval));
    this.consumerIntervals.clear();
    this.logger.info('🔌 In-memory event client disconnected');
  }

  async publish(event: StreamingEvent): Promise<void> {
    if (!this.connected) {
      throw new Error('Client not connected');
    }

    const topic = this.getTopicForEvent(event.type);
    const events = this.topics.get(topic) || [];
    events.push(event);
    this.topics.set(topic, events);

    this.logger.debug('📤 Published event to memory', { eventId: event.id, type: event.type });
  }

  async subscribe(group: ConsumerGroup): Promise<void> {
    if (!this.connected) {
      throw new Error('Client not connected');
    }

    this.consumers.set(group.id, group);

    // Simulate polling
    const interval = setInterval(async () => {
      for (const eventType of group.eventTypes) {
        const topic = this.getTopicForEvent(eventType);
        const events = this.topics.get(topic) || [];
        
        if (events.length > 0) {
          // Process events
          const batch = events.splice(0, group.options?.batchSize || 1);
          
          for (const event of batch) {
            try {
              await group.handler(event);
            } catch (error) {
              this.logger.error('Error handling event', { 
                error: (error as Error).message,
                eventId: event.id 
              });
            }
          }
        }
      }
    }, 1000);

    this.consumerIntervals.set(group.id, interval);
    this.logger.info('📥 Subscribed to events', { groupId: group.id, eventTypes: group.eventTypes });
  }

  async unsubscribe(groupId: string): Promise<void> {
    const interval = this.consumerIntervals.get(groupId);
    if (interval) {
      clearInterval(interval);
      this.consumerIntervals.delete(groupId);
    }
    this.consumers.delete(groupId);
    this.logger.info('📤 Unsubscribed from events', { groupId: groupId });
  }

  async createTopic(name: string): Promise<void> {
    if (!this.topics.has(name)) {
      this.topics.set(name, []);
      this.logger.debug('📋 Created topic', { name });
    }
  }

  async healthCheck(): Promise<boolean> {
    return this.connected;
  }

  private getTopicForEvent(eventType: string): string {
    return `payment.events.${eventType}`;
  }
}

// ==================== Kafka Implementation ====================

interface KafkaModule {
  Kafka: new (config: unknown) => KafkaClient;
  Partitioners: { DefaultPartitioner: unknown };
  logLevel: {
    ERROR: number;
    WARN: number;
    INFO: number;
    DEBUG: number;
  };
}

interface KafkaClient {
  producer(config?: unknown): KafkaProducer;
  consumer(config: unknown): KafkaConsumer;
  admin(): KafkaAdmin;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

interface KafkaProducer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(config: { topic: string; messages: { key?: string; value: string; headers?: Record<string, string> }[] }): Promise<void>;
}

interface KafkaConsumer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(config: { topics: string[]; fromBeginning?: boolean }): Promise<void>;
  run(config: { eachMessage: (payload: { topic: string; partition: number; message: { key: Buffer | null; value: Buffer | null; headers?: Record<string, Buffer>; offset: string } }) => Promise<void> }): Promise<void>;
  pause(topics: { topic: string }[]): void;
  resume(topics: { topic: string }[]): void;
}

interface KafkaAdmin {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  createTopics(config: { topics: { topic: string; numPartitions?: number; replicationFactor?: number }[]; waitForLeaders?: boolean }): Promise<void>;
  listTopics(): Promise<string[]>;
  fetchOffsets(config: { groupId: string; topics: string[] }): Promise<Array<{ topic: string; partitions: Array<{ partition: number; offset: string }> }>>;
}

class KafkaEventClient implements IEventStreamingClient {
  private kafka: KafkaClient;
  private producer: KafkaProducer | null = null;
  private consumers: Map<string, KafkaConsumer> = new Map();
  private admin: KafkaAdmin | null = null;
  private config: KafkaConfig;
  private generalConfig: GeneralEventConfig;
  private logger: ILogger;
  private connected = false;

  constructor(config: KafkaConfig, generalConfig: GeneralEventConfig, logger?: ILogger) {
    this.config = config;
    this.generalConfig = generalConfig;
    this.logger = logger || new StructuredLogger();
  }

  async connect(): Promise<void> {
    try {
      const { Kafka } = await import('kafkajs');
      
      this.kafka = new Kafka({
        clientId: this.config.clientId || 'africa-payments-mcp',
        brokers: this.config.brokers,
        ssl: this.config.ssl,
        sasl: this.config.sasl,
        logLevel: (await import('kafkajs')).logLevel.WARN,
      });

      this.producer = this.kafka.producer({
        createPartitioner: (await import('kafkajs')).Partitioners.DefaultPartitioner,
      });

      await this.producer.connect();
      
      this.admin = this.kafka.admin();
      await this.admin.connect();

      // Create default topics
      await this.createDefaultTopics();

      this.connected = true;
      this.logger.info('🔗 Kafka client connected', { brokers: this.config.brokers });
    } catch (error) {
      this.logger.error('Failed to connect to Kafka', { error: String((error as Error).message) });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.producer) {
        await this.producer.disconnect();
      }
      
      for (const [, consumer] of this.consumers) {
        await consumer.disconnect();
      }
      this.consumers.clear();

      if (this.admin) {
        await this.admin.disconnect();
      }

      this.connected = false;
      this.logger.info('🔌 Kafka client disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting from Kafka', { error: String((error as Error).message) });
      throw error;
    }
  }

  async publish(event: StreamingEvent): Promise<void> {
    if (!this.producer || !this.connected) {
      throw new Error('Kafka producer not connected');
    }

    const topic = this.getTopicForEvent(event.type);
    const message = {
      key: event.payload.transaction.id,
      value: JSON.stringify(event),
      headers: {
        'event-type': event.type,
        'event-version': event.version,
        'correlation-id': event.metadata.correlationId || '',
        'tenant-id': event.metadata.tenantId || '',
      },
    };

    await this.producer.send({
      topic,
      messages: [message],
    });

    this.logger.debug('📤 Published event to Kafka', { eventId: event.id, topic });
  }

  async subscribe(group: ConsumerGroup): Promise<void> {
    if (!this.kafka || !this.connected) {
      throw new Error('Kafka client not connected');
    }

    const consumer = this.kafka.consumer({
      groupId: group.id,
    });

    await consumer.connect();

    const topics = group.eventTypes.map(type => this.getTopicForEvent(type));
    await consumer.subscribe({ topics, fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          if (!message.value) return;

          const event: StreamingEvent = JSON.parse(message.value.toString());
          
          // Apply filters
          if (this.shouldFilterEvent(event, group.options)) {
            return;
          }

          await group.handler(event);
        } catch (error) {
          this.logger.error('Error processing Kafka message', {
            error: (error as Error).message,
            topic,
            offset: message.offset,
          });

          // Check retry count
          const retryCount = parseInt(message.headers?.['retry-count']?.toString() || '0', 10);
          if (retryCount < (this.generalConfig.maxRetries || 3)) {
            // Send to retry topic
            await this.sendToRetryTopic(message, retryCount + 1);
          } else {
            // Send to dead letter topic
            await this.sendToDeadLetterTopic(message, error as Error);
          }
        }
      },
    });

    this.consumers.set(group.id, consumer);
    this.logger.info('📥 Subscribed to Kafka topics', { groupId: group.id, topics });
  }

  async unsubscribe(groupId: string): Promise<void> {
    const consumer = this.consumers.get(groupId);
    if (consumer) {
      await consumer.disconnect();
      this.consumers.delete(groupId);
      this.logger.info('📤 Unsubscribed from Kafka', { groupId });
    }
  }

  async createTopic(name: string, partitions?: number): Promise<void> {
    if (!this.admin) {
      throw new Error('Kafka admin not connected');
    }

    const existingTopics = await this.admin.listTopics();
    if (existingTopics.includes(name)) {
      return;
    }

    await this.admin.createTopics({
      topics: [{
        topic: name,
        numPartitions: partitions || this.config.numPartitions || 3,
        replicationFactor: this.config.replicationFactor || 1,
      }],
      waitForLeaders: true,
    });

    this.logger.info('📋 Created Kafka topic', { name, partitions });
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.admin) return false;
      await this.admin.listTopics();
      return true;
    } catch {
      return false;
    }
  }

  async getConsumerLag(groupId: string): Promise<Record<string, number>> {
    if (!this.admin) {
      throw new Error('Kafka admin not connected');
    }

    const topics = await this.admin.listTopics();
    const offsets = await this.admin.fetchOffsets({ groupId, topics });
    
    const lag: Record<string, number> = {};
    for (const topicOffset of offsets) {
      const totalLag = topicOffset.partitions.reduce((sum, p) => {
        return sum + (parseInt(p.offset) || 0);
      }, 0);
      lag[topicOffset.topic] = totalLag;
    }

    return lag;
  }

  private async createDefaultTopics(): Promise<void> {
    const eventTypes: string[] = [
      'payment.initiated' as PaymentEventType,
      'payment.completed' as PaymentEventType,
      'payment.failed',
      'refund.processed',
      'payment.success',
      'payment.pending',
      'payment.processing',
      'payment.cancelled',
      'payment.refunded',
      'payment.disputed',
      'transfer.success',
      'transfer.failed',
      'transfer.reversed',
    ];

    for (const eventType of eventTypes) {
      await this.createTopic(this.getTopicForEvent(eventType));
    }

    // Create dead letter and retry topics
    if (this.generalConfig.deadLetterTopic) {
      await this.createTopic(this.generalConfig.deadLetterTopic);
    }
    if (this.generalConfig.retryTopic) {
      await this.createTopic(this.generalConfig.retryTopic);
    }
  }

  private getTopicForEvent(eventType: string): string {
    return `payment.events.${eventType}`;
  }

  private shouldFilterEvent(event: StreamingEvent, options?: ConsumerOptions): boolean {
    if (!options) return false;

    if (options.tenantFilter?.length && event.metadata.tenantId) {
      if (!options.tenantFilter.includes(event.metadata.tenantId)) {
        return true;
      }
    }

    if (options.providerFilter?.length) {
      if (!options.providerFilter.includes(event.payload.provider)) {
        return true;
      }
    }

    return false;
  }

  private async sendToRetryTopic(message: { value: Buffer | null; headers?: Record<string, Buffer> }, retryCount: number): Promise<void> {
    if (!this.producer || !this.generalConfig.retryTopic) return;

    await this.producer.send({
      topic: this.generalConfig.retryTopic,
      messages: [{
        value: message.value?.toString() || '',
        headers: {
          ...message.headers,
          'retry-count': Buffer.from(String(retryCount)),
        },
      }],
    });
  }

  private async sendToDeadLetterTopic(message: { value: Buffer | null; headers?: Record<string, Buffer> }, error: Error): Promise<void> {
    if (!this.producer || !this.generalConfig.deadLetterTopic) return;

    await this.producer.send({
      topic: this.generalConfig.deadLetterTopic,
      messages: [{
        value: message.value?.toString() || '',
        headers: {
          ...message.headers,
          'error-message': Buffer.from(error.message),
          'error-timestamp': Buffer.from(new Date().toISOString()),
        },
      }],
    });
  }
}

// ==================== RabbitMQ Implementation ====================

interface AmqpModule {
  connect(url: string, options?: object): Promise<AmqpConnection>;
}

interface AmqpConnection {
  createChannel(): Promise<AmqpChannel>;
  close(): Promise<void>;
}

interface AmqpChannel {
  assertExchange(exchange: string, type: string, options?: object): Promise<void>;
  assertQueue(queue: string, options?: object): Promise<{ queue: string }>;
  bindQueue(queue: string, exchange: string, pattern: string): Promise<void>;
  prefetch(count: number): Promise<void>;
  consume(queue: string, handler: (msg: AmqpMessage | null) => void, options?: object): Promise<{ consumerTag: string }>;
  publish(exchange: string, routingKey: string, content: Buffer, options?: object): boolean;
  sendToQueue(queue: string, content: Buffer, options?: object): boolean;
  ack(message: AmqpMessage): void;
  nack(message: AmqpMessage, allUpTo?: boolean, requeue?: boolean): void;
  close(): Promise<void>;
}

interface AmqpMessage {
  content: Buffer;
  fields: {
    routingKey: string;
    exchange: string;
    redelivered: boolean;
  };
  properties: {
    messageId?: string;
    correlationId?: string;
    headers?: Record<string, unknown>;
    timestamp?: number;
  };
}

class RabbitMQEventClient implements IEventStreamingClient {
  private connection: AmqpConnection | null = null;
  private channel: AmqpChannel | null = null;
  private config: RabbitMQConfig;
  private generalConfig: GeneralEventConfig;
  private logger: ILogger;
  private connected = false;
  private consumers: Map<string, string> = new Map(); // groupId -> consumerTag
  private reconnectAttempts = 0;

  constructor(config: RabbitMQConfig, generalConfig: GeneralEventConfig, logger?: ILogger) {
    this.config = config;
    this.generalConfig = generalConfig;
    this.logger = logger || new StructuredLogger();
  }

  async connect(): Promise<void> {
    try {
      const amqp = await import('amqplib');
      
      this.connection = await amqp.connect(this.config.url, {
        heartbeat: this.config.heartbeat || 60,
      });

      this.channel = await this.connection.createChannel();
      
      if (this.config.prefetchCount) {
        await this.channel.prefetch(this.config.prefetchCount);
      }

      // Setup exchanges
      await this.setupExchanges();

      this.connected = true;
      this.reconnectAttempts = 0;
      
      // Handle connection events
      this.connection.on?.('error', (err: Error) => {
        this.logger.error('RabbitMQ connection error', { error: err.message });
        this.handleReconnect();
      });

      this.connection.on?.('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.handleReconnect();
      });

      this.logger.info('🔗 RabbitMQ client connected');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ', { error: (error as Error).message });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.connected = false;
      this.logger.info('🔌 RabbitMQ client disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting from RabbitMQ', { error: (error as Error).message });
      throw error;
    }
  }

  async publish(event: StreamingEvent): Promise<void> {
    if (!this.channel || !this.connected) {
      throw new Error('RabbitMQ channel not connected');
    }

    const exchange = 'payment.events';
    const routingKey = event.type;
    const content = Buffer.from(JSON.stringify(event));

    const published = this.channel.publish(exchange, routingKey, content, {
      messageId: event.id,
      correlationId: event.metadata.correlationId,
      timestamp: event.timestamp.getTime(),
      headers: {
        'event-type': event.type,
        'event-version': event.version,
        'tenant-id': event.metadata.tenantId || '',
      },
      persistent: true,
    });

    if (!published) {
      throw new Error('Failed to publish message to RabbitMQ');
    }

    this.logger.debug('📤 Published event to RabbitMQ', { eventId: event.id, routingKey });
  }

  async subscribe(group: ConsumerGroup): Promise<void> {
    if (!this.channel || !this.connected) {
      throw new Error('RabbitMQ channel not connected');
    }

    const queueName = `consumer.${group.id}`;
    
    // Create queue
    await this.channel.assertQueue(queueName, {
      durable: true,
      deadLetterExchange: this.generalConfig.deadLetterTopic || '',
    });

    // Bind queue to exchange for each event type
    for (const eventType of group.eventTypes) {
      await this.channel.bindQueue(queueName, 'payment.events', eventType);
    }

    // Consume messages
    const { consumerTag } = await this.channel.consume(queueName, async (msg) => {
      if (!msg) return;

      try {
        const event: StreamingEvent = JSON.parse(msg.content.toString());

        // Apply filters
        if (this.shouldFilterEvent(event, group.options)) {
          this.channel!.ack(msg);
          return;
        }

        await group.handler(event);

        if (group.options?.autoAck !== false) {
          this.channel!.ack(msg);
        }
      } catch (error) {
        this.logger.error('Error processing RabbitMQ message', {
          error: (error as Error).message,
          messageId: msg.properties.messageId,
        });

        const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;
        
        if (retryCount < (this.generalConfig.maxRetries || 3)) {
          // Requeue with incremented retry count
          this.channel!.nack(msg, false, false);
          await this.sendToRetryQueue(msg, retryCount + 1);
        } else {
          // Send to dead letter
          this.channel!.nack(msg, false, false);
        }
      }
    });

    this.consumers.set(group.id, consumerTag);
    this.logger.info('📥 Subscribed to RabbitMQ events', { groupId: group.id, queue: queueName });
  }

  async unsubscribe(groupId: string): Promise<void> {
    const consumerTag = this.consumers.get(groupId);
    if (consumerTag && this.channel) {
      await this.channel.cancel(consumerTag);
      this.consumers.delete(groupId);
      this.logger.info('📤 Unsubscribed from RabbitMQ', { groupId });
    }
  }

  async createTopic(name: string): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not connected');
    }

    // In RabbitMQ, we create an exchange
    await this.channel.assertExchange(name, 'topic', {
      durable: true,
    });

    this.logger.info('📋 Created RabbitMQ exchange', { name });
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.connection) return false;
      // RabbitMQ doesn't have a direct health check, so we check if channel is open
      return this.connected && this.channel !== null;
    } catch {
      return false;
    }
  }

  private async setupExchanges(): Promise<void> {
    if (!this.channel) return;

    // Main exchange
    await this.channel.assertExchange('payment.events', 'topic', {
      durable: true,
    });

    // Retry exchange
    if (this.generalConfig.retryTopic) {
      await this.channel.assertExchange(this.generalConfig.retryTopic, 'topic', {
        durable: true,
      });
    }

    // Dead letter exchange
    if (this.generalConfig.deadLetterTopic) {
      await this.channel.assertExchange(this.generalConfig.deadLetterTopic, 'topic', {
        durable: true,
      });
    }
  }

  private shouldFilterEvent(event: StreamingEvent, options?: ConsumerOptions): boolean {
    if (!options) return false;

    if (options.tenantFilter?.length && event.metadata.tenantId) {
      if (!options.tenantFilter.includes(event.metadata.tenantId)) {
        return true;
      }
    }

    if (options.providerFilter?.length) {
      if (!options.providerFilter.includes(event.payload.provider)) {
        return true;
      }
    }

    return false;
  }

  private async sendToRetryQueue(msg: AmqpMessage, retryCount: number): Promise<void> {
    if (!this.channel || !this.generalConfig.retryTopic) return;

    // Delay before retry (exponential backoff)
    const delay = (this.generalConfig.retryDelayMs || 5000) * Math.pow(2, retryCount - 1);
    
    setTimeout(async () => {
      this.channel!.publish(this.generalConfig.retryTopic!, msg.fields.routingKey, msg.content, {
        ...msg.properties,
        headers: {
          ...msg.properties.headers,
          'x-retry-count': retryCount,
        },
      });
    }, delay);
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 5)) {
      this.logger.error('Max RabbitMQ reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    this.connected = false;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.logger.info(`Attempting to reconnect to RabbitMQ in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(async () => {
      try {
        await this.connect();
        // Re-subscribe all consumers
        // This would need to store consumer groups and re-subscribe them
      } catch (error) {
        this.logger.error('Reconnection failed', { error: (error as Error).message });
      }
    }, delay);
  }
}

// ==================== Event Streaming Factory ====================

export class EventStreamingFactory {
  static createClient(
    config: EventStreamConfig,
    logger?: ILogger
  ): IEventStreamingClient {
    const generalConfig: GeneralEventConfig = {
      paymentTopic: 'payment.events',
      deadLetterTopic: 'payment.events.dlq',
      retryTopic: 'payment.events.retry',
      maxRetries: 3,
      retryDelayMs: 5000,
      compression: true,
      retentionHours: 168, // 7 days
      ...config.general,
    };

    switch (config.broker) {
      case 'kafka':
        if (!config.kafka) {
          throw new Error('Kafka configuration required when using Kafka broker');
        }
        return new KafkaEventClient(config.kafka, generalConfig, logger);

      case 'rabbitmq':
        if (!config.rabbitmq) {
          throw new Error('RabbitMQ configuration required when using RabbitMQ broker');
        }
        return new RabbitMQEventClient(config.rabbitmq, generalConfig, logger);

      case 'memory':
      default:
        return new InMemoryEventClient(logger);
    }
  }
}

// ==================== Event Builder ====================

export class StreamingEventBuilder {
  private event: Partial<StreamingEvent> = {
    version: '1.0',
    timestamp: new Date(),
    metadata: {
      source: 'africa-payments-mcp',
    },
  };

  static create(): StreamingEventBuilder {
    return new StreamingEventBuilder();
  }

  withId(id: string): this {
    this.event.id = id;
    return this;
  }

  withType(type: PaymentEventType): this {
    this.event.type = type;
    return this;
  }

  withPayload(payload: PaymentEventPayload): this {
    this.event.payload = payload;
    return this;
  }

  withMetadata(metadata: Partial<EventMetadata>): this {
    this.event.metadata = { ...this.event.metadata, ...metadata };
    return this;
  }

  withVersion(version: string): this {
    this.event.version = version;
    return this;
  }

  fromPaymentEventData(data: PaymentEventData): this {
    this.event.id = `${data.provider}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    this.event.type = data.eventType;
    this.event.payload = {
      transaction: data.transaction!,
      provider: data.provider,
      rawPayload: data.rawPayload,
    };
    this.event.metadata = {
      source: 'webhook',
      correlationId: data.metadata?.correlationId as string,
      tenantId: data.metadata?.tenantId as string,
      userId: data.metadata?.userId as string,
    };
    return this;
  }

  build(): StreamingEvent {
    if (!this.event.id || !this.event.type || !this.event.payload) {
      throw new Error('Event ID, type, and payload are required');
    }

    return this.event as StreamingEvent;
  }
}

// ==================== Singleton Instance ====================

let globalEventClient: IEventStreamingClient | null = null;

export async function initializeEventStreaming(
  config: EventStreamConfig,
  logger?: ILogger
): Promise<IEventStreamingClient> {
  globalEventClient = EventStreamingFactory.createClient(config, logger);
  await globalEventClient.connect();
  return globalEventClient;
}

export function getEventStreamingClient(): IEventStreamingClient | null {
  return globalEventClient;
}

export function setEventStreamingClient(client: IEventStreamingClient): void {
  globalEventClient = client;
}
