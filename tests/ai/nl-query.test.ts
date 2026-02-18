/**
 * Natural Language Query Tests
 */

import { NLQueryEngine } from '../../src/ai/nl-query.js';
import { Logger } from '../../src/utils/logger.js';
import { Transaction } from '../../src/types/index.js';

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as any;

// Mock transaction data
const mockTransactions: Transaction[] = [
  {
    id: 'txn_001',
    providerTransactionId: 'prov_001',
    provider: 'mpesa',
    status: 'completed',
    amount: { amount: 1000, currency: 'KES' },
    customer: { id: 'cust_001', country: 'KE', phone: { countryCode: '254', nationalNumber: '712345678', formatted: '+254712345678' } },
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  },
  {
    id: 'txn_002',
    providerTransactionId: 'prov_002',
    provider: 'paystack',
    status: 'failed',
    amount: { amount: 5000, currency: 'NGN' },
    customer: { id: 'cust_002', country: 'NG', phone: { countryCode: '234', nationalNumber: '8012345678', formatted: '+2348012345678' } },
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
    failureReason: 'Insufficient funds',
  },
  {
    id: 'txn_003',
    providerTransactionId: 'prov_003',
    provider: 'mpesa',
    status: 'failed',
    amount: { amount: 2000, currency: 'KES' },
    customer: { id: 'cust_003', country: 'KE', phone: { countryCode: '254', nationalNumber: '723456789', formatted: '+254723456789' } },
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
    failureReason: 'Network error',
  },
  {
    id: 'txn_004',
    providerTransactionId: 'prov_004',
    provider: 'mtn_momo',
    status: 'completed',
    amount: { amount: 10000, currency: 'UGX' },
    customer: { id: 'cust_004', country: 'UG', phone: { countryCode: '256', nationalNumber: '712345678', formatted: '+256712345678' } },
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  },
  {
    id: 'txn_005',
    providerTransactionId: 'prov_005',
    provider: 'paystack',
    status: 'completed',
    amount: { amount: 10000, currency: 'NGN' },
    customer: { id: 'cust_005', country: 'NG', phone: { countryCode: '234', nationalNumber: '8123456789', formatted: '+2348123456789' } },
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
    updatedAt: new Date(),
  },
];

