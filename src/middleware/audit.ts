/**
 * Audit Logging Middleware for Africa Payments MCP
 * 
 * Logs all payment operations with tamper-proof storage.
 * Features:
 * - Who, what, when, where, result logging
 * - Append-only storage
 * - Export to JSON/CSV
 * - Retention policies
 * - Optional feature, disabled by default
 */

import { createHash, randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: {
    id: string;
    type: 'user' | 'system' | 'api' | 'webhook';
    ip?: string;
    userAgent?: string;
  };
  resource: {
    type: string;
    id: string;
  };
  details: {
    provider?: string;
    amount?: number;
    currency?: string;
    recipient?: string;
    status?: string;
    metadata?: Record<string, any>;
  };
  result: 'success' | 'failure' | 'pending';
  errorMessage?: string;
  previousHash?: string;
  hash: string;
  tenantId?: string;
}

export interface AuditConfig {
  enabled: boolean;
  storageType?: 'file' | 'memory' | 'custom';
  storagePath?: string;
  retentionDays?: number;
  maxEntries?: number;
  customStorage?: AuditStorage;
  hashChain?: boolean;
  redactSensitiveData?: boolean;
}

export interface AuditStorage {
  write(entry: AuditLogEntry): Promise<void>;
  read(filter?: AuditFilter): Promise<AuditLogEntry[]>;
  export(format: 'json' | 'csv', filter?: AuditFilter): Promise<string>;
}

export interface AuditFilter {
  startDate?: Date;
  endDate?: Date;
  action?: string;
  actorId?: string;
  tenantId?: string;
  result?: 'success' | 'failure' | 'pending';
  provider?: string;
}

// ============================================================================
// Audit Logger
// ============================================================================

export class AuditLogger {
  private config: AuditConfig;
  private storage: AuditStorage;
  private logger: Logger;
  private lastHash: string | null = null;
  private memoryEntries: AuditLogEntry[] = [];

  constructor(config: AuditConfig = { enabled: false }, parentLogger?: Logger) {
    this.config = {
      storageType: 'memory',
      retentionDays: 90,
      maxEntries: 100000,
      hashChain: true,
      redactSensitiveData: true,
      ...config,
    };
    this.logger = parentLogger || new Logger('info');
    this.storage = this.initializeStorage();
  }

  /**
   * Check if audit logging is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Log a payment operation
   */
  async log(params: {
    action: string;
    actor: {
      id: string;
      type: 'user' | 'system' | 'api' | 'webhook';
      ip?: string;
      userAgent?: string;
    };
    resource: {
      type: string;
      id: string;
    };
    details?: AuditLogEntry['details'];
    result: 'success' | 'failure' | 'pending';
    errorMessage?: string;
    tenantId?: string;
  }): Promise<AuditLogEntry | undefined> {
    if (!this.config.enabled) {
      return undefined;
    }

    const entry = this.createEntry(params);
    
    try {
      await this.storage.write(entry);
      this.logger.debug(`Audit log written: ${entry.id} - ${entry.action}`);
      return entry;
    } catch (error) {
      this.logger.error(`Failed to write audit log: ${error}`);
      // Don't throw - audit logging should not break operations
      return undefined;
    }
  }

  /**
   * Get audit log entries
   */
  async getEntries(filter?: AuditFilter): Promise<AuditLogEntry[]> {
    if (!this.config.enabled) {
      return [];
    }

    return this.storage.read(filter);
  }

  /**
   * Export audit logs to JSON
   */
  async exportToJSON(filter?: AuditFilter): Promise<string> {
    const entries = await this.getEntries(filter);
    return JSON.stringify(entries, null, 2);
  }

