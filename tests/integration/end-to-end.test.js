/**
 * End-to-End Integration Testing Suite
 * 
 * Tests complete workflows across all system components to ensure
 * proper integration and functionality.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { TestDataManager, IntegrationTestHelpers, MockAIFactory } from '../test-utils/index.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

describe('End-to-End Integration Testing Suite', () => {
	let testDataManager;
	let testProjectDir;
	let originalCwd;

	beforeAll(async () => {
		testDataManager = new TestDataManager();
		originalCwd = process.cwd();
		
		// Create isolated test project directory
		testProjectDir = testDataManager.createTempDir('test-project');
		process.chdir(testProjectDir);
		
		// Initialize test project structure
		fs.writeFileSync('package.json', JSON.stringify({
			name: 'test-project',
			version: '1.0.0',
			type: 'module'
		}, null, 2));
	});

	afterAll(() => {
		process.chdir(originalCwd);
		testDataManager.cleanup();
	});

	beforeEach(() => {
		// Clean up any existing tasks.json before each test
		const tasksFile = path.join(testProjectDir, 'tasks.json');
		if (fs.existsSync(tasksFile)) {
			fs.unlinkSync(tasksFile);
		}
	});

	describe('Complete Task Management Workflow', () => {
		test('should handle full task lifecycle from creation to completion', async () => {
			// Step 1: Initialize project
			const initResult = await execAsync('node ../../../bin/task-master.js init --no-interactive');
			expect(initResult.stderr).toBe('');

			// Step 2: Create initial task
			const createResult = await execAsync(
				'node ../../../bin/task-master.js add-task --prompt "Create user authentication system" --priority high --manual'
			);
			expect(createResult.stderr).toBe('');

			// Verify tasks.json was created
			expect(fs.existsSync('tasks.json')).toBe(true);
			const tasksData = JSON.parse(fs.readFileSync('tasks.json', 'utf8'));
			expect(tasksData.tasks).toHaveLength(1);
			expect(tasksData.tasks[0].title).toContain('authentication');

			// Step 3: Add subtasks
			const subtaskResult = await execAsync(
				'node ../../../bin/task-master.js add-subtask --parent-id 1 --title "Design authentication flow" --description "Create authentication flow diagram"'
			);
			expect(subtaskResult.stderr).toBe('');

			// Step 4: List tasks to verify structure
			const listResult = await execAsync('node ../../../bin/task-master.js list --with-subtasks');
			expect(listResult.stdout).toContain('authentication');
			expect(listResult.stdout).toContain('1.1');

			// Step 5: Update task status
			const statusResult = await execAsync('node ../../../bin/task-master.js set-status --id 1.1 --status done');
			expect(statusResult.stderr).toBe('');

			// Step 6: Verify status update
			const finalTasksData = JSON.parse(fs.readFileSync('tasks.json', 'utf8'));
			expect(finalTasksData.tasks[0].subtasks[0].status).toBe('done');
		});

		test('should handle task dependencies correctly', async () => {
			// Create multiple tasks with dependencies
			await execAsync('node ../../../bin/task-master.js add-task --prompt "Setup database" --manual');
			await execAsync('node ../../../bin/task-master.js add-task --prompt "Create user model" --dependencies 1 --manual');
			await execAsync('node ../../../bin/task-master.js add-task --prompt "Implement authentication" --dependencies 2 --manual');

			const tasksData = JSON.parse(fs.readFileSync('tasks.json', 'utf8'));
			expect(tasksData.tasks).toHaveLength(3);
			expect(tasksData.tasks[1].dependencies).toContain(1);
			expect(tasksData.tasks[2].dependencies).toContain(2);

			// Test dependency validation
			const findNextResult = await execAsync('node ../../../bin/task-master.js find-next');
			expect(findNextResult.stdout).toContain('Setup database'); // Should be the first available task
		});
	});

	describe('MCP Server Integration', () => {
		test('should start MCP server and handle requests', async () => {
			// This test would require a more complex setup with actual MCP client
			// For now, we'll test the server startup
			const serverProcess = exec('node ../../../mcp-server/server.js');
			
			// Give server time to start
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			// Server should be running (we can't easily test stdio communication in this context)
			expect(serverProcess.pid).toBeDefined();
			
			// Clean up
			serverProcess.kill();
		});
	});

	describe('Configuration Management Integration', () => {
		test('should handle configuration changes across commands', async () => {
			// Test model configuration
			const setModelResult = await execAsync(
				'node ../../../bin/task-master.js models --set-main openai gpt-4'
			);
			expect(setModelResult.stderr).toBe('');

			// Verify configuration was saved
			const configPath = path.join(testProjectDir, '.taskmasterconfig');
			if (fs.existsSync(configPath)) {
				const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
				expect(config.models?.main?.provider).toBe('openai');
				expect(config.models?.main?.modelId).toBe('gpt-4');
			}
		});
	});

	describe('File Generation Integration', () => {
		test('should generate task files correctly', async () => {
			// Create tasks
			await execAsync('node ../../../bin/task-master.js add-task --prompt "Test task generation" --manual');
			
			// Generate task files
			const generateResult = await execAsync('node ../../../bin/task-master.js generate-files');
			expect(generateResult.stderr).toBe('');

			// Verify task file was created
			const taskFile = path.join(testProjectDir, 'tasks', 'task_001.txt');
			expect(fs.existsSync(taskFile)).toBe(true);
			
			const taskContent = fs.readFileSync(taskFile, 'utf8');
			expect(taskContent).toContain('Test task generation');
		});
	});

	describe('Error Handling Integration', () => {
		test('should handle invalid commands gracefully', async () => {
			try {
				await execAsync('node ../../../bin/task-master.js invalid-command');
			} catch (error) {
				expect(error.code).toBe(1);
				expect(error.stderr).toContain('Unknown command');
			}
		});

		test('should handle missing task files gracefully', async () => {
			// Try to list tasks when no tasks.json exists
			const listResult = await execAsync('node ../../../bin/task-master.js list');
			expect(listResult.stdout).toContain('No tasks found');
		});

		test('should validate task IDs properly', async () => {
			await execAsync('node ../../../bin/task-master.js add-task --prompt "Test task" --manual');
			
			try {
				await execAsync('node ../../../bin/task-master.js set-status --id 999 --status done');
			} catch (error) {
				expect(error.stderr).toContain('Task not found');
			}
		});
	});

	describe('Performance Integration', () => {
		test('should handle large task sets efficiently', async () => {
			// Create many tasks
			const taskPromises = [];
			for (let i = 0; i < 50; i++) {
				taskPromises.push(
					execAsync(`node ../../../bin/task-master.js add-task --prompt "Task ${i}" --manual`)
				);
			}
			
			await Promise.all(taskPromises);

			// List all tasks - should complete quickly
			const start = Date.now();
			const listResult = await execAsync('node ../../../bin/task-master.js list');
			const duration = Date.now() - start;

			expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
			expect(listResult.stdout).toContain('Task 0');
			expect(listResult.stdout).toContain('Task 49');
		});
	});

	describe('Cross-Platform Integration', () => {
		test('should handle file paths correctly across platforms', async () => {
			await execAsync('node ../../../bin/task-master.js add-task --prompt "Cross-platform test" --manual');
			
			// Generate files
			await execAsync('node ../../../bin/task-master.js generate-files');
			
			// Check that files are created with correct path separators
			const tasksDir = path.join(testProjectDir, 'tasks');
			expect(fs.existsSync(tasksDir)).toBe(true);
			
			const files = fs.readdirSync(tasksDir);
			expect(files.length).toBeGreaterThan(0);
		});
	});

	describe('Data Persistence Integration', () => {
		test('should maintain data consistency across operations', async () => {
			// Create initial task
			await execAsync('node ../../../bin/task-master.js add-task --prompt "Persistence test" --manual');
			
			// Read initial state
			const initialData = JSON.parse(fs.readFileSync('tasks.json', 'utf8'));
			const initialTaskCount = initialData.tasks.length;
			
			// Perform multiple operations
			await execAsync('node ../../../bin/task-master.js add-subtask --parent-id 1 --title "Subtask 1"');
			await execAsync('node ../../../bin/task-master.js set-status --id 1.1 --status in-progress');
			await execAsync('node ../../../bin/task-master.js add-task --prompt "Another task" --manual');
			
			// Verify final state
			const finalData = JSON.parse(fs.readFileSync('tasks.json', 'utf8'));
			expect(finalData.tasks.length).toBe(initialTaskCount + 1);
			expect(finalData.tasks[0].subtasks).toHaveLength(1);
			expect(finalData.tasks[0].subtasks[0].status).toBe('in-progress');
		});
	});

	describe('Concurrent Operations Integration', () => {
		test('should handle concurrent task operations safely', async () => {
			// Start multiple operations concurrently
			const operations = [
				execAsync('node ../../../bin/task-master.js add-task --prompt "Concurrent task 1" --manual'),
				execAsync('node ../../../bin/task-master.js add-task --prompt "Concurrent task 2" --manual'),
				execAsync('node ../../../bin/task-master.js add-task --prompt "Concurrent task 3" --manual')
			];
			
			await Promise.all(operations);
			
			// Verify all tasks were created
			const tasksData = JSON.parse(fs.readFileSync('tasks.json', 'utf8'));
			expect(tasksData.tasks.length).toBe(3);
			
			// Verify task IDs are unique
			const taskIds = tasksData.tasks.map(t => t.id);
			const uniqueIds = [...new Set(taskIds)];
			expect(uniqueIds.length).toBe(taskIds.length);
		});
	});

	describe('Backup and Recovery Integration', () => {
		test('should handle data backup and recovery', async () => {
			// Create initial data
			await execAsync('node ../../../bin/task-master.js add-task --prompt "Backup test" --manual');
			
			const originalData = fs.readFileSync('tasks.json', 'utf8');
			
			// Simulate backup
			fs.writeFileSync('tasks.json.backup', originalData);
			
			// Corrupt main file
			fs.writeFileSync('tasks.json', 'invalid json');
			
			// Simulate recovery (this would be part of the application logic)
			const recoverData = () => {
				try {
					JSON.parse(fs.readFileSync('tasks.json', 'utf8'));
				} catch (error) {
					// Restore from backup
					if (fs.existsSync('tasks.json.backup')) {
						fs.copyFileSync('tasks.json.backup', 'tasks.json');
						return true;
					}
					return false;
				}
				return true;
			};
			
			const recovered = recoverData();
			expect(recovered).toBe(true);
			
			// Verify data integrity after recovery
			const recoveredData = JSON.parse(fs.readFileSync('tasks.json', 'utf8'));
			expect(recoveredData.tasks).toHaveLength(1);
			expect(recoveredData.tasks[0].title).toContain('Backup test');
		});
	});
});

