/**
 * @fileoverview PR Templates
 * @description Comprehensive templates for automated PR creation with detailed context
 */

/**
 * PR template library for generating comprehensive pull request descriptions
 */
export class PRTemplates {
    constructor() {
        this.templates = this._initializeTemplates();
        this.sections = this._initializeSections();
        this.checklists = this._initializeChecklists();
    }

    /**
     * Get PR template by type
     * @param {string} type - PR type (feature, bug_fix, refactor, etc.)
     * @returns {Object} PR template
     */
    getTemplate(type) {
        return this.templates[type] || this.templates.default;
    }

    /**
     * Get section template
     * @param {string} sectionName - Section name
     * @returns {Object} Section template
     */
    getSection(sectionName) {
        return this.sections[sectionName] || this.sections.default;
    }

    /**
     * Get checklist by type
     * @param {string} type - Checklist type
     * @returns {Array} Checklist items
     */
    getChecklist(type) {
        return this.checklists[type] || this.checklists.default;
    }

    /**
     * Generate complete PR description
     * @param {Object} task - Processed task
     * @param {Object} codeChanges - Code changes information
     * @param {Object} options - Additional options
     * @returns {string} Complete PR description
     */
    generatePRDescription(task, codeChanges, options = {}) {
        const template = this.getTemplate(task.parsedRequirements.type);
        const sections = [];

        // Header with task summary
        sections.push(this._generateHeader(task));

        // Task details section
        sections.push(this._generateTaskDetails(task));

        // Implementation section
        sections.push(this._generateImplementation(task, codeChanges));

        // Changes section
        sections.push(this._generateChanges(task, codeChanges));

        // Testing section
        sections.push(this._generateTesting(task, template));

        // Acceptance criteria
        sections.push(this._generateAcceptanceCriteria(task));

        // Additional information
        sections.push(this._generateAdditionalInfo(task));

        // Checklists
        sections.push(this._generateChecklists(task, template));

        // Footer
        sections.push(this._generateFooter(options));

        return sections.join('\n\n');
    }

    /**
     * Initialize PR templates
     * @returns {Object} Template configurations
     * @private
     */
    _initializeTemplates() {
        return {
            feature: {
                title_prefix: '✨ feat:',
                emoji: '✨',
                focus: 'new functionality',
                sections: ['summary', 'implementation', 'testing', 'acceptance'],
                checklists: ['development', 'testing', 'documentation'],
                labels: ['enhancement', 'feature'],
                reviewers: ['feature-team']
            },

            bug_fix: {
                title_prefix: '🐛 fix:',
                emoji: '🐛',
                focus: 'issue resolution',
                sections: ['summary', 'problem', 'solution', 'testing'],
                checklists: ['development', 'testing', 'regression'],
                labels: ['bug', 'fix'],
                reviewers: ['maintainer-team']
            },

            refactor: {
                title_prefix: '♻️ refactor:',
                emoji: '♻️',
                focus: 'code improvement',
                sections: ['summary', 'motivation', 'changes', 'testing'],
                checklists: ['development', 'testing', 'performance'],
                labels: ['refactoring', 'improvement'],
                reviewers: ['senior-team']
            },

            test: {
                title_prefix: '🧪 test:',
                emoji: '🧪',
                focus: 'test coverage',
                sections: ['summary', 'coverage', 'scenarios'],
                checklists: ['testing', 'coverage'],
                labels: ['testing', 'quality'],
                reviewers: ['qa-team']
            },

            documentation: {
                title_prefix: '📚 docs:',
                emoji: '📚',
                focus: 'documentation',
                sections: ['summary', 'content', 'organization'],
                checklists: ['documentation', 'review'],
                labels: ['documentation'],
                reviewers: ['docs-team']
            },

            configuration: {
                title_prefix: '⚙️ config:',
                emoji: '⚙️',
                focus: 'configuration changes',
                sections: ['summary', 'changes', 'impact', 'testing'],
                checklists: ['development', 'testing', 'deployment'],
                labels: ['configuration', 'infrastructure'],
                reviewers: ['devops-team']
            },

            integration: {
                title_prefix: '🔗 feat:',
                emoji: '🔗',
                focus: 'system integration',
                sections: ['summary', 'integration', 'testing', 'monitoring'],
                checklists: ['development', 'testing', 'integration', 'monitoring'],
                labels: ['integration', 'enhancement'],
                reviewers: ['integration-team']
            },

            default: {
                title_prefix: '🔧 chore:',
                emoji: '🔧',
                focus: 'general changes',
                sections: ['summary', 'changes', 'testing'],
                checklists: ['development', 'testing'],
                labels: ['maintenance'],
                reviewers: ['team']
            }
        };
    }

