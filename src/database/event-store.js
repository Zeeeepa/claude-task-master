/**
 * @fileoverview EventStore - Comprehensive event storage system for tracking all development activities
 * @description PostgreSQL-based event storage implementing Phase 1.3 requirements (ZAM-853)
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import { DatabaseConnectionManager } from './connection/connection_manager.js';

/**
 * EventStore class for comprehensive event logging and querying
 * Implements all requirements from Phase 1.3: Database Event Storage System
 */
export class EventStore {
  constructor(config = {}) {
    this.dbManager = new DatabaseConnectionManager(config);
    this.tablePrefix = config.tablePrefix || 'voltagent_events';
    this.batchQueue = [];
    this.batchSize = config.batchSize || 100;
    this.batchTimeout = config.batchTimeout || 5000; // 5 seconds
    this.batchTimer = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the EventStore
   */
  async initialize() {
    try {
      await this.dbManager.initialize();
      await this.ensureEventTables();
      this.isInitialized = true;
      console.log('[EventStore] Initialized successfully');
    } catch (error) {
      console.error('[EventStore] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Ensure all event tables exist
   */
  async ensureEventTables() {
    const client = await this.dbManager.getConnection();
    
    try {
      // Create events table (general system events)
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tablePrefix}_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          event_type VARCHAR(100) NOT NULL,
          event_name VARCHAR(200) NOT NULL,
          agent_id VARCHAR(100),
          session_id VARCHAR(100),
          user_id VARCHAR(100),
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          data JSONB,
          metadata JSONB,
          status VARCHAR(50) DEFAULT 'completed',
          duration_ms INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Create task_events table (task-specific tracking)
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tablePrefix}_task_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          task_id VARCHAR(100) NOT NULL,
          task_name VARCHAR(200) NOT NULL,
          agent_id VARCHAR(100) NOT NULL,
          event_type VARCHAR(100) NOT NULL,
          event_name VARCHAR(200) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'started',
          input_data JSONB,
          output_data JSONB,
          error_data JSONB,
          metadata JSONB,
          started_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          duration_ms INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Create agent_events table (agent activity tracking)
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tablePrefix}_agent_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          agent_id VARCHAR(100) NOT NULL,
          agent_name VARCHAR(200),
          parent_agent_id VARCHAR(100),
          event_type VARCHAR(100) NOT NULL,
          event_name VARCHAR(200) NOT NULL,
          action VARCHAR(100),
          status VARCHAR(50) NOT NULL DEFAULT 'active',
          context JSONB,
          result JSONB,
          error_data JSONB,
          metadata JSONB,
          duration_ms INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Create deployment_events table (WSL2 deployment tracking)
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tablePrefix}_deployment_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          deployment_id VARCHAR(100) NOT NULL,
          environment VARCHAR(100) NOT NULL,
          event_type VARCHAR(100) NOT NULL,
          event_name VARCHAR(200) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          branch_name VARCHAR(200),
          commit_hash VARCHAR(100),
          pr_number INTEGER,
          deployment_config JSONB,
          logs JSONB,
          error_data JSONB,
          metadata JSONB,
          started_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          duration_ms INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Create event_batches table (batch processing optimization)
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tablePrefix}_event_batches (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          batch_id VARCHAR(100) NOT NULL UNIQUE,
          event_count INTEGER NOT NULL DEFAULT 0,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          started_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          error_data JSONB,
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Create indexes for performance
      await this.createIndexes();

      console.log('[EventStore] All event tables ensured');
    } finally {
      client.release();
    }
  }

