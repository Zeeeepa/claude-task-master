/**
 * @fileoverview AuditLog Model
 * @description Comprehensive audit logging model for tracking all system changes and activities
 * @version 2.0.0
 * @created 2025-05-28
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * AuditLog model class for tracking system changes and activities
 */
export class AuditLog {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        
        // Entity information
        this.entity_type = data.entity_type || '';
        this.entity_id = data.entity_id || null;
        
        // Action information
        this.action = data.action || '';
        
        // Change tracking
        this.old_values = data.old_values || null;
        this.new_values = data.new_values || null;
        this.changed_fields = data.changed_fields || [];
        
        // User and session information
        this.user_id = data.user_id || null;
        this.user_email = data.user_email || null;
        this.user_name = data.user_name || null;
        this.session_id = data.session_id || null;
        
        // Request information
        this.ip_address = data.ip_address || null;
        this.user_agent = data.user_agent || null;
        this.request_id = data.request_id || null;
        this.api_endpoint = data.api_endpoint || null;
        this.http_method = data.http_method || null;
        
        // Timing information
        this.timestamp = data.timestamp || new Date();
        this.processing_time_ms = data.processing_time_ms || null;
        
        // Context and metadata
        this.context = data.context || {};
        this.metadata = data.metadata || {};
        
        // Severity and classification
        this.severity = data.severity || 'info';
        this.category = data.category || 'general';
        
