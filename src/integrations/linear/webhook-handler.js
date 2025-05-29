/**
 * Linear Webhook Handler
 * 
 * Handles Linear webhook endpoint setup, event processing and validation,
 * real-time sync triggers, and event deduplication.
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';

export class LinearWebhookHandler extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            webhookSecret: config.webhookSecret || process.env.LINEAR_WEBHOOK_SECRET,
            webhookUrl: config.webhookUrl || process.env.LINEAR_WEBHOOK_URL,
            teamId: config.teamId || process.env.LINEAR_TEAM_ID,
            enableDeduplication: config.enableDeduplication !== false,
            deduplicationWindow: config.deduplicationWindow || 60000, // 1 minute
            enableEventLogging: config.enableEventLogging !== false,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            ...config
        };

        // Event deduplication
        this.processedEvents = new Map();
        this.deduplicationCleanupInterval = null;

        // Event processing queue
        this.eventQueue = [];
        this.isProcessingQueue = false;

        // Database connection (injected)
        this.database = null;

        // Supported webhook events
        this.supportedEvents = new Set([
            'Issue',
            'Comment',
            'IssueLabel',
            'Project',
            'WorkflowState'
        ]);

        // Event type mappings
        this.eventTypeMap = {
            'Issue': {
                'create': 'issue_created',
                'update': 'issue_updated',
                'remove': 'issue_deleted'
            },
            'Comment': {
                'create': 'comment_created',
                'update': 'comment_updated',
                'remove': 'comment_deleted'
            },
            'IssueLabel': {
                'create': 'label_created',
                'update': 'label_updated',
                'remove': 'label_deleted'
            },
            'Project': {
                'create': 'project_created',
                'update': 'project_updated',
                'remove': 'project_deleted'
            },
            'WorkflowState': {
                'create': 'state_created',
                'update': 'state_updated',
                'remove': 'state_deleted'
            }
        };
    }

    /**
     * Initialize webhook handler
     */
    async initialize(database) {
        this.database = database;
        
        // Ensure webhook tables exist
        await this.ensureWebhookTables();
        
        // Start deduplication cleanup
        if (this.config.enableDeduplication) {
            this.startDeduplicationCleanup();
        }
        
        console.log('Linear Webhook Handler initialized');
    }

    // ==================== WEBHOOK ENDPOINT ====================

    /**
     * Handle incoming webhook request
     */
    async handleWebhook(request, response) {
        try {
            // Validate webhook signature
            const isValid = await this.validateWebhookSignature(request);
            if (!isValid) {
                response.status(401).json({ error: 'Invalid webhook signature' });
                return;
            }

            // Parse webhook payload
            const payload = this.parseWebhookPayload(request);
            if (!payload) {
                response.status(400).json({ error: 'Invalid webhook payload' });
                return;
            }

            // Check if event is supported
            if (!this.isSupportedEvent(payload)) {
                response.status(200).json({ message: 'Event type not supported', skipped: true });
                return;
            }

            // Check for duplicate events
            if (this.config.enableDeduplication && await this.isDuplicateEvent(payload)) {
                response.status(200).json({ message: 'Duplicate event ignored', skipped: true });
                return;
            }

            // Queue event for processing
            await this.queueEvent(payload);

            // Respond immediately
            response.status(200).json({ 
                message: 'Webhook received successfully',
                event_id: payload.id,
                event_type: payload.type
            });

            // Process event asynchronously
            this.processEventQueue();

        } catch (error) {
            console.error('Webhook handling error:', error);
            response.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Validate webhook signature
     */
    async validateWebhookSignature(request) {
        if (!this.config.webhookSecret) {
            console.warn('Webhook secret not configured, skipping signature validation');
            return true;
        }

        const signature = request.headers['linear-signature'];
        if (!signature) {
            console.error('Missing Linear signature header');
            return false;
        }

        try {
            const body = JSON.stringify(request.body);
            const expectedSignature = crypto
                .createHmac('sha256', this.config.webhookSecret)
                .update(body, 'utf8')
                .digest('hex');

            const providedSignature = signature.replace('sha256=', '');
            
            return crypto.timingSafeEqual(
                Buffer.from(expectedSignature, 'hex'),
                Buffer.from(providedSignature, 'hex')
            );

        } catch (error) {
            console.error('Signature validation error:', error);
            return false;
        }
    }

    /**
     * Parse webhook payload
     */
    parseWebhookPayload(request) {
        try {
            const payload = request.body;
            
            if (!payload || !payload.data || !payload.type) {
                throw new Error('Invalid payload structure');
            }

            return {
                id: payload.data.id || `webhook_${Date.now()}`,
                type: payload.type,
                action: payload.action || 'update',
                data: payload.data,
                url: payload.url,
                createdAt: payload.createdAt || new Date().toISOString(),
                updatedAt: payload.updatedAt || new Date().toISOString(),
                organizationId: payload.organizationId,
                webhookTimestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('Payload parsing error:', error);
            return null;
        }
    }

    /**
     * Check if event is supported
     */
    isSupportedEvent(payload) {
        return this.supportedEvents.has(payload.type);
    }

    /**
     * Check for duplicate events
     */
    async isDuplicateEvent(payload) {
        const eventKey = `${payload.type}_${payload.id}_${payload.action}`;
        const now = Date.now();
        
        // Check in-memory cache first
        const cached = this.processedEvents.get(eventKey);
        if (cached && (now - cached.timestamp) < this.config.deduplicationWindow) {
            return true;
        }

        // Check database for recent events
        if (this.database) {
            const query = `
                SELECT id FROM linear_webhook_events 
                WHERE event_key = $1 
                AND created_at > NOW() - INTERVAL '${this.config.deduplicationWindow} milliseconds'
                LIMIT 1
            `;
            
            const result = await this.database.query(query, [eventKey]);
            if (result.rows.length > 0) {
                return true;
            }
        }

        // Mark as processed
        this.processedEvents.set(eventKey, { timestamp: now });
        return false;
    }

    // ==================== EVENT PROCESSING ====================

    /**
     * Queue event for processing
     */
    async queueEvent(payload) {
        const event = {
            id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            payload,
            queuedAt: new Date(),
            attempts: 0,
            status: 'queued'
        };

        this.eventQueue.push(event);
        
        // Log event if enabled
        if (this.config.enableEventLogging) {
            await this.logWebhookEvent(event);
        }
    }

    /**
     * Process event queue
     */
    async processEventQueue() {
        if (this.isProcessingQueue || this.eventQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.eventQueue.length > 0) {
            const event = this.eventQueue.shift();
            
            try {
                await this.processEvent(event);
                event.status = 'processed';
                
            } catch (error) {
                event.attempts++;
                event.lastError = error.message;
                event.status = 'failed';
                
                console.error(`Event processing failed (attempt ${event.attempts}):`, error);
                
                // Retry if under max attempts
                if (event.attempts < this.config.maxRetries) {
                    event.status = 'retry';
                    setTimeout(() => {
                        this.eventQueue.unshift(event);
                        this.processEventQueue();
                    }, this.config.retryDelay * event.attempts);
                }
            }
            
            // Update event log
            if (this.config.enableEventLogging) {
                await this.updateEventLog(event);
            }
        }

        this.isProcessingQueue = false;
    }

    /**
     * Process individual event
     */
    async processEvent(event) {
        const { payload } = event;
        const eventType = this.mapEventType(payload.type, payload.action);
        
        if (!eventType) {
            throw new Error(`Unknown event type: ${payload.type}.${payload.action}`);
        }

        // Emit specific event
        this.emit(eventType, payload);
        
        // Emit generic event
        this.emit('webhook:event', {
            type: eventType,
            payload,
            processedAt: new Date()
        });

        // Process based on event type
        switch (eventType) {
            case 'issue_created':
                await this.handleIssueCreated(payload);
                break;
                
            case 'issue_updated':
                await this.handleIssueUpdated(payload);
                break;
                
            case 'issue_deleted':
                await this.handleIssueDeleted(payload);
                break;
                
            case 'comment_created':
                await this.handleCommentCreated(payload);
                break;
                
            case 'comment_updated':
                await this.handleCommentUpdated(payload);
                break;
                
            default:
                console.log(`Processed event: ${eventType}`);
        }
    }

    /**
     * Map event type and action to internal event name
     */
    mapEventType(type, action) {
        const typeMap = this.eventTypeMap[type];
        return typeMap ? typeMap[action] : null;
    }

    // ==================== EVENT HANDLERS ====================

    /**
     * Handle issue created event
     */
    async handleIssueCreated(payload) {
        const issue = payload.data;
        
        // Check if this is a Task Master managed issue
        if (await this.isTaskMasterManagedIssue(issue)) {
            console.log(`Skipping Task Master managed issue: ${issue.id}`);
            return;
        }

        // Emit sync event
        this.emit('sync:issue_created', {
            linear_issue_id: issue.id,
            title: issue.title,
            description: issue.description,
            state: issue.state,
            priority: issue.priority,
            assignee: issue.assignee,
            team: issue.team,
            labels: issue.labels,
            project: issue.project,
            parent: issue.parent,
            created_at: issue.createdAt
        });
    }

    /**
     * Handle issue updated event
     */
    async handleIssueUpdated(payload) {
        const issue = payload.data;
        
        // Check if this is a Task Master managed issue
        if (await this.isTaskMasterManagedIssue(issue)) {
            // This is our issue being updated, check for external changes
            await this.handleTaskMasterIssueUpdated(issue);
            return;
        }

        // Emit sync event for external issue
        this.emit('sync:issue_updated', {
            linear_issue_id: issue.id,
            title: issue.title,
            description: issue.description,
            state: issue.state,
            priority: issue.priority,
            assignee: issue.assignee,
            updated_at: issue.updatedAt
        });
    }

    /**
     * Handle issue deleted event
     */
    async handleIssueDeleted(payload) {
        const issue = payload.data;
        
        // Emit sync event
        this.emit('sync:issue_deleted', {
            linear_issue_id: issue.id,
            deleted_at: new Date().toISOString()
        });
    }

    /**
     * Handle comment created event
     */
    async handleCommentCreated(payload) {
        const comment = payload.data;
        
        // Check if this is on a Task Master managed issue
        if (await this.isTaskMasterManagedIssue({ id: comment.issue.id })) {
            this.emit('sync:comment_on_managed_issue', {
                comment_id: comment.id,
                issue_id: comment.issue.id,
                body: comment.body,
                user: comment.user,
                created_at: comment.createdAt
            });
        }
    }

    /**
     * Handle comment updated event
     */
    async handleCommentUpdated(payload) {
        const comment = payload.data;
        
        // Check if this is on a Task Master managed issue
        if (await this.isTaskMasterManagedIssue({ id: comment.issue.id })) {
            this.emit('sync:comment_updated_on_managed_issue', {
                comment_id: comment.id,
                issue_id: comment.issue.id,
                body: comment.body,
                updated_at: comment.updatedAt
            });
        }
    }

    /**
     * Handle Task Master managed issue updated
     */
    async handleTaskMasterIssueUpdated(issue) {
        // Check what changed and if it conflicts with our sync
        const correlation = await this.getIssueCorrelation(issue.id);
        if (!correlation) {
            return;
        }

        // Emit conflict detection event
        this.emit('sync:potential_conflict', {
            linear_issue_id: issue.id,
            task_id: correlation.task_id,
            updated_at: issue.updatedAt,
            correlation
        });
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Check if issue is managed by Task Master
     */
    async isTaskMasterManagedIssue(issue) {
        if (!this.database) {
            return false;
        }

        // Check for correlation
        const correlation = await this.getIssueCorrelation(issue.id);
        if (correlation) {
            return true;
        }

        // Check for Task Master labels
        if (issue.labels) {
            const taskMasterLabels = ['task-master', 'epic', 'task'];
            return issue.labels.some(label => 
                taskMasterLabels.includes(label.name.toLowerCase())
            );
        }

        return false;
    }

    /**
     * Get issue correlation
     */
    async getIssueCorrelation(linearIssueId) {
        if (!this.database) {
            return null;
        }

        const query = `
            SELECT * FROM linear_correlations 
            WHERE linear_issue_id = $1 AND status = 'active'
            LIMIT 1
        `;

        const result = await this.database.query(query, [linearIssueId]);
        return result.rows[0] || null;
    }

    /**
     * Start deduplication cleanup
     */
    startDeduplicationCleanup() {
        // Clean up old entries every 5 minutes
        this.deduplicationCleanupInterval = setInterval(() => {
            const cutoff = Date.now() - this.config.deduplicationWindow;
            
            for (const [key, value] of this.processedEvents.entries()) {
                if (value.timestamp < cutoff) {
                    this.processedEvents.delete(key);
                }
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    /**
     * Stop deduplication cleanup
     */
    stopDeduplicationCleanup() {
        if (this.deduplicationCleanupInterval) {
            clearInterval(this.deduplicationCleanupInterval);
            this.deduplicationCleanupInterval = null;
        }
    }

    // ==================== DATABASE OPERATIONS ====================

    /**
     * Log webhook event
     */
    async logWebhookEvent(event) {
        if (!this.database) {
            return;
        }

        const query = `
            INSERT INTO linear_webhook_events (
                id, event_key, event_type, payload, status, 
                attempts, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        const eventKey = `${event.payload.type}_${event.payload.id}_${event.payload.action}`;
        const values = [
            event.id,
            eventKey,
            event.payload.type,
            JSON.stringify(event.payload),
            event.status,
            event.attempts,
            event.queuedAt,
            new Date()
        ];

        await this.database.query(query, values);
    }

    /**
     * Update event log
     */
    async updateEventLog(event) {
        if (!this.database) {
            return;
        }

        const query = `
            UPDATE linear_webhook_events 
            SET status = $1, attempts = $2, last_error = $3, updated_at = $4
            WHERE id = $5
        `;

        const values = [
            event.status,
            event.attempts,
            event.lastError || null,
            new Date(),
            event.id
        ];

        await this.database.query(query, values);
    }

    /**
     * Ensure webhook tables exist
     */
    async ensureWebhookTables() {
        if (!this.database) {
            return;
        }

        const createTablesQuery = `
            -- Webhook events log
            CREATE TABLE IF NOT EXISTS linear_webhook_events (
                id VARCHAR(255) PRIMARY KEY,
                event_key VARCHAR(255) NOT NULL,
                event_type VARCHAR(100) NOT NULL,
                payload JSONB NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'queued',
                attempts INTEGER DEFAULT 0,
                last_error TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Create indexes
            CREATE INDEX IF NOT EXISTS idx_webhook_events_event_key ON linear_webhook_events(event_key);
            CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON linear_webhook_events(event_type);
            CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON linear_webhook_events(status);
            CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON linear_webhook_events(created_at);
        `;

        await this.database.query(createTablesQuery);
    }

    // ==================== HEALTH & DIAGNOSTICS ====================

    /**
     * Get webhook handler status
     */
    getStatus() {
        return {
            config: {
                webhook_url: this.config.webhookUrl,
                team_id: this.config.teamId,
                deduplication_enabled: this.config.enableDeduplication,
                event_logging_enabled: this.config.enableEventLogging,
                max_retries: this.config.maxRetries
            },
            queue: {
                pending_events: this.eventQueue.length,
                processing: this.isProcessingQueue
            },
            deduplication: {
                cached_events: this.processedEvents.size,
                window_ms: this.config.deduplicationWindow
            },
            supported_events: Array.from(this.supportedEvents)
        };
    }

    /**
     * Get webhook statistics
     */
    async getStatistics() {
        if (!this.database) {
            return { error: 'Database not available' };
        }

        const queries = {
            total_events: 'SELECT COUNT(*) as count FROM linear_webhook_events',
            events_by_type: 'SELECT event_type, COUNT(*) as count FROM linear_webhook_events GROUP BY event_type',
            events_by_status: 'SELECT status, COUNT(*) as count FROM linear_webhook_events GROUP BY status',
            recent_events: 'SELECT COUNT(*) as count FROM linear_webhook_events WHERE created_at > NOW() - INTERVAL \'24 hours\'',
            failed_events: 'SELECT COUNT(*) as count FROM linear_webhook_events WHERE status = \'failed\''
        };

        const results = {};
        for (const [key, query] of Object.entries(queries)) {
            try {
                const result = await this.database.query(query);
                results[key] = result.rows;
            } catch (error) {
                results[key] = { error: error.message };
            }
        }

        return {
            ...results,
            queue_status: {
                pending: this.eventQueue.length,
                processing: this.isProcessingQueue
            },
            deduplication: {
                cached: this.processedEvents.size
            }
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.stopDeduplicationCleanup();
        this.eventQueue = [];
        this.processedEvents.clear();
        this.removeAllListeners();
    }
}

export default LinearWebhookHandler;

