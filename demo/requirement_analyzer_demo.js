#!/usr/bin/env node

/**
 * Requirement Analyzer Demo Script
 * Demonstrates the capabilities of the requirement analysis engine
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { 
    analyzeRequirement, 
    RequirementAnalyzer,
    parseNaturalLanguageRequirement,
    decomposeIntoAtomicTasks,
    analyzeTaskDependencies
} from '../src/requirement_analyzer/index.js';
import { sampleRequirements, runAllExamples } from '../src/requirement_analyzer/examples.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Demo configuration
 */
const DEMO_CONFIG = {
    showDetailedOutput: true,
    runPerformanceTests: true,
    generateReports: true,
    pauseBetweenDemos: false
};

/**
 * Utility functions for demo presentation
 */
function printHeader(title) {
    console.log('\n' + '='.repeat(80));
    console.log(`🚀 ${title}`);
    console.log('='.repeat(80) + '\n');
}

function printSubHeader(title) {
    console.log('\n' + '-'.repeat(60));
    console.log(`📋 ${title}`);
    console.log('-'.repeat(60) + '\n');
}

function printSuccess(message) {
    console.log(`✅ ${message}`);
}

function printInfo(message) {
    console.log(`ℹ️  ${message}`);
}

function printWarning(message) {
    console.log(`⚠️  ${message}`);
}

function printError(message) {
    console.log(`❌ ${message}`);
}

function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

