/**
 * @fileoverview Deployment Orchestrator
 * @description Orchestrates deployment and environment setup for PR validation
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * Deployment Orchestrator for managing PR deployments and environment setup
 */
export class DeploymentOrchestrator {
    constructor(config = {}) {
        this.config = {
            workspace_root: config.workspace_root || '/tmp/claude-code-workspace',
            git_timeout: config.git_timeout || 300000, // 5 minutes
            dependency_timeout: config.dependency_timeout || 600000, // 10 minutes
            max_concurrent_deployments: config.max_concurrent_deployments || 3,
            cleanup_after_hours: config.cleanup_after_hours || 24,
            supported_package_managers: ['npm', 'yarn', 'pnpm', 'pip', 'poetry', 'maven', 'gradle'],
            ...config
        };

        this.activeDeployments = new Map();
        this.deploymentHistory = [];
        this.packageManagerDetectors = {
            'package.json': ['npm', 'yarn', 'pnpm'],
            'requirements.txt': ['pip'],
            'pyproject.toml': ['poetry'],
            'pom.xml': ['maven'],
            'build.gradle': ['gradle'],
            'Cargo.toml': ['cargo'],
            'go.mod': ['go'],
            'composer.json': ['composer']
        };
    }

    /**
     * Initialize the deployment orchestrator
     */
    async initialize() {
        console.log('🚀 Initializing Deployment Orchestrator...');
        
        try {
            // Create workspace directory
            await fs.mkdir(this.config.workspace_root, { recursive: true });
            
            // Clean up old deployments
            await this.cleanupOldDeployments();
            
            console.log('✅ Deployment Orchestrator initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Deployment Orchestrator:', error);
            throw error;
        }
    }

