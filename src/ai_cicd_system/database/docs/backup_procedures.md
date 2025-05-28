# PostgreSQL Backup and Recovery Procedures

## Overview

This document outlines comprehensive backup and recovery procedures for the AI-driven CI/CD PostgreSQL database. The procedures are designed to meet enterprise requirements including zero-downtime backups, point-in-time recovery, and disaster recovery capabilities.

## Backup Strategy

### Recovery Point Objective (RPO) and Recovery Time Objective (RTO)

- **RPO**: Maximum 15 minutes of data loss
- **RTO**: Database recovery within 30 minutes
- **Backup Frequency**: Continuous WAL archiving + daily full backups
- **Retention**: 30 days for full backups, 7 days for WAL files

### Backup Types

1. **Continuous WAL Archiving**: Real-time transaction log backup
2. **Full Database Backups**: Complete database snapshot (daily)
3. **Incremental Backups**: Changed data since last backup (hourly)
4. **Schema-Only Backups**: Structure without data (before migrations)
5. **Logical Backups**: Application-level data export (weekly)

## Backup Configuration

### PostgreSQL Configuration

Add to `postgresql.conf`:

```ini
# WAL Configuration for Backup
wal_level = replica
archive_mode = on
archive_command = '/opt/backup/scripts/archive_wal.sh %p %f'
archive_timeout = 300                    # Force WAL switch every 5 minutes
max_wal_senders = 3
wal_keep_segments = 32

# Backup-related settings
hot_standby = on
max_standby_streaming_delay = 30s
max_standby_archive_delay = 30s

# Logging for backup monitoring
log_checkpoints = on
log_min_messages = warning
```

### Environment Variables

```bash
# Backup configuration
export BACKUP_BASE_DIR="/opt/backups/postgresql"
export WAL_ARCHIVE_DIR="/opt/backups/wal"
export BACKUP_RETENTION_DAYS=30
export WAL_RETENTION_DAYS=7
export BACKUP_COMPRESSION=true
export BACKUP_ENCRYPTION=true
export BACKUP_ENCRYPTION_KEY="/opt/backup/keys/backup.key"

# Database connection
export PGHOST="localhost"
export PGPORT="5432"
export PGDATABASE="codegen-taskmaster-db"
export PGUSER="backup_user"
export PGPASSWORD="secure_backup_password"

# Cloud storage (optional)
export AWS_ACCESS_KEY_ID="your_access_key"
export AWS_SECRET_ACCESS_KEY="your_secret_key"
export S3_BACKUP_BUCKET="your-backup-bucket"
export S3_REGION="us-east-1"
```

## Backup Scripts

### 1. WAL Archive Script

Create `/opt/backup/scripts/archive_wal.sh`:

```bash
#!/bin/bash

# WAL Archive Script
# Usage: archive_wal.sh %p %f

set -e

WAL_PATH="$1"
WAL_FILE="$2"
WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/opt/backups/wal}"
BACKUP_ENCRYPTION="${BACKUP_ENCRYPTION:-false}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-/opt/backup/keys/backup.key}"

# Create archive directory if it doesn't exist
mkdir -p "$WAL_ARCHIVE_DIR"

# Log the archive operation
echo "$(date): Archiving WAL file $WAL_FILE" >> /var/log/postgresql/wal_archive.log

if [ "$BACKUP_ENCRYPTION" = "true" ]; then
    # Encrypt and compress WAL file
    gzip -c "$WAL_PATH" | \
    openssl enc -aes-256-cbc -salt -in - -out "$WAL_ARCHIVE_DIR/$WAL_FILE.gz.enc" \
    -pass file:"$BACKUP_ENCRYPTION_KEY"
else
    # Just compress WAL file
    gzip -c "$WAL_PATH" > "$WAL_ARCHIVE_DIR/$WAL_FILE.gz"
fi

# Verify the archive was created successfully
if [ "$BACKUP_ENCRYPTION" = "true" ]; then
    ARCHIVE_FILE="$WAL_ARCHIVE_DIR/$WAL_FILE.gz.enc"
else
    ARCHIVE_FILE="$WAL_ARCHIVE_DIR/$WAL_FILE.gz"
fi

if [ -f "$ARCHIVE_FILE" ] && [ -s "$ARCHIVE_FILE" ]; then
    echo "$(date): Successfully archived $WAL_FILE" >> /var/log/postgresql/wal_archive.log
    
    # Optional: Upload to cloud storage
    if [ -n "$S3_BACKUP_BUCKET" ]; then
        aws s3 cp "$ARCHIVE_FILE" "s3://$S3_BACKUP_BUCKET/wal/" --region "$S3_REGION"
    fi
    
    exit 0
else
    echo "$(date): Failed to archive $WAL_FILE" >> /var/log/postgresql/wal_archive.log
    exit 1
fi
```

