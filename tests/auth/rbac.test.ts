/**
 * Tests for Role-Based Access Control (RBAC)
 */

import {
  RBACManager,
  RBACUser,
  Role,
  Permission,
  createUser,
  createProviderPermission,
  requirePermission,
  requireAdmin,
  DEFAULT_RBAC_CONFIG,
  DEFAULT_ROLE_PERMISSIONS,
} from '../../src/auth/rbac.js';

describe('RBACManager', () => {
  let rbac: RBACManager;

  beforeEach(() => {
    rbac = new RBACManager({ enabled: true });
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      rbac = new RBACManager({ enabled: true });
      expect(rbac.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      rbac = new RBACManager({ enabled: false });
      expect(rbac.isEnabled()).toBe(false);
    });
  });

  describe('getRolePermissions', () => {
    it('should return permissions for admin role', () => {
      const perms = rbac.getRolePermissions('admin');
      expect(perms.length).toBeGreaterThan(0);
      expect(perms).toContain('provider:*:admin');
    });

    it('should return permissions for operator role', () => {
      const perms = rbac.getRolePermissions('operator');
      expect(perms.length).toBeGreaterThan(0);
      expect(perms).toContain('provider:*:write');
      expect(perms).not.toContain('config:write');
    });

    it('should return permissions for viewer role', () => {
      const perms = rbac.getRolePermissions('viewer');
      expect(perms.length).toBeGreaterThan(0);
      expect(perms).toContain('provider:*:read');
      expect(perms).not.toContain('provider:*:write');
    });

    it('should return empty array for custom role', () => {
      const perms = rbac.getRolePermissions('custom');
      expect(perms).toEqual([]);
    });
  });

  describe('getUserPermissions', () => {
    it('should combine permissions from multiple roles', () => {
      const user = createUser('user-1', ['viewer', 'custom'], {
        customPermissions: ['payment:refund' as Permission],
      });
      
      const perms = rbac.getUserPermissions(user);
      
      expect(perms).toContain('provider:*:read');
      expect(perms).toContain('payment:refund');
    });

    it('should include custom permissions', () => {
      const user = createUser('user-1', 'viewer', {
        customPermissions: ['provider:mpesa:admin' as Permission],
      });
      
      const perms = rbac.getUserPermissions(user);
      
      expect(perms).toContain('provider:mpesa:admin');
    });

    it('should return empty array for user with no roles', () => {
      const user: RBACUser = { id: 'user-1', roles: [] };
      const perms = rbac.getUserPermissions(user);
      expect(perms).toEqual([]);
    });
  });

  describe('hasPermission', () => {
    it('should return true when user has permission', () => {
      const user = createUser('user-1', 'admin');
      expect(rbac.hasPermission(user, 'provider:mpesa:write')).toBe(true);
    });

    it('should return false when user does not have permission', () => {
      const user = createUser('user-1', 'viewer');
      expect(rbac.hasPermission(user, 'payment:send')).toBe(false);
    });

    it('should always return true when disabled', () => {
      const disabledRBAC = new RBACManager({ enabled: false });
      const user = createUser('user-1', 'viewer');
      expect(disabledRBAC.hasPermission(user, 'provider:*:admin')).toBe(true);
    });

    it('should match wildcard permissions', () => {
      const user = createUser('user-1', 'admin');
      expect(rbac.hasPermission(user, 'provider:mpesa:write')).toBe(true);
    });

    it('should handle specific provider permissions', () => {
      const user = createUser('user-1', 'custom', {
        customPermissions: ['provider:paystack:read'],
      });
      expect(rbac.hasPermission(user, 'provider:paystack:read')).toBe(true);
      expect(rbac.hasPermission(user, 'provider:mpesa:read')).toBe(false);
    });
  });

  describe('hasPermissions', () => {
    it('should return true when user has any permission (default)', () => {
      const user = createUser('user-1', 'operator');
      expect(rbac.hasPermissions(user, ['payment:send', 'config:write'])).toBe(true);
    });

    it('should return false when user has none of the permissions', () => {
      const user = createUser('user-1', 'viewer');
      expect(rbac.hasPermissions(user, ['payment:send', 'payment:refund'])).toBe(false);
    });

    it('should return true when user has all permissions (requireAll)', () => {
      const user = createUser('user-1', 'admin');
      expect(rbac.hasPermissions(user, ['payment:send', 'config:write'], { requireAll: true })).toBe(true);
    });

    it('should return false when user is missing one permission (requireAll)', () => {
      const user = createUser('user-1', 'operator');
      expect(rbac.hasPermissions(user, ['payment:send', 'config:write'], { requireAll: true })).toBe(false);
    });
  });

  describe('canAccessProvider', () => {
    it('should allow admin to access any provider', () => {
      const user = createUser('user-1', 'admin');
      expect(rbac.canAccessProvider(user, 'mpesa', 'admin')).toBe(true);
    });

    it('should allow operator to read provider', () => {
      const user = createUser('user-1', 'operator');
      expect(rbac.canAccessProvider(user, 'mpesa', 'read')).toBe(true);
    });

    it('should deny viewer admin access', () => {
      const user = createUser('user-1', 'viewer');
      expect(rbac.canAccessProvider(user, 'mpesa', 'admin')).toBe(false);
    });

    it('should handle wildcard permissions', () => {
      const user = createUser('user-1', 'operator');
      expect(rbac.canAccessProvider(user, 'any_provider', 'write')).toBe(true);
    });

    it('should always return true when disabled', () => {
      const disabledRBAC = new RBACManager({ enabled: false });
      const user = createUser('user-1', 'viewer');
      expect(disabledRBAC.canAccessProvider(user, 'mpesa', 'admin')).toBe(true);
    });
  });

  describe('canPerformOperation', () => {
    it('should allow admin to perform any operation', () => {
      const user = createUser('user-1', 'admin');
      expect(rbac.canPerformOperation(user, 'send')).toBe(true);
      expect(rbac.canPerformOperation(user, 'refund')).toBe(true);
    });

    it('should allow operator to send payments', () => {
      const user = createUser('user-1', 'operator');
      expect(rbac.canPerformOperation(user, 'send')).toBe(true);
    });

    it('should deny viewer to send payments', () => {
      const user = createUser('user-1', 'viewer');
      expect(rbac.canPerformOperation(user, 'send')).toBe(false);
    });

    it('should allow viewer to verify payments', () => {
      const user = createUser('user-1', 'viewer');
      expect(rbac.canPerformOperation(user, 'verify')).toBe(true);
    });
  });

  describe('isAdmin', () => {
    it('should return true for admin user', () => {
      const user = createUser('user-1', 'admin');
      expect(rbac.isAdmin(user)).toBe(true);
    });

    it('should return false for operator user', () => {
      const user = createUser('user-1', 'operator');
      expect(rbac.isAdmin(user)).toBe(false);
    });

    it('should always return true when disabled', () => {
      const disabledRBAC = new RBACManager({ enabled: false });
      const user = createUser('user-1', 'viewer');
      expect(disabledRBAC.isAdmin(user)).toBe(true);
    });
  });

  describe('registerCustomRole', () => {
    it('should register a custom role', () => {
      rbac.registerCustomRole('accountant', [
        'transaction:read' as Permission,
        'provider:*:read' as Permission,
      ]);
      
      const user = createUser('user-1', 'custom', {
        customPermissions: ['transaction:read', 'provider:*:read'],
      });
      expect(rbac.hasPermission(user, 'transaction:read')).toBe(true);
    });

    it('should return false when custom roles are disabled', () => {
      rbac = new RBACManager({ enabled: true, allowCustomRoles: false });
      const result = rbac.registerCustomRole('custom-role', []);
      expect(result).toBe(false);
    });
  });

  describe('user overrides', () => {
    it('should apply user override', () => {
      const user = createUser('user-1', 'viewer');
      rbac.setUserOverride('user-1', {
        id: 'user-1',
        roles: ['admin'],
      });
      
      const effectiveUser = rbac.getEffectiveUser(user);
      expect(effectiveUser.roles).toContain('admin');
      expect(effectiveUser.roles).toContain('viewer');
    });

    it('should remove user override', () => {
      rbac.setUserOverride('user-1', { id: 'user-1', roles: ['admin'] });
      expect(rbac.removeUserOverride('user-1')).toBe(true);
      expect(rbac.removeUserOverride('user-1')).toBe(false);
    });
  });

  describe('validateUser', () => {
    it('should validate a valid user', () => {
      const user = createUser('user-1', 'admin');
      const result = rbac.validateUser(user);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for user without ID', () => {
      const user: RBACUser = { id: '', roles: ['admin'] };
      const result = rbac.validateUser(user);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('User ID is required');
    });

    it('should return error for user without roles', () => {
      const user: RBACUser = { id: 'user-1', roles: [] };
      const result = rbac.validateUser(user);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one role is required');
    });

    it('should return error for unknown role', () => {
      const user = createUser('user-1', 'unknown_role' as Role);
      const result = rbac.validateUser(user);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown role: unknown_role');
    });
  });

  describe('getRoleDescriptions', () => {
    it('should return descriptions for all roles', () => {
      const descriptions = rbac.getRoleDescriptions();
      
      expect(descriptions.admin.name).toBe('Administrator');
      expect(descriptions.operator.name).toBe('Operator');
      expect(descriptions.viewer.name).toBe('Viewer');
      expect(descriptions.custom.name).toBe('Custom');
    });

    it('should include permission counts', () => {
      const descriptions = rbac.getRoleDescriptions();
      expect(descriptions.admin.permissions).toBeGreaterThan(descriptions.viewer.permissions);
    });
  });

  describe('getPermissionDescription', () => {
    it('should describe provider permissions', () => {
      const desc = rbac.getPermissionDescription('provider:mpesa:write');
      expect(desc.resource).toBe('MPESA');
      expect(desc.action).toBe('write');
    });

    it('should describe wildcard permissions', () => {
      const desc = rbac.getPermissionDescription('provider:*:read');
      expect(desc.resource).toBe('All Providers');
      expect(desc.action).toBe('read');
    });
  });
});

