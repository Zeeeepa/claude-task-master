/**
 * Deployment Validation Engine
 * 
 * Orchestrates automated deployment validation, testing, and intelligent debugging
 * for PR branches using Claude Code integration within WSL2 environments.
 */

import { ClaudeCodeIntegration } from '../integrations/claude-code/client.js';
import { ValidationLayers } from '../integrations/claude-code/validation-layers.js';
import { WSL2Manager } from '../integrations/claude-code/wsl2-manager.js';

export class DeploymentValidationEngine {
    constructor(claudeCodeClient, database, githubClient, linearClient) {
        this.claudeCode = claudeCodeClient || new ClaudeCodeIntegration(
            process.env.AGENT_API_URL,
            process.env.AGENT_API_KEY
        );
        this.db = database;
        this.github = githubClient;
        this.linear = linearClient;
        this.validationLayers = new ValidationLayers(this.claudeCode);
        this.wsl2Manager = new WSL2Manager(this.claudeCode);
        this.activeDeployments = new Map();
        
        // Configuration
        this.config = {
            maxConcurrentDeployments: 20,
            maxValidationTime: 900000, // 15 minutes
            maxAutoFixAttempts: 3,
            pollInterval: 15000, // 15 seconds
            retryInterval: 30000 // 30 seconds
        };

        // Metrics tracking
        this.metrics = {
            totalValidations: 0,
            successfulValidations: 0,
            failedValidations: 0,
            autoFixSuccesses: 0,
            escalations: 0,
            averageValidationTime: 0
        };
    }

    /**
     * Initialize the deployment validation engine
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            console.log('Initializing Deployment Validation Engine...');
            
            // Check Claude Code service health
            const health = await this.claudeCode.getHealthStatus();
            if (health.status !== 'healthy') {
                throw new Error(`Claude Code service is not healthy: ${health.message}`);
            }

            console.log('Deployment Validation Engine initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize Deployment Validation Engine:', error);
            throw error;
        }
    }

    /**
     * Handle GitHub PR webhook
     * @param {Object} prEvent - GitHub PR webhook event
     * @returns {Promise<Object>} Validation result
     */
    async handlePRWebhook(prEvent) {
        try {
            console.log(`Processing PR webhook: ${prEvent.action} for PR #${prEvent.pull_request.number}`);

            if (prEvent.action === 'opened' || prEvent.action === 'synchronize') {
                return await this.validatePR(prEvent.pull_request);
            }

            console.log(`Ignoring PR action: ${prEvent.action}`);
            return { status: 'ignored', reason: `Action ${prEvent.action} not handled` };
        } catch (error) {
            console.error('Error handling PR webhook:', error);
            throw error;
        }
    }

    /**
     * Validate PR with Claude Code
     * @param {Object} pr - GitHub PR object
     * @returns {Promise<Object>} Validation result
     */
    async validatePR(pr) {
        try {
            // Check if PR is from Codegen
            if (!pr.head.ref.startsWith('codegen-bot/') && !pr.head.ref.startsWith('codegen/')) {
                console.log(`Skipping validation for non-Codegen PR: ${pr.head.ref}`);
                return { status: 'skipped', reason: 'Not a Codegen PR' };
            }

            // Check concurrent deployment limit
            if (this.activeDeployments.size >= this.config.maxConcurrentDeployments) {
                console.warn('Maximum concurrent deployments reached, queuing validation');
                // TODO: Implement queuing mechanism
                throw new Error('Maximum concurrent deployments reached');
            }

            const taskId = this.extractTaskIdFromBranch(pr.head.ref);
            let taskData = null;

            if (taskId && this.db) {
                try {
                    taskData = await this.db.getTask(taskId);
                } catch (error) {
                    console.warn(`Could not retrieve task data for ${taskId}:`, error.message);
                }
            }

            // Deploy to WSL2 environment
            console.log(`Starting deployment validation for PR #${pr.number}`);
            const deployment = await this.claudeCode.deployAndValidate({
                repository: pr.base.repo.full_name,
                branch: pr.head.ref,
                number: pr.number,
                baseBranch: pr.base.ref
            });

            // Store deployment reference in database
            if (taskData && this.db) {
                await this.db.updateTask(taskId, {
                    deploymentId: deployment.id,
                    deploymentStatus: 'validating',
                    lastDeploymentUpdate: new Date()
                });
            }

            // Start monitoring
            this.monitorDeployment(deployment.id, taskId, pr);

            this.metrics.totalValidations++;
            return deployment;
        } catch (error) {
            console.error('Failed to validate PR:', error);
            this.metrics.failedValidations++;
            throw error;
        }
    }

