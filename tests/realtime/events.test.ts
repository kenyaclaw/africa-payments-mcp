/**
 * Event Streaming Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  InMemoryEventClient,
  EventStreamingFactory,
  StreamingEventBuilder,
  type EventStreamConfig,
  type StreamingEvent,
  type ConsumerGroup,
} from '../../src/realtime/events.js';
import { StructuredLogger } from '../../src/utils/structured-logger.js';

describe('Event Streaming', () => {
  describe('InMemoryEventClient', () => {
    let client: InMemoryEventClient;

    beforeEach(() => {
      client = new InMemoryEventClient(new StructuredLogger());
    });

    afterEach(async () => {
      await client.disconnect();
    });

    describe('Connection', () => {
      it('should connect successfully', async () => {
        await client.connect();
        const isHealthy = await client.healthCheck();
        expect(isHealthy).toBe(true);
      });

      it('should disconnect successfully', async () => {
        await client.connect();
        await client.disconnect();
        const isHealthy = await client.healthCheck();
        expect(isHealthy).toBe(false);
      });
    });

    describe('Publishing', () => {
      it('should publish events', async () => {
        await client.connect();

        const event: StreamingEvent = {
          id: 'evt-123',
          type: 'payment.completed',
          payload: {
            transaction: {
              id: 'tx-123',
              providerTransactionId: 'prov-tx-123',
              provider: 'mpesa',
              status: 'completed',
              amount: { amount: 1000, currency: 'KES' },
              customer: { id: 'cust-123' },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            provider: 'mpesa',
            rawPayload: {},
          },
          metadata: {
            source: 'test',
            tenantId: 'tenant-123',
          },
          timestamp: new Date(),
          version: '1.0',
        };

        await client.publish(event);
        // No error means success for in-memory
      });

      it('should throw error when publishing while disconnected', async () => {
        const event: StreamingEvent = {
          id: 'evt-123',
          type: 'payment.completed',
          payload: {
            transaction: {
              id: 'tx-123',
              providerTransactionId: 'prov-tx-123',
              provider: 'mpesa',
              status: 'completed',
              amount: { amount: 1000, currency: 'KES' },
              customer: { id: 'cust-123' },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            provider: 'mpesa',
            rawPayload: {},
          },
          metadata: { source: 'test' },
          timestamp: new Date(),
          version: '1.0',
        };

        await expect(client.publish(event)).rejects.toThrow('Client not connected');
      });
    });

    describe('Subscribing', () => {
      it('should subscribe to events and receive them', async () => {
        await client.connect();

        const receivedEvents: StreamingEvent[] = [];

        const consumerGroup: ConsumerGroup = {
          id: 'test-consumer',
          eventTypes: ['payment.completed'],
          handler: async (event) => {
            receivedEvents.push(event);
          },
        };

        await client.subscribe(consumerGroup);

        const event: StreamingEvent = {
          id: 'evt-123',
          type: 'payment.completed',
          payload: {
            transaction: {
              id: 'tx-123',
              providerTransactionId: 'prov-tx-123',
              provider: 'mpesa',
              status: 'completed',
              amount: { amount: 1000, currency: 'KES' },
              customer: { id: 'cust-123' },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            provider: 'mpesa',
            rawPayload: {},
          },
          metadata: { source: 'test' },
          timestamp: new Date(),
          version: '1.0',
        };

        await client.publish(event);

        // Wait for processing
        await new Promise((resolve) => setTimeout(resolve, 1500));

        expect(receivedEvents.length).toBeGreaterThan(0);
        expect(receivedEvents[0].id).toBe('evt-123');
      });

      it('should unsubscribe from events', async () => {
        await client.connect();

        const consumerGroup: ConsumerGroup = {
          id: 'test-consumer',
          eventTypes: ['payment.completed'],
          handler: async () => {},
        };

        await client.subscribe(consumerGroup);
        await client.unsubscribe('test-consumer');
        // No error means success
      });

      it('should filter events by tenant', async () => {
        await client.connect();

        const receivedEvents: StreamingEvent[] = [];

        const consumerGroup: ConsumerGroup = {
          id: 'test-consumer',
          eventTypes: ['payment.completed'],
          handler: async (event) => {
            receivedEvents.push(event);
          },
          options: {
            tenantFilter: ['tenant-123'],
          },
        };

        await client.subscribe(consumerGroup);

        // Publish event for allowed tenant
        const allowedEvent: StreamingEvent = {
          id: 'evt-1',
          type: 'payment.completed',
          payload: {
            transaction: {
              id: 'tx-1',
              providerTransactionId: 'prov-tx-1',
              provider: 'mpesa',
              status: 'completed',
              amount: { amount: 1000, currency: 'KES' },
              customer: { id: 'cust-123' },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            provider: 'mpesa',
            rawPayload: {},
          },
          metadata: { source: 'test', tenantId: 'tenant-123' },
          timestamp: new Date(),
          version: '1.0',
        };

        // Publish event for different tenant
        const blockedEvent: StreamingEvent = {
          id: 'evt-2',
          type: 'payment.completed',
          payload: {
            transaction: {
              id: 'tx-2',
              providerTransactionId: 'prov-tx-2',
              provider: 'mpesa',
              status: 'completed',
              amount: { amount: 1000, currency: 'KES' },
              customer: { id: 'cust-123' },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            provider: 'mpesa',
            rawPayload: {},
          },
          metadata: { source: 'test', tenantId: 'tenant-456' },
          timestamp: new Date(),
          version: '1.0',
        };

        await client.publish(allowedEvent);
        await client.publish(blockedEvent);

        // Wait for processing
        await new Promise((resolve) => setTimeout(resolve, 1500));

        expect(receivedEvents.length).toBe(1);
        expect(receivedEvents[0].id).toBe('evt-1');
      });

      it('should filter events by provider', async () => {
        await client.connect();

        const receivedEvents: StreamingEvent[] = [];

        const consumerGroup: ConsumerGroup = {
          id: 'test-consumer',
          eventTypes: ['payment.completed'],
          handler: async (event) => {
            receivedEvents.push(event);
          },
          options: {
            providerFilter: ['mpesa'],
          },
        };

        await client.subscribe(consumerGroup);

        // Publish event from allowed provider
        const allowedEvent: StreamingEvent = {
          id: 'evt-1',
          type: 'payment.completed',
          payload: {
            transaction: {
              id: 'tx-1',
              providerTransactionId: 'prov-tx-1',
              provider: 'mpesa',
              status: 'completed',
              amount: { amount: 1000, currency: 'KES' },
              customer: { id: 'cust-123' },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            provider: 'mpesa',
            rawPayload: {},
          },
          metadata: { source: 'test' },
          timestamp: new Date(),
          version: '1.0',
        };

        // Publish event from different provider
        const blockedEvent: StreamingEvent = {
          id: 'evt-2',
          type: 'payment.completed',
          payload: {
            transaction: {
              id: 'tx-2',
              providerTransactionId: 'prov-tx-2',
              provider: 'paystack',
              status: 'completed',
              amount: { amount: 1000, currency: 'NGN' },
              customer: { id: 'cust-123' },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            provider: 'paystack',
            rawPayload: {},
          },
          metadata: { source: 'test' },
          timestamp: new Date(),
          version: '1.0',
        };

        await client.publish(allowedEvent);
        await client.publish(blockedEvent);

        // Wait for processing
        await new Promise((resolve) => setTimeout(resolve, 1500));

        expect(receivedEvents.length).toBe(1);
        expect(receivedEvents[0].payload.provider).toBe('mpesa');
      });
    });

    describe('Topic Management', () => {
      it('should create topics', async () => {
        await client.connect();
        await client.createTopic('test-topic');
        // No error means success
      });
    });
  });

  describe('StreamingEventBuilder', () => {
    it('should build a valid event', () => {
      const event = StreamingEventBuilder.create()
        .withId('evt-123')
        .withType('payment.completed')
        .withPayload({
          transaction: {
            id: 'tx-123',
            providerTransactionId: 'prov-tx-123',
            provider: 'mpesa',
            status: 'completed',
            amount: { amount: 1000, currency: 'KES' },
            customer: { id: 'cust-123' },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          provider: 'mpesa',
          rawPayload: {},
        })
        .withMetadata({ tenantId: 'tenant-123', userId: 'user-123' })
        .withVersion('1.0')
        .build();

      expect(event.id).toBe('evt-123');
      expect(event.type).toBe('payment.completed');
      expect(event.version).toBe('1.0');
      expect(event.metadata.tenantId).toBe('tenant-123');
    });

    it('should throw error when required fields are missing', () => {
      expect(() => {
        StreamingEventBuilder.create().build();
      }).toThrow('Event ID, type, and payload are required');
    });

    it('should build from PaymentEventData', () => {
      const paymentEventData = {
        eventType: 'payment.completed' as const,
        provider: 'mpesa',
        transaction: {
          id: 'tx-123',
          providerTransactionId: 'prov-tx-123',
          provider: 'mpesa',
          status: 'completed',
          amount: { amount: 1000, currency: 'KES' },
          customer: { id: 'cust-123' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        rawPayload: { test: true },
        receivedAt: new Date(),
        metadata: {
          correlationId: 'corr-123',
          tenantId: 'tenant-123',
          userId: 'user-123',
        },
      };

      const event = StreamingEventBuilder.create()
        .fromPaymentEventData(paymentEventData)
        .build();

      expect(event.type).toBe('payment.completed');
      expect(event.payload.provider).toBe('mpesa');
      expect(event.metadata.correlationId).toBe('corr-123');
    });
  });

  describe('EventStreamingFactory', () => {
    it('should create in-memory client', () => {
      const config: EventStreamConfig = {
        broker: 'memory',
      };

      const client = EventStreamingFactory.createClient(config);
      expect(client).toBeDefined();
    });

    it('should throw error when Kafka config is missing', () => {
      const config: EventStreamConfig = {
        broker: 'kafka',
      };

      expect(() => {
        EventStreamingFactory.createClient(config);
      }).toThrow('Kafka configuration required');
    });

    it('should throw error when RabbitMQ config is missing', () => {
      const config: EventStreamConfig = {
        broker: 'rabbitmq',
      };

      expect(() => {
        EventStreamingFactory.createClient(config);
      }).toThrow('RabbitMQ configuration required');
    });
  });
});
