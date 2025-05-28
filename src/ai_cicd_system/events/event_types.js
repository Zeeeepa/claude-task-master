/**
 * @fileoverview Event Type Definitions
 * @description Centralized event type definitions for the AI CI/CD system
 */

/**
 * System-level events
 */
export const SYSTEM_EVENTS = {
    // System lifecycle
    SYSTEM_STARTED: 'system.started',
    SYSTEM_STOPPED: 'system.stopped',
    SYSTEM_SHUTDOWN: 'system.shutdown',
    SYSTEM_MAINTENANCE: 'system.maintenance',
    SYSTEM_ERROR: 'system.error',
    SYSTEM_HEALTH_CHECK: 'system.health_check',
    
    // Component lifecycle
    COMPONENT_INITIALIZED: 'system.component.initialized',
    COMPONENT_STARTED: 'system.component.started',
    COMPONENT_STOPPED: 'system.component.stopped',
    COMPONENT_ERROR: 'system.component.error',
    COMPONENT_HEALTH_CHECK: 'system.component.health_check'
};

/**
 * Workflow-related events
 */
export const WORKFLOW_EVENTS = {
    // Workflow lifecycle
    WORKFLOW_CREATED: 'workflow.created',
    WORKFLOW_STARTED: 'workflow.started',
    WORKFLOW_COMPLETED: 'workflow.completed',
    WORKFLOW_FAILED: 'workflow.failed',
    WORKFLOW_CANCELLED: 'workflow.cancelled',
    WORKFLOW_PAUSED: 'workflow.paused',
    WORKFLOW_RESUMED: 'workflow.resumed',
    
    // Step-level events
    STEP_STARTED: 'workflow.step.started',
    STEP_COMPLETED: 'workflow.step.completed',
    STEP_FAILED: 'workflow.step.failed',
    STEP_RETRYING: 'workflow.step.retrying',
    STEP_SKIPPED: 'workflow.step.skipped',
    
    // Workflow management
    WORKFLOW_REGISTERED: 'workflow.registered',
    WORKFLOW_UNREGISTERED: 'workflow.unregistered',
    WORKFLOW_METRICS_UPDATED: 'workflow.metrics.updated'
};

/**
 * Task-related events
 */
export const TASK_EVENTS = {
    // Task lifecycle
    TASK_CREATED: 'task.created',
    TASK_ASSIGNED: 'task.assigned',
    TASK_STARTED: 'task.started',
    TASK_COMPLETED: 'task.completed',
    TASK_FAILED: 'task.failed',
    TASK_CANCELLED: 'task.cancelled',
    TASK_UPDATED: 'task.updated',
    
    // Task processing
    TASK_ANALYZED: 'task.analyzed',
    TASK_PLANNED: 'task.planned',
    TASK_VALIDATED: 'task.validated',
    TASK_ARCHIVED: 'task.archived',
    
    // Task dependencies
    DEPENDENCY_RESOLVED: 'task.dependency.resolved',
    DEPENDENCY_BLOCKED: 'task.dependency.blocked',
    DEPENDENCY_UPDATED: 'task.dependency.updated'
};

/**
 * Pull Request events
 */
export const PR_EVENTS = {
    // PR lifecycle
    PR_CREATED: 'pr.created',
    PR_UPDATED: 'pr.updated',
    PR_MERGED: 'pr.merged',
    PR_CLOSED: 'pr.closed',
    PR_REOPENED: 'pr.reopened',
    PR_DRAFT_READY: 'pr.draft_ready',
    
    // PR reviews
    REVIEW_REQUESTED: 'pr.review.requested',
    REVIEW_SUBMITTED: 'pr.review.submitted',
    REVIEW_APPROVED: 'pr.review.approved',
    REVIEW_REJECTED: 'pr.review.rejected',
    REVIEW_DISMISSED: 'pr.review.dismissed',
    
    // PR checks
    CHECK_STARTED: 'pr.check.started',
    CHECK_COMPLETED: 'pr.check.completed',
    CHECK_FAILED: 'pr.check.failed',
    CHECK_CANCELLED: 'pr.check.cancelled',
    
    // PR comments
    COMMENT_ADDED: 'pr.comment.added',
    COMMENT_UPDATED: 'pr.comment.updated',
    COMMENT_DELETED: 'pr.comment.deleted'
};

