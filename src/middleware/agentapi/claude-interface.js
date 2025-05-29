/**
 * Claude Code Interface
 * Manages Claude Code process communication and terminal emulation
 * Part of Task Master Architecture Restructuring
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Terminal Emulator for Claude Code
 * Handles in-memory terminal state and output parsing
 */
class TerminalEmulator extends EventEmitter {
    constructor() {
        super();
        this.buffer = '';
        this.lines = [];
        this.cursor = { row: 0, col: 0 };
        this.lastSnapshot = '';
        this.inputBoxPattern = /\[.*?\]/g;
        this.tuiElementPattern = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    }

    /**
     * Process terminal output and extract meaningful content
     */
    processOutput(data) {
        this.buffer += data.toString();
        
        // Split into lines
        const newLines = this.buffer.split('\n');
        this.buffer = newLines.pop() || ''; // Keep incomplete line in buffer
        
        // Add complete lines
        this.lines.push(...newLines);
        
        // Clean and parse the output
        const cleanOutput = this.cleanOutput(newLines.join('\n'));
        const messages = this.parseMessages(cleanOutput);
        
        // Create snapshot for diffing
        const currentSnapshot = this.lines.join('\n');
        const diff = this.createDiff(this.lastSnapshot, currentSnapshot);
        this.lastSnapshot = currentSnapshot;
        
        this.emit('output', {
            raw: data.toString(),
            clean: cleanOutput,
            messages,
            diff,
            timestamp: new Date().toISOString()
        });
        
        return { cleanOutput, messages, diff };
    }

    /**
     * Clean terminal output by removing ANSI codes and TUI elements
     */
    cleanOutput(output) {
        // Remove ANSI escape sequences
        let cleaned = output.replace(this.tuiElementPattern, '');
        
        // Remove input boxes and prompts
        cleaned = cleaned.replace(this.inputBoxPattern, '');
        
        // Remove empty lines and excessive whitespace
        cleaned = cleaned
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n');
        
        return cleaned;
    }

    /**
     * Parse output into structured messages
     */
    parseMessages(output) {
        const messages = [];
        const lines = output.split('\n');
        let currentMessage = '';
        let messageType = 'agent';
        
        for (const line of lines) {
            // Detect user input (usually echoed back)
            if (this.isUserInput(line)) {
                if (currentMessage.trim()) {
                    messages.push({
                        type: messageType,
                        content: currentMessage.trim(),
                        timestamp: new Date().toISOString()
                    });
                    currentMessage = '';
                }
                messageType = 'user';
                currentMessage = line;
            } else {
                // Agent output
                if (messageType === 'user' && currentMessage.trim()) {
                    messages.push({
                        type: messageType,
                        content: currentMessage.trim(),
                        timestamp: new Date().toISOString()
                    });
                    currentMessage = '';
                    messageType = 'agent';
                }
                currentMessage += (currentMessage ? '\n' : '') + line;
            }
        }
        
        // Add final message if exists
        if (currentMessage.trim()) {
            messages.push({
                type: messageType,
                content: currentMessage.trim(),
                timestamp: new Date().toISOString()
            });
        }
        
        return messages;
    }

    /**
     * Detect if a line is user input (echoed back)
     */
    isUserInput(line) {
        // Common patterns for user input
        const userInputPatterns = [
            /^>\s+/,           // Prompt with >
            /^\$\s+/,          // Shell prompt
            /^Human:\s*/,      // Human prefix
            /^User:\s*/,       // User prefix
        ];
        
        return userInputPatterns.some(pattern => pattern.test(line));
    }

    /**
     * Create diff between terminal snapshots
     */
    createDiff(oldSnapshot, newSnapshot) {
        const oldLines = oldSnapshot.split('\n');
        const newLines = newSnapshot.split('\n');
        
        const added = [];
        const removed = [];
        
        // Simple diff - find new lines
        for (let i = oldLines.length; i < newLines.length; i++) {
            added.push(newLines[i]);
        }
        
        return {
            added,
            removed,
            hasChanges: added.length > 0 || removed.length > 0
        };
    }

    /**
     * Get current terminal state
     */
    getState() {
        return {
            lines: [...this.lines],
            cursor: { ...this.cursor },
            buffer: this.buffer,
            snapshot: this.lines.join('\n')
        };
    }

    /**
     * Clear terminal state
     */
    clear() {
        this.buffer = '';
        this.lines = [];
        this.cursor = { row: 0, col: 0 };
        this.lastSnapshot = '';
    }
}

/**
 * Claude Code Interface
 * Manages Claude Code processes and communication
 */
