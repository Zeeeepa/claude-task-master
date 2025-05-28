/**
 * Role Manager
 * 
 * Handles role-based access control (RBAC) for the AI CI/CD system.
 * Manages user roles, permissions, and access control policies.
 */

import { SimpleLogger } from '../utils/simple_logger.js';

export class RoleManager {
    constructor(database, config = {}) {
        this.db = database;
        this.config = {
            defaultRole: config.defaultRole || 'user',
            hierarchicalRoles: config.hierarchicalRoles !== false, // Default to true
            ...config
        };
        
        this.logger = new SimpleLogger('RoleManager');

        // Define role hierarchy (higher number = more permissions)
        this.roleHierarchy = {
            'guest': 0,
            'user': 1,
            'developer': 2,
            'admin': 3,
            'superadmin': 4
        };

        // Define default permissions for each role
        this.defaultRolePermissions = {
            'guest': ['read'],
            'user': ['read', 'create_tasks'],
            'developer': ['read', 'write', 'create_tasks', 'manage_own_tasks', 'execute_workflows'],
            'admin': ['read', 'write', 'delete', 'create_tasks', 'manage_tasks', 'manage_users', 'manage_api_keys', 'execute_workflows', 'manage_workflows'],
            'superadmin': ['*'] // All permissions
        };

        // Define available permissions
        this.availablePermissions = [
            'read',
            'write',
            'delete',
            'create_tasks',
            'manage_own_tasks',
            'manage_tasks',
            'manage_users',
            'manage_api_keys',
            'execute_workflows',
            'manage_workflows',
            'view_audit_logs',
            'manage_security',
            'system_admin'
        ];
    }

    /**
     * Check if a user has a specific permission
     */
    async hasPermission(userId, permission) {
        try {
            const userResult = await this.db.query(
                'SELECT role, permissions FROM users WHERE id = $1 AND is_active = true',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return false;
            }

            const user = userResult.rows[0];
            const userPermissions = JSON.parse(user.permissions || '[]');
            
            // Check if user has wildcard permission
            if (userPermissions.includes('*')) {
                return true;
            }

            // Check explicit permission
            if (userPermissions.includes(permission)) {
                return true;
            }

            // Check role-based permissions if hierarchical roles are enabled
            if (this.config.hierarchicalRoles) {
                const rolePermissions = this.defaultRolePermissions[user.role] || [];
                if (rolePermissions.includes('*') || rolePermissions.includes(permission)) {
                    return true;
                }
            }

            return false;

        } catch (error) {
            this.logger.error('Permission check failed:', error);
            return false; // Fail secure
        }
    }

