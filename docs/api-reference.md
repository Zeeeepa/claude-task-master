# Task Master API Reference

## Overview

Task Master provides a comprehensive REST API and WebSocket interface for managing AI-driven development workflows. The API is organized into several main sections:

- **AgentAPI**: Core agent communication and session management
- **Orchestrator**: System monitoring and coordination
- **Workflow**: Workflow creation and management
- **Integration**: External service integration endpoints

## Base URL

```
http://localhost:3001/api/v1
```

## Authentication

All API requests require authentication via Bearer token:

```http
Authorization: Bearer <your-token>
X-Org-ID: <your-org-id>
```

## Common Response Format

All API responses follow this structure:

```json
{
  "success": true|false,
  "data": <response-data>,
  "error": "<error-message>",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "requestId": "req_123456789"
}
```

## AgentAPI Endpoints

### Session Management

#### Create Session

```http
POST /sessions
```

**Request Body:**
```json
{
  "agentType": "codegen|claude|custom",
  "configuration": {
    "capabilities": ["code_generation", "file_operations"],
    "timeout": 30000,
    "maxConcurrentTasks": 5
  }
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "session_123456789",
    "agentType": "codegen",
    "status": "active",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "configuration": {...}
  }
}
```

#### Get Session

```http
GET /sessions/{sessionId}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "session_123456789",
    "agentType": "codegen",
    "status": "active",
    "lastActivity": "2024-01-01T00:00:00.000Z",
    "webSocketCount": 2,
    "eventSubscriptions": ["task.completed", "workflow.started"]
  }
}
```

#### Delete Session

```http
DELETE /sessions/{sessionId}
```

**Response:**
```json
{
  "success": true,
  "message": "Session deleted"
}
```

### Message Processing

#### Send Message

```http
POST /sessions/{sessionId}/messages
```

**Request Body:**
```json
{
  "content": "Generate a React component for user authentication",
  "metadata": {
    "type": "code_generation",
    "priority": "high",
    "context": {
      "framework": "react",
      "typescript": true
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "response": {
    "type": "code_response",
    "content": "// Generated React component code...",
    "metadata": {
      "processingTime": 1500,
      "tokensUsed": 250
    }
  }
}
```

#### Get Messages

```http
GET /sessions/{sessionId}/messages?limit=50&offset=0
```

**Response:**
```json
{
  "success": true,
  "messages": [
    {
      "id": "msg_123456789",
      "content": "Generate a React component...",
      "response": {...},
      "status": "completed",
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Claude Code Integration

#### Execute Claude Command

```http
POST /claude/execute
```

**Request Body:**
```json
{
  "command": "generate_code",
  "parameters": {
    "prompt": "Create a user authentication system",
    "context": {
      "language": "javascript",
      "framework": "express"
    }
  },
  "sessionId": "session_123456789"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "code": "// Generated authentication code...",
    "files": ["auth.js", "middleware.js"],
    "dependencies": ["bcrypt", "jsonwebtoken"]
  }
}
```

#### Confirm Claude Action

```http
POST /claude/confirm
```

**Request Body:**
```json
{
  "actionId": "action_123456789",
  "confirmed": true,
  "sessionId": "session_123456789"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "actionId": "action_123456789",
    "status": "confirmed",
    "executedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Get Claude Status

```http
GET /claude/status
```

**Response:**
```json
{
  "success": true,
  "status": {
    "isConnected": true,
    "processId": 12345,
    "workingDirectory": "/path/to/project",
    "pendingActions": 2
  }
}
```

## Agent Management

### List Agents

```http
GET /agents
```

**Response:**
```json
{
  "success": true,
  "agents": [
    {
      "id": "agent_123456789",
      "type": "codegen",
      "status": "active",
      "capabilities": ["code_generation", "repository_operations"],
      "currentTasks": 3,
      "maxConcurrentTasks": 5,
      "load": 0.6
    }
  ]
}
```

### Submit Task to Agent

```http
POST /agents/{agentId}/tasks
```

**Request Body:**
```json
{
  "type": "code_generation",
  "description": "Implement user authentication API",
  "requirements": [
    "Use JWT tokens",
    "Include password hashing",
    "Add rate limiting"
  ],
  "priority": "high",
  "context": {
    "repository": "user-service",
    "branch": "feature/auth"
  }
}
```

**Response:**
```json
{
  "success": true,
  "taskId": "task_123456789",
  "estimatedDuration": 1800000,
  "assignedAt": "2024-01-01T00:00:00.000Z"
}
```

### Get Agent Status

```http
GET /agents/{agentId}/status
```

**Response:**
```json
{
  "success": true,
  "status": {
    "id": "agent_123456789",
    "status": "active",
    "currentTasks": [
      {
        "id": "task_123456789",
        "type": "code_generation",
        "startedAt": "2024-01-01T00:00:00.000Z",
        "progress": 0.75
      }
    ],
    "lastHeartbeat": "2024-01-01T00:00:00.000Z"
  }
}
```

## Workflow Management

### Create Workflow

```http
POST /workflows
```

**Request Body:**
```json
{
  "templateId": "development",
  "workflowData": {
    "name": "User Service Development",
    "context": {
      "repository": "user-service",
      "requirements": "Implement authentication system"
    },
    "stepData": {
      "analyze_requirements": {
        "priority": "high"
      }
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "workflowId": "workflow_123456789",
  "status": "created",
  "estimatedDuration": 3600000
}
```

### Get Workflow

```http
GET /workflows/{workflowId}
```

**Response:**
```json
{
  "success": true,
  "workflow": {
    "id": "workflow_123456789",
    "templateId": "development",
    "name": "User Service Development",
    "status": "running",
    "steps": [
      {
        "id": "analyze_requirements",
        "name": "Analyze Requirements",
        "status": "completed",
        "result": {...}
      },
      {
        "id": "create_tasks",
        "name": "Create Tasks",
        "status": "running",
        "progress": 0.5
      }
    ],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "startedAt": "2024-01-01T00:00:05.000Z"
  }
}
```

### Start Workflow

```http
POST /workflows/{workflowId}/start
```

**Request Body:**
```json
{
  "executionContext": {
    "priority": "high",
    "timeout": 7200000,
    "notifications": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Workflow started",
  "startedAt": "2024-01-01T00:00:00.000Z"
}
```

### Pause Workflow

```http
POST /workflows/{workflowId}/pause
```

**Response:**
```json
{
  "success": true,
  "message": "Workflow paused",
  "pausedAt": "2024-01-01T00:00:00.000Z"
}
```

### Resume Workflow

```http
POST /workflows/{workflowId}/resume
```

**Response:**
```json
{
  "success": true,
  "message": "Workflow resumed",
  "resumedAt": "2024-01-01T00:00:00.000Z"
}
```

## System Monitoring

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "components": {
    "database": "healthy",
    "claudeInterface": "healthy",
    "codegenSDK": "healthy"
  }
}
```

### System Status

```http
GET /system/status
```

**Response:**
```json
{
  "success": true,
  "status": {
    "orchestrator": {
      "systemWatcher": {
        "isRunning": true,
        "processCount": 5,
        "workflowCount": 3,
        "healthStatus": "healthy"
      },
      "coordinationEngine": {
        "isRunning": true,
        "agentCount": 3,
        "queuedTasks": 2,
        "activeTasks": 5
      }
    },
    "middleware": {
      "agentAPI": {
        "isRunning": true,
        "port": 3001,
        "connections": 8
      }
    }
  }
}
```

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3001/ws?sessionId=session_123456789');
```

