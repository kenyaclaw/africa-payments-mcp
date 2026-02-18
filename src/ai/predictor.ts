/**
 * Predictive Alerting Module
 * 
 * Detects patterns that lead to failures and predicts capacity needs.
 * Uses simple statistical analysis and trend detection.
 */

import { Logger } from '../utils/logger.js';
import {
  PredictionAlert,
  AlertSeverity,
  AlertCategory,
  CapacityForecast,
  FailurePattern,
  TimeRange,
} from './types.js';

// Pattern thresholds
const THRESHOLDS = {
  FAILURE_RATE_SPIKE: 15, // 15% increase in failure rate
  LATENCY_SPIKE: 50, // 50% increase in latency
  CAPACITY_WARNING: 80, // 80% of predicted capacity
  CAPACITY_CRITICAL: 95, // 95% of predicted capacity
  MIN_SAMPLES: 10, // Minimum samples for pattern detection
};

interface MetricWindow {
  timestamp: Date;
  failureRate: number;
  latency: number;
  volume: number;
  provider: string;
  country: string;
}

interface Trend {
  direction: 'up' | 'down' | 'stable';
  magnitude: number;
  confidence: number;
}

export class Predictor {
  private metricHistory: MetricWindow[] = [];
  private alerts: PredictionAlert[] = [];
  private alertIdCounter = 0;
  private failurePatterns: Map<string, FailurePattern> = new Map();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Initialize the predictor
   */
  async initialize(): Promise<void> {
    this.logger.info('Predictor initialized');
  }

  /**
   * Record metrics for a time window
   */
  recordMetrics(
    provider: string,
    country: string,
    metrics: {
      failureRate: number;
      latency: number;
      volume: number;
    }
  ): void {
    const window: MetricWindow = {
      timestamp: new Date(),
      failureRate: metrics.failureRate,
      latency: metrics.latency,
      volume: metrics.volume,
      provider,
      country,
    };

    this.metricHistory.push(window);

    // Keep only last 7 days of data
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.metricHistory = this.metricHistory.filter(m => m.timestamp.getTime() > cutoff);

    // Check for patterns after recording
    this.analyzePatterns(provider, country);
  }

  /**
   * Analyze patterns and generate alerts
   */
  private analyzePatterns(provider: string, country: string): void {
    const recentData = this.getRecentData(provider, country, 60); // Last hour
    const historicalData = this.getRecentData(provider, country, 24 * 60); // Last 24 hours

    if (recentData.length < THRESHOLDS.MIN_SAMPLES) {
      return;
    }

    // Check for failure rate spikes
    this.checkFailureRateSpike(provider, country, recentData, historicalData);

    // Check for latency spikes
    this.checkLatencySpike(provider, country, recentData, historicalData);

    // Check for capacity issues
    this.checkCapacityIssues(provider, country, recentData);

    // Detect failure patterns
    this.detectFailurePatterns(provider, country);
  }

  /**
   * Check for failure rate spikes
   */
  private checkFailureRateSpike(
    provider: string,
    country: string,
    recent: MetricWindow[],
    historical: MetricWindow[]
  ): void {
    const recentAvg = recent.reduce((sum, m) => sum + m.failureRate, 0) / recent.length;
    const historicalAvg = historical.length > 0
      ? historical.reduce((sum, m) => sum + m.failureRate, 0) / historical.length
      : recentAvg;

    if (historicalAvg === 0) return;

    const increase = ((recentAvg - historicalAvg) / historicalAvg) * 100;

    if (increase >= THRESHOLDS.FAILURE_RATE_SPIKE) {
      const alert = this.createAlert({
        category: 'failure_pattern',
        severity: increase > 30 ? 'critical' : 'warning',
        message: `Failure rate increased by ${increase.toFixed(1)}% for ${provider} in ${country}`,
        confidence: Math.min(90, 50 + increase),
        timeframe: 'within 1 hour',
        providers: [provider],
        countries: [country],
        actions: [
          'Monitor transaction success rates closely',
          'Consider routing to alternative providers',
          'Check provider status page for known issues',
        ],
      });

      this.alerts.push(alert);
      this.logger.warn(`Alert generated: ${alert.message}`);
    }
  }

