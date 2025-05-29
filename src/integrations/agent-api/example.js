/**
 * AgentAPI Middleware Usage Example
 * 
 * Demonstrates how to use the AgentAPI middleware in different scenarios.
 */

import { MiddlewareServer, getEnvironmentConfig } from './index.js';
import { SimpleLogger } from '../../ai_cicd_system/utils/simple_logger.js';

const logger = new SimpleLogger('AgentAPIExample');

/**
 * Basic usage example
 */
async function basicExample() {
  logger.info('Starting basic AgentAPI middleware example...');

  try {
    // Create middleware server with default configuration
    const server = new MiddlewareServer();

    // Start the server
    await server.start();
    logger.info('AgentAPI middleware server started successfully');

    // Get server status
    const status = server.getStatus();
    logger.info('Server status:', status);

    // Stop the server after 5 seconds
    setTimeout(async () => {
      await server.stop();
      logger.info('AgentAPI middleware server stopped');
    }, 5000);

  } catch (error) {
    logger.error('Error in basic example:', error);
  }
}

/**
 * Advanced configuration example
 */
async function advancedExample() {
  logger.info('Starting advanced AgentAPI middleware example...');

  try {
    // Get environment-specific configuration
    const config = getEnvironmentConfig('development');

    // Override specific settings
    const customConfig = {
      ...config,
      server: {
        ...config.server,
        port: 3003,
        logLevel: 'debug'
      },
      auth: {
        ...config.auth,
        jwtExpiresIn: '2h',
        maxLoginAttempts: 3
      },
      rateLimit: {
        ...config.rateLimit,
        maxRequests: 200,
        apiMaxRequests: 120
      }
    };

    // Create middleware server with custom configuration
    const server = new MiddlewareServer(customConfig);

    // Start the server
    await server.start();
    logger.info('Advanced AgentAPI middleware server started');

    // Simulate some API calls
    await simulateAPIUsage(customConfig.server.port);

    // Stop the server
    await server.stop();
    logger.info('Advanced AgentAPI middleware server stopped');

  } catch (error) {
    logger.error('Error in advanced example:', error);
  }
}

/**
 * Integration example with System Orchestrator
 */
async function integrationExample() {
  logger.info('Starting integration example...');

  try {
    const config = getEnvironmentConfig('development');
    const server = new MiddlewareServer(config);

    // Start the server
    await server.start();
    logger.info('Integration example server started');

    // Simulate workflow commands from orchestrator
    await simulateOrchestratorIntegration(config.server.port);

    // Simulate Claude Code integration
    await simulateClaudeCodeIntegration(config.server.port);

    // Stop the server
    await server.stop();
    logger.info('Integration example server stopped');

  } catch (error) {
    logger.error('Error in integration example:', error);
  }
}

/**
 * WebSocket example
 */
async function webSocketExample() {
  logger.info('Starting WebSocket example...');

  try {
    const config = getEnvironmentConfig('development');
    config.server.enableWebSocket = true;
    
    const server = new MiddlewareServer(config);

    // Start the server
    await server.start();
    logger.info('WebSocket example server started');

    // Simulate WebSocket connections
    await simulateWebSocketUsage(config.server.port);

    // Broadcast a message to all connected clients
    server.broadcast({
      type: 'notification',
      message: 'Hello from AgentAPI middleware!',
      timestamp: new Date().toISOString()
    });

    // Stop the server after 10 seconds
    setTimeout(async () => {
      await server.stop();
      logger.info('WebSocket example server stopped');
    }, 10000);

  } catch (error) {
    logger.error('Error in WebSocket example:', error);
  }
}

/**
 * Simulate API usage
 */