    /**
     * Monitor deployment progress
     * @param {string} deploymentId - Deployment ID
     * @param {string} taskId - Task ID (optional)
     * @param {Object} pr - PR object
     */
    async monitorDeployment(deploymentId, taskId, pr) {
        const monitor = {
            deploymentId,
            taskId,
            pr,
            startTime: Date.now(),
            attempts: 0,
            maxAttempts: this.config.maxAutoFixAttempts,
            status: 'monitoring'
        };

        this.activeDeployments.set(deploymentId, monitor);
        console.log(`Started monitoring deployment ${deploymentId}`);
        
        // Start polling
        this.pollDeployment(deploymentId);
    }

    /**
     * Poll deployment status
     * @param {string} deploymentId - Deployment ID
     */
    async pollDeployment(deploymentId) {
        const monitor = this.activeDeployments.get(deploymentId);
        if (!monitor) {
            console.warn(`Monitor not found for deployment ${deploymentId}`);
            return;
        }

        try {
            const deployment = await this.claudeCode.monitorDeployment(deploymentId);
            
            // Update progress in database
            if (monitor.taskId && this.db) {
                await this.updateDeploymentProgress(monitor.taskId, deployment);
            }

            // Update GitHub PR status
            if (this.github && monitor.pr) {
                await this.updatePRStatus(monitor.pr, deployment);
            }

            if (deployment.status === 'completed') {
                console.log(`Deployment ${deploymentId} completed successfully`);
                this.activeDeployments.delete(deploymentId);
                await this.handleDeploymentSuccess(monitor, deployment);
            } else if (deployment.status === 'failed') {
                console.log(`Deployment ${deploymentId} failed`);
                await this.handleDeploymentFailure(monitor, deployment);
            } else if (deployment.status === 'timeout') {
                console.log(`Deployment ${deploymentId} timed out`);
                await this.handleDeploymentTimeout(monitor, deployment);
            } else {
                // Continue polling
                const elapsed = Date.now() - monitor.startTime;
                if (elapsed > this.config.maxValidationTime) {
                    console.warn(`Deployment ${deploymentId} exceeded maximum validation time`);
                    await this.handleDeploymentTimeout(monitor, deployment);
                } else {
                    setTimeout(() => this.pollDeployment(deploymentId), this.config.pollInterval);
                }
            }
        } catch (error) {
            console.error(`Error polling deployment ${deploymentId}:`, error);
            setTimeout(() => this.pollDeployment(deploymentId), this.config.retryInterval);
        }
    }

    /**
     * Handle deployment success
     * @param {Object} monitor - Monitor object
     * @param {Object} deployment - Deployment result
     */
    async handleDeploymentSuccess(monitor, deployment) {
        try {
            console.log(`Handling successful deployment ${monitor.deploymentId}`);
            
            // Update metrics
            this.metrics.successfulValidations++;
            const validationTime = Date.now() - monitor.startTime;
            this.updateAverageValidationTime(validationTime);

            // Update task status in database
            if (monitor.taskId && this.db) {
                await this.db.updateTask(monitor.taskId, {
                    deploymentStatus: 'completed',
                    deploymentResult: deployment,
                    completedAt: new Date()
                });
            }

            // Update GitHub PR with success status
            if (this.github && monitor.pr) {
                await this.github.createStatus(monitor.pr.head.sha, {
                    state: 'success',
                    description: 'All validation layers passed',
                    context: 'claude-code/validation'
                });
            }

            // Add success comment to Linear issue
            if (this.linear && monitor.taskId) {
                await this.linear.commentOnIssue(monitor.taskId, 
                    `✅ Deployment validation completed successfully!\n\n` +
                    `**Validation Results:**\n` +
                    `- Duration: ${Math.round(validationTime / 1000)}s\n` +
                    `- All validation layers passed\n` +
                    `- Ready for review and merge`
                );
            }

        } catch (error) {
            console.error('Error handling deployment success:', error);
        }
    }

