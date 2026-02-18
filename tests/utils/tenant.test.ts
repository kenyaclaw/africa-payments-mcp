/**
 * Tests for Tenant Management
 */

import { 
  TenantManager, 
  TenantConfigLoader, 
  TenantIsolation,
  DEFAULT_TENANT_CONFIG,
  TenantConfig,
} from '../../src/utils/tenant.js';
import { ServerConfig } from '../../src/types/index.js';

const mockConfig: ServerConfig = {
  providers: {},
  defaults: { currency: 'KES', country: 'KE' },
  server: { logLevel: 'info' },
};

describe('TenantManager', () => {
  let manager: TenantManager;

  beforeEach(() => {
    manager = new TenantManager({ enabled: true });
  });

  afterEach(() => {
    manager.clear();
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      expect(manager.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const disabledManager = new TenantManager({ enabled: false });
      expect(disabledManager.isEnabled()).toBe(false);
    });
  });

  describe('registerTenant', () => {
    it('should register a tenant', () => {
      manager.registerTenant({
        id: 'tenant-1',
        name: 'Test Tenant',
        config: mockConfig,
      });

      expect(manager.hasTenant('tenant-1')).toBe(true);
      expect(manager.getTenantCount()).toBe(1);
    });

    it('should not register tenant when multi-tenancy is disabled', () => {
      const disabledManager = new TenantManager({ enabled: false });
      disabledManager.registerTenant({
        id: 'tenant-1',
        name: 'Test Tenant',
        config: mockConfig,
      });

      expect(disabledManager.hasTenant('tenant-1')).toBe(false);
    });

    it('should allow registering multiple tenants', () => {
      manager.registerTenant({
        id: 'tenant-1',
        name: 'Tenant 1',
        config: mockConfig,
      });
      manager.registerTenant({
        id: 'tenant-2',
        name: 'Tenant 2',
        config: mockConfig,
      });

      expect(manager.getTenantCount()).toBe(2);
    });
  });

  describe('unregisterTenant', () => {
    it('should unregister a tenant', () => {
      manager.registerTenant({
        id: 'tenant-1',
        name: 'Test Tenant',
        config: mockConfig,
      });

      const result = manager.unregisterTenant('tenant-1');
      
      expect(result).toBe(true);
      expect(manager.hasTenant('tenant-1')).toBe(false);
    });

    it('should return false for non-existent tenant', () => {
      const result = manager.unregisterTenant('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getTenant', () => {
    it('should return tenant by ID', () => {
      manager.registerTenant({
        id: 'tenant-1',
        name: 'Test Tenant',
        config: mockConfig,
      });

      const tenant = manager.getTenant('tenant-1');
      
      expect(tenant).toBeDefined();
      expect(tenant?.id).toBe('tenant-1');
      expect(tenant?.name).toBe('Test Tenant');
    });

    it('should return undefined for unknown tenant', () => {
      const tenant = manager.getTenant('unknown');
      expect(tenant).toBeUndefined();
    });
  });

  describe('getAllTenants', () => {
    it('should return all registered tenants', () => {
      manager.registerTenant({
        id: 'tenant-1',
        name: 'Tenant 1',
        config: mockConfig,
      });
      manager.registerTenant({
        id: 'tenant-2',
        name: 'Tenant 2',
        config: mockConfig,
      });

      const tenants = manager.getAllTenants();
      
      expect(tenants).toHaveLength(2);
      expect(tenants.map(t => t.id)).toContain('tenant-1');
      expect(tenants.map(t => t.id)).toContain('tenant-2');
    });
  });

  describe('updateTenantConfig', () => {
    it('should update tenant configuration', () => {
      manager.registerTenant({
        id: 'tenant-1',
        name: 'Test Tenant',
        config: mockConfig,
      });

      const updated = manager.updateTenantConfig('tenant-1', {
        defaults: { currency: 'USD', country: 'US' },
      });

      expect(updated).toBe(true);
      const tenant = manager.getTenant('tenant-1');
      expect(tenant?.config.defaults.currency).toBe('USD');
      expect(tenant?.config.defaults.country).toBe('US');
    });

    it('should return false for unknown tenant', () => {
      const result = manager.updateTenantConfig('unknown', {});
      expect(result).toBe(false);
    });
  });

  describe('getTenantProviderConfig', () => {
    it('should return provider config for tenant', () => {
      const configWithProvider: ServerConfig = {
        ...mockConfig,
        providers: {
          mpesa: {
            enabled: true,
            environment: 'sandbox',
            consumerKey: 'test-key',
            consumerSecret: 'test-secret',
            passkey: 'test-passkey',
            shortCode: '174379',
          },
        },
      };

      manager.registerTenant({
        id: 'tenant-1',
        name: 'Test Tenant',
        config: configWithProvider,
      });

      const providerConfig = manager.getTenantProviderConfig('tenant-1', 'mpesa');
      
      expect(providerConfig).toBeDefined();
      expect(providerConfig?.enabled).toBe(true);
    });

    it('should return undefined for unknown tenant', () => {
      const config = manager.getTenantProviderConfig('unknown', 'mpesa');
      expect(config).toBeUndefined();
    });
  });

  describe('extractTenantIdFromHeaders', () => {
    it('should extract tenant ID from header', () => {
      const headers = { 'x-tenant-id': 'tenant-1' };
      const tenantId = manager.extractTenantIdFromHeaders(headers);
      expect(tenantId).toBe('tenant-1');
    });

    it('should handle array header values', () => {
      const headers = { 'x-tenant-id': ['tenant-1', 'tenant-2'] };
      const tenantId = manager.extractTenantIdFromHeaders(headers);
      expect(tenantId).toBe('tenant-1');
    });

    it('should return default tenant ID when header is missing', () => {
      const managerWithDefault = new TenantManager({ 
        enabled: true, 
        defaultTenantId: 'default-tenant' 
      });
      const headers = {};
      const tenantId = managerWithDefault.extractTenantIdFromHeaders(headers);
      expect(tenantId).toBe('default-tenant');
    });

    it('should return undefined when disabled', () => {
      const disabledManager = new TenantManager({ enabled: false });
      const headers = { 'x-tenant-id': 'tenant-1' };
      const tenantId = disabledManager.extractTenantIdFromHeaders(headers);
      expect(tenantId).toBeUndefined();
    });
  });

  describe('extractTenantIdFromJWT', () => {
    it('should extract tenant ID from JWT payload', () => {
      const payload = { tenant_id: 'tenant-1', sub: 'user-1' };
      const tenantId = manager.extractTenantIdFromJWT(payload);
      expect(tenantId).toBe('tenant-1');
    });

    it('should return default tenant ID when claim is missing', () => {
      const managerWithDefault = new TenantManager({ 
        enabled: true, 
        defaultTenantId: 'default-tenant' 
      });
      const payload = { sub: 'user-1' };
      const tenantId = managerWithDefault.extractTenantIdFromJWT(payload);
      expect(tenantId).toBe('default-tenant');
    });
  });

  describe('validateTenantId', () => {
    it('should return true for registered tenant in strict mode', () => {
      const strictManager = new TenantManager({ 
        enabled: true, 
        isolationLevel: 'strict' 
      });
      strictManager.registerTenant({
        id: 'tenant-1',
        name: 'Test Tenant',
        config: mockConfig,
      });

      expect(strictManager.validateTenantId('tenant-1')).toBe(true);
    });

    it('should return false for unregistered tenant in strict mode', () => {
      const strictManager = new TenantManager({ 
        enabled: true, 
        isolationLevel: 'strict' 
      });

      expect(strictManager.validateTenantId('unregistered')).toBe(false);
    });

    it('should return true for any valid tenant ID in shared mode', () => {
      const sharedManager = new TenantManager({ 
        enabled: true, 
        isolationLevel: 'shared' 
      });

      expect(sharedManager.validateTenantId('any-tenant')).toBe(true);
    });

    it('should always return true when disabled', () => {
      const disabledManager = new TenantManager({ enabled: false });
      expect(disabledManager.validateTenantId('any')).toBe(true);
    });
  });

  describe('createContext', () => {
    it('should create context for registered tenant', () => {
      manager.registerTenant({
        id: 'tenant-1',
        name: 'Test Tenant',
        config: mockConfig,
      });

      const context = manager.createContext('tenant-1');
      
      expect(context).toBeDefined();
      expect(context?.tenantId).toBe('tenant-1');
      expect(context?.tenant.name).toBe('Test Tenant');
    });

    it('should return undefined for unknown tenant in strict mode', () => {
      const strictManager = new TenantManager({ 
        enabled: true, 
        isolationLevel: 'strict' 
      });

      const context = strictManager.createContext('unknown');
      expect(context).toBeUndefined();
    });

    it('should return undefined when disabled', () => {
      const disabledManager = new TenantManager({ enabled: false });
      const context = disabledManager.createContext('tenant-1');
      expect(context).toBeUndefined();
    });
  });
});

describe('TenantConfigLoader', () => {
  describe('loadFromEnvironment', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should load tenant configs from environment', () => {
      process.env.TENANT_TENANT1_CONFIG = JSON.stringify({
        name: 'Tenant 1',
        serverConfig: { providers: {}, defaults: {}, server: {} },
      });

      const loader = new TenantConfigLoader();
      const tenants = loader.loadFromEnvironment();

      expect(tenants).toHaveLength(1);
      expect(tenants[0].id).toBe('tenant1');
      expect(tenants[0].name).toBe('Tenant 1');
    });

    it('should handle multiple tenant configs', () => {
      process.env.TENANT_TENANT1_CONFIG = JSON.stringify({
        name: 'Tenant 1',
        serverConfig: mockConfig,
      });
      process.env.TENANT_TENANT2_CONFIG = JSON.stringify({
        name: 'Tenant 2',
        serverConfig: mockConfig,
      });

      const loader = new TenantConfigLoader();
      const tenants = loader.loadFromEnvironment();

      expect(tenants).toHaveLength(2);
    });

    it('should skip invalid JSON configs', () => {
      process.env.TENANT_INVALID_CONFIG = 'not-valid-json';

      const loader = new TenantConfigLoader();
      const tenants = loader.loadFromEnvironment();

      expect(tenants).toHaveLength(0);
    });
  });

  describe('loadInline', () => {
    it('should load inline tenant configs', () => {
      const loader = new TenantConfigLoader();
      const config = {
        'tenant-1': {
          name: 'Tenant 1',
          config: mockConfig,
        },
        'tenant-2': {
          name: 'Tenant 2',
          config: mockConfig,
          metadata: { region: 'us-east' },
        },
      };

      const tenants = loader.loadInline(config);

      expect(tenants).toHaveLength(2);
      expect(tenants[0].id).toBe('tenant-1');
      expect(tenants[1].metadata?.region).toBe('us-east');
    });
  });
});

