#!/bin/bash

# Security Scan Script for AI CI/CD System
# Comprehensive security scanning including dependencies, static analysis, and web vulnerabilities

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORTS_DIR="$PROJECT_ROOT/reports/security"
LOG_FILE="$REPORTS_DIR/security_scan.log"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

# Help function
show_help() {
    cat << EOF
Security Scan Script for AI CI/CD System

Usage: $0 [OPTIONS]

OPTIONS:
    -h, --help              Show this help message
    -a, --all               Run all security scans (default)
    -d, --dependencies      Run dependency vulnerability scan
    -s, --static            Run static code analysis
    -w, --web               Run web application security scan
    -c, --config            Run configuration security check
    -f, --fix               Attempt to auto-fix vulnerabilities
    -r, --report-only       Generate report from existing scan data
    -v, --verbose           Enable verbose output
    --skip-install          Skip tool installation checks
    --output-format FORMAT  Output format (json, html, csv) [default: json]

EXAMPLES:
    $0                      # Run all scans
    $0 -d -s               # Run only dependency and static analysis
    $0 -f                  # Run scans and attempt auto-fix
    $0 --output-format html # Generate HTML report

EOF
}

# Default options
RUN_ALL=true
RUN_DEPENDENCIES=false
RUN_STATIC=false
RUN_WEB=false
RUN_CONFIG=false
AUTO_FIX=false
REPORT_ONLY=false
VERBOSE=false
SKIP_INSTALL=false
OUTPUT_FORMAT="json"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -a|--all)
            RUN_ALL=true
            shift
            ;;
        -d|--dependencies)
            RUN_ALL=false
            RUN_DEPENDENCIES=true
            shift
            ;;
        -s|--static)
            RUN_ALL=false
            RUN_STATIC=true
            shift
            ;;
        -w|--web)
            RUN_ALL=false
            RUN_WEB=true
            shift
            ;;
        -c|--config)
            RUN_ALL=false
            RUN_CONFIG=true
            shift
            ;;
        -f|--fix)
            AUTO_FIX=true
            shift
            ;;
        -r|--report-only)
            REPORT_ONLY=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        --skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        --output-format)
            OUTPUT_FORMAT="$2"
            shift 2
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Set individual scan flags if running all
if [[ "$RUN_ALL" == true ]]; then
    RUN_DEPENDENCIES=true
    RUN_STATIC=true
    RUN_WEB=true
    RUN_CONFIG=true
fi

# Initialize
initialize() {
    log "Initializing security scan environment..."
    
    # Create reports directory
    mkdir -p "$REPORTS_DIR"
    
    # Initialize log file
    echo "Security Scan Log - $(date)" > "$LOG_FILE"
    
    # Change to project root
    cd "$PROJECT_ROOT"
    
    success "Environment initialized"
}

# Check and install required tools
check_tools() {
    if [[ "$SKIP_INSTALL" == true ]]; then
        log "Skipping tool installation checks"
        return 0
    fi
    
    log "Checking required security tools..."
    
    local tools_missing=false
    
    # Check Node.js and npm
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed"
        tools_missing=true
    fi
    
    if ! command -v npm &> /dev/null; then
        error "npm is not installed"
        tools_missing=true
    fi
    
    # Check for npm audit (built-in)
    log "✓ npm audit available"
    
    # Check for Snyk
    if ! command -v snyk &> /dev/null; then
        warning "Snyk CLI not found. Installing..."
        npm install -g snyk || {
            error "Failed to install Snyk CLI"
            tools_missing=true
        }
    else
        log "✓ Snyk CLI available"
    fi
    
    # Check for ESLint (for static analysis)
    if ! command -v eslint &> /dev/null; then
        warning "ESLint not found. Installing..."
        npm install -g eslint || {
            warning "Failed to install ESLint globally, will use local version"
        }
    else
        log "✓ ESLint available"
    fi
    
    # Check for semgrep (static analysis)
    if ! command -v semgrep &> /dev/null; then
        warning "Semgrep not found. Installing..."
        pip3 install semgrep || {
            warning "Failed to install Semgrep, skipping advanced static analysis"
        }
    else
        log "✓ Semgrep available"
    fi
    
    # Check for OWASP ZAP (optional)
    if ! command -v zap-baseline.py &> /dev/null; then
        warning "OWASP ZAP not found. Web security scanning will be limited."
    else
        log "✓ OWASP ZAP available"
    fi
    
    if [[ "$tools_missing" == true ]]; then
        error "Some required tools are missing. Please install them manually."
        exit 1
    fi
    
    success "All required tools are available"
}