### 2. Full Backup Script

Create `/opt/backup/scripts/full_backup.sh`:

```bash
#!/bin/bash

# Full Database Backup Script

set -e

BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/opt/backups/postgresql}"
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_BASE_DIR/full_$BACKUP_DATE"
BACKUP_COMPRESSION="${BACKUP_COMPRESSION:-true}"
BACKUP_ENCRYPTION="${BACKUP_ENCRYPTION:-false}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-/opt/backup/keys/backup.key}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Log backup start
echo "$(date): Starting full backup to $BACKUP_DIR" >> /var/log/postgresql/backup.log

# Start backup
psql -c "SELECT pg_start_backup('full_backup_$BACKUP_DATE', false, false);"

# Create base backup using pg_basebackup
if [ "$BACKUP_COMPRESSION" = "true" ]; then
    pg_basebackup -D "$BACKUP_DIR" -Ft -z -P -v
else
    pg_basebackup -D "$BACKUP_DIR" -Ft -P -v
fi

# Stop backup
psql -c "SELECT pg_stop_backup(false, true);"

# Encrypt backup if required
if [ "$BACKUP_ENCRYPTION" = "true" ]; then
    echo "$(date): Encrypting backup..." >> /var/log/postgresql/backup.log
    
    for file in "$BACKUP_DIR"/*.tar*; do
        if [ -f "$file" ]; then
            openssl enc -aes-256-cbc -salt -in "$file" -out "$file.enc" \
            -pass file:"$BACKUP_ENCRYPTION_KEY"
            rm "$file"
        fi
    done
fi

# Create backup manifest
cat > "$BACKUP_DIR/backup_manifest.json" << EOF
{
    "backup_type": "full",
    "backup_date": "$BACKUP_DATE",
    "database": "$PGDATABASE",
    "compression": $BACKUP_COMPRESSION,
    "encryption": $BACKUP_ENCRYPTION,
    "wal_start": "$(psql -t -c "SELECT pg_current_wal_lsn();" | tr -d ' ')",
    "backup_size": "$(du -sh $BACKUP_DIR | cut -f1)"
}
EOF

# Upload to cloud storage if configured
if [ -n "$S3_BACKUP_BUCKET" ]; then
    echo "$(date): Uploading backup to S3..." >> /var/log/postgresql/backup.log
    aws s3 sync "$BACKUP_DIR" "s3://$S3_BACKUP_BUCKET/full_backups/full_$BACKUP_DATE/" --region "$S3_REGION"
fi

# Clean up old backups
find "$BACKUP_BASE_DIR" -name "full_*" -type d -mtime +$BACKUP_RETENTION_DAYS -exec rm -rf {} \;

echo "$(date): Full backup completed successfully" >> /var/log/postgresql/backup.log

# Store backup metrics
psql -c "
INSERT INTO system_metrics (
    metric_category, metric_name, metric_type, numeric_value,
    dimensions, source_system
) VALUES (
    'infrastructure', 'backup_completed', 'counter', 1,
    '{\"backup_type\": \"full\", \"backup_date\": \"$BACKUP_DATE\"}',
    'backup_system'
);
"
```

### 3. Incremental Backup Script

Create `/opt/backup/scripts/incremental_backup.sh`:

