/**
 * Role-Based Access Control (RBAC) for Africa Payments MCP
 * 
 * Provides role and permission management for payment operations.
 * Features:
 * - Roles: admin, operator, viewer
 * - Permissions: read, write, admin per provider
 * - Middleware to check permissions
 * - Optional feature, disabled by default
 */

// ============================================================================
// Types
// ============================================================================

export type Role = 'admin' | 'operator' | 'viewer' | 'custom';

export type Permission =
  // Provider-level permissions
  | 'provider:mpesa:read'
  | 'provider:mpesa:write'
  | 'provider:mpesa:admin'
  | 'provider:paystack:read'
  | 'provider:paystack:write'
  | 'provider:paystack:admin'
  | 'provider:intasend:read'
  | 'provider:intasend:write'
  | 'provider:intasend:admin'
  | 'provider:mtn_momo:read'
  | 'provider:mtn_momo:write'
  | 'provider:mtn_momo:admin'
  | 'provider:airtel_money:read'
  | 'provider:airtel_money:write'
  | 'provider:airtel_money:admin'
  // Generic provider permissions (applies to all providers)
  | 'provider:*:read'
  | 'provider:*:write'
  | 'provider:*:admin'
  // Operation-level permissions
  | 'payment:send'
  | 'payment:request'
  | 'payment:refund'
  | 'payment:verify'
  | 'transaction:read'
  | 'transaction:write'
  | 'webhook:manage'
  | 'config:read'
  | 'config:write';

export interface RBACUser {
  id: string;
  roles: Role[];
  customPermissions?: Permission[];
  tenantId?: string;
  metadata?: Record<string, any>;
}

export interface RBACConfig {
  enabled: boolean;
  defaultRoles?: Record<Role, Permission[]>;
  allowCustomRoles?: boolean;
  superAdminRole?: string;
}

export interface PermissionCheckOptions {
  requireAll?: boolean; // If true, user must have all specified permissions
  tenantScoped?: boolean; // If true, check tenant isolation
}

// ============================================================================
// Default Role Configurations
// ============================================================================

export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<Role, 'custom'>, Permission[]> = {
  admin: [
    'provider:*:admin',
    'provider:*:write',
    'provider:*:read',
    'payment:send',
    'payment:request',
    'payment:refund',
    'payment:verify',
    'transaction:read',
    'transaction:write',
    'webhook:manage',
    'config:read',
    'config:write',
  ],
  operator: [
    'provider:*:write',
    'provider:*:read',
    'payment:send',
    'payment:request',
    'payment:refund',
    'payment:verify',
    'transaction:read',
    'transaction:write',
    'config:read',
  ],
  viewer: [
    'provider:*:read',
    'payment:verify',
    'transaction:read',
    'config:read',
  ],
};

// ============================================================================
// RBAC Manager
// ============================================================================

export class RBACManager {
  private config: RBACConfig;
  private customRoles = new Map<string, Permission[]>();
  private userOverrides = new Map<string, RBACUser>();

  constructor(config: RBACConfig = { enabled: false }) {
    this.config = {
      enabled: false,
      defaultRoles: DEFAULT_ROLE_PERMISSIONS,
      allowCustomRoles: true,
      superAdminRole: 'admin',
      ...config,
    };
  }

  /**
   * Check if RBAC is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get permissions for a role
   */
  getRolePermissions(role: Role): Permission[] {
    if (role === 'custom') {
      return [];
    }
    
    return this.config.defaultRoles?.[role] || DEFAULT_ROLE_PERMISSIONS[role] || [];
  }

  /**
   * Get all permissions for a user (combining all roles)
   */
  getUserPermissions(user: RBACUser): Permission[] {
    const permissions = new Set<Permission>();

    for (const role of user.roles) {
      const rolePerms = this.getRolePermissions(role);
      for (const perm of rolePerms) {
        permissions.add(perm);
      }
    }

    // Add custom permissions
    if (user.customPermissions) {
      for (const perm of user.customPermissions) {
        permissions.add(perm);
      }
    }

    return Array.from(permissions);
  }

