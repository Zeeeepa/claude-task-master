# Cloudflare Database Proxy

A secure, scalable, and performant PostgreSQL database proxy built on Cloudflare Workers, designed to enable external services to safely access the database while maintaining security and performance.

## 🎯 Features

- **🔒 Security First**: Bearer token authentication, SQL injection protection, and SSL/TLS encryption
- **⚡ High Performance**: Connection pooling, query optimization, and sub-50ms response times
- **🛡️ Rate Limiting**: IP-based throttling with 1000 requests/minute per IP
- **📊 Monitoring**: Comprehensive health checks, metrics collection, and audit logging
- **🔄 Reliability**: Automatic failover, retry logic, and circuit breaker patterns
- **🌍 Global Scale**: Deployed on Cloudflare's edge network for worldwide availability

## 🏗️ Architecture

```
External Service → Cloudflare Worker → PostgreSQL Database
                      ↓
                 [Authentication]
                 [Rate Limiting]
                 [Query Validation]
                 [Connection Pooling]
                 [Audit Logging]
```

## 🚀 Quick Start

### 1. Prerequisites

- [Cloudflare account](https://cloudflare.com) with Workers enabled
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed
- PostgreSQL database accessible from the internet
- Node.js 14+ for local development

### 2. Installation

```bash
# Clone the repository
git clone https://github.com/Zeeeepa/claude-task-master.git
cd claude-task-master/cloudflare

# Install dependencies
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### 3. Configuration

1. **Update `wrangler.toml`** with your account details:
   ```toml
   name = "your-db-proxy"
   account_id = "your-account-id"
   ```

2. **Set environment secrets**:
   ```bash
   wrangler secret put DB_HOST
   wrangler secret put DB_PORT
   wrangler secret put DB_NAME
   wrangler secret put DB_USER
   wrangler secret put DB_PASSWORD
   wrangler secret put VALID_API_TOKENS
   ```

3. **Create KV namespaces**:
   ```bash
   wrangler kv:namespace create "rate-limit"
   wrangler kv:namespace create "audit-log"
   ```

### 4. Deployment

```bash
# Deploy to staging
./deploy.sh staging

# Deploy to production
./deploy.sh production
```

### 5. Testing

```bash
# Health check
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-token" \
  -d '{"query": "SELECT 1 as health_check"}'

# Expected response:
{
  "success": true,
  "data": [{"health_check": 1}],
  "executionTime": 45,
  "timestamp": "2025-05-28T06:46:16.000Z"
}
```

## 📖 Usage

### Node.js Client

```javascript
import { CloudflareProxyClient } from './src/database/cloudflare-proxy-client.js';

const client = new CloudflareProxyClient({
  PROXY_URL: 'https://your-worker.workers.dev',
  API_TOKEN: 'your-api-token',
});

// Execute queries
const users = await client.query(
  'SELECT * FROM users WHERE active = $1 LIMIT $2',
  [true, 10]
);

// Health check
const isHealthy = await client.healthCheck();
```

### Python Client

```python
import requests

class DatabaseClient:
    def __init__(self, proxy_url, api_token):
        self.proxy_url = proxy_url
        self.headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_token}'
        }
    
    def query(self, sql, params=None):
        response = requests.post(
            self.proxy_url,
            json={'query': sql, 'params': params or []},
            headers=self.headers
        )
        return response.json()

# Usage
client = DatabaseClient(
    'https://your-worker.workers.dev',
    'your-api-token'
)

result = client.query('SELECT * FROM tasks LIMIT 5')
```

### cURL Examples

```bash
# Insert data
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-token" \
  -d '{
    "query": "INSERT INTO tasks (title, description) VALUES ($1, $2) RETURNING id",
    "params": ["New Task", "Task description"]
  }'

# Query with filters
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-token" \
  -d '{
    "query": "SELECT * FROM tasks WHERE status = $1 ORDER BY created_at DESC LIMIT $2",
    "params": ["active", 20]
  }'
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DB_HOST` | PostgreSQL host | ✅ |
| `DB_PORT` | PostgreSQL port | ✅ |
| `DB_NAME` | Database name | ✅ |
| `DB_USER` | Database username | ✅ |
| `DB_PASSWORD` | Database password | ✅ |
| `VALID_API_TOKENS` | Comma-separated API tokens | ✅ |

### Rate Limiting

- **Default**: 1000 requests per minute per IP
- **Burst**: Up to 50 concurrent requests
- **Window**: 60-second sliding window
- **Storage**: Cloudflare KV for distributed rate limiting

### Security Features

- **Authentication**: Bearer token validation
- **SQL Injection Protection**: Query pattern analysis
- **Query Validation**: Length limits and dangerous operation detection
- **SSL/TLS**: End-to-end encryption
- **Audit Logging**: All requests logged with metadata

### Performance Optimization

- **Connection Pooling**: Up to 20 concurrent database connections
- **Query Timeout**: 30-second maximum execution time
- **Result Limiting**: Maximum 10,000 rows per query
- **Edge Caching**: Cloudflare's global CDN for static responses

## 📊 Monitoring

### Health Checks

The proxy includes comprehensive health monitoring:

```javascript
import { DatabaseMonitor } from './src/utils/database-monitoring.js';

const monitor = new DatabaseMonitor();