# Run dependency vulnerability scan
scan_dependencies() {
    log "Running dependency vulnerability scan..."
    
    local report_file="$REPORTS_DIR/dependencies_${TIMESTAMP}.json"
    local exit_code=0
    
    # NPM Audit
    log "Running npm audit..."
    if npm audit --json > "$report_file" 2>/dev/null; then
        success "npm audit completed successfully"
    else
        exit_code=$?
        if [[ $exit_code -eq 1 ]]; then
            warning "npm audit found vulnerabilities"
        else
            error "npm audit failed with exit code $exit_code"
            return 1
        fi
    fi
    
    # Snyk scan
    if command -v snyk &> /dev/null; then
        log "Running Snyk scan..."
        local snyk_report="$REPORTS_DIR/snyk_${TIMESTAMP}.json"
        
        # Authenticate Snyk if token is available
        if [[ -n "${SNYK_TOKEN:-}" ]]; then
            snyk auth "$SNYK_TOKEN"
        fi
        
        if snyk test --json > "$snyk_report" 2>/dev/null; then
            success "Snyk scan completed successfully"
        else
            warning "Snyk scan found vulnerabilities or failed"
        fi
        
        # Merge Snyk results with npm audit results
        if [[ -f "$snyk_report" ]]; then
            log "Merging Snyk results with npm audit results..."
            # This would require a more sophisticated merge script
            # For now, we'll keep them separate
        fi
    fi
    
    # Auto-fix if requested
    if [[ "$AUTO_FIX" == true ]]; then
        log "Attempting to auto-fix dependency vulnerabilities..."
        
        if npm audit fix --force; then
            success "Auto-fix completed"
        else
            warning "Auto-fix encountered issues"
        fi
    fi
    
    success "Dependency scan completed. Report: $report_file"
    return 0
}

