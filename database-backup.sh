#!/bin/bash

# TaskMaster Database Backup Script
# Production-ready PostgreSQL backup with retention, compression, and monitoring
# Usage: ./database-backup.sh [full|incremental|schema-only]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/.env"
BACKUP_TYPE="${1:-full}"

# Load environment variables
if [[ -f "$CONFIG_FILE" ]]; then
    source "$CONFIG_FILE"
fi

# Default configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-codegen-taskmaster-db}"
DB_USER="${DB_USER:-software_developer}"
DB_PASSWORD="${DB_PASSWORD:-}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/taskmaster}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPRESSION_LEVEL="${COMPRESSION_LEVEL:-6}"
PARALLEL_JOBS="${PARALLEL_JOBS:-4}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"
S3_BUCKET="${S3_BUCKET:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
EMAIL_RECIPIENTS="${EMAIL_RECIPIENTS:-}"

# Cloudflare proxy support
if [[ "${CLOUDFLARE_PROXY_ENABLED:-false}" == "true" ]]; then
    DB_HOST="${CLOUDFLARE_PROXY_HOSTNAME:-$DB_HOST}"
    DB_PORT="${CLOUDFLARE_PROXY_PORT:-$DB_PORT}"
fi

# Logging configuration
LOG_DIR="${BACKUP_DIR}/logs"
LOG_FILE="${LOG_DIR}/backup_$(date +%Y%m%d_%H%M%S).log"
ERROR_LOG="${LOG_DIR}/backup_errors.log"

# Create directories
mkdir -p "$BACKUP_DIR" "$LOG_DIR"

# Logging functions
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

log_error() {
    log "ERROR" "$@"
    echo "[$timestamp] [ERROR] $@" >> "$ERROR_LOG"
}

log_info() {
    log "INFO" "$@"
}

log_warn() {
    log "WARN" "$@"
}

# Error handling
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log_error "Backup failed with exit code $exit_code"
        send_notification "FAILED" "Backup failed with exit code $exit_code"
    fi
    exit $exit_code
}

trap cleanup EXIT

# Notification functions
send_slack_notification() {
    local status="$1"
    local message="$2"
    
    if [[ -n "$SLACK_WEBHOOK" ]]; then
        local color="good"
        [[ "$status" == "FAILED" ]] && color="danger"
        [[ "$status" == "WARNING" ]] && color="warning"
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"TaskMaster Database Backup - $status\",
                    \"text\": \"$message\",
                    \"fields\": [
                        {\"title\": \"Database\", \"value\": \"$DB_NAME\", \"short\": true},
                        {\"title\": \"Host\", \"value\": \"$DB_HOST:$DB_PORT\", \"short\": true},
                        {\"title\": \"Backup Type\", \"value\": \"$BACKUP_TYPE\", \"short\": true},
                        {\"title\": \"Timestamp\", \"value\": \"$(date)\", \"short\": true}
                    ]
                }]
            }" \
            "$SLACK_WEBHOOK" 2>/dev/null || log_warn "Failed to send Slack notification"
    fi
}

send_email_notification() {
    local status="$1"
    local message="$2"
    
    if [[ -n "$EMAIL_RECIPIENTS" ]] && command -v mail >/dev/null 2>&1; then
        local subject="TaskMaster Database Backup - $status"
        echo "$message" | mail -s "$subject" "$EMAIL_RECIPIENTS" || log_warn "Failed to send email notification"
    fi
}

send_notification() {
    local status="$1"
    local message="$2"
    
    send_slack_notification "$status" "$message"
    send_email_notification "$status" "$message"
}

# Database connection test
test_connection() {
    log_info "Testing database connection..."
    
    export PGPASSWORD="$DB_PASSWORD"
    
    if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t 30; then
        log_error "Database connection test failed"
        return 1
    fi
    
    log_info "Database connection successful"
    return 0
}

# Get database size
get_database_size() {
    export PGPASSWORD="$DB_PASSWORD"
    
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT pg_size_pretty(pg_database_size('$DB_NAME'));
    " 2>/dev/null | xargs || echo "Unknown"
}

# Pre-backup checks
pre_backup_checks() {
    log_info "Performing pre-backup checks..."
    
    # Check disk space
    local available_space=$(df "$BACKUP_DIR" | awk 'NR==2 {print $4}')
    local db_size_bytes=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_database_size('$DB_NAME');" 2>/dev/null | xargs || echo "0")
    local required_space=$((db_size_bytes * 2 / 1024)) # Double the DB size in KB for safety
    
    if [[ $available_space -lt $required_space ]]; then
        log_error "Insufficient disk space. Available: ${available_space}KB, Required: ${required_space}KB"
        return 1
    fi
    
    # Check PostgreSQL tools
    for tool in pg_dump pg_dumpall psql; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            log_error "Required tool '$tool' not found"
            return 1
        fi
    done
    
    # Test database connection
    test_connection || return 1
    
    log_info "Pre-backup checks completed successfully"
    return 0
}

