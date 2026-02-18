/**
 * The Continental - CCO Agent (Charon)
 * 
 * Responsibilities:
 * - Handle customer complaints
 * - Approve goodwill refunds
 * - Monitor support tickets
 * - Customer satisfaction
 */

import { BaseAgent, AgentConfig } from './base.js';
import { Logger } from '../utils/logger.js';
import { AgentDecision, CustomerComplaintRequest, AgentNotification, Money } from './types.js';

export interface SupportTicket {
  id: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  type: 'complaint' | 'inquiry' | 'refund_request' | 'technical_issue' | 'fraud_report';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'escalated';
  subject: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  transactionId?: string;
  assignedTo?: string;
  sentiment: 'negative' | 'neutral' | 'positive';
  previousInteractions: number;
}

export interface CustomerSatisfactionMetrics {
  overallScore: number; // 0-100
  nps: number; // -100 to 100
  responseTimeAvg: number; // minutes
  resolutionTimeAvg: number; // hours
  ticketsByCategory: Record<string, number>;
  satisfactionByChannel: Record<string, number>;
}

export class CCOAgent extends BaseAgent {
  private tickets: Map<string, SupportTicket> = new Map();
  private customerHistory: Map<string, Array<{ type: string; timestamp: Date; outcome: string }>> = new Map();
  private satisfactionMetrics: CustomerSatisfactionMetrics;
  private goodwillRefundBudget: number = 5000; // USD monthly budget
  private goodwillRefundedThisMonth: number = 0;

  constructor(logger: Logger, config?: Partial<AgentConfig>) {
    super(
      {
        name: 'Charon',
        role: 'cco',
        active: true,
        requiresHumanAbove: 1000,
        confidenceThreshold: 0.75,
        ...config,
      },
      logger
    );

    this.satisfactionMetrics = {
      overallScore: 85,
      nps: 45,
      responseTimeAvg: 15,
      resolutionTimeAvg: 4,
      ticketsByCategory: {},
      satisfactionByChannel: {},
    };
  }

