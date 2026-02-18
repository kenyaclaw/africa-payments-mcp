/**
 * IntaSend Webhook Handler
 * Handles payment and payout notifications
 */

import { 
  Transaction, 
  TransactionStatus,
  Money,
  Customer,
  PhoneNumber 
} from '../../types/index.js';
import { Logger } from '../../utils/logger.js';
import { 
  PaymentEventEmitter, 
  createEventId 
} from '../events.js';
import { WebhookVerifier } from '../verifier.js';

// ==================== IntaSend Webhook Types ====================

export type IntaSendEventType = 
  | 'payment.success'
  | 'payment.failed'
  | 'payment.pending'
  | 'payout.completed'
  | 'payout.failed'
  | 'payout.processing'
  | 'invoice.paid'
  | 'invoice.failed'
  | 'refund.processed';

export interface IntaSendPaymentNotification {
  invoice_id: string;
  state: 'COMPLETE' | 'FAILED' | 'PENDING' | 'PROCESSING';
  provider: 'M-PESA' | 'T-KASH' | 'AIRTEL' | 'MTN' | 'CARD' | 'BANK';
  charges: number;
  net_amount: number;
  currency: string;
  value: number;
  account: string;
  api_ref?: string;
  clearing_status?: 'Cleared' | 'Pending';
  failed_reason?: string | null;
  failed_code?: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntaSendPayoutNotification {
  transaction_id: string;
  status: 'Completed' | 'Failed' | 'Processing' | 'Queued';
  provider: string;
  amount: number;
  currency: string;
  account: string;
  name?: string;
  narration?: string;
  reference?: string;
  created_at: string;
  updated_at: string;
  failed_reason?: string;
}

export interface IntaSendRefundNotification {
  refund_id: string;
  original_invoice_id: string;
  status: 'Completed' | 'Failed' | 'Processing';
  amount: number;
  currency: string;
  reason?: string;
  created_at: string;
  updated_at: string;
}

export interface IntaSendWalletNotification {
  wallet_id: string;
  transaction_type: 'credit' | 'debit';
  amount: number;
  currency: string;
  description?: string;
  balance_after: number;
  created_at: string;
}

// ==================== Handler Class ====================

export class IntaSendWebhookHandler {
  private logger: Logger;
  private eventEmitter: PaymentEventEmitter;
  private verifier: WebhookVerifier;
  private webhookSecret?: string;