    /**
     * Initialize section templates
     * @returns {Object} Section templates
     * @private
     */
    _initializeSections() {
        return {
            header: {
                format: 'markdown',
                required_fields: ['task_id', 'type', 'description'],
                optional_fields: ['priority', 'complexity', 'effort']
            },

            task_details: {
                format: 'table',
                fields: ['task_id', 'type', 'priority', 'complexity', 'effort', 'domain'],
                styling: 'compact'
            },

            implementation: {
                format: 'list',
                subsections: ['approach', 'patterns', 'technologies'],
                detail_level: 'high'
            },

            changes: {
                format: 'categorized_list',
                categories: ['added', 'modified', 'removed', 'deprecated'],
                include_files: true
            },

            testing: {
                format: 'checklist',
                categories: ['unit', 'integration', 'e2e', 'manual'],
                include_coverage: true
            },

            acceptance: {
                format: 'checklist',
                source: 'task_requirements',
                additional_items: ['code_quality', 'documentation']
            },

            additional_info: {
                format: 'collapsible',
                sections: ['complexity', 'risks', 'dependencies', 'notes'],
                default_collapsed: true
            },

            default: {
                format: 'markdown',
                styling: 'standard'
            }
        };
    }

    /**
     * Initialize checklist templates
     * @returns {Object} Checklist templates
     * @private
     */
    _initializeChecklists() {
        return {
            development: [
                'Code follows project style guidelines',
                'Code is well-documented with comments',
                'No console.log or debug statements left in code',
                'Error handling is implemented appropriately',
                'Input validation is included where needed',
                'Performance considerations have been addressed',
                'Security best practices have been followed',
                'Code is modular and follows SOLID principles'
            ],

            testing: [
                'Unit tests have been added/updated',
                'All existing tests pass',
                'Test coverage meets project requirements',
                'Edge cases are covered by tests',
                'Integration tests are included if applicable',
                'Manual testing has been performed',
                'Performance testing completed if needed',
                'Accessibility testing done for UI changes'
            ],

            documentation: [
                'Code is properly documented',
                'README updated if necessary',
                'API documentation updated',
                'Inline comments explain complex logic',
                'Change log updated',
                'Migration guide provided if needed',
                'Examples updated if applicable'
            ],

            regression: [
                'Existing functionality is not broken',
                'Backward compatibility is maintained',
                'Database migrations are reversible',
                'Configuration changes are documented',
                'Deployment process is not affected',
                'Monitoring and logging still work'
            ],

            performance: [
                'Performance impact has been measured',
                'No significant performance degradation',
                'Memory usage is acceptable',
                'Database queries are optimized',
                'Caching strategies are appropriate',
                'Load testing completed if needed'
            ],

            security: [
                'Input validation prevents injection attacks',
                'Authentication is properly implemented',
                'Authorization checks are in place',
                'Sensitive data is properly handled',
                'Security headers are configured',
                'Dependencies are up to date and secure'
            ],

            integration: [
                'External API integrations are tested',
                'Error handling for external services',
                'Timeout and retry logic implemented',
                'Circuit breaker pattern used if needed',
                'Monitoring for integration health',
                'Fallback mechanisms in place'
            ],

            deployment: [
                'Deployment scripts are updated',
                'Environment variables are documented',
                'Database migrations are included',
                'Configuration changes are noted',
                'Rollback plan is available',
                'Monitoring alerts are configured'
            ],

            coverage: [
                'Line coverage meets minimum threshold',
                'Branch coverage is adequate',
                'Function coverage is complete',
                'Critical paths are fully tested',
                'Error scenarios are covered'
            ],

            review: [
                'Content is accurate and up-to-date',
                'Language is clear and concise',
                'Examples are working and relevant',
                'Links are valid and accessible',
                'Formatting is consistent',
                'Target audience needs are met'
            ],

            monitoring: [
                'Logging is implemented for key operations',
                'Metrics are collected for monitoring',
                'Alerts are configured for failures',
                'Health checks are implemented',
                'Performance metrics are tracked',
                'Error tracking is in place'
            ],

            default: [
                'Changes have been tested',
                'Code follows project standards',
                'Documentation is updated',
                'No breaking changes introduced'
            ]
        };
    }

