/**
 * The Continental - CFO Agent (Adjudicator)
 * 
 * Responsibilities:
 * - Monitor cash flow in real-time
 * - Approve large refunds
 * - Fraud detection oversight
 * - Daily financial reports
 */

import { BaseAgent, AgentConfig } from './base.js';
import { Logger } from '../utils/logger.js';
import {
  AgentDecision,
  RefundApprovalRequest,
  FraudAlertRequest,
  Money,
  AgentNotification,
} from './types.js';

export interface CashFlowMetrics {
  currentBalance: Money;
  dailyVolume: Money;
  dailyRevenue: Money;
  dailyRefunds: Money;
  pendingSettlements: Money;
  providerBalances: Record<string, Money>;
  lastUpdated: Date;
}

export interface FraudPattern {
  pattern: string;
  frequency: number;
  avgLoss: number;
  confidence: number;
}

export class CFOAgent extends BaseAgent {
  private cashFlow: CashFlowMetrics;
  private fraudPatterns: FraudPattern[] = [];
  private flaggedTransactions: string[] = [];
  private dailyTransactionLog: Array<{ timestamp: Date; amount: number; currency: string; type: string }> = [];

  constructor(logger: Logger, config?: Partial<AgentConfig>) {
    super(
      {
        name: 'Adjudicator',
        role: 'cfo',
        active: true,
        requiresHumanAbove: 5000, // $5000 refund requires human
        confidenceThreshold: 0.75,
        ...config,
      },
      logger
    );

    this.cashFlow = {
      currentBalance: { amount: 0, currency: 'USD' },
      dailyVolume: { amount: 0, currency: 'USD' },
      dailyRevenue: { amount: 0, currency: 'USD' },
      dailyRefunds: { amount: 0, currency: 'USD' },
      pendingSettlements: { amount: 0, currency: 'USD' },
      providerBalances: {},
      lastUpdated: new Date(),
    };
  }

  /**
   * Update cash flow metrics
   */
  updateCashFlow(metrics: Partial<CashFlowMetrics>): void {
    this.cashFlow = {
      ...this.cashFlow,
      ...metrics,
      lastUpdated: new Date(),
    };

    this.logAction('cash_flow_update', 'system', 'success', { metrics });
  }

  /**
   * Get current cash flow
   */
  getCashFlow(): CashFlowMetrics {
    return { ...this.cashFlow };
  }

  /**
   * Log transaction for tracking
   */
  logTransaction(amount: Money, type: 'payment' | 'refund' | 'settlement'): void {
    this.dailyTransactionLog.push({
      timestamp: new Date(),
      amount: amount.amount,
      currency: amount.currency,
      type,
    });

    // Keep only last 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.dailyTransactionLog = this.dailyTransactionLog.filter(
      t => t.timestamp > cutoff
    );

