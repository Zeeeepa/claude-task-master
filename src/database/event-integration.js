/**
 * @fileoverview Event Integration Layer - Connects EventStore with existing Task Master system
 * @description Integration between EventStore and existing orchestrator/agent systems
 * @version 1.0.0
 */

import { EventStore } from './event-store.js';
import { EventEmitter } from 'events';

/**
 * EventIntegration class for seamless integration with existing Task Master system
 */
export class EventIntegration extends EventEmitter {
  constructor(config = {}) {
    super();
    this.eventStore = new EventStore(config);
    this.isEnabled = true;
    this.taskTracking = new Map(); // Track ongoing tasks
    this.agentTracking = new Map(); // Track agent activities
  }

  /**
   * Initialize the integration system
   */
  async initialize() {
    await this.eventStore.initialize();
    this.setupEventListeners();
    console.log('[EventIntegration] Initialized successfully');
  }

  /**
   * Setup event listeners for automatic event capture
   */
  setupEventListeners() {
    // Listen for task events from orchestrator
    this.on('task:started', this.handleTaskStarted.bind(this));
    this.on('task:completed', this.handleTaskCompleted.bind(this));
    this.on('task:error', this.handleTaskError.bind(this));
    this.on('task:cancelled', this.handleTaskCancelled.bind(this));

    // Listen for agent events
    this.on('agent:registered', this.handleAgentRegistered.bind(this));
    this.on('agent:action', this.handleAgentAction.bind(this));
    this.on('agent:error', this.handleAgentError.bind(this));
    this.on('agent:unregistered', this.handleAgentUnregistered.bind(this));

    // Listen for deployment events
    this.on('deployment:started', this.handleDeploymentStarted.bind(this));
    this.on('deployment:completed', this.handleDeploymentCompleted.bind(this));
    this.on('deployment:error', this.handleDeploymentError.bind(this));

    // Listen for system events
    this.on('system:event', this.handleSystemEvent.bind(this));
  }

  /**
   * Handle task started event
   */
  async handleTaskStarted(taskData) {
    if (!this.isEnabled) return;

    try {
      const taskEvent = {
        task_id: taskData.id || taskData.taskId,
        task_name: taskData.name || taskData.title || 'Unknown Task',
        agent_id: taskData.agentId || taskData.agent_id || 'system',
        event_type: 'task_execution',
        event_name: 'task_started',
        status: 'started',
        input_data: taskData.input || taskData.data || {},
        metadata: {
          source: 'EventIntegration',
          originalEvent: 'task:started',
          ...taskData.metadata
        },
        started_at: new Date()
      };

      const eventId = await this.eventStore.logTaskEvent(taskEvent);
      
      // Track the task
      this.taskTracking.set(taskEvent.task_id, {
        eventId,
        startTime: new Date(),
        ...taskEvent
      });

      console.log(`[EventIntegration] Task started: ${taskEvent.task_id}`);
    } catch (error) {
      console.error('[EventIntegration] Failed to handle task started:', error);
    }
  }

  /**
   * Handle task completed event
   */
  async handleTaskCompleted(taskData) {
    if (!this.isEnabled) return;

    try {
      const taskId = taskData.id || taskData.taskId;
      const trackedTask = this.taskTracking.get(taskId);
      const completedAt = new Date();
      const duration = trackedTask ? completedAt - trackedTask.startTime : null;

      const taskEvent = {
        task_id: taskId,
        task_name: taskData.name || taskData.title || trackedTask?.task_name || 'Unknown Task',
        agent_id: taskData.agentId || taskData.agent_id || trackedTask?.agent_id || 'system',
        event_type: 'task_execution',
        event_name: 'task_completed',
        status: 'completed',
        input_data: trackedTask?.input_data || {},
        output_data: taskData.output || taskData.result || {},
        metadata: {
          source: 'EventIntegration',
          originalEvent: 'task:completed',
          ...taskData.metadata
        },
        started_at: trackedTask?.started_at,
        completed_at: completedAt,
        duration_ms: duration
      };

      await this.eventStore.logTaskEvent(taskEvent);
      
      // Remove from tracking
      this.taskTracking.delete(taskId);

      console.log(`[EventIntegration] Task completed: ${taskId}`);
    } catch (error) {
      console.error('[EventIntegration] Failed to handle task completed:', error);
    }
  }

