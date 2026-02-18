/**
 * Chipper Cash Webhook Handler
 * Handles transfer and payment request callbacks from Chipper Cash
 */

import { 
  Transaction, 
  TransactionStatus,
  Money,
  Customer,
  PhoneNumber 
} from '../../types/index.js';
import { Logger } from '../../utils/structured-logger.js';
import { 
  PaymentEventEmitter, 
  PaymentEventData,
  createEventId 
} from '../events.js';
import { WebhookVerifier } from '../verifier.js';

// ==================== Chipper Cash Webhook Types ====================

export type ChipperCashEventType = 
  | 'transfer.completed'
  | 'transfer.failed'
  | 'payment_request.paid'
  | 'payment_request.expired'
  | 'payment_request.cancelled'
  | 'refund.completed'
  | 'refund.failed';

export interface ChipperCashWebhookPayload {
  event: ChipperCashEventType;
  data: ChipperCashTransferData | ChipperCashPaymentRequestData | ChipperCashRefundData;
  timestamp: string;
  signature: string;
}

export interface ChipperCashTransferData {
  id: string;
  status: 'completed' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  sender: {
    id: string;
    tag?: string;
    displayName: string;
    phone?: string;
    email?: string;
  };
  recipient: {
    id: string;
    tag?: string;
    displayName: string;
    phone?: string;
    email?: string;
  };
  description?: string;
  createdAt: string;
  completedAt?: string;
  failureReason?: string;
  metadata?: Record<string, any>;
}

export interface ChipperCashPaymentRequestData {
  id: string;
  status: 'completed' | 'expired' | 'cancelled';
  amount: number;
  currency: string;
  requester: {
    id: string;
    tag?: string;
    displayName: string;
    phone?: string;
    email?: string;
  };
  payer?: {
    id: string;
    tag?: string;
    displayName: string;
    phone?: string;
    email?: string;
  };
  description?: string;
  createdAt: string;
  expiryDate: string;
  paidAt?: string;
  metadata?: Record<string, any>;
}

export interface ChipperCashRefundData {
  id: string;
  status: 'completed' | 'failed';
  amount: number;
  currency: string;
  originalTransactionId: string;
  reason?: string;
  createdAt: string;
  completedAt?: string;
  failureReason?: string;
}

// ==================== Handler Class ====================

export class ChipperCashWebhookHandler {
  private logger: StructuredLogger;
  private eventEmitter: PaymentEventEmitter;
  private verifier: WebhookVerifier;
  private webhookSecret?: string;

