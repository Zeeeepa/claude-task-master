#!/bin/bash

# Error Handling Cleanup Script
# Cleans up failed recovery attempts and manages system resources

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="${PROJECT_ROOT}/logs/error_handling_cleanup.log"
CONFIG_FILE="${PROJECT_ROOT}/config/error_handling/recovery_rules.json"

# Default values
MAX_AGE_DAYS=7
MAX_HISTORY_SIZE=10000
DRY_RUN=false
VERBOSE=false
FORCE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
    
    case "$level" in
        ERROR)
            echo -e "${RED}[$level] $message${NC}" >&2
            ;;
        WARN)
            echo -e "${YELLOW}[$level] $message${NC}" >&2
            ;;
        INFO)
            echo -e "${GREEN}[$level] $message${NC}"
            ;;
        DEBUG)
            if [ "$VERBOSE" = true ]; then
                echo -e "${BLUE}[$level] $message${NC}"
            fi
            ;;
    esac
}

# Help function
show_help() {
    cat << EOF
Error Handling Cleanup Script

USAGE:
    $0 [OPTIONS]

OPTIONS:
    -a, --max-age DAYS          Maximum age of data to keep (default: 7 days)
    -s, --max-size SIZE         Maximum number of history entries to keep (default: 10000)
    -d, --dry-run              Show what would be cleaned without actually doing it
    -v, --verbose              Enable verbose output
    -f, --force                Force cleanup without confirmation
    -h, --help                 Show this help message

EXAMPLES:
    $0                         # Clean with default settings
    $0 -a 3 -s 5000           # Keep only 3 days and 5000 entries
    $0 -d                     # Dry run to see what would be cleaned
    $0 -f                     # Force cleanup without confirmation

DESCRIPTION:
    This script cleans up old error handling data including:
    - Failed recovery attempts
    - Old error analysis records
    - Expired context data
    - Stale retry session data
    - Old escalation records
    - Notification history
    
    The script respects the configuration in recovery_rules.json and
    provides options for dry-run and verbose output.

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -a|--max-age)
                MAX_AGE_DAYS="$2"
                shift 2
                ;;
            -s|--max-size)
                MAX_HISTORY_SIZE="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -f|--force)
                FORCE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log "ERROR" "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Check prerequisites
check_prerequisites() {
    log "INFO" "Checking prerequisites..."
    
    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        log "ERROR" "Node.js is required but not installed"
        exit 1
    fi
    
    # Check if project root exists
    if [ ! -d "$PROJECT_ROOT" ]; then
        log "ERROR" "Project root not found: $PROJECT_ROOT"
        exit 1
    fi
    
    # Check if config file exists
    if [ ! -f "$CONFIG_FILE" ]; then
        log "WARN" "Config file not found: $CONFIG_FILE"
        log "INFO" "Using default cleanup settings"
    fi
    
    # Create logs directory if it doesn't exist
    mkdir -p "$(dirname "$LOG_FILE")"
    
    log "INFO" "Prerequisites check completed"
}

