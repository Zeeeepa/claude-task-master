/**
 * @fileoverview Task Processor
 * @description Advanced task processing with natural language understanding and context extraction
 */

import { log } from '../../scripts/modules/utils.js';
import { CodegenError } from './codegen_client.js';

/**
 * Advanced task processor for natural language requirements
 */
export class TaskProcessor {
    constructor(config = {}) {
        this.config = {
            maxComplexity: config.maxComplexity || 10,
            enableNLP: config.enableNLP !== false,
            contextWindow: config.contextWindow || 5000,
            priorityWeights: {
                urgency: config.urgencyWeight || 0.4,
                complexity: config.complexityWeight || 0.3,
                dependencies: config.dependencyWeight || 0.3
            },
            ...config
        };
        
        this.taskQueue = [];
        this.processingHistory = new Map();
        this.dependencyGraph = new Map();
        
        log('info', 'Task processor initialized with NLP capabilities');
    }

    /**
     * Process natural language task requirements
     * @param {Object} rawTask - Raw task from database
     * @returns {Object} Processed task with extracted context
     */
    async processNaturalLanguageTask(rawTask) {
        try {
            log('debug', `Processing natural language task: ${rawTask.id}`);
            
            // Parse natural language requirements
            const parsedRequirements = await this._parseNaturalLanguage(rawTask.description);
            
            // Extract dependencies and context
            const dependencies = await this._extractDependencies(rawTask);
            const context = await this._extractContext(rawTask, parsedRequirements);
            
            // Calculate priority and complexity
            const priority = await this._calculatePriority(rawTask, dependencies);
            const complexity = await this._assessComplexity(parsedRequirements);
            
            // Create processed task
            const processedTask = {
                id: rawTask.id,
                originalDescription: rawTask.description,
                parsedRequirements,
                dependencies,
                context,
                priority,
                complexity,
                estimatedEffort: this._estimateEffort(complexity, dependencies.length),
                processingMetadata: {
                    processedAt: new Date(),
                    nlpVersion: '1.0',
                    confidence: parsedRequirements.confidence
                }
            };
            
            // Store in processing history
            this.processingHistory.set(rawTask.id, processedTask);
            
            log('info', `Task ${rawTask.id} processed with complexity ${complexity} and priority ${priority}`);
            return processedTask;
            
        } catch (error) {
            log('error', `Failed to process task ${rawTask.id}: ${error.message}`);
            throw new CodegenError(`Task processing failed: ${error.message}`, 'TASK_PROCESSING_ERROR');
        }
    }

    /**
     * Parse natural language requirements into structured format
     * @param {string} description - Natural language description
     * @returns {Object} Parsed requirements
     * @private
     */
    async _parseNaturalLanguage(description) {
        const requirements = {
            type: 'unknown',
            actions: [],
            entities: [],
            constraints: [],
            acceptance_criteria: [],
            technical_requirements: [],
            confidence: 0.8
        };

        // Extract task type
        requirements.type = this._extractTaskType(description);
        
        // Extract actions (verbs)
        requirements.actions = this._extractActions(description);
        
        // Extract entities (nouns, components, files)
        requirements.entities = this._extractEntities(description);
        
        // Extract constraints and requirements
        requirements.constraints = this._extractConstraints(description);
        
        // Extract acceptance criteria
        requirements.acceptance_criteria = this._extractAcceptanceCriteria(description);
        
        // Extract technical requirements
        requirements.technical_requirements = this._extractTechnicalRequirements(description);
        
        return requirements;
    }

    /**
     * Extract task type from description
     * @param {string} description
     * @returns {string}
     * @private
     */
    _extractTaskType(description) {
        const typePatterns = {
            'feature': /implement|add|create|build|develop|feature/i,
            'bug_fix': /fix|bug|error|issue|problem|resolve/i,
            'refactor': /refactor|improve|optimize|clean|restructure/i,
            'test': /test|testing|spec|coverage|unit|integration/i,
            'documentation': /document|docs|readme|comment|explain/i,
            'configuration': /config|setup|configure|environment|deploy/i,
            'integration': /integrate|connect|api|service|external/i
        };

        for (const [type, pattern] of Object.entries(typePatterns)) {
            if (pattern.test(description)) {
                return type;
            }
        }
        
        return 'unknown';
    }

    /**
     * Extract actions from description
     * @param {string} description
     * @returns {Array}
     * @private
     */
    _extractActions(description) {
        const actionPatterns = [
            /\b(implement|create|build|develop|add|remove|delete|update|modify|enhance|improve|fix|resolve|test|validate|configure|setup|deploy|integrate|connect|refactor|optimize)\b/gi
        ];
        
        const actions = new Set();
        actionPatterns.forEach(pattern => {
            const matches = description.match(pattern);
            if (matches) {
                matches.forEach(match => actions.add(match.toLowerCase()));
            }
        });
        
        return Array.from(actions);
    }

