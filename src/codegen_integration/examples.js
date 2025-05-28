/**
 * @fileoverview Example usage and mock implementations for codegen integration
 * Provides sample code and mock data for testing and development
 */

import { 
    createCompleteIntegration, 
    createMinimalIntegration,
    TASK_TYPES,
    CODEGEN_STATUS,
    PR_STATUS 
} from './index.js';

/**
 * Example atomic task for testing
 */
export const EXAMPLE_IMPLEMENTATION_TASK = {
    id: 'task_001',
    title: 'Implement user authentication system',
    description: 'Create a secure user authentication system with JWT tokens, password hashing, and session management.',
    type: TASK_TYPES.IMPLEMENTATION,
    requirements: [
        'Use bcrypt for password hashing',
        'Implement JWT token generation and validation',
        'Add rate limiting for login attempts',
        'Include password strength validation',
        'Support user registration and login endpoints'
    ],
    acceptance_criteria: [
        'Users can register with email and password',
        'Users can login with valid credentials',
        'Invalid login attempts are rate limited',
        'JWT tokens expire after 24 hours',
        'Passwords are securely hashed and stored',
        'All endpoints return appropriate HTTP status codes'
    ],
    affected_files: [
        'src/auth/auth.controller.js',
        'src/auth/auth.service.js',
        'src/auth/auth.middleware.js',
        'src/models/user.model.js',
        'tests/auth.test.js'
    ],
    priority: 4,
    status: 'pending',
    metadata: {
        notes: 'This is a critical security feature',
        validation_requirements: [
            'Security review required',
            'Performance testing needed',
            'Integration tests must pass'
        ]
    }
};

/**
 * Example bug fix task
 */
export const EXAMPLE_BUG_FIX_TASK = {
    id: 'task_002',
    title: 'Fix memory leak in data processing pipeline',
    description: 'Memory usage continuously increases during large data processing operations, eventually causing application crashes.',
    type: TASK_TYPES.BUG_FIX,
    requirements: [
        'Identify the source of the memory leak',
        'Fix the leak without breaking existing functionality',
        'Add monitoring to prevent future leaks',
        'Optimize memory usage where possible'
    ],
    acceptance_criteria: [
        'Memory usage remains stable during large operations',
        'No regression in processing performance',
        'Memory monitoring alerts are in place',
        'All existing tests continue to pass'
    ],
    affected_files: [
        'src/processing/data-processor.js',
        'src/processing/memory-manager.js',
        'tests/processing.test.js'
    ],
    priority: 5,
    status: 'pending',
    metadata: {
        severity: 'high',
        reproduction_steps: [
            'Start data processing with large dataset (>1GB)',
            'Monitor memory usage over time',
            'Observe continuous memory growth',
            'Application crashes after ~2 hours'
        ],
        error_details: 'OutOfMemoryError: Java heap space'
    }
};

/**
 * Example task context
 */
export const EXAMPLE_TASK_CONTEXT = {
    project_name: 'TaskMaster API',
    repository_url: 'https://github.com/example/taskmaster-api',
    base_branch: 'main',
    codebase_context: {
        language: 'JavaScript',
        framework: 'Node.js with Express',
        key_files: [
            'src/app.js',
            'src/config/database.js',
            'src/middleware/auth.js',
            'package.json'
        ],
        file_structure: {
            'src/': {
                'controllers/': 'API route handlers',
                'services/': 'Business logic',
                'models/': 'Database models',
                'middleware/': 'Express middleware',
                'utils/': 'Utility functions'
            },
            'tests/': 'Test files',
            'docs/': 'Documentation'
        },
        coding_standards: [
            'Use ESLint with Airbnb config',
            'Follow JSDoc commenting standards',
            'Use async/await for asynchronous operations',
            'Implement proper error handling',
            'Write unit tests for all new functions'
        ],
        test_patterns: [
            'Use Jest for unit testing',
            'Use Supertest for API testing',
            'Maintain >80% code coverage',
            'Mock external dependencies'
        ]
    },
    dependencies: [
        'express',
        'mongoose',
        'jsonwebtoken',
        'bcrypt',
        'joi'
    ],
    environment: {
        node_version: '18.x',
        database: 'MongoDB',
        deployment: 'Docker containers'
    }
};

/**
 * Example usage: Basic prompt generation
 */