    /**
     * Generate header section
     * @param {Object} task - Task object
     * @returns {string} Header section
     * @private
     */
    _generateHeader(task) {
        const template = this.getTemplate(task.parsedRequirements.type);
        
        return `${template.emoji} **${task.parsedRequirements.type.toUpperCase()}**: ${task.originalDescription}

## 📋 Task Summary
${task.originalDescription}

> **Focus**: ${template.focus}  
> **Task ID**: \`${task.id}\`  
> **Type**: ${task.parsedRequirements.type}`;
    }

    /**
     * Generate task details section
     * @param {Object} task - Task object
     * @returns {string} Task details section
     * @private
     */
    _generateTaskDetails(task) {
        return `## 📊 Task Details

| Attribute | Value |
|-----------|-------|
| **Task ID** | \`${task.id}\` |
| **Type** | ${task.parsedRequirements.type} |
| **Priority** | ${task.priority}/10 |
| **Complexity** | ${task.complexity}/10 |
| **Estimated Effort** | ${task.estimatedEffort} hours |
| **Domain** | ${task.context.domain} |
| **Project Type** | ${task.context.project_type} |`;
    }

    /**
     * Generate implementation section
     * @param {Object} task - Task object
     * @param {Object} codeChanges - Code changes
     * @returns {string} Implementation section
     * @private
     */
    _generateImplementation(task, codeChanges) {
        return `## 🛠️ Implementation Details

### Approach
${this._generateApproachDescription(task)}

### Actions Performed
${task.parsedRequirements.actions.map(action => `- ${action}`).join('\n')}

### Technologies Used
${task.parsedRequirements.technical_requirements.length > 0 ? 
    task.parsedRequirements.technical_requirements.map(req => `- **${req.technology}**: ${req.description}`).join('\n') :
    '_No specific technical requirements identified_'}

### Patterns Applied
${this._generatePatternsDescription(task)}`;
    }

    /**
     * Generate changes section
     * @param {Object} task - Task object
     * @param {Object} codeChanges - Code changes
     * @returns {string} Changes section
     * @private
     */
    _generateChanges(task, codeChanges) {
        return `## 📝 Changes Made

### Files Modified
${codeChanges.files ? codeChanges.files.map(file => `- \`${file}\``).join('\n') : '_Files will be listed after implementation_'}

### Summary of Changes
${codeChanges.summary || '_Detailed changes will be visible in the diff_'}

### Dependencies
${task.dependencies.length > 0 ? 
    task.dependencies.map(dep => `- **${dep.type}**: ${dep.description}`).join('\n') :
    '_No external dependencies identified_'}

### Breaking Changes
${codeChanges.breaking_changes ? 
    codeChanges.breaking_changes.map(change => `- ⚠️ ${change}`).join('\n') :
    '_No breaking changes_'}`;
    }

    /**
     * Generate testing section
     * @param {Object} task - Task object
     * @param {Object} template - Template configuration
     * @returns {string} Testing section
     * @private
     */
    _generateTesting(task, template) {
        const testingChecklist = this.getChecklist('testing');
        
        return `## 🧪 Testing

### Test Strategy
${this._generateTestStrategy(task)}

### Test Coverage
${testingChecklist.map(item => `- [ ] ${item}`).join('\n')}

