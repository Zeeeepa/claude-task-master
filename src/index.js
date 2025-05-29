import { initializeDatabase } from './database/connection/connection_manager.js';
import { MigrationRunner } from './database/migrations/migration_runner.js';
import { CICDOrchestrator } from './core/cicd-orchestrator.js';
import { TaskManager } from './core/task-manager.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Claude Task Master - AI-Powered CI/CD Orchestration System
 * Main application entry point with comprehensive initialization and graceful shutdown
 */
class TaskMasterApp {
    constructor() {
        this.db = null;
        this.migrationRunner = null;
        this.orchestrator = null;
        this.taskManager = null;
        this.server = null;
        this.isShuttingDown = false;
    }

    /**
     * Initialize and start the application
     */
    async start() {
        try {
            console.log('🚀 Starting Claude Task Master CI/CD Orchestration System...');
            
            // Initialize database connection
            await this._initializeDatabase();
            
            // Run database migrations
            await this._runMigrations();
            
            // Initialize core components
            await this._initializeComponents();
            
            // Start HTTP server
            await this._startServer();
            
            console.log('✅ Claude Task Master started successfully');
            console.log(`🌐 Server running on port ${process.env.PORT || 3000}`);
            console.log(`📊 Database: ${process.env.DB_NAME || 'claude_task_master'}`);
            console.log(`🔗 AgentAPI: ${process.env.AGENTAPI_URL || 'http://localhost:3284'}`);
            
            return this;
        } catch (error) {
            console.error('❌ Failed to start Claude Task Master:', error);
            await this.shutdown();
            process.exit(1);
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        if (this.isShuttingDown) {
            console.log('⏳ Shutdown already in progress...');
            return;
        }
        
        this.isShuttingDown = true;
        console.log('🔄 Shutting down Claude Task Master...');
        
        try {
            // Stop accepting new requests
            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(resolve);
                });
                console.log('✅ HTTP server stopped');
            }
            
            // Shutdown orchestrator
            if (this.orchestrator) {
                // Wait for active pipelines to complete or timeout
                await this._waitForActivePipelines(30000); // 30 seconds
                console.log('✅ CI/CD orchestrator stopped');
            }
            
            // Shutdown database connection
            if (this.db) {
                await this.db.shutdown();
                console.log('✅ Database connection closed');
            }
            