    /**
     * Extract entities from description
     * @param {string} description
     * @returns {Array}
     * @private
     */
    _extractEntities(description) {
        const entities = [];
        
        // Extract file patterns
        const filePatterns = /\b[\w\/\-\.]+\.(js|ts|jsx|tsx|py|java|cpp|h|css|html|json|xml|yml|yaml|md|txt)\b/gi;
        const files = description.match(filePatterns) || [];
        entities.push(...files.map(f => ({ type: 'file', value: f })));
        
        // Extract component/class names (PascalCase)
        const componentPatterns = /\b[A-Z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)*\b/g;
        const components = description.match(componentPatterns) || [];
        entities.push(...components.map(c => ({ type: 'component', value: c })));
        
        // Extract function names (camelCase)
        const functionPatterns = /\b[a-z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)*\(\)/g;
        const functions = description.match(functionPatterns) || [];
        entities.push(...functions.map(f => ({ type: 'function', value: f.replace('()', '') })));
        
        // Extract URLs
        const urlPatterns = /https?:\/\/[^\s]+/gi;
        const urls = description.match(urlPatterns) || [];
        entities.push(...urls.map(u => ({ type: 'url', value: u })));
        
        return entities;
    }

    /**
     * Extract constraints from description
     * @param {string} description
     * @returns {Array}
     * @private
     */
    _extractConstraints(description) {
        const constraints = [];
        
        // Performance constraints
        if (/performance|fast|slow|speed|optimize|efficient/i.test(description)) {
            constraints.push({ type: 'performance', description: 'Performance optimization required' });
        }
        
        // Security constraints
        if (/security|secure|auth|permission|access|safe/i.test(description)) {
            constraints.push({ type: 'security', description: 'Security considerations required' });
        }
        
        // Compatibility constraints
        if (/compatible|support|browser|version|legacy/i.test(description)) {
            constraints.push({ type: 'compatibility', description: 'Compatibility requirements' });
        }
        
        // Testing constraints
        if (/test|testing|coverage|unit|integration/i.test(description)) {
            constraints.push({ type: 'testing', description: 'Testing requirements' });
        }
        
        return constraints;
    }

    /**
     * Extract acceptance criteria from description
     * @param {string} description
     * @returns {Array}
     * @private
     */
    _extractAcceptanceCriteria(description) {
        const criteria = [];
        
        // Look for bullet points or numbered lists
        const listPatterns = [
            /[-*]\s+(.+)/g,
            /\d+\.\s+(.+)/g,
            /should\s+(.+)/gi,
            /must\s+(.+)/gi,
            /when\s+(.+)/gi
        ];
        
        listPatterns.forEach(pattern => {
            const matches = [...description.matchAll(pattern)];
            matches.forEach(match => {
                criteria.push({
                    description: match[1].trim(),
                    type: 'functional'
                });
            });
        });
        
        return criteria;
    }

    /**
     * Extract technical requirements from description
     * @param {string} description
     * @returns {Array}
     * @private
     */
    _extractTechnicalRequirements(description) {
        const requirements = [];
        
        // Framework/library requirements
        const techPatterns = {
            'react': /react|jsx|tsx/i,
            'vue': /vue|vuejs/i,
            'angular': /angular/i,
            'node': /node|nodejs|npm|yarn/i,
            'python': /python|pip|django|flask/i,
            'database': /database|sql|mongodb|postgres|mysql/i,
            'api': /api|rest|graphql|endpoint/i,
            'testing': /jest|mocha|cypress|selenium|test/i
        };
        
        for (const [tech, pattern] of Object.entries(techPatterns)) {
            if (pattern.test(description)) {
                requirements.push({
                    type: 'technology',
                    technology: tech,
                    description: `${tech} technology requirement`
                });
            }
        }
        
        return requirements;
    }

    /**
     * Extract dependencies from task
     * @param {Object} task
     * @returns {Array}
     * @private
     */
    async _extractDependencies(task) {
        const dependencies = [];
        
        // Extract explicit dependencies from description
        const depPatterns = [
            /depends?\s+on\s+(.+)/gi,
            /requires?\s+(.+)/gi,
            /after\s+(.+)/gi,
            /prerequisite\s+(.+)/gi
        ];
        
        depPatterns.forEach(pattern => {
            const matches = [...task.description.matchAll(pattern)];
            matches.forEach(match => {
                dependencies.push({
                    type: 'explicit',
                    description: match[1].trim(),
                    source: 'description'
                });
            });
        });
        
        // Extract file dependencies
        if (task.files) {
            task.files.forEach(file => {
                dependencies.push({
                    type: 'file',
                    file: file,
                    source: 'file_list'
                });
            });
        }
        
        return dependencies;
    }

