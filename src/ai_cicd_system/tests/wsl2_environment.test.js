/**
 * WSL2 Environment Tests
 * Tests for WSL2 environment management functionality
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WSL2Manager } from '../integrations/wsl2_manager.js';

// Mock the logger
jest.mock('../utils/simple_logger.js', () => ({
  log: jest.fn()
}));

describe('WSL2 Manager', () => {
  let wsl2Manager;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      defaultDistribution: 'Ubuntu',
      timeout: 30000
    };

    wsl2Manager = new WSL2Manager(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize successfully when WSL2 is available', async () => {
      // Mock WSL2 availability check
      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockResolvedValueOnce({ stdout: 'Ubuntu\nDocker-desktop\n', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: 'Ubuntu\n', stderr: '', code: 0 })
        .mockResolvedValue({ stdout: '', stderr: '', code: 0 });

      await wsl2Manager.initialize();

      expect(wsl2Manager.isInitialized).toBe(true);
      expect(wsl2Manager.defaultDistribution).toBe('Ubuntu');
    });

    test('should fail initialization when WSL2 is not available', async () => {
      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockRejectedValue(new Error('WSL command not found'));

      await expect(wsl2Manager.initialize()).rejects.toThrow('WSL2 not available');
      expect(wsl2Manager.isInitialized).toBe(false);
    });

    test('should fail initialization when no distributions are found', async () => {
      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }) // --list --verbose
        .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // --list --quiet

      await expect(wsl2Manager.initialize()).rejects.toThrow('No WSL distributions found');
    });

    test('should filter out docker-desktop distributions', async () => {
      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockResolvedValueOnce({ stdout: 'Ubuntu\nDocker-desktop\n', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: 'Ubuntu\ndocker-desktop\ndocker-desktop-data\n', stderr: '', code: 0 })
        .mockResolvedValue({ stdout: '', stderr: '', code: 0 });

      await wsl2Manager.initialize();

      expect(wsl2Manager.defaultDistribution).toBe('Ubuntu');
    });
  });

  describe('Environment Creation', () => {
    beforeEach(async () => {
      // Mock successful initialization
      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockResolvedValue({ stdout: 'Ubuntu\n', stderr: '', code: 0 });
      
      await wsl2Manager.initialize();
      jest.clearAllMocks();
    });

    test('should create environment successfully', async () => {
      const config = {
        name: 'test-env',
        repository: 'https://github.com/test/repo.git',
        branch: 'main'
      };

      // Mock WSL commands
      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockResolvedValue({ stdout: '', stderr: '', code: 0 });

      const environment = await wsl2Manager.createEnvironment(config);

      expect(environment).toBeDefined();
      expect(environment.name).toBe('test-env');
      expect(environment.type).toBe('wsl2');
      expect(environment.distribution).toBe('Ubuntu');
      expect(environment.workingDirectory).toBe('/tmp/test-env');
      expect(wsl2Manager.activeEnvironments.has(environment.id)).toBe(true);
    });

    test('should generate unique environment IDs', async () => {
      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockResolvedValue({ stdout: '', stderr: '', code: 0 });

      const env1 = await wsl2Manager.createEnvironment({ name: 'env1' });
      const env2 = await wsl2Manager.createEnvironment({ name: 'env2' });

      expect(env1.id).not.toBe(env2.id);
      expect(wsl2Manager.activeEnvironments.size).toBe(2);
    });

    test('should handle repository cloning', async () => {
      const config = {
        name: 'repo-env',
        repository: 'https://github.com/test/repo.git',
        branch: 'feature-branch'
      };

      const cloneCommand = [
        '--distribution', 'Ubuntu',
        '--exec', 'bash', '-c',
        'cd /tmp/repo-env && git clone --branch feature-branch --single-branch https://github.com/test/repo.git .'
      ];

      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockImplementation((args) => {
          if (JSON.stringify(args) === JSON.stringify(cloneCommand)) {
            return Promise.resolve({ stdout: 'Cloning...', stderr: '', code: 0 });
          }
          return Promise.resolve({ stdout: '', stderr: '', code: 0 });
        });

      const environment = await wsl2Manager.createEnvironment(config);

      expect(environment.repository).toBe(config.repository);
      expect(environment.branch).toBe(config.branch);
    });

    test('should handle clone failures with fallback', async () => {
      const config = {
        name: 'fallback-env',
        repository: 'https://github.com/test/repo.git',
        branch: 'non-existent-branch'
      };

      let callCount = 0;
      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockImplementation((args) => {
          callCount++;
          if (callCount === 2 && args.includes('git clone --branch')) {
            // First clone attempt fails
            return Promise.reject(new Error('Branch not found'));
          } else if (callCount === 3 && args.includes('git clone')) {
            // Fallback clone succeeds
            return Promise.resolve({ stdout: 'Cloning...', stderr: '', code: 0 });
          }
          return Promise.resolve({ stdout: '', stderr: '', code: 0 });
        });

      const environment = await wsl2Manager.createEnvironment(config);

      expect(environment).toBeDefined();
      expect(callCount).toBeGreaterThan(2); // Should have attempted fallback
    });

    test('should fail environment creation on setup errors', async () => {
      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockRejectedValue(new Error('WSL setup failed'));

      await expect(wsl2Manager.createEnvironment({ name: 'fail-env' }))
        .rejects.toThrow('Failed to create WSL2 environment');
    });
  });

  describe('Environment Management', () => {
    let testEnvironment;

    beforeEach(async () => {
      // Initialize and create test environment
      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockResolvedValue({ stdout: 'Ubuntu\n', stderr: '', code: 0 });
      
      await wsl2Manager.initialize();
      
      testEnvironment = {
        id: 'test-env-id',
        name: 'test-environment',
        type: 'wsl2',
        distribution: 'Ubuntu',
        workingDirectory: '/tmp/test-env'
      };
      
      wsl2Manager.activeEnvironments.set(testEnvironment.id, testEnvironment);
      jest.clearAllMocks();
    });

    test('should execute commands in environment', async () => {
      const command = 'ls -la';
      const expectedArgs = [
        '--distribution', 'Ubuntu',
        '--exec', 'bash', '-c',
        'cd /tmp/test-env && ls -la'
      ];

      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockResolvedValue({ stdout: 'file1.txt\nfile2.js\n', stderr: '', code: 0 });

      const result = await wsl2Manager.executeInEnvironment(testEnvironment, command);

      expect(wsl2Manager.executeWSLCommand).toHaveBeenCalledWith(expectedArgs);
      expect(result.stdout).toContain('file1.txt');
    });

    test('should fail command execution for non-existent environment', async () => {
      const nonExistentEnv = { id: 'non-existent', name: 'fake' };

      await expect(wsl2Manager.executeInEnvironment(nonExistentEnv, 'ls'))
        .rejects.toThrow('Environment fake not found or not active');
    });

    test('should get environment status', async () => {
      jest.spyOn(wsl2Manager, 'executeInEnvironment')
        .mockResolvedValue({
          stdout: '/tmp/test-env\ntotal 4\ndrwxr-xr-x 2 user user 4096 Jan 1 12:00 .\n'
        });

      const status = await wsl2Manager.getEnvironmentStatus(testEnvironment);

      expect(status.status).toBe('active');
      expect(status.workingDirectory).toBe('/tmp/test-env');
      expect(status.files).toHaveLength(3); // pwd output + ls output lines
    });

    test('should handle environment status errors', async () => {
      jest.spyOn(wsl2Manager, 'executeInEnvironment')
        .mockRejectedValue(new Error('Environment not accessible'));

      const status = await wsl2Manager.getEnvironmentStatus(testEnvironment);

      expect(status.status).toBe('error');
      expect(status.error).toBe('Environment not accessible');
    });

    test('should get active environments', () => {
      const activeEnvs = wsl2Manager.getActiveEnvironments();

      expect(activeEnvs).toHaveLength(1);
      expect(activeEnvs[0].name).toBe('test-environment');
    });

    test('should get environment by ID', () => {
      const env = wsl2Manager.getEnvironmentById('test-env-id');

      expect(env).toBeDefined();
      expect(env.name).toBe('test-environment');
    });

    test('should return undefined for non-existent environment ID', () => {
      const env = wsl2Manager.getEnvironmentById('non-existent');

      expect(env).toBeUndefined();
    });
  });

  describe('Environment Cleanup', () => {
    let testEnvironment;

    beforeEach(async () => {
      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockResolvedValue({ stdout: 'Ubuntu\n', stderr: '', code: 0 });
      
      await wsl2Manager.initialize();
      
      testEnvironment = {
        id: 'cleanup-test',
        name: 'cleanup-environment',
        type: 'wsl2',
        distribution: 'Ubuntu',
        workingDirectory: '/tmp/cleanup-test'
      };
      
      wsl2Manager.activeEnvironments.set(testEnvironment.id, testEnvironment);
      jest.clearAllMocks();
    });

    test('should cleanup environment successfully', async () => {
      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockResolvedValue({ stdout: '', stderr: '', code: 0 });

      await wsl2Manager.cleanupEnvironment(testEnvironment);

      expect(wsl2Manager.activeEnvironments.has(testEnvironment.id)).toBe(false);
      expect(wsl2Manager.executeWSLCommand).toHaveBeenCalledWith([
        '--distribution', 'Ubuntu',
        '--exec', 'bash', '-c',
        'rm -rf /tmp/cleanup-test'
      ]);
    });

    test('should handle cleanup errors gracefully', async () => {
      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockRejectedValue(new Error('Cleanup failed'));

      // Should not throw error
      await wsl2Manager.cleanupEnvironment(testEnvironment);

      // Environment should still be removed from active list
      expect(wsl2Manager.activeEnvironments.has(testEnvironment.id)).toBe(false);
    });

    test('should cleanup all environments', async () => {
      // Add another environment
      const env2 = {
        id: 'cleanup-test-2',
        name: 'cleanup-environment-2',
        workingDirectory: '/tmp/cleanup-test-2'
      };
      wsl2Manager.activeEnvironments.set(env2.id, env2);

      jest.spyOn(wsl2Manager, 'executeWSLCommand')
        .mockResolvedValue({ stdout: '', stderr: '', code: 0 });

      await wsl2Manager.cleanupAllEnvironments();

      expect(wsl2Manager.activeEnvironments.size).toBe(0);
    });
  });

  describe('Health Check', () => {
    test('should return healthy status when WSL2 is available', async () => {
      jest.spyOn(wsl2Manager, 'checkWSL2Availability').mockResolvedValue(true);
      wsl2Manager.defaultDistribution = 'Ubuntu';
      wsl2Manager.activeEnvironments.set('test', {});

      const health = await wsl2Manager.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.distribution).toBe('Ubuntu');
      expect(health.activeEnvironments).toBe(1);
    });

    test('should return unhealthy status when WSL2 is not available', async () => {
      jest.spyOn(wsl2Manager, 'checkWSL2Availability')
        .mockRejectedValue(new Error('WSL2 not found'));

      const health = await wsl2Manager.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('WSL2 not found');
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      // Setup environments
      wsl2Manager.activeEnvironments.set('env1', { name: 'env1' });
      wsl2Manager.activeEnvironments.set('env2', { name: 'env2' });
      wsl2Manager.isInitialized = true;

      jest.spyOn(wsl2Manager, 'cleanupAllEnvironments').mockResolvedValue();

      await wsl2Manager.shutdown();

      expect(wsl2Manager.cleanupAllEnvironments).toHaveBeenCalled();
      expect(wsl2Manager.isInitialized).toBe(false);
    });
  });

  describe('Command Execution', () => {
    test('should execute WSL commands with proper arguments', async () => {
      const mockSpawn = jest.fn();
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };

      // Mock the child_process module
      jest.doMock('child_process', () => ({
        spawn: mockSpawn.mockReturnValue(mockChild)
      }));

      // Simulate successful command execution
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 0);
        }
      });

      const args = ['--list', '--verbose'];
      const promise = wsl2Manager.executeWSLCommand(args);

      // Simulate stdout data
      const stdoutCallback = mockChild.stdout.on.mock.calls.find(call => call[0] === 'data')[1];
      stdoutCallback('Ubuntu\n');

      const result = await promise;

      expect(mockSpawn).toHaveBeenCalledWith('wsl', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env
      });
    });

    test('should handle command timeouts', async () => {
      jest.useFakeTimers();

      const mockSpawn = jest.fn();
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      jest.doMock('child_process', () => ({
        spawn: mockSpawn.mockReturnValue(mockChild)
      }));

      const promise = wsl2Manager.executeWSLCommand(['--list'], { timeout: 1000 });

      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow('WSL command timed out');
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');

      jest.useRealTimers();
    });

    test('should handle command errors', async () => {
      const mockSpawn = jest.fn();
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };

      jest.doMock('child_process', () => ({
        spawn: mockSpawn.mockReturnValue(mockChild)
      }));

      // Simulate command error
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Command not found')), 0);
        }
      });

      await expect(wsl2Manager.executeWSLCommand(['--invalid']))
        .rejects.toThrow('Failed to execute WSL command: Command not found');
    });

    test('should handle non-zero exit codes', async () => {
      const mockSpawn = jest.fn();
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };

      jest.doMock('child_process', () => ({
        spawn: mockSpawn.mockReturnValue(mockChild)
      }));

      // Simulate command failure
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 0);
        }
      });

      // Simulate stderr data
      const stderrCallback = mockChild.stderr.on.mock.calls.find(call => call[0] === 'data')[1];
      stderrCallback('Command failed\n');

      await expect(wsl2Manager.executeWSLCommand(['--fail']))
        .rejects.toThrow('WSL command failed (exit code 1): Command failed');
    });
  });
});

