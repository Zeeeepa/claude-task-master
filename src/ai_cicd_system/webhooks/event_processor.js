/**
 * @fileoverview Event Processor - Processes webhook events and triggers AgentAPI
 * @description Handles event processing, AgentAPI integration, and workflow coordination
 */

import axios from 'axios';
import { EventEmitter } from 'events';
import { log } from '../../utils/simple_logger.js';

/**
 * Event Processor
 * Processes webhook events and coordinates with AgentAPI for code deployment
 */
export class EventProcessor extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            agentapi: {
                baseUrl: config.agentapi?.baseUrl || process.env.AGENTAPI_BASE_URL || 'http://localhost:8000',
                apiKey: config.agentapi?.apiKey || process.env.AGENTAPI_API_KEY,
                timeout: config.agentapi?.timeout || 300000, // 5 minutes
                retries: config.agentapi?.retries || 3
            },
            database: {
                connectionString: config.database?.connectionString || process.env.DATABASE_URL,
                schema: config.database?.schema || 'ai_cicd'
            },
            linear: {
                apiKey: config.linear?.apiKey || process.env.LINEAR_API_KEY,
                baseUrl: config.linear?.baseUrl || 'https://api.linear.app/graphql'
            },
            processing: {
                maxConcurrentJobs: config.maxConcurrentJobs || 10,
                jobTimeout: config.jobTimeout || 600000, // 10 minutes
                enableParallelProcessing: config.enableParallelProcessing !== false
            },
            monitoring: {
                enableMetrics: config.enableMetrics !== false,
                enableTracing: config.enableTracing !== false
            },
            ...config
        };

        this.activeJobs = new Map();
        this.jobQueue = [];
        this.isProcessing = false;
        
        // Metrics
        this.metrics = {
            totalProcessed: 0,
            totalSuccessful: 0,
            totalFailed: 0,
            averageProcessingTime: 0,
            processingTimes: [],
            agentApiCalls: 0,
            agentApiFailures: 0,
            lastProcessedTime: null,
            startTime: Date.now()
        };

        // Initialize HTTP client
        this.httpClient = axios.create({
            baseURL: this.config.agentapi.baseUrl,
            timeout: this.config.agentapi.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'AI-CICD-Webhook-Processor/1.0'
            }
        });

        if (this.config.agentapi.apiKey) {
            this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.config.agentapi.apiKey}`;
        }

        this.setupHttpInterceptors();
    }

    /**
     * Initialize the event processor
     */
    async initialize() {
        try {
            await this.validateConfiguration();
            await this.testConnections();
            
            log('info', 'Event Processor initialized successfully');
        } catch (error) {
            log('error', `Failed to initialize event processor: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process a webhook event
     * @param {Object} event - Webhook event to process
     * @param {Object} job - Job metadata
     * @returns {Promise<Object>} Processing result
     */
    async processEvent(event, job) {
        const startTime = Date.now();
        const jobId = job.id;
        
        try {
            log('info', `Processing event ${event.id} (job ${jobId})`);
            
            // Track active job
            this.activeJobs.set(jobId, {
                event,
                job,
                startTime,
                status: 'processing'
            });

            // Determine processing strategy based on event type
            let result;
            switch (event.type) {
                case 'pull_request':
                    result = await this.processPullRequestEvent(event, job);
                    break;
                case 'push':
                    result = await this.processPushEvent(event, job);
                    break;
                case 'check_run':
                    result = await this.processCheckRunEvent(event, job);
                    break;
                case 'check_suite':
                    result = await this.processCheckSuiteEvent(event, job);
                    break;
                default:
                    result = await this.processGenericEvent(event, job);
            }

            // Update metrics
            const processingTime = Date.now() - startTime;
            this.updateMetrics(true, processingTime);
            
            // Update job status
            this.activeJobs.get(jobId).status = 'completed';
            this.activeJobs.get(jobId).result = result;
            
            log('info', `Event ${event.id} processed successfully (${processingTime}ms)`);
            this.emit('event:processed', { event, job, result, processingTime });
            
            return result;
            
        } catch (error) {
            const processingTime = Date.now() - startTime;
            this.updateMetrics(false, processingTime);
            
            // Update job status
            if (this.activeJobs.has(jobId)) {
                this.activeJobs.get(jobId).status = 'failed';
                this.activeJobs.get(jobId).error = error;
            }
            
            log('error', `Event ${event.id} processing failed: ${error.message}`);
            this.emit('event:failed', { event, job, error, processingTime });
            
            throw error;
            
        } finally {
            // Clean up active job after delay (for monitoring)
            setTimeout(() => {
                this.activeJobs.delete(jobId);
            }, 60000); // Keep for 1 minute for monitoring
        }
    }

    /**
     * Process pull request events
     * @param {Object} event - Pull request event
     * @param {Object} job - Job metadata
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async processPullRequestEvent(event, job) {
        const { action, pull_request, repository } = event.payload;
        
        log('debug', `Processing PR event: ${action} for PR #${pull_request.number}`);
        
        const prData = {
            number: pull_request.number,
            title: pull_request.title,
            body: pull_request.body,
            state: pull_request.state,
            head: {
                ref: pull_request.head.ref,
                sha: pull_request.head.sha,
                repo: pull_request.head.repo?.full_name
            },
            base: {
                ref: pull_request.base.ref,
                sha: pull_request.base.sha,
                repo: pull_request.base.repo?.full_name
            },
            repository: {
                name: repository.name,
                full_name: repository.full_name,
                clone_url: repository.clone_url,
                ssh_url: repository.ssh_url
            },
            action: action,
            user: {
                login: pull_request.user?.login,
                id: pull_request.user?.id
            }
        };

        let result = {};

        switch (action) {
            case 'opened':
            case 'reopened':
                result = await this.triggerCodeDeployment(prData, event);
                break;
                
            case 'synchronize':
                result = await this.triggerCodeValidation(prData, event);
                break;
                
            case 'closed':
                if (pull_request.merged) {
                    result = await this.triggerMergeWorkflow(prData, event);
                } else {
                    result = await this.handlePRClosure(prData, event);
                }
                break;
                
            case 'ready_for_review':
                result = await this.triggerReviewWorkflow(prData, event);
                break;
                
            default:
                log('debug', `Unhandled PR action: ${action}`);
                result = { status: 'ignored', reason: `Unhandled action: ${action}` };
        }

        // Update database with PR event
        await this.logEventToDatabase(event, result);
        
        // Update Linear ticket if correlation exists
        if (event.correlation?.linearTicketId) {
            await this.updateLinearTicket(event.correlation.linearTicketId, prData, result);
        }

        return result;
    }

    /**
     * Process push events
     * @param {Object} event - Push event
     * @param {Object} job - Job metadata
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async processPushEvent(event, job) {
        const { ref, commits, repository, pusher } = event.payload;
        
        log('debug', `Processing push event: ${commits.length} commits to ${ref}`);
        
        const pushData = {
            ref: ref,
            branch: ref.replace('refs/heads/', ''),
            commits: commits.map(commit => ({
                id: commit.id,
                message: commit.message,
                author: commit.author,
                timestamp: commit.timestamp,
                url: commit.url
            })),
            repository: {
                name: repository.name,
                full_name: repository.full_name,
                clone_url: repository.clone_url
            },
            pusher: {
                name: pusher.name,
                email: pusher.email
            }
        };

        let result = {};

        // Only process pushes to main/master branches
        if (pushData.branch === 'main' || pushData.branch === 'master') {
            result = await this.triggerPostMergeWorkflow(pushData, event);
        } else {
            result = { status: 'ignored', reason: 'Not a main branch push' };
        }

        await this.logEventToDatabase(event, result);
        return result;
    }

    /**
     * Process check run events
     * @param {Object} event - Check run event
     * @param {Object} job - Job metadata
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async processCheckRunEvent(event, job) {
        const { action, check_run, repository } = event.payload;
        
        log('debug', `Processing check run event: ${action} - ${check_run.name}`);
        
        const checkData = {
            id: check_run.id,
            name: check_run.name,
            status: check_run.status,
            conclusion: check_run.conclusion,
            started_at: check_run.started_at,
            completed_at: check_run.completed_at,
            head_sha: check_run.head_sha,
            pull_requests: check_run.pull_requests,
            repository: {
                name: repository.name,
                full_name: repository.full_name
            }
        };

        let result = {};

        if (action === 'completed') {
            if (check_run.conclusion === 'failure') {
                result = await this.triggerFailureRecovery(checkData, event);
            } else if (check_run.conclusion === 'success') {
                result = await this.handleCheckSuccess(checkData, event);
            }
        }

        await this.logEventToDatabase(event, result);
        return result;
    }

    /**
     * Process check suite events
     * @param {Object} event - Check suite event
     * @param {Object} job - Job metadata
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async processCheckSuiteEvent(event, job) {
        const { action, check_suite, repository } = event.payload;
        
        log('debug', `Processing check suite event: ${action} - ${check_suite.conclusion}`);
        
        const suiteData = {
            id: check_suite.id,
            status: check_suite.status,
            conclusion: check_suite.conclusion,
            head_sha: check_suite.head_sha,
            head_branch: check_suite.head_branch,
            pull_requests: check_suite.pull_requests,
            repository: {
                name: repository.name,
                full_name: repository.full_name
            }
        };

        let result = {};

        if (action === 'completed') {
            result = await this.handleCheckSuiteCompletion(suiteData, event);
        }

        await this.logEventToDatabase(event, result);
        return result;
    }

    /**
     * Process generic events
     * @param {Object} event - Generic event
     * @param {Object} job - Job metadata
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async processGenericEvent(event, job) {
        log('debug', `Processing generic event: ${event.type}`);
        
        const result = {
            status: 'processed',
            type: event.type,
            message: 'Generic event processed'
        };

        await this.logEventToDatabase(event, result);
        return result;
    }

    /**
     * Trigger code deployment via AgentAPI
     * @param {Object} prData - Pull request data
     * @param {Object} event - Original event
     * @returns {Promise<Object>} Deployment result
     * @private
     */
    async triggerCodeDeployment(prData, event) {
        try {
            log('info', `Triggering code deployment for PR #${prData.number}`);
            
            const deploymentRequest = {
                type: 'code_deployment',
                pr_data: prData,
                event_id: event.id,
                correlation_id: event.correlation?.workflowId,
                repository: prData.repository,
                target_environment: 'development',
                deployment_config: {
                    auto_deploy: true,
                    run_tests: true,
                    notify_on_completion: true
                }
            };

            const response = await this.callAgentAPI('/deploy/code', deploymentRequest);
            
            this.metrics.agentApiCalls++;
            
            return {
                status: 'deployment_triggered',
                deployment_id: response.data.deployment_id,
                agent_response: response.data,
                pr_number: prData.number
            };
            
        } catch (error) {
            this.metrics.agentApiFailures++;
            log('error', `Code deployment failed: ${error.message}`);
            throw new Error(`Code deployment failed: ${error.message}`);
        }
    }

    /**
     * Trigger code validation
     * @param {Object} prData - Pull request data
     * @param {Object} event - Original event
     * @returns {Promise<Object>} Validation result
     * @private
     */
    async triggerCodeValidation(prData, event) {
        try {
            log('info', `Triggering code validation for PR #${prData.number}`);
            
            const validationRequest = {
                type: 'code_validation',
                pr_data: prData,
                event_id: event.id,
                correlation_id: event.correlation?.workflowId,
                validation_config: {
                    run_linting: true,
                    run_tests: true,
                    check_security: true,
                    performance_check: true
                }
            };

            const response = await this.callAgentAPI('/validate/code', validationRequest);
            
            this.metrics.agentApiCalls++;
            
            return {
                status: 'validation_triggered',
                validation_id: response.data.validation_id,
                agent_response: response.data,
                pr_number: prData.number
            };
            
        } catch (error) {
            this.metrics.agentApiFailures++;
            log('error', `Code validation failed: ${error.message}`);
            throw new Error(`Code validation failed: ${error.message}`);
        }
    }

    /**
     * Trigger merge workflow
     * @param {Object} prData - Pull request data
     * @param {Object} event - Original event
     * @returns {Promise<Object>} Merge result
     * @private
     */
    async triggerMergeWorkflow(prData, event) {
        try {
            log('info', `Triggering merge workflow for PR #${prData.number}`);
            
            const mergeRequest = {
                type: 'merge_workflow',
                pr_data: prData,
                event_id: event.id,
                correlation_id: event.correlation?.workflowId,
                merge_config: {
                    cleanup_branch: true,
                    update_dependencies: true,
                    trigger_deployment: true
                }
            };

            const response = await this.callAgentAPI('/workflow/merge', mergeRequest);
            
            this.metrics.agentApiCalls++;
            
            return {
                status: 'merge_workflow_triggered',
                workflow_id: response.data.workflow_id,
                agent_response: response.data,
                pr_number: prData.number
            };
            
        } catch (error) {
            this.metrics.agentApiFailures++;
            log('error', `Merge workflow failed: ${error.message}`);
            throw new Error(`Merge workflow failed: ${error.message}`);
        }
    }

    /**
     * Trigger failure recovery
     * @param {Object} checkData - Check run data
     * @param {Object} event - Original event
     * @returns {Promise<Object>} Recovery result
     * @private
     */
    async triggerFailureRecovery(checkData, event) {
        try {
            log('info', `Triggering failure recovery for check: ${checkData.name}`);
            
            const recoveryRequest = {
                type: 'failure_recovery',
                check_data: checkData,
                event_id: event.id,
                recovery_config: {
                    auto_retry: true,
                    max_retries: 3,
                    notify_team: true
                }
            };

            const response = await this.callAgentAPI('/recovery/failure', recoveryRequest);
            
            this.metrics.agentApiCalls++;
            
            return {
                status: 'recovery_triggered',
                recovery_id: response.data.recovery_id,
                agent_response: response.data,
                check_name: checkData.name
            };
            
        } catch (error) {
            this.metrics.agentApiFailures++;
            log('error', `Failure recovery failed: ${error.message}`);
            throw new Error(`Failure recovery failed: ${error.message}`);
        }
    }

    /**
     * Call AgentAPI with retry logic
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request data
     * @returns {Promise<Object>} API response
     * @private
     */
    async callAgentAPI(endpoint, data) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.config.agentapi.retries; attempt++) {
            try {
                log('debug', `AgentAPI call attempt ${attempt}: ${endpoint}`);
                
                const response = await this.httpClient.post(endpoint, data);
                
                if (response.status >= 200 && response.status < 300) {
                    return response;
                }
                
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                
            } catch (error) {
                lastError = error;
                
                if (attempt < this.config.agentapi.retries) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                    log('warning', `AgentAPI call failed (attempt ${attempt}), retrying in ${delay}ms: ${error.message}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    log('error', `AgentAPI call failed after ${attempt} attempts: ${error.message}`);
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Log event to database
     * @param {Object} event - Webhook event
     * @param {Object} result - Processing result
     * @private
     */
    async logEventToDatabase(event, result) {
        try {
            // This would integrate with the existing database system
            // For now, we'll log the event details
            log('debug', `Logging event ${event.id} to database`);
            
            const eventLog = {
                event_id: event.id,
                event_type: event.type,
                source: event.source,
                timestamp: event.timestamp,
                payload_summary: this.summarizePayload(event.payload),
                processing_result: result,
                correlation_id: event.correlation?.workflowId,
                created_at: new Date()
            };
            
            // TODO: Implement actual database logging
            log('debug', `Event logged: ${JSON.stringify(eventLog, null, 2)}`);
            
        } catch (error) {
            log('error', `Failed to log event to database: ${error.message}`);
            // Don't throw here as this is not critical for processing
        }
    }

    /**
     * Update Linear ticket with event information
     * @param {string} ticketId - Linear ticket ID
     * @param {Object} prData - Pull request data
     * @param {Object} result - Processing result
     * @private
     */
    async updateLinearTicket(ticketId, prData, result) {
        try {
            log('debug', `Updating Linear ticket ${ticketId}`);
            
            // TODO: Implement Linear API integration
            const updateData = {
                ticket_id: ticketId,
                pr_number: prData.number,
                status: result.status,
                updated_at: new Date()
            };
            
            log('debug', `Linear ticket update: ${JSON.stringify(updateData, null, 2)}`);
            
        } catch (error) {
            log('error', `Failed to update Linear ticket: ${error.message}`);
            // Don't throw here as this is not critical for processing
        }
    }

    /**
     * Handle PR closure
     * @param {Object} prData - Pull request data
     * @param {Object} event - Original event
     * @returns {Promise<Object>} Closure result
     * @private
     */
    async handlePRClosure(prData, event) {
        log('info', `Handling PR closure for PR #${prData.number}`);
        
        return {
            status: 'pr_closed',
            pr_number: prData.number,
            message: 'PR closed without merge'
        };
    }

    /**
     * Trigger review workflow
     * @param {Object} prData - Pull request data
     * @param {Object} event - Original event
     * @returns {Promise<Object>} Review result
     * @private
     */
    async triggerReviewWorkflow(prData, event) {
        log('info', `Triggering review workflow for PR #${prData.number}`);
        
        return {
            status: 'review_workflow_triggered',
            pr_number: prData.number,
            message: 'PR ready for review'
        };
    }

    /**
     * Trigger post-merge workflow
     * @param {Object} pushData - Push data
     * @param {Object} event - Original event
     * @returns {Promise<Object>} Post-merge result
     * @private
     */
    async triggerPostMergeWorkflow(pushData, event) {
        log('info', `Triggering post-merge workflow for ${pushData.branch}`);
        
        return {
            status: 'post_merge_triggered',
            branch: pushData.branch,
            commits: pushData.commits.length
        };
    }

    /**
     * Handle check success
     * @param {Object} checkData - Check data
     * @param {Object} event - Original event
     * @returns {Promise<Object>} Success result
     * @private
     */
    async handleCheckSuccess(checkData, event) {
        log('info', `Handling check success: ${checkData.name}`);
        
        return {
            status: 'check_success',
            check_name: checkData.name,
            message: 'Check completed successfully'
        };
    }

    /**
     * Handle check suite completion
     * @param {Object} suiteData - Check suite data
     * @param {Object} event - Original event
     * @returns {Promise<Object>} Completion result
     * @private
     */
    async handleCheckSuiteCompletion(suiteData, event) {
        log('info', `Handling check suite completion: ${suiteData.conclusion}`);
        
        return {
            status: 'check_suite_completed',
            conclusion: suiteData.conclusion,
            head_sha: suiteData.head_sha
        };
    }

    /**
     * Summarize payload for logging
     * @param {Object} payload - Event payload
     * @returns {Object} Summarized payload
     * @private
     */
    summarizePayload(payload) {
        return {
            action: payload.action,
            repository: payload.repository?.full_name,
            pr_number: payload.pull_request?.number,
            ref: payload.ref,
            commits_count: payload.commits?.length,
            check_name: payload.check_run?.name || payload.check_suite?.id
        };
    }

    /**
     * Setup HTTP interceptors
     * @private
     */
    setupHttpInterceptors() {
        // Request interceptor
        this.httpClient.interceptors.request.use(
            (config) => {
                log('debug', `AgentAPI request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                log('error', `AgentAPI request error: ${error.message}`);
                return Promise.reject(error);
            }
        );

        // Response interceptor
        this.httpClient.interceptors.response.use(
            (response) => {
                log('debug', `AgentAPI response: ${response.status} ${response.config.url}`);
                return response;
            },
            (error) => {
                const message = error.response?.data?.message || error.message;
                log('error', `AgentAPI response error: ${error.response?.status} ${message}`);
                return Promise.reject(error);
            }
        );
    }

    /**
     * Validate configuration
     * @private
     */
    async validateConfiguration() {
        if (!this.config.agentapi.baseUrl) {
            throw new Error('AgentAPI base URL is required');
        }

        // Validate URL format
        try {
            new URL(this.config.agentapi.baseUrl);
        } catch (error) {
            throw new Error('Invalid AgentAPI base URL format');
        }
    }

    /**
     * Test connections to external services
     * @private
     */
    async testConnections() {
        try {
            // Test AgentAPI connection
            await this.httpClient.get('/health');
            log('info', 'AgentAPI connection test successful');
        } catch (error) {
            log('warning', `AgentAPI connection test failed: ${error.message}`);
            // Don't throw here as AgentAPI might not be running during initialization
        }
    }

    /**
     * Update metrics
     * @param {boolean} success - Whether processing was successful
     * @param {number} processingTime - Processing time in milliseconds
     * @private
     */
    updateMetrics(success, processingTime) {
        this.metrics.totalProcessed++;
        
        if (success) {
            this.metrics.totalSuccessful++;
        } else {
            this.metrics.totalFailed++;
        }
        
        this.metrics.processingTimes.push(processingTime);
        this.metrics.lastProcessedTime = new Date();
        
        // Keep only last 1000 processing times
        if (this.metrics.processingTimes.length > 1000) {
            this.metrics.processingTimes = this.metrics.processingTimes.slice(-1000);
        }
        
        // Calculate average processing time
        this.metrics.averageProcessingTime = 
            this.metrics.processingTimes.reduce((a, b) => a + b, 0) / this.metrics.processingTimes.length;
    }

    /**
     * Get processor metrics
     * @returns {Object} Processor metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.startTime,
            activeJobs: this.activeJobs.size,
            successRate: this.metrics.totalProcessed > 0 ? 
                this.metrics.totalSuccessful / this.metrics.totalProcessed : 0,
            agentApiSuccessRate: this.metrics.agentApiCalls > 0 ?
                (this.metrics.agentApiCalls - this.metrics.agentApiFailures) / this.metrics.agentApiCalls : 0
        };
    }

    /**
     * Get processor health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const health = {
            status: 'healthy',
            activeJobs: this.activeJobs.size,
            metrics: this.getMetrics()
        };

        // Test AgentAPI connectivity
        try {
            await this.httpClient.get('/health');
            health.agentapi = 'connected';
        } catch (error) {
            health.agentapi = 'disconnected';
            health.status = 'degraded';
        }

        return health;
    }

    /**
     * Get active jobs status
     * @returns {Array} Active jobs information
     */
    getActiveJobs() {
        return Array.from(this.activeJobs.values()).map(job => ({
            jobId: job.job.id,
            eventId: job.event.id,
            eventType: job.event.type,
            status: job.status,
            startTime: job.startTime,
            duration: Date.now() - job.startTime
        }));
    }

    /**
     * Shutdown the event processor
     */
    async shutdown() {
        try {
            // Wait for active jobs to complete
            if (this.activeJobs.size > 0) {
                log('info', `Waiting for ${this.activeJobs.size} active jobs to complete`);
                
                const timeout = setTimeout(() => {
                    log('warning', 'Timeout waiting for jobs to complete, forcing shutdown');
                    this.activeJobs.clear();
                }, 30000); // 30 second timeout

                while (this.activeJobs.size > 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                clearTimeout(timeout);
            }
            
            log('info', 'Event Processor shutdown completed');
        } catch (error) {
            log('error', `Error during event processor shutdown: ${error.message}`);
            throw error;
        }
    }
}

export default EventProcessor;

