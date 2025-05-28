/**
 * @fileoverview Comprehensive Validation Pipeline
 * @description Multi-stage validation pipeline with parallel execution and error context generation
 */

import { log } from '../../../scripts/modules/utils.js';
import { SyntaxValidator } from './syntax_validator.js';
import { TestRunner } from './test_runner.js';
import { SecurityScanner } from './security_scanner.js';
import { PerformanceAnalyzer } from './performance_analyzer.js';

/**
 * Validation stages enumeration
 */
export const ValidationStages = {
    SYNTAX_CHECK: 'syntax_check',
    LINTING: 'linting',
    UNIT_TESTS: 'unit_tests',
    INTEGRATION_TESTS: 'integration_tests',
    SECURITY_SCAN: 'security_scan',
    PERFORMANCE_TEST: 'performance_test',
    DEPENDENCY_CHECK: 'dependency_check',
    CODE_QUALITY: 'code_quality'
};

/**
 * Comprehensive Validation Pipeline with parallel execution and error aggregation
 */
export class ValidationPipeline {
    constructor(config = {}) {
        this.config = {
            enable_parallel_execution: config.enable_parallel_execution !== false,
            max_parallel_stages: config.max_parallel_stages || 4,
            stage_timeout: config.stage_timeout || 300000, // 5 minutes per stage
            enable_early_termination: config.enable_early_termination !== false,
            critical_failure_threshold: config.critical_failure_threshold || 3,
            enable_detailed_reporting: config.enable_detailed_reporting !== false,
            enable_error_context_generation: config.enable_error_context_generation !== false,
            ...config
        };

        // Initialize validators
        this.syntaxValidator = new SyntaxValidator(this.config);
        this.testRunner = new TestRunner(this.config);
        this.securityScanner = new SecurityScanner(this.config);
        this.performanceAnalyzer = new PerformanceAnalyzer(this.config);

        // Stage execution tracking
        this.stageResults = new Map();
        this.executionMetrics = {
            total_stages: 0,
            completed_stages: 0,
            failed_stages: 0,
            skipped_stages: 0,
            total_duration: 0
        };
    }

    /**
     * Initialize the validation pipeline
     * @returns {Promise<void>}
     */
    async initialize() {
        log('debug', 'Initializing Validation Pipeline...');
        
        // Initialize all validators
        await Promise.all([
            this.syntaxValidator.initialize(),
            this.testRunner.initialize(),
            this.securityScanner.initialize(),
            this.performanceAnalyzer.initialize()
        ]);
        
        log('debug', 'Validation Pipeline initialized');
    }

    /**
     * Run comprehensive validation pipeline
     * @param {Object} workspace - Workspace information
     * @param {Object} prData - PR data
     * @param {Object} taskContext - Task context
     * @param {Object} secureEnvironment - Secure environment (optional)
     * @returns {Promise<Object>} Comprehensive validation result
     */
    async runValidation(workspace, prData, taskContext, secureEnvironment = null) {
        const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        log('info', `Starting validation pipeline ${pipelineId} for PR #${prData.number || prData.id}`);
        
        try {
            // Reset stage results
            this.stageResults.clear();
            
            // Define validation stages with dependencies
            const stageDefinitions = this.defineValidationStages(workspace, prData, taskContext, secureEnvironment);
            
            // Execute validation stages
            const stageResults = await this.executeValidationStages(stageDefinitions, pipelineId);
            
            // Aggregate results
            const aggregatedResult = await this.aggregateResults(stageResults, pipelineId);
            
            // Generate error contexts for Codegen
            const errorContexts = await this.generateErrorContexts(stageResults, prData, taskContext);
            
            // Calculate overall metrics
            const overallMetrics = this.calculateOverallMetrics(stageResults, Date.now() - startTime);
            
            const finalResult = {
                pipeline_id: pipelineId,
                overall_status: aggregatedResult.overall_status,
                overall_score: aggregatedResult.overall_score,
                grade: aggregatedResult.grade,
                stages: stageResults,
                error_contexts: errorContexts,
                recommendations: aggregatedResult.recommendations,
                suggestions: aggregatedResult.suggestions,
                quality_gates: aggregatedResult.quality_gates,
                security_findings: aggregatedResult.security_findings,
                performance_metrics: overallMetrics,
                stage_durations: this.extractStageDurations(stageResults),
                files_analyzed: aggregatedResult.files_analyzed,
                lines_of_code: aggregatedResult.lines_of_code,
                memory_usage_mb: aggregatedResult.memory_usage_mb,
                cpu_usage_percent: aggregatedResult.cpu_usage_percent,
                workspace_path: workspace.path,
                completed_at: new Date()
            };
            
            log('info', `Validation pipeline ${pipelineId} completed with status: ${finalResult.overall_status}`);
            return finalResult;
            
        } catch (error) {
            log('error', `Validation pipeline ${pipelineId} failed: ${error.message}`);
            
            // Generate error context even for pipeline failures
            const errorContext = await this.generatePipelineErrorContext(error, prData, taskContext, pipelineId);
            
            return {
                pipeline_id: pipelineId,
                overall_status: 'error',
                overall_score: 0,
                grade: 'F',
                error: error.message,
                error_context: errorContext,
                stages: Object.fromEntries(this.stageResults),
                completed_at: new Date(),
                duration_ms: Date.now() - startTime
            };
        }
    }

