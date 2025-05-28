/**
 * Code Analyzer
 *
 * Comprehensive code quality analysis using Claude Code for
 * maintainability, performance, security, and best practices assessment.
 */

import ClaudeCodeClient from './claude-code-client.js';
import {
	readFileSync,
	writeFileSync,
	existsSync,
	readdirSync,
	statSync
} from 'fs';
import { join, extname, relative } from 'path';

export class CodeAnalyzer {
	constructor(options = {}) {
		this.client = new ClaudeCodeClient(options);
		this.analysisDepth = options.analysisDepth || 'comprehensive'; // 'quick', 'standard', 'comprehensive'
		this.fileExtensions = options.fileExtensions || [
			'.js',
			'.ts',
			'.jsx',
			'.tsx',
			'.py',
			'.java',
			'.cpp',
			'.c',
			'.cs'
		];
		this.excludePatterns = options.excludePatterns || [
			'node_modules',
			'.git',
			'dist',
			'build',
			'coverage'
		];
		this.maxFileSize = options.maxFileSize || 1024 * 1024; // 1MB
		this.batchSize = options.batchSize || 5; // Files to analyze in parallel
	}

	/**
	 * Initialize the code analyzer
	 * @returns {Promise<boolean>} True if initialization successful
	 */
	async initialize() {
		return await this.client.initialize();
	}

	/**
	 * Analyze code quality for a project or specific files
	 * @param {string} target - Target directory or file path
	 * @param {Object} options - Analysis options
	 * @returns {Promise<Object>} Analysis results
	 */
	async analyzeCodeQuality(target, options = {}) {
		const analysisStart = Date.now();

		try {
			console.log(`Starting code quality analysis for: ${target}`);

			// Step 1: Discover files to analyze
			const files = await this.discoverFiles(target);
			console.log(`Found ${files.length} files to analyze`);

			// Step 2: Perform file-level analysis
			const fileAnalyses = await this.analyzeFiles(files, options);

			// Step 3: Perform project-level analysis
			const projectAnalysis = await this.analyzeProject(target, files, options);

			// Step 4: Generate metrics and scores
			const metrics = this.calculateMetrics(fileAnalyses, projectAnalysis);

			// Step 5: Generate recommendations
			const recommendations = this.generateRecommendations(
				fileAnalyses,
				projectAnalysis,
				metrics
			);

			return {
				success: true,
				target,
				summary: {
					filesAnalyzed: files.length,
					analysisTime: Date.now() - analysisStart,
					overallScore: metrics.overallScore,
					grade: this.calculateGrade(metrics.overallScore)
				},
				metrics,
				fileAnalyses,
				projectAnalysis,
				recommendations,
				timestamp: new Date().toISOString()
			};
		} catch (error) {
			console.error(`Code analysis failed for ${target}:`, error.message);
			return {
				success: false,
				target,
				error: error.message,
				analysisTime: Date.now() - analysisStart
			};
		}
	}

	/**
	 * Discover files to analyze in the target
	 * @param {string} target - Target path
	 * @returns {Promise<Array>} Array of file paths
	 */
	async discoverFiles(target) {
		const files = [];

		try {
			const stat = statSync(target);

			if (stat.isFile()) {
				if (this.shouldAnalyzeFile(target)) {
					files.push(target);
				}
			} else if (stat.isDirectory()) {
				this.walkDirectory(target, files);
			}

			return files.filter((file) => {
				const stat = statSync(file);
				return stat.size <= this.maxFileSize;
			});
		} catch (error) {
			throw new Error(`Failed to discover files: ${error.message}`);
		}
	}

	/**
	 * Walk directory recursively to find files
	 * @param {string} dir - Directory path
	 * @param {Array} files - Array to collect files
	 */
	walkDirectory(dir, files) {
		try {
			const entries = readdirSync(dir);

			for (const entry of entries) {
				const fullPath = join(dir, entry);

				// Skip excluded patterns
				if (
					this.excludePatterns.some((pattern) => fullPath.includes(pattern))
				) {
					continue;
				}

				const stat = statSync(fullPath);

				if (stat.isDirectory()) {
					this.walkDirectory(fullPath, files);
				} else if (stat.isFile() && this.shouldAnalyzeFile(fullPath)) {
					files.push(fullPath);
				}
			}
		} catch (error) {
			console.warn(`Failed to read directory ${dir}:`, error.message);
		}
	}

