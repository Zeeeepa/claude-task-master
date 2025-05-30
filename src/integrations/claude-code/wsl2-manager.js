/**
 * WSL2 Environment Manager
 * 
 * Manages WSL2 environments for isolated PR validation and testing.
 * Handles environment creation, configuration, dependency installation, and cleanup.
 */

export class WSL2Manager {
    constructor(claudeCodeClient) {
        this.claudeCode = claudeCodeClient;
        
        // Environment configurations
        this.environmentConfigs = {
            default: {
                baseImage: 'ubuntu:22.04',
                resources: {
                    cpu: '2',
                    memory: '4GB',
                    disk: '20GB'
                },
                networking: 'isolated',
                timeout: 3600000 // 1 hour
            },
            lightweight: {
                baseImage: 'ubuntu:22.04',
                resources: {
                    cpu: '1',
                    memory: '2GB',
                    disk: '10GB'
                },
                networking: 'isolated',
                timeout: 1800000 // 30 minutes
            },
            performance: {
                baseImage: 'ubuntu:22.04',
                resources: {
                    cpu: '4',
                    memory: '8GB',
                    disk: '40GB'
                },
                networking: 'isolated',
                timeout: 7200000 // 2 hours
            }
        };

        // Package manager configurations
        this.packageManagers = [
            {
                name: 'npm',
                detectFiles: ['package.json'],
                installCommand: 'npm install',
                testCommand: 'npm test',
                buildCommand: 'npm run build',
                workingDirectory: '/workspace'
            },
            {
                name: 'yarn',
                detectFiles: ['yarn.lock'],
                installCommand: 'yarn install',
                testCommand: 'yarn test',
                buildCommand: 'yarn build',
                workingDirectory: '/workspace'
            },
            {
                name: 'pnpm',
                detectFiles: ['pnpm-lock.yaml'],
                installCommand: 'pnpm install',
                testCommand: 'pnpm test',
                buildCommand: 'pnpm build',
                workingDirectory: '/workspace'
            },
            {
                name: 'pip',
                detectFiles: ['requirements.txt', 'pyproject.toml', 'setup.py'],
                installCommand: 'pip install -r requirements.txt',
                testCommand: 'python -m pytest',
                buildCommand: 'python setup.py build',
                workingDirectory: '/workspace'
            },
            {
                name: 'poetry',
                detectFiles: ['poetry.lock'],
                installCommand: 'poetry install',
                testCommand: 'poetry run pytest',
                buildCommand: 'poetry build',
                workingDirectory: '/workspace'
            },
            {
                name: 'go',
                detectFiles: ['go.mod'],
                installCommand: 'go mod download',
                testCommand: 'go test ./...',
                buildCommand: 'go build ./...',
                workingDirectory: '/workspace'
            },
            {
                name: 'cargo',
                detectFiles: ['Cargo.toml'],
                installCommand: 'cargo fetch',
                testCommand: 'cargo test',
                buildCommand: 'cargo build',
                workingDirectory: '/workspace'
            },
            {
                name: 'maven',
                detectFiles: ['pom.xml'],
                installCommand: 'mvn dependency:resolve',
                testCommand: 'mvn test',
                buildCommand: 'mvn compile',
                workingDirectory: '/workspace'
            },
            {
                name: 'gradle',
                detectFiles: ['build.gradle', 'build.gradle.kts'],
                installCommand: './gradlew dependencies',
                testCommand: './gradlew test',
                buildCommand: './gradlew build',
                workingDirectory: '/workspace'
            }
        ];
    }

    /**
     * Setup isolated environment for PR validation
     * @param {Object} prData - PR data
     * @param {string} environmentType - Environment type (default, lightweight, performance)
     * @returns {Promise<Object>} Environment setup result
     */
    async setupEnvironment(prData, environmentType = 'default') {
        try {
            console.log(`Setting up ${environmentType} environment for PR #${prData.number}`);
            
            const config = this.environmentConfigs[environmentType];
            if (!config) {
                throw new Error(`Unknown environment type: ${environmentType}`);
            }

            const environmentConfig = {
                name: `pr-${prData.number}-${Date.now()}`,
                ...config,
                metadata: {
                    prNumber: prData.number,
                    repository: prData.repository,
                    branch: prData.branch,
                    createdAt: new Date().toISOString()
                }
            };

            const environment = await this.claudeCode.createEnvironment(environmentConfig);
            console.log(`Environment ${environment.id} created successfully`);

            return {
                environmentId: environment.id,
                config: environmentConfig,
                status: 'created'
            };

        } catch (error) {
            console.error('Failed to setup environment:', error);
            throw new Error(`Environment setup failed: ${error.message}`);
        }
    }

