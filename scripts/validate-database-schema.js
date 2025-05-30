#!/usr/bin/env node

/**
 * @fileoverview Database Schema Validation Script
 * @description Validates the database schema and tests all components
 * @version 1.0.0
 */

import { getConnection } from '../src/database/connection/connection_manager.js';
import { taskModel, subtaskModel } from '../src/database/models/TaskModel.js';
import { workflowModel, workflowStepModel } from '../src/database/models/WorkflowModel.js';

/**
 * Color codes for console output
 */
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

/**
 * Log with colors
 */
function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Validation test results
 */
const results = {
    passed: 0,
    failed: 0,
    errors: []
};

/**
 * Run a validation test
 */
async function runTest(testName, testFunction) {
    try {
        log(`\n🧪 Testing: ${testName}`, 'blue');
        await testFunction();
        log(`✅ PASSED: ${testName}`, 'green');
        results.passed++;
    } catch (error) {
        log(`❌ FAILED: ${testName}`, 'red');
        log(`   Error: ${error.message}`, 'red');
        results.failed++;
        results.errors.push({ test: testName, error: error.message });
    }
}

/**
 * Validate database connection
 */
async function validateConnection() {
    const db = getConnection();
    await db.initialize();
    
    const result = await db.query('SELECT NOW() as current_time, version() as pg_version');
    if (!result.rows[0]) {
        throw new Error('Failed to get database version');
    }
    
    log(`   Connected to: ${result.rows[0].pg_version}`, 'yellow');
    return db;
}

/**
 * Validate table existence and structure
 */
