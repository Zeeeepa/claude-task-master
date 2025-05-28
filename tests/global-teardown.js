/**
 * Jest Global Teardown
 * 
 * Global teardown configuration for the comprehensive testing framework.
 * This file runs once after all test suites have completed execution.
 */

import fs from 'fs-extra';
import path from 'path';

export default async function globalTeardown() {
  console.log('🧹 Starting global test cleanup...');

  try {
    // Read test configuration
    const testConfig = await fs.readJSON('tests/temp/test-config.json').catch(() => ({}));
    
    // Calculate total test duration
    const startTime = testConfig.startTime ? new Date(testConfig.startTime) : new Date();
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    // Stop test services if they were started
    if (process.env.START_TEST_SERVICES === 'true') {
      console.log('🛑 Stopping test services...');
      // Service shutdown logic would go here
    }

    // Clean up test database if configured
    if (process.env.SETUP_TEST_DB === 'true') {
      console.log('🗑️ Cleaning up test database...');
      // Database cleanup logic would go here
    }

    // Generate final test summary
    const summary = {
      endTime: endTime.toISOString(),
      duration: duration,
      durationFormatted: formatDuration(duration),
      environment: process.env.NODE_ENV,
      framework: 'comprehensive'
    };

    await fs.writeJSON('tests/reports/test-summary.json', summary, { spaces: 2 });

    // Clean up temporary files (but keep reports and logs)
    await fs.remove('tests/temp').catch(() => {});

    console.log(`✅ Global test cleanup completed (Duration: ${summary.durationFormatted})`);
  } catch (error) {
    console.error('❌ Error during global teardown:', error.message);
  }
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

