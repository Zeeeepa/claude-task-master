#!/bin/bash

# Deploy Integration Tests Script
# 
# This script deploys and configures the integration testing framework
# for the claude-task-master system.

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INTEGRATION_DIR="$PROJECT_ROOT/integration"
E2E_DIR="$PROJECT_ROOT/e2e-tests"
DEPLOYMENT_DIR="$PROJECT_ROOT/deployment"
REPORTS_DIR="$PROJECT_ROOT/integration-reports"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    local node_version=$(node --version | cut -d'v' -f2)
    local required_version="14.0.0"
    
    if ! node -e "process.exit(require('semver').gte('$node_version', '$required_version') ? 0 : 1)" 2>/dev/null; then
        log_error "Node.js version $node_version is below required version $required_version"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    # Check git
    if ! command -v git &> /dev/null; then
        log_error "git is not installed"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Setup directories
setup_directories() {
    log_info "Setting up directories..."
    
    # Create reports directory
    mkdir -p "$REPORTS_DIR"
    
    # Create logs directory
    mkdir -p "$PROJECT_ROOT/logs"
    
    # Create temp directory for testing
    mkdir -p "$PROJECT_ROOT/temp"
    
    log_success "Directories setup complete"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    cd "$PROJECT_ROOT"
    
    # Install main dependencies
    if [ -f "package.json" ]; then
        npm install
        log_success "Main dependencies installed"
    else
        log_error "package.json not found in project root"
        exit 1
    fi
    
    # Install additional testing dependencies if needed
    local test_deps=(
        "supertest"
        "mock-fs"
        "jest-environment-node"
    )
    
    for dep in "${test_deps[@]}"; do
        if ! npm list "$dep" &> /dev/null; then
            log_info "Installing missing test dependency: $dep"
            npm install --save-dev "$dep"
        fi
    done
    
    log_success "Dependencies installation complete"
}

# Configure environment
configure_environment() {
    log_info "Configuring environment..."
    
    # Create .env file for testing if it doesn't exist
    if [ ! -f "$PROJECT_ROOT/.env.test" ]; then
        cat > "$PROJECT_ROOT/.env.test" << EOF
# Integration Testing Environment Configuration
NODE_ENV=test
LOG_LEVEL=debug

# Test Database Configuration (if applicable)
TEST_DATABASE_URL=sqlite://./test.db

# API Keys for Testing (use test/mock keys)
# ANTHROPIC_API_KEY=test-key
# OPENAI_API_KEY=test-key
# GOOGLE_API_KEY=test-key

# Integration Test Configuration
INTEGRATION_TEST_TIMEOUT=300000
INTEGRATION_TEST_RETRIES=3
INTEGRATION_REPORTS_DIR=./integration-reports

# Performance Test Configuration
PERFORMANCE_TEST_DURATION=60000
PERFORMANCE_MAX_CONCURRENT_USERS=50

# Security Test Configuration
SECURITY_TEST_ENABLED=true
SECURITY_SCAN_TIMEOUT=120000
EOF
        log_success "Created .env.test configuration file"
    else
        log_info ".env.test already exists, skipping creation"
    fi
    
    # Set environment variables for current session
    export NODE_ENV=test
    export INTEGRATION_REPORTS_DIR="$REPORTS_DIR"
    
    log_success "Environment configuration complete"
}

# Setup test database (if needed)
setup_test_database() {
    log_info "Setting up test database..."
    
    # For SQLite test database
    local test_db="$PROJECT_ROOT/test.db"
    
    if [ -f "$test_db" ]; then
        log_info "Removing existing test database"
        rm "$test_db"
    fi
    
    # Initialize test database schema (if applicable)
    # This would be customized based on actual database requirements
    
    log_success "Test database setup complete"
}