    /**
     * Extract context information
     * @param {Object} task
     * @param {Object} parsedRequirements
     * @returns {Object}
     * @private
     */
    async _extractContext(task, parsedRequirements) {
        return {
            project_type: this._inferProjectType(parsedRequirements),
            domain: this._inferDomain(task.description),
            complexity_indicators: this._getComplexityIndicators(parsedRequirements),
            risk_factors: this._identifyRiskFactors(parsedRequirements),
            estimated_files: this._estimateAffectedFiles(parsedRequirements),
            related_components: this._identifyRelatedComponents(parsedRequirements)
        };
    }

    /**
     * Calculate task priority
     * @param {Object} task
     * @param {Array} dependencies
     * @returns {number}
     * @private
     */
    async _calculatePriority(task, dependencies) {
        let priority = 0;
        
        // Urgency score (0-10)
        const urgencyScore = this._calculateUrgencyScore(task);
        
        // Complexity score (0-10)
        const complexityScore = this._calculateComplexityScore(task);
        
        // Dependency score (0-10)
        const dependencyScore = Math.min(dependencies.length * 2, 10);
        
        // Weighted priority calculation
        priority = (
            urgencyScore * this.config.priorityWeights.urgency +
            complexityScore * this.config.priorityWeights.complexity +
            dependencyScore * this.config.priorityWeights.dependencies
        );
        
        return Math.round(priority * 10) / 10; // Round to 1 decimal place
    }

    /**
     * Assess task complexity
     * @param {Object} parsedRequirements
     * @returns {number}
     * @private
     */
    async _assessComplexity(parsedRequirements) {
        let complexity = 1;
        
        // Base complexity from actions
        complexity += parsedRequirements.actions.length * 0.5;
        
        // Entity complexity
        complexity += parsedRequirements.entities.length * 0.3;
        
        // Constraint complexity
        complexity += parsedRequirements.constraints.length * 0.7;
        
        // Technical requirement complexity
        complexity += parsedRequirements.technical_requirements.length * 0.8;
        
        // Cap at maximum complexity
        return Math.min(complexity, this.config.maxComplexity);
    }

    /**
     * Calculate urgency score
     * @param {Object} task
     * @returns {number}
     * @private
     */
    _calculateUrgencyScore(task) {
        let score = 5; // Default medium urgency
        
        const urgencyKeywords = {
            'critical': 10,
            'urgent': 9,
            'high': 8,
            'asap': 9,
            'immediately': 10,
            'blocker': 10,
            'emergency': 10
        };
        
        const description = task.description.toLowerCase();
        for (const [keyword, value] of Object.entries(urgencyKeywords)) {
            if (description.includes(keyword)) {
                score = Math.max(score, value);
            }
        }
        
        return score;
    }

    /**
     * Calculate complexity score
     * @param {Object} task
     * @returns {number}
     * @private
     */
    _calculateComplexityScore(task) {
        let score = 3; // Default low-medium complexity
        
        const complexityKeywords = {
            'simple': 2,
            'easy': 2,
            'complex': 7,
            'complicated': 8,
            'difficult': 8,
            'challenging': 9,
            'advanced': 8,
            'integration': 7,
            'refactor': 6,
            'architecture': 8
        };
        
        const description = task.description.toLowerCase();
        for (const [keyword, value] of Object.entries(complexityKeywords)) {
            if (description.includes(keyword)) {
                score = Math.max(score, value);
            }
        }
        
        return score;
    }

    /**
     * Estimate effort in hours
     * @param {number} complexity
     * @param {number} dependencyCount
     * @returns {number}
     * @private
     */
    _estimateEffort(complexity, dependencyCount) {
        const baseEffort = complexity * 2; // 2 hours per complexity point
        const dependencyEffort = dependencyCount * 0.5; // 30 minutes per dependency
        
        return Math.round((baseEffort + dependencyEffort) * 10) / 10;
    }

    /**
     * Infer project type from requirements
     * @param {Object} parsedRequirements
     * @returns {string}
     * @private
     */
    _inferProjectType(parsedRequirements) {
        const techRequirements = parsedRequirements.technical_requirements;
        
        if (techRequirements.some(req => req.technology === 'react')) return 'react_app';
        if (techRequirements.some(req => req.technology === 'vue')) return 'vue_app';
        if (techRequirements.some(req => req.technology === 'angular')) return 'angular_app';
        if (techRequirements.some(req => req.technology === 'node')) return 'node_app';
        if (techRequirements.some(req => req.technology === 'python')) return 'python_app';
        
        return 'generic';
    }

