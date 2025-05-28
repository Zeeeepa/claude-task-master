/**
 * Basic Usage Examples
 * Demonstrates how to use the monitoring system
 */

import MonitoringSystem from '../index.js';
import { Timer, Counter, measurePerformance } from '../../utils/metrics.js';

// Example 1: Basic monitoring system setup
async function basicSetup() {
  console.log('🚀 Starting basic monitoring example...');
  
  const monitoring = new MonitoringSystem();
  
  try {
    // Start the monitoring system with dashboard
    await monitoring.start({
      enableDashboard: true,
      dashboardPort: 3001
    });
    
    // Track some custom events
    await monitoring.trackEvent('application_started', {
      version: '1.0.0',
      environment: 'development'
    });
    
    // Simulate some activity
    await simulateActivity(monitoring);
    
    // Generate a report
    const report = await monitoring.generateReport('comprehensive', '1h');
    console.log('📊 Generated report:', JSON.stringify(report, null, 2));
    
    // Keep running for demonstration
    console.log('📊 Dashboard available at: http://localhost:3001');
    console.log('Press Ctrl+C to stop...');
    
  } catch (error) {
    console.error('❌ Error:', error);
    await monitoring.stop();
  }
}

// Example 2: Using performance measurement decorator
class ExampleService {
  @measurePerformance
  async processData(data) {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
    
    if (Math.random() < 0.1) {
      throw new Error('Random processing error');
    }
    
    return { processed: data.length, timestamp: Date.now() };
  }
  
  @measurePerformance
  async fetchExternalData() {
    // Simulate external API call
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000));
    return { data: 'external_data', size: Math.floor(Math.random() * 1000) };
  }
}

// Example 3: Manual metrics tracking
async function manualMetricsExample(monitoring) {
  console.log('📈 Running manual metrics example...');
  
  // Using Timer
  const timer = new Timer('database_query');
  timer.start();
  
  // Simulate database query
  await new Promise(resolve => setTimeout(resolve, 150));
  
  timer.stop();
  await timer.track();
  
  console.log(`⏱️ Database query took: ${timer.getDuration().toFixed(2)}ms`);
  
  // Using Counter
  const requestCounter = new Counter('api_requests');
  
  for (let i = 0; i < 10; i++) {
    requestCounter.increment();
    await monitoring.trackEvent('api_request', {
      endpoint: '/api/tasks',
      method: 'GET',
      status: Math.random() > 0.1 ? 200 : 500
    });
  }
  
  await requestCounter.track();
  console.log(`📊 Total API requests: ${requestCounter.getValue()}`);
}

// Example 4: Task lifecycle monitoring
async function taskLifecycleExample(monitoring) {
  console.log('📋 Running task lifecycle example...');
  
  const tasks = [
    { id: 1, title: 'Implement feature A', complexity: 'medium' },
    { id: 2, title: 'Fix bug B', complexity: 'low' },
    { id: 3, title: 'Refactor component C', complexity: 'high' }
  ];
  
  for (const task of tasks) {
    // Task created
    await monitoring.trackEvent('task_created', {
      task_id: task.id,
      title: task.title,
      complexity: task.complexity,
      created_at: Date.now()
    });
    
    // Simulate task processing
    const processingTime = task.complexity === 'high' ? 3000 : 
                          task.complexity === 'medium' ? 2000 : 1000;
    
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    // Task completed
    const success = Math.random() > 0.2; // 80% success rate
    
    await monitoring.trackEvent(success ? 'task_completed' : 'task_failed', {
      task_id: task.id,
      title: task.title,
      complexity: task.complexity,
      processing_time: processingTime,
      completed_at: Date.now()
    });
    
    console.log(`${success ? '✅' : '❌'} Task ${task.id}: ${task.title} - ${success ? 'completed' : 'failed'}`);
  }
}

// Example 5: Error tracking and alerting
async function errorTrackingExample(monitoring) {
  console.log('🚨 Running error tracking example...');
  
  const errorTypes = ['validation_error', 'network_error', 'database_error', 'auth_error'];
  
  for (let i = 0; i < 20; i++) {
    const errorType = errorTypes[Math.floor(Math.random() * errorTypes.length)];
    const severity = Math.random() > 0.7 ? 'high' : Math.random() > 0.4 ? 'medium' : 'low';
    
    await monitoring.trackEvent('error_occurred', {
      error_type: errorType,
      severity,
      message: `Sample ${errorType} occurred`,
      stack_trace: `Error at line ${Math.floor(Math.random() * 100)}`,
      user_id: `user_${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now()
    });
    
    // Simulate some delay between errors
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
  }
  
  console.log('🚨 Generated sample errors for testing alerting system');
}

// Simulate various system activities
async function simulateActivity(monitoring) {
  console.log('🎭 Simulating system activity...');
  
  const service = new ExampleService();
  
  // Set global monitoring for decorators
  global.monitoringSystem = monitoring;
  
  // Run examples concurrently
  await Promise.all([
    manualMetricsExample(monitoring),
    taskLifecycleExample(monitoring),
    errorTrackingExample(monitoring)
  ]);
  
  // Simulate ongoing service activity
  const activityInterval = setInterval(async () => {
    try {
      // Random service calls
      if (Math.random() > 0.5) {
        await service.processData(['item1', 'item2', 'item3']);
      }
      
      if (Math.random() > 0.7) {
        await service.fetchExternalData();
      }
      
      // Random events
      await monitoring.trackEvent('user_action', {
        action: ['login', 'logout', 'create_task', 'update_task'][Math.floor(Math.random() * 4)],
        user_id: `user_${Math.floor(Math.random() * 100)}`,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.log('Expected error during simulation:', error.message);
    }
  }, 2000);
  
  // Clean up interval after 30 seconds
  setTimeout(() => {
    clearInterval(activityInterval);
    console.log('🎭 Activity simulation completed');
  }, 30000);
}

// Example 6: Custom dashboard integration
async function customDashboardExample(monitoring) {
  console.log('📊 Custom dashboard integration example...');
  
  // Get real-time metrics
  const performanceMetrics = await monitoring.getMetrics('performance', '5m');
  console.log('Performance metrics:', performanceMetrics.slice(-3));
  
  // Get system status
  const status = await monitoring.getStatus();
  console.log('System status:', status);
  
  // Get active alerts
  const alerts = monitoring.getActiveAlerts();
  console.log('Active alerts:', alerts.length);
  
  // Generate custom report
  const customReport = await monitoring.generateReport('performance', '1h', {
    includeRawData: false
  });
  console.log('Custom performance report:', customReport.summary);
}

// Run the examples
if (import.meta.url === `file://${process.argv[1]}`) {
  basicSetup().catch(console.error);
}

export {
  basicSetup,
  manualMetricsExample,
  taskLifecycleExample,
  errorTrackingExample,
  customDashboardExample
};

