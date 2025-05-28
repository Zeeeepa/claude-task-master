/**
 * Claude Code Utilities
 * 
 * Utility functions for Claude Code integration, including command formatting,
 * response parsing, and validation helpers.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { execSync } from 'child_process';

export class ClaudeCodeUtils {
  /**
   * Format a natural language instruction for Claude Code
   * @param {string} instruction - Raw instruction
   * @param {Object} context - Additional context
   * @returns {string} Formatted instruction
   */
  static formatInstruction(instruction, context = {}) {
    const {
      repository = null,
      branch = 'main',
      files = [],
      requirements = [],
      constraints = [],
      outputFormat = 'detailed'
    } = context;

    let formattedInstruction = instruction;

    // Add repository context
    if (repository) {
      formattedInstruction += `\n\nRepository: ${repository}`;
      if (branch !== 'main') {
        formattedInstruction += ` (branch: ${branch})`;
      }
    }

    // Add file context
    if (files.length > 0) {
      formattedInstruction += `\n\nRelevant files:\n${files.map(f => `- ${f}`).join('\n')}`;
    }

    // Add requirements
    if (requirements.length > 0) {
      formattedInstruction += `\n\nRequirements:\n${requirements.map(r => `- ${r}`).join('\n')}`;
    }

    // Add constraints
    if (constraints.length > 0) {
      formattedInstruction += `\n\nConstraints:\n${constraints.map(c => `- ${c}`).join('\n')}`;
    }

    // Add output format specification
    if (outputFormat === 'json') {
      formattedInstruction += '\n\nPlease provide the response in JSON format.';
    } else if (outputFormat === 'structured') {
      formattedInstruction += '\n\nPlease provide a structured response with clear sections.';
    }

    return formattedInstruction;
  }

  /**
   * Parse Claude Code response
   * @param {Object} response - Raw response from Claude Code
   * @returns {Object} Parsed response
   */
  static parseResponse(response) {
    const parsed = {
      success: false,
      content: '',
      actions: [],
      files: [],
      errors: [],
      metadata: {}
    };

    try {
      if (typeof response === 'string') {
        parsed.content = response;
        parsed.success = true;
      } else if (response && typeof response === 'object') {
        parsed.content = response.content || response.message || '';
        parsed.success = !response.error;
        
        if (response.error) {
          parsed.errors.push(response.error);
        }

        // Extract actions from response
        parsed.actions = this._extractActions(parsed.content);
        
        // Extract file references
        parsed.files = this._extractFileReferences(parsed.content);
        
        // Extract metadata
        parsed.metadata = {
          timestamp: response.timestamp || Date.now(),
          duration: response.duration || 0,
          type: response.type || 'response'
        };
      }
    } catch (error) {
      parsed.errors.push(`Failed to parse response: ${error.message}`);
    }

    return parsed;
  }

  /**
   * Extract actions from Claude Code response
   * @param {string} content - Response content
   * @returns {Array} Array of actions
   */
  static _extractActions(content) {
    const actions = [];
    
    // Look for common action patterns
    const actionPatterns = [
      /(?:I will|I'll|Let me)\s+(.+?)(?:\.|$)/gi,
      /(?:Action|Step|Task):\s*(.+?)(?:\n|$)/gi,
      /(?:Creating|Modifying|Updating|Deleting)\s+(.+?)(?:\n|$)/gi
    ];

    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        actions.push({
          type: 'action',
          description: match[1].trim(),
          confidence: 0.8
        });
      }
    }

    return actions;
  }

  /**
   * Extract file references from response
   * @param {string} content - Response content
   * @returns {Array} Array of file references
   */
  static _extractFileReferences(content) {
    const files = [];
    
    // Look for file path patterns
    const filePatterns = [
      /(?:file|path):\s*([^\s\n]+)/gi,
      /`([^`]+\.[a-zA-Z0-9]+)`/g,
      /(?:src\/|\.\/|\/)[a-zA-Z0-9_\-\/\.]+\.[a-zA-Z0-9]+/g
    ];

    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const filePath = match[1] || match[0];
        if (this._isValidFilePath(filePath)) {
          files.push({
            path: filePath.trim(),
            type: this._getFileType(filePath),
            mentioned: true
          });
        }
      }
    }

    // Remove duplicates
    const uniqueFiles = files.filter((file, index, self) => 
      index === self.findIndex(f => f.path === file.path)
    );

    return uniqueFiles;
  }

  /**
   * Check if a string is a valid file path
   * @param {string} path - Path to validate
   * @returns {boolean} True if valid file path
   */
  static _isValidFilePath(path) {
    if (!path || typeof path !== 'string') return false;
    
    // Basic validation
    const validExtensions = [
      '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
      '.css', '.scss', '.html', '.xml', '.json', '.yaml', '.yml',
      '.md', '.txt', '.sql', '.sh', '.bat', '.ps1'
    ];
    
    const hasValidExtension = validExtensions.some(ext => path.endsWith(ext));
    const hasValidChars = /^[a-zA-Z0-9_\-\/\.\\]+$/.test(path);
    const notTooLong = path.length < 200;
    
    return hasValidExtension && hasValidChars && notTooLong;
  }

  /**
   * Get file type from path
   * @param {string} path - File path
   * @returns {string} File type
   */
  static _getFileType(path) {
    const ext = extname(path).toLowerCase();
    
    const typeMap = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'react',
      '.tsx': 'react-typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'header',
      '.css': 'css',
      '.scss': 'scss',
      '.html': 'html',
      '.xml': 'xml',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.txt': 'text',
      '.sql': 'sql',
      '.sh': 'shell',
      '.bat': 'batch',
      '.ps1': 'powershell'
    };
    
    return typeMap[ext] || 'unknown';
  }

  /**
   * Validate Claude Code command
   * @param {Object} command - Command to validate
   * @returns {Object} Validation result
   */
  static validateCommand(command) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check required fields
    if (!command.content) {
      result.valid = false;
      result.errors.push('Command content is required');
    }

    // Check content length
    if (command.content && command.content.length > 10000) {
      result.warnings.push('Command content is very long and may cause timeouts');
    }

    // Check for potentially dangerous commands
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /sudo\s+rm/,
      /format\s+c:/i,
      /del\s+\/s\s+\/q/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command.content)) {
        result.warnings.push('Command contains potentially dangerous operations');
        break;
      }
    }

    return result;
  }

  /**
   * Create a code analysis request
   * @param {Object} options - Analysis options
   * @returns {Object} Analysis request
   */
  static createAnalysisRequest(options = {}) {
    const {
      repository,
      branch = 'main',
      files = [],
      analysisType = 'general',
      depth = 'medium',
      includeTests = true,
      outputFormat = 'structured'
    } = options;

    let instruction = '';

    switch (analysisType) {
      case 'security':
        instruction = 'Please perform a comprehensive security analysis of this codebase. Look for potential vulnerabilities, security anti-patterns, and suggest improvements.';
        break;
      case 'performance':
        instruction = 'Please analyze this codebase for performance issues. Identify bottlenecks, inefficient algorithms, and suggest optimizations.';
        break;
      case 'quality':
        instruction = 'Please perform a code quality analysis. Check for code smells, maintainability issues, and adherence to best practices.';
        break;
      case 'architecture':
        instruction = 'Please analyze the architecture of this codebase. Evaluate the design patterns, structure, and suggest architectural improvements.';
        break;
      default:
        instruction = 'Please perform a general analysis of this codebase. Provide insights on code quality, structure, and potential improvements.';
    }

    return this.formatInstruction(instruction, {
      repository,
      branch,
      files,
      requirements: [
        `Analysis depth: ${depth}`,
        `Include tests: ${includeTests ? 'yes' : 'no'}`
      ],
      outputFormat
    });
  }

  /**
   * Create a code generation request
   * @param {Object} options - Generation options
   * @returns {Object} Generation request
   */
  static createGenerationRequest(options = {}) {
    const {
      description,
      language = 'javascript',
      framework = null,
      style = 'modern',
      includeTests = true,
      includeDocumentation = true
    } = options;

    let instruction = `Please generate ${language} code based on the following description:\n\n${description}`;

    const requirements = [
      `Programming language: ${language}`,
      `Code style: ${style}`,
      `Include tests: ${includeTests ? 'yes' : 'no'}`,
      `Include documentation: ${includeDocumentation ? 'yes' : 'no'}`
    ];

    if (framework) {
      requirements.push(`Framework: ${framework}`);
    }

    return this.formatInstruction(instruction, {
      requirements,
      constraints: [
        'Follow best practices and conventions',
        'Include proper error handling',
        'Add meaningful comments where necessary'
      ],
      outputFormat: 'structured'
    });
  }

  /**
   * Create a code review request
   * @param {Object} options - Review options
   * @returns {Object} Review request
   */
  static createReviewRequest(options = {}) {
    const {
      files,
      changes,
      focusAreas = ['functionality', 'security', 'performance'],
      severity = 'medium'
    } = options;

    let instruction = 'Please review the following code changes and provide feedback.';

    if (changes) {
      instruction += `\n\nChanges:\n${changes}`;
    }

    const requirements = [
      `Focus areas: ${focusAreas.join(', ')}`,
      `Review severity: ${severity}`,
      'Provide specific suggestions for improvement',
      'Highlight any potential issues or bugs'
    ];

    return this.formatInstruction(instruction, {
      files,
      requirements,
      outputFormat: 'structured'
    });
  }

  /**
   * Extract metrics from Claude Code response
   * @param {Object} response - Parsed response
   * @returns {Object} Extracted metrics
   */
  static extractMetrics(response) {
    const metrics = {
      linesOfCode: 0,
      filesAnalyzed: 0,
      issuesFound: 0,
      suggestions: 0,
      complexity: 'unknown',
      quality: 'unknown'
    };

    if (!response.content) return metrics;

    const content = response.content.toLowerCase();

    // Extract lines of code
    const locMatch = content.match(/(\d+)\s+lines?\s+of\s+code/);
    if (locMatch) {
      metrics.linesOfCode = parseInt(locMatch[1]);
    }

    // Extract files analyzed
    const filesMatch = content.match(/(\d+)\s+files?\s+analyzed/);
    if (filesMatch) {
      metrics.filesAnalyzed = parseInt(filesMatch[1]);
    }

    // Extract issues found
    const issuesMatch = content.match(/(\d+)\s+issues?\s+found/);
    if (issuesMatch) {
      metrics.issuesFound = parseInt(issuesMatch[1]);
    }

    // Extract complexity
    if (content.includes('high complexity')) {
      metrics.complexity = 'high';
    } else if (content.includes('medium complexity')) {
      metrics.complexity = 'medium';
    } else if (content.includes('low complexity')) {
      metrics.complexity = 'low';
    }

    // Extract quality
    if (content.includes('excellent quality') || content.includes('high quality')) {
      metrics.quality = 'high';
    } else if (content.includes('good quality') || content.includes('medium quality')) {
      metrics.quality = 'medium';
    } else if (content.includes('poor quality') || content.includes('low quality')) {
      metrics.quality = 'low';
    }

    return metrics;
  }

  /**
   * Generate a summary of Claude Code session
   * @param {Array} messages - Array of messages from the session
   * @returns {Object} Session summary
   */
  static generateSessionSummary(messages) {
    const summary = {
      totalMessages: messages.length,
      userMessages: 0,
      agentMessages: 0,
      duration: 0,
      topics: [],
      actions: [],
      files: [],
      errors: []
    };

    if (messages.length === 0) return summary;

    // Calculate duration
    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];
    summary.duration = (lastMessage.timestamp || Date.now()) - (firstMessage.timestamp || Date.now());

    // Analyze messages
    for (const message of messages) {
      if (message.type === 'user') {
        summary.userMessages++;
      } else if (message.type === 'agent') {
        summary.agentMessages++;
        
        // Extract actions and files from agent messages
        const parsed = this.parseResponse(message);
        summary.actions.push(...parsed.actions);
        summary.files.push(...parsed.files);
        summary.errors.push(...parsed.errors);
      }
    }

    // Remove duplicates
    summary.files = summary.files.filter((file, index, self) => 
      index === self.findIndex(f => f.path === file.path)
    );

    return summary;
  }

  /**
   * Check if Claude Code is available
   * @returns {Promise<boolean>} True if Claude Code is available
   */
  static async isClaudeCodeAvailable() {
    try {
      execSync('claude --version', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get Claude Code version
   * @returns {Promise<string>} Claude Code version
   */
  static async getClaudeCodeVersion() {
    try {
      const output = execSync('claude --version', { encoding: 'utf8' });
      return output.trim();
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Sanitize instruction for Claude Code
   * @param {string} instruction - Raw instruction
   * @returns {string} Sanitized instruction
   */
  static sanitizeInstruction(instruction) {
    if (!instruction || typeof instruction !== 'string') {
      return '';
    }

    // Remove potentially harmful characters
    let sanitized = instruction
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .replace(/\r\n/g, '\n') // Normalize line endings
      .trim();

    // Limit length
    if (sanitized.length > 10000) {
      sanitized = sanitized.substring(0, 10000) + '... [truncated]';
    }

    return sanitized;
  }
}

export default ClaudeCodeUtils;

