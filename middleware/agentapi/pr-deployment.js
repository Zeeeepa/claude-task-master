/**
 * PR Deployment Service
 * 
 * Handles automatic PR branch deployment, code validation, and error debugging
 * Manages isolated workspaces for concurrent PR processing
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

export class PRDeploymentService extends EventEmitter {
  constructor(workspaceRoot) {
    super();
    this.workspaceRoot = workspaceRoot;
    this.deployments = new Map(); // deploymentId -> deployment info
    this.workspaces = new Map(); // workspaceId -> workspace info
  }

  async deployPR({ repoUrl, prNumber, branch, targetBranch = 'main' }) {
    const deploymentId = uuidv4();
    const workspaceId = `pr-${prNumber}-${Date.now()}`;
    const workspacePath = path.join(this.workspaceRoot, workspaceId);

    const deployment = {
      id: deploymentId,
      workspaceId,
      workspacePath,
      repoUrl,
      prNumber,
      branch,
      targetBranch,
      status: 'deploying',
      startedAt: new Date().toISOString(),
      steps: [],
      logs: [],
    };

    this.deployments.set(deploymentId, deployment);
    this.workspaces.set(workspaceId, {
      id: workspaceId,
      path: workspacePath,
      deploymentId,
      status: 'active',
      createdAt: new Date().toISOString(),
    });

    try {
      // Step 1: Create workspace directory
      await this.executeStep(deployment, 'create-workspace', async () => {
        await fs.mkdir(workspacePath, { recursive: true });
        this.log(deployment, `Created workspace: ${workspacePath}`);
      });

      // Step 2: Clone repository
      await this.executeStep(deployment, 'clone-repo', async () => {
        await this.runCommand('git', ['clone', repoUrl, '.'], workspacePath);
        this.log(deployment, `Cloned repository: ${repoUrl}`);
      });

      // Step 3: Fetch PR branch
      await this.executeStep(deployment, 'fetch-pr', async () => {
        await this.runCommand('git', ['fetch', 'origin', `pull/${prNumber}/head:${branch}`], workspacePath);
        this.log(deployment, `Fetched PR #${prNumber} branch: ${branch}`);
      });

      // Step 4: Checkout PR branch
      await this.executeStep(deployment, 'checkout-branch', async () => {
        await this.runCommand('git', ['checkout', branch], workspacePath);
        this.log(deployment, `Checked out branch: ${branch}`);
      });

      // Step 5: Install dependencies (if package.json exists)
      await this.executeStep(deployment, 'install-deps', async () => {
        const packageJsonPath = path.join(workspacePath, 'package.json');
        try {
          await fs.access(packageJsonPath);
          await this.runCommand('npm', ['install'], workspacePath);
          this.log(deployment, 'Installed npm dependencies');
        } catch (error) {
          // Check for other package managers
          const yarnLockPath = path.join(workspacePath, 'yarn.lock');
          const pnpmLockPath = path.join(workspacePath, 'pnpm-lock.yaml');
          
          try {
            await fs.access(yarnLockPath);
            await this.runCommand('yarn', ['install'], workspacePath);
            this.log(deployment, 'Installed yarn dependencies');
          } catch (yarnError) {
            try {
              await fs.access(pnpmLockPath);
              await this.runCommand('pnpm', ['install'], workspacePath);
              this.log(deployment, 'Installed pnpm dependencies');
            } catch (pnpmError) {
              this.log(deployment, 'No package manager lock file found, skipping dependency installation');
            }
          }
        }
      });

      // Step 6: Run basic health checks
      await this.executeStep(deployment, 'health-check', async () => {
        await this.performHealthChecks(deployment);
      });

      deployment.status = 'deployed';
      deployment.completedAt = new Date().toISOString();
      
      this.emit('deploymentCompleted', deployment);
      this.log(deployment, `PR #${prNumber} deployed successfully`);

      return deployment;

    } catch (error) {
      deployment.status = 'failed';
      deployment.error = error.message;
      deployment.failedAt = new Date().toISOString();
      
      this.emit('deploymentFailed', deployment);
      this.log(deployment, `Deployment failed: ${error.message}`, 'error');
      
      throw error;
    }
  }

  async validateCode(workspaceId, options = {}) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const { agentType = 'claude', validationRules = [] } = options;
    const validationId = uuidv4();
    
    const validation = {
      id: validationId,
      workspaceId,
      agentType,
      status: 'running',
      startedAt: new Date().toISOString(),
      results: [],
      errors: [],
    };

    try {
      // Default validation rules
      const defaultRules = [
        'syntax-check',
        'lint-check',
        'test-run',
        'build-check',
      ];

      const rulesToRun = validationRules.length > 0 ? validationRules : defaultRules;

      for (const rule of rulesToRun) {
        const result = await this.runValidationRule(workspace, rule, agentType);
        validation.results.push(result);
        
        if (!result.passed) {
          validation.errors.push(...result.errors);
        }
      }

      validation.status = validation.errors.length > 0 ? 'failed' : 'passed';
      validation.completedAt = new Date().toISOString();

      this.emit('validationCompleted', validation);
      return validation;

    } catch (error) {
      validation.status = 'error';
      validation.error = error.message;
      validation.failedAt = new Date().toISOString();
      
      this.emit('validationFailed', validation);
      throw error;
    }
  }

  async debugErrors(workspaceId, options = {}) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const { errors, agentType = 'claude' } = options;
    const debugId = uuidv4();
    
    const debugSession = {
      id: debugId,
      workspaceId,
      agentType,
      status: 'running',
      startedAt: new Date().toISOString(),
      errors: errors,
      fixes: [],
      suggestions: [],
    };

    try {
      // Analyze each error and generate fixes
      for (const error of errors) {
        const fix = await this.generateErrorFix(workspace, error, agentType);
        debugSession.fixes.push(fix);
      }

      // Generate overall suggestions
      debugSession.suggestions = await this.generateSuggestions(workspace, errors, agentType);

      debugSession.status = 'completed';
      debugSession.completedAt = new Date().toISOString();

      this.emit('debugCompleted', debugSession);
      return debugSession;

    } catch (error) {
      debugSession.status = 'error';
      debugSession.error = error.message;
      debugSession.failedAt = new Date().toISOString();
      
      this.emit('debugFailed', debugSession);
      throw error;
    }
  }

  async cleanupWorkspace(workspaceId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    try {
      // Remove workspace directory
      await fs.rm(workspace.path, { recursive: true, force: true });
      
      // Remove from tracking
      this.workspaces.delete(workspaceId);
      
      // Remove associated deployment
      if (workspace.deploymentId) {
        this.deployments.delete(workspace.deploymentId);
      }

      this.emit('workspaceCleanedUp', { workspaceId });
      
    } catch (error) {
      console.error(`Error cleaning up workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  // Private helper methods

  async executeStep(deployment, stepName, stepFunction) {
    const step = {
      name: stepName,
      status: 'running',
      startedAt: new Date().toISOString(),
    };

    deployment.steps.push(step);

    try {
      await stepFunction();
      step.status = 'completed';
      step.completedAt = new Date().toISOString();
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      step.failedAt = new Date().toISOString();
      throw error;
    }
  }

  async runCommand(command, args, cwd) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  async performHealthChecks(deployment) {
    const checks = [];

    // Check if it's a Node.js project
    const packageJsonPath = path.join(deployment.workspacePath, 'package.json');
    try {
      await fs.access(packageJsonPath);
      checks.push(await this.checkNodeProject(deployment.workspacePath));
    } catch (error) {
      // Not a Node.js project
    }

    // Check if it's a Python project
    const requirementsPath = path.join(deployment.workspacePath, 'requirements.txt');
    const pyprojectPath = path.join(deployment.workspacePath, 'pyproject.toml');
    try {
      await fs.access(requirementsPath);
      checks.push(await this.checkPythonProject(deployment.workspacePath));
    } catch (error) {
      try {
        await fs.access(pyprojectPath);
        checks.push(await this.checkPythonProject(deployment.workspacePath));
      } catch (error) {
        // Not a Python project
      }
    }

    // Check Git status
    checks.push(await this.checkGitStatus(deployment.workspacePath));

    deployment.healthChecks = checks;
    this.log(deployment, `Completed ${checks.length} health checks`);
  }

  async checkNodeProject(workspacePath) {
    try {
      const result = await this.runCommand('node', ['--version'], workspacePath);
      return {
        type: 'node',
        status: 'passed',
        version: result.stdout.trim(),
      };
    } catch (error) {
      return {
        type: 'node',
        status: 'failed',
        error: error.message,
      };
    }
  }

  async checkPythonProject(workspacePath) {
    try {
      const result = await this.runCommand('python', ['--version'], workspacePath);
      return {
        type: 'python',
        status: 'passed',
        version: result.stdout.trim(),
      };
    } catch (error) {
      return {
        type: 'python',
        status: 'failed',
        error: error.message,
      };
    }
  }

  async checkGitStatus(workspacePath) {
    try {
      const result = await this.runCommand('git', ['status', '--porcelain'], workspacePath);
      return {
        type: 'git',
        status: 'passed',
        clean: result.stdout.trim() === '',
      };
    } catch (error) {
      return {
        type: 'git',
        status: 'failed',
        error: error.message,
      };
    }
  }

  async runValidationRule(workspace, rule, agentType) {
    const result = {
      rule,
      agentType,
      status: 'running',
      startedAt: new Date().toISOString(),
      passed: false,
      errors: [],
      warnings: [],
    };

    try {
      switch (rule) {
        case 'syntax-check':
          await this.validateSyntax(workspace, result);
          break;
        case 'lint-check':
          await this.validateLinting(workspace, result);
          break;
        case 'test-run':
          await this.runTests(workspace, result);
          break;
        case 'build-check':
          await this.validateBuild(workspace, result);
          break;
        default:
          throw new Error(`Unknown validation rule: ${rule}`);
      }

      result.status = 'completed';
      result.completedAt = new Date().toISOString();

    } catch (error) {
      result.status = 'failed';
      result.error = error.message;
      result.failedAt = new Date().toISOString();
    }

    return result;
  }

  async validateSyntax(workspace, result) {
    // Check for common syntax issues
    const packageJsonPath = path.join(workspace.path, 'package.json');
    
    try {
      await fs.access(packageJsonPath);
      // Node.js project - check JavaScript/TypeScript syntax
      try {
        await this.runCommand('npx', ['tsc', '--noEmit', '--skipLibCheck'], workspace.path);
        result.passed = true;
      } catch (error) {
        result.errors.push({
          type: 'typescript',
          message: error.message,
        });
      }
    } catch (error) {
      // Not a Node.js project, check for Python
      try {
        await this.runCommand('python', ['-m', 'py_compile', '.'], workspace.path);
        result.passed = true;
      } catch (error) {
        result.errors.push({
          type: 'python',
          message: error.message,
        });
      }
    }
  }

  async validateLinting(workspace, result) {
    const packageJsonPath = path.join(workspace.path, 'package.json');
    
    try {
      await fs.access(packageJsonPath);
      // Try ESLint
      try {
        await this.runCommand('npx', ['eslint', '.'], workspace.path);
        result.passed = true;
      } catch (error) {
        result.warnings.push({
          type: 'eslint',
          message: error.message,
        });
        result.passed = true; // Linting warnings don't fail validation
      }
    } catch (error) {
      // Try Python linting
      try {
        await this.runCommand('python', ['-m', 'flake8', '.'], workspace.path);
        result.passed = true;
      } catch (error) {
        result.warnings.push({
          type: 'flake8',
          message: error.message,
        });
        result.passed = true; // Linting warnings don't fail validation
      }
    }
  }

  async runTests(workspace, result) {
    const packageJsonPath = path.join(workspace.path, 'package.json');
    
    try {
      await fs.access(packageJsonPath);
      // Node.js project
      try {
        await this.runCommand('npm', ['test'], workspace.path);
        result.passed = true;
      } catch (error) {
        result.errors.push({
          type: 'npm-test',
          message: error.message,
        });
      }
    } catch (error) {
      // Python project
      try {
        await this.runCommand('python', ['-m', 'pytest'], workspace.path);
        result.passed = true;
      } catch (error) {
        result.errors.push({
          type: 'pytest',
          message: error.message,
        });
      }
    }
  }

  async validateBuild(workspace, result) {
    const packageJsonPath = path.join(workspace.path, 'package.json');
    
    try {
      await fs.access(packageJsonPath);
      // Node.js project
      try {
        await this.runCommand('npm', ['run', 'build'], workspace.path);
        result.passed = true;
      } catch (error) {
        result.errors.push({
          type: 'npm-build',
          message: error.message,
        });
      }
    } catch (error) {
      // Python project - check if setup.py exists
      try {
        await fs.access(path.join(workspace.path, 'setup.py'));
        await this.runCommand('python', ['setup.py', 'build'], workspace.path);
        result.passed = true;
      } catch (error) {
        result.warnings.push({
          type: 'python-build',
          message: 'No build script found',
        });
        result.passed = true; // Not having a build script is not a failure
      }
    }
  }

  async generateErrorFix(workspace, error, agentType) {
    // This would integrate with the specific agent to generate fixes
    // For now, return a placeholder structure
    return {
      errorId: uuidv4(),
      error,
      agentType,
      suggestedFix: {
        type: 'code-change',
        description: `Fix for ${error.type}: ${error.message}`,
        files: [],
        commands: [],
      },
      confidence: 0.8,
      generatedAt: new Date().toISOString(),
    };
  }

  async generateSuggestions(workspace, errors, agentType) {
    // Generate overall improvement suggestions
    return [
      {
        type: 'improvement',
        title: 'Code Quality',
        description: 'Consider adding more comprehensive error handling',
        priority: 'medium',
      },
      {
        type: 'testing',
        title: 'Test Coverage',
        description: 'Increase test coverage for better reliability',
        priority: 'high',
      },
    ];
  }

  log(deployment, message, level = 'info') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    
    deployment.logs.push(logEntry);
    console.log(`[${deployment.workspaceId}] ${level.toUpperCase()}: ${message}`);
  }

  getDeployment(deploymentId) {
    return this.deployments.get(deploymentId);
  }

  getWorkspace(workspaceId) {
    return this.workspaces.get(workspaceId);
  }

  listDeployments() {
    return Array.from(this.deployments.values());
  }

  listWorkspaces() {
    return Array.from(this.workspaces.values());
  }
}

