/**
 * MTN MoMo Webhook Handler
 * Handles payment notifications and transfer callbacks
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
  createEventId 
} from '../events.js';
import { WebhookVerifier } from '../verifier.js';

// ==================== MTN MoMo Webhook Types ====================

export interface MTNMoMoPaymentNotification {
  financialTransactionId: string;
  externalId: string;
  amount: string;
  currency: string;
  payer: {
    partyIdType: string;
    partyId: string;
  };
  payerMessage?: string;
  payeeNote?: string;
  status: 'SUCCESSFUL' | 'PENDING' | 'FAILED';
  reason?: string;
}

export interface MTNMoMoRequestToPayNotification {
  amount: string;
  currency: string;
  externalId: string;
  payer: {
    partyIdType: 'MSISDN' | 'EMAIL' | 'PARTY_CODE';
    partyId: string;
  };
  payerMessage?: string;
  payeeNote?: string;
  status: 'SUCCESSFUL' | 'PENDING' | 'FAILED';
  financialTransactionId?: string;
  reason?: string;
}

export interface MTNMoMoTransferNotification {
  amount: string;
  currency: string;
  externalId: string;
  payee: {
    partyIdType: 'MSISDN' | 'EMAIL' | 'PARTY_CODE';
    partyId: string;
  };
  payerMessage?: string;
  payeeNote?: string;
  status: 'SUCCESSFUL' | 'PENDING' | 'FAILED';
  financialTransactionId?: string;
  reason?: string;
}

export interface MTNMoMoCollectionCallback {
  transactionId: string;
  referenceId: string;
  status: 'SUCCESSFUL' | 'PENDING' | 'FAILED';
  amount: string;
  currency: string;
  phoneNumber: string;
  message?: string;
}

// ==================== Handler Class ====================

export class MTNMoMoWebhookHandler {
  private logger: StructuredLogger;
  private eventEmitter: PaymentEventEmitter;
  private verifier: WebhookVerifier;
  private apiKey?: string;

  constructor(
    logger: StructuredLogger,
    eventEmitter: PaymentEventEmitter,
    verifier: WebhookVerifier,
    apiKey?: string
  ) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.verifier = verifier;
    this.apiKey = apiKey;
  }

  /**
   * Handle incoming MTN MoMo webhook
   */
  async handleWebhook(
    payload: any,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ success: boolean; message: string; transaction?: Transaction }> {
    const eventId = createEventId('mtn-momo');
    const receivedAt = new Date();

    try {
      // Log raw webhook for debugging
      this.logger.debug(`MTN MoMo webhook received [${eventId}]: ${JSON.stringify(this.verifier.sanitizePayload(payload))}`);

      // Determine webhook type
      const webhookType = this.detectWebhookType(payload);

      // Emit webhook received event
      this.eventEmitter.emitWebhookReceived({
        id: eventId,
        provider: 'mtn-momo',
        eventType: webhookType,
        payload: this.verifier.sanitizePayload(payload),
        receivedAt,
      });

      // Verify webhook
      const apiKeyFromHeader = this.extractApiKey(headers);
      const verification = this.verifier.verifyMtnMomoWebhook(payload, apiKeyFromHeader, this.apiKey);
      
      if (!verification.valid) {
        this.eventEmitter.emitWebhookError('mtn-momo', verification.error || 'Verification failed', payload);
        return { success: false, message: verification.error || 'Invalid webhook' };
      }

      // Route to specific handler
      switch (webhookType) {
        case 'request_to_pay':
          return this.handleRequestToPayNotification(payload as MTNMoMoRequestToPayNotification, eventId);
        
        case 'payment_notification':
          return this.handlePaymentNotification(payload as MTNMoMoPaymentNotification, eventId);
        
        case 'transfer':
          return this.handleTransferNotification(payload as MTNMoMoTransferNotification, eventId);
        
        case 'collection_callback':
          return this.handleCollectionCallback(payload as MTNMoMoCollectionCallback, eventId);
        
        default:
          this.logger.warn(`Unknown MTN MoMo webhook type [${eventId}]`);
          return { success: false, message: 'Unknown webhook type' };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`MTN MoMo webhook handling error [${eventId}]: ${errorMessage}`);
      this.eventEmitter.emitWebhookError('mtn-momo', errorMessage, payload);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Handle Request to Pay notification (customer payment)
   */
  private handleRequestToPayNotification(
    data: MTNMoMoRequestToPayNotification,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing MTN MoMo Request to Pay [${eventId}]: ${data.externalId}`);

    const status = this.mapStatus(data.status);
    const isSuccess = status === 'completed';

    // Parse payer phone
    const phone = this.parsePartyId(data.payer);

    const transaction: Transaction = {
      id: `mtnmomo_reqpay_${data.externalId}`,
      providerTransactionId: data.financialTransactionId || data.externalId,
      provider: 'mtn-momo',
      status,
      amount: {
        amount: parseFloat(data.amount),
        currency: data.currency,
      },
      customer: {
        phone,
      },
      description: data.payeeNote || data.payerMessage || 'MTN MoMo Payment',
      metadata: {
        externalId: data.externalId,
        partyIdType: data.payer.partyIdType,
        reason: data.reason,
        eventId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: isSuccess ? new Date() : undefined,
      failureReason: !isSuccess ? (data.reason || data.status) : undefined,
    };

    // Emit appropriate event
    const eventType = isSuccess ? 'payment.success' : 
                      status === 'failed' ? 'payment.failed' : 'payment.pending';
    
    this.eventEmitter.emitPaymentEvent(eventType, {
      provider: 'mtn-momo',
      transaction,
      rawPayload: data,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: isSuccess ? 'Payment successful' : `Payment ${data.status}`,
      transaction,
    };
  }

  /**
   * Handle Payment Notification (deposit/transfer received)
   */
  private handlePaymentNotification(
    data: MTNMoMoPaymentNotification,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing MTN MoMo Payment Notification [${eventId}]: ${data.financialTransactionId}`);

    const status = this.mapStatus(data.status);
    const isSuccess = status === 'completed';

    // Parse payer phone
    const phone = this.parsePartyId(data.payer);

    const transaction: Transaction = {
      id: `mtnmomo_payment_${data.financialTransactionId}`,
      providerTransactionId: data.financialTransactionId,
      provider: 'mtn-momo',
      status,
      amount: {
        amount: parseFloat(data.amount),
        currency: data.currency,
      },
      customer: {
        phone,
      },
      description: data.payeeNote || data.payerMessage || 'MTN MoMo Deposit',
      metadata: {
        externalId: data.externalId,
        partyIdType: data.payer.partyIdType,
        reason: data.reason,
        eventId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: isSuccess ? new Date() : undefined,
      failureReason: !isSuccess ? (data.reason || data.status) : undefined,
    };

    // Emit appropriate event
    const eventType = isSuccess ? 'payment.success' : 
                      status === 'failed' ? 'payment.failed' : 'payment.pending';
    
    this.eventEmitter.emitPaymentEvent(eventType, {
      provider: 'mtn-momo',
      transaction,
      rawPayload: data,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: isSuccess ? 'Payment received' : `Payment ${data.status}`,
      transaction,
    };
  }

  /**
   * Handle Transfer notification (payout)
   */
  private handleTransferNotification(
    data: MTNMoMoTransferNotification,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing MTN MoMo Transfer [${eventId}]: ${data.externalId}`);

    const status = this.mapStatus(data.status);
    const isSuccess = status === 'completed';

    // Parse payee phone
    const phone = this.parsePartyId(data.payee);

    const transaction: Transaction = {
      id: `mtnmomo_transfer_${data.externalId}`,
      providerTransactionId: data.financialTransactionId || data.externalId,
      provider: 'mtn-momo',
      status,
      amount: {
        amount: parseFloat(data.amount),
        currency: data.currency,
      },
      customer: {
        phone,
      },
      description: data.payeeNote || data.payerMessage || 'MTN MoMo Transfer',
      metadata: {
        externalId: data.externalId,
        partyIdType: data.payee.partyIdType,
        reason: data.reason,
        eventId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: isSuccess ? new Date() : undefined,
      failureReason: !isSuccess ? (data.reason || data.status) : undefined,
    };

    // Emit appropriate event
    const eventType = isSuccess ? 'transfer.success' : 
                      status === 'failed' ? 'transfer.failed' : 'transfer.success';
    
    this.eventEmitter.emitPaymentEvent(eventType, {
      provider: 'mtn-momo',
      transaction,
      rawPayload: data,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: isSuccess ? 'Transfer successful' : `Transfer ${data.status}`,
      transaction,
    };
  }

  /**
   * Handle Collection callback (alternative format)
   */
  private handleCollectionCallback(
    data: MTNMoMoCollectionCallback,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing MTN MoMo Collection Callback [${eventId}]: ${data.transactionId}`);

    const status = this.mapStatus(data.status);
    const isSuccess = status === 'completed';

    // Parse phone number
    const phone = this.parsePhoneNumber(data.phoneNumber);

    const transaction: Transaction = {
      id: `mtnmomo_collection_${data.referenceId}`,
      providerTransactionId: data.transactionId,
      provider: 'mtn-momo',
      status,
      amount: {
        amount: parseFloat(data.amount),
        currency: data.currency,
      },
      customer: {
        phone,
      },
      description: data.message || 'MTN MoMo Collection',
      metadata: {
        referenceId: data.referenceId,
        eventId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: isSuccess ? new Date() : undefined,
      failureReason: !isSuccess ? data.message : undefined,
    };

    // Emit appropriate event
    const eventType = isSuccess ? 'payment.success' : 
                      status === 'failed' ? 'payment.failed' : 'payment.pending';
    
    this.eventEmitter.emitPaymentEvent(eventType, {
      provider: 'mtn-momo',
      transaction,
      rawPayload: data,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: isSuccess ? 'Collection successful' : `Collection ${data.status}`,
      transaction,
    };
  }

  // ==================== Helper Methods ====================

  /**
   * Detect webhook type from payload
   */
  private detectWebhookType(payload: any): string {
    if (payload.payer && payload.externalId && !payload.financialTransactionId) {
      return 'request_to_pay';
    }
    if (payload.financialTransactionId && payload.payer) {
      return 'payment_notification';
    }
    if (payload.payee) {
      return 'transfer';
    }
    if (payload.transactionId && payload.referenceId) {
      return 'collection_callback';
    }
    return 'unknown';
  }

  /**
   * Map MTN status to our TransactionStatus
   */
  private mapStatus(mtnStatus: string): TransactionStatus {
    switch (mtnStatus.toUpperCase()) {
      case 'SUCCESSFUL':
        return 'completed';
      case 'PENDING':
        return 'pending';
      case 'FAILED':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Parse party ID into PhoneNumber
   */
  private parsePartyId(party: { partyIdType: string; partyId: string }): PhoneNumber | undefined {
    if (party.partyIdType === 'MSISDN') {
      return this.parsePhoneNumber(party.partyId);
    }
    return undefined;
  }

  /**
   * Parse phone number string
   */
  private parsePhoneNumber(phoneStr: string): PhoneNumber {
    const cleanPhone = phoneStr.replace(/^\+/, '').replace(/\s/g, '');
    
    // Handle various formats
    let countryCode = '';
    let nationalNumber = '';

    if (cleanPhone.startsWith('256')) {
      // Uganda
      countryCode = '256';
      nationalNumber = cleanPhone.substring(3);
    } else if (cleanPhone.startsWith('233')) {
      // Ghana
      countryCode = '233';
      nationalNumber = cleanPhone.substring(3);
    } else if (cleanPhone.startsWith('237')) {
      // Cameroon
      countryCode = '237';
      nationalNumber = cleanPhone.substring(3);
    } else if (cleanPhone.startsWith('250')) {
      // Rwanda
      countryCode = '250';
      nationalNumber = cleanPhone.substring(3);
    } else {
      // Default: assume first 3 digits are country code
      countryCode = cleanPhone.substring(0, 3);
      nationalNumber = cleanPhone.substring(3);
    }

    return {
      countryCode,
      nationalNumber,
      formatted: `+${cleanPhone}`,
    };
  }

  /**
   * Extract API key from headers
   */
  private extractApiKey(headers: Record<string, string | string[] | undefined>): string | undefined {
    const authHeader = headers['authorization'] || headers['Authorization'];
    if (authHeader) {
      const auth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      // Remove Bearer prefix
      return auth.replace(/^Bearer\s+/i, '');
    }
    
    const apiKeyHeader = headers['x-api-key'] || headers['X-API-Key'];
    if (apiKeyHeader) {
      return Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    }

    return undefined;
  }
}

// ==================== Factory Function ====================

export function createMTNMoMoWebhookHandler(
  logger: ILogger,
  eventEmitter: PaymentEventEmitter,
  verifier: WebhookVerifier,
  apiKey?: string
): MTNMoMoWebhookHandler {
  return new MTNMoMoWebhookHandler(logger, eventEmitter, verifier, apiKey);
}