  /**
   * Check for latency spikes
   */
  private checkLatencySpike(
    provider: string,
    country: string,
    recent: MetricWindow[],
    historical: MetricWindow[]
  ): void {
    const recentAvg = recent.reduce((sum, m) => sum + m.latency, 0) / recent.length;
    const historicalAvg = historical.length > 0
      ? historical.reduce((sum, m) => sum + m.latency, 0) / historical.length
      : recentAvg;

    if (historicalAvg === 0) return;

    const increase = ((recentAvg - historicalAvg) / historicalAvg) * 100;

    if (increase >= THRESHOLDS.LATENCY_SPIKE) {
      const alert = this.createAlert({
        category: 'anomaly',
        severity: increase > 100 ? 'critical' : 'warning',
        message: `Latency increased by ${increase.toFixed(1)}% for ${provider} in ${country}`,
        confidence: Math.min(90, 50 + increase / 2),
        timeframe: 'within 1 hour',
        providers: [provider],
        countries: [country],
        actions: [
          'Monitor response times',
          'Consider enabling circuit breaker',
          'Check network connectivity',
        ],
      });

      this.alerts.push(alert);
      this.logger.warn(`Alert generated: ${alert.message}`);
    }
  }

  /**
   * Check for capacity issues
   */
  private checkCapacityIssues(
    provider: string,
    country: string,
    recent: MetricWindow[]
  ): void {
    // Predict next hour volume
    const currentVolume = recent.reduce((sum, m) => sum + m.volume, 0);
    const predictedVolume = this.predictVolume(provider, country);

    if (predictedVolume === 0) return;

    const utilization = (currentVolume / predictedVolume) * 100;

    if (utilization >= THRESHOLDS.CAPACITY_WARNING) {
      const isCritical = utilization >= THRESHOLDS.CAPACITY_CRITICAL;
      
      const alert = this.createAlert({
        category: 'capacity',
        severity: isCritical ? 'critical' : 'warning',
        message: `High volume predicted for ${provider} in ${country}: ${utilization.toFixed(0)}% of capacity`,
        confidence: 75,
        timeframe: 'next hour',
        providers: [provider],
        countries: [country],
        actions: isCritical
          ? [
              'Enable rate limiting immediately',
              'Scale up infrastructure',
              'Notify on-call engineer',
              'Prepare fallback providers',
            ]
          : [
              'Monitor volume trends',
              'Prepare for potential scaling',
              'Review capacity plans',
            ],
      });

      this.alerts.push(alert);
      this.logger.warn(`Alert generated: ${alert.message}`);
    }
  }

  /**
   * Detect recurring failure patterns
   */
  private detectFailurePatterns(provider: string, country: string): void {
    const hourlyFailures = this.analyzeHourlyPattern(provider, country);
    const dailyFailures = this.analyzeDailyPattern(provider, country);

    // Check for time-based patterns
    hourlyFailures.forEach((rate, hour) => {
      if (rate > 20) { // >20% failure rate in this hour
        const patternKey = `${provider}:${country}:hour:${hour}`;
        const pattern: FailurePattern = {
          pattern: `High failure rate at ${hour}:00`,
          frequency: rate,
          correlationFactors: ['time_of_day'],
          confidence: Math.min(95, rate * 3),
        };
        this.failurePatterns.set(patternKey, pattern);

        // Create alert if confidence is high
        if (pattern.confidence > 70) {
          const alert = this.createAlert({
            category: 'failure_pattern',
            severity: rate > 50 ? 'critical' : 'warning',
            message: `Pattern detected: High failures (${rate.toFixed(1)}%) for ${provider} at ${hour}:00 in ${country}`,
            confidence: pattern.confidence,
            timeframe: `daily at ${hour}:00`,
            providers: [provider],
            countries: [country],
            actions: [
              `Review ${provider} maintenance schedules`,
              'Consider avoiding this time window',
              'Set up automated alerts for this time',
            ],
          });

          this.alerts.push(alert);
        }
      }
    });
  }

