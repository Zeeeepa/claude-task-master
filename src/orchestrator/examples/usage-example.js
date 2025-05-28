/**
 * @fileoverview System Orchestrator Usage Examples
 * @description Comprehensive examples demonstrating orchestrator capabilities
 */

import { SystemOrchestrator, OrchestratorFactory } from '../index.js';
import { TaskPriority } from '../task-scheduler.js';
import { MessageType } from '../component-coordinator.js';

/**
 * Basic orchestrator usage example
 */
export async function basicOrchestratorUsage() {
    console.log('🚀 Basic Orchestrator Usage Example');
    console.log('=====================================');

    // Create orchestrator with custom configuration
    const orchestrator = new SystemOrchestrator({
        maxConcurrentWorkflows: 5,
        maxConcurrentTasks: 20,
        enableMonitoring: true,
        enableErrorRecovery: true
    });

    try {
        // Initialize the orchestrator
        console.log('📋 Initializing orchestrator...');
        await orchestrator.initialize();
        console.log('✅ Orchestrator initialized successfully');

        // Create a simple workflow
        console.log('\n🔄 Creating workflow...');
        const workflowDefinition = {
            name: 'Data Processing Workflow',
            description: 'Process incoming data through multiple stages',
            steps: [
                {
                    name: 'Data Validation',
                    type: 'task',
                    config: {
                        action: 'validate',
                        timeout: 30000
                    }
                },
                {
                    name: 'Data Transformation',
                    type: 'task',
                    config: {
                        action: 'transform',
                        timeout: 60000
                    }
                },
                {
                    name: 'Data Storage',
                    type: 'task',
                    config: {
                        action: 'store',
                        timeout: 45000
                    }
                }
            ]
        };

        const workflowId = await orchestrator.createWorkflow(workflowDefinition);
        console.log(`✅ Workflow created: ${workflowId}`);

        // Schedule some tasks
        console.log('\n📝 Scheduling tasks...');
        const tasks = [
            {
                name: 'High Priority Analysis',
                type: 'analysis',
                priority: TaskPriority.HIGH,
                payload: { dataset: 'customer_data' }
            },
            {
                name: 'Normal Priority Report',
                type: 'report',
                priority: TaskPriority.NORMAL,
                payload: { reportType: 'monthly' }
            },
            {
                name: 'Low Priority Cleanup',
                type: 'maintenance',
                priority: TaskPriority.LOW,
                payload: { action: 'cleanup_temp_files' }
            }
        ];

        const taskIds = [];
        for (const task of tasks) {
            const taskId = await orchestrator.scheduleTask(task);
            taskIds.push(taskId);
            console.log(`✅ Task scheduled: ${task.name} (${taskId})`);
        }

        // Get system status
        console.log('\n📊 System Status:');
        const status = orchestrator.getStatus();
        console.log(`- Initialized: ${status.initialized}`);
        console.log(`- Uptime: ${status.uptime}ms`);
        console.log(`- Workflows Created: ${status.metrics.workflowsCreated}`);
        console.log(`- Tasks Scheduled: ${status.metrics.tasksScheduled}`);

        // Get workflow status
        const workflowStatus = await orchestrator.getWorkflowStatus(workflowId);
        console.log(`\n🔄 Workflow Status: ${workflowStatus.state}`);
        console.log(`- Progress: ${workflowStatus.progress.toFixed(1)}%`);
        console.log(`- Current Step: ${workflowStatus.currentStep}/${workflowStatus.totalSteps}`);

        // Get task statuses
        console.log('\n📝 Task Statuses:');
        for (const taskId of taskIds) {
            const taskStatus = await orchestrator.getTaskStatus(taskId);
            console.log(`- ${taskStatus.name}: ${taskStatus.state}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        // Cleanup
        console.log('\n🧹 Shutting down orchestrator...');
        await orchestrator.shutdown();
        console.log('✅ Orchestrator shutdown complete');
    }
}

/**
 * Advanced workflow orchestration example
 */
export async function advancedWorkflowExample() {
    console.log('\n🚀 Advanced Workflow Example');
    console.log('=============================');

    const orchestrator = OrchestratorFactory.development({
        maxConcurrentWorkflows: 10
    });

    try {
        await orchestrator.initialize();

        // Create a complex workflow with conditional steps
        const complexWorkflow = {
            name: 'AI Model Training Pipeline',
            description: 'Complete ML model training and deployment pipeline',
            steps: [
                {
                    name: 'Data Preparation',
                    type: 'task',
                    config: {
                        action: 'prepare_data',
                        requirements: ['data_validation', 'feature_engineering']
                    }
                },
                {
                    name: 'Model Training',
                    type: 'task',
                    config: {
                        action: 'train_model',
                        parallel_jobs: 4,
                        timeout: 3600000 // 1 hour
                    }
                },
                {
                    name: 'Model Validation',
                    type: 'condition',
                    condition: 'model_accuracy > 0.85',
                    config: {
                        validation_threshold: 0.85
                    }
                },
                {
                    name: 'Model Deployment',
                    type: 'task',
                    config: {
                        action: 'deploy_model',
                        environment: 'production'
                    }
                }
            ]
        };

        // Set up workflow event handlers
        orchestrator.on('workflowStarted', (data) => {
            console.log(`🔄 Workflow started: ${data.workflow.name}`);
        });

        orchestrator.on('workflowCompleted', (data) => {
            console.log(`✅ Workflow completed: ${data.workflow.name}`);
        });

        orchestrator.on('workflowFailed', (data) => {
            console.log(`❌ Workflow failed: ${data.workflow.name} - ${data.error}`);
        });

        // Mock task execution for demonstration
        orchestrator.workflowManager.on('executeTask', ({ task, callback }) => {
            console.log(`🔧 Executing task: ${task.name}`);
            
            // Simulate task execution
            setTimeout(() => {
                const success = Math.random() > 0.1; // 90% success rate
                if (success) {
                    callback(null, {
                        success: true,
                        result: `${task.name} completed successfully`,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    callback(new Error(`${task.name} failed randomly`));
                }
            }, Math.random() * 2000 + 500); // 0.5-2.5 seconds
        });

        const workflowId = await orchestrator.createWorkflow(complexWorkflow);
        console.log(`✅ Complex workflow created: ${workflowId}`);

        // Start the workflow
        await orchestrator.workflowManager.startWorkflow(workflowId);

        // Wait for completion or failure
        await new Promise((resolve) => {
            const cleanup = () => {
                orchestrator.off('workflowCompleted', onComplete);
                orchestrator.off('workflowFailed', onFailed);
                resolve();
            };

            const onComplete = () => cleanup();
            const onFailed = () => cleanup();

            orchestrator.once('workflowCompleted', onComplete);
            orchestrator.once('workflowFailed', onFailed);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await orchestrator.shutdown();
    }
}

/**
 * Component communication example
 */
export async function componentCommunicationExample() {
    console.log('\n🚀 Component Communication Example');
    console.log('===================================');

    const orchestrator = OrchestratorFactory.testing();

    try {
        await orchestrator.initialize();

        // Register mock components
        const components = [
            {
                id: 'data-processor',
                info: {
                    name: 'Data Processor',
                    type: 'processor',
                    version: '2.1.0',
                    capabilities: ['process', 'validate', 'transform']
                }
            },
            {
                id: 'ml-engine',
                info: {
                    name: 'ML Engine',
                    type: 'ml',
                    version: '1.5.0',
                    capabilities: ['train', 'predict', 'evaluate']
                }
            },
            {
                id: 'notification-service',
                info: {
                    name: 'Notification Service',
                    type: 'service',
                    version: '1.0.0',
                    capabilities: ['email', 'sms', 'webhook']
                }
            }
        ];

        console.log('📡 Registering components...');
        for (const comp of components) {
            await orchestrator.componentCoordinator.registerComponent(comp.id, comp.info);
            console.log(`✅ Registered: ${comp.info.name}`);
        }

        // Mock component message handling
        orchestrator.componentCoordinator.on('messageToComponent', ({ componentId, message }) => {
            console.log(`📨 Message to ${componentId}: ${message.type}`);
            
            // Simulate component processing
            setTimeout(() => {
                orchestrator.componentCoordinator.processMessage({
                    id: `response-${Date.now()}`,
                    type: MessageType.RESPONSE,
                    from: componentId,
                    to: 'orchestrator',
                    correlationId: message.id,
                    payload: {
                        success: true,
                        componentId,
                        processedAt: new Date().toISOString(),
                        result: `Processed ${message.type} message`
                    }
                });
            }, Math.random() * 1000 + 200);
        });

        // Send messages to components
        console.log('\n📤 Sending messages to components...');
        
        const dataProcessorResponse = await orchestrator.sendMessage('data-processor', {
            type: 'process',
            payload: {
                data: [1, 2, 3, 4, 5],
                operation: 'normalize'
            }
        });
        console.log('✅ Data processor response:', dataProcessorResponse.result);

        const mlEngineResponse = await orchestrator.sendMessage('ml-engine', {
            type: 'predict',
            payload: {
                model: 'customer-churn-v2',
                features: { age: 35, tenure: 24, usage: 'high' }
            }
        });
        console.log('✅ ML engine response:', mlEngineResponse.result);

        // Broadcast message to all components
        console.log('\n📢 Broadcasting system update...');
        const broadcastResponses = await orchestrator.componentCoordinator.broadcastMessage({
            type: 'system-update',
            payload: {
                version: '2.0.0',
                updateType: 'configuration',
                restartRequired: false
            }
        });

        console.log(`✅ Broadcast completed: ${broadcastResponses.length} responses received`);

        // Show component statuses
        console.log('\n📊 Component Statuses:');
        const allStatuses = orchestrator.componentCoordinator.getAllComponentsStatus();
        for (const status of allStatuses) {
            console.log(`- ${status.name}: ${status.state} (${status.messageCount} messages)`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await orchestrator.shutdown();
    }
}

/**
 * State management example
 */
export async function stateManagementExample() {
    console.log('\n🚀 State Management Example');
    console.log('============================');

    const orchestrator = OrchestratorFactory.development({
        state: {
            enableVersioning: true,
            enablePersistence: false // Disable for demo
        }
    });

    try {
        await orchestrator.initialize();
        const stateManager = orchestrator.stateManager;

        // Set various types of state
        console.log('💾 Setting application state...');
        await stateManager.setState('app.name', 'AI CI/CD System');
        await stateManager.setState('app.version', '1.0.0');
        await stateManager.setState('app.environment', 'development');

        await stateManager.setState('workflows.active', ['wf-1', 'wf-2', 'wf-3']);
        await stateManager.setState('tasks.queue_size', 15);
        await stateManager.setState('components.registered', {
            'data-processor': { status: 'connected', lastSeen: new Date().toISOString() },
            'ml-engine': { status: 'connected', lastSeen: new Date().toISOString() }
        });

        // Subscribe to state changes
        console.log('\n👂 Setting up state subscriptions...');
        const subscriptionId = stateManager.subscribe('app.*', (change) => {
            console.log(`🔔 State changed: ${change.key} = ${change.newValue}`);
        });

        // Update state to trigger subscription
        await stateManager.setState('app.version', '1.1.0');
        await stateManager.setState('app.status', 'running');

        // Create state watcher with conditions
        const watcherId = stateManager.watch({
            keyPattern: 'tasks\\..*',
            callback: (change) => {
                console.log(`👀 Task state watcher: ${change.key} changed to ${change.newValue}`);
            },
            condition: (newValue, oldValue) => {
                // Only trigger if value increased
                return typeof newValue === 'number' && typeof oldValue === 'number' && newValue > oldValue;
            }
        });

        // Update task state to trigger watcher
        await stateManager.setState('tasks.queue_size', 20);
        await stateManager.setState('tasks.completed', 5);

        // Demonstrate state versioning
        console.log('\n📚 Demonstrating state versioning...');
        await stateManager.setState('config.max_workers', 10);
        await stateManager.setState('config.max_workers', 15);
        await stateManager.setState('config.max_workers', 20);

        const versions = stateManager.getStateVersions('config.max_workers');
        console.log(`📖 State versions for 'config.max_workers': ${versions.length}`);
        versions.forEach((version, index) => {
            console.log(`  v${version.version}: ${version.value} (${version.timestamp})`);
        });

        // Restore previous version
        console.log('\n⏪ Restoring previous version...');
        await stateManager.restoreStateVersion('config.max_workers', 2);
        console.log(`Current value: ${stateManager.getState('config.max_workers')}`);

        // Create and restore snapshot
        console.log('\n📸 Creating state snapshot...');
        const snapshotId = await stateManager.createSnapshot({
            metadata: {
                description: 'Demo snapshot',
                createdBy: 'usage-example'
            }
        });
        console.log(`✅ Snapshot created: ${snapshotId}`);

        // Modify state
        await stateManager.setState('temp.data', 'This will be lost');
        await stateManager.setState('app.version', '2.0.0');

        console.log('\n🔄 Restoring from snapshot...');
        await stateManager.restoreSnapshot(snapshotId);
        console.log(`App version after restore: ${stateManager.getState('app.version')}`);
        console.log(`Temp data after restore: ${stateManager.getState('temp.data')}`);

        // Show final state
        console.log('\n📊 Final State Summary:');
        const allKeys = stateManager.getStateKeys();
        for (const key of allKeys) {
            const value = stateManager.getState(key);
            console.log(`- ${key}: ${JSON.stringify(value)}`);
        }

        // Cleanup subscriptions
        stateManager.unsubscribe(subscriptionId);
        stateManager.unwatch(watcherId);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await orchestrator.shutdown();
    }
}

/**
 * Error handling and recovery example
 */
export async function errorHandlingExample() {
    console.log('\n🚀 Error Handling and Recovery Example');
    console.log('======================================');

    const orchestrator = new SystemOrchestrator({
        enableErrorRecovery: true,
        retryAttempts: 3,
        retryDelay: 1000,
        healthCheckInterval: 2000
    });

    try {
        await orchestrator.initialize();

        // Set up error event handlers
        orchestrator.on('error', (error) => {
            console.log(`🚨 System error: ${error.message}`);
        });

        orchestrator.on('errorRecovered', (error) => {
            console.log(`✅ Error recovered: ${error.message}`);
        });

        orchestrator.on('errorRecoveryFailed', ({ originalError, recoveryError }) => {
            console.log(`❌ Recovery failed for: ${originalError.message}`);
            console.log(`   Recovery error: ${recoveryError.message}`);
        });

        // Create a workflow that will fail
        console.log('🔄 Creating failing workflow...');
        const failingWorkflow = {
            name: 'Failing Workflow Demo',
            steps: [
                {
                    name: 'Success Step',
                    type: 'task',
                    config: { action: 'succeed' }
                },
                {
                    name: 'Failing Step',
                    type: 'task',
                    config: { action: 'fail' }
                },
                {
                    name: 'Recovery Step',
                    type: 'task',
                    config: { action: 'recover' }
                }
            ]
        };

        // Mock task execution with failures
        let attemptCount = 0;
        orchestrator.workflowManager.on('executeTask', ({ task, callback }) => {
            attemptCount++;
            console.log(`🔧 Executing: ${task.name} (attempt ${attemptCount})`);

            if (task.config.action === 'fail' && attemptCount < 3) {
                setTimeout(() => {
                    callback(new Error(`${task.name} failed on attempt ${attemptCount}`));
                }, 500);
            } else {
                setTimeout(() => {
                    callback(null, {
                        success: true,
                        result: `${task.name} completed`,
                        attempt: attemptCount
                    });
                }, 500);
            }
        });

        const workflowId = await orchestrator.createWorkflow(failingWorkflow);

        // Monitor workflow events
        orchestrator.on('workflowFailed', (data) => {
            console.log(`❌ Workflow failed: ${data.workflow.name}`);
            if (data.workflow.retryCount < 2) {
                console.log(`🔄 Will retry workflow in ${orchestrator.config.retryDelay}ms...`);
            }
        });

        orchestrator.on('workflowCompleted', (data) => {
            console.log(`✅ Workflow completed: ${data.workflow.name}`);
        });

        // Start the workflow
        await orchestrator.workflowManager.startWorkflow(workflowId);

        // Wait for completion or final failure
        await new Promise((resolve) => {
            const cleanup = () => {
                orchestrator.off('workflowCompleted', onComplete);
                orchestrator.off('workflowFailed', onFailed);
                resolve();
            };

            const onComplete = () => {
                console.log('🎉 Workflow eventually succeeded!');
                cleanup();
            };

            const onFailed = (data) => {
                if (data.workflow.retryCount >= 2) {
                    console.log('💀 Workflow failed permanently after retries');
                    cleanup();
                }
            };

            orchestrator.on('workflowCompleted', onComplete);
            orchestrator.on('workflowFailed', onFailed);
        });

        // Demonstrate component error recovery
        console.log('\n🔧 Testing component error recovery...');
        
        await orchestrator.componentCoordinator.registerComponent('test-component', {
            name: 'Test Component'
        });

        // Simulate component timeout error
        const componentError = new Error('Component timeout');
        componentError.code = 'COMPONENT_TIMEOUT';
        componentError.componentId = 'test-component';

        // Mock reconnection
        orchestrator.componentCoordinator.reconnectComponent = async (componentId) => {
            console.log(`🔄 Attempting to reconnect component: ${componentId}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log(`✅ Component reconnected: ${componentId}`);
        };

        await orchestrator._handleError(componentError);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await orchestrator.shutdown();
    }
}

/**
 * Performance monitoring example
 */
export async function performanceMonitoringExample() {
    console.log('\n🚀 Performance Monitoring Example');
    console.log('==================================');

    const orchestrator = OrchestratorFactory.production({
        healthCheckInterval: 1000, // Check every second for demo
        maxConcurrentTasks: 5
    });

    try {
        await orchestrator.initialize();

        // Set up monitoring event handlers
        orchestrator.on('healthCheckPassed', (status) => {
            console.log(`💚 Health check passed - Uptime: ${status.uptime}ms`);
        });

        orchestrator.on('healthCheckFailed', ({ unhealthyComponents }) => {
            console.log(`💔 Health check failed - Unhealthy: ${unhealthyComponents.join(', ')}`);
        });

        // Create multiple workflows to generate load
        console.log('🏭 Creating multiple workflows for load testing...');
        
        const workflows = [];
        for (let i = 0; i < 3; i++) {
            const workflow = {
                name: `Load Test Workflow ${i + 1}`,
                steps: [
                    { name: `Step 1-${i}`, type: 'task', config: { duration: 1000 } },
                    { name: `Step 2-${i}`, type: 'task', config: { duration: 1500 } },
                    { name: `Step 3-${i}`, type: 'task', config: { duration: 800 } }
                ]
            };
            workflows.push(workflow);
        }

        // Mock task execution with timing
        const taskTimes = [];
        orchestrator.workflowManager.on('executeTask', ({ task, callback }) => {
            const startTime = Date.now();
            console.log(`⚡ Starting: ${task.name}`);
            
            setTimeout(() => {
                const endTime = Date.now();
                const duration = endTime - startTime;
                taskTimes.push(duration);
                
                console.log(`✅ Completed: ${task.name} (${duration}ms)`);
                callback(null, { success: true, duration });
            }, task.config.duration);
        });

        // Start all workflows
        const workflowIds = [];
        for (const workflow of workflows) {
            const workflowId = await orchestrator.createWorkflow(workflow);
            workflowIds.push(workflowId);
            orchestrator.workflowManager.startWorkflow(workflowId);
        }

        // Monitor system performance
        const monitoringInterval = setInterval(() => {
            const status = orchestrator.getStatus();
            console.log('\n📊 System Metrics:');
            console.log(`- Active Workflows: ${status.components.workflowManager.activeWorkflows}`);
            console.log(`- Running Tasks: ${status.components.taskScheduler.runningTasks}`);
            console.log(`- Total Messages: ${status.metrics.componentMessages}`);
            console.log(`- Errors: ${status.metrics.errors}`);
            
            if (taskTimes.length > 0) {
                const avgTime = taskTimes.reduce((a, b) => a + b, 0) / taskTimes.length;
                console.log(`- Avg Task Time: ${avgTime.toFixed(2)}ms`);
            }
        }, 2000);

        // Wait for all workflows to complete
        let completedWorkflows = 0;
        await new Promise((resolve) => {
            orchestrator.on('workflowCompleted', () => {
                completedWorkflows++;
                if (completedWorkflows === workflows.length) {
                    clearInterval(monitoringInterval);
                    resolve();
                }
            });
        });

        // Final performance report
        console.log('\n📈 Final Performance Report:');
        const finalStatus = orchestrator.getStatus();
        console.log(`- Total Workflows: ${finalStatus.metrics.workflowsCompleted}`);
        console.log(`- Total Tasks: ${finalStatus.metrics.tasksCompleted}`);
        console.log(`- System Uptime: ${finalStatus.uptime}ms`);
        console.log(`- Success Rate: ${((finalStatus.metrics.workflowsCompleted / finalStatus.metrics.workflowsCreated) * 100).toFixed(1)}%`);

        if (taskTimes.length > 0) {
            const avgTime = taskTimes.reduce((a, b) => a + b, 0) / taskTimes.length;
            const minTime = Math.min(...taskTimes);
            const maxTime = Math.max(...taskTimes);
            console.log(`- Task Performance:`);
            console.log(`  - Average: ${avgTime.toFixed(2)}ms`);
            console.log(`  - Min: ${minTime}ms`);
            console.log(`  - Max: ${maxTime}ms`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await orchestrator.shutdown();
    }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
    console.log('🎯 System Orchestrator - Complete Usage Examples');
    console.log('=================================================');

    try {
        await basicOrchestratorUsage();
        await advancedWorkflowExample();
        await componentCommunicationExample();
        await stateManagementExample();
        await errorHandlingExample();
        await performanceMonitoringExample();

        console.log('\n🎉 All examples completed successfully!');
    } catch (error) {
        console.error('\n💥 Example execution failed:', error);
    }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples().catch(console.error);
}

