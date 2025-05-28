/**
 * @fileoverview Comprehensive CI/CD API Server
 * @description Express.js server providing REST API for the comprehensive CI/CD system
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { 
    ComprehensiveCICD, 
    processRequirement, 
    healthCheck 
} from './index.js';

/**
 * Create and configure the API server
 * @param {Object} options - Server configuration options
 * @returns {express.Application} Configured Express app
 */
export function createAPIServer(options = {}) {
    const app = express();
    const cicd = new ComprehensiveCICD(options);
    
    // Security middleware
    app.use(helmet());
    app.use(cors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true
    }));
    
    // Rate limiting
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP, please try again later.'
    });
    app.use('/api/', limiter);
    
    // Body parsing
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
    
    // API Routes
    
    /**
     * Health check endpoint
     */
    app.get('/api/v1/health', async (req, res) => {
        try {
            const health = await healthCheck();
            res.status(health.status === 'healthy' ? 200 : 503).json(health);
        } catch (error) {
            res.status(500).json({
                status: 'error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    /**
     * Process requirements endpoint
     */
    app.post('/api/v1/requirements', async (req, res) => {
        try {
            const { text, project_id, priority, options = {} } = req.body;
            
            // Validate input
            if (!text || typeof text !== 'string') {
                return res.status(400).json({
                    error: 'Invalid input',
                    message: 'Requirement text is required and must be a string'
                });
            }
            
            // Process requirement
            const result = await cicd.processRequirement(text, {
                project_id,
                priority,
                ...options
            });
            
            res.status(200).json({
                success: true,
                data: result,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error processing requirement:', error);
            res.status(500).json({
                error: 'Processing failed',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    /**
     * Get system metrics endpoint
     */
    app.get('/api/v1/metrics/system', async (req, res) => {
        try {
            const metrics = await cicd.getSystemMetrics();
            res.status(200).json({
                success: true,
                data: metrics,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error getting system metrics:', error);
            res.status(500).json({
                error: 'Failed to get metrics',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    /**
     * Get performance analytics endpoint
     */
    app.get('/api/v1/metrics/performance', async (req, res) => {
        try {
            const { date_range, include_trends } = req.query;
            const analytics = await cicd.getPerformanceAnalytics({
                date_range,
                include_trends: include_trends === 'true'
            });
            
            res.status(200).json({
                success: true,
                data: analytics,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error getting performance analytics:', error);
            res.status(500).json({
                error: 'Failed to get analytics',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    /**
     * Configure projects endpoint
     */
    app.post('/api/v1/projects/configure', async (req, res) => {
        try {
            const { projects } = req.body;
            
            if (!projects || typeof projects !== 'object') {
                return res.status(400).json({
                    error: 'Invalid input',
                    message: 'Projects configuration is required'
                });
            }
            
            await cicd.configureProjects(projects);
            
            res.status(200).json({
                success: true,
                message: 'Projects configured successfully',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error configuring projects:', error);
            res.status(500).json({
                error: 'Configuration failed',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    /**
     * Set validation criteria endpoint
     */
    app.put('/api/v1/projects/:projectId/validation', async (req, res) => {
        try {
            const { projectId } = req.params;
            const { criteria } = req.body;
            
            if (!criteria || typeof criteria !== 'object') {
                return res.status(400).json({
                    error: 'Invalid input',
                    message: 'Validation criteria is required'
                });
            }
            
            await cicd.setValidationCriteria(projectId, criteria);
            
            res.status(200).json({
                success: true,
                message: `Validation criteria updated for project ${projectId}`,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error setting validation criteria:', error);
            res.status(500).json({
                error: 'Failed to set criteria',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    /**
     * Get workflow status endpoint
     */
    app.get('/api/v1/workflows/:workflowId', async (req, res) => {
        try {
            const { workflowId } = req.params;
            
            // Mock implementation - in production, this would query workflow status
            res.status(200).json({
                success: true,
                data: {
                    workflow_id: workflowId,
                    status: 'completed',
                    message: 'Workflow status endpoint - implementation pending'
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error getting workflow status:', error);
            res.status(500).json({
                error: 'Failed to get workflow status',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    /**
     * List active workflows endpoint
     */
    app.get('/api/v1/workflows', async (req, res) => {
        try {
            const { status, project_id, limit = 10, offset = 0 } = req.query;
            
            // Mock implementation - in production, this would query active workflows
            res.status(200).json({
                success: true,
                data: {
                    workflows: [],
                    total: 0,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    message: 'Workflows listing endpoint - implementation pending'
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error listing workflows:', error);
            res.status(500).json({
                error: 'Failed to list workflows',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    /**
     * Get tasks endpoint
     */
    app.get('/api/v1/tasks', async (req, res) => {
        try {
            const { status, project_id, limit = 10, offset = 0 } = req.query;
            
            // Mock implementation - in production, this would query tasks from database
            res.status(200).json({
                success: true,
                data: {
                    tasks: [],
                    total: 0,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    filters: { status, project_id }
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error getting tasks:', error);
            res.status(500).json({
                error: 'Failed to get tasks',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    /**
     * Get specific task endpoint
     */
    app.get('/api/v1/tasks/:taskId', async (req, res) => {
        try {
            const { taskId } = req.params;
            
            // Mock implementation - in production, this would query specific task
            res.status(200).json({
                success: true,
                data: {
                    task_id: taskId,
                    message: 'Task details endpoint - implementation pending'
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error getting task:', error);
            res.status(500).json({
                error: 'Failed to get task',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    /**
     * Update task status endpoint
     */
    app.put('/api/v1/tasks/:taskId/status', async (req, res) => {
        try {
            const { taskId } = req.params;
            const { status, context } = req.body;
            
            if (!status) {
                return res.status(400).json({
                    error: 'Invalid input',
                    message: 'Status is required'
                });
            }
            
            // Mock implementation - in production, this would update task status
            res.status(200).json({
                success: true,
                data: {
                    task_id: taskId,
                    status: status,
                    message: 'Task status updated successfully'
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error updating task status:', error);
            res.status(500).json({
                error: 'Failed to update task status',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    /**
     * Get validations endpoint
     */
    app.get('/api/v1/validations', async (req, res) => {
        try {
            const { task_id, status, limit = 10, offset = 0 } = req.query;
            
            // Mock implementation - in production, this would query validations
            res.status(200).json({
                success: true,
                data: {
                    validations: [],
                    total: 0,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    filters: { task_id, status }
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error getting validations:', error);
            res.status(500).json({
                error: 'Failed to get validations',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    /**
     * Get specific validation endpoint
     */
    app.get('/api/v1/validations/:validationId', async (req, res) => {
        try {
            const { validationId } = req.params;
            
            // Mock implementation - in production, this would query specific validation
            res.status(200).json({
                success: true,
                data: {
                    validation_id: validationId,
                    message: 'Validation details endpoint - implementation pending'
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error getting validation:', error);
            res.status(500).json({
                error: 'Failed to get validation',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    /**
     * Retry validation endpoint
     */
    app.post('/api/v1/validations/:validationId/retry', async (req, res) => {
        try {
            const { validationId } = req.params;
            
            // Mock implementation - in production, this would retry validation
            res.status(200).json({
                success: true,
                data: {
                    validation_id: validationId,
                    message: 'Validation retry initiated'
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error retrying validation:', error);
            res.status(500).json({
                error: 'Failed to retry validation',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Error handling middleware
    app.use((error, req, res, next) => {
        console.error('Unhandled error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An unexpected error occurred',
            timestamp: new Date().toISOString()
        });
    });
    
    // 404 handler
    app.use((req, res) => {
        res.status(404).json({
            error: 'Not found',
            message: `Endpoint ${req.method} ${req.path} not found`,
            timestamp: new Date().toISOString()
        });
    });
    
    return app;
}

/**
 * Start the API server
 * @param {Object} options - Server options
 * @returns {Promise<Object>} Server instance and configuration
 */
export async function startAPIServer(options = {}) {
    const port = options.port || process.env.PORT || 8080;
    const host = options.host || process.env.HOST || '0.0.0.0';
    
    const app = createAPIServer(options);
    
    return new Promise((resolve, reject) => {
        const server = app.listen(port, host, (error) => {
            if (error) {
                reject(error);
            } else {
                console.log(`🚀 Comprehensive CI/CD API Server running on http://${host}:${port}`);
                console.log(`📊 Health check: http://${host}:${port}/api/v1/health`);
                console.log(`📚 API Documentation: http://${host}:${port}/api/v1/docs`);
                
                resolve({
                    app,
                    server,
                    url: `http://${host}:${port}`,
                    config: {
                        host,
                        port,
                        environment: process.env.NODE_ENV || 'development'
                    }
                });
            }
        });
        
        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('🛑 SIGTERM received, shutting down gracefully...');
            server.close(() => {
                console.log('✅ Server closed');
                process.exit(0);
            });
        });
        
        process.on('SIGINT', () => {
            console.log('🛑 SIGINT received, shutting down gracefully...');
            server.close(() => {
                console.log('✅ Server closed');
                process.exit(0);
            });
        });
    });
}

// CLI support
if (import.meta.url === `file://${process.argv[1]}`) {
    startAPIServer().catch(error => {
        console.error('❌ Failed to start API server:', error);
        process.exit(1);
    });
}