export async function exampleBasicPromptGeneration() {
    console.log('=== Basic Prompt Generation Example ===');
    
    const integration = createMinimalIntegration();
    
    try {
        const prompt = integration.generatePrompt(EXAMPLE_IMPLEMENTATION_TASK, EXAMPLE_TASK_CONTEXT);
        
        console.log('Generated prompt:');
        console.log('Task ID:', prompt.task_id);
        console.log('Task Type:', prompt.task_type);
        console.log('Estimated Complexity:', prompt.metadata.estimated_complexity);
        console.log('Content Length:', prompt.content.length);
        console.log('\nFirst 500 characters of prompt:');
        console.log(prompt.content.substring(0, 500) + '...');
        
        return prompt;
    } catch (error) {
        console.error('Failed to generate prompt:', error);
        throw error;
    }
}

/**
 * Example usage: Complete workflow
 */
export async function exampleCompleteWorkflow() {
    console.log('\n=== Complete Workflow Example ===');
    
    const integration = createCompleteIntegration();
    
    try {
        console.log('Processing task:', EXAMPLE_IMPLEMENTATION_TASK.id);
        
        const result = await integration.processTask(EXAMPLE_IMPLEMENTATION_TASK, EXAMPLE_TASK_CONTEXT);
        
        console.log('Workflow completed:');
        console.log('Workflow ID:', result.workflow_id);
        console.log('Status:', result.status);
        
        if (result.pr_info) {
            console.log('PR Created:');
            console.log('- URL:', result.pr_info.pr_url);
            console.log('- Number:', result.pr_info.pr_number);
            console.log('- Branch:', result.pr_info.branch_name);
        }
        
        if (result.error_message) {
            console.log('Error:', result.error_message);
        }
        
        return result;
    } catch (error) {
        console.error('Workflow failed:', error);
        throw error;
    }
}

/**
 * Example usage: PR tracking
 */
export async function examplePRTracking() {
    console.log('\n=== PR Tracking Example ===');
    
    const integration = createCompleteIntegration();
    
    try {
        // Simulate PR creation
        const mockPRInfo = {
            pr_url: 'https://github.com/example/repo/pull/123',
            pr_number: 123,
            branch_name: 'feature/auth-system',
            title: 'Implement user authentication system',
            description: 'Adds JWT-based authentication with bcrypt password hashing',
            modified_files: ['src/auth/auth.controller.js', 'src/auth/auth.service.js'],
            status: PR_STATUS.OPEN
        };
        
        await integration.trackPRCreation(EXAMPLE_IMPLEMENTATION_TASK.id, mockPRInfo);
        console.log('PR tracked successfully');
        
        // Get PR status
        const prStatus = await integration.getPRStatus(EXAMPLE_IMPLEMENTATION_TASK.id);
        console.log('PR Status:', prStatus);
        
        // Simulate check results
        if (integration.prTracker) {
            await integration.prTracker.addCheckResult(mockPRInfo.pr_url, {
                name: 'CI/CD Pipeline',
                status: 'completed',
                conclusion: 'success',
                details_url: 'https://github.com/example/repo/actions/runs/123'
            });
            
            await integration.prTracker.addCheckResult(mockPRInfo.pr_url, {
                name: 'Code Quality',
                status: 'completed',
                conclusion: 'success',
                details_url: 'https://sonarcloud.io/project/overview?id=example_repo'
            });
            
            console.log('Check results added');
            
            // Get updated status
            const updatedStatus = await integration.getPRStatus(EXAMPLE_IMPLEMENTATION_TASK.id);
            console.log('Updated PR Status:', updatedStatus);
        }
        
        return prStatus;
    } catch (error) {
        console.error('PR tracking failed:', error);
        throw error;
    }
}

/**
 * Example usage: Error handling and retries
 */
export async function exampleErrorHandling() {
    console.log('\n=== Error Handling Example ===');
    
    const integration = createCompleteIntegration();
    
    try {
        // Create a task that might fail
        const problematicTask = {
            ...EXAMPLE_BUG_FIX_TASK,
            id: 'task_error_test',
            description: 'This task is designed to test error handling'
        };
        
        console.log('Processing potentially problematic task...');
        
        const result = await integration.processTask(problematicTask, EXAMPLE_TASK_CONTEXT);
        
        if (result.status === CODEGEN_STATUS.FAILED) {
            console.log('Task failed as expected, attempting retry...');
            
            try {
                const retryResult = await integration.retryFailedRequest(problematicTask.id);
                console.log('Retry result:', retryResult.status);
                return retryResult;
            } catch (retryError) {
                console.log('Retry also failed:', retryError.message);
                return result;
            }
        } else {
            console.log('Task succeeded unexpectedly');
            return result;
        }
    } catch (error) {
        console.error('Error handling example failed:', error);
        throw error;
    }
}

