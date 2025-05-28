/**
 * integrations/linear/status-mapping.js
 * Configurable workflow-to-Linear status mapping system
 */

/**
 * Default status mapping configuration
 */
export const DEFAULT_STATUS_MAPPING = {
	// Task Master statuses to Linear states
	'pending': 'Backlog',
	'in-progress': 'In Progress',
	'done': 'Done',
	'deferred': 'Backlog',
	'blocked': 'Blocked',
	
	// Workflow states to Linear states
	'task_created': 'Backlog',
	'pr_created': 'In Progress',
	'validation_running': 'In Review',
	'validation_failed': 'Needs Fix',
	'validation_passed': 'Ready for Merge',
	'pr_merged': 'Done',
	'error': 'Needs Fix',
	'cancelled': 'Cancelled'
};

/**
 * Priority mapping from Task Master to Linear
 */
export const PRIORITY_MAPPING = {
	'low': 1,
	'medium': 2,
	'high': 3,
	'urgent': 4
};

/**
 * Label mapping for different task types and statuses
 */
export const LABEL_MAPPING = {
	// Task types
	'bug': 'bug',
	'feature': 'feature',
	'enhancement': 'enhancement',
	'documentation': 'documentation',
	'refactor': 'refactor',
	'test': 'testing',
	
	// Status indicators
	'automated': 'automated',
	'ai-generated': 'ai-generated',
	'needs-review': 'needs-review',
	'high-priority': 'high-priority'
};

/**
 * Status mapping manager class
 */
export class StatusMapper {
	constructor(customMapping = {}) {
		this.statusMapping = { ...DEFAULT_STATUS_MAPPING, ...customMapping.status };
		this.priorityMapping = { ...PRIORITY_MAPPING, ...customMapping.priority };
		this.labelMapping = { ...LABEL_MAPPING, ...customMapping.labels };
		this.reverseStatusMapping = this.createReverseMapping(this.statusMapping);
	}

	/**
	 * Create reverse mapping for Linear states to Task Master statuses
	 * @param {Object} mapping - Original mapping
	 * @returns {Object} Reverse mapping
	 */
	createReverseMapping(mapping) {
		const reverse = {};
		for (const [key, value] of Object.entries(mapping)) {
			if (!reverse[value]) {
				reverse[value] = [];
			}
			reverse[value].push(key);
		}
		return reverse;
	}

	/**
	 * Map Task Master status to Linear state name
	 * @param {string} taskStatus - Task Master status
	 * @returns {string} Linear state name
	 */
	mapToLinearState(taskStatus) {
		return this.statusMapping[taskStatus] || 'Backlog';
	}

	/**
	 * Map Linear state to Task Master status
	 * @param {string} linearState - Linear state name
	 * @returns {string} Task Master status
	 */
	mapFromLinearState(linearState) {
		const possibleStatuses = this.reverseStatusMapping[linearState];
		if (!possibleStatuses || possibleStatuses.length === 0) {
			return 'pending';
		}
		
		// Return the first matching status, prioritizing common ones
		const priorityOrder = ['pending', 'in-progress', 'done', 'deferred', 'blocked'];
		for (const status of priorityOrder) {
			if (possibleStatuses.includes(status)) {
				return status;
			}
		}
		
		return possibleStatuses[0];
	}

	/**
	 * Map Task Master priority to Linear priority
	 * @param {string} taskPriority - Task Master priority
	 * @returns {number} Linear priority (0-4)
	 */
	mapToLinearPriority(taskPriority) {
		return this.priorityMapping[taskPriority?.toLowerCase()] || 2; // Default to medium
	}

	/**
	 * Map Linear priority to Task Master priority
	 * @param {number} linearPriority - Linear priority (0-4)
	 * @returns {string} Task Master priority
	 */
	mapFromLinearPriority(linearPriority) {
		const priorityMap = {
			0: 'low',
			1: 'low',
			2: 'medium',
			3: 'high',
			4: 'urgent'
		};
		return priorityMap[linearPriority] || 'medium';
	}

	/**
	 * Get label names for a task
	 * @param {Object} task - Task object
	 * @returns {Array<string>} Array of label names
	 */
	getLabelsForTask(task) {
		const labels = [];
		
		// Add task type labels
		if (task.type && this.labelMapping[task.type]) {
			labels.push(this.labelMapping[task.type]);
		}
		
		// Add priority label for high priority tasks
		if (task.priority === 'high' || task.priority === 'urgent') {
			labels.push(this.labelMapping['high-priority']);
		}
		
		// Add automated label for AI-generated tasks
		if (task.aiGenerated || task.automated) {
			labels.push(this.labelMapping['ai-generated']);
			labels.push(this.labelMapping['automated']);
		}
		
		// Add status-based labels
		if (task.status === 'in-progress' && task.needsReview) {
			labels.push(this.labelMapping['needs-review']);
		}
		
		// Add custom labels from task
		if (task.labels && Array.isArray(task.labels)) {
			labels.push(...task.labels.filter(label => typeof label === 'string'));
		}
		
		return [...new Set(labels)]; // Remove duplicates
	}

