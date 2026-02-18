/**
 * AI Module Index
 * Exports all AI-powered intelligence features
 */

export { FraudDetector, createFraudDetector } from './fraud-detector.js';
export { SmartRouter, createSmartRouter } from './smart-router.js';
export { Predictor, createPredictor } from './predictor.js';
export { NLQueryEngine, createNLQueryEngine } from './nl-query.js';

export type {
  // Fraud Detection
  FraudCheckInput,
  FraudCheckResult,
  FraudDecision,
  RiskLevel,
  VelocityData,
  
  // Smart Routing
  RoutingInput,
  RoutingDecision,
  ProviderPerformance,
  
  // Predictive Alerting
  PredictionAlert,
  AlertSeverity,
  AlertCategory,
  CapacityForecast,
  FailurePattern,
  
  // Natural Language
  NLQueryInput,
  NLQueryResult,
  QueryIntent,
  QueryFilters,
  QueryAggregation,
  TimeRange,
  
  // ML
  MLModelConfig,
  ModelPerformance,
  LearningEvent,
  ContinuousLearningState,
} from './types.js';
