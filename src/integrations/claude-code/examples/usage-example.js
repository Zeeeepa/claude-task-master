/**
 * Claude Code Integration Usage Examples
 * 
 * Demonstrates various ways to use the Claude Code integration
 * for PR validation, code analysis, and debugging assistance.
 */

import { ClaudeCodeIntegration } from '../index.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Basic PR validation example
 */
export async function basicPRValidation() {
    console.log('🔍 Basic PR Validation Example');
    console.log('================================');
    
    const integration = new ClaudeCodeIntegration({
        config: {
            outputFormat: 'json',
            maxTurns: 3,
            verbose: true
        }
    });
    
    try {
        // Initialize the integration
        const initialized = await integration.initialize();
        if (!initialized) {
            throw new Error('Failed to initialize Claude Code integration');
        }
        
        // Example PR information
        const prInfo = {
            prNumber: 123,
            sourceBranch: 'feature/user-authentication',
            targetBranch: 'main',
            title: 'Add OAuth2 user authentication',
            description: `
                This PR implements OAuth2 authentication flow including:
                - User login/logout functionality
                - JWT token management
                - Protected route middleware
                - User session handling
            `,
            author: 'developer@company.com',
            files: [
                'src/auth/oauth.js',
                'src/middleware/auth.js',
                'src/routes/user.js',
                'tests/auth.test.js'
            ]
        };
        
        // Validate the PR
        console.log(`Validating PR #${prInfo.prNumber}: ${prInfo.title}`);
        const result = await integration.validatePullRequest(prInfo, {
            feedbackTarget: 'github',
            includeFileBreakdown: true,
            timeout: 300000 // 5 minutes
        });
        
        if (result.success) {
            console.log('✅ PR validation completed successfully');
            console.log(`Recommendation: ${result.validation.recommendation.approve ? 'APPROVE' : 'REQUEST CHANGES'}`);
            console.log(`Confidence: ${(result.validation.recommendation.confidence * 100).toFixed(1)}%`);
            console.log(`Validation time: ${(result.metrics.validationTime / 1000).toFixed(2)}s`);
            
            // Save feedback to file
            if (result.feedback?.formats?.github) {
                writeFileSync('./pr-validation-feedback.md', result.feedback.formats.github.content);
                console.log('📄 Feedback saved to pr-validation-feedback.md');
            }
        } else {
            console.error('❌ PR validation failed:', result.error);
        }
        
    } catch (error) {
        console.error('Error in PR validation:', error.message);
    }
}

/**
 * Comprehensive code quality analysis example
 */
export async function comprehensiveCodeAnalysis() {
    console.log('\n📊 Comprehensive Code Analysis Example');
    console.log('======================================');
    
    const integration = new ClaudeCodeIntegration({
        codeAnalyzer: {
            analysisDepth: 'comprehensive',
            fileExtensions: ['.js', '.ts', '.jsx', '.tsx'],
            excludePatterns: ['node_modules', 'dist', 'coverage', '.git'],
            maxFileSize: 1024 * 1024, // 1MB
            batchSize: 3
        }
    });
    
    try {
        await integration.initialize();
        
        // Analyze the entire src directory
        console.log('Analyzing code quality for ./src directory...');
        const result = await integration.analyzeCodeQuality('./src', {
            analysisDepth: 'comprehensive',
            feedbackTarget: 'all',
            includeFileBreakdown: true
        });
        
        if (result.success) {
            const { analysis, feedback, metrics } = result;
            
            console.log('✅ Code analysis completed successfully');
            console.log(`Overall Score: ${(analysis.metrics.overallScore * 100).toFixed(1)}%`);
            console.log(`Grade: ${analysis.summary.grade}`);
            console.log(`Files Analyzed: ${analysis.summary.filesAnalyzed}`);
            console.log(`Total Issues: ${analysis.metrics.issueCount}`);
            console.log(`Analysis Time: ${(metrics.analysisTime / 1000).toFixed(2)}s`);
            
            // Display top recommendations
            if (analysis.recommendations?.priority?.length > 0) {
                console.log('\n🎯 Priority Recommendations:');
                analysis.recommendations.priority.slice(0, 3).forEach((rec, index) => {
                    console.log(`${index + 1}. ${rec}`);
                });
            }
            
            // Save detailed report
            if (feedback?.formats?.github) {
                writeFileSync('./code-analysis-report.md', feedback.formats.github.content);
                console.log('📄 Detailed report saved to code-analysis-report.md');
            }
            
            // Export results in multiple formats
            await integration.codeAnalyzer.exportResults(analysis, 'json', './code-analysis-results.json');
            await integration.codeAnalyzer.exportResults(analysis, 'html', './code-analysis-report.html');
            console.log('📊 Results exported in multiple formats');
            
        } else {
            console.error('❌ Code analysis failed:', result.error);
        }
        
    } catch (error) {
        console.error('Error in code analysis:', error.message);
    }
}

/**
 * Security scanning example
 */
