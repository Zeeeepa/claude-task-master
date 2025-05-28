/**
 * Agent Manager
 * 
 * Manages multiple coding agents (Claude Code, Goose, Aider, Codex)
 * Handles agent lifecycle, communication, and state management
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class AgentManager extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map(); // workspaceId -> agent instance
    this.agentConfigs = new Map(); // agentType -> configuration
    this.supportedTypes = ['claude', 'goose', 'aider', 'codex'];
    
    this.initializeAgentConfigs();
  }

  initializeAgentConfigs() {
    // Claude Code configuration
    this.agentConfigs.set('claude', {
      command: 'claude',
      defaultArgs: ['--allowedTools', 'Bash(git*) Edit Replace'],
      envVars: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
      healthCheck: {
        timeout: 30000,
        retries: 3,
      },
      capabilities: ['code-editing', 'git-operations', 'file-management', 'debugging'],
    });

    // Goose configuration
    this.agentConfigs.set('goose', {
      command: 'goose',
      defaultArgs: [],
      envVars: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
      healthCheck: {
        timeout: 30000,
        retries: 3,
      },
      capabilities: ['code-editing', 'project-management', 'testing', 'debugging'],
    });

    // Aider configuration
    this.agentConfigs.set('aider', {
      command: 'aider',
      defaultArgs: ['--model', 'sonnet'],
      envVars: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
      healthCheck: {
        timeout: 30000,
        retries: 3,
      },
      capabilities: ['code-editing', 'refactoring', 'git-operations', 'testing'],
    });

    // Codex configuration (placeholder - adjust based on actual implementation)
    this.agentConfigs.set('codex', {
      command: 'codex',
      defaultArgs: [],
      envVars: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
      healthCheck: {
        timeout: 30000,
        retries: 3,
      },
      capabilities: ['code-generation', 'code-completion', 'debugging'],
    });
  }

  isValidAgentType(type) {
    return this.supportedTypes.includes(type);
  }

  getSupportedTypes() {
    return [...this.supportedTypes];
  }

  getAgentConfig(type) {
    return this.agentConfigs.get(type);
  }

  async startAgent(type, workspaceId, userConfig = {}) {
    if (!this.isValidAgentType(type)) {
      throw new Error(`Unsupported agent type: ${type}`);
    }

    const agentKey = `${type}-${workspaceId}`;
    
    if (this.agents.has(agentKey)) {
      const existingAgent = this.agents.get(agentKey);
      if (existingAgent.status === 'running') {
        throw new Error(`Agent ${type} is already running for workspace ${workspaceId}`);
      }
    }

    const config = this.agentConfigs.get(type);
    const agent = new Agent(type, workspaceId, config, userConfig);
    
    this.agents.set(agentKey, agent);
    
    try {
      await agent.start();
      this.emit('agentStarted', { type, workspaceId, agent });
      return agent;
    } catch (error) {
      this.agents.delete(agentKey);
      throw error;
    }
  }

  async stopAgent(type, workspaceId) {
    const agentKey = `${type}-${workspaceId}`;
    const agent = this.agents.get(agentKey);
    
    if (!agent) {
      throw new Error(`No agent ${type} found for workspace ${workspaceId}`);
    }

    try {
      await agent.stop();
      this.agents.delete(agentKey);
      this.emit('agentStopped', { type, workspaceId });
    } catch (error) {
      console.error(`Error stopping agent ${type} for workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  async stopAllAgents() {
    const stopPromises = [];
    
    for (const [agentKey, agent] of this.agents) {
      stopPromises.push(
        agent.stop().catch(error => {
          console.error(`Error stopping agent ${agentKey}:`, error);
        })
      );
    }
    
    await Promise.all(stopPromises);
    this.agents.clear();
  }

  getAgent(type, workspaceId) {
    const agentKey = `${type}-${workspaceId}`;
    return this.agents.get(agentKey);
  }

  async getAgentStatus(type, workspaceId) {
    const agent = this.getAgent(type, workspaceId);
    
    if (!agent) {
      return {
        status: 'not-found',
        message: `No agent ${type} found for workspace ${workspaceId}`,
      };
    }

    return agent.getStatus();
  }

  getAgentStatuses() {
    const statuses = {};
    
    for (const [agentKey, agent] of this.agents) {
      statuses[agentKey] = agent.getStatus();
    }
    
    return statuses;
  }

  listAgents() {
    const agents = [];
    
    for (const [agentKey, agent] of this.agents) {
      agents.push({
        key: agentKey,
        type: agent.type,
        workspaceId: agent.workspaceId,
        status: agent.status,
        startedAt: agent.startedAt,
        capabilities: agent.capabilities,
      });
    }
    
    return agents;
  }

  async sendMessage(type, workspaceId, message) {
    const agent = this.getAgent(type, workspaceId);
    
    if (!agent) {
      throw new Error(`No agent ${type} found for workspace ${workspaceId}`);
    }

    return await agent.sendMessage(message);
  }

  async getMessages(type, workspaceId) {
    const agent = this.getAgent(type, workspaceId);
    
    if (!agent) {
      throw new Error(`No agent ${type} found for workspace ${workspaceId}`);
    }

    return agent.getMessages();
  }

  getEventStream(type, workspaceId) {
    const agent = this.getAgent(type, workspaceId);
    
    if (!agent) {
      throw new Error(`No agent ${type} found for workspace ${workspaceId}`);
    }

    return agent.getEventStream();
  }
}

class Agent extends EventEmitter {
  constructor(type, workspaceId, config, userConfig = {}) {
    super();
    
    this.id = uuidv4();
    this.type = type;
    this.workspaceId = workspaceId;
    this.config = { ...config, ...userConfig };
    this.status = 'stopped';
    this.process = null;
    this.startedAt = null;
    this.messages = [];
    this.capabilities = config.capabilities || [];
    
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.on('message', (message) => {
      this.messages.push({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        ...message,
      });
    });
  }

  async start() {
    if (this.status === 'running') {
      throw new Error(`Agent ${this.type} is already running`);
    }

    this.status = 'starting';
    
    try {
      // Prepare command and arguments
      const command = this.config.command;
      const args = [...(this.config.defaultArgs || [])];
      
      // Add user-specified arguments
      if (this.config.args) {
        args.push(...this.config.args);
      }

      // Set working directory to workspace
      const workingDir = path.join(process.env.WORKSPACE_ROOT || '/tmp/agentapi-workspaces', this.workspaceId);
      await fs.mkdir(workingDir, { recursive: true });

      // Prepare environment variables
      const env = {
        ...process.env,
        ...this.config.envVars,
      };

      // Spawn the agent process
      this.process = spawn(command, args, {
        cwd: workingDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.setupProcessHandlers();
      
      // Wait for agent to be ready
      await this.waitForReady();
      
      this.status = 'running';
      this.startedAt = new Date().toISOString();
      
      this.emit('started');
      
    } catch (error) {
      this.status = 'error';
      this.emit('error', error);
      throw error;
    }
  }

  setupProcessHandlers() {
    if (!this.process) return;

    this.process.stdout.on('data', (data) => {
      const output = data.toString();
      this.emit('message', {
        type: 'agent',
        content: output,
        source: 'stdout',
      });
    });

    this.process.stderr.on('data', (data) => {
      const output = data.toString();
      this.emit('message', {
        type: 'agent',
        content: output,
        source: 'stderr',
      });
    });

    this.process.on('error', (error) => {
      this.status = 'error';
      this.emit('error', error);
    });

    this.process.on('exit', (code, signal) => {
      this.status = 'stopped';
      this.emit('exit', { code, signal });
    });
  }

  async waitForReady() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Agent ${this.type} failed to start within timeout`));
      }, this.config.healthCheck?.timeout || 30000);

      // Listen for ready indicators (this would be agent-specific)
      const readyHandler = (message) => {
        if (this.isReadyMessage(message)) {
          clearTimeout(timeout);
          this.off('message', readyHandler);
          resolve();
        }
      };

      this.on('message', readyHandler);
      
      // For now, just wait a short time for the process to stabilize
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          clearTimeout(timeout);
          this.off('message', readyHandler);
          resolve();
        }
      }, 2000);
    });
  }

  isReadyMessage(message) {
    // Agent-specific ready detection logic
    const readyPatterns = {
      claude: /ready|waiting|>/i,
      goose: /ready|waiting|>/i,
      aider: /ready|waiting|>/i,
      codex: /ready|waiting|>/i,
    };

    const pattern = readyPatterns[this.type];
    return pattern && pattern.test(message.content);
  }

  async stop() {
    if (this.status === 'stopped') {
      return;
    }

    this.status = 'stopping';

    if (this.process) {
      // Try graceful shutdown first
      this.process.stdin.write('\x03'); // Ctrl+C
      
      // Wait for graceful shutdown
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        this.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    this.status = 'stopped';
    this.process = null;
    this.emit('stopped');
  }

  async sendMessage(message) {
    if (this.status !== 'running' || !this.process) {
      throw new Error(`Agent ${this.type} is not running`);
    }

    return new Promise((resolve, reject) => {
      const messageId = uuidv4();
      const timeout = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, 30000);

      // Send message to agent
      this.process.stdin.write(message.content + '\n');
      
      // Record user message
      this.emit('message', {
        id: messageId,
        type: 'user',
        content: message.content,
      });

      // Wait for agent response
      const responseHandler = (agentMessage) => {
        if (agentMessage.type === 'agent') {
          clearTimeout(timeout);
          this.off('message', responseHandler);
          resolve({
            id: messageId,
            response: agentMessage,
          });
        }
      };

      this.on('message', responseHandler);
    });
  }

  getMessages() {
    return [...this.messages];
  }

  getEventStream() {
    const eventEmitter = new EventEmitter();
    
    const messageHandler = (message) => {
      eventEmitter.emit('data', {
        type: 'message',
        data: message,
      });
    };

    const statusHandler = (status) => {
      eventEmitter.emit('data', {
        type: 'status',
        data: { status },
      });
    };

    this.on('message', messageHandler);
    this.on('statusChange', statusHandler);

    // Cleanup when stream is destroyed
    eventEmitter.on('destroy', () => {
      this.off('message', messageHandler);
      this.off('statusChange', statusHandler);
    });

    return eventEmitter;
  }

  getStatus() {
    return {
      id: this.id,
      type: this.type,
      workspaceId: this.workspaceId,
      status: this.status,
      startedAt: this.startedAt,
      capabilities: this.capabilities,
      messageCount: this.messages.length,
      processId: this.process?.pid,
    };
  }
}

