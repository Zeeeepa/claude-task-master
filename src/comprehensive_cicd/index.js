/**
 * @fileoverview Comprehensive CI/CD System Integration
 * @description Main orchestrator that integrates all foundation components (PRs #13-17)
 * into a unified AI-driven development pipeline
 */

import { v4 as uuidv4 } from 'uuid';
import { analyzeRequirement } from '../requirement_analyzer/index.js';
import { createCompleteIntegration } from '../codegen_integration/index.js';
import { validatePR } from '../claude_code_validator/index.js';
import { WorkflowOrchestrator } from '../workflow_orchestrator/index.js';
import { 
    initialize_database, 
    store_atomic_task, 
    get_task_full_context,
    store_validation_results 
} from '../task_storage/index.js';

/**
 * Comprehensive CI/CD System
 * Integrates all foundation components into a unified pipeline
 */
export class ComprehensiveCICD {
    constructor(options = {}) {
        this.config = {
            // Database configuration
            database: {
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 5432,
                database: process.env.DB_NAME || 'codegen-taskmaster-db',
                username: process.env.DB_USER || 'software_developer',
                password: process.env.DB_PASSWORD || 'password'
            },
            
            // Codegen API configuration
            codegen: {
                org_id: process.env.CODEGEN_ORG_ID || '323',
                api_key: process.env.CODEGEN_API_KEY || 'sk-ce027fa7-3c8d-4beb-8c86-ed8ae982ac99'
            },
            
            // AgentAPI configuration
            agentapi: {
                url: process.env.AGENTAPI_URL || 'http://localhost:8000',
                claude_code_path: process.env.CLAUDE_CODE_PATH || '/usr/local/bin/claude'
            },
            
            // WSL2 configuration
            wsl2: {
                distro: process.env.WSL2_DISTRO || 'Ubuntu-22.04',
                base_path: process.env.WSL2_BASE_PATH || '/mnt/c/projects',
                max_instances: parseInt(process.env.MAX_WSL2_INSTANCES) || 5
            },
            
            // System configuration
            system: {
                max_concurrent_tasks: parseInt(process.env.MAX_CONCURRENT_TASKS) || 10,
                validation_timeout: parseInt(process.env.VALIDATION_TIMEOUT) || 300000,
                max_iterations: options.max_iterations || 3,
                enable_cyclical_improvement: options.enable_cyclical_improvement !== false
            },
            
            ...options
        };
        
        // Initialize components
        this.orchestrator = new WorkflowOrchestrator(this.config);
        this.codegenIntegration = null;
        this.activeWorkflows = new Map();
        this.systemMetrics = {
            total_requirements_processed: 0,
            total_tasks_generated: 0,
            total_prs_created: 0,
            total_validations_completed: 0,
            success_rate: 0,
            average_completion_time: 0
        };
        
        this._initializeSystem();
    }

