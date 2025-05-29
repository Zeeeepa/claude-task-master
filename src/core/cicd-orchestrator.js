import { getConnection } from '../database/connection/connection_manager.js';
import { AgentAPIClient } from './agentapi-client.js';
import { TaskManager } from './task-manager.js';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * CI/CD Orchestrator - Main coordination engine for automated development workflows
 * Integrates Codegen, AgentAPI, Claude Code, and PostgreSQL for comprehensive CI/CD automation
 */
export class CICDOrchestrator extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            agentapiUrl: config.agentapiUrl || process.env.AGENTAPI_URL || 'http://localhost:3284',
            codegenApiUrl: config.codegenApiUrl || process.env.CODEGEN_API_URL,
            wsl2InstancePath: config.wsl2InstancePath || process.env.WSL2_INSTANCE_PATH || '/mnt/c/projects',
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 5000,
            ...config
        };
        
        this.db = null;
        this.taskManager = null;
        this.agentApiClient = null;
        this.activePipelines = new Map();
    }

    /**
     * Initialize the orchestrator
     */
    async initialize() {
        try {
            console.log('🔄 Initializing CI/CD Orchestrator...');
            
            this.db = getConnection();
            
            this.taskManager = new TaskManager();
            await this.taskManager.initialize();
            
            this.agentApiClient = new AgentAPIClient({
                baseUrl: this.config.agentapiUrl
            });
            
            // Set up event listeners
            this._setupEventListeners();
            
            console.log('✅ CI/CD Orchestrator initialized successfully');
            this.emit('initialized');
        } catch (error) {
            console.error('❌ Failed to initialize CI/CD Orchestrator:', error);
            throw error;
        }
    }

    /**
     * Process webhook event (PR created, updated, etc.)
     */
    async processWebhookEvent(eventData) {
        try {
            const { event_type, event_action, payload } = eventData;
            console.log(`📥 Processing webhook: ${event_type}.${event_action}`);
            
            // Store webhook event
            const webhookEvent = await this._storeWebhookEvent(eventData);
            
            // Route to appropriate handler
            switch (event_type) {
                case 'pull_request':
                    await this._handlePullRequestEvent(event_action, payload, webhookEvent.id);
                    break;
                case 'push':
                    await this._handlePushEvent(payload, webhookEvent.id);
                    break;
                case 'issue':
                    await this._handleIssueEvent(event_action, payload, webhookEvent.id);
                    break;
                default:
                    console.log(`ℹ️  Unhandled webhook event type: ${event_type}`);
            }
            
            // Mark webhook as processed
            await this._markWebhookProcessed(webhookEvent.id);
            
        } catch (error) {
            console.error('❌ Failed to process webhook event:', error);
            throw error;
        }
    }

    /**
     * Create and execute CI/CD pipeline for a pull request
     */
    async createPRPipeline(projectId, pullRequestId, triggerEvent = 'pr_created') {
        try {
            console.log(`🚀 Creating CI/CD pipeline for PR ${pullRequestId}`);
            
            // Get PR and project details
            const pr = await this._getPullRequest(pullRequestId);
            const project = await this.taskManager.getProject(projectId);
            
            if (!pr || !project) {
                throw new Error('Pull request or project not found');
            }

            // Create pipeline record
            const pipeline = await this._createPipeline({
                project_id: projectId,
                pull_request_id: pullRequestId,
                pipeline_type: 'validation',
                trigger_event: triggerEvent,
                branch_name: pr.branch_name,
                commit_sha: pr.commit_sha || 'HEAD'
            });

            // Store in active pipelines
            this.activePipelines.set(pipeline.id, {
                ...pipeline,
                startTime: Date.now(),
                status: 'running'
            });

            // Execute pipeline steps
            await this._executePipelineSteps(pipeline, project, pr);
            
            return pipeline;
        } catch (error) {
            console.error('❌ Failed to create PR pipeline:', error);
            throw error;
        }
    }

    /**
     * Generate code using Codegen based on database tasks
     */
    async generateCodeFromTasks(projectId, taskIds = []) {
        try {
            console.log(`🤖 Generating code for project ${projectId}`);
            
            // Get tasks from database
            const tasks = taskIds.length > 0 
                ? await this._getTasksByIds(taskIds)
                : await this.taskManager.listTasks(projectId, { status: 'pending', limit: 10 });
            
            if (tasks.length === 0) {
                console.log('ℹ️  No tasks found for code generation');
                return null;
            }

            // Get project details
            const project = await this.taskManager.getProject(projectId);
            
            // Generate natural language prompt for Codegen
            const prompt = await this._buildCodegenPrompt(project, tasks);
            
            // Send request to Codegen API
            const codegenResult = await this._requestCodegeneration(prompt, project);
            
            // If successful, create PR with generated code
            if (codegenResult.success) {
                const prResult = await this._createPRFromCodegen(project, tasks, codegenResult);
                
                // Update tasks status
                for (const task of tasks) {
                    await this.taskManager.updateTask(task.id, { 
                        status: 'in_progress',
                        metadata: { 
                            ...task.metadata, 
                            generated_pr: prResult.pr_number 
                        }
                    });
                }
                
                return prResult;
            }
            
            return codegenResult;
        } catch (error) {
            console.error('❌ Failed to generate code from tasks:', error);
            throw error;
        }
    }

    /**
     * Validate PR using Claude Code via AgentAPI
     */
    async validatePRWithClaudeCode(pullRequestId, validationType = 'comprehensive') {
        try {
            console.log(`🔍 Validating PR ${pullRequestId} with Claude Code`);
            
            // Get PR details
            const pr = await this._getPullRequest(pullRequestId);
            const project = await this.taskManager.getProject(pr.project_id);
            
            // Initialize AgentAPI session
            await this.agentApiClient.initializeSession('claude');
            
            // Prepare validation data
            const validationData = {
                projectPath: `${this.config.wsl2InstancePath}/${project.repository_name}`,
                branchName: pr.branch_name,
                baseBranch: pr.base_branch,
                changedFiles: await this._getChangedFiles(pr),
                prDescription: pr.description
            };
            
            // Execute validation
            const validationResult = await this.agentApiClient.validatePullRequest(validationData);
            
            // Store validation results
            const validationRecord = await this._storeValidationResult({
                pipeline_id: null, // Will be set if part of pipeline
                pull_request_id: pullRequestId,
                validation_type: validationType,
                status: validationResult.success ? 'completed' : 'failed',
                claude_code_feedback: validationResult.output,
                files_analyzed: validationData.changedFiles
            });
            
            // Close AgentAPI session
            await this.agentApiClient.closeSession();
            
            console.log(`✅ PR validation completed: ${validationResult.success ? 'PASSED' : 'FAILED'}`);
            
            return {
                ...validationResult,
                validationId: validationRecord.id
            };
        } catch (error) {
            console.error('❌ Failed to validate PR with Claude Code:', error);
            
            // Ensure session is closed
            try {
                await this.agentApiClient.closeSession();
            } catch (closeError) {
                console.warn('⚠️  Failed to close AgentAPI session:', closeError);
            }
            
            throw error;
        }
    }

    /**
     * Handle CI/CD errors with automatic retry and escalation
     */
    async handlePipelineError(pipelineId, stepName, error) {
        try {
            console.log(`🚨 Handling pipeline error: ${pipelineId} - ${stepName}`);
            
            const pipeline = this.activePipelines.get(pipelineId);
            if (!pipeline) {
                throw new Error(`Pipeline not found: ${pipelineId}`);
            }

            // Get step details
            const step = await this._getPipelineStep(pipelineId, stepName);
            
            // Check retry count
            if (step.retry_count < step.max_retries) {
                console.log(`🔄 Retrying step ${stepName} (attempt ${step.retry_count + 1})`);
                
                // Update retry count
                await this._updatePipelineStep(step.id, {
                    retry_count: step.retry_count + 1,
                    status: 'retrying'
                });
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                
                // Retry the step
                return await this._retryPipelineStep(pipeline, step);
            }
            
            // Max retries exceeded - escalate to Claude Code for debugging
            console.log(`🆘 Max retries exceeded for ${stepName}, escalating to Claude Code`);
            
            const debugResult = await this._debugWithClaudeCode(pipeline, step, error);
            
            if (debugResult.success) {
                console.log('✅ Claude Code provided fix, applying...');
                return await this._applyClaudeCodeFix(pipeline, step, debugResult);
            } else {
                // Create Codegen issue for manual intervention
                console.log('🎫 Creating Codegen issue for manual intervention');
                return await this._createCodegenIssue(pipeline, step, error, debugResult);
            }
        } catch (handlingError) {
            console.error('❌ Failed to handle pipeline error:', handlingError);
            throw handlingError;
        }
    }

    /**
     * Get pipeline status and metrics
     */
    async getPipelineStatus(pipelineId) {
        const pipeline = this.activePipelines.get(pipelineId);
        if (!pipeline) {
            // Check database for completed pipelines
            return await this._getPipelineFromDB(pipelineId);
        }
        
        const steps = await this._getPipelineSteps(pipelineId);
        const duration = Date.now() - pipeline.startTime;
        
        return {
            ...pipeline,
            duration,
            steps,
            progress: this._calculateProgress(steps)
        };
    }

    // Private methods
    _setupEventListeners() {
        this.agentApiClient.on('sessionInitialized', (data) => {
            console.log(`🔗 AgentAPI session initialized: ${data.sessionId}`);
        });
        
        this.agentApiClient.on('messageSent', (data) => {
            this.emit('agentMessage', data);
        });
        
        this.agentApiClient.on('sessionClosed', () => {
            console.log('🔌 AgentAPI session closed');
        });
    }

    async _handlePullRequestEvent(action, payload, webhookEventId) {
        const { pull_request, repository } = payload;
        
        // Find or create project
        const project = await this._findOrCreateProject(repository);
        
        switch (action) {
            case 'opened':
            case 'synchronize':
                // Create or update PR record
                const pr = await this._createOrUpdatePR(project.id, pull_request);
                
                // Create CI/CD pipeline
                await this.createPRPipeline(project.id, pr.id, `pr_${action}`);
                break;
                
            case 'closed':
                if (pull_request.merged) {
                    // Handle merge - update related tasks
                    await this._handlePRMerged(project.id, pull_request);
                }
                break;
        }
    }

    async _handlePushEvent(payload, webhookEventId) {
        const { repository, ref, commits } = payload;
        
        // Only handle pushes to main/master branch
        if (!ref.endsWith('/main') && !ref.endsWith('/master')) {
            return;
        }
        
        const project = await this._findOrCreateProject(repository);
        
        // Trigger deployment pipeline if configured
        if (project.deployment_config?.auto_deploy) {
            await this._triggerDeploymentPipeline(project.id, commits);
        }
    }

    async _executePipelineSteps(pipeline, project, pr) {
        const steps = [
            { name: 'checkout_code', type: 'git', order: 1 },
            { name: 'install_dependencies', type: 'build', order: 2 },
            { name: 'run_tests', type: 'test', order: 3 },
            { name: 'security_scan', type: 'security', order: 4 },
            { name: 'validate_with_claude', type: 'validation', order: 5 },
            { name: 'deploy_to_staging', type: 'deployment', order: 6 }
        ];
        
        for (const stepConfig of steps) {
            try {
                const step = await this._createPipelineStep(pipeline.id, stepConfig);
                await this._executePipelineStep(pipeline, step, project, pr);
            } catch (error) {
                await this.handlePipelineError(pipeline.id, stepConfig.name, error);
                break; // Stop pipeline on error
            }
        }
    }

    async _debugWithClaudeCode(pipeline, step, error) {
        try {
            await this.agentApiClient.initializeSession('claude');
            
            const project = await this.taskManager.getProject(pipeline.project_id);
            const pr = await this._getPullRequest(pipeline.pull_request_id);
            
            const errorData = {
                projectPath: `${this.config.wsl2InstancePath}/${project.repository_name}`,
                branchName: pr.branch_name,
                errorMessage: error.message,
                pipelineOutput: step.output || '',
                failedStep: step.step_name
            };
            
            const debugResult = await this.agentApiClient.debugError(errorData);
            
            await this.agentApiClient.closeSession();
            
            return debugResult;
        } catch (debugError) {
            console.error('❌ Failed to debug with Claude Code:', debugError);
            return { success: false, error: debugError.message };
        }
    }

    async _buildCodegenPrompt(project, tasks) {
        const taskDescriptions = tasks.map(task => 
            `- ${task.title}: ${task.description}`
        ).join('\n');
        
        return `
Generate code for the following tasks in project "${project.name}":

Repository: ${project.repository_url}
Framework: ${project.metadata?.framework || 'Unknown'}
Language: ${project.metadata?.language || 'Unknown'}

Tasks to implement:
${taskDescriptions}

Please create a comprehensive implementation that:
1. Follows the project's existing patterns and conventions
2. Includes proper error handling and validation
3. Has comprehensive test coverage
4. Includes documentation
5. Follows security best practices

Create a pull request with the implementation.
        `;
    }

    // Database helper methods
    async _storeWebhookEvent(eventData) {
        const result = await this.db.query(`
            INSERT INTO webhook_events (event_type, event_action, payload)
            VALUES ($1, $2, $3)
            RETURNING *
        `, [eventData.event_type, eventData.event_action, JSON.stringify(eventData.payload)]);
        
        return result.rows[0];
    }

    async _createPipeline(pipelineData) {
        const id = uuidv4();
        const result = await this.db.query(`
            INSERT INTO ci_cd_pipelines (
                id, project_id, pull_request_id, pipeline_type, 
                trigger_event, branch_name, commit_sha
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            id, pipelineData.project_id, pipelineData.pull_request_id,
            pipelineData.pipeline_type, pipelineData.trigger_event,
            pipelineData.branch_name, pipelineData.commit_sha
        ]);
        
        return result.rows[0];
    }

    async _createPipelineStep(pipelineId, stepConfig) {
        const id = uuidv4();
        const result = await this.db.query(`
            INSERT INTO pipeline_steps (
                id, pipeline_id, step_name, step_type, order_index
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [id, pipelineId, stepConfig.name, stepConfig.type, stepConfig.order]);
        
        return result.rows[0];
    }

    async _storeValidationResult(validationData) {
        const id = uuidv4();
        const result = await this.db.query(`
            INSERT INTO validation_results (
                id, pipeline_id, pull_request_id, validation_type,
                status, claude_code_feedback, files_analyzed
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            id, validationData.pipeline_id, validationData.pull_request_id,
            validationData.validation_type, validationData.status,
            validationData.claude_code_feedback, JSON.stringify(validationData.files_analyzed)
        ]);
        
        return result.rows[0];
    }

    // Additional helper methods would be implemented here...
    // This is a comprehensive foundation for the CI/CD orchestration system
}

