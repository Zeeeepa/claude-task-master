/**
 * @fileoverview Status Mapping System
 * @description Maps status values between different systems (Linear, GitHub, PostgreSQL, AgentAPI)
 */

import EventEmitter from 'events';

/**
 * Status Mapper for translating status values between systems
 */
export class StatusMapper extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            // Mapping settings
            enableBidirectionalMapping: true,
            enableCustomMappings: true,
            enableValidation: true,
            strictMapping: false,
            
            // Default mappings
            defaultMappings: {
                // PostgreSQL status values (canonical)
                postgresql: {
                    pending: 'pending',
                    in_progress: 'in_progress',
                    completed: 'completed',
                    failed: 'failed',
                    cancelled: 'cancelled'
                },
                
                // Linear status mappings
                linear: {
                    pending: 'Backlog',
                    in_progress: 'In Progress',
                    completed: 'Done',
                    failed: 'Cancelled',
                    cancelled: 'Cancelled'
                },
                
                // GitHub status mappings
                github: {
                    pending: 'open',
                    in_progress: 'draft',
                    completed: 'merged',
                    failed: 'closed',
                    cancelled: 'closed'
                },
                
                // AgentAPI status mappings
                agentapi: {
                    pending: 'queued',
                    in_progress: 'running',
                    completed: 'success',
                    failed: 'error',
                    cancelled: 'cancelled'
                }
            },
            
            // Entity type mappings
            entityTypeMappings: {
                postgresql: {
                    task: 'task',
                    issue: 'task',
                    pr: 'task',
                    deployment: 'task'
                },
                linear: {
                    task: 'Issue',
                    issue: 'Issue',
                    pr: 'Issue',
                    deployment: 'Issue'
                },
                github: {
                    task: 'issue',
                    issue: 'issue',
                    pr: 'pull_request',
                    deployment: 'deployment'
                },
                agentapi: {
                    task: 'job',
                    issue: 'job',
                    pr: 'job',
                    deployment: 'deployment'
                }
            },
            
            // Priority mappings
            priorityMappings: {
                postgresql: {
                    0: 'critical',
                    1: 'high',
                    2: 'normal',
                    3: 'low'
                },
                linear: {
                    0: 'Urgent',
                    1: 'High',
                    2: 'Medium',
                    3: 'Low'
                },
                github: {
                    0: 'critical',
                    1: 'high',
                    2: 'medium',
                    3: 'low'
                },
                agentapi: {
                    0: 'critical',
                    1: 'high',
                    2: 'normal',
                    3: 'low'
                }
            },
            
            ...config
        };

        // Custom mappings
        this.customMappings = new Map();
        this.reverseMappings = new Map();
        
        // Validation rules
        this.validationRules = new Map();
        
        // Metrics
        this.metrics = {
            totalMappings: 0,
            successfulMappings: 0,
            failedMappings: 0,
            customMappingsUsed: 0,
            validationFailures: 0,
            mappingsBySystem: {},
            mappingsByType: {}
        };
        
        // State
        this.isInitialized = false;
        
        // Initialize reverse mappings
        this._initializeReverseMappings();
    }

    /**
     * Initialize the status mapper
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('🔄 Initializing Status Mapper...');

            // Initialize reverse mappings
            this._initializeReverseMappings();

            // Initialize validation rules
            this._initializeValidationRules();

            // Initialize metrics
            this._initializeMetrics();

            this.isInitialized = true;
            this.emit('initialized');

            console.log('✅ Status Mapper initialized successfully');

        } catch (error) {
            console.error('❌ Status Mapper initialization failed:', error);
            throw error;
        }
    }

    /**
     * Map status to all target systems
     * @param {Object} statusUpdate - Status update to map
     * @param {string} sourceSystem - Source system
     * @returns {Promise<Object>} Mapped statuses for all systems
     */
    async mapStatusToSystems(statusUpdate, sourceSystem) {
        try {
            console.log(`🗺️ Mapping status from ${sourceSystem} to all systems`);

            const mappedStatuses = {};
            const targetSystems = Object.keys(this.config.defaultMappings);

            for (const targetSystem of targetSystems) {
                if (targetSystem === sourceSystem) {
                    // Keep original for source system
                    mappedStatuses[targetSystem] = statusUpdate;
                    continue;
                }

                try {
                    const mappedStatus = await this.mapStatus(statusUpdate, sourceSystem, targetSystem);
                    mappedStatuses[targetSystem] = mappedStatus;
                } catch (error) {
                    console.error(`❌ Failed to map status to ${targetSystem}:`, error);
                    this.metrics.failedMappings++;
                    
                    // Continue with other systems
                    mappedStatuses[targetSystem] = {
                        error: error.message,
                        originalStatus: statusUpdate
                    };
                }
            }

            this.metrics.totalMappings++;
            this.metrics.successfulMappings++;

            return mappedStatuses;

        } catch (error) {
            console.error('❌ Failed to map status to systems:', error);
            this.metrics.failedMappings++;
            throw error;
        }
    }

    /**
     * Map status between two specific systems
     * @param {Object} statusUpdate - Status update to map
     * @param {string} sourceSystem - Source system
     * @param {string} targetSystem - Target system
     * @returns {Promise<Object>} Mapped status update
     */
    async mapStatus(statusUpdate, sourceSystem, targetSystem) {
        try {
            console.log(`🗺️ Mapping status from ${sourceSystem} to ${targetSystem}`);

            // Validate inputs
            this._validateMappingInputs(statusUpdate, sourceSystem, targetSystem);

            // Create mapped status update
            const mappedUpdate = {
                ...statusUpdate,
                originalSystem: sourceSystem,
                targetSystem: targetSystem,
                mappedAt: new Date().toISOString()
            };

            // Map status value
            mappedUpdate.status = await this._mapStatusValue(
                statusUpdate.status, 
                sourceSystem, 
                targetSystem
            );

            // Map entity type
            mappedUpdate.entityType = await this._mapEntityType(
                statusUpdate.entityType, 
                sourceSystem, 
                targetSystem
            );

            // Map priority if present
            if (statusUpdate.priority !== undefined) {
                mappedUpdate.priority = await this._mapPriority(
                    statusUpdate.priority, 
                    sourceSystem, 
                    targetSystem
                );
            }

            // Map metadata
            mappedUpdate.metadata = await this._mapMetadata(
                statusUpdate.metadata || {}, 
                sourceSystem, 
                targetSystem
            );

            // Validate mapped result
            if (this.config.enableValidation) {
                await this._validateMappedStatus(mappedUpdate, targetSystem);
            }

            // Update metrics
            this._updateMappingMetrics(sourceSystem, targetSystem, 'status');

            console.log(`✅ Status mapped from ${sourceSystem} to ${targetSystem}`);
            this.emit('status:mapped', {
                sourceSystem,
                targetSystem,
                originalStatus: statusUpdate,
                mappedStatus: mappedUpdate
            });

            return mappedUpdate;

        } catch (error) {
            console.error(`❌ Failed to map status from ${sourceSystem} to ${targetSystem}:`, error);
            this.metrics.failedMappings++;
            throw error;
        }
    }

    /**
     * Add custom mapping
     * @param {string} sourceSystem - Source system
     * @param {string} targetSystem - Target system
     * @param {string} sourceValue - Source value
     * @param {string} targetValue - Target value
     * @param {string} type - Mapping type (status, entityType, priority)
     */
    addCustomMapping(sourceSystem, targetSystem, sourceValue, targetValue, type = 'status') {
        const mappingKey = `${sourceSystem}:${targetSystem}:${type}`;
        
        if (!this.customMappings.has(mappingKey)) {
            this.customMappings.set(mappingKey, new Map());
        }
        
        this.customMappings.get(mappingKey).set(sourceValue, targetValue);
        
        // Update reverse mapping
        const reverseMappingKey = `${targetSystem}:${sourceSystem}:${type}`;
        if (!this.reverseMappings.has(reverseMappingKey)) {
            this.reverseMappings.set(reverseMappingKey, new Map());
        }
        this.reverseMappings.get(reverseMappingKey).set(targetValue, sourceValue);

        console.log(`📝 Added custom mapping: ${sourceSystem}.${sourceValue} -> ${targetSystem}.${targetValue} (${type})`);
        
        this.emit('mapping:added', {
            sourceSystem,
            targetSystem,
            sourceValue,
            targetValue,
            type
        });
    }

    /**
     * Remove custom mapping
     * @param {string} sourceSystem - Source system
     * @param {string} targetSystem - Target system
     * @param {string} sourceValue - Source value
     * @param {string} type - Mapping type
     */
    removeCustomMapping(sourceSystem, targetSystem, sourceValue, type = 'status') {
        const mappingKey = `${sourceSystem}:${targetSystem}:${type}`;
        const customMapping = this.customMappings.get(mappingKey);
        
        if (customMapping && customMapping.has(sourceValue)) {
            const targetValue = customMapping.get(sourceValue);
            customMapping.delete(sourceValue);
            
            // Remove reverse mapping
            const reverseMappingKey = `${targetSystem}:${sourceSystem}:${type}`;
            const reverseMapping = this.reverseMappings.get(reverseMappingKey);
            if (reverseMapping) {
                reverseMapping.delete(targetValue);
            }

            console.log(`🗑️ Removed custom mapping: ${sourceSystem}.${sourceValue} -> ${targetSystem}.${targetValue} (${type})`);
            
            this.emit('mapping:removed', {
                sourceSystem,
                targetSystem,
                sourceValue,
                targetValue,
                type
            });
        }
    }

    /**
     * Get mapping status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            customMappingsCount: this._getCustomMappingsCount(),
            supportedSystems: Object.keys(this.config.defaultMappings),
            metrics: this.metrics,
            config: {
                enableBidirectionalMapping: this.config.enableBidirectionalMapping,
                enableCustomMappings: this.config.enableCustomMappings,
                enableValidation: this.config.enableValidation,
                strictMapping: this.config.strictMapping
            }
        };
    }

    /**
     * Map status value
     * @private
     */
    async _mapStatusValue(statusValue, sourceSystem, targetSystem) {
        // Check for custom mapping first
        if (this.config.enableCustomMappings) {
            const customMapping = this._getCustomMapping(sourceSystem, targetSystem, 'status');
            if (customMapping && customMapping.has(statusValue)) {
                this.metrics.customMappingsUsed++;
                return customMapping.get(statusValue);
            }
        }

        // Use default mappings
        const sourceMappings = this.config.defaultMappings[sourceSystem];
        const targetMappings = this.config.defaultMappings[targetSystem];

        if (!sourceMappings || !targetMappings) {
            throw new Error(`No mappings found for ${sourceSystem} or ${targetSystem}`);
        }

        // Find canonical status (reverse lookup from source)
        let canonicalStatus = null;
        for (const [canonical, mapped] of Object.entries(sourceMappings)) {
            if (mapped === statusValue) {
                canonicalStatus = canonical;
                break;
            }
        }

        if (!canonicalStatus) {
            if (this.config.strictMapping) {
                throw new Error(`No mapping found for status '${statusValue}' in ${sourceSystem}`);
            } else {
                // Return original value if not strict
                return statusValue;
            }
        }

        // Map to target system
        const targetStatus = targetMappings[canonicalStatus];
        if (!targetStatus) {
            if (this.config.strictMapping) {
                throw new Error(`No mapping found for canonical status '${canonicalStatus}' in ${targetSystem}`);
            } else {
                return statusValue;
            }
        }

        return targetStatus;
    }

    /**
     * Map entity type
     * @private
     */
    async _mapEntityType(entityType, sourceSystem, targetSystem) {
        // Check for custom mapping first
        if (this.config.enableCustomMappings) {
            const customMapping = this._getCustomMapping(sourceSystem, targetSystem, 'entityType');
            if (customMapping && customMapping.has(entityType)) {
                this.metrics.customMappingsUsed++;
                return customMapping.get(entityType);
            }
        }

        // Use default mappings
        const sourceMappings = this.config.entityTypeMappings[sourceSystem];
        const targetMappings = this.config.entityTypeMappings[targetSystem];

        if (!sourceMappings || !targetMappings) {
            return entityType; // Return original if no mappings
        }

        // Find canonical entity type
        let canonicalType = null;
        for (const [canonical, mapped] of Object.entries(sourceMappings)) {
            if (mapped === entityType) {
                canonicalType = canonical;
                break;
            }
        }

        if (!canonicalType) {
            return entityType; // Return original if not found
        }

        return targetMappings[canonicalType] || entityType;
    }

    /**
     * Map priority
     * @private
     */
    async _mapPriority(priority, sourceSystem, targetSystem) {
        // Check for custom mapping first
        if (this.config.enableCustomMappings) {
            const customMapping = this._getCustomMapping(sourceSystem, targetSystem, 'priority');
            if (customMapping && customMapping.has(priority)) {
                this.metrics.customMappingsUsed++;
                return customMapping.get(priority);
            }
        }

        // Use default mappings
        const sourceMappings = this.config.priorityMappings[sourceSystem];
        const targetMappings = this.config.priorityMappings[targetSystem];

        if (!sourceMappings || !targetMappings) {
            return priority; // Return original if no mappings
        }

        // Find canonical priority
        let canonicalPriority = null;
        for (const [canonical, mapped] of Object.entries(sourceMappings)) {
            if (mapped === priority) {
                canonicalPriority = canonical;
                break;
            }
        }

        if (!canonicalPriority) {
            return priority; // Return original if not found
        }

        return targetMappings[canonicalPriority] || priority;
    }

    /**
     * Map metadata
     * @private
     */
    async _mapMetadata(metadata, sourceSystem, targetSystem) {
        // Basic metadata mapping - can be extended for system-specific needs
        const mappedMetadata = { ...metadata };
        
        // Add mapping information
        mappedMetadata.mappingInfo = {
            sourceSystem,
            targetSystem,
            mappedAt: new Date().toISOString()
        };

        // System-specific metadata transformations
        switch (targetSystem) {
            case 'linear':
                // Linear-specific metadata transformations
                if (metadata.labels) {
                    mappedMetadata.labelIds = metadata.labels;
                }
                break;
                
            case 'github':
                // GitHub-specific metadata transformations
                if (metadata.assignee) {
                    mappedMetadata.assignees = [metadata.assignee];
                }
                break;
                
            case 'postgresql':
                // PostgreSQL-specific metadata transformations
                mappedMetadata.updated_at = new Date().toISOString();
                break;
                
            case 'agentapi':
                // AgentAPI-specific metadata transformations
                mappedMetadata.jobMetadata = metadata;
                break;
        }

        return mappedMetadata;
    }

    /**
     * Get custom mapping
     * @private
     */
    _getCustomMapping(sourceSystem, targetSystem, type) {
        const mappingKey = `${sourceSystem}:${targetSystem}:${type}`;
        return this.customMappings.get(mappingKey);
    }

    /**
     * Validate mapping inputs
     * @private
     */
    _validateMappingInputs(statusUpdate, sourceSystem, targetSystem) {
        if (!statusUpdate || typeof statusUpdate !== 'object') {
            throw new Error('Status update must be an object');
        }

        if (!statusUpdate.status) {
            throw new Error('Status update must include status');
        }

        if (!statusUpdate.entityType) {
            throw new Error('Status update must include entityType');
        }

        if (!sourceSystem || !targetSystem) {
            throw new Error('Source and target systems must be specified');
        }

        if (sourceSystem === targetSystem) {
            throw new Error('Source and target systems cannot be the same');
        }

        if (!this.config.defaultMappings[sourceSystem]) {
            throw new Error(`Unsupported source system: ${sourceSystem}`);
        }

        if (!this.config.defaultMappings[targetSystem]) {
            throw new Error(`Unsupported target system: ${targetSystem}`);
        }
    }

    /**
     * Validate mapped status
     * @private
     */
    async _validateMappedStatus(mappedStatus, targetSystem) {
        const validationRule = this.validationRules.get(targetSystem);
        
        if (validationRule) {
            const isValid = await validationRule(mappedStatus);
            if (!isValid) {
                this.metrics.validationFailures++;
                throw new Error(`Mapped status validation failed for ${targetSystem}`);
            }
        }
    }

    /**
     * Initialize reverse mappings
     * @private
     */
    _initializeReverseMappings() {
        // Create reverse mappings for bidirectional support
        for (const [sourceSystem, sourceMappings] of Object.entries(this.config.defaultMappings)) {
            for (const [targetSystem, targetMappings] of Object.entries(this.config.defaultMappings)) {
                if (sourceSystem === targetSystem) continue;

                const reverseKey = `${targetSystem}:${sourceSystem}:status`;
                if (!this.reverseMappings.has(reverseKey)) {
                    this.reverseMappings.set(reverseKey, new Map());
                }

                const reverseMapping = this.reverseMappings.get(reverseKey);
                
                // Create reverse mapping
                for (const [canonical, sourceValue] of Object.entries(sourceMappings)) {
                    const targetValue = targetMappings[canonical];
                    if (targetValue) {
                        reverseMapping.set(targetValue, sourceValue);
                    }
                }
            }
        }
    }

    /**
     * Initialize validation rules
     * @private
     */
    _initializeValidationRules() {
        // PostgreSQL validation
        this.validationRules.set('postgresql', async (mappedStatus) => {
            const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'];
            return validStatuses.includes(mappedStatus.status);
        });

        // Linear validation
        this.validationRules.set('linear', async (mappedStatus) => {
            const validStatuses = ['Backlog', 'In Progress', 'Done', 'Cancelled'];
            return validStatuses.includes(mappedStatus.status);
        });

        // GitHub validation
        this.validationRules.set('github', async (mappedStatus) => {
            const validStatuses = ['open', 'draft', 'merged', 'closed'];
            return validStatuses.includes(mappedStatus.status);
        });

        // AgentAPI validation
        this.validationRules.set('agentapi', async (mappedStatus) => {
            const validStatuses = ['queued', 'running', 'success', 'error', 'cancelled'];
            return validStatuses.includes(mappedStatus.status);
        });
    }

    /**
     * Initialize metrics
     * @private
     */
    _initializeMetrics() {
        const systems = Object.keys(this.config.defaultMappings);
        
        for (const system of systems) {
            this.metrics.mappingsBySystem[system] = 0;
        }

        this.metrics.mappingsByType = {
            status: 0,
            entityType: 0,
            priority: 0
        };
    }

    /**
     * Update mapping metrics
     * @private
     */
    _updateMappingMetrics(sourceSystem, targetSystem, type) {
        this.metrics.mappingsBySystem[sourceSystem]++;
        this.metrics.mappingsBySystem[targetSystem]++;
        this.metrics.mappingsByType[type]++;
    }

    /**
     * Get custom mappings count
     * @private
     */
    _getCustomMappingsCount() {
        let count = 0;
        for (const mapping of this.customMappings.values()) {
            count += mapping.size;
        }
        return count;
    }
}

export default StatusMapper;

