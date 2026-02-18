/**
 * Bitcoin Lightning Webhook Handler
 * Handles Lightning Network payment notifications
 */

import { 
  Transaction, 
  TransactionStatus,
  Money,
  Customer,
} from '../../types/index.js';
import { ILogger } from '../../utils/structured-logger.js';
import { 
  PaymentEventEmitter, 
  PaymentEventData,
  createEventId 
} from '../events.js';

// ==================== Lightning Webhook Types ====================

export interface LightningInvoiceSettledEvent {
  event: 'invoice.settled';
  data: {
    payment_hash: string;
    payment_request: string;
    amount_sat: number;
    amount_msat: number;
    settled_at: string;
    preimage: string;
    memo?: string;
  };
  node_id: string;
  timestamp: string;
}

export interface LightningPaymentSentEvent {
  event: 'payment.sent';
  data: {
    payment_hash: string;
    payment_request: string;
    amount_sat: number;
    fee_sat: number;
    destination: string;
    status: 'succeeded' | 'failed';
    failure_reason?: string;
  };
  node_id: string;
  timestamp: string;
}

export interface LndInvoiceEvent {
  result?: {
    memo?: string;
    r_preimage?: string;
    r_hash?: string;
    value?: string;
    value_msat?: string;
    settled?: boolean;
    settlement_date?: string;
    payment_request?: string;
    state?: 'OPEN' | 'SETTLED' | 'CANCELLED' | 'ACCEPTED';
    amt_paid_sat?: string;
    amt_paid_msat?: string;
  };
}

// ==================== Handler Class ====================

export class BitcoinLightningWebhookHandler {
  private logger: ILogger;
  private eventEmitter: PaymentEventEmitter;

