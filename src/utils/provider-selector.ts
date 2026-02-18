/**
 * Smart Provider Selector
 * Automatically selects the best provider based on amount, destination, and criteria
 */

import { ProviderRegistry } from './registry.js';
import { Logger } from './logger.js';
import { PaymentProvider, Money } from '../types/index.js';

export interface ProviderScore {
  provider: string;
  score: number;
  reasons: string[];
  fees: {
    fixed: number;
    percentage: number;
    estimatedTotal: number;
  };
  speed: 'instant' | 'fast' | 'standard' | 'slow';
  reliability: number; // 0-100
}

export interface SelectionCriteria {
  prioritize?: 'fees' | 'speed' | 'reliability' | 'balanced';
  maxFees?: number;
  requireInstant?: boolean;
}

// Provider fee structures (estimated, can be overridden by config)
const PROVIDER_FEES: Record<string, { fixed: number; percentage: number; currency: string }> = {
  mpesa: { fixed: 0, percentage: 1.0, currency: 'KES' }, // ~1% for M-Pesa
  paystack: { fixed: 0, percentage: 1.5, currency: 'NGN' }, // 1.5% for Paystack
  intasend: { fixed: 0, percentage: 1.0, currency: 'KES' }, // ~1% for IntaSend
  mtn_momo: { fixed: 0, percentage: 1.0, currency: 'UGX' }, // ~1% for MTN MoMo
  airtel_money: { fixed: 0, percentage: 1.0, currency: 'KES' }, // ~1% for Airtel Money
  flutterwave: { fixed: 0, percentage: 1.4, currency: 'NGN' }, // 1.4% for Flutterwave
};

// Provider speed ratings
const PROVIDER_SPEED: Record<string, 'instant' | 'fast' | 'standard' | 'slow'> = {
  mpesa: 'instant',      // M-Pesa is typically instant
  paystack: 'fast',      // Paystack is fast but not always instant
  intasend: 'fast',      // IntaSend is fast
  mtn_momo: 'instant',   // MTN MoMo is typically instant
  airtel_money: 'instant', // Airtel Money is typically instant
  flutterwave: 'fast',   // Flutterwave is fast
};

// Provider reliability scores (based on general uptime/reputation)
const PROVIDER_RELIABILITY: Record<string, number> = {
  mpesa: 98,        // Very reliable
  paystack: 97,     // Very reliable
  intasend: 95,     // Reliable
  mtn_momo: 94,     // Reliable but occasional issues
  airtel_money: 92, // Generally reliable
  flutterwave: 96,  // Very reliable
};

// Speed weights for scoring
const SPEED_WEIGHTS: Record<string, number> = {
  instant: 1.0,
  fast: 0.8,
  standard: 0.5,
  slow: 0.2,
};

export class ProviderSelector {
  constructor(
    private registry: ProviderRegistry,
    private logger: Logger
  ) {}

  /**
   * Select the best provider for a transaction
   */
  async selectBestProvider(
    amount: Money,
    destinationCountry: string,
    criteria: SelectionCriteria = {}
  ): Promise<{ provider: string; reason: string; scores: ProviderScore[] }> {
    this.logger.info(`Selecting best provider for ${amount.amount} ${amount.currency} to ${destinationCountry}`);

    const prioritize = criteria.prioritize || 'balanced';
    const allProviders = this.registry.getAllProviders();
    
    if (allProviders.size === 0) {
      throw new Error('No providers available');
    }

    // Score all available providers
    const scores: ProviderScore[] = [];
    
    for (const [name, provider] of allProviders) {
      const score = await this.scoreProvider(name, provider, amount, destinationCountry, prioritize);
      scores.push(score);
    }

    // Sort by score (highest first)
    scores.sort((a, b) => b.score - a.score);

    // Log the selection process
    this.logSelection(scores, prioritize);

    const bestProvider = scores[0];
    const reason = this.formatSelectionReason(bestProvider, prioritize);

    this.logger.info(`Selected provider: ${bestProvider.provider} - ${reason}`);

    return {
      provider: bestProvider.provider,
      reason,
      scores,
    };
  }

