/**
 * Git Operations - Utility functions for Git operations in PR validation
 * Handles repository cloning, branch management, and Git-related tasks
 */

import { log } from './simple_logger.js';

export class GitOperations {
  constructor(config = {}) {
    this.config = {
      defaultTimeout: config.defaultTimeout || 60000, // 1 minute
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 2000,
      ...config
    };
  }

  async cloneRepository(repositoryUrl, targetPath, options = {}) {
    log('info', `📥 Cloning repository: ${repositoryUrl} to ${targetPath}`);
    
    const cloneOptions = {
      branch: options.branch,
      depth: options.depth || 1,
      singleBranch: options.singleBranch !== false,
      timeout: options.timeout || this.config.defaultTimeout
    };

    try {
      const args = ['clone'];
      
      if (cloneOptions.branch) {
        args.push('--branch', cloneOptions.branch);
      }
      
      if (cloneOptions.singleBranch) {
        args.push('--single-branch');
      }
      
      if (cloneOptions.depth) {
        args.push('--depth', cloneOptions.depth.toString());
      }
      
      args.push(repositoryUrl, targetPath);
      
      const result = await this.executeGitCommand(args, {
        timeout: cloneOptions.timeout
      });
      
      log('info', `✅ Repository cloned successfully: ${repositoryUrl}`);
      return result;
      
    } catch (error) {
      log('error', `❌ Failed to clone repository: ${error.message}`);
      throw new Error(`Git clone failed: ${error.message}`);
    }
  }

  async checkoutBranch(repositoryPath, branchName, options = {}) {
    log('info', `🔄 Checking out branch: ${branchName} in ${repositoryPath}`);
    
    try {
      // First, try to checkout existing branch
      try {
        await this.executeGitCommand(['checkout', branchName], {
          cwd: repositoryPath,
          timeout: options.timeout || this.config.defaultTimeout
        });
        
        log('info', `✅ Checked out existing branch: ${branchName}`);
        return { created: false, branch: branchName };
        
      } catch (checkoutError) {
        // If checkout fails, try to fetch and checkout
        if (options.createIfNotExists) {
          await this.executeGitCommand(['checkout', '-b', branchName], {
            cwd: repositoryPath,
            timeout: options.timeout || this.config.defaultTimeout
          });
          
          log('info', `✅ Created and checked out new branch: ${branchName}`);
          return { created: true, branch: branchName };
        } else {
          throw checkoutError;
        }
      }
      
    } catch (error) {
      log('error', `❌ Failed to checkout branch ${branchName}: ${error.message}`);
      throw new Error(`Git checkout failed: ${error.message}`);
    }
  }

  async fetchBranch(repositoryPath, remoteName, branchName, options = {}) {
    log('info', `📡 Fetching branch: ${remoteName}/${branchName} in ${repositoryPath}`);
    
    try {
      await this.executeGitCommand(['fetch', remoteName, branchName], {
        cwd: repositoryPath,
        timeout: options.timeout || this.config.defaultTimeout
      });
      
      log('info', `✅ Fetched branch: ${remoteName}/${branchName}`);
      
    } catch (error) {
      log('error', `❌ Failed to fetch branch: ${error.message}`);
      throw new Error(`Git fetch failed: ${error.message}`);
    }
  }

  async getModifiedFiles(repositoryPath, baseBranch, headBranch, options = {}) {
    log('info', `📋 Getting modified files between ${baseBranch} and ${headBranch}`);
    
    try {
      const result = await this.executeGitCommand([
        'diff',
        '--name-only',
        `${baseBranch}...${headBranch}`
      ], {
        cwd: repositoryPath,
        timeout: options.timeout || this.config.defaultTimeout
      });
      
      const files = result.stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      log('info', `✅ Found ${files.length} modified files`);
      return files;
      
    } catch (error) {
      log('error', `❌ Failed to get modified files: ${error.message}`);
      throw new Error(`Git diff failed: ${error.message}`);
    }
  }

  async getFileContent(repositoryPath, filePath, branch = 'HEAD', options = {}) {
    log('debug', `📄 Getting content of ${filePath} at ${branch}`);
    
    try {
      const result = await this.executeGitCommand([
        'show',
        `${branch}:${filePath}`
      ], {
        cwd: repositoryPath,
        timeout: options.timeout || this.config.defaultTimeout
      });
      
      return result.stdout;
      
    } catch (error) {
      log('error', `❌ Failed to get file content: ${error.message}`);
      throw new Error(`Git show failed: ${error.message}`);
    }
  }

  async getCommitInfo(repositoryPath, commitHash, options = {}) {
    log('debug', `📝 Getting commit info for ${commitHash}`);
    
    try {
      const result = await this.executeGitCommand([
        'show',
        '--format=fuller',
        '--no-patch',
        commitHash
      ], {
        cwd: repositoryPath,
        timeout: options.timeout || this.config.defaultTimeout
      });
      
      return this.parseCommitInfo(result.stdout);
      
    } catch (error) {
      log('error', `❌ Failed to get commit info: ${error.message}`);
      throw new Error(`Git show failed: ${error.message}`);
    }
  }

  async getBranchCommits(repositoryPath, baseBranch, headBranch, options = {}) {
    log('info', `📜 Getting commits between ${baseBranch} and ${headBranch}`);
    
    try {
      const result = await this.executeGitCommand([
        'log',
        '--oneline',
        '--no-merges',
        `${baseBranch}..${headBranch}`
      ], {
        cwd: repositoryPath,
        timeout: options.timeout || this.config.defaultTimeout
      });
      
      const commits = result.stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          const [hash, ...messageParts] = line.split(' ');
          return {
            hash,
            message: messageParts.join(' ')
          };
        });
      
