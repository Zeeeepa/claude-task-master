/**
 * @fileoverview PR tracking and status management system
 * Tracks PR creation, status updates, and provides workflow visibility
 */

import { PR_STATUS } from './types.js';

/**
 * PRTracker class for managing PR lifecycle and status tracking
 */
export class PRTracker {
    constructor(options = {}) {
        this.options = {
            storageBackend: options.storageBackend || 'memory',
            githubToken: options.githubToken || process.env.GITHUB_TOKEN,
            webhookSecret: options.webhookSecret || process.env.WEBHOOK_SECRET,
            ...options
        };

        // In-memory storage for demo purposes
        // In production, this would be replaced with a database
        this.prStorage = new Map();
        this.taskToPrMapping = new Map();
    }

    /**
     * Track a new PR creation
     * @param {string} taskId - Associated task ID
     * @param {PRInfo} prInfo - PR information
     * @returns {Promise<void>}
     */
    async trackPRCreation(taskId, prInfo) {
        const trackingData = {
            task_id: taskId,
            pr_info: prInfo,
            created_at: new Date().toISOString(),
            last_updated: new Date().toISOString(),
            status_history: [{
                status: prInfo.status,
                timestamp: new Date().toISOString(),
                source: 'creation'
            }],
            checks: [],
            review_comments: [],
            is_mergeable: null,
            merge_conflicts: false
        };

        this.prStorage.set(prInfo.pr_url, trackingData);
        this.taskToPrMapping.set(taskId, prInfo.pr_url);

        console.log(`Tracking PR ${prInfo.pr_number} for task ${taskId}`);
    }

    /**
     * Update PR status
     * @param {string} prUrl - PR URL
     * @param {string} newStatus - New status
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<void>}
     */
    async updatePRStatus(prUrl, newStatus, metadata = {}) {
        const trackingData = this.prStorage.get(prUrl);
        if (!trackingData) {
            throw new Error(`PR not found: ${prUrl}`);
        }

        trackingData.pr_info.status = newStatus;
        trackingData.last_updated = new Date().toISOString();
        trackingData.status_history.push({
            status: newStatus,
            timestamp: new Date().toISOString(),
            source: metadata.source || 'manual',
            details: metadata.details
        });

        this.prStorage.set(prUrl, trackingData);
        console.log(`Updated PR ${trackingData.pr_info.pr_number} status to ${newStatus}`);
    }

    /**
     * Get PR status for a task
     * @param {string} taskId - Task ID
     * @returns {Promise<PRStatus|null>} PR status or null if not found
     */
    async getPRStatus(taskId) {
        const prUrl = this.taskToPrMapping.get(taskId);
        if (!prUrl) {
            return null;
        }

        const trackingData = this.prStorage.get(prUrl);
        if (!trackingData) {
            return null;
        }

        return {
            task_id: taskId,
            pr_url: prUrl,
            pr_number: trackingData.pr_info.pr_number,
            status: trackingData.pr_info.status,
            checks: trackingData.checks,
            review_comments: trackingData.review_comments,
            is_mergeable: trackingData.is_mergeable
        };
    }

    /**
     * Add check result to PR tracking
     * @param {string} prUrl - PR URL
     * @param {Object} checkResult - Check result data
     * @returns {Promise<void>}
     */
    async addCheckResult(prUrl, checkResult) {
        const trackingData = this.prStorage.get(prUrl);
        if (!trackingData) {
            throw new Error(`PR not found: ${prUrl}`);
        }

        const check = {
            name: checkResult.name,
            status: checkResult.status,
            conclusion: checkResult.conclusion,
            details_url: checkResult.details_url,
            timestamp: new Date().toISOString()
        };

        trackingData.checks.push(check);
        trackingData.last_updated = new Date().toISOString();

        // Update mergeability based on checks
        this._updateMergeability(trackingData);

        this.prStorage.set(prUrl, trackingData);
        console.log(`Added check result for PR ${trackingData.pr_info.pr_number}: ${check.name} - ${check.conclusion}`);
    }

    /**
     * Add review comment to PR tracking
     * @param {string} prUrl - PR URL
     * @param {Object} comment - Review comment data
     * @returns {Promise<void>}
     */
    async addReviewComment(prUrl, comment) {
        const trackingData = this.prStorage.get(prUrl);
        if (!trackingData) {
            throw new Error(`PR not found: ${prUrl}`);
        }

        const reviewComment = {
            author: comment.author,
            body: comment.body,
            state: comment.state,
            timestamp: new Date().toISOString(),
            line: comment.line,
            path: comment.path
        };

        trackingData.review_comments.push(reviewComment);
        trackingData.last_updated = new Date().toISOString();

        this.prStorage.set(prUrl, trackingData);
        console.log(`Added review comment for PR ${trackingData.pr_info.pr_number}`);
    }

    /**
     * Get all tracked PRs
     * @returns {Promise<Object[]>} Array of all tracked PRs
     */
    async getAllTrackedPRs() {
        return Array.from(this.prStorage.values());
    }

    /**
     * Get PRs by status
     * @param {string} status - PR status to filter by
     * @returns {Promise<Object[]>} Array of PRs with the specified status
     */
    async getPRsByStatus(status) {
        const allPRs = await this.getAllTrackedPRs();
        return allPRs.filter(pr => pr.pr_info.status === status);
    }

