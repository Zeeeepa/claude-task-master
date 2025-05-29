import { getConnection } from '../connection/connection_manager.js';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Database migration runner with proper version management and rollback support
 */
export class MigrationRunner {
    constructor(options = {}) {
        this.options = {
            migrationsDir: options.migrationsDir || join(__dirname, 'sql'),
            migrationsSchema: options.migrationsSchema || 'public',
            migrationsTable: options.migrationsTable || 'schema_migrations',
            ...options
        };
        this.db = null;
    }

    /**
     * Initialize migration runner and create migrations table
     */
    async initialize() {
        this.db = getConnection();
        await this._createMigrationsTable();
        console.log('✅ Migration runner initialized');
    }

    /**
     * Get migration status
     */
    async getStatus() {
        const appliedMigrations = await this._getAppliedMigrations();
        const availableMigrations = await this._getAvailableMigrations();
        
        const applied = new Set(appliedMigrations.map(m => m.version));
        const pending = availableMigrations.filter(m => !applied.has(m.version));
        
        return {
            total: availableMigrations.length,
            applied: appliedMigrations.length,
            pending: pending.length,
            pendingMigrations: pending,
            lastApplied: appliedMigrations[0] || null
        };
    }

    /**
     * Run all pending migrations
     */
    async runMigrations() {
        const status = await this.getStatus();
        
        if (status.pending === 0) {
            console.log('✅ No pending migrations');
            return [];
        }

        console.log(`🔄 Running ${status.pending} pending migrations...`);
        const results = [];

        for (const migration of status.pendingMigrations) {
            try {
                console.log(`📄 Applying migration: ${migration.version} - ${migration.name}`);
                await this._runMigration(migration);
                results.push({ ...migration, status: 'success' });
                console.log(`✅ Migration ${migration.version} applied successfully`);
            } catch (error) {
                console.error(`❌ Migration ${migration.version} failed:`, error);
                results.push({ ...migration, status: 'failed', error: error.message });
                throw new Error(`Migration ${migration.version} failed: ${error.message}`);
            }
        }

        console.log(`✅ All ${results.length} migrations applied successfully`);
        return results;
    }

    /**
     * Rollback the last migration
     */
    async rollbackLast() {
        const appliedMigrations = await this._getAppliedMigrations();
        
        if (appliedMigrations.length === 0) {
            throw new Error('No migrations to rollback');
        }

        const lastMigration = appliedMigrations[0];
        console.log(`🔄 Rolling back migration: ${lastMigration.version}`);

        try {
            await this._rollbackMigration(lastMigration);
            console.log(`✅ Migration ${lastMigration.version} rolled back successfully`);
            return lastMigration;
        } catch (error) {
            console.error(`❌ Rollback failed for migration ${lastMigration.version}:`, error);
            throw error;
        }
    }

    /**
     * Create a new migration file
     */
    async createMigration(name) {
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const version = timestamp; // Use full timestamp to prevent collisions
        const filename = `${version}_${name.toLowerCase().replace(/\s+/g, '_')}.js`;
        const filepath = join(this.options.migrationsDir, filename);

        const template = `/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */

export async function up(db) {
    // Add your migration logic here
    await db.query(\`
        -- Your SQL here
    \`);
}

export async function down(db) {
    // Add your rollback logic here
    await db.query(\`
        -- Your rollback SQL here
    \`);
}
`;

        await writeFile(filepath, template);
        console.log(`✅ Created migration: ${filename}`);
        return { version, filename, filepath };
    }

    // Private methods
    async _createMigrationsTable() {
        await this.db.query(`
            CREATE TABLE IF NOT EXISTS ${this.options.migrationsSchema}.${this.options.migrationsTable} (
                version VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                execution_time_ms INTEGER,
                checksum VARCHAR(64)
            )
        `);
    }

    async _getAppliedMigrations() {
        const result = await this.db.query(`
            SELECT version, name, applied_at, execution_time_ms, checksum
            FROM ${this.options.migrationsSchema}.${this.options.migrationsTable}
            ORDER BY applied_at DESC
        `);
        return result.rows;
    }

    async _getAvailableMigrations() {
        try {
            const files = await readdir(this.options.migrationsDir);
            const migrationFiles = files
                .filter(file => file.endsWith('.js'))
                .sort();

            const migrations = [];
            for (const file of migrationFiles) {
                const match = file.match(/^(\d{14})_(.+)\.js$/);
                if (match) {
                    migrations.push({
                        version: match[1],
                        name: match[2].replace(/_/g, ' '),
                        filename: file,
                        filepath: join(this.options.migrationsDir, file)
                    });
                }
            }

            return migrations;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.warn(`⚠️  Migrations directory not found: ${this.options.migrationsDir}`);
                return [];
            }
            throw error;
        }
    }

    async _runMigration(migration) {
        const startTime = Date.now();
        
        await this.db.transaction(async (client) => {
            // Load and execute migration
            const migrationModule = await import(migration.filepath);
            if (!migrationModule.up) {
                throw new Error(`Migration ${migration.version} missing 'up' function`);
            }

            await migrationModule.up(client);

            // Calculate checksum
            const content = await readFile(migration.filepath, 'utf8');
            const checksum = this._calculateChecksum(content);
            const executionTime = Date.now() - startTime;

            // Record migration
            await client.query(`
                INSERT INTO ${this.options.migrationsSchema}.${this.options.migrationsTable}
                (version, name, execution_time_ms, checksum)
                VALUES ($1, $2, $3, $4)
            `, [migration.version, migration.name, executionTime, checksum]);
        });
    }

    async _rollbackMigration(migration) {
        await this.db.transaction(async (client) => {
            // Load migration file
            const migrationModule = await import(migration.filepath);
            if (!migrationModule.down) {
                throw new Error(`Migration ${migration.version} missing 'down' function`);
            }

            await migrationModule.down(client);

            // Remove migration record
            await client.query(`
                DELETE FROM ${this.options.migrationsSchema}.${this.options.migrationsTable}
                WHERE version = $1
            `, [migration.version]);
        });
    }

    _calculateChecksum(content) {
        const crypto = await import('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
    }
}

