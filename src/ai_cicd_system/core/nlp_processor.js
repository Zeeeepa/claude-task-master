/**
 * @fileoverview Natural Language Processing Engine
 * @description Sophisticated NLP capabilities for converting database tasks into structured PR generation requests
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Natural Language Processing Engine for task analysis and prompt generation
 */
export class NLPProcessor {
    constructor(config = {}) {
        this.config = {
            maxContextLength: config.maxContextLength || 8000,
            enableSemanticAnalysis: config.enableSemanticAnalysis !== false,
            enableIntentClassification: config.enableIntentClassification !== false,
            enableComplexityAnalysis: config.enableComplexityAnalysis !== false,
            supportedLanguages: config.supportedLanguages || ['javascript', 'typescript', 'python', 'java', 'go'],
            ...config
        };

        // Initialize analysis engines
        this.taskAnalyzer = new TaskAnalyzer(this.config);
        this.intentClassifier = new IntentClassifier(this.config);
        this.complexityAnalyzer = new ComplexityAnalyzer(this.config);
        this.contextExtractor = new ContextExtractor(this.config);

        log('info', 'NLP processor initialized');
    }

    /**
     * Process natural language task description into structured format
     * @param {string} taskDescription - Natural language task description
     * @param {Object} context - Additional context information
     * @returns {Promise<Object>} Processed task structure
     */
    async processTask(taskDescription, context = {}) {
        try {
            log('debug', 'Processing task description', { 
                length: taskDescription.length,
                hasContext: Object.keys(context).length > 0
            });

            // Step 1: Analyze task structure and extract key components
            const taskAnalysis = await this.taskAnalyzer.analyze(taskDescription);

            // Step 2: Classify intent and determine task type
            const intentClassification = await this.intentClassifier.classify(taskDescription, taskAnalysis);

            // Step 3: Analyze complexity and estimate effort
            const complexityAnalysis = await this.complexityAnalyzer.analyze(taskDescription, taskAnalysis);

            // Step 4: Extract and enrich context
            const enrichedContext = await this.contextExtractor.extract(taskDescription, context);

            // Step 5: Generate structured task representation
            const structuredTask = this._generateStructuredTask({
                originalDescription: taskDescription,
                taskAnalysis,
                intentClassification,
                complexityAnalysis,
                enrichedContext
            });

            log('info', 'Task processing completed', {
                taskType: structuredTask.type,
                complexity: structuredTask.complexity.level,
                confidence: structuredTask.confidence
            });

            return structuredTask;

        } catch (error) {
            log('error', 'Task processing failed', { error: error.message });
            throw new NLPError(`Failed to process task: ${error.message}`, 'PROCESSING_ERROR', error);
        }
    }

    /**
     * Generate optimized prompt for Codegen API
     * @param {Object} structuredTask - Processed task structure
     * @param {Object} options - Prompt generation options
     * @returns {Promise<Object>} Generated prompt with metadata
     */
    async generatePrompt(structuredTask, options = {}) {
        try {
            const {
                includeContext = true,
                includeBestPractices = true,
                includeExamples = false,
                maxLength = this.config.maxContextLength
            } = options;

            // Build prompt sections
            const promptSections = [];

            // 1. Task description and objectives
            promptSections.push(this._buildTaskSection(structuredTask));

            // 2. Technical requirements and constraints
            if (structuredTask.requirements.length > 0) {
                promptSections.push(this._buildRequirementsSection(structuredTask));
            }

            // 3. Context and dependencies
            if (includeContext && structuredTask.context) {
                promptSections.push(this._buildContextSection(structuredTask));
            }

            // 4. Best practices and guidelines
            if (includeBestPractices) {
                promptSections.push(this._buildBestPracticesSection(structuredTask));
            }

            // 5. Examples and templates
            if (includeExamples) {
                promptSections.push(this._buildExamplesSection(structuredTask));
            }

            // 6. Output format specifications
            promptSections.push(this._buildOutputFormatSection(structuredTask));

            // Combine sections and optimize length
            let fullPrompt = promptSections.join('\n\n');
            
            if (fullPrompt.length > maxLength) {
                fullPrompt = this._optimizePromptLength(fullPrompt, maxLength, structuredTask);
            }

            const promptMetadata = {
                taskId: structuredTask.id,
                taskType: structuredTask.type,
                complexity: structuredTask.complexity.level,
                estimatedTokens: Math.ceil(fullPrompt.length / 4), // Rough token estimate
                sections: promptSections.length,
                optimized: fullPrompt.length !== promptSections.join('\n\n').length,
                generatedAt: new Date().toISOString()
            };

            log('debug', 'Prompt generated', promptMetadata);

            return {
                prompt: fullPrompt,
                metadata: promptMetadata,
                structuredTask
            };

        } catch (error) {
            log('error', 'Prompt generation failed', { error: error.message });
            throw new NLPError(`Failed to generate prompt: ${error.message}`, 'PROMPT_GENERATION_ERROR', error);
        }
    }

