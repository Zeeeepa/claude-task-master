/**
 * @fileoverview Database Module Index
 * @description Main entry point for all database functionality including event storage system
 * @version 2.0.0
 */

// Core database connection management
export { DatabaseConnectionManager } from './connection/connection_manager.js';

// Event storage system (Phase 1.3)
export { EventStore } from './event-store.js';
export { EventIntegration } from './event-integration.js';

// Configuration management
export { 
  getEventConfig, 
  createEventConfig, 
  validateEventConfig,
  DEFAULT_EVENT_CONFIG,
  DEVELOPMENT_CONFIG,
  PRODUCTION_CONFIG,
  TEST_CONFIG 
} from './event-config.js';

// Migration system
export { migration002 } from './migrations/002_event_storage_system.js';

// Examples and utilities
export { default as eventExamples } from './event-examples.js';

/**
 * Initialize the complete database system including event storage
 */
export async function initializeDatabaseSystem(config = null) {
  const { getEventConfig } = await import('./event-config.js');
  const { EventStore } = await import('./event-store.js');
  const { EventIntegration } = await import('./event-integration.js');
  
  const eventConfig = config || getEventConfig();
  
  // Initialize EventStore
  const eventStore = new EventStore(eventConfig);
  await eventStore.initialize();
  
  // Initialize EventIntegration
  const eventIntegration = new EventIntegration(eventConfig);
  await eventIntegration.initialize();
  
  console.log('[Database] Complete database system initialized');
  
  return {
    eventStore,
    eventIntegration,
    config: eventConfig
  };
}

/**
 * Quick setup for event storage system
 */
export async function setupEventStorage(customConfig = {}) {
  const { createEventConfig } = await import('./event-config.js');
  const { EventStore } = await import('./event-store.js');
  
  const config = createEventConfig(customConfig);
  const eventStore = new EventStore(config);
  await eventStore.initialize();
  
  return eventStore;
}

/**
 * Quick setup for event integration system
 */
export async function setupEventIntegration(customConfig = {}) {
  const { createEventConfig } = await import('./event-config.js');
  const { EventIntegration } = await import('./event-integration.js');
  
  const config = createEventConfig(customConfig);
  const eventIntegration = new EventIntegration(config);
  await eventIntegration.initialize();
  
  return eventIntegration;
}

export default {
  // Core exports
  DatabaseConnectionManager: () => import('./connection/connection_manager.js').then(m => m.DatabaseConnectionManager),
  EventStore: () => import('./event-store.js').then(m => m.EventStore),
  EventIntegration: () => import('./event-integration.js').then(m => m.EventIntegration),
  
  // Configuration
  getEventConfig: () => import('./event-config.js').then(m => m.getEventConfig),
  createEventConfig: () => import('./event-config.js').then(m => m.createEventConfig),
  
  // Setup functions
  initializeDatabaseSystem,
  setupEventStorage,
  setupEventIntegration
};

