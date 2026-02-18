/**
 * The Continental - Agent Swarm Types
 * Base types and interfaces for the 10-agent system
 */

import { Transaction, Money } from '../types/index.js';

// Re-export Money for convenience
export type { Money } from '../types/index.js';

// ==================== Agent Roles ====================

export type AgentRole = 
  | 'ceo'      // Winston - Strategic decisions, transaction approval
  | 'cto'      // John Wick - Technical health, infrastructure
  | 'cfo'      // Adjudicator - Cash flow, fraud detection
  | 'coo'      // Doctor - System health, incident response
  | 'cco'      // Charon - Customer complaints, goodwill refunds
  | 'cmo'      // Bowery King - Marketing, growth metrics
  | 'cro'      // Sofia - Sales pipeline, pricing decisions
  | 'council'; // High Table coordination

// ==================== Agent Status ====================

export type AgentStatus = 
  | 'idle'
  | 'analyzing'
  | 'approving'
  | 'rejecting'
  | 'escalating'
  | 'error';

export interface AgentState {
  role: AgentRole;
  name: string;
  status: AgentStatus;
  lastAction: Date;
  decisionsMade: number;
  active: boolean;
  health: 'healthy' | 'degraded' | 'critical';
}

// ==================== Decision Types ====================

export type DecisionType = 
  | 'transaction_approval'
  | 'refund_approval'
  | 'infrastructure_change'
  | 'provider_integration'
  | 'pricing_decision'
  | 'incident_response'
  | 'customer_complaint'
  | 'fraud_alert'
  | 'strategic_override';

export type DecisionOutcome = 'approved' | 'rejected' | 'escalated' | 'pending';

export interface AgentDecision {
  id: string;
  agent: AgentRole;
  agentName: string;
  decisionType: DecisionType;
  outcome: DecisionOutcome;
  reason: string;
  timestamp: Date;
  context: Record<string, any>;
  requiresHumanReview: boolean;
  confidence: number; // 0-1
}

// ==================== Request Types ====================

export interface TransactionApprovalRequest {
  transactionId: string;
  amount: Money;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  provider: string;
  paymentMethod: string;
  riskScore?: number;
  metadata?: Record<string, any>;
}

export interface RefundApprovalRequest {
  originalTransactionId: string;
  refundAmount: Money;
  originalAmount: Money;
  reason: string;
  customerId: string;
  isGoodwillRefund: boolean;
  daysSinceTransaction: number;
}

export interface InfrastructureChangeRequest {
  changeType: 'provider_update' | 'config_change' | 'deployment' | 'scaling';
  description: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  affectedProviders: string[];
  rollbackPlan: string;
}

export interface ProviderIntegrationRequest {
  providerName: string;
  providerType: string;
  sandboxTested: boolean;
  requiredCredentials: string[];
  estimatedVolume: string;
}

export interface PricingDecisionRequest {
  changeType: 'new_pricing' | 'promotion' | 'enterprise_deal';
  description: string;
  impact: Money;
  affectedCustomers: string[];
  duration?: string;
}

export interface CustomerComplaintRequest {
  customerId: string;
  complaintType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  transactionId?: string;
  previousInteractions: number;
}

export interface FraudAlertRequest {
  transactionId: string;
  customerId: string;
  alertType: string;
  riskScore: number;
  indicators: string[];
  suggestedAction: string;
}

// ==================== Notification Types ====================

export interface AgentNotification {
  id: string;
  from: AgentRole;
  to: AgentRole | 'all' | 'human';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  message: string;
  timestamp: Date;
  actionRequired: boolean;
  metadata?: Record<string, any>;
}

// ==================== Metrics Types ====================

export interface AgentMetrics {
  agent: AgentRole;
  decisionsToday: number;
  avgDecisionTimeMs: number;
  approvalRate: number;
  escalationRate: number;
  errors: number;
  lastUpdated: Date;
}

export interface SystemHealthMetrics {
  overallHealth: 'healthy' | 'degraded' | 'critical';
  activeAgents: number;
  pendingDecisions: number;
  avgResponseTime: number;
  alerts: AgentNotification[];
}

// ==================== Voting Types ====================

export type Vote = 'yes' | 'no' | 'abstain';

export interface CouncilVote {
  agent: AgentRole;
  agentName: string;
  vote: Vote;
  reason: string;
  timestamp: Date;
}

export interface CouncilSession {
  id: string;
  topic: string;
  description: string;
  initiatedBy: AgentRole;
  startedAt: Date;
  votes: CouncilVote[];
  status: 'open' | 'closed' | 'tied';
  outcome?: DecisionOutcome;
  tieBreaker?: AgentRole;
}

// ==================== Agent Action Log ====================

export interface AgentAction {
  id: string;
  timestamp: Date;
  agent: AgentRole;
  agentName: string;
  action: string;
  target?: string;
  result: 'success' | 'failure' | 'pending';
  details: Record<string, any>;
}

// ==================== CLI Response Types ====================

export interface AgentCLIResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  humanEscalation?: boolean;
}
