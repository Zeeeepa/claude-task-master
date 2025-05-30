/**
 * @fileoverview Integration Test for CICD Workflow Orchestration Engine
 * @description Comprehensive test demonstrating the orchestration engine capabilities
 */

import { WorkflowEngine } from './WorkflowEngine.js';
import { log } from '../../scripts/modules/utils.js';

/**
 * Integration test for the CICD Workflow Orchestration Engine
 */
async function runIntegrationTest() {
    log('info', '🚀 Starting CICD Workflow Orchestration Engine Integration Test');

    try {
        // Initialize the workflow engine
        const workflowEngine = new WorkflowEngine({
            enableRetries: true,
            maxRetries: 2,
            enableStatusSync: true,
            enableValidation: true,
            enableLogging: true
        });

        await workflowEngine.initialize();
        log('info', '✅ Workflow Engine initialized successfully');

        // Test workflow creation
        const testRequirements = `
# Test Project Requirements

## Overview
Create a simple user authentication system with the following features:

## Functional Requirements
1. User registration with email and password
2. User login with email/password validation
3. Password reset functionality
4. User profile management
5. Session management with JWT tokens

## Technical Requirements
- Node.js backend with Express.js
- PostgreSQL database
- JWT for authentication
- bcrypt for password hashing
- Input validation and sanitization
- RESTful API design

## Integration Requirements
- Email service for password reset
- Rate limiting for API endpoints
- Logging and monitoring
- Unit and integration tests

## Acceptance Criteria
- All endpoints should return appropriate HTTP status codes
- Passwords must be securely hashed
- JWT tokens should expire after 24 hours
- API should handle errors gracefully
- All functionality should be covered by tests
        `;

        const githubRepoUrl = 'https://github.com/test-org/auth-system';
        
        // Start a test workflow
        log('info', '🔄 Starting test workflow...');
        const workflowId = await workflowEngine.startWorkflow(
            githubRepoUrl,
            testRequirements,
            {
                createdBy: 'integration-test',
                priority: 'high',
                tags: ['test', 'authentication', 'backend']
            }
        );

        log('info', `✅ Workflow started with ID: ${workflowId}`);

        // Monitor workflow progress
        let workflowStatus;
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds timeout

        do {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            workflowStatus = workflowEngine.getWorkflowStatus(workflowId);
            attempts++;
            
            log('info', `📊 Workflow Status: ${workflowStatus.status} (${workflowStatus.progress}% complete)`);
            
            if (workflowStatus.currentStep) {
                log('info', `🔧 Current Step: ${workflowStatus.currentStep}`);
            }

        } while (
            workflowStatus.status === 'running' || 
            workflowStatus.status === 'initializing'
        ) && attempts < maxAttempts;

        // Test workflow control operations
        if (workflowStatus.status === 'running') {
            log('info', '⏸️ Testing workflow pause...');
            await workflowEngine.pauseWorkflow(workflowId);
            
            const pausedStatus = workflowEngine.getWorkflowStatus(workflowId);
            log('info', `✅ Workflow paused: ${pausedStatus.status}`);

            // Wait a moment then resume
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            log('info', '▶️ Testing workflow resume...');
            await workflowEngine.resumeWorkflow(workflowId);
            
            const resumedStatus = workflowEngine.getWorkflowStatus(workflowId);
            log('info', `✅ Workflow resumed: ${resumedStatus.status}`);
        }

        // Test event handling
        workflowEngine.on('stepCompleted', (event) => {
            log('info', `🎯 Step completed: ${event.step.name}`);
        });

        workflowEngine.on('workflowCompleted', (event) => {
            log('info', `🎉 Workflow completed: ${event.workflowId}`);
        });

        workflowEngine.on('workflowFailed', (event) => {
            log('error', `❌ Workflow failed: ${event.workflowId} - ${event.error.message}`);
        });

        // Wait for final status
        await new Promise(resolve => setTimeout(resolve, 5000));
        const finalStatus = workflowEngine.getWorkflowStatus(workflowId);
        
        log('info', '📋 Final Workflow Status:');
        log('info', `  Status: ${finalStatus.status}`);
        log('info', `  Progress: ${finalStatus.progress}%`);
        log('info', `  Duration: ${Math.round(finalStatus.duration / 1000)}s`);
        log('info', `  Steps Completed: ${finalStatus.steps.filter(s => s.status === 'completed').length}/${finalStatus.steps.length}`);

        // Display step details
        if (finalStatus.steps.length > 0) {
            log('info', '📝 Step Details:');
            finalStatus.steps.forEach(step => {
                const status = step.status === 'completed' ? '✅' : 
                              step.status === 'failed' ? '❌' : '⏳';
                log('info', `  ${status} ${step.name}: ${step.status}`);
            });
        }

        // Test multiple concurrent workflows
        log('info', '🔄 Testing concurrent workflows...');
        const concurrentWorkflows = [];
        
        for (let i = 1; i <= 3; i++) {
            const concurrentWorkflowId = await workflowEngine.startWorkflow(
                `https://github.com/test-org/project-${i}`,
                `Simple project ${i} requirements`,
                {
                    createdBy: 'integration-test',
                    priority: 'medium',
                    tags: ['test', `project-${i}`]
                }
            );
            concurrentWorkflows.push(concurrentWorkflowId);
        }

        log('info', `✅ Started ${concurrentWorkflows.length} concurrent workflows`);

        // Wait a moment for concurrent processing
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check status of concurrent workflows
        concurrentWorkflows.forEach((id, index) => {
            const status = workflowEngine.getWorkflowStatus(id);
            log('info', `📊 Concurrent Workflow ${index + 1}: ${status.status} (${status.progress}%)`);
        });

        // Test workflow stopping
        log('info', '🛑 Testing workflow stop...');
        if (concurrentWorkflows.length > 0) {
            await workflowEngine.stopWorkflow(concurrentWorkflows[0], 'Integration test stop');
            const stoppedStatus = workflowEngine.getWorkflowStatus(concurrentWorkflows[0]);
            log('info', `✅ Workflow stopped: ${stoppedStatus.status}`);
        }

        // Test error handling
        log('info', '🧪 Testing error handling...');
        try {
            await workflowEngine.getWorkflowStatus('non-existent-workflow');
        } catch (error) {
            log('info', `✅ Error handling works: ${error.message}`);
        }

        // Shutdown the engine
        log('info', '🔄 Shutting down workflow engine...');
        await workflowEngine.shutdown();
        log('info', '✅ Workflow engine shutdown complete');

        log('info', '🎉 Integration test completed successfully!');
        
        return {
            success: true,
            workflowId,
            finalStatus,
            concurrentWorkflows,
            message: 'All tests passed'
        };

    } catch (error) {
        log('error', `❌ Integration test failed: ${error.message}`);
        log('error', error.stack);
        
        return {
            success: false,
            error: error.message,
            message: 'Integration test failed'
        };
    }
}

