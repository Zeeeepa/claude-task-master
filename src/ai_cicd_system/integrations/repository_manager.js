/**
 * Repository Manager
 * 
 * Manages repository cloning, branch management, and PR operations
 * in WSL2 environments for validation workflows.
 */

import { EventEmitter } from 'events';
import AgentAPIClient from './agentapi_client.js';

export class RepositoryManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.agentAPI = new AgentAPIClient(options.agentAPI);
        this.config = {
            defaultWorkspace: options.defaultWorkspace || '/workspace',
            gitConfig: {
                user: {
                    name: options.gitUser?.name || 'Claude Task Master',
                    email: options.gitUser?.email || 'claude-task-master@example.com'
                }
            },
            cloneTimeout: options.cloneTimeout || 300000, // 5 minutes
            maxRetries: options.maxRetries || 3,
            ...options
        };

        this.repositories = new Map();
    }

    /**
     * Initialize the Repository Manager
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            await this.agentAPI.initialize();
            this.emit('initialized');
            return true;
        } catch (error) {
            this.emit('error', { type: 'initialization', error });
            throw new Error(`Failed to initialize Repository Manager: ${error.message}`);
        }
    }

    /**
     * Clone a repository for PR validation
     * @param {string} instanceId - WSL2 instance ID
     * @param {Object} prDetails - PR details
     * @returns {Promise<Object>} Repository information
     */
    async cloneRepository(instanceId, prDetails) {
        const repoId = `${instanceId}-${prDetails.prNumber}`;
        
        try {
            const repository = {
                id: repoId,
                instanceId,
                prDetails,
                status: 'cloning',
                startedAt: new Date().toISOString(),
                workspace: this.config.defaultWorkspace,
                branches: new Map(),
                remotes: new Map()
            };

            this.repositories.set(repoId, repository);
            this.emit('cloningStarted', repository);

            // Setup workspace directory
            await this.setupWorkspace(instanceId, repository);

            // Clone the repository
            await this.performClone(instanceId, repository, prDetails);

            // Setup git configuration
            await this.setupGitConfig(instanceId, repository);

            // Fetch PR branch
            await this.fetchPRBranch(instanceId, repository, prDetails);

            // Setup tracking branches
            await this.setupTrackingBranches(instanceId, repository, prDetails);

            repository.status = 'ready';
            repository.readyAt = new Date().toISOString();

            this.emit('repositoryReady', repository);
            return repository;

        } catch (error) {
            const repository = this.repositories.get(repoId);
            if (repository) {
                repository.status = 'failed';
                repository.error = error.message;
                repository.failedAt = new Date().toISOString();
                this.emit('repositoryFailed', repository);
            }
            
            this.emit('error', { type: 'repositoryClone', error, repoId });
            throw error;
        }
    }

    /**
     * Setup workspace directory
     * @param {string} instanceId - WSL2 instance ID
     * @param {Object} repository - Repository object
     * @returns {Promise<void>}
     */
    async setupWorkspace(instanceId, repository) {
        try {
            const commands = [
                `mkdir -p ${repository.workspace}`,
                `cd ${repository.workspace}`,
                `pwd`
            ];

            for (const command of commands) {
                await this.agentAPI.executeCommand(instanceId, command);
            }

            this.emit('workspaceSetup', { repository: repository.id, workspace: repository.workspace });

        } catch (error) {
            throw new Error(`Failed to setup workspace: ${error.message}`);
        }
    }

    /**
     * Perform the actual repository clone
     * @param {string} instanceId - WSL2 instance ID
     * @param {Object} repository - Repository object
     * @param {Object} prDetails - PR details
     * @returns {Promise<void>}
     */
    async performClone(instanceId, repository, prDetails) {
        try {
            const repoUrl = prDetails.repositoryUrl;
            const cloneCommand = `cd ${repository.workspace} && git clone ${repoUrl} repo`;

            const result = await this.agentAPI.executeCommand(instanceId, cloneCommand);
            
            if (result.exitCode !== 0) {
                throw new Error(`Git clone failed: ${result.stderr}`);
            }

            // Update repository path
            repository.repoPath = `${repository.workspace}/repo`;
            repository.remotes.set('origin', repoUrl);

            this.emit('repositoryCloned', { 
                repository: repository.id, 
                url: repoUrl, 
                path: repository.repoPath 
            });

        } catch (error) {
            throw new Error(`Failed to clone repository: ${error.message}`);
        }
    }

    /**
     * Setup git configuration
     * @param {string} instanceId - WSL2 instance ID
     * @param {Object} repository - Repository object
     * @returns {Promise<void>}
     */
    async setupGitConfig(instanceId, repository) {
        try {
            const configCommands = [
                `cd ${repository.repoPath} && git config user.name "${this.config.gitConfig.user.name}"`,
                `cd ${repository.repoPath} && git config user.email "${this.config.gitConfig.user.email}"`,
                `cd ${repository.repoPath} && git config core.autocrlf false`,
                `cd ${repository.repoPath} && git config pull.rebase false`
            ];

            for (const command of configCommands) {
                await this.agentAPI.executeCommand(instanceId, command);
            }

            this.emit('gitConfigured', { repository: repository.id });

        } catch (error) {
            throw new Error(`Failed to setup git configuration: ${error.message}`);
        }
    }

    /**
     * Fetch PR branch and related branches
     * @param {string} instanceId - WSL2 instance ID
     * @param {Object} repository - Repository object
     * @param {Object} prDetails - PR details
     * @returns {Promise<void>}
     */
    async fetchPRBranch(instanceId, repository, prDetails) {
        try {
            const fetchCommands = [
                `cd ${repository.repoPath} && git fetch origin`,
                `cd ${repository.repoPath} && git fetch origin pull/${prDetails.prNumber}/head:pr-${prDetails.prNumber}`,
                `cd ${repository.repoPath} && git checkout pr-${prDetails.prNumber}`
            ];

            for (const command of fetchCommands) {
                const result = await this.agentAPI.executeCommand(instanceId, command);
                if (result.exitCode !== 0) {
                    console.warn(`Command warning: ${command} - ${result.stderr}`);
                }
            }

            // Get branch information
            const branchInfo = await this.getBranchInfo(instanceId, repository);
            repository.branches.set(`pr-${prDetails.prNumber}`, {
                name: `pr-${prDetails.prNumber}`,
                type: 'pr',
                prNumber: prDetails.prNumber,
                ...branchInfo
            });

            this.emit('prBranchFetched', { 
                repository: repository.id, 
                branch: `pr-${prDetails.prNumber}`,
                prNumber: prDetails.prNumber
            });

        } catch (error) {
            throw new Error(`Failed to fetch PR branch: ${error.message}`);
        }
    }

    /**
     * Setup tracking branches for comparison
     * @param {string} instanceId - WSL2 instance ID
     * @param {Object} repository - Repository object
     * @param {Object} prDetails - PR details
     * @returns {Promise<void>}
     */
    async setupTrackingBranches(instanceId, repository, prDetails) {
        try {
            const baseBranch = prDetails.baseBranch || 'main';
            
            // Fetch and setup base branch
            const setupCommands = [
                `cd ${repository.repoPath} && git fetch origin ${baseBranch}:${baseBranch}`,
                `cd ${repository.repoPath} && git branch --set-upstream-to=origin/${baseBranch} ${baseBranch}`
            ];

            for (const command of setupCommands) {
                const result = await this.agentAPI.executeCommand(instanceId, command);
                if (result.exitCode !== 0) {
                    console.warn(`Setup warning: ${command} - ${result.stderr}`);
                }
            }

            // Get base branch information
            const baseBranchInfo = await this.getBranchInfo(instanceId, repository, baseBranch);
            repository.branches.set(baseBranch, {
                name: baseBranch,
                type: 'base',
                ...baseBranchInfo
            });

            this.emit('trackingBranchesSetup', { 
                repository: repository.id, 
                baseBranch,
                prBranch: `pr-${prDetails.prNumber}`
            });

        } catch (error) {
            throw new Error(`Failed to setup tracking branches: ${error.message}`);
        }
    }

    /**
     * Get branch information
     * @param {string} instanceId - WSL2 instance ID
     * @param {Object} repository - Repository object
     * @param {string} branchName - Branch name (optional, uses current if not specified)
     * @returns {Promise<Object>} Branch information
     */
    async getBranchInfo(instanceId, repository, branchName = null) {
        try {
            const commands = {
                currentBranch: `cd ${repository.repoPath} && git rev-parse --abbrev-ref HEAD`,
                commitHash: `cd ${repository.repoPath} && git rev-parse HEAD`,
                commitMessage: `cd ${repository.repoPath} && git log -1 --pretty=format:"%s"`,
                commitAuthor: `cd ${repository.repoPath} && git log -1 --pretty=format:"%an <%ae>"`,
                commitDate: `cd ${repository.repoPath} && git log -1 --pretty=format:"%ci"`
            };

            if (branchName) {
                Object.keys(commands).forEach(key => {
                    if (key !== 'currentBranch') {
                        commands[key] = commands[key].replace('HEAD', branchName);
                        commands[key] = commands[key].replace('log -1', `log -1 ${branchName}`);
                    }
                });
            }

            const results = {};
            for (const [key, command] of Object.entries(commands)) {
                try {
                    const result = await this.agentAPI.executeCommand(instanceId, command);
                    results[key] = result.stdout.trim();
                } catch (error) {
                    results[key] = null;
                }
            }

            return {
                currentBranch: results.currentBranch,
                commitHash: results.commitHash,
                commitMessage: results.commitMessage,
                commitAuthor: results.commitAuthor,
                commitDate: results.commitDate,
                retrievedAt: new Date().toISOString()
            };

        } catch (error) {
            throw new Error(`Failed to get branch info: ${error.message}`);
        }
    }

    /**
     * Get file changes between branches
     * @param {string} instanceId - WSL2 instance ID
     * @param {string} repositoryId - Repository ID
     * @param {string} baseBranch - Base branch name
     * @param {string} prBranch - PR branch name
     * @returns {Promise<Object>} File changes information
     */
    async getFileChanges(instanceId, repositoryId, baseBranch, prBranch) {
        try {
            const repository = this.repositories.get(repositoryId);
            if (!repository) {
                throw new Error(`Repository ${repositoryId} not found`);
            }

            const diffCommands = {
                changedFiles: `cd ${repository.repoPath} && git diff --name-only ${baseBranch}..${prBranch}`,
                addedFiles: `cd ${repository.repoPath} && git diff --name-only --diff-filter=A ${baseBranch}..${prBranch}`,
                modifiedFiles: `cd ${repository.repoPath} && git diff --name-only --diff-filter=M ${baseBranch}..${prBranch}`,
                deletedFiles: `cd ${repository.repoPath} && git diff --name-only --diff-filter=D ${baseBranch}..${prBranch}`,
                stats: `cd ${repository.repoPath} && git diff --stat ${baseBranch}..${prBranch}`
            };

            const changes = {};
            for (const [key, command] of Object.entries(diffCommands)) {
                try {
                    const result = await this.agentAPI.executeCommand(instanceId, command);
                    if (key === 'stats') {
                        changes[key] = result.stdout;
                    } else {
                        changes[key] = result.stdout.trim().split('\n').filter(line => line.length > 0);
                    }
                } catch (error) {
                    changes[key] = [];
                }
            }

            const fileChanges = {
                repositoryId,
                baseBranch,
                prBranch,
                summary: {
                    totalFiles: changes.changedFiles.length,
                    addedFiles: changes.addedFiles.length,
                    modifiedFiles: changes.modifiedFiles.length,
                    deletedFiles: changes.deletedFiles.length
                },
                files: {
                    changed: changes.changedFiles,
                    added: changes.addedFiles,
                    modified: changes.modifiedFiles,
                    deleted: changes.deletedFiles
                },
                stats: changes.stats,
                analyzedAt: new Date().toISOString()
            };

            this.emit('fileChangesAnalyzed', fileChanges);
            return fileChanges;

        } catch (error) {
            this.emit('error', { type: 'fileChanges', error, repositoryId });
            throw error;
        }
    }

    /**
     * Get file content from repository
     * @param {string} instanceId - WSL2 instance ID
     * @param {string} repositoryId - Repository ID
     * @param {string} filePath - File path relative to repository root
     * @param {string} branch - Branch name (optional, uses current if not specified)
     * @returns {Promise<Object>} File content and metadata
     */
    async getFileContent(instanceId, repositoryId, filePath, branch = null) {
        try {
            const repository = this.repositories.get(repositoryId);
            if (!repository) {
                throw new Error(`Repository ${repositoryId} not found`);
            }

            const branchSpec = branch ? `${branch}:` : '';
            const contentCommand = `cd ${repository.repoPath} && git show ${branchSpec}${filePath}`;
            
            const result = await this.agentAPI.executeCommand(instanceId, contentCommand);
            
            if (result.exitCode !== 0) {
                throw new Error(`Failed to get file content: ${result.stderr}`);
            }

            // Get file metadata
            const metadataCommands = {
                size: `cd ${repository.repoPath} && wc -c < ${filePath}`,
                lines: `cd ${repository.repoPath} && wc -l < ${filePath}`,
                lastModified: `cd ${repository.repoPath} && git log -1 --pretty=format:"%ci" -- ${filePath}`
            };

            const metadata = {};
            for (const [key, command] of Object.entries(metadataCommands)) {
                try {
                    const metaResult = await this.agentAPI.executeCommand(instanceId, command);
                    metadata[key] = metaResult.stdout.trim();
                } catch (error) {
                    metadata[key] = null;
                }
            }

            return {
                repositoryId,
                filePath,
                branch: branch || 'current',
                content: result.stdout,
                metadata: {
                    size: parseInt(metadata.size) || 0,
                    lines: parseInt(metadata.lines) || 0,
                    lastModified: metadata.lastModified,
                    encoding: 'utf-8' // Assume UTF-8 for now
                },
                retrievedAt: new Date().toISOString()
            };

        } catch (error) {
            this.emit('error', { type: 'fileContent', error, repositoryId, filePath });
            throw error;
        }
    }

    /**
     * Create a new branch for fixes or modifications
     * @param {string} instanceId - WSL2 instance ID
     * @param {string} repositoryId - Repository ID
     * @param {string} branchName - New branch name
     * @param {string} baseBranch - Base branch to create from
     * @returns {Promise<Object>} New branch information
     */
    async createBranch(instanceId, repositoryId, branchName, baseBranch) {
        try {
            const repository = this.repositories.get(repositoryId);
            if (!repository) {
                throw new Error(`Repository ${repositoryId} not found`);
            }

            const createCommands = [
                `cd ${repository.repoPath} && git checkout ${baseBranch}`,
                `cd ${repository.repoPath} && git pull origin ${baseBranch}`,
                `cd ${repository.repoPath} && git checkout -b ${branchName}`,
                `cd ${repository.repoPath} && git push -u origin ${branchName}`
            ];

            for (const command of createCommands) {
                const result = await this.agentAPI.executeCommand(instanceId, command);
                if (result.exitCode !== 0) {
                    throw new Error(`Branch creation failed: ${result.stderr}`);
                }
            }

            // Get new branch information
            const branchInfo = await this.getBranchInfo(instanceId, repository);
            const newBranch = {
                name: branchName,
                type: 'feature',
                baseBranch,
                createdAt: new Date().toISOString(),
                ...branchInfo
            };

            repository.branches.set(branchName, newBranch);

            this.emit('branchCreated', { 
                repository: repositoryId, 
                branch: newBranch 
            });

            return newBranch;

        } catch (error) {
            this.emit('error', { type: 'branchCreation', error, repositoryId, branchName });
            throw error;
        }
    }

    /**
     * Commit changes to repository
     * @param {string} instanceId - WSL2 instance ID
     * @param {string} repositoryId - Repository ID
     * @param {string} message - Commit message
     * @param {Array} files - Files to commit (optional, commits all if not specified)
     * @returns {Promise<Object>} Commit information
     */
    async commitChanges(instanceId, repositoryId, message, files = null) {
        try {
            const repository = this.repositories.get(repositoryId);
            if (!repository) {
                throw new Error(`Repository ${repositoryId} not found`);
            }

            const commitCommands = [];
            
            if (files && files.length > 0) {
                // Add specific files
                for (const file of files) {
                    commitCommands.push(`cd ${repository.repoPath} && git add ${file}`);
                }
            } else {
                // Add all changes
                commitCommands.push(`cd ${repository.repoPath} && git add .`);
            }

            commitCommands.push(`cd ${repository.repoPath} && git commit -m "${message}"`);

            for (const command of commitCommands) {
                const result = await this.agentAPI.executeCommand(instanceId, command);
                if (result.exitCode !== 0 && !result.stderr.includes('nothing to commit')) {
                    throw new Error(`Commit failed: ${result.stderr}`);
                }
            }

            // Get commit information
            const commitInfo = await this.getBranchInfo(instanceId, repository);
            const commit = {
                repositoryId,
                message,
                files: files || ['all'],
                committedAt: new Date().toISOString(),
                ...commitInfo
            };

            this.emit('changesCommitted', commit);
            return commit;

        } catch (error) {
            this.emit('error', { type: 'commit', error, repositoryId });
            throw error;
        }
    }

    /**
     * Push changes to remote repository
     * @param {string} instanceId - WSL2 instance ID
     * @param {string} repositoryId - Repository ID
     * @param {string} branch - Branch to push
     * @param {string} remote - Remote name (default: origin)
     * @returns {Promise<Object>} Push result
     */
    async pushChanges(instanceId, repositoryId, branch, remote = 'origin') {
        try {
            const repository = this.repositories.get(repositoryId);
            if (!repository) {
                throw new Error(`Repository ${repositoryId} not found`);
            }

            const pushCommand = `cd ${repository.repoPath} && git push ${remote} ${branch}`;
            const result = await this.agentAPI.executeCommand(instanceId, pushCommand);

            if (result.exitCode !== 0) {
                throw new Error(`Push failed: ${result.stderr}`);
            }

            const pushResult = {
                repositoryId,
                branch,
                remote,
                pushedAt: new Date().toISOString(),
                output: result.stdout
            };

            this.emit('changesPushed', pushResult);
            return pushResult;

        } catch (error) {
            this.emit('error', { type: 'push', error, repositoryId });
            throw error;
        }
    }

    /**
     * Get repository information
     * @param {string} repositoryId - Repository ID
     * @returns {Promise<Object>} Repository information
     */
    async getRepository(repositoryId) {
        const repository = this.repositories.get(repositoryId);
        if (!repository) {
            throw new Error(`Repository ${repositoryId} not found`);
        }
        return repository;
    }

    /**
     * List all managed repositories
     * @returns {Promise<Array>} Array of repositories
     */
    async listRepositories() {
        return Array.from(this.repositories.values());
    }

    /**
     * Cleanup repository resources
     * @param {string} repositoryId - Repository ID
     * @returns {Promise<boolean>} True if cleanup successful
     */
    async cleanupRepository(repositoryId) {
        try {
            const repository = this.repositories.get(repositoryId);
            if (!repository) {
                return true; // Already cleaned up
            }

            // Remove repository directory
            const cleanupCommand = `rm -rf ${repository.workspace}`;
            await this.agentAPI.executeCommand(repository.instanceId, cleanupCommand);

            // Remove from tracking
            this.repositories.delete(repositoryId);

            this.emit('repositoryCleanedUp', { repositoryId });
            return true;

        } catch (error) {
            this.emit('error', { type: 'repositoryCleanup', error, repositoryId });
            throw error;
        }
    }

    /**
     * Cleanup all resources
     */
    async cleanup() {
        try {
            const repositories = await this.listRepositories();
            await Promise.all(
                repositories.map(repo => this.cleanupRepository(repo.id))
            );

            await this.agentAPI.cleanup();
            this.emit('cleanup');
        } catch (error) {
            this.emit('error', { type: 'cleanup', error });
            throw error;
        }
    }
}

export default RepositoryManager;

