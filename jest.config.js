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
		'**/tests/**/*.spec.js'
	],

	// Transform files
	transform: {},

	// Disable transformations for node_modules
	transformIgnorePatterns: ['/node_modules/'],

	// Set moduleNameMapper for absolute paths
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/$1',
		'^@src/(.*)$': '<rootDir>/src/$1',
		'^@scripts/(.*)$': '<rootDir>/scripts/$1',
		'^@tests/(.*)$': '<rootDir>/tests/$1'
	},

	// Setup module aliases
	moduleDirectories: ['node_modules', '<rootDir>'],

	// Configure test coverage thresholds - Enhanced for comprehensive testing
	coverageThreshold: {
		global: {
			branches: 90,
			functions: 90,
			lines: 90,
			statements: 90
		},
		// Specific thresholds for critical modules
		'./scripts/modules/': {
			branches: 95,
			functions: 95,
			lines: 95,
			statements: 95
		},
		'./src/': {
			branches: 85,
			functions: 85,
			lines: 85,
			statements: 85
		}
	},

	// Generate coverage report in these formats
	coverageReporters: ['text', 'lcov', 'html', 'json-summary'],

	// Collect coverage from these files
	collectCoverageFrom: [
		'scripts/**/*.js',
		'src/**/*.js',
		'mcp-server/**/*.js',
		'!**/node_modules/**',
		'!**/coverage/**',
		'!**/tests/**',
		'!**/*.test.js',
		'!**/*.spec.js',
		'!**/test-*.js'
	],

	// Verbose output
	verbose: true,

	// Setup file
	setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

	// Test timeout for long-running tests
	testTimeout: 30000,

	// Maximum number of concurrent workers
	maxWorkers: '50%',

	// Error handling
	errorOnDeprecated: true,

	// Test result processor for enhanced reporting
	reporters: [
		'default',
		['jest-html-reporters', {
			publicPath: './coverage/html-report',
			filename: 'test-report.html',
			expand: true
		}]
	],

	// Global test setup
	globalSetup: '<rootDir>/tests/global-setup.js',
	globalTeardown: '<rootDir>/tests/global-teardown.js'
};
