/**
 * @fileoverview Webhook System Example
 * @description Comprehensive example demonstrating the webhook system and event-driven automation
 */

import { WebhookServer } from './webhook_server.js';
import { loadWebhookConfig } from '../config/webhook_config.js';

/**
 * Example webhook system usage
 */
export class WebhookSystemExample {
    constructor() {
        this.webhookServer = null;
        this.isRunning = false;
    }

    /**
     * Run basic webhook system example
     */
    async runBasicExample() {
        console.log('🚀 Starting Basic Webhook System Example...\n');

        try {
            // Load configuration
            const config = loadWebhookConfig({
                server: { 
                    port: 3001,
                    rateLimit: { max: 50 }
                },
                webhooks: {
                    github: { 
                        secret: 'test-github-secret',
                        events: ['pull_request', 'push']
                    },
                    linear: { 
                        secret: 'test-linear-secret',
                        events: ['issue.update', 'issue.create']
                    }
                },
                eventQueue: {
                    backend: 'memory',
                    maxQueueSize: 1000,
                    processingConcurrency: 3
                },
                logging: {
                    level: 'info'
                }
            });

            console.log('📋 Configuration loaded:');
            console.log(`- Server port: ${config.server.port}`);
            console.log(`- Event queue backend: ${config.eventQueue.backend}`);
            console.log(`- Processing concurrency: ${config.eventQueue.processingConcurrency}\n`);

            // Create webhook server
            this.webhookServer = new WebhookServer(config);

            // Start server
            await this.webhookServer.start();
            this.isRunning = true;

            console.log('✅ Webhook server started successfully!\n');

            // Simulate webhook events
            await this.simulateWebhookEvents();

            // Show metrics
            await this.showMetrics();

            // Show health status
            await this.showHealthStatus();

        } catch (error) {
            console.error('❌ Basic example failed:', error);
            throw error;
        }
    }

    /**
     * Run advanced webhook system example
     */
    async runAdvancedExample() {
        console.log('🚀 Starting Advanced Webhook System Example...\n');

        try {
            // Advanced configuration
            const config = loadWebhookConfig({
                server: { 
                    port: 3002,
                    compression: true,
                    rateLimit: {
                        windowMs: 60000,
                        max: 100
                    }
                },
                webhooks: {
                    github: { 
                        secret: 'advanced-github-secret',
                        events: ['pull_request', 'push', 'workflow_run', 'issue_comment']
                    },
                    linear: { 
                        secret: 'advanced-linear-secret',
                        events: ['issue.update', 'issue.create', 'issue.remove']
                    },
                    codegen: {
                        secret: 'advanced-codegen-secret',
                        events: ['generation.complete', 'generation.failed']
                    }
                },
                eventQueue: {
                    backend: 'memory',
                    maxQueueSize: 5000,
                    processingConcurrency: 5,
                    processingTimeout: 30000
                },
                eventStore: {
                    backend: 'memory',
                    maxEvents: 10000,
                    retentionDays: 7,
                    enableCompression: true
                },
                retryManager: {
                    maxRetries: 3,
                    baseDelay: 1000,
                    enableCircuitBreaker: true
                },
                workflow: {
                    maxConcurrentWorkflows: 10,
                    workflowTimeout: 120000
                }
            });

            console.log('📋 Advanced configuration loaded:');
            console.log(`- Multiple webhook sources: ${Object.keys(config.webhooks).length}`);
            console.log(`- Event store enabled: ${config.eventStore.backend}`);
            console.log(`- Circuit breaker enabled: ${config.retryManager.enableCircuitBreaker}`);
            console.log(`- Max concurrent workflows: ${config.workflow.maxConcurrentWorkflows}\n`);

            // Create webhook server
            this.webhookServer = new WebhookServer(config);

            // Start server
            await this.webhookServer.start();
            this.isRunning = true;

            console.log('✅ Advanced webhook server started successfully!\n');

            // Simulate complex workflow scenarios
            await this.simulateComplexWorkflows();

            // Demonstrate error handling
            await this.demonstrateErrorHandling();

            // Show comprehensive metrics
            await this.showComprehensiveMetrics();

        } catch (error) {
            console.error('❌ Advanced example failed:', error);
            throw error;
        }
    }

