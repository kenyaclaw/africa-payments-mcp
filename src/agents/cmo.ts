/**
 * The Continental - CMO Agent (Bowery King)
 * 
 * Responsibilities:
 * - Track marketing campaigns
 * - Referral program management
 * - Growth metrics
 * - Customer acquisition
 */

import { BaseAgent, AgentConfig } from './base.js';
import { Logger } from '../utils/logger.js';
import { AgentDecision, AgentNotification } from './types.js';

export interface MarketingCampaign {
  id: string;
  name: string;
  type: 'referral' | 'promotion' | 'partnership' | 'content' | 'event';
  status: 'draft' | 'active' | 'paused' | 'completed';
  startDate: Date;
  endDate?: Date;
  budget: number; // USD
  spent: number;
  targetAudience: string;
  metrics: {
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    roi?: number; // Return on Investment percentage
  };
  channel: string;
}

export interface ReferralProgram {
  id: string;
  name: string;
  referrerReward: number;
  refereeReward: number;
  active: boolean;
  totalReferrals: number;
  conversionRate: number;
}

export interface GrowthMetrics {
  dailyActiveUsers: number;
  monthlyActiveUsers: number;
  customerAcquisitionCost: number; // USD
  lifetimeValue: number; // USD
  churnRate: number; // percentage
  netRevenueRetention: number; // percentage
  growthRate: number; // percentage
}

export interface CustomerSegment {
  name: string;
  size: number;
  avgTransactionValue: number;
  retentionRate: number;
  acquisitionChannel: string;
}

export class CMOAgent extends BaseAgent {
  private campaigns: Map<string, MarketingCampaign> = new Map();
  private referralPrograms: Map<string, ReferralProgram> = new Map();
  private growthMetrics: GrowthMetrics;
  private customerSegments: Map<string, CustomerSegment> = new Map();
  private acquisitionByChannel: Map<string, { count: number; cost: number }> = new Map();

  constructor(logger: Logger, config?: Partial<AgentConfig>) {
    super(
      {
        name: 'Bowery King',
        role: 'cmo',
        active: true,
        confidenceThreshold: 0.7,
        ...config,
      },
      logger
    );

    this.growthMetrics = {
      dailyActiveUsers: 0,
      monthlyActiveUsers: 0,
      customerAcquisitionCost: 0,
      lifetimeValue: 0,
      churnRate: 0,
      netRevenueRetention: 100,
      growthRate: 0,
    };
  }

