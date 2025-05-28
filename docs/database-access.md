# Cloudflare Database Proxy - External Service Integration Guide

This guide provides comprehensive documentation for integrating external services with the PostgreSQL database through the secure Cloudflare proxy.

## 🎯 Overview

The Cloudflare Database Proxy provides a secure, scalable, and performant way for external services to access the PostgreSQL database. It implements multiple layers of security, rate limiting, connection pooling, and monitoring.

## 🏗️ Architecture

```
External Service → Cloudflare Worker → PostgreSQL Database
                      ↓
                 [Rate Limiting]
                 [Authentication]
                 [SSL/TLS]
                 [Connection Pooling]
                 [Audit Logging]
```

### Key Components

1. **Cloudflare Worker**: Serverless proxy handling requests
2. **Rate Limiting**: IP-based request throttling
3. **Authentication**: Bearer token validation
4. **Connection Pooling**: Optimized database connections
5. **Audit Logging**: Comprehensive request tracking
6. **Health Monitoring**: Automatic failover capabilities

## 🔧 Setup and Configuration

### 1. Database Credentials

Use the following connection structure for external services:

```javascript
const credentials = {
  name: "Database",
  description: "PostgreSQL database",
  host: "your-worker.your-subdomain.workers.dev",
  port: 443,
  database: "codegen-taskmaster-db",
  username: "software_developer",
  password: "password",
  sslMode: "require",
  
  // Proxy-specific settings
  proxy: {
    enabled: true,
    type: "cloudflare-worker",
    apiToken: "your-api-token",
    endpoint: "https://your-worker.your-subdomain.workers.dev"
  }
};
```

### 2. Environment Variables

Set the following environment variables in your external service:

```bash
# Required
CLOUDFLARE_DB_PROXY_URL=https://your-worker.your-subdomain.workers.dev
DB_PROXY_API_TOKEN=your-secure-api-token

# Optional
DB_NAME=codegen-taskmaster-db
DB_USER=software_developer
DB_PASSWORD=password
NODE_ENV=production
```

## 🔌 Integration Examples

### Node.js Integration

```javascript
import { CloudflareProxyClient } from './cloudflare-proxy-client.js';

// Initialize client
const dbClient = new CloudflareProxyClient({
  PROXY_URL: process.env.CLOUDFLARE_DB_PROXY_URL,
  API_TOKEN: process.env.DB_PROXY_API_TOKEN,
});

// Execute queries
async function getUserTasks(userId) {
  try {
    const result = await dbClient.query(
      'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    
    return result.data;
  } catch (error) {
    console.error('Failed to fetch user tasks:', error);
    throw error;
  }
}

// Health check
async function checkDatabaseHealth() {
  const status = await dbClient.getStatus();
  console.log('Database status:', status);
  return status.isHealthy;
}
```

### Python Integration

```python
import requests
import json
import os
from typing import List, Dict, Any

class CloudflareProxyClient:
    def __init__(self, proxy_url: str = None, api_token: str = None):
        self.proxy_url = proxy_url or os.getenv('CLOUDFLARE_DB_PROXY_URL')
        self.api_token = api_token or os.getenv('DB_PROXY_API_TOKEN')
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.api_token}',
            'User-Agent': 'python-db-client/1.0.0'
        })
    
    def query(self, sql: str, params: List[Any] = None) -> Dict[str, Any]:
        """Execute a database query through the Cloudflare proxy."""
        payload = {
            'query': sql,
            'params': params or []
        }
        
        response = self.session.post(
            self.proxy_url,
            json=payload,
            timeout=30
        )
        
        response.raise_for_status()
        return response.json()
    
    def health_check(self) -> bool:
        """Check if the database proxy is healthy."""
        try:
            result = self.query('SELECT 1 as health_check')
            return result.get('success', False)
        except Exception:
            return False

# Usage example
db_client = CloudflareProxyClient()

def get_user_tasks(user_id: int):
    result = db_client.query(
        'SELECT * FROM tasks WHERE user_id = %s ORDER BY created_at DESC',
        [user_id]
    )
    return result['data']
```

