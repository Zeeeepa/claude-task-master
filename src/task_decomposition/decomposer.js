/**
 * Task Decomposition Engine
 * Breaks complex requirements into atomic, implementable tasks
 */

import { AtomicTask } from '../requirement_analyzer/types.js';

/**
 * Task Decomposer for breaking down requirements into atomic tasks
 */
export class TaskDecomposer {
    constructor(options = {}) {
        this.options = {
            maxTaskComplexity: 5,
            minTaskComplexity: 1,
            maxTasksPerRequirement: 20,
            enableSubtaskGeneration: true,
            enableFileAnalysis: true,
            enableDependencyInference: true,
            ...options
        };

        // Initialize decomposition strategies
        this.strategies = this._initializeStrategies();
    }

    /**
     * Decomposes a requirement into atomic tasks
     * @param {ParsedRequirement} requirement - The requirement to decompose
     * @returns {Array<AtomicTask>} List of atomic tasks
     */
    async decompose(requirement) {
        try {
            // Analyze requirement complexity and structure
            const analysis = this._analyzeRequirement(requirement);
            
            // Select appropriate decomposition strategy
            const strategy = this._selectStrategy(analysis);
            
            // Apply decomposition strategy
            const tasks = await this._applyStrategy(requirement, strategy, analysis);
            
            // Post-process tasks
            const processedTasks = this._postProcessTasks(tasks, requirement);
            
            // Validate task decomposition
            this._validateDecomposition(processedTasks, requirement);
            
            return processedTasks;
        } catch (error) {
            throw new Error(`Task decomposition failed: ${error.message}`);
        }
    }

    /**
     * Analyzes requirement to determine decomposition approach
     * @param {ParsedRequirement} requirement - The requirement to analyze
     * @returns {Object} Analysis results
     */
    _analyzeRequirement(requirement) {
        const analysis = {
            complexity: requirement.estimatedComplexity,
            type: this._determineRequirementType(requirement),
            scope: this._determineScope(requirement),
            technicalAreas: this._identifyTechnicalAreas(requirement),
            businessAreas: this._identifyBusinessAreas(requirement),
            dependencies: this._identifyDependencies(requirement),
            estimatedTaskCount: this._estimateTaskCount(requirement)
        };

        return analysis;
    }

    /**
     * Selects the best decomposition strategy based on analysis
     * @param {Object} analysis - Requirement analysis
     * @returns {string} Strategy name
     */
    _selectStrategy(analysis) {
        // High complexity requirements need hierarchical decomposition
        if (analysis.complexity > 7) {
            return 'hierarchical';
        }

        // Feature-based decomposition for functional requirements
        if (analysis.type === 'functional' && analysis.scope === 'large') {
            return 'feature-based';
        }

        // Layer-based decomposition for architectural changes
        if (analysis.technicalAreas.length > 3) {
            return 'layer-based';
        }

        // Workflow-based decomposition for process requirements
        if (analysis.type === 'workflow' || analysis.businessAreas.length > 2) {
            return 'workflow-based';
        }

        // Simple linear decomposition for straightforward requirements
        return 'linear';
    }

    /**
     * Applies the selected decomposition strategy
     * @param {ParsedRequirement} requirement - The requirement
     * @param {string} strategy - Strategy to apply
     * @param {Object} analysis - Requirement analysis
     * @returns {Array<AtomicTask>} Generated tasks
     */
    async _applyStrategy(requirement, strategy, analysis) {
        const strategyMethod = this.strategies[strategy];
        if (!strategyMethod) {
            throw new Error(`Unknown decomposition strategy: ${strategy}`);
        }

        return await strategyMethod.call(this, requirement, analysis);
    }

    /**
     * Post-processes tasks to ensure quality and consistency
     * @param {Array<AtomicTask>} tasks - Generated tasks
     * @param {ParsedRequirement} requirement - Original requirement
     * @returns {Array<AtomicTask>} Processed tasks
     */
    _postProcessTasks(tasks, requirement) {
        let processedTasks = [...tasks];

        // Ensure unique IDs
        processedTasks = this._ensureUniqueIds(processedTasks);

        // Infer dependencies if enabled
        if (this.options.enableDependencyInference) {
            processedTasks = this._inferDependencies(processedTasks);
        }

        // Analyze affected files if enabled
        if (this.options.enableFileAnalysis) {
            processedTasks = this._analyzeAffectedFiles(processedTasks, requirement);
        }

        // Balance task complexity
        processedTasks = this._balanceComplexity(processedTasks);

        // Add parent requirement reference
        processedTasks.forEach(task => {
            task.parentRequirementId = requirement.id;
        });

        return processedTasks;
    }

