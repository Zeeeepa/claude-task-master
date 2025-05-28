/**
 * @fileoverview Database Setup and Deployment Script
 * @description Automated setup for PostgreSQL database with Cloudflare integration
 */

import { DatabaseConnection } from './connection.js';
import { MigrationRunner } from './migrations/runner.js';
import { EnhancedConnectionPool, initializePoolManager } from './connection_pool.js';
import { initializeCloudflareConfig } from './cloudflare_config.js';
import { dbConfig } from '../config/database_config.js';
import { log } from '../../../scripts/modules/utils.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Database Setup Manager
 */
export class DatabaseSetup {
    constructor(config = dbConfig) {
        this.config = config;
        this.connection = null;
        this.poolManager = null;
    }

    /**
     * Complete database setup process
     */
    async setup() {
        try {
            log('info', 'Starting database setup process...');

            // Step 1: Validate configuration
            await this.validateConfiguration();

            // Step 2: Initialize database connection
            await this.initializeConnection();

            // Step 3: Run migrations
            await this.runMigrations();

            // Step 4: Initialize connection pools
            await this.initializeConnectionPools();

            // Step 5: Setup Cloudflare configuration
            await this.setupCloudflareConfig();

            // Step 6: Create initial data
            await this.createInitialData();

            // Step 7: Verify setup
            await this.verifySetup();

            log('info', 'Database setup completed successfully!');
            return true;
        } catch (error) {
            log('error', `Database setup failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Validate database configuration
     */
    async validateConfiguration() {
        log('info', 'Validating database configuration...');

        const requiredEnvVars = [
            'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'
        ];

        const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        // Test database connectivity
        try {
            this.connection = new DatabaseConnection(this.config);
            await this.connection.initialize();
            log('info', 'Database connectivity verified');
        } catch (error) {
            throw new Error(`Database connection failed: ${error.message}`);
        }
    }

    /**
     * Run database migrations
     */
    async runMigrations() {
        log('info', 'Running database migrations...');

        const migrationRunner = new MigrationRunner(this.connection);
        await migrationRunner.runMigrations();

        log('info', 'Database migrations completed');
    }

    /**
     * Initialize connection pools
     */
    async initializeConnectionPools() {
        log('info', 'Initializing connection pools...');

        this.poolManager = await initializePoolManager(this.config);
        
        // Test all pools
        const pools = ['primary', 'readonly', 'priority', 'background'];
        for (const poolName of pools) {
            try {
                await this.poolManager.query('SELECT 1', [], { poolName });
                log('info', `Pool ${poolName} initialized successfully`);
            } catch (error) {
                throw new Error(`Failed to initialize pool ${poolName}: ${error.message}`);
            }
        }
    }

    /**
     * Setup Cloudflare configuration
     */
    async setupCloudflareConfig() {
        log('info', 'Setting up Cloudflare configuration...');

        try {
            const cloudflareSetup = await initializeCloudflareConfig();
            
            if (cloudflareSetup.validation.warnings.length > 0) {
                log('warn', `Cloudflare warnings: ${cloudflareSetup.validation.warnings.join(', ')}`);
            }

            // Generate deployment files if needed
            if (process.env.GENERATE_CLOUDFLARE_CONFIG === 'true') {
                await this.generateCloudflareDeploymentFiles();
            }

            log('info', 'Cloudflare configuration completed');
        } catch (error) {
            log('warn', `Cloudflare setup failed (non-critical): ${error.message}`);
        }
    }

    /**
     * Generate Cloudflare deployment files
     */
    async generateCloudflareDeploymentFiles() {
        const { generateCloudflareDeploymentConfig } = await import('./cloudflare_config.js');
        const deploymentConfig = generateCloudflareDeploymentConfig();

        // Write Terraform configuration
        const terraformConfig = JSON.stringify(deploymentConfig.terraform, null, 2);
        await fs.writeFile('cloudflare-terraform.json', terraformConfig);

        // Write Docker configuration
        const dockerConfig = JSON.stringify(deploymentConfig.docker, null, 2);
        await fs.writeFile('cloudflare-docker.json', dockerConfig);

        log('info', 'Cloudflare deployment files generated');
    }

    /**
     * Create initial data
     */
    async createInitialData() {
        log('info', 'Creating initial data...');

        try {
            // Create default API key for admin
            if (process.env.CREATE_ADMIN_API_KEY === 'true') {
                const adminUserId = process.env.ADMIN_USER_ID || 'admin@system.local';
                
                const result = await this.poolManager.query(
                    'SELECT generate_api_key($1, $2, $3)',
                    [
                        'System Admin Key',
                        adminUserId,
                        JSON.stringify(['admin'])
                    ]
                );

                const apiKeyData = result.rows[0].generate_api_key;
                log('info', `Admin API key created: ${apiKeyData.api_key}`);
                
                // Save to secure location or environment
                if (process.env.SAVE_API_KEY_TO_FILE === 'true') {
                    await fs.writeFile('.admin-api-key', apiKeyData.api_key, { mode: 0o600 });
                }
            }

            // Insert sample configuration if in development
            if (process.env.NODE_ENV === 'development') {
                await this.createSampleData();
            }

            log('info', 'Initial data creation completed');
        } catch (error) {
            log('warn', `Initial data creation failed (non-critical): ${error.message}`);
        }
    }

    /**
     * Create sample data for development
     */
    async createSampleData() {
        log('info', 'Creating sample development data...');

        // Create sample task
        await this.poolManager.query(
            `INSERT INTO tasks (title, description, type, priority, assigned_to, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING`,
            [
                'Sample Task: Setup Database',
                'This is a sample task created during database setup',
                'setup',
                5,
                'system@setup.local',
                JSON.stringify({ created_by: 'setup_script', sample: true })
            ]
        );

        // Create sample configuration
        await this.poolManager.query(
            `INSERT INTO configuration_settings (setting_key, setting_value, setting_type, description)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (setting_key) DO NOTHING`,
            [
                'sample.setup_completed',
                'true',
                'boolean',
                'Indicates that sample setup was completed'
            ]
        );

        log('info', 'Sample data created');
    }

    /**
     * Verify database setup
     */
    async verifySetup() {
        log('info', 'Verifying database setup...');

        const verifications = [
            this.verifyTables(),
            this.verifyIndexes(),
            this.verifyFunctions(),
            this.verifyViews(),
            this.verifyPermissions()
        ];

        const results = await Promise.allSettled(verifications);
        const failures = results.filter(result => result.status === 'rejected');

        if (failures.length > 0) {
            const errors = failures.map(failure => failure.reason.message);
            throw new Error(`Setup verification failed: ${errors.join(', ')}`);
        }

        log('info', 'Database setup verification completed successfully');
    }

    /**
     * Verify all required tables exist
     */
    async verifyTables() {
        const requiredTables = [
            'tasks', 'task_contexts', 'workflow_states', 'audit_logs',
            'task_dependencies', 'performance_metrics', 'schema_migrations',
            'deployment_scripts', 'error_logs', 'webhook_events',
            'api_keys', 'api_access_logs', 'system_metrics', 'configuration_settings'
        ];

        const result = await this.poolManager.query(
            `SELECT table_name FROM information_schema.tables 
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
            [],
            { poolName: 'readonly' }
        );

        const existingTables = result.rows.map(row => row.table_name);
        const missingTables = requiredTables.filter(table => !existingTables.includes(table));

        if (missingTables.length > 0) {
            throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
        }

        log('info', `All ${requiredTables.length} required tables verified`);
    }

    /**
     * Verify indexes exist
     */
    async verifyIndexes() {
        const result = await this.poolManager.query(
            `SELECT count(*) as index_count FROM pg_indexes WHERE schemaname = 'public'`,
            [],
            { poolName: 'readonly' }
        );

        const indexCount = parseInt(result.rows[0].index_count);
        if (indexCount < 20) { // Minimum expected indexes
            throw new Error(`Insufficient indexes found: ${indexCount}`);
        }

        log('info', `Database indexes verified (${indexCount} indexes)`);
    }

    /**
     * Verify functions exist
     */
    async verifyFunctions() {
        const requiredFunctions = [
            'update_updated_at_column',
            'audit_trigger_function',
            'cleanup_old_logs',
            'generate_api_key',
            'refresh_materialized_views'
        ];

        const result = await this.poolManager.query(
            `SELECT routine_name FROM information_schema.routines 
             WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'`,
            [],
            { poolName: 'readonly' }
        );

        const existingFunctions = result.rows.map(row => row.routine_name);
        const missingFunctions = requiredFunctions.filter(func => !existingFunctions.includes(func));

        if (missingFunctions.length > 0) {
            throw new Error(`Missing required functions: ${missingFunctions.join(', ')}`);
        }

        log('info', `All ${requiredFunctions.length} required functions verified`);
    }

    /**
     * Verify views exist
     */
    async verifyViews() {
        const requiredViews = [
            'active_tasks', 'task_summary', 'recent_activity',
            'system_health_dashboard', 'comprehensive_dashboard', 'performance_monitoring'
        ];

        const result = await this.poolManager.query(
            `SELECT table_name FROM information_schema.views WHERE table_schema = 'public'
             UNION
             SELECT matviewname as table_name FROM pg_matviews WHERE schemaname = 'public'`,
            [],
            { poolName: 'readonly' }
        );

        const existingViews = result.rows.map(row => row.table_name);
        const missingViews = requiredViews.filter(view => !existingViews.includes(view));

        if (missingViews.length > 0) {
            throw new Error(`Missing required views: ${missingViews.join(', ')}`);
        }

        log('info', `All ${requiredViews.length} required views verified`);
    }

    /**
     * Verify database permissions
     */
    async verifyPermissions() {
        // Check if roles exist
        const result = await this.poolManager.query(
            `SELECT rolname FROM pg_roles WHERE rolname IN ('authenticated_users', 'api_users', 'readonly_users')`,
            [],
            { poolName: 'readonly' }
        );

        if (result.rows.length < 3) {
            throw new Error('Required database roles not found');
        }

        log('info', 'Database permissions verified');
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.poolManager) {
            await this.poolManager.shutdown();
        }
        if (this.connection) {
            await this.connection.close();
        }
    }
}

/**
 * CLI interface for database setup
 */
async function main() {
    const setup = new DatabaseSetup();
    
    try {
        await setup.setup();
        process.exit(0);
    } catch (error) {
        log('error', `Setup failed: ${error.message}`);
        process.exit(1);
    } finally {
        await setup.cleanup();
    }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { DatabaseSetup };
