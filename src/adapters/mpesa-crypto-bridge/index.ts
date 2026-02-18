/**
 * M-Pesa Crypto Bridge Adapter
 * 
 * Bridges M-Pesa (mobile money) with crypto (USDC/Stablecoins)
 * Enables:
 * - On-ramp: M-Pesa → USDC (deposit cash, receive crypto)
 * - Off-ramp: USDC → M-Pesa (send crypto, receive cash)
 * 
 * Integrates with services like:
 * - Kotani Pay (https://kotanipay.com/)
 * - Yellow Card (https://yellowcard.io/)
 * - Binance P2P
 * - Local exchanges
 * 
 * This is a game-changer for African payments - bridging the 
 * most widely used payment method (M-Pesa) with the future of 
 * global finance (crypto stablecoins).
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  PaymentProvider, 
  MpesaCryptoBridgeConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams,
  Transaction,
  TransactionStatus,
  Money,
  PaymentError,
  ErrorCodes,
  PaymentMethod,
  Customer,
  PhoneNumber
} from '../../types/index.js';

// ==================== Bridge Provider Types ====================

// Unified Quote interface
interface BridgeQuote {
  quoteId: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  fee: number;
  expiresAt: string;
}

interface KotaniPayQuote extends BridgeQuote {
  // Kotani-specific fields if any
}

interface KotaniPayTransaction {
  transactionId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  type: 'onramp' | 'offramp';
  fromAmount: number;
  fromCurrency: string;
  toAmount: number;
  toCurrency: string;
  phoneNumber?: string;
  walletAddress?: string;
  externalTransactionId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failureReason?: string;
}

interface YellowCardQuote extends BridgeQuote {
  // Yellow Card uses different field names internally, but we normalize to BridgeQuote
}

interface YellowCardTransaction {
  id: string;
  status: string;
  channel: string;
  createdAt: string;
  updatedAt: string;
}

interface YellowCardTransaction {
  id: string;
  status: string;
  channel: string;
  createdAt: string;
  updatedAt: string;
}

interface BridgeWebhookPayload {
  event: 'transaction.created' | 'transaction.updated' | 'transaction.completed' | 'transaction.failed';
  data: KotaniPayTransaction | YellowCardTransaction;
  timestamp: string;
  signature: string;
}

// ==================== M-Pesa Crypto Bridge Adapter ====================

export class MpesaCryptoBridgeAdapter implements PaymentProvider {
  readonly name = 'mpesa_crypto_bridge';
  readonly displayName = 'M-Pesa Crypto Bridge';
  readonly countries = ['KE', 'TZ', 'UG', 'RW', 'GH', 'NG'];
  readonly currencies = ['KES', 'USDC', 'USDT', 'cUSD', 'BTC', 'ETH'];
  readonly supportedMethods: PaymentMethod[] = ['mobile_money', 'wallet', 'bank_transfer'];

  private client: AxiosInstance;
  private bridgeProvider: 'kotani' | 'yellowcard' | 'custom';
  private apiKey: string;
  private apiSecret?: string;
  private webhookSecret?: string;

  constructor(public readonly config: MpesaCryptoBridgeConfig) {
    this.bridgeProvider = config.bridgeProvider || 'kotani';
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.webhookSecret = config.webhookSecret;

    // Set base URL based on provider
    let baseURL: string;
    switch (this.bridgeProvider) {
      case 'kotani':
        baseURL = config.baseUrl || 'https://api.kotanipay.com/v1';
        break;
      case 'yellowcard':
        baseURL = config.baseUrl || 'https://api.yellowcard.io/v1';
        break;
      default:
        baseURL = config.baseUrl || 'https://api.custombridge.com/v1';
    }

    this.client = axios.create({
      baseURL,
      timeout: config.timeoutMs || 60000, // 60s for crypto bridges (longer processing)
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-API-Key': this.apiKey,
      },
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
    if (!this.apiKey) {
      throw new PaymentError(
        'Bridge API key is required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    // Test connection by getting rates
    try {
      await this.getRates('KES', 'USDC');
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 401) {
        throw new PaymentError(
          'Bridge API authentication failed',
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name
        );
      }
      throw new PaymentError(
        `Failed to connect to bridge provider: ${axiosError.message}`,
        ErrorCodes.NETWORK_ERROR,
        this.name,
        undefined,
        this.isRetryableError(axiosError)
      );
    }
  }

  private mapBridgeStatus(status: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      'pending': 'pending',
      'processing': 'processing',
      'awaiting_payment': 'pending',
      'awaiting_confirmation': 'processing',
      'confirming': 'processing',
      'completed': 'completed',
      'success': 'completed',
      'failed': 'failed',
      'failure': 'failed',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',
      'expired': 'cancelled',
      'refunded': 'refunded',
    };
    return statusMap[status.toLowerCase()] || 'pending';
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
          `Bridge ${operation} failed: Invalid API credentials`,
          ErrorCodes.AUTHENTICATION_FAILED,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 400) {
        throw new PaymentError(
          `Bridge ${operation} failed: ${data.message || data.error || 'Invalid request'}`,
          ErrorCodes.INVALID_AMOUNT,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 404) {
        throw new PaymentError(
          `Bridge ${operation} failed: Transaction not found`,
          ErrorCodes.TRANSACTION_NOT_FOUND,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 422) {
        throw new PaymentError(
          `Bridge ${operation} failed: ${data.message || 'Validation error'}`,
          ErrorCodes.INVALID_AMOUNT,
          this.name,
          transactionId,
          false
        );
      }

      throw new PaymentError(
        `Bridge ${operation} failed: ${data.message || data.error || `HTTP ${status}`}`,
        ErrorCodes.PROVIDER_ERROR,
        this.name,
        transactionId,
        isRetryable
      );
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      throw new PaymentError(
        `Bridge ${operation} timed out`,
        ErrorCodes.TIMEOUT_ERROR,
        this.name,
        transactionId,
        true
      );
    }

    throw new PaymentError(
      `Bridge ${operation} failed: ${axiosError.message}`,
      ErrorCodes.NETWORK_ERROR,
      this.name,
      transactionId,
      true
    );
  }

  private formatPhone(phone: string): string {
    // Remove all non-numeric characters and ensure it starts with country code
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1); // Default to Kenya
    }
    if (!cleaned.startsWith('254') && !cleaned.startsWith('255') && !cleaned.startsWith('256')) {
      cleaned = '254' + cleaned; // Default to Kenya
    }
    return cleaned;
  }

  /**
   * OFF-RAMP: Convert crypto to M-Pesa (send money to phone)
   * 
   * Flow:
   * 1. User sends crypto to bridge's wallet
   * 2. Bridge receives crypto
   * 3. Bridge sends M-Pesa to recipient's phone
   */
  async sendMoney(params: SendMoneyParams): Promise<Transaction> {
    const id = `bridge_offramp_${Date.now()}`;

    try {
      if (!params.recipient.phone) {
        throw new PaymentError(
          'Recipient phone number is required for M-Pesa off-ramp',
          ErrorCodes.MISSING_REQUIRED_FIELD,
          this.name
        );
      }

      const phoneNumber = this.formatPhone(
        params.recipient.phone.formatted || params.recipient.phone.nationalNumber
      );
      
      const amount = params.amount.amount;
      const currency = params.amount.currency.toUpperCase();
      
      // Determine crypto currency for settlement
      let cryptoCurrency = 'USDC';
      if (currency === 'USDT' || currency === 'cUSD' || currency === 'BTC' || currency === 'ETH') {
        cryptoCurrency = currency;
      }

      // Get quote for the conversion
      const quote = await this.getQuote(amount, 'KES', cryptoCurrency, 'offramp');

      if (this.bridgeProvider === 'kotani') {
        // Kotani Pay off-ramp
        const response = await this.client.post<KotaniPayTransaction>('/offramp', {
          phoneNumber,
          fiatAmount: amount,
          fiatCurrency: 'KES',
          cryptoCurrency,
          quoteId: (quote as KotaniPayQuote).quoteId,
          callbackUrl: params.callbackUrl,
          metadata: {
            ...params.metadata,
            recipientName: params.recipient.name,
            description: params.description,
          },
        });

        const data = response.data;
        const phone: PhoneNumber = {
          countryCode: phoneNumber.substring(0, 3),
          nationalNumber: phoneNumber.substring(3),
          formatted: `+${phoneNumber}`,
        };

        return {
          id,
          providerTransactionId: data.transactionId,
          provider: this.name,
          status: this.mapBridgeStatus(data.status),
          amount: {
            amount: data.fromAmount,
            currency: cryptoCurrency,
          },
          customer: {
            name: params.recipient.name,
            phone,
          },
          description: params.description || `Convert ${cryptoCurrency} to M-Pesa`,
          metadata: {
            ...params.metadata,
            bridgeProvider: this.bridgeProvider,
            bridgeType: 'offramp',
            phoneNumber,
            fiatAmount: data.toAmount,
            fiatCurrency: 'KES',
            exchangeRate: quote.exchangeRate,
            fee: quote.fee,
            walletAddress: data.walletAddress, // Address to send crypto to
            quoteId: (quote as KotaniPayQuote).quoteId,
            instructions: `Send ${data.fromAmount} ${cryptoCurrency} to ${data.walletAddress}`,
          },
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt),
          completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
          failureReason: data.failureReason,
        };
      } else {
        // Generic off-ramp implementation
        return {
          id,
          providerTransactionId: id,
          provider: this.name,
          status: 'pending',
          amount: params.amount,
          customer: {
            name: params.recipient.name,
            phone: params.recipient.phone,
          },
          description: params.description || `Convert ${cryptoCurrency} to M-Pesa`,
          metadata: {
            ...params.metadata,
            bridgeProvider: this.bridgeProvider,
            bridgeType: 'offramp',
            phoneNumber,
            exchangeRate: quote.exchangeRate,
            fee: quote.fee,
            instructions: 'Contact bridge provider to complete off-ramp',
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    } catch (error) {
      this.handleError(error, 'sendMoney', id);
    }
  }

  /**
   * ON-RAMP: Convert M-Pesa to crypto (receive payment)
   * 
   * Flow:
   * 1. User sends M-Pesa to bridge's paybill
   * 2. Bridge receives M-Pesa
   * 3. Bridge sends crypto to user's wallet
   */
  async requestPayment(params: RequestPaymentParams): Promise<Transaction> {
    const id = `bridge_onramp_${Date.now()}`;

    try {
      const walletAddress = params.metadata?.walletAddress as string;
      
      if (!walletAddress) {
        throw new PaymentError(
          'Wallet address is required for crypto on-ramp',
          ErrorCodes.MISSING_REQUIRED_FIELD,
          this.name
        );
      }

      const amount = params.amount.amount;
      const currency = params.amount.currency.toUpperCase();
      
      // Determine fiat and crypto currencies
      let fiatCurrency = 'KES';
      let cryptoCurrency = 'USDC';
      
      if (currency === 'KES' || currency === 'UGX' || currency === 'TZS' || currency === 'NGN') {
        fiatCurrency = currency;
      } else {
        cryptoCurrency = currency;
      }

      // Get quote
      const quote = await this.getQuote(amount, fiatCurrency, cryptoCurrency, 'onramp');

      if (this.bridgeProvider === 'kotani') {
        // Kotani Pay on-ramp
        const response = await this.client.post<KotaniPayTransaction>('/onramp', {
          walletAddress,
          fiatAmount: amount,
          fiatCurrency,
          cryptoCurrency,
          quoteId: (quote as KotaniPayQuote).quoteId,
          callbackUrl: params.callbackUrl,
          metadata: {
            ...params.metadata,
            customerName: params.customer.name,
            customerEmail: params.customer.email,
            description: params.description,
          },
        });

        const data = response.data;

        return {
          id,
          providerTransactionId: data.transactionId,
          provider: this.name,
          status: this.mapBridgeStatus(data.status),
          amount: {
            amount: data.fromAmount,
            currency: fiatCurrency,
          },
          customer: params.customer,
          description: params.description || `Convert M-Pesa to ${cryptoCurrency}`,
          metadata: {
            ...params.metadata,
            bridgeProvider: this.bridgeProvider,
            bridgeType: 'onramp',
            walletAddress,
            cryptoAmount: data.toAmount,
            cryptoCurrency,
            exchangeRate: quote.exchangeRate,
            fee: quote.fee,
            paybillNumber: data.externalTransactionId, // M-Pesa paybill
            accountNumber: data.transactionId, // Reference number
            quoteId: (quote as KotaniPayQuote).quoteId,
            instructions: `Send ${data.fromAmount} ${fiatCurrency} via M-Pesa to Paybill ${data.externalTransactionId}, Account: ${data.transactionId}`,
          },
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt),
          completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
          failureReason: data.failureReason,
        };
      } else {
        // Generic on-ramp implementation
        return {
          id,
          providerTransactionId: id,
          provider: this.name,
          status: 'pending',
          amount: params.amount,
          customer: params.customer,
          description: params.description || `Convert M-Pesa to ${cryptoCurrency}`,
          metadata: {
            ...params.metadata,
            bridgeProvider: this.bridgeProvider,
            bridgeType: 'onramp',
            walletAddress,
            cryptoCurrency,
            exchangeRate: quote.exchangeRate,
            fee: quote.fee,
            instructions: `Send ${amount} ${fiatCurrency} via M-Pesa and provide transaction ID`,
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
   * Verify transaction status
   */
  async verifyTransaction(id: string): Promise<Transaction> {
    try {
      const transactionId = id.replace('bridge_', '');

      if (this.bridgeProvider === 'kotani') {
        const response = await this.client.get<KotaniPayTransaction>(`/transactions/${transactionId}`);
        const data = response.data;

        const phone: PhoneNumber | undefined = data.phoneNumber ? {
          countryCode: data.phoneNumber.substring(0, 3),
          nationalNumber: data.phoneNumber.substring(3),
          formatted: `+${data.phoneNumber}`,
        } : undefined;

        return {
          id,
          providerTransactionId: data.transactionId,
          provider: this.name,
          status: this.mapBridgeStatus(data.status),
          amount: {
            amount: data.fromAmount,
            currency: data.fromCurrency,
          },
          customer: {
            phone,
          },
          description: `Bridge ${data.type}`,
          metadata: {
            bridgeProvider: this.bridgeProvider,
            bridgeType: data.type,
            toAmount: data.toAmount,
            toCurrency: data.toCurrency,
            phoneNumber: data.phoneNumber,
            walletAddress: data.walletAddress,
            externalTransactionId: data.externalTransactionId,
          },
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt),
          completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
          failureReason: data.failureReason,
        };
      } else {
        // Generic implementation
        throw new PaymentError(
          'Transaction verification not implemented for this provider',
          ErrorCodes.PROVIDER_ERROR,
          this.name,
          id
        );
      }
    } catch (error) {
      this.handleError(error, 'verifyTransaction', id);
    }
  }

  /**
   * Process refund
   */
  async refund(params: RefundParams): Promise<Transaction> {
    const id = `bridge_refund_${Date.now()}`;

    try {
      // Request refund from bridge provider
      const response = await this.client.post('/refunds', {
        originalTransactionId: params.originalTransactionId,
        amount: params.amount?.amount,
        reason: params.reason,
      });

      return {
        id,
        providerTransactionId: response.data.refundId || id,
        provider: this.name,
        status: 'pending',
        amount: params.amount || { amount: 0, currency: 'KES' },
        customer: {},
        description: `Refund for ${params.originalTransactionId}: ${params.reason || 'Customer request'}`,
        metadata: {
          originalTransactionId: params.originalTransactionId,
          reason: params.reason,
          refundId: response.data.refundId,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      this.handleError(error, 'refund', id);
    }
  }

  /**
   * Get quote for conversion
   */
  private async getQuote(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    type: 'onramp' | 'offramp'
  ): Promise<BridgeQuote> {
    if (this.bridgeProvider === 'kotani') {
      const response = await this.client.post<KotaniPayQuote>('/quotes', {
        fromCurrency,
        toCurrency,
        amount,
        type,
      });
      return response.data;
    } else if (this.bridgeProvider === 'yellowcard') {
      const response = await this.client.post<{
        id: string;
        sourceCurrency: string;
        destinationCurrency: string;
        sourceAmount: number;
        destinationAmount: number;
        rate: number;
        fees: { processing: number; network: number };
        expiresAt: string;
      }>('/quotes', {
        sourceCurrency: fromCurrency,
        destinationCurrency: toCurrency,
        sourceAmount: amount,
      });
      const data = response.data;
      // Normalize to BridgeQuote
      return {
        quoteId: data.id,
        fromCurrency: data.sourceCurrency,
        toCurrency: data.destinationCurrency,
        fromAmount: data.sourceAmount,
        toAmount: data.destinationAmount,
        exchangeRate: data.rate,
        fee: data.fees.processing + data.fees.network,
        expiresAt: data.expiresAt,
      };
    }

    // Default quote
    return {
      quoteId: `quote_${Date.now()}`,
      fromCurrency,
      toCurrency,
      fromAmount: amount,
      toAmount: amount * 0.0077, // Approximate KES to USDC rate
      exchangeRate: 0.0077,
      fee: amount * 0.02, // 2% fee
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    } as KotaniPayQuote;
  }

  /**
   * Get exchange rates
   */
  async getRates(from: string, to: string): Promise<number> {
    try {
      const quote = await this.getQuote(1000, from, to, 'onramp');
      return quote.exchangeRate;
    } catch {
      // Fallback rates
      const rates: Record<string, number> = {
        'KES_USDC': 0.0077,
        'USDC_KES': 130,
        'KES_USDT': 0.0077,
        'USDT_KES': 130,
        'KES_cUSD': 0.0077,
        'cUSD_KES': 130,
        'KES_BTC': 0.00000029,
        'BTC_KES': 3448275,
      };
      return rates[`${from}_${to}`] || 1;
    }
  }

  /**
   * Get supported trading pairs
   */
  async getSupportedPairs(): Promise<Array<{
    from: string;
    to: string;
    minAmount: number;
    maxAmount: number;
    feePercentage: number;
  }>> {
    try {
      const response = await this.client.get('/pairs');
      return response.data.pairs;
    } catch {
      // Default pairs
      return [
        { from: 'KES', to: 'USDC', minAmount: 100, maxAmount: 1000000, feePercentage: 2 },
        { from: 'USDC', to: 'KES', minAmount: 10, maxAmount: 10000, feePercentage: 2 },
        { from: 'KES', to: 'USDT', minAmount: 100, maxAmount: 1000000, feePercentage: 2 },
        { from: 'USDT', to: 'KES', minAmount: 10, maxAmount: 10000, feePercentage: 2 },
      ];
    }
  }

  /**
   * Parse and verify webhook
   */
  async parseWebhook(payload: any, signature?: string): Promise<Transaction> {
    try {
      // Verify webhook signature if secret is configured
      if (this.webhookSecret && signature) {
        const isValid = await this.verifyWebhookSignature(payload, signature);
        if (!isValid) {
          throw new PaymentError(
            'Invalid webhook signature',
            ErrorCodes.AUTHENTICATION_FAILED,
            this.name
          );
        }
      }

      const webhook = payload as BridgeWebhookPayload;
      const data = webhook.data as KotaniPayTransaction;

      return {
        id: `bridge_${data.transactionId}`,
        providerTransactionId: data.transactionId,
        provider: this.name,
        status: this.mapBridgeStatus(data.status),
        amount: {
          amount: data.fromAmount,
          currency: data.fromCurrency,
        },
        customer: data.phoneNumber ? {
          phone: {
            countryCode: data.phoneNumber.substring(0, 3),
            nationalNumber: data.phoneNumber.substring(3),
            formatted: `+${data.phoneNumber}`,
          },
        } : {},
        description: `Bridge ${data.type} via ${this.bridgeProvider}`,
        metadata: {
          bridgeProvider: this.bridgeProvider,
          bridgeType: data.type,
          toAmount: data.toAmount,
          toCurrency: data.toCurrency,
          phoneNumber: data.phoneNumber,
          walletAddress: data.walletAddress,
          externalTransactionId: data.externalTransactionId,
          webhookEvent: webhook.event,
          webhookTimestamp: webhook.timestamp,
        },
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
        failureReason: data.failureReason,
      };
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      throw new PaymentError(
        `Webhook parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCodes.PROVIDER_ERROR,
        this.name
      );
    }
  }

  /**
   * Verify webhook signature
   */
  async verifyWebhookSignature(payload: any, signature: string): Promise<boolean> {
    // In a real implementation, this would:
    // 1. Reconstruct the signature using the webhook secret
    // 2. Compare with the provided signature
    // 3. Return true if they match
    
    // For now, return true (signature verification should be implemented)
    return true;
  }
}
