/**
 * Linear Integration Main Module
 * 
 * Comprehensive Linear integration with automated main issue + sub-issue correlation,
 * bidirectional synchronization, and hierarchical task structure management.
 */

import LinearAPIClient from './api-client.js';
import LinearIssueManager from './issue-manager.js';
import LinearSyncService from './sync-service.js';
import LinearCorrelationMapper from './correlation-mapper.js';
import LinearWebhookHandler from './webhook-handler.js';
import LinearStatusSync from './status-sync.js';
import LinearProgressTracker from './progress-tracker.js';
import LinearProjectManager from './project-manager.js';
import LinearEventLogger from './event-logger.js';
import LinearCorrelationsModel from '../../database/models/correlations.js';

export class LinearIntegration {
    constructor(config = {}) {
        this.config = {
            teamId: config.teamId || process.env.LINEAR_TEAM_ID,
            projectId: config.projectId || process.env.LINEAR_PROJECT_ID,
            apiKey: config.apiKey || process.env.LINEAR_API_KEY,
            webhookSecret: config.webhookSecret || process.env.LINEAR_WEBHOOK_SECRET,
            webhookUrl: config.webhookUrl || process.env.LINEAR_WEBHOOK_URL,
            enableBidirectionalSync: config.enableBidirectionalSync !== false,
            enableRealTimeSync: config.enableRealTimeSync !== false,
            enableProgressTracking: config.enableProgressTracking !== false,
            enableProjectManagement: config.enableProjectManagement !== false,
            enableEventLogging: config.enableEventLogging !== false,
            autoCreateSubIssues: config.autoCreateSubIssues !== false,
            autoAssignProjects: config.autoAssignProjects !== false,
            conflictResolution: config.conflictResolution || 'linear_wins',
            ...config
        };

        // Validate required configuration
        this.validateConfig();

        // Initialize components
        this.apiClient = null;
        this.issueManager = null;
        this.syncService = null;
        this.correlationMapper = null;
        this.webhookHandler = null;
        this.statusSync = null;
        this.progressTracker = null;
        this.projectManager = null;
        this.eventLogger = null;
        this.correlationsModel = null;

        // Database connection (injected)
        this.database = null;

        // Initialization state
        this.isInitialized = false;
        this.initializationError = null;
    }

    /**
     * Initialize Linear integration
     */
    async initialize(database) {
        try {
            console.log('Initializing Linear Integration...');
            
            this.database = database;

            // Initialize database model
            this.correlationsModel = new LinearCorrelationsModel(database);
            await this.correlationsModel.ensureTables();

            // Initialize event logger first (for logging other component initialization)
            if (this.config.enableEventLogging) {
                this.eventLogger = new LinearEventLogger(this.config);
                await this.eventLogger.initialize(database);
            }

            // Initialize API client
            this.apiClient = new LinearAPIClient(this.config);
            
            // Test API connection
            const connectionTest = await this.apiClient.testConnection();
            if (!connectionTest.success) {
                throw new Error(`Linear API connection failed: ${connectionTest.error}`);
            }

            // Initialize issue manager
            this.issueManager = new LinearIssueManager(this.config);
            await this.issueManager.initialize?.(database, this.apiClient);

            // Initialize correlation mapper
            this.correlationMapper = new LinearCorrelationMapper(this.config);
            await this.correlationMapper.initialize(database);

            // Initialize status synchronizer
            if (this.config.enableBidirectionalSync) {
                this.statusSync = new LinearStatusSync(this.config);
                await this.statusSync.initialize(database, this.apiClient, this.getTaskMasterAPI());
            }

            // Initialize progress tracker
            if (this.config.enableProgressTracking) {
                this.progressTracker = new LinearProgressTracker(this.config);
                await this.progressTracker.initialize(database, this.apiClient, this.issueManager);
            }

            // Initialize project manager
            if (this.config.enableProjectManagement) {
                this.projectManager = new LinearProjectManager(this.config);
                await this.projectManager.initialize(database, this.apiClient, this.progressTracker);
            }

            // Initialize webhook handler
            this.webhookHandler = new LinearWebhookHandler(this.config);
            await this.webhookHandler.initialize(database);
            this.setupWebhookEventHandlers();

            // Initialize sync service
            if (this.config.enableBidirectionalSync) {
                this.syncService = new LinearSyncService(this.config);
                await this.syncService.initialize(database);
                this.setupSyncEventHandlers();
            }

            this.isInitialized = true;
            console.log('Linear Integration initialized successfully');

            // Log initialization
            if (this.eventLogger) {
                await this.eventLogger.logAuditEvent({
                    operation: 'linear_integration_initialized',
                    actor: 'system',
                    targetType: 'integration',
                    targetId: 'linear',
                    action: 'initialize',
                    context: {
                        config: this.getConfigSummary(),
                        components: this.getComponentStatus()
                    }
                });
            }

        } catch (error) {
            this.initializationError = error;
            console.error('Failed to initialize Linear Integration:', error);
            throw error;
        }
    }

