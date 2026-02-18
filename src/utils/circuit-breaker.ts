/**
 * Circuit Breaker Pattern Implementation
 * Protects against cascading failures in payment providers
 */

import { EventEmitter } from 'events';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time in milliseconds before attempting to close the circuit */
  resetTimeoutMs: number;
  /** Number of successful requests in half-open state to close the circuit */
  successThreshold: number;
  /** Half-open request rate (0-1) - percentage of requests to let through in half-open state */
  halfOpenMaxRequests?: number;
}

export interface CircuitBreakerMetrics {
  failures: number;
  successes: number;
  lastFailureTime?: Date;
  consecutiveSuccesses: number;
  state: CircuitBreakerState;
  stateChangedAt: Date;
}

export interface CircuitBreakerStatus {
  provider: string;
  state: CircuitBreakerState;
  healthy: boolean;
  metrics: CircuitBreakerMetrics;
  nextRetryAt?: Date;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000, // 30 seconds
  successThreshold: 3,
  halfOpenMaxRequests: 0.5,
};

export class CircuitBreaker extends EventEmitter {
  private state: CircuitBreakerState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private consecutiveSuccesses = 0;
  private lastFailureTime?: Date;
  private stateChangedAt: Date = new Date();
  private halfOpenRequests = 0;
  private config: CircuitBreakerConfig;

  constructor(
    private providerName: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Check if the circuit allows requests through
   */
  canExecute(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      // Check if we should transition to half-open
      if (this.shouldAttemptReset()) {
        this.transitionTo('HALF_OPEN');
        return true;
      }
      return false;
    }

    // HALF_OPEN state - allow limited requests
    if (this.state === 'HALF_OPEN') {
      // Only allow a percentage of requests through
      const shouldAllow = Math.random() < (this.config.halfOpenMaxRequests || 0.5);
      if (shouldAllow) {
        this.halfOpenRequests++;
      }
      return shouldAllow;
    }

    return false;
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    this.successes++;

    if (this.state === 'HALF_OPEN') {
      this.consecutiveSuccesses++;
      
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo('CLOSED');
      }
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(error?: Error): void {
    this.failures++;
    this.lastFailureTime = new Date();
    this.consecutiveSuccesses = 0;

    if (this.state === 'HALF_OPEN') {
      // Immediately open circuit on failure in half-open state
      this.transitionTo('OPEN');
      this.emit('failure', {
        provider: this.providerName,
        error,
        failures: this.failures,
        threshold: this.config.failureThreshold,
      });
    } else if (this.state === 'CLOSED') {
      if (this.failures >= this.config.failureThreshold) {
        this.transitionTo('OPEN');
        this.emit('trip', {
          provider: this.providerName,
          error,
          failures: this.failures,
        });
      }
    }
  }

  /**
   * Manually trip the circuit breaker (open it)
   */
  trip(): void {
    if (this.state !== 'OPEN') {
      this.transitionTo('OPEN');
      this.emit('manual_trip', { provider: this.providerName });
    }
  }

  /**
   * Manually reset the circuit breaker (close it)
   */
  reset(): void {
    if (this.state !== 'CLOSED') {
      this.transitionTo('CLOSED');
      this.emit('manual_reset', { provider: this.providerName });
    }
  }

  /**
   * Get current status
   */
  getStatus(): CircuitBreakerStatus {
    const metrics: CircuitBreakerMetrics = {
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      consecutiveSuccesses: this.consecutiveSuccesses,
      state: this.state,
      stateChangedAt: this.stateChangedAt,
    };

    return {
      provider: this.providerName,
      state: this.state,
      healthy: this.state === 'CLOSED',
      metrics,
      nextRetryAt: this.state === 'OPEN' ? this.getNextRetryTime() : undefined,
    };
  }

  /**
   * Get metrics for reporting
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      consecutiveSuccesses: this.consecutiveSuccesses,
      state: this.state,
      stateChangedAt: this.stateChangedAt,
    };
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;
    
    const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceLastFailure >= this.config.resetTimeoutMs;
  }

  private getNextRetryTime(): Date | undefined {
    if (this.state !== 'OPEN' || !this.lastFailureTime) {
      return undefined;
    }
    
    return new Date(this.lastFailureTime.getTime() + this.config.resetTimeoutMs);
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;
    this.stateChangedAt = new Date();

    if (newState === 'CLOSED') {
      this.failures = 0;
      this.consecutiveSuccesses = 0;
      this.halfOpenRequests = 0;
    }

    this.emit('state_change', {
      provider: this.providerName,
      from: oldState,
      to: newState,
      timestamp: this.stateChangedAt,
    });
  }
}

/**
 * Circuit breaker registry for managing multiple provider circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();
  private configs = new Map<string, Partial<CircuitBreakerConfig>>();

  /**
   * Register a provider with circuit breaker protection
   */
  register(provider: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    const existing = this.breakers.get(provider);
    if (existing) {
      return existing;
    }

    if (config) {
      this.configs.set(provider, config);
    }

    const breaker = new CircuitBreaker(provider, config || this.configs.get(provider));
    this.breakers.set(provider, breaker);
    return breaker;
  }

  /**
   * Get circuit breaker for a provider
   */
  get(provider: string): CircuitBreaker | undefined {
    return this.breakers.get(provider);
  }

  /**
   * Check if provider can execute
   */
  canExecute(provider: string): boolean {
    const breaker = this.breakers.get(provider);
    if (!breaker) {
      // If no circuit breaker registered, allow execution
      return true;
    }
    return breaker.canExecute();
  }

  /**
   * Record success for a provider
   */
  recordSuccess(provider: string): void {
    const breaker = this.breakers.get(provider);
    if (breaker) {
      breaker.recordSuccess();
    }
  }

  /**
   * Record failure for a provider
   */
  recordFailure(provider: string, error?: Error): void {
    const breaker = this.breakers.get(provider);
    if (breaker) {
      breaker.recordFailure(error);
    }
  }

  /**
   * Get status for all providers
   */
  getAllStatuses(): CircuitBreakerStatus[] {
    return Array.from(this.breakers.values()).map(b => b.getStatus());
  }

  /**
   * Get status for a specific provider
   */
  getStatus(provider: string): CircuitBreakerStatus | undefined {
    const breaker = this.breakers.get(provider);
    return breaker?.getStatus();
  }

  /**
   * Reset circuit breaker for a provider
   */
  reset(provider: string): boolean {
    const breaker = this.breakers.get(provider);
    if (breaker) {
      breaker.reset();
      return true;
    }
    return false;
  }

  /**
   * Trip circuit breaker for a provider
   */
  trip(provider: string): boolean {
    const breaker = this.breakers.get(provider);
    if (breaker) {
      breaker.trip();
      return true;
    }
    return false;
  }

  /**
   * Unregister a provider
   */
  unregister(provider: string): boolean {
    return this.breakers.delete(provider);
  }

  /**
   * Get all registered provider names
   */
  getProviders(): string[] {
    return Array.from(this.breakers.keys());
  }
}

// Global circuit breaker registry
let globalRegistry: CircuitBreakerRegistry | null = null;

export function getGlobalCircuitBreakerRegistry(): CircuitBreakerRegistry {
  if (!globalRegistry) {
    globalRegistry = new CircuitBreakerRegistry();
  }
  return globalRegistry;
}

export function setGlobalCircuitBreakerRegistry(registry: CircuitBreakerRegistry): void {
  globalRegistry = registry;
}
