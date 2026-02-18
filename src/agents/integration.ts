/**
 * The Continental - Agent Integration Layer
 * 
 * Responsibilities:
 * - Wire agents into payment flow
 * - Agent approval middleware
 * - Agent notifications
 * - Agent actions logging
 */

import { Logger } from '../utils/logger.js';
import { Transaction, Money, PaymentProvider, SendMoneyParams, RequestPaymentParams, RefundParams } from '../types/index.js';
import {
  AgentRole,
  AgentDecision,
  AgentNotification,
  AgentAction,
  AgentMetrics,
  TransactionApprovalRequest,
  RefundApprovalRequest,
  SystemHealthMetrics,
} from './types.js';
import { BaseAgent } from './base.js';
import { CEOAgent } from './ceo.js';
import { CTOAgent } from './cto.js';
import { CFOAgent } from './cfo.js';
import { COOAgent } from './coo.js';
import { CCOAgent } from './cco.js';
import { CMOAgent } from './cmo.js';
import { CROAgent } from './cro.js';
import { HighTableCouncil } from './council.js';

export interface AgentSwarmConfig {
  enabled: boolean;
  autoApprovalEnabled: boolean;
  humanEscalationEnabled: boolean;
  logAllDecisions: boolean;
  decisionTimeoutMs: number;
}

export class AgentSwarmIntegration {
  private logger: Logger;
  private config: AgentSwarmConfig;
  private council: HighTableCouncil;
  
  // Individual agents
  public ceo: CEOAgent;
  public cto: CTOAgent;
  public cfo: CFOAgent;
  public coo: COOAgent;
  public cco: CCOAgent;
  public cmo: CMOAgent;
  public cro: CROAgent;

  // Action log
  private actionLog: AgentAction[] = [];
  private decisionLog: AgentDecision[] = [];

  constructor(logger: Logger, config?: Partial<AgentSwarmConfig>) {
    this.logger = logger;
    this.config = {
      enabled: true,
      autoApprovalEnabled: true,
      humanEscalationEnabled: true,
      logAllDecisions: true,
      decisionTimeoutMs: 30000,
      ...config,
    };

    // Initialize council
    this.council = new HighTableCouncil(logger);

    // Initialize agents
    this.ceo = new CEOAgent(logger);
    this.cto = new CTOAgent(logger);
    this.cfo = new CFOAgent(logger);
    this.coo = new COOAgent(logger);
    this.cco = new CCOAgent(logger);
    this.cmo = new CMOAgent(logger);
    this.cro = new CROAgent(logger);

    // Register agents with council
    this.registerAgentsWithCouncil();

    this.logger.info('🕴️ The Continental Agent Swarm initialized');
  }

  private registerAgentsWithCouncil(): void {
    this.council.registerAgent(this.ceo);
    this.council.registerAgent(this.cto);
    this.council.registerAgent(this.cfo);
    this.council.registerAgent(this.coo);
    this.council.registerAgent(this.cco);
    this.council.registerAgent(this.cmo);
    this.council.registerAgent(this.cro);
  }

  // ==================== Payment Flow Integration ====================

