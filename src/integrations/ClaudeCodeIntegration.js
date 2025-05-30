/**
 * @fileoverview Claude Code Integration
 * @description Comprehensive Claude Code integration for PR validation and automated debugging
 */

import EventEmitter from 'events';
import { integrationConfig } from '../config/integrations.js';

/**
 * Claude Code Integration Service
 * Handles all Claude Code operations for validation and fix generation
 */
export class ClaudeCodeIntegration extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            ...integrationConfig.claudeCode,
            ...config
        };
        
        this.apiKey = this.config.apiKey;
        this.baseUrl = this.config.baseUrl;
        this.webhookSecret = this.config.webhookSecret;
        
        // Rate limiting
        this.rateLimiter = {
            requests: 0,
            windowStart: Date.now(),
            maxRequests: this.config.rateLimits.requests,
            windowMs: this.config.rateLimits.window * 1000
        };
        
        // Circuit breaker state
        this.circuitBreaker = {
            failures: 0,
            lastFailure: null,
            state: 'CLOSED' // CLOSED, OPEN, HALF_OPEN
        };
        
        this.isInitialized = false;
        this.activeDeployments = new Map();
        this.validationHistory = [];
        this.metrics = {
            requestCount: 0,
            errorCount: 0,
            successCount: 0,
            validationCount: 0,
            fixGenerationCount: 0,
            lastRequest: null,
            averageResponseTime: 0
        };
    }
    
    /**
     * Initialize the Claude Code integration
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        
        try {
            // Validate connection
            await this.validateConnection();
            this.isInitialized = true;
            this.emit('initialized');
            console.log('Claude Code integration initialized successfully');
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to initialize Claude Code integration: ${error.message}`);
        }
    }
    
    /**
     * Validate connection to Claude Code API
     */
    async validateConnection() {
        try {
            const response = await this.makeRequest('GET', '/health');
            if (!response.status || response.status !== 'ok') {
                throw new Error('Invalid API response');
            }
            return true;
        } catch (error) {
            throw new Error(`Claude Code connection validation failed: ${error.message}`);
        }
    }
    
    /**
     * Deploy validation agent for PR
     */
    async deployValidationAgent(prUrl, context = {}) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }
            
            const deploymentId = this.generateDeploymentId();
            
            const deploymentData = {
                id: deploymentId,
                type: 'pr_validation',
                target: {
                    prUrl,
                    repository: context.repository,
                    branch: context.branch,
                    commit: context.commit
                },
                validation: {
                    checks: context.checks || [
                        'syntax',
                        'linting',
                        'testing',
                        'security',
                        'performance',
                        'best_practices'
                    ],
                    language: context.language || 'auto-detect',
                    framework: context.framework,
                    customRules: context.customRules || []
                },
                options: {
                    timeout: context.timeout || 300000, // 5 minutes
                    generateFixes: context.generateFixes !== false,
                    reportFormat: context.reportFormat || 'detailed',
                    webhookUrl: context.webhookUrl
                },
                metadata: {
                    source: 'claude-task-master',
                    timestamp: new Date().toISOString(),
                    ...context.metadata
                }
            };
            
            // Track deployment
            this.activeDeployments.set(deploymentId, {
                ...deploymentData,
                status: 'deploying',
                startTime: Date.now()
            });
            
            this.emit('validation.agent.deploying', { deploymentId, prUrl, context });
            
            const response = await this.makeRequest('POST', '/agents/deploy', deploymentData);
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to deploy validation agent');
            }
            
            // Update deployment status
            this.activeDeployments.set(deploymentId, {
                ...this.activeDeployments.get(deploymentId),
                status: 'deployed',
                agentId: response.agentId,
                deployedAt: new Date().toISOString()
            });
            
            this.emit('validation.agent.deployed', { 
                deploymentId, 
                agentId: response.agentId,
                prUrl,
                estimatedCompletion: response.estimatedCompletion
            });
            
            return {
                deploymentId,
                agentId: response.agentId,
                status: 'deployed',
                estimatedCompletion: response.estimatedCompletion,
                validationUrl: response.validationUrl
            };
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to deploy validation agent: ${error.message}`);
        }
    }
    
    /**
     * Get validation results
     */
    async getValidationResults(deploymentId) {
        try {
            if (!this.activeDeployments.has(deploymentId)) {
                throw new Error(`Deployment ${deploymentId} not found`);
            }
            
            const deployment = this.activeDeployments.get(deploymentId);
            
            const response = await this.makeRequest('GET', `/agents/${deployment.agentId}/results`);
            
            if (!response.results) {
                // Validation still in progress
                return {
                    deploymentId,
                    status: 'in_progress',
                    progress: response.progress || 0,
                    estimatedCompletion: response.estimatedCompletion,
                    currentStep: response.currentStep
                };
            }
            
            const validationResults = {
                deploymentId,
                agentId: deployment.agentId,
                status: response.status,
                results: {
                    overall: response.results.overall,
                    checks: response.results.checks || [],
                    issues: response.results.issues || [],
                    suggestions: response.results.suggestions || [],
                    metrics: response.results.metrics || {}
                },
                summary: {
                    totalIssues: response.results.issues?.length || 0,
                    criticalIssues: response.results.issues?.filter(i => i.severity === 'critical').length || 0,
                    warningIssues: response.results.issues?.filter(i => i.severity === 'warning').length || 0,
                    infoIssues: response.results.issues?.filter(i => i.severity === 'info').length || 0,
                    passedChecks: response.results.checks?.filter(c => c.status === 'passed').length || 0,
                    failedChecks: response.results.checks?.filter(c => c.status === 'failed').length || 0
                },
                completedAt: response.completedAt || new Date().toISOString(),
                processingTime: Date.now() - deployment.startTime
            };
            
            // Update deployment status
            this.activeDeployments.set(deploymentId, {
                ...deployment,
                status: 'completed',
                results: validationResults,
                completedAt: validationResults.completedAt
            });
            
            // Store in history
            this.validationHistory.push({
                deploymentId,
                prUrl: deployment.target.prUrl,
                results: validationResults,
                timestamp: validationResults.completedAt
            });
            
            this.emit('validation.completed', validationResults);
            
            return validationResults;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to get validation results: ${error.message}`);
        }
    }
    
    /**
     * Handle validation errors
     */
    async handleValidationErrors(errors, context = {}) {
        try {
            const errorAnalysis = {
                totalErrors: errors.length,
                errorsByType: this.categorizeErrors(errors),
                errorsBySeverity: this.groupErrorsBySeverity(errors),
                fixableErrors: errors.filter(e => e.fixable !== false),
                criticalErrors: errors.filter(e => e.severity === 'critical')
            };
            
            const handlingStrategy = {
                autoFixable: errorAnalysis.fixableErrors.length,
                requiresManualReview: errorAnalysis.criticalErrors.length,
                canProceed: errorAnalysis.criticalErrors.length === 0,
                recommendedActions: this.getRecommendedActions(errorAnalysis)
            };
            
            this.emit('validation.errors.analyzed', { 
                errors, 
                analysis: errorAnalysis,
                strategy: handlingStrategy,
                context
            });
            
            // Auto-generate fixes for fixable errors if enabled
            if (context.autoFix && errorAnalysis.fixableErrors.length > 0) {
                const fixResults = await this.requestFixGeneration(
                    errorAnalysis.fixableErrors, 
                    context
                );
                
                return {
                    analysis: errorAnalysis,
                    strategy: handlingStrategy,
                    fixes: fixResults
                };
            }
            
            return {
                analysis: errorAnalysis,
                strategy: handlingStrategy
            };
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to handle validation errors: ${error.message}`);
        }
    }
    
    /**
     * Request fix generation for errors
     */
    async requestFixGeneration(errors, context = {}) {
        try {
            const fixRequestId = this.generateFixRequestId();
            
            const fixRequest = {
                id: fixRequestId,
                errors: errors.map(error => ({
                    id: error.id,
                    type: error.type,
                    severity: error.severity,
                    message: error.message,
                    file: error.file,
                    line: error.line,
                    column: error.column,
                    rule: error.rule,
                    context: error.context
                })),
                target: {
                    repository: context.repository,
                    branch: context.branch,
                    commit: context.commit,
                    prUrl: context.prUrl
                },
                options: {
                    fixStrategy: context.fixStrategy || 'conservative',
                    preserveFormatting: context.preserveFormatting !== false,
                    addComments: context.addComments !== false,
                    runTests: context.runTests !== false,
                    createCommit: context.createCommit !== false
                },
                metadata: {
                    source: 'claude-task-master',
                    timestamp: new Date().toISOString(),
                    ...context.metadata
                }
            };
            
            this.emit('fix.generation.requested', { fixRequestId, errors, context });
            
            const response = await this.makeRequest('POST', '/fixes/generate', fixRequest);
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to request fix generation');
            }
            
            const fixResults = {
                fixRequestId,
                jobId: response.jobId,
                status: response.status,
                estimatedCompletion: response.estimatedCompletion,
                fixes: response.fixes || [],
                summary: {
                    totalFixes: response.fixes?.length || 0,
                    autoApplied: response.fixes?.filter(f => f.applied).length || 0,
                    requiresReview: response.fixes?.filter(f => !f.applied).length || 0
                }
            };
            
            this.emit('fix.generation.completed', fixResults);
            
            return fixResults;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to request fix generation: ${error.message}`);
        }
    }
    
    /**
     * Monitor deployment progress
     */
    async monitorDeployment(deploymentId) {
        try {
            if (!this.activeDeployments.has(deploymentId)) {
                throw new Error(`Deployment ${deploymentId} not found`);
            }
            
            const deployment = this.activeDeployments.get(deploymentId);
            
            // Get current status
            const response = await this.makeRequest('GET', `/agents/${deployment.agentId}/status`);
            
            const status = {
                deploymentId,
                agentId: deployment.agentId,
                status: response.status,
                progress: response.progress || 0,
                currentStep: response.currentStep,
                totalSteps: response.totalSteps,
                elapsedTime: Date.now() - deployment.startTime,
                estimatedCompletion: response.estimatedCompletion,
                logs: response.logs || [],
                lastUpdate: new Date().toISOString()
            };
            
            // Update deployment
            this.activeDeployments.set(deploymentId, {
                ...deployment,
                ...status,
                lastMonitored: status.lastUpdate
            });
            
            this.emit('deployment.status.updated', status);
            
            return status;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to monitor deployment: ${error.message}`);
        }
    }
    
    /**
     * Handle Claude Code webhooks
     */
    async handleClaudeCodeWebhooks(payload) {
        try {
            const { type, data } = payload;
            
            switch (type) {
                case 'validation_completed':
                    await this.handleValidationCompletedWebhook(data);
                    break;
                case 'validation_failed':
                    await this.handleValidationFailedWebhook(data);
                    break;
                case 'fix_generated':
                    await this.handleFixGeneratedWebhook(data);
                    break;
                case 'fix_applied':
                    await this.handleFixAppliedWebhook(data);
                    break;
                case 'agent_error':
                    await this.handleAgentErrorWebhook(data);
                    break;
                default:
                    console.log(`Unhandled Claude Code webhook type: ${type}`);
            }
            
            this.emit('webhook.processed', { type, data });
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to handle Claude Code webhook: ${error.message}`);
        }
    }
    
    /**
     * Handle validation completed webhook
     */
    async handleValidationCompletedWebhook(data) {
        const { deploymentId, agentId, results } = data;
        
        if (this.activeDeployments.has(deploymentId)) {
            const deployment = this.activeDeployments.get(deploymentId);
            
            this.activeDeployments.set(deploymentId, {
                ...deployment,
                status: 'completed',
                results,
                completedAt: new Date().toISOString()
            });
        }
        
        this.emit('validation.webhook.completed', { deploymentId, agentId, results });
    }
    
    /**
     * Handle validation failed webhook
     */
    async handleValidationFailedWebhook(data) {
        const { deploymentId, agentId, error } = data;
        
        if (this.activeDeployments.has(deploymentId)) {
            const deployment = this.activeDeployments.get(deploymentId);
            
            this.activeDeployments.set(deploymentId, {
                ...deployment,
                status: 'failed',
                error,
                failedAt: new Date().toISOString()
            });
        }
        
        this.emit('validation.webhook.failed', { deploymentId, agentId, error });
    }
    
    /**
     * Handle fix generated webhook
     */
    async handleFixGeneratedWebhook(data) {
        const { fixRequestId, jobId, fixes } = data;
        
        this.emit('fix.webhook.generated', { fixRequestId, jobId, fixes });
    }
    
    /**
     * Handle fix applied webhook
     */
    async handleFixAppliedWebhook(data) {
        const { fixRequestId, jobId, appliedFixes, commit } = data;
        
        this.emit('fix.webhook.applied', { fixRequestId, jobId, appliedFixes, commit });
    }
    
    /**
     * Handle agent error webhook
     */
    async handleAgentErrorWebhook(data) {
        const { deploymentId, agentId, error } = data;
        
        this.emit('agent.webhook.error', { deploymentId, agentId, error });
    }
    
    /**
     * Categorize errors by type
     */
    categorizeErrors(errors) {
        const categories = {};
        
        for (const error of errors) {
            const category = error.type || 'unknown';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(error);
        }
        
        return categories;
    }
    
    /**
     * Group errors by severity
     */
    groupErrorsBySeverity(errors) {
        const severities = {
            critical: [],
            warning: [],
            info: []
        };
        
        for (const error of errors) {
            const severity = error.severity || 'info';
            if (severities[severity]) {
                severities[severity].push(error);
            }
        }
        
        return severities;
    }
    
    /**
     * Get recommended actions based on error analysis
     */
    getRecommendedActions(errorAnalysis) {
        const actions = [];
        
        if (errorAnalysis.criticalErrors.length > 0) {
            actions.push('MANUAL_REVIEW_REQUIRED');
            actions.push('BLOCK_MERGE');
        }
        
        if (errorAnalysis.fixableErrors.length > 0) {
            actions.push('AUTO_FIX_AVAILABLE');
        }
        
        if (errorAnalysis.errorsByType.security?.length > 0) {
            actions.push('SECURITY_REVIEW');
        }
        
        if (errorAnalysis.errorsByType.performance?.length > 0) {
            actions.push('PERFORMANCE_REVIEW');
        }
        
        if (actions.length === 0) {
            actions.push('APPROVE_MERGE');
        }
        
        return actions;
    }
    
    /**
     * Generate unique deployment ID
     */
    generateDeploymentId() {
        return `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Generate unique fix request ID
     */
    generateFixRequestId() {
        return `fix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Make HTTP request to Claude Code API
     */
    async makeRequest(method, endpoint, data = null) {
        // Check circuit breaker
        if (this.circuitBreaker.state === 'OPEN') {
            const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailure;
            if (timeSinceLastFailure < 60000) { // 1 minute
                throw new Error('Circuit breaker is OPEN');
            } else {
                this.circuitBreaker.state = 'HALF_OPEN';
            }
        }
        
        // Check rate limits
        await this.checkRateLimit();
        
        const startTime = Date.now();
        
        try {
            const url = `${this.baseUrl}${endpoint}`;
            const options = {
                method,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'claude-task-master/1.0.0'
                },
                timeout: this.config.timeout
            };
            
            if (data) {
                options.body = JSON.stringify(data);
            }
            
            const response = await fetch(url, options);
            
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorBody}`);
            }
            
            const result = await response.json();
            
            // Update metrics
            const responseTime = Date.now() - startTime;
            this.updateMetrics(responseTime, false);
            
            // Reset circuit breaker on success
            if (this.circuitBreaker.state === 'HALF_OPEN') {
                this.circuitBreaker.state = 'CLOSED';
                this.circuitBreaker.failures = 0;
            }
            
            return result;
        } catch (error) {
            // Update metrics
            this.updateMetrics(Date.now() - startTime, true);
            
            // Update circuit breaker
            this.circuitBreaker.failures++;
            this.circuitBreaker.lastFailure = Date.now();
            
            if (this.circuitBreaker.failures >= 5) {
                this.circuitBreaker.state = 'OPEN';
            }
            
            throw error;
        }
    }
    
    /**
     * Check rate limits
     */
    async checkRateLimit() {
        const now = Date.now();
        const windowElapsed = now - this.rateLimiter.windowStart;
        
        if (windowElapsed >= this.rateLimiter.windowMs) {
            // Reset window
            this.rateLimiter.requests = 0;
            this.rateLimiter.windowStart = now;
        }
        
        if (this.rateLimiter.requests >= this.rateLimiter.maxRequests) {
            const waitTime = this.rateLimiter.windowMs - windowElapsed;
            throw new Error(`Rate limit exceeded. Wait ${waitTime}ms`);
        }
        
        this.rateLimiter.requests++;
    }
    
    /**
     * Update metrics
     */
    updateMetrics(responseTime, isError) {
        this.metrics.requestCount++;
        this.metrics.lastRequest = Date.now();
        
        if (isError) {
            this.metrics.errorCount++;
        } else {
            this.metrics.successCount++;
        }
        
        // Calculate rolling average response time
        this.metrics.averageResponseTime = 
            (this.metrics.averageResponseTime * (this.metrics.requestCount - 1) + responseTime) / 
            this.metrics.requestCount;
    }
    
    /**
     * Get health status
     */
    getHealthStatus() {
        const errorRate = this.metrics.requestCount > 0 ? 
            (this.metrics.errorCount / this.metrics.requestCount) * 100 : 0;
        
        return {
            service: 'claude-code',
            status: this.circuitBreaker.state === 'OPEN' ? 'unhealthy' : 'healthy',
            initialized: this.isInitialized,
            circuitBreaker: this.circuitBreaker.state,
            activeDeployments: this.activeDeployments.size,
            metrics: {
                ...this.metrics,
                errorRate: Math.round(errorRate * 100) / 100
            },
            rateLimiter: {
                requests: this.rateLimiter.requests,
                maxRequests: this.rateLimiter.maxRequests,
                windowStart: this.rateLimiter.windowStart
            }
        };
    }
    
    /**
     * Clean up completed deployments
     */
    cleanupCompletedDeployments() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        for (const [deploymentId, deployment] of this.activeDeployments.entries()) {
            if (deployment.status === 'completed' && now - deployment.startTime > maxAge) {
                this.activeDeployments.delete(deploymentId);
            }
        }
        
        // Keep only last 50 validation history entries
        if (this.validationHistory.length > 50) {
            this.validationHistory = this.validationHistory.slice(-50);
        }
    }
}

export default ClaudeCodeIntegration;

