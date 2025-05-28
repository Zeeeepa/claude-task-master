/**
 * @fileoverview Enhanced Claude Code Execution Engine
 * @description Comprehensive Claude Code integration for automated PR validation with robustness upgrades
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { log } from '../../../scripts/modules/utils.js';
import { WorkspaceManager } from './workspace_manager.js';
import { ValidationPipeline } from '../validation/validation_pipeline.js';
import { ResultProcessor } from './result_processor.js';
import { SecuritySandbox } from './security_sandbox.js';

/**
 * Enhanced Claude Code Execution Engine with comprehensive validation capabilities
 */
export class ClaudeCodeExecutor {
    constructor(config = {}) {
        this.config = {
            claude_code_path: config.claude_code_path || '/usr/local/bin/claude-code',
            working_directory: config.working_directory || join(tmpdir(), 'claude-workspaces'),
            timeout: config.timeout || 600000, // 10 minutes
            max_retries: config.max_retries || 3,
            max_concurrent_validations: config.max_concurrent_validations || 10,
            enable_security_sandbox: config.enable_security_sandbox !== false,
            enable_performance_monitoring: config.enable_performance_monitoring !== false,
            validation_memory_limit: config.validation_memory_limit || '512MB',
            validation_cpu_limit: config.validation_cpu_limit || 1.0,
            validation_disk_limit: config.validation_disk_limit || '1GB',
            network_isolation: config.network_isolation !== false,
            git_clone_depth: config.git_clone_depth || 50,
            git_timeout: config.git_timeout || 300000,
            cleanup_interval: config.cleanup_interval || 3600000, // 1 hour
            ...config
        };

        this.workspaceManager = new WorkspaceManager(this.config);
        this.validationPipeline = new ValidationPipeline(this.config);
        this.resultProcessor = new ResultProcessor(this.config);
        this.securitySandbox = new SecuritySandbox(this.config);
        
        this.activeValidations = new Map();
        this.validationQueue = [];
        this.performanceMetrics = {
            total_validations: 0,
            successful_validations: 0,
            failed_validations: 0,
            average_duration: 0,
            peak_concurrent: 0
        };

        // Start cleanup interval
        this.cleanupInterval = setInterval(() => {
            this.performCleanup().catch(error => 
                log('warning', `Cleanup failed: ${error.message}`)
            );
        }, this.config.cleanup_interval);
    }