  /**
   * Middleware: Check transaction approval before processing
   */
  async checkTransactionApproval(
    transaction: Partial<Transaction>,
    params: SendMoneyParams | RequestPaymentParams
  ): Promise<{ approved: boolean; decision?: AgentDecision; reason?: string }> {
    if (!this.config.enabled) {
      return { approved: true };
    }

    this.logger.info(`🔍 The Continental reviewing transaction: ${transaction.id || 'pending'}`);

    // Handle both SendMoneyParams (has recipient) and RequestPaymentParams (has customer)
    const isSendMoney = 'recipient' in params;
    const customerInfo = isSendMoney 
      ? params.recipient 
      : params.customer;

    const request: TransactionApprovalRequest = {
      transactionId: transaction.id || 'pending',
      amount: params.amount,
      customerId: params.metadata?.customerId || 
                  (isSendMoney ? 'unknown' : params.customer.id) || 'unknown',
      customerName: isSendMoney 
        ? params.recipient?.name 
        : params.customer?.name,
      customerEmail: isSendMoney 
        ? params.recipient?.email 
        : params.customer?.email,
      provider: params.provider || 'auto',
      paymentMethod: 'mobile_money',
      riskScore: params.metadata?.riskScore,
      metadata: params.metadata,
    };

    // Get CEO decision
    const decision = await this.ceo.approveTransaction(request);
    this.logDecision(decision);

    if (decision.requiresHumanReview && this.config.humanEscalationEnabled) {
      this.logger.warn(`⏸️ Transaction ${request.transactionId} escalated to human CEO`);
      return { approved: false, decision, reason: 'Requires human CEO approval' };
    }

    if (decision.outcome === 'rejected') {
      return { approved: false, decision, reason: decision.reason };
    }

    if (decision.outcome === 'escalated') {
      // Try council consensus
      const councilDecision = await this.council.requestConsensus(
        'Transaction Approval',
        `Transaction ${request.transactionId} for ${request.amount.currency} ${request.amount.amount}`,
        { type: 'transaction_approval', request },
        'ceo'
      );
      
      this.logDecision(councilDecision);
      
      if (councilDecision.outcome === 'rejected') {
        return { approved: false, decision: councilDecision, reason: councilDecision.reason };
      }
      
      if (councilDecision.outcome === 'escalated') {
        return { approved: false, decision: councilDecision, reason: 'Requires human review' };
      }
    }

    // Notify CFO of transaction for fraud monitoring
    const fraudAnalysis = this.cfo.analyzeTransactionForFraud({
      id: request.transactionId,
      amount: request.amount,
      customerId: request.customerId,
      velocity: params.metadata?.velocity || 1,
      deviceFingerprint: params.metadata?.deviceFingerprint,
      ipAddress: params.metadata?.ipAddress,
    });

    if (fraudAnalysis.riskScore > 0.5) {
      this.logger.warn(`⚠️ Transaction ${request.transactionId} flagged for fraud review (score: ${fraudAnalysis.riskScore})`);
    }

    // Log transaction for CFO tracking
    this.cfo.logTransaction(request.amount, 'payment');

    this.logAction('transaction_approved', request.transactionId, 'success', { 
      decision, 
      fraudScore: fraudAnalysis.riskScore 
    });

    return { approved: true, decision };
  }

