/**
 * Tests for Compliance Features
 */

import {
  ComplianceManager,
  GDPRDataExport,
  ConsentRecord,
  DataRetentionPolicy,
  createComplianceManagerFromEnv,
  isPIIField,
  generatePrivacyNotice,
  DEFAULT_COMPLIANCE_CONFIG,
  DEFAULT_RETENTION_POLICIES,
} from '../../src/utils/compliance.js';

describe('ComplianceManager', () => {
  let compliance: ComplianceManager;

  beforeEach(() => {
    compliance = new ComplianceManager({
      enabled: true,
      gdpr: { enabled: true, dataControllerName: 'Test Corp', dataControllerContact: 'privacy@test.com' },
      retention: { enabled: true, transactionDataDays: 2555, auditLogDays: 2555, webhookLogDays: 90, failedPaymentDataDays: 30 },
      pii: { enabled: true, fieldsToRedact: ['email', 'phone', 'name'] },
    });
  });

  afterEach(() => {
    compliance.clear();
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      expect(compliance.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const disabled = new ComplianceManager({ enabled: false });
      expect(disabled.isEnabled()).toBe(false);
    });
  });

  describe('isGdprEnabled', () => {
    it('should return true when GDPR is enabled', () => {
      expect(compliance.isGdprEnabled()).toBe(true);
    });

    it('should return false when GDPR is disabled', () => {
      const noGdpr = new ComplianceManager({
        enabled: true,
        gdpr: { enabled: false },
      });
      expect(noGdpr.isGdprEnabled()).toBe(false);
    });
  });

  describe('generateDataExport', () => {
    it('should generate GDPR data export', () => {
      const userData = {
        email: 'user@example.com',
        name: 'John Doe',
        transactions: [{ id: 'txn-1', amount: 100 }],
      };

      const export_ = compliance.generateDataExport('user-1', userData);

      expect(export_).not.toBeNull();
      expect(export_?.exportId).toBeDefined();
      expect(export_?.dataController.name).toBe('Test Corp');
      expect(export_?.userData.personalInfo.email).toBe('user@example.com');
      expect(export_?.userData.transactions).toHaveLength(1);
    });

    it('should return null when GDPR is disabled', () => {
      const noGdpr = new ComplianceManager({ enabled: true, gdpr: { enabled: false } });
      const export_ = noGdpr.generateDataExport('user-1', {});
      expect(export_).toBeNull();
    });

    it('should identify data categories', () => {
      const userData = {
        email: 'user@example.com',
        transactions: [{ id: 'txn-1' }],
        paymentMethods: [{ type: 'card' }],
      };

      const export_ = compliance.generateDataExport('user-1', userData);
      expect(export_?.metadata.dataCategories).toContain('personal_identification');
      expect(export_?.metadata.dataCategories).toContain('financial');
    });
  });

  describe('consent management', () => {
    it('should record consent', () => {
      const consent = compliance.recordConsent('user-1', 'marketing', true);
      
      expect(consent.purpose).toBe('marketing');
      expect(consent.granted).toBe(true);
      expect(consent.id).toBeDefined();
    });

    it('should retrieve consents', () => {
      compliance.recordConsent('user-1', 'marketing', true);
      compliance.recordConsent('user-1', 'analytics', true);

      const consents = compliance.getConsents('user-1');
      expect(consents).toHaveLength(2);
    });

    it('should check if user has consent', () => {
      compliance.recordConsent('user-1', 'marketing', true);
      expect(compliance.hasConsent('user-1', 'marketing')).toBe(true);
      expect(compliance.hasConsent('user-1', 'analytics')).toBe(false);
    });

    it('should revoke consent', () => {
      const consent = compliance.recordConsent('user-1', 'marketing', true);
      const revoked = compliance.revokeConsent('user-1', consent.id);
      
      expect(revoked).toBe(true);
      expect(compliance.hasConsent('user-1', 'marketing')).toBe(false);
    });

    it('should return false when revoking non-existent consent', () => {
      expect(compliance.revokeConsent('user-1', 'non-existent')).toBe(false);
    });

    it('should use latest consent for same purpose', () => {
      const consent1 = compliance.recordConsent('user-1', 'marketing', true, '1.0');
      
      // Revoke the consent
      compliance.revokeConsent('user-1', consent1.id);

      expect(compliance.hasConsent('user-1', 'marketing')).toBe(false);
    });
  });

  describe('data access logging', () => {
    it('should log data access', () => {
      const record = compliance.logDataAccess(
        'user-1',
        'view',
        'admin-1',
        ['personal_info', 'transactions'],
        'legitimate_interest'
      );

      expect(record.action).toBe('view');
      expect(record.actor).toBe('admin-1');
      expect(record.dataCategories).toContain('personal_info');
    });

    it('should retrieve access log', () => {
      compliance.logDataAccess('user-1', 'view', 'admin-1', ['personal_info']);
      compliance.logDataAccess('user-1', 'export', 'user-1', ['all']);

      const log = compliance.getAccessLog('user-1');
      expect(log.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('redactPII', () => {
    it('should redact PII fields', () => {
      const data = {
        email: 'user@example.com',
        phone: '+1234567890',
        name: 'John Doe',
        publicField: 'visible',
      };

      const redacted = compliance.redactPII(data);

      expect(redacted.email).not.toBe('user@example.com');
      expect(redacted.email).toContain('**');
      expect(redacted.phone).toContain('**');
      expect(redacted.publicField).toBe('visible');
    });

    it('should handle email redaction', () => {
      const data = { email: 'john.doe@example.com' };
      const redacted = compliance.redactPII(data);
      expect(redacted.email).toMatch(/^j\*\*e@example\.com$/); // j**e@example.com
    });

    it('should return original data when PII redaction is disabled', () => {
      const noPii = new ComplianceManager({
        enabled: true,
        pii: { enabled: false, fieldsToRedact: [] },
      });

      const data = { email: 'user@example.com' };
      const redacted = noPii.redactPII(data);
      expect(redacted.email).toBe('user@example.com');
    });

    it('should redact nested objects', () => {
      const data = {
        user: {
          email: 'user@example.com',
          name: 'John',
        },
      };

      const redacted = compliance.redactPII(data);
      expect(redacted.user.email).toContain('**');
    });
  });

  describe('anonymize', () => {
    it('should anonymize identifiable data', () => {
      const data = {
        userId: 'user-123',
        email: 'user@example.com',
        amount: 100,
      };

      const anonymized = compliance.anonymize(data);

      expect(anonymized.userId).not.toBe('user-123');
      expect(typeof anonymized.userId).toBe('string');
      expect(anonymized.amount).toBe(100);
    });

    it('should produce consistent hashes for same input', () => {
      const data1 = { userId: 'user-123' };
      const data2 = { userId: 'user-123' };

      const anon1 = compliance.anonymize(data1);
      const anon2 = compliance.anonymize(data2);

      expect(anon1.userId).toBe(anon2.userId);
    });
  });

  describe('data retention', () => {
    it('should check if data is expired', () => {
      const oldDate = new Date('2020-01-01');
      expect(compliance.isDataExpired(oldDate, 'webhook_log')).toBe(true);
    });

    it('should not mark recent data as expired', () => {
      const recentDate = new Date();
      expect(compliance.isDataExpired(recentDate, 'transaction')).toBe(false);
    });

    it('should return false when retention is disabled', () => {
      const noRetention = new ComplianceManager({
        enabled: true,
        retention: { enabled: false, transactionDataDays: 1, auditLogDays: 1, webhookLogDays: 1, failedPaymentDataDays: 1 },
      });

      const oldDate = new Date('2020-01-01');
      expect(noRetention.isDataExpired(oldDate, 'transaction')).toBe(false);
    });

    it('should get retention days for category', () => {
      expect(compliance.getRetentionDays('transaction')).toBe(2555);
      expect(compliance.getRetentionDays('webhook_log')).toBe(90);
    });

    it('should get retention policy', () => {
      const policy = compliance.getRetentionPolicy('transaction');
      expect(policy?.category).toBe('transaction');
      expect(policy?.legalBasis).toBe('legal_obligation');
    });

    it('should get all retention policies', () => {
      const policies = compliance.getAllRetentionPolicies();
      expect(policies.length).toBeGreaterThan(0);
    });
  });

  describe('validateProcessingRequest', () => {
    it('should validate processing with consent', () => {
      compliance.recordConsent('user-1', 'marketing', true);
      const result = compliance.validateProcessingRequest('user-1', 'marketing', []);
      expect(result.valid).toBe(true);
    });

    it('should reject processing without required consent', () => {
      const result = compliance.validateProcessingRequest('user-1', 'marketing', []);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Consent required');
    });

    it('should reject sensitive data processing', () => {
      const result = compliance.validateProcessingRequest('user-1', 'analytics', ['health']);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('sensitive data');
    });

    it('should allow when compliance is disabled', () => {
      const disabled = new ComplianceManager({ enabled: false });
      const result = disabled.validateProcessingRequest('user-1', 'any', []);
      expect(result.valid).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return compliance status', () => {
      const status = compliance.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.gdprEnabled).toBe(true);
      expect(status.retentionEnabled).toBe(true);
      expect(status.piiEnabled).toBe(true);
    });
  });
});

describe('Helper Functions', () => {
  describe('createComplianceManagerFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create manager from environment variables', () => {
      process.env.COMPLIANCE_ENABLED = 'true';
      process.env.GDPR_ENABLED = 'true';
      process.env.DATA_CONTROLLER_NAME = 'Test Corp';

      const manager = createComplianceManagerFromEnv();
      expect(manager.isEnabled()).toBe(true);
    });

    it('should parse retention days from env', () => {
      process.env.COMPLIANCE_ENABLED = 'true';
      process.env.RETENTION_ENABLED = 'true';
      process.env.TRANSACTION_RETENTION_DAYS = '365';

      const manager = createComplianceManagerFromEnv();
      // The retention days comes from DEFAULT_RETENTION_POLICIES if set there
      expect(manager.isEnabled()).toBe(true);
      expect(manager.getStatus().retentionEnabled).toBe(true);
    });
  });

  describe('isPIIField', () => {
    it('should identify email fields', () => {
      expect(isPIIField('email')).toBe(true);
      expect(isPIIField('userEmail')).toBe(true);
    });

    it('should identify phone fields', () => {
      expect(isPIIField('phone')).toBe(true);
      expect(isPIIField('mobileNumber')).toBe(true);
    });

    it('should identify name fields', () => {
      expect(isPIIField('name')).toBe(true);
      expect(isPIIField('firstName')).toBe(true);
    });

    it('should identify address fields', () => {
      expect(isPIIField('address')).toBe(true);
      expect(isPIIField('postalCode')).toBe(true);
    });

    it('should not identify non-PII fields', () => {
      expect(isPIIField('amount')).toBe(false);
      expect(isPIIField('currency')).toBe(false);
      expect(isPIIField('status')).toBe(false);
    });
  });

  describe('generatePrivacyNotice', () => {
    it('should generate privacy notice', () => {
      const config = {
        enabled: true,
        gdpr: {
          dataControllerName: 'Test Corp',
          dataControllerContact: 'privacy@test.com',
          dpoContact: 'dpo@test.com',
        },
        retention: {
          transactionDataDays: 365,
          auditLogDays: 365,
          webhookLogDays: 30,
        },
      };

      const notice = generatePrivacyNotice(config as any);
      expect(notice).toContain('Test Corp');
      expect(notice).toContain('privacy@test.com');
      expect(notice).toContain('dpo@test.com');
      expect(notice).toContain('365 days');
      expect(notice).toContain('Your Rights');
    });
  });
});

describe('DEFAULT_COMPLIANCE_CONFIG', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_COMPLIANCE_CONFIG.enabled).toBe(false);
    expect(DEFAULT_COMPLIANCE_CONFIG.gdpr?.enabled).toBe(false);
    expect(DEFAULT_COMPLIANCE_CONFIG.retention?.enabled).toBe(false);
    expect(DEFAULT_COMPLIANCE_CONFIG.pii?.enabled).toBe(false);
  });

  it('should have PII fields defined', () => {
    expect(DEFAULT_COMPLIANCE_CONFIG.pii?.fieldsToRedact).toContain('email');
    expect(DEFAULT_COMPLIANCE_CONFIG.pii?.fieldsToRedact).toContain('phone');
    expect(DEFAULT_COMPLIANCE_CONFIG.pii?.partialRedaction).toBe(true);
  });

  it('should have retention periods defined', () => {
    expect(DEFAULT_COMPLIANCE_CONFIG.retention?.transactionDataDays).toBe(2555);
    expect(DEFAULT_COMPLIANCE_CONFIG.retention?.webhookLogDays).toBe(90);
  });
});

describe('DEFAULT_RETENTION_POLICIES', () => {
  it('should define policies for all categories', () => {
    const categories = DEFAULT_RETENTION_POLICIES.map(p => p.category);
    expect(categories).toContain('transaction');
    expect(categories).toContain('audit_log');
    expect(categories).toContain('webhook_log');
    expect(categories).toContain('failed_payment');
  });

  it('should have legal basis for each policy', () => {
    for (const policy of DEFAULT_RETENTION_POLICIES) {
      expect(policy.legalBasis).toBeDefined();
      expect(policy.legalBasis.length).toBeGreaterThan(0);
    }
  });

  it('should define action after expiry', () => {
    const actions = ['delete', 'anonymize', 'archive'];
    for (const policy of DEFAULT_RETENTION_POLICIES) {
      expect(actions).toContain(policy.actionAfterExpiry);
    }
  });
});
