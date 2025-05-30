/**
 * Linear Formatter Utilities
 * Provides formatting utilities for Linear issues, comments, and descriptions
 */

/**
 * Format issue title with emoji and prefix
 * @param {string} title - Original title
 * @param {string} type - Issue type (main, sub, bug, feature, etc.)
 * @param {string} prefix - Optional prefix
 * @returns {string} Formatted title
 */
export function formatIssueTitle(title, type = 'sub', prefix = '') {
    const typeEmojis = {
        main: '🚀',
        sub: '📋',
        bug: '🐛',
        feature: '✨',
        restructure: '🔧',
        enhancement: '⚡',
        documentation: '📚',
        testing: '🧪',
        deployment: '🚀',
        security: '🔒'
    };
    
    const emoji = typeEmojis[type.toLowerCase()] || '📋';
    const formattedPrefix = prefix ? `${prefix} ` : '';
    
    return `${emoji} ${formattedPrefix}${title}`;
}

/**
 * Format markdown description with sections
 * @param {Object} data - Description data
 * @returns {string} Formatted markdown description
 */
export function formatMarkdownDescription(data) {
    const {
        title,
        description,
        objective,
        requirements = [],
        acceptanceCriteria = [],
        technicalSpecs,
        affectedFiles = [],
        dependencies = [],
        notes,
        metadata = {}
    } = data;
    
    let markdown = '';
    
    // Title
    if (title) {
        markdown += `# ${title}\n\n`;
    }
    
    // Objective/Description
    if (objective || description) {
        markdown += `## 🎯 Objective\n${objective || description}\n\n`;
    }
    
    // Technical Specifications
    if (technicalSpecs) {
        markdown += `## 🔧 Technical Specifications\n${technicalSpecs}\n\n`;
    }
    
    // Requirements
    if (requirements.length > 0) {
        markdown += `## 📋 Requirements\n`;
        requirements.forEach(req => {
            markdown += `- ${req}\n`;
        });
        markdown += '\n';
    }
    
    // Acceptance Criteria
    if (acceptanceCriteria.length > 0) {
        markdown += `## ✅ Acceptance Criteria\n`;
        acceptanceCriteria.forEach(criteria => {
            markdown += `- [ ] ${criteria}\n`;
        });
        markdown += '\n';
    }
    
    // Affected Files
    if (affectedFiles.length > 0) {
        markdown += `## 📁 Affected Files\n`;
        affectedFiles.forEach(file => {
            markdown += `- \`${file}\`\n`;
        });
        markdown += '\n';
    }
    
    // Dependencies
    if (dependencies.length > 0) {
        markdown += `## 🔗 Dependencies\n`;
        dependencies.forEach(dep => {
            markdown += `- ${dep}\n`;
        });
        markdown += '\n';
    }
    
    // Notes
    if (notes) {
        markdown += `## 📝 Notes\n${notes}\n\n`;
    }
    
    // Metadata footer
    if (Object.keys(metadata).length > 0) {
        markdown += `---\n`;
        Object.entries(metadata).forEach(([key, value]) => {
            const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            markdown += `**${formattedKey}**: ${value}\n`;
        });
    }
    
    return markdown;
}

/**
 * Format progress update comment
 * @param {Object} progressData - Progress information
 * @returns {string} Formatted progress comment
 */
export function formatProgressComment(progressData) {
    const {
        total,
        completed,
        inProgress,
        todo,
        blocked,
        progress,
        issues = []
    } = progressData;
    
    let comment = `📊 **Progress Update**\n\n`;
    
    // Progress bar
    const progressBar = createProgressBar(progress);
    comment += `${progressBar} ${progress.toFixed(1)}%\n\n`;
    
    // Statistics
    comment += `**Statistics:**\n`;
    comment += `- 📋 Total Issues: ${total}\n`;
    comment += `- ✅ Completed: ${completed}\n`;
    comment += `- 🚀 In Progress: ${inProgress}\n`;
    comment += `- 📝 Todo: ${todo}\n`;
    if (blocked > 0) {
        comment += `- 🚫 Blocked: ${blocked}\n`;
    }
    comment += '\n';
    
    // Issue breakdown (if provided)
    if (issues.length > 0) {
        comment += `**Issue Status:**\n`;
        issues.forEach(issue => {
            const statusEmoji = getStatusEmoji(issue.stateType);
            comment += `- ${statusEmoji} ${issue.title} (${issue.state})\n`;
        });
        comment += '\n';
    }
    
    comment += `*Last updated: ${new Date().toISOString()}*`;
    
    return comment;
}

