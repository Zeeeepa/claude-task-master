-- Sample Data for Task Orchestration Database
-- Claude Task Master AI-Driven CI/CD System

-- Insert sample deployment scripts
INSERT INTO deployment_scripts (
    id,
    name,
    description,
    script_type,
    script_content,
    script_language,
    environment,
    version,
    created_by,
    execution_timeout_seconds,
    required_permissions,
    environment_variables,
    dependencies,
    tags
) VALUES 
(
    uuid_generate_v4(),
    'setup_nodejs_environment',
    'Sets up Node.js development environment with required dependencies',
    'setup',
    '#!/bin/bash
set -e

echo "Setting up Node.js environment..."

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install dependencies
npm install

# Run tests
npm test

echo "Node.js environment setup complete!"',
    'bash',
    'development',
    '1.0.0',
    'system',
    300,
    ARRAY['read', 'write', 'execute'],
    '{"NODE_ENV": "development", "NPM_CONFIG_LOGLEVEL": "info"}',
    ARRAY[]::TEXT[],
    ARRAY['nodejs', 'setup', 'development']
),
(
    uuid_generate_v4(),
    'deploy_to_staging',
    'Deploys application to staging environment',
    'deploy',
    '#!/bin/bash
set -e

echo "Deploying to staging..."

# Build application
npm run build

# Deploy to staging server
rsync -avz --delete dist/ staging-server:/var/www/app/

# Restart services
ssh staging-server "sudo systemctl restart app-service"

# Run health check
curl -f http://staging-server/health || exit 1

echo "Deployment to staging complete!"',
    'bash',
    'staging',
    '1.0.0',
    'system',
    600,
    ARRAY['deploy', 'ssh'],
    '{"DEPLOY_ENV": "staging", "HEALTH_CHECK_URL": "http://staging-server/health"}',
    ARRAY['setup_nodejs_environment'],
    ARRAY['deployment', 'staging', 'automation']
),
(
    uuid_generate_v4(),
    'database_migration',
    'Runs database migrations safely',
    'setup',
    '#!/bin/bash
set -e

echo "Running database migrations..."

# Backup database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Run migrations
npm run migrate

# Verify migration
npm run migrate:status

echo "Database migration complete!"',
    'bash',
    'production',
    '1.0.0',
    'system',
    900,
    ARRAY['database', 'backup'],
    '{"DATABASE_URL": "postgresql://user:pass@localhost/db"}',
    ARRAY[]::TEXT[],
    ARRAY['database', 'migration', 'backup']
);

-- Insert sample tasks
INSERT INTO tasks (
    id,
    legacy_id,
    title,
    description,
    details,
    test_strategy,
    status,
    priority,
    linear_issue_id,
    repository_url,
    estimated_complexity,
    acceptance_criteria,
    tags,
    requirements,
    implementation_files,
    metadata,
    created_by
) VALUES 
(
    uuid_generate_v4(),
    1,
    'Implement User Authentication System',
    'Design and implement a secure user authentication system with JWT tokens',
    'Create a comprehensive authentication system that includes:
- User registration and login
- JWT token generation and validation
- Password hashing with bcrypt
- Rate limiting for login attempts
- Password reset functionality
- Email verification
- Role-based access control',
    'Test all authentication flows including edge cases:
- Valid and invalid credentials
- Token expiration handling
- Rate limiting behavior
- Password reset flow
- Email verification process
- Role permission checks',
    'in-progress',
    'high',
    'AUTH-001',
    'https://github.com/example/auth-service',
    8,
    '- Users can register with email and password
- Users can login and receive JWT token
- Passwords are securely hashed
- Rate limiting prevents brute force attacks
- Password reset works via email
- Email verification is required for new accounts
- Role-based permissions are enforced',
    ARRAY['authentication', 'security', 'backend'],
    '{"frameworks": ["express", "passport"], "database": "postgresql", "testing": "jest"}',
    ARRAY['src/auth/routes.js', 'src/auth/middleware.js', 'src/auth/models.js'],
    '{"priority_reason": "Core security feature", "estimated_hours": 40}',
    'developer'
),
(
    uuid_generate_v4(),
    2,
    'Create API Documentation',
    'Generate comprehensive API documentation using OpenAPI/Swagger',
    'Create detailed API documentation that includes:
- All endpoint definitions
- Request/response schemas
- Authentication requirements
- Error response formats
- Code examples in multiple languages
- Interactive testing interface',
    'Verify documentation accuracy:
- All endpoints are documented
- Schemas match actual API responses
- Examples work correctly
- Interactive testing functions properly
- Documentation is accessible and well-formatted',
    'pending',
    'medium',
    'DOC-001',
    'https://github.com/example/api-docs',
    4,
    '- All API endpoints are documented
- Request/response schemas are accurate
- Authentication methods are explained
- Error codes and messages are documented
- Interactive testing interface is available
- Documentation is automatically updated',
    ARRAY['documentation', 'api', 'swagger'],
    '{"tools": ["swagger", "openapi"], "format": "yaml"}',
    ARRAY['docs/api.yaml', 'docs/index.html'],
    '{"auto_generate": true, "update_frequency": "on_deploy"}',
    'technical_writer'
),
(
    uuid_generate_v4(),
    3,
    'Implement Database Connection Pooling',
    'Set up efficient database connection pooling for improved performance',
    'Implement connection pooling to optimize database performance:
- Configure connection pool with appropriate limits
- Handle connection failures gracefully
- Monitor connection usage and performance
- Implement connection health checks
- Add metrics and logging for pool status',
    'Test connection pooling under various conditions:
- High concurrent load
- Connection failures and recovery
- Pool exhaustion scenarios
- Health check functionality
- Performance improvements measurement',
    'done',
    'high',
    'DB-001',
    'https://github.com/example/database',
    6,
    '- Connection pool is properly configured
- Pool handles concurrent requests efficiently
- Failed connections are automatically retried
- Health checks monitor connection status
- Performance metrics are collected
- Pool size is optimized for workload',
    ARRAY['database', 'performance', 'backend'],
    '{"pool_library": "pg-pool", "max_connections": 20, "idle_timeout": 30000}',
    ARRAY['src/database/pool.js', 'src/database/config.js'],
    '{"performance_improvement": "40%", "max_concurrent_connections": 20}',
    'backend_developer'
);

