#!/usr/bin/env node

/**
 * Linear Sync Example
 * 
 * Demonstrates how to use the Linear integration to sync status between
 * Task Master and Linear issues.
 */

import { StatusManager } from './status_manager.js';
import { readJSON } from '../../../scripts/modules/utils.js';
import path from 'path';

async function main() {
  try {
    console.log('🔄 Linear Sync Example');
    console.log('======================\n');

    // Load configuration
    const configPath = path.join(process.cwd(), 'config', 'linear_config.json');
    let config;
    
    try {
      config = readJSON(configPath);
      console.log('✅ Loaded Linear configuration');
    } catch (error) {
      console.error('❌ Failed to load Linear configuration:', error.message);
      console.log('💡 Make sure config/linear_config.json exists and is valid');
      process.exit(1);
    }

    // Initialize Status Manager
    const statusManager = new StatusManager(config);
    console.log('✅ Initialized Status Manager');

    // Health check
    console.log('\n🏥 Performing health check...');
    const health = await statusManager.healthCheck();
    
    if (health.status === 'healthy') {
      console.log('✅ Linear integration is healthy');
      console.log(`   User: ${health.linear.user?.name || 'Unknown'}`);
    } else {
      console.log('❌ Linear integration is unhealthy:', health.error);
      process.exit(1);
    }

    // Example: Sync a task status change
    console.log('\n📝 Example: Syncing task status changes');
    
    // This would typically be called when a task status changes in Task Master
    // For demo purposes, we'll simulate it
    const exampleTaskId = '1';
    const newStatus = 'in-progress';
    
    console.log(`   Simulating task ${exampleTaskId} status change to: ${newStatus}`);
    
    try {
      await statusManager.syncFromTaskMaster(exampleTaskId, newStatus, {
        source: 'example_script',
        timestamp: new Date().toISOString()
      });
      console.log('✅ Status sync completed successfully');
    } catch (error) {
      console.log('⚠️  Status sync failed (this is expected if no Linear issue exists):', error.message);
    }

    // Show statistics
    console.log('\n📊 Status Manager Statistics:');
    const stats = statusManager.getStatistics();
    console.log(`   Total updates: ${stats.totalUpdates}`);
    console.log(`   Successful updates: ${stats.successfulUpdates}`);
    console.log(`   Conflicts: ${stats.conflicts}`);
    console.log(`   Success rate: ${stats.successRate.toFixed(1)}%`);

    // Show recent events
    console.log('\n📋 Recent Events:');
    const recentEvents = statusManager.getRecentEvents(5);
    if (recentEvents.length === 0) {
      console.log('   No recent events');
    } else {
      recentEvents.forEach((event, index) => {
        console.log(`   ${index + 1}. ${event.type} - ${event.timestamp}`);
      });
    }

    console.log('\n✨ Example completed successfully!');
    console.log('\n💡 To use Linear integration in your workflow:');
    console.log('   1. Set up LINEAR_API_KEY and LINEAR_TEAM_ID environment variables');
    console.log('   2. Configure webhook endpoints for real-time sync');
    console.log('   3. Use StatusManager in your CI/CD pipeline');
    console.log('   4. Monitor conflicts and resolve them as needed');

  } catch (error) {
    console.error('❌ Example failed:', error);
    process.exit(1);
  }
}

// Run the example
main().catch(console.error);

