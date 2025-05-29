# Migration Guide: Unified Resilience Framework

## 🎯 Overview

This guide helps you migrate from the scattered error handling patterns across the Claude Task Master codebase to the unified resilience framework. The migration eliminates redundancy while maintaining all existing functionality.

## 📋 Pre-Migration Checklist

- [ ] Review current error handling patterns in your modules
- [ ] Identify retry logic that can be consolidated
- [ ] Note any custom error response formats
- [ ] Document existing circuit breaker or fallback mechanisms
- [ ] Plan testing strategy for migrated components

## 🔄 Migration Steps

### Step 1: Replace AI Services Error Handling

#### Before: `scripts/modules/ai-services-unified.js`

```javascript
// Old scattered retry logic
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 1000;

function isRetryableError(error) {
  const errorMessage = error.message?.toLowerCase() || '';
  return (
    errorMessage.includes('rate limit') ||
    errorMessage.includes('overloaded') ||
    errorMessage.includes('service temporarily unavailable') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('network error') ||
    error.status === 429 ||
    error.status >= 500
  );
}

async function callWithRetry(providerApiFn, callParams, providerName, modelId, attemptRole) {
  let retries = 0;
  while (retries <= MAX_RETRIES) {
    try {
      const result = await providerApiFn(callParams);
      return result;
    } catch (error) {
      if (isRetryableError(error) && retries < MAX_RETRIES) {
        retries++;
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retries - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
```

#### After: Using Resilience Framework

```javascript
import { resilienceFramework } from '../../src/resilience/index.js';

// Simplified, unified approach
async function callWithResilience(providerApiFn, callParams, providerName, modelId, attemptRole) {
  return await resilienceFramework.executeWithResilience(
    () => providerApiFn(callParams),
    {
      operationName: `${providerName}_${modelId}`,
      context: 'ai_service',
      enableRetries: true,
      enableCircuitBreaker: true,
      retryConfig: {
        maxRetries: 2,
        initialDelayMs: 1000,
        backoffMultiplier: 2
      }
    }
  );
}

// Provider fallback sequence
async function executeWithProviderFallback(operation, role, projectRoot) {
  const providers = getProviderSequence(role); // ['main', 'fallback', 'research']
  
  for (const providerRole of providers) {
    try {
      const providerName = getProviderForRole(providerRole, projectRoot);
      const modelId = getModelIdForRole(providerRole, projectRoot);
      
      return await resilienceFramework.executeWithResilience(
        operation,
        {
          operationName: `${providerName}_${providerRole}`,
          context: 'ai_service',
          enableRetries: true,
          enableCircuitBreaker: true,
          circuitConfig: {
            failureThreshold: 3,
            timeoutMs: 120000 // 2 minutes
          }
        }
      );
    } catch (error) {
      // Framework handles classification and logging
      if (providerRole === providers[providers.length - 1]) {
        throw error; // Last provider, re-throw
      }
      // Continue to next provider
    }
  }
}
```

### Step 2: Migrate MCP Server Error Handling

#### Before: `mcp-server/src/tools/utils.js`

```javascript
// Old inconsistent error responses
export function createErrorResponse(message, code = 'UNKNOWN_ERROR') {
  return {
    success: false,
    error: {
      code,
      message
    }
  };
}

export function handleApiResult(result, log, errorMessage, processor = null) {
  if (result.success) {
    const data = processor ? processor(result.data) : result.data;
    return {
      success: true,
      data
    };
  } else {
    log.error(errorMessage, result.error);
    return {
      success: false,
      error: result.error
    };
  }
}
```

#### After: Using Unified Error Formatting

```javascript
import { 
  ErrorResponseFormatter, 
  errorClassifier,
  unifiedLogger 
} from '../../../src/resilience/index.js';

const errorFormatter = new ErrorResponseFormatter();

export function createErrorResponse(message, code = 'UNKNOWN_ERROR', error = null) {
  const classification = error ? errorClassifier.classify(error) : null;
  return errorFormatter.formatError(
    error || new Error(message),
    classification,
    { code }
  );
}

export function handleApiResult(result, log, errorMessage, processor = null) {
  if (result.success) {
    const data = processor ? processor(result.data) : result.data;
    return errorFormatter.formatSuccess(data);
  } else {
    const error = new Error(errorMessage);
    error.details = result.error;
    
    const classification = errorClassifier.classify(error);
    unifiedLogger.logError(error, errorMessage, { classification });
    
    return errorFormatter.formatError(error, classification);
  }
}
```

