/**
 * @fileoverview NLP Processing Tests
 * @description Tests for natural language processing pipeline
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { NLPProcessor, NLPError } from '../../src/ai_cicd_system/core/nlp_processor.js';

describe('NLP Processing Pipeline', () => {
    let nlpProcessor;

    beforeEach(() => {
        nlpProcessor = new NLPProcessor({
            maxContextLength: 8000,
            enableSemanticAnalysis: true,
            enableIntentClassification: true,
            enableComplexityAnalysis: true
        });
    });

    afterEach(() => {
        // Cleanup if needed
    });

    describe('Task Processing', () => {
        test('should process simple task description', async () => {
            const taskDescription = 'Create a login form with username and password fields';
            const context = { repository: 'test/repo' };

            const result = await nlpProcessor.processTask(taskDescription, context);

            expect(result).toHaveProperty('id');
            expect(result).toHaveProperty('type');
            expect(result).toHaveProperty('originalDescription', taskDescription);
            expect(result).toHaveProperty('objectives');
            expect(result).toHaveProperty('requirements');
            expect(result).toHaveProperty('complexity');
            expect(result).toHaveProperty('context');
            expect(result.processedAt).toBeDefined();
        });

        test('should handle complex task descriptions', async () => {
            const taskDescription = `
                Implement a comprehensive user management system with the following features:
                - User registration with email verification
                - Secure login with JWT authentication
                - Password reset functionality
                - User profile management
                - Role-based access control
                - Audit logging for all user actions
                - Integration with external OAuth providers
                - Rate limiting for API endpoints
                - Comprehensive unit and integration tests
            `;

            const result = await nlpProcessor.processTask(taskDescription);

            expect(result.type).toBe('feature_development');
            expect(result.complexity.level).toBe('high');
            expect(result.objectives.length).toBeGreaterThan(0);
            expect(result.requirements.length).toBeGreaterThan(0);
        });

        test('should extract technologies from task description', async () => {
            const taskDescription = 'Build a React component using TypeScript and integrate it with a PostgreSQL database';

            const result = await nlpProcessor.processTask(taskDescription);

            expect(result.technologies).toContain('react');
            expect(result.technologies).toContain('typescript');
            expect(result.technologies).toContain('postgresql');
        });

        test('should handle empty or invalid input', async () => {
            await expect(nlpProcessor.processTask('')).rejects.toThrow(NLPError);
            await expect(nlpProcessor.processTask(null)).rejects.toThrow(NLPError);
            await expect(nlpProcessor.processTask(undefined)).rejects.toThrow(NLPError);
        });
    });

    describe('Intent Classification', () => {
        test('should classify feature development tasks', async () => {
            const testCases = [
                'Add a new user dashboard with analytics',
                'Implement shopping cart functionality',
                'Create a notification system',
                'Build a file upload feature',
                'Develop a search functionality'
            ];

            for (const description of testCases) {
                const result = await nlpProcessor.processTask(description);
                expect(result.type).toBe('feature_development');
            }
        });

        test('should classify bug fix tasks', async () => {
            const testCases = [
                'Fix the login bug that prevents users from signing in',
                'Resolve the memory leak in the data processing module',
                'Correct the calculation error in the payment system',
                'Debug the infinite loop in the user interface',
                'Repair the broken API endpoint'
            ];

            for (const description of testCases) {
                const result = await nlpProcessor.processTask(description);
                expect(result.type).toBe('bug_fix');
            }
        });

        test('should classify refactoring tasks', async () => {
            const testCases = [
                'Refactor the authentication module to improve performance',
                'Restructure the database schema for better normalization',
                'Optimize the search algorithm for faster results',
                'Reorganize the codebase to follow SOLID principles',
                'Clean up the legacy code in the payment module'
            ];

            for (const description of testCases) {
                const result = await nlpProcessor.processTask(description);
                expect(result.type).toBe('refactoring');
            }
        });

        test('should classify testing tasks', async () => {
            const testCases = [
                'Write unit tests for the user service',
                'Add integration tests for the API endpoints',
                'Create end-to-end tests for the checkout process',
                'Implement performance tests for the database queries',
                'Develop security tests for the authentication system'
            ];

            for (const description of testCases) {
                const result = await nlpProcessor.processTask(description);
                expect(result.type).toBe('testing');
            }
        });

        test('should handle mixed intent tasks', async () => {
            const description = 'Fix the login bug and add new authentication features';
            const result = await nlpProcessor.processTask(description);

            expect(result.type).toBe('bug_fix'); // Primary intent
            expect(result.subtype).toBe('feature_development'); // Secondary intent
            expect(result.confidence).toBeGreaterThan(0);
        });
    });

    describe('Complexity Analysis', () => {
        test('should identify low complexity tasks', async () => {
            const testCases = [
                'Fix a typo in the user interface',
                'Update the copyright year in the footer',
                'Change the button color to blue',
                'Add a simple validation message',
                'Update the README file'
            ];

            for (const description of testCases) {
                const result = await nlpProcessor.processTask(description);
                expect(result.complexity.level).toBe('low');
                expect(result.complexity.score).toBeLessThanOrEqual(3);
            }
        });

        test('should identify medium complexity tasks', async () => {
            const testCases = [
                'Implement user authentication with JWT',
                'Add pagination to the user list',
                'Create a REST API for product management',
                'Integrate with a third-party payment service',
                'Add email notifications for user actions'
            ];

            for (const description of testCases) {
                const result = await nlpProcessor.processTask(description);
                expect(result.complexity.level).toBe('medium');
                expect(result.complexity.score).toBeGreaterThan(3);
                expect(result.complexity.score).toBeLessThanOrEqual(6);
            }
        });

        test('should identify high complexity tasks', async () => {
            const testCases = [
                'Implement a distributed microservices architecture',
                'Build a real-time chat system with WebSocket support',
                'Create a machine learning recommendation engine',
                'Develop a blockchain-based voting system',
                'Implement a multi-tenant SaaS platform'
            ];

            for (const description of testCases) {
                const result = await nlpProcessor.processTask(description);
                expect(result.complexity.level).toBe('high');
                expect(result.complexity.score).toBeGreaterThan(6);
            }
        });

        test('should analyze complexity factors', async () => {
            const description = 'Implement a secure payment system with multiple databases, API integrations, and comprehensive testing';
            const result = await nlpProcessor.processTask(description);

            expect(result.complexity.factors).toContain('multiple_files');
            expect(result.complexity.factors).toContain('database_changes');
            expect(result.complexity.factors).toContain('api_integration');
            expect(result.complexity.factors).toContain('testing_required');
            expect(result.complexity.factors).toContain('security_sensitive');
        });

        test('should estimate effort based on complexity', async () => {
            const lowComplexityTask = 'Fix a simple typo';
            const highComplexityTask = 'Build a distributed system with microservices';

            const lowResult = await nlpProcessor.processTask(lowComplexityTask);
            const highResult = await nlpProcessor.processTask(highComplexityTask);

            expect(lowResult.complexity.estimatedEffort).toBeLessThan(highResult.complexity.estimatedEffort);
            expect(lowResult.complexity.estimatedEffort).toBeLessThanOrEqual(8); // Low complexity: ≤8 hours
            expect(highResult.complexity.estimatedEffort).toBeGreaterThanOrEqual(24); // High complexity: ≥24 hours
        });
    });

    describe('Objective Extraction', () => {
        test('should extract clear objectives from task description', async () => {
            const description = 'Implement user authentication, add password hashing, and create login validation';
            const result = await nlpProcessor.processTask(description);

            expect(result.objectives.length).toBeGreaterThan(0);
            expect(result.objectives.some(obj => obj.toLowerCase().includes('implement'))).toBe(true);
            expect(result.objectives.some(obj => obj.toLowerCase().includes('add'))).toBe(true);
            expect(result.objectives.some(obj => obj.toLowerCase().includes('create'))).toBe(true);
        });

        test('should handle implicit objectives', async () => {
            const description = 'The login system needs to be secure and fast';
            const result = await nlpProcessor.processTask(description);

            expect(result.objectives.length).toBeGreaterThan(0);
        });
    });

    describe('Requirements Extraction', () => {
        test('should extract functional requirements', async () => {
            const description = 'The system must support 1000 concurrent users and should respond within 200ms';
            const result = await nlpProcessor.processTask(description);

            expect(result.requirements.length).toBeGreaterThan(0);
            expect(result.requirements.some(req => req.toLowerCase().includes('must'))).toBe(true);
            expect(result.requirements.some(req => req.toLowerCase().includes('should'))).toBe(true);
        });

        test('should extract non-functional requirements', async () => {
            const description = 'Ensure the system is scalable, secure, and maintainable';
            const result = await nlpProcessor.processTask(description);

            expect(result.requirements.length).toBeGreaterThan(0);
            expect(result.requirements.some(req => req.toLowerCase().includes('ensure'))).toBe(true);
        });
    });

    describe('Constraint Identification', () => {
        test('should identify technical constraints', async () => {
            const description = 'Implement the feature but avoid breaking existing functionality and limit memory usage';
            const result = await nlpProcessor.processTask(description);

            expect(result.constraints.length).toBeGreaterThan(0);
            expect(result.constraints.some(constraint => constraint.toLowerCase().includes('avoid'))).toBe(true);
            expect(result.constraints.some(constraint => constraint.toLowerCase().includes('limit'))).toBe(true);
        });

        test('should handle time and budget constraints', async () => {
            const description = 'Complete the project within 2 weeks and cannot exceed the current budget';
            const result = await nlpProcessor.processTask(description);

            expect(result.constraints.length).toBeGreaterThan(0);
            expect(result.constraints.some(constraint => constraint.toLowerCase().includes('within'))).toBe(true);
            expect(result.constraints.some(constraint => constraint.toLowerCase().includes('cannot'))).toBe(true);
        });
    });

    describe('Technology Detection', () => {
        test('should detect programming languages', async () => {
            const testCases = [
                { description: 'Write a Python script for data processing', expected: ['python'] },
                { description: 'Create a JavaScript function for validation', expected: ['javascript'] },
                { description: 'Build a TypeScript application with React', expected: ['typescript', 'react'] },
                { description: 'Develop a Java microservice with Spring Boot', expected: ['java'] },
                { description: 'Implement a Go API server', expected: ['go'] }
            ];

            for (const testCase of testCases) {
                const result = await nlpProcessor.processTask(testCase.description);
                testCase.expected.forEach(tech => {
                    expect(result.technologies).toContain(tech);
                });
            }
        });

        test('should detect frameworks and libraries', async () => {
            const testCases = [
                { description: 'Build a React component with hooks', expected: ['react'] },
                { description: 'Create a Vue.js application', expected: ['vue'] },
                { description: 'Develop an Angular service', expected: ['angular'] },
                { description: 'Use Express.js for the backend', expected: ['express'] },
                { description: 'Implement with Node.js runtime', expected: ['node'] }
            ];

            for (const testCase of testCases) {
                const result = await nlpProcessor.processTask(testCase.description);
                testCase.expected.forEach(tech => {
                    expect(result.technologies).toContain(tech);
                });
            }
        });

        test('should detect databases and storage', async () => {
            const testCases = [
                { description: 'Store data in PostgreSQL database', expected: ['postgresql'] },
                { description: 'Use MySQL for persistence', expected: ['mysql'] },
                { description: 'Implement with MongoDB collections', expected: ['mongodb'] },
                { description: 'Cache data in Redis', expected: ['redis'] }
            ];

            for (const testCase of testCases) {
                const result = await nlpProcessor.processTask(testCase.description);
                testCase.expected.forEach(tech => {
                    expect(result.technologies).toContain(tech);
                });
            }
        });
    });

    describe('Best Practices Suggestion', () => {
        test('should suggest testing best practices', async () => {
            const description = 'Implement a new payment processing feature';
            const result = await nlpProcessor.processTask(description);

            expect(result.bestPractices.some(practice => 
                practice.toLowerCase().includes('test')
            )).toBe(true);
        });

        test('should suggest API best practices', async () => {
            const description = 'Create a REST API for user management';
            const result = await nlpProcessor.processTask(description);

            expect(result.bestPractices.some(practice => 
                practice.toLowerCase().includes('restful') || 
                practice.toLowerCase().includes('api')
            )).toBe(true);
        });

        test('should suggest database best practices', async () => {
            const description = 'Design a database schema for e-commerce';
            const result = await nlpProcessor.processTask(description);

            expect(result.bestPractices.some(practice => 
                practice.toLowerCase().includes('database') ||
                practice.toLowerCase().includes('migration')
            )).toBe(true);
        });
    });

    describe('Context Enrichment', () => {
        test('should enrich context with provided information', async () => {
            const description = 'Add user authentication';
            const context = {
                repository: 'test/repo',
                branch: 'feature/auth',
                existingFiles: ['src/user.js', 'src/auth.js'],
                dependencies: ['express', 'bcrypt', 'jsonwebtoken']
            };

            const result = await nlpProcessor.processTask(description, context);

            expect(result.context).toEqual(expect.objectContaining(context));
        });

        test('should handle missing context gracefully', async () => {
            const description = 'Add user authentication';
            const result = await nlpProcessor.processTask(description);

            expect(result.context).toBeDefined();
            expect(typeof result.context).toBe('object');
        });
    });

    describe('Prompt Generation', () => {
        test('should generate structured prompt from processed task', async () => {
            const description = 'Implement user registration with email validation';
            const result = await nlpProcessor.processTask(description);

            const promptData = await nlpProcessor.generatePrompt(result);

            expect(promptData).toHaveProperty('prompt');
            expect(promptData).toHaveProperty('metadata');
            expect(promptData.prompt).toContain(result.type.toUpperCase());
            expect(promptData.prompt).toContain(description);
            expect(promptData.metadata.taskType).toBe(result.type);
        });

        test('should include all required sections in prompt', async () => {
            const description = 'Create a secure API endpoint';
            const result = await nlpProcessor.processTask(description);

            const promptData = await nlpProcessor.generatePrompt(result);

            const requiredSections = ['Objective', 'Requirements', 'Output'];
            requiredSections.forEach(section => {
                expect(promptData.prompt).toContain(section);
            });
        });

        test('should optimize prompt length when necessary', async () => {
            const longDescription = 'A'.repeat(5000); // Very long description
            const result = await nlpProcessor.processTask(longDescription);

            const promptData = await nlpProcessor.generatePrompt(result, {
                maxLength: 1000
            });

            expect(promptData.prompt.length).toBeLessThanOrEqual(1000);
            expect(promptData.metadata.optimized).toBe(true);
        });
    });

    describe('Quality Validation', () => {
        test('should validate high-quality prompts', async () => {
            const description = 'Implement a comprehensive user authentication system with JWT tokens, password hashing, and email verification';
            const result = await nlpProcessor.processTask(description);
            const promptData = await nlpProcessor.generatePrompt(result);

            const validation = await nlpProcessor.validatePrompt(promptData);

            expect(validation.isValid).toBe(true);
            expect(validation.score).toBeGreaterThan(75);
            expect(validation.issues.length).toBe(0);
        });

        test('should identify quality issues in poor prompts', async () => {
            const description = 'Do something';
            const result = await nlpProcessor.processTask(description);
            const promptData = await nlpProcessor.generatePrompt(result);

            const validation = await nlpProcessor.validatePrompt(promptData);

            expect(validation.score).toBeLessThan(75);
            expect(validation.suggestions.length).toBeGreaterThan(0);
        });

        test('should provide improvement suggestions', async () => {
            const description = 'Fix bug';
            const result = await nlpProcessor.processTask(description);
            const promptData = await nlpProcessor.generatePrompt(result);

            const validation = await nlpProcessor.validatePrompt(promptData);

            expect(validation.suggestions.length).toBeGreaterThan(0);
            expect(validation.suggestions.some(suggestion => 
                suggestion.toLowerCase().includes('specific') ||
                suggestion.toLowerCase().includes('detail')
            )).toBe(true);
        });
    });

    describe('Error Handling', () => {
        test('should handle malformed input gracefully', async () => {
            const malformedInputs = [
                null,
                undefined,
                '',
                '   ',
                123,
                {},
                []
            ];

            for (const input of malformedInputs) {
                await expect(nlpProcessor.processTask(input)).rejects.toThrow(NLPError);
            }
        });

        test('should handle very long input', async () => {
            const veryLongDescription = 'A'.repeat(50000);
            
            // Should not throw an error, but should handle gracefully
            const result = await nlpProcessor.processTask(veryLongDescription);
            expect(result).toBeDefined();
            expect(result.originalDescription).toBe(veryLongDescription);
        });

        test('should handle special characters and encoding', async () => {
            const specialCharDescription = 'Implement 用户认证 with émojis 🔐 and special chars: @#$%^&*()';
            
            const result = await nlpProcessor.processTask(specialCharDescription);
            expect(result).toBeDefined();
            expect(result.originalDescription).toBe(specialCharDescription);
        });
    });

    describe('Performance', () => {
        test('should process tasks within acceptable time limits', async () => {
            const description = 'Implement a standard user authentication system';
            
            const startTime = Date.now();
            const result = await nlpProcessor.processTask(description);
            const endTime = Date.now();

            expect(result).toBeDefined();
            expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
        });

        test('should handle concurrent processing', async () => {
            const descriptions = [
                'Implement user authentication',
                'Create a payment system',
                'Build a notification service',
                'Develop a search feature',
                'Add file upload functionality'
            ];

            const promises = descriptions.map(desc => nlpProcessor.processTask(desc));
            const results = await Promise.all(promises);

            expect(results).toHaveLength(5);
            results.forEach(result => {
                expect(result).toBeDefined();
                expect(result.type).toBeDefined();
            });
        });
    });
});

