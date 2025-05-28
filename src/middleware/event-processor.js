/**
 * SSE Event Processor
 * 
 * Processes Server-Sent Events from AgentAPI, handles real-time event streaming,
 * and manages event routing and transformation.
 */

import { EventEmitter } from 'events';
import EventSource from 'eventsource';

export class EventProcessor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      agentApiUrl: config.agentApiUrl || 'http://localhost:3284',
      reconnectDelay: config.reconnectDelay || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      heartbeatInterval: config.heartbeatInterval || 30000,
      eventBufferSize: config.eventBufferSize || 1000,
      enableEventPersistence: config.enableEventPersistence || false,
      eventFilters: config.eventFilters || [],
      ...config
    };

    this.eventSource = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.eventBuffer = [];
    this.eventHandlers = new Map();
    this.heartbeatTimer = null;
    this.lastEventTime = null;
    this.eventStats = {
      totalEvents: 0,
      eventsByType: {},
      errors: 0,
      reconnections: 0
    };

    this._setupDefaultHandlers();
  }

  /**
   * Setup default event handlers
   */
  _setupDefaultHandlers() {
    // Message events
    this.on('message', (event) => {
      this._processMessageEvent(event);
    });

    // Status events
    this.on('status', (event) => {
      this._processStatusEvent(event);
    });

    // Error events
    this.on('error', (event) => {
      this._processErrorEvent(event);
    });
  }

  /**
   * Start the event processor
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isConnected) {
      return;
    }

    try {
      await this._connect();
      this._startHeartbeat();
      this.emit('started');
    } catch (error) {
      this.emit('startError', error);
      throw error;
    }
  }

  /**
   * Connect to the SSE stream
   * @returns {Promise<void>}
   */
  async _connect() {
    return new Promise((resolve, reject) => {
      try {
        const url = `${this.config.agentApiUrl}/events`;
        this.eventSource = new EventSource(url);

        this.eventSource.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.lastEventTime = Date.now();
          this.emit('connected');
          resolve();
        };

        this.eventSource.onmessage = (event) => {
          this._handleRawEvent(event);
        };

        this.eventSource.onerror = (error) => {
          this.isConnected = false;
          this.eventStats.errors++;
          
          if (this.eventSource.readyState === EventSource.CLOSED) {
            this.emit('disconnected', error);
            this._attemptReconnect();
          } else {
            this.emit('connectionError', error);
          }
        };

        // Timeout for initial connection
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle raw SSE events
   * @param {Object} event - Raw SSE event
   */
  _handleRawEvent(event) {
    try {
      this.lastEventTime = Date.now();
      this.eventStats.totalEvents++;

      // Parse event data
      let eventData;
      try {
        eventData = JSON.parse(event.data);
      } catch (parseError) {
        // Handle non-JSON events
        eventData = {
          type: 'raw',
          data: event.data,
          timestamp: Date.now()
        };
      }

      // Add metadata
      const processedEvent = {
        ...eventData,
        id: event.lastEventId || `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        receivedAt: Date.now(),
        source: 'agentapi'
      };

      // Apply filters
      if (this._shouldProcessEvent(processedEvent)) {
        this._processEvent(processedEvent);
      }

    } catch (error) {
      this.emit('eventProcessingError', { error, rawEvent: event });
    }
  }

  /**
   * Check if event should be processed based on filters
   * @param {Object} event - Event to check
   * @returns {boolean} True if event should be processed
   */
  _shouldProcessEvent(event) {
    if (this.config.eventFilters.length === 0) {
      return true;
    }

    return this.config.eventFilters.some(filter => {
      if (typeof filter === 'string') {
        return event.type === filter;
      }
      
      if (typeof filter === 'function') {
        return filter(event);
      }
      
      if (typeof filter === 'object') {
        return Object.keys(filter).every(key => 
          event[key] === filter[key]
        );
      }
      
      return false;
    });
  }

  /**
   * Process an event
   * @param {Object} event - Event to process
   */
  _processEvent(event) {
    // Update statistics
    this.eventStats.eventsByType[event.type] = 
      (this.eventStats.eventsByType[event.type] || 0) + 1;

    // Add to buffer
    this._addToBuffer(event);

    // Emit specific event type
    this.emit(event.type, event);

    // Emit generic event
    this.emit('event', event);

    // Call registered handlers
    const handlers = this.eventHandlers.get(event.type) || [];
    handlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        this.emit('handlerError', { error, event, handler });
      }
    });
  }

  /**
   * Add event to buffer
   * @param {Object} event - Event to add
   */
  _addToBuffer(event) {
    this.eventBuffer.push(event);
    
    // Maintain buffer size
    if (this.eventBuffer.length > this.config.eventBufferSize) {
      this.eventBuffer.shift();
    }
  }

  /**
   * Process message events
   * @param {Object} event - Message event
   */
  _processMessageEvent(event) {
    const messageData = {
      id: event.id,
      content: event.content || event.data,
      type: event.messageType || 'agent',
      timestamp: event.timestamp || event.receivedAt,
      source: event.source
    };

    this.emit('messageReceived', messageData);
  }

  /**
   * Process status events
   * @param {Object} event - Status event
   */
  _processStatusEvent(event) {
    const statusData = {
      id: event.id,
      status: event.status || event.data,
      previousStatus: event.previousStatus,
      timestamp: event.timestamp || event.receivedAt,
      source: event.source
    };

    this.emit('statusChanged', statusData);
  }

  /**
   * Process error events
   * @param {Object} event - Error event
   */
  _processErrorEvent(event) {
    const errorData = {
      id: event.id,
      error: event.error || event.data,
      timestamp: event.timestamp || event.receivedAt,
      source: event.source
    };

    this.emit('errorReceived', errorData);
  }

  /**
   * Register an event handler
   * @param {string} eventType - Event type to handle
   * @param {Function} handler - Handler function
   */
  registerHandler(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    
    this.eventHandlers.get(eventType).push(handler);
  }

  /**
   * Unregister an event handler
   * @param {string} eventType - Event type
   * @param {Function} handler - Handler function to remove
   */
  unregisterHandler(eventType, handler) {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Start heartbeat monitoring
   */
  _startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      const timeSinceLastEvent = Date.now() - (this.lastEventTime || 0);
      
      if (timeSinceLastEvent > this.config.heartbeatInterval * 2) {
        this.emit('heartbeatMissed', { timeSinceLastEvent });
        
        // Attempt reconnection if no events for too long
        if (this.isConnected) {
          this._disconnect();
          this._attemptReconnect();
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Attempt to reconnect
   */
  async _attemptReconnect() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.emit('reconnectFailed', {
        attempts: this.reconnectAttempts,
        maxAttempts: this.config.maxReconnectAttempts
      });
      return;
    }

    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    this.eventStats.reconnections++;

    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      delay,
      maxAttempts: this.config.maxReconnectAttempts
    });

    setTimeout(async () => {
      try {
        await this._connect();
      } catch (error) {
        this.emit('reconnectError', error);
        this._attemptReconnect();
      }
    }, delay);
  }

  /**
   * Disconnect from the SSE stream
   */
  _disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.isConnected = false;
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Stop the event processor
   */
  stop() {
    this._disconnect();
    this.emit('stopped');
  }

  /**
   * Get recent events from buffer
   * @param {Object} options - Filter options
   * @returns {Array} Array of events
   */
  getRecentEvents(options = {}) {
    const {
      limit = 100,
      eventType = null,
      since = null
    } = options;

    let events = [...this.eventBuffer];

    // Filter by event type
    if (eventType) {
      events = events.filter(event => event.type === eventType);
    }

    // Filter by timestamp
    if (since) {
      events = events.filter(event => event.receivedAt >= since);
    }

    // Sort by timestamp (newest first)
    events.sort((a, b) => b.receivedAt - a.receivedAt);

    // Limit results
    return events.slice(0, limit);
  }

  /**
   * Get event statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      connection: {
        isConnected: this.isConnected,
        reconnectAttempts: this.reconnectAttempts,
        lastEventTime: this.lastEventTime,
        timeSinceLastEvent: this.lastEventTime ? Date.now() - this.lastEventTime : null
      },
      events: {
        total: this.eventStats.totalEvents,
        byType: { ...this.eventStats.eventsByType },
        bufferSize: this.eventBuffer.length,
        maxBufferSize: this.config.eventBufferSize
      },
      errors: {
        total: this.eventStats.errors,
        reconnections: this.eventStats.reconnections
      },
      handlers: {
        registered: Array.from(this.eventHandlers.keys()).reduce((acc, type) => {
          acc[type] = this.eventHandlers.get(type).length;
          return acc;
        }, {})
      },
      config: {
        agentApiUrl: this.config.agentApiUrl,
        reconnectDelay: this.config.reconnectDelay,
        maxReconnectAttempts: this.config.maxReconnectAttempts,
        heartbeatInterval: this.config.heartbeatInterval
      }
    };
  }

  /**
   * Clear event buffer
   */
  clearBuffer() {
    const clearedCount = this.eventBuffer.length;
    this.eventBuffer.length = 0;
    this.emit('bufferCleared', { clearedCount });
    return clearedCount;
  }

  /**
   * Export events for persistence
   * @param {Object} options - Export options
   * @returns {Array} Array of events
   */
  exportEvents(options = {}) {
    const {
      format = 'json',
      eventType = null,
      since = null,
      until = null
    } = options;

    let events = this.getRecentEvents({
      limit: this.eventBuffer.length,
      eventType,
      since
    });

    // Filter by until timestamp
    if (until) {
      events = events.filter(event => event.receivedAt <= until);
    }

    if (format === 'json') {
      return events;
    } else if (format === 'csv') {
      // Convert to CSV format
      const headers = ['id', 'type', 'receivedAt', 'data'];
      const rows = events.map(event => [
        event.id,
        event.type,
        new Date(event.receivedAt).toISOString(),
        JSON.stringify(event.data || event)
      ]);
      
      return [headers, ...rows];
    }

    return events;
  }
}

export default EventProcessor;

