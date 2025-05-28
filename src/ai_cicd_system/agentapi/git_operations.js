/**
 * Git Operations
 * 
 * Handles Git repository operations for PR branch cloning,
 * management, and synchronization within WSL2 instances.
 */

const { promisify } = require('util');
const { exec } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const execAsync = promisify(exec);

class GitOperations {
  constructor(config = {}) {
    this.config = {
      defaultBranch: 'main',
      timeout: 120000, // 2 minutes
      maxRetries: 3,
      retryDelay: 5000,
      ...config
    };

    this.activeOperations = new Map();
  }

  /**
   * Clone a repository and checkout specific PR branch
   */
  async cloneRepository(instanceId, repoUrl, prBranch, targetPath, options = {}) {
    const operationId = crypto.randomBytes(8).toString('hex');
    
    try {
      console.log(`Starting repository clone: ${repoUrl} (branch: ${prBranch})`);
      
      this.activeOperations.set(operationId, {
        type: 'clone',
        instanceId,
        repoUrl,
        prBranch,
        targetPath,
        startTime: new Date()
      });

      const {
        depth = 1,
        recursive = false,
        credentials,
        wsl2Manager
      } = options;

      // Prepare clone command
      let cloneCommand = `git clone`;
      
      if (depth) {
        cloneCommand += ` --depth ${depth}`;
      }
      
      if (recursive) {
        cloneCommand += ` --recursive`;
      }

      // Add credentials if provided
      if (credentials) {
        const authUrl = this.addCredentialsToUrl(repoUrl, credentials);
        cloneCommand += ` "${authUrl}" "${targetPath}"`;
      } else {
        cloneCommand += ` "${repoUrl}" "${targetPath}"`;
      }

      // Execute clone command in WSL2 instance
      const cloneResult = await wsl2Manager.executeCommand(instanceId, cloneCommand, {
        timeout: this.config.timeout
      });

      if (!cloneResult.success) {
        throw new Error(`Clone failed: ${cloneResult.stderr}`);
      }

      // Checkout the specific PR branch
      if (prBranch && prBranch !== this.config.defaultBranch) {
        await this.checkoutBranch(instanceId, targetPath, prBranch, wsl2Manager);
      }

      // Configure Git settings
      await this.configureGitSettings(instanceId, targetPath, options.gitConfig, wsl2Manager);

      console.log(`Repository cloned successfully: ${repoUrl} -> ${targetPath}`);
      
      this.activeOperations.delete(operationId);
      
      return {
        success: true,
        path: targetPath,
        branch: prBranch || this.config.defaultBranch,
        commit: await this.getCurrentCommit(instanceId, targetPath, wsl2Manager)
      };
    } catch (error) {
      console.error(`Repository clone failed: ${error.message}`);
      this.activeOperations.delete(operationId);
      throw error;
    }
  }

