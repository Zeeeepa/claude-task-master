/**
 * Linear Status Synchronizer
 * 
 * Handles task status ↔ Linear issue status mapping, status transition validation,
 * and audit trail for status changes.
 */

export class LinearStatusSync {
    constructor(config = {}) {
        this.config = {
            teamId: config.teamId || process.env.LINEAR_TEAM_ID,
            enableBidirectionalSync: config.enableBidirectionalSync !== false,
            enableStatusValidation: config.enableStatusValidation !== false,
            enableAuditTrail: config.enableAuditTrail !== false,
            conflictResolution: config.conflictResolution || 'linear_wins', // 'linear_wins', 'task_master_wins', 'manual'
            statusSyncDelay: config.statusSyncDelay || 1000, // ms delay to prevent rapid updates
            ...config
        };

        // Status mappings
        this.taskMasterToLinear = {
            'pending': 'Todo',
            'in_progress': 'In Progress',
            'validation': 'In Review',
            'completed': 'Done',
            'failed': 'Todo',
            'cancelled': 'Cancelled'
        };

        this.linearToTaskMaster = {
            'Todo': 'pending',
            'Backlog': 'pending',
            'In Progress': 'in_progress',
            'In Review': 'validation',
            'Done': 'completed',
            'Cancelled': 'cancelled',
            'Closed': 'completed'
        };

        // Valid status transitions for Task Master
        this.validTaskMasterTransitions = {
            'pending': ['in_progress', 'cancelled'],
            'in_progress': ['validation', 'completed', 'failed', 'cancelled'],
            'validation': ['completed', 'failed', 'in_progress'],
            'completed': [], // Terminal state
            'failed': ['pending', 'in_progress', 'cancelled'],
            'cancelled': ['pending'] // Can be reopened
        };

        // Valid status transitions for Linear (simplified)
        this.validLinearTransitions = {
            'Todo': ['In Progress', 'Cancelled'],
            'Backlog': ['Todo', 'In Progress'],
            'In Progress': ['In Review', 'Done', 'Todo'],
            'In Review': ['Done', 'In Progress', 'Todo'],
            'Done': [], // Terminal state
            'Cancelled': ['Todo', 'Backlog']
        };

        // Database connection (injected)
        this.database = null;
        
        // API clients (injected)
        this.linearAPI = null;
        this.taskMasterAPI = null;
        
        // Sync queue to prevent rapid updates
        this.syncQueue = new Map();
        this.syncTimer = null;
    }

    /**
     * Initialize status synchronizer
     */
    async initialize(database, linearAPI, taskMasterAPI) {
        this.database = database;
        this.linearAPI = linearAPI;
        this.taskMasterAPI = taskMasterAPI;
        
        // Ensure audit tables exist
        if (this.config.enableAuditTrail) {
            await this.ensureAuditTables();
        }
        
        // Start sync timer
        this.startSyncTimer();
        
        console.log('Linear Status Sync initialized');
    }

    // ==================== TASK MASTER TO LINEAR SYNC ====================

