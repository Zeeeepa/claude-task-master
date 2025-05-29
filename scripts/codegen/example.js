#!/usr/bin/env node

/**
 * @fileoverview Codegen Integration Example
 * @description Example script demonstrating the consolidated Codegen integration
 */

import { CodegenIntegration } from '../../src/integrations/codegen/index.js';

/**
 * Example usage of the Codegen integration
 */
async function runExample() {
    console.log('🚀 Codegen Integration Example\n');
    
    try {
        // Initialize the integration
        console.log('1. Initializing Codegen integration...');
        const codegen = new CodegenIntegration({
            // Enable mock mode for demonstration
            enableMock: true,
            
            // API configuration (would use real values in production)
            apiKey: process.env.CODEGEN_API_KEY || 'demo-api-key',
            orgId: process.env.CODEGEN_ORG_ID || 'demo-org',
            
            // GitHub configuration
            githubToken: process.env.GITHUB_TOKEN || 'demo-github-token',
            defaultRepository: 'demo-org/demo-repo',
            
            // Enable all features for demonstration
            enableAutoReview: true,
            enableStatusTracking: true,
            enableNotifications: true,
            
            // Development settings
            logLevel: 'info'
        });
        
        await codegen.initialize();
        console.log('✅ Integration initialized successfully\n');
        
        // Example 1: Simple feature creation
        console.log('2. Processing simple feature task...');
        const simpleTask = {
            id: 'task-001',
            title: 'Add user authentication',
            description: 'Create a simple user authentication system with login and logout functionality using JWT tokens'
        };
        
        const simpleResult = await codegen.processTask(simpleTask, {
            repository: 'demo-org/demo-repo',
            language: 'javascript',
            framework: 'express'
        });
        
        console.log('✅ Simple task completed:');
        console.log(`   PR URL: ${simpleResult.prUrl}`);
        console.log(`   Branch: ${simpleResult.branch}`);
        console.log(`   Processing time: ${simpleResult.processingTime}ms\n`);
        
        // Example 2: Complex feature with detailed requirements
        console.log('3. Processing complex feature task...');
        const complexTask = {
            id: 'task-002',
            title: 'Implement real-time chat system',
            description: `Create a comprehensive real-time chat system with the following features:
            - WebSocket-based real-time messaging
            - User presence indicators
            - Message history and persistence
            - File sharing capabilities
            - Message encryption for security
            - Support for group chats and direct messages
            - Emoji reactions and message threading
            - Push notifications for offline users`
        };
        
        const complexResult = await codegen.processTask(complexTask, {
            repository: 'demo-org/demo-repo',
            language: 'typescript',
            framework: 'react',
            includeContext: true,
            includeExamples: true
        });
        
        console.log('✅ Complex task completed:');
        console.log(`   PR URL: ${complexResult.prUrl}`);
        console.log(`   Branch: ${complexResult.branch}`);
        console.log(`   Complexity: ${complexResult.analysis.complexity.level}`);
        console.log(`   Estimated effort: ${complexResult.analysis.complexity.estimatedHours} hours`);
        console.log(`   Technologies: ${complexResult.analysis.technologies.languages.map(l => l.name).join(', ')}`);
        console.log(`   Processing time: ${complexResult.processingTime}ms\n`);
        
        // Example 3: Batch processing
        console.log('4. Processing batch of tasks...');
        const batchTasks = [
            {
                id: 'task-003',
                title: 'Add input validation',
                description: 'Add comprehensive input validation to all API endpoints'
            },
            {
                id: 'task-004', 
                title: 'Implement error logging',
                description: 'Add structured error logging with different log levels'
            },
            {
                id: 'task-005',
                title: 'Create unit tests',
                description: 'Add unit tests for the authentication module with good coverage'
            }
        ];
        
        const batchResults = await codegen.processBatch(batchTasks, {
            concurrent: 2,
            failFast: false,
            repository: 'demo-org/demo-repo',
            language: 'javascript'
        });
        
        console.log('✅ Batch processing completed:');
        console.log(`   Total tasks: ${batchTasks.length}`);
        console.log(`   Successful: ${batchResults.filter(r => r.success).length}`);
        console.log(`   Failed: ${batchResults.filter(r => !r.success).length}\n`);
        
        // Display metrics
        console.log('5. Integration metrics:');
        const metrics = codegen.getMetrics();
        console.log(`   Tasks processed: ${metrics.tasksProcessed}`);
        console.log(`   PRs created: ${metrics.prsCreated}`);
        console.log(`   Success rate: ${(metrics.successRate * 100).toFixed(1)}%`);
        console.log(`   Average processing time: ${Math.round(metrics.averageProcessingTime)}ms\n`);
        
        // Display status
        console.log('6. Integration status:');
        const status = await codegen.getStatus();
        console.log(`   Initialized: ${status.initialized}`);
        console.log(`   Healthy: ${status.healthy}`);
        console.log(`   Components: ${Object.keys(status.components).join(', ')}\n`);
        
        // Shutdown gracefully
        console.log('7. Shutting down integration...');
        await codegen.shutdown();
        console.log('✅ Integration shutdown completed\n');
        
        console.log('🎉 Example completed successfully!');
        
    } catch (error) {
        console.error('❌ Example failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

/**
 * Example of individual component usage
 */
async function runComponentExample() {
    console.log('\n🔧 Individual Component Example\n');
    
    try {
        // Import individual components
        const { TaskAnalyzer, PromptGenerator, CodegenConfig } = await import('../../src/integrations/codegen/index.js');
        
        // Create configuration
        const config = new CodegenConfig({
            enableMock: true,
            maxComplexityScore: 100,
            maxPromptLength: 4000
        });
        
        // Initialize task analyzer
        const taskAnalyzer = new TaskAnalyzer(config.getComponent('taskAnalyzer'));
        await taskAnalyzer.initialize();
        
        // Analyze a task
        const taskDescription = 'Create a REST API for managing user profiles with CRUD operations, authentication, and data validation';
        const analysis = await taskAnalyzer.analyzeTask(taskDescription, {
            language: 'python',
            framework: 'fastapi'
        });
        
        console.log('📊 Task Analysis Results:');
        console.log(`   Intent: ${analysis.intent.primary} (${(analysis.intent.confidence * 100).toFixed(1)}% confidence)`);
        console.log(`   Complexity: ${analysis.complexity.level} (score: ${analysis.complexity.score})`);
        console.log(`   Estimated effort: ${analysis.complexity.estimatedHours} hours`);
        console.log(`   Estimated files: ${analysis.complexity.estimatedFiles}`);
        console.log(`   Technologies: ${analysis.technologies.languages.map(l => l.name).join(', ')}`);
        console.log(`   Requirements: ${analysis.requirements.functional.length} functional, ${Object.keys(analysis.requirements.nonFunctional).length} non-functional\n`);
        
        // Initialize prompt generator
        const promptGenerator = new PromptGenerator(config.getComponent('promptGenerator'));
        await promptGenerator.initialize();
        
        // Generate prompt
        const prompt = await promptGenerator.generatePrompt(analysis, {
            includeContext: true,
            includeExamples: false
        });
        
        console.log('📝 Generated Prompt:');
        console.log(`   Length: ${prompt.content.length} characters`);
        console.log(`   Template: ${prompt.metadata.template}`);
        console.log(`   Optimized: ${prompt.metadata.optimized ? 'Yes' : 'No'}`);
        console.log(`   Instructions: ${prompt.instructions.length} items`);
        console.log(`   Constraints: ${Object.keys(prompt.constraints).length} items\n`);
        
        // Display first 200 characters of prompt
        console.log('📄 Prompt Preview:');
        console.log(`   "${prompt.content.substring(0, 200)}..."\n`);
        
        console.log('✅ Component example completed!');
        
    } catch (error) {
        console.error('❌ Component example failed:', error.message);
        console.error(error.stack);
    }
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'full';
    
    switch (command) {
        case 'full':
            await runExample();
            break;
        case 'components':
            await runComponentExample();
            break;
        case 'both':
            await runExample();
            await runComponentExample();
            break;
        default:
            console.log('Usage: node example.js [full|components|both]');
            console.log('  full       - Run full integration example (default)');
            console.log('  components - Run individual component example');
            console.log('  both       - Run both examples');
            process.exit(1);
    }
}

// Run the example if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('❌ Example script failed:', error.message);
        process.exit(1);
    });
}

