# Troubleshooting Guide

## Overview

This guide provides comprehensive troubleshooting information for the claude-task-master system, including common issues, diagnostic procedures, and resolution steps for integration testing, system health, performance, and security components.

## Table of Contents

1. [General Troubleshooting](#general-troubleshooting)
2. [Integration Testing Issues](#integration-testing-issues)
3. [System Health Problems](#system-health-problems)
4. [Performance Issues](#performance-issues)
5. [Security Validation Problems](#security-validation-problems)
6. [Database Issues](#database-issues)
7. [API Integration Problems](#api-integration-problems)
8. [Deployment Issues](#deployment-issues)
9. [Monitoring and Logging](#monitoring-and-logging)
10. [Emergency Procedures](#emergency-procedures)

## General Troubleshooting

### Diagnostic Checklist

Before diving into specific issues, run through this general diagnostic checklist:

#### 1. System Status Check
```bash
# Check application status
pm2 status

# Check system resources
free -h
df -h
top -n 1

# Check network connectivity
ping google.com
curl -I https://api.anthropic.com
```

#### 2. Log Analysis
```bash
# Check application logs
tail -f logs/combined.log
tail -f logs/error.log

# Check system logs
sudo journalctl -u taskmaster -f
sudo tail -f /var/log/syslog
```

#### 3. Configuration Validation
```bash
# Verify environment variables
env | grep -E "(API_KEY|DATABASE|NODE_ENV)"

# Check configuration files
cat .env | grep -v "^#"
node -e "console.log(JSON.stringify(require('./config/production.json'), null, 2))"
```

#### 4. Dependency Check
```bash
# Check Node.js version
node --version
npm --version

# Verify dependencies
npm ls --depth=0
npm audit
```

### Common Error Patterns

#### Error Pattern 1: Module Not Found
```
Error: Cannot find module 'module-name'
```

**Causes:**
- Missing dependency
- Incorrect import path
- Node modules corruption

**Solutions:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Check import paths
grep -r "module-name" src/

# Verify package.json
cat package.json | jq '.dependencies'
```

#### Error Pattern 2: Permission Denied
```
Error: EACCES: permission denied
```

**Causes:**
- Incorrect file permissions
- User privilege issues
- Directory access restrictions

**Solutions:**
```bash
# Fix file permissions
sudo chown -R taskmaster:taskmaster /home/taskmaster/claude-task-master
chmod -R 755 /home/taskmaster/claude-task-master

# Check user context
whoami
groups

# Verify directory permissions
ls -la /home/taskmaster/
```

#### Error Pattern 3: Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Causes:**
- Another process using the port
- Previous instance not properly terminated
- Port conflict

**Solutions:**
```bash
# Find process using port
sudo lsof -i :3000
sudo netstat -tulpn | grep :3000

# Kill process
sudo kill -9 <PID>

# Use different port
export PORT=3001
```

## Integration Testing Issues

### Test Execution Failures

#### Issue: Tests Timeout
```
Error: Test timeout after 300000ms
```

**Diagnosis:**
```bash
# Check system resources during test
top -p $(pgrep -f "integration-test")

# Monitor network connectivity
ping -c 5 api.anthropic.com

# Check test configuration
echo $INTEGRATION_TEST_TIMEOUT
```

**Solutions:**
```bash
# Increase timeout
export INTEGRATION_TEST_TIMEOUT=600000

# Run tests with debug logging
LOG_LEVEL=debug npm run test:integration

# Run individual test categories
npm run test:integration:e2e
```

#### Issue: API Authentication Failures
```
Error: 401 Unauthorized - Invalid API key
```

**Diagnosis:**
```bash
# Verify API keys
echo $ANTHROPIC_API_KEY | cut -c1-10
echo $OPENAI_API_KEY | cut -c1-10

# Test API connectivity
curl -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
     https://api.anthropic.com/v1/messages
```

**Solutions:**
```bash
# Update API keys
export ANTHROPIC_API_KEY="your-new-key"

# Check key format
if [[ $ANTHROPIC_API_KEY =~ ^sk-ant-api03- ]]; then
    echo "Anthropic key format correct"
else
    echo "Invalid Anthropic key format"
fi

# Test with curl
curl -X POST https://api.anthropic.com/v1/messages \
     -H "Content-Type: application/json" \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     -d '{"model":"claude-3-sonnet-20240229","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
```

#### Issue: Database Connection Failures
```
Error: Connection terminated unexpectedly
```

**Diagnosis:**
```bash
# Check database status
sudo systemctl status postgresql

# Test database connection
psql -h localhost -U taskmaster_user -d taskmaster -c "SELECT 1;"

# Check connection string
echo $DATABASE_URL
```

**Solutions:**
```bash
# Restart database
sudo systemctl restart postgresql

# Check database logs
sudo tail -f /var/log/postgresql/postgresql-*.log

# Test connection with different parameters
psql "postgresql://taskmaster_user:password@localhost:5432/taskmaster?sslmode=require"
```

### Test Result Analysis

#### Issue: Flaky Tests
**Symptoms:** Tests pass/fail inconsistently

**Diagnosis:**
```bash
# Run tests multiple times
for i in {1..5}; do
    echo "Run $i:"
    npm run test:integration:e2e
done

# Check for race conditions
grep -r "setTimeout\|setInterval" integration/
```

**Solutions:**
```bash
# Add proper synchronization
# In test code, use proper async/await patterns

# Increase retry attempts
export INTEGRATION_TEST_RETRIES=5

# Add delays between tests
# In test configuration, add delays between scenarios
```

#### Issue: Memory Leaks in Tests
**Symptoms:** Tests slow down over time, memory usage increases

**Diagnosis:**
```bash
# Monitor memory during tests
while true; do
    ps aux | grep "integration-test" | awk '{print $6}'
    sleep 5
done

# Check for unclosed resources
grep -r "new.*(" integration/ | grep -v "await\|close\|cleanup"
```

**Solutions:**
```bash
# Add proper cleanup
# Ensure all resources are properly closed in test teardown

# Force garbage collection
node --expose-gc run-integration-tests.js

# Limit test concurrency
export MAX_CONCURRENT_TESTS=1
```

## System Health Problems

### Health Check Failures

#### Issue: Database Health Check Fails
```
Error: Database health check failed - connection timeout
```

**Diagnosis:**
```bash
# Check database status
sudo systemctl status postgresql
sudo -u postgres psql -c "SELECT version();"

# Check connection limits
sudo -u postgres psql -c "SHOW max_connections;"
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"
```

**Solutions:**
```bash
# Restart database
sudo systemctl restart postgresql

# Increase connection limits
sudo nano /etc/postgresql/13/main/postgresql.conf
# max_connections = 200

# Kill idle connections
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < now() - interval '1 hour';"
```

#### Issue: MCP Server Unresponsive
```
Error: MCP server health check failed - no response
```

**Diagnosis:**
```bash
# Check MCP server process
ps aux | grep mcp-server
pm2 list | grep mcp

# Check MCP server logs
tail -f logs/mcp-server.log

# Test MCP server directly
curl http://localhost:3000/mcp/health
```

**Solutions:**
```bash
# Restart MCP server
pm2 restart mcp-server

# Check configuration
cat mcp-server/server.js

# Increase timeout
export MCP_SERVER_TIMEOUT=10000
```

### Resource Monitoring Issues

#### Issue: High Memory Usage
**Symptoms:** Memory usage consistently above 80%

**Diagnosis:**
```bash
# Check memory usage by process
ps aux --sort=-%mem | head -10

# Check for memory leaks
valgrind --tool=memcheck --leak-check=full node index.js

# Monitor memory over time
while true; do
    free -m | grep Mem | awk '{print $3/$2 * 100.0}'
    sleep 60
done
```

**Solutions:**
```bash
# Increase available memory
# Add swap space
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Optimize Node.js memory
export NODE_OPTIONS="--max-old-space-size=1024"

# Restart application
pm2 restart taskmaster
```

#### Issue: High CPU Usage
**Symptoms:** CPU usage consistently above 80%

**Diagnosis:**
```bash
# Check CPU usage by process
top -o %CPU

# Profile application
node --prof index.js
node --prof-process isolate-*.log > profile.txt

# Check for infinite loops
strace -p $(pgrep -f taskmaster) -e trace=write
```

**Solutions:**
```bash
# Optimize application
# Review and optimize CPU-intensive operations

# Scale horizontally
pm2 scale taskmaster +2

# Limit CPU usage
cpulimit -p $(pgrep -f taskmaster) -l 50
```

## Performance Issues

### Slow Response Times

#### Issue: API Response Times > 1000ms
**Symptoms:** Integration tests failing SLA requirements

**Diagnosis:**
```bash
# Measure response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/tasks

# Create curl-format.txt
cat > curl-format.txt << 'EOF'
     time_namelookup:  %{time_namelookup}\n
        time_connect:  %{time_connect}\n
     time_appconnect:  %{time_appconnect}\n
    time_pretransfer:  %{time_pretransfer}\n
       time_redirect:  %{time_redirect}\n
  time_starttransfer:  %{time_starttransfer}\n
                     ----------\n
          time_total:  %{time_total}\n
EOF

# Check database query performance
sudo -u postgres psql taskmaster -c "SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"
```

**Solutions:**
```bash
# Add database indexes
sudo -u postgres psql taskmaster -c "CREATE INDEX CONCURRENTLY idx_tasks_status_created ON tasks(status, created_at);"

# Enable query caching
# Add Redis caching layer

# Optimize queries
# Review and optimize slow queries identified above

# Scale database
# Consider read replicas for read-heavy workloads
```

### Load Testing Failures

#### Issue: System Cannot Handle Expected Load
**Symptoms:** Performance tests failing under load

**Diagnosis:**
```bash
# Run load test with monitoring
npm run test:integration:performance &
PERF_PID=$!

# Monitor during load test
while kill -0 $PERF_PID 2>/dev/null; do
    echo "$(date): CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}'), Memory: $(free | awk 'NR==2{printf "%.0f%%", $3*100/$2}')"
    sleep 5
done
```

**Solutions:**
```bash
# Horizontal scaling
pm2 scale taskmaster max

# Database connection pooling
# Increase database connection pool size

# Caching implementation
# Add Redis for caching frequently accessed data

# Load balancing
# Implement load balancer for multiple instances
```

## Security Validation Problems

### Security Test Failures

#### Issue: Input Validation Tests Failing
```
Error: Malicious input not properly sanitized
```

**Diagnosis:**
```bash
# Check input validation implementation
grep -r "sanitize\|validate" src/

# Test input validation manually
curl -X POST http://localhost:3000/api/tasks \
     -H "Content-Type: application/json" \
     -d '{"title":"<script>alert(1)</script>"}'
```

**Solutions:**
```bash
# Implement proper input validation
# Add validation middleware

# Update dependencies
npm audit fix

# Add security headers
# Implement helmet.js for security headers
```

#### Issue: Authentication Bypass
```
Error: Unauthorized access detected
```

**Diagnosis:**
```bash
# Check authentication middleware
grep -r "auth\|jwt\|token" src/middleware/

# Test authentication
curl -H "Authorization: Bearer invalid-token" \
     http://localhost:3000/api/protected
```

**Solutions:**
```bash
# Fix authentication logic
# Review and strengthen authentication implementation

# Update JWT configuration
# Ensure proper JWT validation

# Add rate limiting
# Implement rate limiting to prevent brute force attacks
```

### Vulnerability Scanning Issues

#### Issue: High Severity Vulnerabilities Found
**Symptoms:** Security tests reporting critical vulnerabilities

**Diagnosis:**
```bash
# Run security audit
npm audit
npm audit --audit-level high

# Check for known vulnerabilities
npx retire

# Scan with additional tools
npx snyk test
```

**Solutions:**
```bash
# Update vulnerable dependencies
npm audit fix --force

# Replace vulnerable packages
# Find alternatives for packages that cannot be updated

# Apply security patches
# Manually patch if automatic fixes are not available
```

## Database Issues

### Connection Problems

#### Issue: Database Connection Pool Exhausted
```
Error: remaining connection slots are reserved
```

**Diagnosis:**
```bash
# Check active connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"

# Check connection limits
sudo -u postgres psql -c "SHOW max_connections;"

# Check long-running queries
sudo -u postgres psql -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';"
```

**Solutions:**
```bash
# Increase connection limit
sudo nano /etc/postgresql/13/main/postgresql.conf
# max_connections = 200

# Kill long-running queries
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE (now() - pg_stat_activity.query_start) > interval '10 minutes';"

# Optimize connection pooling
# Adjust application connection pool settings
```

### Performance Problems

#### Issue: Slow Database Queries
**Symptoms:** Database operations taking > 1000ms

**Diagnosis:**
```bash
# Enable query logging
sudo nano /etc/postgresql/13/main/postgresql.conf
# log_min_duration_statement = 1000

# Check slow queries
sudo tail -f /var/log/postgresql/postgresql-*.log | grep "duration:"

# Analyze query plans
sudo -u postgres psql taskmaster -c "EXPLAIN ANALYZE SELECT * FROM tasks WHERE status = 'pending';"
```

**Solutions:**
```bash
# Add missing indexes
sudo -u postgres psql taskmaster -c "CREATE INDEX CONCURRENTLY idx_tasks_status ON tasks(status);"

# Update table statistics
sudo -u postgres psql taskmaster -c "ANALYZE tasks;"

# Optimize queries
# Rewrite inefficient queries

# Consider partitioning
# For large tables, consider table partitioning
```

## API Integration Problems

### External API Issues

#### Issue: Anthropic API Rate Limiting
```
Error: 429 Too Many Requests
```

**Diagnosis:**
```bash
# Check rate limit headers
curl -I -H "x-api-key: $ANTHROPIC_API_KEY" \
     https://api.anthropic.com/v1/messages

# Monitor API usage
grep "anthropic" logs/combined.log | grep -c "$(date +%Y-%m-%d)"
```

**Solutions:**
```bash
# Implement exponential backoff
# Add retry logic with exponential backoff

# Reduce API call frequency
# Optimize to reduce unnecessary API calls

# Use multiple API keys
# Implement API key rotation for higher limits
```

#### Issue: GitHub API Authentication
```
Error: 401 Bad credentials
```

**Diagnosis:**
```bash
# Test GitHub token
curl -H "Authorization: token $GITHUB_TOKEN" \
     https://api.github.com/user

# Check token permissions
curl -H "Authorization: token $GITHUB_TOKEN" \
     https://api.github.com/user/repos
```

**Solutions:**
```bash
# Generate new token
# Create new GitHub personal access token

# Check token scopes
# Ensure token has required permissions

# Update token in environment
export GITHUB_TOKEN="new-token"
```

### Webhook Issues

#### Issue: Webhook Delivery Failures
**Symptoms:** Webhooks not being received

**Diagnosis:**
```bash
# Check webhook endpoint
curl -X POST http://localhost:3000/webhook \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'

# Check webhook logs
grep "webhook" logs/combined.log

# Verify webhook URL accessibility
curl -I https://yourdomain.com/webhook
```

**Solutions:**
```bash
# Fix webhook endpoint
# Ensure webhook endpoint is properly implemented

# Check firewall rules
sudo ufw status
sudo iptables -L

# Verify SSL certificate
openssl s_client -connect yourdomain.com:443
```

## Deployment Issues

### Deployment Failures

#### Issue: PM2 Process Crashes
```
Error: Process exited with code 1
```

**Diagnosis:**
```bash
# Check PM2 logs
pm2 logs taskmaster

# Check process status
pm2 status

# Monitor process
pm2 monit
```

**Solutions:**
```bash
# Restart process
pm2 restart taskmaster

# Check configuration
cat ecosystem.config.js

# Increase memory limit
pm2 delete taskmaster
pm2 start ecosystem.config.js --max-memory-restart 2G
```

#### Issue: Environment Variable Issues
**Symptoms:** Application fails to start due to missing configuration

**Diagnosis:**
```bash
# Check environment variables
pm2 env 0

# Verify .env file
cat .env | grep -v "^#"

# Check file permissions
ls -la .env
```

**Solutions:**
```bash
# Fix environment file
chmod 600 .env
chown taskmaster:taskmaster .env

# Restart with environment
pm2 restart taskmaster --update-env

# Verify variables are loaded
pm2 show taskmaster
```

### SSL/TLS Issues

#### Issue: SSL Certificate Problems
```
Error: certificate verify failed
```

**Diagnosis:**
```bash
# Check certificate validity
openssl x509 -in /path/to/cert.pem -text -noout

# Test SSL connection
openssl s_client -connect yourdomain.com:443

# Check certificate chain
curl -vI https://yourdomain.com
```

**Solutions:**
```bash
# Renew certificate
sudo certbot renew

# Fix certificate chain
# Ensure intermediate certificates are included

# Update certificate paths
sudo nginx -t
sudo systemctl reload nginx
```

## Monitoring and Logging

### Log Analysis Issues

#### Issue: Missing Log Entries
**Symptoms:** Expected log entries not appearing

**Diagnosis:**
```bash
# Check log configuration
cat config/logging.json

# Verify log file permissions
ls -la logs/

# Check log rotation
cat /etc/logrotate.d/taskmaster
```

**Solutions:**
```bash
# Fix log permissions
sudo chown -R taskmaster:taskmaster logs/
chmod 755 logs/

# Restart logging service
pm2 restart taskmaster

# Check log level
export LOG_LEVEL=debug
```

#### Issue: Log File Growth
**Symptoms:** Log files consuming excessive disk space

**Diagnosis:**
```bash
# Check log file sizes
du -sh logs/*

# Check disk usage
df -h

# Find large log files
find logs/ -size +100M -ls
```

**Solutions:**
```bash
# Implement log rotation
sudo logrotate -f /etc/logrotate.d/taskmaster

# Compress old logs
gzip logs/*.log.1

# Adjust log level
export LOG_LEVEL=warn
```

### Monitoring System Issues

#### Issue: Metrics Collection Failures
**Symptoms:** Performance metrics not being collected

**Diagnosis:**
```bash
# Check monitoring service
ps aux | grep monitoring

# Test metrics endpoint
curl http://localhost:3000/metrics

# Check monitoring configuration
cat deployment/configs/monitoring.json
```

**Solutions:**
```bash
# Restart monitoring
pm2 restart monitoring

# Fix metrics endpoint
# Ensure metrics endpoint is properly implemented

# Check monitoring dependencies
npm ls prometheus-client
```

## Emergency Procedures

### System Recovery

#### Complete System Failure
1. **Immediate Response**
   ```bash
   # Check system status
   sudo systemctl status
   
   # Check disk space
   df -h
   
   # Check memory
   free -h
   ```

2. **Service Recovery**
   ```bash
   # Restart database
   sudo systemctl restart postgresql
   
   # Restart application
   pm2 restart all
   
   # Restart web server
   sudo systemctl restart nginx
   ```

3. **Data Recovery**
   ```bash
   # Restore from backup if needed
   gunzip -c /var/backups/postgresql/latest.backup.gz | \
   pg_restore -h localhost -U taskmaster_user -d taskmaster --clean
   ```

#### Security Incident Response

1. **Immediate Actions**
   ```bash
   # Block suspicious IPs
   sudo ufw deny from <suspicious-ip>
   
   # Check for unauthorized access
   sudo grep "Failed password" /var/log/auth.log
   
   # Review recent logins
   last -n 20
   ```

2. **System Isolation**
   ```bash
   # Disable external access
   sudo ufw deny 80
   sudo ufw deny 443
   
   # Stop application
   pm2 stop all
   ```

3. **Investigation**
   ```bash
   # Collect logs
   tar -czf incident-logs-$(date +%Y%m%d).tar.gz logs/
   
   # Check file integrity
   find /home/taskmaster/claude-task-master -type f -exec md5sum {} \;
   ```

### Escalation Procedures

#### When to Escalate
- System completely unresponsive
- Data corruption detected
- Security breach confirmed
- Multiple critical systems failing

#### Escalation Contacts
1. **Technical Lead**: Immediate technical decisions
2. **Security Team**: Security incidents
3. **Infrastructure Team**: Hardware/network issues
4. **Management**: Business impact decisions

#### Communication Template
```
INCIDENT ALERT

Severity: [Critical/High/Medium/Low]
System: Claude Task Master
Time: [Timestamp]
Impact: [Description of impact]
Status: [Investigating/Mitigating/Resolved]

Description:
[Brief description of the issue]

Actions Taken:
[List of actions taken so far]

Next Steps:
[Planned next steps]

ETA for Resolution:
[Estimated time for resolution]
```

## Conclusion

This troubleshooting guide covers the most common issues encountered with the claude-task-master system. For issues not covered in this guide:

1. Check the system logs for additional error details
2. Review the integration test reports for specific failure patterns
3. Consult the deployment and performance guides for optimization tips
4. Contact the development team with detailed error information

Remember to always:
- Document any new issues and their solutions
- Update monitoring and alerting based on recurring issues
- Perform regular system health checks
- Keep backups current and test recovery procedures

For additional support, refer to:
- [Integration Testing Guide](../integration/integration-testing-guide.md)
- [Deployment Guide](../deployment/deployment-guide.md)
- [Performance Guide](../performance/performance-guide.md)