    /**
     * Sync Task Master status to Linear
     */
    async syncTaskStatusToLinear(taskId, newStatus, oldStatus = null, context = {}) {
        try {
            // Get correlation
            const correlation = await this.getTaskCorrelation(taskId);
            if (!correlation) {
                console.warn(`No Linear correlation found for task ${taskId}`);
                return { success: false, reason: 'no_correlation' };
            }

            // Validate status transition
            if (this.config.enableStatusValidation && oldStatus) {
                const isValid = this.validateTaskMasterTransition(oldStatus, newStatus);
                if (!isValid) {
                    throw new Error(`Invalid status transition: ${oldStatus} → ${newStatus}`);
                }
            }

            // Map status
            const linearStatus = this.mapTaskMasterToLinear(newStatus);
            if (!linearStatus) {
                throw new Error(`Cannot map Task Master status '${newStatus}' to Linear`);
            }

            // Check for conflicts
            const conflict = await this.detectStatusConflict(
                correlation.linear_issue_id, 
                linearStatus, 
                correlation.last_synced_at
            );

            if (conflict) {
                return await this.handleStatusConflict(conflict, {
                    task_id: taskId,
                    task_status: newStatus,
                    linear_status: linearStatus,
                    context
                });
            }

            // Queue for sync to prevent rapid updates
            this.queueStatusSync('to_linear', {
                correlation_id: correlation.id,
                task_id: taskId,
                linear_issue_id: correlation.linear_issue_id,
                new_status: linearStatus,
                old_status: oldStatus,
                context
            });

            return { success: true, queued: true, linear_status: linearStatus };

        } catch (error) {
            console.error(`Failed to sync task status to Linear:`, error);
            
            // Log audit trail
            if (this.config.enableAuditTrail) {
                await this.logStatusChange({
                    source: 'task_master',
                    task_id: taskId,
                    old_status: oldStatus,
                    new_status: newStatus,
                    success: false,
                    error: error.message,
                    context
                });
            }
            
            throw error;
        }
    }

    /**
     * Execute Task Master to Linear status sync
     */
    async executeTaskToLinearSync(syncData) {
        const { correlation_id, task_id, linear_issue_id, new_status, old_status, context } = syncData;

        try {
            // Get current Linear issue state
            const linearIssue = await this.linearAPI.getIssue(linear_issue_id);
            const currentLinearStatus = linearIssue.state.name;

            // Check if Linear status has changed since we queued this sync
            if (currentLinearStatus !== new_status) {
                const conflict = await this.detectStatusConflict(
                    linear_issue_id,
                    new_status,
                    new Date(Date.now() - this.config.statusSyncDelay)
                );

                if (conflict) {
                    return await this.handleStatusConflict(conflict, {
                        task_id,
                        task_status: this.mapLinearToTaskMaster(new_status),
                        linear_status: new_status,
                        context
                    });
                }
            }

            // Find Linear state
            const linearState = await this.linearAPI.findStateByName(this.config.teamId, new_status);
            if (!linearState) {
                throw new Error(`Linear state '${new_status}' not found`);
            }

            // Update Linear issue
            await this.linearAPI.updateIssue(linear_issue_id, {
                stateId: linearState.id
            });

            // Add comment about status change
            const comment = this.formatStatusChangeComment('task_master', old_status, new_status, context);
            await this.linearAPI.addComment(linear_issue_id, comment);

            // Update correlation timestamp
            await this.updateCorrelationSyncTime(correlation_id);

            // Log audit trail
            if (this.config.enableAuditTrail) {
                await this.logStatusChange({
                    source: 'task_master',
                    target: 'linear',
                    task_id,
                    linear_issue_id,
                    old_status,
                    new_status,
                    success: true,
                    context
                });
            }

            return { success: true, linear_status: new_status };

        } catch (error) {
            console.error(`Failed to execute task to Linear sync:`, error);
            
            // Log audit trail
            if (this.config.enableAuditTrail) {
                await this.logStatusChange({
                    source: 'task_master',
                    target: 'linear',
                    task_id,
                    linear_issue_id,
                    old_status,
                    new_status,
                    success: false,
                    error: error.message,
                    context
                });
            }
            
            throw error;
        }
    }

    // ==================== LINEAR TO TASK MASTER SYNC ====================

