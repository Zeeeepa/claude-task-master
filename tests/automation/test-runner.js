#!/usr/bin/env node

/**
 * Comprehensive Test Automation Runner
 * 
 * Orchestrates the execution of all test suites with proper reporting,
 * environment management, and CI/CD integration.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TestRunner {
	constructor() {
		this.projectRoot = path.resolve(__dirname, '../..');
		this.testResults = {
			startTime: new Date(),
			suites: [],
			summary: {
				total: 0,
				passed: 0,
				failed: 0,
				skipped: 0
			}
		};
	}

	/**
	 * Run all test suites
	 */
	async runAllTests(options = {}) {
		console.log('🚀 Starting Comprehensive Test Suite Execution...\n');

		const testSuites = [
			{ name: 'Unit Tests', command: 'npm', args: ['test', '--', '--testPathPattern=unit'] },
			{ name: 'Integration Tests', command: 'npm', args: ['test', '--', '--testPathPattern=integration'] },
			{ name: 'Performance Tests', command: 'npm', args: ['test', '--', '--testPathPattern=performance'] },
			{ name: 'Security Tests', command: 'npm', args: ['test', '--', '--testPathPattern=security'] },
			{ name: 'Chaos Tests', command: 'npm', args: ['test', '--', '--testPathPattern=chaos'] }
		];

		if (options.coverage) {
			testSuites.forEach(suite => {
				suite.args.push('--coverage');
			});
		}

		for (const suite of testSuites) {
			console.log(`\n📋 Running ${suite.name}...`);
			const result = await this.runTestSuite(suite);
			this.testResults.suites.push(result);
			
			if (result.success) {
				console.log(`✅ ${suite.name} completed successfully`);
			} else {
				console.log(`❌ ${suite.name} failed`);
				if (options.failFast) {
					console.log('🛑 Stopping execution due to --fail-fast flag');
					break;
				}
			}
		}

		this.generateReport();
		return this.testResults;
	}

	/**
	 * Run a specific test suite
	 */
	async runTestSuite(suite) {
		const startTime = Date.now();
		
		return new Promise((resolve) => {
			const process = spawn(suite.command, suite.args, {
				cwd: this.projectRoot,
				stdio: 'pipe'
			});

			let stdout = '';
			let stderr = '';

			process.stdout.on('data', (data) => {
				stdout += data.toString();
				if (process.env.VERBOSE) {
					console.log(data.toString());
				}
			});

			process.stderr.on('data', (data) => {
				stderr += data.toString();
				if (process.env.VERBOSE) {
					console.error(data.toString());
				}
			});

			process.on('close', (code) => {
				const duration = Date.now() - startTime;
				const result = {
					name: suite.name,
					success: code === 0,
					exitCode: code,
					duration,
					stdout,
					stderr,
					timestamp: new Date()
				};

				// Parse test results from stdout
				this.parseTestResults(result);
				resolve(result);
			});
		});
	}

	/**
	 * Parse test results from Jest output
	 */
	parseTestResults(result) {
		const output = result.stdout;
		
		// Extract test counts from Jest output
		const testSummaryMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
		if (testSummaryMatch) {
			result.tests = {
				failed: parseInt(testSummaryMatch[1]),
				passed: parseInt(testSummaryMatch[2]),
				total: parseInt(testSummaryMatch[3])
			};
		} else {
			// Try alternative format
			const passedMatch = output.match(/(\d+)\s+passed/);
			const failedMatch = output.match(/(\d+)\s+failed/);
			const totalMatch = output.match(/(\d+)\s+total/);
			
			result.tests = {
				passed: passedMatch ? parseInt(passedMatch[1]) : 0,
				failed: failedMatch ? parseInt(failedMatch[1]) : 0,
				total: totalMatch ? parseInt(totalMatch[1]) : 0
			};
		}

		// Update summary
		if (result.tests) {
			this.testResults.summary.total += result.tests.total;
			this.testResults.summary.passed += result.tests.passed;
			this.testResults.summary.failed += result.tests.failed;
		}
	}

	/**
	 * Generate comprehensive test report
	 */
	generateReport() {
		this.testResults.endTime = new Date();
		this.testResults.totalDuration = this.testResults.endTime - this.testResults.startTime;

		const reportDir = path.join(this.projectRoot, 'coverage');
		if (!fs.existsSync(reportDir)) {
			fs.mkdirSync(reportDir, { recursive: true });
		}

		// Generate JSON report
		const jsonReport = path.join(reportDir, 'test-report.json');
		fs.writeFileSync(jsonReport, JSON.stringify(this.testResults, null, 2));

		// Generate HTML report
		this.generateHtmlReport();

		// Generate console summary
		this.printSummary();
	}

	/**
	 * Generate HTML test report
	 */
	generateHtmlReport() {
		const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Comprehensive Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #e9ecef; padding: 15px; border-radius: 5px; text-align: center; }
        .metric.success { background: #d4edda; }
        .metric.failure { background: #f8d7da; }
        .suite { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .suite.success { border-color: #28a745; }
        .suite.failure { border-color: #dc3545; }
        .duration { color: #666; font-size: 0.9em; }
        pre { background: #f8f9fa; padding: 10px; border-radius: 3px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 Comprehensive Test Report</h1>
        <p><strong>Generated:</strong> ${this.testResults.endTime.toISOString()}</p>
        <p><strong>Duration:</strong> ${Math.round(this.testResults.totalDuration / 1000)}s</p>
    </div>

    <div class="summary">
        <div class="metric ${this.testResults.summary.failed === 0 ? 'success' : 'failure'}">
            <h3>${this.testResults.summary.total}</h3>
            <p>Total Tests</p>
        </div>
        <div class="metric success">
            <h3>${this.testResults.summary.passed}</h3>
            <p>Passed</p>
        </div>
        <div class="metric ${this.testResults.summary.failed > 0 ? 'failure' : ''}">
            <h3>${this.testResults.summary.failed}</h3>
            <p>Failed</p>
        </div>
        <div class="metric">
            <h3>${this.testResults.summary.skipped}</h3>
            <p>Skipped</p>
        </div>
    </div>

    <h2>Test Suites</h2>
    ${this.testResults.suites.map(suite => `
        <div class="suite ${suite.success ? 'success' : 'failure'}">
            <h3>${suite.success ? '✅' : '❌'} ${suite.name}</h3>
            <p class="duration">Duration: ${Math.round(suite.duration / 1000)}s</p>
            ${suite.tests ? `
                <p>Tests: ${suite.tests.passed} passed, ${suite.tests.failed} failed, ${suite.tests.total} total</p>
            ` : ''}
            ${suite.stderr ? `
                <h4>Errors:</h4>
                <pre>${suite.stderr}</pre>
            ` : ''}
        </div>
    `).join('')}

    <script>
        // Add interactive features
        document.querySelectorAll('.suite').forEach(suite => {
            suite.addEventListener('click', () => {
                const pre = suite.querySelector('pre');
                if (pre) {
                    pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
                }
            });
        });
    </script>
</body>
</html>`;

		const htmlReport = path.join(this.projectRoot, 'coverage', 'test-report.html');
		fs.writeFileSync(htmlReport, htmlTemplate);
	}

	/**
	 * Print test summary to console
	 */
	printSummary() {
		console.log('\n' + '='.repeat(60));
		console.log('📊 TEST EXECUTION SUMMARY');
		console.log('='.repeat(60));
		
		console.log(`⏱️  Total Duration: ${Math.round(this.testResults.totalDuration / 1000)}s`);
		console.log(`📋 Total Tests: ${this.testResults.summary.total}`);
		console.log(`✅ Passed: ${this.testResults.summary.passed}`);
		console.log(`❌ Failed: ${this.testResults.summary.failed}`);
		console.log(`⏭️  Skipped: ${this.testResults.summary.skipped}`);
		
		const successRate = this.testResults.summary.total > 0 
			? Math.round((this.testResults.summary.passed / this.testResults.summary.total) * 100)
			: 0;
		console.log(`📈 Success Rate: ${successRate}%`);

		console.log('\n📋 Suite Results:');
		this.testResults.suites.forEach(suite => {
			const status = suite.success ? '✅' : '❌';
			const duration = Math.round(suite.duration / 1000);
			console.log(`  ${status} ${suite.name} (${duration}s)`);
		});

		if (this.testResults.summary.failed > 0) {
			console.log('\n⚠️  Some tests failed. Check the detailed report for more information.');
			console.log(`📄 Report: ${path.join(this.projectRoot, 'coverage', 'test-report.html')}`);
		} else {
			console.log('\n🎉 All tests passed successfully!');
		}
		
		console.log('='.repeat(60));
	}

	/**
	 * Run specific test categories
	 */
	async runCategory(category, options = {}) {
		console.log(`🎯 Running ${category} tests...`);
		
		const suite = {
			name: `${category} Tests`,
			command: 'npm',
			args: ['test', '--', `--testPathPattern=${category}`]
		};

		if (options.coverage) {
			suite.args.push('--coverage');
		}

		const result = await this.runTestSuite(suite);
		this.testResults.suites.push(result);
		this.generateReport();
		
		return result;
	}
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);
	const runner = new TestRunner();

	const options = {
		coverage: args.includes('--coverage'),
		failFast: args.includes('--fail-fast'),
		verbose: args.includes('--verbose')
	};

	if (options.verbose) {
		process.env.VERBOSE = 'true';
	}

	const categoryArg = args.find(arg => arg.startsWith('--category='));
	if (categoryArg) {
		const category = categoryArg.split('=')[1];
		runner.runCategory(category, options)
			.then(result => {
				process.exit(result.success ? 0 : 1);
			})
			.catch(error => {
				console.error('Test runner error:', error);
				process.exit(1);
			});
	} else {
		runner.runAllTests(options)
			.then(results => {
				const hasFailures = results.summary.failed > 0;
				process.exit(hasFailures ? 1 : 0);
			})
			.catch(error => {
				console.error('Test runner error:', error);
				process.exit(1);
			});
	}
}

export default TestRunner;

