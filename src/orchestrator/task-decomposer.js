/**
 * @fileoverview Task Decomposer
 * @description Intelligent task decomposition engine that breaks down analysis results
 * into atomic, executable tasks with proper categorization and cross-cutting concerns.
 */

import { log } from '../../scripts/modules/utils.js';
import { v4 as uuidv4 } from 'uuid';

// Import decomposition strategies
import { FrontendDecomposer } from './decomposers/frontend-decomposer.js';
import { BackendDecomposer } from './decomposers/backend-decomposer.js';
import { DatabaseDecomposer } from './decomposers/database-decomposer.js';
import { APIDecomposer } from './decomposers/api-decomposer.js';
import { TestingDecomposer } from './decomposers/testing-decomposer.js';

/**
 * Task Decomposer for breaking down analysis into atomic tasks
 */
export class TaskDecomposer {
    constructor() {
        this.decompositionStrategies = new Map([
            ['frontend', new FrontendDecomposer()],
            ['backend', new BackendDecomposer()],
            ['database', new DatabaseDecomposer()],
            ['api', new APIDecomposer()],
            ['testing', new TestingDecomposer()]
        ]);
        
        this.isInitialized = false;
        
        log('debug', 'Task Decomposer created');
    }

    /**
     * Initialize the task decomposer
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        log('info', 'Initializing Task Decomposer...');
        
        try {
            // Initialize all decomposition strategies
            for (const [type, decomposer] of this.decompositionStrategies) {
                await decomposer.initialize();
                log('debug', `Initialized ${type} decomposer`);
            }
            
            this.isInitialized = true;
            log('info', 'Task Decomposer initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize Task Decomposer:', error);
            throw error;
        }
    }

    /**
     * Decompose analysis into atomic tasks
     * @param {Object} analysis - Analysis results from AI Analysis Engine
     * @returns {Promise<Array>} Array of atomic tasks
     */
    async decompose(analysis) {
        this._ensureInitialized();
        
        log('info', 'Starting task decomposition', {
            analysisId: analysis.id,
            featureCount: analysis.insights.features?.length || 0
        });

        const tasks = [];
        
        try {
            // Decompose each feature into tasks
            for (const feature of analysis.insights.features || []) {
                const featureTasks = await this.decomposeFeature(feature, analysis);
                tasks.push(...featureTasks);
            }

            // Add cross-cutting concerns
            const crossCuttingTasks = await this.addCrossCuttingConcerns(tasks, analysis);
            tasks.push(...crossCuttingTasks);

            // Add setup and teardown tasks
            const setupTasks = await this.addSetupTasks(analysis);
            const teardownTasks = await this.addTeardownTasks(analysis);
            
            tasks.unshift(...setupTasks);
            tasks.push(...teardownTasks);

            // Validate task completeness
            await this.validateTaskCompleteness(tasks, analysis);

            // Assign task IDs and metadata
            this.assignTaskMetadata(tasks, analysis);

            log('info', 'Task decomposition completed', {
                totalTasks: tasks.length,
                taskTypes: this.getTaskTypeDistribution(tasks)
            });

            return tasks;
        } catch (error) {
            log('error', 'Failed to decompose tasks:', error);
            throw error;
        }
    }

    /**
     * Decompose individual feature into tasks
     * @param {Object} feature - Feature object from analysis
     * @param {Object} analysis - Full analysis object
     * @returns {Promise<Array>} Feature-specific tasks
     */
    async decomposeFeature(feature, analysis) {
        const tasks = [];
        const featureType = this.identifyFeatureType(feature);
        const decomposer = this.decompositionStrategies.get(featureType);

        log('debug', `Decomposing feature: ${feature.description} (type: ${featureType})`);

        try {
            if (decomposer) {
                const decomposedTasks = await decomposer.decompose(feature, analysis);
                tasks.push(...decomposedTasks);
            } else {
                // Generic decomposition fallback
                const genericTasks = await this.genericDecomposition(feature, analysis);
                tasks.push(...genericTasks);
            }

            // Add feature-specific validation tasks
            const validationTasks = await this.addFeatureValidationTasks(feature, analysis);
            tasks.push(...validationTasks);

            return tasks;
        } catch (error) {
            log('error', `Failed to decompose feature ${feature.description}:`, error);
            // Return generic tasks as fallback
            return await this.genericDecomposition(feature, analysis);
        }
    }