    /**
     * Infer domain from description
     * @param {string} description
     * @returns {string}
     * @private
     */
    _inferDomain(description) {
        const domainKeywords = {
            'ecommerce': /shop|cart|payment|order|product|checkout/i,
            'social': /social|chat|message|friend|follow|like|share/i,
            'finance': /bank|money|payment|transaction|finance|accounting/i,
            'healthcare': /health|medical|patient|doctor|hospital/i,
            'education': /learn|course|student|teacher|education|school/i,
            'gaming': /game|player|score|level|achievement/i,
            'productivity': /task|todo|project|manage|organize|plan/i
        };
        
        for (const [domain, pattern] of Object.entries(domainKeywords)) {
            if (pattern.test(description)) {
                return domain;
            }
        }
        
        return 'general';
    }

    /**
     * Get complexity indicators
     * @param {Object} parsedRequirements
     * @returns {Array}
     * @private
     */
    _getComplexityIndicators(parsedRequirements) {
        const indicators = [];
        
        if (parsedRequirements.actions.length > 5) {
            indicators.push('multiple_actions');
        }
        
        if (parsedRequirements.entities.length > 10) {
            indicators.push('many_entities');
        }
        
        if (parsedRequirements.technical_requirements.length > 3) {
            indicators.push('multiple_technologies');
        }
        
        if (parsedRequirements.constraints.some(c => c.type === 'performance')) {
            indicators.push('performance_critical');
        }
        
        return indicators;
    }

    /**
     * Identify risk factors
     * @param {Object} parsedRequirements
     * @returns {Array}
     * @private
     */
    _identifyRiskFactors(parsedRequirements) {
        const risks = [];
        
        if (parsedRequirements.constraints.some(c => c.type === 'security')) {
            risks.push({ type: 'security', level: 'high', description: 'Security-sensitive implementation' });
        }
        
        if (parsedRequirements.technical_requirements.length > 5) {
            risks.push({ type: 'complexity', level: 'medium', description: 'Multiple technology integration' });
        }
        
        if (parsedRequirements.entities.some(e => e.type === 'file' && e.value.includes('config'))) {
            risks.push({ type: 'configuration', level: 'medium', description: 'Configuration changes required' });
        }
        
        return risks;
    }

    /**
     * Estimate affected files
     * @param {Object} parsedRequirements
     * @returns {number}
     * @private
     */
    _estimateAffectedFiles(parsedRequirements) {
        let fileCount = 1; // Minimum one file
        
        // Add files based on entities
        fileCount += parsedRequirements.entities.filter(e => e.type === 'file').length;
        
        // Add files based on components
        fileCount += parsedRequirements.entities.filter(e => e.type === 'component').length * 0.5;
        
        // Add files based on actions
        fileCount += parsedRequirements.actions.length * 0.3;
        
        return Math.ceil(fileCount);
    }

    /**
     * Identify related components
     * @param {Object} parsedRequirements
     * @returns {Array}
     * @private
     */
    _identifyRelatedComponents(parsedRequirements) {
        return parsedRequirements.entities
            .filter(e => e.type === 'component')
            .map(e => e.value);
    }

    /**
     * Get processing statistics
     * @returns {Object}
     */
    getStatistics() {
        const processed = Array.from(this.processingHistory.values());
        
        return {
            total_processed: processed.length,
            average_complexity: processed.reduce((sum, task) => sum + task.complexity, 0) / processed.length || 0,
            average_priority: processed.reduce((sum, task) => sum + task.priority, 0) / processed.length || 0,
            type_distribution: this._getTypeDistribution(processed),
            complexity_distribution: this._getComplexityDistribution(processed)
        };
    }

    /**
     * Get type distribution
     * @param {Array} tasks
     * @returns {Object}
     * @private
     */
    _getTypeDistribution(tasks) {
        const distribution = {};
        tasks.forEach(task => {
            const type = task.parsedRequirements.type;
            distribution[type] = (distribution[type] || 0) + 1;
        });
        return distribution;
    }

    /**
     * Get complexity distribution
     * @param {Array} tasks
     * @returns {Object}
     * @private
     */
    _getComplexityDistribution(tasks) {
        const distribution = { low: 0, medium: 0, high: 0 };
        tasks.forEach(task => {
            if (task.complexity <= 3) distribution.low++;
            else if (task.complexity <= 7) distribution.medium++;
            else distribution.high++;
        });
        return distribution;
    }
}

export default TaskProcessor;

