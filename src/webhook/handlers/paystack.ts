/**
 * Paystack Webhook Handler
 * Handles charge.success, transfer.success, refund.processed events
 */

import { 
  Transaction, 
  TransactionStatus,
  Money,
  Customer,
  PhoneNumber 
} from '../../types/index.js';
import { StructuredLogger } from '../../utils/structured-logger.js';
import { 
  PaymentEventEmitter, 
  PaymentEventData,
  createEventId 
} from '../events.js';
import { WebhookVerifier } from '../verifier.js';

// ==================== Paystack Webhook Types ====================

export type PaystackEventType = 
  | 'charge.success'
  | 'charge.failed'
  | 'charge.pending'
  | 'transfer.success'
  | 'transfer.failed'
  | 'transfer.reversed'
  | 'refund.processed'
  | 'refund.pending'
  | 'paymentrequest.success'
  | 'paymentrequest.failed'
  | 'invoice.create'
  | 'invoice.update'
  | 'subscription.create'
  | 'subscription.disable'
  | 'subscription.enable';

export interface PaystackWebhookPayload {
  event: PaystackEventType;
  data: PaystackChargeData | PaystackTransferData | PaystackRefundData;
}

export interface PaystackChargeData {
  id: number;
  domain: string;
  status: string;
  reference: string;
  amount: number;
  message?: string;
  gateway_response: string;
  paid_at: string;
  created_at: string;
  channel: string;
  currency: string;
  ip_address?: string;
  metadata: Record<string, any>;
  log?: any;
  fees: number;
  fees_split?: any;
  authorization: {
    authorization_code: string;
    bin: string;
    last4: string;
    exp_month: string;
    exp_year: string;
    channel: string;
    card_type: string;
    bank: string;
    country_code: string;
    brand: string;
    reusable: boolean;
    signature?: string;
    account_name?: string;
  };
  customer: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    customer_code: string;
    phone: string;
    metadata?: Record<string, any>;
    risk_action: string;
  };
  plan?: any;
  subaccount?: any;
  split?: any;
  order_id?: string;
  paidAt: string;
  createdAt: string;
  requested_amount: number;
}

export interface PaystackTransferData {
  id: number;
  domain: string;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  source: string;
  source_details?: any;
  reason: string;
  recipient: {
    id: number;
    domain: string;
    type: string;
    currency: string;
    name: string;
    details: {
      account_number: string;
      account_name?: string;
      bank_code: string;
      bank_name: string;
    };
    description: string;
    metadata?: Record<string, any>;
    recipient_code: string;
  };
  created_at: string;
  updated_at: string;
  transferred_at?: string;
}

export interface PaystackRefundData {
  id: number;
  transaction: {
    id: number;
    reference: string;
    domain: string;
    amount: number;
    currency: string;
  };
  amount: number;
  currency: string;
  status: string;
  refunded_by: string;
  refunded_at?: string;
  expected_at?: string;
  reason?: string;
  created_at: string;
  updated_at: string;
}

// ==================== Handler Class ====================

