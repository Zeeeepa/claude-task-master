/**
 * Workflow Manager - Development pipeline control
 * Controls development pipeline flow, manages workflow state transitions,
 * handles dependencies, and implements recovery mechanisms
 */

import EventEmitter from 'events';
import { logger } from '../utils/logger.js';
import { configManager } from '../utils/config-manager.js';
import { eventDispatcher } from './event-dispatcher.js';

class WorkflowManager extends EventEmitter {
    constructor() {
        super();
        this.workflows = new Map();
        this.workflowTemplates = new Map();
        this.activeExecutions = new Map();
        this.isRunning = false;
        this.executionInterval = null;
    }

    /**
     * Start the workflow manager
     */
    async start() {
        if (this.isRunning) {
            logger.warn('Workflow manager is already running');
            return;
        }

        logger.info('Starting workflow manager...');
        this.isRunning = true;
        
        // Register default workflow templates
        this.registerDefaultTemplates();
        
        // Start execution monitoring
        this.startExecutionMonitoring();
        
        this.emit('started');
        logger.info('Workflow manager started successfully');
    }

    /**
     * Stop the workflow manager
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('Workflow manager is not running');
            return;
        }

        logger.info('Stopping workflow manager...');
        this.isRunning = false;
        
        if (this.executionInterval) {
            clearInterval(this.executionInterval);
            this.executionInterval = null;
        }
        
        this.emit('stopped');
        logger.info('Workflow manager stopped successfully');
    }

    /**
     * Register a workflow template
     */
    registerTemplate(templateId, template) {
        const workflowTemplate = {
            id: templateId,
            name: template.name,
            description: template.description,
            steps: template.steps || [],
            dependencies: template.dependencies || {},
            timeout: template.timeout || 300000, // 5 minutes default
            retryPolicy: template.retryPolicy || { maxRetries: 3, backoffMs: 1000 },
            metadata: template.metadata || {},
            createdAt: Date.now()
        };

        this.workflowTemplates.set(templateId, workflowTemplate);
        
        logger.info(`Workflow template registered: ${templateId}`);
        return workflowTemplate;
    }

    /**
     * Create a new workflow instance
     */
    async createWorkflow(templateId, workflowData = {}) {
        const template = this.workflowTemplates.get(templateId);
        
        if (!template) {
            throw new Error(`Workflow template not found: ${templateId}`);
        }

        const workflowId = this.generateWorkflowId();
        const workflow = {
            id: workflowId,
            templateId,
            name: workflowData.name || template.name,
            status: 'created',
            steps: this.initializeSteps(template.steps, workflowData.stepData),
            dependencies: { ...template.dependencies },
            context: workflowData.context || {},
            metadata: { ...template.metadata, ...workflowData.metadata },
            createdAt: Date.now(),
            startedAt: null,
            completedAt: null,
            error: null,
            retryCount: 0,
            maxRetries: template.retryPolicy.maxRetries
        };

        this.workflows.set(workflowId, workflow);
        
        await eventDispatcher.dispatch('workflow.created', {
            workflowId,
            templateId,
            workflow
        });

        logger.info(`Workflow created: ${workflowId} from template ${templateId}`);
        return workflow;
    }

    /**
     * Start workflow execution
     */
    async startWorkflow(workflowId, executionContext = {}) {
        const workflow = this.workflows.get(workflowId);
        
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        if (workflow.status !== 'created' && workflow.status !== 'paused') {
            throw new Error(`Cannot start workflow in status: ${workflow.status}`);
        }

        workflow.status = 'running';
        workflow.startedAt = Date.now();
        workflow.context = { ...workflow.context, ...executionContext };

        const execution = {
            workflowId,
            startedAt: Date.now(),
            currentStepIndex: 0,
            stepResults: [],
            context: workflow.context
        };

        this.activeExecutions.set(workflowId, execution);

        await eventDispatcher.dispatch('workflow.started', {
            workflowId,
            workflow,
            execution
        });

        logger.info(`Workflow started: ${workflowId}`);
        
        // Start executing steps
        this.executeNextStep(workflowId);
        
        return execution;
    }

