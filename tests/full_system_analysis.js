#!/usr/bin/env node

/**
 * @fileoverview Full System Analysis and Testing
 * @description Comprehensive test analysis of the merged AI-CICD system
 * Tests all components from PRs 13-17 and validates proper implementation
 */

import {
	AICICDSystem,
	createAICICDSystem,
	processRequirement
} from '../src/ai_cicd_system/index.js';
import { log } from '../scripts/modules/utils.js';

// Codegen credentials for testing
const CODEGEN_CONFIG = {
	token: 'sk-ce027fa7-3c8d-4beb-8c86-ed8ae982ac99',
	org_id: '323',
	api_url: 'https://api.codegen.sh'
};

/**
 * Full Test Analysis Class
 */
class FullTestAnalysis {
	constructor() {
		this.testResults = [];
		this.componentTests = new Map();
		this.integrationTests = new Map();
		this.mockTests = new Map();
		this.realAPITests = new Map();
		this.startTime = Date.now();
	}

	/**
	 * Run comprehensive system analysis
	 */
	async runFullAnalysis() {
		console.log('🔬 Starting Full System Analysis');
		console.log('='.repeat(80));
		console.log('Testing merged components from PRs 13, 14, 15, 16, 17');
		console.log('Validating proper implementation and integration\n');

		try {
			// Phase 1: Component Existence Analysis
			await this.analyzeComponentExistence();

			// Phase 2: Mock Implementation Testing
			await this.testMockImplementations();

			// Phase 3: Component Integration Testing
			await this.testComponentIntegration();

			// Phase 4: Real API Testing with Codegen
			await this.testRealAPIIntegration();

			// Phase 5: End-to-End Workflow Testing
			await this.testEndToEndWorkflows();

			// Phase 6: Performance and Stress Testing
			await this.testPerformanceAndStress();

			// Generate comprehensive report
			await this.generateAnalysisReport();
		} catch (error) {
			console.error('❌ Full analysis failed:', error.message);
			throw error;
		}
	}

	/**
	 * Phase 1: Analyze component existence and implementation
	 */
	async analyzeComponentExistence() {
		console.log('📋 Phase 1: Component Existence Analysis');
		console.log('-'.repeat(50));

		const expectedComponents = [
			'RequirementProcessor', // PR 14
			'TaskStorageManager', // PR 15
			'CodegenIntegrator', // PR 13
			'ValidationEngine', // PR 16
			'WorkflowOrchestrator', // PR 17
			'ContextManager', // Unified
			'SystemMonitor' // Unified
		];

		try {
			// Test system creation
			const system = new AICICDSystem({
				mode: 'development',
				database: { enable_mock: true },
				codegen: { enable_mock: true },
				validation: { enable_mock: true }
			});

			await system.initialize();

			// Check each component
			for (const componentName of expectedComponents) {
				const component = system.components.get(
					componentName
						.toLowerCase()
						.replace(/([A-Z])/g, (match, letter) =>
							componentName.indexOf(letter) === 0
								? letter.toLowerCase()
								: letter.toLowerCase()
						)
						.replace(/([a-z])([A-Z])/g, '$1$2')
						.toLowerCase()
				);

				if (component) {
					console.log(`✅ ${componentName}: Found and accessible`);

					// Test component health
					if (component.getHealth) {
						const health = await component.getHealth();
						console.log(`   Health: ${health.status}`);
					}

					this.componentTests.set(componentName, {
						exists: true,
						accessible: true,
						health: component.getHealth ? await component.getHealth() : null
					});
				} else {
					console.log(`❌ ${componentName}: Not found or not accessible`);
					this.componentTests.set(componentName, {
						exists: false,
						accessible: false,
						health: null
					});
				}
			}

			await system.shutdown();
			console.log('✅ Component existence analysis completed\n');
		} catch (error) {
			console.error('❌ Component analysis failed:', error.message);
			throw error;
		}
	}

