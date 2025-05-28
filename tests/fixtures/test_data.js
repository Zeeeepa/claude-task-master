/**
 * Test Data Fixtures
 * 
 * Comprehensive test data sets for the AI CI/CD testing framework
 * including sample tasks, users, code snippets, and system configurations.
 */

// Sample task data for testing
export const SAMPLE_TASKS = [
  {
    id: 'task_001',
    title: 'Implement User Authentication',
    description: 'Create a secure user authentication system with JWT tokens and password hashing',
    priority: 'high',
    status: 'pending',
    complexity: 8,
    estimatedHours: 16,
    tags: ['backend', 'security', 'api'],
    assignee: 'developer@example.com',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    requirements: [
      'JWT token generation and validation',
      'Password hashing with bcrypt',
      'Login and logout endpoints',
      'Protected route middleware',
      'User session management'
    ],
    acceptanceCriteria: [
      'Users can register with email and password',
      'Users can login with valid credentials',
      'Invalid credentials are rejected',
      'JWT tokens expire after 24 hours',
      'Protected routes require valid tokens'
    ]
  },
  {
    id: 'task_002',
    title: 'Database Schema Migration',
    description: 'Update database schema to support new user roles and permissions',
    priority: 'medium',
    status: 'in_progress',
    complexity: 5,
    estimatedHours: 8,
    tags: ['database', 'migration', 'backend'],
    assignee: 'dba@example.com',
    createdAt: '2024-01-14T14:30:00Z',
    updatedAt: '2024-01-16T09:15:00Z',
    requirements: [
      'Add roles table',
      'Add permissions table',
      'Update users table with role_id',
      'Create migration scripts',
      'Update seed data'
    ],
    acceptanceCriteria: [
      'Migration runs without errors',
      'All existing data is preserved',
      'New tables have proper indexes',
      'Foreign key constraints are enforced',
      'Rollback script is available'
    ]
  },
  {
    id: 'task_003',
    title: 'Frontend Component Library',
    description: 'Create reusable React components for the design system',
    priority: 'low',
    status: 'completed',
    complexity: 6,
    estimatedHours: 20,
    tags: ['frontend', 'react', 'ui', 'components'],
    assignee: 'frontend@example.com',
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: '2024-01-18T16:45:00Z',
    requirements: [
      'Button component with variants',
      'Input component with validation',
      'Modal component',
      'Card component',
      'Storybook documentation'
    ],
    acceptanceCriteria: [
      'Components follow design system',
      'All components have TypeScript types',
      'Components are accessible (WCAG 2.1)',
      'Unit tests for all components',
      'Storybook stories for each component'
    ]
  }
];

// Sample user data for testing
export const SAMPLE_USERS = [
  {
    id: 'user_001',
    username: 'admin_user',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    isActive: true,
    permissions: ['read', 'write', 'delete', 'admin'],
    createdAt: '2024-01-01T00:00:00Z',
    lastLoginAt: '2024-01-20T10:30:00Z',
    profile: {
      avatar: 'https://example.com/avatars/admin.jpg',
      bio: 'System administrator',
      timezone: 'UTC',
      preferences: {
        theme: 'dark',
        notifications: true,
        language: 'en'
      }
    }
  },
  {
    id: 'user_002',
    username: 'developer_user',
    email: 'developer@example.com',
    firstName: 'John',
    lastName: 'Developer',
    role: 'user',
    isActive: true,
    permissions: ['read', 'write'],
    createdAt: '2024-01-05T12:00:00Z',
    lastLoginAt: '2024-01-19T15:45:00Z',
    profile: {
      avatar: 'https://example.com/avatars/developer.jpg',
      bio: 'Full-stack developer',
      timezone: 'America/New_York',
      preferences: {
        theme: 'light',
        notifications: true,
        language: 'en'
      }
    }
  },
  {
    id: 'user_003',
    username: 'guest_user',
    email: 'guest@example.com',
    firstName: 'Guest',
    lastName: 'User',
    role: 'guest',
    isActive: false,
    permissions: ['read'],
    createdAt: '2024-01-15T16:20:00Z',
    lastLoginAt: null,
    profile: {
      avatar: null,
      bio: 'Guest account',
      timezone: 'UTC',
      preferences: {
        theme: 'light',
        notifications: false,
        language: 'en'
      }
    }
  }
];

