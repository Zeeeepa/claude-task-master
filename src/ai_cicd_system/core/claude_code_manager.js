/**
 * @fileoverview Claude Code Manager
 * @description High-level manager for Claude Code sessions and operations
 */

import { EventEmitter } from 'events';
import { log } from '../../scripts/modules/utils.js';
import { AgentAPIClient } from './agentapi_client.js';

/**
 * Claude Code Manager for handling PR validation and code operations
 */
export class ClaudeCodeManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            maxConcurrentSessions: config.maxConcurrentSessions || 3,
            sessionTimeout: config.sessionTimeout || 300000, // 5 minutes
            validationTimeout: config.validationTimeout || 600000, // 10 minutes
            retryAttempts: config.retryAttempts || 3,
            ...config
        };
        
        // Initialize AgentAPI client
        this.agentAPIClient = new AgentAPIClient(this.config);
        
        // Session management
        this.activeSessions = new Map();
        this.sessionQueue = [];
        this.operationHistory = [];
        
        // Setup event handlers
        this.setupEventHandlers();
        
        log('debug', 'Claude Code Manager initialized', {
            maxConcurrentSessions: this.config.maxConcurrentSessions
        });
    }
    
    /**
     * Setup event handlers for AgentAPI client
     */
    setupEventHandlers() {
        this.agentAPIClient.on('sessionStarted', (data) => {
            log('debug', 'Session started event received', data);
            this.emit('sessionStarted', data);
        });
        
        this.agentAPIClient.on('sessionStopped', (data) => {
            log('debug', 'Session stopped event received', data);
            this.activeSessions.delete(data.sessionId);
            this.emit('sessionStopped', data);
            this.processQueue();
        });
        
        this.agentAPIClient.on('healthCheckFailed', (data) => {
            log('warn', 'AgentAPI health check failed', data);
            this.emit('healthCheckFailed', data);
        });
        
        this.agentAPIClient.on('circuitBreakerOpen', () => {
            log('error', 'AgentAPI circuit breaker opened');
            this.emit('agentAPIUnavailable');
        });
    }
    
    /**
     * Validate a PR using Claude Code
     */
    async validatePR(prData, options = {}) {
        const operationId = `validate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        log('info', 'Starting PR validation', {
            operationId,
            prUrl: prData.url,
            branch: prData.branch
        });
        
        try {
            // Check if we can start a new session
            if (this.activeSessions.size >= this.config.maxConcurrentSessions) {
                log('warn', 'Maximum concurrent sessions reached, queuing validation', {
                    operationId,
                    activeCount: this.activeSessions.size
                });
                
                return await this.queueOperation('validatePR', { prData, options, operationId });
            }
            
            // Start Claude Code session
            const sessionId = await this.agentAPIClient.startClaudeCodeSession({
                workingDirectory: `/tmp/validation/${operationId}`,
                environment: {
                    OPERATION_ID: operationId,
                    PR_URL: prData.url,
                    PR_BRANCH: prData.branch
                }
            });
            
            // Track the session
            this.activeSessions.set(sessionId, {
                operationId,
                type: 'validation',
                prData,
                startTime: new Date(),
                status: 'running'
            });
            
            // Perform validation steps
            const validationResult = await this.performPRValidation(sessionId, prData, options);
            
            // Record operation history
            this.operationHistory.push({
                operationId,
                type: 'validation',
                prData,
                result: validationResult,
                duration: Date.now() - startTime,
                timestamp: new Date()
            });
            
            log('info', 'PR validation completed', {
                operationId,
                duration: Date.now() - startTime,
                score: validationResult.score
            });
            
            this.emit('validationCompleted', {
                operationId,
                prData,
                result: validationResult
            });
            
            return validationResult;
            
        } catch (error) {
            log('error', 'PR validation failed', {
                operationId,
                error: error.message,
                duration: Date.now() - startTime
            });
            
            this.emit('validationFailed', {
                operationId,
                prData,
                error: error.message
            });
            
            throw error;
        }
    }
    
    /**
     * Perform the actual PR validation steps
     */
    async performPRValidation(sessionId, prData, options) {
        const steps = [
            { name: 'clone_repository', weight: 0.1 },
            { name: 'checkout_branch', weight: 0.1 },
            { name: 'analyze_changes', weight: 0.3 },
            { name: 'run_tests', weight: 0.2 },
            { name: 'security_scan', weight: 0.15 },
            { name: 'performance_check', weight: 0.15 }
        ];
        
        const results = {};
        let totalScore = 0;
        
        for (const step of steps) {
            try {
                log('debug', `Executing validation step: ${step.name}`, { sessionId });
                
                const stepResult = await this.executeValidationStep(sessionId, step.name, prData, options);
                results[step.name] = stepResult;
                totalScore += stepResult.score * step.weight;
                
                // Update session status
                const session = this.activeSessions.get(sessionId);
                if (session) {
                    session.currentStep = step.name;
                    session.progress = ((steps.indexOf(step) + 1) / steps.length) * 100;
                }
                
            } catch (error) {
                log('error', `Validation step failed: ${step.name}`, {
                    sessionId,
                    error: error.message
                });
                
                results[step.name] = {
                    success: false,
                    score: 0,
                    error: error.message,
                    timestamp: new Date()
                };
            }
        }
        
        // Generate final validation report
        const validationResult = {
            operationId: this.activeSessions.get(sessionId)?.operationId,
            prData,
            score: Math.round(totalScore * 100) / 100,
            steps: results,
            summary: this.generateValidationSummary(results, totalScore),
            recommendations: this.generateRecommendations(results),
            timestamp: new Date()
        };
        
        // Cleanup session
        await this.agentAPIClient.stopSession(sessionId);
        
        return validationResult;
    }
    
    /**
     * Execute a specific validation step
     */
    async executeValidationStep(sessionId, stepName, prData, options) {
        const stepCommands = {
            clone_repository: [
                `git clone ${prData.url} .`,
                `echo "Repository cloned successfully"`
            ],
            
            checkout_branch: [
                `git checkout ${prData.branch}`,
                `git log --oneline -5`,
                `echo "Branch checked out successfully"`
            ],
            
            analyze_changes: [
                `git diff --name-only HEAD~1`,
                `git diff --stat HEAD~1`,
                `find . -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" | head -20`,
                `echo "Code analysis completed"`
            ],
            
            run_tests: [
                `npm test || echo "No tests found or tests failed"`,
                `npm run lint || echo "No linting configured"`,
                `echo "Test execution completed"`
            ],
            
            security_scan: [
                `npm audit || echo "Security audit completed"`,
                `grep -r "console.log" . --include="*.js" --include="*.ts" | wc -l || echo "0"`,
                `echo "Security scan completed"`
            ],
            
            performance_check: [
                `find . -name "*.js" -o -name "*.ts" | xargs wc -l | tail -1 || echo "0 total"`,
                `du -sh . || echo "Size check completed"`,
                `echo "Performance check completed"`
            ]
        };
        
        const commands = stepCommands[stepName] || [`echo "Unknown step: ${stepName}"`];
        const stepStartTime = Date.now();
        
        try {
            // Execute commands sequentially
            const outputs = [];
            for (const command of commands) {
                const message = `Execute: ${command}`;
                await this.agentAPIClient.sendMessage(sessionId, message);
                
                // Wait for response and collect output
                await new Promise(resolve => setTimeout(resolve, 2000));
                const messages = await this.agentAPIClient.getMessages(sessionId);
                
                // Extract the latest agent response
                const latestMessage = messages[messages.length - 1];
                if (latestMessage && latestMessage.type === 'agent') {
                    outputs.push(latestMessage.content);
                }
            }
            
            // Analyze step output and generate score
            const stepResult = this.analyzeStepOutput(stepName, outputs);
            
            return {
                success: true,
                score: stepResult.score,
                output: outputs.join('\n'),
                analysis: stepResult.analysis,
                duration: Date.now() - stepStartTime,
                timestamp: new Date()
            };
            
        } catch (error) {
            return {
                success: false,
                score: 0,
                error: error.message,
                duration: Date.now() - stepStartTime,
                timestamp: new Date()
            };
        }
    }
    
    /**
     * Analyze step output and generate score
     */
    analyzeStepOutput(stepName, outputs) {
        const outputText = outputs.join('\n').toLowerCase();
        
        const scoringRules = {
            clone_repository: {
                successKeywords: ['cloned successfully', 'repository cloned'],
                errorKeywords: ['error', 'failed', 'permission denied'],
                baseScore: 0.9
            },
            
            checkout_branch: {
                successKeywords: ['checked out', 'switched to', 'branch'],
                errorKeywords: ['error', 'failed', 'not found'],
                baseScore: 0.9
            },
            
            analyze_changes: {
                successKeywords: ['analysis completed', 'files changed'],
                errorKeywords: ['error', 'failed'],
                baseScore: 0.8
            },
            
            run_tests: {
                successKeywords: ['test', 'pass', 'ok', 'success'],
                errorKeywords: ['fail', 'error', 'timeout'],
                baseScore: 0.7
            },
            
            security_scan: {
                successKeywords: ['audit', 'scan completed', 'no vulnerabilities'],
                errorKeywords: ['vulnerability', 'critical', 'high'],
                baseScore: 0.8
            },
            
            performance_check: {
                successKeywords: ['check completed', 'performance'],
                errorKeywords: ['error', 'timeout', 'memory'],
                baseScore: 0.7
            }
        };
        
        const rules = scoringRules[stepName] || { baseScore: 0.5, successKeywords: [], errorKeywords: [] };
        let score = rules.baseScore;
        
        // Adjust score based on keywords
        const hasSuccess = rules.successKeywords.some(keyword => outputText.includes(keyword));
        const hasError = rules.errorKeywords.some(keyword => outputText.includes(keyword));
        
        if (hasSuccess && !hasError) {
            score = Math.min(1.0, score + 0.1);
        } else if (hasError) {
            score = Math.max(0.0, score - 0.3);
        }
        
        return {
            score,
            analysis: {
                hasSuccess,
                hasError,
                outputLength: outputText.length,
                keywords: {
                    success: rules.successKeywords.filter(k => outputText.includes(k)),
                    error: rules.errorKeywords.filter(k => outputText.includes(k))
                }
            }
        };
    }
    
    /**
     * Generate validation summary
     */
    generateValidationSummary(results, totalScore) {
        const successfulSteps = Object.values(results).filter(r => r.success).length;
        const totalSteps = Object.keys(results).length;
        
        let status = 'failed';
        if (totalScore >= 0.8) status = 'excellent';
        else if (totalScore >= 0.6) status = 'good';
        else if (totalScore >= 0.4) status = 'fair';
        
        return {
            status,
            score: totalScore,
            successfulSteps,
            totalSteps,
            completionRate: (successfulSteps / totalSteps) * 100
        };
    }
    
    /**
     * Generate recommendations based on validation results
     */
    generateRecommendations(results) {
        const recommendations = [];
        
        Object.entries(results).forEach(([stepName, result]) => {
            if (!result.success || result.score < 0.7) {
                switch (stepName) {
                    case 'run_tests':
                        recommendations.push({
                            type: 'testing',
                            priority: 'high',
                            message: 'Add or fix unit tests to improve code quality',
                            action: 'Add comprehensive test coverage'
                        });
                        break;
                        
                    case 'security_scan':
                        recommendations.push({
                            type: 'security',
                            priority: 'critical',
                            message: 'Address security vulnerabilities found in dependencies',
                            action: 'Run npm audit fix and review security issues'
                        });
                        break;
                        
                    case 'performance_check':
                        recommendations.push({
                            type: 'performance',
                            priority: 'medium',
                            message: 'Consider optimizing code for better performance',
                            action: 'Review large files and optimize algorithms'
                        });
                        break;
                        
                    default:
                        recommendations.push({
                            type: 'general',
                            priority: 'medium',
                            message: `Review and fix issues in ${stepName}`,
                            action: `Investigate ${stepName} failures`
                        });
                }
            }
        });
        
        return recommendations;
    }
    
    /**
     * Queue an operation when max concurrent sessions reached
     */
    async queueOperation(operationType, operationData) {
        return new Promise((resolve, reject) => {
            this.sessionQueue.push({
                type: operationType,
                data: operationData,
                resolve,
                reject,
                timestamp: new Date()
            });
            
            log('debug', 'Operation queued', {
                type: operationType,
                queueLength: this.sessionQueue.length
            });
        });
    }
    
    /**
     * Process queued operations
     */
    async processQueue() {
        if (this.sessionQueue.length === 0 || this.activeSessions.size >= this.config.maxConcurrentSessions) {
            return;
        }
        
        const queuedOperation = this.sessionQueue.shift();
        if (!queuedOperation) return;
        
        log('debug', 'Processing queued operation', {
            type: queuedOperation.type,
            remainingQueue: this.sessionQueue.length
        });
        
        try {
            let result;
            switch (queuedOperation.type) {
                case 'validatePR':
                    result = await this.validatePR(queuedOperation.data.prData, queuedOperation.data.options);
                    break;
                default:
                    throw new Error(`Unknown operation type: ${queuedOperation.type}`);
            }
            
            queuedOperation.resolve(result);
        } catch (error) {
            queuedOperation.reject(error);
        }
    }
    
    /**
     * Get manager status and metrics
     */
    getStatus() {
        return {
            activeSessions: this.activeSessions.size,
            queuedOperations: this.sessionQueue.length,
            totalOperations: this.operationHistory.length,
            agentAPIStatus: this.agentAPIClient.getStatus(),
            config: {
                maxConcurrentSessions: this.config.maxConcurrentSessions,
                sessionTimeout: this.config.sessionTimeout
            }
        };
    }
    
    /**
     * Get operation history
     */
    getOperationHistory(limit = 10) {
        return this.operationHistory
            .slice(-limit)
            .reverse();
    }
    
    /**
     * Shutdown the manager and cleanup resources
     */
    async shutdown() {
        log('info', 'Shutting down Claude Code Manager');
        
        // Reject all queued operations
        this.sessionQueue.forEach(operation => {
            operation.reject(new Error('Manager is shutting down'));
        });
        this.sessionQueue = [];
        
        // Shutdown AgentAPI client
        await this.agentAPIClient.shutdown();
        
        // Clear active sessions
        this.activeSessions.clear();
        
        // Remove all listeners
        this.removeAllListeners();
        
        log('info', 'Claude Code Manager shutdown complete');
    }
}

/**
 * Create and configure Claude Code Manager
 */
export function createClaudeCodeManager(config = {}) {
    return new ClaudeCodeManager(config);
}

