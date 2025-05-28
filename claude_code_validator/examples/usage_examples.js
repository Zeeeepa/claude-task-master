/**
 * claude_code_validator/examples/usage_examples.js
 * 
 * Comprehensive usage examples for the Claude Code validation system.
 * These examples demonstrate how to use the validation system in various scenarios.
 */

import {
    createValidator,
    validatePR,
    analyzeCode,
    calculateScores,
    generateFeedback,
    healthCheck,
    createMockValidator,
    generateSampleValidationScenarios
} from '../index.js';

/**
 * Example 1: Basic PR Validation
 * Demonstrates the simplest way to validate a PR
 */
export async function basicPRValidationExample() {
    console.log('=== Basic PR Validation Example ===');
    
    try {
        // Sample PR information
        const pr_info = {
            url: 'https://github.com/example/repo/pull/123',
            number: 123,
            branch_name: 'feature/user-authentication',
            head_sha: 'abc123def456',
            base_branch: 'main',
            repository: 'example/repo',
            changed_files: ['src/auth.js', 'tests/auth.test.js', 'README.md'],
            metadata: {
                lines_added: 150,
                lines_removed: 20,
                commits: 3
            }
        };

        // Sample task context
        const task_context = {
            task_id: 'TASK-001',
            title: 'Implement user authentication',
            description: 'Add secure user authentication with JWT tokens',
            requirements: [
                'JWT token implementation',
                'Password hashing with bcrypt',
                'Login and logout endpoints',
                'Input validation',
                'Error handling'
            ],
            acceptance_criteria: {
                security: 'high',
                performance: 'medium',
                test_coverage: 80
            },
            priority: 'high',
            metadata: {
                estimated_hours: 8,
                complexity: 'medium'
            }
        };

        // Validate the PR using mock implementation for demo
        const validation_result = await validatePR(pr_info, task_context, { use_mock: true });

        console.log('Validation completed!');
        console.log(`Status: ${validation_result.status}`);
        console.log(`Overall Score: ${validation_result.score.overall_score} (${validation_result.score.grade})`);
        console.log(`Feedback Items: ${validation_result.feedback.length}`);
        console.log(`Suggestions: ${validation_result.suggestions.length}`);

        // Display key feedback
        if (validation_result.feedback.length > 0) {
            console.log('\nKey Feedback:');
            validation_result.feedback.slice(0, 3).forEach((item, index) => {
                console.log(`${index + 1}. [${item.severity.toUpperCase()}] ${item.title}`);
                console.log(`   ${item.message}`);
            });
        }

        return validation_result;

    } catch (error) {
        console.error('Validation failed:', error.message);
        throw error;
    }
}

/**
 * Example 2: Advanced Validation with Custom Configuration
 * Shows how to customize validation behavior
 */
export async function advancedValidationExample() {
    console.log('\n=== Advanced Validation Example ===');
    
    try {
        // Custom validation configuration
        const config = {
            use_mock: true,
            validation_options: {
                enable_syntax_analysis: true,
                enable_style_analysis: true,
                enable_complexity_analysis: true,
                enable_security_analysis: true,
                enable_performance_analysis: false, // Disable performance analysis
                enable_maintainability_analysis: true
            },
            scoring_options: {
                criteria: {
                    code_quality: { weight: 0.4 }, // Increase code quality weight
                    functionality: { weight: 0.3 },
                    testing: { weight: 0.2 },
                    documentation: { weight: 0.1 }
                }
            },
            feedback_options: {
                max_feedback_items: 10,
                include_code_examples: true,
                include_resources: true,
                prioritize_critical: true
            }
        };

        // Create validator with custom configuration
        const validator = createValidator(config);

        // Sample data
        const pr_info = {
            url: 'https://github.com/example/repo/pull/124',
            number: 124,
            branch_name: 'feature/data-processing',
            head_sha: 'def456ghi789',
            base_branch: 'main',
            repository: 'example/repo',
            changed_files: ['src/processor.js', 'src/utils.js', 'tests/processor.test.js'],
            metadata: { lines_added: 200, lines_removed: 50 }
        };

        const task_context = {
            task_id: 'TASK-002',
            title: 'Implement data processing pipeline',
            description: 'Process and transform incoming data efficiently',
            requirements: [
                'Data validation',
                'Transformation logic',
                'Error handling',
                'Performance optimization'
            ],
            acceptance_criteria: {
                performance: 'high',
                reliability: 'high',
                scalability: 'medium'
            },
            priority: 'medium'
        };

        // Run validation
        const result = await validator.validate_pr(pr_info, task_context);

        console.log('Advanced validation completed!');
        console.log(`Custom scoring result: ${result.score.overall_score}`);
        console.log('Score breakdown:');
        console.log(`- Code Quality: ${result.score.code_quality_score}`);
        console.log(`- Functionality: ${result.score.functionality_score}`);
        console.log(`- Testing: ${result.score.testing_score}`);
        console.log(`- Documentation: ${result.score.documentation_score}`);

        return result;

    } catch (error) {
        console.error('Advanced validation failed:', error.message);
        throw error;
    }
}

