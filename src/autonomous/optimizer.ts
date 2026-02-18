/**
 * Auto-Optimization System for Africa Payments MCP
 * 
 * Features:
 * - Tune retry logic based on success rates
 * - Optimize timeouts per provider
 * - Adjust rate limits dynamically
 * - Cache optimization
 */

import { EventEmitter } from 'events';
import { StructuredLogger, getGlobalLogger } from '../utils/structured-logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { HealthMonitor } from '../utils/health-check.js';
import { CircuitBreakerRegistry } from '../utils/circuit-breaker.js';
import { ProviderRegistry } from '../utils/registry.js';

export interface OptimizerConfig {
  /** Analysis interval in milliseconds */
  analysisIntervalMs: number;
  /** Minimum samples before optimization */
  minSamplesForOptimization: number;
  /** Success rate threshold for optimization */
  successRateThreshold: number;
  /** Maximum timeout in milliseconds */
  maxTimeoutMs: number;
  /** Minimum timeout in milliseconds */
  minTimeoutMs: number;
  /** Timeout adjustment factor */
  timeoutAdjustmentFactor: number;
  /** Enable retry optimization */
  retryOptimizationEnabled: boolean;
  /** Maximum retry attempts */
  maxRetryAttempts: number;
  /** Minimum retry attempts */
  minRetryAttempts: number;
  /** Enable rate limit optimization */
  rateLimitOptimizationEnabled: boolean;
  /** Enable cache optimization */
  cacheOptimizationEnabled: boolean;
  /** Cache hit rate threshold */
  cacheHitRateThreshold: number;
  /** Conservative mode: only increase values, never decrease */
  conservativeMode: boolean;
}

export interface Optimization {
  id: string;
  timestamp: Date;
  provider: string;
  category: 'timeout' | 'retry' | 'rate_limit' | 'cache';
  parameter: string;
  oldValue: number;
  newValue: number;
  reason: string;
  expectedImprovement: number;
  status: 'pending' | 'applied' | 'reverted' | 'failed';
  results?: OptimizationResult;
}

export interface OptimizationResult {
  appliedAt: Date;
  beforeMetrics: ProviderPerformanceMetrics;
  afterMetrics: ProviderPerformanceMetrics;
  improvement: number;
  confirmed: boolean;
}

export interface ProviderPerformanceMetrics {
  successRate: number;
  averageResponseTime: number;
  errorRate: number;
  timeoutRate: number;
  retryRate: number;
  cacheHitRate?: number;
  timestamp: Date;
}

export interface ProviderOptimizationState {
  provider: string;
  currentConfig: ProviderOptimizedConfig;
  performanceHistory: ProviderPerformanceMetrics[];
  optimizations: Optimization[];
  lastOptimization?: Date;
  optimizationCount: number;
}

