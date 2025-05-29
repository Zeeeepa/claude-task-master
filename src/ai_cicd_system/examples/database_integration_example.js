/**
 * @fileoverview Database Integration Example
 * @description Complete example demonstrating database integration with Cloudflare exposure
 * @version 2.0.0
 * @created 2025-05-28
 */

import { EnhancedConnectionPool } from '../database/connection_pool.js';
import { DatabaseHealthMonitor } from '../database/health_monitor.js';
import { CloudflareDatabaseTunnel } from '../../infrastructure/cloudflare/database_tunnel.js';
import { CloudflareSecurityRules } from '../../infrastructure/cloudflare/security_rules.js';
import { CloudflareSSLConfig } from '../../infrastructure/cloudflare/ssl_config.js';
import { MigrationRunner } from '../database/migrations/runner.js';
import { MigrationRollbackManager } from '../database/migrations/rollback.js';
import { dbConfig } from '../config/database_config.js';

/**
 * Complete Database Integration Example
 * Demonstrates the full setup and usage of the enhanced database system
 */
export class DatabaseIntegrationExample {
    constructor() {
        this.connectionPool = null;
        this.healthMonitor = null;
        this.cloudflareComponents = {
            tunnel: null,
            security: null,
            ssl: null
        };
        this.migrationRunner = null;
        this.rollbackManager = null;
        this.isInitialized = false;
    }

    /**
     * Complete system initialization
     * @returns {Promise<void>}
     */
    async initializeSystem() {
        try {
            console.log('🚀 Initializing complete database system...');
            
            // Step 1: Initialize enhanced connection pool
            await this._initializeConnectionPool();
            
            // Step 2: Run database migrations
            await this._runMigrations();
            
            // Step 3: Setup Cloudflare components (if enabled)
            if (dbConfig.cloudflare.enabled) {
                await this._setupCloudflareComponents();
            }
            
            // Step 4: Initialize health monitoring
            await this._initializeHealthMonitoring();
            
            // Step 5: Setup external integrations
            await this._setupExternalIntegrations();
            
            this.isInitialized = true;
            
            console.log('✅ Complete database system initialized successfully');
            
            // Demonstrate system capabilities
            await this._demonstrateCapabilities();
            
        } catch (error) {
            console.error('❌ Failed to initialize database system:', error.message);
            throw error;
        }
    }

    /**
     * Initialize enhanced connection pool
     * @private
     */
    async _initializeConnectionPool() {
        console.log('🔄 Initializing enhanced connection pool...');
        
        this.connectionPool = new EnhancedConnectionPool(dbConfig);
        
        // Setup event listeners
        this.connectionPool.on('pool:initialized', (status) => {
            console.log('✅ Connection pool initialized:', status);
        });
        
        this.connectionPool.on('connection:acquired', (info) => {
            console.log(`🔗 Connection acquired: ${info.connectionId}`);
        });
        
        this.connectionPool.on('connection:error', (error) => {
            console.error(`❌ Connection error: ${error.error}`);
        });
        
        this.connectionPool.on('query:slow', (info) => {
            console.warn(`🐌 Slow query detected: ${info.duration}ms`);
        });
        
        await this.connectionPool.initialize();
        
        console.log('✅ Enhanced connection pool initialized');
    }

    /**
     * Run database migrations
     * @private
     */
    async _runMigrations() {
        console.log('🔄 Running database migrations...');
        
        this.migrationRunner = new MigrationRunner(this.connectionPool);
        this.rollbackManager = new MigrationRollbackManager(this.connectionPool);
        
        // Validate existing migrations
        const validation = await this.migrationRunner.validateMigrations();
        if (!validation.valid) {
            console.error('❌ Migration validation failed:', validation.errors);
            throw new Error('Migration validation failed');
        }
        
        // Run pending migrations
        const appliedMigrations = await this.migrationRunner.runMigrations();
        console.log(`✅ Applied ${appliedMigrations.length} migrations`);
        
        // Show migration status
        const status = await this.migrationRunner.getMigrationStatus();
        console.log(`📊 Migration status: ${status.applied}/${status.total} applied, ${status.pending} pending`);
    }

