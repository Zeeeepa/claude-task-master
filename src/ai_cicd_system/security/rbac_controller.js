/**
 * Role-Based Access Control (RBAC) Controller
 * Manages roles, permissions, and access control policies
 */

import { EventEmitter } from 'events';
import { AuditLogger } from './audit_logger.js';

export class RBACController extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            strictMode: config.strictMode || true,
            inheritanceEnabled: config.inheritanceEnabled || true,
            cacheTimeout: config.cacheTimeout || 5 * 60 * 1000, // 5 minutes
            ...config
        };

        this.auditLogger = new AuditLogger();
        this.permissionCache = new Map();
        this.roles = new Map();
        this.permissions = new Map();
        this.userRoles = new Map();
        this.roleHierarchy = new Map();

        this.initializeDefaultRoles();
        this.startCacheCleanup();
    }

    /**
     * Initialize default roles and permissions
     */
    initializeDefaultRoles() {
        // Define core permissions
        const corePermissions = [
            // System permissions
            { id: 'system:read', name: 'System Read', description: 'Read system information' },
            { id: 'system:write', name: 'System Write', description: 'Modify system configuration' },
            { id: 'system:admin', name: 'System Admin', description: 'Full system administration' },
            
            // User management
            { id: 'users:read', name: 'Users Read', description: 'View user information' },
            { id: 'users:write', name: 'Users Write', description: 'Create and modify users' },
            { id: 'users:delete', name: 'Users Delete', description: 'Delete users' },
            
            // Task management
            { id: 'tasks:read', name: 'Tasks Read', description: 'View tasks' },
            { id: 'tasks:write', name: 'Tasks Write', description: 'Create and modify tasks' },
            { id: 'tasks:delete', name: 'Tasks Delete', description: 'Delete tasks' },
            { id: 'tasks:execute', name: 'Tasks Execute', description: 'Execute tasks' },
            
            // CI/CD operations
            { id: 'cicd:read', name: 'CI/CD Read', description: 'View CI/CD pipelines' },
            { id: 'cicd:write', name: 'CI/CD Write', description: 'Create and modify pipelines' },
            { id: 'cicd:execute', name: 'CI/CD Execute', description: 'Execute pipelines' },
            { id: 'cicd:deploy', name: 'CI/CD Deploy', description: 'Deploy applications' },
            
            // Security operations
            { id: 'security:read', name: 'Security Read', description: 'View security logs and settings' },
            { id: 'security:write', name: 'Security Write', description: 'Modify security settings' },
            { id: 'security:audit', name: 'Security Audit', description: 'Access audit logs' },
            
            // API access
            { id: 'api:read', name: 'API Read', description: 'Read API access' },
            { id: 'api:write', name: 'API Write', description: 'Write API access' },
            { id: 'api:admin', name: 'API Admin', description: 'API administration' }
        ];

        // Store permissions
        corePermissions.forEach(permission => {
            this.permissions.set(permission.id, permission);
        });

        // Define default roles
        const defaultRoles = [
            {
                id: 'super_admin',
                name: 'Super Administrator',
                description: 'Full system access',
                permissions: Array.from(this.permissions.keys()),
                inherits: []
            },
            {
                id: 'admin',
                name: 'Administrator',
                description: 'System administration with limited security access',
                permissions: [
                    'system:read', 'system:write',
                    'users:read', 'users:write',
                    'tasks:read', 'tasks:write', 'tasks:delete', 'tasks:execute',
                    'cicd:read', 'cicd:write', 'cicd:execute',
                    'security:read',
                    'api:read', 'api:write'
                ],
                inherits: []
            },
            {
                id: 'developer',
                name: 'Developer',
                description: 'Development and CI/CD access',
                permissions: [
                    'system:read',
                    'tasks:read', 'tasks:write', 'tasks:execute',
                    'cicd:read', 'cicd:write', 'cicd:execute',
                    'api:read', 'api:write'
                ],
                inherits: ['user']
            },
            {
                id: 'operator',
                name: 'Operator',
                description: 'Operations and deployment access',
                permissions: [
                    'system:read',
                    'tasks:read', 'tasks:execute',
                    'cicd:read', 'cicd:execute', 'cicd:deploy',
                    'security:read',
                    'api:read'
                ],
                inherits: ['user']
            },
            {
                id: 'auditor',
                name: 'Auditor',
                description: 'Read-only access for auditing',
                permissions: [
                    'system:read',
                    'users:read',
                    'tasks:read',
                    'cicd:read',
                    'security:read', 'security:audit',
                    'api:read'
                ],
                inherits: ['user']
            },
            {
                id: 'user',
                name: 'User',
                description: 'Basic user access',
                permissions: [
                    'tasks:read',
                    'api:read'
                ],
                inherits: []
            },
            {
                id: 'service',
                name: 'Service Account',
                description: 'Service-to-service communication',
                permissions: [
                    'api:read', 'api:write',
                    'tasks:read', 'tasks:write', 'tasks:execute'
                ],
                inherits: []
            }
        ];

        // Store roles
        defaultRoles.forEach(role => {
            this.roles.set(role.id, role);
            if (role.inherits.length > 0) {
                this.roleHierarchy.set(role.id, role.inherits);
            }
        });
    }

    /**
     * Check if user has permission
     */
    async hasPermission(userId, permission, resource = null, context = {}) {
        try {
            const cacheKey = `${userId}:${permission}:${resource || 'global'}`;
            
            // Check cache first
            if (this.permissionCache.has(cacheKey)) {
                const cached = this.permissionCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
                    return cached.result;
                }
            }

            // Get user roles
            const userRoles = await this.getUserRoles(userId);
            if (!userRoles || userRoles.length === 0) {
                return false;
            }

            // Check permissions across all user roles
            let hasAccess = false;
            for (const roleId of userRoles) {
                if (await this.roleHasPermission(roleId, permission, resource, context)) {
                    hasAccess = true;
                    break;
                }
            }

            // Cache result
            this.permissionCache.set(cacheKey, {
                result: hasAccess,
                timestamp: Date.now()
            });

            // Log access check
            await this.auditLogger.logSecurityEvent('PERMISSION_CHECK', {
                userId,
                permission,
                resource,
                result: hasAccess,
                roles: userRoles,
                context
            });

            return hasAccess;

        } catch (error) {
            await this.auditLogger.logSecurityEvent('PERMISSION_CHECK_ERROR', {
                userId,
                permission,
                resource,
                error: error.message
            });
            
            // In strict mode, deny access on errors
            return this.config.strictMode ? false : true;
        }
    }

    /**
     * Check if role has permission
     */
    async roleHasPermission(roleId, permission, resource = null, context = {}) {
        const role = this.roles.get(roleId);
        if (!role) {
            return false;
        }

        // Check direct permissions
        if (role.permissions.includes(permission)) {
            return await this.evaluateResourceAccess(permission, resource, context);
        }

        // Check inherited permissions if inheritance is enabled
        if (this.config.inheritanceEnabled && this.roleHierarchy.has(roleId)) {
            const inheritedRoles = this.roleHierarchy.get(roleId);
            for (const inheritedRoleId of inheritedRoles) {
                if (await this.roleHasPermission(inheritedRoleId, permission, resource, context)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Evaluate resource-specific access
     */
    async evaluateResourceAccess(permission, resource, context) {
        if (!resource) {
            return true; // Global permission
        }

        // Resource-specific access control logic
        // This can be extended based on your specific requirements
        const resourceRules = {
            'tasks': this.evaluateTaskAccess,
            'users': this.evaluateUserAccess,
            'cicd': this.evaluateCICDAccess,
            'system': this.evaluateSystemAccess
        };

        const resourceType = resource.split(':')[0];
        const evaluator = resourceRules[resourceType];
        
        if (evaluator) {
            return await evaluator.call(this, permission, resource, context);
        }

        return true; // Default allow if no specific rules
    }

    /**
     * Evaluate task access
     */
    async evaluateTaskAccess(permission, resource, context) {
        const [, taskId] = resource.split(':');
        
        // Example: Users can only modify their own tasks unless they have admin role
        if (permission.includes('write') || permission.includes('delete')) {
            const task = await this.getTaskById(taskId);
            if (task && task.ownerId !== context.userId) {
                const userRoles = await this.getUserRoles(context.userId);
                return userRoles.includes('admin') || userRoles.includes('super_admin');
            }
        }
        
        return true;
    }

    /**
     * Evaluate user access
     */
    async evaluateUserAccess(permission, resource, context) {
        const [, targetUserId] = resource.split(':');
        
        // Users can read their own profile, but need admin rights for others
        if (permission === 'users:read' && targetUserId === context.userId) {
            return true;
        }
        
        // For write/delete operations, require admin role
        if (permission.includes('write') || permission.includes('delete')) {
            const userRoles = await this.getUserRoles(context.userId);
            return userRoles.includes('admin') || userRoles.includes('super_admin');
        }
        
        return false;
    }

    /**
     * Evaluate CI/CD access
     */
    async evaluateCICDAccess(permission, resource, context) {
        const [, pipelineId] = resource.split(':');
        
        // Deployment requires operator or admin role
        if (permission === 'cicd:deploy') {
            const userRoles = await this.getUserRoles(context.userId);
            return userRoles.some(role => ['operator', 'admin', 'super_admin'].includes(role));
        }
        
        return true;
    }

    /**
     * Evaluate system access
     */
    async evaluateSystemAccess(permission, resource, context) {
        // System write operations require admin role
        if (permission === 'system:write' || permission === 'system:admin') {
            const userRoles = await this.getUserRoles(context.userId);
            return userRoles.includes('admin') || userRoles.includes('super_admin');
        }
        
        return true;
    }

    /**
     * Assign role to user
     */
    async assignRole(userId, roleId, assignedBy) {
        if (!this.roles.has(roleId)) {
            throw new Error(`Role ${roleId} does not exist`);
        }

        const currentRoles = this.userRoles.get(userId) || [];
        if (!currentRoles.includes(roleId)) {
            currentRoles.push(roleId);
            this.userRoles.set(userId, currentRoles);
            
            // Clear permission cache for user
            this.clearUserPermissionCache(userId);
            
            await this.auditLogger.logSecurityEvent('ROLE_ASSIGNED', {
                userId,
                roleId,
                assignedBy,
                currentRoles
            });

            this.emit('roleAssigned', { userId, roleId, assignedBy });
        }
    }

    /**
     * Remove role from user
     */
    async removeRole(userId, roleId, removedBy) {
        const currentRoles = this.userRoles.get(userId) || [];
        const roleIndex = currentRoles.indexOf(roleId);
        
        if (roleIndex > -1) {
            currentRoles.splice(roleIndex, 1);
            this.userRoles.set(userId, currentRoles);
            
            // Clear permission cache for user
            this.clearUserPermissionCache(userId);
            
            await this.auditLogger.logSecurityEvent('ROLE_REMOVED', {
                userId,
                roleId,
                removedBy,
                currentRoles
            });

            this.emit('roleRemoved', { userId, roleId, removedBy });
        }
    }

    /**
     * Get user roles
     */
    async getUserRoles(userId) {
        return this.userRoles.get(userId) || [];
    }

    /**
     * Get all effective permissions for user
     */
    async getUserPermissions(userId) {
        const userRoles = await this.getUserRoles(userId);
        const permissions = new Set();

        for (const roleId of userRoles) {
            const rolePermissions = await this.getRolePermissions(roleId);
            rolePermissions.forEach(permission => permissions.add(permission));
        }

        return Array.from(permissions);
    }

    /**
     * Get role permissions (including inherited)
     */
    async getRolePermissions(roleId) {
        const role = this.roles.get(roleId);
        if (!role) {
            return [];
        }

        const permissions = new Set(role.permissions);

        // Add inherited permissions
        if (this.config.inheritanceEnabled && this.roleHierarchy.has(roleId)) {
            const inheritedRoles = this.roleHierarchy.get(roleId);
            for (const inheritedRoleId of inheritedRoles) {
                const inheritedPermissions = await this.getRolePermissions(inheritedRoleId);
                inheritedPermissions.forEach(permission => permissions.add(permission));
            }
        }

        return Array.from(permissions);
    }

    /**
     * Create custom role
     */
    async createRole(roleData, createdBy) {
        const { id, name, description, permissions = [], inherits = [] } = roleData;

        if (this.roles.has(id)) {
            throw new Error(`Role ${id} already exists`);
        }

        // Validate permissions exist
        for (const permission of permissions) {
            if (!this.permissions.has(permission)) {
                throw new Error(`Permission ${permission} does not exist`);
            }
        }

        // Validate inherited roles exist
        for (const inheritedRole of inherits) {
            if (!this.roles.has(inheritedRole)) {
                throw new Error(`Inherited role ${inheritedRole} does not exist`);
            }
        }

        const role = {
            id,
            name,
            description,
            permissions,
            inherits,
            createdAt: new Date(),
            createdBy
        };

        this.roles.set(id, role);
        
        if (inherits.length > 0) {
            this.roleHierarchy.set(id, inherits);
        }

        await this.auditLogger.logSecurityEvent('ROLE_CREATED', {
            roleId: id,
            name,
            permissions,
            inherits,
            createdBy
        });

        this.emit('roleCreated', { role, createdBy });
        return role;
    }

    /**
     * Create custom permission
     */
    async createPermission(permissionData, createdBy) {
        const { id, name, description } = permissionData;

        if (this.permissions.has(id)) {
            throw new Error(`Permission ${id} already exists`);
        }

        const permission = {
            id,
            name,
            description,
            createdAt: new Date(),
            createdBy
        };

        this.permissions.set(id, permission);

        await this.auditLogger.logSecurityEvent('PERMISSION_CREATED', {
            permissionId: id,
            name,
            description,
            createdBy
        });

        this.emit('permissionCreated', { permission, createdBy });
        return permission;
    }

    /**
     * Clear user permission cache
     */
    clearUserPermissionCache(userId) {
        for (const [key] of this.permissionCache) {
            if (key.startsWith(`${userId}:`)) {
                this.permissionCache.delete(key);
            }
        }
    }

    /**
     * Start cache cleanup interval
     */
    startCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [key, cached] of this.permissionCache) {
                if (now - cached.timestamp > this.config.cacheTimeout) {
                    this.permissionCache.delete(key);
                }
            }
        }, this.config.cacheTimeout);
    }

    /**
     * Get task by ID (mock implementation)
     */
    async getTaskById(taskId) {
        // This would typically query your database
        return {
            id: taskId,
            ownerId: '1',
            name: 'Sample Task'
        };
    }

    /**
     * Get all roles
     */
    getAllRoles() {
        return Array.from(this.roles.values());
    }

    /**
     * Get all permissions
     */
    getAllPermissions() {
        return Array.from(this.permissions.values());
    }

    /**
     * Export RBAC configuration
     */
    exportConfiguration() {
        return {
            roles: Array.from(this.roles.entries()),
            permissions: Array.from(this.permissions.entries()),
            roleHierarchy: Array.from(this.roleHierarchy.entries()),
            userRoles: Array.from(this.userRoles.entries())
        };
    }

    /**
     * Import RBAC configuration
     */
    async importConfiguration(config, importedBy) {
        const { roles, permissions, roleHierarchy, userRoles } = config;

        // Clear existing configuration
        this.roles.clear();
        this.permissions.clear();
        this.roleHierarchy.clear();
        this.userRoles.clear();
        this.permissionCache.clear();

        // Import permissions
        if (permissions) {
            permissions.forEach(([id, permission]) => {
                this.permissions.set(id, permission);
            });
        }

        // Import roles
        if (roles) {
            roles.forEach(([id, role]) => {
                this.roles.set(id, role);
            });
        }

        // Import role hierarchy
        if (roleHierarchy) {
            roleHierarchy.forEach(([roleId, inherits]) => {
                this.roleHierarchy.set(roleId, inherits);
            });
        }

        // Import user roles
        if (userRoles) {
            userRoles.forEach(([userId, roles]) => {
                this.userRoles.set(userId, roles);
            });
        }

        await this.auditLogger.logSecurityEvent('RBAC_CONFIG_IMPORTED', {
            importedBy,
            rolesCount: this.roles.size,
            permissionsCount: this.permissions.size,
            userRolesCount: this.userRoles.size
        });

        this.emit('configurationImported', { importedBy });
    }
}

export default RBACController;