    /**
     * Sync Linear status to Task Master
     */
    async syncLinearStatusToTask(linearIssueId, newStatus, oldStatus = null, context = {}) {
        try {
            // Get correlation
            const correlation = await this.getLinearCorrelation(linearIssueId);
            if (!correlation) {
                console.warn(`No Task Master correlation found for Linear issue ${linearIssueId}`);
                return { success: false, reason: 'no_correlation' };
            }

            // Map status
            const taskStatus = this.mapLinearToTaskMaster(newStatus);
            if (!taskStatus) {
                throw new Error(`Cannot map Linear status '${newStatus}' to Task Master`);
            }

            // Validate status transition
            if (this.config.enableStatusValidation && oldStatus) {
                const oldTaskStatus = this.mapLinearToTaskMaster(oldStatus);
                const isValid = this.validateTaskMasterTransition(oldTaskStatus, taskStatus);
                if (!isValid) {
                    console.warn(`Invalid Task Master transition: ${oldTaskStatus} → ${taskStatus}, skipping sync`);
                    return { success: false, reason: 'invalid_transition' };
                }
            }

            // Check for conflicts
            const conflict = await this.detectTaskStatusConflict(
                correlation.task_id,
                taskStatus,
                correlation.last_synced_at
            );

            if (conflict) {
                return await this.handleStatusConflict(conflict, {
                    linear_issue_id: linearIssueId,
                    linear_status: newStatus,
                    task_status: taskStatus,
                    context
                });
            }

            // Queue for sync
            this.queueStatusSync('to_task_master', {
                correlation_id: correlation.id,
                task_id: correlation.task_id,
                linear_issue_id: linearIssueId,
                new_status: taskStatus,
                old_status: oldStatus,
                context
            });

            return { success: true, queued: true, task_status: taskStatus };

        } catch (error) {
            console.error(`Failed to sync Linear status to task:`, error);
            
            // Log audit trail
            if (this.config.enableAuditTrail) {
                await this.logStatusChange({
                    source: 'linear',
                    linear_issue_id: linearIssueId,
                    old_status: oldStatus,
                    new_status: newStatus,
                    success: false,
                    error: error.message,
                    context
                });
            }
            
            throw error;
        }
    }

    /**
     * Execute Linear to Task Master status sync
     */
    async executeLinearToTaskSync(syncData) {
        const { correlation_id, task_id, linear_issue_id, new_status, old_status, context } = syncData;

        try {
            // Get current task status
            const task = await this.taskMasterAPI.getTask(task_id);
            const currentTaskStatus = task.status;

            // Check if task status has changed since we queued this sync
            if (currentTaskStatus !== new_status) {
                const conflict = await this.detectTaskStatusConflict(
                    task_id,
                    new_status,
                    new Date(Date.now() - this.config.statusSyncDelay)
                );

                if (conflict) {
                    return await this.handleStatusConflict(conflict, {
                        task_id,
                        task_status: new_status,
                        linear_issue_id,
                        linear_status: this.mapTaskMasterToLinear(new_status),
                        context
                    });
                }
            }

            // Update task status
            await this.taskMasterAPI.updateTaskStatus(task_id, new_status, {
                source: 'linear_sync',
                linear_issue_id,
                context
            });

            // Update correlation timestamp
            await this.updateCorrelationSyncTime(correlation_id);

            // Log audit trail
            if (this.config.enableAuditTrail) {
                await this.logStatusChange({
                    source: 'linear',
                    target: 'task_master',
                    task_id,
                    linear_issue_id,
                    old_status,
                    new_status,
                    success: true,
                    context
                });
            }

            return { success: true, task_status: new_status };

        } catch (error) {
            console.error(`Failed to execute Linear to task sync:`, error);
            
            // Log audit trail
            if (this.config.enableAuditTrail) {
                await this.logStatusChange({
                    source: 'linear',
                    target: 'task_master',
                    task_id,
                    linear_issue_id,
                    old_status,
                    new_status,
                    success: false,
                    error: error.message,
                    context
                });
            }
            
            throw error;
        }
    }

    // ==================== STATUS MAPPING ====================

    /**
     * Map Task Master status to Linear status
     */
    mapTaskMasterToLinear(taskStatus) {
        return this.taskMasterToLinear[taskStatus] || null;
    }

