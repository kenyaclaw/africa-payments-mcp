/**
 * Celo Webhook Handler
 * Handles Celo blockchain payment notifications
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

// ==================== Celo Webhook Types ====================

export interface CeloTransferEvent {
  event: 'transfer';
  transaction: {
    hash: string;
    from: string;
    to: string;
    value: string;
    gasPrice: string;
    gasUsed: string;
    timestamp: string;
    blockNumber: number;
    status: 'success' | 'failed';
    feeCurrency?: string;
  };
  token?: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  };
}

export interface CeloContractEvent {
  event: string;
  transaction: {
    hash: string;
    from: string;
    to: string;
    timestamp: string;
    blockNumber: number;
    status: 'success' | 'failed';
  };
  returnValues: Record<string, any>;
  address: string;
}

export interface CeloBlockscoutWebhook {
  address: string;
  blockNumber: number;
  transactionHash: string;
  topics: string[];
  data: string;
  timestamp: string;
}

export interface ValoraPaymentNotification {
  type: 'payment_received' | 'payment_sent';
  transactionHash: string;
  amount: string;
  currency: string;
  fromAddress: string;
  toAddress: string;
  timestamp: string;
  comment?: string;
}

// ==================== Handler Class ====================

export class CeloWebhookHandler {
  private logger: ILogger;
  private eventEmitter: PaymentEventEmitter;

  // Known token contracts
  private readonly CUSD_CONTRACT = '0x765DE816845861e75A25fCA122bb6898B8B1282a';
  private readonly CEUR_CONTRACT = '0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73';

  constructor(
    logger: ILogger,
    eventEmitter: PaymentEventEmitter
  ) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
  }

  /**
   * Handle incoming Celo webhook
   */
  async handleWebhook(
    payload: any,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ success: boolean; message: string; transaction?: Transaction }> {
    const eventId = createEventId('celo');
    const receivedAt = new Date();

    try {
      this.logger.debug(`Celo webhook received [${eventId}]: ${JSON.stringify(payload)}`);

      // Detect event type
      const eventType = this.detectEventType(payload);

      // Emit webhook received event
      this.eventEmitter.emitWebhookReceived({
        id: eventId,
        provider: 'celo',
        eventType,
        payload: this.sanitizePayload(payload),
        receivedAt,
      });

      // Route to specific handler
      if (payload.event === 'transfer' || payload.transaction?.value) {
        return this.handleTransferEvent(payload as CeloTransferEvent, eventId);
      }

      if (payload.event && payload.returnValues) {
        return this.handleContractEvent(payload as CeloContractEvent, eventId);
      }

      if (payload.type?.startsWith('payment_')) {
        return this.handleValoraNotification(payload as ValoraPaymentNotification, eventId);
      }

      if (payload.topics && payload.transactionHash) {
        return this.handleBlockscoutEvent(payload as CeloBlockscoutWebhook, eventId);
      }

      return { success: false, message: 'Unknown Celo webhook type' };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Celo webhook handling error [${eventId}]: ${errorMessage}`);
      this.eventEmitter.emitWebhookError('celo', errorMessage, payload);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Handle token transfer event
   */
  private handleTransferEvent(
    payload: CeloTransferEvent,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    const tx = payload.transaction;
    this.logger.info(`Processing Celo transfer [${eventId}]: ${tx.hash}`);

    const isSuccess = tx.status === 'success';
    const token = payload.token;

    // Determine currency and amount
    let currency = 'CELO';
    let decimals = 18;

    if (token) {
      currency = token.symbol;
      decimals = token.decimals;
    } else if (tx.feeCurrency) {
      // Infer from fee currency
      if (tx.feeCurrency.toLowerCase() === this.CUSD_CONTRACT.toLowerCase()) {
        currency = 'cUSD';
      } else if (tx.feeCurrency.toLowerCase() === this.CEUR_CONTRACT.toLowerCase()) {
        currency = 'cEUR';
      }
    }

    const amount: Money = {
      amount: parseFloat(tx.value) / Math.pow(10, decimals),
      currency,
    };

    const customer: Customer = {
      name: tx.from,
    };

    const transaction: Transaction = {
      id: `celo_transfer_${tx.hash}`,
      providerTransactionId: tx.hash,
      provider: 'celo',
      status: isSuccess ? 'completed' : 'failed',
      amount,
      customer,
      description: `${currency} transfer on Celo`,
      metadata: {
        from: tx.from,
        to: tx.to,
        gasPrice: tx.gasPrice,
        gasUsed: tx.gasUsed,
        blockNumber: tx.blockNumber,
        feeCurrency: tx.feeCurrency,
        tokenAddress: token?.address,
        eventId,
        blockExplorerUrl: `https://explorer.celo.org/mainnet/tx/${tx.hash}`,
      },
      createdAt: new Date(tx.timestamp),
      updatedAt: new Date(),
      completedAt: isSuccess ? new Date(tx.timestamp) : undefined,
    };

    // Emit appropriate event
    if (isSuccess) {
      this.eventEmitter.emitPaymentEvent('transfer.success', {
        provider: 'celo',
        transaction,
        rawPayload: payload,
        receivedAt: new Date(),
      });
    } else {
      this.eventEmitter.emitPaymentEvent('transfer.failed', {
        provider: 'celo',
        transaction,
        rawPayload: payload,
        receivedAt: new Date(),
      });
    }

    return {
      success: true,
      message: `Celo transfer ${isSuccess ? 'confirmed' : 'failed'}: ${amount.amount} ${currency}`,
      transaction,
    };
  }

  /**
   * Handle smart contract event
   */
  private handleContractEvent(
    payload: CeloContractEvent,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    const tx = payload.transaction;
    this.logger.info(`Processing Celo contract event [${eventId}]: ${payload.event}`);

    const isSuccess = tx.status === 'success';

    const transaction: Transaction = {
      id: `celo_contract_${tx.hash}`,
      providerTransactionId: tx.hash,
      provider: 'celo',
      status: isSuccess ? 'completed' : 'failed',
      amount: { amount: 0, currency: 'CELO' },
      customer: { name: tx.from },
      description: `Contract event: ${payload.event}`,
      metadata: {
        event: payload.event,
        contractAddress: payload.address,
        returnValues: payload.returnValues,
        blockNumber: tx.blockNumber,
        eventId,
        blockExplorerUrl: `https://explorer.celo.org/mainnet/tx/${tx.hash}`,
      },
      createdAt: new Date(tx.timestamp),
      updatedAt: new Date(),
      completedAt: isSuccess ? new Date(tx.timestamp) : undefined,
    };

    this.eventEmitter.emitPaymentEvent(isSuccess ? 'payment.success' : 'payment.failed', {
      provider: 'celo',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: `Contract event ${payload.event} processed`,
      transaction,
    };
  }

  /**
   * Handle Valora payment notification
   */
  private handleValoraNotification(
    payload: ValoraPaymentNotification,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing Valora notification [${eventId}]: ${payload.type}`);

    const isIncoming = payload.type === 'payment_received';
    const amount: Money = {
      amount: parseFloat(payload.amount),
      currency: payload.currency,
    };

    const customer: Customer = {
      name: isIncoming ? payload.fromAddress : payload.toAddress,
    };

    const transaction: Transaction = {
      id: `celo_valora_${payload.transactionHash}`,
      providerTransactionId: payload.transactionHash,
      provider: 'celo',
      status: 'completed',
      amount,
      customer,
      description: payload.comment || `Valora ${isIncoming ? 'payment received' : 'payment sent'}`,
      metadata: {
        valoraType: payload.type,
        fromAddress: payload.fromAddress,
        toAddress: payload.toAddress,
        comment: payload.comment,
        eventId,
        blockExplorerUrl: `https://explorer.celo.org/mainnet/tx/${payload.transactionHash}`,
      },
      createdAt: new Date(payload.timestamp),
      updatedAt: new Date(),
      completedAt: new Date(payload.timestamp),
    };

    const eventType = isIncoming ? 'payment.success' : 'transfer.success';
    this.eventEmitter.emitPaymentEvent(eventType, {
      provider: 'celo',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: `Valora ${isIncoming ? 'payment received' : 'payment sent'}: ${payload.amount} ${payload.currency}`,
      transaction,
    };
  }

  /**
   * Handle Blockscout webhook (raw event logs)
   */
  private handleBlockscoutEvent(
    payload: CeloBlockscoutWebhook,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing Blockscout event [${eventId}]: ${payload.transactionHash}`);

    const transaction: Transaction = {
      id: `celo_blockscout_${payload.transactionHash}`,
      providerTransactionId: payload.transactionHash,
      provider: 'celo',
      status: 'completed',
      amount: { amount: 0, currency: 'CELO' },
      customer: { name: payload.address },
      description: 'Blockscout event log',
      metadata: {
        address: payload.address,
        blockNumber: payload.blockNumber,
        topics: payload.topics,
        data: payload.data,
        eventId,
        blockExplorerUrl: `https://explorer.celo.org/mainnet/tx/${payload.transactionHash}`,
      },
      createdAt: new Date(payload.timestamp),
      updatedAt: new Date(),
      completedAt: new Date(payload.timestamp),
    };

    this.eventEmitter.emitPaymentEvent('payment.success', {
      provider: 'celo',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: `Blockscout event processed: ${payload.transactionHash}`,
      transaction,
    };
  }

  /**
   * Detect event type from payload
   */
  private detectEventType(payload: any): string {
    if (payload.event) return payload.event;
    if (payload.type?.startsWith('payment_')) return payload.type;
    if (payload.topics) return 'blockscout_log';
    return 'unknown';
  }

  /**
   * Sanitize payload for logging
   */
  private sanitizePayload(payload: any): any {
    // Celo webhooks don't typically contain sensitive data
    return payload;
  }
}

// ==================== Factory Function ====================

export function createCeloWebhookHandler(
  logger: ILogger,
  eventEmitter: PaymentEventEmitter
): CeloWebhookHandler {
  return new CeloWebhookHandler(logger, eventEmitter);
}
