#!/usr/bin/env node

/**
 * API Gateway Demo Script
 * 
 * Demonstrates the core functionality of the API Gateway:
 * - Authentication flows
 * - Authorization checks
 * - Rate limiting
 * - Request proxying
 * - Circuit breaker patterns
 */

import { createAPIGateway, MockImplementations } from './index.js';

class GatewayDemo {
  constructor() {
    this.gateway = null;
    this.authService = null;
    this.tokens = {};
  }

  /**
   * Run the complete demo
   */
  async runDemo() {
    console.log('🚀 API Gateway Demo Starting...\n');

    try {
      await this.setupGateway();
      await this.demonstrateAuthentication();
      await this.demonstrateAuthorization();
      await this.demonstrateRateLimiting();
      await this.demonstrateRequestProxying();
      await this.demonstrateCircuitBreaker();
      await this.demonstrateHealthCheck();
      await this.cleanup();

      console.log('✅ Demo completed successfully!');
    } catch (error) {
      console.error('❌ Demo failed:', error);
    }
  }

  /**
   * Setup the gateway for demo
   */
  async setupGateway() {
    console.log('🔧 Setting up API Gateway...');

    const { gateway, authService } = MockImplementations.createMockGateway();
    this.gateway = gateway;
    this.authService = authService;

    // Start gateway on demo port
    this.gateway.options.port = 3002;
    await this.gateway.start();

    console.log('✅ Gateway running on port 3002\n');
  }

  /**
   * Demonstrate authentication flows
   */
  async demonstrateAuthentication() {
    console.log('🔐 Demonstrating Authentication Flows...');

    // 1. Password Authentication
    console.log('  📧 Password Authentication:');
    const passwordAuth = await this.authService.authenticate({
      type: 'password',
      email: 'user@example.com',
      password: 'password123'
    });

    if (passwordAuth.success) {
      this.tokens.user = passwordAuth.access_token;
      console.log(`    ✅ User authenticated: ${passwordAuth.user_id}`);
      console.log(`    🎫 Access token: ${passwordAuth.access_token.substring(0, 20)}...`);
    } else {
      console.log(`    ❌ Authentication failed: ${passwordAuth.message}`);
    }

    // 2. API Key Authentication
    console.log('  🔑 API Key Authentication:');
    const apiKeyAuth = await this.authService.authenticate({
      type: 'api_key',
      api_key: 'ak_1234567890abcdef'
    });

    if (apiKeyAuth.success) {
      console.log(`    ✅ API key authenticated: ${apiKeyAuth.user_id}`);
    } else {
      console.log(`    ❌ API key authentication failed: ${apiKeyAuth.message}`);
    }

    // 3. Service Token Authentication
    console.log('  🤖 Service Token Authentication:');
    const serviceAuth = await this.authService.authenticate({
      type: 'service_token',
      service_token: 'st_ai_agent_1_secret',
      service_id: 'ai-agent-1'
    });

    if (serviceAuth.success) {
      this.tokens.service = serviceAuth.access_token;
      console.log(`    ✅ Service authenticated: ${serviceAuth.service_id}`);
    } else {
      console.log(`    ❌ Service authentication failed: ${serviceAuth.message}`);
    }

    // 4. Token Validation
    console.log('  🎫 Token Validation:');
    const validation = await this.authService.validateToken(this.tokens.user);
    if (validation.valid) {
      console.log(`    ✅ Token valid for user: ${validation.user_id}`);
      console.log(`    📅 Expires at: ${validation.expires_at}`);
    } else {
      console.log(`    ❌ Token validation failed: ${validation.message}`);
    }

    // 5. Token Refresh
    console.log('  🔄 Token Refresh:');
    try {
      const refreshResult = await this.authService.refreshToken(passwordAuth.refresh_token);
      console.log(`    ✅ Token refreshed successfully`);
      console.log(`    🎫 New access token: ${refreshResult.access_token.substring(0, 20)}...`);
    } catch (error) {
      console.log(`    ❌ Token refresh failed: ${error.message}`);
    }

    console.log('');
  }

  /**
   * Demonstrate authorization and permissions
   */
  async demonstrateAuthorization() {
    console.log('🛡️ Demonstrating Authorization and Permissions...');

    // Check user permissions
    console.log('  👤 User Permissions:');
    const userCanRead = await this.authService.checkPermission('user_123', 'tasks', 'read');
    const userCanDelete = await this.authService.checkPermission('user_123', 'admin', 'delete');
    
    console.log(`    📖 Can read tasks: ${userCanRead ? '✅' : '❌'}`);
    console.log(`    🗑️ Can delete admin: ${userCanDelete ? '✅' : '❌'}`);

    // Check admin permissions
    console.log('  👑 Admin Permissions:');
    const adminCanDoAnything = await this.authService.checkPermission('admin_456', 'anything', 'everything');
    console.log(`    🌟 Can do anything: ${adminCanDoAnything ? '✅' : '❌'}`);

    // Check non-existent user
    console.log('  👻 Non-existent User:');
    const ghostCanRead = await this.authService.checkPermission('ghost_user', 'tasks', 'read');
    console.log(`    📖 Ghost can read: ${ghostCanRead ? '✅' : '❌'}`);

    console.log('');
  }

