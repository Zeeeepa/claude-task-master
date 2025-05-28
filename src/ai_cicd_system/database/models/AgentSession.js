/**
 * @fileoverview AgentSession Model
 * @description AI agent communication session management model
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * AgentSession model class for managing AI agent communication sessions
 */
export class AgentSession {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.session_id = data.session_id || this.generateSessionId();
        this.agent_name = data.agent_name || '';
        this.agent_version = data.agent_version || null;
        this.agent_type = data.agent_type || 'ai_assistant';
        
        // Session state
        this.status = data.status || 'active';
        this.session_data = data.session_data || {};
        this.context_data = data.context_data || {};
        
        // Performance tracking
        this.total_requests = data.total_requests || 0;
        this.successful_requests = data.successful_requests || 0;
        this.failed_requests = data.failed_requests || 0;
        this.avg_response_time_ms = data.avg_response_time_ms || null;
        
        // Resource usage
        this.tokens_used = data.tokens_used || 0;
        this.api_calls_made = data.api_calls_made || 0;
        this.cost_usd = data.cost_usd || 0;
        
        // Relationships
        this.workflow_id = data.workflow_id || null;
        this.task_id = data.task_id || null;
        this.parent_session_id = data.parent_session_id || null;
        
        // Session lifecycle
        this.started_at = data.started_at || new Date();
        this.last_activity_at = data.last_activity_at || new Date();
        this.expires_at = data.expires_at || null;
        this.ended_at = data.ended_at || null;
        
        // Connection info
        this.client_ip = data.client_ip || null;
        this.user_agent = data.user_agent || null;
        
