# Infrastructure Configuration

## 🌐 Cloudflare Database Proxy Integration

This directory contains the complete Cloudflare proxy configuration for secure PostgreSQL database access. The integration provides SSL/TLS termination, DDoS protection, access control, and performance optimization for external database connections.

## 📁 Directory Structure

```
infrastructure/
├── README.md                         # This documentation
├── cloudflare/                       # Cloudflare configuration
│   ├── proxy_config.js               # Main proxy configuration
│   ├── ssl_config.js                 # SSL/TLS settings
│   └── access_rules.js               # Security and access control
└── database/                         # Database connection config
    ├── connection_config.js           # Enhanced connection settings
    └── environment_config.js          # Environment-specific configs
```

## 🔧 Configuration Overview

### Cloudflare Proxy Configuration

The Cloudflare proxy acts as a secure gateway between external services (Codegen, Linear, Claude Code, AgentAPI) and the PostgreSQL database. It provides:

- **SSL/TLS Termination**: Automatic certificate management and encryption
- **DDoS Protection**: Layer 3/4 and Layer 7 attack mitigation
- **Access Control**: IP whitelisting, geographic restrictions, and bot management
- **Rate Limiting**: Configurable limits per service and IP
- **Performance Optimization**: Connection pooling and smart routing
- **Monitoring**: Real-time analytics and alerting

### Key Features

#### 1. Secure Database Access
- End-to-end encryption with TLS 1.2/1.3
- Certificate validation and OCSP stapling
- Mutual TLS support for high-security environments
- Automatic certificate renewal

#### 2. Advanced Security
- IP-based access control with whitelist/blacklist
- Geographic restrictions by country/continent
- Bot detection and management
- SQL injection pattern detection
- Behavioral analysis for suspicious activity

#### 3. Performance & Reliability
- Global edge network for low latency
- Automatic failover and load balancing
- Connection pooling at the edge
- Smart routing with Argo
- Health checks and monitoring

#### 4. Monitoring & Analytics
- Real-time connection metrics
- Performance analytics
- Security event logging
- Custom alerts and notifications
- Integration with external SIEM systems

## 🚀 Quick Setup

### 1. Environment Variables

Create a `.env` file with the following variables:

```bash
# Cloudflare Configuration
CLOUDFLARE_PROXY_ENABLED=true
CLOUDFLARE_PROXY_HOSTNAME=db-proxy.your-domain.com
CLOUDFLARE_ZONE_ID=your-zone-id
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id

# Database Configuration
DB_HOST=your-database-host
DB_PORT=5432
DB_NAME=codegen-taskmaster-db
DB_USER=postgres
DB_PASSWORD=your-secure-password

# SSL Configuration
DB_SSL_ENABLED=true
DB_SSL_MODE=require
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
SSL_CA_BUNDLE_PATH=/path/to/ca-bundle.pem

# Security Configuration
CLOUDFLARE_ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8
CLOUDFLARE_ALLOWED_COUNTRIES=US,CA,GB,DE,FR,AU,JP
CLOUDFLARE_BLOCKED_IPS=
CLOUDFLARE_BLOCKED_COUNTRIES=

# Service-specific IPs
CODEGEN_IP_RANGE=0.0.0.0/0
CLAUDE_CODE_IP_RANGE=0.0.0.0/0
AGENTAPI_IP_RANGE=0.0.0.0/0

# Monitoring & Alerts
CLOUDFLARE_LOG_LEVEL=info
DB_ALERT_EMAIL=admin@your-domain.com
DB_ALERT_WEBHOOK=https://your-webhook-url.com
CLOUDFLARE_ALERT_SLACK_WEBHOOK=https://hooks.slack.com/your-webhook
```

### 2. Initialize Configuration

```javascript
import { getCloudflareConfig, validateCloudflareConfig } from './cloudflare/proxy_config.js';
import { getSSLConfig, validateSSLConfig } from './cloudflare/ssl_config.js';
import { getAccessRulesConfig, validateAccessRulesConfig } from './cloudflare/access_rules.js';
import { getDatabaseConfig, validateDatabaseConfig } from './database/connection_config.js';

// Get environment-specific configurations
const environment = process.env.NODE_ENV || 'development';
const cloudflareConfig = getCloudflareConfig(environment);
const sslConfig = getSSLConfig(environment);
const accessRulesConfig = getAccessRulesConfig(environment);
const databaseConfig = getDatabaseConfig(environment);

// Validate configurations
const validations = [
    validateCloudflareConfig(cloudflareConfig),
    validateSSLConfig(sslConfig),
    validateAccessRulesConfig(accessRulesConfig),
    validateDatabaseConfig(databaseConfig)
];

// Check for validation errors
const errors = validations.flatMap(v => v.errors);
const warnings = validations.flatMap(v => v.warnings);

if (errors.length > 0) {
    console.error('Configuration errors:', errors);
    process.exit(1);
}

if (warnings.length > 0) {
    console.warn('Configuration warnings:', warnings);
}

console.log('✅ Configuration validated successfully');
```