        // Additional tracking
        this.correlation_id = data.correlation_id || null;
        this.parent_audit_id = data.parent_audit_id || null;
    }

    /**
     * Validate audit log data
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields validation
        if (!this.entity_type || this.entity_type.trim().length === 0) {
            errors.push('Entity type is required');
        }

        if (!this.entity_id) {
            errors.push('Entity ID is required');
        }

        if (!this.action || this.action.trim().length === 0) {
            errors.push('Action is required');
        }

        // Entity type validation
        const validEntityTypes = [
            'task', 'workflow', 'workflow_step', 'user', 'system', 'configuration', 
            'deployment', 'repository', 'pull_request', 'branch'
        ];
        if (this.entity_type && !validEntityTypes.includes(this.entity_type)) {
            errors.push(`Entity type must be one of: ${validEntityTypes.join(', ')}`);
        }

        // Action validation
        const validActions = [
            'create', 'update', 'delete', 'status_change', 'assign', 'unassign',
            'start', 'complete', 'fail', 'retry', 'cancel', 'pause', 'resume',
            'deploy', 'rollback', 'approve', 'reject', 'merge', 'branch_create',
            'branch_delete', 'pr_create', 'pr_merge', 'pr_close', 'config_change'
        ];
        if (this.action && !validActions.includes(this.action)) {
            errors.push(`Action must be one of: ${validActions.join(', ')}`);
        }

        // Severity validation
        const validSeverities = ['debug', 'info', 'warning', 'error', 'critical'];
        if (!validSeverities.includes(this.severity)) {
            errors.push(`Severity must be one of: ${validSeverities.join(', ')}`);
        }

        // Category validation
        const validCategories = [
            'general', 'security', 'performance', 'business', 'system', 
            'integration', 'compliance', 'data_change'
        ];
        if (!validCategories.includes(this.category)) {
            errors.push(`Category must be one of: ${validCategories.join(', ')}`);
        }

        // Array validation
        if (!Array.isArray(this.changed_fields)) {
            errors.push('Changed fields must be an array');
        }

        // Processing time validation
        if (this.processing_time_ms !== null && this.processing_time_ms < 0) {
            errors.push('Processing time must be non-negative');
        }

        // Business logic warnings
        if (this.action === 'update' && (!this.old_values || !this.new_values)) {
            warnings.push('Update actions should include both old and new values');
        }

        if (this.action === 'create' && this.old_values) {
            warnings.push('Create actions should not have old values');
        }

        if (this.action === 'delete' && this.new_values) {
            warnings.push('Delete actions should not have new values');
        }

        if (this.severity === 'critical' && this.category === 'general') {
            warnings.push('Critical severity should have a specific category');
        }

        if (this.processing_time_ms > 10000) { // 10 seconds
            warnings.push('Processing time is very high (>10 seconds)');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Convert to database format
     * @returns {Object} Database-ready object
     */
    toDatabase() {
        return {
            id: this.id,
            entity_type: this.entity_type,
            entity_id: this.entity_id,
            action: this.action,
            old_values: this.old_values ? JSON.stringify(this.old_values) : null,
            new_values: this.new_values ? JSON.stringify(this.new_values) : null,
            changed_fields: this.changed_fields,
            user_id: this.user_id,
            user_email: this.user_email,
            user_name: this.user_name,
            session_id: this.session_id,
            ip_address: this.ip_address,
            user_agent: this.user_agent,
            request_id: this.request_id,
            api_endpoint: this.api_endpoint,
            http_method: this.http_method,
            timestamp: this.timestamp,
            processing_time_ms: this.processing_time_ms,
            context: JSON.stringify(this.context),
            metadata: JSON.stringify(this.metadata),
            severity: this.severity,
            category: this.category,
            correlation_id: this.correlation_id,
            parent_audit_id: this.parent_audit_id
        };
    }

    /**
     * Create from database row
     * @param {Object} row - Database row
     * @returns {AuditLog} AuditLog instance
     */
    static fromDatabase(row) {
        return new AuditLog({
            id: row.id,
            entity_type: row.entity_type,
            entity_id: row.entity_id,
            action: row.action,
            old_values: row.old_values ? 
                (typeof row.old_values === 'string' ? JSON.parse(row.old_values) : row.old_values) : null,
            new_values: row.new_values ? 
                (typeof row.new_values === 'string' ? JSON.parse(row.new_values) : row.new_values) : null,
            changed_fields: row.changed_fields || [],
            user_id: row.user_id,
            user_email: row.user_email,
            user_name: row.user_name,
            session_id: row.session_id,
            ip_address: row.ip_address,
            user_agent: row.user_agent,
            request_id: row.request_id,
            api_endpoint: row.api_endpoint,
            http_method: row.http_method,
            timestamp: row.timestamp,
            processing_time_ms: row.processing_time_ms,
            context: typeof row.context === 'string' 
                ? JSON.parse(row.context) 
                : row.context || {},
            metadata: typeof row.metadata === 'string' 
                ? JSON.parse(row.metadata) 
                : row.metadata || {},
            severity: row.severity,
            category: row.category,
            correlation_id: row.correlation_id,
            parent_audit_id: row.parent_audit_id
        });
    }

    /**
     * Create audit log for entity creation
     * @param {string} entityType - Type of entity
     * @param {string} entityId - ID of entity
     * @param {Object} entityData - Entity data
     * @param {Object} context - Additional context
     * @returns {AuditLog} New audit log instance
     */
    static forCreate(entityType, entityId, entityData, context = {}) {
        return new AuditLog({
            entity_type: entityType,
            entity_id: entityId,
            action: 'create',
            new_values: entityData,
            context,
            severity: 'info',
            category: 'data_change'
        });
    }

    /**
     * Create audit log for entity update
     * @param {string} entityType - Type of entity
     * @param {string} entityId - ID of entity
     * @param {Object} oldData - Previous entity data
     * @param {Object} newData - Updated entity data
     * @param {Object} context - Additional context
     * @returns {AuditLog} New audit log instance
     */
    static forUpdate(entityType, entityId, oldData, newData, context = {}) {
        const changedFields = AuditLog.getChangedFields(oldData, newData);
        
        return new AuditLog({
            entity_type: entityType,
            entity_id: entityId,
            action: 'update',
            old_values: oldData,
            new_values: newData,
            changed_fields: changedFields,
            context,
            severity: 'info',
            category: 'data_change'
        });
    }

    /**
     * Create audit log for entity deletion
     * @param {string} entityType - Type of entity
     * @param {string} entityId - ID of entity
     * @param {Object} entityData - Entity data before deletion
     * @param {Object} context - Additional context
     * @returns {AuditLog} New audit log instance
     */
    static forDelete(entityType, entityId, entityData, context = {}) {
        return new AuditLog({
            entity_type: entityType,
            entity_id: entityId,
            action: 'delete',
            old_values: entityData,
            context,
            severity: 'warning',
            category: 'data_change'
        });
    }

    /**
     * Create audit log for status change
     * @param {string} entityType - Type of entity
     * @param {string} entityId - ID of entity
     * @param {string} oldStatus - Previous status
     * @param {string} newStatus - New status
     * @param {Object} context - Additional context
     * @returns {AuditLog} New audit log instance
     */
    static forStatusChange(entityType, entityId, oldStatus, newStatus, context = {}) {
        return new AuditLog({
            entity_type: entityType,
            entity_id: entityId,
            action: 'status_change',
            old_values: { status: oldStatus },
            new_values: { status: newStatus },
            changed_fields: ['status'],
            context: {
                ...context,
                status_transition: `${oldStatus} -> ${newStatus}`
            },
            severity: 'info',
            category: 'business'
        });
    }

    /**
     * Create audit log for security events
     * @param {string} action - Security action
     * @param {Object} context - Security context
     * @param {string} severity - Event severity
     * @returns {AuditLog} New audit log instance
     */
    static forSecurity(action, context = {}, severity = 'warning') {
        return new AuditLog({
            entity_type: 'system',
            entity_id: uuidv4(),
            action,
            context,
            severity,
            category: 'security'
        });
    }

    /**
     * Create audit log for system events
     * @param {string} action - System action
     * @param {Object} context - System context
     * @param {string} severity - Event severity
     * @returns {AuditLog} New audit log instance
     */
    static forSystem(action, context = {}, severity = 'info') {
        return new AuditLog({
            entity_type: 'system',
            entity_id: uuidv4(),
            action,
            context,
            severity,
            category: 'system'
        });
    }

    /**
     * Get changed fields between old and new data
     * @param {Object} oldData - Previous data
     * @param {Object} newData - New data
     * @returns {Array} Array of changed field names
     */
    static getChangedFields(oldData, newData) {
        if (!oldData || !newData) return [];
        
        const changedFields = [];
        const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
        
        for (const key of allKeys) {
            if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
                changedFields.push(key);
            }
        }
        
        return changedFields;
    }

    /**
     * Set user information
     * @param {Object} userInfo - User information
     */
    setUser(userInfo) {
        this.user_id = userInfo.id || userInfo.user_id;
        this.user_email = userInfo.email;
        this.user_name = userInfo.name || userInfo.username;
    }

    /**
     * Set request information
     * @param {Object} requestInfo - Request information
     */
    setRequest(requestInfo) {
        this.ip_address = requestInfo.ip || requestInfo.ip_address;
        this.user_agent = requestInfo.userAgent || requestInfo.user_agent;
        this.request_id = requestInfo.requestId || requestInfo.request_id;
        this.api_endpoint = requestInfo.endpoint || requestInfo.api_endpoint;
        this.http_method = requestInfo.method || requestInfo.http_method;
    }

    /**
     * Set session information
     * @param {string} sessionId - Session ID
     */
    setSession(sessionId) {
        this.session_id = sessionId;
    }

    /**
     * Set correlation ID for tracking related events
     * @param {string} correlationId - Correlation ID
     */
    setCorrelation(correlationId) {
        this.correlation_id = correlationId;
    }

    /**
     * Set parent audit ID for hierarchical tracking
     * @param {string} parentAuditId - Parent audit ID
     */
    setParent(parentAuditId) {
        this.parent_audit_id = parentAuditId;
    }

    /**
     * Add processing time
     * @param {number} startTime - Start time in milliseconds
     * @param {number} endTime - End time in milliseconds (optional, defaults to now)
     */
    setProcessingTime(startTime, endTime = Date.now()) {
        this.processing_time_ms = endTime - startTime;
    }

    /**
     * Get audit log summary for display
     * @returns {Object} Audit log summary
     */
    getSummary() {
        return {
            id: this.id,
            entity_type: this.entity_type,
            entity_id: this.entity_id,
            action: this.action,
            user_id: this.user_id,
            user_name: this.user_name,
            timestamp: this.timestamp,
            severity: this.severity,
            category: this.category,
            changed_fields: this.changed_fields,
            has_changes: this.changed_fields.length > 0,
            processing_time_ms: this.processing_time_ms
        };
    }

    /**
     * Check if audit log represents a critical event
     * @returns {boolean} True if critical event
     */
    isCritical() {
        return this.severity === 'critical' || 
               this.category === 'security' ||
               ['delete', 'config_change'].includes(this.action);
    }

    /**
     * Check if audit log represents an error event
     * @returns {boolean} True if error event
     */
    isError() {
        return ['error', 'critical'].includes(this.severity) ||
               ['fail', 'cancel'].includes(this.action);
    }

    /**
     * Get human-readable description of the audit event
     * @returns {string} Human-readable description
     */
    getDescription() {
        const entityName = this.entity_type.replace('_', ' ');
        const actionName = this.action.replace('_', ' ');
        const userName = this.user_name || this.user_id || 'system';
        
        let description = `${userName} performed ${actionName} on ${entityName}`;
        
        if (this.changed_fields.length > 0) {
            description += ` (changed: ${this.changed_fields.join(', ')})`;
        }
        
        return description;
    }
}

