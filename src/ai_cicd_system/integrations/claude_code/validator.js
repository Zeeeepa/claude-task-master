/**
 * Claude Code Validator
 * 
 * Enhanced code validation interface that integrates with AgentAPI
 * to provide comprehensive PR validation and code quality analysis.
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { SimpleLogger } from '../../utils/simple_logger.js';
import AgentAPIClient from '../agentapi/client.js';

export class ClaudeCodeValidator extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            agentApiUrl: options.agentApiUrl || process.env.AGENTAPI_URL || 'http://localhost:3284',
            agentApiKey: options.agentApiKey || process.env.AGENTAPI_KEY,
            validationTimeout: options.validationTimeout || 30 * 60 * 1000, // 30 minutes
            maxConcurrentValidations: options.maxConcurrentValidations || 2,
            workspaceRoot: options.workspaceRoot || '/tmp/claude-validations',
            claudeCodePath: options.claudeCodePath || 'claude',
            enableDetailedAnalysis: options.enableDetailedAnalysis !== false,
            enableSecurityScan: options.enableSecurityScan !== false,
            enablePerformanceAnalysis: options.enablePerformanceAnalysis !== false,
            ...options
        };

        this.logger = new SimpleLogger('ClaudeCodeValidator', options.logLevel || 'info');
        this.agentApiClient = new AgentAPIClient({
            baseURL: this.config.agentApiUrl,
            apiKey: this.config.agentApiKey,
            logLevel: options.logLevel
        });

        this.activeValidations = new Map();
        this.validationQueue = [];
        this.isProcessingQueue = false;
        this.sessionId = null;

        this._initializeWorkspace();
        this._setupEventHandlers();
    }

    /**
     * Initialize workspace directory
     */
    _initializeWorkspace() {
        try {
            if (!existsSync(this.config.workspaceRoot)) {
                mkdirSync(this.config.workspaceRoot, { recursive: true });
            }
            this.logger.info(`Validation workspace initialized: ${this.config.workspaceRoot}`);
        } catch (error) {
            this.logger.error('Failed to initialize workspace:', error);
            throw error;
        }
    }

    /**
     * Setup event handlers
     */
    _setupEventHandlers() {
        this.agentApiClient.on('connected', () => {
            this.logger.info('Connected to AgentAPI');
            this.emit('agentapi.connected');
        });

        this.agentApiClient.on('disconnected', () => {
            this.logger.warn('Disconnected from AgentAPI');
            this.emit('agentapi.disconnected');
        });

        this.agentApiClient.on('message', (message) => {
            this._handleAgentMessage(message);
        });

        this.agentApiClient.on('connection_failed', (error) => {
            this.logger.error('AgentAPI connection failed:', error);
            this.emit('agentapi.connection_failed', error);
        });
    }

    /**
     * Initialize validator
     */
    async initialize() {
        try {
            this.logger.info('Initializing Claude Code Validator...');

            // Check Claude Code installation
            const claudeAvailable = await this._checkClaudeCodeInstallation();
            if (!claudeAvailable) {
                throw new Error('Claude Code CLI is not available');
            }

            // Connect to AgentAPI
            const connected = await this.agentApiClient.connect();
            if (!connected) {
                throw new Error('Failed to connect to AgentAPI');
            }

            // Start Claude Code session
            this.sessionId = await this._startClaudeCodeSession();
            if (!this.sessionId) {
                throw new Error('Failed to start Claude Code session');
            }

            this.logger.info('Claude Code Validator initialized successfully');
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize validator:', error);
            return false;
        }
    }

    /**
     * Check Claude Code installation
     */
    async _checkClaudeCodeInstallation() {
        try {
            const result = await this._executeCommand([this.config.claudeCodePath, '--version'], {
                timeout: 10000
            });
            
            this.logger.info(`Claude Code version: ${result.stdout}`);
            return true;
        } catch (error) {
            this.logger.error('Claude Code not found:', error);
            return false;
        }
    }

    /**
     * Start Claude Code session via AgentAPI
     */
    async _startClaudeCodeSession() {
        try {
            const sessionResult = await this.agentApiClient.startSession({
                agent: 'claude',
                arguments: ['--allowedTools', 'Bash(git*) Edit Replace'],
                environment: {
                    WORKSPACE: this.config.workspaceRoot
                }
            });

            if (sessionResult.success) {
                this.logger.info(`Claude Code session started: ${sessionResult.sessionId}`);
                return sessionResult.sessionId;
            } else {
                throw new Error(sessionResult.error);
            }
        } catch (error) {
            this.logger.error('Failed to start Claude Code session:', error);
            return null;
        }
    }

    /**
     * Validate PR
     */
    async validatePR(prInfo, options = {}) {
        try {
            const validationId = this._generateValidationId(prInfo);
            
            this.logger.info(`Starting PR validation: ${prInfo.repository}#${prInfo.number}`, {
                validationId,
                branch: prInfo.branch,
                options
            });

            // Check if we can start validation immediately
            if (this.activeValidations.size >= this.config.maxConcurrentValidations) {
                this.logger.info(`Validation queued (${this.validationQueue.length + 1} in queue)`);
                return this._queueValidation(validationId, prInfo, options);
            }

            return await this._executeValidation(validationId, prInfo, options);
        } catch (error) {
            this.logger.error('PR validation failed:', error);
            throw error;
        }
    }

    /**
     * Generate unique validation ID
     */
    _generateValidationId(prInfo) {
        const timestamp = Date.now();
        const hash = require('crypto')
            .createHash('md5')
            .update(`${prInfo.repository}-${prInfo.number}-${prInfo.branch}`)
            .digest('hex')
            .substring(0, 8);
        return `validation-${hash}-${timestamp}`;
    }

    /**
     * Queue validation for later execution
     */
    async _queueValidation(validationId, prInfo, options) {
        return new Promise((resolve, reject) => {
            this.validationQueue.push({
                validationId,
                prInfo,
                options,
                resolve,
                reject,
                queuedAt: new Date()
            });

            this._processValidationQueue();
        });
    }

    /**
     * Process validation queue
     */
    async _processValidationQueue() {
        if (this.isProcessingQueue || this.validationQueue.length === 0) {
            return;
        }

        if (this.activeValidations.size >= this.config.maxConcurrentValidations) {
            return;
        }

        this.isProcessingQueue = true;

        try {
            while (this.validationQueue.length > 0 && 
                   this.activeValidations.size < this.config.maxConcurrentValidations) {
                
                const validation = this.validationQueue.shift();
                
                try {
                    const result = await this._executeValidation(
                        validation.validationId,
                        validation.prInfo,
                        validation.options
                    );
                    validation.resolve(result);
                } catch (error) {
                    validation.reject(error);
                }
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    /**
     * Execute validation
     */
    async _executeValidation(validationId, prInfo, options) {
        const validation = {
            id: validationId,
            prInfo,
            options,
            status: 'initializing',
            startTime: new Date(),
            workspacePath: join(this.config.workspaceRoot, validationId),
            results: {},
            logs: []
        };

        this.activeValidations.set(validationId, validation);

        try {
            // Emit validation started event
            this.emit('validation.started', {
                validationId,
                prInfo,
                timestamp: new Date().toISOString()
            });

            // Step 1: Setup validation workspace
            await this._setupValidationWorkspace(validation);

            // Step 2: Clone and checkout PR
            await this._clonePR(validation);

            // Step 3: Analyze code structure
            await this._analyzeCodeStructure(validation);

            // Step 4: Run basic validation
            await this._runBasicValidation(validation);

            // Step 5: Run detailed analysis (if enabled)
            if (this.config.enableDetailedAnalysis) {
                await this._runDetailedAnalysis(validation);
            }

            // Step 6: Run security scan (if enabled)
            if (this.config.enableSecurityScan) {
                await this._runSecurityScan(validation);
            }

            // Step 7: Run performance analysis (if enabled)
            if (this.config.enablePerformanceAnalysis) {
                await this._runPerformanceAnalysis(validation);
            }

            // Step 8: Generate validation report
            const report = await this._generateValidationReport(validation);

            // Mark as completed
            validation.status = 'completed';
            validation.endTime = new Date();
            validation.report = report;

            this.emit('validation.completed', {
                validationId,
                report,
                duration: validation.endTime - validation.startTime,
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Validation completed successfully: ${validationId}`);

            // Process next in queue
            this._processValidationQueue();

            return {
                success: true,
                validationId,
                report,
                workspacePath: validation.workspacePath
            };

        } catch (error) {
            validation.status = 'failed';
            validation.endTime = new Date();
            validation.error = error.message;

            this.emit('validation.failed', {
                validationId,
                error: error.message,
                timestamp: new Date().toISOString()
            });

            this.logger.error(`Validation failed: ${validationId}`, error);

            // Process next in queue
            this._processValidationQueue();

            throw error;
        }
    }

    /**
     * Setup validation workspace
     */
    async _setupValidationWorkspace(validation) {
        try {
            validation.status = 'setting_up_workspace';
            
            // Create workspace directory
            if (!existsSync(validation.workspacePath)) {
                mkdirSync(validation.workspacePath, { recursive: true });
            }

            // Create subdirectories
            const subdirs = ['repo', 'analysis', 'reports', 'logs'];
            for (const subdir of subdirs) {
                const path = join(validation.workspacePath, subdir);
                if (!existsSync(path)) {
                    mkdirSync(path, { recursive: true });
                }
            }

            validation.logs.push({
                timestamp: new Date(),
                level: 'info',
                message: 'Validation workspace setup completed'
            });

        } catch (error) {
            throw new Error(`Workspace setup failed: ${error.message}`);
        }
    }

    /**
     * Clone PR
     */
    async _clonePR(validation) {
        try {
            validation.status = 'cloning_pr';
            const { prInfo } = validation;
            const repoPath = join(validation.workspacePath, 'repo');

            this.logger.info(`Cloning PR: ${prInfo.repository}#${prInfo.number}`);

            // Send clone command to Claude Code via AgentAPI
            const cloneCommand = `git clone ${prInfo.cloneUrl || `https://github.com/${prInfo.repository}.git`} ${repoPath} && cd ${repoPath} && git checkout ${prInfo.branch}`;
            
            const result = await this.agentApiClient.sendMessage(
                `Please clone the repository and checkout the PR branch:\n\`\`\`bash\n${cloneCommand}\n\`\`\``,
                'user'
            );

            if (!result.success) {
                throw new Error(`Failed to send clone command: ${result.error}`);
            }

            // Wait for completion
            await this._waitForCommandCompletion('clone');

            validation.logs.push({
                timestamp: new Date(),
                level: 'info',
                message: 'PR cloned successfully'
            });

        } catch (error) {
            throw new Error(`PR cloning failed: ${error.message}`);
        }
    }

    /**
     * Analyze code structure
     */
    async _analyzeCodeStructure(validation) {
        try {
            validation.status = 'analyzing_structure';
            const repoPath = join(validation.workspacePath, 'repo');

            this.logger.info('Analyzing code structure');

            const analysisCommand = `
                cd ${repoPath}
                echo "=== Project Structure ==="
                find . -type f -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.java" -o -name "*.go" | head -20
                echo "=== Package Files ==="
                find . -name "package.json" -o -name "requirements.txt" -o -name "pom.xml" -o -name "go.mod"
                echo "=== Configuration Files ==="
                find . -name "*.config.*" -o -name ".*rc" -o -name "*.yml" -o -name "*.yaml" | head -10
            `;

            const result = await this.agentApiClient.sendMessage(
                `Please analyze the project structure:\n\`\`\`bash\n${analysisCommand}\n\`\`\``,
                'user'
            );

            if (!result.success) {
                throw new Error(`Failed to send analysis command: ${result.error}`);
            }

            await this._waitForCommandCompletion('analysis');

            validation.results.structure = {
                analyzed: true,
                timestamp: new Date()
            };

        } catch (error) {
            throw new Error(`Code structure analysis failed: ${error.message}`);
        }
    }

    /**
     * Run basic validation
     */
    async _runBasicValidation(validation) {
        try {
            validation.status = 'running_basic_validation';
            const repoPath = join(validation.workspacePath, 'repo');

            this.logger.info('Running basic validation');

            const validationCommand = `
                cd ${repoPath}
                echo "=== Syntax Check ==="
                # Check for common syntax issues
                find . -name "*.js" -exec node -c {} \\; 2>&1 | head -10
                echo "=== Linting ==="
                # Run linting if available
                if [ -f "package.json" ]; then
                    npm run lint 2>&1 | head -20 || echo "No lint script found"
                fi
                echo "=== Tests ==="
                # Run tests if available
                if [ -f "package.json" ]; then
                    npm test 2>&1 | head -20 || echo "No test script found"
                fi
            `;

            const result = await this.agentApiClient.sendMessage(
                `Please run basic validation checks:\n\`\`\`bash\n${validationCommand}\n\`\`\``,
                'user'
            );

            if (!result.success) {
                throw new Error(`Failed to send validation command: ${result.error}`);
            }

            await this._waitForCommandCompletion('validation');

            validation.results.basicValidation = {
                completed: true,
                timestamp: new Date()
            };

        } catch (error) {
            throw new Error(`Basic validation failed: ${error.message}`);
        }
    }

    /**
     * Run detailed analysis
     */
    async _runDetailedAnalysis(validation) {
        try {
            validation.status = 'running_detailed_analysis';

            this.logger.info('Running detailed code analysis');

            const analysisPrompt = `
                Please perform a detailed code analysis of this PR. Focus on:
                1. Code quality and best practices
                2. Potential bugs or issues
                3. Performance considerations
                4. Architecture and design patterns
                5. Documentation quality
                6. Test coverage
                
                Provide specific recommendations for improvement.
            `;

            const result = await this.agentApiClient.sendMessage(analysisPrompt, 'user');

            if (!result.success) {
                throw new Error(`Failed to send analysis request: ${result.error}`);
            }

            await this._waitForCommandCompletion('detailed_analysis');

            validation.results.detailedAnalysis = {
                completed: true,
                timestamp: new Date()
            };

        } catch (error) {
            throw new Error(`Detailed analysis failed: ${error.message}`);
        }
    }

    /**
     * Run security scan
     */
    async _runSecurityScan(validation) {
        try {
            validation.status = 'running_security_scan';

            this.logger.info('Running security scan');

            const securityPrompt = `
                Please perform a security analysis of this code. Look for:
                1. Potential security vulnerabilities
                2. Hardcoded secrets or credentials
                3. Unsafe input handling
                4. Authentication and authorization issues
                5. Data exposure risks
                6. Dependency vulnerabilities
                
                Provide specific security recommendations.
            `;

            const result = await this.agentApiClient.sendMessage(securityPrompt, 'user');

            if (!result.success) {
                throw new Error(`Failed to send security scan request: ${result.error}`);
            }

            await this._waitForCommandCompletion('security_scan');

            validation.results.securityScan = {
                completed: true,
                timestamp: new Date()
            };

        } catch (error) {
            throw new Error(`Security scan failed: ${error.message}`);
        }
    }

    /**
     * Run performance analysis
     */
    async _runPerformanceAnalysis(validation) {
        try {
            validation.status = 'running_performance_analysis';

            this.logger.info('Running performance analysis');

            const performancePrompt = `
                Please analyze the performance characteristics of this code. Consider:
                1. Algorithm efficiency and complexity
                2. Memory usage patterns
                3. Database query optimization
                4. Caching strategies
                5. Async/await usage
                6. Bundle size and loading performance
                
                Provide specific performance optimization recommendations.
            `;

            const result = await this.agentApiClient.sendMessage(performancePrompt, 'user');

            if (!result.success) {
                throw new Error(`Failed to send performance analysis request: ${result.error}`);
            }

            await this._waitForCommandCompletion('performance_analysis');

            validation.results.performanceAnalysis = {
                completed: true,
                timestamp: new Date()
            };

        } catch (error) {
            throw new Error(`Performance analysis failed: ${error.message}`);
        }
    }

    /**
     * Generate validation report
     */
    async _generateValidationReport(validation) {
        try {
            this.logger.info('Generating validation report');

            const reportPrompt = `
                Please generate a comprehensive validation report for this PR. Include:
                1. Executive summary
                2. Code quality assessment
                3. Security findings
                4. Performance recommendations
                5. Test coverage analysis
                6. Overall recommendation (approve/request changes/reject)
                7. Priority-ordered action items
                
                Format the report in markdown.
            `;

            const result = await this.agentApiClient.sendMessage(reportPrompt, 'user');

            if (!result.success) {
                throw new Error(`Failed to generate report: ${result.error}`);
            }

            // Get the generated report
            const messages = await this.agentApiClient.getMessages(10);
            const reportMessage = messages.messages?.find(m => 
                m.type === 'agent' && m.content.includes('validation report')
            );

            const report = {
                validationId: validation.id,
                prInfo: validation.prInfo,
                startTime: validation.startTime,
                endTime: validation.endTime,
                duration: validation.endTime - validation.startTime,
                results: validation.results,
                content: reportMessage?.content || 'Report generation failed',
                timestamp: new Date().toISOString()
            };

            // Save report to file
            const reportPath = join(validation.workspacePath, 'reports', 'validation-report.md');
            writeFileSync(reportPath, report.content);

            return report;

        } catch (error) {
            throw new Error(`Report generation failed: ${error.message}`);
        }
    }

    /**
     * Wait for command completion
     */
    async _waitForCommandCompletion(operation, timeout = 60000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkStatus = async () => {
                try {
                    const status = await this.agentApiClient.getStatus();
                    
                    if (status.success && status.status === 'stable') {
                        resolve();
                        return;
                    }

                    if (Date.now() - startTime > timeout) {
                        reject(new Error(`Operation ${operation} timed out`));
                        return;
                    }

                    setTimeout(checkStatus, 2000); // Check every 2 seconds
                } catch (error) {
                    reject(error);
                }
            };

            checkStatus();
        });
    }

    /**
     * Handle agent messages
     */
    _handleAgentMessage(message) {
        this.logger.debug('Received agent message:', message);
        
        // Process different types of messages
        if (message.type === 'status_update') {
            this.emit('status_update', message.data);
        } else if (message.type === 'validation_progress') {
            this.emit('validation_progress', message.data);
        }
    }

    /**
     * Execute command
     */
    async _executeCommand(args, options = {}) {
        return new Promise((resolve, reject) => {
            const process = spawn(args[0], args.slice(1), {
                stdio: 'pipe',
                ...options
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            const timer = setTimeout(() => {
                process.kill('SIGKILL');
                reject(new Error(`Command timeout: ${args.join(' ')}`));
            }, options.timeout || 30000);

            process.on('close', (code) => {
                clearTimeout(timer);
                resolve({
                    exitCode: code,
                    stdout: stdout.trim(),
                    stderr: stderr.trim()
                });
            });

            process.on('error', (error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    /**
     * Get validation status
     */
    getValidationStatus(validationId) {
        const validation = this.activeValidations.get(validationId);
        if (!validation) {
            return null;
        }

        return {
            id: validation.id,
            status: validation.status,
            prInfo: validation.prInfo,
            startTime: validation.startTime,
            endTime: validation.endTime,
            duration: validation.endTime ? 
                validation.endTime - validation.startTime : 
                Date.now() - validation.startTime.getTime(),
            results: validation.results,
            logs: validation.logs.slice(-5) // Last 5 log entries
        };
    }

    /**
     * List all validations
     */
    listValidations() {
        return Array.from(this.activeValidations.values()).map(validation => ({
            id: validation.id,
            status: validation.status,
            prNumber: validation.prInfo.number,
            repository: validation.prInfo.repository,
            branch: validation.prInfo.branch,
            startTime: validation.startTime,
            duration: validation.endTime ? 
                validation.endTime - validation.startTime : 
                Date.now() - validation.startTime.getTime()
        }));
    }

    /**
     * Stop validation
     */
    async stopValidation(validationId, reason = 'manual') {
        const validation = this.activeValidations.get(validationId);
        if (!validation) {
            return false;
        }

        try {
            validation.status = 'stopping';
            validation.endTime = new Date();

            this.emit('validation.stopped', {
                validationId,
                reason,
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Validation stopped: ${validationId} (${reason})`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to stop validation ${validationId}:`, error);
            return false;
        }
    }

    /**
     * Get validation statistics
     */
    getStats() {
        return {
            activeValidations: this.activeValidations.size,
            queuedValidations: this.validationQueue.length,
            maxConcurrent: this.config.maxConcurrentValidations,
            sessionId: this.sessionId,
            agentApiConnected: this.agentApiClient.getConnectionStatus().isConnected
        };
    }

    /**
     * Shutdown validator
     */
    async shutdown() {
        try {
            // Stop all active validations
            const stopPromises = Array.from(this.activeValidations.keys())
                .map(id => this.stopValidation(id, 'shutdown'));
            
            await Promise.all(stopPromises);

            // Stop Claude Code session
            if (this.sessionId) {
                await this.agentApiClient.stopSession(this.sessionId);
            }

            // Disconnect from AgentAPI
            await this.agentApiClient.disconnect();

            this.logger.info('Claude Code Validator shutdown completed');
        } catch (error) {
            this.logger.error('Error during shutdown:', error);
        }
    }
}

export default ClaudeCodeValidator;