    /**
     * Initialize the Claude Code executor
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            log('info', 'Initializing Claude Code Executor...');
            
            // Validate Claude Code installation
            await this.validateClaudeCodeInstallation();
            
            // Initialize workspace manager
            await this.workspaceManager.initialize();
            
            // Initialize security sandbox
            if (this.config.enable_security_sandbox) {
                await this.securitySandbox.initialize();
            }
            
            // Initialize validation pipeline
            await this.validationPipeline.initialize();
            
            log('info', 'Claude Code Executor initialized successfully');
            return true;
        } catch (error) {
            log('error', `Failed to initialize Claude Code Executor: ${error.message}`);
            return false;
        }
    }

    /**
     * Validate PR with comprehensive analysis and error context generation
     * @param {Object} prData - PR information
     * @param {Object} taskContext - Task context for validation
     * @returns {Promise<Object>} Comprehensive validation result
     */
    async validatePR(prData, taskContext = {}) {
        const validationId = this.generateValidationId();
        const startTime = Date.now();
        
        log('info', `Starting PR validation ${validationId} for PR #${prData.number || prData.id}`);
        
        try {
            // Check concurrent validation limits
            await this.enforceValidationLimits();
            
            // Track active validation
            this.activeValidations.set(validationId, {
                pr_data: prData,
                task_context: taskContext,
                started_at: new Date(),
                status: 'initializing'
            });

            // Update peak concurrent metric
            this.performanceMetrics.peak_concurrent = Math.max(
                this.performanceMetrics.peak_concurrent,
                this.activeValidations.size
            );

            // Step 1: Create secure workspace
            log('debug', `Creating workspace for validation ${validationId}`);
            const workspace = await this.workspaceManager.createWorkspace(prData, validationId);
            
            this.activeValidations.get(validationId).workspace = workspace;
            this.activeValidations.get(validationId).status = 'workspace_created';

            try {
                // Step 2: Clone repository and checkout PR branch
                log('debug', `Cloning repository for validation ${validationId}`);
                await this.cloneRepository(workspace, prData);
                this.activeValidations.get(validationId).status = 'repository_cloned';

                // Step 3: Setup secure environment
                let secureEnvironment = null;
                if (this.config.enable_security_sandbox) {
                    log('debug', `Setting up secure environment for validation ${validationId}`);
                    secureEnvironment = await this.securitySandbox.createSecureEnvironment(workspace);
                    this.activeValidations.get(validationId).secure_environment = secureEnvironment;
                }

                // Step 4: Execute comprehensive validation pipeline
                log('debug', `Running validation pipeline for validation ${validationId}`);
                this.activeValidations.get(validationId).status = 'validating';
                
                const validationResult = await this.validationPipeline.runValidation(
                    workspace, 
                    prData, 
                    taskContext,
                    secureEnvironment
                );

                // Step 5: Process results and generate error contexts
                log('debug', `Processing results for validation ${validationId}`);
                const processedResult = await this.resultProcessor.processValidationResult(
                    validationResult,
                    prData,
                    taskContext,
                    validationId
                );

                // Step 6: Generate comprehensive report
                const report = await this.generateValidationReport(
                    processedResult,
                    prData,
                    taskContext,
                    validationId,
                    Date.now() - startTime
                );

                // Update metrics
                this.performanceMetrics.total_validations++;
                this.performanceMetrics.successful_validations++;
                this.updateAverageDuration(Date.now() - startTime);

                log('info', `PR validation ${validationId} completed successfully in ${Date.now() - startTime}ms`);
                
                return {
                    validation_id: validationId,
                    status: 'success',
                    pr_data: prData,
                    task_context: taskContext,
                    validation_result: processedResult,
                    report: report,
                    duration_ms: Date.now() - startTime,
                    workspace_path: workspace.path,
                    validated_at: new Date()
                };

            } finally {
                // Cleanup secure environment
                if (this.activeValidations.get(validationId)?.secure_environment) {
                    try {
                        await this.securitySandbox.cleanup(
                            this.activeValidations.get(validationId).secure_environment
                        );
                    } catch (cleanupError) {
                        log('warning', `Secure environment cleanup failed: ${cleanupError.message}`);
                    }
                }

                // Cleanup workspace
                try {
                    await this.workspaceManager.cleanupWorkspace(workspace);
                } catch (cleanupError) {
                    log('warning', `Workspace cleanup failed: ${cleanupError.message}`);
                }
            }

        } catch (error) {
            log('error', `PR validation ${validationId} failed: ${error.message}`);
            
            // Update metrics
            this.performanceMetrics.total_validations++;
            this.performanceMetrics.failed_validations++;
            this.updateAverageDuration(Date.now() - startTime);

            // Generate error context for Codegen
            const errorContext = await this.generateErrorContext(error, prData, taskContext, validationId);

            return {
                validation_id: validationId,
                status: 'error',
                pr_data: prData,
                task_context: taskContext,
                error: error.message,
                error_context: errorContext,
                duration_ms: Date.now() - startTime,
                validated_at: new Date()
            };

        } finally {
            // Remove from active validations
            this.activeValidations.delete(validationId);
        }
    }

    /**
     * Execute Claude Code validation with enhanced error handling
     * @param {Object} workspace - Workspace information
     * @param {Object} prData - PR data
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Claude Code execution result
     */
    async executeValidation(workspace, prData, options = {}) {
        const command = [
            this.config.claude_code_path,
            '--validate',
            '--branch', prData.branch || prData.head?.ref || 'main',
            '--output-format', 'json',
            '--timeout', Math.floor(this.config.timeout / 1000).toString()
        ];

        // Add optional validation flags
        if (options.include_tests !== false) command.push('--include-tests');
        if (options.include_linting !== false) command.push('--include-linting');
        if (options.include_security_scan !== false) command.push('--include-security-scan');
        if (options.include_performance !== false) command.push('--include-performance');

        // Add workspace path
        command.push('--workspace', workspace.path);

        return await this.executeCommand(command, workspace.path, options);
    }

