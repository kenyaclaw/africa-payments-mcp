/**
 * User Preferences Storage
 * Remember last used provider and other preferences
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface UserPreferences {
  lastUsedProvider?: string;
  lastUsedCountry?: string;
  lastUsedCurrency?: string;
  recentRecipients: RecentRecipient[];
  providerPreferences: Record<string, ProviderPreference>;
  updatedAt: string;
}

export interface RecentRecipient {
  phone?: string;
  email?: string;
  name?: string;
  country?: string;
  provider?: string;
  usedAt: string;
}

export interface ProviderPreference {
  useCount: number;
  averageAmount: number;
  lastUsedAt: string;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  recentRecipients: [],
  providerPreferences: {},
  updatedAt: new Date().toISOString(),
};

export class PreferencesManager {
  private configDir: string;
  private preferencesFile: string;
  private preferences: UserPreferences;
  private loaded: boolean = false;

  constructor(configDir?: string) {
    this.configDir = configDir || path.join(os.homedir(), '.africa-payments-mcp');
    this.preferencesFile = path.join(this.configDir, 'preferences.json');
    this.preferences = { ...DEFAULT_PREFERENCES };
  }

  /**
   * Load preferences from disk
   */
  async load(): Promise<UserPreferences> {
    try {
      await fs.access(this.preferencesFile);
      const content = await fs.readFile(this.preferencesFile, 'utf-8');
      this.preferences = {
        ...DEFAULT_PREFERENCES,
        ...JSON.parse(content),
      };
      this.loaded = true;
    } catch (error) {
      // File doesn't exist, use defaults
      this.preferences = { ...DEFAULT_PREFERENCES };
      this.loaded = true;
    }
    return this.preferences;
  }

  /**
   * Save preferences to disk
   */
  async save(): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(this.configDir, { recursive: true });
      
      this.preferences.updatedAt = new Date().toISOString();
      await fs.writeFile(
        this.preferencesFile,
        JSON.stringify(this.preferences, null, 2)
      );
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  }

  /**
   * Get the last used provider
   */
  getLastUsedProvider(): string | undefined {
    return this.preferences.lastUsedProvider;
  }

  /**
   * Set the last used provider
   */
  async setLastUsedProvider(provider: string): Promise<void> {
    this.preferences.lastUsedProvider = provider;
    
    // Update provider preferences
    if (!this.preferences.providerPreferences[provider]) {
      this.preferences.providerPreferences[provider] = {
        useCount: 0,
        averageAmount: 0,
        lastUsedAt: new Date().toISOString(),
      };
    }
    
    const pref = this.preferences.providerPreferences[provider];
    pref.useCount++;
    pref.lastUsedAt = new Date().toISOString();
    
    await this.save();
  }

  /**
   * Get the most frequently used provider
   */
  getMostUsedProvider(): string | undefined {
    let maxCount = 0;
    let mostUsed: string | undefined;
    
    for (const [provider, pref] of Object.entries(this.preferences.providerPreferences)) {
      if (pref.useCount > maxCount) {
        maxCount = pref.useCount;
        mostUsed = provider;
      }
    }
    
    return mostUsed;
  }

  /**
   * Add a recent recipient
   */
  async addRecentRecipient(recipient: Omit<RecentRecipient, 'usedAt'>): Promise<void> {
    const entry: RecentRecipient = {
      ...recipient,
      usedAt: new Date().toISOString(),
    };
    
    // Remove existing entry with same phone/email
    this.preferences.recentRecipients = this.preferences.recentRecipients.filter(
      r => !((entry.phone && r.phone === entry.phone) || (entry.email && r.email === entry.email))
    );
    
    // Add to beginning
    this.preferences.recentRecipients.unshift(entry);
    
    // Keep only last 10
    this.preferences.recentRecipients = this.preferences.recentRecipients.slice(0, 10);
    
    await this.save();
  }

  /**
   * Get recent recipients
   */
  getRecentRecipients(limit: number = 5): RecentRecipient[] {
    return this.preferences.recentRecipients.slice(0, limit);
  }

  /**
   * Get suggested provider based on various factors
   */
  getSuggestedProvider(
    country?: string,
    availableProviders: string[] = []
  ): { provider: string; reason: string } | null {
    // 1. Check if we have a last used provider that's available
    if (this.preferences.lastUsedProvider) {
      if (availableProviders.length === 0 || availableProviders.includes(this.preferences.lastUsedProvider)) {
        return {
          provider: this.preferences.lastUsedProvider,
          reason: 'Last used provider',
        };
      }
    }
    
    // 2. Check most used provider that's available
    const mostUsed = this.getMostUsedProvider();
    if (mostUsed && (availableProviders.length === 0 || availableProviders.includes(mostUsed))) {
      return {
        provider: mostUsed,
        reason: 'Most frequently used provider',
      };
    }
    
    // 3. Check if we have a provider preference for this country
    if (country) {
      const countryProviders = this.preferences.recentRecipients
        .filter(r => r.country === country && r.provider)
        .map(r => r.provider!);
      
      if (countryProviders.length > 0) {
        // Return the most recently used provider for this country
        const provider = countryProviders[0];
        if (availableProviders.length === 0 || availableProviders.includes(provider)) {
          return {
            provider,
            reason: `Recently used in ${country}`,
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Update provider stats with transaction amount
   */
  async updateProviderStats(provider: string, amount: number): Promise<void> {
    const pref = this.preferences.providerPreferences[provider];
    if (pref) {
      // Update running average
      pref.averageAmount = (pref.averageAmount * (pref.useCount - 1) + amount) / pref.useCount;
      await this.save();
    }
  }

  /**
   * Get full preferences object
   */
  getPreferences(): UserPreferences {
    return { ...this.preferences };
  }

  /**
   * Clear all preferences
   */
  async clear(): Promise<void> {
    this.preferences = { ...DEFAULT_PREFERENCES };
    await this.save();
  }

  /**
   * Format preferences for display
   */
  formatPreferences(): string {
    let output = '\n👤 User Preferences\n';
    output += '═'.repeat(40) + '\n\n';
    
    if (this.preferences.lastUsedProvider) {
      output += `🔄 Last Used Provider: ${this.preferences.lastUsedProvider}\n`;
    }
    
    if (Object.keys(this.preferences.providerPreferences).length > 0) {
      output += '\n📊 Provider Usage:\n';
      for (const [provider, pref] of Object.entries(this.preferences.providerPreferences)) {
        output += `   • ${provider}: ${pref.useCount} transactions`;
        if (pref.averageAmount > 0) {
          output += ` (avg: ${pref.averageAmount.toFixed(2)})`;
        }
        output += '\n';
      }
    }
    
    if (this.preferences.recentRecipients.length > 0) {
      output += '\n📱 Recent Recipients:\n';
      for (const recipient of this.preferences.recentRecipients.slice(0, 5)) {
        const identifier = recipient.name || recipient.phone || recipient.email || 'Unknown';
        output += `   • ${identifier}`;
        if (recipient.provider) {
          output += ` (${recipient.provider})`;
        }
        output += '\n';
      }
    }
    
    return output;
  }
}

// Singleton instance
let globalPreferencesManager: PreferencesManager | null = null;

export function getPreferencesManager(configDir?: string): PreferencesManager {
  if (!globalPreferencesManager) {
    globalPreferencesManager = new PreferencesManager(configDir);
  }
  return globalPreferencesManager;
}

export function resetPreferencesManager(): void {
  globalPreferencesManager = null;
}
