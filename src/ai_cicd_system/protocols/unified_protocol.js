/**
 * @fileoverview Unified Protocol
 * @description Unified communication protocol that bridges different systems
 */

import { log } from '../utils/simple_logger.js';
import { AgentProtocol } from './agent_protocol.js';
import { ClaudeCodeProtocol } from './claude_code_protocol.js';

/**
 * Unified Protocol - Bridges different protocol systems
 */
export class UnifiedProtocol {
  constructor(config = {}) {
    this.config = config;
    this.version = '1.0.0';
    
    // Initialize protocol handlers
    this.agentProtocol = new AgentProtocol(config);
    this.claudeCodeProtocol = new ClaudeCodeProtocol(config);
    
    // Protocol mapping
    this.protocolMap = new Map([
      ['agentapi', this.agentProtocol],
      ['claude_code', this.claudeCodeProtocol],
      ['agent', this.agentProtocol],
      ['claude', this.claudeCodeProtocol]
    ]);
    
    // Message type routing
    this.messageRouting = new Map([
      // AgentAPI message types
      ['code_generation_request', 'agentapi'],
      ['validation_update', 'agentapi'],
      ['session_create', 'agentapi'],
      ['session_update', 'agentapi'],
      ['health_check', 'agentapi'],
      ['error_report', 'agentapi'],
      
      // Claude Code message types
      ['validation_request', 'claude_code'],
      ['validation_response', 'claude_code'],
      ['code_review_request', 'claude_code'],
      ['code_review_response', 'claude_code'],
      ['debug_request', 'claude_code'],
      ['debug_response', 'claude_code'],
      ['optimization_request', 'claude_code'],
      ['optimization_response', 'claude_code']
    ]);
    
    this.transformationHistory = [];
  }

