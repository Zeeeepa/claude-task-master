/**
 * Linear Integration Usage Examples
 * 
 * Comprehensive examples demonstrating how to use the Linear integration
 * in various scenarios within the unified AI CI/CD system.
 */

const { LinearIntegration } = require('../index');
const LinearConfig = require('../config');

// Example 1: Basic Setup and Initialization
async function basicSetupExample() {
    console.log('=== Basic Setup Example ===');
    
    // Create integration instance
    const linear = new LinearIntegration({
        apiKey: process.env.LINEAR_API_KEY,
        defaultTeamId: process.env.LINEAR_DEFAULT_TEAM_ID,
        enableRealTimeSync: true,
        enableAutoComments: true,
        enableWebhooks: true
    });
    
    try {
        // Initialize the integration
        const result = await linear.initialize();
        console.log('✅ Linear integration initialized:', result.message);
        console.log('👤 Connected as:', result.user.name);
        
        // Get integration status
        const status = linear.getStatus();
        console.log('📊 Integration status:', status);
        
        return linear;
        
    } catch (error) {
        console.error('❌ Failed to initialize Linear integration:', error.message);
        throw error;
    }
}

// Example 2: Issue Management
async function issueManagementExample(linear) {
    console.log('\n=== Issue Management Example ===');
    
    try {
        // Create a new issue
        const newIssue = await linear.createIssue({
            title: 'Implement user authentication system',
            description: `## Overview
Implement a comprehensive user authentication system with the following features:

- OAuth 2.0 integration (Google, GitHub)
- JWT token management
- Role-based access control
- Password reset functionality

## Acceptance Criteria
- [ ] OAuth providers configured
- [ ] JWT tokens properly validated
- [ ] User roles enforced
- [ ] Password reset flow working`,
            priority: 'high',
            labelIds: ['feature-label-id', 'backend-label-id']
        });
        
        console.log('✅ Created issue:', newIssue.identifier, '-', newIssue.title);
        console.log('🔗 Issue URL:', newIssue.url);
        
        // Update the issue
        const updatedIssue = await linear.updateIssue(newIssue.id, {
            description: newIssue.description + '\n\n**Update**: Added OAuth integration requirement',
            priority: 'critical'
        });
        
        console.log('✅ Updated issue priority to:', updatedIssue.priority);
        
        // Add a comment
        await linear.addComment(newIssue.id, 
            '🚀 **Development Started**\n\nBeginning implementation of the authentication system. Starting with OAuth integration.'
        );
        
        console.log('✅ Added comment to issue');
        
        // Search for issues
        const searchResults = await linear.searchIssues({
            title: 'authentication',
            assigneeId: 'current-user-id'
        });
        
        console.log('🔍 Found', searchResults.nodes.length, 'issues matching search');
        
        return newIssue;
        
    } catch (error) {
        console.error('❌ Issue management error:', error.message);
        throw error;
    }
}