    /**
     * Check if a user has any of the specified permissions
     */
    async hasAnyPermission(userId, permissions) {
        for (const permission of permissions) {
            if (await this.hasPermission(userId, permission)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if a user has all of the specified permissions
     */
    async hasAllPermissions(userId, permissions) {
        for (const permission of permissions) {
            if (!(await this.hasPermission(userId, permission))) {
                return false;
            }
        }
        return true;
    }

    /**
     * Get all permissions for a user
     */
    async getUserPermissions(userId) {
        try {
            const userResult = await this.db.query(
                'SELECT role, permissions FROM users WHERE id = $1 AND is_active = true',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return {
                    success: false,
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                };
            }

            const user = userResult.rows[0];
            const explicitPermissions = JSON.parse(user.permissions || '[]');
            
            let allPermissions = [...explicitPermissions];

            // Add role-based permissions if hierarchical roles are enabled
            if (this.config.hierarchicalRoles) {
                const rolePermissions = this.defaultRolePermissions[user.role] || [];
                allPermissions = [...new Set([...allPermissions, ...rolePermissions])];
            }

            return {
                success: true,
                role: user.role,
                explicitPermissions,
                allPermissions,
                hasWildcard: allPermissions.includes('*')
            };

        } catch (error) {
            this.logger.error('Failed to get user permissions:', error);
            return {
                success: false,
                error: 'Failed to get user permissions',
                code: 'PERMISSIONS_FAILED'
            };
        }
    }

    /**
     * Assign role to user
     */
    async assignRole(userId, role, assignedBy = null) {
        try {
            // Validate role
            if (!this.roleHierarchy.hasOwnProperty(role)) {
                return {
                    success: false,
                    error: 'Invalid role',
                    code: 'INVALID_ROLE'
                };
            }

            // Check if assigner has permission to assign this role
            if (assignedBy) {
                const canAssign = await this._canAssignRole(assignedBy, role);
                if (!canAssign) {
                    return {
                        success: false,
                        error: 'Insufficient permissions to assign this role',
                        code: 'INSUFFICIENT_PERMISSIONS'
                    };
                }
            }

            const result = await this.db.query(
                'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND is_active = true RETURNING username',
                [role, userId]
            );

            if (result.rowCount === 0) {
                return {
                    success: false,
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                };
            }

            // Log security event
            await this._logSecurityEvent('role_assigned', 'info', userId, {
                new_role: role,
                assigned_by: assignedBy
            });

            this.logger.info(`Role assigned: ${role} to user ${result.rows[0].username}`);

            return { success: true };

        } catch (error) {
            this.logger.error('Role assignment failed:', error);
            return {
                success: false,
                error: 'Role assignment failed',
                code: 'ASSIGNMENT_FAILED'
            };
        }
    }

    /**
     * Grant permission to user
     */
    async grantPermission(userId, permission, grantedBy = null) {
        try {
            // Validate permission
            if (!this.availablePermissions.includes(permission) && permission !== '*') {
                return {
                    success: false,
                    error: 'Invalid permission',
                    code: 'INVALID_PERMISSION'
                };
            }

            // Check if granter has permission to grant this permission
            if (grantedBy) {
                const canGrant = await this._canGrantPermission(grantedBy, permission);
                if (!canGrant) {
                    return {
                        success: false,
                        error: 'Insufficient permissions to grant this permission',
                        code: 'INSUFFICIENT_PERMISSIONS'
                    };
                }
            }

            // Get current permissions
            const userResult = await this.db.query(
                'SELECT permissions FROM users WHERE id = $1 AND is_active = true',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return {
                    success: false,
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                };
            }

            const currentPermissions = JSON.parse(userResult.rows[0].permissions || '[]');
            
            // Add permission if not already present
            if (!currentPermissions.includes(permission)) {
                currentPermissions.push(permission);
                
                await this.db.query(
                    'UPDATE users SET permissions = $1, updated_at = NOW() WHERE id = $2',
                    [JSON.stringify(currentPermissions), userId]
                );

                // Log security event
                await this._logSecurityEvent('permission_granted', 'info', userId, {
                    permission: permission,
                    granted_by: grantedBy
                });

                this.logger.info(`Permission granted: ${permission} to user ${userId}`);
            }

            return { success: true };

        } catch (error) {
            this.logger.error('Permission grant failed:', error);
            return {
                success: false,
                error: 'Permission grant failed',
                code: 'GRANT_FAILED'
            };
        }
    }

    /**
     * Revoke permission from user
     */
    async revokePermission(userId, permission, revokedBy = null) {
        try {
            // Check if revoker has permission to revoke this permission
            if (revokedBy) {
                const canRevoke = await this._canRevokePermission(revokedBy, permission);
                if (!canRevoke) {
                    return {
                        success: false,
                        error: 'Insufficient permissions to revoke this permission',
                        code: 'INSUFFICIENT_PERMISSIONS'
                    };
                }
            }

            // Get current permissions
            const userResult = await this.db.query(
                'SELECT permissions FROM users WHERE id = $1 AND is_active = true',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return {
                    success: false,
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                };
            }

            const currentPermissions = JSON.parse(userResult.rows[0].permissions || '[]');
            
            // Remove permission if present
            const updatedPermissions = currentPermissions.filter(p => p !== permission);
            
            if (updatedPermissions.length !== currentPermissions.length) {
                await this.db.query(
                    'UPDATE users SET permissions = $1, updated_at = NOW() WHERE id = $2',
                    [JSON.stringify(updatedPermissions), userId]
                );

                // Log security event
                await this._logSecurityEvent('permission_revoked', 'info', userId, {
                    permission: permission,
                    revoked_by: revokedBy
                });

                this.logger.info(`Permission revoked: ${permission} from user ${userId}`);
            }

            return { success: true };

        } catch (error) {
            this.logger.error('Permission revocation failed:', error);
            return {
                success: false,
                error: 'Permission revocation failed',
                code: 'REVOCATION_FAILED'
            };
        }
    }

    /**
     * Get users by role
     */
    async getUsersByRole(role) {
        try {
            const result = await this.db.query(
                'SELECT id, username, email, permissions, created_at, last_login FROM users WHERE role = $1 AND is_active = true ORDER BY username',
                [role]
            );

            return {
                success: true,
                users: result.rows.map(user => ({
                    ...user,
                    permissions: JSON.parse(user.permissions || '[]')
                }))
            };

        } catch (error) {
            this.logger.error('Failed to get users by role:', error);
            return {
                success: false,
                error: 'Failed to get users by role',
                code: 'QUERY_FAILED'
            };
        }
    }

    /**
     * Get role statistics
     */
    async getRoleStats() {
        try {
            const stats = await this.db.query(`
                SELECT 
                    role,
                    COUNT(*) as user_count,
                    COUNT(*) FILTER (WHERE last_login > NOW() - INTERVAL '30 days') as active_users
                FROM users 
                WHERE is_active = true 
                GROUP BY role 
                ORDER BY user_count DESC
            `);

            return {
                success: true,
                stats: stats.rows
            };

        } catch (error) {
            this.logger.error('Failed to get role statistics:', error);
            return {
                success: false,
                error: 'Failed to get role statistics',
                code: 'STATS_FAILED'
            };
        }
    }

    /**
     * Check if user can assign a specific role
     */
    async _canAssignRole(assignerId, targetRole) {
        try {
            const assignerPermissions = await this.getUserPermissions(assignerId);
            if (!assignerPermissions.success) {
                return false;
            }

            // Superadmin can assign any role
            if (assignerPermissions.hasWildcard || assignerPermissions.allPermissions.includes('system_admin')) {
                return true;
            }

            // Admin can assign roles below their level
            if (assignerPermissions.allPermissions.includes('manage_users')) {
                const assignerResult = await this.db.query(
                    'SELECT role FROM users WHERE id = $1',
                    [assignerId]
                );
                
                if (assignerResult.rows.length > 0) {
                    const assignerRole = assignerResult.rows[0].role;
                    const assignerLevel = this.roleHierarchy[assignerRole] || 0;
                    const targetLevel = this.roleHierarchy[targetRole] || 0;
                    
                    return assignerLevel > targetLevel;
                }
            }

            return false;

        } catch (error) {
            this.logger.error('Role assignment permission check failed:', error);
            return false;
        }
    }

    /**
     * Check if user can grant a specific permission
     */
    async _canGrantPermission(granterId, permission) {
        try {
            const granterPermissions = await this.getUserPermissions(granterId);
            if (!granterPermissions.success) {
                return false;
            }

            // Wildcard permission can grant anything
            if (granterPermissions.hasWildcard) {
                return true;
            }

            // Must have the permission to grant it
            return granterPermissions.allPermissions.includes(permission);

        } catch (error) {
            this.logger.error('Permission grant check failed:', error);
            return false;
        }
    }

    /**
     * Check if user can revoke a specific permission
     */
    async _canRevokePermission(revokerId, permission) {
        // Same logic as granting for now
        return this._canGrantPermission(revokerId, permission);
    }

    /**
     * Log security event
     */
    async _logSecurityEvent(eventType, severity, userId, eventData) {
        try {
            await this.db.query(
                'INSERT INTO security_events (event_type, severity, user_id, event_data) VALUES ($1, $2, $3, $4)',
                [eventType, severity, userId, JSON.stringify(eventData)]
            );
        } catch (error) {
            this.logger.error('Failed to log security event:', error);
        }
    }

    /**
     * Get available roles
     */
    getAvailableRoles() {
        return Object.keys(this.roleHierarchy);
    }

    /**
     * Get available permissions
     */
    getAvailablePermissions() {
        return [...this.availablePermissions];
    }

    /**
     * Get role hierarchy
     */
    getRoleHierarchy() {
        return { ...this.roleHierarchy };
    }
}

export default RoleManager;

