/**
 * Global Jest Setup
 * 
 * This file runs once before all test suites to set up the global test environment.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function globalSetup() {
	console.log('🧪 Setting up comprehensive testing environment...');

	// Create test directories if they don't exist
	const testDirs = [
		'tests/temp',
		'tests/fixtures/temp',
		'tests/performance/results',
		'tests/security/reports',
		'tests/chaos/logs'
	];

	for (const dir of testDirs) {
		const fullPath = path.join(__dirname, '..', dir);
		if (!fs.existsSync(fullPath)) {
			fs.mkdirSync(fullPath, { recursive: true });
		}
	}

	// Set up test environment variables
	process.env.NODE_ENV = 'test';
	process.env.TASKMASTER_TEST_MODE = 'true';
	process.env.TASKMASTER_LOG_LEVEL = 'error';
	process.env.TASKMASTER_DISABLE_ANALYTICS = 'true';
	
	// Mock API keys for testing
	process.env.ANTHROPIC_API_KEY = 'test-mock-anthropic-key';
	process.env.OPENAI_API_KEY = 'test-mock-openai-key';
	process.env.PERPLEXITY_API_KEY = 'test-mock-perplexity-key';
	process.env.GOOGLE_API_KEY = 'test-mock-google-key';

	// Create test configuration file
	const testConfig = {
		testRun: {
			startTime: new Date().toISOString(),
			environment: 'test',
			nodeVersion: process.version,
			platform: process.platform
		}
	};

	fs.writeFileSync(
		path.join(__dirname, 'temp', 'test-config.json'),
		JSON.stringify(testConfig, null, 2)
	);

	console.log('✅ Global test setup completed');
}

