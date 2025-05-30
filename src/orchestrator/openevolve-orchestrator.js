/**
 * @fileoverview OpenEvolve Central Orchestrator
 * @description The intelligent brain of the entire CICD system that performs comprehensive 
 * feature analysis, atomic task decomposition, dependency mapping, and coordinates all 
 * system components for autonomous development workflows.
 */

import { log } from '../../scripts/modules/utils.js';
import { AIAnalysisEngine } from './ai-analysis-engine.js';
import { TaskDecomposer } from './task-decomposer.js';
import { DependencyMapper } from './dependency-mapper.js';
import { WorkflowMonitor } from './workflow-monitor.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * OpenEvolve Central Orchestrator
 * Serves as the intelligent brain of the entire CICD system
 */
export class OpenEvolveOrchestrator {
    constructor(database, linearClient, codegenClient, claudeCodeClient) {
        this.db = database;
        this.linear = linearClient;
        this.codegen = codegenClient;
        this.claudeCode = claudeCodeClient;
        
        // Initialize AI components
        this.analysisEngine = new AIAnalysisEngine();
        this.taskDecomposer = new TaskDecomposer();
        this.dependencyMapper = new DependencyMapper();
        this.workflowMonitor = new WorkflowMonitor(this);
        
        // Internal state
        this.activeWorkflows = new Map();
        this.isInitialized = false;
        
        log('debug', 'OpenEvolve Orchestrator initialized');
    }

    /**
     * Initialize the orchestrator and all its components
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        log('info', 'Initializing OpenEvolve Central Orchestrator...');
        
        try {
            // Initialize all AI components
            await this.analysisEngine.initialize();
            await this.taskDecomposer.initialize();
            await this.dependencyMapper.initialize();
            await this.workflowMonitor.initialize();
            
            this.isInitialized = true;
            log('info', 'OpenEvolve Central Orchestrator initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize OpenEvolve Orchestrator:', error);
            throw error;
        }
    }

    /**
     * Process high-level requirements into autonomous workflow
     * @param {string} requirementText - The requirement text to process
     * @param {Object} projectContext - Project context information
     * @returns {Promise<Object>} Complete workflow object
     */
    async processRequirement(requirementText, projectContext = {}) {
        this._ensureInitialized();
        
        log('info', 'Processing requirement:', { 
            requirementLength: requirementText.length,
            projectId: projectContext.projectId 
        });

        try {
            // Phase 1: Intelligent Analysis
            log('debug', 'Phase 1: Starting intelligent analysis...');
            const analysis = await this.analysisEngine.analyzeRequirement(requirementText, projectContext);
            
            // Phase 2: Task Decomposition
            log('debug', 'Phase 2: Starting task decomposition...');
            const tasks = await this.taskDecomposer.decompose(analysis);
            
            // Phase 3: Dependency Mapping
            log('debug', 'Phase 3: Starting dependency mapping...');
            const dependencyGraph = await this.dependencyMapper.mapDependencies(tasks);
            
            // Phase 4: Execution Planning
            log('debug', 'Phase 4: Creating execution plan...');
            const executionPlan = await this.createExecutionPlan(dependencyGraph, analysis);
            
            // Phase 5: Workflow Initiation
            log('debug', 'Phase 5: Initiating workflow...');
            const workflow = await this.initiateWorkflow(executionPlan, analysis);
            
            log('info', 'Requirement processing completed successfully', {
                workflowId: workflow.workflow.id,
                taskCount: tasks.length,
                phases: executionPlan.phases.length
            });
            
            return workflow;
        } catch (error) {
            log('error', 'Failed to process requirement:', error);
            throw error;
        }
    }

    /**
     * Create execution plan with optimal task ordering
     * @param {Object} dependencyGraph - Task dependency graph
     * @param {Object} analysis - Analysis results
     * @returns {Promise<Object>} Execution plan
     */
    async createExecutionPlan(dependencyGraph, analysis) {
        const plan = {
            id: this.generatePlanId(),
            title: this._extractTitleFromAnalysis(analysis),
            phases: [],
            totalTasks: dependencyGraph.nodes.length,
            estimatedDuration: 0,
            parallelizable: [],
            createdAt: new Date(),
            analysis: analysis
        };

        try {
            // Topological sort for dependency ordering
            const sortedTasks = this.topologicalSort(dependencyGraph);
            
            // Group tasks into parallel execution phases
            const phases = this.groupIntoPhases(sortedTasks, dependencyGraph);
            
            plan.phases = phases;
            plan.estimatedDuration = this.calculateDuration(phases);
            plan.parallelizable = this.identifyParallelizableTasks(phases);
            
            log('debug', 'Execution plan created', {
                planId: plan.id,
                phases: plan.phases.length,
                totalTasks: plan.totalTasks,
                estimatedDuration: plan.estimatedDuration
            });
            
            return plan;
        } catch (error) {
            log('error', 'Failed to create execution plan:', error);
            throw error;
        }
    }

