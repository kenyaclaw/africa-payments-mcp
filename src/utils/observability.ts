/**
 * Observability Module
 * Exports all observability utilities for easy access
 */

// Structured Logger
export {
  StructuredLogger,
  Logger,
  getGlobalLogger,
  setGlobalLogger,
  type LogContext,
  type StructuredLoggerOptions,
} from './structured-logger.js';

// Metrics
export {
  MetricsCollector,
  getGlobalMetrics,
  setGlobalMetrics,
  type MetricsConfig,
} from './metrics.js';

// Circuit Breaker
export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  getGlobalCircuitBreakerRegistry,
  setGlobalCircuitBreakerRegistry,
  type CircuitBreakerState,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type CircuitBreakerStatus,
} from './circuit-breaker.js';

// Idempotency
export {
  IdempotencyStore,
  TransactionIdCache,
  getGlobalIdempotencyStore,
  setGlobalIdempotencyStore,
  type IdempotencyEntry,
  type IdempotencyConfig,
  type IdempotencyResult,
} from './idempotency.js';

// Health Check
export {
  HealthMonitor,
  getGlobalHealthMonitor,
  setGlobalHealthMonitor,
  createHttpHealthCheck,
  type ProviderHealth,
  type ProviderHealthStatus,
  type HealthCheckResult,
  type HealthCheckConfig,
  type HealthCheckFunction,
} from './health-check.js';

/**
 * Initialize all observability components
 */
import { StructuredLogger, getGlobalLogger } from './structured-logger.js';
import { MetricsCollector, getGlobalMetrics } from './metrics.js';
import { CircuitBreakerRegistry, getGlobalCircuitBreakerRegistry } from './circuit-breaker.js';
import { IdempotencyStore, getGlobalIdempotencyStore } from './idempotency.js';
import { HealthMonitor, getGlobalHealthMonitor } from './health-check.js';

export interface ObservabilityConfig {
  service?: string;
  version?: string;
  logLevel?: string;
  logFormat?: 'json' | 'text';
  collectDefaultMetrics?: boolean;
  healthCheckIntervalMs?: number;
  criticalProviders?: string[];
}

export function initializeObservability(config: ObservabilityConfig = {}): {
  logger: StructuredLogger;
  metrics: MetricsCollector;
  circuitBreakerRegistry: CircuitBreakerRegistry;
  idempotencyStore: IdempotencyStore;
  healthMonitor: HealthMonitor;
} {
  // Initialize logger
  const logger = getGlobalLogger({
    level: config.logLevel,
    format: config.logFormat,
    service: config.service,
    version: config.version,
  });

  // Initialize metrics
  const metrics = getGlobalMetrics({
    defaultLabels: {
      service: config.service || 'africa-payments-mcp',
      version: config.version || '0.1.0',
    },
    collectDefaultMetrics: config.collectDefaultMetrics,
  });

  // Initialize circuit breaker registry
  const circuitBreakerRegistry = getGlobalCircuitBreakerRegistry();

  // Initialize idempotency store
  const idempotencyStore = getGlobalIdempotencyStore();

  // Initialize health monitor
  const healthMonitor = getGlobalHealthMonitor({
    checkIntervalMs: config.healthCheckIntervalMs,
    criticalProviders: config.criticalProviders,
  }, config.version);

  logger.info('Observability components initialized', {
    service: config.service,
    version: config.version,
  });

  return {
    logger,
    metrics,
    circuitBreakerRegistry,
    idempotencyStore,
    healthMonitor,
  };
}
