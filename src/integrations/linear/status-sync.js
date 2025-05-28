/**
 * Linear Status Synchronization
 * 
 * Handles real-time bidirectional synchronization between Linear issues
 * and the unified AI CI/CD system workflow states.
 */

const EventEmitter = require('events');

class StatusSync extends EventEmitter {
    constructor(linearClient, issueManager, options = {}) {
        super();
        
        this.client = linearClient;
        this.issueManager = issueManager;
        this.syncInterval = options.syncInterval || 30000; // 30 seconds
        this.enableRealTimeSync = options.enableRealTimeSync !== false;
        this.maxSyncRetries = options.maxSyncRetries || 3;
        this.syncBatchSize = options.syncBatchSize || 50;
        
        // State mappings between Linear and system states
        this.stateMapping = options.stateMapping || {
            // Linear state type -> System state
            'backlog': 'pending',
            'unstarted': 'pending',
            'started': 'in_progress',
            'completed': 'completed',
            'canceled': 'cancelled'
        };
        
        // Reverse mapping for system -> Linear
        this.reverseStateMapping = this.createReverseMapping();
        
        // Track sync state
        this.lastSyncTimestamp = new Date();
        this.syncInProgress = false;
        this.syncQueue = new Map(); // issueId -> syncData
        this.syncTimer = null;
        
        // Initialize sync
        this.initializeSync();
    }
    
    /**
     * Initialize synchronization system
     */
    initializeSync() {
        if (this.enableRealTimeSync) {
            this.startPeriodicSync();
        }
        
        // Listen for Linear events
        this.issueManager.on('issue:created', (issue) => this.handleIssueCreated(issue));
        this.issueManager.on('issue:updated', (issue) => this.handleIssueUpdated(issue));
        this.issueManager.on('comment:created', (comment) => this.handleCommentCreated(comment));
        
        this.emit('sync:initialized');
    }
    