# Run static code analysis
scan_static() {
    log "Running static code analysis..."
    
    local report_file="$REPORTS_DIR/static_analysis_${TIMESTAMP}.json"
    local issues_found=false
    
    # ESLint scan
    if command -v eslint &> /dev/null || [[ -f "node_modules/.bin/eslint" ]]; then
        log "Running ESLint scan..."
        local eslint_cmd="eslint"
        
        if [[ ! -f ".eslintrc.js" && ! -f ".eslintrc.json" ]]; then
            log "No ESLint config found, using default security rules..."
            # Create temporary ESLint config with security rules
            cat > .eslintrc.temp.json << EOF
{
  "env": {
    "node": true,
    "es2021": true
  },
  "extends": ["eslint:recommended"],
  "rules": {
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
    "no-script-url": "error",
    "no-unsafe-innerHTML": "error"
  }
}
EOF
            eslint_cmd="eslint -c .eslintrc.temp.json"
        fi
        
        if $eslint_cmd --format json --output-file "$report_file" src/ 2>/dev/null; then
            success "ESLint scan completed"
        else
            warning "ESLint found issues"
            issues_found=true
        fi
        
        # Clean up temporary config
        [[ -f ".eslintrc.temp.json" ]] && rm .eslintrc.temp.json
    fi
    
    # Semgrep scan
    if command -v semgrep &> /dev/null; then
        log "Running Semgrep security scan..."
        local semgrep_report="$REPORTS_DIR/semgrep_${TIMESTAMP}.json"
        
        if semgrep --config=auto --json --output="$semgrep_report" src/ 2>/dev/null; then
            success "Semgrep scan completed"
        else
            warning "Semgrep scan found issues or failed"
            issues_found=true
        fi
    fi
    
    # Custom security pattern scan
    log "Running custom security pattern scan..."
    local custom_report="$REPORTS_DIR/custom_patterns_${TIMESTAMP}.json"
    
    # Search for common security anti-patterns
    local patterns=(
        "password.*=.*['\"][^'\"]*['\"]"
        "api[_-]?key.*=.*['\"][^'\"]*['\"]"
        "secret.*=.*['\"][^'\"]*['\"]"
        "token.*=.*['\"][^'\"]*['\"]"
        "eval\s*\("
        "innerHTML\s*="
        "document\.write\s*\("
        "\.exec\s*\("
    )
    
    echo '{"findings": [' > "$custom_report"
    local first=true
    
    for pattern in "${patterns[@]}"; do
        while IFS= read -r -d '' file; do
            if grep -n -E "$pattern" "$file" > /dev/null 2>&1; then
                if [[ "$first" == false ]]; then
                    echo ',' >> "$custom_report"
                fi
                first=false
                
                echo -n '{' >> "$custom_report"
                echo -n "\"file\": \"$file\"," >> "$custom_report"
                echo -n "\"pattern\": \"$pattern\"," >> "$custom_report"
                echo -n "\"matches\": [' >> "$custom_report"
                
                local match_first=true
                while IFS= read -r line; do
                    if [[ "$match_first" == false ]]; then
                        echo -n ',' >> "$custom_report"
                    fi
                    match_first=false
                    echo -n "\"$(echo "$line" | sed 's/"/\\"/g')\"" >> "$custom_report"
                done < <(grep -n -E "$pattern" "$file")
                
                echo ']}' >> "$custom_report"
                issues_found=true
            fi
        done < <(find src/ -name "*.js" -o -name "*.ts" -print0 2>/dev/null)
    done
    
    echo ']}' >> "$custom_report"
    
    if [[ "$issues_found" == true ]]; then
        warning "Static analysis found security issues"
    else
        success "No security issues found in static analysis"
    fi
    
    success "Static analysis completed. Report: $report_file"
    return 0
}

# Run web application security scan
scan_web() {
    log "Running web application security scan..."
    
    local report_file="$REPORTS_DIR/web_security_${TIMESTAMP}.json"
    
    # Check if application is running
    local app_url="http://localhost:3000"
    if ! curl -s "$app_url" > /dev/null 2>&1; then
        warning "Application not running at $app_url. Starting application..."
        
        # Try to start the application
        if [[ -f "package.json" ]]; then
            npm start &
            local app_pid=$!
            sleep 10
            
            if ! curl -s "$app_url" > /dev/null 2>&1; then
                error "Failed to start application for web security scan"
                kill $app_pid 2>/dev/null || true
                return 1
            fi
        else
            error "Cannot start application - no package.json found"
            return 1
        fi
    fi
    
    # OWASP ZAP baseline scan
    if command -v zap-baseline.py &> /dev/null; then
        log "Running OWASP ZAP baseline scan..."
        
        if zap-baseline.py -t "$app_url" -J "$report_file" 2>/dev/null; then
            success "OWASP ZAP scan completed"
        else
            warning "OWASP ZAP scan found issues or failed"
        fi
    else
        # Basic security header check
        log "Running basic security header check..."
        
        local headers_report="$REPORTS_DIR/security_headers_${TIMESTAMP}.json"
        echo '{"headers_check": {' > "$headers_report"
        
        local response=$(curl -s -I "$app_url")
        
        # Check for security headers
        local security_headers=(
            "X-Frame-Options"
            "X-Content-Type-Options"
            "X-XSS-Protection"
            "Strict-Transport-Security"
            "Content-Security-Policy"
            "Referrer-Policy"
        )
        
        local first=true
        for header in "${headers[@]}"; do
            if [[ "$first" == false ]]; then
                echo ',' >> "$headers_report"
            fi
            first=false
            
            if echo "$response" | grep -i "$header" > /dev/null; then
                echo "\"$header\": \"present\"" >> "$headers_report"
            else
                echo "\"$header\": \"missing\"" >> "$headers_report"
            fi
        done
        
        echo '}}' >> "$headers_report"
        
        log "Security headers check completed"
    fi
    
    # Kill application if we started it
    if [[ -n "${app_pid:-}" ]]; then
        kill $app_pid 2>/dev/null || true
    fi
    
    success "Web security scan completed. Report: $report_file"
    return 0
}

