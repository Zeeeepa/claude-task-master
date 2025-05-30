/**
 * Deployment Result Formatter
 * 
 * Utility functions for formatting deployment validation results,
 * error messages, and status reports for various output formats.
 */

export class DeploymentFormatter {
    constructor(options = {}) {
        this.options = {
            includeTimestamps: options.includeTimestamps !== false,
            includeDetails: options.includeDetails !== false,
            maxErrorLength: options.maxErrorLength || 1000,
            dateFormat: options.dateFormat || 'ISO',
            ...options
        };
    }

    /**
     * Format deployment validation results for Linear comments
     * @param {Object} deployment - Deployment result
     * @param {Object} validationResults - Validation layer results
     * @returns {string} Formatted Linear comment
     */
    formatLinearComment(deployment, validationResults = null) {
        const status = deployment.status;
        const emoji = this.getStatusEmoji(status);
        const duration = this.formatDuration(deployment.duration);

        let comment = `${emoji} **Deployment Validation ${status.toUpperCase()}**\n\n`;

        // Basic deployment info
        comment += `**Deployment ID:** \`${deployment.id}\`\n`;
        comment += `**Duration:** ${duration}\n`;
        comment += `**Environment:** ${deployment.environment || 'WSL2'}\n\n`;

        // Validation results summary
        if (validationResults) {
            comment += this.formatValidationSummary(validationResults);
        }

        // Status-specific content
        switch (status) {
            case 'completed':
                comment += this.formatSuccessDetails(deployment);
                break;
            case 'failed':
                comment += this.formatFailureDetails(deployment);
                break;
            case 'timeout':
                comment += this.formatTimeoutDetails(deployment);
                break;
            case 'escalated':
                comment += this.formatEscalationDetails(deployment);
                break;
        }

        // Add links if available
        if (deployment.logsUrl) {
            comment += `\n📋 [View Deployment Logs](${deployment.logsUrl})`;
        }

        if (deployment.prUrl) {
            comment += `\n🔗 [View Pull Request](${deployment.prUrl})`;
        }

        return comment;
    }

    /**
     * Format deployment results for GitHub PR comments
     * @param {Object} deployment - Deployment result
     * @param {Object} validationResults - Validation layer results
     * @returns {string} Formatted GitHub comment
     */
    formatGitHubComment(deployment, validationResults = null) {
        const status = deployment.status;
        const emoji = this.getStatusEmoji(status);
        const duration = this.formatDuration(deployment.duration);

        let comment = `## ${emoji} Claude Code Validation ${status.toUpperCase()}\n\n`;

        // Deployment summary table
        comment += `| Property | Value |\n`;
        comment += `|----------|-------|\n`;
        comment += `| **Status** | ${status.toUpperCase()} |\n`;
        comment += `| **Duration** | ${duration} |\n`;
        comment += `| **Deployment ID** | \`${deployment.id}\` |\n`;
        comment += `| **Environment** | ${deployment.environment || 'WSL2'} |\n\n`;

        // Validation results
        if (validationResults) {
            comment += this.formatValidationTable(validationResults);
        }

        // Detailed results based on status
        switch (status) {
            case 'completed':
                comment += this.formatGitHubSuccessDetails(deployment);
                break;
            case 'failed':
                comment += this.formatGitHubFailureDetails(deployment);
                break;
            case 'timeout':
                comment += this.formatGitHubTimeoutDetails(deployment);
                break;
        }

        // Footer with links
        comment += `\n---\n`;
        comment += `🤖 *Automated validation by Claude Code*`;
        
        if (deployment.logsUrl) {
            comment += ` | [View Logs](${deployment.logsUrl})`;
        }

        return comment;
    }