### cURL Examples

```bash
# Health check
curl -X POST https://your-worker.your-subdomain.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-token" \
  -d '{"query": "SELECT 1 as health_check"}'

# Fetch tasks
curl -X POST https://your-worker.your-subdomain.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-token" \
  -d '{
    "query": "SELECT * FROM tasks WHERE status = $1 LIMIT $2",
    "params": ["active", 10]
  }'

# Insert new task
curl -X POST https://your-worker.your-subdomain.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-token" \
  -d '{
    "query": "INSERT INTO tasks (title, description, user_id) VALUES ($1, $2, $3) RETURNING id",
    "params": ["New Task", "Task description", 123]
  }'
```

## 🔒 Security Best Practices

### 1. API Token Management

- **Generate Strong Tokens**: Use cryptographically secure random tokens
- **Rotate Regularly**: Change tokens every 90 days
- **Environment Variables**: Never hardcode tokens in source code
- **Scope Limitation**: Use different tokens for different services

```javascript
// Good: Using environment variables
const apiToken = process.env.DB_PROXY_API_TOKEN;

// Bad: Hardcoded token
const apiToken = 'abc123-hardcoded-token';
```

### 2. Network Security

- **HTTPS Only**: Always use HTTPS endpoints
- **IP Whitelisting**: Configure allowed IP ranges in Cloudflare
- **VPN Access**: Route traffic through secure VPNs when possible

### 3. Query Security

- **Parameterized Queries**: Always use parameter binding
- **Input Validation**: Validate all inputs before querying
- **Principle of Least Privilege**: Grant minimal database permissions

```javascript
// Good: Parameterized query
const result = await dbClient.query(
  'SELECT * FROM users WHERE id = $1',
  [userId]
);

// Bad: String concatenation (SQL injection risk)
const result = await dbClient.query(
  `SELECT * FROM users WHERE id = ${userId}`
);
```

## 📊 Monitoring and Observability

### 1. Health Monitoring

```javascript
// Automated health checks
setInterval(async () => {
  const isHealthy = await dbClient.healthCheck();
  if (!isHealthy) {
    console.error('Database proxy is unhealthy');
    // Trigger alerts
  }
}, 60000); // Check every minute
```

### 2. Metrics Collection

The proxy automatically collects the following metrics:

- **Request Count**: Total requests per minute/hour
- **Response Time**: Query execution times
- **Error Rate**: Failed requests percentage
- **Rate Limit Hits**: Blocked requests due to rate limiting
- **Connection Pool Usage**: Active/idle connections

### 3. Logging

```javascript
// Enable detailed logging in development
const dbClient = new CloudflareProxyClient({
  MONITORING: {
    logQueries: process.env.NODE_ENV === 'development',
    logErrors: true,
    enableMetrics: true,
  }
});
```

## ⚡ Performance Optimization

### 1. Connection Pooling

```javascript
// Configure connection pool
const dbClient = new CloudflareProxyClient({
  POOL: {
    maxConnections: 10,
    idleTimeout: 30000,
    acquireTimeout: 5000,
  }
});
```

### 2. Query Optimization

- **Use Indexes**: Ensure proper database indexing
- **Limit Results**: Always use LIMIT for large datasets
- **Batch Operations**: Group multiple operations when possible

```javascript
// Good: Limited results
const tasks = await dbClient.query(
  'SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100'
);

// Good: Batch insert
const values = tasks.map((_, i) => `($${i*3+1}, $${i*3+2}, $${i*3+3})`).join(',');
const params = tasks.flatMap(task => [task.title, task.description, task.userId]);
await dbClient.query(
  `INSERT INTO tasks (title, description, user_id) VALUES ${values}`,
  params
);
```

### 3. Caching Strategy

