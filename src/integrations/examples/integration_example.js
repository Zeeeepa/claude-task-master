/**
 * @fileoverview Claude Code Integration Example
 * @description Comprehensive usage examples for Claude Code integration
 */

import { createClaudeCodeIntegration, quickSetup } from '../index.js';

/**
 * Basic task execution example
 */
export async function basicTaskExecution() {
    console.log('🚀 Starting Basic Task Execution Example');
    
    const integration = quickSetup.development();
    
    try {
        await integration.initialize();
        console.log('✅ Integration initialized');

        const task = {
            id: 'example-001',
            title: 'Create a simple utility function',
            description: 'Create a utility function that validates email addresses using regex',
            type: 'feature',
            requirements: [
                'Function should accept email string as parameter',
                'Return boolean indicating if email is valid',
                'Use proper regex pattern for email validation',
                'Include JSDoc documentation'
            ]
        };

        console.log(`📝 Executing task: ${task.title}`);
        
        const result = await integration.executeTask(task, {
            waitForCompletion: true,
            createWorkspace: false // No workspace needed for simple tasks
        });

        console.log('✅ Task completed successfully!');
        console.log('📊 Results:', result.results.summary);
        
        return result;
    } catch (error) {
        console.error('❌ Task execution failed:', error.message);
        throw error;
    } finally {
        await integration.shutdown();
        console.log('🧹 Integration shutdown complete');
    }
}

/**
 * Workspace-based task execution example
 */
export async function workspaceTaskExecution() {
    console.log('🚀 Starting Workspace Task Execution Example');
    
    const integration = createClaudeCodeIntegration({
        environment: 'development',
        workspace: {
            basePath: '/tmp/workspace-example',
            maxConcurrent: 5
        }
    });
    
    try {
        await integration.initialize();
        console.log('✅ Integration initialized');

        const task = {
            id: 'example-002',
            title: 'Add input validation to existing project',
            description: 'Add comprehensive input validation to a Node.js project',
            type: 'enhancement',
            requirements: [
                'Add validation middleware for Express routes',
                'Implement email and password validation',
                'Add error handling for validation failures',
                'Update existing routes to use validation',
                'Add unit tests for validation functions'
            ],
            context: 'Working with an existing Express.js application'
        };

        console.log(`📝 Executing task: ${task.title}`);
        console.log('🏗️ Creating workspace with repository...');
        
        const result = await integration.executeTask(task, {
            waitForCompletion: true,
            createWorkspace: true,
            repository: 'https://github.com/example/sample-express-app.git',
            branch: 'main',
            environment: {
                variables: {
                    NODE_ENV: 'development'
                },
                dependencies: {
                    nodePackages: ['joi', 'express-validator']
                },
                setupCommands: [
                    'npm install',
                    'npm run test'
                ]
            },
            cleanupWorkspace: true
        });

        console.log('✅ Task completed successfully!');
        console.log('📊 Results Summary:', result.results.summary);
        console.log('📁 Files Modified:', result.results.filesModified.length);
        console.log('⚡ Commands Executed:', result.results.commandsExecuted.length);
        
        return result;
    } catch (error) {
        console.error('❌ Task execution failed:', error.message);
        throw error;
    } finally {
        await integration.shutdown();
        console.log('🧹 Integration shutdown complete');
    }
}

/**
 * Multiple concurrent tasks example
 */
export async function concurrentTasksExecution() {
    console.log('🚀 Starting Concurrent Tasks Execution Example');
    
    const integration = createClaudeCodeIntegration({
        environment: 'development',
        workspace: {
            maxConcurrent: 3
        },
        claude: {
            maxTokens: 2000 // Smaller token limit for faster execution
        }
    });
    
    try {
        await integration.initialize();
        console.log('✅ Integration initialized');

        const tasks = [
            {
                id: 'concurrent-001',
                title: 'Create README documentation',
                description: 'Create comprehensive README.md for the project',
                type: 'documentation'
            },
            {
                id: 'concurrent-002', 
                title: 'Add error handling',
                description: 'Implement proper error handling throughout the application',
                type: 'enhancement'
            },
            {
                id: 'concurrent-003',
                title: 'Write unit tests',
                description: 'Create unit tests for core functionality',
                type: 'testing'
            }
        ];

        console.log(`📝 Executing ${tasks.length} tasks concurrently...`);
        
        // Start all tasks without waiting for completion
        const executions = await Promise.all(
            tasks.map(task => 
                integration.executeTask(task, {
                    waitForCompletion: false,
                    createWorkspace: false
                })
            )
        );

        console.log('⚡ All tasks started, waiting for completion...');

        // Wait for all tasks to complete
        const results = await Promise.all(
            executions.map(async (execution) => {
                try {
                    return await integration._waitForCompletion(execution.executionId, 60000);
                } catch (error) {
                    console.error(`❌ Task ${execution.executionId} failed:`, error.message);
                    return null;
                }
            })
        );

        const successful = results.filter(r => r !== null).length;
        console.log(`✅ ${successful}/${tasks.length} tasks completed successfully!`);
        
        return { executions, results };
    } catch (error) {
        console.error('❌ Concurrent execution failed:', error.message);
        throw error;
    } finally {
        await integration.shutdown();
        console.log('🧹 Integration shutdown complete');
    }
}

/**
 * Real-time monitoring example
 */