  /**
   * Handle task error event
   */
  async handleTaskError(taskData) {
    if (!this.isEnabled) return;

    try {
      const taskId = taskData.id || taskData.taskId;
      const trackedTask = this.taskTracking.get(taskId);
      const errorAt = new Date();
      const duration = trackedTask ? errorAt - trackedTask.startTime : null;

      const taskEvent = {
        task_id: taskId,
        task_name: taskData.name || taskData.title || trackedTask?.task_name || 'Unknown Task',
        agent_id: taskData.agentId || taskData.agent_id || trackedTask?.agent_id || 'system',
        event_type: 'task_execution',
        event_name: 'task_error',
        status: 'error',
        input_data: trackedTask?.input_data || {},
        error_data: {
          error: taskData.error?.message || taskData.error || 'Unknown error',
          stack: taskData.error?.stack,
          code: taskData.error?.code
        },
        metadata: {
          source: 'EventIntegration',
          originalEvent: 'task:error',
          ...taskData.metadata
        },
        started_at: trackedTask?.started_at,
        completed_at: errorAt,
        duration_ms: duration
      };

      await this.eventStore.logTaskEvent(taskEvent);
      
      // Remove from tracking
      this.taskTracking.delete(taskId);

      console.log(`[EventIntegration] Task error: ${taskId}`);
    } catch (error) {
      console.error('[EventIntegration] Failed to handle task error:', error);
    }
  }

  /**
   * Handle task cancelled event
   */
  async handleTaskCancelled(taskData) {
    if (!this.isEnabled) return;

    try {
      const taskId = taskData.id || taskData.taskId;
      const trackedTask = this.taskTracking.get(taskId);
      const cancelledAt = new Date();
      const duration = trackedTask ? cancelledAt - trackedTask.startTime : null;

      const taskEvent = {
        task_id: taskId,
        task_name: taskData.name || taskData.title || trackedTask?.task_name || 'Unknown Task',
        agent_id: taskData.agentId || taskData.agent_id || trackedTask?.agent_id || 'system',
        event_type: 'task_execution',
        event_name: 'task_cancelled',
        status: 'cancelled',
        input_data: trackedTask?.input_data || {},
        metadata: {
          source: 'EventIntegration',
          originalEvent: 'task:cancelled',
          reason: taskData.reason,
          ...taskData.metadata
        },
        started_at: trackedTask?.started_at,
        completed_at: cancelledAt,
        duration_ms: duration
      };

      await this.eventStore.logTaskEvent(taskEvent);
      
      // Remove from tracking
      this.taskTracking.delete(taskId);

      console.log(`[EventIntegration] Task cancelled: ${taskId}`);
    } catch (error) {
      console.error('[EventIntegration] Failed to handle task cancelled:', error);
    }
  }

  /**
   * Handle agent registered event
   */
  async handleAgentRegistered(agentData) {
    if (!this.isEnabled) return;

    try {
      const agentEvent = {
        agent_id: agentData.id || agentData.agentId,
        agent_name: agentData.name || agentData.type || 'Unknown Agent',
        parent_agent_id: agentData.parentId,
        event_type: 'agent_lifecycle',
        event_name: 'agent_registered',
        action: 'register',
        status: 'active',
        context: {
          capabilities: agentData.capabilities || [],
          config: agentData.config || {}
        },
        metadata: {
          source: 'EventIntegration',
          originalEvent: 'agent:registered',
          ...agentData.metadata
        }
      };

      await this.eventStore.logAgentEvent(agentEvent);
      
      // Track the agent
      this.agentTracking.set(agentEvent.agent_id, {
        registeredAt: new Date(),
        ...agentEvent
      });

      console.log(`[EventIntegration] Agent registered: ${agentEvent.agent_id}`);
    } catch (error) {
      console.error('[EventIntegration] Failed to handle agent registered:', error);
    }
  }

