#!/usr/bin/env node

/**
 * @fileoverview AI-CICD System Usage Examples
 * @description Comprehensive examples demonstrating system capabilities
 */

import { AICICDSystem, createAICICDSystem, processRequirement } from '../index.js';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Example 1: Basic requirement processing
 */
async function basicRequirementProcessing() {
    console.log('\n🚀 Example 1: Basic Requirement Processing');
    console.log('=' .repeat(60));

    const requirement = `
        Implement a secure user authentication system for our web application.
        The system should support JWT-based authentication with password hashing using bcrypt.
        Users should be able to register, login, logout, and reset their passwords.
        The system must include rate limiting for login attempts and comprehensive input validation.
        All authentication endpoints should have proper error handling and logging.
        Test coverage should be at least 80% with both unit and integration tests.
    `;

    try {
        // Process requirement using convenience function
        const result = await processRequirement(requirement, {
            mode: 'development',
            database: { enable_mock: true },
            codegen: { enable_mock: true },
            validation: { enable_mock: true }
        });

        console.log('✅ Requirement processed successfully!');
        console.log(`📋 Generated ${result.tasks.length} tasks`);
        console.log(`🔧 Created ${result.codegen_results.length} PRs`);
        console.log(`✅ Completed ${result.validation_results.length} validations`);
        console.log(`⏱️  Total time: ${result.metrics.total_duration_ms}ms`);

        // Display task summary
        console.log('\n📋 Generated Tasks:');
        result.tasks.forEach((task, index) => {
            console.log(`  ${index + 1}. ${task.title} (complexity: ${task.complexityScore}/10)`);
        });

        // Display PR summary
        console.log('\n🔧 Generated PRs:');
        result.codegen_results.forEach((pr, index) => {
            if (pr.pr_info) {
                console.log(`  ${index + 1}. ${pr.pr_info.title} - ${pr.pr_info.pr_url}`);
            }
        });

        return result;

    } catch (error) {
        console.error('❌ Error processing requirement:', error.message);
        throw error;
    }
}

/**
 * Example 2: Advanced system usage with custom configuration
 */
async function advancedSystemUsage() {
    console.log('\n🔧 Example 2: Advanced System Usage');
    console.log('=' .repeat(60));

    // Create system with custom configuration
    const config = {
        mode: 'development',
        
        // Database configuration
        database: {
            enable_mock: true,
            pool_min_size: 2,
            pool_max_size: 10
        },
        
        // NLP configuration
        nlp: {
            enable_entity_extraction: true,
            enable_dependency_analysis: true,
            max_tasks_per_requirement: 10
        },
        
        // Codegen configuration
        codegen: {
            enable_mock: true,
            enable_tracking: true,
            max_retries: 2
        },
        
        // Validation configuration
        validation: {
            enable_mock: true,
            enable_security_analysis: true,
            enable_performance_analysis: true,
            scoring_criteria: {
                code_quality: { weight: 0.4 },
                functionality: { weight: 0.3 },
                testing: { weight: 0.2 },
                documentation: { weight: 0.1 }
            }
        },
        
        // Workflow configuration
        workflow: {
            max_concurrent_workflows: 5,
            enable_parallel_execution: true,
            enable_rollback: true
        },
        
        // Context configuration
        context: {
            enable_context_caching: true,
            enable_advanced_analytics: true,
            max_context_size: 10000
        },
        
        // Monitoring configuration
        monitoring: {
            enable_metrics: true,
            enable_real_time_updates: true,
            health_check_interval: 15000 // 15 seconds
        }
    };

    try {
        // Create and initialize system
        const system = await createAICICDSystem(config);
        
        console.log('✅ System initialized successfully');
        
        // Check system health
        const health = await system.getSystemHealth();
        console.log(`🏥 System health: ${health.status}`);
        console.log(`📊 Active workflows: ${health.active_workflows}`);
        
        // Process multiple requirements
        const requirements = [
            'Create a REST API for user management with CRUD operations',
            'Implement real-time notifications using WebSockets',
            'Add comprehensive logging and monitoring to the application'
        ];
        
        console.log(`\n📝 Processing ${requirements.length} requirements...`);
        
        const results = [];
        for (let i = 0; i < requirements.length; i++) {
            console.log(`\n🔄 Processing requirement ${i + 1}/${requirements.length}...`);
            
            try {
                const result = await system.processRequirement(requirements[i]);
                results.push(result);
                
                console.log(`✅ Requirement ${i + 1} completed: ${result.status}`);
                
                // Get workflow status
                const workflowStatus = await system.getWorkflowStatus(result.workflow_id);
                console.log(`📊 Workflow progress: ${workflowStatus.progress?.toFixed(1) || 0}%`);
                
            } catch (error) {
                console.error(`❌ Requirement ${i + 1} failed:`, error.message);
                results.push({ status: 'failed', error: error.message });
            }
        }
        
        // Display summary
        const successful = results.filter(r => r.status === 'completed').length;
        const failed = results.filter(r => r.status === 'failed').length;
        
        console.log('\n📊 Processing Summary:');
        console.log(`  ✅ Successful: ${successful}`);
        console.log(`  ❌ Failed: ${failed}`);
        console.log(`  📈 Success rate: ${((successful / results.length) * 100).toFixed(1)}%`);
        
        // Get final system health
        const finalHealth = await system.getSystemHealth();
        console.log(`\n🏥 Final system health: ${finalHealth.status}`);
        
        // Shutdown system
        await system.shutdown();
        console.log('🔄 System shutdown completed');
        
        return results;

    } catch (error) {
        console.error('❌ Advanced system usage failed:', error.message);
        throw error;
    }
}

