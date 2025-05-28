/**
 * @fileoverview Requirement Processor
 * @description Unified requirement analysis and task decomposition
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Requirement processor that combines NLP analysis with task decomposition
 */
export class RequirementProcessor {
    constructor(config = {}) {
        this.config = {
            enableEntityExtraction: true,
            enableKeywordExtraction: true,
            confidenceThreshold: 0.7,
            maxTasksPerRequirement: 15,
            enableSubtaskGeneration: true,
            enableDependencyAnalysis: true,
            enableComplexityEstimation: true,
            ...config
        };
        
        this.nlpProcessor = new NLPProcessor(this.config);
        this.taskDecomposer = new TaskDecomposer(this.config);
        this.dependencyAnalyzer = new DependencyAnalyzer(this.config);
    }

    /**
     * Initialize the requirement processor
     */
    async initialize() {
        log('debug', 'Initializing requirement processor...');
        // Initialize NLP models and dependencies
        await this.nlpProcessor.initialize();
        log('debug', 'Requirement processor initialized');
    }

    /**
     * Analyze requirement and decompose into atomic tasks
     * @param {string} requirement - Natural language requirement
     * @param {Object} options - Analysis options
     * @returns {Promise<RequirementAnalysisResult>} Analysis result
     */
    async analyzeRequirement(requirement, options = {}) {
        const startTime = Date.now();
        log('info', `Analyzing requirement: ${requirement.title || requirement.description?.substring(0, 100) || 'Untitled'}...`);

        try {
            // Step 1: NLP Analysis
            const requirementText = requirement.description || requirement.title || JSON.stringify(requirement);
            const nlpAnalysis = await this.nlpProcessor.analyze(requirementText);
            
            // Step 2: Parse and structure requirement
            const parsedRequirement = await this._parseRequirement(nlpAnalysis);
            
            // Step 3: Decompose into atomic tasks
            const tasks = await this.taskDecomposer.decomposeTask(parsedRequirement);
            
            // Step 4: Analyze dependencies
            const dependencyGraph = await this.dependencyAnalyzer.analyzeDependencies(tasks);
            
            // Step 5: Validate and enhance tasks
            const validatedTasks = await this._validateTasks(tasks);
            
            // Step 6: Generate summary
            const summary = this._generateSummary(parsedRequirement, validatedTasks, dependencyGraph);
            
            const result = {
                requirement: parsedRequirement,
                tasks: validatedTasks,
                dependencyGraph,
                summary,
                nlpAnalysis,
                processingTime: Date.now() - startTime,
                processedAt: new Date()
            };

            log('info', `Requirement analysis completed in ${result.processingTime}ms`);
            return result;

        } catch (error) {
            log('error', `Requirement analysis failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        return {
            status: 'healthy',
            nlp_processor: await this.nlpProcessor.getHealth(),
            task_decomposer: this.taskDecomposer.getHealth(),
            dependency_analyzer: this.dependencyAnalyzer.getHealth()
        };
    }

    /**
     * Shutdown the processor
     */
    async shutdown() {
        log('debug', 'Shutting down requirement processor...');
        await this.nlpProcessor.shutdown();
    }

    // Private methods

    /**
     * Parse requirement from NLP analysis
     * @param {Object} nlpAnalysis - NLP analysis result
     * @returns {Promise<ParsedRequirement>} Parsed requirement
     * @private
     */
    async _parseRequirement(nlpAnalysis) {
        return {
            id: `req_${Date.now()}`,
            title: nlpAnalysis.title || 'Untitled Requirement',
            description: nlpAnalysis.description || nlpAnalysis.originalText,
            originalText: nlpAnalysis.originalText,
            requirementType: nlpAnalysis.requirementType || 'implementation',
            priority: this._extractPriority(nlpAnalysis),
            estimatedComplexity: this._estimateComplexity(nlpAnalysis),
            tags: this._extractTags(nlpAnalysis),
            technicalSpecs: this._extractTechnicalSpecs(nlpAnalysis),
            businessRequirements: this._extractBusinessRequirements(nlpAnalysis),
            acceptanceCriteria: this._extractAcceptanceCriteria(nlpAnalysis),
            constraints: this._extractConstraints(nlpAnalysis),
            metadata: {
                confidence: nlpAnalysis.confidence,
                processedAt: new Date(),
                nlpVersion: '1.0.0'
            }
        };
    }

    /**
     * Validate and enhance tasks
     * @param {Array} tasks - Tasks to validate
     * @returns {Promise<Array>} Validated tasks
     * @private
     */
    async _validateTasks(tasks) {
        const validatedTasks = [];
        
        for (const task of tasks) {
            const validation = await this._validateTask(task);
            
            if (validation.isValid) {
                validatedTasks.push({
                    ...task,
                    validation: validation,
                    enhanced: true
                });
            } else {
                log('warning', `Task validation failed: ${task.title}`);
                // Try to fix the task
                const fixedTask = await this._fixTask(task, validation);
                if (fixedTask) {
                    validatedTasks.push(fixedTask);
                }
            }
        }
        
        return validatedTasks;
    }

    /**
     * Validate individual task
     * @param {Object} task - Task to validate
     * @returns {Promise<Object>} Validation result
     * @private
     */
    async _validateTask(task) {
        const errors = [];
        const warnings = [];
        const suggestions = [];
        
        // Check required fields
        if (!task.title || task.title.length < 3) {
            errors.push('Task title is required and must be at least 3 characters');
        }
        
        if (!task.description || task.description.length < 10) {
            errors.push('Task description is required and must be at least 10 characters');
        }
        
        if (!task.requirements || task.requirements.length === 0) {
            warnings.push('Task has no specific requirements defined');
        }
        
        if (!task.acceptanceCriteria || task.acceptanceCriteria.length === 0) {
            warnings.push('Task has no acceptance criteria defined');
        }
        
        if (task.complexityScore < 1 || task.complexityScore > 10) {
            errors.push('Task complexity score must be between 1 and 10');
        }
        
        // Check for completeness
        if (task.affectedFiles.length === 0) {
            suggestions.push('Consider specifying which files will be affected');
        }
        
        if (!task.estimatedHours) {
            suggestions.push('Consider adding time estimation');
        }
        
        const score = Math.max(0, 100 - (errors.length * 30) - (warnings.length * 10) - (suggestions.length * 5));
        
        return {
            isValid: errors.length === 0,
            score,
            errors,
            warnings,
            suggestions
        };
    }

    /**
     * Fix task based on validation errors
     * @param {Object} task - Task to fix
     * @param {Object} validation - Validation result
     * @returns {Promise<Object|null>} Fixed task or null
     * @private
     */
    async _fixTask(task, validation) {
        const fixedTask = { ...task };
        
        // Try to fix common issues
        if (!fixedTask.title || fixedTask.title.length < 3) {
            fixedTask.title = `Task: ${fixedTask.description?.substring(0, 50) || 'Untitled'}`;
        }
        
        if (!fixedTask.description || fixedTask.description.length < 10) {
            fixedTask.description = `Implementation task: ${fixedTask.title}`;
        }
        
        if (fixedTask.complexityScore < 1 || fixedTask.complexityScore > 10) {
            fixedTask.complexityScore = 5; // Default medium complexity
        }
        
        // Re-validate
        const revalidation = await this._validateTask(fixedTask);
        
        if (revalidation.isValid) {
            fixedTask.validation = revalidation;
            fixedTask.fixed = true;
            return fixedTask;
        }
        
        return null;
    }

    /**
     * Generate analysis summary
     * @param {Object} requirement - Parsed requirement
     * @param {Array} tasks - Validated tasks
     * @param {Object} dependencyGraph - Dependency graph
     * @returns {Object} Analysis summary
     * @private
     */
    _generateSummary(requirement, tasks, dependencyGraph) {
        const complexityScores = tasks.map(t => t.complexityScore);
        const averageComplexity = complexityScores.reduce((a, b) => a + b, 0) / complexityScores.length;
        
        return {
            totalTasks: tasks.length,
            averageComplexity: averageComplexity,
            highComplexityTasks: tasks.filter(t => t.complexityScore >= 7).length,
            dependencyCount: dependencyGraph.edges?.length || 0,
            validTasks: tasks.filter(t => t.validation?.isValid).length,
            estimatedTotalHours: tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0),
            requirementComplexity: requirement.estimatedComplexity,
            requirementType: requirement.requirementType,
            tags: [...new Set(tasks.flatMap(t => t.tags))],
            affectedAreas: [...new Set(tasks.flatMap(t => t.affectedFiles.map(f => f.split('/')[0])))]
        };
    }

    /**
     * Extract priority from NLP analysis
     * @param {Object} nlpAnalysis - NLP analysis
     * @returns {string} Priority level
     * @private
     */
    _extractPriority(nlpAnalysis) {
        const priorityKeywords = nlpAnalysis.keywords?.priorities || [];
        
        if (priorityKeywords.includes('urgent') || priorityKeywords.includes('critical')) {
            return 'high';
        } else if (priorityKeywords.includes('important') || priorityKeywords.includes('priority')) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    /**
     * Estimate complexity from NLP analysis
     * @param {Object} nlpAnalysis - NLP analysis
     * @returns {number} Complexity score (1-10)
     * @private
     */
    _estimateComplexity(nlpAnalysis) {
        let complexity = 5; // Base complexity
        
        const indicators = nlpAnalysis.complexityIndicators || {};
        
        // Adjust based on various factors
        if (indicators.technicalTerms > 10) complexity += 2;
        if (indicators.integrationPoints > 3) complexity += 1;
        if (indicators.securityRequirements) complexity += 1;
        if (indicators.performanceRequirements) complexity += 1;
        
        return Math.min(10, Math.max(1, complexity));
    }

    /**
     * Extract tags from NLP analysis
     * @param {Object} nlpAnalysis - NLP analysis
     * @returns {Array} Tags
     * @private
     */
    _extractTags(nlpAnalysis) {
        const tags = [];
        
        // Add technical tags
        if (nlpAnalysis.entities?.technologies) {
            tags.push(...nlpAnalysis.entities.technologies);
        }
        
        // Add requirement type tag
        if (nlpAnalysis.requirementType) {
            tags.push(nlpAnalysis.requirementType);
        }
        
        // Add keyword-based tags
        if (nlpAnalysis.keywords?.technical) {
            tags.push(...nlpAnalysis.keywords.technical.slice(0, 5));
        }
        
        return [...new Set(tags)];
    }

    /**
     * Extract technical specifications
     * @param {Object} nlpAnalysis - NLP analysis
     * @returns {Array} Technical specifications
     * @private
     */
    _extractTechnicalSpecs(nlpAnalysis) {
        const specs = [];
        
        if (nlpAnalysis.entities?.technologies) {
            specs.push(...nlpAnalysis.entities.technologies.map(tech => `Use ${tech}`));
        }
        
        if (nlpAnalysis.entities?.apis) {
            specs.push(...nlpAnalysis.entities.apis.map(api => `Integrate with ${api}`));
        }
        
        return specs;
    }

    /**
     * Extract business requirements
     * @param {Object} nlpAnalysis - NLP analysis
     * @returns {Array} Business requirements
     * @private
     */
    _extractBusinessRequirements(nlpAnalysis) {
        const requirements = [];
        
        if (nlpAnalysis.keywords?.business) {
            requirements.push(...nlpAnalysis.keywords.business.map(keyword => 
                `Business requirement: ${keyword}`
            ));
        }
        
        return requirements;
    }

    /**
     * Extract acceptance criteria
     * @param {Object} nlpAnalysis - NLP analysis
     * @returns {Array} Acceptance criteria
     * @private
     */
    _extractAcceptanceCriteria(nlpAnalysis) {
        const criteria = [];
        
        // Extract from sentences that contain criteria indicators
        if (nlpAnalysis.sentences) {
            const criteriaIndicators = ['should', 'must', 'will', 'shall', 'when', 'given'];
            
            nlpAnalysis.sentences.forEach(sentence => {
                if (criteriaIndicators.some(indicator => 
                    sentence.text.toLowerCase().includes(indicator)
                )) {
                    criteria.push(sentence.text);
                }
            });
        }
        
        return criteria;
    }

    /**
     * Extract constraints
     * @param {Object} nlpAnalysis - NLP analysis
     * @returns {Array} Constraints
     * @private
     */
    _extractConstraints(nlpAnalysis) {
        const constraints = [];
        
        if (nlpAnalysis.entities?.technologies) {
            constraints.push(`Technology stack: ${nlpAnalysis.entities.technologies.join(', ')}`);
        }
        
        return constraints;
    }
}

/**
 * Mock NLP Processor for development
 */
class NLPProcessor {
    constructor(config) {
        this.config = config;
    }

    async initialize() {
        // Mock initialization
    }

    async analyze(text) {
        // Mock NLP analysis
        return {
            originalText: text,
            title: this._extractTitle(text),
            description: text,
            requirementType: this._classifyType(text),
            confidence: 0.8,
            entities: this._extractEntities(text),
            keywords: this._extractKeywords(text),
            sentences: this._analyzeSentences(text),
            complexityIndicators: this._analyzeComplexity(text)
        };
    }

    async getHealth() {
        return { status: 'healthy', mode: 'mock' };
    }

    async shutdown() {
        // Mock shutdown
    }

    _extractTitle(text) {
        const firstSentence = text.split('.')[0];
        return firstSentence.length > 50 ? 
            firstSentence.substring(0, 50) + '...' : 
            firstSentence;
    }

    _classifyType(text) {
        const lowerText = text.toLowerCase();
        if (lowerText.includes('bug') || lowerText.includes('fix')) return 'bug_fix';
        if (lowerText.includes('test')) return 'testing';
        if (lowerText.includes('document')) return 'documentation';
        return 'implementation';
    }

    _extractEntities(text) {
        return {
            technologies: this._findTechnologies(text),
            apis: this._findAPIs(text),
            files: this._findFiles(text)
        };
    }

    _extractKeywords(text) {
        return {
            technical: this._findTechnicalKeywords(text),
            business: this._findBusinessKeywords(text),
            priorities: this._findPriorityKeywords(text)
        };
    }

    _analyzeSentences(text) {
        return text.split('.').map(sentence => ({
            text: sentence.trim(),
            type: 'statement'
        })).filter(s => s.text.length > 0);
    }

    _analyzeComplexity(text) {
        return {
            technicalTerms: (text.match(/\b(API|database|authentication|security|performance)\b/gi) || []).length,
            integrationPoints: (text.match(/\b(integrate|connect|sync|api)\b/gi) || []).length,
            securityRequirements: text.toLowerCase().includes('security'),
            performanceRequirements: text.toLowerCase().includes('performance')
        };
    }

    _findTechnologies(text) {
        const techKeywords = ['javascript', 'python', 'react', 'node', 'express', 'postgresql', 'redis'];
        return techKeywords.filter(tech => 
            text.toLowerCase().includes(tech)
        );
    }

    _findAPIs(text) {
        const apiMatches = text.match(/\b\w+\s+API\b/gi) || [];
        return apiMatches.map(match => match.trim());
    }

    _findFiles(text) {
        const fileMatches = text.match(/\b\w+\.\w+\b/g) || [];
        return fileMatches.filter(match => 
            match.includes('.js') || match.includes('.py') || match.includes('.json')
        );
    }

    _findTechnicalKeywords(text) {
        const keywords = ['authentication', 'database', 'api', 'security', 'performance', 'testing'];
        return keywords.filter(keyword => 
            text.toLowerCase().includes(keyword)
        );
    }

    _findBusinessKeywords(text) {
        const keywords = ['user', 'customer', 'business', 'revenue', 'efficiency'];
        return keywords.filter(keyword => 
            text.toLowerCase().includes(keyword)
        );
    }

    _findPriorityKeywords(text) {
        const keywords = ['urgent', 'critical', 'important', 'priority', 'asap'];
        return keywords.filter(keyword => 
            text.toLowerCase().includes(keyword)
        );
    }
}

/**
 * Task Decomposer
 */
class TaskDecomposer {
    constructor(config) {
        this.config = config;
    }

    async decomposeTask(requirement) {
        // Mock task decomposition
        const tasks = [];
        const baseTask = this._createBaseTask(requirement);
        
        // Generate multiple tasks based on requirement complexity
        const taskCount = Math.min(
            this.config.maxTasksPerRequirement,
            Math.max(1, Math.floor(requirement.estimatedComplexity / 2))
        );
        
        for (let i = 0; i < taskCount; i++) {
            tasks.push({
                ...baseTask,
                id: `task_${Date.now()}_${i}`,
                title: `${baseTask.title} - Part ${i + 1}`,
                description: `${baseTask.description} (Part ${i + 1} of ${taskCount})`,
                complexityScore: Math.max(1, Math.min(10, baseTask.complexityScore + (Math.random() - 0.5) * 2))
            });
        }
        
        return tasks;
    }

    getHealth() {
        return { status: 'healthy', mode: 'mock' };
    }

    _createBaseTask(requirement) {
        return {
            title: requirement.title,
            description: requirement.description,
            requirements: requirement.technicalSpecs,
            acceptanceCriteria: requirement.acceptanceCriteria,
            complexityScore: requirement.estimatedComplexity,
            priority: requirement.priority,
            affectedFiles: this._estimateAffectedFiles(requirement),
            tags: requirement.tags,
            estimatedHours: this._estimateHours(requirement.estimatedComplexity),
            dependencies: [],
            metadata: {
                sourceRequirement: requirement.id,
                createdAt: new Date()
            }
        };
    }

    _estimateAffectedFiles(requirement) {
        const files = [];
        
        if (requirement.requirementType === 'implementation') {
            files.push('src/main.js', 'src/utils.js');
        }
        
        if (requirement.requirementType === 'testing') {
            files.push('tests/unit.test.js', 'tests/integration.test.js');
        }
        
        return files;
    }

    _estimateHours(complexity) {
        return Math.max(1, complexity * 2 + Math.random() * 4);
    }
}

/**
 * Dependency Analyzer
 */
class DependencyAnalyzer {
    constructor(config) {
        this.config = config;
    }

    async analyzeDependencies(tasks) {
        // Mock dependency analysis
        const edges = [];
        
        // Create some mock dependencies
        for (let i = 1; i < tasks.length; i++) {
            if (Math.random() > 0.5) {
                edges.push({
                    from: tasks[i - 1].id,
                    to: tasks[i].id,
                    type: 'blocks'
                });
            }
        }
        
        return {
            nodes: tasks.map(task => ({ id: task.id, title: task.title })),
            edges,
            hasCycles: false
        };
    }

    getHealth() {
        return { status: 'healthy', mode: 'mock' };
    }
}

export default RequirementProcessor;
