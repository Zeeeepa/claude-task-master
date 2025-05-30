/**
 * @fileoverview Webhook Manager
 * @description Centralized webhook management for all external service integrations
 */

import EventEmitter from 'events';
import crypto from 'crypto';
import { integrationConfig } from '../config/integrations.js';

/**
 * Webhook Manager Service
 * Handles webhook registration, validation, and routing for all services
 */
export class WebhookManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            ...integrationConfig.webhook,
            ...config
        };
        
        this.registeredWebhooks = new Map();
        this.webhookHandlers = new Map();
        this.failedWebhooks = new Map();
        this.webhookHistory = [];
        
        this.isInitialized = false;
        this.metrics = {
            totalWebhooks: 0,
            successfulWebhooks: 0,
            failedWebhooks: 0,
            retriedWebhooks: 0,
            lastWebhook: null,
            averageProcessingTime: 0
        };
        
        // Service configurations
        this.serviceConfigs = {
            linear: {
                secret: integrationConfig.linear.webhookSecret,
                signatureHeader: 'x-linear-signature',
                eventHeader: 'x-linear-event'
            },
            github: {
                secret: integrationConfig.github.webhookSecret,
                signatureHeader: 'x-hub-signature-256',
                eventHeader: 'x-github-event'
            },
            claudeCode: {
                secret: integrationConfig.claudeCode.webhookSecret,
                signatureHeader: 'x-claude-signature',
                eventHeader: 'x-claude-event'
            },
            agentapi: {
                secret: integrationConfig.agentapi.webhookSecret,
                signatureHeader: 'x-agent-signature',
                eventHeader: 'x-agent-event'
            }
        };
    }
    
    /**
     * Initialize the webhook manager
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        
        try {
            // Set up default webhook handlers
            this.setupDefaultHandlers();
            
            this.isInitialized = true;
            this.emit('initialized');
            console.log('Webhook manager initialized successfully');
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to initialize webhook manager: ${error.message}`);
        }
    }
    
    /**
     * Register a webhook for a service
     */
    async registerWebhook(service, endpoint, events = []) {
        try {
            if (!this.serviceConfigs[service]) {
                throw new Error(`Unknown service: ${service}`);
            }
            
            const webhookId = this.generateWebhookId(service, endpoint);
            
            const webhookConfig = {
                id: webhookId,
                service,
                endpoint,
                events: Array.isArray(events) ? events : [events],
                secret: this.serviceConfigs[service].secret,
                signatureHeader: this.serviceConfigs[service].signatureHeader,
                eventHeader: this.serviceConfigs[service].eventHeader,
                active: true,
                createdAt: new Date().toISOString(),
                lastTriggered: null,
                triggerCount: 0,
                failureCount: 0
            };
            
            this.registeredWebhooks.set(webhookId, webhookConfig);
            
            this.emit('webhook.registered', { 
                webhookId, 
                service, 
                endpoint, 
                events 
            });
            
            return {
                webhookId,
                service,
                endpoint,
                events,
                active: true
            };
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to register webhook: ${error.message}`);
        }
    }
    
    /**
     * Handle incoming webhook
     */
    async handleIncomingWebhook(service, payload) {
        const startTime = Date.now();
        
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }
            
            // Extract headers and body
            const headers = payload.headers || {};
            const body = payload.body || payload;
            const rawBody = payload.rawBody || JSON.stringify(body);
            
            // Validate webhook signature if security is enabled
            if (this.config.enableSecurity) {
                const isValid = await this.validateWebhookSignature(
                    service,
                    rawBody,
                    headers
                );
                
                if (!isValid) {
                    throw new Error('Invalid webhook signature');
                }
            }
            
            // Extract event type
            const eventType = this.extractEventType(service, headers, body);
            
            // Create webhook event
            const webhookEvent = {
                id: this.generateEventId(),
                service,
                eventType,
                headers,
                body,
                timestamp: new Date().toISOString(),
                processed: false
            };
            
            this.emit('webhook.received', webhookEvent);
            
            // Route to appropriate handler
            const result = await this.routeWebhookToHandler(service, eventType, webhookEvent);
            
            // Update metrics
            const processingTime = Date.now() - startTime;
            this.updateMetrics(processingTime, false);
            
            // Store in history
            this.storeWebhookInHistory({
                ...webhookEvent,
                processed: true,
                processingTime,
                result
            });
            
            this.emit('webhook.processed', { 
                ...webhookEvent, 
                processingTime,
                result 
            });
            
            return {
                success: true,
                eventId: webhookEvent.id,
                processingTime,
                result
            };
        } catch (error) {
            // Update metrics
            const processingTime = Date.now() - startTime;
            this.updateMetrics(processingTime, true);
            
            this.emit('error', error);
            
            // Store failed webhook for retry
            await this.storeFailed Webhook(service, payload, error);
            
            throw new Error(`Failed to handle webhook: ${error.message}`);
        }
    }
    
    /**
     * Validate webhook signature
     */
    async validateWebhookSignature(service, payload, headers) {
        try {
            const serviceConfig = this.serviceConfigs[service];
            if (!serviceConfig || !serviceConfig.secret) {
                console.warn(`No webhook secret configured for service: ${service}`);
                return true; // Allow if no secret configured
            }
            
            const signatureHeader = serviceConfig.signatureHeader;
            const receivedSignature = headers[signatureHeader] || headers[signatureHeader.toLowerCase()];
            
            if (!receivedSignature) {
                throw new Error(`Missing signature header: ${signatureHeader}`);
            }
            
            // Calculate expected signature based on service type
            let expectedSignature;
            
            switch (service) {
                case 'github':
                    expectedSignature = 'sha256=' + crypto
                        .createHmac('sha256', serviceConfig.secret)
                        .update(payload, 'utf8')
                        .digest('hex');
                    break;
                    
                case 'linear':
                    expectedSignature = crypto
                        .createHmac('sha256', serviceConfig.secret)
                        .update(payload, 'utf8')
                        .digest('hex');
                    break;
                    
                case 'claudeCode':
                case 'agentapi':
                    expectedSignature = crypto
                        .createHmac('sha256', serviceConfig.secret)
                        .update(payload, 'utf8')
                        .digest('hex');
                    break;
                    
                default:
                    throw new Error(`Unknown signature validation method for service: ${service}`);
            }
            
            // Use timing-safe comparison
            const isValid = crypto.timingSafeEqual(
                Buffer.from(receivedSignature),
                Buffer.from(expectedSignature)
            );
            
            if (!isValid) {
                console.error(`Webhook signature validation failed for ${service}`);
                console.error(`Expected: ${expectedSignature}`);
                console.error(`Received: ${receivedSignature}`);
            }
            
            return isValid;
        } catch (error) {
            console.error(`Webhook signature validation error: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Route webhook to appropriate handler
     */
    async routeWebhookToHandler(service, eventType, webhookEvent) {
        try {
            const handlerKey = `${service}.${eventType}`;
            const genericHandlerKey = service;
            
            // Try specific handler first
            if (this.webhookHandlers.has(handlerKey)) {
                const handler = this.webhookHandlers.get(handlerKey);
                return await handler(webhookEvent);
            }
            
            // Try generic service handler
            if (this.webhookHandlers.has(genericHandlerKey)) {
                const handler = this.webhookHandlers.get(genericHandlerKey);
                return await handler(webhookEvent);
            }
            
            // Emit event for external handlers
            this.emit(`webhook.${service}`, webhookEvent);
            this.emit(`webhook.${service}.${eventType}`, webhookEvent);
            
            return {
                handled: true,
                method: 'event_emission'
            };
        } catch (error) {
            throw new Error(`Failed to route webhook: ${error.message}`);
        }
    }
    
    /**
     * Retry failed webhooks
     */
    async retryFailedWebhooks(webhookId = null) {
        try {
            const webhooksToRetry = webhookId 
                ? [this.failedWebhooks.get(webhookId)].filter(Boolean)
                : Array.from(this.failedWebhooks.values());
            
            const results = [];
            
            for (const failedWebhook of webhooksToRetry) {
                if (failedWebhook.retryCount >= 3) {
                    console.warn(`Max retries exceeded for webhook ${failedWebhook.id}`);
                    continue;
                }
                
                try {
                    // Wait before retry (exponential backoff)
                    const delay = Math.pow(2, failedWebhook.retryCount) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    // Retry the webhook
                    const result = await this.handleIncomingWebhook(
                        failedWebhook.service,
                        failedWebhook.payload
                    );
                    
                    // Remove from failed webhooks on success
                    this.failedWebhooks.delete(failedWebhook.id);
                    this.metrics.retriedWebhooks++;
                    
                    results.push({
                        webhookId: failedWebhook.id,
                        success: true,
                        result
                    });
                    
                    this.emit('webhook.retry.success', { 
                        webhookId: failedWebhook.id,
                        retryCount: failedWebhook.retryCount + 1,
                        result
                    });
                } catch (error) {
                    // Update retry count
                    failedWebhook.retryCount++;
                    failedWebhook.lastRetry = new Date().toISOString();
                    failedWebhook.lastError = error.message;
                    
                    results.push({
                        webhookId: failedWebhook.id,
                        success: false,
                        error: error.message,
                        retryCount: failedWebhook.retryCount
                    });
                    
                    this.emit('webhook.retry.failed', {
                        webhookId: failedWebhook.id,
                        retryCount: failedWebhook.retryCount,
                        error: error.message
                    });
                }
            }
            
            return results;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to retry webhooks: ${error.message}`);
        }
    }
    
    /**
     * Register webhook handler
     */
    registerHandler(service, eventType, handler) {
        const key = eventType ? `${service}.${eventType}` : service;
        this.webhookHandlers.set(key, handler);
        
        this.emit('handler.registered', { service, eventType, key });
    }
    
    /**
     * Unregister webhook handler
     */
    unregisterHandler(service, eventType = null) {
        const key = eventType ? `${service}.${eventType}` : service;
        const removed = this.webhookHandlers.delete(key);
        
        if (removed) {
            this.emit('handler.unregistered', { service, eventType, key });
        }
        
        return removed;
    }
    
    /**
     * Extract event type from webhook
     */
    extractEventType(service, headers, body) {
        const serviceConfig = this.serviceConfigs[service];
        if (!serviceConfig) {
            return 'unknown';
        }
        
        const eventHeader = serviceConfig.eventHeader;
        
        // Try to get event type from headers
        const eventType = headers[eventHeader] || headers[eventHeader.toLowerCase()];
        if (eventType) {
            return eventType;
        }
        
        // Try to get event type from body
        if (body && typeof body === 'object') {
            return body.type || body.event || body.action || 'unknown';
        }
        
        return 'unknown';
    }
    
    /**
     * Setup default webhook handlers
     */
    setupDefaultHandlers() {
        // Linear webhook handler
        this.registerHandler('linear', null, async (webhookEvent) => {
            this.emit('linear.webhook', webhookEvent);
            return { handled: true, service: 'linear' };
        });
        
        // GitHub webhook handler
        this.registerHandler('github', null, async (webhookEvent) => {
            this.emit('github.webhook', webhookEvent);
            return { handled: true, service: 'github' };
        });
        
        // Claude Code webhook handler
        this.registerHandler('claudeCode', null, async (webhookEvent) => {
            this.emit('claudeCode.webhook', webhookEvent);
            return { handled: true, service: 'claudeCode' };
        });
        
        // Agent API webhook handler
        this.registerHandler('agentapi', null, async (webhookEvent) => {
            this.emit('agentapi.webhook', webhookEvent);
            return { handled: true, service: 'agentapi' };
        });
    }
    
    /**
     * Store failed webhook for retry
     */
    async storeFailedWebhook(service, payload, error) {
        const failedWebhook = {
            id: this.generateEventId(),
            service,
            payload,
            error: error.message,
            timestamp: new Date().toISOString(),
            retryCount: 0,
            lastRetry: null,
            lastError: error.message
        };
        
        this.failedWebhooks.set(failedWebhook.id, failedWebhook);
        
        // Clean up old failed webhooks (keep only last 100)
        if (this.failedWebhooks.size > 100) {
            const oldestKey = this.failedWebhooks.keys().next().value;
            this.failedWebhooks.delete(oldestKey);
        }
    }
    
    /**
     * Store webhook in history
     */
    storeWebhookInHistory(webhookEvent) {
        this.webhookHistory.push(webhookEvent);
        
        // Keep only last 1000 webhooks in history
        if (this.webhookHistory.length > 1000) {
            this.webhookHistory = this.webhookHistory.slice(-1000);
        }
    }
    
    /**
     * Generate webhook ID
     */
    generateWebhookId(service, endpoint) {
        return `webhook_${service}_${crypto.createHash('md5').update(endpoint).digest('hex').substr(0, 8)}`;
    }
    
    /**
     * Generate event ID
     */
    generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Update metrics
     */
    updateMetrics(processingTime, isError) {
        this.metrics.totalWebhooks++;
        this.metrics.lastWebhook = Date.now();
        
        if (isError) {
            this.metrics.failedWebhooks++;
        } else {
            this.metrics.successfulWebhooks++;
        }
        
        // Calculate rolling average processing time
        this.metrics.averageProcessingTime = 
            (this.metrics.averageProcessingTime * (this.metrics.totalWebhooks - 1) + processingTime) / 
            this.metrics.totalWebhooks;
    }
    
    /**
     * Get webhook statistics
     */
    getWebhookStats() {
        const successRate = this.metrics.totalWebhooks > 0 ? 
            (this.metrics.successfulWebhooks / this.metrics.totalWebhooks) * 100 : 0;
        
        const failureRate = this.metrics.totalWebhooks > 0 ? 
            (this.metrics.failedWebhooks / this.metrics.totalWebhooks) * 100 : 0;
        
        return {
            total: this.metrics.totalWebhooks,
            successful: this.metrics.successfulWebhooks,
            failed: this.metrics.failedWebhooks,
            retried: this.metrics.retriedWebhooks,
            successRate: Math.round(successRate * 100) / 100,
            failureRate: Math.round(failureRate * 100) / 100,
            averageProcessingTime: Math.round(this.metrics.averageProcessingTime * 100) / 100,
            registeredWebhooks: this.registeredWebhooks.size,
            failedWebhooksInQueue: this.failedWebhooks.size,
            lastWebhook: this.metrics.lastWebhook
        };
    }
    
    /**
     * Get health status
     */
    getHealthStatus() {
        const stats = this.getWebhookStats();
        
        return {
            service: 'webhook-manager',
            status: this.isInitialized ? 'healthy' : 'unhealthy',
            initialized: this.isInitialized,
            stats,
            registeredServices: Object.keys(this.serviceConfigs),
            activeHandlers: this.webhookHandlers.size
        };
    }
    
    /**
     * Get webhook history
     */
    getWebhookHistory(limit = 50) {
        return this.webhookHistory.slice(-limit);
    }
    
    /**
     * Get failed webhooks
     */
    getFailedWebhooks() {
        return Array.from(this.failedWebhooks.values());
    }
    
    /**
     * Clear webhook history
     */
    clearWebhookHistory() {
        this.webhookHistory = [];
        this.emit('history.cleared');
    }
    
    /**
     * Clear failed webhooks
     */
    clearFailedWebhooks() {
        this.failedWebhooks.clear();
        this.emit('failed_webhooks.cleared');
    }
}

export default WebhookManager;

