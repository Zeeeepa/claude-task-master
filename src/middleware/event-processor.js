/**
 * Event Processor
 * 
 * Real-time SSE event processing and routing:
 * - SSE stream management: connect to AgentAPI event stream
 * - Event filtering: configurable event type filtering
 * - Event buffering: maintain event history with configurable size
 * - Handler registration: register custom event handlers
 * - Reconnection logic: automatic reconnection on stream interruption
 */

import { EventEmitter } from 'events';

export class EventProcessor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      eventBufferSize: 1000,
      enableEventPersistence: false,
      eventFilters: ['message', 'status', 'error'],
      ...config
    };
    
    this.agentApiClient = config.agentApiClient;
    this.eventBuffer = [];
    this.eventHandlers = new Map();
    this.reconnectAttempts = 0;
    this.isConnected = false;
    this.isInitialized = false;
    this.heartbeatTimer = null;
    
    this.metrics = {
      eventsReceived: 0,
      eventsProcessed: 0,
      eventsFiltered: 0,
      eventsFailed: 0,
      reconnections: 0,
      lastEventTime: null
    };
  }

  /**
   * Initialize the event processor
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }
    
    console.log('Initializing Event Processor...');
    
    if (!this.agentApiClient) {
      throw new Error('AgentAPI client is required');
    }
    
    // Setup event handlers for AgentAPI client
    this.setupAgentApiEventHandlers();
    
    this.isInitialized = true;
    console.log('Event Processor initialized');
    this.emit('initialized');
  }

  /**
   * Start the event processor
   */
  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    console.log('Starting Event Processor...');
    
    // Start heartbeat monitoring
    this.startHeartbeat();
    
    console.log('Event Processor started');
    this.emit('started');
  }

  /**
   * Stop the event processor
   */
  async stop() {
    console.log('Stopping Event Processor...');
    
    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    this.isConnected = false;
    
    console.log('Event Processor stopped');
    this.emit('stopped');
  }

  /**
   * Setup event handlers for AgentAPI client
   */
  setupAgentApiEventHandlers() {
    // Handle connection events
    this.agentApiClient.on('eventStreamConnected', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('Event stream connected');
      this.emit('connected');
    });
    
    this.agentApiClient.on('eventStreamError', (error) => {
      this.isConnected = false;
      console.error('Event stream error:', error);
      this.emit('connectionError', error);
      this.handleReconnection();
    });
    
    // Handle different event types
    this.agentApiClient.on('message', (data) => {
      this.processEvent({ type: 'message', data, timestamp: new Date() });
    });
    
    this.agentApiClient.on('statusUpdate', (data) => {
      this.processEvent({ type: 'status', data, timestamp: new Date() });
    });
    
    this.agentApiClient.on('toolExecution', (data) => {
      this.processEvent({ type: 'tool_execution', data, timestamp: new Date() });
    });
    
    this.agentApiClient.on('error', (data) => {
      this.processEvent({ type: 'error', data, timestamp: new Date() });
    });
    
    this.agentApiClient.on('completion', (data) => {
      this.processEvent({ type: 'completion', data, timestamp: new Date() });
    });
    
    this.agentApiClient.on('unknownEvent', (data) => {
      this.processEvent({ type: 'unknown', data, timestamp: new Date() });
    });
  }

  /**
   * Process an incoming event
   */
  processEvent(event) {
    this.metrics.eventsReceived++;
    this.metrics.lastEventTime = new Date();
    
    try {
      // Apply event filters
      if (!this.shouldProcessEvent(event)) {
        this.metrics.eventsFiltered++;
        return;
      }
      
      // Add to event buffer
      this.addToEventBuffer(event);
      
      // Process event through registered handlers
      this.executeEventHandlers(event);
      
      // Emit specific event types
      this.emitSpecificEvents(event);
      
      this.metrics.eventsProcessed++;
      
    } catch (error) {
      this.metrics.eventsFailed++;
      console.error('Error processing event:', error);
      this.emit('processingError', { event, error });
    }
  }

  /**
   * Check if event should be processed based on filters
   */
  shouldProcessEvent(event) {
    // Check if event type is in filters (empty filters means process all)
    if (this.config.eventFilters.length > 0) {
      return this.config.eventFilters.includes(event.type);
    }
    
    return true;
  }

  /**
   * Add event to buffer with size management
   */
  addToEventBuffer(event) {
    this.eventBuffer.push(event);
    
    // Maintain buffer size
    if (this.eventBuffer.length > this.config.eventBufferSize) {
      this.eventBuffer.shift(); // Remove oldest event
    }
  }

  /**
   * Execute registered event handlers
   */
  executeEventHandlers(event) {
    const handlers = this.eventHandlers.get(event.type) || [];
    
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(`Error in event handler for ${event.type}:`, error);
      }
    }
    
    // Execute wildcard handlers
    const wildcardHandlers = this.eventHandlers.get('*') || [];
    for (const handler of wildcardHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in wildcard event handler:', error);
      }
    }
  }

  /**
   * Emit specific events for different types
   */
  emitSpecificEvents(event) {
    switch (event.type) {
      case 'message':
        this.emit('messageEvent', event);
        break;
      case 'status':
        this.emit('statusEvent', event);
        break;
      case 'tool_execution':
        this.emit('toolEvent', event);
        break;
      case 'error':
        this.emit('errorEvent', event);
        break;
      case 'completion':
        this.emit('completionEvent', event);
        break;
      default:
        this.emit('unknownEvent', event);
    }
    
    // Always emit generic event
    this.emit('event', event);
  }

  /**
   * Register event handler
   */
  registerHandler(eventType, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }
    
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    
    this.eventHandlers.get(eventType).push(handler);
    
    console.log(`Event handler registered for type: ${eventType}`);
  }

  /**
   * Unregister event handler
   */
  unregisterHandler(eventType, handler) {
    const handlers = this.eventHandlers.get(eventType);
    if (!handlers) {
      return false;
    }
    
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
      console.log(`Event handler unregistered for type: ${eventType}`);
      return true;
    }
    
    return false;
  }

  /**
   * Handle reconnection logic
   */
  handleReconnection() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }
    
    this.reconnectAttempts++;
    this.metrics.reconnections++;
    
    console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${this.config.reconnectDelay}ms`);
    
    setTimeout(() => {
      if (!this.isConnected) {
        this.emit('reconnecting', { attempt: this.reconnectAttempts });
        // The AgentAPI client will handle the actual reconnection
      }
    }, this.config.reconnectDelay);
  }

  /**
   * Start heartbeat monitoring
   */
  startHeartbeat() {
    if (this.config.heartbeatInterval > 0) {
      this.heartbeatTimer = setInterval(() => {
        this.checkHeartbeat();
      }, this.config.heartbeatInterval);
    }
  }

  /**
   * Check heartbeat and connection health
   */
  checkHeartbeat() {
    const now = new Date();
    const timeSinceLastEvent = this.metrics.lastEventTime 
      ? now.getTime() - this.metrics.lastEventTime.getTime()
      : Infinity;
    
    // If no events received for too long, consider connection stale
    if (timeSinceLastEvent > this.config.heartbeatInterval * 2) {
      console.warn('No events received recently, connection may be stale');
      this.emit('connectionStale', { timeSinceLastEvent });
    }
    
    this.emit('heartbeat', {
      isConnected: this.isConnected,
      timeSinceLastEvent,
      eventBufferSize: this.eventBuffer.length
    });
  }

  /**
   * Get recent events from buffer
   */
  getRecentEvents(limit = 50, eventType = null) {
    let events = [...this.eventBuffer];
    
    // Filter by event type if specified
    if (eventType) {
      events = events.filter(event => event.type === eventType);
    }
    
    // Return most recent events
    return events.slice(-limit).reverse();
  }

  /**
   * Get event statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      eventBufferSize: this.eventBuffer.length,
      registeredHandlers: this.eventHandlers.size,
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Get health status
   */
  getHealth() {
    const now = new Date();
    const timeSinceLastEvent = this.metrics.lastEventTime 
      ? now.getTime() - this.metrics.lastEventTime.getTime()
      : Infinity;
    
    let status = 'healthy';
    
    if (!this.isConnected) {
      status = 'unhealthy';
    } else if (timeSinceLastEvent > this.config.heartbeatInterval * 3) {
      status = 'degraded';
    }
    
    return {
      status,
      isConnected: this.isConnected,
      timeSinceLastEvent,
      eventBufferSize: this.eventBuffer.length,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      lastEventTime: this.metrics.lastEventTime
    };
  }

  /**
   * Clear event buffer
   */
  clearEventBuffer() {
    this.eventBuffer = [];
    console.log('Event buffer cleared');
    this.emit('bufferCleared');
  }

  /**
   * Set event filters
   */
  setEventFilters(filters) {
    this.config.eventFilters = Array.isArray(filters) ? filters : [filters];
    console.log('Event filters updated:', this.config.eventFilters);
    this.emit('filtersUpdated', this.config.eventFilters);
  }

  /**
   * Get event buffer snapshot
   */
  getEventBufferSnapshot() {
    return {
      events: [...this.eventBuffer],
      size: this.eventBuffer.length,
      maxSize: this.config.eventBufferSize,
      oldestEvent: this.eventBuffer.length > 0 ? this.eventBuffer[0] : null,
      newestEvent: this.eventBuffer.length > 0 ? this.eventBuffer[this.eventBuffer.length - 1] : null
    };
  }
}

export default EventProcessor;

