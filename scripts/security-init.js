#!/usr/bin/env node

/**
 * Security Framework Initialization Script
 * Sets up the security framework for first-time use
 */

import { securityFramework } from '../security/index.js';
import { taskMasterCredentialManager } from '../utils/credential-manager.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';

class SecurityInitializer {
  constructor() {
    this.config = {};
  }

  async run() {
    console.log(chalk.blue.bold('🔐 Claude Task Master Security Framework Initialization'));
    console.log(chalk.gray('This script will set up the security framework for your installation.\n'));

    try {
      await this.checkExistingSetup();
      await this.gatherConfiguration();
      await this.initializeFramework();
      await this.setupCredentials();
      await this.generateSecrets();
      await this.createSecurityFiles();
      await this.displaySummary();
    } catch (error) {
      console.error(chalk.red('❌ Initialization failed:'), error.message);
      process.exit(1);
    }
  }

  async checkExistingSetup() {
    const securityDir = path.join(process.cwd(), '.security');
    
    try {
      await fs.access(securityDir);
      const response = await inquirer.prompt([{
        type: 'confirm',
        name: 'overwrite',
        message: 'Security framework appears to be already initialized. Overwrite?',
        default: false
      }]);

      if (!response.overwrite) {
        console.log(chalk.yellow('Initialization cancelled.'));
        process.exit(0);
      }
    } catch (error) {
      // Directory doesn't exist, continue with initialization
    }
  }

  async gatherConfiguration() {
    console.log(chalk.blue('\n📋 Configuration Setup'));

    const questions = [
      {
        type: 'input',
        name: 'adminUsername',
        message: 'Admin username:',
        default: 'admin',
        validate: input => input.length >= 3 || 'Username must be at least 3 characters'
      },
      {
        type: 'input',
        name: 'adminEmail',
        message: 'Admin email:',
        validate: input => /\S+@\S+\.\S+/.test(input) || 'Please enter a valid email'
      },
      {
        type: 'password',
        name: 'adminPassword',
        message: 'Admin password:',
        mask: '*',
        validate: input => {
          if (input.length < 12) return 'Password must be at least 12 characters';
          if (!/[A-Z]/.test(input)) return 'Password must contain uppercase letters';
          if (!/[a-z]/.test(input)) return 'Password must contain lowercase letters';
          if (!/[0-9]/.test(input)) return 'Password must contain numbers';
          if (!/[^A-Za-z0-9]/.test(input)) return 'Password must contain special characters';
          return true;
        }
      },
      {
        type: 'confirm',
        name: 'enableMFA',
        message: 'Enable multi-factor authentication?',
        default: true
      },
      {
        type: 'list',
        name: 'environment',
        message: 'Environment:',
        choices: ['development', 'staging', 'production'],
        default: 'development'
      },
      {
        type: 'confirm',
        name: 'migrateEnvVars',
        message: 'Migrate existing environment variables to secure storage?',
        default: true
      }
    ];

    this.config = await inquirer.prompt(questions);
  }

  async initializeFramework() {
    console.log(chalk.blue('\n🔧 Initializing Security Framework...'));

    // Initialize the security framework
    await securityFramework.initialize();
    console.log(chalk.green('✅ Security framework initialized'));

    // Initialize credential manager
    await taskMasterCredentialManager.initialize();
    console.log(chalk.green('✅ Credential manager initialized'));
  }

  async setupCredentials() {
    console.log(chalk.blue('\n🔑 Setting up credentials...'));

    // Set admin credentials
    const passwordHash = await securityFramework.authManager.hashPassword(this.config.adminPassword);
    await securityFramework.credentialManager.setSecret('ADMIN_USERNAME', this.config.adminUsername);
    await securityFramework.credentialManager.setSecret('ADMIN_PASSWORD_HASH', passwordHash);
    await securityFramework.credentialManager.setSecret('ADMIN_EMAIL', this.config.adminEmail);
    console.log(chalk.green('✅ Admin credentials configured'));

    // Migrate environment variables if requested
    if (this.config.migrateEnvVars) {
      const migration = await taskMasterCredentialManager.migrateEnvironmentVariables();
      if (migration.migrated.length > 0) {
        console.log(chalk.green(`✅ Migrated ${migration.migrated.length} environment variables`));
      }
      if (migration.errors.length > 0) {
        console.log(chalk.yellow(`⚠️  ${migration.errors.length} migration errors`));
      }
    }
  }