    /**
     * Format validation summary for Linear
     * @param {Object} validationResults - Validation results
     * @returns {string} Formatted validation summary
     */
    formatValidationSummary(validationResults) {
        if (!validationResults.layers) return '';

        const layers = Object.entries(validationResults.layers);
        const passed = layers.filter(([_, result]) => result.status === 'passed').length;
        const failed = layers.filter(([_, result]) => result.status === 'failed').length;
        const skipped = layers.filter(([_, result]) => result.status === 'skipped').length;

        let summary = `**Validation Summary:**\n`;
        summary += `- ✅ Passed: ${passed}\n`;
        summary += `- ❌ Failed: ${failed}\n`;
        summary += `- ⏭️ Skipped: ${skipped}\n\n`;

        // Individual layer results
        summary += `**Layer Results:**\n`;
        for (const [layerName, result] of layers) {
            const layerEmoji = this.getLayerEmoji(result.status);
            const layerDuration = this.formatDuration(result.duration);
            summary += `- ${layerEmoji} **${this.capitalizeFirst(layerName)}** (${layerDuration})`;
            
            if (result.message) {
                summary += `: ${result.message}`;
            }
            summary += '\n';
        }

        return summary + '\n';
    }

    /**
     * Format validation results as a table for GitHub
     * @param {Object} validationResults - Validation results
     * @returns {string} Formatted validation table
     */
    formatValidationTable(validationResults) {
        if (!validationResults.layers) return '';

        let table = `### Validation Results\n\n`;
        table += `| Layer | Status | Duration | Details |\n`;
        table += `|-------|--------|----------|----------|\n`;

        for (const [layerName, result] of Object.entries(validationResults.layers)) {
            const emoji = this.getLayerEmoji(result.status);
            const duration = this.formatDuration(result.duration);
            const details = result.message || result.error || '-';
            const truncatedDetails = this.truncateText(details, 50);

            table += `| ${this.capitalizeFirst(layerName)} | ${emoji} ${result.status.toUpperCase()} | ${duration} | ${truncatedDetails} |\n`;
        }

        return table + '\n';
    }

    /**
     * Format success details
     * @param {Object} deployment - Deployment result
     * @returns {string} Formatted success details
     */
    formatSuccessDetails(deployment) {
        let details = `🎉 **All validation layers passed successfully!**\n\n`;
        
        if (deployment.metrics) {
            details += `**Performance Metrics:**\n`;
            if (deployment.metrics.testCoverage) {
                details += `- Test Coverage: ${deployment.metrics.testCoverage}%\n`;
            }
            if (deployment.metrics.buildTime) {
                details += `- Build Time: ${this.formatDuration(deployment.metrics.buildTime)}\n`;
            }
            if (deployment.metrics.testTime) {
                details += `- Test Time: ${this.formatDuration(deployment.metrics.testTime)}\n`;
            }
        }

        details += `\n✅ **Ready for review and merge!**\n`;
        return details;
    }

    /**
     * Format failure details
     * @param {Object} deployment - Deployment result
     * @returns {string} Formatted failure details
     */
    formatFailureDetails(deployment) {
        let details = `❌ **Validation failed with the following errors:**\n\n`;

        if (deployment.errors && deployment.errors.length > 0) {
            details += `**Errors:**\n`;
            deployment.errors.slice(0, 5).forEach((error, index) => {
                const truncatedError = this.truncateText(error, this.options.maxErrorLength);
                details += `${index + 1}. ${truncatedError}\n`;
            });

            if (deployment.errors.length > 5) {
                details += `... and ${deployment.errors.length - 5} more errors\n`;
            }
        }

        if (deployment.autoFixAttempts > 0) {
            details += `\n🔧 **Auto-fix attempted ${deployment.autoFixAttempts} time(s)**\n`;
            
            if (deployment.autoFixResults) {
                details += `**Auto-fix Results:**\n`;
                deployment.autoFixResults.forEach(result => {
                    const resultEmoji = result.status === 'success' ? '✅' : '❌';
                    details += `- ${resultEmoji} ${result.strategy}: ${result.status}\n`;
                });
            }
        }

        if (deployment.escalated) {
            details += `\n🚨 **Issue escalated to Codegen for manual intervention**\n`;
        }

        return details;
    }

