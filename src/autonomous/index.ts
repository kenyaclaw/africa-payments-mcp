/**
 * Autonomous Operations Module for Africa Payments MCP
 * 
 * This module provides self-healing, auto-scaling, predictive maintenance,
 * and auto-optimization capabilities for the payment platform.
 */

// Export all autonomous components
export { SelfHealer, getGlobalSelfHealer, setGlobalSelfHealer } from './self-healer.js';
export { AutoScaler, getGlobalAutoScaler, setGlobalAutoScaler } from './auto-scaler.js';
export { PredictiveMaintenance, getGlobalPredictor, setGlobalPredictor } from './predictor.js';
export { AutoOptimizer, getGlobalOptimizer, setGlobalOptimizer } from './optimizer.js';

// Export types
export type {
  SelfHealerConfig,
  HealingEvent,
  ProviderRecoveryState,
  SelfHealerStats,
} from './self-healer.js';

export type {
  AutoScalerConfig,
  ScalingEvent,
  LoadMetrics,
  ScalingSchedule,
  AutoScalerStats,
} from './auto-scaler.js';

export type {
  PredictorConfig,
  Prediction,
  PredictionIndicator,
  DegradationPattern,
  MaintenanceWindow,
  TrendAnalysis,
  PredictorStats,
} from './predictor.js';

export type {
  OptimizerConfig,
  Optimization,
  OptimizationResult,
  ProviderPerformanceMetrics,
  ProviderOptimizationState,
  ProviderOptimizedConfig,
  OptimizerStats,
} from './optimizer.js';

import { EventEmitter } from 'events';
import { StructuredLogger, getGlobalLogger } from '../utils/structured-logger.js';
import { HealthMonitor, getGlobalHealthMonitor } from '../utils/health-check.js';
import { CircuitBreakerRegistry, getGlobalCircuitBreakerRegistry } from '../utils/circuit-breaker.js';
import { MetricsCollector, getGlobalMetrics } from '../utils/metrics.js';
import { ProviderRegistry, getGlobalProviderRegistry } from '../utils/registry.js';

import { SelfHealer, SelfHealerConfig } from './self-healer.js';
import { AutoScaler, AutoScalerConfig } from './auto-scaler.js';
import { PredictiveMaintenance, PredictorConfig } from './predictor.js';
import { AutoOptimizer, OptimizerConfig } from './optimizer.js';

/**
 * Configuration for the Autonomous System
 */
export interface AutonomousSystemConfig {
  /** Enable self-healing */
  selfHealing?: boolean;
  /** Enable auto-scaling */
  autoScaling?: boolean;
  /** Enable predictive maintenance */
  predictiveMaintenance?: boolean;
  /** Enable auto-optimization */
  autoOptimization?: boolean;
  /** Self-healer configuration */
  selfHealerConfig?: Partial<SelfHealerConfig>;
  /** Auto-scaler configuration */
  autoScalerConfig?: Partial<AutoScalerConfig>;
  /** Predictor configuration */
  predictorConfig?: Partial<PredictorConfig>;
  /** Optimizer configuration */
  optimizerConfig?: Partial<OptimizerConfig>;
}

/**
 * Status of the autonomous system
 */
export interface AutonomousSystemStatus {
  isRunning: boolean;
  selfHealer: {
    running: boolean;
    registeredProviders: number;
    activeRecoveries: number;
    recentEvents: number;
  };
  autoScaler: {
    running: boolean;
    currentInstances: number;
    recentScalingEvents: number;
  };
  predictor: {
    running: boolean;
    activePredictions: number;
    scheduledMaintenances: number;
  };
  optimizer: {
    running: boolean;
    providersOptimized: number;
    pendingOptimizations: number;
  };
}

/**
 * Complete autonomous system that orchestrates all autonomous operations
 */
export class AutonomousSystem extends EventEmitter {
  private config: AutonomousSystemConfig;
  private logger: StructuredLogger;
  
