/**
 * @fileoverview Result Parser
 * @description Parse and extract results from agent output
 */

/**
 * Result parser for Claude Code agent outputs
 */
export class ResultParser {
  constructor(config = {}) {
    this.config = {
      extractCodeBlocks: config.extractCodeBlocks !== false,
      extractFileOperations: config.extractFileOperations !== false,
      extractCommands: config.extractCommands !== false,
      extractErrors: config.extractErrors !== false,
      extractSummary: config.extractSummary !== false,
      ...config
    };
  }

  /**
   * Parse agent messages and extract structured results
   * @param {Array} messages - Array of messages from the agent
   * @returns {Object} Parsed results
   */
  parse(messages) {
    const result = {
      summary: '',
      filesModified: [],
      filesCreated: [],
      filesDeleted: [],
      codeBlocks: [],
      commands: [],
      errors: [],
      warnings: [],
      metadata: {
        totalMessages: messages.length,
        agentMessages: 0,
        userMessages: 0,
        processingTime: null
      }
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return result;
    }

    // Process each message
    for (const message of messages) {
      this.processMessage(message, result);
    }

    // Extract summary from the last agent message
    if (this.config.extractSummary) {
      result.summary = this.extractSummary(messages);
    }

    // Calculate metadata
    result.metadata.agentMessages = messages.filter(m => 
      m.type === 'agent' || m.type === 'assistant'
    ).length;
    result.metadata.userMessages = messages.filter(m => 
      m.type === 'user' || m.type === 'human'
    ).length;

    return result;
  }

  /**
   * Process a single message
   * @param {Object} message - Message object
   * @param {Object} result - Result object to update
   */
  processMessage(message, result) {
    if (!message.content) {
      return;
    }

    const content = message.content;

    // Extract file operations
    if (this.config.extractFileOperations) {
      this.extractFileOperations(content, result);
    }

    // Extract code blocks
    if (this.config.extractCodeBlocks) {
      this.extractCodeBlocks(content, result);
    }

    // Extract commands
    if (this.config.extractCommands) {
      this.extractCommands(content, result);
    }

    // Extract errors and warnings
    if (this.config.extractErrors) {
      this.extractErrors(content, result);
      this.extractWarnings(content, result);
    }
  }

  /**
   * Extract file operations from message content
   * @param {string} content - Message content
   * @param {Object} result - Result object to update
   */
  extractFileOperations(content, result) {
    // Patterns for file modifications
    const modifiedPatterns = [
      /(?:modified|updated|edited|changed)\s+(?:file\s+)?[`'""]?([^\s`'""\n]+\.[a-zA-Z0-9]+)[`'""]?/gi,
      /[`'""]([^\s`'""\n]*\.[a-zA-Z0-9]+)[`'""]?\s+(?:has been|was)\s+(?:modified|updated|edited|changed)/gi,
      /(?:writing|saving)\s+(?:changes\s+)?(?:to\s+)?[`'""]?([^\s`'""\n]+\.[a-zA-Z0-9]+)[`'""]?/gi
    ];

    // Patterns for file creation
    const createdPatterns = [
      /(?:created|creating|added)\s+(?:new\s+)?(?:file\s+)?[`'""]?([^\s`'""\n]+\.[a-zA-Z0-9]+)[`'""]?/gi,
      /[`'""]([^\s`'""\n]*\.[a-zA-Z0-9]+)[`'""]?\s+(?:has been|was)\s+(?:created|added)/gi,
      /(?:writing|saving)\s+(?:new\s+)?(?:file\s+)?[`'""]?([^\s`'""\n]+\.[a-zA-Z0-9]+)[`'""]?/gi
    ];

    // Patterns for file deletion
    const deletedPatterns = [
      /(?:deleted|removed|deleting|removing)\s+(?:file\s+)?[`'""]?([^\s`'""\n]+\.[a-zA-Z0-9]+)[`'""]?/gi,
      /[`'""]([^\s`'""\n]*\.[a-zA-Z0-9]+)[`'""]?\s+(?:has been|was)\s+(?:deleted|removed)/gi
    ];

    // Extract modified files
    this.extractMatches(content, modifiedPatterns, result.filesModified);

    // Extract created files
    this.extractMatches(content, createdPatterns, result.filesCreated);

    // Extract deleted files
    this.extractMatches(content, deletedPatterns, result.filesDeleted);
  }

