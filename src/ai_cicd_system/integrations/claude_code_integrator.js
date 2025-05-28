/**
 * Claude Code Integrator - Main interface for Claude Code integration
 * Provides comprehensive PR validation, debugging, and code quality assessment
 */

import { log } from '../utils/simple_logger.js';
import { ClaudeCodeClient } from '../utils/claude_code_client.js';
import { WSL2Manager } from './wsl2_manager.js';
import { PRValidator } from './pr_validator.js';
import { CodeAnalyzer } from './code_analyzer.js';
import { ValidationReporter } from './validation_reporter.js';

export class ClaudeCodeIntegrator {
  constructor(config = {}) {
    this.config = {
      claudeCodePath: config.claudeCodePath || 'claude-code',
      wsl2Enabled: config.wsl2Enabled !== false,
      validationTimeout: config.validationTimeout || 300000, // 5 minutes
      maxConcurrentValidations: config.maxConcurrentValidations || 3,
      enableDebugging: config.enableDebugging !== false,
      enableCodeAnalysis: config.enableCodeAnalysis !== false,
      ...config
    };
    
    this.claudeCodeClient = new ClaudeCodeClient(this.config);
    this.wsl2Manager = new WSL2Manager(this.config);
    this.prValidator = new PRValidator(this.config);
    this.codeAnalyzer = new CodeAnalyzer(this.config);
    this.validationReporter = new ValidationReporter(this.config);
    
    this.activeValidations = new Map();
    this.validationHistory = [];
    this.isInitialized = false;
  }

  async initialize() {
    log('info', '🔧 Initializing Claude Code integrator...');
    
    try {
      // Check Claude Code CLI availability
      await this.claudeCodeClient.checkAvailability();
      
      // Initialize WSL2 environment if enabled
      if (this.config.wsl2Enabled) {
        await this.wsl2Manager.initialize();
      }
      
      // Initialize validation components
      await this.prValidator.initialize();
      await this.codeAnalyzer.initialize();
      
      this.isInitialized = true;
      log('info', '✅ Claude Code integrator initialized');
    } catch (error) {
      log('error', `❌ Failed to initialize Claude Code integrator: ${error.message}`);
      throw error;
    }
  }