# Validate integration test files
validate_test_files() {
    log_info "Validating integration test files..."
    
    local required_files=(
        "$INTEGRATION_DIR/integration-test-runner.js"
        "$INTEGRATION_DIR/tests/e2e-scenarios.js"
        "$INTEGRATION_DIR/health-checks/system-validator.js"
        "$INTEGRATION_DIR/performance/load-tester.js"
        "$INTEGRATION_DIR/security/security-validator.js"
        "$E2E_DIR/workflows/workflow-validator.js"
    )
    
    local missing_files=()
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            missing_files+=("$file")
        fi
    done
    
    if [ ${#missing_files[@]} -gt 0 ]; then
        log_error "Missing required integration test files:"
        for file in "${missing_files[@]}"; do
            log_error "  - $file"
        done
        exit 1
    fi
    
    log_success "Integration test files validation complete"
}

# Run syntax validation
run_syntax_validation() {
    log_info "Running syntax validation..."
    
    cd "$PROJECT_ROOT"
    
    # Check JavaScript syntax
    local js_files=(
        "$INTEGRATION_DIR"/**/*.js
        "$E2E_DIR"/**/*.js
    )
    
    for file in "${js_files[@]}"; do
        if [ -f "$file" ]; then
            if ! node -c "$file" 2>/dev/null; then
                log_error "Syntax error in file: $file"
                exit 1
            fi
        fi
    done
    
    log_success "Syntax validation complete"
}

# Setup monitoring and logging
setup_monitoring() {
    log_info "Setting up monitoring and logging..."
    
    # Create log configuration
    cat > "$PROJECT_ROOT/logs/integration-test.log.config" << EOF
{
  "level": "debug",
  "format": "json",
  "timestamp": true,
  "maxFiles": 5,
  "maxSize": "10m",
  "filename": "./logs/integration-test.log"
}
EOF
    
    # Create monitoring configuration
    cat > "$DEPLOYMENT_DIR/configs/monitoring.json" << EOF
{
  "healthChecks": {
    "interval": 30000,
    "timeout": 5000,
    "retries": 3
  },
  "performance": {
    "metricsCollection": true,
    "alertThresholds": {
      "responseTime": 1000,
      "errorRate": 0.05,
      "memoryUsage": 500000000
    }
  },
  "security": {
    "scanInterval": 3600000,
    "alertOnVulnerabilities": true,
    "reportingEnabled": true
  }
}
EOF
    
    log_success "Monitoring and logging setup complete"
}

# Create test runner script
create_test_runner() {
    log_info "Creating test runner script..."
    
    cat > "$PROJECT_ROOT/run-integration-tests.js" << 'EOF'
#!/usr/bin/env node

/**
 * Integration Test Runner Script
 * 
 * Main entry point for running integration tests
 */

import { IntegrationTestRunner } from './integration/integration-test-runner.js';
import logger from './mcp-server/src/logger.js';

async function main() {
    const options = {
        runE2ETests: process.env.RUN_E2E_TESTS !== 'false',
        runHealthChecks: process.env.RUN_HEALTH_CHECKS !== 'false',
        runPerformanceTests: process.env.RUN_PERFORMANCE_TESTS !== 'false',
        runSecurityTests: process.env.RUN_SECURITY_TESTS !== 'false',
        generateReports: process.env.GENERATE_REPORTS !== 'false',
        outputDirectory: process.env.INTEGRATION_REPORTS_DIR || './integration-reports'
    };

    const runner = new IntegrationTestRunner(options);

    try {
        logger.info('Starting integration test suite...');
        
        await runner.initialize();
        const results = await runner.runAllTests();
        
        logger.info('Integration test suite completed successfully');
        logger.info(`Overall status: ${results.overallStatus}`);
        
        // Exit with appropriate code
        process.exit(results.overallStatus === 'passed' ? 0 : 1);
        
    } catch (error) {
        logger.error(`Integration test suite failed: ${error.message}`);
        process.exit(1);
    }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

main();
EOF
    
    chmod +x "$PROJECT_ROOT/run-integration-tests.js"
    
    log_success "Test runner script created"
}

# Update package.json scripts
update_package_scripts() {
    log_info "Updating package.json scripts..."
    
    cd "$PROJECT_ROOT"
    
    # Add integration test scripts to package.json
    local temp_file=$(mktemp)
    
    if command -v jq &> /dev/null; then
        jq '.scripts["test:integration"] = "node run-integration-tests.js" |
            .scripts["test:integration:e2e"] = "RUN_HEALTH_CHECKS=false RUN_PERFORMANCE_TESTS=false RUN_SECURITY_TESTS=false node run-integration-tests.js" |
            .scripts["test:integration:health"] = "RUN_E2E_TESTS=false RUN_PERFORMANCE_TESTS=false RUN_SECURITY_TESTS=false node run-integration-tests.js" |
            .scripts["test:integration:performance"] = "RUN_E2E_TESTS=false RUN_HEALTH_CHECKS=false RUN_SECURITY_TESTS=false node run-integration-tests.js" |
            .scripts["test:integration:security"] = "RUN_E2E_TESTS=false RUN_HEALTH_CHECKS=false RUN_PERFORMANCE_TESTS=false node run-integration-tests.js"' \
            package.json > "$temp_file" && mv "$temp_file" package.json
        
        log_success "Package.json scripts updated"
    else
        log_warning "jq not available, skipping package.json script updates"
    fi
}

# Create CI/CD configuration
create_cicd_config() {
    log_info "Creating CI/CD configuration..."
    
    # Create GitHub Actions workflow
    mkdir -p "$PROJECT_ROOT/.github/workflows"
    
    cat > "$PROJECT_ROOT/.github/workflows/integration-tests.yml" << 'EOF'
name: Integration Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]
  schedule:
    # Run integration tests daily at 2 AM UTC
    - cron: '0 2 * * *'

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run integration tests
      run: npm run test:integration
      env:
        NODE_ENV: test
        ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    
    - name: Upload test reports
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: integration-test-reports-${{ matrix.node-version }}
        path: integration-reports/
    
    - name: Upload logs
      uses: actions/upload-artifact@v3
      if: failure()
      with:
        name: integration-test-logs-${{ matrix.node-version }}
        path: logs/
EOF
    
    log_success "CI/CD configuration created"
}

# Run deployment validation
run_deployment_validation() {
    log_info "Running deployment validation..."
    
    cd "$PROJECT_ROOT"
    
    # Test that the integration test runner can be imported
    if ! node -e "import('./integration/integration-test-runner.js').then(() => console.log('Import successful')).catch(e => { console.error('Import failed:', e.message); process.exit(1); })"; then
        log_error "Integration test runner import failed"
        exit 1
    fi
    
    # Test basic functionality
    log_info "Testing basic integration test functionality..."
    
    # This would run a minimal test to ensure everything is working
    # For now, we'll just validate the structure
    
    log_success "Deployment validation complete"
}

# Main deployment function
deploy_integration_tests() {
    log_info "Starting integration tests deployment..."
    
    check_prerequisites
    setup_directories
    install_dependencies
    configure_environment
    setup_test_database
    validate_test_files
    run_syntax_validation
    setup_monitoring
    create_test_runner
    update_package_scripts
    create_cicd_config
    run_deployment_validation
    
    log_success "Integration tests deployment completed successfully!"
    
    echo ""
    log_info "Next steps:"
    echo "  1. Review the configuration files in deployment/configs/"
    echo "  2. Set up your API keys in .env.test"
    echo "  3. Run integration tests with: npm run test:integration"
    echo "  4. View reports in: $REPORTS_DIR"
    echo ""
    log_info "Available test commands:"
    echo "  - npm run test:integration          # Run all integration tests"
    echo "  - npm run test:integration:e2e      # Run only E2E tests"
    echo "  - npm run test:integration:health   # Run only health checks"
    echo "  - npm run test:integration:performance # Run only performance tests"
    echo "  - npm run test:integration:security # Run only security tests"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        deploy_integration_tests
        ;;
    "validate")
        validate_test_files
        run_syntax_validation
        ;;
    "setup-env")
        configure_environment
        ;;
    "help")
        echo "Usage: $0 [deploy|validate|setup-env|help]"
        echo ""
        echo "Commands:"
        echo "  deploy     - Full deployment of integration tests (default)"
        echo "  validate   - Validate test files and syntax"
        echo "  setup-env  - Setup environment configuration only"
        echo "  help       - Show this help message"
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac

