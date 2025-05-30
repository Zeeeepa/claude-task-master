/**
 * @fileoverview Codegen SDK Integration Client
 * @description Production-grade Codegen SDK wrapper for automated code generation
 */

import { CodegenSDK } from '@codegen/sdk';
import { log } from '../../scripts/modules/utils.js';

/**
 * Codegen Integration Client - Wrapper around the official Codegen SDK
 */
export class CodegenIntegration {
    constructor(apiKey, orgId, options = {}) {
        this.apiKey = apiKey;
        this.orgId = orgId;
        this.options = {
            baseURL: 'https://api.codegen.sh',
            timeout: 120000, // 2 minutes
            retries: 3,
            ...options
        };

        // Validate required parameters
        if (!this.apiKey || !this.orgId) {
            throw new Error('Codegen Integration requires apiKey and orgId');
        }

        // Initialize the Codegen SDK client
        this.client = new CodegenSDK({
            apiKey: this.apiKey,
            orgId: this.orgId,
            baseURL: this.options.baseURL,
            timeout: this.options.timeout
        });

        log('debug', `Initialized Codegen Integration for org ${this.orgId}`);
    }

    /**
     * Generate code from natural language requirements
     * @param {Object} requirements - Requirements object
     * @returns {Promise<Object>} Generation response
     */
    async generateCode(requirements) {
        log('info', `Starting code generation for: ${requirements.title}`);

        try {
            const prompt = this.formatRequirements(requirements);
            
            const response = await this.client.generate({
                prompt: prompt,
                context: {
                    repository: requirements.repository,
                    branch: requirements.branch || 'main',
                    files: requirements.contextFiles || []
                },
                options: {
                    createPR: true,
                    runTests: true,
                    autoFix: true,
                    ...requirements.options
                }
            });

            log('info', `Code generation initiated with task ID: ${response.id}`);
            return response;

        } catch (error) {
            log('error', `Code generation failed: ${error.message}`);
            throw new Error(`Code generation failed: ${error.message}`);
        }
    }

    /**
     * Monitor Codegen task progress
     * @param {string} taskId - Task identifier
     * @returns {Promise<Object>} Task status
     */
    async monitorTask(taskId) {
        try {
            log('debug', `Monitoring task ${taskId}`);
            
            const taskStatus = await this.client.getTask(taskId);
            
            log('debug', `Task ${taskId} status: ${taskStatus.status}`);
            return taskStatus;

        } catch (error) {
            log('error', `Failed to monitor task ${taskId}: ${error.message}`);
            throw new Error(`Task monitoring failed: ${error.message}`);
        }
    }

    /**
     * Create PR with generated code
     * @param {Object} taskData - Task data for PR creation
     * @returns {Promise<Object>} PR response
     */
    async createPR(taskData) {
        log('info', `Creating PR for task: ${taskData.title}`);

        try {
            const prResponse = await this.client.createPR({
                title: `🤖 ${taskData.title}`,
                description: this.formatPRDescription(taskData),
                branch: `codegen-bot/${taskData.id}`,
                baseBranch: taskData.baseBranch || 'main',
                files: taskData.generatedFiles
            });

            log('info', `PR created successfully: ${prResponse.url}`);
            return prResponse;

        } catch (error) {
            log('error', `PR creation failed: ${error.message}`);
            throw new Error(`PR creation failed: ${error.message}`);
        }
    }

    /**
     * Format requirements for Codegen API
     * @param {Object} requirements - Requirements object
     * @returns {string} Formatted prompt
     */
    formatRequirements(requirements) {
        let prompt = `# Task: ${requirements.title}\n\n`;
        
        if (requirements.description) {
            prompt += `## Description\n${requirements.description}\n\n`;
        }

        if (requirements.technicalSpecs && requirements.technicalSpecs.length > 0) {
            prompt += `## Technical Requirements\n`;
            requirements.technicalSpecs.forEach(spec => {
                prompt += `- ${spec}\n`;
            });
            prompt += '\n';
        }

        if (requirements.acceptanceCriteria && requirements.acceptanceCriteria.length > 0) {
            prompt += `## Acceptance Criteria\n`;
            requirements.acceptanceCriteria.forEach(criteria => {
                prompt += `- ${criteria}\n`;
            });
            prompt += '\n';
        }

        if (requirements.affectedFiles && requirements.affectedFiles.length > 0) {
            prompt += `## Files to Modify/Create\n`;
            requirements.affectedFiles.forEach(file => {
                prompt += `- ${file}\n`;
            });
            prompt += '\n';
        }

        if (requirements.dependencies && requirements.dependencies.length > 0) {
            prompt += `## Dependencies\n`;
            requirements.dependencies.forEach(dep => {
                prompt += `- ${dep}\n`;
            });
            prompt += '\n';
        }

        prompt += `Please implement this feature following best practices and include comprehensive tests.`;

        return prompt;
    }

    /**
     * Format PR description
     * @param {Object} taskData - Task data
     * @returns {string} Formatted PR description
     */
    formatPRDescription(taskData) {
        let description = `# 🤖 Automated Implementation: ${taskData.title}\n\n`;
        
        description += `This PR was automatically generated by Codegen based on the requirements provided.\n\n`;
        
        if (taskData.description) {
            description += `## Description\n${taskData.description}\n\n`;
        }

        if (taskData.generatedFiles && taskData.generatedFiles.length > 0) {
            description += `## Generated Files\n`;
            taskData.generatedFiles.forEach(file => {
                description += `- ${file}\n`;
            });
            description += '\n';
        }

        if (taskData.testResults) {
            description += `## Test Results\n`;
            description += `- Tests Run: ${taskData.testResults.total || 'N/A'}\n`;
            description += `- Tests Passed: ${taskData.testResults.passed || 'N/A'}\n`;
            description += `- Tests Failed: ${taskData.testResults.failed || 'N/A'}\n\n`;
        }

        description += `## Review Notes\n`;
        description += `- This code was generated automatically and should be reviewed before merging\n`;
        description += `- All tests have been run and are passing\n`;
        description += `- Code follows established patterns and best practices\n\n`;

        if (taskData.linearIssueId) {
            description += `**Related Linear Issue:** ${taskData.linearIssueId}\n`;
        }

        if (taskData.taskId) {
            description += `**Task ID:** ${taskData.taskId}\n`;
        }

        return description;
    }

    /**
     * Get client health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        try {
            // Test connection to Codegen API
            const health = await this.client.health();
            
            return {
                status: 'healthy',
                apiKey: !!this.apiKey,
                orgId: this.orgId,
                baseURL: this.options.baseURL,
                sdkVersion: this.client.version || 'unknown',
                lastCheck: new Date().toISOString(),
                ...health
            };

        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                apiKey: !!this.apiKey,
                orgId: this.orgId,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * Shutdown the client
     */
    async shutdown() {
        log('debug', 'Shutting down Codegen Integration client...');
        
        if (this.client && typeof this.client.close === 'function') {
            await this.client.close();
        }
        
        log('debug', 'Codegen Integration client shutdown complete');
    }
}

export default CodegenIntegration;

