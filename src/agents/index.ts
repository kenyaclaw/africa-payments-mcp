/**
 * The Continental - Agent Swarm
 * Export all agent types and utilities
 */

// ==================== Base Types ====================
export * from './types.js';

// ==================== Base Agent ====================
export { BaseAgent, AgentConfig } from './base.js';

// ==================== Individual Agents ====================
export { CEOAgent, CEOConfig } from './ceo.js';
export { CTOAgent, SystemHealthStatus } from './cto.js';
export { CFOAgent, CashFlowMetrics, FraudPattern } from './cfo.js';
export { COOAgent, Incident, ServiceHealth } from './coo.js';
export { CCOAgent, SupportTicket, CustomerSatisfactionMetrics } from './cco.js';
export { CMOAgent, MarketingCampaign, ReferralProgram, GrowthMetrics } from './cmo.js';
export { CROAgent, Deal, PricingTier, RevenueForecast } from './cro.js';

// ==================== Council ====================
export { HighTableCouncil, CouncilConfig } from './council.js';

// ==================== Integration ====================
export { AgentSwarmIntegration, AgentSwarmConfig } from './integration.js';

// ==================== CLI ====================
export { createAgentCommands } from './cli.js';