    /**
     * Generic task decomposition for unknown feature types
     * @param {Object} feature - Feature object
     * @param {Object} analysis - Analysis object
     * @returns {Promise<Array>} Generic tasks
     */
    async genericDecomposition(feature, analysis) {
        const featureType = this.identifyFeatureType(feature);
        
        return [
            {
                id: this.generateTaskId(),
                title: `Implement ${feature.description}`,
                type: 'implementation',
                category: featureType,
                description: `Implement the ${feature.description} feature according to requirements`,
                acceptanceCriteria: analysis.insights.acceptanceCriteria?.filter(
                    c => c.feature === feature.description
                ) || [],
                estimatedEffort: this.calculateFeatureEffort(feature),
                priority: feature.priority || 'medium',
                tags: ['implementation', featureType],
                dependencies: [],
                context: {
                    feature: feature,
                    analysisId: analysis.id
                }
            },
            {
                id: this.generateTaskId(),
                title: `Test ${feature.description}`,
                type: 'testing',
                category: 'testing',
                description: `Create comprehensive tests for ${feature.description}`,
                acceptanceCriteria: [
                    { criteria: 'Unit tests cover all functionality', testable: true },
                    { criteria: 'Integration tests validate feature', testable: true },
                    { criteria: 'Test coverage > 90%', testable: true }
                ],
                estimatedEffort: Math.ceil(this.calculateFeatureEffort(feature) * 0.5),
                priority: feature.priority || 'medium',
                tags: ['testing', featureType],
                dependencies: [`implement-${feature.id}`],
                context: {
                    feature: feature,
                    analysisId: analysis.id
                }
            }
        ];
    }

    /**
     * Add cross-cutting concerns (security, performance, etc.)
     * @param {Array} tasks - Current task list
     * @param {Object} analysis - Analysis object
     * @returns {Promise<Array>} Cross-cutting concern tasks
     */
    async addCrossCuttingConcerns(tasks, analysis) {
        const concerns = [];

        try {
            // Security tasks
            if (this.requiresSecurity(analysis)) {
                concerns.push({
                    id: this.generateTaskId(),
                    title: 'Security Implementation',
                    type: 'security',
                    category: 'security',
                    description: 'Implement security measures and validation',
                    acceptanceCriteria: [
                        { criteria: 'Authentication mechanisms implemented', testable: true },
                        { criteria: 'Input validation and sanitization in place', testable: true },
                        { criteria: 'Security headers configured', testable: true }
                    ],
                    estimatedEffort: 4,
                    priority: 'high',
                    tags: ['security', 'cross-cutting'],
                    dependencies: [],
                    context: { type: 'cross-cutting', concern: 'security' }
                });
            }

            // Performance tasks
            if (this.requiresPerformance(analysis)) {
                concerns.push({
                    id: this.generateTaskId(),
                    title: 'Performance Optimization',
                    type: 'performance',
                    category: 'performance',
                    description: 'Optimize performance and add monitoring',
                    acceptanceCriteria: [
                        { criteria: 'Performance benchmarks established', testable: true },
                        { criteria: 'Optimization strategies implemented', testable: true },
                        { criteria: 'Monitoring and alerting configured', testable: true }
                    ],
                    estimatedEffort: 3,
                    priority: 'medium',
                    tags: ['performance', 'cross-cutting'],
                    dependencies: [],
                    context: { type: 'cross-cutting', concern: 'performance' }
                });
            }

            // Documentation tasks
            concerns.push({
                id: this.generateTaskId(),
                title: 'Documentation',
                type: 'documentation',
                category: 'documentation',
                description: 'Create comprehensive documentation',
                acceptanceCriteria: [
                    { criteria: 'API documentation complete', testable: true },
                    { criteria: 'User documentation available', testable: true },
                    { criteria: 'Code comments and inline documentation', testable: true }
                ],
                estimatedEffort: 2,
                priority: 'medium',
                tags: ['documentation', 'cross-cutting'],
                dependencies: tasks.filter(t => t.type === 'implementation').map(t => t.id),
                context: { type: 'cross-cutting', concern: 'documentation' }
            });

            // Error handling and logging
            concerns.push({
                id: this.generateTaskId(),
                title: 'Error Handling & Logging',
                type: 'infrastructure',
                category: 'infrastructure',
                description: 'Implement comprehensive error handling and logging',
                acceptanceCriteria: [
                    { criteria: 'Error handling implemented for all critical paths', testable: true },
                    { criteria: 'Logging configured with appropriate levels', testable: true },
                    { criteria: 'Error monitoring and alerting setup', testable: true }
                ],
                estimatedEffort: 2,
                priority: 'high',
                tags: ['infrastructure', 'cross-cutting'],
                dependencies: [],
                context: { type: 'cross-cutting', concern: 'error-handling' }
            });

            return concerns;
        } catch (error) {
            log('error', 'Failed to add cross-cutting concerns:', error);
            return [];
        }
    }

