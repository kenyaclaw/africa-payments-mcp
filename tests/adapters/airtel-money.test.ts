/**
 * Airtel Money Adapter Tests
 * 
 * Comprehensive test suite for the Airtel Money API adapter.
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
import { AirtelMoneyAdapter } from '../../src/adapters/airtel-money/index.js';
import { 
  AirtelMoneyConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams 
} from '../../src/types/index.js';

// Mock config for testing
const mockConfig: AirtelMoneyConfig = {
  enabled: true,
  environment: 'sandbox',
  clientId: 'test_client_id',
  clientSecret: 'test_client_secret',
};

describe('AirtelMoneyAdapter', () => {
  let adapter: AirtelMoneyAdapter;
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
    
    adapter = new AirtelMoneyAdapter(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==================== Adapter Properties ====================
  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('airtel_money');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('Airtel Money');
    });

    it('should support East African countries', () => {
      expect(adapter.countries).toContain('KE');
      expect(adapter.countries).toContain('UG');
      expect(adapter.countries).toContain('TZ');
      expect(adapter.countries).toContain('RW');
    });

    it('should support local currencies', () => {
      expect(adapter.currencies).toContain('KES');
      expect(adapter.currencies).toContain('UGX');
      expect(adapter.currencies).toContain('TZS');
      expect(adapter.currencies).toContain('RWF');
    });

    it('should only support mobile money', () => {
      expect(adapter.supportedMethods).toEqual(['mobile_money']);
    });

    it('should have config accessible', () => {
      expect(adapter.config).toEqual(mockConfig);
    });
  });

  // ==================== Initialize ====================
  describe('initialize', () => {
    it('should initialize and create access token', async () => {
      // Mock authentication (POST to token endpoint)
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_airtel_token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });

      await adapter.initialize({});

      expect((adapter as any).accessToken).toBe('mock_airtel_token');
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('/auth/oauth2/token'),
        expect.objectContaining({
          client_id: 'test_client_id',
          client_secret: 'test_client_secret',
          grant_type: 'client_credentials',
        })
      );
    });
  });

  // ==================== Send Money (Disbursement) ====================
  describe('sendMoney', () => {
    const sendMoneyParams: SendMoneyParams = {
      recipient: {
        phone: {
          countryCode: '256',
          nationalNumber: '712345678',
          formatted: '+256712345678',
        },
        name: 'Ochieng Peter',
      },
      amount: {
        amount: 10000,
        currency: 'UGX',
      },
      description: 'Test disbursement',
    };

    it('should initiate disbursement successfully', async () => {
      // Mock authentication (POST to token endpoint)
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_airtel_token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });

      // Mock disbursement endpoint
      mockPost.mockResolvedValueOnce({
        data: {
          transaction: {
            id: 'AIRTL_DISB_123',
            status: 'TA',
          },
          status: {
            code: 'TA',
            message: 'Transaction Accepted',
            success: true,
          },
        },
      });

      const transaction = await adapter.sendMoney(sendMoneyParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('airtel_transfer_');
      expect(transaction.provider).toBe('airtel_money');
      expect(transaction.status).toBe('pending');
      expect(transaction.amount.amount).toBe(10000);
      expect(transaction.amount.currency).toBe('UGX');
    });

    it('should handle Kenya payments', async () => {
      const kenyaParams: SendMoneyParams = {
        recipient: {
          phone: {
            countryCode: '254',
            nationalNumber: '712345678',
            formatted: '+254712345678',
          },
          name: 'Kamau John',
        },
        amount: {
          amount: 5000,
          currency: 'KES',
        },
        description: 'Kenya payment',
      };

      // Mock authentication
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_airtel_token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });

      // Mock disbursement endpoint
      mockPost.mockResolvedValueOnce({
        data: {
          transaction: {
            id: 'AIRTL_DISB_456',
            status: 'TS',
          },
          status: {
            code: 'TS',
            message: 'Transaction Success',
            success: true,
          },
        },
      });

      const transaction = await adapter.sendMoney(kenyaParams);

      expect(transaction.amount.currency).toBe('KES');
      expect(transaction.status).toBe('completed');
    });
  });

  // ==================== Request Payment (Collection) ====================
  describe('requestPayment', () => {
    const requestPaymentParams: RequestPaymentParams = {
      customer: {
        phone: {
          countryCode: '254',
          nationalNumber: '712345678',
          formatted: '+254712345678',
        },
        name: 'Wanjiku Mary',
        country: 'KE',
      },
      amount: {
        amount: 3000,
        currency: 'KES',
      },
      description: 'Collection request',
    };

    it('should initiate collection successfully', async () => {
      // Mock authentication
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_airtel_token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });

      // Mock collection endpoint
      mockPost.mockResolvedValueOnce({
        data: {
          transactionId: 'AIRTL_COL_789',
          status: {
            code: 'TA',
            message: 'Transaction Accepted',
            result_code: '0',
            response_code: '200',
            success: true,
          },
        },
      });

      const transaction = await adapter.requestPayment(requestPaymentParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('airtel_');
      expect(transaction.status).toBe('pending');
      expect(transaction.providerTransactionId).toBe('AIRTL_COL_789');
    });
  });

  // ==================== Verify Transaction ====================
  describe('verifyTransaction', () => {
    it('should return transaction status', async () => {
      // Mock authentication
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_airtel_token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });

      // Mock transaction status endpoint (GET request)
      mockGet.mockResolvedValueOnce({
        data: {
          transaction: {
            id: 'test_123',
            message: 'Transaction completed',
            status: 'TS',
            airtel_money_id: 'AIRTL_MNY_123',
          },
          status: {
            code: 'TS',
            message: 'Transaction Success',
            result_code: '0',
            response_code: '200',
            success: true,
          },
        },
      });

      const status = await adapter.verifyTransaction('airtel_test_123');

      expect(status).toBeDefined();
      expect(status.providerTransactionId).toBe('test_123');
      expect(status.status).toBe('completed');
    });
  });

  // ==================== Refund ====================
  describe('refund', () => {
    it('should process refund successfully', async () => {
      const refundParams: RefundParams = {
        originalTransactionId: 'airtel_test_123',
        reason: 'Refund requested by customer',
      };

      // Mock authentication
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_airtel_token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });

      // Mock refund endpoint
      mockPost.mockResolvedValueOnce({
        data: {
          transaction: {
            id: 'AIRTL_REFUND_001',
            status: 'TS',
          },
          status: {
            code: 'TS',
            message: 'Refund processed',
            success: true,
          },
        },
      });

      const transaction = await adapter.refund(refundParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('airtel_refund_');
      expect(transaction.status).toBe('completed');
    });
  });

  // ==================== Get Balance ====================
  describe('getBalance', () => {
    it('should return balance', async () => {
      // Mock authentication
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_airtel_token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });

      const balance = await adapter.getBalance();

      expect(balance).toBeDefined();
      expect(balance.amount).toBe(0);
      expect(balance.currency).toBe('KES');
    });
  });

  // ==================== Phone Validation ====================
  describe('validatePhone', () => {
    it('should validate correct Airtel Money phone numbers', async () => {
      const validNumbers = [
        '254712345678', // Kenya
        '256712345678', // Uganda
        '255712345678', // Tanzania
        '260971234567', // Zambia
        '265991234567', // Malawi
        '250712345678', // Rwanda
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
