/**
 * @fileoverview Event Correlation - Links webhook events to workflows and tasks
 * @description Manages event correlation, deduplication, and workflow tracking
 */

import { createClient } from 'redis';
import { EventEmitter } from 'events';
import { log } from '../../utils/simple_logger.js';

/**
 * Event Correlation Manager
 * Handles event correlation, deduplication, and workflow tracking
 */
export class EventCorrelation extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            redis: {
                host: config.redis?.host || process.env.REDIS_HOST || 'localhost',
                port: config.redis?.port || process.env.REDIS_PORT || 6379,
                password: config.redis?.password || process.env.REDIS_PASSWORD,
                db: config.redis?.db || 1, // Different DB from queue manager
                keyPrefix: config.redis?.keyPrefix || 'webhook:correlation:'
            },
            correlation: {
                eventTTL: config.correlation?.eventTTL || 86400, // 24 hours
                workflowTTL: config.correlation?.workflowTTL || 604800, // 7 days
                duplicateWindow: config.correlation?.duplicateWindow || 3600, // 1 hour
                maxCorrelationDepth: config.correlation?.maxCorrelationDepth || 10
            },
            tracking: {
                enableEventTracking: config.tracking?.enableEventTracking !== false,
                enableWorkflowTracking: config.tracking?.enableWorkflowTracking !== false,
                enableMetrics: config.tracking?.enableMetrics !== false
            },
            ...config
        };

        this.redis = null;
        this.isConnected = false;
        
        // Correlation patterns
        this.correlationPatterns = new Map();
        this.setupCorrelationPatterns();
        
        // Metrics
        this.metrics = {
            totalEvents: 0,
            correlatedEvents: 0,
            duplicateEvents: 0,
            workflowsCreated: 0,
            workflowsCompleted: 0,
            correlationHits: 0,
            correlationMisses: 0,
            startTime: Date.now()
        };
    }

    /**
     * Initialize the correlation manager
     */
    async initialize() {
        try {
            await this.connectRedis();
            await this.setupCorrelationKeys();
            
            log('info', 'Event Correlation Manager initialized successfully');
        } catch (error) {
            log('error', `Failed to initialize correlation manager: ${error.message}`);
            throw error;
        }
    }

    /**
     * Connect to Redis
     * @private
     */
    async connectRedis() {
        try {
            this.redis = createClient(this.config.redis);
            
            this.redis.on('error', (error) => {
                log('error', `Redis correlation error: ${error.message}`);
                this.emit('redis:error', error);
            });

            this.redis.on('connect', () => {
                log('debug', 'Correlation manager connected to Redis');
                this.emit('redis:connected');
            });

            await this.redis.connect();
            this.isConnected = true;
            
        } catch (error) {
            log('error', `Failed to connect correlation manager to Redis: ${error.message}`);
            throw error;
        }
    }

    /**
     * Setup correlation key structures
     * @private
     */
    async setupCorrelationKeys() {
        try {
            // Initialize correlation tracking structures
            const keyPrefix = this.config.redis.keyPrefix;
            
            // Event tracking keys
            this.keys = {
                events: `${keyPrefix}events`,
                duplicates: `${keyPrefix}duplicates`,
                workflows: `${keyPrefix}workflows`,
                correlations: `${keyPrefix}correlations`,
                metrics: `${keyPrefix}metrics`
            };
            
        } catch (error) {
            log('error', `Failed to setup correlation keys: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check if event is a duplicate
     * @param {string} eventId - GitHub delivery ID
     * @returns {Promise<boolean>} Whether event is duplicate
     */
    async isDuplicateEvent(eventId) {
        if (!this.isConnected) {
            log('warning', 'Correlation manager not connected, skipping duplicate check');
            return false;
        }

        try {
            const duplicateKey = `${this.keys.duplicates}:${eventId}`;
            const exists = await this.redis.exists(duplicateKey);
            
            if (exists) {
                this.metrics.duplicateEvents++;
                log('debug', `Duplicate event detected: ${eventId}`);
                return true;
            }
            
            // Mark as seen with TTL
            await this.redis.setEx(duplicateKey, this.config.correlation.duplicateWindow, '1');
            return false;
            
        } catch (error) {
            log('error', `Error checking duplicate event: ${error.message}`);
            return false; // Fail open
        }
    }

    /**
     * Correlate event with existing workflows
     * @param {Object} event - Webhook event
     * @returns {Promise<Object>} Correlation data
     */
    async correlateEvent(event) {
        this.metrics.totalEvents++;
        
        try {
            const correlationData = {
                eventId: event.id,
                timestamp: event.timestamp,
                correlations: [],
                workflowId: null,
                isNewWorkflow: false
            };

            // Extract correlation identifiers from event
            const identifiers = this.extractCorrelationIdentifiers(event);
            
            // Find existing correlations
            for (const identifier of identifiers) {
                const existingCorrelations = await this.findExistingCorrelations(identifier);
                correlationData.correlations.push(...existingCorrelations);
            }

            // Determine workflow association
            const workflowAssociation = await this.determineWorkflowAssociation(event, correlationData.correlations);
            correlationData.workflowId = workflowAssociation.workflowId;
            correlationData.isNewWorkflow = workflowAssociation.isNew;

            // Create new workflow if needed
            if (correlationData.isNewWorkflow) {
                await this.createWorkflow(correlationData.workflowId, event, identifiers);
                this.metrics.workflowsCreated++;
            } else if (correlationData.workflowId) {
                await this.updateWorkflow(correlationData.workflowId, event);
            }

            // Store event correlation
            await this.storeEventCorrelation(event, correlationData);

            if (correlationData.correlations.length > 0 || correlationData.workflowId) {
                this.metrics.correlatedEvents++;
                this.metrics.correlationHits++;
            } else {
                this.metrics.correlationMisses++;
            }

            log('debug', `Event ${event.id} correlated with workflow ${correlationData.workflowId}`);
            this.emit('event:correlated', { event, correlationData });

            return correlationData;

        } catch (error) {
            log('error', `Error correlating event: ${error.message}`);
            return {
                eventId: event.id,
                timestamp: event.timestamp,
                correlations: [],
                workflowId: null,
                isNewWorkflow: false,
                error: error.message
            };
        }
    }

    /**
     * Track event processing
     * @param {Object} event - Webhook event
     * @returns {Promise<void>}
     */
    async trackEvent(event) {
        if (!this.config.tracking.enableEventTracking) {
            return;
        }

        try {
            const eventKey = `${this.keys.events}:${event.id}`;
            const eventData = {
                id: event.id,
                type: event.type,
                source: event.source,
                timestamp: event.timestamp.toISOString(),
                correlation: event.correlation,
                tracked_at: new Date().toISOString()
            };

            await this.redis.hSet(eventKey, eventData);
            await this.redis.expire(eventKey, this.config.correlation.eventTTL);

            log('debug', `Event ${event.id} tracked successfully`);

        } catch (error) {
            log('error', `Error tracking event: ${error.message}`);
        }
    }

    /**
     * Extract correlation identifiers from event
     * @param {Object} event - Webhook event
     * @returns {Array} Array of correlation identifiers
     * @private
     */
    extractCorrelationIdentifiers(event) {
        const identifiers = [];
        const { payload } = event;

        try {
            // Repository-based correlation
            if (payload.repository) {
                identifiers.push({
                    type: 'repository',
                    value: payload.repository.full_name
                });
            }

            // Pull request-based correlation
            if (payload.pull_request) {
                identifiers.push({
                    type: 'pull_request',
                    value: `${payload.repository.full_name}#${payload.pull_request.number}`
                });

                // Branch-based correlation
                identifiers.push({
                    type: 'branch',
                    value: `${payload.repository.full_name}:${payload.pull_request.head.ref}`
                });

                // SHA-based correlation
                identifiers.push({
                    type: 'commit',
                    value: payload.pull_request.head.sha
                });
            }

            // Push event correlation
            if (payload.ref && event.type === 'push') {
                identifiers.push({
                    type: 'branch',
                    value: `${payload.repository.full_name}:${payload.ref.replace('refs/heads/', '')}`
                });

                // Commit correlations
                if (payload.commits) {
                    payload.commits.forEach(commit => {
                        identifiers.push({
                            type: 'commit',
                            value: commit.id
                        });
                    });
                }
            }

            // Check run/suite correlation
            if (payload.check_run || payload.check_suite) {
                const checkData = payload.check_run || payload.check_suite;
                identifiers.push({
                    type: 'commit',
                    value: checkData.head_sha
                });

                // PR correlations from check runs
                if (checkData.pull_requests) {
                    checkData.pull_requests.forEach(pr => {
                        identifiers.push({
                            type: 'pull_request',
                            value: `${payload.repository.full_name}#${pr.number}`
                        });
                    });
                }
            }

            // User-based correlation
            if (payload.sender) {
                identifiers.push({
                    type: 'user',
                    value: payload.sender.login
                });
            }

            log('debug', `Extracted ${identifiers.length} correlation identifiers from event ${event.id}`);
            return identifiers;

        } catch (error) {
            log('error', `Error extracting correlation identifiers: ${error.message}`);
            return [];
        }
    }

    /**
     * Find existing correlations for identifier
     * @param {Object} identifier - Correlation identifier
     * @returns {Promise<Array>} Existing correlations
     * @private
     */
    async findExistingCorrelations(identifier) {
        try {
            const correlationKey = `${this.keys.correlations}:${identifier.type}:${identifier.value}`;
            const correlations = await this.redis.sMembers(correlationKey);
            
            return correlations.map(correlation => JSON.parse(correlation));

        } catch (error) {
            log('error', `Error finding correlations for ${identifier.type}:${identifier.value}: ${error.message}`);
            return [];
        }
    }

    /**
     * Determine workflow association
     * @param {Object} event - Webhook event
     * @param {Array} correlations - Existing correlations
     * @returns {Promise<Object>} Workflow association
     * @private
     */
    async determineWorkflowAssociation(event, correlations) {
        try {
            // Check for existing workflow in correlations
            const workflowCorrelations = correlations.filter(c => c.workflowId);
            
            if (workflowCorrelations.length > 0) {
                // Use most recent workflow
                const latestWorkflow = workflowCorrelations.sort((a, b) => 
                    new Date(b.timestamp) - new Date(a.timestamp)
                )[0];
                
                return {
                    workflowId: latestWorkflow.workflowId,
                    isNew: false
                };
            }

            // Create new workflow for certain event types
            if (this.shouldCreateNewWorkflow(event)) {
                const workflowId = this.generateWorkflowId(event);
                return {
                    workflowId: workflowId,
                    isNew: true
                };
            }

            return {
                workflowId: null,
                isNew: false
            };

        } catch (error) {
            log('error', `Error determining workflow association: ${error.message}`);
            return { workflowId: null, isNew: false };
        }
    }

    /**
     * Check if event should create new workflow
     * @param {Object} event - Webhook event
     * @returns {boolean} Whether to create new workflow
     * @private
     */
    shouldCreateNewWorkflow(event) {
        const workflowTriggers = [
            { type: 'pull_request', actions: ['opened', 'reopened'] },
            { type: 'push', branches: ['main', 'master', 'develop'] }
        ];

        for (const trigger of workflowTriggers) {
            if (event.type === trigger.type) {
                if (trigger.actions && trigger.actions.includes(event.payload.action)) {
                    return true;
                }
                
                if (trigger.branches && event.payload.ref) {
                    const branch = event.payload.ref.replace('refs/heads/', '');
                    if (trigger.branches.includes(branch)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Generate workflow ID
     * @param {Object} event - Webhook event
     * @returns {string} Generated workflow ID
     * @private
     */
    generateWorkflowId(event) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        
        if (event.payload.pull_request) {
            return `workflow_pr_${event.payload.pull_request.number}_${timestamp}_${random}`;
        } else if (event.payload.ref) {
            const branch = event.payload.ref.replace('refs/heads/', '').replace(/[^a-zA-Z0-9]/g, '_');
            return `workflow_push_${branch}_${timestamp}_${random}`;
        } else {
            return `workflow_${event.type}_${timestamp}_${random}`;
        }
    }

    /**
     * Create new workflow
     * @param {string} workflowId - Workflow ID
     * @param {Object} event - Triggering event
     * @param {Array} identifiers - Correlation identifiers
     * @private
     */
    async createWorkflow(workflowId, event, identifiers) {
        try {
            const workflowKey = `${this.keys.workflows}:${workflowId}`;
            const workflowData = {
                id: workflowId,
                type: this.determineWorkflowType(event),
                status: 'active',
                created_at: new Date().toISOString(),
                triggering_event: event.id,
                repository: event.payload.repository?.full_name,
                pr_number: event.payload.pull_request?.number,
                branch: this.extractBranch(event),
                events: [event.id],
                identifiers: identifiers.map(id => `${id.type}:${id.value}`)
            };

            await this.redis.hSet(workflowKey, workflowData);
            await this.redis.expire(workflowKey, this.config.correlation.workflowTTL);

            // Store correlations for identifiers
            for (const identifier of identifiers) {
                await this.storeCorrelation(identifier, {
                    workflowId: workflowId,
                    eventId: event.id,
                    timestamp: event.timestamp.toISOString(),
                    type: 'workflow'
                });
            }

            log('info', `Created workflow ${workflowId} for event ${event.id}`);
            this.emit('workflow:created', { workflowId, event });

        } catch (error) {
            log('error', `Error creating workflow: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update existing workflow
     * @param {string} workflowId - Workflow ID
     * @param {Object} event - New event
     * @private
     */
    async updateWorkflow(workflowId, event) {
        try {
            const workflowKey = `${this.keys.workflows}:${workflowId}`;
            
            // Add event to workflow
            await this.redis.hSet(workflowKey, {
                updated_at: new Date().toISOString(),
                last_event: event.id
            });

            // Add event to events list
            const eventsField = await this.redis.hGet(workflowKey, 'events');
            const events = eventsField ? JSON.parse(eventsField) : [];
            events.push(event.id);
            await this.redis.hSet(workflowKey, 'events', JSON.stringify(events));

            // Check if workflow should be completed
            if (this.shouldCompleteWorkflow(event)) {
                await this.completeWorkflow(workflowId, event);
            }

            log('debug', `Updated workflow ${workflowId} with event ${event.id}`);
            this.emit('workflow:updated', { workflowId, event });

        } catch (error) {
            log('error', `Error updating workflow: ${error.message}`);
        }
    }

    /**
     * Complete workflow
     * @param {string} workflowId - Workflow ID
     * @param {Object} event - Completing event
     * @private
     */
    async completeWorkflow(workflowId, event) {
        try {
            const workflowKey = `${this.keys.workflows}:${workflowId}`;
            
            await this.redis.hSet(workflowKey, {
                status: 'completed',
                completed_at: new Date().toISOString(),
                completing_event: event.id
            });

            this.metrics.workflowsCompleted++;
            
            log('info', `Completed workflow ${workflowId} with event ${event.id}`);
            this.emit('workflow:completed', { workflowId, event });

        } catch (error) {
            log('error', `Error completing workflow: ${error.message}`);
        }
    }

    /**
     * Store correlation
     * @param {Object} identifier - Correlation identifier
     * @param {Object} correlationData - Correlation data
     * @private
     */
    async storeCorrelation(identifier, correlationData) {
        try {
            const correlationKey = `${this.keys.correlations}:${identifier.type}:${identifier.value}`;
            await this.redis.sAdd(correlationKey, JSON.stringify(correlationData));
            await this.redis.expire(correlationKey, this.config.correlation.workflowTTL);

        } catch (error) {
            log('error', `Error storing correlation: ${error.message}`);
        }
    }

    /**
     * Store event correlation
     * @param {Object} event - Webhook event
     * @param {Object} correlationData - Correlation data
     * @private
     */
    async storeEventCorrelation(event, correlationData) {
        try {
            const eventCorrelationKey = `${this.keys.events}:${event.id}:correlation`;
            await this.redis.setEx(
                eventCorrelationKey,
                this.config.correlation.eventTTL,
                JSON.stringify(correlationData)
            );

        } catch (error) {
            log('error', `Error storing event correlation: ${error.message}`);
        }
    }

    /**
     * Determine workflow type
     * @param {Object} event - Webhook event
     * @returns {string} Workflow type
     * @private
     */
    determineWorkflowType(event) {
        if (event.type === 'pull_request') {
            return 'pull_request_workflow';
        } else if (event.type === 'push') {
            return 'push_workflow';
        } else {
            return 'generic_workflow';
        }
    }

    /**
     * Extract branch from event
     * @param {Object} event - Webhook event
     * @returns {string|null} Branch name
     * @private
     */
    extractBranch(event) {
        if (event.payload.pull_request) {
            return event.payload.pull_request.head.ref;
        } else if (event.payload.ref) {
            return event.payload.ref.replace('refs/heads/', '');
        }
        return null;
    }

    /**
     * Check if workflow should be completed
     * @param {Object} event - Webhook event
     * @returns {boolean} Whether workflow should be completed
     * @private
     */
    shouldCompleteWorkflow(event) {
        const completionTriggers = [
            { type: 'pull_request', actions: ['closed'] },
            { type: 'check_suite', actions: ['completed'], conclusions: ['success', 'failure'] }
        ];

        for (const trigger of completionTriggers) {
            if (event.type === trigger.type) {
                if (trigger.actions && trigger.actions.includes(event.payload.action)) {
                    if (trigger.conclusions) {
                        const conclusion = event.payload.check_suite?.conclusion || 
                                         event.payload.check_run?.conclusion;
                        return trigger.conclusions.includes(conclusion);
                    }
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Setup correlation patterns
     * @private
     */
    setupCorrelationPatterns() {
        // Define patterns for automatic correlation
        this.correlationPatterns.set('pr_lifecycle', {
            events: ['pull_request', 'pull_request_review', 'check_run', 'check_suite'],
            correlationKey: (event) => {
                if (event.payload.pull_request) {
                    return `pr:${event.payload.repository.full_name}#${event.payload.pull_request.number}`;
                }
                // For check runs/suites, try to find associated PR
                const checkData = event.payload.check_run || event.payload.check_suite;
                if (checkData?.pull_requests?.length > 0) {
                    return `pr:${event.payload.repository.full_name}#${checkData.pull_requests[0].number}`;
                }
                return null;
            }
        });

        this.correlationPatterns.set('commit_lifecycle', {
            events: ['push', 'check_run', 'check_suite', 'status'],
            correlationKey: (event) => {
                if (event.payload.commits?.length > 0) {
                    return `commit:${event.payload.commits[0].id}`;
                }
                const checkData = event.payload.check_run || event.payload.check_suite;
                if (checkData?.head_sha) {
                    return `commit:${checkData.head_sha}`;
                }
                return null;
            }
        });
    }

    /**
     * Get workflow status
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<Object|null>} Workflow status
     */
    async getWorkflowStatus(workflowId) {
        try {
            const workflowKey = `${this.keys.workflows}:${workflowId}`;
            const workflowData = await this.redis.hGetAll(workflowKey);
            
            if (Object.keys(workflowData).length === 0) {
                return null;
            }

            return {
                ...workflowData,
                events: JSON.parse(workflowData.events || '[]'),
                identifiers: JSON.parse(workflowData.identifiers || '[]')
            };

        } catch (error) {
            log('error', `Error getting workflow status: ${error.message}`);
            return null;
        }
    }

    /**
     * Get event correlation
     * @param {string} eventId - Event ID
     * @returns {Promise<Object|null>} Event correlation data
     */
    async getEventCorrelation(eventId) {
        try {
            const eventCorrelationKey = `${this.keys.events}:${eventId}:correlation`;
            const correlationData = await this.redis.get(eventCorrelationKey);
            
            return correlationData ? JSON.parse(correlationData) : null;

        } catch (error) {
            log('error', `Error getting event correlation: ${error.message}`);
            return null;
        }
    }

    /**
     * Get correlation metrics
     * @returns {Object} Correlation metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.startTime,
            correlationRate: this.metrics.totalEvents > 0 ?
                this.metrics.correlatedEvents / this.metrics.totalEvents : 0,
            duplicateRate: this.metrics.totalEvents > 0 ?
                this.metrics.duplicateEvents / this.metrics.totalEvents : 0,
            hitRate: (this.metrics.correlationHits + this.metrics.correlationMisses) > 0 ?
                this.metrics.correlationHits / (this.metrics.correlationHits + this.metrics.correlationMisses) : 0
        };
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        try {
            const health = {
                status: this.isConnected ? 'healthy' : 'unhealthy',
                redis: this.isConnected ? 'connected' : 'disconnected',
                metrics: this.getMetrics()
            };

            if (this.isConnected) {
                await this.redis.ping();
                health.redis = 'connected';
            }

            return health;

        } catch (error) {
            return {
                status: 'unhealthy',
                redis: 'error',
                error: error.message,
                metrics: this.getMetrics()
            };
        }
    }

    /**
     * Clear correlation data
     * @param {string} type - Type of data to clear ('events', 'workflows', 'correlations', 'all')
     * @returns {Promise<number>} Number of keys cleared
     */
    async clearCorrelationData(type = 'all') {
        try {
            let pattern;
            
            switch (type) {
                case 'events':
                    pattern = `${this.keys.events}:*`;
                    break;
                case 'workflows':
                    pattern = `${this.keys.workflows}:*`;
                    break;
                case 'correlations':
                    pattern = `${this.keys.correlations}:*`;
                    break;
                case 'duplicates':
                    pattern = `${this.keys.duplicates}:*`;
                    break;
                case 'all':
                    pattern = `${this.config.redis.keyPrefix}*`;
                    break;
                default:
                    throw new Error(`Unknown clear type: ${type}`);
            }

            const keys = await this.redis.keys(pattern);
            if (keys.length > 0) {
                await this.redis.del(keys);
            }

            log('info', `Cleared ${keys.length} correlation keys for type: ${type}`);
            return keys.length;

        } catch (error) {
            log('error', `Error clearing correlation data: ${error.message}`);
            throw error;
        }
    }

    /**
     * Shutdown the correlation manager
     */
    async shutdown() {
        try {
            if (this.redis && this.isConnected) {
                await this.redis.disconnect();
                this.isConnected = false;
            }
            
            log('info', 'Event Correlation Manager shutdown completed');
        } catch (error) {
            log('error', `Error during correlation manager shutdown: ${error.message}`);
            throw error;
        }
    }
}

export default EventCorrelation;