	/**
	 * Check if file should be analyzed
	 * @param {string} filePath - File path
	 * @returns {boolean} True if file should be analyzed
	 */
	shouldAnalyzeFile(filePath) {
		const ext = extname(filePath);
		return this.fileExtensions.includes(ext);
	}

	/**
	 * Analyze multiple files
	 * @param {Array} files - Array of file paths
	 * @param {Object} options - Analysis options
	 * @returns {Promise<Array>} Array of file analysis results
	 */
	async analyzeFiles(files, options = {}) {
		const results = [];

		// Process files in batches to avoid overwhelming the system
		for (let i = 0; i < files.length; i += this.batchSize) {
			const batch = files.slice(i, i + this.batchSize);
			const batchPromises = batch.map((file) =>
				this.analyzeFile(file, options)
			);

			try {
				const batchResults = await Promise.all(batchPromises);
				results.push(...batchResults);

				console.log(
					`Analyzed batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(files.length / this.batchSize)}`
				);
			} catch (error) {
				console.error(`Batch analysis failed:`, error.message);
				// Continue with individual file analysis for failed batch
				for (const file of batch) {
					try {
						const result = await this.analyzeFile(file, options);
						results.push(result);
					} catch (fileError) {
						results.push({
							file,
							success: false,
							error: fileError.message
						});
					}
				}
			}
		}

		return results;
	}

	/**
	 * Analyze a single file
	 * @param {string} filePath - File path
	 * @param {Object} options - Analysis options
	 * @returns {Promise<Object>} File analysis result
	 */
	async analyzeFile(filePath, options = {}) {
		try {
			const content = readFileSync(filePath, 'utf8');
			const relativePath = relative(process.cwd(), filePath);

			const query = this.buildFileAnalysisQuery(relativePath, content, options);

			const result = await this.client.query(query, {
				systemPrompt: this.getFileAnalysisSystemPrompt(),
				timeout: options.timeout || 60000
			});

			if (!result.success) {
				throw new Error(result.error);
			}

			return {
				file: relativePath,
				success: true,
				analysis: this.parseFileAnalysis(
					result.data?.lastResponse || result.data
				),
				size: content.length,
				lines: content.split('\n').length
			};
		} catch (error) {
			return {
				file: relative(process.cwd(), filePath),
				success: false,
				error: error.message
			};
		}
	}

	/**
	 * Build file analysis query
	 * @param {string} filePath - File path
	 * @param {string} content - File content
	 * @param {Object} options - Analysis options
	 * @returns {string} Analysis query
	 */
	buildFileAnalysisQuery(filePath, content, options) {
		const analysisLevel = options.analysisDepth || this.analysisDepth;

		let query = `Analyze the code quality of this file: ${filePath}\n\n`;
		query += `File Content:\n\`\`\`\n${content}\n\`\`\`\n\n`;

		if (analysisLevel === 'quick') {
			query += `Provide a quick assessment focusing on:
1. Overall code quality score (0-10)
2. Top 3 issues or improvements
3. Complexity assessment
4. Security concerns (if any)`;
		} else if (analysisLevel === 'standard') {
			query += `Provide a standard assessment including:
1. Code quality score (0-10)
2. Maintainability assessment
3. Performance considerations
4. Security analysis
5. Best practices compliance
6. Top 5 specific recommendations`;
		} else {
			// comprehensive
			query += `Provide a comprehensive analysis including:
1. Code quality score (0-10) with breakdown
2. Complexity analysis (cyclomatic, cognitive)
3. Maintainability index
4. Security vulnerability assessment
5. Performance impact analysis
6. Best practices compliance
7. Code smells identification
8. Refactoring opportunities
9. Documentation quality
10. Specific, actionable recommendations`;
		}

		query += `\n\nFormat the response with clear sections and scores.`;

		return query;
	}

	/**
	 * Get system prompt for file analysis
	 * @returns {string} System prompt
	 */
	getFileAnalysisSystemPrompt() {
		return `You are a senior software engineer and code quality expert. Analyze code with focus on:
- Maintainability and readability
- Performance and efficiency
- Security vulnerabilities
- Best practices adherence
- Code complexity and structure
- Documentation quality

Provide specific, actionable feedback with clear scores and recommendations.`;
	}