describe('TenantIsolation', () => {
  describe('isOperationAllowed', () => {
    it('should allow own resources in strict mode', () => {
      const allowed = TenantIsolation.isOperationAllowed('tenant-1', 'tenant-1', 'strict');
      expect(allowed).toBe(true);
    });

    it('should deny other resources in strict mode', () => {
      const allowed = TenantIsolation.isOperationAllowed('tenant-1', 'tenant-2', 'strict');
      expect(allowed).toBe(false);
    });

    it('should allow shared resources in shared mode', () => {
      const allowed = TenantIsolation.isOperationAllowed('tenant-1', 'shared', 'shared');
      expect(allowed).toBe(true);
    });

    it('should allow everything in none mode', () => {
      const allowed = TenantIsolation.isOperationAllowed('tenant-1', 'tenant-2', 'none');
      expect(allowed).toBe(true);
    });
  });

  describe('sanitizeForTenant', () => {
    it('should return full data for own resources', () => {
      const data = { id: '1', tenantId: 'tenant-1', name: 'Resource' };
      const result = TenantIsolation.sanitizeForTenant(data, 'tenant-1');
      
      expect(result).toEqual(data);
    });

    it('should return null for other tenant resources', () => {
      const data = { id: '1', tenantId: 'tenant-2', name: 'Resource' };
      const result = TenantIsolation.sanitizeForTenant(data, 'tenant-1');
      
      expect(result).toBeNull();
    });

    it('should return public data when no tenant ID', () => {
      const data = { id: '1', name: 'Public Resource' };
      const result = TenantIsolation.sanitizeForTenant(data, 'tenant-1');
      
      expect(result).toEqual(data);
    });

    it('should handle custom tenant field', () => {
      const data = { id: '1', orgId: 'org-1', name: 'Resource' };
      const result = TenantIsolation.sanitizeForTenant(data, 'org-1', 'orgId');
      
      expect(result).toEqual(data);
    });
  });

  describe('addTenantFilter', () => {
    it('should add tenant ID to query', () => {
      const query = { status: 'active' };
      const result = TenantIsolation.addTenantFilter(query, 'tenant-1');
      
      expect(result).toEqual({ status: 'active', tenantId: 'tenant-1' });
    });

    it('should support custom tenant field', () => {
      const query = { status: 'active' };
      const result = TenantIsolation.addTenantFilter(query, 'tenant-1', 'organizationId');
      
      expect(result).toEqual({ status: 'active', organizationId: 'tenant-1' });
    });
  });
});

describe('DEFAULT_TENANT_CONFIG', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_TENANT_CONFIG.enabled).toBe(false);
    expect(DEFAULT_TENANT_CONFIG.tenantIdHeader).toBe('x-tenant-id');
    expect(DEFAULT_TENANT_CONFIG.tenantIdJwtClaim).toBe('tenant_id');
    expect(DEFAULT_TENANT_CONFIG.isolationLevel).toBe('shared');
    expect(DEFAULT_TENANT_CONFIG.configSource).toBe('inline');
  });
});