/**
 * Run performance test
 */
async function runPerformanceTest() {
    log('info', '⚡ Starting Performance Test');

    const workflowEngine = new WorkflowEngine({
        maxConcurrentWorkflows: 10,
        enableRetries: false,
        enableStatusSync: false,
        enableValidation: false
    });

    await workflowEngine.initialize();

    const startTime = Date.now();
    const workflows = [];

    // Create multiple workflows
    for (let i = 1; i <= 5; i++) {
        const workflowId = await workflowEngine.startWorkflow(
            `https://github.com/perf-test/project-${i}`,
            `Performance test project ${i}`,
            { createdBy: 'performance-test' }
        );
        workflows.push(workflowId);
    }

    // Wait for completion
    let allCompleted = false;
    while (!allCompleted && (Date.now() - startTime) < 30000) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const statuses = workflows.map(id => workflowEngine.getWorkflowStatus(id));
        allCompleted = statuses.every(status => 
            status.status === 'completed' || 
            status.status === 'failed' || 
            status.status === 'stopped'
        );
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    log('info', `⚡ Performance Test Results:`);
    log('info', `  Workflows: ${workflows.length}`);
    log('info', `  Duration: ${duration}ms`);
    log('info', `  Average per workflow: ${Math.round(duration / workflows.length)}ms`);

    await workflowEngine.shutdown();
    
    return {
        workflows: workflows.length,
        duration,
        averagePerWorkflow: Math.round(duration / workflows.length)
    };
}

/**
 * Main test runner
 */
async function main() {
    console.log('🧪 CICD Workflow Orchestration Engine Test Suite');
    console.log('================================================');

    try {
        // Run integration test
        const integrationResult = await runIntegrationTest();
        
        if (integrationResult.success) {
            console.log('\n✅ Integration Test: PASSED');
        } else {
            console.log('\n❌ Integration Test: FAILED');
            console.log(`Error: ${integrationResult.error}`);
        }

        // Run performance test
        console.log('\n⚡ Running Performance Test...');
        const performanceResult = await runPerformanceTest();
        console.log(`✅ Performance Test: ${performanceResult.workflows} workflows in ${performanceResult.duration}ms`);

        console.log('\n🎉 Test Suite Complete!');
        
    } catch (error) {
        console.error('❌ Test Suite Failed:', error);
        process.exit(1);
    }
}

// Export for use as module
export { runIntegrationTest, runPerformanceTest };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

