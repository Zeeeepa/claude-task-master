export default {
	// Use Node.js environment for testing
	testEnvironment: 'node',

	// Automatically clear mock calls between every test
	clearMocks: true,

	// Indicates whether the coverage information should be collected while executing the test
	collectCoverage: false,

	// The directory where Jest should output its coverage files
	coverageDirectory: 'coverage',

	// A list of paths to directories that Jest should use to search for files in
	roots: ['<rootDir>/tests'],

	// The glob patterns Jest uses to detect test files
	testMatch: [
		'**/__tests__/**/*.js',
		'**/?(*.)+(spec|test).js',
		'**/tests/**/*.test.js',
		'**/tests/unit/**/*.js',
		'**/tests/integration/**/*.js',
		'**/tests/e2e/**/*.js',
		'**/tests/performance/**/*.js',
		'**/tests/security/**/*.js'
	],

	// Transform files
	transform: {},

	// Disable transformations for node_modules
	transformIgnorePatterns: ['/node_modules/'],

	// Set moduleNameMapper for absolute paths
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/$1'
	},

	// Setup module aliases
	moduleDirectories: ['node_modules', '<rootDir>'],

	// Configure test coverage thresholds
	coverageThreshold: {
		global: {
			branches: 95,
			functions: 95,
			lines: 95,
			statements: 95
		}
	},

	// Collect coverage from these files
	collectCoverageFrom: [
		'src/**/*.js',
		'scripts/**/*.js',
		'index.js',
		'!src/**/*.test.js',
		'!src/**/*.spec.js',
		'!src/**/examples/**',
		'!src/**/demo/**',
		'!**/node_modules/**',
		'!**/coverage/**',
		'!**/tests/**'
	],

	// Generate coverage report in these formats
	coverageReporters: ['text', 'lcov', 'html', 'json-summary'],

	// Verbose output
	verbose: true,

	// Setup file
	setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

	// Test timeout (5 minutes for comprehensive tests)
	testTimeout: 300000,

	// Maximum number of concurrent workers
	maxWorkers: '50%',

	// Fail tests on console errors/warnings in test environment
	silent: false,

	// Additional Jest configuration for comprehensive testing
	reporters: [
		'default',
		['jest-html-reporters', {
			publicPath: './tests/reports',
			filename: 'jest_report.html',
			expand: true
		}]
	],

	// Global setup and teardown
	globalSetup: '<rootDir>/tests/global-setup.js',
	globalTeardown: '<rootDir>/tests/global-teardown.js'
};