#### Before: Direct Function Error Handling

```javascript
// Old pattern in direct functions
export async function addTaskDirect(args, log) {
  try {
    // ... operation logic
    return {
      success: true,
      data: result
    };
  } catch (error) {
    log.error(`Error in addTaskDirect: ${error.message}`);
    return {
      success: false,
      error: {
        code: error.code || 'ADD_TASK_ERROR',
        message: error.message
      }
    };
  }
}
```

#### After: Using Resilience Handler

```javascript
import { ResilienceHandler, unifiedLogger } from '../../../src/resilience/index.js';

const resilienceHandler = new ResilienceHandler({
  logger: unifiedLogger
});

export async function addTaskDirect(args, log) {
  return await resilienceHandler.handle(
    async () => {
      // ... operation logic
      return result;
    },
    {
      operationName: 'add_task',
      context: 'mcp_server',
      enableRetries: false, // Don't retry user operations
      enableCircuitBreaker: false
    }
  );
}
```

### Step 3: Migrate CLI Error Handling

#### Before: `bin/task-master.js`

```javascript
// Old basic error handling
process.on('uncaughtException', (err) => {
  if (err.code === 'commander.unknownOption') {
    const option = err.message.match(/'([^']+)'/)?.[1];
    console.error(chalk.red(`Error: Unknown option '${option}'`));
    process.exit(1);
  }
  
  console.error(chalk.red(`Error: ${err.message}`));
  if (process.env.DEBUG === '1') {
    console.error(err);
  }
  process.exit(1);
});
```

#### After: Using Unified Error Handling

```javascript
import { 
  resilienceFramework, 
  unifiedLogger, 
  ErrorResponseFormatter,
  LOG_CONTEXTS 
} from '../src/resilience/index.js';

const errorFormatter = new ErrorResponseFormatter();

process.on('uncaughtException', (err) => {
  const classification = resilienceFramework.errorClassifier.classify(err);
  
  // Log with proper classification
  unifiedLogger.logError(
    err, 
    'Uncaught CLI exception', 
    { classification },
    LOG_CONTEXTS.SYSTEM
  );
  
  // Handle specific error types
  if (err.code === 'commander.unknownOption') {
    const option = err.message.match(/'([^']+)'/)?.[1];
    console.error(chalk.red(`Error: Unknown option '${option}'`));
    console.error(chalk.yellow(`Run 'task-master --help' for available options`));
    process.exit(1);
  }
  
  // Format error for user display
  const response = errorFormatter.convertFormat(
    errorFormatter.formatError(err, classification),
    'text'
  );
  
  console.error(chalk.red(response));
  
  // Exit based on error severity
  if (classification.severity === 'critical') {
    process.exit(1);
  }
});

// Enhanced command execution with resilience
async function executeCommand(commandFn, options) {
  try {
    return await resilienceFramework.executeWithResilience(
      commandFn,
      {
        operationName: options.commandName || 'cli_command',
        context: 'cli',
        enableRetries: false, // Don't retry user commands
        enableCircuitBreaker: false
      }
    );
  } catch (error) {
    const classification = resilienceFramework.errorClassifier.classify(error);
    const response = errorFormatter.convertFormat(
      errorFormatter.formatError(error, classification),
      'text'
    );
    
    console.error(chalk.red(response));
    process.exit(classification.severity === 'critical' ? 1 : 0);
  }
}
```

### Step 4: Migrate Logger Usage

#### Before: `mcp-server/src/logger.js`

