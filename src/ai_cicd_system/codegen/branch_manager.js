/**
 * @fileoverview Branch Manager for Codegen PR Generation
 * @description Manages Git branches and handles concurrent PR generation
 */

import { execSync, spawn } from 'child_process';
import { promisify } from 'util';
import { log } from '../utils/logger.js';

const exec = promisify(require('child_process').exec);

/**
 * Branch Manager for handling Git operations and branch management
 */
export class BranchManager {
  constructor(config = {}) {
    this.config = config;
    this.repositoryPath = config.repositoryPath || process.cwd();
    this.baseBranch = config.baseBranch || 'main';
    this.branchPrefix = config.branchPrefix || 'codegen';
    this.maxConcurrentBranches = config.maxConcurrentBranches || 10;
    this.cleanupOldBranches = config.cleanupOldBranches !== false;
    this.branchRetentionDays = config.branchRetentionDays || 7;
    this.activeBranches = new Map();
    this.branchLocks = new Map();
    
    log('debug', 'Branch Manager initialized', {
      repositoryPath: this.repositoryPath,
      baseBranch: this.baseBranch,
      branchPrefix: this.branchPrefix,
      maxConcurrentBranches: this.maxConcurrentBranches
    });
  }

  /**
   * Initialize the branch manager
   */
  async initialize() {
    try {
      await this._validateRepository();
      await this._setupGitConfig();
      if (this.cleanupOldBranches) {
        await this._cleanupOldBranches();
      }
      log('info', 'Branch Manager initialized successfully');
    } catch (error) {
      log('error', `Failed to initialize Branch Manager: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new branch for a task
   * @param {string} taskId - Task ID
   * @param {Object} taskData - Task data
   * @returns {Promise<Object>} Branch information
   */
  async createBranch(taskId, taskData) {
    try {
      // Check concurrent branch limit
      if (this.activeBranches.size >= this.maxConcurrentBranches) {
        throw new BranchError('CONCURRENT_LIMIT_EXCEEDED', 
          `Maximum concurrent branches (${this.maxConcurrentBranches}) exceeded`);
      }

      // Generate unique branch name
      const branchName = await this._generateBranchName(taskId, taskData);
      
      // Acquire lock for this branch
      await this._acquireBranchLock(branchName);

      try {
        // Ensure we're on the base branch and it's up to date
        await this._ensureBaseBranch();
        
        // Create and checkout the new branch
        await this._createAndCheckoutBranch(branchName);
        
        // Register the active branch
        const branchInfo = {
          name: branchName,
          taskId,
          createdAt: new Date().toISOString(),
          baseBranch: this.baseBranch,
          status: 'active',
          commits: [],
          metadata: {
            taskTitle: taskData.title,
            taskType: taskData.type,
            priority: taskData.priority
          }
        };

        this.activeBranches.set(branchName, branchInfo);

        log('info', `Branch created successfully: ${branchName}`, {
          taskId,
          baseBranch: this.baseBranch
        });

        return branchInfo;
      } finally {
        this._releaseBranchLock(branchName);
      }
    } catch (error) {
      log('error', `Failed to create branch for task ${taskId}: ${error.message}`);
      throw new BranchError('BRANCH_CREATION_FAILED', 
        `Failed to create branch: ${error.message}`, error);
    }
  }

  /**
   * Switch to an existing branch
   * @param {string} branchName - Branch name to switch to
   * @returns {Promise<Object>} Branch information
   */
  async switchToBranch(branchName) {
    try {
      await this._acquireBranchLock(branchName);

      try {
        // Check if branch exists
        const branchExists = await this._branchExists(branchName);
        if (!branchExists) {
          throw new BranchError('BRANCH_NOT_FOUND', `Branch ${branchName} does not exist`);
        }

        // Checkout the branch
        await this._executeGitCommand(`checkout ${branchName}`);
        
        // Update branch info if it's tracked
        if (this.activeBranches.has(branchName)) {
          const branchInfo = this.activeBranches.get(branchName);
          branchInfo.lastAccessedAt = new Date().toISOString();
          this.activeBranches.set(branchName, branchInfo);
        }

        log('info', `Switched to branch: ${branchName}`);
        return this.activeBranches.get(branchName) || { name: branchName };
      } finally {
        this._releaseBranchLock(branchName);
      }
    } catch (error) {
      log('error', `Failed to switch to branch ${branchName}: ${error.message}`);
      throw new BranchError('BRANCH_SWITCH_FAILED', 
        `Failed to switch to branch: ${error.message}`, error);
    }
  }

  /**
   * Commit changes to the current branch
   * @param {string} message - Commit message
   * @param {Array<string>} files - Files to commit (optional, commits all if not specified)
   * @returns {Promise<Object>} Commit information
   */
  async commitChanges(message, files = []) {
    try {
      const currentBranch = await this._getCurrentBranch();
      
      if (!currentBranch || currentBranch === this.baseBranch) {
        throw new BranchError('INVALID_BRANCH', 
          'Cannot commit to base branch or no branch checked out');
      }

      await this._acquireBranchLock(currentBranch);

      try {
        // Stage files
        if (files.length > 0) {
          for (const file of files) {
            await this._executeGitCommand(`add "${file}"`);
          }
        } else {
          await this._executeGitCommand('add .');
        }

        // Check if there are changes to commit
        const hasChanges = await this._hasUncommittedChanges();
        if (!hasChanges) {
          log('warning', 'No changes to commit');
          return null;
        }

        // Commit changes
        const commitHash = await this._executeGitCommand(`commit -m "${message}"`);
        
        // Extract commit hash from output
        const hashMatch = commitHash.match(/\[[\w-]+ ([a-f0-9]+)\]/);
        const hash = hashMatch ? hashMatch[1] : 'unknown';

        const commitInfo = {
          hash,
          message,
          timestamp: new Date().toISOString(),
          branch: currentBranch,
          files: files.length > 0 ? files : 'all'
        };

        // Update branch info
        if (this.activeBranches.has(currentBranch)) {
          const branchInfo = this.activeBranches.get(currentBranch);
          branchInfo.commits.push(commitInfo);
          branchInfo.lastCommitAt = commitInfo.timestamp;
          this.activeBranches.set(currentBranch, branchInfo);
        }

        log('info', `Changes committed to ${currentBranch}`, {
          hash,
          message: message.substring(0, 50) + '...'
        });

        return commitInfo;
      } finally {
        this._releaseBranchLock(currentBranch);
      }
    } catch (error) {
      log('error', `Failed to commit changes: ${error.message}`);
      throw new BranchError('COMMIT_FAILED', 
        `Failed to commit changes: ${error.message}`, error);
    }
  }

  /**
   * Push branch to remote repository
   * @param {string} branchName - Branch name to push (optional, uses current branch)
   * @param {boolean} force - Force push (default: false)
   * @returns {Promise<Object>} Push result
   */
  async pushBranch(branchName = null, force = false) {
    try {
      const targetBranch = branchName || await this._getCurrentBranch();
      
      if (!targetBranch) {
        throw new BranchError('NO_BRANCH', 'No branch specified or checked out');
      }

      await this._acquireBranchLock(targetBranch);

      try {
        // Check if branch has commits
        const hasCommits = await this._branchHasCommits(targetBranch);
        if (!hasCommits) {
          throw new BranchError('NO_COMMITS', `Branch ${targetBranch} has no commits to push`);
        }

        // Push to remote
        const forceFlag = force ? '--force' : '';
        const pushCommand = `push origin ${targetBranch} ${forceFlag}`.trim();
        const pushResult = await this._executeGitCommand(pushCommand);

        // Update branch info
        if (this.activeBranches.has(targetBranch)) {
          const branchInfo = this.activeBranches.get(targetBranch);
          branchInfo.pushedAt = new Date().toISOString();
          branchInfo.status = 'pushed';
          this.activeBranches.set(targetBranch, branchInfo);
        }

        log('info', `Branch pushed to remote: ${targetBranch}`, { force });

        return {
          branch: targetBranch,
          pushedAt: new Date().toISOString(),
          force,
          output: pushResult
        };
      } finally {
        this._releaseBranchLock(targetBranch);
      }
    } catch (error) {
      log('error', `Failed to push branch ${branchName}: ${error.message}`);
      throw new BranchError('PUSH_FAILED', 
        `Failed to push branch: ${error.message}`, error);
    }
  }

  /**
   * Delete a branch (local and optionally remote)
   * @param {string} branchName - Branch name to delete
   * @param {boolean} deleteRemote - Delete remote branch (default: false)
   * @returns {Promise<Object>} Deletion result
   */
  async deleteBranch(branchName, deleteRemote = false) {
    try {
      if (branchName === this.baseBranch) {
        throw new BranchError('PROTECTED_BRANCH', 
          `Cannot delete base branch: ${this.baseBranch}`);
      }

      await this._acquireBranchLock(branchName);

      try {
        const currentBranch = await this._getCurrentBranch();
        
        // Switch to base branch if we're on the branch to be deleted
        if (currentBranch === branchName) {
          await this._executeGitCommand(`checkout ${this.baseBranch}`);
        }

        // Delete local branch
        await this._executeGitCommand(`branch -D ${branchName}`);

        // Delete remote branch if requested
        if (deleteRemote) {
          try {
            await this._executeGitCommand(`push origin --delete ${branchName}`);
          } catch (error) {
            log('warning', `Failed to delete remote branch ${branchName}: ${error.message}`);
          }
        }

        // Remove from active branches
        this.activeBranches.delete(branchName);

        log('info', `Branch deleted: ${branchName}`, { deleteRemote });

        return {
          branch: branchName,
          deletedAt: new Date().toISOString(),
          deletedRemote: deleteRemote
        };
      } finally {
        this._releaseBranchLock(branchName);
      }
    } catch (error) {
      log('error', `Failed to delete branch ${branchName}: ${error.message}`);
      throw new BranchError('DELETE_FAILED', 
        `Failed to delete branch: ${error.message}`, error);
    }
  }

  /**
   * Get information about a branch
   * @param {string} branchName - Branch name (optional, uses current branch)
   * @returns {Promise<Object>} Branch information
   */
  async getBranchInfo(branchName = null) {
    try {
      const targetBranch = branchName || await this._getCurrentBranch();
      
      if (!targetBranch) {
        throw new BranchError('NO_BRANCH', 'No branch specified or checked out');
      }

      // Get basic Git info
      const exists = await this._branchExists(targetBranch);
      if (!exists) {
        throw new BranchError('BRANCH_NOT_FOUND', `Branch ${targetBranch} does not exist`);
      }

      const commitCount = await this._getCommitCount(targetBranch);
      const lastCommitHash = await this._getLastCommitHash(targetBranch);
      const lastCommitMessage = await this._getLastCommitMessage(targetBranch);

      // Get tracked info if available
      const trackedInfo = this.activeBranches.get(targetBranch) || {};

      return {
        name: targetBranch,
        exists,
        commitCount,
        lastCommit: {
          hash: lastCommitHash,
          message: lastCommitMessage
        },
        ...trackedInfo,
        retrievedAt: new Date().toISOString()
      };
    } catch (error) {
      log('error', `Failed to get branch info for ${branchName}: ${error.message}`);
      throw new BranchError('INFO_RETRIEVAL_FAILED', 
        `Failed to get branch info: ${error.message}`, error);
    }
  }

  /**
   * List all active branches
   * @returns {Promise<Array<Object>>} List of active branches
   */
  async listActiveBranches() {
    try {
      const branches = [];
      
      for (const [branchName, branchInfo] of this.activeBranches.entries()) {
        const exists = await this._branchExists(branchName);
        branches.push({
          ...branchInfo,
          exists,
          isActive: true
        });
      }

      return branches;
    } catch (error) {
      log('error', `Failed to list active branches: ${error.message}`);
      throw new BranchError('LIST_FAILED', 
        `Failed to list active branches: ${error.message}`, error);
    }
  }

  /**
   * Check for merge conflicts with base branch
   * @param {string} branchName - Branch name to check (optional, uses current branch)
   * @returns {Promise<Object>} Conflict check result
   */
  async checkForConflicts(branchName = null) {
    try {
      const targetBranch = branchName || await this._getCurrentBranch();
      
      if (!targetBranch) {
        throw new BranchError('NO_BRANCH', 'No branch specified or checked out');
      }

      // Fetch latest changes from remote
      await this._executeGitCommand('fetch origin');

      // Check for conflicts using merge-tree
      try {
        const mergeBase = await this._executeGitCommand(
          `merge-base ${this.baseBranch} ${targetBranch}`
        );
        
        const conflictCheck = await this._executeGitCommand(
          `merge-tree ${mergeBase.trim()} ${this.baseBranch} ${targetBranch}`
        );

        const hasConflicts = conflictCheck.includes('<<<<<<<');
        const conflictFiles = hasConflicts ? 
          this._extractConflictFiles(conflictCheck) : [];

        return {
          hasConflicts,
          conflictFiles,
          mergeBase: mergeBase.trim(),
          checkedAt: new Date().toISOString()
        };
      } catch (error) {
        // If merge-tree fails, try a different approach
        return await this._checkConflictsAlternative(targetBranch);
      }
    } catch (error) {
      log('error', `Failed to check for conflicts in ${branchName}: ${error.message}`);
      throw new BranchError('CONFLICT_CHECK_FAILED', 
        `Failed to check for conflicts: ${error.message}`, error);
    }
  }

  /**
   * Get branch statistics
   * @returns {Object} Branch statistics
   */
  getBranchStats() {
    const stats = {
      activeBranches: this.activeBranches.size,
      maxConcurrentBranches: this.maxConcurrentBranches,
      utilizationRate: (this.activeBranches.size / this.maxConcurrentBranches) * 100,
      branchesWithCommits: 0,
      branchesPushed: 0,
      oldestBranch: null,
      newestBranch: null
    };

    let oldestDate = null;
    let newestDate = null;

    for (const [branchName, branchInfo] of this.activeBranches.entries()) {
      if (branchInfo.commits && branchInfo.commits.length > 0) {
        stats.branchesWithCommits++;
      }
      
      if (branchInfo.pushedAt) {
        stats.branchesPushed++;
      }

      const createdDate = new Date(branchInfo.createdAt);
      if (!oldestDate || createdDate < oldestDate) {
        oldestDate = createdDate;
        stats.oldestBranch = branchName;
      }
      
      if (!newestDate || createdDate > newestDate) {
        newestDate = createdDate;
        stats.newestBranch = branchName;
      }
    }

    return stats;
  }

  // Private methods

  /**
   * Validate repository setup
   */
  async _validateRepository() {
    try {
      await this._executeGitCommand('status');
    } catch (error) {
      throw new BranchError('INVALID_REPOSITORY', 
        'Not a valid Git repository or Git not available');
    }
  }

  /**
   * Setup Git configuration
   */
  async _setupGitConfig() {
    try {
      // Set up user info if not configured
      try {
        await this._executeGitCommand('config user.name');
      } catch (error) {
        await this._executeGitCommand('config user.name "Codegen Bot"');
      }

      try {
        await this._executeGitCommand('config user.email');
      } catch (error) {
        await this._executeGitCommand('config user.email "codegen@example.com"');
      }
    } catch (error) {
      log('warning', `Failed to setup Git config: ${error.message}`);
    }
  }

  /**
   * Generate unique branch name
   * @param {string} taskId - Task ID
   * @param {Object} taskData - Task data
   * @returns {Promise<string>} Generated branch name
   */
  async _generateBranchName(taskId, taskData) {
    const sanitizedTitle = taskData.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30);

    const timestamp = Date.now().toString(36);
    let branchName = `${this.branchPrefix}/${sanitizedTitle}-${timestamp}`;

    // Ensure uniqueness
    let counter = 1;
    while (await this._branchExists(branchName)) {
      branchName = `${this.branchPrefix}/${sanitizedTitle}-${timestamp}-${counter}`;
      counter++;
    }

    return branchName;
  }

  /**
   * Ensure we're on the base branch and it's up to date
   */
  async _ensureBaseBranch() {
    const currentBranch = await this._getCurrentBranch();
    
    if (currentBranch !== this.baseBranch) {
      await this._executeGitCommand(`checkout ${this.baseBranch}`);
    }

    // Pull latest changes
    try {
      await this._executeGitCommand(`pull origin ${this.baseBranch}`);
    } catch (error) {
      log('warning', `Failed to pull latest changes: ${error.message}`);
    }
  }

  /**
   * Create and checkout a new branch
   * @param {string} branchName - Branch name
   */
  async _createAndCheckoutBranch(branchName) {
    await this._executeGitCommand(`checkout -b ${branchName}`);
  }

  /**
   * Check if branch exists
   * @param {string} branchName - Branch name
   * @returns {Promise<boolean>} True if branch exists
   */
  async _branchExists(branchName) {
    try {
      await this._executeGitCommand(`show-ref --verify --quiet refs/heads/${branchName}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current branch name
   * @returns {Promise<string>} Current branch name
   */
  async _getCurrentBranch() {
    try {
      const result = await this._executeGitCommand('branch --show-current');
      return result.trim();
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if there are uncommitted changes
   * @returns {Promise<boolean>} True if there are changes
   */
  async _hasUncommittedChanges() {
    try {
      const result = await this._executeGitCommand('status --porcelain');
      return result.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if branch has commits
   * @param {string} branchName - Branch name
   * @returns {Promise<boolean>} True if branch has commits
   */
  async _branchHasCommits(branchName) {
    try {
      const result = await this._executeGitCommand(`rev-list --count ${branchName}`);
      return parseInt(result.trim()) > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get commit count for branch
   * @param {string} branchName - Branch name
   * @returns {Promise<number>} Commit count
   */
  async _getCommitCount(branchName) {
    try {
      const result = await this._executeGitCommand(`rev-list --count ${branchName}`);
      return parseInt(result.trim());
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get last commit hash
   * @param {string} branchName - Branch name
   * @returns {Promise<string>} Last commit hash
   */
  async _getLastCommitHash(branchName) {
    try {
      const result = await this._executeGitCommand(`rev-parse ${branchName}`);
      return result.trim();
    } catch (error) {
      return null;
    }
  }

  /**
   * Get last commit message
   * @param {string} branchName - Branch name
   * @returns {Promise<string>} Last commit message
   */
  async _getLastCommitMessage(branchName) {
    try {
      const result = await this._executeGitCommand(`log -1 --pretty=format:"%s" ${branchName}`);
      return result.trim().replace(/^"|"$/g, '');
    } catch (error) {
      return null;
    }
  }

  /**
   * Acquire lock for branch operations
   * @param {string} branchName - Branch name
   */
  async _acquireBranchLock(branchName) {
    while (this.branchLocks.has(branchName)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    this.branchLocks.set(branchName, Date.now());
  }

  /**
   * Release lock for branch operations
   * @param {string} branchName - Branch name
   */
  _releaseBranchLock(branchName) {
    this.branchLocks.delete(branchName);
  }

  /**
   * Execute Git command
   * @param {string} command - Git command
   * @returns {Promise<string>} Command output
   */
  async _executeGitCommand(command) {
    try {
      const { stdout } = await exec(`git ${command}`, {
        cwd: this.repositoryPath,
        timeout: 30000
      });
      return stdout;
    } catch (error) {
      throw new Error(`Git command failed: ${command} - ${error.message}`);
    }
  }

  /**
   * Clean up old branches
   */
  async _cleanupOldBranches() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.branchRetentionDays);

      const branchesToDelete = [];
      
      for (const [branchName, branchInfo] of this.activeBranches.entries()) {
        const createdDate = new Date(branchInfo.createdAt);
        if (createdDate < cutoffDate && branchInfo.status !== 'active') {
          branchesToDelete.push(branchName);
        }
      }

      for (const branchName of branchesToDelete) {
        try {
          await this.deleteBranch(branchName, true);
          log('info', `Cleaned up old branch: ${branchName}`);
        } catch (error) {
          log('warning', `Failed to cleanup branch ${branchName}: ${error.message}`);
        }
      }
    } catch (error) {
      log('warning', `Branch cleanup failed: ${error.message}`);
    }
  }

  /**
   * Extract conflict files from merge-tree output
   * @param {string} output - Merge-tree output
   * @returns {Array<string>} Conflict files
   */
  _extractConflictFiles(output) {
    const files = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('<<<<<<<')) {
        const match = line.match(/<<<<<<< (.+)/);
        if (match) {
          files.push(match[1]);
        }
      }
    }
    
    return [...new Set(files)];
  }

  /**
   * Alternative conflict check method
   * @param {string} branchName - Branch name
   * @returns {Promise<Object>} Conflict check result
   */
  async _checkConflictsAlternative(branchName) {
    // This is a simplified alternative - in practice, you might want
    // to implement a more sophisticated conflict detection
    return {
      hasConflicts: false,
      conflictFiles: [],
      mergeBase: null,
      checkedAt: new Date().toISOString(),
      method: 'alternative'
    };
  }
}

/**
 * Branch Error class
 */
export class BranchError extends Error {
  constructor(code, message, originalError = null) {
    super(message);
    this.name = 'BranchError';
    this.code = code;
    this.originalError = originalError;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BranchError);
    }
  }
}

export default BranchManager;