// Sample code snippets for testing
export const SAMPLE_CODE_SNIPPETS = {
  javascript: {
    valid: `
function calculateTotal(items) {
  if (!Array.isArray(items)) {
    throw new Error('Items must be an array');
  }
  
  return items.reduce((total, item) => {
    if (typeof item.price !== 'number' || item.price < 0) {
      throw new Error('Invalid item price');
    }
    return total + item.price;
  }, 0);
}

module.exports = { calculateTotal };
    `,
    invalid: `
function brokenFunction() {
  console.log("Missing semicolon"
  return undefined
}

// Missing closing brace
    `,
    vulnerable: `
function unsafeQuery(userInput) {
  const query = "SELECT * FROM users WHERE name = '" + userInput + "'";
  return database.query(query);
}
    `
  },
  python: {
    valid: `
def calculate_total(items):
    """Calculate the total price of items."""
    if not isinstance(items, list):
        raise TypeError("Items must be a list")
    
    total = 0
    for item in items:
        if not isinstance(item.get('price'), (int, float)) or item['price'] < 0:
            raise ValueError("Invalid item price")
        total += item['price']
    
    return total
    `,
    invalid: `
def broken_function():
    print("Missing indentation"
return None
    `,
    vulnerable: `
def unsafe_query(user_input):
    query = f"SELECT * FROM users WHERE name = '{user_input}'"
    return database.execute(query)
    `
  },
  sql: {
    valid: `
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
    `,
    invalid: `
CREATE TABLE broken_table (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    -- Missing comma
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    invalid_column
);
    `,
    vulnerable: `
SELECT * FROM users WHERE username = '$username' AND password = '$password';
    `
  }
};

// Sample API responses for testing
export const SAMPLE_API_RESPONSES = {
  success: {
    tasks: {
      list: {
        status: 200,
        data: {
          tasks: SAMPLE_TASKS,
          total: SAMPLE_TASKS.length,
          page: 1,
          limit: 10
        }
      },
      create: {
        status: 201,
        data: {
          id: 'task_new',
          message: 'Task created successfully'
        }
      },
      update: {
        status: 200,
        data: {
          id: 'task_001',
          message: 'Task updated successfully'
        }
      },
      delete: {
        status: 204,
        data: null
      }
    },
    auth: {
      login: {
        status: 200,
        data: {
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token',
          user: SAMPLE_USERS[0],
          expiresIn: '24h'
        }
      },
      refresh: {
        status: 200,
        data: {
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refreshed.token',
          expiresIn: '24h'
        }
      }
    }
  },
  error: {
    unauthorized: {
      status: 401,
      data: {
        error: 'Unauthorized',
        message: 'Invalid credentials'
      }
    },
    forbidden: {
      status: 403,
      data: {
        error: 'Forbidden',
        message: 'Insufficient permissions'
      }
    },
    notFound: {
      status: 404,
      data: {
        error: 'Not Found',
        message: 'Resource not found'
      }
    },
    validation: {
      status: 400,
      data: {
        error: 'Validation Error',
        message: 'Invalid input data',
        details: [
          {
            field: 'email',
            message: 'Invalid email format'
          },
          {
            field: 'password',
            message: 'Password must be at least 8 characters'
          }
        ]
      }
    },
    serverError: {
      status: 500,
      data: {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      }
    }
  }
};

// Sample system configurations for testing
export const SAMPLE_SYSTEM_CONFIG = {
  database: {
    host: 'localhost',
    port: 5432,
    database: 'taskmaster_test',
    username: 'test_user',
    password: 'test_password',
    ssl: false,
    pool: {
      min: 2,
      max: 10,
      idle: 10000
    }
  },
  redis: {
    host: 'localhost',
    port: 6379,
    password: null,
    db: 1
  },
  api: {
    port: 3000,
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    }
  },
  auth: {
    jwtSecret: 'test_jwt_secret_key',
    jwtExpiration: '24h',
    bcryptRounds: 10
  },
  ai: {
    anthropic: {
      apiKey: 'test_anthropic_key',
      model: 'claude-3-sonnet-20240229',
      maxTokens: 4000
    },
    openai: {
      apiKey: 'test_openai_key',
      model: 'gpt-4',
      maxTokens: 4000
    }
  },
  monitoring: {
    enabled: true,
    metricsInterval: 60000, // 1 minute
    healthCheckInterval: 30000 // 30 seconds
  }
};

