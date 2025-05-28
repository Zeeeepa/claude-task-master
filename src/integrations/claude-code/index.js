/**
 * Claude Code Integration
 * 
 * Main entry point for Claude Code integration providing automated
 * PR validation, debugging, and code quality analysis capabilities.
 */

import ClaudeCodeClient from './claude-code-client.js';
import PRValidator from './pr-validator.js';
import CodeAnalyzer from './code-analyzer.js';
import FeedbackProcessor from './feedback-processor.js';
import ClaudeCodeConfig from './config.js';

/**
 * Claude Code Integration Service
 * 
 * Orchestrates all Claude Code integration functionality including
 * PR validation, code analysis, and feedback processing.
 */
export class ClaudeCodeIntegration {
    constructor(options = {}) {
        this.config = new ClaudeCodeConfig(options.config);
        this.client = new ClaudeCodeClient(options.client);
        this.prValidator = new PRValidator(options.prValidator);
        this.codeAnalyzer = new CodeAnalyzer(options.codeAnalyzer);
        this.feedbackProcessor = new FeedbackProcessor(options.feedbackProcessor);
        
        this.isInitialized = false;
        this.metrics = {
            validationsPerformed: 0,
            analysesCompleted: 0,
            feedbackGenerated: 0,
            averageValidationTime: 0,
            successRate: 0
        };
    }

    /**
     * Initialize the Claude Code integration
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            console.log('Initializing Claude Code integration...');
            
            // Initialize all components
            const clientInit = await this.client.initialize();
            const prValidatorInit = await this.prValidator.initialize();
            const codeAnalyzerInit = await this.codeAnalyzer.initialize();
            
            if (!clientInit) {
                throw new Error('Failed to initialize Claude Code client');
            }
            
            if (!prValidatorInit) {
                throw new Error('Failed to initialize PR validator');
            }
            
            if (!codeAnalyzerInit) {
                throw new Error('Failed to initialize code analyzer');
            }
            
            this.isInitialized = true;
            console.log('Claude Code integration initialized successfully');
            
            return true;
        } catch (error) {
            console.error('Failed to initialize Claude Code integration:', error.message);
            return false;
        }
    }

    /**
     * Validate a pull request
     * @param {Object} prInfo - Pull request information
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation result with feedback
     */
    async validatePullRequest(prInfo, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Claude Code integration not initialized');
        }

        const startTime = Date.now();
        