    /**
     * Add setup tasks
     * @param {Object} analysis - Analysis object
     * @returns {Promise<Array>} Setup tasks
     */
    async addSetupTasks(analysis) {
        const setupTasks = [];

        // Environment setup
        setupTasks.push({
            id: this.generateTaskId(),
            title: 'Environment Setup',
            type: 'setup',
            category: 'infrastructure',
            description: 'Set up development environment and dependencies',
            acceptanceCriteria: [
                { criteria: 'Development environment configured', testable: true },
                { criteria: 'Dependencies installed and verified', testable: true },
                { criteria: 'Configuration files created', testable: true }
            ],
            estimatedEffort: 1,
            priority: 'high',
            tags: ['setup', 'infrastructure'],
            dependencies: [],
            context: { type: 'setup', phase: 'initial' }
        });

        // Database setup (if needed)
        if (this.requiresDatabase(analysis)) {
            setupTasks.push({
                id: this.generateTaskId(),
                title: 'Database Setup',
                type: 'setup',
                category: 'database',
                description: 'Set up database schema and initial configuration',
                acceptanceCriteria: [
                    { criteria: 'Database schema created', testable: true },
                    { criteria: 'Initial data populated', testable: true },
                    { criteria: 'Database connections verified', testable: true }
                ],
                estimatedEffort: 2,
                priority: 'high',
                tags: ['setup', 'database'],
                dependencies: ['environment-setup'],
                context: { type: 'setup', phase: 'database' }
            });
        }

        return setupTasks;
    }

    /**
     * Add teardown tasks
     * @param {Object} analysis - Analysis object
     * @returns {Promise<Array>} Teardown tasks
     */
    async addTeardownTasks(analysis) {
        const teardownTasks = [];

        // Integration testing
        teardownTasks.push({
            id: this.generateTaskId(),
            title: 'Integration Testing',
            type: 'testing',
            category: 'testing',
            description: 'Run comprehensive integration tests',
            acceptanceCriteria: [
                { criteria: 'All integration tests pass', testable: true },
                { criteria: 'End-to-end workflows verified', testable: true },
                { criteria: 'Performance benchmarks met', testable: true }
            ],
            estimatedEffort: 3,
            priority: 'high',
            tags: ['testing', 'integration'],
            dependencies: [], // Will be set later based on all implementation tasks
            context: { type: 'teardown', phase: 'testing' }
        });

        // Deployment preparation
        teardownTasks.push({
            id: this.generateTaskId(),
            title: 'Deployment Preparation',
            type: 'deployment',
            category: 'deployment',
            description: 'Prepare for deployment and production readiness',
            acceptanceCriteria: [
                { criteria: 'Deployment scripts created', testable: true },
                { criteria: 'Production configuration verified', testable: true },
                { criteria: 'Rollback procedures documented', testable: true }
            ],
            estimatedEffort: 2,
            priority: 'medium',
            tags: ['deployment', 'production'],
            dependencies: ['integration-testing'],
            context: { type: 'teardown', phase: 'deployment' }
        });

        return teardownTasks;
    }

    /**
     * Add feature-specific validation tasks
     * @param {Object} feature - Feature object
     * @param {Object} analysis - Analysis object
     * @returns {Promise<Array>} Validation tasks
     */
    async addFeatureValidationTasks(feature, analysis) {
        return [{
            id: this.generateTaskId(),
            title: `Validate ${feature.description}`,
            type: 'validation',
            category: 'validation',
            description: `Validate ${feature.description} meets acceptance criteria`,
            acceptanceCriteria: feature.acceptanceCriteria || [],
            estimatedEffort: 1,
            priority: feature.priority || 'medium',
            tags: ['validation', feature.category || 'general'],
            dependencies: [`implement-${feature.id}`, `test-${feature.id}`],
            context: {
                feature: feature,
                analysisId: analysis.id,
                type: 'validation'
            }
        }];
    }

    /**
     * Validate task completeness
     * @param {Array} tasks - Task list
     * @param {Object} analysis - Analysis object
     */
    async validateTaskCompleteness(tasks, analysis) {
        const requiredTypes = ['setup', 'implementation', 'testing', 'validation'];
        const presentTypes = new Set(tasks.map(task => task.type));
        
        for (const requiredType of requiredTypes) {
            if (!presentTypes.has(requiredType)) {
                log('warn', `Missing required task type: ${requiredType}`);
            }
        }

        // Validate feature coverage
        const features = analysis.insights.features || [];
        const implementedFeatures = new Set();
        
        for (const task of tasks) {
            if (task.context?.feature?.id) {
                implementedFeatures.add(task.context.feature.id);
            }
        }

        for (const feature of features) {
            if (!implementedFeatures.has(feature.id)) {
                log('warn', `Feature not covered by tasks: ${feature.description}`);
            }
        }
    }

