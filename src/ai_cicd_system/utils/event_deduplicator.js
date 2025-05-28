/**
 * @fileoverview Event Deduplicator
 * @description Event deduplication utility to prevent processing duplicate webhook events
 */

import crypto from 'crypto';

/**
 * Event Deduplicator class
 */
export class EventDeduplicator {
    constructor(config = {}) {
        this.config = {
            windowMs: config.windowMs || 300000, // 5 minutes
            maxEntries: config.maxEntries || 10000,
            hashAlgorithm: config.hashAlgorithm || 'sha256',
            enableContentHashing: config.enableContentHashing !== false,
            enableTimestampCheck: config.enableTimestampCheck !== false,
            timestampTolerance: config.timestampTolerance || 60000, // 1 minute
            enableSourceSpecificLogic: config.enableSourceSpecificLogic !== false,
            ...config
        };

        this.seenEvents = new Map();
        this.contentHashes = new Map();
        this.statistics = {
            eventsChecked: 0,
            duplicatesFound: 0,
            uniqueEvents: 0,
            hashCollisions: 0,
            cleanupRuns: 0
        };

        this.startCleanupTimer();
    }

    /**
     * Check if event is a duplicate
     * @param {Object} event - Event to check
     * @returns {Promise<boolean>} True if duplicate
     */
    async isDuplicate(event) {
        try {
            this.statistics.eventsChecked++;

            // Generate event fingerprint
            const fingerprint = this.generateEventFingerprint(event);
            
            // Check if we've seen this exact event
            if (this.seenEvents.has(fingerprint)) {
                const existingEvent = this.seenEvents.get(fingerprint);
                
                // Additional checks for potential duplicates
                if (await this.isConfirmedDuplicate(event, existingEvent)) {
                    this.statistics.duplicatesFound++;
                    console.log(`Duplicate event detected: ${event.id} (fingerprint: ${fingerprint})`);
                    return true;
                }
            }

            // Check content-based deduplication
            if (this.config.enableContentHashing) {
                const contentHash = this.generateContentHash(event);
                
                if (this.contentHashes.has(contentHash)) {
                    const existingEvents = this.contentHashes.get(contentHash);
                    
                    for (const existingEvent of existingEvents) {
                        if (await this.isContentDuplicate(event, existingEvent)) {
                            this.statistics.duplicatesFound++;
                            console.log(`Content duplicate detected: ${event.id} (content hash: ${contentHash})`);
                            return true;
                        }
                    }
                    
                    // Add to existing content hash group
                    existingEvents.push({
                        id: event.id,
                        timestamp: event.timestamp,
                        source: event.source,
                        type: event.type
                    });
                } else {
                    // Create new content hash group
                    this.contentHashes.set(contentHash, [{
                        id: event.id,
                        timestamp: event.timestamp,
                        source: event.source,
                        type: event.type
                    }]);
                }
            }

            // Store event fingerprint
            this.seenEvents.set(fingerprint, {
                id: event.id,
                timestamp: event.timestamp,
                source: event.source,
                type: event.type,
                payload: this.extractKeyPayloadFields(event),
                seenAt: Date.now()
            });

            this.statistics.uniqueEvents++;
            return false;

        } catch (error) {
            console.error('Error checking for duplicate event:', error);
            // On error, assume not duplicate to avoid blocking valid events
            return false;
        }
    }

    /**
     * Generate event fingerprint
     * @param {Object} event - Event object
     * @returns {string} Event fingerprint
     */
    generateEventFingerprint(event) {
        // Create fingerprint based on source-specific logic
        let fingerprintData;

        if (this.config.enableSourceSpecificLogic) {
            fingerprintData = this.generateSourceSpecificFingerprint(event);
        } else {
            fingerprintData = this.generateGenericFingerprint(event);
        }

        // Create hash of fingerprint data
        return crypto
            .createHash(this.config.hashAlgorithm)
            .update(JSON.stringify(fingerprintData))
            .digest('hex');
    }