/**
 * Validation events
 */
export const VALIDATION_EVENTS = {
    // Validation lifecycle
    VALIDATION_STARTED: 'validation.started',
    VALIDATION_COMPLETED: 'validation.completed',
    VALIDATION_FAILED: 'validation.failed',
    VALIDATION_CANCELLED: 'validation.cancelled',
    
    // Validation checks
    CODE_QUALITY_CHECK: 'validation.code_quality',
    SECURITY_CHECK: 'validation.security',
    TEST_CHECK: 'validation.test',
    PERFORMANCE_CHECK: 'validation.performance',
    COMPLIANCE_CHECK: 'validation.compliance',
    
    // Validation results
    VULNERABILITY_FOUND: 'validation.vulnerability.found',
    TEST_FAILURE: 'validation.test.failure',
    PERFORMANCE_ISSUE: 'validation.performance.issue',
    COMPLIANCE_VIOLATION: 'validation.compliance.violation'
};

/**
 * Integration events
 */
export const INTEGRATION_EVENTS = {
    // External integrations
    GITHUB_EVENT: 'integration.github',
    LINEAR_EVENT: 'integration.linear',
    SLACK_EVENT: 'integration.slack',
    CODEGEN_EVENT: 'integration.codegen',
    
    // API events
    API_REQUEST: 'integration.api.request',
    API_RESPONSE: 'integration.api.response',
    API_ERROR: 'integration.api.error',
    API_RATE_LIMIT: 'integration.api.rate_limit',
    
    // Webhook events
    WEBHOOK_RECEIVED: 'integration.webhook.received',
    WEBHOOK_PROCESSED: 'integration.webhook.processed',
    WEBHOOK_FAILED: 'integration.webhook.failed'
};

/**
 * Performance and monitoring events
 */
export const MONITORING_EVENTS = {
    // Performance metrics
    PERFORMANCE_METRIC: 'monitoring.performance.metric',
    MEMORY_USAGE: 'monitoring.memory.usage',
    CPU_USAGE: 'monitoring.cpu.usage',
    DISK_USAGE: 'monitoring.disk.usage',
    NETWORK_USAGE: 'monitoring.network.usage',
    
    // Alerts and thresholds
    THRESHOLD_EXCEEDED: 'monitoring.threshold.exceeded',
    ALERT_TRIGGERED: 'monitoring.alert.triggered',
    ALERT_RESOLVED: 'monitoring.alert.resolved',
    
    // Health checks
    HEALTH_CHECK_PASSED: 'monitoring.health.passed',
    HEALTH_CHECK_FAILED: 'monitoring.health.failed',
    SERVICE_DEGRADED: 'monitoring.service.degraded',
    SERVICE_RECOVERED: 'monitoring.service.recovered'
};

/**
 * Error and logging events
 */
export const ERROR_EVENTS = {
    // Error levels
    ERROR_CRITICAL: 'error.critical',
    ERROR_HIGH: 'error.high',
    ERROR_MEDIUM: 'error.medium',
    ERROR_LOW: 'error.low',
    
    // Error types
    VALIDATION_ERROR: 'error.validation',
    NETWORK_ERROR: 'error.network',
    DATABASE_ERROR: 'error.database',
    AUTHENTICATION_ERROR: 'error.authentication',
    AUTHORIZATION_ERROR: 'error.authorization',
    TIMEOUT_ERROR: 'error.timeout',
    
    // Error handling
    ERROR_RECOVERED: 'error.recovered',
    ERROR_ESCALATED: 'error.escalated',
    ERROR_IGNORED: 'error.ignored'
};

/**
 * Database events
 */
export const DATABASE_EVENTS = {
    // Connection events
    CONNECTION_OPENED: 'database.connection.opened',
    CONNECTION_CLOSED: 'database.connection.closed',
    CONNECTION_ERROR: 'database.connection.error',
    CONNECTION_TIMEOUT: 'database.connection.timeout',
    
    // Query events
    QUERY_STARTED: 'database.query.started',
    QUERY_COMPLETED: 'database.query.completed',
    QUERY_FAILED: 'database.query.failed',
    QUERY_SLOW: 'database.query.slow',
    
    // Transaction events
    TRANSACTION_STARTED: 'database.transaction.started',
    TRANSACTION_COMMITTED: 'database.transaction.committed',
    TRANSACTION_ROLLED_BACK: 'database.transaction.rolled_back',
    
    // Migration events
    MIGRATION_STARTED: 'database.migration.started',
    MIGRATION_COMPLETED: 'database.migration.completed',
    MIGRATION_FAILED: 'database.migration.failed'
};