  async validatePR(prDetails, context = {}) {
    if (!this.isInitialized) {
      throw new Error('Claude Code integrator not initialized. Call initialize() first.');
    }

    const validationId = `validation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    log('info', `🔍 Starting PR validation: ${prDetails.prNumber} (${validationId})`);
    
    try {
      // Check concurrent validation limit
      if (this.activeValidations.size >= this.config.maxConcurrentValidations) {
        throw new Error('Maximum concurrent validations reached');
      }
      
      // Track active validation
      this.activeValidations.set(validationId, {
        prNumber: prDetails.prNumber,
        startTime: Date.now(),
        status: 'initializing'
      });
      
      // Step 1: Create isolated environment
      const environment = await this.createValidationEnvironment(prDetails);
      this.activeValidations.get(validationId).status = 'environment_created';
      
      // Step 2: Clone and setup PR branch
      await this.setupPRBranch(environment, prDetails);
      this.activeValidations.get(validationId).status = 'branch_setup';
      
      // Step 3: Run Claude Code validation
      const validationResult = await this.runClaudeCodeValidation(environment, prDetails);
      this.activeValidations.get(validationId).status = 'validation_complete';
      
      // Step 4: Perform code analysis
      const analysisResult = await this.performCodeAnalysis(environment, prDetails);
      this.activeValidations.get(validationId).status = 'analysis_complete';
      
      // Step 5: Generate comprehensive report
      const report = await this.generateValidationReport({
        validationId,
        prDetails,
        validationResult,
        analysisResult,
        environment
      });
      
      // Step 6: Cleanup environment
      await this.cleanupEnvironment(environment);
      
      // Update validation tracking
      this.activeValidations.get(validationId).status = 'completed';
      this.activeValidations.get(validationId).result = report;
      this.activeValidations.get(validationId).duration = Date.now() - this.activeValidations.get(validationId).startTime;
      
      // Move to history
      this.validationHistory.push(this.activeValidations.get(validationId));
      this.activeValidations.delete(validationId);
      
      log('info', `✅ PR validation completed: ${prDetails.prNumber} in ${this.activeValidations.get(validationId)?.duration || 'unknown'}ms`);
      return report;
      
    } catch (error) {
      // Update validation tracking
      if (this.activeValidations.has(validationId)) {
        this.activeValidations.get(validationId).status = 'failed';
        this.activeValidations.get(validationId).error = error.message;
        this.activeValidations.get(validationId).duration = Date.now() - this.activeValidations.get(validationId).startTime;
        
        // Move to history
        this.validationHistory.push(this.activeValidations.get(validationId));
        this.activeValidations.delete(validationId);
      }
      
      log('error', `❌ PR validation failed: ${prDetails.prNumber} - ${error.message}`);
      throw error;
    }
  }

  async createValidationEnvironment(prDetails) {
    if (this.config.wsl2Enabled) {
      return await this.wsl2Manager.createEnvironment({
        name: `pr-validation-${prDetails.prNumber}`,
        repository: prDetails.repository,
        branch: prDetails.headBranch
      });
    } else {
      // Use local environment
      return await this.createLocalEnvironment(prDetails);
    }
  }

  async createLocalEnvironment(prDetails) {
    const { mkdtemp } = await import('fs/promises');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    
    const tempDir = await mkdtemp(join(tmpdir(), `pr-validation-${prDetails.prNumber}-`));
    
    return {
      id: `local_${Date.now()}`,
      name: `pr-validation-${prDetails.prNumber}`,
      type: 'local',
      workingDirectory: tempDir,
      repository: prDetails.repository,
      branch: prDetails.headBranch,
      createdAt: new Date()
    };
  }

  async setupPRBranch(environment, prDetails) {
    log('info', `📥 Setting up PR branch in environment: ${environment.name}`);
    
    if (environment.type === 'wsl2') {
      // WSL2 manager handles this
      return;
    }
    
    // For local environment, clone the repository
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
      const cloneCommand = spawn('git', [
        'clone',
        '--branch', prDetails.headBranch,
        '--single-branch',
        prDetails.repository,
        '.'
      ], {
        cwd: environment.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stderr = '';
      
      cloneCommand.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      cloneCommand.on('close', (code) => {
        if (code === 0) {
          log('info', `✅ PR branch setup completed: ${prDetails.headBranch}`);
          resolve();
        } else {
          reject(new Error(`Git clone failed: ${stderr}`));
        }
      });
      
      cloneCommand.on('error', (error) => {
        reject(error);
      });
    });
  }

  async runClaudeCodeValidation(environment, prDetails) {
    log('info', `🤖 Running Claude Code validation for PR ${prDetails.prNumber}`);
    
    const validationConfig = {
      environment,
      files: prDetails.modifiedFiles || [],
      context: {
        prTitle: prDetails.title,
        prDescription: prDetails.description,
        author: prDetails.author
      }
    };
    
    return await this.claudeCodeClient.validateCode(validationConfig);
  }

  async performCodeAnalysis(environment, prDetails) {
    if (!this.config.enableCodeAnalysis) {
      return { skipped: true, reason: 'Code analysis disabled' };
    }
    
    log('info', `📊 Performing code analysis for PR ${prDetails.prNumber}`);
    
    return await this.codeAnalyzer.analyzeCode({
      environment,
      files: prDetails.modifiedFiles || [],
      metrics: ['complexity', 'coverage', 'security', 'performance']
    });
  }

  async generateValidationReport(data) {
    return await this.validationReporter.generateReport({
      validationId: data.validationId,
      prDetails: data.prDetails,
      validation: data.validationResult,
      analysis: data.analysisResult,
      timestamp: new Date(),
      environment: data.environment.type
    });
  }

  async cleanupEnvironment(environment) {
    log('info', `🧹 Cleaning up environment: ${environment.name}`);
    
    try {
      if (environment.type === 'wsl2') {
        await this.wsl2Manager.cleanupEnvironment(environment);
      } else {
        // Clean up local environment
        const { rm } = await import('fs/promises');
        await rm(environment.workingDirectory, { recursive: true, force: true });
      }
      
      log('info', `✅ Environment cleaned up: ${environment.name}`);
    } catch (error) {
      log('error', `❌ Failed to cleanup environment: ${environment.name} - ${error.message}`);
    }
  }

  // Debugging capabilities
  async debugCode(environment, issue, context = {}) {
    if (!this.config.enableDebugging) {
      throw new Error('Debugging is disabled in configuration');
    }
    
    log('info', `🐛 Starting code debugging for issue: ${issue}`);
    
    return await this.claudeCodeClient.debugCode({
      environment,
      issue,
      context
    });
  }

  // Status and monitoring methods
  getActiveValidations() {
    return Array.from(this.activeValidations.values());
  }

  getValidationHistory(limit = 10) {
    return this.validationHistory.slice(-limit);
  }

  getValidationStats() {
    const total = this.validationHistory.length;
    const successful = this.validationHistory.filter(v => v.status === 'completed').length;
    const failed = this.validationHistory.filter(v => v.status === 'failed').length;
    const avgDuration = this.validationHistory
      .filter(v => v.duration)
      .reduce((sum, v) => sum + v.duration, 0) / Math.max(1, this.validationHistory.filter(v => v.duration).length);

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      averageDuration: Math.round(avgDuration),
      activeValidations: this.activeValidations.size
    };
  }

  async shutdown() {
    log('info', '🛑 Shutting down Claude Code integrator...');
    
    // Cancel active validations
    for (const [validationId, validation] of this.activeValidations) {
      log('warn', `Cancelling active validation: ${validationId}`);
      validation.status = 'cancelled';
      this.validationHistory.push(validation);
    }
    this.activeValidations.clear();
    
    // Cleanup WSL2 manager if enabled
    if (this.config.wsl2Enabled && this.wsl2Manager) {
      await this.wsl2Manager.shutdown();
    }
    
    this.isInitialized = false;
    log('info', '✅ Claude Code integrator shutdown complete');
  }
}

