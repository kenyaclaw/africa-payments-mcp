/**
 * Multi-tenant Support for Africa Payments MCP
 * 
 * Provides tenant isolation, configuration per tenant, and middleware.
 * All features are optional and disabled by default.
 */

import { ServerConfig, ProviderConfig } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface Tenant {
  id: string;
  name: string;
  config: ServerConfig;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantConfig {
  enabled: boolean;
  tenantIdHeader?: string;
  tenantIdJwtClaim?: string;
  defaultTenantId?: string;
  isolationLevel?: 'strict' | 'shared' | 'none';
  configSource?: 'inline' | 'file' | 'environment';
}

export interface TenantContext {
  tenantId: string;
  tenant: Tenant;
  permissions: string[];
}

// ============================================================================
// Tenant Manager
// ============================================================================

export class TenantManager {
  private tenants = new Map<string, Tenant>();
  private config: TenantConfig;

  constructor(config: TenantConfig = { enabled: false }) {
    this.config = {
      tenantIdHeader: 'x-tenant-id',
      tenantIdJwtClaim: 'tenant_id',
      isolationLevel: 'shared',
      configSource: 'inline',
      ...config,
    };
  }

  /**
   * Check if multi-tenancy is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Register a tenant with its configuration
   */
  registerTenant(tenant: Omit<Tenant, 'createdAt' | 'updatedAt'>): void {
    if (!this.config.enabled) {
      return;
    }

    const now = new Date();
    const fullTenant: Tenant = {
      ...tenant,
      createdAt: now,
      updatedAt: now,
    };

    this.tenants.set(tenant.id, fullTenant);
  }

  /**
   * Unregister a tenant
   */
  unregisterTenant(tenantId: string): boolean {
    return this.tenants.delete(tenantId);
  }

  /**
   * Get tenant by ID
   */
  getTenant(tenantId: string): Tenant | undefined {
    return this.tenants.get(tenantId);
  }

  /**
   * Get all registered tenants
   */
  getAllTenants(): Tenant[] {
    return Array.from(this.tenants.values());
  }

  /**
   * Check if tenant exists
   */
  hasTenant(tenantId: string): boolean {
    return this.tenants.has(tenantId);
  }

  /**
   * Update tenant configuration
   */
  updateTenantConfig(tenantId: string, config: Partial<ServerConfig>): boolean {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      return false;
    }

    tenant.config = this.mergeConfig(tenant.config, config);
    tenant.updatedAt = new Date();
    return true;
  }

  /**
   * Get provider config for a specific tenant
   */
  getTenantProviderConfig(tenantId: string, providerName: string): ProviderConfig | undefined {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      return undefined;
    }

    const providers = tenant.config.providers as Record<string, ProviderConfig>;
    return providers?.[providerName];
  }

  /**
   * Extract tenant ID from request headers
   */
  extractTenantIdFromHeaders(headers: Record<string, string | string[] | undefined>): string | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const headerValue = headers[this.config.tenantIdHeader!.toLowerCase()];
    if (typeof headerValue === 'string') {
      return headerValue;
    }
    if (Array.isArray(headerValue) && headerValue.length > 0) {
      return headerValue[0];
    }

    return this.config.defaultTenantId;
  }

  /**
   * Extract tenant ID from JWT payload
   */
  extractTenantIdFromJWT(payload: Record<string, any>): string | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    return payload[this.config.tenantIdJwtClaim!] || this.config.defaultTenantId;
  }

  /**
   * Validate tenant ID
   */
  validateTenantId(tenantId: string): boolean {
    if (!this.config.enabled) {
      return true;
    }

    // In strict mode, tenant must be registered
    if (this.config.isolationLevel === 'strict') {
      return this.tenants.has(tenantId);
    }

    // In shared/none mode, allow any valid tenant ID format
    return typeof tenantId === 'string' && tenantId.length > 0;
  }

  /**
   * Create tenant context
   */
  createContext(tenantId: string): TenantContext | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const tenant = this.tenants.get(tenantId);
    if (!tenant && this.config.isolationLevel === 'strict') {
      return undefined;
    }

    return {
      tenantId,
      tenant: tenant || this.createDefaultTenant(tenantId),
      permissions: [],
    };
  }

  /**
   * Get tenant count
   */
  getTenantCount(): number {
    return this.tenants.size;
  }

  /**
   * Clear all tenants (mainly for testing)
   */
  clear(): void {
    this.tenants.clear();
  }

  private mergeConfig(existing: ServerConfig, updates: Partial<ServerConfig>): ServerConfig {
    return {
      ...existing,
      ...updates,
      providers: {
        ...existing.providers,
        ...updates.providers,
      },
      defaults: {
        ...existing.defaults,
        ...updates.defaults,
      },
      server: {
        ...existing.server,
        ...updates.server,
      },
    };
  }

  private createDefaultTenant(tenantId: string): Tenant {
    return {
      id: tenantId,
      name: `Tenant ${tenantId}`,
      config: {} as ServerConfig,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

// ============================================================================
// Tenant Configuration Loader
// ============================================================================

import fs from 'fs/promises';
import path from 'path';

export interface TenantLoaderOptions {
  configPath?: string;
  environmentPrefix?: string;
}

export class TenantConfigLoader {
  private options: TenantLoaderOptions;

  constructor(options: TenantLoaderOptions = {}) {
    this.options = {
      configPath: './tenants',
      environmentPrefix: 'TENANT_',
      ...options,
    };
  }

  /**
   * Load tenant configurations from files
   */
  async loadFromFiles(): Promise<Omit<Tenant, 'createdAt' | 'updatedAt'>[]> {
    const tenants: Omit<Tenant, 'createdAt' | 'updatedAt'>[] = [];
    
    try {
      const files = await fs.readdir(this.options.configPath!);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const tenantId = path.basename(file, '.json');
          const filePath = path.join(this.options.configPath!, file);
          
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const config = JSON.parse(content);
            
            tenants.push({
              id: tenantId,
              name: config.name || tenantId,
              config: config.serverConfig || config,
              metadata: config.metadata,
            });
          } catch (error) {
            console.error(`Failed to load tenant config from ${filePath}:`, error);
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
      console.warn(`Could not load tenant configs from ${this.options.configPath}:`, error);
    }

    return tenants;
  }

  /**
   * Load tenant configurations from environment variables
   * Format: TENANT_<TENANT_ID>_CONFIG=<json_config>
   */
  loadFromEnvironment(): Omit<Tenant, 'createdAt' | 'updatedAt'>[] {
    const tenants: Omit<Tenant, 'createdAt' | 'updatedAt'>[] = [];
    const prefix = this.options.environmentPrefix!;

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix) && key.endsWith('_CONFIG')) {
        const tenantId = key.slice(prefix.length, -7).toLowerCase();
        
        try {
          if (value) {
            const config = JSON.parse(value);
            tenants.push({
              id: tenantId,
              name: config.name || tenantId,
              config: config.serverConfig || config,
              metadata: config.metadata,
            });
          }
        } catch (error) {
          console.error(`Failed to parse tenant config from env var ${key}:`, error);
        }
      }
    }

    return tenants;
  }

  /**
   * Load inline tenant configurations
   */
  loadInline(tenantsConfig: Record<string, { name: string; config: ServerConfig; metadata?: Record<string, any> }>): Omit<Tenant, 'createdAt' | 'updatedAt'>[] {
    return Object.entries(tenantsConfig).map(([id, data]) => ({
      id,
      name: data.name,
      config: data.config,
      metadata: data.metadata,
    }));
  }
}

