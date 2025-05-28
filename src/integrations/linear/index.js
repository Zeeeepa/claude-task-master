/**
 * Linear Integration Module
 * 
 * Main entry point for Linear integration providing comprehensive
 * issue management, status synchronization, and workflow integration.
 */

const LinearClient = require('./linear-client');
const IssueManager = require('./issue-manager');
const StatusSync = require('./status-sync');
const WebhookHandler = require('./webhook-handler');
const CommentManager = require('./comment-manager');
const EventEmitter = require('events');

class LinearIntegration extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            apiKey: options.apiKey || process.env.LINEAR_API_KEY,
            webhookSecret: options.webhookSecret || process.env.LINEAR_WEBHOOK_SECRET,
            defaultTeamId: options.defaultTeamId || process.env.LINEAR_DEFAULT_TEAM_ID,
            defaultProjectId: options.defaultProjectId || process.env.LINEAR_DEFAULT_PROJECT_ID,
            enableRealTimeSync: options.enableRealTimeSync !== false,
            enableAutoComments: options.enableAutoComments !== false,
            enableWebhooks: options.enableWebhooks !== false,
            syncInterval: options.syncInterval || 30000,
            ...options
        };
        
        this.isInitialized = false;
        this.isConnected = false;
        
        // Initialize components
        this.client = null;
        this.issueManager = null;
        this.statusSync = null;
        this.webhookHandler = null;
        this.commentManager = null;
        
        // Event handlers
        this.setupEventHandlers();
    }
    
    /**
     * Initialize the Linear integration
     */
    async initialize() {
        try {
            // Initialize Linear client
            this.client = new LinearClient({
                apiKey: this.options.apiKey,
                timeout: this.options.timeout,
                retryAttempts: this.options.retryAttempts
            });
            
            // Test connection
            const connectionTest = await this.client.testConnection();
            if (!connectionTest.success) {
                throw new Error(`Failed to connect to Linear: ${connectionTest.error}`);
            }
            
            this.isConnected = true;
            this.emit('connection:established', connectionTest);
            
            // Initialize issue manager
            this.issueManager = new IssueManager(this.client, {
                defaultTeamId: this.options.defaultTeamId,
                defaultProjectId: this.options.defaultProjectId,
                defaultAssigneeId: this.options.defaultAssigneeId,
                autoLabeling: this.options.autoLabeling
            });
            
            // Initialize comment manager
            this.commentManager = new CommentManager(this.client, this.issueManager, {
                enableAutoComments: this.options.enableAutoComments,
                commentTemplates: this.options.commentTemplates,
                botIconUrl: this.options.botIconUrl
            });
            
            // Initialize status sync
            if (this.options.enableRealTimeSync) {
                this.statusSync = new StatusSync(this.client, this.issueManager, {
                    syncInterval: this.options.syncInterval,
                    enableRealTimeSync: this.options.enableRealTimeSync,
                    stateMapping: this.options.stateMapping
                });
            }
            
            // Initialize webhook handler
            if (this.options.enableWebhooks) {
                this.webhookHandler = new WebhookHandler({
                    webhookSecret: this.options.webhookSecret,
                    enableSignatureVerification: this.options.enableSignatureVerification,
                    supportedEvents: this.options.supportedEvents
                });
            }
            
            // Setup component event forwarding
            this.setupComponentEventForwarding();
            
            this.isInitialized = true;
            this.emit('integration:initialized');
            
            return {
                success: true,
                message: 'Linear integration initialized successfully',
                user: connectionTest.user
            };
            
        } catch (error) {
            this.emit('integration:error', { type: 'initialization', error });
            throw error;
        }
    }
    
    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Handle process termination
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }
    
    /**
     * Setup component event forwarding
     */
    setupComponentEventForwarding() {
        // Forward client events
        if (this.client) {
            this.client.on('request:success', (data) => this.emit('client:request:success', data));
            this.client.on('request:error', (data) => this.emit('client:request:error', data));
        }
        
        // Forward issue manager events
        if (this.issueManager) {
            this.issueManager.on('issue:created', (issue) => this.emit('issue:created', issue));
            this.issueManager.on('issue:updated', (issue) => this.emit('issue:updated', issue));
            this.issueManager.on('comment:created', (comment) => this.emit('comment:created', comment));
        }
        
        // Forward status sync events
        if (this.statusSync) {
            this.statusSync.on('sync:completed', (data) => this.emit('sync:completed', data));
            this.statusSync.on('sync:error', (data) => this.emit('sync:error', data));
            this.statusSync.on('sync:to_system', (data) => this.emit('sync:to_system', data));
            this.statusSync.on('sync:issue_created', (data) => this.emit('sync:issue_created', data));
        }
        
        // Forward webhook events
        if (this.webhookHandler) {
            this.webhookHandler.on('webhook:processed', (data) => this.emit('webhook:processed', data));
            this.webhookHandler.on('webhook:error', (data) => this.emit('webhook:error', data));
            this.webhookHandler.on('issue:created', (issue) => this.handleWebhookIssueCreated(issue));
            this.webhookHandler.on('issue:updated', (data) => this.handleWebhookIssueUpdated(data));
            this.webhookHandler.on('comment:created', (comment) => this.handleWebhookCommentCreated(comment));
        }
        
        // Forward comment manager events
        if (this.commentManager) {
            this.commentManager.on('comment:workflow_added', (data) => this.emit('comment:workflow_added', data));
            this.commentManager.on('comment:error', (data) => this.emit('comment:error', data));
        }
    }
    
    /**
     * Create a new Linear issue
     */
    async createIssue(issueData) {
        this.ensureInitialized();
        return this.issueManager.createIssue(issueData);
    }
    
    /**
     * Update an existing Linear issue
     */
    async updateIssue(issueId, updateData) {
        this.ensureInitialized();
        return this.issueManager.updateIssue(issueId, updateData);
    }
    
    /**
     * Get issue by ID
     */
    async getIssue(issueId) {
        this.ensureInitialized();
        return this.issueManager.getIssue(issueId);
    }
    
    /**
     * Search issues
     */
    async searchIssues(filters) {
        this.ensureInitialized();
        return this.issueManager.searchIssues(filters);
    }
    
    /**
     * Add comment to issue
     */
    async addComment(issueId, body, displayIconUrl) {
        this.ensureInitialized();
        return this.issueManager.addComment(issueId, body, displayIconUrl);
    }
    
    /**
     * Add workflow comment
     */
    async addWorkflowComment(issueId, eventType, data) {
        this.ensureInitialized();
        return this.commentManager.addWorkflowComment(issueId, eventType, data);
    }
    
    /**
     * Add progress update
     */
    async addProgressUpdate(issueId, progress) {
        this.ensureInitialized();
        return this.commentManager.addProgressUpdate(issueId, progress);
    }
    
    /**
     * Create issue from workflow event
     */
    async createIssueFromWorkflow(workflowEvent) {
        this.ensureInitialized();
        return this.issueManager.createIssueFromWorkflow(workflowEvent);
    }
    
    /**
     * Handle webhook request
     */
    async handleWebhook(request) {
        this.ensureInitialized();
        if (!this.webhookHandler) {
            throw new Error('Webhook handler not enabled');
        }
        return this.webhookHandler.handleWebhook(request);
    }
    
    /**
     * Force sync issue
     */
    async forceSyncIssue(issueId) {
        this.ensureInitialized();
        if (!this.statusSync) {
            throw new Error('Status sync not enabled');
        }
        return this.statusSync.forceSyncIssue(issueId);
    }
    
    /**
     * Queue sync operation
     */
    queueSync(issueId, syncData) {
        this.ensureInitialized();
        if (!this.statusSync) {
            throw new Error('Status sync not enabled');
        }
        return this.statusSync.queueSync(issueId, syncData);
    }
    
    /**
     * Get teams
     */
    async getTeams() {
        this.ensureInitialized();
        return this.client.getTeams();
    }
    
    /**
     * Get issue states for team
     */
    async getIssueStates(teamId) {
        this.ensureInitialized();
        return this.client.getIssueStates(teamId);
    }
    
    /**
     * Get issue labels for team
     */
    async getIssueLabels(teamId) {
        this.ensureInitialized();
        return this.client.getIssueLabels(teamId);
    }
    
    /**
     * Handle webhook issue created
     */
    async handleWebhookIssueCreated(issue) {
        this.emit('webhook:issue:created', issue);
        
        // Trigger sync if enabled
        if (this.statusSync) {
            await this.statusSync.syncLinearIssueToSystem(issue);
        }
    }
    
    /**
     * Handle webhook issue updated
     */
    async handleWebhookIssueUpdated({ issue, updatedFrom }) {
        this.emit('webhook:issue:updated', { issue, updatedFrom });
        
        // Trigger sync if enabled
        if (this.statusSync) {
            await this.statusSync.syncLinearIssueToSystem(issue);
        }
    }
    
    /**
     * Handle webhook comment created
     */
    async handleWebhookCommentCreated(comment) {
        this.emit('webhook:comment:created', comment);
    }
    
    /**
     * Get integration status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isConnected: this.isConnected,
            components: {
                client: !!this.client,
                issueManager: !!this.issueManager,
                statusSync: !!this.statusSync && this.statusSync.getSyncStatus(),
                webhookHandler: !!this.webhookHandler && this.webhookHandler.getStatus(),
                commentManager: !!this.commentManager && this.commentManager.getStatus()
            },
            options: {
                enableRealTimeSync: this.options.enableRealTimeSync,
                enableAutoComments: this.options.enableAutoComments,
                enableWebhooks: this.options.enableWebhooks
            }
        };
    }
    
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.options = { ...this.options, ...config };
        
        // Update component configurations
        if (this.statusSync && config.syncInterval) {
            this.statusSync.updateSyncConfig({ syncInterval: config.syncInterval });
        }
        
        if (this.commentManager && config.enableAutoComments !== undefined) {
            this.commentManager.updateConfig({ enableAutoComments: config.enableAutoComments });
        }
        
        this.emit('integration:config_updated', config);
    }
    
    /**
     * Ensure integration is initialized
     */
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('Linear integration not initialized. Call initialize() first.');
        }
    }
    
    /**
     * Shutdown the integration
     */
    async shutdown() {
        try {
            this.emit('integration:shutting_down');
            
            // Stop status sync
            if (this.statusSync) {
                this.statusSync.destroy();
            }
            
            // Clear webhook handler
            if (this.webhookHandler) {
                this.webhookHandler.destroy();
            }
            
            // Clear comment manager
            if (this.commentManager) {
                this.commentManager.destroy();
            }
            
            // Clear all listeners
            this.removeAllListeners();
            
            this.isInitialized = false;
            this.isConnected = false;
            
            this.emit('integration:shutdown');
            
        } catch (error) {
            this.emit('integration:error', { type: 'shutdown', error });
        }
    }
}

// Export the main class and individual components
module.exports = {
    LinearIntegration,
    LinearClient,
    IssueManager,
    StatusSync,
    WebhookHandler,
    CommentManager
};

