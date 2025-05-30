/**
 * @fileoverview Integration Flows
 * @description Pre-built workflow patterns for common integration scenarios
 */

/**
 * Set up event routing between components
 */
export function setupEventRouting(framework, eventBus, webhookManager, healthMonitor) {
    // Route webhook events to event bus
    webhookManager.on('webhook.processed', (data) => {
        eventBus.emit('webhook.processed', data);
    });
    
    // Route health events to event bus
    healthMonitor.on('service.status.changed', (data) => {
        eventBus.emit('service.status.changed', data);
    });
    
    healthMonitor.on('alert.triggered', (data) => {
        eventBus.emit('alert.triggered', data);
    });
    
    // Route framework events to event bus
    framework.on('component.registered', (data) => {
        eventBus.emit('component.registered', data);
    });
    
    framework.on('component.initialized', (data) => {
        eventBus.emit('component.initialized', data);
    });
}

/**
 * Set up webhook routing to service integrations
 */
export function setupWebhookRouting(webhookManager, integrations) {
    // Linear webhooks
    webhookManager.on('linear.webhook', async (webhookEvent) => {
        try {
            await integrations.linearIntegration.handleLinearWebhooks(webhookEvent.body);
        } catch (error) {
            console.error('Error handling Linear webhook:', error);
        }
    });
    
    // GitHub webhooks
    webhookManager.on('github.webhook', async (webhookEvent) => {
        try {
            await integrations.githubIntegration.handleGitHubWebhooks(webhookEvent);
        } catch (error) {
            console.error('Error handling GitHub webhook:', error);
        }
    });
    
    // Claude Code webhooks
    webhookManager.on('claudeCode.webhook', async (webhookEvent) => {
        try {
            await integrations.claudeCodeIntegration.handleClaudeCodeWebhooks(webhookEvent.body);
        } catch (error) {
            console.error('Error handling Claude Code webhook:', error);
        }
    });
    
    // Agent API webhooks
    webhookManager.on('agentapi.webhook', async (webhookEvent) => {
        try {
            await integrations.agentAPIIntegration.handleAgentEvents(webhookEvent.body);
        } catch (error) {
            console.error('Error handling Agent API webhook:', error);
        }
    });
}

/**
 * Set up health monitoring for all integrations
 */
export function setupHealthMonitoring(healthMonitor, integrations) {
    // Register health checkers for each service
    healthMonitor.registerService('linear', async () => {
        return integrations.linearIntegration.getHealthStatus();
    });
    
    healthMonitor.registerService('github', async () => {
        return integrations.githubIntegration.getHealthStatus();
    });
    
    healthMonitor.registerService('codegen', async () => {
        return integrations.codegenIntegration.getHealthStatus();
    });
    
    healthMonitor.registerService('claudeCode', async () => {
        return integrations.claudeCodeIntegration.getHealthStatus();
    });
    
    healthMonitor.registerService('agentapi', async () => {
        return integrations.agentAPIIntegration.getHealthStatus();
    });
}

/**
 * Integration workflow examples
 */
