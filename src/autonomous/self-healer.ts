/**
 * Self-Healing System for Africa Payments MCP
 * 
 * Features:
 * - Monitor provider health in real-time
 * - Auto-restart failing providers
 * - Circuit breaker auto-reset
 * - Failover to backup providers
 * - Heal without human intervention
 */

import { EventEmitter } from 'events';
import { StructuredLogger, getGlobalLogger } from '../utils/structured-logger.js';
import { HealthMonitor, ProviderHealth, ProviderHealthStatus } from '../utils/health-check.js';
import { CircuitBreaker, CircuitBreakerRegistry, CircuitBreakerState } from '../utils/circuit-breaker.js';
import { MetricsCollector } from '../utils/metrics.js';
import { ProviderRegistry } from '../utils/registry.js';

export interface SelfHealerConfig {
  /** Check interval in milliseconds */
  checkIntervalMs: number;
  /** Number of consecutive failures before triggering healing */
  failureThreshold: number;
  /** Time to wait before auto-resetting circuit breaker */
  circuitBreakerAutoResetMs: number;
  /** Maximum number of healing attempts per provider */
  maxHealingAttempts: number;
  /** Time window for healing attempts reset */
  healingWindowMs: number;
  /** Enable automatic provider restart */
  autoRestartEnabled: boolean;
  /** Enable automatic failover */
  autoFailoverEnabled: boolean;
  /** Critical providers that trigger alerts */
  criticalProviders: string[];
  /** Backup provider mappings: primary -> backup */
  backupProviderMap: Record<string, string[]>;
  /** Cooldown period between healing actions */
  healingCooldownMs: number;
}

export interface HealingEvent {
  id: string;
  timestamp: Date;
  provider: string;
  type: 'restart' | 'circuit_reset' | 'failover' | 'degradation_recovery';
  status: 'started' | 'completed' | 'failed';
  reason: string;
  details?: Record<string, any>;
  error?: string;
}

export interface ProviderRecoveryState {
  provider: string;
  healingAttempts: number;
  lastHealingAttempt?: Date;
  consecutiveFailures: number;
  circuitBreakerTrips: number;
  autoFailoverCount: number;
  lastFailoverTime?: Date;
  isInRecovery: boolean;
  recoveryStartTime?: Date;
}

export interface SelfHealerStats {
  totalHealingEvents: number;
  successfulHealings: number;
  failedHealings: number;
  circuitBreakerResets: number;
  providerRestarts: number;
  failoverEvents: number;
  activeRecoveries: number;
  avgRecoveryTimeMs: number;
}

const DEFAULT_CONFIG: SelfHealerConfig = {
  checkIntervalMs: 10000, // 10 seconds
  failureThreshold: 3,
  circuitBreakerAutoResetMs: 60000, // 1 minute
  maxHealingAttempts: 5,
  healingWindowMs: 3600000, // 1 hour
  autoRestartEnabled: true,
  autoFailoverEnabled: true,
  criticalProviders: [],
  backupProviderMap: {},
  healingCooldownMs: 30000, // 30 seconds
};

export class SelfHealer extends EventEmitter {
  private config: SelfHealerConfig;
  private logger: StructuredLogger;
  private healthMonitor: HealthMonitor;
  private circuitBreakerRegistry: CircuitBreakerRegistry;
  private metrics?: MetricsCollector;
  private providerRegistry?: ProviderRegistry;
  
  private healingEvents: HealingEvent[] = [];
  private recoveryStates = new Map<string, ProviderRecoveryState>();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private healingCooldowns = new Map<string, Date>();
  
  // Stats
  private stats: SelfHealerStats = {
    totalHealingEvents: 0,
    successfulHealings: 0,
    failedHealings: 0,
    circuitBreakerResets: 0,
    providerRestarts: 0,
    failoverEvents: 0,
    activeRecoveries: 0,
    avgRecoveryTimeMs: 0,
  };
  
  // Recovery time tracking
  private recoveryTimes: number[] = [];

