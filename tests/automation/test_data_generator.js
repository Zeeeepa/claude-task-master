/**
 * Test Data Generator - Automated Test Data Generation
 * 
 * Generates realistic test data for various testing scenarios including
 * requirements, tasks, workflows, webhooks, and performance test data.
 */

import { randomBytes } from 'crypto';

export class TestDataGenerator {
    constructor(config = {}) {
        this.config = {
            seed: config.seed || Date.now(),
            locale: config.locale || 'en-US',
            complexity: config.complexity || 'medium',
            ...config
        };
        
        this.random = this.createSeededRandom(this.config.seed);
        this.generatedData = new Map();
    }

    /**
     * Generate complex requirements for testing
     */
    async generateComplexRequirement() {
        const requirementTypes = [
            'feature_implementation',
            'bug_fix',
            'performance_optimization',
            'security_enhancement',
            'integration_task'
        ];

        const complexityLevels = {
            simple: { steps: 3, dependencies: 1, estimatedHours: 2 },
            medium: { steps: 7, dependencies: 3, estimatedHours: 8 },
            complex: { steps: 15, dependencies: 8, estimatedHours: 24 }
        };

        const type = this.randomChoice(requirementTypes);
        const complexity = complexityLevels[this.config.complexity];

        const requirement = {
            id: this.generateId('req'),
            type,
            title: this.generateRequirementTitle(type),
            description: this.generateRequirementDescription(type),
            priority: this.randomChoice(['low', 'medium', 'high', 'critical']),
            complexity: this.config.complexity,
            estimatedHours: complexity.estimatedHours,
            dependencies: this.generateDependencies(complexity.dependencies),
            acceptanceCriteria: this.generateAcceptanceCriteria(complexity.steps),
            technicalRequirements: this.generateTechnicalRequirements(type),
            businessValue: this.generateBusinessValue(),
            stakeholders: this.generateStakeholders(),
            tags: this.generateTags(type),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.generatedData.set(requirement.id, requirement);
        return requirement;
    }

    /**
     * Generate multiple requirements
     */
    async generateMultipleRequirements(count) {
        const requirements = [];
        for (let i = 0; i < count; i++) {
            requirements.push(await this.generateComplexRequirement());
        }
        return requirements;
    }

    /**
     * Generate data-intensive requirement
     */
    async generateDataIntensiveRequirement() {
        const requirement = await this.generateComplexRequirement();
        
        // Add data-intensive aspects
        requirement.dataRequirements = {
            inputDataSize: this.randomInt(1000, 100000),
            outputDataSize: this.randomInt(500, 50000),
            dataFormats: this.randomChoices(['json', 'xml', 'csv', 'binary'], 2),
            dataValidation: this.generateDataValidationRules(),
            dataTransformation: this.generateDataTransformationRules(),
            dataStorage: this.generateDataStorageRequirements()
        };

        requirement.performanceRequirements = {
            maxProcessingTime: this.randomInt(1000, 30000),
            maxMemoryUsage: this.randomInt(100, 2048),
            throughputRequirement: this.randomInt(100, 10000),
            concurrencyRequirement: this.randomInt(10, 1000)
        };

        return requirement;
    }

    /**
     * Generate complex workflow
     */
    async generateComplexWorkflow() {
        const workflowTypes = [
            'sequential',
            'parallel',
            'conditional',
            'loop',
            'hybrid'
        ];

        const workflow = {
            id: this.generateId('wf'),
            name: this.generateWorkflowName(),
            type: this.randomChoice(workflowTypes),
            description: this.generateWorkflowDescription(),
            steps: this.generateWorkflowSteps(),
            conditions: this.generateWorkflowConditions(),
            errorHandling: this.generateErrorHandlingRules(),
            timeout: this.randomInt(30000, 300000),
            retryPolicy: this.generateRetryPolicy(),
            metadata: this.generateWorkflowMetadata(),
            createdAt: new Date().toISOString()
        };

        this.generatedData.set(workflow.id, workflow);
        return workflow;
    }

    /**
     * Generate dependent workflows
     */
    async generateDependentWorkflows(count) {
        const workflows = [];
        const dependencies = new Map();

        for (let i = 0; i < count; i++) {
            const workflow = await this.generateComplexWorkflow();
            
            // Add dependencies to previous workflows
            if (i > 0) {
                const dependencyCount = Math.min(i, this.randomInt(1, 3));
                workflow.dependencies = [];
                
                for (let j = 0; j < dependencyCount; j++) {
                    const dependentWorkflow = workflows[this.randomInt(0, i)];
                    workflow.dependencies.push({
                        workflowId: dependentWorkflow.id,
                        type: this.randomChoice(['completion', 'success', 'data_availability']),
                        condition: this.generateDependencyCondition()
                    });
                }
            }
            
            workflows.push(workflow);
        }

        return workflows;
    }

    /**
     * Generate monitored workflows
     */
    async generateMonitoredWorkflows(count) {
        const workflows = [];
        
        for (let i = 0; i < count; i++) {
            const workflow = await this.generateComplexWorkflow();
            
            workflow.monitoring = {
                enabled: true,
                metrics: this.randomChoices([
                    'execution_time',
                    'memory_usage',
                    'cpu_usage',
                    'error_rate',
                    'throughput'
                ], 3),
                alerts: this.generateAlertRules(),
                dashboards: this.generateDashboardConfig(),
                logging: {
                    level: this.randomChoice(['debug', 'info', 'warn', 'error']),
                    format: this.randomChoice(['json', 'text', 'structured']),
                    retention: this.randomInt(7, 90)
                }
            };
            
            workflows.push(workflow);
        }

        return workflows;
    }

    /**
     * Generate task data
     */
    async generateTaskData(count) {
        const tasks = [];
        
        for (let i = 0; i < count; i++) {
            const task = {
                id: this.generateId('task'),
                title: this.generateTaskTitle(),
                description: this.generateTaskDescription(),
                type: this.randomChoice(['feature', 'bug', 'enhancement', 'maintenance']),
                status: this.randomChoice(['pending', 'in_progress', 'completed', 'failed']),
                priority: this.randomChoice(['low', 'medium', 'high', 'critical']),
                assignee: this.generateAssignee(),
                estimatedHours: this.randomInt(1, 40),
                actualHours: this.randomInt(1, 50),
                tags: this.generateTags(),
                metadata: this.generateTaskMetadata(),
                createdAt: this.generateRandomDate(-30),
                updatedAt: this.generateRandomDate(-1),
                dueDate: this.generateRandomDate(7)
            };
            
            tasks.push(task);
        }

        return tasks;
    }

    /**
     * Generate database test data
     */
    async generateDatabaseTestData() {
        return {
            users: this.generateUsers(100),
            tasks: await this.generateTaskData(500),
            workflows: await this.generateDependentWorkflows(50),
            projects: this.generateProjects(20),
            organizations: this.generateOrganizations(5),
            configurations: this.generateConfigurations(30),
            auditLogs: this.generateAuditLogs(1000),
            metrics: this.generateMetrics(5000)
        };
    }

    /**
     * Generate codegen tasks
     */
    async generateCodegenTasks() {
        const tasks = [];
        const taskTypes = [
            'component_creation',
            'api_endpoint',
            'database_migration',
            'test_implementation',
            'documentation_update'
        ];

        for (let i = 0; i < 5; i++) {
            const task = {
                id: this.generateId('cg_task'),
                type: this.randomChoice(taskTypes),
                prompt: this.generateCodegenPrompt(),
                context: this.generateCodegenContext(),
                requirements: this.generateCodegenRequirements(),
                constraints: this.generateCodegenConstraints(),
                expectedOutput: this.generateExpectedOutput(),
                priority: this.randomChoice(['low', 'medium', 'high']),
                complexity: this.randomChoice(['simple', 'medium', 'complex']),
                estimatedTokens: this.randomInt(500, 5000),
                createdAt: new Date().toISOString()
            };
            
            tasks.push(task);
        }

        return tasks;
    }

    /**
     * Generate agent requests
     */
    async generateAgentRequests() {
        const requests = [];
        const requestTypes = [
            'task_execution',
            'code_review',
            'documentation_generation',
            'testing_assistance',
            'deployment_support'
        ];

        for (let i = 0; i < 10; i++) {
            const request = {
                id: this.generateId('agent_req'),
                type: this.randomChoice(requestTypes),
                agentId: this.generateId('agent'),
                sessionId: this.generateId('session'),
                payload: this.generateAgentPayload(),
                headers: this.generateRequestHeaders(),
                metadata: this.generateRequestMetadata(),
                timeout: this.randomInt(30000, 300000),
                retryCount: this.randomInt(0, 3),
                createdAt: new Date().toISOString()
            };
            
            requests.push(request);
        }

        return requests;
    }

    /**
     * Generate webhook events
     */
    async generateWebhookEvents(count = 10) {
        const events = [];
        const eventTypes = [
            'pull_request.opened',
            'pull_request.closed',
            'push',
            'issue.created',
            'issue.updated',
            'deployment.created',
            'workflow.completed'
        ];

        for (let i = 0; i < count; i++) {
            const event = {
                id: this.generateId('webhook'),
                type: this.randomChoice(eventTypes),
                source: this.randomChoice(['github', 'gitlab', 'bitbucket', 'internal']),
                payload: this.generateWebhookPayload(),
                headers: this.generateWebhookHeaders(),
                signature: this.generateSignature(),
                timestamp: new Date().toISOString(),
                deliveryId: this.generateId('delivery'),
                attempt: this.randomInt(1, 3)
            };
            
            events.push(event);
        }

        return events;
    }

    /**
     * Generate requirements for testing
     */
    async generateRequirements(count) {
        const requirements = [];
        
        for (let i = 0; i < count; i++) {
            requirements.push(await this.generateComplexRequirement());
        }

        return requirements;
    }

    /**
     * Generate validation tasks
     */
    async generateValidationTasks(count) {
        const tasks = [];
        const validationTypes = [
            'code_quality',
            'security_scan',
            'performance_test',
            'integration_test',
            'compliance_check'
        ];

        for (let i = 0; i < count; i++) {
            const task = {
                id: this.generateId('val_task'),
                type: this.randomChoice(validationTypes),
                target: this.generateValidationTarget(),
                criteria: this.generateValidationCriteria(),
                thresholds: this.generateValidationThresholds(),
                configuration: this.generateValidationConfiguration(),
                expectedResults: this.generateExpectedValidationResults(),
                createdAt: new Date().toISOString()
            };
            
            tasks.push(task);
        }

        return tasks;
    }

    // Helper methods for generating specific data types

    generateRequirementTitle(type) {
        const titles = {
            feature_implementation: [
                'Implement user authentication system',
                'Add real-time notifications',
                'Create dashboard analytics',
                'Build API rate limiting',
                'Develop file upload functionality'
            ],
            bug_fix: [
                'Fix memory leak in data processor',
                'Resolve authentication timeout issues',
                'Correct calculation errors in reports',
                'Fix broken pagination',
                'Resolve database connection issues'
            ],
            performance_optimization: [
                'Optimize database query performance',
                'Improve API response times',
                'Reduce memory usage in workers',
                'Optimize image loading',
                'Improve caching strategy'
            ],
            security_enhancement: [
                'Implement input validation',
                'Add SQL injection protection',
                'Enhance password security',
                'Implement audit logging',
                'Add rate limiting protection'
            ],
            integration_task: [
                'Integrate with payment gateway',
                'Connect to external API',
                'Setup CI/CD pipeline',
                'Integrate monitoring system',
                'Connect to analytics platform'
            ]
        };

        return this.randomChoice(titles[type] || titles.feature_implementation);
    }

    generateRequirementDescription(type) {
        const descriptions = {
            feature_implementation: 'Implement a new feature that enhances user experience and provides additional functionality to the system.',
            bug_fix: 'Identify and resolve a critical issue that is affecting system functionality and user experience.',
            performance_optimization: 'Optimize system performance to improve response times and resource utilization.',
            security_enhancement: 'Enhance system security by implementing additional security measures and best practices.',
            integration_task: 'Integrate with external systems or services to extend system capabilities.'
        };

        return descriptions[type] || descriptions.feature_implementation;
    }

    generateDependencies(count) {
        const dependencies = [];
        for (let i = 0; i < count; i++) {
            dependencies.push({
                id: this.generateId('dep'),
                type: this.randomChoice(['blocking', 'related', 'prerequisite']),
                description: 'Dependency description',
                status: this.randomChoice(['pending', 'in_progress', 'completed'])
            });
        }
        return dependencies;
    }

    generateAcceptanceCriteria(count) {
        const criteria = [];
        for (let i = 0; i < count; i++) {
            criteria.push({
                id: this.generateId('ac'),
                description: `Acceptance criteria ${i + 1}`,
                priority: this.randomChoice(['must', 'should', 'could']),
                testable: true,
                status: this.randomChoice(['pending', 'verified', 'failed'])
            });
        }
        return criteria;
    }

    generateTechnicalRequirements(type) {
        return {
            technologies: this.randomChoices(['Node.js', 'React', 'PostgreSQL', 'Redis', 'Docker'], 3),
            frameworks: this.randomChoices(['Express', 'Jest', 'Webpack', 'Babel'], 2),
            libraries: this.randomChoices(['lodash', 'axios', 'moment', 'uuid'], 2),
            apis: this.randomChoices(['REST', 'GraphQL', 'WebSocket'], 1),
            databases: this.randomChoices(['PostgreSQL', 'MongoDB', 'Redis'], 1),
            infrastructure: this.randomChoices(['AWS', 'Docker', 'Kubernetes'], 1)
        };
    }

    generateBusinessValue() {
        return {
            impact: this.randomChoice(['low', 'medium', 'high', 'critical']),
            urgency: this.randomChoice(['low', 'medium', 'high', 'critical']),
            roi: this.randomInt(10, 500),
            userBenefit: 'Improves user experience and system efficiency',
            businessBenefit: 'Increases operational efficiency and reduces costs'
        };
    }

    generateStakeholders() {
        const roles = ['Product Manager', 'Engineering Lead', 'QA Lead', 'DevOps Engineer', 'Business Analyst'];
        return this.randomChoices(roles, this.randomInt(2, 4)).map(role => ({
            role,
            name: this.generatePersonName(),
            email: this.generateEmail(),
            involvement: this.randomChoice(['primary', 'secondary', 'reviewer'])
        }));
    }

    generateTags(type) {
        const baseTags = ['backend', 'frontend', 'api', 'database', 'security', 'performance'];
        const typeTags = {
            feature_implementation: ['feature', 'enhancement'],
            bug_fix: ['bug', 'fix', 'critical'],
            performance_optimization: ['performance', 'optimization'],
            security_enhancement: ['security', 'compliance'],
            integration_task: ['integration', 'external']
        };

        return this.randomChoices([...baseTags, ...(typeTags[type] || [])], this.randomInt(2, 5));
    }

    generateWorkflowSteps() {
        const stepCount = this.randomInt(3, 10);
        const steps = [];
        
        for (let i = 0; i < stepCount; i++) {
            steps.push({
                id: this.generateId('step'),
                name: `Step ${i + 1}`,
                type: this.randomChoice(['action', 'condition', 'loop', 'parallel']),
                description: `Workflow step ${i + 1} description`,
                timeout: this.randomInt(5000, 60000),
                retryPolicy: this.generateRetryPolicy(),
                dependencies: i > 0 ? [steps[i - 1].id] : [],
                configuration: this.generateStepConfiguration()
            });
        }
        
        return steps;
    }

    generateRetryPolicy() {
        return {
            maxAttempts: this.randomInt(1, 5),
            backoffStrategy: this.randomChoice(['linear', 'exponential', 'fixed']),
            initialDelay: this.randomInt(1000, 5000),
            maxDelay: this.randomInt(30000, 300000),
            retryOn: this.randomChoices(['timeout', 'error', 'failure'], 2)
        };
    }

    generateUsers(count) {
        const users = [];
        for (let i = 0; i < count; i++) {
            users.push({
                id: this.generateId('user'),
                name: this.generatePersonName(),
                email: this.generateEmail(),
                role: this.randomChoice(['admin', 'user', 'viewer', 'editor']),
                status: this.randomChoice(['active', 'inactive', 'suspended']),
                createdAt: this.generateRandomDate(-365),
                lastLoginAt: this.generateRandomDate(-7)
            });
        }
        return users;
    }

    generateProjects(count) {
        const projects = [];
        for (let i = 0; i < count; i++) {
            projects.push({
                id: this.generateId('proj'),
                name: this.generateProjectName(),
                description: 'Project description',
                status: this.randomChoice(['active', 'completed', 'on_hold', 'cancelled']),
                priority: this.randomChoice(['low', 'medium', 'high', 'critical']),
                startDate: this.generateRandomDate(-180),
                endDate: this.generateRandomDate(180),
                budget: this.randomInt(10000, 1000000),
                teamSize: this.randomInt(3, 20)
            });
        }
        return projects;
    }

    // Utility methods

    generateId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generatePersonName() {
        const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'David', 'Lisa', 'Chris', 'Emma'];
        const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
        return `${this.randomChoice(firstNames)} ${this.randomChoice(lastNames)}`;
    }

