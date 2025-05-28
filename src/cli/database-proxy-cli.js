#!/usr/bin/env node

/**
 * Database Proxy CLI Tool
 * Command-line interface for managing the Cloudflare database proxy
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { CloudflareProxyClient } from '../database/cloudflare-proxy-client.js';
import { DatabaseMonitor, performHealthCheck, startMonitoring, stopMonitoring, generateHealthReport } from '../utils/database-monitoring.js';
import { getConfig, validateConfig } from '../../config/database-proxy.js';

const program = new Command();

program
  .name('db-proxy')
  .description('Cloudflare Database Proxy Management CLI')
  .version('1.0.0');

/**
 * Health check command
 */
program
  .command('health')
  .description('Perform a comprehensive health check')
  .option('-v, --verbose', 'Show detailed health information')
  .option('-j, --json', 'Output in JSON format')
  .action(async (options) => {
    const spinner = ora('Performing health check...').start();
    
    try {
      const healthCheck = await performHealthCheck();
      spinner.stop();
      
      if (options.json) {
        console.log(JSON.stringify(healthCheck, null, 2));
        return;
      }
      
      // Display health status
      const statusColor = healthCheck.status === 'healthy' ? 'green' : 'red';
      console.log(chalk[statusColor](`\n🏥 Health Status: ${healthCheck.status.toUpperCase()}`));
      console.log(chalk.gray(`Response Time: ${healthCheck.responseTime}ms`));
      console.log(chalk.gray(`Timestamp: ${healthCheck.timestamp}`));
      
      if (options.verbose || healthCheck.status !== 'healthy') {
        console.log('\n📋 Detailed Results:');
        
        Object.entries(healthCheck.details).forEach(([test, result]) => {
          const icon = result.success ? '✅' : '❌';
          console.log(`${icon} ${test}:`);
          
          if (result.responseTime) {
            console.log(`   Response Time: ${result.responseTime}ms`);
          }
          
          if (result.details) {
            console.log(`   Details: ${result.details}`);
          }
          
          if (result.tests) {
            result.tests.forEach(subTest => {
              const subIcon = subTest.success ? '  ✅' : '  ❌';
              console.log(`${subIcon} ${subTest.name}: ${subTest.responseTime}ms`);
            });
          }
        });
      }
      
      // Exit with appropriate code
      process.exit(healthCheck.status === 'healthy' ? 0 : 1);
      
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('❌ Health check failed:'), error.message);
      process.exit(1);
    }
  });

/**
 * Test connection command
 */
program
  .command('test')
  .description('Test database connection')
  .option('-q, --query <query>', 'Custom query to test', 'SELECT 1 as test')
  .option('-p, --params <params>', 'Query parameters (JSON array)', '[]')
  .action(async (options) => {
    const spinner = ora('Testing database connection...').start();
    
    try {
      const client = new CloudflareProxyClient();
      const params = JSON.parse(options.params);
      
      const startTime = Date.now();
      const result = await client.query(options.query, params);
      const responseTime = Date.now() - startTime;
      
      spinner.stop();
      
      if (result.success) {
        console.log(chalk.green('✅ Connection test successful!'));
        console.log(chalk.gray(`Response Time: ${responseTime}ms`));
        console.log(chalk.gray(`Rows Returned: ${result.data?.length || 0}`));
        
        if (result.data && result.data.length > 0) {
          console.log('\n📊 Sample Data:');
          console.table(result.data.slice(0, 5)); // Show first 5 rows
        }
      } else {
        console.log(chalk.red('❌ Connection test failed:'), result.error);
        process.exit(1);
      }
      
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('❌ Connection test failed:'), error.message);
      process.exit(1);
    }
  });

/**
 * Monitor command
 */
program
  .command('monitor')
  .description('Start continuous monitoring')
  .option('-i, --interval <seconds>', 'Health check interval in seconds', '30')
  .option('-d, --duration <minutes>', 'Monitoring duration in minutes (0 for infinite)', '0')
  .action(async (options) => {
    const interval = parseInt(options.interval) * 1000;
    const duration = parseInt(options.duration) * 60 * 1000;
    
    console.log(chalk.blue('🔍 Starting database monitoring...'));
    console.log(chalk.gray(`Health check interval: ${options.interval}s`));
    
    if (duration > 0) {
      console.log(chalk.gray(`Duration: ${options.duration} minutes`));
    } else {
      console.log(chalk.gray('Duration: Infinite (press Ctrl+C to stop)'));
    }
    
    // Start monitoring
    startMonitoring(interval);
    
    // Stop after duration if specified
    if (duration > 0) {
      setTimeout(() => {
        stopMonitoring();
        console.log(chalk.blue('\n⏰ Monitoring duration completed'));
        process.exit(0);
      }, duration);
    }
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log(chalk.blue('\n🛑 Stopping monitoring...'));
      stopMonitoring();
      process.exit(0);
    });
  });

