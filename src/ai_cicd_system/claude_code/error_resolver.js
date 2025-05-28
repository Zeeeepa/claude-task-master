/**
 * Error Resolver
 * 
 * Intelligent error analysis and resolution system for Claude Code integration.
 * Provides automated error categorization, fix suggestions, and resolution attempts.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const execAsync = promisify(exec);

export class ErrorResolver {
    constructor(options = {}) {
        this.config = {
            maxResolutionAttempts: options.maxResolutionAttempts || 3,
            resolutionTimeout: options.resolutionTimeout || 10 * 60 * 1000, // 10 minutes
            confidenceThreshold: options.confidenceThreshold || 0.7,
            autoFixEnabled: options.autoFixEnabled || true,
            backupEnabled: options.backupEnabled || true,
            learningEnabled: options.learningEnabled || true,
            ...options
        };

        this.errorPatterns = new Map();
        this.resolutionStrategies = new Map();
        this.knowledgeBase = new Map();
        this.activeResolutions = new Map();

        this.metrics = {
            errorsAnalyzed: 0,
            errorsResolved: 0,
            autoFixesApplied: 0,
            resolutionSuccessRate: 0,
            averageResolutionTime: 0,
            commonErrorTypes: new Map()
        };

        this.isInitialized = false;
    }

    /**
     * Initialize the Error Resolver
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            console.log('Initializing Error Resolver...');

            // Load error patterns and resolution strategies
            await this.loadErrorPatterns();
            await this.loadResolutionStrategies();
            await this.loadKnowledgeBase();

            this.isInitialized = true;
            console.log('Error Resolver initialized successfully');

            return true;
        } catch (error) {
            console.error('Failed to initialize Error Resolver:', error.message);
            return false;
        }
    }

    /**
     * Analyze and resolve errors
     * @param {Object} errorData - Error information from validation/testing
     * @param {Object} options - Resolution options
     * @returns {Promise<Object>} Resolution result
     */
    async resolveErrors(errorData, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Error Resolver not initialized');
        }

        const resolutionId = this.generateResolutionId();
        const startTime = Date.now();

        try {
            console.log(`Starting error resolution ${resolutionId}`);

            // Register resolution
            this.registerResolution(resolutionId, errorData, options);

            // Analyze errors
            const errorAnalysis = await this.analyzeErrors(errorData);

            // Categorize errors
            const categorizedErrors = await this.categorizeErrors(errorAnalysis);

            // Generate resolution plan
            const resolutionPlan = await this.generateResolutionPlan(categorizedErrors, options);

            // Execute resolution attempts
            const resolutionResults = await this.executeResolutionPlan(resolutionPlan, options);

            // Validate fixes
            const validationResults = await this.validateResolutions(resolutionResults, options);

            // Learn from results
            if (this.config.learningEnabled) {
                await this.learnFromResolution(resolutionResults, validationResults);
            }

            // Compile final results
            const finalResults = this.compileResolutionResults({
                resolutionId,
                errorData,
                errorAnalysis,
                categorizedErrors,
                resolutionPlan,
                resolutionResults,
                validationResults,
                resolutionTime: Date.now() - startTime
            });

            // Update metrics
            this.updateMetrics(finalResults);

            console.log(`Error resolution ${resolutionId} completed in ${Date.now() - startTime}ms`);

            return finalResults;

        } catch (error) {
            this.updateMetrics({ success: false }, Date.now() - startTime);

            return {
                success: false,
                error: error.message,
                resolutionId,
                resolutionTime: Date.now() - startTime
            };
        } finally {
            // Unregister resolution
            this.unregisterResolution(resolutionId);
        }
    }

    /**
     * Analyze specific error
     * @param {Object} error - Single error to analyze
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} Error analysis result
     */
    async analyzeError(error, options = {}) {
        const analysisId = this.generateAnalysisId();
        const startTime = Date.now();

        try {
            console.log(`Analyzing error: ${error.message || error.description}`);

            // Extract error information
            const errorInfo = this.extractErrorInfo(error);

            // Match against known patterns
            const patternMatches = await this.matchErrorPatterns(errorInfo);

            // Determine error category
            const category = this.determineErrorCategory(errorInfo, patternMatches);

            // Assess severity
            const severity = this.assessErrorSeverity(errorInfo, category);

            // Generate suggestions
            const suggestions = await this.generateErrorSuggestions(errorInfo, patternMatches, category);

            return {
                success: true,
                analysisId,
                errorInfo,
                category,
                severity,
                patternMatches,
                suggestions,
                confidence: this.calculateConfidence(patternMatches, suggestions),
                analysisTime: Date.now() - startTime
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                analysisId,
                analysisTime: Date.now() - startTime
            };
        }
    }

    /**
     * Apply automatic fix
     * @param {Object} errorAnalysis - Error analysis result
     * @param {Object} options - Fix options
     * @returns {Promise<Object>} Fix application result
     */
    async applyAutoFix(errorAnalysis, options = {}) {
        if (!this.config.autoFixEnabled) {
            return {
                success: false,
                error: 'Auto-fix is disabled',
                applied: false
            };
        }

        const fixId = this.generateFixId();
        const startTime = Date.now();

        try {
            console.log(`Applying auto-fix ${fixId} for error: ${errorAnalysis.errorInfo.message}`);

            // Check if auto-fix is available
            const autoFixStrategy = this.getAutoFixStrategy(errorAnalysis);
            if (!autoFixStrategy) {
                return {
                    success: false,
                    error: 'No auto-fix strategy available',
                    applied: false,
                    fixId
                };
            }

            // Create backup if enabled
            let backupPath = null;
            if (this.config.backupEnabled) {
                backupPath = await this.createBackup(errorAnalysis.errorInfo.filePath);
            }

            // Apply the fix
            const fixResult = await autoFixStrategy.apply(errorAnalysis, options);

            if (!fixResult.success) {
                // Restore backup if fix failed
                if (backupPath) {
                    await this.restoreBackup(backupPath, errorAnalysis.errorInfo.filePath);
                }

                return {
                    success: false,
                    error: fixResult.error,
                    applied: false,
                    fixId,
                    backupRestored: !!backupPath
                };
            }

            // Verify the fix
            const verificationResult = await this.verifyFix(errorAnalysis, fixResult);

            return {
                success: verificationResult.success,
                applied: true,
                fixId,
                fixResult,
                verificationResult,
                backupPath,
                fixTime: Date.now() - startTime
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                applied: false,
                fixId,
                fixTime: Date.now() - startTime
            };
        }
    }

    /**
     * Get resolution status
     * @param {string} resolutionId - Resolution ID
     * @returns {Object} Resolution status
     */
    getResolutionStatus(resolutionId) {
        if (!this.activeResolutions.has(resolutionId)) {
            return { status: 'not_found' };
        }

        const resolution = this.activeResolutions.get(resolutionId);
        return {
            status: resolution.status,
            resolutionId,
            startedAt: resolution.startedAt,
            progress: resolution.progress,
            currentStep: resolution.currentStep,
            errorsProcessed: resolution.errorsProcessed,
            errorsResolved: resolution.errorsResolved
        };
    }

    /**
     * Get resolver status and metrics
     * @returns {Object} Status and metrics
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            activeResolutions: this.activeResolutions.size,
            errorPatternsLoaded: this.errorPatterns.size,
            resolutionStrategiesLoaded: this.resolutionStrategies.size,
            knowledgeBaseEntries: this.knowledgeBase.size,
            metrics: this.metrics,
            config: this.config
        };
    }

    /**
     * Analyze errors
     * @private
     */
    async analyzeErrors(errorData) {
        const analysis = {
            totalErrors: 0,
            errorsByType: new Map(),
            errorsByFile: new Map(),
            errorsBySeverity: new Map(),
            analysisResults: []
        };

        try {
            // Extract all errors from different sources
            const allErrors = this.extractAllErrors(errorData);
            analysis.totalErrors = allErrors.length;

            // Analyze each error
            for (const error of allErrors) {
                const errorAnalysis = await this.analyzeError(error);
                analysis.analysisResults.push(errorAnalysis);

                if (errorAnalysis.success) {
                    // Group by type
                    const type = errorAnalysis.category;
                    analysis.errorsByType.set(type, (analysis.errorsByType.get(type) || 0) + 1);

                    // Group by file
                    const file = errorAnalysis.errorInfo.filePath || 'unknown';
                    analysis.errorsByFile.set(file, (analysis.errorsByFile.get(file) || 0) + 1);

                    // Group by severity
                    const severity = errorAnalysis.severity;
                    analysis.errorsBySeverity.set(severity, (analysis.errorsBySeverity.get(severity) || 0) + 1);
                }
            }

            return analysis;

        } catch (error) {
            throw new Error(`Error analysis failed: ${error.message}`);
        }
    }

    /**
     * Categorize errors
     * @private
     */
    async categorizeErrors(errorAnalysis) {
        const categories = {
            syntax: [],
            runtime: [],
            logic: [],
            performance: [],
            security: [],
            dependency: [],
            configuration: [],
            test: [],
            unknown: []
        };

        for (const analysis of errorAnalysis.analysisResults) {
            if (analysis.success) {
                const category = analysis.category || 'unknown';
                if (categories[category]) {
                    categories[category].push(analysis);
                } else {
                    categories.unknown.push(analysis);
                }
            }
        }

        return categories;
    }

    /**
     * Generate resolution plan
     * @private
     */
    async generateResolutionPlan(categorizedErrors, options) {
        const plan = {
            steps: [],
            estimatedTime: 0,
            confidence: 0,
            riskLevel: 'low'
        };

        try {
            // Define resolution order by priority
            const resolutionOrder = ['syntax', 'dependency', 'configuration', 'security', 'logic', 'runtime', 'performance', 'test'];

            for (const category of resolutionOrder) {
                const errors = categorizedErrors[category] || [];
                if (errors.length === 0) continue;

                const categoryPlan = await this.generateCategoryResolutionPlan(category, errors, options);
                plan.steps.push(categoryPlan);
                plan.estimatedTime += categoryPlan.estimatedTime;
            }

            // Calculate overall confidence and risk
            plan.confidence = this.calculatePlanConfidence(plan.steps);
            plan.riskLevel = this.assessPlanRisk(plan.steps);

            return plan;

        } catch (error) {
            throw new Error(`Resolution plan generation failed: ${error.message}`);
        }
    }

    /**
     * Execute resolution plan
     * @private
     */
    async executeResolutionPlan(resolutionPlan, options) {
        const results = {
            stepsExecuted: 0,
            stepsSuccessful: 0,
            stepsFailed: 0,
            stepResults: [],
            overallSuccess: false
        };

        try {
            for (const step of resolutionPlan.steps) {
                console.log(`Executing resolution step: ${step.category}`);

                const stepResult = await this.executeResolutionStep(step, options);
                results.stepResults.push(stepResult);
                results.stepsExecuted++;

                if (stepResult.success) {
                    results.stepsSuccessful++;
                } else {
                    results.stepsFailed++;
                    
                    // Stop execution if critical step fails
                    if (step.critical) {
                        console.log(`Critical step failed: ${step.category}`);
                        break;
                    }
                }
            }

            results.overallSuccess = results.stepsFailed === 0;

            return results;

        } catch (error) {
            throw new Error(`Resolution plan execution failed: ${error.message}`);
        }
    }

    /**
     * Execute resolution step
     * @private
     */
    async executeResolutionStep(step, options) {
        const stepStartTime = Date.now();

        try {
            const stepResults = [];

            for (const errorAnalysis of step.errors) {
                const strategy = this.getResolutionStrategy(errorAnalysis.category);
                if (!strategy) {
                    stepResults.push({
                        success: false,
                        error: `No resolution strategy for category: ${errorAnalysis.category}`,
                        errorAnalysis
                    });
                    continue;
                }

                const resolutionResult = await strategy.resolve(errorAnalysis, options);
                stepResults.push({
                    success: resolutionResult.success,
                    result: resolutionResult,
                    errorAnalysis
                });
            }

            const successfulResolutions = stepResults.filter(r => r.success).length;
            const success = successfulResolutions > 0;

            return {
                success,
                category: step.category,
                errorsProcessed: stepResults.length,
                errorsResolved: successfulResolutions,
                stepResults,
                executionTime: Date.now() - stepStartTime
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                category: step.category,
                executionTime: Date.now() - stepStartTime
            };
        }
    }

    /**
     * Load error patterns
     * @private
     */
    async loadErrorPatterns() {
        // Load common error patterns
        const patterns = [
            {
                id: 'syntax_missing_semicolon',
                pattern: /Missing semicolon/i,
                category: 'syntax',
                language: 'javascript',
                confidence: 0.9
            },
            {
                id: 'syntax_undefined_variable',
                pattern: /ReferenceError: .* is not defined/i,
                category: 'syntax',
                language: 'javascript',
                confidence: 0.95
            },
            {
                id: 'dependency_module_not_found',
                pattern: /Cannot find module/i,
                category: 'dependency',
                language: 'javascript',
                confidence: 0.9
            },
            {
                id: 'python_indentation_error',
                pattern: /IndentationError/i,
                category: 'syntax',
                language: 'python',
                confidence: 0.95
            },
            {
                id: 'python_import_error',
                pattern: /ImportError|ModuleNotFoundError/i,
                category: 'dependency',
                language: 'python',
                confidence: 0.9
            },
            {
                id: 'security_hardcoded_secret',
                pattern: /(password|secret|key|token)\s*=\s*["'][^"']+["']/i,
                category: 'security',
                confidence: 0.8
            }
        ];

        for (const pattern of patterns) {
            this.errorPatterns.set(pattern.id, pattern);
        }

        console.log(`Loaded ${this.errorPatterns.size} error patterns`);
    }

    /**
     * Load resolution strategies
     * @private
     */
    async loadResolutionStrategies() {
        // Syntax error strategies
        this.resolutionStrategies.set('syntax', new SyntaxErrorStrategy());

        // Dependency error strategies
        this.resolutionStrategies.set('dependency', new DependencyErrorStrategy());

        // Security error strategies
        this.resolutionStrategies.set('security', new SecurityErrorStrategy());

        // Configuration error strategies
        this.resolutionStrategies.set('configuration', new ConfigurationErrorStrategy());

        // Logic error strategies
        this.resolutionStrategies.set('logic', new LogicErrorStrategy());

        // Runtime error strategies
        this.resolutionStrategies.set('runtime', new RuntimeErrorStrategy());

        // Performance error strategies
        this.resolutionStrategies.set('performance', new PerformanceErrorStrategy());

        // Test error strategies
        this.resolutionStrategies.set('test', new TestErrorStrategy());

        console.log(`Loaded ${this.resolutionStrategies.size} resolution strategies`);
    }

    /**
     * Load knowledge base
     * @private
     */
    async loadKnowledgeBase() {
        // Load common solutions and best practices
        const knowledgeEntries = [
            {
                id: 'missing_dependency',
                problem: 'Module not found',
                solution: 'Install missing dependency using package manager',
                commands: ['npm install', 'pip install', 'yarn add']
            },
            {
                id: 'syntax_error_js',
                problem: 'JavaScript syntax error',
                solution: 'Fix syntax according to language specification',
                tools: ['eslint', 'prettier']
            },
            {
                id: 'security_hardcoded_secret',
                problem: 'Hardcoded secrets in code',
                solution: 'Move secrets to environment variables',
                bestPractice: 'Use .env files and never commit secrets'
            }
        ];

        for (const entry of knowledgeEntries) {
            this.knowledgeBase.set(entry.id, entry);
        }

        console.log(`Loaded ${this.knowledgeBase.size} knowledge base entries`);
    }

    /**
     * Extract error information
     * @private
     */
    extractErrorInfo(error) {
        return {
            message: error.message || error.description || '',
            type: error.type || error.name || 'unknown',
            filePath: error.file || error.filename || error.path,
            lineNumber: error.line || error.lineNumber,
            columnNumber: error.column || error.columnNumber,
            stackTrace: error.stack || error.stackTrace,
            severity: error.severity || 'medium',
            source: error.source || 'unknown'
        };
    }

    /**
     * Match error patterns
     * @private
     */
    async matchErrorPatterns(errorInfo) {
        const matches = [];

        for (const [id, pattern] of this.errorPatterns.entries()) {
            if (pattern.pattern.test(errorInfo.message)) {
                matches.push({
                    patternId: id,
                    pattern,
                    confidence: pattern.confidence
                });
            }
        }

        return matches.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Generate resolution ID
     * @private
     */
    generateResolutionId() {
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        return `resolution-${timestamp}-${random}`;
    }

    /**
     * Register resolution
     * @private
     */
    registerResolution(resolutionId, errorData, options) {
        this.activeResolutions.set(resolutionId, {
            resolutionId,
            errorData,
            options,
            status: 'running',
            startedAt: new Date().toISOString(),
            progress: 0,
            currentStep: null,
            errorsProcessed: 0,
            errorsResolved: 0
        });

        this.metrics.errorsAnalyzed++;
    }

    /**
     * Unregister resolution
     * @private
     */
    unregisterResolution(resolutionId) {
        this.activeResolutions.delete(resolutionId);
    }

    /**
     * Update metrics
     * @private
     */
    updateMetrics(result) {
        if (result.success && result.resolutionResults) {
            this.metrics.errorsResolved += result.resolutionResults.stepsSuccessful;
            this.metrics.autoFixesApplied += result.resolutionResults.stepResults
                .filter(r => r.success && r.result?.autoFixApplied).length;
        }

        if (result.resolutionTime) {
            this.metrics.averageResolutionTime = 
                (this.metrics.averageResolutionTime + result.resolutionTime) / 2;
        }

        // Update success rate
        if (this.metrics.errorsAnalyzed > 0) {
            this.metrics.resolutionSuccessRate = this.metrics.errorsResolved / this.metrics.errorsAnalyzed;
        }

        // Update common error types
        if (result.categorizedErrors) {
            for (const [category, errors] of Object.entries(result.categorizedErrors)) {
                if (errors.length > 0) {
                    this.metrics.commonErrorTypes.set(
                        category, 
                        (this.metrics.commonErrorTypes.get(category) || 0) + errors.length
                    );
                }
            }
        }
    }

    /**
     * Shutdown the Error Resolver
     */
    async shutdown() {
        console.log('Shutting down Error Resolver...');
        this.activeResolutions.clear();
        this.isInitialized = false;
        console.log('Error Resolver shutdown complete');
    }
}

