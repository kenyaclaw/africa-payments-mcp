/**
 * Orange Money Webhook Handler
 * Handles payment and transfer callbacks from Orange Money
 */

import { 
  Transaction, 
  TransactionStatus,
  Money,
  Customer,
  PhoneNumber 
} from '../../types/index.js';
import { ILogger } from '../../utils/structured-logger.js';
import { 
  PaymentEventEmitter, 
  PaymentEventData,
  WebhookEvent,
  createEventId 
} from '../events.js';
import { WebhookVerifier } from '../verifier.js';

// ==================== Orange Money Webhook Types ====================

export interface OrangeMoneyPaymentCallback {
  paymentToken: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'PENDING';
  amount: {
    value: number;
    currency: string;
  };
  subscriber: {
    number: string;
    country: string;
  };
  reference: string;
  description?: string;
  transactionId?: string;
  completedAt?: string;
  failureReason?: string;
}

export interface OrangeMoneyTransferCallback {
  transactionId: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  amount: {
    value: number;
    currency: string;
  };
  receiver: {
    number: string;
    name?: string;
  };
  reference: string;
  description?: string;
  completedAt?: string;
  failureReason?: string;
}

export interface OrangeMoneyRefundCallback {
  refundId: string;
  originalTransactionId: string;
  status: 'SUCCESS' | 'FAILED';
  amount: {
    value: number;
    currency: string;
  };
  reason?: string;
  completedAt?: string;
}

// ==================== Handler Class ====================

export class OrangeMoneyWebhookHandler {
  private logger: ILogger;
  private eventEmitter: PaymentEventEmitter;
  private verifier: WebhookVerifier;

