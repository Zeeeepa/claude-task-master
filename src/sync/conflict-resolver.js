/**
 * @fileoverview Data Conflict Resolution System
 * @description Handles conflict detection and resolution for status synchronization across systems
 */

import EventEmitter from 'events';
import { performance } from 'perf_hooks';

/**
 * Conflict Resolver for handling data synchronization conflicts
 */
export class ConflictResolver extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            // Resolution strategies
            defaultStrategy: 'priority_based', // priority_based, timestamp_based, manual, custom
            autoResolve: true,
            escalationThreshold: 3,
            
            // System priorities (lower number = higher priority)
            systemPriorities: {
                postgresql: 0,    // Highest priority - source of truth
                linear: 1,        // Second priority - project management
                github: 2,        // Third priority - code management
                agentapi: 3       // Lowest priority - execution layer
            },
            
            // Conflict detection settings
            enableConflictDetection: true,
            conflictWindow: 30000, // 30 seconds
            maxConflictHistory: 1000,
            
            // Resolution timeouts
            resolutionTimeout: 10000, // 10 seconds
            escalationDelay: 5000,    // 5 seconds
            
            // Validation settings
            enableValidation: true,
            strictValidation: false,
            
            // Logging and monitoring
            enableLogging: true,
            enableMetrics: true,
            
            ...config
        };

        // Conflict tracking
        this.activeConflicts = new Map();
        this.conflictHistory = [];
        this.resolutionStrategies = new Map();
        
        // Metrics
        this.metrics = {
            totalConflicts: 0,
            resolvedConflicts: 0,
            escalatedConflicts: 0,
            autoResolvedConflicts: 0,
            manualResolvedConflicts: 0,
            averageResolutionTime: 0,
            conflictsByType: {},
            conflictsBySystem: {},
            resolutionsByStrategy: {}
        };
        
        // State
        this.isInitialized = false;
        
        // Initialize built-in resolution strategies
        this._initializeResolutionStrategies();
    }

    /**
     * Initialize the conflict resolver
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('🔄 Initializing Conflict Resolver...');

            // Initialize metrics
            if (this.config.enableMetrics) {
                this._initializeMetrics();
            }

            // Setup cleanup intervals
            this._setupCleanupIntervals();

            this.isInitialized = true;
            this.emit('initialized');

            console.log('✅ Conflict Resolver initialized successfully');

        } catch (error) {
            console.error('❌ Conflict Resolver initialization failed:', error);
            throw error;
        }
    }

    /**
     * Detect conflicts for a status update
     * @param {Object} statusUpdate - Status update to check
     * @param {string} sourceSystem - Source system of the update
     * @returns {Promise<Array>} Array of detected conflicts
     */
    async detectConflicts(statusUpdate, sourceSystem) {
        const startTime = performance.now();
        
        try {
            if (!this.config.enableConflictDetection) {
                return [];
            }

            console.log(`🔍 Detecting conflicts for ${statusUpdate.entityType}:${statusUpdate.entityId} from ${sourceSystem}`);

            const conflicts = [];
            
            // Check for concurrent updates
            const concurrentConflicts = await this._detectConcurrentUpdates(statusUpdate, sourceSystem);
            conflicts.push(...concurrentConflicts);
            
            // Check for state transition conflicts
            const stateConflicts = await this._detectStateTransitionConflicts(statusUpdate, sourceSystem);
            conflicts.push(...stateConflicts);
            
            // Check for dependency conflicts
            const dependencyConflicts = await this._detectDependencyConflicts(statusUpdate, sourceSystem);
            conflicts.push(...dependencyConflicts);
            
            // Check for business rule conflicts
            const businessRuleConflicts = await this._detectBusinessRuleConflicts(statusUpdate, sourceSystem);
            conflicts.push(...businessRuleConflicts);

            // Update metrics
            this.metrics.totalConflicts += conflicts.length;
            this._updateConflictMetrics(conflicts, sourceSystem);

            // Log conflicts
            if (conflicts.length > 0 && this.config.enableLogging) {
                console.log(`⚠️ Detected ${conflicts.length} conflicts for ${statusUpdate.entityType}:${statusUpdate.entityId}`);
                conflicts.forEach((conflict, index) => {
                    console.log(`  ${index + 1}. ${conflict.type}: ${conflict.description}`);
                });
            }

            // Emit conflict detection event
            if (conflicts.length > 0) {
                this.emit('conflict:detected', {
                    statusUpdate,
                    sourceSystem,
                    conflicts,
                    detectionTime: performance.now() - startTime
                });
            }

            return conflicts;

        } catch (error) {
            console.error('❌ Error detecting conflicts:', error);
            throw error;
        }
    }

    /**
     * Resolve conflicts using configured strategy
     * @param {Array} conflicts - Array of conflicts to resolve
     * @param {Object} statusUpdate - Original status update
     * @returns {Promise<Object>} Resolution result
     */
    async resolveConflicts(conflicts, statusUpdate) {
        const startTime = performance.now();
        const resolutionId = this._generateResolutionId();
        
        try {
            console.log(`🔧 Resolving ${conflicts.length} conflicts [${resolutionId}]`);

            // Create resolution context
            const resolutionContext = {
                id: resolutionId,
                conflicts,
                statusUpdate,
                strategy: this.config.defaultStrategy,
                startTime,
                attempts: 0
            };

            // Add to active conflicts
            this.activeConflicts.set(resolutionId, resolutionContext);

            // Attempt resolution
            const resolution = await this._attemptResolution(resolutionContext);

            // Update metrics
            this.metrics.resolvedConflicts++;
            if (resolution.automatic) {
                this.metrics.autoResolvedConflicts++;
            } else {
                this.metrics.manualResolvedConflicts++;
            }

            const resolutionTime = performance.now() - startTime;
            this._updateResolutionTimeMetrics(resolutionTime);
            this._updateResolutionStrategyMetrics(resolution.strategy);

            // Add to history
            this._addToConflictHistory({
                ...resolutionContext,
                resolution,
                resolutionTime,
                resolvedAt: Date.now()
            });

            // Clean up active conflicts
            this.activeConflicts.delete(resolutionId);

            // Emit resolution event
            this.emit('conflict:resolved', {
                resolutionId,
                conflicts,
                resolution,
                resolutionTime
            });

            console.log(`✅ Conflicts resolved [${resolutionId}] using ${resolution.strategy} in ${resolutionTime.toFixed(2)}ms`);

            return resolution;

        } catch (error) {
            console.error(`❌ Failed to resolve conflicts [${resolutionId}]:`, error);
            
            // Handle escalation
            if (conflicts.length >= this.config.escalationThreshold) {
                await this._escalateConflicts(resolutionId, conflicts, error);
            }
            
            throw error;
        }
    }

    /**
     * Register custom resolution strategy
     * @param {string} name - Strategy name
     * @param {Function} resolver - Resolution function
     */
    registerResolutionStrategy(name, resolver) {
        if (typeof resolver !== 'function') {
            throw new Error('Resolution strategy must be a function');
        }

        this.resolutionStrategies.set(name, resolver);
        console.log(`📝 Registered resolution strategy: ${name}`);
    }

    /**
     * Get conflict resolution status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            activeConflicts: this.activeConflicts.size,
            conflictHistorySize: this.conflictHistory.length,
            metrics: this.metrics,
            availableStrategies: Array.from(this.resolutionStrategies.keys()),
            config: {
                defaultStrategy: this.config.defaultStrategy,
                autoResolve: this.config.autoResolve,
                escalationThreshold: this.config.escalationThreshold
            }
        };
    }

    /**
     * Detect concurrent updates
     * @private
     */
    async _detectConcurrentUpdates(statusUpdate, sourceSystem) {
        const conflicts = [];
        const { entityType, entityId } = statusUpdate;
        
        // Check for recent updates to the same entity from different systems
        const recentConflicts = this.conflictHistory
            .filter(conflict => 
                conflict.statusUpdate.entityType === entityType &&
                conflict.statusUpdate.entityId === entityId &&
                Date.now() - conflict.startTime < this.config.conflictWindow
            );

        if (recentConflicts.length > 0) {
            conflicts.push({
                type: 'concurrent_update',
                severity: 'medium',
                description: `Concurrent update detected for ${entityType}:${entityId}`,
                sourceSystem,
                conflictingSystems: recentConflicts.map(c => c.statusUpdate.source),
                timestamp: Date.now()
            });
        }

        return conflicts;
    }

    /**
     * Detect state transition conflicts
     * @private
     */
    async _detectStateTransitionConflicts(statusUpdate, sourceSystem) {
        const conflicts = [];
        const { status, previousStatus } = statusUpdate;
        
        // Define valid state transitions
        const validTransitions = {
            'pending': ['in_progress', 'cancelled'],
            'in_progress': ['completed', 'failed', 'pending', 'cancelled'],
            'completed': ['pending'], // Allow reopening
            'failed': ['pending', 'in_progress'],
            'cancelled': ['pending']
        };

        if (previousStatus && validTransitions[previousStatus]) {
            if (!validTransitions[previousStatus].includes(status)) {
                conflicts.push({
                    type: 'invalid_state_transition',
                    severity: 'high',
                    description: `Invalid state transition from ${previousStatus} to ${status}`,
                    sourceSystem,
                    previousStatus,
                    newStatus: status,
                    validTransitions: validTransitions[previousStatus],
                    timestamp: Date.now()
                });
            }
        }

        return conflicts;
    }

    /**
     * Detect dependency conflicts
     * @private
     */
    async _detectDependencyConflicts(statusUpdate, sourceSystem) {
        const conflicts = [];
        const { entityType, entityId, status } = statusUpdate;
        
        // Check if completing a task with incomplete dependencies
        if (status === 'completed' && entityType === 'task') {
            // TODO: Query database for task dependencies
            // This is a placeholder implementation
            const hasIncompleteDependencies = false; // Would check actual dependencies
            
            if (hasIncompleteDependencies) {
                conflicts.push({
                    type: 'dependency_conflict',
                    severity: 'high',
                    description: `Cannot complete ${entityType}:${entityId} with incomplete dependencies`,
                    sourceSystem,
                    timestamp: Date.now()
                });
            }
        }

        return conflicts;
    }

    /**
     * Detect business rule conflicts
     * @private
     */
    async _detectBusinessRuleConflicts(statusUpdate, sourceSystem) {
        const conflicts = [];
        
        // Example business rules
        const businessRules = [
            {
                name: 'no_weekend_deployments',
                check: (update) => {
                    const now = new Date();
                    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
                    return !(update.status === 'completed' && update.entityType === 'deployment' && isWeekend);
                },
                message: 'Deployments are not allowed on weekends'
            },
            {
                name: 'require_approval_for_production',
                check: (update) => {
                    return !(update.status === 'completed' && 
                            update.environment === 'production' && 
                            !update.metadata?.approved);
                },
                message: 'Production deployments require approval'
            }
        ];

        for (const rule of businessRules) {
            if (!rule.check(statusUpdate)) {
                conflicts.push({
                    type: 'business_rule_violation',
                    severity: 'medium',
                    description: rule.message,
                    rule: rule.name,
                    sourceSystem,
                    timestamp: Date.now()
                });
            }
        }

        return conflicts;
    }

    /**
     * Attempt conflict resolution
     * @private
     */
    async _attemptResolution(resolutionContext) {
        const { conflicts, statusUpdate, strategy } = resolutionContext;
        
        // Get resolution strategy
        const resolver = this.resolutionStrategies.get(strategy);
        if (!resolver) {
            throw new Error(`Unknown resolution strategy: ${strategy}`);
        }

        // Attempt resolution
        const resolution = await resolver(conflicts, statusUpdate, this.config);
        
        // Validate resolution
        if (this.config.enableValidation) {
            this._validateResolution(resolution, conflicts);
        }

        return {
            ...resolution,
            strategy,
            automatic: this.config.autoResolve,
            timestamp: Date.now()
        };
    }

    /**
     * Escalate conflicts
     * @private
     */
    async _escalateConflicts(resolutionId, conflicts, error) {
        console.warn(`⚠️ Escalating conflicts [${resolutionId}] due to: ${error.message}`);
        
        this.metrics.escalatedConflicts++;
        
        this.emit('conflict:escalated', {
            resolutionId,
            conflicts,
            error: error.message,
            timestamp: Date.now()
        });

        // TODO: Implement escalation logic (e.g., notify administrators, create tickets)
    }

    /**
     * Initialize built-in resolution strategies
     * @private
     */
    _initializeResolutionStrategies() {
        // Priority-based resolution
        this.registerResolutionStrategy('priority_based', async (conflicts, statusUpdate, config) => {
            const systemPriorities = config.systemPriorities;
            
            // Find the highest priority system involved
            let highestPrioritySystem = statusUpdate.source;
            let highestPriority = systemPriorities[statusUpdate.source] || 999;
            
            for (const conflict of conflicts) {
                const conflictPriority = systemPriorities[conflict.sourceSystem] || 999;
                if (conflictPriority < highestPriority) {
                    highestPriority = conflictPriority;
                    highestPrioritySystem = conflict.sourceSystem;
                }
            }

            return {
                resolvedUpdate: statusUpdate,
                winningSystem: highestPrioritySystem,
                reason: `Resolved using system priority (${highestPrioritySystem} has priority ${highestPriority})`,
                conflictsResolved: conflicts.length
            };
        });

        // Timestamp-based resolution (last write wins)
        this.registerResolutionStrategy('timestamp_based', async (conflicts, statusUpdate, config) => {
            return {
                resolvedUpdate: statusUpdate,
                winningSystem: statusUpdate.source,
                reason: 'Resolved using last write wins (timestamp-based)',
                conflictsResolved: conflicts.length
            };
        });

        // Manual resolution (requires human intervention)
        this.registerResolutionStrategy('manual', async (conflicts, statusUpdate, config) => {
            throw new Error('Manual resolution required - human intervention needed');
        });

        // Custom merge strategy
        this.registerResolutionStrategy('merge', async (conflicts, statusUpdate, config) => {
            // Attempt to merge conflicting updates
            const mergedUpdate = { ...statusUpdate };
            
            // Apply conflict-specific merge logic
            for (const conflict of conflicts) {
                switch (conflict.type) {
                    case 'concurrent_update':
                        // Keep the most recent timestamp
                        if (conflict.timestamp > mergedUpdate.timestamp) {
                            mergedUpdate.timestamp = conflict.timestamp;
                        }
                        break;
                        
                    case 'invalid_state_transition':
                        // Use the previous valid state
                        mergedUpdate.status = conflict.previousStatus;
                        break;
                        
                    default:
                        // Default to original update
                        break;
                }
            }

            return {
                resolvedUpdate: mergedUpdate,
                winningSystem: 'merged',
                reason: 'Resolved by merging conflicting updates',
                conflictsResolved: conflicts.length
            };
        });
    }

    /**
     * Validate resolution
     * @private
     */
    _validateResolution(resolution, conflicts) {
        if (!resolution || typeof resolution !== 'object') {
            throw new Error('Resolution must be an object');
        }

        if (!resolution.resolvedUpdate) {
            throw new Error('Resolution must include resolvedUpdate');
        }

        if (!resolution.reason) {
            throw new Error('Resolution must include reason');
        }

        if (this.config.strictValidation) {
            // Additional strict validation
            if (resolution.conflictsResolved !== conflicts.length) {
                throw new Error('Resolution must address all conflicts');
            }
        }
    }

    /**
     * Setup cleanup intervals
     * @private
     */
    _setupCleanupIntervals() {
        // Clean up old conflict history
        setInterval(() => {
            this._cleanupConflictHistory();
        }, 60000); // Every minute

        // Clean up stale active conflicts
        setInterval(() => {
            this._cleanupStaleConflicts();
        }, 30000); // Every 30 seconds
    }

    /**
     * Cleanup old conflict history
     * @private
     */
    _cleanupConflictHistory() {
        if (this.conflictHistory.length > this.config.maxConflictHistory) {
            const excess = this.conflictHistory.length - this.config.maxConflictHistory;
            this.conflictHistory.splice(0, excess);
        }
    }

    /**
     * Cleanup stale active conflicts
     * @private
     */
    _cleanupStaleConflicts() {
        const now = Date.now();
        const timeout = this.config.resolutionTimeout;
        
        for (const [id, context] of this.activeConflicts.entries()) {
            if (now - context.startTime > timeout) {
                console.warn(`⚠️ Removing stale conflict resolution: ${id}`);
                this.activeConflicts.delete(id);
                
                this.emit('conflict:timeout', {
                    resolutionId: id,
                    conflicts: context.conflicts,
                    timeout
                });
            }
        }
    }

    /**
     * Add to conflict history
     * @private
     */
    _addToConflictHistory(conflictRecord) {
        this.conflictHistory.push(conflictRecord);
        
        // Ensure we don't exceed max history size
        if (this.conflictHistory.length > this.config.maxConflictHistory) {
            this.conflictHistory.shift();
        }
    }

    /**
     * Update conflict metrics
     * @private
     */
    _updateConflictMetrics(conflicts, sourceSystem) {
        // Update conflicts by type
        for (const conflict of conflicts) {
            const type = conflict.type;
            this.metrics.conflictsByType[type] = (this.metrics.conflictsByType[type] || 0) + 1;
        }

        // Update conflicts by system
        this.metrics.conflictsBySystem[sourceSystem] = (this.metrics.conflictsBySystem[sourceSystem] || 0) + conflicts.length;
    }

    /**
     * Update resolution time metrics
     * @private
     */
    _updateResolutionTimeMetrics(resolutionTime) {
        const totalResolved = this.metrics.resolvedConflicts;
        const currentAvg = this.metrics.averageResolutionTime;
        this.metrics.averageResolutionTime = ((currentAvg * (totalResolved - 1)) + resolutionTime) / totalResolved;
    }

    /**
     * Update resolution strategy metrics
     * @private
     */
    _updateResolutionStrategyMetrics(strategy) {
        this.metrics.resolutionsByStrategy[strategy] = (this.metrics.resolutionsByStrategy[strategy] || 0) + 1;
    }

    /**
     * Initialize metrics
     * @private
     */
    _initializeMetrics() {
        // Metrics are already initialized in constructor
    }

    /**
     * Generate resolution ID
     * @private
     */
    _generateResolutionId() {
        return `resolution_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default ConflictResolver;

