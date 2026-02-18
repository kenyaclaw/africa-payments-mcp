/**
 * M-Pesa Webhook Handler
 * Handles C2B, STK Push, and B2C callbacks
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
import { WebhookVerifier, MpesaStkCallback } from '../verifier.js';

// ==================== M-Pesa Webhook Types ====================

export interface MpesaStkPushCallback {
  Body: {
    stkCallback: MpesaStkCallbackBody;
  };
}

interface MpesaStkCallbackBody {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: number;
  ResultDesc: string;
  CallbackMetadata?: {
    Item: Array<{
      Name: string;
      Value: string | number;
    }>;
  };
}

export interface MpesaC2BCallback {
  TransactionType: string;
  TransID: string;
  TransTime: string;
  TransAmount: string;
  BusinessShortCode: string;
  BillRefNumber: string;
  InvoiceNumber?: string;
  OrgAccountBalance?: string;
  ThirdPartyTransID?: string;
  MSISDN: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
}

export interface MpesaB2CCallback {
  Result: {
    ResultType: number;
    ResultCode: number;
    ResultDesc: string;
    OriginatorConversationID: string;
    ConversationID: string;
    TransactionID: string;
    ResultParameters?: {
      ResultParameter: Array<{
        Key: string;
        Value: any;
      }>;
    };
    ReferenceData?: {
      ReferenceItem: {
        Key: string;
        Value: any;
      };
    };
  };
}

export interface MpesaReversalCallback {
  Result: {
    ResultType: number;
    ResultCode: number;
    ResultDesc: string;
    OriginatorConversationID: string;
    ConversationID: string;
    TransactionID: string;
  };
}

// ==================== Handler Class ====================

export class MpesaWebhookHandler {
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
   * Handle incoming M-Pesa webhook
   */
  async handleWebhook(
    payload: any,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ success: boolean; message: string; transaction?: Transaction }> {
    const eventId = createEventId('mpesa');
    const receivedAt = new Date();

    try {
      // Log raw webhook for debugging
      this.logger.debug(`M-Pesa webhook received [${eventId}]: ${JSON.stringify(this.verifier.sanitizePayload(payload))}`);

      // Emit webhook received event
      this.eventEmitter.emitWebhookReceived({
        id: eventId,
        provider: 'mpesa',
        eventType: this.detectEventType(payload),
        payload: this.verifier.sanitizePayload(payload),
        receivedAt,
      });

      // Verify webhook structure
      const verification = this.verifier.verifyMpesaWebhook(payload);
      if (!verification.valid) {
        this.eventEmitter.emitWebhookError('mpesa', verification.error || 'Verification failed', payload);
        return { success: false, message: verification.error || 'Invalid webhook' };
      }

      // Route to specific handler based on callback type
      if (payload.Body?.stkCallback) {
        return this.handleStkPushCallback(payload.Body.stkCallback, eventId);
      }

      if (payload.TransactionType && payload.TransID) {
        return this.handleC2BCallback(payload as MpesaC2BCallback, eventId);
      }

      if (payload.Result?.ResultCode !== undefined && payload.Result.ConversationID) {
        // Could be B2C or Reversal - check ResultType
        if (payload.Result.ResultType === 0) {
          return this.handleB2CCallback(payload as MpesaB2CCallback, eventId);
        }
        return this.handleReversalCallback(payload as MpesaReversalCallback, eventId);
      }

      return { success: false, message: 'Unknown M-Pesa webhook type' };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`M-Pesa webhook handling error [${eventId}]: ${errorMessage}`);
      this.eventEmitter.emitWebhookError('mpesa', errorMessage, payload);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Handle STK Push callback
   */
  private handleStkPushCallback(
    callback: MpesaStkCallbackBody,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing M-Pesa STK callback [${eventId}]: ${callback.CheckoutRequestID}`);

    const isSuccess = callback.ResultCode === 0;
    const metadata = this.parseCallbackMetadata(callback.CallbackMetadata);

    // Build customer info from metadata
    const customer: Customer = {};
    if (metadata.PhoneNumber) {
      const phoneStr = String(metadata.PhoneNumber);
      customer.phone = {
        countryCode: phoneStr.substring(0, 3),
        nationalNumber: phoneStr.substring(3),
        formatted: `+${phoneStr}`,
      };
    }

    // Build amount
    const amount: Money = {
      amount: typeof metadata.Amount === 'number' ? metadata.Amount : parseFloat(String(metadata.Amount)) || 0,
      currency: 'KES',
    };

    // Create transaction object
    const transaction: Transaction = {
      id: `mpesa_stk_${callback.CheckoutRequestID}`,
      providerTransactionId: String(metadata.MpesaReceiptNumber || callback.CheckoutRequestID),
      provider: 'mpesa',
      status: isSuccess ? 'completed' : 'failed',
      amount,
      customer,
      description: callback.ResultDesc,
      metadata: {
        merchantRequestId: callback.MerchantRequestID,
        checkoutRequestId: callback.CheckoutRequestID,
        resultCode: callback.ResultCode,
        transactionDate: metadata.TransactionDate,
        eventId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: isSuccess ? new Date() : undefined,
      failureReason: isSuccess ? undefined : callback.ResultDesc,
    };

    // Emit appropriate event
    const eventData: Omit<PaymentEventData, 'eventType' | 'processedAt'> = {
      provider: 'mpesa',
      transaction,
      rawPayload: callback,
      receivedAt: new Date(),
    };

    if (isSuccess) {
      this.eventEmitter.emitPaymentEvent('payment.success', eventData);
    } else {
      this.eventEmitter.emitPaymentEvent('payment.failed', eventData);
    }

    return {
      success: true,
      message: isSuccess ? 'Payment successful' : `Payment failed: ${callback.ResultDesc}`,
      transaction,
    };
  }

  /**
   * Handle C2B (Customer to Business) callback
   */
  private handleC2BCallback(
    payload: MpesaC2BCallback,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    this.logger.info(`Processing M-Pesa C2B callback [${eventId}]: ${payload.TransID}`);

    // Parse phone number
    const phoneStr = payload.MSISDN.replace(/^\+/, '');
    const phone: PhoneNumber = {
      countryCode: phoneStr.substring(0, 3),
      nationalNumber: phoneStr.substring(3),
      formatted: `+${phoneStr}`,
    };

    // Build customer info
    const customer: Customer = {
      phone,
      name: [payload.FirstName, payload.MiddleName, payload.LastName]
        .filter(Boolean)
        .join(' '),
    };

    // Parse transaction time
    const transTime = payload.TransTime;
    const year = parseInt(transTime.substring(0, 4));
    const month = parseInt(transTime.substring(4, 6)) - 1;
    const day = parseInt(transTime.substring(6, 8));
    const hour = parseInt(transTime.substring(8, 10));
    const minute = parseInt(transTime.substring(10, 12));
    const second = parseInt(transTime.substring(12, 14));

    const transaction: Transaction = {
      id: `mpesa_c2b_${payload.TransID}`,
      providerTransactionId: payload.TransID,
      provider: 'mpesa',
      status: 'completed',
      amount: {
        amount: parseFloat(payload.TransAmount),
        currency: 'KES',
      },
      customer,
      description: payload.BillRefNumber,
      metadata: {
        transactionType: payload.TransactionType,
        businessShortCode: payload.BusinessShortCode,
        invoiceNumber: payload.InvoiceNumber,
        thirdPartyTransId: payload.ThirdPartyTransID,
        accountBalance: payload.OrgAccountBalance,
        eventId,
      },
      createdAt: new Date(year, month, day, hour, minute, second),
      updatedAt: new Date(),
      completedAt: new Date(),
    };

    // Emit payment success event
    this.eventEmitter.emitPaymentEvent('payment.success', {
      provider: 'mpesa',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: 'C2B payment processed',
      transaction,
    };
  }

  /**
   * Handle B2C (Business to Customer) callback
   */
  private handleB2CCallback(
    payload: MpesaB2CCallback,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    const result = payload.Result;
    const isSuccess = result.ResultCode === 0;

    this.logger.info(`Processing M-Pesa B2C callback [${eventId}]: ${result.TransactionID}`);

    // Extract parameters from result
    const params = this.parseResultParameters(result.ResultParameters);

    const transaction: Transaction = {
      id: `mpesa_b2c_${result.ConversationID}`,
      providerTransactionId: result.TransactionID,
      provider: 'mpesa',
      status: isSuccess ? 'completed' : 'failed',
      amount: {
        amount: parseFloat(params.TransactionAmount || '0'),
        currency: 'KES',
      },
      customer: {
        phone: this.parsePhoneNumber(params.ReceiverPartyPublicName),
        name: params.ReceiverPartyPublicName,
      },
      description: result.ResultDesc,
      metadata: {
        resultType: result.ResultType,
        originatorConversationId: result.OriginatorConversationID,
        conversationId: result.ConversationID,
        transactionId: result.TransactionID,
        transactionReceipt: params.TransactionReceipt,
        b2CRecipientIsRegisteredCustomer: params.B2CRecipientIsRegisteredCustomer,
        eventId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: isSuccess ? new Date() : undefined,
      failureReason: isSuccess ? undefined : result.ResultDesc,
    };

    // Emit transfer event
    const eventType = isSuccess ? 'transfer.success' : 'transfer.failed';
    this.eventEmitter.emitPaymentEvent(eventType, {
      provider: 'mpesa',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: isSuccess ? 'B2C transfer successful' : `B2C failed: ${result.ResultDesc}`,
      transaction,
    };
  }

  /**
   * Handle Reversal callback
   */
  private handleReversalCallback(
    payload: MpesaReversalCallback,
    eventId: string
  ): { success: boolean; message: string; transaction?: Transaction } {
    const result = payload.Result;
    const isSuccess = result.ResultCode === 0;

    this.logger.info(`Processing M-Pesa Reversal callback [${eventId}]: ${result.TransactionID}`);

    const transaction: Transaction = {
      id: `mpesa_reversal_${result.ConversationID}`,
      providerTransactionId: result.TransactionID,
      provider: 'mpesa',
      status: isSuccess ? 'refunded' : 'failed',
      amount: { amount: 0, currency: 'KES' }, // Amount not provided in reversal callback
      customer: {},
      description: result.ResultDesc,
      metadata: {
        resultType: result.ResultType,
        originatorConversationId: result.OriginatorConversationID,
        conversationId: result.ConversationID,
        eventId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: isSuccess ? new Date() : undefined,
      failureReason: isSuccess ? undefined : result.ResultDesc,
    };

    // Emit refund event
    this.eventEmitter.emitPaymentEvent('refund.processed', {
      provider: 'mpesa',
      transaction,
      rawPayload: payload,
      receivedAt: new Date(),
    });

    return {
      success: true,
      message: isSuccess ? 'Reversal processed' : `Reversal failed: ${result.ResultDesc}`,
      transaction,
    };
  }

  // ==================== Helper Methods ====================

  /**
   * Detect event type from payload
   */
  private detectEventType(payload: any): string {
    if (payload.Body?.stkCallback) return 'stk_push_callback';
    if (payload.TransactionType) return 'c2b_callback';
    if (payload.Result?.ResultType === 0) return 'b2c_callback';
    if (payload.Result) return 'reversal_callback';
    return 'unknown';
  }

  /**
   * Parse callback metadata into key-value object
   */
  private parseCallbackMetadata(metadata?: { Item: Array<{ Name: string; Value: string | number }> }): Record<string, string | number> {
    const result: Record<string, string | number> = {};
    
    if (!metadata?.Item) {
      return result;
    }

    for (const item of metadata.Item) {
      result[item.Name] = item.Value;
    }

    return result;
  }

  /**
   * Parse result parameters into key-value object
   */
  private parseResultParameters(resultParams?: { ResultParameter: Array<{ Key: string; Value: any }> }): Record<string, any> {
    const result: Record<string, any> = {};
    
    if (!resultParams?.ResultParameter) {
      return result;
    }

    for (const param of resultParams.ResultParameter) {
      result[param.Key] = param.Value;
    }

    return result;
  }

  /**
   * Parse phone number from M-Pesa name format
   * Format is typically: "Name - 2547XXXXXXXX"
   */
  private parsePhoneNumber(nameString?: string): PhoneNumber | undefined {
    if (!nameString) return undefined;

    const match = nameString.match(/(\d{10,12})$/);
    if (match) {
      const phoneStr = match[1];
      return {
        countryCode: phoneStr.substring(0, 3),
        nationalNumber: phoneStr.substring(3),
        formatted: `+${phoneStr}`,
      };
    }

    return undefined;
  }
}

// ==================== Factory Function ====================

export function createMpesaWebhookHandler(
  logger: ILogger,
  eventEmitter: PaymentEventEmitter,
  verifier: WebhookVerifier
): MpesaWebhookHandler {
  return new MpesaWebhookHandler(logger, eventEmitter, verifier);
}
