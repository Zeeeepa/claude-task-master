import fetch from 'node-fetch';
import { EventEmitter } from 'events';

/**
 * AgentAPI client for controlling Claude Code, Goose, Aider, and Codex
 * Provides HTTP API interface for CI/CD automation
 */
export class AgentAPIClient extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            baseUrl: config.baseUrl || process.env.AGENTAPI_URL || 'http://localhost:3284',
            timeout: config.timeout || 30000,
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 1000,
            ...config
        };
        this.sessionId = null;
        this.isConnected = false;
        this.eventSource = null;
    }

    /**
     * Initialize AgentAPI session with specified agent
     */
    async initializeSession(agent = 'claude', agentArgs = []) {
        try {
            console.log(`🔄 Initializing AgentAPI session with ${agent}...`);
            
            // Check if AgentAPI server is running
            await this._checkServerHealth();
            
            // Start agent session (assuming AgentAPI server is already running with the agent)
            // In practice, you might need to start the server with: agentapi server -- claude
            this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.isConnected = true;
            
            // Start event stream monitoring
            await this._startEventStream();
            
            console.log(`✅ AgentAPI session initialized: ${this.sessionId}`);
            this.emit('sessionInitialized', { sessionId: this.sessionId, agent });
            
            return this.sessionId;
        } catch (error) {
            console.error('❌ Failed to initialize AgentAPI session:', error);
            throw error;
        }
    }

    /**
     * Send a message to the agent
     */
    async sendMessage(content, type = 'user') {
        if (!this.isConnected) {
            throw new Error('AgentAPI session not initialized');
        }

        try {
            console.log(`📤 Sending message to agent: ${content.substring(0, 100)}...`);
            
            const response = await this._makeRequest('POST', '/message', {
                content,
                type,
                sessionId: this.sessionId
            });

            if (!response.ok) {
                throw new Error(`AgentAPI request failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            console.log('✅ Message sent successfully');
            
            this.emit('messageSent', { content, type, result });
            return result;
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            throw error;
        }
    }

    /**
     * Get conversation history
     */
    async getMessages() {
        if (!this.isConnected) {
            throw new Error('AgentAPI session not initialized');
        }

        try {
            const response = await this._makeRequest('GET', '/messages');
            
            if (!response.ok) {
                throw new Error(`Failed to get messages: ${response.status} ${response.statusText}`);
            }

            const messages = await response.json();
            return messages;
        } catch (error) {
            console.error('❌ Failed to get messages:', error);
            throw error;
        }
    }

    /**
     * Get agent status
     */
    async getStatus() {
        if (!this.isConnected) {
            throw new Error('AgentAPI session not initialized');
        }

        try {
            const response = await this._makeRequest('GET', '/status');
            
            if (!response.ok) {
                throw new Error(`Failed to get status: ${response.status} ${response.statusText}`);
            }

            const status = await response.json();
            return status;
        } catch (error) {
            console.error('❌ Failed to get status:', error);
            throw error;
        }
    }

    /**
     * Wait for agent to complete current operation
     */
    async waitForCompletion(timeoutMs = 300000) { // 5 minutes default
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkStatus = async () => {
                try {
                    const status = await this.getStatus();
                    
                    if (status.status === 'stable') {
                        resolve(status);
                        return;
                    }
                    
                    if (Date.now() - startTime > timeoutMs) {
                        reject(new Error('Timeout waiting for agent completion'));
                        return;
                    }
                    
                    // Check again in 2 seconds
                    setTimeout(checkStatus, 2000);
                } catch (error) {
                    reject(error);
                }
            };
            
            checkStatus();
        });
    }

    /**
     * Execute a complete CI/CD operation
     */
    async executeOperation(operation) {
        const {
            type,
            projectPath,
            branchName,
            instructions,
            expectedOutputs = [],
            timeout = 600000 // 10 minutes
        } = operation;

        try {
            console.log(`🚀 Executing ${type} operation for branch ${branchName}`);
            
            // Send initial setup commands
            await this.sendMessage(`cd ${projectPath}`);
            await this.sendMessage(`git fetch origin ${branchName}`);
            await this.sendMessage(`git checkout ${branchName}`);
            
            // Wait for setup to complete
            await this.waitForCompletion(30000);
            
            // Send main instructions
            await this.sendMessage(instructions);
            
            // Wait for operation to complete
            await this.waitForCompletion(timeout);
            
            // Get final messages to extract results
            const messages = await this.getMessages();
            const agentMessages = messages.filter(m => m.type === 'agent');
            const lastMessage = agentMessages[agentMessages.length - 1];
            
            console.log(`✅ Operation ${type} completed successfully`);
            
            return {
                success: true,
                output: lastMessage?.content || '',
                messages: agentMessages,
                sessionId: this.sessionId
            };
        } catch (error) {
            console.error(`❌ Operation ${type} failed:`, error);
            
            // Get error context from messages
            const messages = await this.getMessages().catch(() => []);
            
            return {
                success: false,
                error: error.message,
                output: '',
                messages,
                sessionId: this.sessionId
            };
        }
    }

    /**
     * Validate a pull request using Claude Code
     */
    async validatePullRequest(prData) {
        const {
            projectPath,
            branchName,
            baseBranch,
            changedFiles,
            prDescription
        } = prData;

        const instructions = `
Please analyze this pull request and provide comprehensive validation:

Branch: ${branchName} → ${baseBranch}
Files changed: ${changedFiles.join(', ')}

Description:
${prDescription}

Please check for:
1. Code quality and best practices
2. Security vulnerabilities  
3. Performance implications
4. Test coverage
5. Documentation completeness
6. Breaking changes

Provide a detailed analysis with specific recommendations.
        `;

        return await this.executeOperation({
            type: 'pr_validation',
            projectPath,
            branchName,
            instructions,
            timeout: 300000 // 5 minutes
        });
    }

    /**
     * Debug and fix CI/CD errors
     */
    async debugError(errorData) {
        const {
            projectPath,
            branchName,
            errorMessage,
            pipelineOutput,
            failedStep
        } = errorData;

        const instructions = `
Please analyze and fix the following CI/CD error:

Failed step: ${failedStep}
Error message:
${errorMessage}

Pipeline output:
${pipelineOutput}

Please:
1. Identify the root cause
2. Provide specific fix commands
3. Implement the fix if possible
4. Suggest prevention strategies
        `;

        return await this.executeOperation({
            type: 'error_debugging',
            projectPath,
            branchName,
            instructions,
            timeout: 600000 // 10 minutes
        });
    }

    /**
     * Close the AgentAPI session
     */
    async closeSession() {
        try {
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
            
            this.isConnected = false;
            this.sessionId = null;
            
            console.log('✅ AgentAPI session closed');
            this.emit('sessionClosed');
        } catch (error) {
            console.error('❌ Error closing session:', error);
            throw error;
        }
    }

    // Private methods
    async _checkServerHealth() {
        try {
            const response = await this._makeRequest('GET', '/status');
            if (!response.ok) {
                throw new Error(`AgentAPI server not responding: ${response.status}`);
            }
            console.log('✅ AgentAPI server is healthy');
        } catch (error) {
            throw new Error(`AgentAPI server not available: ${error.message}`);
        }
    }

    async _startEventStream() {
        try {
            // Note: This is a simplified implementation
            // In practice, you'd use EventSource for SSE
            console.log('🔄 Starting event stream monitoring...');
            
            // Placeholder for event stream implementation
            // const EventSource = (await import('eventsource')).default;
            // this.eventSource = new EventSource(`${this.config.baseUrl}/events`);
            
            // this.eventSource.onmessage = (event) => {
            //     const data = JSON.parse(event.data);
            //     this.emit('agentEvent', data);
            // };
            
            console.log('✅ Event stream monitoring started');
        } catch (error) {
            console.warn('⚠️  Event stream not available:', error.message);
        }
    }

    async _makeRequest(method, path, body = null) {
        const url = `${this.config.baseUrl}${path}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'claude-task-master/1.0'
            },
            timeout: this.config.timeout
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        let lastError;
        
        for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
            try {
                const response = await fetch(url, options);
                return response;
            } catch (error) {
                lastError = error;
                
                if (attempt < this.config.retryAttempts) {
                    console.warn(`⚠️  Request attempt ${attempt} failed, retrying...`);
                    await new Promise(resolve => 
                        setTimeout(resolve, this.config.retryDelay * attempt)
                    );
                }
            }
        }
        
        throw lastError;
    }
}

