/**
 * Security Utilities Tests
 */

import {
  maskSensitiveData,
  maskPhoneNumber,
  maskEmail,
  verifyWebhookSignature,
  verifyPaystackSignature,
  RateLimiter,
  sanitizePhoneNumber,
  isValidEmail,
  sanitizeString,
  isValidAmount,
  isValidCurrency,
  validateConfig,
  isValidIP,
  isTrustedProviderIP,
  getSecurityHeaders,
} from '../security';

describe('Security Utilities', () => {
  describe('maskSensitiveData', () => {
    it('should mask API keys in objects', () => {
      const data = {
        apiKey: 'sk_live_1234567890abcdef',
        name: 'Test',
      };
      const masked = maskSensitiveData(data);
      expect(masked.apiKey).toContain('***');
      expect(masked.name).toBe('Test');
    });

    it('should mask nested sensitive fields', () => {
      const data = {
        user: {
          password: 'secret123',
          name: 'John',
        },
      };
      const masked = maskSensitiveData(data);
      expect(masked.user.password).toContain('***');
      expect(masked.user.name).toBe('John');
    });

    it('should mask sensitive fields in arrays', () => {
      const data = [
        { apiKey: 'sk_live_1234567890abcdef' },
        { apiKey: 'sk_test_0987654321fedcba' },
      ];
      const masked = maskSensitiveData(data);
      expect(masked[0].apiKey).toContain('***');
      expect(masked[1].apiKey).toContain('***');
    });

    it('should mask authorization headers', () => {
      const data = {
        headers: {
          authorization: 'Bearer token1234567890',
        },
      };
      const masked = maskSensitiveData(data);
      expect(masked.headers.authorization).toContain('***');
    });
  });

  describe('maskPhoneNumber', () => {
    it('should mask phone numbers correctly', () => {
      expect(maskPhoneNumber('254712345678')).toBe('***5678');
      expect(maskPhoneNumber('0712345678')).toBe('***5678');
    });

    it('should return *** for short numbers', () => {
      expect(maskPhoneNumber('123')).toBe('***');
    });
  });

  describe('maskEmail', () => {
    it('should mask email addresses', () => {
      expect(maskEmail('test@example.com')).toBe('t***t@example.com');
      expect(maskEmail('ab@example.com')).toBe('***@example.com');
    });

    it('should handle invalid emails', () => {
      expect(maskEmail('invalid')).toBe('***');
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', () => {
      const payload = '{"event":"charge.success"}';
      const secret = 'whsec_test_secret';
      const crypto = require('crypto');
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      expect(verifyWebhookSignature(payload, signature, secret, 'sha256')).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = '{"event":"charge.success"}';
      const secret = 'whsec_test_secret';

      expect(verifyWebhookSignature(payload, 'invalid_signature', secret, 'sha256')).toBe(false);
    });

    it('should handle prefixed signatures', () => {
      const payload = '{"event":"charge.success"}';
      const secret = 'whsec_test_secret';
      const crypto = require('crypto');
      const hash = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      const signature = `sha256=${hash}`;

      expect(verifyWebhookSignature(payload, signature, secret, 'sha256')).toBe(true);
    });

    it('should return false for missing parameters', () => {
      expect(verifyWebhookSignature('', 'sig', 'secret', 'sha256')).toBe(false);
      expect(verifyWebhookSignature('payload', '', 'secret', 'sha256')).toBe(false);
      expect(verifyWebhookSignature('payload', 'sig', '', 'sha256')).toBe(false);
    });
  });

  describe('verifyPaystackSignature', () => {
    it('should verify Paystack signature with sha512', () => {
      const payload = '{"event":"charge.success"}';
      const secret = 'whsec_test_secret';
      const crypto = require('crypto');
      const signature = crypto
        .createHmac('sha512', secret)
        .update(payload)
        .digest('hex');

      expect(verifyPaystackSignature(payload, signature, secret)).toBe(true);
    });
  });

  describe('RateLimiter', () => {
    it('should allow requests within limit', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 });
      
      for (let i = 0; i < 5; i++) {
        const result = limiter.check('user1');
        expect(result.allowed).toBe(true);
      }
    });

    it('should block requests over limit', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 2 });
      
      limiter.check('user1');
      limiter.check('user1');
      const result = limiter.check('user1');
      
      expect(result.allowed).toBe(false);
    });

    it('should track remaining requests', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 });
      
      const result1 = limiter.check('user1');
      expect(result1.remaining).toBe(4);
      
      const result2 = limiter.check('user1');
      expect(result2.remaining).toBe(3);
    });

    it('should reset after window expires', async () => {
      const limiter = new RateLimiter({ windowMs: 50, maxRequests: 1 });
      
      limiter.check('user1');
      const blocked = limiter.check('user1');
      expect(blocked.allowed).toBe(false);
      
      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const reset = limiter.check('user1');
      expect(reset.allowed).toBe(true);
    });

    it('should isolate different keys', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 1 });
      
      const result1 = limiter.check('user1');
      const result2 = limiter.check('user2');
      
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    it('should provide status without incrementing', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 });
      
      limiter.check('user1');
      const status = limiter.status('user1');
      
      expect(status.count).toBe(1);
      expect(status.remaining).toBe(4);
    });

    it('should allow manual reset', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 1 });
      
      limiter.check('user1');
      limiter.reset('user1');
      
      const result = limiter.check('user1');
      expect(result.allowed).toBe(true);
    });
  });

  describe('sanitizePhoneNumber', () => {
    it('should convert Kenyan numbers to E.164', () => {
      expect(sanitizePhoneNumber('0712345678')).toBe('254712345678');
      expect(sanitizePhoneNumber('0112345678')).toBe('254112345678');
    });

    it('should keep numbers with 254 prefix', () => {
      expect(sanitizePhoneNumber('254712345678')).toBe('254712345678');
      expect(sanitizePhoneNumber('+254712345678')).toBe('254712345678');
    });

    it('should remove non-numeric characters', () => {
      expect(sanitizePhoneNumber('+254 (712) 345-678')).toBe('254712345678');
      expect(sanitizePhoneNumber('0712 345 678')).toBe('254712345678');
    });

    it('should return empty string for invalid numbers', () => {
      expect(sanitizePhoneNumber('123')).toBe('');
      expect(sanitizePhoneNumber('')).toBe('');
      expect(sanitizePhoneNumber('invalid')).toBe('');
    });
  });

  describe('isValidEmail', () => {
    it('should validate correct emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.ke')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeString('<script>alert(1)</script>')).toBe('alert(1)');
      expect(sanitizeString('<b>bold</b>')).toBe('b/old/b');
    });

    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('should handle non-strings', () => {
      expect(sanitizeString(null as any)).toBe('');
      expect(sanitizeString(123 as any)).toBe('');
    });

    it('should limit length', () => {
      const long = 'a'.repeat(20000);
      expect(sanitizeString(long).length).toBe(1000);
    });
  });

  describe('isValidAmount', () => {
    it('should validate positive amounts', () => {
      expect(isValidAmount(100)).toBe(true);
      expect(isValidAmount(0.01)).toBe(true);
      expect(isValidAmount('100')).toBe(true);
    });

    it('should reject invalid amounts', () => {
      expect(isValidAmount(0)).toBe(false);
      expect(isValidAmount(-100)).toBe(false);
      expect(isValidAmount('invalid')).toBe(false);
      expect(isValidAmount(NaN)).toBe(false);
      expect(isValidAmount(Infinity)).toBe(false);
    });
  });

  describe('isValidCurrency', () => {
    it('should validate supported currencies', () => {
      expect(isValidCurrency('KES')).toBe(true);
      expect(isValidCurrency('NGN')).toBe(true);
      expect(isValidCurrency('USD')).toBe(true);
      expect(isValidCurrency('kes')).toBe(true);
    });

    it('should reject unsupported currencies', () => {
      expect(isValidCurrency('XYZ')).toBe(false);
      expect(isValidCurrency('')).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('should validate correct Paystack keys', () => {
      const result = validateConfig({
        paystackSecretKey: 'sk_live_' + 'a'.repeat(40),
        paystackPublicKey: 'pk_live_' + 'a'.repeat(40),
        environment: 'production',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect test key in production', () => {
      const result = validateConfig({
        paystackSecretKey: 'sk_test_' + 'a'.repeat(40),
        environment: 'production',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('test key'))).toBe(true);
    });

    it('should validate M-Pesa credentials', () => {
      const result = validateConfig({
        mpesaConsumerKey: 'short',
        mpesaConsumerSecret: 'short',
        mpesaPasskey: 'short',
        mpesaShortcode: '123',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate webhook secret length', () => {
      const result = validateConfig({
        webhookSecret: 'short',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'webhookSecret')).toBe(true);
    });

    it('should validate M-Pesa shortcode format', () => {
      const valid = validateConfig({
        mpesaShortcode: '12345',
      });
      expect(valid.valid).toBe(true);

      const invalid = validateConfig({
        mpesaShortcode: '12',
      });
      expect(invalid.valid).toBe(false);
    });
  });

  describe('isValidIP', () => {
    it('should validate IPv4 addresses', () => {
      expect(isValidIP('192.168.1.1')).toBe(true);
      expect(isValidIP('10.0.0.1')).toBe(true);
      expect(isValidIP('255.255.255.255')).toBe(true);
      expect(isValidIP('0.0.0.0')).toBe(true);
    });

    it('should reject invalid IPs', () => {
      expect(isValidIP('256.1.1.1')).toBe(false);
      expect(isValidIP('192.168.1')).toBe(false);
      expect(isValidIP('not-an-ip')).toBe(false);
      expect(isValidIP('')).toBe(false);
    });
  });

  describe('isTrustedProviderIP', () => {
    it('should recognize Paystack IPs', () => {
      expect(isTrustedProviderIP('52.31.139.75', 'paystack')).toBe(true);
      expect(isTrustedProviderIP('52.49.173.169', 'paystack')).toBe(true);
    });

    it('should reject unknown IPs', () => {
      expect(isTrustedProviderIP('1.2.3.4', 'paystack')).toBe(false);
      expect(isTrustedProviderIP('192.168.1.1', 'paystack')).toBe(false);
    });
  });

  describe('getSecurityHeaders', () => {
    it('should return security headers', () => {
      const headers = getSecurityHeaders();
      expect(headers).toHaveProperty('Strict-Transport-Security');
      expect(headers).toHaveProperty('X-Content-Type-Options');
      expect(headers).toHaveProperty('X-Frame-Options');
      expect(headers).toHaveProperty('X-XSS-Protection');
      expect(headers).toHaveProperty('Content-Security-Policy');
    });

    it('should have correct HSTS value', () => {
      const headers = getSecurityHeaders();
      expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
      expect(headers['Strict-Transport-Security']).toContain('includeSubDomains');
    });

    it('should deny framing', () => {
      const headers = getSecurityHeaders();
      expect(headers['X-Frame-Options']).toBe('DENY');
    });
  });
});
