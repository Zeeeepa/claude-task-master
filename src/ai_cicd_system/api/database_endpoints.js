/**
 * @fileoverview Database API Endpoints
 * @description RESTful API endpoints for secure database operations with Cloudflare integration
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { body, param, query, validationResult } from 'express-validator';
import { getPoolManager } from '../database/connection_pool.js';
import { cloudflareConfig } from '../database/cloudflare_config.js';
import { log } from '../../../scripts/modules/utils.js';

const router = express.Router();

/**
 * Middleware for API key authentication
 */
const authenticateApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
        
        if (!apiKey) {
            return res.status(401).json({ 
                error: 'API key required',
                code: 'MISSING_API_KEY'
            });
        }

        // Validate API key against database
        const poolManager = getPoolManager();
        const result = await poolManager.query(
            'SELECT id, user_id, permissions, rate_limit_per_hour, rate_limit_per_day, expires_at, is_active FROM api_keys WHERE key_hash = $1',
            [require('crypto').createHash('sha256').update(apiKey).digest('hex')],
            { poolName: 'readonly' }
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ 
                error: 'Invalid API key',
                code: 'INVALID_API_KEY'
            });
        }

        const keyData = result.rows[0];

        // Check if key is active and not expired
        if (!keyData.is_active) {
            return res.status(401).json({ 
                error: 'API key is inactive',
                code: 'INACTIVE_API_KEY'
            });
        }

        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            return res.status(401).json({ 
                error: 'API key has expired',
                code: 'EXPIRED_API_KEY'
            });
        }

        // Update last used timestamp
        await poolManager.query(
            'UPDATE api_keys SET last_used_at = NOW(), usage_count = usage_count + 1 WHERE id = $1',
            [keyData.id],
            { poolName: 'primary' }
        );

        // Attach key data to request
        req.apiKey = keyData;
        req.userId = keyData.user_id;
        
        next();
    } catch (error) {
        log('error', `API key authentication error: ${error.message}`);
        res.status(500).json({ 
            error: 'Authentication error',
            code: 'AUTH_ERROR'
        });
    }
};

/**
 * Middleware for permission checking
 */
const checkPermission = (requiredPermission) => {
    return (req, res, next) => {
        const permissions = req.apiKey.permissions || [];
        
        if (!permissions.includes(requiredPermission) && !permissions.includes('admin')) {
            return res.status(403).json({ 
                error: 'Insufficient permissions',
                code: 'INSUFFICIENT_PERMISSIONS',
                required: requiredPermission
            });
        }
        
        next();
    };
};

/**
 * Middleware for request logging
 */