export class ClaudeInterface extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            claudeCodePath: config.claudeCodePath || '/usr/local/bin/claude',
            allowedTools: config.allowedTools || ['Bash(git*)', 'Edit', 'Replace'],
            processTimeout: config.processTimeout || 30000,
            maxProcesses: config.maxProcesses || 5,
            ...config
        };
        
        this.processes = new Map();
        this.terminals = new Map();
        this.messageQueue = new Map();
    }

    /**
     * Start a new Claude Code process for a session
     */
    async startProcess(sessionId, options = {}) {
        if (this.processes.has(sessionId)) {
            throw new Error(`Process already exists for session ${sessionId}`);
        }

        if (this.processes.size >= this.config.maxProcesses) {
            throw new Error(`Maximum number of processes (${this.config.maxProcesses}) reached`);
        }

        const processOptions = {
            cwd: options.workingDirectory || process.cwd(),
            env: {
                ...process.env,
                ...options.env
            },
            stdio: ['pipe', 'pipe', 'pipe']
        };

        // Build Claude Code command arguments
        const args = [];
        
        if (this.config.allowedTools.length > 0) {
            args.push('--tools', this.config.allowedTools.join(','));
        }
        
        if (options.model) {
            args.push('--model', options.model);
        }
        
        if (options.temperature) {
            args.push('--temperature', options.temperature.toString());
        }

        console.log(`Starting Claude Code process for session ${sessionId}`);
        console.log(`Command: ${this.config.claudeCodePath} ${args.join(' ')}`);

        const process = spawn(this.config.claudeCodePath, args, processOptions);
        const terminal = new TerminalEmulator();
        
        // Setup process event handlers
        this.setupProcessHandlers(sessionId, process, terminal);
        
        // Store process and terminal
        this.processes.set(sessionId, {
            process,
            sessionId,
            startedAt: new Date(),
            status: 'starting',
            options: processOptions
        });
        
        this.terminals.set(sessionId, terminal);
        this.messageQueue.set(sessionId, []);

        // Wait for process to be ready
        await this.waitForProcessReady(sessionId);
        
        this.emit('processStarted', {
            sessionId,
            pid: process.pid,
            timestamp: new Date().toISOString()
        });

        return {
            sessionId,
            pid: process.pid,
            status: 'ready'
        };
    }

    /**
     * Setup event handlers for a Claude Code process
     */
    setupProcessHandlers(sessionId, process, terminal) {
        // Handle stdout
        process.stdout.on('data', (data) => {
            const result = terminal.processOutput(data);
            
            this.emit('output', {
                sessionId,
                type: 'stdout',
                ...result,
                timestamp: new Date().toISOString()
            });
        });

        // Handle stderr
        process.stderr.on('data', (data) => {
            const errorOutput = data.toString();
            console.error(`Claude Code stderr [${sessionId}]:`, errorOutput);
            
            this.emit('output', {
                sessionId,
                type: 'stderr',
                raw: errorOutput,
                clean: errorOutput,
                messages: [{
                    type: 'error',
                    content: errorOutput,
                    timestamp: new Date().toISOString()
                }],
                timestamp: new Date().toISOString()
            });
        });

        // Handle process exit
        process.on('exit', (code, signal) => {
            console.log(`Claude Code process [${sessionId}] exited with code ${code}, signal ${signal}`);
            
            const processInfo = this.processes.get(sessionId);
            if (processInfo) {
                processInfo.status = 'exited';
                processInfo.exitCode = code;
                processInfo.exitSignal = signal;
                processInfo.exitedAt = new Date();
            }

            this.emit('processExit', {
                sessionId,
                exitCode: code,
                exitSignal: signal,
                timestamp: new Date().toISOString()
            });
        });

        // Handle process errors
        process.on('error', (error) => {
            console.error(`Claude Code process error [${sessionId}]:`, error);
            
            const processInfo = this.processes.get(sessionId);
            if (processInfo) {
                processInfo.status = 'error';
                processInfo.error = error;
            }

            this.emit('processError', {
                sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        });

        // Setup terminal event handlers
        terminal.on('output', (output) => {
            this.emit('terminalOutput', {
                sessionId,
                ...output
            });
        });
    }

    /**
     * Wait for Claude Code process to be ready
     */
    async waitForProcessReady(sessionId, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkReady = () => {
                const processInfo = this.processes.get(sessionId);
                if (!processInfo) {
                    reject(new Error('Process not found'));
                    return;
                }

                if (processInfo.status === 'error') {
                    reject(new Error('Process failed to start'));
                    return;
                }

                if (processInfo.status === 'exited') {
                    reject(new Error('Process exited during startup'));
                    return;
                }

                // Check if we've received any output (indicates process is running)
                const terminal = this.terminals.get(sessionId);
                if (terminal && terminal.lines.length > 0) {
                    processInfo.status = 'ready';
                    resolve();
                    return;
                }

                // Check timeout
                if (Date.now() - startTime > timeout) {
                    reject(new Error('Process startup timeout'));
                    return;
                }

                // Continue checking
                setTimeout(checkReady, 100);
            };

            checkReady();
        });
    }

    /**
     * Send message to Claude Code process
     */
    async sendMessage(sessionId, message, options = {}) {
        const processInfo = this.processes.get(sessionId);
        if (!processInfo) {
            throw new Error(`No process found for session ${sessionId}`);
        }

        if (processInfo.status !== 'ready') {
            throw new Error(`Process not ready for session ${sessionId}, status: ${processInfo.status}`);
        }

        const messageId = uuidv4();
        const timestamp = new Date().toISOString();

        // Add message to queue
        const queue = this.messageQueue.get(sessionId) || [];
        queue.push({
            id: messageId,
            content: message,
            options,
            timestamp,
            status: 'pending'
        });
        this.messageQueue.set(sessionId, queue);

        try {
            // Send message to Claude Code process
            const formattedMessage = this.formatMessage(message, options);
            processInfo.process.stdin.write(formattedMessage + '\n');

            // Update message status
            const queuedMessage = queue.find(m => m.id === messageId);
            if (queuedMessage) {
                queuedMessage.status = 'sent';
            }

            this.emit('messageSent', {
                sessionId,
                messageId,
                message: formattedMessage,
                timestamp
            });

            return {
                messageId,
                sessionId,
                status: 'sent',
                timestamp
            };

        } catch (error) {
            // Update message status
            const queuedMessage = queue.find(m => m.id === messageId);
            if (queuedMessage) {
                queuedMessage.status = 'failed';
                queuedMessage.error = error.message;
            }

            throw error;
        }
    }

    /**
     * Format message for Claude Code
     */
    formatMessage(message, options = {}) {
        // Basic message formatting
        let formatted = message;

        // Add context if provided
        if (options.context) {
            formatted = `Context: ${options.context}\n\n${formatted}`;
        }

        // Add instructions if provided
        if (options.instructions) {
            formatted = `${formatted}\n\nInstructions: ${options.instructions}`;
        }

        return formatted;
    }

    /**
     * Stop Claude Code process
     */
    async stopProcess(sessionId, force = false) {
        const processInfo = this.processes.get(sessionId);
        if (!processInfo) {
            throw new Error(`No process found for session ${sessionId}`);
        }

        console.log(`Stopping Claude Code process for session ${sessionId}`);

        if (force) {
            processInfo.process.kill('SIGKILL');
        } else {
            processInfo.process.kill('SIGTERM');
            
            // Wait for graceful shutdown, then force if needed
            setTimeout(() => {
                if (processInfo.process && !processInfo.process.killed) {
                    console.log(`Force killing Claude Code process for session ${sessionId}`);
                    processInfo.process.kill('SIGKILL');
                }
            }, 5000);
        }

        // Cleanup
        this.processes.delete(sessionId);
        this.terminals.delete(sessionId);
        this.messageQueue.delete(sessionId);

        this.emit('processStopped', {
            sessionId,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get process status
     */
    getProcessStatus(sessionId) {
        const processInfo = this.processes.get(sessionId);
        if (!processInfo) {
            return null;
        }

        const terminal = this.terminals.get(sessionId);
        const queue = this.messageQueue.get(sessionId) || [];

        return {
            sessionId,
            pid: processInfo.process.pid,
            status: processInfo.status,
            startedAt: processInfo.startedAt,
            exitCode: processInfo.exitCode,
            exitSignal: processInfo.exitSignal,
            exitedAt: processInfo.exitedAt,
            error: processInfo.error?.message,
            terminal: terminal ? terminal.getState() : null,
            messageQueue: queue.length,
            pendingMessages: queue.filter(m => m.status === 'pending').length
        };
    }

    /**
     * Get all active processes
     */
    getActiveProcesses() {
        const processes = [];
        for (const [sessionId] of this.processes) {
            processes.push(this.getProcessStatus(sessionId));
        }
        return processes;
    }

    /**
     * Health check for Claude Code availability
     */
    async healthCheck() {
        try {
            const testProcess = spawn(this.config.claudeCodePath, ['--version'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            return new Promise((resolve, reject) => {
                let output = '';
                
                testProcess.stdout.on('data', (data) => {
                    output += data.toString();
                });

                testProcess.on('exit', (code) => {
                    if (code === 0) {
                        resolve({
                            available: true,
                            version: output.trim(),
                            path: this.config.claudeCodePath
                        });
                    } else {
                        reject(new Error(`Claude Code health check failed with exit code ${code}`));
                    }
                });

                testProcess.on('error', (error) => {
                    reject(error);
                });

                // Timeout after 5 seconds
                setTimeout(() => {
                    testProcess.kill();
                    reject(new Error('Claude Code health check timeout'));
                }, 5000);
            });

        } catch (error) {
            return {
                available: false,
                error: error.message,
                path: this.config.claudeCodePath
            };
        }
    }

    /**
     * Cleanup all processes
     */
    async cleanup() {
        console.log('Cleaning up Claude Code processes...');
        
        const cleanupPromises = [];
        for (const [sessionId] of this.processes) {
            cleanupPromises.push(this.stopProcess(sessionId, true));
        }

        await Promise.allSettled(cleanupPromises);
        
        this.processes.clear();
        this.terminals.clear();
        this.messageQueue.clear();
    }
}

