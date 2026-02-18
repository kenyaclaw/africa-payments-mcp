/**
 * The Continental - CRO Agent (Sofia)
 * 
 * Responsibilities:
 * - Sales pipeline
 * - Enterprise deal approval
 * - Pricing decisions
 * - Revenue forecasting
 */

import { BaseAgent, AgentConfig } from './base.js';
import { Logger } from '../utils/logger.js';
import { AgentDecision, PricingDecisionRequest, Money, AgentNotification } from './types.js';

export interface Deal {
  id: string;
  customerName: string;
  customerId?: string;
  value: Money;
  stage: 'prospecting' | 'qualification' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
  probability: number; // 0-100
  expectedCloseDate: Date;
  assignedTo: string;
  products: string[];
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  discountApproved?: number; // percentage
}

export interface PricingTier {
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  limits: {
    transactions: number;
    volume: number;
    apiCalls: number;
  };
}

export interface RevenueForecast {
  period: string;
  predictedRevenue: Money;
  confidence: number;
  bestCase: Money;
  worstCase: Money;
  assumptions: string[];
}

export class CROAgent extends BaseAgent {
  private deals: Map<string, Deal> = new Map();
  private pricingTiers: Map<string, PricingTier> = new Map();
  private customPricing: Map<string, PricingTier> = new Map();
  private revenueHistory: Array<{ date: Date; amount: number; currency: string }> = [];

  constructor(logger: Logger, config?: Partial<AgentConfig>) {
    super(
      {
        name: 'Sofia',
        role: 'cro',
        active: true,
        requiresHumanAbove: 50000,
        confidenceThreshold: 0.75,
        ...config,
      },
      logger
    );

    // Initialize default pricing tiers
    this.initializeDefaultPricing();
  }

  private initializeDefaultPricing(): void {
    this.pricingTiers.set('starter', {
      name: 'Starter',
      monthlyPrice: 99,
      yearlyPrice: 990,
      features: ['Basic API access', '5 providers', 'Email support', 'Standard webhooks'],
      limits: { transactions: 1000, volume: 50000, apiCalls: 10000 },
    });

    this.pricingTiers.set('growth', {
      name: 'Growth',
      monthlyPrice: 299,
      yearlyPrice: 2990,
      features: ['Full API access', 'All providers', 'Priority support', 'Advanced webhooks', 'Fraud detection'],
      limits: { transactions: 10000, volume: 500000, apiCalls: 100000 },
    });

    this.pricingTiers.set('enterprise', {
      name: 'Enterprise',
      monthlyPrice: 999,
      yearlyPrice: 9990,
      features: ['Unlimited API access', 'Custom providers', 'Dedicated support', 'SLA guarantee', 'Custom integrations'],
      limits: { transactions: -1, volume: -1, apiCalls: -1 },
    });
  }

