/**
 * Unified Workflow Orchestration Examples
 * Demonstrates the consolidated workflow engine with database and infrastructure integration
 * Combines and enhances examples from PRs #50 and #63
 */

import { WorkflowEngine } from '../workflows/workflow_engine.js';
import { WORKFLOW_CONFIG } from '../config/workflow_config.js';
import { DatabaseManager } from '../database/database_manager.js';

/**
 * Example 1: Complete Task-to-PR Workflow with Database Persistence
 * Demonstrates full integration of task management, workflow orchestration, and validation
 */
export async function taskToPRWorkflowExample() {
    console.log('🚀 Starting Complete Task-to-PR Workflow Example...');
    
    const workflowEngine = new WorkflowEngine(WORKFLOW_CONFIG);
    const dbManager = new DatabaseManager(WORKFLOW_CONFIG.stateManager.database);
    
    try {
        // Initialize database connection
        await dbManager.initialize();
        
        const context = {
            task_id: 'task_001',
            title: 'Implement user authentication system',
            description: 'Add JWT-based authentication with role-based access control',
            repository: 'company/main-app',
            branch: 'feature/user-authentication',
            author: 'developer@company.com',
            requirements: [
                'JWT token generation and validation',
                'User registration and login endpoints',
                'Role-based middleware',
                'Password hashing and security'
            ],
            acceptance_criteria: [
                'All tests pass',
                'Security scan shows no vulnerabilities',
                'Code coverage > 90%',
                'Documentation updated'
            ]
        };

        console.log('📋 Creating task in database...');
        const taskId = await dbManager.createTask({
            title: context.title,
            description: context.description,
            type: 'feature',
            status: 'pending',
            priority: 8,
            complexity_score: 7,
            requirements: context.requirements,
            acceptance_criteria: context.acceptance_criteria,
            metadata: {
                repository: context.repository,
                branch: context.branch,
                author: context.author
            }
        });

        console.log('🔄 Executing comprehensive workflow...');
        const result = await workflowEngine.executeWorkflow('task_to_pr_complete', {
            ...context,
            task_id: taskId
        });
        
        console.log('✅ Workflow completed successfully!');
        console.log('📊 Results:', {
            executionId: result.executionId,
            status: result.status,
            duration: result.duration,
            stepsCompleted: Object.keys(result.result.stepResults).length,
            taskId: taskId,
            prUrl: result.result.pr_url
        });
        
        // Update task status
        await dbManager.updateTask(taskId, {
            status: 'completed',
            workflow_execution_id: result.executionId,
            completed_at: new Date()
        });
        
        return result;
        
    } catch (error) {
        console.error('❌ Workflow failed:', error.message);
        throw error;
    } finally {
        await dbManager.close();
        await workflowEngine.destroy();
    }
}

/**
 * Example 2: Multi-Agent Validation Pipeline with Error Recovery
 * Demonstrates agent coordination, validation tracking, and intelligent error handling
 */