/**
 * All event types combined for easy access
 */
export const ALL_EVENTS = {
    ...SYSTEM_EVENTS,
    ...WORKFLOW_EVENTS,
    ...TASK_EVENTS,
    ...PR_EVENTS,
    ...VALIDATION_EVENTS,
    ...INTEGRATION_EVENTS,
    ...MONITORING_EVENTS,
    ...ERROR_EVENTS,
    ...DATABASE_EVENTS
};

/**
 * Event categories for filtering and organization
 */
export const EVENT_CATEGORIES = {
    SYSTEM: 'system',
    WORKFLOW: 'workflow',
    TASK: 'task',
    PR: 'pr',
    VALIDATION: 'validation',
    INTEGRATION: 'integration',
    MONITORING: 'monitoring',
    ERROR: 'error',
    DATABASE: 'database'
};

/**
 * Event priority levels
 */
export const EVENT_PRIORITIES = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    INFO: 'info'
};

/**
 * Event severity levels
 */
export const EVENT_SEVERITIES = {
    FATAL: 'fatal',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
    DEBUG: 'debug'
};

/**
 * Utility functions for event handling
 */
export const EventUtils = {
    /**
     * Get event category from event type
     * @param {string} eventType - Event type
     * @returns {string} Event category
     */
    getCategory(eventType) {
        const parts = eventType.split('.');
        return parts[0] || 'unknown';
    },

    /**
     * Check if event is system-level
     * @param {string} eventType - Event type
     * @returns {boolean} True if system event
     */
    isSystemEvent(eventType) {
        return eventType.startsWith('system.');
    },

    /**
     * Check if event is workflow-related
     * @param {string} eventType - Event type
     * @returns {boolean} True if workflow event
     */
    isWorkflowEvent(eventType) {
        return eventType.startsWith('workflow.');
    },

    /**
     * Check if event is error-related
     * @param {string} eventType - Event type
     * @returns {boolean} True if error event
     */
    isErrorEvent(eventType) {
        return eventType.startsWith('error.') || eventType.includes('.error') || eventType.includes('.failed');
    },

    /**
     * Get event priority based on type
     * @param {string} eventType - Event type
     * @returns {string} Event priority
     */
    getPriority(eventType) {
        if (this.isErrorEvent(eventType)) {
            if (eventType.includes('critical')) return EVENT_PRIORITIES.CRITICAL;
            if (eventType.includes('high')) return EVENT_PRIORITIES.HIGH;
            return EVENT_PRIORITIES.MEDIUM;
        }
        
        if (eventType.includes('started') || eventType.includes('completed')) {
            return EVENT_PRIORITIES.INFO;
        }
        
        return EVENT_PRIORITIES.LOW;
    },

    /**
     * Create event object with standard structure
     * @param {string} type - Event type
     * @param {*} data - Event data
     * @param {Object} options - Additional options
     * @returns {Object} Standardized event object
     */
    createEvent(type, data = {}, options = {}) {
        return {
            type,
            data,
            timestamp: new Date(),
            id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            category: this.getCategory(type),
            priority: options.priority || this.getPriority(type),
            severity: options.severity || EVENT_SEVERITIES.INFO,
            source: options.source || 'system',
            metadata: options.metadata || {}
        };
    },

    /**
     * Validate event structure
     * @param {Object} event - Event to validate
     * @returns {boolean} True if valid
     */
    isValidEvent(event) {
        return event &&
               typeof event.type === 'string' &&
               event.timestamp instanceof Date &&
               typeof event.id === 'string';
    }
};

export default {
    SYSTEM_EVENTS,
    WORKFLOW_EVENTS,
    TASK_EVENTS,
    PR_EVENTS,
    VALIDATION_EVENTS,
    INTEGRATION_EVENTS,
    MONITORING_EVENTS,
    ERROR_EVENTS,
    DATABASE_EVENTS,
    ALL_EVENTS,
    EVENT_CATEGORIES,
    EVENT_PRIORITIES,
    EVENT_SEVERITIES,
    EventUtils
};

