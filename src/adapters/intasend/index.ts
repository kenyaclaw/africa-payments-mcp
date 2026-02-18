/**
 * IntaSend API Adapter
 * Official API docs: https://developers.intasend.com/
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  PaymentProvider, 
  IntaSendConfig, 
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

interface IntaSendCheckoutResponse {
  id: string;
  url: string;
  signature: string;
}

interface IntaSendPayoutResponse {
  id: string;
  status: string;
  amount: number;
  currency: string;
  reference: string;
  created_at: string;
  updated_at: string;
}

interface IntaSendTransactionStatus {
  id: string;
  invoice_id: string;
  status: string;
  amount: number;
  currency: string;
  provider: string;
  account: string;
  reference: string;
  created_at: string;
  updated_at: string;
  metadata?: any;
}

interface IntaSendRefundResponse {
  id: string;
  status: string;
  amount: number;
  currency: string;
  reference: string;
  created_at: string;
}

interface IntaSendWalletResponse {
  id: string;
  currency: string;
  available_balance: number;
  current_balance: number;
}

export class IntaSendAdapter implements PaymentProvider {
  readonly name = 'intasend';
  readonly displayName = 'IntaSend';
  readonly countries = ['KE', 'NG'];
  readonly currencies = ['KES', 'NGN'];
  readonly supportedMethods: PaymentMethod[] = ['mobile_money', 'card', 'bank_transfer'];

  private client: AxiosInstance;
  private baseUrl = 'https://payment.intasend.com/api';

  constructor(public readonly config: IntaSendConfig) {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.timeoutMs || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.secretKey}`,
        'INTASEND_PUBLIC_API_KEY': this.config.publishableKey,
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
    if (!this.config.publishableKey) {
      throw new PaymentError(
        'IntaSend publishable key is required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    if (!this.config.secretKey) {
      throw new PaymentError(
        'IntaSend secret key is required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    // Verify credentials by fetching wallet balance
    try {
      await this.client.get('/wallets/');
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
        throw new PaymentError(
          'Invalid IntaSend API credentials',
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name
        );
      }
      throw new PaymentError(
        `IntaSend initialization failed: ${axiosError.message}`,
        ErrorCodes.NETWORK_ERROR,
        this.name,
        undefined,
        this.isRetryableError(axiosError)
      );
    }
  }

  private mapIntaSendStatus(intasendStatus: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'COMPLETE': 'completed',
      'SUCCESSFUL': 'completed',
      'COMPLETED': 'completed',
      'FAILED': 'failed',
      'FAILURE': 'failed',
      'PENDING': 'pending',
      'PROCESSING': 'processing',
      'CANCELLED': 'cancelled',
      'REVERSED': 'refunded',
      'REFUNDED': 'refunded',
      'PENDING_REFUND': 'processing',
    };
    return statusMap[intasendStatus?.toUpperCase()] || 'failed';
  }

  private formatPhone(phone: string): string {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    // Remove leading 0 and add country code
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1);
    }
    return cleaned;
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

      if (status === 401 || status === 403) {
        throw new PaymentError(
          `IntaSend ${operation} failed: Authentication error`,
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 400) {
        throw new PaymentError(
          `IntaSend ${operation} failed: ${data.detail || data.message || 'Bad request'}`,
          ErrorCodes.PROVIDER_ERROR,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 404) {
        throw new PaymentError(
          `IntaSend ${operation} failed: Resource not found`,
          ErrorCodes.TRANSACTION_NOT_FOUND,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 422) {
        throw new PaymentError(
          `IntaSend ${operation} failed: ${data.detail || 'Validation error'}`,
          ErrorCodes.INVALID_AMOUNT,
          this.name,
          transactionId,
          false
        );
      }

      throw new PaymentError(
        `IntaSend ${operation} failed: ${data.detail || data.message || `HTTP ${status}`}`,
        ErrorCodes.PROVIDER_ERROR,
        this.name,
        transactionId,
        isRetryable
      );
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      throw new PaymentError(
        `IntaSend ${operation} timed out`,
        ErrorCodes.TIMEOUT_ERROR,
        this.name,
        transactionId,
        true
      );
    }

    throw new PaymentError(
      `IntaSend ${operation} failed: ${axiosError.message}`,
      ErrorCodes.NETWORK_ERROR,
      this.name,
      transactionId,
      true
    );
  }

  async sendMoney(params: SendMoneyParams): Promise<Transaction> {
    const id = `intasend_payout_${Date.now()}`;

    if (!params.recipient.phone && !params.recipient.bankAccount) {
      throw new PaymentError(
        'Phone number or bank account required for IntaSend payout',
        ErrorCodes.MISSING_REQUIRED_FIELD,
        this.name
      );
    }

    try {
      const payload: any = {
        currency: params.amount.currency,
        provider: this.config.serviceProvider || 'M-PESA',
        amount: params.amount.amount,
        reference: `IS_PAYOUT_${Date.now()}`,
        narrative: params.description || 'Payout',
      };

      if (params.recipient.phone) {
        payload.account = this.formatPhone(
          params.recipient.phone.formatted || params.recipient.phone.nationalNumber
        );
        payload.transfer_type = 'MOBILEMONEY';
      } else if (params.recipient.bankAccount) {
        payload.account = params.recipient.bankAccount.accountNumber;
        payload.bank_code = params.recipient.bankAccount.bankCode;
        payload.account_name = params.recipient.bankAccount.accountName || params.recipient.name;
        payload.transfer_type = 'BANK';
      }

      const response = await this.client.post<IntaSendPayoutResponse>('/send-money/initiate/', payload);

      const data = response.data;

      return {
        id,
        providerTransactionId: data.id,
        provider: this.name,
        status: this.mapIntaSendStatus(data.status),
        amount: { amount: data.amount, currency: data.currency },
        customer: { 
          name: params.recipient.name, 
          phone: params.recipient.phone 
        },
        description: params.description,
        metadata: {
          ...params.metadata,
          reference: data.reference,
          provider: payload.provider,
          transferType: payload.transfer_type,
        },
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      };
    } catch (error) {
      this.handleError(error, 'sendMoney', id);
    }
  }

  async requestPayment(params: RequestPaymentParams): Promise<Transaction> {
    const id = `intasend_${Date.now()}`;

    try {
      const payload: any = {
        currency: params.amount.currency,
        amount: params.amount.amount,
        email: params.customer.email,
        method: 'M-PESA', // or CARD, BANK
        api_ref: `IS_COL_${Date.now()}`,
        callback_url: params.callbackUrl,
      };

      if (params.customer.phone) {
        payload.phone_number = this.formatPhone(
          params.customer.phone.formatted || params.customer.phone.nationalNumber
        );
      }

      if (params.customer.name) {
        payload.first_name = params.customer.name.split(' ')[0];
        payload.last_name = params.customer.name.split(' ').slice(1).join(' ');
      }

      const response = await this.client.post<IntaSendCheckoutResponse>('/checkout/', payload);

      const data = response.data;

      return {
        id,
        providerTransactionId: data.id,
        provider: this.name,
        status: 'pending',
        amount: params.amount,
        customer: params.customer,
        description: params.description,
        metadata: {
          ...params.metadata,
          checkoutUrl: data.url,
          signature: data.signature,
          apiRef: payload.api_ref,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      this.handleError(error, 'requestPayment', id);
    }
  }

  async verifyTransaction(id: string): Promise<Transaction> {
    try {
      // IntaSend uses invoice_id for collection and id for payouts
      const transactionId = id.replace('intasend_', '').replace('intasend_payout_', '');
      
      const response = await this.client.get<IntaSendTransactionStatus>(`/send-money/status/${transactionId}/`);
      
      const data = response.data;
      const status = this.mapIntaSendStatus(data.status);

      return {
        id,
        providerTransactionId: data.id,
        provider: this.name,
        status,
        amount: { amount: data.amount, currency: data.currency },
        customer: {
          phone: data.account ? {
            formatted: data.account,
            countryCode: '',
            nationalNumber: data.account,
          } : undefined,
        },
        description: `Transaction via ${data.provider}`,
        metadata: {
          invoiceId: data.invoice_id,
          provider: data.provider,
          account: data.account,
          reference: data.reference,
        },
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        completedAt: status === 'completed' ? new Date(data.updated_at) : undefined,
      };
    } catch (error) {
      this.handleError(error, 'verifyTransaction', id);
    }
  }

  async refund(params: RefundParams): Promise<Transaction> {
    const id = `intasend_refund_${Date.now()}`;

    try {
      const payload: any = {
        transaction_id: params.originalTransactionId,
      };

      if (params.amount) {
        payload.amount = params.amount.amount;
      }

      if (params.reason) {
        payload.narrative = params.reason;
      }

      const response = await this.client.post<IntaSendRefundResponse>('/refunds/', payload);

      const data = response.data;

      return {
        id,
        providerTransactionId: data.id,
        provider: this.name,
        status: this.mapIntaSendStatus(data.status),
        amount: { amount: data.amount, currency: data.currency },
        customer: {},
        description: params.reason || 'Refund processed',
        metadata: {
          originalTransaction: params.originalTransactionId,
          reference: data.reference,
        },
        createdAt: new Date(data.created_at),
        updatedAt: new Date(),
        completedAt: data.status.toUpperCase() === 'COMPLETE' ? new Date() : undefined,
      };
    } catch (error) {
      this.handleError(error, 'refund', id);
    }
  }

  async getBalance(): Promise<Money> {
    try {
      const response = await this.client.get<IntaSendWalletResponse[]>('/wallets/');

      const wallets = response.data;
      
      if (!wallets || wallets.length === 0) {
        throw new PaymentError(
          'No wallets found',
          ErrorCodes.PROVIDER_ERROR,
          this.name
        );
      }

      // Return the first wallet (or could filter by currency)
      const wallet = wallets[0];
      return {
        amount: wallet.available_balance,
        currency: wallet.currency,
      };
    } catch (error) {
      this.handleError(error, 'getBalance');
    }
  }

  async validatePhone(phone: string): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');
    // Kenyan: 2547xxxxxxxx or 2541xxxxxxxx
    // Nigerian: 234xxxxxxxxxx
    return /^254[71]\d{8}$/.test(cleanPhone) || /^234\d{10}$/.test(cleanPhone);
  }
}
