/**
 * @fileoverview Initial Database Schema Migration
 * @description Creates the consolidated database schema from the provided db.sql
 * @version 1.0.0
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const up = async (client) => {
    console.log('Running initial schema migration...');
    
    try {
        // Read the consolidated schema file
        const schemaPath = join(__dirname, '../schema/consolidated_schema.sql');
        const schemaSQL = readFileSync(schemaPath, 'utf8');
        
        // Execute the schema creation
        await client.query(schemaSQL);
        
        // Read and execute indexes
        const indexesPath = join(__dirname, '../schema/indexes.sql');
        const indexesSQL = readFileSync(indexesPath, 'utf8');
        await client.query(indexesSQL);
        
        // Insert initial data
        await client.query(`
            -- Insert default project
            INSERT INTO projects (name, description, repository_url, repository_name, settings)
            VALUES (
                'Claude Task Master',
                'AI-powered task management system',
                'https://github.com/Zeeeepa/claude-task-master',
                'claude-task-master',
                '{
                    "default_agent": "codegen",
                    "auto_assign": true,
                    "validation_required": true,
                    "max_concurrent_tasks": 10
                }'::jsonb
            ) ON CONFLICT (name) DO NOTHING;
        `);
        
        // Insert default agent configurations
        const projectResult = await client.query(
            "SELECT id FROM projects WHERE name = 'Claude Task Master' LIMIT 1"
        );
        
        if (projectResult.rows.length > 0) {
            const projectId = projectResult.rows[0].id;
            
            await client.query(`
                INSERT INTO agent_configurations (project_id, agent_type, agent_name, configuration, capabilities)
                VALUES 
                ($1, 'codegen', 'primary-codegen', '{
                    "api_url": "https://api.codegen.sh",
                    "timeout": 30000,
                    "max_retries": 3,
                    "auto_pr_creation": true
                }'::jsonb, '[
                    "code_generation",
                    "pr_creation",
                    "code_review",
                    "testing"
                ]'::jsonb),
                ($1, 'claude_code', 'primary-claude', '{
                    "model": "claude-3-sonnet",
                    "max_tokens": 4096,
                    "temperature": 0.1
                }'::jsonb, '[
                    "code_analysis",
                    "code_generation",
                    "debugging",
                    "optimization"
                ]'::jsonb),
                ($1, 'webhook_orchestrator', 'primary-webhook', '{
                    "github_webhook_secret": "placeholder",
                    "linear_webhook_secret": "placeholder",
                    "max_concurrent_webhooks": 50
                }'::jsonb, '[
                    "webhook_processing",
                    "event_routing",
                    "notification_handling"
                ]'::jsonb),
                ($1, 'task_manager', 'primary-task-manager', '{
                    "max_concurrent_tasks": 10,
                    "task_timeout": 600000,
                    "auto_retry": true,
                    "retry_attempts": 3
                }'::jsonb, '[
                    "task_scheduling",
                    "task_execution",
                    "dependency_management",
                    "resource_allocation"
                ]'::jsonb)
                ON CONFLICT (project_id, agent_type, agent_name) DO NOTHING;
            `, [projectId]);
        }
        
        console.log('✅ Initial schema migration completed successfully');
        
    } catch (error) {
        console.error('❌ Initial schema migration failed:', error);
        throw error;
    }
};

export const down = async (client) => {
    console.log('Rolling back initial schema migration...');
    
    try {
        // Drop all tables in reverse dependency order
        const dropQueries = [
            'DROP VIEW IF EXISTS pr_validation_status CASCADE;',
            'DROP VIEW IF EXISTS task_execution_summary CASCADE;',
            'DROP VIEW IF EXISTS active_tasks CASCADE;',
            
            'DROP TABLE IF EXISTS dependencies CASCADE;',
            'DROP TABLE IF EXISTS agent_configurations CASCADE;',
            'DROP TABLE IF EXISTS workflow_events CASCADE;',
            'DROP TABLE IF EXISTS validations CASCADE;',
            'DROP TABLE IF EXISTS pull_requests CASCADE;',
            'DROP TABLE IF EXISTS task_executions CASCADE;',
            'DROP TABLE IF EXISTS tasks CASCADE;',
            'DROP TABLE IF EXISTS projects CASCADE;',
            
            'DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;',
            
            'DROP TYPE IF EXISTS validation_result CASCADE;',
            'DROP TYPE IF EXISTS execution_status CASCADE;',
            'DROP TYPE IF EXISTS pr_status CASCADE;',
            'DROP TYPE IF EXISTS agent_type CASCADE;',
            'DROP TYPE IF EXISTS task_status CASCADE;'
        ];
        
        for (const query of dropQueries) {
            await client.query(query);
        }
        
        console.log('✅ Initial schema rollback completed successfully');
        
    } catch (error) {
        console.error('❌ Initial schema rollback failed:', error);
        throw error;
    }
};

export const description = 'Create initial database schema with all tables, indexes, and default data';
export const version = '001';
export const timestamp = '20250529010000';