      log('info', `✅ Found ${commits.length} commits`);
      return commits;
      
    } catch (error) {
      log('error', `❌ Failed to get branch commits: ${error.message}`);
      throw new Error(`Git log failed: ${error.message}`);
    }
  }

  async getRepositoryInfo(repositoryPath, options = {}) {
    log('info', `ℹ️ Getting repository info for ${repositoryPath}`);
    
    try {
      const [remoteResult, branchResult, statusResult] = await Promise.all([
        this.executeGitCommand(['remote', '-v'], { cwd: repositoryPath }),
        this.executeGitCommand(['branch', '-a'], { cwd: repositoryPath }),
        this.executeGitCommand(['status', '--porcelain'], { cwd: repositoryPath })
      ]);
      
      return {
        remotes: this.parseRemotes(remoteResult.stdout),
        branches: this.parseBranches(branchResult.stdout),
        status: this.parseStatus(statusResult.stdout),
        isClean: statusResult.stdout.trim().length === 0
      };
      
    } catch (error) {
      log('error', `❌ Failed to get repository info: ${error.message}`);
      throw new Error(`Git info failed: ${error.message}`);
    }
  }

  async validateRepository(repositoryPath, options = {}) {
    log('info', `✅ Validating repository at ${repositoryPath}`);
    
    try {
      // Check if it's a git repository
      await this.executeGitCommand(['rev-parse', '--git-dir'], {
        cwd: repositoryPath,
        timeout: options.timeout || this.config.defaultTimeout
      });
      
      // Check if we can access the repository
      await this.executeGitCommand(['status'], {
        cwd: repositoryPath,
        timeout: options.timeout || this.config.defaultTimeout
      });
      
      log('info', `✅ Repository validation successful: ${repositoryPath}`);
      return true;
      
    } catch (error) {
      log('error', `❌ Repository validation failed: ${error.message}`);
      return false;
    }
  }

  async executeGitCommand(args, options = {}) {
    const { spawn } = await import('child_process');
    
    log('debug', `Executing git command: git ${args.join(' ')}`);
    
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        cwd: options.cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...options.env }
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Git command failed (exit code ${code}): ${stderr || stdout}`));
        }
      });
      
      child.on('error', (error) => {
        reject(new Error(`Failed to execute git command: ${error.message}`));
      });
      
      // Handle timeout
      if (options.timeout) {
        const timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error('Git command timed out'));
        }, options.timeout);
        
        child.on('close', () => {
          clearTimeout(timeoutId);
        });
      }
    });
  }

  // Parsing helper methods
  parseCommitInfo(output) {
    const lines = output.split('\n');
    const info = {};
    
    for (const line of lines) {
      if (line.startsWith('commit ')) {
        info.hash = line.split(' ')[1];
      } else if (line.startsWith('Author: ')) {
        info.author = line.substring(8);
      } else if (line.startsWith('AuthorDate: ')) {
        info.authorDate = new Date(line.substring(12));
      } else if (line.startsWith('Commit: ')) {
        info.committer = line.substring(8);
      } else if (line.startsWith('CommitDate: ')) {
        info.commitDate = new Date(line.substring(12));
      } else if (line.trim() && !line.startsWith(' ') && !info.message) {
        info.message = line.trim();
      }
    }
    
    return info;
  }

  parseRemotes(output) {
    const remotes = {};
    const lines = output.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const [name, url, type] = line.split(/\s+/);
      if (!remotes[name]) {
        remotes[name] = {};
      }
      remotes[name][type.replace(/[()]/g, '')] = url;
    }
    
    return remotes;
  }

  parseBranches(output) {
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const isCurrent = line.startsWith('*');
        const name = line.replace(/^\*?\s+/, '').replace(/^remotes\//, '');
        return {
          name,
          isCurrent,
          isRemote: line.includes('remotes/')
        };
      });
  }

  parseStatus(output) {
    const status = {
      modified: [],
      added: [],
      deleted: [],
      renamed: [],
      untracked: []
    };
    
    const lines = output.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const statusCode = line.substring(0, 2);
      const fileName = line.substring(3);
      
      switch (statusCode.trim()) {
        case 'M':
          status.modified.push(fileName);
          break;
        case 'A':
          status.added.push(fileName);
          break;
        case 'D':
          status.deleted.push(fileName);
          break;
        case 'R':
          status.renamed.push(fileName);
          break;
        case '??':
          status.untracked.push(fileName);
          break;
      }
    }
    
    return status;
  }

  // Utility methods
  async retryOperation(operation, maxRetries = null, delay = null) {
    const retries = maxRetries || this.config.maxRetries;
    const retryDelay = delay || this.config.retryDelay;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        
        log('warn', `Operation failed (attempt ${attempt}/${retries}): ${error.message}`);
        await this.delay(retryDelay);
      }
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cleanup methods
  async cleanupRepository(repositoryPath) {
    log('info', `🧹 Cleaning up repository: ${repositoryPath}`);
    
    try {
      const { rm } = await import('fs/promises');
      await rm(repositoryPath, { recursive: true, force: true });
      log('info', `✅ Repository cleanup completed: ${repositoryPath}`);
    } catch (error) {
      log('error', `❌ Failed to cleanup repository: ${error.message}`);
    }
  }
}

