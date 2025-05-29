/**
 * Phase 4 Quality System Validator
 * 
 * Comprehensive validation system for Phase 4 implementation
 * Validates integration between monitoring, testing, and status sync components
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Phase4Validator {
  constructor(config = {}) {
    this.config = {
      validateDependencies: true,
      validateConfiguration: true,
      validateIntegration: true,
      validateQualityGates: true,
      strictMode: false,
      ...config
    };

    this.validationResults = {
      timestamp: Date.now(),
      phase: 'Phase 4 - Quality System',
      status: 'pending',
      categories: {
        dependencies: { status: 'pending', tests: [] },
        configuration: { status: 'pending', tests: [] },
        integration: { status: 'pending', tests: [] },
        qualityGates: { status: 'pending', tests: [] }
      },
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      },
      recommendations: []
    };
  }

  /**
   * Run comprehensive Phase 4 validation
   */
  async validate() {
    console.log('🔍 Starting Phase 4 Quality System validation...');

    try {
      // Validate dependencies
      if (this.config.validateDependencies) {
        await this.validateDependencies();
      }

      // Validate configuration
      if (this.config.validateConfiguration) {
        await this.validateConfiguration();
      }

      // Validate integration
      if (this.config.validateIntegration) {
        await this.validateIntegration();
      }

      // Validate quality gates
      if (this.config.validateQualityGates) {
        await this.validateQualityGates();
      }

      // Calculate final results
      this.calculateResults();

      console.log(`✅ Phase 4 validation completed: ${this.validationResults.status}`);
      return this.validationResults;

    } catch (error) {
      console.error('❌ Phase 4 validation failed:', error);
      this.validationResults.status = 'error';
      this.validationResults.error = error.message;
      return this.validationResults;
    }
  }

  /**
   * Validate Phase 4 dependencies and component availability
   */
  async validateDependencies() {
    console.log('📦 Validating Phase 4 dependencies...');

    const category = this.validationResults.categories.dependencies;

    // Check if monitoring system files exist
    await this.addTest(category, 'monitoring_files', async () => {
      const monitoringPath = path.join(process.cwd(), 'src/monitoring-analytics-system');
      try {
        await fs.access(monitoringPath);
        return { passed: true, message: 'Monitoring system files found' };
      } catch {
        return { passed: false, message: 'Monitoring system files not found' };
      }
    });

    // Check if testing framework files exist
    await this.addTest(category, 'testing_files', async () => {
      const testingPath = path.join(process.cwd(), 'tests');
      try {
        await fs.access(testingPath);
        const jestConfig = path.join(process.cwd(), 'jest.config.js');
        await fs.access(jestConfig);
        return { passed: true, message: 'Testing framework files found' };
      } catch {
        return { passed: false, message: 'Testing framework files not found' };
      }
    });

    // Check if status sync files exist
    await this.addTest(category, 'status_sync_files', async () => {
      const configPath = path.join(process.cwd(), 'config');
      try {
        await fs.access(configPath);
        return { passed: true, message: 'Status sync configuration found' };
      } catch {
        return { passed: false, message: 'Status sync configuration not found' };
      }
    });

    // Check package.json dependencies
    await this.addTest(category, 'package_dependencies', async () => {
      try {
        const packagePath = path.join(process.cwd(), 'package.json');
        const packageContent = await fs.readFile(packagePath, 'utf8');
        const packageJson = JSON.parse(packageContent);
        
        const requiredDeps = ['jest', 'express', 'ws'];
        const missingDeps = requiredDeps.filter(dep => 
          !packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]
        );

        if (missingDeps.length === 0) {
          return { passed: true, message: 'All required dependencies found' };
        } else {
          return { 
            passed: false, 
            message: `Missing dependencies: ${missingDeps.join(', ')}` 
          };
        }
      } catch (error) {
        return { passed: false, message: `Package.json validation failed: ${error.message}` };
      }
    });

    // Check Node.js version compatibility
    await this.addTest(category, 'node_version', async () => {
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
      
      if (majorVersion >= 18) {
        return { passed: true, message: `Node.js ${nodeVersion} is compatible` };
      } else {
        return { 
          passed: false, 
          message: `Node.js ${nodeVersion} is not compatible (requires >= 18)` 
        };
      }
    });

    this.setCategoryStatus(category);
  }

  /**
   * Validate Phase 4 configuration files and settings
   */
  async validateConfiguration() {
    console.log('⚙️ Validating Phase 4 configuration...');

    const category = this.validationResults.categories.configuration;

    // Validate Phase 4 config file
    await this.addTest(category, 'phase4_config', async () => {
      try {
        const configPath = path.join(__dirname, '../config/phase4-config.json');
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configContent);
        
        const requiredSections = ['phase4', 'components', 'integration', 'qualityGates'];
        const missingSections = requiredSections.filter(section => !config[section]);
        
        if (missingSections.length === 0) {
          return { passed: true, message: 'Phase 4 configuration is valid' };
        } else {
          return { 
            passed: false, 
            message: `Missing config sections: ${missingSections.join(', ')}` 
          };
        }
      } catch (error) {
        return { passed: false, message: `Config validation failed: ${error.message}` };
      }
    });

    // Validate environment variables
    await this.addTest(category, 'environment_variables', async () => {
      const requiredEnvVars = ['NODE_ENV'];
      const optionalEnvVars = ['LINEAR_API_KEY', 'LINEAR_TEAM_ID', 'DATABASE_URL'];
      
      const missingRequired = requiredEnvVars.filter(envVar => !process.env[envVar]);
      const missingOptional = optionalEnvVars.filter(envVar => !process.env[envVar]);
      
      if (missingRequired.length === 0) {
        let message = 'Required environment variables found';
        if (missingOptional.length > 0) {
          message += ` (optional missing: ${missingOptional.join(', ')})`;
        }
        return { passed: true, message };
      } else {
        return { 
          passed: false, 
          message: `Missing required environment variables: ${missingRequired.join(', ')}` 
        };
      }
    });

    // Validate Jest configuration
    await this.addTest(category, 'jest_config', async () => {
      try {
        const jestConfigPath = path.join(process.cwd(), 'jest.config.js');
        await fs.access(jestConfigPath);
        
        // Try to require the config to validate syntax
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        const jestConfig = require(jestConfigPath);
        
        if (jestConfig && typeof jestConfig === 'object') {
          return { passed: true, message: 'Jest configuration is valid' };
        } else {
          return { passed: false, message: 'Jest configuration is invalid' };
        }
      } catch (error) {
        return { passed: false, message: `Jest config validation failed: ${error.message}` };
      }
    });

    // Validate monitoring configuration
    await this.addTest(category, 'monitoring_config', async () => {
      try {
        // Check if monitoring system can be imported
        const monitoringPath = path.join(process.cwd(), 'src/monitoring-analytics-system/core/monitoring-system.js');
        await fs.access(monitoringPath);
        return { passed: true, message: 'Monitoring configuration accessible' };
      } catch (error) {
        return { passed: false, message: 'Monitoring configuration not accessible' };
      }
    });

    this.setCategoryStatus(category);
  }

  /**
   * Validate Phase 4 component integration
   */
  async validateIntegration() {
    console.log('🔗 Validating Phase 4 integration...');

    const category = this.validationResults.categories.integration;

    // Test Phase 4 system instantiation
    await this.addTest(category, 'system_instantiation', async () => {
      try {
        const { Phase4QualitySystem } = await import('../index.js');
        const system = new Phase4QualitySystem({
          components: {
            monitoring: { enabled: false },
            testing: { enabled: false },
            statusSync: { enabled: false },
            security: { enabled: false }
          }
        });
        
        if (system && typeof system.initialize === 'function') {
          return { passed: true, message: 'Phase 4 system can be instantiated' };
        } else {
          return { passed: false, message: 'Phase 4 system instantiation failed' };
        }
      } catch (error) {
        return { passed: false, message: `System instantiation failed: ${error.message}` };
      }
    });

    // Test component configuration loading
    await this.addTest(category, 'component_config_loading', async () => {
      try {
        const configPath = path.join(__dirname, '../config/phase4-config.json');
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configContent);
        
        const components = ['monitoring', 'testing', 'statusSync', 'security'];
        const configuredComponents = components.filter(comp => config.components[comp]);
        
        if (configuredComponents.length === components.length) {
          return { passed: true, message: 'All component configurations loaded' };
        } else {
          const missing = components.filter(comp => !config.components[comp]);
          return { 
            passed: false, 
            message: `Missing component configs: ${missing.join(', ')}` 
          };
        }
      } catch (error) {
        return { passed: false, message: `Config loading failed: ${error.message}` };
      }
    });

    // Test event system integration
    await this.addTest(category, 'event_system', async () => {
      try {
        const { Phase4QualitySystem } = await import('../index.js');
        const system = new Phase4QualitySystem({
          components: {
            monitoring: { enabled: false },
            testing: { enabled: false },
            statusSync: { enabled: false },
            security: { enabled: false }
          }
        });
        
        let eventReceived = false;
        system.on('test_event', () => {
          eventReceived = true;
        });
        
        system.emit('test_event');
        
        if (eventReceived) {
          return { passed: true, message: 'Event system working correctly' };
        } else {
          return { passed: false, message: 'Event system not working' };
        }
      } catch (error) {
        return { passed: false, message: `Event system test failed: ${error.message}` };
      }
    });

    // Test cross-component validation
    await this.addTest(category, 'cross_component_validation', async () => {
      try {
        const { Phase4QualitySystem } = await import('../index.js');
        const system = new Phase4QualitySystem({
          components: {
            monitoring: { enabled: false },
            testing: { enabled: false },
            statusSync: { enabled: false },
            security: { enabled: false }
          }
        });
        
        if (typeof system.validateCrossComponentIntegration === 'function') {
          const result = system.validateCrossComponentIntegration();
          return { 
            passed: true, 
            message: `Cross-component validation available (result: ${result})` 
          };
        } else {
          return { passed: false, message: 'Cross-component validation not available' };
        }
      } catch (error) {
        return { passed: false, message: `Cross-component validation failed: ${error.message}` };
      }
    });

    this.setCategoryStatus(category);
  }

  /**
   * Validate Phase 4 quality gates
   */
  async validateQualityGates() {
    console.log('🎯 Validating Phase 4 quality gates...');

    const category = this.validationResults.categories.qualityGates;

    // Validate quality gate configuration
    await this.addTest(category, 'quality_gate_config', async () => {
      try {
        const configPath = path.join(__dirname, '../config/phase4-config.json');
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configContent);
        
        const qualityGates = config.qualityGates;
        const requiredGates = ['phase4', 'monitoring', 'testing', 'statusSync', 'security'];
        const configuredGates = requiredGates.filter(gate => qualityGates[gate]);
        
        if (configuredGates.length === requiredGates.length) {
          return { passed: true, message: 'All quality gates configured' };
        } else {
          const missing = requiredGates.filter(gate => !qualityGates[gate]);
          return { 
            passed: false, 
            message: `Missing quality gates: ${missing.join(', ')}` 
          };
        }
      } catch (error) {
        return { passed: false, message: `Quality gate config validation failed: ${error.message}` };
      }
    });

    // Validate threshold values
    await this.addTest(category, 'threshold_validation', async () => {
      try {
        const configPath = path.join(__dirname, '../config/phase4-config.json');
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configContent);
        
        const thresholds = config.qualityGates;
        const invalidThresholds = [];
        
        // Check monitoring thresholds
        if (thresholds.monitoring?.health_threshold < 0 || thresholds.monitoring?.health_threshold > 100) {
          invalidThresholds.push('monitoring.health_threshold');
        }
        
        // Check testing thresholds
        if (thresholds.testing?.coverage_threshold < 0 || thresholds.testing?.coverage_threshold > 100) {
          invalidThresholds.push('testing.coverage_threshold');
        }
        
        // Check status sync thresholds
        if (thresholds.statusSync?.sync_success_rate < 0 || thresholds.statusSync?.sync_success_rate > 100) {
          invalidThresholds.push('statusSync.sync_success_rate');
        }
        
        if (invalidThresholds.length === 0) {
          return { passed: true, message: 'All threshold values are valid' };
        } else {
          return { 
            passed: false, 
            message: `Invalid thresholds: ${invalidThresholds.join(', ')}` 
          };
        }
      } catch (error) {
        return { passed: false, message: `Threshold validation failed: ${error.message}` };
      }
    });

    // Test quality gate evaluation
    await this.addTest(category, 'quality_gate_evaluation', async () => {
      try {
        const { Phase4QualitySystem } = await import('../index.js');
        const system = new Phase4QualitySystem({
          components: {
            monitoring: { enabled: false },
            testing: { enabled: false },
            statusSync: { enabled: false },
            security: { enabled: false }
          }
        });
        
        if (typeof system.runPhase4Validation === 'function') {
          return { passed: true, message: 'Quality gate evaluation function available' };
        } else {
          return { passed: false, message: 'Quality gate evaluation function not available' };
        }
      } catch (error) {
        return { passed: false, message: `Quality gate evaluation test failed: ${error.message}` };
      }
    });

    // Validate reporting configuration
    await this.addTest(category, 'reporting_config', async () => {
      try {
        const configPath = path.join(__dirname, '../config/phase4-config.json');
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configContent);
        
        const reporting = config.integration?.unifiedReporting;
        if (reporting && reporting.enabled && reporting.sections) {
          return { passed: true, message: 'Reporting configuration is valid' };
        } else {
          return { passed: false, message: 'Reporting configuration is invalid or missing' };
        }
      } catch (error) {
        return { passed: false, message: `Reporting config validation failed: ${error.message}` };
      }
    });

    this.setCategoryStatus(category);
  }

  /**
   * Add a test to a validation category
   */
  async addTest(category, name, testFunction) {
    try {
      const result = await testFunction();
      const test = {
        name,
        status: result.passed ? 'passed' : 'failed',
        message: result.message,
        timestamp: Date.now()
      };
      
      if (result.warning) {
        test.status = 'warning';
        test.warning = result.warning;
      }
      
      category.tests.push(test);
      this.validationResults.summary.total++;
      
      if (test.status === 'passed') {
        this.validationResults.summary.passed++;
      } else if (test.status === 'warning') {
        this.validationResults.summary.warnings++;
      } else {
        this.validationResults.summary.failed++;
      }
      
      console.log(`  ${test.status === 'passed' ? '✅' : test.status === 'warning' ? '⚠️' : '❌'} ${name}: ${test.message}`);
      
    } catch (error) {
      const test = {
        name,
        status: 'failed',
        message: `Test execution failed: ${error.message}`,
        timestamp: Date.now()
      };
      
      category.tests.push(test);
      this.validationResults.summary.total++;
      this.validationResults.summary.failed++;
      
      console.log(`  ❌ ${name}: ${test.message}`);
    }
  }

  /**
   * Set category status based on test results
   */
  setCategoryStatus(category) {
    const tests = category.tests;
    const failed = tests.filter(t => t.status === 'failed').length;
    const warnings = tests.filter(t => t.status === 'warning').length;
    const passed = tests.filter(t => t.status === 'passed').length;
    
    if (failed > 0) {
      category.status = 'failed';
    } else if (warnings > 0) {
      category.status = 'warning';
    } else if (passed > 0) {
      category.status = 'passed';
    } else {
      category.status = 'skipped';
    }
  }

  /**
   * Calculate final validation results
   */
  calculateResults() {
    const categories = Object.values(this.validationResults.categories);
    const failedCategories = categories.filter(c => c.status === 'failed').length;
    const warningCategories = categories.filter(c => c.status === 'warning').length;
    
    // Determine overall status
    if (failedCategories > 0) {
      this.validationResults.status = 'failed';
    } else if (warningCategories > 0) {
      this.validationResults.status = 'warning';
    } else {
      this.validationResults.status = 'passed';
    }
    
    // Add recommendations based on results
    if (this.validationResults.summary.failed > 0) {
      this.validationResults.recommendations.push(
        'Address failed validation tests before proceeding with Phase 4 implementation'
      );
    }
    
    if (this.validationResults.summary.warnings > 0) {
      this.validationResults.recommendations.push(
        'Review warning conditions to ensure optimal Phase 4 performance'
      );
    }
    
    if (this.validationResults.status === 'passed') {
      this.validationResults.recommendations.push(
        'Phase 4 validation passed - system is ready for deployment'
      );
    }
  }

  /**
   * Generate validation report
   */
  generateReport(format = 'json') {
    switch (format) {
      case 'json':
        return JSON.stringify(this.validationResults, null, 2);
      
      case 'markdown':
        return this.generateMarkdownReport();
      
      case 'summary':
        return this.generateSummaryReport();
      
      default:
        return this.validationResults;
    }
  }

  /**
   * Generate markdown validation report
   */
  generateMarkdownReport() {
    const results = this.validationResults;
    let report = `# Phase 4 Quality System Validation Report\n\n`;
    
    report += `**Status**: ${results.status.toUpperCase()}\n`;
    report += `**Timestamp**: ${new Date(results.timestamp).toISOString()}\n\n`;
    
    report += `## Summary\n\n`;
    report += `- **Total Tests**: ${results.summary.total}\n`;
    report += `- **Passed**: ${results.summary.passed}\n`;
    report += `- **Failed**: ${results.summary.failed}\n`;
    report += `- **Warnings**: ${results.summary.warnings}\n\n`;
    
    // Category results
    Object.entries(results.categories).forEach(([categoryName, category]) => {
      report += `## ${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)}\n\n`;
      report += `**Status**: ${category.status.toUpperCase()}\n\n`;
      
      category.tests.forEach(test => {
        const icon = test.status === 'passed' ? '✅' : test.status === 'warning' ? '⚠️' : '❌';
        report += `${icon} **${test.name}**: ${test.message}\n`;
      });
      
      report += '\n';
    });
    
    // Recommendations
    if (results.recommendations.length > 0) {
      report += `## Recommendations\n\n`;
      results.recommendations.forEach(rec => {
        report += `- ${rec}\n`;
      });
    }
    
    return report;
  }

  /**
   * Generate summary validation report
   */
  generateSummaryReport() {
    const results = this.validationResults;
    const passRate = results.summary.total > 0 
      ? ((results.summary.passed / results.summary.total) * 100).toFixed(1)
      : '0.0';
    
    return `Phase 4 Validation Summary:
Status: ${results.status.toUpperCase()}
Pass Rate: ${passRate}% (${results.summary.passed}/${results.summary.total})
Failed: ${results.summary.failed}
Warnings: ${results.summary.warnings}
Timestamp: ${new Date(results.timestamp).toISOString()}`;
  }
}

export default Phase4Validator;

