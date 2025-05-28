/**
 * Core requirement analysis engine
 * Parses natural language requirements into structured task data
 */

import { ParsedRequirement, AtomicTask, DependencyGraph, ComplexityScore, TaskContext, ValidationResult, Component, CodegenPrompt } from './types.js';
import { NLPProcessor } from '../nlp_engine/processor.js';
import { TaskDecomposer } from '../task_decomposition/decomposer.js';

/**
 * Main requirement analyzer class
 * Implements the core interface for requirement analysis and task decomposition
 */
export class RequirementAnalyzer {
    constructor(options = {}) {
        this.nlpProcessor = new NLPProcessor(options.nlp || {});
        this.taskDecomposer = new TaskDecomposer(options.decomposer || {});
        this.options = {
            maxComplexityScore: 10,
            defaultPriority: 'medium',
            enableDependencyAnalysis: true,
            enableComplexityEstimation: true,
            ...options
        };
    }

    /**
     * Parses natural language requirements into structured task data
     * @param {string} requirementText - The natural language requirement
     * @param {Object} context - Additional context for parsing
     * @returns {ParsedRequirement} Structured requirement data
     */
    async parseRequirements(requirementText, context = {}) {
        try {
            // Extract basic information using NLP
            const nlpResult = await this.nlpProcessor.analyze(requirementText);
            
            // Generate unique ID
            const id = this._generateRequirementId(requirementText);
            
            // Extract title from the text
            const title = this._extractTitle(requirementText, nlpResult);
            
            // Extract description
            const description = this._extractDescription(requirementText, nlpResult);
            
            // Extract technical specifications
            const technicalSpecs = this._extractTechnicalSpecs(requirementText, nlpResult);
            
            // Extract business requirements
            const businessRequirements = this._extractBusinessRequirements(requirementText, nlpResult);
            
            // Extract acceptance criteria
            const acceptanceCriteria = this._extractAcceptanceCriteria(requirementText, nlpResult);
            
            // Estimate initial complexity
            const estimatedComplexity = this._estimateInitialComplexity(requirementText, nlpResult);
            
            // Determine priority
            const priority = this._determinePriority(requirementText, nlpResult);
            
            // Extract tags
            const tags = this._extractTags(requirementText, nlpResult);
            
            // Build metadata
            const metadata = {
                nlpAnalysis: nlpResult,
                context,
                processingTimestamp: new Date().toISOString(),
                confidence: nlpResult.confidence || 0.8
            };

            const parsedRequirement = new ParsedRequirement({
                id,
                title,
                description,
                originalText: requirementText,
                technicalSpecs,
                businessRequirements,
                acceptanceCriteria,
                estimatedComplexity,
                priority,
                tags,
                metadata
            });

            // Validate the parsed requirement
            const validation = parsedRequirement.validate();
            if (!validation.isValid) {
                throw new Error(`Invalid parsed requirement: ${validation.errors.join(', ')}`);
            }

            return parsedRequirement;
        } catch (error) {
            throw new Error(`Failed to parse requirements: ${error.message}`);
        }
    }

    /**
     * Decomposes a requirement into atomic, implementable tasks
     * @param {ParsedRequirement} requirement - The parsed requirement
     * @returns {Array<AtomicTask>} List of atomic tasks
     */
    async decomposeTask(requirement) {
        try {
            return await this.taskDecomposer.decompose(requirement);
        } catch (error) {
            throw new Error(`Failed to decompose task: ${error.message}`);
        }
    }

    /**
     * Analyzes dependencies between tasks
     * @param {Array<AtomicTask>} tasks - List of atomic tasks
     * @returns {DependencyGraph} Dependency graph with relationships
     */
    async analyzeDependencies(tasks) {
        if (!this.options.enableDependencyAnalysis) {
            const graph = new DependencyGraph();
            tasks.forEach(task => graph.addTask(task));
            return graph;
        }

        try {
            const graph = new DependencyGraph();
            
            // Add all tasks to the graph first
            tasks.forEach(task => graph.addTask(task));
            
            // Analyze dependencies between tasks
            for (let i = 0; i < tasks.length; i++) {
                for (let j = 0; j < tasks.length; j++) {
                    if (i !== j) {
                        const dependency = this._analyzeDependencyBetweenTasks(tasks[i], tasks[j]);
                        if (dependency.exists) {
                            graph.addDependency(tasks[i].id, tasks[j].id);
                        }
                    }
                }
            }

            // Check for circular dependencies
            const cycles = graph.detectCircularDependencies();
            if (cycles.length > 0) {
                console.warn(`Circular dependencies detected: ${cycles.map(c => c.join(' -> ')).join(', ')}`);
            }

            return graph;
        } catch (error) {
            throw new Error(`Failed to analyze dependencies: ${error.message}`);
        }
    }

