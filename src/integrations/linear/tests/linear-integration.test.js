/**
 * Linear Integration Tests
 * 
 * Comprehensive test suite for Linear integration components
 */

const { LinearIntegration, LinearClient, IssueManager, StatusSync, WebhookHandler, CommentManager } = require('../index');
const LinearConfig = require('../config');

// Mock environment variables for testing
process.env.LINEAR_API_KEY = 'test-api-key';
process.env.LINEAR_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.LINEAR_DEFAULT_TEAM_ID = 'test-team-id';

describe('Linear Integration', () => {
    let integration;
    
    beforeEach(() => {
        integration = new LinearIntegration({
            apiKey: 'test-api-key',
            webhookSecret: 'test-webhook-secret',
            defaultTeamId: 'test-team-id'
        });
    });
    
    afterEach(() => {
        if (integration) {
            integration.destroy();
        }
    });
    
    describe('LinearConfig', () => {
        test('should load default configuration', () => {
            const config = new LinearConfig();
            expect(config.get('enableRealTimeSync')).toBe(true);
            expect(config.get('syncInterval')).toBe(30000);
            expect(config.get('enableAutoComments')).toBe(true);
        });
        
        test('should load configuration from environment variables', () => {
            process.env.LINEAR_SYNC_INTERVAL = '60000';
            process.env.LINEAR_ENABLE_AUTO_COMMENTS = 'false';
            
            const config = new LinearConfig();
            expect(config.get('syncInterval')).toBe(60000);
            expect(config.get('enableAutoComments')).toBe(false);
            
            delete process.env.LINEAR_SYNC_INTERVAL;
            delete process.env.LINEAR_ENABLE_AUTO_COMMENTS;
        });
        
        test('should validate configuration', () => {
            expect(() => {
                new LinearConfig({
                    apiKey: null
                });
            }).toThrow('API key is required');
        });
        
        test('should get component-specific configuration', () => {
            const config = new LinearConfig();
            const clientConfig = config.getClientConfig();
            const issueManagerConfig = config.getIssueManagerConfig();
            
            expect(clientConfig).toHaveProperty('apiKey');
            expect(clientConfig).toHaveProperty('timeout');
            expect(issueManagerConfig).toHaveProperty('defaultTeamId');
            expect(issueManagerConfig).toHaveProperty('autoLabeling');
        });
    });
    
    describe('LinearClient', () => {
        test('should create client with valid configuration', () => {
            const client = new LinearClient({
                apiKey: 'test-api-key'
            });
            
            expect(client.apiKey).toBe('test-api-key');
            expect(client.endpoint).toBe('https://api.linear.app/graphql');
        });
        
        test('should throw error without API key', () => {
            expect(() => {
                new LinearClient();
            }).toThrow('Linear API key is required');
        });
        
        test('should handle rate limiting', async () => {
            const client = new LinearClient({
                apiKey: 'test-api-key',
                minRequestInterval: 100
            });
            
            // Mock the GraphQL client
            client.client = {
                request: jest.fn().mockResolvedValue({ test: 'data' })
            };
            
            const start = Date.now();
            await Promise.all([
                client.query('query1'),
                client.query('query2')
            ]);
            const duration = Date.now() - start;
            
            expect(duration).toBeGreaterThanOrEqual(100);
        });
        
        test('should retry on retryable errors', async () => {
            const client = new LinearClient({
                apiKey: 'test-api-key',
                retryAttempts: 2,
                retryDelay: 10
            });
            
            let attempts = 0;
            client.client = {
                request: jest.fn().mockImplementation(() => {
                    attempts++;
                    if (attempts < 2) {
                        const error = new Error('Network error');
                        error.code = 'ECONNRESET';
                        throw error;
                    }
                    return { test: 'data' };
                })
            };
            
            const result = await client.query('test query');
            expect(result).toEqual({ test: 'data' });
            expect(attempts).toBe(2);
        });
    });
    
    describe('IssueManager', () => {
        let client, issueManager;
        
        beforeEach(() => {
            client = new LinearClient({ apiKey: 'test-api-key' });
            client.query = jest.fn();
            issueManager = new IssueManager(client, {
                defaultTeamId: 'test-team-id'
            });
        });
        
        test('should create issue with required fields', async () => {
            const mockIssue = {
                id: 'issue-1',
                identifier: 'TEST-1',
                title: 'Test Issue',
                description: 'Test Description'
            };
            
            client.query.mockResolvedValue({
                issueCreate: {
                    success: true,
                    issue: mockIssue
                }
            });
            
            const result = await issueManager.createIssue({
                title: 'Test Issue',
                description: 'Test Description'
            });
            
            expect(result).toEqual(mockIssue);
            expect(client.query).toHaveBeenCalledWith(
                expect.stringContaining('mutation IssueCreate'),
                expect.objectContaining({
                    input: expect.objectContaining({
                        title: 'Test Issue',
                        description: 'Test Description',
                        teamId: 'test-team-id'
                    })
                })
            );
        });
        
        test('should update issue', async () => {
            const mockIssue = {
                id: 'issue-1',
                title: 'Updated Title'
            };
            
            client.query.mockResolvedValue({
                issueUpdate: {
                    success: true,
                    issue: mockIssue
                }
            });
            
            const result = await issueManager.updateIssue('issue-1', {
                title: 'Updated Title'
            });
            
            expect(result).toEqual(mockIssue);
        });
        
        test('should search issues with filters', async () => {
            const mockIssues = {
                nodes: [
                    { id: 'issue-1', title: 'Issue 1' },
                    { id: 'issue-2', title: 'Issue 2' }
                ],
                pageInfo: { hasNextPage: false }
            };
            
            client.query.mockResolvedValue({
                issues: mockIssues
            });
            
            const result = await issueManager.searchIssues({
                teamId: 'test-team-id',
                title: 'test'
            });
            
            expect(result).toEqual(mockIssues);
        });
        
        test('should add comment to issue', async () => {
            const mockComment = {
                id: 'comment-1',
                body: 'Test comment'
            };
            
            client.query.mockResolvedValue({
                commentCreate: {
                    success: true,
                    comment: mockComment
                }
            });
            
            const result = await issueManager.addComment('issue-1', 'Test comment');
            
            expect(result).toEqual(mockComment);
        });
        
        test('should create issue from workflow event', async () => {
            const mockIssue = {
                id: 'issue-1',
                title: 'Workflow Event: test'
            };
            
            client.query.mockResolvedValue({
                issueCreate: {
                    success: true,
                    issue: mockIssue
                }
            });
            
            const workflowEvent = {
                type: 'test',
                title: 'Test Workflow',
                description: 'Test workflow description',
                priority: 'high'
            };
            
            const result = await issueManager.createIssueFromWorkflow(workflowEvent);
            
            expect(result).toEqual(mockIssue);
        });
    });
    
    describe('StatusSync', () => {
        let client, issueManager, statusSync;
        
        beforeEach(() => {
            client = new LinearClient({ apiKey: 'test-api-key' });
            issueManager = new IssueManager(client);
            statusSync = new StatusSync(client, issueManager, {
                enableRealTimeSync: false // Disable for testing
            });
        });
        
        afterEach(() => {
            statusSync.destroy();
        });
        
        test('should map Linear state to system state', () => {
            const systemState = statusSync.mapLinearStateToSystem('started');
            expect(systemState).toBe('in_progress');
        });
        
        test('should map system state to Linear state', () => {
            const linearState = statusSync.mapSystemStateToLinear('completed');
            expect(linearState.type).toBe('completed');
        });
        
        test('should queue sync operation', () => {
            statusSync.queueSync('issue-1', {
                operation: 'update_state',
                state: 'completed'
            });
            
            expect(statusSync.syncQueue.size).toBe(1);
        });
        
        test('should get sync status', () => {
            const status = statusSync.getSyncStatus();
            
            expect(status).toHaveProperty('lastSync');
            expect(status).toHaveProperty('syncInProgress');
            expect(status).toHaveProperty('queuedSyncs');
            expect(status).toHaveProperty('enableRealTimeSync');
        });
    });
    
    describe('WebhookHandler', () => {
        let webhookHandler;
        
        beforeEach(() => {
            webhookHandler = new WebhookHandler({
                webhookSecret: 'test-secret',
                enableSignatureVerification: false // Disable for testing
            });
        });
        
        afterEach(() => {
            webhookHandler.destroy();
        });
        
        test('should handle valid webhook payload', async () => {
            const mockRequest = {
                headers: {},
                body: {
                    type: 'Issue',
                    action: 'create',
                    data: {
                        id: 'issue-1',
                        title: 'Test Issue'
                    }
                }
            };
            
            const result = await webhookHandler.handleWebhook(mockRequest);
            
            expect(result.success).toBe(true);
            expect(webhookHandler.processingQueue.length).toBe(1);
        });
        
        test('should reject invalid payload', async () => {
            const mockRequest = {
                headers: {},
                body: {
                    // Missing required fields
                }
            };
            
            const result = await webhookHandler.handleWebhook(mockRequest);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing event type');
        });
        
        test('should process Issue events', async () => {
            const event = {
                type: 'Issue',
                action: 'create',
                data: {
                    id: 'issue-1',
                    title: 'Test Issue'
                },
                receivedAt: new Date(),
                id: 'event-1'
            };
            
            const result = await webhookHandler.processEvent(event);
            
            expect(result.handled).toBe(true);
            expect(result.action).toBe('create');
            expect(result.issueId).toBe('issue-1');
        });
        
        test('should add custom event processor', () => {
            const customProcessor = jest.fn().mockResolvedValue({ handled: true });
            
            webhookHandler.addEventProcessor('CustomEvent', customProcessor);
            
            expect(webhookHandler.eventProcessors.has('CustomEvent')).toBe(true);
            expect(webhookHandler.supportedEvents).toContain('CustomEvent');
        });
    });
    
    describe('CommentManager', () => {
        let client, issueManager, commentManager;
        
        beforeEach(() => {
            client = new LinearClient({ apiKey: 'test-api-key' });
            issueManager = new IssueManager(client);
            issueManager.addComment = jest.fn().mockResolvedValue({
                id: 'comment-1',
                body: 'Test comment'
            });
            
            commentManager = new CommentManager(client, issueManager);
        });
        
        afterEach(() => {
            commentManager.destroy();
        });
        
        test('should add workflow comment', async () => {
            const result = await commentManager.addWorkflowComment('issue-1', 'workflow_started', {
                workflowName: 'Test Workflow',
                description: 'Test description',
                timestamp: '2023-01-01T00:00:00Z'
            });
            
            expect(result.id).toBe('comment-1');
            expect(issueManager.addComment).toHaveBeenCalledWith(
                'issue-1',
                expect.stringContaining('Workflow Started'),
                expect.any(String)
            );
        });
        
        test('should add progress update', async () => {
            const progress = {
                percentage: 50,
                currentStep: 'Step 2',
                totalSteps: 4,
                description: 'Processing data'
            };
            
            const result = await commentManager.addProgressUpdate('issue-1', progress);
            
            expect(result.id).toBe('comment-1');
            expect(issueManager.addComment).toHaveBeenCalledWith(
                'issue-1',
                expect.stringContaining('50% Complete'),
                expect.any(String)
            );
        });
        
        test('should add error report', async () => {
            const error = {
                type: 'ValidationError',
                message: 'Invalid input data',
                stack: 'Error stack trace',
                context: { userId: '123' }
            };
            
            const result = await commentManager.addErrorReport('issue-1', error);
            
            expect(result.id).toBe('comment-1');
            expect(issueManager.addComment).toHaveBeenCalledWith(
                'issue-1',
                expect.stringContaining('ValidationError'),
                expect.any(String)
            );
        });
        
        test('should render template with data', () => {
            const template = 'Hello {{name}}, you have {{count}} messages.';
            const data = { name: 'John', count: 5 };
            
            const result = commentManager.renderTemplate(template, data);
            
            expect(result).toBe('Hello John, you have 5 messages.');
        });
        
        test('should handle conditional blocks in templates', () => {
            const template = '{{#if hasError}}Error: {{error}}{{/if}}';
            
            const resultWithError = commentManager.renderTemplate(template, {
                hasError: true,
                error: 'Something went wrong'
            });
            
            const resultWithoutError = commentManager.renderTemplate(template, {
                hasError: false,
                error: 'Something went wrong'
            });
            
            expect(resultWithError).toBe('Error: Something went wrong');
            expect(resultWithoutError).toBe('');
        });
        
        test('should add custom template', () => {
            const customTemplate = {
                title: 'Custom Event',
                template: 'Custom event: {{eventName}}'
            };
            
            commentManager.addTemplate('custom_event', customTemplate);
            
            expect(commentManager.commentTemplates.custom_event).toEqual(customTemplate);
        });
        
        test('should queue comments for batch processing', () => {
            commentManager.queueComment('issue-1', 'workflow_started', {
                workflowName: 'Test'
            });
            
            expect(commentManager.commentQueue.length).toBe(1);
        });
    });
    
    describe('LinearIntegration', () => {
        test('should initialize with valid configuration', async () => {
            // Mock the client test connection
            const mockTestConnection = jest.fn().mockResolvedValue({
                success: true,
                user: { name: 'Test User', email: 'test@example.com' }
            });
            
            // Mock LinearClient constructor
            jest.doMock('../linear-client', () => {
                return jest.fn().mockImplementation(() => ({
                    testConnection: mockTestConnection
                }));
            });
            
            const integration = new LinearIntegration({
                apiKey: 'test-api-key'
            });
            
            // Mock the initialization
            integration.client = { testConnection: mockTestConnection };
            
            const result = await integration.initialize();
            
            expect(result.success).toBe(true);
            expect(integration.isInitialized).toBe(true);
            expect(integration.isConnected).toBe(true);
        });
        
        test('should throw error when not initialized', () => {
            const integration = new LinearIntegration({
                apiKey: 'test-api-key'
            });
            
            expect(() => {
                integration.createIssue({ title: 'Test' });
            }).toThrow('Linear integration not initialized');
        });
        
        test('should get integration status', () => {
            const integration = new LinearIntegration({
                apiKey: 'test-api-key'
            });
            
            const status = integration.getStatus();
            
            expect(status).toHaveProperty('isInitialized');
            expect(status).toHaveProperty('isConnected');
            expect(status).toHaveProperty('components');
            expect(status).toHaveProperty('options');
        });
        
        test('should update configuration', () => {
            const integration = new LinearIntegration({
                apiKey: 'test-api-key'
            });
            
            integration.updateConfig({
                syncInterval: 60000,
                enableAutoComments: false
            });
            
            expect(integration.options.syncInterval).toBe(60000);
            expect(integration.options.enableAutoComments).toBe(false);
        });
        
        test('should handle shutdown gracefully', async () => {
            const integration = new LinearIntegration({
                apiKey: 'test-api-key'
            });
            
            // Mock components
            integration.statusSync = { destroy: jest.fn() };
            integration.webhookHandler = { destroy: jest.fn() };
            integration.commentManager = { destroy: jest.fn() };
            
            await integration.shutdown();
            
            expect(integration.isInitialized).toBe(false);
            expect(integration.isConnected).toBe(false);
            expect(integration.statusSync.destroy).toHaveBeenCalled();
            expect(integration.webhookHandler.destroy).toHaveBeenCalled();
            expect(integration.commentManager.destroy).toHaveBeenCalled();
        });
    });
    
    describe('Integration Tests', () => {
        test('should handle end-to-end workflow', async () => {
            // This would be an integration test that tests the entire flow
            // from webhook receipt to issue creation to status sync
            
            const integration = new LinearIntegration({
                apiKey: 'test-api-key',
                enableWebhooks: true,
                enableRealTimeSync: true,
                enableAutoComments: true
            });
            
            // Mock all the components
            integration.client = {
                testConnection: jest.fn().mockResolvedValue({
                    success: true,
                    user: { name: 'Test User' }
                })
            };
            
            // Initialize
            await integration.initialize();
            
            // Verify all components are initialized
            expect(integration.isInitialized).toBe(true);
            expect(integration.issueManager).toBeDefined();
            expect(integration.statusSync).toBeDefined();
            expect(integration.webhookHandler).toBeDefined();
            expect(integration.commentManager).toBeDefined();
        });
    });
});