  /**
   * Create performance indexes
   */
  async createIndexes() {
    const client = await this.dbManager.getConnection();
    
    try {
      const indexes = [
        // Events table indexes
        `CREATE INDEX IF NOT EXISTS idx_events_timestamp ON ${this.tablePrefix}_events (timestamp DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_events_agent_id ON ${this.tablePrefix}_events (agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_events_event_type ON ${this.tablePrefix}_events (event_type)`,
        `CREATE INDEX IF NOT EXISTS idx_events_status ON ${this.tablePrefix}_events (status)`,
        
        // Task events indexes
        `CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON ${this.tablePrefix}_task_events (task_id)`,
        `CREATE INDEX IF NOT EXISTS idx_task_events_agent_id ON ${this.tablePrefix}_task_events (agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_task_events_status ON ${this.tablePrefix}_task_events (status)`,
        `CREATE INDEX IF NOT EXISTS idx_task_events_created_at ON ${this.tablePrefix}_task_events (created_at DESC)`,
        
        // Agent events indexes
        `CREATE INDEX IF NOT EXISTS idx_agent_events_agent_id ON ${this.tablePrefix}_agent_events (agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_agent_events_parent_agent_id ON ${this.tablePrefix}_agent_events (parent_agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_agent_events_status ON ${this.tablePrefix}_agent_events (status)`,
        `CREATE INDEX IF NOT EXISTS idx_agent_events_created_at ON ${this.tablePrefix}_agent_events (created_at DESC)`,
        
        // Deployment events indexes
        `CREATE INDEX IF NOT EXISTS idx_deployment_events_deployment_id ON ${this.tablePrefix}_deployment_events (deployment_id)`,
        `CREATE INDEX IF NOT EXISTS idx_deployment_events_environment ON ${this.tablePrefix}_deployment_events (environment)`,
        `CREATE INDEX IF NOT EXISTS idx_deployment_events_status ON ${this.tablePrefix}_deployment_events (status)`,
        `CREATE INDEX IF NOT EXISTS idx_deployment_events_pr_number ON ${this.tablePrefix}_deployment_events (pr_number)`,
        
        // Event batches indexes
        `CREATE INDEX IF NOT EXISTS idx_event_batches_batch_id ON ${this.tablePrefix}_event_batches (batch_id)`,
        `CREATE INDEX IF NOT EXISTS idx_event_batches_status ON ${this.tablePrefix}_event_batches (status)`
      ];

      for (const indexQuery of indexes) {
        await client.query(indexQuery);
      }

      console.log('[EventStore] Performance indexes created');
    } finally {
      client.release();
    }
  }

