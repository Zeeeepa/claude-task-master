/**
 * JSON to PostgreSQL Migration Script
 * Claude Task Master AI-Driven CI/CD System
 * 
 * Migrates existing tasks.json data to PostgreSQL database
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase, query, transaction, getDatabaseConfig } from '../config/database.js';
import { TaskDataAccess } from '../config/data-access-layer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load tasks from JSON file
 */
async function loadTasksFromJSON(filePath = 'tasks/tasks.json') {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(data);
        return parsed.tasks || [];
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('📄 No tasks.json file found, nothing to migrate');
            return [];
        }
        throw error;
    }
}

/**
 * Transform JSON task to PostgreSQL format
 */
function transformJSONTask(jsonTask) {
    return {
        legacy_id: jsonTask.id,
        title: jsonTask.title,
        description: jsonTask.description,
        details: jsonTask.details,
        test_strategy: jsonTask.testStrategy,
        status: jsonTask.status || 'pending',
        priority: jsonTask.priority || 'medium',
        linear_issue_id: jsonTask.linearIssueId,
        repository_url: jsonTask.repositoryUrl,
        estimated_complexity: jsonTask.estimatedComplexity,
        actual_complexity: jsonTask.actualComplexity,
        acceptance_criteria: jsonTask.acceptanceCriteria,
        tags: jsonTask.tags || [],
        requirements: jsonTask.requirements || {},
        implementation_files: jsonTask.implementationFiles || [],
        metadata: {
            ...jsonTask.metadata,
            migrated_from_json: true,
            original_id: jsonTask.id,
            migration_date: new Date().toISOString()
        },
        created_by: jsonTask.createdBy || 'migration',
        updated_by: jsonTask.updatedBy || 'migration'
    };
}

/**
 * Create task hierarchy mapping
 */
function createTaskHierarchy(tasks) {
    const taskMap = new Map();
    const hierarchy = [];

    // First pass: create all tasks without dependencies
    for (const task of tasks) {
        const transformed = transformJSONTask(task);
        taskMap.set(task.id, {
            original: task,
            transformed,
            dependencies: task.dependencies || [],
            subtasks: task.subtasks || []
        });
    }

    // Second pass: establish parent-child relationships for subtasks
    for (const [taskId, taskData] of taskMap) {
        if (taskData.subtasks.length > 0) {
            for (const subtask of taskData.subtasks) {
                if (subtask.id) {
                    // Create subtask entry if it doesn't exist
                    const subtaskKey = `${taskId}.${subtask.id}`;
                    if (!taskMap.has(subtaskKey)) {
                        const subtaskTransformed = {
                            ...transformJSONTask(subtask),
                            legacy_id: null, // Subtasks don't have legacy IDs
                            parent_task_id: null // Will be set after parent is created
                        };
                        taskMap.set(subtaskKey, {
                            original: subtask,
                            transformed: subtaskTransformed,
                            dependencies: subtask.dependencies || [],
                            subtasks: [],
                            parentId: taskId
                        });
                    }
                }
            }
        }
    }

    return taskMap;
}

/**
 * Migrate tasks to PostgreSQL
 */
