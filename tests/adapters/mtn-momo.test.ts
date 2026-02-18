/**
 * MTN MoMo Adapter Tests
 * 
 * Test suite for the MTN Mobile Money API adapter.
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
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

  beforeEach(() => {
    adapter = new MTNMoMoAdapter(mockConfig);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-15T12:00:00Z'));
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
      await adapter.initialize({});

      expect((adapter as any).apiToken).toBeDefined();
      expect((adapter as any).apiToken).toContain('momo_token_');
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
      const transaction = await adapter.sendMoney(sendMoneyParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('momo_transfer_');
      expect(transaction.provider).toBe('mtn_momo');
      expect(transaction.status).toBe('pending');
      expect(transaction.amount.currency).toBe('UGX');
    });

    it('should include recipient details', async () => {
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
      const transaction = await adapter.requestPayment(requestPaymentParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('momo_');
      expect(transaction.status).toBe('pending');
    });
  });

  describe('verifyTransaction', () => {
    it('should return completed status', async () => {
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

      const transaction = await adapter.refund(refundParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('momo_refund_');
      expect(transaction.status).toBe('completed');
    });
  });

  describe('getBalance', () => {
    it('should return balance', async () => {
      const balance = await adapter.getBalance();

      expect(balance).toBeDefined();
      expect(balance.amount).toBe(1000000);
      expect(balance.currency).toBe('UGX');
    });
  });
});
