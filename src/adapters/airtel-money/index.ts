/**
 * Airtel Money API Adapter
 * Official API docs: https://developers.airtel.africa/
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  PaymentProvider, 
  AirtelMoneyConfig, 
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

interface AirtelAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface AirtelCollectionResponse {
  transactionId: string;
  status: {
    code: string;
    message: string;
    result_code: string;
    response_code: string;
    success: boolean;
  };
}

interface AirtelDisbursementResponse {
  transaction: {
    id: string;
    status: string;
  };
  status: {
    code: string;
    message: string;
    success: boolean;
  };
}

interface AirtelTransactionStatus {
  transaction: {
    id: string;
    message: string;
    status: string;
    airtel_money_id: string;
  };
  status: {
    code: string;
    message: string;
    result_code: string;
    response_code: string;
    success: boolean;
  };
}

interface AirtelRefundResponse {
  transaction: {
    id: string;
    status: string;
  };
  status: {
    code: string;
    message: string;
    success: boolean;
  };
}

interface AirtelBalanceResponse {
  balance: string;
  currency: string;
}

export class AirtelMoneyAdapter implements PaymentProvider {
  readonly name = 'airtel_money';
  readonly displayName = 'Airtel Money';
  readonly countries = ['KE', 'UG', 'TZ', 'ZM', 'MW', 'RW'];
  readonly currencies = ['KES', 'UGX', 'TZS', 'ZMW', 'MWK', 'RWF'];
  readonly supportedMethods: PaymentMethod[] = ['mobile_money'];

  private accessToken?: string;
  private tokenExpiry?: Date;
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(public readonly config: AirtelMoneyConfig) {
    this.baseUrl = config.environment === 'production'
      ? 'https://openapi.airtel.africa'
      : 'https://openapiuat.airtel.africa';

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
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new PaymentError(
        'Airtel Money client ID and secret are required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    // Authenticate
    await this.authenticate();
  }

  private async authenticate(): Promise<void> {
    try {
      const response = await this.client.post<AirtelAuthResponse>(
        `${this.baseUrl}/auth/oauth2/token`,
        {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'client_credentials',
        }
      );

      this.accessToken = response.data.access_token;
      // Set expiry 5 minutes early
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 300) * 1000);
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new PaymentError(
        `Airtel Money authentication failed: ${axiosError.message}`,
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
      // Default to Kenya if starts with 0 - should be configurable
      cleaned = '254' + cleaned.substring(1);
    }
    return cleaned;
  }

  private mapAirtelStatus(airtelStatus: string, success: boolean): TransactionStatus {
    if (!success) return 'failed';
    
    const statusMap: Record<string, TransactionStatus> = {
      'TS': 'completed', // Transaction Success
      'TF': 'failed',    // Transaction Failed
      'TA': 'pending',   // Transaction Accepted/Initiated
      'TP': 'processing', // Transaction Processing
      'TIP': 'pending',  // Transaction In Progress
      'TRP': 'refunded', // Transaction Refunded
    };
    return statusMap[airtelStatus?.toUpperCase()] || 'pending';
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
          `Airtel Money ${operation} failed: Authentication expired`,
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name,
          transactionId,
          true
        );
      }

      if (status === 400) {
        throw new PaymentError(
          `Airtel Money ${operation} failed: ${data.message || 'Bad request'}`,
          ErrorCodes.PROVIDER_ERROR,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 404) {
        throw new PaymentError(
          `Airtel Money ${operation} failed: Transaction not found`,
          ErrorCodes.TRANSACTION_NOT_FOUND,
          this.name,
          transactionId,
          false
        );
      }

      throw new PaymentError(
        `Airtel Money ${operation} failed: ${data.message || data.errorMessage || `HTTP ${status}`}`,
        ErrorCodes.PROVIDER_ERROR,
        this.name,
        transactionId,
        isRetryable
      );
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      throw new PaymentError(
        `Airtel Money ${operation} timed out`,
        ErrorCodes.TIMEOUT_ERROR,
        this.name,
        transactionId,
        true
      );
    }

    throw new PaymentError(
      `Airtel Money ${operation} failed: ${axiosError.message}`,
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
        'Phone number is required for Airtel Money transfers',
        ErrorCodes.MISSING_REQUIRED_FIELD,
        this.name
      );
    }

    const id = `airtel_transfer_${Date.now()}`;

    try {
      const payload = {
        payee: {
          msisdn: this.formatPhone(params.recipient.phone.formatted || params.recipient.phone.nationalNumber),
        },
        reference: `AIRTEL_TRF_${Date.now()}`,
        pin: '', // Required but typically empty for API calls
        transaction: {
          amount: params.amount.amount,
          id: `TRX_${Date.now()}`,
        },
      };

      const response = await this.client.post<AirtelDisbursementResponse>(
        `${this.baseUrl}/standard/v2/disbursements/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Country': params.recipient.phone.countryCode === '254' ? 'KE' : 
                         params.recipient.phone.countryCode === '256' ? 'UG' : 
                         params.recipient.phone.countryCode === '255' ? 'TZ' : 'KE',
            'X-Currency': params.amount.currency,
          },
        }
      );

      const data = response.data;
      const status = this.mapAirtelStatus(
        data.transaction.status, 
        data.status.success
      );

      return {
        id,
        providerTransactionId: data.transaction.id,
        provider: this.name,
        status,
        amount: params.amount,
        customer: { 
          name: params.recipient.name, 
          phone: params.recipient.phone 
        },
        description: params.description,
        metadata: {
          ...params.metadata,
          reference: payload.reference,
          airtelTransactionId: data.transaction.id,
          statusCode: data.status.code,
          statusMessage: data.status.message,
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
        'Customer phone number is required for Airtel Money collection',
        ErrorCodes.MISSING_REQUIRED_FIELD,
        this.name
      );
    }

    const id = `airtel_${Date.now()}`;

    try {
      const payload = {
        reference: `AIRTEL_COL_${Date.now()}`,
        subscriber: {
          country: params.customer.country || 'KE',
          currency: params.amount.currency,
          msisdn: this.formatPhone(params.customer.phone.formatted || params.customer.phone.nationalNumber),
        },
        transaction: {
          amount: params.amount.amount,
          id: `TRX_${Date.now()}`,
        },
      };

      const response = await this.client.post<AirtelCollectionResponse>(
        `${this.baseUrl}/merchant/v1/payments/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Country': params.customer.country || 'KE',
            'X-Currency': params.amount.currency,
          },
        }
      );

      const data = response.data;
      const status = this.mapAirtelStatus(
        data.status.code, 
        data.status.success
      );

      return {
        id,
        providerTransactionId: data.transactionId,
        provider: this.name,
        status,
        amount: params.amount,
        customer: params.customer,
        description: params.description,
        metadata: {
          ...params.metadata,
          reference: payload.reference,
          resultCode: data.status.result_code,
          responseCode: data.status.response_code,
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

    const transactionId = id.replace('airtel_', '').replace('airtel_transfer_', '');

    try {
      const response = await this.client.get<AirtelTransactionStatus>(
        `${this.baseUrl}/standard/v1/payments/${transactionId}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const data = response.data;
      const status = this.mapAirtelStatus(
        data.transaction.status,
        data.status.success
      );

      return {
        id,
        providerTransactionId: data.transaction.id,
        provider: this.name,
        status,
        amount: { amount: 0, currency: 'KES' }, // Amount not returned in status response
        customer: {},
        description: data.transaction.message || 'Airtel Money transaction',
        metadata: {
          airtelMoneyId: data.transaction.airtel_money_id,
          resultCode: data.status.result_code,
          responseCode: data.status.response_code,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: status === 'completed' ? new Date() : undefined,
      };
    } catch (error) {
      this.handleError(error, 'verifyTransaction', id);
    }
  }

  async refund(params: RefundParams): Promise<Transaction> {
    await this.ensureAuthenticated();

    const id = `airtel_refund_${Date.now()}`;

    try {
      const payload = {
        transaction: {
          airtel_money_id: params.originalTransactionId,
        },
      };

      const response = await this.client.post<AirtelRefundResponse>(
        `${this.baseUrl}/standard/v2/payments/refund`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const data = response.data;
      const status = this.mapAirtelStatus(
        data.transaction.status,
        data.status.success
      );

      return {
        id,
        providerTransactionId: data.transaction.id,
        provider: this.name,
        status,
        amount: params.amount || { amount: 0, currency: 'KES' },
        customer: {},
        description: `Refund: ${params.reason || 'Customer request'}`,
        metadata: {
          originalTransaction: params.originalTransactionId,
          statusCode: data.status.code,
          statusMessage: data.status.message,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: status === 'completed' ? new Date() : undefined,
      };
    } catch (error) {
      this.handleError(error, 'refund', id);
    }
  }

  async getBalance(): Promise<Money> {
    await this.ensureAuthenticated();

    try {
      // Airtel Money API doesn't have a direct balance endpoint
      // This is a placeholder - in production, you might need to use
      // a different approach or partner endpoint
      
      // For now, return a mock response indicating the limitation
      // In real implementation, you might query a specific merchant endpoint
      
      return { amount: 0, currency: 'KES' };
    } catch (error) {
      this.handleError(error, 'getBalance');
    }
  }

  async validatePhone(phone: string): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');
    // Airtel Money phone formats by country:
    // Kenya: 2547xxxxxxxx
    // Uganda: 2567xxxxxxxx
    // Tanzania: 2557xxxxxxxx
    // Zambia: 26097xxxxxxxx
    // Malawi: 26599xxxxxxxx
    // Rwanda: 2507xxxxxxxx
    return /^(254|256|255|260|265|250)\d{9}$/.test(cleanPhone);
  }
}