```bash
#!/bin/bash

# Incremental Backup Script using pg_receivewal

set -e

BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/opt/backups/postgresql}"
WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/opt/backups/wal}"
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
INCREMENTAL_DIR="$BACKUP_BASE_DIR/incremental_$BACKUP_DATE"

# Create incremental backup directory
mkdir -p "$INCREMENTAL_DIR"

echo "$(date): Starting incremental backup" >> /var/log/postgresql/backup.log

# Get current WAL position
CURRENT_WAL=$(psql -t -c "SELECT pg_current_wal_lsn();" | tr -d ' ')

# Find the last full backup
LAST_FULL_BACKUP=$(find "$BACKUP_BASE_DIR" -name "full_*" -type d | sort | tail -1)

if [ -z "$LAST_FULL_BACKUP" ]; then
    echo "$(date): No full backup found, running full backup instead" >> /var/log/postgresql/backup.log
    /opt/backup/scripts/full_backup.sh
    exit 0
fi

# Get WAL start position from last backup
LAST_WAL_START=$(cat "$LAST_FULL_BACKUP/backup_manifest.json" | jq -r '.wal_start')

# Copy WAL files since last backup
echo "$(date): Copying WAL files from $LAST_WAL_START to $CURRENT_WAL" >> /var/log/postgresql/backup.log

# Create incremental backup manifest
cat > "$INCREMENTAL_DIR/incremental_manifest.json" << EOF
{
    "backup_type": "incremental",
    "backup_date": "$BACKUP_DATE",
    "base_backup": "$(basename $LAST_FULL_BACKUP)",
    "wal_start": "$LAST_WAL_START",
    "wal_end": "$CURRENT_WAL",
    "database": "$PGDATABASE"
}
EOF

# Copy required WAL files
pg_receivewal -D "$INCREMENTAL_DIR/wal" --synchronous --no-loop

echo "$(date): Incremental backup completed" >> /var/log/postgresql/backup.log
```

### 4. Schema Backup Script

Create `/opt/backup/scripts/schema_backup.sh`:

```bash
#!/bin/bash

# Schema-only Backup Script

set -e

BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/opt/backups/postgresql}"
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
SCHEMA_BACKUP_FILE="$BACKUP_BASE_DIR/schema_$BACKUP_DATE.sql"

echo "$(date): Starting schema backup" >> /var/log/postgresql/backup.log

# Create schema-only dump
pg_dump --schema-only --no-owner --no-privileges --verbose \
    --file="$SCHEMA_BACKUP_FILE" "$PGDATABASE"

# Compress the schema backup
gzip "$SCHEMA_BACKUP_FILE"

# Upload to cloud storage if configured
if [ -n "$S3_BACKUP_BUCKET" ]; then
    aws s3 cp "$SCHEMA_BACKUP_FILE.gz" \
    "s3://$S3_BACKUP_BUCKET/schema_backups/" --region "$S3_REGION"
fi

echo "$(date): Schema backup completed: $SCHEMA_BACKUP_FILE.gz" >> /var/log/postgresql/backup.log
```

## Recovery Procedures

### 1. Point-in-Time Recovery (PITR)

```bash
#!/bin/bash

# Point-in-Time Recovery Script
# Usage: pitr_recovery.sh <target_time> <backup_date>

TARGET_TIME="$1"
BACKUP_DATE="$2"
RECOVERY_DIR="/opt/recovery/postgresql"
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/opt/backups/postgresql}"
WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/opt/backups/wal}"

if [ -z "$TARGET_TIME" ] || [ -z "$BACKUP_DATE" ]; then
    echo "Usage: $0 <target_time> <backup_date>"
    echo "Example: $0 '2025-05-28 14:30:00' 20250528_120000"
    exit 1
fi

echo "Starting point-in-time recovery to $TARGET_TIME using backup $BACKUP_DATE"

# Stop PostgreSQL
systemctl stop postgresql

# Create recovery directory
mkdir -p "$RECOVERY_DIR"

# Extract base backup
BACKUP_DIR="$BACKUP_BASE_DIR/full_$BACKUP_DATE"
if [ ! -d "$BACKUP_DIR" ]; then
    echo "Backup directory not found: $BACKUP_DIR"
    exit 1
fi

# Extract backup files
cd "$RECOVERY_DIR"
for tarfile in "$BACKUP_DIR"/*.tar*; do
    if [[ "$tarfile" == *.enc ]]; then
        # Decrypt and extract
        openssl enc -aes-256-cbc -d -in "$tarfile" \
        -pass file:"$BACKUP_ENCRYPTION_KEY" | tar -xf -
    else
        # Extract directly
        tar -xf "$tarfile"
    fi
done

# Create recovery configuration
cat > "$RECOVERY_DIR/postgresql.auto.conf" << EOF
# Recovery configuration
restore_command = '/opt/backup/scripts/restore_wal.sh %f %p'
recovery_target_time = '$TARGET_TIME'
recovery_target_action = 'promote'
EOF

# Set proper permissions
chown -R postgres:postgres "$RECOVERY_DIR"
chmod 700 "$RECOVERY_DIR"

echo "Recovery setup complete. Start PostgreSQL to begin recovery."
echo "Data directory: $RECOVERY_DIR"
```