/**
 * Example 3: Code Analysis Only
 * Demonstrates standalone code analysis without full PR validation
 */
export async function codeAnalysisExample() {
    console.log('\n=== Code Analysis Example ===');
    
    try {
        // Analyze code at a specific path
        const code_path = '/tmp/sample_project';
        
        const analysis_options = {
            enable_syntax_analysis: true,
            enable_style_analysis: true,
            enable_complexity_analysis: true,
            enable_security_analysis: true,
            style: {
                style_guide: 'standard',
                max_line_length: 100
            },
            complexity: {
                max_complexity: 8,
                warn_complexity: 5
            }
        };

        // Run code analysis
        const analysis_result = await analyzeCode(code_path, analysis_options);

        console.log('Code analysis completed!');
        console.log(`Files analyzed: ${analysis_result.syntax_analysis?.total_files || 0}`);
        console.log(`Lines of code: ${analysis_result.syntax_analysis?.total_lines || 0}`);
        console.log(`Style score: ${analysis_result.style_analysis?.score || 0}`);
        console.log(`Average complexity: ${analysis_result.complexity_analysis?.average_complexity || 0}`);
        console.log(`Security issues: ${analysis_result.security_analysis?.potential_issues || 0}`);

        return analysis_result;

    } catch (error) {
        console.error('Code analysis failed:', error.message);
        throw error;
    }
}

/**
 * Example 4: Score Calculation Only
 * Shows how to calculate scores from existing validation results
 */
export async function scoreCalculationExample() {
    console.log('\n=== Score Calculation Example ===');
    
    try {
        // Sample validation results (would typically come from actual analysis)
        const validation_results = {
            code_analysis: {
                style_analysis: { score: 85, issues: 3 },
                complexity_analysis: { average_complexity: 3.2, max_complexity: 7 },
                maintainability_analysis: { score: 78, documentation_coverage: 65 },
                security_analysis: { security_score: 90, potential_issues: 0 }
            },
            test_results: {
                coverage_percentage: 82,
                total_tests: 25,
                passed_tests: 24,
                failed_tests: 1
            },
            compliance_results: {
                compliance_score: 88,
                missing_requirements: [],
                exceeded_requirements: ['Error handling', 'Input validation']
            }
        };

        // Calculate scores
        const scores = await calculateScores(validation_results);

        console.log('Score calculation completed!');
        console.log(`Overall Score: ${scores.overall_score} (${scores.grade})`);
        console.log('Detailed Scores:');
        Object.entries(scores.detailed_scores).forEach(([metric, score]) => {
            console.log(`- ${metric.replace('_', ' ')}: ${score}`);
        });

        console.log('\nStrengths:');
        scores.strengths.forEach(strength => console.log(`+ ${strength}`));

        console.log('\nWeaknesses:');
        scores.weaknesses.forEach(weakness => console.log(`- ${weakness}`));

        return scores;

    } catch (error) {
        console.error('Score calculation failed:', error.message);
        throw error;
    }
}

/**
 * Example 5: Feedback Generation Only
 * Demonstrates standalone feedback generation
 */