    /**
     * Define validation stages with their configurations
     * @param {Object} workspace - Workspace information
     * @param {Object} prData - PR data
     * @param {Object} taskContext - Task context
     * @param {Object} secureEnvironment - Secure environment
     * @returns {Array} Array of stage definitions
     */
    defineValidationStages(workspace, prData, taskContext, secureEnvironment) {
        return [
            {
                name: ValidationStages.SYNTAX_CHECK,
                validator: this.syntaxValidator,
                method: 'validateSyntax',
                parallel: true,
                critical: true,
                timeout: this.config.stage_timeout,
                dependencies: [],
                config: {
                    workspace,
                    prData,
                    taskContext,
                    secureEnvironment
                }
            },
            {
                name: ValidationStages.LINTING,
                validator: this.syntaxValidator,
                method: 'runLinting',
                parallel: true,
                critical: false,
                timeout: this.config.stage_timeout,
                dependencies: [ValidationStages.SYNTAX_CHECK],
                config: {
                    workspace,
                    prData,
                    taskContext,
                    secureEnvironment
                }
            },
            {
                name: ValidationStages.DEPENDENCY_CHECK,
                validator: this.syntaxValidator,
                method: 'checkDependencies',
                parallel: true,
                critical: true,
                timeout: this.config.stage_timeout,
                dependencies: [],
                config: {
                    workspace,
                    prData,
                    taskContext,
                    secureEnvironment
                }
            },
            {
                name: ValidationStages.UNIT_TESTS,
                validator: this.testRunner,
                method: 'runUnitTests',
                parallel: true,
                critical: true,
                timeout: this.config.stage_timeout * 2, // Tests may take longer
                dependencies: [ValidationStages.SYNTAX_CHECK, ValidationStages.DEPENDENCY_CHECK],
                config: {
                    workspace,
                    prData,
                    taskContext,
                    secureEnvironment
                }
            },
            {
                name: ValidationStages.INTEGRATION_TESTS,
                validator: this.testRunner,
                method: 'runIntegrationTests',
                parallel: false, // Integration tests should run after unit tests
                critical: false,
                timeout: this.config.stage_timeout * 3, // Integration tests take longer
                dependencies: [ValidationStages.UNIT_TESTS],
                config: {
                    workspace,
                    prData,
                    taskContext,
                    secureEnvironment
                }
            },
            {
                name: ValidationStages.SECURITY_SCAN,
                validator: this.securityScanner,
                method: 'scanSecurity',
                parallel: true,
                critical: true,
                timeout: this.config.stage_timeout,
                dependencies: [ValidationStages.SYNTAX_CHECK],
                config: {
                    workspace,
                    prData,
                    taskContext,
                    secureEnvironment
                }
            },
            {
                name: ValidationStages.PERFORMANCE_TEST,
                validator: this.performanceAnalyzer,
                method: 'analyzePerformance',
                parallel: false, // Performance tests should run after other tests
                critical: false,
                timeout: this.config.stage_timeout * 2,
                dependencies: [ValidationStages.UNIT_TESTS],
                config: {
                    workspace,
                    prData,
                    taskContext,
                    secureEnvironment
                }
            },
            {
                name: ValidationStages.CODE_QUALITY,
                validator: this.syntaxValidator,
                method: 'analyzeCodeQuality',
                parallel: true,
                critical: false,
                timeout: this.config.stage_timeout,
                dependencies: [ValidationStages.SYNTAX_CHECK],
                config: {
                    workspace,
                    prData,
                    taskContext,
                    secureEnvironment
                }
            }
        ];
    }

