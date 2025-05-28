/**
 * @fileoverview Metrics Storage
 * @description Efficient storage and retrieval system for metrics data
 */

import { log } from '../../scripts/modules/utils.js';
import { DatabaseConnection } from '../database/connection.js';

/**
 * Metrics storage system with PostgreSQL backend
 */
export class MetricsStorage {
    constructor(config) {
        this.config = config;
        this.db = null;
        this.connected = false;
        this.retentionDays = config.metrics_retention_days || 30;
        this.batchSize = config.metrics_batch_size || 100;
        this.pendingMetrics = [];
        this.flushInterval = null;
        
        this.initializeDatabase();
    }

    async initializeDatabase() {
        try {
            this.db = new DatabaseConnection(this.config.database);
            await this.db.connect();
            await this.createTables();
            this.connected = true;
            
            // Start batch flushing
            this.startBatchFlushing();
            
            // Start cleanup job
            this.startCleanupJob();
            
            log('info', 'Metrics storage initialized successfully');
        } catch (error) {
            log('error', `Failed to initialize metrics storage: ${error.message}`);
            this.connected = false;
        }
    }

    async createTables() {
        const createMetricsTable = `
            CREATE TABLE IF NOT EXISTS metrics_snapshots (
                id SERIAL PRIMARY KEY,
                timestamp BIGINT NOT NULL,
                collector_type VARCHAR(50) NOT NULL,
                status VARCHAR(20) NOT NULL,
                collection_time_ms DECIMAL(10,2),
                data JSONB NOT NULL,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        const createMetricsIndex = `
            CREATE INDEX IF NOT EXISTS idx_metrics_timestamp 
            ON metrics_snapshots(timestamp);
        `;

        const createMetricsTypeIndex = `
            CREATE INDEX IF NOT EXISTS idx_metrics_type_timestamp 
            ON metrics_snapshots(collector_type, timestamp);
        `;

        const createMetricsDataIndex = `
            CREATE INDEX IF NOT EXISTS idx_metrics_data 
            ON metrics_snapshots USING GIN(data);
        `;

        await this.db.query(createMetricsTable);
        await this.db.query(createMetricsIndex);
        await this.db.query(createMetricsTypeIndex);
        await this.db.query(createMetricsDataIndex);

        log('debug', 'Metrics storage tables created/verified');
    }

    /**
     * Store metrics data
     */
    async store(metricsSnapshot) {
        if (!this.connected) {
            log('warning', 'Metrics storage not connected, queuing metrics');
            this.pendingMetrics.push(metricsSnapshot);
            return;
        }

        try {
            const timestamp = Date.now();
            
            for (const [collectorType, metrics] of Object.entries(metricsSnapshot)) {
                const record = {
                    timestamp: metrics.timestamp || timestamp,
                    collector_type: collectorType,
                    status: metrics.status,
                    collection_time_ms: metrics.collection_time_ms || 0,
                    data: metrics.data || {},
                    error_message: metrics.error || null
                };

                this.pendingMetrics.push(record);
            }

            // Flush if batch is full
            if (this.pendingMetrics.length >= this.batchSize) {
                await this.flushPendingMetrics();
            }

        } catch (error) {
            log('error', `Error storing metrics: ${error.message}`);
            throw error;
        }
    }

    /**
     * Flush pending metrics to database
     */
    async flushPendingMetrics() {
        if (this.pendingMetrics.length === 0) {
            return;
        }

        try {
            const query = `
                INSERT INTO metrics_snapshots 
                (timestamp, collector_type, status, collection_time_ms, data, error_message)
                VALUES ($1, $2, $3, $4, $5, $6)
            `;

            const client = await this.db.getClient();
            
            try {
                await client.query('BEGIN');
                
                for (const metric of this.pendingMetrics) {
                    await client.query(query, [
                        metric.timestamp,
                        metric.collector_type,
                        metric.status,
                        metric.collection_time_ms,
                        JSON.stringify(metric.data),
                        metric.error_message
                    ]);
                }
                
                await client.query('COMMIT');
                
                log('debug', `Flushed ${this.pendingMetrics.length} metrics to database`);
                this.pendingMetrics = [];
                
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }

        } catch (error) {
            log('error', `Error flushing metrics: ${error.message}`);
            // Keep metrics in memory for retry
        }
    }

    /**
     * Get metrics within a time range
     */
    async getMetricsInRange(startTime, endTime, collectorType = null) {
        if (!this.connected) {
            throw new Error('Metrics storage not connected');
        }

        try {
            let query = `
                SELECT timestamp, collector_type, status, collection_time_ms, data, error_message
                FROM metrics_snapshots
                WHERE timestamp >= $1 AND timestamp <= $2
            `;
            
            const params = [startTime, endTime];
            
            if (collectorType) {
                query += ' AND collector_type = $3';
                params.push(collectorType);
            }
            
            query += ' ORDER BY timestamp ASC';

            const result = await this.db.query(query, params);
            
            // Group by timestamp
            const groupedMetrics = {};
            
            for (const row of result.rows) {
                const timestamp = row.timestamp;
                
                if (!groupedMetrics[timestamp]) {
                    groupedMetrics[timestamp] = {};
                }
                
                groupedMetrics[timestamp][row.collector_type] = {
                    timestamp: parseInt(timestamp),
                    status: row.status,
                    collection_time_ms: parseFloat(row.collection_time_ms),
                    data: row.data,
                    error: row.error_message
                };
            }

            return groupedMetrics;

        } catch (error) {
            log('error', `Error retrieving metrics: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get latest metrics for each collector type
     */
    async getLatestMetrics() {
        if (!this.connected) {
            throw new Error('Metrics storage not connected');
        }

        try {
            const query = `
                SELECT DISTINCT ON (collector_type) 
                    timestamp, collector_type, status, collection_time_ms, data, error_message
                FROM metrics_snapshots
                ORDER BY collector_type, timestamp DESC
            `;

            const result = await this.db.query(query);
            
            const latestMetrics = {};
            
            for (const row of result.rows) {
                latestMetrics[row.collector_type] = {
                    timestamp: parseInt(row.timestamp),
                    status: row.status,
                    collection_time_ms: parseFloat(row.collection_time_ms),
                    data: row.data,
                    error: row.error_message
                };
            }

            return latestMetrics;

        } catch (error) {
            log('error', `Error retrieving latest metrics: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get aggregated metrics for a time range
     */
    async getAggregatedMetrics(startTime, endTime, collectorType, aggregation = 'avg') {
        if (!this.connected) {
            throw new Error('Metrics storage not connected');
        }

        try {
            // This is a simplified aggregation - in production you'd want more sophisticated aggregation
            const query = `
                SELECT 
                    collector_type,
                    COUNT(*) as sample_count,
                    AVG(collection_time_ms) as avg_collection_time,
                    MIN(timestamp) as first_timestamp,
                    MAX(timestamp) as last_timestamp
                FROM metrics_snapshots
                WHERE timestamp >= $1 AND timestamp <= $2
                AND collector_type = $3
                AND status = 'success'
                GROUP BY collector_type
            `;

            const result = await this.db.query(query, [startTime, endTime, collectorType]);
            
            return result.rows[0] || null;

        } catch (error) {
            log('error', `Error retrieving aggregated metrics: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get metrics statistics
     */
    async getMetricsStats() {
        if (!this.connected) {
            return {
                connected: false,
                total_records: 0,
                collectors: [],
                oldest_record: null,
                newest_record: null
            };
        }

        try {
            const statsQuery = `
                SELECT 
                    COUNT(*) as total_records,
                    MIN(timestamp) as oldest_timestamp,
                    MAX(timestamp) as newest_timestamp,
                    COUNT(DISTINCT collector_type) as collector_count
                FROM metrics_snapshots
            `;

            const collectorsQuery = `
                SELECT 
                    collector_type,
                    COUNT(*) as record_count,
                    MAX(timestamp) as last_update
                FROM metrics_snapshots
                GROUP BY collector_type
                ORDER BY collector_type
            `;

            const [statsResult, collectorsResult] = await Promise.all([
                this.db.query(statsQuery),
                this.db.query(collectorsQuery)
            ]);

            const stats = statsResult.rows[0];
            
            return {
                connected: true,
                total_records: parseInt(stats.total_records),
                oldest_record: stats.oldest_timestamp ? new Date(parseInt(stats.oldest_timestamp)).toISOString() : null,
                newest_record: stats.newest_timestamp ? new Date(parseInt(stats.newest_timestamp)).toISOString() : null,
                collector_count: parseInt(stats.collector_count),
                collectors: collectorsResult.rows.map(row => ({
                    type: row.collector_type,
                    record_count: parseInt(row.record_count),
                    last_update: new Date(parseInt(row.last_update)).toISOString()
                })),
                pending_metrics: this.pendingMetrics.length,
                retention_days: this.retentionDays
            };

        } catch (error) {
            log('error', `Error retrieving metrics stats: ${error.message}`);
            return {
                connected: false,
                error: error.message
            };
        }
    }

    /**
     * Start batch flushing interval
     */
    startBatchFlushing() {
        this.flushInterval = setInterval(async () => {
            if (this.pendingMetrics.length > 0) {
                await this.flushPendingMetrics();
            }
        }, 30000); // Flush every 30 seconds

        log('debug', 'Started metrics batch flushing');
    }

    /**
     * Start cleanup job for old metrics
     */
    startCleanupJob() {
        // Run cleanup every 6 hours
        setInterval(async () => {
            await this.cleanupOldMetrics();
        }, 6 * 60 * 60 * 1000);

        log('debug', 'Started metrics cleanup job');
    }

    /**
     * Clean up old metrics based on retention policy
     */
    async cleanupOldMetrics() {
        if (!this.connected) {
            return;
        }

        try {
            const cutoffTime = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
            
            const query = `
                DELETE FROM metrics_snapshots 
                WHERE timestamp < $1
            `;

            const result = await this.db.query(query, [cutoffTime]);
            
            if (result.rowCount > 0) {
                log('info', `Cleaned up ${result.rowCount} old metrics records`);
            }

        } catch (error) {
            log('error', `Error during metrics cleanup: ${error.message}`);
        }
    }

    /**
     * Check if storage is connected
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Close storage connection
     */
    async close() {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
        }

        // Flush any remaining metrics
        if (this.pendingMetrics.length > 0) {
            await this.flushPendingMetrics();
        }

        if (this.db) {
            await this.db.close();
        }

        this.connected = false;
        log('info', 'Metrics storage closed');
    }
}

export default MetricsStorage;