export async function multiAgentValidationExample() {
    console.log('🔍 Starting Multi-Agent Validation Pipeline...');
    
    const workflowEngine = new WorkflowEngine({
        ...WORKFLOW_CONFIG,
        enableMetrics: true,
        retryPolicy: {
            maxRetries: 3,
            retryDelay: 2000,
            backoffMultiplier: 2
        }
    });
    
    const dbManager = new DatabaseManager(WORKFLOW_CONFIG.stateManager.database);
    
    // Set up comprehensive event monitoring
    workflowEngine.on('workflow_started', async (data) => {
        console.log(`🎬 Workflow started: ${data.workflowId} (${data.executionId})`);
        await dbManager.logWorkflowEvent('workflow_started', data);
    });
    
    workflowEngine.on('step_execution_started', async (data) => {
        console.log(`⚡ Step started: ${data.stepId} using agent: ${data.agent}`);
        await dbManager.logStepEvent('step_started', data);
    });
    
    workflowEngine.on('step_execution_completed', async (data) => {
        console.log(`✅ Step completed: ${data.stepId} in ${data.duration}ms`);
        await dbManager.logStepEvent('step_completed', data);
    });
    
    workflowEngine.on('step_failed', async (data) => {
        console.log(`❌ Step failed: ${data.stepId} - ${data.error.message}`);
        await dbManager.logError({
            workflow_execution_id: data.executionId,
            error_code: 'STEP_EXECUTION_FAILED',
            error_category: 'workflow',
            error_severity: 'medium',
            error_message: data.error.message,
            error_details: data.error,
            context_data: data
        });
    });
    
    workflowEngine.on('step_retry', async (data) => {
        console.log(`🔄 Retrying step: ${data.stepId} (attempt ${data.attempt}/${data.maxRetries})`);
        await dbManager.logStepEvent('step_retry', data);
    });

    try {
        await dbManager.initialize();
        
        const context = {
            pr_id: '456',
            repository: 'company/critical-app',
            branch: 'feature/payment-integration',
            author: 'senior-dev@company.com',
            files_changed: [
                'src/payment/stripe.js',
                'src/payment/paypal.js', 
                'tests/payment.test.js',
                'docs/payment-api.md'
            ],
            validation_types: [
                'syntax',
                'security',
                'performance',
                'testing',
                'documentation'
            ],
            security_requirements: {
                pci_compliance: true,
                data_encryption: true,
                audit_logging: true
            }
        };

        const result = await workflowEngine.executeWorkflow('multi_agent_validation', context);
        
        console.log('🎯 Validation pipeline completed!');
        console.log('📈 Metrics:', workflowEngine.getMetrics());
        
        // Store validation results
        for (const [stepId, stepResult] of Object.entries(result.result.stepResults)) {
            if (stepResult.validation_data) {
                await dbManager.createValidationResult({
                    workflow_execution_id: result.executionId,
                    validation_type: stepResult.validation_type,
                    validation_status: stepResult.status,
                    validation_score: stepResult.validation_data.score,
                    validation_data: stepResult.validation_data,
                    agent_used: stepResult.agent,
                    execution_time_ms: stepResult.duration
                });
            }
        }
        
        return result;
        
    } finally {
        await dbManager.close();
        await workflowEngine.destroy();
    }
}

/**
 * Example 3: Parallel Workflow Execution with Database Coordination
 * Demonstrates concurrent workflow management with shared state
 */
