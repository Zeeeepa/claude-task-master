/**
 * AgentAPI Example Usage
 * Demonstrates how to use the AgentAPI middleware components
 */

import { AgentAPIServer, AgentAPIClient } from './index.js';
import { mergeConfig, validateConfig } from './config.js';

/**
 * Example: Starting the AgentAPI Server
 */
export async function startServerExample() {
  console.log('🚀 Starting AgentAPI Server Example...');
  
  // Custom configuration
  const customConfig = {
    server: {
      port: 3284,
      host: 'localhost'
    },
    claude: {
      baseURL: 'http://localhost:8080',
      timeout: 30000
    },
    processor: {
      concurrency: 3,
      batchSize: 5
    }
  };
  
  // Merge with defaults and environment
  const config = mergeConfig(customConfig);
  
  // Validate configuration
  const validation = validateConfig(config);
  if (!validation.isValid) {
    console.error('❌ Configuration validation failed:', validation.errors);
    return;
  }
  
  // Create and start server
  const server = new AgentAPIServer(config);
  
  // Setup event listeners
  server.on('message', (data) => {
    console.log('📨 Message event:', data.type, data.messageId);
  });
  
  server.on('response', (data) => {
    console.log('📤 Response event:', data.type, data.messageId);
  });
  
  server.on('error', (data) => {
    console.error('❌ Error event:', data.type, data.error);
  });
  
  try {
    await server.start();
    console.log('✅ AgentAPI Server started successfully');
    
    // Example: Send a test message after server starts
    setTimeout(async () => {
      await sendMessageExample();
    }, 2000);
    
    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    throw error;
  }
}

/**
 * Example: Using the AgentAPI Client
 */
export async function clientExample() {
  console.log('🔌 AgentAPI Client Example...');
  
  const client = new AgentAPIClient({
    baseURL: 'http://localhost:3284',
    timeout: 30000,
    retryAttempts: 3
  });
  
  // Setup event listeners
  client.on('health_check', (data) => {
    console.log('💓 Health check:', data.status);
  });
  
  client.on('request_success', (data) => {
    console.log('✅ Request success:', data.method, data.url);
  });
  
  client.on('request_failed', (data) => {
    console.error('❌ Request failed:', data.method, data.url, data.error);
  });
  
  try {
    // Test connection
    const healthCheck = await client.testConnection();
    console.log('🏥 Connection test:', healthCheck);
    
    // Create a session
    const session = await client.createSession({
      source: 'example',
      user: 'demo_user'
    });
    console.log('🆔 Created session:', session.session.id);
    
    // Send a message
    const messageResponse = await client.sendMessage(
      'Hello, Claude! This is a test message from the AgentAPI.',
      session.session.id,
      { priority: 'normal' }
    );
    console.log('📨 Message sent:', messageResponse.messageId);
    
    // Get messages
    const messages = await client.getMessages(session.session.id);
    console.log('📋 Retrieved messages:', messages.messages.length);
    
    // Get status
    const status = await client.getStatus();
    console.log('📊 Agent status:', status.status);
    
    // Create a task
    const task = await client.createTask(
      'Example Task',
      'This is an example task created via AgentAPI',
      { priority: 'normal' }
    );
    console.log('📝 Created task:', task.task.id);
    
    // End session
    await client.endSession(session.session.id);
    console.log('🔚 Session ended');
    
    return client;
  } catch (error) {
    console.error('❌ Client example failed:', error);
    throw error;
  }
}

/**
 * Example: Send message using HTTP directly
 */
export async function sendMessageExample() {
  console.log('📨 Direct HTTP Message Example...');
  
  try {
    const response = await fetch('http://localhost:3284/api/agents/claude/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Hello from direct HTTP call!',
        priority: 'high'
      })
    });
    
    const result = await response.json();
    console.log('📤 HTTP response:', result);
    
    return result;
  } catch (error) {
    console.error('❌ HTTP message failed:', error);
    throw error;
  }
}

/**
 * Example: WebSocket connection
 */
export async function websocketExample() {
  console.log('🔌 WebSocket Example...');
  
  const client = new AgentAPIClient({
    baseURL: 'http://localhost:3284'
  });
  
  // Create WebSocket connection
  const ws = client.createWebSocket();
  
  ws.onopen = () => {
    console.log('🔗 WebSocket connected');
    
    // Send a ping
    ws.send(JSON.stringify({ type: 'ping' }));
    
    // Subscribe to events
    ws.send(JSON.stringify({
      type: 'subscribe',
      events: ['message', 'response', 'error']
    }));
    
    // Send a message through WebSocket
    ws.send(JSON.stringify({
      type: 'message',
      content: 'Hello via WebSocket!',
      priority: 'normal'
    }));
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('📨 WebSocket message:', data);
  };
  
  ws.onerror = (error) => {
    console.error('❌ WebSocket error:', error);
  };
  
  ws.onclose = () => {
    console.log('🔚 WebSocket disconnected');
  };
  
  return ws;
}

/**
 * Example: Server-Sent Events
 */
export async function sseExample() {
  console.log('📡 Server-Sent Events Example...');
  
  const client = new AgentAPIClient({
    baseURL: 'http://localhost:3284'
  });
  
  const eventSource = client.subscribeToEvents(
    null, // No specific session
    (event) => {
      console.log('📡 SSE Event:', event);
    },
    (error) => {
      console.error('❌ SSE Error:', error);
    }
  );
  
  // Close after 30 seconds
  setTimeout(() => {
    eventSource.close();
    console.log('🔚 SSE connection closed');
  }, 30000);
  
  return eventSource;
}

/**
 * Example: Complete workflow
 */
export async function completeWorkflowExample() {
  console.log('🔄 Complete Workflow Example...');
  
  try {
    // 1. Start server
    const server = await startServerExample();
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 2. Create client and test basic operations
    const client = await clientExample();
    
    // 3. Test WebSocket
    const ws = await websocketExample();
    
    // 4. Test Server-Sent Events
    const sse = await sseExample();
    
    console.log('✅ Complete workflow example finished successfully');
    
    // Cleanup after 60 seconds
    setTimeout(async () => {
      console.log('🧹 Cleaning up...');
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      
      if (sse) {
        sse.close();
      }
      
      if (client) {
        client.destroy();
      }
      
      if (server) {
        await server.stop();
      }
      
      console.log('✅ Cleanup completed');
    }, 60000);
    
    return { server, client, ws, sse };
  } catch (error) {
    console.error('❌ Complete workflow example failed:', error);
    throw error;
  }
}

// Export for use in other modules
export default {
  startServerExample,
  clientExample,
  sendMessageExample,
  websocketExample,
  sseExample,
  completeWorkflowExample
};

// Run example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🎯 Running AgentAPI Examples...');
  
  completeWorkflowExample()
    .then(() => {
      console.log('🎉 All examples completed successfully!');
    })
    .catch((error) => {
      console.error('💥 Examples failed:', error);
      process.exit(1);
    });
}

