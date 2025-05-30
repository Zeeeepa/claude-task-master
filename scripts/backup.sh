#!/bin/bash

# Claude Task Master Backup Script
# Comprehensive backup solution for database, files, and configurations

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_ID="backup-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="/tmp/claude-task-master-backup-${BACKUP_ID}.log"

# Default values
BACKUP_TYPE="${BACKUP_TYPE:-full}"
BACKUP_DIR="${BACKUP_DIR:-/backups/claude-task-master}"
S3_BUCKET="${S3_BUCKET:-claude-task-master-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPRESSION="${COMPRESSION:-true}"
ENCRYPTION="${ENCRYPTION:-true}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"
DRY_RUN="${DRY_RUN:-false}"
VERIFY_BACKUP="${VERIFY_BACKUP:-true}"

# Database configuration
DATABASE_URL="${DATABASE_URL:-}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-claude_task_master}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

# Redis configuration
REDIS_URL="${REDIS_URL:-}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" | tee -a "$LOG_FILE"
}

# Error handling
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log_error "Backup failed with exit code $exit_code"
        log "Check logs at: $LOG_FILE"
        
        # Clean up partial backups
        if [ -d "${BACKUP_DIR}/${BACKUP_ID}" ]; then
            log "Cleaning up partial backup..."
            rm -rf "${BACKUP_DIR}/${BACKUP_ID}"
        fi
    fi
    exit $exit_code
}

trap cleanup EXIT

# Help function
show_help() {
    cat << EOF
Claude Task Master Backup Script

Usage: $0 [OPTIONS]

Options:
    -t, --type TYPE                 Backup type (full|database|files|config) [default: full]
    -d, --backup-dir DIR           Local backup directory [default: /backups/claude-task-master]
    -b, --s3-bucket BUCKET         S3 bucket for remote storage [default: claude-task-master-backups]
    -r, --retention DAYS           Retention period in days [default: 30]
    -c, --no-compression           Disable compression
    -e, --no-encryption            Disable encryption
    -k, --encryption-key KEY       Encryption key for backup files
    -D, --dry-run                  Perform a dry run without making changes
    -V, --no-verify                Skip backup verification
    -h, --help                     Show this help message

Backup Types:
    full                           Complete backup (database + files + config)
    database                       Database backup only
    files                          Application files backup only
    config                         Configuration backup only

Environment Variables:
    BACKUP_TYPE                    Same as --type
    BACKUP_DIR                     Same as --backup-dir
    S3_BUCKET                      Same as --s3-bucket
    RETENTION_DAYS                 Same as --retention
    COMPRESSION                    Enable/disable compression (true|false)
    ENCRYPTION                     Enable/disable encryption (true|false)
    ENCRYPTION_KEY                 Same as --encryption-key
    DRY_RUN                        Same as --dry-run (true|false)
    VERIFY_BACKUP                  Same as --no-verify (true|false)
    
    DATABASE_URL                   PostgreSQL connection string
    POSTGRES_HOST                  PostgreSQL host
    POSTGRES_PORT                  PostgreSQL port
    POSTGRES_DB                    PostgreSQL database name
    POSTGRES_USER                  PostgreSQL username
    POSTGRES_PASSWORD              PostgreSQL password
    
    REDIS_URL                      Redis connection string
    REDIS_HOST                     Redis host
    REDIS_PORT                     Redis port
    REDIS_PASSWORD                 Redis password

Examples:
    # Full backup
    $0 --type full

    # Database backup only
    $0 --type database --backup-dir /tmp/backups

    # Dry run
    $0 --type full --dry-run

    # Backup with custom retention
    $0 --type full --retention 60

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--type)
                BACKUP_TYPE="$2"
                shift 2
                ;;
            -d|--backup-dir)
                BACKUP_DIR="$2"
                shift 2
                ;;
            -b|--s3-bucket)
                S3_BUCKET="$2"
                shift 2
                ;;
            -r|--retention)
                RETENTION_DAYS="$2"
                shift 2
                ;;
            -c|--no-compression)
                COMPRESSION="false"
                shift
                ;;
            -e|--no-encryption)
                ENCRYPTION="false"
                shift
                ;;
            -k|--encryption-key)
                ENCRYPTION_KEY="$2"
                shift 2
                ;;
            -D|--dry-run)
                DRY_RUN="true"
                shift
                ;;
            -V|--no-verify)
                VERIFY_BACKUP="false"
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Validation functions
validate_backup_type() {
    if [[ ! "$BACKUP_TYPE" =~ ^(full|database|files|config)$ ]]; then
        log_error "Invalid backup type: $BACKUP_TYPE. Must be 'full', 'database', 'files', or 'config'"
        exit 1
    fi
}