### Test Scenarios
${this._generateTestScenarios(task)}

### Manual Testing Steps
${this._generateManualTestingSteps(task)}`;
    }

    /**
     * Generate acceptance criteria section
     * @param {Object} task - Task object
     * @returns {string} Acceptance criteria section
     * @private
     */
    _generateAcceptanceCriteria(task) {
        const criteria = task.parsedRequirements.acceptance_criteria;
        const defaultCriteria = [
            'Implementation matches requirements',
            'Code follows project standards',
            'Tests pass and coverage is maintained',
            'Documentation is updated',
            'No breaking changes introduced'
        ];

        const allCriteria = criteria.length > 0 ? 
            criteria.map(c => c.description) : 
            defaultCriteria;

        return `## ✅ Acceptance Criteria

${allCriteria.map(criterion => `- [ ] ${criterion}`).join('\n')}

### Quality Gates
- [ ] Code review completed
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Performance impact assessed
- [ ] Security considerations addressed`;
    }

    /**
     * Generate additional information section
     * @param {Object} task - Task object
     * @returns {string} Additional information section
     * @private
     */
    _generateAdditionalInfo(task) {
        return `## 📊 Additional Information

<details>
<summary>🔍 Complexity Analysis</summary>

### Complexity Indicators
${task.context.complexity_indicators.length > 0 ?
    task.context.complexity_indicators.map(indicator => `- ${indicator}`).join('\n') :
    '_No specific complexity indicators identified_'}

### Estimated Files Affected
${task.context.estimated_files} files

</details>

<details>
<summary>⚠️ Risk Assessment</summary>

### Risk Factors
${task.context.risk_factors.length > 0 ?
    task.context.risk_factors.map(risk => `- **${risk.type}** (${risk.level}): ${risk.description}`).join('\n') :
    '_No significant risk factors identified_'}

### Mitigation Strategies
${this._generateMitigationStrategies(task.context.risk_factors)}

</details>

<details>
<summary>🔗 Related Components</summary>

### Components Involved
${task.context.related_components.length > 0 ?
    task.context.related_components.map(comp => `- \`${comp}\``).join('\n') :
    '_No related components identified_'}

### Integration Points
${this._generateIntegrationPoints(task)}

</details>`;
    }

    /**
     * Generate checklists section
     * @param {Object} task - Task object
     * @param {Object} template - Template configuration
     * @returns {string} Checklists section
     * @private
     */
    _generateChecklists(task, template) {
        const sections = [];

        template.checklists.forEach(checklistType => {
            const checklist = this.getChecklist(checklistType);
            const title = checklistType.charAt(0).toUpperCase() + checklistType.slice(1);
            
            sections.push(`### ${title} Checklist
${checklist.map(item => `- [ ] ${item}`).join('\n')}`);
        });

        return `## 📋 Review Checklists

${sections.join('\n\n')}`;
    }

    /**
     * Generate footer section
     * @param {Object} options - Options
     * @returns {string} Footer section
     * @private
     */
    _generateFooter(options) {
        return `---

## 🤖 Automated PR Information

### Generation Details
- **Generated By**: Codegen AI System
- **Template Version**: ${options.templateVersion || '2.0'}
- **Generated At**: ${new Date().toISOString()}
- **Natural Language Processing**: Enabled

### 📞 Support
- **Documentation**: [Project Wiki](${options.wikiUrl || '#'})
- **Issues**: [Report Issues](${options.issuesUrl || '#'})
- **Team Contact**: ${options.teamContact || 'development-team'}

### 🔄 Next Steps
1. Review the implementation details
2. Check all acceptance criteria
3. Verify test coverage
4. Approve and merge when ready

---