	/**
	 * Phase 2: Test mock implementations
	 */
	async testMockImplementations() {
		console.log('🎭 Phase 2: Mock Implementation Testing');
		console.log('-'.repeat(50));

		try {
			// Test basic requirement processing with mocks
			console.log('Testing basic requirement processing...');
			const result = await processRequirement(
				'Create a simple REST API for user management with CRUD operations',
				{
					mode: 'development',
					database: { enable_mock: true },
					codegen: { enable_mock: true },
					validation: { enable_mock: true }
				}
			);

			console.log(`✅ Mock workflow completed: ${result.status}`);
			console.log(`   Tasks generated: ${result.tasks?.length || 0}`);
			console.log(`   Codegen results: ${result.codegen_results?.length || 0}`);
			console.log(
				`   Validation results: ${result.validation_results?.length || 0}`
			);

			this.mockTests.set('basicWorkflow', {
				success: true,
				result: result,
				duration: result.metrics?.total_duration_ms || 0
			});

			// Test advanced system usage with mocks
			console.log('\nTesting advanced system usage...');
			const system = await createAICICDSystem({
				mode: 'development',
				database: { enable_mock: true },
				codegen: { enable_mock: true },
				validation: { enable_mock: true }
			});

			const advancedResult = await system.processRequirement(
				'Implement a secure authentication system with JWT, rate limiting, and comprehensive testing'
			);

			console.log(
				`✅ Advanced mock workflow completed: ${advancedResult.status}`
			);

			const health = await system.getSystemHealth();
			console.log(`   System health: ${health.status}`);

			await system.shutdown();

			this.mockTests.set('advancedWorkflow', {
				success: true,
				result: advancedResult,
				health: health
			});

			console.log('✅ Mock implementation testing completed\n');
		} catch (error) {
			console.error('❌ Mock implementation testing failed:', error.message);
			this.mockTests.set('error', { success: false, error: error.message });
		}
	}

