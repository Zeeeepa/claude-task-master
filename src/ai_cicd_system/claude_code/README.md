# Claude Code WSL2 Integration

A comprehensive WSL2-based deployment pipeline for automated code validation, testing, and error resolution with intelligent feedback loops to the AI CI/CD system.

## 🎯 Overview

This integration provides a complete solution for validating pull requests using isolated WSL2 environments. It combines automated deployment, comprehensive code analysis, testing, and intelligent error resolution to ensure code quality and reliability.

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WSL2 Manager  │    │ Deployment      │    │ Validation      │
│                 │◄──►│ Pipeline        │◄──►│ Engine          │
│ • Provisioning  │    │                 │    │                 │
│ • Resource Mgmt │    │ • Git Cloning   │    │ • Syntax Check  │
│ • Scaling       │    │ • Dependencies  │    │ • Quality Scan  │
│ • Cleanup       │    │ • Build Process │    │ • Security Scan │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Test Executor   │    │ Main            │    │ Error Resolver  │
│                 │◄──►│ Integration     │◄──►│                 │
│ • Test Discovery│    │                 │    │ • Error Analysis│
│ • Execution     │    │ • Orchestration │    │ • Auto-fixing   │
│ • Coverage      │    │ • Feedback      │    │ • Learning      │
│ • Benchmarking  │    │ • Monitoring    │    │ • Suggestions   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Features

### WSL2 Environment Management
- **Automated Provisioning**: On-demand WSL2 instance creation
- **Resource Allocation**: CPU, memory, and storage management
- **Environment Isolation**: Secure, isolated validation environments
- **Scaling**: Dynamic scaling based on demand
- **Cleanup**: Automatic resource cleanup and optimization

### Deployment Pipeline
- **Git Integration**: Automatic PR branch cloning and checkout
- **Dependency Management**: Automated dependency installation
- **Build Automation**: Configurable build process execution
- **Artifact Management**: Build artifact collection and storage
- **Environment Configuration**: Custom environment variable setup

### Validation Engine
- **Multi-language Support**: JavaScript, TypeScript, Python, Java, Go, Rust, PHP, Ruby
- **Syntax Validation**: Comprehensive syntax checking
- **Code Quality Analysis**: Complexity, duplication, maintainability metrics
- **Security Scanning**: Vulnerability detection and risk assessment
- **Performance Analysis**: Bundle size, load time, memory usage analysis
- **Documentation Validation**: Code documentation coverage checking

### Test Execution Framework
- **Test Discovery**: Automatic test file detection
- **Multi-framework Support**: Jest, Mocha, Pytest, JUnit, Go test, Cargo test
- **Coverage Reporting**: Comprehensive test coverage analysis
- **Performance Benchmarking**: Test performance monitoring
- **Integration Testing**: End-to-end and API test execution
- **Parallel Execution**: Concurrent test execution with resource limits

### Error Resolution System
- **Intelligent Analysis**: Pattern-based error categorization
- **Auto-fixing**: Automated resolution for common issues
- **Learning System**: Continuous improvement from resolution attempts
- **Suggestion Engine**: Contextual fix recommendations
- **Backup & Recovery**: Safe auto-fixing with rollback capability

## 📦 Installation

### Prerequisites

1. **Windows with WSL2**: Ensure WSL2 is installed and configured
2. **Docker Desktop**: With WSL2 backend enabled
3. **Node.js**: Version 18 or higher
4. **Git**: For repository operations

### Setup

1. **Run the setup script**:
   ```bash
   ./scripts/wsl2-setup.sh
   ```

2. **Verify installation**:
   ```bash
   ./scripts/status-wsl2.sh
   ```

3. **Start the environment**:
   ```bash
   ./scripts/start-wsl2.sh
   ```

## 🔧 Configuration

### Basic Configuration