    /**
     * Clone PR branch into environment
     * @param {string} environmentId - Environment ID
     * @param {Object} prData - PR data
     * @returns {Promise<Object>} Clone operation result
     */
    async cloneBranch(environmentId, prData) {
        try {
            console.log(`Cloning branch ${prData.branch} into environment ${environmentId}`);

            // First, ensure git is available
            await this.ensureGitInstalled(environmentId);

            // Clone the repository
            const cloneResult = await this.claudeCode.executeCommand(environmentId, {
                command: 'git',
                args: [
                    'clone',
                    '--branch', prData.branch,
                    '--single-branch',
                    '--depth', '1',
                    prData.repository.clone_url,
                    '/workspace'
                ],
                workingDirectory: '/',
                timeout: 300000, // 5 minutes
                environment: {
                    GIT_TERMINAL_PROMPT: '0' // Disable interactive prompts
                }
            });

            if (cloneResult.exitCode !== 0) {
                throw new Error(`Git clone failed: ${cloneResult.stderr}`);
            }

            console.log(`Successfully cloned branch ${prData.branch}`);
            return {
                status: 'success',
                output: cloneResult.stdout,
                workspaceReady: true
            };

        } catch (error) {
            console.error('Failed to clone branch:', error);
            throw new Error(`Branch clone failed: ${error.message}`);
        }
    }

    /**
     * Install dependencies based on detected package managers
     * @param {string} environmentId - Environment ID
     * @returns {Promise<Object>} Installation result
     */
    async installDependencies(environmentId) {
        try {
            console.log(`Installing dependencies in environment ${environmentId}`);

            const installationResults = [];
            const detectedManagers = await this.detectPackageManagers(environmentId);

            if (detectedManagers.length === 0) {
                console.log('No package managers detected, skipping dependency installation');
                return {
                    status: 'skipped',
                    reason: 'No package managers detected',
                    results: []
                };
            }

            // Install dependencies for each detected package manager
            for (const manager of detectedManagers) {
                try {
                    console.log(`Installing dependencies using ${manager.name}...`);
                    
                    // Ensure package manager is installed
                    await this.ensurePackageManagerInstalled(environmentId, manager);

                    // Run installation command
                    const result = await this.claudeCode.executeCommand(environmentId, {
                        command: 'bash',
                        args: ['-c', manager.installCommand],
                        workingDirectory: manager.workingDirectory,
                        timeout: 600000, // 10 minutes
                        environment: {
                            NODE_ENV: 'development',
                            CI: 'true'
                        }
                    });

                    installationResults.push({
                        manager: manager.name,
                        status: result.exitCode === 0 ? 'success' : 'failed',
                        output: result.stdout,
                        error: result.stderr,
                        duration: result.duration
                    });

                    if (result.exitCode !== 0) {
                        console.warn(`Dependency installation failed for ${manager.name}: ${result.stderr}`);
                    } else {
                        console.log(`Dependencies installed successfully using ${manager.name}`);
                    }

                } catch (error) {
                    console.error(`Error installing dependencies with ${manager.name}:`, error);
                    installationResults.push({
                        manager: manager.name,
                        status: 'error',
                        error: error.message
                    });
                }
            }

            const successfulInstalls = installationResults.filter(r => r.status === 'success');
            const overallStatus = successfulInstalls.length > 0 ? 'success' : 'failed';

            return {
                status: overallStatus,
                detectedManagers: detectedManagers.map(m => m.name),
                results: installationResults,
                successfulInstalls: successfulInstalls.length
            };

        } catch (error) {
            console.error('Failed to install dependencies:', error);
            throw new Error(`Dependency installation failed: ${error.message}`);
        }
    }

