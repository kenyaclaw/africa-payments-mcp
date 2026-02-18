/**
 * Celo Adapter Tests
 * 
 * Comprehensive test suite for the Celo blockchain adapter.
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
import { CeloAdapter } from '../../src/adapters/celo/index.js';
import { 
  CeloConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
} from '../../src/types/index.js';

// Mock config for testing
const mockConfig: CeloConfig = {
  enabled: true,
  environment: 'sandbox',
  fromAddress: '0x1234567890abcdef1234567890abcdef12345678',
  privateKey: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  rpcUrl: 'https://alfajores-forno.celo-testnet.org',
  useValora: true,
  timeoutMs: 30000,
  retryAttempts: 3,
};

describe('CeloAdapter', () => {
  let adapter: CeloAdapter;
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
    
    adapter = new CeloAdapter(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==================== Adapter Properties ====================
  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('celo');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('Celo');
    });

    it('should support global availability', () => {
      expect(adapter.countries).toContain('GLOBAL');
    });

    it('should support CELO, cUSD, cEUR', () => {
      expect(adapter.currencies).toContain('CELO');
      expect(adapter.currencies).toContain('cUSD');
      expect(adapter.currencies).toContain('cEUR');
    });

    it('should support mobile money, wallet and QR code methods', () => {
      expect(adapter.supportedMethods).toContain('mobile_money');
      expect(adapter.supportedMethods).toContain('wallet');
      expect(adapter.supportedMethods).toContain('qr_code');
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
        amount: 50,
        currency: 'cUSD',
      },
      description: 'Test cUSD transfer',
      metadata: {
        celoAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        orderId: 'ORDER123',
      },
    };

    it('should initiate cUSD transfer successfully', async () => {
      const transaction = await adapter.sendMoney(sendMoneyParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('celo');
      expect(transaction.status).toBe('pending');
      expect(transaction.amount.amount).toBe(50);
      expect(transaction.amount.currency).toBe('cUSD');
      expect(transaction.metadata.toAddress).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
      expect(transaction.metadata.fromAddress).toBe(mockConfig.fromAddress);
    });

    it('should initiate CELO transfer', async () => {
      const paramsCELO: SendMoneyParams = {
        ...sendMoneyParams,
        amount: { amount: 10, currency: 'CELO' },
      };

      const transaction = await adapter.sendMoney(paramsCELO);
      expect(transaction.amount.currency).toBe('CELO');
    });

    it('should fail without celo address', async () => {
      const paramsWithoutAddress: SendMoneyParams = {
        ...sendMoneyParams,
        metadata: {},
      };

      await expect(adapter.sendMoney(paramsWithoutAddress)).rejects.toThrow('Celo destination address');
    });

    it('should fail with invalid celo address', async () => {
      const paramsWithInvalidAddress: SendMoneyParams = {
        ...sendMoneyParams,
        metadata: { celoAddress: 'invalid_address' },
      };

      await expect(adapter.sendMoney(paramsWithInvalidAddress)).rejects.toThrow('Valid Celo destination address');
    });

    it('should include block explorer URL', async () => {
      const transaction = await adapter.sendMoney(sendMoneyParams);
      expect(transaction.metadata.blockExplorerUrl).toContain('explorer.celo.org');
    });
  });

  // ==================== Request Payment ====================
  describe('requestPayment', () => {
    const requestParams: RequestPaymentParams = {
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: {
          countryCode: '254',
          nationalNumber: '712345678',
          formatted: '+254712345678',
        },
      },
      amount: {
        amount: 100,
        currency: 'cUSD',
      },
      description: 'Payment for services',
      expiryMinutes: 60,
      metadata: { accountNumber: 'ACC123' },
    };

    it('should create payment request with Valora deep link', async () => {
      const transaction = await adapter.requestPayment(requestParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('celo');
      expect(transaction.status).toBe('pending');
      expect(transaction.metadata.recipientAddress).toBe(mockConfig.fromAddress);
      expect(transaction.metadata.valoraDeeplink).toBeDefined();
      expect(transaction.metadata.valoraDeeplink).toContain('valoraapp.com');
    });

    it('should include QR code data', async () => {
      const transaction = await adapter.requestPayment(requestParams);
      expect(transaction.metadata.qrCodeData).toBeDefined();
    });

    it('should handle CELO payment request', async () => {
      const paramsCELO: RequestPaymentParams = {
        ...requestParams,
        amount: { amount: 25, currency: 'CELO' },
      };

      const transaction = await adapter.requestPayment(paramsCELO);
      expect(transaction.metadata.tokenSymbol).toBe('CELO');
    });

    it('should default to cUSD for unknown currency', async () => {
      const paramsUnknown: RequestPaymentParams = {
        ...requestParams,
        amount: { amount: 100, currency: 'XYZ' },
      };

      const transaction = await adapter.requestPayment(paramsUnknown);
      expect(transaction.metadata.tokenSymbol).toBe('cUSD');
    });

    it('should include instructions', async () => {
      const transaction = await adapter.requestPayment(requestParams);
      expect(transaction.metadata.instructions).toContain('Open Valora');
      expect(transaction.metadata.instructions).toContain('valoraapp.com');
    });
  });

  // ==================== Verify Transaction ====================
  describe('verifyTransaction', () => {
    it('should return transaction status for successful tx', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          result: {
            hash: '0xtx_hash_123',
            from: mockConfig.fromAddress,
            to: '0xabcdef1234567890abcdef1234567890abcdef12',
            value: '0x8ac7230489e80000', // 10 CELO in wei
            gasPrice: '0x174876e00',
            gas: '0x5208',
            nonce: '0x1',
            blockHash: '0xblock_hash_123',
            blockNumber: '0x123456',
            transactionIndex: '0x0',
            input: '0x',
          },
        },
      });

      mockPost.mockResolvedValueOnce({
        data: {
          result: {
            transactionHash: '0xtx_hash_123',
            blockHash: '0xblock_hash_123',
            blockNumber: '0x123456',
            from: mockConfig.fromAddress,
            to: '0xabcdef1234567890abcdef1234567890abcdef12',
            cumulativeGasUsed: '0x5208',
            gasUsed: '0x5208',
            contractAddress: null,
            logs: [],
            status: '0x1', // Success
            logsBloom: '0x...',
          },
        },
      });

      const status = await adapter.verifyTransaction('0xtx_hash_123');
      
      expect(status).toBeDefined();
      expect(status.provider).toBe('celo');
      expect(status.status).toBe('completed');
      expect(status.metadata.blockNumber).toBe(1193046);
    });

    it('should handle failed transaction', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          result: {
            hash: '0xtx_hash_456',
            from: mockConfig.fromAddress,
            to: '0xabcdef1234567890abcdef1234567890abcdef12',
            value: '0x0',
            blockHash: '0xblock_hash_456',
            blockNumber: '0x123457',
          },
        },
      });

      mockPost.mockResolvedValueOnce({
        data: {
          result: {
            transactionHash: '0xtx_hash_456',
            status: '0x0', // Failed
            gasUsed: '0x5208',
          },
        },
      });

      const status = await adapter.verifyTransaction('0xtx_hash_456');
      expect(status.status).toBe('failed');
    });

    it('should handle pending transaction', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          result: {
            hash: '0xtx_hash_789',
            from: mockConfig.fromAddress,
            to: '0xabcdef1234567890abcdef1234567890abcdef12',
            value: '0x0',
            blockHash: null,
            blockNumber: null,
          },
        },
      });

      const status = await adapter.verifyTransaction('0xtx_hash_789');
      expect(status.status).toBe('pending');
    });
  });

  // ==================== Refund ====================
  describe('refund', () => {
    it('should create refund record', async () => {
      const refundParams = {
        originalTransactionId: 'tx123',
        amount: {
          amount: 50,
          currency: 'cUSD',
        },
        reason: 'Customer request',
      };

      const result = await adapter.refund(refundParams);
      
      expect(result).toBeDefined();
      expect(result.provider).toBe('celo');
      expect(result.status).toBe('pending');
      expect(result.metadata.refundMethod).toBe('celo_transfer');
      expect(result.metadata.originalTransactionId).toBe('tx123');
    });
  });

  // ==================== Get Balance ====================
  describe('getBalance', () => {
    it('should return CELO balance', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          result: '0x8ac7230489e80000', // 10 CELO in hex
        },
      });

      const balance = await adapter.getBalance();
      
      expect(balance).toBeDefined();
      expect(balance.currency).toBe('CELO');
      expect(balance.amount).toBe(10);
    });
  });

  // ==================== Get All Balances ====================
  describe('getAllBalances', () => {
    it('should return all token balances', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          result: '0x8ac7230489e80000', // 10 CELO
        },
      });

      const balances = await adapter.getAllBalances();
      
      expect(balances).toBeDefined();
      expect(balances.length).toBeGreaterThanOrEqual(3);
      expect(balances.find(b => b.currency === 'CELO')?.amount).toBe(10);
      expect(balances.find(b => b.currency === 'cUSD')).toBeDefined();
      expect(balances.find(b => b.currency === 'cEUR')).toBeDefined();
    });
  });

  // ==================== Get Rates ====================
  describe('getRates', () => {
    it('should return cUSD to USD rate', async () => {
      const rate = await adapter.getRates('USD', 'cUSD');
      expect(rate).toBe(1);
    });

    it('should return CELO to USD rate', async () => {
      const rate = await adapter.getRates('CELO', 'USD');
      expect(rate).toBe(0.4); // Approximate rate
    });

    it('should return cUSD to cEUR rate', async () => {
      const rate = await adapter.getRates('cUSD', 'cEUR');
      expect(rate).toBe(0.92); // Approximate rate
    });
  });

  // ==================== Validate Address ====================
  describe('validateAddress', () => {
    it('should validate correct Celo address', async () => {
      const isValid = await adapter.validateAddress('0x1234567890abcdef1234567890abcdef12345678');
      expect(isValid).toBe(true);
    });

    it('should reject invalid address format', async () => {
      const isValid = await adapter.validateAddress('invalid');
      expect(isValid).toBe(false);
    });

    it('should reject address without 0x prefix', async () => {
      const isValid = await adapter.validateAddress('1234567890abcdef1234567890abcdef12345678');
      expect(isValid).toBe(false);
    });

    it('should reject address too short', async () => {
      const isValid = await adapter.validateAddress('0x123456');
      expect(isValid).toBe(false);
    });
  });

  // ==================== Lookup Address by Phone ====================
  describe('lookupAddressByPhone', () => {
    it('should return not found for unregistered phone', async () => {
      const result = await adapter.lookupAddressByPhone('+254712345678');
      expect(result.found).toBe(false);
    });
  });

  // ==================== Estimate Gas ====================
  describe('estimateGas', () => {
    it('should return gas estimates', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          result: '0x5208', // 21000 gas
        },
      });

      mockPost.mockResolvedValueOnce({
        data: {
          result: '0x174876e00', // gas price
        },
      });

      const estimate = await adapter.estimateGas(
        '0xabcdef1234567890abcdef1234567890abcdef12',
        '0x8ac7230489e80000'
      );
      
      expect(estimate.gas).toBe('0x5208');
      expect(estimate.gasPrice).toBe('0x174876e00');
    });

    it('should return default estimates on error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network error'));

      const estimate = await adapter.estimateGas(
        '0xabcdef1234567890abcdef1234567890abcdef12',
        '0x0'
      );
      
      expect(estimate.gas).toBe('0x5208');
    });
  });
});