    /**
     * Validate prompt quality before sending to Codegen
     * @param {Object} promptData - Generated prompt data
     * @returns {Promise<Object>} Validation results
     */
    async validatePrompt(promptData) {
        try {
            const { prompt, metadata, structuredTask } = promptData;
            const validationResults = {
                isValid: true,
                score: 0,
                issues: [],
                suggestions: [],
                metrics: {}
            };

            // 1. Length validation
            const lengthValidation = this._validatePromptLength(prompt);
            validationResults.metrics.length = lengthValidation;
            if (!lengthValidation.isValid) {
                validationResults.isValid = false;
                validationResults.issues.push(lengthValidation.issue);
            }

            // 2. Clarity validation
            const clarityValidation = this._validatePromptClarity(prompt, structuredTask);
            validationResults.metrics.clarity = clarityValidation;
            validationResults.score += clarityValidation.score * 0.3;

            // 3. Completeness validation
            const completenessValidation = this._validatePromptCompleteness(prompt, structuredTask);
            validationResults.metrics.completeness = completenessValidation;
            validationResults.score += completenessValidation.score * 0.4;

            // 4. Technical accuracy validation
            const technicalValidation = this._validateTechnicalAccuracy(prompt, structuredTask);
            validationResults.metrics.technical = technicalValidation;
            validationResults.score += technicalValidation.score * 0.3;

            // 5. Generate suggestions for improvement
            validationResults.suggestions = this._generateImprovementSuggestions(validationResults.metrics);

            // Final score calculation (0-100)
            validationResults.score = Math.round(validationResults.score * 100);

            log('debug', 'Prompt validation completed', {
                score: validationResults.score,
                isValid: validationResults.isValid,
                issueCount: validationResults.issues.length
            });

            return validationResults;

        } catch (error) {
            log('error', 'Prompt validation failed', { error: error.message });
            throw new NLPError(`Failed to validate prompt: ${error.message}`, 'VALIDATION_ERROR', error);
        }
    }

    /**
     * Generate structured task representation
     * @private
     */
    _generateStructuredTask(analysisData) {
        const {
            originalDescription,
            taskAnalysis,
            intentClassification,
            complexityAnalysis,
            enrichedContext
        } = analysisData;

        return {
            id: this._generateTaskId(),
            originalDescription,
            type: intentClassification.primaryIntent,
            subtype: intentClassification.secondaryIntent,
            confidence: intentClassification.confidence,
            
            // Core task components
            objectives: taskAnalysis.objectives,
            requirements: taskAnalysis.requirements,
            constraints: taskAnalysis.constraints,
            deliverables: taskAnalysis.deliverables,
            
            // Complexity analysis
            complexity: {
                level: complexityAnalysis.level,
                score: complexityAnalysis.score,
                factors: complexityAnalysis.factors,
                estimatedEffort: complexityAnalysis.estimatedEffort
            },
            
            // Context and dependencies
            context: enrichedContext,
            
            // Technical specifications
            technologies: taskAnalysis.technologies,
            patterns: taskAnalysis.patterns,
            bestPractices: taskAnalysis.bestPractices,
            
            // Metadata
            processedAt: new Date().toISOString(),
            version: '1.0'
        };
    }

