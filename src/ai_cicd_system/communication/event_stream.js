/**
 * @fileoverview Event Stream
 * @description Server-sent events handling for real-time communication
 */

import { log } from '../utils/simple_logger.js';

/**
 * Event Stream - Handles Server-Sent Events (SSE) communication
 */
export class EventStream {
  constructor(config) {
    this.config = config;
    this.url = config.eventStreamUrl || `${config.agentApiUrl || 'http://localhost:8000'}/events`;
    this.reconnectAttempts = config.reconnectAttempts || 5;
    this.reconnectDelay = config.reconnectDelay || 1000;
    this.maxReconnectDelay = config.maxReconnectDelay || 30000;
    
    this.eventSource = null;
    this.isConnected = false;
    this.isReconnecting = false;
    this.reconnectCount = 0;
    this.eventHandlers = new Map();
    this.eventHistory = [];
    this.lastEventId = null;
    
    this.isInitialized = false;
  }

  /**
   * Initialize the event stream
   */
  async initialize() {
    log('info', '🔄 Initializing event stream...');
    
    try {
      await this.connect();
      this.setupDefaultHandlers();
      
      this.isInitialized = true;
      log('info', '✅ Event stream initialized');
      
    } catch (error) {
      log('error', `❌ Failed to initialize event stream: ${error.message}`);
      throw error;
    }
  }

  /**
   * Connect to event stream
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        log('debug', `🔗 Connecting to event stream: ${this.url}`);
        
        const eventSourceUrl = this.lastEventId 
          ? `${this.url}?lastEventId=${this.lastEventId}`
          : this.url;
        
        this.eventSource = new EventSource(eventSourceUrl);
        
        this.eventSource.onopen = () => {
          this.isConnected = true;
          this.isReconnecting = false;
          this.reconnectCount = 0;
          
          log('info', '✅ Event stream connected');
          this.emit('connected');
          resolve();
        };
        
        this.eventSource.onerror = (error) => {
          this.isConnected = false;
          
          log('error', `❌ Event stream error: ${error.message || 'Connection error'}`);
          this.emit('error', error);
          
          if (this.eventSource.readyState === EventSource.CLOSED) {
            if (!this.isReconnecting && this.reconnectCount < this.reconnectAttempts) {
              this.attemptReconnect();
            } else if (!this.isConnected) {
              reject(new Error('Event stream connection failed'));
            }
          }
        };
        
        this.eventSource.onmessage = (event) => {
          this.handleEvent('message', event);
        };
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from event stream
   */
  disconnect() {
    if (this.eventSource) {
      this.isReconnecting = false;
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected = false;
      
      log('info', '🔌 Event stream disconnected');
      this.emit('disconnected');
    }
  }

  /**
   * Handle incoming event
   * @param {string} eventType - Event type
   * @param {Object} event - Event data
   */
  handleEvent(eventType, event) {
    try {
      const eventData = {
        id: event.lastEventId || `event_${Date.now()}`,
        type: eventType,
        data: event.data,
        timestamp: new Date(),
        raw: event
      };
      
      // Update last event ID for reconnection
      if (event.lastEventId) {
        this.lastEventId = event.lastEventId;
      }
      
      log('debug', `📥 Received event: ${eventType} (${eventData.id})`);
      
      // Record event history
      this.eventHistory.push(eventData);
      
      // Keep history size manageable
      if (this.eventHistory.length > 1000) {
        this.eventHistory = this.eventHistory.slice(-1000);
      }
      
      // Parse data if it's JSON
      let parsedData = event.data;
      try {
        parsedData = JSON.parse(event.data);
      } catch (parseError) {
        // Data is not JSON, keep as string
      }
      
      eventData.parsedData = parsedData;
      
      // Call registered handlers
      const handlers = this.eventHandlers.get(eventType) || [];
      handlers.forEach(handler => {
        try {
          handler(eventData);
        } catch (handlerError) {
          log('error', `❌ Event handler error: ${handlerError.message}`);
        }
      });
      
      // Emit generic event
      this.emit('event', eventData);
      
    } catch (error) {
      log('error', `❌ Failed to handle event: ${error.message}`);
    }
  }

  /**
   * Register event handler
   * @param {string} eventType - Event type to handle
   * @param {Function} handler - Handler function
   */
  addEventListener(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    
    this.eventHandlers.get(eventType).push(handler);
    
    // Register with EventSource for custom events
    if (this.eventSource && eventType !== 'message') {
      this.eventSource.addEventListener(eventType, (event) => {
        this.handleEvent(eventType, event);
      });
    }
    
    log('debug', `📝 Registered event handler: ${eventType}`);
  }