  constructor(
    healthMonitor: HealthMonitor,
    circuitBreakerRegistry: CircuitBreakerRegistry,
    config: Partial<SelfHealerConfig> = {},
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
   * Start the self-healing system
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.logger.info('🩺 Self-Healer started', {
      checkIntervalMs: this.config.checkIntervalMs,
      autoRestart: this.config.autoRestartEnabled,
      autoFailover: this.config.autoFailoverEnabled,
    });

    // Listen to health monitor events
    this.healthMonitor.on('provider_unhealthy', this.handleUnhealthyProvider.bind(this));
    this.healthMonitor.on('provider_degraded', this.handleDegradedProvider.bind(this));
    this.healthMonitor.on('provider_healthy', this.handleHealthyProvider.bind(this));

    // Listen to circuit breaker events
    this.circuitBreakerRegistry.getAllStatuses().forEach(status => {
      const breaker = this.circuitBreakerRegistry.get(status.provider);
      if (breaker) {
        breaker.on('trip', this.handleCircuitBreakerTrip.bind(this));
        breaker.on('state_change', this.handleCircuitBreakerStateChange.bind(this));
      }
    });

    // Start periodic health analysis
    this.checkInterval = setInterval(() => {
      this.analyzeSystemHealth();
    }, this.config.checkIntervalMs);

    this.emit('started');
  }

  /**
   * Stop the self-healing system
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.removeAllListeners();
    this.logger.info('🛑 Self-Healer stopped');
    this.emit('stopped');
  }

  /**
   * Register a provider for self-healing
   */
  registerProvider(provider: string): void {
    if (!this.recoveryStates.has(provider)) {
      this.recoveryStates.set(provider, {
        provider,
        healingAttempts: 0,
        consecutiveFailures: 0,
        circuitBreakerTrips: 0,
        autoFailoverCount: 0,
        isInRecovery: false,
      });
      
      // Register circuit breaker event listeners
      const breaker = this.circuitBreakerRegistry.get(provider);
      if (breaker) {
        breaker.on('trip', this.handleCircuitBreakerTrip.bind(this));
        breaker.on('state_change', this.handleCircuitBreakerStateChange.bind(this));
      }
      
      this.logger.debug(`Provider registered for self-healing: ${provider}`);
    }
  }

  /**
   * Set backup providers for automatic failover
   */
  setBackupProviders(primary: string, backups: string[]): void {
    this.config.backupProviderMap[primary] = backups;
    this.logger.info(`Backup providers configured for ${primary}`, { backups });
  }

  /**
   * Handle unhealthy provider
   */
  private async handleUnhealthyProvider(event: { provider: string; health: ProviderHealth }): Promise<void> {
    const { provider, health } = event;
    
    this.logger.warn(`Provider unhealthy detected: ${provider}`, {
      error: health.error,
      responseTime: health.responseTime,
    });

    const state = this.getOrCreateRecoveryState(provider);
    state.consecutiveFailures++;

    // Check if we should trigger healing
    if (state.consecutiveFailures >= this.config.failureThreshold) {
      await this.triggerHealing(provider, 'Provider unhealthy', health);
    }

    // Check if we should failover
    if (this.config.autoFailoverEnabled && this.shouldFailover(provider)) {
      await this.triggerFailover(provider);
    }
  }

  /**
   * Handle degraded provider
   */
  private async handleDegradedProvider(event: { provider: string; health: ProviderHealth; failures: number }): Promise<void> {
    const { provider, health, failures } = event;
    
    this.logger.warn(`Provider degraded: ${provider}`, {
      failures,
      responseTime: health.responseTime,
    });

    // Monitor for recovery
    const state = this.getOrCreateRecoveryState(provider);
    
    // If degradation persists, consider proactive measures
    if (failures >= this.config.failureThreshold - 1) {
      this.logger.info(`Proactive healing for ${provider} due to persistent degradation`);
      await this.optimizeProvider(provider);
    }
  }