*This PR was automatically generated from natural language requirements using advanced AI processing.*`;
    }

    /**
     * Generate approach description
     * @param {Object} task - Task object
     * @returns {string} Approach description
     * @private
     */
    _generateApproachDescription(task) {
        const type = task.parsedRequirements.type;
        const approaches = {
            'feature': 'Implemented new functionality following modular design principles',
            'bug_fix': 'Applied targeted fix to resolve the identified issue',
            'refactor': 'Improved code structure while maintaining existing functionality',
            'test': 'Added comprehensive test coverage for the target functionality',
            'documentation': 'Created clear and comprehensive documentation',
            'configuration': 'Updated configuration with proper validation and documentation',
            'integration': 'Implemented robust integration with proper error handling'
        };

        return approaches[type] || 'Applied appropriate implementation approach for the task';
    }

    /**
     * Generate patterns description
     * @param {Object} task - Task object
     * @returns {string} Patterns description
     * @private
     */
    _generatePatternsDescription(task) {
        const patterns = [
            'Error handling and validation',
            'Logging and monitoring',
            'Code organization and modularity',
            'Testing best practices'
        ];

        // Add specific patterns based on task type
        const typePatterns = {
            'feature': ['Service layer pattern', 'Dependency injection'],
            'bug_fix': ['Defensive programming', 'Input validation'],
            'refactor': ['Extract method', 'Single responsibility'],
            'integration': ['Circuit breaker', 'Retry mechanism']
        };

        const specificPatterns = typePatterns[task.parsedRequirements.type] || [];
        const allPatterns = [...patterns, ...specificPatterns];

        return allPatterns.map(pattern => `- ${pattern}`).join('\n');
    }

    /**
     * Generate test strategy
     * @param {Object} task - Task object
     * @returns {string} Test strategy
     * @private
     */
    _generateTestStrategy(task) {
        const strategies = {
            'feature': 'Comprehensive testing including unit, integration, and user acceptance tests',
            'bug_fix': 'Regression testing to ensure fix works and doesn\'t break existing functionality',
            'refactor': 'Extensive testing to verify behavior preservation during refactoring',
            'test': 'Meta-testing to ensure test quality and coverage improvements',
            'integration': 'End-to-end testing with external systems and error scenario testing'
        };

        return strategies[task.parsedRequirements.type] || 'Standard testing approach with appropriate coverage';
    }

    /**
     * Generate test scenarios
     * @param {Object} task - Task object
     * @returns {string} Test scenarios
     * @private
     */
    _generateTestScenarios(task) {
        const scenarios = [
            'Happy path functionality',
            'Error handling and edge cases',
            'Input validation scenarios',
            'Performance under load'
        ];

        return scenarios.map(scenario => `- ${scenario}`).join('\n');
    }

    /**
     * Generate manual testing steps
     * @param {Object} task - Task object
     * @returns {string} Manual testing steps
     * @private
     */
    _generateManualTestingSteps(task) {
        return `1. Verify the implementation meets all requirements
2. Test edge cases and error scenarios
3. Validate user experience and interface
4. Check performance and responsiveness
5. Ensure compatibility with existing features`;
    }

    /**
     * Generate mitigation strategies
     * @param {Array} riskFactors - Risk factors
     * @returns {string} Mitigation strategies
     * @private
     */
    _generateMitigationStrategies(riskFactors) {
        if (riskFactors.length === 0) {
            return '_No specific mitigation strategies required_';
        }

        const strategies = riskFactors.map(risk => {
            const mitigations = {
                'security': 'Implemented security best practices and validation',
                'performance': 'Added performance monitoring and optimization',
                'complexity': 'Used modular design and comprehensive testing',
                'configuration': 'Added validation and rollback procedures'
            };

            return `- **${risk.type}**: ${mitigations[risk.type] || 'Applied appropriate risk mitigation'}`;
        });

        return strategies.join('\n');
    }

    /**
     * Generate integration points
     * @param {Object} task - Task object
     * @returns {string} Integration points
     * @private
     */
    _generateIntegrationPoints(task) {
        const entities = task.parsedRequirements.entities;
        const integrationPoints = entities
            .filter(entity => entity.type === 'component' || entity.type === 'url')
            .map(entity => `- ${entity.value}`);

        return integrationPoints.length > 0 ? 
            integrationPoints.join('\n') : 
            '_No specific integration points identified_';
    }
}

export default PRTemplates;