    /**
     * Validates the decomposition results
     * @param {Array<AtomicTask>} tasks - Generated tasks
     * @param {ParsedRequirement} requirement - Original requirement
     */
    _validateDecomposition(tasks, requirement) {
        // Check task count limits
        if (tasks.length > this.options.maxTasksPerRequirement) {
            throw new Error(`Too many tasks generated: ${tasks.length} > ${this.options.maxTasksPerRequirement}`);
        }

        if (tasks.length === 0) {
            throw new Error('No tasks generated from requirement');
        }

        // Validate each task
        tasks.forEach((task, index) => {
            const validation = task.validate();
            if (!validation.isValid) {
                throw new Error(`Task ${index + 1} is invalid: ${validation.errors.join(', ')}`);
            }
        });

        // Check complexity distribution
        const avgComplexity = tasks.reduce((sum, task) => sum + task.complexityScore, 0) / tasks.length;
        if (avgComplexity > this.options.maxTaskComplexity) {
            console.warn(`Average task complexity (${avgComplexity}) exceeds recommended maximum (${this.options.maxTaskComplexity})`);
        }
    }

    // Decomposition strategies

    /**
     * Linear decomposition strategy - breaks requirement into sequential steps
     */
    async _linearStrategy(requirement, analysis) {
        const tasks = [];
        const steps = this._extractSequentialSteps(requirement);

        steps.forEach((step, index) => {
            const task = new AtomicTask({
                id: this._generateTaskId(requirement.id, index + 1),
                title: step.title,
                description: step.description,
                requirements: step.requirements || [],
                acceptanceCriteria: step.acceptanceCriteria || [],
                complexityScore: step.complexity || 2,
                dependencies: index > 0 ? [this._generateTaskId(requirement.id, index)] : [],
                priority: requirement.priority,
                tags: [...requirement.tags, 'linear-decomposition']
            });

            tasks.push(task);
        });

        return tasks;
    }

    /**
     * Hierarchical decomposition strategy - creates task hierarchy
     */
    async _hierarchicalStrategy(requirement, analysis) {
        const tasks = [];
        const hierarchy = this._buildTaskHierarchy(requirement, analysis);

        // Create main tasks
        hierarchy.mainTasks.forEach((mainTask, index) => {
            const task = new AtomicTask({
                id: this._generateTaskId(requirement.id, `main_${index + 1}`),
                title: mainTask.title,
                description: mainTask.description,
                requirements: mainTask.requirements || [],
                acceptanceCriteria: mainTask.acceptanceCriteria || [],
                complexityScore: mainTask.complexity || 4,
                dependencies: mainTask.dependencies || [],
                priority: requirement.priority,
                tags: [...requirement.tags, 'hierarchical-decomposition', 'main-task']
            });

            tasks.push(task);

            // Create subtasks if enabled
            if (this.options.enableSubtaskGeneration && mainTask.subtasks) {
                mainTask.subtasks.forEach((subtask, subIndex) => {
                    const subtaskObj = new AtomicTask({
                        id: this._generateTaskId(requirement.id, `sub_${index + 1}_${subIndex + 1}`),
                        title: subtask.title,
                        description: subtask.description,
                        requirements: subtask.requirements || [],
                        acceptanceCriteria: subtask.acceptanceCriteria || [],
                        complexityScore: subtask.complexity || 2,
                        dependencies: [task.id, ...(subtask.dependencies || [])],
                        priority: requirement.priority,
                        tags: [...requirement.tags, 'hierarchical-decomposition', 'subtask']
                    });

                    tasks.push(subtaskObj);
                });
            }
        });

        return tasks;
    }