validate_prerequisites() {
    log "Validating prerequisites..."
    
    # Check required tools
    local required_tools=("tar" "gzip")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "Required tool '$tool' is not installed"
            exit 1
        fi
    done
    
    # Check database tools if needed
    if [[ "$BACKUP_TYPE" =~ ^(full|database)$ ]]; then
        if ! command -v "pg_dump" &> /dev/null; then
            log_error "pg_dump is required for database backups"
            exit 1
        fi
        
        if ! command -v "redis-cli" &> /dev/null; then
            log_warning "redis-cli not found, Redis backup will be skipped"
        fi
    fi
    
    # Check AWS CLI if S3 backup is enabled
    if [ -n "$S3_BUCKET" ] && ! command -v "aws" &> /dev/null; then
        log_warning "AWS CLI not found, S3 backup will be skipped"
        S3_BUCKET=""
    fi
    
    # Check encryption tools if enabled
    if [ "$ENCRYPTION" = "true" ]; then
        if ! command -v "openssl" &> /dev/null; then
            log_error "OpenSSL is required for encryption"
            exit 1
        fi
        
        if [ -z "$ENCRYPTION_KEY" ]; then
            log_error "Encryption key is required when encryption is enabled"
            exit 1
        fi
    fi
    
    # Create backup directory
    if [ "$DRY_RUN" = "false" ]; then
        mkdir -p "$BACKUP_DIR"
        if [ ! -w "$BACKUP_DIR" ]; then
            log_error "Backup directory is not writable: $BACKUP_DIR"
            exit 1
        fi
    fi
    
    log_success "Prerequisites validated"
}

# Database backup functions
backup_postgresql() {
    log "Backing up PostgreSQL database..."
    
    local backup_file="${BACKUP_DIR}/${BACKUP_ID}/postgresql-${BACKUP_ID}.sql"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would backup PostgreSQL to: $backup_file"
        return 0
    fi
    
    mkdir -p "$(dirname "$backup_file")"
    
    # Use DATABASE_URL if available, otherwise construct connection
    if [ -n "$DATABASE_URL" ]; then
        pg_dump "$DATABASE_URL" > "$backup_file"
    else
        PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
            -h "$POSTGRES_HOST" \
            -p "$POSTGRES_PORT" \
            -U "$POSTGRES_USER" \
            -d "$POSTGRES_DB" \
            --verbose \
            --no-password \
            > "$backup_file"
    fi
    
    # Verify backup file
    if [ ! -s "$backup_file" ]; then
        log_error "PostgreSQL backup file is empty"
        return 1
    fi
    
    log_success "PostgreSQL backup completed: $backup_file"
}

