/**
 * @fileoverview Initial Database Schema Migration
 * @description Creates the complete database schema for the AI CI/CD system
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Migration: 001 - Initial Schema
 * Creates all tables, indexes, triggers, and views for the AI CI/CD system
 */
export class Migration001InitialSchema {
  constructor() {
    this.version = '001';
    this.description = 'Initial schema creation for AI CI/CD system';
    this.checksum = 'ai_cicd_schema_v1_0_0';
  }

  /**
   * Apply the migration
   * @param {Object} connectionManager - Database connection manager
   * @returns {Promise<void>}
   */
  async up(connectionManager) {
    console.log('Applying migration 001: Initial Schema');
    
    try {
      // Read the schema SQL file
      const schemaPath = path.join(__dirname, '..', 'schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      
      // Execute the schema creation in a transaction
      await connectionManager.executeTransaction(async (client) => {
        // Split the SQL into individual statements
        const statements = this._splitSqlStatements(schemaSql);
        
        for (const statement of statements) {
          if (statement.trim()) {
            await client.query(statement);
          }
        }
        
        // Insert migration record
        await client.query(
          'INSERT INTO schema_migrations (version, description, checksum) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING',
          [this.version, this.description, this.checksum]
        );
      });
      
      console.log('Migration 001 applied successfully');
      
    } catch (error) {
      console.error('Failed to apply migration 001:', error.message);
      throw error;
    }
  }

  /**
   * Rollback the migration
   * @param {Object} connectionManager - Database connection manager
   * @returns {Promise<void>}
   */
  async down(connectionManager) {
    console.log('Rolling back migration 001: Initial Schema');
    
    try {
      await connectionManager.executeTransaction(async (client) => {
        // Drop all views
        await client.query('DROP VIEW IF EXISTS recent_activity CASCADE');
        await client.query('DROP VIEW IF EXISTS error_summary CASCADE');
        await client.query('DROP VIEW IF EXISTS pr_validation_summary CASCADE');
        await client.query('DROP VIEW IF EXISTS task_execution_summary CASCADE');
        await client.query('DROP VIEW IF EXISTS active_tasks CASCADE');
        
        // Drop all triggers
        await client.query('DROP TRIGGER IF EXISTS audit_system_config_trigger ON system_config');
        await client.query('DROP TRIGGER IF EXISTS audit_error_logs_trigger ON error_logs');
        await client.query('DROP TRIGGER IF EXISTS audit_pr_validations_trigger ON pr_validations');
        await client.query('DROP TRIGGER IF EXISTS audit_task_executions_trigger ON task_executions');
        await client.query('DROP TRIGGER IF EXISTS audit_tasks_trigger ON tasks');
        await client.query('DROP TRIGGER IF EXISTS update_system_config_updated_at ON system_config');
        await client.query('DROP TRIGGER IF EXISTS update_pr_validations_updated_at ON pr_validations');
        await client.query('DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks');
        
        // Drop all functions
        await client.query('DROP FUNCTION IF EXISTS audit_trigger_function() CASCADE');
        await client.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE');
        
        // Drop all tables in reverse dependency order
        await client.query('DROP TABLE IF EXISTS audit_logs CASCADE');
        await client.query('DROP TABLE IF EXISTS system_config CASCADE');
        await client.query('DROP TABLE IF EXISTS error_logs CASCADE');
        await client.query('DROP TABLE IF EXISTS pr_validations CASCADE');
        await client.query('DROP TABLE IF EXISTS task_executions CASCADE');
        await client.query('DROP TABLE IF EXISTS tasks CASCADE');
        
        // Drop extensions
        await client.query('DROP EXTENSION IF EXISTS "uuid-ossp"');
        
        // Remove migration record
        await client.query('DELETE FROM schema_migrations WHERE version = $1', [this.version]);
      });
      
      console.log('Migration 001 rolled back successfully');
      
    } catch (error) {
      console.error('Failed to rollback migration 001:', error.message);
      throw error;
    }
  }

  /**
   * Check if migration has been applied
   * @param {Object} connectionManager - Database connection manager
   * @returns {Promise<boolean>} True if migration has been applied
   */
  async isApplied(connectionManager) {
    try {
      const result = await connectionManager.executeQuery(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [this.version]
      );
      return result.rows.length > 0;
    } catch (error) {
      // If schema_migrations table doesn't exist, migration hasn't been applied
      return false;
    }
  }

  /**
   * Validate migration integrity
   * @param {Object} connectionManager - Database connection manager
   * @returns {Promise<Object>} Validation result
   */
  async validate(connectionManager) {
    const errors = [];
    const warnings = [];
    
    try {
      // Check if all required tables exist
      const requiredTables = [
        'tasks', 'task_executions', 'pr_validations', 
        'error_logs', 'system_config', 'audit_logs'
      ];
      
      for (const table of requiredTables) {
        const result = await connectionManager.executeQuery(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = $1
          )`,
          [table]
        );
        
        if (!result.rows[0].exists) {
          errors.push(`Required table '${table}' does not exist`);
        }
      }
      
      // Check if all required views exist
      const requiredViews = [
        'active_tasks', 'task_execution_summary', 'pr_validation_summary',
        'error_summary', 'recent_activity'
      ];
      
      for (const view of requiredViews) {
        const result = await connectionManager.executeQuery(
          `SELECT EXISTS (
            SELECT FROM information_schema.views 
            WHERE table_schema = 'public' AND table_name = $1
          )`,
          [view]
        );
        
        if (!result.rows[0].exists) {
          warnings.push(`View '${view}' does not exist`);
        }
      }
      
      // Check if UUID extension is enabled
      const result = await connectionManager.executeQuery(
        "SELECT EXISTS (SELECT FROM pg_extension WHERE extname = 'uuid-ossp')"
      );
      
      if (!result.rows[0].exists) {
        errors.push('UUID extension is not enabled');
      }
      
    } catch (error) {
      errors.push(`Validation failed: ${error.message}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Split SQL file into individual statements
   * @param {string} sql - SQL content
   * @returns {Array<string>} Array of SQL statements
   * @private
   */
  _splitSqlStatements(sql) {
    // Remove comments and split by semicolons
    const statements = [];
    const lines = sql.split('\n');
    let currentStatement = '';
    let inFunction = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('--')) {
        continue;
      }
      
      // Track if we're inside a function definition
      if (trimmedLine.includes('CREATE OR REPLACE FUNCTION') || trimmedLine.includes('CREATE FUNCTION')) {
        inFunction = true;
      }
      
      currentStatement += line + '\n';
      
      // End of statement
      if (trimmedLine.endsWith(';')) {
        if (inFunction && (trimmedLine.includes('language') || trimmedLine.includes('LANGUAGE'))) {
          inFunction = false;
        }
        
        if (!inFunction) {
          statements.push(currentStatement.trim());
          currentStatement = '';
        }
      }
    }
    
    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }
    
    return statements;
  }
}

export default Migration001InitialSchema;

