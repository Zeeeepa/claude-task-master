/**
 * Example implementations and mock data for the requirement analyzer
 * Provides realistic examples for testing and demonstration
 */

import { 
    RequirementAnalyzer, 
    ParsedRequirement, 
    AtomicTask, 
    analyzeRequirement 
} from './index.js';

/**
 * Sample requirement texts for testing
 */
export const sampleRequirements = {
    simple: `
        Create a user authentication system that allows users to register, login, and logout.
        The system should validate email addresses and enforce strong password requirements.
        Users should be able to reset their passwords via email.
    `,
    
    complex: `
        # E-commerce Product Catalog System

        Implement a comprehensive product catalog system for an e-commerce platform with the following requirements:

        ## Core Features
        - Product management with categories, subcategories, and tags
        - Advanced search and filtering capabilities
        - Product recommendations based on user behavior
        - Inventory management with real-time stock updates
        - Multi-language and multi-currency support

        ## Technical Requirements
        - RESTful API endpoints for all operations
        - Database schema with proper indexing for performance
        - Caching layer for frequently accessed data
        - Integration with external payment gateways
        - Real-time notifications for inventory changes

        ## Business Requirements
        - Support for bulk product imports/exports
        - Admin dashboard for product management
        - Customer reviews and ratings system
        - Promotional pricing and discount management
        - Analytics and reporting capabilities

        ## Acceptance Criteria
        - System must handle 10,000+ concurrent users
        - Search results must return within 200ms
        - 99.9% uptime requirement
        - GDPR compliance for user data
        - Mobile-responsive design
    `,
    
    workflow: `
        Implement an automated CI/CD pipeline for the development team:

        1. Code commit triggers automated testing
        2. Successful tests trigger security scanning
        3. Security approval triggers staging deployment
        4. Manual approval triggers production deployment
        5. Post-deployment monitoring and alerting

        The system must integrate with GitHub, Docker, and AWS.
        Include rollback capabilities and deployment notifications.
    `,
    
    bugfix: `
        Fix the memory leak in the user session management system.
        
        Issue: Users report that the application becomes slow after extended use.
        Investigation shows that user sessions are not being properly cleaned up,
        causing memory usage to continuously increase.
        
        Requirements:
        - Implement proper session cleanup
        - Add session timeout functionality
        - Monitor memory usage
        - Add logging for debugging
        - Ensure no data loss during cleanup
    `,
    
    integration: `
        Integrate the existing CRM system with the new marketing automation platform.
        
        The integration should:
        - Sync customer data bidirectionally
        - Trigger marketing campaigns based on CRM events
        - Track campaign effectiveness in CRM
        - Handle data conflicts and duplicates
        - Provide real-time synchronization
        - Include error handling and retry mechanisms
        - Support bulk data migration
        - Maintain data consistency across systems
    `
};

/**
 * Mock analysis results for demonstration
 */
export const mockAnalysisResults = {
    simple: {
        requirement: new ParsedRequirement({
            id: 'req_simple_auth',
            title: 'User Authentication System',
            description: 'Create a user authentication system with registration, login, logout, and password reset functionality',
            originalText: sampleRequirements.simple,
            technicalSpecs: [
                'Email validation',
                'Password strength requirements',
                'Password reset via email'
            ],
            businessRequirements: [
                'User registration capability',
                'Secure login/logout functionality',
                'Password recovery mechanism'
            ],
            acceptanceCriteria: [
                'Users can register with valid email',
                'Users can login with correct credentials',
                'Users can reset password via email',
                'Invalid attempts are properly handled'
            ],
            estimatedComplexity: 4,
            priority: 'high',
            tags: ['authentication', 'security', 'user-management']
        }),
        
        tasks: [
            new AtomicTask({
                id: 'req_simple_auth_task_1',
                title: 'Implement User Registration',
                description: 'Create user registration functionality with email validation and password requirements',
                requirements: [
                    'Email validation',
                    'Password strength validation',
                    'User data storage'
                ],
                acceptanceCriteria: [
                    'User can register with valid email and strong password',
                    'Duplicate email registration is prevented',
                    'Invalid data is rejected with appropriate error messages'
                ],
                affectedFiles: [
                    'src/auth/registration.js',
                    'src/models/user.js',
                    'src/validators/email.js',
                    'src/validators/password.js'
                ],
                complexityScore: 3,
                dependencies: [],
                priority: 'high',
                tags: ['authentication', 'registration', 'validation'],
                implementationNotes: 'Use bcrypt for password hashing, implement email uniqueness check',
                testStrategy: 'Unit tests for validation, integration tests for registration flow'
            }),
            
            new AtomicTask({
                id: 'req_simple_auth_task_2',
                title: 'Implement User Login/Logout',
                description: 'Create secure login and logout functionality with session management',
                requirements: [
                    'Credential verification',
                    'Session management',
                    'Secure logout'
                ],
                acceptanceCriteria: [
                    'User can login with correct credentials',
                    'Invalid credentials are rejected',
                    'User session is properly managed',
                    'Logout clears session data'
                ],
                affectedFiles: [
                    'src/auth/login.js',
                    'src/auth/logout.js',
                    'src/middleware/auth.js',
                    'src/utils/session.js'
                ],
                complexityScore: 3,
                dependencies: ['req_simple_auth_task_1'],
                priority: 'high',
                tags: ['authentication', 'login', 'session'],
                implementationNotes: 'Use JWT tokens or secure sessions, implement rate limiting',
                testStrategy: 'Test valid/invalid login attempts, session persistence, logout functionality'
            }),
            
            new AtomicTask({
                id: 'req_simple_auth_task_3',
                title: 'Implement Password Reset',
                description: 'Create password reset functionality via email with secure token generation',
                requirements: [
                    'Password reset token generation',
                    'Email sending capability',
                    'Token validation and expiration',
                    'Password update functionality'
                ],
                acceptanceCriteria: [
                    'User can request password reset via email',
                    'Reset email contains secure token',
                    'Token expires after reasonable time',
                    'User can set new password with valid token'
                ],
                affectedFiles: [
                    'src/auth/password-reset.js',
                    'src/utils/email.js',
                    'src/utils/token.js',
                    'src/models/reset-token.js'
                ],
                complexityScore: 4,
                dependencies: ['req_simple_auth_task_1'],
                priority: 'medium',
                tags: ['authentication', 'password-reset', 'email'],
                implementationNotes: 'Use crypto-secure token generation, implement email templates',
                testStrategy: 'Test token generation, email sending, token validation, password update'
            })
        ]
    }
};