async function pause(ms = 2000) {
    if (DEMO_CONFIG.pauseBetweenDemos) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Demo 1: Basic Requirement Analysis
 */
async function demoBasicAnalysis() {
    printHeader('Demo 1: Basic Requirement Analysis');
    
    const startTime = Date.now();
    
    try {
        printInfo('Analyzing simple authentication requirement...');
        
        const result = await analyzeRequirement(sampleRequirements.simple, {
            enableDependencyAnalysis: true,
            enableComplexityEstimation: true
        });
        
        const duration = Date.now() - startTime;
        
        printSuccess(`Analysis completed in ${formatDuration(duration)}`);
        
        console.log('\n📊 Analysis Summary:');
        console.log(`   Requirement: ${result.requirement.title}`);
        console.log(`   Original Length: ${result.requirement.originalText.length} characters`);
        console.log(`   Estimated Complexity: ${result.requirement.estimatedComplexity}/10`);
        console.log(`   Priority: ${result.requirement.priority}`);
        console.log(`   Tags: ${result.requirement.tags.join(', ')}`);
        
        console.log('\n📋 Extracted Information:');
        console.log(`   Technical Specs: ${result.requirement.technicalSpecs.length}`);
        console.log(`   Business Requirements: ${result.requirement.businessRequirements.length}`);
        console.log(`   Acceptance Criteria: ${result.requirement.acceptanceCriteria.length}`);
        
        console.log('\n🔧 Generated Tasks:');
        console.log(`   Total Tasks: ${result.summary.totalTasks}`);
        console.log(`   Average Complexity: ${result.summary.averageComplexity.toFixed(2)}`);
        console.log(`   High Complexity Tasks: ${result.summary.highComplexityTasks}`);
        console.log(`   Dependencies: ${result.summary.dependencyCount}`);
        console.log(`   Valid Tasks: ${result.summary.validTasks}/${result.summary.totalTasks}`);
        
        if (DEMO_CONFIG.showDetailedOutput) {
            console.log('\n📝 Task Details:');
            result.tasks.forEach((task, index) => {
                console.log(`   ${index + 1}. ${task.title}`);
                console.log(`      Complexity: ${task.complexityScore}/10`);
                console.log(`      Dependencies: ${task.dependencies.length}`);
                console.log(`      Affected Files: ${task.affectedFiles.length}`);
                console.log(`      Requirements: ${task.requirements.length}`);
                console.log(`      Acceptance Criteria: ${task.acceptanceCriteria.length}`);
            });
        }
        
        return result;
    } catch (error) {
        printError(`Analysis failed: ${error.message}`);
        throw error;
    }
}

/**
 * Demo 2: Complex Requirement Decomposition
 */
async function demoComplexDecomposition() {
    printHeader('Demo 2: Complex Requirement Decomposition');
    
    const startTime = Date.now();
    
    try {
        printInfo('Analyzing complex e-commerce requirement...');
        
        const result = await analyzeRequirement(sampleRequirements.complex, {
            maxTasksPerRequirement: 15,
            enableSubtaskGeneration: true,
            enableDependencyAnalysis: true
        });
        
        const duration = Date.now() - startTime;
        
        printSuccess(`Complex analysis completed in ${formatDuration(duration)}`);
        
        console.log('\n📊 Complex Analysis Summary:');
        console.log(`   Requirement: ${result.requirement.title}`);
        console.log(`   Original Length: ${result.requirement.originalText.length} characters`);
        console.log(`   Complexity: ${result.requirement.estimatedComplexity}/10`);
        console.log(`   Generated Tasks: ${result.summary.totalTasks}`);
        console.log(`   Average Task Complexity: ${result.summary.averageComplexity.toFixed(2)}`);
        
        // Analyze decomposition strategy
        const taskTags = result.tasks.flatMap(task => task.tags);
        const uniqueTags = [...new Set(taskTags)];
        console.log(`   Decomposition Tags: ${uniqueTags.join(', ')}`);
        
        // Analyze complexity distribution
        const complexityDistribution = {
            low: result.tasks.filter(t => t.complexityScore <= 3).length,
            medium: result.tasks.filter(t => t.complexityScore > 3 && t.complexityScore <= 6).length,
            high: result.tasks.filter(t => t.complexityScore > 6).length
        };
        
        console.log('\n📈 Complexity Distribution:');
        console.log(`   Low (1-3): ${complexityDistribution.low} tasks`);
        console.log(`   Medium (4-6): ${complexityDistribution.medium} tasks`);
        console.log(`   High (7-10): ${complexityDistribution.high} tasks`);
        
        // Dependency analysis
        if (result.summary.dependencyCount > 0) {
            console.log('\n🔗 Dependency Analysis:');
            console.log(`   Total Dependencies: ${result.summary.dependencyCount}`);
            
            try {
                const executionOrder = result.dependencyGraph.getTopologicalOrder();
                console.log(`   Execution Phases: ${executionOrder.length}`);
                
                if (DEMO_CONFIG.showDetailedOutput) {
                    console.log('\n   Execution Order:');
                    executionOrder.forEach((task, index) => {
                        const deps = task.dependencies.length;
                        console.log(`      ${index + 1}. ${task.title} (${deps} dependencies)`);
                    });
                }
            } catch (error) {
                printWarning(`Cannot determine execution order: ${error.message}`);
            }
        }
        
        return result;
    } catch (error) {
        printError(`Complex analysis failed: ${error.message}`);
        throw error;
    }
}

/**
 * Demo 3: Workflow-based Decomposition
 */
async function demoWorkflowDecomposition() {
    printHeader('Demo 3: Workflow-based Decomposition');
    
    const startTime = Date.now();
    
    try {
        printInfo('Analyzing CI/CD workflow requirement...');
        
        const result = await analyzeRequirement(sampleRequirements.workflow, {
            enableDependencyAnalysis: true,
            enableComplexityEstimation: true
        });
        
        const duration = Date.now() - startTime;
        
        printSuccess(`Workflow analysis completed in ${formatDuration(duration)}`);
        
        console.log('\n📊 Workflow Analysis Summary:');
        console.log(`   Requirement Type: Workflow`);
        console.log(`   Sequential Tasks: ${result.summary.totalTasks}`);
        console.log(`   Dependencies: ${result.summary.dependencyCount}`);
        
        // Check for sequential dependencies
        const hasSequentialDeps = result.tasks.some(task => task.dependencies.length > 0);
        console.log(`   Sequential Dependencies: ${hasSequentialDeps ? 'Yes' : 'No'}`);
        
        if (DEMO_CONFIG.showDetailedOutput && hasSequentialDeps) {
            console.log('\n🔄 Workflow Steps:');
            try {
                const executionOrder = result.dependencyGraph.getTopologicalOrder();
                executionOrder.forEach((task, index) => {
                    console.log(`   Step ${index + 1}: ${task.title}`);
                    console.log(`      Complexity: ${task.complexityScore}/10`);
                    console.log(`      Dependencies: ${task.dependencies.length}`);
                });
            } catch (error) {
                printWarning(`Cannot determine workflow order: ${error.message}`);
            }
        }
        
        return result;
    } catch (error) {
        printError(`Workflow analysis failed: ${error.message}`);
        throw error;
    }
}

/**
 * Demo 4: Codegen Prompt Generation
 */
async function demoCodegenPrompts() {
    printHeader('Demo 4: Codegen Prompt Generation');
    
    try {
        printInfo('Generating codegen prompts for authentication tasks...');
        
        const analyzer = new RequirementAnalyzer();
        const requirement = await analyzer.parseRequirements(sampleRequirements.simple);
        const tasks = await analyzer.decomposeTask(requirement);
        
        console.log(`\n📝 Generated ${tasks.length} codegen prompts:\n`);
        
        for (let i = 0; i < Math.min(tasks.length, 2); i++) {
            const task = tasks[i];
            const prompt = await analyzer.generateCodegenPrompt(task);
            
            console.log(`🔧 Prompt ${i + 1}: ${prompt.title}`);
            console.log(`   Priority: ${prompt.priority}`);
            console.log(`   Complexity: ${prompt.estimatedComplexity}/10`);
            console.log(`   Requirements: ${prompt.requirements.length}`);
            console.log(`   Acceptance Criteria: ${prompt.acceptanceCriteria.length}`);
            console.log(`   Affected Files: ${prompt.affectedFiles.length}`);
            
            if (DEMO_CONFIG.showDetailedOutput) {
                console.log('\n   Formatted Prompt Preview:');
                const formatted = prompt.format();
                const lines = formatted.split('\n').slice(0, 10);
                lines.forEach(line => console.log(`      ${line}`));
                if (formatted.split('\n').length > 10) {
                    console.log('      ... (truncated)');
                }
            }
            console.log();
        }
        
        printSuccess('Codegen prompts generated successfully');
        
    } catch (error) {
        printError(`Prompt generation failed: ${error.message}`);
        throw error;
    }
}

/**
 * Demo 5: Task Validation
 */
async function demoTaskValidation() {
    printHeader('Demo 5: Task Validation');
    
    try {
        printInfo('Validating task completeness...');
        
        const analyzer = new RequirementAnalyzer();
        const requirement = await analyzer.parseRequirements(sampleRequirements.integration);
        const tasks = await analyzer.decomposeTask(requirement);
        
        console.log(`\n🔍 Validating ${tasks.length} tasks:\n`);
        
        let totalScore = 0;
        let validTasks = 0;
        
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            const validation = await analyzer.validateTaskCompleteness(task);
            
            totalScore += validation.score;
            if (validation.isValid) validTasks++;
            
            const status = validation.isValid ? '✅' : '⚠️';
            console.log(`${status} Task ${i + 1}: ${task.title}`);
            console.log(`   Score: ${validation.score}/100`);
            console.log(`   Valid: ${validation.isValid}`);
            
            if (validation.errors.length > 0) {
                console.log(`   Errors: ${validation.errors.length}`);
                if (DEMO_CONFIG.showDetailedOutput) {
                    validation.errors.forEach(error => {
                        console.log(`      - ${error}`);
                    });
                }
            }
            
            if (validation.warnings.length > 0) {
                console.log(`   Warnings: ${validation.warnings.length}`);
                if (DEMO_CONFIG.showDetailedOutput) {
                    validation.warnings.forEach(warning => {
                        console.log(`      - ${warning}`);
                    });
                }
            }
            
            if (validation.suggestions.length > 0) {
                console.log(`   Suggestions: ${validation.suggestions.length}`);
                if (DEMO_CONFIG.showDetailedOutput) {
                    validation.suggestions.slice(0, 2).forEach(suggestion => {
                        console.log(`      - ${suggestion}`);
                    });
                }
            }
            console.log();
        }
        
        const averageScore = totalScore / tasks.length;
        
        console.log('📊 Validation Summary:');
        console.log(`   Valid Tasks: ${validTasks}/${tasks.length}`);
        console.log(`   Average Score: ${averageScore.toFixed(2)}/100`);
        console.log(`   Quality Rating: ${getQualityRating(averageScore)}`);
        
        printSuccess('Task validation completed');
        
    } catch (error) {
        printError(`Task validation failed: ${error.message}`);
        throw error;
    }
}