    /**
     * Detect package managers in the workspace
     * @param {string} environmentId - Environment ID
     * @returns {Promise<Array>} List of detected package managers
     */
    async detectPackageManagers(environmentId) {
        const detected = [];

        for (const manager of this.packageManagers) {
            for (const file of manager.detectFiles) {
                const exists = await this.claudeCode.fileExists(environmentId, `/workspace/${file}`);
                if (exists) {
                    detected.push(manager);
                    break; // Only add each manager once
                }
            }
        }

        console.log(`Detected package managers: ${detected.map(m => m.name).join(', ')}`);
        return detected;
    }

    /**
     * Ensure git is installed in the environment
     * @param {string} environmentId - Environment ID
     */
    async ensureGitInstalled(environmentId) {
        try {
            // Check if git is already installed
            const gitCheck = await this.claudeCode.executeCommand(environmentId, {
                command: 'which',
                args: ['git'],
                workingDirectory: '/',
                timeout: 10000
            });

            if (gitCheck.exitCode === 0) {
                console.log('Git is already installed');
                return;
            }

            // Install git
            console.log('Installing git...');
            const installResult = await this.claudeCode.executeCommand(environmentId, {
                command: 'apt-get',
                args: ['update', '&&', 'apt-get', 'install', '-y', 'git'],
                workingDirectory: '/',
                timeout: 120000 // 2 minutes
            });

            if (installResult.exitCode !== 0) {
                throw new Error(`Failed to install git: ${installResult.stderr}`);
            }

            console.log('Git installed successfully');

        } catch (error) {
            console.error('Error ensuring git installation:', error);
            throw error;
        }
    }

    /**
     * Ensure package manager is installed in the environment
     * @param {string} environmentId - Environment ID
     * @param {Object} manager - Package manager configuration
     */
    async ensurePackageManagerInstalled(environmentId, manager) {
        const installCommands = {
            npm: 'curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs',
            yarn: 'npm install -g yarn',
            pnpm: 'npm install -g pnpm',
            pip: 'apt-get update && apt-get install -y python3-pip',
            poetry: 'pip3 install poetry',
            go: 'wget -O- https://golang.org/dl/go1.21.0.linux-amd64.tar.gz | tar -C /usr/local -xzf - && echo "export PATH=$PATH:/usr/local/go/bin" >> ~/.bashrc',
            cargo: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y',
            maven: 'apt-get update && apt-get install -y maven',
            gradle: 'apt-get update && apt-get install -y gradle'
        };

        const checkCommands = {
            npm: 'node --version',
            yarn: 'yarn --version',
            pnpm: 'pnpm --version',
            pip: 'python3 -m pip --version',
            poetry: 'poetry --version',
            go: 'go version',
            cargo: 'cargo --version',
            maven: 'mvn --version',
            gradle: 'gradle --version'
        };

        try {
            // Check if package manager is already installed
            const checkCommand = checkCommands[manager.name];
            if (checkCommand) {
                const checkResult = await this.claudeCode.executeCommand(environmentId, {
                    command: 'bash',
                    args: ['-c', checkCommand],
                    workingDirectory: '/',
                    timeout: 30000
                });

                if (checkResult.exitCode === 0) {
                    console.log(`${manager.name} is already installed`);
                    return;
                }
            }

            // Install package manager
            const installCommand = installCommands[manager.name];
            if (installCommand) {
                console.log(`Installing ${manager.name}...`);
                const installResult = await this.claudeCode.executeCommand(environmentId, {
                    command: 'bash',
                    args: ['-c', installCommand],
                    workingDirectory: '/',
                    timeout: 300000 // 5 minutes
                });

                if (installResult.exitCode !== 0) {
                    console.warn(`Failed to install ${manager.name}: ${installResult.stderr}`);
                } else {
                    console.log(`${manager.name} installed successfully`);
                }
            }

        } catch (error) {
            console.error(`Error ensuring ${manager.name} installation:`, error);
            // Don't throw here, as we want to continue with other package managers
        }
    }