export async function parallelWorkflowCoordinationExample() {
    console.log('⚡ Starting Parallel Workflow Coordination Example...');
    
    const workflowEngine = new WorkflowEngine({
        ...WORKFLOW_CONFIG,
        maxConcurrentWorkflows: 8,
        parallelProcessor: {
            ...WORKFLOW_CONFIG.parallelProcessor,
            maxConcurrentSteps: 10
        }
    });
    
    const dbManager = new DatabaseManager(WORKFLOW_CONFIG.stateManager.database);

    try {
        await dbManager.initialize();
        
        const workflows = [
            {
                id: 'feature_development',
                context: {
                    feature: 'user-dashboard',
                    repository: 'app1',
                    priority: 'high',
                    estimated_hours: 16
                }
            },
            {
                id: 'bug_fix_workflow',
                context: {
                    bug_id: 'BUG-123',
                    repository: 'app1',
                    severity: 'critical',
                    affected_users: 1500
                }
            },
            {
                id: 'security_audit',
                context: {
                    repository: 'app2',
                    audit_type: 'comprehensive',
                    compliance_standards: ['SOC2', 'GDPR']
                }
            },
            {
                id: 'performance_optimization',
                context: {
                    repository: 'app3',
                    target_improvement: '50%',
                    focus_areas: ['database', 'api', 'frontend']
                }
            },
            {
                id: 'documentation_update',
                context: {
                    repository: 'app1',
                    doc_types: ['api', 'user_guide', 'deployment'],
                    target_coverage: '95%'
                }
            }
        ];

        console.log(`🔄 Executing ${workflows.length} workflows in parallel...`);
        
        // Create workflow execution records
        const executionPromises = workflows.map(async (workflow, index) => {
            const executionId = `parallel_${Date.now()}_${index}`;
            
            // Log workflow start in database
            await dbManager.createWorkflowExecution({
                execution_id: executionId,
                workflow_id: workflow.id,
                status: 'pending',
                context: {
                    ...workflow.context,
                    batch_id: `parallel_batch_${Date.now()}`,
                    workflow_index: index
                }
            });
            
            return workflowEngine.executeWorkflow(workflow.id, {
                ...workflow.context,
                execution_id: executionId
            });
        });

        const results = await Promise.allSettled(executionPromises);
        
        // Process results and update database
        const summary = {
            totalWorkflows: results.length,
            successfulWorkflows: 0,
            failedWorkflows: 0,
            totalDuration: 0,
            averageDuration: 0
        };
        
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const workflow = workflows[i];
            
            if (result.status === 'fulfilled') {
                summary.successfulWorkflows++;
                summary.totalDuration += result.value.duration;
                
                // Update workflow execution status
                await dbManager.updateWorkflowExecution(result.value.executionId, {
                    status: 'completed',
                    result: result.value.result,
                    completed_at: new Date(),
                    duration_ms: result.value.duration
                });
            } else {
                summary.failedWorkflows++;
                
                // Log failure
                await dbManager.logError({
                    error_code: 'WORKFLOW_EXECUTION_FAILED',
                    error_category: 'workflow',
                    error_severity: 'high',
                    error_message: result.reason.message,
                    error_details: result.reason,
                    context_data: { workflow_id: workflow.id, workflow_context: workflow.context }
                });
            }
        }
        
        summary.averageDuration = summary.totalDuration / summary.successfulWorkflows;
        
        console.log('🎯 All parallel workflows completed!');
        console.log('📊 Summary:', summary);
        
        return { results, summary };
        
    } finally {
        await dbManager.close();
        await workflowEngine.destroy();
    }
}

/**
 * Example 4: Workflow State Management with Pause/Resume
 * Demonstrates advanced state persistence and workflow control
 */
