/**
 * USDC on Stellar Adapter
 * Fast, cheap cross-border stablecoin payments
 * 
 * USDC on Stellar combines the stability of USD Coin with Stellar's 
 * fast (3-5 seconds) and cheap (<$0.001) transactions.
 * 
 * Official docs:
 * - Stellar API: https://developers.stellar.org/api
 * - Stellar SDK: https://stellar.github.io/js-stellar-sdk/
 * - Circle (USDC issuer): https://developers.circle.com/
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  PaymentProvider, 
  UsdcStellarConfig, 
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

// ==================== Stellar API Types ====================

interface StellarAccount {
  id: string;
  account_id: string;
  sequence: string;
  balances: Array<{
    balance: string;
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
  }>;
  thresholds: {
    low_threshold: number;
    med_threshold: number;
    high_threshold: number;
  };
}

interface StellarTransaction {
  id: string;
  paging_token: string;
  successful: boolean;
  hash: string;
  ledger: number;
  created_at: string;
  source_account: string;
  source_account_sequence: string;
  fee_paid: string;
  operation_count: number;
  memo?: string;
  memo_type?: string;
}

interface StellarPaymentOperation {
  id: string;
  paging_token: string;
  source_account: string;
  type: string;
  type_i: number;
  created_at: string;
  transaction_hash: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  from: string;
  to: string;
  amount: string;
}

interface StellarPathPayment {
  source_account: string;
  destination_account: string;
  destination_asset_type: string;
  destination_asset_code?: string;
  destination_amount: string;
  source_max: string;
  path: Array<{
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
  }>;
}

interface AnchorQuote {
  id: string;
  price: string;
  total_price: string;
  expires_at: string;
}

interface AnchorTransaction {
  id: string;
  kind: 'deposit' | 'withdrawal' | 'send';
  status: string;
  status_eta?: number;
  amount_in?: string;
  amount_out?: string;
  amount_fee?: string;
  started_at: string;
  completed_at?: string;
  stellar_transaction_id?: string;
  external_transaction_id?: string;
  message?: string;
  refunds?: Array<{
    id: string;
    amount: string;
    reason: string;
  }>;
}

// ==================== USDC Stellar Adapter ====================

export class UsdcStellarAdapter implements PaymentProvider {
  readonly name = 'usdc_stellar';
  readonly displayName = 'USDC on Stellar';
  readonly countries = ['GLOBAL']; // Available worldwide
  readonly currencies = ['USDC', 'USD', 'XLM'];
  readonly supportedMethods: PaymentMethod[] = ['wallet', 'bank_transfer'];

  // USDC asset details on Stellar
  private readonly USDC_ASSET_CODE = 'USDC';
  private readonly USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
  
  private client: AxiosInstance;
  private horizonUrl: string;
  private useAnchor: boolean;
  private anchorUrl?: string;
  private sourceAccount: string;
  private secretKey?: string;

  constructor(public readonly config: UsdcStellarConfig) {
    this.horizonUrl = config.horizonUrl || 'https://horizon.stellar.org';
    this.useAnchor = config.useAnchor || false;
    this.anchorUrl = config.anchorUrl;
    this.sourceAccount = config.sourceAccount;
    this.secretKey = config.secretKey;

    this.client = axios.create({
      timeout: config.timeoutMs || 30000,
      headers: {
        'Content-Type': 'application/json',
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
    if (!this.sourceAccount) {
      throw new PaymentError(
        'Stellar source account is required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    // Validate source account exists and has trustline to USDC
    try {
      const account = await this.getAccount(this.sourceAccount);
      const usdcBalance = account.balances.find(
        b => b.asset_code === this.USDC_ASSET_CODE && 
            b.asset_issuer === this.USDC_ISSUER
      );
      
      if (!usdcBalance && this.config.environment === 'production') {
        // In production, warn if no USDC trustline (not an error, just a warning)
        console.warn(`Warning: Account ${this.sourceAccount} does not have a USDC trustline established.`);
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        throw new PaymentError(
          'Stellar source account not found',
          ErrorCodes.INVALID_CONFIG,
          this.name
        );
      }
      throw new PaymentError(
        `Failed to validate Stellar account: ${axiosError.message}`,
        ErrorCodes.NETWORK_ERROR,
        this.name,
        undefined,
        this.isRetryableError(axiosError)
      );
    }
  }

  private mapStellarStatus(successful: boolean, stellarStatus?: string): TransactionStatus {
    if (stellarStatus === 'pending') return 'pending';
    if (stellarStatus === 'pending_anchor') return 'processing';
    if (stellarStatus === 'pending_external') return 'processing';
    if (stellarStatus === 'pending_user_transfer_start') return 'pending';
    if (stellarStatus === 'pending_user_transfer_complete') return 'processing';
    if (stellarStatus === 'pending_stellar') return 'processing';
    if (stellarStatus === 'pending_transaction') return 'processing';
    if (stellarStatus === 'pending_reception') return 'processing';
    if (stellarStatus === 'pending_customer_info_update') return 'pending';
    if (stellarStatus === 'pending_transaction_info_update') return 'pending';
    if (stellarStatus === 'incomplete') return 'failed';
    if (stellarStatus === 'no_market') return 'failed';
    if (stellarStatus === 'too_small') return 'failed';
    if (stellarStatus === 'too_large') return 'failed';
    if (stellarStatus === 'error') return 'failed';
    if (stellarStatus === 'refunded') return 'refunded';
    if (successful || stellarStatus === 'completed') return 'completed';
    return 'pending';
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

      // Stellar-specific error handling
      if (data?.extras?.result_codes) {
        const resultCodes = data.extras.result_codes;
        if (resultCodes.transaction === 'tx_bad_auth') {
          throw new PaymentError(
            `Stellar ${operation} failed: Invalid authentication`,
            ErrorCodes.AUTHENTICATION_FAILED,
            this.name,
            transactionId,
            false
          );
        }
        if (resultCodes.transaction === 'tx_insufficient_balance') {
          throw new PaymentError(
            `Stellar ${operation} failed: Insufficient balance`,
            ErrorCodes.INSUFFICIENT_FUNDS,
            this.name,
            transactionId,
            false
          );
        }
        if (resultCodes.operations?.includes('op_no_destination')) {
          throw new PaymentError(
            `Stellar ${operation} failed: Destination account does not exist`,
            ErrorCodes.INVALID_AMOUNT,
            this.name,
            transactionId,
            false
          );
        }
        if (resultCodes.operations?.includes('op_no_trust')) {
          throw new PaymentError(
            `Stellar ${operation} failed: Destination does not trust USDC`,
            ErrorCodes.PROVIDER_ERROR,
            this.name,
            transactionId,
            false
          );
        }
      }

      if (status === 400) {
        throw new PaymentError(
          `Stellar ${operation} failed: ${data.title || data.detail || 'Bad request'}`,
          ErrorCodes.INVALID_AMOUNT,
          this.name,
          transactionId,
          false
        );
      }

      if (status === 404) {
        throw new PaymentError(
          `Stellar ${operation} failed: Account or transaction not found`,
          ErrorCodes.TRANSACTION_NOT_FOUND,
          this.name,
          transactionId,
          false
        );
      }

      throw new PaymentError(
        `Stellar ${operation} failed: ${data.title || data.detail || `HTTP ${status}`}`,
        ErrorCodes.PROVIDER_ERROR,
        this.name,
        transactionId,
        isRetryable
      );
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      throw new PaymentError(
        `Stellar ${operation} timed out`,
        ErrorCodes.TIMEOUT_ERROR,
        this.name,
        transactionId,
        true
      );
    }

    throw new PaymentError(
      `Stellar ${operation} failed: ${axiosError.message}`,
      ErrorCodes.NETWORK_ERROR,
      this.name,
      transactionId,
      true
    );
  }

  private async getAccount(accountId: string): Promise<StellarAccount> {
    const response = await this.client.get<StellarAccount>(
      `${this.horizonUrl}/accounts/${accountId}`
    );
    return response.data;
  }

  /**
   * Send USDC to a Stellar address
   */
  async sendMoney(params: SendMoneyParams): Promise<Transaction> {
    const id = `usdc_stellar_send_${Date.now()}`;

    try {
      // Get destination address from metadata or recipient
      const destinationAddress = params.metadata?.stellarAddress as string;
      
      if (!destinationAddress) {
        throw new PaymentError(
          'Stellar destination address is required in metadata.stellarAddress',
          ErrorCodes.MISSING_REQUIRED_FIELD,
          this.name
        );
      }

      // Validate Stellar address format (G...)
      if (!destinationAddress.match(/^G[A-Z0-9]{55}$/)) {
        throw new PaymentError(
          'Invalid Stellar address format',
          ErrorCodes.INVALID_AMOUNT,
          this.name
        );
      }

      const amount = params.amount.amount;
      const memo = params.metadata?.memo as string | undefined;
      const memoType = params.metadata?.memoType as string | undefined;

      // In a real implementation, this would:
      // 1. Build a Stellar transaction with payment operation
      // 2. Sign the transaction with the secret key
      // 3. Submit to the Stellar network
      // 
      // For this adapter, we return a pending transaction that represents
      // the payment intent. The actual submission would be done by a 
      // separate service with access to the secret key.
      
      const transactionHash = `simulated_${Buffer.from(id).toString('hex').slice(0, 64)}`;

      return {
        id,
        providerTransactionId: transactionHash,
        provider: this.name,
        status: 'pending',
        amount: {
          amount: amount,
          currency: 'USDC',
        },
        customer: {
          name: params.recipient.name,
          email: params.recipient.email,
        },
        description: params.description || 'USDC payment via Stellar',
        metadata: {
          ...params.metadata,
          sourceAccount: this.sourceAccount,
          destinationAddress,
          memo,
          memoType,
          assetCode: this.USDC_ASSET_CODE,
          assetIssuer: this.USDC_ISSUER,
          network: 'stellar',
          note: 'Transaction needs to be signed and submitted using the Stellar SDK',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      this.handleError(error, 'sendMoney', id);
    }
  }

  /**
   * Generate a USDC payment request (SEP-0006 deposit)
   * If using an anchor, this initiates a deposit flow
   */
  async requestPayment(params: RequestPaymentParams): Promise<Transaction> {
    const id = `usdc_stellar_request_${Date.now()}`;

    try {
      const amount = params.amount.amount;
      const memo = params.metadata?.memo as string | undefined;

      if (this.useAnchor && this.anchorUrl) {
        // Use SEP-6 anchor for on-ramp
        const depositResponse = await this.client.get(`${this.anchorUrl}/deposit`, {
          params: {
            asset_code: this.USDC_ASSET_CODE,
            account: this.sourceAccount,
            amount: amount.toString(),
            memo: memo,
            memo_type: memo ? 'text' : undefined,
          },
        });

        const anchorTx = depositResponse.data as AnchorTransaction;

        return {
          id,
          providerTransactionId: anchorTx.id,
          provider: this.name,
          status: this.mapStellarStatus(false, anchorTx.status),
          amount: params.amount,
          customer: params.customer,
          description: params.description || 'USDC deposit via anchor',
          metadata: {
            ...params.metadata,
            anchorTransactionId: anchorTx.id,
            anchorUrl: this.anchorUrl,
            stellarTransactionId: anchorTx.stellar_transaction_id,
            externalTransactionId: anchorTx.external_transaction_id,
            depositInstructions: depositResponse.data.how || 'Follow anchor instructions',
            eta: anchorTx.status_eta,
          },
          createdAt: new Date(anchorTx.started_at),
          updatedAt: new Date(),
          completedAt: anchorTx.completed_at ? new Date(anchorTx.completed_at) : undefined,
        };
      }

      // Simple payment request - just return an address for direct deposit
      return {
        id,
        providerTransactionId: id,
        provider: this.name,
        status: 'pending',
        amount: params.amount,
        customer: params.customer,
        description: params.description || 'Request USDC payment',
        metadata: {
          ...params.metadata,
          destinationAddress: this.sourceAccount,
          memo: memo || id.slice(-28), // Use last 28 chars of ID as memo
          memoType: 'text',
          assetCode: this.USDC_ASSET_CODE,
          assetIssuer: this.USDC_ISSUER,
          networkPassphrase: this.config.environment === 'production' 
            ? 'Public Global Stellar Network ; September 2015'
            : 'Test SDF Network ; September 2015',
          instructions: `Send ${amount} USDC to ${this.sourceAccount} with memo: ${memo || id.slice(-28)}`,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      this.handleError(error, 'requestPayment', id);
    }
  }

  /**
   * Verify transaction status on Stellar
   */
  async verifyTransaction(id: string): Promise<Transaction> {
    try {
      // Check if this is an anchor transaction or direct Stellar transaction
      const isAnchorTx = id.startsWith('usdc_stellar_request_') && this.useAnchor;
      
      if (isAnchorTx && this.anchorUrl) {
        // Query anchor for transaction status
        const response = await this.client.get(`${this.anchorUrl}/transaction`, {
          params: {
            id: id.replace('usdc_stellar_request_', ''),
          },
        });

        const anchorTx = response.data.transaction as AnchorTransaction;

        return {
          id,
          providerTransactionId: anchorTx.id,
          provider: this.name,
          status: this.mapStellarStatus(anchorTx.status === 'completed', anchorTx.status),
          amount: {
            amount: parseFloat(anchorTx.amount_in || '0'),
            currency: 'USDC',
          },
          customer: {},
          description: `Anchor transaction: ${anchorTx.kind}`,
          metadata: {
            kind: anchorTx.kind,
            stellarTransactionId: anchorTx.stellar_transaction_id,
            externalTransactionId: anchorTx.external_transaction_id,
            amountOut: anchorTx.amount_out,
            amountFee: anchorTx.amount_fee,
            message: anchorTx.message,
            refunds: anchorTx.refunds,
          },
          createdAt: new Date(anchorTx.started_at),
          updatedAt: new Date(),
          completedAt: anchorTx.completed_at ? new Date(anchorTx.completed_at) : undefined,
          failureReason: anchorTx.message,
        };
      }

      // Query Stellar network directly
      const txHash = id.replace('usdc_stellar_', '');
      const response = await this.client.get<StellarTransaction>(
        `${this.horizonUrl}/transactions/${txHash}`
      );
      const data = response.data;

      // Get payment operations for this transaction
      const opsResponse = await this.client.get<{ _embedded: { records: StellarPaymentOperation[] } }>(
        `${this.horizonUrl}/transactions/${txHash}/operations`
      );
      
      const paymentOp = opsResponse.data._embedded.records.find(
        op => op.type === 'payment'
      );

      return {
        id,
        providerTransactionId: data.hash,
        provider: this.name,
        status: this.mapStellarStatus(data.successful),
        amount: {
          amount: parseFloat(paymentOp?.amount || '0'),
          currency: paymentOp?.asset_code || 'XLM',
        },
        customer: {
          name: paymentOp?.from,
        },
        description: `Stellar transaction in ledger ${data.ledger}`,
        metadata: {
          ledger: data.ledger,
          sourceAccount: data.source_account,
          feePaid: data.fee_paid,
          operationCount: data.operation_count,
          memo: data.memo,
          memoType: data.memo_type,
        },
        createdAt: new Date(data.created_at),
        updatedAt: new Date(),
        completedAt: data.successful ? new Date(data.created_at) : undefined,
      };
    } catch (error) {
      this.handleError(error, 'verifyTransaction', id);
    }
  }

  /**
   * Process refund via Stellar
   * Creates a payment back to the original sender
   */
  async refund(params: RefundParams): Promise<Transaction> {
    const id = `usdc_stellar_refund_${Date.now()}`;

    try {
      // In a real implementation, this would:
      // 1. Look up the original transaction
      // 2. Create a payment operation back to the sender
      // 3. Submit to Stellar network
      
      return {
        id,
        providerTransactionId: `refund_${params.originalTransactionId}`,
        provider: this.name,
        status: 'pending',
        amount: params.amount || { amount: 0, currency: 'USDC' },
        customer: {},
        description: `Refund for ${params.originalTransactionId}: ${params.reason || 'Customer request'}`,
        metadata: {
          originalTransactionId: params.originalTransactionId,
          reason: params.reason,
          refundMethod: 'stellar_payment',
          note: 'Refund transaction needs to be signed and submitted',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      this.handleError(error, 'refund', id);
    }
  }

  /**
   * Get USDC balance
   */
  async getBalance(): Promise<Money> {
    try {
      const account = await this.getAccount(this.sourceAccount);
      
      // Find USDC balance
      const usdcBalance = account.balances.find(
        b => b.asset_code === this.USDC_ASSET_CODE && 
            b.asset_issuer === this.USDC_ISSUER
      );

      if (usdcBalance) {
        return {
          amount: parseFloat(usdcBalance.balance),
          currency: 'USDC',
        };
      }

      // Return XLM balance if no USDC trustline
      const xlmBalance = account.balances.find(b => b.asset_type === 'native');
      return {
        amount: parseFloat(xlmBalance?.balance || '0'),
        currency: 'XLM',
      };
    } catch (error) {
      this.handleError(error, 'getBalance');
    }
  }

  /**
   * Get exchange rates (XLM/USDC)
   */
  async getRates(from: string, to: string): Promise<number> {
    try {
      // Get orderbook for XLM/USDC pair
      if ((from === 'XLM' && to === 'USDC') || (from === 'USDC' && to === 'XLM')) {
        const response = await this.client.get<{
          bids: Array<{ price_r: { n: number; d: number }; price: string }>;
          asks: Array<{ price_r: { n: number; d: number }; price: string }>;
        }>(`${this.horizonUrl}/orderbook`, {
          params: {
            selling_asset_type: from === 'XLM' ? 'native' : 'credit_alphanum4',
            selling_asset_code: from === 'XLM' ? undefined : from,
            selling_asset_issuer: from === 'XLM' ? undefined : this.USDC_ISSUER,
            buying_asset_type: to === 'XLM' ? 'native' : 'credit_alphanum4',
            buying_asset_code: to === 'XLM' ? undefined : to,
            buying_asset_issuer: to === 'XLM' ? undefined : this.USDC_ISSUER,
            limit: 1,
          },
        });

        const bestPrice = from === 'XLM' 
          ? response.data.bids[0]?.price 
          : response.data.asks[0]?.price;

        return bestPrice ? parseFloat(bestPrice) : 0.1; // Fallback rate
      }

      // USDC is pegged to USD
      if (from === 'USD' && to === 'USDC') return 1;
      if (from === 'USDC' && to === 'USD') return 1;

      return 1; // Default 1:1 for unknown pairs
    } catch (error) {
      // Return approximate rates on error
      if (from === 'XLM' && to === 'USDC') return 0.12;
      if (from === 'USDC' && to === 'XLM') return 8.33;
      return 1;
    }
  }

  /**
   * Validate Stellar address
   */
  async validateAddress(address: string): Promise<boolean> {
    if (!address.match(/^G[A-Z0-9]{55}$/)) {
      return false;
    }

    try {
      await this.getAccount(address);
      return true;
    } catch {
      // Account doesn't exist but address format is valid
      return true;
    }
  }

  /**
   * Validate memo format for Stellar
   */
  validateMemo(memo: string, type: 'text' | 'id' | 'hash' | 'return'): boolean {
    switch (type) {
      case 'text':
        return Buffer.byteLength(memo, 'utf8') <= 28;
      case 'id':
        return /^(0|[1-9]\d*)$/.test(memo) && BigInt(memo) <= BigInt('18446744073709551615');
      case 'hash':
      case 'return':
        return Buffer.from(memo, 'hex').length === 32;
      default:
        return false;
    }
  }
}