async function validateTables(db) {
    const expectedTables = [
        'workflows',
        'tasks', 
        'subtasks',
        'task_dependencies',
        'task_files',
        'workflow_executions',
        'workflow_steps',
        'workflow_step_executions',
        'external_dependencies'
    ];

    const query = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
    `;
    
    const result = await db.query(query);
    const actualTables = result.rows.map(row => row.table_name);
    
    for (const table of expectedTables) {
        if (!actualTables.includes(table)) {
            throw new Error(`Missing table: ${table}`);
        }
    }
    
    log(`   Found ${actualTables.length} tables`, 'yellow');
}

/**
 * Validate custom types
 */
async function validateTypes(db) {
    const expectedTypes = [
        'task_status',
        'workflow_status', 
        'workflow_trigger_type',
        'dependency_type',
        'dependency_status'
    ];

    const query = `
        SELECT typname 
        FROM pg_type 
        WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND typtype = 'e'
        ORDER BY typname
    `;
    
    const result = await db.query(query);
    const actualTypes = result.rows.map(row => row.typname);
    
    for (const type of expectedTypes) {
        if (!actualTypes.includes(type)) {
            throw new Error(`Missing custom type: ${type}`);
        }
    }
    
    log(`   Found ${actualTypes.length} custom types`, 'yellow');
}

/**
 * Validate indexes
 */
async function validateIndexes(db) {
    const query = `
        SELECT 
            schemaname,
            tablename,
            indexname,
            indexdef
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
        ORDER BY tablename, indexname
    `;
    
    const result = await db.query(query);
    const indexes = result.rows;
    
    // Check for essential indexes
    const essentialIndexes = [
        'idx_tasks_status',
        'idx_tasks_workflow_id',
        'idx_workflows_status',
        'idx_task_dependencies_task_id',
        'idx_subtasks_parent_task_id'
    ];
    
    const indexNames = indexes.map(idx => idx.indexname);
    
    for (const index of essentialIndexes) {
        if (!indexNames.includes(index)) {
            throw new Error(`Missing essential index: ${index}`);
        }
    }
    
    log(`   Found ${indexes.length} indexes`, 'yellow');
}

/**
 * Validate triggers and functions
 */
async function validateTriggers(db) {
    const query = `
        SELECT 
            trigger_name,
            event_object_table,
            action_statement
        FROM information_schema.triggers 
        WHERE trigger_schema = 'public'
        ORDER BY event_object_table, trigger_name
    `;
    
    const result = await db.query(query);
    const triggers = result.rows;
    
    // Check for essential triggers
    const essentialTriggers = [
        'update_tasks_updated_at',
        'update_workflows_updated_at',
        'check_circular_dependency_trigger',
        'update_dependency_status_trigger'
    ];
    
    const triggerNames = triggers.map(t => t.trigger_name);
    
    for (const trigger of essentialTriggers) {
        if (!triggerNames.includes(trigger)) {
            throw new Error(`Missing essential trigger: ${trigger}`);
        }
    }
    
    log(`   Found ${triggers.length} triggers`, 'yellow');
}

/**
 * Validate views
 */
async function validateViews(db) {
    const query = `
        SELECT table_name 
        FROM information_schema.views 
        WHERE table_schema = 'public'
        ORDER BY table_name
    `;
    
    const result = await db.query(query);
    const views = result.rows.map(row => row.table_name);
    
    const expectedViews = [
        'active_tasks',
        'task_dependency_summary',
        'workflow_execution_summary'
    ];
    
    for (const view of expectedViews) {
        if (!views.includes(view)) {
            throw new Error(`Missing view: ${view}`);
        }
    }
    
    log(`   Found ${views.length} views`, 'yellow');
}

/**
 * Test basic CRUD operations
 */
async function testCrudOperations() {
    // Test workflow creation
    const workflow = await workflowModel.create({
        name: 'Validation Test Workflow',
        description: 'Testing CRUD operations',
        status: 'draft',
        created_by: 'validation-script'
    });
    
    if (!workflow.id) {
        throw new Error('Failed to create workflow');
    }
    
    // Test task creation
    const task = await taskModel.create({
        title: 'Validation Test Task',
        description: 'Testing task CRUD',
        workflow_id: workflow.id,
        priority: 5,
        complexity_score: 50,
        tags: ['validation', 'test'],
        requirements: { type: 'validation' }
    });
    
    if (!task.id) {
        throw new Error('Failed to create task');
    }
    
    // Test subtask creation
    const subtask = await subtaskModel.create({
        parent_task_id: task.id,
        title: 'Validation Test Subtask',
        order_index: 0
    });
    
    if (!subtask.id) {
        throw new Error('Failed to create subtask');
    }
    
    // Test updates
    const updatedTask = await taskModel.update(task.id, {
        status: 'in_progress',
        assigned_to: 'validation-user'
    });
    
    if (updatedTask.status !== 'in_progress') {
        throw new Error('Failed to update task');
    }
    
    // Test queries
    const foundTask = await taskModel.findById(task.id);
    if (!foundTask || foundTask.id !== task.id) {
        throw new Error('Failed to find task by ID');
    }
    
    const tasks = await taskModel.findMany({
        workflow_id: workflow.id,
        limit: 10
    });
    
    if (!tasks.data || tasks.data.length === 0) {
        throw new Error('Failed to find tasks');
    }
    
    // Test hierarchy
    const hierarchy = await taskModel.getHierarchy(task.id);
    if (!hierarchy || hierarchy.length === 0) {
        throw new Error('Failed to get task hierarchy');
    }
    
    // Clean up
    await subtaskModel.delete(subtask.id);
    await taskModel.delete(task.id);
    await workflowModel.delete(workflow.id);
    
    log('   All CRUD operations successful', 'yellow');
}

/**
 * Test dependency management
 */
async function testDependencies(db) {
    // Create test workflow and tasks
    const workflow = await workflowModel.create({
        name: 'Dependency Test Workflow',
        description: 'Testing dependencies',
        status: 'draft'
    });
    
    const task1 = await taskModel.create({
        title: 'Dependency Task 1',
        workflow_id: workflow.id
    });
    
    const task2 = await taskModel.create({
        title: 'Dependency Task 2', 
        workflow_id: workflow.id
    });
    
    // Create dependency
    await db.query(
        'INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type) VALUES ($1, $2, $3)',
        [task2.id, task1.id, 'blocks']
    );
    
    // Test circular dependency prevention
    try {
        await db.query(
            'INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type) VALUES ($1, $2, $3)',
            [task1.id, task2.id, 'blocks']
        );
        throw new Error('Circular dependency was not prevented');
    } catch (error) {
        if (!error.message.includes('Circular dependency detected')) {
            throw error;
        }
    }
    
    // Test dependency status updates
    await taskModel.updateStatus(task1.id, 'completed');
    
    const dependencyResult = await db.query(
        'SELECT status FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2',
        [task2.id, task1.id]
    );
    
    if (dependencyResult.rows[0].status !== 'satisfied') {
        throw new Error('Dependency status was not updated automatically');
    }
    
    // Clean up
    await taskModel.delete(task2.id);
    await taskModel.delete(task1.id);
    await workflowModel.delete(workflow.id);
    
    log('   Dependency management working correctly', 'yellow');
}

/**
 * Test workflow execution
 */
async function testWorkflowExecution() {
    const workflow = await workflowModel.create({
        name: 'Execution Test Workflow',
        description: 'Testing workflow execution',
        status: 'active'
    });
    
    // Start execution
    const execution = await workflowModel.startExecution(workflow.id, {
        trigger_type: 'manual',
        triggered_by: 'validation-script'
    });
    
    if (!execution.id || execution.status !== 'active') {
        throw new Error('Failed to start workflow execution');
    }
    
    // Complete execution
    const completedExecution = await workflowModel.completeExecution(execution.id, {
        status: 'completed',
        total_tasks: 5,
        completed_tasks: 5,
        failed_tasks: 0
    });
    
    if (completedExecution.status !== 'completed') {
        throw new Error('Failed to complete workflow execution');
    }
    
    // Check workflow statistics update
    const updatedWorkflow = await workflowModel.findById(workflow.id);
    if (updatedWorkflow.execution_count !== 1 || updatedWorkflow.success_count !== 1) {
        throw new Error('Workflow statistics were not updated correctly');
    }
    
    // Clean up
    await workflowModel.delete(workflow.id);
    
    log('   Workflow execution tracking working correctly', 'yellow');
}

/**
 * Test search functionality
 */
async function testSearch() {
    const workflow = await workflowModel.create({
        name: 'Search Test Workflow',
        description: 'Testing full-text search capabilities',
        status: 'draft'
    });
    
    const task = await taskModel.create({
        title: 'Searchable Task Title',
        description: 'This task has searchable content for testing',
        workflow_id: workflow.id
    });
    
    // Test task search
    const taskResults = await taskModel.search('searchable content');
    if (!taskResults.some(t => t.id === task.id)) {
        throw new Error('Task search failed to find expected task');
    }
    
    // Test workflow search
    const workflowResults = await workflowModel.search('search capabilities');
    if (!workflowResults.some(w => w.id === workflow.id)) {
        throw new Error('Workflow search failed to find expected workflow');
    }
    
    // Clean up
    await taskModel.delete(task.id);
    await workflowModel.delete(workflow.id);
    
    log('   Search functionality working correctly', 'yellow');
}

/**
 * Test performance with bulk operations
 */
async function testPerformance() {
    const startTime = Date.now();
    
    const workflow = await workflowModel.create({
        name: 'Performance Test Workflow',
        description: 'Testing bulk operations performance'
    });
    
    // Create multiple tasks
    const taskPromises = [];
    for (let i = 0; i < 50; i++) {
        taskPromises.push(taskModel.create({
            title: `Performance Task ${i}`,
            workflow_id: workflow.id,
            priority: i % 5,
            complexity_score: (i * 2) % 100
        }));
    }
    
    const tasks = await Promise.all(taskPromises);
    
    // Query tasks
    const result = await taskModel.findMany({
        workflow_id: workflow.id,
        limit: 100
    });
    
    if (result.data.length !== 50) {
        throw new Error(`Expected 50 tasks, got ${result.data.length}`);
    }
    
    // Clean up
    for (const task of tasks) {
        await taskModel.delete(task.id);
    }
    await workflowModel.delete(workflow.id);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    log(`   Performance test completed in ${duration}ms`, 'yellow');
    
    if (duration > 10000) { // 10 seconds
        throw new Error(`Performance test took too long: ${duration}ms`);
    }
}

/**
 * Main validation function
 */
async function main() {
    log('\n🚀 Starting Database Schema Validation', 'bold');
    log('=' .repeat(50), 'blue');
    
    let db;
    
    try {
        // Database connection test
        await runTest('Database Connection', async () => {
            db = await validateConnection();
        });
        
        // Schema validation tests
        await runTest('Table Structure', () => validateTables(db));
        await runTest('Custom Types', () => validateTypes(db));
        await runTest('Database Indexes', () => validateIndexes(db));
        await runTest('Triggers and Functions', () => validateTriggers(db));
        await runTest('Database Views', () => validateViews(db));
        
        // Functional tests
        await runTest('CRUD Operations', testCrudOperations);
        await runTest('Dependency Management', () => testDependencies(db));
        await runTest('Workflow Execution', testWorkflowExecution);
        await runTest('Search Functionality', testSearch);
        await runTest('Performance Test', testPerformance);
        
    } catch (error) {
        log(`\n💥 Fatal error: ${error.message}`, 'red');
        results.failed++;
        results.errors.push({ test: 'Main Execution', error: error.message });
    } finally {
        if (db) {
            await db.shutdown();
        }
    }
    
    // Print results
    log('\n' + '=' .repeat(50), 'blue');
    log('📊 VALIDATION RESULTS', 'bold');
    log('=' .repeat(50), 'blue');
    
    log(`✅ Passed: ${results.passed}`, 'green');
    log(`❌ Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
    
    if (results.errors.length > 0) {
        log('\n🔍 ERROR DETAILS:', 'red');
        results.errors.forEach((error, index) => {
            log(`${index + 1}. ${error.test}: ${error.error}`, 'red');
        });
    }
    
    const successRate = Math.round((results.passed / (results.passed + results.failed)) * 100);
    log(`\n📈 Success Rate: ${successRate}%`, successRate === 100 ? 'green' : 'yellow');
    
    if (results.failed === 0) {
        log('\n🎉 All tests passed! Database schema is valid and functional.', 'green');
        process.exit(0);
    } else {
        log('\n⚠️  Some tests failed. Please review the errors above.', 'red');
        process.exit(1);
    }
}

// Run validation if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        log(`\n💥 Unexpected error: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    });
}

