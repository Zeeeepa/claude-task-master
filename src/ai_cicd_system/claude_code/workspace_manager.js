/**
 * @fileoverview Enhanced Workspace Manager
 * @description Secure workspace creation, management, and cleanup for PR validations
 */

import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Enhanced Workspace Manager with security and resource management
 */
export class WorkspaceManager {
    constructor(config = {}) {
        this.config = {
            base_path: config.working_directory || join(tmpdir(), 'claude-workspaces'),
            max_workspace_age: config.max_workspace_age || 3600000, // 1 hour
            max_workspace_size: config.max_workspace_size || 1024 * 1024 * 1024, // 1GB
            enable_disk_quota: config.enable_disk_quota !== false,
            enable_cleanup: config.enable_cleanup !== false,
            workspace_permissions: config.workspace_permissions || 0o755,
            ...config
        };

        this.activeWorkspaces = new Map();
        this.workspaceMetrics = {
            created: 0,
            cleaned: 0,
            failed_cleanups: 0,
            total_size_bytes: 0
        };
    }

    /**
     * Initialize the workspace manager
     * @returns {Promise<void>}
     */
    async initialize() {
        log('debug', 'Initializing Workspace Manager...');
        
        // Ensure base directory exists
        await this.ensureDirectory(this.config.base_path);
        
        // Clean up any existing workspaces from previous runs
        if (this.config.enable_cleanup) {
            await this.cleanupOldWorkspaces();
        }
        
        log('debug', 'Workspace Manager initialized');
    }

    /**
     * Create a secure workspace for PR validation
     * @param {Object} prData - PR information
     * @param {string} validationId - Unique validation identifier
     * @returns {Promise<Object>} Workspace information
     */
    async createWorkspace(prData, validationId) {
        const workspaceId = this.generateWorkspaceId(validationId);
        const workspacePath = join(this.config.base_path, workspaceId);
        
        log('debug', `Creating workspace ${workspaceId} at ${workspacePath}`);
        
        try {
            // Create workspace directory
            await this.ensureDirectory(workspacePath);
            
            // Set appropriate permissions
            await fs.chmod(workspacePath, this.config.workspace_permissions);
            
            // Create workspace metadata
            const workspace = {
                id: workspaceId,
                path: workspacePath,
                parent_path: this.config.base_path,
                validation_id: validationId,
                pr_data: prData,
                created_at: new Date(),
                size_bytes: 0,
                status: 'created'
            };
            
            // Track workspace
            this.activeWorkspaces.set(workspaceId, workspace);
            this.workspaceMetrics.created++;
            
            // Create workspace structure
            await this.createWorkspaceStructure(workspace);
            
            log('debug', `Workspace ${workspaceId} created successfully`);
            return workspace;
            
        } catch (error) {
            log('error', `Failed to create workspace ${workspaceId}: ${error.message}`);
            
            // Cleanup on failure
            try {
                await this.removeDirectory(workspacePath);
            } catch (cleanupError) {
                log('warning', `Failed to cleanup failed workspace: ${cleanupError.message}`);
            }
            
            throw error;
        }
    }

    /**
     * Create workspace directory structure
     * @param {Object} workspace - Workspace information
     * @returns {Promise<void>}
     */
    async createWorkspaceStructure(workspace) {
        const directories = [
            'src',
            'tests',
            'logs',
            'reports',
            'temp'
        ];
        
        for (const dir of directories) {
            const dirPath = join(workspace.path, dir);
            await this.ensureDirectory(dirPath);
        }
        
        // Create workspace metadata file
        const metadataPath = join(workspace.path, '.workspace-metadata.json');
        const metadata = {
            workspace_id: workspace.id,
            validation_id: workspace.validation_id,
            pr_number: workspace.pr_data.number || workspace.pr_data.id,
            created_at: workspace.created_at,
            config: this.config
        };
        
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }

    /**
     * Get workspace information
     * @param {string} workspaceId - Workspace ID
     * @returns {Object|null} Workspace information
     */
    getWorkspace(workspaceId) {
        return this.activeWorkspaces.get(workspaceId) || null;
    }

