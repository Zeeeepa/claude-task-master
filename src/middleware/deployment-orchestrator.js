/**
 * Deployment Orchestrator
 * 
 * Coordinates complex deployment workflows and validation processes:
 * - Workflow coordination: manage multi-step deployment processes
 * - Validation orchestration: coordinate multiple validation tasks
 * - Resource allocation: manage Claude Code and WSL2 instances
 * - Status tracking: monitor deployment progress and results
 */

import { EventEmitter } from 'events';

export class DeploymentOrchestrator extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxConcurrentDeployments: 3,
      deploymentTimeout: 600000, // 10 minutes
      validationTimeout: 300000, // 5 minutes
      retryAttempts: 2,
      retryDelay: 10000,
      enableParallelValidation: true,
      ...config
    };
    
    this.claudeCodeManager = config.claudeCodeManager;
    this.wsl2Manager = config.wsl2Manager;
    
    this.activeDeployments = new Map();
    this.deploymentCounter = 0;
    this.isInitialized = false;
    
    this.metrics = {
      deploymentsStarted: 0,
      deploymentsCompleted: 0,
      deploymentsFailed: 0,
      averageDeploymentTime: 0,
      totalDeploymentTime: 0
    };
  }

  /**
   * Initialize the orchestrator
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }
    
    console.log('Initializing Deployment Orchestrator...');
    
    if (!this.claudeCodeManager) {
      throw new Error('Claude Code Manager is required');
    }
    
    this.isInitialized = true;
    console.log('Deployment Orchestrator initialized');
    this.emit('initialized');
  }

  /**
   * Start the orchestrator
   */
  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    console.log('Deployment Orchestrator started');
    this.emit('started');
  }

  /**
   * Stop the orchestrator
   */
  async stop() {
    console.log('Stopping Deployment Orchestrator...');
    
    // Wait for active deployments to complete or timeout
    await this.waitForActiveDeployments();
    
    console.log('Deployment Orchestrator stopped');
    this.emit('stopped');
  }

  /**
   * Execute a deployment workflow
   */
  async executeDeployment(deploymentData) {
    if (this.activeDeployments.size >= this.config.maxConcurrentDeployments) {
      throw new Error(`Maximum concurrent deployments (${this.config.maxConcurrentDeployments}) reached`);
    }
    
    const deploymentId = `deployment-${++this.deploymentCounter}-${Date.now()}`;
    const startTime = Date.now();
    
    const deployment = {
      id: deploymentId,
      data: deploymentData,
      status: 'initializing',
      startTime: new Date(),
      steps: [],
      resources: {
        claudeCodeInstance: null,
        wsl2Instance: null
      },
      results: {},
      error: null
    };
    
    this.activeDeployments.set(deploymentId, deployment);
    this.metrics.deploymentsStarted++;
    
    try {
      console.log(`Starting deployment: ${deploymentId}`);
      this.emit('deploymentStarted', { deploymentId, deployment });
      
      // Execute deployment steps
      await this.executeDeploymentSteps(deployment);
      
      // Mark as completed
      const processingTime = Date.now() - startTime;
      deployment.status = 'completed';
      deployment.endTime = new Date();
      deployment.processingTime = processingTime;
      
      this.metrics.deploymentsCompleted++;
      this.metrics.totalDeploymentTime += processingTime;
      this.metrics.averageDeploymentTime = 
        this.metrics.totalDeploymentTime / this.metrics.deploymentsCompleted;
      
      console.log(`Deployment completed: ${deploymentId} in ${processingTime}ms`);
      this.emit('deploymentCompleted', { deploymentId, deployment });
      
      return {
        success: true,
        deploymentId,
        processingTime,
        results: deployment.results
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      deployment.status = 'failed';
      deployment.endTime = new Date();
      deployment.processingTime = processingTime;
      deployment.error = error.message;
      
      this.metrics.deploymentsFailed++;
      
      console.error(`Deployment failed: ${deploymentId} - ${error.message}`);
      this.emit('deploymentFailed', { deploymentId, deployment, error });
      
      throw error;
      
    } finally {
      // Cleanup resources
      await this.cleanupDeploymentResources(deployment);
      
      // Remove from active deployments after delay
      setTimeout(() => {
        this.activeDeployments.delete(deploymentId);
      }, 60000); // Keep for 1 minute for status queries
    }
  }

  /**
   * Execute deployment steps
   */
  async executeDeploymentSteps(deployment) {
    const { repositoryUrl, prBranch, validationTasks, options = {} } = deployment.data;
    
    // Step 1: Setup environment
    await this.executeStep(deployment, 'setup_environment', async () => {
      return await this.setupDeploymentEnvironment(deployment, options);
    });
    
    // Step 2: Clone repository
    await this.executeStep(deployment, 'clone_repository', async () => {
      return await this.cloneRepository(deployment, repositoryUrl, prBranch);
    });
    
    // Step 3: Execute validations
    if (validationTasks && validationTasks.length > 0) {
      await this.executeStep(deployment, 'execute_validations', async () => {
        return await this.executeValidationWorkflow(deployment, validationTasks);
      });
    }
    
    // Step 4: Generate report
    await this.executeStep(deployment, 'generate_report', async () => {
      return await this.generateDeploymentReport(deployment);
    });
  }

  /**
   * Execute a single deployment step
   */
  async executeStep(deployment, stepName, stepFunction) {
    const step = {
      name: stepName,
      status: 'running',
      startTime: new Date(),
      endTime: null,
      result: null,
      error: null
    };
    
    deployment.steps.push(step);
    deployment.status = `executing_${stepName}`;
    
    console.log(`Executing step: ${stepName} for deployment ${deployment.id}`);
    this.emit('deploymentStepStarted', { deploymentId: deployment.id, step });
    
    try {
      const result = await stepFunction();
      
      step.status = 'completed';
      step.endTime = new Date();
      step.result = result;
      
      console.log(`Step completed: ${stepName} for deployment ${deployment.id}`);
      this.emit('deploymentStepCompleted', { deploymentId: deployment.id, step });
      
      return result;
      
    } catch (error) {
      step.status = 'failed';
      step.endTime = new Date();
      step.error = error.message;
      
      console.error(`Step failed: ${stepName} for deployment ${deployment.id} - ${error.message}`);
      this.emit('deploymentStepFailed', { deploymentId: deployment.id, step, error });
      
      throw error;
    }
  }

  /**
   * Setup deployment environment
   */
  async setupDeploymentEnvironment(deployment, options) {
    const resources = {};
    
    // Create WSL2 instance if available and requested
    if (this.wsl2Manager && options.useWSL2) {
      const wsl2InstanceId = await this.wsl2Manager.createInstance({
        environment: {
          packages: ['git', 'nodejs', 'npm', 'python3'],
          workingDirectory: '/workspace',
          ...options.wsl2Environment
        }
      });
      
      deployment.resources.wsl2Instance = wsl2InstanceId;
      resources.wsl2Instance = wsl2InstanceId;
    }
    
    // Create Claude Code instance
    const claudeCodeInstanceId = await this.claudeCodeManager.createInstance({
      allowedTools: ['Bash(git*)', 'Edit', 'Replace', 'Search', 'Create'],
      workingDirectory: options.workingDirectory || '/workspace',
      ...options.claudeCodeConfig
    });
    
    deployment.resources.claudeCodeInstance = claudeCodeInstanceId;
    resources.claudeCodeInstance = claudeCodeInstanceId;
    
    return {
      success: true,
      resources
    };
  }

  /**
   * Clone repository
   */
  async cloneRepository(deployment, repositoryUrl, branch) {
    const instanceId = deployment.resources.claudeCodeInstance;
    
    const cloneInstruction = `
Clone the repository ${repositoryUrl} and checkout branch ${branch || 'main'}.
Ensure the repository is properly cloned and the correct branch is checked out.
Verify the repository structure and report any issues.
`;
    
    const result = await this.claudeCodeManager.executeInstruction(
      instanceId,
      cloneInstruction,
      { repositoryUrl, branch }
    );
    
    return {
      success: true,
      repositoryUrl,
      branch,
      result
    };
  }

  /**
   * Execute validation workflow
   */
  async executeValidationWorkflow(deployment, validationTasks) {
    const instanceId = deployment.resources.claudeCodeInstance;
    const results = [];
    
    if (this.config.enableParallelValidation && validationTasks.length > 1) {
      // Execute validations in parallel
      const validationPromises = validationTasks.map(task => 
        this.executeValidationTask(instanceId, task)
      );
      
      const validationResults = await Promise.allSettled(validationPromises);
      
      for (let i = 0; i < validationResults.length; i++) {
        const result = validationResults[i];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            task: validationTasks[i],
            success: false,
            error: result.reason.message
          });
        }
      }
      
    } else {
      // Execute validations sequentially
      for (const task of validationTasks) {
        try {
          const result = await this.executeValidationTask(instanceId, task);
          results.push(result);
        } catch (error) {
          results.push({
            task,
            success: false,
            error: error.message
          });
          
          // Stop on first failure if configured
          if (task.stopOnError !== false) {
            break;
          }
        }
      }
    }
    
    return {
      success: results.every(r => r.success),
      results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    };
  }

  /**
   * Execute single validation task
   */
  async executeValidationTask(instanceId, validationTask) {
    return await this.claudeCodeManager.executeValidation(
      instanceId,
      validationTask,
      { timeout: this.config.validationTimeout }
    );
  }

  /**
   * Generate deployment report
   */
  async generateDeploymentReport(deployment) {
    const report = {
      deploymentId: deployment.id,
      status: deployment.status,
      startTime: deployment.startTime,
      endTime: deployment.endTime,
      processingTime: deployment.processingTime,
      steps: deployment.steps.map(step => ({
        name: step.name,
        status: step.status,
        duration: step.endTime ? step.endTime.getTime() - step.startTime.getTime() : null,
        error: step.error
      })),
      validationSummary: deployment.results.validationResults?.summary,
      resources: deployment.resources,
      success: deployment.status === 'completed'
    };
    
    deployment.results.report = report;
    
    return {
      success: true,
      report
    };
  }

  /**
   * Cleanup deployment resources
   */
  async cleanupDeploymentResources(deployment) {
    try {
      // Cleanup Claude Code instance
      if (deployment.resources.claudeCodeInstance) {
        await this.claudeCodeManager.stopInstance(deployment.resources.claudeCodeInstance);
      }
      
      // Cleanup WSL2 instance
      if (deployment.resources.wsl2Instance && this.wsl2Manager) {
        await this.wsl2Manager.destroyInstance(deployment.resources.wsl2Instance);
      }
      
    } catch (error) {
      console.error(`Error cleaning up deployment resources: ${error.message}`);
    }
  }

  /**
   * Handle instance ready event
   */
  onInstanceReady(instance) {
    console.log(`Instance ready: ${instance.id}`);
    this.emit('instanceReady', instance);
  }

  /**
   * Get deployment status
   */
  getDeploymentStatus(deploymentId) {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      return { found: false };
    }
    
    return {
      found: true,
      id: deployment.id,
      status: deployment.status,
      startTime: deployment.startTime,
      endTime: deployment.endTime,
      processingTime: deployment.processingTime,
      steps: deployment.steps,
      resources: deployment.resources,
      error: deployment.error
    };
  }

  /**
   * List active deployments
   */
  listActiveDeployments() {
    return Array.from(this.activeDeployments.values()).map(deployment => ({
      id: deployment.id,
      status: deployment.status,
      startTime: deployment.startTime,
      currentStep: deployment.steps[deployment.steps.length - 1]?.name,
      resources: deployment.resources
    }));
  }

  /**
   * Wait for active deployments to complete
   */
  async waitForActiveDeployments(timeout = 30000) {
    const startTime = Date.now();
    
    while (this.activeDeployments.size > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (this.activeDeployments.size > 0) {
      console.warn(`${this.activeDeployments.size} deployments still active after timeout`);
    }
  }

  /**
   * Get orchestrator health status
   */
  getHealth() {
    const activeDeployments = this.activeDeployments.size;
    const utilizationRate = activeDeployments / this.config.maxConcurrentDeployments;
    
    let status = 'healthy';
    if (utilizationRate > 0.8) {
      status = 'degraded';
    }
    if (utilizationRate >= 1.0) {
      status = 'unhealthy';
    }
    
    return {
      status,
      activeDeployments,
      maxConcurrentDeployments: this.config.maxConcurrentDeployments,
      utilizationRate,
      metrics: this.metrics,
      lastHealthCheck: new Date().toISOString()
    };
  }

  /**
   * Get orchestrator statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      activeDeployments: this.activeDeployments.size,
      utilizationRate: this.activeDeployments.size / this.config.maxConcurrentDeployments,
      successRate: this.metrics.deploymentsStarted > 0 
        ? this.metrics.deploymentsCompleted / this.metrics.deploymentsStarted 
        : 0
    };
  }
}

export default DeploymentOrchestrator;