export class PaystackWebhookHandler {
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
   * Handle incoming Paystack webhook
   */
  async handleWebhook(
    payload: PaystackWebhookPayload,
    signature: string | undefined,
    rawBody?: string
  ): Promise<{ success: boolean; message: string; transaction?: Transaction }> {
    const eventId = createEventId('paystack');
    const receivedAt = new Date();

    try {
      // Log raw webhook for debugging
      this.logger.debug(`Paystack webhook received [${eventId}]: ${JSON.stringify(this.verifier.sanitizePayload(payload))}`);

      // Emit webhook received event
      this.eventEmitter.emitWebhookReceived({
        id: eventId,
        provider: 'paystack',
        eventType: payload.event,
        payload: this.verifier.sanitizePayload(payload),
        signature: signature || undefined,
        receivedAt,
      });

      // Verify signature
      if (this.webhookSecret) {
        const isValid = rawBody 
          ? this.verifier.verifyPaystackSignature(rawBody, signature || '', this.webhookSecret)
          : this.verifier.verifyPaystackWebhook(payload, signature || '', this.webhookSecret).valid;

        if (!isValid) {
          const error = 'Invalid webhook signature';
          this.eventEmitter.emitWebhookError('paystack', error, payload, signature);
          return { success: false, message: error };
        }

        this.logger.debug(`Paystack signature verified [${eventId}]`);
      } else {
        this.logger.warn(`Paystack webhook secret not configured, skipping signature verification [${eventId}]`);
      }

      // Validate payload structure
      if (!payload.event || !payload.data) {
        const error = 'Invalid webhook payload: missing event or data';
        this.eventEmitter.emitWebhookError('paystack', error, payload, signature);
        return { success: false, message: error };
      }

      // Route to specific handler based on event type
      switch (payload.event) {
        case 'charge.success':
          return this.handleChargeSuccess(payload.data as PaystackChargeData, eventId);
        
        case 'charge.failed':
          return this.handleChargeFailed(payload.data as PaystackChargeData, eventId);
        
        case 'transfer.success':
          return this.handleTransferSuccess(payload.data as PaystackTransferData, eventId);
        
        case 'transfer.failed':
          return this.handleTransferFailed(payload.data as PaystackTransferData, eventId);
        
        case 'transfer.reversed':
          return this.handleTransferReversed(payload.data as PaystackTransferData, eventId);
        
        case 'refund.processed':
          return this.handleRefundProcessed(payload.data as PaystackRefundData, eventId);
        
        case 'paymentrequest.success':
        case 'paymentrequest.failed':
          // Payment request (Paystack Terminal, etc.)
          this.logger.info(`Paystack payment request event [${eventId}]: ${payload.event}`);
          return { success: true, message: `Payment request ${payload.event.split('.')[1]}` };
        
        case 'subscription.create':
        case 'subscription.disable':
        case 'subscription.enable':
          // Subscription events - could be extended
          this.logger.info(`Paystack subscription event [${eventId}]: ${payload.event}`);
          return { success: true, message: `Subscription ${payload.event.split('.')[1]}` };
        
        default:
          this.logger.warn(`Unhandled Paystack event type [${eventId}]: ${payload.event}`);
          return { success: true, message: `Unhandled event: ${payload.event}` };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Paystack webhook handling error [${eventId}]: ${errorMessage}`);
      this.eventEmitter.emitWebhookError('paystack', errorMessage, payload, signature);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Handle charge.success event
   */
  private handleChargeSuccess(
    data: PaystackChargeData,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing Paystack charge.success [${eventId}]: ${data.reference}`);

    const transaction = this.buildTransactionFromCharge(data, 'completed', eventId);

    // Emit payment success event
    this.eventEmitter.emitPaymentEvent('payment.success', {
      provider: 'paystack',
      transaction,
      rawPayload: data,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: 'Charge successful',
      transaction,
    };
  }

  /**
   * Handle charge.failed event
   */
  private handleChargeFailed(
    data: PaystackChargeData,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing Paystack charge.failed [${eventId}]: ${data.reference}`);

    const transaction = this.buildTransactionFromCharge(data, 'failed', eventId);

    // Emit payment failed event
    this.eventEmitter.emitPaymentEvent('payment.failed', {
      provider: 'paystack',
      transaction,
      rawPayload: data,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: `Charge failed: ${data.gateway_response || data.message || 'Unknown error'}`,
      transaction,
    };
  }

  /**
   * Handle transfer.success event
   */
  private handleTransferSuccess(
    data: PaystackTransferData,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing Paystack transfer.success [${eventId}]: ${data.reference}`);

    const transaction = this.buildTransactionFromTransfer(data, 'completed', eventId);

    // Emit transfer success event
    this.eventEmitter.emitPaymentEvent('transfer.success', {
      provider: 'paystack',
      transaction,
      rawPayload: data,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: 'Transfer successful',
      transaction,
    };
  }

  /**
   * Handle transfer.failed event
   */
  private handleTransferFailed(
    data: PaystackTransferData,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing Paystack transfer.failed [${eventId}]: ${data.reference}`);

    const transaction = this.buildTransactionFromTransfer(data, 'failed', eventId);

    // Emit transfer failed event
    this.eventEmitter.emitPaymentEvent('transfer.failed', {
      provider: 'paystack',
      transaction,
      rawPayload: data,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: `Transfer failed: ${data.reason || 'Unknown error'}`,
      transaction,
    };
  }

  /**
   * Handle transfer.reversed event
   */
  private handleTransferReversed(
    data: PaystackTransferData,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing Paystack transfer.reversed [${eventId}]: ${data.reference}`);

    const transaction = this.buildTransactionFromTransfer(data, 'refunded', eventId);

    // Emit transfer reversed event
    this.eventEmitter.emitPaymentEvent('transfer.reversed', {
      provider: 'paystack',
      transaction,
      rawPayload: data,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: 'Transfer reversed',
      transaction,
    };
  }

  /**
   * Handle refund.processed event
   */
  private handleRefundProcessed(
    data: PaystackRefundData,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing Paystack refund.processed [${eventId}]: ${data.transaction.reference}`);

    const transaction: Transaction = {
      id: `paystack_refund_${data.id}`,
      providerTransactionId: String(data.transaction.id),
      provider: 'paystack',
      status: 'refunded',
      amount: {
        amount: data.amount / 100, // Convert from kobo/cents
        currency: data.currency,
      },
      customer: {
        name: data.refunded_by,
      },
      description: data.reason || 'Refund processed',
      metadata: {
        refundId: data.id,
        originalReference: data.transaction.reference,
        expectedAt: data.expected_at,
        eventId,
      },
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      completedAt: data.refunded_at ? new Date(data.refunded_at) : undefined,
    };

    // Emit refund processed event
    this.eventEmitter.emitPaymentEvent('refund.processed', {
      provider: 'paystack',
      transaction,
      rawPayload: data,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: 'Refund processed',
      transaction,
    };
  }

  // ==================== Helper Methods ====================

  /**
   * Build Transaction from Paystack charge data
   */
  private buildTransactionFromCharge(
    data: PaystackChargeData,
    status: TransactionStatus,
    eventId: string
  ): Transaction {
    // Parse phone number if available
    let phone: PhoneNumber | undefined;
    if (data.customer?.phone) {
      const phoneStr = data.customer.phone.replace(/^\+/, '');
      phone = {
        countryCode: phoneStr.substring(0, 3),
        nationalNumber: phoneStr.substring(3),
        formatted: `+${phoneStr}`,
      };
    }

    return {
      id: `paystack_charge_${data.id}`,
      providerTransactionId: data.reference,
      provider: 'paystack',
      status,
      amount: {
        amount: data.amount / 100, // Convert from kobo/cents
        currency: data.currency,
      },
      customer: {
        id: String(data.customer?.id),
        name: [data.customer?.first_name, data.customer?.last_name].filter(Boolean).join(' '),
        email: data.customer?.email,
        phone,
      },
      description: data.metadata?.description || data.metadata?.reason || `Paystack ${data.channel} payment`,
      metadata: {
        channel: data.channel,
        gatewayResponse: data.gateway_response,
        authorizationCode: data.authorization?.authorization_code,
        cardLast4: data.authorization?.last4,
        cardType: data.authorization?.card_type,
        bank: data.authorization?.bank,
        fees: data.fees / 100,
        ipAddress: data.ip_address,
        eventId,
        ...data.metadata,
      },
      createdAt: new Date(data.created_at),
      updatedAt: new Date(),
      completedAt: status === 'completed' ? new Date(data.paid_at || Date.now()) : undefined,
      failureReason: status === 'failed' ? (data.gateway_response || data.message) : undefined,
    };
  }

  /**
   * Build Transaction from Paystack transfer data
   */
  private buildTransactionFromTransfer(
    data: PaystackTransferData,
    status: TransactionStatus,
    eventId: string
  ): Transaction {
    return {
      id: `paystack_transfer_${data.id}`,
      providerTransactionId: data.reference,
      provider: 'paystack',
      status,
      amount: {
        amount: data.amount / 100, // Convert from kobo/cents
        currency: data.currency,
      },
      customer: {
        name: data.recipient?.name,
        email: data.recipient?.details?.account_name,
      },
      description: data.reason,
      metadata: {
        recipientCode: data.recipient?.recipient_code,
        recipientType: data.recipient?.type,
        accountNumber: data.recipient?.details?.account_number,
        bankCode: data.recipient?.details?.bank_code,
        bankName: data.recipient?.details?.bank_name,
        source: data.source,
        transferredAt: data.transferred_at,
        eventId,
      },
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      completedAt: status === 'completed' && data.transferred_at ? new Date(data.transferred_at) : undefined,
      failureReason: status === 'failed' ? data.reason : undefined,
    };
  }
}

// ==================== Factory Function ====================

export function createPaystackWebhookHandler(
  logger: ILogger,
  eventEmitter: PaymentEventEmitter,
  verifier: WebhookVerifier,
  webhookSecret?: string
): PaystackWebhookHandler {
  return new PaystackWebhookHandler(logger, eventEmitter, verifier, webhookSecret);
}