// Test utilities
describe('Test Utilities', () => {
    test('should create example configuration', () => {
        const result = LinearConfig.createExampleConfig('/tmp/test-config.json');
        expect(result).toBe(true);
    });
});

// Performance tests
describe('Performance Tests', () => {
    test('should handle high volume of webhook events', async () => {
        const webhookHandler = new WebhookHandler({
            enableSignatureVerification: false,
            maxConcurrentProcessing: 10
        });
        
        const events = Array.from({ length: 100 }, (_, i) => ({
            headers: {},
            body: {
                type: 'Issue',
                action: 'create',
                data: { id: `issue-${i}`, title: `Issue ${i}` }
            }
        }));
        
        const start = Date.now();
        const promises = events.map(event => webhookHandler.handleWebhook(event));
        await Promise.all(promises);
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(5000); // Should process 100 events in under 5 seconds
        
        webhookHandler.destroy();
    });
    
    test('should handle rate limiting efficiently', async () => {
        const client = new LinearClient({
            apiKey: 'test-api-key',
            minRequestInterval: 50
        });
        
        // Mock the GraphQL client
        client.client = {
            request: jest.fn().mockResolvedValue({ test: 'data' })
        };
        
        const queries = Array.from({ length: 10 }, (_, i) => `query${i}`);
        
        const start = Date.now();
        await Promise.all(queries.map(query => client.query(query)));
        const duration = Date.now() - start;
        
        // Should take at least 450ms (9 intervals * 50ms) due to rate limiting
        expect(duration).toBeGreaterThanOrEqual(450);
    });
});