// Example 3: Workflow Integration
async function workflowIntegrationExample(linear, issueId) {
    console.log('\n=== Workflow Integration Example ===');
    
    try {
        // Simulate CI/CD workflow events
        
        // 1. Workflow started
        await linear.addWorkflowComment(issueId, 'workflow_started', {
            workflowName: 'CI/CD Pipeline',
            description: 'Automated build and deployment pipeline started',
            metadata: {
                branch: 'feature/auth-system',
                commit: 'a1b2c3d4e5f6',
                triggeredBy: 'developer@example.com'
            },
            timestamp: new Date().toISOString()
        });
        
        console.log('✅ Added workflow started comment');
        
        // 2. Build started
        await linear.commentManager.addBuildStatus(issueId, {
            name: 'Authentication System Build',
            status: 'started',
            branch: 'feature/auth-system',
            commit: 'a1b2c3d4e5f6',
            buildUrl: 'https://ci.example.com/builds/12345'
        });
        
        console.log('✅ Added build started comment');
        
        // 3. Progress update
        await linear.addProgressUpdate(issueId, {
            percentage: 25,
            currentStep: 'Running unit tests',
            totalSteps: 4,
            description: 'Executing comprehensive test suite',
            estimatedCompletion: '5 minutes'
        });
        
        console.log('✅ Added progress update (25%)');
        
        // 4. Another progress update
        await linear.addProgressUpdate(issueId, {
            percentage: 75,
            currentStep: 'Building Docker image',
            totalSteps: 4,
            description: 'Creating production-ready container image'
        });
        
        console.log('✅ Added progress update (75%)');
        
        // 5. Build completed
        await linear.commentManager.addBuildStatus(issueId, {
            name: 'Authentication System Build',
            status: 'completed',
            duration: '4m 32s',
            buildUrl: 'https://ci.example.com/builds/12345',
            artifactsUrl: 'https://ci.example.com/builds/12345/artifacts'
        });
        
        console.log('✅ Added build completed comment');
        
        // 6. Deployment started
        await linear.commentManager.addDeploymentStatus(issueId, {
            environment: 'staging',
            status: 'started',
            version: 'v1.2.0-auth-system',
            deploymentUrl: 'https://deploy.example.com/deployments/67890'
        });
        
        console.log('✅ Added deployment started comment');
        
        // 7. Deployment completed
        await linear.commentManager.addDeploymentStatus(issueId, {
            environment: 'staging',
            status: 'completed',
            url: 'https://staging.example.com',
            duration: '2m 15s'
        });
        
        console.log('✅ Added deployment completed comment');
        
        // 8. Workflow completed
        await linear.addWorkflowComment(issueId, 'workflow_completed', {
            workflowName: 'CI/CD Pipeline',
            result: 'Successfully deployed to staging environment',
            duration: '7m 45s',
            metadata: {
                testsRun: 156,
                testsPassed: 156,
                coverage: '94.2%',
                deploymentUrl: 'https://staging.example.com'
            },
            timestamp: new Date().toISOString()
        });
        
        console.log('✅ Added workflow completed comment');
        
    } catch (error) {
        console.error('❌ Workflow integration error:', error.message);
        throw error;
    }
}

// Example 4: Error Handling and Reporting
async function errorHandlingExample(linear, issueId) {
    console.log('\n=== Error Handling Example ===');
    
    try {
        // Simulate an error in the workflow
        const error = {
            type: 'DeploymentError',
            message: 'Database migration failed during deployment',
            stack: `Error: Database migration failed
    at Migration.run (/app/migrations/001_create_users.js:15:23)
    at DeploymentManager.runMigrations (/app/deploy/manager.js:45:12)
    at DeploymentManager.deploy (/app/deploy/manager.js:23:8)`,
            context: {
                environment: 'production',
                migrationFile: '001_create_users.js',
                databaseVersion: '13.2',
                rollbackAvailable: true
            }
        };
        
        await linear.commentManager.addErrorReport(issueId, error);
        console.log('✅ Added error report comment');
        
        // Create a new issue for the error
        const errorIssue = await linear.createIssueFromWorkflow({
            type: 'deployment_failed',
            title: 'Production deployment failed - Database migration error',
            description: `## Error Details
**Type**: ${error.type}
**Message**: ${error.message}

## Context
- **Environment**: ${error.context.environment}
- **Migration File**: ${error.context.migrationFile}
- **Database Version**: ${error.context.databaseVersion}
- **Rollback Available**: ${error.context.rollbackAvailable}

## Next Steps
1. Investigate migration failure
2. Fix migration script
3. Test in staging environment
4. Retry production deployment`,
            priority: 'critical',
            teamId: process.env.LINEAR_DEFAULT_TEAM_ID,
            metadata: error.context
        });
        
        console.log('✅ Created error issue:', errorIssue.identifier);
        
        // Add a comment linking the issues
        await linear.addComment(issueId, 
            `🚨 **Deployment Failed**\n\nProduction deployment encountered an error. Created issue ${errorIssue.identifier} to track the resolution.\n\n**Error**: ${error.message}`
        );
        
        console.log('✅ Added error linking comment');
        
    } catch (error) {
        console.error('❌ Error handling example failed:', error.message);
        throw error;
    }
}

