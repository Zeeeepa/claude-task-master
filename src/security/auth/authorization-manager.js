/**
 * Unified Authorization Manager
 * 
 * Provides Role-Based Access Control (RBAC) and permission management.
 * Consolidates authorization logic from multiple implementations.
 */

import { EventEmitter } from 'events';

export class AuthorizationManager extends EventEmitter {
    constructor(config, authenticationManager, auditLogger) {
        super();
        
        this.config = config;
        this.authenticationManager = authenticationManager;
        this.auditLogger = auditLogger;
        
        // Role and permission storage
        this.roles = new Map();
        this.permissions = new Map();
        this.userRoles = new Map();
        this.rolePermissions = new Map();
        
        // Permission cache for performance
        this.permissionCache = new Map();
        this.cacheEnabled = config.rbac?.cachePermissions !== false;
        this.cacheTTL = config.rbac?.cacheTTL || 300000; // 5 minutes
        
        this.initialized = false;
    }

    /**
     * Initialize authorization manager
     */
    async initialize() {
        try {
            // Load default roles and permissions
            await this._loadDefaultRoles();
            await this._loadDefaultPermissions();
            
            this.initialized = true;
            this.emit('initialized');
            
            if (this.auditLogger) {
                await this.auditLogger.logSecurityEvent('AUTHZ_MANAGER_INITIALIZED', {
                    rolesCount: this.roles.size,
                    permissionsCount: this.permissions.size
                });
            }
            
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Load default roles
     */
    async _loadDefaultRoles() {
        const defaultRoles = [
            {
                id: 'super_admin',
                name: 'Super Administrator',
                description: 'Full system access',
                level: 100,
                inherits: []
            },
            {
                id: 'admin',
                name: 'Administrator',
                description: 'Administrative access',
                level: 80,
                inherits: ['manager']
            },
            {
                id: 'manager',
                name: 'Manager',
                description: 'Management access',
                level: 60,
                inherits: ['user']
            },
            {
                id: 'user',
                name: 'User',
                description: 'Standard user access',
                level: 40,
                inherits: ['guest']
            },
            {
                id: 'guest',
                name: 'Guest',
                description: 'Limited read-only access',
                level: 20,
                inherits: []
            }
        ];

        for (const role of defaultRoles) {
            this.roles.set(role.id, {
                ...role,
                createdAt: new Date(),
                active: true
            });
        }
    }

    /**
     * Load default permissions
     */
    async _loadDefaultPermissions() {
        const defaultPermissions = [
            // System permissions
            { id: 'system:read', name: 'Read System Info', category: 'system' },
            { id: 'system:write', name: 'Modify System', category: 'system' },
            { id: 'system:admin', name: 'System Administration', category: 'system' },
            
            // User management permissions
            { id: 'users:read', name: 'View Users', category: 'users' },
            { id: 'users:write', name: 'Manage Users', category: 'users' },
            { id: 'users:delete', name: 'Delete Users', category: 'users' },
            
            // Role management permissions
            { id: 'roles:read', name: 'View Roles', category: 'roles' },
            { id: 'roles:write', name: 'Manage Roles', category: 'roles' },
            { id: 'roles:assign', name: 'Assign Roles', category: 'roles' },
            
            // Task management permissions
            { id: 'tasks:read', name: 'View Tasks', category: 'tasks' },
            { id: 'tasks:write', name: 'Manage Tasks', category: 'tasks' },
            { id: 'tasks:execute', name: 'Execute Tasks', category: 'tasks' },
            { id: 'tasks:delete', name: 'Delete Tasks', category: 'tasks' },
            
            // API permissions
            { id: 'api:read', name: 'API Read Access', category: 'api' },
            { id: 'api:write', name: 'API Write Access', category: 'api' },
            { id: 'api:admin', name: 'API Administration', category: 'api' },
            
            // Audit permissions
            { id: 'audit:read', name: 'View Audit Logs', category: 'audit' },
            { id: 'audit:export', name: 'Export Audit Logs', category: 'audit' }
        ];

        for (const permission of defaultPermissions) {
            this.permissions.set(permission.id, {
                ...permission,
                createdAt: new Date(),
                active: true
            });
        }

        // Assign default permissions to roles
        await this._assignDefaultPermissions();
    }

    /**
     * Assign default permissions to roles
     */
    async _assignDefaultPermissions() {
        const rolePermissionMappings = {
            'super_admin': ['*'], // All permissions
            'admin': [
                'system:read', 'system:write',
                'users:read', 'users:write', 'users:delete',
                'roles:read', 'roles:write', 'roles:assign',
                'tasks:read', 'tasks:write', 'tasks:execute', 'tasks:delete',
                'api:read', 'api:write', 'api:admin',
                'audit:read', 'audit:export'
            ],
            'manager': [
                'system:read',
                'users:read', 'users:write',
                'roles:read',
                'tasks:read', 'tasks:write', 'tasks:execute',
                'api:read', 'api:write',
                'audit:read'
            ],
            'user': [
                'system:read',
                'users:read',
                'tasks:read', 'tasks:write', 'tasks:execute',
                'api:read', 'api:write'
            ],
            'guest': [
                'system:read',
                'tasks:read',
                'api:read'
            ]
        };

        for (const [roleId, permissions] of Object.entries(rolePermissionMappings)) {
            this.rolePermissions.set(roleId, new Set(permissions));
        }
    }

    /**
     * Check if user has permission
     */
    async hasPermission(userId, permission, resource = null) {
        if (!this.initialized) {
            throw new Error('Authorization manager not initialized');
        }

        try {
            // Check cache first
            const cacheKey = `${userId}:${permission}:${resource || 'global'}`;
            if (this.cacheEnabled && this.permissionCache.has(cacheKey)) {
                const cached = this.permissionCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTTL) {
                    return cached.result;
                }
            }

            // Get user roles
            const userRoles = this.userRoles.get(userId) || new Set();
            
            // Check permission for each role
            let hasPermission = false;
            
            for (const roleId of userRoles) {
                if (await this._roleHasPermission(roleId, permission, resource)) {
                    hasPermission = true;
                    break;
                }
            }

            // Cache result
            if (this.cacheEnabled) {
                this.permissionCache.set(cacheKey, {
                    result: hasPermission,
                    timestamp: Date.now()
                });
            }

            // Log permission check
            if (this.auditLogger) {
                await this.auditLogger.logSecurityEvent('PERMISSION_CHECK', {
                    userId,
                    permission,
                    resource,
                    result: hasPermission,
                    roles: Array.from(userRoles)
                });
            }

            return hasPermission;

        } catch (error) {
            if (this.auditLogger) {
                await this.auditLogger.logSecurityEvent('PERMISSION_CHECK_ERROR', {
                    userId,
                    permission,
                    resource,
                    error: error.message
                });
            }
            throw error;
        }
    }

    /**
     * Check if role has permission
     */
    async _roleHasPermission(roleId, permission, resource = null) {
        const role = this.roles.get(roleId);
        if (!role || !role.active) {
            return false;
        }

        const rolePermissions = this.rolePermissions.get(roleId) || new Set();
        
        // Check for wildcard permission
        if (rolePermissions.has('*')) {
            return true;
        }

        // Check exact permission match
        if (rolePermissions.has(permission)) {
            return true;
        }

        // Check wildcard patterns
        for (const rolePermission of rolePermissions) {
            if (this._matchesWildcard(permission, rolePermission)) {
                return true;
            }
        }

        // Check inherited roles
        if (this.config.permissions?.inheritance && role.inherits) {
            for (const inheritedRoleId of role.inherits) {
                if (await this._roleHasPermission(inheritedRoleId, permission, resource)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if permission matches wildcard pattern
     */
    _matchesWildcard(permission, pattern) {
        if (!this.config.permissions?.wildcards) {
            return false;
        }

        // Convert pattern to regex
        const regexPattern = pattern
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(permission);
    }

    /**
     * Assign role to user
     */
    async assignRole(userId, roleId) {
        if (!this.roles.has(roleId)) {
            throw new Error(`Role ${roleId} does not exist`);
        }

        if (!this.userRoles.has(userId)) {
            this.userRoles.set(userId, new Set());
        }

        this.userRoles.get(userId).add(roleId);
        
        // Clear permission cache for user
        this._clearUserPermissionCache(userId);

        if (this.auditLogger) {
            await this.auditLogger.logSecurityEvent('ROLE_ASSIGNED', {
                userId,
                roleId,
                assignedBy: 'system' // TODO: Get actual assigner
            });
        }

        this.emit('roleAssigned', { userId, roleId });
    }

    /**
     * Remove role from user
     */
    async removeRole(userId, roleId) {
        const userRoles = this.userRoles.get(userId);
        if (userRoles) {
            userRoles.delete(roleId);
            
            // Clear permission cache for user
            this._clearUserPermissionCache(userId);

            if (this.auditLogger) {
                await this.auditLogger.logSecurityEvent('ROLE_REMOVED', {
                    userId,
                    roleId,
                    removedBy: 'system' // TODO: Get actual remover
                });
            }

            this.emit('roleRemoved', { userId, roleId });
        }
    }

    /**
     * Get user roles
     */
    async getUserRoles(userId) {
        const userRoles = this.userRoles.get(userId) || new Set();
        const roles = [];
        
        for (const roleId of userRoles) {
            const role = this.roles.get(roleId);
            if (role && role.active) {
                roles.push(role);
            }
        }
        
        return roles.sort((a, b) => b.level - a.level); // Sort by level descending
    }

    /**
     * Get user permissions
     */
    async getUserPermissions(userId) {
        const userRoles = this.userRoles.get(userId) || new Set();
        const permissions = new Set();
        
        for (const roleId of userRoles) {
            const rolePermissions = this.rolePermissions.get(roleId) || new Set();
            for (const permission of rolePermissions) {
                permissions.add(permission);
            }
            
            // Add inherited permissions
            const role = this.roles.get(roleId);
            if (role && role.inherits) {
                for (const inheritedRoleId of role.inherits) {
                    const inheritedPermissions = this.rolePermissions.get(inheritedRoleId) || new Set();
                    for (const permission of inheritedPermissions) {
                        permissions.add(permission);
                    }
                }
            }
        }
        
        return Array.from(permissions);
    }

    /**
     * Create new role
     */
    async createRole(roleData) {
        const { id, name, description, level, inherits = [], permissions = [] } = roleData;
        
        if (this.roles.has(id)) {
            throw new Error(`Role ${id} already exists`);
        }

        const role = {
            id,
            name,
            description,
            level: level || 0,
            inherits,
            createdAt: new Date(),
            active: true
        };

        this.roles.set(id, role);
        this.rolePermissions.set(id, new Set(permissions));

        if (this.auditLogger) {
            await this.auditLogger.logSecurityEvent('ROLE_CREATED', {
                roleId: id,
                roleName: name,
                permissions: permissions.length
            });
        }

        this.emit('roleCreated', { role });
        return role;
    }

    /**
     * Update role
     */
    async updateRole(roleId, updates) {
        const role = this.roles.get(roleId);
        if (!role) {
            throw new Error(`Role ${roleId} does not exist`);
        }

        const updatedRole = { ...role, ...updates, updatedAt: new Date() };
        this.roles.set(roleId, updatedRole);

        // Clear all permission caches since role changed
        this.permissionCache.clear();

        if (this.auditLogger) {
            await this.auditLogger.logSecurityEvent('ROLE_UPDATED', {
                roleId,
                updates: Object.keys(updates)
            });
        }

        this.emit('roleUpdated', { roleId, role: updatedRole });
        return updatedRole;
    }

    /**
     * Delete role
     */
    async deleteRole(roleId) {
        const role = this.roles.get(roleId);
        if (!role) {
            throw new Error(`Role ${roleId} does not exist`);
        }

        // Remove role from all users
        for (const [userId, userRoles] of this.userRoles) {
            if (userRoles.has(roleId)) {
                userRoles.delete(roleId);
            }
        }

        // Remove role and its permissions
        this.roles.delete(roleId);
        this.rolePermissions.delete(roleId);

        // Clear all permission caches
        this.permissionCache.clear();

        if (this.auditLogger) {
            await this.auditLogger.logSecurityEvent('ROLE_DELETED', {
                roleId,
                roleName: role.name
            });
        }

        this.emit('roleDeleted', { roleId, role });
    }

    /**
     * Add permission to role
     */
    async addPermissionToRole(roleId, permission) {
        if (!this.roles.has(roleId)) {
            throw new Error(`Role ${roleId} does not exist`);
        }

        if (!this.rolePermissions.has(roleId)) {
            this.rolePermissions.set(roleId, new Set());
        }

        this.rolePermissions.get(roleId).add(permission);
        
        // Clear permission cache
        this.permissionCache.clear();

        if (this.auditLogger) {
            await this.auditLogger.logSecurityEvent('PERMISSION_ADDED_TO_ROLE', {
                roleId,
                permission
            });
        }

        this.emit('permissionAddedToRole', { roleId, permission });
    }

    /**
     * Remove permission from role
     */
    async removePermissionFromRole(roleId, permission) {
        const rolePermissions = this.rolePermissions.get(roleId);
        if (rolePermissions) {
            rolePermissions.delete(permission);
            
            // Clear permission cache
            this.permissionCache.clear();

            if (this.auditLogger) {
                await this.auditLogger.logSecurityEvent('PERMISSION_REMOVED_FROM_ROLE', {
                    roleId,
                    permission
                });
            }

            this.emit('permissionRemovedFromRole', { roleId, permission });
        }
    }

    /**
     * Clear permission cache for a user
     */
    _clearUserPermissionCache(userId) {
        if (!this.cacheEnabled) return;
        
        for (const key of this.permissionCache.keys()) {
            if (key.startsWith(`${userId}:`)) {
                this.permissionCache.delete(key);
            }
        }
    }

    /**
     * Get all roles
     */
    async getAllRoles() {
        return Array.from(this.roles.values()).filter(role => role.active);
    }

    /**
     * Get all permissions
     */
    async getAllPermissions() {
        return Array.from(this.permissions.values()).filter(permission => permission.active);
    }

    /**
     * Health check
     */
    async healthCheck() {
        return {
            status: 'ok',
            rolesCount: this.roles.size,
            permissionsCount: this.permissions.size,
            userRolesCount: this.userRoles.size,
            cacheSize: this.permissionCache.size,
            cacheEnabled: this.cacheEnabled
        };
    }

    /**
     * Shutdown
     */
    async shutdown() {
        this.roles.clear();
        this.permissions.clear();
        this.userRoles.clear();
        this.rolePermissions.clear();
        this.permissionCache.clear();
        this.initialized = false;
    }
}

export default AuthorizationManager;

