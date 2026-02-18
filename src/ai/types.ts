/**
 * AI Module Type Definitions
 * Shared types for AI-powered features
 */

import { Money, Transaction } from '../types/index.js';

// ==================== Fraud Detection Types ====================

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type FraudDecision = 'allow' | 'review' | 'block';

export interface FraudCheckInput {
  amount: Money;
  customerId: string;
  phoneNumber: string;
  country: string;
  deviceFingerprint?: string;
  ipAddress?: string;
  timestamp?: Date;
  paymentMethod: string;
  merchantId?: string;
}

export interface FraudCheckResult {
  riskScore: number; // 0-100
  riskLevel: RiskLevel;
  decision: FraudDecision;
  reasons: string[];
  mlConfidence?: number;
  rulesTriggered: string[];
  recommendedAction: string;
}

export interface VelocityData {
  customerId: string;
  transactionCount: number;
  totalAmount: number;
  currency: string;
  timeWindow: number; // in minutes
  uniqueCountries: number;
  uniqueDevices: number;
}

// ==================== Smart Router Types ====================

export interface ProviderPerformance {
  provider: string;
  country: string;
  successRate: number; // 0-100
  avgLatency: number; // in ms
  totalTransactions: number;
  failedTransactions: number;
  avgFees: number;
  lastUsed: Date;
}

export interface RoutingDecision {
  provider: string;
  confidence: number; // 0-100
  reason: string;
  estimatedLatency: number;
  estimatedSuccessRate: number;
  estimatedFees: number;
  alternativeProviders: string[];
}

export interface RoutingInput {
  amount: Money;
  destinationCountry: string;
  paymentMethod: string;
  priority?: 'speed' | 'cost' | 'reliability' | 'balanced';
  requiredProviders?: string[];
}

// ==================== Predictive Alerting Types ====================

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertCategory = 'capacity' | 'failure_pattern' | 'anomaly' | 'trend';

export interface PredictionAlert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  message: string;
  confidence: number; // 0-100
  predictedAt: Date;
  expectedTimeframe: string;
  affectedProviders?: string[];
  affectedCountries?: string[];
  recommendedActions: string[];
  metadata?: Record<string, any>;
}

export interface CapacityForecast {
  timestamp: Date;
  predictedVolume: number;
  confidenceInterval: { lower: number; upper: number };
  factors: string[];
}

export interface FailurePattern {
  pattern: string;
  frequency: number;
  correlationFactors: string[];
  confidence: number;
}

// ==================== Natural Language Query Types ====================

export interface NLQueryInput {
  query: string;
  userId?: string;
  context?: Record<string, any>;
}

export interface NLQueryResult {
  originalQuery: string;
  parsedIntent: QueryIntent;
  filters: QueryFilters;
  aggregations?: QueryAggregation[];
  timeRange?: TimeRange;
  formattedResult: string;
  data: any[];
  executionTime: number;
}

export interface QueryIntent {
  action: 'show' | 'count' | 'sum' | 'average' | 'compare' | 'trend';
  subject: 'transactions' | 'payments' | 'refunds' | 'failures' | 'revenue' | 'volume';
  status?: string[];
}

export interface QueryFilters {
  countries?: string[];
  providers?: string[];
  status?: string[];
  minAmount?: number;
  maxAmount?: number;
  customerId?: string;
  phoneNumber?: string;
}

export interface QueryAggregation {
  type: 'sum' | 'count' | 'average' | 'group_by';
  field: string;
  alias: string;
}

export interface TimeRange {
  start: Date;
  end: Date;
  description: string;
}

// ==================== ML Model Types ====================

export interface MLModelConfig {
  modelType: 'neural_network' | 'random_forest' | 'logistic_regression' | 'rule_based';
  features: string[];
  threshold: number;
  retrainInterval: number; // in hours
}

export interface ModelPerformance {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  lastTrained: Date;
  samplesUsed: number;
}

// ==================== Learning Types ====================

export interface LearningEvent {
  type: 'transaction_outcome' | 'routing_outcome' | 'feedback';
  input: Record<string, any>;
  actualOutcome: any;
  predictedOutcome?: any;
  timestamp: Date;
}

export interface ContinuousLearningState {
  totalEvents: number;
  lastUpdate: Date;
  performanceMetrics: Record<string, number>;
  pendingRetraining: boolean;
}