  /**
   * Create marketing campaign
   */
  async createCampaign(campaign: Omit<MarketingCampaign, 'id' | 'spent' | 'metrics'>): Promise<MarketingCampaign> {
    const newCampaign: MarketingCampaign = {
      ...campaign,
      id: `CAMP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      spent: 0,
      metrics: {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
      },
    };

    this.campaigns.set(newCampaign.id, newCampaign);
    this.logger.info(`📢 Bowery King created campaign: ${newCampaign.name} (${newCampaign.type})`);

    return newCampaign;
  }

  /**
   * Update campaign metrics
   */
  updateCampaignMetrics(
    campaignId: string,
    metrics: Partial<MarketingCampaign['metrics']>,
    spent?: number
  ): void {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return;

    campaign.metrics = { ...campaign.metrics, ...metrics };
    if (spent !== undefined) {
      campaign.spent = spent;
    }
    campaign.metrics = this.calculateCampaignROI(campaign);

    this.logger.debug(`📊 Bowery King updated campaign ${campaignId} metrics`);
  }

  /**
   * Calculate campaign ROI
   */
  private calculateCampaignROI(campaign: MarketingCampaign): MarketingCampaign['metrics'] {
    const roi = campaign.spent > 0 
      ? ((campaign.metrics.revenue - campaign.spent) / campaign.spent) * 100
      : 0;

    return {
      ...campaign.metrics,
      roi,
    };
  }

  /**
   * Create referral program
   */
  async createReferralProgram(
    name: string,
    referrerReward: number,
    refereeReward: number
  ): Promise<ReferralProgram> {
    const program: ReferralProgram = {
      id: `REF-${Date.now()}`,
      name,
      referrerReward,
      refereeReward,
      active: true,
      totalReferrals: 0,
      conversionRate: 0,
    };

    this.referralPrograms.set(program.id, program);
    this.logger.info(`🎁 Bowery King created referral program: ${name}`);

    return program;
  }

  /**
   * Process referral
   */
  async processReferral(programId: string, referrerId: string, refereeId: string): Promise<AgentDecision> {
    this.setStatus('analyzing');
    
    const program = this.referralPrograms.get(programId);
    if (!program) {
      return this.makeDecision(
        'strategic_override',
        'rejected',
        'Referral program not found',
        { programId, referrerId, refereeId },
        1.0
      );
    }

    if (!program.active) {
      return this.makeDecision(
        'strategic_override',
        'rejected',
        'Referral program is inactive',
        { programId, referrerId, refereeId },
        1.0
      );
    }

    // Update program stats
    program.totalReferrals++;
    
    // Calculate conversion rate (simplified)
    program.conversionRate = program.totalReferrals > 0 
      ? (program.totalReferrals / (program.totalReferrals + 100)) * 100
      : 0;

    this.logger.info(`🔗 Bowery King processed referral: ${referrerId} -> ${refereeId}`);

    const decision = await this.makeDecision(
      'strategic_override',
      'approved',
      `Referral processed: ${referrerId} earns $${program.referrerReward}, ${refereeId} earns $${program.refereeReward}`,
      { programId, referrerId, refereeId, rewards: { referrer: program.referrerReward, referee: program.refereeReward } },
      0.95
    );

    this.setStatus('idle');
    return decision;
  }

  /**
   * Update growth metrics
   */
  updateGrowthMetrics(metrics: Partial<GrowthMetrics>): void {
    this.growthMetrics = { ...this.growthMetrics, ...metrics };
    this.logger.debug(`📈 Bowery King updated growth metrics`);
  }

  /**
   * Track customer acquisition
   */
  trackAcquisition(channel: string, customerId: string, cost: number): void {
    const existing = this.acquisitionByChannel.get(channel) || { count: 0, cost: 0 };
    existing.count++;
    existing.cost += cost;
    this.acquisitionByChannel.set(channel, existing);

    // Recalculate CAC
    const totalCost = Array.from(this.acquisitionByChannel.values()).reduce((sum, c) => sum + c.cost, 0);
    const totalAcquisitions = Array.from(this.acquisitionByChannel.values()).reduce((sum, c) => sum + c.count, 0);
    this.growthMetrics.customerAcquisitionCost = totalAcquisitions > 0 ? totalCost / totalAcquisitions : 0;

    this.logger.debug(`📥 Bowery King tracked acquisition from ${channel}: ${customerId}`);
  }

  /**
   * Get best performing campaigns
   */
  getTopCampaigns(limit: number = 5): MarketingCampaign[] {
    return Array.from(this.campaigns.values())
      .sort((a, b) => b.metrics.revenue - a.metrics.revenue)
      .slice(0, limit);
  }

  /**
   * Get growth metrics
   */
  getGrowthMetrics(): GrowthMetrics {
    return { ...this.growthMetrics };
  }

  /**
   * Get acquisition by channel
   */
  getAcquisitionByChannel(): Record<string, { count: number; cost: number; cac: number }> {
    const result: Record<string, { count: number; cost: number; cac: number }> = {};
    
    for (const [channel, data] of this.acquisitionByChannel.entries()) {
      result[channel] = {
        count: data.count,
        cost: data.cost,
        cac: data.count > 0 ? data.cost / data.count : 0,
      };
    }

    return result;
  }

  /**
   * Generate marketing report
   */
  generateMarketingReport(): {
    campaigns: {
      active: number;
      total: number;
      totalRevenue: number;
      totalSpent: number;
      overallROI: number;
    };
    referrals: {
      activePrograms: number;
      totalReferrals: number;
      avgConversionRate: number;
    };
    growth: GrowthMetrics;
    acquisition: Record<string, { count: number; cost: number; cac: number }>;
    recommendations: string[];
  } {
    const allCampaigns = Array.from(this.campaigns.values());
    const activeCampaigns = allCampaigns.filter(c => c.status === 'active');
    const totalRevenue = allCampaigns.reduce((sum, c) => sum + c.metrics.revenue, 0);
    const totalSpent = allCampaigns.reduce((sum, c) => sum + c.spent, 0);

    const allPrograms = Array.from(this.referralPrograms.values());
    const activePrograms = allPrograms.filter(p => p.active);
    const totalReferrals = allPrograms.reduce((sum, p) => sum + p.totalReferrals, 0);
    const avgConversionRate = allPrograms.length > 0
      ? allPrograms.reduce((sum, p) => sum + p.conversionRate, 0) / allPrograms.length
      : 0;

    // Generate recommendations
    const recommendations: string[] = [];

    if (this.growthMetrics.customerAcquisitionCost > this.growthMetrics.lifetimeValue * 0.3) {
      recommendations.push('CAC is high relative to LTV - optimize acquisition channels');
    }

    if (this.growthMetrics.churnRate > 5) {
      recommendations.push('Churn rate above 5% - focus on retention strategies');
    }

    const bestChannel = Object.entries(this.getAcquisitionByChannel())
      .sort((a, b) => a[1].cac - b[1].cac)[0];
    if (bestChannel) {
      recommendations.push(`Double down on ${bestChannel[0]} - lowest CAC at $${bestChannel[1].cac.toFixed(2)}`);
    }

    return {
      campaigns: {
        active: activeCampaigns.length,
        total: allCampaigns.length,
        totalRevenue,
        totalSpent,
        overallROI: totalSpent > 0 ? ((totalRevenue - totalSpent) / totalSpent) * 100 : 0,
      },
      referrals: {
        activePrograms: activePrograms.length,
        totalReferrals,
        avgConversionRate,
      },
      growth: this.growthMetrics,
      acquisition: this.getAcquisitionByChannel(),
      recommendations,
    };
  }

  /**
   * Approve marketing spend
   */
  async approveMarketingSpend(campaignId: string, amount: number): Promise<AgentDecision> {
    this.setStatus('analyzing');
    
    const campaign = this.campaigns.get(campaignId);
    
    let outcome: 'approved' | 'rejected' | 'escalated';
    let confidence: number;
    let reason: string;

    if (!campaign) {
      outcome = 'rejected';
      confidence = 1.0;
      reason = 'Campaign not found';
    } else if (amount > 50000) {
      outcome = 'escalated';
      confidence = 0.6;
      reason = 'Large marketing spend requires executive approval';
    } else if (campaign.spent + amount > campaign.budget * 1.2) {
      outcome = 'escalated';
      confidence = 0.7;
      reason = 'Spend exceeds budget by >20%';
    } else if (campaign.metrics.roi < 0 && campaign.spent > campaign.budget * 0.5) {
      outcome = 'rejected';
      confidence = 0.8;
      reason = 'Campaign showing negative ROI - reallocate budget';
    } else {
      outcome = 'approved';
      confidence = 0.85;
      reason = 'Marketing spend within approved parameters';
    }

    this.setStatus(outcome === 'approved' ? 'approving' : outcome === 'rejected' ? 'rejecting' : 'escalating');

    const decision = await this.makeDecision(
      'strategic_override',
      outcome,
      reason,
      { campaignId, amount, campaign },
      confidence
    );

    this.setStatus('idle');
    return decision;
  }

  /**
   * Process generic context (required by base class)
   */
  async process(context: Record<string, any>): Promise<AgentDecision> {
    if (context.type === 'marketing_spend') {
      return this.approveMarketingSpend(context.campaignId, context.amount);
    }

    if (context.type === 'referral') {
      return this.processReferral(context.programId, context.referrerId, context.refereeId);
    }

    return this.makeDecision(
      'strategic_override',
      'escalated',
      'Unknown marketing request type - requires clarification',
      context,
      0.5
    );
  }
}
