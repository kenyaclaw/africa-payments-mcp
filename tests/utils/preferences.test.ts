/**
 * User Preferences Manager Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { PreferencesManager, getPreferencesManager, resetPreferencesManager } from '../../src/utils/preferences.js';

describe('PreferencesManager', () => {
  let manager: PreferencesManager;
  let tempDir: string;

  beforeEach(async () => {
    // Create a temp directory for tests
    tempDir = path.join(os.tmpdir(), `africa-payments-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    resetPreferencesManager();
    manager = new PreferencesManager(tempDir);
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
    resetPreferencesManager();
  });

  describe('load and save', () => {
    it('should load default preferences when file does not exist', async () => {
      const prefs = await manager.load();
      
      expect(prefs.recentRecipients).toEqual([]);
      expect(prefs.providerPreferences).toEqual({});
      expect(prefs.lastUsedProvider).toBeUndefined();
    });

    it('should save and load preferences', async () => {
      await manager.setLastUsedProvider('mpesa');
      
      // Create a new manager to test loading
      const manager2 = new PreferencesManager(tempDir);
      const prefs = await manager2.load();
      
      expect(prefs.lastUsedProvider).toBe('mpesa');
    });
  });

  describe('last used provider', () => {
    it('should get and set last used provider', async () => {
      expect(manager.getLastUsedProvider()).toBeUndefined();
      
      await manager.setLastUsedProvider('mpesa');
      
      expect(manager.getLastUsedProvider()).toBe('mpesa');
    });

    it('should track provider usage count', async () => {
      await manager.setLastUsedProvider('mpesa');
      await manager.setLastUsedProvider('mpesa');
      await manager.setLastUsedProvider('paystack');
      
      const prefs = manager.getPreferences();
      expect(prefs.providerPreferences.mpesa.useCount).toBe(2);
      expect(prefs.providerPreferences.paystack.useCount).toBe(1);
    });
  });

  describe('most used provider', () => {
    it('should return undefined when no providers used', () => {
      expect(manager.getMostUsedProvider()).toBeUndefined();
    });

    it('should return most frequently used provider', async () => {
      await manager.setLastUsedProvider('mpesa');
      await manager.setLastUsedProvider('paystack');
      await manager.setLastUsedProvider('mpesa');
      await manager.setLastUsedProvider('mpesa');
      
      expect(manager.getMostUsedProvider()).toBe('mpesa');
    });
  });

  describe('recent recipients', () => {
    it('should add recent recipient', async () => {
      await manager.addRecentRecipient({
        phone: '+254712345678',
        name: 'John Doe',
        country: 'KE',
        provider: 'mpesa',
      });
      
      const recipients = manager.getRecentRecipients();
      expect(recipients).toHaveLength(1);
      expect(recipients[0].phone).toBe('+254712345678');
      expect(recipients[0].name).toBe('John Doe');
    });

    it('should limit to 10 recent recipients', async () => {
      for (let i = 0; i < 15; i++) {
        await manager.addRecentRecipient({
          phone: `+2547123456${i.toString().padStart(2, '0')}`,
          name: `Person ${i}`,
        });
      }
      
      const recipients = manager.getRecentRecipients(20);
      expect(recipients).toHaveLength(10);
    });

    it('should move existing recipient to top', async () => {
      await manager.addRecentRecipient({ phone: '+254711111111', name: 'First' });
      await manager.addRecentRecipient({ phone: '+254722222222', name: 'Second' });
      await manager.addRecentRecipient({ phone: '+254711111111', name: 'First Again' });
      
      const recipients = manager.getRecentRecipients();
      expect(recipients[0].phone).toBe('+254711111111');
      expect(recipients).toHaveLength(2);
    });

    it('should respect the limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await manager.addRecentRecipient({
          phone: `+2547123456${i}`,
          name: `Person ${i}`,
        });
      }
      
      expect(manager.getRecentRecipients(3)).toHaveLength(3);
      expect(manager.getRecentRecipients(10)).toHaveLength(5);
    });
  });

  describe('suggested provider', () => {
    it('should suggest last used provider', async () => {
      await manager.setLastUsedProvider('mpesa');
      
      const suggestion = manager.getSuggestedProvider();
      expect(suggestion?.provider).toBe('mpesa');
      expect(suggestion?.reason).toBe('Last used provider');
    });

    it('should suggest most used when no last used', async () => {
      await manager.setLastUsedProvider('paystack');
      await manager.setLastUsedProvider('mpesa');
      await manager.setLastUsedProvider('mpesa');
      
      // Clear last used by creating new manager and manipulating directly
      const prefs = manager.getPreferences();
      delete prefs.lastUsedProvider;
      
      const suggestion = manager.getSuggestedProvider();
      expect(suggestion?.provider).toBe('mpesa');
      expect(suggestion?.reason).toBe('Most frequently used provider');
    });

    it('should suggest provider based on country', async () => {
      await manager.addRecentRecipient({
        phone: '+2348012345678',
        country: 'NG',
        provider: 'paystack',
      });
      
      const suggestion = manager.getSuggestedProvider('NG');
      expect(suggestion?.provider).toBe('paystack');
      expect(suggestion?.reason).toContain('NG');
    });

    it('should return null when no suggestions available', () => {
      const suggestion = manager.getSuggestedProvider();
      expect(suggestion).toBeNull();
    });

    it('should filter by available providers', async () => {
      await manager.setLastUsedProvider('mpesa');
      
      const suggestion = manager.getSuggestedProvider('KE', ['paystack']);
      // mpesa is not in available providers, so should return null
      expect(suggestion).toBeNull();
    });
  });

  describe('update provider stats', () => {
    it('should update average amount', async () => {
      await manager.setLastUsedProvider('mpesa');
      await manager.updateProviderStats('mpesa', 1000);
      await manager.updateProviderStats('mpesa', 2000);
      
      const prefs = manager.getPreferences();
      expect(prefs.providerPreferences.mpesa.averageAmount).toBe(1500);
    });
  });

  describe('format preferences', () => {
    it('should format empty preferences', () => {
      const text = manager.formatPreferences();
      expect(text).toContain('User Preferences');
    });

    it('should format preferences with data', async () => {
      await manager.setLastUsedProvider('mpesa');
      await manager.addRecentRecipient({
        phone: '+254712345678',
        name: 'John',
        provider: 'mpesa',
      });
      
      const text = manager.formatPreferences();
      expect(text).toContain('mpesa');
      expect(text).toContain('John');
      expect(text).toContain('transactions');
    });
  });

  describe('clear preferences', () => {
    it('should clear all preferences', async () => {
      await manager.setLastUsedProvider('mpesa');
      await manager.addRecentRecipient({ phone: '+254712345678' });
      
      await manager.clear();
      
      expect(manager.getLastUsedProvider()).toBeUndefined();
      expect(manager.getRecentRecipients()).toHaveLength(0);
    });
  });

  describe('singleton helpers', () => {
    it('getPreferencesManager should return singleton', () => {
      const m1 = getPreferencesManager();
      const m2 = getPreferencesManager();
      expect(m1).toBe(m2);
    });

    it('resetPreferencesManager should clear singleton', () => {
      const m1 = getPreferencesManager();
      resetPreferencesManager();
      const m2 = getPreferencesManager();
      expect(m1).not.toBe(m2);
    });
  });
});
