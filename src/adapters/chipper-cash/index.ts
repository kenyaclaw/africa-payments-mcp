/**
 * Chipper Cash API Adapter
 * Official API docs: https://developers.chippercash.com/
 * Pan-African P2P payments platform
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  PaymentProvider, 
  ChipperCashConfig, 
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

interface ChipperCashAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface ChipperCashUserResponse {
  id: string;
  tag: string;
  phone: string;
  email: string;
  displayName: string;
  countryCode: string;
  verified: boolean;
}

interface ChipperCashTransferResponse {
  id: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  recipientId: string;
  recipientTag?: string;
  recipientPhone?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failureReason?: string;
}

interface ChipperCashPaymentRequestResponse {
  id: string;
  status: 'pending' | 'completed' | 'cancelled' | 'expired';
  amount: number;
  currency: string;
  requesterId: string;
  payerId?: string;
  description?: string;
  expiryDate: string;
  createdAt: string;
  updatedAt: string;
}

interface ChipperCashTransactionStatus {
  id: string;
  type: 'transfer' | 'payment_request' | 'deposit' | 'withdrawal';
  status: string;
  amount: number;
  currency: string;
  sender?: {
    id: string;
    tag?: string;
    displayName: string;
  };
  recipient?: {
    id: string;
    tag?: string;
    displayName: string;
  };
  description?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  metadata?: Record<string, any>;
}

interface ChipperCashBalanceResponse {
  available: number;
  pending: number;
  currency: string;
}

export class ChipperCashAdapter implements PaymentProvider {
  readonly name = 'chipper_cash';
  readonly displayName = 'Chipper Cash';
  readonly countries = ['NG', 'GH', 'KE', 'UG', 'ZA', 'GB', 'US'];
  readonly currencies = ['NGN', 'GHS', 'KES', 'UGX', 'ZAR', 'USD', 'GBP'];
  readonly supportedMethods: PaymentMethod[] = ['mobile_money', 'wallet', 'bank_transfer'];

  private accessToken?: string;
  private tokenExpiry?: Date;
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(public readonly config: ChipperCashConfig) {
    this.baseUrl = config.environment === 'production'
      ? 'https://api.chippercash.com/v1'
      : 'https://sandbox-api.chippercash.com/v1';

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
    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new PaymentError(
        'Chipper Cash API key and secret are required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    // Authenticate
    await this.authenticate();
  }

  private async authenticate(): Promise<void> {
    try {
      const response = await this.client.post<ChipperCashAuthResponse>(
        `${this.baseUrl}/auth/token`,
        {
          grant_type: 'client_credentials',
          client_id: this.config.apiKey,
          client_secret: this.config.apiSecret,
        }
      );

      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in;
      // Set expiry 5 minutes early to avoid edge cases
      this.tokenExpiry = new Date(Date.now() + (expiresIn - 300) * 1000);
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new PaymentError(
        `Chipper Cash authentication failed: ${axiosError.message}`,
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

  private mapChipperCashStatus(status: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'pending': 'pending',
      'initiated': 'pending',
      'processing': 'processing',
      'completed': 'completed',
      'success': 'completed',
      'successful': 'completed',
      'failed': 'failed',
      'failure': 'failed',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',
      'expired': 'cancelled',
      'refunded': 'refunded',
      'reversed': 'refunded',
    };
    return statusMap[status?.toLowerCase()] || 'pending';
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
          `Chipper Cash ${operation} failed: Authentication expired`,
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name,
          transactionId,
          true
        );
      }

      if (status === 403) {
        throw new PaymentError(
          `Chipper Cash ${operation} failed: Permission denied`,
          ErrorCodes.PERMISSION_DENIED,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 400) {
        throw new PaymentError(
          `Chipper Cash ${operation} failed: ${data.message || data.error || 'Bad request'}`,
          ErrorCodes.PROVIDER_ERROR,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 404) {
        throw new PaymentError(
          `Chipper Cash ${operation} failed: User or transaction not found`,
          ErrorCodes.TRANSACTION_NOT_FOUND,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 409) {
        throw new PaymentError(
          `Chipper Cash ${operation} failed: Duplicate transaction`,
          ErrorCodes.DUPLICATE_TRANSACTION,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 422) {
        throw new PaymentError(
          `Chipper Cash ${operation} failed: ${data.message || 'Invalid data'}`,
          ErrorCodes.INVALID_AMOUNT,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 429) {
        throw new PaymentError(
          `Chipper Cash ${operation} failed: Rate limited`,
          ErrorCodes.RATE_LIMITED,
          this.name,
          transactionId,
          true
        );
      }

      throw new PaymentError(
        `Chipper Cash ${operation} failed: ${data.message || data.error || `HTTP ${status}`}`,
        ErrorCodes.PROVIDER_ERROR,
        this.name,
        transactionId,
        isRetryable
      );
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      throw new PaymentError(
        `Chipper Cash ${operation} timed out`,
        ErrorCodes.TIMEOUT_ERROR,
        this.name,
        transactionId,
        true
      );
    }

    throw new PaymentError(
      `Chipper Cash ${operation} failed: ${axiosError.message}`,
      ErrorCodes.NETWORK_ERROR,
      this.name,
      transactionId,
      true
    );
  }

  /**
   * Look up a user by phone number or Chipper tag
   */
  private async lookupUser(identifier: string): Promise<ChipperCashUserResponse | null> {
    await this.ensureAuthenticated();

    try {
      // Try looking up by Chipper tag first (starts with $)
      if (identifier.startsWith('$')) {
        const response = await this.client.get<ChipperCashUserResponse>(
          `${this.baseUrl}/users/tag/${identifier.slice(1)}`,
          {
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
            },
          }
        );
        return response.data;
      }

      // Try looking up by phone number
      const cleanPhone = identifier.replace(/\D/g, '');
      const response = await this.client.get<ChipperCashUserResponse>(
        `${this.baseUrl}/users/phone/${cleanPhone}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      return null;
    }
  }

  async sendMoney(params: SendMoneyParams): Promise<Transaction> {
    await this.ensureAuthenticated();

    const id = `chipper_transfer_${Date.now()}`;

    try {
      // Determine recipient identifier (tag, phone, or email)
      let recipientId: string | undefined;
      
      if (params.recipient.phone?.formatted) {
        const user = await this.lookupUser(params.recipient.phone.formatted);
        if (user) {
          recipientId = user.id;
        }
      }

      if (!recipientId && params.recipient.email) {
        // Try to look up by email
        const response = await this.client.get<ChipperCashUserResponse>(
          `${this.baseUrl}/users/email/${encodeURIComponent(params.recipient.email)}`,
          {
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
            },
          }
        );
        recipientId = response.data.id;
      }

      if (!recipientId) {
        throw new PaymentError(
          'Recipient not found on Chipper Cash. User must have a Chipper Cash account.',
          ErrorCodes.PROVIDER_ERROR,
          this.name
        );
      }

      const payload = {
        recipientId,
        amount: params.amount.amount,
        currency: params.amount.currency,
        description: params.description || 'Transfer',
        metadata: params.metadata,
      };

      const response = await this.client.post<ChipperCashTransferResponse>(
        `${this.baseUrl}/transfers`,
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
        providerTransactionId: data.id,
        provider: this.name,
        status: this.mapChipperCashStatus(data.status),
        amount: params.amount,
        customer: {
          name: params.recipient.name,
          phone: params.recipient.phone,
          email: params.recipient.email,
        },
        description: params.description,
        metadata: {
          ...params.metadata,
          recipientId: data.recipientId,
          recipientTag: data.recipientTag,
          recipientPhone: data.recipientPhone,
        },
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
        failureReason: data.failureReason,
      };
    } catch (error) {
      this.handleError(error, 'sendMoney', id);
    }
  }

  async requestPayment(params: RequestPaymentParams): Promise<Transaction> {
    await this.ensureAuthenticated();

    const id = `chipper_request_${Date.now()}`;

    try {
      // Look up the payer if phone is provided
      let payerId: string | undefined;
      
      if (params.customer.phone?.formatted) {
        const user = await this.lookupUser(params.customer.phone.formatted);
        if (user) {
          payerId = user.id;
        }
      }

      const payload: any = {
        amount: params.amount.amount,
        currency: params.amount.currency,
        description: params.description || 'Payment request',
        expiryMinutes: params.expiryMinutes || 1440, // Default 24 hours
        metadata: params.metadata,
      };

      if (payerId) {
        payload.payerId = payerId;
      }

      const response = await this.client.post<ChipperCashPaymentRequestResponse>(
        `${this.baseUrl}/payment-requests`,
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
        providerTransactionId: data.id,
        provider: this.name,
        status: this.mapChipperCashStatus(data.status),
        amount: params.amount,
        customer: params.customer,
        description: params.description,
        metadata: {
          ...params.metadata,
          payerId: data.payerId,
          expiryDate: data.expiryDate,
          paymentRequestId: data.id,
        },
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
      };
    } catch (error) {
      this.handleError(error, 'requestPayment', id);
    }
  }

  async verifyTransaction(id: string): Promise<Transaction> {
    await this.ensureAuthenticated();

    const transactionId = id.replace('chipper_', '').replace('chipper_transfer_', '').replace('chipper_request_', '');

    try {
      const response = await this.client.get<ChipperCashTransactionStatus>(
        `${this.baseUrl}/transactions/${transactionId}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const data = response.data;
      const status = this.mapChipperCashStatus(data.status);

      return {
        id,
        providerTransactionId: data.id,
        provider: this.name,
        status,
        amount: {
          amount: data.amount,
          currency: data.currency,
        },
        customer: {
          name: data.recipient?.displayName || data.sender?.displayName,
        },
        description: data.description,
        metadata: data.metadata,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      };
    } catch (error) {
      this.handleError(error, 'verifyTransaction', id);
    }
  }

  async refund(params: RefundParams): Promise<Transaction> {
    await this.ensureAuthenticated();

    const id = `chipper_refund_${Date.now()}`;

    try {
      const payload: any = {
        originalTransactionId: params.originalTransactionId,
        reason: params.reason || 'Customer request',
      };

      if (params.amount) {
        payload.amount = params.amount.amount;
      }

      const response = await this.client.post<ChipperCashTransferResponse>(
        `${this.baseUrl}/refunds`,
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
        providerTransactionId: data.id,
        provider: this.name,
        status: this.mapChipperCashStatus(data.status),
        amount: params.amount || { amount: 0, currency: 'USD' },
        customer: {},
        description: `Refund: ${params.reason || 'Customer request'}`,
        metadata: {
          originalTransaction: params.originalTransactionId,
        },
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
        failureReason: data.failureReason,
      };
    } catch (error) {
      this.handleError(error, 'refund', id);
    }
  }

  async getBalance(): Promise<Money> {
    await this.ensureAuthenticated();

    try {
      const response = await this.client.get<ChipperCashBalanceResponse>(
        `${this.baseUrl}/wallet/balance`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const data = response.data;

      return {
        amount: data.available,
        currency: data.currency,
      };
    } catch (error) {
      this.handleError(error, 'getBalance');
    }
  }

  async validatePhone(phone: string): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');
    // Chipper Cash supports phone numbers from supported countries
    // Nigeria: 234, Ghana: 233, Kenya: 254, Uganda: 256, South Africa: 27, UK: 44, US: 1
    return /^(234|233|254|256|27|44|1)\d{9,10}$/.test(cleanPhone);
  }

  /**
   * Get user profile information
   */
  async getProfile(): Promise<{
    id: string;
    tag: string;
    displayName: string;
    email: string;
    phone: string;
    verified: boolean;
  }> {
    await this.ensureAuthenticated();

    try {
      const response = await this.client.get<ChipperCashUserResponse>(
        `${this.baseUrl}/users/me`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const data = response.data;
      return {
        id: data.id,
        tag: data.tag,
        displayName: data.displayName,
        email: data.email,
        phone: data.phone,
        verified: data.verified,
      };
    } catch (error) {
      this.handleError(error, 'getProfile');
    }
  }
}