/**
 * Status command
 */
program
  .command('status')
  .description('Show current proxy status and metrics')
  .option('-j, --json', 'Output in JSON format')
  .action(async (options) => {
    try {
      const client = new CloudflareProxyClient();
      const status = client.getStatus();
      
      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }
      
      console.log(chalk.blue('📊 Database Proxy Status\n'));
      
      // Connection status
      const healthIcon = status.isHealthy ? '✅' : '❌';
      const healthColor = status.isHealthy ? 'green' : 'red';
      console.log(`${healthIcon} Health: ${chalk[healthColor](status.isHealthy ? 'Healthy' : 'Unhealthy')}`);
      console.log(`🔗 Proxy URL: ${status.proxyUrl}`);
      console.log(`❌ Failure Count: ${status.failureCount}`);
      
      if (status.lastHealthCheck) {
        console.log(`🕐 Last Check: ${status.lastHealthCheck}`);
      }
      
      // Configuration
      console.log('\n⚙️  Configuration:');
      console.log(`   Timeout: ${status.config.timeout}ms`);
      console.log(`   Retries: ${status.config.retries}`);
      console.log(`   Rate Limit: ${status.config.rateLimit} req/min`);
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to get status:'), error.message);
      process.exit(1);
    }
  });

/**
 * Report command
 */
program
  .command('report')
  .description('Generate comprehensive health report')
  .option('-o, --output <file>', 'Save report to file')
  .option('-f, --format <format>', 'Report format (json|text)', 'text')
  .action(async (options) => {
    const spinner = ora('Generating health report...').start();
    
    try {
      const report = generateHealthReport();
      spinner.stop();
      
      if (options.format === 'json') {
        const output = JSON.stringify(report, null, 2);
        
        if (options.output) {
          const fs = await import('fs');
          fs.writeFileSync(options.output, output);
          console.log(chalk.green(`✅ Report saved to ${options.output}`));
        } else {
          console.log(output);
        }
        return;
      }
      
      // Text format
      console.log(chalk.blue('📋 Database Proxy Health Report\n'));
      console.log(chalk.gray(`Generated: ${report.timestamp}\n`));
      
      // Summary
      const summary = report.summary;
      const statusColor = summary.status === 'healthy' ? 'green' : 
                         summary.status === 'degraded' ? 'yellow' : 'red';
      
      console.log(chalk.bold('📊 Summary:'));
      console.log(`   Status: ${chalk[statusColor](summary.status.toUpperCase())}`);
      console.log(`   Success Rate: ${summary.successRate}%`);
      console.log(`   Avg Response Time: ${summary.averageResponseTime}ms`);
      console.log(`   Uptime: ${summary.uptime}s`);
      console.log(`   Recent Checks: ${summary.recentlyHealthy}/${summary.recentChecks} healthy`);
      
      // Recommendations
      if (report.recommendations.length > 0) {
        console.log(chalk.bold('\n💡 Recommendations:'));
        report.recommendations.forEach(rec => {
          const icon = rec.type === 'critical' ? '🚨' : 
                      rec.type === 'warning' ? '⚠️' : 'ℹ️';
          console.log(`   ${icon} ${rec.message}`);
        });
      }
      
      // Configuration
      console.log(chalk.bold('\n⚙️  Configuration:'));
      console.log(`   Proxy URL: ${report.configuration.proxyUrl}`);
      console.log(`   Monitoring: ${report.configuration.monitoringEnabled ? 'Enabled' : 'Disabled'}`);
      console.log(`   Health Check Interval: ${report.configuration.healthCheckInterval}`);
      
      if (options.output) {
        const fs = await import('fs');
        const textReport = `Database Proxy Health Report
Generated: ${report.timestamp}

Summary:
- Status: ${summary.status.toUpperCase()}
- Success Rate: ${summary.successRate}%
- Average Response Time: ${summary.averageResponseTime}ms
- Uptime: ${summary.uptime}s
- Recent Checks: ${summary.recentlyHealthy}/${summary.recentChecks} healthy

Recommendations:
${report.recommendations.map(rec => `- ${rec.message}`).join('\n')}

Configuration:
- Proxy URL: ${report.configuration.proxyUrl}
- Monitoring: ${report.configuration.monitoringEnabled ? 'Enabled' : 'Disabled'}
- Health Check Interval: ${report.configuration.healthCheckInterval}
`;
        
        fs.writeFileSync(options.output, textReport);
        console.log(chalk.green(`\n✅ Report saved to ${options.output}`));
      }
      
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('❌ Failed to generate report:'), error.message);
      process.exit(1);
    }
  });

/**
 * Config command
 */
