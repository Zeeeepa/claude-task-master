import { StorageAdapter } from '../../../src/database/services/StorageAdapter.js';
import { DependencyService } from '../../../src/database/services/DependencyService.js';

/**
 * Check if a task is dependent on another task (directly or indirectly)
 * Used to prevent circular dependencies
 * @param {Array|string} allTasks - Array of all tasks OR path to tasks file
 * @param {Object|string|number} task - The task to check OR task ID
 * @param {number} targetTaskId - The task ID to check dependency against
 * @param {Object} [options] - Additional options
 * @param {string} [options.projectId] - Project ID for database storage
 * @returns {boolean|Promise<boolean>} Whether the task depends on the target task
 */
async function isTaskDependentOn(allTasks, task, targetTaskId, options = {}) {
	// Backward compatibility: if allTasks is an array, use legacy logic
	if (Array.isArray(allTasks)) {
		return _legacyIsTaskDependentOn(allTasks, task, targetTaskId);
	}

	// New path: allTasks parameter is actually tasksPath
	const tasksPath = allTasks;
	const taskId = typeof task === 'object' ? task.id : task;
	
	try {
		// Use dependency service for database-backed dependency checking
		const dependencyService = new DependencyService();
		const validationResult = await dependencyService.validateDependencyChain(taskId);
		
		// Check if adding this dependency would create a circular dependency
		// This is a simplified check - for full validation, we'd need to simulate adding the dependency
		const dependencies = await dependencyService.getDependencies(taskId);
		
		// Check direct dependencies
		const directDependency = dependencies.find(dep => dep.task_id === targetTaskId);
		if (directDependency) return true;
		
		// Check indirect dependencies recursively
		for (const dep of dependencies) {
			const isIndirectDependent = await isTaskDependentOn(tasksPath, dep.task_id, targetTaskId, options);
			if (isIndirectDependent) return true;
		}
		
		return false;
	} catch (error) {
		// Fallback to legacy behavior on error
		console.warn(`Dependency service failed, falling back to file-based dependency checking: ${error.message}`);
		const storageAdapter = new StorageAdapter();
		const data = await storageAdapter.readTasks(tasksPath, options.projectId);
		if (!data || !data.tasks) return false;
		
		const taskObj = typeof task === 'object' ? task : data.tasks.find(t => t.id === taskId);
		return _legacyIsTaskDependentOn(data.tasks, taskObj, targetTaskId);
	}
}

/**
 * Legacy dependency check for backward compatibility
 * @param {Array} allTasks - Array of all tasks
 * @param {Object} task - The task to check
 * @param {number} targetTaskId - The task ID to check dependency against
 * @returns {boolean} Whether the task depends on the target task
 */
function _legacyIsTaskDependentOn(allTasks, task, targetTaskId) {
	// If the task is a subtask, check if its parent is the target
	if (task.parentTaskId === targetTaskId) {
		return true;
	}

	// Check direct dependencies
	if (task.dependencies && task.dependencies.includes(targetTaskId)) {
		return true;
	}

	// Check dependencies of dependencies (recursive)
	if (task.dependencies) {
		for (const depId of task.dependencies) {
			const depTask = allTasks.find((t) => t.id === depId);
			if (depTask && isTaskDependentOn(allTasks, depTask, targetTaskId)) {
				return true;
			}
		}
	}

	// Check subtasks for dependencies
	if (task.subtasks) {
		for (const subtask of task.subtasks) {
			if (isTaskDependentOn(allTasks, subtask, targetTaskId)) {
				return true;
			}
		}
	}

	return false;
}

export default isTaskDependentOn;