    /**
     * Execute validation stages with dependency management and parallel execution
     * @param {Array} stageDefinitions - Stage definitions
     * @param {string} pipelineId - Pipeline ID
     * @returns {Promise<Object>} Stage execution results
     */
    async executeValidationStages(stageDefinitions, pipelineId) {
        const results = {};
        const executed = new Set();
        const executing = new Set();
        const failed = new Set();
        
        // Create dependency graph
        const dependencyGraph = new Map();
        for (const stage of stageDefinitions) {
            dependencyGraph.set(stage.name, stage);
        }
        
        // Execute stages respecting dependencies
        const executeStage = async (stageName) => {
            if (executed.has(stageName) || executing.has(stageName)) {
                return;
            }
            
            const stageDefinition = dependencyGraph.get(stageName);
            if (!stageDefinition) {
                throw new Error(`Stage definition not found: ${stageName}`);
            }
            
            // Check if dependencies are satisfied
            for (const dependency of stageDefinition.dependencies) {
                if (!executed.has(dependency)) {
                    if (failed.has(dependency) && stageDefinition.critical) {
                        // Skip critical stage if critical dependency failed
                        log('warning', `Skipping critical stage ${stageName} due to failed dependency ${dependency}`);
                        results[stageName] = this.createSkippedStageResult(stageName, `Dependency ${dependency} failed`);
                        this.executionMetrics.skipped_stages++;
                        return;
                    }
                    
                    // Wait for dependency
                    await executeStage(dependency);
                }
            }
            
            executing.add(stageName);
            
            try {
                log('debug', `Executing validation stage: ${stageName}`);
                const stageResult = await this.executeStage(stageDefinition, pipelineId);
                
                results[stageName] = stageResult;
                executed.add(stageName);
                executing.delete(stageName);
                
                if (stageResult.status === 'failed') {
                    failed.add(stageName);
                    this.executionMetrics.failed_stages++;
                    
                    // Check for early termination
                    if (this.config.enable_early_termination && 
                        failed.size >= this.config.critical_failure_threshold) {
                        log('warning', `Early termination triggered: ${failed.size} critical failures`);
                        throw new Error('Critical failure threshold exceeded');
                    }
                } else {
                    this.executionMetrics.completed_stages++;
                }
                
            } catch (error) {
                log('error', `Stage ${stageName} execution failed: ${error.message}`);
                
                results[stageName] = this.createFailedStageResult(stageName, error);
                failed.add(stageName);
                executed.add(stageName);
                executing.delete(stageName);
                this.executionMetrics.failed_stages++;
                
                if (stageDefinition.critical) {
                    throw error;
                }
            }
        };
        
        // Execute stages
        if (this.config.enable_parallel_execution) {
            // Parallel execution with dependency management
            const parallelStages = stageDefinitions.filter(stage => stage.parallel);
            const sequentialStages = stageDefinitions.filter(stage => !stage.parallel);
            
            // Execute parallel stages first
            const parallelPromises = parallelStages.map(stage => executeStage(stage.name));
            await Promise.allSettled(parallelPromises);
            
            // Execute sequential stages
            for (const stage of sequentialStages) {
                await executeStage(stage.name);
            }
        } else {
            // Sequential execution
            for (const stage of stageDefinitions) {
                await executeStage(stage.name);
            }
        }
        
        this.executionMetrics.total_stages = stageDefinitions.length;
        
        return results;
    }

