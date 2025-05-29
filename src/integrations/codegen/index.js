/**
 * @fileoverview Consolidated Codegen SDK Integration
 * @description Unified integration combining all Codegen SDK functionality
 */

import { CodegenClient } from './core/client.js';
import { TaskAnalyzer } from './nlp/task_analyzer.js';
import { PromptGenerator } from './nlp/prompt_generator.js';
import { PRWorkflow } from './workflow/pr_workflow.js';
import { StatusUpdater } from './workflow/status_updater.js';
import { CodegenConfig } from './config/codegen_config.js';
import { log } from '../../utils/logger.js';

/**
 * Main Codegen Integration Class
 * Orchestrates all Codegen SDK functionality
 */
export class CodegenIntegration {
    constructor(config = {}) {
        this.config = new CodegenConfig(config);
        
        // Initialize core components
        this.client = new CodegenClient(this.config.getComponent('client'));
        this.taskAnalyzer = new TaskAnalyzer(this.config.getComponent('taskAnalyzer'));
        this.promptGenerator = new PromptGenerator(this.config.getComponent('promptGenerator'));
        this.prWorkflow = new PRWorkflow(this.config.getComponent('prWorkflow'));
        this.statusUpdater = new StatusUpdater(this.config.getComponent('statusUpdater'));
        
        this.initialized = false;
        this.metrics = {
            tasksProcessed: 0,
            prsCreated: 0,
            errors: 0,
            successRate: 0,
            averageProcessingTime: 0,
            lastProcessedAt: null
        };
        
        log('info', 'Codegen Integration initialized', {
            mockMode: this.config.isMockEnabled(),
            components: ['client', 'taskAnalyzer', 'promptGenerator', 'prWorkflow', 'statusUpdater']
        });
    }

    /**
     * Initialize the integration
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            log('info', 'Initializing Codegen Integration...');
            
            // Initialize components in order
            await this.client.initialize();
            await this.taskAnalyzer.initialize();
            await this.promptGenerator.initialize();
            await this.prWorkflow.initialize();
            await this.statusUpdater.initialize();
            
            this.initialized = true;
            
            log('info', 'Codegen Integration initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize Codegen Integration', { error: error.message });
            throw error;
        }
    }

    /**
     * Process a natural language task and create a PR
     * @param {Object} task - Task data
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Processing result
     */
    async processTask(task, options = {}) {
        if (!this.initialized) {
            throw new Error('Codegen Integration not initialized');
        }

        const startTime = Date.now();
        const taskId = task.id || `task-${Date.now()}`;
        
        try {
            log('info', `Processing task ${taskId}`, { title: task.title });
            
            // Step 1: Analyze natural language task
            const analysis = await this.taskAnalyzer.analyzeTask(task.description, {
                context: options.context,
                language: options.language,
                framework: options.framework
            });
            
            log('debug', `Task analysis completed for ${taskId}`, {
                complexity: analysis.complexity.level,
                intent: analysis.intent.primary,
                estimatedHours: analysis.complexity.estimatedHours
            });
            
            // Step 2: Generate optimized prompt
            const prompt = await this.promptGenerator.generatePrompt(analysis, {
                includeContext: options.includeContext !== false,
                includeExamples: options.includeExamples || false,
                maxLength: options.maxPromptLength || 4000
            });
            
            log('debug', `Prompt generated for ${taskId}`, {
                length: prompt.content.length,
                templateUsed: prompt.metadata.template
            });
            
            // Step 3: Execute workflow to create PR
            const workflowResult = await this.prWorkflow.executeWorkflow({
                task,
                analysis,
                prompt,
                options
            });
            
            log('info', `PR created for task ${taskId}`, {
                prUrl: workflowResult.prUrl,
                prNumber: workflowResult.prNumber
            });
            
            // Step 4: Update status tracking
            await this.statusUpdater.updateStatus(taskId, 'completed', {
                prUrl: workflowResult.prUrl,
                prNumber: workflowResult.prNumber,
                processingTime: Date.now() - startTime
            });
            
            // Update metrics
            this._updateMetrics(taskId, startTime, true);
            
            return {
                success: true,
                taskId,
                analysis,
                prompt: {
                    content: prompt.content,
                    metadata: prompt.metadata
                },
                prUrl: workflowResult.prUrl,
                prNumber: workflowResult.prNumber,
                branch: workflowResult.branch,
                processingTime: Date.now() - startTime,
                metadata: {
                    complexity: analysis.complexity,
                    technologies: analysis.technologies,
                    estimatedEffort: analysis.complexity.estimatedHours
                }
            };
            
        } catch (error) {
            log('error', `Failed to process task ${taskId}`, { error: error.message });
            
            // Update status with error
            await this.statusUpdater.updateStatus(taskId, 'failed', {
                error: error.message,
                processingTime: Date.now() - startTime
            });
            
            // Update metrics
            this._updateMetrics(taskId, startTime, false);
            
            throw error;
        }
    }

