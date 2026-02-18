/**
 * Tests for Audit Logging
 */

import { 
  AuditLogger, 
  AuditConfig,
  AuditFilter,
  AuditLogEntry,
  DEFAULT_AUDIT_CONFIG,
} from '../../src/middleware/audit.js';
import { Logger } from '../../src/utils/logger.js';

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;

  afterEach(async () => {
    if (auditLogger) {
      await auditLogger.clear();
    }
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      auditLogger = new AuditLogger({ enabled: true });
      expect(auditLogger.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      auditLogger = new AuditLogger({ enabled: false });
      expect(auditLogger.isEnabled()).toBe(false);
    });
  });

  describe('log', () => {
    beforeEach(() => {
      auditLogger = new AuditLogger({ enabled: true, storageType: 'memory' });
    });

    it('should log a payment operation', async () => {
      const entry = await auditLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-1', type: 'user', ip: '192.168.1.1' },
        resource: { type: 'transaction', id: 'txn-123' },
        details: { provider: 'mpesa', amount: 1000, currency: 'KES' },
        result: 'success',
      });

      expect(entry).toBeDefined();
      expect(entry?.action).toBe('payment.initiate');
      expect(entry?.actor.id).toBe('user-1');
      expect(entry?.result).toBe('success');
      expect(entry?.hash).toBeDefined();
    });

    it('should include hash chain for tamper-proofing', async () => {
      const entry1 = await auditLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-1', type: 'user' },
        resource: { type: 'transaction', id: 'txn-1' },
        result: 'success',
      });

      const entry2 = await auditLogger.log({
        action: 'payment.complete',
        actor: { id: 'system', type: 'system' },
        resource: { type: 'transaction', id: 'txn-1' },
        result: 'success',
      });

      expect(entry2?.previousHash).toBe(entry1?.hash);
    });

    it('should return undefined when disabled', async () => {
      const disabledLogger = new AuditLogger({ enabled: false });
      const entry = await disabledLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-1', type: 'user' },
        resource: { type: 'transaction', id: 'txn-123' },
        result: 'success',
      });

      expect(entry).toBeUndefined();
    });

    it('should redact sensitive IP addresses', async () => {
      const entry = await auditLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-1', type: 'user', ip: '192.168.1.100' },
        resource: { type: 'transaction', id: 'txn-123' },
        result: 'success',
      });

      expect(entry?.actor.ip).toBe('192.168.1.xxx');
    });

    it('should redact sensitive metadata', async () => {
      const entry = await auditLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-1', type: 'user' },
        resource: { type: 'transaction', id: 'txn-123' },
        details: {
          metadata: {
            apiKey: 'secret-key-123',
            password: 'my-password',
            normalField: 'visible',
          },
        },
        result: 'success',
      });

      expect(entry?.details.metadata?.apiKey).toBe('***REDACTED***');
      expect(entry?.details.metadata?.password).toBe('***REDACTED***');
      expect(entry?.details.metadata?.normalField).toBe('visible');
    });

    it('should include tenant ID', async () => {
      const entry = await auditLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-1', type: 'user' },
        resource: { type: 'transaction', id: 'txn-123' },
        result: 'success',
        tenantId: 'tenant-1',
      });

      expect(entry?.tenantId).toBe('tenant-1');
    });

    it('should handle error messages', async () => {
      const entry = await auditLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-1', type: 'user' },
        resource: { type: 'transaction', id: 'txn-123' },
        result: 'failure',
        errorMessage: 'Insufficient funds',
      });

      expect(entry?.result).toBe('failure');
      expect(entry?.errorMessage).toBe('Insufficient funds');
    });
  });

  describe('getEntries', () => {
    beforeEach(async () => {
      auditLogger = new AuditLogger({ enabled: true, storageType: 'memory' });
      
      await auditLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-1', type: 'user' },
        resource: { type: 'transaction', id: 'txn-1' },
        result: 'success',
      });
      
      await auditLogger.log({
        action: 'payment.complete',
        actor: { id: 'user-2', type: 'user' },
        resource: { type: 'transaction', id: 'txn-2' },
        result: 'failure',
        tenantId: 'tenant-1',
      });
    });

    it('should return all entries', async () => {
      const entries = await auditLogger.getEntries();
      expect(entries).toHaveLength(2);
    });

    it('should filter by action', async () => {
      const entries = await auditLogger.getEntries({ action: 'payment.initiate' });
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('payment.initiate');
    });

    it('should filter by actor ID', async () => {
      const entries = await auditLogger.getEntries({ actorId: 'user-1' });
      expect(entries).toHaveLength(1);
      expect(entries[0].actor.id).toBe('user-1');
    });

    it('should filter by result', async () => {
      const entries = await auditLogger.getEntries({ result: 'failure' });
      expect(entries).toHaveLength(1);
      expect(entries[0].result).toBe('failure');
    });

    it('should filter by tenant ID', async () => {
      const entries = await auditLogger.getEntries({ tenantId: 'tenant-1' });
      expect(entries).toHaveLength(1);
      expect(entries[0].tenantId).toBe('tenant-1');
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const entries = await auditLogger.getEntries({
        startDate: yesterday,
        endDate: tomorrow,
      });

      expect(entries).toHaveLength(2);
    });

    it('should return empty array when disabled', async () => {
      const disabledLogger = new AuditLogger({ enabled: false });
      const entries = await disabledLogger.getEntries();
      expect(entries).toEqual([]);
    });
  });

  describe('exportToJSON', () => {
    beforeEach(async () => {
      auditLogger = new AuditLogger({ enabled: true, storageType: 'memory' });
      await auditLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-1', type: 'user' },
        resource: { type: 'transaction', id: 'txn-1' },
        result: 'success',
      });
    });

    it('should export entries to JSON', async () => {
      const json = await auditLogger.exportToJSON();
      const parsed = JSON.parse(json);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].action).toBe('payment.initiate');
    });

    it('should respect filter when exporting', async () => {
      await auditLogger.log({
        action: 'payment.complete',
        actor: { id: 'user-1', type: 'user' },
        resource: { type: 'transaction', id: 'txn-2' },
        result: 'success',
      });

      const json = await auditLogger.exportToJSON({ action: 'payment.initiate' });
      const parsed = JSON.parse(json);
      
      expect(parsed).toHaveLength(1);
      expect(parsed[0].action).toBe('payment.initiate');
    });
  });

  describe('exportToCSV', () => {
    beforeEach(async () => {
      auditLogger = new AuditLogger({ enabled: true, storageType: 'memory' });
      await auditLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-1', type: 'user', ip: '192.168.1.1' },
        resource: { type: 'transaction', id: 'txn-1' },
        details: { provider: 'mpesa', amount: 1000, currency: 'KES' },
        result: 'success',
        tenantId: 'tenant-1',
      });
    });

    it('should export entries to CSV', async () => {
      const csv = await auditLogger.exportToCSV();
      const lines = csv.split('\n');
      
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('action');
      expect(lines[0]).toContain('timestamp');
    });

    it('should include correct data in CSV', async () => {
      const csv = await auditLogger.exportToCSV();
      
      expect(csv).toContain('payment.initiate');
      expect(csv).toContain('user-1');
      expect(csv).toContain('mpesa');
      expect(csv).toContain('1000');
      expect(csv).toContain('KES');
    });

    it('should return empty string for no entries', async () => {
      const emptyLogger = new AuditLogger({ enabled: true, storageType: 'memory' });
      const csv = await emptyLogger.exportToCSV();
      expect(csv).toBe('');
    });
  });

  describe('verifyIntegrity', () => {
    beforeEach(async () => {
      auditLogger = new AuditLogger({ 
        enabled: true, 
        storageType: 'memory',
        hashChain: true,
      });
      
      await auditLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-1', type: 'user' },
        resource: { type: 'transaction', id: 'txn-1' },
        result: 'success',
      });
      
      await auditLogger.log({
        action: 'payment.complete',
        actor: { id: 'user-1', type: 'user' },
        resource: { type: 'transaction', id: 'txn-1' },
        result: 'success',
      });
    });

    it('should verify hash chain integrity', async () => {
      const result = await auditLogger.verifyIntegrity();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid when disabled', async () => {
      const disabledLogger = new AuditLogger({ enabled: false });
      const result = await disabledLogger.verifyIntegrity();
      
      expect(result.valid).toBe(true);
    });

    it('should return valid when hash chain is disabled', async () => {
      const noChainLogger = new AuditLogger({ 
        enabled: true, 
        hashChain: false,
      });
      const result = await noChainLogger.verifyIntegrity();
      
      expect(result.valid).toBe(true);
    });
  });

  describe('applyRetentionPolicy', () => {
    beforeEach(async () => {
      auditLogger = new AuditLogger({ 
        enabled: true, 
        storageType: 'memory',
        retentionDays: 30,
      });
    });

    it('should remove old entries', async () => {
      await auditLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-1', type: 'user' },
        resource: { type: 'transaction', id: 'txn-1' },
        result: 'success',
      });

      const removed = await auditLogger.applyRetentionPolicy();
      expect(typeof removed).toBe('number');
    });

    it('should return 0 when disabled', async () => {
      const disabledLogger = new AuditLogger({ enabled: false });
      const removed = await disabledLogger.applyRetentionPolicy();
      expect(removed).toBe(0);
    });

    it('should return 0 when no retention policy', async () => {
      const noRetentionLogger = new AuditLogger({ 
        enabled: true,
        storageType: 'memory',
      });
      const removed = await noRetentionLogger.applyRetentionPolicy();
      expect(removed).toBe(0);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      auditLogger = new AuditLogger({ enabled: true, storageType: 'memory' });
      
      await auditLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-1', type: 'user' },
        resource: { type: 'transaction', id: 'txn-1' },
        result: 'success',
      });
      
      await auditLogger.log({
        action: 'payment.complete',
        actor: { id: 'user-1', type: 'user' },
        resource: { type: 'transaction', id: 'txn-2' },
        result: 'failure',
      });
      
      await auditLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-2', type: 'user' },
        resource: { type: 'transaction', id: 'txn-3' },
        result: 'success',
      });
    });

    it('should return statistics', async () => {
      const stats = await auditLogger.getStats();
      
      expect(stats.totalEntries).toBe(3);
      expect(stats.actions['payment.initiate']).toBe(2);
      expect(stats.actions['payment.complete']).toBe(1);
      expect(stats.actors['user-1']).toBe(2);
      expect(stats.actors['user-2']).toBe(1);
      expect(stats.results['success']).toBe(2);
      expect(stats.results['failure']).toBe(1);
      expect(stats.dateRange.start).toBeInstanceOf(Date);
      expect(stats.dateRange.end).toBeInstanceOf(Date);
    });

    it('should return empty stats when disabled', async () => {
      const disabledLogger = new AuditLogger({ enabled: false });
      const stats = await disabledLogger.getStats();
      
      expect(stats.totalEntries).toBe(0);
      expect(stats.actions).toEqual({});
      expect(stats.actors).toEqual({});
      expect(stats.results).toEqual({});
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      auditLogger = new AuditLogger({ enabled: true, storageType: 'memory' });
      await auditLogger.log({
        action: 'payment.initiate',
        actor: { id: 'user-1', type: 'user' },
        resource: { type: 'transaction', id: 'txn-1' },
        result: 'success',
      });
    });

    it('should clear all entries', async () => {
      await auditLogger.clear();
      const entries = await auditLogger.getEntries();
      expect(entries).toHaveLength(0);
    });
  });
});

describe('DEFAULT_AUDIT_CONFIG', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_AUDIT_CONFIG.enabled).toBe(false);
    expect(DEFAULT_AUDIT_CONFIG.storageType).toBe('memory');
    expect(DEFAULT_AUDIT_CONFIG.retentionDays).toBe(90);
    expect(DEFAULT_AUDIT_CONFIG.maxEntries).toBe(100000);
    expect(DEFAULT_AUDIT_CONFIG.hashChain).toBe(true);
    expect(DEFAULT_AUDIT_CONFIG.redactSensitiveData).toBe(true);
  });
});
