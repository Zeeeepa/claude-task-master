/**
 * Linear Webhook Handler
 * 
 * Processes Linear webhook events for real-time synchronization
 * and workflow integration.
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class WebhookHandler extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.webhookSecret = options.webhookSecret || process.env.LINEAR_WEBHOOK_SECRET;
        this.enableSignatureVerification = options.enableSignatureVerification !== false;
        this.supportedEvents = options.supportedEvents || [
            'Issue',
            'Comment',
            'IssueLabel',
            'Project',
            'ProjectUpdate'
        ];
        
        // Event processors
        this.eventProcessors = new Map();
        this.initializeEventProcessors();
        
        // Rate limiting for webhook processing
        this.processingQueue = [];
        this.isProcessingQueue = false;
        this.maxConcurrentProcessing = options.maxConcurrentProcessing || 5;
        this.processingDelay = options.processingDelay || 100;
    }
    
    /**
     * Initialize event processors
     */
    initializeEventProcessors() {
        this.eventProcessors.set('Issue', this.processIssueEvent.bind(this));
        this.eventProcessors.set('Comment', this.processCommentEvent.bind(this));
        this.eventProcessors.set('IssueLabel', this.processIssueLabelEvent.bind(this));
        this.eventProcessors.set('Project', this.processProjectEvent.bind(this));
        this.eventProcessors.set('ProjectUpdate', this.processProjectUpdateEvent.bind(this));
    }
    
    /**
     * Handle incoming webhook request
     */
    async handleWebhook(request) {
        try {
            // Verify webhook signature
            if (this.enableSignatureVerification) {
                const isValid = this.verifySignature(request);
                if (!isValid) {
                    throw new Error('Invalid webhook signature');
                }
            }
            
            // Parse webhook payload
            const payload = this.parsePayload(request);
            
            // Validate payload structure
            this.validatePayload(payload);
            
            // Queue event for processing
            this.queueEvent(payload);
            
            return {
                success: true,
                message: 'Webhook received and queued for processing'
            };
            
        } catch (error) {
            this.emit('webhook:error', { error, request });
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Verify webhook signature
     */
    verifySignature(request) {
        if (!this.webhookSecret) {
            this.emit('webhook:warning', { 
                message: 'Webhook secret not configured, skipping signature verification' 
            });
            return true;
        }
        
        const signature = request.headers['linear-signature'];
        if (!signature) {
            return false;
        }
        
        const body = typeof request.body === 'string' 
            ? request.body 
            : JSON.stringify(request.body);
            
        const expectedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(body)
            .digest('hex');
            
        const providedSignature = signature.replace('sha256=', '');
        
        return crypto.timingSafeEqual(
            Buffer.from(expectedSignature, 'hex'),
            Buffer.from(providedSignature, 'hex')
        );
    }
    
    /**
     * Parse webhook payload
     */
    parsePayload(request) {
        if (typeof request.body === 'object') {
            return request.body;
        }
        
        if (typeof request.body === 'string') {
            return JSON.parse(request.body);
        }
        
        throw new Error('Invalid payload format');
    }
    
    /**
     * Validate webhook payload
     */
    validatePayload(payload) {
        if (!payload.type) {
            throw new Error('Missing event type in payload');
        }
        
        if (!payload.data) {
            throw new Error('Missing event data in payload');
        }
        
        if (!this.supportedEvents.includes(payload.type)) {
            throw new Error(`Unsupported event type: ${payload.type}`);
        }
    }
    
    /**
     * Queue event for processing
     */
    queueEvent(payload) {
        this.processingQueue.push({
            ...payload,
            receivedAt: new Date(),
            id: this.generateEventId()
        });
        
        this.emit('webhook:queued', { 
            type: payload.type, 
            queueSize: this.processingQueue.length 
        });
        
        this.processQueue();
    }
    
    /**
     * Process the event queue
     */
    async processQueue() {
        if (this.isProcessingQueue || this.processingQueue.length === 0) {
            return;
        }
        
        this.isProcessingQueue = true;
        
        try {
            const concurrentPromises = [];
            
            while (this.processingQueue.length > 0 && 
                   concurrentPromises.length < this.maxConcurrentProcessing) {
                
                const event = this.processingQueue.shift();
                const promise = this.processEvent(event);
                concurrentPromises.push(promise);
            }
            
            if (concurrentPromises.length > 0) {
                await Promise.allSettled(concurrentPromises);
                
                // Add delay between batches
                if (this.processingQueue.length > 0) {
                    await this.sleep(this.processingDelay);
                }
            }
            
        } finally {
            this.isProcessingQueue = false;
            
            // Continue processing if there are more events
            if (this.processingQueue.length > 0) {
                setImmediate(() => this.processQueue());
            }
        }
    }
    
    /**
     * Process a single webhook event
     */
    async processEvent(event) {
        try {
            const processor = this.eventProcessors.get(event.type);
            if (!processor) {
                throw new Error(`No processor found for event type: ${event.type}`);
            }
            
            const result = await processor(event);
            
            this.emit('webhook:processed', {
                eventId: event.id,
                type: event.type,
                result,
                processingTime: Date.now() - event.receivedAt.getTime()
            });
            
            return result;
            
        } catch (error) {
            this.emit('webhook:processing_error', {
                eventId: event.id,
                type: event.type,
                error,
                event
            });
            
            throw error;
        }
    }
    
    /**
     * Process Issue events
     */
    async processIssueEvent(event) {
        const { action, data } = event;
        const issue = data;
        
        switch (action) {
            case 'create':
                return this.handleIssueCreated(issue);
                
            case 'update':
                return this.handleIssueUpdated(issue, event.updatedFrom);
                
            case 'remove':
                return this.handleIssueDeleted(issue);
                
            default:
                this.emit('webhook:unhandled_action', { 
                    type: 'Issue', 
                    action, 
                    issue 
                });
                return { handled: false, action };
        }
    }
    
    /**
     * Process Comment events
     */
    async processCommentEvent(event) {
        const { action, data } = event;
        const comment = data;
        
        switch (action) {
            case 'create':
                return this.handleCommentCreated(comment);
                
            case 'update':
                return this.handleCommentUpdated(comment, event.updatedFrom);
                
            case 'remove':
                return this.handleCommentDeleted(comment);
                
            default:
                this.emit('webhook:unhandled_action', { 
                    type: 'Comment', 
                    action, 
                    comment 
                });
                return { handled: false, action };
        }
    }
    
    /**
     * Process IssueLabel events
     */
    async processIssueLabelEvent(event) {
        const { action, data } = event;
        const issueLabel = data;
        
        switch (action) {
            case 'create':
                return this.handleIssueLabelAdded(issueLabel);
                
            case 'remove':
                return this.handleIssueLabelRemoved(issueLabel);
                
            default:
                this.emit('webhook:unhandled_action', { 
                    type: 'IssueLabel', 
                    action, 
                    issueLabel 
                });
                return { handled: false, action };
        }
    }
    
    /**
     * Process Project events
     */
    async processProjectEvent(event) {
        const { action, data } = event;
        const project = data;
        
        switch (action) {
            case 'create':
                return this.handleProjectCreated(project);
                
            case 'update':
                return this.handleProjectUpdated(project, event.updatedFrom);
                
            case 'remove':
                return this.handleProjectDeleted(project);
                
            default:
                this.emit('webhook:unhandled_action', { 
                    type: 'Project', 
                    action, 
                    project 
                });
                return { handled: false, action };
        }
    }
    
    /**
     * Process ProjectUpdate events
     */
    async processProjectUpdateEvent(event) {
        const { action, data } = event;
        const projectUpdate = data;
        
        switch (action) {
            case 'create':
                return this.handleProjectUpdateCreated(projectUpdate);
                
            case 'update':
                return this.handleProjectUpdateUpdated(projectUpdate, event.updatedFrom);
                
            case 'remove':
                return this.handleProjectUpdateDeleted(projectUpdate);
                
            default:
                this.emit('webhook:unhandled_action', { 
                    type: 'ProjectUpdate', 
                    action, 
                    projectUpdate 
                });
                return { handled: false, action };
        }
    }
    
    /**
     * Handle issue created
     */
    async handleIssueCreated(issue) {
        this.emit('issue:created', issue);
        return { handled: true, action: 'create', issueId: issue.id };
    }
    
    /**
     * Handle issue updated
     */
    async handleIssueUpdated(issue, updatedFrom) {
        this.emit('issue:updated', { issue, updatedFrom });
        return { handled: true, action: 'update', issueId: issue.id };
    }
    
    /**
     * Handle issue deleted
     */
    async handleIssueDeleted(issue) {
        this.emit('issue:deleted', issue);
        return { handled: true, action: 'delete', issueId: issue.id };
    }
    
    /**
     * Handle comment created
     */
    async handleCommentCreated(comment) {
        this.emit('comment:created', comment);
        return { handled: true, action: 'create', commentId: comment.id };
    }
    
    /**
     * Handle comment updated
     */
    async handleCommentUpdated(comment, updatedFrom) {
        this.emit('comment:updated', { comment, updatedFrom });
        return { handled: true, action: 'update', commentId: comment.id };
    }
    
    /**
     * Handle comment deleted
     */
    async handleCommentDeleted(comment) {
        this.emit('comment:deleted', comment);
        return { handled: true, action: 'delete', commentId: comment.id };
    }
    
    /**
     * Handle issue label added
     */
    async handleIssueLabelAdded(issueLabel) {
        this.emit('issue:label_added', issueLabel);
        return { handled: true, action: 'add_label', issueLabelId: issueLabel.id };
    }
    
    /**
     * Handle issue label removed
     */
    async handleIssueLabelRemoved(issueLabel) {
        this.emit('issue:label_removed', issueLabel);
        return { handled: true, action: 'remove_label', issueLabelId: issueLabel.id };
    }
    
    /**
     * Handle project created
     */
    async handleProjectCreated(project) {
        this.emit('project:created', project);
        return { handled: true, action: 'create', projectId: project.id };
    }
    
    /**
     * Handle project updated
     */
    async handleProjectUpdated(project, updatedFrom) {
        this.emit('project:updated', { project, updatedFrom });
        return { handled: true, action: 'update', projectId: project.id };
    }
    
    /**
     * Handle project deleted
     */
    async handleProjectDeleted(project) {
        this.emit('project:deleted', project);
        return { handled: true, action: 'delete', projectId: project.id };
    }
    
    /**
     * Handle project update created
     */
    async handleProjectUpdateCreated(projectUpdate) {
        this.emit('project_update:created', projectUpdate);
        return { handled: true, action: 'create', projectUpdateId: projectUpdate.id };
    }
    
    /**
     * Handle project update updated
     */
    async handleProjectUpdateUpdated(projectUpdate, updatedFrom) {
        this.emit('project_update:updated', { projectUpdate, updatedFrom });
        return { handled: true, action: 'update', projectUpdateId: projectUpdate.id };
    }
    
    /**
     * Handle project update deleted
     */
    async handleProjectUpdateDeleted(projectUpdate) {
        this.emit('project_update:deleted', projectUpdate);
        return { handled: true, action: 'delete', projectUpdateId: projectUpdate.id };
    }
    
    /**
     * Generate unique event ID
     */
    generateEventId() {
        return `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Get webhook handler status
     */
    getStatus() {
        return {
            queueSize: this.processingQueue.length,
            isProcessing: this.isProcessingQueue,
            supportedEvents: this.supportedEvents,
            enableSignatureVerification: this.enableSignatureVerification,
            maxConcurrentProcessing: this.maxConcurrentProcessing
        };
    }
    
    /**
     * Add custom event processor
     */
    addEventProcessor(eventType, processor) {
        this.eventProcessors.set(eventType, processor);
        if (!this.supportedEvents.includes(eventType)) {
            this.supportedEvents.push(eventType);
        }
    }
    
    /**
     * Remove event processor
     */
    removeEventProcessor(eventType) {
        this.eventProcessors.delete(eventType);
        const index = this.supportedEvents.indexOf(eventType);
        if (index > -1) {
            this.supportedEvents.splice(index, 1);
        }
    }
    
    /**
     * Clear processing queue
     */
    clearQueue() {
        const queueSize = this.processingQueue.length;
        this.processingQueue = [];
        this.emit('webhook:queue_cleared', { clearedEvents: queueSize });
        return queueSize;
    }
    
    /**
     * Cleanup resources
     */
    destroy() {
        this.clearQueue();
        this.removeAllListeners();
    }
}

module.exports = WebhookHandler;

