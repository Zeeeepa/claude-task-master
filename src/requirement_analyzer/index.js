/**
 * Requirement Analyzer Module
 * Main entry point for the requirement analysis and task decomposition engine
 */

// Export core classes
export {
    RequirementAnalyzer,
    parseNaturalLanguageRequirement,
    decomposeIntoAtomicTasks,
    analyzeTaskDependencies,
    estimateTaskComplexity,
    generateCodegenPrompt,
    extractAffectedComponents,
    validateTaskCompleteness
} from './analyzer.js';

// Export data types
export {
    ParsedRequirement,
    AtomicTask,
    DependencyGraph,
    ComplexityScore,
    TaskContext,
    ValidationResult,
    Component,
    CodegenPrompt
} from './types.js';

// Export NLP processor
export { NLPProcessor } from '../nlp_engine/processor.js';

// Export task decomposer
export { TaskDecomposer } from '../task_decomposition/decomposer.js';

/**
 * Factory function to create a configured requirement analyzer
 * @param {Object} options - Configuration options
 * @returns {RequirementAnalyzer} Configured analyzer instance
 */
export function createRequirementAnalyzer(options = {}) {
    return new RequirementAnalyzer(options);
}

/**
 * Quick analysis function for simple use cases
 * @param {string} requirementText - The requirement text to analyze
 * @param {Object} options - Configuration options
 * @returns {Object} Complete analysis results
 */
export async function analyzeRequirement(requirementText, options = {}) {
    const analyzer = new RequirementAnalyzer(options);
    
    try {
        // Parse the requirement
        const parsedRequirement = await analyzer.parseRequirements(requirementText);
        
        // Decompose into tasks
        const tasks = await analyzer.decomposeTask(parsedRequirement);
        
        // Analyze dependencies
        const dependencyGraph = await analyzer.analyzeDependencies(tasks);
        
        // Generate complexity scores for each task
        const tasksWithComplexity = await Promise.all(
            tasks.map(async task => {
                const complexityScore = await analyzer.estimateComplexity(task);
                return {
                    ...task,
                    detailedComplexity: complexityScore
                };
            })
        );
        
        // Generate codegen prompts for each task
        const codegenPrompts = await Promise.all(
            tasksWithComplexity.map(task => analyzer.generateCodegenPrompt(task))
        );
        
        // Validate task completeness
        const validationResults = await Promise.all(
            tasksWithComplexity.map(task => analyzer.validateTaskCompleteness(task))
        );
        
        return {
            requirement: parsedRequirement,
            tasks: tasksWithComplexity,
            dependencyGraph,
            codegenPrompts,
            validationResults,
            summary: {
                totalTasks: tasks.length,
                averageComplexity: tasks.reduce((sum, task) => sum + task.complexityScore, 0) / tasks.length,
                highComplexityTasks: tasks.filter(task => task.complexityScore > 6).length,
                dependencyCount: dependencyGraph.edges.size,
                validTasks: validationResults.filter(result => result.isValid).length
            }
        };
    } catch (error) {
        throw new Error(`Requirement analysis failed: ${error.message}`);
    }
}

/**
 * Batch analysis function for multiple requirements
 * @param {Array<string>} requirementTexts - Array of requirement texts
 * @param {Object} options - Configuration options
 * @returns {Array<Object>} Array of analysis results
 */
export async function analyzeRequirements(requirementTexts, options = {}) {
    const results = [];
    
    for (const text of requirementTexts) {
        try {
            const result = await analyzeRequirement(text, options);
            results.push({
                success: true,
                result
            });
        } catch (error) {
            results.push({
                success: false,
                error: error.message,
                text: text.substring(0, 100) + '...'
            });
        }
    }
    
    return results;
}

/**
 * Utility function to merge multiple requirement analyses
 * @param {Array<Object>} analyses - Array of analysis results
 * @returns {Object} Merged analysis
 */
export function mergeAnalyses(analyses) {
    const merged = {
        requirements: [],
        tasks: [],
        dependencyGraph: new DependencyGraph(),
        codegenPrompts: [],
        validationResults: [],
        summary: {
            totalRequirements: analyses.length,
            totalTasks: 0,
            averageComplexity: 0,
            highComplexityTasks: 0,
            dependencyCount: 0,
            validTasks: 0
        }
    };
    
    analyses.forEach(analysis => {
        if (analysis.success) {
            merged.requirements.push(analysis.result.requirement);
            merged.tasks.push(...analysis.result.tasks);
            merged.codegenPrompts.push(...analysis.result.codegenPrompts);
            merged.validationResults.push(...analysis.result.validationResults);
            
            // Merge dependency graphs
            analysis.result.tasks.forEach(task => {
                merged.dependencyGraph.addTask(task);
            });
        }
    });
    
    // Update summary
    merged.summary.totalTasks = merged.tasks.length;
    merged.summary.averageComplexity = merged.tasks.length > 0 
        ? merged.tasks.reduce((sum, task) => sum + task.complexityScore, 0) / merged.tasks.length 
        : 0;
    merged.summary.highComplexityTasks = merged.tasks.filter(task => task.complexityScore > 6).length;
    merged.summary.dependencyCount = merged.dependencyGraph.edges.size;
    merged.summary.validTasks = merged.validationResults.filter(result => result.isValid).length;
    
    return merged;
}

// Default export
export default {
    RequirementAnalyzer,
    createRequirementAnalyzer,
    analyzeRequirement,
    analyzeRequirements,
    mergeAnalyses,
    parseNaturalLanguageRequirement,
    decomposeIntoAtomicTasks,
    analyzeTaskDependencies,
    estimateTaskComplexity,
    generateCodegenPrompt,
    extractAffectedComponents,
    validateTaskCompleteness
};

