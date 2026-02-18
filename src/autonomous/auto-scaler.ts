/**
 * Auto-Scaling System for Africa Payments MCP
 * 
 * Features:
 * - Monitor transaction volume in real-time
 * - Scale up when load increases
 * - Scale down when quiet
 * - Kubernetes HPA integration
 * - Cost optimization
 */

import { EventEmitter } from 'events';
import { StructuredLogger, getGlobalLogger } from '../utils/structured-logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export interface AutoScalerConfig {
  /** Check interval in milliseconds */
  checkIntervalMs: number;
  /** Target transactions per instance per minute */
  targetTransactionsPerInstance: number;
  /** Minimum number of instances */
  minInstances: number;
  /** Maximum number of instances */
  maxInstances: number;
  /** Scale up threshold (transactions per instance > target * scaleUpThreshold) */
  scaleUpThreshold: number;
  /** Scale down threshold (transactions per instance < target * scaleDownThreshold) */
  scaleDownThreshold: number;
  /** Cooldown period after scaling up */
  scaleUpCooldownMs: number;
  /** Cooldown period after scaling down */
  scaleDownCooldownMs: number;
  /** Enable predictive scaling based on patterns */
  predictiveScalingEnabled: boolean;
  /** Prediction window in minutes */
  predictionWindowMinutes: number;
  /** Enable cost optimization (prefer scaling down) */
  costOptimizationEnabled: boolean;
  /** Maximum scale steps per operation */
  maxScaleSteps: number;
  /** Kubernetes namespace */
  k8sNamespace?: string;
  /** Kubernetes deployment name */
  k8sDeployment?: string;
  /** Custom scale provider: 'kubernetes' | 'docker' | 'aws' | 'custom' */
  scaleProvider: string;
}

export interface ScalingEvent {
  id: string;
  timestamp: Date;
  type: 'scale_up' | 'scale_down' | 'prediction_scale';
  fromInstances: number;
  toInstances: number;
  reason: string;
  metrics: {
    currentTransactionsPerMinute: number;
    targetTransactionsPerInstance: number;
    utilization: number;
    prediction?: {
      expectedLoad: number;
      confidence: number;
    };
  };
  status: 'started' | 'completed' | 'failed';
  error?: string;
}

export interface LoadMetrics {
  timestamp: Date;
  transactionsPerMinute: number;
  averageResponseTime: number;
  errorRate: number;
  activeConnections: number;
  cpuUtilization?: number;
  memoryUtilization?: number;
}

export interface ScalingSchedule {
  timeOfDay: string; // HH:mm format
  dayOfWeek: number; // 0-6, 0 = Sunday
  expectedLoadFactor: number; // 0.5 = 50% of normal
  description: string;
}

export interface AutoScalerStats {
  totalScalingEvents: number;
  scaleUpEvents: number;
  scaleDownEvents: number;
  predictionEvents: number;
  currentInstances: number;
  averageUtilization: number;
  costSavingsEstimate: number; // percentage
  lastScaleTime?: Date;
}

const DEFAULT_CONFIG: AutoScalerConfig = {
  checkIntervalMs: 30000, // 30 seconds
  targetTransactionsPerInstance: 100, // 100 TPM per instance
  minInstances: 2,
  maxInstances: 20,
  scaleUpThreshold: 0.8, // Scale up at 80% utilization
  scaleDownThreshold: 0.3, // Scale down at 30% utilization
  scaleUpCooldownMs: 120000, // 2 minutes
  scaleDownCooldownMs: 300000, // 5 minutes
  predictiveScalingEnabled: true,
  predictionWindowMinutes: 10,
  costOptimizationEnabled: true,
  maxScaleSteps: 3,
  scaleProvider: 'kubernetes',
};

