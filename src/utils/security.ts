/**
 * Security Utilities for Africa Payments MCP
 * 
 * Provides security-related functions for:
 * - Masking sensitive data in logs
 * - Webhook signature verification
 * - Rate limiting
 * - Input sanitization
 * - Configuration validation
 */

import { createHmac, timingSafeEqual } from 'crypto';

// ============================================================================
// Sensitive Data Masking
// ============================================================================

const SENSITIVE_FIELDS = [
  'apiKey',
  'api_key',
  'secret',
  'secretKey',
  'secret_key',
  'password',
  'token',
  'authToken',
  'accessToken',
  'refreshToken',
  'authorization',
  'x-api-key',
  'privateKey',
  'private_key',
  'mpesaPasskey',
  'mpesa_passkey',
];

/**
 * Mask sensitive data in logs
 * Recursively traverses objects and masks sensitive fields
 */
export function maskSensitiveData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return maskString(data);
  }

  if (Array.isArray(data)) {
    return data.map(maskSensitiveData);
  }

  if (typeof data === 'object') {
    const masked: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (isSensitiveField(key)) {
        masked[key] = maskValue(value);
      } else if (typeof value === 'object') {
        masked[key] = maskSensitiveData(value);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  return data;
}

function isSensitiveField(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_FIELDS.some(field => 
    lowerKey === field.toLowerCase() || 
    lowerKey.includes(field.toLowerCase())
  );
}

function maskValue(value: any): string {
  if (typeof value !== 'string' || value.length === 0) {
    return '***';
  }
  if (value.length <= 8) {
    return '***';
  }
  // Show first 4 and last 4 characters for debugging purposes
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function maskString(str: string): string {
  // Mask API keys (sk_live_, sk_test_, pk_live_, pk_test_)
  if (/^(sk|pk)_(live|test)_/.test(str)) {
    return `${str.slice(0, 12)}...${str.slice(-4)}`;
  }
  // Mask bearer tokens
  if (str.startsWith('Bearer ')) {
    const token = str.slice(7);
    return `Bearer ${token.slice(0, 4)}...${token.slice(-4)}`;
  }
  return str;
}

/**
 * Mask a phone number for logging (show only last 4 digits)
 */
export function maskPhoneNumber(phone: string): string {
  const cleaned = sanitizePhoneNumber(phone);
  if (cleaned.length < 4) return '***';
  return `***${cleaned.slice(-4)}`;
}

/**
 * Mask an email address for logging
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return maskValue(email);
  const maskedLocal = local.length > 2 
    ? `${local[0]}***${local[local.length - 1]}` 
    : '***';
  return `${maskedLocal}@${domain}`;
}

// ============================================================================
// Webhook Signature Verification
// ============================================================================

export type HashAlgorithm = 'sha256' | 'sha512';

/**
 * Verify webhook signature using HMAC
 * 
 * @param payload - Raw request body
 * @param signature - Signature from header
 * @param secret - Webhook secret
 * @param algorithm - Hash algorithm
 * @returns boolean indicating if signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: HashAlgorithm = 'sha256'
): boolean {
  if (!payload || !signature || !secret) {
    return false;
  }

  try {
    const hmac = createHmac(algorithm, secret);
    hmac.update(payload, 'utf8');
    const computed = hmac.digest('hex');

    // Handle different signature formats
    const sigValue = signature.startsWith(`${algorithm}=`) 
      ? signature.slice(algorithm.length + 1) 
      : signature;

    // Use timing-safe comparison to prevent timing attacks
    const computedBuf = Buffer.from(computed, 'hex');
    const sigBuf = Buffer.from(sigValue, 'hex');

    if (computedBuf.length !== sigBuf.length) {
      return false;
    }

    return timingSafeEqual(computedBuf, sigBuf);
  } catch (error) {
    return false;
  }
}

/**
 * Verify Paystack webhook signature
 */
export function verifyPaystackSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  return verifyWebhookSignature(payload, signature, secret, 'sha512');
}

/**
 * Verify M-Pesa webhook signature (if applicable)
 */
export function verifyMpesaSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  return verifyWebhookSignature(payload, signature, secret, 'sha256');
}

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface RateLimiterOptions {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyPrefix?: string;    // Prefix for keys
}

/**
 * Simple in-memory rate limiter
 * For production, consider using Redis-backed rate limiter
 */
export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private options: RateLimiterOptions;

  constructor(options: RateLimiterOptions) {
    this.options = {
      keyPrefix: 'rl:',
      ...options,
    };
    
    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request is allowed
   * @param key - Unique identifier (IP, user ID, etc.)
   * @returns Object with allowed status and remaining info
   */
  check(key: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const fullKey = `${this.options.keyPrefix}${key}`;
    const entry = this.store.get(fullKey);

    if (!entry || now > entry.resetTime) {
      // New window
      this.store.set(fullKey, {
        count: 1,
        resetTime: now + this.options.windowMs,
      });
      return {
        allowed: true,
        remaining: this.options.maxRequests - 1,
        resetTime: now + this.options.windowMs,
      };
    }

    if (entry.count >= this.options.maxRequests) {
      // Rate limit exceeded
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
      };
    }

    // Increment count
    entry.count++;
    return {
      allowed: true,
      remaining: this.options.maxRequests - entry.count,
      resetTime: entry.resetTime,
    };
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    const fullKey = `${this.options.keyPrefix}${key}`;
    this.store.delete(fullKey);
  }

  /**
   * Get current status without incrementing
   */
  status(key: string): { count: number; remaining: number; resetTime: number } {
    const now = Date.now();
    const fullKey = `${this.options.keyPrefix}${key}`;
    const entry = this.store.get(fullKey);

    if (!entry || now > entry.resetTime) {
      return {
        count: 0,
        remaining: this.options.maxRequests,
        resetTime: now + this.options.windowMs,
      };
    }

    return {
      count: entry.count,
      remaining: this.options.maxRequests - entry.count,
      resetTime: entry.resetTime,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

// ============================================================================
// Input Sanitization
// ============================================================================

/**
 * Sanitize phone number to E.164 format
 * @param phone - Phone number string
 * @returns Sanitized phone number or empty string if invalid
 */
export function sanitizePhoneNumber(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    return '';
  }

  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');

  // Handle Kenyan numbers
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '254' + cleaned.slice(1);
  }

  // Handle numbers with 254 prefix but missing +
  if (cleaned.startsWith('254') && cleaned.length === 12) {
    return cleaned;
  }

  // Validate length (E.164 should be 10-15 digits)
  if (cleaned.length < 10 || cleaned.length > 15) {
    return '';
  }

  return cleaned;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize string input to prevent XSS
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/[<>]/g, '')  // Remove < and >
    .trim()
    .slice(0, 1000);      // Limit length
}

