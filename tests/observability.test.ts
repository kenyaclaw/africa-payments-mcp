/**
 * Observability Tests
 * 
 * Tests for health check, metrics, circuit breaker, and idempotency features
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WebhookServer, createWebhookServer } from '../src/webhook/server.js';
import { MetricsCollector } from '../src/utils/metrics.js';
import { CircuitBreaker, CircuitBreakerRegistry } from '../src/utils/circuit-breaker.js';
import { IdempotencyStore, TransactionIdCache } from '../src/utils/idempotency.js';
import { HealthMonitor, createHttpHealthCheck } from '../src/utils/health-check.js';
import { StructuredLogger } from '../src/utils/structured-logger.js';

describe('Observability Features', () => {
  describe('Health Check Endpoint', () => {
    let server: WebhookServer;
    const testPort = 18080;

    beforeEach(async () => {
      server = createWebhookServer({
        port: testPort,
        criticalProviders: ['mpesa'],
      });
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it('should return 200 for healthy status', async () => {
      const response = await fetch(`http://localhost:${testPort}/health`);
      
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.status).toBeDefined();
      expect(body.timestamp).toBeDefined();
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.version).toBeDefined();
      expect(Array.isArray(body.providers)).toBe(true);
      expect(body.summary).toBeDefined();
    });

    it('should include provider health status', async () => {
      const response = await fetch(`http://localhost:${testPort}/health`);
      const body = await response.json();
      
      expect(body.providers.length).toBeGreaterThan(0);
      
      for (const provider of body.providers) {
        expect(provider.name).toBeDefined();
        expect(provider.status).toMatch(/^(healthy|degraded|unhealthy|unknown)$/);
        expect(provider.lastChecked).toBeDefined();
      }
    });

    it('should include summary counts', async () => {
      const response = await fetch(`http://localhost:${testPort}/health`);
      const body = await response.json();
      
      expect(body.summary.total).toBeGreaterThanOrEqual(0);
      expect(body.summary.healthy).toBeGreaterThanOrEqual(0);
      expect(body.summary.degraded).toBeGreaterThanOrEqual(0);
      expect(body.summary.unhealthy).toBeGreaterThanOrEqual(0);
      expect(body.summary.total).toBe(
        body.summary.healthy + body.summary.degraded + body.summary.unhealthy
      );
    });

    it('should return JSON content type', async () => {
      const response = await fetch(`http://localhost:${testPort}/health`);
      
      expect(response.headers.get('content-type')).toContain('application/json');
    });

    it('should respond to /healthz as well', async () => {
      const response = await fetch(`http://localhost:${testPort}/healthz`);
      
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.status).toBeDefined();
    });
  });

  describe('Metrics Endpoint', () => {
    let server: WebhookServer;
    const testPort = 18081;

    beforeEach(async () => {
      server = createWebhookServer({
        port: testPort,
      });
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it('should return Prometheus formatted metrics', async () => {
      const response = await fetch(`http://localhost:${testPort}/metrics`);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      
      const body = await response.text();
      expect(body).toContain('# HELP');
      expect(body).toContain('# TYPE');
    });

    it('should include default Node.js metrics', async () => {
      const response = await fetch(`http://localhost:${testPort}/metrics`);
      const body = await response.text();
      
      // Check for some default metrics
      expect(body).toContain('process_');
      expect(body).toContain('nodejs_');
    });

    it('should include payment-specific metrics', async () => {
      const response = await fetch(`http://localhost:${testPort}/metrics`);
      const body = await response.text();
      
      expect(body).toContain('payment_');
    });
  });

  describe('Circuit Breaker Reset Endpoint', () => {
    let server: WebhookServer;
    const testPort = 18082;

    beforeEach(async () => {
      server = createWebhookServer({
        port: testPort,
      });
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it('should reset circuit breaker for valid provider', async () => {
      // First trip the circuit breaker
      const { circuitBreakers } = server.getObservability();
      circuitBreakers.trip('mpesa');
      
      expect(circuitBreakers.getStatus('mpesa')?.state).toBe('OPEN');

      // Reset via endpoint
      const response = await fetch(`http://localhost:${testPort}/circuit-breaker/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'mpesa' }),
      });

      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.provider).toBe('mpesa');
      
      expect(circuitBreakers.getStatus('mpesa')?.state).toBe('CLOSED');
    });

    it('should return 400 for missing provider', async () => {
      const response = await fetch(`http://localhost:${testPort}/circuit-breaker/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });

    it('should return 404 for unknown provider', async () => {
      const response = await fetch(`http://localhost:${testPort}/circuit-breaker/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'unknown-provider' }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Metrics Collector', () => {
    let metrics: MetricsCollector;

    beforeEach(() => {
      metrics = new MetricsCollector({ collectDefaultMetrics: false });
    });

    afterEach(() => {
      metrics.reset();
    });

    it('should record request metrics', async () => {
      metrics.recordRequest({
        provider: 'mpesa',
        method: 'sendMoney',
        status: 'success',
        duration: 1500,
        requestSize: 1000,
        responseSize: 500,
      });

      const output = await metrics.getMetrics();
      expect(output).toContain('payment_requests_total');
      expect(output).toContain('provider="mpesa"');
      expect(output).toContain('method="sendMoney"');
      expect(output).toContain('status="success"');
    });

    it('should record error metrics', async () => {
      metrics.recordError('paystack', 'timeout', 'TIMEOUT_ERROR');

      const output = await metrics.getMetrics();
      expect(output).toContain('payment_errors_total');
      expect(output).toContain('provider="paystack"');
      expect(output).toContain('error_type="timeout"');
    });

    it('should record transaction metrics', async () => {
      metrics.recordTransaction({
        provider: 'mpesa',
        status: 'completed',
        currency: 'KES',
        amount: 1000,
      });

      const output = await metrics.getMetrics();
      expect(output).toContain('payment_transactions_total');
      expect(output).toContain('currency="KES"');
    });

    it('should record webhook metrics', async () => {
      metrics.recordWebhook({
        provider: 'paystack',
        eventType: 'charge.success',
        status: 'success',
        duration: 50,
      });

      const output = await metrics.getMetrics();
      expect(output).toContain('payment_webhooks_total');
      expect(output).toContain('event_type="charge.success"');
    });

    it('should track active connections', async () => {
      metrics.incrementConnections();
      metrics.incrementConnections();
      
      let output = await metrics.getMetrics();
      expect(output).toContain('payment_active_connections');
      expect(output).toMatch(/payment_active_connections\s+2/);

      metrics.decrementConnections();
      
      output = await metrics.getMetrics();
      expect(output).toMatch(/payment_active_connections\s+1/);
    });

    it('should set provider health status', async () => {
      metrics.setProviderHealth('mpesa', true);
      metrics.setProviderHealth('paystack', false);

      const output = await metrics.getMetrics();
      expect(output).toContain('payment_provider_health');
      expect(output).toContain('provider="mpesa"');
      expect(output).toContain('provider="paystack"');
    });

    it('should set circuit breaker state', async () => {
      metrics.setCircuitBreakerState('mpesa', 1); // OPEN
      metrics.setCircuitBreakerState('paystack', 0.5); // HALF_OPEN

      const output = await metrics.getMetrics();
      expect(output).toContain('payment_provider_circuit_breaker');
    });
  });

  describe('Circuit Breaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      breaker = new CircuitBreaker('test-provider', {
        failureThreshold: 3,
        resetTimeoutMs: 100,
        successThreshold: 2,
      });
    });

    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.canExecute()).toBe(true);
    });

    it('should open after threshold failures', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('CLOSED');
      
      breaker.recordFailure();
      expect(breaker.getState()).toBe('OPEN');
      expect(breaker.canExecute()).toBe(false);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('OPEN');

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should allow execution and transition to HALF_OPEN
      expect(breaker.canExecute()).toBe(true);
      expect(breaker.getState()).toBe('HALF_OPEN');
    });

    it('should close after success threshold in HALF_OPEN', async () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      
      await new Promise(resolve => setTimeout(resolve, 150));
      breaker.canExecute(); // Transition to HALF_OPEN
      
      breaker.recordSuccess();
      breaker.recordSuccess();
      
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should reopen on failure in HALF_OPEN', async () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      
      await new Promise(resolve => setTimeout(resolve, 150));
      breaker.canExecute();
      
      breaker.recordFailure();
      expect(breaker.getState()).toBe('OPEN');
    });

    it('should allow manual reset', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('OPEN');

      breaker.reset();
      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.canExecute()).toBe(true);
    });

    it('should allow manual trip', () => {
      expect(breaker.getState()).toBe('CLOSED');
      
      breaker.trip();
      expect(breaker.getState()).toBe('OPEN');
    });

    it('should provide status information', () => {
      const status = breaker.getStatus();
      
      expect(status.provider).toBe('test-provider');
      expect(status.state).toBe('CLOSED');
      expect(status.healthy).toBe(true);
      expect(status.metrics).toBeDefined();
    });

    it('should emit state change events', () => {
      const stateChanges: string[] = [];
      breaker.on('state_change', (data) => {
        stateChanges.push(`${data.from}->${data.to}`);
      });

      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      expect(stateChanges).toContain('CLOSED->OPEN');
    });
  });

  describe('Circuit Breaker Registry', () => {
    let registry: CircuitBreakerRegistry;

    beforeEach(() => {
      registry = new CircuitBreakerRegistry();
    });

    it('should register providers', () => {
      const breaker = registry.register('mpesa');
      
      expect(breaker).toBeDefined();
      expect(registry.get('mpesa')).toBe(breaker);
    });

    it('should return same breaker for duplicate registration', () => {
      const breaker1 = registry.register('mpesa');
      const breaker2 = registry.register('mpesa');
      
      expect(breaker1).toBe(breaker2);
    });

    it('should track all providers', () => {
      registry.register('mpesa');
      registry.register('paystack');
      
      expect(registry.getProviders()).toContain('mpesa');
      expect(registry.getProviders()).toContain('paystack');
    });

    it('should reset provider circuit breaker', () => {
      registry.register('mpesa');
      registry.trip('mpesa');
      
      expect(registry.getStatus('mpesa')?.state).toBe('OPEN');
      
      registry.reset('mpesa');
      expect(registry.getStatus('mpesa')?.state).toBe('CLOSED');
    });

    it('should return false for reset on unknown provider', () => {
      const result = registry.reset('unknown');
      expect(result).toBe(false);
    });
  });

  describe('Idempotency Store', () => {
    let store: IdempotencyStore;

    beforeEach(() => {
      store = new IdempotencyStore({ defaultTtlMs: 1000, maxEntries: 100 });
    });

    afterEach(() => {
      store.dispose();
    });

    it('should store and retrieve responses', () => {
      const key = 'test-key-1';
      const request = { method: 'sendMoney', params: { amount: 100 } };
      const response = { status: 'success' as const, data: { id: 'txn-1' } };

      store.store(key, request, response);
      
      const result = store.check(key);
      expect(result.isDuplicate).toBe(true);
      expect(result.response).toEqual(response.data);
    });

    it('should return not duplicate for unknown keys', () => {
      const result = store.check('unknown-key');
      expect(result.isDuplicate).toBe(false);
    });

    it('should update existing entries', () => {
      const key = 'test-key-2';
      store.store(key, { method: 'sendMoney', params: {} }, { status: 'pending', data: {} });
      
      store.update(key, { status: 'success', data: { id: 'txn-2' } });
      
      const result = store.check(key);
      expect(result.response).toEqual({ id: 'txn-2' });
    });

    it('should expire entries after TTL', async () => {
      const key = 'test-key-3';
      store.store(key, { method: 'sendMoney', params: {} }, { status: 'success', data: {} }, 50);
      
      expect(store.check(key).isDuplicate).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(store.check(key).isDuplicate).toBe(false);
    });

    it('should delete entries', () => {
      const key = 'test-key-4';
      store.store(key, { method: 'sendMoney', params: {} }, { status: 'success', data: {} });
      
      expect(store.check(key).isDuplicate).toBe(true);
      
      store.delete(key);
      
      expect(store.check(key).isDuplicate).toBe(false);
    });

    it('should provide statistics', () => {
      store.store('key1', { method: 'sendMoney', params: {} }, { status: 'success', data: {} });
      store.store('key2', { method: 'sendMoney', params: {} }, { status: 'error', data: {} });
      store.store('key3', { method: 'sendMoney', params: {} }, { status: 'pending', data: {} });

      const stats = store.getStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.successCount).toBe(1);
      expect(stats.errorCount).toBe(1);
      expect(stats.pendingCount).toBe(1);
    });

    it('should generate consistent keys', () => {
      const params = {
        provider: 'mpesa',
        operation: 'sendMoney',
        amount: 1000,
        currency: 'KES',
        recipient: '254712345678',
      };

      const key1 = IdempotencyStore.generateKey(params);
      const key2 = IdempotencyStore.generateKey(params);
      
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^idemp_/);
    });

    it('should emit events', () => {
      const events: string[] = [];
      store.on('stored', () => events.push('stored'));
      store.on('deleted', () => events.push('deleted'));

      store.store('key', { method: 'test', params: {} }, { status: 'success', data: {} });
      store.delete('key');

      expect(events).toContain('stored');
      expect(events).toContain('deleted');
    });
  });

  describe('Transaction ID Cache', () => {
    let cache: TransactionIdCache;

    beforeEach(() => {
      cache = new TransactionIdCache(100, 500);
    });

    it('should track processed transaction IDs', () => {
      expect(cache.has('txn-1')).toBe(false);
      
      cache.add('txn-1');
      
      expect(cache.has('txn-1')).toBe(true);
    });

    it('should return false for duplicate adds', () => {
      expect(cache.add('txn-1')).toBe(true);
      expect(cache.add('txn-1')).toBe(false);
    });

    it('should return correct size', () => {
      cache.add('txn-1');
      cache.add('txn-2');
      
      expect(cache.size()).toBe(2);
    });

    it('should expire old entries', async () => {
      cache.add('txn-1');
      
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Access triggers cleanup
      expect(cache.size()).toBe(0);
    });

    it('should clear all entries', () => {
      cache.add('txn-1');
      cache.add('txn-2');
      
      cache.clear();
      
      expect(cache.size()).toBe(0);
      expect(cache.has('txn-1')).toBe(false);
    });
  });

  describe('Health Monitor', () => {
    let monitor: HealthMonitor;

    beforeEach(() => {
      monitor = new HealthMonitor({ checkIntervalMs: 1000, criticalProviders: ['mpesa'] }, '1.0.0');
    });

    afterEach(() => {
      monitor.dispose();
    });

    it('should start as healthy with no providers', () => {
      const result = monitor.getHealthResult();
      expect(result.status).toBe('healthy');
    });

    it('should register health check functions', () => {
      const checkFn = jest.fn().mockResolvedValue({ healthy: true });
      
      monitor.registerProvider('test', checkFn);
      
      expect(monitor.getProviderHealth('test')).toBeDefined();
    });

    it('should return 200 for healthy status', () => {
      expect(monitor.getHttpStatusCode()).toBe(200);
    });

    it('should be healthy initially', () => {
      expect(monitor.isHealthy()).toBe(true);
    });

    it('should track uptime', () => {
      const result = monitor.getHealthResult();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include version in result', () => {
      const result = monitor.getHealthResult();
      expect(result.version).toBe('1.0.0');
    });
  });

  describe('Structured Logger', () => {
    it('should create child loggers with context', () => {
      const logger = new StructuredLogger({ level: 'debug' });
      const child = logger.child({ correlationId: 'test-123', provider: 'mpesa' });

      expect(child).toBeDefined();
      expect(child.getCorrelationId()).toBe('test-123');
    });

    it('should set and get correlation ID', () => {
      const logger = new StructuredLogger();
      
      logger.setCorrelationId('corr-123');
      
      expect(logger.getCorrelationId()).toBe('corr-123');
    });

    it('should generate correlation IDs', () => {
      const id1 = StructuredLogger.generateCorrelationId();
      const id2 = StructuredLogger.generateCorrelationId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should maintain backwards compatibility with Logger', () => {
      const { Logger } = require('../src/utils/logger.js');
      const logger = new Logger('info');
      
      expect(() => {
        logger.info('test message');
        logger.warn('warning message');
        logger.error('error message');
        logger.debug('debug message');
      }).not.toThrow();
    });
  });
});