export async function securityScanExample() {
    console.log('\n🔒 Security Scanning Example');
    console.log('============================');
    
    const integration = new ClaudeCodeIntegration();
    
    try {
        await integration.initialize();
        
        console.log('Performing security scan...');
        const result = await integration.performSecurityScan('./src', {
            feedbackTarget: 'slack',
            timeout: 180000 // 3 minutes
        });
        
        if (result.success) {
            console.log('✅ Security scan completed');
            
            // Parse security findings from the response
            const scanData = result.scan.data?.lastResponse || result.scan.data;
            console.log('Security Analysis:', scanData.substring(0, 200) + '...');
            
            // Display Slack notification format
            if (result.feedback?.formats?.slack) {
                console.log('\n📱 Slack Notification:');
                console.log('Title:', result.feedback.formats.slack.title);
                console.log('Color:', result.feedback.formats.slack.color);
                console.log('Blocks:', result.feedback.formats.slack.blocks.length);
            }
            
        } else {
            console.error('❌ Security scan failed:', result.error);
        }
        
    } catch (error) {
        console.error('Error in security scan:', error.message);
    }
}

/**
 * Debug assistance example
 */
export async function debugAssistanceExample() {
    console.log('\n🐛 Debug Assistance Example');
    console.log('===========================');
    
    const integration = new ClaudeCodeIntegration();
    
    try {
        await integration.initialize();
        
        // Simulate a build error log
        const errorLog = `
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
npm ERR! 
npm ERR! While resolving: claude-task-master@0.15.0
npm ERR! Found: react@18.2.0
npm ERR! node_modules/react
npm ERR!   react@"^18.2.0" from the root project
npm ERR! 
npm ERR! Could not resolve dependency:
npm ERR! peer react@"^17.0.0" from some-package@1.0.0
npm ERR! node_modules/some-package
npm ERR!   some-package@"^1.0.0" from the root project
npm ERR! 
npm ERR! Fix the upstream dependency conflict, or retry
npm ERR! this command with --force, or --legacy-peer-deps
npm ERR! to accept an incorrect (and potentially broken) dependency resolution.
        `;
        
        console.log('Analyzing build failure...');
        const result = await integration.debugBuildFailure(errorLog, {
            feedbackTarget: 'linear'
        });
        
        if (result.success) {
            console.log('✅ Debug analysis completed');
            
            const debugSuggestions = result.debug.data?.lastResponse || result.debug.data;
            console.log('Debug Suggestions:', debugSuggestions.substring(0, 300) + '...');
            
            // Display Linear format feedback
            if (result.feedback?.formats?.linear) {
                console.log('\n📋 Linear Issue Update:');
                console.log('Title:', result.feedback.formats.linear.title);
                console.log('Priority:', result.feedback.formats.linear.priority);
                console.log('Content:', result.feedback.formats.linear.content.substring(0, 200) + '...');
            }
            
        } else {
            console.error('❌ Debug analysis failed:', result.error);
        }
        
    } catch (error) {
        console.error('Error in debug assistance:', error.message);
    }
}

/**
 * Performance analysis example
 */
export async function performanceAnalysisExample() {
    console.log('\n⚡ Performance Analysis Example');
    console.log('===============================');
    
    const integration = new ClaudeCodeIntegration();
    
    try {
        await integration.initialize();
        
        console.log('Analyzing performance characteristics...');
        const result = await integration.analyzePerformance('./src/api', {
            feedbackTarget: 'email'
        });
        
        if (result.success) {
            console.log('✅ Performance analysis completed');
            
            const perfData = result.analysis.data?.lastResponse || result.analysis.data;
            console.log('Performance Analysis:', perfData.substring(0, 200) + '...');
            
            // Display email format feedback
            if (result.feedback?.formats?.email) {
                console.log('\n📧 Email Report:');
                console.log('Subject:', result.feedback.formats.email.subject);
                console.log('HTML Length:', result.feedback.formats.email.html.length);
                console.log('Text Length:', result.feedback.formats.email.text.length);
                
                // Save email report
                writeFileSync('./performance-report.html', result.feedback.formats.email.html);
                console.log('📄 Email report saved to performance-report.html');
            }
            
        } else {
            console.error('❌ Performance analysis failed:', result.error);
        }
        
    } catch (error) {
        console.error('Error in performance analysis:', error.message);
    }
}

/**
 * Multi-format feedback example
 */
export async function multiFormatFeedbackExample() {
    console.log('\n📢 Multi-Format Feedback Example');
    console.log('=================================');
    
    const integration = new ClaudeCodeIntegration();
    
    try {
        await integration.initialize();
        
        // Quick code analysis with all feedback formats
        const result = await integration.analyzeCodeQuality('./src/utils', {
            analysisDepth: 'quick',
            feedbackTarget: 'all'
        });
        
        if (result.success) {
            console.log('✅ Analysis completed with multi-format feedback');
            
            const formats = result.feedback?.formats || {};
            
            // Display available formats
            console.log('\n📋 Available Feedback Formats:');
            Object.keys(formats).forEach(format => {
                console.log(`- ${format.toUpperCase()}: ✅`);
            });
            
            // Save each format to a file
            if (formats.github) {
                writeFileSync('./feedback-github.md', formats.github.content);
                console.log('📄 GitHub feedback saved to feedback-github.md');
            }
            
            if (formats.linear) {
                writeFileSync('./feedback-linear.md', formats.linear.content);
                console.log('📄 Linear feedback saved to feedback-linear.md');
            }
            
            if (formats.slack) {
                writeFileSync('./feedback-slack.json', JSON.stringify(formats.slack, null, 2));
                console.log('📄 Slack feedback saved to feedback-slack.json');
            }
            
            if (formats.email) {
                writeFileSync('./feedback-email.html', formats.email.html);
                console.log('📄 Email feedback saved to feedback-email.html');
            }
            
        } else {
            console.error('❌ Multi-format feedback failed:', result.error);
        }
        
    } catch (error) {
        console.error('Error in multi-format feedback:', error.message);
    }
}