  /**
   * Handle healthy provider
   */
  private handleHealthyProvider(event: { provider: string; health: ProviderHealth }): Promise<void> {
    const { provider, health } = event;
    const state = this.recoveryStates.get(provider);
    
    if (state) {
      // Reset failure count on recovery
      state.consecutiveFailures = 0;
      
      // If was in recovery, mark as recovered
      if (state.isInRecovery && state.recoveryStartTime) {
        const recoveryTime = Date.now() - state.recoveryStartTime.getTime();
        this.recoveryTimes.push(recoveryTime);
        
        // Keep only last 100 recovery times for average
        if (this.recoveryTimes.length > 100) {
          this.recoveryTimes.shift();
        }
        
        this.updateAverageRecoveryTime();
        
        state.isInRecovery = false;
        state.recoveryStartTime = undefined;
        
        this.logger.info(`Provider ${provider} recovered successfully`, {
          recoveryTimeMs: recoveryTime,
        });
        
        this.emit('provider_recovered', { provider, recoveryTimeMs: recoveryTime });
      }
    }
    return Promise.resolve();
  }

  /**
   * Handle circuit breaker trip
   */
  private async handleCircuitBreakerTrip(event: { provider: string; error?: Error; failures: number }): Promise<void> {
    const { provider, error, failures } = event;
    
    this.logger.error(`Circuit breaker tripped for ${provider}`, {
      failures,
      error: error?.message,
    });

    const state = this.getOrCreateRecoveryState(provider);
    state.circuitBreakerTrips++;

    // Schedule auto-reset if enabled
    if (this.config.circuitBreakerAutoResetMs > 0) {
      setTimeout(() => {
        this.attemptCircuitBreakerReset(provider);
      }, this.config.circuitBreakerAutoResetMs);
    }

    // Trigger immediate healing
    await this.triggerHealing(provider, 'Circuit breaker tripped', { error: error?.message, failures });
  }

  /**
   * Handle circuit breaker state change
   */
  private handleCircuitBreakerStateChange(event: {
    provider: string;
    from: CircuitBreakerState;
    to: CircuitBreakerState;
    timestamp: Date;
  }): void {
    const { provider, from, to, timestamp } = event;
    
    this.logger.info(`Circuit breaker state change: ${provider}`, {
      from,
      to,
      timestamp,
    });

    // If transitioning to HALF_OPEN, monitor closely
    if (to === 'HALF_OPEN') {
      this.logger.info(`Circuit breaker for ${provider} entering half-open state - monitoring closely`);
    }

    // If transitioning to CLOSED (recovered), update metrics
    if (to === 'CLOSED' && from !== 'CLOSED') {
      this.stats.circuitBreakerResets++;
    }
  }

