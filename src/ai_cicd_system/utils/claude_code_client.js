/**
 * Claude Code Client - CLI wrapper for @anthropic-ai/claude-code
 * Handles command execution, validation, and debugging operations
 */

import { log } from './simple_logger.js';

export class ClaudeCodeClient {
  constructor(config) {
    this.config = config;
    this.claudeCodePath = config.claudeCodePath || 'claude-code';
    this.timeout = config.validationTimeout || 300000; // 5 minutes
  }

  async checkAvailability() {
    try {
      const result = await this.executeCommand(['--version']);
      log('info', `Claude Code CLI available: ${result.stdout.trim()}`);
      return true;
    } catch (error) {
      throw new Error(`Claude Code CLI not available: ${error.message}`);
    }
  }

  async validateCode(config) {
    const { environment, files, context } = config;
    
    log('info', `🔍 Validating code in environment: ${environment.name}`);
    
    // Prepare validation command
    const command = [
      'validate',
      '--path', environment.workingDirectory,
      '--format', 'json'
    ];
    
    // Add specific files if provided
    if (files && files.length > 0) {
      command.push('--files', files.join(','));
    }
    
    // Add context information
    if (context) {
      command.push('--context', JSON.stringify(context));
    }
    
    // Execute validation
    const result = await this.executeCommand(command, {
      cwd: environment.workingDirectory,
      timeout: this.timeout
    });
    
    return this.parseValidationResult(result);
  }

  async debugCode(config) {
    const { environment, issue, context } = config;
    
    log('info', `🐛 Debugging code issue: ${issue}`);
    
    const command = [
      'debug',
      '--path', environment.workingDirectory,
      '--issue', issue,
      '--format', 'json'
    ];
    
    if (context) {
      command.push('--context', JSON.stringify(context));
    }
    
    const result = await this.executeCommand(command, {
      cwd: environment.workingDirectory,
      timeout: this.timeout
    });
    
    return this.parseDebugResult(result);
  }

  async analyzeComplexity(config) {
    const { environment, files } = config;
    
    log('info', '📊 Analyzing code complexity');
    
    const command = [
      'analyze',
      '--path', environment.workingDirectory,
      '--type', 'complexity',
      '--format', 'json'
    ];
    
    if (files && files.length > 0) {
      command.push('--files', files.join(','));
    }
    
    const result = await this.executeCommand(command, {
      cwd: environment.workingDirectory,
      timeout: this.timeout
    });
    
    return this.parseAnalysisResult(result);
  }

  async checkSecurity(config) {
    const { environment, files } = config;
    
    log('info', '🔒 Performing security analysis');
    
    const command = [
      'security',
      '--path', environment.workingDirectory,
      '--format', 'json'
    ];
    
    if (files && files.length > 0) {
      command.push('--files', files.join(','));
    }
    
    const result = await this.executeCommand(command, {
      cwd: environment.workingDirectory,
      timeout: this.timeout
    });
    
    return this.parseSecurityResult(result);
  }

  async executeCommand(args, options = {}) {
    const { spawn } = await import('child_process');
    
    log('debug', `Executing Claude Code command: ${this.claudeCodePath} ${args.join(' ')}`);
    
    return new Promise((resolve, reject) => {
      const child = spawn(this.claudeCodePath, args, {
        cwd: options.cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...options.env }
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Claude Code command failed (exit code ${code}): ${stderr || stdout}`));
        }
      });
      
      child.on('error', (error) => {
        reject(new Error(`Failed to execute Claude Code command: ${error.message}`));
      });
      
      // Handle timeout
      if (options.timeout) {
        const timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error('Claude Code command timed out'));
        }, options.timeout);
        
        child.on('close', () => {
          clearTimeout(timeoutId);
        });
      }
    });
  }

  parseValidationResult(result) {
    try {
      const data = JSON.parse(result.stdout);
      return {
        success: true,
        issues: data.issues || [],
        suggestions: data.suggestions || [],
        metrics: data.metrics || {},
        summary: data.summary || {},
        rawOutput: result.stdout
      };
    } catch (error) {
      log('warn', `Failed to parse validation result as JSON: ${error.message}`);
      return {
        success: false,
        error: 'Failed to parse validation result',
        rawOutput: result.stdout,
        stderr: result.stderr
      };
    }
  }

  parseDebugResult(result) {
    try {
      const data = JSON.parse(result.stdout);
      return {
        success: true,
        diagnosis: data.diagnosis || {},
        fixes: data.fixes || [],
        explanation: data.explanation || '',
        confidence: data.confidence || 0,
        rawOutput: result.stdout
      };
    } catch (error) {
      log('warn', `Failed to parse debug result as JSON: ${error.message}`);
      return {
        success: false,
        error: 'Failed to parse debug result',
        rawOutput: result.stdout,
        stderr: result.stderr
      };
    }
  }

  parseAnalysisResult(result) {
    try {
      const data = JSON.parse(result.stdout);
      return {
        success: true,
        complexity: data.complexity || {},
        metrics: data.metrics || {},
        files: data.files || [],
        summary: data.summary || {},
        rawOutput: result.stdout
      };
    } catch (error) {
      log('warn', `Failed to parse analysis result as JSON: ${error.message}`);
      return {
        success: false,
        error: 'Failed to parse analysis result',
        rawOutput: result.stdout,
        stderr: result.stderr
      };
    }
  }

  parseSecurityResult(result) {
    try {
      const data = JSON.parse(result.stdout);
      return {
        success: true,
        vulnerabilities: data.vulnerabilities || [],
        warnings: data.warnings || [],
        severity: data.severity || 'unknown',
        summary: data.summary || {},
        rawOutput: result.stdout
      };
    } catch (error) {
      log('warn', `Failed to parse security result as JSON: ${error.message}`);
      return {
        success: false,
        error: 'Failed to parse security result',
        rawOutput: result.stdout,
        stderr: result.stderr
      };
    }
  }

  // Utility methods for command building
  buildValidationCommand(options) {
    const command = ['validate'];
    
    if (options.path) command.push('--path', options.path);
    if (options.files) command.push('--files', options.files.join(','));
    if (options.format) command.push('--format', options.format);
    if (options.context) command.push('--context', JSON.stringify(options.context));
    if (options.strict) command.push('--strict');
    if (options.verbose) command.push('--verbose');
    
    return command;
  }

  buildDebugCommand(options) {
    const command = ['debug'];
    
    if (options.path) command.push('--path', options.path);
    if (options.issue) command.push('--issue', options.issue);
    if (options.format) command.push('--format', options.format);
    if (options.context) command.push('--context', JSON.stringify(options.context));
    if (options.interactive) command.push('--interactive');
    
    return command;
  }

  // Health check method
  async healthCheck() {
    try {
      await this.checkAvailability();
      return {
        status: 'healthy',
        claudeCodePath: this.claudeCodePath,
        timeout: this.timeout,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        claudeCodePath: this.claudeCodePath,
        timestamp: new Date()
      };
    }
  }
}

