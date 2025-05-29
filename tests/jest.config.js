/**
 * @fileoverview Comprehensive Jest Configuration for Task Master Testing Framework
 * @description Unified configuration supporting unit, integration, database, infrastructure, and e2e tests
 */

export default {
  // Test environment
  testEnvironment: 'node',
  
  // Enable ES modules
  preset: null,
  extensionsToTreatAsEsm: ['.js'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  
  // Module paths and aliases
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    '^@fixtures/(.*)$': '<rootDir>/tests/fixtures/$1',
    '^@helpers/(.*)$': '<rootDir>/tests/helpers/$1'
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.js'
  ],
  
  // Test projects for different test types
  projects: [
    // Unit Tests
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      collectCoverageFrom: [
        'src/**/*.js',
        'scripts/**/*.js',
        'mcp-server/**/*.js',
        '!**/*.test.js',
        '!**/*.spec.js',
        '!**/node_modules/**',
        '!**/coverage/**'
      ],
      coverageThreshold: {
        global: {
          branches: 85,
          functions: 90,
          lines: 90,
          statements: 90
        }
      }
    },
    
    // Integration Tests
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      testEnvironment: 'node',
      setupFilesAfterEnv: [
        '<rootDir>/tests/setup.js',
        '<rootDir>/tests/helpers/integration-setup.js'
      ],
      testTimeout: 30000,
      collectCoverageFrom: [
        'src/**/*.js',
        'scripts/**/*.js',
        'mcp-server/**/*.js'
      ],
      coverageThreshold: {
        global: {
          branches: 80,
          functions: 85,
          lines: 85,
          statements: 85
        }
      }
    },
    
    // Database Tests
    {
      displayName: 'database',
      testMatch: ['<rootDir>/tests/database/**/*.test.js'],
      testEnvironment: 'node',
      setupFilesAfterEnv: [
        '<rootDir>/tests/setup.js',
        '<rootDir>/tests/helpers/database-setup.js'
      ],
      testTimeout: 60000,
      globalSetup: '<rootDir>/tests/helpers/database-global-setup.js',
      globalTeardown: '<rootDir>/tests/helpers/database-global-teardown.js',
      collectCoverageFrom: [
        'src/ai_cicd_system/database/**/*.js',
        '!**/migrations/**',
        '!**/fixtures/**'
      ],
      coverageThreshold: {
        global: {
          branches: 90,
          functions: 95,
          lines: 95,
          statements: 95
        }
      }
    },
    
    // Infrastructure Tests
    {
      displayName: 'infrastructure',
      testMatch: ['<rootDir>/tests/infrastructure/**/*.test.js'],
      testEnvironment: 'node',
      setupFilesAfterEnv: [
        '<rootDir>/tests/setup.js',
        '<rootDir>/tests/helpers/infrastructure-setup.js'
      ],
      testTimeout: 45000,
      globalSetup: '<rootDir>/tests/helpers/infrastructure-global-setup.js',
      globalTeardown: '<rootDir>/tests/helpers/infrastructure-global-teardown.js',
      collectCoverageFrom: [
        'infrastructure/**/*.js',
        '!**/node_modules/**'
      ],
      coverageThreshold: {
        global: {
          branches: 75,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    
    // End-to-End Tests
    {
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.js'],
      testEnvironment: 'node',
      setupFilesAfterEnv: [
        '<rootDir>/tests/setup.js',
        '<rootDir>/tests/helpers/e2e-setup.js'
      ],
      testTimeout: 120000,
      globalSetup: '<rootDir>/tests/helpers/e2e-global-setup.js',
      globalTeardown: '<rootDir>/tests/helpers/e2e-global-teardown.js',
      maxWorkers: 1, // Run e2e tests sequentially
      collectCoverageFrom: [
        'src/**/*.js',
        'scripts/**/*.js',
        'mcp-server/**/*.js',
        'infrastructure/**/*.js'
      ],
      coverageThreshold: {
        global: {
          branches: 70,
          functions: 75,
          lines: 75,
          statements: 75
        }
      }
    },
    
    // Performance Tests
    {
      displayName: 'performance',
      testMatch: ['<rootDir>/tests/performance/**/*.test.js'],
      testEnvironment: 'node',
      setupFilesAfterEnv: [
        '<rootDir>/tests/setup.js',
        '<rootDir>/tests/helpers/performance-setup.js'
      ],
      testTimeout: 300000, // 5 minutes for performance tests
      maxWorkers: 1, // Run performance tests sequentially
      collectCoverageFrom: [], // No coverage for performance tests
      reporters: [
        'default',
        ['<rootDir>/tests/helpers/performance-reporter.js', {}]
      ]
    }
  ],
  
  // Global configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json'
  ],
  
  // Coverage collection
  collectCoverageFrom: [
    'src/**/*.js',
    'scripts/**/*.js',
    'mcp-server/**/*.js',
    'infrastructure/**/*.js',
    '!**/*.test.js',
    '!**/*.spec.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/fixtures/**',
    '!**/helpers/**'
  ],
  
  // Global coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  
  // Test result processors
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '<rootDir>/test-results',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true
    }],
    ['jest-html-reporters', {
      publicPath: '<rootDir>/test-results',
      filename: 'test-report.html',
      expand: true,
      hideIcon: false,
      pageTitle: 'Task Master Test Report'
    }]
  ],
  
  // Error handling
  errorOnDeprecated: true,
  verbose: true,
  
  // Performance optimization
  maxWorkers: '50%',
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Module transformation
  transform: {
    '^.+\\.js$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', {
          targets: { node: 'current' },
          modules: false
        }]
      ]
    }]
  },
  
  // Module file extensions
  moduleFileExtensions: [
    'js',
    'json',
    'node'
  ],
  
  // Test environment options
  testEnvironmentOptions: {
    node: {
      // Node.js specific options
    }
  },
  
  // Watch mode configuration
  watchman: true,
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/test-results/',
    '<rootDir>/.jest-cache/'
  ],
  
  // Snapshot configuration
  snapshotSerializers: [],
  
  // Mock configuration
  clearMocks: true,
  resetMocks: false,
  restoreMocks: true,
  
  // Timing configuration
  slowTestThreshold: 5,
  
  // Notification configuration (for watch mode)
  notify: false,
  notifyMode: 'failure-change',
  
  // Bail configuration
  bail: 0, // Don't bail on first failure
  
  // Force exit configuration
  forceExit: false,
  detectOpenHandles: true,
  
  // Silent mode
  silent: false,
  
  // Custom matchers and utilities
  setupFiles: [
    '<rootDir>/tests/helpers/jest-environment-setup.js'
  ]
};