/**
 * Demo 6: Performance Benchmarks
 */
async function demoPerformanceBenchmarks() {
    if (!DEMO_CONFIG.runPerformanceTests) {
        printInfo('Performance tests skipped (disabled in config)');
        return;
    }
    
    printHeader('Demo 6: Performance Benchmarks');
    
    try {
        printInfo('Running performance benchmarks...');
        
        const benchmarks = [
            { name: 'Simple Requirement', text: sampleRequirements.simple, iterations: 10 },
            { name: 'Complex Requirement', text: sampleRequirements.complex, iterations: 5 },
            { name: 'Workflow Requirement', text: sampleRequirements.workflow, iterations: 8 }
        ];
        
        console.log('\n⏱️  Performance Results:\n');
        
        for (const benchmark of benchmarks) {
            printInfo(`Testing: ${benchmark.name} (${benchmark.iterations} iterations)`);
            
            const times = [];
            const taskCounts = [];
            
            for (let i = 0; i < benchmark.iterations; i++) {
                const startTime = Date.now();
                const result = await analyzeRequirement(benchmark.text);
                const duration = Date.now() - startTime;
                
                times.push(duration);
                taskCounts.push(result.summary.totalTasks);
                
                process.stdout.write('.');
            }
            
            const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
            const minTime = Math.min(...times);
            const maxTime = Math.max(...times);
            const avgTasks = taskCounts.reduce((sum, count) => sum + count, 0) / taskCounts.length;
            
            console.log(`\n   Results for ${benchmark.name}:`);
            console.log(`      Average Time: ${formatDuration(avgTime)}`);
            console.log(`      Min Time: ${formatDuration(minTime)}`);
            console.log(`      Max Time: ${formatDuration(maxTime)}`);
            console.log(`      Average Tasks: ${avgTasks.toFixed(1)}`);
            console.log(`      Throughput: ${(1000 / avgTime).toFixed(2)} analyses/second`);
            console.log();
        }
        
        printSuccess('Performance benchmarks completed');
        
    } catch (error) {
        printError(`Performance benchmarks failed: ${error.message}`);
        throw error;
    }
}