async function simulateAPIUsage(port) {
  logger.info('Simulating API usage...');

  try {
    const baseUrl = `http://localhost:${port}`;

    // Health check
    const healthResponse = await fetch(`${baseUrl}/health`);
    const healthData = await healthResponse.json();
    logger.info('Health check response:', healthData);

    // Try to access protected endpoint (should fail without auth)
    const protectedResponse = await fetch(`${baseUrl}/api/v1/monitoring/metrics`);
    logger.info('Protected endpoint status:', protectedResponse.status);

    // Authenticate
    const authResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'admin123'
      })
    });

    if (authResponse.ok) {
      const authData = await authResponse.json();
      logger.info('Authentication successful');

      // Access protected endpoint with token
      const metricsResponse = await fetch(`${baseUrl}/api/v1/monitoring/metrics`, {
        headers: { 'Authorization': `Bearer ${authData.token}` }
      });

      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json();
        logger.info('Metrics retrieved successfully');
      }
    }

  } catch (error) {
    logger.error('Error simulating API usage:', error);
  }
}

/**
 * Simulate System Orchestrator integration
 */
async function simulateOrchestratorIntegration(port) {
  logger.info('Simulating System Orchestrator integration...');

  try {
    const baseUrl = `http://localhost:${port}`;

    // First authenticate
    const authResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'admin123'
      })
    });

    if (!authResponse.ok) {
      logger.error('Authentication failed');
      return;
    }

    const authData = await authResponse.json();
    const token = authData.token;

    // Send workflow command
    const workflowResponse = await fetch(`${baseUrl}/api/v1/orchestrator/workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        workflowId: 'workflow-123',
        command: 'analyze',
        payload: {
          codebase: {
            repository: 'https://github.com/example/repo.git',
            branch: 'main',
            path: 'src/'
          },
          parameters: {
            analysisType: 'full',
            includeTests: true
          }
        },
        priority: 5
      })
    });

    if (workflowResponse.ok) {
      const workflowData = await workflowResponse.json();
      logger.info('Workflow command sent successfully:', workflowData);
    }

  } catch (error) {
    logger.error('Error simulating orchestrator integration:', error);
  }
}

/**
 * Simulate Claude Code integration
 */
async function simulateClaudeCodeIntegration(port) {
  logger.info('Simulating Claude Code integration...');

  try {
    const baseUrl = `http://localhost:${port}`;

    // First authenticate
    const authResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'admin123'
      })
    });

    if (!authResponse.ok) {
      logger.error('Authentication failed');
      return;
    }

    const authData = await authResponse.json();
    const token = authData.token;

    // Send analysis request to Claude Code
    const analysisResponse = await fetch(`${baseUrl}/api/v1/claude-code/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        codebase: {
          repository: 'https://github.com/example/repo.git',
          branch: 'main'
        },
        analysisType: 'security',
        options: {
          depth: 'deep',
          includeTests: true,
          format: 'json'
        }
      })
    });

    if (analysisResponse.ok) {
      const analysisData = await analysisResponse.json();
      logger.info('Claude Code analysis request sent successfully:', analysisData);
    }

    // Check Claude Code status
    const statusResponse = await fetch(`${baseUrl}/api/v1/claude-code/status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      logger.info('Claude Code status:', statusData);
    }

  } catch (error) {
    logger.error('Error simulating Claude Code integration:', error);
  }
}

/**
 * Simulate WebSocket usage
 */
async function simulateWebSocketUsage(port) {
  logger.info('Simulating WebSocket usage...');

  // Note: This is a simplified example. In a real implementation,
  // you would use the 'ws' library to create WebSocket connections.
  
  logger.info(`WebSocket server available at ws://localhost:${port}/ws`);
  logger.info('WebSocket simulation completed (would require ws client library for full demo)');
}

/**
 * Run all examples
 */
async function runAllExamples() {
  logger.info('Running all AgentAPI middleware examples...');

  try {
    await basicExample();
    await new Promise(resolve => setTimeout(resolve, 2000));

    await advancedExample();
    await new Promise(resolve => setTimeout(resolve, 2000));

    await integrationExample();
    await new Promise(resolve => setTimeout(resolve, 2000));

    await webSocketExample();

    logger.info('All examples completed successfully');

  } catch (error) {
    logger.error('Error running examples:', error);
  }
}

// Export examples for use in other modules
export {
  basicExample,
  advancedExample,
  integrationExample,
  webSocketExample,
  runAllExamples
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(error => {
    logger.error('Failed to run examples:', error);
    process.exit(1);
  });
}