    /**
     * Setup Cloudflare components
     * @private
     */
    async _setupCloudflareComponents() {
        console.log('🔄 Setting up Cloudflare components...');
        
        // Initialize Cloudflare tunnel
        this.cloudflareComponents.tunnel = new CloudflareDatabaseTunnel(dbConfig.cloudflare);
        await this.cloudflareComponents.tunnel.setupTunnel();
        
        // Initialize security rules
        this.cloudflareComponents.security = new CloudflareSecurityRules(dbConfig.cloudflare);
        await this.cloudflareComponents.security.initializeSecurityRules();
        
        // Initialize SSL configuration
        this.cloudflareComponents.ssl = new CloudflareSSLConfig(dbConfig.cloudflare);
        await this.cloudflareComponents.ssl.initializeSSLConfig();
        
        // Deploy security rules
        await this.cloudflareComponents.security.deployRules();
        
        console.log('✅ Cloudflare components configured');
    }

    /**
     * Initialize health monitoring
     * @private
     */
    async _initializeHealthMonitoring() {
        console.log('🔄 Initializing health monitoring...');
        
        this.healthMonitor = new DatabaseHealthMonitor({
            health_check_interval: 30000,
            performance_check_interval: 60000,
            enable_alerts: true
        });
        
        // Setup event listeners
        this.healthMonitor.on('monitoring:started', () => {
            console.log('💓 Health monitoring started');
        });
        
        this.healthMonitor.on('health:updated', (health) => {
            console.log(`💓 Health status: ${health.status} (${health.responseTime}ms)`);
        });
        
        this.healthMonitor.on('alert:triggered', (alert) => {
            console.warn(`🚨 Alert: ${alert.type} - ${alert.message}`);
        });
        
        this.healthMonitor.on('metrics:collected', (metrics) => {
            console.log(`📊 Metrics: ${metrics.active_connections} active connections, ${metrics.queries_per_second.toFixed(2)} QPS`);
        });
        
        await this.healthMonitor.startMonitoring();
        
        console.log('✅ Health monitoring initialized');
    }

    /**
     * Setup external integrations
     * @private
     */
    async _setupExternalIntegrations() {
        console.log('🔄 Setting up external integrations...');
        
        const integrations = dbConfig.external_integrations;
        
        // Setup Codegen integration
        if (integrations.codegen.enabled) {
            await this._setupCodegenIntegration();
        }
        
        // Setup GitHub integration
        if (integrations.github.enabled) {
            await this._setupGitHubIntegration();
        }
        
        // Setup Linear integration
        if (integrations.linear.enabled) {
            await this._setupLinearIntegration();
        }
        
        // Setup Claude integration
        if (integrations.claude.enabled) {
            await this._setupClaudeIntegration();
        }
        
        console.log('✅ External integrations configured');
    }

    /**
     * Setup Codegen integration
     * @private
     */
    async _setupCodegenIntegration() {
        const config = dbConfig.external_integrations.codegen;
        
        await this.connectionPool.query(`
            INSERT INTO external_integrations (
                integration_type, integration_name, configuration, status
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (integration_type, integration_name) 
            DO UPDATE SET configuration = $3, updated_at = NOW()
        `, [
            'codegen',
            'codegen-api',
            JSON.stringify({
                api_url: config.api_url,
                rate_limit: config.rate_limit,
                timeout: 30000
            }),
            'active'
        ]);
        
        console.log('✅ Codegen integration configured');
    }

    /**
     * Setup GitHub integration
     * @private
     */
    async _setupGitHubIntegration() {
        const config = dbConfig.external_integrations.github;
        
        await this.connectionPool.query(`
            INSERT INTO external_integrations (
                integration_type, integration_name, configuration, status
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (integration_type, integration_name) 
            DO UPDATE SET configuration = $3, updated_at = NOW()
        `, [
            'github',
            'github-api',
            JSON.stringify({
                api_url: config.api_url,
                rate_limit: config.rate_limit,
                timeout: 30000
            }),
            'active'
        ]);
        
        console.log('✅ GitHub integration configured');
    }

