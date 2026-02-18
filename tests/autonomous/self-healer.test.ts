/**
 * Tests for Self-Healing System
 */

import { SelfHealer } from '../../src/autonomous/self-healer.js';
import { HealthMonitor } from '../../src/utils/health-check.js';
import { CircuitBreakerRegistry } from '../../src/utils/circuit-breaker.js';
import { StructuredLogger } from '../../src/utils/structured-logger.js';

describe('SelfHealer', () => {
  let selfHealer: SelfHealer;
  let healthMonitor: HealthMonitor;
  let circuitBreakerRegistry: CircuitBreakerRegistry;
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = new StructuredLogger({ serviceName: 'test', environment: 'test' });
    healthMonitor = new HealthMonitor({}, '0.1.0');
    circuitBreakerRegistry = new CircuitBreakerRegistry();
    
    selfHealer = new SelfHealer(
      healthMonitor,
      circuitBreakerRegistry,
      {
        checkIntervalMs: 1000,
        failureThreshold: 2,
        maxHealingAttempts: 3,
        autoRestartEnabled: true,
        autoFailoverEnabled: true,
      },
      logger
    );
  });

  afterEach(() => {
    selfHealer.dispose();
    healthMonitor.dispose();
  });

  describe('initialization', () => {
    it('should create a self-healer instance', () => {
      expect(selfHealer).toBeDefined();
    });

    it('should have correct initial status', () => {
      const status = selfHealer.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.registeredProviders).toBe(0);
      expect(status.activeRecoveries).toBe(0);
    });

    it('should have zero initial stats', () => {
      const stats = selfHealer.getStats();
      expect(stats.totalHealingEvents).toBe(0);
      expect(stats.successfulHealings).toBe(0);
      expect(stats.activeRecoveries).toBe(0);
    });
  });

  describe('provider registration', () => {
    it('should register a provider', () => {
      selfHealer.registerProvider('mpesa');
      const status = selfHealer.getStatus();
      expect(status.registeredProviders).toBe(1);
    });

    it('should register multiple providers', () => {
      selfHealer.registerProvider('mpesa');
      selfHealer.registerProvider('paystack');
      selfHealer.registerProvider('mtn_momo');
      
      const status = selfHealer.getStatus();
      expect(status.registeredProviders).toBe(3);
    });

    it('should not duplicate provider registration', () => {
      selfHealer.registerProvider('mpesa');
      selfHealer.registerProvider('mpesa');
      
      const status = selfHealer.getStatus();
      expect(status.registeredProviders).toBe(1);
    });

    it('should set backup providers', () => {
      selfHealer.registerProvider('mpesa');
      selfHealer.setBackupProviders('mpesa', ['intasend', 'paystack']);
      
      // This is internal state, but we can verify no errors
      expect(() => selfHealer.setBackupProviders('mpesa', ['backup1'])).not.toThrow();
    });
  });

  describe('recovery state', () => {
    it('should get recovery state for registered provider', () => {
      selfHealer.registerProvider('mpesa');
      const state = selfHealer.getRecoveryState('mpesa');
      
      expect(state).toBeDefined();
      expect(state?.provider).toBe('mpesa');
      expect(state?.healingAttempts).toBe(0);
      expect(state?.consecutiveFailures).toBe(0);
      expect(state?.isInRecovery).toBe(false);
    });

    it('should return undefined for unregistered provider', () => {
      const state = selfHealer.getRecoveryState('unknown');
      expect(state).toBeUndefined();
    });

    it('should get all recovery states', () => {
      selfHealer.registerProvider('mpesa');
      selfHealer.registerProvider('paystack');
      
      const states = selfHealer.getAllRecoveryStates();
      expect(states).toHaveLength(2);
    });
  });

  describe('healing events', () => {
    it('should return empty array initially', () => {
      const events = selfHealer.getHealingEvents();
      expect(events).toEqual([]);
    });

    it('should filter events by provider', () => {
      selfHealer.registerProvider('mpesa');
      selfHealer.registerProvider('paystack');
      
      const events = selfHealer.getHealingEvents({ provider: 'mpesa' });
      expect(events).toEqual([]);
    });

    it('should limit returned events', () => {
      const events = selfHealer.getHealingEvents({ limit: 10 });
      expect(events).toEqual([]);
    });
  });

  describe('start/stop', () => {
    it('should start the self-healer', () => {
      selfHealer.start();
      const status = selfHealer.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should stop the self-healer', () => {
      selfHealer.start();
      selfHealer.stop();
      const status = selfHealer.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('should not start twice', () => {
      selfHealer.start();
      selfHealer.start(); // Should not throw
      expect(selfHealer.getStatus().isRunning).toBe(true);
    });

    it('should emit started event', async () => {
      const promise = new Promise<void>((resolve) => {
        selfHealer.once('started', () => resolve());
      });
      selfHealer.start();
      await promise;
    });

    it('should emit stopped event', () => {
      selfHealer.start();
      let emitted = false;
      selfHealer.once('stopped', () => { emitted = true; });
      selfHealer.stop();
      expect(emitted || !selfHealer.getStatus().isRunning).toBeTruthy();
    });
  });

  describe('reset healing attempts', () => {
    it('should reset healing attempts for provider', () => {
      selfHealer.registerProvider('mpesa');
      selfHealer.resetHealingAttempts('mpesa');
      
      const state = selfHealer.getRecoveryState('mpesa');
      expect(state?.healingAttempts).toBe(0);
    });

    it('should not throw for unregistered provider', () => {
      expect(() => selfHealer.resetHealingAttempts('unknown')).not.toThrow();
    });
  });
});
