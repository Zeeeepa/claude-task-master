/**
 * Agent Coordinator
 * Manages coordination with external coding agents through agentapi
 */

import { EventEmitter } from 'events';

/**
 * Agent Coordinator for managing external coding agents
 */
export class AgentCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      agentApiUrl: options.agentApiUrl || process.env.AGENTAPI_URL || 'http://localhost:8000',
      apiKey: options.apiKey || process.env.AGENTAPI_KEY,
      timeout: options.timeout || 300000, // 5 minutes
      maxConcurrentAgents: options.maxConcurrentAgents || 5,
      retryAttempts: options.retryAttempts || 3,
      ...options
    };

    // Agent types and their capabilities
    this.agentTypes = {
      'claude-code': {
        name: 'Claude Code',
        capabilities: ['code_generation', 'debugging', 'testing', 'code_review'],
        languages: ['javascript', 'python', 'typescript', 'react', 'node'],
        specialties: ['full_stack', 'api_development', 'testing']
      },
      'goose': {
        name: 'Goose',
        capabilities: ['code_generation', 'refactoring', 'documentation'],
        languages: ['python', 'javascript', 'go', 'rust'],
        specialties: ['backend', 'cli_tools', 'automation']
      },
      'aider': {
        name: 'Aider',
        capabilities: ['code_editing', 'git_integration', 'incremental_development'],
        languages: ['python', 'javascript', 'typescript', 'java', 'c++'],
        specialties: ['code_editing', 'git_workflow', 'pair_programming']
      },
      'codex': {
        name: 'Codex',
        capabilities: ['code_completion', 'code_generation', 'translation'],
        languages: ['javascript', 'python', 'java', 'c#', 'php'],
        specialties: ['code_completion', 'language_translation', 'boilerplate']
      }
    };

    // Active agent sessions
    this.activeSessions = new Map();
    this.agentQueue = [];
    this.sessionHistory = new Map();
  }

  /**
   * Initialize agent coordinator
   */
  async initialize() {
    try {
      console.log('🤖 Initializing Agent Coordinator...');
      
      // Test connection to agentapi
      await this._testConnection();
      
      // Discover available agents
      const availableAgents = await this._discoverAgents();
      console.log(`🔍 Discovered ${availableAgents.length} available agents`);
      
      this.emit('coordinator:initialized', { availableAgents });
      return true;
      
    } catch (error) {
      this.emit('coordinator:error', error);
      throw new Error(`Agent coordinator initialization failed: ${error.message}`);
    }
  }

  /**
   * Assign tasks to appropriate agents
   * @param {Array} executionPlan - Execution plan with task levels
   */
  async assignTasks(executionPlan) {
    try {
      const assignments = [];
      
      for (let levelIndex = 0; levelIndex < executionPlan.length; levelIndex++) {
        const level = executionPlan[levelIndex];
        const levelAssignments = [];
        
        for (const taskId of level) {
          const assignment = await this._assignTaskToAgent(taskId, levelIndex);
          levelAssignments.push(assignment);
        }
        
        assignments.push({
          level: levelIndex,
          tasks: levelAssignments,
          canRunInParallel: level.length > 1
        });
      }
      
      this.emit('tasks:assigned', { assignments });
      return assignments;
      
    } catch (error) {
      this.emit('coordinator:error', error);
      throw error;
    }
  }

  /**
   * Execute task with assigned agent
   * @param {Object} assignment - Task assignment
   * @param {Object} context - Execution context
   */
  async executeTask(assignment, context = {}) {
    const sessionId = `session_${assignment.taskId}_${Date.now()}`;
    
    try {
      // Start agent session
      const session = await this._startAgentSession(sessionId, assignment, context);
      this.activeSessions.set(sessionId, session);
      
      this.emit('task:execution_started', {
        sessionId,
        taskId: assignment.taskId,
        agentType: assignment.agentType
      });
      
      // Execute task
      const result = await this._executeWithAgent(session, assignment, context);
      
      // Record session history
      this._recordSessionHistory(sessionId, session, result);
      
      this.emit('task:execution_completed', {
        sessionId,
        taskId: assignment.taskId,
        success: result.success
      });
      
      return result;
      
    } catch (error) {
      this.emit('task:execution_failed', {
        sessionId,
        taskId: assignment.taskId,
        error: error.message
      });
      throw error;
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Monitor agent execution progress
   * @param {string} sessionId - Session ID
   */
  async monitorExecution(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      // Mock monitoring - in production, this would poll agentapi
      const status = await this._getExecutionStatus(sessionId);
      
      this.emit('execution:status_update', {
        sessionId,
        status: status.status,
        progress: status.progress,
        currentStep: status.currentStep
      });
      
      return status;
      
    } catch (error) {
      this.emit('coordinator:error', error);
      throw error;
    }
  }

  /**
   * Cancel agent execution
   * @param {string} sessionId - Session ID
   */
  async cancelExecution(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      // Send cancellation request to agentapi
      await this._sendCancellationRequest(sessionId);
      
      session.cancelled = true;
      this.emit('execution:cancelled', { sessionId });
      
      return true;
      
    } catch (error) {
      this.emit('coordinator:error', error);
      throw error;
    }
  }

  /**
   * Get agent capabilities
   * @param {string} agentType - Agent type
   */
  getAgentCapabilities(agentType) {
    return this.agentTypes[agentType] || null;
  }

  /**
   * Find best agent for task
   * @param {Object} task - Task object
   * @param {Object} requirements - Task requirements
   */
  findBestAgent(task, requirements = {}) {
    const {
      language,
      capabilities,
      specialty,
      priority = 'medium'
    } = requirements;

    let bestAgent = null;
    let bestScore = 0;

    for (const [agentType, agentInfo] of Object.entries(this.agentTypes)) {
      let score = 0;

      // Language match
      if (language && agentInfo.languages.includes(language)) {
        score += 30;
      }

      // Capability match
      if (capabilities) {
        const matchingCaps = capabilities.filter(cap => 
          agentInfo.capabilities.includes(cap)
        );
        score += matchingCaps.length * 20;
      }

      // Specialty match
      if (specialty && agentInfo.specialties.includes(specialty)) {
        score += 25;
      }

      // Task type heuristics
      if (task.type === 'testing' && agentInfo.capabilities.includes('testing')) {
        score += 15;
      }
      
      if (task.type === 'debugging' && agentInfo.capabilities.includes('debugging')) {
        score += 15;
      }

      if (score > bestScore) {
        bestScore = score;
        bestAgent = {
          type: agentType,
          info: agentInfo,
          score,
          confidence: Math.min(score / 100, 1)
        };
      }
    }

    return bestAgent;
  }

  /**
   * Get coordinator statistics
   */
  getStatistics() {
    const sessionHistoryArray = Array.from(this.sessionHistory.values());
    
    return {
      activeSessions: this.activeSessions.size,
      totalSessions: this.sessionHistory.size,
      successfulSessions: sessionHistoryArray.filter(s => s.result?.success).length,
      failedSessions: sessionHistoryArray.filter(s => !s.result?.success).length,
      averageExecutionTime: this._calculateAverageExecutionTime(sessionHistoryArray),
      agentUtilization: this._calculateAgentUtilization(sessionHistoryArray)
    };
  }

  /**
   * Private: Test connection to agentapi
   */
  async _testConnection() {
    try {
      // Mock connection test
      console.log(`🔗 Testing connection to agentapi at ${this.options.agentApiUrl}`);
      
      // In production, you would make an actual HTTP request:
      // const response = await fetch(`${this.options.agentApiUrl}/health`);
      // if (!response.ok) throw new Error('Connection failed');
      
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
      console.log('✅ Connection to agentapi successful');
      
    } catch (error) {
      throw new Error(`Failed to connect to agentapi: ${error.message}`);
    }
  }

  /**
   * Private: Discover available agents
   */
  async _discoverAgents() {
    try {
      // Mock agent discovery
      const availableAgents = Object.keys(this.agentTypes).map(type => ({
        type,
        status: 'available',
        ...this.agentTypes[type]
      }));
      
      return availableAgents;
      
    } catch (error) {
      throw new Error(`Failed to discover agents: ${error.message}`);
    }
  }

  /**
   * Private: Assign task to best available agent
   */
  async _assignTaskToAgent(taskId, levelIndex) {
    try {
      // Mock task analysis
      const task = {
        id: taskId,
        type: 'implementation', // Would be determined from task analysis
        language: 'javascript',
        complexity: 'medium'
      };

      // Find best agent
      const bestAgent = this.findBestAgent(task, {
        language: task.language,
        capabilities: ['code_generation'],
        specialty: 'full_stack'
      });

      if (!bestAgent) {
        throw new Error(`No suitable agent found for task ${taskId}`);
      }

      return {
        taskId,
        agentType: bestAgent.type,
        agentInfo: bestAgent.info,
        confidence: bestAgent.confidence,
        estimatedTime: this._estimateExecutionTime(task, bestAgent),
        level: levelIndex
      };
      
    } catch (error) {
      throw new Error(`Failed to assign task ${taskId}: ${error.message}`);
    }
  }

  /**
   * Private: Start agent session
   */
  async _startAgentSession(sessionId, assignment, context) {
    const session = {
      id: sessionId,
      taskId: assignment.taskId,
      agentType: assignment.agentType,
      startTime: new Date(),
      status: 'starting',
      context,
      cancelled: false
    };

    // Mock session initialization
    console.log(`🚀 Starting ${assignment.agentType} session for task ${assignment.taskId}`);
    
    return session;
  }

  /**
   * Private: Execute task with agent
   */
  async _executeWithAgent(session, assignment, context) {
    try {
      session.status = 'executing';
      
      // Mock execution - in production, this would call agentapi
      const executionTime = Math.random() * 30000 + 10000; // 10-40 seconds
      await new Promise(resolve => setTimeout(resolve, executionTime));
      
      // Mock result
      const success = Math.random() > 0.1; // 90% success rate
      
      const result = {
        success,
        sessionId: session.id,
        taskId: assignment.taskId,
        agentType: assignment.agentType,
        executionTime,
        output: success ? {
          prUrl: 'https://github.com/example/repo/pull/123',
          commitHash: 'abc123def456',
          filesModified: ['src/component.js', 'tests/component.test.js'],
          summary: 'Successfully implemented the requested feature'
        } : {
          error: 'Compilation failed',
          details: 'Missing dependency in package.json'
        },
        metadata: {
          linesOfCode: success ? Math.floor(Math.random() * 200) + 50 : 0,
          testsAdded: success ? Math.floor(Math.random() * 5) + 1 : 0
        }
      };

      session.status = success ? 'completed' : 'failed';
      session.endTime = new Date();
      session.result = result;
      
      return result;
      
    } catch (error) {
      session.status = 'failed';
      session.endTime = new Date();
      session.error = error.message;
      throw error;
    }
  }

  /**
   * Private: Get execution status
   */
  async _getExecutionStatus(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return {
      sessionId,
      status: session.status,
      progress: this._calculateProgress(session),
      currentStep: this._getCurrentStep(session),
      startTime: session.startTime,
      elapsedTime: Date.now() - session.startTime.getTime()
    };
  }

  /**
   * Private: Send cancellation request
   */
  async _sendCancellationRequest(sessionId) {
    // Mock cancellation
    console.log(`🛑 Cancelling session ${sessionId}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Private: Record session history
   */
  _recordSessionHistory(sessionId, session, result) {
    this.sessionHistory.set(sessionId, {
      sessionId,
      taskId: session.taskId,
      agentType: session.agentType,
      startTime: session.startTime,
      endTime: session.endTime,
      executionTime: session.endTime - session.startTime,
      result,
      success: result.success
    });

    // Limit history size
    if (this.sessionHistory.size > 1000) {
      const oldestKey = this.sessionHistory.keys().next().value;
      this.sessionHistory.delete(oldestKey);
    }
  }

  /**
   * Private: Estimate execution time
   */
  _estimateExecutionTime(task, agent) {
    const baseTime = 300000; // 5 minutes
    const complexityMultiplier = {
      low: 0.5,
      medium: 1.0,
      high: 2.0
    };
    
    const agentEfficiency = agent.confidence;
    const complexity = complexityMultiplier[task.complexity] || 1.0;
    
    return Math.round(baseTime * complexity / agentEfficiency);
  }

  /**
   * Private: Calculate progress
   */
  _calculateProgress(session) {
    const elapsed = Date.now() - session.startTime.getTime();
    const estimated = 300000; // 5 minutes default
    
    return Math.min(Math.round((elapsed / estimated) * 100), 95);
  }

  /**
   * Private: Get current step
   */
  _getCurrentStep(session) {
    const steps = ['initializing', 'analyzing', 'coding', 'testing', 'finalizing'];
    const progress = this._calculateProgress(session);
    const stepIndex = Math.floor((progress / 100) * steps.length);
    
    return steps[Math.min(stepIndex, steps.length - 1)];
  }

  /**
   * Private: Calculate average execution time
   */
  _calculateAverageExecutionTime(sessions) {
    if (sessions.length === 0) return 0;
    
    const totalTime = sessions.reduce((sum, session) => sum + session.executionTime, 0);
    return Math.round(totalTime / sessions.length);
  }

  /**
   * Private: Calculate agent utilization
   */
  _calculateAgentUtilization(sessions) {
    const utilization = {};
    
    for (const agentType of Object.keys(this.agentTypes)) {
      const agentSessions = sessions.filter(s => s.agentType === agentType);
      utilization[agentType] = {
        totalSessions: agentSessions.length,
        successfulSessions: agentSessions.filter(s => s.success).length,
        averageTime: this._calculateAverageExecutionTime(agentSessions)
      };
    }
    
    return utilization;
  }

  /**
   * Shutdown coordinator
   */
  async shutdown() {
    console.log('🛑 Shutting down Agent Coordinator...');
    
    // Cancel all active sessions
    for (const [sessionId] of this.activeSessions) {
      await this.cancelExecution(sessionId);
    }
    
    this.activeSessions.clear();
    this.emit('coordinator:shutdown');
    
    console.log('✅ Agent Coordinator shutdown complete');
  }
}

export default AgentCoordinator;

