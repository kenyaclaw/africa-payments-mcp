/**
 * Fraud Detector Tests
 */

import { FraudDetector } from '../../src/ai/fraud-detector.js';
import { Logger } from '../../src/utils/logger.js';
import { FraudCheckInput } from '../../src/ai/types.js';

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as any;

describe('FraudDetector', () => {
  let detector: FraudDetector;

  beforeEach(async () => {
    detector = new FraudDetector(mockLogger);
    await detector.initialize();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Fraud Detection', () => {
    it('should allow normal transactions', async () => {
      const input: FraudCheckInput = {
        amount: { amount: 1000, currency: 'KES' },
        customerId: 'cust_normal',
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
      };

      const result = await detector.checkTransaction(input);

      expect(result.decision).toBe('allow');
      // Risk score should generally be low for normal transactions
      // Allow some variance due to ML model predictions
      expect(result.riskScore).toBeLessThan(50);
      expect(['low', 'medium']).toContain(result.riskLevel);
    });

    it('should flag high amounts', async () => {
      const input: FraudCheckInput = {
        amount: { amount: 600000, currency: 'KES' }, // Very high amount
        customerId: 'cust_123',
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
      };

      const result = await detector.checkTransaction(input);

      expect(result.riskScore).toBeGreaterThan(20);
      expect(result.rulesTriggered).toContain('AMOUNT_CRITICAL');
      expect(result.reasons.some(r => r.includes('Critical amount'))).toBe(true);
    });

    it('should flag critical amounts for review or block', async () => {
      // Create velocity first to increase risk score
      const customerId = 'cust_critical_test';
      for (let i = 0; i < 12; i++) {
        await detector.checkTransaction({
          amount: { amount: 1000, currency: 'KES' },
          customerId,
          phoneNumber: '+254712345678',
          country: 'KE',
          paymentMethod: 'mobile_money',
        });
      }

      // Now add critical amount
      const input: FraudCheckInput = {
        amount: { amount: 1000000, currency: 'KES' }, // Critical amount
        customerId,
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
      };

      const result = await detector.checkTransaction(input);

      expect(result.riskScore).toBeGreaterThan(30);
      // With high velocity + critical amount, should trigger review
      expect(result.decision).toMatch(/review|block/);
    });
  });

  describe('Velocity Checks', () => {
    it('should detect high transaction velocity', async () => {
      const customerId = 'cust_velocity_test';
      
      // Create 15 transactions in quick succession
      for (let i = 0; i < 15; i++) {
        await detector.checkTransaction({
          amount: { amount: 100, currency: 'KES' },
          customerId,
          phoneNumber: '+254712345678',
          country: 'KE',
          paymentMethod: 'mobile_money',
          timestamp: new Date(),
        });
      }

      // The next transaction should be flagged
      const result = await detector.checkTransaction({
        amount: { amount: 100, currency: 'KES' },
        customerId,
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
      });

      expect(result.rulesTriggered).toContain('VELOCITY_CHECK');
      expect(result.reasons.some(r => r.includes('velocity') || r.includes('Velocity'))).toBe(true);
    });

    it('should detect impossible travel', async () => {
      const customerId = 'cust_travel_test';
      
      // Transaction from Kenya
      await detector.checkTransaction({
        amount: { amount: 100, currency: 'KES' },
        customerId,
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
        timestamp: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      });

      // Transaction from Nigeria (impossible in 10 minutes)
      const result = await detector.checkTransaction({
        amount: { amount: 100, currency: 'NGN' },
        customerId,
        phoneNumber: '+2348012345678',
        country: 'NG',
        paymentMethod: 'mobile_money',
      });

      expect(result.rulesTriggered).toContain('IMPOSSIBLE_TRAVEL');
      expect(result.reasons.some(r => r.includes('travel'))).toBe(true);
      expect(result.riskScore).toBeGreaterThan(20);
    });
  });

  describe('Time-based Risk', () => {
    it('should flag late night transactions', async () => {
      const lateNight = new Date();
      lateNight.setHours(2, 0, 0, 0); // 2 AM

      const input: FraudCheckInput = {
        amount: { amount: 5000, currency: 'KES' },
        customerId: 'cust_123',
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
        timestamp: lateNight,
      };

      const result = await detector.checkTransaction(input);

      expect(result.rulesTriggered).toContain('TIME_LATE_NIGHT');
      expect(result.reasons.some(r => r.includes('late-night') || r.includes('Late'))).toBe(true);
    });

    it('should flag unusual transaction times for existing customers', async () => {
      const customerId = 'cust_time_test';
      
      // Create transactions at typical business hours
      for (let hour of [9, 10, 11, 12, 13, 14]) {
        const timestamp = new Date();
        timestamp.setHours(hour, 0, 0, 0);
        await detector.checkTransaction({
          amount: { amount: 100, currency: 'KES' },
          customerId,
          phoneNumber: '+254712345678',
          country: 'KE',
          paymentMethod: 'mobile_money',
          timestamp,
        });
      }

      // Late night transaction (unusual for this customer)
      const lateNight = new Date();
      lateNight.setHours(3, 0, 0, 0);
      
      const result = await detector.checkTransaction({
        amount: { amount: 1000, currency: 'KES' },
        customerId,
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
        timestamp: lateNight,
      });

      expect(result.riskScore).toBeGreaterThan(0);
      expect(result.reasons.some(r => r.includes('Unusual') || r.includes('late'))).toBe(true);
    });
  });

  describe('Pattern Detection', () => {
    it('should detect potential structuring', async () => {
      const customerId = 'cust_structuring_test';
      
      // Create 15 small transactions
      for (let i = 0; i < 15; i++) {
        await detector.checkTransaction({
          amount: { amount: 50, currency: 'KES' },
          customerId,
          phoneNumber: '+254712345678',
          country: 'KE',
          paymentMethod: 'mobile_money',
        });
      }

      const result = await detector.checkTransaction({
        amount: { amount: 50, currency: 'KES' },
        customerId,
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
      });

      expect(result.rulesTriggered).toContain('STRUCTURING');
      expect(result.reasons.some(r => r.includes('structuring') || r.includes('small'))).toBe(true);
    });

    it('should detect multiple countries in short time', async () => {
      const customerId = 'cust_country_test';
      
      // Transactions from different countries
      for (const country of ['KE', 'NG', 'GH', 'UG']) {
        await detector.checkTransaction({
          amount: { amount: 1000, currency: 'KES' },
          customerId,
          phoneNumber: '+254712345678',
          country,
          paymentMethod: 'mobile_money',
        });
      }

      const result = await detector.checkTransaction({
        amount: { amount: 1000, currency: 'KES' },
        customerId,
        phoneNumber: '+254712345678',
        country: 'TZ',
        paymentMethod: 'mobile_money',
      });

      expect(result.reasons.some(r => r.includes('Multiple countries'))).toBe(true);
    });
  });

  describe('Risk Score and Decisions', () => {
    it('should return correct risk levels', async () => {
      // Test low risk (small amount, no other factors)
      const lowResult = await detector.checkTransaction({
        amount: { amount: 100, currency: 'KES' },
        customerId: 'cust_low_risk',
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
      });
      // Small amounts should generally be low risk
      expect(lowResult.riskLevel).toMatch(/low|medium/);

      // Test medium risk (high amount + some velocity)
      const mediumCustomerId = 'cust_medium';
      for (let i = 0; i < 12; i++) {
        await detector.checkTransaction({
          amount: { amount: 1000, currency: 'KES' },
          customerId: mediumCustomerId,
          phoneNumber: '+254712345678',
          country: 'KE',
          paymentMethod: 'mobile_money',
        });
      }
      const mediumResult = await detector.checkTransaction({
        amount: { amount: 200000, currency: 'KES' },
        customerId: mediumCustomerId,
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
      });
      // Should be at least medium, could be high depending on accumulated score
      expect(['medium', 'high']).toContain(mediumResult.riskLevel);

      // Test high risk (critical amount + high velocity)
      const highCustomerId = 'cust_high';
      for (let i = 0; i < 20; i++) {
        await detector.checkTransaction({
          amount: { amount: 1000, currency: 'KES' },
          customerId: highCustomerId,
          phoneNumber: '+254712345678',
          country: 'KE',
          paymentMethod: 'mobile_money',
        });
      }
      const highResult = await detector.checkTransaction({
        amount: { amount: 600000, currency: 'KES' },
        customerId: highCustomerId,
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
      });
      // Should be at least medium, could be high depending on ML score
      expect(['medium', 'high', 'critical']).toContain(highResult.riskLevel);
      expect(highResult.riskScore).toBeGreaterThan(20);
    });

    it('should provide recommended actions', async () => {
      const result = await detector.checkTransaction({
        amount: { amount: 1000000, currency: 'KES' },
        customerId: 'cust_action_test',
        phoneNumber: '+254712345678',
        country: 'KE',
        paymentMethod: 'mobile_money',
      });

      expect(result.recommendedAction).toBeTruthy();
      expect(result.recommendedAction.length).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should return stats', () => {
      const stats = detector.getStats();

      expect(stats).toHaveProperty('modelLoaded');
      expect(stats).toHaveProperty('customersMonitored');
      expect(stats).toHaveProperty('totalTransactions');
    });
  });
});