    /**
     * Handle deployment failure with auto-fix
     * @param {Object} monitor - Monitor object
     * @param {Object} deployment - Deployment result
     */
    async handleDeploymentFailure(monitor, deployment) {
        try {
            console.log(`Handling failed deployment ${monitor.deploymentId}, attempt ${monitor.attempts + 1}`);
            monitor.attempts++;

            if (monitor.attempts < monitor.maxAttempts) {
                // Trigger auto-fix
                console.log(`Triggering auto-fix for deployment ${monitor.deploymentId}`);
                const autoFix = await this.claudeCode.triggerAutoFix(
                    monitor.deploymentId, 
                    deployment.errors || []
                );

                // Update database
                if (monitor.taskId && this.db) {
                    await this.db.updateTask(monitor.taskId, {
                        autoFixAttempt: monitor.attempts,
                        autoFixId: autoFix.id,
                        deploymentStatus: 'auto_fixing'
                    });
                }

                // Continue monitoring
                setTimeout(() => this.pollDeployment(monitor.deploymentId), this.config.retryInterval);
            } else {
                // Max attempts reached, escalate to Codegen
                console.log(`Max auto-fix attempts reached for deployment ${monitor.deploymentId}, escalating`);
                this.activeDeployments.delete(monitor.deploymentId);
                await this.escalateToCodegen(monitor, deployment);
            }
        } catch (error) {
            console.error('Error handling deployment failure:', error);
            this.activeDeployments.delete(monitor.deploymentId);
        }
    }

    /**
     * Handle deployment timeout
     * @param {Object} monitor - Monitor object
     * @param {Object} deployment - Deployment result
     */
    async handleDeploymentTimeout(monitor, deployment) {
        try {
            console.log(`Handling timeout for deployment ${monitor.deploymentId}`);
            this.activeDeployments.delete(monitor.deploymentId);

            // Update metrics
            this.metrics.failedValidations++;

            // Update database
            if (monitor.taskId && this.db) {
                await this.db.updateTask(monitor.taskId, {
                    deploymentStatus: 'timeout',
                    deploymentResult: deployment,
                    completedAt: new Date()
                });
            }

            // Escalate timeout as well
            await this.escalateToCodegen(monitor, { 
                ...deployment, 
                errors: [...(deployment.errors || []), 'Validation timeout exceeded'] 
            });

        } catch (error) {
            console.error('Error handling deployment timeout:', error);
        }
    }

    /**
     * Escalate to Codegen for manual fix
     * @param {Object} monitor - Monitor object
     * @param {Object} deployment - Deployment result
     */
    async escalateToCodegen(monitor, deployment) {
        try {
            console.log(`Escalating deployment ${monitor.deploymentId} to Codegen`);
            
            // Update metrics
            this.metrics.escalations++;

            const logs = await this.claudeCode.getDeploymentLogs(monitor.deploymentId);
            
            let taskData = null;
            if (monitor.taskId && this.db) {
                try {
                    taskData = await this.db.getTask(monitor.taskId);
                } catch (error) {
                    console.warn(`Could not retrieve task data for escalation: ${error.message}`);
                }
            }

            // Create new Linear issue for fix
            if (this.linear) {
                const fixIssue = await this.linear.createIssue({
                    title: `🔧 Fix Deployment Errors: ${taskData?.title || `PR #${monitor.pr?.number}`}`,
                    description: this.formatFixIssueDescription(taskData, deployment, logs, monitor.pr),
                    parentId: taskData?.linearIssueId,
                    assigneeId: await this.getCodegenUserId(),
                    priority: 1
                });

                // Update database with escalation info
                if (monitor.taskId && this.db) {
                    await this.db.updateTask(monitor.taskId, {
                        deploymentStatus: 'escalated',
                        fixIssueId: fixIssue.id,
                        escalationTime: new Date()
                    });
                }

                return fixIssue;
            }

        } catch (error) {
            console.error('Error escalating to Codegen:', error);
            throw error;
        }
    }

    /**
     * Extract task ID from branch name
     * @param {string} branchName - Git branch name
     * @returns {string|null} Task ID or null if not found
     */
    extractTaskIdFromBranch(branchName) {
        // Extract task ID from branch names like:
        // codegen-bot/task-123-feature
        // codegen/zam-884-sub-issue-4
        const patterns = [
            /codegen-bot\/task-(\d+)/,
            /codegen\/.*-(\d+)-/,
            /codegen-bot\/.*-(\d+)-/
        ];

        for (const pattern of patterns) {
            const match = branchName.match(pattern);
            if (match) {
                return match[1];
            }
        }

        return null;
    }

