/**
 * Event Store
 * PostgreSQL-based event storage for comprehensive activity tracking
 */

import EventEmitter from 'events';
import pkg from 'pg';
const { Pool } = pkg;

export class EventStore extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            host: config.host || process.env.DB_HOST || 'localhost',
            port: config.port || process.env.DB_PORT || 5432,
            database: config.database || process.env.DB_NAME || 'taskmaster',
            user: config.user || process.env.DB_USER || 'taskmaster',
            password: config.password || process.env.DB_PASSWORD || '',
            ssl: config.ssl || process.env.DB_SSL === 'true',
            max: config.maxConnections || 20,
            idleTimeoutMillis: config.idleTimeout || 30000,
            connectionTimeoutMillis: config.connectionTimeout || 2000,
            ...config
        };
        
        this.pool = null;
        this.isConnected = false;
    }

    /**
     * Initialize the event store
     */
    async initialize() {
        try {
            this.pool = new Pool(this.config);
            
            // Test connection
            const client = await this.pool.connect();
            client.release();
            
            // Create tables if they don't exist
            await this.createTables();
            
            this.isConnected = true;
            this.emit('connected');
            
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to initialize event store: ${error.message}`);
        }
    }

    /**
     * Create database tables
     */
    async createTables() {
        const client = await this.pool.connect();
        
        try {
            // Events table
            await client.query(`
                CREATE TABLE IF NOT EXISTS events (
                    id SERIAL PRIMARY KEY,
                    type VARCHAR(255) NOT NULL,
                    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
                    data JSONB,
                    metadata JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            `);

            // Tasks table (for task-specific events)
            await client.query(`
                CREATE TABLE IF NOT EXISTS task_events (
                    id SERIAL PRIMARY KEY,
                    task_id INTEGER NOT NULL,
                    event_type VARCHAR(255) NOT NULL,
                    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
                    data JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            `);

            // Agents table (for agent activity tracking)
            await client.query(`
                CREATE TABLE IF NOT EXISTS agent_events (
                    id SERIAL PRIMARY KEY,
                    agent_type VARCHAR(100) NOT NULL,
                    agent_id VARCHAR(255),
                    event_type VARCHAR(255) NOT NULL,
                    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
                    data JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            `);

            // Deployments table (for WSL2 deployment tracking)
            await client.query(`
                CREATE TABLE IF NOT EXISTS deployment_events (
                    id SERIAL PRIMARY KEY,
                    deployment_id VARCHAR(255) NOT NULL,
                    event_type VARCHAR(255) NOT NULL,
                    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
                    data JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            `);

            // Create indexes for better performance
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
                CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
                CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id);
                CREATE INDEX IF NOT EXISTS idx_agent_events_agent_type ON agent_events(agent_type);
                CREATE INDEX IF NOT EXISTS idx_deployment_events_deployment_id ON deployment_events(deployment_id);
            `);

        } finally {
            client.release();
        }
    }

    /**
     * Log a general event
     */
    async logEvent(event) {
        if (!this.isConnected) {
            throw new Error('Event store is not connected');
        }

        const client = await this.pool.connect();
        
        try {
            const result = await client.query(
                'INSERT INTO events (type, timestamp, data, metadata) VALUES ($1, $2, $3, $4) RETURNING id',
                [
                    event.type,
                    event.timestamp || new Date(),
                    JSON.stringify(event.data || {}),
                    JSON.stringify(event.metadata || {})
                ]
            );

            const eventId = result.rows[0].id;
            this.emit('event.logged', { ...event, id: eventId });
            
            return eventId;

        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to log event: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Log a task-specific event
     */
    async logTaskEvent(taskId, eventType, data = {}) {
        if (!this.isConnected) {
            throw new Error('Event store is not connected');
        }

        const client = await this.pool.connect();
        
        try {
            const result = await client.query(
                'INSERT INTO task_events (task_id, event_type, timestamp, data) VALUES ($1, $2, $3, $4) RETURNING id',
                [
                    taskId,
                    eventType,
                    new Date(),
                    JSON.stringify(data)
                ]
            );

            const eventId = result.rows[0].id;
            this.emit('task.event.logged', { taskId, eventType, data, id: eventId });
            
            return eventId;

        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to log task event: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Log an agent event
     */
    async logAgentEvent(agentType, agentId, eventType, data = {}) {
        if (!this.isConnected) {
            throw new Error('Event store is not connected');
        }

        const client = await this.pool.connect();
        
        try {
            const result = await client.query(
                'INSERT INTO agent_events (agent_type, agent_id, event_type, timestamp, data) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [
                    agentType,
                    agentId,
                    eventType,
                    new Date(),
                    JSON.stringify(data)
                ]
            );

            const eventId = result.rows[0].id;
            this.emit('agent.event.logged', { agentType, agentId, eventType, data, id: eventId });
            
            return eventId;

        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to log agent event: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Log a deployment event
     */
    async logDeploymentEvent(deploymentId, eventType, data = {}) {
        if (!this.isConnected) {
            throw new Error('Event store is not connected');
        }

        const client = await this.pool.connect();
        
        try {
            const result = await client.query(
                'INSERT INTO deployment_events (deployment_id, event_type, timestamp, data) VALUES ($1, $2, $3, $4) RETURNING id',
                [
                    deploymentId,
                    eventType,
                    new Date(),
                    JSON.stringify(data)
                ]
            );

            const eventId = result.rows[0].id;
            this.emit('deployment.event.logged', { deploymentId, eventType, data, id: eventId });
            
            return eventId;

        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to log deployment event: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Query events
     */
    async queryEvents(filters = {}) {
        if (!this.isConnected) {
            throw new Error('Event store is not connected');
        }

        const client = await this.pool.connect();
        
        try {
            let query = 'SELECT * FROM events WHERE 1=1';
            const params = [];
            let paramCount = 0;

            if (filters.type) {
                paramCount++;
                query += ` AND type = $${paramCount}`;
                params.push(filters.type);
            }

            if (filters.since) {
                paramCount++;
                query += ` AND timestamp >= $${paramCount}`;
                params.push(filters.since);
            }

            if (filters.until) {
                paramCount++;
                query += ` AND timestamp <= $${paramCount}`;
                params.push(filters.until);
            }

            query += ' ORDER BY timestamp DESC';

            if (filters.limit) {
                paramCount++;
                query += ` LIMIT $${paramCount}`;
                params.push(filters.limit);
            }

            const result = await client.query(query, params);
            return result.rows;

        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to query events: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Get task events
     */
    async getTaskEvents(taskId, limit = 100) {
        if (!this.isConnected) {
            throw new Error('Event store is not connected');
        }

        const client = await this.pool.connect();
        
        try {
            const result = await client.query(
                'SELECT * FROM task_events WHERE task_id = $1 ORDER BY timestamp DESC LIMIT $2',
                [taskId, limit]
            );

            return result.rows;

        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to get task events: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Get agent events
     */
    async getAgentEvents(agentType, agentId = null, limit = 100) {
        if (!this.isConnected) {
            throw new Error('Event store is not connected');
        }

        const client = await this.pool.connect();
        
        try {
            let query = 'SELECT * FROM agent_events WHERE agent_type = $1';
            const params = [agentType];

            if (agentId) {
                query += ' AND agent_id = $2';
                params.push(agentId);
                query += ' ORDER BY timestamp DESC LIMIT $3';
                params.push(limit);
            } else {
                query += ' ORDER BY timestamp DESC LIMIT $2';
                params.push(limit);
            }

            const result = await client.query(query, params);
            return result.rows;

        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to get agent events: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Close the event store connection
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            this.emit('disconnected');
        }
    }

    /**
     * Check if event store is connected
     */
    isConnected() {
        return this.isConnected;
    }

    /**
     * Get event store statistics
     */
    async getStatistics() {
        if (!this.isConnected) {
            throw new Error('Event store is not connected');
        }

        const client = await this.pool.connect();
        
        try {
            const [events, taskEvents, agentEvents, deploymentEvents] = await Promise.all([
                client.query('SELECT COUNT(*) as count FROM events'),
                client.query('SELECT COUNT(*) as count FROM task_events'),
                client.query('SELECT COUNT(*) as count FROM agent_events'),
                client.query('SELECT COUNT(*) as count FROM deployment_events')
            ]);

            return {
                totalEvents: parseInt(events.rows[0].count),
                taskEvents: parseInt(taskEvents.rows[0].count),
                agentEvents: parseInt(agentEvents.rows[0].count),
                deploymentEvents: parseInt(deploymentEvents.rows[0].count)
            };

        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to get statistics: ${error.message}`);
        } finally {
            client.release();
        }
    }
}

export default EventStore;

