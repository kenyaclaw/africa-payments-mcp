/**
 * M-Pesa Adapter Tests
 * 
 * Comprehensive test suite for the M-Pesa Daraja API adapter.
 * Tests authentication, STK push, B2C transfers, transaction status, and refunds.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock axios
const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      get: mockGet,
      post: mockPost,
      interceptors: {
        request: { use: jest.fn(), eject: jest.fn() },
        response: { use: jest.fn(), eject: jest.fn() },
      },
    })),
  },
}));

// Import after mocking
import { MpesaAdapter } from '../../src/adapters/mpesa/index.js';
import { 
  MpesaConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams,
  TransactionStatus 
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

  beforeEach(() => {
    adapter = new MpesaAdapter(mockConfig);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-15T12:00:00Z'));
    mockGet.mockReset();
    mockPost.mockReset();
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
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          expires_in: '3600',
        },
      }).mockResolvedValueOnce({
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
      mockPost.mockResolvedValueOnce({
        data: { access_token: 'mock_token', expires_in: '3600' },
      }).mockResolvedValueOnce({
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
        },
      };
      
      const transaction = await adapter.sendMoney(paramsWithoutName);
      
      expect(transaction).toBeDefined();
      expect(transaction.customer.name).toBeUndefined();
    });
  });

  // ==================== Request Payment (STK Push) ====================
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
        country: 'KE',
      },
      amount: {
        amount: 500,
        currency: 'KES',
      },
      description: 'Test collection',
      expiryMinutes: 30,
      metadata: { invoiceId: 'INV001' },
    };

    it('should initiate STK push successfully', async () => {
      mockPost.mockResolvedValueOnce({
        data: { access_token: 'mock_token', expires_in: '3600' },
      }).mockResolvedValueOnce({
        data: {
          MerchantRequestID: 'test-merchant-id',
          CheckoutRequestID: 'ws_CO_123',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });

      const transaction = await adapter.requestPayment(requestPaymentParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('mpesa');
      expect(transaction.status).toBe('pending');
      expect(transaction.amount.amount).toBe(500);
      expect(transaction.amount.currency).toBe('KES');
    });
  });

  // ==================== Verify Transaction ====================
  describe('verifyTransaction', () => {
    it('should return transaction status', async () => {
      mockPost.mockResolvedValueOnce({
        data: { access_token: 'mock_token', expires_in: '3600' },
      }).mockResolvedValueOnce({
        data: {
          ResultCode: '0',
          ResponseCode: '0',
          ResultDesc: 'Success',
          TransactionID: 'TEST123',
          Amount: '1000',
        },
      });

      const transaction = await adapter.verifyTransaction('mpesa_test_123');
      
      expect(transaction).toBeDefined();
      expect(transaction.id).toBe('mpesa_test_123');
    });
  });

  // ==================== Refund/Reversal ====================
  describe('refund', () => {
    const refundParams: RefundParams = {
      originalTransactionId: 'mpesa_test_123',
      amount: {
        amount: 500,
        currency: 'KES',
      },
      reason: 'Customer request',
    };

    it('should process refund successfully', async () => {
      mockPost.mockResolvedValueOnce({
        data: { access_token: 'mock_token', expires_in: '3600' },
      }).mockResolvedValueOnce({
        data: {
          ResponseCode: '0',
          ResponseDescription: 'Success',
          ConversationID: 'AG_REV_123',
        },
      });

      const transaction = await adapter.refund(refundParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('mpesa');
    });
  });

  // ==================== Phone Validation ====================
  describe('validatePhone', () => {
    it('should validate correct Kenyan phone numbers', async () => {
      const validPhones = [
        '+254712345678',
        '254712345678',
        '+254 712 345 678',
      ];

      for (const phone of validPhones) {
        const isValid = await adapter.validatePhone(phone);
        expect(isValid).toBe(true);
      }
    });

    it('should reject invalid phone numbers', async () => {
      const invalidPhones = [
        '0712345678', // Missing country code
        '+123456789', // Wrong country code
        '254123',     // Too short
        '',           // Empty
        'invalid',    // Not a number
      ];

      for (const phone of invalidPhones) {
        const isValid = await adapter.validatePhone(phone);
        expect(isValid).toBe(false);
      }
    });
  });
});