    /**
     * Process a natural language requirement through the complete CI/CD pipeline
     * @param {string} requirementText - Natural language requirement
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Complete processing results
     */
    async processRequirement(requirementText, options = {}) {
        const startTime = Date.now();
        const workflowId = uuidv4();
        
        console.log(`🚀 Starting comprehensive CI/CD processing for workflow ${workflowId}`);
        
        try {
            // Initialize workflow tracking
            const workflow = {
                id: workflowId,
                requirement_text: requirementText,
                options: options,
                start_time: startTime,
                status: 'processing',
                phases: {
                    analysis: { status: 'pending' },
                    task_generation: { status: 'pending' },
                    code_generation: { status: 'pending' },
                    validation: { status: 'pending' },
                    improvement: { status: 'pending' }
                },
                results: {
                    tasks: [],
                    prs: [],
                    validations: [],
                    iterations: []
                }
            };
            
            this.activeWorkflows.set(workflowId, workflow);
            
            // Phase 1: Requirements Analysis & Task Generation
            console.log('📋 Phase 1: Requirements Analysis & Task Generation');
            workflow.phases.analysis.status = 'running';
            
            const analysisResult = await this._analyzeRequirements(requirementText, options);
            workflow.results.analysis = analysisResult;
            workflow.phases.analysis.status = 'completed';
            workflow.phases.analysis.duration = Date.now() - startTime;
            
            // Phase 2: Task Storage & Context Preservation
            console.log('💾 Phase 2: Task Storage & Context Preservation');
            workflow.phases.task_generation.status = 'running';
            
            const storedTasks = await this._storeTasksWithContext(analysisResult.tasks, options);
            workflow.results.tasks = storedTasks;
            workflow.phases.task_generation.status = 'completed';
            workflow.phases.task_generation.duration = Date.now() - startTime - workflow.phases.analysis.duration;
            
            // Phase 3: Code Generation & PR Creation
            console.log('⚡ Phase 3: Code Generation & PR Creation');
            workflow.phases.code_generation.status = 'running';
            
            const codegenResults = await this._generateCodeAndPRs(storedTasks, options);
            workflow.results.prs = codegenResults;
            workflow.phases.code_generation.status = 'completed';
            workflow.phases.code_generation.duration = Date.now() - startTime - 
                workflow.phases.analysis.duration - workflow.phases.task_generation.duration;
            
            // Phase 4: Validation & Quality Assurance
            console.log('🔍 Phase 4: Validation & Quality Assurance');
            workflow.phases.validation.status = 'running';
            
            const validationResults = await this._validatePRsWithClaudeCode(codegenResults, storedTasks, options);
            workflow.results.validations = validationResults;
            workflow.phases.validation.status = 'completed';
            workflow.phases.validation.duration = Date.now() - startTime - 
                workflow.phases.analysis.duration - workflow.phases.task_generation.duration - 
                workflow.phases.code_generation.duration;
            
            // Phase 5: Cyclical Improvement (if enabled and needed)
            if (this.config.system.enable_cyclical_improvement && options.enable_cyclical_improvement !== false) {
                console.log('🔄 Phase 5: Cyclical Improvement');
                workflow.phases.improvement.status = 'running';
                
                const improvementResults = await this._performCyclicalImprovement(
                    workflow, validationResults, options
                );
                workflow.results.iterations = improvementResults;
                workflow.phases.improvement.status = 'completed';
                workflow.phases.improvement.duration = Date.now() - startTime - 
                    workflow.phases.analysis.duration - workflow.phases.task_generation.duration - 
                    workflow.phases.code_generation.duration - workflow.phases.validation.duration;
            }
            
            // Finalize workflow
            const totalDuration = Date.now() - startTime;
            workflow.status = 'completed';
            workflow.total_duration = totalDuration;
            
            // Update system metrics
            await this._updateSystemMetrics(workflow);
            
            console.log(`✅ Comprehensive CI/CD processing completed in ${totalDuration}ms`);
            
            return {
                workflow_id: workflowId,
                status: 'completed',
                total_duration_ms: totalDuration,
                phases: workflow.phases,
                results: workflow.results,
                summary: {
                    requirements_analyzed: 1,
                    tasks_generated: workflow.results.tasks.length,
                    prs_created: workflow.results.prs.length,
                    validations_completed: workflow.results.validations.length,
                    iterations_performed: workflow.results.iterations.length,
                    overall_success_rate: this._calculateSuccessRate(workflow.results.validations)
                }
            };
            
        } catch (error) {
            console.error(`❌ Comprehensive CI/CD processing failed:`, error);
            
            const workflow = this.activeWorkflows.get(workflowId);
            if (workflow) {
                workflow.status = 'failed';
                workflow.error = error.message;
                workflow.total_duration = Date.now() - startTime;
            }
            
            throw error;
        } finally {
            // Cleanup workflow tracking
            setTimeout(() => {
                this.activeWorkflows.delete(workflowId);
            }, 300000); // Keep for 5 minutes for debugging
        }
    }