  /**
   * Handle agent action event
   */
  async handleAgentAction(actionData) {
    if (!this.isEnabled) return;

    try {
      const agentEvent = {
        agent_id: actionData.agentId || actionData.agent_id,
        agent_name: actionData.agentName,
        event_type: 'agent_action',
        event_name: actionData.action || 'unknown_action',
        action: actionData.action,
        status: actionData.status || 'completed',
        context: actionData.context || {},
        result: actionData.result || {},
        metadata: {
          source: 'EventIntegration',
          originalEvent: 'agent:action',
          ...actionData.metadata
        },
        duration_ms: actionData.duration
      };

      await this.eventStore.logAgentEvent(agentEvent);

      console.log(`[EventIntegration] Agent action: ${agentEvent.agent_id}/${agentEvent.action}`);
    } catch (error) {
      console.error('[EventIntegration] Failed to handle agent action:', error);
    }
  }

  /**
   * Handle agent error event
   */
  async handleAgentError(errorData) {
    if (!this.isEnabled) return;

    try {
      const agentEvent = {
        agent_id: errorData.agentId || errorData.agent_id,
        agent_name: errorData.agentName,
        event_type: 'agent_error',
        event_name: 'agent_error',
        action: errorData.action,
        status: 'error',
        context: errorData.context || {},
        error_data: {
          error: errorData.error?.message || errorData.error || 'Unknown error',
          stack: errorData.error?.stack,
          code: errorData.error?.code
        },
        metadata: {
          source: 'EventIntegration',
          originalEvent: 'agent:error',
          ...errorData.metadata
        }
      };

      await this.eventStore.logAgentEvent(agentEvent);

      console.log(`[EventIntegration] Agent error: ${agentEvent.agent_id}`);
    } catch (error) {
      console.error('[EventIntegration] Failed to handle agent error:', error);
    }
  }

  /**
   * Handle agent unregistered event
   */
  async handleAgentUnregistered(agentData) {
    if (!this.isEnabled) return;

    try {
      const agentId = agentData.id || agentData.agentId;
      const trackedAgent = this.agentTracking.get(agentId);

      const agentEvent = {
        agent_id: agentId,
        agent_name: agentData.name || trackedAgent?.agent_name || 'Unknown Agent',
        event_type: 'agent_lifecycle',
        event_name: 'agent_unregistered',
        action: 'unregister',
        status: 'idle',
        metadata: {
          source: 'EventIntegration',
          originalEvent: 'agent:unregistered',
          reason: agentData.reason,
          ...agentData.metadata
        }
      };

      await this.eventStore.logAgentEvent(agentEvent);
      
      // Remove from tracking
      this.agentTracking.delete(agentId);

      console.log(`[EventIntegration] Agent unregistered: ${agentId}`);
    } catch (error) {
      console.error('[EventIntegration] Failed to handle agent unregistered:', error);
    }
  }

  /**
   * Handle deployment started event
   */
  async handleDeploymentStarted(deploymentData) {
    if (!this.isEnabled) return;

    try {
      const deploymentEvent = {
        deployment_id: deploymentData.id || deploymentData.deploymentId,
        environment: deploymentData.environment || 'wsl2',
        event_type: 'deployment',
        event_name: 'deployment_started',
        status: 'running',
        branch_name: deploymentData.branch,
        commit_hash: deploymentData.commit,
        pr_number: deploymentData.prNumber,
        deployment_config: deploymentData.config || {},
        metadata: {
          source: 'EventIntegration',
          originalEvent: 'deployment:started',
          ...deploymentData.metadata
        },
        started_at: new Date()
      };

      await this.eventStore.logDeploymentEvent(deploymentEvent);

      console.log(`[EventIntegration] Deployment started: ${deploymentEvent.deployment_id}`);
    } catch (error) {
      console.error('[EventIntegration] Failed to handle deployment started:', error);
    }
  }

  /**
   * Handle deployment completed event
   */
  async handleDeploymentCompleted(deploymentData) {
    if (!this.isEnabled) return;

    try {
      const deploymentEvent = {
        deployment_id: deploymentData.id || deploymentData.deploymentId,
        environment: deploymentData.environment || 'wsl2',
        event_type: 'deployment',
        event_name: 'deployment_completed',
        status: 'completed',
        branch_name: deploymentData.branch,
        commit_hash: deploymentData.commit,
        pr_number: deploymentData.prNumber,
        deployment_config: deploymentData.config || {},
        logs: deploymentData.logs || {},
        metadata: {
          source: 'EventIntegration',
          originalEvent: 'deployment:completed',
          ...deploymentData.metadata
        },
        completed_at: new Date(),
        duration_ms: deploymentData.duration
      };

      await this.eventStore.logDeploymentEvent(deploymentEvent);

      console.log(`[EventIntegration] Deployment completed: ${deploymentEvent.deployment_id}`);
    } catch (error) {
      console.error('[EventIntegration] Failed to handle deployment completed:', error);
    }
  }

