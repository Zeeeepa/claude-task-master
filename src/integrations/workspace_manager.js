/**
 * @fileoverview Workspace Manager
 * @description WSL2 workspace management for Claude Code operations
 */

import { promises as fs } from 'fs';
import path from 'path';
import { AgentAPIClient } from './agentapi_client.js';

/**
 * Workspace Manager for WSL2 environments
 */
export class WorkspaceManager {
  constructor(config = {}) {
    this.config = {
      basePath: config.basePath || '/tmp/workspace',
      cleanupAfter: config.cleanupAfter || 3600000, // 1 hour
      maxConcurrent: config.maxConcurrent || 10,
      maxDiskUsage: config.maxDiskUsage || 10 * 1024 * 1024 * 1024, // 10GB
      ...config
    };
    
    this.agentAPI = new AgentAPIClient(config.agentAPI || {});
    this.activeWorkspaces = new Map();
    this.cleanupInterval = null;
    
    this.startCleanupScheduler();
  }

  /**
   * Create a new workspace for a task
   * @param {string} taskId - Task identifier
   * @param {Object} options - Workspace options
   * @returns {Promise<Object>} Workspace information
   */
  async createWorkspace(taskId, options = {}) {
    try {
      // Check if we're at capacity
      if (this.activeWorkspaces.size >= this.config.maxConcurrent) {
        throw new Error(`Maximum concurrent workspaces (${this.config.maxConcurrent}) reached`);
      }

      const workspacePath = path.join(this.config.basePath, taskId);
      const workspace = {
        id: taskId,
        path: workspacePath,
        createdAt: new Date(),
        lastAccessed: new Date(),
        status: 'creating',
        repository: options.repository || null,
        branch: options.branch || 'main',
        environment: options.environment || {},
        metadata: options.metadata || {}
      };

      // Create workspace directory
      await this.ensureDirectory(workspacePath);
      
      // Clone repository if specified
      if (options.repository) {
        await this.cloneRepository(workspace, options.repository, options.branch);
      }

      // Set up environment
      if (options.environment) {
        await this.setupEnvironment(workspace, options.environment);
      }

      workspace.status = 'ready';
      this.activeWorkspaces.set(taskId, workspace);

      console.log(`Created workspace for task ${taskId} at ${workspacePath}`);
      return workspace;

    } catch (error) {
      console.error(`Failed to create workspace for task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Get workspace information
   * @param {string} taskId - Task identifier
   * @returns {Object|null} Workspace information
   */
  getWorkspace(taskId) {
    return this.activeWorkspaces.get(taskId) || null;
  }

  /**
   * Update workspace last accessed time
   * @param {string} taskId - Task identifier
   */
  touchWorkspace(taskId) {
    const workspace = this.activeWorkspaces.get(taskId);
    if (workspace) {
      workspace.lastAccessed = new Date();
    }
  }

  /**
   * Clone a repository into the workspace
   * @param {Object} workspace - Workspace object
   * @param {string} repository - Repository URL
   * @param {string} branch - Branch name
   * @returns {Promise<void>}
   */
  async cloneRepository(workspace, repository, branch = 'main') {
    try {
      workspace.status = 'cloning';
      
      const cloneCommand = `git clone --branch ${branch} --single-branch ${repository} ${workspace.path}/repo`;
      
      await this.agentAPI.sendMessage(`Please execute: ${cloneCommand}`);
      await this.agentAPI.waitForCompletion();
      
      // Change working directory to the repo
      await this.agentAPI.sendMessage(`cd ${workspace.path}/repo`);
      
      workspace.repository = repository;
      workspace.branch = branch;
      
      console.log(`Cloned repository ${repository} (${branch}) to workspace ${workspace.id}`);
      
    } catch (error) {
      workspace.status = 'error';
      throw new Error(`Failed to clone repository: ${error.message}`);
    }
  }

  /**
   * Set up environment variables and dependencies
   * @param {Object} workspace - Workspace object
   * @param {Object} environment - Environment configuration
   * @returns {Promise<void>}
   */
  async setupEnvironment(workspace, environment) {
    try {
      workspace.status = 'configuring';
      
      // Set environment variables
      if (environment.variables) {
        for (const [key, value] of Object.entries(environment.variables)) {
          await this.agentAPI.sendMessage(`export ${key}="${value}"`);
        }
      }

      // Install dependencies
      if (environment.dependencies) {
        const { nodePackages, pythonPackages, systemPackages } = environment.dependencies;
        
        if (nodePackages && nodePackages.length > 0) {
          await this.installNodePackages(workspace, nodePackages);
        }
        
        if (pythonPackages && pythonPackages.length > 0) {
          await this.installPythonPackages(workspace, pythonPackages);
        }
        
        if (systemPackages && systemPackages.length > 0) {
          await this.installSystemPackages(workspace, systemPackages);
        }
      }

      // Run setup scripts
      if (environment.setupScripts) {
        for (const script of environment.setupScripts) {
          await this.agentAPI.sendMessage(`Please execute: ${script}`);
          await this.agentAPI.waitForCompletion();
        }
      }

      workspace.environment = environment;
      console.log(`Environment setup completed for workspace ${workspace.id}`);
      
    } catch (error) {
      workspace.status = 'error';
      throw new Error(`Failed to setup environment: ${error.message}`);
    }
  }

  /**
   * Install Node.js packages
   * @param {Object} workspace - Workspace object
   * @param {Array} packages - Package names
   * @returns {Promise<void>}
   */
  async installNodePackages(workspace, packages) {
    const installCommand = `npm install ${packages.join(' ')}`;
    await this.agentAPI.sendMessage(`Please execute: ${installCommand}`);
    await this.agentAPI.waitForCompletion();
    console.log(`Installed Node packages: ${packages.join(', ')}`);
  }

  /**
   * Install Python packages
   * @param {Object} workspace - Workspace object
   * @param {Array} packages - Package names
   * @returns {Promise<void>}
   */
  async installPythonPackages(workspace, packages) {
    const installCommand = `pip install ${packages.join(' ')}`;
    await this.agentAPI.sendMessage(`Please execute: ${installCommand}`);
    await this.agentAPI.waitForCompletion();
    console.log(`Installed Python packages: ${packages.join(', ')}`);
  }

  /**
   * Install system packages
   * @param {Object} workspace - Workspace object
   * @param {Array} packages - Package names
   * @returns {Promise<void>}
   */
  async installSystemPackages(workspace, packages) {
    const installCommand = `sudo apt-get update && sudo apt-get install -y ${packages.join(' ')}`;
    await this.agentAPI.sendMessage(`Please execute: ${installCommand}`);
    await this.agentAPI.waitForCompletion();
    console.log(`Installed system packages: ${packages.join(', ')}`);
  }

  /**
   * Clean up a workspace
   * @param {string} taskId - Task identifier
   * @returns {Promise<void>}
   */
  async cleanupWorkspace(taskId) {
    try {
      const workspace = this.activeWorkspaces.get(taskId);
      if (!workspace) {
        return;
      }

      workspace.status = 'cleaning';
      
      // Remove workspace directory
      await this.agentAPI.sendMessage(`rm -rf ${workspace.path}`);
      
      this.activeWorkspaces.delete(taskId);
      console.log(`Cleaned up workspace for task ${taskId}`);
      
    } catch (error) {
      console.error(`Failed to cleanup workspace for task ${taskId}:`, error);
    }
  }

  /**
   * Get workspace statistics
   * @returns {Promise<Object>} Statistics
   */
  async getStatistics() {
    const stats = {
      activeWorkspaces: this.activeWorkspaces.size,
      maxConcurrent: this.config.maxConcurrent,
      basePath: this.config.basePath,
      workspaces: []
    };

    for (const [taskId, workspace] of this.activeWorkspaces) {
      stats.workspaces.push({
        id: taskId,
        status: workspace.status,
        createdAt: workspace.createdAt,
        lastAccessed: workspace.lastAccessed,
        repository: workspace.repository,
        branch: workspace.branch
      });
    }

    try {
      // Get disk usage
      const diskUsage = await this.getDiskUsage();
      stats.diskUsage = diskUsage;
    } catch (error) {
      console.error('Failed to get disk usage:', error);
    }

    return stats;
  }

  /**
   * Get disk usage for workspace directory
   * @returns {Promise<Object>} Disk usage information
   */
  async getDiskUsage() {
    try {
      // Use du command to get disk usage
      await this.agentAPI.sendMessage(`du -sh ${this.config.basePath}`);
      const messages = await this.agentAPI.getMessages();
      
      // Parse the output (simplified)
      const lastMessage = messages[messages.length - 1];
      const usage = lastMessage?.content || '0B';
      
      return {
        total: usage,
        path: this.config.basePath,
        maxAllowed: this.config.maxDiskUsage
      };
    } catch (error) {
      return {
        total: 'unknown',
        path: this.config.basePath,
        error: error.message
      };
    }
  }

  /**
   * Start the cleanup scheduler
   */
  startCleanupScheduler() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Run cleanup every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.performScheduledCleanup();
    }, 10 * 60 * 1000);
  }

  /**
   * Perform scheduled cleanup of old workspaces
   */
  async performScheduledCleanup() {
    const now = Date.now();
    const workspacesToCleanup = [];

    for (const [taskId, workspace] of this.activeWorkspaces) {
      const age = now - workspace.lastAccessed.getTime();
      if (age > this.config.cleanupAfter) {
        workspacesToCleanup.push(taskId);
      }
    }

    for (const taskId of workspacesToCleanup) {
      await this.cleanupWorkspace(taskId);
    }

    if (workspacesToCleanup.length > 0) {
      console.log(`Cleaned up ${workspacesToCleanup.length} old workspaces`);
    }
  }

  /**
   * Ensure directory exists
   * @param {string} dirPath - Directory path
   * @returns {Promise<void>}
   */
  async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Stop the workspace manager
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clean up all workspaces
   * @returns {Promise<void>}
   */
  async cleanupAll() {
    const taskIds = Array.from(this.activeWorkspaces.keys());
    for (const taskId of taskIds) {
      await this.cleanupWorkspace(taskId);
    }
  }
}

export default WorkspaceManager;