    /**
     * Assign task metadata
     * @param {Array} tasks - Task list
     * @param {Object} analysis - Analysis object
     */
    assignTaskMetadata(tasks, analysis) {
        for (const task of tasks) {
            if (!task.id) {
                task.id = this.generateTaskId();
            }
            
            task.createdAt = new Date();
            task.analysisId = analysis.id;
            task.status = 'pending';
            
            // Ensure required fields
            task.title = task.title || 'Untitled Task';
            task.description = task.description || 'No description provided';
            task.type = task.type || 'general';
            task.category = task.category || 'general';
            task.priority = task.priority || 'medium';
            task.estimatedEffort = task.estimatedEffort || 2;
            task.tags = task.tags || [];
            task.dependencies = task.dependencies || [];
            task.acceptanceCriteria = task.acceptanceCriteria || [];
            task.context = task.context || {};
        }
    }

    /**
     * Identify feature type
     * @param {Object} feature - Feature object
     * @returns {string} Feature type
     */
    identifyFeatureType(feature) {
        if (feature.category) {
            return feature.category;
        }

        const description = feature.description.toLowerCase();
        
        if (description.includes('ui') || description.includes('interface') || description.includes('frontend')) {
            return 'frontend';
        }
        
        if (description.includes('api') || description.includes('backend') || description.includes('server')) {
            return 'backend';
        }
        
        if (description.includes('database') || description.includes('data') || description.includes('storage')) {
            return 'database';
        }
        
        if (description.includes('test') || description.includes('testing')) {
            return 'testing';
        }
        
        return 'general';
    }

    /**
     * Calculate effort for a feature
     * @param {Object} feature - Feature object
     * @returns {number} Effort in hours
     */
    calculateFeatureEffort(feature) {
        const complexity = feature.complexity || 'medium';
        const baseEffort = {
            'low': 2,
            'medium': 5,
            'high': 10,
            'very-high': 20
        };
        
        return baseEffort[complexity] || 5;
    }

    /**
     * Check if security is required
     * @param {Object} analysis - Analysis object
     * @returns {boolean} True if security is required
     */
    requiresSecurity(analysis) {
        const text = analysis.originalText.toLowerCase();
        const techReqs = analysis.insights.technical || {};
        
        return text.includes('auth') || 
               text.includes('security') || 
               text.includes('login') ||
               (techReqs.security && techReqs.security.length > 0);
    }

    /**
     * Check if performance optimization is required
     * @param {Object} analysis - Analysis object
     * @returns {boolean} True if performance is required
     */
    requiresPerformance(analysis) {
        const text = analysis.originalText.toLowerCase();
        const techReqs = analysis.insights.technical || {};
        
        return text.includes('performance') || 
               text.includes('fast') || 
               text.includes('optimize') ||
               (techReqs.performance && techReqs.performance.length > 0);
    }

    /**
     * Check if database is required
     * @param {Object} analysis - Analysis object
     * @returns {boolean} True if database is required
     */
    requiresDatabase(analysis) {
        const text = analysis.originalText.toLowerCase();
        const techReqs = analysis.insights.technical || {};
        
        return text.includes('database') || 
               text.includes('data') || 
               text.includes('storage') ||
               (techReqs.databases && techReqs.databases.length > 0);
    }

    /**
     * Get task type distribution
     * @param {Array} tasks - Task list
     * @returns {Object} Type distribution
     */
    getTaskTypeDistribution(tasks) {
        const distribution = {};
        for (const task of tasks) {
            distribution[task.type] = (distribution[task.type] || 0) + 1;
        }
        return distribution;
    }

    /**
     * Generate unique task ID
     * @returns {string} Task ID
     */
    generateTaskId() {
        return `task-${uuidv4()}`;
    }

    /**
     * Ensure decomposer is initialized
     * @private
     */
    _ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('Task Decomposer not initialized. Call initialize() first.');
        }
    }

    /**
     * Get decomposer statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            isInitialized: this.isInitialized,
            strategiesCount: this.decompositionStrategies.size,
            strategies: Array.from(this.decompositionStrategies.keys())
        };
    }
}

export default TaskDecomposer;

