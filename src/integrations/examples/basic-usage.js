/**
 * @fileoverview Basic Integration Layer Usage Examples
 * @description Examples showing how to use the integration layer
 */

import { createIntegrationFramework, integrationFlows } from '../index.js';

/**
 * Basic framework setup example
 */
export async function basicSetupExample() {
    console.log('🚀 Setting up integration framework...');
    
    // Create framework with configuration
    const framework = await createIntegrationFramework({
        linear: {
            apiKey: process.env.LINEAR_API_KEY,
            teamId: process.env.LINEAR_TEAM_ID,
            webhookSecret: process.env.LINEAR_WEBHOOK_SECRET
        },
        github: {
            token: process.env.GITHUB_TOKEN,
            webhookSecret: process.env.GITHUB_WEBHOOK_SECRET
        },
        codegen: {
            apiKey: process.env.CODEGEN_API_KEY,
            orgId: process.env.CODEGEN_ORG_ID
        },
        claudeCode: {
            apiKey: process.env.CLAUDE_CODE_API_KEY
        },
        agentapi: {
            apiKey: process.env.AGENTAPI_KEY
        }
    });
    
    // Initialize all components
    await framework.initialize();
    
    console.log('✅ Framework initialized successfully');
    
    // Get component references
    const eventBus = framework.getComponent('eventBus');
    const healthMonitor = framework.getComponent('healthMonitor');
    
    // Set up event listeners
    eventBus.on('workflow.started', (event) => {
        console.log('📋 Workflow started:', event.data);
    });
    
    eventBus.on('task.completed', (event) => {
        console.log('✅ Task completed:', event.data);
    });
    
    // Start health monitoring
    await healthMonitor.startMonitoring();
    
    return framework;
}

/**
 * Linear integration example
 */
export async function linearIntegrationExample() {
    console.log('📝 Linear integration example...');
    
    const framework = await basicSetupExample();
    const linearIntegration = framework.getComponent('linearIntegration');
    
    try {
        // Create a new issue
        const issue = await linearIntegration.createIssue(
            'Integration Test Issue',
            'This is a test issue created by the integration layer'
        );
        
        console.log('📋 Created issue:', issue.identifier);
        
        // Update issue status
        await linearIntegration.updateIssueStatus(issue.id, 'In Progress');
        console.log('🔄 Updated issue status to In Progress');
        
        // Get issue details
        const details = await linearIntegration.getIssueDetails(issue.id);
        console.log('📊 Issue details:', {
            id: details.id,
            title: details.title,
            status: details.state.name
        });
        
        return issue;
    } catch (error) {
        console.error('❌ Linear integration error:', error.message);
        throw error;
    }
}

/**
 * GitHub integration example
 */
export async function githubIntegrationExample() {
    console.log('🐙 GitHub integration example...');
    
    const framework = await basicSetupExample();
    const githubIntegration = framework.getComponent('githubIntegration');
    
    const repoUrl = 'https://github.com/Zeeeepa/claude-task-master';
    
    try {
        // Validate repository access
        const validation = await githubIntegration.validateRepository(repoUrl);
        console.log('✅ Repository validated:', validation.repository.name);
        
        // Create a pull request (example - would need actual branch)
        // const pr = await githubIntegration.createPullRequest(
        //     repoUrl,
        //     'feature/integration-test',
        //     'Integration Layer Test',
        //     'Test PR created by integration layer'
        // );
        // console.log('🔀 Created PR:', pr.url);
        
        return validation;
    } catch (error) {
        console.error('❌ GitHub integration error:', error.message);
        throw error;
    }
}

/**
 * Codegen SDK integration example
 */
export async function codegenIntegrationExample() {
    console.log('🤖 Codegen integration example...');
    
    const framework = await basicSetupExample();
    const codegenIntegration = framework.getComponent('codegenIntegration');
    
    try {
        // Initialize SDK
        await codegenIntegration.initializeSDK();
        console.log('🔧 Codegen SDK initialized');
        
        // Send a task request
        const task = {
            type: 'code_generation',
            description: 'Create a simple Express.js route handler for user authentication',
            language: 'javascript',
            framework: 'express'
        };
        
        const response = await codegenIntegration.sendTaskRequest(task);
        console.log('📤 Task sent to Codegen:', response.requestId);
        
        // Track progress
        const progress = await codegenIntegration.trackRequestProgress(response.requestId);
        console.log('📊 Task progress:', progress);
        
        return response;
    } catch (error) {
        console.error('❌ Codegen integration error:', error.message);
        throw error;
    }
}

/**
 * Workflow creation example
 */
export async function workflowCreationExample() {
    console.log('🔄 Workflow creation example...');
    
    const framework = await basicSetupExample();
    
    try {
        const workflow = await integrationFlows.createWorkflow(framework, {
            title: 'User Authentication System',
            description: 'Implement JWT-based user authentication with login/logout functionality',
            repoUrl: 'https://github.com/Zeeeepa/claude-task-master'
        });
        
        console.log('🎯 Workflow created:', workflow.workflowId);
        console.log('📋 Linear issue:', workflow.issue.identifier);
        
        return workflow;
    } catch (error) {
        console.error('❌ Workflow creation error:', error.message);
        throw error;
    }
}

