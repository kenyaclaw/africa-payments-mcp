/**
 * Wave API Adapter
 * Official API docs: https://developer.wave.com/
 * QR code + mobile money for Francophone Africa
 * Supports: Senegal, Ivory Coast, Burkina Faso, Mali, Uganda
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  PaymentProvider, 
  WaveConfig, 
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

interface WaveAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

interface WavePaymentRequestResponse {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  qrCode?: string;
  paymentUrl?: string;
  clientReference?: string;
  expiryTime?: string;
  createdAt: string;
  updatedAt: string;
}

interface WaveTransferResponse {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  recipientPhone: string;
  recipientName?: string;
  clientReference?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface WaveTransactionStatus {
  id: string;
  type: 'payment_request' | 'transfer' | 'refund';
  status: string;
  amount: number;
  currency: string;
  fee?: number;
  tax?: number;
  totalAmount?: number;
  sender?: {
    phone?: string;
    name?: string;
  };
  recipient?: {
    phone?: string;
    name?: string;
  };
  clientReference?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failureReason?: string;
}

interface WaveBalanceResponse {
  balance: number;
  currency: string;
  pendingBalance: number;
  availableBalance: number;
}

interface WaveQRCodeResponse {
  qrCodeData: string;
  qrCodeImageUrl: string;
  paymentId: string;
  expiryTime: string;
}

export class WaveAdapter implements PaymentProvider {
  readonly name = 'wave';
  readonly displayName = 'Wave';
  readonly countries = ['SN', 'CI', 'BF', 'ML', 'UG'];
  readonly currencies = ['XOF', 'XAF', 'UGX'];
  readonly supportedMethods: PaymentMethod[] = ['mobile_money', 'qr_code'];

  private accessToken?: string;
  private tokenExpiry?: Date;
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(public readonly config: WaveConfig) {
    this.baseUrl = config.environment === 'production'
      ? 'https://api.wave.com/v1'
      : 'https://sandbox.wave.com/v1';

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
        'Wave API key and secret are required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    if (!this.config.merchantId) {
      throw new PaymentError(
        'Wave merchant ID is required',
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
        `${this.config.apiKey}:${this.config.apiSecret}`
      ).toString('base64');

      const response = await this.client.post<WaveAuthResponse>(
        `${this.baseUrl}/oauth/token`,
        {
          grant_type: 'client_credentials',
          scope: 'payments transfers',
        },
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
        `Wave authentication failed: ${axiosError.message}`,
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
      // Default to Senegal if starts with 0
      cleaned = '221' + cleaned.substring(1);
    }
    return cleaned;
  }

  private mapWaveStatus(status: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'pending': 'pending',
      'processing': 'processing',
      'succeeded': 'completed',
      'successful': 'completed',
      'completed': 'completed',
      'failed': 'failed',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',
      'refunded': 'refunded',
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
          `Wave ${operation} failed: Authentication expired`,
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name,
          transactionId,
          true
        );
      }

      if (status === 403) {
        throw new PaymentError(
          `Wave ${operation} failed: Permission denied`,
          ErrorCodes.PERMISSION_DENIED,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 400) {
        throw new PaymentError(
          `Wave ${operation} failed: ${data.message || data.error || 'Bad request'}`,
          ErrorCodes.PROVIDER_ERROR,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 404) {
        throw new PaymentError(
          `Wave ${operation} failed: Transaction not found`,
          ErrorCodes.TRANSACTION_NOT_FOUND,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 409) {
        throw new PaymentError(
          `Wave ${operation} failed: Duplicate transaction`,
          ErrorCodes.DUPLICATE_TRANSACTION,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 422) {
        throw new PaymentError(
          `Wave ${operation} failed: ${data.message || 'Invalid data'}`,
          ErrorCodes.INVALID_AMOUNT,
          this.name,
          transactionId,
          false
        );
      }

      throw new PaymentError(
        `Wave ${operation} failed: ${data.message || data.error || `HTTP ${status}`}`,
        ErrorCodes.PROVIDER_ERROR,
        this.name,
        transactionId,
        isRetryable
      );
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      throw new PaymentError(
        `Wave ${operation} timed out`,
        ErrorCodes.TIMEOUT_ERROR,
        this.name,
        transactionId,
        true
      );
    }

    throw new PaymentError(
      `Wave ${operation} failed: ${axiosError.message}`,
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
        'Phone number is required for Wave transfers',
        ErrorCodes.MISSING_REQUIRED_FIELD,
        this.name
      );
    }

    const id = `wave_transfer_${Date.now()}`;

    try {
      const payload = {
        amount: params.amount.amount,
        currency: params.amount.currency,
        recipientPhone: this.formatPhone(params.recipient.phone.formatted || params.recipient.phone.nationalNumber),
        recipientName: params.recipient.name,
        clientReference: params.metadata?.reference || `WAVE_TRF_${Date.now()}`,
        description: params.description || 'Transfer',
        callbackUrl: params.callbackUrl,
      };

      const response = await this.client.post<WaveTransferResponse>(
        `${this.baseUrl}/transfers`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Merchant-ID': this.config.merchantId,
          },
        }
      );

      const data = response.data;

      return {
        id,
        providerTransactionId: data.id,
        provider: this.name,
        status: this.mapWaveStatus(data.status),
        amount: params.amount,
        customer: {
          name: params.recipient.name,
          phone: params.recipient.phone,
        },
        description: params.description,
        metadata: {
          ...params.metadata,
          clientReference: data.clientReference,
        },
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      };
    } catch (error) {
      this.handleError(error, 'sendMoney', id);
    }
  }

  async requestPayment(params: RequestPaymentParams): Promise<Transaction> {
    await this.ensureAuthenticated();

    const id = `wave_${Date.now()}`;

    try {
      const payload: any = {
        amount: params.amount.amount,
        currency: params.amount.currency,
        clientReference: params.metadata?.reference || `WAVE_PAY_${Date.now()}`,
        description: params.description || 'Payment request',
        callbackUrl: params.callbackUrl,
        expiryMinutes: params.expiryMinutes || 30,
      };

      // If customer phone is provided, include it for targeted payment request
      if (params.customer.phone?.formatted) {
        payload.customerPhone = this.formatPhone(params.customer.phone.formatted);
      }

      const response = await this.client.post<WavePaymentRequestResponse>(
        `${this.baseUrl}/payment-requests`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Merchant-ID': this.config.merchantId,
          },
        }
      );

      const data = response.data;

      return {
        id,
        providerTransactionId: data.id,
        provider: this.name,
        status: this.mapWaveStatus(data.status),
        amount: params.amount,
        customer: params.customer,
        description: params.description,
        metadata: {
          ...params.metadata,
          clientReference: data.clientReference,
          qrCode: data.qrCode,
          paymentUrl: data.paymentUrl,
          expiryTime: data.expiryTime,
        },
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
      };
    } catch (error) {
      this.handleError(error, 'requestPayment', id);
    }
  }

  /**
   * Generate a QR code for payment
   * This is specific to Wave and allows creating QR codes for in-person payments
   */
  async generateQRCode(
    amount: Money,
    description?: string,
    expiryMinutes: number = 30
  ): Promise<{
    qrCodeData: string;
    qrCodeImageUrl: string;
    paymentId: string;
    expiryTime: string;
  }> {
    await this.ensureAuthenticated();

    try {
      const response = await this.client.post<WaveQRCodeResponse>(
        `${this.baseUrl}/qr-codes`,
        {
          amount: amount.amount,
          currency: amount.currency,
          description: description || 'QR Payment',
          expiryMinutes,
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Merchant-ID': this.config.merchantId,
          },
        }
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'generateQRCode');
    }
  }

  async verifyTransaction(id: string): Promise<Transaction> {
    await this.ensureAuthenticated();

    const transactionId = id.replace('wave_', '').replace('wave_transfer_', '').replace('wave_request_', '');

    try {
      const response = await this.client.get<WaveTransactionStatus>(
        `${this.baseUrl}/transactions/${transactionId}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Merchant-ID': this.config.merchantId,
          },
        }
      );

      const data = response.data;
      const status = this.mapWaveStatus(data.status);

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
          phone: data.recipient?.phone ? {
            formatted: data.recipient.phone,
            countryCode: data.recipient.phone.substring(0, 3),
            nationalNumber: data.recipient.phone.substring(3),
          } : undefined,
          name: data.recipient?.name || data.sender?.name,
        },
        description: data.description,
        metadata: {
          clientReference: data.clientReference,
          fee: data.fee,
          tax: data.tax,
          totalAmount: data.totalAmount,
        },
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
        failureReason: data.failureReason,
      };
    } catch (error) {
      this.handleError(error, 'verifyTransaction', id);
    }
  }

  async refund(params: RefundParams): Promise<Transaction> {
    await this.ensureAuthenticated();

    const id = `wave_refund_${Date.now()}`;

    try {
      const payload: any = {
        originalTransactionId: params.originalTransactionId,
        reason: params.reason || 'Customer request',
      };

      if (params.amount) {
        payload.amount = params.amount.amount;
        payload.currency = params.amount.currency;
      }

      const response = await this.client.post<WaveTransferResponse>(
        `${this.baseUrl}/refunds`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Merchant-ID': this.config.merchantId,
          },
        }
      );

      const data = response.data;

      return {
        id,
        providerTransactionId: data.id,
        provider: this.name,
        status: this.mapWaveStatus(data.status),
        amount: params.amount || { amount: 0, currency: 'XOF' },
        customer: {},
        description: `Refund: ${params.reason || 'Customer request'}`,
        metadata: {
          originalTransaction: params.originalTransactionId,
        },
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      };
    } catch (error) {
      this.handleError(error, 'refund', id);
    }
  }

  async getBalance(): Promise<Money> {
    await this.ensureAuthenticated();

    try {
      const response = await this.client.get<WaveBalanceResponse>(
        `${this.baseUrl}/merchant/balance`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Merchant-ID': this.config.merchantId,
          },
        }
      );

      const data = response.data;

      return {
        amount: data.availableBalance,
        currency: data.currency,
      };
    } catch (error) {
      this.handleError(error, 'getBalance');
    }
  }

  async validatePhone(phone: string): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');
    // Wave phone formats by country:
    // Senegal: 2217XXXXXXXX
    // Ivory Coast: 225XXXXXXXX
    // Burkina Faso: 226XXXXXXXX
    // Mali: 223XXXXXXXX
    // Uganda: 2567XXXXXXXX
    return /^(221|225|226|223|256)\d{8,9}$/.test(cleanPhone);
  }
}
