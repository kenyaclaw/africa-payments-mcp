/**
 * Bitcoin Lightning Adapter Tests
 * 
 * Comprehensive test suite for the Bitcoin Lightning Network adapter.
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
import { BitcoinLightningAdapter } from '../../src/adapters/bitcoin-lightning/index.js';
import { 
  BitcoinLightningConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
} from '../../src/types/index.js';

// Mock config for testing
const mockConfig: BitcoinLightningConfig = {
  enabled: true,
  environment: 'sandbox',
  nodeType: 'lnd',
  nodeUrl: 'https://localhost:8080',
  macaroonHex: 'test_macaroon_hex',
  timeoutMs: 30000,
  retryAttempts: 3,
};

const mockCoreLightningConfig: BitcoinLightningConfig = {
  enabled: true,
  environment: 'sandbox',
  nodeType: 'core_lightning',
  nodeUrl: 'https://localhost:8081',
  rune: 'test_rune',
  timeoutMs: 30000,
  retryAttempts: 3,
};

describe('BitcoinLightningAdapter', () => {
  let adapter: BitcoinLightningAdapter;
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
    
    adapter = new BitcoinLightningAdapter(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==================== Adapter Properties ====================
  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('bitcoin_lightning');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('Bitcoin Lightning');
    });

    it('should support global availability', () => {
      expect(adapter.countries).toContain('GLOBAL');
    });

    it('should support BTC and SATS', () => {
      expect(adapter.currencies).toContain('BTC');
      expect(adapter.currencies).toContain('SATS');
    });

    it('should support wallet and QR code methods', () => {
      expect(adapter.supportedMethods).toContain('wallet');
      expect(adapter.supportedMethods).toContain('qr_code');
    });

    it('should have config accessible', () => {
      expect(adapter.config).toEqual(mockConfig);
    });
  });

  // ==================== Send Money (Pay Invoice) ====================
  describe('sendMoney', () => {
    const sendMoneyParams: SendMoneyParams = {
      recipient: {
        name: 'Test Merchant',
        email: 'merchant@example.com',
      },
      amount: {
        amount: 0.001,
        currency: 'BTC',
      },
      description: 'Test Lightning payment',
      metadata: {
        lightningInvoice: 'lnbc1m1p3w0de0pp5...test_invoice',
        orderId: 'ORDER123',
      },
    };

    it('should pay invoice successfully', async () => {
      // Mock decode pay request
      mockGet.mockResolvedValueOnce({
        data: {
          destination: '02abcdef...',
          payment_hash: 'payment_hash_123',
          num_satoshis: '100000',
          description: 'Test payment',
          timestamp: '1705315200',
          expiry: '3600',
        },
      });
      
      // Mock payment
      mockPost.mockResolvedValueOnce({
        data: {
          payment_hash: 'payment_hash_123',
          value: '100000',
          creation_date: '1705315200',
          fee_sat: '100',
          payment_preimage: 'preimage_123',
          status: 'SUCCEEDED',
        },
      });

      const transaction = await adapter.sendMoney(sendMoneyParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('bitcoin_lightning');
      expect(transaction.status).toBe('completed');
      expect(transaction.amount.amount).toBe(0.001);
      expect(transaction.amount.currency).toBe('BTC');
      expect(transaction.metadata.paymentHash).toBe('payment_hash_123');
    });

    it('should fail without lightning invoice', async () => {
      const paramsWithoutInvoice: SendMoneyParams = {
        ...sendMoneyParams,
        metadata: {},
      };

      await expect(adapter.sendMoney(paramsWithoutInvoice)).rejects.toThrow('Lightning invoice');
    });

    it('should fail with invalid invoice format', async () => {
      const paramsWithInvalidInvoice: SendMoneyParams = {
        ...sendMoneyParams,
        metadata: { lightningInvoice: 'invalid_invoice' },
      };

      await expect(adapter.sendMoney(paramsWithInvalidInvoice)).rejects.toThrow('Invalid Lightning invoice');
    });
  });

  // ==================== Request Payment (Generate Invoice) ====================
  describe('requestPayment', () => {
    const requestParams: RequestPaymentParams = {
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
      },
      amount: {
        amount: 0.0005,
        currency: 'BTC',
      },
      description: 'Payment for services',
      expiryMinutes: 30,
      metadata: { accountNumber: 'ACC123' },
    };

    it('should generate invoice successfully', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          r_hash: 'invoice_hash_123',
          payment_request: 'lnbc500u1p3w0de0pp5...',
          add_index: '12345',
          payment_addr: 'payment_addr_123',
        },
      });

      const transaction = await adapter.requestPayment(requestParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('bitcoin_lightning');
      expect(transaction.status).toBe('pending');
      expect(transaction.metadata.paymentRequest).toBe('lnbc500u1p3w0de0pp5...');
      expect(transaction.metadata.qrCodeData).toBe('lnbc500u1p3w0de0pp5...');
    });

    it('should generate invoice with default expiry', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          r_hash: 'invoice_hash_456',
          payment_request: 'lnbc500u1p3w0de0pp5...',
          add_index: '12346',
          payment_addr: 'payment_addr_456',
        },
      });

      const paramsWithoutExpiry = { ...requestParams };
      delete (paramsWithoutExpiry as any).expiryMinutes;

      const transaction = await adapter.requestPayment(paramsWithoutExpiry);
      
      expect(transaction).toBeDefined();
      expect(transaction.metadata.expiresAt).toBeDefined();
    });
  });

  // ==================== Verify Transaction ====================
  describe('verifyTransaction', () => {
    it('should return transaction status for LND', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          r_hash: Buffer.from('invoice_hash_123').toString('base64'),
          payment_request: 'lnbc500u1p3w0de0pp5...',
          state: 'SETTLED',
          amt_paid_sat: '50000',
          amt_paid_msat: '50000000',
          settled: true,
          settlement_date: '1705315200',
        },
      });

      const status = await adapter.verifyTransaction('btc_lightning_invoice_hash_123');
      
      expect(status).toBeDefined();
      expect(status.provider).toBe('bitcoin_lightning');
      expect(status.status).toBe('completed');
    });
  });

  // ==================== Refund ====================
  describe('refund', () => {
    it('should create refund record', async () => {
      const refundParams = {
        originalTransactionId: 'tx123',
        amount: {
          amount: 0.0005,
          currency: 'BTC',
        },
        reason: 'Customer request',
      };

      const result = await adapter.refund(refundParams);
      
      expect(result).toBeDefined();
      expect(result.provider).toBe('bitcoin_lightning');
      expect(result.status).toBe('pending');
      expect(result.metadata.refundMethod).toBe('manual_invoice');
      expect(result.metadata.originalTransactionId).toBe('tx123');
    });
  });

  // ==================== Get Balance ====================
  describe('getBalance', () => {
    it('should return channel balance', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          balance: '5000000',
          pending_open_balance: '0',
        },
      });

      const balance = await adapter.getBalance();
      
      expect(balance).toBeDefined();
      expect(balance.currency).toBe('BTC');
      expect(balance.amount).toBe(0.05);
    });
  });

  // ==================== Validate Invoice ====================
  describe('validateInvoice', () => {
    it('should validate correct invoice', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          destination: '02abcdef...',
          payment_hash: 'payment_hash_123',
          num_satoshis: '100000',
          description: 'Test payment',
          timestamp: '1705315200',
          expiry: '3600',
        },
      });

      const result = await adapter.validateInvoice('lnbc1m1p3w0de0pp5...');
      
      expect(result.valid).toBe(true);
      expect(result.amount).toBeDefined();
      expect(result.description).toBe('Test payment');
    });

    it('should reject invalid invoice format', async () => {
      const result = await adapter.validateInvoice('invalid_invoice');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid invoice format');
    });
  });

  // ==================== Core Lightning Support ====================
  describe('Core Lightning node type', () => {
    let clAdapter: BitcoinLightningAdapter;

    beforeEach(() => {
      (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);
      clAdapter = new BitcoinLightningAdapter(mockCoreLightningConfig);
    });

    it('should use Core Lightning configuration', () => {
      expect(clAdapter.config.nodeType).toBe('core_lightning');
    });

    it('should generate invoice via Core Lightning', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          payment_hash: 'cl_invoice_hash_123',
          bolt11: 'lnbc500u1p3w0de0pp5...',
          payment_secret: 'secret_123',
          expires_at: 1705315200 + 3600,
        },
      });

      const transaction = await clAdapter.requestPayment({
        customer: { name: 'Test' },
        amount: { amount: 0.0005, currency: 'BTC' },
      });
      
      expect(transaction).toBeDefined();
      expect(transaction.metadata.nodeType).toBe('core_lightning');
    });
  });
});