    // ==================== MAIN INTEGRATION METHODS ====================

    /**
     * Create main issue from requirement
     */
    async createMainIssue(requirement) {
        this.ensureInitialized();

        try {
            // Start performance tracking
            const perfId = this.eventLogger?.startPerformanceTracking(
                `create_main_issue_${requirement.id}`,
                'create_main_issue'
            );

            // Create main issue
            const issueResult = await this.issueManager.createMainIssue(requirement);
            
            // Create correlation
            const correlation = await this.correlationMapper.createCorrelation({
                taskId: requirement.id,
                linearIssueId: issueResult.issue.id,
                correlationType: 'requirement_to_main_issue',
                metadata: {
                    requirement_title: requirement.title,
                    created_by: 'task_master',
                    auto_created: true
                }
            });

            // Auto-assign to project if enabled
            if (this.config.autoAssignProjects && this.projectManager) {
                await this.projectManager.autoAssignIssueToProject(issueResult.issue);
            }

            // Create sub-issues if tasks are provided
            let subIssues = [];
            if (this.config.autoCreateSubIssues && requirement.tasks && requirement.tasks.length > 0) {
                subIssues = await this.createSubIssues(issueResult.issue.id, requirement.tasks);
            }

            // End performance tracking
            if (perfId) {
                await this.eventLogger.endPerformanceTracking(perfId, true);
            }

            // Log operation
            if (this.eventLogger) {
                await this.eventLogger.logAuditEvent({
                    operation: 'create_main_issue',
                    actor: 'task_master',
                    targetType: 'linear_issue',
                    targetId: issueResult.issue.id,
                    action: 'create',
                    context: {
                        requirement_id: requirement.id,
                        sub_issues_count: subIssues.length,
                        correlation_id: correlation.id
                    }
                });
            }

            return {
                mainIssue: issueResult,
                subIssues,
                correlation,
                success: true
            };

        } catch (error) {
            // Log error
            if (this.eventLogger) {
                await this.eventLogger.logApiError(error, {
                    operation: 'create_main_issue',
                    requirement_id: requirement.id
                });
            }

            throw new Error(`Failed to create main issue: ${error.message}`);
        }
    }

    /**
     * Create sub-issues for tasks
     */
    async createSubIssues(parentIssueId, tasks) {
        this.ensureInitialized();

        try {
            const subIssues = [];

            for (const task of tasks) {
                // Create sub-issue
                const subIssueResult = await this.issueManager.createSubIssue(parentIssueId, task);
                
                // Create correlation
                const correlation = await this.correlationMapper.createCorrelation({
                    taskId: task.id,
                    linearIssueId: subIssueResult.issue.id,
                    parentLinearIssueId: parentIssueId,
                    correlationType: 'task_to_sub_issue',
                    metadata: {
                        task_title: task.title,
                        task_type: task.type,
                        created_by: 'task_master',
                        auto_created: true
                    }
                });

                // Auto-assign to project if enabled
                if (this.config.autoAssignProjects && this.projectManager) {
                    await this.projectManager.autoAssignIssueToProject(subIssueResult.issue);
                }

                subIssues.push({
                    ...subIssueResult,
                    correlation
                });
            }

            return subIssues;

        } catch (error) {
            throw new Error(`Failed to create sub-issues: ${error.message}`);
        }
    }

