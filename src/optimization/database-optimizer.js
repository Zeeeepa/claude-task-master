/**
 * @fileoverview Database Optimizer
 * @description Database performance optimization and query analysis
 */

import { performance } from 'perf_hooks';
import EventEmitter from 'events';

/**
 * Database Optimizer for performance optimization and monitoring
 */
export class DatabaseOptimizer extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enabled: config.enabled !== false,
            slowQueryThreshold: config.slowQueryThreshold || 1000, // 1 second
            connectionPoolSize: config.connectionPoolSize || 20,
            connectionTimeout: config.connectionTimeout || 30000,
            idleTimeout: config.idleTimeout || 10000,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            enableQueryLogging: config.enableQueryLogging !== false,
            enableIndexAnalysis: config.enableIndexAnalysis !== false,
            ...config
        };

        this.queryStats = new Map();
        this.slowQueries = [];
        this.connectionPool = null;
        this.indexAnalysis = new Map();
        this.optimizationSuggestions = [];
        this.isInitialized = false;
    }

    /**
     * Initialize the database optimizer
     */
    async initialize(databaseConnection) {
        if (!this.config.enabled) {
            console.log('Database optimization disabled');
            return;
        }

        console.log('Initializing database optimizer...');
        
        this.connectionPool = databaseConnection;
        
        // Set up query monitoring
        this.setupQueryMonitoring();
        
        // Analyze existing indexes
        if (this.config.enableIndexAnalysis) {
            await this.analyzeIndexes();
        }
        
        // Set up connection pool optimization
        this.optimizeConnectionPool();
        
        this.isInitialized = true;
        this.emit('initialized');
        
        console.log('Database optimizer initialized');
    }

    /**
     * Optimize a query
     */
    async optimizeQuery(query, params = []) {
        if (!this.config.enabled) {
            return this.executeQuery(query, params);
        }

        const queryId = this.generateQueryId(query);
        const startTime = performance.now();
        
        try {
            // Check if we have optimization suggestions for this query
            const optimizedQuery = this.getOptimizedQuery(query);
            
            // Execute the query
            const result = await this.executeQuery(optimizedQuery, params);
            const duration = performance.now() - startTime;
            
            // Record query statistics
            this.recordQueryStats(queryId, query, duration, true);
            
            // Check if this is a slow query
            if (duration > this.config.slowQueryThreshold) {
                this.handleSlowQuery(queryId, query, duration, params);
            }
            
            return result;
            
        } catch (error) {
            const duration = performance.now() - startTime;
            this.recordQueryStats(queryId, query, duration, false, error);
            throw error;
        }
    }

    /**
     * Execute a query with retry logic
     */
    async executeQuery(query, params = [], retryCount = 0) {
        try {
            if (!this.connectionPool) {
                throw new Error('Database connection pool not initialized');
            }
            
            const client = await this.connectionPool.connect();
            try {
                const result = await client.query(query, params);
                return result;
            } finally {
                client.release();
            }
            
        } catch (error) {
            if (retryCount < this.config.maxRetries && this.isRetryableError(error)) {
                console.warn(`Query failed, retrying (${retryCount + 1}/${this.config.maxRetries}):`, error.message);
                await this.delay(this.config.retryDelay * (retryCount + 1));
                return this.executeQuery(query, params, retryCount + 1);
            }
            throw error;
        }
    }

    /**
     * Generate a unique ID for a query
     */
    generateQueryId(query) {
        // Normalize query by removing extra whitespace and parameters
        const normalized = query.replace(/\s+/g, ' ').trim().toLowerCase();
        return Buffer.from(normalized).toString('base64').substring(0, 16);
    }

    /**
     * Record query statistics
     */
    recordQueryStats(queryId, query, duration, success, error = null) {
        if (!this.queryStats.has(queryId)) {
            this.queryStats.set(queryId, {
                query: query.substring(0, 200), // Store first 200 chars
                count: 0,
                totalDuration: 0,
                avgDuration: 0,
                minDuration: Infinity,
                maxDuration: 0,
                successCount: 0,
                errorCount: 0,
                lastExecuted: null,
                errors: []
            });
        }

        const stats = this.queryStats.get(queryId);
        stats.count++;
        stats.totalDuration += duration;
        stats.avgDuration = stats.totalDuration / stats.count;
        stats.minDuration = Math.min(stats.minDuration, duration);
        stats.maxDuration = Math.max(stats.maxDuration, duration);
        stats.lastExecuted = Date.now();

        if (success) {
            stats.successCount++;
        } else {
            stats.errorCount++;
            if (error) {
                stats.errors.push({
                    message: error.message,
                    timestamp: Date.now()
                });
                // Keep only last 10 errors
                if (stats.errors.length > 10) {
                    stats.errors = stats.errors.slice(-10);
                }
            }
        }

        this.emit('query_executed', { queryId, stats, duration, success });
    }

    /**
     * Handle slow queries
     */
    handleSlowQuery(queryId, query, duration, params) {
        const slowQuery = {
            queryId,
            query,
            duration,
            params: params.slice(0, 10), // Store first 10 params
            timestamp: Date.now()
        };

        this.slowQueries.push(slowQuery);
        
        // Keep only last 100 slow queries
        if (this.slowQueries.length > 100) {
            this.slowQueries = this.slowQueries.slice(-100);
        }

        this.emit('slow_query', slowQuery);
        
        // Generate optimization suggestions
        this.generateOptimizationSuggestions(query, duration);
        
        console.warn(`Slow query detected (${duration.toFixed(2)}ms):`, query.substring(0, 100));
    }

    /**
     * Generate optimization suggestions for a query
     */
    generateOptimizationSuggestions(query, duration) {
        const suggestions = [];
        const queryLower = query.toLowerCase();

        // Check for missing WHERE clauses
        if (queryLower.includes('select') && !queryLower.includes('where') && !queryLower.includes('limit')) {
            suggestions.push({
                type: 'missing_where',
                message: 'Consider adding WHERE clause to limit result set',
                severity: 'high',
                query: query.substring(0, 100)
            });
        }

        // Check for SELECT *
        if (queryLower.includes('select *')) {
            suggestions.push({
                type: 'select_star',
                message: 'Avoid SELECT * - specify only needed columns',
                severity: 'medium',
                query: query.substring(0, 100)
            });
        }

        // Check for missing LIMIT
        if (queryLower.includes('select') && !queryLower.includes('limit') && duration > 2000) {
            suggestions.push({
                type: 'missing_limit',
                message: 'Consider adding LIMIT clause for large result sets',
                severity: 'medium',
                query: query.substring(0, 100)
            });
        }

        // Check for N+1 queries (multiple similar queries)
        const queryPattern = this.extractQueryPattern(query);
        const similarQueries = Array.from(this.queryStats.values())
            .filter(stat => this.extractQueryPattern(stat.query) === queryPattern);
        
        if (similarQueries.length > 10) {
            suggestions.push({
                type: 'n_plus_one',
                message: 'Potential N+1 query pattern detected - consider using JOINs or batch queries',
                severity: 'high',
                query: query.substring(0, 100),
                count: similarQueries.length
            });
        }

        // Add suggestions to the list
        suggestions.forEach(suggestion => {
            suggestion.timestamp = Date.now();
            this.optimizationSuggestions.push(suggestion);
        });

        // Keep only last 50 suggestions
        if (this.optimizationSuggestions.length > 50) {
            this.optimizationSuggestions = this.optimizationSuggestions.slice(-50);
        }

        if (suggestions.length > 0) {
            this.emit('optimization_suggestions', suggestions);
        }
    }

    /**
     * Extract query pattern for similarity detection
     */
    extractQueryPattern(query) {
        // Remove parameters and normalize for pattern matching
        return query
            .replace(/\$\d+/g, '?') // Replace $1, $2, etc. with ?
            .replace(/\d+/g, 'N') // Replace numbers with N
            .replace(/'.+?'/g, "'X'") // Replace string literals with 'X'
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    /**
     * Get optimized version of a query
     */
    getOptimizedQuery(query) {
        // For now, return the original query
        // In the future, this could apply automatic optimizations
        return query;
    }

    /**
     * Analyze database indexes
     */
    async analyzeIndexes() {
        try {
            console.log('Analyzing database indexes...');
            
            // Get all tables
            const tablesResult = await this.executeQuery(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_type = 'BASE TABLE'
            `);

            for (const table of tablesResult.rows) {
                await this.analyzeTableIndexes(table.table_name);
            }
            
            console.log('Index analysis completed');
            
        } catch (error) {
            console.error('Error analyzing indexes:', error);
        }
    }

    /**
     * Analyze indexes for a specific table
     */
    async analyzeTableIndexes(tableName) {
        try {
            // Get indexes for the table
            const indexesResult = await this.executeQuery(`
                SELECT 
                    indexname,
                    indexdef,
                    schemaname,
                    tablename
                FROM pg_indexes 
                WHERE tablename = $1
            `, [tableName]);

            // Get table statistics
            const statsResult = await this.executeQuery(`
                SELECT 
                    n_tup_ins as inserts,
                    n_tup_upd as updates,
                    n_tup_del as deletes,
                    n_live_tup as live_tuples,
                    n_dead_tup as dead_tuples
                FROM pg_stat_user_tables 
                WHERE relname = $1
            `, [tableName]);

            const analysis = {
                tableName,
                indexes: indexesResult.rows,
                statistics: statsResult.rows[0] || {},
                suggestions: [],
                lastAnalyzed: Date.now()
            };

            // Generate index suggestions
            this.generateIndexSuggestions(analysis);
            
            this.indexAnalysis.set(tableName, analysis);
            
        } catch (error) {
            console.error(`Error analyzing indexes for table ${tableName}:`, error);
        }
    }

    /**
     * Generate index suggestions for a table
     */
    generateIndexSuggestions(analysis) {
        const { tableName, indexes, statistics } = analysis;
        
        // Check for tables without primary key
        const hasPrimaryKey = indexes.some(idx => idx.indexdef.includes('PRIMARY KEY'));
        if (!hasPrimaryKey) {
            analysis.suggestions.push({
                type: 'missing_primary_key',
                message: `Table ${tableName} is missing a primary key`,
                severity: 'high'
            });
        }

        // Check for high update/delete ratio without proper indexes
        if (statistics.updates > 1000 || statistics.deletes > 1000) {
            if (indexes.length < 2) { // Only primary key
                analysis.suggestions.push({
                    type: 'high_modification_low_indexes',
                    message: `Table ${tableName} has high modification rate but few indexes`,
                    severity: 'medium'
                });
            }
        }

        // Check for dead tuples
        if (statistics.dead_tuples > statistics.live_tuples * 0.1) {
            analysis.suggestions.push({
                type: 'high_dead_tuples',
                message: `Table ${tableName} has high dead tuple ratio - consider VACUUM`,
                severity: 'medium'
            });
        }
    }

    /**
     * Optimize connection pool settings
     */
    optimizeConnectionPool() {
        if (!this.connectionPool || !this.connectionPool.options) {
            return;
        }

        const currentConfig = this.connectionPool.options;
        const optimizations = [];

        // Suggest pool size optimization based on CPU cores
        const cpuCores = require('os').cpus().length;
        const suggestedPoolSize = Math.min(cpuCores * 2, 20);
        
        if (currentConfig.max !== suggestedPoolSize) {
            optimizations.push({
                setting: 'max_connections',
                current: currentConfig.max,
                suggested: suggestedPoolSize,
                reason: 'Optimize based on CPU cores'
            });
        }

        // Suggest idle timeout optimization
        if (currentConfig.idleTimeoutMillis > 30000) {
            optimizations.push({
                setting: 'idle_timeout',
                current: currentConfig.idleTimeoutMillis,
                suggested: 10000,
                reason: 'Reduce idle connection timeout'
            });
        }

        if (optimizations.length > 0) {
            this.emit('pool_optimization_suggestions', optimizations);
        }
    }

    /**
     * Check if an error is retryable
     */
    isRetryableError(error) {
        const retryableErrors = [
            'ECONNRESET',
            'ENOTFOUND',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'connection terminated unexpectedly'
        ];

        return retryableErrors.some(retryableError => 
            error.message.includes(retryableError) || error.code === retryableError
        );
    }

    /**
     * Setup query monitoring
     */
    setupQueryMonitoring() {
        // This would integrate with the database connection to monitor queries
        console.log('Query monitoring enabled');
    }

    /**
     * Get query statistics
     */
    getQueryStats() {
        const stats = Array.from(this.queryStats.entries()).map(([id, stat]) => ({
            id,
            ...stat
        }));

        return stats.sort((a, b) => b.avgDuration - a.avgDuration);
    }

    /**
     * Get slow queries
     */
    getSlowQueries(limit = 20) {
        return this.slowQueries
            .sort((a, b) => b.duration - a.duration)
            .slice(0, limit);
    }

    /**
     * Get optimization suggestions
     */
    getOptimizationSuggestions() {
        return this.optimizationSuggestions
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get index analysis
     */
    getIndexAnalysis() {
        const result = {};
        for (const [tableName, analysis] of this.indexAnalysis) {
            result[tableName] = analysis;
        }
        return result;
    }

    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        const totalQueries = Array.from(this.queryStats.values())
            .reduce((sum, stat) => sum + stat.count, 0);
        
        const totalDuration = Array.from(this.queryStats.values())
            .reduce((sum, stat) => sum + stat.totalDuration, 0);
        
        const avgDuration = totalQueries > 0 ? totalDuration / totalQueries : 0;
        
        const errorCount = Array.from(this.queryStats.values())
            .reduce((sum, stat) => sum + stat.errorCount, 0);
        
        const errorRate = totalQueries > 0 ? (errorCount / totalQueries) * 100 : 0;

        return {
            totalQueries,
            avgDuration,
            errorRate,
            slowQueryCount: this.slowQueries.length,
            optimizationSuggestionCount: this.optimizationSuggestions.length,
            tablesAnalyzed: this.indexAnalysis.size,
            isInitialized: this.isInitialized
        };
    }

    /**
     * Utility function for delays
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default DatabaseOptimizer;