### 3. Database Connection with Cloudflare

```javascript
import { initializeDatabase } from '../src/ai_cicd_system/database/connection.js';
import { getDatabaseConfig } from './database/connection_config.js';

// Initialize database with Cloudflare proxy
const config = getDatabaseConfig(process.env.NODE_ENV);
const connection = await initializeDatabase(config);

// Test connection
const result = await connection.query('SELECT NOW() as timestamp, version() as version');
console.log('Database connected:', result.rows[0]);

// Check health
const health = connection.getHealth();
console.log('Connection health:', health);
```

## 🔐 Security Configuration

### IP Access Control

Configure IP-based access control in `cloudflare/access_rules.js`:

```javascript
// Whitelist specific services
whitelist: {
    rules: [
        {
            ip: '35.231.147.226/32', // Linear webhook IP
            action: 'allow',
            description: 'Linear webhook access',
            priority: 1
        },
        {
            ip: process.env.CODEGEN_IP_RANGE,
            action: 'allow',
            description: 'Codegen service access',
            priority: 2
        }
    ]
}
```

### Geographic Restrictions

```javascript
// Allow specific countries
country_access: {
    mode: 'whitelist',
    allowed_countries: ['US', 'CA', 'GB', 'DE', 'FR'],
    blocked_countries: [],
    block_action: 'block'
}
```

### Rate Limiting

```javascript
// Service-specific rate limits
service_limits: {
    codegen: {
        connections_per_minute: 50,
        connections_per_hour: 500,
        identifier: 'user-agent',
        identifier_value: 'codegen-bot'
    },
    linear_webhooks: {
        connections_per_minute: 20,
        connections_per_hour: 200,
        allowed_ips: ['35.231.147.226/32']
    }
}
```

## 🔒 SSL/TLS Configuration

### Certificate Management

The SSL configuration supports multiple certificate types:

#### 1. Cloudflare Origin Certificates (Recommended)

```javascript
// Automatic certificate management
cloudflare_origin: {
    enabled: true,
    validity_days: 365,
    common_name: process.env.DB_HOST,
    san_list: [
        process.env.DB_HOST,
        process.env.CLOUDFLARE_PROXY_HOSTNAME
    ],
    auto_renew: true,
    renew_days_before_expiry: 30
}
```

#### 2. Custom Certificates

```javascript
// Custom certificate configuration
custom: {
    enabled: true,
    certificate_path: process.env.SSL_CERT_PATH,
    private_key_path: process.env.SSL_KEY_PATH,
    ca_bundle_path: process.env.SSL_CA_BUNDLE_PATH,
    validate_before_use: true
}
```

### TLS Security Settings

```javascript
// TLS configuration
tls: {
    min_version: '1.2',
    max_version: '1.3',
    cipher_suites_tls12: [
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384'
    ]
}
```

## 📊 Monitoring & Analytics

### Real-time Monitoring

Enable comprehensive monitoring:

```javascript
monitoring: {
    real_time: {
        enabled: true,
        metrics: [
            'connection_attempts',
            'blocked_connections',
            'challenged_connections',
            'error_rate',
            'response_time'
        ]
    }
}
```

### Alert Configuration

```javascript
alerts: {
    conditions: {
        high_block_rate: {
            threshold: 10, // percentage
            duration_minutes: 5,
            action: 'notify'
        },
        ddos_attack: {
            threshold: 1000, // requests per minute
            duration_minutes: 1,
            action: 'emergency_notify'
        }
    },
    notifications: {
        email: process.env.DB_ALERT_EMAIL,
        webhook: process.env.DB_ALERT_WEBHOOK,
        slack: process.env.CLOUDFLARE_ALERT_SLACK_WEBHOOK
    }
}
```

### Performance Metrics

Track key performance indicators:

- **Connection Success Rate**: > 99.9%
- **Average Response Time**: < 50ms
- **SSL Handshake Time**: < 100ms
- **Blocked Request Rate**: < 1%
- **Geographic Distribution**: Monitor access patterns

## 🌍 Environment-Specific Configurations

### Development Environment