  /**
   * Analyze hourly failure patterns
   */
  private analyzeHourlyPattern(provider: string, country: string): Map<number, number> {
    const hourlyData = new Map<number, { failures: number; total: number }>();

    const providerData = this.metricHistory.filter(
      m => m.provider === provider && m.country === country
    );

    for (const metric of providerData) {
      const hour = metric.timestamp.getHours();
      const current = hourlyData.get(hour) || { failures: 0, total: 0 };
      current.total++;
      current.failures += metric.failureRate;
      hourlyData.set(hour, current);
    }

    const result = new Map<number, number>();
    hourlyData.forEach((data, hour) => {
      if (data.total >= 5) {
        result.set(hour, data.failures / data.total);
      }
    });

    return result;
  }

  /**
   * Analyze daily failure patterns
   */
  private analyzeDailyPattern(provider: string, country: string): Map<number, number> {
    const dailyData = new Map<number, { failures: number; total: number }>();

    const providerData = this.metricHistory.filter(
      m => m.provider === provider && m.country === country
    );

    for (const metric of providerData) {
      const day = metric.timestamp.getDay();
      const current = dailyData.get(day) || { failures: 0, total: 0 };
      current.total++;
      current.failures += metric.failureRate;
      dailyData.set(day, current);
    }

    const result = new Map<number, number>();
    dailyData.forEach((data, day) => {
      if (data.total >= 3) {
        result.set(day, data.failures / data.total);
      }
    });

    return result;
  }

  /**
   * Predict volume for next time window
   */
  private predictVolume(provider: string, country: string): number {
    const data = this.metricHistory.filter(
      m => m.provider === provider && m.country === country
    );

    if (data.length < 10) {
      return 1000; // Default capacity
    }

    // Simple moving average with trend
    const recent = data.slice(-24); // Last 24 data points
    const avgVolume = recent.reduce((sum, m) => sum + m.volume, 0) / recent.length;

    // Calculate trend
    const trend = this.calculateTrend(recent.map(m => m.volume));

    // Predict next value
    let prediction = avgVolume;
    if (trend.direction === 'up') {
      prediction *= (1 + trend.magnitude);
    } else if (trend.direction === 'down') {
      prediction *= (1 - trend.magnitude);
    }

    return Math.round(prediction);
  }

  /**
   * Calculate trend from data series
   */
  private calculateTrend(values: number[]): Trend {
    if (values.length < 2) {
      return { direction: 'stable', magnitude: 0, confidence: 0 };
    }

    // Simple linear regression
    const n = values.length;
    const first = values.slice(0, Math.floor(n / 2));
    const second = values.slice(Math.floor(n / 2));

    const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
    const secondAvg = second.reduce((a, b) => a + b, 0) / second.length;

    const change = (secondAvg - firstAvg) / firstAvg;
    const direction = change > 0.1 ? 'up' : change < -0.1 ? 'down' : 'stable';

    return {
      direction,
      magnitude: Math.abs(change),
      confidence: Math.min(90, Math.abs(change) * 100),
    };
  }

  /**
   * Get recent data for analysis
   */
  private getRecentData(provider: string, country: string, minutes: number): MetricWindow[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.metricHistory.filter(
      m => m.provider === provider && 
           m.country === country && 
           m.timestamp.getTime() > cutoff
    );
  }