/**
 * Demo 7: Batch Processing
 */
async function demoBatchProcessing() {
    printHeader('Demo 7: Batch Processing');
    
    try {
        printInfo('Processing multiple requirements in batch...');
        
        const requirements = [
            sampleRequirements.simple,
            sampleRequirements.bugfix,
            sampleRequirements.integration
        ];
        
        const startTime = Date.now();
        const results = [];
        
        for (let i = 0; i < requirements.length; i++) {
            try {
                const result = await analyzeRequirement(requirements[i]);
                results.push({ success: true, result });
                printSuccess(`Requirement ${i + 1} analyzed successfully`);
            } catch (error) {
                results.push({ success: false, error: error.message });
                printError(`Requirement ${i + 1} failed: ${error.message}`);
            }
        }
        
        const duration = Date.now() - startTime;
        const successCount = results.filter(r => r.success).length;
        
        console.log('\n📊 Batch Processing Summary:');
        console.log(`   Total Requirements: ${requirements.length}`);
        console.log(`   Successful: ${successCount}`);
        console.log(`   Failed: ${requirements.length - successCount}`);
        console.log(`   Total Time: ${formatDuration(duration)}`);
        console.log(`   Average Time: ${formatDuration(duration / requirements.length)}`);
        
        if (successCount > 0) {
            const totalTasks = results
                .filter(r => r.success)
                .reduce((sum, r) => sum + r.result.summary.totalTasks, 0);
            
            const avgComplexity = results
                .filter(r => r.success)
                .reduce((sum, r) => sum + r.result.summary.averageComplexity, 0) / successCount;
            
            console.log(`   Total Tasks Generated: ${totalTasks}`);
            console.log(`   Average Complexity: ${avgComplexity.toFixed(2)}`);
        }
        
        printSuccess('Batch processing completed');
        
    } catch (error) {
        printError(`Batch processing failed: ${error.message}`);
        throw error;
    }
}

/**
 * Utility function to get quality rating
 */
function getQualityRating(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Good';
    if (score >= 70) return 'Fair';
    if (score >= 60) return 'Poor';
    return 'Needs Improvement';
}

/**
 * Main demo runner
 */
async function runDemo() {
    console.log('🎯 Requirement Analyzer Engine Demo');
    console.log('=====================================\n');
    
    printInfo('Starting comprehensive demonstration of the requirement analysis engine...');
    
    const overallStartTime = Date.now();
    
    try {
        // Run all demos
        await demoBasicAnalysis();
        await pause();
        
        await demoComplexDecomposition();
        await pause();
        
        await demoWorkflowDecomposition();
        await pause();
        
        await demoCodegenPrompts();
        await pause();
        
        await demoTaskValidation();
        await pause();
        
        await demoPerformanceBenchmarks();
        await pause();
        
        await demoBatchProcessing();
        
        const overallDuration = Date.now() - overallStartTime;
        
        printHeader('Demo Complete');
        printSuccess(`All demos completed successfully in ${formatDuration(overallDuration)}`);
        
        console.log('\n🎉 Key Capabilities Demonstrated:');
        console.log('   ✅ Natural language requirement parsing');
        console.log('   ✅ Intelligent task decomposition');
        console.log('   ✅ Dependency analysis and validation');
        console.log('   ✅ Multi-dimensional complexity estimation');
        console.log('   ✅ Codegen prompt generation');
        console.log('   ✅ Task completeness validation');
        console.log('   ✅ Performance optimization');
        console.log('   ✅ Batch processing capabilities');
        
        console.log('\n🚀 Ready for Integration:');
        console.log('   📊 PostgreSQL task storage');
        console.log('   🤖 Codegen prompt generation');
        console.log('   🔍 Claude Code validation context');
        console.log('   📈 Workflow orchestration');
        console.log('   📋 Progress tracking');
        
    } catch (error) {
        printError(`Demo failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

/**
 * Run examples if this is the main module
 */
if (import.meta.url === `file://${process.argv[1]}`) {
    runDemo().catch(error => {
        console.error('Demo execution failed:', error);
        process.exit(1);
    });
}

export {
    runDemo,
    demoBasicAnalysis,
    demoComplexDecomposition,
    demoWorkflowDecomposition,
    demoCodegenPrompts,
    demoTaskValidation,
    demoPerformanceBenchmarks,
    demoBatchProcessing
};

