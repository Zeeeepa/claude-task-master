/**
 * @fileoverview Example usage of the Task Master Orchestrator
 * @description Demonstrates how to use the new orchestrator system
 */

import { createOrchestrator } from './orchestrator.js';
import { initializeConfig } from '../../config/orchestrator.js';

/**
 * Example: Basic orchestrator usage
 */
async function basicExample() {
    console.log('🚀 Starting Task Master Orchestrator Example...\n');

    try {
        // Initialize configuration
        console.log('📋 Loading configuration...');
        await initializeConfig();

        // Create and initialize orchestrator
        console.log('🔧 Creating orchestrator...');
        const orchestrator = await createOrchestrator({
            configPath: './config/orchestrator.js'
        });

        // Get orchestrator status
        console.log('\n📊 Orchestrator Status:');
        const status = orchestrator.getStatus();
        console.log(JSON.stringify(status, null, 2));

        // Process a sample requirement
        console.log('\n📝 Processing sample requirement...');
        const requirement = `
            Create a user authentication system with the following features:
            - JWT token-based authentication
            - Password hashing with bcrypt
            - Rate limiting for login attempts
            - Email verification for new accounts
            - Password reset functionality
        `;

        const result = await orchestrator.processRequirement(requirement, {
            priority: 'high',
            assignee: 'development-team'
        });

        console.log('\n✅ Requirement processed successfully:');
        console.log(JSON.stringify(result, null, 2));

        // Wait a bit to see health monitoring in action
        console.log('\n⏳ Waiting 5 seconds to observe health monitoring...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Get updated status
        console.log('\n📊 Updated Status:');
        const updatedStatus = orchestrator.getStatus();
        console.log(JSON.stringify(updatedStatus, null, 2));

        // Graceful shutdown
        console.log('\n🛑 Shutting down orchestrator...');
        await orchestrator.shutdown();

        console.log('\n✅ Example completed successfully!');

    } catch (error) {
        console.error('\n❌ Example failed:', error);
        process.exit(1);
    }
}

/**
 * Example: Event-driven usage
 */
async function eventDrivenExample() {
    console.log('🎯 Starting Event-Driven Example...\n');

    try {
        const orchestrator = await createOrchestrator();

        // Set up event listeners
        orchestrator.on('task:created', (data) => {
            console.log('📝 Task created:', data.task?.title || 'Unknown task');
        });

        orchestrator.on('task:completed', (data) => {
            console.log('✅ Task completed:', data.task?.title || 'Unknown task');
        });

        orchestrator.on('component:error', (data) => {
            console.log('❌ Component error:', data.componentName, data.error.message);
        });

        orchestrator.on('requirement:processed', (data) => {
            console.log('🔄 Requirement processed, created', data.result?.tasksCreated || 0, 'tasks');
        });

        // Process multiple requirements
        const requirements = [
            'Implement user registration with email validation',
            'Create a dashboard for user analytics',
            'Add API rate limiting middleware'
        ];

        for (const requirement of requirements) {
            console.log(`\n📝 Processing: ${requirement}`);
            await orchestrator.processRequirement(requirement);
            
            // Small delay between requirements
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Wait for events to process
        await new Promise(resolve => setTimeout(resolve, 3000));

        await orchestrator.shutdown();
        console.log('\n✅ Event-driven example completed!');

    } catch (error) {
        console.error('\n❌ Event-driven example failed:', error);
        process.exit(1);
    }
}

/**
 * Example: Health monitoring
 */
async function healthMonitoringExample() {
    console.log('🏥 Starting Health Monitoring Example...\n');

    try {
        const orchestrator = await createOrchestrator();

        // Set up health monitoring event listeners
        orchestrator.on('healthCheck:completed', (data) => {
            console.log('🔍 Health check completed:');
            console.log(`  Overall status: ${data.overall.status}`);
            console.log(`  Components checked: ${Object.keys(data.components).length}`);
            console.log(`  Check time: ${data.checkTime}ms`);
        });

        orchestrator.on('component:unhealthy', (data) => {
            console.log(`⚠️ Component unhealthy: ${data.componentName} - ${data.status.message}`);
        });

        orchestrator.on('alert:sent', (alert) => {
            console.log(`🚨 Alert sent for ${alert.componentName}: ${alert.message}`);
        });

        // Let health monitoring run for a while
        console.log('⏳ Monitoring health for 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Get health status
        const healthStatus = orchestrator.healthMonitor.getAllComponentHealth();
        console.log('\n📊 Component Health Status:');
        for (const [componentName, status] of Object.entries(healthStatus)) {
            console.log(`  ${componentName}: ${status.status} (${status.checkCount} checks)`);
        }

        await orchestrator.shutdown();
        console.log('\n✅ Health monitoring example completed!');

    } catch (error) {
        console.error('\n❌ Health monitoring example failed:', error);
        process.exit(1);
    }
}

/**
 * Run examples based on command line argument
 */
async function main() {
    const example = process.argv[2] || 'basic';

    switch (example) {
        case 'basic':
            await basicExample();
            break;
        case 'events':
            await eventDrivenExample();
            break;
        case 'health':
            await healthMonitoringExample();
            break;
        case 'all':
            await basicExample();
            console.log('\n' + '='.repeat(50) + '\n');
            await eventDrivenExample();
            console.log('\n' + '='.repeat(50) + '\n');
            await healthMonitoringExample();
            break;
        default:
            console.log('Usage: node src/core/example.js [basic|events|health|all]');
            console.log('  basic  - Basic orchestrator usage');
            console.log('  events - Event-driven example');
            console.log('  health - Health monitoring example');
            console.log('  all    - Run all examples');
            process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('❌ Example failed:', error);
        process.exit(1);
    });
}

export {
    basicExample,
    eventDrivenExample,
    healthMonitoringExample
};