    /**
     * Start periodic synchronization
     */
    startPeriodicSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
        }
        
        this.syncTimer = setInterval(() => {
            this.performPeriodicSync().catch(error => {
                this.emit('sync:error', { type: 'periodic', error });
            });
        }, this.syncInterval);
        
        this.emit('sync:started');
    }
    
    /**
     * Stop periodic synchronization
     */
    stopPeriodicSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
        
        this.emit('sync:stopped');
    }
    
    /**
     * Perform periodic synchronization
     */
    async performPeriodicSync() {
        if (this.syncInProgress) {
            return;
        }
        
        this.syncInProgress = true;
        
        try {
            // Process queued sync operations
            await this.processQueuedSyncs();
            
            // Sync recent changes from Linear
            await this.syncRecentLinearChanges();
            
            // Sync pending system changes to Linear
            await this.syncSystemChangesToLinear();
            
            this.lastSyncTimestamp = new Date();
            this.emit('sync:completed', { timestamp: this.lastSyncTimestamp });
            
        } catch (error) {
            this.emit('sync:error', { type: 'periodic', error });
        } finally {
            this.syncInProgress = false;
        }
    }
    
    /**
     * Process queued synchronization operations
     */
    async processQueuedSyncs() {
        const queuedSyncs = Array.from(this.syncQueue.entries());
        this.syncQueue.clear();
        
        for (const [issueId, syncData] of queuedSyncs) {
            try {
                await this.processSyncOperation(issueId, syncData);
            } catch (error) {
                this.emit('sync:error', { 
                    type: 'queued', 
                    issueId, 
                    syncData, 
                    error 
                });
            }
        }
    }
    
    /**
     * Sync recent changes from Linear
     */
    async syncRecentLinearChanges() {
        try {
            const recentIssues = await this.issueManager.searchIssues({
                updatedAfter: this.lastSyncTimestamp.toISOString(),
                limit: this.syncBatchSize
            });
            
            for (const issue of recentIssues.nodes) {
                await this.syncLinearIssueToSystem(issue);
            }
            
            this.emit('sync:linear_changes', { 
                count: recentIssues.nodes.length 
            });
            
        } catch (error) {
            this.emit('sync:error', { 
                type: 'linear_changes', 
                error 
            });
        }
    }
    
    /**
     * Sync system changes to Linear
     */
    async syncSystemChangesToLinear() {
        try {
            // This would integrate with your system's task storage
            // For now, we'll emit an event for the system to handle
            this.emit('sync:request_system_changes', {
                since: this.lastSyncTimestamp,
                callback: (systemChanges) => this.handleSystemChanges(systemChanges)
            });
            
        } catch (error) {
            this.emit('sync:error', { 
                type: 'system_changes', 
                error 
            });
        }
    }
    
    /**
     * Handle system changes and sync to Linear
     */
    async handleSystemChanges(systemChanges) {
        for (const change of systemChanges) {
            try {
                await this.syncSystemChangeToLinear(change);
            } catch (error) {
                this.emit('sync:error', { 
                    type: 'system_change', 
                    change, 
                    error 
                });
            }
        }
    }
    
    /**
     * Sync a Linear issue to the system
     */
    async syncLinearIssueToSystem(issue) {
        const systemState = this.mapLinearStateToSystem(issue.state.type);
        
        const syncData = {
            issueId: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            description: issue.description,
            state: systemState,
            assignee: issue.assignee,
            priority: issue.priority,
            labels: issue.labels.nodes,
            updatedAt: issue.updatedAt,
            url: issue.url
        };
        
        this.emit('sync:to_system', syncData);
        
        return syncData;
    }
    
    /**
     * Sync a system change to Linear
     */
    async syncSystemChangeToLinear(change) {
        const linearState = this.mapSystemStateToLinear(change.state);
        
        if (change.issueId) {
            // Update existing issue
            const updateData = {
                title: change.title,
                description: change.description,
                stateId: linearState?.id,
                priority: change.priority
            };
            
            // Remove undefined values
            Object.keys(updateData).forEach(key => {
                if (updateData[key] === undefined) {
                    delete updateData[key];
                }
            });
            
            if (Object.keys(updateData).length > 0) {
                await this.issueManager.updateIssue(change.issueId, updateData);
            }
            
        } else {
            // Create new issue
            const issueData = {
                title: change.title,
                description: change.description,
                teamId: change.teamId,
                priority: change.priority,
                stateId: linearState?.id
            };
            
            const newIssue = await this.issueManager.createIssue(issueData);
            
            // Notify system of new issue ID
            this.emit('sync:issue_created', {
                systemId: change.id,
                linearIssue: newIssue
            });
        }
    }
    
    /**
     * Queue a synchronization operation
     */
    queueSync(issueId, syncData) {
        this.syncQueue.set(issueId, {
            ...syncData,
            queuedAt: new Date()
        });
        
        this.emit('sync:queued', { issueId, syncData });
    }
    
    /**
     * Process a single sync operation
     */
    async processSyncOperation(issueId, syncData) {
        const operation = syncData.operation;
        
        switch (operation) {
            case 'update_state':
                await this.updateIssueState(issueId, syncData.state);
                break;
                
            case 'update_assignee':
                await this.updateIssueAssignee(issueId, syncData.assigneeId);
                break;
                
            case 'add_comment':
                await this.addIssueComment(issueId, syncData.comment);
                break;
                
            case 'update_priority':
                await this.updateIssuePriority(issueId, syncData.priority);
                break;
                
            case 'add_labels':
                await this.addIssueLabels(issueId, syncData.labelIds);
                break;
                
            default:
                throw new Error(`Unknown sync operation: ${operation}`);
        }
        
        this.emit('sync:operation_completed', { issueId, operation });
    }
    
    /**
     * Update issue state
     */
    async updateIssueState(issueId, systemState) {
        const linearState = this.mapSystemStateToLinear(systemState);
        if (linearState) {
            await this.issueManager.updateIssueState(issueId, linearState.id);
        }
    }
    
    /**
     * Update issue assignee
     */
    async updateIssueAssignee(issueId, assigneeId) {
        await this.issueManager.assignIssue(issueId, assigneeId);
    }
    
    /**
     * Add comment to issue
     */
    async addIssueComment(issueId, comment) {
        await this.issueManager.addComment(issueId, comment);
    }
    
    /**
     * Update issue priority
     */
    async updateIssuePriority(issueId, priority) {
        await this.issueManager.setPriority(issueId, priority);
    }
    
    /**
     * Add labels to issue
     */
    async addIssueLabels(issueId, labelIds) {
        await this.issueManager.addLabels(issueId, labelIds);
    }
    
    /**
     * Map Linear state to system state
     */
    mapLinearStateToSystem(linearStateType) {
        return this.stateMapping[linearStateType] || 'unknown';
    }
    
    /**
     * Map system state to Linear state
     */
    mapSystemStateToLinear(systemState) {
        const linearStateType = this.reverseStateMapping[systemState];
        if (!linearStateType) {
            return null;
        }
        
        // This would need to be enhanced to return actual state IDs
        // For now, return a placeholder structure
        return {
            type: linearStateType,
            id: `state_${linearStateType}` // This should be actual Linear state ID
        };
    }
    
    /**
     * Create reverse state mapping
     */
    createReverseMapping() {
        const reverse = {};
        for (const [linearState, systemState] of Object.entries(this.stateMapping)) {
            reverse[systemState] = linearState;
        }
        return reverse;
    }
    
    /**
     * Handle issue created event
     */
    handleIssueCreated(issue) {
        this.emit('sync:issue_event', {
            type: 'created',
            issue,
            timestamp: new Date()
        });
    }
    
    /**
     * Handle issue updated event
     */
    handleIssueUpdated(issue) {
        this.emit('sync:issue_event', {
            type: 'updated',
            issue,
            timestamp: new Date()
        });
    }
    
    /**
     * Handle comment created event
     */
    handleCommentCreated(comment) {
        this.emit('sync:comment_event', {
            type: 'created',
            comment,
            timestamp: new Date()
        });
    }
    
    /**
     * Force synchronization of a specific issue
     */
    async forceSyncIssue(issueId) {
        try {
            const issue = await this.issueManager.getIssue(issueId);
            await this.syncLinearIssueToSystem(issue);
            
            this.emit('sync:force_completed', { issueId });
            return true;
            
        } catch (error) {
            this.emit('sync:error', { 
                type: 'force_sync', 
                issueId, 
                error 
            });
            return false;
        }
    }
    
    /**
     * Get synchronization status
     */
    getSyncStatus() {
        return {
            lastSync: this.lastSyncTimestamp,
            syncInProgress: this.syncInProgress,
            queuedSyncs: this.syncQueue.size,
            enableRealTimeSync: this.enableRealTimeSync,
            syncInterval: this.syncInterval
        };
    }
    
    /**
     * Update sync configuration
     */
    updateSyncConfig(config) {
        if (config.syncInterval) {
            this.syncInterval = config.syncInterval;
            if (this.enableRealTimeSync) {
                this.startPeriodicSync(); // Restart with new interval
            }
        }
        
        if (config.enableRealTimeSync !== undefined) {
            this.enableRealTimeSync = config.enableRealTimeSync;
            if (this.enableRealTimeSync) {
                this.startPeriodicSync();
            } else {
                this.stopPeriodicSync();
            }
        }
        
        if (config.stateMapping) {
            this.stateMapping = { ...this.stateMapping, ...config.stateMapping };
            this.reverseStateMapping = this.createReverseMapping();
        }
        
        this.emit('sync:config_updated', config);
    }
    
    /**
     * Cleanup resources
     */
    destroy() {
        this.stopPeriodicSync();
        this.syncQueue.clear();
        this.removeAllListeners();
    }
}

module.exports = StatusSync;

