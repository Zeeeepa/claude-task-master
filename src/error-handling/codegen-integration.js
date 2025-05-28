/**
 * @fileoverview Codegen Integration
 * @description Integration with Codegen API for AI-powered error resolution
 */

import { log } from '../scripts/modules/utils.js';

/**
 * Codegen integration for AI-powered error resolution
 */
export class CodegenIntegration {
    constructor(config = {}) {
        this.config = {
            apiUrl: config.apiUrl || process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
            apiKey: config.apiKey || process.env.CODEGEN_API_KEY,
            orgId: config.orgId || process.env.CODEGEN_ORG_ID,
            timeout: config.timeout || 300000, // 5 minutes
            maxRetries: config.maxRetries || 3,
            enableAutoMerge: config.enableAutoMerge !== false,
            confidenceThreshold: config.confidenceThreshold || 0.8,
            ...config
        };

        this.activeRequests = new Map();
        this.requestHistory = [];
    }

    /**
     * Trigger Codegen for error resolution
     * @param {Object} escalation - Escalation details
     * @returns {Promise<Object>} Codegen response
     */
    async triggerErrorResolution(escalation) {
        const requestId = this._generateRequestId();
        
        if (this.activeRequests.has(escalation.operationId)) {
            return {
                success: false,
                reason: 'codegen_request_already_active',
                requestId
            };
        }

        const request = {
            id: requestId,
            operationId: escalation.operationId,
            escalationId: escalation.id,
            timestamp: Date.now(),
            status: 'pending',
            retryCount: 0
        };

        this.activeRequests.set(escalation.operationId, request);
        this.requestHistory.push(request);

        try {
            log('info', 'Triggering Codegen for error resolution', {
                requestId,
                operationId: escalation.operationId,
                errorType: escalation.classification.type
            });

            const codegenRequest = this._buildCodegenRequest(escalation);
            const response = await this._callCodegenAPI(codegenRequest, request);
            
            request.status = 'completed';
            request.response = response;
            request.endTime = Date.now();
            request.duration = request.endTime - request.timestamp;

            if (response.success) {
                // Monitor the created PR if auto-merge is enabled
                if (this.config.enableAutoMerge && response.prUrl) {
                    await this._monitorPR(response.prUrl, request);
                }
            }

            return response;

        } catch (error) {
            request.status = 'failed';
            request.error = error.message;
            request.endTime = Date.now();
            request.duration = request.endTime - request.timestamp;

            log('error', 'Codegen request failed', {
                requestId,
                error: error.message
            });

            return {
                success: false,
                error: error.message,
                requestId
            };

        } finally {
            this.activeRequests.delete(escalation.operationId);
        }
    }

    /**
     * Build Codegen API request
     * @param {Object} escalation - Escalation details
     * @returns {Object} Codegen request payload
     * @private
     */
    _buildCodegenRequest(escalation) {
        const { error, context, classification, attempts } = escalation;

        return {
            type: 'error_resolution',
            priority: this._mapPriority(escalation.priority),
            context: {
                repository: context.repository || 'unknown',
                branch: context.branch || 'main',
                environment: context.environment || 'development',
                workingDir: context.workingDir || process.cwd(),
                operationType: context.operationType || 'deployment'
            },
            error: {
                message: error.message,
                stack: error.stack,
                type: classification.type,
                category: classification.category,
                severity: classification.severity,
                confidence: classification.confidence,
                suggestedAction: classification.suggestedAction
            },
            metadata: {
                attempts,
                totalTime: escalation.totalTime,
                timestamp: escalation.timestamp,
                operationId: escalation.operationId,
                escalationId: escalation.id
            },
            requirements: {
                createPR: true,
                runTests: true,
                updateDocumentation: classification.type === 'configuration',
                addErrorHandling: classification.category === 'persistent',
                fixDependencies: classification.type === 'dependency'
            }
        };
    }