    /**
     * Map Linear status to Task Master status
     */
    mapLinearToTaskMaster(linearStatus) {
        return this.linearToTaskMaster[linearStatus] || null;
    }

    /**
     * Get all status mappings
     */
    getStatusMappings() {
        return {
            task_master_to_linear: this.taskMasterToLinear,
            linear_to_task_master: this.linearToTaskMaster,
            valid_task_master_transitions: this.validTaskMasterTransitions,
            valid_linear_transitions: this.validLinearTransitions
        };
    }

    // ==================== STATUS VALIDATION ====================

    /**
     * Validate Task Master status transition
     */
    validateTaskMasterTransition(fromStatus, toStatus) {
        const validTransitions = this.validTaskMasterTransitions[fromStatus];
        return validTransitions ? validTransitions.includes(toStatus) : false;
    }

    /**
     * Validate Linear status transition
     */
    validateLinearTransition(fromStatus, toStatus) {
        const validTransitions = this.validLinearTransitions[fromStatus];
        return validTransitions ? validTransitions.includes(toStatus) : false;
    }

    /**
     * Get valid next statuses for Task Master
     */
    getValidTaskMasterTransitions(currentStatus) {
        return this.validTaskMasterTransitions[currentStatus] || [];
    }

    /**
     * Get valid next statuses for Linear
     */
    getValidLinearTransitions(currentStatus) {
        return this.validLinearTransitions[currentStatus] || [];
    }

    // ==================== CONFLICT DETECTION & RESOLUTION ====================

    /**
     * Detect status conflict for Linear issue
     */
    async detectStatusConflict(linearIssueId, proposedStatus, lastSyncTime) {
        try {
            const linearIssue = await this.linearAPI.getIssue(linearIssueId);
            const currentStatus = linearIssue.state.name;
            const lastUpdated = new Date(linearIssue.updatedAt);

            // Check if Linear issue was updated after last sync
            if (lastUpdated > lastSyncTime && currentStatus !== proposedStatus) {
                return {
                    type: 'status_conflict',
                    linear_issue_id: linearIssueId,
                    current_status: currentStatus,
                    proposed_status: proposedStatus,
                    last_updated: lastUpdated,
                    last_sync: lastSyncTime
                };
            }

            return null;

        } catch (error) {
            console.error('Error detecting status conflict:', error);
            return null;
        }
    }

    /**
     * Detect status conflict for Task Master task
     */
    async detectTaskStatusConflict(taskId, proposedStatus, lastSyncTime) {
        try {
            const task = await this.taskMasterAPI.getTask(taskId);
            const currentStatus = task.status;
            const lastUpdated = new Date(task.updated_at);

            // Check if task was updated after last sync
            if (lastUpdated > lastSyncTime && currentStatus !== proposedStatus) {
                return {
                    type: 'status_conflict',
                    task_id: taskId,
                    current_status: currentStatus,
                    proposed_status: proposedStatus,
                    last_updated: lastUpdated,
                    last_sync: lastSyncTime
                };
            }

            return null;

        } catch (error) {
            console.error('Error detecting task status conflict:', error);
            return null;
        }
    }

    /**
     * Handle status conflict
     */
    async handleStatusConflict(conflict, context) {
        switch (this.config.conflictResolution) {
            case 'linear_wins':
                return await this.resolveConflictLinearWins(conflict, context);
                
            case 'task_master_wins':
                return await this.resolveConflictTaskMasterWins(conflict, context);
                
            case 'manual':
                return await this.queueConflictForManualResolution(conflict, context);
                
            default:
                throw new Error(`Unknown conflict resolution strategy: ${this.config.conflictResolution}`);
        }
    }

