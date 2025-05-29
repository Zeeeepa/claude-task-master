/**
 * @fileoverview PRTracking Model
 * @description Pull request lifecycle and validation status tracking model
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * PRTracking model class for monitoring pull request lifecycle
 */
export class PRTracking {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.pr_number = data.pr_number;
        this.pr_url = data.pr_url || '';
        this.repository_name = data.repository_name || '';
        this.repository_url = data.repository_url || '';
        
        // PR details
        this.title = data.title || '';
        this.description = data.description || '';
        this.branch_name = data.branch_name || '';
        this.base_branch = data.base_branch || 'main';
        
        // Status tracking
        this.status = data.status || 'open';
        this.merge_status = data.merge_status || 'pending';
        this.review_status = data.review_status || 'pending';
        
        // Validation results
        this.ci_status = data.ci_status || 'pending';
        this.test_coverage_percentage = data.test_coverage_percentage || null;
        this.quality_score = data.quality_score || null;
        this.security_scan_status = data.security_scan_status || 'pending';
        
        // Metrics
        this.lines_added = data.lines_added || 0;
        this.lines_deleted = data.lines_deleted || 0;
        this.files_changed = data.files_changed || 0;
        this.commits_count = data.commits_count || 0;
        
        // Relationships
        this.workflow_id = data.workflow_id || null;
        this.task_id = data.task_id || null;
        this.created_by_session_id = data.created_by_session_id || null;
        
        // Timing
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();
        this.merged_at = data.merged_at || null;
        this.closed_at = data.closed_at || null;
        
        // People
        this.author = data.author || '';
        this.assignees = data.assignees || [];
        this.reviewers = data.reviewers || [];
        