    /**
     * Sync task status to Linear
     */
    async syncTaskStatusToLinear(taskId, newStatus, oldStatus = null, context = {}) {
        this.ensureInitialized();

        if (!this.statusSync) {
            throw new Error('Status sync is not enabled');
        }

        try {
            const result = await this.statusSync.syncTaskStatusToLinear(taskId, newStatus, oldStatus, context);
            
            // Log sync operation
            if (this.eventLogger) {
                await this.eventLogger.logSyncOperation({
                    operation: 'sync_task_status_to_linear',
                    direction: 'to_linear',
                    taskId,
                    syncType: 'status_change',
                    changes: { old_status: oldStatus, new_status: newStatus },
                    success: result.success,
                    metadata: context
                });
            }

            return result;

        } catch (error) {
            // Log error
            if (this.eventLogger) {
                await this.eventLogger.logSyncOperation({
                    operation: 'sync_task_status_to_linear',
                    direction: 'to_linear',
                    taskId,
                    syncType: 'status_change',
                    success: false,
                    error: error.message
                });
            }

            throw error;
        }
    }

    /**
     * Sync Linear status to task
     */
    async syncLinearStatusToTask(linearIssueId, newStatus, oldStatus = null, context = {}) {
        this.ensureInitialized();

        if (!this.statusSync) {
            throw new Error('Status sync is not enabled');
        }

        try {
            const result = await this.statusSync.syncLinearStatusToTask(linearIssueId, newStatus, oldStatus, context);
            
            // Log sync operation
            if (this.eventLogger) {
                await this.eventLogger.logSyncOperation({
                    operation: 'sync_linear_status_to_task',
                    direction: 'to_task_master',
                    linearIssueId,
                    syncType: 'status_change',
                    changes: { old_status: oldStatus, new_status: newStatus },
                    success: result.success,
                    metadata: context
                });
            }

            return result;

        } catch (error) {
            // Log error
            if (this.eventLogger) {
                await this.eventLogger.logSyncOperation({
                    operation: 'sync_linear_status_to_task',
                    direction: 'to_task_master',
                    linearIssueId,
                    syncType: 'status_change',
                    success: false,
                    error: error.message
                });
            }

            throw error;
        }
    }

    /**
     * Update task progress
     */
    async updateTaskProgress(taskId, forceRefresh = false) {
        this.ensureInitialized();

        if (!this.progressTracker) {
            throw new Error('Progress tracking is not enabled');
        }

        try {
            const progress = await this.progressTracker.calculateTaskProgress(taskId, { forceRefresh });
            
            // Update parent issue progress if applicable
            await this.progressTracker.updateParentIssueProgress(taskId);

            return progress;

        } catch (error) {
            throw new Error(`Failed to update task progress: ${error.message}`);
        }
    }

    /**
     * Handle webhook event
     */
    async handleWebhookEvent(request, response) {
        this.ensureInitialized();

        if (!this.webhookHandler) {
            throw new Error('Webhook handling is not enabled');
        }

        return await this.webhookHandler.handleWebhook(request, response);
    }

    // ==================== EVENT HANDLERS ====================

    /**
     * Setup webhook event handlers
     */
    setupWebhookEventHandlers() {
        if (!this.webhookHandler) return;

        // Handle issue created
        this.webhookHandler.on('sync:issue_created', async (data) => {
            if (this.syncService) {
                // Check if this should be synced to Task Master
                await this.syncService.processSyncFromLinear({
                    type: 'issue_created',
                    data
                });
            }
        });

        // Handle issue updated
        this.webhookHandler.on('sync:issue_updated', async (data) => {
            if (this.syncService) {
                await this.syncService.processSyncFromLinear({
                    type: 'issue_updated',
                    data
                });
            }
        });

        // Handle potential conflicts
        this.webhookHandler.on('sync:potential_conflict', async (conflict) => {
            if (this.statusSync) {
                await this.statusSync.handleStatusConflict(conflict);
            }
        });

        // Handle comments on managed issues
        this.webhookHandler.on('sync:comment_on_managed_issue', async (data) => {
            // Log comment for audit trail
            if (this.eventLogger) {
                await this.eventLogger.logAuditEvent({
                    operation: 'comment_on_managed_issue',
                    actor: data.user?.name || 'unknown',
                    targetType: 'linear_issue',
                    targetId: data.issue_id,
                    action: 'comment',
                    context: {
                        comment_id: data.comment_id,
                        comment_body: data.body
                    }
                });
            }
        });
    }