/**
 * Task completion flow example
 */
export async function taskCompletionExample() {
    console.log('✅ Task completion example...');
    
    const framework = await basicSetupExample();
    
    try {
        const task = {
            id: 'task-auth-001',
            description: 'Implement user login endpoint',
            type: 'api_endpoint',
            language: 'javascript',
            framework: 'express'
        };
        
        const result = await integrationFlows.completeTask(framework, {
            task,
            repoUrl: 'https://github.com/Zeeeepa/claude-task-master',
            branch: 'feature/user-auth',
            title: 'Add user authentication endpoint',
            body: 'Implements POST /auth/login endpoint with JWT token generation'
        });
        
        console.log('🎯 Task completed');
        console.log('📤 Codegen response:', result.response.requestId);
        console.log('🔀 Pull request:', result.pullRequest.url);
        console.log('🔍 Validation:', result.validation.deploymentId);
        
        return result;
    } catch (error) {
        console.error('❌ Task completion error:', error.message);
        throw error;
    }
}

/**
 * Health monitoring example
 */
export async function healthMonitoringExample() {
    console.log('🏥 Health monitoring example...');
    
    const framework = await basicSetupExample();
    const healthMonitor = framework.getComponent('healthMonitor');
    
    try {
        // Generate health report
        const report = healthMonitor.generateHealthReport();
        console.log('📊 Health report:', {
            totalServices: report.summary.totalServices,
            healthy: report.summary.healthy,
            unhealthy: report.summary.unhealthy
        });
        
        // Check specific service health
        const linearHealth = await healthMonitor.checkIntegrationHealth('linear');
        console.log('📋 Linear health:', linearHealth?.status || 'unknown');
        
        // Monitor API limits
        const githubLimits = await healthMonitor.monitorAPILimits('github');
        if (githubLimits) {
            console.log('🐙 GitHub API usage:', `${githubLimits.usage}%`);
        }
        
        // Set up alert listener
        healthMonitor.on('alert.triggered', (alert) => {
            console.log('🚨 Alert triggered:', alert.message);
        });
        
        return report;
    } catch (error) {
        console.error('❌ Health monitoring error:', error.message);
        throw error;
    }
}

/**
 * Event bus example
 */
export async function eventBusExample() {
    console.log('📡 Event bus example...');
    
    const framework = await basicSetupExample();
    const eventBus = framework.getComponent('eventBus');
    
    // Subscribe to pattern-based events
    const unsubscribe = eventBus.subscribe('workflow.*', (event) => {
        console.log('🔄 Workflow event:', event.event, event.data);
    });
    
    // Subscribe to specific events
    eventBus.on('task.created', (event) => {
        console.log('📝 Task created:', event.data);
    });
    
    // Emit some test events
    eventBus.emit('workflow.started', { id: 'wf-001', name: 'Test Workflow' });
    eventBus.emit('task.created', { id: 'task-001', title: 'Test Task' });
    eventBus.emit('workflow.completed', { id: 'wf-001', status: 'success' });
    
    // Broadcast event
    eventBus.broadcast('system.notification', { message: 'System is healthy' });
    
    // Clean up
    setTimeout(() => {
        unsubscribe();
        console.log('🧹 Event subscriptions cleaned up');
    }, 1000);
}

/**
 * Full CICD pipeline example
 */
export async function fullPipelineExample() {
    console.log('🚀 Full CICD pipeline example...');
    
    const framework = await basicSetupExample();
    
    try {
        const result = await integrationFlows.runCICDPipeline(framework, {
            requirements: `
                Create a user management system with the following features:
                1. User registration with email validation
                2. User login with JWT authentication
                3. Password reset functionality
                4. User profile management
                5. Admin user management interface
            `,
            repoUrl: 'https://github.com/Zeeeepa/claude-task-master'
        });
        
        console.log('🎯 Pipeline completed');
        console.log('📋 Workflow:', result.workflow.workflowId);
        console.log('✅ Tasks completed:', result.results.length);
        
        return result;
    } catch (error) {
        console.error('❌ Pipeline error:', error.message);
        throw error;
    }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
    console.log('🎬 Running all integration examples...\n');
    
    try {
        await basicSetupExample();
        console.log('\n');
        
        await linearIntegrationExample();
        console.log('\n');
        
        await githubIntegrationExample();
        console.log('\n');
        
        await codegenIntegrationExample();
        console.log('\n');
        
        await workflowCreationExample();
        console.log('\n');
        
        await healthMonitoringExample();
        console.log('\n');
        
        await eventBusExample();
        console.log('\n');
        
        console.log('🎉 All examples completed successfully!');
    } catch (error) {
        console.error('💥 Example failed:', error.message);
        process.exit(1);
    }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples();
}