  /**
   * Handle deployment error event
   */
  async handleDeploymentError(deploymentData) {
    if (!this.isEnabled) return;

    try {
      const deploymentEvent = {
        deployment_id: deploymentData.id || deploymentData.deploymentId,
        environment: deploymentData.environment || 'wsl2',
        event_type: 'deployment',
        event_name: 'deployment_error',
        status: 'error',
        branch_name: deploymentData.branch,
        commit_hash: deploymentData.commit,
        pr_number: deploymentData.prNumber,
        deployment_config: deploymentData.config || {},
        logs: deploymentData.logs || {},
        error_data: {
          error: deploymentData.error?.message || deploymentData.error || 'Unknown error',
          stack: deploymentData.error?.stack,
          code: deploymentData.error?.code
        },
        metadata: {
          source: 'EventIntegration',
          originalEvent: 'deployment:error',
          ...deploymentData.metadata
        },
        completed_at: new Date(),
        duration_ms: deploymentData.duration
      };

      await this.eventStore.logDeploymentEvent(deploymentEvent);

      console.log(`[EventIntegration] Deployment error: ${deploymentEvent.deployment_id}`);
    } catch (error) {
      console.error('[EventIntegration] Failed to handle deployment error:', error);
    }
  }

  /**
   * Handle system event
   */
  async handleSystemEvent(eventData) {
    if (!this.isEnabled) return;

    try {
      const systemEvent = {
        event_type: eventData.type || 'system',
        event_name: eventData.name || 'system_event',
        agent_id: eventData.agentId,
        session_id: eventData.sessionId,
        user_id: eventData.userId,
        data: eventData.data || {},
        metadata: {
          source: 'EventIntegration',
          originalEvent: 'system:event',
          ...eventData.metadata
        },
        status: eventData.status || 'completed',
        duration_ms: eventData.duration
      };

      await this.eventStore.logSystemEvent(systemEvent);

      console.log(`[EventIntegration] System event: ${systemEvent.event_type}/${systemEvent.event_name}`);
    } catch (error) {
      console.error('[EventIntegration] Failed to handle system event:', error);
    }
  }

  /**
   * Manually log a custom event
   */
  async logCustomEvent(eventType, eventData) {
    if (!this.isEnabled) return null;

    try {
      switch (eventType) {
        case 'system':
          return await this.eventStore.logSystemEvent(eventData);
        case 'task':
          return await this.eventStore.logTaskEvent(eventData);
        case 'agent':
          return await this.eventStore.logAgentEvent(eventData);
        case 'deployment':
          return await this.eventStore.logDeploymentEvent(eventData);
        default:
          return await this.eventStore.logSystemEvent({
            event_type: 'custom',
            event_name: eventType,
            ...eventData
          });
      }
    } catch (error) {
      console.error('[EventIntegration] Failed to log custom event:', error);
      return null;
    }
  }

  /**
   * Query events with filtering
   */
  async queryEvents(options) {
    return await this.eventStore.querySystemEvents(options);
  }

  /**
   * Get event statistics
   */
  async getEventStatistics(options) {
    return await this.eventStore.getEventStatistics(options);
  }

  /**
   * Get health status
   */
  async getHealthStatus() {
    const eventStoreHealth = await this.eventStore.getHealthStatus();
    
    return {
      ...eventStoreHealth,
      integration: {
        enabled: this.isEnabled,
        trackedTasks: this.taskTracking.size,
        trackedAgents: this.agentTracking.size
      }
    };
  }

  /**
   * Enable or disable event integration
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(`[EventIntegration] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * Close the integration system
   */
  async close() {
    await this.eventStore.close();
    this.taskTracking.clear();
    this.agentTracking.clear();
    console.log('[EventIntegration] Closed successfully');
  }
}

export default EventIntegration;

