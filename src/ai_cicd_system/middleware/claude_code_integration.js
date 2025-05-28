/**
 * Claude Code Integration
 * 
 * Integrates Claude Code with AgentAPI for PR branch deployment and validation.
 * Provides seamless orchestration between the AI CI/CD system and Claude Code
 * running on WSL2 instances.
 * 
 * Features:
 * - Claude Code session management
 * - PR branch cloning and setup
 * - Code validation and testing
 * - Error detection and reporting
 * - Performance monitoring
 * - Automated debugging workflows
 */

import { EventEmitter } from 'events';
import { SimpleLogger } from '../utils/simple_logger.js';
import AgentAPIClient from './agentapi_client.js';
import WSL2Manager from './wsl2_manager.js';

export class ClaudeCodeIntegration extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      agentapi: {
        baseURL: config.agentapi?.baseURL || process.env.AGENTAPI_URL || 'http://localhost:8000',
        timeout: config.agentapi?.timeout || 60000,
        retryAttempts: config.agentapi?.retryAttempts || 3,
        ...config.agentapi
      },
      wsl2: {
        maxInstances: config.wsl2?.maxInstances || 3,
        instanceTimeout: config.wsl2?.instanceTimeout || 7200000, // 2 hours
        resourceLimits: {
          memory: '8GB',
          cpu: 4,
          disk: '50GB'
        },
        ...config.wsl2
      },
      claudeCode: {
        model: config.claudeCode?.model || 'claude-3-sonnet-20240229',
        maxTokens: config.claudeCode?.maxTokens || 4096,
        temperature: config.claudeCode?.temperature || 0.1,
        systemPrompt: config.claudeCode?.systemPrompt || this.getDefaultSystemPrompt(),
        ...config.claudeCode
      },
      validation: {
        runTests: config.validation?.runTests !== false,
        runLinting: config.validation?.runLinting !== false,
        runSecurity: config.validation?.runSecurity !== false,
        testTimeout: config.validation?.testTimeout || 300000, // 5 minutes
        ...config.validation
      },
      ...config
    };

    this.logger = new SimpleLogger('ClaudeCodeIntegration', config.logLevel || 'info');
    
    // Initialize components
    this.agentAPI = new AgentAPIClient(this.config.agentapi);
    this.wsl2Manager = new WSL2Manager(this.config.wsl2);
    
    // Session tracking
    this.activeSessions = new Map();
    this.deployments = new Map();
    
    // Setup event handlers
    this.setupEventHandlers();
  }

  /**
   * Get default system prompt for Claude Code
   */
  getDefaultSystemPrompt() {
    return `You are Claude Code, an AI assistant specialized in code review, testing, and validation.

Your role in this CI/CD pipeline:
1. Analyze PR changes for potential issues
2. Run comprehensive tests and validation
3. Provide detailed feedback on code quality
4. Suggest improvements and fixes
5. Ensure security best practices
6. Validate deployment readiness

Guidelines:
- Be thorough but efficient in your analysis
- Focus on critical issues that could break production
- Provide actionable feedback with specific suggestions
- Consider performance, security, and maintainability
- Use the available tools to run tests and validations
- Report findings in a structured, clear format

Available commands in the WSL2 environment:
- npm/yarn for Node.js projects
- pip for Python projects
- cargo for Rust projects
- go for Go projects
- Standard Unix tools (grep, find, etc.)
- Git for version control operations
- Docker for containerized testing

Always validate your findings and provide confidence levels for your assessments.`;
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // AgentAPI events
    this.agentAPI.on('sessionStarted', (data) => {
      this.logger.info(`Claude Code session started: ${data.sessionId}`);
      this.emit('sessionStarted', data);
    });

    this.agentAPI.on('sessionStopped', (data) => {
      this.logger.info(`Claude Code session stopped: ${data.sessionId}`);
      this.activeSessions.delete(data.sessionId);
      this.emit('sessionStopped', data);
    });

    // WSL2 events
    this.wsl2Manager.on('instanceCreated', (instance) => {
      this.logger.info(`WSL2 instance created for Claude Code: ${instance.id}`);
      this.emit('instanceCreated', instance);
    });

    this.wsl2Manager.on('codeDeployed', (data) => {
      this.logger.info(`Code deployed to WSL2 instance: ${data.instanceId}`);
      this.emit('codeDeployed', data);
    });
  }

  /**
   * Deploy and validate PR branch
   */
  async deployAndValidatePR(prData, options = {}) {
    const deploymentId = this.generateDeploymentId();
    
    try {
      this.logger.info(`Starting PR deployment and validation: ${prData.number}`);
      
      const deployment = {
        id: deploymentId,
        pr: prData,
        status: 'initializing',
        createdAt: Date.now(),
        steps: [],
        results: {},
        options
      };
      
      this.deployments.set(deploymentId, deployment);
      this.emit('deploymentStarted', deployment);

      // Step 1: Create WSL2 instance
      deployment.status = 'creating-instance';
      this.addDeploymentStep(deployment, 'Creating WSL2 instance');
      
      const instance = await this.wsl2Manager.createInstance({
        metadata: {
          deploymentId,
          prNumber: prData.number,
          gitConfig: {
            name: 'Claude Code CI',
            email: 'claude-code@ci.local'
          }
        }
      });

      deployment.instanceId = instance.id;
      this.addDeploymentStep(deployment, `WSL2 instance created: ${instance.id}`);

      // Step 2: Deploy code to instance
      deployment.status = 'deploying-code';
      this.addDeploymentStep(deployment, 'Deploying PR code');
      
      await this.wsl2Manager.deployCode(instance.id, {
        repository: {
          url: prData.repository.clone_url,
          branch: prData.head.ref,
          credentials: options.gitCredentials
        },
        setupCommands: this.getSetupCommands(prData)
      });

      this.addDeploymentStep(deployment, 'Code deployed successfully');

      // Step 3: Start Claude Code session
      deployment.status = 'starting-claude-code';
      this.addDeploymentStep(deployment, 'Starting Claude Code session');
      
      const session = await this.agentAPI.startAgentSession('claude', {
        model: this.config.claudeCode.model,
        maxTokens: this.config.claudeCode.maxTokens,
        temperature: this.config.claudeCode.temperature,
        systemPrompt: this.config.claudeCode.systemPrompt,
        wsl2Instance: instance.id,
        deploymentId
      });

      deployment.sessionId = session.sessionId;
      this.activeSessions.set(session.sessionId, deployment);
      this.addDeploymentStep(deployment, `Claude Code session started: ${session.sessionId}`);

      // Step 4: Perform validation
      deployment.status = 'validating';
      this.addDeploymentStep(deployment, 'Starting validation process');
      
      const validationResults = await this.performValidation(deployment);
      deployment.results = validationResults;

      // Step 5: Generate report
      deployment.status = 'generating-report';
      this.addDeploymentStep(deployment, 'Generating validation report');
      
      const report = await this.generateValidationReport(deployment);
      deployment.report = report;

      deployment.status = 'completed';
      deployment.completedAt = Date.now();
      this.addDeploymentStep(deployment, 'Validation completed');

      this.logger.info(`PR validation completed: ${deploymentId}`);
      this.emit('deploymentCompleted', deployment);

      return deployment;
    } catch (error) {
      this.logger.error(`PR deployment failed: ${deploymentId}`, error);
      
      if (this.deployments.has(deploymentId)) {
        const deployment = this.deployments.get(deploymentId);
        deployment.status = 'failed';
        deployment.error = error.message;
        deployment.completedAt = Date.now();
        this.addDeploymentStep(deployment, `Deployment failed: ${error.message}`);
        
        // Cleanup on failure
        await this.cleanupDeployment(deploymentId);
        
        this.emit('deploymentFailed', deployment);
      }
      
      throw error;
    }
  }

  /**
   * Get setup commands for the repository
   */
  getSetupCommands(prData) {
    const commands = [];
    
    // Detect project type and add appropriate setup commands
    const files = prData.files || [];
    
    if (files.some(f => f.filename === 'package.json')) {
      // Node.js project
      commands.push('npm install');
    }
    
    if (files.some(f => f.filename === 'requirements.txt')) {
      // Python project
      commands.push('pip install -r requirements.txt');
    }
    
    if (files.some(f => f.filename === 'Cargo.toml')) {
      // Rust project
      commands.push('cargo build');
    }
    
    if (files.some(f => f.filename === 'go.mod')) {
      // Go project
      commands.push('go mod download');
    }
    
    if (files.some(f => f.filename === 'composer.json')) {
      // PHP project
      commands.push('composer install');
    }
    
    // Add git configuration
    commands.unshift('git config --global --add safe.directory /workspace/repo');
    
    return commands;
  }

  /**
   * Perform comprehensive validation
   */
  async performValidation(deployment) {
    const results = {
      tests: null,
      linting: null,
      security: null,
      codeReview: null,
      performance: null
    };

    try {
      // Run tests
      if (this.config.validation.runTests) {
        this.addDeploymentStep(deployment, 'Running tests');
        results.tests = await this.runTests(deployment);
      }

      // Run linting
      if (this.config.validation.runLinting) {
        this.addDeploymentStep(deployment, 'Running linting');
        results.linting = await this.runLinting(deployment);
      }

      // Run security checks
      if (this.config.validation.runSecurity) {
        this.addDeploymentStep(deployment, 'Running security checks');
        results.security = await this.runSecurityChecks(deployment);
      }

      // Perform code review with Claude Code
      this.addDeploymentStep(deployment, 'Performing AI code review');
      results.codeReview = await this.performCodeReview(deployment);

      // Performance analysis
      this.addDeploymentStep(deployment, 'Analyzing performance');
      results.performance = await this.analyzePerformance(deployment);

      return results;
    } catch (error) {
      this.logger.error('Validation failed:', error);
      throw error;
    }
  }

  /**
   * Run tests
   */
  async runTests(deployment) {
    try {
      const message = `Please run the test suite for this project. 
      
      Steps:
      1. Navigate to /workspace/repo
      2. Identify the testing framework being used
      3. Run the appropriate test command
      4. Analyze the results and provide a summary
      
      Common test commands to try:
      - npm test (Node.js)
      - python -m pytest (Python)
      - cargo test (Rust)
      - go test ./... (Go)
      - composer test (PHP)
      
      Provide detailed output including:
      - Number of tests run
      - Pass/fail counts
      - Any failing test details
      - Coverage information if available`;

      const response = await this.agentAPI.sendMessage(deployment.sessionId, message, {
        timeout: this.config.validation.testTimeout
      });

      return {
        success: true,
        output: response.content,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Run linting
   */
  async runLinting(deployment) {
    try {
      const message = `Please run linting/code quality checks for this project.
      
      Steps:
      1. Navigate to /workspace/repo
      2. Identify the appropriate linting tools
      3. Run linting commands
      4. Analyze and summarize the results
      
      Common linting tools to try:
      - eslint (JavaScript/TypeScript)
      - pylint or flake8 (Python)
      - clippy (Rust)
      - golint or go vet (Go)
      - phpcs (PHP)
      
      Report:
      - Number of issues found
      - Severity levels
      - Most common issue types
      - Recommendations for fixes`;

      const response = await this.agentAPI.sendMessage(deployment.sessionId, message);

      return {
        success: true,
        output: response.content,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Run security checks
   */
  async runSecurityChecks(deployment) {
    try {
      const message = `Please perform security analysis on this codebase.
      
      Steps:
      1. Navigate to /workspace/repo
      2. Check for common security vulnerabilities
      3. Analyze dependencies for known issues
      4. Review code for security best practices
      
      Security checks to perform:
      - npm audit (Node.js)
      - pip-audit or safety (Python)
      - cargo audit (Rust)
      - go list -json -m all | nancy sleuth (Go)
      - Check for hardcoded secrets/credentials
      - Analyze file permissions
      - Review authentication/authorization code
      
      Report findings with:
      - Vulnerability severity levels
      - Affected components
      - Recommended fixes
      - Risk assessment`;

      const response = await this.agentAPI.sendMessage(deployment.sessionId, message);

      return {
        success: true,
        output: response.content,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Perform AI code review
   */
  async performCodeReview(deployment) {
    try {
      const prData = deployment.pr;
      const changedFiles = prData.files?.map(f => f.filename).join(', ') || 'unknown';
      
      const message = `Please perform a comprehensive code review of this PR.
      
      PR Details:
      - Title: ${prData.title}
      - Description: ${prData.body || 'No description provided'}
      - Changed files: ${changedFiles}
      - Additions: ${prData.additions || 0}
      - Deletions: ${prData.deletions || 0}
      
      Review focus areas:
      1. Code quality and maintainability
      2. Performance implications
      3. Security considerations
      4. Best practices adherence
      5. Potential bugs or edge cases
      6. Documentation completeness
      7. Test coverage for changes
      
      Steps:
      1. Navigate to /workspace/repo
      2. Use git to examine the changes: git diff HEAD~1
      3. Analyze each changed file
      4. Look for patterns and potential issues
      5. Consider the overall impact of changes
      
      Provide a structured review with:
      - Overall assessment (approve/request changes/comment)
      - Specific issues found with file/line references
      - Positive aspects worth highlighting
      - Suggestions for improvement
      - Risk level assessment`;

      const response = await this.agentAPI.sendMessage(deployment.sessionId, message);

      return {
        success: true,
        output: response.content,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Analyze performance
   */
  async analyzePerformance(deployment) {
    try {
      const message = `Please analyze the performance characteristics of this codebase.
      
      Steps:
      1. Navigate to /workspace/repo
      2. Identify performance-critical code paths
      3. Look for potential bottlenecks
      4. Analyze algorithmic complexity
      5. Check for resource usage patterns
      
      Analysis areas:
      - Database queries and optimization
      - API response times
      - Memory usage patterns
      - CPU-intensive operations
      - I/O operations
      - Caching strategies
      - Concurrent/parallel processing
      
      Tools to use if available:
      - Profiling tools for the language
      - Memory analyzers
      - Load testing tools
      - Static analysis for complexity
      
      Report:
      - Performance hotspots identified
      - Optimization opportunities
      - Resource usage estimates
      - Scalability considerations
      - Recommendations for improvement`;

      const response = await this.agentAPI.sendMessage(deployment.sessionId, message);

      return {
        success: true,
        output: response.content,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Generate validation report
   */
  async generateValidationReport(deployment) {
    const results = deployment.results;
    const pr = deployment.pr;
    
    const report = {
      deploymentId: deployment.id,
      prNumber: pr.number,
      prTitle: pr.title,
      timestamp: Date.now(),
      duration: Date.now() - deployment.createdAt,
      status: deployment.status,
      summary: {
        testsPass: results.tests?.success || false,
        lintingPass: results.linting?.success || false,
        securityPass: results.security?.success || false,
        codeReviewPass: results.codeReview?.success || false,
        performancePass: results.performance?.success || false
      },
      details: {
        tests: results.tests,
        linting: results.linting,
        security: results.security,
        codeReview: results.codeReview,
        performance: results.performance
      },
      recommendations: [],
      riskLevel: 'unknown'
    };

    // Calculate overall risk level
    const failedChecks = Object.values(report.summary).filter(pass => !pass).length;
    if (failedChecks === 0) {
      report.riskLevel = 'low';
    } else if (failedChecks <= 2) {
      report.riskLevel = 'medium';
    } else {
      report.riskLevel = 'high';
    }

    // Generate recommendations
    if (!report.summary.testsPass) {
      report.recommendations.push('Fix failing tests before merging');
    }
    if (!report.summary.securityPass) {
      report.recommendations.push('Address security vulnerabilities');
    }
    if (!report.summary.lintingPass) {
      report.recommendations.push('Fix linting issues for code quality');
    }

    return report;
  }

  /**
   * Add deployment step
   */
  addDeploymentStep(deployment, message) {
    deployment.steps.push({
      timestamp: Date.now(),
      message
    });
    
    this.logger.debug(`Deployment ${deployment.id}: ${message}`);
    this.emit('deploymentStep', { deploymentId: deployment.id, message });
  }

  /**
   * Get deployment status
   */
  getDeploymentStatus(deploymentId) {
    return this.deployments.get(deploymentId);
  }

  /**
   * Get all deployments
   */
  getAllDeployments() {
    return Array.from(this.deployments.values());
  }

  /**
   * Cleanup deployment
   */
  async cleanupDeployment(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;

    try {
      this.logger.info(`Cleaning up deployment: ${deploymentId}`);

      // Stop Claude Code session
      if (deployment.sessionId) {
        try {
          await this.agentAPI.stopAgentSession(deployment.sessionId);
          this.activeSessions.delete(deployment.sessionId);
        } catch (error) {
          this.logger.warn(`Failed to stop session ${deployment.sessionId}:`, error.message);
        }
      }

      // Destroy WSL2 instance
      if (deployment.instanceId) {
        try {
          await this.wsl2Manager.destroyInstance(deployment.instanceId);
        } catch (error) {
          this.logger.warn(`Failed to destroy instance ${deployment.instanceId}:`, error.message);
        }
      }

      this.deployments.delete(deploymentId);
      this.emit('deploymentCleaned', { deploymentId });
    } catch (error) {
      this.logger.error(`Failed to cleanup deployment ${deploymentId}:`, error);
    }
  }

  /**
   * Generate deployment ID
   */
  generateDeploymentId() {
    return `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get integration statistics
   */
  getStatistics() {
    const deployments = Array.from(this.deployments.values());
    const completedDeployments = deployments.filter(d => d.status === 'completed');
    const failedDeployments = deployments.filter(d => d.status === 'failed');
    
    return {
      totalDeployments: deployments.length,
      completedDeployments: completedDeployments.length,
      failedDeployments: failedDeployments.length,
      activeSessions: this.activeSessions.size,
      averageDeploymentTime: completedDeployments.length > 0 
        ? completedDeployments.reduce((sum, d) => sum + (d.completedAt - d.createdAt), 0) / completedDeployments.length
        : 0,
      agentAPIMetrics: this.agentAPI.getMetrics(),
      wsl2Statistics: this.wsl2Manager.getStatistics()
    };
  }

  /**
   * Cleanup all resources
   */
  async cleanup() {
    this.logger.info('Cleaning up Claude Code Integration');

    // Cleanup all active deployments
    const deploymentIds = Array.from(this.deployments.keys());
    for (const deploymentId of deploymentIds) {
      try {
        await this.cleanupDeployment(deploymentId);
      } catch (error) {
        this.logger.error(`Failed to cleanup deployment ${deploymentId}:`, error);
      }
    }

    // Cleanup components
    await this.agentAPI.cleanup();
    await this.wsl2Manager.cleanup();

    this.removeAllListeners();
    this.emit('cleanup');
  }
}

export default ClaudeCodeIntegration;

