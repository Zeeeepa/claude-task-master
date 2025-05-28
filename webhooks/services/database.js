/**
 * Database Service
 * Handles database operations for webhook events and processing status
 */

import { LRUCache } from 'lru-cache';

/**
 * Database Service Class
 * Provides database operations for webhook system
 * Note: This is a mock implementation - replace with actual database in production
 */
export class DatabaseService {
  constructor() {
    // In-memory storage for development/testing
    // Replace with actual database connection in production
    this.events = new LRUCache({
      max: 10000,
      ttl: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    this.metrics = new LRUCache({
      max: 1000,
      ttl: 60 * 60 * 1000 // 1 hour
    });
    
    this.connected = false;
    this.connectionString = process.env.DATABASE_URL;
  }

  /**
   * Connect to database
   */
  async connect() {
    try {
      // Mock connection - replace with actual database connection
      if (this.connectionString) {
        console.log('🔌 Connecting to database...');
        // await actualDatabaseConnection(this.connectionString);
      } else {
        console.log('📝 Using in-memory storage (development mode)');
      }
      
      this.connected = true;
      console.log('✅ Database connected successfully');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect() {
    try {
      if (this.connected) {
        // await actualDatabaseDisconnection();
        this.connected = false;
        console.log('✅ Database disconnected');
      }
    } catch (error) {
      console.error('❌ Database disconnection error:', error);
      throw error;
    }
  }

  /**
   * Store webhook event
   */
  async storeWebhookEvent(eventData) {
    try {
      const eventId = this.generateEventId();
      const event = {
        id: eventId,
        type: eventData.type,
        source: eventData.source,
        payload: eventData.payload,
        signature: eventData.signature ? '[REDACTED]' : null,
        timestamp: eventData.timestamp || new Date(),
        status: 'received',
        processingAttempts: 0,
        lastProcessedAt: null,
        error: null,
        metadata: eventData.metadata || {}
      };

      this.events.set(eventId, event);
      
      console.log(`💾 Stored webhook event: ${eventId} (${event.type})`);
      return eventId;
    } catch (error) {
      console.error('❌ Failed to store webhook event:', error);
      throw error;
    }
  }

  /**
   * Update webhook event status
   */
  async updateWebhookEventStatus(eventId, status, error = null, metadata = {}) {
    try {
      const event = this.events.get(eventId);
      if (!event) {
        throw new Error(`Webhook event not found: ${eventId}`);
      }

      event.status = status;
      event.lastProcessedAt = new Date();
      event.processingAttempts += 1;
      event.error = error;
      event.metadata = { ...event.metadata, ...metadata };

      this.events.set(eventId, event);
      
      console.log(`📝 Updated webhook event ${eventId}: ${status}`);
      return event;
    } catch (error) {
      console.error('❌ Failed to update webhook event:', error);
      throw error;
    }
  }

  /**
   * Get webhook event by ID
   */
  async getWebhookEvent(eventId) {
    try {
      const event = this.events.get(eventId);
      if (!event) {
        throw new Error(`Webhook event not found: ${eventId}`);
      }
      return event;
    } catch (error) {
      console.error('❌ Failed to get webhook event:', error);
      throw error;
    }
  }

  /**
   * Get recent webhook events
   */
  async getRecentWebhookEvents(limit = 100, filters = {}) {
    try {
      const allEvents = Array.from(this.events.values());
      
      // Apply filters
      let filteredEvents = allEvents;
      
      if (filters.type) {
        filteredEvents = filteredEvents.filter(event => event.type === filters.type);
      }
      
      if (filters.source) {
        filteredEvents = filteredEvents.filter(event => event.source === filters.source);
      }
      
      if (filters.status) {
        filteredEvents = filteredEvents.filter(event => event.status === filters.status);
      }
      
      // Sort by timestamp (newest first)
      filteredEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      // Apply limit
      return filteredEvents.slice(0, limit);
    } catch (error) {
      console.error('❌ Failed to get recent webhook events:', error);
      throw error;
    }
  }

  /**
   * Get webhook metrics
   */
  async getWebhookMetrics(timeframe = '24h') {
    try {
      const now = new Date();
      const timeframeMs = this.parseTimeframe(timeframe);
      const startTime = new Date(now.getTime() - timeframeMs);
      
      const events = Array.from(this.events.values())
        .filter(event => new Date(event.timestamp) >= startTime);
      
      const metrics = {
        timeframe,
        startTime,
        endTime: now,
        total: events.length,
        byType: {},
        byStatus: {},
        bySource: {},
        processingTimes: [],
        errorRate: 0,
        successRate: 0
      };
      
      // Calculate metrics
      events.forEach(event => {
        // Count by type
        metrics.byType[event.type] = (metrics.byType[event.type] || 0) + 1;
        
        // Count by status
        metrics.byStatus[event.status] = (metrics.byStatus[event.status] || 0) + 1;
        
        // Count by source
        metrics.bySource[event.source] = (metrics.bySource[event.source] || 0) + 1;
        
        // Calculate processing time if available
        if (event.lastProcessedAt && event.timestamp) {
          const processingTime = new Date(event.lastProcessedAt) - new Date(event.timestamp);
          metrics.processingTimes.push(processingTime);
        }
      });
      
      // Calculate rates
      const successCount = metrics.byStatus.processed || 0;
      const errorCount = metrics.byStatus.failed || 0;
      const totalProcessed = successCount + errorCount;
      
      if (totalProcessed > 0) {
        metrics.successRate = (successCount / totalProcessed) * 100;
        metrics.errorRate = (errorCount / totalProcessed) * 100;
      }
      
      // Calculate average processing time
      if (metrics.processingTimes.length > 0) {
        metrics.averageProcessingTime = metrics.processingTimes.reduce((a, b) => a + b, 0) / metrics.processingTimes.length;
      }
      
      return metrics;
    } catch (error) {
      console.error('❌ Failed to get webhook metrics:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const isHealthy = this.connected;
      const eventCount = this.events.size;
      
      return {
        healthy: isHealthy,
        connected: this.connected,
        eventCount,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get detailed status
   */
  async getDetailedStatus() {
    try {
      const recentEvents = await this.getRecentWebhookEvents(10);
      const metrics = await this.getWebhookMetrics('1h');
      
      return {
        connection: {
          connected: this.connected,
          connectionString: this.connectionString ? '[CONFIGURED]' : '[NOT_CONFIGURED]'
        },
        storage: {
          type: this.connectionString ? 'database' : 'in-memory',
          eventCount: this.events.size,
          metricsCount: this.metrics.size
        },
        recentActivity: {
          lastEvents: recentEvents.slice(0, 5).map(event => ({
            id: event.id,
            type: event.type,
            status: event.status,
            timestamp: event.timestamp
          })),
          hourlyMetrics: metrics
        }
      };
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate unique event ID
   */
  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Parse timeframe string to milliseconds
   */
  parseTimeframe(timeframe) {
    const units = {
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };
    
    const match = timeframe.match(/^(\d+)([mhd])$/);
    if (!match) {
      throw new Error(`Invalid timeframe format: ${timeframe}`);
    }
    
    const [, amount, unit] = match;
    return parseInt(amount) * units[unit];
  }

  /**
   * Clean up old events (maintenance task)
   */
  async cleanupOldEvents(maxAge = '7d') {
    try {
      const maxAgeMs = this.parseTimeframe(maxAge);
      const cutoffTime = new Date(Date.now() - maxAgeMs);
      
      let cleanedCount = 0;
      
      for (const [eventId, event] of this.events.entries()) {
        if (new Date(event.timestamp) < cutoffTime) {
          this.events.delete(eventId);
          cleanedCount++;
        }
      }
      
      console.log(`🧹 Cleaned up ${cleanedCount} old webhook events`);
      return cleanedCount;
    } catch (error) {
      console.error('❌ Failed to cleanup old events:', error);
      throw error;
    }
  }
}