async function migrateTasks(tasks) {
    const taskHierarchy = createTaskHierarchy(tasks);
    const createdTasks = new Map(); // Maps original ID to new UUID
    const migrationStats = {
        totalTasks: taskHierarchy.size,
        migratedTasks: 0,
        migratedDependencies: 0,
        errors: []
    };

    console.log(`📊 Starting migration of ${migrationStats.totalTasks} tasks...`);

    // First pass: Create all parent tasks
    for (const [originalId, taskData] of taskHierarchy) {
        if (!taskData.parentId) { // Only parent tasks in first pass
            try {
                const result = await query(`
                    INSERT INTO tasks (
                        legacy_id, title, description, details, test_strategy,
                        status, priority, linear_issue_id, repository_url,
                        estimated_complexity, actual_complexity, acceptance_criteria,
                        tags, requirements, implementation_files, metadata,
                        created_by, updated_by
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                        $11, $12, $13, $14, $15, $16, $17, $18
                    ) RETURNING id, legacy_id
                `, [
                    taskData.transformed.legacy_id,
                    taskData.transformed.title,
                    taskData.transformed.description,
                    taskData.transformed.details,
                    taskData.transformed.test_strategy,
                    taskData.transformed.status,
                    taskData.transformed.priority,
                    taskData.transformed.linear_issue_id,
                    taskData.transformed.repository_url,
                    taskData.transformed.estimated_complexity,
                    taskData.transformed.actual_complexity,
                    taskData.transformed.acceptance_criteria,
                    taskData.transformed.tags,
                    taskData.transformed.requirements,
                    taskData.transformed.implementation_files,
                    taskData.transformed.metadata,
                    taskData.transformed.created_by,
                    taskData.transformed.updated_by
                ]);

                createdTasks.set(originalId, result.rows[0].id);
                migrationStats.migratedTasks++;
                console.log(`✅ Migrated task ${originalId}: ${taskData.transformed.title}`);

            } catch (error) {
                console.error(`❌ Failed to migrate task ${originalId}:`, error.message);
                migrationStats.errors.push({
                    taskId: originalId,
                    error: error.message
                });
            }
        }
    }

    // Second pass: Create subtasks with parent references
    for (const [originalId, taskData] of taskHierarchy) {
        if (taskData.parentId) { // Only subtasks in second pass
            try {
                const parentUUID = createdTasks.get(taskData.parentId);
                if (!parentUUID) {
                    throw new Error(`Parent task ${taskData.parentId} not found`);
                }

                const result = await query(`
                    INSERT INTO tasks (
                        title, description, details, test_strategy,
                        status, priority, parent_task_id, linear_issue_id,
                        repository_url, estimated_complexity, actual_complexity,
                        acceptance_criteria, tags, requirements, implementation_files,
                        metadata, created_by, updated_by
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                        $11, $12, $13, $14, $15, $16, $17, $18
                    ) RETURNING id
                `, [
                    taskData.transformed.title,
                    taskData.transformed.description,
                    taskData.transformed.details,
                    taskData.transformed.test_strategy,
                    taskData.transformed.status,
                    taskData.transformed.priority,
                    parentUUID,
                    taskData.transformed.linear_issue_id,
                    taskData.transformed.repository_url,
                    taskData.transformed.estimated_complexity,
                    taskData.transformed.actual_complexity,
                    taskData.transformed.acceptance_criteria,
                    taskData.transformed.tags,
                    taskData.transformed.requirements,
                    taskData.transformed.implementation_files,
                    taskData.transformed.metadata,
                    taskData.transformed.created_by,
                    taskData.transformed.updated_by
                ]);

                createdTasks.set(originalId, result.rows[0].id);
                migrationStats.migratedTasks++;
                console.log(`✅ Migrated subtask ${originalId}: ${taskData.transformed.title}`);

            } catch (error) {
                console.error(`❌ Failed to migrate subtask ${originalId}:`, error.message);
                migrationStats.errors.push({
                    taskId: originalId,
                    error: error.message
                });
            }
        }
    }

    // Third pass: Create dependencies
    for (const [originalId, taskData] of taskHierarchy) {
        if (taskData.dependencies.length > 0) {
            const dependentTaskUUID = createdTasks.get(originalId);
            if (!dependentTaskUUID) continue;

            for (const depId of taskData.dependencies) {
                const dependencyTaskUUID = createdTasks.get(depId);
                if (dependencyTaskUUID) {
                    try {
                        await query(`
                            INSERT INTO task_dependencies (
                                dependent_task_id, dependency_task_id, dependency_type, created_by
                            ) VALUES ($1, $2, $3, $4)
                        `, [dependentTaskUUID, dependencyTaskUUID, 'blocks', 'migration']);

                        migrationStats.migratedDependencies++;

                    } catch (error) {
                        console.error(`❌ Failed to create dependency ${originalId} -> ${depId}:`, error.message);
                        migrationStats.errors.push({
                            dependency: `${originalId} -> ${depId}`,
                            error: error.message
                        });
                    }
                } else {
                    console.warn(`⚠️ Dependency task ${depId} not found for task ${originalId}`);
                }
            }
        }
    }

    return migrationStats;
}

/**
 * Create backup of existing data
 */