        // Metadata
        this.metadata = data.metadata || {};
    }

    /**
     * Generate a unique session ID
     * @returns {string} Session ID
     */
    generateSessionId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 9);
        return `sess_${timestamp}_${random}`;
    }

    /**
     * Validate agent session data
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields
        if (!this.agent_name || this.agent_name.trim().length === 0) {
            errors.push('Agent name is required');
        }

        if (this.agent_name && this.agent_name.length > 100) {
            errors.push('Agent name must be 100 characters or less');
        }

        if (!this.session_id || this.session_id.trim().length === 0) {
            errors.push('Session ID is required');
        }

        // Status validation
        const validStatuses = ['active', 'idle', 'busy', 'paused', 'completed', 'failed', 'expired', 'terminated'];
        if (!validStatuses.includes(this.status)) {
            errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
        }

        // Agent type validation
        const validTypes = ['ai_assistant', 'code_generator', 'reviewer', 'tester', 'deployer', 'monitor'];
        if (!validTypes.includes(this.agent_type)) {
            errors.push(`Agent type must be one of: ${validTypes.join(', ')}`);
        }

        // Counter validations
        if (this.total_requests < 0) {
            errors.push('Total requests must be non-negative');
        }

        if (this.successful_requests < 0) {
            errors.push('Successful requests must be non-negative');
        }

        if (this.failed_requests < 0) {
            errors.push('Failed requests must be non-negative');
        }

        if (this.successful_requests + this.failed_requests > this.total_requests) {
            errors.push('Sum of successful and failed requests cannot exceed total requests');
        }

        if (this.tokens_used < 0) {
            errors.push('Tokens used must be non-negative');
        }

        if (this.cost_usd < 0) {
            errors.push('Cost must be non-negative');
        }

        // Object validations
        if (typeof this.session_data !== 'object' || this.session_data === null) {
            errors.push('Session data must be an object');
        }

        if (typeof this.context_data !== 'object' || this.context_data === null) {
            errors.push('Context data must be an object');
        }

        if (typeof this.metadata !== 'object' || this.metadata === null) {
            errors.push('Metadata must be an object');
        }

        // Business logic warnings
        if (this.status === 'active' && this.ended_at) {
            warnings.push('Active sessions should not have an end date');
        }

        if (['completed', 'failed', 'expired', 'terminated'].includes(this.status) && !this.ended_at) {
            warnings.push('Ended sessions should have an end date');
        }

        if (this.expires_at && this.expires_at < new Date() && this.status === 'active') {
            warnings.push('Session has expired but status is still active');
        }

        if (this.total_requests > 1000) {
            warnings.push('High number of requests for a single session');
        }

        if (this.cost_usd > 100) {
            warnings.push('High cost for a single session');
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
            session_id: this.session_id,
            agent_name: this.agent_name,
            agent_version: this.agent_version,
            agent_type: this.agent_type,
            status: this.status,
            session_data: JSON.stringify(this.session_data),
            context_data: JSON.stringify(this.context_data),
            total_requests: this.total_requests,
            successful_requests: this.successful_requests,
            failed_requests: this.failed_requests,
            avg_response_time_ms: this.avg_response_time_ms,
            tokens_used: this.tokens_used,
            api_calls_made: this.api_calls_made,
            cost_usd: this.cost_usd,
            workflow_id: this.workflow_id,
            task_id: this.task_id,
            parent_session_id: this.parent_session_id,
            started_at: this.started_at,
            last_activity_at: this.last_activity_at,
            expires_at: this.expires_at,
            ended_at: this.ended_at,
            client_ip: this.client_ip,
            user_agent: this.user_agent,
            metadata: JSON.stringify(this.metadata)
        };
    }

    /**
     * Create from database row
     * @param {Object} row - Database row
     * @returns {AgentSession} AgentSession instance
     */
    static fromDatabase(row) {
        return new AgentSession({
            id: row.id,
            session_id: row.session_id,
            agent_name: row.agent_name,
            agent_version: row.agent_version,
            agent_type: row.agent_type,
            status: row.status,
            session_data: typeof row.session_data === 'string' 
                ? JSON.parse(row.session_data) 
                : row.session_data,
            context_data: typeof row.context_data === 'string' 
                ? JSON.parse(row.context_data) 
                : row.context_data,
            total_requests: row.total_requests,
            successful_requests: row.successful_requests,
            failed_requests: row.failed_requests,
            avg_response_time_ms: row.avg_response_time_ms,
            tokens_used: row.tokens_used,
            api_calls_made: row.api_calls_made,
            cost_usd: row.cost_usd,
            workflow_id: row.workflow_id,
            task_id: row.task_id,
            parent_session_id: row.parent_session_id,
            started_at: row.started_at,
            last_activity_at: row.last_activity_at,
            expires_at: row.expires_at,
            ended_at: row.ended_at,
            client_ip: row.client_ip,
            user_agent: row.user_agent,
            metadata: typeof row.metadata === 'string' 
                ? JSON.parse(row.metadata) 
                : row.metadata
        });
    }

    /**
     * Update session status
     * @param {string} newStatus - New status
     * @param {Object} context - Update context
     */
    updateStatus(newStatus, context = {}) {
        const validStatuses = ['active', 'idle', 'busy', 'paused', 'completed', 'failed', 'expired', 'terminated'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Invalid status: ${newStatus}`);
        }

        const oldStatus = this.status;
        this.status = newStatus;
        this.last_activity_at = new Date();

        // Set end date for terminal states
        if (['completed', 'failed', 'expired', 'terminated'].includes(newStatus) && !this.ended_at) {
            this.ended_at = new Date();
        }

        // Clear end date if moving away from terminal states
        if (!['completed', 'failed', 'expired', 'terminated'].includes(newStatus) && 
            ['completed', 'failed', 'expired', 'terminated'].includes(oldStatus)) {
            this.ended_at = null;
        }

        return {
            oldStatus,
            newStatus,
            context
        };
    }

    /**
     * Record a request interaction
     * @param {boolean} success - Whether the request was successful
     * @param {number} responseTimeMs - Response time in milliseconds
     * @param {number} tokensUsed - Tokens used in this request
     * @param {number} costUsd - Cost of this request
     */
    recordRequest(success = true, responseTimeMs = null, tokensUsed = 0, costUsd = 0) {
        this.total_requests += 1;
        
        if (success) {
            this.successful_requests += 1;
        } else {
            this.failed_requests += 1;
        }

        this.tokens_used += tokensUsed;
        this.cost_usd += costUsd;
        this.api_calls_made += 1;

        // Update average response time
        if (responseTimeMs !== null) {
            if (this.avg_response_time_ms === null) {
                this.avg_response_time_ms = responseTimeMs;
            } else {
                // Calculate running average
                const totalResponseTime = this.avg_response_time_ms * (this.total_requests - 1) + responseTimeMs;
                this.avg_response_time_ms = totalResponseTime / this.total_requests;
            }
        }

        this.last_activity_at = new Date();
    }

    /**
     * Get session duration in minutes
     * @returns {number} Duration in minutes
     */
    getDuration() {
        const endTime = this.ended_at || new Date();
        return Math.round((endTime - this.started_at) / (1000 * 60));
    }

    /**
     * Get success rate percentage
     * @returns {number} Success rate (0-100)
     */
    getSuccessRate() {
        if (this.total_requests === 0) {
            return 0;
        }
        return Math.round((this.successful_requests / this.total_requests) * 100 * 100) / 100;
    }

    /**
     * Check if session is expired
     * @returns {boolean} True if expired
     */
    isExpired() {
        return this.expires_at && this.expires_at < new Date();
    }

    /**
     * Check if session is active
     * @returns {boolean} True if active
     */
    isActive() {
        return this.status === 'active' && !this.isExpired();
    }

    /**
     * Get cost per request
     * @returns {number} Average cost per request
     */
    getCostPerRequest() {
        if (this.total_requests === 0) {
            return 0;
        }
        return this.cost_usd / this.total_requests;
    }

    /**
     * Get tokens per request
     * @returns {number} Average tokens per request
     */
    getTokensPerRequest() {
        if (this.total_requests === 0) {
            return 0;
        }
        return this.tokens_used / this.total_requests;
    }

    /**
     * Get session summary for display
     * @returns {Object} Session summary
     */
    getSummary() {
        return {
            id: this.id,
            session_id: this.session_id,
            agent_name: this.agent_name,
            agent_type: this.agent_type,
            status: this.status,
            duration: this.getDuration(),
            total_requests: this.total_requests,
            success_rate: this.getSuccessRate(),
            avg_response_time_ms: this.avg_response_time_ms,
            tokens_used: this.tokens_used,
            cost_usd: this.cost_usd,
            cost_per_request: this.getCostPerRequest(),
            tokens_per_request: this.getTokensPerRequest(),
            is_active: this.isActive(),
            is_expired: this.isExpired()
        };
    }

    /**
     * Set session data field
     * @param {string} key - Data key
     * @param {any} value - Data value
     */
    setSessionData(key, value) {
        this.session_data[key] = value;
        this.last_activity_at = new Date();
    }

    /**
     * Get session data field
     * @param {string} key - Data key
     * @param {any} defaultValue - Default value if key not found
     * @returns {any} Data value
     */
    getSessionData(key, defaultValue = null) {
        return this.session_data[key] !== undefined ? this.session_data[key] : defaultValue;
    }

    /**
     * Set context data field
     * @param {string} key - Context key
     * @param {any} value - Context value
     */
    setContextData(key, value) {
        this.context_data[key] = value;
        this.last_activity_at = new Date();
    }

    /**
     * Get context data field
     * @param {string} key - Context key
     * @param {any} defaultValue - Default value if key not found
     * @returns {any} Context value
     */
    getContextData(key, defaultValue = null) {
        return this.context_data[key] !== undefined ? this.context_data[key] : defaultValue;
    }

    /**
     * Set metadata field
     * @param {string} key - Metadata key
     * @param {any} value - Metadata value
     */
    setMetadata(key, value) {
        this.metadata[key] = value;
        this.last_activity_at = new Date();
    }

    /**
     * Get metadata field
     * @param {string} key - Metadata key
     * @param {any} defaultValue - Default value if key not found
     * @returns {any} Metadata value
     */
    getMetadata(key, defaultValue = null) {
        return this.metadata[key] !== undefined ? this.metadata[key] : defaultValue;
    }

    /**
     * Extend session expiration
     * @param {number} additionalHours - Additional hours to extend
     */
    extendExpiration(additionalHours = 24) {
        if (this.expires_at) {
            this.expires_at = new Date(this.expires_at.getTime() + (additionalHours * 60 * 60 * 1000));
        } else {
            this.expires_at = new Date(Date.now() + (additionalHours * 60 * 60 * 1000));
        }
        this.last_activity_at = new Date();
    }

    /**
     * Create a child session
     * @param {Object} childData - Child session data
     * @returns {AgentSession} Child session instance
     */
    createChildSession(childData = {}) {
        const childSessionData = {
            agent_name: this.agent_name,
            agent_type: this.agent_type,
            agent_version: this.agent_version,
            parent_session_id: this.id,
            workflow_id: this.workflow_id,
            task_id: this.task_id,
            context_data: { ...this.context_data },
            metadata: { 
                ...this.metadata, 
                parent_session_id: this.id,
                created_from_parent: true 
            },
            ...childData
        };

        return new AgentSession(childSessionData);
    }

    /**
     * Create session for specific agent type
     * @param {string} agentName - Agent name
     * @param {string} agentType - Agent type
     * @param {Object} options - Session options
     * @returns {AgentSession} AgentSession instance
     */
    static createForAgent(agentName, agentType, options = {}) {
        const sessionData = {
            agent_name: agentName,
            agent_type: agentType,
            expires_at: new Date(Date.now() + (options.expirationHours || 24) * 60 * 60 * 1000),
            ...options
        };

        return new AgentSession(sessionData);
    }
}

export default AgentSession;