            console.log('👋 Claude Task Master shutdown complete');
        } catch (error) {
            console.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    }

    /**
     * Get application health status
     */
    async getHealthStatus() {
        try {
            const dbHealth = this.db ? await this.db.getHealthStatus() : null;
            
            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version || '1.0.0',
                uptime: process.uptime(),
                database: dbHealth,
                components: {
                    database: this.db ? 'connected' : 'disconnected',
                    orchestrator: this.orchestrator ? 'initialized' : 'not_initialized',
                    taskManager: this.taskManager ? 'initialized' : 'not_initialized'
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    // Private methods
    async _initializeDatabase() {
        console.log('🔄 Initializing database connection...');
        
        const dbConfig = {
            primary: {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT) || 5432,
                database: process.env.DB_NAME || 'claude_task_master',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || '',
                max: parseInt(process.env.DB_POOL_MAX) || 20,
                min: parseInt(process.env.DB_POOL_MIN) || 5
            }
        };
        
        this.db = await initializeDatabase(dbConfig);
        console.log('✅ Database connection established');
    }

    async _runMigrations() {
        console.log('🔄 Checking database migrations...');
        
        this.migrationRunner = new MigrationRunner();
        await this.migrationRunner.initialize();
        
        const status = await this.migrationRunner.getStatus();
        
        if (status.pending > 0) {
            console.log(`🔄 Running ${status.pending} pending migrations...`);
            await this.migrationRunner.runMigrations();
            console.log('✅ Database migrations completed');
        } else {
            console.log('✅ Database is up to date');
        }
    }

    async _initializeComponents() {
        console.log('🔄 Initializing core components...');
        
        // Initialize Task Manager
        this.taskManager = new TaskManager();
        await this.taskManager.initialize();
        
        // Initialize CI/CD Orchestrator
        this.orchestrator = new CICDOrchestrator({
            agentapiUrl: process.env.AGENTAPI_URL,
            codegenApiUrl: process.env.CODEGEN_API_URL,
            wsl2InstancePath: process.env.WSL2_INSTANCE_PATH
        });
        await this.orchestrator.initialize();
        
        console.log('✅ Core components initialized');
    }

    async _startServer() {
        const app = express();
        const port = process.env.PORT || 3000;
        
        // Security middleware
        app.use(helmet());
        app.use(cors({
            origin: process.env.CORS_ORIGIN || '*',
            credentials: true
        }));
        
        // Body parsing middleware
        app.use(express.json({ limit: '10mb' }));
        app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Health check endpoint
        app.get('/health', async (req, res) => {
            const health = await this.getHealthStatus();
            res.status(health.status === 'healthy' ? 200 : 503).json(health);
        });
        
        // Webhook endpoint for GitHub/GitLab events
        app.post('/webhook', async (req, res) => {
            try {
                const eventType = req.headers['x-github-event'] || req.headers['x-gitlab-event'];
                const eventData = {
                    event_type: eventType,
                    event_action: req.body.action,
                    payload: req.body
                };
                
                // Process webhook asynchronously
                this.orchestrator.processWebhookEvent(eventData)
                    .catch(error => console.error('Webhook processing error:', error));
                
                res.status(200).json({ status: 'received' });
            } catch (error) {
                console.error('Webhook error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        
        // API endpoints
        app.use('/api/projects', this._createProjectRoutes());
        app.use('/api/tasks', this._createTaskRoutes());
        app.use('/api/pipelines', this._createPipelineRoutes());
        
        // Error handling middleware
        app.use((error, req, res, next) => {
            console.error('API Error:', error);
            res.status(500).json({ 
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        });
        
        // Start server
        this.server = app.listen(port, () => {
            console.log(`✅ HTTP server started on port ${port}`);
        });
    }

    _createProjectRoutes() {
        const router = express.Router();
        
        router.get('/', async (req, res) => {
            try {
                const projects = await this.db.query('SELECT * FROM projects ORDER BY created_at DESC');
                res.json(projects.rows);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        router.post('/', async (req, res) => {
            try {
                const project = await this.taskManager.createProject(req.body);
                res.status(201).json(project);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
        
        return router;
    }

    _createTaskRoutes() {
        const router = express.Router();
        
        router.get('/', async (req, res) => {
            try {
                const { project_id, ...options } = req.query;
                const tasks = await this.taskManager.listTasks(project_id, options);
                res.json(tasks);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        router.post('/', async (req, res) => {
            try {
                const { project_id, ...taskData } = req.body;
                const task = await this.taskManager.createTask(project_id, taskData);
                res.status(201).json(task);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
        
        router.get('/next', async (req, res) => {
            try {
                const { project_id, assignee } = req.query;
                const task = await this.taskManager.getNextTask(project_id, assignee);
                res.json(task);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        return router;
    }

    _createPipelineRoutes() {
        const router = express.Router();
        
        router.post('/validate-pr', async (req, res) => {
            try {
                const { pull_request_id, validation_type } = req.body;
                const result = await this.orchestrator.validatePRWithClaudeCode(
                    pull_request_id, 
                    validation_type
                );
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        router.post('/generate-code', async (req, res) => {
            try {
                const { project_id, task_ids } = req.body;
                const result = await this.orchestrator.generateCodeFromTasks(project_id, task_ids);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        return router;
    }

    async _waitForActivePipelines(timeoutMs) {
        const startTime = Date.now();
        
        while (this.orchestrator.activePipelines.size > 0) {
            if (Date.now() - startTime > timeoutMs) {
                console.warn(`⚠️  Timeout waiting for ${this.orchestrator.activePipelines.size} active pipelines`);
                break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// Handle graceful shutdown
const app = new TaskMasterApp();

process.on('SIGTERM', async () => {
    console.log('📡 Received SIGTERM signal');
    await app.shutdown();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('📡 Received SIGINT signal');
    await app.shutdown();
    process.exit(0);
});

process.on('uncaughtException', async (error) => {
    console.error('💥 Uncaught Exception:', error);
    await app.shutdown();
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    await app.shutdown();
    process.exit(1);
});

// Start the application if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    app.start().catch(error => {
        console.error('💥 Failed to start application:', error);
        process.exit(1);
    });
}

export default TaskMasterApp;

