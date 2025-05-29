#!/usr/bin/env node

/**
 * Linear Health Check
 * 
 * Performs comprehensive health checks on the Linear integration system.
 */

import { LinearClient } from './linear_client.js';
import { StatusManager } from './status_manager.js';
import { ConflictResolver } from './conflict_resolver.js';
import { readJSON } from '../../../scripts/modules/utils.js';
import path from 'path';

async function main() {
  console.log('🏥 Linear Integration Health Check');
  console.log('==================================\n');

  let overallHealth = 'healthy';
  const results = [];

  // Check configuration
  console.log('1. 📋 Configuration Check');
  try {
    const configPath = path.join(process.cwd(), 'config', 'linear_config.json');
    const config = readJSON(configPath);
    
    // Check required fields
    const requiredFields = ['linear.apiKey', 'linear.teamId'];
    const missingFields = [];
    
    for (const field of requiredFields) {
      const value = field.split('.').reduce((obj, key) => obj?.[key], config);
      if (!value) {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      console.log(`   ❌ Missing required configuration: ${missingFields.join(', ')}`);
      results.push({ component: 'Configuration', status: 'error', message: `Missing: ${missingFields.join(', ')}` });
      overallHealth = 'unhealthy';
    } else {
      console.log('   ✅ Configuration is valid');
      results.push({ component: 'Configuration', status: 'healthy', message: 'All required fields present' });
    }
  } catch (error) {
    console.log(`   ❌ Configuration error: ${error.message}`);
    results.push({ component: 'Configuration', status: 'error', message: error.message });
    overallHealth = 'unhealthy';
  }

  // Check environment variables
  console.log('\n2. 🔐 Environment Variables Check');
  const envVars = ['LINEAR_API_KEY', 'LINEAR_TEAM_ID'];
  const missingEnvVars = envVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    console.log(`   ⚠️  Missing environment variables: ${missingEnvVars.join(', ')}`);
    results.push({ component: 'Environment', status: 'warning', message: `Missing: ${missingEnvVars.join(', ')}` });
    if (overallHealth === 'healthy') overallHealth = 'degraded';
  } else {
    console.log('   ✅ All required environment variables are set');
    results.push({ component: 'Environment', status: 'healthy', message: 'All variables present' });
  }

  // Check Linear API connectivity
  console.log('\n3. 🌐 Linear API Connectivity');
  try {
    const linearClient = new LinearClient({
      apiKey: process.env.LINEAR_API_KEY,
      teamId: process.env.LINEAR_TEAM_ID
    });
    
    const health = await linearClient.healthCheck();
    
    if (health.status === 'healthy') {
      console.log(`   ✅ Connected to Linear API as: ${health.user?.name || 'Unknown'}`);
      results.push({ component: 'Linear API', status: 'healthy', message: `Connected as ${health.user?.name}` });
    } else {
      console.log(`   ❌ Linear API connection failed: ${health.error}`);
      results.push({ component: 'Linear API', status: 'error', message: health.error });
      overallHealth = 'unhealthy';
    }
  } catch (error) {
    console.log(`   ❌ Linear API error: ${error.message}`);
    results.push({ component: 'Linear API', status: 'error', message: error.message });
    overallHealth = 'unhealthy';
  }

  // Check Status Manager
  console.log('\n4. ⚙️  Status Manager Check');
  try {
    const config = readJSON(path.join(process.cwd(), 'config', 'linear_config.json'));
    const statusManager = new StatusManager(config);
    
    const health = await statusManager.healthCheck();
    
    if (health.status === 'healthy') {
      console.log('   ✅ Status Manager is operational');
      console.log(`   📊 Integration enabled: ${health.integration.enabled}`);
      console.log(`   🔄 Sync direction: ${health.integration.syncDirection}`);
      results.push({ component: 'Status Manager', status: 'healthy', message: 'Operational' });
    } else {
      console.log(`   ❌ Status Manager error: ${health.error}`);
      results.push({ component: 'Status Manager', status: 'error', message: health.error });
      overallHealth = 'unhealthy';
    }
  } catch (error) {
    console.log(`   ❌ Status Manager initialization failed: ${error.message}`);
    results.push({ component: 'Status Manager', status: 'error', message: error.message });
    overallHealth = 'unhealthy';
  }

  // Check Conflict Resolver
  console.log('\n5. 🔧 Conflict Resolver Check');
  try {
    const conflictResolver = new ConflictResolver();
    const stats = conflictResolver.getStatistics();
    
    console.log('   ✅ Conflict Resolver is operational');
    console.log(`   📈 Total conflicts resolved: ${stats.total}`);
    console.log(`   🚨 Escalation rate: ${stats.escalationRate.toFixed(1)}%`);
    results.push({ component: 'Conflict Resolver', status: 'healthy', message: 'Operational' });
  } catch (error) {
    console.log(`   ❌ Conflict Resolver error: ${error.message}`);
    results.push({ component: 'Conflict Resolver', status: 'error', message: error.message });
    overallHealth = 'unhealthy';
  }

  // Check Task Master integration
  console.log('\n6. 📝 Task Master Integration Check');
  try {
    const tasksPath = path.join(process.cwd(), 'tasks.json');
    const tasksData = readJSON(tasksPath);
    
    if (tasksData && tasksData.tasks) {
      console.log(`   ✅ Task Master integration available (${tasksData.tasks.length} tasks)`);
      results.push({ component: 'Task Master', status: 'healthy', message: `${tasksData.tasks.length} tasks available` });
    } else {
      console.log('   ⚠️  Task Master tasks.json not found or invalid');
      results.push({ component: 'Task Master', status: 'warning', message: 'tasks.json not found' });
      if (overallHealth === 'healthy') overallHealth = 'degraded';
    }
  } catch (error) {
    console.log(`   ⚠️  Task Master integration issue: ${error.message}`);
    results.push({ component: 'Task Master', status: 'warning', message: error.message });
    if (overallHealth === 'healthy') overallHealth = 'degraded';
  }

  // Summary
  console.log('\n📊 Health Check Summary');
  console.log('========================');
  
  const healthyCount = results.filter(r => r.status === 'healthy').length;
  const warningCount = results.filter(r => r.status === 'warning').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  
  console.log(`Overall Status: ${getStatusEmoji(overallHealth)} ${overallHealth.toUpperCase()}`);
  console.log(`Components: ${healthyCount} healthy, ${warningCount} warnings, ${errorCount} errors\n`);
  
  // Detailed results
  results.forEach(result => {
    const emoji = getStatusEmoji(result.status);
    console.log(`${emoji} ${result.component}: ${result.message}`);
  });

  // Recommendations
  if (overallHealth !== 'healthy') {
    console.log('\n💡 Recommendations:');
    
    if (errorCount > 0) {
      console.log('   • Fix configuration and connectivity issues before using Linear integration');
    }
    
    if (warningCount > 0) {
      console.log('   • Address warnings to ensure optimal functionality');
    }
    
    if (missingEnvVars.length > 0) {
      console.log('   • Set missing environment variables in your .env file');
    }
  } else {
    console.log('\n🎉 All systems operational! Linear integration is ready to use.');
  }

  // Exit with appropriate code
  process.exit(overallHealth === 'unhealthy' ? 1 : 0);
}

function getStatusEmoji(status) {
  switch (status) {
    case 'healthy': return '✅';
    case 'warning': return '⚠️';
    case 'error': return '❌';
    default: return '❓';
  }
}

// Run the health check
main().catch(error => {
  console.error('❌ Health check failed:', error);
  process.exit(1);
});