	/**
	 * Parse file analysis response
	 * @param {string} response - Analysis response
	 * @returns {Object} Parsed analysis
	 */
	parseFileAnalysis(response) {
		const analysis = {
			score: 0,
			complexity: 'unknown',
			maintainability: 'unknown',
			security: 'unknown',
			performance: 'unknown',
			issues: [],
			recommendations: [],
			summary: ''
		};

		try {
			// Extract score
			const scoreMatch = response.match(
				/(?:score|quality)[:\s]*([0-9.]+)(?:\/10)?/i
			);
			if (scoreMatch) {
				analysis.score = parseFloat(scoreMatch[1]);
				if (analysis.score > 10) analysis.score = analysis.score / 10; // Normalize to 0-1
				if (analysis.score > 1) analysis.score = 1;
			}

			// Extract complexity
			const complexityMatch = response.match(/complexity[:\s]*([a-z]+)/i);
			if (complexityMatch) {
				analysis.complexity = complexityMatch[1].toLowerCase();
			}

			// Extract issues and recommendations
			const lines = response.split('\n');
			let currentSection = '';

			for (const line of lines) {
				const trimmed = line.trim();

				if (trimmed.match(/^(issues?|problems?|concerns?):/i)) {
					currentSection = 'issues';
				} else if (trimmed.match(/^(recommendations?|suggestions?):/i)) {
					currentSection = 'recommendations';
				} else if (trimmed.match(/^[-*]\s+/) && currentSection) {
					const item = trimmed.replace(/^[-*]\s+/, '');
					if (currentSection === 'issues') {
						analysis.issues.push(item);
					} else if (currentSection === 'recommendations') {
						analysis.recommendations.push(item);
					}
				}
			}

			// Generate summary
			analysis.summary =
				response.substring(0, 300) + (response.length > 300 ? '...' : '');
		} catch (error) {
			console.warn('Failed to parse file analysis:', error.message);
			analysis.summary = 'Failed to parse analysis response';
		}

		return analysis;
	}

	/**
	 * Analyze project-level metrics
	 * @param {string} target - Target path
	 * @param {Array} files - Array of file paths
	 * @param {Object} options - Analysis options
	 * @returns {Promise<Object>} Project analysis
	 */
	async analyzeProject(target, files, options = {}) {
		try {
			const query = `Analyze this project's overall architecture and code quality:

Project: ${target}
Files analyzed: ${files.length}
File types: ${this.getFileTypeDistribution(files)}

Provide analysis on:
1. Project structure and organization
2. Architecture patterns and design
3. Code consistency across files
4. Dependency management
5. Testing strategy
6. Documentation coverage
7. Overall maintainability
8. Technical debt assessment
9. Scalability considerations
10. Development workflow quality

Provide scores and specific recommendations for improvement.`;

			const result = await this.client.query(query, {
				systemPrompt:
					'You are a software architect analyzing project-level code quality and structure.',
				timeout: options.timeout || 120000
			});

			if (!result.success) {
				throw new Error(result.error);
			}

			return this.parseProjectAnalysis(
				result.data?.lastResponse || result.data
			);
		} catch (error) {
			return {
				success: false,
				error: error.message
			};
		}
	}

	/**
	 * Get file type distribution
	 * @param {Array} files - Array of file paths
	 * @returns {Object} File type distribution
	 */
	getFileTypeDistribution(files) {
		const distribution = {};

		for (const file of files) {
			const ext = extname(file);
			distribution[ext] = (distribution[ext] || 0) + 1;
		}

		return distribution;
	}

	/**
	 * Parse project analysis response
	 * @param {string} response - Analysis response
	 * @returns {Object} Parsed project analysis
	 */
	parseProjectAnalysis(response) {
		return {
			architecture: this.extractSection(response, 'architecture'),
			structure: this.extractSection(response, 'structure'),
			consistency: this.extractSection(response, 'consistency'),
			maintainability: this.extractSection(response, 'maintainability'),
			technicalDebt: this.extractSection(response, 'technical debt'),
			recommendations: this.extractRecommendations(response),
			summary: response.substring(0, 500) + (response.length > 500 ? '...' : '')
		};
	}

	/**
	 * Extract section from analysis response
	 * @param {string} response - Analysis response
	 * @param {string} sectionName - Section name to extract
	 * @returns {string} Extracted section
	 */
	extractSection(response, sectionName) {
		const regex = new RegExp(`${sectionName}[:\\s]*([^\\n]+)`, 'i');
		const match = response.match(regex);
		return match ? match[1].trim() : 'Not analyzed';
	}

