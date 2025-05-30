# Component API Specifications

## OpenEvolve APIs

### Evolution Control API
- **Endpoint**: `/api/v1/evolution`
- **Method**: POST
- **Request Format**:
```json
{
  "initial_program": "string",
  "evaluation_criteria": {
    "metrics": ["performance", "complexity", "correctness"],
    "weights": [0.4, 0.3, 0.3]
  },
  "config": {
    "max_iterations": 1000,
    "population_size": 500,
    "temperature": 0.7
  }
}
```
- **Response Format**:
```json
{
  "evolution_id": "uuid",
  "status": "started|running|completed|failed",
  "current_iteration": 0,
  "best_program": {
    "code": "string",
    "metrics": {"performance": 0.85, "complexity": 0.6},
    "generation": 42
  }
}
```
- **Error Codes**: 400 (Invalid Config), 429 (Rate Limited), 500 (Evolution Failed)

### Program Database API
- **Endpoint**: `/api/v1/programs`
- **Method**: GET, POST, PUT, DELETE
- **Request Format** (POST):
```json
{
  "code": "string",
  "language": "python|javascript|java",
  "metrics": {"score": 0.85, "complexity": 0.6},
  "metadata": {"author": "system", "tags": ["optimized"]}
}
```
- **Response Format**:
```json
{
  "program_id": "uuid",
  "code": "string",
  "metrics": {"score": 0.85, "complexity": 0.6},
  "generation": 42,
  "parent_id": "uuid",
  "timestamp": "2025-05-30T14:19:31Z"
}
```
- **Rate Limits**: 1000 requests/hour for read operations, 100/hour for write operations

### Configuration API
- **Endpoint**: `/api/v1/config`
- **Method**: GET, PUT
- **Request Format**:
```json
{
  "llm": {
    "primary_model": "gemini-2.0-flash-lite",
    "temperature": 0.7,
    "max_tokens": 4096
  },
  "database": {
    "population_size": 1000,
    "num_islands": 5
  },
  "evaluator": {
    "timeout": 300,
    "max_retries": 3
  }
}
```
- **Response Format**: Same as request format with additional system-generated fields
- **Performance**: < 100ms response time for configuration retrieval

## Codegen APIs

### Code Generation API
- **Endpoint**: `/api/v1/generate`
- **Method**: POST
- **Request Format**:
```json
{
  "prompt": "string",
  "language": "python|typescript|javascript",
  "context": {
    "codebase_path": "/path/to/repo",
    "related_files": ["file1.py", "file2.py"],
    "requirements": "string"
  },
  "options": {
    "max_tokens": 2048,
    "temperature": 0.3,
    "include_tests": true
  }
}
```
- **Response Format**:
```json
{
  "generation_id": "uuid",
  "generated_code": "string",
  "confidence": 0.92,
  "suggestions": ["Add error handling", "Consider edge cases"],
  "metadata": {
    "model_used": "gpt-4",
    "tokens_used": 1024,
    "generation_time_ms": 2500
  }
}
```
- **Rate Limits**: 100 requests/minute per API key, 10,000 tokens/hour

### Codebase Analysis API
- **Endpoint**: `/api/v1/analyze`
- **Method**: POST
- **Request Format**:
```json
{
  "repository_url": "https://github.com/user/repo",
  "analysis_type": "structure|dependencies|quality|metrics",
  "scope": {
    "include_patterns": ["*.py", "*.js"],
    "exclude_patterns": ["test_*", "*.min.js"]
  }
}
```
- **Response Format**:
```json
{
  "analysis_id": "uuid",
  "results": {
    "file_count": 150,
    "language_distribution": {"python": 0.7, "javascript": 0.3},
    "complexity_metrics": {"cyclomatic": 12.5, "halstead": 8.2},
    "dependencies": [{"name": "requests", "version": "2.28.0"}],
    "issues": [{"type": "unused_import", "file": "main.py", "line": 5}]
  },
  "metadata": {
    "analysis_time_ms": 15000,
    "files_analyzed": 150
  }
}
```
- **Performance**: < 30 seconds for repositories under 1000 files