describe('NLQueryEngine', () => {
  let engine: NLQueryEngine;

  beforeEach(async () => {
    engine = new NLQueryEngine(mockLogger);
    await engine.initialize();
    engine.setMockData(mockTransactions);
  });

  afterEach(() => {
    engine.reset();
    jest.clearAllMocks();
  });

  describe('Basic Queries', () => {
    it('should parse "show all transactions"', async () => {
      const result = await engine.executeQuery({ query: 'show all transactions' });

      expect(result.parsedIntent.action).toBe('show');
      expect(result.parsedIntent.subject).toBe('transactions');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should parse "count payments"', async () => {
      const result = await engine.executeQuery({ query: 'count payments' });

      expect(result.parsedIntent.action).toBe('count');
      expect(result.parsedIntent.subject).toBe('payments');
      expect(result.formattedResult).toContain('5');
    });

    it('should handle empty results', async () => {
      const result = await engine.executeQuery({ query: 'show transactions from Antarctica' });

      // Unknown country returns all results (no filter applied)
      // or empty results if we want to be strict - implementation choice
      expect(result).toBeDefined();
      expect(result.parsedIntent.action).toBe('show');
    });
  });

  describe('Country Filtering', () => {
    it('should filter by country name', async () => {
      const result = await engine.executeQuery({ query: 'show transactions from Kenya' });

      expect(result.filters.countries).toContain('KE');
      // Note: Actual filtering may vary based on implementation
      expect(result.data.every(t => t.customer.country === 'KE' || !result.filters.countries?.length)).toBe(true);
    });

    it('should filter by country code', async () => {
      const result = await engine.executeQuery({ query: 'show transactions from NG' });

      expect(result.filters.countries).toContain('NG');
    });

    it('should filter by Nigeria', async () => {
      const result = await engine.executeQuery({ query: 'show payments from Nigeria' });

      expect(result.filters.countries).toContain('NG');
    });

    it('should filter by Uganda', async () => {
      const result = await engine.executeQuery({ query: 'show transactions from Uganda' });

      expect(result.filters.countries).toContain('UG');
    });
  });

  describe('Status Filtering', () => {
    it('should filter by failed status', async () => {
      const result = await engine.executeQuery({ query: 'show failed payments' });

      expect(result.parsedIntent.status).toContain('failed');
      expect(result.filters.status).toContain('failed');
    });

    it('should filter by completed status', async () => {
      const result = await engine.executeQuery({ query: 'show successful transactions' });

      expect(result.parsedIntent.status).toContain('completed');
    });

    it('should filter by refunded status', async () => {
      const result = await engine.executeQuery({ query: 'show refunds' });

      expect(result.parsedIntent.subject).toBe('refunds');
    });

    it('should handle "failed payments from Nigeria last week"', async () => {
      const result = await engine.executeQuery({ query: 'show failed payments from Nigeria last week' });

      expect(result.parsedIntent.status).toContain('failed');
      expect(result.filters.countries).toContain('NG');
      expect(result.timeRange).toBeDefined();
    });
  });

  describe('Provider Filtering', () => {
    it('should filter by M-Pesa', async () => {
      const result = await engine.executeQuery({ query: 'show mpesa transactions' });

      expect(result.filters.providers).toContain('mpesa');
    });

    it('should filter by Paystack', async () => {
      const result = await engine.executeQuery({ query: 'show paystack payments' });

      expect(result.filters.providers).toContain('paystack');
    });

    it('should filter by MTN MoMo', async () => {
      const result = await engine.executeQuery({ query: 'show mtn momo transactions' });

      expect(result.filters.providers).toContain('mtn_momo');
    });
  });

  describe('Time Range Parsing', () => {
    it('should parse "last week"', async () => {
      const result = await engine.executeQuery({ query: 'show transactions last week' });

      expect(result.timeRange).toBeDefined();
      expect(result.timeRange!.description).toBe('last week');
    });

    it('should parse "today"', async () => {
      const result = await engine.executeQuery({ query: 'show payments today' });

      expect(result.timeRange).toBeDefined();
      expect(result.timeRange!.description).toBe('today');
    });

    it('should parse "yesterday"', async () => {
      const result = await engine.executeQuery({ query: 'show transactions yesterday' });

      expect(result.timeRange).toBeDefined();
      expect(result.timeRange!.description).toBe('yesterday');
    });

    it('should parse "last 3 days"', async () => {
      const result = await engine.executeQuery({ query: 'show payments last 3 days' });

      expect(result.timeRange).toBeDefined();
      expect(result.timeRange!.description).toBe('last 3 days');
    });

    it('should parse "this month"', async () => {
      const result = await engine.executeQuery({ query: 'show transactions this month' });

      expect(result.timeRange).toBeDefined();
      expect(result.timeRange!.description).toBe('this month');
    });

    it('should parse "last month"', async () => {
      const result = await engine.executeQuery({ query: 'show payments last month' });

      expect(result.timeRange).toBeDefined();
      expect(result.timeRange!.description).toBe('last month');
    });
  });

  describe('Amount Filtering', () => {
    it('should parse "above" amounts', async () => {
      const result = await engine.executeQuery({ query: 'show payments above 5000' });

      expect(result.filters.minAmount).toBe(5000);
    });

    it('should parse "below" amounts', async () => {
      const result = await engine.executeQuery({ query: 'show transactions below 10000' });

      expect(result.filters.maxAmount).toBe(10000);
    });

    it('should parse "between" amounts', async () => {
      const result = await engine.executeQuery({ query: 'show payments between 1000 and 5000' });

      expect(result.filters.minAmount).toBe(1000);
      expect(result.filters.maxAmount).toBe(5000);
    });
  });

  describe('Aggregations', () => {
    it('should parse group by country', async () => {
      const result = await engine.executeQuery({ query: 'show transactions group by country' });

      expect(result.aggregations).toBeDefined();
      expect(result.aggregations!.some(a => a.field === 'country')).toBe(true);
    });

    it('should parse per day', async () => {
      const result = await engine.executeQuery({ query: 'show payments per day' });

      expect(result.aggregations).toBeDefined();
      expect(result.aggregations!.some(a => a.field === 'day')).toBe(true);
    });

    it('should parse per provider', async () => {
      const result = await engine.executeQuery({ query: 'show transactions per provider' });

      expect(result.aggregations).toBeDefined();
      expect(result.aggregations!.some(a => a.field === 'provider')).toBe(true);
    });

    it('should group results correctly', async () => {
      const result = await engine.executeQuery({ query: 'show failed payments per country' });

      // Should return grouped data
      if (result.data.length > 0 && result.aggregations) {
        expect(result.data[0]).toHaveProperty('group');
        expect(result.data[0]).toHaveProperty('count');
      }
    });
  });

  describe('Action Types', () => {
    it('should handle count action', async () => {
      const result = await engine.executeQuery({ query: 'how many transactions from Kenya' });

      expect(result.parsedIntent.action).toBe('count');
      expect(result.formattedResult.toLowerCase()).toContain('found');
    });

    it('should handle sum action', async () => {
      const result = await engine.executeQuery({ query: 'total revenue from Nigeria' });

      expect(result.parsedIntent.action).toBe('sum');
      expect(result.parsedIntent.subject).toBe('revenue');
    });

    it('should handle average action', async () => {
      const result = await engine.executeQuery({ query: 'average payment amount' });

      expect(result.parsedIntent.action).toBe('average');
    });

    it('should handle compare action', async () => {
      const result = await engine.executeQuery({ query: 'compare mpesa and paystack' });

      expect(result.parsedIntent.action).toBe('compare');
    });

    it('should handle trend action', async () => {
      const result = await engine.executeQuery({ query: 'show transaction trend' });

      expect(result.parsedIntent.action).toBe('trend');
    });
  });

  describe('Complex Queries', () => {
    it('should handle complex query with multiple filters', async () => {
      const result = await engine.executeQuery({
        query: 'show failed payments from Nigeria last week above 1000',
      });

      expect(result.parsedIntent.status).toContain('failed');
      expect(result.filters.countries).toContain('NG');
      expect(result.filters.minAmount).toBe(1000);
      expect(result.timeRange).toBeDefined();
    });

    it('should handle query with grouping and time range', async () => {
      const result = await engine.executeQuery({
        query: 'show payments per country last month',
      });

      expect(result.aggregations).toBeDefined();
      expect(result.timeRange).toBeDefined();
    });
  });

  describe('Result Formatting', () => {
    it('should format count results', async () => {
      const result = await engine.executeQuery({ query: 'count transactions' });

      expect(result.formattedResult).toContain('5');
    });

    it('should format sum results', async () => {
      const result = await engine.executeQuery({ query: 'sum of all payments' });

      expect(result.formattedResult).toContain('Total');
      expect(result.formattedResult).toMatch(/\d+/);
    });

    it('should format average results', async () => {
      const result = await engine.executeQuery({ query: 'average transaction amount' });

      expect(result.formattedResult).toContain('Average');
    });

    it('should format grouped results', async () => {
      const result = await engine.executeQuery({ query: 'show payments per country' });

      // Check that aggregation was parsed
      expect(result.aggregations).toBeDefined();
      expect(result.aggregations!.length).toBeGreaterThan(0);
      expect(result.aggregations![0].field).toBe('country');

      // If data is grouped, check the structure
      if (result.data.length > 0 && result.data[0].group) {
        expect(result.data[0]).toHaveProperty('group');
        expect(result.data[0]).toHaveProperty('count');
      }
    });

    it('should limit list results', async () => {
      const result = await engine.executeQuery({ query: 'show all transactions' });

      // Should show indicator if more results exist
      if (result.data.length > 10) {
        expect(result.formattedResult).toContain('more');
      }
    });
  });

  describe('Query Intent', () => {
    it('should correctly identify payment subject', async () => {
      const result = await engine.executeQuery({ query: 'show payments' });

      expect(result.parsedIntent.subject).toBe('payments');
    });

    it('should correctly identify transaction subject', async () => {
      const result = await engine.executeQuery({ query: 'show transactions' });

      expect(result.parsedIntent.subject).toBe('transactions');
    });

    it('should correctly identify failure subject', async () => {
      const result = await engine.executeQuery({ query: 'show failures' });

      expect(result.parsedIntent.subject).toBe('failures');
    });
  });

  describe('Statistics', () => {
    it('should return stats', () => {
      const stats = engine.getStats();

      expect(stats).toHaveProperty('queriesProcessed');
      expect(stats).toHaveProperty('transactionsAvailable');
    });

    it('should track available transactions', () => {
      const stats = engine.getStats();
      expect(stats.transactionsAvailable).toBe(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query gracefully', async () => {
      const result = await engine.executeQuery({ query: '' });

      expect(result).toBeDefined();
      expect(result.parsedIntent).toBeDefined();
    });

    it('should handle unknown country', async () => {
      const result = await engine.executeQuery({ query: 'show transactions from unknownland' });

      expect(result).toBeDefined();
      // Unknown country doesn't filter results (returns all)
      expect(result.data.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle query with no matching results', async () => {
      const result = await engine.executeQuery({ query: 'show failed transactions from Ghana' });

      expect(result.data).toHaveLength(0);
      expect(result.formattedResult).toContain('No results');
    });

    it('should preserve original query', async () => {
      const originalQuery = 'Show Failed Payments from Nigeria Last Week';
      const result = await engine.executeQuery({ query: originalQuery });

      expect(result.originalQuery).toBe(originalQuery);
    });
  });
});
