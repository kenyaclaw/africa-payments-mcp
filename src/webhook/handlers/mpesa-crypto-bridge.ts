/**
 * M-Pesa Crypto Bridge Webhook Handler
 * Handles bridge provider webhooks for on/off-ramp transactions
 */

import { 
  Transaction, 
  TransactionStatus,
  Money,
  Customer,
  PhoneNumber,
} from '../../types/index.js';
import { ILogger } from '../../utils/structured-logger.js';
import { 
  PaymentEventEmitter, 
  PaymentEventData,
  createEventId 
} from '../events.js';

// ==================== Bridge Webhook Types ====================

export interface KotaniPayWebhookEvent {
  event: 'transaction.created' | 'transaction.updated' | 'transaction.completed' | 'transaction.failed' | 'transaction.refunded';
  data: {
    transactionId: string;
    type: 'onramp' | 'offramp';
    status: string;
    fromAmount: number;
    fromCurrency: string;
    toAmount: number;
    toCurrency: string;
    phoneNumber?: string;
    walletAddress?: string;
    externalTransactionId?: string; // M-Pesa transaction ID
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    failureReason?: string;
    metadata?: Record<string, any>;
  };
  timestamp: string;
  signature: string;
}

export interface YellowCardWebhookEvent {
  event: 'collection.received' | 'collection.confirmed' | 'collection.failed' |
         'payment.created' | 'payment.completed' | 'payment.failed' |
         'refund.created' | 'refund.completed';
  data: {
    id: string;
    status: string;
    channel: string;
    amount: string;
    currency: string;
    customerEmail?: string;
    customerPhone?: string;
    externalId?: string;
    createdAt: string;
    updatedAt: string;
  };
  timestamp: string;
  signature: string;
}

export interface BridgePaymentNotification {
  event: 'payment.received' | 'payment.sent' | 'payment.failed' | 'refund.processed';
  transactionId: string;
  bridgeProvider: 'kotani' | 'yellowcard' | 'custom';
  type: 'onramp' | 'offramp';
  status: string;
  fiatAmount: number;
  fiatCurrency: string;
  cryptoAmount: number;
  cryptoCurrency: string;
  phoneNumber?: string;
  walletAddress?: string;
  exchangeRate: number;
  fee: number;
  timestamp: string;
}

// ==================== Handler Class ====================

export class MpesaCryptoBridgeWebhookHandler {
  private logger: ILogger;
  private eventEmitter: PaymentEventEmitter;
  private webhookSecret?: string;