const logRequest = async (req, res, next) => {
    const requestId = require('crypto').randomUUID();
    req.requestId = requestId;

    const logData = {
        request_id: requestId,
        endpoint: req.path,
        method: req.method,
        user_id: req.userId,
        api_key_id: req.apiKey?.id,
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        request_headers: JSON.stringify(req.headers),
        request_body: req.method !== 'GET' ? JSON.stringify(req.body) : null
    };

    try {
        const poolManager = getPoolManager();
        await poolManager.query(
            `INSERT INTO api_access_logs (
                request_id, endpoint, method, user_id, api_key_id, 
                ip_address, user_agent, request_headers, request_body
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                logData.request_id, logData.endpoint, logData.method,
                logData.user_id, logData.api_key_id, logData.ip_address,
                logData.user_agent, logData.request_headers, logData.request_body
            ],
            { poolName: 'background' }
        );
    } catch (error) {
        log('error', `Failed to log request: ${error.message}`);
    }

    // Log response when request completes
    const originalSend = res.send;
    res.send = function(data) {
        res.send = originalSend;
        
        // Log response asynchronously
        setImmediate(async () => {
            try {
                const poolManager = getPoolManager();
                await poolManager.query(
                    `UPDATE api_access_logs SET 
                        response_status = $1, 
                        response_body = $2,
                        execution_time_ms = $3
                    WHERE request_id = $4`,
                    [
                        res.statusCode,
                        JSON.stringify(data),
                        Date.now() - req.startTime,
                        requestId
                    ],
                    { poolName: 'background' }
                );
            } catch (error) {
                log('error', `Failed to update request log: ${error.message}`);
            }
        });

        return originalSend.call(this, data);
    };

    req.startTime = Date.now();
    next();
};

/**
 * Rate limiting configuration
 */
const createRateLimit = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        message: { error: message, code: 'RATE_LIMIT_EXCEEDED' },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => req.apiKey?.id || req.ip
    });
};

// Apply security middleware
router.use(helmet());
router.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));

// Apply rate limiting
router.use(createRateLimit(
    15 * 60 * 1000, // 15 minutes
    100, // limit each API key to 100 requests per windowMs
    'Too many requests from this API key'
));

// Apply authentication and logging
router.use(authenticateApiKey);
router.use(logRequest);

/**
 * Validation middleware
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errors.array()
        });
    }
    next();
};

/**
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
    try {
        const poolManager = getPoolManager();
        const startTime = Date.now();
        
        await poolManager.query('SELECT 1', [], { poolName: 'readonly' });
        
        const responseTime = Date.now() - startTime;
        const stats = poolManager.getStatistics();

        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            response_time_ms: responseTime,
            database: {
                connected: true,
                pools: stats.pools
            },
            version: process.env.npm_package_version || '1.0.0'
        });
    } catch (error) {
        log('error', `Health check failed: ${error.message}`);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message,
            code: 'HEALTH_CHECK_FAILED'
        });
    }
});

/**
 * Get system metrics
 */
router.get('/metrics', 
    checkPermission('read:metrics'),
    async (req, res) => {
        try {
            const poolManager = getPoolManager();
            
            // Get system metrics
            const metricsResult = await poolManager.query(
                `SELECT metric_category, metric_name, metric_value, metric_unit, timestamp
                 FROM system_metrics 
                 WHERE timestamp > NOW() - INTERVAL '1 hour'
                 ORDER BY timestamp DESC`,
                [],
                { poolName: 'readonly' }
            );

            // Get pool statistics
            const poolStats = poolManager.getStatistics();

            res.json({
                pool_statistics: poolStats,
                system_metrics: metricsResult.rows,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            log('error', `Failed to get metrics: ${error.message}`);
            res.status(500).json({
                error: 'Failed to retrieve metrics',
                code: 'METRICS_ERROR'
            });
        }
    }
);

/**
 * Get tasks with filtering and pagination
 */
router.get('/tasks',
    checkPermission('read:tasks'),
    [
        query('page').optional().isInt({ min: 1 }).toInt(),
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
        query('status').optional().isIn(['pending', 'in_progress', 'completed', 'failed', 'cancelled']),
        query('priority').optional().isInt({ min: 0, max: 10 }).toInt(),
        query('assigned_to').optional().isString(),
        query('search').optional().isString()
    ],
    handleValidationErrors,
    async (req, res) => {
        try {
            const {
                page = 1,
                limit = 20,
                status,
                priority,
                assigned_to,
                search
            } = req.query;

            const offset = (page - 1) * limit;
            let whereConditions = [];
            let params = [];
            let paramIndex = 1;

            // Build WHERE conditions
            if (status) {
                whereConditions.push(`status = $${paramIndex++}`);
                params.push(status);
            }
            if (priority !== undefined) {
                whereConditions.push(`priority = $${paramIndex++}`);
                params.push(priority);
            }
            if (assigned_to) {
                whereConditions.push(`assigned_to = $${paramIndex++}`);
                params.push(assigned_to);
            }
            if (search) {
                whereConditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
                params.push(`%${search}%`);
                paramIndex++;
            }

            const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

            // Get total count
            const countResult = await poolManager.query(
                `SELECT COUNT(*) as total FROM tasks ${whereClause}`,
                params,
                { poolName: 'readonly' }
            );

            // Get tasks
            const tasksResult = await poolManager.query(
                `SELECT t.*, 
                    COUNT(tc.id) as context_count,
                    COUNT(ds.id) as deployment_script_count
                 FROM tasks t
                 LEFT JOIN task_contexts tc ON t.id = tc.task_id
                 LEFT JOIN deployment_scripts ds ON t.id = ds.task_id
                 ${whereClause}
                 GROUP BY t.id
                 ORDER BY t.created_at DESC
                 LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                [...params, limit, offset],
                { poolName: 'readonly' }
            );

            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);

            res.json({
                tasks: tasksResult.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    total_pages: totalPages,
                    has_next: page < totalPages,
                    has_prev: page > 1
                }
            });
        } catch (error) {
            log('error', `Failed to get tasks: ${error.message}`);
            res.status(500).json({
                error: 'Failed to retrieve tasks',
                code: 'TASKS_QUERY_ERROR'
            });
        }
    }
);

