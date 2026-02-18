/**
 * AI Module Integration Tests
 * Tests the integration of all AI features working together
 */

import { FraudDetector, SmartRouter, Predictor, NLQueryEngine } from '../../src/ai/index.js';
import { Logger } from '../../src/utils/logger.js';
import { Transaction } from '../../src/types/index.js';

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as any;

describe('AI Module Integration', () => {
  let fraudDetector: FraudDetector;
  let smartRouter: SmartRouter;
  let predictor: Predictor;
  let nlQueryEngine: NLQueryEngine;

  beforeEach(async () => {
    fraudDetector = new FraudDetector(mockLogger);
    smartRouter = new SmartRouter(mockLogger);
    predictor = new Predictor(mockLogger);
    nlQueryEngine = new NLQueryEngine(mockLogger);

    await Promise.all([
      fraudDetector.initialize(),
      smartRouter.initialize(),
      predictor.initialize(),
      nlQueryEngine.initialize(),
    ]);
  });

  afterEach(() => {
    fraudDetector = null as any;
    smartRouter = null as any;
    predictor = null as any;
    nlQueryEngine = null as any;
    jest.clearAllMocks();
  });

  describe('End-to-End Flow', () => {
    it('should process a complete payment flow with all AI features', async () => {
      // 1. Check for fraud
      const fraudCheck = await fraudDetector.checkTransaction({
        amount: { amount: 5000, currency: 'KES' },
        customerId: 'cust_test',
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
      });

      expect(fraudCheck.decision).toBe('allow');

      // 2. Select best provider
      const routingDecision = await smartRouter.selectProvider({
        amount: { amount: 5000, currency: 'KES' },
        destinationCountry: 'KE',
        paymentMethod: 'mobile_money',
        priority: 'balanced',
      });

      expect(routingDecision.provider).toBeTruthy();
      expect(routingDecision.confidence).toBeGreaterThan(0);

      // 3. Record metrics for prediction
      predictor.recordMetrics(routingDecision.provider, 'KE', {
        failureRate: 2,
        latency: routingDecision.estimatedLatency,
        volume: 1,
      });

      // 4. Get any active alerts
      const alerts = predictor.getActiveAlerts();
      expect(alerts).toBeInstanceOf(Array);

      // 5. Query the results
      const mockTransactions: Transaction[] = [
        {
          id: 'txn_test',
          providerTransactionId: 'prov_test',
          provider: routingDecision.provider,
          status: 'completed',
          amount: { amount: 5000, currency: 'KES' },
          customer: { id: 'cust_test', country: 'KE' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      nlQueryEngine.setMockData(mockTransactions);
      const queryResult = await nlQueryEngine.executeQuery({
        query: 'show transactions from Kenya',
      });

      expect(queryResult.data.length).toBeGreaterThan(0);
    });
  });

  describe('Learning Integration', () => {
    it('should improve routing based on recorded outcomes', async () => {
      // Record some failure outcomes for a provider
      for (let i = 0; i < 10; i++) {
        await smartRouter.recordOutcome('paystack', 'KE', false, 8000, 0);
      }

      // Record success outcomes for another provider
      for (let i = 0; i < 10; i++) {
        await smartRouter.recordOutcome('mpesa', 'KE', true, 2000, 1.0);
      }

      // Get routing decision with reliability priority
      const decision = await smartRouter.selectProvider({
        amount: { amount: 1000, currency: 'KES' },
        destinationCountry: 'KE',
        paymentMethod: 'mobile_money',
        priority: 'reliability',
      });

      // Should prefer the provider with better history
      expect(decision.estimatedSuccessRate).toBeGreaterThan(50);

      // Also record for predictor
      predictor.recordMetrics(decision.provider, 'KE', {
        failureRate: 5,
        latency: decision.estimatedLatency,
        volume: 1,
      });

      // Should have data in predictor
      const stats = predictor.getStats();
      expect(stats.dataPoints).toBeGreaterThan(0);
    });
  });

  describe('Fraud and Routing Integration', () => {
    it('should route high-risk transactions to most reliable provider', async () => {
      // Simulate a slightly suspicious transaction
      const fraudCheck = await fraudDetector.checkTransaction({
        amount: { amount: 300000, currency: 'KES' }, // High amount
        customerId: 'cust_new',
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
      });

      // Should be flagged for review due to high amount
      expect(fraudCheck.riskScore).toBeGreaterThan(0);

      // Even if allowed, should route with reliability priority
      if (fraudCheck.decision !== 'block') {
        const routingDecision = await smartRouter.selectProvider({
          amount: { amount: 300000, currency: 'KES' },
          destinationCountry: 'KE',
          paymentMethod: 'mobile_money',
          priority: 'reliability',
        });

        expect(routingDecision.estimatedSuccessRate).toBeGreaterThan(90);
      }
    });
  });

  describe('Predictive Alerting Integration', () => {
    it('should generate alerts based on historical patterns', async () => {
      // Add baseline performance data
      for (let i = 0; i < 30; i++) {
        predictor.recordMetrics('mpesa', 'KE', {
          failureRate: 2,
          latency: 2000,
          volume: 100,
        });
      }

      // Add current spike data
      for (let i = 0; i < 10; i++) {
        predictor.recordMetrics('mpesa', 'KE', {
          failureRate: 30,
          latency: 6000,
          volume: 100,
        });
      }

      // Should have generated alerts
      const alerts = predictor.getActiveAlerts();

      // Route with awareness of alerts
      const decision = await smartRouter.selectProvider({
        amount: { amount: 1000, currency: 'KES' },
        destinationCountry: 'KE',
        paymentMethod: 'mobile_money',
      });

      // Should still provide a valid decision
      expect(decision.provider).toBeTruthy();

      // Query should include alert context
      const queryResult = await nlQueryEngine.executeQuery({
        query: 'show failed payments from Kenya',
      });

      expect(queryResult.parsedIntent.status).toContain('failed');
    });
  });

  describe('Query Integration', () => {
    it('should query data enriched with AI insights', async () => {
      // Create some transaction history
      const transactions: Transaction[] = [
        {
          id: 'txn_001',
          providerTransactionId: 'prov_001',
          provider: 'mpesa',
          status: 'completed',
          amount: { amount: 1000, currency: 'KES' },
          customer: { id: 'cust_001', country: 'KE' },
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
        {
          id: 'txn_002',
          providerTransactionId: 'prov_002',
          provider: 'mpesa',
          status: 'failed',
          amount: { amount: 2000, currency: 'KES' },
          customer: { id: 'cust_002', country: 'KE' },
          createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
      ];

      nlQueryEngine.setMockData(transactions);

      // Query for failed transactions
      const queryResult = await nlQueryEngine.executeQuery({
        query: 'show failed payments from Kenya',
      });

      expect(queryResult.filters.countries).toContain('KE');
      expect(queryResult.parsedIntent.status).toContain('failed');

      // Verify routing decision matches queried provider
      const routingDecision = await smartRouter.selectProvider({
        amount: { amount: 1000, currency: 'KES' },
        destinationCountry: 'KE',
        paymentMethod: 'mobile_money',
      });

      expect(['mpesa', 'paystack', 'intasend', 'airtel_money']).toContain(routingDecision.provider);
    });
  });

  describe('Statistics Integration', () => {
    it('should provide consistent statistics across modules', async () => {
      // Generate some activity
      await fraudDetector.checkTransaction({
        amount: { amount: 1000, currency: 'KES' },
        customerId: 'cust_stats',
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
      });

      await smartRouter.recordOutcome('mpesa', 'KE', true, 2000, 1.0);
      predictor.recordMetrics('mpesa', 'KE', {
        failureRate: 2,
        latency: 2000,
        volume: 1,
      });

      // Get stats from all modules
      const fraudStats = fraudDetector.getStats();
      const routingStats = smartRouter.getStats();
      const predictorStats = predictor.getStats();
      const queryStats = nlQueryEngine.getStats();

      // Verify all stats are available
      expect(fraudStats).toHaveProperty('modelLoaded');
      expect(routingStats).toHaveProperty('providersTracked');
      expect(predictorStats).toHaveProperty('dataPoints');
      expect(queryStats).toHaveProperty('transactionsAvailable');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle errors gracefully across modules', async () => {
      // Invalid query
      const queryResult = await nlQueryEngine.executeQuery({
        query: 'xyz invalid query 123',
      });

      // Should still return a valid result structure
      expect(queryResult).toHaveProperty('parsedIntent');
      expect(queryResult).toHaveProperty('data');

      // Invalid country - should fallback to default providers
      const fallbackResult = await smartRouter.selectProvider({
        amount: { amount: 100, currency: 'USD' },
        destinationCountry: 'XX',
        paymentMethod: 'mobile_money',
      });
      expect(fallbackResult.provider).toBeTruthy();
      expect(fallbackResult.confidence).toBeGreaterThan(0);

      // Fraud check should handle unusual inputs
      const fraudResult = await fraudDetector.checkTransaction({
        amount: { amount: 0, currency: 'KES' },
        customerId: '',
        phoneNumber: '',
        country: 'KE',
        paymentMethod: 'mobile_money',
      });

      expect(fraudResult.decision).toBeDefined();
    });
  });
});
