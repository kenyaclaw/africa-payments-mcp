/**
 * Wave Webhook Handler
 * Handles payment and transfer callbacks from Wave
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

// ==================== Wave Webhook Types ====================

export type WaveEventType = 
  | 'payment_request.succeeded'
  | 'payment_request.failed'
  | 'payment_request.cancelled'
  | 'transfer.succeeded'
  | 'transfer.failed'
  | 'transfer.cancelled'
  | 'refund.succeeded'
  | 'refund.failed';

export interface WaveWebhookPayload {
  event: WaveEventType;
  data: WavePaymentData | WaveTransferData | WaveRefundData;
  timestamp: string;
  signature?: string;
}

export interface WavePaymentData {
  id: string;
  type: 'payment_request';
  status: 'succeeded' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  fee?: number;
  tax?: number;
  totalAmount?: number;
  customer?: {
    phone?: string;
    name?: string;
  };
  clientReference?: string;
  description?: string;
  qrCodeData?: string;
  createdAt: string;
  completedAt?: string;
  failureReason?: string;
}

export interface WaveTransferData {
  id: string;
  type: 'transfer';
  status: 'succeeded' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  fee?: number;
  tax?: number;
  recipient: {
    phone: string;
    name?: string;
  };
  sender?: {
    phone?: string;
    name?: string;
  };
  clientReference?: string;
  description?: string;
  createdAt: string;
  completedAt?: string;
  failureReason?: string;
}

export interface WaveRefundData {
  id: string;
  type: 'refund';
  status: 'succeeded' | 'failed';
  amount: number;
  currency: string;
  originalTransactionId: string;
  reason?: string;
  createdAt: string;
  completedAt?: string;
  failureReason?: string;
}

// ==================== Handler Class ====================

export class WaveWebhookHandler {
  private logger: Logger;
  private eventEmitter: PaymentEventEmitter;
  private verifier: WebhookVerifier;
  private apiSecret?: string;

  constructor(
    logger: Logger,
    eventEmitter: PaymentEventEmitter,
    verifier: WebhookVerifier,
    apiSecret?: string
  ) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.verifier = verifier;
    this.apiSecret = apiSecret;
  }

  /**
   * Handle incoming Wave webhook
   */
  async handleWebhook(
    payload: any,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ success: boolean; message: string; transaction?: Transaction }> {
    const eventId = createEventId('wave');
    const receivedAt = new Date();

    try {
      // Log raw webhook for debugging
      this.logger.debug(`Wave webhook received [${eventId}]: ${JSON.stringify(this.verifier.sanitizePayload(payload))}`);

      // Verify webhook signature if secret is configured
      const signature = headers['x-wave-signature'] as string | undefined;
      if (this.apiSecret && signature) {
        const isValid = this.verifier.verifyHmacSignature(
          JSON.stringify(payload),
          signature,
          this.apiSecret,
          'sha256'
        );
        if (!isValid) {
          this.eventEmitter.emitWebhookError('wave', 'Invalid signature', payload);
          return { success: false, message: 'Invalid webhook signature' };
        }
      }

      // Emit webhook received event
      this.eventEmitter.emitWebhookReceived({
        id: eventId,
        provider: 'wave',
        eventType: payload.event || 'unknown',
        payload: this.verifier.sanitizePayload(payload),
        receivedAt,
      });

      // Validate payload structure
      if (!payload.event || !payload.data) {
        this.eventEmitter.emitWebhookError('wave', 'Missing event or data', payload);
        return { success: false, message: 'Invalid webhook payload structure' };
      }

      // Route to specific handler based on event type
      if (payload.event.startsWith('payment_request.')) {
        return this.handlePaymentRequestWebhook(payload as WaveWebhookPayload, eventId);
      }

      if (payload.event.startsWith('transfer.')) {
        return this.handleTransferWebhook(payload as WaveWebhookPayload, eventId);
      }

      if (payload.event.startsWith('refund.')) {
        return this.handleRefundWebhook(payload as WaveWebhookPayload, eventId);
      }

      return { success: false, message: `Unknown event type: ${payload.event}` };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Wave webhook handling error [${eventId}]: ${errorMessage}`);
      this.eventEmitter.emitWebhookError('wave', errorMessage, payload);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Handle payment request webhook
   */
  private handlePaymentRequestWebhook(
    payload: WaveWebhookPayload,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    const data = payload.data as WavePaymentData;
    this.logger.info(`Processing Wave payment [${eventId}]: ${data.id}`);

    const isSuccess = data.status === 'succeeded';
    const isCancelled = data.status === 'cancelled';
    const status = this.mapWaveStatus(data.status);

    // Build customer info
    const customer: Customer = {};
    if (data.customer?.phone) {
      const cleanPhone = data.customer.phone.replace(/\D/g, '');
      customer.phone = {
        countryCode: cleanPhone.substring(0, 3),
        nationalNumber: cleanPhone.substring(3),
        formatted: `+${cleanPhone}`,
      };
      customer.name = data.customer.name;
    }

    const amount: Money = {
      amount: data.amount,
      currency: data.currency,
    };

    const transaction: Transaction = {
      id: `wave_${data.id}`,
      providerTransactionId: data.id,
      provider: 'wave',
      status,
      amount,
      customer,
      description: data.description,
      metadata: {
        clientReference: data.clientReference,
        fee: data.fee,
        tax: data.tax,
        totalAmount: data.totalAmount,
        qrCodeData: data.qrCodeData,
        eventId,
      },
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(),
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      failureReason: data.failureReason,
    };

    // Emit appropriate event
    const eventData: Omit<PaymentEventData, 'eventType' | 'processedAt'> = {
      provider: 'wave',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    };

    if (isSuccess) {
      this.eventEmitter.emitPaymentEvent('payment.success', eventData);
    } else if (isCancelled) {
      this.eventEmitter.emitPaymentEvent('payment.cancelled', eventData);
    } else {
      this.eventEmitter.emitPaymentEvent('payment.failed', eventData);
    }

    return {
      success: true,
      message: isSuccess ? 'Payment successful' : `Payment ${data.status}: ${data.failureReason || ''}`,
      transaction,
    };
  }

  /**
   * Handle transfer webhook
   */
  private handleTransferWebhook(
    payload: WaveWebhookPayload,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    const data = payload.data as WaveTransferData;
    this.logger.info(`Processing Wave transfer [${eventId}]: ${data.id}`);

    const isSuccess = data.status === 'succeeded';
    const status = this.mapWaveStatus(data.status);

    // Build customer info from recipient
    const customer: Customer = {};
    if (data.recipient.phone) {
      const cleanPhone = data.recipient.phone.replace(/\D/g, '');
      customer.phone = {
        countryCode: cleanPhone.substring(0, 3),
        nationalNumber: cleanPhone.substring(3),
        formatted: `+${cleanPhone}`,
      };
      customer.name = data.recipient.name;
    }

    const amount: Money = {
      amount: data.amount,
      currency: data.currency,
    };

    const transaction: Transaction = {
      id: `wave_transfer_${data.id}`,
      providerTransactionId: data.id,
      provider: 'wave',
      status,
      amount,
      customer,
      description: data.description,
      metadata: {
        clientReference: data.clientReference,
        fee: data.fee,
        tax: data.tax,
        senderPhone: data.sender?.phone,
        senderName: data.sender?.name,
        eventId,
      },
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(),
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      failureReason: data.failureReason,
    };

    // Emit transfer event
    const eventType = isSuccess ? 'transfer.success' : 'transfer.failed';
    this.eventEmitter.emitPaymentEvent(eventType, {
      provider: 'wave',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: isSuccess ? 'Transfer successful' : `Transfer failed: ${data.failureReason || data.status}`,
      transaction,
    };
  }

  /**
   * Handle refund webhook
   */
  private handleRefundWebhook(
    payload: WaveWebhookPayload,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    const data = payload.data as WaveRefundData;
    this.logger.info(`Processing Wave refund [${eventId}]: ${data.id}`);

    const isSuccess = data.status === 'succeeded';
    const status = isSuccess ? 'refunded' : 'failed';

    const amount: Money = {
      amount: data.amount,
      currency: data.currency,
    };

    const transaction: Transaction = {
      id: `wave_refund_${data.id}`,
      providerTransactionId: data.id,
      provider: 'wave',
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
      provider: 'wave',
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
   * Map Wave status to internal status
   */
  private mapWaveStatus(status: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'succeeded': 'completed',
      'successful': 'completed',
      'success': 'completed',
      'completed': 'completed',
      'failed': 'failed',
      'failure': 'failed',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',
    };
    return statusMap[status.toLowerCase()] || 'pending';
  }
}

// ==================== Factory Function ====================

export function createWaveWebhookHandler(
  logger: Logger,
  eventEmitter: PaymentEventEmitter,
  verifier: WebhookVerifier,
  apiSecret?: string
): WaveWebhookHandler {
  return new WaveWebhookHandler(logger, eventEmitter, verifier, apiSecret);
}
