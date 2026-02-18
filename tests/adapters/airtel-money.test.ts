/**
 * Airtel Money Adapter Tests
 * 
 * Test suite for the Airtel Money API adapter.
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { AirtelMoneyAdapter } from '../../src/adapters/airtel-money/index.js';
import { 
  AirtelMoneyConfig, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams 
} from '../../src/types/index.js';

const mockConfig: AirtelMoneyConfig = {
  enabled: true,
  environment: 'sandbox',
  clientId: 'test_client_id',
  clientSecret: 'test_client_secret',
};

describe('AirtelMoneyAdapter', () => {
  let adapter: AirtelMoneyAdapter;

  beforeEach(() => {
    adapter = new AirtelMoneyAdapter(mockConfig);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

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
  });

  describe('initialize', () => {
    it('should initialize and create access token', async () => {
      await adapter.initialize({});

      expect((adapter as any).accessToken).toBeDefined();
      expect((adapter as any).accessToken).toContain('airtel_token_');
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
        name: 'Ochieng Peter',
      },
      amount: {
        amount: 10000,
        currency: 'UGX',
      },
      description: 'Test disbursement',
    };

    it('should initiate disbursement successfully', async () => {
      const transaction = await adapter.sendMoney(sendMoneyParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('airtel_transfer_');
      expect(transaction.provider).toBe('airtel_money');
      expect(transaction.status).toBe('pending');
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

      const transaction = await adapter.sendMoney(kenyaParams);

      expect(transaction.amount.currency).toBe('KES');
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
        name: 'Wanjiku Mary',
        country: 'KE',
      },
      amount: {
        amount: 3000,
        currency: 'KES',
      },
      description: 'Collection request',
    };

    it('should initiate collection', async () => {
      const transaction = await adapter.requestPayment(requestPaymentParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('airtel_');
      expect(transaction.status).toBe('pending');
    });
  });

  describe('verifyTransaction', () => {
    it('should return transaction status', async () => {
      const transaction = await adapter.verifyTransaction('airtel_test_123');

      expect(transaction).toBeDefined();
      expect(transaction.status).toBe('completed');
    });
  });

  describe('refund', () => {
    it('should process refund', async () => {
      const refundParams: RefundParams = {
        originalTransactionId: 'airtel_test_123',
        reason: 'Refund requested by customer',
      };

      const transaction = await adapter.refund(refundParams);

      expect(transaction).toBeDefined();
      expect(transaction.id).toContain('airtel_refund_');
      expect(transaction.status).toBe('completed');
    });
  });

  describe('getBalance', () => {
    it('should return balance', async () => {
      const balance = await adapter.getBalance();

      expect(balance).toBeDefined();
      expect(balance.amount).toBe(500000);
      expect(balance.currency).toBe('UGX');
    });
  });
});
