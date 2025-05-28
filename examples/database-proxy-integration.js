/**
 * Database Proxy Integration Examples
 * Demonstrates how to integrate external services with the Cloudflare database proxy
 */

import { CloudflareProxyClient } from '../src/database/cloudflare-proxy-client.js';
import { DatabaseMonitor } from '../src/utils/database-monitoring.js';

// Example 1: Basic Integration for codegen API
export class CodegenDatabaseService {
  constructor() {
    this.client = new CloudflareProxyClient({
      PROXY_URL: process.env.CLOUDFLARE_DB_PROXY_URL,
      API_TOKEN: process.env.DB_PROXY_API_TOKEN,
    });
  }

  async createTask(task) {
    try {
      const result = await this.client.query(
        `INSERT INTO tasks (title, description, status, user_id, created_at) 
         VALUES ($1, $2, $3, $4, NOW()) 
         RETURNING id, created_at`,
        [task.title, task.description, 'pending', task.userId]
      );

      return {
        success: true,
        task: {
          id: result.data[0].id,
          ...task,
          createdAt: result.data[0].created_at,
        },
      };
    } catch (error) {
      console.error('Failed to create task:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getTasks(userId, filters = {}) {
    try {
      let query = 'SELECT * FROM tasks WHERE user_id = $1';
      const params = [userId];

      if (filters.status) {
        query += ' AND status = $2';
        params.push(filters.status);
      }

      if (filters.limit) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(filters.limit);
      }

      query += ' ORDER BY created_at DESC';

      const result = await this.client.query(query, params);

      return {
        success: true,
        tasks: result.data,
        count: result.rowCount,
      };
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async updateTaskStatus(taskId, status, userId) {
    try {
      const result = await this.client.query(
        `UPDATE tasks 
         SET status = $1, updated_at = NOW() 
         WHERE id = $2 AND user_id = $3 
         RETURNING *`,
        [status, taskId, userId]
      );

      if (result.rowCount === 0) {
        return {
          success: false,
          error: 'Task not found or access denied',
        };
      }

      return {
        success: true,
        task: result.data[0],
      };
    } catch (error) {
      console.error('Failed to update task:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getTaskAnalytics(userId) {
    try {
      const result = await this.client.query(
        `SELECT 
           status,
           COUNT(*) as count,
           AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_completion_time
         FROM tasks 
         WHERE user_id = $1 
         GROUP BY status`,
        [userId]
      );

      return {
        success: true,
        analytics: result.data,
      };
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Example 2: agentapi Middleware Integration
export class AgentApiDatabaseService {
  constructor() {
    this.client = new CloudflareProxyClient({
      PROXY_URL: process.env.CLOUDFLARE_DB_PROXY_URL,
      API_TOKEN: process.env.DB_PROXY_API_TOKEN,
    });
  }

  async logAgentExecution(execution) {
    try {
      const result = await this.client.query(
        `INSERT INTO agent_executions 
         (agent_type, command, status, output, execution_time, created_at) 
         VALUES ($1, $2, $3, $4, $5, NOW()) 
         RETURNING id`,
        [
          execution.agentType,
          execution.command,
          execution.status,
          execution.output,
          execution.executionTime,
        ]
      );

      return {
        success: true,
        executionId: result.data[0].id,
      };
    } catch (error) {
      console.error('Failed to log agent execution:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getAgentMetrics(agentType, timeRange = '24 hours') {
    try {
      const result = await this.client.query(
        `SELECT 
           COUNT(*) as total_executions,
           COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_executions,
           AVG(execution_time) as avg_execution_time,
           MAX(execution_time) as max_execution_time
         FROM agent_executions 
         WHERE agent_type = $1 
         AND created_at > NOW() - INTERVAL $2`,
        [agentType, timeRange]
      );

      const metrics = result.data[0];
      const successRate = metrics.total_executions > 0 
        ? (metrics.successful_executions / metrics.total_executions) * 100 
        : 0;

      return {
        success: true,
        metrics: {
          ...metrics,
          success_rate: successRate,
        },
      };
    } catch (error) {
      console.error('Failed to fetch agent metrics:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Example 3: Webhook System Integration
export class WebhookDatabaseService {
  constructor() {
    this.client = new CloudflareProxyClient({
      PROXY_URL: process.env.CLOUDFLARE_DB_PROXY_URL,
      API_TOKEN: process.env.DB_PROXY_API_TOKEN,
    });
  }

  async registerWebhook(webhook) {
    try {
      const result = await this.client.query(
        `INSERT INTO webhooks (url, events, secret, active, created_at) 
         VALUES ($1, $2, $3, $4, NOW()) 
         RETURNING id`,
        [webhook.url, JSON.stringify(webhook.events), webhook.secret, true]
      );

      return {
        success: true,
        webhookId: result.data[0].id,
      };
    } catch (error) {
      console.error('Failed to register webhook:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getActiveWebhooks(event) {
    try {
      const result = await this.client.query(
        `SELECT id, url, secret 
         FROM webhooks 
         WHERE active = true 
         AND events::jsonb ? $1`,
        [event]
      );

      return {
        success: true,
        webhooks: result.data,
      };
    } catch (error) {
      console.error('Failed to fetch webhooks:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async logWebhookDelivery(webhookId, event, status, responseTime) {
    try {
      await this.client.query(
        `INSERT INTO webhook_deliveries 
         (webhook_id, event, status, response_time, created_at) 
         VALUES ($1, $2, $3, $4, NOW())`,
        [webhookId, event, status, responseTime]
      );

      return { success: true };
    } catch (error) {
      console.error('Failed to log webhook delivery:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Example 4: Monitoring and Health Check Service
export class DatabaseHealthService {
  constructor() {
    this.monitor = new DatabaseMonitor({
      PROXY_URL: process.env.CLOUDFLARE_DB_PROXY_URL,
      API_TOKEN: process.env.DB_PROXY_API_TOKEN,
    });
  }

  async startHealthMonitoring() {
    console.log('🔍 Starting database health monitoring...');
    
    // Start continuous monitoring
    this.monitor.startMonitoring(30000); // Every 30 seconds

    // Set up alert handlers
    this.monitor.on('unhealthy', (healthCheck) => {
      this.handleUnhealthyDatabase(healthCheck);
    });

    this.monitor.on('recovered', (healthCheck) => {
      this.handleDatabaseRecovery(healthCheck);
    });
  }

  async handleUnhealthyDatabase(healthCheck) {
    console.error('🚨 Database is unhealthy:', healthCheck);
    
    // Send alert to monitoring service
    await this.sendAlert({
      severity: 'critical',
      message: 'Database proxy is unhealthy',
      details: healthCheck,
    });

    // Implement fallback strategies
    await this.enableFallbackMode();
  }

  async handleDatabaseRecovery(healthCheck) {
    console.log('✅ Database has recovered:', healthCheck);
    
    // Send recovery notification
    await this.sendAlert({
      severity: 'info',
      message: 'Database proxy has recovered',
      details: healthCheck,
    });

    // Disable fallback mode
    await this.disableFallbackMode();
  }

  async sendAlert(alert) {
    // Implementation would send to Slack, email, or monitoring service
    console.log('📢 Alert:', alert);
  }

  async enableFallbackMode() {
    // Implementation would enable read-only mode or cached responses
    console.log('🔄 Enabling fallback mode');
  }

  async disableFallbackMode() {
    // Implementation would restore normal operation
    console.log('🔄 Disabling fallback mode');
  }

  async generateDailyReport() {
    const report = this.monitor.generateHealthReport();
    
    // Save report to file or send to monitoring service
    console.log('📊 Daily Health Report:', report);
    
    return report;
  }
}

// Example 5: Connection Pool Management
export class DatabaseConnectionManager {
  constructor() {
    this.pools = new Map();
    this.defaultConfig = {
      PROXY_URL: process.env.CLOUDFLARE_DB_PROXY_URL,
      API_TOKEN: process.env.DB_PROXY_API_TOKEN,
    };
  }

  getPool(serviceName, config = {}) {
    if (!this.pools.has(serviceName)) {
      const poolConfig = { ...this.defaultConfig, ...config };
      const client = new CloudflareProxyClient(poolConfig);
      this.pools.set(serviceName, client);
    }
    
    return this.pools.get(serviceName);
  }

  async executeWithPool(serviceName, query, params = []) {
    const pool = this.getPool(serviceName);
    return pool.query(query, params);
  }

  async closeAllPools() {
    for (const [serviceName, pool] of this.pools) {
      await pool.close();
      console.log(`Closed pool for ${serviceName}`);
    }
    this.pools.clear();
  }

  getPoolStatus() {
    const status = {};
    for (const [serviceName, pool] of this.pools) {
      status[serviceName] = pool.getStatus();
    }
    return status;
  }
}

// Example Usage
async function demonstrateIntegration() {
  console.log('🚀 Demonstrating Database Proxy Integration\n');

  // 1. codegen API Integration
  console.log('1. codegen API Integration:');
  const codegenService = new CodegenDatabaseService();
  
  const newTask = await codegenService.createTask({
    title: 'Implement new feature',
    description: 'Add user authentication',
    userId: 123,
  });
  console.log('Created task:', newTask);

  const userTasks = await codegenService.getTasks(123, { status: 'pending', limit: 5 });
  console.log('User tasks:', userTasks);

  // 2. agentapi Integration
  console.log('\n2. agentapi Integration:');
  const agentService = new AgentApiDatabaseService();
  
  const execution = await agentService.logAgentExecution({
    agentType: 'claude-code',
    command: 'validate-pr',
    status: 'success',
    output: 'PR validation completed successfully',
    executionTime: 2500,
  });
  console.log('Logged execution:', execution);

  const metrics = await agentService.getAgentMetrics('claude-code');
  console.log('Agent metrics:', metrics);

  // 3. Webhook Integration
  console.log('\n3. Webhook Integration:');
  const webhookService = new WebhookDatabaseService();
  
  const webhook = await webhookService.registerWebhook({
    url: 'https://api.example.com/webhooks/tasks',
    events: ['task.created', 'task.completed'],
    secret: 'webhook-secret-key',
  });
  console.log('Registered webhook:', webhook);

  // 4. Health Monitoring
  console.log('\n4. Health Monitoring:');
  const healthService = new DatabaseHealthService();
  
  // Start monitoring (would run continuously in production)
  // await healthService.startHealthMonitoring();
  
  const report = await healthService.generateDailyReport();
  console.log('Health report generated');

  // 5. Connection Management
  console.log('\n5. Connection Management:');
  const connectionManager = new DatabaseConnectionManager();
  
  // Execute queries with different service pools
  await connectionManager.executeWithPool('codegen', 'SELECT COUNT(*) FROM tasks');
  await connectionManager.executeWithPool('agentapi', 'SELECT COUNT(*) FROM agent_executions');
  
  const poolStatus = connectionManager.getPoolStatus();
  console.log('Pool status:', poolStatus);

  console.log('\n✅ Integration demonstration completed!');
}

// Run demonstration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateIntegration().catch(console.error);
}

export {
  CodegenDatabaseService,
  AgentApiDatabaseService,
  WebhookDatabaseService,
  DatabaseHealthService,
  DatabaseConnectionManager,
};

