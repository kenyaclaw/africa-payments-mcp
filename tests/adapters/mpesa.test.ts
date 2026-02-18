/**
 * M-Pesa Adapter Tests
 * 
 * Comprehensive test suite for the M-Pesa Daraja API adapter.
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
import { MpesaAdapter } from '../../src/adapters/mpesa/index.js';
import { 
  MpesaConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams,
} from '../../src/types/index.js';

// Mock config for testing
const mockConfig: MpesaConfig = {
  enabled: true,
  environment: 'sandbox',
  consumerKey: 'test_consumer_key',
  consumerSecret: 'test_consumer_secret',
  passkey: 'test_passkey',
  shortCode: '123456',
  initiatorName: 'test_initiator',
  initiatorPassword: 'test_password',
  securityCredential: 'test_credential',
};

describe('MpesaAdapter', () => {
  let adapter: MpesaAdapter;
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
    
    adapter = new MpesaAdapter(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==================== Adapter Properties ====================
  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('mpesa');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('M-Pesa');
    });

    it('should support correct countries', () => {
      expect(adapter.countries).toContain('KE');
      expect(adapter.countries).toContain('TZ');
    });

    it('should support correct currencies', () => {
      expect(adapter.currencies).toContain('KES');
      expect(adapter.currencies).toContain('TZS');
    });

    it('should support mobile money', () => {
      expect(adapter.supportedMethods).toContain('mobile_money');
    });

    it('should have config accessible', () => {
      expect(adapter.config).toEqual(mockConfig);
    });
  });

  // ==================== Send Money (B2C) ====================
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
        amount: 1000,
        currency: 'KES',
      },
      description: 'Test payment',
      metadata: { orderId: 'ORDER123' },
    };

    it('should initiate B2C transfer successfully', async () => {
      // Mock authentication (GET request)
      mockGet.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          expires_in: '3600',
        },
      });
      
      // Mock B2C transfer (POST request)
      mockPost.mockResolvedValueOnce({
        data: {
          ConversationID: 'AG_20240115_123456',
          OriginatorConversationID: 'test-123',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });

      const transaction = await adapter.sendMoney(sendMoneyParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('mpesa');
      expect(transaction.status).toBe('pending');
      expect(transaction.amount.amount).toBe(1000);
      expect(transaction.amount.currency).toBe('KES');
    });

    it('should handle missing recipient name', async () => {
      // Mock authentication (GET request)
      mockGet.mockResolvedValueOnce({
        data: { access_token: 'mock_token', expires_in: '3600' },
      });
      
      // Mock B2C transfer (POST request)
      mockPost.mockResolvedValueOnce({
        data: {
          ConversationID: 'AG_20240115_123456',
          OriginatorConversationID: 'test-123',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });

      const paramsWithoutName: SendMoneyParams = {
        ...sendMoneyParams,
        recipient: {
          phone: sendMoneyParams.recipient.phone,
          // name intentionally omitted
        },
      };

      const transaction = await adapter.sendMoney(paramsWithoutName);
      expect(transaction).toBeDefined();
      // When name is missing, customer name should be undefined or empty
      expect(transaction.customer).toBeDefined();
    });
  });

  // ==================== Request Payment (STK Push) ====================
  describe('requestPayment', () => {
    const requestParams: RequestPaymentParams = {
      customer: {
        phone: {
          countryCode: '254',
          nationalNumber: '712345678',
          formatted: '+254712345678',
        },
      },
      amount: {
        amount: 500,
        currency: 'KES',
      },
      description: 'Payment for services',
      metadata: { accountNumber: 'ACC123' },
    };

    it('should initiate STK push successfully', async () => {
      // Mock authentication (GET request)
      mockGet.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          expires_in: '3600',
        },
      });
      
      // Mock STK push (POST request)
      mockPost.mockResolvedValueOnce({
        data: {
          MerchantRequestID: 'MERCH123',
          CheckoutRequestID: 'CHECK456',
          ResponseCode: '0',
          ResponseDescription: 'Success',
          CustomerMessage: 'Success. Request accepted for processing',
        },
      });

      const transaction = await adapter.requestPayment(requestParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('mpesa');
      expect(transaction.status).toBe('pending');
      expect(transaction.providerTransactionId).toBe('CHECK456');
    });
  });

  // ==================== Verify Transaction ====================
  describe('verifyTransaction', () => {
    it('should return transaction status', async () => {
      // Mock authentication (GET request)
      mockGet.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          expires_in: '3600',
        },
      });
      
      // Mock transaction status (POST request)
      mockPost.mockResolvedValueOnce({
        data: {
          ResultCode: '0',
          ResultDesc: 'The service request is processed successfully.',
          TransactionID: 'TEST123',
          Amount: '1000',
        },
      });

      const status = await adapter.verifyTransaction('TEST123');
      
      expect(status).toBeDefined();
      expect(status.providerTransactionId).toBe('TEST123');
      expect(status.status).toBe('completed');
    });
  });

  // ==================== Refund ====================
  describe('refund', () => {
    const refundParams: RefundParams = {
      originalTransactionId: 'ORIG123',
      amount: {
        amount: 1000,
        currency: 'KES',
      },
      reason: 'Customer request',
    };

    it('should process refund successfully', async () => {
      // Mock authentication (GET request)
      mockGet.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          expires_in: '3600',
        },
      });
      
      // Mock refund (POST request)
      mockPost.mockResolvedValueOnce({
        data: {
          ConversationID: 'REFUND001',
          OriginatorConversationID: 'test-refund',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });

      const result = await adapter.refund(refundParams);
      
      expect(result).toBeDefined();
      expect(result.provider).toBe('mpesa');
      expect(result.status).toBeDefined();
    });
  });

  // ==================== Phone Validation ====================
  describe('validatePhone', () => {
    it('should validate correct Kenyan phone numbers', async () => {
      // The adapter validates after normalization to 254XXXXXXXXX format
      const validNumbers = [
        '254712345678',
        '254112345678',
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
        '999999999999', // Invalid format
      ];

      for (const number of invalidNumbers) {
        const result = await adapter.validatePhone(number);
        expect(result).toBe(false);
      }
    });
  });
});
