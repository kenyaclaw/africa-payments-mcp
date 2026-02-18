/**
 * The Continental - CEO Agent (Winston)
 * 
 * Responsibilities:
 * - Approve transactions >$1,000
 * - Strategic decisions
 * - Override agent decisions
 * - Report to human CEO
 */

import { BaseAgent, AgentConfig } from './base.js';
import { Logger } from '../utils/logger.js';
import {
  AgentDecision,
  TransactionApprovalRequest,
  AgentNotification,
  AgentRole,
} from './types.js';

export interface CEOConfig extends AgentConfig {
  humanCEONotificationThreshold?: number;
  autoApproveThreshold?: number;
}

export class CEOAgent extends BaseAgent {
  private pendingHumanReview: AgentDecision[] = [];
  private strategicDecisions: AgentDecision[] = [];

  constructor(logger: Logger, config?: Partial<CEOConfig>) {
    super(
      {
        name: 'Winston',
        role: 'ceo',
        active: true,
        autoApproveBelow: 500,
        requiresHumanAbove: 10000,
        confidenceThreshold: 0.85,
        ...config,
      },
      logger
    );
  }

  /**
   * Process transaction approval request
   */
  async approveTransaction(request: TransactionApprovalRequest): Promise<AgentDecision> {
    this.setStatus('analyzing');
    
    const { amount, customerId, provider, riskScore = 0 } = request;
    const usdAmount = this.convertToUSD(amount.amount, amount.currency);

    this.logger.info(`💼 Winston reviewing transaction: ${request.transactionId} (${amount.currency} ${amount.amount})`);

    // Analyze risk factors
    const riskFactors: string[] = [];
    if (riskScore > 0.6) riskFactors.push('elevated risk score');
    if (usdAmount > 5000) riskFactors.push('high value transaction');
    if (provider === 'new_provider') riskFactors.push('new provider');

    // Decision logic
    let outcome: 'approved' | 'rejected' | 'escalated';
    let confidence: number;
    let reason: string;

    if (usdAmount < 100) {
      // Auto-approve small amounts
      outcome = 'approved';
      confidence = 0.95;
      reason = 'Transaction amount below auto-approve threshold';
    } else if (usdAmount > 10000) {
      // Always escalate large amounts to human
      outcome = 'escalated';
      confidence = 0.5;
      reason = `High-value transaction ($${usdAmount.toFixed(2)}) requires human CEO approval`;
      this.pendingHumanReview.push(await this.makeDecision(
        'transaction_approval',
        outcome,
        reason,
        { request, usdAmount },
        confidence
      ));
    } else if (riskScore > 0.8) {
      outcome = 'rejected';
      confidence = 0.9;
      reason = `High risk score (${riskScore}) - transaction declined`;
    } else if (riskFactors.length > 0) {
      outcome = 'escalated';
      confidence = 0.7;
      reason = `Risk factors detected: ${riskFactors.join(', ')}`;
    } else {
      outcome = 'approved';
      confidence = 0.85;
      reason = 'Transaction within acceptable parameters';
    }

    this.setStatus(outcome === 'approved' ? 'approving' : outcome === 'rejected' ? 'rejecting' : 'escalating');

    const decision = await this.makeDecision(
      'transaction_approval',
      outcome,
      reason,
      { request, usdAmount, riskFactors },
      confidence
    );

    this.setStatus('idle');
    return decision;
  }

  /**
   * Override another agent's decision
   */
  async overrideDecision(
    originalDecision: AgentDecision,
    newOutcome: 'approved' | 'rejected' | 'escalated',
    overrideReason: string
  ): Promise<AgentDecision> {
    this.setStatus('analyzing');
    
    this.logger.warn(`⚡ Winston overriding ${originalDecision.agentName}'s decision: ${originalDecision.id}`);

    const decision = await this.makeDecision(
      'strategic_override',
      newOutcome,
      `OVERRIDE: ${overrideReason} (Original: ${originalDecision.outcome} by ${originalDecision.agentName})`,
      {
        originalDecision,
        overrideReason,
        overrideAuthority: 'CEO',
      },
      0.95
    );

    this.strategicDecisions.push(decision);
    this.setStatus('idle');
    return decision;
  }