  /**
   * Create new deal
   */
  async createDeal(deal: Omit<Deal, 'id' | 'createdAt' | 'updatedAt' | 'stage'>): Promise<Deal> {
    const newDeal: Deal = {
      ...deal,
      id: `DEAL-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      stage: 'prospecting',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.deals.set(newDeal.id, newDeal);
    this.logger.info(`💼 Sofia created deal: ${newDeal.customerName} (${newDeal.value.currency} ${newDeal.value.amount})`);

    return newDeal;
  }

  /**
   * Update deal stage
   */
  updateDealStage(dealId: string, stage: Deal['stage'], notes?: string): void {
    const deal = this.deals.get(dealId);
    if (!deal) return;

    deal.stage = stage;
    deal.updatedAt = new Date();
    if (notes) {
      deal.notes += `\n[${new Date().toISOString()}] ${notes}`;
    }

    this.logger.info(`📊 Sofia updated deal ${dealId} to ${stage}`);

    // Update probability based on stage
    const stageProbabilities: Record<string, number> = {
      prospecting: 10,
      qualification: 25,
      proposal: 50,
      negotiation: 75,
      closed_won: 100,
      closed_lost: 0,
    };
    deal.probability = stageProbabilities[stage] || deal.probability;
  }

  /**
   * Approve enterprise deal
   */
  async approveEnterpriseDeal(dealId: string, discountRequested: number): Promise<AgentDecision> {
    this.setStatus('analyzing');
    
    const deal = this.deals.get(dealId);
    if (!deal) {
      return this.makeDecision(
        'strategic_override',
        'rejected',
        'Deal not found',
        { dealId },
        1.0
      );
    }

    const usdValue = this.convertToUSD(deal.value.amount, deal.value.currency);
    
    this.logger.info(`💰 Sofia reviewing enterprise deal: ${deal.customerName} - ${discountRequested}% discount`);

    let outcome: 'approved' | 'rejected' | 'escalated';
    let confidence: number;
    let reason: string;

    // Approval rules
    if (usdValue > 100000 && discountRequested > 20) {
      outcome = 'escalated';
      confidence = 0.6;
      reason = `High-value deal ($${usdValue.toFixed(2)}) with significant discount (${discountRequested}%) requires executive approval`;
    } else if (discountRequested > 30) {
      outcome = 'rejected';
      confidence = 0.85;
      reason = `Discount (${discountRequested}%) exceeds maximum authorized limit (30%)`;
    } else if (usdValue > 50000) {
      outcome = 'escalated';
      confidence = 0.7;
      reason = `Large enterprise deal ($${usdValue.toFixed(2)}) requires additional review`;
    } else if (deal.stage !== 'negotiation') {
      outcome = 'rejected';
      confidence = 0.9;
      reason = 'Deal must reach negotiation stage before discount approval';
    } else {
      outcome = 'approved';
      confidence = 0.85;
      reason = `Deal approved with ${discountRequested}% discount`;
      deal.discountApproved = discountRequested;
    }

    this.setStatus(outcome === 'approved' ? 'approving' : outcome === 'rejected' ? 'rejecting' : 'escalating');

    const decision = await this.makeDecision(
      'pricing_decision',
      outcome,
      reason,
      { deal, discountRequested, usdValue },
      confidence
    );

    this.setStatus('idle');
    return decision;
  }

  /**
   * Approve pricing decision
   */
  async approvePricingDecision(request: PricingDecisionRequest): Promise<AgentDecision> {
    this.setStatus('analyzing');
    
    this.logger.info(`💵 Sofia reviewing pricing decision: ${request.changeType}`);

    const { impact, affectedCustomers, duration } = request;
    const usdImpact = this.convertToUSD(impact.amount, impact.currency);

    let outcome: 'approved' | 'rejected' | 'escalated';
    let confidence: number;
    let reason: string;

    if (Math.abs(usdImpact) > 100000) {
      outcome = 'escalated';
      confidence = 0.6;
      reason = `High financial impact ($${usdImpact.toFixed(2)}) requires board approval`;
    } else if (affectedCustomers.length > 100) {
      outcome = 'escalated';
      confidence = 0.65;
      reason = `Affects ${affectedCustomers.length} customers - review impact`;
    } else if (request.changeType === 'promotion' && !duration) {
      outcome = 'rejected';
      confidence = 0.8;
      reason = 'Promotions must have defined duration';
    } else {
      outcome = 'approved';
      confidence = 0.8;
      reason = 'Pricing decision within authorized parameters';
    }

    this.setStatus(outcome === 'approved' ? 'approving' : outcome === 'rejected' ? 'rejecting' : 'escalating');

    const decision = await this.makeDecision(
      'pricing_decision',
      outcome,
      reason,
      { request, usdImpact },
      confidence
    );

    this.setStatus('idle');
    return decision;
  }

  /**
   * Generate revenue forecast
   */
  generateRevenueForecast(period: 'month' | 'quarter' | 'year'): RevenueForecast {
    const activeDeals = Array.from(this.deals.values()).filter(
      d => d.stage !== 'closed_won' && d.stage !== 'closed_lost'
    );

    // Calculate weighted pipeline
    let predictedRevenue = 0;
    let bestCase = 0;
    let worstCase = 0;

    for (const deal of activeDeals) {
      const usdValue = this.convertToUSD(deal.value.amount, deal.value.currency);
      const probability = deal.probability / 100;

      predictedRevenue += usdValue * probability;
      bestCase += usdValue;
      worstCase += usdValue * 0.2; // Assume 20% minimum conversion
    }

    // Add historical trend
    const recentRevenue = this.revenueHistory
      .filter(r => r.date > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
      .reduce((sum, r) => sum + this.convertToUSD(r.amount, r.currency), 0);

    const monthlyAverage = recentRevenue / 3;
    predictedRevenue += monthlyAverage * (period === 'month' ? 1 : period === 'quarter' ? 3 : 12);
    bestCase += monthlyAverage * 1.5 * (period === 'month' ? 1 : period === 'quarter' ? 3 : 12);
    worstCase += monthlyAverage * 0.5 * (period === 'month' ? 1 : period === 'quarter' ? 3 : 12);

    return {
      period,
      predictedRevenue: { amount: predictedRevenue, currency: 'USD' },
      confidence: activeDeals.length > 10 ? 0.8 : 0.6,
      bestCase: { amount: bestCase, currency: 'USD' },
      worstCase: { amount: worstCase, currency: 'USD' },
      assumptions: [
        'Based on current pipeline probability',
        'Historical trend from last 90 days',
        'Assumes consistent market conditions',
      ],
    };
  }

  /**
   * Get pipeline overview
   */
  getPipelineOverview(): {
    totalDeals: number;
    totalValue: Money;
    byStage: Record<string, { count: number; value: number }>;
    weightedForecast: number;
    avgDealSize: number;
  } {
    const allDeals = Array.from(this.deals.values());
    const activeDeals = allDeals.filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost');

    const totalValue = activeDeals.reduce((sum, d) => sum + this.convertToUSD(d.value.amount, d.value.currency), 0);
    const weightedForecast = activeDeals.reduce(
      (sum, d) => sum + this.convertToUSD(d.value.amount, d.value.currency) * (d.probability / 100),
      0
    );

    const byStage: Record<string, { count: number; value: number }> = {};
    for (const deal of activeDeals) {
      if (!byStage[deal.stage]) {
        byStage[deal.stage] = { count: 0, value: 0 };
      }
      byStage[deal.stage].count++;
      byStage[deal.stage].value += this.convertToUSD(deal.value.amount, deal.value.currency);
    }

    return {
      totalDeals: activeDeals.length,
      totalValue: { amount: totalValue, currency: 'USD' },
      byStage,
      weightedForecast,
      avgDealSize: activeDeals.length > 0 ? totalValue / activeDeals.length : 0,
    };
  }

  /**
   * Record revenue
   */
  recordRevenue(amount: Money, date?: Date): void {
    this.revenueHistory.push({
      date: date || new Date(),
      amount: amount.amount,
      currency: amount.currency,
    });

    // Keep only last 365 days
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    this.revenueHistory = this.revenueHistory.filter(r => r.date > cutoff);
  }

  /**
   * Get pricing tier
   */
  getPricingTier(tierId: string): PricingTier | undefined {
    return this.pricingTiers.get(tierId) || this.customPricing.get(tierId);
  }

  /**
   * Create custom pricing
   */
  createCustomPricing(customerId: string, tier: Omit<PricingTier, 'name'> & { name: string }): PricingTier {
    const customTier: PricingTier = { ...tier };
    this.customPricing.set(customerId, customTier);
    this.logger.info(`💎 Sofia created custom pricing for ${customerId}`);
    return customTier;
  }

  /**
   * Get sales performance
   */
  getSalesPerformance(): {
    dealsWon: number;
    dealsLost: number;
    totalRevenue: number;
    avgDealSize: number;
    winRate: number;
    avgSalesCycle: number; // days
  } {
    const won = Array.from(this.deals.values()).filter(d => d.stage === 'closed_won');
    const lost = Array.from(this.deals.values()).filter(d => d.stage === 'closed_lost');
    const total = won.length + lost.length;

    const totalRevenue = won.reduce((sum, d) => sum + this.convertToUSD(d.value.amount, d.value.currency), 0);
    
    const salesCycles = won
      .filter(d => d.createdAt && d.updatedAt)
      .map(d => Math.round((d.updatedAt!.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24)));
    
    return {
      dealsWon: won.length,
      dealsLost: lost.length,
      totalRevenue,
      avgDealSize: won.length > 0 ? totalRevenue / won.length : 0,
      winRate: total > 0 ? (won.length / total) * 100 : 0,
      avgSalesCycle: salesCycles.length > 0
        ? salesCycles.reduce((a, b) => a + b, 0) / salesCycles.length
        : 0,
    };
  }

  /**
   * Process generic context (required by base class)
   */
  async process(context: Record<string, any>): Promise<AgentDecision> {
    if (context.type === 'enterprise_deal') {
      return this.approveEnterpriseDeal(context.dealId, context.discountRequested);
    }

    if (context.type === 'pricing_decision') {
      return this.approvePricingDecision(context.request as PricingDecisionRequest);
    }

    return this.makeDecision(
      'pricing_decision',
      'escalated',
      'Unknown sales/revenue request type - requires clarification',
      context,
      0.5
    );
  }
}
