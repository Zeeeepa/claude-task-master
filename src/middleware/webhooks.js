/**
 * @fileoverview Webhook Middleware
 * @description Express middleware for handling incoming webhooks from external services
 */

import express from 'express';
import crypto from 'crypto';
import { WebhookManager } from '../integrations/WebhookManager.js';
import { integrationConfig } from '../config/integrations.js';

/**
 * Create webhook middleware router
 */
export function createWebhookMiddleware(webhookManager, config = {}) {
    const router = express.Router();
    const webhookConfig = {
        ...integrationConfig.webhook,
        ...config
    };
    
    // Middleware to parse raw body for signature verification
    router.use('/webhooks', express.raw({ 
        type: 'application/json',
        limit: webhookConfig.maxPayloadSize
    }));
    
    // Generic webhook handler
    router.post('/webhooks/:service', async (req, res) => {
        const startTime = Date.now();
        const service = req.params.service;
        
        try {
            // Validate service
            if (!isValidService(service)) {
                return res.status(400).json({
                    error: 'Invalid service',
                    service,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Parse body
            let body;
            try {
                body = JSON.parse(req.body.toString());
            } catch (error) {
                return res.status(400).json({
                    error: 'Invalid JSON payload',
                    timestamp: new Date().toISOString()
                });
            }
            
            // Create webhook payload
            const webhookPayload = {
                headers: req.headers,
                body,
                rawBody: req.body.toString(),
                service,
                timestamp: new Date().toISOString(),
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.get('User-Agent')
            };
            
            // Handle webhook
            const result = await webhookManager.handleIncomingWebhook(service, webhookPayload);
            
            const processingTime = Date.now() - startTime;
            
            res.status(200).json({
                success: true,
                eventId: result.eventId,
                processingTime,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            const processingTime = Date.now() - startTime;
            
            console.error(`Webhook error for ${service}:`, error);
            
            res.status(500).json({
                error: 'Webhook processing failed',
                message: error.message,
                service,
                processingTime,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Service-specific webhook endpoints
    
    // Linear webhooks
    router.post('/webhooks/linear', async (req, res) => {
        await handleServiceWebhook('linear', req, res, webhookManager);
    });
    
    // GitHub webhooks
    router.post('/webhooks/github', async (req, res) => {
        await handleServiceWebhook('github', req, res, webhookManager);
    });
    
    // Claude Code webhooks
    router.post('/webhooks/claude-code', async (req, res) => {
        await handleServiceWebhook('claudeCode', req, res, webhookManager);
    });
    
    // Agent API webhooks
    router.post('/webhooks/agent-api', async (req, res) => {
        await handleServiceWebhook('agentapi', req, res, webhookManager);
    });
    
    // Webhook status endpoint
    router.get('/webhooks/status', (req, res) => {
        const status = webhookManager.getHealthStatus();
        const stats = webhookManager.getWebhookStats();
        
        res.json({
            status: 'ok',
            webhookManager: status,
            stats,
            timestamp: new Date().toISOString()
        });
    });
    
    // Webhook history endpoint
    router.get('/webhooks/history', (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        const history = webhookManager.getWebhookHistory(limit);
        
        res.json({
            history,
            count: history.length,
            timestamp: new Date().toISOString()
        });
    });
    
    // Failed webhooks endpoint
    router.get('/webhooks/failed', (req, res) => {
        const failedWebhooks = webhookManager.getFailedWebhooks();
        
        res.json({
            failedWebhooks,
            count: failedWebhooks.length,
            timestamp: new Date().toISOString()
        });
    });
    
    // Retry failed webhooks endpoint
    router.post('/webhooks/retry', async (req, res) => {
        try {
            const { webhookId } = req.body;
            const results = await webhookManager.retryFailedWebhooks(webhookId);
            
            res.json({
                success: true,
                results,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                error: 'Failed to retry webhooks',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    return router;
}

/**
 * Handle service-specific webhook
 */
async function handleServiceWebhook(service, req, res, webhookManager) {
    const startTime = Date.now();
    
    try {
        // Parse body
        let body;
        try {
            body = JSON.parse(req.body.toString());
        } catch (error) {
            return res.status(400).json({
                error: 'Invalid JSON payload',
                service,
                timestamp: new Date().toISOString()
            });
        }
        
        // Create webhook payload with service-specific handling
        const webhookPayload = createServiceWebhookPayload(service, req, body);
        
        // Handle webhook
        const result = await webhookManager.handleIncomingWebhook(service, webhookPayload);
        
        const processingTime = Date.now() - startTime;
        
        // Service-specific response format
        const response = createServiceResponse(service, result, processingTime);
        
        res.status(200).json(response);
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        
        console.error(`${service} webhook error:`, error);
        
        const errorResponse = createServiceErrorResponse(service, error, processingTime);
        
        res.status(500).json(errorResponse);
    }
}

/**
 * Create service-specific webhook payload
 */
function createServiceWebhookPayload(service, req, body) {
    const basePayload = {
        headers: req.headers,
        body,
        rawBody: req.body.toString(),
        service,
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    };
    
    switch (service) {
        case 'linear':
            return {
                ...basePayload,
                event: req.headers['x-linear-event'],
                signature: req.headers['x-linear-signature'],
                delivery: req.headers['x-linear-delivery']
            };
            
        case 'github':
            return {
                ...basePayload,
                event: req.headers['x-github-event'],
                signature: req.headers['x-hub-signature-256'],
                delivery: req.headers['x-github-delivery'],
                hookId: req.headers['x-github-hook-id']
            };
            
        case 'claudeCode':
            return {
                ...basePayload,
                event: req.headers['x-claude-event'],
                signature: req.headers['x-claude-signature'],
                delivery: req.headers['x-claude-delivery']
            };
            
        case 'agentapi':
            return {
                ...basePayload,
                event: req.headers['x-agent-event'],
                signature: req.headers['x-agent-signature'],
                delivery: req.headers['x-agent-delivery']
            };
            
        default:
            return basePayload;
    }
}

/**
 * Create service-specific response
 */
function createServiceResponse(service, result, processingTime) {
    const baseResponse = {
        success: true,
        eventId: result.eventId,
        processingTime,
        timestamp: new Date().toISOString()
    };
    
    switch (service) {
        case 'linear':
            return {
                ...baseResponse,
                message: 'Linear webhook processed successfully'
            };
            
        case 'github':
            return {
                ...baseResponse,
                message: 'GitHub webhook processed successfully'
            };
            
        case 'claudeCode':
            return {
                ...baseResponse,
                message: 'Claude Code webhook processed successfully'
            };
            
        case 'agentapi':
            return {
                ...baseResponse,
                message: 'Agent API webhook processed successfully'
            };
            
        default:
            return baseResponse;
    }
}

/**
 * Create service-specific error response
 */
function createServiceErrorResponse(service, error, processingTime) {
    const baseResponse = {
        error: 'Webhook processing failed',
        message: error.message,
        service,
        processingTime,
        timestamp: new Date().toISOString()
    };
    
    switch (service) {
        case 'linear':
            return {
                ...baseResponse,
                details: 'Linear webhook processing failed'
            };
            
        case 'github':
            return {
                ...baseResponse,
                details: 'GitHub webhook processing failed'
            };
            
        case 'claudeCode':
            return {
                ...baseResponse,
                details: 'Claude Code webhook processing failed'
            };
            
        case 'agentapi':
            return {
                ...baseResponse,
                details: 'Agent API webhook processing failed'
            };
            
        default:
            return baseResponse;
    }
}

/**
 * Validate service name
 */
function isValidService(service) {
    const validServices = ['linear', 'github', 'claudeCode', 'agentapi'];
    return validServices.includes(service);
}

/**
 * Webhook security middleware
 */
export function webhookSecurityMiddleware(config = {}) {
    return (req, res, next) => {
        // Rate limiting per IP
        const rateLimitKey = `webhook_${req.ip}`;
        // Implementation would depend on your rate limiting strategy
        
        // Request size validation
        const contentLength = parseInt(req.get('content-length') || '0');
        const maxSize = config.maxPayloadSize || 10 * 1024 * 1024; // 10MB default
        
        if (contentLength > maxSize) {
            return res.status(413).json({
                error: 'Payload too large',
                maxSize,
                receivedSize: contentLength,
                timestamp: new Date().toISOString()
            });
        }
        
        // Content type validation
        const contentType = req.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            return res.status(400).json({
                error: 'Invalid content type',
                expected: 'application/json',
                received: contentType,
                timestamp: new Date().toISOString()
            });
        }
        
        next();
    };
}

/**
 * Webhook logging middleware
 */
export function webhookLoggingMiddleware() {
    return (req, res, next) => {
        const startTime = Date.now();
        
        // Log incoming webhook
        console.log(`[WEBHOOK] ${req.method} ${req.path} from ${req.ip}`);
        
        // Override res.json to log response
        const originalJson = res.json;
        res.json = function(data) {
            const processingTime = Date.now() - startTime;
            console.log(`[WEBHOOK] Response ${res.statusCode} in ${processingTime}ms`);
            return originalJson.call(this, data);
        };
        
        next();
    };
}

/**
 * Webhook error handling middleware
 */
export function webhookErrorHandler() {
    return (error, req, res, next) => {
        console.error('[WEBHOOK ERROR]:', error);
        
        // Don't expose internal errors in production
        const isDevelopment = process.env.NODE_ENV === 'development';
        
        const errorResponse = {
            error: 'Internal server error',
            message: isDevelopment ? error.message : 'An error occurred processing the webhook',
            timestamp: new Date().toISOString(),
            path: req.path,
            method: req.method
        };
        
        if (isDevelopment) {
            errorResponse.stack = error.stack;
        }
        
        res.status(500).json(errorResponse);
    };
}

/**
 * Create complete webhook middleware stack
 */
export function createWebhookMiddlewareStack(webhookManager, config = {}) {
    const router = express.Router();
    
    // Apply middleware in order
    router.use(webhookLoggingMiddleware());
    router.use(webhookSecurityMiddleware(config));
    
    // Add webhook routes
    router.use(createWebhookMiddleware(webhookManager, config));
    
    // Error handling
    router.use(webhookErrorHandler());
    
    return router;
}

export default {
    createWebhookMiddleware,
    createWebhookMiddlewareStack,
    webhookSecurityMiddleware,
    webhookLoggingMiddleware,
    webhookErrorHandler
};

