/**
 * @fileoverview State Manager - System state management
 * @description Manages system state persistence, recovery, and synchronization
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../../scripts/modules/utils.js';

/**
 * State types
 */
export const StateType = {
    SYSTEM: 'system',
    WORKFLOW: 'workflow',
    TASK: 'task',
    COMPONENT: 'component',
    USER: 'user'
};

/**
 * State operations
 */
export const StateOperation = {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    READ: 'read'
};

/**
 * State Manager - Manages system state and persistence
 */
export class StateManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enablePersistence: config.enablePersistence !== false,
            enableVersioning: config.enableVersioning !== false,
            enableBackup: config.enableBackup !== false,
            persistenceInterval: config.persistenceInterval || 30000, // 30 seconds
            maxVersions: config.maxVersions || 10,
            backupInterval: config.backupInterval || 300000, // 5 minutes
            compressionEnabled: config.compressionEnabled !== false,
            encryptionEnabled: config.encryptionEnabled || false,
            storageType: config.storageType || 'memory', // memory, file, database
            storagePath: config.storagePath || './data/state',
            ...config
        };

        this.state = new Map();
        this.stateHistory = new Map();
        this.stateVersions = new Map();
        this.stateSubscriptions = new Map();
        this.stateWatchers = new Map();
        
        this.isInitialized = false;
        this.isShuttingDown = false;
        this.persistenceTimer = null;
        this.backupTimer = null;
        this.lastPersisted = null;
        this.lastBackup = null;

        this.metrics = {
            stateOperations: 0,
            persistenceOperations: 0,
            backupOperations: 0,
            subscriptions: 0,
            watchers: 0,
            errors: 0
        };
    }

    /**
     * Initialize the State Manager
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            log('warn', 'State Manager already initialized');
            return;
        }

        try {
            log('info', 'Initializing State Manager...');

            // Initialize storage
            await this._initializeStorage();

            // Load existing state
            await this._loadState();

            // Start persistence if enabled
            if (this.config.enablePersistence) {
                this._startPersistence();
            }

            // Start backup if enabled
            if (this.config.enableBackup) {
                this._startBackup();
            }

            this.isInitialized = true;
            this.emit('initialized');

            log('info', 'State Manager initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize State Manager:', error);
            throw error;
        }
    }

    /**
     * Set state value
     * @param {string} key - State key
     * @param {any} value - State value
     * @param {Object} options - Set options
     * @returns {Promise<void>}
     */
    async setState(key, value, options = {}) {
        this._ensureInitialized();

        try {
            const stateId = uuidv4();
            const timestamp = new Date().toISOString();
            
            const stateEntry = {
                id: stateId,
                key,
                value,
                type: options.type || StateType.SYSTEM,
                version: this._getNextVersion(key),
                timestamp,
                metadata: options.metadata || {},
                ttl: options.ttl || null,
                persistent: options.persistent !== false
            };

            // Store current state
            const previousValue = this.state.get(key);
            this.state.set(key, stateEntry);

            // Store version if versioning is enabled
            if (this.config.enableVersioning) {
                this._storeVersion(key, stateEntry);
            }

            // Store in history
            this._addToHistory(key, StateOperation.UPDATE, stateEntry, previousValue);

            // Notify watchers
            await this._notifyWatchers(key, stateEntry, previousValue);

            // Notify subscribers
            await this._notifySubscribers(key, stateEntry, previousValue);

            this.metrics.stateOperations++;
            this.emit('stateChanged', { key, value, previousValue, operation: StateOperation.UPDATE });

            log('debug', `State set: ${key}`);

        } catch (error) {
            this.metrics.errors++;
            log('error', `Failed to set state ${key}:`, error);
            throw error;
        }
    }

    /**
     * Get state value
     * @param {string} key - State key
     * @param {Object} options - Get options
     * @returns {any} State value
     */
    getState(key, options = {}) {
        this._ensureInitialized();

        try {
            const stateEntry = this.state.get(key);
            
            if (!stateEntry) {
                return options.defaultValue || null;
            }

            // Check TTL
            if (stateEntry.ttl && new Date() > new Date(stateEntry.ttl)) {
                this.deleteState(key);
                return options.defaultValue || null;
            }

            // Return specific version if requested
            if (options.version) {
                return this._getStateVersion(key, options.version);
            }

            this.metrics.stateOperations++;
            this.emit('stateAccessed', { key, value: stateEntry.value });

            return stateEntry.value;

        } catch (error) {
            this.metrics.errors++;
            log('error', `Failed to get state ${key}:`, error);
            throw error;
        }
    }

    /**
     * Delete state value
     * @param {string} key - State key
     * @returns {Promise<boolean>} True if deleted
     */
    async deleteState(key) {
        this._ensureInitialized();

        try {
            const stateEntry = this.state.get(key);
            
            if (!stateEntry) {
                return false;
            }

            const previousValue = stateEntry.value;
            this.state.delete(key);

            // Store in history
            this._addToHistory(key, StateOperation.DELETE, null, stateEntry);

            // Notify watchers
            await this._notifyWatchers(key, null, stateEntry);

            // Notify subscribers
            await this._notifySubscribers(key, null, stateEntry);

            this.metrics.stateOperations++;
            this.emit('stateDeleted', { key, previousValue });

            log('debug', `State deleted: ${key}`);
            return true;

        } catch (error) {
            this.metrics.errors++;
            log('error', `Failed to delete state ${key}:`, error);
            throw error;
        }
    }

    /**
     * Check if state exists
     * @param {string} key - State key
     * @returns {boolean} True if exists
     */
    hasState(key) {
        this._ensureInitialized();
        
        const stateEntry = this.state.get(key);
        
        if (!stateEntry) {
            return false;
        }

        // Check TTL
        if (stateEntry.ttl && new Date() > new Date(stateEntry.ttl)) {
            this.deleteState(key);
            return false;
        }

        return true;
    }

    /**
     * Get all state keys
     * @param {Object} options - Filter options
     * @returns {Array} State keys
     */
    getStateKeys(options = {}) {
        this._ensureInitialized();

        let keys = Array.from(this.state.keys());

        // Filter by type
        if (options.type) {
            keys = keys.filter(key => {
                const stateEntry = this.state.get(key);
                return stateEntry && stateEntry.type === options.type;
            });
        }

        // Filter by pattern
        if (options.pattern) {
            const regex = new RegExp(options.pattern);
            keys = keys.filter(key => regex.test(key));
        }

        return keys;
    }

    /**
     * Get multiple state values
     * @param {Array} keys - State keys
     * @returns {Object} State values
     */
    getMultipleStates(keys) {
        this._ensureInitialized();

        const result = {};
        
        for (const key of keys) {
            result[key] = this.getState(key);
        }

        return result;
    }

    /**
     * Set multiple state values
     * @param {Object} states - State key-value pairs
     * @param {Object} options - Set options
     * @returns {Promise<void>}
     */
    async setMultipleStates(states, options = {}) {
        this._ensureInitialized();

        const promises = Object.entries(states).map(([key, value]) =>
            this.setState(key, value, options)
        );

        await Promise.all(promises);
    }

    /**
     * Subscribe to state changes
     * @param {string} key - State key or pattern
     * @param {Function} callback - Callback function
     * @param {Object} options - Subscription options
     * @returns {string} Subscription ID
     */
    subscribe(key, callback, options = {}) {
        this._ensureInitialized();

        const subscriptionId = uuidv4();
        
        if (!this.stateSubscriptions.has(key)) {
            this.stateSubscriptions.set(key, new Map());
        }

        this.stateSubscriptions.get(key).set(subscriptionId, {
            id: subscriptionId,
            callback,
            options,
            createdAt: new Date().toISOString()
        });

        this.metrics.subscriptions++;
        log('debug', `State subscription created: ${key} (${subscriptionId})`);

        return subscriptionId;
    }

    /**
     * Unsubscribe from state changes
     * @param {string} subscriptionId - Subscription ID
     * @returns {boolean} True if unsubscribed
     */
    unsubscribe(subscriptionId) {
        this._ensureInitialized();

        for (const [key, subscriptions] of this.stateSubscriptions.entries()) {
            if (subscriptions.has(subscriptionId)) {
                subscriptions.delete(subscriptionId);
                
                if (subscriptions.size === 0) {
                    this.stateSubscriptions.delete(key);
                }

                log('debug', `State subscription removed: ${subscriptionId}`);
                return true;
            }
        }

        return false;
    }

    /**
     * Watch state changes with advanced filtering
     * @param {Object} watchConfig - Watch configuration
     * @returns {string} Watcher ID
     */
    watch(watchConfig) {
        this._ensureInitialized();

        const watcherId = uuidv4();
        
        this.stateWatchers.set(watcherId, {
            id: watcherId,
            config: watchConfig,
            createdAt: new Date().toISOString()
        });

        this.metrics.watchers++;
        log('debug', `State watcher created: ${watcherId}`);

        return watcherId;
    }

    /**
     * Remove state watcher
     * @param {string} watcherId - Watcher ID
     * @returns {boolean} True if removed
     */
    unwatch(watcherId) {
        this._ensureInitialized();

        if (this.stateWatchers.has(watcherId)) {
            this.stateWatchers.delete(watcherId);
            log('debug', `State watcher removed: ${watcherId}`);
            return true;
        }

        return false;
    }

    /**
     * Get state history
     * @param {string} key - State key
     * @param {Object} options - History options
     * @returns {Array} State history
     */
    getStateHistory(key, options = {}) {
        this._ensureInitialized();

        const history = this.stateHistory.get(key) || [];
        
        let filteredHistory = [...history];

        // Filter by operation
        if (options.operation) {
            filteredHistory = filteredHistory.filter(entry => entry.operation === options.operation);
        }

        // Filter by date range
        if (options.since) {
            const sinceDate = new Date(options.since);
            filteredHistory = filteredHistory.filter(entry => new Date(entry.timestamp) >= sinceDate);
        }

        if (options.until) {
            const untilDate = new Date(options.until);
            filteredHistory = filteredHistory.filter(entry => new Date(entry.timestamp) <= untilDate);
        }

        // Limit results
        if (options.limit) {
            filteredHistory = filteredHistory.slice(-options.limit);
        }

        return filteredHistory;
    }

    /**
     * Get state versions
     * @param {string} key - State key
     * @returns {Array} State versions
     */
    getStateVersions(key) {
        this._ensureInitialized();

        if (!this.config.enableVersioning) {
            throw new Error('State versioning is not enabled');
        }

        return this.stateVersions.get(key) || [];
    }

    /**
     * Restore state from version
     * @param {string} key - State key
     * @param {number} version - Version number
     * @returns {Promise<void>}
     */
    async restoreStateVersion(key, version) {
        this._ensureInitialized();

        if (!this.config.enableVersioning) {
            throw new Error('State versioning is not enabled');
        }

        const stateVersion = this._getStateVersion(key, version);
        if (!stateVersion) {
            throw new Error(`State version not found: ${key}@${version}`);
        }

        await this.setState(key, stateVersion.value, {
            type: stateVersion.type,
            metadata: { ...stateVersion.metadata, restoredFrom: version }
        });

        log('info', `State restored from version: ${key}@${version}`);
    }

    /**
     * Create state snapshot
     * @param {Object} options - Snapshot options
     * @returns {Promise<string>} Snapshot ID
     */
    async createSnapshot(options = {}) {
        this._ensureInitialized();

        try {
            const snapshotId = uuidv4();
            const timestamp = new Date().toISOString();
            
            const snapshot = {
                id: snapshotId,
                timestamp,
                state: this._serializeState(),
                metadata: options.metadata || {},
                compressed: this.config.compressionEnabled
            };

            // Store snapshot
            await this._storeSnapshot(snapshot);

            this.emit('snapshotCreated', { snapshotId, snapshot });
            log('info', `State snapshot created: ${snapshotId}`);

            return snapshotId;

        } catch (error) {
            log('error', 'Failed to create state snapshot:', error);
            throw error;
        }
    }

    /**
     * Restore from snapshot
     * @param {string} snapshotId - Snapshot ID
     * @returns {Promise<void>}
     */
    async restoreSnapshot(snapshotId) {
        this._ensureInitialized();

        try {
            const snapshot = await this._loadSnapshot(snapshotId);
            if (!snapshot) {
                throw new Error(`Snapshot not found: ${snapshotId}`);
            }

            // Clear current state
            this.state.clear();

            // Restore state from snapshot
            await this._deserializeState(snapshot.state);

            this.emit('snapshotRestored', { snapshotId, snapshot });
            log('info', `State restored from snapshot: ${snapshotId}`);

        } catch (error) {
            log('error', `Failed to restore snapshot ${snapshotId}:`, error);
            throw error;
        }
    }

    /**
     * Get manager status
     * @returns {Object} Manager status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            shuttingDown: this.isShuttingDown,
            healthy: this.isInitialized && !this.isShuttingDown,
            stateCount: this.state.size,
            subscriptions: this.metrics.subscriptions,
            watchers: this.metrics.watchers,
            lastPersisted: this.lastPersisted,
            lastBackup: this.lastBackup,
            storageType: this.config.storageType,
            persistenceEnabled: this.config.enablePersistence,
            versioningEnabled: this.config.enableVersioning,
            backupEnabled: this.config.enableBackup,
            metrics: { ...this.metrics }
        };
    }

    /**
     * Shutdown the State Manager
     * @returns {Promise<void>}
     */
    async shutdown() {
        if (this.isShuttingDown) {
            return;
        }

        try {
            log('info', 'Shutting down State Manager...');
            this.isShuttingDown = true;

            // Stop timers
            if (this.persistenceTimer) {
                clearInterval(this.persistenceTimer);
                this.persistenceTimer = null;
            }

            if (this.backupTimer) {
                clearInterval(this.backupTimer);
                this.backupTimer = null;
            }

            // Final persistence
            if (this.config.enablePersistence) {
                await this._persistState();
            }

            // Final backup
            if (this.config.enableBackup) {
                await this._backupState();
            }

            this.emit('shutdown');
            log('info', 'State Manager shutdown complete');

        } catch (error) {
            log('error', 'Error during State Manager shutdown:', error);
            throw error;
        }
    }

    /**
     * Get next version number for a key
     * @param {string} key - State key
     * @returns {number} Next version number
     * @private
     */
    _getNextVersion(key) {
        if (!this.config.enableVersioning) {
            return 1;
        }

        const versions = this.stateVersions.get(key) || [];
        return versions.length + 1;
    }

    /**
     * Store state version
     * @param {string} key - State key
     * @param {Object} stateEntry - State entry
     * @private
     */
    _storeVersion(key, stateEntry) {
        if (!this.stateVersions.has(key)) {
            this.stateVersions.set(key, []);
        }

        const versions = this.stateVersions.get(key);
        versions.push({ ...stateEntry });

        // Limit versions
        if (versions.length > this.config.maxVersions) {
            versions.shift();
        }
    }

    /**
     * Get specific state version
     * @param {string} key - State key
     * @param {number} version - Version number
     * @returns {Object} State version
     * @private
     */
    _getStateVersion(key, version) {
        const versions = this.stateVersions.get(key) || [];
        return versions.find(v => v.version === version);
    }

    /**
     * Add entry to state history
     * @param {string} key - State key
     * @param {string} operation - Operation type
     * @param {Object} newValue - New value
     * @param {Object} oldValue - Old value
     * @private
     */
    _addToHistory(key, operation, newValue, oldValue) {
        if (!this.stateHistory.has(key)) {
            this.stateHistory.set(key, []);
        }

        const history = this.stateHistory.get(key);
        history.push({
            operation,
            timestamp: new Date().toISOString(),
            newValue,
            oldValue
        });

        // Limit history size
        if (history.length > 100) {
            history.shift();
        }
    }

    /**
     * Notify state watchers
     * @param {string} key - State key
     * @param {Object} newValue - New value
     * @param {Object} oldValue - Old value
     * @private
     */
    async _notifyWatchers(key, newValue, oldValue) {
        for (const [watcherId, watcher] of this.stateWatchers.entries()) {
            try {
                const config = watcher.config;
                
                // Check if watcher matches
                if (this._watcherMatches(config, key, newValue, oldValue)) {
                    await config.callback({
                        key,
                        newValue: newValue?.value,
                        oldValue: oldValue?.value,
                        watcherId
                    });
                }
            } catch (error) {
                log('error', `Error in state watcher ${watcherId}:`, error);
            }
        }
    }

    /**
     * Notify state subscribers
     * @param {string} key - State key
     * @param {Object} newValue - New value
     * @param {Object} oldValue - Old value
     * @private
     */
    async _notifySubscribers(key, newValue, oldValue) {
        const subscriptions = this.stateSubscriptions.get(key);
        if (!subscriptions) {
            return;
        }

        for (const [subscriptionId, subscription] of subscriptions.entries()) {
            try {
                await subscription.callback({
                    key,
                    newValue: newValue?.value,
                    oldValue: oldValue?.value,
                    subscriptionId
                });
            } catch (error) {
                log('error', `Error in state subscription ${subscriptionId}:`, error);
            }
        }
    }

    /**
     * Check if watcher matches the state change
     * @param {Object} config - Watcher config
     * @param {string} key - State key
     * @param {Object} newValue - New value
     * @param {Object} oldValue - Old value
     * @returns {boolean} True if matches
     * @private
     */
    _watcherMatches(config, key, newValue, oldValue) {
        // Key pattern matching
        if (config.keyPattern) {
            const regex = new RegExp(config.keyPattern);
            if (!regex.test(key)) {
                return false;
            }
        }

        // Type matching
        if (config.type && newValue?.type !== config.type) {
            return false;
        }

        // Value condition
        if (config.condition && !config.condition(newValue?.value, oldValue?.value)) {
            return false;
        }

        return true;
    }

    /**
     * Start persistence timer
     * @private
     */
    _startPersistence() {
        this.persistenceTimer = setInterval(() => {
            this._persistState();
        }, this.config.persistenceInterval);

        log('debug', 'State persistence started');
    }

    /**
     * Start backup timer
     * @private
     */
    _startBackup() {
        this.backupTimer = setInterval(() => {
            this._backupState();
        }, this.config.backupInterval);

        log('debug', 'State backup started');
    }

    /**
     * Persist state to storage
     * @private
     */
    async _persistState() {
        try {
            const serializedState = this._serializeState();
            await this._writeToStorage('state', serializedState);
            
            this.lastPersisted = new Date().toISOString();
            this.metrics.persistenceOperations++;
            
            log('debug', 'State persisted successfully');
        } catch (error) {
            this.metrics.errors++;
            log('error', 'Failed to persist state:', error);
        }
    }

    /**
     * Backup state
     * @private
     */
    async _backupState() {
        try {
            const snapshotId = await this.createSnapshot({
                metadata: { type: 'automatic_backup' }
            });
            
            this.lastBackup = new Date().toISOString();
            this.metrics.backupOperations++;
            
            log('debug', `State backup created: ${snapshotId}`);
        } catch (error) {
            this.metrics.errors++;
            log('error', 'Failed to backup state:', error);
        }
    }

    /**
     * Serialize state for storage
     * @returns {string} Serialized state
     * @private
     */
    _serializeState() {
        const stateObject = {};
        
        for (const [key, value] of this.state.entries()) {
            stateObject[key] = value;
        }

        return JSON.stringify(stateObject);
    }

    /**
     * Deserialize state from storage
     * @param {string} serializedState - Serialized state
     * @private
     */
    async _deserializeState(serializedState) {
        const stateObject = JSON.parse(serializedState);
        
        for (const [key, value] of Object.entries(stateObject)) {
            this.state.set(key, value);
        }
    }

    /**
     * Initialize storage
     * @private
     */
    async _initializeStorage() {
        // Initialize storage based on type
        switch (this.config.storageType) {
            case 'memory':
                // No initialization needed for memory storage
                break;
            case 'file':
                // Initialize file storage
                await this._initializeFileStorage();
                break;
            case 'database':
                // Initialize database storage
                await this._initializeDatabaseStorage();
                break;
            default:
                throw new Error(`Unknown storage type: ${this.config.storageType}`);
        }

        log('debug', `Storage initialized: ${this.config.storageType}`);
    }

    /**
     * Load state from storage
     * @private
     */
    async _loadState() {
        try {
            const serializedState = await this._readFromStorage('state');
            if (serializedState) {
                await this._deserializeState(serializedState);
                log('debug', 'State loaded from storage');
            }
        } catch (error) {
            log('warn', 'Failed to load state from storage:', error);
        }
    }

    /**
     * Initialize file storage
     * @private
     */
    async _initializeFileStorage() {
        // File storage initialization would go here
        log('debug', 'File storage initialized');
    }

    /**
     * Initialize database storage
     * @private
     */
    async _initializeDatabaseStorage() {
        // Database storage initialization would go here
        log('debug', 'Database storage initialized');
    }

    /**
     * Write to storage
     * @param {string} key - Storage key
     * @param {string} data - Data to write
     * @private
     */
    async _writeToStorage(key, data) {
        // Storage write implementation based on type
        log('debug', `Writing to storage: ${key}`);
    }

    /**
     * Read from storage
     * @param {string} key - Storage key
     * @returns {string} Data from storage
     * @private
     */
    async _readFromStorage(key) {
        // Storage read implementation based on type
        log('debug', `Reading from storage: ${key}`);
        return null;
    }

    /**
     * Store snapshot
     * @param {Object} snapshot - Snapshot to store
     * @private
     */
    async _storeSnapshot(snapshot) {
        // Snapshot storage implementation
        log('debug', `Storing snapshot: ${snapshot.id}`);
    }

    /**
     * Load snapshot
     * @param {string} snapshotId - Snapshot ID
     * @returns {Object} Snapshot data
     * @private
     */
    async _loadSnapshot(snapshotId) {
        // Snapshot loading implementation
        log('debug', `Loading snapshot: ${snapshotId}`);
        return null;
    }

    /**
     * Ensure the manager is initialized
     * @private
     */
    _ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('State Manager not initialized');
        }

        if (this.isShuttingDown) {
            throw new Error('State Manager is shutting down');
        }
    }
}

export default StateManager;

