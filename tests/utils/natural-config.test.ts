/**
 * Natural Language Configuration Parser Tests
 */

import { jest, describe, it, expect } from '@jest/globals';
import {
  parseNaturalLanguageConfig,
  generateConfigFromParsed,
  formatParsedConfig,
  ParsedConfig,
} from '../../src/utils/natural-config.js';

describe('Natural Language Config Parser', () => {
  describe('parseNaturalLanguageConfig', () => {
    it('should detect M-Pesa and Kenya', () => {
      const result = parseNaturalLanguageConfig('I want M-Pesa in Kenya');
      
      expect(result.providers).toContain('mpesa');
      expect(result.countries).toContain('KE');
      expect(result.currencies).toContain('KES');
      expect(result.defaults.provider).toBe('mpesa');
      expect(result.defaults.country).toBe('KE');
      expect(result.defaults.currency).toBe('KES');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect Paystack and Nigeria', () => {
      const result = parseNaturalLanguageConfig('I want Paystack in Nigeria');
      
      expect(result.providers).toContain('paystack');
      expect(result.countries).toContain('NG');
      expect(result.currencies).toContain('NGN');
      expect(result.defaults.provider).toBe('paystack');
      expect(result.defaults.country).toBe('NG');
      expect(result.defaults.currency).toBe('NGN');
    });

    it('should detect multiple providers and countries', () => {
      const result = parseNaturalLanguageConfig(
        'I want M-Pesa in Kenya and Paystack in Nigeria'
      );
      
      expect(result.providers).toContain('mpesa');
      expect(result.providers).toContain('paystack');
      expect(result.countries).toContain('KE');
      expect(result.countries).toContain('NG');
      expect(result.currencies).toContain('KES');
      expect(result.currencies).toContain('NGN');
    });

    it('should detect Ghana and MTN MoMo', () => {
      const result = parseNaturalLanguageConfig('I want MTN MoMo in Ghana');
      
      expect(result.providers).toContain('mtn_momo');
      expect(result.countries).toContain('GH');
      expect(result.currencies).toContain('GHS');
    });

    it('should detect Uganda and Airtel Money', () => {
      const result = parseNaturalLanguageConfig('I want Airtel Money in Uganda');
      
      expect(result.providers).toContain('airtel_money');
      expect(result.countries).toContain('UG');
      expect(result.currencies).toContain('UGX');
    });

    it('should detect Tanzania with M-Pesa', () => {
      const result = parseNaturalLanguageConfig('I want M-Pesa in Tanzania');
      
      expect(result.providers).toContain('mpesa');
      expect(result.countries).toContain('TZ');
      expect(result.currencies).toContain('TZS');
    });

    it('should detect IntaSend', () => {
      const result = parseNaturalLanguageConfig('I want IntaSend in Kenya');
      
      expect(result.providers).toContain('intasend');
      expect(result.countries).toContain('KE');
    });

    it('should detect Flutterwave', () => {
      const result = parseNaturalLanguageConfig('I want Flutterwave in Nigeria');
      
      expect(result.providers).toContain('flutterwave');
      expect(result.countries).toContain('NG');
    });

    it('should handle case insensitive input', () => {
      const result = parseNaturalLanguageConfig('I WANT MPESA IN KENYA');
      
      expect(result.providers).toContain('mpesa');
      expect(result.countries).toContain('KE');
    });

    it('should handle keyword variations', () => {
      const result1 = parseNaturalLanguageConfig('I want M-Pesa in Kenya');
      const result2 = parseNaturalLanguageConfig('I want Safaricom in Kenya');
      
      expect(result1.providers).toContain('mpesa');
      expect(result2.providers).toContain('mpesa');
    });

    it('should return low confidence for unclear input', () => {
      const result = parseNaturalLanguageConfig('I want to accept payments');
      
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.providers).toHaveLength(0);
      expect(result.countries).toHaveLength(0);
    });

    it('should provide explanations for detections', () => {
      const result = parseNaturalLanguageConfig('I want M-Pesa in Kenya');
      
      expect(result.explanations.length).toBeGreaterThan(0);
      expect(result.explanations.some(e => e.includes('mpesa'))).toBe(true);
      expect(result.explanations.some(e => e.includes('KE'))).toBe(true);
    });

    it('should detect South Africa', () => {
      const result = parseNaturalLanguageConfig('I want Paystack in South Africa');
      
      expect(result.countries).toContain('ZA');
      expect(result.currencies).toContain('ZAR');
    });

    it('should detect Rwanda', () => {
      const result = parseNaturalLanguageConfig('I want MTN MoMo in Rwanda');
      
      expect(result.countries).toContain('RW');
    });

    it('should prioritize provider-country compatibility', () => {
      const result = parseNaturalLanguageConfig(
        'I want M-Pesa, Paystack, and MTN MoMo in Kenya'
      );
      
      // M-Pesa should be the default for Kenya since it supports KE
      expect(result.defaults.country).toBe('KE');
      expect(result.providers).toContain('mpesa');
      expect(result.providers).toContain('paystack');
      expect(result.providers).toContain('mtn_momo');
    });
  });

  describe('generateConfigFromParsed', () => {
    it('should generate valid config for M-Pesa Kenya', () => {
      const parsed: ParsedConfig = {
        providers: ['mpesa'],
        countries: ['KE'],
        currencies: ['KES'],
        defaults: { provider: 'mpesa', country: 'KE', currency: 'KES' },
        confidence: 1,
        explanations: [],
      };
      
      const config = generateConfigFromParsed(parsed);
      
      expect(config.providers.mpesa).toBeDefined();
      expect(config.providers.mpesa.enabled).toBe(true);
      expect(config.providers.mpesa.environment).toBe('sandbox');
      expect(config.providers.mpesa.consumerKey).toBeDefined();
      expect(config.defaults.currency).toBe('KES');
      expect(config.defaults.country).toBe('KE');
      expect(config.defaults.provider).toBe('mpesa');
    });

    it('should generate valid config for Paystack Nigeria', () => {
      const parsed: ParsedConfig = {
        providers: ['paystack'],
        countries: ['NG'],
        currencies: ['NGN'],
        defaults: { provider: 'paystack', country: 'NG', currency: 'NGN' },
        confidence: 1,
        explanations: [],
      };
      
      const config = generateConfigFromParsed(parsed);
      
      expect(config.providers.paystack).toBeDefined();
      expect(config.providers.paystack.secretKey).toContain('sk_test');
      expect(config.defaults.currency).toBe('NGN');
    });

    it('should generate config for multiple providers', () => {
      const parsed: ParsedConfig = {
        providers: ['mpesa', 'paystack'],
        countries: ['KE', 'NG'],
        currencies: ['KES', 'NGN'],
        defaults: { provider: 'mpesa', country: 'KE', currency: 'KES' },
        confidence: 1,
        explanations: [],
      };
      
      const config = generateConfigFromParsed(parsed);
      
      expect(config.providers.mpesa).toBeDefined();
      expect(config.providers.paystack).toBeDefined();
    });

    it('should include server settings', () => {
      const parsed: ParsedConfig = {
        providers: ['mpesa'],
        countries: ['KE'],
        currencies: ['KES'],
        defaults: { provider: 'mpesa', country: 'KE', currency: 'KES' },
        confidence: 1,
        explanations: [],
      };
      
      const config = generateConfigFromParsed(parsed);
      
      expect(config.server.port).toBe(3000);
      expect(config.server.logLevel).toBe('info');
    });

    it('should use defaults when no detection', () => {
      const parsed: ParsedConfig = {
        providers: [],
        countries: [],
        currencies: [],
        defaults: {},
        confidence: 0,
        explanations: [],
      };
      
      const config = generateConfigFromParsed(parsed);
      
      expect(config.defaults.currency).toBe('KES');
      expect(config.defaults.country).toBe('KE');
    });
  });

  describe('formatParsedConfig', () => {
    it('should format detected providers', () => {
      const parsed: ParsedConfig = {
        providers: ['mpesa', 'paystack'],
        countries: ['KE'],
        currencies: ['KES'],
        defaults: { provider: 'mpesa', country: 'KE', currency: 'KES' },
        confidence: 1,
        explanations: ['Detected provider mpesa'],
      };
      
      const output = formatParsedConfig(parsed);
      
      expect(output).toContain('mpesa');
      expect(output).toContain('paystack');
      expect(output).toContain('KE');
      expect(output).toContain('100%');
    });

    it('should show warning when no providers detected', () => {
      const parsed: ParsedConfig = {
        providers: [],
        countries: [],
        currencies: [],
        defaults: {},
        confidence: 0,
        explanations: [],
      };
      
      const output = formatParsedConfig(parsed);
      
      expect(output).toContain('No providers detected');
      expect(output).toContain('No countries detected');
    });

    it('should include detection explanations', () => {
      const parsed: ParsedConfig = {
        providers: ['mpesa'],
        countries: ['KE'],
        currencies: ['KES'],
        defaults: { provider: 'mpesa', country: 'KE', currency: 'KES' },
        confidence: 1,
        explanations: ['Detected provider mpesa from keyword M-Pesa'],
      };
      
      const output = formatParsedConfig(parsed);
      
      expect(output).toContain('Detection Details');
      expect(output).toContain('M-Pesa');
    });
  });
});
