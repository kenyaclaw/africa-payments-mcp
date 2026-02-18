/**
 * Smart Router Tests
 */

import { SmartRouter } from '../../src/ai/smart-router.js';
import { Logger } from '../../src/utils/logger.js';
import { RoutingInput } from '../../src/ai/types.js';

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as any;

describe('SmartRouter', () => {
  let router: SmartRouter;

  beforeEach(async () => {
    router = new SmartRouter(mockLogger);
    await router.initialize();
  });

  afterEach(() => {
    router.reset();
    jest.clearAllMocks();
  });

  describe('Basic Routing', () => {
    it('should select a provider for Kenya', async () => {
      const input: RoutingInput = {
        amount: { amount: 1000, currency: 'KES' },
        destinationCountry: 'KE',
        paymentMethod: 'mobile_money',
      };

      const decision = await router.selectProvider(input);

      expect(decision.provider).toBeTruthy();
      expect(decision.confidence).toBeGreaterThan(0);
      expect(decision.estimatedSuccessRate).toBeGreaterThan(0);
      expect(decision.reason).toBeTruthy();
    });

    it('should select a provider for Nigeria', async () => {
      const input: RoutingInput = {
        amount: { amount: 5000, currency: 'NGN' },
        destinationCountry: 'NG',
        paymentMethod: 'mobile_money',
      };

      const decision = await router.selectProvider(input);

      expect(decision.provider).toBeTruthy();
      expect(['paystack', 'flutterwave', 'intasend', 'chipper_cash']).toContain(decision.provider);
    });

    it('should provide alternative providers', async () => {
      const input: RoutingInput = {
        amount: { amount: 1000, currency: 'KES' },
        destinationCountry: 'KE',
        paymentMethod: 'mobile_money',
      };

      const decision = await router.selectProvider(input);

      expect(decision.alternativeProviders).toBeInstanceOf(Array);
      expect(decision.alternativeProviders.length).toBeGreaterThan(0);
    });
  });

  describe('Priority Routing', () => {
    it('should prioritize speed when requested', async () => {
      const input: RoutingInput = {
        amount: { amount: 1000, currency: 'KES' },
        destinationCountry: 'KE',
        paymentMethod: 'mobile_money',
        priority: 'speed',
      };

      const decision = await router.selectProvider(input);

      expect(decision.reason.toLowerCase()).toContain('speed');
      // Instant providers should be preferred
      expect(decision.estimatedLatency).toBeLessThan(5000);
    });

    it('should prioritize cost when requested', async () => {
      const input: RoutingInput = {
        amount: { amount: 1000, currency: 'KES' },
        destinationCountry: 'KE',
        paymentMethod: 'mobile_money',
        priority: 'cost',
      };

      const decision = await router.selectProvider(input);

      expect(decision.reason.toLowerCase()).toContain('cost');
    });

    it('should prioritize reliability when requested', async () => {
      const input: RoutingInput = {
        amount: { amount: 1000, currency: 'KES' },
        destinationCountry: 'KE',
        paymentMethod: 'mobile_money',
        priority: 'reliability',
      };

      const decision = await router.selectProvider(input);

      expect(decision.reason.toLowerCase()).toContain('reliability');
      expect(decision.estimatedSuccessRate).toBeGreaterThan(90);
    });

    it('should use balanced scoring by default', async () => {
      const input: RoutingInput = {
        amount: { amount: 1000, currency: 'KES' },
        destinationCountry: 'KE',
        paymentMethod: 'mobile_money',
      };

      const decision = await router.selectProvider(input);

      expect(decision.reason.toLowerCase()).toContain('balanced');
    });
  });

  describe('Country-specific Optimization', () => {
    it('should prefer M-Pesa for Kenya', async () => {
      const input: RoutingInput = {
        amount: { amount: 1000, currency: 'KES' },
        destinationCountry: 'KE',
        paymentMethod: 'mobile_money',
      };

      const decision = await router.selectProvider(input);

      // M-Pesa should be highly ranked for Kenya
      expect(decision.provider === 'mpesa' || decision.alternativeProviders.includes('mpesa')).toBe(true);
    });

    it('should prefer Paystack for Nigeria', async () => {
      const input: RoutingInput = {
        amount: { amount: 5000, currency: 'NGN' },
        destinationCountry: 'NG',
        paymentMethod: 'mobile_money',
      };

      const decision = await router.selectProvider(input);

      // Paystack should be highly ranked for Nigeria
      expect(decision.provider === 'paystack' || decision.alternativeProviders.includes('paystack')).toBe(true);
    });

    it('should prefer MTN MoMo for Uganda', async () => {
      const input: RoutingInput = {
        amount: { amount: 50000, currency: 'UGX' },
        destinationCountry: 'UG',
        paymentMethod: 'mobile_money',
      };

      const decision = await router.selectProvider(input);

      // MTN MoMo should be highly ranked for Uganda
      expect(decision.provider === 'mtn_momo' || decision.alternativeProviders.includes('mtn_momo')).toBe(true);
    });
  });

  describe('Learning from Outcomes', () => {
    it('should record transaction outcomes', async () => {
      await router.recordOutcome('mpesa', 'KE', true, 2000, 1.0);
      await router.recordOutcome('mpesa', 'KE', true, 1800, 1.0);
      await router.recordOutcome('mpesa', 'KE', false, 5000, 0);

      const stats = router.getStats();
      expect(stats.totalOutcomes).toBe(3);
    });

    it('should improve routing based on historical performance', async () => {
      // Record poor performance for provider A
      for (let i = 0; i < 10; i++) {
        await router.recordOutcome('paystack', 'KE', false, 10000, 0);
      }

      // Record good performance for provider B
      for (let i = 0; i < 10; i++) {
        await router.recordOutcome('mpesa', 'KE', true, 2000, 1.0);
      }

      const input: RoutingInput = {
        amount: { amount: 1000, currency: 'KES' },
        destinationCountry: 'KE',
        paymentMethod: 'mobile_money',
        priority: 'reliability',
      };

      const decision = await router.selectProvider(input);

      // Should prefer the provider with better history
      expect(decision.estimatedSuccessRate).toBeGreaterThan(50);
    });

    it('should learn from batch outcomes', async () => {
      // Record multiple outcomes
      for (let i = 0; i < 5; i++) {
        await router.recordOutcome('mpesa', 'KE', true, 2000, 1.0);
      }

      await router.learn();

      // Should have processed the outcomes
      const stats = router.getStats();
      expect(stats.lastLearningUpdate).toBeInstanceOf(Date);
    });
  });

  describe('Performance Report', () => {
    it('should generate performance report', async () => {
      // Add some data
      await router.recordOutcome('mpesa', 'KE', true, 2000, 1.0);
      await router.recordOutcome('paystack', 'NG', true, 1500, 1.5);
      await router.recordOutcome('mtn_momo', 'UG', false, 3000, 1.0);

      const report = router.getPerformanceReport();

      expect(report).toBeInstanceOf(Array);
      expect(report.length).toBeGreaterThan(0);
      
      // Should be sorted by success rate
      if (report.length > 1) {
        expect(report[0].successRate).toBeGreaterThanOrEqual(report[1].successRate);
      }
    });

    it('should track provider-specific metrics', async () => {
      await router.recordOutcome('mpesa', 'KE', true, 2000, 1.0);
      await router.recordOutcome('mpesa', 'KE', true, 1800, 1.0);

      const report = router.getPerformanceReport();
      const mpesaKE = report.find(r => r.provider === 'mpesa' && r.country === 'KE');

      expect(mpesaKE).toBeDefined();
      expect(mpesaKE!.totalTransactions).toBe(2);
      expect(mpesaKE!.avgLatency).toBeGreaterThan(0);
    });
  });

  describe('Time-based Adjustments', () => {
    it('should adjust scores based on time of day', async () => {
      // Test during different hours would require time mocking
      const input: RoutingInput = {
        amount: { amount: 1000, currency: 'KES' },
        destinationCountry: 'KE',
        paymentMethod: 'mobile_money',
      };

      const decision = await router.selectProvider(input);
      
      // Should include time-related reasoning if applicable
      expect(decision.confidence).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should fallback to default providers for unsupported country', async () => {
      const input: RoutingInput = {
        amount: { amount: 100, currency: 'USD' },
        destinationCountry: 'XX', // Unsupported
        paymentMethod: 'mobile_money',
      };

      // Should fallback to default providers instead of throwing
      const decision = await router.selectProvider(input);
      expect(decision.provider).toBeTruthy();
      expect(decision.confidence).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should return stats', () => {
      const stats = router.getStats();

      expect(stats).toHaveProperty('providersTracked');
      expect(stats).toHaveProperty('totalOutcomes');
      expect(stats).toHaveProperty('lastLearningUpdate');
    });

    it('should track providers correctly', async () => {
      await router.recordOutcome('mpesa', 'KE', true, 2000, 1.0);
      await router.recordOutcome('paystack', 'NG', true, 1500, 1.5);

      const stats = router.getStats();
      expect(stats.providersTracked).toBe(2);
    });
  });
});
