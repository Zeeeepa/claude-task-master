/**
 * @fileoverview Workflow Orchestrator Examples and Mock Implementations
 * @description Comprehensive examples demonstrating workflow orchestration capabilities
 */

import {
    create_workflow_instance,
    get_workflow_status,
    get_workflow_metrics,
    pause_workflow,
    resume_workflow,
    cancel_workflow,
    list_active_workflows,
    rollback_workflow,
    get_workflow_state_statistics,
    initializeOrchestrator
} from './index.js';

/**
 * Example: Basic workflow creation and execution
 */
export async function example_basic_workflow() {
    console.log('\n=== Basic Workflow Example ===');
    
    try {
        // Initialize orchestrator
        initializeOrchestrator({
            maxConcurrentWorkflows: 10,
            defaultTimeout: 600000 // 10 minutes
        });

        // Create a new workflow
        const workflowId = await create_workflow_instance('task-123', {
            priority: 2,
            context: {
                user_id: 'user-456',
                project: 'example-project'
            },
            metadata: {
                source: 'api',
                version: '1.0.0'
            }
        });

        console.log(`Created workflow: ${workflowId}`);

        // Monitor workflow progress
        const status = await get_workflow_status(workflowId);
        console.log('Initial status:', {
            state: status.current_state,
            progress: `${status.progress_percentage}%`,
            pending_steps: status.pending_steps.length
        });

        // Wait for workflow to progress
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check updated status
        const updatedStatus = await get_workflow_status(workflowId);
        console.log('Updated status:', {
            state: updatedStatus.current_state,
            progress: `${updatedStatus.progress_percentage}%`,
            completed_steps: updatedStatus.completed_steps.length
        });

        return workflowId;
    } catch (error) {
        console.error('Basic workflow example failed:', error);
        throw error;
    }
}

/**
 * Example: Workflow state management and transitions
 */
export async function example_state_management() {
    console.log('\n=== State Management Example ===');
    
    try {
        const workflowId = await create_workflow_instance('task-456', {
            context: { demo: 'state_management' }
        });

        // Monitor state transitions
        let previousState = null;
        for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const status = await get_workflow_status(workflowId);
            if (status.current_state !== previousState) {
                console.log(`State transition: ${previousState} -> ${status.current_state}`);
                previousState = status.current_state;
            }
        }

        // Get state statistics
        const stats = await get_workflow_state_statistics(workflowId);
        console.log('State statistics:', {
            total_transitions: stats.total_transitions,
            current_state: stats.current_state,
            total_duration: `${stats.total_duration_ms}ms`
        });

        return workflowId;
    } catch (error) {
        console.error('State management example failed:', error);
        throw error;
    }
}

/**
 * Example: Workflow pause, resume, and cancellation
 */
export async function example_workflow_control() {
    console.log('\n=== Workflow Control Example ===');
    
    try {
        const workflowId = await create_workflow_instance('task-789', {
            context: { demo: 'workflow_control' }
        });

        // Let workflow run for a bit
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Pause workflow
        console.log('Pausing workflow...');
        await pause_workflow(workflowId);
        
        const pausedStatus = await get_workflow_status(workflowId);
        console.log('Workflow paused:', pausedStatus.current_state);

        // Wait while paused
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Resume workflow
        console.log('Resuming workflow...');
        await resume_workflow(workflowId);
        
        const resumedStatus = await get_workflow_status(workflowId);
        console.log('Workflow resumed:', resumedStatus.current_state);

        return workflowId;
    } catch (error) {
        console.error('Workflow control example failed:', error);
        throw error;
    }
}

/**
 * Example: Multiple concurrent workflows
 */
export async function example_concurrent_workflows() {
    console.log('\n=== Concurrent Workflows Example ===');
    
    try {
        // Create multiple workflows
        const workflowPromises = [];
        for (let i = 0; i < 5; i++) {
            workflowPromises.push(
                create_workflow_instance(`concurrent-task-${i}`, {
                    context: { 
                        demo: 'concurrent_workflows',
                        batch_id: 'batch-001',
                        task_index: i
                    }
                })
            );
        }

        const workflowIds = await Promise.all(workflowPromises);
        console.log(`Created ${workflowIds.length} concurrent workflows`);

        // Monitor all workflows
        for (let iteration = 0; iteration < 3; iteration++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const activeWorkflows = await list_active_workflows();
            console.log(`Iteration ${iteration + 1}: ${activeWorkflows.length} active workflows`);
            
            // Show status of each workflow
            for (const workflow of activeWorkflows) {
                const status = await get_workflow_status(workflow.id);
                console.log(`  ${workflow.id}: ${status.current_state} (${status.progress_percentage}%)`);
            }
        }

        return workflowIds;
    } catch (error) {
        console.error('Concurrent workflows example failed:', error);
        throw error;
    }
}

/**
 * Example: Error handling and recovery
 */