    /**
     * Setup Linear integration
     * @private
     */
    async _setupLinearIntegration() {
        const config = dbConfig.external_integrations.linear;
        
        await this.connectionPool.query(`
            INSERT INTO external_integrations (
                integration_type, integration_name, configuration, status
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (integration_type, integration_name) 
            DO UPDATE SET configuration = $3, updated_at = NOW()
        `, [
            'linear',
            'linear-api',
            JSON.stringify({
                api_url: config.api_url,
                rate_limit: config.rate_limit,
                timeout: 30000
            }),
            'active'
        ]);
        
        console.log('✅ Linear integration configured');
    }

    /**
     * Setup Claude integration
     * @private
     */
    async _setupClaudeIntegration() {
        const config = dbConfig.external_integrations.claude;
        
        await this.connectionPool.query(`
            INSERT INTO external_integrations (
                integration_type, integration_name, configuration, status
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (integration_type, integration_name) 
            DO UPDATE SET configuration = $3, updated_at = NOW()
        `, [
            'claude',
            'claude-api',
            JSON.stringify({
                api_url: config.api_url,
                rate_limit: config.rate_limit,
                timeout: 30000
            }),
            'active'
        ]);
        
        console.log('✅ Claude integration configured');
    }

    /**
     * Demonstrate system capabilities
     * @private
     */
    async _demonstrateCapabilities() {
        console.log('🎯 Demonstrating system capabilities...');
        
        // Demonstrate task management
        await this._demonstrateTaskManagement();
        
        // Demonstrate workflow management
        await this._demonstrateWorkflowManagement();
        
        // Demonstrate metrics collection
        await this._demonstrateMetricsCollection();
        
        // Demonstrate health monitoring
        await this._demonstrateHealthMonitoring();
        
        // Demonstrate API logging
        await this._demonstrateAPILogging();
        
        console.log('✅ System capabilities demonstrated');
    }

    /**
     * Demonstrate task management
     * @private
     */
    async _demonstrateTaskManagement() {
        console.log('📋 Demonstrating task management...');
        
        // Create a sample task using the stored function
        const taskResult = await this.connectionPool.query(`
            SELECT create_task(
                $1, $2, $3, $4, $5, NULL, $6, $7
            ) as task_id
        `, [
            'Sample Task: Database Integration',
            'Demonstrate the enhanced database schema with task management',
            'feature',
            5,
            'codegen',
            JSON.stringify(['Database setup', 'Cloudflare configuration', 'Health monitoring']),
            JSON.stringify({ source: 'example', priority: 'high' })
        ]);
        
        const taskId = taskResult.rows[0].task_id;
        console.log(`✅ Created task: ${taskId}`);
        
        // Update task status
        await this.connectionPool.query(`
            SELECT update_task_status($1, $2, $3, $4)
        `, [taskId, 'in_progress', 'codegen', 'Starting task implementation']);
        
        console.log(`✅ Updated task status to in_progress`);
        
        // Get task hierarchy
        const hierarchyResult = await this.connectionPool.query(`
            SELECT * FROM get_task_hierarchy($1)
        `, [taskId]);
        
        console.log(`📊 Task hierarchy: ${hierarchyResult.rows.length} levels`);
        
        return taskId;
    }

