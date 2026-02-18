/**
 * Smart Provider Router with AI
 * 
 * Uses historical performance data and real-time metrics to select
 * the optimal payment provider for each transaction.
 */

import { Logger } from '../utils/logger.js';
import {
  RoutingInput,
  RoutingDecision,
  ProviderPerformance,
  LearningEvent,
  ContinuousLearningState,
} from './types.js';
import { Money } from '../types/index.js';

// Provider base characteristics (fallback when no historical data)
const BASE_CHARACTERISTICS: Record<string, {
  baseSuccessRate: number;
  baseLatency: number;
  baseFees: number;
  reliability: number;
}> = {
  mpesa: { baseSuccessRate: 98, baseLatency: 2000, baseFees: 1.0, reliability: 98 },
  paystack: { baseSuccessRate: 97, baseLatency: 1500, baseFees: 1.5, reliability: 97 },
  mtn_momo: { baseSuccessRate: 95, baseLatency: 3000, baseFees: 1.0, reliability: 94 },
  airtel_money: { baseSuccessRate: 94, baseLatency: 3500, baseFees: 1.0, reliability: 92 },
  intasend: { baseSuccessRate: 96, baseLatency: 2500, baseFees: 1.0, reliability: 95 },
  flutterwave: { baseSuccessRate: 96, baseLatency: 2000, baseFees: 1.4, reliability: 96 },
  wave: { baseSuccessRate: 97, baseLatency: 2000, baseFees: 1.0, reliability: 97 },
  chipper_cash: { baseSuccessRate: 93, baseLatency: 4000, baseFees: 0.5, reliability: 93 },
  orange_money: { baseSuccessRate: 94, baseLatency: 3500, baseFees: 1.0, reliability: 94 },
};

// Country-specific adjustments
const COUNTRY_ADJUSTMENTS: Record<string, Record<string, {
  successRateDelta: number;
  latencyDelta: number;
}>> = {
  KE: {
    mpesa: { successRateDelta: 2, latencyDelta: -500 },
    paystack: { successRateDelta: -1, latencyDelta: 200 },
  },
  NG: {
    paystack: { successRateDelta: 2, latencyDelta: -300 },
    flutterwave: { successRateDelta: 1, latencyDelta: -200 },
  },
  GH: {
    paystack: { successRateDelta: 1, latencyDelta: -100 },
    mtn_momo: { successRateDelta: 2, latencyDelta: -500 },
  },
  UG: {
    mtn_momo: { successRateDelta: 2, latencyDelta: -400 },
    airtel_money: { successRateDelta: 1, latencyDelta: -300 },
  },
  TZ: {
    mpesa: { successRateDelta: 1, latencyDelta: -300 },
    airtel_money: { successRateDelta: 2, latencyDelta: -400 },
  },
};

// Time-based patterns (hour of day, 0-23)
const TIME_PATTERNS: Record<string, {
  peakHours: number[];
  lowHours: number[];
  peakSuccessDelta: number;
  peakLatencyDelta: number;
}> = {
  mpesa: {
    peakHours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    lowHours: [0, 1, 2, 3, 4, 5, 6],
    peakSuccessDelta: -1,
    peakLatencyDelta: 500,
  },
  mtn_momo: {
    peakHours: [8, 9, 10, 11, 12, 13, 17, 18, 19, 20],
    lowHours: [0, 1, 2, 3, 4, 5],
    peakSuccessDelta: -2,
    peakLatencyDelta: 800,
  },
  paystack: {
    peakHours: [9, 10, 11, 12, 13, 14, 15, 16],
    lowHours: [0, 1, 2, 3, 4, 5],
    peakSuccessDelta: -0.5,
    peakLatencyDelta: 300,
  },
};

interface ProviderScore {
  provider: string;
  score: number;
  successRate: number;
  latency: number;
  fees: number;
  reasons: string[];
}