// ============================================================================
// Tenant Isolation Utilities
// ============================================================================

export class TenantIsolation {
  /**
   * Check if operation is allowed for tenant
   */
  static isOperationAllowed(
    tenantId: string,
    resourceTenantId: string,
    isolationLevel: 'strict' | 'shared' | 'none' = 'shared'
  ): boolean {
    switch (isolationLevel) {
      case 'strict':
        return tenantId === resourceTenantId;
      case 'shared':
        // Allow access to shared resources or own resources
        return resourceTenantId === 'shared' || tenantId === resourceTenantId;
      case 'none':
        return true;
      default:
        return false;
    }
  }

  /**
   * Sanitize data for tenant context
   * Removes sensitive fields that belong to other tenants
   */
  static sanitizeForTenant<T extends Record<string, any>>(
    data: T,
    tenantId: string,
    tenantField: string = 'tenantId'
  ): Partial<T> | null {
    if (!data) return null;

    const dataTenantId = data[tenantField];
    
    // If data has no tenant ID, it's public/shared
    if (!dataTenantId) {
      return data;
    }

    // If data belongs to this tenant, return full data
    if (dataTenantId === tenantId) {
      return data;
    }

    // Data belongs to another tenant - return null (no access)
    return null;
  }

  /**
   * Add tenant isolation to query
   */
  static addTenantFilter<T extends Record<string, any>>(
    query: T,
    tenantId: string,
    tenantField: string = 'tenantId'
  ): T {
    return {
      ...query,
      [tenantField]: tenantId,
    };
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_TENANT_CONFIG: TenantConfig = {
  enabled: false,
  tenantIdHeader: 'x-tenant-id',
  tenantIdJwtClaim: 'tenant_id',
  isolationLevel: 'shared',
  configSource: 'inline',
};
