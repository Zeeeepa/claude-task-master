/**
 * @fileoverview Security Sandbox Implementation
 * @description Docker-based security sandbox with resource limits and network isolation
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Security Sandbox for isolated validation environments
 */
export class SecuritySandbox {
    constructor(config = {}) {
        this.config = {
            enable_docker: config.enable_docker !== false,
            docker_image: config.docker_image || 'claude-validation:latest',
            memory_limit: config.validation_memory_limit || '512MB',
            cpu_limit: config.validation_cpu_limit || 1.0,
            disk_limit: config.validation_disk_limit || '1GB',
            network_isolation: config.network_isolation !== false,
            enable_readonly_fs: config.enable_readonly_fs !== false,
            container_timeout: config.container_timeout || 600000, // 10 minutes
            max_containers: config.max_containers || 10,
            cleanup_interval: config.cleanup_interval || 300000, // 5 minutes
            ...config
        };

        this.activeContainers = new Map();
        this.containerMetrics = {
            created: 0,
            destroyed: 0,
            failed_creations: 0,
            failed_cleanups: 0
        };

        // Start cleanup interval
        this.cleanupInterval = setInterval(() => {
            this.cleanupOrphanedContainers().catch(error => 
                log('warning', `Container cleanup failed: ${error.message}`)
            );
        }, this.config.cleanup_interval);
    }

    /**
     * Initialize the security sandbox
     * @returns {Promise<void>}
     */
    async initialize() {
        if (!this.config.enable_docker) {
            log('info', 'Docker sandbox disabled, using host environment');
            return;
        }

        log('debug', 'Initializing Security Sandbox...');
        
        // Verify Docker is available
        await this.verifyDockerInstallation();
        
        // Build or pull validation image
        await this.ensureValidationImage();
        
        // Cleanup any existing containers
        await this.cleanupOrphanedContainers();
        
        log('debug', 'Security Sandbox initialized');
    }

    /**
     * Create secure environment for validation
     * @param {Object} workspace - Workspace information
     * @returns {Promise<Object>} Secure environment information
     */
    async createSecureEnvironment(workspace) {
        if (!this.config.enable_docker) {
            // Return host environment info
            return {
                type: 'host',
                workspace_path: workspace.path,
                restrictions: {
                    network_isolation: false,
                    readonly_fs: false,
                    resource_limits: false
                }
            };
        }

        const containerId = this.generateContainerId(workspace.id);
        
        log('debug', `Creating secure container ${containerId} for workspace ${workspace.id}`);
        
        try {
            // Check container limits
            if (this.activeContainers.size >= this.config.max_containers) {
                throw new Error(`Maximum containers (${this.config.max_containers}) exceeded`);
            }

            // Create container configuration
            const containerConfig = this.createContainerConfig(workspace, containerId);
            
            // Create and start container
            const container = await this.createContainer(containerConfig);
            
            // Track container
            this.activeContainers.set(containerId, {
                id: containerId,
                container_id: container.container_id,
                workspace_id: workspace.id,
                created_at: new Date(),
                config: containerConfig,
                status: 'running'
            });
            
            this.containerMetrics.created++;
            
            log('debug', `Secure container ${containerId} created successfully`);
            
            return {
                type: 'docker',
                container_id: containerId,
                docker_container_id: container.container_id,
                workspace_path: containerConfig.workspace_mount,
                restrictions: {
                    network_isolation: this.config.network_isolation,
                    readonly_fs: this.config.enable_readonly_fs,
                    resource_limits: true,
                    memory_limit: this.config.memory_limit,
                    cpu_limit: this.config.cpu_limit,
                    disk_limit: this.config.disk_limit
                },
                created_at: new Date()
            };
            
        } catch (error) {
            log('error', `Failed to create secure container ${containerId}: ${error.message}`);
            this.containerMetrics.failed_creations++;
            throw error;
        }
    }

