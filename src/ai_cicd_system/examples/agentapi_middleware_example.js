/**
 * @fileoverview AgentAPI Middleware Usage Example
 * @description Demonstrates how to use the AgentAPI middleware components
 */

import { AgentAPIMiddleware } from '../middleware/agent_api_middleware.js';
import { log } from '../utils/simple_logger.js';

/**
 * Basic AgentAPI middleware usage example
 */
export async function basicMiddlewareUsage() {
  console.log('\n🚀 AgentAPI Middleware - Basic Usage Example\n');
  
  try {
    // Initialize middleware with configuration
    const middleware = new AgentAPIMiddleware({
      agentApiUrl: 'http://localhost:8000',
      apiKey: process.env.AGENT_API_KEY || 'demo-key',
      timeout: 60000,
      enableWebSocket: false, // Use HTTP for this example
      maxConcurrentRequests: 5
    });
    
    console.log('📝 Initializing AgentAPI middleware...');
    await middleware.initialize();
    
    // Example task to process
    const sampleTask = {
      id: 'task-demo-001',
      title: 'Create user authentication module',
      description: 'Implement secure user authentication with JWT tokens',
      requirements: [
        'Use bcrypt for password hashing',
        'Implement JWT token generation and validation',
        'Add rate limiting for login attempts',
        'Include comprehensive error handling'
      ],
      acceptanceCriteria: [
        'Users can register with email and password',
        'Users can login and receive JWT token',
        'Protected routes require valid JWT token',
        'Password reset functionality works'
      ],
      complexityScore: 7,
      priority: 'high',
      affectedFiles: [
        'src/auth/auth.controller.js',
        'src/auth/auth.service.js',
        'src/auth/auth.middleware.js',
        'src/models/user.model.js'
      ]
    };
    
    // Processing context
    const context = {
      repository: {
        name: 'demo-app',
        url: 'https://github.com/demo/demo-app',
        branch: 'feature/auth-module'
      },
      project: {
        language: 'javascript',
        framework: 'express',
        buildSystem: 'npm',
        testFramework: 'jest'
      },
      user: {
        id: 'user-123',
        preferences: {
          codeStyle: 'airbnb',
          testingFramework: 'jest'
        }
      }
    };
    
    console.log('🔄 Processing task request...');
    const claudeCodeRequest = await middleware.processTaskRequest(sampleTask, context);
    
    console.log('✅ Task processed successfully!');
    console.log('📋 Claude Code Request:', JSON.stringify(claudeCodeRequest, null, 2));
    
    // Simulate Claude Code response
    const claudeCodeResponse = {
      validationId: claudeCodeRequest.id,
      success: true,
      issues: [],
      suggestions: [
        {
          type: 'improvement',
          severity: 'low',
          message: 'Consider adding input validation middleware',
          file: 'src/auth/auth.controller.js',
          line: 25
        }
      ],
      fixes: [],
      metrics: {
        codeQualityScore: 85,
        testCoverage: 92,
        performanceScore: 88,
        securityScore: 95
      },
      testResults: {
        passed: 24,
        failed: 0,
        total: 24,
        coverage: 92
      },
      modifiedFiles: [
        'src/auth/auth.controller.js',
        'src/auth/auth.service.js',
        'src/auth/auth.middleware.js',
        'src/models/user.model.js',
        'tests/auth/auth.test.js'
      ],
      duration: 15000,
      environment: 'node-18'
    };
    
    console.log('🔄 Processing Claude Code response...');
    const agentUpdate = await middleware.processClaudeCodeResponse(claudeCodeResponse, {
      sessionId: 'session-demo-001'
    });
    
    console.log('✅ Claude Code response processed!');
    console.log('📤 Agent Update:', JSON.stringify(agentUpdate, null, 2));
    
    // Get middleware statistics
    const stats = middleware.getStatistics();
    console.log('📊 Middleware Statistics:', JSON.stringify(stats, null, 2));
    
    // Get health status
    const health = middleware.getHealth();
    console.log('🏥 Health Status:', JSON.stringify(health, null, 2));
    
    // Shutdown middleware
    console.log('🔄 Shutting down middleware...');
    await middleware.shutdown();
    console.log('✅ Middleware shutdown complete');
    
  } catch (error) {
    console.error('❌ Error in basic middleware usage:', error.message);
    console.error(error.stack);
  }
}

/**
 * Advanced middleware usage with WebSocket
 */