export const integrationFlows = {
    /**
     * Workflow Creation Flow
     */
    async createWorkflow(framework, { title, description, repoUrl }) {
        const linearIntegration = framework.getComponent('linearIntegration');
        const eventBus = framework.getComponent('eventBus');
        
        // 1. Create Linear issue
        const issue = await linearIntegration.createIssue(title, description);
        
        // 2. Emit workflow started event
        eventBus.emit('workflow.started', { 
            workflowId: issue.id,
            linearIssueId: issue.id,
            githubRepoUrl: repoUrl,
            title,
            description
        });
        
        return { issue, workflowId: issue.id };
    },
    
    /**
     * Task Completion Flow
     */
    async completeTask(framework, { task, repoUrl, branch, title, body }) {
        const codegenIntegration = framework.getComponent('codegenIntegration');
        const githubIntegration = framework.getComponent('githubIntegration');
        const linearIntegration = framework.getComponent('linearIntegration');
        const claudeCodeIntegration = framework.getComponent('claudeCodeIntegration');
        const eventBus = framework.getComponent('eventBus');
        
        // 1. Send task to Codegen
        const response = await codegenIntegration.sendTaskRequest(task);
        
        // 2. Create PR from response
        const pr = await githubIntegration.createPullRequest(repoUrl, branch, title, body);
        
        // 3. Update Linear issue
        if (task.linearIssueId) {
            await linearIntegration.updateIssueStatus(task.linearIssueId, 'In Review');
        }
        
        // 4. Trigger Claude Code validation
        const validation = await claudeCodeIntegration.deployValidationAgent(pr.url, {
            repository: repoUrl,
            branch,
            commit: pr.head.sha
        });
        
        // 5. Emit task completed event
        eventBus.emit('task.completed', {
            task,
            pullRequest: pr,
            validation,
            timestamp: new Date().toISOString()
        });
        
        return { response, pullRequest: pr, validation };
    },
    
    /**
     * Validation Flow
     */
    async handleValidation(framework, { validationResults, prUrl, issueId }) {
        const githubIntegration = framework.getComponent('githubIntegration');
        const linearIntegration = framework.getComponent('linearIntegration');
        const claudeCodeIntegration = framework.getComponent('claudeCodeIntegration');
        const eventBus = framework.getComponent('eventBus');
        
        if (validationResults.status === 'failed') {
            // Generate fixes for validation errors
            const fixResults = await claudeCodeIntegration.requestFixGeneration(
                validationResults.results.issues,
                { prUrl, autoFix: true }
            );
            
            eventBus.emit('validation.failed', {
                validationResults,
                fixResults,
                prUrl,
                issueId
            });
            
            return { status: 'fixing', fixResults };
        } else {
            // Merge PR and update issue
            await githubIntegration.mergePullRequest(prUrl);
            
            if (issueId) {
                await linearIntegration.updateIssueStatus(issueId, 'Done');
            }
            
            eventBus.emit('validation.completed', {
                validationResults,
                prUrl,
                issueId,
                merged: true
            });
            
            return { status: 'completed', merged: true };
        }
    },
    
    /**
     * Error Recovery Flow
     */
    async handleError(framework, { error, context }) {
        const eventBus = framework.getComponent('eventBus');
        const healthMonitor = framework.getComponent('healthMonitor');
        
        // Emit error event
        eventBus.emit('error.occurred', {
            error: {
                message: error.message,
                stack: error.stack,
                code: error.code
            },
            context,
            timestamp: new Date().toISOString()
        });
        
        // Trigger health check for affected services
        if (context.service) {
            await healthMonitor.checkIntegrationHealth(context.service);
        }
        
        return { handled: true, timestamp: new Date().toISOString() };
    },
    
    /**
     * Agent Deployment Flow
     */
    async deployAgent(framework, { agentConfig, task }) {
        const agentAPIIntegration = framework.getComponent('agentAPIIntegration');
        const eventBus = framework.getComponent('eventBus');
        
        // Deploy agent
        const deployment = await agentAPIIntegration.deployAgent(agentConfig);
        
        // Send task to agent
        if (task) {
            const command = {
                type: 'execute',
                action: 'process_task',
                parameters: task
            };
            
            const result = await agentAPIIntegration.sendAgentCommand(
                deployment.agentId, 
                command
            );
            
            eventBus.emit('agent.task.completed', {
                agentId: deployment.agentId,
                task,
                result,
                timestamp: new Date().toISOString()
            });
            
            return { deployment, result };
        }
        
        eventBus.emit('agent.deployed', {
            deployment,
            timestamp: new Date().toISOString()
        });
        
        return { deployment };
    },
    
    /**
     * Full CICD Pipeline Flow
     */
    async runCICDPipeline(framework, { requirements, repoUrl }) {
        const eventBus = framework.getComponent('eventBus');
        
        try {
            // 1. Create workflow
            const workflow = await this.createWorkflow(framework, {
                title: 'CICD Pipeline Execution',
                description: requirements,
                repoUrl
            });
            
            // 2. Process requirements into tasks
            const codegenIntegration = framework.getComponent('codegenIntegration');
            const taskResponse = await codegenIntegration.sendTaskRequest({
                type: 'requirements_analysis',
                description: requirements,
                repository: repoUrl
            });
            
            // 3. Execute tasks
            const results = [];
            for (const task of taskResponse.result.tasks || []) {
                const taskResult = await this.completeTask(framework, {
                    task,
                    repoUrl,
                    branch: `feature/${task.id}`,
                    title: task.title,
                    body: task.description
                });
                
                results.push(taskResult);
            }
            
            // 4. Emit pipeline completion
            eventBus.emit('pipeline.completed', {
                workflow,
                results,
                timestamp: new Date().toISOString()
            });
            
            return { workflow, results };
            
        } catch (error) {
            await this.handleError(framework, {
                error,
                context: { 
                    flow: 'cicd_pipeline',
                    requirements,
                    repoUrl
                }
            });
            
            throw error;
        }
    }
};

export default integrationFlows;