/**
 * Get task by ID with full details
 */
router.get('/tasks/:id',
    checkPermission('read:tasks'),
    [param('id').isUUID()],
    handleValidationErrors,
    async (req, res) => {
        try {
            const { id } = req.params;
            const poolManager = getPoolManager();

            // Get task details
            const taskResult = await poolManager.query(
                'SELECT * FROM tasks WHERE id = $1',
                [id],
                { poolName: 'readonly' }
            );

            if (taskResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Task not found',
                    code: 'TASK_NOT_FOUND'
                });
            }

            // Get task contexts
            const contextsResult = await poolManager.query(
                'SELECT * FROM task_contexts WHERE task_id = $1 ORDER BY created_at DESC',
                [id],
                { poolName: 'readonly' }
            );

            // Get deployment scripts
            const scriptsResult = await poolManager.query(
                'SELECT * FROM deployment_scripts WHERE task_id = $1 ORDER BY execution_order, created_at',
                [id],
                { poolName: 'readonly' }
            );

            // Get error logs
            const errorsResult = await poolManager.query(
                'SELECT * FROM error_logs WHERE task_id = $1 ORDER BY created_at DESC',
                [id],
                { poolName: 'readonly' }
            );

            // Get dependencies
            const dependenciesResult = await poolManager.query(
                `SELECT td.*, t.title as dependent_task_title
                 FROM task_dependencies td
                 JOIN tasks t ON td.child_task_id = t.id
                 WHERE td.parent_task_id = $1`,
                [id],
                { poolName: 'readonly' }
            );

            res.json({
                task: taskResult.rows[0],
                contexts: contextsResult.rows,
                deployment_scripts: scriptsResult.rows,
                error_logs: errorsResult.rows,
                dependencies: dependenciesResult.rows
            });
        } catch (error) {
            log('error', `Failed to get task details: ${error.message}`);
            res.status(500).json({
                error: 'Failed to retrieve task details',
                code: 'TASK_DETAIL_ERROR'
            });
        }
    }
);

/**
 * Create a new task
 */
router.post('/tasks',
    checkPermission('write:tasks'),
    [
        body('title').isString().isLength({ min: 1, max: 255 }),
        body('description').optional().isString(),
        body('type').optional().isString(),
        body('priority').optional().isInt({ min: 0, max: 10 }),
        body('complexity_score').optional().isInt({ min: 1, max: 10 }),
        body('assigned_to').optional().isString(),
        body('estimated_hours').optional().isFloat({ min: 0 }),
        body('requirements').optional().isArray(),
        body('acceptance_criteria').optional().isArray(),
        body('tags').optional().isArray(),
        body('parent_task_id').optional().isUUID()
    ],
    handleValidationErrors,
    async (req, res) => {
        try {
            const poolManager = getPoolManager();
            
            const result = await poolManager.transaction(async (client) => {
                // Insert task
                const taskResult = await client.query(
                    `INSERT INTO tasks (
                        title, description, type, priority, complexity_score,
                        assigned_to, estimated_hours, requirements, acceptance_criteria,
                        tags, parent_task_id, metadata
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    RETURNING *`,
                    [
                        req.body.title,
                        req.body.description,
                        req.body.type || 'general',
                        req.body.priority || 0,
                        req.body.complexity_score || 5,
                        req.body.assigned_to,
                        req.body.estimated_hours,
                        JSON.stringify(req.body.requirements || []),
                        JSON.stringify(req.body.acceptance_criteria || []),
                        JSON.stringify(req.body.tags || []),
                        req.body.parent_task_id,
                        JSON.stringify({ created_by: req.userId })
                    ]
                );

                // Create initial context
                await client.query(
                    `INSERT INTO task_contexts (task_id, context_type, context_data)
                     VALUES ($1, 'requirement', $2)`,
                    [
                        taskResult.rows[0].id,
                        JSON.stringify({
                            action: 'task_created',
                            user_id: req.userId,
                            timestamp: new Date().toISOString()
                        })
                    ]
                );

                return taskResult.rows[0];
            });

            res.status(201).json({
                message: 'Task created successfully',
                task: result
            });
        } catch (error) {
            log('error', `Failed to create task: ${error.message}`);
            res.status(500).json({
                error: 'Failed to create task',
                code: 'TASK_CREATE_ERROR'
            });
        }
    }
);

