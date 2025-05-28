/**
 * Orchestrator Client
 * 
 * HTTP client for communicating with the main system orchestrator
 */

const axios = require('axios');
const { EventEmitter } = require('events');

class OrchestratorClient extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      apiUrl: 'http://localhost:3000',
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 5000,
      ...config
    };

    this.setupHttpClient();
  }

  /**
   * Setup HTTP client with interceptors
   */
  setupHttpClient() {
    this.httpClient = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AgentAPI-Middleware/1.0.0',
        'X-Service': 'agentapi-middleware'
      }
    });

    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        console.log(`Orchestrator API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('Orchestrator API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        console.log(`Orchestrator API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('Orchestrator API Response Error:', error.response?.status, error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check orchestrator health
   */
  async checkHealth() {
    try {
      const response = await this.httpClient.get('/health');
      return {
        available: true,
        status: response.data,
        responseTime: response.headers['x-response-time'] || 'unknown'
      };
    } catch (error) {
      console.error('Orchestrator health check failed:', error.message);
      return {
        available: false,
        error: error.message,
        status: error.response?.status || 'unknown'
      };
    }
  }

  /**
   * Register AgentAPI middleware with orchestrator
   */
  async registerMiddleware(middlewareInfo) {
    try {
      const registrationData = {
        serviceId: 'agentapi-middleware',
        name: 'AgentAPI Middleware',
        version: '1.0.0',
        capabilities: [
          'wsl2_management',
          'git_operations',
          'claude_code_integration',
          'deployment_orchestration'
        ],
        endpoints: {
          health: '/health',
          deployment: '/api/deployment',
          validation: '/api/validation',
          status: '/api/status',
          webhook: '/api/webhook'
        },
        ...middlewareInfo
      };

      const response = await this.httpClient.post('/services/register', registrationData);
      
      console.log('AgentAPI middleware registered with orchestrator');
      this.emit('registered', response.data);
      
      return {
        success: true,
        serviceId: response.data.serviceId,
        registrationId: response.data.registrationId
      };
    } catch (error) {
      console.error('Failed to register with orchestrator:', error.message);
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  /**
   * Report deployment status to orchestrator
   */
  async reportDeploymentStatus(deploymentId, status, details = {}) {
    try {
      const statusData = {
        deploymentId,
        status,
        timestamp: new Date().toISOString(),
        source: 'agentapi-middleware',
        ...details
      };

      const response = await this.httpClient.post('/deployments/status', statusData);
      
      this.emit('statusReported', { deploymentId, status });
      
      return {
        success: true,
        acknowledged: response.data.acknowledged
      };
    } catch (error) {
      console.error(`Failed to report deployment status: ${error.message}`);
      throw new Error(`Status report failed: ${error.message}`);
    }
  }

  /**
   * Request deployment from orchestrator
   */
  async requestDeployment(deploymentRequest) {
    try {
      const response = await this.httpClient.post('/deployments/request', {
        source: 'agentapi-middleware',
        timestamp: new Date().toISOString(),
        ...deploymentRequest
      });

      this.emit('deploymentRequested', response.data);
      
      return {
        success: true,
        deploymentId: response.data.deploymentId,
        status: response.data.status
      };
    } catch (error) {
      console.error(`Failed to request deployment: ${error.message}`);
      throw new Error(`Deployment request failed: ${error.message}`);
    }
  }

  /**
   * Get deployment configuration from orchestrator
   */
  async getDeploymentConfig(repositoryUrl, branch) {
    try {
      const response = await this.httpClient.get('/deployments/config', {
        params: { repositoryUrl, branch }
      });

      return {
        success: true,
        config: response.data.config
      };
    } catch (error) {
      console.error(`Failed to get deployment config: ${error.message}`);
      return {
        success: false,
        error: error.message,
        config: null
      };
    }
  }

  /**
   * Submit validation results to orchestrator
   */
  async submitValidationResults(deploymentId, validationResults) {
    try {
      const resultsData = {
        deploymentId,
        results: validationResults,
        timestamp: new Date().toISOString(),
        source: 'agentapi-middleware'
      };

      const response = await this.httpClient.post('/validations/results', resultsData);
      
      this.emit('validationResultsSubmitted', { deploymentId, results: validationResults });
      
      return {
        success: true,
        resultId: response.data.resultId
      };
    } catch (error) {
      console.error(`Failed to submit validation results: ${error.message}`);
      throw new Error(`Validation submission failed: ${error.message}`);
    }
  }

  /**
   * Get task assignment from orchestrator
   */
  async getTaskAssignment() {
    try {
      const response = await this.httpClient.get('/tasks/assignment', {
        params: { serviceId: 'agentapi-middleware' }
      });

      if (response.data.task) {
        this.emit('taskAssigned', response.data.task);
      }

      return {
        success: true,
        task: response.data.task || null
      };
    } catch (error) {
      console.error(`Failed to get task assignment: ${error.message}`);
      return {
        success: false,
        error: error.message,
        task: null
      };
    }
  }

  /**
   * Update task progress
   */
  async updateTaskProgress(taskId, progress, status, details = {}) {
    try {
      const progressData = {
        taskId,
        progress,
        status,
        timestamp: new Date().toISOString(),
        source: 'agentapi-middleware',
        ...details
      };

      const response = await this.httpClient.put(`/tasks/${taskId}/progress`, progressData);
      
      this.emit('taskProgressUpdated', { taskId, progress, status });
      
      return {
        success: true,
        acknowledged: response.data.acknowledged
      };
    } catch (error) {
      console.error(`Failed to update task progress: ${error.message}`);
      throw new Error(`Task progress update failed: ${error.message}`);
    }
  }

  /**
   * Complete task
   */
  async completeTask(taskId, result, success = true) {
    try {
      const completionData = {
        taskId,
        result,
        success,
        timestamp: new Date().toISOString(),
        source: 'agentapi-middleware'
      };

      const response = await this.httpClient.post(`/tasks/${taskId}/complete`, completionData);
      
      this.emit('taskCompleted', { taskId, result, success });
      
      return {
        success: true,
        acknowledged: response.data.acknowledged
      };
    } catch (error) {
      console.error(`Failed to complete task: ${error.message}`);
      throw new Error(`Task completion failed: ${error.message}`);
    }
  }

  /**
   * Notify orchestrator about workflow completion
   */
  async notifyWorkflowCompletion(workflowData) {
    try {
      const notificationData = {
        type: 'workflow_completion',
        timestamp: new Date().toISOString(),
        source: 'agentapi-middleware',
        ...workflowData
      };

      const response = await this.httpClient.post('/notifications/workflow', notificationData);
      
      this.emit('workflowNotified', workflowData);
      
      return {
        success: true,
        notificationId: response.data.notificationId
      };
    } catch (error) {
      console.error(`Failed to notify workflow completion: ${error.message}`);
      throw new Error(`Workflow notification failed: ${error.message}`);
    }
  }

  /**
   * Notify orchestrator about Linear issue
   */
  async notifyLinearIssue(issueData) {
    try {
      const notificationData = {
        type: 'linear_issue',
        timestamp: new Date().toISOString(),
        source: 'agentapi-middleware',
        ...issueData
      };

      const response = await this.httpClient.post('/notifications/linear', notificationData);
      
      this.emit('linearIssueNotified', issueData);
      
      return {
        success: true,
        notificationId: response.data.notificationId
      };
    } catch (error) {
      console.error(`Failed to notify Linear issue: ${error.message}`);
      throw new Error(`Linear notification failed: ${error.message}`);
    }
  }

  /**
   * Notify orchestrator about Linear project
   */
  async notifyLinearProject(projectData) {
    try {
      const notificationData = {
        type: 'linear_project',
        timestamp: new Date().toISOString(),
        source: 'agentapi-middleware',
        ...projectData
      };

      const response = await this.httpClient.post('/notifications/linear', notificationData);
      
      this.emit('linearProjectNotified', projectData);
      
      return {
        success: true,
        notificationId: response.data.notificationId
      };
    } catch (error) {
      console.error(`Failed to notify Linear project: ${error.message}`);
      throw new Error(`Linear project notification failed: ${error.message}`);
    }
  }

  /**
   * Get system configuration from orchestrator
   */
  async getSystemConfiguration() {
    try {
      const response = await this.httpClient.get('/system/config');
      
      return {
        success: true,
        config: response.data.config
      };
    } catch (error) {
      console.error(`Failed to get system configuration: ${error.message}`);
      return {
        success: false,
        error: error.message,
        config: null
      };
    }
  }

  /**
   * Report system metrics to orchestrator
   */
  async reportMetrics(metrics) {
    try {
      const metricsData = {
        serviceId: 'agentapi-middleware',
        timestamp: new Date().toISOString(),
        metrics
      };

      const response = await this.httpClient.post('/metrics/report', metricsData);
      
      this.emit('metricsReported', metrics);
      
      return {
        success: true,
        acknowledged: response.data.acknowledged
      };
    } catch (error) {
      console.error(`Failed to report metrics: ${error.message}`);
      // Don't throw here as metrics reporting is not critical
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute with retry logic
   */
  async executeWithRetry(operation, maxRetries = this.config.retryAttempts) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(`Orchestrator operation attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          const delay = this.config.retryDelay * attempt;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Start heartbeat to orchestrator
   */
  startHeartbeat(interval = 30000) {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.sendHeartbeat();
      } catch (error) {
        console.error('Heartbeat failed:', error.message);
        this.emit('heartbeatFailed', error);
      }
    }, interval);

    console.log(`Heartbeat started with ${interval}ms interval`);
  }

  /**
   * Send heartbeat to orchestrator
   */
  async sendHeartbeat() {
    try {
      const heartbeatData = {
        serviceId: 'agentapi-middleware',
        timestamp: new Date().toISOString(),
        status: 'healthy',
        uptime: process.uptime()
      };

      await this.httpClient.post('/heartbeat', heartbeatData);
      this.emit('heartbeatSent');
    } catch (error) {
      throw new Error(`Heartbeat failed: ${error.message}`);
    }
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('Heartbeat stopped');
    }
  }

  /**
   * Unregister from orchestrator
   */
  async unregister() {
    try {
      await this.httpClient.post('/services/unregister', {
        serviceId: 'agentapi-middleware'
      });
      
      this.stopHeartbeat();
      this.emit('unregistered');
      
      console.log('AgentAPI middleware unregistered from orchestrator');
      return { success: true };
    } catch (error) {
      console.error('Failed to unregister from orchestrator:', error.message);
      throw new Error(`Unregistration failed: ${error.message}`);
    }
  }

  /**
   * Get client statistics
   */
  getStatistics() {
    return {
      apiUrl: this.config.apiUrl,
      timeout: this.config.timeout,
      retryAttempts: this.config.retryAttempts,
      heartbeatActive: !!this.heartbeatInterval,
      eventListeners: this.eventNames().length
    };
  }
}

module.exports = OrchestratorClient;