    /**
     * Demonstrate workflow management
     * @private
     */
    async _demonstrateWorkflowManagement() {
        console.log('⚙️ Demonstrating workflow management...');
        
        // Create a sample task first
        const taskResult = await this.connectionPool.query(`
            SELECT create_task($1, $2, $3, $4, $5) as task_id
        `, [
            'Workflow Demo Task',
            'Task for demonstrating workflow management',
            'general',
            3,
            'codegen'
        ]);
        
        const taskId = taskResult.rows[0].task_id;
        
        // Create workflow
        const workflowResult = await this.connectionPool.query(`
            SELECT create_workflow($1, $2, $3, $4) as workflow_id
        `, [taskId, 'standard', 5, 30]);
        
        const workflowId = workflowResult.rows[0].workflow_id;
        console.log(`✅ Created workflow: ${workflowId}`);
        
        // Update workflow steps
        const steps = ['initialize', 'validate', 'execute', 'verify', 'complete'];
        
        for (let i = 0; i < steps.length; i++) {
            await this.connectionPool.query(`
                SELECT update_workflow_step($1, $2, $3, $4)
            `, [
                workflowId,
                steps[i],
                'completed',
                JSON.stringify({ step_number: i + 1, duration_ms: Math.random() * 1000 })
            ]);
            
            console.log(`✅ Completed workflow step: ${steps[i]}`);
        }
        
        return workflowId;
    }

    /**
     * Demonstrate metrics collection
     * @private
     */
    async _demonstrateMetricsCollection() {
        console.log('📊 Demonstrating metrics collection...');
        
        // Record various metrics
        const metrics = [
            { name: 'database_connections', value: 15, type: 'gauge', component: 'database' },
            { name: 'query_response_time', value: 45.5, type: 'timer', component: 'database' },
            { name: 'api_requests_total', value: 1250, type: 'counter', component: 'api' },
            { name: 'task_completion_rate', value: 87.5, type: 'gauge', component: 'tasks' },
            { name: 'workflow_success_rate', value: 92.3, type: 'gauge', component: 'workflows' }
        ];
        
        for (const metric of metrics) {
            await this.connectionPool.query(`
                SELECT record_metric($1, $2, $3, $4, $5) as metric_id
            `, [
                metric.name,
                metric.value,
                metric.component,
                metric.type,
                JSON.stringify({ source: 'example', timestamp: new Date().toISOString() })
            ]);
            
            console.log(`📈 Recorded metric: ${metric.name} = ${metric.value}`);
        }
        
        // Get system health summary
        const healthResult = await this.connectionPool.query(`
            SELECT * FROM get_system_health()
        `);
        
        console.log(`💓 System health components: ${healthResult.rows.length}`);
    }

    /**
     * Demonstrate health monitoring
     * @private
     */
    async _demonstrateHealthMonitoring() {
        console.log('💓 Demonstrating health monitoring...');
        
        // Force a health check
        const healthCheck = await this.healthMonitor.forceHealthCheck();
        console.log(`✅ Health check result: ${healthCheck.status} (${healthCheck.responseTime}ms)`);
        
        // Get current health status
        const healthStatus = this.healthMonitor.getHealthStatus();
        console.log(`📊 Current health: ${healthStatus.status}, monitoring: ${healthStatus.monitoring}`);
        
        // Get performance metrics
        const performanceMetrics = this.healthMonitor.getPerformanceMetrics();
        console.log(`📈 Performance metrics collected: ${performanceMetrics.history.length} data points`);
        
        // Get recent alerts
        const alerts = this.healthMonitor.getAlertHistory(1);
        console.log(`🚨 Recent alerts: ${alerts.length}`);
    }

    /**
     * Demonstrate API logging
     * @private
     */
    async _demonstrateAPILogging() {
        console.log('🔗 Demonstrating API logging...');
        
        // Log sample API calls
        const apiCalls = [
            { integration: 'codegen-api', endpoint: '/api/tasks', method: 'POST', status: 201, time: 150 },
            { integration: 'github-api', endpoint: '/repos/owner/repo/pulls', method: 'GET', status: 200, time: 89 },
            { integration: 'linear-api', endpoint: '/graphql', method: 'POST', status: 200, time: 234 },
            { integration: 'claude-api', endpoint: '/v1/messages', method: 'POST', status: 200, time: 1250 }
        ];
        
        for (const call of apiCalls) {
            await this.connectionPool.query(`
                SELECT log_api_call($1, $2, $3, $4, $5) as log_id
            `, [
                call.integration,
                call.endpoint,
                call.method,
                call.status,
                call.time
            ]);
            
            console.log(`📝 Logged API call: ${call.method} ${call.endpoint} (${call.status}, ${call.time}ms)`);
        }
        
        // Check rate limits
        for (const call of apiCalls) {
            const rateLimitOk = await this.connectionPool.query(`
                SELECT check_rate_limit($1) as allowed
            `, [call.integration]);
            
            console.log(`⏱️ Rate limit check for ${call.integration}: ${rateLimitOk.rows[0].allowed ? 'OK' : 'EXCEEDED'}`);
        }
    }

