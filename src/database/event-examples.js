/**
 * @fileoverview Event Storage System Usage Examples
 * @description Comprehensive examples showing how to use the event storage system
 * @version 1.0.0
 */

import { EventStore } from './event-store.js';
import { EventIntegration } from './event-integration.js';
import { getEventConfig, createEventConfig } from './event-config.js';

/**
 * Example 1: Basic EventStore Usage
 */
export async function basicEventStoreExample() {
  console.log('\n=== Basic EventStore Usage Example ===');

  // Get configuration
  const config = getEventConfig();
  
  // Initialize EventStore
  const eventStore = new EventStore(config);
  await eventStore.initialize();

  try {
    // Log a system event
    const systemEventId = await eventStore.logSystemEvent({
      event_type: 'user_action',
      event_name: 'login_attempt',
      user_id: 'user-123',
      data: {
        success: true,
        loginMethod: 'oauth',
        ipAddress: '192.168.1.100'
      },
      metadata: {
        userAgent: 'Mozilla/5.0...',
        source: 'web_app'
      },
      status: 'completed'
    });

    console.log('System event logged:', systemEventId);

    // Log a task event
    const taskEventId = await eventStore.logTaskEvent({
      task_id: 'task-456',
      task_name: 'Process User Data',
      agent_id: 'agent-789',
      event_type: 'data_processing',
      event_name: 'task_started',
      status: 'started',
      input_data: {
        userId: 'user-123',
        dataType: 'profile_update'
      },
      metadata: {
        priority: 'high',
        estimatedDuration: 30000
      },
      started_at: new Date()
    });

    console.log('Task event logged:', taskEventId);

    // Log an agent event
    const agentEventId = await eventStore.logAgentEvent({
      agent_id: 'agent-789',
      agent_name: 'DataProcessingAgent',
      event_type: 'agent_action',
      event_name: 'tool_execution',
      action: 'validate_data',
      status: 'completed',
      context: {
        toolName: 'data_validator',
        parameters: { strict: true }
      },
      result: {
        valid: true,
        validationTime: 150
      },
      duration_ms: 150
    });

    console.log('Agent event logged:', agentEventId);

    // Log a deployment event
    const deploymentEventId = await eventStore.logDeploymentEvent({
      deployment_id: 'deploy-101',
      environment: 'wsl2',
      event_type: 'deployment',
      event_name: 'pr_deployment',
      status: 'completed',
      branch_name: 'feature/user-profile-update',
      commit_hash: 'abc123def456',
      pr_number: 42,
      deployment_config: {
        environment: 'staging',
        replicas: 2,
        healthCheck: true
      },
      logs: {
        buildTime: 120000,
        testsPassed: 45,
        testsFailed: 0
      },
      started_at: new Date(Date.now() - 120000),
      completed_at: new Date(),
      duration_ms: 120000
    });

    console.log('Deployment event logged:', deploymentEventId);

  } finally {
    await eventStore.close();
  }
}

/**
 * Example 2: Event Querying and Analytics
 */
export async function eventQueryingExample() {
  console.log('\n=== Event Querying and Analytics Example ===');

  const config = getEventConfig();
  const eventStore = new EventStore(config);
  await eventStore.initialize();

  try {
    // Query recent events
    const recentEvents = await eventStore.querySystemEvents({
      limit: 10,
      orderBy: 'timestamp',
      orderDirection: 'DESC'
    });

    console.log('Recent events:', recentEvents.length);

    // Query events for a specific agent
    const agentEvents = await eventStore.querySystemEvents({
      agentId: 'agent-789',
      limit: 50,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
    });

    console.log('Agent events in last 24h:', agentEvents.length);

    // Query events by type
    const userActionEvents = await eventStore.querySystemEvents({
      eventType: 'user_action',
      limit: 100
    });

    console.log('User action events:', userActionEvents.length);

    // Get comprehensive statistics
    const stats = await eventStore.getEventStatistics({
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
    });

    console.log('Event statistics for last 7 days:');
    console.log('- Total events:', stats.totalEvents);
    console.log('- Events by type:', stats.eventsByType);
    console.log('- Events by status:', stats.eventsByStatus);
    console.log('- Events by agent:', stats.eventsByAgent);
    console.log('- Average duration:', stats.averageDuration, 'ms');
    console.log('- Time range:', stats.timeRange);

    // Get health status
    const health = await eventStore.getHealthStatus();
    console.log('Health status:', health);

  } finally {
    await eventStore.close();
  }
}

/**
 * Example 3: Event Integration Usage
 */
