/**
 * AgentAPI Middleware Usage Example
 * 
 * This example demonstrates how to use the AgentAPI middleware
 * for deployment orchestration and validation.
 */

const AgentAPIMiddlewareServer = require('./middleware_server');

async function runExample() {
  console.log('🚀 Starting AgentAPI Middleware Example...\n');

  // Configuration for the middleware
  const config = {
    server: {
      host: 'localhost',
      port: 3001,
      cors: { origin: ['http://localhost:3000'] }
    },
    wsl2: {
      maxInstances: 3,
      resourceLimits: {
        memory: '2GB',
        cpu: '2 cores',
        disk: '10GB'
      },
      timeout: 300000 // 5 minutes
    },
    claudeCode: {
      apiUrl: 'http://localhost:3002',
      timeout: 180000, // 3 minutes
      retryAttempts: 3
    },
    database: {
      connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/ai_cicd'
    },
    orchestrator: {
      apiUrl: 'http://localhost:3000',
      timeout: 30000
    }
  };

  try {
    // Create and start the middleware server
    console.log('📡 Creating AgentAPI Middleware Server...');
    const server = new AgentAPIMiddlewareServer(config);

    // Start the server
    console.log('🔧 Starting server...');
    await server.start();

    console.log('✅ AgentAPI Middleware Server started successfully!');
    console.log(`🌐 Server running on http://${config.server.host}:${config.server.port}`);
    console.log(`📚 API Documentation: http://${config.server.host}:${config.server.port}/api/docs`);
    console.log(`💓 Health Check: http://${config.server.host}:${config.server.port}/health`);

    // Example deployment request
    const exampleDeployment = {
      repositoryUrl: 'https://github.com/example/test-repo.git',
      prBranch: 'feature/example-feature',
      validationTasks: [
        {
          type: 'code_analysis',
          scope: 'changed_files',
          focus: ['bugs', 'performance', 'security']
        },
        {
          type: 'test_execution',
          command: 'npm test',
          timeout: 120000
        },
        {
          type: 'lint_check',
          command: 'npm run lint',
          options: { stopOnError: false }
        },
        {
          type: 'build_verification',
          command: 'npm run build',
          timeout: 300000
        }
      ],
      gitConfig: {
        name: 'AgentAPI Bot',
        email: 'agentapi@example.com'
      },
      metadata: {
        requestedBy: 'example_user',
        priority: 'normal',
        tags: ['example', 'demo']
      }
    };

    console.log('\n📋 Example Deployment Request:');
    console.log(JSON.stringify(exampleDeployment, null, 2));

    // Demonstrate API usage
    console.log('\n🔗 API Usage Examples:');
    console.log('');
    console.log('Start Deployment:');
    console.log(`curl -X POST http://${config.server.host}:${config.server.port}/api/deployment/start \\`);
    console.log('  -H "Content-Type: application/json" \\');
    console.log(`  -d '${JSON.stringify(exampleDeployment)}'`);
    console.log('');
    console.log('Get Deployment Status:');
    console.log(`curl http://${config.server.host}:${config.server.port}/api/deployment/{deployment-id}`);
    console.log('');
    console.log('List All Deployments:');
    console.log(`curl http://${config.server.host}:${config.server.port}/api/deployment`);
    console.log('');
    console.log('Get System Status:');
    console.log(`curl http://${config.server.host}:${config.server.port}/api/status`);

    // WebSocket example
    console.log('\n🔌 WebSocket Usage Example:');
    console.log('```javascript');
    console.log(`const socket = io('http://${config.server.host}:${config.server.port}');`);
    console.log('');
    console.log('// Join deployment room for real-time updates');
    console.log('socket.emit("join-deployment", deploymentId);');
    console.log('');
    console.log('// Listen for deployment events');
    console.log('socket.on("deploymentStarted", (data) => {');
    console.log('  console.log("Deployment started:", data.deploymentId);');
    console.log('});');
    console.log('');
    console.log('socket.on("deploymentCompleted", (data) => {');
    console.log('  console.log("Deployment completed:", data.deploymentId);');
    console.log('});');
    console.log('```');

    // Webhook example
    console.log('\n🪝 Webhook Integration Example:');
    console.log('GitHub Webhook URL:');
    console.log(`http://${config.server.host}:${config.server.port}/api/webhook/github`);
    console.log('');
    console.log('Linear Webhook URL:');
    console.log(`http://${config.server.host}:${config.server.port}/api/webhook/linear`);

    // Keep the server running
    console.log('\n⏳ Server is running... Press Ctrl+C to stop');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down gracefully...');
      await server.gracefulShutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Shutting down gracefully...');
      await server.gracefulShutdown();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start AgentAPI Middleware:', error.message);
    process.exit(1);
  }
}

// Example client usage
async function exampleClientUsage() {
  console.log('\n📱 Client Usage Example:');
  
  const axios = require('axios');
  const baseURL = 'http://localhost:3001';

  try {
    // Check health
    console.log('🏥 Checking server health...');
    const healthResponse = await axios.get(`${baseURL}/health`);
    console.log('Health Status:', healthResponse.data.status);

    // Get system status
    console.log('\n📊 Getting system status...');
    const statusResponse = await axios.get(`${baseURL}/api/status`);
    console.log('System Status:', statusResponse.data.status);
    console.log('Components:', Object.keys(statusResponse.data.components));

    // Example deployment (commented out to avoid actual deployment)
    /*
    console.log('\n🚀 Starting example deployment...');
    const deploymentResponse = await axios.post(`${baseURL}/api/deployment/start`, {
      repositoryUrl: 'https://github.com/example/test-repo.git',
      prBranch: 'feature/example',
      validationTasks: [
        { type: 'code_analysis', scope: 'changed_files' }
      ]
    });
    console.log('Deployment ID:', deploymentResponse.data.deploymentId);
    */

  } catch (error) {
    console.error('Client Error:', error.message);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runExample().catch(console.error);
}

module.exports = {
  runExample,
  exampleClientUsage
};

