# AgentAPI Middleware

A comprehensive communication bridge between the System Orchestrator and Claude Code integration, enabling seamless data flow and command execution in the unified AI CI/CD system.

## 🎯 Overview

The AgentAPI Middleware serves as the central communication hub that:

- **Bridges Communication**: Facilitates seamless communication between System Orchestrator and Claude Code
- **Handles Authentication**: Provides secure JWT-based authentication with refresh tokens
- **Manages Rate Limiting**: Implements intelligent rate limiting and throttling
- **Transforms Data**: Ensures data integrity and format compatibility between components
- **Monitors Performance**: Provides comprehensive monitoring and health checking
- **Supports WebSocket**: Real-time communication via WebSocket connections

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     System      │    │    AgentAPI     │    │   Claude Code   │
│  Orchestrator   │◄──►│   Middleware    │◄──►│  Integration    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Database &    │
                       │   Monitoring    │
                       └─────────────────┘
```

## 🚀 Quick Start

### Basic Usage

```javascript
import { MiddlewareServer } from './src/integrations/agent-api/index.js';

// Create and start the middleware server
const server = new MiddlewareServer({
	port: 3001,
	enableWebSocket: true,
	logLevel: 'info'
});

await server.start();
console.log('AgentAPI Middleware started on port 3001');
```

### Advanced Configuration

```javascript
import {
	MiddlewareServer,
	getEnvironmentConfig
} from './src/integrations/agent-api/index.js';

// Get environment-specific configuration
const config = getEnvironmentConfig('production');

// Override specific settings
const customConfig = {
	...config,
	server: {
		...config.server,
		port: 3001,
		enableWebSocket: true
	},
	auth: {
		...config.auth,
		jwtSecret: process.env.JWT_SECRET,
		jwtExpiresIn: '2h'
	},
	rateLimit: {
		...config.rateLimit,
		maxRequests: 200,
		apiMaxRequests: 120
	}
};

const server = new MiddlewareServer(customConfig);
await server.start();
```

## 📋 API Endpoints

### Authentication

- `POST /api/v1/auth/login` - Authenticate user
- `POST /api/v1/auth/refresh` - Refresh access token
- `GET /api/v1/auth/validate` - Validate token
- `POST /api/v1/auth/logout` - Logout user

### System Orchestrator

- `POST /api/v1/orchestrator/workflow` - Send workflow command
- `GET /api/v1/orchestrator/workflow/:id/status` - Get workflow status
- `PUT /api/v1/orchestrator/workflow/:id/status` - Update workflow status

### Claude Code Integration

- `POST /api/v1/claude-code/analyze` - Forward analysis request
- `GET /api/v1/claude-code/status` - Get Claude Code status
- `POST /api/v1/claude-code/execute` - Execute Claude Code command

### Data Transformation

- `POST /api/v1/transform/to-claude-code` - Transform to Claude Code format
- `POST /api/v1/transform/from-claude-code` - Transform from Claude Code format
- `POST /api/v1/transform/validate` - Validate data format

### Monitoring

- `GET /api/v1/monitoring/metrics` - Get API metrics
- `GET /api/v1/monitoring/performance` - Get performance stats
- `GET /api/v1/monitoring/errors` - Get error logs

### Health & Info

- `GET /health` - Health check
- `GET /` - Server information

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
AGENT_API_PORT=3001
AGENT_API_HOST=localhost
AGENT_API_WEBSOCKET=true
AGENT_API_CORS=true
AGENT_API_LOG_LEVEL=info

# Authentication
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX_REQUESTS=10
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX_REQUESTS=60

# Integration Endpoints
ORCHESTRATOR_BASE_URL=http://localhost:3000
ORCHESTRATOR_API_KEY=your-orchestrator-api-key
CLAUDE_CODE_BASE_URL=http://localhost:3002
CLAUDE_CODE_API_KEY=your-claude-code-api-key

# Database (Optional)
DATABASE_URL=postgresql://user:pass@localhost:5432/agent_api
DB_HOST=localhost
DB_PORT=5432
DB_NAME=agent_api
DB_USERNAME=postgres
DB_PASSWORD=your-password

# Redis (Optional)
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
```

### Configuration File

```javascript
import { getConfig } from './src/integrations/agent-api/config.js';

const config = getConfig({
	server: {
		port: 3001,
		enableWebSocket: true,
		logLevel: 'debug'
	},
	auth: {
		jwtExpiresIn: '2h',
		maxLoginAttempts: 3
	},
	rateLimit: {
		maxRequests: 200,
		apiMaxRequests: 120
	}
});
```

## 🔐 Authentication

The middleware uses JWT-based authentication with refresh tokens:

### Login

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

### Using API Key

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "api-user",
    "apiKey": "your-api-key-here"
  }'
```

### Accessing Protected Endpoints

```bash
curl -X GET http://localhost:3001/api/v1/monitoring/metrics \
  -H "Authorization: Bearer your-jwt-token-here"
```

## 🌐 WebSocket Support

The middleware supports WebSocket connections for real-time communication:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

// Authenticate
ws.send(
	JSON.stringify({
		type: 'auth',
		token: 'your-jwt-token'
	})
);

// Subscribe to events
ws.send(
	JSON.stringify({
		type: 'subscribe',
		channel: 'workflow-updates'
	})
);

// Handle messages
ws.onmessage = (event) => {
	const message = JSON.parse(event.data);
	console.log('Received:', message);
};
```

## 📊 Data Transformation

The middleware automatically transforms data between different component formats:

### Workflow Command → Claude Code Request

