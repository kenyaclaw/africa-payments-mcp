/**
 * Webhook Signature Verification Utilities
 * HMAC validation for each payment provider
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { ILogger, StructuredLogger } from '../utils/structured-logger.js';

export interface VerificationResult {
  valid: boolean;
  error?: string;
  details?: Record<string, any>;
}

export interface MpesaCallbackMetadata {
  Item: Array<{
    Name: string;
    Value: string | number;
  }>;
}

export interface MpesaStkCallback {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: number;
  ResultDesc: string;
  CallbackMetadata?: MpesaCallbackMetadata;
}

export class WebhookVerifier {
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  // ==================== M-Pesa Verification ====================

  /**
   * Verify M-Pesa webhook callback
   * Note: M-Pesa doesn't use HMAC signatures, but validates via API calls
   * We verify the structure and ResultCode
   */
  verifyMpesaWebhook(payload: any): VerificationResult {
    try {
      // Validate payload structure
      if (!payload || typeof payload !== 'object') {
        return { valid: false, error: 'Invalid payload format' };
      }

      // STK Push callback structure
      if (payload.Body?.stkCallback) {
        const callback: MpesaStkCallback = payload.Body.stkCallback;
        
        if (!callback.CheckoutRequestID) {
          return { valid: false, error: 'Missing CheckoutRequestID' };
        }

        if (typeof callback.ResultCode !== 'number') {
          return { valid: false, error: 'Invalid ResultCode' };
        }

        return {
          valid: true,
          details: {
            type: 'stk_push',
            checkoutRequestId: callback.CheckoutRequestID,
            merchantRequestId: callback.MerchantRequestID,
            resultCode: callback.ResultCode,
            isSuccess: callback.ResultCode === 0,
          },
        };
      }

      // C2B (Customer to Business) callback structure
      if (payload.TransactionType && payload.TransID) {
        return {
          valid: true,
          details: {
            type: 'c2b',
            transactionId: payload.TransID,
            transactionType: payload.TransactionType,
            amount: payload.TransAmount,
            phoneNumber: payload.MSISDN,
          },
        };
      }

      return { valid: false, error: 'Unknown M-Pesa webhook format' };
    } catch (error) {
      this.logger.error(`M-Pesa verification error: ${error}`);
      return { valid: false, error: 'Verification failed' };
    }
  }

  /**
   * Verify M-Pesa B2C result callback
   */
  verifyMpesaB2CWebhook(payload: any): VerificationResult {
    try {
      if (!payload?.Result?.ResultCode !== undefined) {
        return { valid: false, error: 'Invalid B2C callback structure' };
      }

      const result = payload.Result;
      
      return {
        valid: true,
        details: {
          type: 'b2c',
          resultCode: result.ResultCode,
          resultDesc: result.ResultDesc,
          transactionId: result.TransactionID,
          conversationId: result.ConversationID,
          isSuccess: result.ResultCode === 0,
        },
      };
    } catch (error) {
      this.logger.error(`M-Pesa B2C verification error: ${error}`);
      return { valid: false, error: 'B2C verification failed' };
    }
  }

  // ==================== Paystack Verification ====================

  /**
   * Verify Paystack webhook signature
   * Paystack uses HMAC-SHA512 of the request body with your webhook secret
   */
  verifyPaystackWebhook(payload: any, signature: string, secret: string): VerificationResult {
    try {
      if (!signature) {
        return { valid: false, error: 'Missing signature header' };
      }

      if (!secret) {
        this.logger.warn('Paystack webhook secret not configured, skipping verification');
        return { valid: true, details: { verified: false, reason: 'secret_not_configured' } };
      }

      // Compute expected signature
      const expectedSignature = createHmac('sha512', secret)
        .update(JSON.stringify(payload), 'utf8')
        .digest('hex');

      // Use timing-safe comparison to prevent timing attacks
      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (sigBuffer.length !== expectedBuffer.length) {
        return { valid: false, error: 'Invalid signature length' };
      }

      const isValid = timingSafeEqual(sigBuffer, expectedBuffer);

      if (!isValid) {
        this.logger.warn('Paystack signature mismatch');
        return { valid: false, error: 'Invalid signature' };
      }

      // Validate event structure
      if (!payload.event) {
        return { valid: false, error: 'Missing event type' };
      }

      if (!payload.data) {
        return { valid: false, error: 'Missing event data' };
      }

      return {
        valid: true,
        details: {
          event: payload.event,
          verified: true,
          reference: payload.data.reference,
        },
      };
    } catch (error) {
      this.logger.error(`Paystack verification error: ${error}`);
      return { valid: false, error: 'Verification failed' };
    }
  }

  /**
   * Verify Paystack signature without full payload validation
   * Useful for raw body verification
   */
  verifyPaystackSignature(rawBody: string | Buffer, signature: string, secret: string): boolean {
    try {
      if (!signature || !secret) {
        return false;
      }

      const expectedSignature = createHmac('sha512', secret)
        .update(rawBody)
        .digest('hex');

      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return timingSafeEqual(sigBuffer, expectedBuffer);
    } catch (error) {
      this.logger.error(`Paystack signature verification error: ${error}`);
      return false;
    }
  }

  // ==================== MTN MoMo Verification ====================

  /**
   * Verify MTN MoMo webhook
   * MTN MoMo uses API Key validation and OAuth2
   */
  verifyMtnMomoWebhook(payload: any, apiKey?: string, expectedApiKey?: string): VerificationResult {
    try {
      // Validate payload structure
      if (!payload || typeof payload !== 'object') {
        return { valid: false, error: 'Invalid payload format' };
      }

      // Check for required fields
      if (!payload.amount && !payload.financialTransactionId) {
        return { valid: false, error: 'Missing required fields' };
      }

      // Optional API key validation
      if (expectedApiKey && apiKey !== expectedApiKey) {
        return { valid: false, error: 'Invalid API key' };
      }

      return {
        valid: true,
        details: {
          financialTransactionId: payload.financialTransactionId,
          amount: payload.amount,
          currency: payload.currency,
          status: payload.status,
        },
      };
    } catch (error) {
      this.logger.error(`MTN MoMo verification error: ${error}`);
      return { valid: false, error: 'Verification failed' };
    }
  }

  /**
   * Verify MTN MoMo API user credentials
   */
  verifyMtnMomoApiKey(apiKey: string, subscriptionKey: string): VerificationResult {
    if (!apiKey || !subscriptionKey) {
      return { valid: false, error: 'Missing API credentials' };
    }

    // Basic format validation
    if (apiKey.length < 10) {
      return { valid: false, error: 'Invalid API key format' };
    }

    return { valid: true };
  }

  // ==================== IntaSend Verification ====================

  /**
   * Verify IntaSend webhook signature
   * IntaSend uses HMAC-SHA256 verification
   */
  verifyIntasendWebhook(payload: any, signature: string, secret: string): VerificationResult {
    try {
      if (!signature) {
        return { valid: false, error: 'Missing signature' };
      }

      if (!secret) {
        this.logger.warn('IntaSend webhook secret not configured');
        return { valid: true, details: { verified: false, reason: 'secret_not_configured' } };
      }

      // Compute expected signature
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const expectedSignature = createHmac('sha256', secret)
        .update(payloadString, 'utf8')
        .digest('hex');

      // Timing-safe comparison
      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (sigBuffer.length !== expectedBuffer.length) {
        return { valid: false, error: 'Invalid signature length' };
      }

      const isValid = timingSafeEqual(sigBuffer, expectedBuffer);

      if (!isValid) {
        this.logger.warn('IntaSend signature mismatch');
        return { valid: false, error: 'Invalid signature' };
      }

      return {
        valid: true,
        details: {
          verified: true,
          invoiceId: payload.invoice_id,
          status: payload.status,
        },
      };
    } catch (error) {
      this.logger.error(`IntaSend verification error: ${error}`);
      return { valid: false, error: 'Verification failed' };
    }
  }

  // ==================== Airtel Money Verification ====================

  /**
   * Verify Airtel Money webhook
   * Airtel Money uses Bearer token authentication
   */
  verifyAirtelMoneyWebhook(payload: any, bearerToken?: string, expectedToken?: string): VerificationResult {
    try {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, error: 'Invalid payload format' };
      }

      // Validate required fields
      if (!payload.transaction && !payload.reference) {
        return { valid: false, error: 'Missing required fields' };
      }

      // Optional bearer token validation
      if (expectedToken && bearerToken !== expectedToken) {
        return { valid: false, error: 'Invalid bearer token' };
      }

      return {
        valid: true,
        details: {
          reference: payload.reference,
          status: payload.status,
          transaction: payload.transaction,
        },
      };
    } catch (error) {
      this.logger.error(`Airtel Money verification error: ${error}`);
      return { valid: false, error: 'Verification failed' };
    }
  }

  // ==================== Orange Money Verification ====================

  /**
   * Verify Orange Money webhook
   * Orange Money uses OAuth2 Bearer token authentication
   */
  verifyOrangeMoneyWebhook(payload: any, bearerToken?: string, expectedToken?: string): VerificationResult {
    try {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, error: 'Invalid payload format' };
      }

      // Validate required fields based on callback type
      if (payload.paymentToken) {
        if (!payload.status || !payload.amount) {
          return { valid: false, error: 'Missing required payment fields' };
        }
      } else if (payload.transactionId) {
        if (!payload.status) {
          return { valid: false, error: 'Missing required transaction fields' };
        }
      } else {
        return { valid: false, error: 'Unknown Orange Money webhook format' };
      }

      // Optional bearer token validation
      if (expectedToken && bearerToken !== expectedToken) {
        return { valid: false, error: 'Invalid bearer token' };
      }

      return {
        valid: true,
        details: {
          type: payload.paymentToken ? 'payment' : 'transaction',
          status: payload.status,
          amount: payload.amount,
          transactionId: payload.transactionId || payload.paymentToken,
        },
      };
    } catch (error) {
      this.logger.error(`Orange Money verification error: ${error}`);
      return { valid: false, error: 'Verification failed' };
    }
  }

  // ==================== Chipper Cash Verification ====================

  /**
   * Verify Chipper Cash webhook signature
   * Chipper Cash uses HMAC-SHA256 signature verification
   */
  verifyChipperCashWebhook(payload: any, signature: string, secret: string): VerificationResult {
    try {
      if (!signature) {
        return { valid: false, error: 'Missing signature' };
      }

      if (!secret) {
        this.logger.warn('Chipper Cash webhook secret not configured');
        return { valid: true, details: { verified: false, reason: 'secret_not_configured' } };
      }

      // Compute expected signature
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const expectedSignature = createHmac('sha256', secret)
        .update(payloadString, 'utf8')
        .digest('hex');

      // Timing-safe comparison
      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (sigBuffer.length !== expectedBuffer.length) {
        return { valid: false, error: 'Invalid signature length' };
      }

      const isValid = timingSafeEqual(sigBuffer, expectedBuffer);

      if (!isValid) {
        this.logger.warn('Chipper Cash signature mismatch');
        return { valid: false, error: 'Invalid signature' };
      }

      // Validate event structure
      if (!payload.event) {
        return { valid: false, error: 'Missing event type' };
      }

      if (!payload.data) {
        return { valid: false, error: 'Missing event data' };
      }

      return {
        valid: true,
        details: {
          verified: true,
          event: payload.event,
          transactionId: payload.data.id,
        },
      };
    } catch (error) {
      this.logger.error(`Chipper Cash verification error: ${error}`);
      return { valid: false, error: 'Verification failed' };
    }
  }

  // ==================== Wave Verification ====================

  /**
   * Verify Wave webhook signature
   * Wave uses HMAC-SHA256 signature verification
   */
  verifyWaveWebhook(payload: any, signature: string, secret: string): VerificationResult {
    try {
      if (!signature) {
        return { valid: false, error: 'Missing signature' };
      }

      if (!secret) {
        this.logger.warn('Wave webhook secret not configured');
        return { valid: true, details: { verified: false, reason: 'secret_not_configured' } };
      }

      // Compute expected signature
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const expectedSignature = createHmac('sha256', secret)
        .update(payloadString, 'utf8')
        .digest('hex');

      // Timing-safe comparison
      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (sigBuffer.length !== expectedBuffer.length) {
        return { valid: false, error: 'Invalid signature length' };
      }

      const isValid = timingSafeEqual(sigBuffer, expectedBuffer);

      if (!isValid) {
        this.logger.warn('Wave signature mismatch');
        return { valid: false, error: 'Invalid signature' };
      }

      // Validate event structure
      if (!payload.event) {
        return { valid: false, error: 'Missing event type' };
      }

      if (!payload.data) {
        return { valid: false, error: 'Missing event data' };
      }

      return {
        valid: true,
        details: {
          verified: true,
          event: payload.event,
          transactionId: payload.data.id,
          type: payload.data.type,
        },
      };
    } catch (error) {
      this.logger.error(`Wave verification error: ${error}`);
      return { valid: false, error: 'Verification failed' };
    }
  }

  // ==================== Generic Utilities ====================

  /**
   * Generic HMAC signature verification
   */
  verifyHmacSignature(
    payload: string | Buffer,
    signature: string,
    secret: string,
    algorithm: 'sha256' | 'sha512' = 'sha256'
  ): boolean {
    try {
      const expectedSignature = createHmac(algorithm, secret)
        .update(payload)
        .digest('hex');

      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return timingSafeEqual(sigBuffer, expectedBuffer);
    } catch (error) {
      this.logger.error(`HMAC verification error: ${error}`);
      return false;
    }
  }

  /**
   * Extract signature from request headers
   * Different providers use different header names
   */
  extractSignature(headers: Record<string, string | string[] | undefined>, provider: string): string | undefined {
    const headerMap: Record<string, string[]> = {
      paystack: ['x-paystack-signature', 'X-Paystack-Signature'],
      intasend: ['x-intasend-signature', 'X-Intasend-Signature', 'x-signature'],
      mpesa: ['x-mpesa-signature'], // M-Pesa typically doesn't use signatures
      'mtn-momo': ['x-api-key', 'X-API-Key', 'authorization'],
      'airtel-money': ['authorization', 'Authorization'],
      'orange-money': ['authorization', 'Authorization'],
      'chipper-cash': ['x-chipper-signature', 'X-Chipper-Signature', 'x-signature'],
      'wave': ['x-wave-signature', 'X-Wave-Signature', 'x-signature'],
    };

    const possibleHeaders = headerMap[provider] || [];
    
    for (const headerName of possibleHeaders) {
      const value = headers[headerName.toLowerCase()] || headers[headerName];
      if (value) {
        // Handle array headers
        const sig = Array.isArray(value) ? value[0] : value;
        // Remove 'Bearer ' prefix if present
        return sig.replace(/^Bearer\s+/i, '');
      }
    }

    return undefined;
  }

  /**
   * Sanitize webhook payload for logging (remove sensitive data)
   */
  sanitizePayload(payload: any): any {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const sensitiveFields = [
      'password',
      'secret',
      'token',
      'apiKey',
      'api_key',
      'authorization',
      'credit_card',
      'card_number',
      'cvv',
      'pin',
    ];

    const sanitized = { ...payload };

    for (const key of Object.keys(sanitized)) {
      if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
        sanitized[key] = '***REDACTED***';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizePayload(sanitized[key]);
      }
    }

    return sanitized;
  }
}

// ==================== Singleton Instance ====================

let globalVerifier: WebhookVerifier | null = null;

export function getGlobalVerifier(logger?: ILogger): WebhookVerifier {
  if (!globalVerifier) {
    globalVerifier = new WebhookVerifier(logger || new StructuredLogger());
  }
  return globalVerifier;
}