    /**
     * Build task description section
     * @private
     */
    _buildTaskSection(structuredTask) {
        return `# Task: ${structuredTask.type.toUpperCase()}

## Objective
${structuredTask.objectives.join('\n')}

## Task Type
- Primary: ${structuredTask.type}
- Secondary: ${structuredTask.subtype || 'N/A'}
- Complexity: ${structuredTask.complexity.level} (${structuredTask.complexity.score}/10)

## Original Description
${structuredTask.originalDescription}`;
    }

    /**
     * Build requirements section
     * @private
     */
    _buildRequirementsSection(structuredTask) {
        const requirements = structuredTask.requirements.map(req => `- ${req}`).join('\n');
        const constraints = structuredTask.constraints.map(constraint => `- ${constraint}`).join('\n');
        
        return `## Requirements
${requirements}

## Constraints
${constraints}`;
    }

    /**
     * Build context section
     * @private
     */
    _buildContextSection(structuredTask) {
        const context = structuredTask.context;
        let contextSection = '## Context\n';
        
        if (context.codebase) {
            contextSection += `\n### Codebase Context\n${context.codebase}`;
        }
        
        if (context.dependencies && context.dependencies.length > 0) {
            contextSection += `\n### Dependencies\n${context.dependencies.map(dep => `- ${dep}`).join('\n')}`;
        }
        
        if (context.relatedFiles && context.relatedFiles.length > 0) {
            contextSection += `\n### Related Files\n${context.relatedFiles.map(file => `- ${file}`).join('\n')}`;
        }
        
        return contextSection;
    }

    /**
     * Build best practices section
     * @private
     */
    _buildBestPracticesSection(structuredTask) {
        const practices = structuredTask.bestPractices || [];
        if (practices.length === 0) return '';
        
        return `## Best Practices
${practices.map(practice => `- ${practice}`).join('\n')}`;
    }

    /**
     * Build examples section
     * @private
     */
    _buildExamplesSection(structuredTask) {
        // This would include relevant code examples based on task type
        return `## Examples
Please follow established patterns in the codebase and provide comprehensive examples.`;
    }

    /**
     * Build output format section
     * @private
     */
    _buildOutputFormatSection(structuredTask) {
        return `## Output Requirements
- Create a pull request with the implementation
- Include comprehensive tests
- Follow existing code style and patterns
- Provide clear commit messages
- Update documentation if necessary

## Deliverables
${structuredTask.deliverables.map(deliverable => `- ${deliverable}`).join('\n')}`;
    }

    /**
     * Optimize prompt length while preserving important information
     * @private
     */
    _optimizePromptLength(prompt, maxLength, structuredTask) {
        // Priority order for section preservation
        const sectionPriority = [
            'Task:',
            'Objective',
            'Requirements',
            'Output Requirements',
            'Context',
            'Best Practices',
            'Examples'
        ];

        // If still too long, truncate less important sections
        let optimizedPrompt = prompt;
        
        // Simple truncation strategy - in production, this would be more sophisticated
        if (optimizedPrompt.length > maxLength) {
            optimizedPrompt = optimizedPrompt.substring(0, maxLength - 100) + '\n\n[Content truncated for length]';
        }

        return optimizedPrompt;
    }

    /**
     * Validate prompt length
     * @private
     */
    _validatePromptLength(prompt) {
        const length = prompt.length;
        const maxLength = this.config.maxContextLength;
        
        return {
            isValid: length <= maxLength,
            length,
            maxLength,
            issue: length > maxLength ? `Prompt too long: ${length} > ${maxLength}` : null
        };
    }