    /**
     * Feature-based decomposition strategy - organizes by features
     */
    async _featureBasedStrategy(requirement, analysis) {
        const tasks = [];
        const features = this._identifyFeatures(requirement, analysis);

        features.forEach((feature, index) => {
            // Create feature implementation task
            const implementationTask = new AtomicTask({
                id: this._generateTaskId(requirement.id, `feature_${index + 1}_impl`),
                title: `Implement ${feature.name}`,
                description: feature.description,
                requirements: feature.requirements || [],
                acceptanceCriteria: feature.acceptanceCriteria || [],
                complexityScore: feature.complexity || 3,
                dependencies: feature.dependencies || [],
                priority: requirement.priority,
                tags: [...requirement.tags, 'feature-based', 'implementation']
            });

            tasks.push(implementationTask);

            // Create feature testing task
            const testingTask = new AtomicTask({
                id: this._generateTaskId(requirement.id, `feature_${index + 1}_test`),
                title: `Test ${feature.name}`,
                description: `Create and execute tests for ${feature.name}`,
                requirements: [`Tests for ${feature.name} functionality`],
                acceptanceCriteria: [`All tests pass for ${feature.name}`],
                complexityScore: Math.max(1, Math.floor(feature.complexity / 2)),
                dependencies: [implementationTask.id],
                priority: requirement.priority,
                tags: [...requirement.tags, 'feature-based', 'testing']
            });

            tasks.push(testingTask);
        });

        return tasks;
    }

    /**
     * Layer-based decomposition strategy - organizes by architectural layers
     */
    async _layerBasedStrategy(requirement, analysis) {
        const tasks = [];
        const layers = this._identifyArchitecturalLayers(requirement, analysis);

        layers.forEach((layer, index) => {
            const task = new AtomicTask({
                id: this._generateTaskId(requirement.id, `layer_${layer.name.toLowerCase()}`),
                title: `${layer.name} Layer Changes`,
                description: layer.description,
                requirements: layer.requirements || [],
                acceptanceCriteria: layer.acceptanceCriteria || [],
                affectedFiles: layer.affectedFiles || [],
                complexityScore: layer.complexity || 3,
                dependencies: layer.dependencies || [],
                priority: requirement.priority,
                tags: [...requirement.tags, 'layer-based', layer.name.toLowerCase()]
            });

            tasks.push(task);
        });

        return tasks;
    }

    /**
     * Workflow-based decomposition strategy - follows business workflow
     */
    async _workflowBasedStrategy(requirement, analysis) {
        const tasks = [];
        const workflowSteps = this._identifyWorkflowSteps(requirement, analysis);

        workflowSteps.forEach((step, index) => {
            const task = new AtomicTask({
                id: this._generateTaskId(requirement.id, `workflow_${index + 1}`),
                title: step.title,
                description: step.description,
                requirements: step.requirements || [],
                acceptanceCriteria: step.acceptanceCriteria || [],
                complexityScore: step.complexity || 2,
                dependencies: step.dependencies || [],
                priority: requirement.priority,
                tags: [...requirement.tags, 'workflow-based', `step-${index + 1}`]
            });

            tasks.push(task);
        });

        return tasks;
    }

    // Helper methods for requirement analysis

    _determineRequirementType(requirement) {
        const description = requirement.description.toLowerCase();
        
        if (description.includes('workflow') || description.includes('process')) {
            return 'workflow';
        }
        
        if (description.includes('feature') || description.includes('functionality')) {
            return 'functional';
        }
        
        if (description.includes('performance') || description.includes('security')) {
            return 'non-functional';
        }
        
        if (description.includes('architecture') || description.includes('design')) {
            return 'architectural';
        }
        
        return 'general';
    }

    _determineScope(requirement) {
        const wordCount = requirement.description.split(/\s+/).length;
        const complexity = requirement.estimatedComplexity;
        
        if (wordCount > 500 || complexity > 7) return 'large';
        if (wordCount > 200 || complexity > 4) return 'medium';
        return 'small';
    }

    _identifyTechnicalAreas(requirement) {
        const areas = [];
        const description = requirement.description.toLowerCase();
        
        const areaKeywords = {
            'frontend': ['ui', 'interface', 'component', 'react', 'vue', 'angular'],
            'backend': ['api', 'server', 'service', 'endpoint', 'controller'],
            'database': ['database', 'table', 'schema', 'migration', 'query'],
            'authentication': ['auth', 'login', 'security', 'permission', 'role'],
            'testing': ['test', 'testing', 'unit test', 'integration test'],
            'deployment': ['deploy', 'deployment', 'ci/cd', 'pipeline', 'docker']
        };

        Object.entries(areaKeywords).forEach(([area, keywords]) => {
            if (keywords.some(keyword => description.includes(keyword))) {
                areas.push(area);
            }
        });

        return areas;
    }

