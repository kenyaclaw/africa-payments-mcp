/**
 * Transaction Simulation Mode Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SimulationMode, getSimulationMode, setSimulationMode, resetSimulationMode } from '../../src/utils/simulation.js';
import { Logger } from '../../src/utils/logger.js';

describe('SimulationMode', () => {
  let logger: Logger;
  let simulationMode: SimulationMode;

  beforeEach(() => {
    logger = new Logger('error');
    // Clear environment variable
    delete process.env.SIMULATION_MODE;
    resetSimulationMode();
  });

  afterEach(() => {
    delete process.env.SIMULATION_MODE;
    resetSimulationMode();
  });

  describe('initialization', () => {
    it('should be disabled by default', () => {
      simulationMode = new SimulationMode({}, logger);
      expect(simulationMode.isEnabled()).toBe(false);
    });

    it('should be enabled when SIMULATION_MODE env var is true', () => {
      process.env.SIMULATION_MODE = 'true';
      simulationMode = new SimulationMode({}, logger);
      expect(simulationMode.isEnabled()).toBe(true);
    });

    it('should be enabled when SIMULATION_MODE env var is 1', () => {
      process.env.SIMULATION_MODE = '1';
      simulationMode = new SimulationMode({}, logger);
      expect(simulationMode.isEnabled()).toBe(true);
    });

    it('should respect explicit enabled config over env var', () => {
      process.env.SIMULATION_MODE = 'true';
      simulationMode = new SimulationMode({ enabled: false }, logger);
      expect(simulationMode.isEnabled()).toBe(false);
    });

    it('should use provided config values', () => {
      simulationMode = new SimulationMode({
        enabled: true,
        delayMs: 100,
        successRate: 0.8,
        failureMode: 'never',
      }, logger);

      expect(simulationMode.isEnabled()).toBe(true);
    });
  });

  describe('simulateSendMoney', () => {
    beforeEach(() => {
      simulationMode = new SimulationMode({ enabled: true, delayMs: 0 }, logger);
    });

    it('should create a simulated transaction', async () => {
      const params = {
        recipient: {
          phone: { formatted: '+254712345678', countryCode: '254', nationalNumber: '712345678' },
          name: 'John Doe',
        },
        amount: { amount: 5000, currency: 'KES' },
        description: 'Test payment',
      };

      const transaction = await simulationMode.simulateSendMoney('mpesa', params);

      expect(transaction.id).toMatch(/^sim_/);
      expect(transaction.provider).toBe('mpesa');
      expect(transaction.amount.amount).toBe(5000);
      expect(transaction.amount.currency).toBe('KES');
      expect(transaction.metadata?.simulated).toBe(true);
    });

    it('should return different statuses based on success rate', async () => {
      // Test with always success
      const alwaysSuccess = new SimulationMode(
        { enabled: true, delayMs: 0, failureMode: 'never' },
        logger
      );

      const successTx = await alwaysSuccess.simulateSendMoney('mpesa', {
        recipient: {},
        amount: { amount: 1000, currency: 'KES' },
      });

      expect(successTx.status).toBe('completed');
      expect(successTx.completedAt).toBeDefined();
    });

    it('should return failed status when failureMode is always', async () => {
      const alwaysFail = new SimulationMode(
        { enabled: true, delayMs: 0, failureMode: 'always' },
        logger
      );

      const failTx = await alwaysFail.simulateSendMoney('mpesa', {
        recipient: {},
        amount: { amount: 1000, currency: 'KES' },
      });

      expect(failTx.status).toBe('failed');
    });

    it('should store simulated transactions', async () => {
      const tx1 = await simulationMode.simulateSendMoney('mpesa', {
        recipient: {},
        amount: { amount: 1000, currency: 'KES' },
      });

      const transactions = simulationMode.getSimulatedTransactions();
      expect(transactions).toHaveLength(1);
      expect(transactions[0].id).toBe(tx1.id);
    });
  });

  describe('simulateRequestPayment', () => {
    beforeEach(() => {
      simulationMode = new SimulationMode({ enabled: true, delayMs: 0 }, logger);
    });

    it('should create a simulated payment request', async () => {
      const params = {
        customer: {
          phone: { formatted: '+254712345678', countryCode: '254', nationalNumber: '712345678' },
          name: 'John Doe',
        },
        amount: { amount: 5000, currency: 'KES' },
        description: 'Test request',
        expiryMinutes: 60,
      };

      const transaction = await simulationMode.simulateRequestPayment('mpesa', params);

      expect(transaction.id).toMatch(/^sim_req_/);
      expect(transaction.status).toBe('pending');
      expect(transaction.metadata?.expiresAt).toBeDefined();
    });
  });

  describe('simulateVerifyTransaction', () => {
    beforeEach(() => {
      simulationMode = new SimulationMode({ enabled: true, delayMs: 0 }, logger);
    });

    it('should return existing transaction if found', async () => {
      const tx = await simulationMode.simulateSendMoney('mpesa', {
        recipient: {},
        amount: { amount: 1000, currency: 'KES' },
      });

      const verified = await simulationMode.simulateVerifyTransaction('mpesa', tx.id);
      expect(verified.id).toBe(tx.id);
    });

    it('should return mock transaction if not found', async () => {
      const verified = await simulationMode.simulateVerifyTransaction('mpesa', 'unknown_id');
      expect(verified.id).toBe('unknown_id');
      expect(verified.status).toBe('completed');
    });
  });

  describe('simulateRefund', () => {
    beforeEach(() => {
      simulationMode = new SimulationMode({ enabled: true, delayMs: 0 }, logger);
    });

    it('should create a simulated refund', async () => {
      const params = {
        originalTransactionId: 'sim_12345',
        amount: { amount: 500, currency: 'KES' },
        reason: 'Customer request',
      };

      const transaction = await simulationMode.simulateRefund('mpesa', params);

      expect(transaction.id).toMatch(/^sim_refund_/);
      expect(transaction.status).toBe('completed');
      expect(transaction.metadata?.originalTransactionId).toBe('sim_12345');
      expect(transaction.metadata?.reason).toBe('Customer request');
    });

    it('should handle full refund without amount', async () => {
      const params = {
        originalTransactionId: 'sim_12345',
        reason: 'Full refund',
      };

      const transaction = await simulationMode.simulateRefund('mpesa', params);

      expect(transaction.refundId).toBeDefined();
    });
  });

  describe('simulateGetBalance', () => {
    beforeEach(() => {
      simulationMode = new SimulationMode({ enabled: true, delayMs: 0 }, logger);
    });

    it('should return mock balance for known providers', async () => {
      const mpesaBalance = await simulationMode.simulateGetBalance('mpesa');
      expect(mpesaBalance.currency).toBe('KES');
      expect(mpesaBalance.amount).toBeGreaterThan(0);

      const paystackBalance = await simulationMode.simulateGetBalance('paystack');
      expect(paystackBalance.currency).toBe('NGN');
    });

    it('should return zero balance for unknown providers', async () => {
      const balance = await simulationMode.simulateGetBalance('unknown');
      expect(balance.amount).toBe(0);
    });
  });

  describe('formatSimulationMessage', () => {
    beforeEach(() => {
      simulationMode = new SimulationMode({ enabled: true }, logger);
    });

    it('should format simulation message with details', () => {
      const message = simulationMode.formatSimulationMessage('sendMoney', {
        Provider: 'mpesa',
        To: '+254712345678',
        Amount: '5000 KES',
      });

      expect(message).toContain('SIMULATION MODE');
      expect(message).toContain('sendMoney');
      expect(message).toContain('mpesa');
      expect(message).toContain('+254712345678');
      expect(message).toContain('5000 KES');
      expect(message).toContain('SIMULATION_MODE=false');
    });
  });

  describe('clearTransactions', () => {
    beforeEach(() => {
      simulationMode = new SimulationMode({ enabled: true, delayMs: 0 }, logger);
    });

    it('should clear all simulated transactions', async () => {
      await simulationMode.simulateSendMoney('mpesa', {
        recipient: {},
        amount: { amount: 1000, currency: 'KES' },
      });

      expect(simulationMode.getSimulatedTransactions()).toHaveLength(1);

      simulationMode.clearTransactions();

      expect(simulationMode.getSimulatedTransactions()).toHaveLength(0);
    });
  });

  describe('singleton helpers', () => {
    it('getSimulationMode should return singleton instance', () => {
      const mode1 = getSimulationMode(logger);
      const mode2 = getSimulationMode(logger);
      expect(mode1).toBe(mode2);
    });

    it('setSimulationMode should create new instance', () => {
      const mode1 = getSimulationMode(logger);
      setSimulationMode({ enabled: true }, logger);
      const mode2 = getSimulationMode(logger);
      expect(mode1).not.toBe(mode2);
      expect(mode2.isEnabled()).toBe(true);
    });

    it('resetSimulationMode should clear singleton', () => {
      const mode1 = getSimulationMode(logger);
      resetSimulationMode();
      const mode2 = getSimulationMode(logger);
      expect(mode1).not.toBe(mode2);
    });
  });
});
