/**
 * Predictive Maintenance System for Africa Payments MCP
 * 
 * Features:
 * - Predict API failures before they happen
 * - Monitor error rate trends
 * - Schedule maintenance windows
 * - Alert on degradation patterns
 */

import { EventEmitter } from 'events';
import { StructuredLogger, getGlobalLogger } from '../utils/structured-logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { HealthMonitor, ProviderHealth } from '../utils/health-check.js';
import { CircuitBreakerRegistry } from '../utils/circuit-breaker.js';

export interface PredictorConfig {
  /** Analysis interval in milliseconds */
  analysisIntervalMs: number;
  /** Window size for trend analysis in minutes */
  trendWindowMinutes: number;
  /** Error rate threshold for failure prediction */
  errorRateThreshold: number;
  /** Response time degradation threshold (percentage increase) */
  responseTimeThreshold: number;
  /** Minimum data points for reliable prediction */
  minDataPoints: number;
  /** Confidence threshold for alerts */
  confidenceThreshold: number;
  /** Enable automatic maintenance scheduling */
  autoScheduleMaintenance: boolean;
  /** Maintenance window duration in minutes */
  maintenanceWindowMinutes: number;
  /** Hours ahead to schedule maintenance */
  maintenanceScheduleAheadHours: number;
  /** Prediction sensitivity: 'low' | 'medium' | 'high' */
  sensitivity: 'low' | 'medium' | 'high';
}

export interface Prediction {
  id: string;
  timestamp: Date;
  provider: string;
  type: 'failure' | 'degradation' | 'spike' | 'pattern_anomaly';
  severity: 'info' | 'warning' | 'critical';
  confidence: number; // 0-1
  timeframe: {
    expected: Date;
    windowStart: Date;
    windowEnd: Date;
  };
  indicators: PredictionIndicator[];
  recommendedAction: string;
  status: 'active' | 'confirmed' | 'resolved' | 'false_positive';
}

export interface PredictionIndicator {
  name: string;
  value: number;
  threshold: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  weight: number;
}

export interface DegradationPattern {
  name: string;
  description: string;
  indicators: string[];
  severity: 'low' | 'medium' | 'high';
  confidence: number;
}

export interface MaintenanceWindow {
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  providers: string[];
  reason: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  predictions: string[]; // prediction IDs
}

export interface TrendAnalysis {
  provider: string;
  metric: string;
  currentValue: number;
  averageValue: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  slope: number;
  forecast: number[];
  anomalyScore: number;
}

export interface PredictorStats {
  totalPredictions: number;
  accuratePredictions: number;
  falsePositives: number;
  missedFailures: number;
  avgConfidence: number;
  avgLeadTimeMinutes: number;
  activeAlerts: number;
  scheduledMaintenances: number;
}

const DEFAULT_CONFIG: PredictorConfig = {
  analysisIntervalMs: 60000, // 1 minute
  trendWindowMinutes: 15,
  errorRateThreshold: 0.05, // 5%
  responseTimeThreshold: 0.5, // 50% increase
  minDataPoints: 10,
  confidenceThreshold: 0.7,
  autoScheduleMaintenance: true,
  maintenanceWindowMinutes: 30,
  maintenanceScheduleAheadHours: 24,
  sensitivity: 'medium',
};

// Sensitivity multipliers
const SENSITIVITY_MULTIPLIERS: Record<string, { errorRate: number; responseTime: number; confidence: number }> = {
  low: { errorRate: 1.5, responseTime: 1.5, confidence: 0.85 },
  medium: { errorRate: 1.0, responseTime: 1.0, confidence: 0.7 },
  high: { errorRate: 0.7, responseTime: 0.7, confidence: 0.55 },
};

export class PredictiveMaintenance extends EventEmitter {
  private config: PredictorConfig;
  private logger: StructuredLogger;
  private healthMonitor: HealthMonitor;
  private circuitBreakerRegistry: CircuitBreakerRegistry;
  private metrics?: MetricsCollector;
  
