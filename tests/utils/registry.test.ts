/**
 * Provider Registry Tests
 * 
 * Test suite for the ProviderRegistry utility.
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { ProviderRegistry } from '../../src/utils/registry.js';
import { Logger } from '../../src/utils/logger.js';
import { MpesaAdapter } from '../../src/adapters/mpesa/index.js';
import { PaystackAdapter } from '../../src/adapters/paystack/index.js';
import { MpesaConfig, PaystackConfig } from '../../src/types/index.js';

const mockLogger = new Logger('error');

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry(mockLogger);
  });

  describe('register', () => {
    it('should register a provider', () => {
      const mpesaConfig: MpesaConfig = {
        enabled: true,
        environment: 'sandbox',
        consumerKey: 'test',
        consumerSecret: 'test',
        passkey: 'test',
        shortCode: '123456',
      };

      const adapter = new MpesaAdapter(mpesaConfig);
      registry.register('mpesa', adapter);

      expect(registry.getProviderCount()).toBe(1);
      expect(registry.getProviderNames()).toContain('mpesa');
    });

    it('should register multiple providers', () => {
      const mpesaAdapter = new MpesaAdapter({
        enabled: true,
        environment: 'sandbox',
        consumerKey: 'test',
        consumerSecret: 'test',
        passkey: 'test',
        shortCode: '123456',
      });

      const paystackAdapter = new PaystackAdapter({
        enabled: true,
        environment: 'sandbox',
        secretKey: 'sk_test_123',
      });

      registry.register('mpesa', mpesaAdapter);
      registry.register('paystack', paystackAdapter);

      expect(registry.getProviderCount()).toBe(2);
      expect(registry.getProviderNames()).toContain('mpesa');
      expect(registry.getProviderNames()).toContain('paystack');
    });
  });

  describe('getProvider', () => {
    it('should return registered provider', () => {
      const mpesaAdapter = new MpesaAdapter({
        enabled: true,
        environment: 'sandbox',
        consumerKey: 'test',
        consumerSecret: 'test',
        passkey: 'test',
        shortCode: '123456',
      });

      registry.register('mpesa', mpesaAdapter);

      const retrieved = registry.getProvider('mpesa');
      expect(retrieved).toBe(mpesaAdapter);
    });

    it('should return undefined for unknown provider', () => {
      const retrieved = registry.getProvider('unknown');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAllProviders', () => {
    it('should return map of all providers', () => {
      const mpesaAdapter = new MpesaAdapter({
        enabled: true,
        environment: 'sandbox',
        consumerKey: 'test',
        consumerSecret: 'test',
        passkey: 'test',
        shortCode: '123456',
      });

      registry.register('mpesa', mpesaAdapter);

      const allProviders = registry.getAllProviders();
      expect(allProviders.size).toBe(1);
      expect(allProviders.get('mpesa')).toBe(mpesaAdapter);
    });
  });

  describe('getProviderNames', () => {
    it('should return array of provider names', () => {
      const mpesaAdapter = new MpesaAdapter({
        enabled: true,
        environment: 'sandbox',
        consumerKey: 'test',
        consumerSecret: 'test',
        passkey: 'test',
        shortCode: '123456',
      });

      const paystackAdapter = new PaystackAdapter({
        enabled: true,
        environment: 'sandbox',
        secretKey: 'sk_test_123',
      });

      registry.register('mpesa', mpesaAdapter);
      registry.register('paystack', paystackAdapter);

      const names = registry.getProviderNames();
      expect(names).toHaveLength(2);
      expect(names).toContain('mpesa');
      expect(names).toContain('paystack');
    });

    it('should return empty array when no providers', () => {
      const names = registry.getProviderNames();
      expect(names).toEqual([]);
    });
  });

  describe('getProviderCount', () => {
    it('should return correct count', () => {
      expect(registry.getProviderCount()).toBe(0);

      registry.register('mpesa', new MpesaAdapter({
        enabled: true,
        environment: 'sandbox',
        consumerKey: 'test',
        consumerSecret: 'test',
        passkey: 'test',
        shortCode: '123456',
      }));

      expect(registry.getProviderCount()).toBe(1);
    });
  });

  describe('initializeAll', () => {
    it('should initialize all registered providers', async () => {
      const mpesaAdapter = new MpesaAdapter({
        enabled: true,
        environment: 'sandbox',
        consumerKey: 'test',
        consumerSecret: 'test',
        passkey: 'test',
        shortCode: '123456',
      });

      const initializeSpy = jest.spyOn(mpesaAdapter, 'initialize');

      registry.register('mpesa', mpesaAdapter);
      await registry.initializeAll();

      expect(initializeSpy).toHaveBeenCalled();
    });

    it('should remove failed providers', async () => {
      const failingAdapter = new PaystackAdapter({
        enabled: true,
        environment: 'sandbox',
        secretKey: 'invalid_key', // Will fail initialization
      });

      registry.register('paystack', failingAdapter);
      await registry.initializeAll();

      expect(registry.getProviderCount()).toBe(0);
      expect(registry.getProvider('paystack')).toBeUndefined();
    });

    it('should continue if one provider fails', async () => {
      const mpesaAdapter = new MpesaAdapter({
        enabled: true,
        environment: 'sandbox',
        consumerKey: 'test',
        consumerSecret: 'test',
        passkey: 'test',
        shortCode: '123456',
      });

      const failingAdapter = new PaystackAdapter({
        enabled: true,
        environment: 'sandbox',
        secretKey: 'invalid_key',
      });

      registry.register('mpesa', mpesaAdapter);
      registry.register('paystack', failingAdapter);

      await registry.initializeAll();

      expect(registry.getProviderCount()).toBe(1);
      expect(registry.getProvider('mpesa')).toBeDefined();
    });
  });
});