  /**
   * Transform message between protocols
   * @param {Object} message - Message to transform
   * @param {string} fromProtocol - Source protocol
   * @param {string} toProtocol - Target protocol
   * @param {Object} context - Transformation context
   * @returns {Promise<Object>} Transformed message
   */
  async transformMessage(message, fromProtocol, toProtocol, context = {}) {
    const transformationId = `transform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    log('debug', `🔄 Transforming message ${transformationId}: ${fromProtocol} → ${toProtocol}`);
    
    try {
      // Validate input
      this.validateTransformationInput(message, fromProtocol, toProtocol);
      
      // Get protocol handlers
      const sourceProtocol = this.protocolMap.get(fromProtocol);
      const targetProtocol = this.protocolMap.get(toProtocol);
      
      if (!sourceProtocol) {
        throw new Error(`Unknown source protocol: ${fromProtocol}`);
      }
      
      if (!targetProtocol) {
        throw new Error(`Unknown target protocol: ${toProtocol}`);
      }
      
      // Parse source message
      const parsedMessage = this.parseMessage(message, fromProtocol);
      
      // Apply transformation rules
      const transformedMessage = await this.applyTransformationRules(
        parsedMessage,
        fromProtocol,
        toProtocol,
        context
      );
      
      // Validate transformed message
      this.validateTransformedMessage(transformedMessage, toProtocol);
      
      // Record transformation
      this.recordTransformation(transformationId, {
        fromProtocol,
        toProtocol,
        sourceMessage: message,
        transformedMessage,
        context,
        timestamp: new Date()
      });
      
      log('debug', `✅ Message transformation completed: ${transformationId}`);
      return transformedMessage;
      
    } catch (error) {
      log('error', `❌ Message transformation failed: ${transformationId} - ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse message using appropriate protocol
   * @param {Object} message - Message to parse
   * @param {string} protocol - Protocol to use for parsing
   * @returns {Object} Parsed message
   */
  parseMessage(message, protocol) {
    const protocolHandler = this.protocolMap.get(protocol);
    
    if (!protocolHandler) {
      throw new Error(`Unknown protocol: ${protocol}`);
    }
    
    // Use protocol-specific parsing if available
    if (protocolHandler.parseResponse) {
      return protocolHandler.parseResponse(message);
    }
    
    // Default parsing
    return message;
  }

  /**
   * Apply transformation rules between protocols
   * @param {Object} message - Parsed message
   * @param {string} fromProtocol - Source protocol
   * @param {string} toProtocol - Target protocol
   * @param {Object} context - Transformation context
   * @returns {Promise<Object>} Transformed message
   */
  async applyTransformationRules(message, fromProtocol, toProtocol, context) {
    // AgentAPI to Claude Code transformations
    if (fromProtocol === 'agentapi' && toProtocol === 'claude_code') {
      return this.transformAgentApiToClaudeCode(message, context);
    }
    
    // Claude Code to AgentAPI transformations
    if (fromProtocol === 'claude_code' && toProtocol === 'agentapi') {
      return this.transformClaudeCodeToAgentApi(message, context);
    }
    
    // Same protocol - pass through with normalization
    if (fromProtocol === toProtocol) {
      return this.normalizeMessage(message, fromProtocol);
    }
    
    // Generic transformation
    return this.genericTransformation(message, fromProtocol, toProtocol, context);
  }

  /**
   * Transform AgentAPI message to Claude Code format
   * @param {Object} message - AgentAPI message
   * @param {Object} context - Transformation context
   * @returns {Object} Claude Code formatted message
   */
  transformAgentApiToClaudeCode(message, context) {
    switch (message.type) {
      case 'code_generation_request':
        return this.claudeCodeProtocol.createValidationRequest({
          codeChanges: message.payload?.code_changes || [],
          filesCreated: message.payload?.files_created || [],
          filesModified: message.payload?.files_modified || [],
          testFiles: message.payload?.test_files || [],
          documentation: message.payload?.documentation || []
        }, {
          requestId: `validation_${message.id}`,
          sourceRequestId: message.id,
          repository: message.payload?.context?.repository,
          project: message.payload?.context?.project,
          task: message.payload?.task,
          session: { id: message.session_id },
          validation: {
            checkSyntax: true,
            checkLogic: true,
            checkPerformance: true,
            checkSecurity: true,
            runTests: true,
            generateReport: true
          },
          ...context
        });
      
      default:
        throw new Error(`Cannot transform AgentAPI message type '${message.type}' to Claude Code`);
    }
  }

  /**
   * Transform Claude Code message to AgentAPI format
   * @param {Object} message - Claude Code message
   * @param {Object} context - Transformation context
   * @returns {Object} AgentAPI formatted message
   */
  transformClaudeCodeToAgentApi(message, context) {
    switch (message.type) {
      case 'validation_response':
        return this.agentProtocol.createValidationUpdate(message, {
          sessionId: context.sessionId,
          traceId: context.traceId
        });
      
      case 'code_review_response':
        return this.agentProtocol.createValidationUpdate({
          validationId: message.id,
          success: message.status === 'success',
          issues: message.issues || [],
          suggestions: message.suggestions || [],
          fixes: message.fixes || [],
          duration: message.duration || 0,
          environment: message.environment || 'unknown'
        }, {
          sessionId: context.sessionId,
          traceId: context.traceId
        });
      
      default:
        throw new Error(`Cannot transform Claude Code message type '${message.type}' to AgentAPI`);
    }
  }

  /**
   * Normalize message for a specific protocol
   * @param {Object} message - Message to normalize
   * @param {string} protocol - Target protocol
   * @returns {Object} Normalized message
   */
  normalizeMessage(message, protocol) {
    const normalized = {
      ...message,
      normalized: true,
      normalized_at: new Date().toISOString(),
      protocol: protocol
    };
    
    // Protocol-specific normalization
    switch (protocol) {
      case 'agentapi':
        return this.normalizeAgentApiMessage(normalized);
      
      case 'claude_code':
        return this.normalizeClaudeCodeMessage(normalized);
      
      default:
        return normalized;
    }
  }

  /**
   * Normalize AgentAPI message
   * @param {Object} message - Message to normalize
   * @returns {Object} Normalized message
   */
  normalizeAgentApiMessage(message) {
    return {
      ...message,
      version: message.version || this.agentProtocol.version,
      timestamp: message.timestamp || new Date().toISOString(),
      metadata: {
        source: 'unified-protocol',
        ...message.metadata
      }
    };
  }

  /**
   * Normalize Claude Code message
   * @param {Object} message - Message to normalize
   * @returns {Object} Normalized message
   */
  normalizeClaudeCodeMessage(message) {
    return {
      ...message,
      version: message.version || this.claudeCodeProtocol.version,
      timestamp: message.timestamp || new Date().toISOString(),
      metadata: {
        source: 'unified-protocol',
        ...message.metadata
      }
    };
  }

  /**
   * Generic transformation for unknown protocol pairs
   * @param {Object} message - Message to transform
   * @param {string} fromProtocol - Source protocol
   * @param {string} toProtocol - Target protocol
   * @param {Object} context - Transformation context
   * @returns {Object} Transformed message
   */
  genericTransformation(message, fromProtocol, toProtocol, context) {
    log('warn', `🤷 Using generic transformation: ${fromProtocol} → ${toProtocol}`);
    
    return {
      ...message,
      transformed_from: fromProtocol,
      transformed_to: toProtocol,
      transformation_type: 'generic',
      transformation_timestamp: new Date().toISOString(),
      original_message: message,
      context: context
    };
  }

  /**
   * Detect protocol from message
   * @param {Object} message - Message to analyze
   * @returns {string|null} Detected protocol
   */
  detectProtocol(message) {
    if (!message || typeof message !== 'object') {
      return null;
    }
    
    // Check message type routing
    if (message.type && this.messageRouting.has(message.type)) {
      return this.messageRouting.get(message.type);
    }
    
    // Check for protocol-specific fields
    if (message.session_id || message.payload?.task) {
      return 'agentapi';
    }
    
    if (message.validation_id || message.validation_config) {
      return 'claude_code';
    }
    
    // Check metadata
    if (message.metadata?.source === 'claude-task-master') {
      return 'agentapi';
    }
    
    if (message.metadata?.source === 'claude-code') {
      return 'claude_code';
    }
    
    return null;
  }

  /**
   * Validate transformation input
   * @param {Object} message - Message to validate
   * @param {string} fromProtocol - Source protocol
   * @param {string} toProtocol - Target protocol
   * @throws {Error} If input is invalid
   */
  validateTransformationInput(message, fromProtocol, toProtocol) {
    if (!message || typeof message !== 'object') {
      throw new Error('Message must be an object');
    }
    
    if (!fromProtocol || typeof fromProtocol !== 'string') {
      throw new Error('Source protocol must be a string');
    }
    
    if (!toProtocol || typeof toProtocol !== 'string') {
      throw new Error('Target protocol must be a string');
    }
    
    if (!this.protocolMap.has(fromProtocol)) {
      throw new Error(`Unknown source protocol: ${fromProtocol}`);
    }
    
    if (!this.protocolMap.has(toProtocol)) {
      throw new Error(`Unknown target protocol: ${toProtocol}`);
    }
  }

  /**
   * Validate transformed message
   * @param {Object} message - Transformed message
   * @param {string} protocol - Target protocol
   * @throws {Error} If message is invalid
   */
  validateTransformedMessage(message, protocol) {
    const protocolHandler = this.protocolMap.get(protocol);
    
    if (protocolHandler && protocolHandler.validateRequest) {
      try {
        protocolHandler.validateRequest(message);
      } catch (error) {
        throw new Error(`Transformed message validation failed: ${error.message}`);
      }
    }
  }

  /**
   * Record transformation for history and debugging
   * @param {string} transformationId - Transformation identifier
   * @param {Object} transformationData - Transformation data
   */
  recordTransformation(transformationId, transformationData) {
    this.transformationHistory.push({
      id: transformationId,
      ...transformationData
    });
    
    // Keep history size manageable
    if (this.transformationHistory.length > 1000) {
      this.transformationHistory = this.transformationHistory.slice(-1000);
    }
  }

  /**
   * Get transformation history
   * @param {number} limit - Maximum number of entries to return
   * @returns {Array} Transformation history
   */
  getTransformationHistory(limit = 100) {
    return this.transformationHistory
      .slice(-limit)
      .reverse();
  }

  /**
   * Get supported protocols
   * @returns {Array} Array of supported protocol names
   */
  getSupportedProtocols() {
    return Array.from(this.protocolMap.keys());
  }

  /**
   * Get protocol information
   * @param {string} protocol - Protocol name
   * @returns {Object|null} Protocol information
   */
  getProtocolInfo(protocol) {
    const protocolHandler = this.protocolMap.get(protocol);
    
    if (!protocolHandler) {
      return null;
    }
    
    if (protocolHandler.getProtocolInfo) {
      return protocolHandler.getProtocolInfo();
    }
    
    return {
      name: protocol,
      version: 'unknown',
      features: []
    };
  }

  /**
   * Get unified protocol statistics
   * @returns {Object} Protocol statistics
   */
  getStatistics() {
    const protocolStats = {};
    
    for (const [name, handler] of this.protocolMap) {
      protocolStats[name] = handler.getProtocolInfo ? handler.getProtocolInfo() : { name };
    }
    
    const transformationsByProtocol = {};
    this.transformationHistory.forEach(t => {
      const key = `${t.fromProtocol}_to_${t.toProtocol}`;
      transformationsByProtocol[key] = (transformationsByProtocol[key] || 0) + 1;
    });
    
    return {
      supported_protocols: this.getSupportedProtocols(),
      protocol_details: protocolStats,
      total_transformations: this.transformationHistory.length,
      transformations_by_protocol: transformationsByProtocol,
      message_type_routing: Object.fromEntries(this.messageRouting)
    };
  }

  /**
   * Get unified protocol health
   * @returns {Object} Health status
   */
  getHealth() {
    return {
      status: 'healthy',
      supported_protocols: this.getSupportedProtocols().length,
      transformation_history_size: this.transformationHistory.length,
      protocol_handlers_loaded: this.protocolMap.size,
      message_routing_rules: this.messageRouting.size
    };
  }
}

export default UnifiedProtocol;