  constructor(
    logger: ILogger,
    eventEmitter: PaymentEventEmitter,
    verifier: WebhookVerifier
  ) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.verifier = verifier;
  }

  /**
   * Handle incoming Orange Money webhook
   */
  async handleWebhook(
    payload: any,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ success: boolean; message: string; transaction?: Transaction }> {
    const eventId = createEventId('orange_money');
    const receivedAt = new Date();

    try {
      // Log raw webhook for debugging
      this.logger.debug(`Orange Money webhook received [${eventId}]: ${JSON.stringify(this.verifier.sanitizePayload(payload))}`);

      // Emit webhook received event
      this.eventEmitter.emitWebhookReceived({
        id: eventId,
        provider: 'orange_money',
        eventType: this.detectEventType(payload),
        payload: this.verifier.sanitizePayload(payload),
        receivedAt,
      });

      // Verify webhook structure
      const verification = this.verifyOrangeMoneyWebhook(payload);
      if (!verification.valid) {
        this.eventEmitter.emitWebhookError('orange_money', verification.error || 'Verification failed', payload);
        return { success: false, message: verification.error || 'Invalid webhook' };
      }

      // Route to specific handler based on callback type
      if (payload.paymentToken) {
        return this.handlePaymentCallback(payload as OrangeMoneyPaymentCallback, eventId);
      }

      if (payload.transactionId && payload.receiver) {
        return this.handleTransferCallback(payload as OrangeMoneyTransferCallback, eventId);
      }

      if (payload.refundId) {
        return this.handleRefundCallback(payload as OrangeMoneyRefundCallback, eventId);
      }

      return { success: false, message: 'Unknown Orange Money webhook type' };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Orange Money webhook handling error [${eventId}]: ${errorMessage}`);
      this.eventEmitter.emitWebhookError('orange_money', errorMessage, payload);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Verify Orange Money webhook structure
   */
  private verifyOrangeMoneyWebhook(payload: any): { valid: boolean; error?: string } {
    try {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, error: 'Invalid payload format' };
      }

      // Payment callback validation
      if (payload.paymentToken) {
        if (!payload.status) {
          return { valid: false, error: 'Missing status in payment callback' };
        }
        if (!payload.amount || typeof payload.amount.value !== 'number') {
          return { valid: false, error: 'Missing or invalid amount' };
        }
        return { valid: true };
      }

      // Transfer callback validation
      if (payload.transactionId && payload.receiver) {
        if (!payload.status) {
          return { valid: false, error: 'Missing status in transfer callback' };
        }
        return { valid: true };
      }

      // Refund callback validation
      if (payload.refundId) {
        if (!payload.originalTransactionId) {
          return { valid: false, error: 'Missing original transaction ID in refund callback' };
        }
        return { valid: true };
      }

      return { valid: false, error: 'Unknown Orange Money webhook format' };
    } catch (error) {
      return { valid: false, error: 'Verification failed' };
    }
  }

  /**
   * Handle payment callback
   */
  private handlePaymentCallback(
    payload: OrangeMoneyPaymentCallback,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing Orange Money payment callback [${eventId}]: ${payload.paymentToken}`);

    const isSuccess = payload.status === 'SUCCESS';
    const status = this.mapOrangeMoneyStatus(payload.status);

    // Parse phone number
    const phone: PhoneNumber = {
      countryCode: payload.subscriber.number.substring(0, 3),
      nationalNumber: payload.subscriber.number.substring(3),
      formatted: `+${payload.subscriber.number}`,
    };

    const customer: Customer = {
      phone,
      country: payload.subscriber.country,
    };

    const amount: Money = {
      amount: payload.amount.value,
      currency: payload.amount.currency,
    };

    const transaction: Transaction = {
      id: `orange_${payload.paymentToken}`,
      providerTransactionId: payload.transactionId || payload.paymentToken,
      provider: 'orange_money',
      status,
      amount,
      customer,
      description: payload.description,
      metadata: {
        paymentToken: payload.paymentToken,
        reference: payload.reference,
        eventId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: isSuccess && payload.completedAt ? new Date(payload.completedAt) : undefined,
      failureReason: payload.failureReason,
    };

    // Emit appropriate event
    const eventData: Omit<PaymentEventData, 'eventType' | 'processedAt'> = {
      provider: 'orange_money',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    };

    if (isSuccess) {
      this.eventEmitter.emitPaymentEvent('payment.success', eventData);
    } else {
      this.eventEmitter.emitPaymentEvent('payment.failed', eventData);
    }

    return {
      success: true,
      message: isSuccess ? 'Payment successful' : `Payment failed: ${payload.failureReason || payload.status}`,
      transaction,
    };
  }

  /**
   * Handle transfer callback
   */
  private handleTransferCallback(
    payload: OrangeMoneyTransferCallback,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing Orange Money transfer callback [${eventId}]: ${payload.transactionId}`);

    const isSuccess = payload.status === 'SUCCESS';
    const status = this.mapOrangeMoneyStatus(payload.status);

    // Parse phone number
    const phone: PhoneNumber = {
      countryCode: payload.receiver.number.substring(0, 3),
      nationalNumber: payload.receiver.number.substring(3),
      formatted: `+${payload.receiver.number}`,
    };

    const customer: Customer = {
      phone,
      name: payload.receiver.name,
    };

    const amount: Money = {
      amount: payload.amount.value,
      currency: payload.amount.currency,
    };

    const transaction: Transaction = {
      id: `orange_transfer_${payload.transactionId}`,
      providerTransactionId: payload.transactionId,
      provider: 'orange_money',
      status,
      amount,
      customer,
      description: payload.description,
      metadata: {
        reference: payload.reference,
        eventId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: isSuccess && payload.completedAt ? new Date(payload.completedAt) : undefined,
      failureReason: payload.failureReason,
    };

    // Emit transfer event
    const eventType = isSuccess ? 'transfer.success' : 'transfer.failed';
    this.eventEmitter.emitPaymentEvent(eventType, {
      provider: 'orange_money',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: isSuccess ? 'Transfer successful' : `Transfer failed: ${payload.failureReason || payload.status}`,
      transaction,
    };
  }

  /**
   * Handle refund callback
   */
  private handleRefundCallback(
    payload: OrangeMoneyRefundCallback,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing Orange Money refund callback [${eventId}]: ${payload.refundId}`);

    const isSuccess = payload.status === 'SUCCESS';
    const status = isSuccess ? 'refunded' : 'failed';

    const amount: Money = {
      amount: payload.amount.value,
      currency: payload.amount.currency,
    };

    const transaction: Transaction = {
      id: `orange_refund_${payload.refundId}`,
      providerTransactionId: payload.refundId,
      provider: 'orange_money',
      status,
      amount,
      customer: {},
      description: `Refund: ${payload.reason || 'Customer request'}`,
      metadata: {
        originalTransactionId: payload.originalTransactionId,
        reason: payload.reason,
        eventId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: isSuccess && payload.completedAt ? new Date(payload.completedAt) : undefined,
    };

    // Emit refund event
    this.eventEmitter.emitPaymentEvent('refund.processed', {
      provider: 'orange_money',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: isSuccess ? 'Refund processed' : `Refund failed`,
      transaction,
    };
  }

  /**
   * Detect event type from payload
   */
  private detectEventType(payload: any): string {
    if (payload.paymentToken) return 'payment_callback';
    if (payload.transactionId && payload.receiver) return 'transfer_callback';
    if (payload.refundId) return 'refund_callback';
    return 'unknown';
  }

  /**
   * Map Orange Money status to internal status
   */
  private mapOrangeMoneyStatus(status: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'SUCCESS': 'completed',
      'FAILED': 'failed',
      'CANCELLED': 'cancelled',
      'PENDING': 'pending',
    };
    return statusMap[status] || 'pending';
  }
}

// ==================== Factory Function ====================

export function createOrangeMoneyWebhookHandler(
  logger: ILogger,
  eventEmitter: PaymentEventEmitter,
  verifier: WebhookVerifier
): OrangeMoneyWebhookHandler {
  return new OrangeMoneyWebhookHandler(logger, eventEmitter, verifier);
}
