/**
 * Webhook Event Emitter
 * Centralized event system for payment notifications
 */

import { EventEmitter } from 'events';
import { Transaction, TransactionStatus } from '../types/index.js';
import { Logger } from '../utils/logger.js';

// ==================== Event Types ====================

export type PaymentEventType =
  | 'payment.success'
  | 'payment.failed'
  | 'payment.pending'
  | 'payment.processing'
  | 'payment.cancelled'
  | 'payment.refunded'
  | 'payment.disputed'
  | 'transfer.success'
  | 'transfer.failed'
  | 'transfer.reversed'
  | 'refund.processed'
  | 'webhook.received'
  | 'webhook.error';

export interface PaymentEventData {
  eventType: PaymentEventType;
  provider: string;
  transaction?: Transaction;
  rawPayload: any;
  signature?: string;
  receivedAt: Date;
  processedAt?: Date;
  error?: string;
  metadata?: Record<string, any>;
}

export interface WebhookEvent {
  id: string;
  provider: string;
  eventType: string;
  payload: any;
  signature?: string;
  receivedAt: Date;
  ip?: string;
  userAgent?: string;
}

// Handler function types
export type PaymentEventHandler = (data: PaymentEventData) => void | Promise<void>;
export type WebhookReceivedHandler = (event: WebhookEvent) => void | Promise<void>;

// ==================== Event Emitter Class ====================

export class PaymentEventEmitter extends EventEmitter {
  private logger: Logger;
  private processedEvents: Set<string> = new Set();
  private maxCacheSize: number = 10000; // Prevent memory leak

  constructor(logger: Logger) {
    super();
    this.logger = logger;
    this.setupDefaultListeners();
  }

  private setupDefaultListeners(): void {
    // Log all events for debugging
    this.on('webhook.received', (event: WebhookEvent) => {
      this.logger.info(`📨 Webhook received from ${event.provider}: ${event.eventType}`);
    });

    this.on('webhook.error', (data: PaymentEventData) => {
      this.logger.error(`❌ Webhook error from ${data.provider}: ${data.error}`);
    });

    this.on('payment.success', (data: PaymentEventData) => {
      const tx = data.transaction;
      if (tx) {
        this.logger.info(`✅ Payment successful: ${tx.providerTransactionId} (${tx.amount.amount} ${tx.amount.currency})`);
      }
    });

    this.on('payment.failed', (data: PaymentEventData) => {
      const tx = data.transaction;
      if (tx) {
        this.logger.error(`❌ Payment failed: ${tx.providerTransactionId} - ${tx.failureReason || 'Unknown error'}`);
      }
    });

    this.on('payment.refunded', (data: PaymentEventData) => {
      const tx = data.transaction;
      if (tx) {
        this.logger.info(`💰 Payment refunded: ${tx.providerTransactionId}`);
      }
    });
  }

  /**
   * Emit a payment event
   */
  emitPaymentEvent(eventType: PaymentEventType, data: Omit<PaymentEventData, 'eventType' | 'processedAt'>): boolean {
    const eventData: PaymentEventData = {
      ...data,
      eventType,
      processedAt: new Date(),
    };

    // Check for duplicates using transaction ID if available
    if (data.transaction?.id) {
      const eventKey = `${eventType}:${data.transaction.id}`;
      if (this.isDuplicate(eventKey)) {
        this.logger.warn(`⚠️ Duplicate event detected: ${eventKey}`);
        return false;
      }
      this.trackEvent(eventKey);
    }

    return this.emit(eventType, eventData);
  }

  /**
   * Emit webhook received event
   */
  emitWebhookReceived(event: WebhookEvent): boolean {
    return this.emit('webhook.received', event);
  }

  /**
   * Emit webhook error event
   */
  emitWebhookError(provider: string, error: string, rawPayload: any, signature?: string): boolean {
    return this.emitPaymentEvent('webhook.error', {
      provider,
      rawPayload,
      signature,
      receivedAt: new Date(),
      error,
    });
  }

  /**
   * Subscribe to a specific payment event
   */
  onPaymentEvent(eventType: PaymentEventType, handler: PaymentEventHandler): this {
    this.on(eventType, handler);
    return this;
  }

  /**
   * Subscribe to all payment events
   */
  onAllPaymentEvents(handler: PaymentEventHandler): this {
    const eventTypes: PaymentEventType[] = [
      'payment.success',
      'payment.failed',
      'payment.pending',
      'payment.processing',
      'payment.cancelled',
      'payment.refunded',
      'payment.disputed',
      'transfer.success',
      'transfer.failed',
      'transfer.reversed',
      'refund.processed',
    ];

    eventTypes.forEach((eventType) => {
      this.on(eventType, handler);
    });

    return this;
  }

  /**
   * Subscribe to webhook received events
   */
  onWebhookReceived(handler: WebhookReceivedHandler): this {
    this.on('webhook.received', handler);
    return this;
  }

  /**
   * Subscribe to webhook errors
   */
  onWebhookError(handler: (data: PaymentEventData) => void): this {
    this.on('webhook.error', handler);
    return this;
  }

  /**
   * Check if an event is a duplicate (idempotency check)
   */
  private isDuplicate(eventKey: string): boolean {
    return this.processedEvents.has(eventKey);
  }

  /**
   * Track an event for idempotency
   */
  private trackEvent(eventKey: string): void {
    // Prevent memory leak by limiting cache size
    if (this.processedEvents.size >= this.maxCacheSize) {
      // Clear oldest 20% of entries
      const entriesToDelete = Math.floor(this.maxCacheSize * 0.2);
      const entries = Array.from(this.processedEvents).slice(0, entriesToDelete);
      entries.forEach((key) => this.processedEvents.delete(key));
    }

    this.processedEvents.add(eventKey);

    // Auto-expire after 24 hours
    setTimeout(() => {
      this.processedEvents.delete(eventKey);
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Get the number of tracked events (for monitoring)
   */
  getTrackedEventCount(): number {
    return this.processedEvents.size;
  }

  /**
   * Clear all tracked events
   */
  clearTrackedEvents(): void {
    this.processedEvents.clear();
  }
}

// ==================== Singleton Instance ====================

let globalEventEmitter: PaymentEventEmitter | null = null;

export function getGlobalEventEmitter(logger?: Logger): PaymentEventEmitter {
  if (!globalEventEmitter) {
    globalEventEmitter = new PaymentEventEmitter(logger || new Logger());
  }
  return globalEventEmitter;
}

export function setGlobalEventEmitter(emitter: PaymentEventEmitter): void {
  globalEventEmitter = emitter;
}

// ==================== Helper Functions ====================

export function mapStatusToEventType(status: TransactionStatus, isRefund = false): PaymentEventType {
  switch (status) {
    case 'completed':
      return isRefund ? 'refund.processed' : 'payment.success';
    case 'failed':
      return 'payment.failed';
    case 'pending':
      return 'payment.pending';
    case 'processing':
      return 'payment.processing';
    case 'cancelled':
      return 'payment.cancelled';
    case 'refunded':
      return 'payment.refunded';
    default:
      return 'payment.pending';
  }
}

export function createEventId(provider: string, timestamp: Date = new Date()): string {
  return `${provider}_${timestamp.getTime()}_${Math.random().toString(36).substring(2, 11)}`;
}