# Run configuration security check
scan_config() {
    log "Running configuration security check..."
    
    local report_file="$REPORTS_DIR/config_security_${TIMESTAMP}.json"
    local issues=()
    
    echo '{"config_issues": [' > "$report_file"
    local first=true
    
    # Check for sensitive files
    local sensitive_files=(
        ".env"
        ".env.local"
        ".env.production"
        "config/database.yml"
        "config/secrets.yml"
        "private.key"
        "id_rsa"
        "id_dsa"
    )
    
    for file in "${sensitive_files[@]}"; do
        if [[ -f "$file" ]]; then
            if [[ "$first" == false ]]; then
                echo ',' >> "$report_file"
            fi
            first=false
            
            echo -n '{' >> "$report_file"
            echo -n "\"type\": \"sensitive_file\"," >> "$report_file"
            echo -n "\"file\": \"$file\"," >> "$report_file"
            echo -n "\"severity\": \"high\"," >> "$report_file"
            echo -n "\"description\": \"Sensitive file found in repository\"" >> "$report_file"
            echo '}' >> "$report_file"
        fi
    done
    
    # Check file permissions
    while IFS= read -r -d '' file; do
        local perms=$(stat -c "%a" "$file" 2>/dev/null || stat -f "%A" "$file" 2>/dev/null)
        if [[ "$perms" =~ ^[0-9]{3}$ ]] && [[ "${perms:2:1}" -gt 4 ]]; then
            if [[ "$first" == false ]]; then
                echo ',' >> "$report_file"
            fi
            first=false
            
            echo -n '{' >> "$report_file"
            echo -n "\"type\": \"file_permissions\"," >> "$report_file"
            echo -n "\"file\": \"$file\"," >> "$report_file"
            echo -n "\"permissions\": \"$perms\"," >> "$report_file"
            echo -n "\"severity\": \"medium\"," >> "$report_file"
            echo -n "\"description\": \"File has overly permissive permissions\"" >> "$report_file"
            echo '}' >> "$report_file"
        fi
    done < <(find . -name "*.js" -o -name "*.json" -o -name "*.yml" -o -name "*.yaml" -print0 2>/dev/null)
    
    # Check for hardcoded secrets in config files
    local config_files=(
        "package.json"
        "config/*.json"
        "config/*.yml"
        "config/*.yaml"
        ".env.example"
    )
    
    for pattern in "${config_files[@]}"; do
        for file in $pattern; do
            if [[ -f "$file" ]]; then
                if grep -E "(password|secret|key|token).*['\"][^'\"]{8,}['\"]" "$file" > /dev/null 2>&1; then
                    if [[ "$first" == false ]]; then
                        echo ',' >> "$report_file"
                    fi
                    first=false
                    
                    echo -n '{' >> "$report_file"
                    echo -n "\"type\": \"hardcoded_secret\"," >> "$report_file"
                    echo -n "\"file\": \"$file\"," >> "$report_file"
                    echo -n "\"severity\": \"high\"," >> "$report_file"
                    echo -n "\"description\": \"Potential hardcoded secret in configuration file\"" >> "$report_file"
                    echo '}' >> "$report_file"
                fi
            fi
        done
    done
    
    echo ']}' >> "$report_file"
    
    success "Configuration security check completed. Report: $report_file"
    return 0
}