    /**
     * Estimates complexity for a task
     * @param {AtomicTask} task - The task to analyze
     * @returns {ComplexityScore} Complexity score breakdown
     */
    async estimateComplexity(task) {
        if (!this.options.enableComplexityEstimation) {
            return new ComplexityScore({ technical: task.complexityScore || 1 });
        }

        try {
            // Analyze technical complexity
            const technical = this._estimateTechnicalComplexity(task);
            
            // Analyze business complexity
            const business = this._estimateBusinessComplexity(task);
            
            // Analyze integration complexity
            const integration = this._estimateIntegrationComplexity(task);
            
            // Analyze testing complexity
            const testing = this._estimateTestingComplexity(task);
            
            // Analyze documentation complexity
            const documentation = this._estimateDocumentationComplexity(task);

            return new ComplexityScore({
                technical,
                business,
                integration,
                testing,
                documentation
            });
        } catch (error) {
            throw new Error(`Failed to estimate complexity: ${error.message}`);
        }
    }

    /**
     * Generates task context for AI agents
     * @param {AtomicTask} task - The task to generate context for
     * @returns {TaskContext} Rich context for AI agents
     */
    async generateTaskContext(task) {
        try {
            // Analyze codebase context
            const codebaseContext = await this._analyzeCodebaseContext(task);
            
            // Identify technical constraints
            const technicalConstraints = this._identifyTechnicalConstraints(task);
            
            // Extract business context
            const businessContext = this._extractBusinessContext(task);
            
            // Find related tasks
            const relatedTasks = this._findRelatedTasks(task);
            
            // Identify external dependencies
            const externalDependencies = this._identifyExternalDependencies(task);
            
            // Assess risk factors
            const riskFactors = this._assessRiskFactors(task);
            
            // Define success metrics
            const successMetrics = this._defineSuccessMetrics(task);

            return new TaskContext({
                codebaseContext,
                technicalConstraints,
                businessContext,
                relatedTasks,
                externalDependencies,
                riskFactors,
                successMetrics
            });
        } catch (error) {
            throw new Error(`Failed to generate task context: ${error.message}`);
        }
    }

    /**
     * Generates a codegen prompt from a task
     * @param {AtomicTask} task - The task to generate prompt for
     * @returns {CodegenPrompt} Formatted prompt for codegen
     */
    async generateCodegenPrompt(task) {
        try {
            const context = await this.generateTaskContext(task);
            
            return new CodegenPrompt({
                title: task.title,
                description: task.description,
                context: context,
                requirements: task.requirements,
                acceptanceCriteria: task.acceptanceCriteria,
                technicalSpecs: task.context.technicalSpecs || [],
                affectedFiles: task.affectedFiles,
                priority: task.priority,
                estimatedComplexity: task.complexityScore
            });
        } catch (error) {
            throw new Error(`Failed to generate codegen prompt: ${error.message}`);
        }
    }

    /**
     * Extracts affected components from a task
     * @param {AtomicTask} task - The task to analyze
     * @returns {Array<Component>} List of affected components
     */
    async extractAffectedComponents(task) {
        try {
            const components = [];
            
            // Analyze affected files
            for (const filePath of task.affectedFiles) {
                const component = await this._analyzeFileComponent(filePath, task);
                if (component) {
                    components.push(component);
                }
            }
            
            // Analyze mentioned services/modules in description
            const mentionedComponents = this._extractMentionedComponents(task);
            components.push(...mentionedComponents);
            
            // Remove duplicates
            const uniqueComponents = this._deduplicateComponents(components);
            
            return uniqueComponents;
        } catch (error) {
            throw new Error(`Failed to extract affected components: ${error.message}`);
        }
    }

