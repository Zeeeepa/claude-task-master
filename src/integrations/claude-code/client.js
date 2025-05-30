/**
 * Claude Code Integration Client
 * 
 * Enhanced Claude Code API client via AgentAPI for deployment validation,
 * testing, and intelligent debugging within WSL2 environments.
 */

import axios from 'axios';

export class ClaudeCodeIntegration {
    constructor(agentApiUrl, apiKey) {
        this.baseURL = agentApiUrl;
        this.apiKey = apiKey;
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
        });

        // Add request/response interceptors for logging and error handling
        this.client.interceptors.request.use(
            (config) => {
                console.log(`[Claude Code API] ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                console.error('[Claude Code API] Request error:', error);
                return Promise.reject(error);
            }
        );

        this.client.interceptors.response.use(
            (response) => {
                console.log(`[Claude Code API] Response ${response.status} from ${response.config.url}`);
                return response;
            },
            (error) => {
                console.error('[Claude Code API] Response error:', error.response?.data || error.message);
                return Promise.reject(error);
            }
        );
    }

    /**
     * Deploy and validate PR branch
     * @param {Object} prData - PR data containing repository, branch, and validation requirements
     * @returns {Promise<Object>} Deployment data with ID and status
     */
    async deployAndValidate(prData) {
        try {
            const deployment = await this.client.post('/claude-code/deploy', {
                repository: prData.repository,
                branch: prData.branch,
                prNumber: prData.number,
                baseBranch: prData.baseBranch || 'main',
                validationLayers: [
                    'syntax',
                    'unit_tests',
                    'integration_tests',
                    'performance',
                    'security'
                ],
                environment: {
                    type: 'wsl2',
                    resources: {
                        cpu: '2',
                        memory: '4GB',
                        disk: '20GB'
                    },
                    networking: 'isolated'
                }
            });

            return deployment.data;
        } catch (error) {
            console.error('Failed to deploy and validate PR:', error);
            throw new Error(`Deployment failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Monitor deployment progress
     * @param {string} deploymentId - Deployment ID to monitor
     * @returns {Promise<Object>} Deployment status and progress
     */
    async monitorDeployment(deploymentId) {
        try {
            const response = await this.client.get(`/claude-code/deployments/${deploymentId}`);
            return response.data;
        } catch (error) {
            console.error(`Failed to monitor deployment ${deploymentId}:`, error);
            throw new Error(`Monitoring failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Get deployment logs
     * @param {string} deploymentId - Deployment ID
     * @returns {Promise<Object>} Deployment logs and execution details
     */
    async getDeploymentLogs(deploymentId) {
        try {
            const response = await this.client.get(`/claude-code/deployments/${deploymentId}/logs`);
            return response.data;
        } catch (error) {
            console.error(`Failed to get logs for deployment ${deploymentId}:`, error);
            throw new Error(`Log retrieval failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Trigger auto-fix for failed deployment
     * @param {string} deploymentId - Deployment ID
     * @param {Array} errors - Array of errors to fix
     * @returns {Promise<Object>} Auto-fix operation data
     */
    async triggerAutoFix(deploymentId, errors) {
        try {
            const response = await this.client.post(`/claude-code/deployments/${deploymentId}/auto-fix`, {
                errors,
                maxAttempts: 3,
                fixStrategies: ['dependency_resolution', 'syntax_correction', 'test_fixes'],
                timeout: 600000 // 10 minutes
            });
            return response.data;
        } catch (error) {
            console.error(`Failed to trigger auto-fix for deployment ${deploymentId}:`, error);
            throw new Error(`Auto-fix failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Run specific validation layer
     * @param {string} deploymentId - Deployment ID
     * @param {string} validationType - Type of validation to run
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation results
     */
    async runValidation(deploymentId, validationType, options = {}) {
        try {
            const response = await this.client.post(`/claude-code/deployments/${deploymentId}/validate`, {
                type: validationType,
                options
            });
            return response.data;
        } catch (error) {
            console.error(`Failed to run ${validationType} validation:`, error);
            throw new Error(`Validation failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Create WSL2 environment
     * @param {Object} environmentConfig - Environment configuration
     * @returns {Promise<Object>} Environment creation result
     */
    async createEnvironment(environmentConfig) {
        try {
            const response = await this.client.post('/claude-code/environments', environmentConfig);
            return response.data;
        } catch (error) {
            console.error('Failed to create environment:', error);
            throw new Error(`Environment creation failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Execute command in environment
     * @param {string} environmentId - Environment ID
     * @param {Object} commandConfig - Command configuration
     * @returns {Promise<Object>} Command execution result
     */
    async executeCommand(environmentId, commandConfig) {
        try {
            const response = await this.client.post(`/claude-code/environments/${environmentId}/execute`, commandConfig);
            return response.data;
        } catch (error) {
            console.error(`Failed to execute command in environment ${environmentId}:`, error);
            throw new Error(`Command execution failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Check if file exists in environment
     * @param {string} environmentId - Environment ID
     * @param {string} filePath - File path to check
     * @returns {Promise<boolean>} True if file exists
     */
    async fileExists(environmentId, filePath) {
        try {
            const response = await this.client.get(`/claude-code/environments/${environmentId}/files`, {
                params: { path: filePath }
            });
            return response.data.exists;
        } catch (error) {
            console.error(`Failed to check file existence in environment ${environmentId}:`, error);
            return false;
        }
    }

    /**
     * Destroy environment
     * @param {string} environmentId - Environment ID to destroy
     * @returns {Promise<Object>} Destruction result
     */
    async destroyEnvironment(environmentId) {
        try {
            const response = await this.client.delete(`/claude-code/environments/${environmentId}`);
            return response.data;
        } catch (error) {
            console.error(`Failed to destroy environment ${environmentId}:`, error);
            throw new Error(`Environment destruction failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Get health status of Claude Code service
     * @returns {Promise<Object>} Health status
     */
    async getHealthStatus() {
        try {
            const response = await this.client.get('/claude-code/health');
            return response.data;
        } catch (error) {
            console.error('Failed to get health status:', error);
            throw new Error(`Health check failed: ${error.response?.data?.message || error.message}`);
        }
    }
}

export default ClaudeCodeIntegration;