```javascript
// Implement client-side caching for read-heavy operations
const cache = new Map();

async function getCachedUserTasks(userId) {
  const cacheKey = `user_tasks_${userId}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  const tasks = await dbClient.query(
    'SELECT * FROM tasks WHERE user_id = $1',
    [userId]
  );
  
  // Cache for 5 minutes
  cache.set(cacheKey, tasks);
  setTimeout(() => cache.delete(cacheKey), 5 * 60 * 1000);
  
  return tasks;
}
```

## 🚨 Error Handling

### 1. Retry Logic

```javascript
async function executeWithRetry(query, params, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await dbClient.query(query, params);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### 2. Circuit Breaker Pattern

```javascript
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureThreshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }
  
  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
  
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}
```

## 🧪 Testing

### 1. Unit Tests

```javascript
import { jest } from '@jest/globals';
import { CloudflareProxyClient } from './cloudflare-proxy-client.js';

describe('CloudflareProxyClient', () => {
  let client;
  
  beforeEach(() => {
    client = new CloudflareProxyClient({
      PROXY_URL: 'https://test-worker.workers.dev',
      API_TOKEN: 'test-token',
    });
  });
  
  test('should execute query successfully', async () => {
    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: [{ id: 1, title: 'Test Task' }],
        rowCount: 1,
      }),
    });
    
    const result = await client.query('SELECT * FROM tasks LIMIT 1');
    
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Test Task');
  });
  
  test('should handle rate limiting', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('{"error": "Rate limit exceeded"}'),
    });
    
    await expect(client.query('SELECT 1')).rejects.toThrow('Rate limit exceeded');
  });
});
```

### 2. Integration Tests

```javascript
describe('Database Integration', () => {
  test('should connect to real database proxy', async () => {
    const client = new CloudflareProxyClient();
    const result = await client.healthCheck();
    expect(result).toBe(true);
  });
  
  test('should handle concurrent requests', async () => {
    const client = new CloudflareProxyClient();
    const promises = Array(10).fill().map(() => 
      client.query('SELECT 1 as test')
    );
    
    const results = await Promise.all(promises);
    results.forEach(result => {
      expect(result.success).toBe(true);
    });
  });
});
```

## 🔧 Troubleshooting

### Common Issues

1. **Connection Timeouts**
   - Check network connectivity
   - Verify Cloudflare Worker is deployed
   - Increase timeout values

2. **Authentication Errors**
   - Verify API token is correct
   - Check token hasn't expired
   - Ensure Bearer prefix in Authorization header

3. **Rate Limiting**
   - Implement exponential backoff
   - Distribute requests across time
   - Consider upgrading rate limits

4. **Query Failures**
   - Validate SQL syntax
   - Check parameter binding
   - Review database permissions

### Debug Mode

```javascript
// Enable debug logging
const dbClient = new CloudflareProxyClient({
  MONITORING: {
    logQueries: true,
    logErrors: true,
    enableMetrics: true,
  }
});

// Check connection status
const status = await dbClient.getStatus();
console.log('Connection status:', status);
```

## 📈 Scaling Considerations

### 1. Horizontal Scaling

- Deploy multiple Cloudflare Workers across regions
- Use Cloudflare Load Balancer for distribution
- Implement consistent hashing for session affinity

### 2. Database Scaling

- Configure read replicas for read-heavy workloads
- Implement connection pooling at database level
- Consider database sharding for large datasets

### 3. Monitoring at Scale

- Use Cloudflare Analytics for request metrics
- Implement custom dashboards for business metrics
- Set up automated alerting for critical issues

## 🔗 Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [PostgreSQL Connection Pooling](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [Database Security Best Practices](https://www.postgresql.org/docs/current/security.html)
- [Rate Limiting Strategies](https://developers.cloudflare.com/workers/runtime-apis/kv/)

## 📞 Support

For issues related to the database proxy:

1. Check the troubleshooting section above
2. Review Cloudflare Worker logs
3. Verify database connectivity
4. Contact the development team with detailed error logs

---

*This documentation is maintained by the claude-task-master development team. Last updated: 2025-05-28*

