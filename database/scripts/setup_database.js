/**
 * setup_database.js
 * Database setup and initialization script
 */

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseSetup {
    constructor(connectionString) {
        this.connectionString = connectionString;
        this.pool = new Pool({ connectionString });
    }

    /**
     * Main setup function
     */
    async setup() {
        console.log('🚀 Starting database setup...');
        
        try {
            // Test connection
            await this.testConnection();
            console.log('✅ Database connection established');

            // Run migrations
            await this.runMigrations();
            console.log('✅ Database migrations completed');

            // Apply seed data
            await this.applySeedData();
            console.log('✅ Seed data applied');

            // Verify setup
            await this.verifySetup();
            console.log('✅ Database setup completed successfully!');

        } catch (error) {
            console.error('❌ Database setup failed:', error);
            throw error;
        }
    }

    /**
     * Test database connection
     */
    async testConnection() {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT NOW()');
            console.log(`   Connected to database at: ${result.rows[0].now}`);
        } finally {
            client.release();
        }
    }

    /**
     * Run database migrations
     */
    async runMigrations() {
        const migrationsDir = path.join(__dirname, '../migrations');
        const migrationFiles = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        console.log(`   Found ${migrationFiles.length} migration files`);

        for (const file of migrationFiles) {
            await this.runMigration(path.join(migrationsDir, file));
        }
    }

    /**
     * Run individual migration
     */
    async runMigration(filePath) {
        const fileName = path.basename(filePath);
        console.log(`   Running migration: ${fileName}`);

        const sql = fs.readFileSync(filePath, 'utf8');
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('COMMIT');
            console.log(`   ✅ Migration ${fileName} completed`);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`   ❌ Migration ${fileName} failed:`, error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Apply seed data
     */
    async applySeedData() {
        const seedsDir = path.join(__dirname, '../seeds');
        
        if (!fs.existsSync(seedsDir)) {
            console.log('   No seeds directory found, skipping seed data');
            return;
        }

        const seedFiles = fs.readdirSync(seedsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        console.log(`   Found ${seedFiles.length} seed files`);

        for (const file of seedFiles) {
            await this.applySeedFile(path.join(seedsDir, file));
        }
    }

    /**
     * Apply individual seed file
     */
    async applySeedFile(filePath) {
        const fileName = path.basename(filePath);
        console.log(`   Applying seed: ${fileName}`);

        const sql = fs.readFileSync(filePath, 'utf8');
        const client = await this.pool.connect();
        
        try {
            await client.query(sql);
            console.log(`   ✅ Seed ${fileName} applied`);
        } catch (error) {
            console.error(`   ❌ Seed ${fileName} failed:`, error.message);
            // Don't throw for seed errors, just log them
        } finally {
            client.release();
        }
    }

    /**
     * Verify database setup
     */
    async verifySetup() {
        const queries = [
            { name: 'Tables', query: "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'" },
            { name: 'Indexes', query: "SELECT COUNT(*) as count FROM pg_indexes WHERE schemaname = 'public'" },
            { name: 'Functions', query: "SELECT COUNT(*) as count FROM information_schema.routines WHERE routine_schema = 'public'" },
            { name: 'Triggers', query: "SELECT COUNT(*) as count FROM information_schema.triggers WHERE trigger_schema = 'public'" }
        ];

        console.log('   Database verification:');
        
        for (const { name, query } of queries) {
            try {
                const result = await this.pool.query(query);
                console.log(`     ${name}: ${result.rows[0].count}`);
            } catch (error) {
                console.error(`     ❌ Failed to verify ${name}:`, error.message);
            }
        }

        // Check specific tables
        const tables = [
            'projects', 'workflows', 'tasks', 'components', 'events',
            'templates', 'performance_metrics', 'system_health'
        ];

        console.log('   Core tables verification:');
        for (const table of tables) {
            try {
                const result = await this.pool.query(`SELECT COUNT(*) as count FROM ${table}`);
                console.log(`     ${table}: ${result.rows[0].count} records`);
            } catch (error) {
                console.error(`     ❌ Table ${table} not found or accessible`);
            }
        }
    }

    /**
     * Reset database (WARNING: Destructive operation)
     */
    async reset() {
        console.log('⚠️  WARNING: This will destroy all data in the database!');
        
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            
            // Drop all tables in correct order (respecting foreign keys)
            const dropQueries = [
                'DROP TABLE IF EXISTS alerts CASCADE',
                'DROP TABLE IF EXISTS task_analytics CASCADE',
                'DROP TABLE IF EXISTS workflow_analytics CASCADE',
                'DROP TABLE IF EXISTS system_health CASCADE',
                'DROP TABLE IF EXISTS performance_metrics CASCADE',
                'DROP TABLE IF EXISTS knowledge_base CASCADE',
                'DROP TABLE IF EXISTS learning_data CASCADE',
                'DROP TABLE IF EXISTS execution_history CASCADE',
                'DROP TABLE IF EXISTS template_usage_history CASCADE',
                'DROP TABLE IF EXISTS templates CASCADE',
                'DROP TABLE IF EXISTS events CASCADE',
                'DROP TABLE IF EXISTS component_communications CASCADE',
                'DROP TABLE IF EXISTS components CASCADE',
                'DROP TABLE IF EXISTS task_dependencies CASCADE',
                'DROP TABLE IF EXISTS tasks CASCADE',
                'DROP TABLE IF EXISTS workflows CASCADE',
                'DROP TABLE IF EXISTS projects CASCADE',
                'DROP TABLE IF EXISTS schema_migrations CASCADE',
                'DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE',
                'DROP FUNCTION IF EXISTS update_template_usage_stats() CASCADE'
            ];

            for (const query of dropQueries) {
                await client.query(query);
            }

            await client.query('COMMIT');
            console.log('✅ Database reset completed');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Database reset failed:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Close database connection
     */
    async close() {
        await this.pool.end();
    }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const command = process.argv[2] || 'setup';
    const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/taskmaster';
    
    const setup = new DatabaseSetup(connectionString);
    
    const executeCommand = async () => {
        switch (command) {
            case 'setup':
                await setup.setup();
                break;
            case 'reset':
                await setup.reset();
                break;
            case 'verify':
                await setup.testConnection();
                await setup.verifySetup();
                break;
            default:
                console.log('Usage: node setup_database.js [setup|reset|verify]');
                process.exit(1);
        }
    };
    
    executeCommand()
        .then(() => {
            console.log(`✅ Command '${command}' completed successfully!`);
            process.exit(0);
        })
        .catch((error) => {
            console.error(`❌ Command '${command}' failed:`, error);
            process.exit(1);
        })
        .finally(() => {
            setup.close();
        });
}

export default DatabaseSetup;