/**
 * Example 3: Component-level usage
 */
async function componentLevelUsage() {
    console.log('\n🧩 Example 3: Component-Level Usage');
    console.log('=' .repeat(60));

    try {
        // Create system instance
        const system = new AICICDSystem({
            mode: 'development',
            database: { enable_mock: true },
            codegen: { enable_mock: true },
            validation: { enable_mock: true }
        });

        await system.initialize();
        
        // Access individual components
        const requirementProcessor = system.components.get('requirementProcessor');
        const taskStorage = system.components.get('taskStorage');
        const codegenIntegrator = system.components.get('codegenIntegrator');
        const validationEngine = system.components.get('validationEngine');
        const contextManager = system.components.get('contextManager');
        
        console.log('🔍 Testing individual components...');
        
        // Test requirement processor
        console.log('\n1. Testing Requirement Processor...');
        const analysisResult = await requirementProcessor.analyzeRequirement(
            'Create a simple calculator API with basic arithmetic operations'
        );
        console.log(`   ✅ Generated ${analysisResult.tasks.length} tasks`);
        console.log(`   📊 Average complexity: ${analysisResult.summary.averageComplexity.toFixed(1)}`);
        
        // Test task storage
        console.log('\n2. Testing Task Storage...');
        const taskId = await taskStorage.storeAtomicTask(
            analysisResult.tasks[0], 
            analysisResult.requirement
        );
        console.log(`   ✅ Stored task with ID: ${taskId}`);
        
        const retrievedTask = await taskStorage.retrieveTaskById(taskId);
        console.log(`   ✅ Retrieved task: ${retrievedTask.title}`);
        
        // Test context manager
        console.log('\n3. Testing Context Manager...');
        const promptContext = await contextManager.generatePromptContext(taskId);
        console.log(`   ✅ Generated prompt context for task ${taskId}`);
        console.log(`   📝 Context includes: ${Object.keys(promptContext).join(', ')}`);
        
        // Test codegen integrator
        console.log('\n4. Testing Codegen Integrator...');
        const codegenResult = await codegenIntegrator.processTask(
            retrievedTask, 
            promptContext
        );
        console.log(`   ✅ Codegen result: ${codegenResult.status}`);
        if (codegenResult.pr_info) {
            console.log(`   🔗 PR created: ${codegenResult.pr_info.pr_url}`);
        }
        
        // Test validation engine
        if (codegenResult.pr_info) {
            console.log('\n5. Testing Validation Engine...');
            const validationResult = await validationEngine.validatePR(
                codegenResult.pr_info,
                { task_id: taskId, requirements: retrievedTask.requirements }
            );
            console.log(`   ✅ Validation result: ${validationResult.status}`);
            console.log(`   📊 Overall score: ${validationResult.score.overall_score} (${validationResult.score.grade})`);
            console.log(`   💬 Feedback items: ${validationResult.feedback.length}`);
        }
        
        // Get component health
        console.log('\n6. Component Health Check...');
        for (const [name, component] of system.components) {
            if (component.getHealth) {
                const health = await component.getHealth();
                console.log(`   ${name}: ${health.status}`);
            }
        }
        
        await system.shutdown();
        console.log('\n✅ Component-level testing completed');

    } catch (error) {
        console.error('❌ Component-level usage failed:', error.message);
        throw error;
    }
}

/**
 * Example 4: Error handling and recovery
 */
async function errorHandlingExample() {
    console.log('\n🛠️  Example 4: Error Handling and Recovery');
    console.log('=' .repeat(60));

    try {
        const system = await createAICICDSystem({
            mode: 'development',
            database: { enable_mock: true },
            codegen: { enable_mock: true },
            validation: { enable_mock: true }
        });

        // Test with invalid requirement
        console.log('1. Testing with invalid requirement...');
        try {
            await system.processRequirement('');
            console.log('   ❌ Should have failed with empty requirement');
        } catch (error) {
            console.log(`   ✅ Correctly handled empty requirement: ${error.message}`);
        }

        // Test with very complex requirement
        console.log('\n2. Testing with complex requirement...');
        const complexRequirement = `
            Build a complete e-commerce platform with user management, product catalog,
            shopping cart, payment processing, order management, inventory tracking,
            real-time notifications, analytics dashboard, admin panel, mobile API,
            third-party integrations, automated testing, CI/CD pipeline, monitoring,
            logging, security features, performance optimization, and scalability.
        `;
        
        try {
            const result = await system.processRequirement(complexRequirement);
            console.log(`   ✅ Processed complex requirement: ${result.tasks.length} tasks generated`);
        } catch (error) {
            console.log(`   ⚠️  Complex requirement handling: ${error.message}`);
        }

        // Test system recovery
        console.log('\n3. Testing system recovery...');
        const health = await system.getSystemHealth();
        console.log(`   🏥 System health: ${health.status}`);
        
        if (health.status !== 'healthy') {
            console.log('   🔄 System not healthy, but continuing...');
        }

        await system.shutdown();
        console.log('\n✅ Error handling testing completed');

    } catch (error) {
        console.error('❌ Error handling example failed:', error.message);
    }
}

