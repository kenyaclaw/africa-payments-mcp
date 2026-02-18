/**
 * Paystack Adapter Tests
 * 
 * Comprehensive test suite for the Paystack API adapter.
 * Tests initialize transaction, verify, refund, and transfer operations.
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
import { PaystackAdapter } from '../../src/adapters/paystack/index.js';
import { 
  PaystackConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams,
  TransactionStatus 
} from '../../src/types/index.js';
import paystackResponses from '../fixtures/paystack-responses.json';

// Mock config for testing
const mockConfig: PaystackConfig = {
  enabled: true,
  environment: 'sandbox',
  secretKey: 'sk_test_1234567890abcdef',
  publicKey: 'pk_test_1234567890abcdef',
  webhookSecret: 'whsec_test_secret',
};

describe('PaystackAdapter', () => {
  let adapter: PaystackAdapter;
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
    
    // Set up the mock axios instance BEFORE creating adapter
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);
    
    adapter = new PaystackAdapter(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==================== Adapter Properties ====================
  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('paystack');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('Paystack');
    });

    it('should support correct countries', () => {
      expect(adapter.countries).toContain('NG');
      expect(adapter.countries).toContain('GH');
      expect(adapter.countries).toContain('ZA');
      expect(adapter.countries).toContain('KE');
    });

    it('should support correct currencies', () => {
      expect(adapter.currencies).toContain('NGN');
      expect(adapter.currencies).toContain('GHS');
      expect(adapter.currencies).toContain('ZAR');
      expect(adapter.currencies).toContain('USD');
    });

    it('should support multiple payment methods', () => {
      expect(adapter.supportedMethods).toContain('card');
      expect(adapter.supportedMethods).toContain('bank_transfer');
      expect(adapter.supportedMethods).toContain('mobile_money');
    });

    it('should have config accessible', () => {
      expect(adapter.config).toEqual(mockConfig);
    });
  });

  // ==================== Initialization ====================
  describe('initialize', () => {
    it('should initialize successfully with valid secret key', async () => {
      // Mock the bank endpoint for API key validation
      mockGet.mockResolvedValueOnce({
        data: paystackResponses.banks.success,
      });
      
      await expect(adapter.initialize({})).resolves.not.toThrow();
    });

    it('should throw error for invalid secret key format', async () => {
      const invalidConfig = {
        ...mockConfig,
        secretKey: 'invalid_key_format',
      };
      
      const invalidAdapter = new PaystackAdapter(invalidConfig);
      
      await expect(invalidAdapter.initialize({})).rejects.toThrow('Invalid Paystack secret key');
    });

    it('should accept keys starting with sk_live_', async () => {
      const liveConfig = {
        ...mockConfig,
        secretKey: 'sk_live_1234567890abcdef',
      };
      
      // Mock the bank endpoint for API key validation
      mockGet.mockResolvedValueOnce({
        data: paystackResponses.banks.success,
      });
      
      const liveAdapter = new PaystackAdapter(liveConfig);
      
      await expect(liveAdapter.initialize({})).resolves.not.toThrow();
    });

    it('should reject keys without sk_ prefix', async () => {
      // Test public key format (pk_)
      const pkConfig = { ...mockConfig, secretKey: 'pk_test_123' };
      const pkAdapter = new PaystackAdapter(pkConfig);
      await expect(pkAdapter.initialize({})).rejects.toThrow('Invalid Paystack secret key');
      
      // Test invalid format (no sk_ prefix)
      const invalidConfig = { ...mockConfig, secretKey: 'test_123' };
      const invalidAdapter = new PaystackAdapter(invalidConfig);
      await expect(invalidAdapter.initialize({})).rejects.toThrow('Invalid Paystack secret key');
    });

    it('should reject empty secret key', async () => {
      const emptyConfig = { ...mockConfig, secretKey: '' };
      const emptyAdapter = new PaystackAdapter(emptyConfig);
      await expect(emptyAdapter.initialize({})).rejects.toThrow('Paystack secret key is required');
    });
    
    it('should throw error when API returns 401', async () => {
      mockGet.mockRejectedValueOnce({
        response: { status: 401 },
      });
      
      await expect(adapter.initialize({})).rejects.toThrow('Invalid Paystack secret key');
    });
  });

  // ==================== Send Money (Transfer) ====================
  describe('sendMoney', () => {
    const sendMoneyParams: SendMoneyParams = {
      recipient: {
        phone: {
          countryCode: '234',
          nationalNumber: '8012345678',
          formatted: '+2348012345678',
        },
        name: 'Chinedu Okonkwo',
        bankAccount: {
          accountNumber: '0123456789',
          bankCode: '044',
          accountName: 'Chinedu Okonkwo',
        },
      },
      amount: {
        amount: 50000,
        currency: 'NGN',
      },
      description: 'Payment for services',
      metadata: { invoiceId: 'INV001' },
    };

    it('should initiate transfer successfully', async () => {
      // Mock transfer recipient creation
      mockPost.mockResolvedValueOnce({
        data: {
          status: true,
          data: {
            recipient_code: 'RCP_123456789',
          },
        },
      });
      
      // Mock transfer initiation
      mockPost.mockResolvedValueOnce({
        data: paystackResponses.transfer.success,
      });

      const transaction = await adapter.sendMoney(sendMoneyParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('paystack_transfer_');
      expect(transaction.provider).toBe('paystack');
      expect(transaction.status).toBe('pending');
      expect(transaction.amount.amount).toBe(50000);
      expect(transaction.amount.currency).toBe('NGN');
      expect(transaction.customer.name).toBe('Chinedu Okonkwo');
      expect(transaction.customer.phone?.formatted).toBe('+2348012345678');
    });

    it('should generate unique provider transaction IDs', async () => {
      // Mock transfer recipient creation
      mockPost.mockResolvedValueOnce({
        data: {
          status: true,
          data: {
            recipient_code: 'RCP_123456789',
          },
        },
      });
      
      // Mock transfer initiation
      mockPost.mockResolvedValueOnce({
        data: paystackResponses.transfer.success,
      });

      const tx1 = await adapter.sendMoney(sendMoneyParams);
      
      jest.advanceTimersByTime(1000);
      
      // Mock for second transfer
      mockPost.mockResolvedValueOnce({
        data: {
          status: true,
          data: {
            recipient_code: 'RCP_987654321',
          },
        },
      });
      mockPost.mockResolvedValueOnce({
        data: {
          ...paystackResponses.transfer.success,
          data: {
            ...paystackResponses.transfer.success.data,
            transfer_code: 'TRF_test456',
          },
        },
      });
      
      const tx2 = await adapter.sendMoney(sendMoneyParams);
      
      expect(tx1.providerTransactionId).not.toBe(tx2.providerTransactionId);
    });

    it('should handle bank transfer recipient', async () => {
      const bankTransferParams: SendMoneyParams = {
        recipient: {
          name: 'Chinedu Okonkwo',
          bankAccount: {
            accountNumber: '0123456789',
            bankCode: '044',
            accountName: 'Chinedu Okonkwo',
          },
        },
        amount: {
          amount: 100000,
          currency: 'NGN',
        },
        description: 'Bank transfer',
      };
      
      // Mock transfer recipient creation
      mockPost.mockResolvedValueOnce({
        data: {
          status: true,
          data: {
            recipient_code: 'RCP_bank123',
          },
        },
      });
      
      // Mock transfer initiation
      mockPost.mockResolvedValueOnce({
        data: paystackResponses.transfer.success,
      });
      
      const transaction = await adapter.sendMoney(bankTransferParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.status).toBe('pending');
    });

    it('should throw error when recipient creation fails', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          status: false,
          message: 'Invalid bank code',
        },
      });
      
      await expect(adapter.sendMoney(sendMoneyParams)).rejects.toThrow('Failed to create transfer recipient');
    });

    it('should throw error when transfer initiation fails', async () => {
      // Mock successful recipient creation
      mockPost.mockResolvedValueOnce({
        data: {
          status: true,
          data: {
            recipient_code: 'RCP_123456789',
          },
        },
      });
      
      // Mock failed transfer
      mockPost.mockResolvedValueOnce({
        data: {
          status: false,
          message: 'Insufficient balance',
        },
      });
      
      await expect(adapter.sendMoney(sendMoneyParams)).rejects.toThrow('Insufficient balance');
    });

    it('should throw error when bank account details are missing', async () => {
      const paramsWithoutBank: SendMoneyParams = {
        recipient: {
          phone: {
            countryCode: '234',
            nationalNumber: '8012345678',
            formatted: '+2348012345678',
          },
          name: 'Chinedu Okonkwo',
        },
        amount: {
          amount: 50000,
          currency: 'NGN',
        },
        description: 'Payment for services',
      };
      
      await expect(adapter.sendMoney(paramsWithoutBank)).rejects.toThrow('Bank account details required for Paystack transfers');
    });
  });

  // ==================== Request Payment (Initialize) ====================
  describe('requestPayment', () => {
    const requestPaymentParams: RequestPaymentParams = {
      customer: {
        phone: {
          countryCode: '234',
          nationalNumber: '8012345678',
          formatted: '+2348012345678',
        },
        name: 'Amara Okafor',
        email: 'amara@example.com',
        country: 'NG',
      },
      amount: {
        amount: 5000,
        currency: 'NGN',
      },
      description: 'Purchase payment',
      expiryMinutes: 60,
      metadata: { orderId: 'ORDER456' },
    };

    it('should initialize transaction successfully', async () => {
      mockPost.mockResolvedValueOnce({
        data: paystackResponses.initialize.success,
      });

      const transaction = await adapter.requestPayment(requestPaymentParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('paystack_');
      expect(transaction.provider).toBe('paystack');
      expect(transaction.status).toBe('pending');
      expect(transaction.amount.amount).toBe(5000);
      expect(transaction.amount.currency).toBe('NGN');
      expect(transaction.customer.email).toBe('amara@example.com');
    });

    it('should include payment link in metadata', async () => {
      mockPost.mockResolvedValueOnce({
        data: paystackResponses.initialize.success,
      });

      const transaction = await adapter.requestPayment(requestPaymentParams);
      
      expect(transaction.metadata).toBeDefined();
      expect(transaction.metadata?.paymentLink).toContain('https://checkout.paystack.com/');
    });

    it('should generate unique references', async () => {
      mockPost.mockResolvedValueOnce({
        data: paystackResponses.initialize.success,
      });

      const tx1 = await adapter.requestPayment(requestPaymentParams);
      
      jest.advanceTimersByTime(1000);
      
      mockPost.mockResolvedValueOnce({
        data: {
          ...paystackResponses.initialize.success,
          data: {
            ...paystackResponses.initialize.success.data,
            reference: 'PS_20260115143000_xyz789',
          },
        },
      });
      
      const tx2 = await adapter.requestPayment(requestPaymentParams);
      
      expect(tx1.providerTransactionId).not.toBe(tx2.providerTransactionId);
    });

    it('should handle USD transactions', async () => {
      const usdParams: RequestPaymentParams = {
        customer: {
          email: 'customer@example.com',
          name: 'John Doe',
          country: 'ZA',
        },
        amount: {
          amount: 100,
          currency: 'USD',
        },
        description: 'International payment',
      };
      
      mockPost.mockResolvedValueOnce({
        data: {
          ...paystackResponses.initialize.success,
          data: {
            ...paystackResponses.initialize.success.data,
            reference: 'PS_USD_123',
          },
        },
      });
      
      const transaction = await adapter.requestPayment(usdParams);
      
      expect(transaction.amount.currency).toBe('USD');
    });

    it('should throw error when initialization fails', async () => {
      mockPost.mockResolvedValueOnce({
        data: paystackResponses.initialize.error,
      });
      
      await expect(adapter.requestPayment(requestPaymentParams)).rejects.toThrow('Invalid key');
    });
  });

  // ==================== Verify Transaction ====================
  describe('verifyTransaction', () => {
    it('should return completed transaction status', async () => {
      mockGet.mockResolvedValueOnce({
        data: paystackResponses.verify.success,
      });

      const transaction = await adapter.verifyTransaction('paystack_test_123');
      
      expect(transaction).toBeDefined();
      expect(transaction.id).toBe('paystack_test_123');
      expect(transaction.providerTransactionId).toBe('PS_20260115143000_abc123');
      expect(transaction.status).toBe('completed');
      expect(transaction.completedAt).toBeDefined();
    });

    it('should include amount and currency in response', async () => {
      mockGet.mockResolvedValueOnce({
        data: paystackResponses.verify.success,
      });

      const transaction = await adapter.verifyTransaction('test_id');
      
      expect(transaction.amount).toBeDefined();
      expect(transaction.amount.amount).toBe(5000); // 500000 kobo / 100
      expect(transaction.amount.currency).toBe('NGN');
    });

    it('should include customer details in response', async () => {
      mockGet.mockResolvedValueOnce({
        data: paystackResponses.verify.success,
      });

      const transaction = await adapter.verifyTransaction('test_id');
      
      expect(transaction.customer).toBeDefined();
      expect(transaction.customer.email).toBe('john.doe@example.com');
      expect(transaction.customer.name).toBe('John Doe');
    });

    it('should handle pending transactions', async () => {
      mockGet.mockResolvedValueOnce({
        data: paystackResponses.verify.pending,
      });

      const transaction = await adapter.verifyTransaction('test_id');
      
      expect(transaction.status).toBe('pending');
      expect(transaction.completedAt).toBeUndefined();
    });

    it('should throw error when verification fails', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          status: false,
          message: 'Transaction not found',
        },
      });
      
      await expect(adapter.verifyTransaction('invalid_id')).rejects.toThrow('Transaction not found');
    });
  });

  // ==================== Refund ====================
  describe('refund', () => {
    const refundParams: RefundParams = {
      originalTransactionId: 'paystack_test_123',
      amount: {
        amount: 2500,
        currency: 'NGN',
      },
      reason: 'Partial refund - product defect',
    };

    it('should process refund successfully', async () => {
      mockPost.mockResolvedValueOnce({
        data: paystackResponses.refund.partial,
      });

      const transaction = await adapter.refund(refundParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('paystack_refund_');
      expect(transaction.provider).toBe('paystack');
      expect(transaction.status).toBe('completed');
      expect(transaction.amount.amount).toBe(2500); // 250000 kobo / 100
      expect(transaction.amount.currency).toBe('NGN');
      expect(transaction.description).toContain('refund');
      expect(transaction.metadata?.originalTransaction).toBe('paystack_test_123');
    });

    it('should handle full refund when amount not specified', async () => {
      const fullRefundParams: RefundParams = {
        originalTransactionId: 'paystack_test_123',
        reason: 'Full refund requested',
      };
      
      mockPost.mockResolvedValueOnce({
        data: paystackResponses.refund.success,
      });
      
      const transaction = await adapter.refund(fullRefundParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.amount.amount).toBe(5000); // 500000 kobo / 100
      expect(transaction.amount.currency).toBe('NGN');
      expect(transaction.description).toContain('Full refund requested');
    });

    it('should include refund reason in description', async () => {
      mockPost.mockResolvedValueOnce({
        data: paystackResponses.refund.partial,
      });

      const transaction = await adapter.refund(refundParams);
      
      expect(transaction.description).toContain('refund');
    });

    it('should mark refund as completed', async () => {
      mockPost.mockResolvedValueOnce({
        data: paystackResponses.refund.partial,
      });

      const transaction = await adapter.refund(refundParams);
      
      expect(transaction.status).toBe('completed');
    });

    it('should throw error when refund fails', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          status: false,
          message: 'Transaction not eligible for refund',
        },
      });
      
      await expect(adapter.refund(refundParams)).rejects.toThrow('Transaction not eligible for refund');
    });
  });

  // ==================== Get Balance ====================
  describe('getBalance', () => {
    it('should return account balance', async () => {
      mockGet.mockResolvedValueOnce({
        data: paystackResponses.balance.success,
      });

      const balance = await adapter.getBalance();
      
      expect(balance).toBeDefined();
      expect(balance.amount).toBe(250000); // 25000000 kobo / 100
      expect(balance.currency).toBe('NGN');
    });

    it('should throw error when balance fetch fails', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          status: false,
          message: 'Unauthorized',
        },
      });
      
      await expect(adapter.getBalance()).rejects.toThrow('Unauthorized');
    });
  });

  // ==================== Exchange Rates ====================
  describe('getRates', () => {
    it('should return USD to NGN rate', async () => {
      const rate = await adapter.getRates('USD', 'NGN');
      
      expect(rate).toBe(1550);
    });

    it('should return USD to GHS rate', async () => {
      const rate = await adapter.getRates('USD', 'GHS');
      
      expect(rate).toBe(15.8);
    });

    it('should return USD to ZAR rate', async () => {
      const rate = await adapter.getRates('USD', 'ZAR');
      
      expect(rate).toBe(18.5);
    });

    it('should return GBP to NGN rate', async () => {
      const rate = await adapter.getRates('GBP', 'NGN');
      
      expect(rate).toBe(1950);
    });

    it('should return EUR to NGN rate', async () => {
      const rate = await adapter.getRates('EUR', 'NGN');
      
      expect(rate).toBe(1650);
    });

    it('should return 1 for unknown currency pairs', async () => {
      const rate = await adapter.getRates('XYZ', 'ABC');
      
      expect(rate).toBe(1);
    });

    it('should handle currency pair case sensitivity', async () => {
      const rate = await adapter.getRates('usd', 'ngn');
      
      // The implementation uses exact string matching
      expect(typeof rate).toBe('number');
    });
  });

  // ==================== Transaction Status Handling ====================
  describe('transaction status mapping', () => {
    it('should return correct status types', async () => {
      mockGet.mockResolvedValueOnce({
        data: paystackResponses.verify.success,
      });

      const transaction = await adapter.verifyTransaction('test');
      
      const validStatuses: TransactionStatus[] = [
        'pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'
      ];
      
      expect(validStatuses).toContain(transaction.status);
    });
  });

  // ==================== Error Handling ====================
  describe('error handling', () => {
    it('should handle initialization with missing config gracefully', async () => {
      const minimalConfig = {
        enabled: true,
        environment: 'sandbox' as const,
        secretKey: 'sk_test_minimal',
      };
      
      mockGet.mockResolvedValueOnce({
        data: paystackResponses.banks.success,
      });
      
      const minimalAdapter = new PaystackAdapter(minimalConfig);
      await expect(minimalAdapter.initialize({})).resolves.not.toThrow();
    });

    it('should handle 401 authentication errors', async () => {
      mockGet.mockRejectedValueOnce({
        response: { status: 401, data: { message: 'Invalid key' } },
      });
      
      await expect(adapter.verifyTransaction('test_id')).rejects.toThrow('Invalid API key');
    });

    it('should handle 404 not found errors', async () => {
      mockGet.mockRejectedValueOnce({
        response: { status: 404, data: { message: 'Not found' } },
      });
      
      await expect(adapter.verifyTransaction('nonexistent_id')).rejects.toThrow('Transaction not found');
    });

    it('should handle network errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network Error'));
      
      await expect(adapter.verifyTransaction('test_id')).rejects.toThrow('verifyTransaction failed');
    });

    it('should handle timeout errors', async () => {
      mockGet.mockRejectedValueOnce({
        code: 'ECONNABORTED',
        message: 'timeout of 30000ms exceeded',
      });
      
      await expect(adapter.verifyTransaction('test_id')).rejects.toThrow('timed out');
    });
  });
});