    /**
     * Process multiple tasks in batch
     * @param {Array} tasks - Array of tasks
     * @param {Object} options - Batch processing options
     * @returns {Promise<Array>} Batch results
     */
    async processBatch(tasks, options = {}) {
        const { concurrent = 3, failFast = false } = options;
        const results = [];
        
        log('info', `Processing batch of ${tasks.length} tasks`, { concurrent, failFast });
        
        // Process tasks in chunks
        for (let i = 0; i < tasks.length; i += concurrent) {
            const chunk = tasks.slice(i, i + concurrent);
            const chunkPromises = chunk.map(task => 
                this.processTask(task, options).catch(error => ({
                    success: false,
                    taskId: task.id,
                    error: error.message
                }))
            );
            
            const chunkResults = await Promise.all(chunkPromises);
            results.push(...chunkResults);
            
            // Check for failures if failFast is enabled
            if (failFast && chunkResults.some(result => !result.success)) {
                const failedTask = chunkResults.find(result => !result.success);
                throw new Error(`Batch processing failed at task ${failedTask.taskId}: ${failedTask.error}`);
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        log('info', `Batch processing completed`, {
            total: tasks.length,
            successful: successCount,
            failed: tasks.length - successCount
        });
        
        return results;
    }

    /**
     * Get integration metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            initialized: this.initialized,
            config: this.config.getSummary()
        };
    }

    /**
     * Get integration status
     * @returns {Object} Status information
     */
    async getStatus() {
        const clientStatus = await this.client.getStatus();
        
        return {
            initialized: this.initialized,
            healthy: clientStatus.healthy,
            components: {
                client: clientStatus,
                taskAnalyzer: this.taskAnalyzer.getStatus(),
                promptGenerator: this.promptGenerator.getStatus(),
                prWorkflow: this.prWorkflow.getStatus(),
                statusUpdater: this.statusUpdater.getStatus()
            },
            metrics: this.metrics,
            config: this.config.getSummary()
        };
    }

    /**
     * Shutdown the integration
     * @returns {Promise<void>}
     */
    async shutdown() {
        try {
            log('info', 'Shutting down Codegen Integration...');
            
            await Promise.all([
                this.client.shutdown(),
                this.statusUpdater.shutdown(),
                this.prWorkflow.shutdown()
            ]);
            
            this.initialized = false;
            
            log('info', 'Codegen Integration shutdown completed');
        } catch (error) {
            log('error', 'Error during shutdown', { error: error.message });
            throw error;
        }
    }

    /**
     * Update processing metrics
     * @param {string} taskId - Task ID
     * @param {number} startTime - Start time
     * @param {boolean} success - Success status
     * @private
     */
    _updateMetrics(taskId, startTime, success) {
        const processingTime = Date.now() - startTime;
        
        this.metrics.tasksProcessed++;
        
        if (success) {
            this.metrics.prsCreated++;
        } else {
            this.metrics.errors++;
        }
        
        this.metrics.successRate = this.metrics.prsCreated / this.metrics.tasksProcessed;
        
        // Update average processing time
        const totalTime = this.metrics.averageProcessingTime * (this.metrics.tasksProcessed - 1) + processingTime;
        this.metrics.averageProcessingTime = totalTime / this.metrics.tasksProcessed;
        
        this.metrics.lastProcessedAt = new Date().toISOString();
    }
}

// Export individual components for advanced usage
export {
    CodegenClient,
    TaskAnalyzer,
    PromptGenerator,
    PRWorkflow,
    StatusUpdater,
    CodegenConfig
};

// Export default integration
export default CodegenIntegration;