  /**
   * Remove event handler
   * @param {string} eventType - Event type
   * @param {Function} handler - Handler function to remove
   */
  removeEventListener(eventType, handler) {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        log('debug', `🗑️ Removed event handler: ${eventType}`);
      }
    }
  }

  /**
   * Setup default event handlers
   */
  setupDefaultHandlers() {
    // Handle task updates
    this.addEventListener('task_update', (eventData) => {
      log('info', `📋 Task update received: ${eventData.parsedData?.taskId}`);
    });
    
    // Handle validation results
    this.addEventListener('validation_result', (eventData) => {
      log('info', `✅ Validation result received: ${eventData.parsedData?.validationId}`);
    });
    
    // Handle system notifications
    this.addEventListener('notification', (eventData) => {
      log('info', `🔔 Notification received: ${eventData.parsedData?.message}`);
    });
    
    // Handle heartbeat events
    this.addEventListener('heartbeat', (eventData) => {
      log('debug', '💓 Heartbeat received');
    });
  }

  /**
   * Attempt to reconnect
   */
  async attemptReconnect() {
    if (this.isReconnecting || this.reconnectCount >= this.reconnectAttempts) {
      return;
    }
    
    this.isReconnecting = true;
    this.reconnectCount++;
    
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectCount - 1),
      this.maxReconnectDelay
    );
    
    log('info', `🔄 Attempting event stream reconnect ${this.reconnectCount}/${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.connect();
        log('info', '✅ Event stream reconnected successfully');
      } catch (error) {
        log('error', `❌ Event stream reconnect failed: ${error.message}`);
        this.isReconnecting = false;
        
        if (this.reconnectCount < this.reconnectAttempts) {
          this.attemptReconnect();
        } else {
          log('error', '💀 Event stream reconnect attempts exhausted');
          this.emit('reconnect_failed');
        }
      }
    }, delay);
  }

  /**
   * Get events by type
   * @param {string} eventType - Event type to filter by
   * @param {number} limit - Maximum number of events to return
   * @returns {Array} Array of events
   */
  getEventsByType(eventType, limit = 100) {
    return this.eventHistory
      .filter(event => event.type === eventType)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get recent events
   * @param {number} limit - Maximum number of events to return
   * @returns {Array} Array of recent events
   */
  getRecentEvents(limit = 100) {
    return this.eventHistory
      .slice(-limit)
      .reverse();
  }

  /**
   * Get events since timestamp
   * @param {Date} since - Timestamp to filter from
   * @returns {Array} Array of events
   */
  getEventsSince(since) {
    return this.eventHistory
      .filter(event => event.timestamp > since)
      .reverse();
  }

  /**
   * Clear event history
   */
  clearHistory() {
    this.eventHistory = [];
    log('debug', '🧹 Event history cleared');
  }

  /**
   * Emit custom event
   * @param {string} eventName - Event name
   * @param {any} data - Event data
   */
  emit(eventName, data) {
    // This would typically emit to internal event system
    log('debug', `📡 Emitting event: ${eventName}`);
  }

  /**
   * Get stream statistics
   * @returns {Object} Stream statistics
   */
  getStatistics() {
    const eventTypes = {};
    this.eventHistory.forEach(event => {
      eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
    });
    
    return {
      is_connected: this.isConnected,
      reconnect_count: this.reconnectCount,
      total_events: this.eventHistory.length,
      event_types: eventTypes,
      registered_handlers: this.eventHandlers.size,
      last_event_id: this.lastEventId,
      url: this.url
    };
  }

  /**
   * Get stream health
   * @returns {Object} Health status
   */
  getHealth() {
    const recentEvents = this.getEventsSince(new Date(Date.now() - 60000)); // Last minute
    
    return {
      status: this.isInitialized && this.isConnected ? 'healthy' : 'unhealthy',
      is_connected: this.isConnected,
      is_reconnecting: this.isReconnecting,
      reconnect_attempts: `${this.reconnectCount}/${this.reconnectAttempts}`,
      recent_events_count: recentEvents.length,
      last_event_time: this.eventHistory.length > 0 
        ? this.eventHistory[this.eventHistory.length - 1].timestamp 
        : null
    };
  }

  /**
   * Shutdown the event stream
   */
  async shutdown() {
    log('info', '🔄 Shutting down event stream...');
    
    this.disconnect();
    
    // Clear handlers and history
    this.eventHandlers.clear();
    this.eventHistory = [];
    this.lastEventId = null;
    
    this.isInitialized = false;
    
    log('info', '✅ Event stream shutdown complete');
  }
}

export default EventStream;

