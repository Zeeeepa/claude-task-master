/**
 * @fileoverview AI CI/CD System Main Entry Point
 * @description Unified entry point for the AI-driven CI/CD system
 */

// Core components
export { TaskStorageManager } from './core/task_storage_manager.js';
export { WorkflowOrchestrator } from './core/workflow_orchestrator.js';
export { CodegenIntegrator } from './core/codegen_integrator.js';
export { ContextManager } from './core/context_manager.js';
export { RequirementProcessor } from './core/requirement_processor.js';
export { ValidationEngine } from './core/validation_engine.js';
export { ErrorHandler as CodegenErrorHandler } from './core/error_handler.js';
export { RateLimiter } from './core/rate_limiter.js';

// Configuration
export { SystemConfig } from './config/system_config.js';
export { CodegenConfig } from './config/codegen_config.js';
export { DatabaseConfig } from './config/database_config.js';

// Database
export { DatabaseConnection } from './database/connection.js';

// Monitoring
export { SystemMonitor } from './monitoring/system_monitor.js';

// Webhook Integration System
export { 
    GitHubWebhookHandler,
    EventProcessor,
    SignatureValidator,
    EventDeduplicator,
    WorkflowDispatcher,
    EventQueue,
    GitHubClient,
    WebhookIntegrationTest,
    createWebhookSystem
} from './webhooks/index.js';

// Utilities
export { log } from './utils/simple_logger.js';

/**
 * Create and initialize the complete AI CI/CD system
 * @param {Object} config - System configuration
 * @returns {Promise<Object>} Initialized system
 */
export async function createAICICDSystem(config = {}) {
    const systemConfig = new SystemConfig(config);
    const database = new DatabaseConnection(systemConfig.database);
    
    // Initialize core components
    const taskStorage = new TaskStorageManager(database);
    const workflowOrchestrator = new WorkflowOrchestrator(database);
    const codegenIntegrator = new CodegenIntegrator(systemConfig.codegen);
    const contextManager = new ContextManager(database);
    const requirementProcessor = new RequirementProcessor(database);
    const validationEngine = new ValidationEngine(database);
    const systemMonitor = new SystemMonitor(database);
    
    // Initialize webhook system
    const webhookSystem = createWebhookSystem(systemConfig.webhooks, database);
    
    const system = {
        // Core components
        taskStorage,
        workflowOrchestrator,
        codegenIntegrator,
        contextManager,
        requirementProcessor,
        validationEngine,
        systemMonitor,
        database,
        
        // Webhook system
        webhookSystem,
        
        // System lifecycle
        async initialize() {
            log('info', 'Initializing AI CI/CD System...');
            
            await database.initialize();
            await taskStorage.initialize();
            await workflowOrchestrator.initialize();
            await codegenIntegrator.initialize();
            await contextManager.initialize();
            await requirementProcessor.initialize();
            await validationEngine.initialize();
            await systemMonitor.initialize();
            await webhookSystem.initialize();
            
            log('info', 'AI CI/CD System initialized successfully');
        },
        
        async shutdown() {
            log('info', 'Shutting down AI CI/CD System...');
            
            await webhookSystem.shutdown();
            await systemMonitor.shutdown();
            await validationEngine.shutdown();
            await requirementProcessor.shutdown();
            await contextManager.shutdown();
            await codegenIntegrator.shutdown();
            await workflowOrchestrator.shutdown();
            await taskStorage.shutdown();
            await database.shutdown();
            
            log('info', 'AI CI/CD System shut down successfully');
        },
        
        async getHealth() {
            return {
                status: 'healthy',
                components: {
                    database: await database.getHealth(),
                    task_storage: await taskStorage.getHealth(),
                    workflow_orchestrator: await workflowOrchestrator.getHealth(),
                    codegen_integrator: await codegenIntegrator.getHealth(),
                    context_manager: await contextManager.getHealth(),
                    requirement_processor: await requirementProcessor.getHealth(),
                    validation_engine: await validationEngine.getHealth(),
                    system_monitor: await systemMonitor.getHealth(),
                    webhook_system: await webhookSystem.getHealth()
                },
                timestamp: new Date().toISOString()
            };
        },
        
        async getMetrics() {
            return {
                task_metrics: await taskStorage.getTaskMetrics(),
                workflow_metrics: await workflowOrchestrator.getStatistics(),
                codegen_metrics: await codegenIntegrator.getMetrics(),
                validation_metrics: await validationEngine.getMetrics(),
                webhook_metrics: await webhookSystem.webhookHandler.getMetrics(),
                system_metrics: await systemMonitor.getMetrics()
            };
        }
    };
    
    return system;
}

export default {
    createAICICDSystem,
    TaskStorageManager,
    WorkflowOrchestrator,
    CodegenIntegrator,
    ContextManager,
    RequirementProcessor,
    ValidationEngine,
    SystemConfig,
    CodegenConfig,
    DatabaseConfig,
    DatabaseConnection,
    SystemMonitor,
    GitHubWebhookHandler,
    EventProcessor,
    SignatureValidator,
    EventDeduplicator,
    WorkflowDispatcher,
    EventQueue,
    GitHubClient,
    WebhookIntegrationTest,
    createWebhookSystem,
    log
};