	/**
	 * Phase 3: Test component integration
	 */
	async testComponentIntegration() {
		console.log('🔗 Phase 3: Component Integration Testing');
		console.log('-'.repeat(50));

		try {
			const system = await createAICICDSystem({
				mode: 'development',
				database: { enable_mock: true },
				codegen: { enable_mock: true },
				validation: { enable_mock: true }
			});

			// Test individual component interactions
			const components = {
				requirementProcessor: system.components.get('requirementProcessor'),
				taskStorage: system.components.get('taskStorage'),
				codegenIntegrator: system.components.get('codegenIntegrator'),
				validationEngine: system.components.get('validationEngine'),
				contextManager: system.components.get('contextManager'),
				workflowOrchestrator: system.components.get('workflowOrchestrator')
			};

			// Test 1: Requirement Processing → Task Storage
			console.log('Testing: Requirement Processing → Task Storage');
			if (components.requirementProcessor && components.taskStorage) {
				const analysisResult =
					await components.requirementProcessor.analyzeRequirement(
						'Create a calculator API with basic arithmetic operations'
					);

				const taskId = await components.taskStorage.storeAtomicTask(
					analysisResult.tasks[0],
					analysisResult.requirement
				);

				const retrievedTask =
					await components.taskStorage.retrieveTaskById(taskId);
				console.log(`   ✅ Task stored and retrieved: ${retrievedTask.title}`);

				this.integrationTests.set('requirementToStorage', {
					success: true,
					taskId
				});
			}

			// Test 2: Task Storage → Context Manager → Codegen
			console.log('Testing: Task Storage → Context Manager → Codegen');
			if (
				components.taskStorage &&
				components.contextManager &&
				components.codegenIntegrator
			) {
				const tasks = await components.taskStorage.getPendingTasks();
				if (tasks.length > 0) {
					const task = tasks[0];
					const context = await components.contextManager.generatePromptContext(
						task.id
					);
					const codegenResult = await components.codegenIntegrator.processTask(
						task,
						context
					);

					console.log(`   ✅ Codegen processing: ${codegenResult.status}`);
					this.integrationTests.set('storageToCodegen', {
						success: true,
						result: codegenResult
					});
				}
			}

			// Test 3: Codegen → Validation Engine
			console.log('Testing: Codegen → Validation Engine');
			if (components.validationEngine) {
				const mockPRInfo = {
					url: 'https://github.com/test/repo/pull/123',
					number: 123,
					branch_name: 'feature/test',
					changed_files: ['src/test.js']
				};

				const validationResult = await components.validationEngine.validatePR(
					mockPRInfo,
					{ task_id: 'test-task', requirements: ['Test requirement'] }
				);

				console.log(
					`   ✅ Validation completed: ${validationResult.status} (score: ${validationResult.score.overall_score})`
				);
				this.integrationTests.set('codegenToValidation', {
					success: true,
					result: validationResult
				});
			}

			// Test 4: Workflow Orchestration
			console.log('Testing: Workflow Orchestration');
			if (components.workflowOrchestrator) {
				const workflowData = {
					analysis: { tasks: [{ id: 'test-task' }] },
					tasks: [{ id: 'test-task', title: 'Test Task' }],
					codegen: [{ status: 'completed' }],
					validation: [{ status: 'passed' }]
				};

				const orchestrationResult =
					await components.workflowOrchestrator.completeWorkflow(
						'test-workflow',
						workflowData
					);

				console.log(
					`   ✅ Workflow orchestration: ${orchestrationResult.status}`
				);
				this.integrationTests.set('workflowOrchestration', {
					success: true,
					result: orchestrationResult
				});
			}

			await system.shutdown();
			console.log('✅ Component integration testing completed\n');
		} catch (error) {
			console.error('❌ Component integration testing failed:', error.message);
			this.integrationTests.set('error', {
				success: false,
				error: error.message
			});
		}
	}

	/**
	 * Phase 4: Test real API integration with Codegen
	 */
	async testRealAPIIntegration() {
		console.log('🌐 Phase 4: Real API Integration Testing');
		console.log('-'.repeat(50));
		console.log('Using provided Codegen credentials for real API testing...');

		try {
			// Test with real Codegen API
			const system = await createAICICDSystem({
				mode: 'production',
				database: { enable_mock: true }, // Keep database mock for testing
				codegen: {
					enable_mock: false,
					api_key: CODEGEN_CONFIG.token,
					api_url: CODEGEN_CONFIG.api_url,
					timeout: 60000
				},
				validation: { enable_mock: true } // Keep validation mock for testing
			});

			console.log('Testing real Codegen API integration...');

			// Create a simple test requirement
			const testRequirement = `
                Create a simple Node.js Express API endpoint for a calculator service.
                
                Requirements:
                - Create a POST /calculate endpoint
                - Accept two numbers and an operation (add, subtract, multiply, divide)
                - Return the result in JSON format
                - Include basic error handling for invalid inputs
                - Add simple unit tests using Jest
                
                Context:
                - Repository: https://github.com/test/calculator-api
                - Branch: feature/calculator-endpoint
                - Framework: Express.js
                - Testing: Jest
                
                Acceptance Criteria:
                - Endpoint responds with correct calculations
                - Error handling for division by zero
                - Input validation for non-numeric values
                - Unit tests with 80%+ coverage
            `;

			const startTime = Date.now();
			const result = await system.processRequirement(testRequirement);
			const duration = Date.now() - startTime;

			console.log(`✅ Real API workflow completed: ${result.status}`);
			console.log(`   Duration: ${duration}ms`);
			console.log(`   Tasks generated: ${result.tasks?.length || 0}`);
			console.log(`   Codegen results: ${result.codegen_results?.length || 0}`);

			// Check if PRs were actually created
			if (result.codegen_results && result.codegen_results.length > 0) {
				for (const codegenResult of result.codegen_results) {
					if (codegenResult.pr_info) {
						console.log(`   📝 PR created: ${codegenResult.pr_info.pr_url}`);
						console.log(`   🌿 Branch: ${codegenResult.pr_info.branch_name}`);
					}
				}
			}

			this.realAPITests.set('codegenIntegration', {
				success: true,
				result: result,
				duration: duration,
				api_used: true
			});

			await system.shutdown();
			console.log('✅ Real API integration testing completed\n');
		} catch (error) {
			console.error('❌ Real API integration testing failed:', error.message);
			console.log(
				'   This might be due to API limits, network issues, or credential problems'
			);

			this.realAPITests.set('codegenIntegration', {
				success: false,
				error: error.message,
				api_used: true
			});
		}
	}

