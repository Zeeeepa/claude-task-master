/**
 * Linear Issue Templates
 * Provides standardized templates for different types of Linear issues
 */

/**
 * Main Issue Template Generator
 */
export class MainIssueTemplate {
    constructor(projectData) {
        this.projectData = projectData;
    }

    /**
     * Generate main issue template
     * @returns {string} Formatted template
     */
    generate() {
        const {
            name,
            description,
            tasks = [],
            successCriteria = [],
            requirements = [],
            technicalSpecs,
            estimatedEffort,
            priority = 'High'
        } = this.projectData;

        let template = `# 🚀 ${name} - Autonomous Development Pipeline\n\n`;
        
        template += `## 🎯 Objective\n${description || 'No description provided'}\n\n`;

        if (tasks.length > 0) {
            template += `## 📋 Sub-Issues Breakdown\n`;
            tasks.forEach((task, index) => {
                template += `${index + 1}. **${task.title}** - ${task.description || 'No description'}\n`;
                if (task.estimatedHours) {
                    template += `   - *Estimated: ${task.estimatedHours}h*\n`;
                }
                if (task.complexity) {
                    template += `   - *Complexity: ${task.complexity}*\n`;
                }
            });
            template += '\n';
        }

        template += `## 🔄 Workflow Status\n`;
        template += `- [ ] Requirements Analysis Complete\n`;
        template += `- [ ] Task Decomposition Complete\n`;
        template += `- [ ] Implementation Started\n`;
        template += `- [ ] Testing & Validation\n`;
        template += `- [ ] Deployment Ready\n`;
        template += `- [ ] Production Deployed\n\n`;

        template += `## 📈 Progress Tracking\n`;
        template += `- **Total Sub-Issues**: ${tasks.length}\n`;
        template += `- **Completed**: 0\n`;
        template += `- **In Progress**: 0\n`;
        template += `- **Blocked**: 0\n\n`;

        if (requirements.length > 0) {
            template += `## 📋 Requirements\n`;
            requirements.forEach(req => {
                template += `- ${req}\n`;
            });
            template += '\n';
        }

        if (successCriteria.length > 0) {
            template += `## 🎯 Success Criteria\n`;
            successCriteria.forEach(criteria => {
                template += `- ${criteria}\n`;
            });
            template += '\n';
        }

        if (technicalSpecs) {
            template += `## 🔧 Technical Specifications\n${technicalSpecs}\n\n`;
        }

        template += `## 📊 Project Metrics\n`;
        template += `- **Priority**: ${priority}\n`;
        if (estimatedEffort) template += `- **Estimated Effort**: ${estimatedEffort}\n`;
        template += `- **Created**: ${new Date().toISOString().split('T')[0]}\n`;
        template += `- **Status**: In Planning\n\n`;

        template += `---\n**Created by**: Autonomous CICD Orchestrator\n`;
        template += `**Project Type**: Main Implementation\n`;
        
        return template;
    }
}

/**
 * Sub-Issue Template Generator
 */
export class SubIssueTemplate {
    constructor(taskData, parentIssue = null) {
        this.taskData = taskData;
        this.parentIssue = parentIssue;
    }

    /**
     * Generate sub-issue template
     * @returns {string} Formatted template
     */
    generate() {
        const {
            title,
            description,
            technicalSpecs,
            files = [],
            acceptanceCriteria = [],
            dependencies = [],
            complexity = 'Medium',
            estimatedHours,
            priority = 0
        } = this.taskData;

        let template = `# 📋 ${title}\n\n`;
        
        if (description) {
            template += `## 📝 Description\n${description}\n\n`;
        }

        if (technicalSpecs) {
            template += `## 🔧 Technical Specifications\n${technicalSpecs}\n\n`;
        }

        if (files.length > 0) {
            template += `## 📁 Affected Files\n`;
            files.forEach(file => {
                template += `- \`${file}\`\n`;
            });
            template += '\n';
        }

        if (acceptanceCriteria.length > 0) {
            template += `## ✅ Acceptance Criteria\n`;
            acceptanceCriteria.forEach(criteria => {
                template += `- [ ] ${criteria}\n`;
            });
            template += '\n';
        }

        if (dependencies.length > 0) {
            template += `## 🔗 Dependencies\n`;
            dependencies.forEach(dep => {
                template += `- ${dep}\n`;
            });
            template += '\n';
        }

        template += `## 📊 Implementation Status\n`;
        template += `- [ ] Analysis Complete\n`;
        template += `- [ ] Implementation Started\n`;
        template += `- [ ] Code Review\n`;
        template += `- [ ] Testing Complete\n`;
        template += `- [ ] PR Created\n`;
        template += `- [ ] Merged to Main\n\n`;

        template += `## 📈 Task Metrics\n`;
        template += `- **Complexity**: ${complexity}\n`;
        template += `- **Priority**: ${priority}\n`;
        if (estimatedHours) template += `- **Estimated Hours**: ${estimatedHours}h\n`;
        template += `- **Created**: ${new Date().toISOString().split('T')[0]}\n\n`;

        template += `---\n**Auto-assigned to**: Codegen\n`;
        if (this.parentIssue) {
            template += `**Parent Issue**: ${this.parentIssue.identifier || this.parentIssue.id}\n`;
        }
        template += `**Task Type**: Implementation Sub-Issue\n`;
        
        return template;
    }
}