```javascript
// Old logger implementation
import chalk from 'chalk';

function log(level, ...args) {
  const prefixes = {
    debug: chalk.gray('[DEBUG]'),
    info: chalk.blue('[INFO]'),
    warn: chalk.yellow('[WARN]'),
    error: chalk.red('[ERROR]'),
    success: chalk.green('[SUCCESS]')
  };
  
  const prefix = prefixes[level] || '';
  console.log(prefix, ...args);
}

export const logger = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
  success: (...args) => log('success', ...args)
};
```

#### After: Using Unified Logger

```javascript
import { unifiedLogger, LOG_CONTEXTS } from '../../src/resilience/index.js';

// Direct replacement
export const logger = unifiedLogger;

// Or create context-specific loggers
export const mcpLogger = unifiedLogger.child(LOG_CONTEXTS.SYSTEM, { 
  component: 'mcp_server' 
});

export const toolLogger = unifiedLogger.child(LOG_CONTEXTS.BUSINESS, { 
  component: 'mcp_tools' 
});

// Enhanced error logging
export function logError(error, message, context = {}) {
  unifiedLogger.logError(
    error,
    message,
    { ...context, component: 'mcp_server' },
    LOG_CONTEXTS.SYSTEM
  );
}
```

### Step 5: Add Health Monitoring

#### New: Health Checks for Critical Components

```javascript
import { HealthMonitor, HEALTH_CHECK_TYPES } from '../src/resilience/index.js';

// Initialize health monitoring
const healthMonitor = new HealthMonitor({
  checkInterval: 30000,
  enableAlerts: true
});

// Add custom health checks
healthMonitor.addHealthCheck({
  id: 'ai_providers',
  type: HEALTH_CHECK_TYPES.DEPENDENCY,
  name: 'AI Provider Connectivity',
  check: async () => {
    try {
      // Test connectivity to AI providers
      await testProviderConnectivity();
      return {
        status: 'healthy',
        message: 'All AI providers accessible'
      };
    } catch (error) {
      return {
        status: 'critical',
        message: `AI provider connectivity failed: ${error.message}`
      };
    }
  },
  interval: 60000,
  timeout: 10000
});

healthMonitor.addHealthCheck({
  id: 'task_storage',
  type: HEALTH_CHECK_TYPES.RESOURCE,
  name: 'Task Storage Health',
  check: async () => {
    try {
      // Check task storage accessibility
      const tasksPath = findTasksJsonPath();
      const stats = await fs.stat(tasksPath);
      
      return {
        status: 'healthy',
        message: 'Task storage accessible',
        details: {
          path: tasksPath,
          size: stats.size,
          lastModified: stats.mtime
        }
      };
    } catch (error) {
      return {
        status: 'degraded',
        message: `Task storage issue: ${error.message}`
      };
    }
  },
  interval: 120000,
  timeout: 5000
});

// Health endpoint for monitoring
export function getSystemHealth() {
  return {
    ...resilienceFramework.getSystemHealth(),
    customChecks: healthMonitor.getStatus()
  };
}
```

## 🧪 Testing Migration

### Unit Tests

```javascript
import { describe, test, expect } from '@jest/globals';
import { resilienceFramework } from '../src/resilience/index.js';

describe('Migration Tests', () => {
  test('should maintain backward compatibility', async () => {
    // Test that migrated functions work the same way
    const oldResult = await oldErrorHandlingFunction();
    const newResult = await newResilienceFunction();
    
    expect(newResult.success).toBe(oldResult.success);
    expect(newResult.data).toEqual(oldResult.data);
  });
  
  test('should provide enhanced error information', async () => {
    try {
      await newResilienceFunction();
    } catch (error) {
      expect(error.resilience).toBeDefined();
      expect(error.resilience.classification).toBeDefined();
      expect(error.resilience.context).toBeDefined();
    }
  });
});
```

### Integration Tests

```javascript
describe('End-to-End Migration', () => {
  test('should handle complete workflow with resilience', async () => {
    // Test full workflow from CLI to AI service
    const result = await executeCliCommand('parse-prd', {
      file: 'test.md',
      numTasks: 5
    });
    
    expect(result.success).toBe(true);
    
    // Verify resilience metrics were collected
    const health = resilienceFramework.getSystemHealth();
    expect(health.components.retryManager.totalAttempts).toBeGreaterThan(0);
  });
});
```