    /**
     * Create container configuration
     * @param {Object} workspace - Workspace information
     * @param {string} containerId - Container ID
     * @returns {Object} Container configuration
     */
    createContainerConfig(workspace, containerId) {
        const workspaceMount = '/workspace';
        const logsMount = '/logs';
        
        return {
            name: containerId,
            image: this.config.docker_image,
            workspace_mount: workspaceMount,
            host_workspace_path: workspace.path,
            host_logs_path: join(workspace.path, 'logs'),
            environment: {
                NODE_ENV: 'validation',
                WORKSPACE_PATH: workspaceMount,
                VALIDATION_MODE: 'true',
                DISABLE_NETWORK: this.config.network_isolation ? 'true' : 'false'
            },
            resource_limits: {
                memory: this.config.memory_limit,
                cpu_quota: Math.floor(this.config.cpu_limit * 100000), // Convert to CPU quota
                cpu_period: 100000,
                disk_limit: this.config.disk_limit
            },
            security_options: {
                network_mode: this.config.network_isolation ? 'none' : 'bridge',
                readonly_rootfs: this.config.enable_readonly_fs,
                no_new_privileges: true,
                security_opt: ['no-new-privileges:true'],
                cap_drop: ['ALL'],
                cap_add: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID']
            },
            mounts: [
                {
                    type: 'bind',
                    source: workspace.path,
                    target: workspaceMount,
                    readonly: false
                },
                {
                    type: 'bind',
                    source: join(workspace.path, 'logs'),
                    target: logsMount,
                    readonly: false
                }
            ],
            timeout: this.config.container_timeout
        };
    }

    /**
     * Create and start Docker container
     * @param {Object} config - Container configuration
     * @returns {Promise<Object>} Container information
     */
    async createContainer(config) {
        // Ensure logs directory exists
        await fs.mkdir(join(config.host_workspace_path, 'logs'), { recursive: true });
        
        // Build Docker run command
        const dockerArgs = [
            'run',
            '--detach',
            '--name', config.name,
            '--workdir', config.workspace_mount,
            
            // Resource limits
            '--memory', config.resource_limits.memory,
            '--cpu-quota', config.resource_limits.cpu_quota.toString(),
            '--cpu-period', config.resource_limits.cpu_period.toString(),
            
            // Security options
            '--network', config.security_options.network_mode,
            '--security-opt', 'no-new-privileges:true',
            '--cap-drop', 'ALL',
            '--cap-add', 'CHOWN',
            '--cap-add', 'DAC_OVERRIDE',
            '--cap-add', 'FOWNER',
            '--cap-add', 'SETGID',
            '--cap-add', 'SETUID'
        ];
        
        // Add readonly filesystem if enabled
        if (config.security_options.readonly_rootfs) {
            dockerArgs.push('--read-only');
            // Add tmpfs for writable areas
            dockerArgs.push('--tmpfs', '/tmp:rw,noexec,nosuid,size=100m');
            dockerArgs.push('--tmpfs', '/var/tmp:rw,noexec,nosuid,size=100m');
        }
        
        // Add environment variables
        for (const [key, value] of Object.entries(config.environment)) {
            dockerArgs.push('--env', `${key}=${value}`);
        }
        
        // Add mounts
        for (const mount of config.mounts) {
            const mountStr = `type=${mount.type},source=${mount.source},target=${mount.target}${mount.readonly ? ',readonly' : ''}`;
            dockerArgs.push('--mount', mountStr);
        }
        
        // Add image and command
        dockerArgs.push(config.image);
        dockerArgs.push('sleep', Math.floor(config.timeout / 1000).toString()); // Keep container alive
        
        // Execute Docker command
        const result = await this.executeDockerCommand(dockerArgs);
        
        if (!result.success) {
            throw new Error(`Failed to create container: ${result.stderr}`);
        }
        
        const dockerContainerId = result.stdout.trim();
        
        return {
            container_id: dockerContainerId,
            name: config.name,
            created_at: new Date()
        };
    }

    /**
     * Execute command in secure environment
     * @param {Object} environment - Secure environment
     * @param {Array} command - Command to execute
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Command result
     */
    async executeInSecureEnvironment(environment, command, options = {}) {
        if (environment.type === 'host') {
            // Execute on host
            return await this.executeHostCommand(command, environment.workspace_path, options);
        }
        
        // Execute in Docker container
        const dockerArgs = [
            'exec',
            '--workdir', environment.workspace_path
        ];
        
        // Add environment variables if provided
        if (options.env) {
            for (const [key, value] of Object.entries(options.env)) {
                dockerArgs.push('--env', `${key}=${value}`);
            }
        }
        
        dockerArgs.push(environment.docker_container_id);
        dockerArgs.push(...command);
        
        return await this.executeDockerCommand(dockerArgs, options);
    }