        // Additional data
        this.labels = data.labels || [];
        this.metadata = data.metadata || {};
    }

    /**
     * Validate PR tracking data
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields
        if (this.pr_number === null || this.pr_number === undefined) {
            errors.push('PR number is required');
        }

        if (this.pr_number !== null && (this.pr_number < 1 || !Number.isInteger(this.pr_number))) {
            errors.push('PR number must be a positive integer');
        }

        if (!this.pr_url || this.pr_url.trim().length === 0) {
            errors.push('PR URL is required');
        }

        if (!this.repository_name || this.repository_name.trim().length === 0) {
            errors.push('Repository name is required');
        }

        if (!this.title || this.title.trim().length === 0) {
            errors.push('PR title is required');
        }

        if (!this.branch_name || this.branch_name.trim().length === 0) {
            errors.push('Branch name is required');
        }

        // Length validations
        if (this.title && this.title.length > 500) {
            errors.push('PR title must be 500 characters or less');
        }

        if (this.repository_name && this.repository_name.length > 255) {
            errors.push('Repository name must be 255 characters or less');
        }

        if (this.branch_name && this.branch_name.length > 255) {
            errors.push('Branch name must be 255 characters or less');
        }

        // Status validations
        const validStatuses = ['open', 'closed', 'merged', 'draft'];
        if (!validStatuses.includes(this.status)) {
            errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
        }

        const validMergeStatuses = ['pending', 'mergeable', 'conflicted', 'blocked', 'merged'];
        if (!validMergeStatuses.includes(this.merge_status)) {
            errors.push(`Merge status must be one of: ${validMergeStatuses.join(', ')}`);
        }

        const validReviewStatuses = ['pending', 'approved', 'changes_requested', 'dismissed'];
        if (!validReviewStatuses.includes(this.review_status)) {
            errors.push(`Review status must be one of: ${validReviewStatuses.join(', ')}`);
        }

        const validCIStatuses = ['pending', 'running', 'success', 'failure', 'cancelled', 'skipped'];
        if (!validCIStatuses.includes(this.ci_status)) {
            errors.push(`CI status must be one of: ${validCIStatuses.join(', ')}`);
        }

        const validSecurityStatuses = ['pending', 'running', 'passed', 'failed', 'skipped'];
        if (!validSecurityStatuses.includes(this.security_scan_status)) {
            errors.push(`Security scan status must be one of: ${validSecurityStatuses.join(', ')}`);
        }

        // Metric validations
        if (this.lines_added < 0) {
            errors.push('Lines added must be non-negative');
        }

        if (this.lines_deleted < 0) {
            errors.push('Lines deleted must be non-negative');
        }

        if (this.files_changed < 0) {
            errors.push('Files changed must be non-negative');
        }

        if (this.commits_count < 0) {
            errors.push('Commits count must be non-negative');
        }

        // Percentage validations
        if (this.test_coverage_percentage !== null && 
            (this.test_coverage_percentage < 0 || this.test_coverage_percentage > 100)) {
            errors.push('Test coverage percentage must be between 0 and 100');
        }

        if (this.quality_score !== null && 
            (this.quality_score < 0 || this.quality_score > 100)) {
            errors.push('Quality score must be between 0 and 100');
        }

        // Array validations
        if (!Array.isArray(this.assignees)) {
            errors.push('Assignees must be an array');
        }

        if (!Array.isArray(this.reviewers)) {
            errors.push('Reviewers must be an array');
        }

        if (!Array.isArray(this.labels)) {
            errors.push('Labels must be an array');
        }

        // Object validations
        if (typeof this.metadata !== 'object' || this.metadata === null) {
            errors.push('Metadata must be an object');
        }

        // Business logic warnings
        if (this.status === 'merged' && !this.merged_at) {
            warnings.push('Merged PRs should have a merge date');
        }

        if (this.status === 'closed' && !this.closed_at) {
            warnings.push('Closed PRs should have a close date');
        }

        if (this.status === 'merged' && this.merge_status !== 'merged') {
            warnings.push('Merged PRs should have merge status set to "merged"');
        }

        if (this.lines_added + this.lines_deleted > 1000) {
            warnings.push('Large PR detected (>1000 lines changed)');
        }

        if (this.files_changed > 50) {
            warnings.push('PR affects many files (>50 files)');
        }

        if (this.test_coverage_percentage !== null && this.test_coverage_percentage < 80) {
            warnings.push('Low test coverage detected (<80%)');
        }

        if (this.quality_score !== null && this.quality_score < 70) {
            warnings.push('Low quality score detected (<70)');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Convert to database format
     * @returns {Object} Database-ready object
     */
    toDatabase() {
        return {
            id: this.id,
            pr_number: this.pr_number,
            pr_url: this.pr_url,
            repository_name: this.repository_name,
            repository_url: this.repository_url,
            title: this.title,
            description: this.description,
            branch_name: this.branch_name,
            base_branch: this.base_branch,
            status: this.status,
            merge_status: this.merge_status,
            review_status: this.review_status,
            ci_status: this.ci_status,
            test_coverage_percentage: this.test_coverage_percentage,
            quality_score: this.quality_score,
            security_scan_status: this.security_scan_status,
            lines_added: this.lines_added,
            lines_deleted: this.lines_deleted,
            files_changed: this.files_changed,
            commits_count: this.commits_count,
            workflow_id: this.workflow_id,
            task_id: this.task_id,
            created_by_session_id: this.created_by_session_id,
            created_at: this.created_at,
            updated_at: this.updated_at,
            merged_at: this.merged_at,
            closed_at: this.closed_at,
            author: this.author,
            assignees: JSON.stringify(this.assignees),
            reviewers: JSON.stringify(this.reviewers),
            labels: JSON.stringify(this.labels),
            metadata: JSON.stringify(this.metadata)
        };
    }

    /**
     * Create from database row
     * @param {Object} row - Database row
     * @returns {PRTracking} PRTracking instance
     */
    static fromDatabase(row) {
        return new PRTracking({
            id: row.id,
            pr_number: row.pr_number,
            pr_url: row.pr_url,
            repository_name: row.repository_name,
            repository_url: row.repository_url,
            title: row.title,
            description: row.description,
            branch_name: row.branch_name,
            base_branch: row.base_branch,
            status: row.status,
            merge_status: row.merge_status,
            review_status: row.review_status,
            ci_status: row.ci_status,
            test_coverage_percentage: row.test_coverage_percentage,
            quality_score: row.quality_score,
            security_scan_status: row.security_scan_status,
            lines_added: row.lines_added,
            lines_deleted: row.lines_deleted,
            files_changed: row.files_changed,
            commits_count: row.commits_count,
            workflow_id: row.workflow_id,
            task_id: row.task_id,
            created_by_session_id: row.created_by_session_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
            merged_at: row.merged_at,
            closed_at: row.closed_at,
            author: row.author,
            assignees: typeof row.assignees === 'string' 
                ? JSON.parse(row.assignees) 
                : row.assignees,
            reviewers: typeof row.reviewers === 'string' 
                ? JSON.parse(row.reviewers) 
                : row.reviewers,
            labels: typeof row.labels === 'string' 
                ? JSON.parse(row.labels) 
                : row.labels,
            metadata: typeof row.metadata === 'string' 
                ? JSON.parse(row.metadata) 
                : row.metadata
        });
    }

    /**
     * Update PR status
     * @param {string} newStatus - New status
     * @param {Object} context - Update context
     */
    updateStatus(newStatus, context = {}) {
        const validStatuses = ['open', 'closed', 'merged', 'draft'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Invalid status: ${newStatus}`);
        }

        const oldStatus = this.status;
        this.status = newStatus;
        this.updated_at = new Date();

        // Set merge date for merged PRs
        if (newStatus === 'merged' && !this.merged_at) {
            this.merged_at = new Date();
            this.merge_status = 'merged';
        }

        // Set close date for closed PRs
        if (newStatus === 'closed' && !this.closed_at) {
            this.closed_at = new Date();
        }

        // Clear dates if reopening
        if (newStatus === 'open' && oldStatus !== 'open') {
            this.merged_at = null;
            this.closed_at = null;
            if (this.merge_status === 'merged') {
                this.merge_status = 'pending';
            }
        }

        return {
            oldStatus,
            newStatus,
            context
        };
    }

    /**
     * Update validation results
     * @param {Object} results - Validation results
     */
    updateValidationResults(results = {}) {
        if (results.ci_status !== undefined) {
            this.ci_status = results.ci_status;
        }

        if (results.test_coverage_percentage !== undefined) {
            this.test_coverage_percentage = results.test_coverage_percentage;
        }

        if (results.quality_score !== undefined) {
            this.quality_score = results.quality_score;
        }

        if (results.security_scan_status !== undefined) {
            this.security_scan_status = results.security_scan_status;
        }

        if (results.review_status !== undefined) {
            this.review_status = results.review_status;
        }

        if (results.merge_status !== undefined) {
            this.merge_status = results.merge_status;
        }

        this.updated_at = new Date();
    }

    /**
     * Get PR age in hours
     * @returns {number} Age in hours
     */
    getAge() {
        const now = new Date();
        const created = new Date(this.created_at);
        return Math.round((now - created) / (1000 * 60 * 60));
    }

    /**
     * Get time to merge in hours
     * @returns {number|null} Time to merge in hours
     */
    getTimeToMerge() {
        if (!this.merged_at) {
            return null;
        }
        const created = new Date(this.created_at);
        const merged = new Date(this.merged_at);
        return Math.round((merged - created) / (1000 * 60 * 60));
    }

    /**
     * Get total lines changed
     * @returns {number} Total lines changed
     */
    getTotalLinesChanged() {
        return this.lines_added + this.lines_deleted;
    }

    /**
     * Get change complexity score
     * @returns {number} Complexity score (0-100)
     */
    getChangeComplexity() {
        const totalLines = this.getTotalLinesChanged();
        const filesFactor = Math.min(this.files_changed / 10, 1); // Normalize to 0-1
        const linesFactor = Math.min(totalLines / 1000, 1); // Normalize to 0-1
        
        return Math.round((filesFactor * 0.4 + linesFactor * 0.6) * 100);
    }

    /**
     * Check if PR is ready to merge
     * @returns {boolean} True if ready to merge
     */
    isReadyToMerge() {
        return this.status === 'open' &&
               this.merge_status === 'mergeable' &&
               this.review_status === 'approved' &&
               this.ci_status === 'success' &&
               this.security_scan_status === 'passed';
    }

    /**
     * Check if PR has quality issues
     * @returns {boolean} True if has quality issues
     */
    hasQualityIssues() {
        const lowCoverage = this.test_coverage_percentage !== null && this.test_coverage_percentage < 80;
        const lowQuality = this.quality_score !== null && this.quality_score < 70;
        const failedCI = this.ci_status === 'failure';
        const failedSecurity = this.security_scan_status === 'failed';
        
        return lowCoverage || lowQuality || failedCI || failedSecurity;
    }

    /**
     * Get PR summary for display
     * @returns {Object} PR summary
     */
    getSummary() {
        return {
            id: this.id,
            pr_number: this.pr_number,
            title: this.title,
            repository_name: this.repository_name,
            status: this.status,
            merge_status: this.merge_status,
            review_status: this.review_status,
            ci_status: this.ci_status,
            security_scan_status: this.security_scan_status,
            author: this.author,
            branch_name: this.branch_name,
            age_hours: this.getAge(),
            time_to_merge_hours: this.getTimeToMerge(),
            total_lines_changed: this.getTotalLinesChanged(),
            files_changed: this.files_changed,
            change_complexity: this.getChangeComplexity(),
            test_coverage_percentage: this.test_coverage_percentage,
            quality_score: this.quality_score,
            is_ready_to_merge: this.isReadyToMerge(),
            has_quality_issues: this.hasQualityIssues(),
            labels: this.labels
        };
    }

    /**
     * Add assignee
     * @param {string} assignee - Assignee username
     */
    addAssignee(assignee) {
        if (!this.assignees.includes(assignee)) {
            this.assignees.push(assignee);
            this.updated_at = new Date();
        }
    }

    /**
     * Remove assignee
     * @param {string} assignee - Assignee username
     */
    removeAssignee(assignee) {
        const index = this.assignees.indexOf(assignee);
        if (index > -1) {
            this.assignees.splice(index, 1);
            this.updated_at = new Date();
        }
    }

    /**
     * Add reviewer
     * @param {string} reviewer - Reviewer username
     */
    addReviewer(reviewer) {
        if (!this.reviewers.includes(reviewer)) {
            this.reviewers.push(reviewer);
            this.updated_at = new Date();
        }
    }

    /**
     * Remove reviewer
     * @param {string} reviewer - Reviewer username
     */
    removeReviewer(reviewer) {
        const index = this.reviewers.indexOf(reviewer);
        if (index > -1) {
            this.reviewers.splice(index, 1);
            this.updated_at = new Date();
        }
    }

    /**
     * Add label
     * @param {string} label - Label to add
     */
    addLabel(label) {
        if (!this.labels.includes(label)) {
            this.labels.push(label);
            this.updated_at = new Date();
        }
    }

    /**
     * Remove label
     * @param {string} label - Label to remove
     */
    removeLabel(label) {
        const index = this.labels.indexOf(label);
        if (index > -1) {
            this.labels.splice(index, 1);
            this.updated_at = new Date();
        }
    }

    /**
     * Set metadata field
     * @param {string} key - Metadata key
     * @param {any} value - Metadata value
     */
    setMetadata(key, value) {
        this.metadata[key] = value;
        this.updated_at = new Date();
    }

    /**
     * Get metadata field
     * @param {string} key - Metadata key
     * @param {any} defaultValue - Default value if key not found
     * @returns {any} Metadata value
     */
    getMetadata(key, defaultValue = null) {
        return this.metadata[key] !== undefined ? this.metadata[key] : defaultValue;
    }

    /**
     * Create PR tracking from GitHub webhook data
     * @param {Object} webhookData - GitHub webhook data
     * @returns {PRTracking} PRTracking instance
     */
    static fromGitHubWebhook(webhookData) {
        const pr = webhookData.pull_request || webhookData;
        
        return new PRTracking({
            pr_number: pr.number,
            pr_url: pr.html_url,
            repository_name: pr.base.repo.full_name,
            repository_url: pr.base.repo.html_url,
            title: pr.title,
            description: pr.body,
            branch_name: pr.head.ref,
            base_branch: pr.base.ref,
            status: pr.state === 'open' ? (pr.draft ? 'draft' : 'open') : pr.state,
            author: pr.user.login,
            assignees: pr.assignees.map(a => a.login),
            reviewers: pr.requested_reviewers.map(r => r.login),
            labels: pr.labels.map(l => l.name),
            lines_added: pr.additions || 0,
            lines_deleted: pr.deletions || 0,
            files_changed: pr.changed_files || 0,
            commits_count: pr.commits || 0,
            created_at: new Date(pr.created_at),
            updated_at: new Date(pr.updated_at),
            merged_at: pr.merged_at ? new Date(pr.merged_at) : null,
            closed_at: pr.closed_at ? new Date(pr.closed_at) : null,
            metadata: {
                github_id: pr.id,
                github_node_id: pr.node_id,
                webhook_action: webhookData.action
            }
        });
    }
}

export default PRTracking;

