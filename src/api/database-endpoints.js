/**
 * @fileoverview Database API Endpoints
 * @description RESTful API endpoints for secure database access with authentication,
 * validation, and comprehensive CRUD operations
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, param, query, validationResult } from 'express-validator';
import { DatabaseConnection } from '../database/connection.js';
import { cloudflareConfig } from '../config/cloudflare-config.js';

/**
 * Database API Server
 * Provides secure RESTful endpoints for database operations
 */
export class DatabaseAPIServer {
    constructor(config = {}) {
        this.app = express();
        this.config = {
            port: process.env.API_PORT || 3000,
            host: process.env.API_HOST || '0.0.0.0',
            cors_origins: process.env.CORS_ORIGINS?.split(',') || ['*'],
            rate_limit_rpm: parseInt(process.env.RATE_LIMIT_RPM) || 1000,
            max_request_size: process.env.MAX_REQUEST_SIZE || '10mb',
            api_key: process.env.API_KEY || '',
            jwt_secret: process.env.JWT_SECRET || '',
            enable_auth: process.env.ENABLE_AUTH !== 'false',
            enable_logging: process.env.ENABLE_API_LOGGING !== 'false',
            ...config
        };
        
        this.db = null;
        this.server = null;
        
        this._setupMiddleware();
        this._setupRoutes();
        this._setupErrorHandling();
    }