	/**
	 * Extract recommendations from response
	 * @param {string} response - Analysis response
	 * @returns {Array} Array of recommendations
	 */
	extractRecommendations(response) {
		const recommendations = [];
		const lines = response.split('\n');
		let inRecommendations = false;

		for (const line of lines) {
			const trimmed = line.trim();

			if (trimmed.match(/^(recommendations?|suggestions?):/i)) {
				inRecommendations = true;
			} else if (trimmed.match(/^[-*]\s+/) && inRecommendations) {
				recommendations.push(trimmed.replace(/^[-*]\s+/, ''));
			} else if (trimmed.match(/^[0-9]+\./) && inRecommendations) {
				recommendations.push(trimmed.replace(/^[0-9]+\.\s*/, ''));
			}
		}

		return recommendations.slice(0, 10); // Limit to top 10
	}

	/**
	 * Calculate overall metrics
	 * @param {Array} fileAnalyses - File analysis results
	 * @param {Object} projectAnalysis - Project analysis
	 * @returns {Object} Calculated metrics
	 */
	calculateMetrics(fileAnalyses, projectAnalysis) {
		const successfulAnalyses = fileAnalyses.filter((a) => a.success);

		if (successfulAnalyses.length === 0) {
			return {
				overallScore: 0,
				averageFileScore: 0,
				fileScoreDistribution: {},
				complexityDistribution: {},
				issueCount: 0,
				recommendationCount: 0
			};
		}

		// Calculate average file score
		const scores = successfulAnalyses
			.map((a) => a.analysis.score)
			.filter((s) => s > 0);
		const averageFileScore =
			scores.length > 0
				? scores.reduce((sum, score) => sum + score, 0) / scores.length
				: 0;

		// Calculate score distribution
		const scoreDistribution = {};
		for (const score of scores) {
			const bucket = Math.floor(score * 10) / 10;
			scoreDistribution[bucket] = (scoreDistribution[bucket] || 0) + 1;
		}

		// Calculate complexity distribution
		const complexityDistribution = {};
		for (const analysis of successfulAnalyses) {
			const complexity = analysis.analysis.complexity;
			complexityDistribution[complexity] =
				(complexityDistribution[complexity] || 0) + 1;
		}

		// Count issues and recommendations
		const issueCount = successfulAnalyses.reduce(
			(sum, a) => sum + (a.analysis.issues?.length || 0),
			0
		);
		const recommendationCount = successfulAnalyses.reduce(
			(sum, a) => sum + (a.analysis.recommendations?.length || 0),
			0
		);

		// Calculate overall score (weighted average of file scores and project factors)
		const overallScore =
			averageFileScore * 0.7 + (projectAnalysis.success ? 0.3 : 0);

		return {
			overallScore,
			averageFileScore,
			fileScoreDistribution: scoreDistribution,
			complexityDistribution,
			issueCount,
			recommendationCount,
			analysisSuccessRate: successfulAnalyses.length / fileAnalyses.length
		};
	}

	/**
	 * Generate recommendations based on analysis
	 * @param {Array} fileAnalyses - File analysis results
	 * @param {Object} projectAnalysis - Project analysis
	 * @param {Object} metrics - Calculated metrics
	 * @returns {Object} Generated recommendations
	 */
	generateRecommendations(fileAnalyses, projectAnalysis, metrics) {
		const recommendations = {
			priority: [],
			general: [],
			fileSpecific: [],
			projectLevel: []
		};

		// Priority recommendations based on metrics
		if (metrics.overallScore < 0.6) {
			recommendations.priority.push(
				'Overall code quality is below acceptable threshold - immediate attention required'
			);
		}

		if (metrics.issueCount > fileAnalyses.length * 2) {
			recommendations.priority.push(
				'High number of issues detected - consider code review and refactoring'
			);
		}

		// General recommendations
		if (metrics.averageFileScore < 0.7) {
			recommendations.general.push(
				'Improve code quality standards and review processes'
			);
		}

		if (metrics.analysisSuccessRate < 0.9) {
			recommendations.general.push(
				'Some files could not be analyzed - check for syntax errors or unsupported formats'
			);
		}

		// File-specific recommendations (top issues)
		const topIssues = fileAnalyses
			.filter((a) => a.success && a.analysis.issues?.length > 0)
			.sort((a, b) => b.analysis.issues.length - a.analysis.issues.length)
			.slice(0, 5);

		for (const fileAnalysis of topIssues) {
			recommendations.fileSpecific.push({
				file: fileAnalysis.file,
				issues: fileAnalysis.analysis.issues.slice(0, 3)
			});
		}

		// Project-level recommendations
		if (projectAnalysis.recommendations) {
			recommendations.projectLevel = projectAnalysis.recommendations.slice(
				0,
				5
			);
		}

		return recommendations;
	}

