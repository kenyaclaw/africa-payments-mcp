/**
 * USDC on Stellar Adapter Tests
 * 
 * Comprehensive test suite for the USDC Stellar adapter.
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
import { UsdcStellarAdapter } from '../../src/adapters/usdc-stellar/index.js';
import { 
  UsdcStellarConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
} from '../../src/types/index.js';

// Mock config for testing
const mockConfig: UsdcStellarConfig = {
  enabled: true,
  environment: 'sandbox',
  sourceAccount: 'GAA2QQ2WTHKR2VHV3AKMXLYPZHY2XRPNKXNMOQ4FEUF2DQZTOM2JNRFX',
  secretKey: 'test_secret_key',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  timeoutMs: 30000,
  retryAttempts: 3,
};

describe('UsdcStellarAdapter', () => {
  let adapter: UsdcStellarAdapter;
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
    
    adapter = new UsdcStellarAdapter(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==================== Adapter Properties ====================
  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('usdc_stellar');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('USDC on Stellar');
    });

    it('should support global availability', () => {
      expect(adapter.countries).toContain('GLOBAL');
    });

    it('should support USDC and XLM', () => {
      expect(adapter.currencies).toContain('USDC');
      expect(adapter.currencies).toContain('XLM');
    });

    it('should support wallet and bank transfer methods', () => {
      expect(adapter.supportedMethods).toContain('wallet');
      expect(adapter.supportedMethods).toContain('bank_transfer');
    });

    it('should have config accessible', () => {
      expect(adapter.config).toEqual(mockConfig);
    });
  });

  // ==================== Send Money ====================
  describe('sendMoney', () => {
    const sendMoneyParams: SendMoneyParams = {
      recipient: {
        name: 'Test Recipient',
        email: 'recipient@example.com',
      },
      amount: {
        amount: 100,
        currency: 'USDC',
      },
      description: 'Test USDC transfer',
      metadata: {
        stellarAddress: 'GBZXC7VE7P5UBSW6SNUZ3EFR7F4XJH2JCJGHWHY2PUNPYD4PTILVFW5B',
        memo: 'Payment for invoice #123',
        orderId: 'ORDER123',
      },
    };

    it('should initiate USDC transfer successfully', async () => {
      const transaction = await adapter.sendMoney(sendMoneyParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('usdc_stellar');
      expect(transaction.status).toBe('pending');
      expect(transaction.amount.amount).toBe(100);
      expect(transaction.amount.currency).toBe('USDC');
      expect(transaction.metadata.destinationAddress).toBe('GBZXC7VE7P5UBSW6SNUZ3EFR7F4XJH2JCJGHWHY2PUNPYD4PTILVFW5B');
      expect(transaction.metadata.memo).toBe('Payment for invoice #123');
      expect(transaction.metadata.destinationAddress).toBeDefined();
    });

    it('should fail without stellar address', async () => {
      const paramsWithoutAddress: SendMoneyParams = {
        ...sendMoneyParams,
        metadata: {},
      };

      await expect(adapter.sendMoney(paramsWithoutAddress)).rejects.toThrow('Stellar destination address');
    });

    it('should fail with invalid stellar address', async () => {
      const paramsWithInvalidAddress: SendMoneyParams = {
        ...sendMoneyParams,
        metadata: { stellarAddress: 'invalid_address' },
      };

      await expect(adapter.sendMoney(paramsWithInvalidAddress)).rejects.toThrow('Invalid Stellar address');
    });

    it('should always use USDC currency', async () => {
      // USDC Stellar adapter always uses USDC regardless of input currency
      const paramsCUSD: SendMoneyParams = {
        ...sendMoneyParams,
        amount: { amount: 50, currency: 'cUSD' },
      };

      const transaction = await adapter.sendMoney(paramsCUSD);
      expect(transaction.amount.currency).toBe('USDC');
      expect(transaction.metadata.assetCode).toBe('USDC');
    });
  });

  // ==================== Request Payment ====================
  describe('requestPayment', () => {
    const requestParams: RequestPaymentParams = {
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
      },
      amount: {
        amount: 250,
        currency: 'USDC',
      },
      description: 'Payment for services',
      expiryMinutes: 60,
      metadata: { 
        accountNumber: 'ACC123',
        walletAddress: mockConfig.sourceAccount,
      },
    };

    it('should create payment request successfully', async () => {
      const transaction = await adapter.requestPayment(requestParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('usdc_stellar');
      expect(transaction.status).toBe('pending');
      expect(transaction.metadata.destinationAddress).toBe(mockConfig.sourceAccount);
      expect(transaction.metadata.memo).toBeDefined();
      expect(transaction.metadata.instructions).toContain('Send 250 USDC');
    });

    it('should include network passphrase in metadata', async () => {
      const transaction = await adapter.requestPayment(requestParams);
      
      expect(transaction.metadata.networkPassphrase).toContain('Test SDF Network');
    });

    it('should handle anchor integration', async () => {
      const anchorConfig: UsdcStellarConfig = {
        ...mockConfig,
        useAnchor: true,
        anchorUrl: 'https://test-anchor.stellar.org',
      };
      
      (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);
      const anchorAdapter = new UsdcStellarAdapter(anchorConfig);

      mockGet.mockResolvedValueOnce({
        data: {
          id: 'anchor_tx_123',
          kind: 'deposit',
          status: 'pending_user_transfer_start',
          amount_in: '250.00',
          started_at: '2026-01-15T12:00:00Z',
        },
      });

      const transaction = await anchorAdapter.requestPayment(requestParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.metadata.anchorUrl).toBe('https://test-anchor.stellar.org');
    });
  });

  // ==================== Verify Transaction ====================
  describe('verifyTransaction', () => {
    it('should return transaction status', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          id: 'tx_hash_123',
          paging_token: 'token123',
          successful: true,
          hash: 'tx_hash_123',
          ledger: 123456,
          created_at: '2026-01-15T12:00:00Z',
          source_account: mockConfig.sourceAccount,
          source_account_sequence: '12345',
          fee_paid: '100',
          operation_count: 1,
        },
      });

      mockGet.mockResolvedValueOnce({
        data: {
          _embedded: {
            records: [
              {
                id: 'op_123',
                type: 'payment',
                from: mockConfig.sourceAccount,
                to: 'GBZXC7VE7P5UBSW6SNUZ3EFR7F4XJH2JCJGHWHY2PUNPYD4PTILVFW5B',
                amount: '100.0000000',
                asset_code: 'USDC',
                asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
              },
            ],
          },
        },
      });

      const status = await adapter.verifyTransaction('usdc_stellar_tx_hash_123');
      
      expect(status).toBeDefined();
      expect(status.provider).toBe('usdc_stellar');
      expect(status.status).toBe('completed');
    });

    it('should handle transaction not found', async () => {
      mockGet.mockRejectedValueOnce({
        response: { status: 404, data: { title: 'Not Found' } },
      });

      await expect(adapter.verifyTransaction('nonexistent_tx')).rejects.toThrow('not found');
    });
  });

  // ==================== Refund ====================
  describe('refund', () => {
    it('should create refund record', async () => {
      const refundParams = {
        originalTransactionId: 'tx123',
        amount: {
          amount: 100,
          currency: 'USDC',
        },
        reason: 'Customer request',
      };

      const result = await adapter.refund(refundParams);
      
      expect(result).toBeDefined();
      expect(result.provider).toBe('usdc_stellar');
      expect(result.status).toBe('pending');
      expect(result.metadata.refundMethod).toBe('stellar_payment');
      expect(result.metadata.originalTransactionId).toBe('tx123');
    });
  });

  // ==================== Get Balance ====================
  describe('getBalance', () => {
    it('should return USDC balance', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          id: mockConfig.sourceAccount,
          account_id: mockConfig.sourceAccount,
          sequence: '12345',
          balances: [
            {
              balance: '1000.0000000',
              asset_type: 'credit_alphanum4',
              asset_code: 'USDC',
              asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
            },
            {
              balance: '50.0000000',
              asset_type: 'native',
            },
          ],
        },
      });

      const balance = await adapter.getBalance();
      
      expect(balance).toBeDefined();
      expect(balance.currency).toBe('USDC');
      expect(balance.amount).toBe(1000);
    });

    it('should return XLM balance when no USDC trustline', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          id: mockConfig.sourceAccount,
          account_id: mockConfig.sourceAccount,
          balances: [
            {
              balance: '50.0000000',
              asset_type: 'native',
            },
          ],
        },
      });

      const balance = await adapter.getBalance();
      
      expect(balance.currency).toBe('XLM');
      expect(balance.amount).toBe(50);
    });
  });

  // ==================== Get Rates ====================
  describe('getRates', () => {
    it('should return USDC to USD rate', async () => {
      const rate = await adapter.getRates('USD', 'USDC');
      expect(rate).toBe(1);
    });

    it('should return XLM to USDC rate', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          bids: [{ price_r: { n: 833, d: 10000 }, price: '0.0833' }],
          asks: [{ price_r: { n: 833, d: 10000 }, price: '0.0833' }],
        },
      });

      const rate = await adapter.getRates('XLM', 'USDC');
      expect(rate).toBeGreaterThan(0);
    });

    it('should return fallback rates on error', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network error'));

      const rate = await adapter.getRates('XLM', 'USDC');
      expect(rate).toBe(0.12); // Fallback rate
    });
  });

  // ==================== Validate Address ====================
  describe('validateAddress', () => {
    it('should validate correct Stellar address', async () => {
      const isValid = await adapter.validateAddress('GAA2QQ2WTHKR2VHV3AKMXLYPZHY2XRPNKXNMOQ4FEUF2DQZTOM2JNRFX');
      expect(isValid).toBe(true);
    });

    it('should reject invalid address format', async () => {
      const isValid = await adapter.validateAddress('invalid');
      expect(isValid).toBe(false);
    });

    it('should reject too short address', async () => {
      const isValid = await adapter.validateAddress('GAA2QQ2WTHKR2VHV3AKMXLYPZHY2XRPNKXNMOQ4FEUF2DQZTOM2J');
      expect(isValid).toBe(false);
    });
  });

  // ==================== Validate Memo ====================
  describe('validateMemo', () => {
    it('should validate text memo', () => {
      expect(adapter.validateMemo('Hello World', 'text')).toBe(true);
    });

    it('should reject text memo too long', () => {
      expect(adapter.validateMemo('a'.repeat(29), 'text')).toBe(false);
    });

    it('should validate ID memo', () => {
      expect(adapter.validateMemo('123456789', 'id')).toBe(true);
    });

    it('should reject invalid ID memo', () => {
      expect(adapter.validateMemo('abc', 'id')).toBe(false);
    });

    it('should validate hash memo', () => {
      expect(adapter.validateMemo('a'.repeat(64), 'hash')).toBe(true);
    });
  });
});
