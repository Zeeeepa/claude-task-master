/**
 * Claude Code Integration Usage Examples
 * Demonstrates how to use the Claude Code integration for PR validation
 */

import { ClaudeCodeIntegrator } from '../integrations/claude_code_integrator.js';
import { PRValidationWorkflow } from '../workflows/pr_validation_workflow.js';
import { CodeReviewWorkflow } from '../workflows/code_review_workflow.js';
import { log } from '../utils/simple_logger.js';

/**
 * Basic Claude Code Integration Example
 */
export async function basicClaudeCodeExample() {
  console.log('\n🚀 Basic Claude Code Integration Example\n');
  
  try {
    // Initialize Claude Code integrator
    const integrator = new ClaudeCodeIntegrator({
      claudeCodePath: 'claude-code',
      wsl2Enabled: false, // Use local environment for this example
      validationTimeout: 120000, // 2 minutes
      enableDebugging: true,
      enableCodeAnalysis: true
    });

    await integrator.initialize();
    console.log('✅ Claude Code integrator initialized');

    // Example PR details
    const prDetails = {
      prNumber: 42,
      repository: 'https://github.com/example/project.git',
      headBranch: 'feature/new-validation',
      title: 'Add new validation logic',
      description: 'This PR adds comprehensive validation logic for user inputs',
      author: 'developer@example.com',
      modifiedFiles: [
        'src/validators/input-validator.js',
        'src/utils/validation-helpers.js',
        'tests/validators/input-validator.test.js'
      ]
    };

    // Validate the PR
    console.log(`🔍 Validating PR #${prDetails.prNumber}...`);
    const validationResult = await integrator.validatePR(prDetails);

    // Display results
    console.log('\n📋 Validation Results:');
    console.log(`Status: ${validationResult.summary?.status || 'unknown'}`);
    console.log(`Issues Found: ${validationResult.validation?.issues?.length || 0}`);
    console.log(`Suggestions: ${validationResult.validation?.suggestions?.length || 0}`);
    
    if (validationResult.analysis?.summary) {
      console.log(`Overall Score: ${validationResult.analysis.summary.overallScore}/100`);
    }

    // Show validation statistics
    const stats = integrator.getValidationStats();
    console.log('\n📊 Validation Statistics:');
    console.log(`Total Validations: ${stats.total}`);
    console.log(`Success Rate: ${stats.successRate.toFixed(1)}%`);
    console.log(`Average Duration: ${stats.averageDuration}ms`);

    await integrator.shutdown();
    console.log('✅ Example completed successfully');

  } catch (error) {
    console.error('❌ Example failed:', error.message);
  }
}

/**
 * PR Validation Workflow Example
 */