/**
 * Format error report comment
 * @param {Array} errors - Array of error objects
 * @param {Object} options - Formatting options
 * @returns {string} Formatted error comment
 */
export function formatErrorComment(errors, options = {}) {
    const {
        includeStackTrace = false,
        maxErrors = 5,
        severity = 'medium'
    } = options;
    
    const severityEmojis = {
        low: '⚠️',
        medium: '🚨',
        high: '💥',
        critical: '🔥'
    };
    
    const emoji = severityEmojis[severity.toLowerCase()] || '🚨';
    
    let comment = `${emoji} **Implementation Errors Detected**\n\n`;
    comment += `A total of ${errors.length} error(s) were encountered.\n\n`;
    
    // Show first few errors
    const errorsToShow = errors.slice(0, maxErrors);
    
    comment += `**Error Details:**\n`;
    errorsToShow.forEach((error, index) => {
        comment += `### ${index + 1}. ${error.type || 'Error'}\n`;
        comment += `**Message**: ${error.message}\n`;
        
        if (error.file) {
            comment += `**File**: \`${error.file}\`\n`;
        }
        
        if (error.line) {
            comment += `**Line**: ${error.line}\n`;
        }
        
        if (error.severity) {
            comment += `**Severity**: ${error.severity}\n`;
        }
        
        if (includeStackTrace && error.stack) {
            comment += `**Stack Trace**:\n\`\`\`\n${error.stack}\n\`\`\`\n`;
        }
        
        comment += '\n';
    });
    
    // Show count if there are more errors
    if (errors.length > maxErrors) {
        comment += `... and ${errors.length - maxErrors} more error(s)\n\n`;
    }
    
    // Error summary
    const errorTypes = [...new Set(errors.map(e => e.type || 'Unknown'))];
    comment += `**Summary:**\n`;
    comment += `- **Total Errors**: ${errors.length}\n`;
    comment += `- **Error Types**: ${errorTypes.join(', ')}\n`;
    comment += `- **Severity**: ${severity}\n\n`;
    
    comment += `*Errors detected automatically by CICD System*`;
    
    return comment;
}

/**
 * Format status change comment
 * @param {string} fromStatus - Previous status
 * @param {string} toStatus - New status
 * @param {Object} metadata - Additional metadata
 * @returns {string} Formatted status comment
 */
export function formatStatusComment(fromStatus, toStatus, metadata = {}) {
    const statusEmojis = {
        todo: '📋',
        'in-progress': '🚀',
        completed: '✅',
        blocked: '🚫',
        'needs-restructure': '🔧',
        'under-review': '👀',
        testing: '🧪',
        deployed: '🚀'
    };
    
    const fromEmoji = statusEmojis[fromStatus.toLowerCase().replace(/\s+/g, '-')] || '📊';
    const toEmoji = statusEmojis[toStatus.toLowerCase().replace(/\s+/g, '-')] || '📊';
    
    let comment = `${toEmoji} **Status Updated: ${fromStatus} → ${toStatus}**\n\n`;
    
    if (metadata.reason) {
        comment += `**Reason**: ${metadata.reason}\n\n`;
    }
    
    if (metadata.details) {
        comment += `**Details**: ${metadata.details}\n\n`;
    }
    
    if (metadata.nextSteps) {
        comment += `**Next Steps**: ${metadata.nextSteps}\n\n`;
    }
    
    if (metadata.estimatedCompletion) {
        comment += `**Estimated Completion**: ${metadata.estimatedCompletion}\n\n`;
    }
    
    if (metadata.assignee) {
        comment += `**Assigned to**: ${metadata.assignee}\n\n`;
    }
    
    comment += `*Updated automatically at ${new Date().toISOString()}*`;
    
    return comment;
}

/**
 * Format completion celebration comment
 * @param {Object} completionData - Completion information
 * @returns {string} Formatted celebration comment
 */
export function formatCompletionComment(completionData = {}) {
    const {
        title,
        duration,
        subIssuesCount,
        linesOfCode,
        testsAdded,
        performanceMetrics
    } = completionData;
    
    let comment = `🎉 **Implementation Completed Successfully!**\n\n`;
    
    if (title) {
        comment += `**Project**: ${title}\n\n`;
    }
    
    comment += `**Completion Summary:**\n`;
    
    if (duration) {
        comment += `- ⏱️ **Duration**: ${formatDuration(duration)}\n`;
    }
    
    if (subIssuesCount) {
        comment += `- 📋 **Sub-Issues Completed**: ${subIssuesCount}\n`;
    }
    
    if (linesOfCode) {
        comment += `- 💻 **Lines of Code**: ${linesOfCode.toLocaleString()}\n`;
    }
    
    if (testsAdded) {
        comment += `- 🧪 **Tests Added**: ${testsAdded}\n`;
    }
    
    if (performanceMetrics) {
        comment += `- 📈 **Performance**: ${performanceMetrics}\n`;
    }
    
    comment += '\n';
    comment += `All requirements have been met and the implementation is ready for deployment! 🚀\n\n`;
    comment += `*Completed automatically by CICD System*`;
    
    return comment;
}