  private healthMonitor: HealthMonitor;
  private circuitBreakerRegistry: CircuitBreakerRegistry;
  private metrics?: MetricsCollector;
  private providerRegistry?: ProviderRegistry;
  
  private selfHealer?: SelfHealer;
  private autoScaler?: AutoScaler;
  private predictor?: PredictiveMaintenance;
  private optimizer?: AutoOptimizer;
  
  private isRunning = false;

  constructor(
    config: AutonomousSystemConfig = {},
    logger?: StructuredLogger,
    healthMonitor?: HealthMonitor,
    circuitBreakerRegistry?: CircuitBreakerRegistry,
    metrics?: MetricsCollector,
    providerRegistry?: ProviderRegistry
  ) {
    super();
    
    this.config = {
      selfHealing: true,
      autoScaling: true,
      predictiveMaintenance: true,
      autoOptimization: true,
      ...config,
    };
    
    this.logger = logger || getGlobalLogger();
    this.healthMonitor = healthMonitor || getGlobalHealthMonitor();
    this.circuitBreakerRegistry = circuitBreakerRegistry || getGlobalCircuitBreakerRegistry();
    this.metrics = metrics || (this.tryGetGlobalMetrics());
    this.providerRegistry = providerRegistry || (this.tryGetGlobalProviderRegistry());
  }

  private tryGetGlobalMetrics(): MetricsCollector | undefined {
    try {
      return getGlobalMetrics();
    } catch {
      return undefined;
    }
  }

  private tryGetGlobalProviderRegistry(): ProviderRegistry | undefined {
    try {
      return getGlobalProviderRegistry();
    } catch {
      return undefined;
    }
  }

  /**
   * Initialize and start the autonomous system
   */
  async initialize(): Promise<void> {
    this.logger.info('🤖 Initializing Autonomous System...');

    // Initialize Self-Healer
    if (this.config.selfHealing) {
      this.selfHealer = new SelfHealer(
        this.healthMonitor,
        this.circuitBreakerRegistry,
        this.config.selfHealerConfig,
        this.logger,
        this.metrics,
        this.providerRegistry
      );

      this.selfHealer.on('healing_event', (event) => {
        this.emit('healing_event', event);
      });

      this.selfHealer.on('provider_recovered', (data) => {
        this.emit('provider_recovered', data);
      });

      this.selfHealer.on('failover_triggered', (data) => {
        this.emit('failover_triggered', data);
      });

      this.selfHealer.on('critical_system_state', (data) => {
        this.emit('critical_system_state', data);
      });
    }

    // Initialize Auto-Scaler
    if (this.config.autoScaling) {
      this.autoScaler = new AutoScaler(
        this.config.autoScalerConfig,
        2, // Initial instances
        this.logger,
        this.metrics
      );

      this.autoScaler.on('scaled_up', (data) => {
        this.emit('scaled_up', data);
      });

      this.autoScaler.on('scaled_down', (data) => {
        this.emit('scaled_down', data);
      });

      this.autoScaler.on('scaling_event', (event) => {
        this.emit('scaling_event', event);
      });
    }

    // Initialize Predictor
    if (this.config.predictiveMaintenance) {
      this.predictor = new PredictiveMaintenance(
        this.healthMonitor,
        this.circuitBreakerRegistry,
        this.config.predictorConfig,
        this.logger,
        this.metrics
      );

      this.predictor.on('prediction', (prediction) => {
        this.emit('prediction', prediction);
      });

      this.predictor.on('maintenance_scheduled', (window) => {
        this.emit('maintenance_scheduled', window);
      });

      this.predictor.on('prediction_confirmed', (prediction) => {
        this.emit('prediction_confirmed', prediction);
      });
    }

    // Initialize Optimizer
    if (this.config.autoOptimization) {
      this.optimizer = new AutoOptimizer(
        this.healthMonitor,
        this.circuitBreakerRegistry,
        this.config.optimizerConfig,
        this.logger,
        this.metrics,
        this.providerRegistry
      );

      this.optimizer.on('optimization_applied', (opt) => {
        this.emit('optimization_applied', opt);
      });

      this.optimizer.on('optimization_evaluated', (opt) => {
        this.emit('optimization_evaluated', opt);
      });
    }

    this.logger.info('✅ Autonomous System initialized');
    this.emit('initialized');
  }

