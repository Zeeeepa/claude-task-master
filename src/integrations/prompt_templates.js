/**
 * @fileoverview Prompt Templates
 * @description Standardized prompts for different task types in Claude Code
 */

/**
 * Base prompt template class
 */
class PromptTemplate {
  constructor(name, template, variables = []) {
    this.name = name;
    this.template = template;
    this.variables = variables;
  }

  /**
   * Render the template with provided data
   * @param {Object} data - Data to interpolate into template
   * @returns {string} Rendered prompt
   */
  render(data = {}) {
    let rendered = this.template;
    
    // Replace variables in template
    for (const variable of this.variables) {
      const value = data[variable] || `[${variable.toUpperCase()}_NOT_PROVIDED]`;
      const regex = new RegExp(`{{${variable}}}`, 'g');
      rendered = rendered.replace(regex, value);
    }
    
    // Handle conditional sections
    rendered = this.processConditionals(rendered, data);
    
    return rendered.trim();
  }

  /**
   * Process conditional sections in template
   * @param {string} template - Template string
   * @param {Object} data - Data object
   * @returns {string} Processed template
   */
  processConditionals(template, data) {
    // Process {{#if variable}} ... {{/if}} blocks
    const ifRegex = /{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g;
    return template.replace(ifRegex, (match, variable, content) => {
      return data[variable] ? content : '';
    });
  }

  /**
   * Validate that all required variables are provided
   * @param {Object} data - Data to validate
   * @returns {Object} Validation result
   */
  validate(data = {}) {
    const missing = this.variables.filter(variable => !(variable in data));
    return {
      valid: missing.length === 0,
      missing
    };
  }
}

/**
 * Feature implementation prompt template
 */
export const featureTemplate = new PromptTemplate(
  'feature',
  `# Feature Implementation: {{title}}

## Description
{{description}}

## Requirements
{{#if requirements}}
{{requirements}}
{{/if}}

## Implementation Guidelines
1. **Code Quality**: Follow existing code patterns and conventions
2. **Testing**: Add comprehensive unit tests for new functionality
3. **Documentation**: Update relevant documentation and add inline comments
4. **Error Handling**: Implement robust error handling and validation
5. **Performance**: Consider performance implications and optimize where necessary

## Specific Instructions
- Analyze the existing codebase structure before making changes
- Create new files in appropriate directories following the project structure
- Ensure backward compatibility unless explicitly stated otherwise
- Add proper TypeScript/JSDoc type annotations
- Follow the project's linting and formatting rules

{{#if acceptance_criteria}}
## Acceptance Criteria
{{acceptance_criteria}}
{{/if}}

{{#if affected_files}}
## Files to Consider
{{affected_files}}
{{/if}}

## Expected Deliverables
1. Implementation of the feature as described
2. Unit tests with >90% coverage
3. Updated documentation
4. Code review-ready pull request

Please implement this feature step by step, explaining your approach and any design decisions.`,
  ['title', 'description', 'requirements', 'acceptance_criteria', 'affected_files']
);

/**
 * Bug fix prompt template
 */
export const bugfixTemplate = new PromptTemplate(
  'bugfix',
  `# Bug Fix: {{title}}

## Problem Description
{{description}}

## Bug Details
{{#if bug_details}}
{{bug_details}}
{{/if}}

## Steps to Reproduce
{{#if reproduction_steps}}
{{reproduction_steps}}
{{/if}}

## Expected vs Actual Behavior
{{#if expected_behavior}}
**Expected**: {{expected_behavior}}
{{/if}}
{{#if actual_behavior}}
**Actual**: {{actual_behavior}}
{{/if}}

## Fix Guidelines
1. **Root Cause Analysis**: Identify the underlying cause of the issue
2. **Minimal Change**: Make the smallest possible change to fix the issue
3. **Regression Testing**: Ensure the fix doesn't break existing functionality
4. **Test Coverage**: Add tests to prevent regression
5. **Documentation**: Update documentation if the bug was due to unclear behavior

## Investigation Steps
1. Reproduce the bug in the current codebase
2. Identify the root cause through debugging
3. Implement a targeted fix
4. Verify the fix resolves the issue
5. Run existing tests to ensure no regressions
6. Add new tests to prevent future occurrences

{{#if affected_files}}
## Files Likely Involved
{{affected_files}}
{{/if}}

{{#if error_logs}}
## Error Logs/Stack Traces
{{error_logs}}
{{/if}}

Please investigate and fix this bug systematically, documenting your findings and solution approach.`,
  ['title', 'description', 'bug_details', 'reproduction_steps', 'expected_behavior', 'actual_behavior', 'affected_files', 'error_logs']
);

/**
 * Refactoring prompt template
 */
export const refactorTemplate = new PromptTemplate(
  'refactor',
  `# Code Refactoring: {{title}}

## Refactoring Goal
{{description}}

## Current Issues
{{#if current_issues}}
{{current_issues}}
{{/if}}

## Refactoring Objectives
1. **Maintainability**: Improve code readability and maintainability
2. **Performance**: Optimize performance where applicable
3. **Structure**: Improve code organization and architecture
4. **Reusability**: Extract reusable components and utilities
5. **Testing**: Improve testability and test coverage

## Refactoring Guidelines
- Maintain existing functionality (no behavioral changes)
- Preserve public APIs unless explicitly changing them
- Update tests to match new structure
- Ensure all existing tests continue to pass
- Document any breaking changes clearly
- Follow SOLID principles and design patterns

## Approach
1. Analyze current code structure and identify issues
2. Plan the refactoring strategy
3. Implement changes incrementally
4. Update tests after each change
5. Verify functionality remains intact
6. Update documentation

{{#if affected_files}}
## Files to Refactor
{{affected_files}}
{{/if}}

{{#if target_patterns}}
## Target Patterns/Principles
{{target_patterns}}
{{/if}}

Please refactor the code systematically, explaining each change and its benefits.`,
  ['title', 'description', 'current_issues', 'affected_files', 'target_patterns']
);

/**
 * Testing prompt template
 */
export const testingTemplate = new PromptTemplate(
  'testing',
  `# Test Implementation: {{title}}

## Testing Objective
{{description}}

## Test Requirements
{{#if test_requirements}}
{{test_requirements}}
{{/if}}

## Testing Guidelines
1. **Coverage**: Aim for >90% code coverage
2. **Test Types**: Include unit, integration, and edge case tests
3. **Assertions**: Use clear, descriptive assertions
4. **Setup/Teardown**: Properly set up and clean up test environments
5. **Mocking**: Mock external dependencies appropriately
6. **Documentation**: Document complex test scenarios

## Test Categories to Implement
- **Unit Tests**: Test individual functions and methods
- **Integration Tests**: Test component interactions
- **Edge Cases**: Test boundary conditions and error scenarios
- **Performance Tests**: Test performance-critical code paths
- **Regression Tests**: Prevent known issues from reoccurring

{{#if test_files}}
## Test Files to Create/Update
{{test_files}}
{{/if}}

{{#if test_scenarios}}
## Specific Test Scenarios
{{test_scenarios}}
{{/if}}

## Expected Test Structure
- Clear test descriptions
- Arrange-Act-Assert pattern
- Proper error handling tests
- Mock external dependencies
- Clean test data setup

Please implement comprehensive tests following best practices and testing frameworks used in the project.`,
  ['title', 'description', 'test_requirements', 'test_files', 'test_scenarios']
);

/**
 * Documentation prompt template
 */
export const documentationTemplate = new PromptTemplate(
  'documentation',
  `# Documentation Task: {{title}}

## Documentation Objective
{{description}}

## Documentation Requirements
{{#if doc_requirements}}
{{doc_requirements}}
{{/if}}

## Documentation Guidelines
1. **Clarity**: Write clear, concise, and accurate documentation
2. **Examples**: Include practical examples and code snippets
3. **Structure**: Use consistent formatting and organization
4. **Completeness**: Cover all relevant aspects and edge cases
5. **Maintenance**: Ensure documentation stays up-to-date with code changes

## Documentation Types
- **API Documentation**: Function/method signatures and usage
- **User Guides**: Step-by-step instructions for end users
- **Developer Guides**: Technical implementation details
- **README Files**: Project overview and setup instructions
- **Code Comments**: Inline documentation for complex logic

{{#if doc_files}}
## Documentation Files to Create/Update
{{doc_files}}
{{/if}}

{{#if api_endpoints}}
## API Endpoints to Document
{{api_endpoints}}
{{/if}}

## Documentation Standards
- Use markdown format for consistency
- Include code examples with expected outputs
- Add diagrams for complex workflows
- Provide troubleshooting sections
- Include version information and changelog

Please create comprehensive documentation that helps users and developers understand and use the system effectively.`,
  ['title', 'description', 'doc_requirements', 'doc_files', 'api_endpoints']
);

/**
 * Performance optimization prompt template
 */
export const performanceTemplate = new PromptTemplate(
  'performance',
  `# Performance Optimization: {{title}}

## Performance Goal
{{description}}

## Current Performance Issues
{{#if performance_issues}}
{{performance_issues}}
{{/if}}

## Optimization Guidelines
1. **Measurement**: Profile and measure before optimizing
2. **Bottlenecks**: Identify and focus on actual bottlenecks
3. **Trade-offs**: Consider memory vs. speed trade-offs
4. **Maintainability**: Don't sacrifice code clarity for minor gains
5. **Testing**: Verify optimizations don't break functionality

## Optimization Areas
- **Algorithm Efficiency**: Improve algorithmic complexity
- **Memory Usage**: Reduce memory footprint and leaks
- **I/O Operations**: Optimize file and network operations
- **Database Queries**: Improve query performance
- **Caching**: Implement appropriate caching strategies
- **Lazy Loading**: Load resources only when needed

{{#if performance_targets}}
## Performance Targets
{{performance_targets}}
{{/if}}

{{#if affected_files}}
## Files to Optimize
{{affected_files}}
{{/if}}

## Optimization Process
1. Profile current performance
2. Identify bottlenecks and hotspots
3. Implement optimizations incrementally
4. Measure impact of each change
5. Verify functionality remains correct
6. Document performance improvements

Please optimize the code systematically, measuring and documenting the impact of each optimization.`,
  ['title', 'description', 'performance_issues', 'performance_targets', 'affected_files']
);

/**
 * Security fix prompt template
 */
export const securityTemplate = new PromptTemplate(
  'security',
  `# Security Fix: {{title}}

## Security Issue
{{description}}

## Vulnerability Details
{{#if vulnerability_details}}
{{vulnerability_details}}
{{/if}}

## Security Guidelines
1. **Input Validation**: Validate and sanitize all inputs
2. **Authentication**: Implement proper authentication mechanisms
3. **Authorization**: Ensure proper access controls
4. **Encryption**: Use strong encryption for sensitive data
5. **Logging**: Log security events without exposing sensitive data
6. **Dependencies**: Keep dependencies updated and secure

## Common Security Issues to Address
- **SQL Injection**: Use parameterized queries
- **XSS**: Sanitize user inputs and outputs
- **CSRF**: Implement CSRF protection
- **Authentication**: Secure password handling
- **Authorization**: Proper access control checks
- **Data Exposure**: Prevent sensitive data leaks

{{#if security_requirements}}
## Security Requirements
{{security_requirements}}
{{/if}}

{{#if affected_files}}
## Files to Secure
{{affected_files}}
{{/if}}

## Security Implementation Steps
1. Identify the security vulnerability
2. Assess the impact and risk level
3. Implement appropriate security measures
4. Test the security fix thoroughly
5. Verify no new vulnerabilities are introduced
6. Update security documentation

Please implement security fixes following security best practices and industry standards.`,
  ['title', 'description', 'vulnerability_details', 'security_requirements', 'affected_files']
);

/**
 * Template registry
 */
export const templates = {
  feature: featureTemplate,
  bugfix: bugfixTemplate,
  refactor: refactorTemplate,
  testing: testingTemplate,
  documentation: documentationTemplate,
  performance: performanceTemplate,
  security: securityTemplate
};

/**
 * Get template by name
 * @param {string} name - Template name
 * @returns {PromptTemplate|null} Template instance
 */
export function getTemplate(name) {
  return templates[name] || null;
}

/**
 * Get all available template names
 * @returns {Array} Array of template names
 */
export function getTemplateNames() {
  return Object.keys(templates);
}

/**
 * Create a custom template
 * @param {string} name - Template name
 * @param {string} template - Template string
 * @param {Array} variables - Template variables
 * @returns {PromptTemplate} Template instance
 */
export function createTemplate(name, template, variables = []) {
  return new PromptTemplate(name, template, variables);
}

/**
 * Generate prompt for a task
 * @param {Object} task - Task object
 * @param {Object} options - Additional options
 * @returns {string} Generated prompt
 */
export function generatePrompt(task, options = {}) {
  const taskType = task.type || 'feature';
  const template = getTemplate(taskType);
  
  if (!template) {
    throw new Error(`Unknown task type: ${taskType}`);
  }

  const templateData = {
    title: task.title,
    description: task.description,
    requirements: Array.isArray(task.requirements) 
      ? task.requirements.join('\n') 
      : task.requirements,
    acceptance_criteria: Array.isArray(task.acceptance_criteria)
      ? task.acceptance_criteria.join('\n')
      : task.acceptance_criteria,
    affected_files: Array.isArray(task.affected_files)
      ? task.affected_files.join('\n')
      : task.affected_files,
    ...options
  };

  // Validate template data
  const validation = template.validate(templateData);
  if (!validation.valid) {
    console.warn(`Missing template variables: ${validation.missing.join(', ')}`);
  }

  return template.render(templateData);
}

export default {
  templates,
  getTemplate,
  getTemplateNames,
  createTemplate,
  generatePrompt,
  PromptTemplate
};