    /**
     * Validates task completeness
     * @param {AtomicTask} task - The task to validate
     * @returns {ValidationResult} Validation results
     */
    async validateTaskCompleteness(task) {
        try {
            const errors = [];
            const warnings = [];
            const suggestions = [];
            let score = 100;

            // Basic validation
            const basicValidation = task.validate();
            if (!basicValidation.isValid) {
                errors.push(...basicValidation.errors);
                score -= 20;
            }

            // Check for acceptance criteria
            if (!task.acceptanceCriteria || task.acceptanceCriteria.length === 0) {
                warnings.push('No acceptance criteria defined');
                suggestions.push('Add specific acceptance criteria to ensure task completion can be verified');
                score -= 10;
            }

            // Check for affected files
            if (!task.affectedFiles || task.affectedFiles.length === 0) {
                warnings.push('No affected files specified');
                suggestions.push('Identify specific files that will be modified to improve implementation clarity');
                score -= 5;
            }

            // Check for test strategy
            if (!task.testStrategy || task.testStrategy.trim() === '') {
                warnings.push('No test strategy defined');
                suggestions.push('Define a test strategy to ensure quality implementation');
                score -= 10;
            }

            // Check complexity score reasonableness
            if (task.complexityScore > 8) {
                warnings.push('High complexity score - consider breaking down further');
                suggestions.push('Tasks with complexity > 8 should be decomposed into smaller subtasks');
                score -= 5;
            }

            // Check for implementation notes
            if (!task.implementationNotes || task.implementationNotes.trim() === '') {
                suggestions.push('Add implementation notes to provide guidance for developers');
                score -= 5;
            }

            return new ValidationResult({
                isValid: errors.length === 0,
                errors,
                warnings,
                suggestions,
                score: Math.max(0, score)
            });
        } catch (error) {
            throw new Error(`Failed to validate task completeness: ${error.message}`);
        }
    }

    // Private helper methods

    _generateRequirementId(text) {
        const hash = this._simpleHash(text);
        const timestamp = Date.now().toString(36);
        return `req_${timestamp}_${hash}`;
    }

    _simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    _extractTitle(text, nlpResult) {
        // Try to extract title from NLP result first
        if (nlpResult.title) {
            return nlpResult.title;
        }

        // Extract first sentence or line as title
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
            let title = lines[0].trim();
            
            // Remove common prefixes
            title = title.replace(/^(implement|create|build|develop|add|fix|update|enhance)\s+/i, '');
            
            // Limit length
            if (title.length > 100) {
                title = title.substring(0, 97) + '...';
            }
            
            return title;
        }

