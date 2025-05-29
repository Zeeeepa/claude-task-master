/**
 * Repository Operations - Git operations and repository management
 * Handles Git operations, repository management, and integration with Codegen SDK
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import { configManager } from '../../utils/config-manager.js';
import { codegenSDKClient } from './sdk-client.js';

const execAsync = promisify(exec);

class RepositoryOperations extends EventEmitter {
    constructor() {
        super();
        this.repositories = new Map();
        this.activeOperations = new Map();
        this.gitConfig = {
            user: {
                name: configManager.get('git.user.name', 'TaskMaster AI'),
                email: configManager.get('git.user.email', 'taskmaster@ai.local')
            }
        };
    }

    /**
     * Initialize repository operations
     */
    async initialize() {
        try {
            logger.info('Initializing repository operations...');
            
            // Verify Git is available
            await this.verifyGitInstallation();
            
            // Setup global Git configuration
            await this.setupGitConfig();
            
            logger.info('Repository operations initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize repository operations:', error);
            throw error;
        }
    }

    /**
     * Verify Git installation
     */
    async verifyGitInstallation() {
        try {
            const { stdout } = await execAsync('git --version');
            logger.debug(`Git version: ${stdout.trim()}`);
        } catch (error) {
            throw new Error('Git is not installed or not available in PATH');
        }
    }

    /**
     * Setup global Git configuration
     */
    async setupGitConfig() {
        try {
            await execAsync(`git config --global user.name "${this.gitConfig.user.name}"`);
            await execAsync(`git config --global user.email "${this.gitConfig.user.email}"`);
            
            // Configure Git for automated operations
            await execAsync('git config --global init.defaultBranch main');
            await execAsync('git config --global pull.rebase false');
            
            logger.debug('Git configuration setup completed');
        } catch (error) {
            logger.warn('Failed to setup Git configuration:', error.message);
        }
    }

    /**
     * Clone a repository
     */
    async cloneRepository(repoUrl, localPath, options = {}) {
        const operationId = this.generateOperationId();
        
        try {
            logger.info(`Cloning repository: ${repoUrl} to ${localPath}`);
            
            const cloneOptions = [
                'clone',
                ...(options.depth ? [`--depth=${options.depth}`] : []),
                ...(options.branch ? [`--branch=${options.branch}`] : []),
                ...(options.recursive ? ['--recursive'] : []),
                repoUrl,
                localPath
            ];

            await this.executeGitCommand(cloneOptions, { cwd: process.cwd() });
            
            const repoInfo = {
                id: this.generateRepoId(),
                url: repoUrl,
                localPath,
                clonedAt: Date.now(),
                branch: options.branch || 'main',
                status: 'active'
            };
            
            this.repositories.set(repoInfo.id, repoInfo);
            
            this.emit('repositoryCloned', repoInfo);
            logger.info(`Repository cloned successfully: ${repoInfo.id}`);
            
            return repoInfo;
            
        } catch (error) {
            logger.error(`Failed to clone repository ${repoUrl}:`, error);
            throw error;
        } finally {
            this.activeOperations.delete(operationId);
        }
    }

    /**
     * Create a new branch
     */
    async createBranch(repoPath, branchName, fromBranch = null) {
        const operationId = this.generateOperationId();
        
        try {
            logger.info(`Creating branch: ${branchName} in ${repoPath}`);
            
            const createOptions = [
                'checkout',
                '-b',
                branchName
            ];
            
            if (fromBranch) {
                createOptions.push(fromBranch);
            }

            await this.executeGitCommand(createOptions, { cwd: repoPath });
            
            this.emit('branchCreated', { repoPath, branchName, fromBranch });
            logger.info(`Branch created successfully: ${branchName}`);
            
            return { branchName, created: true };
            
        } catch (error) {
            logger.error(`Failed to create branch ${branchName}:`, error);
            throw error;
        } finally {
            this.activeOperations.delete(operationId);
        }
    }

    /**
     * Switch to a branch
     */
    async switchBranch(repoPath, branchName) {
        const operationId = this.generateOperationId();
        
        try {
            logger.info(`Switching to branch: ${branchName} in ${repoPath}`);
            
            await this.executeGitCommand(['checkout', branchName], { cwd: repoPath });
            
            this.emit('branchSwitched', { repoPath, branchName });
            logger.info(`Switched to branch successfully: ${branchName}`);
            
            return { branchName, switched: true };
            
        } catch (error) {
            logger.error(`Failed to switch to branch ${branchName}:`, error);
            throw error;
        } finally {
            this.activeOperations.delete(operationId);
        }
    }

    /**
     * Commit changes
     */
    async commitChanges(repoPath, message, files = []) {
        const operationId = this.generateOperationId();
        
        try {
            logger.info(`Committing changes in ${repoPath}: ${message}`);
            
            // Add files
            if (files.length > 0) {
                await this.executeGitCommand(['add', ...files], { cwd: repoPath });
            } else {
                await this.executeGitCommand(['add', '.'], { cwd: repoPath });
            }
            
            // Check if there are changes to commit
            const status = await this.getRepositoryStatus(repoPath);
            if (status.staged.length === 0) {
                logger.info('No changes to commit');
                return { committed: false, reason: 'No changes to commit' };
            }
            
            // Commit changes
            await this.executeGitCommand(['commit', '-m', message], { cwd: repoPath });
            
            // Get commit hash
            const { stdout: commitHash } = await execAsync('git rev-parse HEAD', { cwd: repoPath });
            
            const commitInfo = {
                hash: commitHash.trim(),
                message,
                files: status.staged,
                timestamp: Date.now()
            };
            
            this.emit('changesCommitted', { repoPath, commitInfo });
            logger.info(`Changes committed successfully: ${commitInfo.hash}`);
            
            return { committed: true, commitInfo };
            
        } catch (error) {
            logger.error(`Failed to commit changes in ${repoPath}:`, error);
            throw error;
        } finally {
            this.activeOperations.delete(operationId);
        }
    }

    /**
     * Push changes to remote
     */
    async pushChanges(repoPath, remoteName = 'origin', branchName = null) {
        const operationId = this.generateOperationId();
        
        try {
            if (!branchName) {
                branchName = await this.getCurrentBranch(repoPath);
            }
            
            logger.info(`Pushing changes: ${remoteName}/${branchName} from ${repoPath}`);
            
            await this.executeGitCommand(['push', remoteName, branchName], { cwd: repoPath });
            
            this.emit('changesPushed', { repoPath, remoteName, branchName });
            logger.info(`Changes pushed successfully: ${remoteName}/${branchName}`);
            
            return { pushed: true, remoteName, branchName };
            
        } catch (error) {
            logger.error(`Failed to push changes to ${remoteName}/${branchName}:`, error);
            throw error;
        } finally {
            this.activeOperations.delete(operationId);
        }
    }

    /**
     * Pull changes from remote
     */
    async pullChanges(repoPath, remoteName = 'origin', branchName = null) {
        const operationId = this.generateOperationId();
        
        try {
            if (!branchName) {
                branchName = await this.getCurrentBranch(repoPath);
            }
            
            logger.info(`Pulling changes: ${remoteName}/${branchName} to ${repoPath}`);
            
            await this.executeGitCommand(['pull', remoteName, branchName], { cwd: repoPath });
            
            this.emit('changesPulled', { repoPath, remoteName, branchName });
            logger.info(`Changes pulled successfully: ${remoteName}/${branchName}`);
            
            return { pulled: true, remoteName, branchName };
            
        } catch (error) {
            logger.error(`Failed to pull changes from ${remoteName}/${branchName}:`, error);
            throw error;
        } finally {
            this.activeOperations.delete(operationId);
        }
    }

    /**
     * Get repository status
     */
    async getRepositoryStatus(repoPath) {
        try {
            const { stdout } = await execAsync('git status --porcelain', { cwd: repoPath });
            
            const status = {
                staged: [],
                unstaged: [],
                untracked: [],
                clean: stdout.trim() === ''
            };
            
            if (!status.clean) {
                const lines = stdout.trim().split('\n');
                
                for (const line of lines) {
                    const statusCode = line.substring(0, 2);
                    const filePath = line.substring(3);
                    
                    if (statusCode[0] !== ' ' && statusCode[0] !== '?') {
                        status.staged.push(filePath);
                    }
                    
                    if (statusCode[1] !== ' ') {
                        if (statusCode[1] === '?') {
                            status.untracked.push(filePath);
                        } else {
                            status.unstaged.push(filePath);
                        }
                    }
                }
            }
            
            return status;
            
        } catch (error) {
            logger.error(`Failed to get repository status for ${repoPath}:`, error);
            throw error;
        }
    }

    /**
     * Get current branch
     */
    async getCurrentBranch(repoPath) {
        try {
            const { stdout } = await execAsync('git branch --show-current', { cwd: repoPath });
            return stdout.trim();
        } catch (error) {
            logger.error(`Failed to get current branch for ${repoPath}:`, error);
            throw error;
        }
    }

    /**
     * Get commit history
     */
    async getCommitHistory(repoPath, options = {}) {
        try {
            const { limit = 10, since = null, author = null } = options;
            
            const gitOptions = [
                'log',
                '--oneline',
                `--max-count=${limit}`,
                '--pretty=format:%H|%an|%ae|%ad|%s',
                '--date=iso'
            ];
            
            if (since) {
                gitOptions.push(`--since="${since}"`);
            }
            
            if (author) {
                gitOptions.push(`--author="${author}"`);
            }
            
            const { stdout } = await execAsync(`git ${gitOptions.join(' ')}`, { cwd: repoPath });
            
            if (!stdout.trim()) {
                return [];
            }
            
            const commits = stdout.trim().split('\n').map(line => {
                const [hash, authorName, authorEmail, date, message] = line.split('|');
                return {
                    hash,
                    author: { name: authorName, email: authorEmail },
                    date: new Date(date),
                    message
                };
            });
            
            return commits;
            
        } catch (error) {
            logger.error(`Failed to get commit history for ${repoPath}:`, error);
            throw error;
        }
    }

    /**
     * Create and push a pull request
     */
    async createPullRequest(repoPath, prData) {
        try {
            logger.info(`Creating pull request for ${repoPath}`);
            
            // Get repository information from Codegen SDK
            const repoInfo = await this.getRepositoryInfo(repoPath);
            
            if (!repoInfo) {
                throw new Error('Repository not found in Codegen system');
            }
            
            // Create pull request via Codegen SDK
            const pullRequest = await codegenSDKClient.createPullRequest(repoInfo.id, prData);
            
            this.emit('pullRequestCreated', { repoPath, pullRequest });
            logger.info(`Pull request created successfully: ${pullRequest.pr_id}`);
            
            return pullRequest;
            
        } catch (error) {
            logger.error(`Failed to create pull request for ${repoPath}:`, error);
            throw error;
        }
    }

    /**
     * Get repository information
     */
    async getRepositoryInfo(repoPath) {
        try {
            // Get remote URL
            const { stdout: remoteUrl } = await execAsync('git config --get remote.origin.url', { cwd: repoPath });
            
            // Find repository in our registry
            for (const [id, repo] of this.repositories) {
                if (repo.localPath === repoPath || repo.url === remoteUrl.trim()) {
                    return repo;
                }
            }
            
            return null;
            
        } catch (error) {
            logger.error(`Failed to get repository info for ${repoPath}:`, error);
            return null;
        }
    }

    /**
     * Execute Git command
     */
    async executeGitCommand(args, options = {}) {
        return new Promise((resolve, reject) => {
            const gitProcess = spawn('git', args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                ...options
            });
            
            let stdout = '';
            let stderr = '';
            
            gitProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            gitProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            gitProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
                } else {
                    reject(new Error(`Git command failed with code ${code}: ${stderr || stdout}`));
                }
            });
            
            gitProcess.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Generate operation ID
     */
    generateOperationId() {
        return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate repository ID
     */
    generateRepoId() {
        return `repo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get active operations
     */
    getActiveOperations() {
        return Array.from(this.activeOperations.values());
    }

    /**
     * Get registered repositories
     */
    getRepositories() {
        return Array.from(this.repositories.values());
    }

    /**
     * Get operations status
     */
    getStatus() {
        return {
            activeOperations: this.activeOperations.size,
            registeredRepositories: this.repositories.size,
            gitConfig: this.gitConfig
        };
    }
}

export const repositoryOperations = new RepositoryOperations();
export default RepositoryOperations;