async function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = 'database/backups';
    
    try {
        await fs.mkdir(backupDir, { recursive: true });
        
        // Backup tasks.json
        try {
            await fs.copyFile('tasks/tasks.json', `${backupDir}/tasks-pre-migration-${timestamp}.json`);
            console.log(`📦 Created backup: ${backupDir}/tasks-pre-migration-${timestamp}.json`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        return true;
    } catch (error) {
        console.error('❌ Failed to create backup:', error);
        return false;
    }
}

/**
 * Validate migration results
 */
async function validateMigration(originalTasks) {
    console.log('🔍 Validating migration results...');
    
    const taskDA = new TaskDataAccess();
    const migratedTasks = await taskDA.getTasks();
    
    const validation = {
        originalCount: originalTasks.length,
        migratedCount: migratedTasks.length,
        issues: []
    };

    // Check task count
    if (validation.originalCount !== validation.migratedCount) {
        validation.issues.push(`Task count mismatch: ${validation.originalCount} original vs ${validation.migratedCount} migrated`);
    }

    // Check specific tasks
    for (const originalTask of originalTasks) {
        const migratedTask = migratedTasks.find(t => t.id === originalTask.id);
        if (!migratedTask) {
            validation.issues.push(`Task ${originalTask.id} not found in migrated data`);
            continue;
        }

        // Check key fields
        if (migratedTask.title !== originalTask.title) {
            validation.issues.push(`Task ${originalTask.id}: title mismatch`);
        }
        if (migratedTask.status !== originalTask.status) {
            validation.issues.push(`Task ${originalTask.id}: status mismatch`);
        }
    }

    return validation;
}

/**
 * Main migration function
 */
export async function migrateJSONToPostgreSQL(options = {}) {
    const {
        tasksFile = 'tasks/tasks.json',
        createBackupFirst = true,
        validateAfter = true,
        dryRun = false
    } = options;

    console.log('🚀 Starting JSON to PostgreSQL migration...');

    try {
        // Check database mode
        const { mode } = getDatabaseConfig();
        if (mode !== 'postgres') {
            throw new Error('Migration requires PostgreSQL mode. Set DATABASE_MODE=postgres');
        }

        // Initialize database connection
        await initializeDatabase();

        // Create backup
        if (createBackupFirst) {
            const backupSuccess = await createBackup();
            if (!backupSuccess) {
                console.warn('⚠️ Backup creation failed, continuing anyway...');
            }
        }

        // Load tasks from JSON
        const originalTasks = await loadTasksFromJSON(tasksFile);
        if (originalTasks.length === 0) {
            console.log('✅ No tasks to migrate');
            return { success: true, message: 'No tasks to migrate' };
        }

        console.log(`📋 Found ${originalTasks.length} tasks to migrate`);

        if (dryRun) {
            console.log('🔍 Dry run mode - no actual migration will be performed');
            const taskHierarchy = createTaskHierarchy(originalTasks);
            console.log(`📊 Would migrate ${taskHierarchy.size} total items (including subtasks)`);
            return { success: true, message: 'Dry run completed' };
        }

        // Perform migration
        const migrationStats = await migrateTasks(originalTasks);

        // Validate migration
        let validation = null;
        if (validateAfter) {
            validation = await validateMigration(originalTasks);
        }

        // Report results
        console.log('\n📊 Migration Summary:');
        console.log(`✅ Tasks migrated: ${migrationStats.migratedTasks}/${migrationStats.totalTasks}`);
        console.log(`🔗 Dependencies migrated: ${migrationStats.migratedDependencies}`);
        console.log(`❌ Errors: ${migrationStats.errors.length}`);

        if (migrationStats.errors.length > 0) {
            console.log('\n❌ Migration Errors:');
            migrationStats.errors.forEach(error => {
                console.log(`  - ${error.taskId || error.dependency}: ${error.error}`);
            });
        }

        if (validation) {
            console.log('\n🔍 Validation Results:');
            console.log(`📊 Original tasks: ${validation.originalCount}`);
            console.log(`📊 Migrated tasks: ${validation.migratedCount}`);
            if (validation.issues.length > 0) {
                console.log('⚠️ Validation Issues:');
                validation.issues.forEach(issue => console.log(`  - ${issue}`));
            } else {
                console.log('✅ Validation passed');
            }
        }

        const success = migrationStats.errors.length === 0 && (validation?.issues.length || 0) === 0;
        
        if (success) {
            console.log('\n🎉 Migration completed successfully!');
        } else {
            console.log('\n⚠️ Migration completed with issues. Please review the errors above.');
        }

        return {
            success,
            stats: migrationStats,
            validation
        };

    } catch (error) {
        console.error('❌ Migration failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const options = {
        tasksFile: process.argv[2] || 'tasks/tasks.json',
        dryRun: process.argv.includes('--dry-run'),
        createBackupFirst: !process.argv.includes('--no-backup'),
        validateAfter: !process.argv.includes('--no-validate')
    };

    migrateJSONToPostgreSQL(options)
        .then(result => {
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ Migration script failed:', error);
            process.exit(1);
        });
}

