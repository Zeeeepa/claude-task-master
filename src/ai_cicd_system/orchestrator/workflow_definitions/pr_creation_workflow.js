/**
 * @fileoverview PR Creation Workflow Implementation
 * @description Workflow for creating and managing pull requests
 */

import { BaseWorkflow } from './base_workflow.js';

/**
 * PR Creation Workflow for handling pull request creation and management
 */
export class PRCreationWorkflow extends BaseWorkflow {
    constructor(context) {
        super(context);
        this.setupSteps();
    }

    /**
     * Validate workflow context
     * @throws {Error} If context is invalid
     */
    validateContext() {
        super.validateContext();
        
        if (!this.context.repository) {
            throw new Error('Repository information is required for PRCreationWorkflow');
        }
        
        if (!this.context.changes) {
            throw new Error('Changes information is required');
        }
        
        if (!this.context.branch) {
            throw new Error('Branch information is required');
        }
    }

    /**
     * Setup workflow steps
     * @private
     */
    setupSteps() {
        // Step 1: Prepare PR creation
        this.addStep('prepare', async (context, stepResults) => {
            const { repository, branch, changes } = context;
            
            // Prepare PR metadata
            const prMetadata = {
                repository: repository.name,
                sourceBranch: branch.source,
                targetBranch: branch.target || 'main',
                changeCount: changes.files?.length || 0,
                changeTypes: this._analyzeChangeTypes(changes),
                estimatedReviewTime: this._estimateReviewTime(changes),
                priority: context.priority || 'medium',
                createdAt: new Date()
            };
            
            // Store metadata
            this.metadata.pr = prMetadata;
            
            return {
                status: 'prepared',
                metadata: prMetadata,
                readyForCreation: true
            };
        }, {
            retryable: true,
            maxRetries: 2,
            timeout: 10000
        });

        // Step 2: Generate PR content
        this.addStep('generate_content', async (context, stepResults) => {
            const { changes, task } = context;
            const prepareResult = stepResults[0];
            
            // Generate PR title and description
            const prContent = {
                title: this._generatePRTitle(task, changes),
                description: this._generatePRDescription(task, changes),
                labels: this._generateLabels(changes, task),
                reviewers: this._suggestReviewers(changes, context),
                assignees: this._determineAssignees(context),
                milestone: context.milestone || null,
                draft: context.draft || false
            };
            
            // Update metadata
            this.metadata.content = prContent;
            
            return {
                status: 'content_generated',
                content: prContent,
                preview: this._generatePreview(prContent)
            };
        }, {
            retryable: true,
            maxRetries: 2,
            timeout: 15000
        });

        // Step 3: Validate changes
        this.addStep('validate_changes', async (context, stepResults) => {
            const { changes, repository } = context;
            
            // Perform pre-PR validation
            const validation = {
                isValid: true,
                checks: [],
                warnings: [],
                blockers: []
            };
            
            // Check for conflicts
            const conflictCheck = await this._checkForConflicts(repository, changes);
            validation.checks.push(conflictCheck);
            
            // Check file sizes
            const sizeCheck = this._checkFileSizes(changes);
            validation.checks.push(sizeCheck);
            
            // Check for sensitive data
            const sensitivityCheck = this._checkForSensitiveData(changes);
            validation.checks.push(sensitivityCheck);
            
            // Check branch status
            const branchCheck = await this._checkBranchStatus(repository, context.branch);
            validation.checks.push(branchCheck);
            
            // Determine if there are any blockers
            validation.blockers = validation.checks.filter(check => 
                check.level === 'error' && !check.passed
            );
            
            validation.warnings = validation.checks.filter(check => 
                check.level === 'warning' && !check.passed
            );
            
            validation.isValid = validation.blockers.length === 0;
            
            // Update metadata
            this.metadata.validation = validation;
            
            return {
                status: 'validated',
                validation,
                canProceed: validation.isValid,
                blockers: validation.blockers,
                warnings: validation.warnings
            };
        }, {
            retryable: true,
            maxRetries: 2,
            timeout: 30000
        });

        // Step 4: Create pull request
        this.addStep('create_pr', async (context, stepResults) => {
            const contentResult = stepResults[1];
            const validationResult = stepResults[2];
            
            if (!validationResult.canProceed) {
                throw new Error(`Cannot create PR due to validation blockers: ${
                    validationResult.blockers.map(b => b.message).join(', ')
                }`);
            }
            
            // Create the actual PR
            const prResult = await this._createPullRequest(context, contentResult.content);
            
            // Update metadata
            this.metadata.createdPR = prResult;
            
            return {
                status: 'created',
                pr: prResult,
                url: prResult.url,
                number: prResult.number
            };
        }, {
            retryable: true,
            maxRetries: 3,
            timeout: 60000
        });

        // Step 5: Configure PR settings
        this.addStep('configure_pr', async (context, stepResults) => {
            const createResult = stepResults[3];
            const pr = createResult.pr;
            
            // Configure additional PR settings
            const configuration = {
                autoMerge: context.autoMerge || false,
                deleteSourceBranch: context.deleteSourceBranch !== false,
                requireReviews: context.requireReviews !== false,
                requiredReviewers: context.requiredReviewers || 1,
                enableStatusChecks: context.enableStatusChecks !== false,
                protectedBranch: context.protectedBranch || false
            };
            
            // Apply configuration
            const configResult = await this._configurePR(pr, configuration);
            
            // Update metadata
            this.metadata.configuration = configuration;
            this.metadata.configurationResult = configResult;
            
            return {
                status: 'configured',
                configuration,
                applied: configResult.applied,
                settings: configResult.settings
            };
        }, {
            retryable: true,
            maxRetries: 2,
            timeout: 30000
        });

        // Step 6: Notify stakeholders
        this.addStep('notify', async (context, stepResults) => {
            const createResult = stepResults[3];
            const configResult = stepResults[4];
            const pr = createResult.pr;
            
            // Prepare notifications
            const notifications = {
                reviewers: this._prepareReviewerNotifications(pr, context),
                assignees: this._prepareAssigneeNotifications(pr, context),
                watchers: this._prepareWatcherNotifications(pr, context),
                integrations: this._prepareIntegrationNotifications(pr, context)
            };
            
            // Send notifications
            const notificationResults = await this._sendNotifications(notifications);
            
            // Update metadata
            this.metadata.notifications = notificationResults;
            
            return {
                status: 'notified',
                notifications: notificationResults,
                summary: this._generateNotificationSummary(notificationResults)
            };
        }, {
            retryable: true,
            maxRetries: 2,
            timeout: 20000
        });
    }