  /**
   * Start all autonomous operations
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.logger.info('🚀 Starting Autonomous System...');

    // Start health monitor first
    this.healthMonitor.start();

    // Start Self-Healer
    if (this.selfHealer) {
      this.selfHealer.start();
      
      // Register all existing providers
      const providers = this.healthMonitor.getHealthResult().providers;
      providers.forEach(p => this.selfHealer?.registerProvider(p.name));
    }

    // Start Auto-Scaler
    if (this.autoScaler) {
      this.autoScaler.start();
    }

    // Start Predictor
    if (this.predictor) {
      this.predictor.start();
    }

    // Start Optimizer
    if (this.optimizer) {
      this.optimizer.start();
      
      // Register all existing providers
      const providers = this.healthMonitor.getHealthResult().providers;
      providers.forEach(p => this.optimizer?.registerProvider(p.name));
    }

    this.logger.info('✅ Autonomous System running');
    this.emit('started');
  }

  /**
   * Stop all autonomous operations
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.logger.info('🛑 Stopping Autonomous System...');

    this.selfHealer?.stop();
    this.autoScaler?.stop();
    this.predictor?.stop();
    this.optimizer?.stop();

    this.logger.info('✅ Autonomous System stopped');
    this.emit('stopped');
  }

  /**
   * Register a provider for autonomous management
   */
  registerProvider(provider: string, backupProviders?: string[]): void {
    this.logger.info(`Registering provider for autonomous management: ${provider}`);

    // Register with Self-Healer
    if (this.selfHealer) {
      this.selfHealer.registerProvider(provider);
      
      if (backupProviders && backupProviders.length > 0) {
        this.selfHealer.setBackupProviders(provider, backupProviders);
      }
    }

    // Register with Optimizer
    if (this.optimizer) {
      this.optimizer.registerProvider(provider);
    }

    this.emit('provider_registered', { provider, backupProviders });
  }

  /**
   * Get comprehensive system status
   */
  getStatus(): AutonomousSystemStatus {
    return {
      isRunning: this.isRunning,
      selfHealer: {
        running: this.selfHealer?.getStatus().isRunning || false,
        registeredProviders: this.selfHealer?.getStatus().registeredProviders || 0,
        activeRecoveries: this.selfHealer?.getStatus().activeRecoveries || 0,
        recentEvents: this.selfHealer?.getStatus().recentEvents || 0,
      },
      autoScaler: {
        running: this.autoScaler?.getStats().currentInstances !== undefined,
        currentInstances: this.autoScaler?.getStats().currentInstances || 0,
        recentScalingEvents: this.autoScaler?.getScalingEvents({ since: new Date(Date.now() - 3600000) }).length || 0,
      },
      predictor: {
        running: this.predictor?.getStats().totalPredictions !== undefined,
        activePredictions: this.predictor?.getActivePredictions().length || 0,
        scheduledMaintenances: this.predictor?.getMaintenanceWindows({ upcoming: true }).length || 0,
      },
      optimizer: {
        running: this.optimizer?.getStats().totalOptimizations !== undefined,
        providersOptimized: this.optimizer?.getStats().providersOptimized || 0,
        pendingOptimizations: this.optimizer?.getStats().pendingOptimizations || 0,
      },
    };
  }