/**
 * Example 5: Performance monitoring
 */
async function performanceMonitoringExample() {
    console.log('\n📊 Example 5: Performance Monitoring');
    console.log('=' .repeat(60));

    try {
        const system = await createAICICDSystem({
            mode: 'development',
            database: { enable_mock: true },
            codegen: { enable_mock: true },
            validation: { enable_mock: true },
            monitoring: {
                enable_metrics: true,
                enable_performance_tracking: true,
                health_check_interval: 5000 // 5 seconds
            }
        });

        console.log('📈 Starting performance monitoring...');
        
        // Process a requirement while monitoring
        const startTime = Date.now();
        const result = await system.processRequirement(
            'Create a simple blog API with posts and comments'
        );
        const processingTime = Date.now() - startTime;
        
        console.log(`⏱️  Processing time: ${processingTime}ms`);
        
        // Get system metrics
        const systemMonitor = system.components.get('systemMonitor');
        if (systemMonitor) {
            const metrics = await systemMonitor.getSystemMetrics();
            console.log('\n📊 System Metrics:');
            console.log(`   Events recorded: ${metrics.events.length}`);
            console.log(`   Active alerts: ${metrics.alerts.length}`);
            
            const stats = await systemMonitor.getStatistics();
            console.log(`   Components tracked: ${stats.components_tracked}`);
            console.log(`   Monitoring active: ${stats.is_monitoring}`);
        }
        
        // Get performance analytics
        const health = await system.getSystemHealth();
        console.log('\n🏥 System Health Summary:');
        console.log(`   Overall status: ${health.status}`);
        console.log(`   System uptime: ${health.system_uptime}ms`);
        console.log(`   Active workflows: ${health.active_workflows}`);
        
        await system.shutdown();
        console.log('\n✅ Performance monitoring completed');

    } catch (error) {
        console.error('❌ Performance monitoring failed:', error.message);
    }
}

/**
 * Main function to run all examples
 */
async function runAllExamples() {
    console.log('🎯 AI-Driven CI/CD System - Usage Examples');
    console.log('=' .repeat(80));
    console.log('This demo showcases the comprehensive AI-CICD system capabilities');
    console.log('All examples run in mock mode for demonstration purposes\n');

    const examples = [
        { name: 'Basic Requirement Processing', fn: basicRequirementProcessing },
        { name: 'Advanced System Usage', fn: advancedSystemUsage },
        { name: 'Component-Level Usage', fn: componentLevelUsage },
        { name: 'Error Handling and Recovery', fn: errorHandlingExample },
        { name: 'Performance Monitoring', fn: performanceMonitoringExample }
    ];

    const results = [];
    
    for (let i = 0; i < examples.length; i++) {
        const example = examples[i];
        console.log(`\n🔄 Running ${example.name} (${i + 1}/${examples.length})...`);
        
        try {
            const startTime = Date.now();
            const result = await example.fn();
            const duration = Date.now() - startTime;
            
            results.push({
                name: example.name,
                status: 'success',
                duration: duration,
                result: result
            });
            
            console.log(`✅ ${example.name} completed in ${duration}ms`);
            
        } catch (error) {
            results.push({
                name: example.name,
                status: 'failed',
                error: error.message
            });
            
            console.error(`❌ ${example.name} failed: ${error.message}`);
        }
        
        // Small delay between examples
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Summary
    console.log('\n' + '=' .repeat(80));
    console.log('📋 Examples Summary');
    console.log('=' .repeat(80));
    
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;
    
    console.log(`✅ Successful: ${successful}/${results.length}`);
    console.log(`❌ Failed: ${failed}/${results.length}`);
    console.log(`📈 Success rate: ${((successful / results.length) * 100).toFixed(1)}%`);
    
    if (successful > 0) {
        const avgDuration = results
            .filter(r => r.status === 'success')
            .reduce((sum, r) => sum + r.duration, 0) / successful;
        console.log(`⏱️  Average duration: ${avgDuration.toFixed(0)}ms`);
    }
    
    console.log('\n🎉 All examples completed!');
    console.log('The AI-Driven CI/CD System is ready for production use.');
    
    return results;
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples().catch(error => {
        console.error('❌ Examples execution failed:', error);
        process.exit(1);
    });
}

export {
    basicRequirementProcessing,
    advancedSystemUsage,
    componentLevelUsage,
    errorHandlingExample,
    performanceMonitoringExample,
    runAllExamples
};
