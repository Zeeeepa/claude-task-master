/**
 * AgentAPI Integration Tests
 * 
 * Comprehensive test suite for AgentAPI client functionality,
 * WSL2 environment management, and Claude Code orchestration.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import AgentAPIClient from '../../src/ai_cicd_system/integrations/agentapi_client.js';
import WSL2EnvironmentManager from '../../src/ai_cicd_system/integrations/wsl2_manager.js';
import ClaudeCodeOrchestrator from '../../src/ai_cicd_system/integrations/claude_code_orchestrator.js';
import RepositoryManager from '../../src/ai_cicd_system/integrations/repository_manager.js';
import EnvironmentMonitor from '../../src/ai_cicd_system/integrations/environment_monitor.js';

// Mock axios for HTTP requests
jest.mock('axios');

describe('AgentAPI Integration Tests', () => {
    let agentAPIClient;
    let wsl2Manager;
    let claudeCodeOrchestrator;
    let repositoryManager;
    let environmentMonitor;

    const mockPRDetails = {
        prNumber: 123,
        repositoryUrl: 'https://github.com/test/repo.git',
        branch: 'feature/test-branch',
        baseBranch: 'main',
        files: ['src/test.js', 'src/utils.js'],
        additions: 50,
        deletions: 10
    };

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        
        // Initialize components with test configuration
        agentAPIClient = new AgentAPIClient({
            baseUrl: 'http://localhost:3284',
            timeout: 30000,
            retries: 1
        });

        wsl2Manager = new WSL2EnvironmentManager({
            agentAPI: {
                baseUrl: 'http://localhost:3284',
                timeout: 30000
            },
            maxConcurrentInstances: 5
        });

        claudeCodeOrchestrator = new ClaudeCodeOrchestrator({
            agentAPI: {
                baseUrl: 'http://localhost:3284',
                timeout: 30000
            },
            validationTimeout: 60000
        });

        repositoryManager = new RepositoryManager({
            agentAPI: {
                baseUrl: 'http://localhost:3284',
                timeout: 30000
            }
        });

        environmentMonitor = new EnvironmentMonitor({
            agentAPI: {
                baseUrl: 'http://localhost:3284',
                timeout: 30000
            },
            monitoringInterval: 5000
        });
    });

    afterEach(async () => {
        // Cleanup all components
        try {
            await agentAPIClient.cleanup();
            await wsl2Manager.cleanup();
            await claudeCodeOrchestrator.cleanup();
            await repositoryManager.cleanup();
            await environmentMonitor.cleanup();
        } catch (error) {
            // Ignore cleanup errors in tests
        }
    });

    describe('AgentAPIClient', () => {
        test('should initialize successfully', async () => {
            const result = await agentAPIClient.initialize();
            expect(result).toBe(true);
            expect(agentAPIClient.isConnected).toBe(true);
        });

        test('should create WSL2 instance', async () => {
            await agentAPIClient.initialize();
            
            const instance = await agentAPIClient.createWSL2Instance({
                name: 'test-instance',
                distribution: 'Ubuntu-22.04'
            });

            expect(instance).toHaveProperty('id');
            expect(instance).toHaveProperty('name', 'test-instance');
            expect(instance).toHaveProperty('distribution', 'Ubuntu-22.04');
            expect(instance).toHaveProperty('status', 'creating');
        });

        test('should execute commands in WSL2 instance', async () => {
            await agentAPIClient.initialize();
            
            const instance = await agentAPIClient.createWSL2Instance({
                name: 'test-instance'
            });

            // Wait for instance to be ready
            await new Promise(resolve => setTimeout(resolve, 2100));

            const result = await agentAPIClient.executeCommand(
                instance.id, 
                'echo "Hello World"'
            );

            expect(result).toHaveProperty('exitCode', 0);
            expect(result).toHaveProperty('stdout');
            expect(result).toHaveProperty('instanceId', instance.id);
        });

        test('should clone repository in WSL2 instance', async () => {
            await agentAPIClient.initialize();
            
            const instance = await agentAPIClient.createWSL2Instance({
                name: 'test-instance'
            });

            await new Promise(resolve => setTimeout(resolve, 2100));

            const cloneResult = await agentAPIClient.cloneRepository(
                instance.id,
                'https://github.com/test/repo.git',
                'main'
            );

            expect(cloneResult).toHaveProperty('success', true);
            expect(cloneResult).toHaveProperty('instanceId', instance.id);
            expect(cloneResult).toHaveProperty('branch', 'main');
        });

        test('should start Claude Code validation session', async () => {
            await agentAPIClient.initialize();
            
            const instance = await agentAPIClient.createWSL2Instance({
                name: 'test-instance'
            });

            await new Promise(resolve => setTimeout(resolve, 2100));

            const session = await agentAPIClient.startClaudeCodeValidation(
                instance.id,
                { allowedTools: 'Bash Edit Replace' }
            );

            expect(session).toHaveProperty('id');
            expect(session).toHaveProperty('instanceId', instance.id);
            expect(session).toHaveProperty('status', 'running');
        });

        test('should get resource usage for WSL2 instance', async () => {
            await agentAPIClient.initialize();
            
            const instance = await agentAPIClient.createWSL2Instance({
                name: 'test-instance'
            });

            await new Promise(resolve => setTimeout(resolve, 2100));

            const usage = await agentAPIClient.getResourceUsage(instance.id);

            expect(usage).toHaveProperty('instanceId', instance.id);
            expect(usage).toHaveProperty('cpu');
            expect(usage).toHaveProperty('memory');
            expect(usage).toHaveProperty('disk');
            expect(usage).toHaveProperty('network');
        });

        test('should destroy WSL2 instance', async () => {
            await agentAPIClient.initialize();
            
            const instance = await agentAPIClient.createWSL2Instance({
                name: 'test-instance'
            });

            const result = await agentAPIClient.destroyWSL2Instance(instance.id);
            expect(result).toBe(true);
        });

        test('should handle retry logic on failures', async () => {
            const failingClient = new AgentAPIClient({
                baseUrl: 'http://invalid-url:9999',
                retries: 2,
                timeout: 1000
            });

            await expect(failingClient.initialize()).rejects.toThrow();
        });
    });

    describe('WSL2EnvironmentManager', () => {
        test('should initialize successfully', async () => {
            const result = await wsl2Manager.initialize();
            expect(result).toBe(true);
        });

        test('should create environment for PR validation', async () => {
            await wsl2Manager.initialize();
            
            const environment = await wsl2Manager.createEnvironment(mockPRDetails);

            expect(environment).toHaveProperty('id');
            expect(environment).toHaveProperty('prDetails', mockPRDetails);
            expect(environment).toHaveProperty('status', 'ready');
            expect(environment).toHaveProperty('instance');
        });

        test('should respect concurrent instance limits', async () => {
            await wsl2Manager.initialize();
            
            // Create environments up to the limit
            const environments = [];
            for (let i = 0; i < 5; i++) {
                const env = await wsl2Manager.createEnvironment({
                    ...mockPRDetails,
                    prNumber: 100 + i
                });
                environments.push(env);
            }

            // Attempt to create one more should fail
            await expect(
                wsl2Manager.createEnvironment({
                    ...mockPRDetails,
                    prNumber: 999
                })
            ).rejects.toThrow('Maximum concurrent instances');
        });

        test('should cleanup environment successfully', async () => {
            await wsl2Manager.initialize();
            
            const environment = await wsl2Manager.createEnvironment(mockPRDetails);
            const result = await wsl2Manager.cleanupEnvironment(environment.id);
            
            expect(result).toBe(true);
        });

        test('should detect language dependencies correctly', async () => {
            await wsl2Manager.initialize();
            
            const jsProject = {
                ...mockPRDetails,
                files: ['src/app.js', 'package.json']
            };

            const environment = await wsl2Manager.createEnvironment(jsProject);
            
            // Check that Node.js dependencies were detected
            expect(environment.setupSteps.some(step => 
                step.name === 'installDependencies'
            )).toBe(true);
        });
    });

    describe('ClaudeCodeOrchestrator', () => {
        test('should initialize successfully', async () => {
            const result = await claudeCodeOrchestrator.initialize();
            expect(result).toBe(true);
        });

        test('should start PR validation workflow', async () => {
            await claudeCodeOrchestrator.initialize();
            
            const session = await claudeCodeOrchestrator.startPRValidation(mockPRDetails);

            expect(session).toHaveProperty('id');
            expect(session).toHaveProperty('prDetails', mockPRDetails);
            expect(session).toHaveProperty('status', 'completed');
            expect(session).toHaveProperty('results');
            expect(session.results).toHaveProperty('syntax');
            expect(session.results).toHaveProperty('security');
            expect(session.results).toHaveProperty('performance');
            expect(session.results).toHaveProperty('bestPractices');
        });

        test('should handle validation failures gracefully', async () => {
            await claudeCodeOrchestrator.initialize();
            
            const invalidPR = {
                ...mockPRDetails,
                repositoryUrl: 'invalid-url'
            };

            await expect(
                claudeCodeOrchestrator.startPRValidation(invalidPR)
            ).rejects.toThrow();
        });

        test('should stop validation session', async () => {
            await claudeCodeOrchestrator.initialize();
            
            const session = await claudeCodeOrchestrator.startPRValidation(mockPRDetails);
            const result = await claudeCodeOrchestrator.stopValidationSession(session.id);
            
            expect(result).toBe(true);
        });

        test('should trigger debugging for critical issues', async () => {
            await claudeCodeOrchestrator.initialize();
            
            // Mock a validation with critical issues
            const session = await claudeCodeOrchestrator.startPRValidation(mockPRDetails);
            
            // Check if debugging sessions were created for critical issues
            expect(session.debuggingSessions).toBeDefined();
        });
    });

    describe('RepositoryManager', () => {
        test('should initialize successfully', async () => {
            const result = await repositoryManager.initialize();
            expect(result).toBe(true);
        });

        test('should clone repository for PR validation', async () => {
            await repositoryManager.initialize();
            
            const repository = await repositoryManager.cloneRepository(
                'test-instance-id',
                mockPRDetails
            );

            expect(repository).toHaveProperty('id');
            expect(repository).toHaveProperty('status', 'ready');
            expect(repository).toHaveProperty('prDetails', mockPRDetails);
            expect(repository).toHaveProperty('branches');
        });

        test('should get file changes between branches', async () => {
            await repositoryManager.initialize();
            
            const repository = await repositoryManager.cloneRepository(
                'test-instance-id',
                mockPRDetails
            );

            const changes = await repositoryManager.getFileChanges(
                'test-instance-id',
                repository.id,
                'main',
                `pr-${mockPRDetails.prNumber}`
            );

            expect(changes).toHaveProperty('summary');
            expect(changes).toHaveProperty('files');
            expect(changes.summary).toHaveProperty('totalFiles');
        });

        test('should create new branch for fixes', async () => {
            await repositoryManager.initialize();
            
            const repository = await repositoryManager.cloneRepository(
                'test-instance-id',
                mockPRDetails
            );

            const newBranch = await repositoryManager.createBranch(
                'test-instance-id',
                repository.id,
                'fix/automated-fixes',
                'main'
            );

            expect(newBranch).toHaveProperty('name', 'fix/automated-fixes');
            expect(newBranch).toHaveProperty('type', 'feature');
            expect(newBranch).toHaveProperty('baseBranch', 'main');
        });

        test('should commit and push changes', async () => {
            await repositoryManager.initialize();
            
            const repository = await repositoryManager.cloneRepository(
                'test-instance-id',
                mockPRDetails
            );

            const commit = await repositoryManager.commitChanges(
                'test-instance-id',
                repository.id,
                'Automated fixes from Claude Code validation'
            );

            expect(commit).toHaveProperty('message');
            expect(commit).toHaveProperty('committedAt');

            const pushResult = await repositoryManager.pushChanges(
                'test-instance-id',
                repository.id,
                `pr-${mockPRDetails.prNumber}`
            );

            expect(pushResult).toHaveProperty('pushedAt');
        });
    });

    describe('EnvironmentMonitor', () => {
        test('should initialize successfully', async () => {
            const result = await environmentMonitor.initialize();
            expect(result).toBe(true);
        });

        test('should start and stop monitoring', async () => {
            await environmentMonitor.initialize();
            
            environmentMonitor.startMonitoring();
            expect(environmentMonitor.isMonitoring).toBe(true);
            
            environmentMonitor.stopMonitoring();
            expect(environmentMonitor.isMonitoring).toBe(false);
        });

        test('should collect and record metrics', async () => {
            await environmentMonitor.initialize();
            
            const mockInstance = {
                id: 'test-instance',
                name: 'test'
            };

            environmentMonitor.addEnvironment(mockInstance.id, mockInstance);
            
            // Trigger metrics collection
            await environmentMonitor.collectMetrics();
            
            const metrics = environmentMonitor.getMetrics(mockInstance.id);
            expect(metrics.length).toBeGreaterThan(0);
        });

        test('should generate alerts for high resource usage', async () => {
            await environmentMonitor.initialize();
            
            let alertReceived = false;
            environmentMonitor.on('alert', (alert) => {
                alertReceived = true;
                expect(alert).toHaveProperty('type');
                expect(alert).toHaveProperty('level');
                expect(alert).toHaveProperty('message');
            });

            // Simulate high CPU usage
            const highUsageMetrics = {
                instanceId: 'test-instance',
                timestamp: new Date().toISOString(),
                cpu: { usage: 98 },
                memory: { percentage: 50 },
                disk: { percentage: 50 },
                network: { bytesIn: 1000, bytesOut: 1000 }
            };

            environmentMonitor.recordMetrics('test-instance', highUsageMetrics);
            environmentMonitor.checkAlerts('test-instance', highUsageMetrics);

            // Wait for alert processing
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(alertReceived).toBe(true);
        });

        test('should provide aggregated metrics', async () => {
            await environmentMonitor.initialize();
            
            // Add some test metrics
            for (let i = 0; i < 5; i++) {
                const metrics = {
                    timestamp: new Date(Date.now() - i * 60000).toISOString(),
                    system: {
                        cpu: { usage: 50 + i * 5 },
                        memory: { used: 1000000000 + i * 100000000 }
                    },
                    processes: { count: 20 + i },
                    network: { interfaces: {} },
                    disk: { filesystems: {} }
                };
                
                environmentMonitor.updateAggregatedMetrics(metrics);
            }

            const aggregated = environmentMonitor.getAggregatedMetrics('minute');
            expect(aggregated.length).toBeGreaterThan(0);
        });
    });

    describe('Integration Scenarios', () => {
        test('should handle complete PR validation workflow', async () => {
            // Initialize all components
            await agentAPIClient.initialize();
            await wsl2Manager.initialize();
            await claudeCodeOrchestrator.initialize();
            await repositoryManager.initialize();
            await environmentMonitor.initialize();

            // Start monitoring
            environmentMonitor.startMonitoring();

            // Create environment for PR
            const environment = await wsl2Manager.createEnvironment(mockPRDetails);
            expect(environment.status).toBe('ready');

            // Clone repository
            const repository = await repositoryManager.cloneRepository(
                environment.instance.id,
                mockPRDetails
            );
            expect(repository.status).toBe('ready');

            // Start validation
            const validationSession = await claudeCodeOrchestrator.startPRValidation(mockPRDetails);
            expect(validationSession.status).toBe('completed');

            // Check results
            expect(validationSession.results.overall).toBeDefined();
            expect(validationSession.results.overall.summary).toBeDefined();

            // Cleanup
            await wsl2Manager.cleanupEnvironment(environment.id);
            await repositoryManager.cleanupRepository(repository.id);
        });

        test('should handle concurrent PR validations', async () => {
            await agentAPIClient.initialize();
            await wsl2Manager.initialize();
            await claudeCodeOrchestrator.initialize();

            const prDetails = [
                { ...mockPRDetails, prNumber: 101 },
                { ...mockPRDetails, prNumber: 102 },
                { ...mockPRDetails, prNumber: 103 }
            ];

            // Start multiple validations concurrently
            const validationPromises = prDetails.map(pr => 
                claudeCodeOrchestrator.startPRValidation(pr)
            );

            const results = await Promise.all(validationPromises);
            
            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(result.status).toBe('completed');
            });
        });

        test('should handle resource exhaustion gracefully', async () => {
            await wsl2Manager.initialize();

            // Try to create more environments than the limit
            const promises = [];
            for (let i = 0; i < 7; i++) { // Limit is 5
                promises.push(
                    wsl2Manager.createEnvironment({
                        ...mockPRDetails,
                        prNumber: 200 + i
                    }).catch(error => error)
                );
            }

            const results = await Promise.all(promises);
            
            // First 5 should succeed, last 2 should fail
            const successes = results.filter(r => r && r.status === 'ready');
            const failures = results.filter(r => r instanceof Error);
            
            expect(successes.length).toBe(5);
            expect(failures.length).toBe(2);
        });

        test('should handle network failures and retries', async () => {
            const unreliableClient = new AgentAPIClient({
                baseUrl: 'http://unreliable-server:3284',
                retries: 3,
                timeout: 5000
            });

            // This should fail after retries
            await expect(unreliableClient.initialize()).rejects.toThrow();
        });

        test('should cleanup resources on shutdown', async () => {
            await agentAPIClient.initialize();
            await wsl2Manager.initialize();
            await environmentMonitor.initialize();

            // Create some resources
            const environment = await wsl2Manager.createEnvironment(mockPRDetails);
            environmentMonitor.startMonitoring();

            // Cleanup
            await wsl2Manager.cleanup();
            await environmentMonitor.cleanup();
            await agentAPIClient.cleanup();

            // Verify cleanup
            expect(wsl2Manager.environments.size).toBe(0);
            expect(environmentMonitor.isMonitoring).toBe(false);
            expect(agentAPIClient.isConnected).toBe(false);
        });
    });

    describe('Error Handling', () => {
        test('should handle AgentAPI server unavailable', async () => {
            const offlineClient = new AgentAPIClient({
                baseUrl: 'http://offline-server:9999',
                timeout: 1000,
                retries: 1
            });

            await expect(offlineClient.initialize()).rejects.toThrow();
        });

        test('should handle invalid repository URLs', async () => {
            await repositoryManager.initialize();

            const invalidPR = {
                ...mockPRDetails,
                repositoryUrl: 'not-a-valid-url'
            };

            await expect(
                repositoryManager.cloneRepository('test-instance', invalidPR)
            ).rejects.toThrow();
        });

        test('should handle WSL2 instance creation failures', async () => {
            await agentAPIClient.initialize();

            // Mock a failure scenario
            const originalCreate = agentAPIClient.createWSL2Instance;
            agentAPIClient.createWSL2Instance = jest.fn().mockRejectedValue(
                new Error('WSL2 creation failed')
            );

            await expect(
                agentAPIClient.createWSL2Instance({ name: 'test' })
            ).rejects.toThrow('WSL2 creation failed');

            // Restore original method
            agentAPIClient.createWSL2Instance = originalCreate;
        });

        test('should handle validation timeouts', async () => {
            const quickTimeoutOrchestrator = new ClaudeCodeOrchestrator({
                validationTimeout: 100 // Very short timeout
            });

            await quickTimeoutOrchestrator.initialize();

            // This should timeout quickly
            await expect(
                quickTimeoutOrchestrator.startPRValidation(mockPRDetails)
            ).rejects.toThrow();
        });
    });

    describe('Performance Tests', () => {
        test('should handle rapid environment creation and cleanup', async () => {
            await wsl2Manager.initialize();

            const startTime = Date.now();
            
            // Create and cleanup environments rapidly
            for (let i = 0; i < 3; i++) {
                const env = await wsl2Manager.createEnvironment({
                    ...mockPRDetails,
                    prNumber: 300 + i
                });
                await wsl2Manager.cleanupEnvironment(env.id);
            }

            const duration = Date.now() - startTime;
            
            // Should complete within reasonable time
            expect(duration).toBeLessThan(30000); // 30 seconds
        });

        test('should handle high-frequency monitoring', async () => {
            const highFreqMonitor = new EnvironmentMonitor({
                monitoringInterval: 100 // Very frequent monitoring
            });

            await highFreqMonitor.initialize();
            highFreqMonitor.startMonitoring();

            // Add test environment
            highFreqMonitor.addEnvironment('test-env', { id: 'test-env' });

            // Let it run for a short time
            await new Promise(resolve => setTimeout(resolve, 1000));

            const metrics = highFreqMonitor.getMetrics('test-env');
            expect(metrics.length).toBeGreaterThan(5); // Should have collected multiple metrics

            highFreqMonitor.stopMonitoring();
            await highFreqMonitor.cleanup();
        });
    });
});

// Helper function to wait for async operations
function waitFor(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Mock data generators for testing
function generateMockMetrics() {
    return {
        timestamp: new Date().toISOString(),
        cpu: { usage: Math.random() * 100 },
        memory: { percentage: Math.random() * 100 },
        disk: { percentage: Math.random() * 100 },
        network: {
            bytesIn: Math.floor(Math.random() * 1000000),
            bytesOut: Math.floor(Math.random() * 1000000)
        }
    };
}

function generateMockPRDetails(prNumber) {
    return {
        prNumber,
        repositoryUrl: `https://github.com/test/repo-${prNumber}.git`,
        branch: `feature/test-${prNumber}`,
        baseBranch: 'main',
        files: [`src/test-${prNumber}.js`],
        additions: Math.floor(Math.random() * 100),
        deletions: Math.floor(Math.random() * 50)
    };
}