export async function eventIntegrationExample() {
  console.log('\n=== Event Integration Usage Example ===');

  const config = getEventConfig();
  const integration = new EventIntegration(config);
  await integration.initialize();

  try {
    // Simulate task lifecycle events
    console.log('Simulating task lifecycle...');

    // Task started
    integration.emit('task:started', {
      id: 'task-simulation-001',
      name: 'Simulate Data Processing',
      agentId: 'agent-simulation',
      input: {
        dataSize: 1024,
        format: 'json'
      },
      metadata: {
        priority: 'normal',
        source: 'simulation'
      }
    });

    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Task completed
    integration.emit('task:completed', {
      id: 'task-simulation-001',
      output: {
        processedRecords: 100,
        errors: 0,
        processingTime: 1000
      },
      metadata: {
        source: 'simulation'
      }
    });

    // Simulate agent lifecycle events
    console.log('Simulating agent lifecycle...');

    // Agent registered
    integration.emit('agent:registered', {
      id: 'agent-simulation',
      name: 'SimulationAgent',
      capabilities: ['data_processing', 'validation'],
      config: {
        maxConcurrentTasks: 5,
        timeout: 30000
      }
    });

    // Agent action
    integration.emit('agent:action', {
      agentId: 'agent-simulation',
      action: 'process_data',
      status: 'completed',
      context: {
        taskId: 'task-simulation-001',
        method: 'batch_processing'
      },
      result: {
        success: true,
        recordsProcessed: 100
      },
      duration: 1000
    });

    // Simulate deployment events
    console.log('Simulating deployment...');

    // Deployment started
    integration.emit('deployment:started', {
      id: 'deploy-simulation-001',
      environment: 'wsl2',
      branch: 'feature/simulation',
      commit: 'sim123abc456',
      prNumber: 999,
      config: {
        environment: 'staging',
        replicas: 1
      }
    });

    // Simulate deployment time
    await new Promise(resolve => setTimeout(resolve, 500));

    // Deployment completed
    integration.emit('deployment:completed', {
      id: 'deploy-simulation-001',
      environment: 'wsl2',
      logs: {
        buildTime: 45000,
        testsPassed: 25,
        deploymentTime: 15000
      },
      duration: 60000
    });

    // Log custom events
    console.log('Logging custom events...');

    await integration.logCustomEvent('system', {
      event_type: 'simulation',
      event_name: 'simulation_completed',
      data: {
        totalEvents: 6,
        duration: 2000,
        success: true
      },
      status: 'completed'
    });

    // Get integration health status
    const health = await integration.getHealthStatus();
    console.log('Integration health:', health);

    // Get event statistics
    const stats = await integration.getEventStatistics();
    console.log('Current statistics:', {
      totalEvents: stats.totalEvents,
      eventsByType: stats.eventsByType
    });

  } finally {
    await integration.close();
  }
}

/**
 * Example 4: Custom Configuration
 */
export async function customConfigurationExample() {
  console.log('\n=== Custom Configuration Example ===');

  // Create custom configuration
  const customConfig = createEventConfig({
    database: {
      host: 'localhost',
      database: 'my_custom_db'
    },
    eventStore: {
      tablePrefix: 'my_app_events',
      batchSize: 50,
      batchTimeout: 3000
    },
    integration: {
      autoCapture: {
        tasks: true,
        agents: true,
        deployments: false, // Disable deployment tracking
        system: true
      },
      trackingLimits: {
        maxTrackedTasks: 500,
        maxTrackedAgents: 50
      }
    },
    logging: {
      level: 'debug',
      enableConsole: true,
      enableFile: true
    }
  });

  console.log('Custom configuration created:');
  console.log('- Database:', customConfig.database.database);
  console.log('- Table prefix:', customConfig.eventStore.tablePrefix);
  console.log('- Batch size:', customConfig.eventStore.batchSize);
  console.log('- Auto capture deployments:', customConfig.integration.autoCapture.deployments);

  // Use custom configuration
  const eventStore = new EventStore(customConfig);
  await eventStore.initialize();

  try {
    // Log an event with custom configuration
    await eventStore.logSystemEvent({
      event_type: 'custom_config',
      event_name: 'configuration_test',
      data: {
        configType: 'custom',
        tablePrefix: customConfig.eventStore.tablePrefix
      },
      status: 'completed'
    });

    console.log('Event logged with custom configuration');

  } finally {
    await eventStore.close();
  }
}

/**
 * Example 5: Error Handling and Recovery
 */
export async function errorHandlingExample() {
  console.log('\n=== Error Handling and Recovery Example ===');

  const config = getEventConfig();
  const eventStore = new EventStore(config);

  try {
    await eventStore.initialize();

    // Simulate various error scenarios
    console.log('Testing error scenarios...');

    // Test with invalid event data
    try {
      await eventStore.logSystemEvent({
        // Missing required fields
        data: { test: true }
      });
    } catch (error) {
      console.log('Caught expected error for invalid event:', error.message);
    }

    // Test with malformed JSON data
    try {
      await eventStore.logTaskEvent({
        task_id: 'error-test',
        task_name: 'Error Test',
        agent_id: 'test-agent',
        event_type: 'test',
        event_name: 'error_test',
        status: 'error',
        error_data: {
          error: 'Simulated error for testing',
          code: 'TEST_ERROR',
          details: {
            timestamp: new Date(),
            context: 'error_handling_example'
          }
        }
      });

      console.log('Error event logged successfully');
    } catch (error) {
      console.log('Failed to log error event:', error.message);
    }

    // Test health monitoring
    const health = await eventStore.getHealthStatus();
    if (health.isHealthy) {
      console.log('System is healthy');
    } else {
      console.log('System health issues detected:', health.error);
    }

  } catch (error) {
    console.error('Initialization failed:', error.message);
  } finally {
    await eventStore.close();
  }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log('🗄️ Event Storage System Examples');
  console.log('=====================================');

  try {
    await basicEventStoreExample();
    await eventQueryingExample();
    await eventIntegrationExample();
    await customConfigurationExample();
    await errorHandlingExample();

    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('\n❌ Example execution failed:', error);
  }
}

// Export individual examples
export default {
  basicEventStoreExample,
  eventQueryingExample,
  eventIntegrationExample,
  customConfigurationExample,
  errorHandlingExample,
  runAllExamples
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

