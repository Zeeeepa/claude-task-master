/**
 * AgentAPI Middleware Tests
 * Basic tests to verify component functionality
 */

import { AgentAPIServer, AgentAPIClient, MessageQueue, SessionManager } from './index.js';
import { mergeConfig, validateConfig } from './config.js';

/**
 * Test configuration validation
 */
async function testConfigValidation() {
  console.log('🧪 Testing configuration validation...');
  
  // Test valid config
  const validConfig = mergeConfig({
    server: { port: 3284 },
    claude: { baseURL: 'http://localhost:8080' }
  });
  
  const validResult = validateConfig(validConfig);
  console.assert(validResult.isValid, 'Valid config should pass validation');
  
  // Test invalid config
  const invalidConfig = mergeConfig({
    server: { port: -1 },
    claude: { baseURL: '', timeout: 500 }
  });
  
  const invalidResult = validateConfig(invalidConfig);
  console.assert(!invalidResult.isValid, 'Invalid config should fail validation');
  console.assert(invalidResult.errors.length > 0, 'Should have validation errors');
  
  console.log('✅ Configuration validation tests passed');
}

/**
 * Test message queue functionality
 */
async function testMessageQueue() {
  console.log('🧪 Testing message queue...');
  
  const queue = new MessageQueue({
    maxSize: 100,
    maxRetries: 2
  });
  
  // Test enqueue
  const message1 = { id: 'msg1', content: 'Test message 1' };
  const message2 = { id: 'msg2', content: 'Test message 2' };
  
  await queue.enqueue(message1, 1); // High priority
  await queue.enqueue(message2, 3); // Normal priority
  
  console.assert(queue.size() === 2, 'Queue should have 2 messages');
  
  // Test dequeue (should get high priority first)
  const dequeued1 = await queue.dequeue();
  console.assert(dequeued1.message.id === 'msg1', 'Should dequeue high priority message first');
  
  const dequeued2 = await queue.dequeue();
  console.assert(dequeued2.message.id === 'msg2', 'Should dequeue normal priority message second');
  
  console.assert(queue.size() === 0, 'Queue should be empty after dequeuing all messages');
  
  // Test mark processed
  await queue.markProcessed(dequeued1.id, { success: true });
  await queue.markProcessed(dequeued2.id, { success: true });
  
  const stats = queue.getStats();
  console.assert(stats.current.processing === 0, 'No messages should be processing');
  
  queue.destroy();
  console.log('✅ Message queue tests passed');
}

/**
 * Test session manager functionality
 */
async function testSessionManager() {
  console.log('🧪 Testing session manager...');
  
  const sessionManager = new SessionManager({
    defaultTimeout: 5000, // 5 seconds for testing
    maxSessions: 10
  });
  
  // Test create session
  const session1 = await sessionManager.createSession({
    source: 'test',
    user: 'test_user'
  });
  
  console.assert(session1.id, 'Session should have an ID');
  console.assert(session1.status === 'active', 'Session should be active');
  
  // Test get session
  const retrievedSession = await sessionManager.getSession(session1.id);
  console.assert(retrievedSession.id === session1.id, 'Retrieved session should match created session');
  
  // Test update session
  const updatedSession = await sessionManager.updateSession(session1.id, {
    metadata: { updated: true }
  });
  console.assert(updatedSession.metadata.updated === true, 'Session should be updated');
  
  // Test session stats
  const stats = sessionManager.getStats();
  console.assert(stats.active === 1, 'Should have 1 active session');
  
  // Test end session
  await sessionManager.endSession(session1.id);
  const statsAfterEnd = sessionManager.getStats();
  console.assert(statsAfterEnd.active === 0, 'Should have 0 active sessions after ending');
  
  sessionManager.destroy();
  console.log('✅ Session manager tests passed');
}

/**
 * Test server startup and basic endpoints
 */
async function testServerBasics() {
  console.log('🧪 Testing server basics...');
  
  const config = mergeConfig({
    server: { port: 3285 }, // Use different port for testing
    claude: { baseURL: 'http://localhost:8080' }
  });
  
  const server = new AgentAPIServer(config);
  
  try {
    await server.start();
    console.log('✅ Server started successfully');
    
    // Test health endpoint
    const response = await fetch('http://localhost:3285/health');
    const healthData = await response.json();
    
    console.assert(response.ok, 'Health endpoint should return 200');
    console.assert(healthData.status === 'healthy', 'Health status should be healthy');
    
    // Test API docs endpoint
    const docsResponse = await fetch('http://localhost:3285/api/docs');
    const docsData = await docsResponse.json();
    
    console.assert(docsResponse.ok, 'Docs endpoint should return 200');
    console.assert(docsData.title, 'Docs should have a title');
    
    await server.stop();
    console.log('✅ Server basic tests passed');
  } catch (error) {
    console.error('❌ Server test failed:', error);
    await server.stop();
    throw error;
  }
}

/**
 * Test client basic functionality
 */
async function testClientBasics() {
  console.log('🧪 Testing client basics...');
  
  const client = new AgentAPIClient({
    baseURL: 'http://localhost:3285',
    timeout: 5000,
    retryAttempts: 1
  });
  
  // Test connection stats
  const stats = client.getStats();
  console.assert(stats.connection.baseURL === 'http://localhost:3285', 'Client should have correct base URL');
  console.assert(stats.requests.total === 0, 'Should start with 0 requests');
  
  // Test config update
  client.updateConfig({ timeout: 10000 });
  console.assert(client.timeout === 10000, 'Timeout should be updated');
  
  client.destroy();
  console.log('✅ Client basic tests passed');
}

/**
 * Test error handling
 */
async function testErrorHandling() {
  console.log('🧪 Testing error handling...');
  
  const queue = new MessageQueue({ maxSize: 1 });
  
  // Test queue overflow
  await queue.enqueue({ id: 'msg1', content: 'Message 1' });
  
  try {
    await queue.enqueue({ id: 'msg2', content: 'Message 2' });
    console.assert(false, 'Should throw error when queue is full');
  } catch (error) {
    console.assert(error.message.includes('full'), 'Should get queue full error');
  }
  
  queue.destroy();
  
  // Test invalid session manager operations
  const sessionManager = new SessionManager();
  
  try {
    await sessionManager.getSession('nonexistent');
    // Should return null, not throw
    console.log('✅ Non-existent session handled correctly');
  } catch (error) {
    console.assert(false, 'Getting non-existent session should not throw');
  }
  
  try {
    await sessionManager.endSession('nonexistent');
    console.assert(false, 'Should throw error when ending non-existent session');
  } catch (error) {
    console.assert(error.message.includes('not found'), 'Should get not found error');
  }
  
  sessionManager.destroy();
  console.log('✅ Error handling tests passed');
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🎯 Running AgentAPI Middleware Tests...\n');
  
  try {
    await testConfigValidation();
    await testMessageQueue();
    await testSessionManager();
    await testServerBasics();
    await testClientBasics();
    await testErrorHandling();
    
    console.log('\n🎉 All tests passed successfully!');
    return true;
  } catch (error) {
    console.error('\n💥 Tests failed:', error);
    return false;
  }
}

// Export for use in other modules
export {
  testConfigValidation,
  testMessageQueue,
  testSessionManager,
  testServerBasics,
  testClientBasics,
  testErrorHandling,
  runAllTests
};

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