	/**
	 * Phase 5: Test end-to-end workflows
	 */
	async testEndToEndWorkflows() {
		console.log('🔄 Phase 5: End-to-End Workflow Testing');
		console.log('-'.repeat(50));

		const testScenarios = [
			{
				name: 'Simple API Development',
				requirement: 'Create a REST API for managing books with CRUD operations'
			},
			{
				name: 'Authentication System',
				requirement:
					'Implement JWT-based authentication with login, logout, and password reset'
			},
			{
				name: 'Database Integration',
				requirement:
					'Add PostgreSQL database integration with user management and data validation'
			}
		];

		try {
			for (const scenario of testScenarios) {
				console.log(`\nTesting scenario: ${scenario.name}`);

				const startTime = Date.now();
				const result = await processRequirement(scenario.requirement, {
					mode: 'development',
					database: { enable_mock: true },
					codegen: { enable_mock: true },
					validation: { enable_mock: true }
				});
				const duration = Date.now() - startTime;

				console.log(`   ✅ Completed in ${duration}ms`);
				console.log(`   Status: ${result.status}`);
				console.log(`   Tasks: ${result.tasks?.length || 0}`);
				console.log(`   Success rate: ${this.calculateSuccessRate(result)}%`);

				this.testResults.push({
					scenario: scenario.name,
					success: result.status === 'completed',
					duration: duration,
					result: result
				});
			}

			console.log('✅ End-to-end workflow testing completed\n');
		} catch (error) {
			console.error('❌ End-to-end workflow testing failed:', error.message);
			this.testResults.push({
				scenario: 'E2E Testing',
				success: false,
				error: error.message
			});
		}
	}

	/**
	 * Phase 6: Performance and stress testing
	 */
	async testPerformanceAndStress() {
		console.log('⚡ Phase 6: Performance and Stress Testing');
		console.log('-'.repeat(50));

		try {
			// Test concurrent processing
			console.log('Testing concurrent requirement processing...');

			const concurrentRequirements = [
				'Create a user registration API',
				'Implement email notification service',
				'Add file upload functionality',
				'Create admin dashboard',
				'Implement search functionality'
			];

			const startTime = Date.now();
			const promises = concurrentRequirements.map((req) =>
				processRequirement(req, {
					mode: 'development',
					database: { enable_mock: true },
					codegen: { enable_mock: true },
					validation: { enable_mock: true }
				}).catch((error) => ({ error: error.message }))
			);

			const results = await Promise.all(promises);
			const duration = Date.now() - startTime;

			const successful = results.filter((r) => !r.error).length;
			const failed = results.filter((r) => r.error).length;

			console.log(`✅ Concurrent processing completed in ${duration}ms`);
			console.log(
				`   Successful: ${successful}/${concurrentRequirements.length}`
			);
			console.log(`   Failed: ${failed}/${concurrentRequirements.length}`);
			console.log(
				`   Average time per request: ${(duration / concurrentRequirements.length).toFixed(0)}ms`
			);

			// Test system under load
			console.log('\nTesting system under load...');
			const system = await createAICICDSystem({
				mode: 'development',
				database: { enable_mock: true },
				codegen: { enable_mock: true },
				validation: { enable_mock: true }
			});

			const loadTestStart = Date.now();
			for (let i = 0; i < 10; i++) {
				await system.processRequirement(
					`Test requirement ${i + 1}: Create a simple API endpoint`
				);
			}
			const loadTestDuration = Date.now() - loadTestStart;

			console.log(`✅ Load test completed in ${loadTestDuration}ms`);
			console.log(
				`   Average per request: ${(loadTestDuration / 10).toFixed(0)}ms`
			);

			const finalHealth = await system.getSystemHealth();
			console.log(`   Final system health: ${finalHealth.status}`);

			await system.shutdown();
			console.log('✅ Performance and stress testing completed\n');
		} catch (error) {
			console.error('❌ Performance testing failed:', error.message);
		}
	}