### 2. WAL Restore Script

Create `/opt/backup/scripts/restore_wal.sh`:

```bash
#!/bin/bash

# WAL Restore Script for Recovery
# Usage: restore_wal.sh %f %p

WAL_FILE="$1"
WAL_PATH="$2"
WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/opt/backups/wal}"
BACKUP_ENCRYPTION="${BACKUP_ENCRYPTION:-false}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-/opt/backup/keys/backup.key}"

# Check if WAL file exists in archive
if [ "$BACKUP_ENCRYPTION" = "true" ]; then
    ARCHIVE_FILE="$WAL_ARCHIVE_DIR/$WAL_FILE.gz.enc"
else
    ARCHIVE_FILE="$WAL_ARCHIVE_DIR/$WAL_FILE.gz"
fi

if [ ! -f "$ARCHIVE_FILE" ]; then
    # Try to download from cloud storage
    if [ -n "$S3_BACKUP_BUCKET" ]; then
        aws s3 cp "s3://$S3_BACKUP_BUCKET/wal/$(basename $ARCHIVE_FILE)" \
        "$ARCHIVE_FILE" --region "$S3_REGION" 2>/dev/null || exit 1
    else
        exit 1
    fi
fi

# Restore WAL file
if [ "$BACKUP_ENCRYPTION" = "true" ]; then
    # Decrypt and decompress
    openssl enc -aes-256-cbc -d -in "$ARCHIVE_FILE" \
    -pass file:"$BACKUP_ENCRYPTION_KEY" | gunzip > "$WAL_PATH"
else
    # Just decompress
    gunzip -c "$ARCHIVE_FILE" > "$WAL_PATH"
fi

exit 0
```

### 3. Full Database Recovery

```bash
#!/bin/bash

# Full Database Recovery Script
# Usage: full_recovery.sh <backup_date>

BACKUP_DATE="$1"
RECOVERY_DIR="/opt/recovery/postgresql"
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/opt/backups/postgresql}"

if [ -z "$BACKUP_DATE" ]; then
    echo "Usage: $0 <backup_date>"
    echo "Example: $0 20250528_120000"
    exit 1
fi

echo "Starting full database recovery from backup $BACKUP_DATE"

# Stop PostgreSQL
systemctl stop postgresql

# Backup current data directory
if [ -d "/var/lib/postgresql/data" ]; then
    mv "/var/lib/postgresql/data" "/var/lib/postgresql/data.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Create new data directory
mkdir -p "/var/lib/postgresql/data"

# Extract backup
BACKUP_DIR="$BACKUP_BASE_DIR/full_$BACKUP_DATE"
cd "/var/lib/postgresql/data"

for tarfile in "$BACKUP_DIR"/*.tar*; do
    if [[ "$tarfile" == *.enc ]]; then
        openssl enc -aes-256-cbc -d -in "$tarfile" \
        -pass file:"$BACKUP_ENCRYPTION_KEY" | tar -xf -
    else
        tar -xf "$tarfile"
    fi
done

# Set permissions
chown -R postgres:postgres "/var/lib/postgresql/data"
chmod 700 "/var/lib/postgresql/data"

# Start PostgreSQL
systemctl start postgresql

echo "Full database recovery completed"
```

## Backup Monitoring and Alerting

### 1. Backup Monitoring Script

Create `/opt/backup/scripts/monitor_backups.sh`:

```bash
#!/bin/bash

# Backup Monitoring Script

BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/opt/backups/postgresql}"
WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/opt/backups/wal}"
ALERT_EMAIL="admin@company.com"

# Check last full backup
LAST_FULL_BACKUP=$(find "$BACKUP_BASE_DIR" -name "full_*" -type d | sort | tail -1)
if [ -n "$LAST_FULL_BACKUP" ]; then
    LAST_BACKUP_TIME=$(stat -c %Y "$LAST_FULL_BACKUP")
    CURRENT_TIME=$(date +%s)
    HOURS_SINCE_BACKUP=$(( (CURRENT_TIME - LAST_BACKUP_TIME) / 3600 ))
    
    if [ $HOURS_SINCE_BACKUP -gt 25 ]; then
        echo "ALERT: Last full backup is $HOURS_SINCE_BACKUP hours old" | \
        mail -s "Backup Alert: Overdue Full Backup" "$ALERT_EMAIL"
    fi
else
    echo "ALERT: No full backups found" | \
    mail -s "Backup Alert: No Full Backups" "$ALERT_EMAIL"
fi

# Check WAL archiving
LAST_WAL=$(find "$WAL_ARCHIVE_DIR" -name "*.gz*" -type f | sort | tail -1)
if [ -n "$LAST_WAL" ]; then
    LAST_WAL_TIME=$(stat -c %Y "$LAST_WAL")
    MINUTES_SINCE_WAL=$(( (CURRENT_TIME - LAST_WAL_TIME) / 60 ))
    
    if [ $MINUTES_SINCE_WAL -gt 10 ]; then
        echo "ALERT: Last WAL archive is $MINUTES_SINCE_WAL minutes old" | \
        mail -s "Backup Alert: WAL Archiving Delayed" "$ALERT_EMAIL"
    fi
fi

# Check disk space
BACKUP_DISK_USAGE=$(df "$BACKUP_BASE_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $BACKUP_DISK_USAGE -gt 85 ]; then
    echo "ALERT: Backup disk usage is ${BACKUP_DISK_USAGE}%" | \
    mail -s "Backup Alert: High Disk Usage" "$ALERT_EMAIL"
fi
```

### 2. Backup Validation Script

Create `/opt/backup/scripts/validate_backup.sh`:

```bash
#!/bin/bash

# Backup Validation Script

BACKUP_DATE="$1"
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/opt/backups/postgresql}"
VALIDATION_DIR="/tmp/backup_validation_$$"

if [ -z "$BACKUP_DATE" ]; then
    echo "Usage: $0 <backup_date>"
    exit 1
fi

echo "Validating backup: $BACKUP_DATE"

# Create validation directory
mkdir -p "$VALIDATION_DIR"

# Extract backup to validation directory
BACKUP_DIR="$BACKUP_BASE_DIR/full_$BACKUP_DATE"
cd "$VALIDATION_DIR"

for tarfile in "$BACKUP_DIR"/*.tar*; do
    if [[ "$tarfile" == *.enc ]]; then
        openssl enc -aes-256-cbc -d -in "$tarfile" \
        -pass file:"$BACKUP_ENCRYPTION_KEY" | tar -tf - > /dev/null
    else
        tar -tf "$tarfile" > /dev/null
    fi
    
    if [ $? -eq 0 ]; then
        echo "✓ Archive file valid: $(basename $tarfile)"
    else
        echo "✗ Archive file corrupted: $(basename $tarfile)"
        exit 1
    fi
done

# Cleanup
rm -rf "$VALIDATION_DIR"

echo "Backup validation completed successfully"
```

## Automated Backup Scheduling

### Cron Configuration

Add to `/etc/crontab`:

```bash
# PostgreSQL Backup Schedule

# Full backup daily at 2 AM
0 2 * * * postgres /opt/backup/scripts/full_backup.sh

# Incremental backup every hour
0 * * * * postgres /opt/backup/scripts/incremental_backup.sh

# Schema backup before migrations
0 1 * * 0 postgres /opt/backup/scripts/schema_backup.sh

# Backup monitoring every 30 minutes
*/30 * * * * postgres /opt/backup/scripts/monitor_backups.sh

# Cleanup old WAL files daily at 3 AM
0 3 * * * postgres find /opt/backups/wal -name "*.gz*" -mtime +7 -delete

# Validate latest backup daily at 4 AM
0 4 * * * postgres /opt/backup/scripts/validate_backup.sh $(date +%Y%m%d_020000)
```

### Systemd Service for Continuous WAL Archiving

Create `/etc/systemd/system/postgresql-wal-receiver.service`:

```ini
[Unit]
Description=PostgreSQL WAL Receiver
After=postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=postgres
ExecStart=/usr/bin/pg_receivewal -D /opt/backups/wal_stream --synchronous
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable the service:
```bash
systemctl enable postgresql-wal-receiver
systemctl start postgresql-wal-receiver
```

## Disaster Recovery Procedures

### 1. Complete System Recovery

```bash
#!/bin/bash

# Complete Disaster Recovery Script

echo "Starting disaster recovery procedure..."

# 1. Prepare new system
# - Install PostgreSQL
# - Configure network and storage
# - Install backup tools

# 2. Download backups from cloud storage
if [ -n "$S3_BACKUP_BUCKET" ]; then
    echo "Downloading backups from S3..."
    aws s3 sync "s3://$S3_BACKUP_BUCKET/" "/opt/backups/" --region "$S3_REGION"
fi

# 3. Find latest backup
LATEST_BACKUP=$(find /opt/backups/postgresql -name "full_*" -type d | sort | tail -1)
BACKUP_DATE=$(basename "$LATEST_BACKUP" | sed 's/full_//')

echo "Using backup: $BACKUP_DATE"

# 4. Perform recovery
/opt/backup/scripts/full_recovery.sh "$BACKUP_DATE"

# 5. Verify database integrity
psql -c "SELECT count(*) FROM workflows;"
psql -c "SELECT count(*) FROM tasks;"
psql -c "SELECT count(*) FROM agent_sessions;"

echo "Disaster recovery completed"
```

### 2. Cross-Region Backup Replication

```bash
#!/bin/bash

# Cross-Region Backup Replication

PRIMARY_REGION="us-east-1"
BACKUP_REGION="us-west-2"
PRIMARY_BUCKET="primary-backup-bucket"
BACKUP_BUCKET="backup-backup-bucket"

# Replicate to backup region
aws s3 sync "s3://$PRIMARY_BUCKET/" "s3://$BACKUP_BUCKET/" \
    --source-region "$PRIMARY_REGION" \
    --region "$BACKUP_REGION" \
    --delete

echo "Cross-region replication completed"
```

## Testing and Validation

### 1. Recovery Testing Schedule

- **Weekly**: Validate latest backup integrity
- **Monthly**: Perform test recovery to staging environment
- **Quarterly**: Full disaster recovery drill
- **Annually**: Cross-region recovery test

### 2. Recovery Test Script

```bash
#!/bin/bash

# Recovery Test Script

TEST_ENV="staging"
BACKUP_DATE="$1"

echo "Starting recovery test for backup: $BACKUP_DATE"

# Create test database
createdb "test_recovery_$(date +%s)"

# Perform recovery
/opt/backup/scripts/full_recovery.sh "$BACKUP_DATE"

# Run validation queries
psql -d "test_recovery_$(date +%s)" -c "
    SELECT 
        'workflows' as table_name, count(*) as record_count 
    FROM workflows
    UNION ALL
    SELECT 
        'tasks' as table_name, count(*) as record_count 
    FROM tasks
    UNION ALL
    SELECT 
        'agent_sessions' as table_name, count(*) as record_count 
    FROM agent_sessions;
"

echo "Recovery test completed successfully"
```

## Security Considerations

### 1. Backup Encryption

- **Encryption at Rest**: All backup files encrypted with AES-256
- **Key Management**: Secure key storage and rotation
- **Access Control**: Restricted access to backup files and keys

### 2. Network Security

- **Secure Transfer**: All backup transfers use SSL/TLS
- **VPN Access**: Backup systems accessible only via VPN
- **Audit Logging**: All backup operations logged and monitored

### 3. Compliance

- **Data Retention**: Automated cleanup based on retention policies
- **Access Auditing**: All backup access logged and reviewed
- **Encryption Standards**: Compliance with industry standards

## Conclusion

This comprehensive backup and recovery strategy ensures:

1. **Data Protection**: Multiple backup types with encryption
2. **Quick Recovery**: Automated recovery procedures
3. **Disaster Resilience**: Cross-region replication and testing
4. **Compliance**: Audit trails and retention policies
5. **Monitoring**: Automated alerts and validation

Regular testing and monitoring of these procedures is essential to ensure they work correctly when needed. The backup system should be treated as a critical component of the overall infrastructure and maintained accordingly.

