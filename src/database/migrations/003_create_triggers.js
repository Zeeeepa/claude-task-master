/**
 * Migration: Create Triggers and Functions
 * Created: 2025-05-30T13:56:00.000Z
 * Description: Create database triggers and functions for data integrity and automation
 */

/**
 * Apply migration - Create triggers and functions
 * @param {import('pg').PoolClient} client - Database client
 */
export async function up(client) {
  console.log('Creating database functions and triggers...');

  // Function for automatic timestamp updates
  await client.query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Create triggers for automatic timestamp updates
  await client.query(`
    CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await client.query(`
    CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await client.query(`
    CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await client.query(`
    CREATE TRIGGER update_learning_data_updated_at BEFORE UPDATE ON learning_data
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await client.query(`
    CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // Function to prevent circular dependencies in subtasks
  await client.query(`
    CREATE OR REPLACE FUNCTION check_circular_subtask_dependency()
    RETURNS TRIGGER AS $$
    BEGIN
        -- Check if adding this subtask would create a circular dependency
        IF EXISTS (
            WITH RECURSIVE subtask_tree AS (
                SELECT child_task_id as task_id, parent_task_id, 1 as depth
                FROM subtasks 
                WHERE parent_task_id = NEW.child_task_id
                
                UNION ALL
                
                SELECT s.child_task_id, s.parent_task_id, st.depth + 1
                FROM subtasks s
                JOIN subtask_tree st ON s.parent_task_id = st.task_id
                WHERE st.depth < 10 -- Prevent infinite recursion
            )
            SELECT 1 FROM subtask_tree WHERE task_id = NEW.parent_task_id
        ) THEN
            RAISE EXCEPTION 'Circular subtask dependency detected: task % cannot be a subtask of task %', 
                NEW.child_task_id, NEW.parent_task_id;
        END IF;
        
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await client.query(`
    CREATE TRIGGER prevent_circular_subtasks
        BEFORE INSERT OR UPDATE ON subtasks
        FOR EACH ROW EXECUTE FUNCTION check_circular_subtask_dependency();
  `);

  // Function to prevent circular dependencies in task_dependencies
  await client.query(`
    CREATE OR REPLACE FUNCTION check_circular_task_dependency()
    RETURNS TRIGGER AS $$
    BEGIN
        -- Check if adding this dependency would create a circular dependency
        IF EXISTS (
            WITH RECURSIVE dependency_tree AS (
                SELECT depends_on_task_id as task_id, task_id as dependent_task_id, 1 as depth
                FROM task_dependencies 
                WHERE task_id = NEW.depends_on_task_id
                
                UNION ALL
                
                SELECT td.depends_on_task_id, td.task_id, dt.depth + 1
                FROM task_dependencies td
                JOIN dependency_tree dt ON td.task_id = dt.task_id
                WHERE dt.depth < 10 -- Prevent infinite recursion
            )
            SELECT 1 FROM dependency_tree WHERE task_id = NEW.task_id
        ) THEN
            RAISE EXCEPTION 'Circular task dependency detected: task % cannot depend on task %', 
                NEW.task_id, NEW.depends_on_task_id;
        END IF;
        
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await client.query(`
    CREATE TRIGGER prevent_circular_dependencies
        BEFORE INSERT OR UPDATE ON task_dependencies
        FOR EACH ROW EXECUTE FUNCTION check_circular_task_dependency();
  `);

  // Function to automatically update template usage count
  await client.query(`
    CREATE OR REPLACE FUNCTION increment_template_usage()
    RETURNS TRIGGER AS $$
    BEGIN
        -- This would be called when a template is used
        -- Implementation depends on how templates are used in the application
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Function to validate task status transitions
  await client.query(`
    CREATE OR REPLACE FUNCTION validate_task_status_transition()
    RETURNS TRIGGER AS $$
    BEGIN
        -- Store previous status when status changes
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            NEW.previous_status = OLD.status;
        END IF;
        
        -- Add any status transition validation logic here
        -- For example, prevent moving from 'done' to 'backlog' without going through 'in-progress'
        
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await client.query(`
    CREATE TRIGGER validate_task_status_changes
        BEFORE UPDATE ON tasks
        FOR EACH ROW EXECUTE FUNCTION validate_task_status_transition();
  `);

  // Function to automatically create execution history entries
  await client.query(`
    CREATE OR REPLACE FUNCTION create_execution_history()
    RETURNS TRIGGER AS $$
    BEGIN
        -- Create execution history entry when task status changes to 'in-progress'
        IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'in-progress' THEN
            INSERT INTO execution_history (
                task_id, 
                attempt_number, 
                status, 
                started_at
            ) VALUES (
                NEW.id,
                COALESCE((
                    SELECT MAX(attempt_number) + 1 
                    FROM execution_history 
                    WHERE task_id = NEW.id
                ), 1),
                'running',
                NOW()
            );
        END IF;
        
        -- Update execution history when task completes
        IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('done', 'cancelled') THEN
            UPDATE execution_history 
            SET 
                status = CASE 
                    WHEN NEW.status = 'done' THEN 'completed'::execution_status
                    ELSE 'cancelled'::execution_status
                END,
                completed_at = NOW(),
                execution_time = NOW() - started_at
            WHERE task_id = NEW.id 
            AND status = 'running'
            AND completed_at IS NULL;
        END IF;
        
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await client.query(`
    CREATE TRIGGER auto_create_execution_history
        AFTER UPDATE ON tasks
        FOR EACH ROW EXECUTE FUNCTION create_execution_history();
  `);

  console.log('✅ Created all database functions and triggers');
}

/**
 * Rollback migration - Drop all triggers and functions
 * @param {import('pg').PoolClient} client - Database client
 */
export async function down(client) {
  console.log('Dropping all triggers and functions...');

  // Drop triggers
  await client.query('DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;');
  await client.query('DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;');
  await client.query('DROP TRIGGER IF EXISTS update_templates_updated_at ON templates;');
  await client.query('DROP TRIGGER IF EXISTS update_learning_data_updated_at ON learning_data;');
  await client.query('DROP TRIGGER IF EXISTS update_system_config_updated_at ON system_config;');
  await client.query('DROP TRIGGER IF EXISTS prevent_circular_subtasks ON subtasks;');
  await client.query('DROP TRIGGER IF EXISTS prevent_circular_dependencies ON task_dependencies;');
  await client.query('DROP TRIGGER IF EXISTS validate_task_status_changes ON tasks;');
  await client.query('DROP TRIGGER IF EXISTS auto_create_execution_history ON tasks;');

  // Drop functions
  await client.query('DROP FUNCTION IF EXISTS update_updated_at_column();');
  await client.query('DROP FUNCTION IF EXISTS check_circular_subtask_dependency();');
  await client.query('DROP FUNCTION IF EXISTS check_circular_task_dependency();');
  await client.query('DROP FUNCTION IF EXISTS increment_template_usage();');
  await client.query('DROP FUNCTION IF EXISTS validate_task_status_transition();');
  await client.query('DROP FUNCTION IF EXISTS create_execution_history();');

  console.log('✅ Dropped all triggers and functions');
}

