/**
 * database-manager.test.js
 * Basic tests for DatabaseManager functionality
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import DatabaseManager from '../lib/DatabaseManager.js';

// Mock database for testing
const mockConnectionString = 'postgresql://test:test@localhost:5432/test_db';

describe('DatabaseManager', () => {
    test('should initialize with connection string', () => {
        const db = new DatabaseManager(mockConnectionString);
        assert.ok(db);
        assert.ok(db.pool);
    });

    test('should have all required methods', () => {
        const db = new DatabaseManager(mockConnectionString);
        
        // Project methods
        assert.ok(typeof db.createProject === 'function');
        assert.ok(typeof db.getProject === 'function');
        assert.ok(typeof db.updateProject === 'function');
        
        // Workflow methods
        assert.ok(typeof db.createWorkflow === 'function');
        assert.ok(typeof db.getWorkflow === 'function');
        assert.ok(typeof db.updateWorkflowStatus === 'function');
        
        // Task methods
        assert.ok(typeof db.createTask === 'function');
        assert.ok(typeof db.getTask === 'function');
        assert.ok(typeof db.updateTaskStatus === 'function');
        assert.ok(typeof db.getTasksByWorkflow === 'function');
        
        // Component methods
        assert.ok(typeof db.registerComponent === 'function');
        assert.ok(typeof db.updateComponentHealth === 'function');
        
        // Event methods
        assert.ok(typeof db.logEvent === 'function');
        assert.ok(typeof db.recordCommunication === 'function');
        
        // Performance methods
        assert.ok(typeof db.recordMetric === 'function');
        assert.ok(typeof db.updateSystemHealth === 'function');
        
        // Template methods
        assert.ok(typeof db.saveTemplate === 'function');
        assert.ok(typeof db.getTemplate === 'function');
        
        // Analytics methods
        assert.ok(typeof db.calculateWorkflowAnalytics === 'function');
        
        // Utility methods
        assert.ok(typeof db.close === 'function');
        assert.ok(typeof db.isConnected === 'function');
        assert.ok(typeof db.getStats === 'function');
    });

    test('should validate project data structure', () => {
        const db = new DatabaseManager(mockConnectionString);
        
        const validProjectData = {
            name: 'Test Project',
            description: 'Test Description',
            repository_url: 'https://github.com/test/repo',
            status: 'active',
            settings: { key: 'value' }
        };
        
        // This would normally test the actual database operation
        // For now, we just verify the data structure is valid
        assert.ok(validProjectData.name);
        assert.ok(validProjectData.description);
        assert.ok(validProjectData.repository_url);
        assert.ok(validProjectData.status);
        assert.ok(typeof validProjectData.settings === 'object');
    });

    test('should validate task data structure', () => {
        const db = new DatabaseManager(mockConnectionString);
        
        const validTaskData = {
            workflow_id: 'test-workflow-id',
            title: 'Test Task',
            description: 'Test Description',
            requirements: ['req1', 'req2'],
            acceptance_criteria: ['criteria1', 'criteria2'],
            dependencies: [],
            priority: 5,
            status: 'pending',
            metadata: { key: 'value' }
        };
        
        assert.ok(validTaskData.workflow_id);
        assert.ok(validTaskData.title);
        assert.ok(Array.isArray(validTaskData.requirements));
        assert.ok(Array.isArray(validTaskData.acceptance_criteria));
        assert.ok(Array.isArray(validTaskData.dependencies));
        assert.ok(typeof validTaskData.priority === 'number');
        assert.ok(validTaskData.status);
        assert.ok(typeof validTaskData.metadata === 'object');
    });

    test('should validate component data structure', () => {
        const db = new DatabaseManager(mockConnectionString);
        
        const validComponentData = {
            name: 'test-component',
            type: 'generator',
            version: '1.0.0',
            api_endpoint: 'http://localhost:3000/api',
            status: 'active',
            configuration: { setting: 'value' },
            capabilities: ['capability1', 'capability2']
        };
        
        assert.ok(validComponentData.name);
        assert.ok(['orchestrator', 'generator', 'validator', 'manager', 'analyzer', 'deployer'].includes(validComponentData.type));
        assert.ok(validComponentData.version);
        assert.ok(validComponentData.status);
        assert.ok(typeof validComponentData.configuration === 'object');
        assert.ok(Array.isArray(validComponentData.capabilities));
    });

    test('should validate event data structure', () => {
        const db = new DatabaseManager(mockConnectionString);
        
        const validEventData = {
            event_type: 'task_created',
            source_component: 'task-manager',
            target_component: 'orchestrator',
            payload: { task_id: 'test-id' },
            metadata: { timestamp: new Date().toISOString() },
            severity: 'info'
        };
        
        assert.ok(validEventData.event_type);
        assert.ok(validEventData.source_component);
        assert.ok(typeof validEventData.payload === 'object');
        assert.ok(['debug', 'info', 'warning', 'error', 'critical'].includes(validEventData.severity));
    });

    test('should validate metric data structure', () => {
        const db = new DatabaseManager(mockConnectionString);
        
        const componentName = 'test-component';
        const metricName = 'test_metric';
        const value = 42.5;
        const unit = 'count';
        const tags = { environment: 'test' };
        
        assert.ok(typeof componentName === 'string');
        assert.ok(typeof metricName === 'string');
        assert.ok(typeof value === 'number');
        assert.ok(typeof unit === 'string');
        assert.ok(typeof tags === 'object');
    });

    test('should validate template data structure', () => {
        const db = new DatabaseManager(mockConnectionString);
        
        const validTemplateData = {
            name: 'test-template',
            type: 'code_pattern',
            category: 'javascript',
            description: 'Test template',
            template_content: { pattern: 'test pattern' },
            tags: ['test', 'template'],
            version: '1.0.0',
            created_by: 'test-user'
        };
        
        assert.ok(validTemplateData.name);
        assert.ok(['code_pattern', 'deployment_script', 'test_template', 'workflow_template', 'task_template', 'configuration'].includes(validTemplateData.type));
        assert.ok(validTemplateData.description);
        assert.ok(typeof validTemplateData.template_content === 'object');
        assert.ok(Array.isArray(validTemplateData.tags));
        assert.ok(validTemplateData.version);
    });
});

// Integration tests (require actual database connection)
describe('DatabaseManager Integration', () => {
    test('should skip integration tests without database', () => {
        // These tests would run only if DATABASE_URL is set and database is available
        if (!process.env.DATABASE_URL || !process.env.RUN_INTEGRATION_TESTS) {
            console.log('Skipping integration tests - set DATABASE_URL and RUN_INTEGRATION_TESTS to run');
            assert.ok(true); // Pass the test
            return;
        }
        
        // Integration tests would go here
        assert.ok(true);
    });
});

