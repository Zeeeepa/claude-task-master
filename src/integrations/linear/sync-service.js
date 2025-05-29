/**
 * Linear Sync Service
 * 
 * Handles bidirectional synchronization between Task Master and Linear,
 * including conflict resolution, sync status tracking, and incremental optimization.
 */

import LinearAPIClient from './api-client.js';
import LinearIssueManager from './issue-manager.js';

export class LinearSyncService {
    constructor(config = {}) {
        this.config = {
            teamId: config.teamId || process.env.LINEAR_TEAM_ID,
            syncInterval: config.syncInterval || 30000, // 30 seconds
            batchSize: config.batchSize || 10,
            conflictResolution: config.conflictResolution || 'linear_wins', // 'linear_wins', 'task_master_wins', 'manual'
            enableRealTimeSync: config.enableRealTimeSync !== false,
            enableIncrementalSync: config.enableIncrementalSync !== false,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 5000,
            ...config
        };

        this.apiClient = new LinearAPIClient(config);
        this.issueManager = new LinearIssueManager(config);
        
        // Sync state management
        this.syncState = {
            isRunning: false,
            lastSync: null,
            lastSuccessfulSync: null,
            syncCount: 0,
            errorCount: 0,
            conflictCount: 0
        };

        // Sync queues
        this.syncQueues = {
            toLinear: [], // Task Master -> Linear
            fromLinear: [], // Linear -> Task Master
            conflicts: [] // Conflicts requiring resolution
        };

        // Event handlers
        this.eventHandlers = new Map();
        
        // Sync interval timer
        this.syncTimer = null;
        
        // Database connection (injected)
        this.database = null;
    }

    /**
     * Initialize sync service
     */
    async initialize(database) {
        this.database = database;
        
        // Test connections
        await this.testConnections();
        
        // Load sync state from database
        await this.loadSyncState();
        
        // Start sync timer if enabled
        if (this.config.enableRealTimeSync) {
            this.startSyncTimer();
        }
        
        console.log('Linear Sync Service initialized');
    }