    /**
     * Build final workflow result
     * @returns {Object} Final workflow result
     */
    buildResult() {
        const baseResult = super.buildResult();
        
        return {
            ...baseResult,
            repository: this.context.repository.name,
            pr: this.metadata.createdPR || null,
            prUrl: this.metadata.createdPR?.url || null,
            prNumber: this.metadata.createdPR?.number || null,
            validation: this.metadata.validation || {},
            configuration: this.metadata.configuration || {},
            notifications: this.metadata.notifications || {}
        };
    }

    /**
     * Analyze change types
     * @param {Object} changes - Changes object
     * @returns {Object} Change type analysis
     * @private
     */
    _analyzeChangeTypes(changes) {
        const types = {
            added: 0,
            modified: 0,
            deleted: 0,
            renamed: 0
        };
        
        if (changes.files) {
            changes.files.forEach(file => {
                if (file.status === 'added') types.added++;
                else if (file.status === 'modified') types.modified++;
                else if (file.status === 'deleted') types.deleted++;
                else if (file.status === 'renamed') types.renamed++;
            });
        }
        
        return types;
    }

    /**
     * Estimate review time
     * @param {Object} changes - Changes object
     * @returns {number} Estimated review time in minutes
     * @private
     */
    _estimateReviewTime(changes) {
        const fileCount = changes.files?.length || 0;
        const linesChanged = changes.stats?.total || 0;
        
        // Base time: 5 minutes per file + 1 minute per 10 lines
        let estimatedMinutes = (fileCount * 5) + Math.ceil(linesChanged / 10);
        
        // Minimum 10 minutes, maximum 120 minutes
        return Math.max(10, Math.min(120, estimatedMinutes));
    }

