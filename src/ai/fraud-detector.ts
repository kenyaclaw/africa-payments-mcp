/**
 * Fraud Detection ML Module
 * 
 * Combines rule-based checks with ML model for fraud detection.
 * Risk score: 0-100 (0 = safe, 100 = fraudulent)
 * Decisions: allow, review, block
 */

import * as tf from '@tensorflow/tfjs-node';
import { Logger } from '../utils/logger.js';
import {
  FraudCheckInput,
  FraudCheckResult,
  FraudDecision,
  RiskLevel,
  VelocityData,
  MLModelConfig,
  LearningEvent,
} from './types.js';

// Rule thresholds
const RULES = {
  // Amount thresholds by currency (approximate USD equivalents)
  AMOUNT_THRESHOLDS: {
    KES: { high: 100000, critical: 500000 }, // ~$750, ~$3750
    NGN: { high: 500000, critical: 2000000 }, // ~$350, ~$1400
    GHS: { high: 5000, critical: 25000 }, // ~$420, ~$2100
    UGX: { high: 2000000, critical: 10000000 }, // ~$550, ~$2750
    TZS: { high: 1500000, critical: 7500000 }, // ~$600, ~$3000
    ZAR: { high: 15000, critical: 75000 }, // ~$800, ~$4000
    default: { high: 1000, critical: 5000 },
  },
  // Velocity limits
  VELOCITY: {
    maxTransactionsPerHour: 10,
    maxAmountPerHour: 100000, // in USD equivalent
    maxCountriesPerDay: 3,
    maxDevicesPerDay: 3,
  },
  // Time-based risk (0-23 hours)
  HIGH_RISK_HOURS: [0, 1, 2, 3, 4, 5], // Late night transactions
};

interface RuleResult {
  triggered: boolean;
  score: number;
  reason: string;
  ruleId: string;
}

export class FraudDetector {
  private model: tf.LayersModel | null = null;
  private modelConfig: MLModelConfig;
  private velocityStore: Map<string, VelocityData> = new Map();
  private transactionHistory: Map<string, Array<{ timestamp: Date; amount: number; country: string }>> = new Map();
  private readonly logger: Logger;
  private isModelLoaded = false;

  constructor(logger: Logger, config?: Partial<MLModelConfig>) {
    this.logger = logger;
    this.modelConfig = {
      modelType: 'neural_network',
      features: ['amount', 'hour', 'day_of_week', 'country_risk', 'velocity', 'device_trust'],
      threshold: 0.7,
      retrainInterval: 24,
      ...config,
    };
  }

  /**
   * Initialize the fraud detector
   */
  async initialize(): Promise<void> {
    try {
      await this.loadOrCreateModel();
      this.logger.info('Fraud detector initialized successfully');
    } catch (error) {
      this.logger.warn(`Failed to load ML model, using rule-based detection only: ${error}`);
      // Continue with rule-based detection
    }
  }

  /**
   * Check a transaction for fraud
   */
  async checkTransaction(input: FraudCheckInput): Promise<FraudCheckResult> {
    const startTime = Date.now();
    const timestamp = input.timestamp || new Date();

    // Run rule-based checks
    const ruleResults = await this.runRuleChecks(input, timestamp);
    const ruleBasedScore = this.calculateRuleBasedScore(ruleResults);
    const triggeredRules = ruleResults.filter(r => r.triggered);

    // Run ML prediction if model is available
    let mlScore = 0;
    let mlConfidence = 0;
    
    if (this.isModelLoaded && this.model) {
      const mlResult = await this.runMLPrediction(input, timestamp);
      mlScore = mlResult.score;
      mlConfidence = mlResult.confidence;
    }

    // Combine scores (weighted average)
    const finalScore = this.isModelLoaded
      ? Math.round(ruleBasedScore * 0.4 + mlScore * 0.6)
      : ruleBasedScore;

    // Determine risk level and decision
    const riskLevel = this.getRiskLevel(finalScore);
    const decision = this.getDecision(finalScore, riskLevel);

    // Build result
    const result: FraudCheckResult = {
      riskScore: finalScore,
      riskLevel,
      decision,
      reasons: triggeredRules.map(r => r.reason),
      mlConfidence: this.isModelLoaded ? mlConfidence : undefined,
      rulesTriggered: triggeredRules.map(r => r.ruleId),
      recommendedAction: this.getRecommendedAction(decision, riskLevel),
    };

    // Update velocity data
    this.updateVelocityData(input, timestamp);

    const duration = Date.now() - startTime;
    this.logger.info(`Fraud check completed in ${duration}ms: score=${finalScore}, decision=${decision}`);

    return result;
  }