    /**
     * Setup sync event handlers
     */
    setupSyncEventHandlers() {
        if (!this.syncService) return;

        // Handle sync completion
        this.syncService.on('sync:complete', async (results) => {
            if (this.eventLogger) {
                await this.eventLogger.logSyncOperation({
                    operation: 'full_sync',
                    direction: 'bidirectional',
                    syncType: 'full_sync',
                    success: true,
                    duration: results.duration,
                    metadata: results
                });
            }
        });

        // Handle sync errors
        this.syncService.on('sync:error', async (error) => {
            if (this.eventLogger) {
                await this.eventLogger.logSyncOperation({
                    operation: 'full_sync',
                    direction: 'bidirectional',
                    syncType: 'full_sync',
                    success: false,
                    error: error.error
                });
            }
        });

        // Handle sync conflicts
        this.syncService.on('sync:conflict', async (conflict) => {
            if (this.eventLogger) {
                await this.eventLogger.logSyncConflict(conflict);
            }
        });
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Validate configuration
     */
    validateConfig() {
        const required = ['teamId', 'apiKey'];
        const missing = required.filter(key => !this.config[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required Linear configuration: ${missing.join(', ')}`);
        }
    }

    /**
     * Ensure integration is initialized
     */
    ensureInitialized() {
        if (!this.isInitialized) {
            if (this.initializationError) {
                throw new Error(`Linear integration failed to initialize: ${this.initializationError.message}`);
            }
            throw new Error('Linear integration not initialized');
        }
    }

    /**
     * Get Task Master API (placeholder - would be injected in real implementation)
     */
    getTaskMasterAPI() {
        // This would be injected or imported from the main Task Master system
        return {
            getTask: async (taskId) => ({ id: taskId, status: 'pending' }),
            updateTaskStatus: async (taskId, status, context) => ({ success: true })
        };
    }

    /**
     * Get configuration summary (without sensitive data)
     */
    getConfigSummary() {
        return {
            team_id: this.config.teamId,
            project_id: this.config.projectId,
            bidirectional_sync: this.config.enableBidirectionalSync,
            real_time_sync: this.config.enableRealTimeSync,
            progress_tracking: this.config.enableProgressTracking,
            project_management: this.config.enableProjectManagement,
            event_logging: this.config.enableEventLogging,
            auto_create_sub_issues: this.config.autoCreateSubIssues,
            auto_assign_projects: this.config.autoAssignProjects,
            conflict_resolution: this.config.conflictResolution
        };
    }

    /**
     * Get component status
     */
    getComponentStatus() {
        return {
            api_client: !!this.apiClient,
            issue_manager: !!this.issueManager,
            sync_service: !!this.syncService,
            correlation_mapper: !!this.correlationMapper,
            webhook_handler: !!this.webhookHandler,
            status_sync: !!this.statusSync,
            progress_tracker: !!this.progressTracker,
            project_manager: !!this.projectManager,
            event_logger: !!this.eventLogger,
            correlations_model: !!this.correlationsModel
        };
    }

    // ==================== HEALTH & DIAGNOSTICS ====================

    /**
     * Get integration health status
     */
    async getHealthStatus() {
        try {
            const health = {
                status: this.isInitialized ? 'healthy' : 'error',
                initialized: this.isInitialized,
                initialization_error: this.initializationError?.message,
                components: {},
                api_connection: null,
                database_connection: !!this.database
            };

            // Test API connection
            if (this.apiClient) {
                health.api_connection = await this.apiClient.getHealthStatus();
            }

            // Get component health
            const components = [
                'issueManager', 'syncService', 'correlationMapper', 
                'webhookHandler', 'statusSync', 'progressTracker', 
                'projectManager', 'eventLogger'
            ];

            for (const component of components) {
                if (this[component] && typeof this[component].getHealthStatus === 'function') {
                    health.components[component] = await this[component].getHealthStatus();
                } else if (this[component] && typeof this[component].getStatus === 'function') {
                    health.components[component] = this[component].getStatus();
                } else {
                    health.components[component] = { status: this[component] ? 'active' : 'inactive' };
                }
            }

            return health;

        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                initialized: this.isInitialized
            };
        }
    }

    /**
     * Get integration statistics
     */
    async getStatistics() {
        const stats = {
            correlations: null,
            api_usage: null,
            sync_operations: null,
            webhook_events: null,
            performance: null
        };

        try {
            // Get correlation statistics
            if (this.correlationMapper) {
                stats.correlations = await this.correlationMapper.getStatistics();
            }

            // Get API statistics
            if (this.apiClient) {
                stats.api_usage = this.apiClient.getStatistics();
            }

            // Get sync statistics
            if (this.syncService) {
                stats.sync_operations = this.syncService.getSyncStatus();
            }

            // Get webhook statistics
            if (this.webhookHandler) {
                stats.webhook_events = await this.webhookHandler.getStatistics();
            }

            // Get performance metrics
            if (this.eventLogger) {
                stats.performance = this.eventLogger.getPerformanceMetrics();
            }

        } catch (error) {
            stats.error = error.message;
        }

        return stats;
    }

    /**
     * Generate integration report
     */
    async generateReport(timeframe = 'week') {
        try {
            const report = {
                timeframe,
                generated_at: new Date().toISOString(),
                health: await this.getHealthStatus(),
                statistics: await this.getStatistics(),
                sync_report: null,
                recommendations: []
            };

            // Generate sync report
            if (this.eventLogger) {
                report.sync_report = await this.eventLogger.generateSyncReport(timeframe);
            }

            // Add recommendations based on health and statistics
            report.recommendations = this.generateRecommendations(report);

            return report;

        } catch (error) {
            throw new Error(`Failed to generate integration report: ${error.message}`);
        }
    }

    /**
     * Generate recommendations based on report data
     */
    generateRecommendations(report) {
        const recommendations = [];

        // Check API health
        if (report.health.api_connection?.status !== 'healthy') {
            recommendations.push({
                type: 'warning',
                category: 'api',
                message: 'Linear API connection issues detected',
                action: 'Check API key and network connectivity'
            });
        }

        // Check sync performance
        if (report.statistics.performance?.avg_duration > 5000) {
            recommendations.push({
                type: 'info',
                category: 'performance',
                message: 'Sync operations are taking longer than expected',
                action: 'Consider optimizing sync batch sizes or frequency'
            });
        }

        // Check error rates
        if (report.statistics.performance?.success_rate < 0.95) {
            recommendations.push({
                type: 'warning',
                category: 'reliability',
                message: 'High error rate detected in sync operations',
                action: 'Review error logs and improve error handling'
            });
        }

        return recommendations;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        console.log('Cleaning up Linear Integration...');

        const components = [
            'syncService', 'webhookHandler', 'statusSync', 
            'progressTracker', 'projectManager', 'correlationMapper', 
            'eventLogger'
        ];

        for (const component of components) {
            if (this[component] && typeof this[component].cleanup === 'function') {
                try {
                    await this[component].cleanup();
                } catch (error) {
                    console.error(`Failed to cleanup ${component}:`, error);
                }
            }
        }

        this.isInitialized = false;
        console.log('Linear Integration cleanup completed');
    }
}

// Export all components for individual use
export {
    LinearAPIClient,
    LinearIssueManager,
    LinearSyncService,
    LinearCorrelationMapper,
    LinearWebhookHandler,
    LinearStatusSync,
    LinearProgressTracker,
    LinearProjectManager,
    LinearEventLogger,
    LinearCorrelationsModel
};

export default LinearIntegration;