  /**
   * Extract code blocks from message content
   * @param {string} content - Message content
   * @param {Object} result - Result object to update
   */
  extractCodeBlocks(content, result) {
    // Pattern for fenced code blocks
    const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockPattern.exec(content)) !== null) {
      const language = match[1] || 'text';
      const code = match[2].trim();
      
      if (code) {
        result.codeBlocks.push({
          language,
          code,
          lineCount: code.split('\n').length
        });
      }
    }

    // Pattern for inline code
    const inlineCodePattern = /`([^`\n]+)`/g;
    while ((match = inlineCodePattern.exec(content)) !== null) {
      const code = match[1].trim();
      if (code && code.length > 10) { // Only capture longer inline code
        result.codeBlocks.push({
          language: 'inline',
          code,
          lineCount: 1
        });
      }
    }
  }

  /**
   * Extract commands from message content
   * @param {string} content - Message content
   * @param {Object} result - Result object to update
   */
  extractCommands(content, result) {
    const commandPatterns = [
      /(?:executing|running|ran|execute|run)\s+[`'""]?([^`'""\n]+)[`'""]?/gi,
      /\$\s+([^\n]+)/gi,
      />\s+([^\n]+)/gi,
      /(?:command|cmd):\s*[`'""]?([^`'""\n]+)[`'""]?/gi
    ];

    this.extractMatches(content, commandPatterns, result.commands);
  }

  /**
   * Extract errors from message content
   * @param {string} content - Message content
   * @param {Object} result - Result object to update
   */
  extractErrors(content, result) {
    const errorPatterns = [
      /error[:\s]+(.+)/gi,
      /failed[:\s]+(.+)/gi,
      /exception[:\s]+(.+)/gi,
      /(?:fatal|critical)[:\s]+(.+)/gi,
      /❌\s*(.+)/gi
    ];

    this.extractMatches(content, errorPatterns, result.errors);
  }

  /**
   * Extract warnings from message content
   * @param {string} content - Message content
   * @param {Object} result - Result object to update
   */
  extractWarnings(content, result) {
    const warningPatterns = [
      /warning[:\s]+(.+)/gi,
      /warn[:\s]+(.+)/gi,
      /caution[:\s]+(.+)/gi,
      /⚠️\s*(.+)/gi
    ];

    this.extractMatches(content, warningPatterns, result.warnings);
  }

  /**
   * Extract matches using multiple patterns
   * @param {string} content - Content to search
   * @param {Array} patterns - Array of regex patterns
   * @param {Array} targetArray - Array to add matches to
   */
  extractMatches(content, patterns, targetArray) {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const extracted = match[1]?.trim();
        if (extracted && !targetArray.includes(extracted)) {
          targetArray.push(extracted);
        }
      }
    }
  }

  /**
   * Extract summary from messages
   * @param {Array} messages - Array of messages
   * @returns {string} Extracted summary
   */
  extractSummary(messages) {
    // Get the last agent message
    const agentMessages = messages.filter(m => 
      m.type === 'agent' || m.type === 'assistant'
    );

    if (agentMessages.length === 0) {
      return 'No agent response available';
    }

    const lastMessage = agentMessages[agentMessages.length - 1];
    const content = lastMessage.content || '';

    // Look for summary sections
    const summaryPatterns = [
      /(?:summary|conclusion)[:\s]+([\s\S]*?)(?:\n\n|\n#|$)/gi,
      /(?:in summary|to summarize)[:\s]+([\s\S]*?)(?:\n\n|\n#|$)/gi,
      /(?:completed|finished)[:\s]+([\s\S]*?)(?:\n\n|\n#|$)/gi
    ];

    for (const pattern of summaryPatterns) {
      const match = pattern.exec(content);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // If no explicit summary found, use the first paragraph of the last message
    const paragraphs = content.split('\n\n');
    if (paragraphs.length > 0) {
      return paragraphs[0].trim();
    }

    return content.substring(0, 200) + (content.length > 200 ? '...' : '');
  }

  /**
   * Parse task completion status from messages
   * @param {Array} messages - Array of messages
   * @returns {Object} Completion status
   */
  parseCompletionStatus(messages) {
    const status = {
      completed: false,
      success: false,
      progress: 0,
      nextSteps: [],
      blockers: []
    };

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content) {
      return status;
    }

    const content = lastMessage.content.toLowerCase();

    // Check for completion indicators
    const completionIndicators = [
      'completed', 'finished', 'done', 'success', 'implemented',
      'task complete', 'implementation complete'
    ];

    const failureIndicators = [
      'failed', 'error', 'unable to', 'cannot', 'impossible',
      'blocked', 'stuck'
    ];

    status.completed = completionIndicators.some(indicator => 
      content.includes(indicator)
    );

    status.success = status.completed && !failureIndicators.some(indicator => 
      content.includes(indicator)
    );

    // Extract progress percentage
    const progressMatch = content.match(/(\d+)%\s*(?:complete|done|progress)/);
    if (progressMatch) {
      status.progress = parseInt(progressMatch[1]);
    } else if (status.completed) {
      status.progress = 100;
    }

    // Extract next steps
    const nextStepsPattern = /(?:next steps?|todo|remaining)[:\s]+([\s\S]*?)(?:\n\n|\n#|$)/gi;
    const nextStepsMatch = nextStepsPattern.exec(lastMessage.content);
    if (nextStepsMatch && nextStepsMatch[1]) {
      status.nextSteps = nextStepsMatch[1]
        .split('\n')
        .map(step => step.trim())
        .filter(step => step.length > 0);
    }

    // Extract blockers
    const blockersPattern = /(?:blocked?|issue|problem)[:\s]+([\s\S]*?)(?:\n\n|\n#|$)/gi;
    const blockersMatch = blockersPattern.exec(lastMessage.content);
    if (blockersMatch && blockersMatch[1]) {
      status.blockers = blockersMatch[1]
        .split('\n')
        .map(blocker => blocker.trim())
        .filter(blocker => blocker.length > 0);
    }

    return status;
  }

  /**
   * Extract performance metrics from messages
   * @param {Array} messages - Array of messages
   * @returns {Object} Performance metrics
   */
  extractPerformanceMetrics(messages) {
    const metrics = {
      executionTime: null,
      linesOfCode: 0,
      filesProcessed: 0,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0
    };

    for (const message of messages) {
      if (!message.content) continue;

      const content = message.content;

      // Extract execution time
      const timeMatch = content.match(/(?:took|completed in|execution time)[:\s]+(\d+(?:\.\d+)?)\s*(ms|seconds?|minutes?)/i);
      if (timeMatch) {
        let time = parseFloat(timeMatch[1]);
        const unit = timeMatch[2].toLowerCase();
        
        if (unit.startsWith('minute')) {
          time *= 60000;
        } else if (unit.startsWith('second')) {
          time *= 1000;
        }
        
        metrics.executionTime = time;
      }

      // Extract lines of code
      const locMatch = content.match(/(\d+)\s*lines?\s*(?:of\s*code|added|modified)/i);
      if (locMatch) {
        metrics.linesOfCode += parseInt(locMatch[1]);
      }

      // Extract test results
      const testMatch = content.match(/(\d+)\s*tests?\s*(?:passed|successful)/i);
      if (testMatch) {
        metrics.testsPassed += parseInt(testMatch[1]);
      }

      const failedTestMatch = content.match(/(\d+)\s*tests?\s*failed/i);
      if (failedTestMatch) {
        metrics.testsFailed += parseInt(failedTestMatch[1]);
      }
    }

    metrics.testsRun = metrics.testsPassed + metrics.testsFailed;
    metrics.filesProcessed = new Set([
      ...this.parse(messages).filesModified,
      ...this.parse(messages).filesCreated
    ]).size;

    return metrics;
  }
}

/**
 * Utility functions for result parsing
 */
export const parseUtils = {
  /**
   * Clean and normalize file paths
   * @param {string} filePath - File path to clean
   * @returns {string} Cleaned file path
   */
  cleanFilePath(filePath) {
    return filePath
      .replace(/^[`'""]|[`'""]$/g, '') // Remove quotes
      .replace(/\\/g, '/') // Normalize path separators
      .trim();
  },

  /**
   * Extract file extension
   * @param {string} filePath - File path
   * @returns {string} File extension
   */
  getFileExtension(filePath) {
    const match = filePath.match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : '';
  },

  /**
   * Categorize files by type
   * @param {Array} files - Array of file paths
   * @returns {Object} Categorized files
   */
  categorizeFiles(files) {
    const categories = {
      source: [],
      test: [],
      config: [],
      documentation: [],
      other: []
    };

    const sourceExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs'];
    const testExtensions = ['test.js', 'spec.js', 'test.ts', 'spec.ts'];
    const configExtensions = ['json', 'yaml', 'yml', 'toml', 'ini', 'env'];
    const docExtensions = ['md', 'txt', 'rst', 'adoc'];

    for (const file of files) {
      const cleanPath = this.cleanFilePath(file);
      const extension = this.getFileExtension(cleanPath);
      
      if (testExtensions.some(ext => cleanPath.endsWith(ext))) {
        categories.test.push(cleanPath);
      } else if (sourceExtensions.includes(extension)) {
        categories.source.push(cleanPath);
      } else if (configExtensions.includes(extension)) {
        categories.config.push(cleanPath);
      } else if (docExtensions.includes(extension)) {
        categories.documentation.push(cleanPath);
      } else {
        categories.other.push(cleanPath);
      }
    }

    return categories;
  }
};

export default ResultParser;