    /**
     * Update deployment progress in database
     * @param {string} taskId - Task ID
     * @param {Object} deployment - Deployment status
     */
    async updateDeploymentProgress(taskId, deployment) {
        try {
            if (this.db) {
                await this.db.updateTask(taskId, {
                    deploymentStatus: deployment.status,
                    deploymentProgress: deployment.progress,
                    lastDeploymentUpdate: new Date()
                });
            }
        } catch (error) {
            console.error('Error updating deployment progress:', error);
        }
    }

    /**
     * Update PR status on GitHub
     * @param {Object} pr - PR object
     * @param {Object} deployment - Deployment status
     */
    async updatePRStatus(pr, deployment) {
        try {
            if (!this.github) return;

            let state, description;
            
            switch (deployment.status) {
                case 'validating':
                    state = 'pending';
                    description = 'Running validation layers...';
                    break;
                case 'completed':
                    state = 'success';
                    description = 'All validation layers passed';
                    break;
                case 'failed':
                    state = 'failure';
                    description = 'Validation failed - auto-fix in progress';
                    break;
                case 'auto_fixing':
                    state = 'pending';
                    description = 'Auto-fixing detected issues...';
                    break;
                case 'escalated':
                    state = 'failure';
                    description = 'Validation failed - manual intervention required';
                    break;
                default:
                    state = 'pending';
                    description = `Status: ${deployment.status}`;
            }

            await this.github.createStatus(pr.head.sha, {
                state,
                description,
                context: 'claude-code/validation',
                target_url: deployment.logsUrl
            });

        } catch (error) {
            console.error('Error updating PR status:', error);
        }
    }

    /**
     * Format fix issue description
     * @param {Object} taskData - Task data
     * @param {Object} deployment - Deployment result
     * @param {Object} logs - Deployment logs
     * @param {Object} pr - PR object
     * @returns {string} Formatted description
     */
    formatFixIssueDescription(taskData, deployment, logs, pr) {
        return `# 🔧 Deployment Validation Failure

## 📋 Issue Summary
Automated deployment validation failed for ${taskData?.title || `PR #${pr?.number}`} after ${this.config.maxAutoFixAttempts} auto-fix attempts.

## 🔍 Failure Details
**Deployment ID:** ${deployment.id}
**PR:** #${pr?.number} - ${pr?.title}
**Branch:** ${pr?.head?.ref}
**Status:** ${deployment.status}

## ❌ Errors Encountered
${deployment.errors?.map(error => `- ${error}`).join('\n') || 'No specific errors reported'}

## 📊 Validation Results
${deployment.validationResults ? Object.entries(deployment.validationResults)
    .map(([layer, result]) => `- **${layer}**: ${result.status} ${result.message ? `(${result.message})` : ''}`)
    .join('\n') : 'No validation results available'}

## 📝 Deployment Logs
\`\`\`
${logs?.output?.slice(-2000) || 'No logs available'}
\`\`\`

## 🎯 Required Actions
1. Review the deployment errors and logs above
2. Fix the identified issues in the codebase
3. Push fixes to the same branch: \`${pr?.head?.ref}\`
4. Monitor the re-triggered validation

## 🔗 Related Links
- **PR:** ${pr?.html_url}
- **Deployment Logs:** ${deployment.logsUrl || 'Not available'}
${taskData?.linearIssueUrl ? `- **Original Task:** ${taskData.linearIssueUrl}` : ''}`;
    }

    /**
     * Get Codegen user ID for assignment
     * @returns {Promise<string>} Codegen user ID
     */
    async getCodegenUserId() {
        // This should be configured or retrieved from the system
        return process.env.CODEGEN_USER_ID || 'codegen-bot';
    }

    /**
     * Update average validation time metric
     * @param {number} validationTime - Validation time in milliseconds
     */
    updateAverageValidationTime(validationTime) {
        const totalValidations = this.metrics.successfulValidations;
        const currentAverage = this.metrics.averageValidationTime;
        
        this.metrics.averageValidationTime = 
            ((currentAverage * (totalValidations - 1)) + validationTime) / totalValidations;
    }

    /**
     * Get deployment metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            activeDeployments: this.activeDeployments.size,
            successRate: this.metrics.totalValidations > 0 
                ? (this.metrics.successfulValidations / this.metrics.totalValidations) * 100 
                : 0
        };
    }

    /**
     * Cleanup resources and stop monitoring
     */
    async shutdown() {
        console.log('Shutting down Deployment Validation Engine...');
        
        // Clear all active deployments
        this.activeDeployments.clear();
        
        console.log('Deployment Validation Engine shutdown complete');
    }
}

export default DeploymentValidationEngine;