// Start continuous monitoring
monitor.startMonitoring(30000); // Every 30 seconds

// Get health status
const status = monitor.getHealthSummary();
console.log('Database health:', status);

// Generate detailed report
const report = monitor.generateHealthReport();
```

### CLI Tools

```bash
# Health check
node src/cli/database-proxy-cli.js health

# Performance benchmark
node src/cli/database-proxy-cli.js benchmark -c 10 -r 100

# Start monitoring
node src/cli/database-proxy-cli.js monitor -i 30

# Generate report
node src/cli/database-proxy-cli.js report -f json -o health-report.json
```

### Metrics Collected

- **Request Count**: Total requests per time period
- **Response Time**: Average, min, max, and percentiles
- **Success Rate**: Percentage of successful requests
- **Error Rate**: Failed requests and error types
- **Connection Pool**: Active/idle connection counts
- **Rate Limiting**: Blocked requests and patterns

## 🔒 Security Best Practices

### API Token Management

1. **Generate Strong Tokens**: Use cryptographically secure random strings
2. **Rotate Regularly**: Change tokens every 90 days
3. **Environment Variables**: Never hardcode tokens
4. **Scope Limitation**: Use different tokens for different services

### Network Security

1. **HTTPS Only**: All communication over TLS
2. **IP Whitelisting**: Configure allowed IP ranges in Cloudflare
3. **VPN Access**: Route sensitive traffic through secure networks
4. **Firewall Rules**: Implement additional Cloudflare security rules

### Database Security

1. **Least Privilege**: Grant minimal required permissions
2. **Parameterized Queries**: Always use parameter binding
3. **Input Validation**: Validate all inputs before processing
4. **Connection Encryption**: SSL/TLS for database connections

## 🧪 Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- tests/database-proxy.test.js

# Run with coverage
npm run test:coverage
```

### Integration Tests

```bash
# Test against staging environment
NODE_ENV=staging npm run test:integration

# Load testing
npm run test:load
```

### Security Testing

```bash
# SQL injection tests
npm run test:security

# Rate limiting tests
npm run test:rate-limit
```

## 🚨 Troubleshooting

### Common Issues

1. **Connection Timeouts**
   - Check network connectivity
   - Verify Cloudflare Worker is deployed
   - Increase timeout values in configuration

2. **Authentication Errors**
   - Verify API token is correct and not expired
   - Check Authorization header format
   - Ensure token is in VALID_API_TOKENS list

3. **Rate Limiting**
   - Implement exponential backoff in client
   - Distribute requests across time
   - Consider upgrading rate limits

4. **Query Failures**
   - Validate SQL syntax
   - Check parameter binding
   - Review database permissions

### Debug Mode

```javascript
// Enable detailed logging
const client = new CloudflareProxyClient({
  MONITORING: {
    logQueries: true,
    logErrors: true,
    enableMetrics: true,
  }
});

// Check connection status
const status = await client.getStatus();
console.log('Connection status:', status);
```

### Log Analysis

```bash
# View Cloudflare Worker logs
wrangler tail

# Filter for errors
wrangler tail --format pretty | grep ERROR

# Export logs for analysis
wrangler tail --format json > worker-logs.json
```

## 📈 Performance Tuning

### Database Optimization

1. **Indexes**: Ensure proper indexing for frequent queries
2. **Connection Pooling**: Tune pool size based on load
3. **Query Optimization**: Use EXPLAIN to analyze query plans
4. **Read Replicas**: Consider read replicas for read-heavy workloads

### Cloudflare Optimization

1. **Caching**: Enable caching for read-only queries
2. **Compression**: Use gzip compression for large responses
3. **Geographic Distribution**: Deploy to multiple regions
4. **Load Balancing**: Use Cloudflare Load Balancer for high availability

### Client Optimization

1. **Connection Reuse**: Implement client-side connection pooling
2. **Batch Operations**: Group multiple operations when possible
3. **Caching**: Cache frequently accessed data
4. **Async Processing**: Use asynchronous operations

## 🔄 Deployment Pipeline

### CI/CD Integration

```yaml
# .github/workflows/deploy-proxy.yml
name: Deploy Database Proxy

on:
  push:
    branches: [main]
    paths: ['cloudflare/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Cloudflare
        run: |
          cd cloudflare
          ./deploy.sh production
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Environment Management

- **Development**: Local Wrangler dev server
- **Staging**: Dedicated staging worker
- **Production**: Production worker with monitoring

### Rollback Strategy

```bash
# Rollback to previous version
wrangler rollback --name your-db-proxy

# Deploy specific version
wrangler deploy --compatibility-date 2025-05-27
```

## 📚 Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [PostgreSQL Performance Tuning](https://www.postgresql.org/docs/current/performance-tips.html)
- [Database Security Best Practices](https://www.postgresql.org/docs/current/security.html)
- [Rate Limiting Strategies](https://developers.cloudflare.com/workers/runtime-apis/kv/)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License with Commons Clause - see the [LICENSE](../LICENSE) file for details.

## 📞 Support

For issues and questions:

1. Check the [troubleshooting section](#-troubleshooting)
2. Review [Cloudflare Worker logs](#log-analysis)
3. Open an issue on GitHub
4. Contact the development team

---

*Maintained by the claude-task-master development team*