### Agent Management API
- **Endpoint**: `/api/v1/agents`
- **Method**: GET, POST, PUT, DELETE
- **Request Format** (POST):
```json
{
  "name": "code-reviewer",
  "type": "analysis|generation|refactoring",
  "config": {
    "model": "gpt-4",
    "specialization": "python",
    "capabilities": ["code_review", "bug_detection"]
  }
}
```
- **Response Format**:
```json
{
  "agent_id": "uuid",
  "name": "code-reviewer",
  "status": "active|inactive|busy",
  "capabilities": ["code_review", "bug_detection"],
  "performance_metrics": {
    "tasks_completed": 1250,
    "average_quality_score": 0.88,
    "uptime_percentage": 99.2
  }
}
```
- **Rate Limits**: 1000 requests/hour for agent operations

## Claude Code APIs

### Task Management API
- **Endpoint**: `/api/v1/tasks`
- **Method**: GET, POST, PUT, DELETE
- **Request Format** (POST):
```json
{
  "title": "Implement user authentication",
  "description": "Add OAuth 2.0 authentication with JWT tokens",
  "priority": "high|medium|low",
  "complexity": 1-10,
  "dependencies": ["task-123", "task-456"],
  "assignee": "developer-id",
  "estimated_hours": 8,
  "tags": ["backend", "security"]
}
```
- **Response Format**:
```json
{
  "task_id": "uuid",
  "title": "Implement user authentication",
  "status": "todo|in_progress|review|done",
  "created_at": "2025-05-30T14:19:31Z",
  "updated_at": "2025-05-30T14:19:31Z",
  "subtasks": [
    {
      "subtask_id": "uuid",
      "title": "Set up OAuth provider",
      "status": "todo",
      "estimated_hours": 2
    }
  ],
  "progress": {
    "completion_percentage": 25,
    "time_spent_hours": 2,
    "remaining_hours": 6
  }
}
```
- **Webhooks**: Task status changes, dependency updates, completion notifications

### PRD Processing API
- **Endpoint**: `/api/v1/prd/parse`
- **Method**: POST
- **Request Format**:
```json
{
  "prd_content": "string",
  "parsing_options": {
    "extract_requirements": true,
    "generate_tasks": true,
    "estimate_complexity": true,
    "identify_dependencies": true
  }
}
```
- **Response Format**:
```json
{
  "parsing_id": "uuid",
  "requirements": [
    {
      "id": "req-1",
      "title": "User Authentication",
      "description": "Users must be able to log in securely",
      "priority": "high",
      "acceptance_criteria": ["Login form", "Password validation"]
    }
  ],
  "generated_tasks": [
    {
      "task_id": "uuid",
      "title": "Implement login form",
      "complexity": 5,
      "estimated_hours": 4,
      "dependencies": []
    }
  ],
  "metadata": {
    "total_requirements": 15,
    "total_tasks": 42,
    "estimated_project_hours": 320
  }
}
```
- **Performance**: < 10 seconds for PRDs under 10,000 words

### AI Provider Management API
- **Endpoint**: `/api/v1/providers`
- **Method**: GET, POST, PUT
- **Request Format** (POST):
```json
{
  "provider": "anthropic|openai|google|perplexity",
  "model": "claude-3-sonnet|gpt-4|gemini-pro",
  "role": "main|research|fallback",
  "config": {
    "api_key": "encrypted_key",
    "temperature": 0.7,
    "max_tokens": 4096,
    "rate_limit": 100
  }
}
```
- **Response Format**:
```json
{
  "provider_id": "uuid",
  "provider": "anthropic",
  "model": "claude-3-sonnet",
  "status": "active|inactive|error",
  "usage_stats": {
    "requests_today": 1250,
    "tokens_used": 125000,
    "rate_limit_remaining": 75
  },
  "health_check": {
    "last_check": "2025-05-30T14:19:31Z",
    "response_time_ms": 250,
    "success_rate": 0.998
  }
}
```
- **Status Tracking**: Real-time provider health monitoring with automatic failover