// Known traffic patterns for African markets (UTC)
const DEFAULT_SCHEDULES: ScalingSchedule[] = [
  { timeOfDay: '08:00', dayOfWeek: 1, expectedLoadFactor: 1.5, description: 'Monday morning peak' },
  { timeOfDay: '08:00', dayOfWeek: 2, expectedLoadFactor: 1.5, description: 'Tuesday morning peak' },
  { timeOfDay: '08:00', dayOfWeek: 3, expectedLoadFactor: 1.5, description: 'Wednesday morning peak' },
  { timeOfDay: '08:00', dayOfWeek: 4, expectedLoadFactor: 1.5, description: 'Thursday morning peak' },
  { timeOfDay: '08:00', dayOfWeek: 5, expectedLoadFactor: 1.5, description: 'Friday morning peak' },
  { timeOfDay: '12:00', dayOfWeek: 1, expectedLoadFactor: 1.3, description: 'Monday lunch peak' },
  { timeOfDay: '12:00', dayOfWeek: 2, expectedLoadFactor: 1.3, description: 'Tuesday lunch peak' },
  { timeOfDay: '12:00', dayOfWeek: 3, expectedLoadFactor: 1.3, description: 'Wednesday lunch peak' },
  { timeOfDay: '12:00', dayOfWeek: 4, expectedLoadFactor: 1.3, description: 'Thursday lunch peak' },
  { timeOfDay: '12:00', dayOfWeek: 5, expectedLoadFactor: 1.3, description: 'Friday lunch peak' },
  { timeOfDay: '17:00', dayOfWeek: 1, expectedLoadFactor: 1.4, description: 'Monday evening peak' },
  { timeOfDay: '17:00', dayOfWeek: 2, expectedLoadFactor: 1.4, description: 'Tuesday evening peak' },
  { timeOfDay: '17:00', dayOfWeek: 3, expectedLoadFactor: 1.4, description: 'Wednesday evening peak' },
  { timeOfDay: '17:00', dayOfWeek: 4, expectedLoadFactor: 1.4, description: 'Thursday evening peak' },
  { timeOfDay: '17:00', dayOfWeek: 5, expectedLoadFactor: 1.4, description: 'Friday evening peak' },
  { timeOfDay: '18:00', dayOfWeek: 5, expectedLoadFactor: 1.8, description: 'Friday night social payments' },
  { timeOfDay: '00:00', dayOfWeek: 0, expectedLoadFactor: 0.3, description: 'Sunday midnight low' },
  { timeOfDay: '00:00', dayOfWeek: 1, expectedLoadFactor: 0.2, description: 'Monday midnight low' },
  { timeOfDay: '00:00', dayOfWeek: 2, expectedLoadFactor: 0.2, description: 'Tuesday midnight low' },
  { timeOfDay: '00:00', dayOfWeek: 3, expectedLoadFactor: 0.2, description: 'Wednesday midnight low' },
  { timeOfDay: '00:00', dayOfWeek: 4, expectedLoadFactor: 0.2, description: 'Thursday midnight low' },
  { timeOfDay: '00:00', dayOfWeek: 5, expectedLoadFactor: 0.2, description: 'Friday midnight low' },
  { timeOfDay: '00:00', dayOfWeek: 6, expectedLoadFactor: 0.3, description: 'Saturday midnight low' },
];

export class AutoScaler extends EventEmitter {
  private config: AutoScalerConfig;
  private logger: StructuredLogger;
  private metrics?: MetricsCollector;
  
  private isRunning = false;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private currentInstances: number;
  private lastScaleTime?: Date;
  private lastScaleType?: 'up' | 'down';
  
  private scalingEvents: ScalingEvent[] = [];
  private loadHistory: LoadMetrics[] = [];
  private customSchedules: ScalingSchedule[] = [...DEFAULT_SCHEDULES];
  
  // Stats
  private stats: AutoScalerStats = {
    totalScalingEvents: 0,
    scaleUpEvents: 0,
    scaleDownEvents: 0,
    predictionEvents: 0,
    currentInstances: 0,
    averageUtilization: 0,
    costSavingsEstimate: 0,
  };

