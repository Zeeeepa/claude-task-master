#!/usr/bin/env node

/**
 * @fileoverview CLI tool for testing and demonstrating codegen integration
 * Provides command-line interface for common operations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { 
    createCompleteIntegration,
    createMinimalIntegration,
    TASK_TYPES 
} from './index.js';
import { runAllExamples, MockDataGenerators } from './examples.js';
import { createConfig, validateEnvironment } from './config.js';

const program = new Command();

program
    .name('codegen-integration')
    .description('CLI tool for codegen integration system')
    .version('1.0.0');

/**
 * Generate prompt command
 */
program
    .command('generate-prompt')
    .description('Generate a prompt for a task')
    .option('-t, --type <type>', 'Task type', 'implementation')
    .option('-T, --title <title>', 'Task title', 'Sample Task')
    .option('-d, --description <description>', 'Task description', 'Sample task description')
    .option('-o, --output <file>', 'Output file for the prompt')
    .action(async (options) => {
        const spinner = ora('Generating prompt...').start();
        
        try {
            const integration = createMinimalIntegration();
            
            const task = MockDataGenerators.createMockTask({
                type: options.type,
                title: options.title,
                description: options.description
            });
            
            const context = MockDataGenerators.createMockContext();
            const prompt = integration.generatePrompt(task, context);
            
            spinner.succeed('Prompt generated successfully');
            
            console.log(chalk.blue('\n=== Generated Prompt ==='));
            console.log(chalk.gray('Task ID:'), prompt.task_id);
            console.log(chalk.gray('Task Type:'), prompt.task_type);
            console.log(chalk.gray('Complexity:'), prompt.metadata.estimated_complexity);
            console.log(chalk.gray('Content Length:'), prompt.content.length);
            
            if (options.output) {
                const fs = await import('fs');
                fs.writeFileSync(options.output, prompt.content);
                console.log(chalk.green(`\nPrompt saved to: ${options.output}`));
            } else {
                console.log(chalk.yellow('\n=== Prompt Content ==='));
                console.log(prompt.content);
            }
        } catch (error) {
            spinner.fail('Failed to generate prompt');
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

/**
 * Process task command
 */
program
    .command('process-task')
    .description('Process a complete task workflow')
    .option('-t, --type <type>', 'Task type', 'implementation')
    .option('-T, --title <title>', 'Task title', 'Sample Task')
    .option('-d, --description <description>', 'Task description', 'Sample task description')
    .option('--mock', 'Use mock mode (default: true)', true)
    .action(async (options) => {
        const spinner = ora('Processing task...').start();
        
        try {
            const integration = options.mock ? 
                createCompleteIntegration() : 
                createCompleteIntegration({
                    codegenClient: {
                        apiKey: process.env.CODEGEN_API_KEY
                    }
                });
            
            const task = MockDataGenerators.createMockTask({
                type: options.type,
                title: options.title,
                description: options.description
            });
            
            const context = MockDataGenerators.createMockContext();
            const result = await integration.processTask(task, context);
            
            spinner.succeed('Task processed successfully');
            
            console.log(chalk.blue('\n=== Workflow Result ==='));
            console.log(chalk.gray('Workflow ID:'), result.workflow_id);
            console.log(chalk.gray('Task ID:'), result.task_id);
            console.log(chalk.gray('Status:'), 
                result.status === 'completed' ? chalk.green(result.status) : chalk.red(result.status)
            );
            
            if (result.pr_info) {
                console.log(chalk.blue('\n=== PR Information ==='));
                console.log(chalk.gray('PR URL:'), chalk.cyan(result.pr_info.pr_url));
                console.log(chalk.gray('PR Number:'), result.pr_info.pr_number);
                console.log(chalk.gray('Branch:'), result.pr_info.branch_name);
                console.log(chalk.gray('Modified Files:'), result.pr_info.modified_files.join(', '));
            }
            
            if (result.error_message) {
                console.log(chalk.red('\nError:'), result.error_message);
            }
        } catch (error) {
            spinner.fail('Failed to process task');
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

/**
 * Statistics command
 */
program
    .command('stats')
    .description('Show integration statistics')
    .action(async () => {
        const spinner = ora('Gathering statistics...').start();
        
        try {
            const integration = createCompleteIntegration();
            
            // Process a few sample tasks to generate stats
            for (let i = 0; i < 3; i++) {
                const task = MockDataGenerators.createMockTask({
                    id: `sample_task_${i}`,
                    title: `Sample Task ${i + 1}`
                });
                const context = MockDataGenerators.createMockContext();
                await integration.processTask(task, context);
            }
            
            const stats = await integration.getStatistics();
            
            spinner.succeed('Statistics gathered');
            
            console.log(chalk.blue('\n=== Integration Statistics ==='));
            console.log(chalk.gray('Active Requests:'), stats.active_requests);
            console.log(chalk.gray('Completed Requests:'), stats.completed_requests);
            console.log(chalk.gray('Success Rate:'), `${stats.success_rate.toFixed(2)}%`);
            
            if (stats.pr_stats) {
                console.log(chalk.blue('\n=== PR Statistics ==='));
                console.log(chalk.gray('Total PRs:'), stats.pr_stats.total);
                console.log(chalk.gray('Open PRs:'), stats.pr_stats.by_status.open || 0);
                console.log(chalk.gray('Merged PRs:'), stats.pr_stats.by_status.merged || 0);
                console.log(chalk.gray('Closed PRs:'), stats.pr_stats.by_status.closed || 0);
                console.log(chalk.gray('PR Success Rate:'), `${stats.pr_stats.success_rate.toFixed(2)}%`);
            }
        } catch (error) {
            spinner.fail('Failed to gather statistics');
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

/**
 * Configuration command
 */
program
    .command('config')
    .description('Show current configuration')
    .option('-e, --environment <env>', 'Environment to show config for', process.env.NODE_ENV || 'development')
    .option('--validate', 'Validate configuration')
    .action(async (options) => {
        try {
            const config = createConfig(options.environment);
            
            if (options.validate) {
                const validation = config.validate();
                
                console.log(chalk.blue('\n=== Configuration Validation ==='));
                console.log(chalk.gray('Valid:'), 
                    validation.valid ? chalk.green('Yes') : chalk.red('No')
                );
                
                if (validation.errors.length > 0) {
                    console.log(chalk.red('\nErrors:'));
                    validation.errors.forEach(error => {
                        console.log(chalk.red('  ✗'), error);
                    });
                }
                
                if (validation.warnings.length > 0) {
                    console.log(chalk.yellow('\nWarnings:'));
                    validation.warnings.forEach(warning => {
                        console.log(chalk.yellow('  ⚠'), warning);
                    });
                }
            } else {
                const summary = config.getSummary();
                
                console.log(chalk.blue('\n=== Configuration Summary ==='));
                console.log(chalk.gray('Environment:'), summary.environment);
                console.log(chalk.gray('Configuration:'));
                console.log(JSON.stringify(summary.config, null, 2));
            }
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

/**
 * Examples command
 */
program
    .command('examples')
    .description('Run all integration examples')
    .action(async () => {
        const spinner = ora('Running examples...').start();
        
        try {
            await runAllExamples();
            spinner.succeed('All examples completed successfully');
        } catch (error) {
            spinner.fail('Examples failed');
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

/**
 * Test command
 */
program
    .command('test')
    .description('Run basic integration tests')
    .action(async () => {
        const spinner = ora('Running tests...').start();
        
        try {
            // Basic functionality tests
            const integration = createCompleteIntegration();
            
            // Test 1: Prompt generation
            const task = MockDataGenerators.createMockTask();
            const context = MockDataGenerators.createMockContext();
            const prompt = integration.generatePrompt(task, context);
            
            if (!prompt || !prompt.content) {
                throw new Error('Prompt generation failed');
            }
            
            // Test 2: Task processing
            const result = await integration.processTask(task, context);
            
            if (!result || !result.workflow_id) {
                throw new Error('Task processing failed');
            }
            
            // Test 3: Statistics
            const stats = await integration.getStatistics();
            
            if (!stats || typeof stats.success_rate !== 'number') {
                throw new Error('Statistics gathering failed');
            }
            
            spinner.succeed('All tests passed');
            
            console.log(chalk.green('\n✅ Integration tests completed successfully'));
            console.log(chalk.gray('Prompt generated:'), prompt.content.length, 'characters');
            console.log(chalk.gray('Task processed:'), result.status);
            console.log(chalk.gray('Success rate:'), `${stats.success_rate}%`);
        } catch (error) {
            spinner.fail('Tests failed');
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

/**
 * Environment validation command
 */
program
    .command('validate-env')
    .description('Validate environment configuration')
    .action(async () => {
        try {
            const validation = validateEnvironment();
            
            console.log(chalk.blue('\n=== Environment Validation ==='));
            console.log(chalk.gray('Valid:'), 
                validation.valid ? chalk.green('Yes') : chalk.red('No')
            );
            
            if (validation.errors.length > 0) {
                console.log(chalk.red('\nErrors:'));
                validation.errors.forEach(error => {
                    console.log(chalk.red('  ✗'), error);
                });
            }
            
            if (validation.warnings.length > 0) {
                console.log(chalk.yellow('\nWarnings:'));
                validation.warnings.forEach(warning => {
                    console.log(chalk.yellow('  ⚠'), warning);
                });
            }
            
            if (validation.valid) {
                console.log(chalk.green('\n✅ Environment is properly configured'));
            } else {
                console.log(chalk.red('\n❌ Environment configuration issues found'));
                process.exit(1);
            }
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

/**
 * Available task types command
 */
program
    .command('task-types')
    .description('List available task types')
    .action(() => {
        console.log(chalk.blue('\n=== Available Task Types ==='));
        
        Object.entries(TASK_TYPES).forEach(([key, value]) => {
            console.log(chalk.gray('•'), chalk.cyan(value), chalk.gray(`(${key})`));
        });
        
        console.log(chalk.yellow('\nUse these values with the --type option'));
    });

// Error handling
program.on('command:*', () => {
    console.error(chalk.red('Invalid command:'), program.args.join(' '));
    console.log(chalk.yellow('Use --help to see available commands'));
    process.exit(1);
});

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}