export async function prValidationWorkflowExample() {
  console.log('\n🔄 PR Validation Workflow Example\n');
  
  try {
    // Initialize workflow
    const workflow = new PRValidationWorkflow({
      enableParallelValidation: true,
      maxRetries: 2,
      timeoutMs: 300000 // 5 minutes
    });

    await workflow.initialize();
    console.log('✅ PR validation workflow initialized');

    // Example PR with multiple files
    const prDetails = {
      prNumber: 123,
      repository: 'https://github.com/example/large-project.git',
      headBranch: 'feature/refactor-auth',
      title: 'Refactor authentication system',
      description: 'Major refactoring of the authentication system for better security and maintainability',
      author: 'senior-dev@example.com',
      modifiedFiles: [
        'src/auth/authenticator.js',
        'src/auth/token-manager.js',
        'src/auth/session-handler.js',
        'src/middleware/auth-middleware.js',
        'src/utils/crypto-utils.js',
        'tests/auth/authenticator.test.js',
        'tests/auth/token-manager.test.js',
        'tests/middleware/auth-middleware.test.js'
      ],
      state: 'open'
    };

    // Run complete validation workflow
    console.log(`🔍 Running validation workflow for PR #${prDetails.prNumber}...`);
    const workflowResult = await workflow.validatePR(prDetails, {
      includeAnalysis: true,
      includeDebugging: false
    });

    // Display workflow results
    console.log('\n📋 Workflow Results:');
    console.log(`Workflow ID: ${workflowResult.workflowId}`);
    console.log(`Status: ${workflowResult.workflow.status}`);
    console.log(`Steps Completed: ${workflowResult.workflow.steps.length}`);
    
    // Show step details
    console.log('\n📝 Workflow Steps:');
    workflowResult.workflow.steps.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step.name}: ${step.status} (${step.duration || 0}ms)`);
    });

    // Show validation summary
    if (workflowResult.summary) {
      console.log('\n📊 Summary:');
      console.log(`Validation Passed: ${workflowResult.summary.validationPassed}`);
      console.log(`Issues Found: ${workflowResult.summary.issuesFound}`);
      console.log(`Suggestions Generated: ${workflowResult.summary.suggestionsGenerated}`);
    }

    // Show recommendations
    if (workflowResult.postProcessing?.recommendations?.length > 0) {
      console.log('\n💡 Recommendations:');
      workflowResult.postProcessing.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
        console.log(`     ${rec.description}`);
      });
    }

    await workflow.shutdown();
    console.log('✅ Workflow example completed successfully');

  } catch (error) {
    console.error('❌ Workflow example failed:', error.message);
  }
}

/**
 * Code Review Workflow Example
 */
export async function codeReviewWorkflowExample() {
  console.log('\n👁️ Code Review Workflow Example\n');
  
  try {
    // Initialize code review workflow
    const reviewWorkflow = new CodeReviewWorkflow({
      reviewDepth: 'thorough',
      focusAreas: ['security', 'performance', 'maintainability', 'testing'],
      generateSuggestions: true,
      includeExamples: true
    });

    await reviewWorkflow.initialize();
    console.log('✅ Code review workflow initialized');

    // Example PR for review
    const prDetails = {
      prNumber: 456,
      repository: 'https://github.com/example/api-service.git',
      headBranch: 'feature/optimize-queries',
      title: 'Optimize database queries for better performance',
      description: 'This PR optimizes several database queries and adds caching to improve API response times',
      author: 'performance-team@example.com',
      modifiedFiles: [
        'src/services/user-service.js',
        'src/services/order-service.js',
        'src/database/query-builder.js',
        'src/cache/redis-cache.js',
        'src/middleware/cache-middleware.js'
      ],
      additions: 245,
      deletions: 89
    };

    // Perform code review
    console.log(`👁️ Reviewing PR #${prDetails.prNumber}...`);
    const reviewResult = await reviewWorkflow.reviewPR(prDetails, {
      reviewDepth: 'thorough',
      focusAreas: ['performance', 'security']
    });

    // Display review results
    console.log('\n📋 Code Review Results:');
    console.log(`Review ID: ${reviewResult.reviewId}`);
    console.log(`Overall Rating: ${reviewResult.feedback.overallRating}`);
    console.log(`Approval Status: ${reviewResult.feedback.approvalStatus}`);
    console.log(`Files Reviewed: ${reviewResult.summary.filesReviewed}`);

    // Show structure analysis
    console.log('\n📊 Structure Analysis:');
    console.log(`File Count: ${reviewResult.structure.fileCount}`);
    console.log(`Change Complexity: ${reviewResult.structure.changeComplexity}`);
    console.log(`Risk Level: ${reviewResult.structure.riskLevel}`);
    console.log(`Estimated Review Time: ${reviewResult.structure.estimatedReviewTime} minutes`);

    // Show focus area results
    console.log('\n🎯 Focus Area Results:');
    Object.entries(reviewResult.codeReview.focusAreaResults).forEach(([area, result]) => {
      console.log(`  ${area}: Score ${result.score}/100 - ${result.summary}`);
    });

    // Show feedback summary
    console.log('\n💬 Review Feedback:');
    console.log(`Summary: ${reviewResult.feedback.summary}`);
    
    if (reviewResult.feedback.positiveAspects.length > 0) {
      console.log('\n✅ Positive Aspects:');
      reviewResult.feedback.positiveAspects.forEach((aspect, index) => {
        console.log(`  ${index + 1}. ${aspect}`);
      });
    }

    if (reviewResult.feedback.actionItems.length > 0) {
      console.log('\n📝 Action Items:');
      reviewResult.feedback.actionItems.forEach((item, index) => {
        console.log(`  ${index + 1}. [${item.priority.toUpperCase()}] ${item.title}`);
        console.log(`     ${item.description}`);
        console.log(`     Estimated time: ${item.estimatedTime} minutes`);
      });
    }

    await reviewWorkflow.shutdown();
    console.log('✅ Code review example completed successfully');

  } catch (error) {
    console.error('❌ Code review example failed:', error.message);
  }
}

/**
 * Advanced Integration Example with Multiple Workflows
 */