  constructor(
    config: Partial<AutoScalerConfig> = {},
    initialInstances = 2,
    logger?: StructuredLogger,
    metrics?: MetricsCollector
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentInstances = Math.max(this.config.minInstances, initialInstances);
    this.logger = logger || getGlobalLogger();
    this.metrics = metrics;
    
    // Initialize stats
    this.stats.currentInstances = this.currentInstances;
  }

  /**
   * Start the auto-scaler
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.logger.info('📈 Auto-Scaler started', {
      currentInstances: this.currentInstances,
      minInstances: this.config.minInstances,
      maxInstances: this.config.maxInstances,
      targetTransactionsPerInstance: this.config.targetTransactionsPerInstance,
      scaleProvider: this.config.scaleProvider,
    });

    // Start periodic scaling checks
    this.checkInterval = setInterval(() => {
      this.evaluateScaling();
    }, this.config.checkIntervalMs);

    // Initial evaluation
    this.evaluateScaling();

    this.emit('started', { currentInstances: this.currentInstances });
  }

  /**
   * Stop the auto-scaler
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.logger.info('🛑 Auto-Scaler stopped');
    this.emit('stopped');
  }

  /**
   * Evaluate if scaling is needed
   */
  private async evaluateScaling(): Promise<void> {
    try {
      // Collect current metrics
      const metrics = await this.collectMetrics();
      this.loadHistory.push(metrics);
      
      // Keep only last 60 minutes of history
      const cutoff = Date.now() - 3600000;
      this.loadHistory = this.loadHistory.filter(m => m.timestamp.getTime() > cutoff);

      // Calculate current utilization
      const utilization = this.calculateUtilization(metrics);
      this.stats.averageUtilization = utilization;

      // Check cooldowns
      if (this.isInCooldown('up') && this.isInCooldown('down')) {
        this.logger.debug('Scaling evaluation skipped - in cooldown');
        return;
      }

      // Check predictive scaling first
      if (this.config.predictiveScalingEnabled) {
        const prediction = this.predictLoad();
        if (prediction && prediction.confidence > 0.7) {
          await this.handlePredictiveScaling(prediction, metrics);
          return;
        }
      }

      // Reactive scaling based on current utilization
      if (utilization > this.config.scaleUpThreshold && !this.isInCooldown('up')) {
        if (this.currentInstances < this.config.maxInstances) {
          await this.scaleUp(utilization, metrics);
        }
      } else if (utilization < this.config.scaleDownThreshold && !this.isInCooldown('down')) {
        if (this.currentInstances > this.config.minInstances) {
          await this.scaleDown(utilization, metrics);
        }
      }

      // Update metrics if available
      if (this.metrics) {
        // Could expose custom metrics here
      }
    } catch (error) {
      this.logger.error('Error during scaling evaluation', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Collect current system metrics
   */
  private async collectMetrics(): Promise<LoadMetrics> {
    // In a real implementation, these would come from metrics collector
    // For now, we use placeholders that would be replaced with actual metrics
    
    const timestamp = new Date();
    
    // Calculate transactions per minute from history
    const transactionsPerMinute = this.calculateTransactionsPerMinute();
    
    // Get from metrics collector if available
    let averageResponseTime = 0;
    let errorRate = 0;
    let activeConnections = 0;
    
    if (this.metrics) {
      // These would be actual metric queries
      // For now, using simulated values
      averageResponseTime = this.simulateResponseTime();
      errorRate = this.simulateErrorRate();
      activeConnections = this.simulateActiveConnections();
    }

    return {
      timestamp,
      transactionsPerMinute,
      averageResponseTime,
      errorRate,
      activeConnections,
    };
  }

  /**
   * Calculate transactions per minute from history
   */
  private calculateTransactionsPerMinute(): number {
    if (this.loadHistory.length < 2) return 0;
    
    const recent = this.loadHistory.slice(-6); // Last 3 minutes (30s intervals)
    if (recent.length === 0) return 0;
    
    const avg = recent.reduce((sum, m) => sum + m.transactionsPerMinute, 0) / recent.length;
    return Math.round(avg);
  }

  /**
   * Calculate current utilization (0-1)
   */
  private calculateUtilization(metrics: LoadMetrics): number {
    const target = this.config.targetTransactionsPerInstance * this.currentInstances;
    if (target === 0) return 0;
    
    // Consider response time degradation
    let utilization = metrics.transactionsPerMinute / target;
    
    // Adjust for response time (if > 500ms, increase effective utilization)
    if (metrics.averageResponseTime > 500) {
      utilization *= 1.2;
    }
    
    // Adjust for error rate
    if (metrics.errorRate > 0.05) {
      utilization *= 1.3;
    }
    
    return Math.min(1, utilization);
  }

  /**
   * Predict future load
   */
  private predictLoad(): { expectedLoad: number; confidence: number } | null {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    const currentDay = now.getUTCDay();
    
    // Check schedule patterns
    const upcomingSchedules = this.customSchedules.filter(s => {
      const [hour, minute] = s.timeOfDay.split(':').map(Number);
      const scheduleTime = hour * 60 + minute;
      const currentTime = currentHour * 60 + currentMinute;
      const windowEnd = currentTime + this.config.predictionWindowMinutes;
      
      return s.dayOfWeek === currentDay && 
             scheduleTime > currentTime && 
             scheduleTime <= windowEnd;
    });

    if (upcomingSchedules.length === 0) return null;

    // Calculate expected load based on schedules
    let maxFactor = 1;
    for (const schedule of upcomingSchedules) {
      if (schedule.expectedLoadFactor > maxFactor) {
        maxFactor = schedule.expectedLoadFactor;
      }
    }

    // Calculate confidence based on schedule proximity
    const nearestSchedule = upcomingSchedules[0];
    const [hour, minute] = nearestSchedule.timeOfDay.split(':').map(Number);
    const scheduleTime = hour * 60 + minute;
    const currentTime = currentHour * 60 + currentMinute;
    const minutesUntil = scheduleTime - currentTime;
    const confidence = Math.max(0.5, 1 - (minutesUntil / this.config.predictionWindowMinutes));

    // Get current transactions and apply factor
    const currentTPM = this.calculateTransactionsPerMinute();
    const expectedLoad = currentTPM * maxFactor;

    return { expectedLoad, confidence };
  }

  /**
   * Handle predictive scaling
   */
  private async handlePredictiveScaling(
    prediction: { expectedLoad: number; confidence: number },
    currentMetrics: LoadMetrics
  ): Promise<void> {
    const targetCapacity = this.config.targetTransactionsPerInstance * this.currentInstances;
    const predictedUtilization = prediction.expectedLoad / targetCapacity;

    this.logger.info('Predictive scaling evaluation', {
      expectedLoad: prediction.expectedLoad,
      confidence: prediction.confidence,
      predictedUtilization,
      currentInstances: this.currentInstances,
    });

    if (predictedUtilization > this.config.scaleUpThreshold && !this.isInCooldown('up')) {
      if (this.currentInstances < this.config.maxInstances) {
        await this.scaleUp(predictedUtilization, currentMetrics, prediction);
      }
    }
  }

  /**
   * Scale up instances
   */
  private async scaleUp(
    utilization: number,
    metrics: LoadMetrics,
    prediction?: { expectedLoad: number; confidence: number }
  ): Promise<void> {
    const eventId = this.generateEventId();
    
    // Calculate how many instances to add
    const targetCapacity = metrics.transactionsPerMinute / (this.config.scaleUpThreshold * 0.9);
    const targetInstances = Math.ceil(targetCapacity / this.config.targetTransactionsPerInstance);
    const newInstances = Math.min(
      targetInstances,
      this.currentInstances + this.config.maxScaleSteps,
      this.config.maxInstances
    );

    if (newInstances <= this.currentInstances) return;

    const fromInstances = this.currentInstances;
    const toInstances = newInstances;

    this.logScalingEvent(eventId, 'scale_up', fromInstances, toInstances, 
      prediction ? 'Predictive scaling based on schedule' : 'High utilization detected', {
        currentTransactionsPerMinute: metrics.transactionsPerMinute,
        targetTransactionsPerInstance: this.config.targetTransactionsPerInstance,
        utilization,
        prediction,
      });

    try {
      await this.executeScale(toInstances);
      
      this.currentInstances = toInstances;
      this.lastScaleTime = new Date();
      this.lastScaleType = 'up';
      
      this.stats.totalScalingEvents++;
      this.stats.scaleUpEvents++;
      if (prediction) this.stats.predictionEvents++;
      this.stats.currentInstances = this.currentInstances;
      
      this.completeScalingEvent(eventId, 'completed');
      
      this.emit('scaled_up', {
        from: fromInstances,
        to: toInstances,
        reason: prediction ? 'prediction' : 'utilization',
        timestamp: new Date(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.completeScalingEvent(eventId, 'failed', errorMsg);
      this.emit('scaling_failed', { type: 'scale_up', errorMessage: errorMsg });
    }
  }

  /**
   * Scale down instances
   */
  private async scaleDown(
    utilization: number,
    metrics: LoadMetrics
  ): Promise<void> {
    // Cost optimization: be more conservative with scale down
    if (this.config.costOptimizationEnabled && utilization > 0.2) {
      return;
    }

    const eventId = this.generateEventId();
    
    // Calculate how many instances to remove
    const targetCapacity = metrics.transactionsPerMinute / Math.max(0.5, this.config.scaleDownThreshold * 1.5);
    const targetInstances = Math.ceil(targetCapacity / this.config.targetTransactionsPerInstance);
    const newInstances = Math.max(
      targetInstances,
      this.currentInstances - this.config.maxScaleSteps,
      this.config.minInstances
    );

    if (newInstances >= this.currentInstances) return;

    const fromInstances = this.currentInstances;
    const toInstances = newInstances;

    this.logScalingEvent(eventId, 'scale_down', fromInstances, toInstances,
      'Low utilization detected - cost optimization', {
        currentTransactionsPerMinute: metrics.transactionsPerMinute,
        targetTransactionsPerInstance: this.config.targetTransactionsPerInstance,
        utilization,
      });

    try {
      await this.executeScale(toInstances);
      
      this.currentInstances = toInstances;
      this.lastScaleTime = new Date();
      this.lastScaleType = 'down';
      
      this.stats.totalScalingEvents++;
      this.stats.scaleDownEvents++;
      this.stats.currentInstances = this.currentInstances;
      
      // Estimate cost savings
      const savings = ((fromInstances - toInstances) / fromInstances) * 100;
      this.stats.costSavingsEstimate = savings;
      
      this.completeScalingEvent(eventId, 'completed');
      
      this.emit('scaled_down', {
        from: fromInstances,
        to: toInstances,
        estimatedSavingsPercent: savings,
        timestamp: new Date(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.completeScalingEvent(eventId, 'failed', errorMsg);
      this.emit('scaling_failed', { type: 'scale_down', error: errorMsg });
    }
  }

  /**
   * Execute the actual scaling operation
   */
  private async executeScale(targetInstances: number): Promise<void> {
    this.logger.info(`Executing scale to ${targetInstances} instances`, {
      provider: this.config.scaleProvider,
    });

    switch (this.config.scaleProvider) {
      case 'kubernetes':
        await this.scaleKubernetes(targetInstances);
        break;
      case 'docker':
        await this.scaleDocker(targetInstances);
        break;
      case 'aws':
        await this.scaleAWS(targetInstances);
        break;
      case 'custom':
        await this.scaleCustom(targetInstances);
        break;
      default:
        // For testing/development, just log
        this.logger.info(`[MOCK] Would scale to ${targetInstances} instances`);
    }
  }

  /**
   * Scale using Kubernetes HPA
   */
  private async scaleKubernetes(targetInstances: number): Promise<void> {
    const { k8sNamespace, k8sDeployment } = this.config;
    
    if (!k8sNamespace || !k8sDeployment) {
      throw new Error('Kubernetes namespace and deployment must be configured');
    }

    // In a real implementation, this would use the Kubernetes API
    // kubectl scale deployment ${k8sDeployment} --replicas=${targetInstances} -n ${k8sNamespace}
    
    this.logger.info(`Kubernetes scale command: kubectl scale deployment ${k8sDeployment} --replicas=${targetInstances} -n ${k8sNamespace}`);
    
    // Emit for external handler
    this.emit('kubernetes_scale', {
      namespace: k8sNamespace,
      deployment: k8sDeployment,
      replicas: targetInstances,
    });
  }

  /**
   * Scale using Docker Compose
   */
  private async scaleDocker(targetInstances: number): Promise<void> {
    // docker-compose up -d --scale app=${targetInstances}
    this.logger.info(`Docker scale command: docker-compose up -d --scale app=${targetInstances}`);
    
    this.emit('docker_scale', {
      replicas: targetInstances,
    });
  }

  /**
   * Scale using AWS Auto Scaling
   */
  private async scaleAWS(targetInstances: number): Promise<void> {
    // aws autoscaling update-auto-scaling-group --auto-scaling-group-name ...
    this.logger.info(`AWS scale to ${targetInstances} instances`);
    
    this.emit('aws_scale', {
      desiredCapacity: targetInstances,
    });
  }

  /**
   * Custom scaling handler
   */
  private async scaleCustom(targetInstances: number): Promise<void> {
    this.emit('custom_scale', {
      targetInstances,
      currentInstances: this.currentInstances,
    });
  }

  /**
   * Check if in cooldown period
   */
  private isInCooldown(type: 'up' | 'down'): boolean {
    if (!this.lastScaleTime) return false;
    
    const cooldownMs = type === 'up' 
      ? this.config.scaleUpCooldownMs 
      : this.config.scaleDownCooldownMs;
    
    // If last scale was opposite direction, use shorter cooldown
    if (this.lastScaleType && this.lastScaleType !== type) {
      return Date.now() - this.lastScaleTime.getTime() < (cooldownMs / 2);
    }
    
    return Date.now() - this.lastScaleTime.getTime() < cooldownMs;
  }

  /**
   * Log a scaling event
   */
  private logScalingEvent(
    id: string,
    type: ScalingEvent['type'],
    fromInstances: number,
    toInstances: number,
    reason: string,
    metrics: ScalingEvent['metrics']
  ): void {
    const event: ScalingEvent = {
      id,
      timestamp: new Date(),
      type,
      fromInstances,
      toInstances,
      reason,
      metrics,
      status: 'started',
    };
    
    this.scalingEvents.push(event);
    
    // Keep only last 1000 events
    if (this.scalingEvents.length > 1000) {
      this.scalingEvents.shift();
    }

    this.logger.info(`[AutoScale] ${type}: ${fromInstances} -> ${toInstances}`, { reason, metrics });
    this.emit('scaling_event', event);
  }

  /**
   * Complete a scaling event
   */
  private completeScalingEvent(id: string, status: 'completed' | 'failed', error?: string): void {
    const event = this.scalingEvents.find(e => e.id === id);
    if (event) {
      event.status = status;
      event.error = error;
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `scale-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Simulated metric methods (would be replaced with real metrics)
  private simulateResponseTime(): number {
    const utilization = this.calculateUtilization(this.loadHistory[this.loadHistory.length - 1] || { 
      timestamp: new Date(), 
      transactionsPerMinute: 0, 
      averageResponseTime: 0, 
      errorRate: 0, 
      activeConnections: 0 
    });
    return 100 + utilization * 400 + Math.random() * 50;
  }

  private simulateErrorRate(): number {
    return Math.random() * 0.02;
  }

  private simulateActiveConnections(): number {
    return Math.floor(this.currentInstances * 10 + Math.random() * 50);
  }

  /**
   * Set current transaction rate (for external input)
   */
  setTransactionRate(transactionsPerMinute: number): void {
    const metrics: LoadMetrics = {
      timestamp: new Date(),
      transactionsPerMinute,
      averageResponseTime: this.simulateResponseTime(),
      errorRate: this.simulateErrorRate(),
      activeConnections: this.simulateActiveConnections(),
    };
    this.loadHistory.push(metrics);
  }

  /**
   * Get scaling events
   */
  getScalingEvents(options?: {
    type?: ScalingEvent['type'];
    limit?: number;
    since?: Date;
  }): ScalingEvent[] {
    let events = [...this.scalingEvents];
    
    if (options?.type) {
      events = events.filter(e => e.type === options.type);
    }
    
    if (options?.since) {
      events = events.filter(e => e.timestamp >= options.since!);
    }
    
    if (options?.limit) {
      events = events.slice(-options.limit);
    }
    
    return events.reverse();
  }

  /**
   * Get current load history
   */
  getLoadHistory(minutes = 60): LoadMetrics[] {
    const cutoff = Date.now() - (minutes * 60000);
    return this.loadHistory.filter(m => m.timestamp.getTime() > cutoff);
  }

  /**
   * Get auto-scaler statistics
   */
  getStats(): AutoScalerStats {
    return { ...this.stats };
  }

  /**
   * Get current configuration
   */
  getConfig(): AutoScalerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AutoScalerConfig>): void {
    this.config = { ...this.config, ...updates };
    this.logger.info('Auto-scaler configuration updated', updates);
  }

  /**
   * Add custom scaling schedule
   */
  addSchedule(schedule: ScalingSchedule): void {
    this.customSchedules.push(schedule);
    this.logger.info('Scaling schedule added', schedule);
  }

  /**
   * Force scale to specific number of instances
   */
  async forceScale(targetInstances: number, reason = 'Manual trigger'): Promise<void> {
    const clamped = Math.max(this.config.minInstances, Math.min(this.config.maxInstances, targetInstances));
    
    if (clamped === this.currentInstances) {
      this.logger.info(`Force scale: already at ${clamped} instances`);
      return;
    }

    this.logger.info(`Force scaling to ${clamped} instances`, { reason });
    
    const eventId = this.generateEventId();
    const type = clamped > this.currentInstances ? 'scale_up' : 'scale_down';
    
    this.logScalingEvent(eventId, type, this.currentInstances, clamped, reason, {
      currentTransactionsPerMinute: this.calculateTransactionsPerMinute(),
      targetTransactionsPerInstance: this.config.targetTransactionsPerInstance,
      utilization: this.calculateUtilization(await this.collectMetrics()),
    });

    try {
      await this.executeScale(clamped);
      this.currentInstances = clamped;
      this.stats.currentInstances = clamped;
      this.completeScalingEvent(eventId, 'completed');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.completeScalingEvent(eventId, 'failed', errorMsg);
      throw error;
    }
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.stop();
    this.scalingEvents = [];
    this.loadHistory = [];
    this.customSchedules = [];
  }
}

// Global auto-scaler instance
let globalAutoScaler: AutoScaler | null = null;

export function getGlobalAutoScaler(
  config?: Partial<AutoScalerConfig>,
  initialInstances?: number,
  logger?: StructuredLogger,
  metrics?: MetricsCollector
): AutoScaler {
  if (!globalAutoScaler) {
    globalAutoScaler = new AutoScaler(config, initialInstances, logger, metrics);
  }
  return globalAutoScaler;
}

export function setGlobalAutoScaler(autoScaler: AutoScaler): void {
  globalAutoScaler = autoScaler;
}