    /**
     * Start sync timer
     */
    startSyncTimer() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
        }
        
        this.syncTimer = setInterval(async () => {
            try {
                await this.performIncrementalSync();
            } catch (error) {
                console.error('Sync timer error:', error);
                this.syncState.errorCount++;
            }
        }, this.config.syncInterval);
        
        console.log(`Sync timer started with ${this.config.syncInterval}ms interval`);
    }

    /**
     * Stop sync timer
     */
    stopSyncTimer() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    // ==================== BIDIRECTIONAL SYNC ====================

    /**
     * Perform full bidirectional sync
     */
    async performFullSync() {
        if (this.syncState.isRunning) {
            throw new Error('Sync already in progress');
        }

        this.syncState.isRunning = true;
        this.syncState.lastSync = new Date();
        
        try {
            console.log('Starting full bidirectional sync...');
            
            // Phase 1: Sync Task Master changes to Linear
            const toLinearResults = await this.syncToLinear();
            
            // Phase 2: Sync Linear changes to Task Master
            const fromLinearResults = await this.syncFromLinear();
            
            // Phase 3: Resolve conflicts
            const conflictResults = await this.resolveConflicts();
            
            // Update sync state
            this.syncState.lastSuccessfulSync = new Date();
            this.syncState.syncCount++;
            
            const results = {
                success: true,
                timestamp: new Date().toISOString(),
                toLinear: toLinearResults,
                fromLinear: fromLinearResults,
                conflicts: conflictResults,
                duration: Date.now() - this.syncState.lastSync.getTime()
            };
            
            // Save sync state
            await this.saveSyncState();
            
            // Emit sync complete event
            this.emit('sync:complete', results);
            
            console.log('Full sync completed successfully');
            return results;
            
        } catch (error) {
            this.syncState.errorCount++;
            console.error('Full sync failed:', error);
            
            const errorResult = {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
            
            this.emit('sync:error', errorResult);
            throw error;
            
        } finally {
            this.syncState.isRunning = false;
        }
    }

    /**
     * Perform incremental sync
     */
    async performIncrementalSync() {
        if (!this.config.enableIncrementalSync || this.syncState.isRunning) {
            return;
        }

        try {
            const lastSync = this.syncState.lastSuccessfulSync || new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago
            
            // Get changes since last sync
            const taskMasterChanges = await this.getTaskMasterChangesSince(lastSync);
            const linearChanges = await this.getLinearChangesSince(lastSync);
            
            if (taskMasterChanges.length === 0 && linearChanges.length === 0) {
                return; // No changes to sync
            }
            
            console.log(`Incremental sync: ${taskMasterChanges.length} Task Master changes, ${linearChanges.length} Linear changes`);
            
            // Process changes in batches
            await this.processSyncBatch(taskMasterChanges, linearChanges);
            
        } catch (error) {
            console.error('Incremental sync error:', error);
            this.syncState.errorCount++;
        }
    }

    // ==================== SYNC TO LINEAR ====================

    /**
     * Sync Task Master changes to Linear
     */
    async syncToLinear() {
        const changes = await this.getTaskMasterChanges();
        const results = {
            processed: 0,
            created: 0,
            updated: 0,
            errors: []
        };

        for (const change of changes) {
            try {
                const result = await this.processSyncToLinear(change);
                results.processed++;
                
                if (result.action === 'created') {
                    results.created++;
                } else if (result.action === 'updated') {
                    results.updated++;
                }
                
            } catch (error) {
                results.errors.push({
                    change_id: change.id,
                    error: error.message
                });
                console.error(`Failed to sync change ${change.id} to Linear:`, error);
            }
        }

        return results;
    }

    /**
     * Process individual sync to Linear
     */
    async processSyncToLinear(change) {
        switch (change.type) {
            case 'task_created':
                return await this.createLinearIssueFromTask(change.data);
                
            case 'task_updated':
                return await this.updateLinearIssueFromTask(change.data);
                
            case 'task_status_changed':
                return await this.updateLinearIssueStatus(change.data);
                
            case 'requirement_created':
                return await this.createLinearMainIssue(change.data);
                
            default:
                throw new Error(`Unknown change type: ${change.type}`);
        }
    }

    /**
     * Create Linear issue from Task Master task
     */
    async createLinearIssueFromTask(task) {
        const correlation = await this.getTaskCorrelation(task.id);
        
        if (correlation && correlation.linear_issue_id) {
            // Issue already exists, update instead
            return await this.updateLinearIssueFromTask(task);
        }

        const issueResult = await this.issueManager.createSubIssue(
            correlation?.parent_linear_issue_id,
            task
        );

        // Store correlation
        await this.storeCorrelation({
            task_id: task.id,
            linear_issue_id: issueResult.issue.id,
            correlation_type: 'task_to_issue',
            sync_direction: 'to_linear',
            created_at: new Date()
        });

        return {
            action: 'created',
            linear_issue_id: issueResult.issue.id,
            task_id: task.id
        };
    }

    /**
     * Update Linear issue from Task Master task
     */
    async updateLinearIssueFromTask(task) {
        const correlation = await this.getTaskCorrelation(task.id);
        
        if (!correlation || !correlation.linear_issue_id) {
            throw new Error(`No Linear issue correlation found for task ${task.id}`);
        }

        // Check for conflicts
        const conflict = await this.detectUpdateConflict(correlation.linear_issue_id, task);
        if (conflict) {
            await this.handleConflict(conflict);
            return { action: 'conflict', conflict_id: conflict.id };
        }

        // Update issue
        await this.issueManager.updateIssueProgress(correlation.linear_issue_id, {
            description: task.description,
            priority: task.priority,
            comment: `Updated from Task Master: ${task.title}`
        });

        // Update correlation timestamp
        await this.updateCorrelationTimestamp(correlation.id);

        return {
            action: 'updated',
            linear_issue_id: correlation.linear_issue_id,
            task_id: task.id
        };
    }

    /**
     * Update Linear issue status
     */
    async updateLinearIssueStatus(statusChange) {
        const correlation = await this.getTaskCorrelation(statusChange.task_id);
        
        if (!correlation || !correlation.linear_issue_id) {
            console.warn(`No Linear issue correlation found for task ${statusChange.task_id}`);
            return { action: 'skipped' };
        }

        await this.issueManager.updateIssueStatus(
            correlation.linear_issue_id,
            statusChange.new_status,
            `Status updated from Task Master: ${statusChange.old_status} → ${statusChange.new_status}`
        );

        return {
            action: 'status_updated',
            linear_issue_id: correlation.linear_issue_id,
            task_id: statusChange.task_id,
            status: statusChange.new_status
        };
    }

    // ==================== SYNC FROM LINEAR ====================

    /**
     * Sync Linear changes to Task Master
     */
    async syncFromLinear() {
        const changes = await this.getLinearChanges();
        const results = {
            processed: 0,
            created: 0,
            updated: 0,
            errors: []
        };

        for (const change of changes) {
            try {
                const result = await this.processSyncFromLinear(change);
                results.processed++;
                
                if (result.action === 'created') {
                    results.created++;
                } else if (result.action === 'updated') {
                    results.updated++;
                }
                
            } catch (error) {
                results.errors.push({
                    change_id: change.id,
                    error: error.message
                });
                console.error(`Failed to sync change ${change.id} from Linear:`, error);
            }
        }

        return results;
    }

    /**
     * Process individual sync from Linear
     */
    async processSyncFromLinear(change) {
        switch (change.type) {
            case 'issue_created':
                return await this.createTaskFromLinearIssue(change.data);
                
            case 'issue_updated':
                return await this.updateTaskFromLinearIssue(change.data);
                
            case 'issue_status_changed':
                return await this.updateTaskStatusFromLinear(change.data);
                
            case 'comment_added':
                return await this.syncLinearComment(change.data);
                
            default:
                throw new Error(`Unknown change type: ${change.type}`);
        }
    }

    /**
     * Create Task Master task from Linear issue
     */
    async createTaskFromLinearIssue(issue) {
        const correlation = await this.getLinearCorrelation(issue.id);
        
        if (correlation && correlation.task_id) {
            // Task already exists, update instead
            return await this.updateTaskFromLinearIssue(issue);
        }

        // Create task in Task Master
        const task = await this.createTaskMasterTask({
            title: issue.title,
            description: issue.description,
            status: this.mapLinearStatusToTaskMaster(issue.state.name),
            priority: this.mapLinearPriorityToTaskMaster(issue.priority),
            assignee_id: issue.assignee?.id,
            linear_issue_id: issue.id
        });

        // Store correlation
        await this.storeCorrelation({
            task_id: task.id,
            linear_issue_id: issue.id,
            correlation_type: 'issue_to_task',
            sync_direction: 'from_linear',
            created_at: new Date()
        });

        return {
            action: 'created',
            task_id: task.id,
            linear_issue_id: issue.id
        };
    }

    // ==================== CONFLICT RESOLUTION ====================

    /**
     * Detect update conflict
     */
    async detectUpdateConflict(linearIssueId, taskData) {
        const linearIssue = await this.apiClient.getIssue(linearIssueId);
        const correlation = await this.getLinearCorrelation(linearIssueId);
        
        if (!correlation) return null;

        const lastSyncTime = correlation.last_synced_at;
        const linearUpdatedAt = new Date(linearIssue.updatedAt);
        const taskUpdatedAt = new Date(taskData.updated_at);

        // Check if both sides were updated after last sync
        if (linearUpdatedAt > lastSyncTime && taskUpdatedAt > lastSyncTime) {
            return {
                id: `conflict_${Date.now()}`,
                type: 'update_conflict',
                linear_issue_id: linearIssueId,
                task_id: taskData.id,
                linear_data: {
                    title: linearIssue.title,
                    description: linearIssue.description,
                    status: linearIssue.state.name,
                    updated_at: linearUpdatedAt
                },
                task_data: {
                    title: taskData.title,
                    description: taskData.description,
                    status: taskData.status,
                    updated_at: taskUpdatedAt
                },
                detected_at: new Date()
            };
        }

        return null;
    }

    /**
     * Handle conflict based on resolution strategy
     */
    async handleConflict(conflict) {
        switch (this.config.conflictResolution) {
            case 'linear_wins':
                return await this.resolveConflictLinearWins(conflict);
                
            case 'task_master_wins':
                return await this.resolveConflictTaskMasterWins(conflict);
                
            case 'manual':
                return await this.queueConflictForManualResolution(conflict);
                
            default:
                throw new Error(`Unknown conflict resolution strategy: ${this.config.conflictResolution}`);
        }
    }

    /**
     * Resolve conflict with Linear data winning
     */
    async resolveConflictLinearWins(conflict) {
        // Update Task Master with Linear data
        await this.updateTaskMasterFromLinear(conflict.task_id, conflict.linear_data);
        
        // Log resolution
        await this.logConflictResolution(conflict.id, 'linear_wins');
        
        return { resolution: 'linear_wins', conflict_id: conflict.id };
    }

    /**
     * Resolve conflict with Task Master data winning
     */
    async resolveConflictTaskMasterWins(conflict) {
        // Update Linear with Task Master data
        await this.updateLinearFromTaskMaster(conflict.linear_issue_id, conflict.task_data);
        
        // Log resolution
        await this.logConflictResolution(conflict.id, 'task_master_wins');
        
        return { resolution: 'task_master_wins', conflict_id: conflict.id };
    }

    /**
     * Queue conflict for manual resolution
     */
    async queueConflictForManualResolution(conflict) {
        this.syncQueues.conflicts.push(conflict);
        this.syncState.conflictCount++;
        
        // Store conflict in database
        await this.storeConflict(conflict);
        
        // Emit conflict event
        this.emit('sync:conflict', conflict);
        
        return { resolution: 'queued_for_manual', conflict_id: conflict.id };
    }

    /**
     * Resolve all pending conflicts
     */
    async resolveConflicts() {
        const results = {
            resolved: 0,
            failed: 0,
            errors: []
        };

        for (const conflict of this.syncQueues.conflicts) {
            try {
                await this.handleConflict(conflict);
                results.resolved++;
            } catch (error) {
                results.failed++;
                results.errors.push({
                    conflict_id: conflict.id,
                    error: error.message
                });
            }
        }

        // Clear resolved conflicts
        this.syncQueues.conflicts = [];

        return results;
    }

    // ==================== DATA MAPPING ====================

    /**
     * Map Linear status to Task Master status
     */
    mapLinearStatusToTaskMaster(linearStatus) {
        const statusMap = {
            'Todo': 'pending',
            'In Progress': 'in_progress',
            'In Review': 'validation',
            'Done': 'completed',
            'Cancelled': 'cancelled'
        };
        
        return statusMap[linearStatus] || 'pending';
    }

    /**
     * Map Linear priority to Task Master priority
     */
    mapLinearPriorityToTaskMaster(linearPriority) {
        const priorityMap = {
            1: 'urgent',
            2: 'high',
            3: 'medium',
            4: 'low'
        };
        
        return priorityMap[linearPriority] || 'medium';
    }

    // ==================== DATABASE OPERATIONS ====================

    /**
     * Get task correlation
     */
    async getTaskCorrelation(taskId) {
        if (!this.database) return null;
        
        const query = `
            SELECT * FROM linear_correlations 
            WHERE task_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 1
        `;
        
        const result = await this.database.query(query, [taskId]);
        return result.rows[0] || null;
    }

    /**
     * Get Linear correlation
     */
    async getLinearCorrelation(linearIssueId) {
        if (!this.database) return null;
        
        const query = `
            SELECT * FROM linear_correlations 
            WHERE linear_issue_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 1
        `;
        
        const result = await this.database.query(query, [linearIssueId]);
        return result.rows[0] || null;
    }

    /**
     * Store correlation
     */
    async storeCorrelation(correlationData) {
        if (!this.database) return;
        
        const query = `
            INSERT INTO linear_correlations (
                task_id, linear_issue_id, correlation_type, 
                sync_direction, metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `;
        
        const values = [
            correlationData.task_id,
            correlationData.linear_issue_id,
            correlationData.correlation_type,
            correlationData.sync_direction,
            JSON.stringify(correlationData.metadata || {}),
            correlationData.created_at
        ];
        
        const result = await this.database.query(query, values);
        return result.rows[0].id;
    }

    /**
     * Update correlation timestamp
     */
    async updateCorrelationTimestamp(correlationId) {
        if (!this.database) return;
        
        const query = `
            UPDATE linear_correlations 
            SET last_synced_at = NOW(), updated_at = NOW()
            WHERE id = $1
        `;
        
        await this.database.query(query, [correlationId]);
    }

    // ==================== CHANGE DETECTION ====================

    /**
     * Get Task Master changes since timestamp
     */
    async getTaskMasterChangesSince(since) {
        if (!this.database) return [];
        
        const query = `
            SELECT * FROM workflow_events 
            WHERE occurred_at > $1 
            AND event_category IN ('task', 'execution')
            ORDER BY occurred_at ASC
        `;
        
        const result = await this.database.query(query, [since]);
        return result.rows;
    }

    /**
     * Get Linear changes since timestamp
     */
    async getLinearChangesSince(since) {
        // This would typically use Linear webhooks or API polling
        // For now, return empty array as placeholder
        return [];
    }

    // ==================== EVENT HANDLING ====================

    /**
     * Add event handler
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    /**
     * Emit event
     */
    emit(event, data) {
        const handlers = this.eventHandlers.get(event) || [];
        handlers.forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.error(`Event handler error for ${event}:`, error);
            }
        });
    }

    // ==================== HEALTH & DIAGNOSTICS ====================

    /**
     * Test connections
     */
    async testConnections() {
        const apiHealth = await this.apiClient.testConnection();
        if (!apiHealth.success) {
            throw new Error(`Linear API connection failed: ${apiHealth.error}`);
        }
        
        // Test database connection would go here
        
        return { api: apiHealth };
    }

    /**
     * Get sync status
     */
    getSyncStatus() {
        return {
            ...this.syncState,
            config: {
                sync_interval: this.config.syncInterval,
                batch_size: this.config.batchSize,
                conflict_resolution: this.config.conflictResolution,
                real_time_sync: this.config.enableRealTimeSync,
                incremental_sync: this.config.enableIncrementalSync
            },
            queues: {
                to_linear: this.syncQueues.toLinear.length,
                from_linear: this.syncQueues.fromLinear.length,
                conflicts: this.syncQueues.conflicts.length
            }
        };
    }

    /**
     * Load sync state from database
     */
    async loadSyncState() {
        // Implementation would load from database
        // For now, use defaults
    }

    /**
     * Save sync state to database
     */
    async saveSyncState() {
        // Implementation would save to database
        // For now, just log
        console.log('Sync state saved:', this.syncState);
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.stopSyncTimer();
        this.eventHandlers.clear();
        this.syncQueues.toLinear = [];
        this.syncQueues.fromLinear = [];
        this.syncQueues.conflicts = [];
    }
}

export default LinearSyncService;

