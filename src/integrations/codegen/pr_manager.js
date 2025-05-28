/**
 * @fileoverview Codegen PR Manager
 * @description Handles automated PR creation, branch management, and GitHub integration
 */

import { EventEmitter } from 'events';
import { Octokit } from '@octokit/rest';

/**
 * PR Manager for Codegen Integration
 * Manages automated pull request creation and GitHub operations
 */
export class PRManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            github: {
                token: config.github?.token || process.env.GITHUB_TOKEN,
                owner: config.github?.owner || 'Zeeeepa',
                repo: config.github?.repo || 'claude-task-master',
                baseURL: config.github?.baseURL || 'https://api.github.com'
            },
            branches: {
                prefix: config.branches?.prefix || 'codegen/task-',
                baseBranch: config.branches?.baseBranch || 'main',
                autoDelete: config.branches?.autoDelete !== false
            },
            pr: {
                autoAssign: config.pr?.autoAssign !== false,
                defaultReviewers: config.pr?.defaultReviewers || [],
                labels: config.pr?.labels || ['codegen', 'automated'],
                draft: config.pr?.draft || false
            },
            commits: {
                messageTemplate: config.commits?.messageTemplate || 'feat: {{TASK_TITLE}}\n\n{{TASK_DESCRIPTION}}',
                signOff: config.commits?.signOff || false,
                gpgSign: config.commits?.gpgSign || false
            },
            ...config
        };

        this.octokit = null;
        this.isInitialized = false;
        this.activePRs = new Map();
        
        // Metrics
        this.metrics = {
            prsCreated: 0,
            prsFailed: 0,
            branchesCreated: 0,
            commitsCreated: 0,
            successRate: 0
        };
    }

    /**
     * Initialize the PR manager
     */
    async initialize() {
        try {
            console.log('🔀 Initializing PR manager...');
            
            this._validateConfig();
            this._initializeOctokit();
            await this._validateGitHubConnection();
            
            this.isInitialized = true;
            console.log('✅ PR manager initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize PR manager:', error);
            throw error;
        }
    }

    /**
     * Validate configuration
     * @private
     */
    _validateConfig() {
        if (!this.config.github.token) {
            throw new Error('GitHub token is required');
        }
        
        if (!this.config.github.owner || !this.config.github.repo) {
            throw new Error('GitHub owner and repository are required');
        }
    }

    /**
     * Initialize Octokit GitHub client
     * @private
     */
    _initializeOctokit() {
        this.octokit = new Octokit({
            auth: this.config.github.token,
            baseUrl: this.config.github.baseURL
        });
    }

    /**
     * Validate GitHub connection
     * @private
     */
    async _validateGitHubConnection() {
        try {
            const { data: repo } = await this.octokit.rest.repos.get({
                owner: this.config.github.owner,
                repo: this.config.github.repo
            });

            console.log(`✅ Connected to GitHub repository: ${repo.full_name}`);
            
        } catch (error) {
            throw new Error(`Failed to connect to GitHub repository: ${error.message}`);
        }
    }

    /**
     * Create a pull request from a Codegen prompt
     * @param {Object} prompt - Generated prompt object
     * @param {Object} task - Original task object
     * @returns {Promise<Object>} PR creation result
     */
    async createPR(prompt, task) {
        if (!this.isInitialized) {
            throw new Error('PR manager not initialized');
        }

        const startTime = Date.now();
        const taskId = task.id;

        try {
            console.log(`🔀 Creating PR for task ${taskId}: ${task.title}`);

            // Generate branch name
            const branchName = this._generateBranchName(task);

            // Create branch
            await this._createBranch(branchName);

            // Generate commit message
            const commitMessage = this._generateCommitMessage(task);

            // Create initial commit with Codegen prompt
            const commitSha = await this._createCommit(branchName, commitMessage, prompt, task);

            // Create pull request
            const prData = await this._createPullRequest(branchName, task, prompt);

            // Configure PR settings
            await this._configurePR(prData.number, task);

            const result = {
                success: true,
                url: prData.html_url,
                number: prData.number,
                branchName,
                commitSha,
                taskId,
                createdAt: new Date().toISOString(),
                processingTime: Date.now() - startTime
            };

            // Track active PR
            this.activePRs.set(taskId, result);

            // Update metrics
            this._updateMetrics(true);

            this.emit('pr_created', result);
            console.log(`✅ Created PR #${prData.number} for task ${taskId}: ${prData.html_url}`);

            return result;

        } catch (error) {
            console.error(`❌ Failed to create PR for task ${taskId}:`, error);
            
            this._updateMetrics(false);
            
            const errorResult = {
                success: false,
                taskId,
                error: error.message,
                processingTime: Date.now() - startTime,
                timestamp: new Date().toISOString()
            };

            this.emit('pr_failed', errorResult);
            throw error;
        }
    }

    /**
     * Generate branch name for task
     * @param {Object} task - Task object
     * @returns {string} Branch name
     * @private
     */
    _generateBranchName(task) {
        const sanitizedTitle = task.title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .substring(0, 50);

        return `${this.config.branches.prefix}${task.id}-${sanitizedTitle}`;
    }

    /**
     * Create a new branch
     * @param {string} branchName - Branch name
     * @returns {Promise<string>} Branch SHA
     * @private
     */
    async _createBranch(branchName) {
        try {
            // Get base branch reference
            const { data: baseBranch } = await this.octokit.rest.git.getRef({
                owner: this.config.github.owner,
                repo: this.config.github.repo,
                ref: `heads/${this.config.branches.baseBranch}`
            });

            // Create new branch
            await this.octokit.rest.git.createRef({
                owner: this.config.github.owner,
                repo: this.config.github.repo,
                ref: `refs/heads/${branchName}`,
                sha: baseBranch.object.sha
            });

            this.metrics.branchesCreated++;
            console.log(`✅ Created branch: ${branchName}`);
            
            return baseBranch.object.sha;

        } catch (error) {
            if (error.status === 422) {
                // Branch already exists, get its SHA
                const { data: existingBranch } = await this.octokit.rest.git.getRef({
                    owner: this.config.github.owner,
                    repo: this.config.github.repo,
                    ref: `heads/${branchName}`
                });
                
                console.log(`⚠️ Branch ${branchName} already exists, using existing branch`);
                return existingBranch.object.sha;
            }
            
            throw new Error(`Failed to create branch ${branchName}: ${error.message}`);
        }
    }

    /**
     * Generate commit message from task
     * @param {Object} task - Task object
     * @returns {string} Commit message
     * @private
     */
    _generateCommitMessage(task) {
        let message = this.config.commits.messageTemplate;

        // Replace template variables
        const variables = {
            TASK_ID: task.id,
            TASK_TITLE: task.title || 'Untitled Task',
            TASK_DESCRIPTION: task.description || 'No description provided',
            TASK_PRIORITY: task.priority || 'medium',
            TIMESTAMP: new Date().toISOString()
        };

        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            message = message.replace(regex, value);
        }

        // Add sign-off if configured
        if (this.config.commits.signOff) {
            message += '\n\nSigned-off-by: Codegen Bot <codegen@claude-task-master>';
        }

        return message;
    }

    /**
     * Create commit with Codegen prompt
     * @param {string} branchName - Branch name
     * @param {string} commitMessage - Commit message
     * @param {Object} prompt - Generated prompt
     * @param {Object} task - Task object
     * @returns {Promise<string>} Commit SHA
     * @private
     */
    async _createCommit(branchName, commitMessage, prompt, task) {
        try {
            // Get current branch reference
            const { data: branchRef } = await this.octokit.rest.git.getRef({
                owner: this.config.github.owner,
                repo: this.config.github.repo,
                ref: `heads/${branchName}`
            });

            // Create file content for the Codegen prompt
            const promptFileName = `codegen-prompts/task-${task.id}-prompt.md`;
            const promptContent = this._generatePromptFile(prompt, task);

            // Get base tree
            const { data: baseCommit } = await this.octokit.rest.git.getCommit({
                owner: this.config.github.owner,
                repo: this.config.github.repo,
                commit_sha: branchRef.object.sha
            });

            // Create blob for prompt file
            const { data: blob } = await this.octokit.rest.git.createBlob({
                owner: this.config.github.owner,
                repo: this.config.github.repo,
                content: Buffer.from(promptContent).toString('base64'),
                encoding: 'base64'
            });

            // Create tree with new file
            const { data: tree } = await this.octokit.rest.git.createTree({
                owner: this.config.github.owner,
                repo: this.config.github.repo,
                base_tree: baseCommit.tree.sha,
                tree: [
                    {
                        path: promptFileName,
                        mode: '100644',
                        type: 'blob',
                        sha: blob.sha
                    }
                ]
            });

            // Create commit
            const { data: commit } = await this.octokit.rest.git.createCommit({
                owner: this.config.github.owner,
                repo: this.config.github.repo,
                message: commitMessage,
                tree: tree.sha,
                parents: [branchRef.object.sha]
            });

            // Update branch reference
            await this.octokit.rest.git.updateRef({
                owner: this.config.github.owner,
                repo: this.config.github.repo,
                ref: `heads/${branchName}`,
                sha: commit.sha
            });

            this.metrics.commitsCreated++;
            console.log(`✅ Created commit: ${commit.sha}`);
            
            return commit.sha;

        } catch (error) {
            throw new Error(`Failed to create commit: ${error.message}`);
        }
    }

    /**
     * Generate prompt file content
     * @param {Object} prompt - Generated prompt
     * @param {Object} task - Task object
     * @returns {string} File content
     * @private
     */
    _generatePromptFile(prompt, task) {
        return `# Codegen Task Prompt

**Task ID**: ${task.id}  
**Generated**: ${new Date().toISOString()}  
**Template**: ${prompt.metadata.template}  
**Task Type**: ${prompt.metadata.taskType}  

## Original Task
- **Title**: ${task.title}
- **Priority**: ${task.priority || 'medium'}
- **Labels**: ${(task.labels || []).join(', ') || 'none'}

## Generated Prompt

${prompt.content}

## Metadata

\`\`\`json
${JSON.stringify(prompt.metadata, null, 2)}
\`\`\`

---
*This file was automatically generated by the Codegen integration system.*
`;
    }

    /**
     * Create pull request
     * @param {string} branchName - Branch name
     * @param {Object} task - Task object
     * @param {Object} prompt - Generated prompt
     * @returns {Promise<Object>} PR data
     * @private
     */
    async _createPullRequest(branchName, task, prompt) {
        try {
            const title = this._generatePRTitle(task);
            const body = this._generatePRBody(task, prompt);

            const { data: pr } = await this.octokit.rest.pulls.create({
                owner: this.config.github.owner,
                repo: this.config.github.repo,
                title,
                body,
                head: branchName,
                base: this.config.branches.baseBranch,
                draft: this.config.pr.draft
            });

            console.log(`✅ Created pull request: ${pr.html_url}`);
            return pr;

        } catch (error) {
            throw new Error(`Failed to create pull request: ${error.message}`);
        }
    }

    /**
     * Generate PR title
     * @param {Object} task - Task object
     * @returns {string} PR title
     * @private
     */
    _generatePRTitle(task) {
        const prefix = this._getPRPrefix(task);
        return `${prefix}: ${task.title}`;
    }

    /**
     * Get PR prefix based on task type
     * @param {Object} task - Task object
     * @returns {string} PR prefix
     * @private
     */
    _getPRPrefix(task) {
        const labels = (task.labels || []).map(l => l.toLowerCase());
        
        if (labels.includes('bug') || labels.includes('bugfix')) return 'fix';
        if (labels.includes('feature') || labels.includes('enhancement')) return 'feat';
        if (labels.includes('docs') || labels.includes('documentation')) return 'docs';
        if (labels.includes('test') || labels.includes('testing')) return 'test';
        if (labels.includes('refactor')) return 'refactor';
        
        return 'feat'; // default
    }

    /**
     * Generate PR body
     * @param {Object} task - Task object
     * @param {Object} prompt - Generated prompt
     * @returns {string} PR body
     * @private
     */
    _generatePRBody(task, prompt) {
        return `## Task Information

**Task ID**: ${task.id}  
**Priority**: ${task.priority || 'medium'}  
**Labels**: ${(task.labels || []).join(', ') || 'none'}  

## Description

${task.description || 'No description provided'}

## Acceptance Criteria

${this._formatAcceptanceCriteria(task.acceptance_criteria)}

## Technical Requirements

${this._formatTechnicalRequirements(task.technical_requirements)}

## Implementation Notes

This PR was automatically generated by the Codegen integration system using the following prompt template: **${prompt.metadata.template}**

### Quality Requirements
${this._formatQualityRequirements(prompt.metadata.quality)}

### Context Information
- **Files included in context**: ${prompt.metadata.context.filesIncluded}
- **Dependencies included**: ${prompt.metadata.context.dependenciesIncluded}
- **Prompt length**: ${prompt.metadata.context.contextLength} characters

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review of code completed
- [ ] Code is commented, particularly in hard-to-understand areas
- [ ] Corresponding changes to documentation made
- [ ] Tests added that prove the fix is effective or feature works
- [ ] New and existing unit tests pass locally
- [ ] Any dependent changes have been merged and published

---

**Generated by**: Codegen Integration System  
**Timestamp**: ${new Date().toISOString()}  
**Task Link**: [View Task Details](${this._getTaskUrl(task)})
`;
    }

    /**
     * Format acceptance criteria
     * @param {Array} criteria - Acceptance criteria
     * @returns {string} Formatted criteria
     * @private
     */
    _formatAcceptanceCriteria(criteria) {
        if (!criteria || criteria.length === 0) {
            return 'No specific acceptance criteria provided.';
        }

        return criteria.map(criterion => `- [ ] ${criterion}`).join('\n');
    }

    /**
     * Format technical requirements
     * @param {Array} requirements - Technical requirements
     * @returns {string} Formatted requirements
     * @private
     */
    _formatTechnicalRequirements(requirements) {
        if (!requirements || requirements.length === 0) {
            return 'No specific technical requirements provided.';
        }

        return requirements.map(req => `- ${req}`).join('\n');
    }

    /**
     * Format quality requirements
     * @param {Object} quality - Quality requirements
     * @returns {string} Formatted quality requirements
     * @private
     */
    _formatQualityRequirements(quality) {
        const items = [];
        
        if (quality.tests) items.push('✅ Tests required');
        if (quality.documentation) items.push('📚 Documentation required');
        if (quality.typeChecking) items.push('🔍 Type checking required');
        if (quality.errorHandling) items.push('⚠️ Error handling required');
        if (quality.codeReview) items.push('👀 Code review required');
        if (quality.linting) items.push('🔧 Linting required');

        return items.join('\n');
    }

    /**
     * Get task URL (placeholder implementation)
     * @param {Object} task - Task object
     * @returns {string} Task URL
     * @private
     */
    _getTaskUrl(task) {
        // In a real implementation, this would link to the task management system
        return `#task-${task.id}`;
    }

    /**
     * Configure PR settings
     * @param {number} prNumber - PR number
     * @param {Object} task - Task object
     * @private
     */
    async _configurePR(prNumber, task) {
        try {
            // Add labels
            if (this.config.pr.labels.length > 0) {
                await this.octokit.rest.issues.addLabels({
                    owner: this.config.github.owner,
                    repo: this.config.github.repo,
                    issue_number: prNumber,
                    labels: this.config.pr.labels
                });
            }

            // Add task-specific labels
            if (task.labels && task.labels.length > 0) {
                await this.octokit.rest.issues.addLabels({
                    owner: this.config.github.owner,
                    repo: this.config.github.repo,
                    issue_number: prNumber,
                    labels: task.labels
                });
            }

            // Request reviewers
            if (this.config.pr.defaultReviewers.length > 0) {
                await this.octokit.rest.pulls.requestReviewers({
                    owner: this.config.github.owner,
                    repo: this.config.github.repo,
                    pull_number: prNumber,
                    reviewers: this.config.pr.defaultReviewers
                });
            }

            // Auto-assign if configured
            if (this.config.pr.autoAssign && task.assignee) {
                await this.octokit.rest.issues.addAssignees({
                    owner: this.config.github.owner,
                    repo: this.config.github.repo,
                    issue_number: prNumber,
                    assignees: [task.assignee]
                });
            }

        } catch (error) {
            console.warn(`Warning: Failed to configure PR #${prNumber}:`, error.message);
            // Don't throw - PR creation was successful, configuration is optional
        }
    }

    /**
     * Update metrics
     * @param {boolean} success - Whether operation was successful
     * @private
     */
    _updateMetrics(success) {
        if (success) {
            this.metrics.prsCreated++;
        } else {
            this.metrics.prsFailed++;
        }

        const total = this.metrics.prsCreated + this.metrics.prsFailed;
        this.metrics.successRate = total > 0 ? (this.metrics.prsCreated / total) * 100 : 0;
    }

    /**
     * Get PR status
     * @param {string} taskId - Task ID
     * @returns {Object|null} PR status
     */
    getPRStatus(taskId) {
        return this.activePRs.get(taskId) || null;
    }

    /**
     * Get all active PRs
     * @returns {Array} Active PRs
     */
    getActivePRs() {
        return Array.from(this.activePRs.values());
    }

    /**
     * Get metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * Get status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            activePRs: this.activePRs.size,
            metrics: this.getMetrics(),
            config: {
                github: {
                    owner: this.config.github.owner,
                    repo: this.config.github.repo,
                    hasToken: !!this.config.github.token
                },
                branches: this.config.branches,
                pr: {
                    ...this.config.pr,
                    defaultReviewers: this.config.pr.defaultReviewers.length
                }
            }
        };
    }

    /**
     * Shutdown the PR manager
     */
    async shutdown() {
        console.log('🔀 Shutting down PR manager...');
        
        this.activePRs.clear();
        this.octokit = null;
        this.isInitialized = false;
        this.removeAllListeners();
        
        console.log('✅ PR manager shutdown complete');
    }
}

export default PRManager;

