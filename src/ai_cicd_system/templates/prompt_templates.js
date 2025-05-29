/**
 * @fileoverview Prompt Templates
 * @description Reusable prompt templates for different task types and scenarios
 */

/**
 * Prompt template collection for various task types
 */
export const PromptTemplates = {
    /**
     * Default template for general tasks
     */
    default: {
        name: 'default',
        version: '1.0',
        description: 'General purpose template for any task type',
        requiredSections: ['# Task', '## Objective', '## Requirements', '## Output'],
        template: `# Task: {{TASK_TYPE}}

## Objective
{{OBJECTIVES}}

## Task Description
{{TASK_DESCRIPTION}}

## Requirements
{{REQUIREMENTS}}

## Constraints
{{CONSTRAINTS}}

## Context
{{CONTEXT}}

## Technologies
{{TECHNOLOGIES}}

## Best Practices
{{BEST_PRACTICES}}

## Expected Output
{{DELIVERABLES}}

Please implement this task following the requirements and best practices outlined above. Ensure the solution is production-ready, well-tested, and properly documented.`
    },

    /**
     * Feature development template
     */
    feature_development: {
        name: 'feature_development',
        version: '1.0',
        description: 'Template for new feature development tasks',
        requiredSections: ['# Feature Development', '## Objective', '## Requirements', '## Implementation'],
        template: `# Feature Development: {{TASK_TYPE}}

## Objective
{{OBJECTIVES}}

## Feature Description
{{TASK_DESCRIPTION}}

## Functional Requirements
{{REQUIREMENTS}}

## Technical Constraints
{{CONSTRAINTS}}

## Implementation Context
{{CONTEXT}}

## Technology Stack
{{TECHNOLOGIES}}

## Development Best Practices
{{BEST_PRACTICES}}

## Implementation Requirements
- Create clean, maintainable code
- Include comprehensive unit tests
- Follow existing code patterns and conventions
- Add proper error handling and validation
- Update documentation as needed

## Deliverables
{{DELIVERABLES}}

## Quality Standards
- Code coverage > 80%
- All tests passing
- No linting errors
- Performance considerations addressed
- Security best practices followed

Please implement this feature with production-quality code and comprehensive testing.`
    },

    /**
     * Bug fix template
     */
    bug_fix: {
        name: 'bug_fix',
        version: '1.0',
        description: 'Template for bug fixing tasks',
        requiredSections: ['# Bug Fix', '## Problem', '## Solution', '## Testing'],
        template: `# Bug Fix: {{TASK_TYPE}}

## Problem Description
{{TASK_DESCRIPTION}}

## Root Cause Analysis
{{OBJECTIVES}}

## Requirements for Fix
{{REQUIREMENTS}}

## Constraints and Limitations
{{CONSTRAINTS}}

## Context and Environment
{{CONTEXT}}

## Technologies Involved
{{TECHNOLOGIES}}

## Fix Implementation Guidelines
{{BEST_PRACTICES}}

## Solution Requirements
- Identify and fix the root cause
- Ensure no regression in existing functionality
- Add tests to prevent future occurrences
- Document the fix and its reasoning
- Consider edge cases and error scenarios

## Testing Strategy
- Unit tests for the fixed functionality
- Integration tests to verify system behavior
- Regression tests for related features
- Manual testing scenarios if applicable

## Deliverables
{{DELIVERABLES}}

Please provide a comprehensive fix that addresses the root cause and prevents similar issues in the future.`
    },

    /**
     * API development template
     */
    api_development: {
        name: 'api_development',
        version: '1.0',
        description: 'Template for API development tasks',
        requiredSections: ['# API Development', '## Endpoints', '## Authentication', '## Documentation'],
        template: `# API Development: {{TASK_TYPE}}

## API Objective
{{OBJECTIVES}}

## API Description
{{TASK_DESCRIPTION}}

## Functional Requirements
{{REQUIREMENTS}}

## Technical Constraints
{{CONSTRAINTS}}

## Implementation Context
{{CONTEXT}}

## Technology Stack
{{TECHNOLOGIES}}

## API Design Guidelines
{{BEST_PRACTICES}}

## Endpoint Requirements
- RESTful design principles
- Proper HTTP status codes
- Consistent response format
- Input validation and sanitization
- Error handling and meaningful error messages

## Authentication & Security
- Implement proper authentication (JWT, API keys, etc.)
- Input validation and sanitization
- Rate limiting implementation
- CORS configuration if needed
- Security headers implementation

## Documentation Requirements
- OpenAPI/Swagger specification
- Endpoint documentation with examples
- Authentication guide
- Error code reference
- Rate limiting information

## Testing Requirements
- Unit tests for all endpoints
- Integration tests for API workflows
- Authentication and authorization tests
- Error handling tests
- Performance and load testing

## Deliverables
{{DELIVERABLES}}

Please implement a robust, secure, and well-documented API following REST best practices.`
    },

    /**
     * Database schema template
     */
    database_schema: {
        name: 'database_schema',
        version: '1.0',
        description: 'Template for database schema design and migration tasks',
        requiredSections: ['# Database Schema', '## Tables', '## Relationships', '## Migrations'],
        template: `# Database Schema: {{TASK_TYPE}}

## Schema Objective
{{OBJECTIVES}}

## Schema Description
{{TASK_DESCRIPTION}}

## Requirements
{{REQUIREMENTS}}

## Constraints
{{CONSTRAINTS}}

## Database Context
{{CONTEXT}}

## Database Technology
{{TECHNOLOGIES}}

## Schema Design Guidelines
{{BEST_PRACTICES}}

## Schema Requirements
- Normalized database design (3NF minimum)
- Proper primary and foreign key relationships
- Appropriate data types and constraints
- Indexing strategy for performance
- Data integrity constraints

## Migration Strategy
- Create reversible migrations
- Handle data migration for existing records
- Ensure zero-downtime deployment compatibility
- Include rollback procedures
- Test migrations on staging environment

## Performance Considerations
- Index optimization for common queries
- Partitioning strategy if applicable
- Query performance analysis
- Connection pooling configuration
- Caching strategy

## Security Measures
- Proper access controls and permissions
- Data encryption for sensitive fields
- Audit logging for data changes
- Backup and recovery procedures
- SQL injection prevention

## Deliverables
{{DELIVERABLES}}

Please design a robust, scalable, and secure database schema with proper migrations.`
    },

    /**
     * Testing template
     */
    testing: {
        name: 'testing',
        version: '1.0',
        description: 'Template for testing implementation tasks',
        requiredSections: ['# Testing', '## Test Strategy', '## Test Cases', '## Coverage'],
        template: `# Testing Implementation: {{TASK_TYPE}}

## Testing Objective
{{OBJECTIVES}}

## Testing Scope
{{TASK_DESCRIPTION}}

## Testing Requirements
{{REQUIREMENTS}}

## Testing Constraints
{{CONSTRAINTS}}

## Application Context
{{CONTEXT}}

## Testing Technologies
{{TECHNOLOGIES}}

## Testing Best Practices
{{BEST_PRACTICES}}

## Test Strategy
- Unit tests for individual components
- Integration tests for component interactions
- End-to-end tests for user workflows
- Performance tests for critical paths
- Security tests for sensitive operations

## Test Coverage Requirements
- Minimum 80% code coverage
- 100% coverage for critical business logic
- Edge cases and error scenarios
- Boundary value testing
- Negative test cases

## Test Implementation Guidelines
- Use appropriate testing frameworks
- Follow AAA pattern (Arrange, Act, Assert)
- Create maintainable and readable tests
- Mock external dependencies appropriately
- Include both positive and negative test cases

## Test Data Management
- Use test fixtures and factories
- Implement proper test data cleanup
- Isolate tests from each other
- Use realistic but anonymized test data
- Implement test database seeding

## Continuous Integration
- Automated test execution on CI/CD
- Test result reporting and notifications
- Performance regression detection
- Security vulnerability scanning
- Code quality gate enforcement

## Deliverables
{{DELIVERABLES}}

Please implement comprehensive tests that ensure code quality and reliability.`
    },

    /**
     * Refactoring template
     */
    refactoring: {
        name: 'refactoring',
        version: '1.0',
        description: 'Template for code refactoring tasks',
        requiredSections: ['# Refactoring', '## Current State', '## Target State', '## Migration'],
        template: `# Code Refactoring: {{TASK_TYPE}}

## Refactoring Objective
{{OBJECTIVES}}

## Current State Analysis
{{TASK_DESCRIPTION}}

## Refactoring Requirements
{{REQUIREMENTS}}

## Constraints and Considerations
{{CONSTRAINTS}}

## Codebase Context
{{CONTEXT}}

## Technologies and Patterns
{{TECHNOLOGIES}}

## Refactoring Best Practices
{{BEST_PRACTICES}}

## Refactoring Guidelines
- Maintain existing functionality (no behavior changes)
- Improve code readability and maintainability
- Reduce technical debt
- Follow SOLID principles
- Ensure backward compatibility where required
- Update tests to reflect structural changes

## Code Quality Improvements
- Extract complex methods into smaller functions
- Eliminate code duplication (DRY principle)
- Improve naming conventions
- Reduce cyclomatic complexity
- Enhance error handling

## Testing Strategy
- Ensure all existing tests continue to pass
- Add tests for newly extracted components
- Verify no regression in functionality
- Performance testing to ensure no degradation
- Integration testing for refactored components

## Quality Metrics
- Reduced cyclomatic complexity
- Improved code coverage
- Better separation of concerns
- Enhanced testability
- Clearer naming conventions

## Migration Strategy
- Plan refactoring in small, incremental steps
- Ensure all tests pass after each step
- Document any breaking changes
- Provide migration guide if needed
- Coordinate with team on timing

## Deliverables
{{DELIVERABLES}}

Please refactor the code while maintaining all existing functionality and improving overall code quality.`
    },

    /**
     * Performance optimization template
     */
    performance_optimization: {
        name: 'performance_optimization',
        version: '1.0',
        description: 'Template for performance optimization tasks',
        requiredSections: ['# Performance Optimization', '## Baseline', '## Targets', '## Monitoring'],
        template: `# Performance Optimization: {{TASK_TYPE}}

## Optimization Objective
{{OBJECTIVES}}

## Performance Issue Description
{{TASK_DESCRIPTION}}

## Performance Requirements
{{REQUIREMENTS}}

## Optimization Constraints
{{CONSTRAINTS}}

## System Context
{{CONTEXT}}

## Technology Stack
{{TECHNOLOGIES}}

## Optimization Best Practices
{{BEST_PRACTICES}}

## Performance Analysis
- Establish baseline performance metrics
- Identify performance bottlenecks
- Profile CPU, memory, and I/O usage
- Analyze database query performance
- Review network latency and throughput

## Optimization Strategies
- Algorithm optimization
- Database query optimization
- Caching implementation
- Resource pooling
- Asynchronous processing
- Load balancing considerations

## Implementation Guidelines
- Measure before and after optimization
- Implement monitoring and alerting
- Use performance profiling tools
- Consider scalability implications
- Maintain code readability

## Testing Requirements
- Performance benchmarking
- Load testing under various conditions
- Stress testing for breaking points
- Memory leak detection
- Regression testing for functionality

## Monitoring and Metrics
- Response time measurements
- Throughput metrics
- Resource utilization monitoring
- Error rate tracking
- User experience metrics

## Deliverables
{{DELIVERABLES}}

Please implement performance optimizations with measurable improvements and comprehensive monitoring.`
    },

    /**
     * Security implementation template
     */
    security_implementation: {
        name: 'security_implementation',
        version: '1.0',
        description: 'Template for security-focused implementation tasks',
        requiredSections: ['# Security Implementation', '## Threats', '## Mitigations', '## Compliance'],
        template: `# Security Implementation: {{TASK_TYPE}}

## Security Objective
{{OBJECTIVES}}

## Security Requirements
{{TASK_DESCRIPTION}}

## Security Constraints
{{REQUIREMENTS}}

## Compliance Requirements
{{CONSTRAINTS}}

## Security Context
{{CONTEXT}}

## Security Technologies
{{TECHNOLOGIES}}

## Security Best Practices
{{BEST_PRACTICES}}

## Threat Analysis
- Identify potential security threats
- Assess risk levels and impact
- Review attack vectors
- Analyze data sensitivity
- Consider regulatory requirements

## Security Measures
- Authentication and authorization
- Input validation and sanitization
- Data encryption (at rest and in transit)
- Secure communication protocols
- Access control implementation
- Audit logging and monitoring

## Implementation Guidelines
- Follow OWASP security guidelines
- Implement defense in depth
- Use secure coding practices
- Regular security testing
- Principle of least privilege
- Fail securely by default

## Security Testing
- Vulnerability scanning
- Penetration testing
- Security code review
- Authentication testing
- Authorization testing
- Data protection verification

## Compliance and Documentation
- Security policy documentation
- Incident response procedures
- Security training materials
- Compliance audit preparation
- Risk assessment documentation

## Deliverables
{{DELIVERABLES}}

Please implement robust security measures following industry best practices and compliance requirements.`
    }
};