  /**
   * Export audit logs to CSV
   */
  async exportToCSV(filter?: AuditFilter): Promise<string> {
    const entries = await this.getEntries(filter);
    
    if (entries.length === 0) {
      return '';
    }

    const headers = [
      'id',
      'timestamp',
      'action',
      'actor_id',
      'actor_type',
      'actor_ip',
      'resource_type',
      'resource_id',
      'provider',
      'amount',
      'currency',
      'status',
      'result',
      'error_message',
      'tenant_id',
      'hash',
    ];

    const rows = entries.map(entry => [
      entry.id,
      entry.timestamp,
      entry.action,
      entry.actor.id,
      entry.actor.type,
      entry.actor.ip || '',
      entry.resource.type,
      entry.resource.id,
      entry.details.provider || '',
      entry.details.amount?.toString() || '',
      entry.details.currency || '',
      entry.details.status || '',
      entry.result,
      entry.errorMessage || '',
      entry.tenantId || '',
      entry.hash,
    ]);

    const escapeCSV = (value: string): string => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    return [
      headers.join(','),
      ...rows.map(row => row.map(escapeCSV).join(',')),
    ].join('\n');
  }

  /**
   * Verify hash chain integrity
   */
  async verifyIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    if (!this.config.enabled || !this.config.hashChain) {
      return { valid: true, errors: [] };
    }

    const entries = await this.getEntries();
    const errors: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      
      // Verify entry hash
      const computedHash = this.computeHash(entry);
      if (computedHash !== entry.hash) {
        errors.push(`Entry ${entry.id} has invalid hash`);
      }

      // Verify chain integrity (except for first entry)
      if (i > 0) {
        const previousEntry = entries[i - 1];
        if (entry.previousHash !== previousEntry.hash) {
          errors.push(`Entry ${entry.id} has broken chain link`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Clean up old entries based on retention policy
   */
  async applyRetentionPolicy(): Promise<number> {
    if (!this.config.enabled || !this.config.retentionDays) {
      return 0;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    if (this.config.storageType === 'memory') {
      const originalLength = this.memoryEntries.length;
      this.memoryEntries = this.memoryEntries.filter(
        entry => new Date(entry.timestamp) >= cutoffDate
      );
      const removedCount = originalLength - this.memoryEntries.length;
      
      if (removedCount > 0) {
        this.logger.info(`Audit log retention: removed ${removedCount} old entries`);
      }
      
      return removedCount;
    }

    // For file-based storage, implement rotation
    if (this.config.storageType === 'file' && this.config.storagePath) {
      // This would implement log rotation for file-based storage
      // For now, return 0 as the file storage implementation handles this differently
      return 0;
    }

    return 0;
  }

  /**
   * Get statistics about audit logs
   */
  async getStats(): Promise<{
    totalEntries: number;
    dateRange: { start: Date | null; end: Date | null };
    actions: Record<string, number>;
    actors: Record<string, number>;
    results: Record<string, number>;
  }> {
    if (!this.config.enabled) {
      return {
        totalEntries: 0,
        dateRange: { start: null, end: null },
        actions: {},
        actors: {},
        results: {},
      };
    }

    const entries = await this.getEntries();
    
    const actions: Record<string, number> = {};
    const actors: Record<string, number> = {};
    const results: Record<string, number> = {};

    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const entry of entries) {
      // Count actions
      actions[entry.action] = (actions[entry.action] || 0) + 1;
      
      // Count actors
      actors[entry.actor.id] = (actors[entry.actor.id] || 0) + 1;
      
      // Count results
      results[entry.result] = (results[entry.result] || 0) + 1;

      // Track date range
      const entryDate = new Date(entry.timestamp);
      if (!minDate || entryDate < minDate) minDate = entryDate;
      if (!maxDate || entryDate > maxDate) maxDate = entryDate;
    }

    return {
      totalEntries: entries.length,
      dateRange: { start: minDate, end: maxDate },
      actions,
      actors,
      results,
    };
  }

  /**
   * Clear all audit logs (use with caution)
   */
  async clear(): Promise<void> {
    if (this.config.storageType === 'memory') {
      this.memoryEntries = [];
      this.lastHash = null;
    }
    // For file/custom storage, this would need to be implemented in the storage layer
  }

  private initializeStorage(): AuditStorage {
    switch (this.config.storageType) {
      case 'file':
        return new FileAuditStorage(this.config.storagePath || './audit-logs', this.logger);
      case 'custom':
        if (!this.config.customStorage) {
          throw new Error('Custom storage not provided');
        }
        return this.config.customStorage;
      case 'memory':
      default:
        return {
          write: async (entry: AuditLogEntry) => {
            this.memoryEntries.push(entry);
            this.lastHash = entry.hash;
            
            // Apply retention if max entries reached
            if (this.config.maxEntries && this.memoryEntries.length > this.config.maxEntries) {
              this.memoryEntries = this.memoryEntries.slice(-this.config.maxEntries);
            }
          },
          read: async (filter?: AuditFilter) => {
            let entries = [...this.memoryEntries];
            
            if (filter) {
              entries = entries.filter(entry => this.matchesFilter(entry, filter));
            }
            
            return entries;
          },
          export: async (format: 'json' | 'csv', filter?: AuditFilter) => {
            if (format === 'json') {
              const entries = await this.getEntries(filter);
              return JSON.stringify(entries, null, 2);
            }
            // CSV handled separately
            return '';
          },
        };
    }
  }

  private createEntry(params: Parameters<AuditLogger['log']>[0]): AuditLogEntry {
    const entry: Omit<AuditLogEntry, 'hash'> = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: params.action,
      actor: {
        ...params.actor,
        ip: params.actor.ip ? this.redactIP(params.actor.ip) : undefined,
      },
      resource: params.resource,
      details: this.config.redactSensitiveData 
        ? this.redactSensitiveDetails(params.details || {})
        : params.details || {},
      result: params.result,
      errorMessage: params.errorMessage,
      previousHash: this.lastHash || undefined,
      tenantId: params.tenantId,
    };

    const hash = this.computeHash(entry as AuditLogEntry);
    
    return {
      ...entry,
      hash,
    };
  }

  private computeHash(entry: Omit<AuditLogEntry, 'hash'>): string {
    const data = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      action: entry.action,
      actor: entry.actor,
      resource: entry.resource,
      details: entry.details,
      result: entry.result,
      previousHash: entry.previousHash,
    });

    return createHash('sha256').update(data).digest('hex');
  }