/**
 * Validate amount is a positive number
 */
export function isValidAmount(amount: any): boolean {
  const num = Number(amount);
  return !isNaN(num) && num > 0 && isFinite(num);
}

/**
 * Validate currency code
 */
export function isValidCurrency(currency: string): boolean {
  const validCurrencies = ['KES', 'NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'GHS'];
  return validCurrencies.includes(currency?.toUpperCase());
}

// ============================================================================
// Configuration Validation
// ============================================================================

export interface ValidationError {
  field: string;
  message: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ConfigToValidate {
  paystackSecretKey?: string;
  paystackPublicKey?: string;
  mpesaConsumerKey?: string;
  mpesaConsumerSecret?: string;
  mpesaPasskey?: string;
  mpesaShortcode?: string;
  webhookSecret?: string;
  environment?: string;
}

/**
 * Validate configuration for security issues
 */
export function validateConfig(config: ConfigToValidate): ConfigValidationResult {
  const errors: ValidationError[] = [];

  // Validate Paystack keys
  if (config.paystackSecretKey) {
    if (!isValidPaystackKey(config.paystackSecretKey)) {
      errors.push({
        field: 'paystackSecretKey',
        message: 'Invalid Paystack secret key format',
      });
    }
    checkEnvironmentMismatch(config.paystackSecretKey, config.environment, 'Paystack', errors);
  }

  if (config.paystackPublicKey) {
    if (!isValidPaystackKey(config.paystackPublicKey, true)) {
      errors.push({
        field: 'paystackPublicKey',
        message: 'Invalid Paystack public key format',
      });
    }
  }

  // Validate M-Pesa credentials
  if (config.mpesaConsumerKey && config.mpesaConsumerKey.length < 10) {
    errors.push({
      field: 'mpesaConsumerKey',
      message: 'M-Pesa consumer key appears too short',
    });
  }

  if (config.mpesaConsumerSecret && config.mpesaConsumerSecret.length < 10) {
    errors.push({
      field: 'mpesaConsumerSecret',
      message: 'M-Pesa consumer secret appears too short',
    });
  }

  if (config.mpesaPasskey && config.mpesaPasskey.length < 20) {
    errors.push({
      field: 'mpesaPasskey',
      message: 'M-Pesa passkey appears too short',
    });
  }

  if (config.mpesaShortcode) {
    const shortcode = config.mpesaShortcode.toString();
    if (!/^\d{5,7}$/.test(shortcode)) {
      errors.push({
        field: 'mpesaShortcode',
        message: 'M-Pesa shortcode should be 5-7 digits',
      });
    }
  }

  // Validate webhook secret
  if (config.webhookSecret && config.webhookSecret.length < 16) {
    errors.push({
      field: 'webhookSecret',
      message: 'Webhook secret should be at least 16 characters',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function isValidPaystackKey(key: string, isPublic = false): boolean {
  const prefix = isPublic ? 'pk_' : 'sk_';
  const envPattern = new RegExp(`^${prefix}(test|live)_[a-zA-Z0-9]+$`);
  return envPattern.test(key) && key.length > 20;
}

function checkEnvironmentMismatch(
  key: string, 
  environment: string | undefined, 
  provider: string,
  errors: ValidationError[]
): void {
  const isTestKey = key.includes('_test_');
  const isLiveKey = key.includes('_live_');
  const env = environment?.toLowerCase();

  if (env === 'production' && isTestKey) {
    errors.push({
      field: 'environment',
      message: `${provider} test key is being used in production environment`,
    });
  }

  if (env === 'development' && isLiveKey) {
    errors.push({
      field: 'environment',
      message: `WARNING: ${provider} live key is being used in development environment`,
    });
  }
}

// ============================================================================
// Security Headers
// ============================================================================

export function getSecurityHeaders(): Record<string, string> {
  return {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; object-src 'none'",
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };
}

// ============================================================================
// IP Whitelist
// ============================================================================

const PAYSTACK_IPS = [
  '52.31.139.75',
  '52.49.173.169',
  '52.214.14.220',
];

const MPESA_IPS: string[] = []; // Add M-Pesa IP ranges as needed

/**
 * Check if IP is from a trusted payment provider
 */
export function isTrustedProviderIP(ip: string, provider?: 'paystack' | 'mpesa'): boolean {
  if (provider === 'paystack') {
    return PAYSTACK_IPS.includes(ip);
  }
  if (provider === 'mpesa') {
    return MPESA_IPS.includes(ip);
  }
  return PAYSTACK_IPS.includes(ip) || MPESA_IPS.includes(ip);
}

/**
 * Validate IP format
 */
export function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ip);
}