# Load configuration
load_config() {
    log "INFO" "Loading configuration..."
    
    if [ -f "$CONFIG_FILE" ]; then
        # Extract cleanup configuration using Node.js
        local cleanup_config=$(node -e "
            const fs = require('fs');
            const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
            console.log(JSON.stringify(config.cleanup || {}));
        " 2>/dev/null || echo "{}")
        
        # Parse cleanup configuration
        if [ "$cleanup_config" != "{}" ]; then
            local max_history_age=$(echo "$cleanup_config" | node -e "
                const config = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
                console.log(Math.floor((config.maxHistoryAge || 0) / 86400000));
            " 2>/dev/null || echo "0")
            
            local max_history_size_config=$(echo "$cleanup_config" | node -e "
                const config = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
                console.log(config.maxHistorySize || 0);
            " 2>/dev/null || echo "0")
            
            # Use config values if not overridden by command line
            if [ "$max_history_age" -gt 0 ] && [ "$MAX_AGE_DAYS" -eq 7 ]; then
                MAX_AGE_DAYS="$max_history_age"
            fi
            
            if [ "$max_history_size_config" -gt 0 ] && [ "$MAX_HISTORY_SIZE" -eq 10000 ]; then
                MAX_HISTORY_SIZE="$max_history_size_config"
            fi
        fi
    fi
    
    log "INFO" "Configuration loaded - Max age: ${MAX_AGE_DAYS} days, Max size: ${MAX_HISTORY_SIZE}"
}

# Get data directories
get_data_directories() {
    local data_dirs=()
    
    # Common data directories
    if [ -d "${PROJECT_ROOT}/data/error_handling" ]; then
        data_dirs+=("${PROJECT_ROOT}/data/error_handling")
    fi
    
    if [ -d "${PROJECT_ROOT}/logs/error_handling" ]; then
        data_dirs+=("${PROJECT_ROOT}/logs/error_handling")
    fi
    
    if [ -d "${PROJECT_ROOT}/temp/error_handling" ]; then
        data_dirs+=("${PROJECT_ROOT}/temp/error_handling")
    fi
    
    # Cache directories
    if [ -d "${PROJECT_ROOT}/.cache/error_handling" ]; then
        data_dirs+=("${PROJECT_ROOT}/.cache/error_handling")
    fi
    
    echo "${data_dirs[@]}"
}

# Clean old files
clean_old_files() {
    local data_dirs=($(get_data_directories))
    local cutoff_date=$(date -d "${MAX_AGE_DAYS} days ago" '+%Y-%m-%d')
    local files_cleaned=0
    local size_freed=0
    
    log "INFO" "Cleaning files older than ${MAX_AGE_DAYS} days (before ${cutoff_date})..."
    
    for dir in "${data_dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            continue
        fi
        
        log "DEBUG" "Scanning directory: $dir"
        
        # Find old files
        while IFS= read -r -d '' file; do
            local file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
            
            if [ "$DRY_RUN" = true ]; then
                log "INFO" "[DRY RUN] Would delete: $file ($(numfmt --to=iec $file_size))"
            else
                log "DEBUG" "Deleting: $file ($(numfmt --to=iec $file_size))"
                rm -f "$file"
            fi
            
            files_cleaned=$((files_cleaned + 1))
            size_freed=$((size_freed + file_size))
            
        done < <(find "$dir" -type f -mtime +${MAX_AGE_DAYS} -print0 2>/dev/null || true)
    done
    
    if [ "$files_cleaned" -gt 0 ]; then
        log "INFO" "Cleaned $files_cleaned old files, freed $(numfmt --to=iec $size_freed)"
    else
        log "INFO" "No old files found to clean"
    fi
}

# Clean large history files
clean_large_histories() {
    log "INFO" "Cleaning history files larger than ${MAX_HISTORY_SIZE} entries..."
    
    local histories_cleaned=0
    
    # Look for JSON files that might contain history data
    local data_dirs=($(get_data_directories))
    
    for dir in "${data_dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            continue
        fi
        
        # Find JSON files that might be history files
        while IFS= read -r -d '' file; do
            if [[ "$file" =~ (history|log|records).*\.json$ ]]; then
                local entry_count=$(node -e "
                    try {
                        const fs = require('fs');
                        const data = JSON.parse(fs.readFileSync('$file', 'utf8'));
                        if (Array.isArray(data)) {
                            console.log(data.length);
                        } else if (data.history && Array.isArray(data.history)) {
                            console.log(data.history.length);
                        } else {
                            console.log(0);
                        }
                    } catch (e) {
                        console.log(0);
                    }
                " 2>/dev/null || echo "0")
                
                if [ "$entry_count" -gt "$MAX_HISTORY_SIZE" ]; then
                    local entries_to_remove=$((entry_count - MAX_HISTORY_SIZE))
                    
                    if [ "$DRY_RUN" = true ]; then
                        log "INFO" "[DRY RUN] Would trim $entries_to_remove entries from: $file"
                    else
                        log "DEBUG" "Trimming $entries_to_remove entries from: $file"
                        
                        # Create backup
                        cp "$file" "${file}.backup.$(date +%s)"
                        
                        # Trim the file
                        node -e "
                            const fs = require('fs');
                            try {
                                const data = JSON.parse(fs.readFileSync('$file', 'utf8'));
                                if (Array.isArray(data)) {
                                    const trimmed = data.slice(-$MAX_HISTORY_SIZE);
                                    fs.writeFileSync('$file', JSON.stringify(trimmed, null, 2));
                                } else if (data.history && Array.isArray(data.history)) {
                                    data.history = data.history.slice(-$MAX_HISTORY_SIZE);
                                    fs.writeFileSync('$file', JSON.stringify(data, null, 2));
                                }
                                console.log('Trimmed successfully');
                            } catch (e) {
                                console.error('Error trimming file:', e.message);
                                process.exit(1);
                            }
                        "
                        
                        if [ $? -eq 0 ]; then
                            histories_cleaned=$((histories_cleaned + 1))
                        else
                            log "ERROR" "Failed to trim: $file"
                            # Restore backup
                            mv "${file}.backup.$(date +%s)" "$file"
                        fi
                    fi
                fi
            fi
        done < <(find "$dir" -name "*.json" -type f -print0 2>/dev/null || true)
    done
    
    if [ "$histories_cleaned" -gt 0 ]; then
        log "INFO" "Trimmed $histories_cleaned history files"
    else
        log "INFO" "No large history files found to trim"
    fi
}

# Clean temporary files
clean_temp_files() {
    log "INFO" "Cleaning temporary files..."
    
    local temp_patterns=(
        "*.tmp"
        "*.temp"
        "*~"
        ".#*"
        "core.*"
        "*.pid"
        "*.lock"
    )
    
    local temp_cleaned=0
    local data_dirs=($(get_data_directories))
    
    for dir in "${data_dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            continue
        fi
        
        for pattern in "${temp_patterns[@]}"; do
            while IFS= read -r -d '' file; do
                if [ "$DRY_RUN" = true ]; then
                    log "INFO" "[DRY RUN] Would delete temp file: $file"
                else
                    log "DEBUG" "Deleting temp file: $file"
                    rm -f "$file"
                fi
                temp_cleaned=$((temp_cleaned + 1))
            done < <(find "$dir" -name "$pattern" -type f -print0 2>/dev/null || true)
        done
    done
    
    if [ "$temp_cleaned" -gt 0 ]; then
        log "INFO" "Cleaned $temp_cleaned temporary files"
    else
        log "INFO" "No temporary files found to clean"
    fi
}

# Clean empty directories
clean_empty_directories() {
    log "INFO" "Cleaning empty directories..."
    
    local dirs_cleaned=0
    local data_dirs=($(get_data_directories))
    
    for dir in "${data_dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            continue
        fi
        
        # Find empty directories (excluding the root data directories)
        while IFS= read -r -d '' empty_dir; do
            if [ "$empty_dir" != "$dir" ]; then
                if [ "$DRY_RUN" = true ]; then
                    log "INFO" "[DRY RUN] Would remove empty directory: $empty_dir"
                else
                    log "DEBUG" "Removing empty directory: $empty_dir"
                    rmdir "$empty_dir" 2>/dev/null || true
                fi
                dirs_cleaned=$((dirs_cleaned + 1))
            fi
        done < <(find "$dir" -type d -empty -print0 2>/dev/null || true)
    done
    
    if [ "$dirs_cleaned" -gt 0 ]; then
        log "INFO" "Cleaned $dirs_cleaned empty directories"
    else
        log "INFO" "No empty directories found to clean"
    fi
}

# Generate cleanup report
generate_report() {
    log "INFO" "Generating cleanup report..."
    
    local report_file="${PROJECT_ROOT}/logs/cleanup_report_$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$report_file" << EOF
Error Handling Cleanup Report
Generated: $(date)

Configuration:
- Max age: ${MAX_AGE_DAYS} days
- Max history size: ${MAX_HISTORY_SIZE} entries
- Dry run: ${DRY_RUN}
- Force: ${FORCE}

Data Directories Scanned:
$(get_data_directories | tr ' ' '\n' | sed 's/^/- /')

Summary:
- Script completed successfully
- Check log file for details: $LOG_FILE

EOF
    
    log "INFO" "Cleanup report generated: $report_file"
}

# Confirm cleanup
confirm_cleanup() {
    if [ "$FORCE" = true ] || [ "$DRY_RUN" = true ]; then
        return 0
    fi
    
    echo
    echo -e "${YELLOW}This will clean up error handling data with the following settings:${NC}"
    echo "- Maximum age: ${MAX_AGE_DAYS} days"
    echo "- Maximum history size: ${MAX_HISTORY_SIZE} entries"
    echo "- Data directories: $(get_data_directories | wc -w) found"
    echo
    
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "INFO" "Cleanup cancelled by user"
        exit 0
    fi
}

# Main cleanup function
main() {
    log "INFO" "Starting error handling cleanup..."
    log "INFO" "Script: $0"
    log "INFO" "Arguments: $*"
    
    parse_args "$@"
    check_prerequisites
    load_config
    
    if [ "$DRY_RUN" = true ]; then
        log "INFO" "Running in DRY RUN mode - no files will be deleted"
    fi
    
    confirm_cleanup
    
    # Perform cleanup operations
    clean_old_files
    clean_large_histories
    clean_temp_files
    clean_empty_directories
    
    generate_report
    
    log "INFO" "Error handling cleanup completed successfully"
}

# Error handling
trap 'log "ERROR" "Script failed at line $LINENO"' ERR

# Run main function
main "$@"

