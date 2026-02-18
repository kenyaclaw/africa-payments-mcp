/**
 * Encryption at Rest for Africa Payments MCP
 * 
 * Provides encryption for sensitive data like API keys.
 * Uses Node.js crypto module with AES-256-GCM.
 * Optional feature, disabled by default.
 */

import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface EncryptionConfig {
  enabled: boolean;
  masterKey?: string; // Should be provided via environment variable
  algorithm?: string;
  keyDerivation?: 'pbkdf2' | 'scrypt';
}

export interface EncryptedData {
  data: string; // Base64 encoded encrypted data
  iv: string; // Base64 encoded initialization vector
  authTag: string; // Base64 encoded authentication tag (GCM)
  salt: string; // Base64 encoded salt for key derivation
  version: number; // Encryption version for future migrations
}

export interface KeyMetadata {
  id: string;
  createdAt: Date;
  algorithm: string;
  keyHash: string; // Hash of the key for verification (not the key itself)
}

// ============================================================================
// Constants
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits
const KEY_LENGTH = 32; // 256 bits
const PBKDF2_ITERATIONS = 100000;
const CURRENT_VERSION = 1;

// ============================================================================
// Encryption Manager
// ============================================================================

export class EncryptionManager {
  private config: EncryptionConfig;
  private masterKey: Buffer | null = null;
  private isInitialized = false;

  constructor(config: EncryptionConfig = { enabled: false }) {
    this.config = {
      enabled: false,
      algorithm: ALGORITHM,
      keyDerivation: 'pbkdf2',
      ...config,
    };

    if (this.config.enabled) {
      this.initialize();
    }
  }

  /**
   * Check if encryption is enabled and initialized
   */
  isEnabled(): boolean {
    return this.config.enabled && this.isInitialized;
  }

  /**
   * Initialize the encryption manager with master key
   */
  private initialize(): void {
    const keySource = this.config.masterKey || process.env.ENCRYPTION_MASTER_KEY;

    if (!keySource) {
      console.warn('Encryption is enabled but no master key provided. Encryption will be disabled.');
      this.config.enabled = false;
      return;
    }

    try {
      this.masterKey = this.deriveKey(keySource, Buffer.alloc(SALT_LENGTH));
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
      this.config.enabled = false;
    }
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(plaintext: string): EncryptedData | null {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(SALT_LENGTH);
      const iv = crypto.randomBytes(IV_LENGTH);

      // Derive key from master key and salt
      const key = this.deriveKey(this.config.masterKey!, salt);

      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

      // Encrypt data
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      // Get authentication tag
      const authTag = cipher.getAuthTag();

      return {
        data: encrypted,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        salt: salt.toString('base64'),
        version: CURRENT_VERSION,
      };
    } catch (error) {
      console.error('Encryption failed:', error);
      return null;
    }
  }

