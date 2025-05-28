/**
 * Feedback Processor
 *
 * Processes and formats feedback from Claude Code analysis for delivery
 * to development teams through various channels (Linear, GitHub, Slack, etc.)
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export class FeedbackProcessor {
	constructor(options = {}) {
		this.options = {
			defaultFormat: 'markdown',
			includeMetrics: true,
			includeRecommendations: true,
			maxIssuesPerFile: 5,
			priorityThreshold: 0.7,
			...options
		};

		this.templates = {
			github: this.getGitHubTemplate(),
			linear: this.getLinearTemplate(),
			slack: this.getSlackTemplate(),
			email: this.getEmailTemplate()
		};
	}

	/**
	 * Process analysis results into formatted feedback
	 * @param {Object} analysisResults - Results from code analysis
	 * @param {Object} options - Processing options
	 * @returns {Object} Processed feedback in multiple formats
	 */
	async processFeedback(analysisResults, options = {}) {
		const {
			target = 'github',
			format = this.options.defaultFormat,
			includeDetails = true,
			customTemplate = null
		} = options;

		try {
			const processedData = this.preprocessAnalysisData(analysisResults);

			const feedback = {
				summary: this.generateSummary(processedData),
				formats: {}
			};

			// Generate feedback in multiple formats
			if (target === 'all' || target.includes('github')) {
				feedback.formats.github = await this.generateGitHubFeedback(
					processedData,
					options
				);
			}

			if (target === 'all' || target.includes('linear')) {
				feedback.formats.linear = await this.generateLinearFeedback(
					processedData,
					options
				);
			}

			if (target === 'all' || target.includes('slack')) {
				feedback.formats.slack = await this.generateSlackFeedback(
					processedData,
					options
				);
			}

			if (target === 'all' || target.includes('email')) {
				feedback.formats.email = await this.generateEmailFeedback(
					processedData,
					options
				);
			}

			// Generate custom format if template provided
			if (customTemplate) {
				feedback.formats.custom = await this.generateCustomFeedback(
					processedData,
					customTemplate,
					options
				);
			}

			return {
				success: true,
				feedback,
				metadata: {
					processedAt: new Date().toISOString(),
					target,
					format,
					analysisType: analysisResults.type || 'code-quality'
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error.message
			};
		}
	}

	/**
	 * Preprocess analysis data for feedback generation
	 * @param {Object} analysisResults - Raw analysis results
	 * @returns {Object} Preprocessed data
	 */
	preprocessAnalysisData(analysisResults) {
		const data = {
			type: analysisResults.type || 'analysis',
			summary: analysisResults.summary || {},
			metrics: analysisResults.metrics || {},
			issues: [],
			recommendations: [],
			files: [],
			qualityGates: analysisResults.qualityGates || null,
			timestamp: analysisResults.timestamp || new Date().toISOString()
		};

		// Process different types of analysis results
		if (analysisResults.type === 'pr-validation') {
			data.prInfo = analysisResults.prInfo || {};
			data.recommendation = analysisResults.recommendation || {};
			data.qualityGates = analysisResults.qualityGates || {};
		}

		// Extract issues and recommendations
		if (analysisResults.fileAnalyses) {
			for (const fileAnalysis of analysisResults.fileAnalyses) {
				if (fileAnalysis.success && fileAnalysis.analysis) {
					const analysis = fileAnalysis.analysis;

					// Add file-specific issues
					if (analysis.issues) {
						data.issues.push(
							...analysis.issues.map((issue) => ({
								file: fileAnalysis.file,
								type: 'issue',
								message: issue,
								severity: this.determineSeverity(issue, analysis.score)
							}))
						);
					}

					// Add file-specific recommendations
					if (analysis.recommendations) {
						data.recommendations.push(
							...analysis.recommendations.map((rec) => ({
								file: fileAnalysis.file,
								type: 'recommendation',
								message: rec,
								priority: this.determinePriority(rec, analysis.score)
							}))
						);
					}

					// Add file summary
					data.files.push({
						path: fileAnalysis.file,
						score: analysis.score,
						complexity: analysis.complexity,
						issueCount: analysis.issues?.length || 0,
						recommendationCount: analysis.recommendations?.length || 0
					});
				}
			}
		}

		// Process project-level recommendations
		if (analysisResults.recommendations) {
			if (analysisResults.recommendations.priority) {
				data.recommendations.push(
					...analysisResults.recommendations.priority.map((rec) => ({
						type: 'project',
						message: rec,
						priority: 'high'
					}))
				);
			}

			if (analysisResults.recommendations.general) {
				data.recommendations.push(
					...analysisResults.recommendations.general.map((rec) => ({
						type: 'project',
						message: rec,
						priority: 'medium'
					}))
				);
			}
		}

		// Sort issues and recommendations by priority/severity
		data.issues.sort(
			(a, b) =>
				this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity)
		);
		data.recommendations.sort(
			(a, b) =>
				this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority)
		);

		return data;
	}

	/**
	 * Generate summary of analysis results
	 * @param {Object} data - Preprocessed data
	 * @returns {Object} Summary object
	 */
	generateSummary(data) {
		const summary = {
			overallStatus: 'unknown',
			score: 0,
			grade: 'F',
			totalIssues: data.issues.length,
			totalRecommendations: data.recommendations.length,
			filesAnalyzed: data.files.length,
			criticalIssues: 0,
			highPriorityRecommendations: 0
		};

		// Calculate overall score and status
		if (data.metrics.overallScore !== undefined) {
			summary.score = data.metrics.overallScore;
			summary.grade = this.calculateGrade(summary.score);
			summary.overallStatus =
				summary.score >= 0.7 ? 'good' : summary.score >= 0.5 ? 'fair' : 'poor';
		}

		// Count critical issues and high priority recommendations
		summary.criticalIssues = data.issues.filter(
			(issue) => issue.severity === 'critical'
		).length;
		summary.highPriorityRecommendations = data.recommendations.filter(
			(rec) => rec.priority === 'high'
		).length;

		// PR-specific summary
		if (data.type === 'pr-validation') {
			summary.prStatus = data.recommendation?.approve
				? 'approved'
				: 'changes-requested';
			summary.qualityGatesPassed = data.qualityGates?.passed || false;
		}

		return summary;
	}

	/**
	 * Generate GitHub-formatted feedback
	 * @param {Object} data - Preprocessed data
	 * @param {Object} options - Generation options
	 * @returns {Object} GitHub feedback
	 */
	async generateGitHubFeedback(data, options = {}) {
		const template = this.templates.github;
		const summary = this.generateSummary(data);

		let content = template.header
			.replace('{{TITLE}}', this.getTitle(data))
			.replace('{{STATUS_EMOJI}}', this.getStatusEmoji(summary))
			.replace('{{OVERALL_STATUS}}', summary.overallStatus.toUpperCase());

		// Add summary section
		content += template.summary
			.replace('{{SCORE}}', (summary.score * 100).toFixed(1))
			.replace('{{GRADE}}', summary.grade)
			.replace('{{TOTAL_ISSUES}}', summary.totalIssues)
			.replace('{{TOTAL_RECOMMENDATIONS}}', summary.totalRecommendations)
			.replace('{{FILES_ANALYZED}}', summary.filesAnalyzed);

		// Add quality gates for PR validation
		if (data.type === 'pr-validation' && data.qualityGates) {
			content += this.generateQualityGatesSection(data.qualityGates);
		}

		// Add critical issues
		if (summary.criticalIssues > 0) {
			content += '\n## 🚨 Critical Issues\n\n';
			const criticalIssues = data.issues.filter(
				(issue) => issue.severity === 'critical'
			);
			for (const issue of criticalIssues.slice(0, 5)) {
				content += `- **${issue.file}**: ${issue.message}\n`;
			}
		}

		// Add top recommendations
		if (summary.highPriorityRecommendations > 0) {
			content += '\n## 🎯 Priority Recommendations\n\n';
			const highPriorityRecs = data.recommendations.filter(
				(rec) => rec.priority === 'high'
			);
			for (const rec of highPriorityRecs.slice(0, 5)) {
				const prefix = rec.file ? `**${rec.file}**: ` : '';
				content += `- ${prefix}${rec.message}\n`;
			}
		}

		// Add file breakdown if requested
		if (options.includeFileBreakdown && data.files.length > 0) {
			content += '\n## 📁 File Analysis\n\n';
			content += '| File | Score | Issues | Recommendations |\n';
			content += '|------|-------|--------|------------------|\n';

			for (const file of data.files.slice(0, 10)) {
				const score = (file.score * 100).toFixed(1);
				content += `| ${file.path} | ${score}% | ${file.issueCount} | ${file.recommendationCount} |\n`;
			}
		}

		content += template.footer.replace('{{TIMESTAMP}}', data.timestamp);

		return {
			content,
			type: 'markdown',
			title: this.getTitle(data),
			labels: this.generateLabels(summary),
			assignees: options.assignees || []
		};
	}

	/**
	 * Generate Linear-formatted feedback
	 * @param {Object} data - Preprocessed data
	 * @param {Object} options - Generation options
	 * @returns {Object} Linear feedback
	 */
	async generateLinearFeedback(data, options = {}) {
		const template = this.templates.linear;
		const summary = this.generateSummary(data);

		let content = template.header
			.replace('{{TITLE}}', this.getTitle(data))
			.replace('{{STATUS_EMOJI}}', this.getStatusEmoji(summary));

		// Add compact summary for Linear
		content += `**Score**: ${(summary.score * 100).toFixed(1)}% (${summary.grade})\n`;
		content += `**Issues**: ${summary.totalIssues} | **Recommendations**: ${summary.totalRecommendations}\n\n`;

		// Add top issues and recommendations
		if (summary.criticalIssues > 0) {
			content += '**🚨 Critical Issues:**\n';
			const criticalIssues = data.issues.filter(
				(issue) => issue.severity === 'critical'
			);
			for (const issue of criticalIssues.slice(0, 3)) {
				content += `• ${issue.message}\n`;
			}
			content += '\n';
		}

		if (summary.highPriorityRecommendations > 0) {
			content += '**🎯 Priority Actions:**\n';
			const highPriorityRecs = data.recommendations.filter(
				(rec) => rec.priority === 'high'
			);
			for (const rec of highPriorityRecs.slice(0, 3)) {
				content += `• ${rec.message}\n`;
			}
		}

		content += template.footer.replace(
			'{{TIMESTAMP}}',
			new Date().toLocaleString()
		);

		return {
			content,
			type: 'markdown',
			title: this.getTitle(data),
			priority: this.getLinearPriority(summary),
			labels: this.generateLinearLabels(summary)
		};
	}

	/**
	 * Generate Slack-formatted feedback
	 * @param {Object} data - Preprocessed data
	 * @param {Object} options - Generation options
	 * @returns {Object} Slack feedback
	 */
	async generateSlackFeedback(data, options = {}) {
		const summary = this.generateSummary(data);

		const blocks = [
			{
				type: 'header',
				text: {
					type: 'plain_text',
					text: `${this.getStatusEmoji(summary)} ${this.getTitle(data)}`
				}
			},
			{
				type: 'section',
				fields: [
					{
						type: 'mrkdwn',
						text: `*Score:* ${(summary.score * 100).toFixed(1)}% (${summary.grade})`
					},
					{
						type: 'mrkdwn',
						text: `*Status:* ${summary.overallStatus.toUpperCase()}`
					},
					{
						type: 'mrkdwn',
						text: `*Issues:* ${summary.totalIssues}`
					},
					{
						type: 'mrkdwn',
						text: `*Files:* ${summary.filesAnalyzed}`
					}
				]
			}
		];

		// Add critical issues if any
		if (summary.criticalIssues > 0) {
			blocks.push({
				type: 'section',
				text: {
					type: 'mrkdwn',
					text: `*🚨 Critical Issues (${summary.criticalIssues}):*\n${data.issues
						.filter((issue) => issue.severity === 'critical')
						.slice(0, 3)
						.map((issue) => `• ${issue.message}`)
						.join('\n')}`
				}
			});
		}

		// Add top recommendations
		if (summary.highPriorityRecommendations > 0) {
			blocks.push({
				type: 'section',
				text: {
					type: 'mrkdwn',
					text: `*🎯 Priority Recommendations:*\n${data.recommendations
						.filter((rec) => rec.priority === 'high')
						.slice(0, 3)
						.map((rec) => `• ${rec.message}`)
						.join('\n')}`
				}
			});
		}

		return {
			blocks,
			text: `Code analysis completed: ${summary.overallStatus}`,
			color: this.getSlackColor(summary),
			title: this.getTitle(data)
		};
	}

	/**
	 * Generate email-formatted feedback
	 * @param {Object} data - Preprocessed data
	 * @param {Object} options - Generation options
	 * @returns {Object} Email feedback
	 */
	async generateEmailFeedback(data, options = {}) {
		const template = this.templates.email;
		const summary = this.generateSummary(data);

		const subject = `Code Analysis Report: ${summary.overallStatus.toUpperCase()} - ${(summary.score * 100).toFixed(1)}%`;

		let html = template.header
			.replace('{{TITLE}}', this.getTitle(data))
			.replace('{{STATUS_COLOR}}', this.getStatusColor(summary));

		// Add summary table
		html += `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Overall Score</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${(summary.score * 100).toFixed(1)}% (${summary.grade})</td>
            </tr>
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Total Issues</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${summary.totalIssues}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Files Analyzed</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${summary.filesAnalyzed}</td>
            </tr>
        </table>`;

		// Add critical issues
		if (summary.criticalIssues > 0) {
			html += '<h3 style="color: #d73a49;">🚨 Critical Issues</h3><ul>';
			const criticalIssues = data.issues.filter(
				(issue) => issue.severity === 'critical'
			);
			for (const issue of criticalIssues.slice(0, 5)) {
				html += `<li><strong>${issue.file}:</strong> ${issue.message}</li>`;
			}
			html += '</ul>';
		}

		// Add recommendations
		if (summary.highPriorityRecommendations > 0) {
			html +=
				'<h3 style="color: #0366d6;">🎯 Priority Recommendations</h3><ul>';
			const highPriorityRecs = data.recommendations.filter(
				(rec) => rec.priority === 'high'
			);
			for (const rec of highPriorityRecs.slice(0, 5)) {
				const prefix = rec.file ? `<strong>${rec.file}:</strong> ` : '';
				html += `<li>${prefix}${rec.message}</li>`;
			}
			html += '</ul>';
		}

		html += template.footer.replace(
			'{{TIMESTAMP}}',
			new Date().toLocaleString()
		);

		return {
			subject,
			html,
			text: this.htmlToText(html),
			title: this.getTitle(data)
		};
	}

	/**
	 * Generate custom feedback using provided template
	 * @param {Object} data - Preprocessed data
	 * @param {string} template - Custom template
	 * @param {Object} options - Generation options
	 * @returns {Object} Custom feedback
	 */
	async generateCustomFeedback(data, template, options = {}) {
		const summary = this.generateSummary(data);

		// Replace template variables
		let content = template
			.replace(/\{\{TITLE\}\}/g, this.getTitle(data))
			.replace(/\{\{STATUS\}\}/g, summary.overallStatus)
			.replace(/\{\{SCORE\}\}/g, (summary.score * 100).toFixed(1))
			.replace(/\{\{GRADE\}\}/g, summary.grade)
			.replace(/\{\{TOTAL_ISSUES\}\}/g, summary.totalIssues)
			.replace(/\{\{TOTAL_RECOMMENDATIONS\}\}/g, summary.totalRecommendations)
			.replace(/\{\{FILES_ANALYZED\}\}/g, summary.filesAnalyzed)
			.replace(/\{\{TIMESTAMP\}\}/g, data.timestamp);

		// Replace dynamic content
		if (content.includes('{{CRITICAL_ISSUES}}')) {
			const criticalIssues = data.issues
				.filter((issue) => issue.severity === 'critical')
				.slice(0, 5)
				.map((issue) => `- ${issue.file}: ${issue.message}`)
				.join('\n');
			content = content.replace(/\{\{CRITICAL_ISSUES\}\}/g, criticalIssues);
		}

		if (content.includes('{{HIGH_PRIORITY_RECOMMENDATIONS}}')) {
			const highPriorityRecs = data.recommendations
				.filter((rec) => rec.priority === 'high')
				.slice(0, 5)
				.map((rec) => `- ${rec.message}`)
				.join('\n');
			content = content.replace(
				/\{\{HIGH_PRIORITY_RECOMMENDATIONS\}\}/g,
				highPriorityRecs
			);
		}

		return {
			content,
			type: 'custom',
			title: this.getTitle(data)
		};
	}

	/**
	 * Generate quality gates section for GitHub
	 * @param {Object} qualityGates - Quality gates results
	 * @returns {string} Quality gates markdown
	 */
	generateQualityGatesSection(qualityGates) {
		let content = '\n## 🚦 Quality Gates\n\n';

		Object.entries(qualityGates.gates).forEach(([gate, result]) => {
			const status = result.passed ? '✅' : '❌';
			const score = result.score
				? `${(result.score * 100).toFixed(1)}%`
				: 'N/A';
			content += `- ${status} **${gate}**: ${score}\n`;
		});

		content += `\n**Overall**: ${qualityGates.passed ? '✅ PASSED' : '❌ FAILED'}\n`;

		return content;
	}

	// Helper methods for formatting and styling

	getTitle(data) {
		if (data.type === 'pr-validation') {
			return `PR #${data.prInfo?.prNumber || 'Unknown'} Validation Report`;
		}
		return 'Code Quality Analysis Report';
	}

	getStatusEmoji(summary) {
		if (summary.overallStatus === 'good') return '✅';
		if (summary.overallStatus === 'fair') return '⚠️';
		return '❌';
	}

	getStatusColor(summary) {
		if (summary.overallStatus === 'good') return '#28a745';
		if (summary.overallStatus === 'fair') return '#ffc107';
		return '#dc3545';
	}

	getSlackColor(summary) {
		if (summary.overallStatus === 'good') return 'good';
		if (summary.overallStatus === 'fair') return 'warning';
		return 'danger';
	}

	calculateGrade(score) {
		if (score >= 0.9) return 'A';
		if (score >= 0.8) return 'B';
		if (score >= 0.7) return 'C';
		if (score >= 0.6) return 'D';
		return 'F';
	}

	determineSeverity(issue, score) {
		if (
			issue.toLowerCase().includes('security') ||
			issue.toLowerCase().includes('vulnerability')
		) {
			return 'critical';
		}
		if (score < 0.5) return 'high';
		if (score < 0.7) return 'medium';
		return 'low';
	}

	determinePriority(recommendation, score) {
		if (score < 0.5) return 'high';
		if (score < 0.7) return 'medium';
		return 'low';
	}

	getSeverityWeight(severity) {
		const weights = { critical: 4, high: 3, medium: 2, low: 1 };
		return weights[severity] || 0;
	}

	getPriorityWeight(priority) {
		const weights = { high: 3, medium: 2, low: 1 };
		return weights[priority] || 0;
	}

	generateLabels(summary) {
		const labels = ['code-analysis'];

		if (summary.overallStatus === 'poor') labels.push('needs-improvement');
		if (summary.criticalIssues > 0) labels.push('critical-issues');
		if (summary.score >= 0.8) labels.push('high-quality');

		return labels;
	}

	generateLinearLabels(summary) {
		const labels = ['code-quality'];

		if (summary.criticalIssues > 0) labels.push('urgent');
		if (summary.score >= 0.8) labels.push('approved');

		return labels;
	}

	getLinearPriority(summary) {
		if (summary.criticalIssues > 0) return 1; // Urgent
		if (summary.overallStatus === 'poor') return 2; // High
		if (summary.overallStatus === 'fair') return 3; // Medium
		return 4; // Low
	}

	htmlToText(html) {
		return html
			.replace(/<[^>]*>/g, '')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.trim();
	}

	// Template definitions

	getGitHubTemplate() {
		return {
			header: `# {{STATUS_EMOJI}} {{TITLE}}

**Status**: {{OVERALL_STATUS}}

`,
			summary: `## 📊 Summary

- **Overall Score**: {{SCORE}}% (Grade: {{GRADE}})
- **Total Issues**: {{TOTAL_ISSUES}}
- **Total Recommendations**: {{TOTAL_RECOMMENDATIONS}}
- **Files Analyzed**: {{FILES_ANALYZED}}

`,
			footer: `

---
*Analysis completed at {{TIMESTAMP}}*`
		};
	}

	getLinearTemplate() {
		return {
			header: `{{STATUS_EMOJI}} **{{TITLE}}**

`,
			footer: `

*Updated: {{TIMESTAMP}}*`
		};
	}

	getSlackTemplate() {
		return {
			// Slack uses blocks format, handled in generateSlackFeedback
		};
	}

	getEmailTemplate() {
		return {
			header: `<!DOCTYPE html>
<html>
<head>
    <title>{{TITLE}}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background-color: {{STATUS_COLOR}}; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{TITLE}}</h1>
    </div>
    <div class="content">`,
			footer: `
    </div>
    <footer style="text-align: center; padding: 20px; color: #666;">
        <p>Analysis completed at {{TIMESTAMP}}</p>
    </footer>
</body>
</html>`
		};
	}
}

export default FeedbackProcessor;