	/**
	 * Calculate grade based on score
	 * @param {number} score - Overall score (0-1)
	 * @returns {string} Letter grade
	 */
	calculateGrade(score) {
		if (score >= 0.9) return 'A';
		if (score >= 0.8) return 'B';
		if (score >= 0.7) return 'C';
		if (score >= 0.6) return 'D';
		return 'F';
	}

	/**
	 * Export analysis results
	 * @param {Object} results - Analysis results
	 * @param {string} format - Export format ('json', 'markdown', 'html')
	 * @param {string} outputPath - Output file path
	 * @returns {Promise<boolean>} True if export successful
	 */
	async exportResults(results, format = 'json', outputPath = null) {
		try {
			let content = '';

			if (format === 'json') {
				content = JSON.stringify(results, null, 2);
			} else if (format === 'markdown') {
				content = this.generateMarkdownReport(results);
			} else if (format === 'html') {
				content = this.generateHtmlReport(results);
			}

			if (outputPath) {
				writeFileSync(outputPath, content);
				console.log(`Analysis results exported to: ${outputPath}`);
			}

			return true;
		} catch (error) {
			console.error('Failed to export results:', error.message);
			return false;
		}
	}

	/**
	 * Generate markdown report
	 * @param {Object} results - Analysis results
	 * @returns {string} Markdown report
	 */
	generateMarkdownReport(results) {
		const { summary, metrics, recommendations } = results;

		return `# Code Quality Analysis Report

## Summary
- **Target**: ${results.target}
- **Files Analyzed**: ${summary.filesAnalyzed}
- **Analysis Time**: ${(summary.analysisTime / 1000).toFixed(2)}s
- **Overall Score**: ${(metrics.overallScore * 100).toFixed(1)}%
- **Grade**: ${summary.grade}

## Metrics
- **Average File Score**: ${(metrics.averageFileScore * 100).toFixed(1)}%
- **Total Issues**: ${metrics.issueCount}
- **Total Recommendations**: ${metrics.recommendationCount}
- **Analysis Success Rate**: ${(metrics.analysisSuccessRate * 100).toFixed(1)}%

## Priority Recommendations
${recommendations.priority.map((rec) => `- ${rec}`).join('\n')}

## General Recommendations
${recommendations.general.map((rec) => `- ${rec}`).join('\n')}

## File-Specific Issues
${recommendations.fileSpecific
	.map(
		(item) =>
			`### ${item.file}\n${item.issues.map((issue) => `- ${issue}`).join('\n')}`
	)
	.join('\n\n')}

---
*Generated by Claude Code Integration at ${results.timestamp}*`;
	}

	/**
	 * Generate HTML report
	 * @param {Object} results - Analysis results
	 * @returns {string} HTML report
	 */
	generateHtmlReport(results) {
		// Basic HTML report - could be enhanced with CSS and charts
		return `<!DOCTYPE html>
<html>
<head>
    <title>Code Quality Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .score { font-size: 24px; font-weight: bold; }
        .grade-A { color: green; }
        .grade-B { color: blue; }
        .grade-C { color: orange; }
        .grade-D, .grade-F { color: red; }
        .section { margin: 20px 0; }
        .file-issue { margin: 10px 0; padding: 10px; background: #f5f5f5; }
    </style>
</head>
<body>
    <h1>Code Quality Analysis Report</h1>
    
    <div class="section">
        <h2>Summary</h2>
        <p><strong>Target:</strong> ${results.target}</p>
        <p><strong>Files Analyzed:</strong> ${results.summary.filesAnalyzed}</p>
        <p><strong>Overall Score:</strong> <span class="score grade-${results.summary.grade}">${(results.metrics.overallScore * 100).toFixed(1)}% (${results.summary.grade})</span></p>
    </div>
    
    <div class="section">
        <h2>Recommendations</h2>
        ${results.recommendations.priority.map((rec) => `<p><strong>Priority:</strong> ${rec}</p>`).join('')}
        ${results.recommendations.general.map((rec) => `<p>${rec}</p>`).join('')}
    </div>
    
    <div class="section">
        <h2>File-Specific Issues</h2>
        ${results.recommendations.fileSpecific
					.map(
						(item) =>
							`<div class="file-issue">
                <h3>${item.file}</h3>
                <ul>${item.issues.map((issue) => `<li>${issue}</li>`).join('')}</ul>
            </div>`
					)
					.join('')}
    </div>
    
    <footer>
        <p><em>Generated by Claude Code Integration at ${results.timestamp}</em></p>
    </footer>
</body>
</html>`;
	}
}

export default CodeAnalyzer;