  /**
   * Checkout a specific branch
   */
  async checkoutBranch(instanceId, repoPath, branchName, wsl2Manager) {
    try {
      console.log(`Checking out branch: ${branchName}`);

      // First, try to checkout existing local branch
      let checkoutResult = await wsl2Manager.executeCommand(
        instanceId,
        `git checkout ${branchName}`,
        { workingDirectory: repoPath }
      );

      // If local branch doesn't exist, fetch and checkout remote branch
      if (!checkoutResult.success) {
        console.log(`Local branch ${branchName} not found, fetching from remote...`);
        
        // Fetch the specific branch
        const fetchResult = await wsl2Manager.executeCommand(
          instanceId,
          `git fetch origin ${branchName}:${branchName}`,
          { workingDirectory: repoPath }
        );

        if (!fetchResult.success) {
          throw new Error(`Failed to fetch branch ${branchName}: ${fetchResult.stderr}`);
        }

        // Checkout the fetched branch
        checkoutResult = await wsl2Manager.executeCommand(
          instanceId,
          `git checkout ${branchName}`,
          { workingDirectory: repoPath }
        );

        if (!checkoutResult.success) {
          throw new Error(`Failed to checkout branch ${branchName}: ${checkoutResult.stderr}`);
        }
      }

      console.log(`Successfully checked out branch: ${branchName}`);
      return true;
    } catch (error) {
      console.error(`Branch checkout failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Configure Git settings in the repository
   */
  async configureGitSettings(instanceId, repoPath, gitConfig, wsl2Manager) {
    if (!gitConfig) return;

    try {
      console.log('Configuring Git settings...');

      if (gitConfig.name) {
        await wsl2Manager.executeCommand(
          instanceId,
          `git config user.name "${gitConfig.name}"`,
          { workingDirectory: repoPath }
        );
      }

      if (gitConfig.email) {
        await wsl2Manager.executeCommand(
          instanceId,
          `git config user.email "${gitConfig.email}"`,
          { workingDirectory: repoPath }
        );
      }

      // Configure additional Git settings for CI/CD
      await wsl2Manager.executeCommand(
        instanceId,
        'git config core.autocrlf false',
        { workingDirectory: repoPath }
      );

      await wsl2Manager.executeCommand(
        instanceId,
        'git config pull.rebase false',
        { workingDirectory: repoPath }
      );

      console.log('Git settings configured successfully');
    } catch (error) {
      console.error(`Git configuration failed: ${error.message}`);
      // Don't throw here as this is not critical
    }
  }

  /**
   * Get current commit hash
   */
  async getCurrentCommit(instanceId, repoPath, wsl2Manager) {
    try {
      const result = await wsl2Manager.executeCommand(
        instanceId,
        'git rev-parse HEAD',
        { workingDirectory: repoPath }
      );

      if (result.success) {
        return result.stdout.trim();
      }
      return null;
    } catch (error) {
      console.error(`Failed to get current commit: ${error.message}`);
      return null;
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(instanceId, repoPath, wsl2Manager) {
    try {
      const result = await wsl2Manager.executeCommand(
        instanceId,
        'git branch --show-current',
        { workingDirectory: repoPath }
      );

      if (result.success) {
        return result.stdout.trim();
      }
      return null;
    } catch (error) {
      console.error(`Failed to get current branch: ${error.message}`);
      return null;
    }
  }

  /**
   * Get repository status
   */
  async getRepositoryStatus(instanceId, repoPath, wsl2Manager) {
    try {
      const [statusResult, branchResult, commitResult] = await Promise.all([
        wsl2Manager.executeCommand(instanceId, 'git status --porcelain', { workingDirectory: repoPath }),
        this.getCurrentBranch(instanceId, repoPath, wsl2Manager),
        this.getCurrentCommit(instanceId, repoPath, wsl2Manager)
      ]);

      const hasChanges = statusResult.success && statusResult.stdout.trim().length > 0;
      const changes = hasChanges ? statusResult.stdout.trim().split('\n') : [];

      return {
        branch: branchResult,
        commit: commitResult,
        hasChanges,
        changes: changes.map(line => {
          const status = line.substring(0, 2);
          const file = line.substring(3);
          return { status, file };
        }),
        clean: !hasChanges
      };
    } catch (error) {
      console.error(`Failed to get repository status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pull latest changes from remote
   */
  async pullChanges(instanceId, repoPath, wsl2Manager, branch = null) {
    try {
      console.log(`Pulling latest changes${branch ? ` for branch ${branch}` : ''}...`);

      const pullCommand = branch ? `git pull origin ${branch}` : 'git pull';
      
      const result = await wsl2Manager.executeCommand(
        instanceId,
        pullCommand,
        { workingDirectory: repoPath, timeout: this.config.timeout }
      );

      if (!result.success) {
        throw new Error(`Pull failed: ${result.stderr}`);
      }

      console.log('Changes pulled successfully');
      return {
        success: true,
        output: result.stdout,
        commit: await this.getCurrentCommit(instanceId, repoPath, wsl2Manager)
      };
    } catch (error) {
      console.error(`Pull operation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create and push a new branch
   */
  async createAndPushBranch(instanceId, repoPath, branchName, wsl2Manager, options = {}) {
    try {
      console.log(`Creating and pushing new branch: ${branchName}`);

      const { baseBranch = this.config.defaultBranch, force = false } = options;

      // Ensure we're on the base branch
      await this.checkoutBranch(instanceId, repoPath, baseBranch, wsl2Manager);

      // Pull latest changes
      await this.pullChanges(instanceId, repoPath, wsl2Manager, baseBranch);

      // Create new branch
      const createResult = await wsl2Manager.executeCommand(
        instanceId,
        `git checkout -b ${branchName}`,
        { workingDirectory: repoPath }
      );

      if (!createResult.success) {
        throw new Error(`Failed to create branch: ${createResult.stderr}`);
      }

      // Push the new branch
      const pushCommand = force ? 
        `git push --force-with-lease origin ${branchName}` : 
        `git push -u origin ${branchName}`;

      const pushResult = await wsl2Manager.executeCommand(
        instanceId,
        pushCommand,
        { workingDirectory: repoPath, timeout: this.config.timeout }
      );

      if (!pushResult.success) {
        throw new Error(`Failed to push branch: ${pushResult.stderr}`);
      }

      console.log(`Branch created and pushed successfully: ${branchName}`);
      return {
        success: true,
        branch: branchName,
        commit: await this.getCurrentCommit(instanceId, repoPath, wsl2Manager)
      };
    } catch (error) {
      console.error(`Branch creation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Commit changes
   */
  async commitChanges(instanceId, repoPath, message, wsl2Manager, options = {}) {
    try {
      console.log(`Committing changes: ${message}`);

      const { addAll = true, author } = options;

      // Add files
      if (addAll) {
        const addResult = await wsl2Manager.executeCommand(
          instanceId,
          'git add .',
          { workingDirectory: repoPath }
        );

        if (!addResult.success) {
          throw new Error(`Failed to add files: ${addResult.stderr}`);
        }
      }

      // Check if there are changes to commit
      const statusResult = await wsl2Manager.executeCommand(
        instanceId,
        'git status --porcelain',
        { workingDirectory: repoPath }
      );

      if (!statusResult.success || !statusResult.stdout.trim()) {
        console.log('No changes to commit');
        return { success: true, noChanges: true };
      }

      // Commit changes
      let commitCommand = `git commit -m "${message}"`;
      if (author) {
        commitCommand += ` --author="${author}"`;
      }

      const commitResult = await wsl2Manager.executeCommand(
        instanceId,
        commitCommand,
        { workingDirectory: repoPath }
      );

      if (!commitResult.success) {
        throw new Error(`Failed to commit: ${commitResult.stderr}`);
      }

      console.log('Changes committed successfully');
      return {
        success: true,
        commit: await this.getCurrentCommit(instanceId, repoPath, wsl2Manager),
        output: commitResult.stdout
      };
    } catch (error) {
      console.error(`Commit failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Push changes to remote
   */
  async pushChanges(instanceId, repoPath, wsl2Manager, options = {}) {
    try {
      console.log('Pushing changes to remote...');

      const { branch, force = false } = options;
      
      let pushCommand = 'git push';
      if (branch) {
        pushCommand += ` origin ${branch}`;
      }
      if (force) {
        pushCommand += ' --force-with-lease';
      }

      const result = await wsl2Manager.executeCommand(
        instanceId,
        pushCommand,
        { workingDirectory: repoPath, timeout: this.config.timeout }
      );

      if (!result.success) {
        throw new Error(`Push failed: ${result.stderr}`);
      }

      console.log('Changes pushed successfully');
      return {
        success: true,
        output: result.stdout
      };
    } catch (error) {
      console.error(`Push operation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get commit history
   */
  async getCommitHistory(instanceId, repoPath, wsl2Manager, options = {}) {
    try {
      const { limit = 10, format = 'oneline' } = options;
      
      const command = `git log --${format} -n ${limit}`;
      
      const result = await wsl2Manager.executeCommand(
        instanceId,
        command,
        { workingDirectory: repoPath }
      );

      if (!result.success) {
        throw new Error(`Failed to get commit history: ${result.stderr}`);
      }

      return {
        success: true,
        commits: result.stdout.trim().split('\n').filter(line => line.trim())
      };
    } catch (error) {
      console.error(`Failed to get commit history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get file diff
   */
  async getFileDiff(instanceId, repoPath, filePath, wsl2Manager, options = {}) {
    try {
      const { staged = false, commit1, commit2 } = options;
      
      let command;
      if (commit1 && commit2) {
        command = `git diff ${commit1} ${commit2} -- "${filePath}"`;
      } else if (staged) {
        command = `git diff --staged -- "${filePath}"`;
      } else {
        command = `git diff -- "${filePath}"`;
      }

      const result = await wsl2Manager.executeCommand(
        instanceId,
        command,
        { workingDirectory: repoPath }
      );

      return {
        success: result.success,
        diff: result.stdout,
        error: result.stderr
      };
    } catch (error) {
      console.error(`Failed to get file diff: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reset repository to specific commit
   */
  async resetToCommit(instanceId, repoPath, commitHash, wsl2Manager, options = {}) {
    try {
      console.log(`Resetting repository to commit: ${commitHash}`);

      const { hard = false } = options;
      
      const resetCommand = hard ? 
        `git reset --hard ${commitHash}` : 
        `git reset ${commitHash}`;

      const result = await wsl2Manager.executeCommand(
        instanceId,
        resetCommand,
        { workingDirectory: repoPath }
      );

      if (!result.success) {
        throw new Error(`Reset failed: ${result.stderr}`);
      }

      console.log('Repository reset successfully');
      return {
        success: true,
        commit: await this.getCurrentCommit(instanceId, repoPath, wsl2Manager)
      };
    } catch (error) {
      console.error(`Reset operation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean repository (remove untracked files)
   */
  async cleanRepository(instanceId, repoPath, wsl2Manager, options = {}) {
    try {
      console.log('Cleaning repository...');

      const { force = true, directories = true } = options;
      
      let cleanCommand = 'git clean';
      if (force) cleanCommand += ' -f';
      if (directories) cleanCommand += ' -d';

      const result = await wsl2Manager.executeCommand(
        instanceId,
        cleanCommand,
        { workingDirectory: repoPath }
      );

      if (!result.success) {
        throw new Error(`Clean failed: ${result.stderr}`);
      }

      console.log('Repository cleaned successfully');
      return { success: true };
    } catch (error) {
      console.error(`Clean operation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add credentials to repository URL
   */
  addCredentialsToUrl(url, credentials) {
    try {
      const urlObj = new URL(url);
      
      if (credentials.username && credentials.password) {
        urlObj.username = credentials.username;
        urlObj.password = credentials.password;
      } else if (credentials.token) {
        urlObj.username = credentials.token;
        urlObj.password = 'x-oauth-basic';
      }

      return urlObj.toString();
    } catch (error) {
      console.error(`Failed to add credentials to URL: ${error.message}`);
      return url;
    }
  }

  /**
   * Get active operations
   */
  getActiveOperations() {
    return Array.from(this.activeOperations.values());
  }

  /**
   * Cancel operation
   */
  cancelOperation(operationId) {
    if (this.activeOperations.has(operationId)) {
      this.activeOperations.delete(operationId);
      return true;
    }
    return false;
  }
}

module.exports = GitOperations;