# Full backup
perform_full_backup() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="${BACKUP_DIR}/taskmaster_full_${timestamp}.sql"
    local compressed_file="${backup_file}.gz"
    
    log_info "Starting full backup to $backup_file"
    
    export PGPASSWORD="$DB_PASSWORD"
    
    # Create backup with custom format for better compression and parallel restore
    if pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --verbose \
        --format=custom \
        --compress="$COMPRESSION_LEVEL" \
        --jobs="$PARALLEL_JOBS" \
        --file="$backup_file" \
        --exclude-table-data='audit_logs' \
        --exclude-table-data='performance_metrics' 2>>"$LOG_FILE"; then
        
        log_info "Database dump completed successfully"
        
        # Compress the backup
        if gzip -"$COMPRESSION_LEVEL" "$backup_file"; then
            log_info "Backup compressed successfully: $compressed_file"
            backup_file="$compressed_file"
        else
            log_warn "Backup compression failed, keeping uncompressed file"
        fi
        
        # Encrypt if key is provided
        if [[ -n "$ENCRYPTION_KEY" ]]; then
            encrypt_backup "$backup_file"
        fi
        
        # Upload to S3 if configured
        if [[ -n "$S3_BUCKET" ]]; then
            upload_to_s3 "$backup_file"
        fi
        
        # Verify backup
        verify_backup "$backup_file"
        
        log_info "Full backup completed: $backup_file"
        echo "$backup_file"
        
    else
        log_error "Database dump failed"
        return 1
    fi
}

# Incremental backup (using WAL archiving)
perform_incremental_backup() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="${BACKUP_DIR}/incremental_${timestamp}"
    
    log_info "Starting incremental backup to $backup_dir"
    
    mkdir -p "$backup_dir"
    
    export PGPASSWORD="$DB_PASSWORD"
    
    # Perform base backup if this is the first incremental backup
    local last_backup=$(find "$BACKUP_DIR" -name "incremental_*" -type d | sort | tail -1)
    
    if [[ -z "$last_backup" ]]; then
        log_info "No previous incremental backup found, performing base backup"
        
        if pg_basebackup \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -D "$backup_dir" \
            --format=tar \
            --gzip \
            --compress="$COMPRESSION_LEVEL" \
            --progress \
            --verbose \
            --write-recovery-conf 2>>"$LOG_FILE"; then
            
            log_info "Base backup completed successfully"
        else
            log_error "Base backup failed"
            return 1
        fi
    else
        log_info "Performing incremental backup based on $last_backup"
        # For true incremental backups, you would typically use WAL-E, pgBackRest, or similar tools
        # This is a simplified version that creates a new base backup
        perform_full_backup
        return $?
    fi
    
    log_info "Incremental backup completed: $backup_dir"
    echo "$backup_dir"
}

# Schema-only backup
perform_schema_backup() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="${BACKUP_DIR}/taskmaster_schema_${timestamp}.sql"
    
    log_info "Starting schema-only backup to $backup_file"
    
    export PGPASSWORD="$DB_PASSWORD"
    
    if pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --schema-only \
        --verbose \
        --file="$backup_file" 2>>"$LOG_FILE"; then
        
        log_info "Schema backup completed successfully"
        
        # Compress the backup
        if gzip -"$COMPRESSION_LEVEL" "$backup_file"; then
            backup_file="${backup_file}.gz"
            log_info "Schema backup compressed: $backup_file"
        fi
        
        log_info "Schema backup completed: $backup_file"
        echo "$backup_file"
        
    else
        log_error "Schema backup failed"
        return 1
    fi
}

# Encrypt backup
encrypt_backup() {
    local backup_file="$1"
    local encrypted_file="${backup_file}.enc"
    
    log_info "Encrypting backup: $backup_file"
    
    if command -v openssl >/dev/null 2>&1; then
        if openssl enc -aes-256-cbc -salt -in "$backup_file" -out "$encrypted_file" -k "$ENCRYPTION_KEY"; then
            rm "$backup_file"
            log_info "Backup encrypted successfully: $encrypted_file"
            echo "$encrypted_file"
        else
            log_error "Backup encryption failed"
            return 1
        fi
    else
        log_warn "OpenSSL not available, skipping encryption"
    fi
}