backup_redis() {
    log "Backing up Redis data..."
    
    local backup_file="${BACKUP_DIR}/${BACKUP_ID}/redis-${BACKUP_ID}.rdb"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would backup Redis to: $backup_file"
        return 0
    fi
    
    mkdir -p "$(dirname "$backup_file")"
    
    # Use Redis BGSAVE command for consistent backup
    if [ -n "$REDIS_URL" ]; then
        redis-cli -u "$REDIS_URL" BGSAVE
        # Wait for background save to complete
        while [ "$(redis-cli -u "$REDIS_URL" LASTSAVE)" = "$(redis-cli -u "$REDIS_URL" LASTSAVE)" ]; do
            sleep 1
        done
        # Copy the RDB file
        redis-cli -u "$REDIS_URL" --rdb "$backup_file"
    else
        local redis_cmd="redis-cli -h $REDIS_HOST -p $REDIS_PORT"
        if [ -n "$REDIS_PASSWORD" ]; then
            redis_cmd="$redis_cmd -a $REDIS_PASSWORD"
        fi
        
        $redis_cmd BGSAVE
        # Wait for background save to complete
        while [ "$($redis_cmd LASTSAVE)" = "$($redis_cmd LASTSAVE)" ]; do
            sleep 1
        done
        # Copy the RDB file
        $redis_cmd --rdb "$backup_file"
    fi
    
    log_success "Redis backup completed: $backup_file"
}

# File backup functions
backup_application_files() {
    log "Backing up application files..."
    
    local backup_file="${BACKUP_DIR}/${BACKUP_ID}/application-files-${BACKUP_ID}.tar"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would backup application files to: $backup_file"
        return 0
    fi
    
    mkdir -p "$(dirname "$backup_file")"
    
    # Create tar archive of application files
    tar -cf "$backup_file" \
        -C "$PROJECT_ROOT" \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='logs' \
        --exclude='tmp' \
        --exclude='*.log' \
        --exclude='coverage' \
        --exclude='.nyc_output' \
        src/ \
        package.json \
        package-lock.json \
        docker/ \
        k8s/ \
        scripts/ \
        README.md
    
    # Compress if enabled
    if [ "$COMPRESSION" = "true" ]; then
        log "Compressing application files backup..."
        gzip "$backup_file"
        backup_file="${backup_file}.gz"
    fi
    
    log_success "Application files backup completed: $backup_file"
}

backup_logs() {
    log "Backing up log files..."
    
    local backup_file="${BACKUP_DIR}/${BACKUP_ID}/logs-${BACKUP_ID}.tar"
    local logs_dir="${PROJECT_ROOT}/logs"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would backup logs to: $backup_file"
        return 0
    fi
    
    if [ ! -d "$logs_dir" ]; then
        log_warning "Logs directory not found: $logs_dir"
        return 0
    fi
    
    mkdir -p "$(dirname "$backup_file")"
    
    # Create tar archive of log files
    tar -cf "$backup_file" -C "$logs_dir" .
    
    # Compress if enabled
    if [ "$COMPRESSION" = "true" ]; then
        log "Compressing logs backup..."
        gzip "$backup_file"
        backup_file="${backup_file}.gz"
    fi
    
    log_success "Logs backup completed: $backup_file"
}

# Configuration backup functions
backup_kubernetes_config() {
    log "Backing up Kubernetes configuration..."
    
    local backup_dir="${BACKUP_DIR}/${BACKUP_ID}/kubernetes"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would backup Kubernetes config to: $backup_dir"
        return 0
    fi
    
    mkdir -p "$backup_dir"
    
    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        log_warning "kubectl not found, skipping Kubernetes backup"
        return 0
    fi
    
    # Backup deployments
    kubectl get deployment claude-task-master -o yaml > "$backup_dir/deployment.yaml" 2>/dev/null || true
    
    # Backup services
    kubectl get service claude-task-master-service -o yaml > "$backup_dir/service.yaml" 2>/dev/null || true
    
    # Backup configmaps
    kubectl get configmap claude-task-master-config -o yaml > "$backup_dir/configmap.yaml" 2>/dev/null || true
    
    # Backup ingress
    kubectl get ingress claude-task-master-ingress -o yaml > "$backup_dir/ingress.yaml" 2>/dev/null || true
    
    # Backup secrets (without sensitive data)
    kubectl get secret claude-task-master-secrets -o yaml | \
        sed 's/data:/data: # REDACTED FOR SECURITY/' > "$backup_dir/secrets-template.yaml" 2>/dev/null || true
    
    log_success "Kubernetes configuration backup completed: $backup_dir"
}

