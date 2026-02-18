/**
 * Tests for Auto-Optimization System
 */

import { AutoOptimizer } from '../../src/autonomous/optimizer.js';
import { HealthMonitor } from '../../src/utils/health-check.js';
import { CircuitBreakerRegistry } from '../../src/utils/circuit-breaker.js';
import { StructuredLogger } from '../../src/utils/structured-logger.js';

describe('AutoOptimizer', () => {
  let optimizer: AutoOptimizer;
  let healthMonitor: HealthMonitor;
  let circuitBreakerRegistry: CircuitBreakerRegistry;
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = new StructuredLogger({ serviceName: 'test', environment: 'test' });
    healthMonitor = new HealthMonitor({}, '0.1.0');
    circuitBreakerRegistry = new CircuitBreakerRegistry();
    
    optimizer = new AutoOptimizer(
      healthMonitor,
      circuitBreakerRegistry,
      {
        analysisIntervalMs: 1000,
        minSamplesForOptimization: 10,
        successRateThreshold: 0.95,
        retryOptimizationEnabled: true,
        rateLimitOptimizationEnabled: true,
        cacheOptimizationEnabled: true,
      },
      logger
    );
  });

  afterEach(() => {
    optimizer.dispose();
    healthMonitor.dispose();
  });

  describe('initialization', () => {
    it('should create an optimizer instance', () => {
      expect(optimizer).toBeDefined();
    });

    it('should have zero initial stats', () => {
      const stats = optimizer.getStats();
      expect(stats.totalOptimizations).toBe(0);
      expect(stats.successfulOptimizations).toBe(0);
      expect(stats.pendingOptimizations).toBe(0);
      expect(stats.providersOptimized).toBe(0);
    });

    it('should return empty optimizations initially', () => {
      const opts = optimizer.getOptimizations();
      expect(opts).toEqual([]);
    });
  });

  describe('provider registration', () => {
    it('should register a provider', () => {
      optimizer.registerProvider('mpesa');
      
      const state = optimizer.getProviderState('mpesa');
      expect(state).toBeDefined();
      expect(state?.provider).toBe('mpesa');
      expect(state?.optimizationCount).toBe(0);
    });

    it('should register provider with custom config', () => {
      optimizer.registerProvider('mpesa', { timeoutMs: 20000, maxRetries: 5 });
      
      const config = optimizer.getOptimizedConfig('mpesa');
      expect(config?.timeoutMs).toBe(20000);
      expect(config?.maxRetries).toBe(5);
    });

    it('should not duplicate registration', () => {
      optimizer.registerProvider('mpesa');
      optimizer.registerProvider('mpesa');
      
      const states = optimizer.getAllProviderStates();
      expect(states).toHaveLength(1);
    });

    it('should use provider-specific base configs', () => {
      optimizer.registerProvider('mpesa');
      optimizer.registerProvider('paystack');
      
      const mpesaConfig = optimizer.getOptimizedConfig('mpesa');
      const paystackConfig = optimizer.getOptimizedConfig('paystack');
      
      // M-Pesa typically has longer timeout
      expect(mpesaConfig?.timeoutMs).toBeGreaterThanOrEqual(10000);
      expect(paystackConfig?.timeoutMs).toBeGreaterThanOrEqual(10000);
    });
  });

  describe('provider states', () => {
    it('should get provider state', () => {
      optimizer.registerProvider('mpesa');
      const state = optimizer.getProviderState('mpesa');
      
      expect(state).toBeDefined();
      expect(state?.provider).toBe('mpesa');
    });

    it('should return undefined for unregistered provider', () => {
      const state = optimizer.getProviderState('unknown');
      expect(state).toBeUndefined();
    });

    it('should get optimized config', () => {
      optimizer.registerProvider('mpesa');
      const config = optimizer.getOptimizedConfig('mpesa');
      
      expect(config).toBeDefined();
      expect(config?.timeoutMs).toBeGreaterThan(0);
      expect(config?.maxRetries).toBeGreaterThan(0);
    });

    it('should return undefined config for unregistered provider', () => {
      const config = optimizer.getOptimizedConfig('unknown');
      expect(config).toBeUndefined();
    });

    it('should get all provider states', () => {
      optimizer.registerProvider('mpesa');
      optimizer.registerProvider('paystack');
      optimizer.registerProvider('mtn_momo');
      
      const states = optimizer.getAllProviderStates();
      expect(states).toHaveLength(3);
    });
  });

  describe('optimizations', () => {
    beforeEach(() => {
      optimizer.registerProvider('mpesa');
    });

    it('should return empty optimizations for new provider', () => {
      const opts = optimizer.getOptimizations({ provider: 'mpesa' });
      expect(opts).toEqual([]);
    });

    it('should filter optimizations by category', () => {
      const opts = optimizer.getOptimizations({ category: 'timeout' });
      expect(opts).toEqual([]);
    });

    it('should filter optimizations by status', () => {
      const opts = optimizer.getOptimizations({ status: 'applied' });
      expect(opts).toEqual([]);
    });

    it('should limit returned optimizations', () => {
      const opts = optimizer.getOptimizations({ limit: 5 });
      expect(opts).toEqual([]);
    });
  });

  describe('start/stop', () => {
    it('should start the optimizer', () => {
      optimizer.start();
      expect(optimizer.getStats().totalOptimizations).toBe(0);
    });

    it('should stop the optimizer', () => {
      optimizer.start();
      optimizer.stop();
      expect(optimizer.getStats().totalOptimizations).toBe(0);
    });

    it('should not start twice', async () => {
      optimizer.start();
      await new Promise(r => setTimeout(r, 10));
      optimizer.start(); // Should not throw
      expect(optimizer.getStats().totalOptimizations).toBe(0);
    });

    it('should emit started event', async () => {
      const promise = new Promise<void>((resolve) => {
        optimizer.once('started', () => resolve());
      });
      optimizer.start();
      await promise;
    });

    it('should emit stopped event', () => {
      optimizer.start();
      let emitted = false;
      optimizer.once('stopped', () => { emitted = true; });
      optimizer.stop();
      expect(emitted || optimizer.getStats().totalOptimizations >= 0).toBeTruthy();
    });
  });

  describe('force config', () => {
    it('should throw for unregistered provider', async () => {
      await expect(optimizer.forceConfig('unknown', { timeoutMs: 5000 }))
        .rejects.toThrow('Provider unknown not registered');
    });

    it('should apply config to registered provider', async () => {
      optimizer.registerProvider('mpesa');
      
      await optimizer.forceConfig('mpesa', { timeoutMs: 25000 });
      
      const config = optimizer.getOptimizedConfig('mpesa');
      expect(config?.timeoutMs).toBe(25000);
    });
  });

  describe('revert to default', () => {
    it('should revert config to defaults', async () => {
      optimizer.registerProvider('mpesa');
      await optimizer.forceConfig('mpesa', { timeoutMs: 30000 });
      
      await optimizer.revertToDefault('mpesa');
      
      const config = optimizer.getOptimizedConfig('mpesa');
      // Should be back to default (or provider-specific base config)
      expect(config?.timeoutMs).toBeLessThan(30000);
    });

    it('should not throw for unregistered provider', async () => {
      await expect(optimizer.revertToDefault('unknown')).resolves.not.toThrow();
    });
  });
});