    /**
     * Execute the next step in a workflow
     */
    async executeNextStep(workflowId) {
        const workflow = this.workflows.get(workflowId);
        const execution = this.activeExecutions.get(workflowId);

        if (!workflow || !execution) {
            logger.error(`Workflow or execution not found: ${workflowId}`);
            return;
        }

        if (execution.currentStepIndex >= workflow.steps.length) {
            // Workflow completed
            await this.completeWorkflow(workflowId);
            return;
        }

        const step = workflow.steps[execution.currentStepIndex];
        
        // Check step dependencies
        if (!this.checkStepDependencies(step, execution)) {
            logger.warn(`Step dependencies not met: ${step.id}`, { workflowId });
            // Schedule retry
            setTimeout(() => this.executeNextStep(workflowId), 5000);
            return;
        }

        try {
            step.status = 'running';
            step.startedAt = Date.now();

            await eventDispatcher.dispatch('workflow.step.started', {
                workflowId,
                stepId: step.id,
                step,
                execution
            });

            logger.info(`Executing step: ${step.id} in workflow ${workflowId}`);

            const result = await this.executeStep(step, execution.context);

            step.status = 'completed';
            step.completedAt = Date.now();
            step.result = result;

            execution.stepResults.push({
                stepId: step.id,
                result,
                completedAt: Date.now()
            });

            await eventDispatcher.dispatch('workflow.step.completed', {
                workflowId,
                stepId: step.id,
                step,
                result,
                execution
            });

            logger.info(`Step completed: ${step.id} in workflow ${workflowId}`);

            // Move to next step
            execution.currentStepIndex++;
            
            // Continue with next step
            setImmediate(() => this.executeNextStep(workflowId));

        } catch (error) {
            await this.handleStepError(workflowId, step, error);
        }
    }

    /**
     * Execute a single step
     */
    async executeStep(step, context) {
        switch (step.type) {
            case 'task':
                return await this.executeTaskStep(step, context);
            case 'condition':
                return await this.executeConditionStep(step, context);
            case 'parallel':
                return await this.executeParallelStep(step, context);
            case 'wait':
                return await this.executeWaitStep(step, context);
            case 'webhook':
                return await this.executeWebhookStep(step, context);
            default:
                throw new Error(`Unknown step type: ${step.type}`);
        }
    }