  constructor(
    logger: ILogger,
    eventEmitter: PaymentEventEmitter
  ) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
  }

  /**
   * Handle incoming Lightning webhook
   */
  async handleWebhook(
    payload: any,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ success: boolean; message: string; transaction?: Transaction }> {
    const eventId = createEventId('bitcoin_lightning');
    const receivedAt = new Date();

    try {
      this.logger.debug(`Lightning webhook received [${eventId}]: ${JSON.stringify(payload)}`);

      // Detect event type
      const eventType = this.detectEventType(payload);

      // Emit webhook received event
      this.eventEmitter.emitWebhookReceived({
        id: eventId,
        provider: 'bitcoin_lightning',
        eventType,
        payload: this.sanitizePayload(payload),
        receivedAt,
      });

      // Route to specific handler
      if (payload.event === 'invoice.settled' || payload.result?.settled === true) {
        return this.handleInvoiceSettled(payload as LightningInvoiceSettledEvent | LndInvoiceEvent, eventId);
      }

      if (payload.event === 'payment.sent' || payload.status) {
        return this.handlePaymentSent(payload as LightningPaymentSentEvent, eventId);
      }

      return { success: false, message: 'Unknown Lightning webhook type' };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Lightning webhook handling error [${eventId}]: ${errorMessage}`);
      this.eventEmitter.emitWebhookError('bitcoin_lightning', errorMessage, payload);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Handle invoice settled event (payment received)
   */
  private handleInvoiceSettled(
    payload: LightningInvoiceSettledEvent | LndInvoiceEvent,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing Lightning invoice settlement [${eventId}]`);

    let paymentHash: string;
    let amountSat: number;
    let amountMsat: number;
    let paymentRequest: string;
    let settledAt: Date;
    let memo: string | undefined;
    let preimage: string | undefined;

    if ('data' in payload) {
      // Generic webhook format
      const data = payload.data;
      paymentHash = data.payment_hash;
      amountSat = data.amount_sat;
      amountMsat = data.amount_msat;
      paymentRequest = data.payment_request;
      settledAt = new Date(data.settled_at);
      memo = data.memo;
      preimage = data.preimage;
    } else {
      // LND streaming format
      const result = payload.result!;
      paymentHash = Buffer.from(result.r_hash || '', 'base64').toString('hex');
      amountSat = parseInt(result.amt_paid_sat || result.value || '0', 10);
      amountMsat = parseInt(result.amt_paid_msat || result.value_msat || '0', 10);
      paymentRequest = result.payment_request || '';
      settledAt = result.settlement_date 
        ? new Date(parseInt(result.settlement_date, 10) * 1000)
        : new Date();
      memo = result.memo;
      preimage = result.r_preimage ? Buffer.from(result.r_preimage, 'base64').toString('hex') : undefined;
    }

    const amount: Money = {
      amount: amountSat / 100_000_000, // Convert satoshis to BTC
      currency: 'BTC',
    };

    const transaction: Transaction = {
      id: `btc_lightning_invoice_${paymentHash}`,
      providerTransactionId: paymentHash,
      provider: 'bitcoin_lightning',
      status: 'completed',
      amount,
      customer: {}, // No customer info in Lightning invoices by default
      description: memo || 'Lightning payment received',
      metadata: {
        paymentRequest,
        preimage,
        amountMsat,
        settledAt: settledAt.toISOString(),
        eventId,
      },
      createdAt: settledAt,
      updatedAt: new Date(),
      completedAt: settledAt,
    };

    // Emit payment success event
    this.eventEmitter.emitPaymentEvent('payment.success', {
      provider: 'bitcoin_lightning',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: `Lightning invoice settled: ${amountSat} satoshis`,
      transaction,
    };
  }

  /**
   * Handle payment sent event (outgoing payment)
   */
  private handlePaymentSent(
    payload: LightningPaymentSentEvent,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing Lightning payment sent [${eventId}]: ${payload.data.payment_hash}`);

    const data = payload.data;
    const isSuccess = data.status === 'succeeded';

    const amount: Money = {
      amount: data.amount_sat / 100_000_000,
      currency: 'BTC',
    };

    const customer: Customer = {
      name: `Node: ${data.destination.slice(0, 20)}...`,
    };

    const transaction: Transaction = {
      id: `btc_lightning_payment_${data.payment_hash}`,
      providerTransactionId: data.payment_hash,
      provider: 'bitcoin_lightning',
      status: isSuccess ? 'completed' : 'failed',
      amount,
      customer,
      description: `Lightning payment to ${data.destination.slice(0, 20)}...`,
      metadata: {
        paymentRequest: data.payment_request,
        destination: data.destination,
        feeSat: data.fee_sat,
        failureReason: data.failure_reason,
        eventId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: isSuccess ? new Date() : undefined,
      failureReason: isSuccess ? undefined : data.failure_reason,
    };

    // Emit transfer event
    const eventType = isSuccess ? 'transfer.success' : 'transfer.failed';
    this.eventEmitter.emitPaymentEvent(eventType, {
      provider: 'bitcoin_lightning',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: isSuccess ? 'Lightning payment sent' : `Payment failed: ${data.failure_reason}`,
      transaction,
    };
  }

  /**
   * Detect event type from payload
   */
  private detectEventType(payload: any): string {
    if (payload.event) return payload.event;
    if (payload.result?.settled === true) return 'invoice.settled';
    if (payload.result?.state === 'SETTLED') return 'invoice.settled';
    if (payload.status) return 'payment.sent';
    return 'unknown';
  }

  /**
   * Sanitize payload for logging (remove sensitive data)
   */
  private sanitizePayload(payload: any): any {
    const sanitized = { ...payload };
    
    // Remove any sensitive fields
    if (sanitized.preimage) {
      sanitized.preimage = '[REDACTED]';
    }
    if (sanitized.data?.preimage) {
      sanitized.data.preimage = '[REDACTED]';
    }
    
    return sanitized;
  }
}

// ==================== Factory Function ====================

export function createBitcoinLightningWebhookHandler(
  logger: ILogger,
  eventEmitter: PaymentEventEmitter
): BitcoinLightningWebhookHandler {
  return new BitcoinLightningWebhookHandler(logger, eventEmitter);
}