  /**
   * Decrypt encrypted data
   */
  decrypt(encryptedData: EncryptedData): string | null {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      // Decode base64 values
      const salt = Buffer.from(encryptedData.salt, 'base64');
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const authTag = Buffer.from(encryptedData.authTag, 'base64');

      // Derive key from master key and salt
      const key = this.deriveKey(this.config.masterKey!, salt);

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt data
      let decrypted = decipher.update(encryptedData.data, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  }

  /**
   * Encrypt an object (selective field encryption)
   */
  encryptObject<T extends Record<string, any>>(
    obj: T,
    sensitiveFields: string[]
  ): T {
    if (!this.isEnabled()) {
      return obj;
    }

    const encrypted = { ...obj };

    for (const field of sensitiveFields) {
      if (encrypted[field] && typeof encrypted[field] === 'string') {
        const encryptedValue = this.encrypt(encrypted[field]);
        if (encryptedValue) {
          encrypted[field] = `enc:${JSON.stringify(encryptedValue)}` as any;
        }
      }
    }

    return encrypted;
  }

  /**
   * Decrypt an object (selective field decryption)
   */
  decryptObject<T extends Record<string, any>>(
    obj: T,
    encryptedFields: string[]
  ): T {
    if (!this.isEnabled()) {
      return obj;
    }

    const decrypted = { ...obj };

    for (const field of encryptedFields) {
      const value = decrypted[field];
      if (value && typeof value === 'string' && value.startsWith('enc:')) {
        try {
          const encryptedData: EncryptedData = JSON.parse(value.slice(4));
          const decryptedValue = this.decrypt(encryptedData);
          if (decryptedValue) {
            decrypted[field] = decryptedValue as any;
          }
        } catch {
          // If decryption fails, keep original value
        }
      }
    }

    return decrypted;
  }

  /**
   * Rotate encryption key (re-encrypt data with new key)
   */
  rotateKey(encryptedData: EncryptedData, newMasterKey: string): EncryptedData | null {
    if (!this.isEnabled()) {
      return null;
    }

    // Decrypt with old key
    const plaintext = this.decrypt(encryptedData);
    if (!plaintext) {
      return null;
    }

    // Temporarily switch to new key
    const oldKey = this.config.masterKey;
    this.config.masterKey = newMasterKey;

    // Re-encrypt with new key
    const reEncrypted = this.encrypt(plaintext);

    // Restore old key
    this.config.masterKey = oldKey;

    return reEncrypted;
  }

  /**
   * Hash a value (one-way, for comparison)
   */
  hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Securely compare two values (timing-safe)
   */
  secureCompare(a: string, b: string): boolean {
    try {
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return false;
    }
  }

  /**
   * Generate a secure random key
   */
  static generateKey(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64');
  }

  /**
   * Generate a secure random password
   */
  static generatePassword(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    const randomBytes = crypto.randomBytes(length);
    
    for (let i = 0; i < length; i++) {
      password += chars[randomBytes[i] % chars.length];
    }
    
    return password;
  }

  /**
   * Check if a value appears to be encrypted
   */
  static isEncrypted(value: string): boolean {
    if (!value || typeof value !== 'string') {
      return false;
    }
    
    if (value.startsWith('enc:')) {
      return true;
    }

    try {
      const data = JSON.parse(value);
      return (
        data.data &&
        data.iv &&
        data.authTag &&
        data.salt &&
        data.version !== undefined
      );
    } catch {
      return false;
    }
  }

  /**
   * Get encryption status/info
   */
  getStatus(): {
    enabled: boolean;
    initialized: boolean;
    algorithm: string;
    version: number;
  } {
    return {
      enabled: this.config.enabled,
      initialized: this.isInitialized,
      algorithm: this.config.algorithm || ALGORITHM,
      version: CURRENT_VERSION,
    };
  }

  private deriveKey(password: string, salt: Buffer): Buffer {
    if (this.config.keyDerivation === 'scrypt') {
      return crypto.scryptSync(password, salt, KEY_LENGTH);
    }

    // Default to PBKDF2
    return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
  }
}

// ============================================================================
// Provider Config Encryption Helper
// ============================================================================

const SENSITIVE_CONFIG_FIELDS = [
  'consumerKey',
  'consumerSecret',
  'passkey',
  'secretKey',
  'apiKey',
  'apiKey',
  'clientSecret',
  'initiatorPassword',
  'securityCredential',
  'webhookSecret',
];

export function encryptProviderConfig<T extends Record<string, any>>(
  config: T,
  encryptionManager: EncryptionManager
): T {
  return encryptionManager.encryptObject(config, SENSITIVE_CONFIG_FIELDS);
}

export function decryptProviderConfig<T extends Record<string, any>>(
  config: T,
  encryptionManager: EncryptionManager
): T {
  return encryptionManager.decryptObject(config, SENSITIVE_CONFIG_FIELDS);
}

// ============================================================================
// API Key Encryption Helper
// ============================================================================

export function encryptApiKey(
  apiKey: string,
  encryptionManager: EncryptionManager
): string | null {
  const encrypted = encryptionManager.encrypt(apiKey);
  if (!encrypted) {
    return null;
  }
  return `enc:${JSON.stringify(encrypted)}`;
}

export function decryptApiKey(
  encryptedKey: string,
  encryptionManager: EncryptionManager
): string | null {
  if (!encryptedKey.startsWith('enc:')) {
    return encryptedKey; // Not encrypted, return as-is
  }

  try {
    const encryptedData: EncryptedData = JSON.parse(encryptedKey.slice(4));
    return encryptionManager.decrypt(encryptedData);
  } catch {
    return null;
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
  enabled: false,
  algorithm: ALGORITHM,
  keyDerivation: 'pbkdf2',
};