    /**
     * Simulate webhook events
     */
    async simulateWebhookEvents() {
        console.log('📡 Simulating webhook events...\n');

        // Simulate GitHub PR opened event
        const githubPREvent = {
            id: 'gh_pr_001',
            source: 'github',
            type: 'pull_request',
            payload: {
                action: 'opened',
                pull_request: {
                    id: 123456,
                    number: 42,
                    title: 'feat: Add new authentication system',
                    state: 'open',
                    user: { login: 'codegen-bot' },
                    head: { ref: 'codegen/auth-system-feature' },
                    base: { ref: 'main' },
                    draft: false
                },
                repository: {
                    full_name: 'example/repo'
                }
            },
            headers: {
                'x-github-event': 'pull_request',
                'x-github-delivery': 'abc123'
            },
            timestamp: new Date().toISOString(),
            metadata: { ip: '127.0.0.1' }
        };

        console.log('🔄 Processing GitHub PR opened event...');
        const githubResult = await this.webhookServer.webhookProcessor.processWebhook(githubPREvent);
        console.log(`✅ GitHub event processed: ${githubResult.status}\n`);

        // Simulate Linear issue update event
        const linearIssueEvent = {
            id: 'lin_issue_001',
            source: 'linear',
            type: 'issue.update',
            payload: {
                type: 'issue.update',
                data: {
                    id: 'issue_789',
                    title: 'Implement user dashboard',
                    description: 'Create a comprehensive user dashboard with analytics',
                    state: { name: 'In Progress' },
                    assignee: { name: 'Codegen', email: 'codegen@example.com' },
                    team: { name: 'Engineering' },
                    priority: 1
                },
                updatedFrom: {
                    stateId: 'old_state_id',
                    state: { name: 'Todo' }
                }
            },
            headers: {
                'linear-webhook-id': 'lin_webhook_123'
            },
            timestamp: new Date().toISOString(),
            metadata: { ip: '127.0.0.1' }
        };

        console.log('🔄 Processing Linear issue update event...');
        const linearResult = await this.webhookServer.webhookProcessor.processWebhook(linearIssueEvent);
        console.log(`✅ Linear event processed: ${linearResult.status}\n`);

        // Wait for processing to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    /**
     * Simulate complex workflows
     */
    async simulateComplexWorkflows() {
        console.log('🔄 Simulating complex workflow scenarios...\n');

        // Simulate Codegen generation complete event
        const codegenCompleteEvent = {
            id: 'cg_complete_001',
            source: 'codegen',
            type: 'generation.complete',
            payload: {
                event_type: 'generation.complete',
                data: {
                    task_id: 'task_12345',
                    generation_id: 'gen_67890',
                    pr_url: 'https://github.com/example/repo/pull/43',
                    pr_number: 43,
                    repository: 'example/repo',
                    branch: 'codegen/user-dashboard',
                    status: 'completed'
                },
                timestamp: new Date().toISOString()
            },
            headers: {},
            timestamp: new Date().toISOString(),
            metadata: { ip: '127.0.0.1' }
        };

        console.log('🔄 Processing Codegen generation complete event...');
        const codegenResult = await this.webhookServer.webhookProcessor.processWebhook(codegenCompleteEvent);
        console.log(`✅ Codegen event processed: ${codegenResult.status}\n`);

        // Simulate GitHub workflow failure event
        const workflowFailureEvent = {
            id: 'gh_wf_fail_001',
            source: 'github',
            type: 'workflow_run',
            payload: {
                action: 'completed',
                workflow_run: {
                    id: 987654,
                    name: 'CI/CD Pipeline',
                    conclusion: 'failure',
                    pull_requests: [{ number: 43 }]
                },
                repository: {
                    full_name: 'example/repo'
                }
            },
            headers: {
                'x-github-event': 'workflow_run',
                'x-github-delivery': 'def456'
            },
            timestamp: new Date().toISOString(),
            metadata: { ip: '127.0.0.1' }
        };

        console.log('🔄 Processing GitHub workflow failure event...');
        const workflowResult = await this.webhookServer.webhookProcessor.processWebhook(workflowFailureEvent);
        console.log(`✅ Workflow failure event processed: ${workflowResult.status}\n`);

        // Wait for workflow processing
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    /**
     * Demonstrate error handling
     */
    async demonstrateErrorHandling() {
        console.log('⚠️ Demonstrating error handling...\n');

        // Simulate invalid event
        const invalidEvent = {
            id: 'invalid_001',
            source: 'unknown_source',
            type: 'invalid_type',
            payload: null,
            timestamp: 'invalid_timestamp'
        };

        console.log('🔄 Processing invalid event...');
        try {
            const result = await this.webhookServer.webhookProcessor.processWebhook(invalidEvent);
            console.log(`⚠️ Invalid event result: ${result.status}\n`);
        } catch (error) {
            console.log(`❌ Invalid event failed as expected: ${error.message}\n`);
        }

        // Simulate duplicate event
        const duplicateEvent = {
            id: 'duplicate_001',
            source: 'github',
            type: 'pull_request',
            payload: {
                action: 'opened',
                pull_request: { id: 123456, number: 42 },
                repository: { full_name: 'example/repo' }
            },
            headers: { 'x-github-delivery': 'duplicate_delivery' },
            timestamp: new Date().toISOString(),
            metadata: { ip: '127.0.0.1' }
        };

        console.log('🔄 Processing duplicate event (first time)...');
        const firstResult = await this.webhookServer.webhookProcessor.processWebhook(duplicateEvent);
        console.log(`✅ First duplicate event: ${firstResult.status}`);

        console.log('🔄 Processing duplicate event (second time)...');
        const secondResult = await this.webhookServer.webhookProcessor.processWebhook(duplicateEvent);
        console.log(`⚠️ Second duplicate event: ${secondResult.status}\n`);
    }

    /**
     * Show basic metrics
     */
    async showMetrics() {
        console.log('📊 System Metrics:\n');

        const metrics = await this.webhookServer.getMetrics();
        
        console.log('Server Metrics:');
        console.log(`- Uptime: ${Math.round(metrics.server.uptime)}s`);
        console.log(`- Memory Usage: ${Math.round(metrics.server.memoryUsage.rss / 1024 / 1024)}MB\n`);

        console.log('Event Queue Metrics:');
        console.log(`- Events Queued: ${metrics.eventQueue.eventsQueued}`);
        console.log(`- Events Processed: ${metrics.eventQueue.eventsProcessed}`);
        console.log(`- Queue Size: ${metrics.eventQueue.queueSize}`);
        console.log(`- Success Rate: ${metrics.eventQueue.successRate?.toFixed(1)}%\n`);

        console.log('Event Store Metrics:');
        console.log(`- Events Stored: ${metrics.eventStore.eventsStored}`);
        console.log(`- Storage Size: ${metrics.eventStore.currentSize}\n`);
    }

    /**
     * Show comprehensive metrics
     */
    async showComprehensiveMetrics() {
        console.log('📊 Comprehensive System Metrics:\n');

        const metrics = await this.webhookServer.getMetrics();
        
        // Server metrics
        console.log('🖥️ Server Metrics:');
        console.log(`- Uptime: ${Math.round(metrics.server.uptime)}s`);
        console.log(`- Memory RSS: ${Math.round(metrics.server.memoryUsage.rss / 1024 / 1024)}MB`);
        console.log(`- Memory Heap: ${Math.round(metrics.server.memoryUsage.heapUsed / 1024 / 1024)}MB\n`);

        // Event processing metrics
        console.log('⚡ Event Processing Metrics:');
        console.log(`- Events Queued: ${metrics.eventQueue.eventsQueued}`);
        console.log(`- Events Processed: ${metrics.eventQueue.eventsProcessed}`);
        console.log(`- Events Completed: ${metrics.eventQueue.eventsCompleted}`);
        console.log(`- Events Failed: ${metrics.eventQueue.eventsFailed}`);
        console.log(`- Success Rate: ${metrics.eventQueue.successRate?.toFixed(1)}%`);
        console.log(`- Average Processing Time: ${metrics.eventQueue.averageProcessingTime?.toFixed(0)}ms\n`);

        // Event store metrics
        console.log('💾 Event Store Metrics:');
        console.log(`- Events Stored: ${metrics.eventStore.eventsStored}`);
        console.log(`- Events Retrieved: ${metrics.eventStore.eventsRetrieved}`);
        console.log(`- Current Size: ${metrics.eventStore.currentSize}`);
        console.log(`- Pending Writes: ${metrics.eventStore.pendingWrites}\n`);

        // Retry manager metrics
        console.log('🔄 Retry Manager Metrics:');
        console.log(`- Retries Attempted: ${metrics.retryManager.retriesAttempted}`);
        console.log(`- Retries Succeeded: ${metrics.retryManager.retriesSucceeded}`);
        console.log(`- Retries Failed: ${metrics.retryManager.retriesFailed}`);
        console.log(`- Success Rate: ${metrics.retryManager.successRate?.toFixed(1)}%`);
        console.log(`- Circuit Breaker Trips: ${metrics.retryManager.circuitBreakerTrips}\n`);
    }

    /**
     * Show health status
     */
    async showHealthStatus() {
        console.log('🏥 System Health Status:\n');

        const health = await this.webhookServer.getHealth();
        
        console.log(`Overall Status: ${this.getHealthEmoji(health.status)} ${health.status.toUpperCase()}\n`);

        console.log('Component Health:');
        for (const [component, status] of Object.entries(health.components)) {
            console.log(`- ${component}: ${this.getHealthEmoji(status)} ${status}`);
        }

        if (health.unhealthyComponents.length > 0) {
            console.log(`\n⚠️ Unhealthy Components: ${health.unhealthyComponents.join(', ')}`);
        }

        console.log(`\n🕐 Last Check: ${health.timestamp}\n`);
    }

    /**
     * Get health status emoji
     * @param {string} status - Health status
     * @returns {string} Emoji
     */
    getHealthEmoji(status) {
        switch (status) {
            case 'healthy': return '✅';
            case 'degraded': return '⚠️';
            case 'unhealthy': return '❌';
            default: return '❓';
        }
    }

    /**
     * Demonstrate webhook system features
     */
    async demonstrateFeatures() {
        console.log('🎯 Demonstrating Webhook System Features...\n');

        // Event deduplication
        console.log('🔍 Event Deduplication:');
        const deduplicator = this.webhookServer.webhookProcessor.eventDeduplicator;
        const stats = deduplicator.getStatistics();
        console.log(`- Events Checked: ${stats.eventsChecked}`);
        console.log(`- Duplicates Found: ${stats.duplicatesFound}`);
        console.log(`- Duplicate Rate: ${stats.duplicateRate.toFixed(1)}%\n`);

        // Rate limiting
        console.log('🚦 Rate Limiting:');
        const rateLimiter = this.webhookServer.rateLimiter;
        const rateLimiterStats = rateLimiter.getStatistics();
        console.log(`- Total Requests: ${rateLimiterStats.totalRequests}`);
        console.log(`- Blocked Requests: ${rateLimiterStats.blockedRequests}`);
        console.log(`- Block Rate: ${rateLimiterStats.blockRate.toFixed(1)}%\n`);

        // Workflow engine
        console.log('⚙️ Workflow Engine:');
        const workflowEngine = this.webhookServer.workflowEngine;
        const workflowStats = workflowEngine.getStatistics();
        console.log(`- Workflows Executed: ${workflowStats.workflowsExecuted}`);
        console.log(`- Workflows Completed: ${workflowStats.workflowsCompleted}`);
        console.log(`- Success Rate: ${workflowStats.successRate.toFixed(1)}%`);
        console.log(`- Average Execution Time: ${workflowStats.averageExecutionTime.toFixed(0)}ms\n`);
    }

    /**
     * Cleanup and shutdown
     */
    async cleanup() {
        if (this.webhookServer && this.isRunning) {
            console.log('🛑 Shutting down webhook server...');
            await this.webhookServer.shutdown();
            this.isRunning = false;
            console.log('✅ Webhook server shut down successfully\n');
        }
    }
}

/**
 * Run webhook system examples
 */
export async function runWebhookSystemExamples() {
    const example = new WebhookSystemExample();

    try {
        // Run basic example
        await example.runBasicExample();
        
        // Demonstrate features
        await example.demonstrateFeatures();
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Cleanup
        await example.cleanup();

        // Run advanced example
        await example.runAdvancedExample();
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Final cleanup
        await example.cleanup();

        console.log('🎉 All webhook system examples completed successfully!');

    } catch (error) {
        console.error('❌ Webhook system examples failed:', error);
        await example.cleanup();
        throw error;
    }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runWebhookSystemExamples()
        .then(() => {
            console.log('✅ Examples completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Examples failed:', error);
            process.exit(1);
        });
}

export default WebhookSystemExample;