    /**
     * Generate source-specific fingerprint
     * @param {Object} event - Event object
     * @returns {Object} Fingerprint data
     */
    generateSourceSpecificFingerprint(event) {
        const base = {
            source: event.source,
            type: event.type
        };

        switch (event.source) {
            case 'github':
                return this.generateGitHubFingerprint(event, base);
            case 'linear':
                return this.generateLinearFingerprint(event, base);
            case 'codegen':
                return this.generateCodegenFingerprint(event, base);
            case 'claude_code':
                return this.generateClaudeCodeFingerprint(event, base);
            default:
                return this.generateGenericFingerprint(event);
        }
    }

    /**
     * Generate GitHub-specific fingerprint
     * @param {Object} event - GitHub event
     * @param {Object} base - Base fingerprint data
     * @returns {Object} GitHub fingerprint data
     */
    generateGitHubFingerprint(event, base) {
        const payload = event.payload;
        
        if (event.type === 'pull_request') {
            return {
                ...base,
                action: payload.action,
                prId: payload.pull_request?.id,
                prNumber: payload.pull_request?.number,
                repository: payload.repository?.full_name,
                headSha: payload.pull_request?.head?.sha
            };
        } else if (event.type === 'push') {
            return {
                ...base,
                repository: payload.repository?.full_name,
                ref: payload.ref,
                before: payload.before,
                after: payload.after
            };
        } else if (event.type === 'issue_comment') {
            return {
                ...base,
                action: payload.action,
                commentId: payload.comment?.id,
                issueNumber: payload.issue?.number,
                repository: payload.repository?.full_name
            };
        }

        return {
            ...base,
            deliveryId: event.headers?.['x-github-delivery'],
            hookId: event.headers?.['x-github-hook-id']
        };
    }

    /**
     * Generate Linear-specific fingerprint
     * @param {Object} event - Linear event
     * @param {Object} base - Base fingerprint data
     * @returns {Object} Linear fingerprint data
     */
    generateLinearFingerprint(event, base) {
        const payload = event.payload;
        
        return {
            ...base,
            issueId: payload.data?.id,
            updatedFrom: payload.updatedFrom,
            webhookId: event.headers?.['linear-webhook-id'],
            timestamp: payload.createdAt || event.timestamp
        };
    }

    /**
     * Generate Codegen-specific fingerprint
     * @param {Object} event - Codegen event
     * @param {Object} base - Base fingerprint data
     * @returns {Object} Codegen fingerprint data
     */
    generateCodegenFingerprint(event, base) {
        const payload = event.payload;
        
        return {
            ...base,
            taskId: payload.data?.task_id,
            generationId: payload.data?.generation_id,
            eventId: payload.event_id,
            timestamp: payload.timestamp || event.timestamp
        };
    }

    /**
     * Generate Claude Code-specific fingerprint
     * @param {Object} event - Claude Code event
     * @param {Object} base - Base fingerprint data
     * @returns {Object} Claude Code fingerprint data
     */
    generateClaudeCodeFingerprint(event, base) {
        const payload = event.payload;
        
        return {
            ...base,
            validationId: payload.data?.validation_id,
            prNumber: payload.data?.pr_number,
            repository: payload.data?.repository,
            timestamp: payload.timestamp || event.timestamp
        };
    }

    /**
     * Generate generic fingerprint
     * @param {Object} event - Event object
     * @returns {Object} Generic fingerprint data
     */
    generateGenericFingerprint(event) {
        return {
            id: event.id,
            source: event.source,
            type: event.type,
            timestamp: event.timestamp
        };
    }

    /**
     * Generate content hash
     * @param {Object} event - Event object
     * @returns {string} Content hash
     */
    generateContentHash(event) {
        // Create hash of payload content
        const contentData = {
            source: event.source,
            type: event.type,
            payload: this.normalizePayload(event.payload)
        };

        return crypto
            .createHash(this.config.hashAlgorithm)
            .update(JSON.stringify(contentData))
            .digest('hex');
    }