# Upload to S3
upload_to_s3() {
    local backup_file="$1"
    local s3_key="taskmaster/$(basename "$backup_file")"
    
    log_info "Uploading backup to S3: s3://$S3_BUCKET/$s3_key"
    
    if command -v aws >/dev/null 2>&1; then
        if aws s3 cp "$backup_file" "s3://$S3_BUCKET/$s3_key" --storage-class STANDARD_IA; then
            log_info "Backup uploaded to S3 successfully"
        else
            log_error "S3 upload failed"
            return 1
        fi
    else
        log_warn "AWS CLI not available, skipping S3 upload"
    fi
}

# Verify backup
verify_backup() {
    local backup_file="$1"
    
    log_info "Verifying backup: $backup_file"
    
    # Check file size
    local file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
    if [[ $file_size -lt 1024 ]]; then
        log_error "Backup file is too small (${file_size} bytes), likely corrupted"
        return 1
    fi
    
    # For compressed files, test the compression
    if [[ "$backup_file" == *.gz ]]; then
        if ! gzip -t "$backup_file"; then
            log_error "Backup file compression is corrupted"
            return 1
        fi
    fi
    
    # For PostgreSQL custom format, use pg_restore to verify
    if [[ "$backup_file" == *.sql ]] && [[ "$backup_file" != *.gz ]]; then
        if ! pg_restore --list "$backup_file" >/dev/null 2>&1; then
            log_warn "Could not verify backup with pg_restore (might be plain SQL format)"
        fi
    fi
    
    log_info "Backup verification completed"
    return 0
}

# Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than $RETENTION_DAYS days"
    
    local deleted_count=0
    
    # Find and delete old backup files
    while IFS= read -r -d '' file; do
        rm "$file"
        ((deleted_count++))
        log_info "Deleted old backup: $(basename "$file")"
    done < <(find "$BACKUP_DIR" -name "taskmaster_*" -type f -mtime +$RETENTION_DAYS -print0)
    
    # Find and delete old backup directories
    while IFS= read -r -d '' dir; do
        rm -rf "$dir"
        ((deleted_count++))
        log_info "Deleted old backup directory: $(basename "$dir")"
    done < <(find "$BACKUP_DIR" -name "incremental_*" -type d -mtime +$RETENTION_DAYS -print0)
    
    log_info "Cleanup completed: $deleted_count items removed"
}

# Generate backup report
generate_report() {
    local backup_file="$1"
    local start_time="$2"
    local end_time="$3"
    local db_size="$4"
    
    local duration=$((end_time - start_time))
    local backup_size="Unknown"
    
    if [[ -f "$backup_file" ]]; then
        backup_size=$(ls -lh "$backup_file" | awk '{print $5}')
    fi
    
    local report="
TaskMaster Database Backup Report
================================
Backup Type: $BACKUP_TYPE
Database: $DB_NAME
Host: $DB_HOST:$DB_PORT
Start Time: $(date -d @$start_time)
End Time: $(date -d @$end_time)
Duration: ${duration} seconds
Database Size: $db_size
Backup Size: $backup_size
Backup File: $backup_file
Status: SUCCESS
"
    
    echo "$report" | tee -a "$LOG_FILE"
    
    send_notification "SUCCESS" "Backup completed successfully in ${duration} seconds. Database size: $db_size, Backup size: $backup_size"
}

# Main execution
main() {
    local start_time=$(date +%s)
    
    log_info "Starting TaskMaster database backup (type: $BACKUP_TYPE)"
    log_info "Configuration: Host=$DB_HOST:$DB_PORT, Database=$DB_NAME, User=$DB_USER"
    
    # Pre-backup checks
    if ! pre_backup_checks; then
        log_error "Pre-backup checks failed"
        send_notification "FAILED" "Pre-backup checks failed"
        exit 1
    fi
    
    # Get database size for reporting
    local db_size=$(get_database_size)
    log_info "Database size: $db_size"
    
    # Perform backup based on type
    local backup_file=""
    case "$BACKUP_TYPE" in
        "full")
            backup_file=$(perform_full_backup)
            ;;
        "incremental")
            backup_file=$(perform_incremental_backup)
            ;;
        "schema-only")
            backup_file=$(perform_schema_backup)
            ;;
        *)
            log_error "Invalid backup type: $BACKUP_TYPE. Valid types: full, incremental, schema-only"
            exit 1
            ;;
    esac
    
    if [[ -z "$backup_file" ]]; then
        log_error "Backup failed - no backup file created"
        send_notification "FAILED" "Backup failed - no backup file created"
        exit 1
    fi
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Generate report
    local end_time=$(date +%s)
    generate_report "$backup_file" "$start_time" "$end_time" "$db_size"
    
    log_info "Backup process completed successfully"
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi

