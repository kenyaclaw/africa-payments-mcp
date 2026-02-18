/**
 * Wave Adapter Tests
 * 
 * Comprehensive test suite for the Wave API adapter.
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
import { WaveAdapter } from '../../src/adapters/wave/index.js';
import { 
  WaveConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams,
} from '../../src/types/index.js';

// Mock config for testing
const mockConfig: WaveConfig = {
  enabled: true,
  environment: 'sandbox',
  apiKey: 'test_api_key',
  apiSecret: 'test_api_secret',
  merchantId: 'test_merchant_id',
};

describe('WaveAdapter', () => {
  let adapter: WaveAdapter;
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
    
    adapter = new WaveAdapter(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==================== Adapter Properties ====================
  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('wave');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('Wave');
    });

    it('should support correct countries', () => {
      expect(adapter.countries).toContain('SN');
      expect(adapter.countries).toContain('CI');
      expect(adapter.countries).toContain('BF');
      expect(adapter.countries).toContain('ML');
      expect(adapter.countries).toContain('UG');
    });

    it('should support correct currencies', () => {
      expect(adapter.currencies).toContain('XOF');
      expect(adapter.currencies).toContain('XAF');
      expect(adapter.currencies).toContain('UGX');
    });

    it('should support multiple payment methods', () => {
      expect(adapter.supportedMethods).toContain('mobile_money');
      expect(adapter.supportedMethods).toContain('qr_code');
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
          countryCode: '221',
          nationalNumber: '701234567',
          formatted: '+221701234567',
        },
        name: 'Moussa Diop',
      },
      amount: {
        amount: 10000,
        currency: 'XOF',
      },
      description: 'Test transfer',
      metadata: { orderId: 'ORDER123' },
    };

    it('should initiate transfer successfully', async () => {
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
          id: 'wave_trf_123456',
          status: 'succeeded',
          amount: 10000,
          currency: 'XOF',
          recipientPhone: '221701234567',
          recipientName: 'Moussa Diop',
          clientReference: 'WAVE_TRF_1234567890',
          description: 'Test transfer',
          createdAt: '2026-01-15T12:00:00Z',
          updatedAt: '2026-01-15T12:00:00Z',
          completedAt: '2026-01-15T12:00:00Z',
        },
      });

      const transaction = await adapter.sendMoney(sendMoneyParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('wave');
      expect(transaction.status).toBe('completed');
      expect(transaction.amount.amount).toBe(10000);
      expect(transaction.amount.currency).toBe('XOF');
    });

    it('should handle missing recipient phone', async () => {
      // Mock authentication first
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });

      const paramsWithoutPhone: SendMoneyParams = {
        ...sendMoneyParams,
        recipient: {
          name: 'Test User',
          // phone intentionally omitted
        },
      };

      await expect(adapter.sendMoney(paramsWithoutPhone)).rejects.toThrow('Phone number is required');
    });
  });

  // ==================== Request Payment ====================
  describe('requestPayment', () => {
    const requestParams: RequestPaymentParams = {
      customer: {
        phone: {
          countryCode: '225',
          nationalNumber: '712345678',
          formatted: '+225712345678',
        },
        name: 'Kofi Annan',
        country: 'CI',
      },
      amount: {
        amount: 15000,
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
          id: 'wave_pay_123456',
          amount: 15000,
          currency: 'XOF',
          status: 'pending',
          qrCode: 'WAVE_QR_DATA_123',
          paymentUrl: 'https://pay.wave.com/PAY123',
          clientReference: 'WAVE_PAY_1234567890',
          expiryTime: '2026-01-15T12:30:00Z',
          createdAt: '2026-01-15T12:00:00Z',
          updatedAt: '2026-01-15T12:00:00Z',
        },
      });

      const transaction = await adapter.requestPayment(requestParams);
      
      expect(transaction).toBeDefined();
      expect(transaction.provider).toBe('wave');
      expect(transaction.status).toBe('pending');
      expect(transaction.providerTransactionId).toBe('wave_pay_123456');
      expect(transaction.metadata?.qrCode).toBe('WAVE_QR_DATA_123');
      expect(transaction.metadata?.paymentUrl).toBe('https://pay.wave.com/PAY123');
    });

    it('should create payment request without customer phone', async () => {
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
          id: 'wave_pay_789',
          amount: 15000,
          currency: 'XOF',
          status: 'pending',
          clientReference: 'WAVE_PAY_789',
          expiryTime: '2026-01-15T12:30:00Z',
          createdAt: '2026-01-15T12:00:00Z',
          updatedAt: '2026-01-15T12:00:00Z',
        },
      });

      const paramsWithoutPhone = {
        ...requestParams,
        customer: {
          name: 'Test Customer',
        },
      };

      const transaction = await adapter.requestPayment(paramsWithoutPhone);
      
      expect(transaction).toBeDefined();
      expect(transaction.status).toBe('pending');
    });
  });

  // ==================== QR Code Generation ====================
  describe('generateQRCode', () => {
    it('should generate QR code successfully', async () => {
      // Mock authentication
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });
      
      // Mock QR code generation
      mockPost.mockResolvedValueOnce({
        data: {
          qrCodeData: 'WAVE_QR_CODE_DATA_123',
          qrCodeImageUrl: 'https://api.wave.com/qr/123.png',
          paymentId: 'wave_qr_123',
          expiryTime: '2026-01-15T12:30:00Z',
        },
      });

      const result = await adapter.generateQRCode(
        { amount: 5000, currency: 'XOF' },
        'QR Payment Test',
        30
      );
      
      expect(result).toBeDefined();
      expect(result.qrCodeData).toBe('WAVE_QR_CODE_DATA_123');
      expect(result.qrCodeImageUrl).toBe('https://api.wave.com/qr/123.png');
      expect(result.paymentId).toBe('wave_qr_123');
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
          id: 'wave_trf_123',
          type: 'transfer',
          status: 'succeeded',
          amount: 10000,
          currency: 'XOF',
          fee: 100,
          tax: 0,
          totalAmount: 10100,
          recipient: {
            phone: '221701234567',
            name: 'Moussa Diop',
          },
          clientReference: 'WAVE_TRF_123',
          description: 'Test transfer',
          createdAt: '2026-01-15T12:00:00Z',
          updatedAt: '2026-01-15T12:00:00Z',
          completedAt: '2026-01-15T12:00:00Z',
        },
      });

      const status = await adapter.verifyTransaction('wave_trf_123');
      
      expect(status).toBeDefined();
      expect(status.providerTransactionId).toBe('wave_trf_123');
      expect(status.status).toBe('completed');
      expect(status.amount.amount).toBe(10000);
      expect(status.metadata?.fee).toBe(100);
    });
  });

  // ==================== Refund ====================
  describe('refund', () => {
    const refundParams: RefundParams = {
      originalTransactionId: 'ORIG123',
      amount: {
        amount: 10000,
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
      
      // Mock refund - Wave returns 'succeeded' status
      mockPost.mockResolvedValueOnce({
        data: {
          id: 'wave_ref_001',
          status: 'succeeded',
          amount: 10000,
          currency: 'XOF',
          recipientPhone: '221701234567',
          createdAt: '2026-01-15T12:00:00Z',
          updatedAt: '2026-01-15T12:00:00Z',
          completedAt: '2026-01-15T12:00:00Z',
        },
      });

      const result = await adapter.refund(refundParams);
      
      expect(result).toBeDefined();
      expect(result.provider).toBe('wave');
      // Wave adapter maps 'succeeded' to 'refunded' for refunds
      expect(result.status).toBe('refunded');
      expect(result.amount.amount).toBe(10000);
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
          balance: 250000,
          currency: 'XOF',
          pendingBalance: 5000,
          availableBalance: 245000,
        },
      });

      const balance = await adapter.getBalance();
      
      expect(balance).toBeDefined();
      expect(balance.amount).toBe(245000);
      expect(balance.currency).toBe('XOF');
    });
  });

  // ==================== Phone Validation ====================
  describe('validatePhone', () => {
    it('should validate correct Wave phone numbers', async () => {
      const validNumbers = [
        '221701234567', // Senegal
        '225712345678', // Ivory Coast
        '22670123456',  // Burkina Faso
        '22371234567',  // Mali
        '256712345678', // Uganda
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
        '254712345678', // Kenya (not Wave)
      ];

      for (const number of invalidNumbers) {
        const result = await adapter.validatePhone(number);
        expect(result).toBe(false);
      }
    });
  });
});