    /**
     * Execute command with enhanced error handling and retry logic
     * @param {Array} command - Command to execute
     * @param {string} cwd - Working directory
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Command execution result
     */
    async executeCommand(command, cwd, options = {}) {
        const maxRetries = options.retries || this.config.max_retries;
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                log('debug', `Executing command (attempt ${attempt}/${maxRetries}): ${command.join(' ')}`);
                
                const result = await this.runCommand(command, cwd, options);
                
                if (result.success) {
                    return result;
                }
                
                lastError = new Error(`Command failed with exit code ${result.code}: ${result.stderr}`);
                
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff
                    log('warning', `Command failed, retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
            } catch (error) {
                lastError = error;
                
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    log('warning', `Command error, retrying in ${delay}ms: ${error.message}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    log('error', `Command failed after ${maxRetries} attempts: ${error.message}`);
                }
            }
        }

        throw lastError;
    }

    /**
     * Run command with timeout and resource monitoring
     * @param {Array} command - Command to execute
     * @param {string} cwd - Working directory
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Command result
     */
    async runCommand(command, cwd, options = {}) {
        return new Promise((resolve, reject) => {
            const timeout = options.timeout || this.config.timeout;
            const startTime = Date.now();
            
            const process = spawn(command[0], command.slice(1), {
                cwd,
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    ...options.env
                }
            });

            let stdout = '';
            let stderr = '';
            let timedOut = false;

            // Set up timeout
            const timeoutId = setTimeout(() => {
                timedOut = true;
                process.kill('SIGTERM');
                
                // Force kill after 5 seconds
                setTimeout(() => {
                    if (!process.killed) {
                        process.kill('SIGKILL');
                    }
                }, 5000);
            }, timeout);

            // Collect output
            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            // Handle process completion
            process.on('close', (code) => {
                clearTimeout(timeoutId);
                
                const duration = Date.now() - startTime;
                
                if (timedOut) {
                    reject(new Error(`Command timed out after ${timeout}ms`));
                    return;
                }

                resolve({
                    success: code === 0,
                    code,
                    stdout,
                    stderr,
                    duration,
                    command: command.join(' ')
                });
            });

            process.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });

            // Send input if provided
            if (options.input) {
                process.stdin.write(options.input);
                process.stdin.end();
            }
        });
    }

    /**
     * Clone repository with enhanced error handling
     * @param {Object} workspace - Workspace information
     * @param {Object} prData - PR data
     * @returns {Promise<void>}
     */
    async cloneRepository(workspace, prData) {
        const repoUrl = prData.repository?.clone_url || prData.repo_url;
        const branch = prData.branch || prData.head?.ref || 'main';
        
        if (!repoUrl) {
            throw new Error('Repository URL not provided in PR data');
        }

        log('debug', `Cloning repository ${repoUrl} branch ${branch} to ${workspace.path}`);

        // Clone with shallow depth for performance
        const cloneCommand = [
            'git', 'clone',
            '--depth', this.config.git_clone_depth.toString(),
            '--branch', branch,
            '--single-branch',
            repoUrl,
            workspace.path
        ];

        await this.executeCommand(cloneCommand, workspace.parent_path, {
            timeout: this.config.git_timeout
        });

        // Install dependencies if package.json exists
        const packageJsonPath = join(workspace.path, 'package.json');
        if (await this.fileExists(packageJsonPath)) {
            log('debug', 'Installing dependencies...');
            await this.executeCommand(['npm', 'install'], workspace.path, {
                timeout: this.config.git_timeout
            });
        }
    }

    /**
     * Generate comprehensive validation report
     * @param {Object} validationResult - Processed validation result
     * @param {Object} prData - PR data
     * @param {Object} taskContext - Task context
     * @param {string} validationId - Validation ID
     * @param {number} duration - Validation duration
     * @returns {Promise<Object>} Validation report
     */
    async generateValidationReport(validationResult, prData, taskContext, validationId, duration) {
        return {
            validation_id: validationId,
            pr_number: prData.number || prData.id,
            pr_title: prData.title,
            pr_author: prData.author?.login || prData.author,
            task_id: taskContext.task_id,
            
            // Overall status and scores
            overall_status: validationResult.overall_status,
            overall_score: validationResult.overall_score,
            grade: validationResult.grade,
            
            // Detailed results by stage
            validation_stages: validationResult.stages,
            
            // Error contexts for Codegen
            error_contexts: validationResult.error_contexts || [],
            
            // Performance metrics
            performance_metrics: {
                total_duration_ms: duration,
                stage_durations: validationResult.stage_durations,
                files_analyzed: validationResult.files_analyzed,
                lines_of_code: validationResult.lines_of_code,
                memory_usage_mb: validationResult.memory_usage_mb,
                cpu_usage_percent: validationResult.cpu_usage_percent
            },
            
            // Recommendations and suggestions
            recommendations: validationResult.recommendations || [],
            suggestions: validationResult.suggestions || [],
            
            // Quality gates
            quality_gates: validationResult.quality_gates || {},
            
            // Security findings
            security_findings: validationResult.security_findings || [],
            
            // Generated at
            generated_at: new Date(),
            
            // Metadata
            metadata: {
                claude_code_version: await this.getClaudeCodeVersion(),
                validation_config: this.config,
                workspace_path: validationResult.workspace_path
            }
        };
    }

    /**
     * Generate error context for Codegen processing
     * @param {Error} error - The error that occurred
     * @param {Object} prData - PR data
     * @param {Object} taskContext - Task context
     * @param {string} validationId - Validation ID
     * @returns {Promise<Object>} Error context for Codegen
     */
    async generateErrorContext(error, prData, taskContext, validationId) {
        return {
            error_id: `err_${validationId}_${Date.now()}`,
            validation_id: validationId,
            error_type: error.constructor.name,
            error_message: error.message,
            error_stack: error.stack,
            
            // Context for Codegen
            codegen_context: {
                pr_info: {
                    number: prData.number || prData.id,
                    title: prData.title,
                    branch: prData.branch || prData.head?.ref,
                    repository: prData.repository?.full_name || prData.repo_name
                },
                task_info: {
                    task_id: taskContext.task_id,
                    requirements: taskContext.requirements || [],
                    acceptance_criteria: taskContext.acceptance_criteria || []
                },
                error_category: this.categorizeError(error),
                suggested_actions: this.generateSuggestedActions(error),
                related_files: await this.identifyRelatedFiles(error, prData),
                debugging_hints: this.generateDebuggingHints(error)
            },
            
            // System context
            system_context: {
                timestamp: new Date(),
                executor_config: this.config,
                active_validations: this.activeValidations.size,
                system_resources: await this.getSystemResources()
            }
        };
    }

    /**
     * Utility methods
     */

    generateValidationId() {
        return `val_${Date.now()}_${randomBytes(4).toString('hex')}`;
    }

    async validateClaudeCodeInstallation() {
        try {
            const result = await this.runCommand([this.config.claude_code_path, '--version'], process.cwd(), {
                timeout: 10000
            });
            
            if (!result.success) {
                throw new Error('Claude Code CLI not accessible');
            }
            
            log('debug', `Claude Code version: ${result.stdout.trim()}`);
        } catch (error) {
            throw new Error(`Claude Code installation validation failed: ${error.message}`);
        }
    }

    async enforceValidationLimits() {
        if (this.activeValidations.size >= this.config.max_concurrent_validations) {
            throw new Error(`Maximum concurrent validations (${this.config.max_concurrent_validations}) exceeded`);
        }
    }

    async fileExists(path) {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }

    updateAverageDuration(duration) {
        const total = this.performanceMetrics.total_validations;
        const current = this.performanceMetrics.average_duration;
        this.performanceMetrics.average_duration = ((current * (total - 1)) + duration) / total;
    }

    categorizeError(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('timeout')) return 'timeout';
        if (message.includes('memory')) return 'memory';
        if (message.includes('permission') || message.includes('access')) return 'permission';
        if (message.includes('network') || message.includes('connection')) return 'network';
        if (message.includes('git') || message.includes('clone')) return 'git';
        if (message.includes('dependency') || message.includes('install')) return 'dependency';
        
        return 'unknown';
    }

    generateSuggestedActions(error) {
        const category = this.categorizeError(error);
        
        const actions = {
            timeout: ['Increase validation timeout', 'Optimize validation pipeline', 'Check system resources'],
            memory: ['Increase memory limits', 'Optimize memory usage', 'Check for memory leaks'],
            permission: ['Check file permissions', 'Verify user access rights', 'Review security settings'],
            network: ['Check network connectivity', 'Verify repository access', 'Review firewall settings'],
            git: ['Verify repository URL', 'Check branch existence', 'Review git configuration'],
            dependency: ['Check package.json', 'Verify dependency availability', 'Review installation logs'],
            unknown: ['Review error logs', 'Check system status', 'Contact support']
        };
        
        return actions[category] || actions.unknown;
    }

    async identifyRelatedFiles(error, prData) {
        // This would analyze the error and PR data to identify relevant files
        // For now, return basic file list
        return prData.changed_files || [];
    }

    generateDebuggingHints(error) {
        return [
            `Error occurred at: ${new Date().toISOString()}`,
            `Error type: ${error.constructor.name}`,
            `Check logs for more details`,
            `Verify system resources and configuration`
        ];
    }

    async getClaudeCodeVersion() {
        try {
            const result = await this.runCommand([this.config.claude_code_path, '--version'], process.cwd(), {
                timeout: 5000
            });
            return result.stdout.trim();
        } catch {
            return 'unknown';
        }
    }

    async getSystemResources() {
        // Basic system resource information
        return {
            memory_usage: process.memoryUsage(),
            uptime: process.uptime(),
            platform: process.platform,
            node_version: process.version
        };
    }

    async performCleanup() {
        log('debug', 'Performing periodic cleanup...');
        
        // Cleanup old workspaces
        await this.workspaceManager.cleanupOldWorkspaces();
        
        // Cleanup orphaned containers
        if (this.config.enable_security_sandbox) {
            await this.securitySandbox.cleanupOrphanedContainers();
        }
        
        log('debug', 'Periodic cleanup completed');
    }

    /**
     * Get executor health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        return {
            status: 'healthy',
            active_validations: this.activeValidations.size,
            performance_metrics: this.performanceMetrics,
            config: {
                max_concurrent_validations: this.config.max_concurrent_validations,
                timeout: this.config.timeout,
                enable_security_sandbox: this.config.enable_security_sandbox
            },
            components: {
                workspace_manager: await this.workspaceManager.getHealth(),
                validation_pipeline: await this.validationPipeline.getHealth(),
                security_sandbox: this.config.enable_security_sandbox ? 
                    await this.securitySandbox.getHealth() : null
            }
        };
    }

    /**
     * Shutdown the executor
     */
    async shutdown() {
        log('info', 'Shutting down Claude Code Executor...');
        
        // Clear cleanup interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Wait for active validations to complete (with timeout)
        const shutdownTimeout = 30000; // 30 seconds
        const startTime = Date.now();
        
        while (this.activeValidations.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
            log('info', `Waiting for ${this.activeValidations.size} active validations to complete...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Force cleanup remaining validations
        if (this.activeValidations.size > 0) {
            log('warning', `Force cleaning up ${this.activeValidations.size} remaining validations`);
            this.activeValidations.clear();
        }
        
        // Shutdown components
        await this.workspaceManager.shutdown();
        await this.validationPipeline.shutdown();
        
        if (this.config.enable_security_sandbox) {
            await this.securitySandbox.shutdown();
        }
        
        log('info', 'Claude Code Executor shutdown complete');
    }
}

export default ClaudeCodeExecutor;

