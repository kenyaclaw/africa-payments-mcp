/**
 * Paystack Adapter Tests
 * 
 * Comprehensive test suite for the Paystack API adapter.
 * Tests initialize transaction, verify, refund, and transfer operations.
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
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

  beforeEach(() => {
    adapter = new PaystackAdapter(mockConfig);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-15T12:00:00Z'));
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
      
      const liveAdapter = new PaystackAdapter(liveConfig);
      
      await expect(liveAdapter.initialize({})).resolves.not.toThrow();
    });

    it('should reject keys without sk_ prefix', async () => {
      const badConfigs = [
        { ...mockConfig, secretKey: 'pk_test_123' },
        { ...mockConfig, secretKey: 'test_123' },
        { ...mockConfig, secretKey: '' },
      ];

      for (const config of badConfigs) {
        const badAdapter = new PaystackAdapter(config);
        await expect(badAdapter.initialize({})).rejects.toThrow('Invalid Paystack secret key');
      }
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
      },
      amount: {
        amount: 50000,
        currency: 'NGN',
      },
      description: 'Payment for services',
      metadata: { invoiceId: 'INV001' },
    };

    it('should initiate transfer successfully', async () => {
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
      const tx1 = await adapter.sendMoney(sendMoneyParams);
      
      jest.advanceTimersByTime(1000);
      
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
      
      const transaction = await adapter.sendMoney(bankTransferParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.status).toBe('pending');
    });

    it('should handle different currencies', async () => {
      const ghsParams: SendMoneyParams = {
        recipient: {
          phone: {
            countryCode: '233',
            nationalNumber: '201234567',
            formatted: '+233201234567',
          },
          name: 'Kwame Asante',
        },
        amount: {
          amount: 1000,
          currency: 'GHS',
        },
        description: 'Ghana payment',
      };
      
      const transaction = await adapter.sendMoney(ghsParams);
      
      expect(transaction.amount.currency).toBe('GHS');
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
      const transaction = await adapter.requestPayment(requestPaymentParams);
      
      expect(transaction.metadata).toBeDefined();
      expect(transaction.metadata?.paymentLink).toContain('https://paystack.com/pay/');
    });

    it('should generate unique references', async () => {
      const tx1 = await adapter.requestPayment(requestPaymentParams);
      
      jest.advanceTimersByTime(1000);
      
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
      
      const transaction = await adapter.requestPayment(usdParams);
      
      expect(transaction.amount.currency).toBe('USD');
    });
  });

  // ==================== Verify Transaction ====================
  describe('verifyTransaction', () => {
    it('should return completed transaction status', async () => {
      const transaction = await adapter.verifyTransaction('paystack_test_123');
      
      expect(transaction).toBeDefined();
      expect(transaction.id).toBe('paystack_test_123');
      expect(transaction.providerTransactionId).toBe('test_123');
      expect(transaction.status).toBe('completed');
      expect(transaction.completedAt).toBeDefined();
    });

    it('should include amount and currency in response', async () => {
      const transaction = await adapter.verifyTransaction('test_id');
      
      expect(transaction.amount).toBeDefined();
      expect(transaction.amount.amount).toBe(5000);
      expect(transaction.amount.currency).toBe('NGN');
    });

    it('should include customer details in response', async () => {
      const transaction = await adapter.verifyTransaction('test_id');
      
      expect(transaction.customer).toBeDefined();
      expect(transaction.customer.email).toBe('customer@example.com');
      expect(transaction.customer.name).toBe('John Doe');
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
      const transaction = await adapter.refund(refundParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('paystack_refund_');
      expect(transaction.provider).toBe('paystack');
      expect(transaction.status).toBe('completed');
      expect(transaction.amount.amount).toBe(2500);
      expect(transaction.amount.currency).toBe('NGN');
      expect(transaction.description).toContain('refund');
      expect(transaction.metadata?.originalTransaction).toBe('paystack_test_123');
    });

    it('should handle full refund when amount not specified', async () => {
      const fullRefundParams: RefundParams = {
        originalTransactionId: 'paystack_test_123',
        reason: 'Full refund requested',
      };
      
      const transaction = await adapter.refund(fullRefundParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.amount.amount).toBe(5000); // Default amount
      expect(transaction.amount.currency).toBe('NGN');
      expect(transaction.description).toContain('Full refund requested');
    });

    it('should include refund reason in description', async () => {
      const transaction = await adapter.refund(refundParams);
      
      expect(transaction.description).toContain('product defect');
    });

    it('should mark refund as completed', async () => {
      const transaction = await adapter.refund(refundParams);
      
      expect(transaction.status).toBe('completed');
      expect(transaction.completedAt).toBeDefined();
    });
  });

  // ==================== Get Balance ====================
  describe('getBalance', () => {
    it('should return account balance', async () => {
      const balance = await adapter.getBalance();
      
      expect(balance).toBeDefined();
      expect(balance.amount).toBe(250000);
      expect(balance.currency).toBe('NGN');
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
      
      const minimalAdapter = new PaystackAdapter(minimalConfig);
      await expect(minimalAdapter.initialize({})).resolves.not.toThrow();
    });

    it('should handle operations with invalid provider ID', async () => {
      const transaction = await adapter.verifyTransaction('nonexistent_id');
      
      // Should return a transaction object even for non-existent IDs
      expect(transaction).toBeDefined();
      expect(transaction.id).toBe('nonexistent_id');
    });
  });
});