    /**
     * Get system metrics and performance analytics
     * @returns {Promise<Object>} System metrics
     */
    async getSystemMetrics() {
        const activeWorkflowCount = this.activeWorkflows.size;
        const wsl2Status = await this._getWSL2Status();
        const databaseMetrics = await this._getDatabaseMetrics();
        
        return {
            system_status: 'operational',
            active_workflows: activeWorkflowCount,
            wsl2_instances: wsl2Status,
            database: databaseMetrics,
            performance: this.systemMetrics,
            uptime_ms: process.uptime() * 1000,
            memory_usage: process.memoryUsage(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get performance analytics with trends
     * @param {Object} options - Analytics options
     * @returns {Promise<Object>} Performance analytics
     */
    async getPerformanceAnalytics(options = {}) {
        const dateRange = options.date_range || '7d';
        const includeTrends = options.include_trends !== false;
        
        // Mock implementation - in production, this would query historical data
        return {
            date_range: dateRange,
            total_requirements: this.systemMetrics.total_requirements_processed,
            success_rate: this.systemMetrics.success_rate,
            average_completion_time: this.systemMetrics.average_completion_time,
            bottlenecks: [
                'WSL2 instance allocation',
                'Claude Code validation timeout',
                'Database connection pool exhaustion'
            ],
            suggestions: [
                'Increase WSL2 instance pool size',
                'Optimize validation timeout settings',
                'Scale database connection pool'
            ],
            trends: includeTrends ? {
                success_rate_trend: '+5.2%',
                completion_time_trend: '-12.3%',
                throughput_trend: '+18.7%'
            } : null
        };
    }

    /**
     * Configure multiple projects with different settings
     * @param {Object} projectConfigs - Project configurations
     */
    async configureProjects(projectConfigs) {
        for (const [projectId, config] of Object.entries(projectConfigs)) {
            console.log(`🔧 Configuring project: ${projectId}`);
            
            // Setup WSL2 instance for project
            await this._setupProjectWSL2Instance(projectId, config);
            
            // Configure project-specific validation rules
            if (config.validation_criteria) {
                await this._setProjectValidationCriteria(projectId, config.validation_criteria);
            }
            
            console.log(`✅ Project ${projectId} configured successfully`);
        }
    }

    /**
     * Set custom validation criteria for a project
     * @param {string} projectId - Project identifier
     * @param {Object} criteria - Validation criteria
     */
    async setValidationCriteria(projectId, criteria) {
        await this._setProjectValidationCriteria(projectId, criteria);
        console.log(`✅ Validation criteria updated for project ${projectId}`);
    }

    // Private methods

    /**
     * Initialize the comprehensive CI/CD system
     * @private
     */
    async _initializeSystem() {
        try {
            console.log('🔧 Initializing Comprehensive CI/CD System...');
            
            // Initialize database
            await initialize_database();
            console.log('✅ Database initialized');
            
            // Initialize Codegen integration
            this.codegenIntegration = createCompleteIntegration({
                codegenClient: {
                    apiKey: this.config.codegen.api_key,
                    orgId: this.config.codegen.org_id
                },
                enableTracking: true,
                maxRetries: 3
            });
            console.log('✅ Codegen integration initialized');
            
            // Initialize WSL2 management
            await this._initializeWSL2Management();
            console.log('✅ WSL2 management initialized');
            
            console.log('🚀 Comprehensive CI/CD System ready!');
            
        } catch (error) {
            console.error('❌ Failed to initialize Comprehensive CI/CD System:', error);
            throw error;
        }
    }

    /**
     * Analyze requirements using NLP engine
     * @param {string} requirementText - Natural language requirement
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} Analysis results
     * @private
     */
    async _analyzeRequirements(requirementText, options) {
        const analysisOptions = {
            enableDependencyAnalysis: true,
            enableComplexityEstimation: true,
            maxTasksPerRequirement: options.max_tasks || 15,
            enableSubtaskGeneration: true
        };
        
        const result = await analyzeRequirement(requirementText, analysisOptions);
        
        console.log(`📊 Analysis completed: ${result.summary.totalTasks} tasks generated`);
        console.log(`📈 Average complexity: ${result.summary.averageComplexity.toFixed(2)}`);
        console.log(`🔗 Dependencies: ${result.summary.dependencyCount}`);
        
        return result;
    }

    /**
     * Store tasks with comprehensive context
     * @param {Array} tasks - Analyzed tasks
     * @param {Object} options - Storage options
     * @returns {Promise<Array>} Stored tasks with IDs
     * @private
     */
    async _storeTasksWithContext(tasks, options) {
        const storedTasks = [];
        
        for (const task of tasks) {
            try {
                const taskId = await store_atomic_task({
                    ...task,
                    project_id: options.project_id,
                    created_by: 'comprehensive-cicd',
                    metadata: {
                        ...task.metadata,
                        workflow_options: options,
                        processing_timestamp: new Date().toISOString()
                    }
                });
                
                storedTasks.push({
                    ...task,
                    id: taskId
                });
                
                console.log(`💾 Stored task: ${task.title} (ID: ${taskId})`);
                
            } catch (error) {
                console.error(`❌ Failed to store task: ${task.title}`, error);
                throw error;
            }
        }
        
        return storedTasks;
    }

    /**
     * Generate code and create PRs using Codegen integration
     * @param {Array} tasks - Stored tasks
     * @param {Object} options - Generation options
     * @returns {Promise<Array>} PR creation results
     * @private
     */
    async _generateCodeAndPRs(tasks, options) {
        const prResults = [];
        
        for (const task of tasks) {
            try {
                console.log(`⚡ Generating code for task: ${task.title}`);
                
                // Get full context for prompt generation
                const context = await get_task_full_context(task.id);
                
                // Process task through Codegen integration
                const result = await this.codegenIntegration.processTask(task, context);
                
                prResults.push({
                    task_id: task.id,
                    task_title: task.title,
                    pr_info: result.pr_info,
                    workflow_id: result.workflow_id,
                    status: result.status,
                    created_at: new Date().toISOString()
                });
                
                console.log(`✅ PR created for task: ${task.title} - ${result.pr_info?.pr_url}`);
                
            } catch (error) {
                console.error(`❌ Failed to generate code for task: ${task.title}`, error);
                
                prResults.push({
                    task_id: task.id,
                    task_title: task.title,
                    status: 'failed',
                    error: error.message,
                    created_at: new Date().toISOString()
                });
            }
        }
        
        return prResults;
    }

    /**
     * Validate PRs using Claude Code via AgentAPI
     * @param {Array} prResults - PR creation results
     * @param {Array} tasks - Original tasks
     * @param {Object} options - Validation options
     * @returns {Promise<Array>} Validation results
     * @private
     */
    async _validatePRsWithClaudeCode(prResults, tasks, options) {
        const validationResults = [];
        
        for (const prResult of prResults) {
            if (prResult.status !== 'completed' || !prResult.pr_info) {
                console.log(`⏭️ Skipping validation for failed PR: ${prResult.task_title}`);
                continue;
            }
            
            try {
                console.log(`🔍 Validating PR: ${prResult.pr_info.pr_url}`);
                
                // Find corresponding task
                const task = tasks.find(t => t.id === prResult.task_id);
                if (!task) {
                    throw new Error(`Task not found for PR: ${prResult.task_id}`);
                }
                
                // Prepare validation context
                const validationContext = {
                    task_id: task.id,
                    title: task.title,
                    requirements: task.requirements,
                    acceptance_criteria: task.acceptance_criteria,
                    complexity_score: task.complexity_score
                };
                
                // Validate using Claude Code
                const validationResult = await validatePR(
                    prResult.pr_info,
                    validationContext,
                    {
                        agentapi_url: this.config.agentapi.url,
                        enable_wsl2_deployment: true,
                        wsl2_distro: this.config.wsl2.distro,
                        validation_timeout: this.config.system.validation_timeout
                    }
                );
                
                // Store validation results
                await store_validation_results(task.id, validationResult);
                
                validationResults.push({
                    task_id: task.id,
                    pr_url: prResult.pr_info.pr_url,
                    validation_result: validationResult,
                    validated_at: new Date().toISOString()
                });
                
                console.log(`✅ Validation completed: ${validationResult.status} (Score: ${validationResult.score.overall_score})`);
                
            } catch (error) {
                console.error(`❌ Validation failed for PR: ${prResult.pr_info?.pr_url}`, error);
                
                validationResults.push({
                    task_id: prResult.task_id,
                    pr_url: prResult.pr_info?.pr_url,
                    status: 'error',
                    error: error.message,
                    validated_at: new Date().toISOString()
                });
            }
        }
        
        return validationResults;
    }

    /**
     * Perform cyclical improvement for failed validations
     * @param {Object} workflow - Workflow context
     * @param {Array} validationResults - Validation results
     * @param {Object} options - Improvement options
     * @returns {Promise<Array>} Improvement iterations
     * @private
     */
    async _performCyclicalImprovement(workflow, validationResults, options) {
        const iterations = [];
        const maxIterations = options.max_iterations || this.config.system.max_iterations;
        const improvementThreshold = options.improvement_threshold || 85;
        
        // Find validations that need improvement
        const needsImprovement = validationResults.filter(v => 
            v.validation_result && 
            v.validation_result.score.overall_score < improvementThreshold
        );
        
        if (needsImprovement.length === 0) {
            console.log('🎉 All validations passed threshold - no improvement needed');
            return iterations;
        }
        
        console.log(`🔄 Starting cyclical improvement for ${needsImprovement.length} validations`);
        
        for (let iteration = 1; iteration <= maxIterations; iteration++) {
            console.log(`🔄 Improvement iteration ${iteration}/${maxIterations}`);
            
            const iterationResults = [];
            
            for (const validation of needsImprovement) {
                try {
                    // Enhance context with validation feedback
                    const enhancedContext = await this._enhanceContextWithFeedback(
                        validation.task_id,
                        validation.validation_result
                    );
                    
                    // Regenerate code with improved prompt
                    const improvedResult = await this.codegenIntegration.processTask(
                        { id: validation.task_id },
                        enhancedContext
                    );
                    
                    // Re-validate improved code
                    const revalidationResult = await validatePR(
                        improvedResult.pr_info,
                        enhancedContext,
                        {
                            agentapi_url: this.config.agentapi.url,
                            enable_wsl2_deployment: true
                        }
                    );
                    
                    iterationResults.push({
                        task_id: validation.task_id,
                        iteration: iteration,
                        previous_score: validation.validation_result.score.overall_score,
                        new_score: revalidationResult.score.overall_score,
                        improvement: revalidationResult.score.overall_score - validation.validation_result.score.overall_score,
                        status: revalidationResult.status,
                        pr_url: improvedResult.pr_info.pr_url
                    });
                    
                    console.log(`📈 Task ${validation.task_id}: ${validation.validation_result.score.overall_score} → ${revalidationResult.score.overall_score}`);
                    
                } catch (error) {
                    console.error(`❌ Improvement failed for task ${validation.task_id}:`, error);
                    
                    iterationResults.push({
                        task_id: validation.task_id,
                        iteration: iteration,
                        status: 'error',
                        error: error.message
                    });
                }
            }
            
            iterations.push({
                iteration: iteration,
                results: iterationResults,
                timestamp: new Date().toISOString()
            });
            
            // Check if improvement threshold is met
            const successfulImprovements = iterationResults.filter(r => 
                r.new_score && r.new_score >= improvementThreshold
            );
            
            if (successfulImprovements.length === needsImprovement.length) {
                console.log(`🎉 All validations improved to threshold in ${iteration} iterations`);
                break;
            }
        }
        
        return iterations;
    }

    /**
     * Enhance task context with validation feedback
     * @param {string} taskId - Task identifier
     * @param {Object} validationResult - Validation result with feedback
     * @returns {Promise<Object>} Enhanced context
     * @private
     */
    async _enhanceContextWithFeedback(taskId, validationResult) {
        const originalContext = await get_task_full_context(taskId);
        
        // Extract improvement suggestions from validation feedback
        const improvements = validationResult.feedback
            .filter(f => f.type === 'warning' || f.type === 'error')
            .map(f => f.suggestions)
            .flat();
        
        const enhancedContext = {
            ...originalContext,
            validation_feedback: {
                previous_score: validationResult.score.overall_score,
                main_issues: validationResult.feedback.map(f => f.message),
                improvement_suggestions: improvements,
                focus_areas: validationResult.score.weaknesses || []
            },
            prompt_enhancements: {
                emphasis: 'Address the following validation issues',
                specific_requirements: improvements,
                quality_targets: {
                    code_quality: Math.max(85, validationResult.score.code_quality_score + 10),
                    functionality: Math.max(85, validationResult.score.functionality_score + 10),
                    testing: Math.max(85, validationResult.score.testing_score + 10)
                }
            }
        };
        
        return enhancedContext;
    }

    /**
     * Calculate success rate from validation results
     * @param {Array} validationResults - Validation results
     * @returns {number} Success rate percentage
     * @private
     */
    _calculateSuccessRate(validationResults) {
        if (validationResults.length === 0) return 0;
        
        const successful = validationResults.filter(v => 
            v.validation_result && v.validation_result.status === 'passed'
        ).length;
        
        return (successful / validationResults.length) * 100;
    }

    /**
     * Update system metrics
     * @param {Object} workflow - Completed workflow
     * @private
     */
    async _updateSystemMetrics(workflow) {
        this.systemMetrics.total_requirements_processed++;
        this.systemMetrics.total_tasks_generated += workflow.results.tasks.length;
        this.systemMetrics.total_prs_created += workflow.results.prs.length;
        this.systemMetrics.total_validations_completed += workflow.results.validations.length;
        
        // Update success rate
        const totalValidations = this.systemMetrics.total_validations_completed;
        if (totalValidations > 0) {
            const currentSuccessRate = this._calculateSuccessRate(workflow.results.validations);
            this.systemMetrics.success_rate = (
                (this.systemMetrics.success_rate * (totalValidations - workflow.results.validations.length)) +
                (currentSuccessRate * workflow.results.validations.length)
            ) / totalValidations;
        }
        
        // Update average completion time
        const totalRequirements = this.systemMetrics.total_requirements_processed;
        this.systemMetrics.average_completion_time = (
            (this.systemMetrics.average_completion_time * (totalRequirements - 1)) +
            workflow.total_duration
        ) / totalRequirements;
    }

    /**
     * Initialize WSL2 management
     * @private
     */
    async _initializeWSL2Management() {
        // Mock implementation - in production, this would setup WSL2 instances
        console.log('🔧 Setting up WSL2 instance management...');
        
        // Check WSL2 availability
        // Setup instance pool
        // Configure networking
        // Initialize monitoring
    }

    /**
     * Get WSL2 status
     * @returns {Promise<Object>} WSL2 status
     * @private
     */
    async _getWSL2Status() {
        // Mock implementation
        return {
            total: this.config.wsl2.max_instances,
            active: 2,
            available: this.config.wsl2.max_instances - 2,
            distro: this.config.wsl2.distro
        };
    }

    /**
     * Get database metrics
     * @returns {Promise<Object>} Database metrics
     * @private
     */
    async _getDatabaseMetrics() {
        // Mock implementation
        return {
            status: 'connected',
            active_connections: 5,
            max_connections: 20,
            query_performance: 'optimal'
        };
    }

    /**
     * Setup WSL2 instance for project
     * @param {string} projectId - Project identifier
     * @param {Object} config - Project configuration
     * @private
     */
    async _setupProjectWSL2Instance(projectId, config) {
        // Mock implementation
        console.log(`🔧 Setting up WSL2 instance for project ${projectId}`);
    }

    /**
     * Set project validation criteria
     * @param {string} projectId - Project identifier
     * @param {Object} criteria - Validation criteria
     * @private
     */
    async _setProjectValidationCriteria(projectId, criteria) {
        // Mock implementation
        console.log(`🔧 Setting validation criteria for project ${projectId}`);
    }
}

/**
 * Factory function to create a comprehensive CI/CD instance
 * @param {Object} options - Configuration options
 * @returns {ComprehensiveCICD} Configured CI/CD instance
 */
export function createComprehensiveCICD(options = {}) {
    return new ComprehensiveCICD(options);
}

/**
 * Process a requirement using the comprehensive CI/CD system
 * @param {string} requirementText - Natural language requirement
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing results
 */
export async function processRequirement(requirementText, options = {}) {
    const cicd = createComprehensiveCICD(options);
    return await cicd.processRequirement(requirementText, options);
}

/**
 * Health check for the comprehensive CI/CD system
 * @returns {Promise<Object>} System health status
 */
export async function healthCheck() {
    try {
        const cicd = createComprehensiveCICD();
        const metrics = await cicd.getSystemMetrics();
        
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            components: {
                database: metrics.database.status === 'connected',
                wsl2: metrics.wsl2_instances.active >= 0,
                codegen: true, // Would check API connectivity
                agentapi: true // Would check AgentAPI connectivity
            },
            metrics: metrics
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// Export all components for individual use
export {
    analyzeRequirement,
    createCompleteIntegration,
    validatePR,
    WorkflowOrchestrator
};

