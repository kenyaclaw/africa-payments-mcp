/**
 * The Continental - Base Agent Class
 * Abstract base class for all agents
 */

import { Logger } from '../utils/logger.js';
import {
  AgentRole,
  AgentState,
  AgentStatus,
  AgentDecision,
  DecisionType,
  DecisionOutcome,
  AgentNotification,
  AgentAction,
} from './types.js';

export interface AgentConfig {
  name: string;
  role: AgentRole;
  active: boolean;
  autoApproveBelow?: number; // Amount threshold for auto-approval
  requiresHumanAbove?: number; // Amount threshold requiring human review
  confidenceThreshold?: number; // Minimum confidence for autonomous decisions
}

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected state: AgentState;
  protected logger: Logger;
  protected decisionHistory: AgentDecision[] = [];
  protected actionLog: AgentAction[] = [];

  constructor(config: AgentConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.state = {
      role: config.role,
      name: config.name,
      status: 'idle',
      lastAction: new Date(),
      decisionsMade: 0,
      active: config.active,
      health: 'healthy',
    };
  }

  // ==================== Core Methods ====================

  getState(): AgentState {
    return { ...this.state };
  }

  getName(): string {
    return this.config.name;
  }

  getRole(): AgentRole {
    return this.config.role;
  }

  isActive(): boolean {
    return this.state.active;
  }

  activate(): void {
    this.state.active = true;
    this.logger.info(`🟢 ${this.config.name} (${this.config.role}) activated`);
  }

  deactivate(): void {
    this.state.active = false;
    this.logger.info(`🔴 ${this.config.name} (${this.config.role}) deactivated`);
  }

  // ==================== Decision Making ====================

  protected async makeDecision(
    decisionType: DecisionType,
    outcome: DecisionOutcome,
    reason: string,
    context: Record<string, any>,
    confidence: number
  ): Promise<AgentDecision> {
    const decision: AgentDecision = {
      id: this.generateId(),
      agent: this.config.role,
      agentName: this.config.name,
      decisionType,
      outcome,
      reason,
      timestamp: new Date(),
      context,
      requiresHumanReview: this.checkRequiresHumanReview(context, confidence),
      confidence,
    };

    this.decisionHistory.push(decision);
    this.state.decisionsMade++;
    this.state.lastAction = new Date();

    this.logger.info(
      `🤖 ${this.config.name} decision: ${decisionType} = ${outcome} (${Math.round(confidence * 100)}% confidence)`
    );

    if (decision.requiresHumanReview) {
      this.logger.warn(`⚠️ ${this.config.name} requires human review for decision ${decision.id}`);
    }

    return decision;
  }

  protected checkRequiresHumanReview(context: Record<string, any>, confidence: number): boolean {
    // Check amount thresholds
    const amount = context.amount?.amount || 0;
    const currency = context.amount?.currency || 'USD';
    
    // Convert to USD for comparison (simplified)
    const usdAmount = this.convertToUSD(amount, currency);
    
    if (this.config.requiresHumanAbove && usdAmount > this.config.requiresHumanAbove) {
      return true;
    }

    // Check confidence threshold
    const minConfidence = this.config.confidenceThreshold || 0.7;
    if (confidence < minConfidence) {
      return true;
    }

    // Check risk indicators
    if (context.riskScore && context.riskScore > 0.8) {
      return true;
    }

    return false;
  }

  protected convertToUSD(amount: number, currency: string): number {
    // Simplified conversion rates
    const rates: Record<string, number> = {
      USD: 1,
      KES: 0.0077,  // Kenyan Shilling
      NGN: 0.00065, // Nigerian Naira
      GHS: 0.083,   // Ghana Cedi
      UGX: 0.00027, // Ugandan Shilling
      TZS: 0.00037, // Tanzanian Shilling
      ZAR: 0.054,   // South African Rand
    };
    
    return amount * (rates[currency] || 1);
  }

  // ==================== Action Logging ====================

  protected logAction(
    action: string,
    target: string | undefined,
    result: 'success' | 'failure' | 'pending',
    details: Record<string, any>
  ): void {
    const actionEntry: AgentAction = {
      id: this.generateId(),
      timestamp: new Date(),
      agent: this.config.role,
      agentName: this.config.name,
      action,
      target,
      result,
      details,
    };

    this.actionLog.push(actionEntry);
    this.state.lastAction = new Date();
  }

  // ==================== Notification ====================

  protected createNotification(
    to: AgentRole | 'all' | 'human',
    priority: 'low' | 'medium' | 'high' | 'urgent',
    title: string,
    message: string,
    actionRequired: boolean = false,
    metadata?: Record<string, any>
  ): AgentNotification {
    return {
      id: this.generateId(),
      from: this.config.role,
      to,
      priority,
      title,
      message,
      timestamp: new Date(),
      actionRequired,
      metadata,
    };
  }

  // ==================== Utility ====================

  protected generateId(): string {
    return `${this.config.role}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  protected setStatus(status: AgentStatus): void {
    this.state.status = status;
  }

  protected setHealth(health: 'healthy' | 'degraded' | 'critical'): void {
    this.state.health = health;
    if (health === 'critical') {
      this.logger.error(`🚨 ${this.config.name} health status: CRITICAL`);
    } else if (health === 'degraded') {
      this.logger.warn(`⚠️ ${this.config.name} health status: DEGRADED`);
    }
  }

  // ==================== Abstract Methods ====================

  abstract process(context: Record<string, any>): Promise<AgentDecision>;

  // ==================== Query Methods ====================

  getDecisionHistory(limit: number = 10): AgentDecision[] {
    return this.decisionHistory.slice(-limit);
  }

  getActionLog(limit: number = 10): AgentAction[] {
    return this.actionLog.slice(-limit);
  }

  getMetrics() {
    const total = this.decisionHistory.length;
    const approved = this.decisionHistory.filter(d => d.outcome === 'approved').length;
    const rejected = this.decisionHistory.filter(d => d.outcome === 'rejected').length;
    const escalated = this.decisionHistory.filter(d => d.outcome === 'escalated').length;

    return {
      agent: this.config.role,
      name: this.config.name,
      decisionsToday: total, // Simplified - would filter by date in production
      totalDecisions: total,
      approvalRate: total > 0 ? approved / total : 0,
      rejectionRate: total > 0 ? rejected / total : 0,
      escalationRate: total > 0 ? escalated / total : 0,
      active: this.state.active,
      health: this.state.health,
    };
  }
}
