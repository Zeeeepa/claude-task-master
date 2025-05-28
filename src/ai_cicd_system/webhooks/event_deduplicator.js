/**
 * @fileoverview Event Deduplicator
 * @description Prevents duplicate processing of GitHub webhook events
 */

import crypto from 'crypto';
import { log } from '../utils/simple_logger.js';

/**
 * Event deduplicator for GitHub webhooks
 * Prevents duplicate processing using multiple strategies
 */
export class EventDeduplicator {
    constructor(database, config = {}) {
        this.database = database;
        this.config = {
            // Time window for considering events as duplicates (in milliseconds)
            deduplication_window_ms: config.deduplication_window_ms || 300000, // 5 minutes
            // Maximum number of recent events to keep in memory cache
            max_cache_size: config.max_cache_size || 1000,
            // Enable in-memory cache for faster duplicate detection
            enable_memory_cache: config.enable_memory_cache !== false,
            // Enable database-based deduplication
            enable_database_check: config.enable_database_check !== false,
            // Enable content-based deduplication
            enable_content_deduplication: config.enable_content_deduplication !== false,
            ...config
        };

        // In-memory cache for recent events
        this.recentEvents = new Map();
        this.contentHashes = new Map();
        
        // Cleanup interval for memory cache
        this.cleanupInterval = setInterval(() => {
            this.cleanupMemoryCache();
        }, 60000); // Cleanup every minute
    }

    /**
     * Check if an event is a duplicate
     * @param {Object} eventData - Event data to check
     * @returns {Promise<boolean>} True if event is a duplicate
     */
    async isDuplicate(eventData) {
        try {
            const eventId = eventData.id;
            const eventType = eventData.type;
            const payload = eventData.payload;

            log('debug', `Checking for duplicate event: ${eventId} (${eventType})`);

            // Strategy 1: Check by exact event ID (GitHub delivery ID)
            if (await this.isDuplicateById(eventId)) {
                log('info', `Duplicate event detected by ID: ${eventId}`);
                return true;
            }

            // Strategy 2: Check by content hash (for redelivered events with different IDs)
            if (this.config.enable_content_deduplication) {
                const contentHash = this.generateContentHash(payload);
                if (await this.isDuplicateByContent(contentHash, eventType)) {
                    log('info', `Duplicate event detected by content hash: ${eventId}`);
                    return true;
                }
            }

            // Strategy 3: Check by semantic equivalence (same PR action within time window)
            if (await this.isDuplicateBySemantics(eventData)) {
                log('info', `Duplicate event detected by semantics: ${eventId}`);
                return true;
            }

            // Event is not a duplicate, cache it
            await this.cacheEvent(eventData);
            
            return false;

        } catch (error) {
            log('error', `Error checking for duplicate event: ${error.message}`);
            // In case of error, assume not duplicate to avoid blocking events
            return false;
        }
    }

    /**
     * Check for duplicate by event ID
     * @param {string} eventId - GitHub delivery ID
     * @returns {Promise<boolean>} True if duplicate
     */
    async isDuplicateById(eventId) {
        // Check memory cache first
        if (this.config.enable_memory_cache && this.recentEvents.has(eventId)) {
            return true;
        }

        // Check database
        if (this.config.enable_database_check && this.database) {
            try {
                const query = 'SELECT id FROM webhook_events WHERE id = $1 LIMIT 1';
                const result = await this.database.query(query, [eventId]);
                return result.rows && result.rows.length > 0;
            } catch (error) {
                log('error', `Database duplicate check failed: ${error.message}`);
                return false;
            }
        }

        return false;
    }

