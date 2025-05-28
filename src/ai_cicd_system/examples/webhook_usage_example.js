/**
 * @fileoverview Webhook Usage Examples
 * @description Examples demonstrating how to use the GitHub webhook integration system
 */

import express from 'express';
import { GitHubWebhookHandler } from '../webhooks/github_webhook_handler.js';
import { createWebhookRouter } from '../api/webhook_endpoints.js';
import { WEBHOOK_CONFIG } from '../config/webhook_config.js';
import { log } from '../../scripts/modules/utils.js';

/**
 * Basic webhook server setup
 */
export async function basicWebhookServer() {
    console.log('🚀 Starting basic webhook server...');

    const app = express();
    app.use(express.json());

    // Create webhook router with basic configuration
    const webhookRouter = createWebhookRouter({
        secret: process.env.GITHUB_WEBHOOK_SECRET || 'your-webhook-secret',
        database: {
            enable_mock: true // Use mock storage for demo
        },
        middleware: {
            rateLimit: {
                max_requests: 100,
                window_ms: 60000
            }
        }
    });

    // Mount webhook routes
    app.use('/api/webhooks', webhookRouter);

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`✅ Webhook server running on port ${port}`);
        console.log(`📡 Webhook endpoint: http://localhost:${port}/api/webhooks/github`);
        console.log(`🏥 Health check: http://localhost:${port}/api/webhooks/health`);
    });

    return app;
}

/**
 * Advanced webhook server with custom event processing
 */
export async function advancedWebhookServer() {
    console.log('🚀 Starting advanced webhook server...');

    const app = express();
    app.use(express.json());

    // Custom event processor configuration
    const customConfig = {
        secret: process.env.GITHUB_WEBHOOK_SECRET,
        database: {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'codegen-taskmaster-db',
            username: process.env.DB_USER || 'software_developer',
            password: process.env.DB_PASSWORD || 'password'
        },
        github: {
            token: process.env.GITHUB_TOKEN,
            timeout: 30000,
            retries: 3
        },
        middleware: {
            rateLimit: {
                max_requests: 1000,
                window_ms: 60000
            },
            timeout: {
                timeout: 45000
            }
        }
    };

    // Create webhook router with custom configuration
    const webhookRouter = createWebhookRouter(customConfig);
    app.use('/api/webhooks', webhookRouter);

    // Custom middleware for additional logging
    app.use((req, res, next) => {
        if (req.path.startsWith('/api/webhooks/github')) {
            console.log(`📥 Webhook received: ${req.headers['x-github-event']} from ${req.headers['x-github-delivery']}`);
        }
        next();
    });

    // Additional monitoring endpoints
    app.get('/metrics', async (req, res) => {
        try {
            const response = await fetch(`http://localhost:${port}/api/webhooks/metrics`);
            const metrics = await response.json();
            res.json(metrics);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch metrics' });
        }
    });

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`✅ Advanced webhook server running on port ${port}`);
        console.log(`📊 Metrics endpoint: http://localhost:${port}/metrics`);
    });

    return app;
}

/**
 * Standalone webhook handler usage
 */
export async function standaloneWebhookHandler() {
    console.log('🔧 Demonstrating standalone webhook handler...');

    // Create webhook handler
    const handler = new GitHubWebhookHandler({
        secret: 'demo-secret-12345',
        database: { enable_mock: true },
        github: { timeout: 5000, retries: 1 }
    });

    // Initialize handler
    await handler.initialize();
    console.log('✅ Webhook handler initialized');

    // Simulate webhook request
    const mockRequest = {
        headers: {
            'x-github-event': 'pull_request',
            'x-github-delivery': 'demo-delivery-123',
            'x-hub-signature-256': 'sha256=mock-signature',
            'user-agent': 'GitHub-Hookshot/demo'
        },
        body: {
            action: 'opened',
            pull_request: {
                id: 123,
                number: 1,
                title: 'Demo Pull Request',
                head: { ref: 'feature-branch', sha: 'abc123' },
                base: { ref: 'main', sha: 'def456' }
            },
            repository: {
                id: 456,
                full_name: 'demo/repository',
                owner: { login: 'demo' }
            },
            sender: { login: 'demo-user' }
        }
    };

    const mockResponse = {
        status: (code) => {
            console.log(`📤 Response status: ${code}`);
            return mockResponse;
        },
        json: (data) => {
            console.log('📤 Response data:', JSON.stringify(data, null, 2));
            return mockResponse;
        }
    };

    // Process webhook
    try {
        await handler.handleWebhook(mockRequest, mockResponse);
        console.log('✅ Webhook processed successfully');
    } catch (error) {
        console.error('❌ Webhook processing failed:', error.message);
    }

    // Get handler statistics
    const stats = handler.getStats();
    console.log('📊 Handler statistics:', stats);

    // Get health status
    const health = handler.getHealthStatus();
    console.log('🏥 Health status:', health);

    return handler;
}

/**
 * Custom event processor example
 */
export async function customEventProcessorExample() {
    console.log('🔧 Demonstrating custom event processor...');

    const { EventProcessor } = await import('../webhooks/event_processor.js');

    // Create custom event processor
    const processor = new EventProcessor({
        database: { enable_mock: true },
        github: { timeout: 5000 }
    });

    await processor.initialize();
    console.log('✅ Event processor initialized');

    // Create sample event
    const sampleEvent = {
        id: 'custom-event-123',
        type: 'pull_request',
        action: 'opened',
        timestamp: new Date().toISOString(),
        priority: 'high',
        pull_request: {
            number: 42,
            title: 'Custom Event Demo',
            head: { sha: 'custom123' }
        },
        repository: {
            full_name: 'custom/repo',
            owner: { login: 'custom' }
        }
    };

    // Process event
    try {
        const result = await processor.process(sampleEvent);
        console.log('✅ Event processed successfully');
        console.log('📊 Processing result:', {
            status: result.status,
            tasksCreated: result.tasks.length,
            duration: result.duration,
            steps: result.steps.map(s => ({ name: s.name, status: s.status }))
        });
    } catch (error) {
        console.error('❌ Event processing failed:', error.message);
    }

    return processor;
}

