/**
 * Basic Linear Integration Usage Examples
 * 
 * This file demonstrates how to use the Linear integration components
 * in various scenarios within the AI CI/CD system.
 */

import LinearIntegration from '../index.js';
import config from '../../../../config/linear_config.json' assert { type: 'json' };

// Example 1: Basic Integration Setup
async function basicSetup() {
  console.log('🚀 Setting up Linear Integration...');
  
  const integration = new LinearIntegration(config);
  
  try {
    // Initialize the integration
    await integration.initialize();
    
    // Start services (including webhook server)
    await integration.start();
    
    console.log('✅ Linear integration is ready!');
    
    // Get health status
    const health = await integration.getHealthStatus();
    console.log('📊 Health Status:', health);
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  }
}

// Example 2: Handle CI/CD Workflow Events
async function handleWorkflowEvents() {
  console.log('🔄 Handling CI/CD workflow events...');
  
  const integration = new LinearIntegration(config);
  await integration.initialize();
  
  // Single event handling
  const singleEvent = {
    type: 'pr_created',
    issueId: 'your-issue-id',
    metadata: {
      prUrl: 'https://github.com/org/repo/pull/123',
      commitSha: 'abc123def456',
      author: 'developer@example.com'
    }
  };
  
  try {
    const result = await integration.handleWorkflowEvent(singleEvent);
    console.log('✅ Event processed:', result);
  } catch (error) {
    console.error('❌ Event processing failed:', error.message);
  }
  
  // Batch event handling
  const batchEvents = [
    {
      type: 'development_started',
      issueId: 'issue-1',
      metadata: { assignee: 'dev1@example.com' }
    },
    {
      type: 'pr_created',
      issueId: 'issue-2',
      metadata: { prUrl: 'https://github.com/org/repo/pull/124' }
    },
    {
      type: 'deployment_success',
      issueId: 'issue-3',
      metadata: { environment: 'production', deploymentUrl: 'https://app.example.com' }
    }
  ];
  
  try {
    const batchResult = await integration.handleBatchWorkflowEvents(batchEvents);
    console.log('✅ Batch events processed:', batchResult.summary);
  } catch (error) {
    console.error('❌ Batch processing failed:', error.message);
  }
}

// Example 3: Progress Tracking and Reporting
async function progressTracking() {
  console.log('📈 Tracking project progress...');
  
  const integration = new LinearIntegration(config);
  await integration.initialize();
  
  try {
    // Get project progress report
    const projectReport = await integration.getProjectProgress('your-project-id', {
      type: 'weekly',
      timeRange: '30d'
    });
    
    console.log('📊 Project Progress:');
    console.log(`- Overall: ${projectReport.progress.overall.progressPercentage.toFixed(1)}%`);
    console.log(`- Completed: ${projectReport.progress.overall.completedIssues}`);
    console.log(`- Total: ${projectReport.progress.overall.totalIssues}`);
    console.log(`- Blockers: ${projectReport.progress.overall.blockers.length}`);
    
    // Get team performance report
    const teamReport = await integration.getTeamPerformance('your-team-id', {
      timeRange: '7d'
    });
    
    console.log('👥 Team Performance:');
    console.log(`- Velocity: ${teamReport.productivity.velocity.current} issues/week`);
    console.log(`- Cycle Time: ${teamReport.productivity.cycleTime.average} days`);
    
  } catch (error) {
    console.error('❌ Progress tracking failed:', error.message);
  }
}

// Example 4: Direct Component Usage
async function directComponentUsage() {
  console.log('🔧 Using components directly...');
  
  const { LinearClient, StatusManager, ProgressTracker } = await import('../index.js');
  
  // Direct Linear client usage
  const client = new LinearClient(config.linear);
  
  try {
    // Get issue details
    const issue = await client.getIssue('your-issue-id');
    console.log('📋 Issue:', issue.identifier, '-', issue.title);
    
    // Update issue status
    const states = await client.getTeamStates();
    const inProgressState = states.find(state => state.type === 'in_progress');
    
    if (inProgressState) {
      await client.updateIssueStatus(issue.id, inProgressState.id);
      console.log('✅ Issue status updated to In Progress');
    }
    
    // Add comment
    await client.addComment(issue.id, '🤖 Automated update from AI CI/CD system');
    console.log('💬 Comment added to issue');
    
  } catch (error) {
    console.error('❌ Direct component usage failed:', error.message);
  }
  
  // Status manager usage
  const statusManager = new StatusManager(config);
  
  try {
    const statusResult = await statusManager.updateStatusFromEvent(
      'your-issue-id',
      'deployment_success',
      {
        environment: 'production',
        deploymentUrl: 'https://app.example.com',
        version: '1.2.3'
      }
    );
    
    console.log('🔄 Status update result:', statusResult.success ? 'Success' : 'Failed');
    
  } catch (error) {
    console.error('❌ Status manager failed:', error.message);
  }
  
  // Progress tracker usage
  const progressTracker = new ProgressTracker(config);
  
  try {
    const progress = await progressTracker.calculateProgress({
      project: { id: 'your-project-id' }
    });
    
    console.log('📊 Progress calculation:');
    console.log(`- Progress: ${progress.progressPercentage.toFixed(1)}%`);
    console.log(`- Velocity: ${progress.velocity?.current || 'N/A'} issues/week`);
    console.log(`- Health: ${progress.health?.status || 'Unknown'}`);
    
  } catch (error) {
    console.error('❌ Progress tracker failed:', error.message);
  }
}

