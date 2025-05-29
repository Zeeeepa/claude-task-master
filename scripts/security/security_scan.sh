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
    
    # Check for ESLint (for static analysis)
    if ! command -v eslint &> /dev/null && ! [ -f "node_modules/.bin/eslint" ]; then
        warning "ESLint not found. Installing locally..."
        npm install --save-dev eslint || {
            warning "Failed to install ESLint"
        }
    else
        log "✓ ESLint available"
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
    
    # Auto-fix if requested
    if [[ "$AUTO_FIX" == true ]]; then
        log "Attempting to auto-fix dependency vulnerabilities..."
        
        if npm audit fix --force; then
            success "Auto-fix completed"
        else
            warning "Auto-fix encountered issues"
        fi
    fi
    
    # Parse and summarize results
    if [[ -f "$report_file" ]]; then
        local vuln_count=$(jq -r '.metadata.vulnerabilities.total // 0' "$report_file" 2>/dev/null || echo "0")
        log "Found $vuln_count total vulnerabilities"
        
        if [[ "$vuln_count" -gt 0 ]]; then
            warning "Dependency vulnerabilities detected. See $report_file for details."
        else
            success "No dependency vulnerabilities found"
        fi
    fi
    
    success "Dependency scan completed"
}

# Run static code analysis
scan_static() {
    log "Running static code analysis..."
    
    local report_file="$REPORTS_DIR/static_analysis_${TIMESTAMP}.json"
    
    # ESLint scan
    log "Running ESLint security analysis..."
    
    # Create ESLint config if it doesn't exist
    if [[ ! -f ".eslintrc.js" && ! -f ".eslintrc.json" ]]; then
        log "Creating basic ESLint configuration..."
        cat > .eslintrc.json << 'EOF'
{
  "env": {
    "node": true,
    "es2021": true
  },
  "extends": [
    "eslint:recommended"
  ],
  "parserOptions": {
    "ecmaVersion": 12,
    "sourceType": "module"
  },
  "rules": {
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
    "no-script-url": "error"
  }
}
EOF
    fi
    
    # Run ESLint
    local eslint_cmd="npx eslint"
    if command -v eslint &> /dev/null; then
        eslint_cmd="eslint"
    fi
    
    if $eslint_cmd --format json --output-file "$report_file" src/ scripts/ mcp-server/ 2>/dev/null; then
        success "ESLint analysis completed"
    else
        warning "ESLint found issues or encountered errors"
    fi
    
    # Parse results
    if [[ -f "$report_file" ]]; then
        local error_count=$(jq '[.[] | .errorCount] | add // 0' "$report_file" 2>/dev/null || echo "0")
        local warning_count=$(jq '[.[] | .warningCount] | add // 0' "$report_file" 2>/dev/null || echo "0")
        
        log "Static analysis found $error_count errors and $warning_count warnings"
        
        if [[ "$error_count" -gt 0 ]]; then
            warning "Static analysis errors detected. See $report_file for details."
        fi
    fi
    
    success "Static code analysis completed"
}