  constructor(
    logger: Logger,
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
   * Handle incoming IntaSend webhook
   */
  async handleWebhook(
    payload: any,
    signature: string | undefined
  ): Promise<{ success: boolean; message: string; transaction?: Transaction }> {
    const eventId = createEventId('intasend');
    const receivedAt = new Date();

    try {
      // Log raw webhook for debugging
      this.logger.debug(`IntaSend webhook received [${eventId}]: ${JSON.stringify(this.verifier.sanitizePayload(payload))}`);

      // Determine webhook type
      const webhookType = this.detectWebhookType(payload);

      // Emit webhook received event
      this.eventEmitter.emitWebhookReceived({
        id: eventId,
        provider: 'intasend',
        eventType: webhookType,
        payload: this.verifier.sanitizePayload(payload),
        signature: signature || undefined,
        receivedAt,
      });

      // Verify signature if secret is configured
      if (this.webhookSecret && signature) {
        const verification = this.verifier.verifyIntasendWebhook(payload, signature, this.webhookSecret);
        if (!verification.valid) {
          this.eventEmitter.emitWebhookError('intasend', verification.error || 'Invalid signature', payload, signature);
          return { success: false, message: verification.error || 'Invalid signature' };
        }
        this.logger.debug(`IntaSend signature verified [${eventId}]`);
      } else if (this.webhookSecret) {
        this.logger.warn(`IntaSend webhook secret configured but no signature provided [${eventId}]`);
      }

      // Route to specific handler
      switch (webhookType) {
        case 'payment':
          return this.handlePaymentNotification(payload as IntaSendPaymentNotification, eventId);
        
        case 'payout':
          return this.handlePayoutNotification(payload as IntaSendPayoutNotification, eventId);
        
        case 'refund':
          return this.handleRefundNotification(payload as IntaSendRefundNotification, eventId);
        
        case 'wallet':
          return this.handleWalletNotification(payload as IntaSendWalletNotification, eventId);
        
        default:
          this.logger.warn(`Unknown IntaSend webhook type [${eventId}]`);
          return { success: false, message: 'Unknown webhook type' };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`IntaSend webhook handling error [${eventId}]: ${errorMessage}`);
      this.eventEmitter.emitWebhookError('intasend', errorMessage, payload, signature);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Handle Payment notification
   */
  private handlePaymentNotification(
    data: IntaSendPaymentNotification,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing IntaSend Payment [${eventId}]: ${data.invoice_id}`);

    const status = this.mapPaymentStatus(data.state);
    const isSuccess = status === 'completed';

    // Parse customer phone from account
    const phone = this.parsePhoneNumber(data.account);

    const transaction: Transaction = {
      id: `intasend_payment_${data.invoice_id}`,
      providerTransactionId: data.invoice_id,
      provider: 'intasend',
      status,
      amount: {
        amount: data.value,
        currency: data.currency,
      },
      customer: {
        phone,
        name: data.account, // Account can be name or phone
      },
      description: `Payment via ${data.provider}`,
      metadata: {
        provider: data.provider,
        charges: data.charges,
        netAmount: data.net_amount,
        apiRef: data.api_ref,
        clearingStatus: data.clearing_status,
        failedReason: data.failed_reason,
        failedCode: data.failed_code,
        eventId,
      },
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      completedAt: isSuccess ? new Date(data.updated_at) : undefined,
      failureReason: data.failed_reason || undefined,
    };

    // Emit appropriate event
    const eventType = isSuccess ? 'payment.success' : 
                      status === 'failed' ? 'payment.failed' : 'payment.pending';
    
    this.eventEmitter.emitPaymentEvent(eventType, {
      provider: 'intasend',
      transaction,
      rawPayload: data,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: isSuccess ? 'Payment successful' : `Payment ${data.state}`,
      transaction,
    };
  }

  /**
   * Handle Payout notification
   */
  private handlePayoutNotification(
    data: IntaSendPayoutNotification,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing IntaSend Payout [${eventId}]: ${data.transaction_id}`);

    const status = this.mapPayoutStatus(data.status);
    const isSuccess = status === 'completed';

    // Parse recipient phone from account
    const phone = this.parsePhoneNumber(data.account);

    const transaction: Transaction = {
      id: `intasend_payout_${data.transaction_id}`,
      providerTransactionId: data.transaction_id,
      provider: 'intasend',
      status,
      amount: {
        amount: data.amount,
        currency: data.currency,
      },
      customer: {
        phone,
        name: data.name || data.account,
      },
      description: data.narration || `Payout via ${data.provider}`,
      metadata: {
        provider: data.provider,
        reference: data.reference,
        failedReason: data.failed_reason,
        eventId,
      },
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      completedAt: isSuccess ? new Date(data.updated_at) : undefined,
      failureReason: data.failed_reason,
    };

    // Emit appropriate event
    const eventType = isSuccess ? 'transfer.success' : 
                      status === 'failed' ? 'transfer.failed' : 'transfer.success';
    
    this.eventEmitter.emitPaymentEvent(eventType, {
      provider: 'intasend',
      transaction,
      rawPayload: data,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: isSuccess ? 'Payout successful' : `Payout ${data.status}`,
      transaction,
    };
  }

  /**
   * Handle Refund notification
   */
  private handleRefundNotification(
    data: IntaSendRefundNotification,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing IntaSend Refund [${eventId}]: ${data.refund_id}`);

    const status = this.mapPayoutStatus(data.status);
    const isSuccess = status === 'completed';

    const transaction: Transaction = {
      id: `intasend_refund_${data.refund_id}`,
      providerTransactionId: data.original_invoice_id,
      provider: 'intasend',
      status: 'refunded',
      amount: {
        amount: data.amount,
        currency: data.currency,
      },
      customer: {},
      description: data.reason || 'Refund processed',
      metadata: {
        refundId: data.refund_id,
        originalInvoiceId: data.original_invoice_id,
        refundStatus: data.status,
        eventId,
      },
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      completedAt: isSuccess ? new Date(data.updated_at) : undefined,
    };

    // Emit refund event
    this.eventEmitter.emitPaymentEvent('refund.processed', {
      provider: 'intasend',
      transaction,
      rawPayload: data,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: isSuccess ? 'Refund processed' : `Refund ${data.status}`,
      transaction,
    };
  }

  /**
   * Handle Wallet notification (balance updates)
   */
  private handleWalletNotification(
    data: IntaSendWalletNotification,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing IntaSend Wallet Update [${eventId}]: ${data.wallet_id}`);

    // Wallet notifications are informational, create a transaction record for tracking
    const transaction: Transaction = {
      id: `intasend_wallet_${data.wallet_id}_${Date.now()}`,
      providerTransactionId: data.wallet_id,
      provider: 'intasend',
      status: 'completed',
      amount: {
        amount: data.amount,
        currency: data.currency,
      },
      customer: {},
      description: data.description || `Wallet ${data.transaction_type}`,
      metadata: {
        walletId: data.wallet_id,
        transactionType: data.transaction_type,
        balanceAfter: data.balance_after,
        eventId,
      },
      createdAt: new Date(data.created_at),
      updatedAt: new Date(),
      completedAt: new Date(data.created_at),
    };

    // Emit payment event based on transaction type
    const eventType = data.transaction_type === 'credit' ? 'payment.success' : 'transfer.success';
    
    this.eventEmitter.emitPaymentEvent(eventType, {
      provider: 'intasend',
      transaction,
      rawPayload: data,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: `Wallet ${data.transaction_type} processed`,
      transaction,
    };
  }

  // ==================== Helper Methods ====================

  /**
   * Detect webhook type from payload
   */
  private detectWebhookType(payload: any): string {
    if (payload.invoice_id && payload.state) {
      return 'payment';
    }
    if (payload.transaction_id && payload.status) {
      return 'payout';
    }
    if (payload.refund_id) {
      return 'refund';
    }
    if (payload.wallet_id && payload.transaction_type) {
      return 'wallet';
    }
    return 'unknown';
  }

  /**
   * Map IntaSend payment status to TransactionStatus
   */
  private mapPaymentStatus(state: string): TransactionStatus {
    switch (state.toUpperCase()) {
      case 'COMPLETE':
        return 'completed';
      case 'FAILED':
        return 'failed';
      case 'PENDING':
        return 'pending';
      case 'PROCESSING':
        return 'processing';
      default:
        return 'pending';
    }
  }

  /**
   * Map IntaSend payout status to TransactionStatus
   */
  private mapPayoutStatus(status: string): TransactionStatus {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'processing':
      case 'queued':
        return 'processing';
      default:
        return 'pending';
    }
  }

  /**
   * Parse phone number from account string
   * IntaSend account can be phone number, bank account, or name
   */
  private parsePhoneNumber(account: string): PhoneNumber | undefined {
    // Check if it looks like a phone number
    const cleanAccount = account.replace(/\s/g, '').replace(/^\+/, '');
    
    // Simple heuristic: if it's all digits and 9-12 digits long, treat as phone
    if (/^\d{9,12}$/.test(cleanAccount)) {
      let countryCode = '';
      let nationalNumber = '';

      if (cleanAccount.startsWith('254')) {
        countryCode = '254';
        nationalNumber = cleanAccount.substring(3);
      } else if (cleanAccount.startsWith('255')) {
        // Tanzania
        countryCode = '255';
        nationalNumber = cleanAccount.substring(3);
      } else if (cleanAccount.startsWith('256')) {
        // Uganda
        countryCode = '256';
        nationalNumber = cleanAccount.substring(3);
      } else if (cleanAccount.startsWith('234')) {
        // Nigeria
        countryCode = '234';
        nationalNumber = cleanAccount.substring(3);
      } else if (cleanAccount.startsWith('233')) {
        // Ghana
        countryCode = '233';
        nationalNumber = cleanAccount.substring(3);
      } else {
        // Assume Kenyan number if starts with 07 or 7
        if (cleanAccount.startsWith('07') || cleanAccount.startsWith('7')) {
          countryCode = '254';
          nationalNumber = cleanAccount.startsWith('07') ? cleanAccount.substring(1) : cleanAccount;
        } else {
          return undefined;
        }
      }

      return {
        countryCode,
        nationalNumber,
        formatted: `+${countryCode}${nationalNumber}`,
      };
    }

    return undefined;
  }
}

// ==================== Factory Function ====================

export function createIntaSendWebhookHandler(
  logger: Logger,
  eventEmitter: PaymentEventEmitter,
  verifier: WebhookVerifier,
  webhookSecret?: string
): IntaSendWebhookHandler {
  return new IntaSendWebhookHandler(logger, eventEmitter, verifier, webhookSecret);
}
