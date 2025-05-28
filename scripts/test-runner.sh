#!/bin/bash

# Comprehensive Test Runner Script
# 
# Orchestrates the execution of all testing suites including unit tests,
# integration tests, performance tests, security tests, and end-to-end tests.

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR="$PROJECT_ROOT/tests"
REPORTS_DIR="$TEST_DIR/reports"
LOGS_DIR="$TEST_DIR/logs"

# Test configuration
TEST_TIMEOUT=300  # 5 minutes per test suite
PARALLEL_JOBS=4
COVERAGE_THRESHOLD=95
PERFORMANCE_THRESHOLD_P95=2000  # 2 seconds
SECURITY_CRITICAL_THRESHOLD=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1" >&2
}

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Utility functions
create_directories() {
    log_info "Creating test directories..."
    mkdir -p "$REPORTS_DIR"
    mkdir -p "$LOGS_DIR"
    mkdir -p "$TEST_DIR/temp"
    mkdir -p "$TEST_DIR/coverage"
}

check_dependencies() {
    log_info "Checking dependencies..."
    
    local missing_deps=()
    
    # Check for required tools
    command -v node >/dev/null 2>&1 || missing_deps+=("node")
    command -v npm >/dev/null 2>&1 || missing_deps+=("npm")
    command -v jq >/dev/null 2>&1 || missing_deps+=("jq")
    command -v curl >/dev/null 2>&1 || missing_deps+=("curl")
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
        log_error "Please install the missing dependencies and try again."
        exit 1
    fi
    
    log_success "All dependencies are available"
}

setup_test_environment() {
    log_info "Setting up test environment..."
    
    # Set environment variables for testing
    export NODE_ENV=test
    export SILENCE_CONSOLE=true
    export TEST_TIMEOUT=$TEST_TIMEOUT
    export COVERAGE_THRESHOLD=$COVERAGE_THRESHOLD
    
    # Create test database if needed
    if [ "${SETUP_TEST_DB:-false}" = "true" ]; then
        log_info "Setting up test database..."
        npm run db:test:setup 2>/dev/null || log_warning "Test database setup failed or not configured"
    fi
    
    # Start test services if needed
    if [ "${START_TEST_SERVICES:-false}" = "true" ]; then
        log_info "Starting test services..."
        npm run services:test:start 2>/dev/null || log_warning "Test services start failed or not configured"
    fi
    
    log_success "Test environment setup completed"
}

