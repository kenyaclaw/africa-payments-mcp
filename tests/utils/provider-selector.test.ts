/**
 * Smart Provider Selector Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { ProviderSelector } from '../../src/utils/provider-selector.js';
import { ProviderRegistry } from '../../src/utils/registry.js';
import { Logger } from '../../src/utils/logger.js';
import { MpesaAdapter } from '../../src/adapters/mpesa/index.js';
import { PaystackAdapter } from '../../src/adapters/paystack/index.js';
import { MTNMoMoAdapter } from '../../src/adapters/mtn-momo/index.js';
import { 
  MpesaConfig, 
  PaystackConfig, 
  MTNMoMoConfig 
} from '../../src/types/index.js';

// Mock axios
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

const mockMpesaConfig: MpesaConfig = {
  enabled: true,
  environment: 'sandbox',
  consumerKey: 'test_key',
  consumerSecret: 'test_secret',
  passkey: 'test_passkey',
  shortCode: '123456',
};

const mockPaystackConfig: PaystackConfig = {
  enabled: true,
  environment: 'sandbox',
  secretKey: 'sk_test_123',
};

const mockMomoConfig: MTNMoMoConfig = {
  enabled: true,
  environment: 'sandbox',
  apiUser: 'test_user',
  apiKey: 'test_key',
  subscriptionKey: 'test_sub_key',
};

describe('ProviderSelector', () => {
  let registry: ProviderRegistry;
  let logger: Logger;
  let selector: ProviderSelector;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('error');
    registry = new ProviderRegistry(logger);
    selector = new ProviderSelector(registry, logger);
  });

  describe('selectBestProvider', () => {
    it('should select the only available provider', async () => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));

      const result = await selector.selectBestProvider(
        { amount: 1000, currency: 'KES' },
        'KE'
      );

      expect(result.provider).toBe('mpesa');
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.scores).toHaveLength(1);
    });

    it('should select best provider for Kenya prioritizing fees', async () => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
      registry.register('paystack', new PaystackAdapter(mockPaystackConfig));

      const result = await selector.selectBestProvider(
        { amount: 1000, currency: 'KES' },
        'KE',
        { prioritize: 'fees' }
      );

      expect(result.provider).toBeDefined();
      expect(result.reason).toContain('fees');
      expect(result.scores.length).toBeGreaterThan(0);
    });

    it('should select best provider prioritizing speed', async () => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
      registry.register('paystack', new PaystackAdapter(mockPaystackConfig));

      const result = await selector.selectBestProvider(
        { amount: 1000, currency: 'KES' },
        'KE',
        { prioritize: 'speed' }
      );

      expect(result.provider).toBeDefined();
      expect(result.reason.toLowerCase()).toContain('fast');
    });

    it('should select best provider prioritizing reliability', async () => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
      registry.register('paystack', new PaystackAdapter(mockPaystackConfig));

      const result = await selector.selectBestProvider(
        { amount: 1000, currency: 'KES' },
        'KE',
        { prioritize: 'reliability' }
      );

      expect(result.provider).toBeDefined();
      expect(result.reason).toContain('reliable');
    });

    it('should provide comparison scores for all providers', async () => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
      registry.register('paystack', new PaystackAdapter(mockPaystackConfig));
      registry.register('mtn_momo', new MTNMoMoAdapter(mockMomoConfig));

      const result = await selector.selectBestProvider(
        { amount: 1000, currency: 'KES' },
        'KE'
      );

      expect(result.scores).toHaveLength(3);
      expect(result.scores[0].score).toBeGreaterThanOrEqual(result.scores[1].score);
    });

    it('should prefer providers that support the destination country', async () => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
      registry.register('mtn_momo', new MTNMoMoAdapter(mockMomoConfig));

      const result = await selector.selectBestProvider(
        { amount: 1000, currency: 'UGX' },
        'UG'
      );

      // MTN MoMo supports Uganda, M-Pesa doesn't
      const momoScore = result.scores.find(s => s.provider === 'mtn_momo');
      const mpesaScore = result.scores.find(s => s.provider === 'mpesa');
      
      expect(momoScore?.reasons.some(r => r.includes('UG'))).toBe(true);
      expect(mpesaScore?.reasons.some(r => r.includes('Does not support'))).toBe(true);
    });

    it('should throw error when no providers available', async () => {
      await expect(
        selector.selectBestProvider({ amount: 1000, currency: 'KES' }, 'KE')
      ).rejects.toThrow('No providers available');
    });

    it('should calculate estimated fees correctly', async () => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));

      const result = await selector.selectBestProvider(
        { amount: 5000, currency: 'KES' },
        'KE'
      );

      const mpesaScore = result.scores.find(s => s.provider === 'mpesa');
      expect(mpesaScore?.fees.percentage).toBe(1.0);
      expect(mpesaScore?.fees.estimatedTotal).toBe(50); // 1% of 5000
    });
  });

  describe('compareProviders', () => {
    it('should return scored list of all providers', async () => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
      registry.register('paystack', new PaystackAdapter(mockPaystackConfig));

      const scores = await selector.compareProviders(
        { amount: 1000, currency: 'KES' },
        'KE'
      );

      expect(scores).toHaveLength(2);
      expect(scores[0].score).toBeGreaterThanOrEqual(scores[1].score);
    });

    it('should include all relevant scoring data', async () => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));

      const scores = await selector.compareProviders(
        { amount: 1000, currency: 'KES' },
        'KE'
      );

      const score = scores[0];
      expect(score.provider).toBe('mpesa');
      expect(score.score).toBeDefined();
      expect(score.fees).toBeDefined();
      expect(score.speed).toBeDefined();
      expect(score.reliability).toBeDefined();
      expect(score.reasons).toBeInstanceOf(Array);
    });
  });

  describe('formatComparison', () => {
    it('should format comparison with medals', () => {
      const scores = [
        {
          provider: 'mpesa',
          score: 90,
          reasons: ['Supports KE', 'Native KES support'],
          fees: { fixed: 0, percentage: 1.0, estimatedTotal: 10 },
          speed: 'instant' as const,
          reliability: 98,
        },
        {
          provider: 'paystack',
          score: 75,
          reasons: ['Supports KE'],
          fees: { fixed: 0, percentage: 1.5, estimatedTotal: 15 },
          speed: 'fast' as const,
          reliability: 97,
        },
      ];

      const output = selector.formatComparison(scores);

      expect(output).toContain('🥇');
      expect(output).toContain('🥈');
      expect(output).toContain('MPESA');
      expect(output).toContain('PAYSTACK');
      expect(output).toContain('Score: 90');
      expect(output).toContain('Score: 75');
    });

    it('should show provider details', () => {
      const scores = [
        {
          provider: 'mpesa',
          score: 90,
          reasons: ['Supports KE'],
          fees: { fixed: 0, percentage: 1.0, estimatedTotal: 10 },
          speed: 'instant' as const,
          reliability: 98,
        },
      ];

      const output = selector.formatComparison(scores);

      expect(output).toContain('Fees:');
      expect(output).toContain('Speed:');
      expect(output).toContain('Reliability:');
    });
  });

  describe('selection criteria', () => {
    beforeEach(() => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
      registry.register('paystack', new PaystackAdapter(mockPaystackConfig));
    });

    it('should use balanced scoring by default', async () => {
      const result = await selector.selectBestProvider(
        { amount: 1000, currency: 'KES' },
        'KE'
      );

      expect(result.reason).toContain('Best overall value');
    });

    it('should include selection reason with key details', async () => {
      const result = await selector.selectBestProvider(
        { amount: 1000, currency: 'KES' },
        'KE',
        { prioritize: 'fees' }
      );

      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.scores[0].score).toBeGreaterThan(0);
    });
  });
});