    /**
     * Validate prompt clarity
     * @private
     */
    _validatePromptClarity(prompt, structuredTask) {
        let score = 0.5; // Base score
        
        // Check for clear objectives
        if (structuredTask.objectives.length > 0) score += 0.2;
        
        // Check for specific requirements
        if (structuredTask.requirements.length > 0) score += 0.2;
        
        // Check for clear deliverables
        if (structuredTask.deliverables.length > 0) score += 0.1;
        
        return {
            score: Math.min(score, 1.0),
            hasObjectives: structuredTask.objectives.length > 0,
            hasRequirements: structuredTask.requirements.length > 0,
            hasDeliverables: structuredTask.deliverables.length > 0
        };
    }

    /**
     * Validate prompt completeness
     * @private
     */
    _validatePromptCompleteness(prompt, structuredTask) {
        let score = 0;
        const requiredSections = ['Task:', 'Objective', 'Output Requirements'];
        
        requiredSections.forEach(section => {
            if (prompt.includes(section)) score += 1 / requiredSections.length;
        });
        
        return {
            score,
            missingSections: requiredSections.filter(section => !prompt.includes(section))
        };
    }

    /**
     * Validate technical accuracy
     * @private
     */
    _validateTechnicalAccuracy(prompt, structuredTask) {
        let score = 0.7; // Base score for basic accuracy
        
        // Check for technology-specific content
        if (structuredTask.technologies.length > 0) score += 0.2;
        
        // Check for pattern recognition
        if (structuredTask.patterns.length > 0) score += 0.1;
        
        return {
            score: Math.min(score, 1.0),
            technologies: structuredTask.technologies,
            patterns: structuredTask.patterns
        };
    }

    /**
     * Generate improvement suggestions
     * @private
     */
    _generateImprovementSuggestions(metrics) {
        const suggestions = [];
        
        if (metrics.clarity.score < 0.7) {
            suggestions.push('Add more specific objectives and requirements');
        }
        
        if (metrics.completeness.score < 0.8) {
            suggestions.push('Include all required sections: ' + metrics.completeness.missingSections.join(', '));
        }
        
        if (metrics.technical.score < 0.8) {
            suggestions.push('Add more technical context and technology-specific details');
        }
        
        return suggestions;
    }

    /**
     * Generate unique task ID
     * @private
     */
    _generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Task analyzer for extracting key components from natural language
 */
class TaskAnalyzer {
    constructor(config) {
        this.config = config;
    }

    async analyze(taskDescription) {
        // Extract objectives, requirements, constraints, etc.
        const objectives = this._extractObjectives(taskDescription);
        const requirements = this._extractRequirements(taskDescription);
        const constraints = this._extractConstraints(taskDescription);
        const deliverables = this._extractDeliverables(taskDescription);
        const technologies = this._extractTechnologies(taskDescription);
        const patterns = this._extractPatterns(taskDescription);
        const bestPractices = this._extractBestPractices(taskDescription);

        return {
            objectives,
            requirements,
            constraints,
            deliverables,
            technologies,
            patterns,
            bestPractices
        };
    }

    _extractObjectives(text) {
        // Simple keyword-based extraction - in production, this would use more sophisticated NLP
        const objectiveKeywords = ['implement', 'create', 'build', 'develop', 'add', 'fix', 'update', 'enhance'];
        const sentences = text.split(/[.!?]+/).filter(s => s.trim());
        
        return sentences.filter(sentence => 
            objectiveKeywords.some(keyword => 
                sentence.toLowerCase().includes(keyword)
            )
        ).map(s => s.trim());
    }

    _extractRequirements(text) {
        // Extract functional and non-functional requirements
        const requirementKeywords = ['must', 'should', 'require', 'need', 'ensure', 'support'];
        const sentences = text.split(/[.!?]+/).filter(s => s.trim());
        
        return sentences.filter(sentence => 
            requirementKeywords.some(keyword => 
                sentence.toLowerCase().includes(keyword)
            )
        ).map(s => s.trim());
    }

    _extractConstraints(text) {
        // Extract constraints and limitations
        const constraintKeywords = ['cannot', 'must not', 'avoid', 'limit', 'restrict', 'within'];
        const sentences = text.split(/[.!?]+/).filter(s => s.trim());
        
        return sentences.filter(sentence => 
            constraintKeywords.some(keyword => 
                sentence.toLowerCase().includes(keyword)
            )
        ).map(s => s.trim());
    }