  constructor(
    logger: StructuredLogger,
    eventEmitter: PaymentEventEmitter,
    verifier: WebhookVerifier,
    webhookSecret?: string
  ) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.verifier = verifier;
    this.webhookSecret = webhookSecret;
  }

  /**
   * Handle incoming Chipper Cash webhook
   */
  async handleWebhook(
    payload: any,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ success: boolean; message: string; transaction?: Transaction }> {
    const eventId = createEventId('chipper_cash');
    const receivedAt = new Date();

    try {
      // Log raw webhook for debugging
      this.logger.debug(`Chipper Cash webhook received [${eventId}]: ${JSON.stringify(this.verifier.sanitizePayload(payload))}`);

      // Verify webhook signature
      const signature = this.verifier.extractSignature(headers, 'chipper_cash');
      if (this.webhookSecret && signature) {
        const isValid = this.verifier.verifyHmacSignature(
          JSON.stringify(payload),
          signature,
          this.webhookSecret,
          'sha256'
        );
        if (!isValid) {
          this.eventEmitter.emitWebhookError('chipper_cash', 'Invalid signature', payload);
          return { success: false, message: 'Invalid webhook signature' };
        }
      }

      // Emit webhook received event
      this.eventEmitter.emitWebhookReceived({
        id: eventId,
        provider: 'chipper_cash',
        eventType: payload.event || 'unknown',
        payload: this.verifier.sanitizePayload(payload),
        receivedAt,
      });

      // Validate payload structure
      if (!payload.event || !payload.data) {
        this.eventEmitter.emitWebhookError('chipper_cash', 'Missing event or data', payload);
        return { success: false, message: 'Invalid webhook payload structure' };
      }

      // Route to specific handler based on event type
      switch (payload.event) {
        case 'transfer.completed':
        case 'transfer.failed':
          return this.handleTransferWebhook(payload as ChipperCashWebhookPayload, eventId);
        
        case 'payment_request.paid':
        case 'payment_request.expired':
        case 'payment_request.cancelled':
          return this.handlePaymentRequestWebhook(payload as ChipperCashWebhookPayload, eventId);
        
        case 'refund.completed':
        case 'refund.failed':
          return this.handleRefundWebhook(payload as ChipperCashWebhookPayload, eventId);
        
        default:
          return { success: false, message: `Unknown event type: ${payload.event}` };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Chipper Cash webhook handling error [${eventId}]: ${errorMessage}`);
      this.eventEmitter.emitWebhookError('chipper_cash', errorMessage, payload);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Handle transfer webhook
   */
  private handleTransferWebhook(
    payload: ChipperCashWebhookPayload,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    const data = payload.data as ChipperCashTransferData;
    this.logger.info(`Processing Chipper Cash transfer [${eventId}]: ${data.id}`);

    const isSuccess = data.status === 'completed';
    const status = this.mapChipperCashStatus(data.status);

    // Build customer info from recipient
    const customer: Customer = {
      name: data.recipient.displayName,
      email: data.recipient.email,
    };

    if (data.recipient.phone) {
      const cleanPhone = data.recipient.phone.replace(/\D/g, '');
      customer.phone = {
        countryCode: cleanPhone.substring(0, 3),
        nationalNumber: cleanPhone.substring(3),
        formatted: `+${cleanPhone}`,
      };
    }

    const amount: Money = {
      amount: data.amount,
      currency: data.currency,
    };

    const transaction: Transaction = {
      id: `chipper_transfer_${data.id}`,
      providerTransactionId: data.id,
      provider: 'chipper_cash',
      status,
      amount,
      customer,
      description: data.description,
      metadata: {
        senderId: data.sender.id,
        senderTag: data.sender.tag,
        senderName: data.sender.displayName,
        recipientId: data.recipient.id,
        recipientTag: data.recipient.tag,
        eventId,
        ...data.metadata,
      },
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(),
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      failureReason: data.failureReason,
    };

    // Emit appropriate event
    const eventData: Omit<PaymentEventData, 'eventType' | 'processedAt'> = {
      provider: 'chipper_cash',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    };

    if (isSuccess) {
      this.eventEmitter.emitPaymentEvent('transfer.success', eventData);
    } else {
      this.eventEmitter.emitPaymentEvent('transfer.failed', eventData);
    }

    return {
      success: true,
      message: isSuccess ? 'Transfer successful' : `Transfer failed: ${data.failureReason || data.status}`,
      transaction,
    };
  }

  /**
   * Handle payment request webhook
   */
  private handlePaymentRequestWebhook(
    payload: ChipperCashWebhookPayload,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    const data = payload.data as ChipperCashPaymentRequestData;
    this.logger.info(`Processing Chipper Cash payment request [${eventId}]: ${data.id}`);

    const isSuccess = data.status === 'completed';
    const isExpired = data.status === 'expired';
    const status = this.mapChipperCashStatus(data.status);

    // Build customer info from requester
    const customer: Customer = {
      name: data.requester.displayName,
      email: data.requester.email,
    };

    if (data.requester.phone) {
      const cleanPhone = data.requester.phone.replace(/\D/g, '');
      customer.phone = {
        countryCode: cleanPhone.substring(0, 3),
        nationalNumber: cleanPhone.substring(3),
        formatted: `+${cleanPhone}`,
      };
    }

    const amount: Money = {
      amount: data.amount,
      currency: data.currency,
    };

    const transaction: Transaction = {
      id: `chipper_request_${data.id}`,
      providerTransactionId: data.id,
      provider: 'chipper_cash',
      status,
      amount,
      customer,
      description: data.description,
      metadata: {
        requesterId: data.requester.id,
        requesterTag: data.requester.tag,
        payerId: data.payer?.id,
        payerTag: data.payer?.tag,
        payerName: data.payer?.displayName,
        expiryDate: data.expiryDate,
        eventId,
        ...data.metadata,
      },
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(),
      completedAt: data.paidAt ? new Date(data.paidAt) : undefined,
    };

    // Emit appropriate event
    const eventData: Omit<PaymentEventData, 'eventType' | 'processedAt'> = {
      provider: 'chipper_cash',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    };

    if (isSuccess) {
      this.eventEmitter.emitPaymentEvent('payment.success', eventData);
    } else if (isExpired) {
      this.eventEmitter.emitPaymentEvent('payment.cancelled', eventData);
    } else {
      this.eventEmitter.emitPaymentEvent('payment.failed', eventData);
    }

    return {
      success: true,
      message: isSuccess ? 'Payment request paid' : `Payment request ${data.status}`,
      transaction,
    };
  }

  /**
   * Handle refund webhook
   */
  private handleRefundWebhook(
    payload: ChipperCashWebhookPayload,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    const data = payload.data as ChipperCashRefundData;
    this.logger.info(`Processing Chipper Cash refund [${eventId}]: ${data.id}`);

    const isSuccess = data.status === 'completed';
    const status = isSuccess ? 'refunded' : 'failed';

    const amount: Money = {
      amount: data.amount,
      currency: data.currency,
    };

    const transaction: Transaction = {
      id: `chipper_refund_${data.id}`,
      providerTransactionId: data.id,
      provider: 'chipper_cash',
      status,
      amount,
      customer: {},
      description: `Refund for ${data.originalTransactionId}`,
      metadata: {
        originalTransactionId: data.originalTransactionId,
        reason: data.reason,
        eventId,
      },
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(),
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      failureReason: data.failureReason,
    };

    // Emit refund event
    this.eventEmitter.emitPaymentEvent('refund.processed', {
      provider: 'chipper_cash',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: isSuccess ? 'Refund processed' : `Refund failed: ${data.failureReason || data.status}`,
      transaction,
    };
  }

  /**
   * Map Chipper Cash status to internal status
   */
  private mapChipperCashStatus(status: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'completed': 'completed',
      'successful': 'completed',
      'success': 'completed',
      'failed': 'failed',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',
      'expired': 'cancelled',
      'pending': 'pending',
      'processing': 'processing',
    };
    return statusMap[status.toLowerCase()] || 'pending';
  }
}

// ==================== Factory Function ====================

export function createChipperCashWebhookHandler(
  logger: StructuredLogger,
  eventEmitter: PaymentEventEmitter,
  verifier: WebhookVerifier,
  webhookSecret?: string
): ChipperCashWebhookHandler {
  return new ChipperCashWebhookHandler(logger, eventEmitter, verifier, webhookSecret);
}