    /**
     * Initiate autonomous workflow
     * @param {Object} executionPlan - The execution plan
     * @param {Object} analysis - Analysis results
     * @returns {Promise<Object>} Workflow initiation result
     */
    async initiateWorkflow(executionPlan, analysis) {
        try {
            // Create workflow in database
            const workflow = await this.db.createWorkflow({
                planId: executionPlan.id,
                status: 'initiated',
                phases: executionPlan.phases,
                currentPhase: 0,
                startTime: new Date(),
                analysis: analysis,
                metadata: {
                    totalTasks: executionPlan.totalTasks,
                    estimatedDuration: executionPlan.estimatedDuration,
                    createdBy: 'OpenEvolveOrchestrator'
                }
            });

            // Create Linear main issue
            const mainIssue = await this.linear.createIssue({
                title: `🚀 Autonomous Development: ${executionPlan.title}`,
                description: this.formatMainIssueDescription(executionPlan, analysis),
                priority: 1,
                labels: ['autonomous-development', 'openevolve']
            });

            // Create sub-issues for each task
            const subIssues = [];
            for (const phase of executionPlan.phases) {
                for (const task of phase.tasks) {
                    const subIssue = await this.linear.createIssue({
                        title: `📋 ${task.title}`,
                        description: this.formatSubIssueDescription(task, analysis),
                        parentId: mainIssue.id,
                        assigneeId: await this.getCodegenUserId(),
                        labels: task.tags || []
                    });
                    subIssues.push(subIssue);
                    
                    // Store task in database
                    await this.db.createTask({
                        ...task,
                        workflowId: workflow.id,
                        linearIssueId: subIssue.id,
                        status: 'pending',
                        createdBy: 'OpenEvolveOrchestrator'
                    });
                }
            }

            // Update workflow with Linear issue references
            await this.db.updateWorkflow(workflow.id, {
                mainIssueId: mainIssue.id,
                subIssueIds: subIssues.map(issue => issue.id)
            });

            // Start monitoring workflow
            this.workflowMonitor.monitorWorkflow(workflow.id);
            
            // Track active workflow
            this.activeWorkflows.set(workflow.id, {
                workflow,
                mainIssue,
                subIssues,
                executionPlan,
                startTime: Date.now()
            });

            log('info', 'Workflow initiated successfully', {
                workflowId: workflow.id,
                mainIssueId: mainIssue.id,
                subIssueCount: subIssues.length
            });

            return { workflow, mainIssue, subIssues };
        } catch (error) {
            log('error', 'Failed to initiate workflow:', error);
            throw error;
        }
    }

    /**
     * Topological sort for dependency ordering
     * @param {Object} dependencyGraph - The dependency graph
     * @returns {Array} Sorted tasks
     */
    topologicalSort(dependencyGraph) {
        const visited = new Set();
        const temp = new Set();
        const result = [];

        const visit = (nodeId) => {
            if (temp.has(nodeId)) {
                throw new Error('Circular dependency detected');
            }
            if (visited.has(nodeId)) {
                return;
            }

            temp.add(nodeId);
            
            // Visit all dependencies first
            const dependencies = dependencyGraph.edges
                .filter(edge => edge.to === nodeId)
                .map(edge => edge.from);
            
            for (const depId of dependencies) {
                visit(depId);
            }

            temp.delete(nodeId);
            visited.add(nodeId);
            
            const node = dependencyGraph.nodes.find(n => n.id === nodeId);
            if (node) {
                result.push(node.task);
            }
        };

        for (const node of dependencyGraph.nodes) {
            if (!visited.has(node.id)) {
                visit(node.id);
            }
        }

        return result;
    }

    /**
     * Group tasks into parallel execution phases
     * @param {Array} sortedTasks - Topologically sorted tasks
     * @param {Object} dependencyGraph - The dependency graph
     * @returns {Array} Execution phases
     */
    groupIntoPhases(sortedTasks, dependencyGraph) {
        const phases = [];
        const taskToPhase = new Map();
        
        for (const task of sortedTasks) {
            // Find dependencies of this task
            const dependencies = dependencyGraph.edges
                .filter(edge => edge.to === task.id)
                .map(edge => edge.from);
            
            // Determine the minimum phase this task can be in
            let minPhase = 0;
            for (const depId of dependencies) {
                const depPhase = taskToPhase.get(depId);
                if (depPhase !== undefined) {
                    minPhase = Math.max(minPhase, depPhase + 1);
                }
            }
            
            // Ensure we have enough phases
            while (phases.length <= minPhase) {
                phases.push({
                    phase: phases.length,
                    tasks: [],
                    estimatedDuration: 0,
                    canRunInParallel: true
                });
            }
            
            // Add task to the appropriate phase
            phases[minPhase].tasks.push(task);
            taskToPhase.set(task.id, minPhase);
        }
        
        // Calculate phase durations
        for (const phase of phases) {
            phase.estimatedDuration = Math.max(
                ...phase.tasks.map(task => task.estimatedEffort || 1)
            );
        }
        
        return phases;
    }