    /**
     * Generate PR title
     * @param {Object} task - Task information
     * @param {Object} changes - Changes information
     * @returns {string} PR title
     * @private
     */
    _generatePRTitle(task, changes) {
        if (task && task.title) {
            return task.title;
        }
        
        const changeTypes = this._analyzeChangeTypes(changes);
        const fileCount = changes.files?.length || 0;
        
        if (changeTypes.added > 0 && changeTypes.modified === 0 && changeTypes.deleted === 0) {
            return `Add ${fileCount} new file${fileCount > 1 ? 's' : ''}`;
        } else if (changeTypes.modified > 0 && changeTypes.added === 0 && changeTypes.deleted === 0) {
            return `Update ${fileCount} file${fileCount > 1 ? 's' : ''}`;
        } else if (changeTypes.deleted > 0 && changeTypes.added === 0 && changeTypes.modified === 0) {
            return `Remove ${fileCount} file${fileCount > 1 ? 's' : ''}`;
        } else {
            return `Update codebase (${fileCount} files changed)`;
        }
    }

    /**
     * Generate PR description
     * @param {Object} task - Task information
     * @param {Object} changes - Changes information
     * @returns {string} PR description
     * @private
     */
    _generatePRDescription(task, changes) {
        let description = '';
        
        if (task && task.description) {
            description += `## Description\n${task.description}\n\n`;
        }
        
        // Add changes summary
        const changeTypes = this._analyzeChangeTypes(changes);
        description += '## Changes\n';
        
        if (changeTypes.added > 0) {
            description += `- Added ${changeTypes.added} file${changeTypes.added > 1 ? 's' : ''}\n`;
        }
        if (changeTypes.modified > 0) {
            description += `- Modified ${changeTypes.modified} file${changeTypes.modified > 1 ? 's' : ''}\n`;
        }
        if (changeTypes.deleted > 0) {
            description += `- Deleted ${changeTypes.deleted} file${changeTypes.deleted > 1 ? 's' : ''}\n`;
        }
        if (changeTypes.renamed > 0) {
            description += `- Renamed ${changeTypes.renamed} file${changeTypes.renamed > 1 ? 's' : ''}\n`;
        }
        
        // Add file list if not too many
        if (changes.files && changes.files.length <= 10) {
            description += '\n## Files Changed\n';
            changes.files.forEach(file => {
                description += `- \`${file.path}\` (${file.status})\n`;
            });
        }
        
        // Add testing notes
        description += '\n## Testing\n';
        description += '- [ ] Unit tests pass\n';
        description += '- [ ] Integration tests pass\n';
        description += '- [ ] Manual testing completed\n';
        
        return description;
    }

    /**
     * Generate labels for PR
     * @param {Object} changes - Changes information
     * @param {Object} task - Task information
     * @returns {Array<string>} Labels
     * @private
     */
    _generateLabels(changes, task) {
        const labels = [];
        
        // Size labels
        const fileCount = changes.files?.length || 0;
        if (fileCount <= 3) labels.push('size/small');
        else if (fileCount <= 10) labels.push('size/medium');
        else labels.push('size/large');
        
        // Type labels based on file extensions
        const extensions = new Set();
        if (changes.files) {
            changes.files.forEach(file => {
                const ext = file.path.split('.').pop();
                extensions.add(ext);
            });
        }
        
        if (extensions.has('js') || extensions.has('ts')) labels.push('javascript');
        if (extensions.has('py')) labels.push('python');
        if (extensions.has('md')) labels.push('documentation');
        if (extensions.has('json') || extensions.has('yml') || extensions.has('yaml')) labels.push('configuration');
        
        // Task-based labels
        if (task) {
            if (task.type === 'bug') labels.push('bug');
            if (task.type === 'feature') labels.push('enhancement');
            if (task.priority === 'high') labels.push('priority/high');
        }
        
        return labels;
    }