    /**
     * Run build process in environment
     * @param {string} environmentId - Environment ID
     * @returns {Promise<Object>} Build result
     */
    async runBuild(environmentId) {
        try {
            console.log(`Running build in environment ${environmentId}`);

            const detectedManagers = await this.detectPackageManagers(environmentId);
            const buildResults = [];

            for (const manager of detectedManagers) {
                if (manager.buildCommand) {
                    try {
                        const result = await this.claudeCode.executeCommand(environmentId, {
                            command: 'bash',
                            args: ['-c', manager.buildCommand],
                            workingDirectory: manager.workingDirectory,
                            timeout: 600000 // 10 minutes
                        });

                        buildResults.push({
                            manager: manager.name,
                            status: result.exitCode === 0 ? 'success' : 'failed',
                            output: result.stdout,
                            error: result.stderr
                        });

                    } catch (error) {
                        buildResults.push({
                            manager: manager.name,
                            status: 'error',
                            error: error.message
                        });
                    }
                }
            }

            const successfulBuilds = buildResults.filter(r => r.status === 'success');
            return {
                status: successfulBuilds.length > 0 ? 'success' : 'failed',
                results: buildResults
            };

        } catch (error) {
            console.error('Failed to run build:', error);
            throw new Error(`Build failed: ${error.message}`);
        }
    }

    /**
     * Run tests in environment
     * @param {string} environmentId - Environment ID
     * @returns {Promise<Object>} Test result
     */
    async runTests(environmentId) {
        try {
            console.log(`Running tests in environment ${environmentId}`);

            const detectedManagers = await this.detectPackageManagers(environmentId);
            const testResults = [];

            for (const manager of detectedManagers) {
                if (manager.testCommand) {
                    try {
                        const result = await this.claudeCode.executeCommand(environmentId, {
                            command: 'bash',
                            args: ['-c', manager.testCommand],
                            workingDirectory: manager.workingDirectory,
                            timeout: 600000 // 10 minutes
                        });

                        testResults.push({
                            manager: manager.name,
                            status: result.exitCode === 0 ? 'success' : 'failed',
                            output: result.stdout,
                            error: result.stderr
                        });

                    } catch (error) {
                        testResults.push({
                            manager: manager.name,
                            status: 'error',
                            error: error.message
                        });
                    }
                }
            }

            const successfulTests = testResults.filter(r => r.status === 'success');
            return {
                status: successfulTests.length > 0 ? 'success' : 'failed',
                results: testResults
            };

        } catch (error) {
            console.error('Failed to run tests:', error);
            throw new Error(`Tests failed: ${error.message}`);
        }
    }

    /**
     * Get environment information
     * @param {string} environmentId - Environment ID
     * @returns {Promise<Object>} Environment information
     */
    async getEnvironmentInfo(environmentId) {
        try {
            const systemInfo = await this.claudeCode.executeCommand(environmentId, {
                command: 'bash',
                args: ['-c', 'uname -a && df -h && free -h && ps aux'],
                workingDirectory: '/',
                timeout: 30000
            });

            return {
                environmentId,
                systemInfo: systemInfo.stdout,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('Failed to get environment info:', error);
            return {
                environmentId,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    /**
     * Cleanup environment
     * @param {string} environmentId - Environment ID to cleanup
     * @returns {Promise<Object>} Cleanup result
     */
    async cleanupEnvironment(environmentId) {
        try {
            console.log(`Cleaning up environment ${environmentId}`);
            
            const result = await this.claudeCode.destroyEnvironment(environmentId);
            
            console.log(`Environment ${environmentId} cleaned up successfully`);
            return {
                status: 'success',
                environmentId,
                cleanupTime: new Date()
            };

        } catch (error) {
            console.error(`Failed to cleanup environment ${environmentId}:`, error);
            return {
                status: 'failed',
                environmentId,
                error: error.message,
                cleanupTime: new Date()
            };
        }
    }

    /**
     * Get environment configuration
     * @param {string} environmentType - Environment type
     * @returns {Object} Environment configuration
     */
    getEnvironmentConfig(environmentType) {
        return this.environmentConfigs[environmentType] || null;
    }

    /**
     * Update environment configuration
     * @param {string} environmentType - Environment type
     * @param {Object} config - New configuration
     */
    updateEnvironmentConfig(environmentType, config) {
        this.environmentConfigs[environmentType] = { ...this.environmentConfigs[environmentType], ...config };
    }

    /**
     * Get available environment types
     * @returns {Array<string>} List of available environment types
     */
    getAvailableEnvironmentTypes() {
        return Object.keys(this.environmentConfigs);
    }
}

export default WSL2Manager;