    /**
     * Update workspace status
     * @param {string} workspaceId - Workspace ID
     * @param {string} status - New status
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<void>}
     */
    async updateWorkspaceStatus(workspaceId, status, metadata = {}) {
        const workspace = this.activeWorkspaces.get(workspaceId);
        if (!workspace) {
            throw new Error(`Workspace ${workspaceId} not found`);
        }
        
        workspace.status = status;
        workspace.updated_at = new Date();
        workspace.metadata = { ...workspace.metadata, ...metadata };
        
        // Update size if workspace still exists
        if (await this.directoryExists(workspace.path)) {
            workspace.size_bytes = await this.getDirectorySize(workspace.path);
            this.workspaceMetrics.total_size_bytes += workspace.size_bytes;
        }
        
        log('debug', `Workspace ${workspaceId} status updated to ${status}`);
    }

    /**
     * Cleanup workspace
     * @param {Object} workspace - Workspace to cleanup
     * @returns {Promise<void>}
     */
    async cleanupWorkspace(workspace) {
        const workspaceId = workspace.id;
        
        log('debug', `Cleaning up workspace ${workspaceId}`);
        
        try {
            // Update status
            await this.updateWorkspaceStatus(workspaceId, 'cleaning');
            
            // Remove workspace directory
            if (await this.directoryExists(workspace.path)) {
                await this.removeDirectory(workspace.path);
            }
            
            // Remove from active workspaces
            this.activeWorkspaces.delete(workspaceId);
            this.workspaceMetrics.cleaned++;
            
            log('debug', `Workspace ${workspaceId} cleaned up successfully`);
            
        } catch (error) {
            log('error', `Failed to cleanup workspace ${workspaceId}: ${error.message}`);
            this.workspaceMetrics.failed_cleanups++;
            
            // Mark as failed but don't throw - cleanup should be non-blocking
            if (this.activeWorkspaces.has(workspaceId)) {
                await this.updateWorkspaceStatus(workspaceId, 'cleanup_failed', {
                    cleanup_error: error.message
                });
            }
        }
    }