    /**
     * Get PR statistics
     * @returns {Promise<Object>} PR statistics
     */
    async getPRStatistics() {
        const allPRs = await this.getAllTrackedPRs();
        
        const stats = {
            total: allPRs.length,
            by_status: {},
            average_time_to_merge: null,
            success_rate: 0
        };

        // Count by status
        for (const status of Object.values(PR_STATUS)) {
            stats.by_status[status] = allPRs.filter(pr => pr.pr_info.status === status).length;
        }

        // Calculate success rate
        const merged = stats.by_status[PR_STATUS.MERGED] || 0;
        const closed = stats.by_status[PR_STATUS.CLOSED] || 0;
        const total = merged + closed;
        
        if (total > 0) {
            stats.success_rate = (merged / total) * 100;
        }

        return stats;
    }

    /**
     * Handle GitHub webhook events
     * @param {Object} event - GitHub webhook event
     * @returns {Promise<void>}
     */
    async handleWebhookEvent(event) {
        const { action, pull_request } = event;
        
        if (!pull_request) {
            return;
        }

        const prUrl = pull_request.html_url;
        
        switch (action) {
            case 'opened':
                // PR might already be tracked from creation
                break;
                
            case 'closed':
                if (pull_request.merged) {
                    await this.updatePRStatus(prUrl, PR_STATUS.MERGED, {
                        source: 'webhook',
                        details: 'PR was merged'
                    });
                } else {
                    await this.updatePRStatus(prUrl, PR_STATUS.CLOSED, {
                        source: 'webhook',
                        details: 'PR was closed without merging'
                    });
                }
                break;
                
            case 'reopened':
                await this.updatePRStatus(prUrl, PR_STATUS.OPEN, {
                    source: 'webhook',
                    details: 'PR was reopened'
                });
                break;
                
            case 'synchronize':
                // New commits pushed to PR
                await this._handlePRUpdate(prUrl, event);
                break;
        }
    }

    /**
     * Handle check suite events
     * @param {Object} event - GitHub check suite event
     * @returns {Promise<void>}
     */
    async handleCheckSuiteEvent(event) {
        const { action, check_suite, pull_requests } = event;
        
        if (!pull_requests || pull_requests.length === 0) {
            return;
        }

        for (const pr of pull_requests) {
            const prUrl = pr.html_url;
            
            if (this.prStorage.has(prUrl)) {
                await this.addCheckResult(prUrl, {
                    name: check_suite.app.name,
                    status: check_suite.status,
                    conclusion: check_suite.conclusion,
                    details_url: check_suite.html_url
                });
            }
        }
    }

    /**
     * Update mergeability status based on checks
     * @private
     * @param {Object} trackingData - PR tracking data
     */
    _updateMergeability(trackingData) {
        const checks = trackingData.checks;
        
        if (checks.length === 0) {
            trackingData.is_mergeable = null;
            return;
        }

        // Check if all checks have passed
        const allPassed = checks.every(check => 
            check.conclusion === 'success' || check.conclusion === 'neutral'
        );
        
        const anyFailed = checks.some(check => 
            check.conclusion === 'failure' || check.conclusion === 'cancelled'
        );

        if (anyFailed) {
            trackingData.is_mergeable = false;
        } else if (allPassed) {
            trackingData.is_mergeable = true;
        } else {
            trackingData.is_mergeable = null; // Still pending
        }
    }

    /**
     * Handle PR update events
     * @private
     * @param {string} prUrl - PR URL
     * @param {Object} event - Webhook event
     */
    async _handlePRUpdate(prUrl, event) {
        const trackingData = this.prStorage.get(prUrl);
        if (!trackingData) {
            return;
        }

        trackingData.last_updated = new Date().toISOString();
        
        // Reset check status since new commits were pushed
        trackingData.checks = [];
        trackingData.is_mergeable = null;
        
        this.prStorage.set(prUrl, trackingData);
    }

    /**
     * Clean up old PR tracking data
     * @param {number} daysOld - Remove data older than this many days
     * @returns {Promise<number>} Number of records cleaned up
     */
    async cleanupOldData(daysOld = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        
        let cleanedCount = 0;
        
        for (const [prUrl, trackingData] of this.prStorage.entries()) {
            const lastUpdated = new Date(trackingData.last_updated);
            
            if (lastUpdated < cutoffDate) {
                this.prStorage.delete(prUrl);
                
                // Remove from task mapping
                for (const [taskId, mappedPrUrl] of this.taskToPrMapping.entries()) {
                    if (mappedPrUrl === prUrl) {
                        this.taskToPrMapping.delete(taskId);
                        break;
                    }
                }
                
                cleanedCount++;
            }
        }
        
        console.log(`Cleaned up ${cleanedCount} old PR tracking records`);
        return cleanedCount;
    }
}

/**
 * Create a new PR tracker instance
 * @param {Object} options - Configuration options
 * @returns {PRTracker} New PR tracker instance
 */
export function createPRTracker(options = {}) {
    return new PRTracker(options);
}

export default PRTracker;

