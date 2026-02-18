/**
 * Orange Money API Adapter
 * Official API docs: https://developer.orange.com/apis/payment-webdev/
 * Supports: Ivory Coast, Senegal, Mali, Burkina Faso, Guinea, etc.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  PaymentProvider, 
  OrangeMoneyConfig, 
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

interface OrangeMoneyAuthResponse {
  token_type: string;
  access_token: string;
  expires_in: number;
}

interface OrangeMoneyPaymentResponse {
  paymentToken: string;
  paymentUrl?: string;
  status: string;
  message?: string;
}

interface OrangeMoneyTransferResponse {
  transactionId: string;
  status: string;
  message?: string;
}

interface OrangeMoneyTransactionStatus {
  status: string;
  message: string;
  transactionId?: string;
  amount?: string;
  currency?: string;
  receiver?: {
    number: string;
    name?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface OrangeMoneyBalanceResponse {
  balances: Array<{
    account: string;
    balance: string;
    currency: string;
  }>;
}

export class OrangeMoneyAdapter implements PaymentProvider {
  readonly name = 'orange_money';
  readonly displayName = 'Orange Money';
  readonly countries = ['CI', 'SN', 'ML', 'BF', 'GN', 'CG', 'MG'];
  readonly currencies = ['XOF', 'XAF', 'GNF', 'MGA'];
  readonly supportedMethods: PaymentMethod[] = ['mobile_money'];

  private accessToken?: string;
  private tokenExpiry?: Date;
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(public readonly config: OrangeMoneyConfig) {
    this.baseUrl = config.environment === 'production'
      ? 'https://api.orange.com/orange-money-webdev'
      : 'https://api.orange.com/orange-money-webdev/dev';

    this.client = axios.create({
      timeout: config.timeoutMs || 30000,
      headers: {
        'Content-Type': 'application/json',
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
          const delay = Math.pow(2, retryCount) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.client(config);
        }

        return Promise.reject(error);
      }
    );
  }

  private isRetryableError(error: AxiosError): boolean {
    return !error.response ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      !!(error.response?.status && error.response.status >= 500);
  }

  async initialize(config: Record<string, any>): Promise<void> {
    // Validate required config
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new PaymentError(
        'Orange Money client ID and secret are required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    if (!this.config.merchantId) {
      throw new PaymentError(
        'Orange Money merchant ID is required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    // Authenticate
    await this.authenticate();
  }

  private async authenticate(): Promise<void> {
    try {
      const auth = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');

      const response = await this.client.post<OrangeMoneyAuthResponse>(
        'https://api.orange.com/oauth/token',
        'grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in;
      // Set expiry 5 minutes early to avoid edge cases
      this.tokenExpiry = new Date(Date.now() + (expiresIn - 300) * 1000);
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new PaymentError(
        `Orange Money authentication failed: ${axiosError.message}`,
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

  private formatPhone(phone: string): string {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    // Ensure it starts with the country code without the +
    if (cleaned.startsWith('0')) {
      // Default to Ivory Coast if starts with 0
      cleaned = '225' + cleaned.substring(1);
    }
    return cleaned;
  }

  private mapOrangeMoneyStatus(status: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'PENDING': 'pending',
      'INITIATED': 'pending',
      'SUCCESS': 'completed',
      'SUCCESSFUL': 'completed',
      'FAILED': 'failed',
      'CANCELLED': 'cancelled',
      'REJECTED': 'failed',
      'REFUNDED': 'refunded',
      'PROCESSING': 'processing',
    };
    return statusMap[status?.toUpperCase()] || 'pending';
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
          `Orange Money ${operation} failed: Authentication expired`,
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name,
          transactionId,
          true
        );
      }

      if (status === 400) {
        throw new PaymentError(
          `Orange Money ${operation} failed: ${data.message || 'Bad request'}`,
          ErrorCodes.PROVIDER_ERROR,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 404) {
        throw new PaymentError(
          `Orange Money ${operation} failed: Transaction not found`,
          ErrorCodes.TRANSACTION_NOT_FOUND,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 409) {
        throw new PaymentError(
          `Orange Money ${operation} failed: Duplicate transaction`,
          ErrorCodes.DUPLICATE_TRANSACTION,
          this.name,
          transactionId,
          false
        );
      }

      throw new PaymentError(
        `Orange Money ${operation} failed: ${data.message || `HTTP ${status}`}`,
        ErrorCodes.PROVIDER_ERROR,
        this.name,
        transactionId,
        isRetryable
      );
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      throw new PaymentError(
        `Orange Money ${operation} timed out`,
        ErrorCodes.TIMEOUT_ERROR,
        this.name,
        transactionId,
        true
      );
    }

    throw new PaymentError(
      `Orange Money ${operation} failed: ${axiosError.message}`,
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
        'Phone number is required for Orange Money transfers',
        ErrorCodes.MISSING_REQUIRED_FIELD,
        this.name
      );
    }

    const id = `orange_transfer_${Date.now()}`;

    try {
      const payload = {
        sender: {
          merchantId: this.config.merchantId,
        },
        receiver: {
          number: this.formatPhone(params.recipient.phone.formatted || params.recipient.phone.nationalNumber),
          name: params.recipient.name,
        },
        amount: {
          value: params.amount.amount,
          currency: params.amount.currency,
        },
        reference: params.metadata?.reference || `OM_${Date.now()}`,
        description: params.description || 'Transfer',
        callbackUrl: params.callbackUrl,
      };

      const response = await this.client.post<OrangeMoneyTransferResponse>(
        `${this.baseUrl}/v1/transfer`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const data = response.data;

      return {
        id,
        providerTransactionId: data.transactionId,
        provider: this.name,
        status: this.mapOrangeMoneyStatus(data.status),
        amount: params.amount,
        customer: {
          name: params.recipient.name,
          phone: params.recipient.phone,
        },
        description: params.description,
        metadata: {
          ...params.metadata,
          transferReference: payload.reference,
          statusMessage: data.message,
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
        'Customer phone number is required for Orange Money payment requests',
        ErrorCodes.MISSING_REQUIRED_FIELD,
        this.name
      );
    }

    const id = `orange_${Date.now()}`;

    try {
      const payload = {
        merchantId: this.config.merchantId,
        subscriber: {
          number: this.formatPhone(params.customer.phone.formatted || params.customer.phone.nationalNumber),
          country: params.customer.country || 'CI',
        },
        amount: {
          value: params.amount.amount,
          currency: params.amount.currency,
        },
        reference: params.metadata?.reference || `OMPAY_${Date.now()}`,
        description: params.description || 'Payment request',
        callbackUrl: params.callbackUrl,
        expiryMinutes: params.expiryMinutes || 30,
      };

      const response = await this.client.post<OrangeMoneyPaymentResponse>(
        `${this.baseUrl}/v1/payment`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const data = response.data;

      return {
        id,
        providerTransactionId: data.paymentToken,
        provider: this.name,
        status: this.mapOrangeMoneyStatus(data.status),
        amount: params.amount,
        customer: params.customer,
        description: params.description,
        metadata: {
          ...params.metadata,
          paymentUrl: data.paymentUrl,
          reference: payload.reference,
          statusMessage: data.message,
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

    const transactionId = id.replace('orange_', '').replace('orange_transfer_', '');

    try {
      const response = await this.client.get<OrangeMoneyTransactionStatus>(
        `${this.baseUrl}/v1/transaction/${transactionId}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const data = response.data;
      const status = this.mapOrangeMoneyStatus(data.status);

      return {
        id,
        providerTransactionId: data.transactionId || transactionId,
        provider: this.name,
        status,
        amount: {
          amount: parseFloat(data.amount || '0'),
          currency: data.currency || 'XOF',
        },
        customer: {
          phone: data.receiver?.number ? {
            formatted: data.receiver.number,
            countryCode: data.receiver.number.substring(0, 3),
            nationalNumber: data.receiver.number.substring(3),
          } : undefined,
          name: data.receiver?.name,
        },
        description: data.message,
        metadata: {
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        },
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
        completedAt: status === 'completed' ? new Date() : undefined,
      };
    } catch (error) {
      this.handleError(error, 'verifyTransaction', id);
    }
  }

  async refund(params: RefundParams): Promise<Transaction> {
    await this.ensureAuthenticated();

    const id = `orange_refund_${Date.now()}`;

    try {
      const payload = {
        originalTransactionId: params.originalTransactionId,
        amount: params.amount?.amount,
        currency: params.amount?.currency,
        reason: params.reason || 'Customer request',
        callbackUrl: params.metadata?.callbackUrl,
      };

      const response = await this.client.post<OrangeMoneyTransferResponse>(
        `${this.baseUrl}/v1/refund`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const data = response.data;

      return {
        id,
        providerTransactionId: data.transactionId,
        provider: this.name,
        status: this.mapOrangeMoneyStatus(data.status),
        amount: params.amount || { amount: 0, currency: 'XOF' },
        customer: {},
        description: `Refund: ${params.reason || 'Customer request'}`,
        metadata: {
          originalTransaction: params.originalTransactionId,
          statusMessage: data.message,
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
      const response = await this.client.get<OrangeMoneyBalanceResponse>(
        `${this.baseUrl}/v1/merchant/balance`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Merchant-ID': this.config.merchantId,
          },
        }
      );

      const data = response.data;
      const primaryBalance = data.balances[0];

      return {
        amount: parseFloat(primaryBalance?.balance || '0'),
        currency: primaryBalance?.currency || 'XOF',
      };
    } catch (error) {
      this.handleError(error, 'getBalance');
    }
  }

  async validatePhone(phone: string): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');
    // Orange Money phone formats by country:
    // Ivory Coast: 225XXXXXXXX
    // Senegal: 2217XXXXXXXX
    // Mali: 223XXXXXXXX
    // Burkina Faso: 226XXXXXXXX
    // Guinea: 224XXXXXXXX
    // Congo: 242XXXXXXXX
    // Madagascar: 261XXXXXXXX
    return /^(225|221|223|226|224|242|261)\d{8,9}$/.test(cleanPhone);
  }
}