    _identifyBusinessAreas(requirement) {
        const areas = [];
        const description = requirement.description.toLowerCase();
        
        const businessKeywords = {
            'user-management': ['user', 'account', 'profile', 'registration'],
            'content-management': ['content', 'article', 'post', 'media'],
            'e-commerce': ['order', 'payment', 'cart', 'checkout', 'product'],
            'reporting': ['report', 'analytics', 'dashboard', 'metrics'],
            'communication': ['notification', 'email', 'message', 'alert']
        };

        Object.entries(businessKeywords).forEach(([area, keywords]) => {
            if (keywords.some(keyword => description.includes(keyword))) {
                areas.push(area);
            }
        });

        return areas;
    }

    _identifyDependencies(requirement) {
        // Extract explicit dependencies from requirement text
        const dependencies = [];
        const description = requirement.description;
        
        // Look for dependency patterns
        const dependencyPatterns = [
            /depends on ([^.]+)/gi,
            /requires ([^.]+)/gi,
            /after ([^.]+)/gi,
            /prerequisite[:\s]+([^.]+)/gi
        ];

        dependencyPatterns.forEach(pattern => {
            const matches = [...description.matchAll(pattern)];
            dependencies.push(...matches.map(match => match[1].trim()));
        });

        return dependencies;
    }

    _estimateTaskCount(requirement) {
        const complexity = requirement.estimatedComplexity;
        const wordCount = requirement.description.split(/\s+/).length;
        
        let taskCount = Math.max(1, Math.floor(complexity / 2));
        
        // Adjust based on content length
        if (wordCount > 500) taskCount += 2;
        else if (wordCount > 200) taskCount += 1;
        
        return Math.min(taskCount, this.options.maxTasksPerRequirement);
    }

    // Helper methods for task generation

    _extractSequentialSteps(requirement) {
        const steps = [];
        const description = requirement.description;
        
        // Look for numbered steps
        const numberedSteps = description.match(/\d+\.\s*([^.]+)/g);
        if (numberedSteps && numberedSteps.length > 1) {
            numberedSteps.forEach((step, index) => {
                steps.push({
                    title: `Step ${index + 1}: ${step.replace(/^\d+\.\s*/, '')}`,
                    description: step.replace(/^\d+\.\s*/, ''),
                    complexity: 2
                });
            });
            return steps;
        }

        // Look for bullet points
        const bulletPoints = description.match(/[-*]\s*([^.]+)/g);
        if (bulletPoints && bulletPoints.length > 1) {
            bulletPoints.forEach((point, index) => {
                steps.push({
                    title: `Task ${index + 1}: ${point.replace(/^[-*]\s*/, '')}`,
                    description: point.replace(/^[-*]\s*/, ''),
                    complexity: 2
                });
            });
            return steps;
        }

        // Default decomposition based on sentences
        const sentences = description.split(/[.!?]+/).filter(s => s.trim().length > 20);
        sentences.forEach((sentence, index) => {
            if (index < 5) { // Limit to 5 steps
                steps.push({
                    title: `Task ${index + 1}: ${sentence.trim().substring(0, 50)}...`,
                    description: sentence.trim(),
                    complexity: 2
                });
            }
        });

        return steps.length > 0 ? steps : [{
            title: 'Implement Requirement',
            description: requirement.description,
            complexity: requirement.estimatedComplexity
        }];
    }

