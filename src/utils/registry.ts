/**
 * Provider Registry - Manages payment provider instances
 */

import { PaymentProvider } from '../types/index.js';
import { Logger } from './logger.js';

export class ProviderRegistry {
  private providers = new Map<string, PaymentProvider>();

  constructor(private logger: Logger) {}

  register(name: string, provider: PaymentProvider): void {
    this.providers.set(name, provider);
    this.logger.info(`Registered provider: ${name}`);
  }

  getProvider(name: string): PaymentProvider | undefined {
    return this.providers.get(name);
  }

  getAllProviders(): Map<string, PaymentProvider> {
    return this.providers;
  }

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  getProviderCount(): number {
    return this.providers.size;
  }

  async initializeAll(): Promise<void> {
    for (const [name, provider] of this.providers) {
      try {
        this.logger.info(`Initializing provider: ${name}`);
        await provider.initialize({});
        this.logger.info(`✅ Provider ${name} initialized`);
      } catch (error) {
        this.logger.error(`Failed to initialize provider ${name}: ${error}`);
        // Remove failed provider
        this.providers.delete(name);
      }
    }
  }
}