    /**
     * Format timeout details
     * @param {Object} deployment - Deployment result
     * @returns {string} Formatted timeout details
     */
    formatTimeoutDetails(deployment) {
        return `⏰ **Validation timed out after ${this.formatDuration(deployment.duration)}**\n\n` +
               `The validation process exceeded the maximum allowed time. This may indicate:\n` +
               `- Complex test suites requiring optimization\n` +
               `- Resource constraints in the validation environment\n` +
               `- Network connectivity issues\n\n` +
               `🚨 **Issue escalated to Codegen for investigation**\n`;
    }

    /**
     * Format escalation details
     * @param {Object} deployment - Deployment result
     * @returns {string} Formatted escalation details
     */
    formatEscalationDetails(deployment) {
        return `🚨 **Validation escalated to Codegen**\n\n` +
               `After ${deployment.autoFixAttempts || 0} auto-fix attempts, manual intervention is required.\n` +
               `A new Linear issue has been created for Codegen to investigate and resolve the issues.\n\n` +
               `**Next Steps:**\n` +
               `1. Codegen will review the deployment errors and logs\n` +
               `2. Fixes will be applied to the same branch\n` +
               `3. Validation will be re-triggered automatically\n`;
    }

    /**
     * Format GitHub success details
     * @param {Object} deployment - Deployment result
     * @returns {string} Formatted GitHub success details
     */
    formatGitHubSuccessDetails(deployment) {
        let details = `### ✅ Success Details\n\n`;
        details += `All validation layers completed successfully! Your code is ready for review.\n\n`;

        if (deployment.metrics) {
            details += `#### 📊 Performance Metrics\n\n`;
            details += `| Metric | Value |\n`;
            details += `|--------|-------|\n`;
            
            if (deployment.metrics.testCoverage) {
                details += `| Test Coverage | ${deployment.metrics.testCoverage}% |\n`;
            }
            if (deployment.metrics.buildTime) {
                details += `| Build Time | ${this.formatDuration(deployment.metrics.buildTime)} |\n`;
            }
            if (deployment.metrics.testTime) {
                details += `| Test Time | ${this.formatDuration(deployment.metrics.testTime)} |\n`;
            }
            if (deployment.metrics.linesOfCode) {
                details += `| Lines of Code | ${deployment.metrics.linesOfCode} |\n`;
            }
        }

        return details;
    }

    /**
     * Format GitHub failure details
     * @param {Object} deployment - Deployment result
     * @returns {string} Formatted GitHub failure details
     */
    formatGitHubFailureDetails(deployment) {
        let details = `### ❌ Failure Details\n\n`;

        if (deployment.errors && deployment.errors.length > 0) {
            details += `#### Errors Encountered\n\n`;
            deployment.errors.slice(0, 3).forEach((error, index) => {
                details += `**${index + 1}.** ${this.truncateText(error, 200)}\n\n`;
            });

            if (deployment.errors.length > 3) {
                details += `<details>\n<summary>Show ${deployment.errors.length - 3} more errors</summary>\n\n`;
                deployment.errors.slice(3).forEach((error, index) => {
                    details += `**${index + 4}.** ${this.truncateText(error, 200)}\n\n`;
                });
                details += `</details>\n\n`;
            }
        }

        if (deployment.autoFixAttempts > 0) {
            details += `#### 🔧 Auto-Fix Attempts\n\n`;
            details += `${deployment.autoFixAttempts} auto-fix attempt(s) were made:\n\n`;
            
            if (deployment.autoFixResults) {
                deployment.autoFixResults.forEach(result => {
                    const resultEmoji = result.status === 'success' ? '✅' : '❌';
                    details += `- ${resultEmoji} **${result.strategy}**: ${result.status}\n`;
                });
            }
        }

        return details;
    }