  /**
   * Log a system event
   */
  async logSystemEvent(event) {
    if (!this.isInitialized) {
      throw new Error('EventStore not initialized');
    }

    const eventId = event.id || uuidv4();
    const timestamp = event.timestamp || new Date();

    const query = `
      INSERT INTO ${this.tablePrefix}_events 
      (id, event_type, event_name, agent_id, session_id, user_id, timestamp, data, metadata, status, duration_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `;

    const values = [
      eventId,
      event.event_type,
      event.event_name,
      event.agent_id,
      event.session_id,
      event.user_id,
      timestamp,
      JSON.stringify(event.data || {}),
      JSON.stringify(event.metadata || {}),
      event.status || 'completed',
      event.duration_ms
    ];

    try {
      const client = await this.dbManager.getConnection();
      try {
        const result = await client.query(query, values);
        console.log(`[EventStore] System event logged: ${event.event_type}/${event.event_name}`);
        return result.rows[0].id;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[EventStore] Failed to log system event:', error);
      throw error;
    }
  }

  /**
   * Log a task event
   */
  async logTaskEvent(event) {
    if (!this.isInitialized) {
      throw new Error('EventStore not initialized');
    }

    const eventId = event.id || uuidv4();

    const query = `
      INSERT INTO ${this.tablePrefix}_task_events 
      (id, task_id, task_name, agent_id, event_type, event_name, status, input_data, output_data, error_data, metadata, started_at, completed_at, duration_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `;

    const values = [
      eventId,
      event.task_id,
      event.task_name,
      event.agent_id,
      event.event_type,
      event.event_name,
      event.status,
      JSON.stringify(event.input_data || {}),
      JSON.stringify(event.output_data || {}),
      JSON.stringify(event.error_data || {}),
      JSON.stringify(event.metadata || {}),
      event.started_at,
      event.completed_at,
      event.duration_ms
    ];

    try {
      const client = await this.dbManager.getConnection();
      try {
        const result = await client.query(query, values);
        console.log(`[EventStore] Task event logged: ${event.task_id}/${event.event_name}`);
        return result.rows[0].id;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[EventStore] Failed to log task event:', error);
      throw error;
    }
  }

  /**
   * Log an agent event
   */
  async logAgentEvent(event) {
    if (!this.isInitialized) {
      throw new Error('EventStore not initialized');
    }

    const eventId = event.id || uuidv4();

    const query = `
      INSERT INTO ${this.tablePrefix}_agent_events 
      (id, agent_id, agent_name, parent_agent_id, event_type, event_name, action, status, context, result, error_data, metadata, duration_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `;

    const values = [
      eventId,
      event.agent_id,
      event.agent_name,
      event.parent_agent_id,
      event.event_type,
      event.event_name,
      event.action,
      event.status,
      JSON.stringify(event.context || {}),
      JSON.stringify(event.result || {}),
      JSON.stringify(event.error_data || {}),
      JSON.stringify(event.metadata || {}),
      event.duration_ms
    ];

    try {
      const client = await this.dbManager.getConnection();
      try {
        const result = await client.query(query, values);
        console.log(`[EventStore] Agent event logged: ${event.agent_id}/${event.event_name}`);
        return result.rows[0].id;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[EventStore] Failed to log agent event:', error);
      throw error;
    }
  }

  /**
   * Log a deployment event
   */
  async logDeploymentEvent(event) {
    if (!this.isInitialized) {
      throw new Error('EventStore not initialized');
    }

    const eventId = event.id || uuidv4();

    const query = `
      INSERT INTO ${this.tablePrefix}_deployment_events 
      (id, deployment_id, environment, event_type, event_name, status, branch_name, commit_hash, pr_number, deployment_config, logs, error_data, metadata, started_at, completed_at, duration_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id
    `;

    const values = [
      eventId,
      event.deployment_id,
      event.environment,
      event.event_type,
      event.event_name,
      event.status,
      event.branch_name,
      event.commit_hash,
      event.pr_number,
      JSON.stringify(event.deployment_config || {}),
      JSON.stringify(event.logs || {}),
      JSON.stringify(event.error_data || {}),
      JSON.stringify(event.metadata || {}),
      event.started_at,
      event.completed_at,
      event.duration_ms
    ];

    try {
      const client = await this.dbManager.getConnection();
      try {
        const result = await client.query(query, values);
        console.log(`[EventStore] Deployment event logged: ${event.deployment_id}/${event.event_name}`);
        return result.rows[0].id;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[EventStore] Failed to log deployment event:', error);
      throw error;
    }
  }

  /**
   * Query system events with filtering
   */
  async querySystemEvents(options = {}) {
    if (!this.isInitialized) {
      throw new Error('EventStore not initialized');
    }

    const {
      limit = 100,
      offset = 0,
      startDate,
      endDate,
      eventType,
      agentId,
      status,
      orderBy = 'timestamp',
      orderDirection = 'DESC'
    } = options;

    let query = `SELECT * FROM ${this.tablePrefix}_events WHERE 1=1`;
    const values = [];
    let paramCount = 0;

    if (startDate) {
      paramCount++;
      query += ` AND timestamp >= $${paramCount}`;
      values.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND timestamp <= $${paramCount}`;
      values.push(endDate);
    }

    if (eventType) {
      paramCount++;
      query += ` AND event_type = $${paramCount}`;
      values.push(eventType);
    }

    if (agentId) {
      paramCount++;
      query += ` AND agent_id = $${paramCount}`;
      values.push(agentId);
    }

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      values.push(status);
    }

    query += ` ORDER BY ${orderBy} ${orderDirection}`;
    
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    values.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    values.push(offset);

    try {
      const client = await this.dbManager.getConnection();
      try {
        const result = await client.query(query, values);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[EventStore] Failed to query system events:', error);
      throw error;
    }
  }

  /**
   * Get event statistics
   */
  async getEventStatistics(options = {}) {
    if (!this.isInitialized) {
      throw new Error('EventStore not initialized');
    }

    const { startDate, endDate } = options;

    try {
      const client = await this.dbManager.getConnection();
      try {
        let whereClause = '';
        const values = [];
        let paramCount = 0;

        if (startDate || endDate) {
          whereClause = 'WHERE ';
          const conditions = [];

          if (startDate) {
            paramCount++;
            conditions.push(`timestamp >= $${paramCount}`);
            values.push(startDate);
          }

          if (endDate) {
            paramCount++;
            conditions.push(`timestamp <= $${paramCount}`);
            values.push(endDate);
          }

          whereClause += conditions.join(' AND ');
        }

        // Get total events
        const totalResult = await client.query(
          `SELECT COUNT(*) as total FROM ${this.tablePrefix}_events ${whereClause}`,
          values
        );

        // Get events by type
        const typeResult = await client.query(
          `SELECT event_type, COUNT(*) as count FROM ${this.tablePrefix}_events ${whereClause} GROUP BY event_type`,
          values
        );

        // Get events by status
        const statusResult = await client.query(
          `SELECT status, COUNT(*) as count FROM ${this.tablePrefix}_events ${whereClause} GROUP BY status`,
          values
        );

        // Get events by agent
        const agentResult = await client.query(
          `SELECT agent_id, COUNT(*) as count FROM ${this.tablePrefix}_events ${whereClause} AND agent_id IS NOT NULL GROUP BY agent_id`,
          values
        );

        // Get average duration
        const durationResult = await client.query(
          `SELECT AVG(duration_ms) as avg_duration FROM ${this.tablePrefix}_events ${whereClause} AND duration_ms IS NOT NULL`,
          values
        );

        // Get time range
        const timeRangeResult = await client.query(
          `SELECT MIN(timestamp) as earliest, MAX(timestamp) as latest FROM ${this.tablePrefix}_events ${whereClause}`,
          values
        );

        return {
          totalEvents: parseInt(totalResult.rows[0].total),
          eventsByType: typeResult.rows.reduce((acc, row) => {
            acc[row.event_type] = parseInt(row.count);
            return acc;
          }, {}),
          eventsByStatus: statusResult.rows.reduce((acc, row) => {
            acc[row.status] = parseInt(row.count);
            return acc;
          }, {}),
          eventsByAgent: agentResult.rows.reduce((acc, row) => {
            acc[row.agent_id] = parseInt(row.count);
            return acc;
          }, {}),
          averageDuration: parseFloat(durationResult.rows[0].avg_duration) || 0,
          timeRange: {
            earliest: timeRangeResult.rows[0].earliest,
            latest: timeRangeResult.rows[0].latest
          }
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[EventStore] Failed to get event statistics:', error);
      throw error;
    }
  }

  /**
   * Get health status
   */
  async getHealthStatus() {
    try {
      const isHealthy = await this.dbManager.testConnection();
      const poolStats = this.dbManager.getPoolStats();
      
      return {
        isHealthy,
        database: {
          connected: isHealthy,
          poolStats
        },
        eventStore: {
          initialized: this.isInitialized,
          batchQueueSize: this.batchQueue.length
        }
      };
    } catch (error) {
      console.error('[EventStore] Failed to get health status:', error);
      return {
        isHealthy: false,
        error: error.message
      };
    }
  }

  /**
   * Close the EventStore
   */
  async close() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    await this.dbManager.close();
    this.isInitialized = false;
    console.log('[EventStore] Closed successfully');
  }
}

export default EventStore;

