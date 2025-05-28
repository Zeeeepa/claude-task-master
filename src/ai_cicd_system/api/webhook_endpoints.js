/**
 * @fileoverview Webhook API Endpoints
 * @description RESTful endpoints for webhook registration, management, and monitoring
 */

import express from 'express';
import { GitHubWebhookHandler } from '../webhooks/github_webhook_handler.js';
import { createWebhookMiddlewareStack, createErrorHandlingMiddleware } from '../middleware/webhook_middleware.js';
import { WEBHOOK_CONFIG } from '../config/webhook_config.js';
import { log } from '../../scripts/modules/utils.js';

/**
 * Create webhook API router
 * @param {Object} config - Configuration options
 * @returns {express.Router} Configured router
 */
export function createWebhookRouter(config = {}) {
    const router = express.Router();
    
    // Initialize webhook handler
    const webhookHandler = new GitHubWebhookHandler(config);
    
    // Apply middleware stack
    const middlewareStack = createWebhookMiddlewareStack(config.middleware);
    router.use(middlewareStack);

    // Initialize handler on first request
    let handlerInitialized = false;
    const ensureHandlerInitialized = async (req, res, next) => {
        if (!handlerInitialized) {
            try {
                await webhookHandler.initialize();
                handlerInitialized = true;
            } catch (error) {
                log('error', `Failed to initialize webhook handler: ${error.message}`);
                return res.status(503).json({
                    success: false,
                    error: {
                        type: 'initialization_error',
                        message: 'Webhook handler initialization failed'
                    }
                });
            }
        }
        next();
    };

    /**
     * POST /api/webhooks/github
     * Main webhook endpoint for GitHub events
     */
    router.post('/github', ensureHandlerInitialized, async (req, res) => {
        try {
            await webhookHandler.handleWebhook(req, res);
        } catch (error) {
            // Error handling is done within the webhook handler
            // This catch is for any unexpected errors
            log('error', `Unexpected error in webhook endpoint: ${error.message}`);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: {
                        type: 'unexpected_error',
                        message: 'An unexpected error occurred'
                    }
                });
            }
        }
    });

    /**
     * GET /api/webhooks/health
     * Health check endpoint
     */
    router.get('/health', (req, res) => {
        try {
            const health = webhookHandler.getHealthStatus();
            const statusCode = health.status === 'healthy' ? 200 : 503;
            
            res.status(statusCode).json({
                success: true,
                data: health
            });
        } catch (error) {
            log('error', `Health check failed: ${error.message}`);
            res.status(500).json({
                success: false,
                error: {
                    type: 'health_check_error',
                    message: 'Health check failed'
                }
            });
        }
    });

    /**
     * GET /api/webhooks/status
     * Webhook statistics and status
     */
    router.get('/status', ensureHandlerInitialized, (req, res) => {
        try {
            const stats = webhookHandler.getStats();
            const health = webhookHandler.getHealthStatus();
            
            res.json({
                success: true,
                data: {
                    status: health.status,
                    statistics: stats,
                    configuration: {
                        endpoint: WEBHOOK_CONFIG.endpoint,
                        supportedEvents: Object.keys(WEBHOOK_CONFIG.events || {}),
                        rateLimitEnabled: !!WEBHOOK_CONFIG.rate_limit,
                        securityEnabled: !!WEBHOOK_CONFIG.security
                    },
                    uptime: process.uptime(),
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            log('error', `Status check failed: ${error.message}`);
            res.status(500).json({
                success: false,
                error: {
                    type: 'status_error',
                    message: 'Status check failed'
                }
            });
        }
    });

    /**
     * GET /api/webhooks/metrics
     * Detailed metrics for monitoring
     */
    router.get('/metrics', ensureHandlerInitialized, (req, res) => {
        try {
            const stats = webhookHandler.getStats();
            const health = webhookHandler.getHealthStatus();
            
            // Format metrics for monitoring systems (Prometheus-style)
            const metrics = {
                webhook_events_total: stats.totalEvents,
                webhook_events_successful: stats.successfulEvents,
                webhook_events_failed: stats.failedEvents,
                webhook_events_skipped: stats.skippedEvents,
                webhook_processing_time_avg_ms: stats.averageProcessingTime,
                webhook_handler_healthy: health.status === 'healthy' ? 1 : 0,
                webhook_handler_uptime_seconds: process.uptime()
            };

            res.json({
                success: true,
                data: {
                    metrics,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            log('error', `Metrics collection failed: ${error.message}`);
            res.status(500).json({
                success: false,
                error: {
                    type: 'metrics_error',
                    message: 'Metrics collection failed'
                }
            });
        }
    });

    /**
     * POST /api/webhooks/replay/:eventId
     * Replay a failed webhook event
     */
    router.post('/replay/:eventId', ensureHandlerInitialized, async (req, res) => {
        const { eventId } = req.params;
        
        try {
            // This would retrieve the event from storage and replay it
            // For now, return a placeholder response
            log('info', `Webhook replay requested for event ${eventId}`);
            
            res.json({
                success: true,
                message: 'Event replay initiated',
                data: {
                    eventId,
                    status: 'queued',
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            log('error', `Event replay failed for ${eventId}: ${error.message}`);
            res.status(500).json({
                success: false,
                error: {
                    type: 'replay_error',
                    message: 'Event replay failed'
                }
            });
        }
    });

    /**
     * GET /api/webhooks/events
     * List recent webhook events
     */
    router.get('/events', ensureHandlerInitialized, async (req, res) => {
        try {
            const {
                limit = 50,
                offset = 0,
                status,
                type,
                repository
            } = req.query;

            // This would query the webhook_events table
            // For now, return a placeholder response
            const events = [];

            res.json({
                success: true,
                data: {
                    events,
                    pagination: {
                        limit: parseInt(limit),
                        offset: parseInt(offset),
                        total: 0
                    },
                    filters: {
                        status,
                        type,
                        repository
                    }
                }
            });
        } catch (error) {
            log('error', `Failed to list webhook events: ${error.message}`);
            res.status(500).json({
                success: false,
                error: {
                    type: 'list_error',
                    message: 'Failed to list webhook events'
                }
            });
        }
    });

    /**
     * GET /api/webhooks/events/:eventId
     * Get specific webhook event details
     */
    router.get('/events/:eventId', ensureHandlerInitialized, async (req, res) => {
        const { eventId } = req.params;
        
        try {
            // This would query the webhook_events table for the specific event
            // For now, return a placeholder response
            log('info', `Webhook event details requested for ${eventId}`);
            
            res.json({
                success: true,
                data: {
                    eventId,
                    message: 'Event details would be returned here',
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            log('error', `Failed to get event details for ${eventId}: ${error.message}`);
            res.status(500).json({
                success: false,
                error: {
                    type: 'event_error',
                    message: 'Failed to get event details'
                }
            });
        }
    });

    /**
     * DELETE /api/webhooks/events/:eventId
     * Delete a webhook event record
     */
    router.delete('/events/:eventId', ensureHandlerInitialized, async (req, res) => {
        const { eventId } = req.params;
        
        try {
            // This would delete the event from the webhook_events table
            // For now, return a placeholder response
            log('info', `Webhook event deletion requested for ${eventId}`);
            
            res.json({
                success: true,
                message: 'Event deleted successfully',
                data: {
                    eventId,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            log('error', `Failed to delete event ${eventId}: ${error.message}`);
            res.status(500).json({
                success: false,
                error: {
                    type: 'delete_error',
                    message: 'Failed to delete event'
                }
            });
        }
    });

    /**
     * POST /api/webhooks/reset-stats
     * Reset webhook statistics
     */
    router.post('/reset-stats', ensureHandlerInitialized, (req, res) => {
        try {
            webhookHandler.resetStats();
            
            res.json({
                success: true,
                message: 'Statistics reset successfully',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            log('error', `Failed to reset statistics: ${error.message}`);
            res.status(500).json({
                success: false,
                error: {
                    type: 'reset_error',
                    message: 'Failed to reset statistics'
                }
            });
        }
    });

    /**
     * GET /api/webhooks/config
     * Get webhook configuration (sanitized)
     */
    router.get('/config', (req, res) => {
        try {
            const sanitizedConfig = {
                endpoint: WEBHOOK_CONFIG.endpoint,
                events: WEBHOOK_CONFIG.events,
                content_type: WEBHOOK_CONFIG.content_type,
                ssl_verification: WEBHOOK_CONFIG.ssl_verification,
                retry_config: WEBHOOK_CONFIG.retry_config,
                rate_limit: {
                    window_ms: WEBHOOK_CONFIG.rate_limit.window_ms,
                    max_requests: WEBHOOK_CONFIG.rate_limit.max_requests
                },
                processing: WEBHOOK_CONFIG.processing,
                monitoring: WEBHOOK_CONFIG.monitoring
                // Note: secret and sensitive data are excluded
            };

            res.json({
                success: true,
                data: sanitizedConfig
            });
        } catch (error) {
            log('error', `Failed to get configuration: ${error.message}`);
            res.status(500).json({
                success: false,
                error: {
                    type: 'config_error',
                    message: 'Failed to get configuration'
                }
            });
        }
    });

    // Apply error handling middleware
    router.use(createErrorHandlingMiddleware());

    return router;
}

/**
 * Create webhook management router for admin operations
 * @param {Object} config - Configuration options
 * @returns {express.Router} Admin router
 */
export function createWebhookAdminRouter(config = {}) {
    const router = express.Router();

    // Add authentication middleware here if needed
    // router.use(authenticationMiddleware);

    /**
     * POST /admin/webhooks/cleanup
     * Clean up old webhook events
     */
    router.post('/cleanup', async (req, res) => {
        try {
            const { olderThan = 30 } = req.body; // days
            
            // This would clean up old events from the database
            log('info', `Webhook cleanup initiated for events older than ${olderThan} days`);
            
            res.json({
                success: true,
                message: 'Cleanup initiated',
                data: {
                    olderThan,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            log('error', `Webhook cleanup failed: ${error.message}`);
            res.status(500).json({
                success: false,
                error: {
                    type: 'cleanup_error',
                    message: 'Cleanup failed'
                }
            });
        }
    });

    return router;
}

export default {
    createWebhookRouter,
    createWebhookAdminRouter
};