backup_environment_config() {
    log "Backing up environment configuration..."
    
    local backup_file="${BACKUP_DIR}/${BACKUP_ID}/environment-${BACKUP_ID}.env"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would backup environment config to: $backup_file"
        return 0
    fi
    
    mkdir -p "$(dirname "$backup_file")"
    
    # Create environment backup (without sensitive values)
    cat > "$backup_file" << EOF
# Environment Configuration Backup
# Generated on: $(date)
# Backup ID: $BACKUP_ID

NODE_ENV=${NODE_ENV:-}
API_PORT=${API_PORT:-}
METRICS_PORT=${METRICS_PORT:-}
LOG_LEVEL=${LOG_LEVEL:-}

# Database Configuration (sensitive values redacted)
POSTGRES_HOST=${POSTGRES_HOST:-}
POSTGRES_PORT=${POSTGRES_PORT:-}
POSTGRES_DB=${POSTGRES_DB:-}
POSTGRES_USER=${POSTGRES_USER:-}
# POSTGRES_PASSWORD=REDACTED

# Redis Configuration (sensitive values redacted)
REDIS_HOST=${REDIS_HOST:-}
REDIS_PORT=${REDIS_PORT:-}
# REDIS_PASSWORD=REDACTED

# Feature Flags
ENABLE_METRICS=${ENABLE_METRICS:-}
ENABLE_HEALTH_CHECKS=${ENABLE_HEALTH_CHECKS:-}
ENABLE_RATE_LIMITING=${ENABLE_RATE_LIMITING:-}

EOF
    
    log_success "Environment configuration backup completed: $backup_file"
}

# Encryption functions
encrypt_backup() {
    local file="$1"
    
    if [ "$ENCRYPTION" = "false" ] || [ -z "$ENCRYPTION_KEY" ]; then
        return 0
    fi
    
    log "Encrypting backup file: $(basename "$file")"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would encrypt file: $file"
        return 0
    fi
    
    # Encrypt using AES-256-CBC
    openssl enc -aes-256-cbc -salt -in "$file" -out "${file}.enc" -k "$ENCRYPTION_KEY"
    
    # Remove unencrypted file
    rm "$file"
    
    log_success "File encrypted: ${file}.enc"
}

# Upload functions
upload_to_s3() {
    if [ -z "$S3_BUCKET" ]; then
        return 0
    fi
    
    log "Uploading backup to S3..."
    
    local backup_path="${BACKUP_DIR}/${BACKUP_ID}"
    local s3_path="s3://${S3_BUCKET}/${BACKUP_ID}/"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would upload to: $s3_path"
        return 0
    fi
    
    # Upload backup directory to S3
    aws s3 cp "$backup_path" "$s3_path" --recursive
    
    # Create backup manifest
    local manifest_file="/tmp/backup-manifest-${BACKUP_ID}.json"
    cat > "$manifest_file" << EOF
{
    "backupId": "$BACKUP_ID",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "type": "$BACKUP_TYPE",
    "s3Path": "$s3_path",
    "retention": "$RETENTION_DAYS",
    "compressed": $COMPRESSION,
    "encrypted": $ENCRYPTION
}
EOF
    
    aws s3 cp "$manifest_file" "s3://${S3_BUCKET}/manifests/backup-manifest-${BACKUP_ID}.json"
    
    log_success "Backup uploaded to S3: $s3_path"
}

# Verification functions
verify_backup() {
    if [ "$VERIFY_BACKUP" = "false" ]; then
        return 0
    fi
    
    log "Verifying backup integrity..."
    
    local backup_path="${BACKUP_DIR}/${BACKUP_ID}"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would verify backup at: $backup_path"
        return 0
    fi
    
    # Check if backup directory exists and is not empty
    if [ ! -d "$backup_path" ] || [ -z "$(ls -A "$backup_path")" ]; then
        log_error "Backup directory is empty or does not exist"
        return 1
    fi
    
    # Verify database backup
    if [[ "$BACKUP_TYPE" =~ ^(full|database)$ ]]; then
        local db_backup=$(find "$backup_path" -name "postgresql-*.sql*" | head -1)
        if [ -n "$db_backup" ] && [ -s "$db_backup" ]; then
            log_success "Database backup verified"
        else
            log_error "Database backup verification failed"
            return 1
        fi
    fi
    
    # Verify file backups
    if [[ "$BACKUP_TYPE" =~ ^(full|files)$ ]]; then
        local files_backup=$(find "$backup_path" -name "application-files-*.tar*" | head -1)
        if [ -n "$files_backup" ] && [ -s "$files_backup" ]; then
            log_success "Files backup verified"
        else
            log_error "Files backup verification failed"
            return 1
        fi
    fi
    
    log_success "Backup verification completed"
}