    /**
     * Cleanup secure environment
     * @param {Object} environment - Secure environment to cleanup
     * @returns {Promise<void>}
     */
    async cleanup(environment) {
        if (environment.type === 'host') {
            // No cleanup needed for host environment
            return;
        }
        
        const containerId = environment.container_id;
        
        log('debug', `Cleaning up secure container ${containerId}`);
        
        try {
            // Stop and remove container
            await this.stopContainer(environment.docker_container_id);
            await this.removeContainer(environment.docker_container_id);
            
            // Remove from tracking
            this.activeContainers.delete(containerId);
            this.containerMetrics.destroyed++;
            
            log('debug', `Secure container ${containerId} cleaned up successfully`);
            
        } catch (error) {
            log('error', `Failed to cleanup container ${containerId}: ${error.message}`);
            this.containerMetrics.failed_cleanups++;
            
            // Mark as failed but don't throw
            if (this.activeContainers.has(containerId)) {
                this.activeContainers.get(containerId).status = 'cleanup_failed';
            }
        }
    }

    /**
     * Cleanup orphaned containers
     * @returns {Promise<void>}
     */
    async cleanupOrphanedContainers() {
        if (!this.config.enable_docker) {
            return;
        }
        
        log('debug', 'Cleaning up orphaned containers...');
        
        try {
            // List containers with our naming pattern
            const listResult = await this.executeDockerCommand([
                'ps', '-a', '--filter', 'name=claude-validation-', '--format', '{{.Names}}'
            ]);
            
            if (listResult.success && listResult.stdout.trim()) {
                const containerNames = listResult.stdout.trim().split('\n');
                
                for (const containerName of containerNames) {
                    try {
                        log('debug', `Removing orphaned container: ${containerName}`);
                        await this.executeDockerCommand(['rm', '-f', containerName]);
                    } catch (error) {
                        log('warning', `Failed to remove orphaned container ${containerName}: ${error.message}`);
                    }
                }
                
                log('info', `Cleaned up ${containerNames.length} orphaned containers`);
            }
            
        } catch (error) {
            log('error', `Failed to cleanup orphaned containers: ${error.message}`);
        }
    }

    /**
     * Utility methods
     */