    /**
     * Call Codegen API
     * @param {Object} request - Request payload
     * @param {Object} requestMeta - Request metadata
     * @returns {Promise<Object>} API response
     * @private
     */
    async _callCodegenAPI(request, requestMeta) {
        const url = `${this.config.apiUrl}/v1/error-resolution`;
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
            'X-Org-ID': this.config.orgId,
            'X-Request-ID': requestMeta.id
        };

        let lastError;
        
        for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
            try {
                requestMeta.retryCount = attempt;
                
                log('debug', 'Calling Codegen API', {
                    url,
                    attempt: attempt + 1,
                    requestId: requestMeta.id
                });

                const response = await this._makeHttpRequest(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(request),
                    timeout: this.config.timeout
                });

                if (response.ok) {
                    const data = await response.json();
                    
                    log('info', 'Codegen API call successful', {
                        requestId: requestMeta.id,
                        prUrl: data.prUrl,
                        confidence: data.confidence
                    });

                    return {
                        success: true,
                        prUrl: data.prUrl,
                        prNumber: data.prNumber,
                        confidence: data.confidence,
                        estimatedFixTime: data.estimatedFixTime,
                        description: data.description,
                        filesModified: data.filesModified || [],
                        testsAdded: data.testsAdded || false,
                        requestId: requestMeta.id
                    };
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`API call failed: ${response.status} - ${errorData.message || response.statusText}`);
                }

            } catch (error) {
                lastError = error;
                
                if (attempt < this.config.maxRetries - 1) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                    log('warn', 'Codegen API call failed, retrying', {
                        requestId: requestMeta.id,
                        attempt: attempt + 1,
                        error: error.message,
                        retryDelay: delay
                    });
                    
                    await this._sleep(delay);
                } else {
                    log('error', 'Codegen API call failed after all retries', {
                        requestId: requestMeta.id,
                        attempts: this.config.maxRetries,
                        error: error.message
                    });
                }
            }
        }

        throw lastError;
    }

    /**
     * Monitor PR for completion and auto-merge
     * @param {string} prUrl - PR URL
     * @param {Object} request - Request metadata
     * @private
     */
    async _monitorPR(prUrl, request) {
        log('info', 'Starting PR monitoring', {
            prUrl,
            requestId: request.id
        });

        // Extract PR number from URL
        const prMatch = prUrl.match(/\/pull\/(\d+)/);
        if (!prMatch) {
            log('warn', 'Could not extract PR number from URL', { prUrl });
            return;
        }

        const prNumber = parseInt(prMatch[1]);
        const maxMonitorTime = 30 * 60 * 1000; // 30 minutes
        const checkInterval = 60 * 1000; // 1 minute
        const startTime = Date.now();

        while (Date.now() - startTime < maxMonitorTime) {
            try {
                const prStatus = await this._checkPRStatus(prNumber);
                
                if (prStatus.merged) {
                    log('info', 'PR successfully merged', {
                        prUrl,
                        requestId: request.id,
                        mergeTime: Date.now() - startTime
                    });
                    break;
                }

                if (prStatus.closed && !prStatus.merged) {
                    log('warn', 'PR was closed without merging', {
                        prUrl,
                        requestId: request.id
                    });
                    break;
                }

                if (prStatus.checksCompleted && prStatus.checksSuccessful && this.config.enableAutoMerge) {
                    // Attempt auto-merge if checks pass
                    const mergeResult = await this._attemptAutoMerge(prNumber);
                    if (mergeResult.success) {
                        log('info', 'PR auto-merged successfully', {
                            prUrl,
                            requestId: request.id
                        });
                        break;
                    }
                }

                await this._sleep(checkInterval);

            } catch (error) {
                log('warn', 'Error monitoring PR', {
                    prUrl,
                    requestId: request.id,
                    error: error.message
                });
                break;
            }
        }
    }

    /**
     * Check PR status
     * @param {number} prNumber - PR number
     * @returns {Promise<Object>} PR status
     * @private
     */
    async _checkPRStatus(prNumber) {
        // This would integrate with GitHub API or similar
        // For now, return mock status
        return {
            merged: false,
            closed: false,
            checksCompleted: true,
            checksSuccessful: true
        };
    }

    /**
     * Attempt to auto-merge PR
     * @param {number} prNumber - PR number
     * @returns {Promise<Object>} Merge result
     * @private
     */
    async _attemptAutoMerge(prNumber) {
        // This would integrate with GitHub API or similar
        // For now, return mock result
        return {
            success: true,
            mergeCommit: 'abc123'
        };
    }

    /**
     * Make HTTP request with timeout
     * @param {string} url - Request URL
     * @param {Object} options - Request options
     * @returns {Promise<Response>} HTTP response
     * @private
     */
    async _makeHttpRequest(url, options) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Map escalation priority to Codegen priority
     * @param {string} priority - Escalation priority
     * @returns {string} Codegen priority
     * @private
     */
    _mapPriority(priority) {
        const priorityMap = {
            low: 'low',
            medium: 'normal',
            high: 'high',
            critical: 'urgent'
        };

        return priorityMap[priority] || 'normal';
    }

    /**
     * Sleep for specified duration
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate unique request ID
     * @returns {string} Request ID
     * @private
     */
    _generateRequestId() {
        return `cg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get Codegen integration statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const stats = {
            totalRequests: this.requestHistory.length,
            activeRequests: this.activeRequests.size,
            byStatus: {},
            averageResponseTime: 0,
            successRate: 0,
            averageConfidence: 0
        };

        let totalResponseTime = 0;
        let completedCount = 0;
        let successCount = 0;
        let totalConfidence = 0;
        let confidenceCount = 0;

        for (const request of this.requestHistory) {
            // Count by status
            stats.byStatus[request.status] = (stats.byStatus[request.status] || 0) + 1;
            
            if (request.duration) {
                totalResponseTime += request.duration;
                completedCount++;
                
                if (request.status === 'completed' && request.response && request.response.success) {
                    successCount++;
                    
                    if (request.response.confidence) {
                        totalConfidence += request.response.confidence;
                        confidenceCount++;
                    }
                }
            }
        }

        if (completedCount > 0) {
            stats.averageResponseTime = totalResponseTime / completedCount;
            stats.successRate = successCount / completedCount;
        }

        if (confidenceCount > 0) {
            stats.averageConfidence = totalConfidence / confidenceCount;
        }

        return stats;
    }

    /**
     * Get active requests
     * @returns {Array} Active requests
     */
    getActiveRequests() {
        return Array.from(this.activeRequests.values());
    }

    /**
     * Get request history
     * @param {number} limit - Maximum number of entries to return
     * @returns {Array} Request history
     */
    getHistory(limit = 100) {
        return this.requestHistory.slice(-limit);
    }

    /**
     * Cancel active request
     * @param {string} operationId - Operation ID
     * @returns {boolean} Whether request was cancelled
     */
    cancelRequest(operationId) {
        if (this.activeRequests.has(operationId)) {
            const request = this.activeRequests.get(operationId);
            request.status = 'cancelled';
            this.activeRequests.delete(operationId);
            
            log('info', 'Codegen request cancelled', {
                requestId: request.id,
                operationId
            });
            
            return true;
        }
        return false;
    }

    /**
     * Test Codegen API connectivity
     * @returns {Promise<Object>} Test result
     */
    async testConnection() {
        try {
            const url = `${this.config.apiUrl}/v1/health`;
            const headers = {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'X-Org-ID': this.config.orgId
            };

            const response = await this._makeHttpRequest(url, {
                method: 'GET',
                headers,
                timeout: 10000
            });

            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    status: 'connected',
                    apiVersion: data.version,
                    orgId: this.config.orgId
                };
            } else {
                return {
                    success: false,
                    status: 'connection_failed',
                    error: `HTTP ${response.status}: ${response.statusText}`
                };
            }

        } catch (error) {
            return {
                success: false,
                status: 'connection_error',
                error: error.message
            };
        }
    }

    /**
     * Reset integration state
     */
    reset() {
        this.activeRequests.clear();
        this.requestHistory = [];
        log('info', 'Codegen integration reset');
    }
}

export default CodegenIntegration;