// Example 5: Event Handling and Webhooks
async function eventHandling() {
  console.log('🎯 Setting up event handling...');
  
  const integration = new LinearIntegration(config);
  
  // Register event handlers
  integration.on('workflow_event_processed', (data) => {
    console.log('✅ Workflow event processed:', data.event.type);
  });
  
  integration.on('workflow_event_error', (data) => {
    console.error('❌ Workflow event error:', data.error);
  });
  
  integration.on('linear_issue_updated', (data) => {
    console.log('🔄 Linear issue updated:', data.issue.identifier);
  });
  
  await integration.initialize();
  await integration.start();
  
  console.log('🎧 Event handlers registered and listening...');
  
  // Simulate some events
  setTimeout(async () => {
    await integration.handleWorkflowEvent({
      type: 'pr_created',
      issueId: 'test-issue',
      metadata: { prUrl: 'https://github.com/test/repo/pull/1' }
    });
  }, 1000);
}

// Example 6: Error Handling and Recovery
async function errorHandlingExample() {
  console.log('🛡️ Demonstrating error handling...');
  
  const integration = new LinearIntegration({
    ...config,
    linear: {
      ...config.linear,
      apiKey: 'invalid-key' // Intentionally invalid
    }
  });
  
  try {
    await integration.initialize();
  } catch (error) {
    console.log('✅ Caught initialization error:', error.message);
    
    // Recovery: use valid configuration
    const validIntegration = new LinearIntegration(config);
    await validIntegration.initialize();
    console.log('✅ Recovered with valid configuration');
  }
  
  // Demonstrate graceful degradation
  const validIntegration = new LinearIntegration(config);
  await validIntegration.initialize();
  
  try {
    // This will fail if issue doesn't exist
    await validIntegration.handleWorkflowEvent({
      type: 'pr_created',
      issueId: 'non-existent-issue',
      metadata: {}
    });
  } catch (error) {
    console.log('✅ Gracefully handled workflow event error:', error.message);
  }
}

// Example 7: Configuration and Customization
async function configurationExample() {
  console.log('⚙️ Demonstrating configuration options...');
  
  // Custom configuration
  const customConfig = {
    ...config,
    statusMappings: {
      ...config.statusMappings,
      'custom_event': 'custom_state'
    },
    tracking: {
      ...config.tracking,
      stateWeights: {
        ...config.tracking.stateWeights,
        'custom_state': 0.5
      }
    },
    webhook: {
      ...config.webhook,
      port: 3002, // Different port
      enabled: false // Disable webhooks for this example
    }
  };
  
  const integration = new LinearIntegration(customConfig);
  await integration.initialize();
  
  console.log('✅ Custom configuration applied');
  
  // Test custom status mapping
  try {
    await integration.handleWorkflowEvent({
      type: 'custom_event',
      issueId: 'test-issue',
      metadata: { custom: 'data' }
    });
    console.log('✅ Custom event handled');
  } catch (error) {
    console.log('ℹ️ Custom event handling:', error.message);
  }
}

// Main execution function
async function runExamples() {
  console.log('🎯 Linear Integration Examples\n');
  
  const examples = [
    { name: 'Basic Setup', fn: basicSetup },
    { name: 'Workflow Events', fn: handleWorkflowEvents },
    { name: 'Progress Tracking', fn: progressTracking },
    { name: 'Direct Component Usage', fn: directComponentUsage },
    { name: 'Event Handling', fn: eventHandling },
    { name: 'Error Handling', fn: errorHandlingExample },
    { name: 'Configuration', fn: configurationExample }
  ];
  
  for (const example of examples) {
    console.log(`\n📝 Running ${example.name} Example:`);
    console.log('─'.repeat(50));
    
    try {
      await example.fn();
      console.log(`✅ ${example.name} completed successfully`);
    } catch (error) {
      console.error(`❌ ${example.name} failed:`, error.message);
    }
    
    console.log(''); // Add spacing
  }
  
  console.log('🎉 All examples completed!');
}

// Export for use in other files
export {
  basicSetup,
  handleWorkflowEvents,
  progressTracking,
  directComponentUsage,
  eventHandling,
  errorHandlingExample,
  configurationExample,
  runExamples
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}

