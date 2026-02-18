/**
 * Paystack API Adapter
 * Official API docs: https://paystack.com/docs/api/
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  PaymentProvider, 
  PaystackConfig, 
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

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    domain: string;
    status: string;
    reference: string;
    amount: number;
    message: string | null;
    gateway_response: string;
    paid_at: string | null;
    created_at: string;
    channel: string;
    currency: string;
    ip_address: string;
    metadata: any;
    log: any;
    fees: number | null;
    fees_split: any;
    authorization: any;
    customer: {
      id: number;
      first_name: string;
      last_name: string;
      email: string;
      customer_code: string;
      phone: string;
      metadata: any;
      risk_action: string;
    };
    plan: any;
    order_id: string | null;
    paidAt: string | null;
    createdAt: string;
    requested_amount: number;
  };
}

interface PaystackTransferResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    integration: number;
    domain: string;
    amount: number;
    currency: string;
    source: string;
    reason: string;
    recipient: number;
    status: string;
    transfer_code: string;
    id: number;
    createdAt: string;
    updatedAt: string;
  };
}

interface PaystackRefundResponse {
  status: boolean;
  message: string;
  data: {
    transaction: {
      id: number;
      domain: string;
      reference: string;
      amount: number;
      paid_at: string;
    };
    currency: string;
    refunded_by: string;
    refunded_at: string;
    expected_at: string;
    refund_reference: string;
    id: number;
    integration: number;
    deducted_amount: number;
    merchant_note: string;
    customer_note: string;
    status: string;
    amount: number;
  };
}

interface PaystackBalanceResponse {
  status: boolean;
  message: string;
  data: Array<{
    currency: string;
    balance: number;
  }>;
}

export class PaystackAdapter implements PaymentProvider {
  readonly name = 'paystack';
  readonly displayName = 'Paystack';
  readonly countries = ['NG', 'GH', 'ZA', 'KE'];
  readonly currencies = ['NGN', 'GHS', 'ZAR', 'USD'];
  readonly supportedMethods: PaymentMethod[] = ['card', 'bank_transfer', 'mobile_money'];

  private client: AxiosInstance;
  private baseUrl = 'https://api.paystack.co';

  constructor(public readonly config: PaystackConfig) {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.timeoutMs || 30000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.secretKey}`,
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
    // Validate secret key format
    if (!this.config.secretKey) {
      throw new PaymentError(
        'Paystack secret key is required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    if (!this.config.secretKey.startsWith('sk_')) {
      throw new PaymentError(
        'Invalid Paystack secret key format. Must start with "sk_"',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    // Verify API key is valid by calling the bank endpoint
    try {
      const response = await this.client.get('/bank');
      if (!response.data.status) {
        throw new PaymentError(
          'Paystack API key validation failed',
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name
        );
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 401) {
        throw new PaymentError(
          'Invalid Paystack secret key',
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name
        );
      }
      throw new PaymentError(
        `Paystack initialization failed: ${axiosError.message}`,
        ErrorCodes.NETWORK_ERROR,
        this.name,
        undefined,
        this.isRetryableError(axiosError)
      );
    }
  }

  private mapPaystackStatus(paystackStatus: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'success': 'completed',
      'failed': 'failed',
      'abandoned': 'cancelled',
      'pending': 'pending',
      'ongoing': 'processing',
      'processing': 'processing',
      'queued': 'pending',
      'reversed': 'refunded',
    };
    return statusMap[paystackStatus] || 'failed';
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
          `Paystack ${operation} failed: Invalid API key`,
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 400) {
        throw new PaymentError(
          `Paystack ${operation} failed: ${data.message || 'Bad request'}`,
          ErrorCodes.INVALID_AMOUNT,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 404) {
        throw new PaymentError(
          `Paystack ${operation} failed: Transaction not found`,
          ErrorCodes.TRANSACTION_NOT_FOUND,
          this.name,
          transactionId,
          false
        );
      }

      throw new PaymentError(
        `Paystack ${operation} failed: ${data.message || `HTTP ${status}`}`,
        ErrorCodes.PROVIDER_ERROR,
        this.name,
        transactionId,
        isRetryable
      );
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      throw new PaymentError(
        `Paystack ${operation} timed out`,
        ErrorCodes.TIMEOUT_ERROR,
        this.name,
        transactionId,
        true
      );
    }

    throw new PaymentError(
      `Paystack ${operation} failed: ${axiosError.message}`,
      ErrorCodes.NETWORK_ERROR,
      this.name,
      transactionId,
      true
    );
  }

  async sendMoney(params: SendMoneyParams): Promise<Transaction> {
    // For Paystack, we need to first create a transfer recipient, then initiate the transfer
    // This is a simplified implementation
    const id = `paystack_transfer_${Date.now()}`;

    try {
      // Step 1: Create transfer recipient (if bank account)
      let recipientCode: string;

      if (params.recipient.bankAccount) {
        const recipientResponse = await this.client.post('/transferrecipient', {
          type: 'nuban',
          name: params.recipient.bankAccount.accountName || params.recipient.name,
          account_number: params.recipient.bankAccount.accountNumber,
          bank_code: params.recipient.bankAccount.bankCode,
          currency: params.amount.currency,
        });

        if (!recipientResponse.data.status) {
          throw new PaymentError(
            'Failed to create transfer recipient',
            ErrorCodes.PROVIDER_ERROR,
            this.name
          );
        }

        recipientCode = recipientResponse.data.data.recipient_code;
      } else {
        throw new PaymentError(
          'Bank account details required for Paystack transfers',
          ErrorCodes.MISSING_REQUIRED_FIELD,
          this.name
        );
      }

      // Step 2: Initiate transfer
      const response = await this.client.post<PaystackTransferResponse>('/transfer', {
        source: 'balance',
        amount: params.amount.amount * 100, // Paystack amounts are in kobo/pesewas
        recipient: recipientCode,
        reason: params.description || 'Transfer',
        reference: `TRF_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      });

      if (!response.data.status) {
        throw new PaymentError(
          response.data.message || 'Transfer initiation failed',
          ErrorCodes.TRANSACTION_FAILED,
          this.name
        );
      }

      const data = response.data.data;

      return {
        id,
        providerTransactionId: data.transfer_code,
        provider: this.name,
        status: this.mapPaystackStatus(data.status),
        amount: params.amount,
        customer: {
          name: params.recipient.name,
          phone: params.recipient.phone,
          email: params.recipient.email,
        },
        description: params.description,
        metadata: {
          ...params.metadata,
          transferReference: data.reference,
          paystackTransferId: data.id,
        },
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
      };
    } catch (error) {
      this.handleError(error, 'sendMoney', id);
    }
  }

  async requestPayment(params: RequestPaymentParams): Promise<Transaction> {
    const id = `paystack_${Date.now()}`;
    const reference = `PS_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
      const payload: any = {
        email: params.customer.email || `customer_${Date.now()}@placeholder.com`,
        amount: params.amount.amount * 100, // Paystack amounts are in kobo/pesewas
        reference: reference,
        currency: params.amount.currency,
        callback_url: params.callbackUrl,
        metadata: {
          ...params.metadata,
          custom_fields: [
            {
              display_name: 'Customer Name',
              variable_name: 'customer_name',
              value: params.customer.name || 'Unknown',
            },
            {
              display_name: 'Phone Number',
              variable_name: 'phone_number',
              value: params.customer.phone?.formatted || '',
            },
          ],
        },
      };

      // Add channels based on supported methods
      if (params.metadata?.channels) {
        payload.channels = params.metadata.channels;
      }

      const response = await this.client.post<PaystackInitializeResponse>('/transaction/initialize', payload);

      if (!response.data.status) {
        throw new PaymentError(
          response.data.message || 'Payment initialization failed',
          ErrorCodes.TRANSACTION_FAILED,
          this.name
        );
      }

      const data = response.data.data;

      return {
        id,
        providerTransactionId: data.reference,
        provider: this.name,
        status: 'pending',
        amount: params.amount,
        customer: params.customer,
        description: params.description,
        metadata: {
          ...params.metadata,
          paymentLink: data.authorization_url,
          accessCode: data.access_code,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      this.handleError(error, 'requestPayment', id);
    }
  }

  async verifyTransaction(id: string): Promise<Transaction> {
    // Extract the reference from the id
    const reference = id.startsWith('paystack_') ? id.replace('paystack_', '') : id;

    try {
      const response = await this.client.get<PaystackVerifyResponse>(`/transaction/verify/${reference}`);

      if (!response.data.status) {
        throw new PaymentError(
          response.data.message || 'Transaction verification failed',
          ErrorCodes.PROVIDER_ERROR,
          this.name,
          id
        );
      }

      const data = response.data.data;
      const status = this.mapPaystackStatus(data.status);

      return {
        id,
        providerTransactionId: data.reference,
        provider: this.name,
        status,
        amount: { 
          amount: data.amount / 100, // Convert from kobo/pesewas
          currency: data.currency 
        },
        customer: {
          email: data.customer.email,
          name: `${data.customer.first_name} ${data.customer.last_name}`.trim(),
          phone: data.customer.phone ? { 
            formatted: data.customer.phone,
            countryCode: '',
            nationalNumber: data.customer.phone
          } : undefined,
        },
        description: data.metadata?.description || data.gateway_response,
        metadata: {
          channel: data.channel,
          gatewayResponse: data.gateway_response,
          fees: data.fees ? data.fees / 100 : 0,
          authorization: data.authorization,
          log: data.log,
        },
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.paidAt || data.createdAt),
        completedAt: data.paidAt ? new Date(data.paidAt) : undefined,
        failureReason: status === 'failed' ? data.gateway_response : undefined,
      };
    } catch (error) {
      this.handleError(error, 'verifyTransaction', id);
    }
  }

  async refund(params: RefundParams): Promise<Transaction> {
    const id = `paystack_refund_${Date.now()}`;

    try {
      const payload: any = {
        transaction: params.originalTransactionId,
      };

      if (params.amount) {
        payload.amount = params.amount.amount * 100; // Convert to kobo/pesewas
      }

      if (params.reason) {
        payload.merchant_note = params.reason;
      }

      const response = await this.client.post<PaystackRefundResponse>('/refund', payload);

      if (!response.data.status) {
        throw new PaymentError(
          response.data.message || 'Refund failed',
          ErrorCodes.TRANSACTION_FAILED,
          this.name
        );
      }

      const data = response.data.data;

      return {
        id,
        providerTransactionId: data.refund_reference,
        provider: this.name,
        status: this.mapPaystackStatus(data.status),
        amount: { 
          amount: data.amount / 100, // Convert from kobo/pesewas
          currency: data.currency 
        },
        customer: {},
        description: `Refund: ${params.reason || 'Customer request'}`,
        metadata: {
          originalTransaction: params.originalTransactionId,
          deductedAmount: data.deducted_amount ? data.deducted_amount / 100 : 0,
          customerNote: data.customer_note,
        },
        createdAt: new Date(data.refunded_at),
        updatedAt: new Date(),
        completedAt: data.status === 'processed' ? new Date() : undefined,
      };
    } catch (error) {
      this.handleError(error, 'refund', id);
    }
  }

  async getBalance(): Promise<Money> {
    try {
      const response = await this.client.get<PaystackBalanceResponse>('/balance');

      if (!response.data.status) {
        throw new PaymentError(
          response.data.message || 'Failed to fetch balance',
          ErrorCodes.PROVIDER_ERROR,
          this.name
        );
      }

      // Return the first balance (usually NGN)
      const balance = response.data.data[0];
      return {
        amount: balance.balance / 100, // Convert from kobo/pesewas
        currency: balance.currency,
      };
    } catch (error) {
      this.handleError(error, 'getBalance');
    }
  }

  async getRates(from: string, to: string): Promise<number> {
    // Paystack doesn't provide FX rates directly
    // Return mock rates for common conversions
    const rates: Record<string, number> = {
      'USD_NGN': 1550,
      'USD_GHS': 15.8,
      'USD_ZAR': 18.5,
      'GBP_NGN': 1950,
      'EUR_NGN': 1650,
      'NGN_USD': 1/1550,
      'GHS_USD': 1/15.8,
      'ZAR_USD': 1/18.5,
    };
    
    const key = `${from}_${to}`;
    return rates[key] || 1;
  }
}