  /**
   * Demonstrate rate limiting
   */
  async demonstrateRateLimiting() {
    console.log('⏱️ Demonstrating Rate Limiting...');

    const userId = 'demo_user';
    const endpoint = '/api/demo';

    console.log('  📊 Making requests to test rate limiting...');

    // Make several requests
    for (let i = 1; i <= 5; i++) {
      const result = await this.gateway.rateLimitCheck(userId, endpoint);
      console.log(`    Request ${i}: ${result.allowed ? '✅ Allowed' : '❌ Rate Limited'} (${result.remaining} remaining)`);
      
      if (!result.allowed) {
        console.log(`    ⏰ Retry after: ${result.retry_after} seconds`);
        break;
      }
    }

    // Test different user (should have separate limit)
    console.log('  👥 Testing user isolation...');
    const otherUserResult = await this.gateway.rateLimitCheck('other_user', endpoint);
    console.log(`    Other user request: ${otherUserResult.allowed ? '✅ Allowed' : '❌ Rate Limited'}`);

    console.log('');
  }

  /**
   * Demonstrate request proxying
   */
  async demonstrateRequestProxying() {
    console.log('🌐 Demonstrating Request Proxying...');

    // Test authenticated request
    console.log('  🔐 Authenticated Request:');
    const authRequest = {
      method: 'GET',
      path: '/api/v1/mock/test',
      headers: {
        'authorization': `Bearer ${this.tokens.user}`,
        'content-type': 'application/json'
      },
      query: { demo: 'true' },
      body: null,
      user_id: 'user_123'
    };

    const authResponse = await this.gateway.proxyRequest(authRequest);
    console.log(`    📡 Response status: ${authResponse.status_code}`);
    console.log(`    ⏱️ Response time: ${authResponse.response_time}ms`);
    console.log(`    📝 Response: ${JSON.stringify(authResponse.body).substring(0, 100)}...`);

    // Test unauthenticated request
    console.log('  🚫 Unauthenticated Request:');
    const unauthRequest = {
      method: 'GET',
      path: '/api/v1/protected',
      headers: { 'content-type': 'application/json' },
      query: {},
      body: null
    };

    const unauthResponse = await this.gateway.proxyRequest(unauthRequest);
    console.log(`    📡 Response status: ${unauthResponse.status_code}`);
    console.log(`    📝 Response: ${JSON.stringify(unauthResponse.body)}`);

    console.log('');
  }

  /**
   * Demonstrate circuit breaker patterns
   */
  async demonstrateCircuitBreaker() {
    console.log('⚡ Demonstrating Circuit Breaker Patterns...');

    // Simulate service failures
    console.log('  🔥 Simulating service failures...');
    
    for (let i = 1; i <= 3; i++) {
      await this.gateway._recordCircuitBreakerFailure('demo-service');
      console.log(`    Failure ${i} recorded for demo-service`);
    }

    // Check circuit state
    const circuitState = await this.gateway._checkCircuitBreaker('demo-service');
    console.log(`    🔌 Circuit state: ${circuitState}`);

    // Simulate recovery
    console.log('  🔄 Simulating service recovery...');
    await this.gateway._recordCircuitBreakerSuccess('demo-service');
    console.log(`    ✅ Success recorded for demo-service`);

    console.log('');
  }

  /**
   * Demonstrate health check
   */
  async demonstrateHealthCheck() {
    console.log('❤️ Demonstrating Health Check...');

    const health = this.gateway.getHealthStatus();
    
    console.log(`  🏥 Gateway status: ${health.status}`);
    console.log(`  ⏰ Uptime: ${health.uptime.toFixed(1)} seconds`);
    console.log(`  📊 Services:`);
    
    for (const [serviceId, serviceHealth] of Object.entries(health.services)) {
      console.log(`    ${serviceId}: ${serviceHealth.status} (${serviceHealth.response_time.toFixed(1)}ms)`);
    }

    console.log('');
  }

  /**
   * Cleanup demo resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up demo resources...');
    
    if (this.gateway) {
      await this.gateway.stop();
    }
    
    console.log('✅ Cleanup completed\n');
  }
}

/**
 * Interactive demo menu
 */
async function runInteractiveDemo() {
  console.log('🎮 Interactive API Gateway Demo');
  console.log('================================\n');

  const demo = new GatewayDemo();
  await demo.setupGateway();

  const samples = MockImplementations.getSampleRequests();

  console.log('Available demo scenarios:');
  console.log('1. Authentication flows');
  console.log('2. Authorization checks');
  console.log('3. Rate limiting');
  console.log('4. Request proxying');
  console.log('5. Circuit breakers');
  console.log('6. Health check');
  console.log('7. Run all scenarios');
  console.log('8. Show sample requests');
  console.log('0. Exit\n');

  // For demo purposes, just run all scenarios
  console.log('Running all scenarios...\n');
  await demo.runDemo();
}

/**
 * Performance demo
 */
async function runPerformanceDemo() {
  console.log('⚡ Performance Demo');
  console.log('==================\n');

  const { gateway, authService } = MockImplementations.createMockGateway();
  
  // Start gateway
  gateway.options.port = 3003;
  await gateway.start();

  const { GatewayBenchmarks } = await import('./test-gateway.js');
  const benchmarks = new GatewayBenchmarks(gateway, authService);
  
  await benchmarks.runBenchmarks();
  
  await gateway.stop();
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--performance')) {
    await runPerformanceDemo();
  } else if (args.includes('--interactive')) {
    await runInteractiveDemo();
  } else {
    // Run standard demo
    const demo = new GatewayDemo();
    await demo.runDemo();
  }
}

export default GatewayDemo;