  /**
   * Score a single provider
   */
  private async scoreProvider(
    name: string,
    provider: PaymentProvider,
    amount: Money,
    destinationCountry: string,
    prioritize: string
  ): Promise<ProviderScore> {
    const reasons: string[] = [];
    let score = 0;

    // Check if provider supports the destination country
    const supportsCountry = provider.countries.includes(destinationCountry);
    if (!supportsCountry) {
      reasons.push(`Does not support ${destinationCountry}`);
      // Heavy penalty but not zero in case no provider supports it
      score -= 50;
    } else {
      reasons.push(`Supports ${destinationCountry}`);
      score += 20;
    }

    // Check if provider supports the currency
    const supportsCurrency = provider.currencies.includes(amount.currency);
    if (supportsCurrency) {
      reasons.push(`Native ${amount.currency} support`);
      score += 15;
    } else {
      reasons.push(`Currency conversion needed`);
      score -= 10;
    }

    // Calculate fees
    const feeStructure = PROVIDER_FEES[name] || { fixed: 0, percentage: 2, currency: amount.currency };
    const estimatedFees = feeStructure.fixed + (amount.amount * (feeStructure.percentage / 100));
    const feeScore = Math.max(0, 100 - (estimatedFees / amount.amount * 100)); // Lower fees = higher score

    // Get speed and reliability
    const speed = PROVIDER_SPEED[name] || 'standard';
    const speedScore = SPEED_WEIGHTS[speed] * 100;
    const reliability = PROVIDER_RELIABILITY[name] || 80;

    // Calculate weighted score based on priority
    switch (prioritize) {
      case 'fees':
        score += feeScore * 0.6 + speedScore * 0.2 + reliability * 0.2;
        break;
      case 'speed':
        score += speedScore * 0.6 + feeScore * 0.2 + reliability * 0.2;
        break;
      case 'reliability':
        score += reliability * 0.6 + feeScore * 0.2 + speedScore * 0.2;
        break;
      case 'balanced':
      default:
        score += feeScore * 0.4 + speedScore * 0.3 + reliability * 0.3;
        break;
    }

    // Additional points for instant speed if that's important
    if (prioritize === 'speed' && speed === 'instant') {
      score += 10;
      reasons.push('Instant transfer available');
    }

    return {
      provider: name,
      score: Math.round(score),
      reasons,
      fees: {
        fixed: feeStructure.fixed,
        percentage: feeStructure.percentage,
        estimatedTotal: estimatedFees,
      },
      speed,
      reliability,
    };
  }

  /**
   * Log the selection process
   */
  private logSelection(scores: ProviderScore[], prioritize: string): void {
    this.logger.info(`Provider selection (prioritizing: ${prioritize}):`);
    
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i];
      const indicator = i === 0 ? '✓' : ' ';
      this.logger.info(
        `${indicator} ${s.provider}: score=${s.score}, fees=${s.fees.percentage}%, ` +
        `speed=${s.speed}, reliability=${s.reliability}%`
      );
    }
  }

  /**
   * Format the selection reason for display
   */
  private formatSelectionReason(score: ProviderScore, prioritize: string): string {
    const parts: string[] = [];

    switch (prioritize) {
      case 'fees':
        parts.push(`Lowest fees (${score.fees.percentage}%)`);
        break;
      case 'speed':
        parts.push(`Fastest option (${score.speed})`);
        break;
      case 'reliability':
        parts.push(`Most reliable (${score.reliability}% uptime)`);
        break;
      case 'balanced':
      default:
        parts.push(`Best overall value`);
        break;
    }

    if (score.speed === 'instant') {
      parts.push('instant transfer');
    }

    if (score.reasons.length > 0) {
      const keyReasons = score.reasons.filter(r => !r.startsWith('Does not'));
      if (keyReasons.length > 0) {
        parts.push(keyReasons[0].toLowerCase());
      }
    }

    return parts.join(', ');
  }

  /**
   * Get provider comparison for a transaction
   */
  async compareProviders(
    amount: Money,
    destinationCountry: string
  ): Promise<ProviderScore[]> {
    const allProviders = this.registry.getAllProviders();
    const scores: ProviderScore[] = [];

    for (const [name, provider] of allProviders) {
      const score = await this.scoreProvider(name, provider, amount, destinationCountry, 'balanced');
      scores.push(score);
    }

    // Sort by score (highest first)
    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Format provider comparison for display
   */
  formatComparison(scores: ProviderScore[]): string {
    let output = '\n📊 Provider Comparison\n';
    output += '═'.repeat(70) + '\n\n';

    for (let i = 0; i < scores.length; i++) {
      const s = scores[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
      
      output += `${medal} ${s.provider.toUpperCase()}\n`;
      output += `   Score: ${s.score}/100\n`;
      output += `   💰 Fees: ${s.fees.percentage}% (~${s.fees.estimatedTotal.toFixed(2)})\n`;
      output += `   ⚡ Speed: ${s.speed}\n`;
      output += `   ✅ Reliability: ${s.reliability}%\n`;
      
      if (s.reasons.length > 0) {
        const goodReasons = s.reasons.filter(r => !r.startsWith('Does not'));
        if (goodReasons.length > 0) {
          output += `   💡 ${goodReasons.join(', ')}\n`;
        }
      }
      
      output += '\n';
    }

    return output;
  }
}

// Export singleton helper
export function createProviderSelector(registry: ProviderRegistry, logger: Logger): ProviderSelector {
  return new ProviderSelector(registry, logger);
}