/**
 * Template utility functions
 */
export class TemplateUtils {
    /**
     * Get template by name
     * @param {string} templateName - Template name
     * @returns {Object|null} Template object or null if not found
     */
    static getTemplate(templateName) {
        return PromptTemplates[templateName] || null;
    }

    /**
     * Get all available template names
     * @returns {Array<string>} Array of template names
     */
    static getTemplateNames() {
        return Object.keys(PromptTemplates);
    }

    /**
     * Get templates by category or pattern
     * @param {string} pattern - Search pattern
     * @returns {Array<Object>} Matching templates
     */
    static findTemplates(pattern) {
        const regex = new RegExp(pattern, 'i');
        return Object.entries(PromptTemplates)
            .filter(([name, template]) => 
                regex.test(name) || 
                regex.test(template.description) ||
                regex.test(template.name)
            )
            .map(([name, template]) => ({ name, ...template }));
    }

    /**
     * Validate template structure
     * @param {Object} template - Template to validate
     * @returns {Object} Validation result
     */
    static validateTemplate(template) {
        const errors = [];
        const warnings = [];

        // Required fields
        if (!template.name) errors.push('Template name is required');
        if (!template.version) errors.push('Template version is required');
        if (!template.template) errors.push('Template content is required');

        // Template content validation
        if (template.template) {
            const requiredVariables = ['{{TASK_TYPE}}', '{{OBJECTIVES}}', '{{DELIVERABLES}}'];
            const missingVariables = requiredVariables.filter(variable => 
                !template.template.includes(variable)
            );
            
            if (missingVariables.length > 0) {
                warnings.push(`Missing template variables: ${missingVariables.join(', ')}`);
            }

            // Check for required sections
            if (template.requiredSections) {
                const missingSections = template.requiredSections.filter(section => 
                    !template.template.includes(section)
                );
                
                if (missingSections.length > 0) {
                    warnings.push(`Missing required sections: ${missingSections.join(', ')}`);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Render template with variables
     * @param {Object} template - Template object
     * @param {Object} variables - Variables to substitute
     * @returns {string} Rendered template
     */
    static renderTemplate(template, variables) {
        let rendered = template.template;

        // Default variables
        const defaultVariables = {
            '{{TASK_TYPE}}': 'GENERAL',
            '{{OBJECTIVES}}': 'Not specified',
            '{{TASK_DESCRIPTION}}': 'No description provided',
            '{{REQUIREMENTS}}': 'No specific requirements',
            '{{CONSTRAINTS}}': 'No constraints specified',
            '{{DELIVERABLES}}': 'Standard deliverables expected',
            '{{CONTEXT}}': 'No additional context',
            '{{TECHNOLOGIES}}': 'Technology stack to be determined',
            '{{BEST_PRACTICES}}': 'Follow standard best practices',
            '{{TIMESTAMP}}': new Date().toISOString()
        };

        // Merge with provided variables
        const allVariables = { ...defaultVariables, ...variables };

        // Replace all variables
        for (const [variable, value] of Object.entries(allVariables)) {
            const regex = new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g');
            rendered = rendered.replace(regex, value || defaultVariables[variable] || 'Not specified');
        }

        return rendered;
    }

    /**
     * Extract variables from template
     * @param {string} templateContent - Template content
     * @returns {Array<string>} Array of variable names
     */
    static extractVariables(templateContent) {
        const variableRegex = /\{\{([^}]+)\}\}/g;
        const variables = [];
        let match;

        while ((match = variableRegex.exec(templateContent)) !== null) {
            if (!variables.includes(match[1])) {
                variables.push(match[1]);
            }
        }

        return variables;
    }

    /**
     * Create custom template
     * @param {Object} templateConfig - Template configuration
     * @returns {Object} Created template
     */
    static createTemplate(templateConfig) {
        const template = {
            name: templateConfig.name,
            version: templateConfig.version || '1.0',
            description: templateConfig.description || '',
            requiredSections: templateConfig.requiredSections || [],
            template: templateConfig.template,
            metadata: {
                created: new Date().toISOString(),
                author: templateConfig.author || 'system',
                category: templateConfig.category || 'custom'
            }
        };

        // Validate the template
        const validation = this.validateTemplate(template);
        if (!validation.isValid) {
            throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
        }

        return template;
    }

    /**
     * Get template statistics
     * @returns {Object} Template statistics
     */
    static getStatistics() {
        const templates = Object.values(PromptTemplates);
        
        return {
            totalTemplates: templates.length,
            templateNames: Object.keys(PromptTemplates),
            averageLength: Math.round(
                templates.reduce((sum, t) => sum + t.template.length, 0) / templates.length
            ),
            categories: [...new Set(templates.map(t => t.name.split('_')[0]))],
            versions: [...new Set(templates.map(t => t.version))]
        };
    }
}

export default PromptTemplates;