    /**
     * Cleanup old workspaces based on age and size limits
     * @returns {Promise<void>}
     */
    async cleanupOldWorkspaces() {
        log('debug', 'Cleaning up old workspaces...');
        
        try {
            const baseExists = await this.directoryExists(this.config.base_path);
            if (!baseExists) {
                return;
            }
            
            const entries = await fs.readdir(this.config.base_path, { withFileTypes: true });
            const now = Date.now();
            let cleanedCount = 0;
            
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                
                const workspacePath = join(this.config.base_path, entry.name);
                
                try {
                    // Check workspace age
                    const stats = await fs.stat(workspacePath);
                    const age = now - stats.mtime.getTime();
                    
                    if (age > this.config.max_workspace_age) {
                        log('debug', `Removing old workspace: ${entry.name} (age: ${Math.round(age / 1000)}s)`);
                        await this.removeDirectory(workspacePath);
                        cleanedCount++;
                    }
                    
                } catch (error) {
                    log('warning', `Failed to check/cleanup workspace ${entry.name}: ${error.message}`);
                }
            }
            
            if (cleanedCount > 0) {
                log('info', `Cleaned up ${cleanedCount} old workspaces`);
            }
            
        } catch (error) {
            log('error', `Failed to cleanup old workspaces: ${error.message}`);
        }
    }

    /**
     * Check disk usage and enforce quotas
     * @returns {Promise<Object>} Disk usage information
     */
    async checkDiskUsage() {
        try {
            const totalSize = await this.getDirectorySize(this.config.base_path);
            const workspaceCount = this.activeWorkspaces.size;
            
            const usage = {
                total_size_bytes: totalSize,
                total_size_mb: Math.round(totalSize / (1024 * 1024)),
                workspace_count: workspaceCount,
                average_size_bytes: workspaceCount > 0 ? Math.round(totalSize / workspaceCount) : 0,
                quota_exceeded: totalSize > this.config.max_workspace_size,
                quota_usage_percent: Math.round((totalSize / this.config.max_workspace_size) * 100)
            };
            
            if (usage.quota_exceeded) {
                log('warning', `Disk quota exceeded: ${usage.total_size_mb}MB / ${Math.round(this.config.max_workspace_size / (1024 * 1024))}MB`);
            }
            
            return usage;
            
        } catch (error) {
            log('error', `Failed to check disk usage: ${error.message}`);
            return {
                total_size_bytes: 0,
                total_size_mb: 0,
                workspace_count: 0,
                average_size_bytes: 0,
                quota_exceeded: false,
                quota_usage_percent: 0,
                error: error.message
            };
        }
    }

    /**
     * Get workspace manager health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const diskUsage = await this.checkDiskUsage();
        
        return {
            status: 'healthy',
            active_workspaces: this.activeWorkspaces.size,
            metrics: this.workspaceMetrics,
            disk_usage: diskUsage,
            config: {
                base_path: this.config.base_path,
                max_workspace_age: this.config.max_workspace_age,
                max_workspace_size: this.config.max_workspace_size,
                enable_cleanup: this.config.enable_cleanup
            }
        };
    }

    /**
     * Utility methods
     */

    generateWorkspaceId(validationId) {
        const timestamp = Date.now();
        const random = randomBytes(4).toString('hex');
        return `ws_${validationId}_${timestamp}_${random}`;
    }

    async ensureDirectory(path) {
        try {
            await fs.mkdir(path, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    async directoryExists(path) {
        try {
            const stats = await fs.stat(path);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    async removeDirectory(path) {
        try {
            await fs.rm(path, { recursive: true, force: true });
        } catch (error) {
            // Try alternative removal method
            try {
                const { spawn } = await import('child_process');
                await new Promise((resolve, reject) => {
                    const process = spawn('rm', ['-rf', path]);
                    process.on('close', (code) => {
                        if (code === 0) resolve();
                        else reject(new Error(`rm command failed with code ${code}`));
                    });
                    process.on('error', reject);
                });
            } catch (fallbackError) {
                throw new Error(`Failed to remove directory ${path}: ${error.message}, fallback: ${fallbackError.message}`);
            }
        }
    }

    async getDirectorySize(path) {
        try {
            let totalSize = 0;
            
            const calculateSize = async (dirPath) => {
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = join(dirPath, entry.name);
                    
                    if (entry.isDirectory()) {
                        await calculateSize(fullPath);
                    } else if (entry.isFile()) {
                        const stats = await fs.stat(fullPath);
                        totalSize += stats.size;
                    }
                }
            };
            
            await calculateSize(path);
            return totalSize;
            
        } catch (error) {
            log('warning', `Failed to calculate directory size for ${path}: ${error.message}`);
            return 0;
        }
    }

    /**
     * List all active workspaces
     * @returns {Array} Array of workspace information
     */
    listActiveWorkspaces() {
        return Array.from(this.activeWorkspaces.values());
    }

    /**
     * Get workspace by validation ID
     * @param {string} validationId - Validation ID
     * @returns {Object|null} Workspace information
     */
    getWorkspaceByValidationId(validationId) {
        for (const workspace of this.activeWorkspaces.values()) {
            if (workspace.validation_id === validationId) {
                return workspace;
            }
        }
        return null;
    }

    /**
     * Force cleanup all workspaces
     * @returns {Promise<void>}
     */
    async forceCleanupAll() {
        log('warning', 'Force cleaning up all workspaces...');
        
        const workspaces = Array.from(this.activeWorkspaces.values());
        const cleanupPromises = workspaces.map(workspace => 
            this.cleanupWorkspace(workspace).catch(error => 
                log('error', `Force cleanup failed for workspace ${workspace.id}: ${error.message}`)
            )
        );
        
        await Promise.all(cleanupPromises);
        
        // Clear the map
        this.activeWorkspaces.clear();
        
        log('info', `Force cleaned up ${workspaces.length} workspaces`);
    }

    /**
     * Shutdown the workspace manager
     * @returns {Promise<void>}
     */
    async shutdown() {
        log('info', 'Shutting down Workspace Manager...');
        
        // Cleanup all active workspaces
        await this.forceCleanupAll();
        
        log('info', 'Workspace Manager shutdown complete');
    }
}

export default WorkspaceManager;