/**
 * Bug Report Template Generator
 */
export class BugReportTemplate {
    constructor(bugData) {
        this.bugData = bugData;
    }

    /**
     * Generate bug report template
     * @returns {string} Formatted template
     */
    generate() {
        const {
            title,
            description,
            stepsToReproduce = [],
            expectedBehavior,
            actualBehavior,
            environment = {},
            severity = 'Medium',
            affectedFiles = [],
            errorLogs = []
        } = this.bugData;

        let template = `# 🐛 ${title}\n\n`;
        
        if (description) {
            template += `## 📝 Description\n${description}\n\n`;
        }

        if (stepsToReproduce.length > 0) {
            template += `## 🔄 Steps to Reproduce\n`;
            stepsToReproduce.forEach((step, index) => {
                template += `${index + 1}. ${step}\n`;
            });
            template += '\n';
        }

        if (expectedBehavior) {
            template += `## ✅ Expected Behavior\n${expectedBehavior}\n\n`;
        }

        if (actualBehavior) {
            template += `## ❌ Actual Behavior\n${actualBehavior}\n\n`;
        }

        if (Object.keys(environment).length > 0) {
            template += `## 🌍 Environment\n`;
            Object.entries(environment).forEach(([key, value]) => {
                template += `- **${key}**: ${value}\n`;
            });
            template += '\n';
        }

        if (affectedFiles.length > 0) {
            template += `## 📁 Affected Files\n`;
            affectedFiles.forEach(file => {
                template += `- \`${file}\`\n`;
            });
            template += '\n';
        }

        if (errorLogs.length > 0) {
            template += `## 📋 Error Logs\n`;
            errorLogs.forEach(log => {
                template += `\`\`\`\n${log}\n\`\`\`\n\n`;
            });
        }

        template += `## 📊 Bug Details\n`;
        template += `- **Severity**: ${severity}\n`;
        template += `- **Reported**: ${new Date().toISOString().split('T')[0]}\n`;
        template += `- **Status**: New\n\n`;

        template += `---\n**Reported by**: Autonomous CICD System\n`;
        template += `**Issue Type**: Bug Report\n`;
        
        return template;
    }
}

/**
 * Feature Request Template Generator
 */
export class FeatureRequestTemplate {
    constructor(featureData) {
        this.featureData = featureData;
    }

    /**
     * Generate feature request template
     * @returns {string} Formatted template
     */
    generate() {
        const {
            title,
            description,
            userStory,
            acceptanceCriteria = [],
            technicalRequirements = [],
            designSpecs,
            priority = 'Medium',
            estimatedEffort,
            businessValue
        } = this.featureData;

        let template = `# ✨ ${title}\n\n`;
        
        if (description) {
            template += `## 📝 Description\n${description}\n\n`;
        }

        if (userStory) {
            template += `## 👤 User Story\n${userStory}\n\n`;
        }

        if (acceptanceCriteria.length > 0) {
            template += `## ✅ Acceptance Criteria\n`;
            acceptanceCriteria.forEach(criteria => {
                template += `- [ ] ${criteria}\n`;
            });
            template += '\n';
        }

        if (technicalRequirements.length > 0) {
            template += `## 🔧 Technical Requirements\n`;
            technicalRequirements.forEach(req => {
                template += `- ${req}\n`;
            });
            template += '\n';
        }

        if (designSpecs) {
            template += `## 🎨 Design Specifications\n${designSpecs}\n\n`;
        }

        if (businessValue) {
            template += `## 💼 Business Value\n${businessValue}\n\n`;
        }

        template += `## 📊 Feature Details\n`;
        template += `- **Priority**: ${priority}\n`;
        if (estimatedEffort) template += `- **Estimated Effort**: ${estimatedEffort}\n`;
        template += `- **Requested**: ${new Date().toISOString().split('T')[0]}\n`;
        template += `- **Status**: Requested\n\n`;

        template += `---\n**Requested by**: Autonomous CICD System\n`;
        template += `**Issue Type**: Feature Request\n`;
        
        return template;
    }
}

/**
 * Restructure Issue Template Generator
 */
export class RestructureTemplate {
    constructor(originalIssue, errors = []) {
        this.originalIssue = originalIssue;
        this.errors = errors;
    }