  /**
   * Run all rule-based checks
   */
  private async runRuleChecks(input: FraudCheckInput, timestamp: Date): Promise<RuleResult[]> {
    const results: RuleResult[] = [];

    // Amount threshold check
    results.push(this.checkAmountThreshold(input));

    // Velocity check
    results.push(await this.checkVelocity(input));

    // Time-based risk check
    results.push(this.checkTimeRisk(input, timestamp));

    // Country risk check
    results.push(this.checkCountryRisk(input));

    // Device fingerprint check
    if (input.deviceFingerprint) {
      results.push(this.checkDeviceTrust(input));
    }

    // Cross-border check
    results.push(this.checkCrossBorderPattern(input));

    return results;
  }

  /**
   * Check amount against thresholds
   */
  private checkAmountThreshold(input: FraudCheckInput): RuleResult {
    const thresholds = RULES.AMOUNT_THRESHOLDS[input.amount.currency as keyof typeof RULES.AMOUNT_THRESHOLDS] 
      || RULES.AMOUNT_THRESHOLDS.default;

    if (input.amount.amount >= thresholds.critical) {
      return {
        triggered: true,
        score: 40,
        reason: `Critical amount: ${input.amount.amount} ${input.amount.currency}`,
        ruleId: 'AMOUNT_CRITICAL',
      };
    }

    if (input.amount.amount >= thresholds.high) {
      return {
        triggered: true,
        score: 20,
        reason: `High amount: ${input.amount.amount} ${input.amount.currency}`,
        ruleId: 'AMOUNT_HIGH',
      };
    }

    return {
      triggered: false,
      score: 0,
      reason: 'Amount within normal range',
      ruleId: 'AMOUNT_CHECK',
    };
  }

  /**
   * Check transaction velocity
   */
  private async checkVelocity(input: FraudCheckInput): Promise<RuleResult> {
    const velocity = this.velocityStore.get(input.customerId);
    
    if (!velocity) {
      return {
        triggered: false,
        score: 0,
        reason: 'No velocity data',
        ruleId: 'VELOCITY_CHECK',
      };
    }

    let score = 0;
    const reasons: string[] = [];

    // Check transaction count
    if (velocity.transactionCount > RULES.VELOCITY.maxTransactionsPerHour) {
      score += 25;
      reasons.push(`High transaction velocity: ${velocity.transactionCount} in 1 hour`);
    }

    // Check unique countries
    if (velocity.uniqueCountries > RULES.VELOCITY.maxCountriesPerDay) {
      score += 30;
      reasons.push(`Multiple countries: ${velocity.uniqueCountries} in 24 hours`);
    }

    // Check unique devices
    if (velocity.uniqueDevices > RULES.VELOCITY.maxDevicesPerDay) {
      score += 25;
      reasons.push(`Multiple devices: ${velocity.uniqueDevices} in 24 hours`);
    }

    return {
      triggered: score > 0,
      score,
      reason: reasons.join('; ') || 'Velocity normal',
      ruleId: 'VELOCITY_CHECK',
    };
  }

  /**
   * Check time-based risk
   */
  private checkTimeRisk(input: FraudCheckInput, timestamp: Date): RuleResult {
    const hour = timestamp.getHours();
    const isHighRiskHour = RULES.HIGH_RISK_HOURS.includes(hour);

    if (isHighRiskHour) {
      // Additional check: is this unusual for this customer?
      const history = this.transactionHistory.get(input.customerId) || [];
      const typicalHours = this.getTypicalTransactionHours(history);
      const isUnusualTime = !typicalHours.includes(hour);

      if (isUnusualTime && history.length > 5) {
        return {
          triggered: true,
          score: 15,
          reason: `Unusual late-night transaction at ${hour}:00`,
          ruleId: 'TIME_UNUSUAL',
        };
      }

      return {
        triggered: true,
        score: 5,
        reason: `Late-night transaction at ${hour}:00`,
        ruleId: 'TIME_LATE_NIGHT',
      };
    }

    return {
      triggered: false,
      score: 0,
      reason: 'Normal business hours',
      ruleId: 'TIME_CHECK',
    };
  }