    /**
     * Calculate total execution duration
     * @param {Array} phases - Execution phases
     * @returns {number} Total duration in hours
     */
    calculateDuration(phases) {
        return phases.reduce((total, phase) => total + phase.estimatedDuration, 0);
    }

    /**
     * Identify parallelizable tasks within phases
     * @param {Array} phases - Execution phases
     * @returns {Array} Parallelizable task groups
     */
    identifyParallelizableTasks(phases) {
        const parallelizable = [];
        
        for (const phase of phases) {
            if (phase.tasks.length > 1) {
                parallelizable.push({
                    phase: phase.phase,
                    taskIds: phase.tasks.map(task => task.id),
                    maxConcurrency: Math.min(phase.tasks.length, 3) // Limit concurrency
                });
            }
        }
        
        return parallelizable;
    }

    /**
     * Format main issue description for Linear
     * @param {Object} executionPlan - The execution plan
     * @param {Object} analysis - Analysis results
     * @returns {string} Formatted description
     */
    formatMainIssueDescription(executionPlan, analysis) {
        return `# 🚀 Autonomous Development Workflow

## 📊 Analysis Summary
- **Features Identified**: ${analysis.insights.features?.length || 0}
- **Complexity Score**: ${analysis.insights.complexity?.overall || 'Unknown'}
- **Total Tasks**: ${executionPlan.totalTasks}
- **Estimated Duration**: ${executionPlan.estimatedDuration} hours
- **Execution Phases**: ${executionPlan.phases.length}

## 🎯 Requirements
${analysis.originalText}

## 📋 Execution Plan
${executionPlan.phases.map((phase, index) => 
    `### Phase ${index + 1} (${phase.estimatedDuration}h)
${phase.tasks.map(task => `- ${task.title}`).join('\n')}`
).join('\n\n')}

## 🔄 Workflow Status
- **Status**: Initiated
- **Created**: ${new Date().toISOString()}
- **Plan ID**: ${executionPlan.id}

---
*This workflow is managed by OpenEvolve Central Orchestrator*`;
    }

    /**
     * Format sub-issue description for Linear
     * @param {Object} task - The task object
     * @param {Object} analysis - Analysis results
     * @returns {string} Formatted description
     */
    formatSubIssueDescription(task, analysis) {
        return `# 📋 ${task.title}

## 📝 Description
${task.description}

## ✅ Acceptance Criteria
${task.acceptanceCriteria?.map(criteria => `- ${criteria.criteria}`).join('\n') || 'No specific criteria defined'}

## 🏷️ Task Details
- **Type**: ${task.type}
- **Priority**: ${task.priority}
- **Estimated Effort**: ${task.estimatedEffort || 'Unknown'} hours
- **Tags**: ${task.tags?.join(', ') || 'None'}

## 🔗 Dependencies
${task.dependencies?.length ? task.dependencies.map(dep => `- ${dep}`).join('\n') : 'No dependencies'}

## 📊 Context
${JSON.stringify(task.context || {}, null, 2)}

---
*Generated by OpenEvolve Central Orchestrator*`;
    }

    /**
     * Get Codegen user ID for task assignment
     * @returns {Promise<string>} Codegen user ID
     */
    async getCodegenUserId() {
        // This would typically query the Linear API to get the Codegen bot user ID
        // For now, return a placeholder that should be configured
        return process.env.CODEGEN_LINEAR_USER_ID || 'codegen-bot';
    }

    /**
     * Generate unique plan ID
     * @returns {string} Plan ID
     */
    generatePlanId() {
        return `plan-${uuidv4()}`;
    }

    /**
     * Extract title from analysis
     * @param {Object} analysis - Analysis results
     * @returns {string} Extracted title
     */
    _extractTitleFromAnalysis(analysis) {
        // Try to extract a meaningful title from the analysis
        if (analysis.insights.features?.length > 0) {
            const primaryFeature = analysis.insights.features[0];
            return primaryFeature.description || 'Development Task';
        }
        
        // Fallback to first few words of original text
        const words = analysis.originalText.split(' ').slice(0, 6);
        return words.join(' ') + (words.length === 6 ? '...' : '');
    }

    /**
     * Ensure orchestrator is initialized
     * @private
     */
    _ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('OpenEvolve Orchestrator not initialized. Call initialize() first.');
        }
    }

    /**
     * Get orchestrator statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            activeWorkflows: this.activeWorkflows.size,
            isInitialized: this.isInitialized,
            uptime: this.isInitialized ? Date.now() - this.initTime : 0
        };
    }

    /**
     * Shutdown the orchestrator
     */
    async shutdown() {
        log('info', 'Shutting down OpenEvolve Central Orchestrator...');
        
        // Stop monitoring all workflows
        await this.workflowMonitor.shutdown();
        
        // Clear active workflows
        this.activeWorkflows.clear();
        
        this.isInitialized = false;
        log('info', 'OpenEvolve Central Orchestrator shut down');
    }
}

export default OpenEvolveOrchestrator;