  /**
   * Make strategic decision
   */
  async makeStrategicDecision(
    topic: string,
    options: string[],
    context: Record<string, any>
  ): Promise<AgentDecision> {
    this.setStatus('analyzing');
    
    this.logger.info(`🎯 Winston making strategic decision: ${topic}`);

    // Simulate strategic analysis
    const recommendedOption = options[0]; // Simplified - would use actual analysis
    const confidence = 0.8;

    const decision = await this.makeDecision(
      'strategic_override',
      'approved',
      `Strategic decision: ${topic} -> ${recommendedOption}`,
      {
        topic,
        options,
        selectedOption: recommendedOption,
        context,
      },
      confidence
    );

    this.strategicDecisions.push(decision);
    this.setStatus('idle');
    return decision;
  }

  /**
   * Get pending items for human CEO review
   */
  getPendingHumanReview(): AgentDecision[] {
    return [...this.pendingHumanReview];
  }

  /**
   * Mark item as reviewed by human CEO
   */
  markAsReviewed(decisionId: string, humanDecision: 'approved' | 'rejected', humanNotes?: string): void {
    const index = this.pendingHumanReview.findIndex(d => d.id === decisionId);
    if (index !== -1) {
      const decision = this.pendingHumanReview[index];
      this.pendingHumanReview.splice(index, 1);
      
      this.logger.info(`✅ Human CEO reviewed ${decisionId}: ${humanDecision}${humanNotes ? ` - ${humanNotes}` : ''}`);
      
      this.logAction('human_review', decisionId, 'success', {
        originalDecision: decision,
        humanDecision,
        humanNotes,
      });
    }
  }

  /**
   * Generate daily report for human CEO
   */
  generateDailyReport(): {
    totalDecisions: number;
    approved: number;
    rejected: number;
    escalated: number;
    pendingHumanReview: number;
    strategicDecisions: number;
    highlights: string[];
  } {
    const allDecisions = this.decisionHistory;
    const today = new Date().toDateString();
    const todayDecisions = allDecisions.filter(d => d.timestamp.toDateString() === today);

    return {
      totalDecisions: todayDecisions.length,
      approved: todayDecisions.filter(d => d.outcome === 'approved').length,
      rejected: todayDecisions.filter(d => d.outcome === 'rejected').length,
      escalated: todayDecisions.filter(d => d.outcome === 'escalated').length,
      pendingHumanReview: this.pendingHumanReview.length,
      strategicDecisions: this.strategicDecisions.length,
      highlights: this.generateHighlights(todayDecisions),
    };
  }

  private generateHighlights(decisions: AgentDecision[]): string[] {
    const highlights: string[] = [];
    
    const highValueTx = decisions.filter(d => 
      d.context.usdAmount > 5000 && d.outcome === 'approved'
    );
    
    if (highValueTx.length > 0) {
      highlights.push(`Approved ${highValueTx.length} high-value transactions`);
    }

    const fraudPrevented = decisions.filter(d => 
      d.context.riskScore > 0.7 && d.outcome === 'rejected'
    );
    
    if (fraudPrevented.length > 0) {
      highlights.push(`Prevented ${fraudPrevented.length} potentially fraudulent transactions`);
    }

    if (this.pendingHumanReview.length > 0) {
      highlights.push(`${this.pendingHumanReview.length} items awaiting your review`);
    }

    return highlights;
  }

  /**
   * Process generic context (required by base class)
   */
  async process(context: Record<string, any>): Promise<AgentDecision> {
    if (context.type === 'transaction_approval') {
      return this.approveTransaction(context.request as TransactionApprovalRequest);
    }
    
    if (context.type === 'strategic_decision') {
      return this.makeStrategicDecision(context.topic, context.options, context);
    }

    return this.makeDecision(
      'strategic_override',
      'escalated',
      'Unknown request type - requires clarification',
      context,
      0.5
    );
  }
}