    /**
     * Execute a task step
     */
    async executeTaskStep(step, context) {
        const taskData = {
            ...step.taskData,
            context
        };

        // Dispatch task to coordination engine
        await eventDispatcher.dispatch('task.submit', {
            task: taskData,
            workflowId: context.workflowId,
            stepId: step.id
        });

        // Wait for task completion (simplified - in real implementation, this would be event-driven)
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Task step timeout: ${step.id}`));
            }, step.timeout || 60000);

            const handler = (event) => {
                if (event.data.stepId === step.id) {
                    clearTimeout(timeout);
                    eventDispatcher.removeListener('task.completed', handler);
                    resolve(event.data.result);
                }
            };

            eventDispatcher.on('task.completed', handler);
        });
    }

    /**
     * Execute a condition step
     */
    async executeConditionStep(step, context) {
        const condition = step.condition;
        let result = false;

        if (typeof condition === 'function') {
            result = await condition(context);
        } else if (typeof condition === 'string') {
            // Simple expression evaluation (in production, use a proper expression engine)
            result = this.evaluateExpression(condition, context);
        }

        return { conditionMet: result };
    }

    /**
     * Execute parallel steps
     */
    async executeParallelStep(step, context) {
        const parallelSteps = step.steps || [];
        const promises = parallelSteps.map(parallelStep => 
            this.executeStep(parallelStep, context)
        );

        const results = await Promise.allSettled(promises);
        
        return {
            results: results.map((result, index) => ({
                stepId: parallelSteps[index].id,
                status: result.status,
                value: result.status === 'fulfilled' ? result.value : null,
                error: result.status === 'rejected' ? result.reason.message : null
            }))
        };
    }

    /**
     * Execute a wait step
     */
    async executeWaitStep(step, context) {
        const waitTime = step.waitTime || 1000;
        
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({ waited: waitTime });
            }, waitTime);
        });
    }

    /**
     * Execute a webhook step
     */
    async executeWebhookStep(step, context) {
        // Implementation would make HTTP request to webhook URL
        // This is a placeholder
        return { webhookCalled: true, url: step.url };
    }

    /**
     * Handle step execution error
     */
    async handleStepError(workflowId, step, error) {
        const workflow = this.workflows.get(workflowId);
        
        step.status = 'failed';
        step.error = error.message;
        step.failedAt = Date.now();

        await eventDispatcher.dispatch('workflow.step.failed', {
            workflowId,
            stepId: step.id,
            step,
            error: error.message
        });

        logger.error(`Step failed: ${step.id} in workflow ${workflowId}`, error);

        // Check retry policy
        if (step.retryCount < (step.maxRetries || 3)) {
            step.retryCount++;
            step.status = 'retrying';
            
            const backoffMs = (step.backoffMs || 1000) * Math.pow(2, step.retryCount - 1);
            
            logger.info(`Retrying step ${step.id} in ${backoffMs}ms (attempt ${step.retryCount})`);
            
            setTimeout(() => {
                step.status = 'pending';
                this.executeNextStep(workflowId);
            }, backoffMs);
        } else {
            // Max retries reached, fail the workflow
            await this.failWorkflow(workflowId, error);
        }
    }

    /**
     * Complete a workflow
     */
    async completeWorkflow(workflowId) {
        const workflow = this.workflows.get(workflowId);
        const execution = this.activeExecutions.get(workflowId);

        if (!workflow) {
            return;
        }

        workflow.status = 'completed';
        workflow.completedAt = Date.now();

        this.activeExecutions.delete(workflowId);

        await eventDispatcher.dispatch('workflow.completed', {
            workflowId,
            workflow,
            execution,
            duration: Date.now() - workflow.startedAt
        });

        logger.info(`Workflow completed: ${workflowId}`);
    }

    /**
     * Fail a workflow
     */
    async failWorkflow(workflowId, error) {
        const workflow = this.workflows.get(workflowId);
        const execution = this.activeExecutions.get(workflowId);

        if (!workflow) {
            return;
        }

        workflow.status = 'failed';
        workflow.error = error.message;
        workflow.failedAt = Date.now();

        this.activeExecutions.delete(workflowId);

        await eventDispatcher.dispatch('workflow.failed', {
            workflowId,
            workflow,
            execution,
            error: error.message
        });

        logger.error(`Workflow failed: ${workflowId}`, error);
    }

    /**
     * Pause a workflow
     */
    async pauseWorkflow(workflowId) {
        const workflow = this.workflows.get(workflowId);
        
        if (!workflow || workflow.status !== 'running') {
            throw new Error(`Cannot pause workflow in status: ${workflow.status}`);
        }

        workflow.status = 'paused';
        workflow.pausedAt = Date.now();

        await eventDispatcher.dispatch('workflow.paused', {
            workflowId,
            workflow
        });

        logger.info(`Workflow paused: ${workflowId}`);
    }

    /**
     * Resume a paused workflow
     */
    async resumeWorkflow(workflowId) {
        const workflow = this.workflows.get(workflowId);
        
        if (!workflow || workflow.status !== 'paused') {
            throw new Error(`Cannot resume workflow in status: ${workflow.status}`);
        }

        workflow.status = 'running';
        workflow.resumedAt = Date.now();

        await eventDispatcher.dispatch('workflow.resumed', {
            workflowId,
            workflow
        });

        logger.info(`Workflow resumed: ${workflowId}`);
        
        // Continue execution
        this.executeNextStep(workflowId);
    }

    /**
     * Initialize workflow steps
     */
    initializeSteps(templateSteps, stepData = {}) {
        return templateSteps.map(step => ({
            ...step,
            id: step.id || this.generateStepId(),
            status: 'pending',
            retryCount: 0,
            data: { ...step.data, ...stepData[step.id] }
        }));
    }

    /**
     * Check step dependencies
     */
    checkStepDependencies(step, execution) {
        if (!step.dependencies || step.dependencies.length === 0) {
            return true;
        }

        return step.dependencies.every(depId => {
            const depResult = execution.stepResults.find(r => r.stepId === depId);
            return depResult && depResult.result;
        });
    }

    /**
     * Register default workflow templates
     */
    registerDefaultTemplates() {
        // Development workflow template
        this.registerTemplate('development', {
            name: 'Development Workflow',
            description: 'Standard development pipeline',
            steps: [
                {
                    id: 'analyze_requirements',
                    type: 'task',
                    name: 'Analyze Requirements',
                    taskData: { type: 'requirement_analysis' }
                },
                {
                    id: 'create_tasks',
                    type: 'task',
                    name: 'Create Tasks',
                    taskData: { type: 'task_creation' },
                    dependencies: ['analyze_requirements']
                },
                {
                    id: 'implement_code',
                    type: 'task',
                    name: 'Implement Code',
                    taskData: { type: 'code_implementation' },
                    dependencies: ['create_tasks']
                },
                {
                    id: 'run_tests',
                    type: 'task',
                    name: 'Run Tests',
                    taskData: { type: 'testing' },
                    dependencies: ['implement_code']
                },
                {
                    id: 'deploy',
                    type: 'task',
                    name: 'Deploy',
                    taskData: { type: 'deployment' },
                    dependencies: ['run_tests']
                }
            ]
        });

        // PR validation workflow
        this.registerTemplate('pr_validation', {
            name: 'PR Validation Workflow',
            description: 'Validate pull requests',
            steps: [
                {
                    id: 'lint_code',
                    type: 'task',
                    name: 'Lint Code',
                    taskData: { type: 'linting' }
                },
                {
                    id: 'run_unit_tests',
                    type: 'task',
                    name: 'Run Unit Tests',
                    taskData: { type: 'unit_testing' }
                },
                {
                    id: 'run_integration_tests',
                    type: 'task',
                    name: 'Run Integration Tests',
                    taskData: { type: 'integration_testing' },
                    dependencies: ['run_unit_tests']
                },
                {
                    id: 'security_scan',
                    type: 'task',
                    name: 'Security Scan',
                    taskData: { type: 'security_scanning' }
                }
            ]
        });
    }

    /**
     * Start execution monitoring
     */
    startExecutionMonitoring() {
        const monitorInterval = configManager.get('workflow.monitorInterval', 10000);
        
        this.executionInterval = setInterval(() => {
            this.monitorExecutions();
        }, monitorInterval);
    }

    /**
     * Monitor active executions for timeouts and issues
     */
    monitorExecutions() {
        const now = Date.now();
        
        for (const [workflowId, execution] of this.activeExecutions) {
            const workflow = this.workflows.get(workflowId);
            
            if (!workflow) {
                continue;
            }

            // Check for workflow timeout
            const timeout = workflow.timeout || 300000; // 5 minutes default
            if (now - execution.startedAt > timeout) {
                logger.warn(`Workflow timeout: ${workflowId}`);
                this.failWorkflow(workflowId, new Error('Workflow timeout'));
                continue;
            }

            // Check for stuck steps
            const currentStep = workflow.steps[execution.currentStepIndex];
            if (currentStep && currentStep.status === 'running') {
                const stepTimeout = currentStep.timeout || 60000; // 1 minute default
                if (currentStep.startedAt && now - currentStep.startedAt > stepTimeout) {
                    logger.warn(`Step timeout: ${currentStep.id} in workflow ${workflowId}`);
                    this.handleStepError(workflowId, currentStep, new Error('Step timeout'));
                }
            }
        }
    }

    /**
     * Evaluate simple expressions (placeholder implementation)
     */
    evaluateExpression(expression, context) {
        // This is a very basic implementation
        // In production, use a proper expression engine like JSONata
        try {
            const func = new Function('context', `return ${expression}`);
            return func(context);
        } catch (error) {
            logger.error('Expression evaluation error:', error);
            return false;
        }
    }

    /**
     * Generate unique workflow ID
     */
    generateWorkflowId() {
        return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate unique step ID
     */
    generateStepId() {
        return `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get workflow manager status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            workflowCount: this.workflows.size,
            templateCount: this.workflowTemplates.size,
            activeExecutions: this.activeExecutions.size,
            workflows: Array.from(this.workflows.values()),
            templates: Array.from(this.workflowTemplates.values())
        };
    }

    /**
     * Get workflow by ID
     */
    getWorkflow(workflowId) {
        return this.workflows.get(workflowId);
    }

    /**
     * Get all workflows
     */
    getAllWorkflows() {
        return Array.from(this.workflows.values());
    }
}

export const workflowManager = new WorkflowManager();
export default WorkflowManager;