/**
 * AuditSummary model for aggregated audit statistics
 */
export class AuditSummary {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.summary_date = data.summary_date || new Date().toISOString().split('T')[0];
        this.summary_hour = data.summary_hour || null;
        this.entity_type = data.entity_type || '';
        this.action = data.action || '';
        this.event_count = data.event_count || 0;
        this.unique_users = data.unique_users || 0;
        this.unique_entities = data.unique_entities || 0;
        this.error_count = data.error_count || 0;
        this.avg_processing_time_ms = data.avg_processing_time_ms || null;
        this.max_processing_time_ms = data.max_processing_time_ms || null;
        this.min_processing_time_ms = data.min_processing_time_ms || null;
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();
    }

    /**
     * Convert to database format
     * @returns {Object} Database-ready object
     */
    toDatabase() {
        return {
            id: this.id,
            summary_date: this.summary_date,
            summary_hour: this.summary_hour,
            entity_type: this.entity_type,
            action: this.action,
            event_count: this.event_count,
            unique_users: this.unique_users,
            unique_entities: this.unique_entities,
            error_count: this.error_count,
            avg_processing_time_ms: this.avg_processing_time_ms,
            max_processing_time_ms: this.max_processing_time_ms,
            min_processing_time_ms: this.min_processing_time_ms,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    /**
     * Create from database row
     * @param {Object} row - Database row
     * @returns {AuditSummary} AuditSummary instance
     */
    static fromDatabase(row) {
        return new AuditSummary({
            id: row.id,
            summary_date: row.summary_date,
            summary_hour: row.summary_hour,
            entity_type: row.entity_type,
            action: row.action,
            event_count: row.event_count,
            unique_users: row.unique_users,
            unique_entities: row.unique_entities,
            error_count: row.error_count,
            avg_processing_time_ms: row.avg_processing_time_ms,
            max_processing_time_ms: row.max_processing_time_ms,
            min_processing_time_ms: row.min_processing_time_ms,
            created_at: row.created_at,
            updated_at: row.updated_at
        });
    }
}

export default AuditLog;

