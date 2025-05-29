/**
 * @fileoverview Prompt templates for different task types
 * Provides comprehensive templates for generating effective codegen prompts
 */

/**
 * Implementation prompt template for new features and functionality
 */
export const IMPLEMENTATION_PROMPT = `
# Implementation Task

## Task Overview
**Title**: {task_title}
**Type**: Implementation
**Priority**: {priority}

## Description
{task_description}

## Requirements
{requirements_list}

## Acceptance Criteria
{acceptance_criteria}

## Technical Context

### Codebase Information
- **Language**: {language}
- **Framework**: {framework}
- **Architecture**: {architecture}

### Affected Files
{affected_files}

### Key Dependencies
{dependencies}

## Implementation Guidelines

### Coding Standards
{coding_standards}

### Testing Requirements
{testing_requirements}

### Documentation Requirements
- Include inline comments for complex logic
- Update relevant documentation files
- Add JSDoc/docstring comments for new functions/classes

## Codebase Context
{codebase_context}

## Validation Requirements
{validation_requirements}

## Expected Deliverables
Please implement this task by creating a PR with the necessary code changes that:
1. Fulfills all specified requirements
2. Includes comprehensive tests with good coverage
3. Follows the established coding standards
4. Includes proper documentation and comments
5. Handles edge cases and error scenarios appropriately

## Additional Notes
{additional_notes}
`;

/**
 * Bug fix prompt template for addressing issues and defects
 */
export const BUG_FIX_PROMPT = `
# Bug Fix Task

## Bug Report
**Title**: {task_title}
**Severity**: {severity}
**Priority**: {priority}

## Issue Description
{task_description}

## Steps to Reproduce
{reproduction_steps}

## Expected Behavior
{expected_behavior}

## Current Behavior
{current_behavior}

## Error Information
{error_details}

## Technical Context

### Affected Components
{affected_files}

### Environment Details
{environment_details}

### Related Code Areas
{related_code}

## Root Cause Analysis
{root_cause_analysis}

## Codebase Context
{codebase_context}

## Fix Requirements
{fix_requirements}

## Testing Strategy
{testing_strategy}

## Expected Deliverables
Please create a PR that fixes this bug and includes:
1. The minimal necessary code changes to resolve the issue
2. Comprehensive tests to prevent regression
3. Clear explanation of the fix in the PR description
4. Verification that the fix doesn't introduce new issues
5. Updated documentation if the bug was due to incorrect documentation

## Validation Checklist
- [ ] Bug is completely resolved
- [ ] No new bugs introduced
- [ ] All existing tests still pass
- [ ] New tests cover the bug scenario
- [ ] Performance impact is minimal
- [ ] Security implications considered

## Additional Notes
{additional_notes}
`;

/**
 * Feature prompt template for new feature development
 */
export const FEATURE_PROMPT = `
# Feature Development Task

## Feature Overview
**Title**: {task_title}
**Type**: New Feature
**Priority**: {priority}

## Feature Description
{task_description}

## User Stories
{user_stories}

## Functional Requirements
{functional_requirements}

## Non-Functional Requirements
{non_functional_requirements}

## Acceptance Criteria
{acceptance_criteria}

## Technical Specifications

### Architecture Considerations
{architecture_considerations}

### API Design
{api_design}

### Database Changes
{database_changes}

### UI/UX Requirements
{ui_requirements}

## Implementation Approach
{implementation_approach}

## Codebase Context
{codebase_context}

## Integration Points
{integration_points}

## Testing Strategy
{testing_strategy}

## Security Considerations
{security_considerations}

## Performance Requirements
{performance_requirements}

## Expected Deliverables
Please implement this feature by creating a PR that includes:
1. Complete feature implementation following the specifications
2. Comprehensive test suite (unit, integration, e2e as appropriate)
3. API documentation and usage examples
4. User documentation if applicable
5. Migration scripts if database changes are required
6. Performance benchmarks if applicable

## Validation Requirements
{validation_requirements}

## Additional Notes
{additional_notes}
`;

/**
 * Refactor prompt template for code improvement and restructuring
 */