    generateContainerId(workspaceId) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 6);
        return `claude-validation-${workspaceId}-${timestamp}-${random}`;
    }

    async verifyDockerInstallation() {
        try {
            const result = await this.executeDockerCommand(['--version']);
            if (!result.success) {
                throw new Error('Docker not accessible');
            }
            log('debug', `Docker version: ${result.stdout.trim()}`);
        } catch (error) {
            throw new Error(`Docker verification failed: ${error.message}`);
        }
    }

    async ensureValidationImage() {
        try {
            // Check if image exists
            const inspectResult = await this.executeDockerCommand(['inspect', this.config.docker_image]);
            
            if (inspectResult.success) {
                log('debug', `Validation image ${this.config.docker_image} found`);
                return;
            }
            
            // Try to pull image
            log('info', `Pulling validation image ${this.config.docker_image}...`);
            const pullResult = await this.executeDockerCommand(['pull', this.config.docker_image]);
            
            if (!pullResult.success) {
                // Build image if pull fails
                log('info', 'Building validation image...');
                await this.buildValidationImage();
            }
            
        } catch (error) {
            log('warning', `Failed to ensure validation image: ${error.message}`);
            // Continue with host environment
        }
    }

    async buildValidationImage() {
        const dockerfile = this.generateDockerfile();
        const buildContext = '/tmp/claude-validation-build';
        
        // Create build context
        await fs.mkdir(buildContext, { recursive: true });
        await fs.writeFile(join(buildContext, 'Dockerfile'), dockerfile);
        
        // Build image
        const buildResult = await this.executeDockerCommand([
            'build', '-t', this.config.docker_image, buildContext
        ]);
        
        if (!buildResult.success) {
            throw new Error(`Failed to build validation image: ${buildResult.stderr}`);
        }
        
        // Cleanup build context
        await fs.rm(buildContext, { recursive: true, force: true });
        
        log('info', `Validation image ${this.config.docker_image} built successfully`);
    }

    generateDockerfile() {
        return `
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache git python3 make g++ curl

# Install Claude Code (mock installation for demo)
RUN npm install -g @anthropic-ai/claude-code || echo "Claude Code not available, using mock"

# Create workspace directory
RUN mkdir -p /workspace /logs
RUN chmod 755 /workspace /logs

# Create non-root user
RUN addgroup -g 1001 -S validator && \\
    adduser -S validator -u 1001 -G validator

# Set working directory
WORKDIR /workspace

# Switch to non-root user
USER validator

# Default command
CMD ["sleep", "3600"]
`;
    }

    async stopContainer(dockerContainerId) {
        const result = await this.executeDockerCommand(['stop', dockerContainerId]);
        if (!result.success) {
            log('warning', `Failed to stop container ${dockerContainerId}: ${result.stderr}`);
        }
    }

    async removeContainer(dockerContainerId) {
        const result = await this.executeDockerCommand(['rm', '-f', dockerContainerId]);
        if (!result.success) {
            log('warning', `Failed to remove container ${dockerContainerId}: ${result.stderr}`);
        }
    }

    async executeDockerCommand(args, options = {}) {
        return new Promise((resolve, reject) => {
            const timeout = options.timeout || 30000;
            const process = spawn('docker', args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            const timeoutId = setTimeout(() => {
                process.kill('SIGTERM');
                reject(new Error(`Docker command timed out after ${timeout}ms`));
            }, timeout);

            process.on('close', (code) => {
                clearTimeout(timeoutId);
                resolve({
                    success: code === 0,
                    code,
                    stdout,
                    stderr,
                    command: `docker ${args.join(' ')}`
                });
            });

            process.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
        });
    }

    async executeHostCommand(command, cwd, options = {}) {
        return new Promise((resolve, reject) => {
            const timeout = options.timeout || 30000;
            const process = spawn(command[0], command.slice(1), {
                cwd,
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, ...options.env }
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            const timeoutId = setTimeout(() => {
                process.kill('SIGTERM');
                reject(new Error(`Host command timed out after ${timeout}ms`));
            }, timeout);

            process.on('close', (code) => {
                clearTimeout(timeoutId);
                resolve({
                    success: code === 0,
                    code,
                    stdout,
                    stderr,
                    command: command.join(' ')
                });
            });

            process.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
        });
    }

    /**
     * Get security sandbox health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const dockerAvailable = this.config.enable_docker ? await this.checkDockerHealth() : false;
        
        return {
            status: 'healthy',
            docker_enabled: this.config.enable_docker,
            docker_available: dockerAvailable,
            active_containers: this.activeContainers.size,
            container_metrics: this.containerMetrics,
            config: {
                docker_image: this.config.docker_image,
                memory_limit: this.config.memory_limit,
                cpu_limit: this.config.cpu_limit,
                network_isolation: this.config.network_isolation,
                max_containers: this.config.max_containers
            }
        };
    }

    async checkDockerHealth() {
        try {
            const result = await this.executeDockerCommand(['info'], { timeout: 5000 });
            return result.success;
        } catch {
            return false;
        }
    }

    /**
     * Shutdown the security sandbox
     * @returns {Promise<void>}
     */
    async shutdown() {
        log('info', 'Shutting down Security Sandbox...');
        
        // Clear cleanup interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Cleanup all active containers
        const containers = Array.from(this.activeContainers.values());
        const cleanupPromises = containers.map(container => 
            this.cleanup({
                type: 'docker',
                container_id: container.id,
                docker_container_id: container.container_id
            }).catch(error => 
                log('error', `Failed to cleanup container ${container.id}: ${error.message}`)
            )
        );
        
        await Promise.all(cleanupPromises);
        
        log('info', 'Security Sandbox shutdown complete');
    }
}

export default SecuritySandbox;

