/**
 * Bitcoin Lightning Network Adapter
 * Provides instant, low-fee Bitcoin payments via Lightning Network
 * Supports LND (Lightning Network Daemon) and Core Lightning (c-lightning)
 * 
 * Official API docs:
 * - LND: https://lightning.engineering/api-docs/api/lnd/
 * - Core Lightning: https://docs.corelightning.org/reference
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  PaymentProvider, 
  BitcoinLightningConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams,
  Transaction,
  TransactionStatus,
  Money,
  PaymentError,
  ErrorCodes,
  PaymentMethod,
  Customer
} from '../../types/index.js';

// ==================== LND API Types ====================

interface LndInvoice {
  r_hash: string;
  payment_request: string;
  add_index: string;
  payment_addr: string;
  amt_paid_sat?: string;
  state?: string;
}

interface LndPayment {
  payment_hash: string;
  value: string;
  creation_date: string;
  fee_sat: string;
  payment_preimage?: string;
  status: string;
  failure_reason?: string;
}

interface LndPayRequest {
  payment_request: string;
  amt?: string;
  fee_limit?: {
    fixed?: string;
    percent?: string;
  };
}

interface LndDecodePayReq {
  destination: string;
  payment_hash: string;
  num_satoshis: string;
  description: string;
  timestamp: string;
  expiry: string;
}

interface LndBalance {
  balance: string;
  pending_open_balance: string;
}

// ==================== Core Lightning API Types ====================

interface CLNInvoice {
  payment_hash: string;
  bolt11: string;
  payment_secret: string;
  expires_at: number;
}

interface CLNPayment {
  id: string;
  payment_hash: string;
  status: string;
  amount_msat: number;
  amount_sent_msat: number;
  created_at: number;
}

// ==================== Lightning Adapter ====================

export class BitcoinLightningAdapter implements PaymentProvider {
  readonly name = 'bitcoin_lightning';
  readonly displayName = 'Bitcoin Lightning';
  readonly countries = ['GLOBAL']; // Available worldwide
  readonly currencies = ['BTC', 'SATS'];
  readonly supportedMethods: PaymentMethod[] = ['wallet', 'qr_code'];

  private client: AxiosInstance;
  private nodeType: 'lnd' | 'core_lightning';
  private macaroonHex?: string;
  private rune?: string;

  constructor(public readonly config: BitcoinLightningConfig) {
    this.nodeType = config.nodeType || 'lnd';
    this.macaroonHex = config.macaroonHex;
    this.rune = config.rune;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication headers based on node type
    if (this.nodeType === 'lnd' && config.macaroonHex) {
      headers['Grpc-Metadata-macaroon'] = config.macaroonHex;
    } else if (this.nodeType === 'core_lightning' && config.rune) {
      headers['Rune'] = config.rune;
    }

    this.client = axios.create({
      baseURL: config.nodeUrl,
      timeout: config.timeoutMs || 30000,
      headers,
    });

    // Add retry interceptor
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
    if (!this.config.nodeUrl) {
      throw new PaymentError(
        'Lightning node URL is required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    if (this.nodeType === 'lnd' && !this.config.macaroonHex) {
      throw new PaymentError(
        'LND macaroon is required for authentication',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    if (this.nodeType === 'core_lightning' && !this.config.rune) {
      throw new PaymentError(
        'Core Lightning rune is required for authentication',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    // Test connection by getting node info
    try {
      if (this.nodeType === 'lnd') {
        await this.client.get('/v1/getinfo');
      } else {
        await this.client.post('/v1/getinfo');
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
        throw new PaymentError(
          'Lightning node authentication failed',
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name
        );
      }
      throw new PaymentError(
        `Failed to connect to Lightning node: ${axiosError.message}`,
        ErrorCodes.NETWORK_ERROR,
        this.name,
        undefined,
        this.isRetryableError(axiosError)
      );
    }
  }

  private satoshisToBtc(sats: number): number {
    return sats / 100_000_000;
  }

  private btcToSatoshis(btc: number): number {
    return Math.round(btc * 100_000_000);
  }

  private mapLndStatus(lndStatus: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'OPEN': 'pending',
      'SETTLED': 'completed',
      'CANCELLED': 'cancelled',
      'ACCEPTED': 'processing',
      'SUCCEEDED': 'completed',
      'FAILED': 'failed',
      'IN_FLIGHT': 'processing',
    };
    return statusMap[lndStatus] || 'pending';
  }

  private mapCLNStatus(clnStatus: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'pending': 'pending',
      'complete': 'completed',
      'failed': 'failed',
    };
    return statusMap[clnStatus] || 'pending';
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
          `Lightning ${operation} failed: Authentication error`,
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 400) {
        throw new PaymentError(
          `Lightning ${operation} failed: ${data.message || 'Invalid request'}`,
          ErrorCodes.INVALID_AMOUNT,
          this.name,
          transactionId,
          false
        );
      }

      throw new PaymentError(
        `Lightning ${operation} failed: ${data.message || `HTTP ${status}`}`,
        ErrorCodes.PROVIDER_ERROR,
        this.name,
        transactionId,
        isRetryable
      );
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      throw new PaymentError(
        `Lightning ${operation} timed out`,
        ErrorCodes.TIMEOUT_ERROR,
        this.name,
        transactionId,
        true
      );
    }

    throw new PaymentError(
      `Lightning ${operation} failed: ${axiosError.message}`,
      ErrorCodes.NETWORK_ERROR,
      this.name,
      transactionId,
      true
    );
  }

  /**
   * Send payment via Lightning Network (pay an invoice)
   */
  async sendMoney(params: SendMoneyParams): Promise<Transaction> {
    const id = `btc_lightning_send_${Date.now()}`;

    try {
      // Extract invoice from metadata or use lightning invoice
      const paymentRequest = params.metadata?.lightningInvoice as string;
      
      if (!paymentRequest) {
        throw new PaymentError(
          'Lightning invoice (payment request) is required',
          ErrorCodes.MISSING_REQUIRED_FIELD,
          this.name
        );
      }

      // Validate invoice format (BOLT11)
      if (!paymentRequest.toLowerCase().startsWith('ln')) {
        throw new PaymentError(
          'Invalid Lightning invoice format',
          ErrorCodes.INVALID_AMOUNT,
          this.name
        );
      }

      // Decode invoice to get amount if not specified
      let amountSats = this.btcToSatoshis(params.amount.amount);
      
      if (this.nodeType === 'lnd') {
        // LND: Decode and pay
        const decodeResponse = await this.client.get<LndDecodePayReq>(
          `/v1/payreq/${paymentRequest}`
        );
        
        const invoiceAmount = parseInt(decodeResponse.data.num_satoshis, 10);
        if (invoiceAmount > 0 && amountSats !== invoiceAmount) {
          // Use invoice amount if specified
          amountSats = invoiceAmount;
        }

        const payPayload: LndPayRequest = {
          payment_request: paymentRequest,
          fee_limit: {
            fixed: String(Math.max(1, Math.floor(amountSats * 0.01))), // 1% fee limit
          },
        };

        const response = await this.client.post<LndPayment>('/v1/channels/transactions', payPayload);
        const data = response.data;

        const customer: Customer = {
          name: params.recipient.name,
          email: params.recipient.email,
        };

        return {
          id,
          providerTransactionId: data.payment_hash,
          provider: this.name,
          status: this.mapLndStatus(data.status),
          amount: {
            amount: this.satoshisToBtc(parseInt(data.value, 10)),
            currency: 'BTC',
          },
          customer,
          description: params.description || 'Lightning payment',
          metadata: {
            ...params.metadata,
            paymentHash: data.payment_hash,
            feeSatoshis: parseInt(data.fee_sat, 10),
            paymentPreimage: data.payment_preimage,
            nodeType: this.nodeType,
          },
          createdAt: new Date(parseInt(data.creation_date, 10) * 1000),
          updatedAt: new Date(),
          completedAt: data.status === 'SUCCEEDED' ? new Date() : undefined,
          failureReason: data.failure_reason,
        };
      } else {
        // Core Lightning: Pay
        const response = await this.client.post<CLNPayment>('/v1/pay', {
          bolt11: paymentRequest,
        });
        const data = response.data;

        return {
          id,
          providerTransactionId: data.payment_hash,
          provider: this.name,
          status: this.mapCLNStatus(data.status),
          amount: {
            amount: this.satoshisToBtc(Math.floor(data.amount_msat / 1000)),
            currency: 'BTC',
          },
          customer: {
            name: params.recipient.name,
            email: params.recipient.email,
          },
          description: params.description || 'Lightning payment',
          metadata: {
            ...params.metadata,
            paymentId: data.id,
            amountSentMsat: data.amount_sent_msat,
            nodeType: this.nodeType,
          },
          createdAt: new Date(data.created_at * 1000),
          updatedAt: new Date(),
          completedAt: data.status === 'complete' ? new Date() : undefined,
        };
      }
    } catch (error) {
      this.handleError(error, 'sendMoney', id);
    }
  }

  /**
   * Generate a Lightning invoice to request payment
   */
  async requestPayment(params: RequestPaymentParams): Promise<Transaction> {
    const id = `btc_lightning_invoice_${Date.now()}`;

    try {
      const amountSats = this.btcToSatoshis(params.amount.amount);
      const description = params.description || 'Payment via Lightning';
      const expirySeconds = (params.expiryMinutes || 60) * 60;

      if (this.nodeType === 'lnd') {
        // LND: Create invoice
        const response = await this.client.post<LndInvoice>('/v1/invoices', {
          value: String(amountSats),
          memo: description,
          expiry: String(expirySeconds),
          private: true, // Include route hints for private channels
        });
        const data = response.data;

        return {
          id,
          providerTransactionId: data.r_hash,
          provider: this.name,
          status: 'pending',
          amount: params.amount,
          customer: params.customer,
          description,
          metadata: {
            ...params.metadata,
            paymentRequest: data.payment_request,
            paymentAddr: data.payment_addr,
            addIndex: data.add_index,
            expiresAt: new Date(Date.now() + expirySeconds * 1000).toISOString(),
            nodeType: this.nodeType,
            // QR code can be generated from payment_request
            qrCodeData: data.payment_request,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      } else {
        // Core Lightning: Create invoice
        const response = await this.client.post<CLNInvoice>('/v1/invoice', {
          amount_msat: amountSats * 1000,
          label: id,
          description,
          expiry: expirySeconds,
        });
        const data = response.data;

        return {
          id,
          providerTransactionId: data.payment_hash,
          provider: this.name,
          status: 'pending',
          amount: params.amount,
          customer: params.customer,
          description,
          metadata: {
            ...params.metadata,
            paymentRequest: data.bolt11,
            paymentSecret: data.payment_secret,
            expiresAt: new Date(data.expires_at * 1000).toISOString(),
            nodeType: this.nodeType,
            qrCodeData: data.bolt11,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    } catch (error) {
      this.handleError(error, 'requestPayment', id);
    }
  }

  /**
   * Check invoice/payment status
   */
  async verifyTransaction(id: string): Promise<Transaction> {
    try {
      const paymentHash = id.replace('btc_lightning_', '');

      if (this.nodeType === 'lnd') {
        // LND: Lookup invoice
        const response = await this.client.get<LndInvoice>(
          `/v1/invoice/${Buffer.from(paymentHash).toString('base64')}`
        );
        const data = response.data;
        
        const status = this.mapLndStatus(data.state || 'OPEN');
        const amountPaid = data.amt_paid_sat ? parseInt(data.amt_paid_sat, 10) : 0;

        return {
          id,
          providerTransactionId: data.r_hash,
          provider: this.name,
          status,
          amount: {
            amount: this.satoshisToBtc(amountPaid),
            currency: 'BTC',
          },
          customer: {},
          description: 'Lightning invoice status',
          metadata: {
            paymentRequest: data.payment_request,
            nodeType: this.nodeType,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: status === 'completed' ? new Date() : undefined,
        };
      } else {
        // Core Lightning: List invoices and find by payment_hash
        const response = await this.client.post<{ invoices: CLNInvoice[] }>('/v1/listinvoices', {
          payment_hash: paymentHash,
        });
        
        const invoice = response.data.invoices?.[0];
        if (!invoice) {
          throw new PaymentError(
            'Invoice not found',
            ErrorCodes.TRANSACTION_NOT_FOUND,
            this.name,
            id
          );
        }

        return {
          id,
          providerTransactionId: invoice.payment_hash,
          provider: this.name,
          status: 'pending', // CLN requires listpays for payment status
          amount: { amount: 0, currency: 'BTC' },
          customer: {},
          description: 'Lightning invoice status',
          metadata: {
            paymentRequest: invoice.bolt11,
            nodeType: this.nodeType,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    } catch (error) {
      this.handleError(error, 'verifyTransaction', id);
    }
  }

  /**
   * Refunds are not natively supported on Lightning
   * But we can create a new invoice for the merchant to pay
   */
  async refund(params: RefundParams): Promise<Transaction> {
    const id = `btc_lightning_refund_${Date.now()}`;

    // Lightning doesn't have native refunds - 
    // we return a special transaction that indicates a refund invoice needs to be generated
    return {
      id,
      providerTransactionId: `refund_${params.originalTransactionId}`,
      provider: this.name,
      status: 'pending',
      amount: params.amount || { amount: 0, currency: 'BTC' },
      customer: {},
      description: `Refund for ${params.originalTransactionId}: ${params.reason || 'Customer request'}`,
      metadata: {
        originalTransactionId: params.originalTransactionId,
        reason: params.reason,
        refundMethod: 'manual_invoice',
        note: 'Generate a new invoice and use sendMoney to process refund',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Get channel balance
   */
  async getBalance(): Promise<Money> {
    try {
      if (this.nodeType === 'lnd') {
        const response = await this.client.get<LndBalance>('/v1/balance/channels');
        const data = response.data;
        
        return {
          amount: this.satoshisToBtc(parseInt(data.balance, 10)),
          currency: 'BTC',
        };
      } else {
        const response = await this.client.post<{ usable: number }>('/v1/getbalance');
        return {
          amount: this.satoshisToBtc(Math.floor(response.data.usable / 1000)),
          currency: 'BTC',
        };
      }
    } catch (error) {
      this.handleError(error, 'getBalance');
    }
  }

  /**
   * Decode and validate a Lightning invoice
   */
  async validateInvoice(invoice: string): Promise<{
    valid: boolean;
    amount?: number;
    description?: string;
    expiry?: Date;
    error?: string;
  }> {
    try {
      if (!invoice.toLowerCase().startsWith('ln')) {
        return { valid: false, error: 'Invalid invoice format' };
      }

      if (this.nodeType === 'lnd') {
        const response = await this.client.get<LndDecodePayReq>(
          `/v1/payreq/${invoice}`
        );
        const data = response.data;
        
        return {
          valid: true,
          amount: this.satoshisToBtc(parseInt(data.num_satoshis, 10)),
          description: data.description,
          expiry: new Date((parseInt(data.timestamp, 10) + parseInt(data.expiry, 10)) * 1000),
        };
      } else {
        // Core Lightning decode
        const response = await this.client.post<{
          amount_msat?: number;
          description: string;
          expiry?: number;
          created_at: number;
        }>('/v1/decode', {
          string: invoice,
        });
        
        const data = response.data;
        return {
          valid: true,
          amount: data.amount_msat ? this.satoshisToBtc(data.amount_msat / 1000) : undefined,
          description: data.description,
          expiry: data.expiry ? new Date((data.created_at + data.expiry) * 1000) : undefined,
        };
      }
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Invalid invoice' 
      };
    }
  }
}