  /**
   * Create support ticket
   */
  async createTicket(request: Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<SupportTicket> {
    const ticket: SupportTicket = {
      ...request,
      id: `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'open',
    };

    this.tickets.set(ticket.id, ticket);
    
    // Update customer history
    if (!this.customerHistory.has(ticket.customerId)) {
      this.customerHistory.set(ticket.customerId, []);
    }
    this.customerHistory.get(ticket.customerId)!.push({
      type: ticket.type,
      timestamp: new Date(),
      outcome: 'open',
    });

    this.logger.info(`📧 Charon created ticket ${ticket.id} for customer ${ticket.customerId} (${ticket.severity})`);

    // Auto-process based on type and severity
    if (ticket.severity === 'critical') {
      await this.escalateTicket(ticket.id, 'Critical ticket - immediate attention required');
    } else if (ticket.type === 'refund_request') {
      await this.processRefundTicket(ticket);
    } else if (ticket.sentiment === 'negative' && ticket.previousInteractions > 2) {
      await this.escalateTicket(ticket.id, 'Repeat negative interaction - VIP handling');
    }

    return ticket;
  }

  /**
   * Process customer complaint
   */
  async processComplaint(request: CustomerComplaintRequest): Promise<AgentDecision> {
    this.setStatus('analyzing');
    
    this.logger.info(`📞 Charon processing complaint from ${request.customerId}: ${request.complaintType}`);

    const { severity, description, previousInteractions, transactionId } = request;
    
    let outcome: 'approved' | 'rejected' | 'escalated';
    let confidence: number;
    let reason: string;

    // Analyze customer history
    const customerHistory = this.customerHistory.get(request.customerId) || [];
    const recentComplaints = customerHistory.filter(
      h => h.type === 'complaint' && h.timestamp > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );

    if (severity === 'critical') {
      outcome = 'escalated';
      confidence = 0.9;
      reason = 'Critical complaint requires immediate human intervention';
    } else if (recentComplaints.length > 3) {
      outcome = 'escalated';
      confidence = 0.8;
      reason = `Repeat complainer (${recentComplaints.length} in 30 days) - VIP handling required`;
    } else if (previousInteractions > 5) {
      outcome = 'escalated';
      confidence = 0.75;
      reason = 'Long interaction history - specialist attention needed';
    } else if (severity === 'high' && request.complaintType === 'service_outage') {
      outcome = 'approved';
      confidence = 0.85;
      reason = 'Service outage complaint - standard resolution path';
    } else {
      outcome = 'approved';
      confidence = 0.8;
      reason = 'Standard complaint - automated resolution';
    }

    this.setStatus(outcome === 'approved' ? 'approving' : 'escalating');

    const decision = await this.makeDecision(
      'customer_complaint',
      outcome,
      reason,
      { request, recentComplaints: recentComplaints.length },
      confidence
    );

    this.setStatus('idle');
    return decision;
  }

  /**
   * Approve goodwill refund
   */
  async approveGoodwillRefund(
    customerId: string,
    amount: Money,
    reason: string,
    ticketId?: string
  ): Promise<AgentDecision> {
    this.setStatus('analyzing');
    
    const usdAmount = this.convertToUSD(amount.amount, amount.currency);
    
    this.logger.info(`🎁 Charon reviewing goodwill refund for ${customerId}: $${usdAmount.toFixed(2)}`);

    const customerHistory = this.customerHistory.get(customerId) || [];
    const lifetimeValue = this.calculateCustomerLifetimeValue(customerId);
    const complaintCount = customerHistory.filter(h => h.type === 'complaint').length;

    let outcome: 'approved' | 'rejected' | 'escalated';
    let confidence: number;
    let reason_msg: string;

    // Budget check
    if (this.goodwillRefundedThisMonth + usdAmount > this.goodwillRefundBudget) {
      outcome = 'escalated';
      confidence = 0.7;
      reason_msg = 'Monthly goodwill budget exhausted - requires approval';
    } else if (usdAmount > 1000) {
      outcome = 'escalated';
      confidence = 0.6;
      reason_msg = 'Large goodwill refund requires human CCO approval';
    } else if (complaintCount > 5) {
      outcome = 'escalated';
      confidence = 0.7;
      reason_msg = 'Frequent complainer - review for abuse';
    } else if (lifetimeValue > 10000 && usdAmount < 500) {
      outcome = 'approved';
      confidence = 0.9;
      reason_msg = `High-value customer (LTV: $${lifetimeValue.toFixed(2)}) - goodwill approved`;
      this.goodwillRefundedThisMonth += usdAmount;
    } else if (usdAmount < 100) {
      outcome = 'approved';
      confidence = 0.85;
      reason_msg = `Small goodwill gesture approved: ${reason}`;
      this.goodwillRefundedThisMonth += usdAmount;
    } else {
      outcome = 'approved';
      confidence = 0.75;
      reason_msg = `Goodwill refund approved: ${reason}`;
      this.goodwillRefundedThisMonth += usdAmount;
    }

    const statusMap: Record<string, 'approving' | 'rejecting' | 'escalating'> = {
      'approved': 'approving',
      'rejected': 'rejecting',
      'escalated': 'escalating',
    };
    this.setStatus(statusMap[outcome]);

    const decision = await this.makeDecision(
      'refund_approval',
      outcome,
      reason_msg,
      { customerId, amount, usdAmount, lifetimeValue, reason },
      confidence
    );

    this.setStatus('idle');
    return decision;
  }

  /**
   * Escalate ticket
   */
  async escalateTicket(ticketId: string, escalationReason: string): Promise<AgentNotification> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    ticket.status = 'escalated';
    ticket.updatedAt = new Date();

    this.logger.warn(`📢 Charon escalating ticket ${ticketId}: ${escalationReason}`);

    const notification = this.createNotification(
      'human',
      ticket.severity === 'critical' ? 'urgent' : 'high',
      `Ticket Escalation: ${ticket.subject}`,
      `Ticket ${ticketId} escalated by Charon\n` +
      `Customer: ${ticket.customerName || ticket.customerId}\n` +
      `Reason: ${escalationReason}\n` +
      `Previous interactions: ${ticket.previousInteractions}`,
      true,
      { ticketId, ticket }
    );

    return notification;
  }

  /**
   * Resolve ticket
   */
  resolveTicket(ticketId: string, resolution: string, satisfaction?: number): void {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return;

    ticket.status = 'resolved';
    ticket.resolvedAt = new Date();
    ticket.updatedAt = new Date();

    // Update customer history
    const history = this.customerHistory.get(ticket.customerId);
    if (history) {
      const entry = history.find(h => h.outcome === 'open');
      if (entry) {
        entry.outcome = 'resolved';
      }
    }

    // Update satisfaction metrics if provided
    if (satisfaction !== undefined) {
      this.updateSatisfactionMetrics(ticket.type, satisfaction);
    }

    this.logger.info(`✅ Charon resolved ticket ${ticketId}: ${resolution}`);
    this.logAction('resolve_ticket', ticketId, 'success', { resolution, satisfaction });
  }

  /**
   * Process refund ticket
   */
  private async processRefundTicket(ticket: SupportTicket): Promise<void> {
    // Check if linked to transaction
    if (ticket.transactionId) {
      this.logger.info(`💰 Charon identified refund request linked to transaction ${ticket.transactionId}`);
      // The actual refund approval would be handled by CFO agent
    }
  }

  /**
   * Calculate customer lifetime value (simplified)
   */
  private calculateCustomerLifetimeValue(customerId: string): number {
    // In a real implementation, this would query transaction history
    // For now, return a simulated value based on interaction history
    const history = this.customerHistory.get(customerId) || [];
    return history.length * 500; // Simplified calculation
  }

  /**
   * Update satisfaction metrics
   */
  updateSatisfactionMetrics(category: string, score: number): void {
    if (!this.satisfactionMetrics.ticketsByCategory[category]) {
      this.satisfactionMetrics.ticketsByCategory[category] = 0;
    }
    this.satisfactionMetrics.ticketsByCategory[category]++;

    // Recalculate overall score
    const scores: number[] = [];
    for (const cat in this.satisfactionMetrics.ticketsByCategory) {
      scores.push(score); // Simplified - would average actual scores
    }
    this.satisfactionMetrics.overallScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 85;
  }

  /**
   * Get customer satisfaction metrics
   */
  getSatisfactionMetrics(): CustomerSatisfactionMetrics {
    return { ...this.satisfactionMetrics };
  }

  /**
   * Get open tickets
   */
  getOpenTickets(): SupportTicket[] {
    return Array.from(this.tickets.values()).filter(t => 
      t.status === 'open' || t.status === 'in_progress'
    );
  }

  /**
   * Get tickets by customer
   */
  getCustomerTickets(customerId: string): SupportTicket[] {
    return Array.from(this.tickets.values()).filter(t => t.customerId === customerId);
  }

  /**
   * Generate support report
   */
  generateSupportReport(): {
    totalTickets: number;
    openTickets: number;
    avgResolutionTime: number;
    satisfactionScore: number;
    topIssues: string[];
    goodwillBudgetRemaining: number;
  } {
    const allTickets = Array.from(this.tickets.values());
    const openTickets = allTickets.filter(t => t.status === 'open' || t.status === 'in_progress');
    
    const resolvedTickets = allTickets.filter(t => t.resolvedAt && t.createdAt);
    const avgResolutionTime = resolvedTickets.length > 0
      ? resolvedTickets.reduce((sum, t) => 
          sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()), 0
        ) / resolvedTickets.length / (1000 * 60 * 60) // Convert to hours
      : 0;

    // Count issues by category
    const issueCounts: Record<string, number> = {};
    for (const ticket of allTickets) {
      issueCounts[ticket.type] = (issueCounts[ticket.type] || 0) + 1;
    }
    
    const topIssues = Object.entries(issueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type]) => type);

    return {
      totalTickets: allTickets.length,
      openTickets: openTickets.length,
      avgResolutionTime,
      satisfactionScore: this.satisfactionMetrics.overallScore,
      topIssues,
      goodwillBudgetRemaining: this.goodwillRefundBudget - this.goodwillRefundedThisMonth,
    };
  }

  /**
   * Process generic context (required by base class)
   */
  async process(context: Record<string, any>): Promise<AgentDecision> {
    if (context.type === 'customer_complaint') {
      return this.processComplaint(context.request as CustomerComplaintRequest);
    }

    if (context.type === 'goodwill_refund') {
      return this.approveGoodwillRefund(
        context.customerId,
        context.amount as Money,
        context.reason,
        context.ticketId
      );
    }

    return this.makeDecision(
      'customer_complaint',
      'escalated',
      'Unknown customer service request type - requires clarification',
      context,
      0.5
    );
  }
}