## 📊 Monitoring Migration Success

### Key Metrics to Track

1. **Error Rate Reduction**
   ```javascript
   const metrics = unifiedLogger.getErrorMetrics();
   console.log(`Total errors: ${metrics.totalErrors}`);
   console.log(`Error rate by context:`, metrics.errorRates);
   ```

2. **Circuit Breaker Effectiveness**
   ```javascript
   const circuitStats = resilienceFramework.circuitBreakerRegistry.getAllStats();
   const openCircuits = circuitStats.filter(s => s.state === 'open');
   console.log(`Open circuits: ${openCircuits.length}/${circuitStats.length}`);
   ```

3. **Retry Success Rate**
   ```javascript
   const retryStats = resilienceFramework.retryManager.getStats();
   const successRate = retryStats.successfulRetries / 
     (retryStats.successfulRetries + retryStats.failedRetries);
   console.log(`Retry success rate: ${(successRate * 100).toFixed(2)}%`);
   ```

4. **System Health Trends**
   ```javascript
   const health = resilienceFramework.getSystemHealth();
   console.log(`Overall health: ${health.overall}`);
   console.log(`Component health:`, 
     Object.entries(health.components).map(([name, comp]) => 
       `${name}: ${comp.status}`
     )
   );
   ```

## 🚨 Common Migration Issues

### Issue 1: Circular Dependencies

**Problem**: Importing resilience framework creates circular dependencies.

**Solution**: Use dynamic imports or dependency injection.

```javascript
// Instead of direct import
import { resilienceFramework } from '../resilience/index.js';

// Use dynamic import
async function withResilience(operation, options) {
  const { resilienceFramework } = await import('../resilience/index.js');
  return resilienceFramework.executeWithResilience(operation, options);
}
```

### Issue 2: Performance Overhead

**Problem**: Resilience framework adds latency to operations.

**Solution**: Configure appropriately and disable for non-critical operations.

```javascript
// Disable resilience for fast, non-critical operations
const result = await resilienceFramework.executeWithResilience(
  fastOperation,
  {
    operationName: 'fast_op',
    enableRetries: false,
    enableCircuitBreaker: false
  }
);
```

### Issue 3: Log Volume Increase

**Problem**: Unified logging produces too many logs.

**Solution**: Adjust log levels and use filtering.

```javascript
import { unifiedLogger, LOG_LEVELS } from '../resilience/index.js';

// Reduce log level in production
unifiedLogger.updateConfig({
  level: LOG_LEVELS.WARN, // Only warn and above
  silentMode: process.env.NODE_ENV === 'test'
});
```

## ✅ Migration Checklist

### Phase 1: Core Components
- [ ] Migrate AI services retry logic
- [ ] Replace MCP server error responses
- [ ] Update CLI error handling
- [ ] Consolidate logging systems

### Phase 2: Advanced Features
- [ ] Add circuit breakers for external services
- [ ] Implement health monitoring
- [ ] Set up auto-recovery rules
- [ ] Configure alerting

### Phase 3: Optimization
- [ ] Tune retry configurations
- [ ] Optimize circuit breaker thresholds
- [ ] Adjust logging levels
- [ ] Monitor performance impact

### Phase 4: Validation
- [ ] Run comprehensive tests
- [ ] Verify error handling consistency
- [ ] Check performance benchmarks
- [ ] Validate monitoring dashboards

## 📚 Additional Resources

- [Resilience Framework API Reference](./README.md#api-reference)
- [Error Classification Guide](./docs/error-classification.md)
- [Circuit Breaker Best Practices](./docs/circuit-breakers.md)
- [Performance Tuning Guide](./docs/performance-tuning.md)
- [Monitoring Setup](./docs/monitoring-setup.md)

## 🆘 Getting Help

If you encounter issues during migration:

1. Check the [troubleshooting section](./README.md#troubleshooting)
2. Review the [test suite](./src/resilience/__tests__/) for examples
3. Enable debug logging to understand framework behavior
4. Create an issue with migration-specific details

Remember: The goal is zero redundancy with enhanced reliability. Take time to understand each component before migrating to ensure a smooth transition.