    // Update running totals
    if (type === 'payment') {
      this.cashFlow.dailyVolume.amount += this.convertToUSD(amount.amount, amount.currency);
    } else if (type === 'refund') {
      this.cashFlow.dailyRefunds.amount += this.convertToUSD(amount.amount, amount.currency);
    }
  }

  /**
   * Approve refund request
   */
  async approveRefund(request: RefundApprovalRequest): Promise<AgentDecision> {
    this.setStatus('analyzing');
    
    this.logger.info(`💰 Adjudicator reviewing refund: ${request.originalTransactionId} (${request.refundAmount.currency} ${request.refundAmount.amount})`);

    const { refundAmount, originalAmount, reason, isGoodwillRefund, daysSinceTransaction } = request;
    const usdRefund = this.convertToUSD(refundAmount.amount, refundAmount.currency);
    const usdOriginal = this.convertToUSD(originalAmount.amount, originalAmount.currency);

    let outcome: 'approved' | 'rejected' | 'escalated';
    let confidence: number;
    let reason_msg: string;

    // Business rules
    if (usdRefund > 5000) {
      outcome = 'escalated';
      confidence = 0.5;
      reason_msg = `Large refund ($${usdRefund.toFixed(2)}) requires human CFO approval`;
    } else if (isGoodwillRefund && usdRefund > 500) {
      outcome = 'escalated';
      confidence = 0.6;
      reason_msg = 'Goodwill refund over $500 requires additional approval';
    } else if (daysSinceTransaction > 180) {
      outcome = 'rejected';
      confidence = 0.85;
      reason_msg = 'Refund window expired (>180 days)';
    } else if (refundAmount.amount > originalAmount.amount * 1.1) {
      outcome = 'rejected';
      confidence = 0.9;
      reason_msg = 'Refund exceeds original transaction amount (+10% buffer)';
    } else if (this.cashFlow.dailyRefunds.amount > this.cashFlow.dailyVolume.amount * 0.1) {
      outcome = 'escalated';
      confidence = 0.7;
      reason_msg = 'Daily refund rate exceeds 10% of volume - review required';
    } else if (isGoodwillRefund) {
      outcome = 'approved';
      confidence = 0.8;
      reason_msg = `Goodwill refund approved: ${reason}`;
    } else {
      outcome = 'approved';
      confidence = 0.9;
      reason_msg = `Standard refund approved: ${reason}`;
    }

    this.setStatus(outcome === 'approved' ? 'approving' : outcome === 'rejected' ? 'rejecting' : 'escalating');

    const decision = await this.makeDecision(
      'refund_approval',
      outcome,
      reason_msg,
      { request, usdRefund, usdOriginal, cashFlow: this.cashFlow },
      confidence
    );

    if (outcome === 'approved') {
      this.logTransaction(refundAmount, 'refund');
    }

    this.setStatus('idle');
    return decision;
  }

  /**
   * Process fraud alert
   */
  async processFraudAlert(request: FraudAlertRequest): Promise<AgentDecision> {
    this.setStatus('analyzing');
    
    this.logger.warn(`🚨 Adjudicator processing fraud alert: ${request.transactionId} (Risk: ${request.riskScore})`);

    const { transactionId, customerId, riskScore, indicators, suggestedAction } = request;

    let outcome: 'approved' | 'rejected' | 'escalated';
    let confidence: number;
    let reason: string;

    if (riskScore > 0.9) {
      outcome = 'rejected';
      confidence = 0.95;
      reason = `Critical fraud risk (${riskScore}): ${indicators.join(', ')}`;
      this.flaggedTransactions.push(transactionId);
    } else if (riskScore > 0.7) {
      outcome = 'escalated';
      confidence = 0.7;
      reason = `Elevated fraud risk (${riskScore}) - manual review required`;
      this.flaggedTransactions.push(transactionId);
    } else if (riskScore > 0.5) {
      outcome = suggestedAction === 'block' ? 'rejected' : 'approved';
      confidence = 0.6;
      reason = `Medium risk (${riskScore}) - ${outcome} with monitoring`;
    } else {
      outcome = 'approved';
      confidence = 0.85;
      reason = 'Risk within acceptable parameters';
    }

    this.setStatus(outcome === 'approved' ? 'approving' : outcome === 'rejected' ? 'rejecting' : 'escalating');

    const decision = await this.makeDecision(
      'fraud_alert',
      outcome,
      reason,
      { request, fraudPatterns: this.fraudPatterns },
      confidence
    );

    this.setStatus('idle');
    return decision;
  }

  /**
   * Update fraud patterns
   */
  updateFraudPatterns(patterns: FraudPattern[]): void {
    this.fraudPatterns = patterns;
    this.logger.info(`📊 Adjudicator updated fraud patterns: ${patterns.length} patterns`);
    this.logAction('fraud_pattern_update', 'system', 'success', { patterns });
  }

  /**
   * Generate daily financial report
   */
  generateDailyReport(): {
    cashFlow: CashFlowMetrics;
    transactionCount: number;
    fraudAlerts: number;
    flaggedTransactions: number;
    topRiskFactors: FraudPattern[];
    recommendations: string[];
  } {
    const today = new Date().toDateString();
    const todayTransactions = this.dailyTransactionLog.filter(
      t => t.timestamp.toDateString() === today
    );

    const fraudDecisions = this.decisionHistory.filter(
      d => d.decisionType === 'fraud_alert' && d.timestamp.toDateString() === today
    );

    const recommendations: string[] = [];

    // Generate recommendations
    if (this.cashFlow.dailyRefunds.amount > this.cashFlow.dailyVolume.amount * 0.05) {
      recommendations.push('Refund rate elevated - investigate quality issues');
    }

    if (fraudDecisions.filter(d => d.outcome === 'rejected').length > 10) {
      recommendations.push('High fraud detection rate - review security measures');
    }

    if (this.cashFlow.pendingSettlements.amount > 100000) {
      recommendations.push('Large pending settlements - expedite processing');
    }

    return {
      cashFlow: this.cashFlow,
      transactionCount: todayTransactions.length,
      fraudAlerts: fraudDecisions.length,
      flaggedTransactions: this.flaggedTransactions.length,
      topRiskFactors: this.fraudPatterns.slice(0, 5),
      recommendations,
    };
  }

  /**
   * Analyze transaction for fraud
   */
  analyzeTransactionForFraud(transaction: {
    id: string;
    amount: Money;
    customerId: string;
    velocity: number; // transactions per hour
    deviceFingerprint?: string;
    ipAddress?: string;
  }): { riskScore: number; indicators: string[] } {
    const indicators: string[] = [];
    let riskScore = 0;

    // Velocity check
    if (transaction.velocity > 10) {
      indicators.push('high_velocity');
      riskScore += 0.3;
    }

    // Amount check
    const usdAmount = this.convertToUSD(transaction.amount.amount, transaction.amount.currency);
    if (usdAmount > 1000) {
      indicators.push('high_amount');
      riskScore += 0.2;
    }

    // Check against flagged customers
    if (this.flaggedTransactions.some(t => t.includes(transaction.customerId))) {
      indicators.push('flagged_customer');
      riskScore += 0.4;
    }

    // Check against fraud patterns
    for (const pattern of this.fraudPatterns) {
      if (pattern.pattern === 'velocity_spike' && transaction.velocity > 5) {
        riskScore += pattern.confidence * 0.3;
      }
    }

    return { riskScore: Math.min(riskScore, 1), indicators };
  }

  /**
   * Process generic context (required by base class)
   */
  async process(context: Record<string, any>): Promise<AgentDecision> {
    if (context.type === 'refund_approval') {
      return this.approveRefund(context.request as RefundApprovalRequest);
    }
    
    if (context.type === 'fraud_alert') {
      return this.processFraudAlert(context.request as FraudAlertRequest);
    }

    return this.makeDecision(
      'strategic_override',
      'escalated',
      'Unknown financial request type - requires clarification',
      context,
      0.5
    );
  }
}