// Sample test scenarios for different testing types
export const TEST_SCENARIOS = {
  performance: {
    load: {
      name: 'Standard Load Test',
      concurrent_users: 50,
      duration: 60000, // 1 minute
      ramp_up_time: 10000, // 10 seconds
      scenarios: [
        { action: 'list_tasks', weight: 40 },
        { action: 'create_task', weight: 30 },
        { action: 'update_task', weight: 20 },
        { action: 'delete_task', weight: 10 }
      ]
    },
    stress: {
      name: 'Stress Test',
      max_users: 200,
      increment: 25,
      step_duration: 30000, // 30 seconds
      break_threshold: 0.8 // 80% success rate
    },
    spike: {
      name: 'Spike Test',
      baseline_users: 20,
      spike_users: 150,
      spike_duration: 30000, // 30 seconds
      recovery_time: 60000 // 1 minute
    }
  },
  security: {
    authentication: [
      {
        name: 'Valid Login',
        credentials: { username: 'admin_user', password: 'correct_password' },
        expected: { success: true, token: true }
      },
      {
        name: 'Invalid Password',
        credentials: { username: 'admin_user', password: 'wrong_password' },
        expected: { success: false, error: 'Invalid credentials' }
      },
      {
        name: 'Non-existent User',
        credentials: { username: 'fake_user', password: 'any_password' },
        expected: { success: false, error: 'User not found' }
      }
    ],
    authorization: [
      {
        name: 'Admin Access to Admin Resource',
        user: 'admin_user',
        resource: '/api/admin/users',
        expected: { authorized: true }
      },
      {
        name: 'User Access to Admin Resource',
        user: 'developer_user',
        resource: '/api/admin/users',
        expected: { authorized: false }
      },
      {
        name: 'Guest Access to Any Resource',
        user: 'guest_user',
        resource: '/api/tasks',
        expected: { authorized: false }
      }
    ]
  },
  integration: {
    workflows: [
      {
        name: 'Complete Task Processing',
        steps: [
          { action: 'create_task', data: SAMPLE_TASKS[0] },
          { action: 'process_requirements', expected: { requirements: true } },
          { action: 'generate_code', expected: { code: true } },
          { action: 'validate_code', expected: { valid: true } },
          { action: 'create_pr', expected: { pr_url: true } },
          { action: 'update_status', data: { status: 'completed' } }
        ]
      },
      {
        name: 'Error Recovery Flow',
        steps: [
          { action: 'simulate_db_failure', expected: { error: true } },
          { action: 'trigger_recovery', expected: { recovered: true } },
          { action: 'verify_system_health', expected: { healthy: true } }
        ]
      }
    ]
  }
};

// Sample error conditions for testing
export const ERROR_CONDITIONS = {
  network: {
    timeout: {
      description: 'Network request timeout',
      simulation: { delay: 30000 }, // 30 seconds
      expected: { error: 'TIMEOUT', recovered: true }
    },
    connection_refused: {
      description: 'Connection refused',
      simulation: { port: 9999 }, // Non-existent port
      expected: { error: 'ECONNREFUSED', recovered: true }
    },
    dns_failure: {
      description: 'DNS resolution failure',
      simulation: { host: 'non-existent-host.invalid' },
      expected: { error: 'ENOTFOUND', recovered: true }
    }
  },
  database: {
    connection_loss: {
      description: 'Database connection lost',
      simulation: { disconnect: true },
      expected: { error: 'CONNECTION_LOST', recovered: true }
    },
    query_timeout: {
      description: 'Database query timeout',
      simulation: { slow_query: true },
      expected: { error: 'QUERY_TIMEOUT', recovered: true }
    },
    constraint_violation: {
      description: 'Database constraint violation',
      simulation: { duplicate_key: true },
      expected: { error: 'CONSTRAINT_VIOLATION', handled: true }
    }
  },
  application: {
    memory_pressure: {
      description: 'High memory usage',
      simulation: { memory_leak: true },
      expected: { error: 'OUT_OF_MEMORY', recovered: true }
    },
    cpu_overload: {
      description: 'High CPU usage',
      simulation: { cpu_intensive: true },
      expected: { error: 'CPU_OVERLOAD', throttled: true }
    },
    disk_full: {
      description: 'Disk space exhausted',
      simulation: { disk_full: true },
      expected: { error: 'ENOSPC', handled: true }
    }
  }
};

// Sample performance benchmarks
export const PERFORMANCE_BENCHMARKS = {
  response_times: {
    api_endpoints: {
      '/api/tasks': { max: 200, p95: 150, p99: 300 }, // milliseconds
      '/api/users': { max: 150, p95: 100, p99: 200 },
      '/api/auth/login': { max: 500, p95: 300, p99: 800 },
      '/api/ai/analyze': { max: 5000, p95: 3000, p99: 8000 }
    },
    database_queries: {
      simple_select: { max: 50, p95: 30, p99: 100 },
      complex_join: { max: 200, p95: 150, p99: 400 },
      insert: { max: 100, p95: 75, p99: 200 },
      update: { max: 100, p95: 75, p99: 200 }
    }
  },
  throughput: {
    requests_per_second: {
      light_load: 100,
      moderate_load: 500,
      heavy_load: 1000
    },
    transactions_per_second: {
      database: 200,
      cache: 1000
    }
  },
  resource_usage: {
    memory: {
      baseline: 256 * 1024 * 1024, // 256MB
      under_load: 512 * 1024 * 1024, // 512MB
      maximum: 1024 * 1024 * 1024 // 1GB
    },
    cpu: {
      baseline: 0.1, // 10%
      under_load: 0.5, // 50%
      maximum: 0.8 // 80%
    }
  }
};

// Export all test data
export default {
  SAMPLE_TASKS,
  SAMPLE_USERS,
  SAMPLE_CODE_SNIPPETS,
  SAMPLE_API_RESPONSES,
  SAMPLE_SYSTEM_CONFIG,
  TEST_SCENARIOS,
  ERROR_CONDITIONS,
  PERFORMANCE_BENCHMARKS
};

