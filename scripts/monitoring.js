#!/usr/bin/env node

/**
 * Monitoring System CLI
 * Command-line interface for the comprehensive monitoring system
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import MonitoringSystem from '../monitoring/index.js';
import { basicSetup } from '../monitoring/examples/basic-usage.js';

const program = new Command();

program
  .name('monitoring')
  .description('Task Master Monitoring System CLI')
  .version('1.0.0');

// Start monitoring command
program
  .command('start')
  .description('Start the monitoring system')
  .option('-p, --port <port>', 'Dashboard port', '3001')
  .option('-h, --host <host>', 'Dashboard host', 'localhost')
  .option('--no-dashboard', 'Disable dashboard server')
  .option('--config <path>', 'Custom configuration file')
  .action(async (options) => {
    const spinner = ora('Starting monitoring system...').start();
    
    try {
      const monitoring = new MonitoringSystem();
      
      await monitoring.start({
        enableDashboard: options.dashboard,
        dashboardPort: parseInt(options.port),
        dashboardHost: options.host
      });
      
      spinner.succeed('Monitoring system started successfully!');
      
      if (options.dashboard) {
        console.log(chalk.cyan(`📊 Dashboard: http://${options.host}:${options.port}`));
      }
      
      console.log(chalk.green('✅ System is now monitoring performance and health'));
      console.log(chalk.yellow('Press Ctrl+C to stop monitoring'));
      
      // Keep the process running
      process.on('SIGINT', async () => {
        console.log(chalk.yellow('\n🛑 Stopping monitoring system...'));
        await monitoring.stop();
        process.exit(0);
      });
      
    } catch (error) {
      spinner.fail('Failed to start monitoring system');
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Get monitoring system status')
  .action(async () => {
    const spinner = ora('Checking system status...').start();
    
    try {
      const monitoring = new MonitoringSystem();
      const status = await monitoring.getStatus();
      
      spinner.stop();
      
      console.log(chalk.bold('\n📊 Monitoring System Status\n'));
      
      if (status.status === 'running') {
        console.log(chalk.green('✅ Status:'), 'Running');
        console.log(chalk.cyan('⏱️  Uptime:'), formatDuration(status.uptime));
        
        if (status.dashboard) {
          console.log(chalk.cyan('📊 Dashboard:'), status.dashboard.url);
          console.log(chalk.cyan('👥 Connected Clients:'), status.dashboard.connected_clients);
        }
        
        console.log(chalk.cyan('🚨 Active Alerts:'), status.alerts.active_alerts);
        console.log(chalk.cyan('📈 Total Metrics:'), status.storage.total_entries);
        
        // Show latest metrics
        if (status.metrics) {
          console.log(chalk.bold('\n📈 Latest Metrics:'));
          
          if (status.metrics.performance) {
            console.log(chalk.yellow('  Performance:'));
            console.log(`    Response Time: ${status.metrics.performance.response_time?.toFixed(2) || 'N/A'}ms`);
            console.log(`    Error Rate: ${status.metrics.performance.error_rate?.toFixed(2) || 'N/A'}%`);
          }
          
          if (status.metrics.system) {
            console.log(chalk.yellow('  System:'));
            console.log(`    CPU Usage: ${status.metrics.system.cpu_usage?.toFixed(2) || 'N/A'}%`);
            console.log(`    Memory Usage: ${status.metrics.system.memory_usage?.toFixed(2) || 'N/A'}%`);
          }
        }
        
      } else {
        console.log(chalk.red('❌ Status:'), status.status);
        if (status.error) {
          console.log(chalk.red('Error:'), status.error);
        }
      }
      
    } catch (error) {
      spinner.fail('Failed to get status');
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Report command
program
  .command('report')
  .description('Generate monitoring report')
  .option('-t, --type <type>', 'Report type (performance|workflow|system|comprehensive)', 'comprehensive')
  .option('-r, --range <range>', 'Time range (5m|15m|1h|6h|24h|7d)', '24h')
  .option('-o, --output <file>', 'Output file (JSON format)')
  .option('--raw', 'Include raw data in report')
  .action(async (options) => {
    const spinner = ora(`Generating ${options.type} report...`).start();
    
    try {
      const monitoring = new MonitoringSystem();
      
      const report = await monitoring.generateReport(
        options.type,
        options.range,
        { includeRawData: options.raw }
      );
      
      spinner.succeed('Report generated successfully!');
      
      if (options.output) {
        const fs = await import('fs/promises');
        await fs.writeFile(options.output, JSON.stringify(report, null, 2));
        console.log(chalk.green(`📄 Report saved to: ${options.output}`));
      } else {
        console.log(chalk.bold(`\n📊 ${options.type.toUpperCase()} REPORT\n`));
        console.log(chalk.cyan('Time Range:'), options.range);
        console.log(chalk.cyan('Generated:'), new Date().toISOString());
        
        if (report.overall_health) {
          console.log(chalk.cyan('Health Score:'), `${report.overall_health.score}%`);
          console.log(chalk.cyan('Status:'), report.overall_health.status);
        }
        
        if (report.executive_summary) {
          console.log(chalk.bold('\n📋 Executive Summary:'));
          console.log(`  ${report.executive_summary.status}`);
          console.log(`  Critical Issues: ${report.executive_summary.critical_issues}`);
          console.log(`  Recommendations: ${report.executive_summary.recommendations}`);
        }
        
        if (report.recommendations && report.recommendations.length > 0) {
          console.log(chalk.bold('\n💡 Recommendations:'));
          report.recommendations.forEach((rec, index) => {
            const priority = rec.priority === 'high' ? chalk.red(rec.priority) :
                           rec.priority === 'medium' ? chalk.yellow(rec.priority) :
                           chalk.green(rec.priority);
            console.log(`  ${index + 1}. [${priority}] ${rec.title}`);
            console.log(`     ${rec.description}`);
          });
        }
      }
      
    } catch (error) {
      spinner.fail('Failed to generate report');
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Demo command
program
  .command('demo')
  .description('Run monitoring system demo with sample data')
  .option('-p, --port <port>', 'Dashboard port', '3001')
  .action(async (options) => {
    console.log(chalk.bold('🎭 Starting Monitoring System Demo\n'));
    console.log(chalk.yellow('This will start the monitoring system with simulated data'));
    console.log(chalk.yellow('Perfect for testing and demonstration purposes\n'));
    
    try {
      await basicSetup();
    } catch (error) {
      console.error(chalk.red('Demo failed:'), error.message);
      process.exit(1);
    }
  });

// Health check command
program
  .command('health')
  .description('Perform health check on monitoring system')
  .action(async () => {
    const spinner = ora('Performing health check...').start();
    
    try {
      const monitoring = new MonitoringSystem();
      const health = await monitoring.healthCheck();
      
      spinner.stop();
      
      console.log(chalk.bold('\n🏥 Health Check Results\n'));
      
      const statusColor = health.healthy ? chalk.green : chalk.red;
      console.log(statusColor('Overall Health:'), health.healthy ? '✅ Healthy' : '❌ Unhealthy');
      console.log(chalk.cyan('Status:'), health.status);
      
      if (health.uptime) {
        console.log(chalk.cyan('Uptime:'), formatDuration(health.uptime));
      }
      
      if (health.checks) {
        console.log(chalk.bold('\n🔍 Component Checks:'));
        Object.entries(health.checks).forEach(([component, status]) => {
          const icon = status ? '✅' : '❌';
          const color = status ? chalk.green : chalk.red;
          console.log(`  ${icon} ${component}: ${color(status ? 'OK' : 'FAILED')}`);
        });
      }
      
      if (health.error) {
        console.log(chalk.red('\nError:'), health.error);
      }
      
    } catch (error) {
      spinner.fail('Health check failed');
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Utility function to format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// Error handling
program.configureOutput({
  writeErr: (str) => process.stderr.write(chalk.red(str))
});

program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  if (err.code === 'commander.version') {
    process.exit(0);
  }
  process.exit(1);
});

// Parse command line arguments
program.parse();

export default program;

