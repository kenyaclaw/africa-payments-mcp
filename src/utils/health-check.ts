/**
 * Health Check Module
 * Monitors provider health and provides /health endpoint data
 */

import { EventEmitter } from 'events';
import type { CircuitBreakerStatus } from './circuit-breaker.js';

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ProviderHealth {
  name: string;
  status: ProviderHealthStatus;
  lastChecked: Date;
  responseTime?: number;
  circuitBreaker?: CircuitBreakerStatus;
  error?: string;
  metadata?: Record<string, any>;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  version: string;
  providers: ProviderHealth[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

export interface HealthCheckConfig {
  /** Check interval in milliseconds */
  checkIntervalMs: number;
  /** Timeout for health checks in milliseconds */
  timeoutMs: number;
  /** Number of consecutive failures before marking unhealthy */
  failureThreshold: number;
  /** Critical providers that must be healthy for overall health */
  criticalProviders?: string[];
}

export type HealthCheckFunction = () => Promise<{
  healthy: boolean;
  responseTime?: number;
  error?: string;
  metadata?: Record<string, any>;
}>;

const DEFAULT_CONFIG: HealthCheckConfig = {
  checkIntervalMs: 30000, // 30 seconds
  timeoutMs: 10000, // 10 seconds
  failureThreshold: 3,
  criticalProviders: [],
};

export class HealthMonitor extends EventEmitter {
  private providers = new Map<string, HealthCheckFunction>();
  private healthStatus = new Map<string, ProviderHealth>();
  private failureCounts = new Map<string, number>();
  private config: HealthCheckConfig;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private startTime: Date = new Date();
  private version: string;

  constructor(config: Partial<HealthCheckConfig> = {}, version = '0.1.0') {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.version = version;
  }

  /**
   * Register a provider for health monitoring
   */
  registerProvider(name: string, checkFn: HealthCheckFunction): void {
    this.providers.set(name, checkFn);
    this.healthStatus.set(name, {
      name,
      status: 'unknown',
      lastChecked: new Date(),
    });
    this.failureCounts.set(name, 0);
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(name: string): boolean {
    const removed = this.providers.delete(name);
    this.healthStatus.delete(name);
    this.failureCounts.delete(name);
    return removed;
  }

  /**
   * Start periodic health checks
   */
  start(): void {
    if (this.checkInterval) {
      return;
    }

    // Run initial check
    this.runAllChecks();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.runAllChecks();
    }, this.config.checkIntervalMs);

    this.emit('started');
  }

  /**
   * Stop periodic health checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.emit('stopped');
  }

  /**
   * Run health check for a specific provider
   */
  async checkProvider(name: string): Promise<ProviderHealth> {
    const checkFn = this.providers.get(name);
    if (!checkFn) {
      return {
        name,
        status: 'unknown',
        lastChecked: new Date(),
        error: 'Provider not registered',
      };
    }

    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        checkFn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Health check timeout')),
            this.config.timeoutMs
          )
        ),
      ]);

      const responseTime = Date.now() - startTime;
      let failures = this.failureCounts.get(name) || 0;

      if (result.healthy) {
        failures = 0;
        this.failureCounts.set(name, 0);

        const health: ProviderHealth = {
          name,
          status: 'healthy',
          lastChecked: new Date(),
          responseTime,
          metadata: result.metadata,
        };

        this.healthStatus.set(name, health);
        this.emit('provider_healthy', { provider: name, health });
        return health;
      } else {
        failures++;
        this.failureCounts.set(name, failures);

        const isUnhealthy = failures >= this.config.failureThreshold;
        const health: ProviderHealth = {
          name,
          status: isUnhealthy ? 'unhealthy' : 'degraded',
          lastChecked: new Date(),
          responseTime,
          error: result.error,
          metadata: result.metadata,
        };

        this.healthStatus.set(name, health);
        this.emit(isUnhealthy ? 'provider_unhealthy' : 'provider_degraded', {
          provider: name,
          health,
          failures,
        });
        return health;
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      let failures = this.failureCounts.get(name) || 0;
      failures++;
      this.failureCounts.set(name, failures);

      const isUnhealthy = failures >= this.config.failureThreshold;
      const health: ProviderHealth = {
        name,
        status: isUnhealthy ? 'unhealthy' : 'degraded',
        lastChecked: new Date(),
        responseTime,
        error: error instanceof Error ? error.message : String(error),
      };

      this.healthStatus.set(name, health);
      this.emit(isUnhealthy ? 'provider_unhealthy' : 'provider_degraded', {
        provider: name,
        health,
        failures,
      });
      return health;
    }
  }

  /**
   * Run health checks for all registered providers
   */
  async runAllChecks(): Promise<HealthCheckResult> {
    const promises = Array.from(this.providers.keys()).map(name =>
      this.checkProvider(name).catch((error): ProviderHealth => ({
        name,
        status: 'unhealthy',
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : String(error),
      }))
    );

    await Promise.all(promises);
    const result = this.getHealthResult();
    this.emit('check_complete', result);
    return result;
  }

  /**
   * Get current health status
   */
  getHealthResult(): HealthCheckResult {
    const providers = Array.from(this.healthStatus.values());
    
    const summary = {
      total: providers.length,
      healthy: providers.filter(p => p.status === 'healthy').length,
      degraded: providers.filter(p => p.status === 'degraded').length,
      unhealthy: providers.filter(p => p.status === 'unhealthy').length,
    };

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (summary.unhealthy > 0) {
      // Check if any critical providers are unhealthy
      const criticalUnhealthy = this.config.criticalProviders?.some(cp =>
        this.healthStatus.get(cp)?.status === 'unhealthy'
      );
      
      status = criticalUnhealthy ? 'unhealthy' : 'degraded';
    } else if (summary.degraded > 0) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date(),
      uptime: Date.now() - this.startTime.getTime(),
      version: this.version,
      providers,
      summary,
    };
  }

  /**
   * Get health status for a specific provider
   */
  getProviderHealth(name: string): ProviderHealth | undefined {
    return this.healthStatus.get(name);
  }

  /**
   * Update circuit breaker status for a provider
   */
  updateCircuitBreakerStatus(name: string, circuitBreakerStatus: CircuitBreakerStatus): void {
    const health = this.healthStatus.get(name);
    if (health) {
      health.circuitBreaker = circuitBreakerStatus;
      this.healthStatus.set(name, health);
    }
  }

  /**
   * Check if overall health is good (200 status)
   */
  isHealthy(): boolean {
    const result = this.getHealthResult();
    return result.status === 'healthy';
  }

  /**
   * Get HTTP status code for health
   */
  getHttpStatusCode(): number {
    const result = this.getHealthResult();
    switch (result.status) {
      case 'healthy':
        return 200;
      case 'degraded':
        return 200; // Still operational
      case 'unhealthy':
        return 503; // Service unavailable
      default:
        return 503;
    }
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.stop();
    this.providers.clear();
    this.healthStatus.clear();
    this.failureCounts.clear();
    this.removeAllListeners();
  }
}

// Global health monitor
let globalHealthMonitor: HealthMonitor | null = null;

export function getGlobalHealthMonitor(config?: Partial<HealthCheckConfig>, version?: string): HealthMonitor {
  if (!globalHealthMonitor) {
    globalHealthMonitor = new HealthMonitor(config, version);
  }
  return globalHealthMonitor;
}

export function setGlobalHealthMonitor(monitor: HealthMonitor): void {
  globalHealthMonitor = monitor;
}

/**
 * Create a simple HTTP health check function
 */
export function createHttpHealthCheck(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    expectedStatus?: number;
  } = {}
): HealthCheckFunction {
  const { method = 'GET', headers = {}, expectedStatus = 200 } = options;

  return async () => {
    try {
      const response = await fetch(url, {
        method,
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (response.status === expectedStatus) {
        return {
          healthy: true,
          metadata: { status: response.status },
        };
      } else {
        return {
          healthy: false,
          error: `Unexpected status: ${response.status}`,
          metadata: { status: response.status },
        };
      }
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