  /**
   * Create a new alert
   */
  private createAlert(params: {
    category: AlertCategory;
    severity: AlertSeverity;
    message: string;
    confidence: number;
    timeframe: string;
    providers?: string[];
    countries?: string[];
    actions: string[];
  }): PredictionAlert {
    this.alertIdCounter++;
    
    return {
      id: `alert-${Date.now()}-${this.alertIdCounter}`,
      category: params.category,
      severity: params.severity,
      message: params.message,
      confidence: Math.round(params.confidence),
      predictedAt: new Date(),
      expectedTimeframe: params.timeframe,
      affectedProviders: params.providers,
      affectedCountries: params.countries,
      recommendedActions: params.actions,
    };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(options?: {
    severity?: AlertSeverity;
    category?: AlertCategory;
    provider?: string;
    country?: string;
  }): PredictionAlert[] {
    let filtered = this.alerts.filter(a => !this.isAlertExpired(a));

    if (options?.severity) {
      filtered = filtered.filter(a => a.severity === options.severity);
    }
    if (options?.category) {
      filtered = filtered.filter(a => a.category === options.category);
    }
    if (options?.provider) {
      filtered = filtered.filter(a => a.affectedProviders?.includes(options.provider!));
    }
    if (options?.country) {
      filtered = filtered.filter(a => a.affectedCountries?.includes(options.country!));
    }

    return filtered.sort((a, b) => {
      // Sort by severity (critical first)
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Check if an alert has expired
   */
  private isAlertExpired(alert: PredictionAlert): boolean {
    // Alerts expire after 24 hours
    const expiry = 24 * 60 * 60 * 1000;
    return Date.now() - alert.predictedAt.getTime() > expiry;
  }

  /**
   * Dismiss an alert
   */
  dismissAlert(alertId: string): boolean {
    const index = this.alerts.findIndex(a => a.id === alertId);
    if (index >= 0) {
      this.alerts.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get capacity forecast
   */
  getCapacityForecast(provider: string, country: string, hours: number = 24): CapacityForecast[] {
    const forecasts: CapacityForecast[] = [];
    const now = new Date();

    // Get historical pattern
    const hourlyPattern = this.getHourlyVolumePattern(provider, country);

    for (let i = 1; i <= hours; i++) {
      const forecastTime = new Date(now.getTime() + i * 60 * 60 * 1000);
      const hour = forecastTime.getHours();
      
      const basePrediction = this.predictVolume(provider, country);
      const hourlyMultiplier = hourlyPattern.get(hour) || 1;
      
      const predictedVolume = Math.round(basePrediction * hourlyMultiplier);
      const variance = predictedVolume * 0.2; // 20% confidence interval

      forecasts.push({
        timestamp: forecastTime,
        predictedVolume,
        confidenceInterval: {
          lower: Math.round(predictedVolume - variance),
          upper: Math.round(predictedVolume + variance),
        },
        factors: this.getCapacityFactors(provider, country, hour),
      });
    }

    return forecasts;
  }

  /**
   * Get hourly volume pattern
   */
  private getHourlyVolumePattern(provider: string, country: string): Map<number, number> {
    const hourlyVolumes = new Map<number, number[]>();

    const data = this.metricHistory.filter(
      m => m.provider === provider && m.country === country
    );

    for (const metric of data) {
      const hour = metric.timestamp.getHours();
      const volumes = hourlyVolumes.get(hour) || [];
      volumes.push(metric.volume);
      hourlyVolumes.set(hour, volumes);
    }

    const result = new Map<number, number>();
    const globalAvg = data.reduce((sum, m) => sum + m.volume, 0) / (data.length || 1);

    hourlyVolumes.forEach((volumes, hour) => {
      const avg = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      result.set(hour, avg / globalAvg);
    });

    return result;
  }

  /**
   * Get factors affecting capacity
   */
  private getCapacityFactors(provider: string, country: string, hour: number): string[] {
    const factors: string[] = [];

    // Time of day factor
    if (hour >= 9 && hour <= 17) {
      factors.push('business_hours');
    } else if (hour >= 0 && hour <= 5) {
      factors.push('off_peak_hours');
    }

    // Weekend factor
    const day = new Date().getDay();
    if (day === 0 || day === 6) {
      factors.push('weekend');
    }

    // Historical patterns
    this.failurePatterns.forEach((pattern, key) => {
      if (key.includes(provider) && key.includes(country)) {
        factors.push(`pattern: ${pattern.pattern}`);
      }
    });

    return factors;
  }

  /**
   * Get predictor statistics
   */
  getStats(): {
    totalAlerts: number;
    activeAlerts: number;
    patternsDetected: number;
    dataPoints: number;
  } {
    return {
      totalAlerts: this.alertIdCounter,
      activeAlerts: this.getActiveAlerts().length,
      patternsDetected: this.failurePatterns.size,
      dataPoints: this.metricHistory.length,
    };
  }

  /**
   * Reset all data (for testing)
   */
  reset(): void {
    this.metricHistory = [];
    this.alerts = [];
    this.failurePatterns.clear();
    this.alertIdCounter = 0;
  }
}

// Export singleton helper
export function createPredictor(logger: Logger): Predictor {
  return new Predictor(logger);
}