    /**
     * Clone repository to workspace
     */
    async cloneRepository(options) {
        const { url, branch, depth = 1, destination } = options;
        const deploymentId = `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`📥 Cloning repository: ${url} (branch: ${branch})`);
        
        try {
            // Create deployment directory
            const deploymentPath = destination || path.join(this.config.workspace_root, deploymentId);
            await fs.mkdir(deploymentPath, { recursive: true });

            // Track deployment
            const deployment = {
                id: deploymentId,
                url,
                branch,
                path: deploymentPath,
                status: 'cloning',
                startTime: Date.now()
            };
            
            this.activeDeployments.set(deploymentId, deployment);

            // Clone repository
            const cloneCommand = `git clone --depth ${depth} --branch ${branch} ${url} ${deploymentPath}`;
            const { stdout, stderr } = await execAsync(cloneCommand, { 
                timeout: this.config.git_timeout 
            });

            // Verify clone success
            const gitDir = path.join(deploymentPath, '.git');
            try {
                await fs.access(gitDir);
            } catch (error) {
                throw new Error('Repository clone verification failed');
            }

            deployment.status = 'cloned';
            deployment.endTime = Date.now();
            deployment.duration = deployment.endTime - deployment.startTime;

            console.log(`✅ Repository cloned successfully: ${deploymentPath}`);
            
            return {
                deploymentId,
                path: deploymentPath,
                success: true,
                duration: deployment.duration,
                stdout,
                stderr
            };
        } catch (error) {
            console.error('❌ Failed to clone repository:', error);
            
            // Update deployment status
            const deployment = this.activeDeployments.get(deploymentId);
            if (deployment) {
                deployment.status = 'failed';
                deployment.error = error.message;
                deployment.endTime = Date.now();
            }
            
            throw error;
        }
    }

    /**
     * Resolve dependencies for the project
     */
    async resolveDependencies(projectPath) {
        console.log(`📦 Resolving dependencies for: ${projectPath}`);
        
        try {
            // Detect package managers
            const packageManagers = await this.detectPackageManagers(projectPath);
            
            if (packageManagers.length === 0) {
                console.log('ℹ️ No package managers detected, skipping dependency resolution');
                return { success: true, packageManagers: [], conflicts: [] };
            }

            const results = [];
            const conflicts = [];

            // Process each package manager
            for (const pm of packageManagers) {
                console.log(`📦 Processing ${pm.manager} dependencies...`);
                
                try {
                    const result = await this.installDependencies(projectPath, pm);
                    results.push(result);
                    
                    if (!result.success) {
                        conflicts.push(...(result.conflicts || []));
                    }
                } catch (error) {
                    console.error(`❌ Failed to install ${pm.manager} dependencies:`, error);
                    conflicts.push({
                        manager: pm.manager,
                        error: error.message,
                        file: pm.file
                    });
                }
            }

            const success = results.every(r => r.success);
            
            return {
                success,
                packageManagers,
                results,
                conflicts,
                totalDependencies: results.reduce((sum, r) => sum + (r.installedCount || 0), 0)
            };
        } catch (error) {
            console.error('❌ Failed to resolve dependencies:', error);
            throw error;
        }
    }

    /**
     * Detect package managers in the project
     */
    async detectPackageManagers(projectPath) {
        console.log(`🔍 Detecting package managers in: ${projectPath}`);
        
        const detectedManagers = [];
        
        try {
            const files = await fs.readdir(projectPath);
            
            for (const file of files) {
                if (this.packageManagerDetectors[file]) {
                    const managers = this.packageManagerDetectors[file];
                    const filePath = path.join(projectPath, file);
                    
                    // Determine the best package manager for this file
                    const preferredManager = await this.selectPreferredManager(filePath, managers);
                    
                    detectedManagers.push({
                        manager: preferredManager,
                        file: file,
                        path: filePath
                    });
                }
            }

            console.log(`✅ Detected package managers:`, detectedManagers.map(pm => pm.manager));
            return detectedManagers;
        } catch (error) {
            console.error('❌ Failed to detect package managers:', error);
            return [];
        }
    }

    /**
     * Select preferred package manager for a file
     */
    async selectPreferredManager(filePath, managers) {
        const fileName = path.basename(filePath);
        
        // Special logic for JavaScript/Node.js projects
        if (fileName === 'package.json') {
            try {
                const content = await fs.readFile(filePath, 'utf8');
                const packageJson = JSON.parse(content);
                
                // Check for lock files to determine package manager
                const projectDir = path.dirname(filePath);
                const files = await fs.readdir(projectDir);
                
                if (files.includes('pnpm-lock.yaml')) return 'pnpm';
                if (files.includes('yarn.lock')) return 'yarn';
                if (files.includes('package-lock.json')) return 'npm';
                
                // Check package.json for packageManager field
                if (packageJson.packageManager) {
                    if (packageJson.packageManager.includes('pnpm')) return 'pnpm';
                    if (packageJson.packageManager.includes('yarn')) return 'yarn';
                }
                
                // Default to npm
                return 'npm';
            } catch (error) {
                return 'npm'; // Default fallback
            }
        }
        
        // For other files, return the first manager
        return managers[0];
    }

    /**
     * Install dependencies using the appropriate package manager
     */
    async installDependencies(projectPath, packageManager) {
        console.log(`📦 Installing ${packageManager.manager} dependencies...`);
        
        const startTime = Date.now();
        
        try {
            let installCommand;
            let workingDir = projectPath;
            
            // If the package file is in a subdirectory, use that as working directory
            if (packageManager.path !== path.join(projectPath, packageManager.file)) {
                workingDir = path.dirname(packageManager.path);
            }

            // Determine install command based on package manager
            switch (packageManager.manager) {
                case 'npm':
                    installCommand = 'npm install';
                    break;
                case 'yarn':
                    installCommand = 'yarn install';
                    break;
                case 'pnpm':
                    installCommand = 'pnpm install';
                    break;
                case 'pip':
                    installCommand = 'pip3 install -r requirements.txt';
                    break;
                case 'poetry':
                    installCommand = 'poetry install';
                    break;
                case 'maven':
                    installCommand = 'mvn dependency:resolve';
                    break;
                case 'gradle':
                    installCommand = './gradlew dependencies';
                    break;
                case 'cargo':
                    installCommand = 'cargo build';
                    break;
                case 'go':
                    installCommand = 'go mod download';
                    break;
                case 'composer':
                    installCommand = 'composer install';
                    break;
                default:
                    throw new Error(`Unsupported package manager: ${packageManager.manager}`);
            }

            console.log(`⚡ Executing: ${installCommand} in ${workingDir}`);
            
            const { stdout, stderr } = await execAsync(installCommand, {
                cwd: workingDir,
                timeout: this.config.dependency_timeout,
                env: { ...process.env, NODE_ENV: 'development' }
            });

            const duration = Date.now() - startTime;
            
            // Parse output to count installed dependencies
            const installedCount = this.parseInstalledCount(stdout, packageManager.manager);
            
            console.log(`✅ ${packageManager.manager} dependencies installed (${installedCount} packages, ${duration}ms)`);
            
            return {
                success: true,
                manager: packageManager.manager,
                installedCount,
                duration,
                stdout,
                stderr
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            
            console.error(`❌ Failed to install ${packageManager.manager} dependencies:`, error.message);
            
            // Analyze error for common issues
            const conflicts = this.analyzeInstallationError(error, packageManager.manager);
            
            return {
                success: false,
                manager: packageManager.manager,
                error: error.message,
                duration,
                conflicts
            };
        }
    }

    /**
     * Parse installed package count from output
     */
    parseInstalledCount(output, manager) {
        try {
            switch (manager) {
                case 'npm':
                    const npmMatch = output.match(/added (\d+) packages/);
                    return npmMatch ? parseInt(npmMatch[1]) : 0;
                case 'yarn':
                    const yarnMatch = output.match(/Done in ([\d.]+)s/);
                    return yarnMatch ? 1 : 0; // Yarn doesn't always show count
                case 'pip':
                    const pipMatches = output.match(/Successfully installed/g);
                    return pipMatches ? pipMatches.length : 0;
                default:
                    return 0;
            }
        } catch (error) {
            return 0;
        }
    }

    /**
     * Analyze installation errors for common issues
     */
    analyzeInstallationError(error, manager) {
        const conflicts = [];
        const errorMessage = error.message.toLowerCase();
        
        // Common dependency conflicts
        if (errorMessage.includes('peer dep') || errorMessage.includes('peerDependencies')) {
            conflicts.push({
                type: 'peer_dependency',
                manager,
                description: 'Peer dependency conflict detected'
            });
        }
        
        if (errorMessage.includes('version conflict') || errorMessage.includes('conflicting')) {
            conflicts.push({
                type: 'version_conflict',
                manager,
                description: 'Version conflict detected'
            });
        }
        
        if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
            conflicts.push({
                type: 'network_error',
                manager,
                description: 'Network or timeout error'
            });
        }
        
        if (errorMessage.includes('permission') || errorMessage.includes('eacces')) {
            conflicts.push({
                type: 'permission_error',
                manager,
                description: 'Permission error'
            });
        }
        
        return conflicts;
    }

    /**
     * Setup development environment
     */
    async setupDevelopmentEnvironment(projectPath, options = {}) {
        console.log(`⚙️ Setting up development environment: ${projectPath}`);
        
        try {
            const setupTasks = [];
            
            // Setup Node.js environment
            if (options.nodejs !== false) {
                setupTasks.push(this.setupNodeEnvironment(projectPath));
            }
            
            // Setup Python environment
            if (options.python !== false) {
                setupTasks.push(this.setupPythonEnvironment(projectPath));
            }
            
            // Setup testing environment
            if (options.testing !== false) {
                setupTasks.push(this.setupTestingEnvironment(projectPath));
            }
            
            // Setup linting and formatting
            if (options.linting !== false) {
                setupTasks.push(this.setupLintingEnvironment(projectPath));
            }
            
            const results = await Promise.allSettled(setupTasks);
            
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            console.log(`✅ Development environment setup complete (${successful} successful, ${failed} failed)`);
            
            return {
                success: failed === 0,
                successful,
                failed,
                results: results.map(r => r.status === 'fulfilled' ? r.value : r.reason)
            };
        } catch (error) {
            console.error('❌ Failed to setup development environment:', error);
            throw error;
        }
    }

    /**
     * Setup Node.js environment
     */
    async setupNodeEnvironment(projectPath) {
        const packageJsonPath = path.join(projectPath, 'package.json');
        
        try {
            await fs.access(packageJsonPath);
            
            // Check for .nvmrc file
            const nvmrcPath = path.join(projectPath, '.nvmrc');
            try {
                await fs.access(nvmrcPath);
                await execAsync('nvm use', { cwd: projectPath });
                console.log('✅ Node.js version set from .nvmrc');
            } catch (error) {
                console.log('ℹ️ No .nvmrc file found, using default Node.js version');
            }
            
            return { success: true, environment: 'nodejs' };
        } catch (error) {
            return { success: false, environment: 'nodejs', error: error.message };
        }
    }

    /**
     * Setup Python environment
     */
    async setupPythonEnvironment(projectPath) {
        try {
            // Check for Python files
            const files = await fs.readdir(projectPath);
            const hasPythonFiles = files.some(file => 
                file.endsWith('.py') || 
                file === 'requirements.txt' || 
                file === 'pyproject.toml'
            );
            
            if (!hasPythonFiles) {
                return { success: true, environment: 'python', skipped: true };
            }
            
            // Create virtual environment if it doesn't exist
            const venvPath = path.join(projectPath, 'venv');
            try {
                await fs.access(venvPath);
            } catch (error) {
                await execAsync('python3 -m venv venv', { cwd: projectPath });
                console.log('✅ Python virtual environment created');
            }
            
            return { success: true, environment: 'python' };
        } catch (error) {
            return { success: false, environment: 'python', error: error.message };
        }
    }

    /**
     * Setup testing environment
     */
    async setupTestingEnvironment(projectPath) {
        try {
            // Check for test directories and files
            const files = await fs.readdir(projectPath);
            const hasTests = files.some(file => 
                file.includes('test') || 
                file.includes('spec') ||
                file === '__tests__'
            );
            
            if (!hasTests) {
                return { success: true, environment: 'testing', skipped: true };
            }
            
            console.log('✅ Testing environment detected');
            return { success: true, environment: 'testing' };
        } catch (error) {
            return { success: false, environment: 'testing', error: error.message };
        }
    }

    /**
     * Setup linting environment
     */
    async setupLintingEnvironment(projectPath) {
        try {
            // Check for linting configuration files
            const files = await fs.readdir(projectPath);
            const lintingFiles = files.filter(file => 
                file.includes('eslint') ||
                file.includes('prettier') ||
                file.includes('pylint') ||
                file.includes('flake8') ||
                file === '.editorconfig'
            );
            
            if (lintingFiles.length === 0) {
                return { success: true, environment: 'linting', skipped: true };
            }
            
            console.log(`✅ Linting configuration detected: ${lintingFiles.join(', ')}`);
            return { success: true, environment: 'linting', files: lintingFiles };
        } catch (error) {
            return { success: false, environment: 'linting', error: error.message };
        }
    }

    /**
     * Clean up old deployments
     */
    async cleanupOldDeployments() {
        console.log('🧹 Cleaning up old deployments...');
        
        try {
            const cutoffTime = Date.now() - (this.config.cleanup_after_hours * 60 * 60 * 1000);
            const cleanedUp = [];
            
            // Clean up from active deployments
            for (const [deploymentId, deployment] of this.activeDeployments) {
                if (deployment.startTime < cutoffTime) {
                    try {
                        await fs.rm(deployment.path, { recursive: true, force: true });
                        this.activeDeployments.delete(deploymentId);
                        cleanedUp.push(deploymentId);
                    } catch (error) {
                        console.warn(`⚠️ Failed to cleanup deployment ${deploymentId}:`, error.message);
                    }
                }
            }
            
            // Clean up workspace directory
            try {
                const workspaceFiles = await fs.readdir(this.config.workspace_root);
                for (const file of workspaceFiles) {
                    const filePath = path.join(this.config.workspace_root, file);
                    const stats = await fs.stat(filePath);
                    
                    if (stats.isDirectory() && stats.mtime.getTime() < cutoffTime) {
                        await fs.rm(filePath, { recursive: true, force: true });
                        cleanedUp.push(file);
                    }
                }
            } catch (error) {
                console.warn('⚠️ Failed to cleanup workspace directory:', error.message);
            }
            
            if (cleanedUp.length > 0) {
                console.log(`✅ Cleaned up ${cleanedUp.length} old deployments`);
            }
        } catch (error) {
            console.error('❌ Failed to cleanup old deployments:', error);
        }
    }

    /**
     * Get deployment status
     */
    getDeploymentStatus(deploymentId) {
        return this.activeDeployments.get(deploymentId);
    }

    /**
     * List active deployments
     */
    listActiveDeployments() {
        return Array.from(this.activeDeployments.values());
    }

    /**
     * Get deployment statistics
     */
    getDeploymentStatistics() {
        const active = this.activeDeployments.size;
        const total = this.deploymentHistory.length + active;
        const successful = this.deploymentHistory.filter(d => d.status === 'cloned').length;
        const failed = this.deploymentHistory.filter(d => d.status === 'failed').length;
        
        return {
            active,
            total,
            successful,
            failed,
            successRate: total > 0 ? (successful / total) * 100 : 0
        };
    }

    /**
     * Shutdown deployment orchestrator
     */
    async shutdown() {
        console.log('🛑 Shutting down Deployment Orchestrator...');
        
        // Move active deployments to history
        for (const [deploymentId, deployment] of this.activeDeployments) {
            this.deploymentHistory.push(deployment);
        }
        
        this.activeDeployments.clear();
        
        console.log('✅ Deployment Orchestrator shutdown complete');
    }
}

export default DeploymentOrchestrator;

