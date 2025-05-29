/**
 * Claude Interface - Claude Code communication layer
 * Handles communication with Claude Code through webClientConfirmation
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import { configManager } from '../../utils/config-manager.js';

class ClaudeInterface extends EventEmitter {
    constructor() {
        super();
        this.claudeProcess = null;
        this.isConnected = false;
        this.pendingActions = new Map();
        this.claudeCodePath = configManager.get('claude.codePath', '/usr/local/bin/claude-code');
        this.workingDirectory = configManager.get('claude.workingDirectory', process.cwd());
        this.connectionRetries = 0;
        this.maxRetries = 3;
    }

    /**
     * Initialize Claude Code connection
     */
    async initialize() {
        try {
            logger.info('Initializing Claude Code interface...');
            
            // Check if Claude Code is available
            await this.checkClaudeCodeAvailability();
            
            // Start Claude Code process
            await this.startClaudeProcess();
            
            this.isConnected = true;
            this.emit('connected');
            
            logger.info('Claude Code interface initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Claude Code interface:', error);
            throw error;
        }
    }

    /**
     * Check if Claude Code is available
     */
    async checkClaudeCodeAvailability() {
        return new Promise((resolve, reject) => {
            const checkProcess = spawn('which', ['claude-code'], {
                stdio: 'pipe'
            });

            checkProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error('Claude Code not found in PATH. Please install Claude Code.'));
                }
            });

            checkProcess.on('error', (error) => {
                reject(new Error(`Failed to check Claude Code availability: ${error.message}`));
            });
        });
    }

    /**
     * Start Claude Code process
     */
    async startClaudeProcess() {
        return new Promise((resolve, reject) => {
            const args = [
                '--api-mode',
                '--working-directory', this.workingDirectory,
                '--confirm-mode', 'web'
            ];

            this.claudeProcess = spawn(this.claudeCodePath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: this.workingDirectory
            });

            this.claudeProcess.stdout.on('data', (data) => {
                this.handleClaudeOutput(data.toString());
            });

            this.claudeProcess.stderr.on('data', (data) => {
                logger.warn('Claude Code stderr:', data.toString());
            });

            this.claudeProcess.on('close', (code) => {
                logger.info(`Claude Code process exited with code ${code}`);
                this.isConnected = false;
                this.emit('disconnected', code);
                
                // Attempt to reconnect if unexpected exit
                if (code !== 0 && this.connectionRetries < this.maxRetries) {
                    this.connectionRetries++;
                    logger.info(`Attempting to reconnect to Claude Code (attempt ${this.connectionRetries}/${this.maxRetries})`);
                    setTimeout(() => this.initialize(), 5000);
                }
            });

            this.claudeProcess.on('error', (error) => {
                logger.error('Claude Code process error:', error);
                reject(error);
            });

            // Wait for Claude Code to be ready
            setTimeout(() => {
                if (this.claudeProcess && !this.claudeProcess.killed) {
                    resolve();
                } else {
                    reject(new Error('Claude Code process failed to start'));
                }
            }, 2000);
        });
    }

    /**
     * Handle output from Claude Code
     */
    handleClaudeOutput(output) {
        try {
            const lines = output.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                if (line.startsWith('{') && line.endsWith('}')) {
                    // Parse JSON output
                    const data = JSON.parse(line);
                    this.handleClaudeMessage(data);
                } else {
                    // Regular text output
                    logger.debug('Claude Code output:', line);
                    this.emit('output', line);
                }
            }
        } catch (error) {
            logger.error('Error parsing Claude Code output:', error);
        }
    }

    /**
     * Handle structured messages from Claude Code
     */
    handleClaudeMessage(message) {
        switch (message.type) {
            case 'confirmation_request':
                this.handleConfirmationRequest(message);
                break;
            case 'task_completed':
                this.handleTaskCompleted(message);
                break;
            case 'error':
                this.handleError(message);
                break;
            case 'status_update':
                this.handleStatusUpdate(message);
                break;
            default:
                logger.debug('Unknown Claude Code message type:', message.type);
                this.emit('message', message);
        }
    }

    /**
     * Handle confirmation requests from Claude Code
     */
    handleConfirmationRequest(message) {
        const actionId = this.generateActionId();
        const action = {
            id: actionId,
            type: message.action_type,
            description: message.description,
            details: message.details,
            timestamp: Date.now(),
            status: 'pending'
        };

        this.pendingActions.set(actionId, action);
        
        this.emit('confirmationRequired', action);
        
        logger.info(`Confirmation required for action: ${actionId}`, {
            type: action.type,
            description: action.description
        });
    }

    /**
     * Handle task completion from Claude Code
     */
    handleTaskCompleted(message) {
        this.emit('taskCompleted', {
            taskId: message.task_id,
            result: message.result,
            timestamp: Date.now()
        });
        
        logger.info(`Task completed: ${message.task_id}`);
    }

    /**
     * Handle errors from Claude Code
     */
    handleError(message) {
        const error = {
            code: message.error_code,
            message: message.error_message,
            details: message.details,
            timestamp: Date.now()
        };

        this.emit('error', error);
        
        logger.error(`Claude Code error: ${error.code} - ${error.message}`);
    }

    /**
     * Handle status updates from Claude Code
     */
    handleStatusUpdate(message) {
        this.emit('statusUpdate', {
            status: message.status,
            details: message.details,
            timestamp: Date.now()
        });
        
        logger.debug(`Claude Code status update: ${message.status}`);
    }

    /**
     * Execute a command in Claude Code
     */
    async executeCommand(command, parameters = {}, sessionId = null) {
        if (!this.isConnected) {
            throw new Error('Claude Code is not connected');
        }

        const commandData = {
            type: 'command',
            command,
            parameters,
            session_id: sessionId,
            timestamp: Date.now()
        };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Command execution timeout'));
            }, 30000);

            const handleResponse = (response) => {
                if (response.command_id === commandData.timestamp) {
                    clearTimeout(timeout);
                    this.removeListener('commandResponse', handleResponse);
                    
                    if (response.success) {
                        resolve(response.result);
                    } else {
                        reject(new Error(response.error));
                    }
                }
            };

            this.on('commandResponse', handleResponse);
            
            // Send command to Claude Code
            this.sendToClaudeCode(commandData);
        });
    }

    /**
     * Confirm or deny a pending action
     */
    async confirmAction(actionId, confirmed, sessionId = null) {
        const action = this.pendingActions.get(actionId);
        
        if (!action) {
            throw new Error(`Action not found: ${actionId}`);
        }

        action.status = confirmed ? 'confirmed' : 'denied';
        action.confirmedAt = Date.now();

        const confirmationData = {
            type: 'confirmation',
            action_id: actionId,
            confirmed,
            session_id: sessionId,
            timestamp: Date.now()
        };

        // Send confirmation to Claude Code
        this.sendToClaudeCode(confirmationData);

        if (confirmed) {
            logger.info(`Action confirmed: ${actionId}`);
        } else {
            logger.info(`Action denied: ${actionId}`);
        }

        // Clean up after some time
        setTimeout(() => {
            this.pendingActions.delete(actionId);
        }, 300000); // 5 minutes

        return action;
    }

    /**
     * Send data to Claude Code process
     */
    sendToClaudeCode(data) {
        if (!this.claudeProcess || this.claudeProcess.killed) {
            throw new Error('Claude Code process is not running');
        }

        const jsonData = JSON.stringify(data) + '\n';
        this.claudeProcess.stdin.write(jsonData);
        
        logger.debug('Sent to Claude Code:', data);
    }

    /**
     * Get current status
     */
    async getStatus() {
        return {
            isConnected: this.isConnected,
            processId: this.claudeProcess ? this.claudeProcess.pid : null,
            workingDirectory: this.workingDirectory,
            pendingActions: this.pendingActions.size,
            connectionRetries: this.connectionRetries
        };
    }

    /**
     * Get pending actions
     */
    getPendingActions() {
        return Array.from(this.pendingActions.values());
    }

    /**
     * Get specific action
     */
    getAction(actionId) {
        return this.pendingActions.get(actionId);
    }

    /**
     * Send a message to Claude Code
     */
    async sendMessage(message, sessionId = null) {
        const messageData = {
            type: 'message',
            content: message,
            session_id: sessionId,
            timestamp: Date.now()
        };

        return this.executeCommand('send_message', messageData, sessionId);
    }

    /**
     * Request file operations
     */
    async requestFileOperation(operation, filePath, content = null, sessionId = null) {
        const operationData = {
            operation, // 'read', 'write', 'create', 'delete'
            file_path: filePath,
            content,
            session_id: sessionId
        };

        return this.executeCommand('file_operation', operationData, sessionId);
    }

    /**
     * Request code analysis
     */
    async requestCodeAnalysis(filePath, analysisType = 'full', sessionId = null) {
        const analysisData = {
            file_path: filePath,
            analysis_type: analysisType,
            session_id: sessionId
        };

        return this.executeCommand('analyze_code', analysisData, sessionId);
    }

    /**
     * Request code generation
     */
    async requestCodeGeneration(prompt, context = {}, sessionId = null) {
        const generationData = {
            prompt,
            context,
            session_id: sessionId
        };

        return this.executeCommand('generate_code', generationData, sessionId);
    }

    /**
     * Disconnect from Claude Code
     */
    async disconnect() {
        if (this.claudeProcess && !this.claudeProcess.killed) {
            this.claudeProcess.kill('SIGTERM');
            
            // Force kill after timeout
            setTimeout(() => {
                if (this.claudeProcess && !this.claudeProcess.killed) {
                    this.claudeProcess.kill('SIGKILL');
                }
            }, 5000);
        }

        this.isConnected = false;
        this.pendingActions.clear();
        
        logger.info('Disconnected from Claude Code');
    }

    /**
     * Generate unique action ID
     */
    generateActionId() {
        return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export const claudeInterface = new ClaudeInterface();
export default ClaudeInterface;