    /**
     * Check for duplicate by content hash
     * @param {string} contentHash - Content hash
     * @param {string} eventType - Event type
     * @returns {Promise<boolean>} True if duplicate
     */
    async isDuplicateByContent(contentHash, eventType) {
        // Check memory cache
        if (this.config.enable_memory_cache) {
            const cacheKey = `${eventType}:${contentHash}`;
            if (this.contentHashes.has(cacheKey)) {
                const cachedTime = this.contentHashes.get(cacheKey);
                const timeDiff = Date.now() - cachedTime;
                
                if (timeDiff <= this.config.deduplication_window_ms) {
                    return true;
                }
                
                // Remove expired entry
                this.contentHashes.delete(cacheKey);
            }
        }

        // Check database for recent events with same content hash
        if (this.config.enable_database_check && this.database) {
            try {
                const query = `
                    SELECT id FROM webhook_events 
                    WHERE type = $1 
                    AND metadata->>'content_hash' = $2 
                    AND received_at > NOW() - INTERVAL '${this.config.deduplication_window_ms} milliseconds'
                    LIMIT 1
                `;
                const result = await this.database.query(query, [eventType, contentHash]);
                return result.rows && result.rows.length > 0;
            } catch (error) {
                log('error', `Database content duplicate check failed: ${error.message}`);
                return false;
            }
        }

        return false;
    }

