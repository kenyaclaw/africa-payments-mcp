/**
 * MTN MoMo Adapter Tests
 * 
 * Test suite for the MTN Mobile Money API adapter.
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
import { MTNMoMoAdapter } from '../../src/adapters/mtn-momo/index.js';
import { 
  MTNMoMoConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams 
} from '../../src/types/index.js';

const mockConfig: MTNMoMoConfig = {
  enabled: true,
  environment: 'sandbox',
  apiUser: 'test_api_user',
  apiKey: 'test_api_key',
  subscriptionKey: 'test_subscription_key',
  targetEnvironment: 'sandbox',
};

describe('MTNMoMoAdapter', () => {
  let adapter: MTNMoMoAdapter;
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
    
    adapter = new MTNMoMoAdapter(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('mtn_momo');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('MTN Mobile Money');
    });

    it('should support African countries', () => {
      expect(adapter.countries).toContain('UG');
      expect(adapter.countries).toContain('GH');
      expect(adapter.countries).toContain('CM');
    });

    it('should support local currencies', () => {
      expect(adapter.currencies).toContain('UGX');
      expect(adapter.currencies).toContain('GHS');
      expect(adapter.currencies).toContain('XAF');
      expect(adapter.currencies).toContain('XOF');
    });

    it('should only support mobile money', () => {
      expect(adapter.supportedMethods).toEqual(['mobile_money']);
    });
  });

  describe('initialize', () => {
    it('should initialize and create API token', async () => {
      // Mock authentication (POST to collection/token/)
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_momo_token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });

      await adapter.initialize({});

      expect((adapter as any).accessToken).toBeDefined();
      expect((adapter as any).accessToken).toBe('mock_momo_token');
    });
  });

  describe('sendMoney', () => {
    const sendMoneyParams: SendMoneyParams = {
      recipient: {
        phone: {
          countryCode: '256',
          nationalNumber: '712345678',
          formatted: '+256712345678',
        },
        name: 'Mukasa David',
      },
      amount: {
        amount: 50000,
        currency: 'UGX',
      },
      description: 'Test transfer',
    };

    it('should initiate transfer successfully', async () => {
      // Mock authentication (POST to collection/token/)
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_momo_token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });
      
      // Mock transfer request (POST to disbursement/v1_0/transfer)
      // MTN MoMo returns 202 Accepted
      mockPost.mockResolvedValueOnce({
        status: 202,
        data: {},
      });

      const transaction = await adapter.sendMoney(sendMoneyParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('momo_transfer_');
      expect(transaction.provider).toBe('mtn_momo');
      expect(transaction.status).toBe('pending');
      expect(transaction.amount.currency).toBe('UGX');
    });

    it('should include recipient details', async () => {
      // Mock authentication
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_momo_token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });
      
      // Mock transfer request
      mockPost.mockResolvedValueOnce({
        status: 202,
        data: {},
      });

      const transaction = await adapter.sendMoney(sendMoneyParams);

      expect(transaction.customer.name).toBe('Mukasa David');
      expect(transaction.customer.phone?.formatted).toBe('+256712345678');
    });
  });

  describe('requestPayment', () => {
    const requestPaymentParams: RequestPaymentParams = {
      customer: {
        phone: {
          countryCode: '256',
          nationalNumber: '712345678',
          formatted: '+256712345678',
        },
        name: 'Nakato Sarah',
        country: 'UG',
      },
      amount: {
        amount: 25000,
        currency: 'UGX',
      },
      description: 'Payment request',
    };

    it('should initiate request to pay', async () => {
      // Mock authentication (POST to collection/token/)
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_momo_token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });
      
      // Mock request to pay (POST to collection/v1_0/requesttopay)
      mockPost.mockResolvedValueOnce({
        status: 202,
        data: {},
      });

      const transaction = await adapter.requestPayment(requestPaymentParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('momo_');
      expect(transaction.status).toBe('pending');
    });
  });

  describe('verifyTransaction', () => {
    it('should return transaction status', async () => {
      // Mock authentication (POST to collection/token/)
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_momo_token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });
      
      // Mock transaction status check (GET from collection/v1_0/requesttopay/{referenceId})
      mockGet.mockResolvedValueOnce({
        data: {
          amount: '25000',
          currency: 'UGX',
          financialTransactionId: 'FIN123456',
          externalId: 'EXT789',
          payer: {
            partyIdType: 'MSISDN',
            partyId: '256712345678',
          },
          payerMessage: 'Payment request',
          payeeNote: 'Please approve payment',
          status: 'SUCCESSFUL',
        },
      });

      const transaction = await adapter.verifyTransaction('momo_test_123');

      expect(transaction).toBeDefined();
      expect(transaction.status).toBe('completed');
      expect(transaction.amount.currency).toBe('UGX');
    });
  });

  describe('refund', () => {
    it('should process refund', async () => {
      const refundParams: RefundParams = {
        originalTransactionId: 'momo_test_123',
        amount: { amount: 25000, currency: 'UGX' },
      };

      // Mock 1: Authentication (POST to collection/token/)
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_momo_token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });
      
      // Mock 2: Get original transaction (GET from collection/v1_0/requesttopay/{referenceId})
      // This is called by verifyTransaction within refund
      mockGet.mockResolvedValueOnce({
        data: {
          amount: '25000',
          currency: 'UGX',
          financialTransactionId: 'FIN123456',
          externalId: 'momo_test_123',
          payer: {
            partyIdType: 'MSISDN',
            partyId: '256712345678',
          },
          payerMessage: 'Payment request',
          payeeNote: 'Please approve payment',
          status: 'SUCCESSFUL',
        },
      });
      
      // Mock 3: Refund transfer (POST to disbursement/v1_0/transfer)
      mockPost.mockResolvedValueOnce({
        status: 202,
        data: {},
      });

      const transaction = await adapter.refund(refundParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('momo_refund_');
      expect(transaction.status).toBe('pending');
    });
  });

  describe('getBalance', () => {
    it('should return balance', async () => {
      // Mock authentication (POST to collection/token/)
      mockPost.mockResolvedValueOnce({
        data: {
          access_token: 'mock_momo_token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      });
      
      // Mock balance check (GET from collection/v1_0/account/balance)
      mockGet.mockResolvedValueOnce({
        data: {
          availableBalance: '1000000',
          currency: 'UGX',
        },
      });

      const balance = await adapter.getBalance();

      expect(balance).toBeDefined();
      expect(balance.amount).toBe(1000000);
      expect(balance.currency).toBe('UGX');
    });
  });
});