```javascript
development: {
    ssl: {
        mode: 'flexible',
        certificates: {
            allow_self_signed: true,
            verify_server_cert: false
        }
    },
    security: {
        ip_access_rules: {
            enabled: false
        },
        ddos_protection: {
            enabled: false
        }
    }
}
```

### Staging Environment

```javascript
staging: {
    ssl: {
        mode: 'full'
    },
    security: {
        ip_access_rules: {
            allowed_ips: ['192.168.1.0/24', '10.0.0.0/8']
        }
    },
    monitoring: {
        logging: {
            log_level: 'debug'
        }
    }
}
```

### Production Environment

```javascript
production: {
    ssl: {
        mode: 'strict',
        verification: {
            verify_origin: true,
            verify_client: false
        }
    },
    security: {
        ddos_protection: {
            sensitivity: 'high'
        },
        bot_management: {
            fight_mode: true
        }
    },
    performance: {
        argo: {
            enabled: true
        }
    }
}
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Connection Timeouts

**Symptoms**: Database connections timing out
**Causes**: 
- Cloudflare proxy misconfiguration
- SSL certificate issues
- Network connectivity problems

**Solutions**:
```bash
# Check Cloudflare proxy status
curl -I https://your-proxy-hostname.com

# Verify SSL certificate
openssl s_client -connect your-proxy-hostname.com:443 -servername your-proxy-hostname.com

# Test database connectivity
psql "postgresql://user:pass@proxy-hostname:5432/dbname?sslmode=require"
```

#### 2. SSL Certificate Errors

**Symptoms**: SSL handshake failures
**Causes**:
- Expired certificates
- Certificate chain issues
- Hostname mismatch

**Solutions**:
```javascript
// Check certificate expiration
import { validateSSLConfig } from './cloudflare/ssl_config.js';
const validation = validateSSLConfig();
console.log('SSL validation:', validation);

// Update certificate paths
process.env.SSL_CERT_PATH = '/new/path/to/cert.pem';
process.env.SSL_KEY_PATH = '/new/path/to/key.pem';
```

#### 3. Access Denied Errors

**Symptoms**: Connections blocked by Cloudflare
**Causes**:
- IP not in whitelist
- Geographic restrictions
- Rate limiting

**Solutions**:
```javascript
// Add IP to whitelist
const accessConfig = getAccessRulesConfig();
accessConfig.ip_access_rules.whitelist.rules.push({
    ip: 'new.ip.address/32',
    action: 'allow',
    description: 'New service IP'
});

// Check rate limits
console.log('Rate limits:', accessConfig.rate_limiting);
```

### Health Checks

```javascript
// Comprehensive health check
async function healthCheck() {
    try {
        // Test Cloudflare proxy
        const response = await fetch(`https://${process.env.CLOUDFLARE_PROXY_HOSTNAME}/health`);
        console.log('Proxy status:', response.status);
        
        // Test database connection
        const db = getConnection();
        const result = await db.query('SELECT 1 as health');
        console.log('Database health:', result.rows[0]);
        
        // Check SSL certificate
        const sslConfig = getSSLConfig();
        const sslValidation = validateSSLConfig(sslConfig);
        console.log('SSL status:', sslValidation.valid ? 'OK' : 'Issues found');
        
        return { status: 'healthy' };
    } catch (error) {
        console.error('Health check failed:', error);
        return { status: 'unhealthy', error: error.message };
    }
}

// Run health check
const health = await healthCheck();
console.log('System health:', health);
```

## 📈 Performance Optimization

### Connection Pooling

Optimize connection pool settings:

```javascript
pool: {
    min: 5,                    // Minimum connections
    max: 20,                   // Maximum connections
    acquireTimeoutMillis: 30000, // 30 seconds
    idleTimeoutMillis: 30000,    // 30 seconds
    
    // Validation
    validate: {
        enabled: true,
        query: 'SELECT 1',
        interval_ms: 30000
    }
}
```

### Cloudflare Optimization

```javascript
performance: {
    // Connection pooling at edge
    connection_pooling: {
        enabled: true,
        max_connections: 100,
        idle_timeout: 300
    },
    
    // Argo Smart Routing
    argo: {
        enabled: true,
        smart_routing: true
    }
}
```

### Monitoring Performance

```javascript
// Performance monitoring
setInterval(async () => {
    const metrics = connection.getMetrics();
    console.log('Performance metrics:', {
        avgExecutionTime: metrics.avgExecutionTime,
        successRate: metrics.successRate,
        slowQueryRate: metrics.slowQueryRate
    });
}, 60000); // Every minute
```

## 🔄 Deployment

### 1. Pre-deployment Checklist

- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Cloudflare DNS configured
- [ ] IP whitelist updated
- [ ] Rate limits configured
- [ ] Monitoring enabled
- [ ] Backup strategy in place

### 2. Deployment Steps

```bash
# 1. Validate configuration
node -e "
import('./infrastructure/cloudflare/proxy_config.js').then(({ validateCloudflareConfig }) => {
  const validation = validateCloudflareConfig();
  console.log('Validation:', validation);
});
"

