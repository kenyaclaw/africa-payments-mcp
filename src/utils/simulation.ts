/**
 * Transaction Simulation Mode
 * Simulate transactions without making real API calls
 */

import { Logger } from './logger.js';
import { 
  Transaction, 
  TransactionStatus, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams,
  Money,
  Customer,
  PaymentError,
  ErrorCodes
} from '../types/index.js';

export interface SimulationConfig {
  enabled: boolean;
  delayMs: number;
  successRate: number;
  failureMode?: 'random' | 'never' | 'always';
}

export class SimulationMode {
  private config: SimulationConfig;
  private logger: Logger;
  private simulatedTransactions: Map<string, Transaction> = new Map();

  constructor(config: Partial<SimulationConfig> = {}, logger: Logger) {
    this.config = {
      enabled: config.enabled ?? this.isEnabledViaEnv(),
      delayMs: config.delayMs ?? 500,
      successRate: config.successRate ?? 0.95,
      failureMode: config.failureMode ?? 'random',
    };
    this.logger = logger;

    if (this.config.enabled) {
      this.logger.info('🔮 Simulation mode ENABLED - No real API calls will be made');
    }
  }

  private isEnabledViaEnv(): boolean {
    return process.env.SIMULATION_MODE === 'true' || process.env.SIMULATION_MODE === '1';
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Log what would happen in a real transaction
   */
  logSimulation(operation: string, params: any): void {
    this.logger.info(`🔮 [SIMULATION] ${operation}`);
    this.logger.info(`   Would send: ${JSON.stringify(params, null, 2)}`);
  }

  /**
   * Format a simulation message for user display
   */
  formatSimulationMessage(operation: string, details: Record<string, any>): string {
    let message = `\n🔮 SIMULATION MODE - No real transaction occurred\n`;
    message += `═`.repeat(50) + '\n\n';
    message += `Operation: ${operation}\n\n`;
    
    for (const [key, value] of Object.entries(details)) {
      if (value !== undefined) {
        message += `  ${key}: ${value}\n`;
      }
    }
    
    message += `\n✅ This was a simulated response.\n`;
    message += `   Set SIMULATION_MODE=false to perform real transactions.\n`;
    
    return message;
  }

  /**
   * Simulate a send money transaction
   */
  async simulateSendMoney(provider: string, params: SendMoneyParams): Promise<Transaction> {
    const { recipient, amount, description } = params;
    
    this.logSimulation('sendMoney', {
      provider,
      to: recipient.phone?.formatted || recipient.name || 'unknown',
      amount: `${amount.amount} ${amount.currency}`,
      description,
    });

    // Simulate network delay
    await this.delay();

    // Generate simulated transaction
    const transaction: Transaction = {
      id: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      providerTransactionId: `SIM_${provider.toUpperCase()}_${Date.now()}`,
      provider,
      status: this.determineStatus(),
      amount,
      customer: {
        name: recipient.name,
        phone: recipient.phone,
      },
      description: description || `Simulated payment to ${recipient.name || 'recipient'}`,
      metadata: {
        simulated: true,
        simulationTimestamp: new Date().toISOString(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (transaction.status === 'completed') {
      transaction.completedAt = new Date();
    }

    this.simulatedTransactions.set(transaction.id, transaction);
    
    this.logger.info(`🔮 [SIMULATION] Transaction ${transaction.id} created with status: ${transaction.status}`);
    
    return transaction;
  }

  /**
   * Simulate a payment request
   */
  async simulateRequestPayment(provider: string, params: RequestPaymentParams): Promise<Transaction> {
    const { customer, amount, description, expiryMinutes } = params;
    
    this.logSimulation('requestPayment', {
      provider,
      from: customer.phone?.formatted || customer.email || 'unknown',
      amount: `${amount.amount} ${amount.currency}`,
      description,
      expiresIn: `${expiryMinutes || 60} minutes`,
    });

    await this.delay();

    const transaction: Transaction = {
      id: `sim_req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      providerTransactionId: `SIM_REQ_${provider.toUpperCase()}_${Date.now()}`,
      provider,
      status: 'pending',
      amount,
      customer,
      description: description || 'Simulated payment request',
      metadata: {
        simulated: true,
        simulationTimestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (expiryMinutes || 60) * 60 * 1000).toISOString(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.simulatedTransactions.set(transaction.id, transaction);
    
    this.logger.info(`🔮 [SIMULATION] Payment request ${transaction.id} created`);
    
    return transaction;
  }

  /**
   * Simulate transaction verification
   */
  async simulateVerifyTransaction(provider: string, transactionId: string): Promise<Transaction> {
    this.logSimulation('verifyTransaction', { provider, transactionId });

    await this.delay();

    // Check if we have this transaction stored
    const existing = this.simulatedTransactions.get(transactionId);
    if (existing) {
      return existing;
    }

    // Create a mock verified transaction
    return {
      id: transactionId,
      providerTransactionId: `SIM_${provider.toUpperCase()}_12345`,
      provider,
      status: 'completed',
      amount: { amount: 0, currency: 'XXX' },
      customer: {},
      description: 'Simulated transaction verification',
      metadata: { simulated: true },
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: new Date(),
    };
  }

  /**
   * Simulate refund
   */
  async simulateRefund(provider: string, params: RefundParams): Promise<Transaction> {
    this.logSimulation('refund', {
      provider,
      originalTransactionId: params.originalTransactionId,
      amount: params.amount ? `${params.amount.amount} ${params.amount.currency}` : 'full amount',
      reason: params.reason,
    });

    await this.delay();

    const transaction: Transaction = {
      id: `sim_refund_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      providerTransactionId: `SIM_REFUND_${provider.toUpperCase()}_${Date.now()}`,
      provider,
      status: 'completed',
      amount: params.amount || { amount: 0, currency: 'XXX' },
      customer: {},
      description: `Simulated refund for ${params.originalTransactionId}`,
      metadata: {
        simulated: true,
        originalTransactionId: params.originalTransactionId,
        reason: params.reason,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: new Date(),
      refundId: `sim_refund_${Date.now()}`,
    };

    this.simulatedTransactions.set(transaction.id, transaction);
    
    this.logger.info(`🔮 [SIMULATION] Refund ${transaction.id} processed`);
    
    return transaction;
  }

  /**
   * Simulate getting balance
   */
  async simulateGetBalance(provider: string): Promise<Money> {
    this.logSimulation('getBalance', { provider });
    
    await this.delay();

    // Return mock balance
    const mockBalances: Record<string, Money> = {
      mpesa: { amount: 50000, currency: 'KES' },
      paystack: { amount: 100000, currency: 'NGN' },
      intasend: { amount: 25000, currency: 'KES' },
      mtn_momo: { amount: 300000, currency: 'UGX' },
      airtel_money: { amount: 40000, currency: 'KES' },
    };

    return mockBalances[provider] || { amount: 0, currency: 'XXX' };
  }

  /**
   * Get all simulated transactions
   */
  getSimulatedTransactions(): Transaction[] {
    return Array.from(this.simulatedTransactions.values());
  }

  /**
   * Clear simulated transactions
   */
  clearTransactions(): void {
    this.simulatedTransactions.clear();
    this.logger.info('🔮 [SIMULATION] All simulated transactions cleared');
  }

  private async delay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, this.config.delayMs));
  }

  private determineStatus(): TransactionStatus {
    if (this.config.failureMode === 'never') {
      return 'completed';
    }
    if (this.config.failureMode === 'always') {
      return 'failed';
    }
    
    // Random mode
    const random = Math.random();
    if (random < this.config.successRate) {
      return 'completed';
    } else if (random < this.config.successRate + 0.03) {
      return 'failed';
    } else {
      return 'pending';
    }
  }
}

// Singleton instance
let globalSimulationMode: SimulationMode | null = null;

export function getSimulationMode(logger: Logger): SimulationMode {
  if (!globalSimulationMode) {
    globalSimulationMode = new SimulationMode({}, logger);
  }
  return globalSimulationMode;
}

export function setSimulationMode(config: SimulationConfig, logger: Logger): void {
  globalSimulationMode = new SimulationMode(config, logger);
}

export function resetSimulationMode(): void {
  globalSimulationMode = null;
}
