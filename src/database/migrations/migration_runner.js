/**
 * Database Migration Runner for Claude Task Master
 * Handles schema migrations, rollbacks, and version tracking
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import db from '../connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Migration Runner Class
 */
class MigrationRunner {
  constructor() {
    this.migrationsDir = __dirname;
    this.migrationTable = 'schema_migrations';
  }

  /**
   * Initialize migration system
   */
  async initialize() {
    try {
      await db.initialize();
      await this.ensureMigrationTable();
      console.log('Migration system initialized');
    } catch (error) {
      console.error('Failed to initialize migration system:', error.message);
      throw error;
    }
  }

  /**
   * Ensure migration tracking table exists
   */
  async ensureMigrationTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${this.migrationTable} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        version VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW(),
        execution_time INTERVAL,
        checksum VARCHAR(64),
        CONSTRAINT valid_version CHECK (version ~ '^[0-9]{3}_[a-zA-Z0-9_]+$')
      );
    `;

    await db.query(createTableQuery);
  }

  /**
   * Get all migration files
   */
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsDir);
      return files
        .filter(file => file.endsWith('.js') && file !== 'migration_runner.js')
        .sort()
        .map(file => ({
          filename: file,
          version: file.replace('.js', ''),
          path: path.join(this.migrationsDir, file)
        }));
    } catch (error) {
      console.error('Error reading migration files:', error.message);
      return [];
    }
  }

  /**
   * Get executed migrations from database
   */
  async getExecutedMigrations() {
    try {
      const result = await db.query(
        `SELECT version, name, executed_at, checksum FROM ${this.migrationTable} ORDER BY version`
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching executed migrations:', error.message);
      return [];
    }
  }

  /**
   * Calculate file checksum
   */
  async calculateChecksum(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (error) {
      console.error('Error calculating checksum:', error.message);
      return null;
    }
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations() {
    const migrationFiles = await this.getMigrationFiles();
    const executedMigrations = await this.getExecutedMigrations();
    const executedVersions = new Set(executedMigrations.map(m => m.version));

    return migrationFiles.filter(file => !executedVersions.has(file.version));
  }

  /**
   * Execute a single migration
   */
  async executeMigration(migrationFile) {
    const startTime = Date.now();
    
    try {
      console.log(`Executing migration: ${migrationFile.version}`);
      
      // Calculate checksum
      const checksum = await this.calculateChecksum(migrationFile.path);
      
      // Import and execute migration
      const migration = await import(migrationFile.path);
      
      if (typeof migration.up !== 'function') {
        throw new Error(`Migration ${migrationFile.version} does not export an 'up' function`);
      }

      // Execute migration in transaction
      await db.transaction(async (client) => {
        // Execute migration
        await migration.up(client);
        
        // Record migration execution
        const executionTime = Date.now() - startTime;
        await client.query(
          `INSERT INTO ${this.migrationTable} (version, name, execution_time, checksum) 
           VALUES ($1, $2, $3, $4)`,
          [
            migrationFile.version,
            migrationFile.filename,
            `${executionTime} milliseconds`,
            checksum
          ]
        );
      });

      const duration = Date.now() - startTime;
      console.log(`✅ Migration ${migrationFile.version} executed successfully in ${duration}ms`);
      
      return { success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Migration ${migrationFile.version} failed after ${duration}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Rollback a single migration
   */
  async rollbackMigration(migrationFile) {
    const startTime = Date.now();
    
    try {
      console.log(`Rolling back migration: ${migrationFile.version}`);
      
      // Import migration
      const migration = await import(migrationFile.path);
      
      if (typeof migration.down !== 'function') {
        throw new Error(`Migration ${migrationFile.version} does not export a 'down' function`);
      }

      // Execute rollback in transaction
      await db.transaction(async (client) => {
        // Execute rollback
        await migration.down(client);
        
        // Remove migration record
        await client.query(
          `DELETE FROM ${this.migrationTable} WHERE version = $1`,
          [migrationFile.version]
        );
      });

      const duration = Date.now() - startTime;
      console.log(`✅ Migration ${migrationFile.version} rolled back successfully in ${duration}ms`);
      
      return { success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Rollback of ${migrationFile.version} failed after ${duration}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async migrate() {
    try {
      await this.initialize();
      
      const pendingMigrations = await this.getPendingMigrations();
      
      if (pendingMigrations.length === 0) {
        console.log('No pending migrations to execute');
        return { executed: 0, migrations: [] };
      }

      console.log(`Found ${pendingMigrations.length} pending migration(s)`);
      
      const results = [];
      let totalDuration = 0;

      for (const migration of pendingMigrations) {
        const result = await this.executeMigration(migration);
        results.push({ migration: migration.version, ...result });
        totalDuration += result.duration;
      }

      console.log(`✅ All migrations completed successfully in ${totalDuration}ms`);
      
      return {
        executed: pendingMigrations.length,
        migrations: results,
        totalDuration
      };
    } catch (error) {
      console.error('Migration failed:', error.message);
      throw error;
    }
  }

  /**
   * Rollback the last migration
   */
  async rollback() {
    try {
      await this.initialize();
      
      const executedMigrations = await this.getExecutedMigrations();
      
      if (executedMigrations.length === 0) {
        console.log('No migrations to rollback');
        return { rolledBack: 0 };
      }

      const lastMigration = executedMigrations[executedMigrations.length - 1];
      const migrationFiles = await this.getMigrationFiles();
      const migrationFile = migrationFiles.find(f => f.version === lastMigration.version);

      if (!migrationFile) {
        throw new Error(`Migration file not found for version: ${lastMigration.version}`);
      }

      const result = await this.rollbackMigration(migrationFile);
      
      console.log(`✅ Rollback completed successfully`);
      
      return {
        rolledBack: 1,
        migration: lastMigration.version,
        ...result
      };
    } catch (error) {
      console.error('Rollback failed:', error.message);
      throw error;
    }
  }

  /**
   * Get migration status
   */
  async status() {
    try {
      await this.initialize();
      
      const migrationFiles = await this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();
      const executedVersions = new Map(executedMigrations.map(m => [m.version, m]));

      const status = migrationFiles.map(file => {
        const executed = executedVersions.get(file.version);
        return {
          version: file.version,
          name: file.filename,
          status: executed ? 'executed' : 'pending',
          executedAt: executed?.executed_at || null,
          checksum: executed?.checksum || null
        };
      });

      return {
        total: migrationFiles.length,
        executed: executedMigrations.length,
        pending: migrationFiles.length - executedMigrations.length,
        migrations: status
      };
    } catch (error) {
      console.error('Error getting migration status:', error.message);
      throw error;
    }
  }

  /**
   * Validate migration integrity
   */
  async validate() {
    try {
      await this.initialize();
      
      const migrationFiles = await this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();
      const issues = [];

      for (const executed of executedMigrations) {
        const file = migrationFiles.find(f => f.version === executed.version);
        
        if (!file) {
          issues.push({
            type: 'missing_file',
            version: executed.version,
            message: `Migration file not found for executed migration: ${executed.version}`
          });
          continue;
        }

        const currentChecksum = await this.calculateChecksum(file.path);
        if (currentChecksum !== executed.checksum) {
          issues.push({
            type: 'checksum_mismatch',
            version: executed.version,
            message: `Checksum mismatch for migration: ${executed.version}`,
            expected: executed.checksum,
            actual: currentChecksum
          });
        }
      }

      return {
        valid: issues.length === 0,
        issues
      };
    } catch (error) {
      console.error('Error validating migrations:', error.message);
      throw error;
    }
  }

  /**
   * Create a new migration file
   */
  async createMigration(name) {
    try {
      if (!name) {
        throw new Error('Migration name is required');
      }

      // Generate version number (timestamp-based)
      const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      const version = `${timestamp}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const filename = `${version}.js`;
      const filepath = path.join(this.migrationsDir, filename);

      // Check if file already exists
      try {
        await fs.access(filepath);
        throw new Error(`Migration file already exists: ${filename}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      // Create migration template
      const template = `/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */

/**
 * Apply migration
 * @param {import('pg').PoolClient} client - Database client
 */
export async function up(client) {
  // Add your migration logic here
  // Example:
  // await client.query(\`
  //   CREATE TABLE example (
  //     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //     name VARCHAR(255) NOT NULL,
  //     created_at TIMESTAMP DEFAULT NOW()
  //   );
  // \`);
}

/**
 * Rollback migration
 * @param {import('pg').PoolClient} client - Database client
 */
export async function down(client) {
  // Add your rollback logic here
  // Example:
  // await client.query('DROP TABLE IF EXISTS example;');
}
`;

      await fs.writeFile(filepath, template, 'utf8');
      
      console.log(`✅ Created migration: ${filename}`);
      
      return {
        version,
        filename,
        filepath
      };
    } catch (error) {
      console.error('Error creating migration:', error.message);
      throw error;
    }
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new MigrationRunner();
  const command = process.argv[2];
  const arg = process.argv[3];

  try {
    switch (command) {
      case 'migrate':
        await runner.migrate();
        break;
      case 'rollback':
        await runner.rollback();
        break;
      case 'status':
        const status = await runner.status();
        console.log('\nMigration Status:');
        console.log(`Total: ${status.total}, Executed: ${status.executed}, Pending: ${status.pending}\n`);
        status.migrations.forEach(m => {
          const statusIcon = m.status === 'executed' ? '✅' : '⏳';
          console.log(`${statusIcon} ${m.version} - ${m.status}`);
        });
        break;
      case 'validate':
        const validation = await runner.validate();
        if (validation.valid) {
          console.log('✅ All migrations are valid');
        } else {
          console.log('❌ Migration validation failed:');
          validation.issues.forEach(issue => {
            console.log(`  - ${issue.type}: ${issue.message}`);
          });
        }
        break;
      case 'create':
        if (!arg) {
          console.error('Migration name is required');
          process.exit(1);
        }
        await runner.createMigration(arg);
        break;
      default:
        console.log('Usage: node migration_runner.js <command> [args]');
        console.log('Commands:');
        console.log('  migrate          - Run all pending migrations');
        console.log('  rollback         - Rollback the last migration');
        console.log('  status           - Show migration status');
        console.log('  validate         - Validate migration integrity');
        console.log('  create <name>    - Create a new migration file');
        break;
    }
  } catch (error) {
    console.error('Command failed:', error.message);
    process.exit(1);
  } finally {
    await db.close();
  }
}

export default MigrationRunner;