/**
 * Example usage demonstrations
 */
export const examples = {
    /**
     * Basic requirement analysis example
     */
    async basicAnalysis() {
        console.log('=== Basic Requirement Analysis Example ===\n');
        
        const analyzer = new RequirementAnalyzer();
        const requirement = await analyzer.parseRequirements(sampleRequirements.simple);
        
        console.log('Parsed Requirement:');
        console.log(`- ID: ${requirement.id}`);
        console.log(`- Title: ${requirement.title}`);
        console.log(`- Complexity: ${requirement.estimatedComplexity}/10`);
        console.log(`- Priority: ${requirement.priority}`);
        console.log(`- Tags: ${requirement.tags.join(', ')}`);
        console.log(`- Technical Specs: ${requirement.technicalSpecs.length}`);
        console.log(`- Business Requirements: ${requirement.businessRequirements.length}`);
        console.log(`- Acceptance Criteria: ${requirement.acceptanceCriteria.length}\n`);
        
        return requirement;
    },
    
    /**
     * Task decomposition example
     */
    async taskDecomposition() {
        console.log('=== Task Decomposition Example ===\n');
        
        const analyzer = new RequirementAnalyzer();
        const requirement = await analyzer.parseRequirements(sampleRequirements.complex);
        const tasks = await analyzer.decomposeTask(requirement);
        
        console.log(`Decomposed into ${tasks.length} atomic tasks:\n`);
        
        tasks.forEach((task, index) => {
            console.log(`${index + 1}. ${task.title}`);
            console.log(`   Complexity: ${task.complexityScore}/10`);
            console.log(`   Dependencies: ${task.dependencies.length}`);
            console.log(`   Affected Files: ${task.affectedFiles.length}`);
            console.log(`   Tags: ${task.tags.join(', ')}\n`);
        });
        
        return tasks;
    },
    
    /**
     * Dependency analysis example
     */
    async dependencyAnalysis() {
        console.log('=== Dependency Analysis Example ===\n');
        
        const analyzer = new RequirementAnalyzer();
        const requirement = await analyzer.parseRequirements(sampleRequirements.workflow);
        const tasks = await analyzer.decomposeTask(requirement);
        const dependencyGraph = await analyzer.analyzeDependencies(tasks);
        
        console.log('Dependency Analysis:');
        console.log(`- Total tasks: ${dependencyGraph.nodes.size}`);
        console.log(`- Total dependencies: ${dependencyGraph.edges.size}`);
        
        const cycles = dependencyGraph.detectCircularDependencies();
        console.log(`- Circular dependencies: ${cycles.length}`);
        
        if (cycles.length > 0) {
            console.log('Detected cycles:');
            cycles.forEach(cycle => {
                console.log(`  ${cycle.join(' -> ')}`);
            });
        }
        
        try {
            const topologicalOrder = dependencyGraph.getTopologicalOrder();
            console.log('\nExecution order:');
            topologicalOrder.forEach((task, index) => {
                console.log(`${index + 1}. ${task.title}`);
            });
        } catch (error) {
            console.log(`Cannot determine execution order: ${error.message}`);
        }
        
        console.log();
        return dependencyGraph;
    },
    
    /**
     * Complete analysis workflow example
     */
    async completeWorkflow() {
        console.log('=== Complete Analysis Workflow Example ===\n');
        
        const result = await analyzeRequirement(sampleRequirements.complex, {
            enableDependencyAnalysis: true,
            enableComplexityEstimation: true,
            maxTasksPerRequirement: 15
        });
        
        console.log('Complete Analysis Results:');
        console.log(`- Requirement: ${result.requirement.title}`);
        console.log(`- Total Tasks: ${result.summary.totalTasks}`);
        console.log(`- Average Complexity: ${result.summary.averageComplexity.toFixed(2)}`);
        console.log(`- High Complexity Tasks: ${result.summary.highComplexityTasks}`);
        console.log(`- Dependencies: ${result.summary.dependencyCount}`);
        console.log(`- Valid Tasks: ${result.summary.validTasks}/${result.summary.totalTasks}`);
        
        console.log('\nCodegen Prompts Generated:');
        result.codegenPrompts.forEach((prompt, index) => {
            console.log(`${index + 1}. ${prompt.title} (Complexity: ${prompt.estimatedComplexity})`);
        });
        
        console.log('\nValidation Issues:');
        result.validationResults.forEach((validation, index) => {
            if (!validation.isValid || validation.warnings.length > 0) {
                console.log(`Task ${index + 1}: ${result.tasks[index].title}`);
                if (validation.errors.length > 0) {
                    console.log(`  Errors: ${validation.errors.join(', ')}`);
                }
                if (validation.warnings.length > 0) {
                    console.log(`  Warnings: ${validation.warnings.join(', ')}`);
                }
            }
        });
        
        console.log();
        return result;
    },
    
    /**
     * Batch processing example
     */
    async batchProcessing() {
        console.log('=== Batch Processing Example ===\n');
        
        const requirements = [
            sampleRequirements.simple,
            sampleRequirements.bugfix,
            sampleRequirements.integration
        ];
        
        const results = [];
        for (const req of requirements) {
            try {
                const result = await analyzeRequirement(req);
                results.push(result);
                console.log(`✓ Analyzed: ${result.requirement.title}`);
            } catch (error) {
                console.log(`✗ Failed to analyze requirement: ${error.message}`);
            }
        }
        
        console.log(`\nBatch Results: ${results.length}/${requirements.length} successful\n`);
        
        // Summary statistics
        const totalTasks = results.reduce((sum, result) => sum + result.summary.totalTasks, 0);
        const avgComplexity = results.reduce((sum, result) => sum + result.summary.averageComplexity, 0) / results.length;
        
        console.log('Batch Summary:');
        console.log(`- Total Tasks Generated: ${totalTasks}`);
        console.log(`- Average Complexity: ${avgComplexity.toFixed(2)}`);
        console.log(`- Requirements by Type:`);
        
        const typeCount = {};
        results.forEach(result => {
            const type = result.requirement.metadata?.nlpAnalysis?.requirementType || 'unknown';
            typeCount[type] = (typeCount[type] || 0) + 1;
        });
        
        Object.entries(typeCount).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });
        
        console.log();
        return results;
    }
};

