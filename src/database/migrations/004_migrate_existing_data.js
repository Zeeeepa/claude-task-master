/**
 * Migration: Migrate Existing Data
 * Created: 2025-05-30T13:57:00.000Z
 * Description: Migrate existing task data from JSON files to PostgreSQL database
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Apply migration - Migrate existing data
 * @param {import('pg').PoolClient} client - Database client
 */
export async function up(client) {
  console.log('Migrating existing task data from JSON files...');

  try {
    // Insert initial system configuration
    await client.query(`
      INSERT INTO system_config (key, value, description) VALUES
      ('database_version', '"2.0.0"', 'Current database schema version'),
      ('migration_enabled', 'true', 'Whether migrations are enabled'),
      ('backup_enabled', 'true', 'Whether automatic backups are enabled'),
      ('max_task_depth', '10', 'Maximum depth for task hierarchies'),
      ('default_project_id', 'null', 'Default project ID for new tasks')
      ON CONFLICT (key) DO NOTHING;
    `);

    // Create initial default project
    const defaultProjectResult = await client.query(`
      INSERT INTO projects (id, name, description, status) VALUES
      (gen_random_uuid(), 'Default Project', 'Default project for tasks without specific project assignment', 'active')
      RETURNING id;
    `);
    
    const defaultProjectId = defaultProjectResult.rows[0].id;

    // Update system config with default project ID
    await client.query(`
      UPDATE system_config 
      SET value = $1 
      WHERE key = 'default_project_id';
    `, [JSON.stringify(defaultProjectId)]);

    // Look for existing tasks.json files
    const possibleTasksPaths = [
      path.join(process.cwd(), 'tasks.json'),
      path.join(process.cwd(), 'tasks', 'tasks.json'),
      path.join(__dirname, '../../../tasks.json'),
      path.join(__dirname, '../../../tasks/tasks.json')
    ];

    let tasksData = null;
    let tasksFilePath = null;

    // Try to find and read tasks.json
    for (const tasksPath of possibleTasksPaths) {
      try {
        await fs.access(tasksPath);
        const fileContent = await fs.readFile(tasksPath, 'utf8');
        tasksData = JSON.parse(fileContent);
        tasksFilePath = tasksPath;
        console.log(`Found tasks.json at: ${tasksPath}`);
        break;
      } catch (error) {
        // File doesn't exist or can't be read, continue to next path
        continue;
      }
    }

    if (!tasksData || !tasksData.tasks) {
      console.log('No existing tasks.json found or no tasks to migrate');
      return;
    }

    console.log(`Found ${tasksData.tasks.length} tasks to migrate`);

    // Create backup of original tasks.json
    if (tasksFilePath) {
      const backupPath = `${tasksFilePath}.backup.${Date.now()}`;
      await fs.copyFile(tasksFilePath, backupPath);
      console.log(`Created backup at: ${backupPath}`);
    }

    // Migrate tasks
    const taskIdMapping = new Map(); // Map old IDs to new UUIDs
    
    // First pass: Create all tasks without relationships
    for (const task of tasksData.tasks) {
      const taskId = await client.query(`
        INSERT INTO tasks (
          title,
          description,
          status,
          priority,
          project_id,
          details,
          test_strategy,
          complexity_score,
          legacy_id,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING id;
      `, [
        task.title || 'Untitled Task',
        task.description || '',
        mapTaskStatus(task.status),
        task.priority || 'medium',
        defaultProjectId,
        task.details || '',
        task.testStrategy || '',
        calculateComplexityScore(task),
        task.id
      ]);

      taskIdMapping.set(task.id, taskId.rows[0].id);
      console.log(`Migrated task ${task.id}: "${task.title}"`);
    }

    // Second pass: Create relationships (subtasks and dependencies)
    for (const task of tasksData.tasks) {
      const newTaskId = taskIdMapping.get(task.id);
      
      // Handle subtasks
      if (task.subtasks && Array.isArray(task.subtasks)) {
        for (let i = 0; i < task.subtasks.length; i++) {
          const subtaskId = task.subtasks[i];
          const newSubtaskId = taskIdMapping.get(subtaskId);
          
          if (newSubtaskId) {
            await client.query(`
              INSERT INTO subtasks (parent_task_id, child_task_id, order_index)
              VALUES ($1, $2, $3)
              ON CONFLICT (parent_task_id, child_task_id) DO NOTHING;
            `, [newTaskId, newSubtaskId, i]);
          }
        }
      }

      // Handle dependencies
      if (task.dependencies && Array.isArray(task.dependencies)) {
        for (const depId of task.dependencies) {
          const newDepId = taskIdMapping.get(depId);
          
          if (newDepId) {
            await client.query(`
              INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type)
              VALUES ($1, $2, 'blocks')
              ON CONFLICT (task_id, depends_on_task_id) DO NOTHING;
            `, [newTaskId, newDepId]);
          }
        }
      }
    }

    // Create some sample templates based on migrated tasks
    await createSampleTemplates(client, tasksData.tasks);

    console.log(`✅ Successfully migrated ${tasksData.tasks.length} tasks with relationships`);
    console.log(`Task ID mapping created for ${taskIdMapping.size} tasks`);

  } catch (error) {
    console.error('Error during data migration:', error);
    throw error;
  }
}

