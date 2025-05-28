/**
 * @fileoverview GitHub Webhook Handler
 * @description Main webhook processing logic with error handling and response management
 */

import { EventProcessor } from './event_processor.js';
import { WebhookValidator } from './webhook_validator.js';
import { WebhookSecurity } from './webhook_security.js';
import { WEBHOOK_CONFIG, EVENT_STATUS } from '../config/webhook_config.js';
import { log } from '../../scripts/modules/utils.js';

/**
 * Main GitHub webhook handler
 */
export class GitHubWebhookHandler {
    constructor(config = {}) {
        this.config = {
            ...WEBHOOK_CONFIG,
            ...config
        };

        this.eventProcessor = new EventProcessor(config);
        this.validator = new WebhookValidator(config);
        this.security = new WebhookSecurity(config);
        
        this.isInitialized = false;
        this.stats = {
            totalEvents: 0,
            successfulEvents: 0,
            failedEvents: 0,
            skippedEvents: 0,
            averageProcessingTime: 0
        };
    }

    /**
     * Initialize the webhook handler
     */
    async initialize() {
        try {
            await this.eventProcessor.initialize();
            this.isInitialized = true;
            log('info', 'GitHub webhook handler initialized successfully');
        } catch (error) {
            log('error', `Failed to initialize webhook handler: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle incoming webhook request
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<Object>} Response data
     */
    async handleWebhook(req, res) {
        const startTime = Date.now();
        let eventId = req.headers['x-github-delivery'] || `unknown-${Date.now()}`;

        try {
            // Check if handler is initialized
            if (!this.isInitialized) {
                return this.sendError(res, 503, 'Webhook handler not initialized', eventId);
            }

            log('info', `Processing webhook event ${eventId}`, {
                eventType: req.headers['x-github-event'],
                userAgent: req.headers['user-agent']
            });

            // Step 1: Validate webhook signature and origin
            await this.security.validateSignature(req);
            await this.security.validateOrigin(req);

            // Step 2: Parse and validate event
            const event = await this.validator.parseEvent(req);
            eventId = event.id; // Use parsed event ID

            // Step 3: Additional payload validation
            await this.security.validatePayload(event);

            // Step 4: Process event through pipeline
            const result = await this.eventProcessor.process(event);

            // Step 5: Update statistics
            this._updateStats(result, Date.now() - startTime);

            // Step 6: Return response
            return this.sendResponse(res, result, eventId);

        } catch (error) {
            // Update failure statistics
            this.stats.totalEvents++;
            this.stats.failedEvents++;

            // Log error with context
            log('error', `Webhook processing failed for event ${eventId}: ${error.message}`, {
                eventType: req.headers['x-github-event'],
                error: error.stack,
                duration: Date.now() - startTime
            });

            // Return error response
            return this.handleError(res, error, eventId);
        }
    }

    /**
     * Send successful response
     * @param {Object} res - Express response object
     * @param {Object} result - Processing result
     * @param {string} eventId - Event ID
     * @returns {Object} Response data
     */
    sendResponse(res, result, eventId) {
        const responseData = {
            success: true,
            eventId: eventId,
            status: result.status,
            message: this._getStatusMessage(result.status),
            data: {
                tasksCreated: result.tasks.length,
                processingTime: result.duration,
                steps: result.steps.map(step => ({
                    name: step.name,
                    status: step.status,
                    duration: step.duration
                }))
            }
        };

        // Set appropriate status code
        let statusCode = 200;
        if (result.status === EVENT_STATUS.SKIPPED) {
            statusCode = 202; // Accepted but not processed
        } else if (result.status === EVENT_STATUS.FAILED) {
            statusCode = 422; // Unprocessable Entity
        }

        res.status(statusCode).json(responseData);

        log('info', `Webhook response sent for event ${eventId}`, {
            status: result.status,
            statusCode,
            tasksCreated: result.tasks.length,
            duration: result.duration
        });

        return responseData;
    }

    /**
     * Handle and send error response
     * @param {Object} res - Express response object
     * @param {Error} error - Error object
     * @param {string} eventId - Event ID
     * @returns {Object} Error response data
     */
    handleError(res, error, eventId) {
        // Determine appropriate status code based on error type
        let statusCode = 500;
        let errorType = 'internal_error';

        if (error.message.includes('signature')) {
            statusCode = 401;
            errorType = 'authentication_error';
        } else if (error.message.includes('Unsupported event') || error.message.includes('Invalid')) {
            statusCode = 400;
            errorType = 'validation_error';
        } else if (error.message.includes('not initialized')) {
            statusCode = 503;
            errorType = 'service_unavailable';
        }

        const errorResponse = {
            success: false,
            eventId: eventId,
            error: {
                type: errorType,
                message: error.message,
                timestamp: new Date().toISOString()
            }
        };

        // Don't expose internal error details in production
        if (process.env.NODE_ENV === 'production' && statusCode === 500) {
            errorResponse.error.message = 'Internal server error';
        }

        res.status(statusCode).json(errorResponse);

        return errorResponse;
    }

    /**
     * Send error response with specific status code
     * @param {Object} res - Express response object
     * @param {number} statusCode - HTTP status code
     * @param {string} message - Error message
     * @param {string} eventId - Event ID
     * @returns {Object} Error response data
     */
    sendError(res, statusCode, message, eventId) {
        const errorResponse = {
            success: false,
            eventId: eventId,
            error: {
                message: message,
                timestamp: new Date().toISOString()
            }
        };

        res.status(statusCode).json(errorResponse);
        return errorResponse;
    }

    /**
     * Get health status of webhook handler
     * @returns {Object} Health status
     */
    getHealthStatus() {
        return {
            status: this.isInitialized ? 'healthy' : 'unhealthy',
            initialized: this.isInitialized,
            uptime: process.uptime(),
            stats: { ...this.stats },
            config: {
                endpoint: this.config.endpoint,
                supportedEvents: Object.keys(this.validator.supportedEvents),
                rateLimitEnabled: !!this.config.rate_limit,
                securityEnabled: !!this.config.security
            }
        };
    }

    /**
     * Get processing statistics
     * @returns {Object} Processing statistics
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalEvents > 0 ? 
                (this.stats.successfulEvents / this.stats.totalEvents * 100).toFixed(2) + '%' : '0%',
            failureRate: this.stats.totalEvents > 0 ? 
                (this.stats.failedEvents / this.stats.totalEvents * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalEvents: 0,
            successfulEvents: 0,
            failedEvents: 0,
            skippedEvents: 0,
            averageProcessingTime: 0
        };
        log('info', 'Webhook handler statistics reset');
    }

    /**
     * Shutdown webhook handler gracefully
     */
    async shutdown() {
        try {
            log('info', 'Shutting down webhook handler...');
            
            // Wait for any ongoing processing to complete
            const maxWaitTime = 30000; // 30 seconds
            const startTime = Date.now();
            
            while (this.eventProcessor.processingQueue.size > 0 && 
                   (Date.now() - startTime) < maxWaitTime) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            this.isInitialized = false;
            log('info', 'Webhook handler shutdown complete');
        } catch (error) {
            log('error', `Error during webhook handler shutdown: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update processing statistics
     * @param {Object} result - Processing result
     * @param {number} duration - Processing duration
     * @private
     */
    _updateStats(result, duration) {
        this.stats.totalEvents++;
        
        switch (result.status) {
            case EVENT_STATUS.COMPLETED:
                this.stats.successfulEvents++;
                break;
            case EVENT_STATUS.FAILED:
                this.stats.failedEvents++;
                break;
            case EVENT_STATUS.SKIPPED:
                this.stats.skippedEvents++;
                break;
        }

        // Update average processing time
        const totalProcessingTime = this.stats.averageProcessingTime * (this.stats.totalEvents - 1) + duration;
        this.stats.averageProcessingTime = Math.round(totalProcessingTime / this.stats.totalEvents);
    }

    /**
     * Get status message for result
     * @param {string} status - Processing status
     * @returns {string} Status message
     * @private
     */
    _getStatusMessage(status) {
        const messages = {
            [EVENT_STATUS.COMPLETED]: 'Event processed successfully',
            [EVENT_STATUS.FAILED]: 'Event processing failed',
            [EVENT_STATUS.SKIPPED]: 'Event skipped (duplicate or unsupported)',
            [EVENT_STATUS.PENDING]: 'Event processing pending',
            [EVENT_STATUS.PROCESSING]: 'Event currently processing'
        };

        return messages[status] || 'Unknown status';
    }

    /**
     * Create webhook handler with default configuration
     * @param {Object} config - Configuration overrides
     * @returns {GitHubWebhookHandler} Configured handler
     */
    static create(config = {}) {
        return new GitHubWebhookHandler(config);
    }

    /**
     * Create webhook handler for testing
     * @param {Object} config - Test configuration
     * @returns {GitHubWebhookHandler} Test handler
     */
    static createForTesting(config = {}) {
        const testConfig = {
            ...config,
            database: {
                enable_mock: true,
                ...config.database
            },
            github: {
                timeout: 1000,
                retries: 1,
                ...config.github
            }
        };

        return new GitHubWebhookHandler(testConfig);
    }
}

export default GitHubWebhookHandler;