    _buildTaskHierarchy(requirement, analysis) {
        const hierarchy = {
            mainTasks: []
        };

        // Create main tasks based on technical areas
        analysis.technicalAreas.forEach(area => {
            const mainTask = {
                title: `${area.charAt(0).toUpperCase() + area.slice(1)} Implementation`,
                description: `Implement ${area} components for the requirement`,
                complexity: Math.max(3, Math.floor(requirement.estimatedComplexity / 2)),
                subtasks: []
            };

            // Add subtasks for complex main tasks
            if (mainTask.complexity > 4) {
                mainTask.subtasks = [
                    {
                        title: `Design ${area} Architecture`,
                        description: `Design the architecture for ${area} components`,
                        complexity: 2
                    },
                    {
                        title: `Implement ${area} Core`,
                        description: `Implement core ${area} functionality`,
                        complexity: 3
                    },
                    {
                        title: `Test ${area} Implementation`,
                        description: `Create and run tests for ${area} implementation`,
                        complexity: 2
                    }
                ];
            }

            hierarchy.mainTasks.push(mainTask);
        });

        // If no technical areas identified, create generic hierarchy
        if (hierarchy.mainTasks.length === 0) {
            hierarchy.mainTasks = [
                {
                    title: 'Design and Planning',
                    description: 'Design the solution architecture and create implementation plan',
                    complexity: 3,
                    subtasks: [
                        {
                            title: 'Analyze Requirements',
                            description: 'Analyze and break down the requirements',
                            complexity: 2
                        },
                        {
                            title: 'Design Solution',
                            description: 'Design the technical solution',
                            complexity: 2
                        }
                    ]
                },
                {
                    title: 'Implementation',
                    description: 'Implement the designed solution',
                    complexity: Math.max(3, requirement.estimatedComplexity - 2),
                    subtasks: [
                        {
                            title: 'Core Implementation',
                            description: 'Implement the core functionality',
                            complexity: 3
                        },
                        {
                            title: 'Integration',
                            description: 'Integrate with existing systems',
                            complexity: 2
                        }
                    ]
                },
                {
                    title: 'Testing and Validation',
                    description: 'Test the implementation and validate requirements',
                    complexity: 2,
                    subtasks: [
                        {
                            title: 'Unit Testing',
                            description: 'Create and run unit tests',
                            complexity: 2
                        },
                        {
                            title: 'Integration Testing',
                            description: 'Test integration with existing systems',
                            complexity: 2
                        }
                    ]
                }
            ];
        }

        return hierarchy;
    }

    _identifyFeatures(requirement, analysis) {
        const features = [];
        const description = requirement.description;

        // Look for feature keywords
        const featurePatterns = [
            /feature[:\s]+([^.]+)/gi,
            /functionality[:\s]+([^.]+)/gi,
            /capability[:\s]+([^.]+)/gi
        ];

        featurePatterns.forEach(pattern => {
            const matches = [...description.matchAll(pattern)];
            matches.forEach(match => {
                features.push({
                    name: match[1].trim(),
                    description: `Implement ${match[1].trim()} functionality`,
                    complexity: 3
                });
            });
        });

        // If no explicit features found, create based on business areas
        if (features.length === 0) {
            analysis.businessAreas.forEach(area => {
                features.push({
                    name: area.replace('-', ' '),
                    description: `Implement ${area.replace('-', ' ')} functionality`,
                    complexity: 3
                });
            });
        }

        // Default feature if none identified
        if (features.length === 0) {
            features.push({
                name: 'Core Functionality',
                description: requirement.description,
                complexity: requirement.estimatedComplexity
            });
        }

        return features;
    }

    _identifyArchitecturalLayers(requirement, analysis) {
        const layers = [];
        const standardLayers = ['presentation', 'business', 'data', 'integration'];

        standardLayers.forEach(layerName => {
            if (analysis.technicalAreas.some(area => this._layerContainsArea(layerName, area))) {
                layers.push({
                    name: layerName.charAt(0).toUpperCase() + layerName.slice(1),
                    description: `Implement changes in the ${layerName} layer`,
                    complexity: 3,
                    affectedFiles: this._getLayerFiles(layerName)
                });
            }
        });

        return layers.length > 0 ? layers : [{
            name: 'Application',
            description: 'Implement application-level changes',
            complexity: requirement.estimatedComplexity,
            affectedFiles: []
        }];
    }

    _identifyWorkflowSteps(requirement, analysis) {
        const steps = [];
        const description = requirement.description;

        // Look for workflow step patterns
        const stepPatterns = [
            /step\s+\d+[:\s]+([^.]+)/gi,
            /phase\s+\d+[:\s]+([^.]+)/gi,
            /stage\s+\d+[:\s]+([^.]+)/gi
        ];

        stepPatterns.forEach(pattern => {
            const matches = [...description.matchAll(pattern)];
            matches.forEach((match, index) => {
                steps.push({
                    title: `Workflow Step ${index + 1}`,
                    description: match[1].trim(),
                    complexity: 2
                });
            });
        });

        // Default workflow if none identified
        if (steps.length === 0) {
            steps.push(
                {
                    title: 'Initialize Workflow',
                    description: 'Set up the workflow infrastructure',
                    complexity: 2
                },
                {
                    title: 'Implement Core Logic',
                    description: 'Implement the main workflow logic',
                    complexity: Math.max(3, requirement.estimatedComplexity - 1)
                },
                {
                    title: 'Finalize Workflow',
                    description: 'Complete and test the workflow',
                    complexity: 2
                }
            );
        }

        return steps;
    }