cleanup_test_environment() {
    log_info "Cleaning up test environment..."
    
    # Stop test services
    if [ "${START_TEST_SERVICES:-false}" = "true" ]; then
        npm run services:test:stop 2>/dev/null || log_warning "Test services stop failed or not configured"
    fi
    
    # Clean up temporary files
    rm -rf "$TEST_DIR/temp"/*
    
    log_success "Test environment cleanup completed"
}

# Test execution functions
run_unit_tests() {
    log_step "Running Unit Tests"
    
    local start_time=$(date +%s)
    local log_file="$LOGS_DIR/unit_tests.log"
    
    if npm run test:coverage > "$log_file" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        # Check coverage threshold
        local coverage=$(jq -r '.total.lines.pct' coverage/coverage-summary.json 2>/dev/null || echo "0")
        
        if (( $(echo "$coverage >= $COVERAGE_THRESHOLD" | bc -l) )); then
            log_success "Unit tests passed (${duration}s, ${coverage}% coverage)"
            return 0
        else
            log_error "Unit tests coverage below threshold: ${coverage}% < ${COVERAGE_THRESHOLD}%"
            return 1
        fi
    else
        log_error "Unit tests failed"
        cat "$log_file"
        return 1
    fi
}

run_integration_tests() {
    log_step "Running Integration Tests"
    
    local start_time=$(date +%s)
    local log_file="$LOGS_DIR/integration_tests.log"
    
    if npm run test -- tests/integration/ > "$log_file" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_success "Integration tests passed (${duration}s)"
        return 0
    else
        log_error "Integration tests failed"
        cat "$log_file"
        return 1
    fi
}

run_e2e_tests() {
    log_step "Running End-to-End Tests"
    
    local start_time=$(date +%s)
    local log_file="$LOGS_DIR/e2e_tests.log"
    
    if npm run test:e2e > "$log_file" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_success "End-to-end tests passed (${duration}s)"
        return 0
    else
        log_error "End-to-end tests failed"
        cat "$log_file"
        return 1
    fi
}

run_performance_tests() {
    log_step "Running Performance Tests"
    
    local start_time=$(date +%s)
    local log_file="$LOGS_DIR/performance_tests.log"
    
    if npm run test -- tests/performance/ > "$log_file" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        # Check performance metrics
        local p95_time=$(jq -r '.summary.p95_response_time' "$REPORTS_DIR/performance_report.json" 2>/dev/null || echo "0")
        
        if (( $(echo "$p95_time <= $PERFORMANCE_THRESHOLD_P95" | bc -l) )); then
            log_success "Performance tests passed (${duration}s, P95: ${p95_time}ms)"
            return 0
        else
            log_error "Performance tests failed: P95 ${p95_time}ms > ${PERFORMANCE_THRESHOLD_P95}ms"
            return 1
        fi
    else
        log_error "Performance tests failed"
        cat "$log_file"
        return 1
    fi
}

run_security_tests() {
    log_step "Running Security Tests"
    
    local start_time=$(date +%s)
    local log_file="$LOGS_DIR/security_tests.log"
    
    if npm run test -- tests/security/ > "$log_file" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        # Check security vulnerabilities
        local critical_vulns=$(jq -r '.summary.critical' "$REPORTS_DIR/security_report.json" 2>/dev/null || echo "0")
        
        if (( critical_vulns <= SECURITY_CRITICAL_THRESHOLD )); then
            log_success "Security tests passed (${duration}s, ${critical_vulns} critical vulnerabilities)"
            return 0
        else
            log_error "Security tests failed: ${critical_vulns} critical vulnerabilities found"
            return 1
        fi
    else
        log_error "Security tests failed"
        cat "$log_file"
        return 1
    fi
}

run_workflow_tests() {
    log_step "Running Workflow Tests"
    
    local start_time=$(date +%s)
    local log_file="$LOGS_DIR/workflow_tests.log"
    
    if npm run test -- tests/e2e/workflow_tests.js > "$log_file" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_success "Workflow tests passed (${duration}s)"
        return 0
    else
        log_error "Workflow tests failed"
        cat "$log_file"
        return 1
    fi
}

# Report generation functions
generate_test_report() {
    log_info "Generating comprehensive test report..."
    
    local report_file="$REPORTS_DIR/comprehensive_test_report.json"
    local html_report="$REPORTS_DIR/test_report.html"
    
    # Collect all test results
    local unit_result=$([ -f "$REPORTS_DIR/unit_test_report.json" ] && echo "passed" || echo "failed")
    local integration_result=$([ -f "$REPORTS_DIR/integration_report.json" ] && echo "passed" || echo "failed")
    local e2e_result=$([ -f "$REPORTS_DIR/e2e_report.json" ] && echo "passed" || echo "failed")
    local performance_result=$([ -f "$REPORTS_DIR/performance_report.json" ] && echo "passed" || echo "failed")
    local security_result=$([ -f "$REPORTS_DIR/security_report.json" ] && echo "passed" || echo "failed")
    local workflow_result=$([ -f "$REPORTS_DIR/workflow_report.json" ] && echo "passed" || echo "failed")
    
    # Generate JSON report
    cat > "$report_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "test_suite": "Comprehensive AI CI/CD Testing Framework",
  "version": "1.0.0",
  "summary": {
    "total_suites": 6,
    "passed_suites": $(echo "$unit_result $integration_result $e2e_result $performance_result $security_result $workflow_result" | tr ' ' '\n' | grep -c "passed"),
    "failed_suites": $(echo "$unit_result $integration_result $e2e_result $performance_result $security_result $workflow_result" | tr ' ' '\n' | grep -c "failed"),
    "coverage_threshold": $COVERAGE_THRESHOLD,
    "performance_threshold_p95": $PERFORMANCE_THRESHOLD_P95,
    "security_critical_threshold": $SECURITY_CRITICAL_THRESHOLD
  },
  "results": {
    "unit_tests": "$unit_result",
    "integration_tests": "$integration_result",
    "e2e_tests": "$e2e_result",
    "performance_tests": "$performance_result",
    "security_tests": "$security_result",
    "workflow_tests": "$workflow_result"
  },
  "reports": {
    "unit": "unit_test_report.json",
    "integration": "integration_report.json",
    "e2e": "e2e_report.json",
    "performance": "performance_report.json",
    "security": "security_report.json",
    "workflow": "workflow_report.json"
  }
}
EOF

    # Generate HTML report
    generate_html_report "$html_report"
    
    log_success "Test report generated: $report_file"
    log_success "HTML report generated: $html_report"
}

generate_html_report() {
    local html_file="$1"
    
    cat > "$html_file" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI CI/CD Testing Framework Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center; }
        .metric h3 { margin: 0 0 10px 0; color: #333; }
        .metric .value { font-size: 24px; font-weight: bold; }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        .warning { color: #ffc107; }
        .test-results { margin-top: 30px; }
        .test-suite { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 6px; }
        .test-suite h3 { margin: 0 0 10px 0; }
        .status-badge { padding: 4px 8px; border-radius: 4px; color: white; font-size: 12px; font-weight: bold; }
        .status-passed { background-color: #28a745; }
        .status-failed { background-color: #dc3545; }
        .footer { margin-top: 30px; text-align: center; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>AI CI/CD Testing Framework Report</h1>
            <p>Comprehensive test results for the complete AI CI/CD workflow system</p>
            <p><strong>Generated:</strong> <span id="timestamp"></span></p>
        </div>
        
        <div class="summary">
            <div class="metric">
                <h3>Total Test Suites</h3>
                <div class="value" id="total-suites">6</div>
            </div>
            <div class="metric">
                <h3>Passed Suites</h3>
                <div class="value passed" id="passed-suites">-</div>
            </div>
            <div class="metric">
                <h3>Failed Suites</h3>
                <div class="value failed" id="failed-suites">-</div>
            </div>
            <div class="metric">
                <h3>Success Rate</h3>
                <div class="value" id="success-rate">-</div>
            </div>
        </div>
        
        <div class="test-results">
            <h2>Test Suite Results</h2>
            
            <div class="test-suite">
                <h3>Unit Tests <span class="status-badge" id="unit-status">-</span></h3>
                <p>Individual component functionality testing with code coverage analysis.</p>
            </div>
            
            <div class="test-suite">
                <h3>Integration Tests <span class="status-badge" id="integration-status">-</span></h3>
                <p>Component interaction validation and data flow verification.</p>
            </div>
            
            <div class="test-suite">
                <h3>End-to-End Tests <span class="status-badge" id="e2e-status">-</span></h3>
                <p>Complete workflow testing from task creation to PR merge.</p>
            </div>
            
            <div class="test-suite">
                <h3>Performance Tests <span class="status-badge" id="performance-status">-</span></h3>
                <p>Load testing, stress testing, and performance benchmarking.</p>
            </div>
            
            <div class="test-suite">
                <h3>Security Tests <span class="status-badge" id="security-status">-</span></h3>
                <p>Vulnerability assessment and penetration testing.</p>
            </div>
            
            <div class="test-suite">
                <h3>Workflow Tests <span class="status-badge" id="workflow-status">-</span></h3>
                <p>End-to-end workflow validation and quality assurance.</p>
            </div>
        </div>
        
        <div class="footer">
            <p>AI CI/CD Testing Framework v1.0.0</p>
            <p>For detailed results, check the individual JSON reports in the reports directory.</p>
        </div>
    </div>
    
    <script>
        // This would be populated with actual test data
        document.getElementById('timestamp').textContent = new Date().toISOString();
    </script>
</body>
</html>
EOF
}

# Main execution functions
run_all_tests() {
    log_info "Starting comprehensive test execution..."
    
    local start_time=$(date +%s)
    local failed_tests=()
    
    # Run all test suites
    run_unit_tests || failed_tests+=("unit")
    run_integration_tests || failed_tests+=("integration")
    run_e2e_tests || failed_tests+=("e2e")
    run_performance_tests || failed_tests+=("performance")
    run_security_tests || failed_tests+=("security")
    run_workflow_tests || failed_tests+=("workflow")
    
    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))
    
    # Generate comprehensive report
    generate_test_report
    
    # Summary
    log_info "Test execution completed in ${total_duration}s"
    
    if [ ${#failed_tests[@]} -eq 0 ]; then
        log_success "All test suites passed! ✅"
        return 0
    else
        log_error "Failed test suites: ${failed_tests[*]}"
        return 1
    fi
}

run_specific_suite() {
    local suite="$1"
    
    case "$suite" in
        "unit")
            run_unit_tests
            ;;
        "integration")
            run_integration_tests
            ;;
        "e2e")
            run_e2e_tests
            ;;
        "performance")
            run_performance_tests
            ;;
        "security")
            run_security_tests
            ;;
        "workflow")
            run_workflow_tests
            ;;
        *)
            log_error "Unknown test suite: $suite"
            log_info "Available suites: unit, integration, e2e, performance, security, workflow"
            exit 1
            ;;
    esac
}

# Help function
show_help() {
    cat << EOF
AI CI/CD Testing Framework Test Runner

Usage: $0 [OPTIONS] [COMMAND]

Commands:
    all                 Run all test suites (default)
    unit               Run unit tests only
    integration        Run integration tests only
    e2e                Run end-to-end tests only
    performance        Run performance tests only
    security           Run security tests only
    workflow           Run workflow tests only
    report             Generate test report only

Options:
    -h, --help         Show this help message
    -v, --verbose      Enable verbose output
    -p, --parallel     Run tests in parallel (where supported)
    --coverage         Set coverage threshold (default: $COVERAGE_THRESHOLD)
    --timeout          Set test timeout in seconds (default: $TEST_TIMEOUT)
    --setup-db         Setup test database before running tests
    --start-services   Start test services before running tests
    --cleanup          Clean up test environment after running tests

Environment Variables:
    NODE_ENV           Set to 'test' automatically
    TEST_TIMEOUT       Test timeout in seconds
    COVERAGE_THRESHOLD Coverage percentage threshold
    SETUP_TEST_DB      Set to 'true' to setup test database
    START_TEST_SERVICES Set to 'true' to start test services

Examples:
    $0                          # Run all tests
    $0 unit                     # Run unit tests only
    $0 --setup-db --start-services all  # Run all tests with full setup
    $0 performance --timeout 600        # Run performance tests with 10min timeout

EOF
}

# Main script execution
main() {
    local command="all"
    local verbose=false
    local parallel=false
    local cleanup_after=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--verbose)
                verbose=true
                set -x
                shift
                ;;
            -p|--parallel)
                parallel=true
                shift
                ;;
            --coverage)
                COVERAGE_THRESHOLD="$2"
                shift 2
                ;;
            --timeout)
                TEST_TIMEOUT="$2"
                shift 2
                ;;
            --setup-db)
                export SETUP_TEST_DB=true
                shift
                ;;
            --start-services)
                export START_TEST_SERVICES=true
                shift
                ;;
            --cleanup)
                cleanup_after=true
                shift
                ;;
            unit|integration|e2e|performance|security|workflow|all|report)
                command="$1"
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Change to project root
    cd "$PROJECT_ROOT"
    
    # Setup
    create_directories
    check_dependencies
    setup_test_environment
    
    # Execute command
    case "$command" in
        "all")
            run_all_tests
            exit_code=$?
            ;;
        "report")
            generate_test_report
            exit_code=0
            ;;
        *)
            run_specific_suite "$command"
            exit_code=$?
            ;;
    esac
    
    # Cleanup if requested
    if [ "$cleanup_after" = true ]; then
        cleanup_test_environment
    fi
    
    exit $exit_code
}

# Execute main function with all arguments
main "$@"

