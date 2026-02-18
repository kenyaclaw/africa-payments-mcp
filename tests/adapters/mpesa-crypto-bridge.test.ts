/**
 * M-Pesa Crypto Bridge Adapter Tests
 * 
 * Comprehensive test suite for the M-Pesa Crypto Bridge adapter.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock axios before imports
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      interceptors: {
        request: { use: jest.fn(), eject: jest.fn() },
        response: { use: jest.fn(), eject: jest.fn() },
      },
    })),
  },
}));

import axios from 'axios';
import { MpesaCryptoBridgeAdapter } from '../../src/adapters/mpesa-crypto-bridge/index.js';
import { 
  MpesaCryptoBridgeConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
} from '../../src/types/index.js';

// Mock config for testing
const mockConfig: MpesaCryptoBridgeConfig = {
  enabled: true,
  environment: 'sandbox',
  bridgeProvider: 'kotani',
  apiKey: 'test_api_key',
  apiSecret: 'test_api_secret',
  baseUrl: 'https://api.kotanipay.com/v1',
  webhookSecret: 'test_webhook_secret',
  timeoutMs: 60000,
  retryAttempts: 3,
};

const mockYellowCardConfig: MpesaCryptoBridgeConfig = {
  enabled: true,
  environment: 'sandbox',
  bridgeProvider: 'yellowcard',
  apiKey: 'test_yc_api_key',
  apiSecret: 'test_yc_api_secret',
  baseUrl: 'https://api.yellowcard.io/v1',
  timeoutMs: 60000,
  retryAttempts: 3,
};

describe('MpesaCryptoBridgeAdapter', () => {
  let adapter: MpesaCryptoBridgeAdapter;
  let mockPost: jest.Mock;
  let mockGet: jest.Mock;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-15T12:00:00Z'));
    jest.clearAllMocks();
    
    mockPost = jest.fn();
    mockGet = jest.fn();
    
    mockAxiosInstance = {
      get: mockGet,
      post: mockPost,
      interceptors: {
        request: { use: jest.fn(), eject: jest.fn() },
        response: { use: jest.fn(), eject: jest.fn() },
      },
    };
    
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);
    
    adapter = new MpesaCryptoBridgeAdapter(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==================== Adapter Properties ====================
  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('mpesa_crypto_bridge');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('M-Pesa Crypto Bridge');
    });

    it('should support African countries', () => {
      expect(adapter.countries).toContain('KE');
      expect(adapter.countries).toContain('NG');
      expect(adapter.countries).toContain('GH');
    });

    it('should support KES and crypto currencies', () => {
      expect(adapter.currencies).toContain('KES');
      expect(adapter.currencies).toContain('USDC');
      expect(adapter.currencies).toContain('USDT');
    });

    it('should support mobile money, wallet and bank transfer methods', () => {
      expect(adapter.supportedMethods).toContain('mobile_money');
      expect(adapter.supportedMethods).toContain('wallet');
      expect(adapter.supportedMethods).toContain('bank_transfer');
    });

    it('should have config accessible', () => {
      expect(adapter.config).toEqual(mockConfig);
    });
  });

  // ==================== OFF-RAMP: Send Money (Crypto → M-Pesa) ====================
  describe('sendMoney (off-ramp)', () => {
    const sendMoneyParams: SendMoneyParams = {
      recipient: {
        name: 'John Doe',
        phone: {
          countryCode: '254',
          nationalNumber: '712345678',
          formatted: '+254712345678',
        },
      },
      amount: {
        amount: 13000,
        currency: 'KES',
      },
      description: 'Convert USDC to M-Pesa',
      callbackUrl: 'https://example.com/webhook',
      metadata: {
        orderId: 'ORDER123',
      },
    };

    it('should initiate off-ramp successfully', async () => {
      // Mock quote
      mockPost.mockResolvedValueOnce({
        data: {
          quoteId: 'quote_123',
          fromCurrency: 'USDC',
          toCurrency: 'KES',
          fromAmount: 100,
          toAmount: 13000,
          exchangeRate: 130,
          fee: 2,
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        },
      });

      // Mock off-ramp transaction
      mockPost.mockResolvedValueOnce({
        data: {
          transactionId: 'tx_offramp_123',
          status: 'pending',
          type: 'offramp',
          fromAmount: 100,
          fromCurrency: 'USDC',
          toAmount: 13000,
          toCurrency: 'KES',
          phoneNumber: '254712345678',
          walletAddress: '0xwallet123',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const transaction = await adapter.sendMoney(sendMoneyParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('mpesa_crypto_bridge');
      expect(transaction.status).toBe('pending');
      expect(transaction.amount.amount).toBe(100); // USDC amount
      expect(transaction.amount.currency).toBe('USDC');
      expect(transaction.metadata.bridgeType).toBe('offramp');
      expect(transaction.metadata.walletAddress).toBe('0xwallet123');
      expect(transaction.metadata.instructions).toContain('Send');
    });

    it('should fail without recipient phone', async () => {
      const paramsWithoutPhone: SendMoneyParams = {
        ...sendMoneyParams,
        recipient: { name: 'Test' },
      };

      await expect(adapter.sendMoney(paramsWithoutPhone)).rejects.toThrow('phone number is required');
    });

    it('should format phone number correctly', async () => {
      mockPost.mockResolvedValueOnce({
        data: { quoteId: 'quote_123', exchangeRate: 130, fee: 2, fromAmount: 100, toAmount: 13000 },
      });

      mockPost.mockResolvedValueOnce({
        data: {
          transactionId: 'tx_123',
          status: 'pending',
          type: 'offramp',
          phoneNumber: '254712345678',
          walletAddress: '0xwallet123',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const transaction = await adapter.sendMoney(sendMoneyParams);
      expect(transaction.metadata.phoneNumber).toBe('254712345678');
    });
  });

  // ==================== ON-RAMP: Request Payment (M-Pesa → Crypto) ====================
  describe('requestPayment (on-ramp)', () => {
    const requestParams: RequestPaymentParams = {
      customer: {
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: {
          countryCode: '254',
          nationalNumber: '798765432',
          formatted: '+254798765432',
        },
      },
      amount: {
        amount: 5000,
        currency: 'KES',
      },
      description: 'Convert M-Pesa to USDC',
      callbackUrl: 'https://example.com/webhook',
      metadata: {
        walletAddress: '0xuserwallet456',
        accountNumber: 'ACC456',
      },
    };

    it('should initiate on-ramp successfully', async () => {
      // Mock quote
      mockPost.mockResolvedValueOnce({
        data: {
          quoteId: 'quote_456',
          fromCurrency: 'KES',
          toCurrency: 'USDC',
          fromAmount: 5000,
          toAmount: 38.46,
          exchangeRate: 0.007692,
          fee: 100,
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        },
      });

      // Mock on-ramp transaction
      mockPost.mockResolvedValueOnce({
        data: {
          transactionId: 'tx_onramp_456',
          status: 'pending',
          type: 'onramp',
          fromAmount: 5000,
          fromCurrency: 'KES',
          toAmount: 38.46,
          toCurrency: 'USDC',
          phoneNumber: '254798765432',
          walletAddress: '0xuserwallet456',
          externalTransactionId: '174379', // Paybill number
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const transaction = await adapter.requestPayment(requestParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('mpesa_crypto_bridge');
      expect(transaction.status).toBe('pending');
      expect(transaction.amount.amount).toBe(5000);
      expect(transaction.amount.currency).toBe('KES');
      expect(transaction.metadata.bridgeType).toBe('onramp');
      expect(transaction.metadata.cryptoAmount).toBe(38.46);
      expect(transaction.metadata.walletAddress).toBe('0xuserwallet456');
      expect(transaction.metadata.paybillNumber).toBe('174379');
    });

    it('should fail without wallet address', async () => {
      const paramsWithoutWallet: RequestPaymentParams = {
        ...requestParams,
        metadata: {},
      };

      await expect(adapter.requestPayment(paramsWithoutWallet)).rejects.toThrow('Wallet address is required');
    });

    it('should include M-Pesa payment instructions', async () => {
      mockPost.mockResolvedValueOnce({
        data: { quoteId: 'quote_456', exchangeRate: 0.007692, fee: 100 },
      });

      mockPost.mockResolvedValueOnce({
        data: {
          transactionId: 'tx_456',
          status: 'pending',
          type: 'onramp',
          fromAmount: 5000,
          toAmount: 38.46,
          externalTransactionId: '174379',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const transaction = await adapter.requestPayment(requestParams);
      expect(transaction.metadata.instructions).toContain('Send');
      expect(transaction.metadata.instructions).toContain('M-Pesa');
      expect(transaction.metadata.instructions).toContain('Paybill');
    });
  });

  // ==================== Verify Transaction ====================
  describe('verifyTransaction', () => {
    it('should return transaction status', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          transactionId: 'tx_123',
          status: 'completed',
          type: 'offramp',
          fromAmount: 100,
          fromCurrency: 'USDC',
          toAmount: 13000,
          toCurrency: 'KES',
          phoneNumber: '254712345678',
          walletAddress: '0xwallet123',
          externalTransactionId: 'MPESA123',
          createdAt: '2026-01-15T12:00:00Z',
          updatedAt: '2026-01-15T12:05:00Z',
          completedAt: '2026-01-15T12:05:00Z',
        },
      });

      const status = await adapter.verifyTransaction('bridge_tx_123');
      
      expect(status).toBeDefined();
      expect(status.provider).toBe('mpesa_crypto_bridge');
      expect(status.status).toBe('completed');
      expect(status.completedAt).toBeDefined();
    });
  });

  // ==================== Refund ====================
  describe('refund', () => {
    it('should process refund successfully', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          refundId: 'refund_123',
          status: 'pending',
        },
      });

      const result = await adapter.refund({
        originalTransactionId: 'tx_123',
        amount: { amount: 100, currency: 'USDC' },
        reason: 'Customer request',
      });
      
      expect(result).toBeDefined();
      expect(result.provider).toBe('mpesa_crypto_bridge');
      expect(result.status).toBe('pending');
      expect(result.metadata.refundId).toBe('refund_123');
    });
  });

  // ==================== Get Rates ====================
  describe('getRates', () => {
    it('should return KES to USDC rate', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          quoteId: 'quote_789',
          fromAmount: 1000,
          toAmount: 7.7,
          exchangeRate: 0.0077,
          fee: 20,
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        },
      });

      const rate = await adapter.getRates('KES', 'USDC');
      expect(rate).toBe(0.0077);
    });

    it('should return fallback rates on error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network error'));

      const rate = await adapter.getRates('KES', 'USDC');
      expect(rate).toBe(0.0077); // Fallback rate
    });
  });

  // ==================== Get Supported Pairs ====================
  describe('getSupportedPairs', () => {
    it('should return supported trading pairs', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          pairs: [
            { from: 'KES', to: 'USDC', minAmount: 100, maxAmount: 1000000, feePercentage: 2 },
            { from: 'USDC', to: 'KES', minAmount: 10, maxAmount: 10000, feePercentage: 2 },
          ],
        },
      });

      const pairs = await adapter.getSupportedPairs();
      
      expect(pairs).toBeDefined();
      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs[0]).toHaveProperty('from');
      expect(pairs[0]).toHaveProperty('to');
      expect(pairs[0]).toHaveProperty('minAmount');
      expect(pairs[0]).toHaveProperty('maxAmount');
    });

    it('should return default pairs on error', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network error'));

      const pairs = await adapter.getSupportedPairs();
      
      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs.find(p => p.from === 'KES' && p.to === 'USDC')).toBeDefined();
    });
  });

  // ==================== Webhook Parsing ====================
  describe('parseWebhook', () => {
    it('should parse Kotani webhook successfully', async () => {
      const payload = {
        event: 'transaction.completed',
        data: {
          transactionId: 'tx_webhook_123',
          type: 'onramp',
          status: 'completed',
          fromAmount: 5000,
          fromCurrency: 'KES',
          toAmount: 38.46,
          toCurrency: 'USDC',
          phoneNumber: '254712345678',
          walletAddress: '0xwallet123',
          externalTransactionId: 'MPESA456',
          createdAt: '2026-01-15T12:00:00Z',
          updatedAt: '2026-01-15T12:05:00Z',
          completedAt: '2026-01-15T12:05:00Z',
        },
        timestamp: '2026-01-15T12:05:00Z',
        signature: 'sig_123',
      };

      const transaction = await adapter.parseWebhook(payload, 'sig_123');
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('mpesa_crypto_bridge');
      expect(transaction.status).toBe('completed');
      expect(transaction.metadata.bridgeProvider).toBe('kotani');
    });

    it('should parse Yellow Card webhook successfully', async () => {
      const yellowCardAdapter = new MpesaCryptoBridgeAdapter(mockYellowCardConfig);

      const payload = {
        event: 'collection.received',
        data: {
          id: 'yc_tx_123',
          status: 'completed',
          channel: 'MPESA',
          amount: '5000',
          currency: 'KES',
          customerPhone: '254712345678',
          externalId: 'MPESA789',
          createdAt: '2026-01-15T12:00:00Z',
          updatedAt: '2026-01-15T12:05:00Z',
        },
        timestamp: '2026-01-15T12:05:00Z',
        signature: 'yc_sig_123',
      };

      const transaction = await yellowCardAdapter.parseWebhook(payload, 'yc_sig_123');
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('mpesa_crypto_bridge');
      expect(transaction.metadata.bridgeProvider).toBe('yellowcard');
    });
  });

  // ==================== Webhook Verification ====================
  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', async () => {
      const payload = { event: 'test', data: {} };
      const isValid = await adapter.verifyWebhookSignature(payload, 'valid_sig');
      expect(isValid).toBe(true);
    });

    it('should return true when no webhook secret configured', async () => {
      const noSecretConfig = { ...mockConfig, webhookSecret: undefined };
      const noSecretAdapter = new MpesaCryptoBridgeAdapter(noSecretConfig);
      
      const payload = { event: 'test', data: {} };
      const isValid = await noSecretAdapter.verifyWebhookSignature(payload, 'any_sig');
      expect(isValid).toBe(true);
    });
  });
});