    // Post-processing helper methods

    _ensureUniqueIds(tasks) {
        const usedIds = new Set();
        return tasks.map(task => {
            let uniqueId = task.id;
            let counter = 1;
            
            while (usedIds.has(uniqueId)) {
                uniqueId = `${task.id}_${counter}`;
                counter++;
            }
            
            usedIds.add(uniqueId);
            task.id = uniqueId;
            return task;
        });
    }

    _inferDependencies(tasks) {
        // Simple dependency inference based on task names and descriptions
        tasks.forEach(task => {
            tasks.forEach(otherTask => {
                if (task.id !== otherTask.id && this._shouldDependOn(task, otherTask)) {
                    if (!task.dependencies.includes(otherTask.id)) {
                        task.dependencies.push(otherTask.id);
                    }
                }
            });
        });

        return tasks;
    }

    _analyzeAffectedFiles(tasks, requirement) {
        // Mock file analysis - in real implementation, this would analyze the codebase
        tasks.forEach(task => {
            if (task.affectedFiles.length === 0) {
                task.affectedFiles = this._inferAffectedFiles(task, requirement);
            }
        });

        return tasks;
    }

    _balanceComplexity(tasks) {
        return tasks.map(task => {
            // Ensure complexity is within bounds
            task.complexityScore = Math.max(
                this.options.minTaskComplexity,
                Math.min(this.options.maxTaskComplexity, task.complexityScore)
            );
            return task;
        });
    }

    // Utility methods

    _generateTaskId(requirementId, suffix) {
        return `${requirementId}_task_${suffix}`;
    }

    _layerContainsArea(layer, area) {
        const layerMappings = {
            'presentation': ['frontend', 'ui', 'interface'],
            'business': ['backend', 'service', 'logic'],
            'data': ['database', 'storage', 'persistence'],
            'integration': ['api', 'external', 'integration']
        };

        return layerMappings[layer]?.includes(area) || false;
    }

    _getLayerFiles(layer) {
        // Mock implementation - would return actual files in real system
        const layerFiles = {
            'presentation': ['src/components/', 'src/pages/', 'src/ui/'],
            'business': ['src/services/', 'src/controllers/', 'src/logic/'],
            'data': ['src/models/', 'src/repositories/', 'src/database/'],
            'integration': ['src/api/', 'src/integrations/', 'src/external/']
        };

        return layerFiles[layer] || [];
    }

    _shouldDependOn(task, otherTask) {
        // Simple heuristic: testing tasks depend on implementation tasks
        if (task.title.toLowerCase().includes('test') && 
            otherTask.title.toLowerCase().includes('implement')) {
            return true;
        }

        // Design tasks should come before implementation
        if (task.title.toLowerCase().includes('implement') && 
            otherTask.title.toLowerCase().includes('design')) {
            return true;
        }

        return false;
    }

    _inferAffectedFiles(task, requirement) {
        const files = [];
        const description = task.description.toLowerCase();

        // Infer files based on task content
        if (description.includes('frontend') || description.includes('ui')) {
            files.push('src/components/', 'src/pages/');
        }

        if (description.includes('backend') || description.includes('api')) {
            files.push('src/api/', 'src/controllers/');
        }

        if (description.includes('database') || description.includes('model')) {
            files.push('src/models/', 'src/database/');
        }

        if (description.includes('test')) {
            files.push('tests/', 'src/__tests__/');
        }

        return files;
    }

    _initializeStrategies() {
        return {
            'linear': this._linearStrategy,
            'hierarchical': this._hierarchicalStrategy,
            'feature-based': this._featureBasedStrategy,
            'layer-based': this._layerBasedStrategy,
            'workflow-based': this._workflowBasedStrategy
        };
    }
}