    _extractDeliverables(text) {
        // Extract expected deliverables
        const deliverableKeywords = ['deliver', 'provide', 'output', 'generate', 'produce'];
        const sentences = text.split(/[.!?]+/).filter(s => s.trim());
        
        const deliverables = sentences.filter(sentence => 
            deliverableKeywords.some(keyword => 
                sentence.toLowerCase().includes(keyword)
            )
        ).map(s => s.trim());

        // Add default deliverables
        if (deliverables.length === 0) {
            deliverables.push('Working implementation', 'Unit tests', 'Documentation');
        }

        return deliverables;
    }

    _extractTechnologies(text) {
        // Extract mentioned technologies
        const techKeywords = [
            'javascript', 'typescript', 'python', 'java', 'go', 'rust',
            'react', 'vue', 'angular', 'node', 'express', 'fastapi',
            'postgresql', 'mysql', 'mongodb', 'redis',
            'docker', 'kubernetes', 'aws', 'gcp', 'azure'
        ];
        
        return techKeywords.filter(tech => 
            text.toLowerCase().includes(tech)
        );
    }

    _extractPatterns(text) {
        // Extract design patterns and architectural patterns
        const patternKeywords = [
            'mvc', 'mvp', 'mvvm', 'singleton', 'factory', 'observer',
            'microservices', 'monolith', 'rest', 'graphql', 'api'
        ];
        
        return patternKeywords.filter(pattern => 
            text.toLowerCase().includes(pattern)
        );
    }

    _extractBestPractices(text) {
        // Extract or suggest best practices based on task type
        const practices = [];
        
        if (text.toLowerCase().includes('test')) {
            practices.push('Write comprehensive unit tests');
            practices.push('Include integration tests');
        }
        
        if (text.toLowerCase().includes('api')) {
            practices.push('Follow RESTful design principles');
            practices.push('Include proper error handling');
            practices.push('Add input validation');
        }
        
        if (text.toLowerCase().includes('database')) {
            practices.push('Use proper database migrations');
            practices.push('Implement proper indexing');
            practices.push('Add data validation');
        }
        
        return practices;
    }
}

/**
 * Intent classifier for determining task type and purpose
 */
class IntentClassifier {
    constructor(config) {
        this.config = config;
        this.intentPatterns = {
            'feature_development': ['implement', 'add', 'create', 'build', 'develop'],
            'bug_fix': ['fix', 'resolve', 'correct', 'repair', 'debug'],
            'refactoring': ['refactor', 'restructure', 'reorganize', 'optimize'],
            'testing': ['test', 'verify', 'validate', 'check'],
            'documentation': ['document', 'explain', 'describe', 'comment'],
            'maintenance': ['update', 'upgrade', 'maintain', 'clean'],
            'integration': ['integrate', 'connect', 'link', 'combine'],
            'configuration': ['configure', 'setup', 'install', 'deploy']
        };
    }

    async classify(taskDescription, taskAnalysis) {
        const text = taskDescription.toLowerCase();
        const scores = {};
        
        // Calculate scores for each intent
        for (const [intent, keywords] of Object.entries(this.intentPatterns)) {
            scores[intent] = keywords.reduce((score, keyword) => {
                const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
                return score + matches;
            }, 0);
        }
        
        // Find primary and secondary intents
        const sortedIntents = Object.entries(scores)
            .sort(([,a], [,b]) => b - a)
            .filter(([,score]) => score > 0);
        
        const primaryIntent = sortedIntents[0]?.[0] || 'feature_development';
        const secondaryIntent = sortedIntents[1]?.[0] || null;
        
        // Calculate confidence based on score distribution
        const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
        const confidence = totalScore > 0 ? scores[primaryIntent] / totalScore : 0.5;
        
        return {
            primaryIntent,
            secondaryIntent,
            confidence,
            scores
        };
    }
}

/**
 * Complexity analyzer for estimating task difficulty and effort
 */
class ComplexityAnalyzer {
    constructor(config) {
        this.config = config;
        this.complexityFactors = {
            'multiple_files': 2,
            'database_changes': 3,
            'api_integration': 2,
            'testing_required': 1,
            'documentation_required': 1,
            'performance_critical': 3,
            'security_sensitive': 4,
            'cross_platform': 2,
            'legacy_code': 3
        };
    }