```javascript
import ClaudeCodeWSL2Integration from './src/ai_cicd_system/claude_code/index.js';

const integration = new ClaudeCodeWSL2Integration({
  maxConcurrentValidations: 3,
  validationTimeout: 30 * 60 * 1000, // 30 minutes
  autoErrorResolution: true,
  feedbackEnabled: true,
  
  wsl2: {
    maxInstances: 10,
    defaultCpuCores: 4,
    defaultMemoryGB: 8,
    defaultStorageGB: 20
  },
  
  deployment: {
    workspaceRoot: '/tmp/claude-code-deployments',
    gitTimeout: 5 * 60 * 1000,
    buildTimeout: 10 * 60 * 1000,
    maxConcurrentDeployments: 5
  },
  
  validation: {
    validationTimeout: 10 * 60 * 1000,
    supportedLanguages: ['javascript', 'typescript', 'python'],
    qualityThresholds: {
      minScore: 7.0,
      maxComplexity: 10,
      minCoverage: 80
    }
  },
  
  testing: {
    testTimeout: 15 * 60 * 1000,
    maxConcurrentTests: 3,
    coverageThreshold: 80,
    testFrameworks: ['jest', 'pytest']
  },
  
  errorResolution: {
    maxResolutionAttempts: 3,
    autoFixEnabled: true,
    confidenceThreshold: 0.7
  }
});
```

### Environment Variables

```bash
# WSL2 Configuration
CLAUDE_CODE_WSL2_MAX_INSTANCES=10
CLAUDE_CODE_WSL2_DEFAULT_CPU=4
CLAUDE_CODE_WSL2_DEFAULT_MEMORY=8

# Deployment Configuration
CLAUDE_CODE_DEPLOYMENT_TIMEOUT=600000
CLAUDE_CODE_BUILD_TIMEOUT=900000

# Validation Configuration
CLAUDE_CODE_VALIDATION_TIMEOUT=600000
CLAUDE_CODE_QUALITY_THRESHOLD=7.0

# Testing Configuration
CLAUDE_CODE_TEST_TIMEOUT=900000
CLAUDE_CODE_COVERAGE_THRESHOLD=80

# Error Resolution Configuration
CLAUDE_CODE_AUTO_FIX_ENABLED=true
CLAUDE_CODE_MAX_RESOLUTION_ATTEMPTS=3
```

## 📖 Usage

### Basic PR Validation

```javascript
// Initialize the integration
await integration.initialize();

// Validate a pull request
const result = await integration.validatePRBranch({
  repositoryUrl: 'https://github.com/user/repo.git',
  branchName: 'feature/new-feature',
  prNumber: 123,
  title: 'Add new feature'
}, {
  deployment: {
    cpuCores: 4,
    memoryGB: 8,
    environment: {
      NODE_ENV: 'test'
    }
  },
  validation: {
    includeSecurityScan: true,
    includePerformanceAnalysis: true
  },
  testing: {
    includeCoverage: true,
    includePerformanceBenchmarks: true
  }
});

console.log('Validation Result:', result);
```

### Quick Validation (Syntax Only)

```javascript
const quickResult = await integration.quickValidate({
  repositoryUrl: 'https://github.com/user/repo.git',
  branchName: 'feature/quick-fix',
  prNumber: 124,
  title: 'Quick bug fix'
});

console.log('Quick Validation Result:', quickResult);
```

### Monitor Validation Progress

```javascript
const validationId = 'validation-123456789-abc';
const status = integration.getValidationStatus(validationId);

console.log('Validation Status:', status);
// Output: { status: 'running', progress: 45, currentStep: 'testing' }
```

### Get System Status

```javascript
const systemStatus = integration.getStatus();

console.log('System Status:', systemStatus);
// Output: Complete status of all components and metrics
```

## 🔍 Validation Flow

The validation process follows this comprehensive flow:

1. **WSL2 Provisioning** (< 2 minutes)
   - Create isolated WSL2 instance
   - Allocate resources (CPU, memory, storage)
   - Setup development environment

2. **Branch Deployment** (< 3 minutes)
   - Clone repository
   - Checkout PR branch
   - Install dependencies
   - Execute build process