program
  .command('config')
  .description('Show current configuration')
  .option('-v, --validate', 'Validate configuration')
  .option('-e, --env <environment>', 'Environment to check', process.env.NODE_ENV || 'development')
  .action(async (options) => {
    try {
      const config = getConfig(options.env);
      
      if (options.validate) {
        const spinner = ora('Validating configuration...').start();
        
        try {
          validateConfig(config);
          spinner.stop();
          console.log(chalk.green('✅ Configuration is valid'));
        } catch (error) {
          spinner.stop();
          console.error(chalk.red('❌ Configuration validation failed:'), error.message);
          process.exit(1);
        }
      }
      
      console.log(chalk.blue(`📋 Configuration (${options.env}):\n`));
      
      // Mask sensitive information
      const displayConfig = JSON.parse(JSON.stringify(config));
      if (displayConfig.API_TOKEN) {
        displayConfig.API_TOKEN = '***masked***';
      }
      
      console.log(JSON.stringify(displayConfig, null, 2));
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to load configuration:'), error.message);
      process.exit(1);
    }
  });

/**
 * Benchmark command
 */
program
  .command('benchmark')
  .description('Run performance benchmarks')
  .option('-c, --concurrent <number>', 'Number of concurrent requests', '10')
  .option('-r, --requests <number>', 'Total number of requests', '100')
  .option('-q, --query <query>', 'Query to benchmark', 'SELECT 1 as benchmark')
  .action(async (options) => {
    const concurrent = parseInt(options.concurrent);
    const totalRequests = parseInt(options.requests);
    
    console.log(chalk.blue('🏃 Running performance benchmark...\n'));
    console.log(chalk.gray(`Concurrent requests: ${concurrent}`));
    console.log(chalk.gray(`Total requests: ${totalRequests}`));
    console.log(chalk.gray(`Query: ${options.query}\n`));
    
    const client = new CloudflareProxyClient();
    const results = [];
    const startTime = Date.now();
    
    const spinner = ora('Executing benchmark...').start();
    
    try {
      // Execute requests in batches
      for (let i = 0; i < totalRequests; i += concurrent) {
        const batchSize = Math.min(concurrent, totalRequests - i);
        const batch = Array(batchSize).fill().map(async () => {
          const requestStart = Date.now();
          try {
            const result = await client.query(options.query);
            const requestTime = Date.now() - requestStart;
            return { success: true, time: requestTime };
          } catch (error) {
            const requestTime = Date.now() - requestStart;
            return { success: false, time: requestTime, error: error.message };
          }
        });
        
        const batchResults = await Promise.all(batch);
        results.push(...batchResults);
        
        // Update progress
        const progress = Math.round(((i + batchSize) / totalRequests) * 100);
        spinner.text = `Executing benchmark... ${progress}%`;
      }
      
      spinner.stop();
      
      // Calculate statistics
      const successfulRequests = results.filter(r => r.success);
      const failedRequests = results.filter(r => !r.success);
      const responseTimes = successfulRequests.map(r => r.time);
      
      const totalTime = Date.now() - startTime;
      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const minResponseTime = Math.min(...responseTimes);
      const maxResponseTime = Math.max(...responseTimes);
      const requestsPerSecond = (totalRequests / totalTime) * 1000;
      
      // Sort for percentiles
      responseTimes.sort((a, b) => a - b);
      const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)];
      const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)];
      const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)];
      
      console.log(chalk.green('✅ Benchmark completed!\n'));
      
      console.log(chalk.bold('📊 Results:'));
      console.log(`   Total Requests: ${totalRequests}`);
      console.log(`   Successful: ${successfulRequests.length} (${Math.round((successfulRequests.length / totalRequests) * 100)}%)`);
      console.log(`   Failed: ${failedRequests.length} (${Math.round((failedRequests.length / totalRequests) * 100)}%)`);
      console.log(`   Total Time: ${totalTime}ms`);
      console.log(`   Requests/sec: ${requestsPerSecond.toFixed(2)}`);
      
      console.log(chalk.bold('\n⏱️  Response Times:'));
      console.log(`   Average: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`   Min: ${minResponseTime}ms`);
      console.log(`   Max: ${maxResponseTime}ms`);
      console.log(`   50th percentile: ${p50}ms`);
      console.log(`   95th percentile: ${p95}ms`);
      console.log(`   99th percentile: ${p99}ms`);
      
      if (failedRequests.length > 0) {
        console.log(chalk.bold('\n❌ Errors:'));
        const errorCounts = {};
        failedRequests.forEach(req => {
          errorCounts[req.error] = (errorCounts[req.error] || 0) + 1;
        });
        
        Object.entries(errorCounts).forEach(([error, count]) => {
          console.log(`   ${error}: ${count} times`);
        });
      }
      
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('❌ Benchmark failed:'), error.message);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