/**
 * Map old task status to new enum values
 */
function mapTaskStatus(oldStatus) {
  const statusMap = {
    'pending': 'backlog',
    'todo': 'todo',
    'in-progress': 'in-progress',
    'done': 'done',
    'deferred': 'deferred',
    'cancelled': 'cancelled'
  };
  
  return statusMap[oldStatus] || 'backlog';
}

/**
 * Calculate complexity score based on task properties
 */
function calculateComplexityScore(task) {
  let score = 0;
  
  // Base score from description length
  if (task.description) {
    score += Math.min(task.description.length / 100, 20);
  }
  
  // Add score for details
  if (task.details) {
    score += Math.min(task.details.length / 200, 30);
  }
  
  // Add score for dependencies
  if (task.dependencies && task.dependencies.length > 0) {
    score += task.dependencies.length * 5;
  }
  
  // Add score for subtasks
  if (task.subtasks && task.subtasks.length > 0) {
    score += task.subtasks.length * 3;
  }
  
  // Priority modifier
  const priorityModifier = {
    'low': 0.8,
    'medium': 1.0,
    'high': 1.3,
    'critical': 1.5
  };
  
  score *= priorityModifier[task.priority] || 1.0;
  
  return Math.min(Math.round(score), 100);
}

/**
 * Create sample templates based on migrated tasks
 */
async function createSampleTemplates(client, tasks) {
  // Create a basic task template
  await client.query(`
    INSERT INTO templates (name, type, content, created_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (name, type) DO NOTHING;
  `, [
    'Basic Task Template',
    'task',
    JSON.stringify({
      title: 'Task Title',
      description: 'Task description',
      priority: 'medium',
      status: 'backlog',
      acceptance_criteria: [
        'Criteria 1',
        'Criteria 2'
      ]
    }),
    'migration_system'
  ]);

  // Create a project template
  await client.query(`
    INSERT INTO templates (name, type, content, created_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (name, type) DO NOTHING;
  `, [
    'Basic Project Template',
    'project',
    JSON.stringify({
      name: 'Project Name',
      description: 'Project description',
      status: 'active',
      context: {
        technology_stack: [],
        requirements: [],
        constraints: []
      }
    }),
    'migration_system'
  ]);

  console.log('✅ Created sample templates');
}

/**
 * Rollback migration - Remove migrated data
 * @param {import('pg').PoolClient} client - Database client
 */
export async function down(client) {
  console.log('Rolling back data migration...');

  // Remove all migrated data (this will cascade to related tables)
  await client.query('DELETE FROM tasks WHERE legacy_id IS NOT NULL;');
  await client.query('DELETE FROM projects WHERE name = \'Default Project\';');
  await client.query('DELETE FROM templates WHERE created_by = \'migration_system\';');
  await client.query('DELETE FROM system_config;');

  console.log('✅ Rolled back data migration');
}