    generateEmail() {
        const domains = ['example.com', 'test.org', 'demo.net', 'sample.io'];
        const name = this.generatePersonName().toLowerCase().replace(' ', '.');
        return `${name}@${this.randomChoice(domains)}`;
    }

    generateProjectName() {
        const adjectives = ['Advanced', 'Smart', 'Efficient', 'Robust', 'Scalable', 'Innovative'];
        const nouns = ['Platform', 'System', 'Application', 'Service', 'Framework', 'Solution'];
        return `${this.randomChoice(adjectives)} ${this.randomChoice(nouns)}`;
    }

    generateRandomDate(daysOffset) {
        const date = new Date();
        date.setDate(date.getDate() + daysOffset);
        return date.toISOString();
    }

    randomChoice(array) {
        return array[Math.floor(this.random() * array.length)];
    }

    randomChoices(array, count) {
        const shuffled = [...array].sort(() => this.random() - 0.5);
        return shuffled.slice(0, Math.min(count, array.length));
    }

    randomInt(min, max) {
        return Math.floor(this.random() * (max - min + 1)) + min;
    }

    createSeededRandom(seed) {
        let state = seed;
        return function() {
            state = (state * 1664525 + 1013904223) % 4294967296;
            return state / 4294967296;
        };
    }

    // Cleanup method
    async cleanupTestData() {
        this.generatedData.clear();
    }

    getGeneratedData(id) {
        return this.generatedData.get(id);
    }

    getAllGeneratedData() {
        return Array.from(this.generatedData.values());
    }
}