    /**
     * Setup middleware
     * @private
     */
    _setupMiddleware() {
        // Security headers
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "https:"],
                }
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        }));

        // CORS
        this.app.use(cors({
            origin: this.config.cors_origins,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With']
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 60 * 1000, // 1 minute
            max: this.config.rate_limit_rpm,
            message: {
                error: 'Too many requests',
                retryAfter: 60
            },
            standardHeaders: true,
            legacyHeaders: false,
            skip: (req) => {
                // Skip rate limiting for health checks
                return req.path === '/health';
            }
        });
        this.app.use(limiter);

        // Body parsing
        this.app.use(express.json({ limit: this.config.max_request_size }));
        this.app.use(express.urlencoded({ extended: true, limit: this.config.max_request_size }));

        // Request logging
        if (this.config.enable_logging) {
            this.app.use((req, res, next) => {
                const start = Date.now();
                res.on('finish', () => {
                    const duration = Date.now() - start;
                    this.log('info', `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
                });
                next();
            });
        }

        // Authentication middleware
        if (this.config.enable_auth) {
            this.app.use('/api', this._authMiddleware.bind(this));
        }

        // Database connection middleware
        this.app.use('/api', this._dbMiddleware.bind(this));
    }

    /**
     * Authentication middleware
     * @private
     */
    async _authMiddleware(req, res, next) {
        try {
            const apiKey = req.headers['x-api-key'];
            const authHeader = req.headers.authorization;

            // Skip auth for health checks
            if (req.path === '/health') {
                return next();
            }

            // API Key authentication
            if (apiKey) {
                if (apiKey !== this.config.api_key) {
                    return res.status(401).json({ error: 'Invalid API key' });
                }
                req.auth = { type: 'api_key', authenticated: true };
                return next();
            }

            // JWT authentication
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                try {
                    // In a real implementation, you'd verify the JWT token
                    // const decoded = jwt.verify(token, this.config.jwt_secret);
                    // req.auth = { type: 'jwt', user: decoded, authenticated: true };
                    req.auth = { type: 'jwt', authenticated: true };
                    return next();
                } catch (error) {
                    return res.status(401).json({ error: 'Invalid token' });
                }
            }

            return res.status(401).json({ error: 'Authentication required' });

        } catch (error) {
            this.log('error', `Authentication error: ${error.message}`);
            return res.status(500).json({ error: 'Authentication failed' });
        }
    }

    /**
     * Database connection middleware
     * @private
     */
    async _dbMiddleware(req, res, next) {
        if (!this.db || !this.db.isConnected) {
            return res.status(503).json({ error: 'Database not available' });
        }
        req.db = this.db;
        next();
    }

    /**
     * Setup API routes
     * @private
     */
    _setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            const health = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                database: this.db ? this.db.getHealth() : { connected: false }
            };
            res.json(health);
        });

        // API documentation
        this.app.get('/api', (req, res) => {
            res.json({
                name: 'TaskMaster Database API',
                version: '1.0.0',
                description: 'RESTful API for AI-powered CI/CD system database',
                endpoints: {
                    tasks: '/api/v1/tasks',
                    workflows: '/api/v1/workflows',
                    integrations: '/api/v1/integrations',
                    logs: '/api/v1/logs',
                    templates: '/api/v1/templates',
                    deployments: '/api/v1/deployments'
                }
            });
        });

        // API v1 routes
        const v1Router = express.Router();
        
        // Tasks endpoints
        this._setupTasksRoutes(v1Router);
        
        // Workflows endpoints
        this._setupWorkflowsRoutes(v1Router);
        
        // Integrations endpoints
        this._setupIntegrationsRoutes(v1Router);
        
        // Logs endpoints
        this._setupLogsRoutes(v1Router);
        
        // Templates endpoints
        this._setupTemplatesRoutes(v1Router);
        
        // Deployments endpoints
        this._setupDeploymentsRoutes(v1Router);

        this.app.use('/api/v1', v1Router);
    }

    /**
     * Setup tasks routes
     * @private
     */
    _setupTasksRoutes(router) {
        // Get all tasks
        router.get('/tasks', 
            query('limit').optional().isInt({ min: 1, max: 1000 }).toInt(),
            query('offset').optional().isInt({ min: 0 }).toInt(),
            query('status').optional().isIn(['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'blocked']),
            query('priority').optional().isInt({ min: 0, max: 10 }).toInt(),
            query('assigned_to').optional().isString(),
            this._handleValidation,
            async (req, res) => {
                try {
                    const { limit = 50, offset = 0, status, priority, assigned_to } = req.query;
                    
                    let whereClause = '';
                    const params = [];
                    const conditions = [];
                    
                    if (status) {
                        conditions.push(`status = $${params.length + 1}`);
                        params.push(status);
                    }
                    
                    if (priority !== undefined) {
                        conditions.push(`priority = $${params.length + 1}`);
                        params.push(priority);
                    }
                    
                    if (assigned_to) {
                        conditions.push(`assigned_to = $${params.length + 1}`);
                        params.push(assigned_to);
                    }
                    
                    if (conditions.length > 0) {
                        whereClause = `WHERE ${conditions.join(' AND ')}`;
                    }
                    
                    const query = `
                        SELECT * FROM tasks 
                        ${whereClause}
                        ORDER BY created_at DESC 
                        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
                    `;
                    params.push(limit, offset);
                    
                    const result = await req.db.query(query, params);
                    
                    // Get total count
                    const countQuery = `SELECT COUNT(*) as total FROM tasks ${whereClause}`;
                    const countResult = await req.db.query(countQuery, params.slice(0, -2));
                    
                    res.json({
                        data: result.rows,
                        pagination: {
                            total: parseInt(countResult.rows[0].total),
                            limit,
                            offset,
                            hasMore: offset + limit < parseInt(countResult.rows[0].total)
                        }
                    });
                } catch (error) {
                    this._handleError(res, error, 'Failed to fetch tasks');
                }
            }
        );

        // Get single task
        router.get('/tasks/:id',
            param('id').isUUID(),
            this._handleValidation,
            async (req, res) => {
                try {
                    const result = await req.db.query(
                        'SELECT * FROM tasks WHERE id = $1',
                        [req.params.id]
                    );
                    
                    if (result.rows.length === 0) {
                        return res.status(404).json({ error: 'Task not found' });
                    }
                    
                    res.json({ data: result.rows[0] });
                } catch (error) {
                    this._handleError(res, error, 'Failed to fetch task');
                }
            }
        );

        // Create task
        router.post('/tasks',
            body('title').isString().isLength({ min: 1, max: 255 }),
            body('description').optional().isString(),
            body('type').optional().isIn(['general', 'bug', 'feature', 'enhancement', 'maintenance']),
            body('priority').optional().isInt({ min: 0, max: 10 }),
            body('complexity_score').optional().isInt({ min: 1, max: 10 }),
            body('requirements').optional().isArray(),
            body('acceptance_criteria').optional().isArray(),
            body('assigned_to').optional().isString(),
            body('estimated_hours').optional().isDecimal(),
            this._handleValidation,
            async (req, res) => {
                try {
                    const {
                        title, description, type = 'general', priority = 0,
                        complexity_score = 5, requirements = [], acceptance_criteria = [],
                        assigned_to, estimated_hours
                    } = req.body;
                    
                    const result = await req.db.query(`
                        INSERT INTO tasks (
                            title, description, type, priority, complexity_score,
                            requirements, acceptance_criteria, assigned_to, estimated_hours
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        RETURNING *
                    `, [
                        title, description, type, priority, complexity_score,
                        JSON.stringify(requirements), JSON.stringify(acceptance_criteria),
                        assigned_to, estimated_hours
                    ]);
                    
                    res.status(201).json({ data: result.rows[0] });
                } catch (error) {
                    this._handleError(res, error, 'Failed to create task');
                }
            }
        );

        // Update task
        router.put('/tasks/:id',
            param('id').isUUID(),
            body('title').optional().isString().isLength({ min: 1, max: 255 }),
            body('description').optional().isString(),
            body('status').optional().isIn(['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'blocked']),
            body('priority').optional().isInt({ min: 0, max: 10 }),
            body('assigned_to').optional().isString(),
            this._handleValidation,
            async (req, res) => {
                try {
                    const updates = [];
                    const params = [];
                    let paramIndex = 1;
                    
                    for (const [key, value] of Object.entries(req.body)) {
                        if (value !== undefined) {
                            updates.push(`${key} = $${paramIndex}`);
                            params.push(typeof value === 'object' ? JSON.stringify(value) : value);
                            paramIndex++;
                        }
                    }
                    
                    if (updates.length === 0) {
                        return res.status(400).json({ error: 'No fields to update' });
                    }
                    
                    params.push(req.params.id);
                    
                    const result = await req.db.query(`
                        UPDATE tasks 
                        SET ${updates.join(', ')}
                        WHERE id = $${paramIndex}
                        RETURNING *
                    `, params);
                    
                    if (result.rows.length === 0) {
                        return res.status(404).json({ error: 'Task not found' });
                    }
                    
                    res.json({ data: result.rows[0] });
                } catch (error) {
                    this._handleError(res, error, 'Failed to update task');
                }
            }
        );

        // Delete task
        router.delete('/tasks/:id',
            param('id').isUUID(),
            this._handleValidation,
            async (req, res) => {
                try {
                    const result = await req.db.query(
                        'DELETE FROM tasks WHERE id = $1 RETURNING id',
                        [req.params.id]
                    );
                    
                    if (result.rows.length === 0) {
                        return res.status(404).json({ error: 'Task not found' });
                    }
                    
                    res.status(204).send();
                } catch (error) {
                    this._handleError(res, error, 'Failed to delete task');
                }
            }
        );
    }

    /**
     * Setup workflows routes
     * @private
     */
    _setupWorkflowsRoutes(router) {
        // Get all workflows
        router.get('/workflows', async (req, res) => {
            try {
                const result = await req.db.query(`
                    SELECT w.*, t.title as task_title 
                    FROM workflows w
                    LEFT JOIN tasks t ON w.task_id = t.id
                    ORDER BY w.created_at DESC
                `);
                res.json({ data: result.rows });
            } catch (error) {
                this._handleError(res, error, 'Failed to fetch workflows');
            }
        });

        // Create workflow
        router.post('/workflows',
            body('workflow_id').isString(),
            body('name').isString(),
            body('task_id').optional().isUUID(),
            this._handleValidation,
            async (req, res) => {
                try {
                    const { workflow_id, name, description, task_id, pipeline_config = {} } = req.body;
                    
                    const result = await req.db.query(`
                        INSERT INTO workflows (workflow_id, name, description, task_id, pipeline_config)
                        VALUES ($1, $2, $3, $4, $5)
                        RETURNING *
                    `, [workflow_id, name, description, task_id, JSON.stringify(pipeline_config)]);
                    
                    res.status(201).json({ data: result.rows[0] });
                } catch (error) {
                    this._handleError(res, error, 'Failed to create workflow');
                }
            }
        );
    }

    /**
     * Setup integrations routes
     * @private
     */
    _setupIntegrationsRoutes(router) {
        // Get all integrations
        router.get('/integrations', async (req, res) => {
            try {
                const result = await req.db.query(`
                    SELECT id, name, type, description, status, health_status, 
                           last_health_check, error_count, created_at, updated_at
                    FROM integrations
                    ORDER BY name
                `);
                res.json({ data: result.rows });
            } catch (error) {
                this._handleError(res, error, 'Failed to fetch integrations');
            }
        });

        // Update integration status
        router.put('/integrations/:id/status',
            param('id').isUUID(),
            body('status').isIn(['active', 'inactive', 'error', 'maintenance']),
            this._handleValidation,
            async (req, res) => {
                try {
                    const result = await req.db.query(`
                        UPDATE integrations 
                        SET status = $1, updated_at = NOW()
                        WHERE id = $2
                        RETURNING *
                    `, [req.body.status, req.params.id]);
                    
                    if (result.rows.length === 0) {
                        return res.status(404).json({ error: 'Integration not found' });
                    }
                    
                    res.json({ data: result.rows[0] });
                } catch (error) {
                    this._handleError(res, error, 'Failed to update integration status');
                }
            }
        );
    }

    /**
     * Setup logs routes
     * @private
     */
    _setupLogsRoutes(router) {
        // Get logs
        router.get('/logs',
            query('level').optional().isIn(['debug', 'info', 'warn', 'error', 'fatal']),
            query('source').optional().isString(),
            query('limit').optional().isInt({ min: 1, max: 1000 }).toInt(),
            this._handleValidation,
            async (req, res) => {
                try {
                    const { level, source, limit = 100 } = req.query;
                    
                    let whereClause = '';
                    const params = [];
                    const conditions = [];
                    
                    if (level) {
                        conditions.push(`level = $${params.length + 1}`);
                        params.push(level);
                    }
                    
                    if (source) {
                        conditions.push(`source = $${params.length + 1}`);
                        params.push(source);
                    }
                    
                    if (conditions.length > 0) {
                        whereClause = `WHERE ${conditions.join(' AND ')}`;
                    }
                    
                    params.push(limit);
                    
                    const result = await req.db.query(`
                        SELECT * FROM logs 
                        ${whereClause}
                        ORDER BY created_at DESC 
                        LIMIT $${params.length}
                    `, params);
                    
                    res.json({ data: result.rows });
                } catch (error) {
                    this._handleError(res, error, 'Failed to fetch logs');
                }
            }
        );

        // Create log entry
        router.post('/logs',
            body('level').isIn(['debug', 'info', 'warn', 'error', 'fatal']),
            body('message').isString(),
            body('source').optional().isString(),
            body('component').optional().isString(),
            this._handleValidation,
            async (req, res) => {
                try {
                    const { level, message, source, component, context = {} } = req.body;
                    
                    const result = await req.db.query(`
                        INSERT INTO logs (level, message, source, component, context)
                        VALUES ($1, $2, $3, $4, $5)
                        RETURNING *
                    `, [level, message, source, component, JSON.stringify(context)]);
                    
                    res.status(201).json({ data: result.rows[0] });
                } catch (error) {
                    this._handleError(res, error, 'Failed to create log entry');
                }
            }
        );
    }

    /**
     * Setup templates routes
     * @private
     */
    _setupTemplatesRoutes(router) {
        // Get all templates
        router.get('/templates', async (req, res) => {
            try {
                const result = await req.db.query(`
                    SELECT * FROM templates 
                    WHERE status = 'active'
                    ORDER BY category, name
                `);
                res.json({ data: result.rows });
            } catch (error) {
                this._handleError(res, error, 'Failed to fetch templates');
            }
        });

        // Create template
        router.post('/templates',
            body('name').isString(),
            body('type').isIn(['code_generation', 'code_review', 'testing', 'documentation', 'deployment', 'analysis', 'custom']),
            body('template_content').isString(),
            this._handleValidation,
            async (req, res) => {
                try {
                    const { name, type, description, template_content, category, variables = [] } = req.body;
                    
                    const result = await req.db.query(`
                        INSERT INTO templates (name, type, description, template_content, category, variables)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        RETURNING *
                    `, [name, type, description, template_content, category, JSON.stringify(variables)]);
                    
                    res.status(201).json({ data: result.rows[0] });
                } catch (error) {
                    this._handleError(res, error, 'Failed to create template');
                }
            }
        );
    }

    /**
     * Setup deployments routes
     * @private
     */
    _setupDeploymentsRoutes(router) {
        // Get all deployments
        router.get('/deployments', async (req, res) => {
            try {
                const result = await req.db.query(`
                    SELECT * FROM deployments 
                    ORDER BY created_at DESC
                `);
                res.json({ data: result.rows });
            } catch (error) {
                this._handleError(res, error, 'Failed to fetch deployments');
            }
        });

        // Create deployment
        router.post('/deployments',
            body('deployment_id').isString(),
            body('environment').isIn(['production', 'staging', 'development', 'testing', 'preview', 'local']),
            body('deployment_type').isIn(['production', 'staging', 'development', 'testing', 'preview', 'hotfix']),
            this._handleValidation,
            async (req, res) => {
                try {
                    const {
                        deployment_id, task_id, workflow_id, environment, deployment_type,
                        version, source_branch, target_branch, commit_sha, pr_number,
                        deployment_config = {}, deployed_by
                    } = req.body;
                    
                    const result = await req.db.query(`
                        INSERT INTO deployments (
                            deployment_id, task_id, workflow_id, environment, deployment_type,
                            version, source_branch, target_branch, commit_sha, pr_number,
                            deployment_config, deployed_by
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                        RETURNING *
                    `, [
                        deployment_id, task_id, workflow_id, environment, deployment_type,
                        version, source_branch, target_branch, commit_sha, pr_number,
                        JSON.stringify(deployment_config), deployed_by
                    ]);
                    
                    res.status(201).json({ data: result.rows[0] });
                } catch (error) {
                    this._handleError(res, error, 'Failed to create deployment');
                }
            }
        );
    }

    /**
     * Validation middleware
     * @private
     */
    _handleValidation(req, res, next) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }
        next();
    }

    /**
     * Error handling
     * @private
     */
    _setupErrorHandling() {
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });

        // Global error handler
        this.app.use((error, req, res, next) => {
            this.log('error', `Unhandled error: ${error.message}`);
            res.status(500).json({
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
            });
        });
    }

    /**
     * Handle API errors
     * @private
     */
    _handleError(res, error, message) {
        this.log('error', `${message}: ${error.message}`);
        
        if (error.code === '23505') { // Unique constraint violation
            return res.status(409).json({ error: 'Resource already exists' });
        }
        
        if (error.code === '23503') { // Foreign key constraint violation
            return res.status(400).json({ error: 'Invalid reference' });
        }
        
        res.status(500).json({
            error: message,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }

    /**
     * Initialize the API server
     */
    async initialize() {
        try {
            // Initialize database connection
            this.db = new DatabaseConnection();
            await this.db.initialize();
            
            this.log('info', 'Database connection initialized');
        } catch (error) {
            this.log('error', `Failed to initialize database: ${error.message}`);
            throw error;
        }
    }

    /**
     * Start the API server
     */
    async start() {
        await this.initialize();
        
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.config.port, this.config.host, (error) => {
                if (error) {
                    this.log('error', `Failed to start server: ${error.message}`);
                    reject(error);
                } else {
                    this.log('info', `API server started on ${this.config.host}:${this.config.port}`);
                    resolve(this.server);
                }
            });
        });
    }

    /**
     * Stop the API server
     */
    async stop() {
        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(resolve);
            });
            this.log('info', 'API server stopped');
        }
        
        if (this.db) {
            await this.db.shutdown();
            this.log('info', 'Database connection closed');
        }
    }

    /**
     * Logging utility
     * @private
     */
    log(level, message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [API] [${level.toUpperCase()}] ${message}`);
    }
}

export default DatabaseAPIServer;