# 2. Test database connection
node -e "
import('./src/ai_cicd_system/database/connection.js').then(async ({ initializeDatabase }) => {
  const db = await initializeDatabase();
  const result = await db.query('SELECT NOW()');
  console.log('Database test:', result.rows[0]);
});
"

# 3. Deploy Cloudflare configuration
# (This would typically be done through Cloudflare API or dashboard)

# 4. Update DNS records
# Point your proxy hostname to Cloudflare

# 5. Test end-to-end connectivity
curl -v "https://${CLOUDFLARE_PROXY_HOSTNAME}/health"
```

### 3. Post-deployment Verification

```javascript
// Comprehensive deployment test
async function deploymentTest() {
    const tests = [
        // Test 1: Basic connectivity
        async () => {
            const db = getConnection();
            await db.query('SELECT 1');
            return 'Database connectivity: OK';
        },
        
        // Test 2: SSL verification
        async () => {
            const sslConfig = getSSLConfig();
            const validation = validateSSLConfig(sslConfig);
            return `SSL configuration: ${validation.valid ? 'OK' : 'FAILED'}`;
        },
        
        // Test 3: Access rules
        async () => {
            const accessConfig = getAccessRulesConfig();
            const validation = validateAccessRulesConfig(accessConfig);
            return `Access rules: ${validation.valid ? 'OK' : 'FAILED'}`;
        },
        
        // Test 4: Performance
        async () => {
            const start = Date.now();
            await db.query('SELECT COUNT(*) FROM tasks');
            const duration = Date.now() - start;
            return `Query performance: ${duration}ms`;
        }
    ];
    
    for (const test of tests) {
        try {
            const result = await test();
            console.log('✅', result);
        } catch (error) {
            console.error('❌', error.message);
        }
    }
}

await deploymentTest();
```

## 📚 API Reference

### Configuration Functions

#### Cloudflare Proxy
- `getCloudflareConfig(environment)`: Get environment-specific config
- `validateCloudflareConfig(config)`: Validate configuration
- `mergeDeep(target, source)`: Deep merge configurations

#### SSL/TLS
- `getSSLConfig(environment)`: Get SSL configuration
- `validateSSLConfig(config)`: Validate SSL settings
- `generatePostgreSQLSSLConfig(options)`: Generate PostgreSQL SSL config

#### Access Rules
- `getAccessRulesConfig(environment)`: Get access rules
- `validateAccessRulesConfig(config)`: Validate access rules

#### Database Connection
- `getDatabaseConfig(environment)`: Get database configuration
- `generateConnectionString(config)`: Generate connection string
- `validateDatabaseConfig(config)`: Validate database settings

### Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CLOUDFLARE_PROXY_ENABLED` | Enable Cloudflare proxy | `false` | No |
| `CLOUDFLARE_PROXY_HOSTNAME` | Proxy hostname | - | Yes* |
| `CLOUDFLARE_ZONE_ID` | Cloudflare Zone ID | - | Yes* |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token | - | Yes* |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID | - | Yes* |
| `DB_HOST` | Database host | `localhost` | Yes |
| `DB_PORT` | Database port | `5432` | No |
| `DB_NAME` | Database name | - | Yes |
| `DB_USER` | Database user | - | Yes |
| `DB_PASSWORD` | Database password | - | Yes |
| `DB_SSL_ENABLED` | Enable SSL | `true` | No |
| `DB_SSL_MODE` | SSL mode | `require` | No |
| `CLOUDFLARE_ALLOWED_IPS` | Allowed IP ranges | - | No |
| `CLOUDFLARE_ALLOWED_COUNTRIES` | Allowed countries | `US,CA,GB,DE,FR` | No |

*Required when `CLOUDFLARE_PROXY_ENABLED=true`

## 🤝 Contributing

When contributing to the infrastructure configuration:

1. **Test Thoroughly**: Test all configuration changes in development first
2. **Document Changes**: Update this README for any new features
3. **Security Review**: Have security-related changes reviewed
4. **Performance Impact**: Consider performance implications
5. **Backward Compatibility**: Ensure changes don't break existing deployments

## 📄 License

This infrastructure configuration is part of the Claude Task Master project and follows the same licensing terms.