/**
 * Metrics and monitoring example
 */
export async function metricsMonitoringExample() {
    console.log('\n📈 Metrics and Monitoring Example');
    console.log('==================================');
    
    const integration = new ClaudeCodeIntegration();
    
    try {
        await integration.initialize();
        
        // Perform several operations to generate metrics
        console.log('Performing operations to generate metrics...');
        
        // Quick analysis
        await integration.analyzeCodeQuality('./src/constants', {
            analysisDepth: 'quick'
        });
        
        // Security scan
        await integration.performSecurityScan('./src/utils');
        
        // Get current status and metrics
        const status = integration.getStatus();
        
        console.log('\n📊 Integration Status:');
        console.log('Initialized:', status.isInitialized);
        console.log('Client Authenticated:', status.clientStatus.isAuthenticated);
        
        console.log('\n📈 Performance Metrics:');
        console.log('Validations Performed:', status.metrics.validationsPerformed);
        console.log('Analyses Completed:', status.metrics.analysesCompleted);
        console.log('Feedback Generated:', status.metrics.feedbackGenerated);
        console.log('Average Validation Time:', status.metrics.averageValidationTime + 'ms');
        console.log('Success Rate:', (status.metrics.successRate * 100).toFixed(1) + '%');
        
        console.log('\n⚙️ Configuration:');
        console.log('Output Format:', status.config.outputFormat);
        console.log('Max Turns:', status.config.maxTurns);
        console.log('Verbose Mode:', status.config.verbose);
        
    } catch (error) {
        console.error('Error in metrics monitoring:', error.message);
    }
}

/**
 * Custom feedback template example
 */
export async function customFeedbackTemplateExample() {
    console.log('\n🎨 Custom Feedback Template Example');
    console.log('===================================');
    
    const integration = new ClaudeCodeIntegration();
    
    try {
        await integration.initialize();
        
        // Custom template for internal reporting
        const customTemplate = `
# Internal Code Review Report

**Project**: {{TITLE}}
**Status**: {{STATUS}}
**Overall Score**: {{SCORE}}%
**Grade**: {{GRADE}}

## Executive Summary
- Files Analyzed: {{FILES_ANALYZED}}
- Issues Found: {{TOTAL_ISSUES}}
- Recommendations: {{TOTAL_RECOMMENDATIONS}}

## Critical Issues
{{CRITICAL_ISSUES}}

## High Priority Actions
{{HIGH_PRIORITY_RECOMMENDATIONS}}

## Next Steps
1. Address critical issues immediately
2. Implement high priority recommendations
3. Schedule follow-up review in 1 week

---
Report generated on {{TIMESTAMP}}
Internal use only - Do not distribute
        `;
        
        // Perform analysis with custom template
        const result = await integration.analyzeCodeQuality('./src/ai-providers', {
            analysisDepth: 'standard',
            feedback: {
                customTemplate
            }
        });
        
        if (result.success) {
            console.log('✅ Analysis completed with custom template');
            
            // Process with custom template
            const customFeedback = await integration.feedbackProcessor.generateCustomFeedback(
                integration.feedbackProcessor.preprocessAnalysisData(result.analysis),
                customTemplate
            );
            
            console.log('\n📄 Custom Report Preview:');
            console.log(customFeedback.content.substring(0, 300) + '...');
            
            // Save custom report
            writeFileSync('./custom-internal-report.md', customFeedback.content);
            console.log('📄 Custom report saved to custom-internal-report.md');
            
        } else {
            console.error('❌ Custom feedback generation failed:', result.error);
        }
        
    } catch (error) {
        console.error('Error in custom feedback template:', error.message);
    }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
    console.log('🚀 Claude Code Integration Examples');
    console.log('===================================\n');
    
    try {
        await basicPRValidation();
        await comprehensiveCodeAnalysis();
        await securityScanExample();
        await debugAssistanceExample();
        await performanceAnalysisExample();
        await multiFormatFeedbackExample();
        await metricsMonitoringExample();
        await customFeedbackTemplateExample();
        
        console.log('\n✅ All examples completed successfully!');
        console.log('📁 Check the generated files for detailed outputs.');
        
    } catch (error) {
        console.error('\n❌ Error running examples:', error.message);
    }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples().catch(console.error);
}