    /**
     * Normalize payload for consistent hashing
     * @param {Object} payload - Event payload
     * @returns {Object} Normalized payload
     */
    normalizePayload(payload) {
        if (!payload || typeof payload !== 'object') {
            return payload;
        }

        // Remove timestamp fields that might vary
        const normalized = { ...payload };
        delete normalized.timestamp;
        delete normalized.created_at;
        delete normalized.updated_at;
        delete normalized.delivered_at;

        // Sort object keys for consistent hashing
        return this.sortObjectKeys(normalized);
    }

    /**
     * Sort object keys recursively
     * @param {Object} obj - Object to sort
     * @returns {Object} Object with sorted keys
     */
    sortObjectKeys(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.sortObjectKeys(item));
        }

        const sorted = {};
        Object.keys(obj).sort().forEach(key => {
            sorted[key] = this.sortObjectKeys(obj[key]);
        });

        return sorted;
    }

    /**
     * Check if event is confirmed duplicate
     * @param {Object} event - Current event
     * @param {Object} existingEvent - Previously seen event
     * @returns {Promise<boolean>} True if confirmed duplicate
     */
    async isConfirmedDuplicate(event, existingEvent) {
        // Check timestamp tolerance if enabled
        if (this.config.enableTimestampCheck) {
            const eventTime = new Date(event.timestamp).getTime();
            const existingTime = new Date(existingEvent.timestamp).getTime();
            const timeDiff = Math.abs(eventTime - existingTime);

            if (timeDiff > this.config.timestampTolerance) {
                return false; // Too far apart in time to be duplicate
            }
        }

        // Additional source-specific duplicate checks
        return this.performSourceSpecificDuplicateCheck(event, existingEvent);
    }

    /**
     * Perform source-specific duplicate check
     * @param {Object} event - Current event
     * @param {Object} existingEvent - Previously seen event
     * @returns {boolean} True if duplicate
     */
    performSourceSpecificDuplicateCheck(event, existingEvent) {
        if (event.source !== existingEvent.source) {
            return false;
        }

        switch (event.source) {
            case 'github':
                return this.isGitHubDuplicate(event, existingEvent);
            case 'linear':
                return this.isLinearDuplicate(event, existingEvent);
            default:
                return true; // Same fingerprint = duplicate for other sources
        }
    }

    /**
     * Check if GitHub events are duplicates
     * @param {Object} event - Current GitHub event
     * @param {Object} existingEvent - Previously seen GitHub event
     * @returns {boolean} True if duplicate
     */
    isGitHubDuplicate(event, existingEvent) {
        // GitHub sends delivery headers that should be unique
        const deliveryId = event.headers?.['x-github-delivery'];
        const existingDeliveryId = existingEvent.payload?.deliveryId;

        if (deliveryId && existingDeliveryId) {
            return deliveryId === existingDeliveryId;
        }

        // Fallback to payload comparison
        return JSON.stringify(event.payload) === JSON.stringify(existingEvent.payload);
    }

    /**
     * Check if Linear events are duplicates
     * @param {Object} event - Current Linear event
     * @param {Object} existingEvent - Previously seen Linear event
     * @returns {boolean} True if duplicate
     */
    isLinearDuplicate(event, existingEvent) {
        // Linear webhook IDs should be unique
        const webhookId = event.headers?.['linear-webhook-id'];
        const existingWebhookId = existingEvent.payload?.webhookId;

        if (webhookId && existingWebhookId) {
            return webhookId === existingWebhookId;
        }

        // Fallback to payload comparison
        return JSON.stringify(event.payload) === JSON.stringify(existingEvent.payload);
    }

    /**
     * Check if events have duplicate content
     * @param {Object} event - Current event
     * @param {Object} existingEvent - Previously seen event
     * @returns {Promise<boolean>} True if content duplicate
     */
    async isContentDuplicate(event, existingEvent) {
        // Check if events are close in time
        const eventTime = new Date(event.timestamp).getTime();
        const existingTime = new Date(existingEvent.timestamp).getTime();
        const timeDiff = Math.abs(eventTime - existingTime);

        // Only consider content duplicates if events are close in time
        return timeDiff <= this.config.timestampTolerance;
    }

    /**
     * Extract key payload fields for storage
     * @param {Object} event - Event object
     * @returns {Object} Key payload fields
     */
    extractKeyPayloadFields(event) {
        // Extract only essential fields to reduce memory usage
        const payload = event.payload;
        
        switch (event.source) {
            case 'github':
                return {
                    action: payload.action,
                    repository: payload.repository?.full_name,
                    number: payload.pull_request?.number || payload.issue?.number,
                    deliveryId: event.headers?.['x-github-delivery']
                };
            case 'linear':
                return {
                    issueId: payload.data?.id,
                    webhookId: event.headers?.['linear-webhook-id']
                };
            default:
                return {
                    type: payload.type || payload.event_type,
                    id: payload.id || payload.data?.id
                };
        }
    }

    /**
     * Clean up old entries
     */
    cleanup() {
        const now = Date.now();
        const cutoffTime = now - this.config.windowMs;
        let cleanedCount = 0;

        // Clean up seen events
        for (const [fingerprint, eventData] of this.seenEvents) {
            if (eventData.seenAt < cutoffTime) {
                this.seenEvents.delete(fingerprint);
                cleanedCount++;
            }
        }

        // Clean up content hashes
        for (const [contentHash, events] of this.contentHashes) {
            const filteredEvents = events.filter(event => {
                const eventTime = new Date(event.timestamp).getTime();
                return eventTime > cutoffTime;
            });

            if (filteredEvents.length === 0) {
                this.contentHashes.delete(contentHash);
            } else {
                this.contentHashes.set(contentHash, filteredEvents);
            }
        }

        // Enforce max entries limit
        if (this.seenEvents.size > this.config.maxEntries) {
            const entriesToRemove = this.seenEvents.size - this.config.maxEntries;
            const sortedEntries = Array.from(this.seenEvents.entries())
                .sort((a, b) => a[1].seenAt - b[1].seenAt);

            for (let i = 0; i < entriesToRemove; i++) {
                this.seenEvents.delete(sortedEntries[i][0]);
                cleanedCount++;
            }
        }

        this.statistics.cleanupRuns++;
        
        if (cleanedCount > 0) {
            console.log(`Event deduplicator cleaned up ${cleanedCount} old entries`);
        }
    }

    /**
     * Start cleanup timer
     */
    startCleanupTimer() {
        // Clean up every 5 minutes
        setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }

    /**
     * Get deduplicator statistics
     * @returns {Object} Deduplicator statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            seenEventsCount: this.seenEvents.size,
            contentHashesCount: this.contentHashes.size,
            duplicateRate: this.statistics.eventsChecked > 0 
                ? (this.statistics.duplicatesFound / this.statistics.eventsChecked) * 100
                : 0,
            memoryUsage: {
                seenEvents: this.seenEvents.size,
                contentHashes: this.contentHashes.size
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get health status
     * @returns {Promise<string>} Health status
     */
    async getHealth() {
        try {
            // Check memory usage
            if (this.seenEvents.size > this.config.maxEntries * 0.9) {
                return 'degraded';
            }

            // Check duplicate rate
            const duplicateRate = this.statistics.eventsChecked > 0 
                ? (this.statistics.duplicatesFound / this.statistics.eventsChecked) * 100
                : 0;

            if (duplicateRate > 50) { // More than 50% duplicates might indicate an issue
                return 'degraded';
            }

            return 'healthy';
        } catch (error) {
            return 'unhealthy';
        }
    }

    /**
     * Clear all stored data
     */
    clear() {
        this.seenEvents.clear();
        this.contentHashes.clear();
        console.log('Event deduplicator cleared all data');
    }

    /**
     * Get duplicate events for debugging
     * @param {number} limit - Maximum number of duplicates to return
     * @returns {Array} Recent duplicate events
     */
    getRecentDuplicates(limit = 10) {
        // This would require storing duplicate event details
        // For now, return statistics
        return {
            totalDuplicates: this.statistics.duplicatesFound,
            duplicateRate: this.statistics.eventsChecked > 0 
                ? (this.statistics.duplicatesFound / this.statistics.eventsChecked) * 100
                : 0
        };
    }
}

export default EventDeduplicator;