    /**
     * Suggest reviewers
     * @param {Object} changes - Changes information
     * @param {Object} context - Workflow context
     * @returns {Array<string>} Suggested reviewers
     * @private
     */
    _suggestReviewers(changes, context) {
        const reviewers = [];
        
        // Add explicit reviewers from context
        if (context.reviewers) {
            reviewers.push(...context.reviewers);
        }
        
        // Add code owners based on file paths (mock implementation)
        if (changes.files) {
            const codeOwners = this._getCodeOwners(changes.files);
            reviewers.push(...codeOwners);
        }
        
        // Remove duplicates and current user
        const uniqueReviewers = [...new Set(reviewers)];
        return uniqueReviewers.filter(reviewer => reviewer !== context.currentUser);
    }

    /**
     * Determine assignees
     * @param {Object} context - Workflow context
     * @returns {Array<string>} Assignees
     * @private
     */
    _determineAssignees(context) {
        if (context.assignees) {
            return context.assignees;
        }
        
        // Default to current user or task assignee
        if (context.task && context.task.assignee) {
            return [context.task.assignee];
        }
        
        if (context.currentUser) {
            return [context.currentUser];
        }
        
        return [];
    }

    /**
     * Check for conflicts
     * @param {Object} repository - Repository information
     * @param {Object} changes - Changes information
     * @returns {Promise<Object>} Conflict check result
     * @private
     */
    async _checkForConflicts(repository, changes) {
        // Mock implementation - in real scenario, check with Git API
        const hasConflicts = Math.random() < 0.1; // 10% chance of conflicts
        
        return {
            name: 'Merge Conflicts',
            passed: !hasConflicts,
            level: hasConflicts ? 'error' : 'info',
            message: hasConflicts ? 'Merge conflicts detected' : 'No merge conflicts'
        };
    }

    /**
     * Check file sizes
     * @param {Object} changes - Changes information
     * @returns {Object} File size check result
     * @private
     */
    _checkFileSizes(changes) {
        const maxFileSize = 1024 * 1024; // 1MB
        const largeFiles = [];
        
        if (changes.files) {
            changes.files.forEach(file => {
                if (file.size && file.size > maxFileSize) {
                    largeFiles.push(file.path);
                }
            });
        }
        
        return {
            name: 'File Sizes',
            passed: largeFiles.length === 0,
            level: largeFiles.length > 0 ? 'warning' : 'info',
            message: largeFiles.length > 0 ? 
                `Large files detected: ${largeFiles.join(', ')}` : 
                'All files within size limits'
        };
    }

    /**
     * Check for sensitive data
     * @param {Object} changes - Changes information
     * @returns {Object} Sensitivity check result
     * @private
     */
    _checkForSensitiveData(changes) {
        const sensitivePatterns = [
            /password\s*=\s*["'][^"']+["']/i,
            /api[_-]?key\s*=\s*["'][^"']+["']/i,
            /secret\s*=\s*["'][^"']+["']/i,
            /token\s*=\s*["'][^"']+["']/i
        ];
        
        const sensitiveFiles = [];
        
        if (changes.files) {
            changes.files.forEach(file => {
                if (file.content) {
                    const hasSensitiveData = sensitivePatterns.some(pattern => 
                        pattern.test(file.content)
                    );
                    if (hasSensitiveData) {
                        sensitiveFiles.push(file.path);
                    }
                }
            });
        }
        
        return {
            name: 'Sensitive Data',
            passed: sensitiveFiles.length === 0,
            level: sensitiveFiles.length > 0 ? 'error' : 'info',
            message: sensitiveFiles.length > 0 ? 
                `Potential sensitive data in: ${sensitiveFiles.join(', ')}` : 
                'No sensitive data detected'
        };
    }

    /**
     * Check branch status
     * @param {Object} repository - Repository information
     * @param {Object} branch - Branch information
     * @returns {Promise<Object>} Branch status check result
     * @private
     */
    async _checkBranchStatus(repository, branch) {
        // Mock implementation - in real scenario, check with Git API
        const isUpToDate = Math.random() < 0.8; // 80% chance of being up to date
        
        return {
            name: 'Branch Status',
            passed: isUpToDate,
            level: isUpToDate ? 'info' : 'warning',
            message: isUpToDate ? 
                'Branch is up to date with target' : 
                'Branch may need to be updated with latest changes'
        };
    }