        return 'Untitled Requirement';
    }

    _extractDescription(text, nlpResult) {
        if (nlpResult.description) {
            return nlpResult.description;
        }

        // Use the full text as description, cleaned up
        return text.trim();
    }

    _extractTechnicalSpecs(text, nlpResult) {
        const specs = [];
        
        // Look for technical keywords and patterns
        const technicalPatterns = [
            /API\s+endpoint/gi,
            /database\s+schema/gi,
            /interface\s+definition/gi,
            /class\s+\w+/gi,
            /function\s+\w+/gi,
            /component\s+\w+/gi,
            /service\s+\w+/gi,
            /module\s+\w+/gi
        ];

        technicalPatterns.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) {
                specs.push(...matches.map(match => match.trim()));
            }
        });

        return [...new Set(specs)]; // Remove duplicates
    }

    _extractBusinessRequirements(text, nlpResult) {
        const requirements = [];
        
        // Look for business-related keywords
        const businessPatterns = [
            /user\s+should\s+be\s+able\s+to\s+[^.]+/gi,
            /system\s+must\s+[^.]+/gi,
            /application\s+shall\s+[^.]+/gi,
            /requirement:\s*[^.]+/gi
        ];

        businessPatterns.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) {
                requirements.push(...matches.map(match => match.trim()));
            }
        });

        return [...new Set(requirements)];
    }

    _extractAcceptanceCriteria(text, nlpResult) {
        const criteria = [];
        
        // Look for acceptance criteria patterns
        const criteriaPatterns = [
            /given\s+[^,]+,\s+when\s+[^,]+,\s+then\s+[^.]+/gi,
            /acceptance\s+criteria:\s*[^.]+/gi,
            /verify\s+that\s+[^.]+/gi,
            /ensure\s+that\s+[^.]+/gi,
            /confirm\s+that\s+[^.]+/gi
        ];

        criteriaPatterns.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) {
                criteria.push(...matches.map(match => match.trim()));
            }
        });

        return [...new Set(criteria)];
    }

    _estimateInitialComplexity(text, nlpResult) {
        let complexity = 1;
        
        // Increase complexity based on text length
        if (text.length > 1000) complexity += 2;
        else if (text.length > 500) complexity += 1;
        
        // Increase complexity based on technical terms
        const technicalTerms = ['API', 'database', 'integration', 'authentication', 'security', 'performance'];
        const foundTerms = technicalTerms.filter(term => 
            text.toLowerCase().includes(term.toLowerCase())
        );
        complexity += foundTerms.length;
        
        // Increase complexity based on number of requirements
        const requirements = this._extractBusinessRequirements(text, nlpResult);
        complexity += Math.floor(requirements.length / 2);
        
        return Math.min(10, Math.max(1, complexity));
    }

    _determinePriority(text, nlpResult) {
        const urgentKeywords = ['urgent', 'critical', 'asap', 'immediately', 'high priority'];
        const lowKeywords = ['nice to have', 'optional', 'future', 'low priority'];
        
        const lowerText = text.toLowerCase();
        
        if (urgentKeywords.some(keyword => lowerText.includes(keyword))) {
            return 'high';
        }
        
        if (lowKeywords.some(keyword => lowerText.includes(keyword))) {
            return 'low';
        }
        
        return this.options.defaultPriority;
    }

    _extractTags(text, nlpResult) {
        const tags = [];
        
        // Extract technology tags
        const techTags = ['javascript', 'python', 'react', 'node.js', 'api', 'database', 'frontend', 'backend'];
        techTags.forEach(tag => {
            if (text.toLowerCase().includes(tag)) {
                tags.push(tag);
            }
        });
        
        // Extract domain tags
        const domainTags = ['authentication', 'security', 'performance', 'ui', 'ux', 'testing'];
        domainTags.forEach(tag => {
            if (text.toLowerCase().includes(tag)) {
                tags.push(tag);
            }
        });
        
        return [...new Set(tags)];
    }

    _analyzeDependencyBetweenTasks(task1, task2) {
        // Simple heuristic: check if task1 affects files that task2 depends on
        const task1Files = new Set(task1.affectedFiles);
        const task2Files = new Set(task2.affectedFiles);
        
        // Check for file overlap
        const hasFileOverlap = [...task1Files].some(file => task2Files.has(file));
        
        // Check for explicit dependencies
        const hasExplicitDependency = task2.dependencies.includes(task1.id);
        
        return {
            exists: hasFileOverlap || hasExplicitDependency,
            type: hasExplicitDependency ? 'explicit' : 'implicit',
            reason: hasFileOverlap ? 'file overlap' : 'explicit dependency'
        };
    }

    _estimateTechnicalComplexity(task) {
        let complexity = 1;
        
        // Increase based on number of affected files
        complexity += Math.min(3, Math.floor(task.affectedFiles.length / 2));
        
        // Increase based on technical requirements
        const technicalKeywords = ['algorithm', 'optimization', 'performance', 'security', 'integration'];
        const description = task.description.toLowerCase();
        technicalKeywords.forEach(keyword => {
            if (description.includes(keyword)) complexity += 1;
        });
        
        return Math.min(10, complexity);
    }

    _estimateBusinessComplexity(task) {
        let complexity = 1;
        
        // Increase based on number of business requirements
        complexity += Math.min(3, Math.floor(task.requirements.length / 3));
        
        // Increase based on stakeholder impact
        const businessKeywords = ['user experience', 'workflow', 'process', 'compliance'];
        const description = task.description.toLowerCase();
        businessKeywords.forEach(keyword => {
            if (description.includes(keyword)) complexity += 1;
        });
        
        return Math.min(10, complexity);
    }

    _estimateIntegrationComplexity(task) {
        let complexity = 1;
        
        // Increase based on external dependencies
        const integrationKeywords = ['api', 'service', 'external', 'third-party', 'integration'];
        const description = task.description.toLowerCase();
        integrationKeywords.forEach(keyword => {
            if (description.includes(keyword)) complexity += 1;
        });
        
        return Math.min(10, complexity);
    }

    _estimateTestingComplexity(task) {
        let complexity = 1;
        
        // Increase based on testing requirements
        if (task.testStrategy && task.testStrategy.length > 100) complexity += 2;
        
        // Increase based on acceptance criteria
        complexity += Math.min(2, Math.floor(task.acceptanceCriteria.length / 3));
        
        return Math.min(10, complexity);
    }

    _estimateDocumentationComplexity(task) {
        let complexity = 1;
        
        // Increase based on public interfaces
        const docKeywords = ['api', 'interface', 'public', 'documentation'];
        const description = task.description.toLowerCase();
        docKeywords.forEach(keyword => {
            if (description.includes(keyword)) complexity += 1;
        });
        
        return Math.min(10, complexity);
    }

    async _analyzeCodebaseContext(task) {
        // Mock implementation - in real system, this would analyze the actual codebase
        return {
            relatedFiles: task.affectedFiles,
            dependencies: task.dependencies,
            interfaces: [],
            patterns: []
        };
    }

    _identifyTechnicalConstraints(task) {
        const constraints = [];
        
        // Extract constraints from task description
        const constraintKeywords = ['must use', 'cannot use', 'required to', 'limited to'];
        constraintKeywords.forEach(keyword => {
            const regex = new RegExp(`${keyword}\\s+([^.]+)`, 'gi');
            const matches = task.description.match(regex);
            if (matches) {
                constraints.push(...matches);
            }
        });
        
        return constraints;
    }

    _extractBusinessContext(task) {
        return {
            stakeholders: [],
            businessValue: task.priority,
            timeline: task.estimatedHours ? `${task.estimatedHours} hours` : 'TBD',
            impact: task.complexityScore > 5 ? 'high' : 'medium'
        };
    }

    _findRelatedTasks(task) {
        // Mock implementation - would search for related tasks in real system
        return [];
    }

    _identifyExternalDependencies(task) {
        const dependencies = [];
        
        // Look for external service mentions
        const externalPatterns = [
            /third[- ]party/gi,
            /external\s+api/gi,
            /service\s+\w+/gi,
            /library\s+\w+/gi
        ];

        externalPatterns.forEach(pattern => {
            const matches = task.description.match(pattern);
            if (matches) {
                dependencies.push(...matches);
            }
        });
        
        return [...new Set(dependencies)];
    }

    _assessRiskFactors(task) {
        const risks = [];
        
        if (task.complexityScore > 7) {
            risks.push('High complexity may lead to implementation delays');
        }
        
        if (task.affectedFiles.length > 10) {
            risks.push('Large number of affected files increases risk of conflicts');
        }
        
        if (task.dependencies.length > 5) {
            risks.push('Many dependencies may cause blocking issues');
        }
        
        return risks;
    }

    _defineSuccessMetrics(task) {
        const metrics = [];
        
        // Add metrics based on acceptance criteria
        task.acceptanceCriteria.forEach(criteria => {
            metrics.push(`Verify: ${criteria}`);
        });
        
        // Add default metrics
        metrics.push('All tests pass');
        metrics.push('Code review approved');
        metrics.push('No regression in existing functionality');
        
        return metrics;
    }

    async _analyzeFileComponent(filePath, task) {
        // Mock implementation - would analyze actual file in real system
        return new Component({
            name: filePath.split('/').pop(),
            type: 'file',
            path: filePath,
            dependencies: [],
            interfaces: [],
            complexity: 1
        });
    }

    _extractMentionedComponents(task) {
        const components = [];
        
        // Look for component mentions in description
        const componentPatterns = [
            /component\s+(\w+)/gi,
            /service\s+(\w+)/gi,
            /module\s+(\w+)/gi,
            /class\s+(\w+)/gi
        ];

        componentPatterns.forEach(pattern => {
            const matches = [...task.description.matchAll(pattern)];
            matches.forEach(match => {
                components.push(new Component({
                    name: match[1],
                    type: pattern.source.split('\\')[0],
                    path: `unknown/${match[1]}`,
                    dependencies: [],
                    interfaces: [],
                    complexity: 1
                }));
            });
        });
        
        return components;
    }

    _deduplicateComponents(components) {
        const seen = new Set();
        return components.filter(component => {
            const key = `${component.type}:${component.name}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }
}

// Export convenience functions for direct use
export async function parseNaturalLanguageRequirement(text, options = {}) {
    const analyzer = new RequirementAnalyzer(options);
    return await analyzer.parseRequirements(text);
}

export async function decomposeIntoAtomicTasks(requirement, options = {}) {
    const analyzer = new RequirementAnalyzer(options);
    return await analyzer.decomposeTask(requirement);
}

export async function analyzeTaskDependencies(tasks, options = {}) {
    const analyzer = new RequirementAnalyzer(options);
    return await analyzer.analyzeDependencies(tasks);
}

export async function estimateTaskComplexity(task, options = {}) {
    const analyzer = new RequirementAnalyzer(options);
    return await analyzer.estimateComplexity(task);
}

export async function generateCodegenPrompt(task, options = {}) {
    const analyzer = new RequirementAnalyzer(options);
    return await analyzer.generateCodegenPrompt(task);
}

export async function extractAffectedComponents(task, options = {}) {
    const analyzer = new RequirementAnalyzer(options);
    return await analyzer.extractAffectedComponents(task);
}

export async function validateTaskCompleteness(task, options = {}) {
    const analyzer = new RequirementAnalyzer(options);
    return await analyzer.validateTaskCompleteness(task);
}

