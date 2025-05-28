/**
 * Dependency Resolver
 * Manages task dependencies and execution order
 */

/**
 * Dependency Resolver for task execution planning
 */
export class DependencyResolver {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Resolve dependencies and create execution plan
   * @param {Array} tasks - Array of tasks with dependencies
   */
  async resolveDependencies(tasks) {
    try {
      // Validate input
      if (!Array.isArray(tasks)) {
        throw new Error('Tasks must be an array');
      }

      // Create task map for quick lookup
      const taskMap = new Map();
      tasks.forEach(task => {
        if (!task.id) {
          throw new Error('All tasks must have an ID');
        }
        taskMap.set(task.id, task);
      });

      // Validate dependencies exist
      this._validateDependencies(tasks, taskMap);

      // Detect circular dependencies
      this._detectCircularDependencies(tasks, taskMap);

      // Create execution plan
      const executionPlan = this._createExecutionPlan(tasks, taskMap);

      return {
        success: true,
        executionPlan,
        metadata: {
          totalTasks: tasks.length,
          executionLevels: executionPlan.length,
          parallelizable: this._countParallelizableTasks(executionPlan),
          criticalPath: this._findCriticalPath(tasks, taskMap)
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        executionPlan: [],
        metadata: {}
      };
    }
  }

  /**
   * Check if dependencies can be resolved
   * @param {Array} tasks - Array of tasks
   */
  canResolveDependencies(tasks) {
    try {
      const taskMap = new Map();
      tasks.forEach(task => taskMap.set(task.id, task));
      
      this._validateDependencies(tasks, taskMap);
      this._detectCircularDependencies(tasks, taskMap);
      
      return { canResolve: true, issues: [] };
    } catch (error) {
      return { canResolve: false, issues: [error.message] };
    }
  }

  /**
   * Get task execution order (topological sort)
   * @param {Array} tasks - Array of tasks
   */
  getExecutionOrder(tasks) {
    const taskMap = new Map();
    tasks.forEach(task => taskMap.set(task.id, task));

    const visited = new Set();
    const visiting = new Set();
    const result = [];

    const visit = (taskId) => {
      if (visiting.has(taskId)) {
        throw new Error(`Circular dependency detected involving task ${taskId}`);
      }
      
      if (visited.has(taskId)) {
        return;
      }

      visiting.add(taskId);
      
      const task = taskMap.get(taskId);
      if (task && task.dependencies) {
        task.dependencies.forEach(depId => {
          if (taskMap.has(depId)) {
            visit(depId);
          }
        });
      }

      visiting.delete(taskId);
      visited.add(taskId);
      result.push(taskId);
    };

    tasks.forEach(task => {
      if (!visited.has(task.id)) {
        visit(task.id);
      }
    });

    return result;
  }

  /**
   * Find tasks that can run in parallel
   * @param {Array} tasks - Array of tasks
   */
  findParallelTasks(tasks) {
    const executionPlan = this._createExecutionPlan(tasks, new Map(tasks.map(t => [t.id, t])));
    
    return executionPlan.map((level, index) => ({
      level: index,
      tasks: level,
      canRunInParallel: level.length > 1
    }));
  }

  /**
   * Estimate execution time based on dependencies
   * @param {Array} tasks - Array of tasks with time estimates
   */
  estimateExecutionTime(tasks) {
    const taskMap = new Map();
    tasks.forEach(task => {
      taskMap.set(task.id, {
        ...task,
        estimatedMinutes: this._parseTimeEstimate(task.estimatedTime || '2 hours')
      });
    });

    const executionPlan = this._createExecutionPlan(tasks, taskMap);
    
    // Calculate sequential time (if no parallelization)
    const sequentialTime = tasks.reduce((total, task) => {
      return total + taskMap.get(task.id).estimatedMinutes;
    }, 0);

    // Calculate parallel time (with optimal parallelization)
    const parallelTime = executionPlan.reduce((maxTime, level) => {
      const levelTime = Math.max(...level.map(taskId => 
        taskMap.get(taskId).estimatedMinutes
      ));
      return maxTime + levelTime;
    }, 0);

    return {
      sequential: {
        minutes: sequentialTime,
        formatted: this._formatTime(sequentialTime)
      },
      parallel: {
        minutes: parallelTime,
        formatted: this._formatTime(parallelTime)
      },
      savings: {
        minutes: sequentialTime - parallelTime,
        percentage: Math.round(((sequentialTime - parallelTime) / sequentialTime) * 100)
      }
    };
  }

  /**
   * Optimize task order for efficiency
   * @param {Array} tasks - Array of tasks
   * @param {Object} criteria - Optimization criteria
   */
  optimizeExecutionOrder(tasks, criteria = {}) {
    const {
      prioritizeHighPriority = true,
      minimizeWaitTime = true,
      balanceLoad = true
    } = criteria;

    const taskMap = new Map(tasks.map(t => [t.id, t]));
    let executionPlan = this._createExecutionPlan(tasks, taskMap);

    // Apply optimizations
    if (prioritizeHighPriority) {
      executionPlan = this._prioritizeByPriority(executionPlan, taskMap);
    }

    if (minimizeWaitTime) {
      executionPlan = this._minimizeWaitTime(executionPlan, taskMap);
    }

    if (balanceLoad) {
      executionPlan = this._balanceLoad(executionPlan, taskMap);
    }

    return executionPlan;
  }

  /**
   * Private: Validate that all dependencies exist
   */
  _validateDependencies(tasks, taskMap) {
    const issues = [];

    tasks.forEach(task => {
      if (task.dependencies) {
        task.dependencies.forEach(depId => {
          if (!taskMap.has(depId)) {
            issues.push(`Task ${task.id} depends on non-existent task ${depId}`);
          }
        });
      }
    });

    if (issues.length > 0) {
      throw new Error(`Dependency validation failed: ${issues.join(', ')}`);
    }
  }

  /**
   * Private: Detect circular dependencies using DFS
   */
  _detectCircularDependencies(tasks, taskMap) {
    const visited = new Set();
    const visiting = new Set();

    const visit = (taskId, path = []) => {
      if (visiting.has(taskId)) {
        const cycle = path.slice(path.indexOf(taskId));
        throw new Error(`Circular dependency detected: ${cycle.join(' -> ')} -> ${taskId}`);
      }

      if (visited.has(taskId)) {
        return;
      }

      visiting.add(taskId);
      path.push(taskId);

      const task = taskMap.get(taskId);
      if (task && task.dependencies) {
        task.dependencies.forEach(depId => {
          if (taskMap.has(depId)) {
            visit(depId, [...path]);
          }
        });
      }

      visiting.delete(taskId);
      visited.add(taskId);
      path.pop();
    };

    tasks.forEach(task => {
      if (!visited.has(task.id)) {
        visit(task.id);
      }
    });
  }

  /**
   * Private: Create execution plan with dependency levels
   */
  _createExecutionPlan(tasks, taskMap) {
    const inDegree = new Map();
    const adjList = new Map();

    // Initialize
    tasks.forEach(task => {
      inDegree.set(task.id, 0);
      adjList.set(task.id, []);
    });

    // Build adjacency list and calculate in-degrees
    tasks.forEach(task => {
      if (task.dependencies) {
        task.dependencies.forEach(depId => {
          if (taskMap.has(depId)) {
            adjList.get(depId).push(task.id);
            inDegree.set(task.id, inDegree.get(task.id) + 1);
          }
        });
      }
    });

    // Kahn's algorithm for topological sorting with levels
    const executionPlan = [];
    const queue = [];

    // Find all tasks with no dependencies
    for (const [taskId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(taskId);
      }
    }

    while (queue.length > 0) {
      const currentLevel = [...queue];
      queue.length = 0;
      
      executionPlan.push(currentLevel);

      currentLevel.forEach(taskId => {
        adjList.get(taskId).forEach(dependentId => {
          inDegree.set(dependentId, inDegree.get(dependentId) - 1);
          if (inDegree.get(dependentId) === 0) {
            queue.push(dependentId);
          }
        });
      });
    }

    // Check if all tasks were processed
    const processedTasks = executionPlan.flat().length;
    if (processedTasks !== tasks.length) {
      throw new Error('Unable to resolve all dependencies - circular dependency likely exists');
    }

    return executionPlan;
  }

  /**
   * Private: Count parallelizable tasks
   */
  _countParallelizableTasks(executionPlan) {
    return executionPlan.reduce((count, level) => {
      return count + (level.length > 1 ? level.length : 0);
    }, 0);
  }

  /**
   * Private: Find critical path
   */
  _findCriticalPath(tasks, taskMap) {
    // Simplified critical path - longest dependency chain
    const visited = new Set();
    let longestPath = [];

    const findLongestPath = (taskId, currentPath = []) => {
      if (visited.has(taskId)) {
        return currentPath;
      }

      visited.add(taskId);
      currentPath.push(taskId);

      const task = taskMap.get(taskId);
      let maxPath = [...currentPath];

      if (task && task.dependencies) {
        task.dependencies.forEach(depId => {
          if (taskMap.has(depId)) {
            const path = findLongestPath(depId, [...currentPath]);
            if (path.length > maxPath.length) {
              maxPath = path;
            }
          }
        });
      }

      return maxPath;
    };

    tasks.forEach(task => {
      visited.clear();
      const path = findLongestPath(task.id);
      if (path.length > longestPath.length) {
        longestPath = path;
      }
    });

    return longestPath;
  }

  /**
   * Private: Parse time estimate to minutes
   */
  _parseTimeEstimate(timeStr) {
    const timeRegex = /(\d+)\s*(hour|hr|h|minute|min|m)/gi;
    let totalMinutes = 0;
    let match;

    while ((match = timeRegex.exec(timeStr)) !== null) {
      const value = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      
      if (unit.startsWith('h')) {
        totalMinutes += value * 60;
      } else if (unit.startsWith('m')) {
        totalMinutes += value;
      }
    }

    return totalMinutes || 120; // Default 2 hours
  }

  /**
   * Private: Format time in minutes to readable string
   */
  _formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours === 0) {
      return `${mins} minutes`;
    } else if (mins === 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      return `${hours} hour${hours > 1 ? 's' : ''} ${mins} minutes`;
    }
  }

  /**
   * Private: Prioritize by task priority
   */
  _prioritizeByPriority(executionPlan, taskMap) {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    
    return executionPlan.map(level => {
      return level.sort((a, b) => {
        const priorityA = priorityOrder[taskMap.get(a).priority] || 2;
        const priorityB = priorityOrder[taskMap.get(b).priority] || 2;
        return priorityB - priorityA;
      });
    });
  }

  /**
   * Private: Minimize wait time
   */
  _minimizeWaitTime(executionPlan, taskMap) {
    // Sort by estimated time (shorter tasks first within each level)
    return executionPlan.map(level => {
      return level.sort((a, b) => {
        const timeA = this._parseTimeEstimate(taskMap.get(a).estimatedTime || '2 hours');
        const timeB = this._parseTimeEstimate(taskMap.get(b).estimatedTime || '2 hours');
        return timeA - timeB;
      });
    });
  }

  /**
   * Private: Balance load across parallel tasks
   */
  _balanceLoad(executionPlan, taskMap) {
    // For levels with multiple tasks, try to balance total time
    return executionPlan.map(level => {
      if (level.length <= 1) return level;

      const tasksWithTime = level.map(taskId => ({
        id: taskId,
        time: this._parseTimeEstimate(taskMap.get(taskId).estimatedTime || '2 hours')
      }));

      // Simple balancing: alternate between longest and shortest
      tasksWithTime.sort((a, b) => b.time - a.time);
      
      const balanced = [];
      let left = 0, right = tasksWithTime.length - 1;
      let useLeft = true;

      while (left <= right) {
        if (useLeft) {
          balanced.push(tasksWithTime[left++].id);
        } else {
          balanced.push(tasksWithTime[right--].id);
        }
        useLeft = !useLeft;
      }

      return balanced;
    });
  }
}

export default DependencyResolver;

