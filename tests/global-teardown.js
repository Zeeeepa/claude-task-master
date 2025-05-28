/**
 * Global Jest Teardown
 * 
 * This file runs once after all test suites to clean up the global test environment.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function globalTeardown() {
	console.log('🧹 Cleaning up test environment...');

	// Clean up temporary test files
	const tempDir = path.join(__dirname, 'temp');
	if (fs.existsSync(tempDir)) {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch (error) {
			console.warn('Warning: Could not clean up temp directory:', error.message);
		}
	}

	// Generate test summary
	const summaryPath = path.join(__dirname, '..', 'coverage', 'test-summary.json');
	const summary = {
		completedAt: new Date().toISOString(),
		environment: process.env.NODE_ENV,
		testMode: process.env.TASKMASTER_TEST_MODE
	};

	try {
		const coverageDir = path.dirname(summaryPath);
		if (!fs.existsSync(coverageDir)) {
			fs.mkdirSync(coverageDir, { recursive: true });
		}
		fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
	} catch (error) {
		console.warn('Warning: Could not write test summary:', error.message);
	}

	console.log('✅ Global test teardown completed');
}

