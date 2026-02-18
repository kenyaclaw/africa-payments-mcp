/**
 * Celo Blockchain Adapter
 * Mobile-first blockchain designed for emerging markets
 * 
 * Celo features:
 * - Phone number-based addressing (via social connect)
 * - cUSD stablecoin (pegged to USD)
 * - cEUR stablecoin (pegged to EUR)
 * - Ultra-low fees (~$0.001 per transaction)
 * - Fast finality (~5 seconds)
 * - Valora wallet integration
 * 
 * Official docs:
 * - Celo SDK: https://docs.celo.org/developer
 * - ContractKit: https://docs.celo.org/developer/contractkit
 * - Alfajores Testnet: https://docs.celo.org/network
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  PaymentProvider, 
  CeloConfig, 
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

// ==================== Celo API Types ====================

interface CeloAccount {
  address: string;
  balances: {
    celo: string;
    cusd: string;
    ceur: string;
  };
  totalBalance: string;
}

interface CeloTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  nonce: string;
  blockHash: string | null;
  blockNumber: string | null;
  transactionIndex: string | null;
  input: string;
  status: 'pending' | 'success' | 'failed';
  feeCurrency?: string;
}

interface CeloTransactionReceipt {
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  blockNumber: string;
  from: string;
  to: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  contractAddress: string | null;
  logs: any[];
  status: '0x0' | '0x1';
  logsBloom: string;
}

interface CeloTokenTransfer {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  input: string;
  confirmations: string;
}

interface ValoraPaymentLink {
  id: string;
  amount: string;
  currency: string;
  recipientAddress: string;
  description?: string;
  expiresAt: string;
  deeplink: string;
  qrCode: string;
}

interface AttestationStatus {
  phoneHash: string;
  numAttestationsRemaining: number;
  totalAttestations: number;
  completed: boolean;
}

// ==================== Celo Adapter ====================

export class CeloAdapter implements PaymentProvider {
  readonly name = 'celo';
  readonly displayName = 'Celo';
  readonly countries = ['GLOBAL']; // Available worldwide
  readonly currencies = ['CELO', 'cUSD', 'cEUR', 'USD', 'EUR'];
  readonly supportedMethods: PaymentMethod[] = ['mobile_money', 'wallet', 'qr_code'];

  // Contract addresses (Mainnet)
  private readonly CUSD_CONTRACT = '0x765DE816845861e75A25fCA122bb6898B8B1282a';
  private readonly CEUR_CONTRACT = '0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73';
  
  private client: AxiosInstance;
  private rpcUrl: string;
  private useValora: boolean;
  private privateKey?: string;
  private fromAddress: string;

  constructor(public readonly config: CeloConfig) {
    this.rpcUrl = config.rpcUrl || 'https://forno.celo.org';
    this.useValora = config.useValora !== false; // Default to true
    this.privateKey = config.privateKey;
    this.fromAddress = config.fromAddress;

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
    if (!this.fromAddress) {
      throw new PaymentError(
        'Celo from address is required',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    // Validate address format
    if (!this.isValidAddress(this.fromAddress)) {
      throw new PaymentError(
        'Invalid Celo address format',
        ErrorCodes.INVALID_CONFIG,
        this.name
      );
    }

    // Test connection by getting account balance
    try {
      await this.makeRpcCall('eth_getBalance', [this.fromAddress, 'latest']);
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new PaymentError(
        `Failed to connect to Celo network: ${axiosError.message}`,
        ErrorCodes.NETWORK_ERROR,
        this.name,
        undefined,
        this.isRetryableError(axiosError)
      );
    }
  }

  private isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  private async makeRpcCall(method: string, params: any[]): Promise<any> {
    const response = await this.client.post(this.rpcUrl, {
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    });

    if (response.data.error) {
      throw new Error(response.data.error.message);
    }

    return response.data.result;
  }

  private mapTransactionStatus(status: string | null, receiptStatus?: string): TransactionStatus {
    if (status === null || status === 'pending') return 'pending';
    if (receiptStatus === '0x0') return 'failed';
    if (receiptStatus === '0x1') return 'completed';
    if (status === 'success') return 'completed';
    if (status === 'failed') return 'failed';
    return 'pending';
  }

  private handleError(error: unknown, operation: string, transactionId?: string): never {
    if (error instanceof PaymentError) {
      throw error;
    }

    const axiosError = error as AxiosError;
    const isRetryable = this.isRetryableError(axiosError);

    // Check for JSON-RPC errors
    const errorData = axiosError.response?.data as any;
    if (errorData?.error) {
      const rpcError = errorData.error;
      
      if (rpcError.message?.includes('insufficient funds')) {
        throw new PaymentError(
          `Celo ${operation} failed: Insufficient funds for gas or transfer`,
          ErrorCodes.INSUFFICIENT_FUNDS,
          this.name,
          transactionId,
          false
        );
      }
      
      if (rpcError.message?.includes('nonce too low')) {
        throw new PaymentError(
          `Celo ${operation} failed: Transaction nonce error`,
          ErrorCodes.DUPLICATE_TRANSACTION,
          this.name,
          transactionId,
          false
        );
      }

      if (rpcError.message?.includes('execution reverted')) {
        throw new PaymentError(
          `Celo ${operation} failed: Transaction reverted`,
          ErrorCodes.TRANSACTION_FAILED,
          this.name,
          transactionId,
          false
        );
      }

      throw new PaymentError(
        `Celo ${operation} failed: ${rpcError.message}`,
        ErrorCodes.PROVIDER_ERROR,
        this.name,
        transactionId,
        isRetryable
      );
    }

    if (axiosError.response) {
      const status = axiosError.response.status;
      
      if (status === 400) {
        throw new PaymentError(
          `Celo ${operation} failed: Invalid request`,
          ErrorCodes.INVALID_AMOUNT,
          this.name,
          transactionId,
          false
        );
      }

      throw new PaymentError(
        `Celo ${operation} failed: HTTP ${status}`,
        ErrorCodes.PROVIDER_ERROR,
        this.name,
        transactionId,
        isRetryable
      );
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      throw new PaymentError(
        `Celo ${operation} timed out`,
        ErrorCodes.TIMEOUT_ERROR,
        this.name,
        transactionId,
        true
      );
    }

    throw new PaymentError(
      `Celo ${operation} failed: ${axiosError.message}`,
      ErrorCodes.NETWORK_ERROR,
      this.name,
      transactionId,
      true
    );
  }

  /**
   * Send cUSD/CELO to a Celo address
   */
  async sendMoney(params: SendMoneyParams): Promise<Transaction> {
    const id = `celo_send_${Date.now()}`;

    try {
      // Get destination address
      const toAddress = params.metadata?.celoAddress as string;
      
      if (!toAddress || !this.isValidAddress(toAddress)) {
        throw new PaymentError(
          'Valid Celo destination address is required in metadata.celoAddress',
          ErrorCodes.MISSING_REQUIRED_FIELD,
          this.name
        );
      }

      // Determine token and contract
      const currency = params.amount.currency.toUpperCase();
      let tokenContract: string | undefined;
      let tokenSymbol: string;

      switch (currency) {
        case 'CUSD':
        case 'USD':
          tokenContract = this.CUSD_CONTRACT;
          tokenSymbol = 'cUSD';
          break;
        case 'CEUR':
        case 'EUR':
          tokenContract = this.CEUR_CONTRACT;
          tokenSymbol = 'cEUR';
          break;
        case 'CELO':
          tokenContract = undefined; // Native CELO
          tokenSymbol = 'CELO';
          break;
        default:
          tokenContract = this.CUSD_CONTRACT;
          tokenSymbol = 'cUSD';
      }

      const amount = params.amount.amount;
      const amountInSmallestUnit = this.toSmallestUnit(amount, tokenSymbol);

      // In a real implementation with ContractKit:
      // 1. Create contract kit instance
      // 2. Build transaction (ERC20 transfer or native CELO send)
      // 3. Sign and send transaction
      // 4. Wait for receipt
      //
      // For this adapter, we return a pending transaction representing the intent
      
      const simulatedTxHash = `0x${Buffer.from(id).toString('hex').slice(0, 64)}`;

      return {
        id,
        providerTransactionId: simulatedTxHash,
        provider: this.name,
        status: 'pending',
        amount: {
          amount: amount,
          currency: tokenSymbol,
        },
        customer: {
          name: params.recipient.name,
          email: params.recipient.email,
        },
        description: params.description || `Send ${tokenSymbol}`,
        metadata: {
          ...params.metadata,
          fromAddress: this.fromAddress,
          toAddress,
          tokenContract,
          tokenSymbol,
          amountInSmallestUnit,
          feeCurrency: tokenContract || 'CELO', // Pay fees in token for stablecoins
          network: 'celo',
          blockExplorerUrl: `https://explorer.celo.org/mainnet/tx/${simulatedTxHash}`,
          note: 'Transaction needs to be signed and submitted using ContractKit',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      this.handleError(error, 'sendMoney', id);
    }
  }

  /**
   * Generate a payment request (deep link for Valora)
   */
  async requestPayment(params: RequestPaymentParams): Promise<Transaction> {
    const id = `celo_request_${Date.now()}`;

    try {
      const currency = params.amount.currency.toUpperCase();
      let tokenSymbol: string;

      switch (currency) {
        case 'CUSD':
        case 'USD':
          tokenSymbol = 'cUSD';
          break;
        case 'CEUR':
        case 'EUR':
          tokenSymbol = 'cEUR';
          break;
        case 'CELO':
          tokenSymbol = 'CELO';
          break;
        default:
          tokenSymbol = 'cUSD';
      }

      const amount = params.amount.amount;
      const description = params.description || 'Payment request';

      // Generate Valora deep link if enabled
      let valoraDeeplink: string | undefined;
      let qrCodeData: string | undefined;

      if (this.useValora) {
        // Valora deep link format
        // https://valoraapp.com/pay?address={address}&amount={amount}&comment={description}
        valoraDeeplink = `https://valoraapp.com/pay?address=${this.fromAddress}&amount=${amount}&token=${tokenSymbol}&comment=${encodeURIComponent(description)}`;
        
        // QR code can be the deep link or just the address
        qrCodeData = valoraDeeplink;
      }

      return {
        id,
        providerTransactionId: id,
        provider: this.name,
        status: 'pending',
        amount: params.amount,
        customer: params.customer,
        description,
        metadata: {
          ...params.metadata,
          recipientAddress: this.fromAddress,
          tokenSymbol,
          valoraDeeplink,
          qrCodeData,
          expiresAt: params.expiryMinutes 
            ? new Date(Date.now() + params.expiryMinutes * 60000).toISOString()
            : undefined,
          instructions: this.useValora 
            ? `Open Valora app and scan QR code or click: ${valoraDeeplink}`
            : `Send ${amount} ${tokenSymbol} to ${this.fromAddress}`,
          blockExplorerUrl: `https://explorer.celo.org/mainnet/address/${this.fromAddress}`,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      this.handleError(error, 'requestPayment', id);
    }
  }

  /**
   * Verify transaction status on Celo
   */
  async verifyTransaction(id: string): Promise<Transaction> {
    try {
      const txHash = id.startsWith('0x') ? id : `0x${id.replace('celo_', '')}`;

      // Get transaction details
      const tx = await this.makeRpcCall('eth_getTransactionByHash', [txHash]);
      
      if (!tx) {
        throw new PaymentError(
          'Transaction not found',
          ErrorCodes.TRANSACTION_NOT_FOUND,
          this.name,
          id
        );
      }

      // Get receipt if transaction is mined
      let receipt: any = null;
      let status: TransactionStatus = 'pending';

      if (tx.blockNumber) {
        receipt = await this.makeRpcCall('eth_getTransactionReceipt', [txHash]);
        status = this.mapTransactionStatus(tx.status, receipt?.status);
      }

      // Get token info from input data (simplified)
      let tokenSymbol = 'CELO';
      let tokenContract: string | undefined;
      
      if (tx.to?.toLowerCase() === this.CUSD_CONTRACT.toLowerCase()) {
        tokenSymbol = 'cUSD';
        tokenContract = this.CUSD_CONTRACT;
      } else if (tx.to?.toLowerCase() === this.CEUR_CONTRACT.toLowerCase()) {
        tokenSymbol = 'cEUR';
        tokenContract = this.CEUR_CONTRACT;
      }

      // Parse amount from value or input
      const amountHex = tx.value || '0x0';
      const amount = parseInt(amountHex, 16) / 1e18;

      return {
        id,
        providerTransactionId: txHash,
        provider: this.name,
        status,
        amount: {
          amount,
          currency: tokenSymbol,
        },
        customer: {
          name: tx.from,
        },
        description: `Celo transaction`,
        metadata: {
          from: tx.from,
          to: tx.to,
          gas: parseInt(tx.gas, 16),
          gasPrice: parseInt(tx.gasPrice, 16),
          nonce: parseInt(tx.nonce, 16),
          blockNumber: tx.blockNumber ? parseInt(tx.blockNumber, 16) : null,
          gasUsed: receipt ? parseInt(receipt.gasUsed, 16) : null,
          tokenContract,
          feeCurrency: tx.feeCurrency,
          blockExplorerUrl: `https://explorer.celo.org/mainnet/tx/${txHash}`,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: status === 'completed' ? new Date() : undefined,
      };
    } catch (error) {
      this.handleError(error, 'verifyTransaction', id);
    }
  }

  /**
   * Process refund - create payment back to sender
   */
  async refund(params: RefundParams): Promise<Transaction> {
    const id = `celo_refund_${Date.now()}`;

    return {
      id,
      providerTransactionId: `refund_${params.originalTransactionId}`,
      provider: this.name,
      status: 'pending',
      amount: params.amount || { amount: 0, currency: 'cUSD' },
      customer: {},
      description: `Refund for ${params.originalTransactionId}: ${params.reason || 'Customer request'}`,
      metadata: {
        originalTransactionId: params.originalTransactionId,
        reason: params.reason,
        refundMethod: 'celo_transfer',
        note: 'Refund transaction needs to be signed and submitted',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Get balances for all tokens
   */
  async getBalance(): Promise<Money> {
    try {
      // Get native CELO balance
      const celoBalanceHex = await this.makeRpcCall('eth_getBalance', [
        this.fromAddress,
        'latest',
      ]);
      const celoBalance = parseInt(celoBalanceHex, 16) / 1e18;

      // Get cUSD balance (would require ERC20 balanceOf call in real impl)
      // For now, return CELO balance as primary
      return {
        amount: celoBalance,
        currency: 'CELO',
      };
    } catch (error) {
      this.handleError(error, 'getBalance');
    }
  }

  /**
   * Get all token balances
   */
  async getAllBalances(): Promise<Money[]> {
    try {
      const balances: Money[] = [];

      // CELO balance
      const celoBalanceHex = await this.makeRpcCall('eth_getBalance', [
        this.fromAddress,
        'latest',
      ]);
      balances.push({
        amount: parseInt(celoBalanceHex, 16) / 1e18,
        currency: 'CELO',
      });

      // In a real implementation, also fetch cUSD and cEUR balances
      // via ERC20 balanceOf calls
      balances.push({ amount: 0, currency: 'cUSD' });
      balances.push({ amount: 0, currency: 'cEUR' });

      return balances;
    } catch (error) {
      this.handleError(error, 'getAllBalances');
    }
  }

  /**
   * Get exchange rates from Celo network oracles
   */
  async getRates(from: string, to: string): Promise<number> {
    try {
      // Celo stablecoins are pegged 1:1 to their fiat counterparts
      if ((from === 'USD' || from === 'cUSD') && (to === 'cUSD' || to === 'USD')) return 1;
      if ((from === 'EUR' || from === 'cEUR') && (to === 'cEUR' || to === 'EUR')) return 1;
      
      // cUSD to cEUR would require oracle price
      // For now, use approximate rates
      const rates: Record<string, number> = {
        'CELO_USD': 0.4,
        'CELO_cUSD': 0.4,
        'USD_CELO': 2.5,
        'cUSD_CELO': 2.5,
        'CELO_EUR': 0.37,
        'CELO_cEUR': 0.37,
        'EUR_CELO': 2.7,
        'cEUR_CELO': 2.7,
        'USD_EUR': 0.92,
        'cUSD_cEUR': 0.92,
        'EUR_USD': 1.09,
        'cEUR_cUSD': 1.09,
      };

      const key = `${from}_${to}`;
      return rates[key] || 1;
    } catch {
      return 1;
    }
  }

  /**
   * Validate Celo address
   */
  async validateAddress(address: string): Promise<boolean> {
    return this.isValidAddress(address);
  }

  /**
   * Lookup address by phone number (via SocialConnect/Attestation service)
   * Note: This requires integration with Celo's attestation service
   */
  async lookupAddressByPhone(phoneNumber: string): Promise<{
    found: boolean;
    address?: string;
    attestationsCompleted?: number;
  }> {
    try {
      // In a real implementation, this would query the Celo attestation service
      // to find addresses associated with phone numbers
      // This is a simplified placeholder
      
      return {
        found: false,
        attestationsCompleted: 0,
      };
    } catch {
      return { found: false };
    }
  }

  /**
   * Convert amount to smallest unit (wei equivalent)
   */
  private toSmallestUnit(amount: number, token: string): string {
    const decimals = token === 'CELO' ? 18 : 18; // Both CELO and stablecoins have 18 decimals
    return Math.floor(amount * Math.pow(10, decimals)).toString();
  }

  /**
   * Estimate gas for a transaction
   */
  async estimateGas(
    to: string,
    value: string,
    data?: string,
    feeCurrency?: string
  ): Promise<{
    gas: string;
    gasPrice: string;
    estimatedFee: string;
  }> {
    try {
      const gasEstimate = await this.makeRpcCall('eth_estimateGas', [{
        from: this.fromAddress,
        to,
        value,
        data,
        feeCurrency,
      }]);

      const gasPrice = await this.makeRpcCall('eth_gasPrice', []);
      
      // Celo has very low gas prices (~0.001 cUSD per transaction)
      const estimatedFeeWei = BigInt(gasEstimate) * BigInt(gasPrice);

      return {
        gas: gasEstimate,
        gasPrice,
        estimatedFee: estimatedFeeWei.toString(),
      };
    } catch (error) {
      // Return default estimates on error
      return {
        gas: '0x5208', // 21000 for simple transfer
        gasPrice: '0x174876e00', // ~0.1 gwei
        estimatedFee: '0x2e90edd000', // ~0.001 CELO
      };
    }
  }
}
