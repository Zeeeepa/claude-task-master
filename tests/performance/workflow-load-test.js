/**
 * Workflow Load Testing with K6
 * 
 * Performance tests for high-volume workflow processing
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const workflowCreationRate = new Rate('workflow_creation_success_rate');
const workflowCreationDuration = new Trend('workflow_creation_duration');
const apiErrorRate = new Rate('api_error_rate');
const concurrentWorkflows = new Counter('concurrent_workflows');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 users
    { duration: '5m', target: 10 },   // Stay at 10 users
    { duration: '2m', target: 20 },   // Ramp up to 20 users
    { duration: '5m', target: 20 },   // Stay at 20 users
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '5m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.05'],    // Error rate must be below 5%
    workflow_creation_success_rate: ['rate>0.95'], // 95% success rate for workflow creation
    workflow_creation_duration: ['p(95)<5000'],    // 95% of workflow creations under 5s
  },
};

// Test data generators
function generateWorkflowData() {
  const workflowTypes = ['authentication', 'api-integration', 'ui-component', 'database-migration'];
  const priorities = ['low', 'medium', 'high', 'critical'];
  const repositories = [
    'https://github.com/test/repo1',
    'https://github.com/test/repo2',
    'https://github.com/test/repo3',
    'https://github.com/test/repo4'
  ];

  const type = workflowTypes[Math.floor(Math.random() * workflowTypes.length)];
  const priority = priorities[Math.floor(Math.random() * priorities.length)];
  const repo = repositories[Math.floor(Math.random() * repositories.length)];

  return {
    title: `Load Test ${type} Workflow ${Date.now()}`,
    githubRepoUrl: repo,
    requirements: `Implement ${type} functionality with ${priority} priority. This is a load test workflow created at ${new Date().toISOString()}.`,
    priority: priority,
    type: type,
    metadata: {
      loadTest: true,
      timestamp: Date.now(),
      userId: `user-${__VU}` // Virtual User ID
    }
  };
}

function generateTaskData(workflowId) {
  const taskTypes = ['feature', 'bug', 'infrastructure', 'testing'];
  const statuses = ['pending', 'active', 'completed'];
  
  return {
    workflowId: workflowId,
    title: `Load Test Task ${Date.now()}`,
    description: `Task created during load testing at ${new Date().toISOString()}`,
    type: taskTypes[Math.floor(Math.random() * taskTypes.length)],
    status: statuses[Math.floor(Math.random() * statuses.length)],
    priority: 'medium',
    estimatedHours: Math.floor(Math.random() * 20) + 1
  };
}

// Setup function
export function setup() {
  // Authenticate and get access token
  const authResponse = http.post(`${__ENV.BASE_URL}/api/auth/login`, {
    username: __ENV.TEST_USERNAME || 'loadtest@example.com',
    password: __ENV.TEST_PASSWORD || 'loadtest123'
  });

  check(authResponse, {
    'authentication successful': (r) => r.status === 200,
  });

  const authData = authResponse.json();
  return {
    authToken: authData.token,
    baseUrl: __ENV.BASE_URL || 'http://localhost:3000'
  };
}

// Main test function
export default function(data) {
  const { authToken, baseUrl } = data;
  
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  };

  // Test 1: Create Workflow
  testWorkflowCreation(baseUrl, headers);
  
  // Test 2: List Workflows
  testWorkflowListing(baseUrl, headers);
  
  // Test 3: Workflow Status Updates
  testWorkflowStatusUpdates(baseUrl, headers);
  
  // Test 4: Task Operations
  testTaskOperations(baseUrl, headers);
  
  // Test 5: Real-time Updates (WebSocket simulation)
  testRealtimeUpdates(baseUrl, headers);

  sleep(1); // Wait 1 second between iterations
}

function testWorkflowCreation(baseUrl, headers) {
  const workflowData = generateWorkflowData();
  
  const response = http.post(
    `${baseUrl}/api/workflows`,
    JSON.stringify(workflowData),
    { headers }
  );

  const success = check(response, {
    'workflow creation status is 201': (r) => r.status === 201,
    'workflow creation response time < 2s': (r) => r.timings.duration < 2000,
    'workflow has valid ID': (r) => r.json('id') !== undefined,
  });

  workflowCreationRate.add(success);
  workflowCreationDuration.add(response.timings.duration);
  
  if (!success) {
    apiErrorRate.add(1);
    console.error(`Workflow creation failed: ${response.status} - ${response.body}`);
  } else {
    concurrentWorkflows.add(1);
  }

  return response.json();
}

function testWorkflowListing(baseUrl, headers) {
  const response = http.get(`${baseUrl}/api/workflows`, { headers });

  check(response, {
    'workflow listing status is 200': (r) => r.status === 200,
    'workflow listing response time < 1s': (r) => r.timings.duration < 1000,
    'workflow list is array': (r) => Array.isArray(r.json()),
  });
}

function testWorkflowStatusUpdates(baseUrl, headers) {
  // First create a workflow to update
  const workflow = testWorkflowCreation(baseUrl, headers);
  
  if (workflow && workflow.id) {
    const updateData = {
      status: 'active',
      progress: Math.floor(Math.random() * 100),
      currentStep: 'code_generation'
    };

    const response = http.patch(
      `${baseUrl}/api/workflows/${workflow.id}`,
      JSON.stringify(updateData),
      { headers }
    );

    check(response, {
      'workflow update status is 200': (r) => r.status === 200,
      'workflow update response time < 1s': (r) => r.timings.duration < 1000,
    });
  }
}

function testTaskOperations(baseUrl, headers) {
  // Create a workflow first
  const workflow = testWorkflowCreation(baseUrl, headers);
  
  if (workflow && workflow.id) {
    // Create tasks for the workflow
    const taskData = generateTaskData(workflow.id);
    
    const createTaskResponse = http.post(
      `${baseUrl}/api/tasks`,
      JSON.stringify(taskData),
      { headers }
    );

    check(createTaskResponse, {
      'task creation status is 201': (r) => r.status === 201,
      'task creation response time < 1s': (r) => r.timings.duration < 1000,
    });

    // List tasks for the workflow
    const listTasksResponse = http.get(
      `${baseUrl}/api/workflows/${workflow.id}/tasks`,
      { headers }
    );

    check(listTasksResponse, {
      'task listing status is 200': (r) => r.status === 200,
      'task listing response time < 500ms': (r) => r.timings.duration < 500,
    });
  }
}

function testRealtimeUpdates(baseUrl, headers) {
  // Simulate polling for real-time updates
  const response = http.get(`${baseUrl}/api/workflows/status`, { headers });

  check(response, {
    'status endpoint responds': (r) => r.status === 200,
    'status response time < 500ms': (r) => r.timings.duration < 500,
  });
}

// Stress test scenario
export function stressTest() {
  const { authToken, baseUrl } = setup();
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  };

  // Create multiple workflows rapidly
  for (let i = 0; i < 5; i++) {
    testWorkflowCreation(baseUrl, headers);
  }

  // Rapid status checks
  for (let i = 0; i < 10; i++) {
    http.get(`${baseUrl}/api/workflows/status`, { headers });
  }
}

// Spike test configuration
export const spikeOptions = {
  stages: [
    { duration: '1m', target: 10 },   // Normal load
    { duration: '30s', target: 100 }, // Spike to 100 users
    { duration: '1m', target: 10 },   // Back to normal
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'], // Allow higher response times during spike
    http_req_failed: ['rate<0.1'],     // Allow higher error rate during spike
  },
};

// Volume test for database performance
export function volumeTest() {
  const { authToken, baseUrl } = setup();
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  };

  // Test database query performance with large datasets
  const response = http.get(`${baseUrl}/api/workflows?limit=1000&offset=0`, { headers });

  check(response, {
    'large dataset query status is 200': (r) => r.status === 200,
    'large dataset query time < 3s': (r) => r.timings.duration < 3000,
    'large dataset has results': (r) => r.json().length > 0,
  });
}

// Concurrent workflow processing test
export function concurrencyTest() {
  const { authToken, baseUrl } = setup();
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  };

  // Create multiple workflows that will run concurrently
  const workflows = [];
  for (let i = 0; i < 3; i++) {
    const workflow = testWorkflowCreation(baseUrl, headers);
    if (workflow && workflow.id) {
      workflows.push(workflow.id);
    }
  }

  // Start all workflows simultaneously
  workflows.forEach(workflowId => {
    http.post(
      `${baseUrl}/api/workflows/${workflowId}/start`,
      '{}',
      { headers }
    );
  });

  // Monitor concurrent execution
  sleep(2);
  
  workflows.forEach(workflowId => {
    const response = http.get(
      `${baseUrl}/api/workflows/${workflowId}/status`,
      { headers }
    );
    
    check(response, {
      'concurrent workflow status check': (r) => r.status === 200,
      'concurrent workflow is processing': (r) => {
        const status = r.json('status');
        return status === 'active' || status === 'completed';
      }
    });
  });
}

// Memory leak detection test
export function memoryTest() {
  const { authToken, baseUrl } = setup();
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  };

  // Create and delete workflows repeatedly to test for memory leaks
  for (let i = 0; i < 20; i++) {
    const workflow = testWorkflowCreation(baseUrl, headers);
    
    if (workflow && workflow.id) {
      // Delete the workflow
      const deleteResponse = http.del(
        `${baseUrl}/api/workflows/${workflow.id}`,
        null,
        { headers }
      );
      
      check(deleteResponse, {
        'workflow deletion successful': (r) => r.status === 200 || r.status === 204,
      });
    }
    
    sleep(0.1); // Small delay between operations
  }
}

// Teardown function
export function teardown(data) {
  // Clean up any test data if needed
  console.log('Load test completed');
  console.log(`Total workflows created: ${concurrentWorkflows.count}`);
}

// Export different test scenarios
export { stressTest, volumeTest, concurrencyTest, memoryTest };