  async generateSecrets() {
    console.log(chalk.blue('\n🔐 Generating security secrets...'));

    // Generate JWT secret
    const jwtSecret = crypto.randomBytes(64).toString('hex');
    await securityFramework.credentialManager.setSecret('JWT_SECRET', jwtSecret);
    console.log(chalk.green('✅ JWT secret generated'));

    // Generate webhook secrets
    const githubSecret = crypto.randomBytes(32).toString('hex');
    const linearSecret = crypto.randomBytes(32).toString('hex');
    
    await taskMasterCredentialManager.setWebhookSecret('github', githubSecret);
    await taskMasterCredentialManager.setWebhookSecret('linear', linearSecret);
    console.log(chalk.green('✅ Webhook secrets generated'));

    // Store generated secrets for display
    this.generatedSecrets = {
      jwtSecret,
      githubWebhookSecret: githubSecret,
      linearWebhookSecret: linearSecret
    };
  }

  async createSecurityFiles() {
    console.log(chalk.blue('\n📁 Creating security configuration files...'));

    // Create .security directory
    const securityDir = path.join(process.cwd(), '.security');
    await fs.mkdir(securityDir, { recursive: true });

    // Create security configuration
    const securityConfig = {
      environment: this.config.environment,
      mfaEnabled: this.config.enableMFA,
      initializedAt: new Date().toISOString(),
      version: '1.0.0'
    };

    await fs.writeFile(
      path.join(securityDir, 'config.json'),
      JSON.stringify(securityConfig, null, 2),
      { mode: 0o600 }
    );

    // Update .gitignore
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    let gitignoreContent = '';
    
    try {
      gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
    } catch (error) {
      // File doesn't exist, create new content
    }

    if (!gitignoreContent.includes('.security/')) {
      gitignoreContent += '\n# Security Framework\n.security/\n';
      await fs.writeFile(gitignorePath, gitignoreContent);
    }

    console.log(chalk.green('✅ Security files created'));
  }

  async displaySummary() {
    console.log(chalk.blue.bold('\n🎉 Security Framework Initialization Complete!'));
    
    console.log(chalk.white('\n📋 Summary:'));
    console.log(`• Admin username: ${chalk.cyan(this.config.adminUsername)}`);
    console.log(`• Admin email: ${chalk.cyan(this.config.adminEmail)}`);
    console.log(`• MFA enabled: ${this.config.enableMFA ? chalk.green('Yes') : chalk.red('No')}`);
    console.log(`• Environment: ${chalk.cyan(this.config.environment)}`);

    console.log(chalk.white('\n🔑 Generated Secrets (save these securely):'));
    console.log(`• JWT Secret: ${chalk.gray(this.generatedSecrets.jwtSecret.substring(0, 16) + '...')}`);
    console.log(`• GitHub Webhook Secret: ${chalk.gray(this.generatedSecrets.githubWebhookSecret.substring(0, 16) + '...')}`);
    console.log(`• Linear Webhook Secret: ${chalk.gray(this.generatedSecrets.linearWebhookSecret.substring(0, 16) + '...')}`);

    console.log(chalk.white('\n📝 Next Steps:'));
    console.log('1. Update your .env file with any remaining API keys');
    console.log('2. Configure your webhook endpoints with the generated secrets');
    console.log('3. Test the authentication system');
    console.log('4. Review the security documentation in docs/SECURITY.md');

    if (this.config.environment === 'production') {
      console.log(chalk.red.bold('\n⚠️  Production Environment Checklist:'));
      console.log('• Ensure HTTPS is enabled');
      console.log('• Configure proper firewall rules');
      console.log('• Set up monitoring and alerting');
      console.log('• Review and test backup procedures');
      console.log('• Conduct security validation');
    }

    console.log(chalk.white('\n🔍 Security Status:'));
    const status = await securityFramework.getSecurityStatus();
    console.log(`• Framework initialized: ${status.initialized ? chalk.green('Yes') : chalk.red('No')}`);
    console.log(`• Credentials stored: ${chalk.cyan(status.components.credentialManager.secretsCount)}`);
    console.log(`• Audit logging: ${status.config.auditEnabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);

    // Run security validation
    console.log(chalk.white('\n🛡️  Security Validation:'));
    const validation = await securityFramework.validateSecurity();
    
    if (validation.status === 'ok') {
      console.log(chalk.green('✅ No security issues found'));
    } else {
      console.log(chalk.yellow(`⚠️  ${validation.issuesFound} security issues found:`));
      validation.issues.forEach(issue => {
        const color = issue.severity === 'critical' ? chalk.red : chalk.yellow;
        console.log(`  ${color('•')} ${issue.message}`);
      });
    }

    console.log(chalk.blue.bold('\n🔐 Security framework is ready to use!'));
  }
}

// Run the initializer if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const initializer = new SecurityInitializer();
  initializer.run().catch(console.error);
}

export default SecurityInitializer;