export async function feedbackGenerationExample() {
    console.log('\n=== Feedback Generation Example ===');
    
    try {
        // Sample validation results with issues
        const validation_results = {
            code_analysis: {
                style_analysis: { score: 65, issues: 8 },
                complexity_analysis: { average_complexity: 6.5, high_complexity_functions: 3 },
                security_analysis: { potential_issues: 2, risk_score: 'medium' }
            },
            test_results: {
                coverage_percentage: 68,
                failed_tests: 2,
                total_tests: 20
            },
            compliance_results: {
                compliance_score: 75,
                missing_requirements: ['API documentation', 'Error logging']
            }
        };

        const task_context = {
            task_id: 'TASK-003',
            title: 'Fix critical issues',
            priority: 'high'
        };

        // Generate feedback
        const feedback = await generateFeedback(validation_results, task_context);

        console.log('Feedback generation completed!');
        console.log(`Generated ${feedback.length} feedback items:`);

        feedback.forEach((item, index) => {
            console.log(`\n${index + 1}. [${item.type.toUpperCase()}] ${item.title}`);
            console.log(`   Severity: ${item.severity}`);
            console.log(`   Message: ${item.message}`);
            if (item.suggestions.length > 0) {
                console.log(`   Suggestions: ${item.suggestions.slice(0, 2).join(', ')}`);
            }
        });

        return feedback;

    } catch (error) {
        console.error('Feedback generation failed:', error.message);
        throw error;
    }
}

/**
 * Example 6: Health Check
 * Shows how to verify system health
 */
export async function healthCheckExample() {
    console.log('\n=== Health Check Example ===');
    
    try {
        const health_result = await healthCheck();

        console.log('Health check completed!');
        console.log(`Overall Status: ${health_result.status}`);
        console.log(`Version: ${health_result.version}`);
        console.log(`Timestamp: ${health_result.timestamp}`);

        console.log('\nComponent Status:');
        Object.entries(health_result.components).forEach(([component, status]) => {
            console.log(`- ${component}: ${status.status}`);
        });

        return health_result;

    } catch (error) {
        console.error('Health check failed:', error.message);
        throw error;
    }
}

/**
 * Example 7: Batch Validation
 * Shows how to validate multiple PRs efficiently
 */
export async function batchValidationExample() {
    console.log('\n=== Batch Validation Example ===');
    
    try {
        // Generate sample scenarios
        const scenarios = generateSampleValidationScenarios();
        
        console.log(`Running validation on ${scenarios.length} PRs...`);

        const results = [];
        
        // Validate each PR
        for (const scenario of scenarios) {
            console.log(`\nValidating: ${scenario.name}`);
            
            try {
                const result = await validatePR(
                    scenario.pr_info, 
                    scenario.task_context, 
                    { use_mock: true }
                );
                
                results.push({
                    name: scenario.name,
                    status: result.status,
                    score: result.score.overall_score,
                    grade: result.score.grade,
                    feedback_count: result.feedback.length
                });
                
                console.log(`  Result: ${result.status} (${result.score.overall_score})`);
                
            } catch (error) {
                console.log(`  Error: ${error.message}`);
                results.push({
                    name: scenario.name,
                    status: 'error',
                    error: error.message
                });
            }
        }

        console.log('\nBatch Validation Summary:');
        results.forEach(result => {
            if (result.status === 'error') {
                console.log(`- ${result.name}: ERROR - ${result.error}`);
            } else {
                console.log(`- ${result.name}: ${result.status} (${result.score}, ${result.grade})`);
            }
        });

        return results;

    } catch (error) {
        console.error('Batch validation failed:', error.message);
        throw error;
    }
}

/**
 * Example 8: Integration with Task Management
 * Shows how to integrate with task management systems
 */