// Example 5: Status Synchronization
async function statusSyncExample(linear) {
    console.log('\n=== Status Synchronization Example ===');
    
    try {
        // Listen for sync events
        linear.on('sync:to_system', (syncData) => {
            console.log('📥 Sync to system:', {
                issueId: syncData.issueId,
                identifier: syncData.identifier,
                state: syncData.state,
                title: syncData.title
            });
        });
        
        linear.on('sync:issue_created', ({ systemId, linearIssue }) => {
            console.log('🔗 Issue mapping:', {
                systemId,
                linearIssueId: linearIssue.id,
                identifier: linearIssue.identifier
            });
        });
        
        // Queue some sync operations
        linear.queueSync('issue-123', {
            operation: 'update_state',
            state: 'in_progress'
        });
        
        linear.queueSync('issue-456', {
            operation: 'add_comment',
            comment: 'Automated progress update from CI/CD system'
        });
        
        console.log('✅ Queued sync operations');
        
        // Get sync status
        const syncStatus = linear.statusSync?.getSyncStatus();
        if (syncStatus) {
            console.log('📊 Sync status:', {
                lastSync: syncStatus.lastSync,
                queuedSyncs: syncStatus.queuedSyncs,
                enableRealTimeSync: syncStatus.enableRealTimeSync
            });
        }
        
    } catch (error) {
        console.error('❌ Status sync example failed:', error.message);
        throw error;
    }
}

// Example 6: Webhook Handling
async function webhookHandlingExample(linear) {
    console.log('\n=== Webhook Handling Example ===');
    
    try {
        // Listen for webhook events
        linear.on('webhook:issue:created', (issue) => {
            console.log('📨 Webhook - Issue created:', issue.identifier, '-', issue.title);
        });
        
        linear.on('webhook:issue:updated', ({ issue, updatedFrom }) => {
            console.log('📨 Webhook - Issue updated:', issue.identifier);
            console.log('   Changes:', Object.keys(updatedFrom || {}));
        });
        
        linear.on('webhook:comment:created', (comment) => {
            console.log('📨 Webhook - Comment created on issue:', comment.issue?.identifier);
        });
        
        // Simulate webhook payload
        const mockWebhookRequest = {
            headers: {
                'linear-signature': 'sha256=mock-signature'
            },
            body: {
                type: 'Issue',
                action: 'update',
                data: {
                    id: 'issue-789',
                    identifier: 'DEV-123',
                    title: 'Updated issue title',
                    state: {
                        id: 'state-completed',
                        type: 'completed',
                        name: 'Done'
                    }
                },
                updatedFrom: {
                    title: 'Original issue title',
                    stateId: 'state-in-progress'
                }
            }
        };
        
        // Process webhook (in real scenario, this would be called by Express.js)
        const result = await linear.handleWebhook(mockWebhookRequest);
        console.log('✅ Webhook processed:', result.message);
        
    } catch (error) {
        console.error('❌ Webhook handling example failed:', error.message);
        throw error;
    }
}

// Example 7: Custom Comment Templates
async function customTemplatesExample(linear, issueId) {
    console.log('\n=== Custom Templates Example ===');
    
    try {
        // Add a custom comment template
        linear.commentManager.addTemplate('code_review_completed', {
            title: '👀 Code Review Completed',
            template: `**Code Review Completed**: {{reviewerName}}

{{#if approved}}
✅ **Status**: Approved
{{else}}
❌ **Status**: Changes Requested
{{/if}}

{{#if comments}}
**Comments**: {{comments}} comment(s)
{{/if}}

{{#if suggestions}}
**Suggestions**:
{{#each suggestions}}
- {{this}}
{{/each}}
{{/if}}

**Reviewed at**: {{timestamp}}`
        });
        
        // Use the custom template
        await linear.addWorkflowComment(issueId, 'code_review_completed', {
            reviewerName: 'Senior Developer',
            approved: true,
            comments: 3,
            suggestions: [
                'Consider adding more unit tests',
                'Extract magic numbers to constants',
                'Add JSDoc comments to public methods'
            ],
            timestamp: new Date().toISOString()
        });
        
        console.log('✅ Added custom code review comment');
        
        // Add another custom template for security scan
        linear.commentManager.addTemplate('security_scan_completed', {
            title: '🔒 Security Scan Completed',
            template: `**Security Scan Results**

{{#if vulnerabilities}}
⚠️ **Vulnerabilities Found**: {{vulnerabilities.length}}

{{#each vulnerabilities}}
- **{{severity}}**: {{title}} ({{cve}})
{{/each}}
{{else}}
✅ **No vulnerabilities found**
{{/if}}

**Scan Duration**: {{duration}}
**Scanner**: {{scanner}}
**Report**: [View Full Report]({{reportUrl}})

**Scanned at**: {{timestamp}}`
        });
        
        // Use security scan template
        await linear.addWorkflowComment(issueId, 'security_scan_completed', {
            vulnerabilities: [
                {
                    severity: 'Medium',
                    title: 'Outdated dependency detected',
                    cve: 'CVE-2023-1234'
                }
            ],
            duration: '2m 15s',
            scanner: 'Snyk Security Scanner',
            reportUrl: 'https://security.example.com/reports/12345',
            timestamp: new Date().toISOString()
        });
        
        console.log('✅ Added security scan comment');
        
        // List available templates
        const templates = linear.commentManager.getTemplates();
        console.log('📋 Available templates:', templates);
        
    } catch (error) {
        console.error('❌ Custom templates example failed:', error.message);
        throw error;
    }
}