/**
 * Webhook security demonstration
 */
export async function webhookSecurityDemo() {
    console.log('🔒 Demonstrating webhook security...');

    const { WebhookSecurity } = await import('../webhooks/webhook_security.js');

    // Create security handler
    const security = new WebhookSecurity({
        secret: 'demo-security-secret-12345'
    });

    // Generate a secure secret
    const generatedSecret = WebhookSecurity.generateSecret();
    console.log('🔑 Generated secure secret:', generatedSecret);

    // Validate secret strength
    const validation = WebhookSecurity.validateSecret(generatedSecret);
    console.log('✅ Secret validation:', validation);

    // Demonstrate signature validation
    const payload = { demo: 'data' };
    const crypto = await import('crypto');
    const signature = crypto
        .createHmac('sha256', 'demo-security-secret-12345')
        .update(JSON.stringify(payload))
        .digest('hex');

    const validRequest = {
        headers: {
            'x-hub-signature-256': `sha256=${signature}`,
            'user-agent': 'GitHub-Hookshot/demo',
            'content-type': 'application/json'
        },
        body: payload
    };

    try {
        await security.validateSignature(validRequest);
        await security.validateOrigin(validRequest);
        await security.validatePayload({
            action: 'demo',
            repository: { full_name: 'demo/repo' }
        });
        console.log('✅ Security validation passed');
    } catch (error) {
        console.error('❌ Security validation failed:', error.message);
    }

    return security;
}

/**
 * GitHub API client demonstration
 */
export async function githubApiClientDemo() {
    console.log('🐙 Demonstrating GitHub API client...');

    const { GitHubAPIClient } = await import('../utils/github_api_client.js');

    // Create API client
    const client = new GitHubAPIClient({
        token: process.env.GITHUB_TOKEN || 'demo-token',
        timeout: 10000,
        retries: 2
    });

    console.log('✅ GitHub API client created');

    // Demonstrate rate limit checking
    const canMakeRequest = client.canMakeRequest();
    console.log('🚦 Can make request:', canMakeRequest);

    // Get rate limit info (would require valid token)
    try {
        if (process.env.GITHUB_TOKEN) {
            const rateLimit = await client.getRateLimit();
            console.log('📊 Rate limit info:', {
                remaining: rateLimit.rate.remaining,
                limit: rateLimit.rate.limit,
                reset: new Date(rateLimit.rate.reset * 1000)
            });
        } else {
            console.log('ℹ️ Set GITHUB_TOKEN to test actual API calls');
        }
    } catch (error) {
        console.log('⚠️ Rate limit check failed (expected without valid token)');
    }

    return client;
}

/**
 * Configuration examples
 */
export function configurationExamples() {
    console.log('⚙️ Demonstrating configuration options...');

    // Show default configuration
    console.log('📋 Default webhook configuration:');
    console.log(JSON.stringify(WEBHOOK_CONFIG, null, 2));

    // Show environment-specific configurations
    const { getEnvironmentConfig } = require('../config/webhook_config.js');
    
    const prodConfig = getEnvironmentConfig('production');
    const devConfig = getEnvironmentConfig('development');

    console.log('🏭 Production configuration differences:');
    console.log('- SSL verification:', prodConfig.ssl_verification);
    console.log('- Rate limit:', prodConfig.rate_limit.max_requests);
    console.log('- Concurrent limit:', prodConfig.processing.concurrent_limit);

    console.log('🔧 Development configuration differences:');
    console.log('- SSL verification:', devConfig.ssl_verification);
    console.log('- Rate limit:', devConfig.rate_limit.max_requests);
    console.log('- Concurrent limit:', devConfig.processing.concurrent_limit);

    // Validate configuration
    const { validateWebhookConfig } = require('../config/webhook_config.js');
    const validation = validateWebhookConfig();
    console.log('✅ Configuration validation:', validation);
}

/**
 * Run all examples
 */
export async function runAllExamples() {
    console.log('🎯 Running all webhook system examples...\n');

    try {
        // Configuration examples
        configurationExamples();
        console.log('\n' + '='.repeat(50) + '\n');

        // Security demo
        await webhookSecurityDemo();
        console.log('\n' + '='.repeat(50) + '\n');

        // GitHub API client demo
        await githubApiClientDemo();
        console.log('\n' + '='.repeat(50) + '\n');

        // Standalone webhook handler
        await standaloneWebhookHandler();
        console.log('\n' + '='.repeat(50) + '\n');

        // Custom event processor
        await customEventProcessorExample();
        console.log('\n' + '='.repeat(50) + '\n');

        console.log('✅ All examples completed successfully!');
        console.log('\nTo start a webhook server, run:');
        console.log('- Basic server: node -e "import(\'./src/ai_cicd_system/examples/webhook_usage_example.js\').then(m => m.basicWebhookServer())"');
        console.log('- Advanced server: node -e "import(\'./src/ai_cicd_system/examples/webhook_usage_example.js\').then(m => m.advancedWebhookServer())"');

    } catch (error) {
        console.error('❌ Example execution failed:', error.message);
        console.error(error.stack);
    }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples();
}