    /**
     * Resolve conflict with Linear winning
     */
    async resolveConflictLinearWins(conflict, context) {
        // Update Task Master with Linear status
        if (conflict.linear_issue_id && context.task_id) {
            const linearIssue = await this.linearAPI.getIssue(conflict.linear_issue_id);
            const taskStatus = this.mapLinearToTaskMaster(linearIssue.state.name);
            
            if (taskStatus) {
                await this.taskMasterAPI.updateTaskStatus(context.task_id, taskStatus, {
                    source: 'conflict_resolution_linear_wins',
                    conflict_id: conflict.id
                });
            }
        }

        return { 
            success: true, 
            resolution: 'linear_wins',
            resolved_status: conflict.current_status 
        };
    }

    /**
     * Resolve conflict with Task Master winning
     */
    async resolveConflictTaskMasterWins(conflict, context) {
        // Update Linear with Task Master status
        if (conflict.task_id && context.linear_issue_id) {
            const task = await this.taskMasterAPI.getTask(conflict.task_id);
            const linearStatus = this.mapTaskMasterToLinear(task.status);
            
            if (linearStatus) {
                const linearState = await this.linearAPI.findStateByName(this.config.teamId, linearStatus);
                if (linearState) {
                    await this.linearAPI.updateIssue(context.linear_issue_id, {
                        stateId: linearState.id
                    });
                }
            }
        }

        return { 
            success: true, 
            resolution: 'task_master_wins',
            resolved_status: conflict.current_status 
        };
    }

    /**
     * Queue conflict for manual resolution
     */
    async queueConflictForManualResolution(conflict, context) {
        // Store conflict in database for manual review
        if (this.database) {
            const query = `
                INSERT INTO status_sync_conflicts (
                    conflict_type, conflict_data, context, status, created_at
                ) VALUES ($1, $2, $3, $4, $5)
            `;
            
            await this.database.query(query, [
                conflict.type,
                JSON.stringify(conflict),
                JSON.stringify(context),
                'pending',
                new Date()
            ]);
        }

        return { 
            success: false, 
            resolution: 'queued_for_manual',
            conflict_id: conflict.id 
        };
    }

    // ==================== SYNC QUEUE MANAGEMENT ====================

    /**
     * Queue status sync to prevent rapid updates
     */
    queueStatusSync(direction, syncData) {
        const key = direction === 'to_linear' ? 
            `linear_${syncData.linear_issue_id}` : 
            `task_${syncData.task_id}`;

        this.syncQueue.set(key, {
            direction,
            data: syncData,
            queuedAt: Date.now()
        });
    }

    /**
     * Start sync timer
     */
    startSyncTimer() {
        this.syncTimer = setInterval(async () => {
            await this.processSyncQueue();
        }, this.config.statusSyncDelay);
    }