/**
 * Example usage: Statistics and monitoring
 */
export async function exampleStatistics() {
    console.log('\n=== Statistics Example ===');
    
    const integration = createCompleteIntegration();
    
    try {
        // Process a few tasks to generate statistics
        await integration.processTask(EXAMPLE_IMPLEMENTATION_TASK, EXAMPLE_TASK_CONTEXT);
        await integration.processTask(EXAMPLE_BUG_FIX_TASK, EXAMPLE_TASK_CONTEXT);
        
        const stats = await integration.getStatistics();
        
        console.log('Integration Statistics:');
        console.log('- Active Requests:', stats.active_requests);
        console.log('- Completed Requests:', stats.completed_requests);
        console.log('- Success Rate:', stats.success_rate.toFixed(2) + '%');
        
        if (stats.pr_stats) {
            console.log('\nPR Statistics:');
            console.log('- Total PRs:', stats.pr_stats.total);
            console.log('- Open PRs:', stats.pr_stats.by_status.open || 0);
            console.log('- Merged PRs:', stats.pr_stats.by_status.merged || 0);
            console.log('- Success Rate:', stats.pr_stats.success_rate.toFixed(2) + '%');
        }
        
        return stats;
    } catch (error) {
        console.error('Statistics example failed:', error);
        throw error;
    }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
    console.log('🚀 Running Codegen Integration Examples\n');
    
    try {
        await exampleBasicPromptGeneration();
        await exampleCompleteWorkflow();
        await examplePRTracking();
        await exampleErrorHandling();
        await exampleStatistics();
        
        console.log('\n✅ All examples completed successfully!');
    } catch (error) {
        console.error('\n❌ Examples failed:', error);
        throw error;
    }
}

/**
 * Mock data generators for testing
 */
export const MockDataGenerators = {
    /**
     * Generate a mock atomic task
     */
    createMockTask(overrides = {}) {
        return {
            id: `task_${Date.now()}`,
            title: 'Mock Task',
            description: 'This is a mock task for testing purposes',
            type: TASK_TYPES.IMPLEMENTATION,
            requirements: ['Requirement 1', 'Requirement 2'],
            acceptance_criteria: ['Criteria 1', 'Criteria 2'],
            affected_files: ['src/mock.js', 'tests/mock.test.js'],
            priority: 3,
            status: 'pending',
            metadata: {},
            ...overrides
        };
    },

    /**
     * Generate mock task context
     */
    createMockContext(overrides = {}) {
        return {
            project_name: 'Mock Project',
            repository_url: 'https://github.com/mock/repo',
            base_branch: 'main',
            codebase_context: {
                language: 'JavaScript',
                framework: 'Node.js',
                key_files: ['src/app.js'],
                coding_standards: ['Use ESLint'],
                test_patterns: ['Use Jest']
            },
            dependencies: ['express'],
            environment: { node_version: '18.x' },
            ...overrides
        };
    },

    /**
     * Generate mock PR info
     */
    createMockPRInfo(overrides = {}) {
        const prNumber = Math.floor(Math.random() * 1000) + 1;
        return {
            pr_url: `https://github.com/mock/repo/pull/${prNumber}`,
            pr_number: prNumber,
            branch_name: `feature/mock-${Date.now()}`,
            title: 'Mock PR',
            description: 'This is a mock PR for testing',
            modified_files: ['src/mock.js'],
            status: PR_STATUS.OPEN,
            ...overrides
        };
    }
};

export default {
    EXAMPLE_IMPLEMENTATION_TASK,
    EXAMPLE_BUG_FIX_TASK,
    EXAMPLE_TASK_CONTEXT,
    exampleBasicPromptGeneration,
    exampleCompleteWorkflow,
    examplePRTracking,
    exampleErrorHandling,
    exampleStatistics,
    runAllExamples,
    MockDataGenerators
};

