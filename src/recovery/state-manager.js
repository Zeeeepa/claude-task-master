/**
 * @fileoverview State Manager
 * @description System state management and restoration capabilities
 */

import { log } from '../utils/getVersion.js';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

/**
 * State types
 */
export const StateType = {
    CONFIGURATION: 'configuration',
    CACHE: 'cache',
    SESSION: 'session',
    TRANSACTION: 'transaction',
    CONNECTION: 'connection',
    WORKFLOW: 'workflow',
    USER_DATA: 'user_data'
};

/**
 * State status
 */
export const StateStatus = {
    ACTIVE: 'active',
    CORRUPTED: 'corrupted',
    RESTORED: 'restored',
    BACKED_UP: 'backed_up',
    LOST: 'lost'
};

/**
 * Backup strategies
 */
export const BackupStrategy = {
    IMMEDIATE: 'immediate',
    PERIODIC: 'periodic',
    ON_CHANGE: 'on_change',
    MANUAL: 'manual'
};

/**
 * State Manager for system state preservation and restoration
 */
export class StateManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableAutoBackup: config.enableAutoBackup !== false,
            enableStateValidation: config.enableStateValidation !== false,
            enableCompression: config.enableCompression !== false,
            backupStrategy: config.backupStrategy || BackupStrategy.ON_CHANGE,
            backupInterval: config.backupInterval || 300000, // 5 minutes
            maxBackups: config.maxBackups || 10,
            backupDirectory: config.backupDirectory || './backups/state',
            stateDirectory: config.stateDirectory || './state',
            compressionLevel: config.compressionLevel || 6,
            encryptionKey: config.encryptionKey,
            ...config
        };

        // State tracking
        this.states = new Map(); // stateId -> state info
        this.stateHistory = new Map(); // stateId -> history[]
        this.backups = new Map(); // stateId -> backups[]
        this.transactions = new Map(); // transactionId -> transaction info
        this.watchers = new Map(); // stateId -> watcher info
        
        // Validation schemas
        this.schemas = new Map(); // stateType -> validation schema
        
        // Initialize directories
        this._initializeDirectories();
        
        // Set up periodic backup if enabled
        if (this.config.enableAutoBackup && this.config.backupStrategy === BackupStrategy.PERIODIC) {
            this.backupInterval = setInterval(() => {
                this._performPeriodicBackup();
            }, this.config.backupInterval);
        }
        
        // Cleanup interval
        this.cleanupInterval = setInterval(() => {
            this._cleanupOldBackups();
        }, 3600000); // Every hour
    }

    /**
     * Save state with optional backup
     * @param {string} stateId - State identifier
     * @param {any} data - State data
     * @param {Object} options - Save options
     * @returns {Promise<Object>} Save result
     */
    async saveState(stateId, data, options = {}) {
        try {
            const stateInfo = {
                id: stateId,
                type: options.type || StateType.CONFIGURATION,
                data,
                timestamp: Date.now(),
                version: this._getNextVersion(stateId),
                checksum: this._calculateChecksum(data),
                status: StateStatus.ACTIVE,
                metadata: options.metadata || {}
            };

            // Validate state if schema exists
            if (this.config.enableStateValidation) {
                await this._validateState(stateInfo);
            }

            // Save to memory
            this.states.set(stateId, stateInfo);
            
            // Add to history
            this._addToHistory(stateId, stateInfo);
            
            // Save to disk
            await this._saveStateToDisk(stateInfo);
            
            // Create backup if enabled
            if (this.config.enableAutoBackup && 
                (this.config.backupStrategy === BackupStrategy.ON_CHANGE || 
                 this.config.backupStrategy === BackupStrategy.IMMEDIATE)) {
                await this._createBackup(stateInfo);
            }
            
            // Emit state change event
            this.emit('state-saved', {
                stateId,
                type: stateInfo.type,
                version: stateInfo.version,
                timestamp: stateInfo.timestamp
            });
            
            log('debug', `State saved: ${stateId}`, {
                type: stateInfo.type,
                version: stateInfo.version,
                size: JSON.stringify(data).length
            });

            return {
                success: true,
                stateId,
                version: stateInfo.version,
                checksum: stateInfo.checksum
            };

        } catch (error) {
            log('error', `Failed to save state: ${stateId}`, {
                error: error.message
            });
            
            this.emit('state-save-failed', {
                stateId,
                error: error.message
            });
            
            throw error;
        }
    }

    /**
     * Load state from memory or disk
     * @param {string} stateId - State identifier
     * @param {Object} options - Load options
     * @returns {Promise<any>} State data
     */
    async loadState(stateId, options = {}) {
        try {
            let stateInfo = this.states.get(stateId);
            
            // If not in memory, try to load from disk
            if (!stateInfo) {
                stateInfo = await this._loadStateFromDisk(stateId);
                if (stateInfo) {
                    this.states.set(stateId, stateInfo);
                }
            }
            
            if (!stateInfo) {
                throw new Error(`State not found: ${stateId}`);
            }
            
            // Validate state integrity
            if (this.config.enableStateValidation) {
                await this._validateStateIntegrity(stateInfo);
            }
            
            // Load specific version if requested
            if (options.version && options.version !== stateInfo.version) {
                stateInfo = await this._loadStateVersion(stateId, options.version);
            }
            
            this.emit('state-loaded', {
                stateId,
                type: stateInfo.type,
                version: stateInfo.version,
                timestamp: stateInfo.timestamp
            });
            
            return stateInfo.data;

        } catch (error) {
            log('error', `Failed to load state: ${stateId}`, {
                error: error.message
            });
            
            this.emit('state-load-failed', {
                stateId,
                error: error.message
            });
            
            throw error;
        }
    }

    /**
     * Restore state from backup
     * @param {string} stateId - State identifier
     * @param {Object} options - Restore options
     * @returns {Promise<Object>} Restore result
     */
    async restoreState(stateId, options = {}) {
        try {
            const backups = this.backups.get(stateId) || [];
            
            if (backups.length === 0) {
                throw new Error(`No backups found for state: ${stateId}`);
            }
            
            // Find backup to restore
            let backupToRestore;
            if (options.backupId) {
                backupToRestore = backups.find(b => b.id === options.backupId);
            } else if (options.timestamp) {
                backupToRestore = backups.find(b => b.timestamp <= options.timestamp);
            } else {
                // Use latest backup
                backupToRestore = backups[backups.length - 1];
            }
            
            if (!backupToRestore) {
                throw new Error(`Backup not found for state: ${stateId}`);
            }
            
            // Load backup data
            const backupData = await this._loadBackup(backupToRestore);
            
            // Validate backup integrity
            if (this.config.enableStateValidation) {
                await this._validateBackupIntegrity(backupToRestore, backupData);
            }
            
            // Create current state backup before restore
            const currentState = this.states.get(stateId);
            if (currentState) {
                await this._createBackup(currentState, { type: 'pre-restore' });
            }
            
            // Restore state
            const restoredState = {
                id: stateId,
                type: backupToRestore.type,
                data: backupData,
                timestamp: Date.now(),
                version: this._getNextVersion(stateId),
                checksum: this._calculateChecksum(backupData),
                status: StateStatus.RESTORED,
                metadata: {
                    ...backupToRestore.metadata,
                    restoredFrom: backupToRestore.id,
                    restoredAt: Date.now()
                }
            };
            
            // Save restored state
            this.states.set(stateId, restoredState);
            this._addToHistory(stateId, restoredState);
            await this._saveStateToDisk(restoredState);
            
            this.emit('state-restored', {
                stateId,
                backupId: backupToRestore.id,
                version: restoredState.version,
                timestamp: restoredState.timestamp
            });
            
            log('info', `State restored: ${stateId}`, {
                backupId: backupToRestore.id,
                version: restoredState.version
            });

            return {
                success: true,
                stateId,
                version: restoredState.version,
                restoredFrom: backupToRestore.id
            };

        } catch (error) {
            log('error', `Failed to restore state: ${stateId}`, {
                error: error.message
            });
            
            this.emit('state-restore-failed', {
                stateId,
                error: error.message
            });
            
            throw error;
        }
    }

    /**
     * Start transaction for atomic state changes
     * @param {Array} stateIds - State IDs involved in transaction
     * @param {Object} options - Transaction options
     * @returns {Promise<string>} Transaction ID
     */
    async startTransaction(stateIds, options = {}) {
        const transactionId = this._generateTransactionId();
        
        const transaction = {
            id: transactionId,
            stateIds,
            startTime: Date.now(),
            status: 'active',
            snapshots: new Map(),
            options
        };
        
        // Create snapshots of current states
        for (const stateId of stateIds) {
            const currentState = this.states.get(stateId);
            if (currentState) {
                transaction.snapshots.set(stateId, JSON.parse(JSON.stringify(currentState)));
            }
        }
        
        this.transactions.set(transactionId, transaction);
        
        this.emit('transaction-started', {
            transactionId,
            stateIds,
            timestamp: transaction.startTime
        });
        
        log('debug', `Transaction started: ${transactionId}`, {
            stateIds,
            snapshotCount: transaction.snapshots.size
        });
        
        return transactionId;
    }

    /**
     * Commit transaction
     * @param {string} transactionId - Transaction ID
     * @returns {Promise<Object>} Commit result
     */
    async commitTransaction(transactionId) {
        const transaction = this.transactions.get(transactionId);
        
        if (!transaction) {
            throw new Error(`Transaction not found: ${transactionId}`);
        }
        
        if (transaction.status !== 'active') {
            throw new Error(`Transaction not active: ${transactionId}`);
        }
        
        try {
            // Create backups of all states in transaction
            const backupPromises = [];
            for (const stateId of transaction.stateIds) {
                const state = this.states.get(stateId);
                if (state) {
                    backupPromises.push(this._createBackup(state, { 
                        type: 'transaction-commit',
                        transactionId 
                    }));
                }
            }
            
            await Promise.all(backupPromises);
            
            transaction.status = 'committed';
            transaction.endTime = Date.now();
            
            this.emit('transaction-committed', {
                transactionId,
                stateIds: transaction.stateIds,
                duration: transaction.endTime - transaction.startTime
            });
            
            log('info', `Transaction committed: ${transactionId}`, {
                stateIds: transaction.stateIds,
                duration: transaction.endTime - transaction.startTime
            });
            
            return {
                success: true,
                transactionId,
                stateIds: transaction.stateIds
            };

        } catch (error) {
            // Rollback on commit failure
            await this.rollbackTransaction(transactionId);
            throw error;
        }
    }

    /**
     * Rollback transaction
     * @param {string} transactionId - Transaction ID
     * @returns {Promise<Object>} Rollback result
     */
    async rollbackTransaction(transactionId) {
        const transaction = this.transactions.get(transactionId);
        
        if (!transaction) {
            throw new Error(`Transaction not found: ${transactionId}`);
        }
        
        try {
            // Restore states from snapshots
            for (const [stateId, snapshot] of transaction.snapshots.entries()) {
                this.states.set(stateId, snapshot);
                await this._saveStateToDisk(snapshot);
            }
            
            transaction.status = 'rolled_back';
            transaction.endTime = Date.now();
            
            this.emit('transaction-rolled-back', {
                transactionId,
                stateIds: transaction.stateIds,
                duration: transaction.endTime - transaction.startTime
            });
            
            log('warning', `Transaction rolled back: ${transactionId}`, {
                stateIds: transaction.stateIds,
                snapshotsRestored: transaction.snapshots.size
            });
            
            return {
                success: true,
                transactionId,
                stateIds: transaction.stateIds,
                snapshotsRestored: transaction.snapshots.size
            };

        } catch (error) {
            transaction.status = 'rollback_failed';
            transaction.endTime = Date.now();
            
            log('error', `Transaction rollback failed: ${transactionId}`, {
                error: error.message
            });
            
            throw error;
        }
    }

    /**
     * Watch state for changes
     * @param {string} stateId - State identifier
     * @param {Function} callback - Change callback
     * @param {Object} options - Watch options
     * @returns {string} Watcher ID
     */
    watchState(stateId, callback, options = {}) {
        const watcherId = this._generateWatcherId();
        
        const watcher = {
            id: watcherId,
            stateId,
            callback,
            options,
            createdAt: Date.now()
        };
        
        this.watchers.set(watcherId, watcher);
        
        this.emit('watcher-added', {
            watcherId,
            stateId,
            timestamp: watcher.createdAt
        });
        
        return watcherId;
    }

    /**
     * Remove state watcher
     * @param {string} watcherId - Watcher ID
     * @returns {boolean} Whether watcher was removed
     */
    unwatchState(watcherId) {
        const watcher = this.watchers.get(watcherId);
        if (watcher) {
            this.watchers.delete(watcherId);
            
            this.emit('watcher-removed', {
                watcherId,
                stateId: watcher.stateId
            });
            
            return true;
        }
        return false;
    }

    /**
     * Set validation schema for state type
     * @param {string} stateType - State type
     * @param {Object} schema - Validation schema
     */
    setValidationSchema(stateType, schema) {
        this.schemas.set(stateType, schema);
    }

    /**
     * Get state information
     * @param {string} stateId - State identifier
     * @returns {Object|null} State information
     */
    getStateInfo(stateId) {
        const state = this.states.get(stateId);
        if (!state) return null;
        
        return {
            id: state.id,
            type: state.type,
            version: state.version,
            timestamp: state.timestamp,
            status: state.status,
            checksum: state.checksum,
            metadata: state.metadata,
            size: JSON.stringify(state.data).length
        };
    }

    /**
     * Get state history
     * @param {string} stateId - State identifier
     * @returns {Array} State history
     */
    getStateHistory(stateId) {
        return this.stateHistory.get(stateId) || [];
    }

    /**
     * Get available backups
     * @param {string} stateId - State identifier
     * @returns {Array} Available backups
     */
    getBackups(stateId) {
        return this.backups.get(stateId) || [];
    }

    /**
     * Get all states
     * @returns {Array} All state information
     */
    getAllStates() {
        return Array.from(this.states.values()).map(state => ({
            id: state.id,
            type: state.type,
            version: state.version,
            timestamp: state.timestamp,
            status: state.status,
            size: JSON.stringify(state.data).length
        }));
    }

    /**
     * Delete state and its backups
     * @param {string} stateId - State identifier
     * @returns {Promise<boolean>} Whether state was deleted
     */
    async deleteState(stateId) {
        try {
            // Remove from memory
            this.states.delete(stateId);
            this.stateHistory.delete(stateId);
            
            // Remove backups
            const backups = this.backups.get(stateId) || [];
            for (const backup of backups) {
                await this._deleteBackup(backup);
            }
            this.backups.delete(stateId);
            
            // Remove from disk
            await this._deleteStateFromDisk(stateId);
            
            // Remove watchers
            for (const [watcherId, watcher] of this.watchers.entries()) {
                if (watcher.stateId === stateId) {
                    this.watchers.delete(watcherId);
                }
            }
            
            this.emit('state-deleted', { stateId });
            
            return true;

        } catch (error) {
            log('error', `Failed to delete state: ${stateId}`, {
                error: error.message
            });
            return false;
        }
    }

    // Private methods

    async _initializeDirectories() {
        try {
            await fs.mkdir(this.config.stateDirectory, { recursive: true });
            await fs.mkdir(this.config.backupDirectory, { recursive: true });
        } catch (error) {
            log('error', 'Failed to initialize directories', {
                error: error.message
            });
        }
    }

    async _saveStateToDisk(stateInfo) {
        const filePath = path.join(this.config.stateDirectory, `${stateInfo.id}.json`);
        const data = {
            ...stateInfo,
            data: this.config.enableCompression ? 
                this._compressData(stateInfo.data) : stateInfo.data
        };
        
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    async _loadStateFromDisk(stateId) {
        try {
            const filePath = path.join(this.config.stateDirectory, `${stateId}.json`);
            const content = await fs.readFile(filePath, 'utf8');
            const stateInfo = JSON.parse(content);
            
            if (this.config.enableCompression && stateInfo.data.compressed) {
                stateInfo.data = this._decompressData(stateInfo.data);
            }
            
            return stateInfo;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                log('error', `Failed to load state from disk: ${stateId}`, {
                    error: error.message
                });
            }
            return null;
        }
    }

    async _deleteStateFromDisk(stateId) {
        try {
            const filePath = path.join(this.config.stateDirectory, `${stateId}.json`);
            await fs.unlink(filePath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    async _createBackup(stateInfo, options = {}) {
        const backupId = this._generateBackupId();
        const backup = {
            id: backupId,
            stateId: stateInfo.id,
            type: stateInfo.type,
            version: stateInfo.version,
            timestamp: Date.now(),
            checksum: stateInfo.checksum,
            metadata: {
                ...stateInfo.metadata,
                ...options
            }
        };
        
        // Save backup to disk
        const backupPath = path.join(
            this.config.backupDirectory, 
            `${stateInfo.id}_${backupId}.json`
        );
        
        const backupData = {
            ...backup,
            data: this.config.enableCompression ? 
                this._compressData(stateInfo.data) : stateInfo.data
        };
        
        await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
        
        // Add to backup list
        if (!this.backups.has(stateInfo.id)) {
            this.backups.set(stateInfo.id, []);
        }
        
        const backupList = this.backups.get(stateInfo.id);
        backupList.push(backup);
        
        // Maintain backup limit
        if (backupList.length > this.config.maxBackups) {
            const oldBackup = backupList.shift();
            await this._deleteBackup(oldBackup);
        }
        
        this.emit('backup-created', {
            backupId,
            stateId: stateInfo.id,
            timestamp: backup.timestamp
        });
        
        return backup;
    }

    async _loadBackup(backup) {
        const backupPath = path.join(
            this.config.backupDirectory,
            `${backup.stateId}_${backup.id}.json`
        );
        
        const content = await fs.readFile(backupPath, 'utf8');
        const backupData = JSON.parse(content);
        
        if (this.config.enableCompression && backupData.data.compressed) {
            return this._decompressData(backupData.data);
        }
        
        return backupData.data;
    }

    async _deleteBackup(backup) {
        try {
            const backupPath = path.join(
                this.config.backupDirectory,
                `${backup.stateId}_${backup.id}.json`
            );
            await fs.unlink(backupPath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                log('error', `Failed to delete backup: ${backup.id}`, {
                    error: error.message
                });
            }
        }
    }

    async _validateState(stateInfo) {
        const schema = this.schemas.get(stateInfo.type);
        if (schema) {
            // Implement validation logic based on schema
            // This would typically use a validation library like Joi or Ajv
        }
    }

    async _validateStateIntegrity(stateInfo) {
        const currentChecksum = this._calculateChecksum(stateInfo.data);
        if (currentChecksum !== stateInfo.checksum) {
            stateInfo.status = StateStatus.CORRUPTED;
            throw new Error(`State integrity check failed: ${stateInfo.id}`);
        }
    }

    async _validateBackupIntegrity(backup, data) {
        const currentChecksum = this._calculateChecksum(data);
        if (currentChecksum !== backup.checksum) {
            throw new Error(`Backup integrity check failed: ${backup.id}`);
        }
    }

    _addToHistory(stateId, stateInfo) {
        if (!this.stateHistory.has(stateId)) {
            this.stateHistory.set(stateId, []);
        }
        
        const history = this.stateHistory.get(stateId);
        history.push({
            version: stateInfo.version,
            timestamp: stateInfo.timestamp,
            checksum: stateInfo.checksum,
            status: stateInfo.status
        });
        
        // Keep only recent history (last 50 versions)
        if (history.length > 50) {
            history.shift();
        }
        
        // Notify watchers
        this._notifyWatchers(stateId, stateInfo);
    }

    _notifyWatchers(stateId, stateInfo) {
        for (const watcher of this.watchers.values()) {
            if (watcher.stateId === stateId) {
                try {
                    watcher.callback(stateInfo);
                } catch (error) {
                    log('error', `Watcher callback failed: ${watcher.id}`, {
                        error: error.message
                    });
                }
            }
        }
    }

    async _performPeriodicBackup() {
        for (const [stateId, stateInfo] of this.states.entries()) {
            try {
                await this._createBackup(stateInfo, { type: 'periodic' });
            } catch (error) {
                log('error', `Periodic backup failed for state: ${stateId}`, {
                    error: error.message
                });
            }
        }
    }

    async _cleanupOldBackups() {
        const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
        
        for (const [stateId, backupList] of this.backups.entries()) {
            const oldBackups = backupList.filter(backup => backup.timestamp < cutoff);
            
            for (const backup of oldBackups) {
                await this._deleteBackup(backup);
                const index = backupList.indexOf(backup);
                if (index > -1) {
                    backupList.splice(index, 1);
                }
            }
        }
    }

    async _loadStateVersion(stateId, version) {
        // This would load a specific version from history/backups
        // Implementation depends on how versions are stored
        throw new Error('Version loading not implemented');
    }

    _calculateChecksum(data) {
        // Simple checksum calculation
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(16);
    }

    _compressData(data) {
        // Simplified compression - in practice, use a proper compression library
        return {
            compressed: true,
            data: JSON.stringify(data)
        };
    }

    _decompressData(compressedData) {
        if (compressedData.compressed) {
            return JSON.parse(compressedData.data);
        }
        return compressedData;
    }

    _getNextVersion(stateId) {
        const history = this.stateHistory.get(stateId) || [];
        return history.length + 1;
    }

    _generateTransactionId() {
        return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    _generateBackupId() {
        return `bk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    _generateWatcherId() {
        return `wt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get state manager statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const stats = {
            totalStates: this.states.size,
            totalBackups: 0,
            totalTransactions: this.transactions.size,
            activeWatchers: this.watchers.size,
            statesByType: {},
            backupsByState: {},
            storageUsage: 0
        };

        // Count backups and calculate storage
        for (const [stateId, backupList] of this.backups.entries()) {
            stats.totalBackups += backupList.length;
            stats.backupsByState[stateId] = backupList.length;
        }

        // Count states by type
        for (const state of this.states.values()) {
            stats.statesByType[state.type] = (stats.statesByType[state.type] || 0) + 1;
            stats.storageUsage += JSON.stringify(state.data).length;
        }

        return stats;
    }

    /**
     * Reset all state tracking
     */
    reset() {
        this.states.clear();
        this.stateHistory.clear();
        this.backups.clear();
        this.transactions.clear();
        this.watchers.clear();
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
        }
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        this.removeAllListeners();
    }
}

export default StateManager;