    /**
     * Generate restructure template
     * @returns {string} Formatted template
     */
    generate() {
        const { title, id } = this.originalIssue;

        let template = `# 🔧 Restructure: ${title}\n\n`;
        
        template += `## 🚨 Issue Analysis\n`;
        template += `The original implementation encountered errors that require restructuring.\n\n`;
        template += `**Original Issue**: ${id}\n\n`;

        if (this.errors.length > 0) {
            template += `## ❌ Detected Errors\n`;
            this.errors.forEach((error, index) => {
                template += `### Error ${index + 1}: ${error.type || 'Unknown'}\n`;
                template += `**Message**: ${error.message}\n`;
                if (error.file) template += `**File**: \`${error.file}\`\n`;
                if (error.line) template += `**Line**: ${error.line}\n`;
                if (error.severity) template += `**Severity**: ${error.severity}\n`;
                template += '\n';
            });
        }

        template += `## 🔧 Restructure Plan\n`;
        template += `- [ ] Analyze root cause of errors\n`;
        template += `- [ ] Revise implementation approach\n`;
        template += `- [ ] Update technical specifications\n`;
        template += `- [ ] Implement corrected solution\n`;
        template += `- [ ] Validate fixes\n`;
        template += `- [ ] Update parent issue\n\n`;

        template += `## 📊 Error Summary\n`;
        template += `- **Total Errors**: ${this.errors.length}\n`;
        template += `- **Error Types**: ${[...new Set(this.errors.map(e => e.type || 'Unknown'))].join(', ')}\n`;
        template += `- **Severity**: ${this.calculateErrorSeverity()}\n\n`;

        template += `## 🎯 Success Criteria\n`;
        template += `- [ ] All identified errors resolved\n`;
        template += `- [ ] Implementation passes validation\n`;
        template += `- [ ] Code quality meets standards\n`;
        template += `- [ ] Tests pass successfully\n`;
        template += `- [ ] Parent issue can proceed\n\n`;

        template += `---\n**Auto-assigned to**: Codegen\n`;
        template += `**Priority**: High (Restructure Required)\n`;
        template += `**Issue Type**: Restructure\n`;
        
        return template;
    }

    /**
     * Calculate error severity
     * @returns {string} Severity level
     */
    calculateErrorSeverity() {
        const criticalKeywords = ['syntax', 'compile', 'fatal', 'critical'];
        const hasCritical = this.errors.some(error => 
            criticalKeywords.some(keyword => 
                error.message.toLowerCase().includes(keyword)
            )
        );
        
        if (hasCritical) return 'Critical';
        if (this.errors.length > 5) return 'High';
        if (this.errors.length > 2) return 'Medium';
        return 'Low';
    }
}

/**
 * Template Factory
 * Factory class for creating different types of issue templates
 */
export class TemplateFactory {
    /**
     * Create main issue template
     * @param {Object} projectData - Project data
     * @returns {MainIssueTemplate} Template instance
     */
    static createMainIssue(projectData) {
        return new MainIssueTemplate(projectData);
    }

    /**
     * Create sub-issue template
     * @param {Object} taskData - Task data
     * @param {Object} parentIssue - Parent issue data
     * @returns {SubIssueTemplate} Template instance
     */
    static createSubIssue(taskData, parentIssue = null) {
        return new SubIssueTemplate(taskData, parentIssue);
    }

    /**
     * Create bug report template
     * @param {Object} bugData - Bug data
     * @returns {BugReportTemplate} Template instance
     */
    static createBugReport(bugData) {
        return new BugReportTemplate(bugData);
    }

    /**
     * Create feature request template
     * @param {Object} featureData - Feature data
     * @returns {FeatureRequestTemplate} Template instance
     */
    static createFeatureRequest(featureData) {
        return new FeatureRequestTemplate(featureData);
    }

    /**
     * Create restructure template
     * @param {Object} originalIssue - Original issue data
     * @param {Array} errors - Array of errors
     * @returns {RestructureTemplate} Template instance
     */
    static createRestructure(originalIssue, errors = []) {
        return new RestructureTemplate(originalIssue, errors);
    }

    /**
     * Get template by type
     * @param {string} type - Template type
     * @param {Object} data - Template data
     * @param {Object} options - Additional options
     * @returns {Object} Template instance
     */
    static getTemplate(type, data, options = {}) {
        switch (type.toLowerCase()) {
            case 'main':
            case 'main-issue':
                return this.createMainIssue(data);
            case 'sub':
            case 'sub-issue':
                return this.createSubIssue(data, options.parentIssue);
            case 'bug':
            case 'bug-report':
                return this.createBugReport(data);
            case 'feature':
            case 'feature-request':
                return this.createFeatureRequest(data);
            case 'restructure':
                return this.createRestructure(data, options.errors);
            default:
                throw new Error(`Unknown template type: ${type}`);
        }
    }
}

export default TemplateFactory;