  private matchesFilter(entry: AuditLogEntry, filter: AuditFilter): boolean {
    if (filter.startDate && new Date(entry.timestamp) < filter.startDate) return false;
    if (filter.endDate && new Date(entry.timestamp) > filter.endDate) return false;
    if (filter.action && entry.action !== filter.action) return false;
    if (filter.actorId && entry.actor.id !== filter.actorId) return false;
    if (filter.tenantId && entry.tenantId !== filter.tenantId) return false;
    if (filter.result && entry.result !== filter.result) return false;
    if (filter.provider && entry.details.provider !== filter.provider) return false;
    
    return true;
  }

  private redactIP(ip: string): string {
    // Redact last octet of IPv4 or last segment of IPv6
    if (ip.includes('.')) {
      const parts = ip.split('.');
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
    return ip;
  }

  private redactSensitiveDetails(details: AuditLogEntry['details']): AuditLogEntry['details'] {
    const redacted = { ...details };
    
    // Redact sensitive fields in metadata
    if (redacted.metadata) {
      const sensitiveFields = ['password', 'secret', 'token', 'apiKey', 'api_key', 'authorization'];
      for (const field of sensitiveFields) {
        if (field in redacted.metadata) {
          redacted.metadata[field] = '***REDACTED***';
        }
      }
    }

    return redacted;
  }
}

// ============================================================================
// File-based Audit Storage
// ============================================================================

class FileAuditStorage implements AuditStorage {
  private basePath: string;
  private logger: Logger;

  constructor(basePath: string, logger: Logger) {
    this.basePath = basePath;
    this.logger = logger;
    this.ensureDirectory();
  }