describe('Helper Functions', () => {
  describe('createUser', () => {
    it('should create user with single role', () => {
      const user = createUser('user-1', 'admin');
      expect(user.id).toBe('user-1');
      expect(user.roles).toEqual(['admin']);
    });

    it('should create user with multiple roles', () => {
      const user = createUser('user-1', ['viewer', 'custom']);
      expect(user.roles).toEqual(['viewer', 'custom']);
    });

    it('should include optional parameters', () => {
      const user = createUser('user-1', 'admin', {
        tenantId: 'tenant-1',
        metadata: { department: 'finance' },
      });
      expect(user.tenantId).toBe('tenant-1');
      expect(user.metadata?.department).toBe('finance');
    });
  });

  describe('createProviderPermission', () => {
    it('should create read permission', () => {
      const perm = createProviderPermission('mpesa', 'read');
      expect(perm).toBe('provider:mpesa:read');
    });

    it('should create write permission', () => {
      const perm = createProviderPermission('paystack', 'write');
      expect(perm).toBe('provider:paystack:write');
    });

    it('should create admin permission', () => {
      const perm = createProviderPermission('intasend', 'admin');
      expect(perm).toBe('provider:intasend:admin');
    });
  });

  describe('requirePermission', () => {
    it('should return true when user has permission', () => {
      const rbac = new RBACManager({ enabled: true });
      const check = requirePermission(rbac, 'payment:send');
      const user = createUser('user-1', 'operator');
      expect(check(user)).toBe(true);
    });

    it('should return false when user does not have permission', () => {
      const rbac = new RBACManager({ enabled: true });
      const check = requirePermission(rbac, 'config:write');
      const user = createUser('user-1', 'operator');
      expect(check(user)).toBe(false);
    });

    it('should always return true when rbac is disabled', () => {
      const rbac = new RBACManager({ enabled: false });
      const check = requirePermission(rbac, 'provider:*:admin');
      const user = createUser('user-1', 'viewer');
      expect(check(user)).toBe(true);
    });
  });

  describe('requireAdmin', () => {
    it('should return true for admin', () => {
      const rbac = new RBACManager({ enabled: true });
      const check = requireAdmin(rbac);
      const user = createUser('user-1', 'admin');
      expect(check(user)).toBe(true);
    });

    it('should return false for non-admin', () => {
      const rbac = new RBACManager({ enabled: true });
      const check = requireAdmin(rbac);
      const user = createUser('user-1', 'operator');
      expect(check(user)).toBe(false);
    });
  });
});

describe('DEFAULT_RBAC_CONFIG', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_RBAC_CONFIG.enabled).toBe(false);
    expect(DEFAULT_RBAC_CONFIG.allowCustomRoles).toBe(true);
    expect(DEFAULT_RBAC_CONFIG.superAdminRole).toBe('admin');
    expect(DEFAULT_RBAC_CONFIG.defaultRoles).toBeDefined();
  });
});

describe('DEFAULT_ROLE_PERMISSIONS', () => {
  it('should define admin permissions', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toContain('provider:*:admin');
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toContain('config:write');
  });

  it('should define operator permissions', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.operator).toContain('payment:send');
    expect(DEFAULT_ROLE_PERMISSIONS.operator).not.toContain('config:write');
  });

  it('should define viewer permissions', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.viewer).toContain('provider:*:read');
    expect(DEFAULT_ROLE_PERMISSIONS.viewer).not.toContain('payment:send');
  });

  it('admin should have more permissions than operator', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin.length).toBeGreaterThan(
      DEFAULT_ROLE_PERMISSIONS.operator.length
    );
  });

  it('operator should have more permissions than viewer', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.operator.length).toBeGreaterThan(
      DEFAULT_ROLE_PERMISSIONS.viewer.length
    );
  });
});
