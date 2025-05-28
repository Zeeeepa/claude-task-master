/**
 * Pull Request Validator
 * 
 * Automated PR validation using Claude Code for comprehensive
 * code review, quality assessment, and approval recommendations.
 */

import ClaudeCodeClient from './claude-code-client.js';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export class PRValidator {
    constructor(options = {}) {
        this.client = new ClaudeCodeClient(options);
        this.qualityGates = options.qualityGates || this.client.config.getQualityGates();
        this.reportFormat = options.reportFormat || 'markdown';
        this.autoApprove = options.autoApprove || false;
    }

    /**
     * Initialize the PR validator
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        return await this.client.initialize();
    }

    /**
     * Validate a pull request comprehensively
     * @param {Object} prInfo - Pull request information
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation result
     */
    async validatePR(prInfo, options = {}) {
        const {
            prNumber,
            sourceBranch,
            targetBranch = 'main',
            title,
            description,
            author,
            files = []
        } = prInfo;

        const validationStart = Date.now();
        
        try {
            console.log(`Starting PR validation for #${prNumber}: ${title}`);
            
            // Step 1: Get PR diff and changes
            const changes = await this.getPRChanges(sourceBranch, targetBranch);
            
            // Step 2: Perform comprehensive analysis
            const analysisResults = await this.performComprehensiveAnalysis(changes, prInfo);
            
            // Step 3: Apply quality gates
            const qualityGateResults = await this.applyQualityGates(analysisResults);
            
            // Step 4: Generate validation report
            const report = await this.generateValidationReport({
                prInfo,
                changes,
                analysisResults,
                qualityGateResults,
                validationTime: Date.now() - validationStart
            });
            
            // Step 5: Make approval recommendation
            const recommendation = this.makeApprovalRecommendation(qualityGateResults);
            
            return {
                success: true,
                prNumber,
                recommendation,
                report,
                qualityGates: qualityGateResults,
                analysis: analysisResults,
                validationTime: Date.now() - validationStart
            };
            
        } catch (error) {
            console.error(`PR validation failed for #${prNumber}:`, error.message);
            return {
                success: false,
                prNumber,
                error: error.message,
                validationTime: Date.now() - validationStart
            };
        }
    }

    /**
     * Get PR changes and diff information
     * @param {string} sourceBranch - Source branch
     * @param {string} targetBranch - Target branch
     * @returns {Promise<Object>} PR changes information
     */
    async getPRChanges(sourceBranch, targetBranch) {
        try {
            // Get git diff
            const diffResult = await this.executeGitCommand([
                'diff',
                `${targetBranch}...${sourceBranch}`,
                '--name-status'
            ]);

            // Get detailed diff
            const detailedDiff = await this.executeGitCommand([
                'diff',
                `${targetBranch}...${sourceBranch}`
            ]);

            // Get commit messages
            const commits = await this.executeGitCommand([
                'log',
                `${targetBranch}..${sourceBranch}`,
                '--oneline'
            ]);

            // Parse changed files
            const changedFiles = this.parseChangedFiles(diffResult.output);
            
            return {
                diff: detailedDiff.output,
                changedFiles,
                commits: commits.output.split('\n').filter(line => line.trim()),
                stats: await this.getChangeStats(sourceBranch, targetBranch)
            };
        } catch (error) {
            throw new Error(`Failed to get PR changes: ${error.message}`);
        }
    }

    /**
     * Perform comprehensive analysis of PR changes
     * @param {Object} changes - PR changes information
     * @param {Object} prInfo - PR information
     * @returns {Promise<Object>} Analysis results
     */
    async performComprehensiveAnalysis(changes, prInfo) {
        const analyses = {};

        try {
            // Code Quality Analysis
            console.log('Performing code quality analysis...');
            analyses.codeQuality = await this.analyzeCodeQuality(changes);

            // Security Analysis
            console.log('Performing security analysis...');
            analyses.security = await this.analyzeSecurity(changes);

            // Performance Analysis
            console.log('Performing performance analysis...');
            analyses.performance = await this.analyzePerformance(changes);

            // Test Coverage Analysis
            console.log('Analyzing test coverage...');
            analyses.testCoverage = await this.analyzeTestCoverage(changes);

            // Documentation Analysis
            console.log('Analyzing documentation...');
            analyses.documentation = await this.analyzeDocumentation(changes, prInfo);

            // Breaking Changes Detection
            console.log('Detecting breaking changes...');
            analyses.breakingChanges = await this.detectBreakingChanges(changes);

            return analyses;
        } catch (error) {
            throw new Error(`Analysis failed: ${error.message}`);
        }
    }

    /**
     * Analyze code quality using Claude Code
     * @param {Object} changes - PR changes
     * @returns {Promise<Object>} Code quality analysis
     */
    async analyzeCodeQuality(changes) {
        const query = `Analyze the code quality of these changes:

${changes.diff}

Evaluate:
1. Code complexity and maintainability
2. Adherence to coding standards
3. Code duplication
4. Error handling
5. Code organization and structure
6. Variable and function naming
7. Comments and documentation

Provide scores (0-1) and specific recommendations.`;

        const result = await this.client.query(query, {
            systemPrompt: 'You are a senior code reviewer. Provide detailed quality assessment with actionable feedback.'
        });

        return this.parseAnalysisResult(result, 'codeQuality');
    }

    /**
     * Analyze security vulnerabilities
     * @param {Object} changes - PR changes
     * @returns {Promise<Object>} Security analysis
     */
    async analyzeSecurity(changes) {
        const query = `Perform a security analysis of these code changes:

${changes.diff}

Check for:
1. SQL injection vulnerabilities
2. XSS vulnerabilities
3. Authentication/authorization issues
4. Data exposure risks
5. Input validation problems
6. Cryptographic issues
7. Dependency vulnerabilities

Rate severity (critical, high, medium, low) and provide remediation steps.`;

        const result = await this.client.query(query, {
            systemPrompt: 'You are a security expert. Focus on identifying vulnerabilities and providing clear remediation steps.'
        });

        return this.parseAnalysisResult(result, 'security');
    }

    /**
     * Analyze performance impact
     * @param {Object} changes - PR changes
     * @returns {Promise<Object>} Performance analysis
     */
    async analyzePerformance(changes) {
        const query = `Analyze the performance impact of these changes:

${changes.diff}

Evaluate:
1. Algorithm efficiency
2. Memory usage patterns
3. Database query optimization
4. Network request efficiency
5. Caching strategies
6. Resource utilization
7. Scalability implications

Provide performance scores and optimization recommendations.`;

        const result = await this.client.query(query, {
            systemPrompt: 'You are a performance optimization expert. Focus on measurable improvements.'
        });

        return this.parseAnalysisResult(result, 'performance');
    }

    /**
     * Analyze test coverage
     * @param {Object} changes - PR changes
     * @returns {Promise<Object>} Test coverage analysis
     */
    async analyzeTestCoverage(changes) {
        const testFiles = changes.changedFiles.filter(file => 
            file.path.includes('test') || 
            file.path.includes('spec') || 
            file.path.endsWith('.test.js') ||
            file.path.endsWith('.spec.js')
        );

        const query = `Analyze test coverage for these changes:

Changed Files: ${changes.changedFiles.map(f => f.path).join(', ')}
Test Files: ${testFiles.map(f => f.path).join(', ')}

Diff:
${changes.diff}

Evaluate:
1. Test coverage completeness
2. Test quality and effectiveness
3. Edge case coverage
4. Integration test needs
5. Missing test scenarios
6. Test maintainability

Provide coverage score and recommendations for additional tests.`;

        const result = await this.client.query(query, {
            systemPrompt: 'You are a testing expert. Focus on comprehensive test coverage and quality.'
        });

        return this.parseAnalysisResult(result, 'testCoverage');
    }

    /**
     * Analyze documentation completeness
     * @param {Object} changes - PR changes
     * @param {Object} prInfo - PR information
     * @returns {Promise<Object>} Documentation analysis
     */
    async analyzeDocumentation(changes, prInfo) {
        const query = `Analyze documentation for this PR:

Title: ${prInfo.title}
Description: ${prInfo.description}

Changes:
${changes.diff}

Evaluate:
1. PR description completeness
2. Code comments adequacy
3. API documentation updates
4. README updates if needed
5. Changelog entries
6. Breaking change documentation

Provide documentation score and specific improvement suggestions.`;

        const result = await this.client.query(query, {
            systemPrompt: 'You are a documentation expert. Focus on clarity and completeness.'
        });

        return this.parseAnalysisResult(result, 'documentation');
    }

    /**
     * Detect breaking changes
     * @param {Object} changes - PR changes
     * @returns {Promise<Object>} Breaking changes analysis
     */
    async detectBreakingChanges(changes) {
        const query = `Analyze these changes for breaking changes:

${changes.diff}

Identify:
1. API signature changes
2. Removed public methods/properties
3. Changed return types
4. Modified interfaces
5. Database schema changes
6. Configuration changes
7. Dependency updates with breaking changes

Classify severity and provide migration guidance.`;

        const result = await this.client.query(query, {
            systemPrompt: 'You are an API compatibility expert. Focus on identifying breaking changes and migration paths.'
        });

        return this.parseAnalysisResult(result, 'breakingChanges');
    }

    /**
     * Apply quality gates to analysis results
     * @param {Object} analysisResults - Analysis results
     * @returns {Promise<Object>} Quality gate results
     */
    async applyQualityGates(analysisResults) {
        const gates = this.qualityGates;
        const results = {
            passed: true,
            gates: {},
            overallScore: 0
        };

        // Code Quality Gate
        const codeQualityScore = analysisResults.codeQuality?.score || 0;
        results.gates.codeQuality = {
            passed: codeQualityScore >= gates.codeQuality.minScore,
            score: codeQualityScore,
            threshold: gates.codeQuality.minScore,
            issues: analysisResults.codeQuality?.issues || []
        };

        // Security Gate
        const securityVulns = analysisResults.security?.vulnerabilities || [];
        const criticalVulns = securityVulns.filter(v => v.severity === 'critical').length;
        results.gates.security = {
            passed: criticalVulns <= gates.security.maxVulnerabilities,
            vulnerabilities: securityVulns.length,
            critical: criticalVulns,
            threshold: gates.security.maxVulnerabilities,
            issues: securityVulns
        };

        // Performance Gate
        const performanceScore = analysisResults.performance?.score || 0;
        results.gates.performance = {
            passed: performanceScore >= gates.performance.minCoverage,
            score: performanceScore,
            threshold: gates.performance.minCoverage,
            issues: analysisResults.performance?.issues || []
        };

        // Test Coverage Gate
        const coverageScore = analysisResults.testCoverage?.score || 0;
        results.gates.testCoverage = {
            passed: coverageScore >= gates.performance.minCoverage,
            score: coverageScore,
            threshold: gates.performance.minCoverage,
            issues: analysisResults.testCoverage?.issues || []
        };

        // Calculate overall pass/fail
        results.passed = Object.values(results.gates).every(gate => gate.passed);
        
        // Calculate overall score
        const scores = Object.values(results.gates)
            .map(gate => gate.score || 0)
            .filter(score => score > 0);
        results.overallScore = scores.length > 0 ? 
            scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;

        return results;
    }

    /**
     * Generate validation report
     * @param {Object} data - Validation data
     * @returns {Promise<string>} Formatted report
     */
    async generateValidationReport(data) {
        const { prInfo, qualityGateResults, analysisResults, validationTime } = data;
        
        if (this.reportFormat === 'markdown') {
            return this.generateMarkdownReport(data);
        } else if (this.reportFormat === 'json') {
            return JSON.stringify(data, null, 2);
        }
        
        return this.generateTextReport(data);
    }

    /**
     * Generate markdown report
     * @param {Object} data - Validation data
     * @returns {string} Markdown report
     */
    generateMarkdownReport(data) {
        const { prInfo, qualityGateResults, analysisResults, validationTime } = data;
        const status = qualityGateResults.passed ? '✅ PASSED' : '❌ FAILED';
        
        return `# PR Validation Report

## Summary
- **PR**: #${prInfo.prNumber} - ${prInfo.title}
- **Status**: ${status}
- **Overall Score**: ${(qualityGateResults.overallScore * 100).toFixed(1)}%
- **Validation Time**: ${(validationTime / 1000).toFixed(2)}s

## Quality Gates
${Object.entries(qualityGateResults.gates).map(([gate, result]) => 
    `### ${gate.charAt(0).toUpperCase() + gate.slice(1)}
- **Status**: ${result.passed ? '✅ PASSED' : '❌ FAILED'}
- **Score**: ${((result.score || 0) * 100).toFixed(1)}%
- **Threshold**: ${((result.threshold || 0) * 100).toFixed(1)}%
${result.issues?.length > 0 ? `- **Issues**: ${result.issues.length}` : ''}`
).join('\n\n')}

## Detailed Analysis
${Object.entries(analysisResults).map(([category, result]) =>
    `### ${category.charAt(0).toUpperCase() + category.slice(1)}
${result.summary || 'No detailed analysis available'}`
).join('\n\n')}

## Recommendations
${this.generateRecommendations(qualityGateResults, analysisResults)}

---
*Generated by Claude Code Integration at ${new Date().toISOString()}*`;
    }

    /**
     * Generate recommendations based on analysis
     * @param {Object} qualityGateResults - Quality gate results
     * @param {Object} analysisResults - Analysis results
     * @returns {string} Recommendations text
     */
    generateRecommendations(qualityGateResults, analysisResults) {
        const recommendations = [];
        
        Object.entries(qualityGateResults.gates).forEach(([gate, result]) => {
            if (!result.passed && result.issues?.length > 0) {
                recommendations.push(`**${gate}**: ${result.issues.slice(0, 3).map(issue => issue.message || issue).join(', ')}`);
            }
        });
        
        return recommendations.length > 0 ? 
            recommendations.join('\n') : 
            'No specific recommendations - all quality gates passed!';
    }

    /**
     * Make approval recommendation
     * @param {Object} qualityGateResults - Quality gate results
     * @returns {Object} Approval recommendation
     */
    makeApprovalRecommendation(qualityGateResults) {
        const recommendation = {
            approve: qualityGateResults.passed,
            confidence: qualityGateResults.overallScore,
            reason: '',
            actions: []
        };

        if (qualityGateResults.passed) {
            recommendation.reason = 'All quality gates passed successfully';
            if (this.autoApprove && recommendation.confidence > 0.9) {
                recommendation.actions.push('AUTO_APPROVE');
            } else {
                recommendation.actions.push('RECOMMEND_APPROVAL');
            }
        } else {
            const failedGates = Object.entries(qualityGateResults.gates)
                .filter(([_, gate]) => !gate.passed)
                .map(([name, _]) => name);
            
            recommendation.reason = `Failed quality gates: ${failedGates.join(', ')}`;
            recommendation.actions.push('REQUEST_CHANGES');
        }

        return recommendation;
    }

    /**
     * Parse analysis result from Claude Code
     * @param {Object} result - Claude Code result
     * @param {string} category - Analysis category
     * @returns {Object} Parsed analysis result
     */
    parseAnalysisResult(result, category) {
        if (!result.success) {
            return {
                score: 0,
                issues: [`Failed to analyze ${category}: ${result.error}`],
                summary: `Analysis failed: ${result.error}`
            };
        }

        try {
            // Try to extract structured data from the response
            const response = result.data?.lastResponse || result.data || '';
            
            // Basic parsing - in a real implementation, you'd want more sophisticated parsing
            const scoreMatch = response.match(/score[:\s]*([0-9.]+)/i);
            const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;
            
            return {
                score: Math.min(1, Math.max(0, score)),
                issues: this.extractIssues(response),
                summary: response.substring(0, 500) + (response.length > 500 ? '...' : ''),
                rawResponse: response
            };
        } catch (error) {
            return {
                score: 0,
                issues: [`Failed to parse ${category} analysis`],
                summary: 'Analysis parsing failed'
            };
        }
    }

    /**
     * Extract issues from analysis response
     * @param {string} response - Analysis response
     * @returns {Array} Array of issues
     */
    extractIssues(response) {
        const issues = [];
        const lines = response.split('\n');
        
        for (const line of lines) {
            if (line.match(/^[-*]\s+/)) {
                issues.push(line.replace(/^[-*]\s+/, '').trim());
            }
        }
        
        return issues.slice(0, 10); // Limit to top 10 issues
    }

    /**
     * Execute git command
     * @param {Array} args - Git command arguments
     * @returns {Promise<Object>} Command result
     */
    async executeGitCommand(args) {
        return new Promise((resolve, reject) => {
            const process = spawn('git', args, { stdio: 'pipe' });
            let output = '';
            let error = '';

            process.stdout.on('data', (data) => {
                output += data.toString();
            });

            process.stderr.on('data', (data) => {
                error += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, output, error });
                } else {
                    reject(new Error(`Git command failed: ${error}`));
                }
            });
        });
    }

    /**
     * Parse changed files from git diff output
     * @param {string} diffOutput - Git diff --name-status output
     * @returns {Array} Array of changed files
     */
    parseChangedFiles(diffOutput) {
        return diffOutput.split('\n')
            .filter(line => line.trim())
            .map(line => {
                const [status, path] = line.split('\t');
                return { status, path };
            });
    }

    /**
     * Get change statistics
     * @param {string} sourceBranch - Source branch
     * @param {string} targetBranch - Target branch
     * @returns {Promise<Object>} Change statistics
     */
    async getChangeStats(sourceBranch, targetBranch) {
        try {
            const result = await this.executeGitCommand([
                'diff',
                `${targetBranch}...${sourceBranch}`,
                '--stat'
            ]);

            const lines = result.output.split('\n');
            const summary = lines[lines.length - 2] || '';
            const match = summary.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);

            return {
                filesChanged: match ? parseInt(match[1]) : 0,
                insertions: match ? parseInt(match[2] || 0) : 0,
                deletions: match ? parseInt(match[3] || 0) : 0
            };
        } catch (error) {
            return { filesChanged: 0, insertions: 0, deletions: 0 };
        }
    }
}

export default PRValidator;

