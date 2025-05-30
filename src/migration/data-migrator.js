/**
 * @fileoverview Data Migrator
 * @description Migrates existing task data from JSON files to database
 * @version 1.0.0
 */

import fs from 'fs/promises';
import path from 'path';
import { DatabaseConnectionManager } from '../database/connection/connection_manager.js';
import { TaskModel } from '../database/models/task.js';
import { SubtaskModel } from '../database/models/subtask.js';
import { DependencyModel } from '../database/models/dependency.js';

export class DataMigrator {
    constructor(options = {}) {
        this.options = {
            sourceDir: './tasks',
            batchSize: 100,
            dryRun: false,
            preserveIds: false,
            createProject: true,
            ...options
        };
        
        this.db = null;
        this.migrationLog = [];
        this.idMapping = new Map(); // Map old IDs to new UUIDs
        this.projectId = null;
    }

    /**
     * Initialize database connection
     */
    async initialize() {
        if (!this.db) {
            this.db = new DatabaseConnectionManager();
            await this.db.connect();
        }
    }

    /**
     * Migrate all task data from files to database
     */
    async migrateAllData() {
        await this.initialize();
        
        console.log('📊 Starting Task Data Migration...');
        const startTime = Date.now();
        
        try {
            // Create or get project for migrated tasks
            if (this.options.createProject) {
                this.projectId = await this.createMigrationProject();
            }
            
            // Find and load task files
            const taskFiles = await this.findTaskFiles();
            console.log(`Found ${taskFiles.length} task files to migrate`);
            
            // Load and validate task data
            const taskData = await this.loadTaskData(taskFiles);
            console.log(`Loaded ${taskData.length} tasks for migration`);
            
            // Migrate tasks in batches
            const migrationResults = await this.migrateTasks(taskData);
            
            // Migrate relationships (subtasks, dependencies)
            await this.migrateRelationships(taskData);
            
            const totalTime = Date.now() - startTime;
            
            return this.generateMigrationReport(migrationResults, totalTime);
            
        } catch (error) {
            console.error('Data migration failed:', error);
            throw error;
        }
    }

    /**
     * Find task files in source directory
     */
    async findTaskFiles() {
        const files = [];
        
        try {
            const entries = await fs.readdir(this.options.sourceDir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('.json')) {
                    files.push(path.join(this.options.sourceDir, entry.name));
                } else if (entry.isDirectory()) {
                    // Recursively search subdirectories
                    const subFiles = await this.findTaskFilesInDirectory(
                        path.join(this.options.sourceDir, entry.name)
                    );
                    files.push(...subFiles);
                }
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.warn(`Source directory ${this.options.sourceDir} not found`);
                return [];
            }
            throw error;
        }
        