	/**
	 * Determine workflow stage from task and context
	 * @param {Object} task - Task object
	 * @param {Object} context - Additional context (PR info, etc.)
	 * @returns {string} Workflow stage
	 */
	determineWorkflowStage(task, context = {}) {
		// Check for PR-related stages
		if (context.prMerged) {
			return 'pr_merged';
		}
		
		if (context.prUrl) {
			if (context.validationFailed) {
				return 'validation_failed';
			}
			if (context.validationPassed) {
				return 'validation_passed';
			}
			if (context.validationRunning) {
				return 'validation_running';
			}
			return 'pr_created';
		}
		
		// Check for error states
		if (context.error || task.status === 'error') {
			return 'error';
		}
		
		// Map standard task statuses
		switch (task.status) {
			case 'done':
				return context.prUrl ? 'pr_merged' : 'done';
			case 'in-progress':
				return context.prUrl ? 'pr_created' : 'in-progress';
			case 'pending':
			case 'deferred':
			default:
				return 'task_created';
		}
	}

	/**
	 * Create Linear issue input from task data
	 * @param {Object} task - Task object
	 * @param {Object} context - Additional context
	 * @param {Object} teamConfig - Team configuration
	 * @returns {Object} Linear issue input
	 */
	createLinearIssueInput(task, context = {}, teamConfig = {}) {
		const workflowStage = this.determineWorkflowStage(task, context);
		const linearState = this.mapToLinearState(workflowStage);
		const priority = this.mapToLinearPriority(task.priority);
		const labels = this.getLabelsForTask(task);
		
		// Build description with task details
		let description = task.description || '';
		
		if (task.details) {
			description += `\n\n## Implementation Details\n${task.details}`;
		}
		
		if (task.testStrategy) {
			description += `\n\n## Test Strategy\n${task.testStrategy}`;
		}
		
		if (task.dependencies && task.dependencies.length > 0) {
			description += `\n\n## Dependencies\nThis task depends on: ${task.dependencies.join(', ')}`;
		}
		
		if (context.prUrl) {
			description += `\n\n## Related PR\n${context.prUrl}`;
		}
		
		// Add metadata
		description += `\n\n---\n*Generated by claude-task-master*`;
		if (task.id) {
			description += `\nTask ID: ${task.id}`;
		}
		
		const input = {
			title: task.title,
			description: description.trim(),
			priority: priority
		};
		
		// Add team-specific configuration
		if (teamConfig.teamId) {
			input.teamId = teamConfig.teamId;
		}
		
		if (teamConfig.stateMapping && teamConfig.stateMapping[linearState]) {
			input.stateId = teamConfig.stateMapping[linearState];
		}
		
		if (teamConfig.assigneeId) {
			input.assigneeId = teamConfig.assigneeId;
		}
		
		if (teamConfig.projectId) {
			input.projectId = teamConfig.projectId;
		}
		
		if (teamConfig.labelMapping && labels.length > 0) {
			input.labelIds = labels
				.map(label => teamConfig.labelMapping[label])
				.filter(Boolean);
		}
		
		return input;
	}

	/**
	 * Update mapping configuration
	 * @param {Object} newMapping - New mapping configuration
	 */
	updateMapping(newMapping) {
		if (newMapping.status) {
			this.statusMapping = { ...this.statusMapping, ...newMapping.status };
			this.reverseStatusMapping = this.createReverseMapping(this.statusMapping);
		}
		
		if (newMapping.priority) {
			this.priorityMapping = { ...this.priorityMapping, ...newMapping.priority };
		}
		
		if (newMapping.labels) {
			this.labelMapping = { ...this.labelMapping, ...newMapping.labels };
		}
	}

	/**
	 * Get current mapping configuration
	 * @returns {Object} Current mapping configuration
	 */
	getMapping() {
		return {
			status: this.statusMapping,
			priority: this.priorityMapping,
			labels: this.labelMapping
		};
	}

	/**
	 * Validate mapping configuration
	 * @param {Object} mapping - Mapping to validate
	 * @returns {Object} Validation result
	 */
	validateMapping(mapping) {
		const errors = [];
		const warnings = [];
		
		// Validate status mapping
		if (mapping.status) {
			for (const [key, value] of Object.entries(mapping.status)) {
				if (typeof key !== 'string' || typeof value !== 'string') {
					errors.push(`Invalid status mapping: ${key} -> ${value}`);
				}
			}
		}
		
		// Validate priority mapping
		if (mapping.priority) {
			for (const [key, value] of Object.entries(mapping.priority)) {
				if (typeof key !== 'string' || typeof value !== 'number' || value < 0 || value > 4) {
					errors.push(`Invalid priority mapping: ${key} -> ${value} (must be 0-4)`);
				}
			}
		}
		
		// Check for missing essential mappings
		const essentialStatuses = ['pending', 'in-progress', 'done'];
		for (const status of essentialStatuses) {
			if (!mapping.status || !mapping.status[status]) {
				warnings.push(`Missing mapping for essential status: ${status}`);
			}
		}
		
		return {
			valid: errors.length === 0,
			errors,
			warnings
		};
	}
}

export default StatusMapper;