    /**
     * Format GitHub timeout details
     * @param {Object} deployment - Deployment result
     * @returns {string} Formatted GitHub timeout details
     */
    formatGitHubTimeoutDetails(deployment) {
        return `### ⏰ Timeout Details\n\n` +
               `The validation process timed out after ${this.formatDuration(deployment.duration)}.\n\n` +
               `#### Possible Causes\n` +
               `- Complex test suites requiring optimization\n` +
               `- Resource constraints in the validation environment\n` +
               `- Network connectivity issues\n` +
               `- Infinite loops or hanging processes\n\n` +
               `#### Next Steps\n` +
               `This issue has been escalated to Codegen for investigation.\n`;
    }

    /**
     * Format error report for debugging
     * @param {Object} deployment - Deployment result
     * @param {Object} logs - Deployment logs
     * @returns {string} Formatted error report
     */
    formatErrorReport(deployment, logs = null) {
        let report = `# Deployment Error Report\n\n`;
        report += `**Deployment ID:** ${deployment.id}\n`;
        report += `**Status:** ${deployment.status}\n`;
        report += `**Timestamp:** ${this.formatTimestamp(deployment.timestamp)}\n`;
        report += `**Duration:** ${this.formatDuration(deployment.duration)}\n\n`;

        if (deployment.errors) {
            report += `## Errors\n\n`;
            deployment.errors.forEach((error, index) => {
                report += `### Error ${index + 1}\n`;
                report += `\`\`\`\n${error}\n\`\`\`\n\n`;
            });
        }

        if (logs) {
            report += `## Deployment Logs\n\n`;
            report += `\`\`\`\n${logs.output || 'No logs available'}\n\`\`\`\n\n`;
        }

        if (deployment.environment) {
            report += `## Environment Information\n\n`;
            report += `**Type:** ${deployment.environment.type}\n`;
            report += `**Resources:** ${JSON.stringify(deployment.environment.resources, null, 2)}\n\n`;
        }

        return report;
    }

    /**
     * Get status emoji
     * @param {string} status - Status string
     * @returns {string} Appropriate emoji
     */
    getStatusEmoji(status) {
        const emojiMap = {
            'completed': '✅',
            'success': '✅',
            'failed': '❌',
            'failure': '❌',
            'timeout': '⏰',
            'escalated': '🚨',
            'running': '🔄',
            'pending': '⏳',
            'skipped': '⏭️'
        };
        return emojiMap[status] || '❓';
    }

    /**
     * Get layer emoji
     * @param {string} status - Layer status
     * @returns {string} Appropriate emoji
     */
    getLayerEmoji(status) {
        return this.getStatusEmoji(status);
    }

    /**
     * Format duration in human-readable format
     * @param {number} duration - Duration in milliseconds
     * @returns {string} Formatted duration
     */
    formatDuration(duration) {
        if (!duration || duration < 0) return '0s';

        const seconds = Math.floor(duration / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Format timestamp
     * @param {Date|string} timestamp - Timestamp to format
     * @returns {string} Formatted timestamp
     */
    formatTimestamp(timestamp) {
        if (!timestamp) return 'Unknown';

        const date = new Date(timestamp);
        
        switch (this.options.dateFormat) {
            case 'ISO':
                return date.toISOString();
            case 'local':
                return date.toLocaleString();
            case 'relative':
                return this.formatRelativeTime(date);
            default:
                return date.toISOString();
        }
    }

    /**
     * Format relative time
     * @param {Date} date - Date to format
     * @returns {string} Relative time string
     */
    formatRelativeTime(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffDays > 0) return `${diffDays} day(s) ago`;
        if (diffHours > 0) return `${diffHours} hour(s) ago`;
        if (diffMinutes > 0) return `${diffMinutes} minute(s) ago`;
        return `${diffSeconds} second(s) ago`;
    }

    /**
     * Truncate text to specified length
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated text
     */
    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    /**
     * Capitalize first letter
     * @param {string} str - String to capitalize
     * @returns {string} Capitalized string
     */
    capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
    }

    /**
     * Format file size
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

export default DeploymentFormatter;

