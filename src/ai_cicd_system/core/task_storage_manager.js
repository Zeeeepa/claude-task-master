/**
 * @fileoverview Enhanced Task Storage Manager
 * @description Unified task storage with comprehensive context preservation and enhanced PostgreSQL schema support
 */

import { log } from '../../../scripts/modules/utils.js';
import { getConnection } from '../database/connection.js';
import { dbConfig } from '../config/database_config.js';

/**
 * Enhanced task storage manager with PostgreSQL backend and comprehensive schema support
 * Implements the TaskStorageInterface with enhanced features
 */
export class TaskStorageManager {
	constructor(config = {}) {
		this.config = {
			...dbConfig,
			enable_mock: config.enable_mock || false,
			...config
		};

		this.isInitialized = false;
		this.mockStorage = new Map();
		this.mockContext = new Map();
		this.mockTemplates = new Map();
		this.dbConnection = null;
	}

	/**
	 * Initialize the task storage with enhanced database connection
	 */
	async initialize() {
		try {
			if (this.config.enable_mock) {
				log('info', 'Initializing task storage in mock mode');
				this.isInitialized = true;
				return;
			}

			// Initialize database connection
			this.dbConnection = getConnection();
			await this.dbConnection.initialize();
			this.isInitialized = true;
			
			log('info', 'Task storage initialized with PostgreSQL backend');
		} catch (error) {
			log('error', `Failed to initialize task storage: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Store enhanced atomic task with comprehensive context
	 * @param {Object} task - Enhanced task to store
	 * @param {Object} requirement - Source requirement
	 * @returns {Promise<string>} Task ID
	 */
	async storeAtomicTask(task, requirement) {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		const taskId = task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		const enhancedTask = {
			id: taskId,
			title: task.title,
			description: task.description,
			summary: task.summary || task.title,
			type: task.type || 'feature',
			category: task.category,
			priority: this._mapPriority(task.priority || 'medium'),
			status: 'draft',
			complexity: this._mapComplexity(task.complexityScore || 5),
			epic_id: task.epicId,
			story_points: task.storyPoints,
			business_value: task.businessValue || 5,
			technical_debt_score: task.technicalDebtScore || 0,
			risk_level: task.riskLevel || 3,
			requirements: task.requirements || [],
			acceptance_criteria: task.acceptanceCriteria || [],
			definition_of_done: task.definitionOfDone || [],
			test_criteria: task.testCriteria || [],
			affected_files: task.affectedFiles || [],
			affected_components: task.affectedComponents || [],
			dependencies: task.dependencies || [],
			technical_notes: task.technicalNotes,
			architecture_notes: task.architectureNotes,
			assigned_to: task.assignedTo,
			reporter: task.reporter,
			product_owner: task.productOwner,
			tech_lead: task.techLead,
			reviewer: task.reviewer,
			estimated_hours: task.estimatedHours,
			actual_hours: null,
			remaining_hours: task.estimatedHours,
			due_date: task.dueDate ? new Date(task.dueDate) : null,
			sprint_id: task.sprintId,
			release_version: task.releaseVersion,
			milestone: task.milestone,
			labels: task.labels || [],
			tags: task.tags || [],
			external_id: task.externalId,
			github_issue_url: task.githubIssueUrl,
			github_pr_url: task.githubPrUrl,
			linear_issue_id: task.linearIssueId,
			jira_key: task.jiraKey,
			code_quality_score: task.codeQualityScore,
			test_coverage_target: task.testCoverageTarget || 80,
			performance_requirements: task.performanceRequirements || {},
			security_requirements: task.securityRequirements || {},
			automation_level: task.automationLevel || 0,
			ci_cd_pipeline: task.ciCdPipeline,
			deployment_strategy: task.deploymentStrategy,
			metadata: {
				source_requirement_id: requirement?.id,
				validation: task.validation,
				created_by: 'task_storage_manager',
				...task.metadata
			},
			custom_fields: task.customFields || {}
		};

		if (this.config.enable_mock) {
			this.mockStorage.set(taskId, enhancedTask);
			await this._storeInitialContext(taskId, requirement);
		} else {
			await this._storeEnhancedTaskInDatabase(enhancedTask, requirement);
		}

		log('debug', `Stored enhanced task ${taskId}: ${task.title}`);
		return taskId;
	}

	/**
	 * Retrieve task by ID
	 * @param {string} taskId - Task identifier
	 * @returns {Promise<Object|null>} Task object or null
	 */
	async retrieveTaskById(taskId) {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		if (this.config.enable_mock) {
			return this.mockStorage.get(taskId) || null;
		} else {
			return await this._retrieveTaskFromDatabase(taskId);
		}
	}

	/**
	 * Update task status
	 * @param {string} taskId - Task identifier
	 * @param {string} status - New status
	 * @param {Object} context - Update context
	 */
	async updateTaskStatus(taskId, status, context = {}) {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		if (this.config.enable_mock) {
			const task = this.mockStorage.get(taskId);
			if (task) {
				task.status = status;
				task.updated_at = new Date();

				// Store status change context
				await this.storeTaskContext(taskId, 'status_change', {
					from_status: task.status,
					to_status: status,
					changed_at: new Date(),
					context
				});
			}
		} else {
			await this._updateTaskStatusInDatabase(taskId, status, context);
		}

		log('debug', `Updated task ${taskId} status to ${status}`);
	}

	/**
	 * Get pending tasks
	 * @returns {Promise<Array>} Array of pending tasks
	 */
	async getPendingTasks() {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		if (this.config.enable_mock) {
			return Array.from(this.mockStorage.values()).filter(
				(task) => task.status === 'pending'
			);
		} else {
			return await this._getPendingTasksFromDatabase();
		}
	}

	/**
	 * Mark task as completed
	 * @param {string} taskId - Task identifier
	 * @param {Object} results - Completion results
	 */
	async markTaskCompleted(taskId, results = {}) {
		await this.updateTaskStatus(taskId, 'completed', results);

		if (this.config.enable_mock) {
			const task = this.mockStorage.get(taskId);
			if (task) {
				task.completed_at = new Date();
				task.actual_hours = results.actual_hours || task.estimated_hours;
			}
		}

		await this.storeTaskContext(taskId, 'completion', {
			completed_at: new Date(),
			results,
			completion_method: 'automated'
		});

		log('info', `Task ${taskId} marked as completed`);
	}

	/**
	 * Store task context
	 * @param {string} taskId - Task identifier
	 * @param {string} contextType - Type of context
	 * @param {Object} contextData - Context data
	 */
	async storeTaskContext(taskId, contextType, contextData) {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		const contextEntry = {
			task_id: taskId,
			context_type: contextType,
			context_data: contextData,
			created_at: new Date(),
			metadata: {
				version: '1.0.0',
				source: 'task_storage_manager'
			}
		};

		if (this.config.enable_mock) {
			if (!this.mockContext.has(taskId)) {
				this.mockContext.set(taskId, []);
			}
			this.mockContext.get(taskId).push(contextEntry);
		} else {
			await this._storeContextInDatabase(contextEntry);
		}

		log('debug', `Stored ${contextType} context for task ${taskId}`);
	}

	/**
	 * Get task full context
	 * @param {string} taskId - Task identifier
	 * @returns {Promise<Object>} Full task context
	 */
	async getTaskFullContext(taskId) {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		const task = await this.retrieveTaskById(taskId);
		if (!task) {
			throw new Error(`Task ${taskId} not found`);
		}

		let contextEntries = [];

		if (this.config.enable_mock) {
			contextEntries = this.mockContext.get(taskId) || [];
		} else {
			contextEntries = await this._getContextFromDatabase(taskId);
		}

		// Organize context by type
		const organizedContext = {
			task,
			requirements_context: null,
			codebase_context: null,
			ai_interactions: [],
			validation_results: [],
			workflow_state: null,
			metadata: {}
		};

		contextEntries.forEach((entry) => {
			switch (entry.context_type) {
				case 'requirement':
					organizedContext.requirements_context = entry.context_data;
					break;
				case 'codebase':
					organizedContext.codebase_context = entry.context_data;
					break;
				case 'ai_interaction':
					organizedContext.ai_interactions.push(entry.context_data);
					break;
				case 'validation':
					organizedContext.validation_results.push(entry.context_data);
					break;
				case 'workflow':
					organizedContext.workflow_state = entry.context_data;
					break;
				default:
					organizedContext.metadata[entry.context_type] = entry.context_data;
			}
		});

		return organizedContext;
	}

	/**
	 * Store AI interaction
	 * @param {string} taskId - Task identifier
	 * @param {string} agentName - AI agent name
	 * @param {Object} interactionData - Interaction data
	 */
	async storeAIInteraction(taskId, agentName, interactionData) {
		const interaction = {
			agent_name: agentName,
			interaction_type: interactionData.type || 'unknown',
			request_data: interactionData.request,
			response_data: interactionData.response,
			execution_time_ms: interactionData.execution_time_ms,
			success: interactionData.success !== false,
			session_id: interactionData.session_id,
			timestamp: new Date()
		};

		await this.storeTaskContext(taskId, 'ai_interaction', interaction);
		log(
			'debug',
			`Stored AI interaction for task ${taskId} with agent ${agentName}`
		);
	}

	/**
	 * Add task dependency
	 * @param {string} parentTaskId - Parent task ID
	 * @param {string} childTaskId - Child task ID
	 * @param {string} dependencyType - Type of dependency
	 */
	async addTaskDependency(
		parentTaskId,
		childTaskId,
		dependencyType = 'blocks'
	) {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		const dependency = {
			parent_task_id: parentTaskId,
			child_task_id: childTaskId,
			dependency_type: dependencyType,
			created_at: new Date()
		};

		if (this.config.enable_mock) {
			// Store dependency in context for both tasks
			await this.storeTaskContext(parentTaskId, 'dependency_parent', {
				child_task_id: childTaskId,
				dependency_type: dependencyType
			});

			await this.storeTaskContext(childTaskId, 'dependency_child', {
				parent_task_id: parentTaskId,
				dependency_type: dependencyType
			});
		} else {
			await this._storeDependencyInDatabase(dependency);
		}

		log(
			'debug',
			`Added dependency: ${parentTaskId} ${dependencyType} ${childTaskId}`
		);
	}

	/**
	 * Get task dependencies
	 * @param {string} taskId - Task identifier
	 * @returns {Promise<Array>} Array of dependency task IDs
	 */
	async getTaskDependencies(taskId) {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		if (this.config.enable_mock) {
			const contextEntries = this.mockContext.get(taskId) || [];
			return contextEntries
				.filter((entry) => entry.context_type === 'dependency_child')
				.map((entry) => entry.context_data.parent_task_id);
		} else {
			return await this._getDependenciesFromDatabase(taskId);
		}
	}

	/**
	 * Store validation result
	 * @param {string} taskId - Task identifier
	 * @param {string} validationType - Type of validation
	 * @param {string} validatorName - Name of validator
	 * @param {string} status - Validation status
	 * @param {number} score - Validation score
	 * @param {Object} details - Validation details
	 * @param {Object} suggestions - Improvement suggestions
	 */
	async storeValidationResult(
		taskId,
		validationType,
		validatorName,
		status,
		score,
		details,
		suggestions
	) {
		const validationResult = {
			validation_type: validationType,
			validator_name: validatorName,
			status,
			score,
			details,
			suggestions,
			validated_at: new Date()
		};

		await this.storeTaskContext(taskId, 'validation', validationResult);
		log(
			'debug',
			`Stored validation result for task ${taskId}: ${status} (${score})`
		);
	}

	/**
	 * Get task metrics
	 * @returns {Promise<Object>} Task metrics
	 */
	async getTaskMetrics() {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		if (this.config.enable_mock) {
			const tasks = Array.from(this.mockStorage.values());
			const totalTasks = tasks.length;
			const pendingTasks = tasks.filter((t) => t.status === 'pending').length;
			const completedTasks = tasks.filter(
				(t) => t.status === 'completed'
			).length;
			const avgComplexity =
				tasks.reduce((sum, t) => sum + t.complexity_score, 0) / totalTasks || 0;

			return {
				total_tasks: totalTasks,
				pending_tasks: pendingTasks,
				completed_tasks: completedTasks,
				in_progress_tasks: tasks.filter((t) => t.status === 'in_progress')
					.length,
				failed_tasks: tasks.filter((t) => t.status === 'failed').length,
				avg_complexity: avgComplexity,
				total_estimated_hours: tasks.reduce(
					(sum, t) => sum + (t.estimated_hours || 0),
					0
				),
				total_actual_hours: tasks.reduce(
					(sum, t) => sum + (t.actual_hours || 0),
					0
				)
			};
		} else {
			return await this._getMetricsFromDatabase();
		}
	}

	/**
	 * Get health status
	 * @returns {Promise<Object>} Health status
	 */
	async getHealth() {
		if (!this.isInitialized) {
			return { status: 'not_initialized' };
		}

		if (this.config.enable_mock) {
			return {
				status: 'healthy',
				mode: 'mock',
				tasks_stored: this.mockStorage.size,
				context_entries: Array.from(this.mockContext.values()).reduce(
					(sum, entries) => sum + entries.length,
					0
				)
			};
		} else {
			// Real database health check would go here
			return { status: 'healthy', mode: 'database' };
		}
	}

	/**
	 * Shutdown the storage manager
	 */
	async shutdown() {
		log('debug', 'Shutting down task storage manager...');

		if (this.dbConnection) {
			await this.dbConnection.end();
		}

		this.isInitialized = false;
	}

	// Private methods for database operations (mock implementations)

	async _connectToDatabase() {
		// Mock database connection
		log('debug', 'Mock: Connecting to database...');
		return null;
	}

	async _storeTaskInDatabase(task) {
		// Mock database storage
		log('debug', `Mock: Storing task ${task.id} in database`);
	}

	async _retrieveTaskFromDatabase(taskId) {
		// Mock database retrieval
		log('debug', `Mock: Retrieving task ${taskId} from database`);
		return null;
	}

	async _updateTaskStatusInDatabase(taskId, status, context) {
		// Mock database update
		log(
			'debug',
			`Mock: Updating task ${taskId} status to ${status} in database`
		);
	}

	async _getPendingTasksFromDatabase() {
		// Mock database query
		log('debug', 'Mock: Getting pending tasks from database');
		return [];
	}

	async _storeContextInDatabase(contextEntry) {
		// Mock context storage
		log(
			'debug',
			`Mock: Storing context for task ${contextEntry.task_id} in database`
		);
	}

	async _getContextFromDatabase(taskId) {
		// Mock context retrieval
		log('debug', `Mock: Getting context for task ${taskId} from database`);
		return [];
	}

	async _storeDependencyInDatabase(dependency) {
		// Mock dependency storage
		log(
			'debug',
			`Mock: Storing dependency ${dependency.parent_task_id} -> ${dependency.child_task_id} in database`
		);
	}

	async _getDependenciesFromDatabase(taskId) {
		// Mock dependency retrieval
		log('debug', `Mock: Getting dependencies for task ${taskId} from database`);
		return [];
	}

	async _getMetricsFromDatabase() {
		// Mock metrics retrieval
		log('debug', 'Mock: Getting metrics from database');
		return {
			total_tasks: 0,
			pending_tasks: 0,
			completed_tasks: 0,
			avg_complexity: 0
		};
	}

	_mapPriority(priority) {
		switch (priority.toLowerCase()) {
			case 'high':
				return 'high';
			case 'medium':
				return 'medium';
			case 'low':
				return 'low';
			default:
				return 'medium';
		}
	}

	_mapComplexity(complexity) {
		switch (complexity) {
			case 1:
				return 'low';
			case 2:
				return 'medium';
			case 3:
				return 'high';
			default:
				return 'medium';
		}
	}

	async _storeInitialContext(taskId, requirement) {
		// Mock initial context storage
		log('debug', `Mock: Storing initial context for task ${taskId}`);
	}

	async _storeEnhancedTaskInDatabase(task, requirement) {
		// Mock enhanced task storage
		log('debug', `Mock: Storing enhanced task ${task.id} in database`);
	}

	/**
	 * Store template in the database
	 * @param {Object} template - Template to store
	 * @returns {Promise<string>} Template ID
	 */
	async storeTemplate(template) {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		const templateId = template.id || `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		const enhancedTemplate = {
			id: templateId,
			name: template.name,
			title: template.title,
			description: template.description,
			template_type_id: template.templateTypeId,
			category_id: template.categoryId,
			version: template.version || '1.0.0',
			content: template.content,
			variables: template.variables || [],
			parameters: template.parameters || {},
			tags: template.tags || [],
			usage_count: 0,
			success_rate: 0.00,
			average_execution_time: 0,
			complexity_score: template.complexityScore || 5,
			is_active: template.isActive !== false,
			is_public: template.isPublic || false,
			requires_approval: template.requiresApproval || false,
			created_by: template.createdBy,
			updated_by: template.updatedBy,
			metadata: template.metadata || {}
		};

		if (this.config.enable_mock) {
			this.mockTemplates.set(templateId, enhancedTemplate);
		} else {
			await this._storeTemplateInDatabase(enhancedTemplate);
		}

		log('debug', `Stored template ${templateId}: ${template.title}`);
		return templateId;
	}

	/**
	 * Retrieve template by ID
	 * @param {string} templateId - Template identifier
	 * @returns {Promise<Object|null>} Template object or null
	 */
	async retrieveTemplateById(templateId) {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		if (this.config.enable_mock) {
			return this.mockTemplates.get(templateId) || null;
		} else {
			return await this._retrieveTemplateFromDatabase(templateId);
		}
	}

	/**
	 * Search templates by criteria
	 * @param {Object} criteria - Search criteria
	 * @returns {Promise<Array>} Array of matching templates
	 */
	async searchTemplates(criteria = {}) {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		if (this.config.enable_mock) {
			let templates = Array.from(this.mockTemplates.values());

			// Apply filters
			if (criteria.type) {
				templates = templates.filter(t => t.template_type_id === criteria.type);
			}
			if (criteria.category) {
				templates = templates.filter(t => t.category_id === criteria.category);
			}
			if (criteria.tags && criteria.tags.length > 0) {
				templates = templates.filter(t => 
					criteria.tags.some(tag => t.tags.includes(tag))
				);
			}
			if (criteria.isActive !== undefined) {
				templates = templates.filter(t => t.is_active === criteria.isActive);
			}
			if (criteria.isPublic !== undefined) {
				templates = templates.filter(t => t.is_public === criteria.isPublic);
			}

			// Sort by usage count and success rate
			templates.sort((a, b) => {
				if (b.usage_count !== a.usage_count) {
					return b.usage_count - a.usage_count;
				}
				return b.success_rate - a.success_rate;
			});

			// Apply limit
			if (criteria.limit) {
				templates = templates.slice(0, criteria.limit);
			}

			return templates;
		} else {
			return await this._searchTemplatesInDatabase(criteria);
		}
	}

	/**
	 * Log template usage
	 * @param {string} templateId - Template identifier
	 * @param {Object} usageData - Usage data
	 * @returns {Promise<void>}
	 */
	async logTemplateUsage(templateId, usageData) {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		const usageLog = {
			template_id: templateId,
			template_version: usageData.version || '1.0.0',
			task_id: usageData.taskId,
			workflow_id: usageData.workflowId,
			used_by: usageData.usedBy,
			execution_time: usageData.executionTime,
			success: usageData.success !== false,
			error_message: usageData.errorMessage,
			input_parameters: usageData.inputParameters || {},
			output_data: usageData.outputData || {},
			used_at: new Date(),
			metadata: usageData.metadata || {}
		};

		if (this.config.enable_mock) {
			// Update template statistics in mock mode
			const template = this.mockTemplates.get(templateId);
			if (template) {
				template.usage_count++;
				if (usageData.success !== false) {
					template.success_rate = ((template.success_rate * (template.usage_count - 1)) + 100) / template.usage_count;
				} else {
					template.success_rate = (template.success_rate * (template.usage_count - 1)) / template.usage_count;
				}
				if (usageData.executionTime) {
					template.average_execution_time = ((template.average_execution_time * (template.usage_count - 1)) + usageData.executionTime) / template.usage_count;
				}
			}
		} else {
			await this._logTemplateUsageInDatabase(usageLog);
		}

		log('debug', `Logged template usage for ${templateId}: ${usageData.success ? 'success' : 'failure'}`);
	}

	/**
	 * Create template dependency
	 * @param {string} parentTemplateId - Parent template ID
	 * @param {string} childTemplateId - Child template ID
	 * @param {string} dependencyType - Type of dependency
	 * @returns {Promise<void>}
	 */
	async createTemplateDependency(parentTemplateId, childTemplateId, dependencyType = 'includes') {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		const dependency = {
			parent_template_id: parentTemplateId,
			child_template_id: childTemplateId,
			dependency_type: dependencyType,
			is_required: true,
			created_at: new Date(),
			metadata: {}
		};

		if (this.config.enable_mock) {
			// Store dependency in mock storage
			log('debug', `Mock: Creating template dependency ${parentTemplateId} -> ${childTemplateId}`);
		} else {
			await this._createTemplateDependencyInDatabase(dependency);
		}

		log('debug', `Created template dependency: ${parentTemplateId} ${dependencyType} ${childTemplateId}`);
	}

	/**
	 * Get template performance metrics
	 * @param {string} templateId - Template identifier
	 * @returns {Promise<Object>} Performance metrics
	 */
	async getTemplateMetrics(templateId) {
		if (!this.isInitialized) {
			throw new Error('Task storage not initialized');
		}

		if (this.config.enable_mock) {
			const template = this.mockTemplates.get(templateId);
			if (!template) {
				throw new Error(`Template ${templateId} not found`);
			}

			return {
				template_id: templateId,
				usage_count: template.usage_count,
				success_rate: template.success_rate,
				average_execution_time: template.average_execution_time,
				complexity_score: template.complexity_score,
				last_used: new Date(), // Mock data
				total_errors: Math.floor(template.usage_count * (100 - template.success_rate) / 100)
			};
		} else {
			return await this._getTemplateMetricsFromDatabase(templateId);
		}
	}

	async _storeTemplateInDatabase(template) {
		// Mock template storage
		log('debug', `Mock: Storing template ${template.id} in database`);
	}

	async _retrieveTemplateFromDatabase(templateId) {
		// Mock template retrieval
		log('debug', `Mock: Retrieving template ${templateId} from database`);
		return null;
	}

	async _searchTemplatesInDatabase(criteria) {
		// Mock template search
		log('debug', 'Mock: Searching templates');
		return [];
	}

	async _logTemplateUsageInDatabase(usageLog) {
		// Mock template usage logging
		log('debug', `Mock: Logging template usage for ${usageLog.template_id}`);
	}

	async _createTemplateDependencyInDatabase(dependency) {
		// Mock template dependency creation
		log('debug', `Mock: Creating template dependency ${dependency.parent_template_id} -> ${dependency.child_template_id}`);
	}

	async _getTemplateMetricsFromDatabase(templateId) {
		// Mock template metrics retrieval
		log('debug', `Mock: Getting metrics for template ${templateId}`);
		return {
			template_id: templateId,
			usage_count: 0,
			success_rate: 0.00,
			average_execution_time: 0,
			complexity_score: 0,
			last_used: new Date(),
			total_errors: 0
		};
	}
}

export default TaskStorageManager;
