/**
 * M-Pesa Daraja API Adapter
 * Official API docs: https://developer.safaricom.co.ke/
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { RetryIndicator } from '../../utils/retry-indicator.js';
import { 
  PaymentProvider, 
  MpesaConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams,
  Transaction,
  TransactionStatus,
  Money,
  PaymentError,
  ErrorCodes,
  PaymentMethod
} from '../../types/index.js';

interface MpesaAuthResponse {
  access_token: string;
  expires_in: string;
}

interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage?: string;
}

interface B2CResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
}

interface TransactionStatusResponse {
  ResultCode?: string;
  ResponseCode?: string;
  ResultDesc?: string;
  ResponseDescription?: string;
  TransactionID?: string;
  Amount?: string;
}

export class MpesaAdapter implements PaymentProvider {
  readonly name = 'mpesa';
  readonly displayName = 'M-Pesa';
  readonly countries = ['KE', 'TZ'];
  readonly currencies = ['KES', 'TZS'];
  readonly supportedMethods: PaymentMethod[] = ['mobile_money'];

  private accessToken?: string;
  private tokenExpiry?: Date;
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(public readonly config: MpesaConfig) {
    this.baseUrl = config.environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';

    this.client = axios.create({
      timeout: config.timeoutMs || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request retry interceptor with visual indicator
    const retryIndicator = new RetryIndicator();
    
    this.client.interceptors.response.use(
      (response) => {
        // Reset indicator on success
        return response;
      },
      async (error: AxiosError) => {
        const config = error.config;
        if (!config) return Promise.reject(error);

        const retryCount = (config as any).retryCount || 0;
        const maxRetries = this.config.retryAttempts || 3;

        if (retryCount < maxRetries && this.isRetryableError(error)) {
          (config as any).retryCount = retryCount + 1;
          
          // Visual retry indicator
          if (retryCount === 0) {
            retryIndicator.start('M-Pesa API', maxRetries);
          }
          retryIndicator.nextAttempt(error);
          
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.client(config);
        }

        if (retryCount > 0) {
          retryIndicator.failure(error instanceof Error ? error : new Error(String(error)));
        }
        
        return Promise.reject(error);
      }
    );
  }

  private isRetryableError(error: AxiosError): boolean {
    return !error.response || // Network error
      error.code === 'ECONNABORTED' || // Timeout
      error.code === 'ETIMEDOUT' ||
      !!(error.response?.status && error.response.status >= 500); // Server errors
  }

  async initialize(config: Record<string, any>): Promise<void> {
    // Validate required config
    if (!this.config.consumerKey || !this.config.consumerSecret) {
      throw new PaymentError(
        'M-Pesa consumer key and secret are required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }
    if (!this.config.shortCode) {
      throw new PaymentError(
        'M-Pesa short code is required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }
    if (!this.config.passkey) {
      throw new PaymentError(
        'M-Pesa passkey is required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    // Authenticate and validate credentials
    await this.authenticate();
  }

  private async authenticate(): Promise<void> {
    try {
      const auth = Buffer.from(
        `${this.config.consumerKey}:${this.config.consumerSecret}`
      ).toString('base64');

      const response = await this.client.get<MpesaAuthResponse>(
        `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
          },
        }
      );

      this.accessToken = response.data.access_token;
      const expiresIn = parseInt(response.data.expires_in, 10);
      // Set expiry 5 minutes early to avoid edge cases
      this.tokenExpiry = new Date(Date.now() + (expiresIn - 300) * 1000);
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new PaymentError(
        `M-Pesa authentication failed: ${axiosError.message}`,
        ErrorCodes.AUTHENTICATION_FAILED,
        this.name,
        undefined,
        this.isRetryableError(axiosError)
      );
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || !this.tokenExpiry || this.tokenExpiry < new Date()) {
      await this.authenticate();
    }
  }

  private generateTimestamp(): string {
    const now = new Date();
    return now.toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  }

  private generatePassword(timestamp: string): string {
    const data = `${this.config.shortCode}${this.config.passkey}${timestamp}`;
    return Buffer.from(data).toString('base64');
  }

  private formatPhone(phone: string): string {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    // Remove leading 0 or 254/255 and add 254 for Kenya or 255 for Tanzania
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1);
    }
    return cleaned;
  }

  private mapMpesaStatus(mpesaCode: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      '0': 'completed',
      '1': 'failed',
      '17': 'cancelled',
      '26': 'failed',
    };
    return statusMap[mpesaCode] || 'failed';
  }

  private handleError(error: unknown, operation: string, transactionId?: string): never {
    if (error instanceof PaymentError) {
      throw error;
    }

    const axiosError = error as AxiosError;
    const isRetryable = this.isRetryableError(axiosError);

    if (axiosError.response) {
      const status = axiosError.response.status;
      const data = axiosError.response.data as any;

      if (status === 401) {
        throw new PaymentError(
          `M-Pesa ${operation} failed: Authentication expired`,
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name,
          transactionId,
          true
        );
      }

      if (status === 400) {
        throw new PaymentError(
          `M-Pesa ${operation} failed: ${data.errorMessage || data.message || 'Bad request'}`,
          ErrorCodes.PROVIDER_ERROR,
          this.name,
          transactionId,
          false
        );
      }

      throw new PaymentError(
        `M-Pesa ${operation} failed: ${data.errorMessage || data.message || `HTTP ${status}`}`,
        ErrorCodes.PROVIDER_ERROR,
        this.name,
        transactionId,
        isRetryable
      );
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      throw new PaymentError(
        `M-Pesa ${operation} timed out`,
        ErrorCodes.TIMEOUT_ERROR,
        this.name,
        transactionId,
        true
      );
    }

    throw new PaymentError(
      `M-Pesa ${operation} failed: ${axiosError.message}`,
      ErrorCodes.NETWORK_ERROR,
      this.name,
      transactionId,
      true
    );
  }

  async sendMoney(params: SendMoneyParams): Promise<Transaction> {
    await this.ensureAuthenticated();

    if (!params.recipient.phone) {
      throw new PaymentError(
        'Phone number is required for M-Pesa B2C transfers',
        ErrorCodes.MISSING_REQUIRED_FIELD,
        this.name
      );
    }

    const phone = this.formatPhone(params.recipient.phone.formatted || params.recipient.phone.nationalNumber);
    const id = `mpesa_b2c_${Date.now()}`;

    try {
      const payload = {
        InitiatorName: this.config.initiatorName || 'testapi',
        SecurityCredential: this.config.securityCredential || '',
        CommandID: 'BusinessPayment',
        Amount: params.amount.amount,
        PartyA: this.config.shortCode,
        PartyB: phone,
        Remarks: params.description || 'B2C Payment',
        QueueTimeOutURL: params.callbackUrl || 'https://example.com/timeout',
        ResultURL: params.callbackUrl || 'https://example.com/result',
        Occasion: params.metadata?.occasion || '',
      };

      const response = await this.client.post<B2CResponse>(
        `${this.baseUrl}/mpesa/b2c/v1/paymentrequest`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const isSuccess = response.data.ResponseCode === '0';

      return {
        id,
        providerTransactionId: response.data.ConversationID,
        provider: this.name,
        status: isSuccess ? 'pending' : 'failed',
        amount: params.amount,
        customer: {
          phone: params.recipient.phone,
          name: params.recipient.name,
        },
        description: params.description,
        metadata: {
          ...params.metadata,
          originatorConversationId: response.data.OriginatorConversationID,
          responseDescription: response.data.ResponseDescription,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        failureReason: isSuccess ? undefined : response.data.ResponseDescription,
      };
    } catch (error) {
      this.handleError(error, 'sendMoney', id);
    }
  }

  async requestPayment(params: RequestPaymentParams): Promise<Transaction> {
    await this.ensureAuthenticated();

    if (!params.customer.phone) {
      throw new PaymentError(
        'Customer phone number is required for M-Pesa STK Push',
        ErrorCodes.MISSING_REQUIRED_FIELD,
        this.name
      );
    }

    const phone = this.formatPhone(params.customer.phone.formatted || params.customer.phone.nationalNumber);
    const timestamp = this.generateTimestamp();
    const password = this.generatePassword(timestamp);
    const id = `mpesa_stk_${Date.now()}`;

    try {
      const payload = {
        BusinessShortCode: this.config.shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: params.amount.amount,
        PartyA: phone,
        PartyB: this.config.shortCode,
        PhoneNumber: phone,
        CallBackURL: params.callbackUrl || 'https://example.com/callback',
        AccountReference: params.metadata?.accountReference || 'PAYMENT',
        TransactionDesc: params.description || 'Payment',
      };

      const response = await this.client.post<StkPushResponse>(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const isSuccess = response.data.ResponseCode === '0';

      return {
        id,
        providerTransactionId: response.data.CheckoutRequestID,
        provider: this.name,
        status: isSuccess ? 'pending' : 'failed',
        amount: params.amount,
        customer: params.customer,
        description: params.description,
        metadata: {
          ...params.metadata,
          merchantRequestId: response.data.MerchantRequestID,
          responseDescription: response.data.ResponseDescription,
          customerMessage: response.data.CustomerMessage,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        failureReason: isSuccess ? undefined : response.data.ResponseDescription,
      };
    } catch (error) {
      this.handleError(error, 'requestPayment', id);
    }
  }

  async verifyTransaction(id: string): Promise<Transaction> {
    await this.ensureAuthenticated();

    try {
      const payload = {
        Initiator: this.config.initiatorName || 'testapi',
        SecurityCredential: this.config.securityCredential || '',
        CommandID: 'TransactionStatusQuery',
        TransactionID: id.replace('mpesa_', ''),
        PartyA: this.config.shortCode,
        IdentifierType: '4',
        ResultURL: 'https://example.com/result',
        QueueTimeOutURL: 'https://example.com/timeout',
        Remarks: 'Transaction status query',
        Occasion: '',
      };

      const response = await this.client.post<TransactionStatusResponse>(
        `${this.baseUrl}/mpesa/transactionstatus/v1/query`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const data = response.data;
      const status = this.mapMpesaStatus(data.ResultCode || data.ResponseCode || '0');

      return {
        id,
        providerTransactionId: data.TransactionID || id.replace('mpesa_', ''),
        provider: this.name,
        status,
        amount: { 
          amount: parseFloat(data.Amount || '0'), 
          currency: 'KES'
        },
        customer: {},
        description: data.ResultDesc || data.ResponseDescription || 'Transaction status',
        metadata: {
          resultCode: data.ResultCode,
          resultDesc: data.ResultDesc,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: status === 'completed' ? new Date() : undefined,
        failureReason: status === 'failed' ? data.ResultDesc : undefined,
      };
    } catch (error) {
      this.handleError(error, 'verifyTransaction', id);
    }
  }

  async refund(params: RefundParams): Promise<Transaction> {
    await this.ensureAuthenticated();

    const id = `mpesa_refund_${Date.now()}`;

    try {
      const payload = {
        Initiator: this.config.initiatorName || 'testapi',
        SecurityCredential: this.config.securityCredential || '',
        CommandID: 'TransactionReversal',
        TransactionID: params.originalTransactionId,
        Amount: params.amount?.amount || 0,
        ReceiverParty: this.config.shortCode,
        ReceiverIdentifierType: '11',
        ResultURL: 'https://example.com/result',
        QueueTimeOutURL: 'https://example.com/timeout',
        Remarks: params.reason || 'Transaction reversal',
        Occasion: '',
      };

      const response = await this.client.post(
        `${this.baseUrl}/mpesa/reversal/v1/request`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const data = response.data as any;
      const isSuccess = data.ResponseCode === '0';

      return {
        id,
        providerTransactionId: data.OriginatorConversationID,
        provider: this.name,
        status: isSuccess ? 'pending' : 'failed',
        amount: params.amount || { amount: 0, currency: 'KES' },
        customer: {},
        description: `Refund for ${params.originalTransactionId}`,
        metadata: {
          reason: params.reason,
          responseDescription: data.ResponseDescription,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        failureReason: isSuccess ? undefined : data.ResponseDescription,
      };
    } catch (error) {
      this.handleError(error, 'refund', id);
    }
  }

  async getBalance(): Promise<Money> {
    await this.ensureAuthenticated();

    try {
      const payload = {
        Initiator: this.config.initiatorName || 'testapi',
        SecurityCredential: this.config.securityCredential || '',
        CommandID: 'AccountBalance',
        PartyA: this.config.shortCode,
        IdentifierType: '4',
        Remarks: 'Account balance query',
        QueueTimeOutURL: 'https://example.com/timeout',
        ResultURL: 'https://example.com/result',
      };

      await this.client.post(
        `${this.baseUrl}/mpesa/accountbalance/v1/query`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      // Note: Account balance response comes async via callback
      // This returns the immediate response
      return { amount: 0, currency: 'KES' };
    } catch (error) {
      this.handleError(error, 'getBalance');
    }
  }

  async validatePhone(phone: string): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');
    // Kenyan M-Pesa: 2547xxxxxxxx or 2541xxxxxxxx
    // Tanzanian M-Pesa: 2557xxxxxxxx
    return /^254[71]\d{8}$/.test(cleanPhone) || /^2557\d{8}$/.test(cleanPhone);
  }
}