# Cleanup functions
cleanup_old_backups() {
    log "Cleaning up old backups..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would clean up backups older than $RETENTION_DAYS days"
        return 0
    fi
    
    # Clean up local backups
    find "$BACKUP_DIR" -type d -name "backup-*" -mtime +$RETENTION_DAYS -exec rm -rf {} \; 2>/dev/null || true
    
    # Clean up S3 backups if configured
    if [ -n "$S3_BUCKET" ] && command -v aws &> /dev/null; then
        local cutoff_date=$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d)
        aws s3 ls "s3://${S3_BUCKET}/" | while read -r line; do
            local backup_date=$(echo "$line" | awk '{print $1}')
            if [[ "$backup_date" < "$cutoff_date" ]]; then
                local backup_name=$(echo "$line" | awk '{print $2}')
                aws s3 rm "s3://${S3_BUCKET}/${backup_name}" --recursive
            fi
        done
    fi
    
    log_success "Old backups cleaned up"
}

# Main backup function
perform_backup() {
    case "$BACKUP_TYPE" in
        "full")
            backup_postgresql
            backup_redis
            backup_application_files
            backup_logs
            backup_kubernetes_config
            backup_environment_config
            ;;
        "database")
            backup_postgresql
            backup_redis
            ;;
        "files")
            backup_application_files
            backup_logs
            ;;
        "config")
            backup_kubernetes_config
            backup_environment_config
            ;;
    esac
}

# Post-processing functions
post_process_backup() {
    local backup_path="${BACKUP_DIR}/${BACKUP_ID}"
    
    # Encrypt files if enabled
    if [ "$ENCRYPTION" = "true" ]; then
        find "$backup_path" -type f \( -name "*.sql" -o -name "*.tar" -o -name "*.rdb" \) | while read -r file; do
            encrypt_backup "$file"
        done
    fi
    
    # Create backup summary
    local summary_file="${backup_path}/backup-summary.txt"
    cat > "$summary_file" << EOF
Backup Summary
==============
Backup ID: $BACKUP_ID
Timestamp: $(date)
Type: $BACKUP_TYPE
Compression: $COMPRESSION
Encryption: $ENCRYPTION
Total Size: $(du -sh "$backup_path" | cut -f1)

Files:
$(find "$backup_path" -type f -exec ls -lh {} \;)
EOF
    
    log_success "Backup post-processing completed"
}

# Main function
main() {
    log "Starting Claude Task Master backup"
    log "Backup ID: $BACKUP_ID"
    log "Type: $BACKUP_TYPE"
    log "Directory: $BACKUP_DIR"
    log "S3 Bucket: ${S3_BUCKET:-none}"
    log "Compression: $COMPRESSION"
    log "Encryption: $ENCRYPTION"
    log "Dry Run: $DRY_RUN"
    
    # Validate inputs
    validate_backup_type
    validate_prerequisites
    
    # Perform backup
    perform_backup
    
    # Post-process backup
    post_process_backup
    
    # Verify backup
    verify_backup
    
    # Upload to S3
    upload_to_s3
    
    # Cleanup old backups
    cleanup_old_backups
    
    log_success "Backup completed successfully!"
    log "Backup ID: $BACKUP_ID"
    log "Location: ${BACKUP_DIR}/${BACKUP_ID}"
    log "Logs available at: $LOG_FILE"
}

# Parse arguments and run main function
parse_args "$@"
main

