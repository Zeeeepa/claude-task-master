/**
 * @fileoverview Enhanced Database Models Tests
 * @description Comprehensive tests for enhanced Task, Workflow, and AuditLog models
 * @version 2.0.0
 * @created 2025-05-28
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Task } from '../../src/ai_cicd_system/database/models/Task.js';
import { Workflow, WorkflowExecutionStep } from '../../src/ai_cicd_system/database/models/Workflow.js';
import { AuditLog, AuditSummary } from '../../src/ai_cicd_system/database/models/AuditLog.js';

describe('Enhanced Task Model', () => {
    let task;

    beforeEach(() => {
        task = new Task({
            title: 'Test CI/CD Task',
            description: 'A test task for CI/CD pipeline',
            requirements: ['Implement feature X', 'Add tests'],
            acceptance_criteria: ['Feature works', 'Tests pass'],
            complexity_score: 7,
            priority: 'high',
            language: 'javascript',
            framework: 'node.js',
            testing_framework: 'jest',
            repository_url: 'https://github.com/test/repo',
            branch_name: 'feature/test-branch',
            pr_number: 123,
            pr_url: 'https://github.com/test/repo/pull/123',
            codegen_request_id: 'req_123456'
        });
    });

    describe('Constructor and Basic Properties', () => {
        test('should create task with enhanced CI/CD fields', () => {
            expect(task.title).toBe('Test CI/CD Task');
            expect(task.language).toBe('javascript');
            expect(task.framework).toBe('node.js');
            expect(task.repository_url).toBe('https://github.com/test/repo');
            expect(task.branch_name).toBe('feature/test-branch');
            expect(task.pr_number).toBe(123);
            expect(task.retry_count).toBe(0);
            expect(task.error_logs).toEqual([]);
        });

        test('should set default values correctly', () => {
            const defaultTask = new Task();
            expect(defaultTask.priority).toBe('medium');
            expect(defaultTask.status).toBe('pending');
            expect(defaultTask.complexity_score).toBe(5);
            expect(defaultTask.retry_count).toBe(0);
            expect(defaultTask.requirements).toEqual([]);
            expect(defaultTask.acceptance_criteria).toEqual([]);
            expect(defaultTask.error_logs).toEqual([]);
        });
    });

    describe('Enhanced Validation', () => {
        test('should validate enhanced CI/CD fields', () => {
            const validation = task.validate();
            expect(validation.valid).toBe(true);
            expect(validation.errors).toEqual([]);
        });

        test('should validate priority enum values', () => {
            task.priority = 'invalid';
            const validation = task.validate();
            expect(validation.valid).toBe(false);
            expect(validation.errors).toContain('Priority must be one of: low, medium, high, critical');
        });

        test('should validate enhanced status values', () => {
            task.status = 'review';
            const validation = task.validate();
            expect(validation.valid).toBe(true);

            task.status = 'invalid_status';
            const validation2 = task.validate();
            expect(validation2.valid).toBe(false);
        });

        test('should validate URL formats', () => {
            task.repository_url = 'invalid-url';
            const validation = task.validate();
            expect(validation.valid).toBe(false);
            expect(validation.errors).toContain('Repository URL must be a valid URL');
        });

        test('should validate PR number as positive integer', () => {
            task.pr_number = -1;
            const validation = task.validate();
            expect(validation.valid).toBe(false);
            expect(validation.errors).toContain('PR number must be a positive integer');
        });

        test('should provide CI/CD specific warnings', () => {
            task.pr_number = 123;
            task.pr_url = null;
            const validation = task.validate();
            expect(validation.warnings).toContain('Tasks with PR numbers should have PR URLs');
        });
    });

    describe('Enhanced Status Management', () => {
        test('should handle enhanced status transitions', () => {
            const result = task.updateStatus('in_progress');
            expect(result.oldStatus).toBe('pending');
            expect(result.newStatus).toBe('in_progress');
            expect(task.status).toBe('in_progress');
        });

        test('should handle failed status with retry logic', () => {
            const error = new Error('Test error');
            const result = task.updateStatus('failed', { error });
            
            expect(task.status).toBe('failed');
            expect(task.retry_count).toBe(1);
            expect(result.canRetry).toBe(true);
            expect(task.error_logs).toHaveLength(1);
            expect(task.error_logs[0].message).toBe('Test error');
        });

        test('should limit retry count to 10', () => {
            task.retry_count = 10;
            const result = task.updateStatus('failed');
            expect(result.canRetry).toBe(false);
        });
    });

    describe('Error Logging', () => {
        test('should add error log entries', () => {
            const error = new Error('Test error');
            task.addErrorLog(error, { context: 'test' });
            
            expect(task.error_logs).toHaveLength(1);
            expect(task.error_logs[0].message).toBe('Test error');
            expect(task.error_logs[0].context).toEqual({ context: 'test' });
            expect(task.error_logs[0].stack).toBeTruthy();
        });

        test('should limit error logs to 10 entries', () => {
            for (let i = 0; i < 15; i++) {
                task.addErrorLog(`Error ${i}`);
            }
            
            expect(task.error_logs).toHaveLength(10);
            expect(task.error_logs[0].message).toBe('Error 5');
            expect(task.error_logs[9].message).toBe('Error 14');
        });
    });

    describe('CI/CD Pipeline Status', () => {
        test('should get pipeline status', () => {
            const pipelineStatus = task.getPipelineStatus();
            
            expect(pipelineStatus.hasRepository).toBe(true);
            expect(pipelineStatus.hasBranch).toBe(true);
            expect(pipelineStatus.hasPR).toBe(true);
            expect(pipelineStatus.isDeployed).toBe(false);
            expect(pipelineStatus.pipelineStage).toBe('not_started');
        });

        test('should determine pipeline stage correctly', () => {
            expect(task.getPipelineStage()).toBe('not_started');
            
            task.status = 'in_progress';
            expect(task.getPipelineStage()).toBe('development');
            
            task.status = 'review';
            expect(task.getPipelineStage()).toBe('code_review');
            
            task.status = 'completed';
            expect(task.getPipelineStage()).toBe('ready_for_deployment');
            
            task.status = 'deployed';
            expect(task.getPipelineStage()).toBe('deployed');
        });
    });

    describe('Database Serialization', () => {
        test('should convert to database format with enhanced fields', () => {
            const dbData = task.toDatabase();
            
            expect(dbData.repository_url).toBe('https://github.com/test/repo');
            expect(dbData.branch_name).toBe('feature/test-branch');
            expect(dbData.pr_number).toBe(123);
            expect(dbData.codegen_request_id).toBe('req_123456');
            expect(typeof dbData.requirements).toBe('string');
            expect(typeof dbData.error_logs).toBe('string');
        });

        test('should create from database row with enhanced fields', () => {
            const dbRow = {
                id: 'test-id',
                title: 'Test Task',
                repository_url: 'https://github.com/test/repo',
                branch_name: 'main',
                pr_number: 456,
                requirements: '["req1", "req2"]',
                error_logs: '[]',
                retry_count: 2,
                priority: 'high',
                status: 'in_progress'
            };
            
            const taskFromDb = Task.fromDatabase(dbRow);
            expect(taskFromDb.repository_url).toBe('https://github.com/test/repo');
            expect(taskFromDb.pr_number).toBe(456);
            expect(taskFromDb.requirements).toEqual(['req1', 'req2']);
            expect(taskFromDb.retry_count).toBe(2);
        });
    });
});

describe('Workflow Model', () => {
    let workflow;

    beforeEach(() => {
        workflow = new Workflow({
            name: 'Test CI/CD Workflow',
            description: 'A test workflow for CI/CD',
            trigger_type: 'git_push',
            steps: [
                { name: 'Build', type: 'task_creation', config: { timeout: 300 } },
                { name: 'Test', type: 'testing', config: { timeout: 600 } },
                { name: 'Deploy', type: 'deployment', config: { timeout: 900 } }
            ],
            total_steps: 3,
            timeout_minutes: 60,
            max_retries: 3
        });
    });

    describe('Constructor and Basic Properties', () => {
        test('should create workflow with all properties', () => {
            expect(workflow.name).toBe('Test CI/CD Workflow');
            expect(workflow.trigger_type).toBe('git_push');
            expect(workflow.steps).toHaveLength(3);
            expect(workflow.total_steps).toBe(3);
            expect(workflow.current_step).toBe(0);
            expect(workflow.status).toBe('active');
        });
    });

    describe('Validation', () => {
        test('should validate workflow data', () => {
            const validation = workflow.validate();
            expect(validation.valid).toBe(true);
            expect(validation.errors).toEqual([]);
        });

        test('should validate trigger types', () => {
            workflow.trigger_type = 'invalid_trigger';
            const validation = workflow.validate();
            expect(validation.valid).toBe(false);
            expect(validation.errors[0]).toContain('Trigger type must be one of');
        });

        test('should validate steps array', () => {
            workflow.steps = 'invalid';
            const validation = workflow.validate();
            expect(validation.valid).toBe(false);
            expect(validation.errors).toContain('Steps must be an array');
        });
    });

    describe('Step Management', () => {
        test('should advance to next step', () => {
            const result = workflow.advanceStep({ success: true });
            
            expect(result.previousStep).toBe(0);
            expect(result.currentStep).toBe(1);
            expect(workflow.current_step).toBe(1);
            expect(result.isCompleted).toBe(false);
        });

        test('should complete workflow when all steps done', () => {
            workflow.current_step = 2;
            const result = workflow.advanceStep();
            
            expect(result.isCompleted).toBe(true);
            expect(workflow.status).toBe('completed');
            expect(workflow.completed_at).toBeTruthy();
        });

        test('should add new step', () => {
            const newStep = { name: 'Security Scan', type: 'validation', config: {} };
            const result = workflow.addStep(newStep);
            
            expect(workflow.steps).toHaveLength(4);
            expect(workflow.total_steps).toBe(4);
            expect(result.position).toBe(3);
        });

        test('should remove step', () => {
            const result = workflow.removeStep(2);
            
            expect(workflow.steps).toHaveLength(2);
            expect(workflow.total_steps).toBe(2);
            expect(result.removedStep.name).toBe('Deploy');
        });
    });

    describe('Workflow Control', () => {
        test('should pause and resume workflow', () => {
            const pauseResult = workflow.pause();
            expect(workflow.status).toBe('paused');
            expect(pauseResult.action).toBe('paused');
            
            const resumeResult = workflow.resume();
            expect(workflow.status).toBe('active');
            expect(resumeResult.action).toBe('resumed');
        });

        test('should reset workflow', () => {
            workflow.current_step = 2;
            workflow.status = 'failed';
            workflow.retry_count = 1;
            
            const result = workflow.reset();
            
            expect(workflow.current_step).toBe(0);
            expect(workflow.status).toBe('active');
            expect(workflow.retry_count).toBe(0);
            expect(result.action).toBe('reset');
        });
    });

    describe('Progress and Timing', () => {
        test('should calculate progress percentage', () => {
            expect(workflow.getProgress()).toBe(0);
            
            workflow.current_step = 1;
            expect(workflow.getProgress()).toBe(33);
            
            workflow.current_step = 3;
            expect(workflow.getProgress()).toBe(100);
        });

        test('should calculate runtime', () => {
            const pastTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
            workflow.started_at = pastTime;
            
            const runtime = workflow.getRuntime();
            expect(runtime).toBeGreaterThanOrEqual(4);
            expect(runtime).toBeLessThanOrEqual(6);
        });

        test('should detect timeout', () => {
            const pastTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
            workflow.started_at = pastTime;
            workflow.timeout_minutes = 60;
            
            expect(workflow.isTimedOut()).toBe(true);
        });
    });
});

describe('WorkflowExecutionStep Model', () => {
    let step;

    beforeEach(() => {
        step = new WorkflowExecutionStep({
            workflow_id: 'workflow-123',
            step_number: 1,
            step_name: 'Build',
            step_type: 'task_creation',
            step_config: { timeout: 300 }
        });
    });

    describe('Step Execution', () => {
        test('should start step execution', () => {
            step.start();
            
            expect(step.status).toBe('running');
            expect(step.started_at).toBeTruthy();
        });

        test('should complete step execution', () => {
            step.start();
            const result = { success: true, output: 'build completed' };
            const outputData = { artifacts: ['build.zip'] };
            
            step.complete(result, outputData);
            
            expect(step.status).toBe('completed');
            expect(step.completed_at).toBeTruthy();
            expect(step.result).toEqual(result);
            expect(step.output_data).toEqual(outputData);
            expect(step.duration_ms).toBeTruthy();
        });

        test('should fail step execution', () => {
            step.start();
            const error = new Error('Build failed');
            const errorDetails = { exit_code: 1 };
            
            step.fail(error, errorDetails);
            
            expect(step.status).toBe('failed');
            expect(step.error_message).toBe('Build failed');
            expect(step.error_details.exit_code).toBe(1);
            expect(step.retry_count).toBe(1);
        });
    });
});

describe('AuditLog Model', () => {
    let auditLog;

    beforeEach(() => {
        auditLog = new AuditLog({
            entity_type: 'task',
            entity_id: 'task-123',
            action: 'update',
            old_values: { status: 'pending' },
            new_values: { status: 'in_progress' },
            user_id: 'user-456',
            user_name: 'John Doe',
            severity: 'info',
            category: 'business'
        });
    });

    describe('Constructor and Basic Properties', () => {
        test('should create audit log with all properties', () => {
            expect(auditLog.entity_type).toBe('task');
            expect(auditLog.entity_id).toBe('task-123');
            expect(auditLog.action).toBe('update');
            expect(auditLog.user_name).toBe('John Doe');
            expect(auditLog.severity).toBe('info');
        });
    });

    describe('Validation', () => {
        test('should validate audit log data', () => {
            const validation = auditLog.validate();
            expect(validation.valid).toBe(true);
            expect(validation.errors).toEqual([]);
        });

        test('should validate entity types', () => {
            auditLog.entity_type = 'invalid_type';
            const validation = auditLog.validate();
            expect(validation.valid).toBe(false);
            expect(validation.errors[0]).toContain('Entity type must be one of');
        });

        test('should validate actions', () => {
            auditLog.action = 'invalid_action';
            const validation = auditLog.validate();
            expect(validation.valid).toBe(false);
            expect(validation.errors[0]).toContain('Action must be one of');
        });
    });

    describe('Static Factory Methods', () => {
        test('should create audit log for entity creation', () => {
            const createLog = AuditLog.forCreate('task', 'task-123', { title: 'New Task' });
            
            expect(createLog.action).toBe('create');
            expect(createLog.new_values).toEqual({ title: 'New Task' });
            expect(createLog.old_values).toBeNull();
            expect(createLog.category).toBe('data_change');
        });

        test('should create audit log for entity update', () => {
            const oldData = { status: 'pending' };
            const newData = { status: 'completed' };
            const updateLog = AuditLog.forUpdate('task', 'task-123', oldData, newData);
            
            expect(updateLog.action).toBe('update');
            expect(updateLog.old_values).toEqual(oldData);
            expect(updateLog.new_values).toEqual(newData);
            expect(updateLog.changed_fields).toEqual(['status']);
        });

        test('should create audit log for status change', () => {
            const statusLog = AuditLog.forStatusChange('task', 'task-123', 'pending', 'completed');
            
            expect(statusLog.action).toBe('status_change');
            expect(statusLog.old_values).toEqual({ status: 'pending' });
            expect(statusLog.new_values).toEqual({ status: 'completed' });
            expect(statusLog.context.status_transition).toBe('pending -> completed');
        });

        test('should create audit log for security events', () => {
            const securityLog = AuditLog.forSecurity('unauthorized_access', { ip: '192.168.1.1' });
            
            expect(securityLog.action).toBe('unauthorized_access');
            expect(securityLog.category).toBe('security');
            expect(securityLog.severity).toBe('warning');
        });
    });

    describe('Changed Fields Detection', () => {
        test('should detect changed fields', () => {
            const oldData = { status: 'pending', priority: 'low', title: 'Task' };
            const newData = { status: 'completed', priority: 'high', title: 'Task' };
            
            const changedFields = AuditLog.getChangedFields(oldData, newData);
            expect(changedFields).toEqual(['status', 'priority']);
        });

        test('should handle null values', () => {
            const changedFields = AuditLog.getChangedFields(null, { status: 'new' });
            expect(changedFields).toEqual([]);
        });
    });

    describe('Helper Methods', () => {
        test('should set user information', () => {
            auditLog.setUser({ id: 'user-789', email: 'jane@example.com', name: 'Jane Smith' });
            
            expect(auditLog.user_id).toBe('user-789');
            expect(auditLog.user_email).toBe('jane@example.com');
            expect(auditLog.user_name).toBe('Jane Smith');
        });

        test('should set request information', () => {
            auditLog.setRequest({
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                requestId: 'req-123',
                endpoint: '/api/tasks',
                method: 'PUT'
            });
            
            expect(auditLog.ip_address).toBe('192.168.1.1');
            expect(auditLog.user_agent).toBe('Mozilla/5.0');
            expect(auditLog.request_id).toBe('req-123');
            expect(auditLog.api_endpoint).toBe('/api/tasks');
            expect(auditLog.http_method).toBe('PUT');
        });

        test('should detect critical events', () => {
            auditLog.severity = 'critical';
            expect(auditLog.isCritical()).toBe(true);
            
            auditLog.severity = 'info';
            auditLog.action = 'delete';
            expect(auditLog.isCritical()).toBe(true);
            
            auditLog.action = 'update';
            auditLog.category = 'security';
            expect(auditLog.isCritical()).toBe(true);
        });

        test('should generate human-readable description', () => {
            const description = auditLog.getDescription();
            expect(description).toContain('John Doe');
            expect(description).toContain('update');
            expect(description).toContain('task');
        });
    });
});

describe('Database Integration Tests', () => {
    test('should handle complete task lifecycle with audit logging', () => {
        // Create task
        const task = new Task({
            title: 'Integration Test Task',
            repository_url: 'https://github.com/test/repo',
            branch_name: 'feature/integration-test'
        });
        
        // Create audit log for task creation
        const createLog = AuditLog.forCreate('task', task.id, task.toDatabase());
        expect(createLog.action).toBe('create');
        
        // Update task status
        const oldData = { status: task.status };
        task.updateStatus('in_progress');
        const newData = { status: task.status };
        
        const updateLog = AuditLog.forUpdate('task', task.id, oldData, newData);
        expect(updateLog.changed_fields).toContain('status');
        
        // Complete task
        task.updateStatus('completed');
        expect(task.completed_at).toBeTruthy();
        
        const statusLog = AuditLog.forStatusChange('task', task.id, 'in_progress', 'completed');
        expect(statusLog.context.status_transition).toBe('in_progress -> completed');
    });

    test('should handle workflow execution with step tracking', () => {
        // Create workflow
        const workflow = new Workflow({
            name: 'Integration Test Workflow',
            steps: [
                { name: 'Build', type: 'task_creation' },
                { name: 'Test', type: 'testing' }
            ],
            total_steps: 2
        });
        
        // Create execution step
        const step = new WorkflowExecutionStep({
            workflow_id: workflow.id,
            step_number: 0,
            step_name: 'Build',
            step_type: 'task_creation'
        });
        
        // Execute step
        step.start();
        expect(step.status).toBe('running');
        
        step.complete({ success: true }, { artifacts: ['build.zip'] });
        expect(step.status).toBe('completed');
        
        // Advance workflow
        workflow.advanceStep(step.result);
        expect(workflow.current_step).toBe(1);
    });
});