/**
 * Format table from data
 * @param {Array} data - Array of objects
 * @param {Array} columns - Column definitions
 * @returns {string} Formatted markdown table
 */
export function formatTable(data, columns) {
    if (!data || data.length === 0) {
        return '*No data available*';
    }
    
    // Header
    let table = '| ' + columns.map(col => col.header || col.key).join(' | ') + ' |\n';
    
    // Separator
    table += '| ' + columns.map(() => '---').join(' | ') + ' |\n';
    
    // Rows
    data.forEach(row => {
        const cells = columns.map(col => {
            const value = row[col.key];
            return col.formatter ? col.formatter(value, row) : (value || '');
        });
        table += '| ' + cells.join(' | ') + ' |\n';
    });
    
    return table;
}

/**
 * Create progress bar visualization
 * @param {number} percentage - Progress percentage (0-100)
 * @param {number} width - Bar width in characters
 * @returns {string} Progress bar string
 */
export function createProgressBar(percentage, width = 20) {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    const filledChar = '█';
    const emptyChar = '░';
    
    return `[${filledChar.repeat(filled)}${emptyChar.repeat(empty)}]`;
}

/**
 * Get status emoji for issue state
 * @param {string} stateType - Linear state type
 * @returns {string} Emoji for state
 */
export function getStatusEmoji(stateType) {
    const stateEmojis = {
        unstarted: '📋',
        started: '🚀',
        completed: '✅',
        canceled: '❌',
        backlog: '📝',
        triage: '🔍'
    };
    
    return stateEmojis[stateType] || '📊';
}

/**
 * Format duration in human-readable format
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
        return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
export function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format code block with syntax highlighting
 * @param {string} code - Code content
 * @param {string} language - Programming language
 * @returns {string} Formatted code block
 */
export function formatCodeBlock(code, language = '') {
    return `\`\`\`${language}\n${code}\n\`\`\``;
}

/**
 * Format inline code
 * @param {string} code - Code content
 * @returns {string} Formatted inline code
 */
export function formatInlineCode(code) {
    return `\`${code}\``;
}

/**
 * Format link with title
 * @param {string} url - URL
 * @param {string} title - Link title
 * @returns {string} Formatted markdown link
 */
export function formatLink(url, title) {
    return `[${title}](${url})`;
}

/**
 * Format list from array
 * @param {Array} items - List items
 * @param {boolean} ordered - Whether to use ordered list
 * @returns {string} Formatted list
 */
export function formatList(items, ordered = false) {
    if (!items || items.length === 0) {
        return '';
    }
    
    return items.map((item, index) => {
        const prefix = ordered ? `${index + 1}.` : '-';
        return `${prefix} ${item}`;
    }).join('\n');
}

/**
 * Format checklist from array
 * @param {Array} items - Checklist items
 * @param {Array} checked - Array of checked indices
 * @returns {string} Formatted checklist
 */
export function formatChecklist(items, checked = []) {
    if (!items || items.length === 0) {
        return '';
    }
    
    return items.map((item, index) => {
        const checkbox = checked.includes(index) ? '[x]' : '[ ]';
        return `- ${checkbox} ${item}`;
    }).join('\n');
}

/**
 * Sanitize text for markdown
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizeMarkdown(text) {
    if (!text) return '';
    
    // Escape markdown special characters
    return text
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/`/g, '\\`')
        .replace(/~/g, '\\~')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/#/g, '\\#')
        .replace(/\+/g, '\\+')
        .replace(/-/g, '\\-')
        .replace(/\./g, '\\.')
        .replace(/!/g, '\\!');
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 100) {
    if (!text || text.length <= maxLength) {
        return text;
    }
    
    return text.substring(0, maxLength - 3) + '...';
}

export default {
    formatIssueTitle,
    formatMarkdownDescription,
    formatProgressComment,
    formatErrorComment,
    formatStatusComment,
    formatCompletionComment,
    formatTable,
    createProgressBar,
    getStatusEmoji,
    formatDuration,
    formatFileSize,
    formatCodeBlock,
    formatInlineCode,
    formatLink,
    formatList,
    formatChecklist,
    sanitizeMarkdown,
    truncateText
};

