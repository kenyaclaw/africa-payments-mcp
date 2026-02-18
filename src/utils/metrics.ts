/**
 * Prometheus Metrics Module
 * Tracks request counts, latency, error rates, and active connections
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export interface MetricsConfig {
  /** Default labels to add to all metrics */
  defaultLabels?: Record<string, string>;
  /** Collect default Node.js metrics (memory, CPU, etc.) */
  collectDefaultMetrics?: boolean;
}

export class MetricsCollector {
  private registry: Registry;
  
  // Request metrics
  private requestCounter: Counter<'provider' | 'method' | 'status'>;
  private requestDuration: Histogram<'provider' | 'method'>;
  private requestSize: Histogram<'provider'>;
  private responseSize: Histogram<'provider'>;
  
  // Error metrics
  private errorCounter: Counter<'provider' | 'error_type' | 'error_code'>;
  
  // Connection metrics
  private activeConnections: Gauge;
  private totalConnections: Counter;
  
  // Provider health metrics
  private providerHealth: Gauge<'provider'>;
  private providerCircuitBreaker: Gauge<'provider'>;
  
  // Transaction metrics
  private transactionCounter: Counter<'provider' | 'status' | 'currency'>;
  private transactionAmount: Counter<'provider' | 'currency'>;
  
  // Webhook metrics
  private webhookCounter: Counter<'provider' | 'event_type' | 'status'>;
  private webhookLatency: Histogram<'provider'>;

  constructor(config: MetricsConfig = {}) {
    this.registry = new Registry();
    
    // Add default labels
    if (config.defaultLabels) {
      this.registry.setDefaultLabels(config.defaultLabels);
    }
    
    // Collect default Node.js metrics if enabled
    if (config.collectDefaultMetrics !== false) {
      collectDefaultMetrics({ register: this.registry });
    }
    
    // Initialize all metrics
    this.requestCounter = new Counter({
      name: 'payment_requests_total',
      help: 'Total number of payment requests by provider and status',
      labelNames: ['provider', 'method', 'status'],
      registers: [this.registry],
    });
    
    this.requestDuration = new Histogram({
      name: 'payment_request_duration_seconds',
      help: 'Request duration in seconds',
      labelNames: ['provider', 'method'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers: [this.registry],
    });
    
    this.requestSize = new Histogram({
      name: 'payment_request_size_bytes',
      help: 'Request size in bytes',
      labelNames: ['provider'],
      buckets: [100, 1000, 10000, 100000, 1000000],
      registers: [this.registry],
    });
    
    this.responseSize = new Histogram({
      name: 'payment_response_size_bytes',
      help: 'Response size in bytes',
      labelNames: ['provider'],
      buckets: [100, 1000, 10000, 100000, 1000000],
      registers: [this.registry],
    });
    
    this.errorCounter = new Counter({
      name: 'payment_errors_total',
      help: 'Total number of errors by provider and type',
      labelNames: ['provider', 'error_type', 'error_code'],
      registers: [this.registry],
    });
    
    this.activeConnections = new Gauge({
      name: 'payment_active_connections',
      help: 'Number of active connections',
      registers: [this.registry],
    });
    
    this.totalConnections = new Counter({
      name: 'payment_connections_total',
      help: 'Total number of connections',
      registers: [this.registry],
    });
    
    this.providerHealth = new Gauge({
      name: 'payment_provider_health',
      help: 'Provider health status (1 = healthy, 0 = unhealthy)',
      labelNames: ['provider'],
      registers: [this.registry],
    });
    
    this.providerCircuitBreaker = new Gauge({
      name: 'payment_provider_circuit_breaker',
      help: 'Circuit breaker state (0 = closed, 1 = open, 0.5 = half-open)',
      labelNames: ['provider'],
      registers: [this.registry],
    });
    
    this.transactionCounter = new Counter({
      name: 'payment_transactions_total',
      help: 'Total number of transactions',
      labelNames: ['provider', 'status', 'currency'],
      registers: [this.registry],
    });
    
    this.transactionAmount = new Counter({
      name: 'payment_transaction_amount_total',
      help: 'Total transaction amount (cumulative)',
      labelNames: ['provider', 'currency'],
      registers: [this.registry],
    });
    
    this.webhookCounter = new Counter({
      name: 'payment_webhooks_total',
      help: 'Total number of webhooks received',
      labelNames: ['provider', 'event_type', 'status'],
      registers: [this.registry],
    });
    
    this.webhookLatency = new Histogram({
      name: 'payment_webhook_processing_seconds',
      help: 'Webhook processing time in seconds',
      labelNames: ['provider'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.registry],
    });
  }

  /**
   * Record a request
   */
  recordRequest(params: {
    provider: string;
    method: string;
    status: 'success' | 'error' | 'timeout';
    duration: number; // in milliseconds
    requestSize?: number;
    responseSize?: number;
  }): void {
    const { provider, method, status, duration, requestSize, responseSize } = params;
    
    this.requestCounter.inc({ provider, method, status });
    this.requestDuration.observe({ provider, method }, duration / 1000);
    
    if (requestSize !== undefined) {
      this.requestSize.observe({ provider }, requestSize);
    }
    
    if (responseSize !== undefined) {
      this.responseSize.observe({ provider }, responseSize);
    }
  }

  /**
   * Record an error
   */
  recordError(provider: string, errorType: string, errorCode?: string): void {
    this.errorCounter.inc({ provider, error_type: errorType, error_code: errorCode || 'unknown' });
  }

  /**
   * Record a transaction
   */
  recordTransaction(params: {
    provider: string;
    status: string;
    currency: string;
    amount?: number;
  }): void {
    const { provider, status, currency, amount } = params;
    
    this.transactionCounter.inc({ provider, status, currency });
    
    if (amount !== undefined && amount > 0) {
      this.transactionAmount.inc({ provider, currency }, amount);
    }
  }

  /**
   * Record webhook processing
   */
  recordWebhook(params: {
    provider: string;
    eventType: string;
    status: 'success' | 'error' | 'invalid_signature';
    duration: number; // in milliseconds
  }): void {
    const { provider, eventType, status, duration } = params;
    
    this.webhookCounter.inc({ provider, event_type: eventType, status });
    this.webhookLatency.observe({ provider }, duration / 1000);
  }

  /**
   * Update provider health status
   */
  setProviderHealth(provider: string, healthy: boolean): void {
    this.providerHealth.set({ provider }, healthy ? 1 : 0);
  }

  /**
   * Update circuit breaker state
   * @param state 0 = closed, 1 = open, 0.5 = half-open
   */
  setCircuitBreakerState(provider: string, state: 0 | 0.5 | 1): void {
    this.providerCircuitBreaker.set({ provider }, state);
  }

  /**
   * Increment active connections
   */
  incrementConnections(): void {
    this.activeConnections.inc();
    this.totalConnections.inc();
  }

  /**
   * Decrement active connections
   */
  decrementConnections(): void {
    this.activeConnections.dec();
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get metrics registry
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.registry.resetMetrics();
  }
}

// Global metrics instance
let globalMetrics: MetricsCollector | null = null;

export function getGlobalMetrics(config?: MetricsConfig): MetricsCollector {
  if (!globalMetrics) {
    globalMetrics = new MetricsCollector(config);
  }
  return globalMetrics;
}

export function setGlobalMetrics(metrics: MetricsCollector): void {
  globalMetrics = metrics;
}
