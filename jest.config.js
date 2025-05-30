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
	testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],

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

	// Configure test coverage thresholds - Updated to meet Phase 6 requirements
	coverageThreshold: {
		global: {
			branches: 90,
			functions: 90,
			lines: 90,
			statements: 90
		}
	},

	// Collect coverage from these files
	collectCoverageFrom: [
		'src/**/*.js',
		'!src/**/*.test.js',
		'!src/config/**',
		'!src/**/__tests__/**',
		'!src/**/node_modules/**'
	],

	// Generate coverage report in these formats
	coverageReporters: ['text', 'lcov', 'html', 'json'],

	// Verbose output
	verbose: true,

	// Setup file
	setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

	// Test timeout
	testTimeout: 30000,

	// Maximum number of concurrent workers
	maxWorkers: '50%',

	// Test environment options
	testEnvironmentOptions: {
		node: {
			experimental: {
				vm: true
			}
		}
	}
};