export const REFACTOR_PROMPT = `
# Refactoring Task

## Refactoring Overview
**Title**: {task_title}
**Type**: Code Refactoring
**Priority**: {priority}

## Refactoring Goals
{task_description}

## Current State Analysis
{current_state}

## Target State
{target_state}

## Refactoring Scope
{refactoring_scope}

## Technical Debt Addressed
{technical_debt}

## Affected Components
{affected_files}

## Refactoring Strategy
{refactoring_strategy}

## Breaking Changes
{breaking_changes}

## Migration Plan
{migration_plan}

## Codebase Context
{codebase_context}

## Quality Improvements
{quality_improvements}

## Performance Impact
{performance_impact}

## Testing Strategy
{testing_strategy}

## Expected Deliverables
Please create a PR that accomplishes this refactoring with:
1. Clean, well-structured code that improves maintainability
2. Preserved functionality with no behavioral changes (unless specified)
3. Comprehensive tests to ensure no regressions
4. Updated documentation reflecting the new structure
5. Migration guide if breaking changes are introduced
6. Performance benchmarks showing improvements

## Validation Requirements
{validation_requirements}

## Success Metrics
{success_metrics}

## Additional Notes
{additional_notes}
`;

/**
 * Documentation prompt template for documentation tasks
 */
export const DOCUMENTATION_PROMPT = `
# Documentation Task

## Documentation Overview
**Title**: {task_title}
**Type**: Documentation
**Priority**: {priority}

## Documentation Scope
{task_description}

## Target Audience
{target_audience}

## Documentation Type
{documentation_type}

## Content Requirements
{content_requirements}

## Existing Documentation
{existing_documentation}

## Documentation Standards
{documentation_standards}

## Codebase Context
{codebase_context}

## Examples and Use Cases
{examples_and_use_cases}

## Integration with Existing Docs
{integration_requirements}

## Expected Deliverables
Please create comprehensive documentation that includes:
1. Clear, well-structured content appropriate for the target audience
2. Code examples and usage demonstrations
3. Proper formatting and organization
4. Integration with existing documentation structure
5. Updated table of contents and navigation
6. Review and validation of technical accuracy

## Quality Standards
{quality_standards}

## Validation Requirements
{validation_requirements}

## Additional Notes
{additional_notes}
`;

/**
 * Testing prompt template for test development and improvement
 */
export const TESTING_PROMPT = `
# Testing Task

## Testing Overview
**Title**: {task_title}
**Type**: Testing
**Priority**: {priority}

## Testing Scope
{task_description}

## Testing Strategy
{testing_strategy}

## Test Types Required
{test_types}

## Coverage Requirements
{coverage_requirements}

## Test Scenarios
{test_scenarios}

## Edge Cases
{edge_cases}

## Performance Testing
{performance_testing}

## Security Testing
{security_testing}

## Codebase Context
{codebase_context}

## Testing Framework
{testing_framework}

## Test Data Requirements
{test_data}

## Expected Deliverables
Please create comprehensive tests that include:
1. Unit tests with high coverage for all new/modified code
2. Integration tests for component interactions
3. End-to-end tests for critical user flows
4. Performance tests if applicable
5. Security tests for sensitive functionality
6. Clear test documentation and maintenance guidelines

## Validation Requirements
{validation_requirements}

## Success Metrics
{success_metrics}

## Additional Notes
{additional_notes}
`;

/**
 * Template registry mapping task types to their corresponding templates
 */
export const TEMPLATE_REGISTRY = {
    implementation: IMPLEMENTATION_PROMPT,
    bug_fix: BUG_FIX_PROMPT,
    feature: FEATURE_PROMPT,
    refactor: REFACTOR_PROMPT,
    documentation: DOCUMENTATION_PROMPT,
    testing: TESTING_PROMPT,
    optimization: IMPLEMENTATION_PROMPT, // Use implementation template for optimization
    security: BUG_FIX_PROMPT // Use bug fix template for security issues
};

/**
 * Get template for a specific task type
 * @param {string} taskType - The type of task
 * @returns {string} The template string
 */
export function getTemplate(taskType) {
    return TEMPLATE_REGISTRY[taskType] || IMPLEMENTATION_PROMPT;
}

/**
 * Get all available template types
 * @returns {string[]} Array of available template types
 */
export function getAvailableTemplateTypes() {
    return Object.keys(TEMPLATE_REGISTRY);
}

export default {
    IMPLEMENTATION_PROMPT,
    BUG_FIX_PROMPT,
    FEATURE_PROMPT,
    REFACTOR_PROMPT,
    DOCUMENTATION_PROMPT,
    TESTING_PROMPT,
    TEMPLATE_REGISTRY,
    getTemplate,
    getAvailableTemplateTypes
};