### Message Types

#### Ping/Pong

```json
// Send
{
  "type": "ping"
}

// Receive
{
  "type": "pong",
  "timestamp": 1640995200000
}
```

#### Send Message

```json
{
  "type": "message",
  "content": "Generate a React component",
  "metadata": {
    "priority": "high"
  }
}
```

#### Subscribe to Events

```json
{
  "type": "subscribe",
  "events": ["task.completed", "workflow.started", "agent.status"]
}
```

#### Event Notifications

```json
{
  "type": "event",
  "eventType": "task.completed",
  "data": {
    "taskId": "task_123456789",
    "result": {...},
    "duration": 1500
  },
  "timestamp": 1640995200000
}
```

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid request format |
| 401 | Unauthorized - Invalid or missing authentication |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 409 | Conflict - Resource already exists |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server error |
| 502 | Bad Gateway - External service error |
| 503 | Service Unavailable - Service temporarily unavailable |

## Rate Limiting

API requests are rate limited to prevent abuse:

- **Default**: 100 requests per 15 minutes per IP
- **Authenticated**: 1000 requests per 15 minutes per token
- **WebSocket**: 50 messages per minute per connection

Rate limit headers are included in responses:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## SDK Examples

### JavaScript/Node.js

```javascript
const TaskMasterClient = require('@taskmaster/sdk');

const client = new TaskMasterClient({
  baseUrl: 'http://localhost:3001/api/v1',
  token: 'your-token',
  orgId: 'your-org-id'
});

// Create session
const session = await client.sessions.create({
  agentType: 'codegen',
  configuration: {
    capabilities: ['code_generation']
  }
});

// Send message
const response = await client.sessions.sendMessage(session.id, {
  content: 'Generate a React component',
  metadata: { type: 'code_generation' }
});

console.log(response.content);
```

### Python

```python
from taskmaster_sdk import TaskMasterClient

client = TaskMasterClient(
    base_url='http://localhost:3001/api/v1',
    token='your-token',
    org_id='your-org-id'
)

# Create session
session = client.sessions.create(
    agent_type='codegen',
    configuration={
        'capabilities': ['code_generation']
    }
)

# Send message
response = client.sessions.send_message(
    session['id'],
    content='Generate a React component',
    metadata={'type': 'code_generation'}
)

print(response['content'])
```

## Webhooks

Task Master can send webhooks for various events:

### Configuration

```json
{
  "webhooks": {
    "url": "https://your-app.com/webhooks/taskmaster",
    "secret": "your-webhook-secret",
    "events": [
      "task.completed",
      "workflow.finished",
      "agent.error"
    ]
  }
}
```

### Webhook Payload

```json
{
  "event": "task.completed",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "data": {
    "taskId": "task_123456789",
    "agentId": "agent_123456789",
    "result": {...},
    "duration": 1500
  },
  "signature": "sha256=..."
}
```

### Signature Verification

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}
```

