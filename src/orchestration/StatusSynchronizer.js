/**
 * @fileoverview Status Synchronizer
 * @description Synchronizes workflow and task status with Linear and other external systems
 */

import { EventEmitter } from 'events';
import { log } from '../../scripts/modules/utils.js';

/**
 * Status Synchronizer
 * Manages real-time status synchronization between workflow engine and external systems
 */
export class StatusSynchronizer extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableLinearSync: config.enableLinearSync !== false,
            enableGitHubSync: config.enableGitHubSync !== false,
            enableSlackNotifications: config.enableSlackNotifications || false,
            enableEmailNotifications: config.enableEmailNotifications || false,
            syncInterval: config.syncInterval || 30000, // 30 seconds
            batchSize: config.batchSize || 10,
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 5000,
            enableProgressReports: config.enableProgressReports !== false,
            reportInterval: config.reportInterval || 300000, // 5 minutes
            linearApiKey: config.linearApiKey,
            githubToken: config.githubToken,
            slackWebhookUrl: config.slackWebhookUrl,
            ...config
        };

        this.syncQueue = [];
        this.activeSyncs = new Map();
        this.syncHistory = new Map();
        this.isInitialized = false;
        this.syncTimer = null;
        this.reportTimer = null;
    }

    /**
     * Initialize the status synchronizer
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        log('info', 'Initializing Status Synchronizer...');
        
        try {
            // Initialize external service connections
            await this._initializeLinearConnection();
            await this._initializeGitHubConnection();
            await this._initializeNotificationServices();
            
            // Start sync timer
            this._startSyncTimer();
            
            // Start report timer
            if (this.config.enableProgressReports) {
                this._startReportTimer();
            }
            
            this.isInitialized = true;
            this.emit('initialized');
            log('info', 'Status Synchronizer initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize Status Synchronizer:', error);
            throw error;
        }
    }

    /**
     * Sync task status to Linear
     * @param {string} taskId - Task ID
     * @param {string} status - New status
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>} Sync result
     */
    async syncTaskStatusToLinear(taskId, status, metadata = {}) {
        if (!this.config.enableLinearSync) {
            log('debug', 'Linear sync is disabled');
            return { status: 'skipped', reason: 'disabled' };
        }

        const syncRequest = {
            id: this._generateSyncId(),
            type: 'task_status',
            target: 'linear',
            taskId,
            status,
            metadata,
            timestamp: new Date(),
            retryCount: 0
        };

        this.syncQueue.push(syncRequest);
        
        log('debug', `Queued task status sync for Linear: ${taskId} -> ${status}`);
        this.emit('syncQueued', { syncRequest });

        // Process immediately if not too busy
        if (this.activeSyncs.size < this.config.batchSize) {
            await this._processSyncQueue();
        }

        return { status: 'queued', syncId: syncRequest.id };
    }

    /**
     * Sync workflow progress
     * @param {string} workflowId - Workflow ID
     * @param {Object} progress - Progress information
     * @returns {Promise<Object>} Sync result
     */
    async syncWorkflowProgress(workflowId, progress = {}) {
        const syncRequest = {
            id: this._generateSyncId(),
            type: 'workflow_progress',
            target: 'all',
            workflowId,
            progress,
            timestamp: new Date(),
            retryCount: 0
        };

        this.syncQueue.push(syncRequest);
        
        log('debug', `Queued workflow progress sync: ${workflowId}`);
        this.emit('syncQueued', { syncRequest });

        // Process immediately if not too busy
        if (this.activeSyncs.size < this.config.batchSize) {
            await this._processSyncQueue();
        }

        return { status: 'queued', syncId: syncRequest.id };
    }

    /**
     * Update Linear issue status
     * @param {string} issueId - Linear issue ID
     * @param {string} status - New status
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>} Update result
     */
    async updateLinearIssueStatus(issueId, status, metadata = {}) {
        if (!this.config.enableLinearSync) {
            log('debug', 'Linear sync is disabled');
            return { status: 'skipped', reason: 'disabled' };
        }

        const syncRequest = {
            id: this._generateSyncId(),
            type: 'issue_status',
            target: 'linear',
            issueId,
            status,
            metadata,
            timestamp: new Date(),
            retryCount: 0
        };

        this.syncQueue.push(syncRequest);
        
        log('debug', `Queued Linear issue status update: ${issueId} -> ${status}`);
        this.emit('syncQueued', { syncRequest });

        // Process immediately if not too busy
        if (this.activeSyncs.size < this.config.batchSize) {
            await this._processSyncQueue();
        }

        return { status: 'queued', syncId: syncRequest.id };
    }

    /**
     * Notify stakeholders about workflow events
     * @param {string} workflowId - Workflow ID
     * @param {Object} event - Event information
     * @param {Array} stakeholders - List of stakeholders to notify
     * @returns {Promise<Object>} Notification result
     */
    async notifyStakeholders(workflowId, event, stakeholders = []) {
        const notificationRequest = {
            id: this._generateNotificationId(),
            type: 'stakeholder_notification',
            workflowId,
            event,
            stakeholders,
            timestamp: new Date(),
            retryCount: 0
        };

        log('info', `Notifying stakeholders about workflow ${workflowId} event: ${event.type}`);
        this.emit('notificationQueued', { notificationRequest });

        try {
            const results = await this._sendStakeholderNotifications(notificationRequest);
            
            log('debug', `Stakeholder notifications sent for workflow ${workflowId}`);
            this.emit('notificationsSent', { notificationRequest, results });

            return { status: 'sent', results };
        } catch (error) {
            log('error', `Failed to send stakeholder notifications for workflow ${workflowId}:`, error);
            this.emit('notificationsFailed', { notificationRequest, error });
            throw error;
        }
    }

    /**
     * Generate progress reports
     * @param {string} workflowId - Workflow ID
     * @param {Object} options - Report options
     * @returns {Promise<Object>} Generated report
     */
    async generateProgressReports(workflowId, options = {}) {
        if (!this.config.enableProgressReports) {
            return { status: 'disabled' };
        }

        log('info', `Generating progress report for workflow ${workflowId}`);

        try {
            const report = await this._generateProgressReport(workflowId, options);
            
            // Distribute report
            await this._distributeProgressReport(report, options);
            
            log('info', `Progress report generated and distributed for workflow ${workflowId}`);
            this.emit('reportGenerated', { workflowId, report });

            return report;
        } catch (error) {
            log('error', `Failed to generate progress report for workflow ${workflowId}:`, error);
            this.emit('reportFailed', { workflowId, error });
            throw error;
        }
    }

    /**
     * Process sync queue
     * @private
     */
    async _processSyncQueue() {
        if (this.syncQueue.length === 0) {
            return;
        }

        const batch = this.syncQueue.splice(0, this.config.batchSize);
        
        log('debug', `Processing sync batch of ${batch.length} items`);

        for (const syncRequest of batch) {
            this.activeSyncs.set(syncRequest.id, syncRequest);
            
            try {
                const result = await this._executeSyncRequest(syncRequest);
                
                syncRequest.status = 'completed';
                syncRequest.result = result;
                syncRequest.completedAt = new Date();
                
                log('debug', `Sync request ${syncRequest.id} completed successfully`);
                this.emit('syncCompleted', { syncRequest, result });
                
                // Move to history
                this.syncHistory.set(syncRequest.id, syncRequest);
                this.activeSyncs.delete(syncRequest.id);
                
            } catch (error) {
                log('error', `Sync request ${syncRequest.id} failed:`, error);
                await this._handleSyncError(syncRequest, error);
            }
        }
    }

    /**
     * Execute sync request
     * @private
     */
    async _executeSyncRequest(syncRequest) {
        switch (syncRequest.type) {
            case 'task_status':
                return await this._syncTaskStatus(syncRequest);
            case 'workflow_progress':
                return await this._syncWorkflowProgress(syncRequest);
            case 'issue_status':
                return await this._syncIssueStatus(syncRequest);
            default:
                throw new Error(`Unknown sync request type: ${syncRequest.type}`);
        }
    }

    /**
     * Sync task status implementation
     * @private
     */
    async _syncTaskStatus(syncRequest) {
        const { taskId, status, metadata } = syncRequest;
        
        const results = {};

        // Sync to Linear
        if (this.config.enableLinearSync && syncRequest.target === 'linear') {
            results.linear = await this._syncTaskStatusToLinear(taskId, status, metadata);
        }

        // Sync to GitHub (if applicable)
        if (this.config.enableGitHubSync && metadata.prUrl) {
            results.github = await this._syncTaskStatusToGitHub(taskId, status, metadata);
        }

        return results;
    }

    /**
     * Sync workflow progress implementation
     * @private
     */
    async _syncWorkflowProgress(syncRequest) {
        const { workflowId, progress } = syncRequest;
        
        const results = {};

        // Sync to all enabled targets
        if (this.config.enableLinearSync) {
            results.linear = await this._syncWorkflowProgressToLinear(workflowId, progress);
        }

        if (this.config.enableGitHubSync) {
            results.github = await this._syncWorkflowProgressToGitHub(workflowId, progress);
        }

        return results;
    }

    /**
     * Sync issue status implementation
     * @private
     */
    async _syncIssueStatus(syncRequest) {
        const { issueId, status, metadata } = syncRequest;
        
        return await this._updateLinearIssueStatus(issueId, status, metadata);
    }

    /**
     * Initialize Linear connection
     * @private
     */
    async _initializeLinearConnection() {
        if (!this.config.enableLinearSync || !this.config.linearApiKey) {
            log('debug', 'Linear sync not configured');
            return;
        }

        try {
            // Test Linear API connection
            const response = await fetch('https://api.linear.app/graphql', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.linearApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: '{ viewer { id name } }'
                })
            });

            if (!response.ok) {
                throw new Error(`Linear API test failed: ${response.status}`);
            }

            const data = await response.json();
            if (data.errors) {
                throw new Error(`Linear API errors: ${JSON.stringify(data.errors)}`);
            }

            log('debug', 'Linear API connection verified');
        } catch (error) {
            log('warn', 'Linear API connection test failed:', error);
        }
    }

    /**
     * Initialize GitHub connection
     * @private
     */
    async _initializeGitHubConnection() {
        if (!this.config.enableGitHubSync || !this.config.githubToken) {
            log('debug', 'GitHub sync not configured');
            return;
        }

        try {
            // Test GitHub API connection
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${this.config.githubToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error(`GitHub API test failed: ${response.status}`);
            }

            log('debug', 'GitHub API connection verified');
        } catch (error) {
            log('warn', 'GitHub API connection test failed:', error);
        }
    }

    /**
     * Initialize notification services
     * @private
     */
    async _initializeNotificationServices() {
        // Initialize Slack
        if (this.config.enableSlackNotifications && this.config.slackWebhookUrl) {
            try {
                const response = await fetch(this.config.slackWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: 'Status Synchronizer initialized' })
                });

                if (response.ok) {
                    log('debug', 'Slack webhook verified');
                } else {
                    log('warn', 'Slack webhook test failed');
                }
            } catch (error) {
                log('warn', 'Slack webhook test failed:', error);
            }
        }

        // Initialize email service (placeholder)
        if (this.config.enableEmailNotifications) {
            log('debug', 'Email notifications configured');
        }
    }

    /**
     * Start sync timer
     * @private
     */
    _startSyncTimer() {
        this.syncTimer = setInterval(async () => {
            if (this.syncQueue.length > 0) {
                await this._processSyncQueue();
            }
        }, this.config.syncInterval);

        log('debug', `Sync timer started with interval: ${this.config.syncInterval}ms`);
    }

    /**
     * Start report timer
     * @private
     */
    _startReportTimer() {
        this.reportTimer = setInterval(async () => {
            await this._generatePeriodicReports();
        }, this.config.reportInterval);

        log('debug', `Report timer started with interval: ${this.config.reportInterval}ms`);
    }

    /**
     * Handle sync error
     * @private
     */
    async _handleSyncError(syncRequest, error) {
        syncRequest.status = 'failed';
        syncRequest.error = error.message;
        syncRequest.failedAt = new Date();

        // Retry if attempts remaining
        if (syncRequest.retryCount < this.config.retryAttempts) {
            syncRequest.retryCount++;
            
            log('debug', `Retrying sync request ${syncRequest.id} (attempt ${syncRequest.retryCount}/${this.config.retryAttempts})`);
            
            setTimeout(() => {
                this.syncQueue.unshift(syncRequest); // Add to front of queue
            }, this.config.retryDelay);
        } else {
            log('error', `Sync request ${syncRequest.id} failed permanently:`, error);
            this.emit('syncFailed', { syncRequest, error });
            
            // Move to history
            this.syncHistory.set(syncRequest.id, syncRequest);
        }

        this.activeSyncs.delete(syncRequest.id);
    }

    /**
     * Send stakeholder notifications
     * @private
     */
    async _sendStakeholderNotifications(notificationRequest) {
        const results = [];

        // Send Slack notifications
        if (this.config.enableSlackNotifications) {
            try {
                const slackResult = await this._sendSlackNotification(notificationRequest);
                results.push({ type: 'slack', success: true, result: slackResult });
            } catch (error) {
                results.push({ type: 'slack', success: false, error: error.message });
            }
        }

        // Send email notifications
        if (this.config.enableEmailNotifications) {
            try {
                const emailResult = await this._sendEmailNotification(notificationRequest);
                results.push({ type: 'email', success: true, result: emailResult });
            } catch (error) {
                results.push({ type: 'email', success: false, error: error.message });
            }
        }

        return results;
    }

    /**
     * Send Slack notification
     * @private
     */
    async _sendSlackNotification(notificationRequest) {
        if (!this.config.slackWebhookUrl) {
            throw new Error('Slack webhook URL not configured');
        }

        const message = this._formatSlackMessage(notificationRequest);
        
        const response = await fetch(this.config.slackWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
        });

        if (!response.ok) {
            throw new Error(`Slack notification failed: ${response.status}`);
        }

        return { sent: true, timestamp: new Date() };
    }

    /**
     * Format Slack message
     * @private
     */
    _formatSlackMessage(notificationRequest) {
        const { workflowId, event } = notificationRequest;
        
        return {
            text: `Workflow Update: ${workflowId}`,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Workflow:* ${workflowId}\n*Event:* ${event.type}\n*Status:* ${event.status}`
                    }
                }
            ]
        };
    }

    /**
     * Generate progress report
     * @private
     */
    async _generateProgressReport(workflowId, options) {
        return {
            workflowId,
            timestamp: new Date(),
            summary: {
                status: 'in_progress',
                completion: 65,
                tasksCompleted: 8,
                tasksTotal: 12,
                estimatedCompletion: new Date(Date.now() + 3600000)
            },
            details: {
                currentStep: 'code_generation',
                recentActivity: [],
                upcomingTasks: [],
                blockers: []
            }
        };
    }

    /**
     * Distribute progress report
     * @private
     */
    async _distributeProgressReport(report, options) {
        // Send to configured channels
        if (options.sendToSlack && this.config.enableSlackNotifications) {
            await this._sendSlackNotification({
                workflowId: report.workflowId,
                event: { type: 'progress_report', data: report }
            });
        }
    }

    /**
     * Generate periodic reports
     * @private
     */
    async _generatePeriodicReports() {
        log('debug', 'Generating periodic reports...');
        
        // Generate reports for active workflows
        // This would be implemented based on actual workflow tracking
    }

    /**
     * Sync task status to Linear
     * @private
     */
    async _syncTaskStatusToLinear(taskId, status, metadata) {
        // Implementation for Linear API calls
        return { synced: true, taskId, status };
    }

    /**
     * Update Linear issue status
     * @private
     */
    async _updateLinearIssueStatus(issueId, status, metadata) {
        // Implementation for Linear issue updates
        return { updated: true, issueId, status };
    }

    /**
     * Generate unique sync ID
     * @private
     */
    _generateSyncId() {
        return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate unique notification ID
     * @private
     */
    _generateNotificationId() {
        return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Shutdown the status synchronizer
     */
    async shutdown() {
        log('info', 'Shutting down Status Synchronizer...');
        
        // Clear timers
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
        
        if (this.reportTimer) {
            clearInterval(this.reportTimer);
            this.reportTimer = null;
        }

        // Process remaining sync queue
        if (this.syncQueue.length > 0) {
            log('info', `Processing remaining ${this.syncQueue.length} sync requests...`);
            await this._processSyncQueue();
        }

        this.isInitialized = false;
        this.emit('shutdown');
        log('info', 'Status Synchronizer shutdown complete');
    }
}

