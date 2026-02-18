/**
 * IntaSend Adapter Tests
 * 
 * Test suite for the IntaSend API adapter.
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
import { IntaSendAdapter } from '../../src/adapters/intasend/index.js';
import { 
  IntaSendConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams 
} from '../../src/types/index.js';

// Mock config for testing
const mockConfig: IntaSendConfig = {
  enabled: true,
  environment: 'sandbox',
  publishableKey: 'pk_test_intasend_123',
  secretKey: 'sk_test_intasend_456',
  serviceProvider: 'M-PESA',
};

describe('IntaSendAdapter', () => {
  let adapter: IntaSendAdapter;
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
    
    adapter = new IntaSendAdapter(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('intasend');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('IntaSend');
    });

    it('should support Kenya and Nigeria', () => {
      expect(adapter.countries).toContain('KE');
      expect(adapter.countries).toContain('NG');
    });

    it('should support KES and NGN', () => {
      expect(adapter.currencies).toContain('KES');
      expect(adapter.currencies).toContain('NGN');
    });

    it('should support multiple payment methods', () => {
      expect(adapter.supportedMethods).toContain('mobile_money');
      expect(adapter.supportedMethods).toContain('card');
      expect(adapter.supportedMethods).toContain('bank_transfer');
    });

    it('should have config accessible', () => {
      expect(adapter.config).toEqual(mockConfig);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      // Mock wallet API call for credential verification
      mockGet.mockResolvedValueOnce({
        data: [
          {
            id: 'wallet_123',
            currency: 'KES',
            available_balance: 100000,
            current_balance: 100000,
          },
        ],
      });

      await expect(adapter.initialize({})).resolves.not.toThrow();
    });

    it('should throw error on authentication failure', async () => {
      // Mock 401 authentication error
      mockGet.mockRejectedValueOnce({
        response: {
          status: 401,
          data: { detail: 'Invalid credentials' },
        },
      });

      await expect(adapter.initialize({})).rejects.toThrow('Invalid IntaSend API credentials');
    });
  });

  describe('sendMoney', () => {
    const sendMoneyParams: SendMoneyParams = {
      recipient: {
        phone: {
          countryCode: '254',
          nationalNumber: '712345678',
          formatted: '+254712345678',
        },
        name: 'John Doe',
      },
      amount: {
        amount: 5000,
        currency: 'KES',
      },
      description: 'Test payout',
    };

    it('should initiate payout successfully', async () => {
      // Mock send money API call
      mockPost.mockResolvedValueOnce({
        data: {
          id: 'payout_12345',
          status: 'PENDING',
          amount: 5000,
          currency: 'KES',
          reference: 'IS_PAYOUT_123456',
          created_at: '2026-01-15T12:00:00Z',
          updated_at: '2026-01-15T12:00:00Z',
        },
      });

      const transaction = await adapter.sendMoney(sendMoneyParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('intasend_payout_');
      expect(transaction.provider).toBe('intasend');
      expect(transaction.status).toBe('pending');
      expect(transaction.amount.amount).toBe(5000);
      expect(transaction.amount.currency).toBe('KES');
      expect(transaction.providerTransactionId).toBe('payout_12345');
    });

    it('should generate unique transaction IDs', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          id: 'payout_111',
          status: 'PENDING',
          amount: 5000,
          currency: 'KES',
          reference: 'IS_PAYOUT_111',
          created_at: '2026-01-15T12:00:00Z',
          updated_at: '2026-01-15T12:00:00Z',
        },
      });

      const tx1 = await adapter.sendMoney(sendMoneyParams);
      
      jest.advanceTimersByTime(1000);
      
      mockPost.mockResolvedValueOnce({
        data: {
          id: 'payout_222',
          status: 'PENDING',
          amount: 5000,
          currency: 'KES',
          reference: 'IS_PAYOUT_222',
          created_at: '2026-01-15T12:00:01Z',
          updated_at: '2026-01-15T12:00:01Z',
        },
      });

      const tx2 = await adapter.sendMoney(sendMoneyParams);

      expect(tx1.id).not.toBe(tx2.id);
    });

    it('should handle bank transfer payouts', async () => {
      const bankTransferParams: SendMoneyParams = {
        recipient: {
          name: 'John Doe',
          bankAccount: {
            accountNumber: '1234567890',
            bankCode: 'KCB',
            accountName: 'John Doe',
          },
        },
        amount: {
          amount: 10000,
          currency: 'KES',
        },
        description: 'Bank payout',
      };

      mockPost.mockResolvedValueOnce({
        data: {
          id: 'payout_bank_123',
          status: 'PROCESSING',
          amount: 10000,
          currency: 'KES',
          reference: 'IS_PAYOUT_BANK_123',
          created_at: '2026-01-15T12:00:00Z',
          updated_at: '2026-01-15T12:00:00Z',
        },
      });

      const transaction = await adapter.sendMoney(bankTransferParams);

      expect(transaction).toBeDefined();
      expect(transaction.status).toBe('processing');
      expect(transaction.amount.amount).toBe(10000);
    });

    it('should throw error when recipient has no phone or bank account', async () => {
      const invalidParams: SendMoneyParams = {
        recipient: {
          name: 'John Doe',
          // No phone or bank account
        },
        amount: {
          amount: 5000,
          currency: 'KES',
        },
      };

      await expect(adapter.sendMoney(invalidParams)).rejects.toThrow('Phone number or bank account required');
    });
  });

  describe('requestPayment', () => {
    const requestPaymentParams: RequestPaymentParams = {
      customer: {
        phone: {
          countryCode: '254',
          nationalNumber: '712345678',
          formatted: '+254712345678',
        },
        name: 'Jane Doe',
        email: 'jane@example.com',
      },
      amount: {
        amount: 3000,
        currency: 'KES',
      },
      description: 'Test collection',
    };

    it('should initiate collection successfully', async () => {
      // Mock checkout API call
      mockPost.mockResolvedValueOnce({
        data: {
          id: 'checkout_12345',
          url: 'https://payment.intasend.com/checkout/checkout_12345',
          signature: 'sig_abc123',
        },
      });

      const transaction = await adapter.requestPayment(requestPaymentParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('intasend_');
      expect(transaction.provider).toBe('intasend');
      expect(transaction.status).toBe('pending');
      expect(transaction.metadata?.checkoutUrl).toContain('intasend');
      expect(transaction.providerTransactionId).toBe('checkout_12345');
    });
  });

  describe('verifyTransaction', () => {
    it('should return transaction status for completed transaction', async () => {
      // Mock transaction status API call
      mockGet.mockResolvedValueOnce({
        data: {
          id: 'test_123',
          invoice_id: 'inv_123',
          status: 'COMPLETE',
          amount: 5000,
          currency: 'KES',
          provider: 'M-PESA',
          account: '254712345678',
          reference: 'REF123',
          created_at: '2026-01-15T12:00:00Z',
          updated_at: '2026-01-15T12:05:00Z',
        },
      });

      const transaction = await adapter.verifyTransaction('intasend_test_123');

      expect(transaction).toBeDefined();
      expect(transaction.status).toBe('completed');
      expect(transaction.completedAt).toBeDefined();
      expect(transaction.providerTransactionId).toBe('test_123');
    });

    it('should return transaction status for pending transaction', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          id: 'test_456',
          invoice_id: 'inv_456',
          status: 'PENDING',
          amount: 3000,
          currency: 'KES',
          provider: 'M-PESA',
          account: '254712345678',
          reference: 'REF456',
          created_at: '2026-01-15T12:00:00Z',
          updated_at: '2026-01-15T12:00:00Z',
        },
      });

      const transaction = await adapter.verifyTransaction('intasend_test_456');

      expect(transaction).toBeDefined();
      expect(transaction.status).toBe('pending');
      expect(transaction.completedAt).toBeUndefined();
    });

    it('should return transaction status for failed transaction', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          id: 'test_789',
          invoice_id: 'inv_789',
          status: 'FAILED',
          amount: 2000,
          currency: 'KES',
          provider: 'M-PESA',
          account: '254712345678',
          reference: 'REF789',
          created_at: '2026-01-15T12:00:00Z',
          updated_at: '2026-01-15T12:01:00Z',
        },
      });

      const transaction = await adapter.verifyTransaction('intasend_test_789');

      expect(transaction).toBeDefined();
      expect(transaction.status).toBe('failed');
    });
  });

  describe('refund', () => {
    it('should process refund successfully', async () => {
      const refundParams: RefundParams = {
        originalTransactionId: 'intasend_test_123',
        reason: 'Customer request',
      };

      // Mock refund API call
      mockPost.mockResolvedValueOnce({
        data: {
          id: 'refund_12345',
          status: 'COMPLETE',
          amount: 5000,
          currency: 'KES',
          reference: 'REFUND_123',
          created_at: '2026-01-15T12:00:00Z',
        },
      });

      const transaction = await adapter.refund(refundParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('intasend_refund_');
      expect(transaction.status).toBe('completed');
      expect(transaction.providerTransactionId).toBe('refund_12345');
    });

    it('should process partial refund with amount', async () => {
      const refundParams: RefundParams = {
        originalTransactionId: 'intasend_test_123',
        amount: {
          amount: 2500,
          currency: 'KES',
        },
        reason: 'Partial refund',
      };

      mockPost.mockResolvedValueOnce({
        data: {
          id: 'refund_67890',
          status: 'PENDING',
          amount: 2500,
          currency: 'KES',
          reference: 'REFUND_678',
          created_at: '2026-01-15T12:00:00Z',
        },
      });

      const transaction = await adapter.refund(refundParams);

      expect(transaction).toBeDefined();
      expect(transaction.amount.amount).toBe(2500);
    });
  });

  describe('getBalance', () => {
    it('should return balance', async () => {
      // Mock wallet API call
      mockGet.mockResolvedValueOnce({
        data: [
          {
            id: 'wallet_123',
            currency: 'KES',
            available_balance: 100000,
            current_balance: 100000,
          },
        ],
      });

      const balance = await adapter.getBalance();

      expect(balance).toBeDefined();
      expect(balance.amount).toBe(100000);
      expect(balance.currency).toBe('KES');
    });

    it('should throw error when no wallets found', async () => {
      mockGet.mockResolvedValueOnce({
        data: [],
      });

      await expect(adapter.getBalance()).rejects.toThrow('No wallets found');
    });
  });

  describe('validatePhone', () => {
    it('should validate correct Kenyan phone numbers', async () => {
      const validNumbers = [
        '254712345678',
        '254112345678',
      ];

      for (const number of validNumbers) {
        const result = await adapter.validatePhone(number);
        expect(result).toBe(true);
      }
    });

    it('should validate correct Nigerian phone numbers', async () => {
      const validNumbers = [
        '2348012345678',
      ];

      for (const number of validNumbers) {
        const result = await adapter.validatePhone(number);
        expect(result).toBe(true);
      }
    });

    it('should reject invalid phone numbers', async () => {
      const invalidNumbers = [
        '123456',
        'abc123',
        '',
        '999999999999',
      ];

      for (const number of invalidNumbers) {
        const result = await adapter.validatePhone(number);
        expect(result).toBe(false);
      }
    });
  });
});