    /**
     * Create pull request (mock implementation)
     * @param {Object} context - Workflow context
     * @param {Object} content - PR content
     * @returns {Promise<Object>} Created PR information
     * @private
     */
    async _createPullRequest(context, content) {
        // Mock implementation - in real scenario, use Git API
        const prNumber = Math.floor(Math.random() * 1000) + 1;
        const prUrl = `https://github.com/${context.repository.owner}/${context.repository.name}/pull/${prNumber}`;
        
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return {
            number: prNumber,
            url: prUrl,
            title: content.title,
            description: content.description,
            labels: content.labels,
            reviewers: content.reviewers,
            assignees: content.assignees,
            draft: content.draft,
            createdAt: new Date(),
            state: 'open'
        };
    }

    /**
     * Configure PR settings (mock implementation)
     * @param {Object} pr - PR information
     * @param {Object} configuration - Configuration settings
     * @returns {Promise<Object>} Configuration result
     * @private
     */
    async _configurePR(pr, configuration) {
        // Mock implementation - in real scenario, configure via API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
            applied: true,
            settings: configuration,
            warnings: configuration.autoMerge ? 
                ['Auto-merge enabled - ensure proper review process'] : []
        };
    }

    /**
     * Send notifications (mock implementation)
     * @param {Object} notifications - Notification configuration
     * @returns {Promise<Object>} Notification results
     * @private
     */
    async _sendNotifications(notifications) {
        // Mock implementation - in real scenario, send actual notifications
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return {
            reviewers: {
                sent: notifications.reviewers.length,
                failed: 0,
                recipients: notifications.reviewers
            },
            assignees: {
                sent: notifications.assignees.length,
                failed: 0,
                recipients: notifications.assignees
            },
            integrations: {
                sent: notifications.integrations.length,
                failed: 0,
                services: notifications.integrations.map(i => i.service)
            }
        };
    }

    // Helper methods
    _generatePreview(content) {
        return {
            title: content.title,
            descriptionPreview: content.description.substring(0, 200) + '...',
            labelCount: content.labels.length,
            reviewerCount: content.reviewers.length
        };
    }

    _getCodeOwners(files) {
        // Mock implementation - in real scenario, parse CODEOWNERS file
        const owners = [];
        
        files.forEach(file => {
            if (file.path.includes('frontend/')) owners.push('frontend-team');
            if (file.path.includes('backend/')) owners.push('backend-team');
            if (file.path.includes('docs/')) owners.push('docs-team');
        });
        
        return [...new Set(owners)];
    }

    _prepareReviewerNotifications(pr, context) {
        return pr.reviewers.map(reviewer => ({
            recipient: reviewer,
            type: 'review_request',
            prUrl: pr.url,
            prTitle: pr.title
        }));
    }

    _prepareAssigneeNotifications(pr, context) {
        return pr.assignees.map(assignee => ({
            recipient: assignee,
            type: 'assignment',
            prUrl: pr.url,
            prTitle: pr.title
        }));
    }

    _prepareWatcherNotifications(pr, context) {
        const watchers = context.watchers || [];
        return watchers.map(watcher => ({
            recipient: watcher,
            type: 'pr_created',
            prUrl: pr.url,
            prTitle: pr.title
        }));
    }

    _prepareIntegrationNotifications(pr, context) {
        const integrations = context.integrations || [];
        return integrations.map(integration => ({
            service: integration.service,
            webhook: integration.webhook,
            type: 'pr_created',
            payload: {
                pr: pr,
                repository: context.repository
            }
        }));
    }

    _generateNotificationSummary(results) {
        const total = results.reviewers.sent + results.assignees.sent + results.integrations.sent;
        const failed = results.reviewers.failed + results.assignees.failed + results.integrations.failed;
        
        return {
            totalSent: total,
            totalFailed: failed,
            successRate: total > 0 ? ((total - failed) / total) * 100 : 100
        };
    }
}

export default PRCreationWorkflow;

