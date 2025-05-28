/**
 * @fileoverview Validation Result Model
 * @description Model for managing Claude Code validation outcomes and other validation results
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Validation Result model class
 */
export class ValidationResult {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.task_id = data.task_id || null;
        this.artifact_id = data.artifact_id || null;
        this.validation_type = data.validation_type || 'syntax';
        this.validator_name = data.validator_name || 'unknown';
        this.validation_status = data.validation_status || 'pending';
        this.score = data.score || null;
        this.max_score = data.max_score || 100;
        this.issues_found = data.issues_found || 0;
        this.issues_critical = data.issues_critical || 0;
        this.issues_major = data.issues_major || 0;
        this.issues_minor = data.issues_minor || 0;
        this.validation_details = data.validation_details || {};
        this.suggestions = data.suggestions || [];
        this.execution_time_ms = data.execution_time_ms || null;
        this.started_at = data.started_at || new Date();
        this.completed_at = data.completed_at || null;
        this.metadata = data.metadata || {};
    }

    /**
     * Validate validation result data
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields
        if (!this.task_id) {
            errors.push('Task ID is required');
        }

        if (!this.validator_name || this.validator_name.trim().length === 0) {
            errors.push('Validator name is required');
        }

        // Validation type validation
        const validTypes = [
            'syntax', 'style', 'security', 'performance', 'testing',
            'documentation', 'best_practices', 'compatibility', 'integration'
        ];
        if (!validTypes.includes(this.validation_type)) {
            errors.push(`Invalid validation type. Must be one of: ${validTypes.join(', ')}`);
        }

        // Status validation
        const validStatuses = ['pending', 'running', 'passed', 'failed', 'warning', 'error', 'skipped'];
        if (!validStatuses.includes(this.validation_status)) {
            errors.push(`Invalid validation status. Must be one of: ${validStatuses.join(', ')}`);
        }

        // Score validation
        if (this.score !== null) {
            if (this.score < 0) {
                errors.push('Score cannot be negative');
            }
            if (this.max_score && this.score > this.max_score) {
                errors.push('Score cannot exceed max score');
            }
        }

        if (this.max_score !== null && this.max_score <= 0) {
            errors.push('Max score must be positive');
        }

        // Issues validation
        if (this.issues_found < 0 || this.issues_critical < 0 || 
            this.issues_major < 0 || this.issues_minor < 0) {
            errors.push('Issue counts cannot be negative');
        }

        const totalIssues = this.issues_critical + this.issues_major + this.issues_minor;
        if (totalIssues > this.issues_found) {
            errors.push('Sum of categorized issues cannot exceed total issues found');
        }

        // Execution time validation
        if (this.execution_time_ms !== null && this.execution_time_ms < 0) {
            errors.push('Execution time cannot be negative');
        }

        // Status consistency checks
        if (this.validation_status === 'completed' && !this.completed_at) {
            warnings.push('Completed status should have completion timestamp');
        }

        if (this.validation_status === 'running' && this.completed_at) {
            warnings.push('Running status should not have completion timestamp');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Calculate validation score based on issues
     * @param {Object} weights - Issue type weights
     * @returns {number} Calculated score
     */
    calculateScore(weights = { critical: 10, major: 5, minor: 1 }) {
        if (this.max_score === null || this.max_score <= 0) {
            return null;
        }

        const totalDeductions = 
            (this.issues_critical * weights.critical) +
            (this.issues_major * weights.major) +
            (this.issues_minor * weights.minor);

        const score = Math.max(0, this.max_score - totalDeductions);
        this.score = Math.round(score * 100) / 100; // Round to 2 decimal places
        
        return this.score;
    }

    /**
     * Get validation grade based on score
     * @returns {string} Grade (A, B, C, D, F)
     */
    getGrade() {
        if (this.score === null || this.max_score === null) {
            return 'N/A';
        }

        const percentage = (this.score / this.max_score) * 100;
        
        if (percentage >= 90) return 'A';
        if (percentage >= 80) return 'B';
        if (percentage >= 70) return 'C';
        if (percentage >= 60) return 'D';
        return 'F';
    }

    /**
     * Get validation severity level
     * @returns {string} Severity level
     */
    getSeverityLevel() {
        if (this.issues_critical > 0) return 'critical';
        if (this.issues_major > 0) return 'major';
        if (this.issues_minor > 0) return 'minor';
        if (this.validation_status === 'failed') return 'error';
        return 'clean';
    }

    /**
     * Check if validation passed
     * @returns {boolean} True if validation passed
     */
    isPassed() {
        return this.validation_status === 'passed';
    }

    /**
     * Check if validation failed
     * @returns {boolean} True if validation failed
     */
    isFailed() {
        return this.validation_status === 'failed' || this.validation_status === 'error';
    }

    /**
     * Check if validation is complete
     * @returns {boolean} True if validation is complete
     */
    isComplete() {
        return ['passed', 'failed', 'warning', 'error', 'skipped'].includes(this.validation_status);
    }

    /**
     * Mark validation as started
     */
    markStarted() {
        this.validation_status = 'running';
        this.started_at = new Date();
        this.completed_at = null;
    }

    /**
     * Mark validation as completed
     * @param {string} status - Final status
     * @param {Object} results - Validation results
     */
    markCompleted(status, results = {}) {
        this.validation_status = status;
        this.completed_at = new Date();
        
        if (this.started_at) {
            this.execution_time_ms = this.completed_at.getTime() - this.started_at.getTime();
        }

        // Update results if provided
        if (results.score !== undefined) this.score = results.score;
        if (results.issues_found !== undefined) this.issues_found = results.issues_found;
        if (results.issues_critical !== undefined) this.issues_critical = results.issues_critical;
        if (results.issues_major !== undefined) this.issues_major = results.issues_major;
        if (results.issues_minor !== undefined) this.issues_minor = results.issues_minor;
        if (results.validation_details) this.validation_details = results.validation_details;
        if (results.suggestions) this.suggestions = results.suggestions;
    }

    /**
     * Add validation issue
     * @param {Object} issue - Issue details
     */
    addIssue(issue) {
        if (!this.validation_details.issues) {
            this.validation_details.issues = [];
        }

        this.validation_details.issues.push({
            id: uuidv4(),
            severity: issue.severity || 'minor',
            message: issue.message || '',
            line: issue.line || null,
            column: issue.column || null,
            rule: issue.rule || null,
            category: issue.category || this.validation_type,
            timestamp: new Date()
        });

        // Update issue counts
        this.issues_found++;
        switch (issue.severity) {
            case 'critical':
                this.issues_critical++;
                break;
            case 'major':
                this.issues_major++;
                break;
            case 'minor':
            default:
                this.issues_minor++;
                break;
        }
    }

    /**
     * Add suggestion
     * @param {Object} suggestion - Suggestion details
     */
    addSuggestion(suggestion) {
        this.suggestions.push({
            id: uuidv4(),
            type: suggestion.type || 'improvement',
            message: suggestion.message || '',
            priority: suggestion.priority || 'low',
            category: suggestion.category || this.validation_type,
            timestamp: new Date()
        });
    }

    /**
     * Get validation summary
     * @returns {Object} Summary information
     */
    getSummary() {
        return {
            id: this.id,
            task_id: this.task_id,
            artifact_id: this.artifact_id,
            validation_type: this.validation_type,
            validator_name: this.validator_name,
            status: this.validation_status,
            score: this.score,
            max_score: this.max_score,
            grade: this.getGrade(),
            severity_level: this.getSeverityLevel(),
            total_issues: this.issues_found,
            critical_issues: this.issues_critical,
            major_issues: this.issues_major,
            minor_issues: this.issues_minor,
            suggestions_count: this.suggestions.length,
            execution_time_ms: this.execution_time_ms,
            is_passed: this.isPassed(),
            is_failed: this.isFailed(),
            is_complete: this.isComplete(),
            started_at: this.started_at,
            completed_at: this.completed_at
        };
    }

    /**
     * Convert to database record format
     * @returns {Object} Database record
     */
    toRecord() {
        return {
            id: this.id,
            task_id: this.task_id,
            artifact_id: this.artifact_id,
            validation_type: this.validation_type,
            validator_name: this.validator_name,
            validation_status: this.validation_status,
            score: this.score,
            max_score: this.max_score,
            issues_found: this.issues_found,
            issues_critical: this.issues_critical,
            issues_major: this.issues_major,
            issues_minor: this.issues_minor,
            validation_details: JSON.stringify(this.validation_details),
            suggestions: JSON.stringify(this.suggestions),
            execution_time_ms: this.execution_time_ms,
            started_at: this.started_at,
            completed_at: this.completed_at,
            metadata: JSON.stringify(this.metadata)
        };
    }

    /**
     * Create from database record
     * @param {Object} record - Database record
     * @returns {ValidationResult} ValidationResult instance
     */
    static fromRecord(record) {
        const data = { ...record };
        
        // Parse JSON fields
        if (typeof data.validation_details === 'string') {
            try {
                data.validation_details = JSON.parse(data.validation_details);
            } catch (e) {
                data.validation_details = {};
            }
        }

        if (typeof data.suggestions === 'string') {
            try {
                data.suggestions = JSON.parse(data.suggestions);
            } catch (e) {
                data.suggestions = [];
            }
        }

        if (typeof data.metadata === 'string') {
            try {
                data.metadata = JSON.parse(data.metadata);
            } catch (e) {
                data.metadata = {};
            }
        }

        return new ValidationResult(data);
    }

    /**
     * Create validation result for Claude Code
     * @param {string} taskId - Task ID
     * @param {string} artifactId - Artifact ID
     * @param {Object} options - Validation options
     * @returns {ValidationResult} ValidationResult instance
     */
    static forClaudeCode(taskId, artifactId, options = {}) {
        return new ValidationResult({
            task_id: taskId,
            artifact_id: artifactId,
            validation_type: options.validation_type || 'best_practices',
            validator_name: 'Claude Code',
            validation_status: 'pending',
            max_score: options.max_score || 100,
            metadata: {
                claude_version: options.claude_version || 'unknown',
                validation_config: options.config || {},
                ...options.metadata
            }
        });
    }
}

export default ValidationResult;