export async function taskIntegrationExample() {
    console.log('\n=== Task Integration Example ===');
    
    try {
        // Simulate task from task management system
        const task_from_system = {
            id: 'ZAM-539',
            title: 'Claude Code Validation Engine',
            description: 'Implement foundational validation system',
            status: 'in_progress',
            assignee: 'developer@example.com',
            created_at: new Date('2024-01-15'),
            updated_at: new Date(),
            labels: ['foundation', 'validation', 'high-priority'],
            requirements: [
                'Interface-first development',
                'Mock implementations',
                'Comprehensive validation',
                'Intelligent feedback'
            ],
            acceptance_criteria: {
                validation_accuracy: 90,
                response_time: 5000,
                feedback_quality: 'actionable'
            }
        };

        // Convert to validation context
        const task_context = {
            task_id: task_from_system.id,
            title: task_from_system.title,
            description: task_from_system.description,
            requirements: task_from_system.requirements,
            acceptance_criteria: task_from_system.acceptance_criteria,
            priority: task_from_system.labels.includes('high-priority') ? 'high' : 'medium',
            metadata: {
                assignee: task_from_system.assignee,
                created_at: task_from_system.created_at,
                labels: task_from_system.labels
            }
        };

        // Sample PR for this task
        const pr_info = {
            url: 'https://github.com/example/repo/pull/539',
            number: 539,
            branch_name: 'feature/validation-engine',
            head_sha: 'validation123',
            base_branch: 'main',
            repository: 'example/repo',
            changed_files: [
                'claude_code_validator/index.js',
                'validation_engine/analyzers/code_analyzer.js',
                'feedback_generator/processors/feedback_processor.js'
            ],
            metadata: {
                lines_added: 500,
                lines_removed: 50,
                commits: 8
            }
        };

        // Validate with task context
        const validation_result = await validatePR(pr_info, task_context, { use_mock: true });

        console.log('Task-integrated validation completed!');
        console.log(`Task: ${task_context.task_id} - ${task_context.title}`);
        console.log(`Validation Status: ${validation_result.status}`);
        console.log(`Score: ${validation_result.score.overall_score} (${validation_result.score.grade})`);

        // Check if acceptance criteria are met
        const meets_criteria = validation_result.score.overall_score >= 
            (task_context.acceptance_criteria.validation_accuracy || 80);
        
        console.log(`Meets Acceptance Criteria: ${meets_criteria ? 'YES' : 'NO'}`);

        // Generate task-specific recommendations
        const task_recommendations = validation_result.suggestions.filter(suggestion =>
            task_context.requirements.some(req => 
                suggestion.description.toLowerCase().includes(req.toLowerCase())
            )
        );

        if (task_recommendations.length > 0) {
            console.log('\nTask-Specific Recommendations:');
            task_recommendations.forEach(rec => {
                console.log(`- ${rec.title}: ${rec.description}`);
            });
        }

        return {
            task_context,
            validation_result,
            meets_criteria,
            task_recommendations
        };

    } catch (error) {
        console.error('Task integration example failed:', error.message);
        throw error;
    }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
    console.log('🚀 Running Claude Code Validator Examples\n');
    
    const examples = [
        { name: 'Basic PR Validation', fn: basicPRValidationExample },
        { name: 'Advanced Validation', fn: advancedValidationExample },
        { name: 'Code Analysis Only', fn: codeAnalysisExample },
        { name: 'Score Calculation', fn: scoreCalculationExample },
        { name: 'Feedback Generation', fn: feedbackGenerationExample },
        { name: 'Health Check', fn: healthCheckExample },
        { name: 'Batch Validation', fn: batchValidationExample },
        { name: 'Task Integration', fn: taskIntegrationExample }
    ];

    const results = [];

    for (const example of examples) {
        try {
            console.log(`\n${'='.repeat(50)}`);
            console.log(`Running: ${example.name}`);
            console.log(`${'='.repeat(50)}`);
            
            const start_time = Date.now();
            const result = await example.fn();
            const duration = Date.now() - start_time;
            
            results.push({
                name: example.name,
                status: 'success',
                duration,
                result
            });
            
            console.log(`✅ ${example.name} completed in ${duration}ms`);
            
        } catch (error) {
            results.push({
                name: example.name,
                status: 'error',
                error: error.message
            });
            
            console.log(`❌ ${example.name} failed: ${error.message}`);
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 EXAMPLES SUMMARY');
    console.log('='.repeat(50));
    
    results.forEach(result => {
        const status_icon = result.status === 'success' ? '✅' : '❌';
        const duration_text = result.duration ? ` (${result.duration}ms)` : '';
        console.log(`${status_icon} ${result.name}${duration_text}`);
    });

    const success_count = results.filter(r => r.status === 'success').length;
    console.log(`\n🎯 ${success_count}/${results.length} examples completed successfully`);

    return results;
}

// Export all examples for individual use
export default {
    basicPRValidationExample,
    advancedValidationExample,
    codeAnalysisExample,
    scoreCalculationExample,
    feedbackGenerationExample,
    healthCheckExample,
    batchValidationExample,
    taskIntegrationExample,
    runAllExamples
};