/**
 * Update task status
 */
router.patch('/tasks/:id/status',
    checkPermission('write:tasks'),
    [
        param('id').isUUID(),
        body('status').isIn(['pending', 'in_progress', 'completed', 'failed', 'cancelled']),
        body('notes').optional().isString()
    ],
    handleValidationErrors,
    async (req, res) => {
        try {
            const { id } = req.params;
            const { status, notes } = req.body;
            const poolManager = getPoolManager();

            const result = await poolManager.transaction(async (client) => {
                // Update task status
                const updateResult = await client.query(
                    `UPDATE tasks SET 
                        status = $1, 
                        completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
                        updated_at = NOW()
                     WHERE id = $2 
                     RETURNING *`,
                    [status, id]
                );

                if (updateResult.rows.length === 0) {
                    throw new Error('Task not found');
                }

                // Add status change context
                await client.query(
                    `INSERT INTO task_contexts (task_id, context_type, context_data)
                     VALUES ($1, 'status_change', $2)`,
                    [
                        id,
                        JSON.stringify({
                            action: 'status_changed',
                            old_status: updateResult.rows[0].status,
                            new_status: status,
                            notes,
                            user_id: req.userId,
                            timestamp: new Date().toISOString()
                        })
                    ]
                );

                return updateResult.rows[0];
            });

            res.json({
                message: 'Task status updated successfully',
                task: result
            });
        } catch (error) {
            log('error', `Failed to update task status: ${error.message}`);
            
            if (error.message === 'Task not found') {
                res.status(404).json({
                    error: 'Task not found',
                    code: 'TASK_NOT_FOUND'
                });
            } else {
                res.status(500).json({
                    error: 'Failed to update task status',
                    code: 'TASK_UPDATE_ERROR'
                });
            }
        }
    }
);

/**
 * Execute custom database query (admin only)
 */
router.post('/query',
    checkPermission('admin'),
    createRateLimit(60 * 1000, 10, 'Too many query requests'), // Stricter rate limit for queries
    [
        body('sql').isString().isLength({ min: 1, max: 10000 }),
        body('params').optional().isArray(),
        body('pool').optional().isIn(['primary', 'readonly', 'priority', 'background'])
    ],
    handleValidationErrors,
    async (req, res) => {
        try {
            const { sql, params = [], pool = 'readonly' } = req.body;
            
            // Security check: only allow SELECT statements for non-admin users
            const trimmedSql = sql.trim().toUpperCase();
            if (!trimmedSql.startsWith('SELECT') && !req.apiKey.permissions.includes('admin')) {
                return res.status(403).json({
                    error: 'Only SELECT queries are allowed',
                    code: 'QUERY_NOT_ALLOWED'
                });
            }

            const poolManager = getPoolManager();
            const startTime = Date.now();
            
            const result = await poolManager.query(sql, params, { 
                poolName: pool,
                timeout: 30000 // 30 second timeout for custom queries
            });
            
            const executionTime = Date.now() - startTime;

            res.json({
                rows: result.rows,
                row_count: result.rowCount,
                execution_time_ms: executionTime,
                fields: result.fields?.map(f => ({ name: f.name, type: f.dataTypeID }))
            });
        } catch (error) {
            log('error', `Query execution failed: ${error.message}`);
            res.status(500).json({
                error: 'Query execution failed',
                code: 'QUERY_EXECUTION_ERROR',
                details: error.message
            });
        }
    }
);

/**
 * Error handling middleware
 */
router.use((error, req, res, next) => {
    log('error', `API error: ${error.message}`);
    
    res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        request_id: req.requestId
    });
});

export default router;