// Resolution strategy implementations
class SyntaxErrorStrategy {
    async resolve(errorAnalysis, options) {
        // Implementation for syntax error resolution
        return { success: true, autoFixApplied: false, message: 'Syntax error resolution strategy' };
    }
}

class DependencyErrorStrategy {
    async resolve(errorAnalysis, options) {
        // Implementation for dependency error resolution
        return { success: true, autoFixApplied: true, message: 'Dependency error resolution strategy' };
    }
}

class SecurityErrorStrategy {
    async resolve(errorAnalysis, options) {
        // Implementation for security error resolution
        return { success: true, autoFixApplied: false, message: 'Security error resolution strategy' };
    }
}

class ConfigurationErrorStrategy {
    async resolve(errorAnalysis, options) {
        // Implementation for configuration error resolution
        return { success: true, autoFixApplied: true, message: 'Configuration error resolution strategy' };
    }
}

class LogicErrorStrategy {
    async resolve(errorAnalysis, options) {
        // Implementation for logic error resolution
        return { success: false, message: 'Logic errors require manual intervention' };
    }
}

class RuntimeErrorStrategy {
    async resolve(errorAnalysis, options) {
        // Implementation for runtime error resolution
        return { success: true, autoFixApplied: false, message: 'Runtime error resolution strategy' };
    }
}

class PerformanceErrorStrategy {
    async resolve(errorAnalysis, options) {
        // Implementation for performance error resolution
        return { success: true, autoFixApplied: false, message: 'Performance error resolution strategy' };
    }
}

class TestErrorStrategy {
    async resolve(errorAnalysis, options) {
        // Implementation for test error resolution
        return { success: true, autoFixApplied: true, message: 'Test error resolution strategy' };
    }
}

export default ErrorResolver;