### MCP Integration API
- **Endpoint**: `/api/v1/mcp`
- **Method**: POST
- **Request Format**:
```json
{
  "command": "initialize|execute|status",
  "editor": "cursor|windsurf|vscode",
  "context": {
    "project_path": "/path/to/project",
    "active_files": ["main.py", "config.yaml"],
    "cursor_position": {"line": 42, "column": 15}
  },
  "request": "Parse my PRD and create tasks"
}
```
- **Response Format**:
```json
{
  "mcp_session_id": "uuid",
  "command_result": {
    "success": true,
    "output": "Created 15 tasks from PRD analysis",
    "actions_taken": [
      "Parsed PRD file",
      "Generated task breakdown",
      "Updated task database"
    ]
  },
  "editor_integration": {
    "files_modified": ["tasks.json"],
    "notifications": ["Task creation complete"],
    "next_suggestions": ["Review generated tasks", "Start with task #1"]
  }
}
```
- **Result Formats**: Editor-specific formatting for seamless integration

## Cross-Component Integration APIs

### Unified Orchestration API
- **Endpoint**: `/api/v1/orchestrate`
- **Method**: POST
- **Request Format**:
```json
{
  "workflow_type": "full_development|code_optimization|task_automation",
  "input": {
    "prd_content": "string",
    "repository_url": "string",
    "optimization_goals": ["performance", "maintainability"]
  },
  "components": {
    "claude_code": {"enabled": true, "config": {}},
    "codegen": {"enabled": true, "config": {}},
    "openevolve": {"enabled": true, "config": {}}
  }
}
```
- **Response Format**:
```json
{
  "orchestration_id": "uuid",
  "workflow_status": "started|running|completed|failed",
  "component_status": {
    "claude_code": {"status": "completed", "tasks_created": 15},
    "codegen": {"status": "running", "code_generated": 5},
    "openevolve": {"status": "queued", "evolution_pending": true}
  },
  "results": {
    "tasks_completed": 10,
    "code_files_generated": 25,
    "optimization_improvements": {"performance": 0.15, "complexity": -0.08}
  }
}
```

### Health Check API
- **Endpoint**: `/api/v1/health`
- **Method**: GET
- **Response Format**:
```json
{
  "overall_status": "healthy|degraded|unhealthy",
  "components": {
    "openevolve": {
      "status": "healthy",
      "response_time_ms": 150,
      "active_evolutions": 3,
      "queue_depth": 12
    },
    "codegen": {
      "status": "healthy",
      "response_time_ms": 200,
      "active_generations": 8,
      "agent_count": 15
    },
    "claude_code": {
      "status": "healthy",
      "response_time_ms": 100,
      "active_tasks": 42,
      "provider_status": "all_active"
    }
  },
  "dependencies": {
    "database": "healthy",
    "message_queue": "healthy",
    "ai_providers": "healthy"
  }
}
```

## Authentication & Security

### JWT Token Format
```json
{
  "iss": "unified-cicd-system",
  "sub": "user-id",
  "aud": ["openevolve", "codegen", "claude-code"],
  "exp": 1640995200,
  "iat": 1640991600,
  "scope": ["read:tasks", "write:code", "execute:evolution"],
  "component_permissions": {
    "openevolve": ["evolution:create", "programs:read"],
    "codegen": ["generate:code", "analyze:codebase"],
    "claude_code": ["tasks:manage", "prd:parse"]
  }
}
```

### API Key Management
- **Format**: `uc_<component>_<32-char-hex>`
- **Scopes**: Component-specific permissions
- **Rotation**: Automatic 90-day rotation
- **Rate Limiting**: Per-key limits with burst allowance