export interface ProviderOptimizedConfig {
  timeoutMs: number;
  maxRetries: number;
  baseRetryDelayMs: number;
  maxRetryDelayMs: number;
  rateLimitPerSecond: number;
  cacheTtlSeconds: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

export interface OptimizerStats {
  totalOptimizations: number;
  successfulOptimizations: number;
  revertedOptimizations: number;
  pendingOptimizations: number;
  avgImprovement: number;
  providersOptimized: number;
}

const DEFAULT_CONFIG: OptimizerConfig = {
  analysisIntervalMs: 120000, // 2 minutes
  minSamplesForOptimization: 50,
  successRateThreshold: 0.95,
  maxTimeoutMs: 60000, // 60 seconds
  minTimeoutMs: 2000, // 2 seconds
  timeoutAdjustmentFactor: 1.2,
  retryOptimizationEnabled: true,
  maxRetryAttempts: 5,
  minRetryAttempts: 1,
  rateLimitOptimizationEnabled: true,
  cacheOptimizationEnabled: true,
  cacheHitRateThreshold: 0.8,
  conservativeMode: false,
};

// Default provider configurations
const DEFAULT_PROVIDER_CONFIG: ProviderOptimizedConfig = {
  timeoutMs: 10000,
  maxRetries: 3,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  rateLimitPerSecond: 100,
  cacheTtlSeconds: 300,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 30000,
};

// Provider-specific base configurations
const PROVIDER_BASE_CONFIGS: Record<string, Partial<ProviderOptimizedConfig>> = {
  mpesa: {
    timeoutMs: 15000,
    maxRetries: 3,
    baseRetryDelayMs: 2000,
    rateLimitPerSecond: 50,
  },
  paystack: {
    timeoutMs: 10000,
    maxRetries: 3,
    baseRetryDelayMs: 1000,
    rateLimitPerSecond: 100,
  },
  mtn_momo: {
    timeoutMs: 20000,
    maxRetries: 4,
    baseRetryDelayMs: 2000,
    rateLimitPerSecond: 30,
  },
  airtel_money: {
    timeoutMs: 15000,
    maxRetries: 3,
    baseRetryDelayMs: 1500,
    rateLimitPerSecond: 40,
  },
  intasend: {
    timeoutMs: 12000,
    maxRetries: 3,
    baseRetryDelayMs: 1000,
    rateLimitPerSecond: 80,
  },
  orange_money: {
    timeoutMs: 18000,
    maxRetries: 4,
    baseRetryDelayMs: 2000,
    rateLimitPerSecond: 35,
  },
};

export class AutoOptimizer extends EventEmitter {
  private config: OptimizerConfig;
  private logger: StructuredLogger;
  private healthMonitor: HealthMonitor;
  private circuitBreakerRegistry: CircuitBreakerRegistry;
  private metrics?: MetricsCollector;
  private providerRegistry?: ProviderRegistry;
  
  private isRunning = false;
  private analysisInterval: ReturnType<typeof setInterval> | null = null;
  
  private providerStates = new Map<string, ProviderOptimizationState>();
  private pendingOptimizations: Optimization[] = [];
  
  // Stats
  private stats: OptimizerStats = {
    totalOptimizations: 0,
    successfulOptimizations: 0,
    revertedOptimizations: 0,
    pendingOptimizations: 0,
    avgImprovement: 0,
    providersOptimized: 0,
  };

  constructor(
    healthMonitor: HealthMonitor,
    circuitBreakerRegistry: CircuitBreakerRegistry,
    config: Partial<OptimizerConfig> = {},
    logger?: StructuredLogger,
    metrics?: MetricsCollector,
    providerRegistry?: ProviderRegistry
  ) {
    super();
    this.healthMonitor = healthMonitor;
    this.circuitBreakerRegistry = circuitBreakerRegistry;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger || getGlobalLogger();
    this.metrics = metrics;
    this.providerRegistry = providerRegistry;
  }

  /**
   * Start the auto-optimizer
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.logger.info('⚡ Auto-Optimizer started', {
      analysisIntervalMs: this.config.analysisIntervalMs,
      retryOptimization: this.config.retryOptimizationEnabled,
      rateLimitOptimization: this.config.rateLimitOptimizationEnabled,
      cacheOptimization: this.config.cacheOptimizationEnabled,
    });

    // Start periodic analysis
    this.analysisInterval = setInterval(() => {
      this.runOptimizationCycle();
    }, this.config.analysisIntervalMs);

    // Initial cycle
    this.runOptimizationCycle();

    this.emit('started');
  }

  /**
   * Stop the auto-optimizer
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    this.logger.info('🛑 Auto-Optimizer stopped');
    this.emit('stopped');
  }

  /**
   * Register a provider for optimization
   */
  registerProvider(provider: string, baseConfig?: Partial<ProviderOptimizedConfig>): void {
    if (this.providerStates.has(provider)) {
      return;
    }

    // Merge base configs
    const mergedConfig: ProviderOptimizedConfig = {
      ...DEFAULT_PROVIDER_CONFIG,
      ...PROVIDER_BASE_CONFIGS[provider],
      ...baseConfig,
    };

    this.providerStates.set(provider, {
      provider,
      currentConfig: mergedConfig,
      performanceHistory: [],
      optimizations: [],
      optimizationCount: 0,
    });

    this.logger.info(`Provider registered for optimization: ${provider}`, {
      config: mergedConfig,
    });
  }