export class SmartRouter {
  private performanceStore: Map<string, ProviderPerformance> = new Map();
  private recentOutcomes: Array<{
    provider: string;
    country: string;
    success: boolean;
    latency: number;
    timestamp: Date;
  }> = [];
  private learningState: ContinuousLearningState;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.learningState = {
      totalEvents: 0,
      lastUpdate: new Date(),
      performanceMetrics: {},
      pendingRetraining: false,
    };
  }

  /**
   * Initialize the smart router
   */
  async initialize(): Promise<void> {
    // Load historical data (would be from database in production)
    this.logger.info('Smart router initialized');
  }

  /**
   * Select the best provider for a transaction
   */
  async selectProvider(input: RoutingInput): Promise<RoutingDecision> {
    const startTime = Date.now();
    const { amount, destinationCountry, priority = 'balanced' } = input;

    // Get all available providers for this country
    const providers = this.getProvidersForCountry(destinationCountry);
    
    if (providers.length === 0) {
      throw new Error(`No providers available for country: ${destinationCountry}`);
    }

    // Score each provider
    const scores: ProviderScore[] = providers.map(provider => 
      this.scoreProvider(provider, amount, destinationCountry, priority)
    );

    // Sort by score (highest first)
    scores.sort((a, b) => b.score - a.score);

    // Select best provider
    const best = scores[0];
    const alternatives = scores.slice(1, 4).map(s => s.provider);

    const decision: RoutingDecision = {
      provider: best.provider,
      confidence: Math.min(best.score, 100),
      reason: best.reasons.join('; '),
      estimatedLatency: Math.round(best.latency),
      estimatedSuccessRate: Math.round(best.successRate * 10) / 10,
      estimatedFees: best.fees,
      alternativeProviders: alternatives,
    };

    const duration = Date.now() - startTime;
    this.logger.info(
      `Routing decision in ${duration}ms: ${best.provider} ` +
      `(success: ${decision.estimatedSuccessRate}%, latency: ${decision.estimatedLatency}ms)`
    );

    return decision;
  }

  /**
   * Score a single provider
   */
  private scoreProvider(
    provider: string,
    amount: Money,
    country: string,
    priority: string
  ): ProviderScore {
    const reasons: string[] = [];
    
    // Get base characteristics
    const base = BASE_CHARACTERISTICS[provider] || {
      baseSuccessRate: 90,
      baseLatency: 5000,
      baseFees: 2.0,
      reliability: 90,
    };

    // Get historical performance
    const perfKey = `${provider}:${country}`;
    const historical = this.performanceStore.get(perfKey);

    // Calculate success rate (blend historical and base)
    let successRate = base.baseSuccessRate;
    if (historical && historical.totalTransactions > 10) {
      const historicalWeight = Math.min(historical.totalTransactions / 100, 0.7);
      successRate = (historical.successRate * historicalWeight) + 
                    (base.baseSuccessRate * (1 - historicalWeight));
      reasons.push(`Historical success rate: ${historical.successRate.toFixed(1)}%`);
    } else {
      reasons.push('Using base success rate (no historical data)');
    }

    // Apply country adjustments
    const countryAdjust = COUNTRY_ADJUSTMENTS[country]?.[provider];
    if (countryAdjust) {
      successRate += countryAdjust.successRateDelta;
      reasons.push(`Country optimization: ${country}`);
    }

    // Apply time-based adjustments
    const hour = new Date().getHours();
    const timePattern = TIME_PATTERNS[provider];
    let latency = base.baseLatency;
    
    if (timePattern) {
      if (timePattern.peakHours.includes(hour)) {
        successRate += timePattern.peakSuccessDelta;
        latency += timePattern.peakLatencyDelta;
        reasons.push(`Peak hours adjustment (${hour}:00)`);
      } else if (timePattern.lowHours.includes(hour)) {
        latency -= 200; // Faster during low hours
        reasons.push(`Off-peak hours (${hour}:00)`);
      }
    }

    // Apply historical latency if available
    if (historical) {
      const latencyWeight = Math.min(historical.totalTransactions / 100, 0.5);
      latency = (historical.avgLatency * latencyWeight) + (latency * (1 - latencyWeight));
    }

    // Apply country latency adjustments
    if (countryAdjust) {
      latency += countryAdjust.latencyDelta;
    }

    // Get fees
    let fees = historical?.avgFees ?? base.baseFees;

    // Calculate final score based on priority
    let score = 0;
    
    switch (priority) {
      case 'speed':
        score = this.calculateSpeedScore(successRate, latency, fees, base.reliability);
        reasons.push('Prioritized: speed');
        break;
      case 'cost':
        score = this.calculateCostScore(successRate, latency, fees, base.reliability);
        reasons.push('Prioritized: cost');
        break;
      case 'reliability':
        score = this.calculateReliabilityScore(successRate, latency, fees, base.reliability);
        reasons.push('Prioritized: reliability');
        break;
      case 'balanced':
      default:
        score = this.calculateBalancedScore(successRate, latency, fees, base.reliability);
        reasons.push('Prioritized: balanced');
        break;
    }

    // Bonus for high historical volume (proven track record)
    if (historical && historical.totalTransactions > 100) {
      score += 5;
      reasons.push('Proven track record');
    }

    return {
      provider,
      score: Math.round(score),
      successRate,
      latency: Math.max(500, latency),
      fees,
      reasons,
    };
  }

  /**
   * Calculate speed-prioritized score
   */
  private calculateSpeedScore(
    successRate: number,
    latency: number,
    fees: number,
    reliability: number
  ): number {
    const latencyScore = Math.max(0, 100 - (latency / 50)); // 0ms = 100, 5000ms = 0
    const successScore = successRate;
    const feeScore = Math.max(0, 100 - (fees * 10));
    
    return (latencyScore * 0.5) + (successScore * 0.3) + (reliability * 0.15) + (feeScore * 0.05);
  }

  /**
   * Calculate cost-prioritized score
   */
  private calculateCostScore(
    successRate: number,
    latency: number,
    fees: number,
    reliability: number
  ): number {
    const feeScore = Math.max(0, 100 - (fees * 20)); // Lower fees = higher score
    const successScore = successRate;
    const latencyScore = Math.max(0, 100 - (latency / 100));
    
    return (feeScore * 0.5) + (successScore * 0.3) + (reliability * 0.15) + (latencyScore * 0.05);
  }

  /**
   * Calculate reliability-prioritized score
   */
  private calculateReliabilityScore(
    successRate: number,
    latency: number,
    fees: number,
    reliability: number
  ): number {
    const reliabilityScore = (successRate + reliability) / 2;
    const latencyScore = Math.max(0, 100 - (latency / 100));
    const feeScore = Math.max(0, 100 - (fees * 10));
    
    return (reliabilityScore * 0.6) + (latencyScore * 0.25) + (feeScore * 0.15);
  }

  /**
   * Calculate balanced score
   */
  private calculateBalancedScore(
    successRate: number,
    latency: number,
    fees: number,
    reliability: number
  ): number {
    const latencyScore = Math.max(0, 100 - (latency / 75));
    const feeScore = Math.max(0, 100 - (fees * 15));
    
    return (successRate * 0.35) + (reliability * 0.25) + (latencyScore * 0.25) + (feeScore * 0.15);
  }

  /**
   * Get providers available for a country
   */
  private getProvidersForCountry(country: string): string[] {
    // Country to provider mapping
    const mapping: Record<string, string[]> = {
      KE: ['mpesa', 'paystack', 'intasend', 'airtel_money'],
      NG: ['paystack', 'flutterwave', 'intasend', 'chipper_cash'],
      GH: ['paystack', 'mtn_momo', 'flutterwave'],
      UG: ['mtn_momo', 'airtel_money', 'paystack', 'wave'],
      TZ: ['mpesa', 'airtel_money', 'paystack'],
      ZA: ['paystack', 'flutterwave'],
      RW: ['mtn_momo', 'airtel_money'],
      CI: ['wave', 'mtn_momo', 'orange_money'],
      SN: ['wave', 'orange_money'],
      CM: ['mtn_momo', 'orange_money'],
    };

    return mapping[country] || ['paystack', 'flutterwave'];
  }

  /**
   * Record transaction outcome for learning
   */
  async recordOutcome(
    provider: string,
    country: string,
    success: boolean,
    latency: number,
    fees: number
  ): Promise<void> {
    const outcome = {
      provider,
      country,
      success,
      latency,
      timestamp: new Date(),
    };

    this.recentOutcomes.push(outcome);
    this.learningState.totalEvents++;

    // Keep only last 1000 outcomes
    if (this.recentOutcomes.length > 1000) {
      this.recentOutcomes.shift();
    }

    // Update performance metrics
    await this.updatePerformanceMetrics(provider, country, success, latency, fees);

    this.logger.debug(`Recorded outcome for ${provider} in ${country}: ${success ? 'success' : 'failure'}`);
  }

  /**
   * Update performance metrics
   */
  private async updatePerformanceMetrics(
    provider: string,
    country: string,
    success: boolean,
    latency: number,
    fees: number
  ): Promise<void> {
    const key = `${provider}:${country}`;
    let perf = this.performanceStore.get(key);

    if (!perf) {
      perf = {
        provider,
        country,
        successRate: success ? 100 : 0,
        avgLatency: latency,
        totalTransactions: 0,
        failedTransactions: 0,
        avgFees: fees,
        lastUsed: new Date(),
      };
    }

    // Update with exponential moving average
    const alpha = 0.1; // Smoothing factor
    perf.totalTransactions++;
    if (!success) {
      perf.failedTransactions++;
    }

    const currentSuccessRate = ((perf.totalTransactions - perf.failedTransactions) / perf.totalTransactions) * 100;
    perf.successRate = (perf.successRate * (1 - alpha)) + (currentSuccessRate * alpha);
    perf.avgLatency = (perf.avgLatency * (1 - alpha)) + (latency * alpha);
    perf.avgFees = (perf.avgFees * (1 - alpha)) + (fees * alpha);
    perf.lastUsed = new Date();

    this.performanceStore.set(key, perf);
  }

  /**
   * Learn from outcomes batch
   */
  async learn(): Promise<void> {
    if (this.recentOutcomes.length < 10) {
      return;
    }

    this.logger.info(`Learning from ${this.recentOutcomes.length} recent outcomes`);

    // Calculate trend
    const successByProvider = new Map<string, { success: number; total: number }>();
    
    for (const outcome of this.recentOutcomes) {
      const current = successByProvider.get(outcome.provider) || { success: 0, total: 0 };
      current.total++;
      if (outcome.success) current.success++;
      successByProvider.set(outcome.provider, current);
    }

    // Log insights
    successByProvider.forEach((stats, provider) => {
      const rate = (stats.success / stats.total) * 100;
      this.logger.info(`Provider ${provider}: ${rate.toFixed(1)}% success rate (${stats.success}/${stats.total})`);
    });

    this.learningState.lastUpdate = new Date();
    this.recentOutcomes = [];
  }

  /**
   * Get provider performance report
   */
  getPerformanceReport(): ProviderPerformance[] {
    return Array.from(this.performanceStore.values())
      .sort((a, b) => b.successRate - a.successRate);
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    providersTracked: number;
    totalOutcomes: number;
    lastLearningUpdate: Date;
  } {
    return {
      providersTracked: this.performanceStore.size,
      totalOutcomes: this.learningState.totalEvents,
      lastLearningUpdate: this.learningState.lastUpdate,
    };
  }

  /**
   * Reset all data (for testing)
   */
  reset(): void {
    this.performanceStore.clear();
    this.recentOutcomes = [];
    this.learningState = {
      totalEvents: 0,
      lastUpdate: new Date(),
      performanceMetrics: {},
      pendingRetraining: false,
    };
  }
}

// Export singleton helper
export function createSmartRouter(logger: Logger): SmartRouter {
  return new SmartRouter(logger);
}
