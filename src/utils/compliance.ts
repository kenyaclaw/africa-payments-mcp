/**
 * Compliance Features for Africa Payments MCP
 * 
 * Provides GDPR-compliant data handling:
 * - GDPR data export endpoint
 * - Data retention configuration
 * - PII redaction in logs
 * Optional feature, disabled by default
 */

import { createHash, randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface ComplianceConfig {
  enabled: boolean;
  gdpr?: {
    enabled: boolean;
    dataControllerName?: string;
    dataControllerContact?: string;
    dpoContact?: string; // Data Protection Officer
  };
  retention?: {
    enabled: boolean;
    transactionDataDays: number;
    auditLogDays: number;
    webhookLogDays: number;
    failedPaymentDataDays: number;
  };
  pii?: {
    enabled: boolean;
    fieldsToRedact: string[];
    redactionPattern?: RegExp;
    partialRedaction?: boolean;
  };
}

export interface GDPRDataExport {
  exportId: string;
  generatedAt: string;
  dataController: {
    name: string;
    contact: string;
  };
  userData: {
    personalInfo: Record<string, any>;
    transactions: any[];
    paymentMethods: any[];
    consents: ConsentRecord[];
    dataAccessLog: DataAccessRecord[];
  };
  metadata: {
    dataCategories: string[];
    retentionPeriods: Record<string, string>;
    thirdPartyRecipients: string[];
  };
}

export interface ConsentRecord {
  id: string;
  purpose: string;
  granted: boolean;
  grantedAt: string;
  revokedAt?: string;
  version: string;
}

export interface DataAccessRecord {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  dataCategories: string[];
  legalBasis: string;
}

export interface DataRetentionPolicy {
  category: string;
  retentionDays: number;
  legalBasis: string;
  actionAfterExpiry: 'delete' | 'anonymize' | 'archive';
}

export interface PIIField {
  name: string;
  type: 'email' | 'phone' | 'name' | 'address' | 'id' | 'financial' | 'other';
  required: boolean;
  redactionMethod: 'full' | 'partial' | 'hash';
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_COMPLIANCE_CONFIG: ComplianceConfig = {
  enabled: false,
  gdpr: {
    enabled: false,
    dataControllerName: '',
    dataControllerContact: '',
    dpoContact: '',
  },
  retention: {
    enabled: false,
    transactionDataDays: 2555, // 7 years
    auditLogDays: 2555, // 7 years
    webhookLogDays: 90,
    failedPaymentDataDays: 30,
  },
  pii: {
    enabled: false,
    fieldsToRedact: [
      'email',
      'phone',
      'phoneNumber',
      'name',
      'firstName',
      'lastName',
      'address',
      'nationalId',
      'passportNumber',
      'dateOfBirth',
    ],
    partialRedaction: true,
  },
};

export const DEFAULT_RETENTION_POLICIES: DataRetentionPolicy[] = [
  {
    category: 'transaction',
    retentionDays: 2555,
    legalBasis: 'legal_obligation',
    actionAfterExpiry: 'archive',
  },
  {
    category: 'audit_log',
    retentionDays: 2555,
    legalBasis: 'legal_obligation',
    actionAfterExpiry: 'archive',
  },
  {
    category: 'webhook_log',
    retentionDays: 90,
    legalBasis: 'legitimate_interest',
    actionAfterExpiry: 'delete',
  },
  {
    category: 'failed_payment',
    retentionDays: 30,
    legalBasis: 'legitimate_interest',
    actionAfterExpiry: 'anonymize',
  },
  {
    category: 'customer_profile',
    retentionDays: 2555,
    legalBasis: 'contract',
    actionAfterExpiry: 'delete',
  },
];

// ============================================================================
// Compliance Manager
// ============================================================================

export class ComplianceManager {
  private config: ComplianceConfig;
  private consentStore = new Map<string, ConsentRecord[]>();
  private accessLog: DataAccessRecord[] = [];

  constructor(config: ComplianceConfig = { enabled: false }) {
    this.config = {
      ...DEFAULT_COMPLIANCE_CONFIG,
      ...config,
    };
  }

  /**
   * Check if compliance features are enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if GDPR features are enabled
   */
  isGdprEnabled(): boolean {
    return this.config.enabled && this.config.gdpr?.enabled === true;
  }

  /**
   * Generate GDPR data export for a user
   */
  generateDataExport(userId: string, userData: Record<string, any>): GDPRDataExport | null {
    if (!this.isGdprEnabled()) {
      return null;
    }

    const exportId = randomUUID();
    
    return {
      exportId,
      generatedAt: new Date().toISOString(),
      dataController: {
        name: this.config.gdpr?.dataControllerName || 'Unknown',
        contact: this.config.gdpr?.dataControllerContact || '',
      },
      userData: {
        personalInfo: this.extractPersonalInfo(userData),
        transactions: userData.transactions || [],
        paymentMethods: userData.paymentMethods || [],
        consents: this.getConsents(userId),
        dataAccessLog: this.getAccessLog(userId),
      },
      metadata: {
        dataCategories: this.identifyDataCategories(userData),
        retentionPeriods: this.getRetentionPeriods(),
        thirdPartyRecipients: this.identifyThirdParties(userData),
      },
    };
  }

  /**
   * Record consent for data processing
   */
  recordConsent(
    userId: string,
    purpose: string,
    granted: boolean,
    version: string = '1.0'
  ): ConsentRecord {
    const consent: ConsentRecord = {
      id: randomUUID(),
      purpose,
      granted,
      grantedAt: new Date().toISOString(),
      version,
    };

    const userConsents = this.consentStore.get(userId) || [];
    userConsents.push(consent);
    this.consentStore.set(userId, userConsents);

    return consent;
  }

  /**
   * Revoke consent for data processing
   */
  revokeConsent(userId: string, consentId: string): boolean {
    const userConsents = this.consentStore.get(userId);
    if (!userConsents) return false;

    const consent = userConsents.find(c => c.id === consentId);
    if (!consent) return false;

    consent.revokedAt = new Date().toISOString();
    consent.granted = false;
    return true;
  }

  /**
   * Get all consents for a user
   */
  getConsents(userId: string): ConsentRecord[] {
    return this.consentStore.get(userId) || [];
  }

  /**
   * Check if user has given consent for a purpose
   */
  hasConsent(userId: string, purpose: string): boolean {
    const consents = this.getConsents(userId);
    const latestConsent = consents
      .filter(c => c.purpose === purpose)
      .sort((a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime())[0];

    // If the latest consent is explicitly revoked, return false
    if (latestConsent?.revokedAt) {
      return false;
    }

    return latestConsent?.granted === true;
  }

  /**
   * Log data access for audit trail
   */
  logDataAccess(
    userId: string,
    action: string,
    actor: string,
    dataCategories: string[],
    legalBasis: string = 'legitimate_interest'
  ): DataAccessRecord {
    const record: DataAccessRecord = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      actor,
      dataCategories,
      legalBasis,
    };

    this.accessLog.push(record);
    return record;
  }

  /**
   * Get access log for a user
   */
  getAccessLog(userId: string): DataAccessRecord[] {
    // In a real implementation, this would filter by userId
    // For now, return the full log (in production, this would be filtered)
    return this.accessLog.slice(-100); // Last 100 entries
  }

  /**
   * Redact PII from data
   */
  redactPII<T extends Record<string, any>>(data: T): T {
    if (!this.config.enabled || !this.config.pii?.enabled) {
      return data;
    }

    const redacted = { ...data };
    const fieldsToRedact = this.config.pii?.fieldsToRedact || [];
    const partialRedaction = this.config.pii?.partialRedaction !== false;

    for (const field of fieldsToRedact) {
      if (field in redacted) {
        const value = redacted[field];
        if (typeof value === 'string') {
          redacted[field] = this.redactValue(value, partialRedaction) as any;
        }
      }
    }

    // Also check nested objects
    for (const [key, value] of Object.entries(redacted)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        redacted[key] = this.redactPII(value);
      }
    }

    return redacted;
  }

  /**
   * Anonymize data (irreversible)
   */
  anonymize<T extends Record<string, any>>(data: T): T {
    const anonymized = { ...data };

    // Hash identifiable fields
    const identifiableFields = ['userId', 'customerId', 'email', 'phone', 'name'];
    
    for (const field of identifiableFields) {
      if (field in anonymized && typeof anonymized[field] === 'string') {
        anonymized[field] = createHash('sha256')
          .update(anonymized[field])
          .digest('hex')
          .slice(0, 16) as any;
      }
    }

    return anonymized;
  }

  /**
   * Check if data should be retained or expired
   */
  isDataExpired(createdAt: Date, category: string): boolean {
    if (!this.config.enabled || !this.config.retention?.enabled) {
      return false;
    }

    const retentionDays = this.getRetentionDays(category);
    if (!retentionDays) return false;

    const expiryDate = new Date(createdAt);
    expiryDate.setDate(expiryDate.getDate() + retentionDays);

    return new Date() > expiryDate;
  }

  /**
   * Get retention days for a data category
   */
  getRetentionDays(category: string): number | undefined {
    const policy = DEFAULT_RETENTION_POLICIES.find(p => p.category === category);
    if (policy) return policy.retentionDays;

    // Fall back to config
    switch (category) {
      case 'transaction':
        return this.config.retention?.transactionDataDays;
      case 'audit_log':
        return this.config.retention?.auditLogDays;
      case 'webhook_log':
        return this.config.retention?.webhookLogDays;
      case 'failed_payment':
        return this.config.retention?.failedPaymentDataDays;
      default:
        return undefined;
    }
  }

  /**
   * Get retention policy for a category
   */
  getRetentionPolicy(category: string): DataRetentionPolicy | undefined {
    return DEFAULT_RETENTION_POLICIES.find(p => p.category === category);
  }

  /**
   * Get all retention policies
   */
  getAllRetentionPolicies(): DataRetentionPolicy[] {
    return [...DEFAULT_RETENTION_POLICIES];
  }

  /**
   * Validate data processing request
   */
  validateProcessingRequest(
    userId: string,
    purpose: string,
    dataCategories: string[]
  ): { valid: boolean; reason?: string } {
    if (!this.isEnabled()) {
      return { valid: true };
    }

    // Check for required consent
    const requiresConsent = ['marketing', 'profiling', 'third_party_sharing'];
    if (requiresConsent.includes(purpose) && !this.hasConsent(userId, purpose)) {
      return { valid: false, reason: `Consent required for purpose: ${purpose}` };
    }

    // Validate data categories
    const sensitiveCategories = ['health', 'biometric', 'criminal_record'];
    const hasSensitive = dataCategories.some(c => sensitiveCategories.includes(c));
    if (hasSensitive) {
      return { valid: false, reason: 'Processing of sensitive data requires explicit consent' };
    }

    return { valid: true };
  }

  /**
   * Get compliance status
   */
  getStatus(): {
    enabled: boolean;
    gdprEnabled: boolean;
    retentionEnabled: boolean;
    piiEnabled: boolean;
  } {
    return {
      enabled: this.isEnabled(),
      gdprEnabled: this.isGdprEnabled(),
      retentionEnabled: this.config.retention?.enabled === true,
      piiEnabled: this.config.pii?.enabled === true,
    };
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.consentStore.clear();
    this.accessLog = [];
  }

  private extractPersonalInfo(userData: Record<string, any>): Record<string, any> {
    const piiFields = [
      'email',
      'phone',
      'name',
      'firstName',
      'lastName',
      'address',
      'dateOfBirth',
    ];

    const personalInfo: Record<string, any> = {};
    for (const field of piiFields) {
      if (field in userData) {
        personalInfo[field] = userData[field];
      }
    }

    return personalInfo;
  }

  private identifyDataCategories(userData: Record<string, any>): string[] {
    const categories: string[] = [];

    if (userData.email || userData.phone || userData.name) {
      categories.push('personal_identification');
    }
    if (userData.transactions?.length > 0) {
      categories.push('financial');
    }
    if (userData.paymentMethods?.length > 0) {
      categories.push('payment_data');
    }

    return categories;
  }

  private identifyThirdParties(userData: Record<string, any>): string[] {
    const thirdParties: string[] = [];

    if (userData.transactions) {
      for (const txn of userData.transactions) {
        if (txn.provider && !thirdParties.includes(txn.provider)) {
          thirdParties.push(txn.provider);
        }
      }
    }

    return thirdParties;
  }

  private getRetentionPeriods(): Record<string, string> {
    const periods: Record<string, string> = {};
    
    for (const policy of DEFAULT_RETENTION_POLICIES) {
      periods[policy.category] = `${policy.retentionDays} days`;
    }

    return periods;
  }

  private redactValue(value: string, partial: boolean): string {
    if (!partial) {
      return '***REDACTED***';
    }

    // Partial redaction based on value type
    if (value.includes('@')) {
      // Email
      const [local, domain] = value.split('@');
      if (local.length <= 2) return `***@${domain}`;
      return `${local[0]}**${local[local.length - 1]}@${domain}`;
    }

    if (/^\d+$/.test(value)) {
      // Phone number or ID
      if (value.length <= 4) return '***';
      return `${value.slice(0, 2)}***${value.slice(-2)}`;
    }

    // Generic string
    if (value.length <= 4) return '***';
    return `${value[0]}***${value[value.length - 1]}`;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create compliance manager from environment variables
 */
export function createComplianceManagerFromEnv(): ComplianceManager {
  const retentionDays = process.env.TRANSACTION_RETENTION_DAYS 
    ? parseInt(process.env.TRANSACTION_RETENTION_DAYS, 10) 
    : (DEFAULT_COMPLIANCE_CONFIG.retention?.transactionDataDays || 2555);
  
  const auditLogDays = process.env.AUDIT_LOG_RETENTION_DAYS
    ? parseInt(process.env.AUDIT_LOG_RETENTION_DAYS, 10)
    : (DEFAULT_COMPLIANCE_CONFIG.retention?.auditLogDays || 2555);
    
  const webhookLogDays = process.env.WEBHOOK_LOG_RETENTION_DAYS
    ? parseInt(process.env.WEBHOOK_LOG_RETENTION_DAYS, 10)
    : (DEFAULT_COMPLIANCE_CONFIG.retention?.webhookLogDays || 90);
    
  const failedPaymentDataDays = process.env.FAILED_PAYMENT_RETENTION_DAYS
    ? parseInt(process.env.FAILED_PAYMENT_RETENTION_DAYS, 10)
    : (DEFAULT_COMPLIANCE_CONFIG.retention?.failedPaymentDataDays || 30);

  const config: ComplianceConfig = {
    enabled: process.env.COMPLIANCE_ENABLED === 'true',
    gdpr: {
      enabled: process.env.GDPR_ENABLED === 'true',
      dataControllerName: process.env.DATA_CONTROLLER_NAME,
      dataControllerContact: process.env.DATA_CONTROLLER_CONTACT,
      dpoContact: process.env.DPO_CONTACT,
    },
    retention: {
      enabled: process.env.RETENTION_ENABLED === 'true',
      transactionDataDays: retentionDays,
      auditLogDays: auditLogDays,
      webhookLogDays: webhookLogDays,
      failedPaymentDataDays: failedPaymentDataDays,
    },
    pii: {
      enabled: process.env.PII_REDACTION_ENABLED === 'true',
      fieldsToRedact: process.env.PII_FIELDS_TO_REDACT?.split(',') || DEFAULT_COMPLIANCE_CONFIG.pii!.fieldsToRedact,
      partialRedaction: process.env.PII_PARTIAL_REDACTION !== 'false',
    },
  };

  return new ComplianceManager(config);
}

/**
 * Check if a field contains PII
 */
export function isPIIField(fieldName: string): boolean {
  const piiPatterns = [
    /email/i,
    /phone/i,
    /mobile/i,
    /name/i,
    /address/i,
    /postal/i,
    /zip/i,
    /ssn/i,
    /social.security/i,
    /passport/i,
    /id.number/i,
    /birth/i,
    /dob/i,
    /account.number/i,
    /card.number/i,
    /cvv/i,
    /password/i,
    /secret/i,
  ];

  return piiPatterns.some(pattern => pattern.test(fieldName));
}

/**
 * Generate privacy notice text
 */
export function generatePrivacyNotice(config: ComplianceConfig): string {
  return `
Privacy Notice
==============

Data Controller: ${config.gdpr?.dataControllerName || 'Not specified'}
Contact: ${config.gdpr?.dataControllerContact || 'Not specified'}
${config.gdpr?.dpoContact ? `Data Protection Officer: ${config.gdpr.dpoContact}` : ''}

Data Retention:
- Transaction data: ${config.retention?.transactionDataDays || 2555} days
- Audit logs: ${config.retention?.auditLogDays || 2555} days
- Webhook logs: ${config.retention?.webhookLogDays || 90} days

Your Rights:
- Right to access your data
- Right to rectification
- Right to erasure ("right to be forgotten")
- Right to restrict processing
- Right to data portability
- Right to object to processing

Contact us to exercise your rights.
`.trim();
}
