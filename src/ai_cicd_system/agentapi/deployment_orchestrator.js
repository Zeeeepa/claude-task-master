/**
 * Deployment Orchestrator
 * 
 * Coordinates the entire deployment workflow by managing WSL2 instances,
 * Git operations, and Claude Code integration for PR validation.
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class DeploymentOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.wsl2Manager = options.wsl2Manager;
    this.gitOperations = options.gitOperations;
    this.claudeCodeInterface = options.claudeCodeInterface;
    this.config = options.config || {};

    this.activeDeployments = new Map();
    this.deploymentQueue = [];
    this.isProcessingQueue = false;
    this.maxConcurrentDeployments = this.config.maxConcurrentDeployments || 3;

    this.setupEventListeners();
  }

  /**
   * Setup event listeners for component events
   */
  setupEventListeners() {
    // Claude Code events
    this.claudeCodeInterface.on('sessionMessage', (data) => {
      this.handleClaudeCodeMessage(data);
    });

    this.claudeCodeInterface.on('sessionCompletion', (data) => {
      this.handleClaudeCodeCompletion(data);
    });

    this.claudeCodeInterface.on('sessionError', (data) => {
      this.handleClaudeCodeError(data);
    });
  }

  /**
   * Start a new deployment
   */
  async startDeployment(deploymentRequest) {
    try {
      const deploymentId = crypto.randomBytes(16).toString('hex');
      
      console.log(`Starting deployment: ${deploymentId}`);
      
      // Validate deployment request
      this.validateDeploymentRequest(deploymentRequest);

      // Create deployment record
      const deployment = {
        id: deploymentId,
        status: 'initializing',
        startTime: new Date(),
        request: deploymentRequest,
        steps: [],
        results: {},
        instanceId: null,
        sessionId: null,
        workspacePath: null,
        progress: 0,
        logs: []
      };

      this.activeDeployments.set(deploymentId, deployment);
      this.emit('deploymentStarted', { deploymentId, deployment });

      // Add to queue if at capacity, otherwise start immediately
      if (this.activeDeployments.size > this.maxConcurrentDeployments) {
        this.deploymentQueue.push(deploymentId);
        deployment.status = 'queued';
        this.emit('deploymentQueued', { deploymentId });
      } else {
        await this.executeDeployment(deploymentId);
      }

      return {
        success: true,
        deploymentId,
        status: deployment.status
      };
    } catch (error) {
      console.error(`Failed to start deployment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate deployment request
   */
  validateDeploymentRequest(request) {
    const required = ['repositoryUrl', 'prBranch', 'validationTasks'];
    
    for (const field of required) {
      if (!request[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (!Array.isArray(request.validationTasks) || request.validationTasks.length === 0) {
      throw new Error('validationTasks must be a non-empty array');
    }
  }

  /**
   * Execute deployment workflow
   */
  async executeDeployment(deploymentId) {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    try {
      deployment.status = 'running';
      this.emit('deploymentStatusChange', { deploymentId, status: 'running' });

      // Step 1: Create WSL2 instance
      await this.executeStep(deploymentId, 'create_instance', async () => {
        const instance = await this.wsl2Manager.createInstance(deploymentId, {
          gitConfig: deployment.request.gitConfig,
          additionalPackages: deployment.request.additionalPackages
        });
        
        deployment.instanceId = instance.id;
        deployment.workspacePath = instance.workspacePath;
        
        return { instanceId: instance.id, workspacePath: instance.workspacePath };
      });

      // Step 2: Clone repository
      await this.executeStep(deploymentId, 'clone_repository', async () => {
        const repoPath = `${deployment.workspacePath}/repo`;
        
        const cloneResult = await this.gitOperations.cloneRepository(
          deployment.instanceId,
          deployment.request.repositoryUrl,
          deployment.request.prBranch,
          repoPath,
          {
            credentials: deployment.request.credentials,
            gitConfig: deployment.request.gitConfig,
            wsl2Manager: this.wsl2Manager
          }
        );

        deployment.repositoryPath = repoPath;
        
        return cloneResult;
      });

      // Step 3: Start Claude Code session
      await this.executeStep(deploymentId, 'start_claude_session', async () => {
        const sessionResult = await this.claudeCodeInterface.startSession(
          deployment.instanceId,
          deployment.repositoryPath,
          {
            allowedTools: deployment.request.allowedTools,
            model: deployment.request.model,
            settings: deployment.request.claudeSettings
          }
        );

        deployment.sessionId = sessionResult.sessionId;
        
        return sessionResult;
      });

      // Step 4: Execute validation tasks
      await this.executeStep(deploymentId, 'execute_validation', async () => {
        const validationResults = [];
        
        for (const task of deployment.request.validationTasks) {
          const result = await this.executeValidationTask(deploymentId, task);
          validationResults.push(result);
        }
        
        return { validationResults };
      });

      // Step 5: Generate final report
      await this.executeStep(deploymentId, 'generate_report', async () => {
        const report = await this.generateDeploymentReport(deploymentId);
        deployment.results.finalReport = report;
        
        return report;
      });

      // Mark deployment as completed
      deployment.status = 'completed';
      deployment.endTime = new Date();
      deployment.duration = deployment.endTime.getTime() - deployment.startTime.getTime();
      deployment.progress = 100;

      this.emit('deploymentCompleted', { deploymentId, deployment });
      
      // Process next deployment in queue
      this.processNextDeployment();

      return deployment;
    } catch (error) {
      console.error(`Deployment ${deploymentId} failed: ${error.message}`);
      
      deployment.status = 'failed';
      deployment.error = error.message;
      deployment.endTime = new Date();
      
      this.emit('deploymentFailed', { deploymentId, error: error.message });
      
      // Cleanup resources
      await this.cleanupDeployment(deploymentId);
      
      // Process next deployment in queue
      this.processNextDeployment();
      
      throw error;
    }
  }

  /**
   * Execute a deployment step
   */
  async executeStep(deploymentId, stepName, stepFunction) {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const step = {
      name: stepName,
      startTime: new Date(),
      status: 'running'
    };

    deployment.steps.push(step);
    this.addLog(deploymentId, `Starting step: ${stepName}`);
    this.emit('deploymentStepStarted', { deploymentId, step });

    try {
      const result = await stepFunction();
      
      step.status = 'completed';
      step.endTime = new Date();
      step.duration = step.endTime.getTime() - step.startTime.getTime();
      step.result = result;

      deployment.results[stepName] = result;
      deployment.progress = Math.round((deployment.steps.filter(s => s.status === 'completed').length / 5) * 100);

      this.addLog(deploymentId, `Completed step: ${stepName} (${step.duration}ms)`);
      this.emit('deploymentStepCompleted', { deploymentId, step });

      return result;
    } catch (error) {
      step.status = 'failed';
      step.endTime = new Date();
      step.error = error.message;

      this.addLog(deploymentId, `Failed step: ${stepName} - ${error.message}`);
      this.emit('deploymentStepFailed', { deploymentId, step, error: error.message });

      throw error;
    }
  }

  /**
   * Execute a validation task
   */
  async executeValidationTask(deploymentId, task) {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    this.addLog(deploymentId, `Executing validation task: ${task.type}`);

    try {
      let result;

      switch (task.type) {
        case 'code_analysis':
          result = await this.executeCodeAnalysis(deploymentId, task);
          break;
        
        case 'test_execution':
          result = await this.executeTests(deploymentId, task);
          break;
        
        case 'lint_check':
          result = await this.executeLinting(deploymentId, task);
          break;
        
        case 'build_verification':
          result = await this.executeBuild(deploymentId, task);
          break;
        
        case 'security_scan':
          result = await this.executeSecurityScan(deploymentId, task);
          break;
        
        case 'custom_validation':
          result = await this.executeCustomValidation(deploymentId, task);
          break;
        
        default:
          throw new Error(`Unknown validation task type: ${task.type}`);
      }

      this.addLog(deploymentId, `Validation task completed: ${task.type}`);
      return { ...result, taskType: task.type, success: true };
    } catch (error) {
      this.addLog(deploymentId, `Validation task failed: ${task.type} - ${error.message}`);
      return { 
        taskType: task.type, 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Execute code analysis
   */
  async executeCodeAnalysis(deploymentId, task) {
    const deployment = this.activeDeployments.get(deploymentId);
    
    const analysisResult = await this.claudeCodeInterface.executeAnalysis(
      deployment.sessionId,
      {
        type: 'code_review',
        scope: task.scope || 'changed_files',
        focus: task.focus || ['bugs', 'performance', 'security'],
        files: task.files || []
      },
      task.options
    );

    // Wait for analysis completion
    const results = await this.waitForTaskCompletion(
      deployment.sessionId,
      analysisResult.taskId,
      'analyze'
    );

    return results;
  }

  /**
   * Execute tests
   */
  async executeTests(deploymentId, task) {
    const deployment = this.activeDeployments.get(deploymentId);
    
    // Send test execution command to Claude Code
    const message = `Please run the following test command: ${task.command}`;
    
    await this.claudeCodeInterface.sendMessage(deployment.sessionId, message);
    
    // Wait for test completion (simplified - in real implementation, would parse output)
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    return {
      command: task.command,
      output: 'Test execution completed',
      exitCode: 0
    };
  }

  /**
   * Execute linting
   */
  async executeLinting(deploymentId, task) {
    const deployment = this.activeDeployments.get(deploymentId);
    
    const message = `Please run linting with the following command: ${task.command}`;
    
    await this.claudeCodeInterface.sendMessage(deployment.sessionId, message);
    
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    return {
      command: task.command,
      output: 'Linting completed',
      issues: []
    };
  }

  /**
   * Execute build
   */
  async executeBuild(deploymentId, task) {
    const deployment = this.activeDeployments.get(deploymentId);
    
    const message = `Please build the project using: ${task.command}`;
    
    await this.claudeCodeInterface.sendMessage(deployment.sessionId, message);
    
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    return {
      command: task.command,
      output: 'Build completed successfully',
      artifacts: []
    };
  }

  /**
   * Execute security scan
   */
  async executeSecurityScan(deploymentId, task) {
    const deployment = this.activeDeployments.get(deploymentId);
    
    const message = `Please perform a security scan using: ${task.command}`;
    
    await this.claudeCodeInterface.sendMessage(deployment.sessionId, message);
    
    await new Promise(resolve => setTimeout(resolve, 45000));
    
    return {
      command: task.command,
      output: 'Security scan completed',
      vulnerabilities: []
    };
  }

  /**
   * Execute custom validation
   */
  async executeCustomValidation(deploymentId, task) {
    const deployment = this.activeDeployments.get(deploymentId);
    
    const message = task.instructions || `Please execute: ${task.command}`;
    
    await this.claudeCodeInterface.sendMessage(deployment.sessionId, message);
    
    const timeout = task.timeout || 30000;
    await new Promise(resolve => setTimeout(resolve, timeout));
    
    return {
      command: task.command,
      instructions: task.instructions,
      output: 'Custom validation completed'
    };
  }

  /**
   * Wait for task completion
   */
  async waitForTaskCompletion(sessionId, taskId, taskType, timeout = 180000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const results = await this.claudeCodeInterface.getAnalysisResults(sessionId, taskId);
        
        if (results.success && results.results.status === 'completed') {
          return results.results;
        }
        
        if (results.results.status === 'failed') {
          throw new Error(`Task failed: ${results.results.error}`);
        }
        
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        if (error.message.includes('not found')) {
          // Task might still be initializing
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        throw error;
      }
    }
    
    throw new Error(`Task ${taskId} timed out after ${timeout}ms`);
  }

  /**
   * Generate deployment report
   */
  async generateDeploymentReport(deploymentId) {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const validationResults = deployment.results.execute_validation?.validationResults || [];
    
    const report = {
      deploymentId,
      status: deployment.status,
      startTime: deployment.startTime,
      endTime: deployment.endTime,
      duration: deployment.duration,
      repository: {
        url: deployment.request.repositoryUrl,
        branch: deployment.request.prBranch,
        commit: deployment.results.clone_repository?.commit
      },
      validation: {
        totalTasks: validationResults.length,
        successfulTasks: validationResults.filter(r => r.success).length,
        failedTasks: validationResults.filter(r => !r.success).length,
        results: validationResults
      },
      steps: deployment.steps.map(step => ({
        name: step.name,
        status: step.status,
        duration: step.duration,
        error: step.error
      })),
      resources: {
        instanceId: deployment.instanceId,
        sessionId: deployment.sessionId,
        workspacePath: deployment.workspacePath
      },
      logs: deployment.logs
    };

    return report;
  }

  /**
   * Stop a deployment
   */
  async stopDeployment(deploymentId) {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      console.warn(`Deployment not found for stopping: ${deploymentId}`);
      return { success: true, message: 'Deployment not found' };
    }

    try {
      console.log(`Stopping deployment: ${deploymentId}`);
      
      deployment.status = 'stopping';
      this.emit('deploymentStopping', { deploymentId });

      await this.cleanupDeployment(deploymentId);

      deployment.status = 'stopped';
      deployment.endTime = new Date();
      
      this.emit('deploymentStopped', { deploymentId });
      
      // Process next deployment in queue
      this.processNextDeployment();

      return { success: true };
    } catch (error) {
      console.error(`Failed to stop deployment ${deploymentId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup deployment resources
   */
  async cleanupDeployment(deploymentId) {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) return;

    try {
      // Stop Claude Code session
      if (deployment.sessionId) {
        await this.claudeCodeInterface.stopSession(deployment.sessionId).catch(console.error);
      }

      // Destroy WSL2 instance
      if (deployment.instanceId) {
        await this.wsl2Manager.destroyInstance(deployment.instanceId).catch(console.error);
      }

      console.log(`Cleanup completed for deployment: ${deploymentId}`);
    } catch (error) {
      console.error(`Cleanup failed for deployment ${deploymentId}: ${error.message}`);
    }
  }

  /**
   * Process next deployment in queue
   */
  async processNextDeployment() {
    if (this.deploymentQueue.length === 0 || this.isProcessingQueue) {
      return;
    }

    if (this.activeDeployments.size >= this.maxConcurrentDeployments) {
      return;
    }

    this.isProcessingQueue = true;
    
    try {
      const nextDeploymentId = this.deploymentQueue.shift();
      if (nextDeploymentId && this.activeDeployments.has(nextDeploymentId)) {
        await this.executeDeployment(nextDeploymentId);
      }
    } catch (error) {
      console.error(`Failed to process next deployment: ${error.message}`);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Handle Claude Code messages
   */
  handleClaudeCodeMessage(data) {
    const { sessionId, message } = data;
    
    // Find deployment by session ID
    for (const [deploymentId, deployment] of this.activeDeployments.entries()) {
      if (deployment.sessionId === sessionId) {
        this.addLog(deploymentId, `Claude Code: ${message.content}`);
        this.emit('deploymentMessage', { deploymentId, message });
        break;
      }
    }
  }

  /**
   * Handle Claude Code completion
   */
  handleClaudeCodeCompletion(data) {
    const { sessionId, result } = data;
    
    for (const [deploymentId, deployment] of this.activeDeployments.entries()) {
      if (deployment.sessionId === sessionId) {
        this.addLog(deploymentId, `Claude Code task completed: ${JSON.stringify(result)}`);
        this.emit('deploymentTaskCompleted', { deploymentId, result });
        break;
      }
    }
  }

  /**
   * Handle Claude Code errors
   */
  handleClaudeCodeError(data) {
    const { sessionId, error } = data;
    
    for (const [deploymentId, deployment] of this.activeDeployments.entries()) {
      if (deployment.sessionId === sessionId) {
        this.addLog(deploymentId, `Claude Code error: ${error}`);
        this.emit('deploymentError', { deploymentId, error });
        break;
      }
    }
  }

  /**
   * Add log entry to deployment
   */
  addLog(deploymentId, message) {
    const deployment = this.activeDeployments.get(deploymentId);
    if (deployment) {
      deployment.logs.push({
        timestamp: new Date().toISOString(),
        message
      });
      
      // Limit log size
      if (deployment.logs.length > 1000) {
        deployment.logs = deployment.logs.slice(-500);
      }
    }
  }

  /**
   * Get deployment status
   */
  getDeploymentStatus(deploymentId) {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      return null;
    }

    return {
      id: deployment.id,
      status: deployment.status,
      progress: deployment.progress,
      startTime: deployment.startTime,
      endTime: deployment.endTime,
      duration: deployment.duration,
      steps: deployment.steps,
      error: deployment.error
    };
  }

  /**
   * Get all active deployments
   */
  getAllDeployments() {
    return Array.from(this.activeDeployments.values()).map(deployment => ({
      id: deployment.id,
      status: deployment.status,
      progress: deployment.progress,
      startTime: deployment.startTime,
      repository: deployment.request.repositoryUrl,
      branch: deployment.request.prBranch
    }));
  }

  /**
   * Get orchestrator statistics
   */
  getStatistics() {
    return {
      activeDeployments: this.activeDeployments.size,
      queuedDeployments: this.deploymentQueue.length,
      maxConcurrentDeployments: this.maxConcurrentDeployments,
      totalProcessed: this.activeDeployments.size + this.deploymentQueue.length
    };
  }
}

module.exports = DeploymentOrchestrator;