  /**
   * Run optimization cycle for all providers
   */
  private async runOptimizationCycle(): Promise<void> {
    try {
      for (const [provider, state] of this.providerStates.entries()) {
        await this.optimizeProvider(provider, state);
      }

      // Apply pending optimizations
      await this.applyPendingOptimizations();
      
      // Evaluate past optimizations
      this.evaluatePastOptimizations();
      
    } catch (error) {
      this.logger.error('Error during optimization cycle', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Optimize a single provider
   */
  private async optimizeProvider(provider: string, state: ProviderOptimizationState): Promise<void> {
    // Collect current metrics
    const metrics = await this.collectMetrics(provider);
    state.performanceHistory.push(metrics);

    // Keep only last 100 measurements
    if (state.performanceHistory.length > 100) {
      state.performanceHistory.shift();
    }

    // Check if we have enough samples
    if (state.performanceHistory.length < this.config.minSamplesForOptimization) {
      return;
    }

    // Calculate current performance
    const recentMetrics = state.performanceHistory.slice(-20);
    const avgSuccessRate = recentMetrics.reduce((sum, m) => sum + m.successRate, 0) / recentMetrics.length;
    const avgResponseTime = recentMetrics.reduce((sum, m) => sum + m.averageResponseTime, 0) / recentMetrics.length;
    const avgTimeoutRate = recentMetrics.reduce((sum, m) => sum + m.timeoutRate, 0) / recentMetrics.length;
    const avgErrorRate = recentMetrics.reduce((sum, m) => sum + m.errorRate, 0) / recentMetrics.length;

    // Don't optimize too frequently
    if (state.lastOptimization && 
        Date.now() - state.lastOptimization.getTime() < 300000) { // 5 minutes
      return;
    }

    // Identify optimization opportunities
    const opportunities: Optimization[] = [];

    // 1. Timeout optimization
    if (avgTimeoutRate > 0.05 || avgSuccessRate < this.config.successRateThreshold) {
      const timeoutOpt = this.optimizeTimeout(provider, state, avgTimeoutRate, avgResponseTime);
      if (timeoutOpt) opportunities.push(timeoutOpt);
    }

    // 2. Retry optimization
    if (this.config.retryOptimizationEnabled && avgErrorRate > 0.02) {
      const retryOpt = this.optimizeRetries(provider, state, avgErrorRate, avgSuccessRate);
      if (retryOpt) opportunities.push(retryOpt);
    }

    // 3. Rate limit optimization
    if (this.config.rateLimitOptimizationEnabled && avgSuccessRate > 0.98) {
      const rateLimitOpt = this.optimizeRateLimit(provider, state, avgResponseTime);
      if (rateLimitOpt) opportunities.push(rateLimitOpt);
    }

    // 4. Cache optimization
    if (this.config.cacheOptimizationEnabled && metrics.cacheHitRate !== undefined) {
      const cacheOpt = this.optimizeCache(provider, state, metrics.cacheHitRate);
      if (cacheOpt) opportunities.push(cacheOpt);
    }

    // Add opportunities to pending list
    for (const opt of opportunities) {
      if (!this.hasConflictingOptimization(provider, opt.category)) {
        this.pendingOptimizations.push(opt);
        state.optimizations.push(opt);
        
        this.logger.info(`Optimization queued for ${provider}`, {
          category: opt.category,
          parameter: opt.parameter,
          from: opt.oldValue,
          to: opt.newValue,
        });
      }
    }
  }

  /**
   * Optimize timeout configuration
   */
  private optimizeTimeout(
    provider: string,
    state: ProviderOptimizationState,
    timeoutRate: number,
    avgResponseTime: number
  ): Optimization | null {
    const currentTimeout = state.currentConfig.timeoutMs;
    let newTimeout = currentTimeout;
    let reason = '';

    if (timeoutRate > 0.1) {
      // Too many timeouts - increase timeout
      newTimeout = Math.min(
        this.config.maxTimeoutMs,
        Math.round(currentTimeout * this.config.timeoutAdjustmentFactor)
      );
      reason = `High timeout rate (${(timeoutRate * 100).toFixed(1)}%), increasing timeout`;
    } else if (timeoutRate < 0.01 && !this.config.conservativeMode) {
      // Very few timeouts - could potentially decrease for faster feedback
      const headroom = avgResponseTime * 1.5;
      if (currentTimeout > headroom * 1.5) {
        newTimeout = Math.max(
          this.config.minTimeoutMs,
          Math.round(headroom * 1.2)
        );
        reason = `Low timeout rate, reducing timeout for faster failure detection`;
      }
    }

    if (newTimeout !== currentTimeout) {
      return {
        id: this.generateOptimizationId(),
        timestamp: new Date(),
        provider,
        category: 'timeout',
        parameter: 'timeoutMs',
        oldValue: currentTimeout,
        newValue: newTimeout,
        reason,
        expectedImprovement: timeoutRate > 0.1 ? 0.1 : 0.05,
        status: 'pending',
      };
    }

    return null;
  }

  /**
   * Optimize retry configuration
   */
  private optimizeRetries(
    provider: string,
    state: ProviderOptimizationState,
    errorRate: number,
    successRate: number
  ): Optimization | null {
    const currentRetries = state.currentConfig.maxRetries;
    let newRetries = currentRetries;
    let reason = '';

    if (errorRate > 0.05 && successRate < 0.95 && currentRetries < this.config.maxRetryAttempts) {
      // Increase retries for transient errors
      newRetries = Math.min(this.config.maxRetryAttempts, currentRetries + 1);
      reason = `High error rate (${(errorRate * 100).toFixed(1)}%), increasing retries`;
    } else if (errorRate < 0.01 && currentRetries > this.config.minRetryAttempts && !this.config.conservativeMode) {
      // Decrease retries if very reliable
      newRetries = Math.max(this.config.minRetryAttempts, currentRetries - 1);
      reason = `Low error rate, reducing retries for faster failure`;
    }

    if (newRetries !== currentRetries) {
      return {
        id: this.generateOptimizationId(),
        timestamp: new Date(),
        provider,
        category: 'retry',
        parameter: 'maxRetries',
        oldValue: currentRetries,
        newValue: newRetries,
        reason,
        expectedImprovement: errorRate > 0.05 ? 0.15 : 0.05,
        status: 'pending',
      };
    }

    return null;
  }

  /**
   * Optimize rate limit configuration
   */
  private optimizeRateLimit(
    provider: string,
    state: ProviderOptimizationState,
    avgResponseTime: number
  ): Optimization | null {
    const currentRateLimit = state.currentConfig.rateLimitPerSecond;
    
    // If response times are good, we might be able to increase rate limit
    if (avgResponseTime < 500) {
      const newRateLimit = Math.round(currentRateLimit * 1.2);
      
      if (newRateLimit !== currentRateLimit) {
        return {
          id: this.generateOptimizationId(),
          timestamp: new Date(),
          provider,
          category: 'rate_limit',
          parameter: 'rateLimitPerSecond',
          oldValue: currentRateLimit,
          newValue: newRateLimit,
          reason: 'Fast response times, increasing rate limit for better throughput',
          expectedImprovement: 0.2,
          status: 'pending',
        };
      }
    }

    return null;
  }

  /**
   * Optimize cache configuration
   */
  private optimizeCache(
    provider: string,
    state: ProviderOptimizationState,
    cacheHitRate: number
  ): Optimization | null {
    const currentTtl = state.currentConfig.cacheTtlSeconds;
    let newTtl = currentTtl;
    let reason = '';

    if (cacheHitRate < 0.5) {
      // Low hit rate - might need shorter TTL or cache is not useful
      newTtl = Math.max(60, Math.round(currentTtl * 0.8));
      reason = 'Low cache hit rate, reducing TTL';
    } else if (cacheHitRate > 0.9) {
      // High hit rate - could benefit from longer TTL
      newTtl = Math.round(currentTtl * 1.2);
      reason = 'High cache hit rate, increasing TTL for better performance';
    }

    if (newTtl !== currentTtl) {
      return {
        id: this.generateOptimizationId(),
        timestamp: new Date(),
        provider,
        category: 'cache',
        parameter: 'cacheTtlSeconds',
        oldValue: currentTtl,
        newValue: newTtl,
        reason,
        expectedImprovement: cacheHitRate > 0.9 ? 0.1 : 0.05,
        status: 'pending',
      };
    }

    return null;
  }

  /**
   * Apply pending optimizations
   */
  private async applyPendingOptimizations(): Promise<void> {
    const toApply = this.pendingOptimizations.filter(o => o.status === 'pending').slice(0, 3);

    for (const opt of toApply) {
      try {
        await this.applyOptimization(opt);
      } catch (error) {
        opt.status = 'failed';
        this.logger.error(`Failed to apply optimization ${opt.id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Remove processed optimizations from pending
    this.pendingOptimizations = this.pendingOptimizations.filter(o => o.status === 'pending');
    this.stats.pendingOptimizations = this.pendingOptimizations.length;
  }

  /**
   * Apply a single optimization
   */
  private async applyOptimization(opt: Optimization): Promise<void> {
    const state = this.providerStates.get(opt.provider);
    if (!state) return;

    // Store before metrics
    const beforeMetrics = state.performanceHistory[state.performanceHistory.length - 1];

    // Apply the configuration change
    switch (opt.category) {
      case 'timeout':
        state.currentConfig.timeoutMs = opt.newValue;
        break;
      case 'retry':
        state.currentConfig.maxRetries = opt.newValue;
        break;
      case 'rate_limit':
        state.currentConfig.rateLimitPerSecond = opt.newValue;
        break;
      case 'cache':
        state.currentConfig.cacheTtlSeconds = opt.newValue;
        break;
    }

    // Update circuit breaker if needed
    if (opt.category === 'timeout' || opt.category === 'retry') {
      const breaker = this.circuitBreakerRegistry.get(opt.provider);
      if (breaker) {
        // The circuit breaker config would be updated here
        // This depends on the actual implementation
      }
    }

    opt.status = 'applied';
    state.lastOptimization = new Date();
    state.optimizationCount++;

    this.stats.totalOptimizations++;
    this.stats.providersOptimized = this.providerStates.size;

    this.logger.info(`Optimization applied for ${opt.provider}`, {
      category: opt.category,
      parameter: opt.parameter,
      value: opt.newValue,
    });

    this.emit('optimization_applied', opt);

    // Schedule result evaluation
    setTimeout(() => {
      this.evaluateOptimizationResult(opt, beforeMetrics);
    }, 300000); // Evaluate after 5 minutes
  }

  /**
   * Evaluate optimization result
   */
  private evaluateOptimizationResult(opt: Optimization, beforeMetrics: ProviderPerformanceMetrics): void {
    const state = this.providerStates.get(opt.provider);
    if (!state || opt.status !== 'applied') return;

    const recentMetrics = state.performanceHistory.slice(-10);
    if (recentMetrics.length === 0) return;

    const avgSuccessRate = recentMetrics.reduce((sum, m) => sum + m.successRate, 0) / recentMetrics.length;
    const avgResponseTime = recentMetrics.reduce((sum, m) => sum + m.averageResponseTime, 0) / recentMetrics.length;

    const successImprovement = avgSuccessRate - beforeMetrics.successRate;
    const responseImprovement = (beforeMetrics.averageResponseTime - avgResponseTime) / beforeMetrics.averageResponseTime;

    const overallImprovement = successImprovement + responseImprovement * 0.5;

    opt.results = {
      appliedAt: new Date(),
      beforeMetrics,
      afterMetrics: {
        ...recentMetrics[recentMetrics.length - 1],
        timestamp: new Date(),
      },
      improvement: overallImprovement,
      confirmed: overallImprovement > 0 || Math.abs(overallImprovement) < 0.02, // Small regression is acceptable
    };

    if (opt.results.confirmed) {
      this.stats.successfulOptimizations++;
      this.updateAverageImprovement();
      this.logger.info(`Optimization confirmed successful for ${opt.provider}`, {
        improvement: (overallImprovement * 100).toFixed(1) + '%',
      });
    } else if (overallImprovement < -0.05) {
      // Significant regression - revert
      this.revertOptimization(opt);
    }

    this.emit('optimization_evaluated', opt);
  }

  /**
   * Revert an optimization
   */
  private revertOptimization(opt: Optimization): void {
    const state = this.providerStates.get(opt.provider);
    if (!state) return;

    // Revert the configuration
    switch (opt.category) {
      case 'timeout':
        state.currentConfig.timeoutMs = opt.oldValue;
        break;
      case 'retry':
        state.currentConfig.maxRetries = opt.oldValue;
        break;
      case 'rate_limit':
        state.currentConfig.rateLimitPerSecond = opt.oldValue;
        break;
      case 'cache':
        state.currentConfig.cacheTtlSeconds = opt.oldValue;
        break;
    }

    opt.status = 'reverted';
    this.stats.revertedOptimizations++;

    this.logger.warn(`Optimization reverted for ${opt.provider} due to regression`, {
      category: opt.category,
      parameter: opt.parameter,
      revertedTo: opt.oldValue,
    });

    this.emit('optimization_reverted', opt);
  }

  /**
   * Evaluate all past optimizations
   */
  private evaluatePastOptimizations(): void {
    for (const [provider, state] of this.providerStates.entries()) {
      const pendingEvaluations = state.optimizations.filter(o => 
        o.status === 'applied' && !o.results
      );

      for (const opt of pendingEvaluations) {
        // Check if enough time has passed
        const timeSinceApplication = Date.now() - opt.timestamp.getTime();
        if (timeSinceApplication > 300000) { // 5 minutes
          const beforeIdx = state.performanceHistory.findIndex(
            m => m.timestamp.getTime() >= opt.timestamp.getTime()
          );
          if (beforeIdx > 0) {
            this.evaluateOptimizationResult(opt, state.performanceHistory[beforeIdx - 1]);
          }
        }
      }
    }
  }

  /**
   * Check for conflicting optimizations
   */
  private hasConflictingOptimization(provider: string, category: Optimization['category']): boolean {
    return this.pendingOptimizations.some(
      o => o.provider === provider && o.category === category && o.status === 'pending'
    );
  }

  /**
   * Collect metrics for a provider
   */
  private async collectMetrics(provider: string): Promise<ProviderPerformanceMetrics> {
    const health = this.healthMonitor.getProviderHealth(provider);
    const now = new Date();

    // These would come from actual metrics collection
    // For now, using simulated values based on health status
    let successRate = 0.95;
    let errorRate = 0.03;
    let timeoutRate = 0.02;

    if (health?.status === 'unhealthy') {
      successRate = 0.7;
      errorRate = 0.2;
      timeoutRate = 0.1;
    } else if (health?.status === 'degraded') {
      successRate = 0.85;
      errorRate = 0.1;
      timeoutRate = 0.05;
    }

    // Add some randomness
    successRate += (Math.random() - 0.5) * 0.05;
    errorRate += (Math.random() - 0.5) * 0.02;
    timeoutRate += (Math.random() - 0.5) * 0.01;

    return {
      successRate: Math.max(0, Math.min(1, successRate)),
      averageResponseTime: health?.responseTime || 500 + Math.random() * 500,
      errorRate: Math.max(0, errorRate),
      timeoutRate: Math.max(0, timeoutRate),
      retryRate: 0.1 + Math.random() * 0.1,
      cacheHitRate: 0.7 + Math.random() * 0.2,
      timestamp: now,
    };
  }

  /**
   * Update average improvement
   */
  private updateAverageImprovement(): void {
    const successful = Array.from(this.providerStates.values())
      .flatMap(s => s.optimizations)
      .filter(o => o.results?.confirmed);

    if (successful.length === 0) {
      this.stats.avgImprovement = 0;
      return;
    }

    const sum = successful.reduce((acc, o) => acc + (o.results?.improvement || 0), 0);
    this.stats.avgImprovement = sum / successful.length;
  }

  /**
   * Generate optimization ID
   */
  private generateOptimizationId(): string {
    return `opt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get optimization state for a provider
   */
  getProviderState(provider: string): ProviderOptimizationState | undefined {
    return this.providerStates.get(provider);
  }

  /**
   * Get all provider states
   */
  getAllProviderStates(): ProviderOptimizationState[] {
    return Array.from(this.providerStates.values());
  }

  /**
   * Get current optimized configuration for a provider
   */
  getOptimizedConfig(provider: string): ProviderOptimizedConfig | undefined {
    return this.providerStates.get(provider)?.currentConfig;
  }

  /**
   * Get optimization history
   */
  getOptimizations(options?: {
    provider?: string;
    category?: Optimization['category'];
    status?: Optimization['status'];
    limit?: number;
  }): Optimization[] {
    let opts = Array.from(this.providerStates.values()).flatMap(s => s.optimizations);
    
    if (options?.provider) {
      opts = opts.filter(o => o.provider === options.provider);
    }
    
    if (options?.category) {
      opts = opts.filter(o => o.category === options.category);
    }
    
    if (options?.status) {
      opts = opts.filter(o => o.status === options.status);
    }
    
    if (options?.limit) {
      opts = opts.slice(-options.limit);
    }
    
    return opts.reverse();
  }

  /**
   * Get optimizer statistics
   */
  getStats(): OptimizerStats {
    return { ...this.stats };
  }

  /**
   * Force apply configuration for a provider
   */
  async forceConfig(provider: string, config: Partial<ProviderOptimizedConfig>): Promise<void> {
    const state = this.providerStates.get(provider);
    if (!state) {
      throw new Error(`Provider ${provider} not registered`);
    }

    const opt: Optimization = {
      id: this.generateOptimizationId(),
      timestamp: new Date(),
      provider,
      category: 'timeout',
      parameter: 'manual',
      oldValue: 0,
      newValue: 0,
      reason: 'Manual configuration override',
      expectedImprovement: 0,
      status: 'pending',
    };

    // Apply all provided config values
    Object.assign(state.currentConfig, config);
    
    state.optimizations.push(opt);
    
    this.logger.info(`Manual config applied for ${provider}`, config);
    this.emit('manual_config_applied', { provider, config });
  }

  /**
   * Revert to default configuration
   */
  async revertToDefault(provider: string): Promise<void> {
    const state = this.providerStates.get(provider);
    if (!state) return;

    const defaultConfig: ProviderOptimizedConfig = {
      ...DEFAULT_PROVIDER_CONFIG,
      ...PROVIDER_BASE_CONFIGS[provider],
    };

    state.currentConfig = defaultConfig;
    state.optimizations = [];
    state.performanceHistory = [];

    this.logger.info(`Configuration reverted to defaults for ${provider}`);
    this.emit('config_reverted', { provider });
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.stop();
    this.providerStates.clear();
    this.pendingOptimizations = [];
  }
}

// Global optimizer instance
let globalOptimizer: AutoOptimizer | null = null;

export function getGlobalOptimizer(
  healthMonitor?: HealthMonitor,
  circuitBreakerRegistry?: CircuitBreakerRegistry,
  config?: Partial<OptimizerConfig>,
  logger?: StructuredLogger,
  metrics?: MetricsCollector,
  providerRegistry?: ProviderRegistry
): AutoOptimizer {
  if (!globalOptimizer) {
    if (!healthMonitor || !circuitBreakerRegistry) {
      throw new Error('HealthMonitor and CircuitBreakerRegistry required for global Optimizer');
    }
    globalOptimizer = new AutoOptimizer(
      healthMonitor,
      circuitBreakerRegistry,
      config,
      logger,
      metrics,
      providerRegistry
    );
  }
  return globalOptimizer;
}

export function setGlobalOptimizer(optimizer: AutoOptimizer): void {
  globalOptimizer = optimizer;
}
