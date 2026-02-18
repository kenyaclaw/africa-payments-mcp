/**
 * USDC on Stellar Webhook Handler
 * Handles Stellar payment notifications and anchor callbacks
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

// ==================== Stellar Webhook Types ====================

export interface StellarPaymentEvent {
  type: 'payment';
  id: string;
  paging_token: string;
  source_account: string;
  created_at: string;
  transaction_hash: string;
  transaction_successful: boolean;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  from: string;
  to: string;
  amount: string;
}

export interface AnchorTransactionEvent {
  eventType: 'transaction.created' | 'transaction.status_changed' | 'transaction.error';
  transaction: {
    id: string;
    kind: 'deposit' | 'withdrawal' | 'send';
    status: string;
    status_eta?: number;
    amount_in?: string;
    amount_out?: string;
    amount_fee?: string;
    started_at: string;
    completed_at?: string;
    stellar_transaction_id?: string;
    external_transaction_id?: string;
    message?: string;
    refunds?: Array<{
      id: string;
      amount: string;
      reason: string;
    }>;
    more_info_url?: string;
  };
}

export interface StellarEffectEvent {
  type: string;
  id: string;
  paging_token: string;
  account: string;
  created_at: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
}

// ==================== Handler Class ====================

export class UsdcStellarWebhookHandler {
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
   * Handle incoming Stellar webhook
   */
  async handleWebhook(
    payload: any,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ success: boolean; message: string; transaction?: Transaction }> {
    const eventId = createEventId('usdc_stellar');
    const receivedAt = new Date();

    try {
      this.logger.debug(`Stellar webhook received [${eventId}]: ${JSON.stringify(payload)}`);

      // Detect event type
      const eventType = this.detectEventType(payload);

      // Emit webhook received event
      this.eventEmitter.emitWebhookReceived({
        id: eventId,
        provider: 'usdc_stellar',
        eventType,
        payload: this.sanitizePayload(payload),
        receivedAt,
      });

      // Route to specific handler
      if (payload.type === 'payment' || payload.transaction_hash) {
        return this.handlePaymentEvent(payload as StellarPaymentEvent, eventId);
      }

      if (payload.eventType && payload.transaction) {
        return this.handleAnchorEvent(payload as AnchorTransactionEvent, eventId);
      }

      return { success: false, message: 'Unknown Stellar webhook type' };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Stellar webhook handling error [${eventId}]: ${errorMessage}`);
      this.eventEmitter.emitWebhookError('usdc_stellar', errorMessage, payload);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Handle Stellar payment operation event
   */
  private handlePaymentEvent(
    payload: StellarPaymentEvent,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing Stellar payment [${eventId}]: ${payload.id}`);

    const isSuccess = payload.transaction_successful !== false;
    const status: TransactionStatus = isSuccess ? 'completed' : 'failed';

    const amount: Money = {
      amount: parseFloat(payload.amount),
      currency: payload.asset_code || 'XLM',
    };

    const customer: Customer = {
      name: payload.from,
    };

    const transaction: Transaction = {
      id: `stellar_payment_${payload.id}`,
      providerTransactionId: payload.transaction_hash,
      provider: 'usdc_stellar',
      status,
      amount,
      customer,
      description: `Stellar ${payload.asset_code || 'XLM'} payment`,
      metadata: {
        operationId: payload.id,
        sourceAccount: payload.source_account,
        from: payload.from,
        to: payload.to,
        assetType: payload.asset_type,
        assetIssuer: payload.asset_issuer,
        eventId,
        blockExplorerUrl: `https://stellar.expert/explorer/public/tx/${payload.transaction_hash}`,
      },
      createdAt: new Date(payload.created_at),
      updatedAt: new Date(),
      completedAt: isSuccess ? new Date(payload.created_at) : undefined,
    };

    // Determine if this is incoming or outgoing
    const isIncoming = true; // In real implementation, compare 'to' with our address

    if (isIncoming && isSuccess) {
      this.eventEmitter.emitPaymentEvent('payment.success', {
        provider: 'usdc_stellar',
        transaction,
        rawPayload: payload,
        receivedAt: new Date(),
      });
    } else if (!isIncoming) {
      const eventType = isSuccess ? 'transfer.success' : 'transfer.failed';
      this.eventEmitter.emitPaymentEvent(eventType, {
        provider: 'usdc_stellar',
        transaction,
        rawPayload: payload,
        receivedAt: new Date(),
      });
    }

    return {
      success: true,
      message: `Stellar payment ${isSuccess ? 'confirmed' : 'failed'}: ${payload.amount} ${payload.asset_code || 'XLM'}`,
      transaction,
    };
  }

  /**
   * Handle anchor transaction event (SEP-6/24)
   */
  private handleAnchorEvent(
    payload: AnchorTransactionEvent,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    const anchorTx = payload.transaction;
    this.logger.info(`Processing anchor event [${eventId}]: ${anchorTx.id} - ${anchorTx.status}`);

    const status = this.mapAnchorStatus(anchorTx.status);
    const isFinal = status === 'completed' || status === 'failed' || status === 'refunded';

    const amount: Money = {
      amount: parseFloat(anchorTx.amount_in || '0'),
      currency: 'USDC',
    };

    const transaction: Transaction = {
      id: `stellar_anchor_${anchorTx.id}`,
      providerTransactionId: anchorTx.id,
      provider: 'usdc_stellar',
      status,
      amount,
      customer: {},
      description: `Anchor ${anchorTx.kind}: ${anchorTx.status}`,
      metadata: {
        kind: anchorTx.kind,
        stellarTransactionId: anchorTx.stellar_transaction_id,
        externalTransactionId: anchorTx.external_transaction_id,
        amountOut: anchorTx.amount_out,
        amountFee: anchorTx.amount_fee,
        message: anchorTx.message,
        refunds: anchorTx.refunds,
        moreInfoUrl: anchorTx.more_info_url,
        eventId,
        blockExplorerUrl: anchorTx.stellar_transaction_id 
          ? `https://stellar.expert/explorer/public/tx/${anchorTx.stellar_transaction_id}`
          : undefined,
      },
      createdAt: new Date(anchorTx.started_at),
      updatedAt: new Date(),
      completedAt: anchorTx.completed_at ? new Date(anchorTx.completed_at) : undefined,
      failureReason: status === 'failed' ? anchorTx.message : undefined,
    };

    // Emit appropriate event
    if (status === 'completed') {
      const eventType = anchorTx.kind === 'deposit' ? 'payment.success' : 'transfer.success';
      this.eventEmitter.emitPaymentEvent(eventType, {
        provider: 'usdc_stellar',
        transaction,
        rawPayload: payload,
        receivedAt: new Date(),
      });
    } else if (status === 'failed') {
      const eventType = anchorTx.kind === 'deposit' ? 'payment.failed' : 'transfer.failed';
      this.eventEmitter.emitPaymentEvent(eventType, {
        provider: 'usdc_stellar',
        transaction,
        rawPayload: payload,
        receivedAt: new Date(),
      });
    }

    return {
      success: true,
      message: `Anchor transaction ${anchorTx.status}: ${anchorTx.id}`,
      transaction,
    };
  }

  /**
   * Map anchor status to transaction status
   */
  private mapAnchorStatus(anchorStatus: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'pending_user_transfer_start': 'pending',
      'pending_user_transfer_complete': 'processing',
      'pending_external': 'processing',
      'pending_anchor': 'processing',
      'pending_stellar': 'processing',
      'pending_transaction': 'processing',
      'pending_trust': 'pending',
      'completed': 'completed',
      'error': 'failed',
      'refunded': 'refunded',
    };
    return statusMap[anchorStatus.toLowerCase()] || 'pending';
  }

  /**
   * Detect event type from payload
   */
  private detectEventType(payload: any): string {
    if (payload.type === 'payment') return 'stellar_payment';
    if (payload.eventType) return payload.eventType;
    if (payload.transaction_hash) return 'stellar_operation';
    return 'unknown';
  }

  /**
   * Sanitize payload for logging
   */
  private sanitizePayload(payload: any): any {
    // Stellar webhooks don't typically contain sensitive data
    // but we can redact large payloads
    if (JSON.stringify(payload).length > 10000) {
      return { ...payload, _truncated: true };
    }
    return payload;
  }
}

// ==================== Factory Function ====================

export function createUsdcStellarWebhookHandler(
  logger: ILogger,
  eventEmitter: PaymentEventEmitter
): UsdcStellarWebhookHandler {
  return new UsdcStellarWebhookHandler(logger, eventEmitter);
}
