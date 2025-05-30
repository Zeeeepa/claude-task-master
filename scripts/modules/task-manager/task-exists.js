import { StorageAdapter } from '../../../src/database/services/StorageAdapter.js';

/**
 * Checks if a task with the given ID exists
 * @param {Array|string} tasks - Array of tasks to search OR path to tasks file
 * @param {string|number} taskId - ID of task or subtask to check
 * @param {Object} [options] - Additional options
 * @param {string} [options.projectId] - Project ID for database storage
 * @returns {boolean|Promise<boolean>} Whether the task exists
 */
async function taskExists(tasks, taskId, options = {}) {
	// Backward compatibility: if tasks is an array, use legacy logic
	if (Array.isArray(tasks)) {
		return _legacyTaskExists(tasks, taskId);
	}

	// New path: tasks parameter is actually tasksPath
	const tasksPath = tasks;
	
	try {
		// Use storage adapter to check task existence
		const storageAdapter = new StorageAdapter();
		
		if (storageAdapter.isDatabase) {
			// For database storage, use async method
			return await storageAdapter.taskExists(tasksPath, taskId, options.projectId);
		} else {
			// For file storage, read and check
			const data = await storageAdapter.readTasks(tasksPath, options.projectId);
			return _legacyTaskExists(data.tasks || [], taskId);
		}
	} catch (error) {
		// Fallback to file-based storage on error
		console.warn(`Storage adapter failed, falling back to legacy behavior: ${error.message}`);
		// If we can't read the file, assume task doesn't exist
		return false;
	}
}

/**
 * Legacy task existence check for backward compatibility
 * @param {Array} tasks - Array of tasks to search
 * @param {string|number} taskId - ID of task or subtask to check
 * @returns {boolean} Whether the task exists
 */
function _legacyTaskExists(tasks, taskId) {
	// Handle subtask IDs (e.g., "1.2")
	if (typeof taskId === 'string' && taskId.includes('.')) {
		const [parentIdStr, subtaskIdStr] = taskId.split('.');
		const parentId = parseInt(parentIdStr, 10);
		const subtaskId = parseInt(subtaskIdStr, 10);

		// Find the parent task
		const parentTask = tasks.find((t) => t.id === parentId);

		// If parent exists, check if subtask exists
		return (
			parentTask &&
			parentTask.subtasks &&
			parentTask.subtasks.some((st) => st.id === subtaskId)
		);
	}

	// Handle regular task IDs
	const id = parseInt(taskId, 10);
	return tasks.some((t) => t.id === id);
}

export default taskExists;

