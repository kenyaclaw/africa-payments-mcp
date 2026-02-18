/**
 * Tests for Encryption at Rest
 */

import {
  EncryptionManager,
  EncryptedData,
  encryptProviderConfig,
  decryptProviderConfig,
  encryptApiKey,
  decryptApiKey,
  DEFAULT_ENCRYPTION_CONFIG,
} from '../../src/utils/encryption.js';

describe('EncryptionManager', () => {
  const testKey = 'test-master-key-32-chars-long!!';
  let encryption: EncryptionManager;

  beforeEach(() => {
    encryption = new EncryptionManager({
      enabled: true,
      masterKey: testKey,
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled with valid key', () => {
      encryption = new EncryptionManager({
        enabled: true,
        masterKey: testKey,
      });
      expect(encryption.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      encryption = new EncryptionManager({ enabled: false });
      expect(encryption.isEnabled()).toBe(false);
    });

    it('should return false when no master key', () => {
      encryption = new EncryptionManager({ enabled: true });
      expect(encryption.isEnabled()).toBe(false);
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data', () => {
      const plaintext = 'my-secret-api-key';
      
      const encrypted = encryption.encrypt(plaintext);
      expect(encrypted).not.toBeNull();
      expect(encrypted?.data).toBeDefined();
      expect(encrypted?.iv).toBeDefined();
      expect(encrypted?.authTag).toBeDefined();
      expect(encrypted?.salt).toBeDefined();

      const decrypted = encryption.decrypt(encrypted!);
      expect(decrypted).toBe(plaintext);
    });

    it('should return different encrypted data for same plaintext', () => {
      const plaintext = 'same-text';
      
      const encrypted1 = encryption.encrypt(plaintext);
      const encrypted2 = encryption.encrypt(plaintext);

      expect(encrypted1?.data).not.toBe(encrypted2?.data);
      expect(encrypted1?.iv).not.toBe(encrypted2?.iv);
      expect(encrypted1?.salt).not.toBe(encrypted2?.salt);
    });

    it('should return null when encryption is disabled', () => {
      const disabledEncryption = new EncryptionManager({ enabled: false });
      const result = disabledEncryption.encrypt('test');
      expect(result).toBeNull();
    });

    it('should return null when decryption is disabled', () => {
      const encrypted = encryption.encrypt('test');
      
      const disabledEncryption = new EncryptionManager({ enabled: false });
      const result = disabledEncryption.decrypt(encrypted!);
      expect(result).toBeNull();
    });

    it('should fail to decrypt with wrong key', () => {
      const plaintext = 'secret-data';
      const encrypted = encryption.encrypt(plaintext);

      const wrongEncryption = new EncryptionManager({
        enabled: true,
        masterKey: 'wrong-key-32-chars-long!!!!!',
      });

      const decrypted = wrongEncryption.decrypt(encrypted!);
      expect(decrypted).toBeNull();
    });

    it('should handle empty string', () => {
      const encrypted = encryption.encrypt('');
      expect(encrypted).not.toBeNull();
      
      const decrypted = encryption.decrypt(encrypted!);
      expect(decrypted).toBe('');
    });

    it('should handle long strings', () => {
      const longText = 'a'.repeat(10000);
      const encrypted = encryption.encrypt(longText);
      const decrypted = encryption.decrypt(encrypted!);
      expect(decrypted).toBe(longText);
    });

    it('should handle unicode characters', () => {
      const unicode = 'Hello 世界 🌍 émojis';
      const encrypted = encryption.encrypt(unicode);
      const decrypted = encryption.decrypt(encrypted!);
      expect(decrypted).toBe(unicode);
    });
  });

  describe('encryptObject/decryptObject', () => {
    it('should encrypt sensitive fields', () => {
      const obj = {
        name: 'Test Provider',
        secretKey: 'sk_test_12345',
        publicKey: 'pk_test_67890',
      };

      const encrypted = encryption.encryptObject(obj, ['secretKey']);
      
      expect(encrypted.name).toBe('Test Provider');
      expect(encrypted.publicKey).toBe('pk_test_67890');
      expect(encrypted.secretKey).toMatch(/^enc:/);
    });

    it('should decrypt sensitive fields', () => {
      const obj = {
        name: 'Test Provider',
        secretKey: 'sk_test_12345',
      };

      const encrypted = encryption.encryptObject(obj, ['secretKey']);
      const decrypted = encryption.decryptObject(encrypted, ['secretKey']);
      
      expect(decrypted.name).toBe('Test Provider');
      expect(decrypted.secretKey).toBe('sk_test_12345');
    });

    it('should return original object when disabled', () => {
      const disabledEncryption = new EncryptionManager({ enabled: false });
      const obj = { secretKey: 'secret' };
      
      const encrypted = disabledEncryption.encryptObject(obj, ['secretKey']);
      expect(encrypted).toEqual(obj);
    });

    it('should handle non-string values gracefully', () => {
      const obj = {
        secretKey: 'secret',
        count: 123,
        enabled: true,
      };

      const encrypted = encryption.encryptObject(obj, ['secretKey', 'count']);
      expect(typeof encrypted.secretKey).toBe('string');
      expect(encrypted.count).toBe(123); // Not encrypted, not a string
    });
  });

  describe('rotateKey', () => {
    it('should re-encrypt data with new key', () => {
      const plaintext = 'secret-data';
      const encrypted = encryption.encrypt(plaintext);

      const newKey = 'new-master-key-32-chars-long!';
      const rotated = encryption.rotateKey(encrypted!, newKey);

      expect(rotated).not.toBeNull();
      expect(rotated?.salt).not.toBe(encrypted?.salt);

      // Verify with new key
      const newEncryption = new EncryptionManager({
        enabled: true,
        masterKey: newKey,
      });
      const decrypted = newEncryption.decrypt(rotated!);
      expect(decrypted).toBe(plaintext);
    });

    it('should return null when rotation fails', () => {
      const disabledEncryption = new EncryptionManager({ enabled: false });
      const result = disabledEncryption.rotateKey({} as EncryptedData, 'new-key');
      expect(result).toBeNull();
    });
  });

  describe('hash', () => {
    it('should produce consistent hashes', () => {
      const value = 'test-value';
      const hash1 = encryption.hash(value);
      const hash2 = encryption.hash(value);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it('should produce different hashes for different values', () => {
      const hash1 = encryption.hash('value1');
      const hash2 = encryption.hash('value2');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('secureCompare', () => {
    it('should return true for equal strings', () => {
      expect(encryption.secureCompare('test', 'test')).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(encryption.secureCompare('test1', 'test2')).toBe(false);
    });

    it('should return false for different lengths', () => {
      expect(encryption.secureCompare('test', 'testing')).toBe(false);
    });
  });

  describe('generateKey', () => {
    it('should generate a key of specified length', () => {
      const key = EncryptionManager.generateKey(32);
      // Base64 length calculation: ceil(32 / 3) * 4 = 44 (with possible padding)
      expect(Buffer.from(key, 'base64').length).toBe(32);
    });

    it('should generate unique keys', () => {
      const key1 = EncryptionManager.generateKey();
      const key2 = EncryptionManager.generateKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('generatePassword', () => {
    it('should generate password of specified length', () => {
      const password = EncryptionManager.generatePassword(16);
      expect(password.length).toBe(16);
    });

    it('should generate unique passwords', () => {
      const password1 = EncryptionManager.generatePassword();
      const password2 = EncryptionManager.generatePassword();
      expect(password1).not.toBe(password2);
    });

    it('should include various character types', () => {
      const password = EncryptionManager.generatePassword(50);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[0-9]/.test(password)).toBe(true);
      expect(/[!@#$%^&*]/.test(password)).toBe(true);
    });
  });

  describe('isEncrypted', () => {
    it('should return true for encrypted data with enc: prefix', () => {
      const encrypted = encryption.encrypt('test');
      const prefixed = `enc:${JSON.stringify(encrypted)}`;
      expect(EncryptionManager.isEncrypted(prefixed)).toBe(true);
    });

    it('should return false for plain strings', () => {
      expect(EncryptionManager.isEncrypted('plaintext')).toBe(false);
      expect(EncryptionManager.isEncrypted('sk_test_12345')).toBe(false);
    });

    it('should return false for empty strings', () => {
      expect(EncryptionManager.isEncrypted('')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(EncryptionManager.isEncrypted(null as any)).toBe(false);
      expect(EncryptionManager.isEncrypted(undefined as any)).toBe(false);
      expect(EncryptionManager.isEncrypted(123 as any)).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return status information', () => {
      const status = encryption.getStatus();
      
      expect(status.enabled).toBe(true);
      expect(status.initialized).toBe(true);
      expect(status.algorithm).toBe('aes-256-gcm');
      expect(status.version).toBe(1);
    });

    it('should reflect disabled state', () => {
      const disabledEncryption = new EncryptionManager({ enabled: false });
      const status = disabledEncryption.getStatus();
      
      expect(status.enabled).toBe(false);
      expect(status.initialized).toBe(false);
    });
  });
});

describe('encryptProviderConfig / decryptProviderConfig', () => {
  const testKey = 'test-master-key-32-chars-long!!';
  let encryption: EncryptionManager;

  beforeEach(() => {
    encryption = new EncryptionManager({
      enabled: true,
      masterKey: testKey,
    });
  });

  it('should encrypt sensitive provider config fields', () => {
    const config = {
      enabled: true,
      secretKey: 'sk_test_12345',
      publicKey: 'pk_test_67890',
      apiKey: 'api_key_secret',
    };

    const encrypted = encryptProviderConfig(config, encryption);
    
    expect(encrypted.enabled).toBe(true);
    expect(encrypted.publicKey).toBe('pk_test_67890');
    expect(encrypted.secretKey).toMatch(/^enc:/);
    expect(encrypted.apiKey).toMatch(/^enc:/);
  });

  it('should decrypt sensitive provider config fields', () => {
    const config = {
      secretKey: 'sk_test_12345',
    };

    const encrypted = encryptProviderConfig(config, encryption);
    const decrypted = decryptProviderConfig(encrypted, encryption);
    
    expect(decrypted.secretKey).toBe('sk_test_12345');
  });

  it('should pass through when encryption is disabled', () => {
    const disabledEncryption = new EncryptionManager({ enabled: false });
    const config = { secretKey: 'secret' };
    
    const encrypted = encryptProviderConfig(config, disabledEncryption);
    expect(encrypted).toEqual(config);
  });
});

describe('encryptApiKey / decryptApiKey', () => {
  const testKey = 'test-master-key-32-chars-long!!';
  let encryption: EncryptionManager;

  beforeEach(() => {
    encryption = new EncryptionManager({
      enabled: true,
      masterKey: testKey,
    });
  });

  it('should encrypt API key', () => {
    const apiKey = 'sk_test_12345';
    const encrypted = encryptApiKey(apiKey, encryption);
    
    expect(encrypted).toMatch(/^enc:/);
  });

  it('should decrypt API key', () => {
    const apiKey = 'sk_test_12345';
    const encrypted = encryptApiKey(apiKey, encryption);
    const decrypted = decryptApiKey(encrypted!, encryption);
    
    expect(decrypted).toBe(apiKey);
  });

  it('should return plain key as-is if not encrypted', () => {
    const plainKey = 'sk_test_12345';
    const result = decryptApiKey(plainKey, encryption);
    expect(result).toBe(plainKey);
  });

  it('should return null for invalid encrypted data', () => {
    const result = decryptApiKey('enc:invalid-json', encryption);
    expect(result).toBeNull();
  });

  it('should return null when encryption is disabled', () => {
    const disabledEncryption = new EncryptionManager({ enabled: false });
    const result = encryptApiKey('test', disabledEncryption);
    expect(result).toBeNull();
  });
});

describe('DEFAULT_ENCRYPTION_CONFIG', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_ENCRYPTION_CONFIG.enabled).toBe(false);
    expect(DEFAULT_ENCRYPTION_CONFIG.algorithm).toBe('aes-256-gcm');
    expect(DEFAULT_ENCRYPTION_CONFIG.keyDerivation).toBe('pbkdf2');
  });
});