export async function advancedIntegrationExample() {
  console.log('\n🚀 Advanced Integration Example\n');
  
  try {
    // Initialize multiple workflows
    const validationWorkflow = new PRValidationWorkflow({
      maxRetries: 1,
      timeoutMs: 180000
    });
    
    const reviewWorkflow = new CodeReviewWorkflow({
      reviewDepth: 'standard',
      focusAreas: ['security', 'maintainability']
    });

    await Promise.all([
      validationWorkflow.initialize(),
      reviewWorkflow.initialize()
    ]);
    
    console.log('✅ Multiple workflows initialized');

    // Example PR for comprehensive analysis
    const prDetails = {
      prNumber: 789,
      repository: 'https://github.com/example/critical-service.git',
      headBranch: 'hotfix/security-patch',
      title: 'Security patch for authentication vulnerability',
      description: 'Critical security patch to fix authentication bypass vulnerability',
      author: 'security-team@example.com',
      modifiedFiles: [
        'src/auth/jwt-validator.js',
        'src/middleware/security-middleware.js',
        'tests/auth/jwt-validator.test.js'
      ],
      state: 'open'
    };

    console.log(`🔍 Running comprehensive analysis for PR #${prDetails.prNumber}...`);

    // Run validation and review in parallel
    const [validationResult, reviewResult] = await Promise.all([
      validationWorkflow.validatePR(prDetails),
      reviewWorkflow.reviewPR(prDetails)
    ]);

    // Combine and analyze results
    console.log('\n📋 Comprehensive Analysis Results:');
    
    // Validation results
    console.log('\n🔍 Validation Results:');
    console.log(`  Status: ${validationResult.summary?.status || 'unknown'}`);
    console.log(`  Issues: ${validationResult.validation?.issues?.length || 0}`);
    console.log(`  Score: ${validationResult.analysis?.summary?.overallScore || 'N/A'}/100`);

    // Review results
    console.log('\n👁️ Review Results:');
    console.log(`  Rating: ${reviewResult.feedback.overallRating}`);
    console.log(`  Approval: ${reviewResult.feedback.approvalStatus}`);
    console.log(`  Action Items: ${reviewResult.feedback.actionItems.length}`);

    // Combined recommendations
    const allRecommendations = [
      ...(validationResult.postProcessing?.recommendations || []),
      ...(reviewResult.feedback.actionItems || [])
    ];

    if (allRecommendations.length > 0) {
      console.log('\n💡 Combined Recommendations:');
      allRecommendations
        .sort((a, b) => {
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        })
        .forEach((rec, index) => {
          console.log(`  ${index + 1}. [${rec.priority?.toUpperCase() || 'MEDIUM'}] ${rec.title || rec.description}`);
        });
    }

    // Final assessment
    const criticalIssues = (validationResult.validation?.issues || [])
      .filter(issue => issue.severity === 'error').length;
    
    const securityIssues = allRecommendations
      .filter(rec => rec.type === 'security' || rec.title?.toLowerCase().includes('security')).length;

    console.log('\n🎯 Final Assessment:');
    if (criticalIssues > 0 || securityIssues > 0) {
      console.log('❌ PR requires immediate attention before merging');
      console.log(`   Critical issues: ${criticalIssues}`);
      console.log(`   Security concerns: ${securityIssues}`);
    } else if (reviewResult.feedback.approvalStatus === 'approve') {
      console.log('✅ PR is ready for merge');
    } else {
      console.log('⚠️ PR needs minor improvements before merge');
    }

    // Cleanup
    await Promise.all([
      validationWorkflow.shutdown(),
      reviewWorkflow.shutdown()
    ]);

    console.log('✅ Advanced integration example completed successfully');

  } catch (error) {
    console.error('❌ Advanced integration example failed:', error.message);
  }
}

/**
 * Error Handling and Recovery Example
 */
export async function errorHandlingExample() {
  console.log('\n🛡️ Error Handling and Recovery Example\n');
  
  try {
    // Initialize with intentionally problematic config
    const integrator = new ClaudeCodeIntegrator({
      claudeCodePath: 'non-existent-claude-code', // This will fail
      validationTimeout: 5000, // Very short timeout
      maxConcurrentValidations: 1
    });

    console.log('🔧 Attempting to initialize with problematic config...');
    
    try {
      await integrator.initialize();
      console.log('✅ Initialization succeeded unexpectedly');
    } catch (initError) {
      console.log(`❌ Expected initialization failure: ${initError.message}`);
      
      // Demonstrate recovery with correct config
      console.log('🔄 Attempting recovery with correct config...');
      
      const recoveredIntegrator = new ClaudeCodeIntegrator({
        claudeCodePath: 'claude-code',
        wsl2Enabled: false,
        validationTimeout: 60000
      });

      // Mock the Claude Code availability check for demo
      recoveredIntegrator.claudeCodeClient.checkAvailability = async () => {
        console.log('✅ Claude Code CLI check passed (mocked)');
        return true;
      };

      await recoveredIntegrator.initialize();
      console.log('✅ Recovery successful');

      // Demonstrate graceful shutdown
      await recoveredIntegrator.shutdown();
      console.log('✅ Graceful shutdown completed');
    }

    console.log('✅ Error handling example completed successfully');

  } catch (error) {
    console.error('❌ Error handling example failed:', error.message);
  }
}

/**
 * Run all examples
 */
export async function runAllClaudeCodeExamples() {
  console.log('🎯 Claude Code Integration Examples\n');
  console.log('=====================================');

  const examples = [
    { name: 'Basic Claude Code Integration', fn: basicClaudeCodeExample },
    { name: 'PR Validation Workflow', fn: prValidationWorkflowExample },
    { name: 'Code Review Workflow', fn: codeReviewWorkflowExample },
    { name: 'Advanced Integration', fn: advancedIntegrationExample },
    { name: 'Error Handling and Recovery', fn: errorHandlingExample }
  ];

  for (const example of examples) {
    try {
      console.log(`\n🏃 Running: ${example.name}`);
      console.log('─'.repeat(50));
      await example.fn();
      console.log(`✅ Completed: ${example.name}`);
    } catch (error) {
      console.error(`❌ Failed: ${example.name} - ${error.message}`);
    }
    
    // Add delay between examples
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n🎉 All Claude Code integration examples completed!');
}

// Export for use in package.json scripts
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllClaudeCodeExamples().catch(console.error);
}