    /**
     * Check for semantic duplicates (same action on same resource)
     * @param {Object} eventData - Event data
     * @returns {Promise<boolean>} True if duplicate
     */
    async isDuplicateBySemantics(eventData) {
        const { type, payload } = eventData;

        // Only check semantic duplicates for specific event types
        if (!['pull_request', 'issues'].includes(type)) {
            return false;
        }

        try {
            let semanticKey = null;

            if (type === 'pull_request') {
                const action = payload.action;
                const prNumber = payload.pull_request?.number;
                const repoFullName = payload.repository?.full_name;
                
                if (action && prNumber && repoFullName) {
                    semanticKey = `pr:${repoFullName}:${prNumber}:${action}`;
                }
            } else if (type === 'issues') {
                const action = payload.action;
                const issueNumber = payload.issue?.number;
                const repoFullName = payload.repository?.full_name;
                
                if (action && issueNumber && repoFullName) {
                    semanticKey = `issue:${repoFullName}:${issueNumber}:${action}`;
                }
            }

            if (!semanticKey) {
                return false;
            }

            // Check memory cache
            if (this.config.enable_memory_cache) {
                const semanticCache = this.recentEvents.get(`semantic:${semanticKey}`);
                if (semanticCache) {
                    const timeDiff = Date.now() - semanticCache.timestamp;
                    if (timeDiff <= this.config.deduplication_window_ms) {
                        return true;
                    }
                }
            }

            // Check database for recent semantic duplicates
            if (this.config.enable_database_check && this.database) {
                const query = `
                    SELECT id FROM webhook_events 
                    WHERE type = $1 
                    AND metadata->>'semantic_key' = $2 
                    AND received_at > NOW() - INTERVAL '${this.config.deduplication_window_ms} milliseconds'
                    LIMIT 1
                `;
                const result = await this.database.query(query, [type, semanticKey]);
                return result.rows && result.rows.length > 0;
            }

            return false;

        } catch (error) {
            log('error', `Semantic duplicate check failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Cache event for future duplicate detection
     * @param {Object} eventData - Event data to cache
     */
    async cacheEvent(eventData) {
        const eventId = eventData.id;
        const eventType = eventData.type;
        const payload = eventData.payload;
        const timestamp = Date.now();

        // Cache in memory
        if (this.config.enable_memory_cache) {
            this.recentEvents.set(eventId, {
                type: eventType,
                timestamp: timestamp
            });

            // Cache content hash
            if (this.config.enable_content_deduplication) {
                const contentHash = this.generateContentHash(payload);
                const cacheKey = `${eventType}:${contentHash}`;
                this.contentHashes.set(cacheKey, timestamp);
            }

            // Cache semantic key
            const semanticKey = this.generateSemanticKey(eventType, payload);
            if (semanticKey) {
                this.recentEvents.set(`semantic:${semanticKey}`, {
                    type: eventType,
                    timestamp: timestamp
                });
            }

            // Enforce cache size limit
            if (this.recentEvents.size > this.config.max_cache_size) {
                this.cleanupMemoryCache();
            }
        }
    }

    /**
     * Generate content hash for payload
     * @param {Object} payload - Event payload
     * @returns {string} Content hash
     */
    generateContentHash(payload) {
        // Create a normalized version of the payload for hashing
        const normalizedPayload = this.normalizePayload(payload);
        const payloadString = JSON.stringify(normalizedPayload);
        
        return crypto.createHash('sha256')
            .update(payloadString)
            .digest('hex');
    }

    /**
     * Normalize payload for consistent hashing
     * @param {Object} payload - Original payload
     * @returns {Object} Normalized payload
     */
    normalizePayload(payload) {
        // Remove timestamp fields and other variable data that shouldn't affect deduplication
        const normalized = { ...payload };
        
        // Remove GitHub-specific timestamps that change on redelivery
        delete normalized.timestamp;
        
        // Remove repository updated_at as it changes frequently
        if (normalized.repository) {
            delete normalized.repository.updated_at;
            delete normalized.repository.pushed_at;
        }

        // Remove pull request updated_at for PR events
        if (normalized.pull_request) {
            delete normalized.pull_request.updated_at;
        }

        // Remove issue updated_at for issue events
        if (normalized.issue) {
            delete normalized.issue.updated_at;
        }

        return normalized;
    }

    /**
     * Generate semantic key for event
     * @param {string} eventType - Event type
     * @param {Object} payload - Event payload
     * @returns {string|null} Semantic key or null
     */
    generateSemanticKey(eventType, payload) {
        try {
            if (eventType === 'pull_request') {
                const action = payload.action;
                const prNumber = payload.pull_request?.number;
                const repoFullName = payload.repository?.full_name;
                
                if (action && prNumber && repoFullName) {
                    return `pr:${repoFullName}:${prNumber}:${action}`;
                }
            } else if (eventType === 'issues') {
                const action = payload.action;
                const issueNumber = payload.issue?.number;
                const repoFullName = payload.repository?.full_name;
                
                if (action && issueNumber && repoFullName) {
                    return `issue:${repoFullName}:${issueNumber}:${action}`;
                }
            }

            return null;
        } catch (error) {
            log('error', `Error generating semantic key: ${error.message}`);
            return null;
        }
    }

    /**
     * Clean up expired entries from memory cache
     */
    cleanupMemoryCache() {
        const now = Date.now();
        const expiredKeys = [];

        // Clean up recent events
        for (const [key, value] of this.recentEvents.entries()) {
            const age = now - value.timestamp;
            if (age > this.config.deduplication_window_ms) {
                expiredKeys.push(key);
            }
        }

        // Clean up content hashes
        for (const [key, timestamp] of this.contentHashes.entries()) {
            const age = now - timestamp;
            if (age > this.config.deduplication_window_ms) {
                expiredKeys.push(key);
            }
        }

        // Remove expired keys
        expiredKeys.forEach(key => {
            this.recentEvents.delete(key);
            this.contentHashes.delete(key);
        });

        if (expiredKeys.length > 0) {
            log('debug', `Cleaned up ${expiredKeys.length} expired cache entries`);
        }
    }

    /**
     * Get deduplication statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            memory_cache_size: this.recentEvents.size,
            content_hash_cache_size: this.contentHashes.size,
            deduplication_window_ms: this.config.deduplication_window_ms,
            max_cache_size: this.config.max_cache_size,
            config: {
                enable_memory_cache: this.config.enable_memory_cache,
                enable_database_check: this.config.enable_database_check,
                enable_content_deduplication: this.config.enable_content_deduplication
            }
        };
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        const stats = this.getStatistics();
        
        return {
            status: 'healthy',
            memory_usage: {
                recent_events: stats.memory_cache_size,
                content_hashes: stats.content_hash_cache_size,
                cache_utilization: (stats.memory_cache_size / this.config.max_cache_size) * 100
            },
            database_connected: !!this.database
        };
    }

    /**
     * Shutdown the deduplicator
     */
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        this.recentEvents.clear();
        this.contentHashes.clear();
        
        log('debug', 'Event deduplicator shut down');
    }
}

export default EventDeduplicator;

