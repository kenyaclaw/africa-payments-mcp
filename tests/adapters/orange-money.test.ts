/**
 * Orange Money Adapter Tests
 * 
 * Comprehensive test suite for the Orange Money API adapter.
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
import { OrangeMoneyAdapter } from '../../src/adapters/orange-money/index.js';
import { 
  OrangeMoneyConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams,
} from '../../src/types/index.js';

// Mock config for testing
const mockConfig: OrangeMoneyConfig = {
  enabled: true,
  environment: 'sandbox',
  clientId: 'test_client_id',
  clientSecret: 'test_client_secret',
  merchantId: 'test_merchant_id',
};

describe('OrangeMoneyAdapter', () => {
  let adapter: OrangeMoneyAdapter;
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
    
    adapter = new OrangeMoneyAdapter(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==================== Adapter Properties ====================
  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('orange_money');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('Orange Money');
    });

    it('should support correct countries', () => {
      expect(adapter.countries).toContain('CI');
      expect(adapter.countries).toContain('SN');
      expect(adapter.countries).toContain('ML');
      expect(adapter.countries).toContain('BF');
    });

    it('should support correct currencies', () => {
      expect(adapter.currencies).toContain('XOF');
      expect(adapter.currencies).toContain('XAF');
    });

    it('should support mobile money', () => {
      expect(adapter.supportedMethods).toContain('mobile_money');
    });

    it('should have config accessible', () => {
      expect(adapter.config).toEqual(mockConfig);
    });
  });

  // ==================== Send Money (Transfer) ====================
  describe('sendMoney', () => {
    const sendMoneyParams: SendMoneyParams = {
      recipient: {
        phone: {
          countryCode: '225',
          nationalNumber: '712345678',
          formatted: '+225712345678',
        },
        name: 'Amadou Diallo',
      },
      amount: {
        amount: 5000,
        currency: 'XOF',
      },
      description: 'Test transfer',
      metadata: { orderId: 'ORDER123' },
    };

    it('should initiate transfer successfully', async () => {
      // Mock authentication (POST request)
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });
      
      // Mock transfer (POST request)
      mockPost.mockResolvedValueOnce({
        data: {
          transactionId: 'OM_TRX_123456',
          status: 'PENDING',
          message: 'Transfer initiated',
        },
      });

      const transaction = await adapter.sendMoney(sendMoneyParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('orange_money');
      expect(transaction.status).toBe('pending');
      expect(transaction.amount.amount).toBe(5000);
      expect(transaction.amount.currency).toBe('XOF');
    });

    it('should handle missing recipient phone', async () => {
      const paramsWithoutPhone: SendMoneyParams = {
        ...sendMoneyParams,
        recipient: {
          name: 'Test User',
          // phone intentionally omitted
        },
      };

      await expect(adapter.sendMoney(paramsWithoutPhone)).rejects.toThrow('Phone number is required');
    });

    it('should format phone numbers correctly', async () => {
      // Mock authentication
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });

      // Mock transfer
      mockPost.mockResolvedValueOnce({
        data: {
          transactionId: 'OM_TRX_123456',
          status: 'SUCCESS',
          message: 'Transfer successful',
        },
      });

      const paramsWithLocalPhone: SendMoneyParams = {
        ...sendMoneyParams,
        recipient: {
          phone: {
            countryCode: '225',
            nationalNumber: '712345678',
            formatted: '0712345678', // Local format
          },
          name: 'Test User',
        },
      };

      const transaction = await adapter.sendMoney(paramsWithLocalPhone);
      expect(transaction).toBeDefined();
    });
  });

  // ==================== Request Payment ====================
  describe('requestPayment', () => {
    const requestParams: RequestPaymentParams = {
      customer: {
        phone: {
          countryCode: '221',
          nationalNumber: '701234567',
          formatted: '+221701234567',
        },
        country: 'SN',
      },
      amount: {
        amount: 10000,
        currency: 'XOF',
      },
      description: 'Payment for services',
      metadata: { invoiceNumber: 'INV123' },
    };

    it('should initiate payment request successfully', async () => {
      // Mock authentication
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });
      
      // Mock payment request
      mockPost.mockResolvedValueOnce({
        data: {
          paymentToken: 'PAY_TOKEN_123',
          status: 'PENDING',
          paymentUrl: 'https://payment.orange.com/PAY_TOKEN_123',
          message: 'Payment request created',
        },
      });

      const transaction = await adapter.requestPayment(requestParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('orange_money');
      expect(transaction.status).toBe('pending');
      expect(transaction.providerTransactionId).toBe('PAY_TOKEN_123');
      expect(transaction.metadata?.paymentUrl).toBe('https://payment.orange.com/PAY_TOKEN_123');
    });

    it('should handle missing customer phone', async () => {
      const paramsWithoutPhone: RequestPaymentParams = {
        ...requestParams,
        customer: {
          name: 'Test Customer',
          // phone intentionally omitted
        },
      };

      await expect(adapter.requestPayment(paramsWithoutPhone)).rejects.toThrow('Phone number is required');
    });
  });

  // ==================== Verify Transaction ====================
  describe('verifyTransaction', () => {
    it('should return transaction status', async () => {
      // Mock authentication
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });
      
      // Mock transaction status
      mockGet.mockResolvedValueOnce({
        data: {
          status: 'SUCCESS',
          message: 'Transaction completed',
          transactionId: 'OM_TRX_123456',
          amount: '5000',
          currency: 'XOF',
          receiver: {
            number: '225712345678',
            name: 'Amadou Diallo',
          },
          createdAt: '2026-01-15T12:00:00Z',
          updatedAt: '2026-01-15T12:01:00Z',
        },
      });

      const status = await adapter.verifyTransaction('orange_OM_TRX_123456');
      
      expect(status).toBeDefined();
      expect(status.providerTransactionId).toBe('OM_TRX_123456');
      expect(status.status).toBe('completed');
      expect(status.amount.amount).toBe(5000);
    });

    it('should handle pending transactions', async () => {
      // Mock authentication
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });
      
      // Mock transaction status
      mockGet.mockResolvedValueOnce({
        data: {
          status: 'PENDING',
          message: 'Transaction in progress',
          transactionId: 'OM_TRX_789',
          amount: '10000',
          currency: 'XOF',
        },
      });

      const status = await adapter.verifyTransaction('orange_OM_TRX_789');
      
      expect(status).toBeDefined();
      expect(status.status).toBe('pending');
    });
  });

  // ==================== Refund ====================
  describe('refund', () => {
    const refundParams: RefundParams = {
      originalTransactionId: 'ORIG123',
      amount: {
        amount: 5000,
        currency: 'XOF',
      },
      reason: 'Customer request',
    };

    it('should process refund successfully', async () => {
      // Mock authentication
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });
      
      // Mock refund
      mockPost.mockResolvedValueOnce({
        data: {
          transactionId: 'REFUND_001',
          status: 'SUCCESS',
          message: 'Refund processed',
        },
      });

      const result = await adapter.refund(refundParams);
      
      expect(result).toBeDefined();
      expect(result.provider).toBe('orange_money');
      expect(result.status).toBe('completed');
    });
  });

  // ==================== Get Balance ====================
  describe('getBalance', () => {
    it('should return balance', async () => {
      // Mock authentication
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });
      
      // Mock balance
      mockGet.mockResolvedValueOnce({
        data: {
          balances: [
            {
              account: 'PRIMARY',
              balance: '150000.00',
              currency: 'XOF',
            },
          ],
        },
      });

      const balance = await adapter.getBalance();
      
      expect(balance).toBeDefined();
      expect(balance.amount).toBe(150000);
      expect(balance.currency).toBe('XOF');
    });
  });

  // ==================== Phone Validation ====================
  describe('validatePhone', () => {
    it('should validate correct Orange Money phone numbers', async () => {
      const validNumbers = [
        '225712345678',  // Ivory Coast
        '221701234567',  // Senegal
        '22371234567',   // Mali
        '22670123456',   // Burkina Faso
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
        '254712345678', // Kenya (not Orange Money)
      ];

      for (const number of invalidNumbers) {
        const result = await adapter.validatePhone(number);
        expect(result).toBe(false);
      }
    });
  });
});