    /**
     * Execute a single validation stage
     * @param {Object} stageDefinition - Stage definition
     * @param {string} pipelineId - Pipeline ID
     * @returns {Promise<Object>} Stage execution result
     */
    async executeStage(stageDefinition, pipelineId) {
        const { name, validator, method, timeout, config } = stageDefinition;
        const startTime = Date.now();
        
        try {
            // Execute stage with timeout
            const result = await Promise.race([
                validator[method](config),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`Stage ${name} timed out after ${timeout}ms`)), timeout)
                )
            ]);
            
            const duration = Date.now() - startTime;
            
            return {
                stage: name,
                status: 'completed',
                result: result,
                duration_ms: duration,
                started_at: new Date(startTime),
                completed_at: new Date(),
                pipeline_id: pipelineId
            };
            
        } catch (error) {
            const duration = Date.now() - startTime;
            
            return {
                stage: name,
                status: 'failed',
                error: error.message,
                error_stack: error.stack,
                duration_ms: duration,
                started_at: new Date(startTime),
                completed_at: new Date(),
                pipeline_id: pipelineId
            };
        }
    }

    /**
     * Create skipped stage result
     * @param {string} stageName - Stage name
     * @param {string} reason - Skip reason
     * @returns {Object} Skipped stage result
     */
    createSkippedStageResult(stageName, reason) {
        return {
            stage: stageName,
            status: 'skipped',
            reason: reason,
            duration_ms: 0,
            started_at: new Date(),
            completed_at: new Date()
        };
    }

    /**
     * Create failed stage result
     * @param {string} stageName - Stage name
     * @param {Error} error - Error that occurred
     * @returns {Object} Failed stage result
     */
    createFailedStageResult(stageName, error) {
        return {
            stage: stageName,
            status: 'failed',
            error: error.message,
            error_stack: error.stack,
            duration_ms: 0,
            started_at: new Date(),
            completed_at: new Date()
        };
    }

    /**
     * Aggregate validation results
     * @param {Object} stageResults - Individual stage results
     * @param {string} pipelineId - Pipeline ID
     * @returns {Promise<Object>} Aggregated results
     */
    async aggregateResults(stageResults, pipelineId) {
        const completedStages = Object.values(stageResults).filter(r => r.status === 'completed');
        const failedStages = Object.values(stageResults).filter(r => r.status === 'failed');
        const skippedStages = Object.values(stageResults).filter(r => r.status === 'skipped');
        
        // Calculate overall score
        const totalStages = Object.keys(stageResults).length;
        const successfulStages = completedStages.length;
        const overallScore = totalStages > 0 ? (successfulStages / totalStages) * 100 : 0;
        
        // Determine overall status
        let overallStatus = 'success';
        if (failedStages.length > 0) {
            const criticalFailures = failedStages.filter(stage => 
                this.isCriticalStage(stage.stage)
            );
            overallStatus = criticalFailures.length > 0 ? 'failed' : 'warning';
        }
        
        // Calculate grade
        const grade = this.calculateGrade(overallScore);
        
        // Aggregate specific results
        const recommendations = this.aggregateRecommendations(stageResults);
        const suggestions = this.aggregateSuggestions(stageResults);
        const qualityGates = this.aggregateQualityGates(stageResults);
        const securityFindings = this.aggregateSecurityFindings(stageResults);
        
        // Calculate resource usage
        const resourceUsage = this.calculateResourceUsage(stageResults);
        
        return {
            overall_status: overallStatus,
            overall_score: Math.round(overallScore),
            grade: grade,
            recommendations: recommendations,
            suggestions: suggestions,
            quality_gates: qualityGates,
            security_findings: securityFindings,
            files_analyzed: resourceUsage.files_analyzed,
            lines_of_code: resourceUsage.lines_of_code,
            memory_usage_mb: resourceUsage.memory_usage_mb,
            cpu_usage_percent: resourceUsage.cpu_usage_percent,
            stage_summary: {
                total: totalStages,
                completed: completedStages.length,
                failed: failedStages.length,
                skipped: skippedStages.length
            }
        };
    }

    /**
     * Generate error contexts for Codegen processing
     * @param {Object} stageResults - Stage results
     * @param {Object} prData - PR data
     * @param {Object} taskContext - Task context
     * @returns {Promise<Array>} Array of error contexts
     */
    async generateErrorContexts(stageResults, prData, taskContext) {
        if (!this.config.enable_error_context_generation) {
            return [];
        }
        
        const errorContexts = [];
        
        for (const [stageName, result] of Object.entries(stageResults)) {
            if (result.status === 'failed' || (result.result && result.result.issues)) {
                const context = await this.createErrorContext(stageName, result, prData, taskContext);
                if (context) {
                    errorContexts.push(context);
                }
            }
        }
        
        return errorContexts;
    }

    /**
     * Create error context for a specific stage
     * @param {string} stageName - Stage name
     * @param {Object} stageResult - Stage result
     * @param {Object} prData - PR data
     * @param {Object} taskContext - Task context
     * @returns {Promise<Object>} Error context
     */
    async createErrorContext(stageName, stageResult, prData, taskContext) {
        const errorId = `err_${stageName}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        return {
            error_id: errorId,
            stage: stageName,
            error_type: stageResult.status === 'failed' ? 'execution_error' : 'validation_issue',
            error_message: stageResult.error || 'Validation issues found',
            
            // Codegen-specific context
            codegen_context: {
                stage_type: stageName,
                pr_info: {
                    number: prData.number || prData.id,
                    title: prData.title,
                    branch: prData.branch || prData.head?.ref,
                    files_changed: prData.changed_files || []
                },
                task_info: {
                    task_id: taskContext.task_id,
                    requirements: taskContext.requirements || [],
                    acceptance_criteria: taskContext.acceptance_criteria || []
                },
                validation_details: {
                    issues: stageResult.result?.issues || [],
                    suggestions: stageResult.result?.suggestions || [],
                    affected_files: stageResult.result?.affected_files || [],
                    severity: this.determineSeverity(stageResult),
                    fix_priority: this.determineFixPriority(stageName, stageResult)
                },
                remediation_hints: this.generateRemediationHints(stageName, stageResult)
            },
            
            // Technical context
            technical_context: {
                stage_duration_ms: stageResult.duration_ms,
                error_stack: stageResult.error_stack,
                stage_config: stageResult.config,
                timestamp: new Date()
            }
        };
    }

    /**
     * Utility methods for result processing
     */

    isCriticalStage(stageName) {
        const criticalStages = [
            ValidationStages.SYNTAX_CHECK,
            ValidationStages.UNIT_TESTS,
            ValidationStages.SECURITY_SCAN,
            ValidationStages.DEPENDENCY_CHECK
        ];
        return criticalStages.includes(stageName);
    }

    calculateGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    aggregateRecommendations(stageResults) {
        const recommendations = [];
        
        for (const result of Object.values(stageResults)) {
            if (result.result?.recommendations) {
                recommendations.push(...result.result.recommendations);
            }
        }
        
        return recommendations;
    }

    aggregateSuggestions(stageResults) {
        const suggestions = [];
        
        for (const result of Object.values(stageResults)) {
            if (result.result?.suggestions) {
                suggestions.push(...result.result.suggestions);
            }
        }
        
        return suggestions;
    }

    aggregateQualityGates(stageResults) {
        const gates = {};
        
        for (const [stageName, result] of Object.entries(stageResults)) {
            if (result.result?.quality_gate) {
                gates[stageName] = result.result.quality_gate;
            }
        }
        
        return gates;
    }

    aggregateSecurityFindings(stageResults) {
        const findings = [];
        
        const securityResult = stageResults[ValidationStages.SECURITY_SCAN];
        if (securityResult?.result?.findings) {
            findings.push(...securityResult.result.findings);
        }
        
        return findings;
    }

    calculateResourceUsage(stageResults) {
        let filesAnalyzed = 0;
        let linesOfCode = 0;
        let memoryUsage = 0;
        let cpuUsage = 0;
        
        for (const result of Object.values(stageResults)) {
            if (result.result?.metrics) {
                filesAnalyzed += result.result.metrics.files_analyzed || 0;
                linesOfCode += result.result.metrics.lines_of_code || 0;
                memoryUsage = Math.max(memoryUsage, result.result.metrics.memory_usage_mb || 0);
                cpuUsage = Math.max(cpuUsage, result.result.metrics.cpu_usage_percent || 0);
            }
        }
        
        return {
            files_analyzed: filesAnalyzed,
            lines_of_code: linesOfCode,
            memory_usage_mb: memoryUsage,
            cpu_usage_percent: cpuUsage
        };
    }

    extractStageDurations(stageResults) {
        const durations = {};
        
        for (const [stageName, result] of Object.entries(stageResults)) {
            durations[stageName] = result.duration_ms || 0;
        }
        
        return durations;
    }

    calculateOverallMetrics(stageResults, totalDuration) {
        return {
            total_duration_ms: totalDuration,
            stage_count: Object.keys(stageResults).length,
            successful_stages: Object.values(stageResults).filter(r => r.status === 'completed').length,
            failed_stages: Object.values(stageResults).filter(r => r.status === 'failed').length,
            skipped_stages: Object.values(stageResults).filter(r => r.status === 'skipped').length,
            average_stage_duration: this.calculateAverageStageDuration(stageResults),
            execution_metrics: this.executionMetrics
        };
    }

    calculateAverageStageDuration(stageResults) {
        const durations = Object.values(stageResults).map(r => r.duration_ms || 0);
        return durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;
    }

    determineSeverity(stageResult) {
        if (stageResult.status === 'failed') return 'high';
        if (stageResult.result?.issues?.some(issue => issue.severity === 'critical')) return 'critical';
        if (stageResult.result?.issues?.some(issue => issue.severity === 'high')) return 'high';
        if (stageResult.result?.issues?.length > 0) return 'medium';
        return 'low';
    }

    determineFixPriority(stageName, stageResult) {
        if (this.isCriticalStage(stageName) && stageResult.status === 'failed') return 'critical';
        if (stageResult.status === 'failed') return 'high';
        if (stageResult.result?.issues?.length > 5) return 'medium';
        return 'low';
    }

    generateRemediationHints(stageName, stageResult) {
        const hints = {
            [ValidationStages.SYNTAX_CHECK]: [
                'Check for syntax errors in the code',
                'Verify proper use of language constructs',
                'Review compiler/interpreter error messages'
            ],
            [ValidationStages.LINTING]: [
                'Fix linting violations',
                'Update code style to match project standards',
                'Consider using auto-formatting tools'
            ],
            [ValidationStages.UNIT_TESTS]: [
                'Fix failing unit tests',
                'Add missing test cases',
                'Review test assertions and expectations'
            ],
            [ValidationStages.INTEGRATION_TESTS]: [
                'Fix integration test failures',
                'Check service dependencies',
                'Verify test environment configuration'
            ],
            [ValidationStages.SECURITY_SCAN]: [
                'Address security vulnerabilities',
                'Update dependencies with known vulnerabilities',
                'Review security best practices'
            ],
            [ValidationStages.PERFORMANCE_TEST]: [
                'Optimize performance bottlenecks',
                'Review algorithm efficiency',
                'Consider caching strategies'
            ]
        };
        
        return hints[stageName] || ['Review stage-specific documentation', 'Check error logs for details'];
    }

    async generatePipelineErrorContext(error, prData, taskContext, pipelineId) {
        return {
            error_id: `pipeline_err_${pipelineId}_${Date.now()}`,
            error_type: 'pipeline_failure',
            error_message: error.message,
            pipeline_id: pipelineId,
            
            codegen_context: {
                pr_info: {
                    number: prData.number || prData.id,
                    title: prData.title,
                    branch: prData.branch || prData.head?.ref
                },
                task_info: {
                    task_id: taskContext.task_id,
                    requirements: taskContext.requirements || []
                },
                failure_stage: 'pipeline_execution',
                suggested_actions: [
                    'Check system resources',
                    'Verify pipeline configuration',
                    'Review error logs',
                    'Contact system administrator'
                ]
            },
            
            technical_context: {
                error_stack: error.stack,
                timestamp: new Date(),
                execution_metrics: this.executionMetrics
            }
        };
    }

    /**
     * Get pipeline health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        return {
            status: 'healthy',
            config: this.config,
            execution_metrics: this.executionMetrics,
            validators: {
                syntax_validator: await this.syntaxValidator.getHealth(),
                test_runner: await this.testRunner.getHealth(),
                security_scanner: await this.securityScanner.getHealth(),
                performance_analyzer: await this.performanceAnalyzer.getHealth()
            }
        };
    }

    /**
     * Shutdown the validation pipeline
     * @returns {Promise<void>}
     */
    async shutdown() {
        log('info', 'Shutting down Validation Pipeline...');
        
        // Shutdown all validators
        await Promise.all([
            this.syntaxValidator.shutdown(),
            this.testRunner.shutdown(),
            this.securityScanner.shutdown(),
            this.performanceAnalyzer.shutdown()
        ]);
        
        log('info', 'Validation Pipeline shutdown complete');
    }
}

export default ValidationPipeline;