  /**
   * Check country risk
   */
  private checkCountryRisk(input: FraudCheckInput): RuleResult {
    // High-risk countries (simplified list)
    const highRiskCountries = ['XX', 'YY']; // Placeholder - would use actual risk data
    
    if (highRiskCountries.includes(input.country)) {
      return {
        triggered: true,
        score: 20,
        reason: `High-risk country: ${input.country}`,
        ruleId: 'COUNTRY_HIGH_RISK',
      };
    }

    // Check for country hopping
    const history = this.transactionHistory.get(input.customerId) || [];
    const lastCountry = history.length > 0 ? history[history.length - 1].country : null;
    
    if (lastCountry && lastCountry !== input.country) {
      // Check if rapid country change (within 1 hour)
      const lastTransaction = history[history.length - 1];
      const hoursSinceLast = (Date.now() - lastTransaction.timestamp.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceLast < 1) {
        return {
          triggered: true,
          score: 35,
          reason: `Impossible travel: ${lastCountry} to ${input.country} in ${Math.round(hoursSinceLast * 60)} minutes`,
          ruleId: 'IMPOSSIBLE_TRAVEL',
        };
      }
    }

    return {
      triggered: false,
      score: 0,
      reason: 'Country risk normal',
      ruleId: 'COUNTRY_CHECK',
    };
  }

  /**
   * Check device trust
   */
  private checkDeviceTrust(input: FraudCheckInput): RuleResult {
    const history = this.transactionHistory.get(input.customerId) || [];
    const knownDevices = new Set(history.map(h => h.country)); // Simplified - would use actual device fingerprint

    // New device for existing customer
    if (history.length > 3 && !knownDevices.has(input.country)) {
      return {
        triggered: true,
        score: 10,
        reason: 'New device/location for existing customer',
        ruleId: 'NEW_DEVICE',
      };
    }

    return {
      triggered: false,
      score: 0,
      reason: 'Known device',
      ruleId: 'DEVICE_CHECK',
    };
  }

  /**
   * Check cross-border patterns
   */
  private checkCrossBorderPattern(input: FraudCheckInput): RuleResult {
    const history = this.transactionHistory.get(input.customerId) || [];
    const recentTransactions = history.filter(
      h => (Date.now() - h.timestamp.getTime()) < 24 * 60 * 60 * 1000
    );

    // Check for rapid small transactions (structuring)
    const smallTransactions = recentTransactions.filter(t => t.amount < 100);
    if (smallTransactions.length > 10) {
      return {
        triggered: true,
        score: 30,
        reason: `Potential structuring: ${smallTransactions.length} small transactions in 24h`,
        ruleId: 'STRUCTURING',
      };
    }

    return {
      triggered: false,
      score: 0,
      reason: 'No suspicious patterns',
      ruleId: 'PATTERN_CHECK',
    };
  }

  /**
   * Calculate rule-based risk score
   */
  private calculateRuleBasedScore(results: RuleResult[]): number {
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    return Math.min(100, totalScore);
  }

  /**
   * Run ML prediction
   */
  private async runMLPrediction(input: FraudCheckInput, timestamp: Date): Promise<{ score: number; confidence: number }> {
    if (!this.model) {
      return { score: 0, confidence: 0 };
    }

    try {
      // Extract features
      const features = this.extractFeatures(input, timestamp);
      const tensor = tf.tensor2d([features]);

      // Run prediction
      const prediction = this.model.predict(tensor) as tf.Tensor;
      const scoreArray = await prediction.array() as number[][];
      const fraudProbability = scoreArray[0][0];

      // Cleanup
      tensor.dispose();
      prediction.dispose();

      // Convert probability to score (0-100)
      const score = Math.round(fraudProbability * 100);
      const confidence = Math.abs(fraudProbability - 0.5) * 2; // Higher confidence when further from 0.5

      return { score, confidence };
    } catch (error) {
      this.logger.error(`ML prediction failed: ${error}`);
      return { score: 0, confidence: 0 };
    }
  }

  /**
   * Extract features for ML model
   */
  private extractFeatures(input: FraudCheckInput, timestamp: Date): number[] {
    const velocity = this.velocityStore.get(input.customerId);
    const history = this.transactionHistory.get(input.customerId) || [];

    return [
      // Normalized amount (log scale)
      Math.log1p(input.amount.amount) / 20,
      
      // Hour of day (normalized)
      timestamp.getHours() / 24,
      
      // Day of week (normalized)
      timestamp.getDay() / 7,
      
      // Country risk score (simplified)
      this.getCountryRiskScore(input.country),
      
      // Transaction velocity
      Math.min((velocity?.transactionCount || 0) / 20, 1),
      
      // Device trust score
      history.length > 0 ? 0.8 : 0.2,
      
      // Amount velocity
      Math.min((velocity?.totalAmount || 0) / 10000, 1),
      
      // Payment method encoding (simplified)
      input.paymentMethod === 'mobile_money' ? 1 : 0,
    ];
  }