  /**
   * Attempt to reset circuit breaker
   */
  private async attemptCircuitBreakerReset(provider: string): Promise<void> {
    const breaker = this.circuitBreakerRegistry.get(provider);
    if (!breaker) return;

    const eventId = this.generateEventId();
    
    try {
      this.logHealingEvent(eventId, provider, 'circuit_reset', 'started', 'Auto-resetting circuit breaker');
      
      // Check if provider is healthy before resetting
      const health = await this.healthMonitor.checkProvider(provider);
      
      if (health.status === 'healthy') {
        breaker.reset();
        this.stats.circuitBreakerResets++;
        this.logHealingEvent(eventId, provider, 'circuit_reset', 'completed', 'Circuit breaker auto-reset successful');
        
        this.emit('circuit_breaker_reset', { provider, timestamp: new Date() });
        
        if (this.metrics) {
          this.metrics.setCircuitBreakerState(provider, 0); // 0 = closed
        }
      } else {
        throw new Error(`Provider still unhealthy: ${health.error}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logHealingEvent(eventId, provider, 'circuit_reset', 'failed', 'Circuit breaker auto-reset failed', { error: errorMsg });
      
      // Re-schedule reset with exponential backoff
      const state = this.recoveryStates.get(provider);
      const backoffMs = this.config.circuitBreakerAutoResetMs * Math.pow(2, state?.circuitBreakerTrips || 1);
      
      this.logger.info(`Rescheduling circuit breaker reset for ${provider} in ${backoffMs}ms`);
      setTimeout(() => this.attemptCircuitBreakerReset(provider), Math.min(backoffMs, 300000)); // Max 5 minutes
    }
  }

  /**
   * Trigger healing for a provider
   */
  private async triggerHealing(provider: string, reason: string, details?: Record<string, any>): Promise<void> {
    // Check cooldown
    if (this.isInCooldown(provider)) {
      this.logger.debug(`Healing for ${provider} skipped - in cooldown`);
      return;
    }

    const state = this.getOrCreateRecoveryState(provider);
    
    // Check max healing attempts
    if (state.healingAttempts >= this.config.maxHealingAttempts) {
      this.logger.error(`Max healing attempts reached for ${provider}. Manual intervention required.`);
      this.emit('max_healing_attempts_reached', { provider, attempts: state.healingAttempts });
      return;
    }

    // Set cooldown
    this.healingCooldowns.set(provider, new Date());
    
    const eventId = this.generateEventId();
    state.healingAttempts++;
    state.lastHealingAttempt = new Date();
    state.isInRecovery = true;
    state.recoveryStartTime = new Date();
    
    this.stats.activeRecoveries++;
    this.stats.totalHealingEvents++;

    this.logHealingEvent(eventId, provider, 'restart', 'started', reason, details);

    try {
      // Attempt provider restart if enabled
      if (this.config.autoRestartEnabled) {
        await this.restartProvider(provider);
      }
      
      this.stats.successfulHealings++;
      this.stats.providerRestarts++;
      this.logHealingEvent(eventId, provider, 'restart', 'completed', 'Provider restarted successfully');
      
      this.emit('healing_completed', { provider, eventId, timestamp: new Date() });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.stats.failedHealings++;
      this.logHealingEvent(eventId, provider, 'restart', 'failed', 'Provider restart failed', { error: errorMsg });
      
      this.emit('healing_failed', { provider, eventId, error: errorMsg });
      
      // Try failover if restart failed
      if (this.config.autoFailoverEnabled) {
        await this.triggerFailover(provider);
      }
    } finally {
      this.stats.activeRecoveries = Math.max(0, this.stats.activeRecoveries - 1);
    }
  }

  /**
   * Restart a provider
   */
  private async restartProvider(provider: string): Promise<void> {
    this.logger.info(`Restarting provider: ${provider}`);
    
    // Get the adapter from registry
    const adapter = this.providerRegistry?.getProvider(provider);
    if (!adapter) {
      throw new Error(`Provider adapter not found: ${provider}`);
    }

    // Re-initialize the provider
    try {
      await adapter.initialize(adapter.config);
      this.logger.info(`Provider ${provider} re-initialized successfully`);
    } catch (error) {
      throw new Error(`Failed to re-initialize provider ${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Reset circuit breaker
    const breaker = this.circuitBreakerRegistry.get(provider);
    if (breaker && breaker.getState() === 'OPEN') {
      breaker.reset();
    }

    // Clear failure counts
    const state = this.recoveryStates.get(provider);
    if (state) {
      state.consecutiveFailures = 0;
    }
  }

  /**
   * Trigger failover to backup provider
   */
  private async triggerFailover(primary: string): Promise<void> {
    const backups = this.config.backupProviderMap[primary];
    if (!backups || backups.length === 0) {
      this.logger.warn(`No backup providers configured for ${primary}`);
      return;
    }

    const eventId = this.generateEventId();
    this.logHealingEvent(eventId, primary, 'failover', 'started', 'Triggering failover to backup provider');

    // Find first healthy backup
    for (const backup of backups) {
      const health = this.healthMonitor.getProviderHealth(backup);
      
      if (health?.status === 'healthy') {
        const state = this.getOrCreateRecoveryState(primary);
        state.autoFailoverCount++;
        state.lastFailoverTime = new Date();
        
        this.stats.failoverEvents++;
        this.logHealingEvent(eventId, primary, 'failover', 'completed', `Failover to ${backup} successful`, { backupProvider: backup });
        
        this.emit('failover_triggered', { 
          primary, 
          backup, 
          timestamp: new Date(),
        });
        
        return;
      }
    }

    this.logHealingEvent(eventId, primary, 'failover', 'failed', 'No healthy backup providers available');
    this.emit('failover_failed', { primary, timestamp: new Date() });
  }

  /**
   * Optimize provider performance
   */
  private async optimizeProvider(provider: string): Promise<void> {
    this.logger.info(`Running optimization for ${provider}`);
    
    // This would contain provider-specific optimizations
    // For now, we log and emit an event for external handlers
    this.emit('optimization_requested', { provider, timestamp: new Date() });
  }

  /**
   * Analyze overall system health
   */
  private analyzeSystemHealth(): void {
    const healthResult = this.healthMonitor.getHealthResult();
    
    // Check for system-wide issues
    const unhealthyCount = healthResult.summary.unhealthy;
    const degradedCount = healthResult.summary.degraded;
    const totalProviders = healthResult.summary.total;
    
    if (unhealthyCount > totalProviders / 2) {
      this.logger.error('CRITICAL: More than 50% of providers are unhealthy', {
        unhealthy: unhealthyCount,
        total: totalProviders,
      });
      this.emit('critical_system_state', {
        severity: 'critical',
        unhealthyCount,
        degradedCount,
        totalProviders,
        timestamp: new Date(),
      });
    } else if (unhealthyCount > 0 || degradedCount > 0) {
      this.logger.warn('System degradation detected', {
        unhealthy: unhealthyCount,
        degraded: degradedCount,
        healthy: healthResult.summary.healthy,
      });
    }

    // Reset healing attempts for providers outside the healing window
    this.resetStaleHealingAttempts();
  }

  /**
   * Reset healing attempts for providers that haven't needed healing recently
   */
  private resetStaleHealingAttempts(): void {
    const now = Date.now();
    
    for (const [provider, state] of this.recoveryStates.entries()) {
      if (state.lastHealingAttempt) {
        const timeSinceLastAttempt = now - state.lastHealingAttempt.getTime();
        if (timeSinceLastAttempt > this.config.healingWindowMs) {
          state.healingAttempts = 0;
          this.logger.debug(`Reset healing attempts for ${provider}`);
        }
      }
    }
  }

  /**
   * Check if provider is in healing cooldown
   */
  private isInCooldown(provider: string): boolean {
    const cooldownEnd = this.healingCooldowns.get(provider);
    if (!cooldownEnd) return false;
    
    return Date.now() - cooldownEnd.getTime() < this.config.healingCooldownMs;
  }

  /**
   * Check if failover should be triggered
   */
  private shouldFailover(provider: string): boolean {
    const state = this.recoveryStates.get(provider);
    if (!state) return false;
    
    // Failover if multiple healing attempts failed
    return state.healingAttempts >= Math.floor(this.config.maxHealingAttempts / 2);
  }

  /**
   * Get or create recovery state for a provider
   */
  private getOrCreateRecoveryState(provider: string): ProviderRecoveryState {
    if (!this.recoveryStates.has(provider)) {
      this.recoveryStates.set(provider, {
        provider,
        healingAttempts: 0,
        consecutiveFailures: 0,
        circuitBreakerTrips: 0,
        autoFailoverCount: 0,
        isInRecovery: false,
      });
    }
    return this.recoveryStates.get(provider)!;
  }

  /**
   * Log a healing event
   */
  private logHealingEvent(
    id: string,
    provider: string,
    type: HealingEvent['type'],
    status: HealingEvent['status'],
    reason: string,
    details?: Record<string, any>,
    error?: string
  ): void {
    const event: HealingEvent = {
      id,
      timestamp: new Date(),
      provider,
      type,
      status,
      reason,
      details,
      error,
    };
    
    this.healingEvents.push(event);
    
    // Keep only last 1000 events
    if (this.healingEvents.length > 1000) {
      this.healingEvents.shift();
    }

    const logLevel = status === 'failed' ? 'error' : status === 'completed' ? 'info' : 'debug';
    this.logger[logLevel](`[SelfHeal] ${provider}: ${type} - ${status}`, { reason, details, errorMessage: error });
    
    this.emit('healing_event', event);
  }

  /**
   * Update average recovery time
   */
  private updateAverageRecoveryTime(): void {
    if (this.recoveryTimes.length === 0) {
      this.stats.avgRecoveryTimeMs = 0;
      return;
    }
    
    const sum = this.recoveryTimes.reduce((a, b) => a + b, 0);
    this.stats.avgRecoveryTimeMs = Math.round(sum / this.recoveryTimes.length);
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `heal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get healing events
   */
  getHealingEvents(options?: { 
    provider?: string; 
    type?: HealingEvent['type']; 
    limit?: number;
    since?: Date;
  }): HealingEvent[] {
    let events = [...this.healingEvents];
    
    if (options?.provider) {
      events = events.filter(e => e.provider === options.provider);
    }
    
    if (options?.type) {
      events = events.filter(e => e.type === options.type);
    }
    
    if (options?.since) {
      events = events.filter(e => e.timestamp >= options.since!);
    }
    
    if (options?.limit) {
      events = events.slice(-options.limit);
    }
    
    return events.reverse(); // Most recent first
  }

  /**
   * Get recovery state for a provider
   */
  getRecoveryState(provider: string): ProviderRecoveryState | undefined {
    return this.recoveryStates.get(provider);
  }

  /**
   * Get all recovery states
   */
  getAllRecoveryStates(): ProviderRecoveryState[] {
    return Array.from(this.recoveryStates.values());
  }

  /**
   * Get self-healer statistics
   */
  getStats(): SelfHealerStats {
    return { ...this.stats };
  }

  /**
   * Get system status summary
   */
  getStatus(): {
    isRunning: boolean;
    registeredProviders: number;
    activeRecoveries: number;
    recentEvents: number;
  } {
    return {
      isRunning: this.isRunning,
      registeredProviders: this.recoveryStates.size,
      activeRecoveries: this.stats.activeRecoveries,
      recentEvents: this.healingEvents.filter(e => 
        Date.now() - e.timestamp.getTime() < 3600000 // Last hour
      ).length,
    };
  }

  /**
   * Force healing for a provider
   */
  async forceHealing(provider: string, reason = 'Manual trigger'): Promise<void> {
    this.logger.info(`Manual healing triggered for ${provider}`, { reason });
    await this.triggerHealing(provider, reason);
  }

  /**
   * Reset healing attempts for a provider
   */
  resetHealingAttempts(provider: string): void {
    const state = this.recoveryStates.get(provider);
    if (state) {
      state.healingAttempts = 0;
      state.consecutiveFailures = 0;
      this.logger.info(`Healing attempts reset for ${provider}`);
    }
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.stop();
    this.healingEvents = [];
    this.recoveryStates.clear();
    this.healingCooldowns.clear();
    this.recoveryTimes = [];
  }
}

// Global self-healer instance
let globalSelfHealer: SelfHealer | null = null;

export function getGlobalSelfHealer(
  healthMonitor?: HealthMonitor,
  circuitBreakerRegistry?: CircuitBreakerRegistry,
  config?: Partial<SelfHealerConfig>,
  logger?: StructuredLogger,
  metrics?: MetricsCollector,
  providerRegistry?: ProviderRegistry
): SelfHealer {
  if (!globalSelfHealer) {
    if (!healthMonitor || !circuitBreakerRegistry) {
      throw new Error('HealthMonitor and CircuitBreakerRegistry required for global SelfHealer');
    }
    globalSelfHealer = new SelfHealer(
      healthMonitor,
      circuitBreakerRegistry,
      config,
      logger,
      metrics,
      providerRegistry
    );
  }
  return globalSelfHealer;
}

export function setGlobalSelfHealer(selfHealer: SelfHealer): void {
  globalSelfHealer = selfHealer;
}