export async function workflowStateManagementExample() {
    console.log('⏸️ Starting Workflow State Management Example...');
    
    const workflowEngine = new WorkflowEngine(WORKFLOW_CONFIG);
    const dbManager = new DatabaseManager(WORKFLOW_CONFIG.stateManager.database);

    try {
        await dbManager.initialize();
        
        const context = {
            deployment_type: 'blue_green',
            environment: 'production',
            application: 'payment-service',
            version: 'v2.1.0',
            rollback_version: 'v2.0.3',
            approval_required: true,
            stakeholders: ['tech-lead@company.com', 'product@company.com']
        };

        // Start the workflow
        console.log('🚀 Starting deployment workflow...');
        const workflowPromise = workflowEngine.executeWorkflow('production_deployment', context);
        
        // Give it time to start and reach approval step
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Get the execution ID and pause for approval
        const activeWorkflows = await dbManager.getActiveWorkflows();
        if (activeWorkflows.length > 0) {
            const execution = activeWorkflows[0];
            const executionId = execution.execution_id;
            
            console.log('⏸️ Pausing workflow for stakeholder approval...');
            await workflowEngine.pauseWorkflow(executionId, 'awaiting_stakeholder_approval');
            
            // Update workflow state in database
            await dbManager.updateWorkflowExecution(executionId, {
                status: 'paused',
                metadata: {
                    pause_reason: 'awaiting_stakeholder_approval',
                    paused_at: new Date(),
                    approval_pending: true
                }
            });
            
            // Simulate approval process
            console.log('📧 Sending approval notifications...');
            console.log('⏳ Waiting for stakeholder approval...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Simulate approval received
            console.log('✅ Approval received from stakeholders');
            
            // Update approval status
            await dbManager.updateWorkflowExecution(executionId, {
                metadata: {
                    approval_received: true,
                    approved_by: 'tech-lead@company.com',
                    approved_at: new Date()
                }
            });
            
            console.log('▶️ Resuming workflow after approval...');
            await workflowEngine.resumeWorkflow(executionId);
            
            // Update workflow state
            await dbManager.updateWorkflowExecution(executionId, {
                status: 'running',
                metadata: {
                    resumed_at: new Date(),
                    pause_duration_ms: 3000
                }
            });
        }

        const result = await workflowPromise;
        
        console.log('✅ Deployment workflow completed with state management!');
        console.log('📊 Final state:', {
            executionId: result.executionId,
            status: result.status,
            totalDuration: result.duration,
            pauseCount: result.result.pause_count || 0
        });
        
        return result;
        
    } finally {
        await dbManager.close();
        await workflowEngine.destroy();
    }
}

/**
 * Example 5: Infrastructure-Aware Workflow with Cloudflare Integration
 * Demonstrates workflow execution with infrastructure monitoring and failover
 */
export async function infrastructureAwareWorkflowExample() {
    console.log('🌐 Starting Infrastructure-Aware Workflow Example...');
    
    const workflowEngine = new WorkflowEngine({
        ...WORKFLOW_CONFIG,
        infrastructure: {
            ...WORKFLOW_CONFIG.infrastructure,
            cloudflare: {
                ...WORKFLOW_CONFIG.infrastructure.cloudflare,
                enabled: true
            }
        },
        monitoring: {
            ...WORKFLOW_CONFIG.monitoring,
            enabled: true,
            enableTracing: true
        }
    });
    
    const dbManager = new DatabaseManager(WORKFLOW_CONFIG.stateManager.database);

    try {
        await dbManager.initialize();
        
        // Monitor infrastructure health
        workflowEngine.on('infrastructure_health_check', async (data) => {
            console.log(`🏥 Infrastructure health: ${data.component} - ${data.status}`);
            await dbManager.logInfrastructureEvent(data);
        });
        
        workflowEngine.on('failover_triggered', async (data) => {
            console.log(`🔄 Failover triggered: ${data.from} -> ${data.to}`);
            await dbManager.logError({
                error_code: 'INFRASTRUCTURE_FAILOVER',
                error_category: 'infrastructure',
                error_severity: 'medium',
                error_message: `Failover from ${data.from} to ${data.to}`,
                error_details: data
            });
        });

        const context = {
            service_name: 'api-gateway',
            deployment_strategy: 'canary',
            traffic_percentage: 10,
            health_check_url: '/health',
            rollback_threshold: 5, // 5% error rate
            monitoring_duration: 300000, // 5 minutes
            infrastructure_requirements: {
                min_healthy_instances: 2,
                max_response_time: 200,
                max_error_rate: 0.01
            }
        };

        console.log('🚀 Starting infrastructure-aware deployment...');
        const result = await workflowEngine.executeWorkflow('infrastructure_aware_deployment', context);
        
        console.log('🎯 Infrastructure-aware workflow completed!');
        console.log('📊 Infrastructure metrics:', {
            executionId: result.executionId,
            infrastructureHealth: result.result.infrastructure_health,
            failoverCount: result.result.failover_count || 0,
            averageResponseTime: result.result.avg_response_time,
            errorRate: result.result.error_rate
        });
        
        return result;
        
    } finally {
        await dbManager.close();
        await workflowEngine.destroy();
    }
}

/**
 * Example 6: Custom Workflow with Database-Driven Configuration
 * Demonstrates dynamic workflow creation and execution with database persistence
 */
export async function customDatabaseDrivenWorkflowExample() {
    console.log('🎨 Starting Custom Database-Driven Workflow Example...');
    
    const workflowEngine = new WorkflowEngine(WORKFLOW_CONFIG);
    const dbManager = new DatabaseManager(WORKFLOW_CONFIG.stateManager.database);

    try {
        await dbManager.initialize();
        
        // Define a custom workflow and store it in database
        const customWorkflow = {
            workflow_id: 'custom_microservice_deployment',
            name: 'Custom Microservice Deployment Pipeline',
            description: 'A database-driven CI/CD pipeline for microservice deployment',
            version: '2.0.0',
            definition: {
                steps: [
                    {
                        id: 'code_quality_check',
                        name: 'Code Quality Analysis',
                        type: 'validation',
                        agent: 'claude-code',
                        dependencies: [],
                        timeout: 180000,
                        retry_count: 2,
                        config: {
                            quality_gates: ['complexity', 'coverage', 'duplication'],
                            thresholds: {
                                complexity: 10,
                                coverage: 85,
                                duplication: 5
                            }
                        }
                    },
                    {
                        id: 'security_scan',
                        name: 'Security Vulnerability Scan',
                        type: 'security',
                        agent: 'goose',
                        dependencies: ['code_quality_check'],
                        timeout: 300000,
                        retry_count: 1,
                        config: {
                            scan_types: ['sast', 'dependency', 'secrets'],
                            severity_threshold: 'medium'
                        }
                    },
                    {
                        id: 'build_and_test',
                        name: 'Build and Test',
                        type: 'build',
                        agent: 'codegen',
                        dependencies: ['security_scan'],
                        timeout: 600000,
                        retry_count: 2,
                        parallel: false,
                        config: {
                            build_type: 'production',
                            test_suites: ['unit', 'integration', 'contract'],
                            coverage_threshold: 90
                        }
                    },
                    {
                        id: 'container_build',
                        name: 'Container Image Build',
                        type: 'containerization',
                        agent: 'aider',
                        dependencies: ['build_and_test'],
                        timeout: 480000,
                        retry_count: 2,
                        config: {
                            registry: 'company-registry.com',
                            tag_strategy: 'semantic',
                            security_scan: true
                        }
                    },
                    {
                        id: 'staging_deployment',
                        name: 'Deploy to Staging',
                        type: 'deployment',
                        agent: 'claude-code',
                        dependencies: ['container_build'],
                        timeout: 300000,
                        retry_count: 1,
                        config: {
                            environment: 'staging',
                            deployment_strategy: 'rolling',
                            health_check: true,
                            smoke_tests: true
                        }
                    },
                    {
                        id: 'e2e_testing',
                        name: 'End-to-End Testing',
                        type: 'testing',
                        agent: 'claude-code',
                        dependencies: ['staging_deployment'],
                        timeout: 900000,
                        retry_count: 1,
                        parallel: true,
                        config: {
                            test_environment: 'staging',
                            test_suites: ['e2e', 'performance', 'accessibility'],
                            parallel_execution: true
                        }
                    }
                ],
                error_handling: {
                    strategy: 'retry_with_escalation',
                    max_retries: 3,
                    escalation_policy: 'team_notify',
                    rollback_on_failure: true
                },
                notifications: {
                    on_start: true,
                    on_complete: true,
                    on_failure: true,
                    channels: ['slack', 'email']
                }
            },
            metadata: {
                created_by: 'devops-team',
                tags: ['microservice', 'ci-cd', 'production'],
                approval_required: false
            }
        };

        // Store workflow definition in database
        console.log('💾 Storing custom workflow definition in database...');
        await dbManager.createWorkflowDefinition(customWorkflow);

        const context = {
            repository: 'company/payment-microservice',
            branch: 'feature/enhanced-security',
            commit_sha: 'abc123def456789',
            author: 'security-team@company.com',
            microservice_config: {
                name: 'payment-service',
                port: 8080,
                database: 'payment_db',
                dependencies: ['user-service', 'notification-service']
            }
        };

        console.log('🔧 Executing custom database-driven workflow...');
        const result = await workflowEngine.executeWorkflow('custom_microservice_deployment', context);
        
        console.log('🎉 Custom workflow completed successfully!');
        console.log('📈 Execution summary:', {
            workflowId: result.workflowId,
            executionId: result.executionId,
            status: result.status,
            duration: result.duration,
            stepsExecuted: Object.keys(result.result.stepResults).length,
            successRate: result.result.success_rate,
            qualityScore: result.result.quality_score
        });
        
        // Store execution metrics
        await dbManager.updateWorkflowExecution(result.executionId, {
            result: result.result,
            metadata: {
                quality_score: result.result.quality_score,
                success_rate: result.result.success_rate,
                performance_metrics: result.result.performance_metrics
            }
        });
        
        return result;
        
    } finally {
        await dbManager.close();
        await workflowEngine.destroy();
    }
}

/**
 * Example 7: Comprehensive System Integration Test
 * Demonstrates all components working together in a real-world scenario
 */
export async function comprehensiveIntegrationExample() {
    console.log('🌟 Starting Comprehensive System Integration Example...');
    
    const workflowEngine = new WorkflowEngine({
        ...WORKFLOW_CONFIG,
        enableMetrics: true,
        enableRecovery: true
    });
    
    const dbManager = new DatabaseManager(WORKFLOW_CONFIG.stateManager.database);

    try {
        await dbManager.initialize();
        
        // Validate system configuration
        console.log('🔍 Validating system configuration...');
        const configValidation = await workflowEngine.validateConfiguration();
        if (!configValidation.valid) {
            throw new Error(`Configuration validation failed: ${configValidation.errors.join(', ')}`);
        }
        
        // Test database connectivity and schema
        console.log('🗄️ Testing database connectivity...');
        const dbHealth = await dbManager.healthCheck();
        if (!dbHealth.healthy) {
            throw new Error(`Database health check failed: ${dbHealth.error}`);
        }
        
        // Test agent connectivity
        console.log('🤖 Testing agent connectivity...');
        const agentHealth = await workflowEngine.checkAgentHealth();
        console.log('Agent health status:', agentHealth);
        
        // Execute a comprehensive workflow that uses all system components
        const context = {
            project_name: 'TaskMaster Enhancement',
            epic_id: 'EPIC-001',
            features: [
                {
                    name: 'Advanced Workflow Engine',
                    complexity: 8,
                    estimated_hours: 40
                },
                {
                    name: 'Database Integration Layer',
                    complexity: 6,
                    estimated_hours: 24
                },
                {
                    name: 'Infrastructure Automation',
                    complexity: 7,
                    estimated_hours: 32
                }
            ],
            quality_requirements: {
                code_coverage: 95,
                performance_threshold: 100, // ms
                security_compliance: ['OWASP', 'SOC2'],
                documentation_coverage: 90
            }
        };

        console.log('🚀 Executing comprehensive integration workflow...');
        const result = await workflowEngine.executeWorkflow('comprehensive_integration', context);
        
        // Generate comprehensive report
        const report = {
            execution_summary: {
                workflow_id: result.workflowId,
                execution_id: result.executionId,
                status: result.status,
                duration: result.duration,
                started_at: result.startedAt,
                completed_at: result.completedAt
            },
            system_metrics: workflowEngine.getMetrics(),
            database_metrics: await dbManager.getMetrics(),
            agent_performance: await workflowEngine.getAgentPerformanceMetrics(),
            quality_metrics: result.result.quality_metrics,
            infrastructure_health: result.result.infrastructure_health
        };
        
        console.log('🎯 Comprehensive integration completed successfully!');
        console.log('📊 System Report:', JSON.stringify(report, null, 2));
        
        return { result, report };
        
    } finally {
        await dbManager.close();
        await workflowEngine.destroy();
    }
}

// Export all examples for easy access
export const WorkflowExamples = {
    taskToPRWorkflow: taskToPRWorkflowExample,
    multiAgentValidation: multiAgentValidationExample,
    parallelWorkflowCoordination: parallelWorkflowCoordinationExample,
    workflowStateManagement: workflowStateManagementExample,
    infrastructureAwareWorkflow: infrastructureAwareWorkflowExample,
    customDatabaseDrivenWorkflow: customDatabaseDrivenWorkflowExample,
    comprehensiveIntegration: comprehensiveIntegrationExample
};

export default WorkflowExamples;