# Run configuration security check
scan_config() {
    log "Running configuration security check..."
    
    local report_file="$REPORTS_DIR/config_security_${TIMESTAMP}.json"
    local issues=()
    
    # Check for sensitive files
    log "Checking for sensitive configuration files..."
    
    # Check for exposed secrets
    if find . -name "*.env*" -not -path "./node_modules/*" | grep -q .; then
        issues+=("Environment files found - ensure they're not committed to version control")
    fi
    
    # Check for hardcoded secrets in config files
    if grep -r -i "password\|secret\|key\|token" config/ --include="*.json" --include="*.js" 2>/dev/null | grep -v "\${" | grep -q .; then
        issues+=("Potential hardcoded secrets found in configuration files")
    fi
    
    # Check file permissions
    if find config/ -type f -perm /o+r 2>/dev/null | grep -q .; then
        issues+=("Configuration files with world-readable permissions found")
    fi
    
    # Check for default credentials
    if grep -r -i "admin:admin\|root:root\|admin:password" config/ 2>/dev/null | grep -q .; then
        issues+=("Default credentials detected in configuration")
    fi
    
    # Generate report
    {
        echo "{"
        echo "  \"timestamp\": \"$(date -Iseconds)\","
        echo "  \"scan_type\": \"configuration_security\","
        echo "  \"issues\": ["
        for i in "${!issues[@]}"; do
            echo "    {"
            echo "      \"id\": $((i+1)),"
            echo "      \"severity\": \"medium\","
            echo "      \"description\": \"${issues[$i]}\""
            echo "    }$([ $i -lt $((${#issues[@]}-1)) ] && echo ",")"
        done
        echo "  ],"
        echo "  \"total_issues\": ${#issues[@]}"
        echo "}"
    } > "$report_file"
    
    if [[ ${#issues[@]} -gt 0 ]]; then
        warning "Configuration security issues found:"
        for issue in "${issues[@]}"; do
            warning "  - $issue"
        done
    else
        success "No configuration security issues found"
    fi
    
    success "Configuration security check completed"
}

# Run web application security scan
scan_web() {
    log "Running web application security scan..."
    
    local report_file="$REPORTS_DIR/web_security_${TIMESTAMP}.json"
    
    # Basic web security checks
    log "Performing basic web security analysis..."
    
    local issues=()
    
    # Check for security headers in Express apps
    if find . -name "*.js" -not -path "./node_modules/*" -exec grep -l "express" {} \; | head -1 | xargs grep -L "helmet\|security" 2>/dev/null | grep -q .; then
        issues+=("Express application may be missing security headers middleware")
    fi
    
    # Check for HTTPS enforcement
    if find . -name "*.js" -not -path "./node_modules/*" -exec grep -l "http\.createServer\|app\.listen" {} \; | xargs grep -L "https\|ssl\|tls" 2>/dev/null | grep -q .; then
        issues+=("HTTP server detected without HTTPS enforcement")
    fi
    
    # Check for input validation
    if find . -name "*.js" -not -path "./node_modules/*" -exec grep -l "req\.body\|req\.query\|req\.params" {} \; | xargs grep -L "validate\|sanitize\|escape" 2>/dev/null | grep -q .; then
        issues+=("Input handling without apparent validation detected")
    fi
    
    # Generate report
    {
        echo "{"
        echo "  \"timestamp\": \"$(date -Iseconds)\","
        echo "  \"scan_type\": \"web_security\","
        echo "  \"issues\": ["
        for i in "${!issues[@]}"; do
            echo "    {"
            echo "      \"id\": $((i+1)),"
            echo "      \"severity\": \"medium\","
            echo "      \"description\": \"${issues[$i]}\""
            echo "    }$([ $i -lt $((${#issues[@]}-1)) ] && echo ",")"
        done
        echo "  ],"
        echo "  \"total_issues\": ${#issues[@]}"
        echo "}"
    } > "$report_file"
    
    if [[ ${#issues[@]} -gt 0 ]]; then
        warning "Web security issues found:"
        for issue in "${issues[@]}"; do
            warning "  - $issue"
        done
    else
        success "No web security issues found"
    fi
    
    success "Web application security scan completed"
}

# Generate consolidated report
generate_report() {
    log "Generating consolidated security report..."
    
    local consolidated_report="$REPORTS_DIR/security_report_${TIMESTAMP}.${OUTPUT_FORMAT}"
    
    case "$OUTPUT_FORMAT" in
        "json")
            generate_json_report "$consolidated_report"
            ;;
        "html")
            generate_html_report "$consolidated_report"
            ;;
        "csv")
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
    
    {
        echo "{"
        echo "  \"scan_metadata\": {"
        echo "    \"timestamp\": \"$(date -Iseconds)\","
        echo "    \"scan_id\": \"${TIMESTAMP}\","
        echo "    \"project_root\": \"$PROJECT_ROOT\","
        echo "    \"scans_performed\": ["
        [[ "$RUN_DEPENDENCIES" == true ]] && echo "      \"dependencies\","
        [[ "$RUN_STATIC" == true ]] && echo "      \"static_analysis\","
        [[ "$RUN_CONFIG" == true ]] && echo "      \"configuration\","
        [[ "$RUN_WEB" == true ]] && echo "      \"web_security\""
        echo "    ]"
        echo "  },"
        echo "  \"scan_results\": {"
        
        # Include individual scan results
        local first=true
        for scan_file in "$REPORTS_DIR"/*_${TIMESTAMP}.json; do
            if [[ -f "$scan_file" ]]; then
                [[ "$first" == false ]] && echo ","
                local scan_name=$(basename "$scan_file" | sed "s/_${TIMESTAMP}.json//")
                echo "    \"$scan_name\": $(cat "$scan_file")"
                first=false
            fi
        done
        
        echo "  }"
        echo "}"
    } > "$output_file"
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
        .header { background: #f4f4f4; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .error { color: #d32f2f; }
        .warning { color: #f57c00; }
        .success { color: #388e3c; }
        .issue { margin: 10px 0; padding: 10px; background: #fff3cd; border-left: 4px solid #ffc107; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Security Scan Report</h1>
        <p>Generated: $(date)</p>
        <p>Scan ID: ${TIMESTAMP}</p>
    </div>
EOF
    
    # Add scan results sections
    for scan_file in "$REPORTS_DIR"/*_${TIMESTAMP}.json; do
        if [[ -f "$scan_file" ]]; then
            local scan_name=$(basename "$scan_file" | sed "s/_${TIMESTAMP}.json//")
            echo "    <div class=\"section\">" >> "$output_file"
            echo "        <h2>$(echo "$scan_name" | tr '_' ' ' | sed 's/\b\w/\U&/g')</h2>" >> "$output_file"
            
            # Parse JSON and add issues
            if command -v jq &> /dev/null; then
                local issue_count=$(jq -r '.total_issues // (.metadata.vulnerabilities.total // 0)' "$scan_file" 2>/dev/null || echo "0")
                echo "        <p>Total issues found: $issue_count</p>" >> "$output_file"
                
                if [[ "$issue_count" -gt 0 ]]; then
                    echo "        <div class=\"issues\">" >> "$output_file"
                    jq -r '.issues[]? // empty | "            <div class=\"issue\">" + .description + "</div>"' "$scan_file" 2>/dev/null >> "$output_file" || true
                    echo "        </div>" >> "$output_file"
                fi
            fi
            
            echo "    </div>" >> "$output_file"
        fi
    done
    
    echo "</body></html>" >> "$output_file"
}

# Generate CSV report
generate_csv_report() {
    local output_file="$1"
    
    echo "Scan Type,Issue ID,Severity,Description,Timestamp" > "$output_file"
    
    for scan_file in "$REPORTS_DIR"/*_${TIMESTAMP}.json; do
        if [[ -f "$scan_file" ]]; then
            local scan_name=$(basename "$scan_file" | sed "s/_${TIMESTAMP}.json//")
            
            if command -v jq &> /dev/null; then
                jq -r --arg scan "$scan_name" '.issues[]? // empty | [$scan, (.id // ""), (.severity // "unknown"), .description, (.timestamp // "")] | @csv' "$scan_file" 2>/dev/null >> "$output_file" || true
            fi
        fi
    done
}

# Cleanup old reports
cleanup_old_reports() {
    log "Cleaning up old security reports..."
    
    # Keep only last 10 reports
    find "$REPORTS_DIR" -name "security_report_*.json" -type f | sort | head -n -10 | xargs rm -f 2>/dev/null || true
    find "$REPORTS_DIR" -name "*_[0-9]*.json" -type f -mtime +7 -delete 2>/dev/null || true
    
    success "Old reports cleaned up"
}

# Main execution
main() {
    log "Starting security scan..."
    
    initialize
    
    if [[ "$REPORT_ONLY" == false ]]; then
        check_tools
        
        [[ "$RUN_DEPENDENCIES" == true ]] && scan_dependencies
        [[ "$RUN_STATIC" == true ]] && scan_static
        [[ "$RUN_CONFIG" == true ]] && scan_config
        [[ "$RUN_WEB" == true ]] && scan_web
    fi
    
    generate_report
    cleanup_old_reports
    
    success "Security scan completed successfully!"
    log "Reports available in: $REPORTS_DIR"
}

# Run main function
main "$@"