```javascript
// Input (from System Orchestrator)
{
  "workflowId": "workflow-123",
  "command": "analyze",
  "payload": {
    "codebase": {
      "repository": "https://github.com/example/repo.git",
      "branch": "main"
    }
  },
  "priority": 5
}

// Output (to Claude Code)
{
  "action": "analyze",
  "codebase": {
    "type": "git",
    "source": "https://github.com/example/repo.git",
    "ref": "main",
    "path": "."
  },
  "options": {
    "analysisDepth": "medium",
    "includeTests": true,
    "outputFormat": "json"
  },
  "context": {
    "requestId": "workflow-123",
    "timestamp": "2025-05-28T15:13:32.000Z"
  }
}
```

## 🚦 Rate Limiting

The middleware implements multiple layers of rate limiting:

- **Global Rate Limiting**: 100 requests per 15 minutes per IP
- **Authentication Rate Limiting**: 10 login attempts per 15 minutes per IP
- **API Rate Limiting**: 60 requests per minute per user/IP
- **Slow Down**: Progressive delays after 50 requests

### Custom Rate Limiting

```javascript
import { RateLimiter } from './src/integrations/agent-api/index.js';

const rateLimiter = new RateLimiter({
	maxRequests: 200,
	windowMs: 15 * 60 * 1000
});

// Use custom rate limiting middleware
app.use(
	'/api/premium',
	rateLimiter.customRateLimit({
		maxRequests: 500,
		windowMs: 15 * 60 * 1000,
		condition: (req) => req.user?.role === 'premium'
	})
);
```

## 📈 Monitoring

### Health Check

```bash
curl http://localhost:3001/health
```

Response:

```json
{
	"status": "healthy",
	"timestamp": "2025-05-28T15:13:32.000Z",
	"uptime": 3600,
	"version": "1.0.0",
	"environment": "production"
}
```

### Metrics

```bash
curl -H "Authorization: Bearer token" \
  http://localhost:3001/api/v1/monitoring/metrics
```

### Performance Stats

```bash
curl -H "Authorization: Bearer token" \
  http://localhost:3001/api/v1/monitoring/performance
```

## 🧪 Testing

Run the test suite:

```bash
npm test src/integrations/agent-api/tests/
```

Run specific test file:

```bash
npm test src/integrations/agent-api/tests/middleware-server.test.js
```

## 🔧 Development

### Running Examples

```bash
node src/integrations/agent-api/example.js
```

### Debug Mode

```bash
NODE_ENV=development AGENT_API_LOG_LEVEL=debug node your-app.js
```

## 🚀 Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
EXPOSE 3001

CMD ["node", "src/integrations/agent-api/example.js"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  agent-api:
    build: .
    ports:
      - '3001:3001'
    environment:
      - NODE_ENV=production
      - JWT_SECRET=your-secret-key
      - DATABASE_URL=postgresql://user:pass@db:5432/agent_api
    depends_on:
      - db
      - redis

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=agent_api
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass

  redis:
    image: redis:7-alpine
```

## 📝 API Examples

### Send Workflow Command

```bash
curl -X POST http://localhost:3001/api/v1/orchestrator/workflow \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "workflowId": "workflow-123",
    "command": "analyze",
    "payload": {
      "codebase": {
        "repository": "https://github.com/example/repo.git",
        "branch": "main",
        "path": "src/"
      },
      "parameters": {
        "analysisType": "full",
        "includeTests": true
      }
    },
    "priority": 5
  }'
```

### Request Claude Code Analysis

```bash
curl -X POST http://localhost:3001/api/v1/claude-code/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "codebase": {
      "repository": "https://github.com/example/repo.git",
      "branch": "main"
    },
    "analysisType": "security",
    "options": {
      "depth": "deep",
      "includeTests": true,
      "format": "json"
    }
  }'
```

## 🤝 Integration

### With System Orchestrator

```javascript
import { WorkflowOrchestrator } from '../core/workflow_orchestrator.js';
import { MiddlewareServer } from './agent-api/index.js';

const orchestrator = new WorkflowOrchestrator();
const middleware = new MiddlewareServer({
	integrations: {
		orchestrator: {
			baseUrl: 'http://localhost:3000',
			apiKey: process.env.ORCHESTRATOR_API_KEY
		}
	}
});

await middleware.start();
```

### With Claude Code

```javascript
import { ClaudeCodeIntegration } from '../claude-code/index.js';
import { MiddlewareServer } from './agent-api/index.js';

const claudeCode = new ClaudeCodeIntegration();
const middleware = new MiddlewareServer({
	integrations: {
		claudeCode: {
			baseUrl: 'http://localhost:3002',
			apiKey: process.env.CLAUDE_CODE_API_KEY
		}
	}
});

await middleware.start();
```

## 🔒 Security

- JWT-based authentication with configurable expiration
- Refresh token rotation
- Rate limiting with progressive penalties
- Request/response logging with sensitive data redaction
- CORS protection
- Helmet security headers
- Input validation and sanitization

## 📊 Performance

- Request processing time < 200ms (target)
- API availability > 99.9% (target)
- Data transformation accuracy 100% (target)
- Authentication success rate > 99% (target)
- Rate limiting effectiveness > 95% (target)

## 🐛 Troubleshooting

### Common Issues

1. **Server won't start**

   - Check if port is already in use
   - Verify JWT_SECRET is set
   - Check file permissions

2. **Authentication fails**

   - Verify JWT_SECRET matches
   - Check token expiration
   - Validate user credentials

3. **Rate limiting too strict**
   - Adjust rate limit configuration
   - Check if IP is whitelisted
   - Review request patterns

### Debug Logging

```bash
AGENT_API_LOG_LEVEL=debug node your-app.js
```

## 📚 API Documentation

For detailed API documentation, see the [API Reference](./docs/api-reference.md).

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../../../LICENSE) file for details.