    /**
     * Get system status
     * @returns {Object} Complete system status
     */
    async getSystemStatus() {
        if (!this.isInitialized) {
            return { initialized: false };
        }
        
        const status = {
            initialized: true,
            timestamp: new Date().toISOString(),
            
            // Connection pool status
            connection_pool: this.connectionPool.getStatus(),
            
            // Health monitoring status
            health_monitoring: this.healthMonitor.getHealthStatus(),
            
            // Migration status
            migration_status: await this.migrationRunner.getMigrationStatus(),
            
            // Cloudflare status (if enabled)
            cloudflare: dbConfig.cloudflare.enabled ? {
                tunnel: this.cloudflareComponents.tunnel?.getStatus(),
                security: this.cloudflareComponents.security?.getSecurityStatus(),
                ssl: this.cloudflareComponents.ssl?.getSSLStatus()
            } : { enabled: false },
            
            // Database statistics
            database_stats: await this._getDatabaseStatistics()
        };
        
        return status;
    }

    /**
     * Get database statistics
     * @private
     */
    async _getDatabaseStatistics() {
        try {
            const stats = await this.connectionPool.query(`
                SELECT 
                    (SELECT count(*) FROM tasks) as total_tasks,
                    (SELECT count(*) FROM tasks WHERE status = 'completed') as completed_tasks,
                    (SELECT count(*) FROM workflows) as total_workflows,
                    (SELECT count(*) FROM workflows WHERE status = 'completed') as completed_workflows,
                    (SELECT count(*) FROM system_metrics) as total_metrics,
                    (SELECT count(*) FROM audit_logs) as total_audit_logs,
                    (SELECT count(*) FROM external_integrations WHERE status = 'active') as active_integrations
            `);
            
            return stats.rows[0];
            
        } catch (error) {
            console.error('❌ Failed to get database statistics:', error.message);
            return {};
        }
    }

    /**
     * Shutdown the system
     * @returns {Promise<void>}
     */
    async shutdown() {
        console.log('🛑 Shutting down database system...');
        
        try {
            // Stop health monitoring
            if (this.healthMonitor) {
                await this.healthMonitor.stopMonitoring();
            }
            
            // Stop Cloudflare tunnel
            if (this.cloudflareComponents.tunnel) {
                await this.cloudflareComponents.tunnel.stopTunnel();
            }
            
            // Shutdown connection pool
            if (this.connectionPool) {
                await this.connectionPool.shutdown();
            }
            
            this.isInitialized = false;
            
            console.log('✅ Database system shutdown completed');
            
        } catch (error) {
            console.error('❌ Error during system shutdown:', error.message);
            throw error;
        }
    }
}

/**
 * Run the complete example
 */
export async function runDatabaseIntegrationExample() {
    const example = new DatabaseIntegrationExample();
    
    try {
        // Initialize the complete system
        await example.initializeSystem();
        
        // Get and display system status
        const status = await example.getSystemStatus();
        console.log('📊 System Status:', JSON.stringify(status, null, 2));
        
        // Keep running for demonstration (in production, this would run continuously)
        console.log('🔄 System running... Press Ctrl+C to stop');
        
        // Setup graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n🛑 Received shutdown signal...');
            await example.shutdown();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            console.log('\n🛑 Received termination signal...');
            await example.shutdown();
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ Example failed:', error.message);
        await example.shutdown();
        process.exit(1);
    }
}

// Run example if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runDatabaseIntegrationExample();
}

export default DatabaseIntegrationExample;

