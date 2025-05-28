/**
 * @fileoverview Protocol Adapter
 * @description Adapts between different communication protocols
 */

import { log } from '../utils/simple_logger.js';

/**
 * Protocol Adapter - Handles protocol adaptation between systems
 */
export class ProtocolAdapter {
  constructor(config) {
    this.config = config;
    this.protocolHandlers = new Map();
    this.setupDefaultProtocols();
  }

  /**
   * Setup default protocol handlers
   */
  setupDefaultProtocols() {
    // AgentAPI protocol handler
    this.protocolHandlers.set('agentapi', {
      name: 'AgentAPI Protocol',
      version: '1.0.0',
      contentType: 'application/json',
      
      serialize: (data) => {
        return JSON.stringify({
          ...data,
          protocol_version: '1.0.0',
          timestamp: new Date().toISOString()
        });
      },
      
      deserialize: (data) => {
        if (typeof data === 'string') {
          return JSON.parse(data);
        }
        return data;
      },
      
      validate: (data) => {
        return data && typeof data === 'object' && data.type;
      }
    });

    // Claude Code protocol handler
    this.protocolHandlers.set('claude_code', {
      name: 'Claude Code Protocol',
      version: '1.0.0',
      contentType: 'application/json',
      
      serialize: (data) => {
        return JSON.stringify({
          ...data,
          claude_code_version: '1.0.0',
          processed_at: new Date().toISOString()
        });
      },
      
      deserialize: (data) => {
        if (typeof data === 'string') {
          return JSON.parse(data);
        }
        return data;
      },
      
      validate: (data) => {
        return data && typeof data === 'object' && (data.type || data.validationId);
      }
    });

    // HTTP REST protocol handler
    this.protocolHandlers.set('http_rest', {
      name: 'HTTP REST Protocol',
      version: '1.1',
      contentType: 'application/json',
      
      serialize: (data) => {
        return JSON.stringify(data);
      },
      
      deserialize: (data) => {
        if (typeof data === 'string') {
          return JSON.parse(data);
        }
        return data;
      },
      
      validate: (data) => {
        return data !== null && data !== undefined;
      },
      
      formatRequest: (data, endpoint) => ({
        method: 'POST',
        url: endpoint,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: this.protocolHandlers.get('http_rest').serialize(data)
      }),
      
      formatResponse: (response) => {
        return this.protocolHandlers.get('http_rest').deserialize(response.body);
      }
    });

    // WebSocket protocol handler
    this.protocolHandlers.set('websocket', {
      name: 'WebSocket Protocol',
      version: '13',
      contentType: 'application/json',
      
      serialize: (data) => {
        return JSON.stringify({
          ...data,
          ws_message_id: `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString()
        });
      },
      
      deserialize: (data) => {
        if (typeof data === 'string') {
          return JSON.parse(data);
        }
        return data;
      },
      
      validate: (data) => {
        return data !== null && data !== undefined;
      },
      
      formatMessage: (data, messageType = 'data') => ({
        type: messageType,
        payload: data,
        timestamp: new Date().toISOString()
      })
    });
  }

  /**
   * Adapt data from one protocol to another
   * @param {any} data - Data to adapt
   * @param {string} fromProtocol - Source protocol
   * @param {string} toProtocol - Target protocol
   * @param {Object} options - Adaptation options
   * @returns {Promise<any>} Adapted data
   */
  async adaptProtocol(data, fromProtocol, toProtocol, options = {}) {
    log('debug', `🔄 Adapting protocol from ${fromProtocol} to ${toProtocol}`);
    
    try {
      // Get protocol handlers
      const fromHandler = this.protocolHandlers.get(fromProtocol);
      const toHandler = this.protocolHandlers.get(toProtocol);
      
      if (!fromHandler) {
        throw new Error(`Unknown source protocol: ${fromProtocol}`);
      }
      
      if (!toHandler) {
        throw new Error(`Unknown target protocol: ${toProtocol}`);
      }
      
      // Deserialize from source protocol
      const deserializedData = fromHandler.deserialize(data);
      
      // Validate source data
      if (!fromHandler.validate(deserializedData)) {
        throw new Error(`Invalid data for protocol ${fromProtocol}`);
      }
      
      // Apply protocol-specific transformations
      const transformedData = await this._applyProtocolTransformation(
        deserializedData, 
        fromProtocol, 
        toProtocol, 
        options
      );
      
      // Serialize to target protocol
      const serializedData = toHandler.serialize(transformedData);
      
      log('debug', `✅ Protocol adaptation completed: ${fromProtocol} → ${toProtocol}`);
      return serializedData;
      
    } catch (error) {
      log('error', `❌ Protocol adaptation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Serialize data for a specific protocol
   * @param {any} data - Data to serialize
   * @param {string} protocol - Target protocol
   * @returns {string} Serialized data
   */
  serialize(data, protocol) {
    const handler = this.protocolHandlers.get(protocol);
    if (!handler) {
      throw new Error(`Unknown protocol: ${protocol}`);
    }
    
    return handler.serialize(data);
  }

  /**
   * Deserialize data from a specific protocol
   * @param {string} data - Data to deserialize
   * @param {string} protocol - Source protocol
   * @returns {any} Deserialized data
   */
  deserialize(data, protocol) {
    const handler = this.protocolHandlers.get(protocol);
    if (!handler) {
      throw new Error(`Unknown protocol: ${protocol}`);
    }
    
    return handler.deserialize(data);
  }

  /**
   * Validate data for a specific protocol
   * @param {any} data - Data to validate
   * @param {string} protocol - Protocol to validate against
   * @returns {boolean} True if data is valid
   */
  validate(data, protocol) {
    const handler = this.protocolHandlers.get(protocol);
    if (!handler) {
      throw new Error(`Unknown protocol: ${protocol}`);
    }
    
    return handler.validate(data);
  }

  /**
   * Format HTTP request
   * @param {any} data - Request data
   * @param {string} endpoint - Target endpoint
   * @returns {Object} Formatted HTTP request
   */
  formatHttpRequest(data, endpoint) {
    const handler = this.protocolHandlers.get('http_rest');
    if (handler.formatRequest) {
      return handler.formatRequest(data, endpoint);
    }
    
    return {
      method: 'POST',
      url: endpoint,
      headers: {
        'Content-Type': handler.contentType
      },
      body: handler.serialize(data)
    };
  }

  /**
   * Format WebSocket message
   * @param {any} data - Message data
   * @param {string} messageType - Message type
   * @returns {Object} Formatted WebSocket message
   */
  formatWebSocketMessage(data, messageType = 'data') {
    const handler = this.protocolHandlers.get('websocket');
    if (handler.formatMessage) {
      return handler.formatMessage(data, messageType);
    }
    
    return {
      type: messageType,
      payload: data
    };
  }

  /**
   * Add custom protocol handler
   * @param {string} protocolId - Protocol identifier
   * @param {Object} handler - Protocol handler
   */
  addProtocolHandler(protocolId, handler) {
    if (!handler.serialize || !handler.deserialize || !handler.validate) {
      throw new Error('Protocol handler must have serialize, deserialize, and validate methods');
    }
    
    this.protocolHandlers.set(protocolId, handler);
    log('debug', `📝 Added protocol handler: ${protocolId}`);
  }

  /**
   * Remove protocol handler
   * @param {string} protocolId - Protocol identifier
   * @returns {boolean} True if handler was removed
   */
  removeProtocolHandler(protocolId) {
    const removed = this.protocolHandlers.delete(protocolId);
    if (removed) {
      log('debug', `🗑️ Removed protocol handler: ${protocolId}`);
    }
    return removed;
  }

  /**
   * Get protocol handler
   * @param {string} protocolId - Protocol identifier
   * @returns {Object|null} Protocol handler or null
   */
  getProtocolHandler(protocolId) {
    return this.protocolHandlers.get(protocolId) || null;
  }

  /**
   * List available protocols
   * @returns {Array} Array of protocol IDs
   */
  listProtocols() {
    return Array.from(this.protocolHandlers.keys());
  }

  /**
   * Get protocol information
   * @param {string} protocolId - Protocol identifier
   * @returns {Object|null} Protocol information
   */
  getProtocolInfo(protocolId) {
    const handler = this.protocolHandlers.get(protocolId);
    if (!handler) return null;
    
    return {
      id: protocolId,
      name: handler.name || protocolId,
      version: handler.version || 'unknown',
      contentType: handler.contentType || 'application/json'
    };
  }

  /**
   * Apply protocol-specific transformations
   * @param {any} data - Data to transform
   * @param {string} fromProtocol - Source protocol
   * @param {string} toProtocol - Target protocol
   * @param {Object} options - Transformation options
   * @returns {Promise<any>} Transformed data
   * @private
   */
  async _applyProtocolTransformation(data, fromProtocol, toProtocol, options) {
    // Apply specific transformations based on protocol pairs
    
    if (fromProtocol === 'agentapi' && toProtocol === 'claude_code') {
      return this._transformAgentApiToClaudeCode(data, options);
    }
    
    if (fromProtocol === 'claude_code' && toProtocol === 'agentapi') {
      return this._transformClaudeCodeToAgentApi(data, options);
    }
    
    if (toProtocol === 'http_rest') {
      return this._transformToHttpRest(data, options);
    }
    
    if (toProtocol === 'websocket') {
      return this._transformToWebSocket(data, options);
    }
    
    // Default: return data as-is
    return data;
  }

  /**
   * Transform AgentAPI data to Claude Code format
   * @param {Object} data - AgentAPI data
   * @param {Object} options - Transformation options
   * @returns {Object} Claude Code formatted data
   * @private
   */
  _transformAgentApiToClaudeCode(data, options) {
    return {
      ...data,
      claude_code_compatible: true,
      source_protocol: 'agentapi'
    };
  }

  /**
   * Transform Claude Code data to AgentAPI format
   * @param {Object} data - Claude Code data
   * @param {Object} options - Transformation options
   * @returns {Object} AgentAPI formatted data
   * @private
   */
  _transformClaudeCodeToAgentApi(data, options) {
    return {
      ...data,
      agentapi_compatible: true,
      source_protocol: 'claude_code'
    };
  }

  /**
   * Transform data to HTTP REST format
   * @param {Object} data - Data to transform
   * @param {Object} options - Transformation options
   * @returns {Object} HTTP REST formatted data
   * @private
   */
  _transformToHttpRest(data, options) {
    return {
      ...data,
      http_method: options.method || 'POST',
      http_headers: options.headers || {}
    };
  }

  /**
   * Transform data to WebSocket format
   * @param {Object} data - Data to transform
   * @param {Object} options - Transformation options
   * @returns {Object} WebSocket formatted data
   * @private
   */
  _transformToWebSocket(data, options) {
    return {
      ...data,
      ws_message_type: options.messageType || 'data',
      ws_connection_id: options.connectionId
    };
  }

  /**
   * Get adapter statistics
   * @returns {Object} Adapter statistics
   */
  getStatistics() {
    return {
      total_protocols: this.protocolHandlers.size,
      available_protocols: this.listProtocols()
    };
  }

  /**
   * Get adapter health
   * @returns {Object} Health status
   */
  getHealth() {
    return {
      status: 'healthy',
      protocols_loaded: this.protocolHandlers.size,
      default_protocols_available: this.protocolHandlers.has('agentapi') &&
                                   this.protocolHandlers.has('claude_code') &&
                                   this.protocolHandlers.has('http_rest') &&
                                   this.protocolHandlers.has('websocket')
    };
  }
}

export default ProtocolAdapter;