  private isRunning = false;
  private analysisInterval: ReturnType<typeof setInterval> | null = null;
  
  private predictions: Prediction[] = [];
  private maintenanceWindows: MaintenanceWindow[] = [];
  private historicalData = new Map<string, MetricDataPoint[]>();
  
  // Stats
  private stats: PredictorStats = {
    totalPredictions: 0,
    accuratePredictions: 0,
    falsePositives: 0,
    missedFailures: 0,
    avgConfidence: 0,
    avgLeadTimeMinutes: 0,
    activeAlerts: 0,
    scheduledMaintenances: 0,
  };

  constructor(
    healthMonitor: HealthMonitor,
    circuitBreakerRegistry: CircuitBreakerRegistry,
    config: Partial<PredictorConfig> = {},
    logger?: StructuredLogger,
    metrics?: MetricsCollector
  ) {
    super();
    this.healthMonitor = healthMonitor;
    this.circuitBreakerRegistry = circuitBreakerRegistry;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger || getGlobalLogger();
    this.metrics = metrics;
  }

  /**
   * Start the predictive maintenance system
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.logger.info('🔮 Predictive Maintenance started', {
      analysisIntervalMs: this.config.analysisIntervalMs,
      sensitivity: this.config.sensitivity,
      autoScheduleMaintenance: this.config.autoScheduleMaintenance,
    });

    // Start periodic analysis
    this.analysisInterval = setInterval(() => {
      this.runAnalysis();
    }, this.config.analysisIntervalMs);

    // Initial analysis
    this.runAnalysis();

    this.emit('started');
  }

  /**
   * Stop the predictive maintenance system
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    this.logger.info('🛑 Predictive Maintenance stopped');
    this.emit('stopped');
  }

  /**
   * Run analysis on all providers
   */
  private async runAnalysis(): Promise<void> {
    try {
      const providers = this.getMonitoredProviders();
      
      for (const provider of providers) {
        await this.analyzeProvider(provider);
      }

      // Update prediction statuses
      this.updatePredictionStatuses();
      
      // Clean up old data
      this.cleanupOldData();
      
    } catch (error) {
      this.logger.error('Error during predictive analysis', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Analyze a single provider
   */
  private async analyzeProvider(provider: string): Promise<void> {
    // Collect current metrics
    const dataPoint = await this.collectMetrics(provider);
    
    // Store historical data
    if (!this.historicalData.has(provider)) {
      this.historicalData.set(provider, []);
    }
    const providerData = this.historicalData.get(provider)!;
    providerData.push(dataPoint);

    // Check if we have enough data
    if (providerData.length < this.config.minDataPoints) {
      return;
    }

    // Run various analyses
    const analyses = [
      this.analyzeErrorTrend(provider, providerData),
      this.analyzeResponseTimeTrend(provider, providerData),
      this.analyzePatternAnomalies(provider, providerData),
      this.analyzeCircuitBreakerPattern(provider),
    ];

    // Check for predictions
    for (const analysis of analyses) {
      if (analysis && analysis.confidence >= this.getAdjustedConfidenceThreshold()) {
        this.createPrediction(provider, analysis);
      }
    }
  }

  /**
   * Collect metrics for a provider
   */
  private async collectMetrics(provider: string): Promise<MetricDataPoint> {
    const health = this.healthMonitor.getProviderHealth(provider);
    const circuitBreaker = this.circuitBreakerRegistry.getStatus(provider);
    
    return {
      timestamp: new Date(),
      provider,
      responseTime: health?.responseTime || 0,
      errorRate: this.calculateErrorRate(provider),
      circuitBreakerState: circuitBreaker?.state || 'CLOSED',
      requestCount: this.getRequestCount(provider),
    };
  }

  /**
   * Analyze error rate trend
   */
  private analyzeErrorTrend(provider: string, data: MetricDataPoint[]): TrendAnalysis | null {
    const recent = data.slice(-this.config.minDataPoints);
    const errorRates = recent.map(d => d.errorRate);
    
    const current = errorRates[errorRates.length - 1];
    const average = errorRates.reduce((a, b) => a + b, 0) / errorRates.length;
    
    // Calculate trend using linear regression
    const slope = this.calculateSlope(errorRates);
    const trend = slope > 0.001 ? 'increasing' : slope < -0.001 ? 'decreasing' : 'stable';
    
    // Forecast next values
    const forecast = this.forecastValues(errorRates, 3);
    
    // Calculate anomaly score
    const anomalyScore = this.calculateAnomalyScore(errorRates);
    
    // Check if prediction threshold is met
    const adjustedThreshold = this.config.errorRateThreshold * 
      SENSITIVITY_MULTIPLIERS[this.config.sensitivity].errorRate;
    
    if (trend === 'increasing' && (current > adjustedThreshold * 0.5 || forecast[0] > adjustedThreshold)) {
      // Confidence calculation for trend analysis
    const _confidence = Math.min(1, (current / adjustedThreshold) * 0.5 + Math.abs(slope) * 10 + anomalyScore * 0.3);
      
      return {
        provider,
        metric: 'error_rate',
        currentValue: current,
        averageValue: average,
        trend,
        slope,
        forecast,
        anomalyScore,
      };
    }
    
    return null;
  }

  /**
   * Analyze response time trend
   */
  private analyzeResponseTimeTrend(provider: string, data: MetricDataPoint[]): TrendAnalysis | null {
    const recent = data.slice(-this.config.minDataPoints);
    const responseTimes = recent.map(d => d.responseTime);
    
    const current = responseTimes[responseTimes.length - 1];
    const average = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    
    // Calculate trend
    const slope = this.calculateSlope(responseTimes);
    const trend = slope > 5 ? 'increasing' : slope < -5 ? 'decreasing' : 'stable';
    
    // Forecast
    const forecast = this.forecastValues(responseTimes, 3);
    
    // Anomaly score
    const anomalyScore = this.calculateAnomalyScore(responseTimes);
    
    // Check degradation threshold
    const degradationRatio = average > 0 ? (current - average) / average : 0;
    const adjustedThreshold = this.config.responseTimeThreshold * 
      SENSITIVITY_MULTIPLIERS[this.config.sensitivity].responseTime;
    
    if (trend === 'increasing' && (degradationRatio > adjustedThreshold * 0.5 || forecast[0] > average * (1 + adjustedThreshold))) {
      const confidence = Math.min(1, (degradationRatio / adjustedThreshold) * 0.5 + Math.abs(slope) / 100 + anomalyScore * 0.3);
      
      return {
        provider,
        metric: 'response_time',
        currentValue: current,
        averageValue: average,
        trend,
        slope,
        forecast,
        anomalyScore,
      };
    }
    
    return null;
  }

  /**
   * Analyze for pattern anomalies
   */
  private analyzePatternAnomalies(provider: string, data: MetricDataPoint[]): TrendAnalysis | null {
    const recent = data.slice(-Math.floor(this.config.minDataPoints * 1.5));
    
    // Check for unusual patterns
    const errorSpikes = this.detectSpikes(recent.map(d => d.errorRate), 2);
    const latencySpikes = this.detectSpikes(recent.map(d => d.responseTime), 2);
    
    if (errorSpikes.length > 0 || latencySpikes.length > 0) {
      const current = recent[recent.length - 1];
      const anomalyScore = (errorSpikes.length + latencySpikes.length) / recent.length;
      
      return {
        provider,
        metric: 'pattern_anomaly',
        currentValue: anomalyScore,
        averageValue: 0,
        trend: 'increasing',
        slope: anomalyScore,
        forecast: [anomalyScore * 1.2, anomalyScore * 1.4],
        anomalyScore,
      };
    }
    
    return null;
  }

  /**
   * Analyze circuit breaker patterns
   */
  private analyzeCircuitBreakerPattern(provider: string): TrendAnalysis | null {
    const statuses = this.circuitBreakerRegistry.getAllStatuses();
    const providerStatus = statuses.find(s => s.provider === provider);
    
    if (!providerStatus) return null;
    
    // Check for frequent state changes (flapping)
    const data = this.historicalData.get(provider);
    if (!data || data.length < 5) return null;
    
    const stateChanges = this.countStateChanges(data.map(d => d.circuitBreakerState));
    
    if (stateChanges > 2) {
      return {
        provider,
        metric: 'circuit_breaker_flapping',
        currentValue: stateChanges,
        averageValue: 0,
        trend: 'increasing',
        slope: stateChanges,
        forecast: [stateChanges + 1],
        anomalyScore: stateChanges / 10,
      };
    }
    
    return null;
  }

  /**
   * Create a prediction from analysis
   */
  private createPrediction(provider: string, analysis: TrendAnalysis): void {
    // Check for existing active prediction
    const existing = this.predictions.find(p => 
      p.provider === provider && 
      p.status === 'active' &&
      p.type === this.getPredictionType(analysis.metric)
    );
    
    if (existing) {
      // Update existing prediction with new data
      existing.indicators = this.buildIndicators(analysis);
      existing.confidence = Math.min(1, existing.confidence + 0.05);
      return;
    }

    const prediction: Prediction = {
      id: this.generatePredictionId(),
      timestamp: new Date(),
      provider,
      type: this.getPredictionType(analysis.metric),
      severity: this.calculateSeverity(analysis),
      confidence: this.calculateConfidence(analysis),
      timeframe: this.calculateTimeframe(analysis),
      indicators: this.buildIndicators(analysis),
      recommendedAction: this.getRecommendedAction(analysis),
      status: 'active',
    };

    this.predictions.push(prediction);
    this.stats.totalPredictions++;
    this.updateAverageConfidence();

    this.logger.warn(`🔮 Prediction: ${prediction.type} for ${provider}`, {
      confidence: prediction.confidence,
      severity: prediction.severity,
      expected: prediction.timeframe.expected,
    });

    this.emit('prediction', prediction);

    // Auto-schedule maintenance if enabled and high confidence
    if (this.config.autoScheduleMaintenance && 
        prediction.confidence > 0.8 && 
        prediction.severity === 'critical') {
      this.scheduleMaintenance(prediction);
    }
  }

  /**
   * Schedule maintenance window
   */
  private scheduleMaintenance(prediction: Prediction): void {
    const scheduledAt = new Date();
    scheduledAt.setHours(scheduledAt.getHours() + this.config.maintenanceScheduleAheadHours);
    
    // Find optimal time (low traffic period)
    const optimalTime = this.findOptimalMaintenanceTime();
    
    const window: MaintenanceWindow = {
      id: `maint-${Date.now()}`,
      scheduledAt: optimalTime,
      durationMinutes: this.config.maintenanceWindowMinutes,
      providers: [prediction.provider],
      reason: `Predicted ${prediction.type}: ${prediction.indicators.map(i => i.name).join(', ')}`,
      status: 'scheduled',
      predictions: [prediction.id],
    };

    this.maintenanceWindows.push(window);
    this.stats.scheduledMaintenances++;

    this.logger.info(`📅 Maintenance scheduled for ${prediction.provider}`, {
      scheduledAt: window.scheduledAt,
      duration: window.durationMinutes,
    });

    this.emit('maintenance_scheduled', window);
  }

  /**
   * Find optimal maintenance time based on historical patterns
   */
  private findOptimalMaintenanceTime(): Date {
    const now = new Date();
    const optimal = new Date(now);
    optimal.setHours(now.getHours() + this.config.maintenanceScheduleAheadHours);
    
    // Prefer early morning hours (2-5 AM local time)
    // For African markets, this varies by timezone, but UTC 00:00-04:00 is generally quiet
    const currentHour = optimal.getUTCHours();
    if (currentHour < 2 || currentHour > 5) {
      optimal.setUTCHours(2, 0, 0, 0);
      if (optimal < now) {
        optimal.setUTCDate(optimal.getUTCDate() + 1);
      }
    }
    
    return optimal;
  }

  /**
   * Update prediction statuses based on actual outcomes
   */
  private updatePredictionStatuses(): void {
    for (const prediction of this.predictions) {
      if (prediction.status !== 'active') continue;

      const providerHealth = this.healthMonitor.getProviderHealth(prediction.provider);
      const now = new Date();
      const predictionAge = now.getTime() - prediction.timestamp.getTime();
      const maxAge = 60 * 60 * 1000; // 1 hour

      // Check if prediction came true
      if (providerHealth?.status === 'unhealthy') {
        if (predictionAge < maxAge) {
          prediction.status = 'confirmed';
          this.stats.accuratePredictions++;
          this.emit('prediction_confirmed', prediction);
        }
      }
      // Check if prediction window passed without incident
      else if (now > prediction.timeframe.windowEnd) {
        prediction.status = 'false_positive';
        this.stats.falsePositives++;
        this.emit('prediction_false_positive', prediction);
      }
    }

    this.updateAverageLeadTime();
  }

  /**
   * Get monitored providers
   */
  private getMonitoredProviders(): string[] {
    const healthResult = this.healthMonitor.getHealthResult();
    return healthResult.providers.map(p => p.name);
  }

  /**
   * Calculate error rate for a provider
   */
  private calculateErrorRate(provider: string): number {
    // This would integrate with actual metrics
    // For now, return a simulated value based on health status
    const health = this.healthMonitor.getProviderHealth(provider);
    if (health?.status === 'unhealthy') return 0.1 + Math.random() * 0.2;
    if (health?.status === 'degraded') return 0.05 + Math.random() * 0.05;
    return Math.random() * 0.02;
  }

  /**
   * Get request count for a provider
   */
  private getRequestCount(provider: string): number {
    // This would integrate with actual metrics
    return Math.floor(Math.random() * 1000);
  }

  /**
   * Calculate linear regression slope
   */
  private calculateSlope(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;
    
    const sumX = values.reduce((sum, _, i) => sum + i, 0);
    const sumY = values.reduce((sum, v) => sum + v, 0);
    const sumXY = values.reduce((sum, v, i) => sum + i * v, 0);
    const sumXX = values.reduce((sum, _, i) => sum + i * i, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return isNaN(slope) ? 0 : slope;
  }

  /**
   * Forecast future values using simple linear extrapolation
   */
  private forecastValues(values: number[], steps: number): number[] {
    const slope = this.calculateSlope(values);
    const lastValue = values[values.length - 1];
    const forecasts: number[] = [];
    
    for (let i = 1; i <= steps; i++) {
      forecasts.push(lastValue + slope * i);
    }
    
    return forecasts;
  }

  /**
   * Calculate anomaly score using standard deviation
   */
  private calculateAnomalyScore(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const lastValue = values[values.length - 1];
    
    return stdDev > 0 ? Math.abs(lastValue - mean) / stdDev : 0;
  }

  /**
   * Detect spikes in data
   */
  private detectSpikes(values: number[], threshold: number): number[] {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    const spikes: number[] = [];
    values.forEach((v, i) => {
      if (stdDev > 0 && Math.abs(v - mean) > stdDev * threshold) {
        spikes.push(i);
      }
    });
    
    return spikes;
  }

  /**
   * Count state changes
   */
  private countStateChanges(states: string[]): number {
    let changes = 0;
    for (let i = 1; i < states.length; i++) {
      if (states[i] !== states[i - 1]) {
        changes++;
      }
    }
    return changes;
  }

  /**
   * Get prediction type from metric name
   */
  private getPredictionType(metric: string): Prediction['type'] {
    switch (metric) {
      case 'error_rate':
        return 'failure';
      case 'response_time':
        return 'degradation';
      case 'pattern_anomaly':
      case 'circuit_breaker_flapping':
        return 'pattern_anomaly';
      default:
        return 'degradation';
    }
  }

  /**
   * Calculate severity from analysis
   */
  private calculateSeverity(analysis: TrendAnalysis): Prediction['severity'] {
    const anomalyScore = analysis.anomalyScore;
    const trend = analysis.trend;
    
    if (anomalyScore > 2 && trend === 'increasing') return 'critical';
    if (anomalyScore > 1.5 || trend === 'increasing') return 'warning';
    return 'info';
  }

  /**
   * Calculate confidence from analysis
   */
  private calculateConfidence(analysis: TrendAnalysis): number {
    let confidence = 0.5;
    
    // Increase confidence based on anomaly score
    confidence += Math.min(0.3, analysis.anomalyScore * 0.1);
    
    // Increase confidence for clear trends
    if (analysis.trend === 'increasing') {
      confidence += Math.min(0.2, Math.abs(analysis.slope) * 0.01);
    }
    
    return Math.min(1, confidence);
  }

  /**
   * Calculate expected timeframe
   */
  private calculateTimeframe(analysis: TrendAnalysis): Prediction['timeframe'] {
    const now = new Date();
    const expected = new Date(now);
    
    // Estimate time until threshold based on trend
    if (analysis.trend === 'increasing' && analysis.slope > 0) {
      const remaining = (analysis.averageValue * 0.5) / analysis.slope; // rough estimate
      expected.setMinutes(expected.getMinutes() + Math.max(5, Math.min(60, remaining)));
    } else {
      expected.setMinutes(expected.getMinutes() + 30); // default 30 min
    }
    
    const windowStart = new Date(expected);
    windowStart.setMinutes(windowStart.getMinutes() - 10);
    
    const windowEnd = new Date(expected);
    windowEnd.setMinutes(windowEnd.getMinutes() + 20);
    
    return { expected, windowStart, windowEnd };
  }

  /**
   * Build prediction indicators
   */
  private buildIndicators(analysis: TrendAnalysis): PredictionIndicator[] {
    return [{
      name: analysis.metric,
      value: analysis.currentValue,
      threshold: analysis.averageValue * 1.5,
      trend: analysis.trend,
      weight: 1.0,
    }];
  }

  /**
   * Get recommended action for analysis
   */
  private getRecommendedAction(analysis: TrendAnalysis): string {
    switch (analysis.metric) {
      case 'error_rate':
        return 'Schedule maintenance and investigate error sources';
      case 'response_time':
        return 'Consider scaling up or optimizing queries';
      case 'pattern_anomaly':
        return 'Monitor closely and prepare for potential issues';
      case 'circuit_breaker_flapping':
        return 'Investigate underlying instability, consider circuit breaker adjustment';
      default:
        return 'Monitor and investigate';
    }
  }

  /**
   * Get adjusted confidence threshold based on sensitivity
   */
  private getAdjustedConfidenceThreshold(): number {
    return this.config.confidenceThreshold * SENSITIVITY_MULTIPLIERS[this.config.sensitivity].confidence;
  }

  /**
   * Update average confidence
   */
  private updateAverageConfidence(): void {
    if (this.predictions.length === 0) {
      this.stats.avgConfidence = 0;
      return;
    }
    
    const sum = this.predictions.reduce((acc, p) => acc + p.confidence, 0);
    this.stats.avgConfidence = sum / this.predictions.length;
  }

  /**
   * Update average lead time
   */
  private updateAverageLeadTime(): void {
    const confirmed = this.predictions.filter(p => p.status === 'confirmed');
    if (confirmed.length === 0) {
      this.stats.avgLeadTimeMinutes = 0;
      return;
    }
    
    const leadTimes = confirmed.map(p => {
      const leadTime = p.timeframe.expected.getTime() - p.timestamp.getTime();
      return leadTime / 60000; // Convert to minutes
    });
    
    this.stats.avgLeadTimeMinutes = leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length;
  }

  /**
   * Cleanup old data
   */
  private cleanupOldData(): void {
    const cutoff = Date.now() - (this.config.trendWindowMinutes * 2 * 60000);
    
    for (const [provider, data] of this.historicalData.entries()) {
      const filtered = data.filter(d => d.timestamp.getTime() > cutoff);
      this.historicalData.set(provider, filtered);
    }
  }

  /**
   * Generate prediction ID
   */
  private generatePredictionId(): string {
    return `pred-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get active predictions
   */
  getActivePredictions(): Prediction[] {
    return this.predictions.filter(p => p.status === 'active');
  }

  /**
   * Get all predictions
   */
  getPredictions(options?: {
    provider?: string;
    type?: Prediction['type'];
    status?: Prediction['status'];
    limit?: number;
  }): Prediction[] {
    let preds = [...this.predictions];
    
    if (options?.provider) {
      preds = preds.filter(p => p.provider === options.provider);
    }
    
    if (options?.type) {
      preds = preds.filter(p => p.type === options.type);
    }
    
    if (options?.status) {
      preds = preds.filter(p => p.status === options.status);
    }
    
    if (options?.limit) {
      preds = preds.slice(-options.limit);
    }
    
    return preds.reverse();
  }

  /**
   * Get scheduled maintenance windows
   */
  getMaintenanceWindows(options?: {
    status?: MaintenanceWindow['status'];
    upcoming?: boolean;
  }): MaintenanceWindow[] {
    let windows = [...this.maintenanceWindows];
    
    if (options?.status) {
      windows = windows.filter(w => w.status === options.status);
    }
    
    if (options?.upcoming) {
      const now = new Date();
      windows = windows.filter(w => w.scheduledAt >= now);
    }
    
    return windows.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  }

  /**
   * Get predictor statistics
   */
  getStats(): PredictorStats {
    return { ...this.stats, activeAlerts: this.getActivePredictions().length };
  }

  /**
   * Update prediction status
   */
  updatePredictionStatus(id: string, status: Prediction['status']): void {
    const prediction = this.predictions.find(p => p.id === id);
    if (prediction) {
      prediction.status = status;
    }
  }

  /**
   * Cancel maintenance window
   */
  cancelMaintenanceWindow(id: string): boolean {
    const window = this.maintenanceWindows.find(w => w.id === id);
    if (window && window.status === 'scheduled') {
      window.status = 'cancelled';
      this.stats.scheduledMaintenances--;
      this.emit('maintenance_cancelled', window);
      return true;
    }
    return false;
  }

  /**
   * Force run analysis
   */
  async forceAnalysis(): Promise<void> {
    this.logger.info('Manual analysis triggered');
    await this.runAnalysis();
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.stop();
    this.predictions = [];
    this.maintenanceWindows = [];
    this.historicalData.clear();
  }
}

// Metric data point interface
interface MetricDataPoint {
  timestamp: Date;
  provider: string;
  responseTime: number;
  errorRate: number;
  circuitBreakerState: string;
  requestCount: number;
}

// Global predictor instance
let globalPredictor: PredictiveMaintenance | null = null;

export function getGlobalPredictor(
  healthMonitor?: HealthMonitor,
  circuitBreakerRegistry?: CircuitBreakerRegistry,
  config?: Partial<PredictorConfig>,
  logger?: StructuredLogger,
  metrics?: MetricsCollector
): PredictiveMaintenance {
  if (!globalPredictor) {
    if (!healthMonitor || !circuitBreakerRegistry) {
      throw new Error('HealthMonitor and CircuitBreakerRegistry required for global Predictor');
    }
    globalPredictor = new PredictiveMaintenance(
      healthMonitor,
      circuitBreakerRegistry,
      config,
      logger,
      metrics
    );
  }
  return globalPredictor;
}

export function setGlobalPredictor(predictor: PredictiveMaintenance): void {
  globalPredictor = predictor;
}