  async write(entry: AuditLogEntry): Promise<void> {
    const date = new Date(entry.timestamp);
    const fileName = this.getFileName(date);
    const filePath = path.join(this.basePath, fileName);

    const line = JSON.stringify(entry) + '\n';
    
    try {
      await fs.appendFile(filePath, line, 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to write audit log to file: ${error}`);
      throw error;
    }
  }

  async read(filter?: AuditFilter): Promise<AuditLogEntry[]> {
    const entries: AuditLogEntry[] = [];

    try {
      const files = await fs.readdir(this.basePath);
      const logFiles = files.filter(f => f.endsWith('.jsonl')).sort();

      for (const file of logFiles) {
        const filePath = path.join(this.basePath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        
        const lines = content.trim().split('\n').filter(Boolean);
        
        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as AuditLogEntry;
            
            if (!filter || this.matchesFilter(entry, filter)) {
              entries.push(entry);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to read audit logs: ${error}`);
    }

    return entries;
  }

  async export(format: 'json' | 'csv', filter?: AuditFilter): Promise<string> {
    const entries = await this.read(filter);

    if (format === 'json') {
      return JSON.stringify(entries, null, 2);
    }

    // Simple CSV export
    if (entries.length === 0) return '';

    const headers = Object.keys(entries[0]).join(',');
    const rows = entries.map(e => 
      Object.values(e).map(v => 
        typeof v === 'object' ? JSON.stringify(v) : String(v)
      ).join(',')
    );

    return [headers, ...rows].join('\n');
  }

  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create audit log directory: ${error}`);
    }
  }

  private getFileName(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `audit-${year}-${month}.jsonl`;
  }

  private matchesFilter(entry: AuditLogEntry, filter: AuditFilter): boolean {
    if (filter.startDate && new Date(entry.timestamp) < filter.startDate) return false;
    if (filter.endDate && new Date(entry.timestamp) > filter.endDate) return false;
    if (filter.action && entry.action !== filter.action) return false;
    if (filter.actorId && entry.actor.id !== filter.actorId) return false;
    if (filter.tenantId && entry.tenantId !== filter.tenantId) return false;
    if (filter.result && entry.result !== filter.result) return false;
    if (filter.provider && entry.details.provider !== filter.provider) return false;
    
    return true;
  }
}

// ============================================================================
// Middleware Factory
// ============================================================================

export interface AuditMiddlewareOptions {
  auditLogger: AuditLogger;
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
  sensitiveFields?: string[];
}

/**
 * Create audit logging middleware for Express-like frameworks
 */
export function createAuditMiddleware(options: AuditMiddlewareOptions) {
  const { auditLogger, includeRequestBody = false } = options;

  return async (req: any, res: any, next: any) => {
    if (!auditLogger.isEnabled()) {
      return next();
    }

    const startTime = Date.now();
    const actorId = req.user?.id || req.headers['x-api-key'] || 'anonymous';
    const actorType = req.user ? 'user' : req.headers['x-api-key'] ? 'api' : 'system';
    const tenantId = req.tenantId;

    // Capture response
    const originalEnd = res.end.bind(res);
    let responseBody: any;

    res.end = function(chunk: any, encoding?: any) {
      responseBody = chunk;
      return originalEnd(chunk, encoding);
    };

    res.on('finish', async () => {
      const duration = Date.now() - startTime;
      const result = res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failure';

      await auditLogger.log({
        action: `${req.method} ${req.path}`,
        actor: {
          id: actorId,
          type: actorType,
          ip: req.ip || req.connection?.remoteAddress,
          userAgent: req.headers['user-agent'],
        },
        resource: {
          type: 'http_request',
          id: req.requestId || randomUUID(),
        },
        details: {
          metadata: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            ...(includeRequestBody && { requestBody: req.body }),
          },
        },
        result,
        errorMessage: result === 'failure' ? `HTTP ${res.statusCode}` : undefined,
        tenantId,
      });
    });

    next();
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  enabled: false,
  storageType: 'memory',
  retentionDays: 90,
  maxEntries: 100000,
  hashChain: true,
  redactSensitiveData: true,
};