    async analyze(taskDescription, taskAnalysis) {
        const text = taskDescription.toLowerCase();
        let complexityScore = 1; // Base complexity
        const factors = [];
        
        // Analyze complexity factors
        if (text.includes('multiple') || text.includes('several')) {
            complexityScore += this.complexityFactors.multiple_files;
            factors.push('multiple_files');
        }
        
        if (text.includes('database') || text.includes('sql')) {
            complexityScore += this.complexityFactors.database_changes;
            factors.push('database_changes');
        }
        
        if (text.includes('api') || text.includes('integration')) {
            complexityScore += this.complexityFactors.api_integration;
            factors.push('api_integration');
        }
        
        if (text.includes('test')) {
            complexityScore += this.complexityFactors.testing_required;
            factors.push('testing_required');
        }
        
        if (text.includes('performance') || text.includes('optimize')) {
            complexityScore += this.complexityFactors.performance_critical;
            factors.push('performance_critical');
        }
        
        if (text.includes('security') || text.includes('auth')) {
            complexityScore += this.complexityFactors.security_sensitive;
            factors.push('security_sensitive');
        }
        
        // Determine complexity level
        let level;
        if (complexityScore <= 3) level = 'low';
        else if (complexityScore <= 6) level = 'medium';
        else if (complexityScore <= 10) level = 'high';
        else level = 'very_high';
        
        // Estimate effort in hours
        const effortMultiplier = { low: 2, medium: 8, high: 24, very_high: 72 };
        const estimatedEffort = effortMultiplier[level];
        
        return {
            level,
            score: Math.min(complexityScore, 10),
            factors,
            estimatedEffort
        };
    }
}

/**
 * Context extractor for enriching task context
 */
class ContextExtractor {
    constructor(config) {
        this.config = config;
    }

    async extract(taskDescription, providedContext) {
        // Combine provided context with extracted context
        const extractedContext = {
            codebase: this._extractCodebaseContext(taskDescription),
            dependencies: this._extractDependencies(taskDescription),
            relatedFiles: this._extractRelatedFiles(taskDescription),
            environment: this._extractEnvironment(taskDescription)
        };
        
        return {
            ...providedContext,
            ...extractedContext
        };
    }

    _extractCodebaseContext(text) {
        // Extract codebase-specific context
        return 'Current codebase context will be provided by the system';
    }

    _extractDependencies(text) {
        // Extract mentioned dependencies
        const depPatterns = [
            /npm install ([a-zA-Z0-9-_@\/]+)/g,
            /import .* from ['"]([^'"]+)['"]/g,
            /require\(['"]([^'"]+)['"]\)/g
        ];
        
        const dependencies = [];
        depPatterns.forEach(pattern => {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
                dependencies.push(match[1]);
            }
        });
        
        return [...new Set(dependencies)];
    }

    _extractRelatedFiles(text) {
        // Extract mentioned file paths
        const filePattern = /[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+/g;
        const matches = text.match(filePattern) || [];
        return [...new Set(matches)];
    }

    _extractEnvironment(text) {
        // Extract environment-specific information
        const envKeywords = ['development', 'production', 'staging', 'test'];
        return envKeywords.filter(env => text.toLowerCase().includes(env));
    }
}

/**
 * Custom error class for NLP operations
 */
export class NLPError extends Error {
    constructor(message, code = 'NLP_ERROR', originalError = null) {
        super(message);
        this.name = 'NLPError';
        this.code = code;
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
        
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, NLPError);
        }
    }
}

export default NLPProcessor;

