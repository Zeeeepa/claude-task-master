/**
 * Component Integration Tests
 * 
 * Validates integration between all system components including database layer,
 * workflow orchestrator, codegen integration, AgentAPI middleware, deployment
 * automation, webhook system, and monitoring system.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { ComponentTestFramework } from '../automation/component_test_framework.js';
import { IntegrationValidator } from '../validation/integration_validator.js';
import { TestDataGenerator } from '../automation/test_data_generator.js';

describe('Component Integration Tests', () => {
    let componentFramework;
    let integrationValidator;
    let testDataGenerator;

    beforeAll(async () => {
        componentFramework = new ComponentTestFramework();
        integrationValidator = new IntegrationValidator();
        testDataGenerator = new TestDataGenerator();
        
        await componentFramework.initialize();
    });

    afterAll(async () => {
        await componentFramework.cleanup();
    });

    beforeEach(async () => {
        await componentFramework.resetComponents();
    });

    describe('Database Layer Integration (ZAM-598, ZAM-603, ZAM-610)', () => {
        test('should integrate with PostgreSQL for task storage', async () => {
            const testTasks = await testDataGenerator.generateTaskData(10);
            
            const dbIntegration = await componentFramework.testDatabaseIntegration({
                tasks: testTasks,
                operations: ['create', 'read', 'update', 'delete', 'query', 'transaction']
            });

            expect(dbIntegration.connectionEstablished).toBe(true);
            expect(dbIntegration.tasksStored).toBe(10);
            expect(dbIntegration.queryPerformance.averageTime).toBeLessThan(50);
            expect(dbIntegration.transactionIntegrity).toBe(true);
        });

        test('should handle database connection pooling', async () => {
            const poolTest = await componentFramework.testConnectionPooling({
                maxConnections: 20,
                concurrentRequests: 50
            });

            expect(poolTest.poolManagement).toBe(true);
            expect(poolTest.connectionReuse).toBe(true);
            expect(poolTest.noConnectionLeaks).toBe(true);
        });

        test('should validate database migration system', async () => {
            const migrationTest = await componentFramework.testDatabaseMigrations({
                testMigrations: ['001_initial_schema', '002_add_indexes', '003_add_constraints']
            });

            expect(migrationTest.migrationsExecuted).toBe(true);
            expect(migrationTest.schemaConsistency).toBe(true);
            expect(migrationTest.rollbackCapability).toBe(true);
        });

        test('should validate database performance under load', async () => {
            const loadTest = await componentFramework.testDatabaseLoad({
                concurrentConnections: 100,
                operationsPerSecond: 1000,
                duration: 30000 // 30 seconds
            });

            expect(loadTest.performanceStable).toBe(true);
            expect(loadTest.responseTime.p95).toBeLessThan(100);
            expect(loadTest.errorRate).toBeLessThan(0.01);
        });
    });

    describe('Workflow Orchestrator Integration (ZAM-619)', () => {
        test('should validate workflow execution and state management', async () => {
            const testWorkflow = await testDataGenerator.generateComplexWorkflow();
            
            const orchestratorTest = await componentFramework.testWorkflowOrchestrator({
                workflow: testWorkflow,
                validateStateTransitions: true,
                trackExecution: true
            });

            expect(orchestratorTest.workflowExecuted).toBe(true);
            expect(orchestratorTest.stateManagement.consistent).toBe(true);
            expect(orchestratorTest.stepExecution.allSuccessful).toBe(true);
            expect(orchestratorTest.errorHandling.graceful).toBe(true);
        });

        test('should handle workflow dependencies and ordering', async () => {
            const dependencyTest = await componentFramework.testWorkflowDependencies({
                workflows: await testDataGenerator.generateDependentWorkflows(5),
                validateOrdering: true
            });

            expect(dependencyTest.dependencyResolution).toBe(true);
            expect(dependencyTest.executionOrder.correct).toBe(true);
            expect(dependencyTest.parallelExecution.optimized).toBe(true);
        });

        test('should validate workflow recovery mechanisms', async () => {
            const recoveryTest = await componentFramework.testWorkflowRecovery({
                injectFailures: ['network_timeout', 'service_unavailable', 'data_corruption'],
                validateRecovery: true
            });

            expect(recoveryTest.failureDetection).toBe(true);
            expect(recoveryTest.automaticRecovery).toBe(true);
            expect(recoveryTest.stateConsistency).toBe(true);
        });

        test('should validate workflow monitoring and metrics', async () => {
            const monitoringTest = await componentFramework.testWorkflowMonitoring({
                workflows: await testDataGenerator.generateMonitoredWorkflows(3),
                collectMetrics: true
            });

            expect(monitoringTest.metricsCollection).toBe(true);
            expect(monitoringTest.performanceTracking).toBe(true);
            expect(monitoringTest.alertGeneration).toBe(true);
        });
    });

    describe('Codegen Integration (ZAM-629)', () => {
        test('should test codegen API integration and response handling', async () => {
            const codegenTasks = await testDataGenerator.generateCodegenTasks();
            
            const codegenTest = await componentFramework.testCodegenIntegration({
                tasks: codegenTasks,
                validateAPI: true,
                trackResponses: true
            });

            expect(codegenTest.apiConnection).toBe(true);
            expect(codegenTest.requestHandling.successful).toBe(true);
            expect(codegenTest.responseProcessing.accurate).toBe(true);
            expect(codegenTest.prCreation.successful).toBe(true);
        });

        test('should validate codegen prompt generation', async () => {
            const promptTest = await componentFramework.testPromptGeneration({
                requirements: await testDataGenerator.generateRequirements(10),
                validateQuality: true
            });

            expect(promptTest.promptGeneration.successful).toBe(true);
            expect(promptTest.contextPreservation).toBe(true);
            expect(promptTest.promptQuality.score).toBeGreaterThan(0.8);
        });

        test('should test codegen rate limiting and retry logic', async () => {
            const rateLimitTest = await componentFramework.testCodegenRateLimit({
                requestsPerMinute: 100,
                validateRetry: true
            });

            expect(rateLimitTest.rateLimitHandling).toBe(true);
            expect(rateLimitTest.retryMechanism.working).toBe(true);
            expect(rateLimitTest.backoffStrategy.exponential).toBe(true);
        });

        test('should validate codegen error handling', async () => {
            const errorTest = await componentFramework.testCodegenErrorHandling({
                errorScenarios: ['api_timeout', 'invalid_response', 'rate_limit_exceeded'],
                validateRecovery: true
            });

            expect(errorTest.errorDetection).toBe(true);
            expect(errorTest.errorRecovery).toBe(true);
            expect(errorTest.gracefulDegradation).toBe(true);
        });
    });

    describe('AgentAPI Middleware Integration (ZAM-639)', () => {
        test('should validate agent communication and session management', async () => {
            const agentTest = await componentFramework.testAgentAPIMiddleware({
                agents: await testDataGenerator.generateAgentSessions(5),
                validateCommunication: true
            });

            expect(agentTest.agentCommunication.established).toBe(true);
            expect(agentTest.sessionManagement.active).toBe(true);
            expect(agentTest.messageRouting.accurate).toBe(true);
            expect(agentTest.responseHandling.timely).toBe(true);
        });

        test('should test middleware authentication and authorization', async () => {
            const authTest = await componentFramework.testMiddlewareAuth({
                authScenarios: ['valid_token', 'expired_token', 'invalid_token', 'no_token'],
                validateSecurity: true
            });

            expect(authTest.authentication.working).toBe(true);
            expect(authTest.authorization.enforced).toBe(true);
            expect(authTest.securityValidation.passed).toBe(true);
        });

        test('should validate middleware load balancing', async () => {
            const loadBalanceTest = await componentFramework.testMiddlewareLoadBalancing({
                agents: 10,
                requests: 1000,
                validateDistribution: true
            });

            expect(loadBalanceTest.loadDistribution.even).toBe(true);
            expect(loadBalanceTest.failoverHandling).toBe(true);
            expect(loadBalanceTest.performanceStable).toBe(true);
        });

        test('should test middleware monitoring and logging', async () => {
            const monitoringTest = await componentFramework.testMiddlewareMonitoring({
                duration: 60000, // 1 minute
                validateLogging: true
            });

            expect(monitoringTest.requestLogging.comprehensive).toBe(true);
            expect(monitoringTest.performanceMetrics.collected).toBe(true);
            expect(monitoringTest.errorTracking.accurate).toBe(true);
        });
    });

    describe('Deployment Automation Integration (ZAM-652)', () => {
        test('should test deployment workflows and validation', async () => {
            const deploymentTest = await componentFramework.testDeploymentAutomation({
                environments: ['development', 'staging', 'production'],
                validateWorkflows: true
            });

            expect(deploymentTest.workflowExecution.successful).toBe(true);
            expect(deploymentTest.environmentValidation.passed).toBe(true);
            expect(deploymentTest.rollbackCapability).toBe(true);
        });

        test('should validate deployment pipeline stages', async () => {
            const pipelineTest = await componentFramework.testDeploymentPipeline({
                stages: ['build', 'test', 'security_scan', 'deploy', 'verify'],
                validateEachStage: true
            });

            expect(pipelineTest.allStagesExecuted).toBe(true);
            expect(pipelineTest.stageValidation.passed).toBe(true);
            expect(pipelineTest.pipelineIntegrity).toBe(true);
        });

        test('should test deployment monitoring and alerts', async () => {
            const deployMonitorTest = await componentFramework.testDeploymentMonitoring({
                deployments: 3,
                validateAlerts: true
            });

            expect(deployMonitorTest.deploymentTracking).toBe(true);
            expect(deployMonitorTest.alertGeneration.timely).toBe(true);
            expect(deployMonitorTest.statusReporting.accurate).toBe(true);
        });
    });

    describe('Webhook System Integration (ZAM-663)', () => {
        test('should validate webhook processing and event handling', async () => {
            const webhookEvents = await testDataGenerator.generateWebhookEvents(20);
            
            const webhookTest = await componentFramework.testWebhookSystem({
                events: webhookEvents,
                validateProcessing: true
            });

            expect(webhookTest.eventProcessing.successful).toBe(true);
            expect(webhookTest.eventHandling.accurate).toBe(true);
            expect(webhookTest.processingTime.acceptable).toBe(true);
            expect(webhookTest.errorHandling.robust).toBe(true);
        });

        test('should test webhook security and validation', async () => {
            const securityTest = await componentFramework.testWebhookSecurity({
                securityScenarios: ['valid_signature', 'invalid_signature', 'replay_attack', 'malformed_payload'],
                validateSecurity: true
            });

            expect(securityTest.signatureValidation).toBe(true);
            expect(securityTest.replayProtection).toBe(true);
            expect(securityTest.payloadValidation).toBe(true);
        });

        test('should validate webhook retry and failure handling', async () => {
            const retryTest = await componentFramework.testWebhookRetry({
                failureScenarios: ['timeout', 'server_error', 'network_error'],
                validateRetry: true
            });

            expect(retryTest.retryMechanism.working).toBe(true);
            expect(retryTest.exponentialBackoff).toBe(true);
            expect(retryTest.deadLetterQueue).toBe(true);
        });
    });

    describe('Monitoring System Integration (ZAM-671)', () => {
        test('should test monitoring and alerting functionality', async () => {
            const monitoringTest = await componentFramework.testMonitoringSystem({
                duration: 120000, // 2 minutes
                validateAlerts: true,
                collectMetrics: true
            });

            expect(monitoringTest.metricsCollection.comprehensive).toBe(true);
            expect(monitoringTest.alertGeneration.timely).toBe(true);
            expect(monitoringTest.healthChecks.regular).toBe(true);
            expect(monitoringTest.dashboardUpdates.realtime).toBe(true);
        });

        test('should validate monitoring data accuracy', async () => {
            const accuracyTest = await componentFramework.testMonitoringAccuracy({
                testMetrics: ['cpu_usage', 'memory_usage', 'response_time', 'error_rate'],
                validateAccuracy: true
            });

            expect(accuracyTest.metricAccuracy.high).toBe(true);
            expect(accuracyTest.dataConsistency).toBe(true);
            expect(accuracyTest.timeSeriesIntegrity).toBe(true);
        });

        test('should test monitoring system scalability', async () => {
            const scalabilityTest = await componentFramework.testMonitoringScalability({
                metricsPerSecond: 10000,
                duration: 60000,
                validatePerformance: true
            });

            expect(scalabilityTest.highThroughputHandling).toBe(true);
            expect(scalabilityTest.performanceStable).toBe(true);
            expect(scalabilityTest.resourceUsage.efficient).toBe(true);
        });
    });

    describe('External System Integration', () => {
        test('should test GitHub integration', async () => {
            const githubTest = await componentFramework.testGitHubIntegration({
                operations: ['webhook_processing', 'pr_management', 'status_updates'],
                validateIntegration: true
            });

            expect(githubTest.webhookProcessing.working).toBe(true);
            expect(githubTest.prManagement.functional).toBe(true);
            expect(githubTest.statusUpdates.accurate).toBe(true);
        });

        test('should test Claude-Code integration', async () => {
            const claudeTest = await componentFramework.testClaudeCodeIntegration({
                validationTasks: await testDataGenerator.generateValidationTasks(5),
                validateDeployment: true
            });

            expect(claudeTest.deploymentValidation.working).toBe(true);
            expect(claudeTest.codeAnalysis.accurate).toBe(true);
            expect(claudeTest.feedbackGeneration.helpful).toBe(true);
        });

        test('should test PostgreSQL integration', async () => {
            const postgresTest = await componentFramework.testPostgreSQLIntegration({
                operations: ['connection', 'queries', 'transactions', 'performance'],
                validateIntegration: true
            });

            expect(postgresTest.connectionStability).toBe(true);
            expect(postgresTest.queryPerformance.optimal).toBe(true);
            expect(postgresTest.transactionIntegrity).toBe(true);
        });

        test('should test AgentAPI integration', async () => {
            const agentAPITest = await componentFramework.testAgentAPIIntegration({
                communicationTests: ['middleware_communication', 'agent_management'],
                validateIntegration: true
            });

            expect(agentAPITest.middlewareCommunication.stable).toBe(true);
            expect(agentAPITest.agentManagement.effective).toBe(true);
            expect(agentAPITest.sessionHandling.robust).toBe(true);
        });
    });

    describe('Integration Performance Testing', () => {
        test('should validate component communication performance', async () => {
            const perfTest = await componentFramework.testCommunicationPerformance({
                componentPairs: [
                    ['database', 'orchestrator'],
                    ['orchestrator', 'codegen'],
                    ['codegen', 'validation'],
                    ['validation', 'deployment']
                ],
                validateLatency: true
            });

            expect(perfTest.communicationLatency.acceptable).toBe(true);
            expect(perfTest.throughput.adequate).toBe(true);
            expect(perfTest.noBottlenecks).toBe(true);
        });

        test('should test integration under load', async () => {
            const loadTest = await componentFramework.testIntegrationLoad({
                loadLevel: 'high',
                duration: 300000, // 5 minutes
                validateStability: true
            });

            expect(loadTest.systemStability.maintained).toBe(true);
            expect(loadTest.performanceDegradation.minimal).toBe(true);
            expect(loadTest.errorRate.acceptable).toBe(true);
        });
    });

    describe('Integration Security Testing', () => {
        test('should validate secure component communication', async () => {
            const securityTest = await componentFramework.testIntegrationSecurity({
                securityAspects: ['authentication', 'authorization', 'encryption', 'audit'],
                validateSecurity: true
            });

            expect(securityTest.authentication.enforced).toBe(true);
            expect(securityTest.authorization.granular).toBe(true);
            expect(securityTest.encryption.endToEnd).toBe(true);
            expect(securityTest.auditLogging.comprehensive).toBe(true);
        });

        test('should test integration vulnerability assessment', async () => {
            const vulnTest = await componentFramework.testIntegrationVulnerabilities({
                scanTypes: ['dependency', 'configuration', 'communication'],
                validateSecurity: true
            });

            expect(vulnTest.vulnerabilities.none).toBe(true);
            expect(vulnTest.securityCompliance.met).toBe(true);
            expect(vulnTest.riskAssessment.low).toBe(true);
        });
    });
});