        return files;
    }

    /**
     * Find task files in a specific directory
     */
    async findTaskFilesInDirectory(dirPath) {
        const files = [];
        
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('.json')) {
                    files.push(path.join(dirPath, entry.name));
                }
            }
        } catch (error) {
            console.warn(`Could not read directory ${dirPath}:`, error.message);
        }
        
        return files;
    }

    /**
     * Load and validate task data from files
     */
    async loadTaskData(taskFiles) {
        const allTasks = [];
        
        for (const filePath of taskFiles) {
            try {
                const fileContent = await fs.readFile(filePath, 'utf8');
                const data = JSON.parse(fileContent);
                
                // Handle different file formats
                if (Array.isArray(data)) {
                    // File contains array of tasks
                    allTasks.push(...data.map(task => ({ ...task, sourceFile: filePath })));
                } else if (data.tasks && Array.isArray(data.tasks)) {
                    // File contains tasks property with array
                    allTasks.push(...data.tasks.map(task => ({ ...task, sourceFile: filePath })));
                } else if (data.id || data.title) {
                    // File contains single task
                    allTasks.push({ ...data, sourceFile: filePath });
                }
                
            } catch (error) {
                console.warn(`Failed to load task file ${filePath}:`, error.message);
                this.migrationLog.push({
                    type: 'file_load_error',
                    file: filePath,
                    error: error.message,
                    timestamp: new Date()
                });
            }
        }
        
        // Validate and normalize task data
        return this.validateAndNormalizeTasks(allTasks);
    }

    /**
     * Validate and normalize task data
     */
    validateAndNormalizeTasks(tasks) {
        const validTasks = [];
        
        for (const task of tasks) {
            try {
                const normalizedTask = this.normalizeTask(task);
                if (this.validateTask(normalizedTask)) {
                    validTasks.push(normalizedTask);
                }
            } catch (error) {
                console.warn(`Failed to normalize task:`, error.message);
                this.migrationLog.push({
                    type: 'task_validation_error',
                    task: task.title || 'Unknown',
                    error: error.message,
                    timestamp: new Date()
                });
            }
        }
        
        return validTasks;
    }

    /**
     * Normalize task data to match database schema
     */
    normalizeTask(task) {
        return {
            // Required fields
            title: task.title || task.name || 'Untitled Task',
            description: task.description || task.details || '',
            
            // Optional fields with defaults
            status: this.normalizeStatus(task.status),
            priority: this.normalizePriority(task.priority),
            requirements: task.requirements || task.specs || {},
            dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
            context: {
                ...task.context,
                complexity_score: task.complexity || task.complexityScore || 5,
                type: task.type || 'task',
                migrated_from: task.sourceFile,
                original_id: task.id
            },
            tags: Array.isArray(task.tags) ? task.tags : [],
            
            // Metadata
            project_id: this.projectId,
            created_by: task.createdBy || task.author || 'migration',
            estimated_duration: task.estimatedDuration || task.estimate,
            due_date: task.dueDate || task.deadline,
            
            // Relationships (to be processed later)
            subtasks: task.subtasks || task.children || [],
            originalId: task.id
        };
    }

    /**
     * Normalize status values
     */
    normalizeStatus(status) {
        if (!status) return 'pending';
        
        const statusMap = {
            'todo': 'pending',
            'in-progress': 'in_progress',
            'in_progress': 'in_progress',
            'done': 'completed',
            'complete': 'completed',
            'finished': 'completed',
            'blocked': 'pending',
            'cancelled': 'cancelled',
            'canceled': 'cancelled'
        };
        
        return statusMap[status.toLowerCase()] || status;
    }

    /**
     * Normalize priority values
     */
    normalizePriority(priority) {
        if (typeof priority === 'number') {
            return Math.max(0, Math.min(10, priority));
        }
        
        if (typeof priority === 'string') {
            const priorityMap = {
                'low': 2,
                'medium': 5,
                'high': 8,
                'critical': 10,
                'urgent': 9
            };
            return priorityMap[priority.toLowerCase()] || 5;
        }
        
        return 5; // Default priority
    }

    /**
     * Validate task data
     */
    validateTask(task) {
        if (!task.title || task.title.trim().length === 0) {
            return false;
        }
        
        return true;
    }

    /**
     * Migrate tasks to database in batches
     */
    async migrateTasks(tasks) {
        const results = {
            migrated: 0,
            skipped: 0,
            failed: 0,
            errors: []
        };
        
        // Process tasks in batches
        for (let i = 0; i < tasks.length; i += this.options.batchSize) {
            const batch = tasks.slice(i, i + this.options.batchSize);
            console.log(`Migrating batch ${Math.floor(i / this.options.batchSize) + 1}/${Math.ceil(tasks.length / this.options.batchSize)}`);
            
            const batchResults = await this.migrateBatch(batch);
            
            results.migrated += batchResults.migrated;
            results.skipped += batchResults.skipped;
            results.failed += batchResults.failed;
            results.errors.push(...batchResults.errors);
        }
        
        return results;
    }

    /**
     * Migrate a batch of tasks
     */
    async migrateBatch(tasks) {
        const results = {
            migrated: 0,
            skipped: 0,
            failed: 0,
            errors: []
        };
        
        if (this.options.dryRun) {
            console.log(`[DRY RUN] Would migrate ${tasks.length} tasks`);
            results.migrated = tasks.length;
            return results;
        }
        
        return await this.db.transaction(async (client) => {
            for (const task of tasks) {
                try {
                    // Check if task already exists (by title and project)
                    const existing = await this.findExistingTask(task);
                    if (existing) {
                        console.log(`Skipping existing task: ${task.title}`);
                        results.skipped++;
                        continue;
                    }
                    
                    // Create task
                    const createdTask = await TaskModel.create(client, {
                        title: task.title,
                        description: task.description,
                        status: task.status,
                        priority: task.priority,
                        requirements: task.requirements,
                        dependencies: [], // Will be set later
                        context: task.context,
                        tags: task.tags,
                        project_id: task.project_id,
                        created_by: task.created_by,
                        estimated_duration: task.estimated_duration,
                        due_date: task.due_date
                    });
                    
                    // Map old ID to new UUID
                    if (task.originalId) {
                        this.idMapping.set(task.originalId, createdTask.id);
                    }
                    
                    results.migrated++;
                    
                } catch (error) {
                    console.error(`Failed to migrate task ${task.title}:`, error.message);
                    results.failed++;
                    results.errors.push({
                        task: task.title,
                        error: error.message
                    });
                }
            }
            
            return results;
        });
    }

    /**
     * Find existing task by title and project
     */
    async findExistingTask(task) {
        const existing = await TaskModel.findWithCriteria({
            project_id: task.project_id,
            search: task.title,
            limit: 1
        });
        
        return existing.find(t => t.title === task.title);
    }

    /**
     * Migrate relationships (subtasks and dependencies)
     */
    async migrateRelationships(tasks) {
        console.log('Migrating task relationships...');
        
        if (this.options.dryRun) {
            console.log('[DRY RUN] Would migrate relationships');
            return;
        }
        
        for (const task of tasks) {
            try {
                const newTaskId = this.idMapping.get(task.originalId);
                if (!newTaskId) continue;
                
                // Migrate subtasks
                if (task.subtasks && task.subtasks.length > 0) {
                    await this.migrateSubtasks(newTaskId, task.subtasks);
                }
                
                // Migrate dependencies
                if (task.dependencies && task.dependencies.length > 0) {
                    await this.migrateDependencies(newTaskId, task.dependencies);
                }
                
            } catch (error) {
                console.error(`Failed to migrate relationships for task ${task.title}:`, error.message);
            }
        }
    }

    /**
     * Migrate subtasks
     */
    async migrateSubtasks(parentTaskId, subtasks) {
        for (let i = 0; i < subtasks.length; i++) {
            const subtask = subtasks[i];
            const subtaskId = this.idMapping.get(subtask.id);
            
            if (subtaskId) {
                await SubtaskModel.create(null, parentTaskId, subtaskId, i);
            }
        }
    }

    /**
     * Migrate dependencies
     */
    async migrateDependencies(taskId, dependencies) {
        for (const depId of dependencies) {
            const newDepId = this.idMapping.get(depId);
            
            if (newDepId) {
                await DependencyModel.create(null, taskId, newDepId, 'blocks');
            }
        }
    }

    /**
     * Create migration project
     */
    async createMigrationProject() {
        const projectData = {
            name: 'Migrated Tasks',
            description: 'Tasks migrated from file-based storage',
            context: {
                migration: {
                    timestamp: new Date().toISOString(),
                    source: this.options.sourceDir,
                    version: '1.0.0'
                }
            }
        };
        
        if (this.options.dryRun) {
            console.log('[DRY RUN] Would create migration project');
            return 'dry-run-project-id';
        }
        
        const query = `
            INSERT INTO projects (name, description, context)
            VALUES ($1, $2, $3)
            RETURNING id
        `;
        
        const result = await this.db.query(query, [
            projectData.name,
            projectData.description,
            JSON.stringify(projectData.context)
        ]);
        
        return result.rows[0].id;
    }

    /**
     * Generate migration report
     */
    generateMigrationReport(results, totalTime) {
        const total = results.migrated + results.skipped + results.failed;
        
        return {
            summary: {
                total,
                migrated: results.migrated,
                skipped: results.skipped,
                failed: results.failed,
                successRate: total > 0 ? (results.migrated / total) * 100 : 0
            },
            performance: {
                totalTime,
                avgPerRecord: total > 0 ? totalTime / total : 0,
                recordsPerSecond: totalTime > 0 ? (total / totalTime) * 1000 : 0
            },
            errors: results.errors,
            log: this.migrationLog,
            idMapping: Object.fromEntries(this.idMapping)
        };
    }

    /**
     * Validate migration results
     */
    async validateMigration() {
        console.log('Validating migration results...');
        
        const validation = {
            valid: true,
            errors: [],
            warnings: []
        };
        
        try {
            // Check if project was created
            if (this.projectId) {
                const projectQuery = `SELECT id FROM projects WHERE id = $1`;
                const projectResult = await this.db.query(projectQuery, [this.projectId]);
                
                if (projectResult.rows.length === 0) {
                    validation.valid = false;
                    validation.errors.push('Migration project not found');
                }
            }
            
            // Check task count
            const taskCountQuery = `SELECT COUNT(*) as count FROM tasks WHERE project_id = $1`;
            const taskCountResult = await this.db.query(taskCountQuery, [this.projectId]);
            const taskCount = parseInt(taskCountResult.rows[0].count);
            
            if (taskCount === 0) {
                validation.warnings.push('No tasks found in migration project');
            }
            
            // Check for orphaned relationships
            const orphanedSubtasksQuery = `
                SELECT COUNT(*) as count 
                FROM subtasks s 
                LEFT JOIN tasks t ON s.child_task_id = t.id 
                WHERE t.id IS NULL
            `;
            const orphanedSubtasksResult = await this.db.query(orphanedSubtasksQuery);
            const orphanedSubtasks = parseInt(orphanedSubtasksResult.rows[0].count);
            
            if (orphanedSubtasks > 0) {
                validation.warnings.push(`${orphanedSubtasks} orphaned subtask relationships found`);
            }
            
        } catch (error) {
            validation.valid = false;
            validation.errors.push(`Validation failed: ${error.message}`);
        }
        
        return validation;
    }
}

export default DataMigrator;