3. **Code Validation** (< 5 minutes)
   - Syntax validation
   - Code quality analysis
   - Security vulnerability scanning
   - Performance analysis
   - Documentation validation

4. **Test Execution** (< 10 minutes)
   - Test discovery
   - Unit test execution
   - Integration test execution
   - Coverage analysis
   - Performance benchmarking

5. **Error Analysis & Resolution** (< 5 minutes)
   - Error categorization
   - Pattern matching
   - Auto-fix attempts
   - Resolution validation

6. **Feedback Generation** (< 1 minute)
   - Compile results
   - Generate recommendations
   - Create action items
   - Provide next steps

7. **Cleanup** (< 1 minute)
   - Destroy WSL2 instance
   - Release resources
   - Archive results

## 📊 Metrics & Monitoring

### Performance Metrics

- **Environment Provisioning Time**: < 2 minutes
- **Code Validation Completion**: < 5 minutes
- **Error Resolution Success Rate**: > 80%
- **System Resource Utilization**: < 70%

### Success Metrics

```javascript
const metrics = integration.getStatus().metrics;

console.log('Validation Metrics:', {
  successRate: metrics.successRate,
  averageValidationTime: metrics.averageValidationTime,
  errorsResolved: metrics.errorsResolved,
  performanceMetrics: metrics.performanceMetrics
});
```

## 🛠️ Management Scripts

### Start WSL2 Environment
```bash
./scripts/start-wsl2.sh
```

### Stop WSL2 Environment
```bash
./scripts/stop-wsl2.sh
```

### Check Status
```bash
./scripts/status-wsl2.sh
```

### Cleanup Environment
```bash
./scripts/cleanup-wsl2.sh
```

## 🔧 Troubleshooting

### Common Issues

1. **WSL2 Not Available**
   ```bash
   # Enable WSL2
   wsl --set-default-version 2
   ```

2. **Docker Not Running**
   ```bash
   # Start Docker Desktop
   # Ensure WSL2 backend is enabled
   ```

3. **Resource Allocation Issues**
   ```bash
   # Check available resources
   ./scripts/status-wsl2.sh
   
   # Adjust configuration
   # Edit ~/.wslconfig
   ```

4. **Network Connectivity Issues**
   ```bash
   # Check Docker network
   docker network ls | grep claude-code-wsl2-network
   
   # Recreate network if needed
   docker network rm claude-code-wsl2-network
   docker network create --subnet=172.20.0.0/16 claude-code-wsl2-network
   ```

### Debug Mode

Enable debug logging:

```javascript
const integration = new ClaudeCodeWSL2Integration({
  debug: true,
  logLevel: 'debug'
});
```

### Log Files

- **WSL2 Logs**: `~/workspace/logs/wsl2-manager.log`
- **Deployment Logs**: `~/workspace/logs/deployment-pipeline.log`
- **Validation Logs**: `~/workspace/logs/validation-engine.log`
- **Test Logs**: `~/workspace/logs/test-executor.log`
- **Error Resolution Logs**: `~/workspace/logs/error-resolver.log`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:

1. Check the troubleshooting section
2. Review the logs for error details
3. Create an issue in the repository
4. Contact the development team

## 🔄 Integration Points

### AgentAPI Middleware
- Task processing and result communication
- Status updates and progress tracking
- Error reporting and resolution feedback

### GitHub API
- PR branch access and status updates
- Comment posting and feedback delivery
- Check status updates

### PostgreSQL Database
- Validation result storage
- Metrics and analytics data
- Error pattern learning data

### Monitoring System
- Performance tracking
- Error monitoring
- Resource utilization metrics

## 🚀 Future Enhancements

- **Multi-cloud Support**: Azure, AWS, GCP integration
- **Advanced ML**: Machine learning for error prediction
- **Custom Validators**: Plugin system for custom validation rules
- **Real-time Collaboration**: Live validation feedback
- **Advanced Analytics**: Detailed performance insights