	/**
	 * Generate comprehensive analysis report
	 */
	async generateAnalysisReport() {
		console.log('📊 Generating Comprehensive Analysis Report');
		console.log('='.repeat(80));

		const totalDuration = Date.now() - this.startTime;

		// Component Analysis Summary
		console.log('\n🧩 COMPONENT ANALYSIS SUMMARY');
		console.log('-'.repeat(40));

		let componentsFound = 0;
		let componentsTotal = 0;

		for (const [name, test] of this.componentTests) {
			componentsTotal++;
			if (test.exists && test.accessible) {
				componentsFound++;
				console.log(`✅ ${name}: Implemented and functional`);
			} else {
				console.log(`❌ ${name}: Missing or non-functional`);
			}
		}

		console.log(
			`\nComponent Implementation Rate: ${componentsFound}/${componentsTotal} (${((componentsFound / componentsTotal) * 100).toFixed(1)}%)`
		);

		// Mock Testing Summary
		console.log('\n🎭 MOCK TESTING SUMMARY');
		console.log('-'.repeat(40));

		for (const [name, test] of this.mockTests) {
			if (test.success) {
				console.log(`✅ ${name}: Passed`);
				if (test.duration) {
					console.log(`   Duration: ${test.duration}ms`);
				}
			} else {
				console.log(`❌ ${name}: Failed - ${test.error}`);
			}
		}

		// Integration Testing Summary
		console.log('\n🔗 INTEGRATION TESTING SUMMARY');
		console.log('-'.repeat(40));

		for (const [name, test] of this.integrationTests) {
			if (test.success) {
				console.log(`✅ ${name}: Passed`);
			} else {
				console.log(`❌ ${name}: Failed - ${test.error}`);
			}
		}

		// Real API Testing Summary
		console.log('\n🌐 REAL API TESTING SUMMARY');
		console.log('-'.repeat(40));

		for (const [name, test] of this.realAPITests) {
			if (test.success) {
				console.log(`✅ ${name}: Passed with real API`);
				if (test.duration) {
					console.log(`   Duration: ${test.duration}ms`);
				}
			} else {
				console.log(`⚠️  ${name}: Failed - ${test.error}`);
				console.log(`   Note: This may be due to API limits or network issues`);
			}
		}

		// End-to-End Testing Summary
		console.log('\n🔄 END-TO-END TESTING SUMMARY');
		console.log('-'.repeat(40));

		const e2eSuccessful = this.testResults.filter((r) => r.success).length;
		const e2eTotal = this.testResults.length;

		for (const result of this.testResults) {
			if (result.success) {
				console.log(`✅ ${result.scenario}: Passed (${result.duration}ms)`);
			} else {
				console.log(`❌ ${result.scenario}: Failed - ${result.error}`);
			}
		}

		console.log(
			`\nE2E Success Rate: ${e2eSuccessful}/${e2eTotal} (${((e2eSuccessful / e2eTotal) * 100).toFixed(1)}%)`
		);

		// Overall Assessment
		console.log('\n🎯 OVERALL ASSESSMENT');
		console.log('-'.repeat(40));

		const overallScore = this.calculateOverallScore();
		console.log(`Overall System Score: ${overallScore.toFixed(1)}/100`);
		console.log(`Total Analysis Duration: ${totalDuration}ms`);

		if (overallScore >= 90) {
			console.log('🟢 EXCELLENT: System is fully implemented and functional');
		} else if (overallScore >= 75) {
			console.log('🟡 GOOD: System is mostly implemented with minor issues');
		} else if (overallScore >= 50) {
			console.log('🟠 FAIR: System has significant implementation gaps');
		} else {
			console.log('🔴 POOR: System has major implementation issues');
		}

		// Recommendations
		console.log('\n💡 RECOMMENDATIONS');
		console.log('-'.repeat(40));

		if (componentsFound < componentsTotal) {
			console.log('• Complete implementation of missing components');
		}

		if (
			this.realAPITests.size > 0 &&
			!Array.from(this.realAPITests.values()).some((t) => t.success)
		) {
			console.log('• Verify API credentials and network connectivity');
			console.log('• Test with different API endpoints or configurations');
		}

		if (e2eSuccessful < e2eTotal) {
			console.log('• Debug failed end-to-end scenarios');
			console.log('• Improve error handling and recovery mechanisms');
		}

		console.log('• Consider adding more comprehensive integration tests');
		console.log('• Implement performance monitoring in production');

		console.log('\n✅ Full System Analysis Complete!');
		console.log('='.repeat(80));
	}