-- Insert task dependencies
INSERT INTO task_dependencies (dependent_task_id, dependency_task_id, dependency_type, created_by)
SELECT 
    t1.id as dependent_task_id,
    t2.id as dependency_task_id,
    'blocks' as dependency_type,
    'system' as created_by
FROM tasks t1, tasks t2 
WHERE t1.legacy_id = 2 AND t2.legacy_id = 1; -- API docs depend on auth system

INSERT INTO task_dependencies (dependent_task_id, dependency_task_id, dependency_type, created_by)
SELECT 
    t1.id as dependent_task_id,
    t2.id as dependency_task_id,
    'blocks' as dependency_type,
    'system' as created_by
FROM tasks t1, tasks t2 
WHERE t1.legacy_id = 1 AND t2.legacy_id = 3; -- Auth system depends on database pooling

-- Insert workflow states
INSERT INTO workflow_states (task_id, state, previous_state, state_data, triggered_by, trigger_reason)
SELECT 
    t.id,
    'development' as state,
    'planning' as previous_state,
    '{"developer": "john_doe", "branch": "feature/auth-system"}' as state_data,
    'developer' as triggered_by,
    'Started implementation' as trigger_reason
FROM tasks t WHERE t.legacy_id = 1;

INSERT INTO workflow_states (task_id, state, previous_state, state_data, triggered_by, trigger_reason)
SELECT 
    t.id,
    'completed' as state,
    'testing' as previous_state,
    '{"tests_passed": true, "coverage": 95}' as state_data,
    'ci_system' as triggered_by,
    'All tests passed' as trigger_reason
FROM tasks t WHERE t.legacy_id = 3;

-- Insert sample PR metadata
INSERT INTO pr_metadata (
    pr_number,
    repository_url,
    title,
    description,
    status,
    branch_name,
    base_branch,
    author,
    assignees,
    reviewers,
    labels,
    commits_count,
    files_changed,
    additions,
    deletions,
    checks_status,
    review_status,
    merge_status,
    metadata
) VALUES 
(
    123,
    'https://github.com/example/auth-service',
    'Implement JWT authentication middleware',
    'This PR implements the core JWT authentication middleware with the following features:

- JWT token generation and validation
- Middleware for protecting routes
- Error handling for invalid tokens
- Unit tests with 95% coverage

Closes #AUTH-001',
    'open',
    'feature/jwt-auth',
    'main',
    'john_doe',
    ARRAY['jane_smith'],
    ARRAY['tech_lead', 'security_reviewer'],
    ARRAY['enhancement', 'security', 'backend'],
    8,
    12,
    245,
    67,
    'success',
    'approved',
    'mergeable',
    '{"ci_build_id": "build-456", "deployment_preview": "https://preview-auth.example.com"}'
),
(
    124,
    'https://github.com/example/database',
    'Add connection pooling configuration',
    'Implements database connection pooling using pg-pool:

- Configurable pool size and timeouts
- Connection health monitoring
- Graceful error handling
- Performance metrics collection

Resolves #DB-001',
    'merged',
    'feature/connection-pooling',
    'main',
    'alice_dev',
    ARRAY['bob_admin'],
    ARRAY['database_admin'],
    ARRAY['performance', 'database'],
    5,
    8,
    156,
    23,
    'success',
    'approved',
    'merged',
    '{"merge_commit": "abc123def", "performance_improvement": "40%"}'
);