export async function advancedMiddlewareUsage() {
  console.log('\n🚀 AgentAPI Middleware - Advanced Usage Example (WebSocket)\n');
  
  try {
    // Initialize middleware with WebSocket enabled
    const middleware = new AgentAPIMiddleware({
      agentApiUrl: 'ws://localhost:8000',
      apiKey: process.env.AGENT_API_KEY || 'demo-key',
      enableWebSocket: true,
      enableStreaming: true,
      heartbeatInterval: 30000,
      reconnectAttempts: 3
    });
    
    console.log('📝 Initializing WebSocket middleware...');
    await middleware.initialize();
    
    // Set up event listeners for real-time updates
    if (middleware.communicationClient.on) {
      middleware.communicationClient.on('connected', () => {
        console.log('🔗 WebSocket connected');
      });
      
      middleware.communicationClient.on('disconnected', () => {
        console.log('🔌 WebSocket disconnected');
      });
      
      middleware.communicationClient.on('notification', (data) => {
        console.log('🔔 Received notification:', data);
      });
    }
    
    // Process multiple tasks concurrently
    const tasks = [
      {
        id: 'task-001',
        title: 'Implement user registration',
        description: 'Create user registration endpoint',
        priority: 'high'
      },
      {
        id: 'task-002',
        title: 'Add email verification',
        description: 'Implement email verification flow',
        priority: 'medium'
      },
      {
        id: 'task-003',
        title: 'Create password reset',
        description: 'Add password reset functionality',
        priority: 'medium'
      }
    ];
    
    console.log('🔄 Processing multiple tasks concurrently...');
    
    const results = await Promise.all(
      tasks.map(task => middleware.processTaskRequest(task, {
        repository: { name: 'demo-app', branch: 'main' },
        project: { language: 'javascript', framework: 'express' }
      }))
    );
    
    console.log(`✅ Processed ${results.length} tasks successfully`);
    
    // Monitor middleware performance
    setInterval(() => {
      const stats = middleware.getStatistics();
      console.log(`📊 Active requests: ${stats.active_requests}, Success rate: ${stats.success_rate.toFixed(2)}%`);
    }, 5000);
    
    // Keep running for demonstration
    console.log('🔄 Middleware running... (Press Ctrl+C to stop)');
    
    // Graceful shutdown on process termination
    process.on('SIGINT', async () => {
      console.log('\n🔄 Gracefully shutting down...');
      await middleware.shutdown();
      console.log('✅ Shutdown complete');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error in advanced middleware usage:', error.message);
    console.error(error.stack);
  }
}

/**
 * Protocol transformation example
 */
export async function protocolTransformationExample() {
  console.log('\n🚀 Protocol Transformation Example\n');
  
  try {
    const { UnifiedProtocol } = await import('../protocols/unified_protocol.js');
    
    const protocol = new UnifiedProtocol();
    
    // Example AgentAPI message
    const agentApiMessage = {
      type: 'code_generation_request',
      id: 'req-123',
      session_id: 'session-456',
      payload: {
        task: {
          id: 'task-789',
          title: 'Create API endpoint',
          description: 'Implement REST API endpoint for user management'
        },
        context: {
          repository: { name: 'api-service', branch: 'main' },
          project: { language: 'javascript', framework: 'express' }
        }
      },
      metadata: {
        source: 'claude-task-master',
        timestamp: new Date().toISOString()
      }
    };
    
    console.log('📝 Original AgentAPI message:');
    console.log(JSON.stringify(agentApiMessage, null, 2));
    
    // Transform to Claude Code format
    console.log('\n🔄 Transforming AgentAPI → Claude Code...');
    const claudeCodeMessage = await protocol.transformMessage(
      agentApiMessage,
      'agentapi',
      'claude_code',
      { requestId: 'transform-123' }
    );
    
    console.log('✅ Transformed Claude Code message:');
    console.log(JSON.stringify(claudeCodeMessage, null, 2));
    
    // Example Claude Code response
    const claudeCodeResponse = {
      type: 'validation_response',
      id: 'validation-456',
      status: 'success',
      success: true,
      issues: [],
      suggestions: [
        {
          type: 'optimization',
          message: 'Consider using async/await for better readability',
          severity: 'low'
        }
      ],
      metrics: {
        codeQualityScore: 90,
        testCoverage: 85
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('\n📝 Claude Code response:');
    console.log(JSON.stringify(claudeCodeResponse, null, 2));
    
    // Transform back to AgentAPI format
    console.log('\n🔄 Transforming Claude Code → AgentAPI...');
    const agentApiUpdate = await protocol.transformMessage(
      claudeCodeResponse,
      'claude_code',
      'agentapi',
      { sessionId: 'session-456' }
    );
    
    console.log('✅ Transformed AgentAPI update:');
    console.log(JSON.stringify(agentApiUpdate, null, 2));
    
    // Get protocol statistics
    const stats = protocol.getStatistics();
    console.log('\n📊 Protocol Statistics:');
    console.log(JSON.stringify(stats, null, 2));
    
  } catch (error) {
    console.error('❌ Error in protocol transformation:', error.message);
    console.error(error.stack);
  }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log('🎯 AgentAPI Middleware Examples\n');
  
  await basicMiddlewareUsage();
  await protocolTransformationExample();
  
  // Note: Advanced example runs indefinitely, so we skip it in the batch run
  console.log('\n💡 To run the advanced WebSocket example, call advancedMiddlewareUsage() separately');
  
  console.log('\n✅ All examples completed!');
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}