/**
 * Run all examples
 */
export async function runAllExamples() {
    console.log('🚀 Running Requirement Analyzer Examples\n');
    console.log('=' .repeat(60) + '\n');
    
    try {
        await examples.basicAnalysis();
        await examples.taskDecomposition();
        await examples.dependencyAnalysis();
        await examples.completeWorkflow();
        await examples.batchProcessing();
        
        console.log('✅ All examples completed successfully!');
    } catch (error) {
        console.error('❌ Example execution failed:', error.message);
        throw error;
    }
}

/**
 * Performance testing example
 */
export async function performanceTest() {
    console.log('=== Performance Test ===\n');
    
    const startTime = Date.now();
    const iterations = 10;
    
    console.log(`Running ${iterations} iterations of requirement analysis...`);
    
    for (let i = 0; i < iterations; i++) {
        await analyzeRequirement(sampleRequirements.complex);
        process.stdout.write('.');
    }
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;
    
    console.log(`\n\nPerformance Results:`);
    console.log(`- Total time: ${totalTime}ms`);
    console.log(`- Average time per analysis: ${avgTime.toFixed(2)}ms`);
    console.log(`- Throughput: ${(1000 / avgTime).toFixed(2)} analyses/second\n`);
}

// Export default for easy importing
export default {
    sampleRequirements,
    mockAnalysisResults,
    examples,
    runAllExamples,
    performanceTest
};