export async function realTimeMonitoring() {
    console.log('🚀 Starting Real-time Monitoring Example');
    
    const integration = quickSetup.development();
    
    // Set up event listeners for monitoring
    integration.on('execution_started', (data) => {
        console.log(`🎬 Execution started: ${data.taskTitle} (${data.executionId})`);
    });

    integration.on('execution_completed', (data) => {
        console.log(`✅ Execution completed: ${data.taskTitle} in ${data.duration}ms`);
    });

    integration.on('execution_failed', (data) => {
        console.log(`❌ Execution failed: ${data.taskTitle} - ${data.error}`);
    });

    integration.on('workspace_created', (data) => {
        console.log(`🏗️ Workspace created: ${data.path}`);
    });

    integration.on('workspace_cleaned', (data) => {
        console.log(`🧹 Workspace cleaned: ${data.path} (${data.duration}ms)`);
    });

    integration.on('agentapi_connected', () => {
        console.log('🔗 AgentAPI connected');
    });

    integration.on('agentapi_disconnected', () => {
        console.log('🔌 AgentAPI disconnected');
    });

    try {
        await integration.initialize();
        console.log('✅ Integration initialized with monitoring');

        const task = {
            id: 'monitoring-001',
            title: 'Create monitoring dashboard',
            description: 'Build a real-time monitoring dashboard for the application',
            type: 'feature',
            requirements: [
                'Display system metrics in real-time',
                'Show active connections and requests',
                'Include error rate monitoring',
                'Add alerting for critical issues'
            ]
        };

        console.log('📝 Starting monitored task execution...');
        
        // Start task execution
        const execution = await integration.executeTask(task, {
            waitForCompletion: false,
            createWorkspace: true,
            repository: 'https://github.com/example/monitoring-app.git'
        });

        console.log('⏱️ Monitoring task execution...');
        
        // Monitor status every 5 seconds
        const monitoringInterval = setInterval(async () => {
            try {
                const status = await integration.getExecutionStatus(execution.executionId);
                const systemStatus = integration.getSystemStatus();
                
                console.log(`📊 Status: ${status.execution.status} | System: ${systemStatus.agentAPI?.connected ? 'Connected' : 'Disconnected'}`);
                
                if (status.execution.status === 'completed' || status.execution.status === 'failed') {
                    clearInterval(monitoringInterval);
                    
                    if (status.execution.status === 'completed') {
                        const results = await integration.getExecutionResults(execution.executionId);
                        console.log('✅ Final results:', results.summary);
                    }
                }
            } catch (error) {
                console.error('❌ Monitoring error:', error.message);
                clearInterval(monitoringInterval);
            }
        }, 5000);

        // Wait for completion with timeout
        setTimeout(() => {
            clearInterval(monitoringInterval);
            console.log('⏰ Monitoring timeout reached');
        }, 120000); // 2 minutes

        return execution;
    } catch (error) {
        console.error('❌ Monitoring example failed:', error.message);
        throw error;
    } finally {
        await integration.shutdown();
        console.log('🧹 Integration shutdown complete');
    }
}

/**
 * Error handling and recovery example
 */
export async function errorHandlingExample() {
    console.log('🚀 Starting Error Handling Example');
    
    const integration = createClaudeCodeIntegration({
        environment: 'development',
        agentAPI: {
            baseURL: 'http://localhost:9999', // Intentionally wrong URL
            timeout: 5000,
            retryAttempts: 2
        }
    });

    try {
        console.log('🔧 Attempting to initialize with invalid configuration...');
        await integration.initialize();
    } catch (error) {
        console.log('❌ Expected initialization failure:', error.message);
        
        // Reconfigure with correct settings
        console.log('🔧 Reconfiguring with correct settings...');
        integration.config.agentAPI.baseURL = 'http://localhost:3284';
        integration.agentAPIClient = null; // Reset client
        
        try {
            await integration.initialize();
            console.log('✅ Recovery successful!');
        } catch (recoveryError) {
            console.log('❌ Recovery failed:', recoveryError.message);
            console.log('💡 This is expected if AgentAPI is not running on localhost:3284');
            return;
        }
    }

    // Test task execution with error scenarios
    const problematicTask = {
        id: 'error-001',
        title: 'Intentionally problematic task',
        description: 'This task is designed to test error handling',
        type: 'test',
        requirements: [
            'Execute invalid command to trigger error',
            'Test error recovery mechanisms',
            'Verify cleanup procedures'
        ]
    };

    try {
        console.log('📝 Executing problematic task...');
        const result = await integration.executeTask(problematicTask, {
            waitForCompletion: true,
            createWorkspace: true,
            timeout: 10000 // Short timeout to trigger timeout error
        });
        
        console.log('✅ Task completed (unexpected):', result.results.summary);
    } catch (error) {
        console.log('❌ Expected task failure:', error.message);
        console.log('🔧 Error handling working correctly');
    }

    await integration.shutdown();
    console.log('🧹 Error handling example complete');
}

/**
 * Run all examples
 */
export async function runAllExamples() {
    console.log('🎯 Running All Claude Code Integration Examples');
    console.log('=' .repeat(60));

    const examples = [
        { name: 'Basic Task Execution', fn: basicTaskExecution },
        { name: 'Workspace Task Execution', fn: workspaceTaskExecution },
        { name: 'Concurrent Tasks', fn: concurrentTasksExecution },
        { name: 'Real-time Monitoring', fn: realTimeMonitoring },
        { name: 'Error Handling', fn: errorHandlingExample }
    ];

    for (const example of examples) {
        try {
            console.log(`\n🏃 Running: ${example.name}`);
            console.log('-'.repeat(40));
            
            await example.fn();
            
            console.log(`✅ ${example.name} completed successfully`);
        } catch (error) {
            console.log(`❌ ${example.name} failed:`, error.message);
        }
        
        console.log('-'.repeat(40));
        
        // Wait between examples
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n🎉 All examples completed!');
    console.log('=' .repeat(60));
}

// Run examples if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples().catch(console.error);
}

