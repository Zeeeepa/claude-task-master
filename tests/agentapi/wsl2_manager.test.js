/**
 * WSL2 Manager Tests
 */

const WSL2Manager = require('../../src/ai_cicd_system/agentapi/wsl2_manager');
const { exec } = require('child_process');

// Mock child_process
jest.mock('child_process');

describe('WSL2Manager', () => {
  let wsl2Manager;
  let mockExec;

  beforeEach(() => {
    mockExec = jest.fn();
    exec.mockImplementation((command, options, callback) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      mockExec(command, options, callback);
    });

    const testConfig = {
      maxInstances: 3,
      resourceLimits: {
        memory: '1GB',
        cpu: '1 core',
        disk: '5GB'
      },
      timeout: 60000,
      baseDistribution: 'Ubuntu-22.04',
      workspaceRoot: '/tmp/test-workspaces'
    };

    wsl2Manager = new WSL2Manager(testConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with correct configuration', () => {
      expect(wsl2Manager.config.maxInstances).toBe(3);
      expect(wsl2Manager.config.baseDistribution).toBe('Ubuntu-22.04');
      expect(wsl2Manager.config.workspaceRoot).toBe('/tmp/test-workspaces');
      expect(wsl2Manager.isInitialized).toBe(false);
    });

    test('should use default configuration when not provided', () => {
      const defaultManager = new WSL2Manager();
      
      expect(defaultManager.config.maxInstances).toBe(5);
      expect(defaultManager.config.baseDistribution).toBe('Ubuntu-22.04');
      expect(defaultManager.config.timeout).toBe(300000);
    });
  });

  describe('WSL2 Availability Check', () => {
    test('should check WSL2 availability successfully', async () => {
      mockExec.mockImplementation((command, options, callback) => {
        if (command === 'wsl --version') {
          callback(null, { stdout: 'WSL version: 2.0.0.0' });
        } else if (command === 'wsl --status') {
          callback(null, { stdout: 'Default Version: 2' });
        }
      });

      await expect(wsl2Manager.checkWSL2Availability()).resolves.not.toThrow();
    });

    test('should throw error when WSL2 is not available', async () => {
      mockExec.mockImplementation((command, options, callback) => {
        callback(new Error('WSL not found'));
      });

      await expect(wsl2Manager.checkWSL2Availability()).rejects.toThrow('WSL2 not available');
    });

    test('should throw error when WSL2 is not default version', async () => {
      mockExec.mockImplementation((command, options, callback) => {
        if (command === 'wsl --version') {
          callback(null, { stdout: 'WSL version: 2.0.0.0' });
        } else if (command === 'wsl --status') {
          callback(null, { stdout: 'Default Version: 1' });
        }
      });

      await expect(wsl2Manager.checkWSL2Availability()).rejects.toThrow('WSL2 is not the default version');
    });
  });

  describe('Base Distribution Management', () => {
    test('should ensure base distribution exists', async () => {
      mockExec.mockImplementation((command, options, callback) => {
        if (command === 'wsl --list --verbose') {
          callback(null, { stdout: 'Ubuntu-22.04    Running    2' });
        }
      });

      await expect(wsl2Manager.ensureBaseDistribution()).resolves.not.toThrow();
    });

    test('should install base distribution if not exists', async () => {
      mockExec.mockImplementation((command, options, callback) => {
        if (command === 'wsl --list --verbose') {
          callback(null, { stdout: 'No distributions found' });
        } else if (command === 'wsl --install -d Ubuntu-22.04') {
          callback(null, { stdout: 'Installation complete' });
        } else if (command.includes('echo "ready"')) {
          callback(null, { stdout: 'ready' });
        }
      });

      await expect(wsl2Manager.ensureBaseDistribution()).resolves.not.toThrow();
    });
  });

  describe('Instance Creation', () => {
    beforeEach(() => {
      wsl2Manager.isInitialized = true;
    });

    test('should create instance successfully', async () => {
      const deploymentId = 'test-deployment';
      
      mockExec.mockImplementation((command, options, callback) => {
        callback(null, { stdout: 'Success' });
      });

      const instance = await wsl2Manager.createInstance(deploymentId);

      expect(instance).toMatchObject({
        deploymentId,
        status: 'running',
        workspacePath: expect.stringContaining('test-deployment')
      });
      expect(instance.id).toMatch(/^agentapi-test-deployment-[a-f0-9]{8}$/);
    });

    test('should throw error when max instances reached', async () => {
      wsl2Manager.instances.set('instance1', {});
      wsl2Manager.instances.set('instance2', {});
      wsl2Manager.instances.set('instance3', {});

      await expect(wsl2Manager.createInstance('test-deployment'))
        .rejects.toThrow('Maximum instances limit reached: 3');
    });

    test('should throw error when not initialized', async () => {
      wsl2Manager.isInitialized = false;

      await expect(wsl2Manager.createInstance('test-deployment'))
        .rejects.toThrow('WSL2 Manager not initialized');
    });
  });

  describe('Command Execution', () => {
    beforeEach(() => {
      wsl2Manager.isInitialized = true;
      wsl2Manager.instances.set('test-instance', {
        id: 'test-instance',
        workspacePath: '/tmp/test'
      });
    });

    test('should execute command successfully', async () => {
      mockExec.mockImplementation((command, options, callback) => {
        callback(null, { stdout: 'command output', stderr: '' });
      });

      const result = await wsl2Manager.executeCommand('test-instance', 'echo "hello"');

      expect(result).toMatchObject({
        success: true,
        stdout: 'command output',
        stderr: '',
        exitCode: 0
      });
    });

    test('should handle command failure', async () => {
      mockExec.mockImplementation((command, options, callback) => {
        const error = new Error('Command failed');
        error.code = 1;
        error.stdout = '';
        error.stderr = 'error message';
        callback(error);
      });

      const result = await wsl2Manager.executeCommand('test-instance', 'invalid-command');

      expect(result).toMatchObject({
        success: false,
        stdout: '',
        stderr: 'error message',
        exitCode: 1
      });
    });

    test('should throw error for non-existent instance', async () => {
      await expect(wsl2Manager.executeCommand('non-existent', 'echo "hello"'))
        .rejects.toThrow('Instance not found: non-existent');
    });
  });

  describe('Resource Management', () => {
    test('should get resource usage', () => {
      const usage = wsl2Manager.getResourceUsage();

      expect(usage).toMatchObject({
        memory: expect.any(Number),
        cpu: expect.any(Number),
        disk: expect.any(Number),
        activeInstances: expect.any(Number)
      });
    });

    test('should update resource usage', async () => {
      wsl2Manager.instances.set('test-instance', {
        id: 'test-instance',
        resourceUsage: {
          memory: { used: 1000000 },
          cpu: { percentage: 50 },
          disk: { used: 5000000 }
        }
      });

      await wsl2Manager.updateResourceUsage();

      expect(wsl2Manager.resourceUsage.activeInstances).toBe(1);
    });
  });

  describe('Instance Cleanup', () => {
    beforeEach(() => {
      wsl2Manager.isInitialized = true;
    });

    test('should destroy instance successfully', async () => {
      const instance = {
        id: 'test-instance',
        processes: new Map()
      };
      wsl2Manager.instances.set('test-instance', instance);

      mockExec.mockImplementation((command, options, callback) => {
        callback(null, { stdout: 'Success' });
      });

      await wsl2Manager.destroyInstance('test-instance');

      expect(wsl2Manager.instances.has('test-instance')).toBe(false);
    });

    test('should cleanup idle instances', async () => {
      const oldInstance = {
        id: 'old-instance',
        createdAt: new Date(Date.now() - 35 * 60 * 1000), // 35 minutes ago
        processes: new Map()
      };
      
      const newInstance = {
        id: 'new-instance',
        createdAt: new Date(),
        processes: new Map()
      };

      wsl2Manager.instances.set('old-instance', oldInstance);
      wsl2Manager.instances.set('new-instance', newInstance);

      mockExec.mockImplementation((command, options, callback) => {
        callback(null, { stdout: 'Success' });
      });

      await wsl2Manager.cleanupIdleInstances();

      expect(wsl2Manager.instances.has('old-instance')).toBe(false);
      expect(wsl2Manager.instances.has('new-instance')).toBe(true);
    });

    test('should cleanup all instances', async () => {
      wsl2Manager.instances.set('instance1', { id: 'instance1', processes: new Map() });
      wsl2Manager.instances.set('instance2', { id: 'instance2', processes: new Map() });

      mockExec.mockImplementation((command, options, callback) => {
        callback(null, { stdout: 'Success' });
      });

      await wsl2Manager.cleanup();

      expect(wsl2Manager.instances.size).toBe(0);
    });
  });

  describe('Process Management', () => {
    beforeEach(() => {
      wsl2Manager.instances.set('test-instance', {
        id: 'test-instance',
        processes: new Map(),
        workspacePath: '/tmp/test'
      });
    });

    test('should start process successfully', async () => {
      const mockProcess = {
        pid: 1234,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };

      const spawn = require('child_process').spawn;
      spawn.mockReturnValue(mockProcess);

      const result = await wsl2Manager.startProcess('test-instance', 'long-running-command');

      expect(result).toMatchObject({
        processId: expect.any(String),
        pid: 1234
      });
    });

    test('should stop process successfully', async () => {
      const mockProcess = {
        kill: jest.fn(),
        on: jest.fn()
      };

      const instance = wsl2Manager.instances.get('test-instance');
      instance.processes.set('test-process', {
        process: mockProcess,
        command: 'test-command',
        startTime: new Date()
      });

      await wsl2Manager.stopProcess('test-instance', 'test-process');

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('Error Handling', () => {
    test('should handle initialization errors gracefully', async () => {
      mockExec.mockImplementation((command, options, callback) => {
        callback(new Error('Initialization failed'));
      });

      await expect(wsl2Manager.initialize()).rejects.toThrow('Failed to initialize WSL2 Manager');
    });

    test('should handle instance creation errors', async () => {
      wsl2Manager.isInitialized = true;
      
      mockExec.mockImplementation((command, options, callback) => {
        if (command.includes('--export')) {
          callback(new Error('Export failed'));
        }
      });

      await expect(wsl2Manager.createInstance('test-deployment'))
        .rejects.toThrow();
    });
  });
});