export async function example_error_handling() {
    console.log('\n=== Error Handling Example ===');
    
    try {
        const workflowId = await create_workflow_instance('error-prone-task', {
            context: { 
                demo: 'error_handling',
                simulate_errors: true
            }
        });

        // Monitor workflow with potential errors
        let errorDetected = false;
        for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const status = await get_workflow_status(workflowId);
            
            if (status.current_state.includes('FAILED') && !errorDetected) {
                console.log('Error detected in workflow, checking recovery...');
                errorDetected = true;
            }
            
            console.log(`Status check ${i + 1}: ${status.current_state} (${status.progress_percentage}%)`);
            
            if (status.current_state === 'COMPLETED' || status.current_state === 'FAILED') {
                break;
            }
        }

        const finalMetrics = await get_workflow_metrics(workflowId);
        console.log('Final metrics:', {
            total_duration: `${finalMetrics.total_duration_ms}ms`,
            steps_completed: finalMetrics.steps_completed,
            steps_failed: finalMetrics.steps_failed,
            retry_count: finalMetrics.retry_count
        });

        return workflowId;
    } catch (error) {
        console.error('Error handling example failed:', error);
        throw error;
    }
}

/**
 * Example: Workflow rollback functionality
 */
export async function example_workflow_rollback() {
    console.log('\n=== Workflow Rollback Example ===');
    
    try {
        const workflowId = await create_workflow_instance('rollback-test', {
            context: { demo: 'rollback_functionality' }
        });

        // Let workflow progress
        await new Promise(resolve => setTimeout(resolve, 4000));

        // Get current state
        const beforeRollback = await get_workflow_status(workflowId);
        console.log('Before rollback:', beforeRollback.current_state);

        // Perform rollback
        console.log('Performing rollback...');
        const rollbackSuccess = await rollback_workflow(workflowId, 1);
        
        if (rollbackSuccess) {
            const afterRollback = await get_workflow_status(workflowId);
            console.log('After rollback:', afterRollback.current_state);
        } else {
            console.log('Rollback failed');
        }

        return workflowId;
    } catch (error) {
        console.error('Workflow rollback example failed:', error);
        throw error;
    }
}

/**
 * Example: Performance metrics and monitoring
 */
export async function example_performance_monitoring() {
    console.log('\n=== Performance Monitoring Example ===');
    
    try {
        const workflowId = await create_workflow_instance('performance-test', {
            context: { demo: 'performance_monitoring' }
        });

        // Monitor performance over time
        const performanceData = [];
        
        for (let i = 0; i < 8; i++) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const metrics = await get_workflow_metrics(workflowId);
            const status = await get_workflow_status(workflowId);
            
            performanceData.push({
                timestamp: new Date(),
                state: status.current_state,
                progress: status.progress_percentage,
                duration: metrics.total_duration_ms,
                completed_steps: metrics.steps_completed
            });
            
            console.log(`Performance snapshot ${i + 1}:`, {
                state: status.current_state,
                progress: `${status.progress_percentage}%`,
                duration: `${metrics.total_duration_ms}ms`
            });
        }

        // Analyze performance trends
        console.log('\nPerformance Analysis:');
        console.log(`Total monitoring duration: ${performanceData[performanceData.length - 1].duration}ms`);
        console.log(`Average progress per second: ${(performanceData[performanceData.length - 1].progress / (performanceData[performanceData.length - 1].duration / 1000)).toFixed(2)}%/s`);

        return workflowId;
    } catch (error) {
        console.error('Performance monitoring example failed:', error);
        throw error;
    }
}

/**
 * Run all examples
 */
export async function run_all_examples() {
    console.log('🚀 Starting Workflow Orchestration Examples...\n');
    
    try {
        const results = {};
        
        results.basic = await example_basic_workflow();
        results.stateManagement = await example_state_management();
        results.workflowControl = await example_workflow_control();
        results.concurrent = await example_concurrent_workflows();
        results.errorHandling = await example_error_handling();
        results.rollback = await example_workflow_rollback();
        results.performance = await example_performance_monitoring();
        
        console.log('\n✅ All examples completed successfully!');
        console.log('Results summary:', {
            total_workflows_created: Object.keys(results).length + (results.concurrent?.length || 0) - 1,
            examples_run: Object.keys(results).length
        });
        
        return results;
    } catch (error) {
        console.error('❌ Examples failed:', error);
        throw error;
    }
}

/**
 * Mock workflow scenario: Complex dependency resolution
 */
export async function mock_complex_dependency_workflow() {
    console.log('\n=== Complex Dependency Workflow Mock ===');
    
    // This would demonstrate complex dependency resolution
    // In a real implementation, this would show how the system handles:
    // - Parallel step execution
    // - Complex dependency chains
    // - Dynamic step generation based on results
    
    console.log('Mock: Complex dependency resolution completed');
    return 'mock-complex-workflow-id';
}

/**
 * Mock workflow scenario: High-volume concurrent processing
 */
export async function mock_high_volume_processing() {
    console.log('\n=== High-Volume Processing Mock ===');
    
    // This would demonstrate high-volume concurrent processing
    // In a real implementation, this would show:
    // - 50+ concurrent workflows
    // - Resource management
    // - Performance optimization
    
    console.log('Mock: High-volume processing simulation completed');
    return 'mock-high-volume-id';
}

// Export all examples for easy access
export const examples = {
    basic: example_basic_workflow,
    stateManagement: example_state_management,
    workflowControl: example_workflow_control,
    concurrent: example_concurrent_workflows,
    errorHandling: example_error_handling,
    rollback: example_workflow_rollback,
    performance: example_performance_monitoring,
    runAll: run_all_examples
};

