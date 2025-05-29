/**
 * @fileoverview Real-time Status Synchronization System
 * @description Main synchronization orchestrator for maintaining consistency across Linear, PostgreSQL, GitHub, and CI/CD components
 */

import EventEmitter from 'events';
import { EventProcessor } from './event-processor.js';
import { WebSocketManager } from './websocket-manager.js';
import { ConflictResolver } from './conflict-resolver.js';
import { StatusMapper } from './status-mapper.js';
import { SyncMonitor } from '../monitoring/sync-monitor.js';
import { DatabaseConnection } from '../ai_cicd_system/database/connection.js';

/**
 * Main Status Synchronization Orchestrator
 * Coordinates real-time synchronization across all integrated systems
 */
export class StatusSynchronizer extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            // Synchronization settings
            enableRealTimeSync: true,
            syncInterval: 5000, // 5 seconds
            batchSize: 50,
            maxRetries: 3,
            retryDelay: 1000,
            
            // System integrations
            systems: {
                linear: { enabled: true, priority: 1 },
                github: { enabled: true, priority: 2 },
                postgresql: { enabled: true, priority: 0 }, // Highest priority
                agentapi: { enabled: true, priority: 3 }
            },
            
            // Conflict resolution
            conflictResolution: {
                strategy: 'priority_based', // priority_based, timestamp_based, manual
                autoResolve: true,
                escalationThreshold: 3
            },
            
            // Performance settings
            performance: {
                enableCaching: true,
                cacheTimeout: 30000, // 30 seconds
                enableBatching: true,
                enableCompression: true
            },
            
            // Monitoring
            monitoring: {
                enableMetrics: true,
                enableAlerts: true,
                healthCheckInterval: 10000 // 10 seconds
            },
            
            ...config
        };

        // Initialize components
        this.eventProcessor = new EventProcessor(this.config);
        this.websocketManager = new WebSocketManager(this.config);
        this.conflictResolver = new ConflictResolver(this.config);
        this.statusMapper = new StatusMapper(this.config);
        this.monitor = new SyncMonitor(this.config);
        
        // State management
        this.isInitialized = false;
        this.isRunning = false;
        this.syncQueue = new Map();
        this.activeSync = new Set();
        this.lastSyncTimestamp = new Map();
        this.syncStats = {
            totalSyncs: 0,
            successfulSyncs: 0,
            failedSyncs: 0,
            conflictsResolved: 0,
            averageSyncTime: 0
        };
        
        // Database connection
        this.db = null;
        
        // Bind event handlers
        this._bindEventHandlers();
    }

    /**
     * Initialize the synchronization system
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('🔄 Initializing Status Synchronization System...');

            // Initialize database connection
            this.db = new DatabaseConnection(this.config.database);
            await this.db.initialize();

            // Initialize components
            await this.eventProcessor.initialize();
            await this.websocketManager.initialize();
            await this.conflictResolver.initialize();
            await this.statusMapper.initialize();
            await this.monitor.initialize();

            // Set up event listeners
            this._setupEventListeners();

            // Start monitoring
            if (this.config.monitoring.enableMetrics) {
                this._startMonitoring();
            }

            this.isInitialized = true;
            this.emit('initialized');

            console.log('✅ Status Synchronization System initialized successfully');

        } catch (error) {
            console.error('❌ Status Synchronization System initialization failed:', error);
            throw error;
        }
    }

    /**
     * Start the synchronization system
     */
    async start() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.isRunning) {
            return;
        }

        try {
            console.log('🚀 Starting Status Synchronization System...');

            // Start components
            await this.eventProcessor.start();
            await this.websocketManager.start();
            
            // Start real-time sync if enabled
            if (this.config.enableRealTimeSync) {
                this._startRealTimeSync();
            }

            this.isRunning = true;
            this.emit('started');

            console.log('✅ Status Synchronization System started successfully');

        } catch (error) {
            console.error('❌ Failed to start Status Synchronization System:', error);
            throw error;
        }
    }

    /**
     * Stop the synchronization system
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        try {
            console.log('🛑 Stopping Status Synchronization System...');

            // Stop real-time sync
            this._stopRealTimeSync();

            // Stop components
            await this.eventProcessor.stop();
            await this.websocketManager.stop();
            await this.monitor.stop();

            // Close database connection
            if (this.db) {
                await this.db.close();
            }

            this.isRunning = false;
            this.emit('stopped');

            console.log('✅ Status Synchronization System stopped successfully');

        } catch (error) {
            console.error('❌ Error stopping Status Synchronization System:', error);
            throw error;
        }
    }

    /**
     * Synchronize status across all systems
     * @param {Object} statusUpdate - Status update object
     * @param {string} sourceSystem - Source system identifier
     * @returns {Promise<Object>} Synchronization result
     */
    async synchronizeStatus(statusUpdate, sourceSystem) {
        const syncId = this._generateSyncId();
        const startTime = Date.now();

        try {
            console.log(`🔄 Starting status synchronization [${syncId}] from ${sourceSystem}`);

            // Validate status update
            this._validateStatusUpdate(statusUpdate);

            // Add to sync queue
            this.syncQueue.set(syncId, {
                id: syncId,
                statusUpdate,
                sourceSystem,
                timestamp: startTime,
                status: 'pending'
            });

            // Check for conflicts
            const conflicts = await this.conflictResolver.detectConflicts(statusUpdate, sourceSystem);
            
            if (conflicts.length > 0) {
                console.log(`⚠️ Conflicts detected for sync [${syncId}]:`, conflicts.length);
                
                if (this.config.conflictResolution.autoResolve) {
                    const resolution = await this.conflictResolver.resolveConflicts(conflicts, statusUpdate);
                    statusUpdate = resolution.resolvedUpdate;
                    this.syncStats.conflictsResolved++;
                } else {
                    throw new Error(`Conflicts detected and auto-resolution is disabled: ${conflicts.map(c => c.description).join(', ')}`);
                }
            }

            // Map status to target systems
            const mappedStatuses = await this.statusMapper.mapStatusToSystems(statusUpdate, sourceSystem);

            // Execute synchronization to all target systems
            const syncResults = await this._executeSynchronization(mappedStatuses, sourceSystem, syncId);

            // Update sync queue
            this.syncQueue.set(syncId, {
                ...this.syncQueue.get(syncId),
                status: 'completed',
                results: syncResults,
                duration: Date.now() - startTime
            });

            // Update statistics
            this._updateSyncStats(true, Date.now() - startTime);

            // Emit success event
            this.emit('sync:completed', {
                syncId,
                statusUpdate,
                sourceSystem,
                results: syncResults,
                duration: Date.now() - startTime
            });

            console.log(`✅ Status synchronization completed [${syncId}] in ${Date.now() - startTime}ms`);

            return {
                syncId,
                success: true,
                results: syncResults,
                duration: Date.now() - startTime
            };

        } catch (error) {
            console.error(`❌ Status synchronization failed [${syncId}]:`, error);

            // Update sync queue
            this.syncQueue.set(syncId, {
                ...this.syncQueue.get(syncId),
                status: 'failed',
                error: error.message,
                duration: Date.now() - startTime
            });

            // Update statistics
            this._updateSyncStats(false, Date.now() - startTime);

            // Emit error event
            this.emit('sync:failed', {
                syncId,
                statusUpdate,
                sourceSystem,
                error: error.message,
                duration: Date.now() - startTime
            });

            throw error;
        } finally {
            // Clean up active sync
            this.activeSync.delete(syncId);
        }
    }

    /**
     * Get synchronization status
     * @param {string} syncId - Synchronization ID
     * @returns {Object} Sync status
     */
    getSyncStatus(syncId) {
        return this.syncQueue.get(syncId) || null;
    }

    /**
     * Get system health status
     * @returns {Object} Health status
     */
    getHealthStatus() {
        return {
            isInitialized: this.isInitialized,
            isRunning: this.isRunning,
            activeSyncs: this.activeSync.size,
            queueSize: this.syncQueue.size,
            stats: this.syncStats,
            components: {
                eventProcessor: this.eventProcessor.getStatus(),
                websocketManager: this.websocketManager.getStatus(),
                conflictResolver: this.conflictResolver.getStatus(),
                statusMapper: this.statusMapper.getStatus(),
                monitor: this.monitor.getStatus()
            },
            lastHealthCheck: new Date().toISOString()
        };
    }

    /**
     * Execute synchronization to target systems
     * @private
     */
    async _executeSynchronization(mappedStatuses, sourceSystem, syncId) {
        const results = {};
        const promises = [];

        for (const [targetSystem, mappedStatus] of Object.entries(mappedStatuses)) {
            if (targetSystem === sourceSystem) {
                continue; // Skip source system
            }

            if (!this.config.systems[targetSystem]?.enabled) {
                continue; // Skip disabled systems
            }

            const promise = this._syncToSystem(targetSystem, mappedStatus, syncId)
                .then(result => {
                    results[targetSystem] = { success: true, result };
                })
                .catch(error => {
                    results[targetSystem] = { success: false, error: error.message };
                });

            promises.push(promise);
        }

        await Promise.allSettled(promises);
        return results;
    }

    /**
     * Synchronize to a specific system
     * @private
     */
    async _syncToSystem(targetSystem, mappedStatus, syncId) {
        console.log(`🔄 Syncing to ${targetSystem} [${syncId}]`);

        switch (targetSystem) {
            case 'postgresql':
                return await this._syncToPostgreSQL(mappedStatus);
            case 'linear':
                return await this._syncToLinear(mappedStatus);
            case 'github':
                return await this._syncToGitHub(mappedStatus);
            case 'agentapi':
                return await this._syncToAgentAPI(mappedStatus);
            default:
                throw new Error(`Unknown target system: ${targetSystem}`);
        }
    }

    /**
     * Sync to PostgreSQL
     * @private
     */
    async _syncToPostgreSQL(mappedStatus) {
        const { entityId, status, metadata } = mappedStatus;

        // Update task status in database
        const query = `
            UPDATE tasks 
            SET status = $1, updated_at = NOW(), metadata = $2
            WHERE id = $3
            RETURNING *
        `;

        const result = await this.db.query(query, [status, JSON.stringify(metadata), entityId]);
        
        if (result.rows.length === 0) {
            throw new Error(`Task not found: ${entityId}`);
        }

        return result.rows[0];
    }

    /**
     * Sync to Linear
     * @private
     */
    async _syncToLinear(mappedStatus) {
        // Implementation for Linear API integration
        // This would use Linear's GraphQL API to update issue status
        console.log('🔄 Syncing to Linear:', mappedStatus);
        
        // Placeholder implementation
        return {
            system: 'linear',
            entityId: mappedStatus.entityId,
            status: mappedStatus.status,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Sync to GitHub
     * @private
     */
    async _syncToGitHub(mappedStatus) {
        // Implementation for GitHub API integration
        // This would use GitHub's REST API to update PR/issue status
        console.log('🔄 Syncing to GitHub:', mappedStatus);
        
        // Placeholder implementation
        return {
            system: 'github',
            entityId: mappedStatus.entityId,
            status: mappedStatus.status,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Sync to AgentAPI
     * @private
     */
    async _syncToAgentAPI(mappedStatus) {
        // Implementation for AgentAPI integration
        // This would notify Claude Code about status changes
        console.log('🔄 Syncing to AgentAPI:', mappedStatus);
        
        // Placeholder implementation
        return {
            system: 'agentapi',
            entityId: mappedStatus.entityId,
            status: mappedStatus.status,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Start real-time synchronization
     * @private
     */
    _startRealTimeSync() {
        this.syncInterval = setInterval(() => {
            this._performPeriodicSync();
        }, this.config.syncInterval);

        console.log(`🔄 Real-time sync started with ${this.config.syncInterval}ms interval`);
    }

    /**
     * Stop real-time synchronization
     * @private
     */
    _stopRealTimeSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    /**
     * Perform periodic synchronization
     * @private
     */
    async _performPeriodicSync() {
        try {
            // Check for pending synchronizations
            const pendingSyncs = Array.from(this.syncQueue.values())
                .filter(sync => sync.status === 'pending')
                .slice(0, this.config.batchSize);

            if (pendingSyncs.length > 0) {
                console.log(`🔄 Processing ${pendingSyncs.length} pending synchronizations`);
                
                for (const sync of pendingSyncs) {
                    try {
                        await this.synchronizeStatus(sync.statusUpdate, sync.sourceSystem);
                    } catch (error) {
                        console.error(`❌ Failed to process sync ${sync.id}:`, error);
                    }
                }
            }

        } catch (error) {
            console.error('❌ Error in periodic sync:', error);
        }
    }

    /**
     * Start monitoring
     * @private
     */
    _startMonitoring() {
        this.healthCheckInterval = setInterval(() => {
            this._performHealthCheck();
        }, this.config.monitoring.healthCheckInterval);
    }

    /**
     * Perform health check
     * @private
     */
    async _performHealthCheck() {
        try {
            const health = this.getHealthStatus();
            this.monitor.recordHealthCheck(health);

            // Emit health status
            this.emit('health:check', health);

        } catch (error) {
            console.error('❌ Health check failed:', error);
            this.emit('health:error', error);
        }
    }

    /**
     * Bind event handlers
     * @private
     */
    _bindEventHandlers() {
        // Handle process termination
        process.on('SIGINT', () => this.stop());
        process.on('SIGTERM', () => this.stop());
    }

    /**
     * Setup event listeners
     * @private
     */
    _setupEventListeners() {
        // Listen for status updates from event processor
        this.eventProcessor.on('status:update', async (event) => {
            try {
                await this.synchronizeStatus(event.data, event.source);
            } catch (error) {
                console.error('❌ Failed to handle status update event:', error);
            }
        });

        // Listen for WebSocket events
        this.websocketManager.on('client:message', (message) => {
            this.emit('websocket:message', message);
        });

        // Listen for conflict resolution events
        this.conflictResolver.on('conflict:detected', (conflict) => {
            this.emit('conflict:detected', conflict);
        });

        this.conflictResolver.on('conflict:resolved', (resolution) => {
            this.emit('conflict:resolved', resolution);
        });
    }

    /**
     * Validate status update
     * @private
     */
    _validateStatusUpdate(statusUpdate) {
        if (!statusUpdate || typeof statusUpdate !== 'object') {
            throw new Error('Status update must be an object');
        }

        if (!statusUpdate.entityId) {
            throw new Error('Status update must include entityId');
        }

        if (!statusUpdate.status) {
            throw new Error('Status update must include status');
        }

        if (!statusUpdate.entityType) {
            throw new Error('Status update must include entityType');
        }
    }

    /**
     * Generate sync ID
     * @private
     */
    _generateSyncId() {
        return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Update sync statistics
     * @private
     */
    _updateSyncStats(success, duration) {
        this.syncStats.totalSyncs++;
        
        if (success) {
            this.syncStats.successfulSyncs++;
        } else {
            this.syncStats.failedSyncs++;
        }

        // Update average sync time
        const totalTime = this.syncStats.averageSyncTime * (this.syncStats.totalSyncs - 1) + duration;
        this.syncStats.averageSyncTime = totalTime / this.syncStats.totalSyncs;
    }
}

export default StatusSynchronizer;