// Example 8: Configuration Management
async function configurationExample() {
    console.log('\n=== Configuration Management Example ===');
    
    try {
        // Create configuration instance
        const config = new LinearConfig();
        
        // Get specific configuration values
        console.log('🔧 API Endpoint:', config.get('endpoint'));
        console.log('🔧 Sync Interval:', config.get('syncInterval'));
        console.log('🔧 Enable Auto Comments:', config.get('enableAutoComments'));
        
        // Get component-specific configuration
        const clientConfig = config.getClientConfig();
        const syncConfig = config.getStatusSyncConfig();
        
        console.log('🔧 Client config keys:', Object.keys(clientConfig));
        console.log('🔧 Sync config keys:', Object.keys(syncConfig));
        
        // Update configuration
        config.update({
            syncInterval: 60000,
            enableAutoComments: false
        });
        
        console.log('✅ Updated configuration');
        
        // Create example configuration file
        const exampleCreated = LinearConfig.createExampleConfig('./linear-config.example.json');
        if (exampleCreated) {
            console.log('✅ Created example configuration file');
        }
        
    } catch (error) {
        console.error('❌ Configuration example failed:', error.message);
        throw error;
    }
}

// Main example runner
async function runAllExamples() {
    console.log('🚀 Starting Linear Integration Examples\n');
    
    try {
        // 1. Basic setup
        const linear = await basicSetupExample();
        
        // 2. Issue management
        const issue = await issueManagementExample(linear);
        
        // 3. Workflow integration
        await workflowIntegrationExample(linear, issue.id);
        
        // 4. Error handling
        await errorHandlingExample(linear, issue.id);
        
        // 5. Status synchronization
        await statusSyncExample(linear);
        
        // 6. Webhook handling
        await webhookHandlingExample(linear);
        
        // 7. Custom templates
        await customTemplatesExample(linear, issue.id);
        
        // 8. Configuration management
        await configurationExample();
        
        console.log('\n✅ All examples completed successfully!');
        
        // Cleanup
        await linear.shutdown();
        console.log('🧹 Integration shutdown complete');
        
    } catch (error) {
        console.error('\n❌ Example execution failed:', error.message);
        process.exit(1);
    }
}

// Express.js webhook endpoint example
function createWebhookEndpoint() {
    const express = require('express');
    const app = express();
    
    app.use(express.json());
    
    // Initialize Linear integration
    const linear = new LinearIntegration({
        apiKey: process.env.LINEAR_API_KEY,
        webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
        enableWebhooks: true
    });
    
    // Webhook endpoint
    app.post('/webhooks/linear', async (req, res) => {
        try {
            const result = await linear.handleWebhook(req);
            res.json(result);
        } catch (error) {
            console.error('Webhook error:', error.message);
            res.status(400).json({ error: error.message });
        }
    });
    
    // Health check endpoint
    app.get('/health', (req, res) => {
        const status = linear.getStatus();
        res.json({
            status: 'ok',
            linear: status
        });
    });
    
    return { app, linear };
}

// Export examples for use in other files
module.exports = {
    basicSetupExample,
    issueManagementExample,
    workflowIntegrationExample,
    errorHandlingExample,
    statusSyncExample,
    webhookHandlingExample,
    customTemplatesExample,
    configurationExample,
    runAllExamples,
    createWebhookEndpoint
};

// Run examples if this file is executed directly
if (require.main === module) {
    runAllExamples().catch(console.error);
}