    /**
     * Process sync queue
     */
    async processSyncQueue() {
        if (this.syncQueue.size === 0) {
            return;
        }

        const now = Date.now();
        const toProcess = [];

        // Find items ready to process
        for (const [key, item] of this.syncQueue.entries()) {
            if (now - item.queuedAt >= this.config.statusSyncDelay) {
                toProcess.push({ key, item });
            }
        }

        // Process items
        for (const { key, item } of toProcess) {
            try {
                if (item.direction === 'to_linear') {
                    await this.executeTaskToLinearSync(item.data);
                } else {
                    await this.executeLinearToTaskSync(item.data);
                }
            } catch (error) {
                console.error(`Failed to process sync queue item:`, error);
            }
            
            this.syncQueue.delete(key);
        }
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Format status change comment
     */
    formatStatusChangeComment(source, oldStatus, newStatus, context = {}) {
        const emoji = source === 'task_master' ? '🔄' : '🔗';
        let comment = `${emoji} **Status Updated from ${source === 'task_master' ? 'Task Master' : 'Linear'}**\n\n`;
        
        if (oldStatus) {
            comment += `**Previous**: ${oldStatus}\n`;
        }
        comment += `**Current**: ${newStatus}\n`;
        
        if (context.reason) {
            comment += `**Reason**: ${context.reason}\n`;
        }
        
        comment += `\n_Synchronized at ${new Date().toISOString()}_`;
        
        return comment;
    }

    /**
     * Get task correlation
     */
    async getTaskCorrelation(taskId) {
        if (!this.database) return null;
        
        const query = `
            SELECT * FROM linear_correlations 
            WHERE task_id = $1 AND status = 'active'
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
            WHERE linear_issue_id = $1 AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
        `;
        
        const result = await this.database.query(query, [linearIssueId]);
        return result.rows[0] || null;
    }

    /**
     * Update correlation sync time
     */
    async updateCorrelationSyncTime(correlationId) {
        if (!this.database) return;
        
        const query = `
            UPDATE linear_correlations 
            SET last_synced_at = NOW(), updated_at = NOW()
            WHERE id = $1
        `;
        
        await this.database.query(query, [correlationId]);
    }

    // ==================== AUDIT TRAIL ====================

    /**
     * Log status change
     */
    async logStatusChange(changeData) {
        if (!this.database || !this.config.enableAuditTrail) {
            return;
        }

        const query = `
            INSERT INTO status_sync_audit (
                source, target, task_id, linear_issue_id, 
                old_status, new_status, success, error, 
                context, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;

        const values = [
            changeData.source,
            changeData.target || null,
            changeData.task_id || null,
            changeData.linear_issue_id || null,
            changeData.old_status,
            changeData.new_status,
            changeData.success,
            changeData.error || null,
            JSON.stringify(changeData.context || {}),
            new Date()
        ];

        await this.database.query(query, values);
    }

    /**
     * Ensure audit tables exist
     */
    async ensureAuditTables() {
        if (!this.database) return;

        const createTablesQuery = `
            -- Status sync audit trail
            CREATE TABLE IF NOT EXISTS status_sync_audit (
                id SERIAL PRIMARY KEY,
                source VARCHAR(50) NOT NULL,
                target VARCHAR(50),
                task_id UUID,
                linear_issue_id VARCHAR(255),
                old_status VARCHAR(50),
                new_status VARCHAR(50) NOT NULL,
                success BOOLEAN NOT NULL,
                error TEXT,
                context JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Status sync conflicts
            CREATE TABLE IF NOT EXISTS status_sync_conflicts (
                id SERIAL PRIMARY KEY,
                conflict_type VARCHAR(50) NOT NULL,
                conflict_data JSONB NOT NULL,
                context JSONB DEFAULT '{}',
                status VARCHAR(20) DEFAULT 'pending',
                resolution JSONB,
                resolved_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Create indexes
            CREATE INDEX IF NOT EXISTS idx_status_audit_task_id ON status_sync_audit(task_id);
            CREATE INDEX IF NOT EXISTS idx_status_audit_linear_issue_id ON status_sync_audit(linear_issue_id);
            CREATE INDEX IF NOT EXISTS idx_status_audit_source ON status_sync_audit(source);
            CREATE INDEX IF NOT EXISTS idx_status_conflicts_status ON status_sync_conflicts(status);
        `;

        await this.database.query(createTablesQuery);
    }

    // ==================== HEALTH & DIAGNOSTICS ====================

    /**
     * Get sync status
     */
    getSyncStatus() {
        return {
            config: {
                bidirectional_sync: this.config.enableBidirectionalSync,
                status_validation: this.config.enableStatusValidation,
                audit_trail: this.config.enableAuditTrail,
                conflict_resolution: this.config.conflictResolution,
                sync_delay: this.config.statusSyncDelay
            },
            queue: {
                pending_syncs: this.syncQueue.size,
                queue_items: Array.from(this.syncQueue.keys())
            },
            mappings: {
                task_master_to_linear: Object.keys(this.taskMasterToLinear).length,
                linear_to_task_master: Object.keys(this.linearToTaskMaster).length
            }
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
        
        this.syncQueue.clear();
    }
}

export default LinearStatusSync;