  constructor(
    logger: ILogger,
    eventEmitter: PaymentEventEmitter,
    webhookSecret?: string
  ) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.webhookSecret = webhookSecret;
  }

  /**
   * Handle incoming bridge webhook
   */
  async handleWebhook(
    payload: any,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ success: boolean; message: string; transaction?: Transaction }> {
    const eventId = createEventId('mpesa_crypto_bridge');
    const receivedAt = new Date();

    try {
      this.logger.debug(`Bridge webhook received [${eventId}]`);

      // Verify signature if secret is configured
      const signature = headers['x-webhook-signature'] as string || 
                       headers['x-signature'] as string ||
                       payload.signature;
      
      if (this.webhookSecret && signature) {
        const isValid = await this.verifyWebhookSignature(payload, signature);
        if (!isValid) {
          this.eventEmitter.emitWebhookError('mpesa_crypto_bridge', 'Invalid signature', payload);
          return { success: false, message: 'Invalid webhook signature' };
        }
      }

      // Detect event type and provider
      const eventType = this.detectEventType(payload);
      const provider = this.detectProvider(payload);

      // Emit webhook received event
      this.eventEmitter.emitWebhookReceived({
        id: eventId,
        provider: 'mpesa_crypto_bridge',
        eventType,
        payload: this.sanitizePayload(payload),
        receivedAt,
      });

      // Route to specific handler
      if (payload.data?.type || payload.data?.transactionId) {
        return this.handleKotaniEvent(payload as KotaniPayWebhookEvent, eventId);
      }

      if (payload.event?.startsWith('collection.') || payload.event?.startsWith('payment.')) {
        return this.handleYellowCardEvent(payload as YellowCardWebhookEvent, eventId);
      }

      if (payload.bridgeProvider) {
        return this.handleGenericEvent(payload as BridgePaymentNotification, eventId);
      }

      return { success: false, message: 'Unknown bridge webhook type' };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Bridge webhook handling error [${eventId}]: ${errorMessage}`);
      this.eventEmitter.emitWebhookError('mpesa_crypto_bridge', errorMessage, payload);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Handle Kotani Pay webhook
   */
  private handleKotaniEvent(
    payload: KotaniPayWebhookEvent,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    const data = payload.data;
    this.logger.info(`Processing Kotani event [${eventId}]: ${data.transactionId} - ${data.status}`);

    const status = this.mapKotaniStatus(data.status);
    const isSuccess = status === 'completed';
    const isFailure = status === 'failed';

    const amount: Money = {
      amount: data.fromAmount,
      currency: data.fromCurrency,
    };

    const customer: Customer = data.phoneNumber ? {
      phone: {
        countryCode: data.phoneNumber.substring(0, 3),
        nationalNumber: data.phoneNumber.substring(3),
        formatted: `+${data.phoneNumber}`,
      },
    } : {};

    const transaction: Transaction = {
      id: `bridge_${data.transactionId}`,
      providerTransactionId: data.transactionId,
      provider: 'mpesa_crypto_bridge',
      status,
      amount,
      customer,
      description: `${data.type === 'onramp' ? 'M-Pesa → Crypto' : 'Crypto → M-Pesa'} via Kotani`,
      metadata: {
        bridgeProvider: 'kotani',
        bridgeType: data.type,
        toAmount: data.toAmount,
        toCurrency: data.toCurrency,
        phoneNumber: data.phoneNumber,
        walletAddress: data.walletAddress,
        externalTransactionId: data.externalTransactionId,
        exchangeRate: data.toAmount / data.fromAmount,
        eventId,
        webhookEvent: payload.event,
      },
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      failureReason: data.failureReason,
    };

    // Emit appropriate event
    this.emitBridgeEvent(data.type, status, transaction, payload);

    return {
      success: true,
      message: `Kotani ${data.type} ${isSuccess ? 'completed' : isFailure ? 'failed' : data.status}`,
      transaction,
    };
  }

  /**
   * Handle Yellow Card webhook
   */
  private handleYellowCardEvent(
    payload: YellowCardWebhookEvent,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    const data = payload.data;
    this.logger.info(`Processing Yellow Card event [${eventId}]: ${data.id} - ${payload.event}`);

    const status = this.mapYellowCardStatus(data.status);
    const isCollection = payload.event.startsWith('collection.');

    const amount: Money = {
      amount: parseFloat(data.amount),
      currency: data.currency,
    };

    const customer: Customer = data.customerPhone ? {
      phone: {
        countryCode: data.customerPhone.substring(0, 3),
        nationalNumber: data.customerPhone.substring(3),
        formatted: `+${data.customerPhone}`,
      },
      email: data.customerEmail,
    } : {};

    const transaction: Transaction = {
      id: `bridge_${data.id}`,
      providerTransactionId: data.id,
      provider: 'mpesa_crypto_bridge',
      status,
      amount,
      customer,
      description: `${isCollection ? 'M-Pesa → Crypto' : 'Crypto → M-Pesa'} via Yellow Card`,
      metadata: {
        bridgeProvider: 'yellowcard',
        bridgeType: isCollection ? 'onramp' : 'offramp',
        channel: data.channel,
        externalId: data.externalId,
        eventId,
        webhookEvent: payload.event,
      },
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      completedAt: status === 'completed' ? new Date() : undefined,
    };

    // Emit appropriate event
    this.emitBridgeEvent(isCollection ? 'onramp' : 'offramp', status, transaction, payload);

    return {
      success: true,
      message: `Yellow Card ${isCollection ? 'collection' : 'payment'} ${status}`,
      transaction,
    };
  }

  /**
   * Handle generic bridge notification
   */
  private handleGenericEvent(
    payload: BridgePaymentNotification,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing generic bridge event [${eventId}]: ${payload.transactionId}`);

    const status = this.mapGenericStatus(payload.status);
    const isOnramp = payload.type === 'onramp';

    const amount: Money = {
      amount: payload.fiatAmount,
      currency: payload.fiatCurrency,
    };

    const customer: Customer = payload.phoneNumber ? {
      phone: {
        countryCode: payload.phoneNumber.substring(0, 3),
        nationalNumber: payload.phoneNumber.substring(3),
        formatted: `+${payload.phoneNumber}`,
      },
    } : {};

    const transaction: Transaction = {
      id: `bridge_${payload.transactionId}`,
      providerTransactionId: payload.transactionId,
      provider: 'mpesa_crypto_bridge',
      status,
      amount,
      customer,
      description: `${isOnramp ? 'M-Pesa → Crypto' : 'Crypto → M-Pesa'} via ${payload.bridgeProvider}`,
      metadata: {
        bridgeProvider: payload.bridgeProvider,
        bridgeType: payload.type,
        cryptoAmount: payload.cryptoAmount,
        cryptoCurrency: payload.cryptoCurrency,
        walletAddress: payload.walletAddress,
        exchangeRate: payload.exchangeRate,
        fee: payload.fee,
        eventId,
      },
      createdAt: new Date(payload.timestamp),
      updatedAt: new Date(),
      completedAt: status === 'completed' ? new Date(payload.timestamp) : undefined,
    };

    // Emit appropriate event
    this.emitBridgeEvent(payload.type, status, transaction, payload);

    return {
      success: true,
      message: `Bridge ${payload.type} ${status}`,
      transaction,
    };
  }

  /**
   * Emit appropriate event based on bridge type and status
   */
  private emitBridgeEvent(
    type: 'onramp' | 'offramp',
    status: TransactionStatus,
    transaction: Transaction,
    payload: any
  ): void {
    const eventData: Omit<PaymentEventData, 'eventType' | 'processedAt'> = {
      provider: 'mpesa_crypto_bridge',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    };

    if (type === 'onramp') {
      // On-ramp: M-Pesa → Crypto (payment into crypto)
      if (status === 'completed') {
        this.eventEmitter.emitPaymentEvent('payment.success', eventData);
      } else if (status === 'failed') {
        this.eventEmitter.emitPaymentEvent('payment.failed', eventData);
      }
    } else {
      // Off-ramp: Crypto → M-Pesa (transfer out)
      if (status === 'completed') {
        this.eventEmitter.emitPaymentEvent('transfer.success', eventData);
      } else if (status === 'failed') {
        this.eventEmitter.emitPaymentEvent('transfer.failed', eventData);
      } else if (status === 'refunded') {
        this.eventEmitter.emitPaymentEvent('refund.processed', eventData);
      }
    }
  }

  /**
   * Map Kotani status to transaction status
   */
  private mapKotaniStatus(status: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'pending': 'pending',
      'processing': 'processing',
      'awaiting_payment': 'pending',
      'awaiting_confirmation': 'processing',
      'confirming': 'processing',
      'completed': 'completed',
      'success': 'completed',
      'failed': 'failed',
      'cancelled': 'cancelled',
      'expired': 'cancelled',
      'refunded': 'refunded',
    };
    return statusMap[status.toLowerCase()] || 'pending';
  }

  /**
   * Map Yellow Card status to transaction status
   */
  private mapYellowCardStatus(status: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'pending': 'pending',
      'processing': 'processing',
      'confirmed': 'processing',
      'completed': 'completed',
      'success': 'completed',
      'failed': 'failed',
      'cancelled': 'cancelled',
    };
    return statusMap[status.toLowerCase()] || 'pending';
  }

  /**
   * Map generic status to transaction status
   */
  private mapGenericStatus(status: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'pending': 'pending',
      'processing': 'processing',
      'completed': 'completed',
      'success': 'completed',
      'failed': 'failed',
      'refunded': 'refunded',
    };
    return statusMap[status.toLowerCase()] || 'pending';
  }

  /**
   * Detect event type from payload
   */
  private detectEventType(payload: any): string {
    if (payload.event) return payload.event;
    if (payload.data?.status) return `transaction.${payload.data.status}`;
    return 'unknown';
  }

  /**
   * Detect provider from payload
   */
  private detectProvider(payload: any): string {
    if (payload.data?.transactionId?.startsWith('kot')) return 'kotani';
    if (payload.bridgeProvider) return payload.bridgeProvider;
    return 'unknown';
  }

  /**
   * Verify webhook signature
   */
  async verifyWebhookSignature(payload: any, signature: string): Promise<boolean> {
    if (!this.webhookSecret) {
      return true; // No secret configured, skip verification
    }

    // In a real implementation, verify HMAC signature
    // const crypto = await import('crypto');
    // const expectedSignature = crypto
    //   .createHmac('sha256', this.webhookSecret)
    //   .update(JSON.stringify(payload))
    //   .digest('hex');
    // return signature === expectedSignature;

    // For now, return true (implement based on provider spec)
    return true;
  }

  /**
   * Sanitize payload for logging
   */
  private sanitizePayload(payload: any): any {
    const sanitized = { ...payload };
    
    // Remove signature from logged payload
    if (sanitized.signature) {
      sanitized.signature = '[REDACTED]';
    }
    
    return sanitized;
  }
}

// ==================== Factory Function ====================

export function createMpesaCryptoBridgeWebhookHandler(
  logger: ILogger,
  eventEmitter: PaymentEventEmitter,
  webhookSecret?: string
): MpesaCryptoBridgeWebhookHandler {
  return new MpesaCryptoBridgeWebhookHandler(logger, eventEmitter, webhookSecret);
}
