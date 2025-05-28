/**
 * WSL2 Environment Tests
 * 
 * Comprehensive test suite for WSL2 environment management,
 * resource allocation, and lifecycle operations.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import WSL2EnvironmentManager from '../../src/ai_cicd_system/integrations/wsl2_manager.js';
import AgentAPIClient from '../../src/ai_cicd_system/integrations/agentapi_client.js';

// Mock AgentAPI client
jest.mock('../../src/ai_cicd_system/integrations/agentapi_client.js');

describe('WSL2 Environment Tests', () => {
    let wsl2Manager;
    let mockAgentAPI;

    const mockPRDetails = {
        prNumber: 123,
        repositoryUrl: 'https://github.com/test/repo.git',
        branch: 'feature/test-branch',
        baseBranch: 'main',
        files: ['src/app.js', 'package.json', 'src/utils.py'],
        additions: 150,
        deletions: 25
    };

    beforeEach(() => {
        // Create mock AgentAPI client
        mockAgentAPI = {
            initialize: jest.fn().mockResolvedValue(true),
            createWSL2Instance: jest.fn().mockResolvedValue({
                id: 'wsl2-test-instance',
                name: 'pr-validation-123',
                status: 'creating',
                ipAddress: '192.168.1.100',
                sshPort: 22001
            }),
            getWSL2Instance: jest.fn().mockResolvedValue({
                id: 'wsl2-test-instance',
                status: 'running'
            }),
            executeCommand: jest.fn().mockResolvedValue({
                exitCode: 0,
                stdout: 'Command executed successfully',
                stderr: ''
            }),
            cloneRepository: jest.fn().mockResolvedValue({
                success: true,
                clonedAt: new Date().toISOString()
            }),
            destroyWSL2Instance: jest.fn().mockResolvedValue(true),
            cleanup: jest.fn().mockResolvedValue(true),
            on: jest.fn(),
            emit: jest.fn()
        };

        // Mock the AgentAPIClient constructor
        AgentAPIClient.mockImplementation(() => mockAgentAPI);

        wsl2Manager = new WSL2EnvironmentManager({
            maxConcurrentInstances: 3,
            timeouts: {
                creation: 5000,
                setup: 10000,
                cleanup: 3000
            }
        });
    });

    afterEach(async () => {
        try {
            await wsl2Manager.cleanup();
        } catch (error) {
            // Ignore cleanup errors in tests
        }
        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        test('should initialize successfully', async () => {
            const result = await wsl2Manager.initialize();
            expect(result).toBe(true);
            expect(mockAgentAPI.initialize).toHaveBeenCalled();
        });

        test('should handle initialization failure', async () => {
            mockAgentAPI.initialize.mockRejectedValue(new Error('AgentAPI unavailable'));
            
            await expect(wsl2Manager.initialize()).rejects.toThrow('Failed to initialize WSL2 Environment Manager');
        });
    });

    describe('Environment Creation', () => {
        beforeEach(async () => {
            await wsl2Manager.initialize();
        });

        test('should create environment successfully', async () => {
            const environment = await wsl2Manager.createEnvironment(mockPRDetails);

            expect(environment).toHaveProperty('id');
            expect(environment).toHaveProperty('prDetails', mockPRDetails);
            expect(environment).toHaveProperty('status', 'ready');
            expect(environment).toHaveProperty('instance');
            expect(environment.setupSteps).toHaveLength(5);
        });

        test('should respect concurrent instance limits', async () => {
            // Create environments up to the limit
            const promises = [];
            for (let i = 0; i < 3; i++) {
                promises.push(wsl2Manager.createEnvironment({
                    ...mockPRDetails,
                    prNumber: 100 + i
                }));
            }

            await Promise.all(promises);

            // Attempt to create one more should fail
            await expect(
                wsl2Manager.createEnvironment({
                    ...mockPRDetails,
                    prNumber: 999
                })
            ).rejects.toThrow('Maximum concurrent instances (3) reached');
        });

        test('should calculate resource requirements based on PR size', async () => {
            const largePR = {
                ...mockPRDetails,
                files: new Array(60).fill('file.js'), // 60 files
                additions: 1500,
                deletions: 500
            };

            const environment = await wsl2Manager.createEnvironment(largePR);
            
            expect(environment.resources.memory).toBe('8GB');
            expect(environment.resources.cpu).toBe('4 cores');
        });

        test('should detect language dependencies correctly', async () => {
            const multiLangPR = {
                ...mockPRDetails,
                files: [
                    'src/app.js',
                    'src/utils.py',
                    'src/main.go',
                    'package.json',
                    'requirements.txt'
                ]
            };

            const environment = await wsl2Manager.createEnvironment(multiLangPR);
            
            // Should have detected JavaScript, Python, and Go
            const setupStep = environment.setupSteps.find(step => step.name === 'installDependencies');
            expect(setupStep).toBeDefined();
        });

        test('should handle WSL2 instance creation timeout', async () => {
            mockAgentAPI.createWSL2Instance.mockImplementation(() => 
                new Promise(resolve => setTimeout(resolve, 10000)) // Longer than timeout
            );

            await expect(
                wsl2Manager.createEnvironment(mockPRDetails)
            ).rejects.toThrow();
        });

        test('should handle setup step failures', async () => {
            mockAgentAPI.executeCommand.mockRejectedValueOnce(
                new Error('Package installation failed')
            );

            await expect(
                wsl2Manager.createEnvironment(mockPRDetails)
            ).rejects.toThrow();
        });
    });

    describe('Environment Management', () => {
        let environment;

        beforeEach(async () => {
            await wsl2Manager.initialize();
            environment = await wsl2Manager.createEnvironment(mockPRDetails);
        });

        test('should get environment details', async () => {
            const envDetails = await wsl2Manager.getEnvironment(environment.id);
            
            expect(envDetails).toHaveProperty('id', environment.id);
            expect(envDetails).toHaveProperty('status', 'ready');
            expect(envDetails).toHaveProperty('prDetails');
        });

        test('should list all environments', async () => {
            const environments = await wsl2Manager.listEnvironments();
            
            expect(environments).toHaveLength(1);
            expect(environments[0]).toHaveProperty('id', environment.id);
        });

        test('should cleanup environment successfully', async () => {
            const result = await wsl2Manager.cleanupEnvironment(environment.id);
            
            expect(result).toBe(true);
            expect(mockAgentAPI.destroyWSL2Instance).toHaveBeenCalledWith(environment.instance.id);
        });

        test('should handle cleanup of non-existent environment', async () => {
            await expect(
                wsl2Manager.cleanupEnvironment('non-existent-id')
            ).rejects.toThrow('Environment non-existent-id not found');
        });
    });

    describe('Setup Steps', () => {
        beforeEach(async () => {
            await wsl2Manager.initialize();
        });

        test('should execute all setup steps in order', async () => {
            const environment = await wsl2Manager.createEnvironment(mockPRDetails);
            
            const expectedSteps = [
                'updateSystem',
                'installDependencies',
                'cloneRepository',
                'configureClaudeCode',
                'setupValidationTools'
            ];

            expect(environment.setupSteps).toHaveLength(expectedSteps.length);
            environment.setupSteps.forEach((step, index) => {
                expect(step.name).toBe(expectedSteps[index]);
                expect(step.status).toBe('completed');
            });
        });

        test('should handle dependency detection for JavaScript projects', async () => {
            const jsPR = {
                ...mockPRDetails,
                files: ['src/app.js', 'package.json', 'src/components/Button.jsx']
            };

            await wsl2Manager.createEnvironment(jsPR);
            
            // Should have called commands to install Node.js and npm
            expect(mockAgentAPI.executeCommand).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('nodejs')
            );
        });

        test('should handle dependency detection for Python projects', async () => {
            const pythonPR = {
                ...mockPRDetails,
                files: ['src/main.py', 'requirements.txt', 'tests/test_main.py']
            };

            await wsl2Manager.createEnvironment(pythonPR);
            
            // Should have called commands to install Python
            expect(mockAgentAPI.executeCommand).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('python3')
            );
        });

        test('should handle repository cloning', async () => {
            await wsl2Manager.createEnvironment(mockPRDetails);
            
            expect(mockAgentAPI.cloneRepository).toHaveBeenCalledWith(
                expect.any(String),
                mockPRDetails.repositoryUrl,
                mockPRDetails.branch,
                { targetDir: '/workspace' }
            );
        });

        test('should configure Claude Code properly', async () => {
            await wsl2Manager.createEnvironment(mockPRDetails);
            
            // Should have executed Claude Code configuration commands
            expect(mockAgentAPI.executeCommand).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('claude config')
            );
        });
    });

    describe('Resource Monitoring', () => {
        beforeEach(async () => {
            await wsl2Manager.initialize();
        });

        test('should start resource monitoring', async () => {
            const environment = await wsl2Manager.createEnvironment(mockPRDetails);
            
            // Resource monitoring should be started automatically
            expect(wsl2Manager.resourceMonitor).toBeDefined();
        });

        test('should emit resource alerts for high usage', async () => {
            const environment = await wsl2Manager.createEnvironment(mockPRDetails);
            
            let alertReceived = false;
            wsl2Manager.on('resourceAlert', (alert) => {
                alertReceived = true;
                expect(alert).toHaveProperty('environmentId');
                expect(alert).toHaveProperty('alerts');
            });

            // Simulate high resource usage
            wsl2Manager.checkResourceAlerts(environment.id, {
                cpu: { usage: 95 },
                memory: { percentage: 98 },
                disk: { percentage: 92 }
            });

            expect(alertReceived).toBe(true);
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await wsl2Manager.initialize();
        });

        test('should handle WSL2 instance creation failure', async () => {
            mockAgentAPI.createWSL2Instance.mockRejectedValue(
                new Error('WSL2 creation failed')
            );

            await expect(
                wsl2Manager.createEnvironment(mockPRDetails)
            ).rejects.toThrow();
        });

        test('should handle repository cloning failure', async () => {
            mockAgentAPI.cloneRepository.mockRejectedValue(
                new Error('Repository not found')
            );

            await expect(
                wsl2Manager.createEnvironment(mockPRDetails)
            ).rejects.toThrow();
        });

        test('should handle command execution failure', async () => {
            mockAgentAPI.executeCommand.mockRejectedValue(
                new Error('Command failed')
            );

            await expect(
                wsl2Manager.createEnvironment(mockPRDetails)
            ).rejects.toThrow();
        });

        test('should cleanup on environment creation failure', async () => {
            mockAgentAPI.executeCommand.mockRejectedValueOnce(
                new Error('Setup failed')
            );

            try {
                await wsl2Manager.createEnvironment(mockPRDetails);
            } catch (error) {
                // Expected to fail
            }

            // Should have attempted cleanup
            expect(mockAgentAPI.destroyWSL2Instance).toHaveBeenCalled();
        });
    });

    describe('Concurrent Operations', () => {
        beforeEach(async () => {
            await wsl2Manager.initialize();
        });

        test('should handle concurrent environment creation', async () => {
            const prDetails = [
                { ...mockPRDetails, prNumber: 101 },
                { ...mockPRDetails, prNumber: 102 },
                { ...mockPRDetails, prNumber: 103 }
            ];

            const promises = prDetails.map(pr => 
                wsl2Manager.createEnvironment(pr)
            );

            const environments = await Promise.all(promises);
            
            expect(environments).toHaveLength(3);
            environments.forEach(env => {
                expect(env.status).toBe('ready');
            });
        });

        test('should handle concurrent cleanup operations', async () => {
            // Create multiple environments
            const environments = [];
            for (let i = 0; i < 3; i++) {
                const env = await wsl2Manager.createEnvironment({
                    ...mockPRDetails,
                    prNumber: 200 + i
                });
                environments.push(env);
            }

            // Cleanup all concurrently
            const cleanupPromises = environments.map(env => 
                wsl2Manager.cleanupEnvironment(env.id)
            );

            const results = await Promise.all(cleanupPromises);
            
            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(result).toBe(true);
            });
        });
    });

    describe('Performance Tests', () => {
        beforeEach(async () => {
            await wsl2Manager.initialize();
        });

        test('should create environment within time limit', async () => {
            const startTime = Date.now();
            
            await wsl2Manager.createEnvironment(mockPRDetails);
            
            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
        });

        test('should handle rapid environment lifecycle', async () => {
            const startTime = Date.now();
            
            // Create and cleanup environment rapidly
            const environment = await wsl2Manager.createEnvironment(mockPRDetails);
            await wsl2Manager.cleanupEnvironment(environment.id);
            
            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(20000); // Should complete within 20 seconds
        });
    });

    describe('Configuration Tests', () => {
        test('should use custom configuration', async () => {
            const customManager = new WSL2EnvironmentManager({
                maxConcurrentInstances: 1,
                defaultDistribution: 'Ubuntu-20.04',
                resourceLimits: {
                    memory: '2GB',
                    cpu: '1 core',
                    disk: '10GB'
                }
            });

            await customManager.initialize();
            
            expect(customManager.config.maxConcurrentInstances).toBe(1);
            expect(customManager.config.defaultDistribution).toBe('Ubuntu-20.04');
            expect(customManager.config.resourceLimits.memory).toBe('2GB');

            await customManager.cleanup();
        });

        test('should validate resource requirements', async () => {
            await wsl2Manager.initialize();
            
            const smallPR = {
                ...mockPRDetails,
                files: ['README.md'],
                additions: 5,
                deletions: 1
            };

            const environment = await wsl2Manager.createEnvironment(smallPR);
            
            // Should use default resources for small PR
            expect(environment.resources.memory).toBe('4GB');
            expect(environment.resources.cpu).toBe('2 cores');
        });
    });

    describe('Event Handling', () => {
        beforeEach(async () => {
            await wsl2Manager.initialize();
        });

        test('should emit environment lifecycle events', async () => {
            const events = [];
            
            wsl2Manager.on('environmentCreating', (env) => {
                events.push({ type: 'creating', env });
            });
            
            wsl2Manager.on('environmentReady', (env) => {
                events.push({ type: 'ready', env });
            });
            
            wsl2Manager.on('environmentDestroyed', (env) => {
                events.push({ type: 'destroyed', env });
            });

            const environment = await wsl2Manager.createEnvironment(mockPRDetails);
            await wsl2Manager.cleanupEnvironment(environment.id);

            expect(events).toHaveLength(3);
            expect(events[0].type).toBe('creating');
            expect(events[1].type).toBe('ready');
            expect(events[2].type).toBe('destroyed');
        });

        test('should emit setup step events', async () => {
            const stepEvents = [];
            
            wsl2Manager.on('setupStepStarted', (event) => {
                stepEvents.push({ type: 'started', step: event.step.name });
            });
            
            wsl2Manager.on('setupStepCompleted', (event) => {
                stepEvents.push({ type: 'completed', step: event.step.name });
            });

            await wsl2Manager.createEnvironment(mockPRDetails);

            expect(stepEvents.length).toBeGreaterThan(0);
            expect(stepEvents.filter(e => e.type === 'started')).toHaveLength(5);
            expect(stepEvents.filter(e => e.type === 'completed')).toHaveLength(5);
        });
    });
});

// Helper functions for testing
function createMockPRDetails(overrides = {}) {
    return {
        prNumber: 123,
        repositoryUrl: 'https://github.com/test/repo.git',
        branch: 'feature/test',
        baseBranch: 'main',
        files: ['src/app.js'],
        additions: 10,
        deletions: 5,
        ...overrides
    };
}

function waitFor(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