  /**
   * Get risk level from score
   */
  private getRiskLevel(score: number): RiskLevel {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  /**
   * Get decision from score and risk level
   */
  private getDecision(score: number, riskLevel: RiskLevel): FraudDecision {
    if (score >= 80 || riskLevel === 'critical') return 'block';
    if (score >= 50 || riskLevel === 'high') return 'review';
    return 'allow';
  }

  /**
   * Get recommended action
   */
  private getRecommendedAction(decision: FraudDecision, riskLevel: RiskLevel): string {
    switch (decision) {
      case 'block':
        return 'Block transaction and notify security team immediately';
      case 'review':
        return 'Hold for manual review, request additional verification';
      case 'allow':
        return riskLevel === 'medium' 
          ? 'Process with standard monitoring'
          : 'Process normally';
    }
  }

  /**
   * Update velocity data after transaction
   */
  private updateVelocityData(input: FraudCheckInput, timestamp: Date): void {
    // Update velocity store
    let velocity = this.velocityStore.get(input.customerId);
    
    if (!velocity) {
      velocity = {
        customerId: input.customerId,
        transactionCount: 0,
        totalAmount: 0,
        currency: input.amount.currency,
        timeWindow: 60,
        uniqueCountries: 0,
        uniqueDevices: 0,
      };
    }

    velocity.transactionCount++;
    velocity.totalAmount += input.amount.amount;

    // Update transaction history
    let history = this.transactionHistory.get(input.customerId);
    if (!history) {
      history = [];
      this.transactionHistory.set(input.customerId, history);
    }

    history.push({
      timestamp,
      amount: input.amount.amount,
      country: input.country,
    });

    // Keep only last 24 hours
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const filtered = history.filter(h => h.timestamp.getTime() > cutoff);
    this.transactionHistory.set(input.customerId, filtered);

    // Update unique countries and devices
    const countries = new Set(filtered.map(h => h.country));
    velocity.uniqueCountries = countries.size;

    this.velocityStore.set(input.customerId, velocity);
  }

  /**
   * Get typical transaction hours for a customer
   */
  private getTypicalTransactionHours(history: Array<{ timestamp: Date }>): number[] {
    if (history.length === 0) return [];
    
    const hourCounts = new Map<number, number>();
    history.forEach(h => {
      const hour = h.timestamp.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });

    // Return hours with at least 2 transactions
    return Array.from(hourCounts.entries())
      .filter(([, count]) => count >= 2)
      .map(([hour]) => hour);
  }

  /**
   * Get country risk score (simplified)
   */
  private getCountryRiskScore(country: string): number {
    // Simplified risk scores - would use actual risk database
    const riskScores: Record<string, number> = {
      'KE': 0.1,
      'NG': 0.15,
      'GH': 0.12,
      'UG': 0.13,
      'TZ': 0.11,
      'ZA': 0.1,
    };
    return riskScores[country] || 0.2;
  }

  /**
   * Load or create ML model
   */
  private async loadOrCreateModel(): Promise<void> {
    try {
      // Try to load existing model
      this.model = await tf.loadLayersModel('file://./models/fraud-detector/model.json');
      this.isModelLoaded = true;
      this.logger.info('Loaded existing fraud detection model');
    } catch {
      // Create new model
      this.model = this.createModel();
      this.isModelLoaded = true;
      this.logger.info('Created new fraud detection model');
    }
  }

  /**
   * Create neural network model
   */
  private createModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [8], units: 16, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ units: 8, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy'],
    });

    return model;
  }

  /**
   * Learn from transaction outcome
   */
  async learn(event: LearningEvent): Promise<void> {
    // Store for batch retraining
    this.logger.info(`Learning from event: ${event.type}`);
    
    // Simple online learning update (simplified)
    if (this.model && event.type === 'transaction_outcome') {
      // Would implement actual online learning here
      this.logger.info('Model would be updated with new data');
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    modelLoaded: boolean;
    customersMonitored: number;
    totalTransactions: number;
  } {
    return {
      modelLoaded: this.isModelLoaded,
      customersMonitored: this.velocityStore.size,
      totalTransactions: Array.from(this.transactionHistory.values())
        .reduce((sum, h) => sum + h.length, 0),
    };
  }
}

// Export singleton helper
export function createFraudDetector(logger: Logger): FraudDetector {
  return new FraudDetector(logger);
}
