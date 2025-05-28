/**
 * Database Migration Runner
 * Claude Task Master AI-Driven CI/CD System
 * 
 * Handles version-controlled schema evolution and data migrations
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, transaction, getDatabaseConfig } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migration tracking table
const MIGRATION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    execution_time_ms INTEGER,
    checksum VARCHAR(64),
    applied_by VARCHAR(100) DEFAULT current_user
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at);
`;

/**
 * Initialize migration tracking
 */
export async function initializeMigrations() {
    const { mode } = getDatabaseConfig();
    
    if (mode !== 'postgres') {
        console.log('ℹ️ Migrations are only supported in PostgreSQL mode');
        return;
    }
    
    try {
        await query(MIGRATION_TABLE_SQL);
        console.log('✅ Migration tracking initialized');
    } catch (error) {
        console.error('❌ Failed to initialize migration tracking:', error);
        throw error;
    }
}

/**
 * Get list of available migration files
 */
async function getAvailableMigrations() {
    const migrationsDir = path.join(__dirname);
    const files = await fs.readdir(migrationsDir);
    
    return files
        .filter(file => file.endsWith('.sql') && file !== 'migration-runner.js')
        .sort()
        .map(file => {
            const match = file.match(/^(\d+)_(.+)\.sql$/);
            if (match) {
                return {
                    version: match[1],
                    name: match[2].replace(/_/g, ' '),
                    filename: file,
                    path: path.join(migrationsDir, file)
                };
            }
            return null;
        })
        .filter(Boolean);
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations() {
    try {
        const result = await query(`
            SELECT version, name, applied_at, execution_time_ms, checksum
            FROM schema_migrations
            ORDER BY version
        `);
        return result.rows;
    } catch (error) {
        // If table doesn't exist, return empty array
        if (error.code === '42P01') {
            return [];
        }
        throw error;
    }
}

/**
 * Calculate checksum for migration file
 */
async function calculateChecksum(filePath) {
    const crypto = await import('crypto');
    const content = await fs.readFile(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Execute a single migration
 */
async function executeMigration(migration) {
    const startTime = Date.now();
    
    try {
        console.log(`🔄 Applying migration ${migration.version}: ${migration.name}`);
        
        // Read migration file
        const sql = await fs.readFile(migration.path, 'utf8');
        const checksum = await calculateChecksum(migration.path);
        
        // Execute migration in transaction
        await transaction(async (client) => {
            // Execute the migration SQL
            await client.query(sql);
            
            // Record migration as applied
            const executionTime = Date.now() - startTime;
            await client.query(`
                INSERT INTO schema_migrations (version, name, execution_time_ms, checksum)
                VALUES ($1, $2, $3, $4)
            `, [migration.version, migration.name, executionTime, checksum]);
        });
        
        const executionTime = Date.now() - startTime;
        console.log(`✅ Migration ${migration.version} applied successfully (${executionTime}ms)`);
        
        return { success: true, executionTime };
    } catch (error) {
        console.error(`❌ Migration ${migration.version} failed:`, error);
        throw error;
    }
}

/**
 * Run pending migrations
 */
export async function runMigrations() {
    const { mode } = getDatabaseConfig();
    
    if (mode !== 'postgres') {
        console.log('ℹ️ Migrations are only supported in PostgreSQL mode');
        return { success: true, message: 'Local mode - no migrations needed' };
    }
    
    try {
        // Initialize migration tracking
        await initializeMigrations();
        
        // Get available and applied migrations
        const availableMigrations = await getAvailableMigrations();
        const appliedMigrations = await getAppliedMigrations();
        const appliedVersions = new Set(appliedMigrations.map(m => m.version));
        
        // Find pending migrations
        const pendingMigrations = availableMigrations.filter(
            migration => !appliedVersions.has(migration.version)
        );
        
        if (pendingMigrations.length === 0) {
            console.log('✅ No pending migrations');
            return { success: true, message: 'No pending migrations' };
        }
        
        console.log(`📋 Found ${pendingMigrations.length} pending migration(s)`);
        
        // Execute pending migrations
        const results = [];
        for (const migration of pendingMigrations) {
            const result = await executeMigration(migration);
            results.push({ migration: migration.version, ...result });
        }
        
        console.log(`✅ Applied ${pendingMigrations.length} migration(s) successfully`);
        
        return {
            success: true,
            appliedCount: pendingMigrations.length,
            results
        };
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get migration status
 */
export async function getMigrationStatus() {
    const { mode } = getDatabaseConfig();
    
    if (mode !== 'postgres') {
        return {
            mode: 'local',
            message: 'Migrations not applicable in local mode'
        };
    }
    
    try {
        const availableMigrations = await getAvailableMigrations();
        const appliedMigrations = await getAppliedMigrations();
        const appliedVersions = new Set(appliedMigrations.map(m => m.version));
        
        const status = availableMigrations.map(migration => ({
            version: migration.version,
            name: migration.name,
            filename: migration.filename,
            applied: appliedVersions.has(migration.version),
            appliedAt: appliedMigrations.find(m => m.version === migration.version)?.applied_at,
            executionTime: appliedMigrations.find(m => m.version === migration.version)?.execution_time_ms
        }));
        
        const pendingCount = status.filter(s => !s.applied).length;
        
        return {
            mode: 'postgres',
            totalMigrations: availableMigrations.length,
            appliedMigrations: appliedMigrations.length,
            pendingMigrations: pendingCount,
            status
        };
        
    } catch (error) {
        return {
            mode: 'postgres',
            error: error.message
        };
    }
}

/**
 * Validate migration integrity
 */
export async function validateMigrations() {
    const { mode } = getDatabaseConfig();
    
    if (mode !== 'postgres') {
        return { valid: true, message: 'Local mode - no validation needed' };
    }
    
    try {
        const availableMigrations = await getAvailableMigrations();
        const appliedMigrations = await getAppliedMigrations();
        
        const issues = [];
        
        // Check for checksum mismatches
        for (const applied of appliedMigrations) {
            const available = availableMigrations.find(m => m.version === applied.version);
            if (available) {
                const currentChecksum = await calculateChecksum(available.path);
                if (currentChecksum !== applied.checksum) {
                    issues.push({
                        type: 'checksum_mismatch',
                        version: applied.version,
                        message: `Migration ${applied.version} has been modified after application`
                    });
                }
            } else {
                issues.push({
                    type: 'missing_file',
                    version: applied.version,
                    message: `Migration file for version ${applied.version} not found`
                });
            }
        }
        
        // Check for gaps in version sequence
        const versions = availableMigrations.map(m => parseInt(m.version)).sort((a, b) => a - b);
        for (let i = 1; i < versions.length; i++) {
            if (versions[i] !== versions[i - 1] + 1) {
                issues.push({
                    type: 'version_gap',
                    message: `Gap in migration versions between ${versions[i - 1]} and ${versions[i]}`
                });
            }
        }
        
        return {
            valid: issues.length === 0,
            issues
        };
        
    } catch (error) {
        return {
            valid: false,
            error: error.message
        };
    }
}

/**
 * Create a new migration file template
 */
export async function createMigration(name) {
    try {
        const availableMigrations = await getAvailableMigrations();
        const lastVersion = availableMigrations.length > 0 
            ? Math.max(...availableMigrations.map(m => parseInt(m.version)))
            : 0;
        
        const newVersion = String(lastVersion + 1).padStart(3, '0');
        const filename = `${newVersion}_${name.toLowerCase().replace(/\s+/g, '_')}.sql`;
        const filePath = path.join(__dirname, filename);
        
        const template = `-- Migration: ${name}
-- Version: ${newVersion}
-- Created: ${new Date().toISOString()}

-- Add your migration SQL here
-- Example:
-- CREATE TABLE example_table (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     name VARCHAR(255) NOT NULL,
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- Remember to:
-- 1. Make changes backwards compatible when possible
-- 2. Add appropriate indexes
-- 3. Include data migration if needed
-- 4. Test thoroughly before applying to production
`;
        
        await fs.writeFile(filePath, template);
        
        console.log(`✅ Created migration file: ${filename}`);
        
        return {
            success: true,
            version: newVersion,
            filename,
            path: filePath
        };
        
    } catch (error) {
        console.error('❌ Failed to create migration:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Rollback last migration (dangerous operation)
 */
export async function rollbackLastMigration() {
    const { mode } = getDatabaseConfig();
    
    if (mode !== 'postgres') {
        return { success: false, message: 'Rollback not supported in local mode' };
    }
    
    try {
        const appliedMigrations = await getAppliedMigrations();
        
        if (appliedMigrations.length === 0) {
            return { success: false, message: 'No migrations to rollback' };
        }
        
        const lastMigration = appliedMigrations[appliedMigrations.length - 1];
        
        console.warn(`⚠️ Rolling back migration ${lastMigration.version}: ${lastMigration.name}`);
        console.warn('⚠️ This is a dangerous operation and may result in data loss!');
        
        // Remove migration record
        await query(`
            DELETE FROM schema_migrations 
            WHERE version = $1
        `, [lastMigration.version]);
        
        console.log(`✅ Rollback completed for migration ${lastMigration.version}`);
        console.warn('⚠️ Note: Schema changes were NOT automatically reverted. Manual cleanup may be required.');
        
        return {
            success: true,
            rolledBackVersion: lastMigration.version,
            warning: 'Schema changes were not automatically reverted'
        };
        
    } catch (error) {
        console.error('❌ Rollback failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