	/**
	 * Calculate success rate for a workflow result
	 */
	calculateSuccessRate(result) {
		if (!result) return 0;

		let total = 0;
		let successful = 0;

		if (result.tasks) {
			total += result.tasks.length;
			successful += result.tasks.length; // Assume all tasks are successful if created
		}

		if (result.codegen_results) {
			total += result.codegen_results.length;
			successful += result.codegen_results.filter(
				(r) => r.status === 'completed'
			).length;
		}

		if (result.validation_results) {
			total += result.validation_results.length;
			successful += result.validation_results.filter(
				(r) => r.status === 'passed'
			).length;
		}

		return total > 0 ? Math.round((successful / total) * 100) : 0;
	}

	/**
	 * Calculate overall system score
	 */
	calculateOverallScore() {
		let score = 0;
		let maxScore = 0;

		// Component implementation (40 points)
		const componentScore =
			(Array.from(this.componentTests.values()).filter((t) => t.exists).length /
				this.componentTests.size) *
			40;
		score += componentScore;
		maxScore += 40;

		// Mock testing (20 points)
		const mockScore =
			(Array.from(this.mockTests.values()).filter((t) => t.success).length /
				Math.max(this.mockTests.size, 1)) *
			20;
		score += mockScore;
		maxScore += 20;

		// Integration testing (20 points)
		const integrationScore =
			(Array.from(this.integrationTests.values()).filter((t) => t.success)
				.length /
				Math.max(this.integrationTests.size, 1)) *
			20;
		score += integrationScore;
		maxScore += 20;

		// E2E testing (20 points)
		const e2eScore =
			(this.testResults.filter((r) => r.success).length /
				Math.max(this.testResults.length, 1)) *
			20;
		score += e2eScore;
		maxScore += 20;

		return (score / maxScore) * 100;
	}
}

/**
 * Main execution function
 */
async function runFullSystemAnalysis() {
	const analysis = new FullTestAnalysis();

	try {
		await analysis.runFullAnalysis();
		return analysis;
	} catch (error) {
		console.error('❌ Full system analysis failed:', error);
		throw error;
	}
}

// Run analysis if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	runFullSystemAnalysis().catch((error) => {
		console.error('Analysis execution failed:', error);
		process.exit(1);
	});
}

export { FullTestAnalysis, runFullSystemAnalysis };
