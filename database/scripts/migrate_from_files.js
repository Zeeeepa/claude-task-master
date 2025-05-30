/**
 * migrate_from_files.js
 * Data migration script to migrate from file-based storage to PostgreSQL
 */

import fs from 'fs';
import path from 'path';
import DatabaseManager from '../lib/DatabaseManager.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FileMigrator {
    constructor(connectionString) {
        this.db = new DatabaseManager(connectionString);
        this.migrationStats = {
            projects: 0,
            workflows: 0,
            tasks: 0,
            templates: 0,
            errors: []
        };
    }

    /**
     * Main migration function
     */
    async migrate() {
        console.log('🚀 Starting data migration from file-based storage to PostgreSQL...');
        
        try {
            // Check database connection
            const isConnected = await this.db.isConnected();
            if (!isConnected) {
                throw new Error('Cannot connect to database');
            }
            console.log('✅ Database connection established');

            // Create default project
            const project = await this.createDefaultProject();
            console.log(`✅ Created default project: ${project.name}`);

            // Migrate tasks from tasks.json
            await this.migrateTasks(project.id);
            console.log(`✅ Migrated ${this.migrationStats.tasks} tasks`);

            // Migrate configuration data
            await this.migrateConfiguration(project.id);
            console.log('✅ Migrated configuration data');

            // Migrate templates (if any exist)
            await this.migrateTemplates();
            console.log(`✅ Migrated ${this.migrationStats.templates} templates`);

            // Generate migration report
            await this.generateMigrationReport();
            console.log('✅ Migration completed successfully!');

        } catch (error) {
            console.error('❌ Migration failed:', error);
            this.migrationStats.errors.push(error.message);
            throw error;
        }
    }

    /**
     * Create default project for migrated data
     */
    async createDefaultProject() {
        const projectData = {
            name: 'Claude Task Master (Migrated)',
            description: 'Migrated project from file-based Claude Task Master system',
            repository_url: 'https://github.com/Zeeeepa/claude-task-master',
            status: 'active',
            settings: {
                migrated_from: 'file_based_system',
                migration_date: new Date().toISOString(),
                original_config_file: '.taskmasterconfig'
            }
        };

        const project = await this.db.createProject(projectData);
        this.migrationStats.projects = 1;
        return project;
    }

    /**
     * Migrate tasks from tasks.json
     */
    async migrateTasks(projectId) {
        const tasksFilePath = path.join(__dirname, '../../tasks/tasks.json');
        
        if (!fs.existsSync(tasksFilePath)) {
            console.log('⚠️  No tasks.json file found, skipping task migration');
            return;
        }

        const tasksData = JSON.parse(fs.readFileSync(tasksFilePath, 'utf8'));
        
        if (!tasksData.tasks || !Array.isArray(tasksData.tasks)) {
            console.log('⚠️  Invalid tasks.json format, skipping task migration');
            return;
        }

        // Create a default workflow for all migrated tasks
        const workflow = await this.createDefaultWorkflow(projectId, tasksData.tasks.length);
        console.log(`✅ Created default workflow: ${workflow.name}`);

        // Migrate each task
        const taskIdMapping = new Map(); // Map old task IDs to new UUIDs
        
        for (const taskData of tasksData.tasks) {
            try {
                const migratedTask = await this.migrateTask(workflow.id, taskData, taskIdMapping);
                taskIdMapping.set(taskData.id, migratedTask.id);
                this.migrationStats.tasks++;
            } catch (error) {
                console.error(`❌ Failed to migrate task ${taskData.id}:`, error.message);
                this.migrationStats.errors.push(`Task ${taskData.id}: ${error.message}`);
            }
        }

        // Create task dependencies after all tasks are migrated
        await this.createTaskDependencies(tasksData.tasks, taskIdMapping);

        // Update workflow progress
        await this.updateWorkflowProgress(workflow.id);
    }

    /**
     * Create default workflow for migrated tasks
     */
    async createDefaultWorkflow(projectId, totalTasks) {
        const workflowData = {
            project_id: projectId,
            name: 'Migrated Tasks Workflow',
            description: 'Default workflow containing all migrated tasks from the file-based system',
            requirements: 'Migrate and organize all existing tasks from the Claude Task Master file-based system',
            current_phase: 'development',
            status: 'active',
            progress: {
                completed: 0,
                total: totalTasks,
                percentage: 0
            },
            metrics: {
                migration_source: 'tasks.json',
                total_tasks_to_migrate: totalTasks
            }
        };

        const workflow = await this.db.createWorkflow(workflowData);
        this.migrationStats.workflows = 1;
        return workflow;
    }

    /**
     * Migrate individual task
     */
    async migrateTask(workflowId, taskData, taskIdMapping) {
        // Map old status to new status values
        const statusMapping = {
            'done': 'done',
            'in-progress': 'in-progress',
            'pending': 'pending',
            'deferred': 'deferred'
        };

        // Map old priority to numeric values
        const priorityMapping = {
            'high': 8,
            'medium': 5,
            'low': 3
        };

        const migratedTaskData = {
            workflow_id: workflowId,
            title: taskData.title || 'Untitled Task',
            description: taskData.description || '',
            requirements: this.parseRequirements(taskData.details),
            acceptance_criteria: this.parseAcceptanceCriteria(taskData.testStrategy),
            dependencies: taskData.dependencies || [],
            priority: priorityMapping[taskData.priority] || 5,
            status: statusMapping[taskData.status] || 'pending',
            metadata: {
                original_id: taskData.id,
                migrated_from: 'tasks.json',
                original_details: taskData.details,
                original_test_strategy: taskData.testStrategy,
                subtasks: taskData.subtasks || [],
                previous_status: taskData.previousStatus
            }
        };

        return await this.db.createTask(migratedTaskData);
    }

    /**
     * Parse requirements from task details
     */
    parseRequirements(details) {
        if (!details) return [];
        
        // Split details by lines and extract bullet points
        const lines = details.split('\n');
        const requirements = [];
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
                requirements.push(trimmed.substring(1).trim());
            }
        }
        
        return requirements.length > 0 ? requirements : [details];
    }

    /**
     * Parse acceptance criteria from test strategy
     */
    parseAcceptanceCriteria(testStrategy) {
        if (!testStrategy) return [];
        
        // Split test strategy into criteria
        const sentences = testStrategy.split(/[.!?]+/).filter(s => s.trim().length > 0);
        return sentences.map(s => s.trim());
    }

    /**
     * Create task dependencies after all tasks are migrated
     */
    async createTaskDependencies(originalTasks, taskIdMapping) {
        for (const taskData of originalTasks) {
            if (taskData.dependencies && Array.isArray(taskData.dependencies)) {
                const newTaskId = taskIdMapping.get(taskData.id);
                
                for (const depId of taskData.dependencies) {
                    const newDepId = taskIdMapping.get(depId);
                    
                    if (newTaskId && newDepId) {
                        try {
                            await this.db.createTaskDependency(newTaskId, newDepId, 'blocks');
                        } catch (error) {
                            console.error(`❌ Failed to create dependency ${depId} -> ${taskData.id}:`, error.message);
                        }
                    }
                }
            }
        }
    }

    /**
     * Update workflow progress based on migrated tasks
     */
    async updateWorkflowProgress(workflowId) {
        const tasks = await this.db.getTasksByWorkflow(workflowId);
        const completedTasks = tasks.filter(t => t.status === 'done').length;
        const totalTasks = tasks.length;
        const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        const progress = {
            completed: completedTasks,
            total: totalTasks,
            percentage: percentage
        };

        await this.db.updateWorkflowStatus(workflowId, 'active', progress);
    }

    /**
     * Migrate configuration data
     */
    async migrateConfiguration(projectId) {
        const configPath = path.join(__dirname, '../../.taskmasterconfig');
        
        if (!fs.existsSync(configPath)) {
            console.log('⚠️  No .taskmasterconfig file found, skipping configuration migration');
            return;
        }

        try {
            const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            
            // Register components based on configuration
            await this.registerConfiguredComponents(configData);
            
            // Update project settings with configuration
            await this.db.updateProject(projectId, {
                settings: {
                    ...configData,
                    migrated_from: 'file_based_system',
                    migration_date: new Date().toISOString()
                }
            });
            
        } catch (error) {
            console.error('❌ Failed to migrate configuration:', error.message);
            this.migrationStats.errors.push(`Configuration migration: ${error.message}`);
        }
    }

    /**
     * Register components based on configuration
     */
    async registerConfiguredComponents(config) {
        const components = [
            {
                name: 'task-manager',
                type: 'manager',
                version: '1.0.0',
                status: 'active',
                configuration: config.global || {},
                capabilities: ['task_creation', 'task_management', 'file_generation']
            },
            {
                name: 'ai-orchestrator',
                type: 'orchestrator',
                version: '1.0.0',
                status: 'active',
                configuration: config.models || {},
                capabilities: ['ai_processing', 'model_management', 'content_generation']
            }
        ];

        for (const componentData of components) {
            try {
                await this.db.registerComponent(componentData);
            } catch (error) {
                console.error(`❌ Failed to register component ${componentData.name}:`, error.message);
            }
        }
    }

    /**
     * Migrate templates (placeholder for future template migration)
     */
    async migrateTemplates() {
        // Check for any template files in the system
        const templateDirs = [
            path.join(__dirname, '../../scripts/modules'),
            path.join(__dirname, '../../src')
        ];

        for (const dir of templateDirs) {
            if (fs.existsSync(dir)) {
                await this.scanForTemplates(dir);
            }
        }
    }

    /**
     * Scan directory for potential templates
     */
    async scanForTemplates(directory) {
        try {
            const files = fs.readdirSync(directory, { withFileTypes: true });
            
            for (const file of files) {
                if (file.isDirectory()) {
                    await this.scanForTemplates(path.join(directory, file.name));
                } else if (file.name.endsWith('.js') && file.name.includes('template')) {
                    // Found a potential template file
                    await this.migrateTemplateFile(path.join(directory, file.name));
                }
            }
        } catch (error) {
            // Ignore directory access errors
        }
    }

    /**
     * Migrate individual template file
     */
    async migrateTemplateFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const fileName = path.basename(filePath, '.js');
            
            const templateData = {
                name: fileName,
                type: 'code_pattern',
                category: 'migrated',
                description: `Migrated template from ${filePath}`,
                template_content: {
                    type: 'javascript',
                    content: content,
                    file_path: filePath
                },
                tags: ['migrated', 'javascript'],
                created_by: 'migration_script'
            };

            await this.db.saveTemplate(templateData);
            this.migrationStats.templates++;
            
        } catch (error) {
            console.error(`❌ Failed to migrate template ${filePath}:`, error.message);
        }
    }

    /**
     * Generate migration report
     */
    async generateMigrationReport() {
        const report = {
            migration_date: new Date().toISOString(),
            statistics: this.migrationStats,
            database_stats: await this.db.getStats(),
            success: this.migrationStats.errors.length === 0
        };

        const reportPath = path.join(__dirname, '../migration_report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        console.log('\n📊 Migration Report:');
        console.log(`   Projects: ${report.statistics.projects}`);
        console.log(`   Workflows: ${report.statistics.workflows}`);
        console.log(`   Tasks: ${report.statistics.tasks}`);
        console.log(`   Templates: ${report.statistics.templates}`);
        console.log(`   Errors: ${report.statistics.errors.length}`);
        
        if (report.statistics.errors.length > 0) {
            console.log('\n❌ Errors encountered:');
            report.statistics.errors.forEach(error => console.log(`   - ${error}`));
        }
        
        console.log(`\n📄 Full report saved to: ${reportPath}`);
    }

    /**
     * Close database connection
     */
    async close() {
        await this.db.close();
    }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/taskmaster';
    
    const migrator = new FileMigrator(connectionString);
    
    migrator.migrate()
        .then(() => {
            console.log('✅ Migration completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Migration failed:', error);
            process.exit(1);
        })
        .finally(() => {
            migrator.close();
        });
}

export default FileMigrator;