-- Insert Linear sync data
INSERT INTO linear_sync (
    task_id,
    linear_issue_id,
    linear_team_id,
    linear_project_id,
    linear_state_id,
    linear_assignee_id,
    linear_priority,
    linear_title,
    linear_description,
    linear_url,
    sync_direction,
    sync_status,
    linear_created_at,
    linear_updated_at,
    metadata
)
SELECT 
    t.id,
    'AUTH-001' as linear_issue_id,
    'team_backend' as linear_team_id,
    'proj_auth_system' as linear_project_id,
    'state_in_progress' as linear_state_id,
    'user_john_doe' as linear_assignee_id,
    1 as linear_priority,
    'Implement User Authentication System' as linear_title,
    'Design and implement a secure user authentication system with JWT tokens' as linear_description,
    'https://linear.app/company/issue/AUTH-001' as linear_url,
    'bidirectional' as sync_direction,
    'synced' as sync_status,
    NOW() - INTERVAL '2 days' as linear_created_at,
    NOW() - INTERVAL '1 hour' as linear_updated_at,
    '{"last_sync_action": "status_update", "sync_conflicts": []}' as metadata
FROM tasks t WHERE t.legacy_id = 1;

-- Insert task-PR relationships
INSERT INTO task_pr_relationships (task_id, pr_id, relationship_type, created_by)
SELECT 
    t.id as task_id,
    pr.id as pr_id,
    'implements' as relationship_type,
    'system' as created_by
FROM tasks t, pr_metadata pr 
WHERE t.legacy_id = 1 AND pr.pr_number = 123;

INSERT INTO task_pr_relationships (task_id, pr_id, relationship_type, created_by)
SELECT 
    t.id as task_id,
    pr.id as pr_id,
    'implements' as relationship_type,
    'system' as created_by
FROM tasks t, pr_metadata pr 
WHERE t.legacy_id = 3 AND pr.pr_number = 124;

-- Insert sample error logs
INSERT INTO error_logs (
    task_id,
    error_code,
    error_message,
    error_details,
    stack_trace,
    severity,
    context,
    retry_count,
    tags,
    metadata
)
SELECT 
    t.id,
    'AUTH_TOKEN_EXPIRED' as error_code,
    'JWT token has expired and needs to be refreshed' as error_message,
    '{"token_age": 3600, "max_age": 3600, "user_id": "user123"}' as error_details,
    'Error: JWT token expired
    at validateToken (auth.js:45)
    at middleware (auth.js:23)
    at router (routes.js:12)' as stack_trace,
    'low' as severity,
    '{"request_id": "req_456", "user_agent": "Mozilla/5.0", "ip": "192.168.1.100"}' as context,
    0 as retry_count,
    ARRAY['authentication', 'token', 'expired'] as tags,
    '{"auto_resolved": false, "user_notified": true}' as metadata
FROM tasks t WHERE t.legacy_id = 1;

-- Insert deployment execution records
INSERT INTO deployment_executions (
    deployment_script_id,
    task_id,
    status,
    started_at,
    completed_at,
    duration_seconds,
    exit_code,
    stdout_log,
    stderr_log,
    environment,
    executed_by,
    execution_context,
    metadata
)
SELECT 
    ds.id as deployment_script_id,
    t.id as task_id,
    'success' as status,
    NOW() - INTERVAL '1 hour' as started_at,
    NOW() - INTERVAL '55 minutes' as completed_at,
    300 as duration_seconds,
    0 as exit_code,
    'Setting up Node.js environment...
Node.js version: v18.17.0
Installing dependencies...
npm install completed successfully
Running tests...
All tests passed (24/24)
Node.js environment setup complete!' as stdout_log,
    '' as stderr_log,
    'development' as environment,
    'ci_system' as executed_by,
    '{"build_id": "build-789", "commit_sha": "abc123def456", "branch": "feature/auth-system"}' as execution_context,
    '{"triggered_by": "push", "auto_deploy": true}' as metadata
FROM deployment_scripts ds, tasks t 
WHERE ds.name = 'setup_nodejs_environment' AND t.legacy_id = 1
LIMIT 1;