  /**
   * Get complete autonomous system statistics
   */
  getStats(): {
    selfHealer: ReturnType<SelfHealer['getStats']>;
    autoScaler: ReturnType<AutoScaler['getStats']>;
    predictor: ReturnType<PredictiveMaintenance['getStats']>;
    optimizer: ReturnType<AutoOptimizer['getStats']>;
  } {
    return {
      selfHealer: this.selfHealer?.getStats() || {
        totalHealingEvents: 0,
        successfulHealings: 0,
        failedHealings: 0,
        circuitBreakerResets: 0,
        providerRestarts: 0,
        failoverEvents: 0,
        activeRecoveries: 0,
        avgRecoveryTimeMs: 0,
      },
      autoScaler: this.autoScaler?.getStats() || {
        totalScalingEvents: 0,
        scaleUpEvents: 0,
        scaleDownEvents: 0,
        predictionEvents: 0,
        currentInstances: 0,
        averageUtilization: 0,
        costSavingsEstimate: 0,
      },
      predictor: this.predictor?.getStats() || {
        totalPredictions: 0,
        accuratePredictions: 0,
        falsePositives: 0,
        missedFailures: 0,
        avgConfidence: 0,
        avgLeadTimeMinutes: 0,
        activeAlerts: 0,
        scheduledMaintenances: 0,
      },
      optimizer: this.optimizer?.getStats() || {
        totalOptimizations: 0,
        successfulOptimizations: 0,
        revertedOptimizations: 0,
        pendingOptimizations: 0,
        avgImprovement: 0,
        providersOptimized: 0,
      },
    };
  }

  /**
   * Force healing for a provider
   */
  async forceHealing(provider: string): Promise<void> {
    if (!this.selfHealer) {
      throw new Error('Self-healer not enabled');
    }
    await this.selfHealer.forceHealing(provider, 'Manual trigger');
  }

  /**
   * Force scaling
   */
  async forceScale(targetInstances: number): Promise<void> {
    if (!this.autoScaler) {
      throw new Error('Auto-scaler not enabled');
    }
    await this.autoScaler.forceScale(targetInstances, 'Manual trigger');
  }

  /**
   * Force prediction analysis
   */
  async forcePredictionAnalysis(): Promise<void> {
    if (!this.predictor) {
      throw new Error('Predictor not enabled');
    }
    await this.predictor.forceAnalysis();
  }

  /**
   * Get optimized configuration for a provider
   */
  getOptimizedConfig(provider: string): ReturnType<AutoOptimizer['getOptimizedConfig']> {
    return this.optimizer?.getOptimizedConfig(provider);
  }

  /**
   * Access individual autonomous components
   */
  getSelfHealer(): SelfHealer | undefined {
    return this.selfHealer;
  }

  getAutoScaler(): AutoScaler | undefined {
    return this.autoScaler;
  }

  getPredictor(): PredictiveMaintenance | undefined {
    return this.predictor;
  }

  getOptimizer(): AutoOptimizer | undefined {
    return this.optimizer;
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.stop();
    this.selfHealer?.dispose();
    this.autoScaler?.dispose();
    this.predictor?.dispose();
    this.optimizer?.dispose();
    this.removeAllListeners();
  }
}

// Global autonomous system instance
let globalAutonomousSystem: AutonomousSystem | null = null;

export function getGlobalAutonomousSystem(
  config?: AutonomousSystemConfig,
  logger?: StructuredLogger,
  healthMonitor?: HealthMonitor,
  circuitBreakerRegistry?: CircuitBreakerRegistry,
  metrics?: MetricsCollector,
  providerRegistry?: ProviderRegistry
): AutonomousSystem {
  if (!globalAutonomousSystem) {
    globalAutonomousSystem = new AutonomousSystem(
      config,
      logger,
      healthMonitor,
      circuitBreakerRegistry,
      metrics,
      providerRegistry
    );
  }
  return globalAutonomousSystem;
}

export function setGlobalAutonomousSystem(system: AutonomousSystem): void {
  globalAutonomousSystem = system;
}