  /**
   * Middleware: Check refund approval
   */
  async checkRefundApproval(
    params: RefundParams,
    originalTransaction: Transaction
  ): Promise<{ approved: boolean; decision?: AgentDecision; reason?: string }> {
    if (!this.config.enabled) {
      return { approved: true };
    }

    this.logger.info(`💸 The Continental reviewing refund: ${params.originalTransactionId}`);

    const daysSinceTransaction = Math.floor(
      (Date.now() - originalTransaction.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    const request: RefundApprovalRequest = {
      originalTransactionId: params.originalTransactionId,
      refundAmount: params.amount || originalTransaction.amount,
      originalAmount: originalTransaction.amount,
      reason: params.reason || 'Customer request',
      customerId: originalTransaction.customer.id || 'unknown',
      isGoodwillRefund: params.reason?.includes('goodwill') || false,
      daysSinceTransaction,
    };

    // Check with CFO first
    const cfoDecision = await this.cfo.approveRefund(request);
    this.logDecision(cfoDecision);

    if (cfoDecision.outcome === 'rejected') {
      return { approved: false, decision: cfoDecision, reason: cfoDecision.reason };
    }

    if (cfoDecision.requiresHumanReview) {
      // Check with CCO for goodwill refunds
      if (request.isGoodwillRefund) {
        const ccoDecision = await this.cco.approveGoodwillRefund(
          request.customerId,
          request.refundAmount,
          request.reason
        );
        this.logDecision(ccoDecision);

        if (ccoDecision.outcome === 'rejected') {
          return { approved: false, decision: ccoDecision, reason: ccoDecision.reason };
        }

        if (ccoDecision.requiresHumanReview) {
          return { approved: false, decision: ccoDecision, reason: 'Requires human CCO approval' };
        }
      } else {
        return { approved: false, decision: cfoDecision, reason: 'Requires human CFO approval' };
      }
    }

    this.logAction('refund_approved', params.originalTransactionId, 'success', { decision: cfoDecision });

    return { approved: true, decision: cfoDecision };
  }

  /**
   * Middleware: Check infrastructure change approval
   */
  async checkInfrastructureChange(
    changeType: 'provider_update' | 'config_change' | 'deployment' | 'scaling',
    description: string,
    impact: 'low' | 'medium' | 'high' | 'critical',
    affectedProviders: string[],
    rollbackPlan: string
  ): Promise<{ approved: boolean; decision?: AgentDecision; reason?: string }> {
    if (!this.config.enabled) {
      return { approved: true };
    }

    this.logger.info(`🔧 The Continental reviewing infrastructure change: ${changeType}`);

    const decision = await this.cto.approveInfrastructureChange({
      changeType,
      description,
      impact,
      affectedProviders,
      rollbackPlan,
    });

    this.logDecision(decision);

    if (decision.outcome === 'rejected') {
      return { approved: false, decision, reason: decision.reason };
    }

    if (decision.outcome === 'escalated' || decision.requiresHumanReview) {
      return { approved: false, decision, reason: 'Requires human CTO approval' };
    }

    // Notify COO of planned change
    this.council.broadcast(
      'cto',
      'Infrastructure Change Approved',
      `${changeType} approved: ${description}`,
      impact === 'critical' || impact === 'high' ? 'urgent' : 'medium'
    );

    this.logAction('infrastructure_approved', changeType, 'success', { decision });

    return { approved: true, decision };
  }

  /**
   * Middleware: Check new provider integration
   */
  async checkProviderIntegration(
    providerName: string,
    providerType: string,
    sandboxTested: boolean,
    requiredCredentials: string[],
    estimatedVolume: string
  ): Promise<{ approved: boolean; decision?: AgentDecision; reason?: string }> {
    if (!this.config.enabled) {
      return { approved: true };
    }

    this.logger.info(`🔌 The Continental reviewing provider integration: ${providerName}`);

    const decision = await this.cto.approveProviderIntegration({
      providerName,
      providerType,
      sandboxTested,
      requiredCredentials,
      estimatedVolume,
    });

    this.logDecision(decision);

    if (decision.outcome === 'rejected') {
      return { approved: false, decision, reason: decision.reason };
    }

    if (decision.outcome === 'escalated' || decision.requiresHumanReview) {
      return { approved: false, decision, reason: 'Requires human CTO approval' };
    }

    // Also check with CFO for financial impact
    const cfoContext = {
      type: 'provider_integration',
      providerName,
      estimatedVolume,
      potentialRevenue: estimatedVolume, // Simplified
    };

    this.logAction('provider_integration_approved', providerName, 'success', { decision });

    return { approved: true, decision };
  }

  // ==================== System Health Integration ====================

  /**
   * Update system health from COO
   */
  updateSystemHealth(): SystemHealthMetrics {
    const health = this.coo.getSystemHealth();
    
    // If critical, notify all agents
    if (health.overall === 'critical') {
      this.council.broadcast(
        'coo',
        '🚨 SYSTEM CRITICAL',
        `System health is CRITICAL. ${health.activeIncidents} active incidents.`,
        'urgent'
      );
    }

    return {
      overallHealth: health.overall,
      activeAgents: this.council.getStatistics().activeAgents,
      pendingDecisions: health.activeIncidents,
      avgResponseTime: 0,
      alerts: this.council.getNotifications('all'),
    };
  }

  /**
   * Report incident to COO
   */
  async reportIncident(
    severity: 'low' | 'medium' | 'high' | 'critical',
    component: string,
    description: string,
    affectedServices: string[]
  ): Promise<void> {
    const incident = await this.coo.detectIncident(
      severity,
      component,
      description,
      affectedServices,
      {}
    );

    if (severity === 'critical') {
      // Escalate to CTO as well
      await this.cto.escalateTechnicalIssue(description, severity, affectedServices);
    }

    this.logAction('incident_reported', incident.id, 'success', { severity, component });
  }

  // ==================== Logging ====================

  private logDecision(decision: AgentDecision): void {
    if (this.config.logAllDecisions) {
      this.decisionLog.push(decision);
      
      // Keep log size manageable
      if (this.decisionLog.length > 10000) {
        this.decisionLog = this.decisionLog.slice(-5000);
      }
    }
  }

  private logAction(
    action: string,
    target: string | undefined,
    result: 'success' | 'failure' | 'pending',
    details: Record<string, any>
  ): void {
    const actionEntry: AgentAction = {
      id: `ACTION-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date(),
      agent: 'council', // Use council as the agent role for integration actions
      agentName: 'The Continental',
      action,
      target,
      result,
      details,
    };

    this.actionLog.push(actionEntry);

    // Keep log size manageable
    if (this.actionLog.length > 10000) {
      this.actionLog = this.actionLog.slice(-5000);
    }
  }

  // ==================== Query Methods ====================

  /**
   * Get all agent states
   */
  getAllAgentStates(): Array<{
    role: AgentRole;
    name: string;
    status: string;
    active: boolean;
    health: string;
    decisionsMade: number;
  }> {
    const agents: BaseAgent[] = [
      this.ceo, this.cto, this.cfo, this.coo,
      this.cco, this.cmo, this.cro
    ];

    return agents.map(agent => {
      const state = agent.getState();
      return {
        role: state.role,
        name: state.name,
        status: state.status,
        active: state.active,
        health: state.health,
        decisionsMade: state.decisionsMade,
      };
    });
  }

  /**
   * Get agent by role
   */
  getAgent(role: AgentRole): BaseAgent | undefined {
    const agents: Record<AgentRole, BaseAgent> = {
      ceo: this.ceo,
      cto: this.cto,
      cfo: this.cfo,
      coo: this.coo,
      cco: this.cco,
      cmo: this.cmo,
      cro: this.cro,
      council: this.council as any, // Not a base agent
    };

    return agents[role];
  }

  /**
   * Get council
   */
  getCouncil(): HighTableCouncil {
    return this.council;
  }

  /**
   * Get decision history
   */
  getDecisionHistory(limit: number = 50): AgentDecision[] {
    return this.decisionLog.slice(-limit);
  }

  /**
   * Get action log
   */
  getActionLog(limit: number = 50): AgentAction[] {
    return this.actionLog.slice(-limit);
  }

  /**
   * Get comprehensive swarm status
   */
  getSwarmStatus(): {
    enabled: boolean;
    config: AgentSwarmConfig;
    agents: Array<{
      role: import('./types.js').AgentRole;
      name: string;
      status: string;
      active: boolean;
      health: string;
      decisionsMade: number;
    }>;
    council: {
      registeredAgents: number;
      activeAgents: number;
      totalSessions: number;
      approvedProposals: number;
      rejectedProposals: number;
      tieBreakerInvoked: number;
      avgVotingTime: number;
    };
    recentDecisions: AgentDecision[];
    recentActions: AgentAction[];
  } {
    return {
      enabled: this.config.enabled,
      config: this.config,
      agents: this.getAllAgentStates(),
      council: this.council.getStatistics(),
      recentDecisions: this.getDecisionHistory(10),
      recentActions: this.getActionLog(10),
    };
  }

  // ==================== Configuration ====================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AgentSwarmConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info(`🔧 The Continental config updated: ${JSON.stringify(config)}`);
  }

  /**
   * Enable/disable swarm
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.logger.info(`🕴️ The Continental ${enabled ? 'enabled' : 'disabled'}`);
  }
}