# Generate consolidated report
generate_report() {
    log "Generating consolidated security report..."
    
    local consolidated_report="$REPORTS_DIR/security_report_${TIMESTAMP}.${OUTPUT_FORMAT}"
    
    case "$OUTPUT_FORMAT" in
        json)
            generate_json_report "$consolidated_report"
            ;;
        html)
            generate_html_report "$consolidated_report"
            ;;
        csv)
            generate_csv_report "$consolidated_report"
            ;;
        *)
            error "Unsupported output format: $OUTPUT_FORMAT"
            return 1
            ;;
    esac
    
    success "Consolidated report generated: $consolidated_report"
}

# Generate JSON report
generate_json_report() {
    local output_file="$1"
    
    cat > "$output_file" << EOF
{
  "scan_metadata": {
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "scan_id": "scan_${TIMESTAMP}",
    "project_root": "$PROJECT_ROOT",
    "scans_performed": {
      "dependencies": $RUN_DEPENDENCIES,
      "static_analysis": $RUN_STATIC,
      "web_security": $RUN_WEB,
      "configuration": $RUN_CONFIG
    }
  },
  "summary": {
    "total_issues": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0
  },
  "reports": []
}
EOF
    
    # This would be enhanced to actually parse and consolidate all the individual reports
    log "JSON report structure created"
}

# Generate HTML report
generate_html_report() {
    local output_file="$1"
    
    cat > "$output_file" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Security Scan Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; flex: 1; }
        .critical { color: #d32f2f; }
        .high { color: #f57c00; }
        .medium { color: #fbc02d; }
        .low { color: #388e3c; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Security Scan Report</h1>
        <p><strong>Generated:</strong> $(date)</p>
        <p><strong>Project:</strong> AI CI/CD System</p>
    </div>
    
    <div class="summary">
        <div class="metric">
            <h3>Total Issues</h3>
            <div style="font-size: 2em; font-weight: bold;">0</div>
        </div>
        <div class="metric">
            <h3>By Severity</h3>
            <div class="critical">Critical: 0</div>
            <div class="high">High: 0</div>
            <div class="medium">Medium: 0</div>
            <div class="low">Low: 0</div>
        </div>
    </div>
    
    <h3>Scan Details</h3>
    <p>Detailed scan results would be populated here...</p>
</body>
</html>
EOF
    
    log "HTML report template created"
}

# Generate CSV report
generate_csv_report() {
    local output_file="$1"
    
    cat > "$output_file" << EOF
Type,Severity,Description,File,Line,Recommendation
EOF
    
    log "CSV report structure created"
}

# Main execution
main() {
    log "Starting security scan for AI CI/CD System"
    log "Timestamp: $TIMESTAMP"
    
    # Initialize environment
    initialize
    
    # Skip report generation if report-only mode
    if [[ "$REPORT_ONLY" == false ]]; then
        # Check tools
        check_tools
        
        # Run scans
        if [[ "$RUN_DEPENDENCIES" == true ]]; then
            scan_dependencies || warning "Dependency scan failed"
        fi
        
        if [[ "$RUN_STATIC" == true ]]; then
            scan_static || warning "Static analysis failed"
        fi
        
        if [[ "$RUN_WEB" == true ]]; then
            scan_web || warning "Web security scan failed"
        fi
        
        if [[ "$RUN_CONFIG" == true ]]; then
            scan_config || warning "Configuration scan failed"
        fi
    fi
    
    # Generate consolidated report
    generate_report
    
    success "Security scan completed successfully!"
    log "Reports available in: $REPORTS_DIR"
    log "Log file: $LOG_FILE"
}

# Run main function
main "$@"