        try {
            console.log(`Validating PR #${prInfo.prNumber}: ${prInfo.title}`);
            
            // Perform PR validation
            const validationResult = await this.prValidator.validatePR(prInfo, options);
            
            if (!validationResult.success) {
                throw new Error(validationResult.error);
            }
            
            // Process feedback
            const feedbackOptions = {
                target: options.feedbackTarget || 'github',
                includeFileBreakdown: options.includeFileBreakdown || true,
                ...options.feedback
            };
            
            const feedbackResult = await this.feedbackProcessor.processFeedback({
                type: 'pr-validation',
                prInfo,
                ...validationResult
            }, feedbackOptions);
            
            // Update metrics
            this.updateMetrics('validation', Date.now() - startTime, true);
            
            return {
                success: true,
                validation: validationResult,
                feedback: feedbackResult.success ? feedbackResult.feedback : null,
                metrics: {
                    validationTime: Date.now() - startTime,
                    recommendation: validationResult.recommendation
                }
            };
            
        } catch (error) {
            this.updateMetrics('validation', Date.now() - startTime, false);
            
            return {
                success: false,
                error: error.message,
                validationTime: Date.now() - startTime
            };
        }
    }

    /**
     * Analyze code quality
     * @param {string} target - Target directory or file
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} Analysis result with feedback
     */
    async analyzeCodeQuality(target, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Claude Code integration not initialized');
        }

        const startTime = Date.now();
        
        try {
            console.log(`Analyzing code quality for: ${target}`);
            
            // Perform code analysis
            const analysisResult = await this.codeAnalyzer.analyzeCodeQuality(target, options);
            
            if (!analysisResult.success) {
                throw new Error(analysisResult.error);
            }
            
            // Process feedback
            const feedbackOptions = {
                target: options.feedbackTarget || 'github',
                includeFileBreakdown: options.includeFileBreakdown || true,
                ...options.feedback
            };
            
            const feedbackResult = await this.feedbackProcessor.processFeedback({
                type: 'code-analysis',
                target,
                ...analysisResult
            }, feedbackOptions);
            
            // Update metrics
            this.updateMetrics('analysis', Date.now() - startTime, true);
            
            return {
                success: true,
                analysis: analysisResult,
                feedback: feedbackResult.success ? feedbackResult.feedback : null,
                metrics: {
                    analysisTime: Date.now() - startTime,
                    filesAnalyzed: analysisResult.summary?.filesAnalyzed || 0,
                    overallScore: analysisResult.metrics?.overallScore || 0
                }
            };
            
        } catch (error) {
            this.updateMetrics('analysis', Date.now() - startTime, false);
            
            return {
                success: false,
                error: error.message,
                analysisTime: Date.now() - startTime
            };
        }
    }

    /**
     * Debug build failures
     * @param {string} errorLog - Build error log
     * @param {Object} options - Debug options
     * @returns {Promise<Object>} Debug suggestions with feedback
     */
    async debugBuildFailure(errorLog, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Claude Code integration not initialized');
        }

        const startTime = Date.now();
        
        try {
            console.log('Debugging build failure...');
            
            // Get debug suggestions from Claude Code
            const debugResult = await this.client.debugBuildFailure(errorLog, options);
            
            if (!debugResult.success) {
                throw new Error(debugResult.error);
            }
            
            // Process feedback
            const feedbackOptions = {
                target: options.feedbackTarget || 'github',
                ...options.feedback
            };
            
            const feedbackResult = await this.feedbackProcessor.processFeedback({
                type: 'debug-assistance',
                errorLog,
                suggestions: debugResult.data?.lastResponse || debugResult.data,
                timestamp: new Date().toISOString()
            }, feedbackOptions);
            
            return {
                success: true,
                debug: debugResult,
                feedback: feedbackResult.success ? feedbackResult.feedback : null,
                metrics: {
                    debugTime: Date.now() - startTime
                }
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                debugTime: Date.now() - startTime
            };
        }
    }

    /**
     * Perform security scan
     * @param {string} target - Target to scan
     * @param {Object} options - Scan options
     * @returns {Promise<Object>} Security scan results with feedback
     */
    async performSecurityScan(target, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Claude Code integration not initialized');
        }

        const startTime = Date.now();
        
        try {
            console.log(`Performing security scan for: ${target}`);
            
            // Perform security scan
            const scanResult = await this.client.scanSecurity(target, options);
            
            if (!scanResult.success) {
                throw new Error(scanResult.error);
            }
            
            // Process feedback
            const feedbackOptions = {
                target: options.feedbackTarget || 'github',
                ...options.feedback
            };
            
            const feedbackResult = await this.feedbackProcessor.processFeedback({
                type: 'security-scan',
                target,
                results: scanResult.data?.lastResponse || scanResult.data,
                timestamp: new Date().toISOString()
            }, feedbackOptions);
            
            return {
                success: true,
                scan: scanResult,
                feedback: feedbackResult.success ? feedbackResult.feedback : null,
                metrics: {
                    scanTime: Date.now() - startTime
                }
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                scanTime: Date.now() - startTime
            };
        }
    }

    /**
     * Analyze performance
     * @param {string} target - Target to analyze
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} Performance analysis results with feedback
     */
    async analyzePerformance(target, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Claude Code integration not initialized');
        }

        const startTime = Date.now();
        
        try {
            console.log(`Analyzing performance for: ${target}`);
            
            // Perform performance analysis
            const analysisResult = await this.client.analyzePerformance(target, options);
            
            if (!analysisResult.success) {
                throw new Error(analysisResult.error);
            }
            
            // Process feedback
            const feedbackOptions = {
                target: options.feedbackTarget || 'github',
                ...options.feedback
            };
            
            const feedbackResult = await this.feedbackProcessor.processFeedback({
                type: 'performance-analysis',
                target,
                results: analysisResult.data?.lastResponse || analysisResult.data,
                timestamp: new Date().toISOString()
            }, feedbackOptions);
            
            return {
                success: true,
                analysis: analysisResult,
                feedback: feedbackResult.success ? feedbackResult.feedback : null,
                metrics: {
                    analysisTime: Date.now() - startTime
                }
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                analysisTime: Date.now() - startTime
            };
        }
    }

    /**
     * Get integration status and metrics
     * @returns {Object} Status and metrics information
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            clientStatus: this.client.getStatus(),
            metrics: this.metrics,
            config: this.config.getConfig()
        };
    }

    /**
     * Update integration metrics
     * @param {string} operation - Operation type
     * @param {number} duration - Operation duration in ms
     * @param {boolean} success - Whether operation was successful
     */
    updateMetrics(operation, duration, success) {
        if (operation === 'validation') {
            this.metrics.validationsPerformed++;
            this.metrics.averageValidationTime = 
                (this.metrics.averageValidationTime + duration) / 2;
        } else if (operation === 'analysis') {
            this.metrics.analysesCompleted++;
        }
        
        if (success) {
            this.metrics.feedbackGenerated++;
        }
        
        // Update success rate
        const totalOperations = this.metrics.validationsPerformed + this.metrics.analysesCompleted;
        if (totalOperations > 0) {
            this.metrics.successRate = this.metrics.feedbackGenerated / totalOperations;
        }
    }

    /**
     * Reset session and clear state
     */
    reset() {
        this.client.resetSession();
        console.log('Claude Code integration session reset');
    }

    /**
     * Shutdown the integration
     */
    async shutdown() {
        console.log('Shutting down Claude Code integration...');
        this.isInitialized = false;
        this.reset();
    }
}

// Export individual components for direct use
export {
    ClaudeCodeClient,
    PRValidator,
    CodeAnalyzer,
    FeedbackProcessor,
    ClaudeCodeConfig
};

// Export default integration service
export default ClaudeCodeIntegration;