  /**
   * Check if user has a specific permission
   */
  hasPermission(user: RBACUser, permission: Permission): boolean {
    if (!this.config.enabled) {
      return true;
    }

    const userPermissions = this.getUserPermissions(user);

    // Check exact permission
    if (userPermissions.includes(permission)) {
      return true;
    }

    // Check wildcard permissions
    const wildcardPermissions = this.expandWildcardPermission(permission);
    for (const wildcard of wildcardPermissions) {
      if (userPermissions.includes(wildcard)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if user has all/any of the specified permissions
   */
  hasPermissions(
    user: RBACUser,
    permissions: Permission[],
    options: PermissionCheckOptions = {}
  ): boolean {
    if (!this.config.enabled) {
      return true;
    }

    const { requireAll = false } = options;

    if (requireAll) {
      return permissions.every(perm => this.hasPermission(user, perm));
    }

    return permissions.some(perm => this.hasPermission(user, perm));
  }

  /**
   * Check if user can access a provider
   */
  canAccessProvider(user: RBACUser, provider: string, action: 'read' | 'write' | 'admin' = 'read'): boolean {
    if (!this.config.enabled) {
      return true;
    }

    // Check specific provider permission
    const specificPerm = `provider:${provider}:${action}` as Permission;
    if (this.hasPermission(user, specificPerm)) {
      return true;
    }

    // Check wildcard permission
    const wildcardPerm = `provider:*:${action}` as Permission;
    if (this.hasPermission(user, wildcardPerm)) {
      return true;
    }

    return false;
  }

  /**
   * Check if user can perform a payment operation
   */
  canPerformOperation(user: RBACUser, operation: 'send' | 'request' | 'refund' | 'verify'): boolean {
    if (!this.config.enabled) {
      return true;
    }

    return this.hasPermission(user, `payment:${operation}` as Permission);
  }

  /**
   * Check if user is an admin
   */
  isAdmin(user: RBACUser): boolean {
    if (!this.config.enabled) {
      return true;
    }

    return user.roles.includes('admin');
  }

  /**
   * Register a custom role
   */
  registerCustomRole(roleName: string, permissions: Permission[]): boolean {
    if (!this.config.allowCustomRoles) {
      return false;
    }

    this.customRoles.set(roleName, permissions);
    return true;
  }

  /**
   * Unregister a custom role
   */
  unregisterCustomRole(roleName: string): boolean {
    return this.customRoles.delete(roleName);
  }

  /**
   * Set user override (bypass normal role checks)
   */
  setUserOverride(userId: string, user: RBACUser): void {
    this.userOverrides.set(userId, user);
  }

  /**
   * Remove user override
   */
  removeUserOverride(userId: string): boolean {
    return this.userOverrides.delete(userId);
  }

  /**
   * Get user with override applied
   */
  getEffectiveUser(user: RBACUser): RBACUser {
    const override = this.userOverrides.get(user.id);
    if (override) {
      return {
        ...user,
        ...override,
        roles: [...user.roles, ...override.roles],
        customPermissions: [
          ...(user.customPermissions || []),
          ...(override.customPermissions || []),
        ],
      };
    }
    return user;
  }

  /**
   * Validate if a user configuration is valid
   */
  validateUser(user: RBACUser): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!user.id) {
      errors.push('User ID is required');
    }

    if (!user.roles || user.roles.length === 0) {
      errors.push('At least one role is required');
    }

    for (const role of user.roles) {
      if (role !== 'custom' && !DEFAULT_ROLE_PERMISSIONS[role as Exclude<Role, 'custom'>]) {
        if (!this.customRoles.has(role)) {
          errors.push(`Unknown role: ${role}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get role descriptions
   */
  getRoleDescriptions(): Record<Role, { name: string; description: string; permissions: number }> {
    return {
      admin: {
        name: 'Administrator',
        description: 'Full access to all payment operations and configuration',
        permissions: DEFAULT_ROLE_PERMISSIONS.admin.length,
      },
      operator: {
        name: 'Operator',
        description: 'Can perform payment operations but cannot modify configuration',
        permissions: DEFAULT_ROLE_PERMISSIONS.operator.length,
      },
      viewer: {
        name: 'Viewer',
        description: 'Read-only access to transactions and configuration',
        permissions: DEFAULT_ROLE_PERMISSIONS.viewer.length,
      },
      custom: {
        name: 'Custom',
        description: 'Custom role with specific permissions',
        permissions: 0,
      },
    };
  }

  /**
   * Get permission description
   */
  getPermissionDescription(permission: Permission): { action: string; resource: string; level: string } {
    const parts = permission.split(':');
    
    if (parts.length === 3 && parts[0] === 'provider') {
      return {
        resource: parts[1] === '*' ? 'All Providers' : parts[1].toUpperCase(),
        action: parts[2],
        level: parts[2],
      };
    }

    return {
      resource: parts[0] || permission,
      action: parts[1] || 'access',
      level: 'standard',
    };
  }

  private expandWildcardPermission(permission: Permission): Permission[] {
    const parts = permission.split(':');
    const wildcards: Permission[] = [];

    // If permission is specific (e.g., provider:mpesa:read), check wildcard (provider:*:read)
    if (parts.length === 3 && parts[0] === 'provider' && parts[1] !== '*') {
      wildcards.push(`provider:*:${parts[2]}` as Permission);
    }

    return wildcards;
  }
}

// ============================================================================
// Permission Helper Functions
// ============================================================================

/**
 * Create permission string for provider access
 */
export function createProviderPermission(
  provider: string,
  action: 'read' | 'write' | 'admin'
): Permission {
  return `provider:${provider}:${action}` as Permission;
}

/**
 * Create a user object
 */
export function createUser(
  id: string,
  roles: Role | Role[],
  options: {
    customPermissions?: Permission[];
    tenantId?: string;
    metadata?: Record<string, any>;
  } = {}
): RBACUser {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  
  return {
    id,
    roles: roleArray,
    customPermissions: options.customPermissions,
    tenantId: options.tenantId,
    metadata: options.metadata,
  };
}

/**
 * Check permission middleware helper
 */
export function requirePermission(
  rbac: RBACManager,
  permission: Permission | Permission[],
  options: PermissionCheckOptions = {}
): (user: RBACUser) => boolean {
  return (user: RBACUser): boolean => {
    if (!rbac.isEnabled()) {
      return true;
    }

    const permissions = Array.isArray(permission) ? permission : [permission];
    return rbac.hasPermissions(user, permissions, options);
  };
}

/**
 * Require admin middleware helper
 */
export function requireAdmin(rbac: RBACManager): (user: RBACUser) => boolean {
  return (user: RBACUser): boolean => {
    if (!rbac.isEnabled()) {
      return true;
    }
    return rbac.isAdmin(user);
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_RBAC_CONFIG: RBACConfig = {
  enabled: false,
  defaultRoles: DEFAULT_ROLE_PERMISSIONS,
  allowCustomRoles: true,
  superAdminRole: 'admin',
};
