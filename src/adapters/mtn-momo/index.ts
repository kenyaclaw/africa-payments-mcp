/**
 * MTN Mobile Money API Adapter
 * Official API docs: https://momodeveloper.mtn.com/
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  PaymentProvider, 
  MTNMoMoConfig, 
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

interface MoMoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface RequestToPayResponse {
  referenceId: string;
  status: string;
  financialTransactionId?: string;
  reason?: string;
}

interface TransferResponse {
  referenceId: string;
  status: string;
  financialTransactionId?: string;
}

interface RequestToPayStatus {
  amount: string;
  currency: string;
  financialTransactionId: string;
  externalId: string;
  payer: {
    partyIdType: string;
    partyId: string;
  };
  payerMessage: string;
  payeeNote: string;
  status: string;
  reason?: string;
}

interface AccountBalance {
  availableBalance: string;
  currency: string;
}

export class MTNMoMoAdapter implements PaymentProvider {
  readonly name = 'mtn_momo';
  readonly displayName = 'MTN Mobile Money';
  readonly countries = ['UG', 'GH', 'CM', 'CI', 'RW', 'ZA', 'SN', 'BJ'];
  readonly currencies = ['UGX', 'GHS', 'XAF', 'XOF', 'RWF', 'ZAR'];
  readonly supportedMethods: PaymentMethod[] = ['mobile_money'];

  private accessToken?: string;
  private tokenExpiry?: Date;
  private client: AxiosInstance;
  private baseUrl: string;
  private apiUser: string;

  constructor(public readonly config: MTNMoMoConfig) {
    this.baseUrl = config.apiBaseUrl || (
      config.environment === 'production'
        ? 'https://momodeveloper.mtn.com'
        : 'https://sandbox.momodeveloper.mtn.com'
    );

    this.apiUser = config.apiUser;

    this.client = axios.create({
      timeout: config.timeoutMs || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': config.subscriptionKey,
      },
    });

    // Add request retry interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config;
        if (!config) return Promise.reject(error);

        const retryCount = (config as any).retryCount || 0;
        const maxRetries = this.config.retryAttempts || 3;

        if (retryCount < maxRetries && this.isRetryableError(error)) {
          (config as any).retryCount = retryCount + 1;
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.client(config);
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
    if (!this.config.apiUser || !this.config.apiKey) {
      throw new PaymentError(
        'MTN MoMo API user and key are required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    if (!this.config.subscriptionKey) {
      throw new PaymentError(
        'MTN MoMo subscription key is required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    // Authenticate
    await this.authenticate();
  }

  private async authenticate(): Promise<void> {
    try {
      const response = await this.client.post<MoMoTokenResponse>(
        `${this.baseUrl}/collection/token/`,
        {},
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.apiUser}:${this.config.apiKey}`).toString('base64')}`,
          },
        }
      );

      this.accessToken = response.data.access_token;
      // Set expiry 5 minutes early
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 300) * 1000);
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new PaymentError(
        `MTN MoMo authentication failed: ${axiosError.message}`,
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

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private formatPhone(phone: string): string {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    // Ensure it starts with the country code without the +
    if (cleaned.startsWith('0')) {
      // Default to Uganda if starts with 0 - should be configurable
      cleaned = '256' + cleaned.substring(1);
    }
    return cleaned;
  }

  private mapMoMoStatus(momoStatus: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'PENDING': 'pending',
      'SUCCESSFUL': 'completed',
      'FAILED': 'failed',
      'REJECTED': 'failed',
      'CANCELLED': 'cancelled',
    };
    return statusMap[momoStatus?.toUpperCase()] || 'pending';
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
          `MTN MoMo ${operation} failed: Authentication expired`,
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name,
          transactionId,
          true
        );
      }

      if (status === 400) {
        throw new PaymentError(
          `MTN MoMo ${operation} failed: ${data.message || 'Bad request'}`,
          ErrorCodes.PROVIDER_ERROR,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 404) {
        throw new PaymentError(
          `MTN MoMo ${operation} failed: Transaction not found`,
          ErrorCodes.TRANSACTION_NOT_FOUND,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 409) {
        throw new PaymentError(
          `MTN MoMo ${operation} failed: Duplicate transaction`,
          ErrorCodes.DUPLICATE_TRANSACTION,
          this.name,
          transactionId,
          false
        );
      }

      throw new PaymentError(
        `MTN MoMo ${operation} failed: ${data.message || `HTTP ${status}`}`,
        ErrorCodes.PROVIDER_ERROR,
        this.name,
        transactionId,
        isRetryable
      );
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      throw new PaymentError(
        `MTN MoMo ${operation} timed out`,
        ErrorCodes.TIMEOUT_ERROR,
        this.name,
        transactionId,
        true
      );
    }

    throw new PaymentError(
      `MTN MoMo ${operation} failed: ${axiosError.message}`,
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
        'Phone number is required for MTN MoMo transfers',
        ErrorCodes.MISSING_REQUIRED_FIELD,
        this.name
      );
    }

    const referenceId = this.generateUUID();
    const id = `momo_transfer_${Date.now()}`;

    try {
      const payload = {
        amount: params.amount.amount.toString(),
        currency: params.amount.currency,
        externalId: `TRF_${Date.now()}`,
        payee: {
          partyIdType: 'MSISDN',
          partyId: this.formatPhone(params.recipient.phone.formatted || params.recipient.phone.nationalNumber),
        },
        payerMessage: params.description || 'Transfer',
        payeeNote: params.description || 'Transfer',
      };

      await this.client.post(
        `${this.baseUrl}/disbursement/v1_0/transfer`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Reference-Id': referenceId,
          },
        }
      );

      // MTN MoMo returns 202 Accepted, status is checked separately
      return {
        id,
        providerTransactionId: referenceId,
        provider: this.name,
        status: 'pending',
        amount: params.amount,
        customer: { 
          name: params.recipient.name, 
          phone: params.recipient.phone 
        },
        description: params.description,
        metadata: {
          ...params.metadata,
          externalId: payload.externalId,
          partyId: payload.payee.partyId,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      this.handleError(error, 'sendMoney', id);
    }
  }

  async requestPayment(params: RequestPaymentParams): Promise<Transaction> {
    await this.ensureAuthenticated();

    if (!params.customer.phone) {
      throw new PaymentError(
        'Customer phone number is required for MTN MoMo request to pay',
        ErrorCodes.MISSING_REQUIRED_FIELD,
        this.name
      );
    }

    const referenceId = this.generateUUID();
    const id = `momo_${Date.now()}`;

    try {
      const payload = {
        amount: params.amount.amount.toString(),
        currency: params.amount.currency,
        externalId: `RTP_${Date.now()}`,
        payer: {
          partyIdType: 'MSISDN',
          partyId: this.formatPhone(params.customer.phone.formatted || params.customer.phone.nationalNumber),
        },
        payerMessage: params.description || 'Payment request',
        payeeNote: params.description || 'Please approve payment',
      };

      await this.client.post(
        `${this.baseUrl}/collection/v1_0/requesttopay`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Reference-Id': referenceId,
            'X-Target-Environment': this.config.targetEnvironment || 'sandbox',
          },
        }
      );

      // MTN MoMo returns 202 Accepted, status is checked separately
      return {
        id,
        providerTransactionId: referenceId,
        provider: this.name,
        status: 'pending',
        amount: params.amount,
        customer: params.customer,
        description: params.description,
        metadata: {
          ...params.metadata,
          externalId: payload.externalId,
          partyId: payload.payer.partyId,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      this.handleError(error, 'requestPayment', id);
    }
  }

  async verifyTransaction(id: string): Promise<Transaction> {
    await this.ensureAuthenticated();

    const referenceId = id.replace('momo_', '').replace('momo_transfer_', '');

    try {
      // Try collection first, then disbursement
      let response;
      let endpoint = 'requesttopay';

      try {
        response = await this.client.get<RequestToPayStatus>(
          `${this.baseUrl}/collection/v1_0/requesttopay/${referenceId}`,
          {
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              'X-Target-Environment': this.config.targetEnvironment || 'sandbox',
            },
          }
        );
      } catch (e) {
        // Try disbursement endpoint
        endpoint = 'transfer';
        response = await this.client.get<RequestToPayStatus>(
          `${this.baseUrl}/disbursement/v1_0/transfer/${referenceId}`,
          {
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              'X-Target-Environment': this.config.targetEnvironment || 'sandbox',
            },
          }
        );
      }

      const data = response.data;
      const status = this.mapMoMoStatus(data.status);

      return {
        id,
        providerTransactionId: referenceId,
        provider: this.name,
        status,
        amount: { 
          amount: parseFloat(data.amount), 
          currency: data.currency 
        },
        customer: {
          phone: data.payer?.partyId ? {
            formatted: data.payer.partyId,
            countryCode: '',
            nationalNumber: data.payer.partyId,
          } : undefined,
        },
        description: data.payeeNote || data.payerMessage || 'MTN MoMo transaction',
        metadata: {
          financialTransactionId: data.financialTransactionId,
          externalId: data.externalId,
          reason: data.reason,
          endpoint,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: status === 'completed' ? new Date() : undefined,
        failureReason: data.reason,
      };
    } catch (error) {
      this.handleError(error, 'verifyTransaction', id);
    }
  }

  async refund(params: RefundParams): Promise<Transaction> {
    await this.ensureAuthenticated();

    const id = `momo_refund_${Date.now()}`;

    // MTN MoMo doesn't have a dedicated refund endpoint
    // We use the transfer (disbursement) API to send money back
    try {
      // First, get the original transaction details
      const originalTx = await this.verifyTransaction(params.originalTransactionId);

      if (!originalTx.customer?.phone) {
        throw new PaymentError(
          'Cannot refund: original transaction phone number not available',
          ErrorCodes.TRANSACTION_NOT_FOUND,
          this.name
        );
      }

      const referenceId = this.generateUUID();
      const refundAmount = params.amount?.amount || originalTx.amount.amount;

      const payload = {
        amount: refundAmount.toString(),
        currency: originalTx.amount.currency,
        externalId: `REF_${Date.now()}`,
        payee: {
          partyIdType: 'MSISDN',
          partyId: this.formatPhone(originalTx.customer.phone.formatted || originalTx.customer.phone.nationalNumber),
        },
        payerMessage: params.reason || 'Refund',
        payeeNote: `Refund for ${params.originalTransactionId}`,
      };

      await this.client.post(
        `${this.baseUrl}/disbursement/v1_0/transfer`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Reference-Id': referenceId,
          },
        }
      );

      return {
        id,
        providerTransactionId: referenceId,
        provider: this.name,
        status: 'pending',
        amount: { amount: refundAmount, currency: originalTx.amount.currency },
        customer: originalTx.customer,
        description: `Refund: ${params.reason || 'Customer request'}`,
        metadata: {
          originalTransaction: params.originalTransactionId,
          externalId: payload.externalId,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      this.handleError(error, 'refund', id);
    }
  }

  async getBalance(): Promise<Money> {
    await this.ensureAuthenticated();

    try {
      const response = await this.client.get<AccountBalance>(
        `${this.baseUrl}/collection/v1_0/account/balance`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Target-Environment': this.config.targetEnvironment || 'sandbox',
          },
        }
      );

      const data = response.data;

      return {
        amount: parseFloat(data.availableBalance),
        currency: data.currency,
      };
    } catch (error) {
      this.handleError(error, 'getBalance');
    }
  }

  async validatePhone(phone: string): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');
    // MTN MoMo phone formats vary by country
    // Uganda: 2567xxxxxxxx, Ghana: 2332xxxxxxxx, etc.
    return /^(256|233|237|225|250|27)\d{9,10}$/.test(cleanPhone);
  }
}
