#!/bin/bash

# PostgreSQL Database Setup with Cloudflare Integration
# This script sets up the complete database infrastructure with Cloudflare tunnel support
# Version: 1.0.0
# Created: 2025-05-28

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="${PROJECT_ROOT}/logs/database_setup.log"
BACKUP_DIR="${PROJECT_ROOT}/backups"
CONFIG_DIR="${PROJECT_ROOT}/infrastructure/cloudflare"

# Default values (can be overridden by environment variables)
DB_NAME="${DB_NAME:-codegen-taskmaster-db}"
DB_USER="${DB_USER:-software_developer}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
POSTGRES_VERSION="${POSTGRES_VERSION:-15}"
USE_CLOUDFLARE_TUNNEL="${USE_CLOUDFLARE_TUNNEL:-false}"
ENVIRONMENT="${ENVIRONMENT:-development}"

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Create log directory if it doesn't exist
    mkdir -p "$(dirname "$LOG_FILE")"
    
    case "$level" in
        "INFO")
            echo -e "${GREEN}[INFO]${NC} $message"
            echo "[$timestamp] [INFO] $message" >> "$LOG_FILE"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} $message"
            echo "[$timestamp] [WARN] $message" >> "$LOG_FILE"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} $message"
            echo "[$timestamp] [ERROR] $message" >> "$LOG_FILE"
            ;;
        "DEBUG")
            if [[ "${DEBUG:-false}" == "true" ]]; then
                echo -e "${BLUE}[DEBUG]${NC} $message"
                echo "[$timestamp] [DEBUG] $message" >> "$LOG_FILE"
            fi
            ;;
    esac
}

# Error handling
error_exit() {
    log "ERROR" "$1"
    exit 1
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    log "INFO" "Checking prerequisites..."
    
    # Check if PostgreSQL is installed
    if ! command_exists psql; then
        error_exit "PostgreSQL client (psql) is not installed. Please install PostgreSQL first."
    fi
    
    # Check if Node.js is installed (for running JS config files)
    if ! command_exists node; then
        error_exit "Node.js is not installed. Please install Node.js first."
    fi
    
    # Check if Cloudflare tunnel is needed and available
    if [[ "$USE_CLOUDFLARE_TUNNEL" == "true" ]]; then
        if ! command_exists cloudflared; then
            log "WARN" "cloudflared is not installed. Installing..."
            install_cloudflared
        fi
    fi
    
    # Check if required environment variables are set
    if [[ -z "${DB_PASSWORD:-}" ]]; then
        log "WARN" "DB_PASSWORD is not set. You will be prompted to enter it."
    fi
    
    log "INFO" "Prerequisites check completed."
}

# Install Cloudflare tunnel daemon
install_cloudflared() {
    log "INFO" "Installing cloudflared..."
    
    case "$(uname -s)" in
        Linux*)
            # Download and install cloudflared for Linux
            wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
            sudo dpkg -i cloudflared-linux-amd64.deb
            rm cloudflared-linux-amd64.deb
            ;;
        Darwin*)
            # Install via Homebrew on macOS
            if command_exists brew; then
                brew install cloudflared
            else
                error_exit "Homebrew is required to install cloudflared on macOS"
            fi
            ;;
        *)
            error_exit "Unsupported operating system for automatic cloudflared installation"
            ;;
    esac
    
    log "INFO" "cloudflared installed successfully."
}

# Setup PostgreSQL database
setup_postgresql() {
    log "INFO" "Setting up PostgreSQL database..."
    
    # Prompt for password if not set
    if [[ -z "${DB_PASSWORD:-}" ]]; then
        read -s -p "Enter database password for user '$DB_USER': " DB_PASSWORD
        echo
        export DB_PASSWORD
    fi
    
    # Check if PostgreSQL is running
    if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
        log "WARN" "PostgreSQL is not running on $DB_HOST:$DB_PORT"
        
        # Try to start PostgreSQL service
        if command_exists systemctl; then
            log "INFO" "Attempting to start PostgreSQL service..."
            sudo systemctl start postgresql
            sleep 5
        elif command_exists brew; then
            log "INFO" "Attempting to start PostgreSQL via Homebrew..."
            brew services start postgresql
            sleep 5
        else
            error_exit "Cannot start PostgreSQL automatically. Please start it manually."
        fi
    fi
    
    # Create database if it doesn't exist
    log "INFO" "Creating database '$DB_NAME' if it doesn't exist..."
    
    # Use postgres user to create database and user
    PGPASSWORD="${POSTGRES_PASSWORD:-}" createdb -h "$DB_HOST" -p "$DB_PORT" -U "${POSTGRES_USER:-postgres}" "$DB_NAME" 2>/dev/null || {
        log "DEBUG" "Database '$DB_NAME' might already exist or creation failed"
    }
    
    # Create user if it doesn't exist
    log "INFO" "Creating user '$DB_USER' if it doesn't exist..."
    PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "${POSTGRES_USER:-postgres}" -d postgres -c "
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
                CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD';
            END IF;
        END
        \$\$;
    " >/dev/null 2>&1 || log "WARN" "User creation might have failed"
    
    # Grant privileges
    log "INFO" "Granting privileges to user '$DB_USER'..."
    PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "${POSTGRES_USER:-postgres}" -d "$DB_NAME" -c "
        GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
        GRANT ALL ON SCHEMA public TO $DB_USER;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO $DB_USER;
    " >/dev/null 2>&1 || log "WARN" "Privilege granting might have failed"
    
    log "INFO" "PostgreSQL database setup completed."
}

# Run database migrations
run_migrations() {
    log "INFO" "Running database migrations..."
    
    # Set environment variables for the migration
    export DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD
    
    # Run initial schema migration
    log "INFO" "Running initial schema migration..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$PROJECT_ROOT/src/ai_cicd_system/database/migrations/001_initial_schema.sql" || {
        log "WARN" "Initial schema migration might have failed or already applied"
    }
    
    # Run tasks schema migration
    log "INFO" "Running enhanced tasks schema migration..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$PROJECT_ROOT/src/ai_cicd_system/database/schema/tasks_schema.sql" || {
        log "WARN" "Tasks schema migration might have failed or already applied"
    }
    
    # Run templates schema migration
    log "INFO" "Running templates schema migration..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$PROJECT_ROOT/src/ai_cicd_system/database/schema/templates_schema.sql" || {
        log "WARN" "Templates schema migration might have failed or already applied"
    }
    
    log "INFO" "Database migrations completed."
}

# Setup Cloudflare tunnel
setup_cloudflare_tunnel() {
    if [[ "$USE_CLOUDFLARE_TUNNEL" != "true" ]]; then
        log "INFO" "Cloudflare tunnel setup skipped (USE_CLOUDFLARE_TUNNEL=false)"
        return 0
    fi
    
    log "INFO" "Setting up Cloudflare tunnel..."
    
    # Check required environment variables
    if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
        error_exit "CLOUDFLARE_API_TOKEN is required for tunnel setup"
    fi
    
    if [[ -z "${CLOUDFLARE_ZONE_ID:-}" ]]; then
        error_exit "CLOUDFLARE_ZONE_ID is required for tunnel setup"
    fi
    
    # Create tunnel if it doesn't exist
    local tunnel_name="${CLOUDFLARE_TUNNEL_NAME:-codegen-taskmaster-db-tunnel}"
    
    if [[ -z "${CLOUDFLARE_TUNNEL_UUID:-}" ]]; then
        log "INFO" "Creating new Cloudflare tunnel '$tunnel_name'..."
        
        # Login to Cloudflare
        echo "$CLOUDFLARE_API_TOKEN" | cloudflared tunnel login --token-stdin
        
        # Create tunnel
        cloudflared tunnel create "$tunnel_name"
        
        # Get tunnel UUID
        local tunnel_uuid=$(cloudflared tunnel list | grep "$tunnel_name" | awk '{print $1}')
        
        if [[ -n "$tunnel_uuid" ]]; then
            log "INFO" "Tunnel created with UUID: $tunnel_uuid"
            echo "export CLOUDFLARE_TUNNEL_UUID=$tunnel_uuid" >> "$PROJECT_ROOT/.env"
        else
            error_exit "Failed to create Cloudflare tunnel"
        fi
    else
        log "INFO" "Using existing tunnel UUID: $CLOUDFLARE_TUNNEL_UUID"
    fi
    
    # Generate tunnel configuration
    log "INFO" "Generating tunnel configuration..."
    
    # Create config directory
    mkdir -p "$CONFIG_DIR"
    
    # Generate config from template
    envsubst < "$CONFIG_DIR/tunnel_config.yaml" > "$CONFIG_DIR/tunnel_config_generated.yaml"
    
    # Route DNS to tunnel
    local domain="${CLOUDFLARE_ACCESS_DOMAIN:-db.codegen-taskmaster.com}"
    log "INFO" "Setting up DNS routing for domain: $domain"
    
    cloudflared tunnel route dns "${CLOUDFLARE_TUNNEL_UUID:-$tunnel_uuid}" "$domain"
    
    # Install tunnel as a service
    log "INFO" "Installing tunnel as a system service..."
    sudo cloudflared service install --config "$CONFIG_DIR/tunnel_config_generated.yaml"
    
    # Start tunnel service
    sudo systemctl start cloudflared
    sudo systemctl enable cloudflared
    
    log "INFO" "Cloudflare tunnel setup completed."
}

# Setup SSL certificates
setup_ssl_certificates() {
    log "INFO" "Setting up SSL certificates..."
    
    local cert_dir="$PROJECT_ROOT/certs"
    mkdir -p "$cert_dir"
    
    if [[ "$USE_CLOUDFLARE_TUNNEL" == "true" ]]; then
        log "INFO" "Using Cloudflare-managed SSL certificates"
        
        # Cloudflare handles SSL termination
        # Generate client certificates for database connection
        if [[ ! -f "$cert_dir/client.crt" ]]; then
            log "INFO" "Generating client SSL certificates..."
            
            # Generate private key
            openssl genrsa -out "$cert_dir/client.key" 2048
            
            # Generate certificate signing request
            openssl req -new -key "$cert_dir/client.key" -out "$cert_dir/client.csr" -subj "/CN=$DB_USER"
            
            # Generate self-signed certificate (for development)
            openssl x509 -req -in "$cert_dir/client.csr" -signkey "$cert_dir/client.key" -out "$cert_dir/client.crt" -days 365
            
            # Set proper permissions
            chmod 600 "$cert_dir/client.key"
            chmod 644 "$cert_dir/client.crt"
            
            log "INFO" "Client SSL certificates generated"
        fi
    else
        log "INFO" "SSL certificate setup skipped (not using Cloudflare tunnel)"
    fi
}

# Setup backup system
setup_backup_system() {
    log "INFO" "Setting up backup system..."
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    # Create backup script
    cat > "$BACKUP_DIR/backup_database.sh" << 'EOF'
#!/bin/bash

# Database backup script
# Generated automatically by setup_cloudflare_db.sh

set -euo pipefail

# Configuration
BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_backup_$TIMESTAMP.sql"

# Load environment variables
if [[ -f "$(dirname "$BACKUP_DIR")/.env" ]]; then
    source "$(dirname "$BACKUP_DIR")/.env"
fi

# Create backup
echo "Creating database backup..."
PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --verbose --clean --if-exists --create > "$BACKUP_FILE"

# Compress backup
gzip "$BACKUP_FILE"

echo "Backup created: ${BACKUP_FILE}.gz"

# Clean up old backups (keep last 30 days)
find "$BACKUP_DIR" -name "${DB_NAME}_backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed successfully"
EOF
    
    # Make backup script executable
    chmod +x "$BACKUP_DIR/backup_database.sh"
    
    # Create restore script
    cat > "$BACKUP_DIR/restore_database.sh" << 'EOF'
#!/bin/bash

# Database restore script
# Generated automatically by setup_cloudflare_db.sh

set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"

if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "Error: Backup file '$BACKUP_FILE' not found"
    exit 1
fi

# Load environment variables
if [[ -f "$(dirname "$(dirname "${BASH_SOURCE[0]}")")/.env" ]]; then
    source "$(dirname "$(dirname "${BASH_SOURCE[0]}")")/.env"
fi

echo "Restoring database from: $BACKUP_FILE"

# Decompress and restore
gunzip -c "$BACKUP_FILE" | PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres

echo "Database restored successfully"
EOF
    
    # Make restore script executable
    chmod +x "$BACKUP_DIR/restore_database.sh"
    
    # Setup cron job for automatic backups
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log "INFO" "Setting up automatic backup cron job..."
        
        # Add cron job (daily at 2 AM)
        (crontab -l 2>/dev/null; echo "0 2 * * * $BACKUP_DIR/backup_database.sh") | crontab -
        
        log "INFO" "Automatic backup scheduled for 2 AM daily"
    fi
    
    log "INFO" "Backup system setup completed."
}

# Validate setup
validate_setup() {
    log "INFO" "Validating database setup..."
    
    # Test database connection
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        log "INFO" "✓ Database connection successful"
    else
        error_exit "✗ Database connection failed"
    fi
    
    # Test table creation
    local table_count=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')
    
    if [[ "$table_count" -gt 0 ]]; then
        log "INFO" "✓ Database tables created ($table_count tables found)"
    else
        log "WARN" "✗ No tables found in database"
    fi
    
    # Test Cloudflare tunnel if enabled
    if [[ "$USE_CLOUDFLARE_TUNNEL" == "true" ]]; then
        if systemctl is-active --quiet cloudflared; then
            log "INFO" "✓ Cloudflare tunnel service is running"
        else
            log "WARN" "✗ Cloudflare tunnel service is not running"
        fi
    fi
    
    log "INFO" "Setup validation completed."
}

# Generate environment file
generate_env_file() {
    log "INFO" "Generating environment configuration..."
    
    local env_file="$PROJECT_ROOT/.env.example"
    
    cat > "$env_file" << EOF
# Database Configuration
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=your_secure_password_here
DB_SSL_MODE=require

# Cloudflare Configuration
USE_CLOUDFLARE_TUNNEL=$USE_CLOUDFLARE_TUNNEL
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here
CLOUDFLARE_ZONE_ID=your_zone_id_here
CLOUDFLARE_ACCESS_DOMAIN=db.codegen-taskmaster.com
CLOUDFLARE_TUNNEL_NAME=codegen-taskmaster-db-tunnel
CLOUDFLARE_TUNNEL_UUID=your_tunnel_uuid_here

# Environment
NODE_ENV=$ENVIRONMENT

# Security
DB_CONNECTION_ENCRYPTION=true
DB_SQL_INJECTION_PROTECTION=true
DB_RATE_LIMITING_ENABLED=true

# Monitoring
DB_LOG_SLOW_QUERIES=true
DB_PERFORMANCE_INSIGHTS=true

# Backup
DB_BACKUP_ENABLED=true
DB_BACKUP_RETENTION_DAYS=30
EOF
    
    log "INFO" "Environment configuration saved to $env_file"
    log "INFO" "Please copy this file to .env and update the values"
}

# Main setup function
main() {
    log "INFO" "Starting PostgreSQL Database Setup with Cloudflare Integration"
    log "INFO" "Environment: $ENVIRONMENT"
    log "INFO" "Database: $DB_NAME"
    log "INFO" "User: $DB_USER"
    log "INFO" "Host: $DB_HOST:$DB_PORT"
    log "INFO" "Cloudflare Tunnel: $USE_CLOUDFLARE_TUNNEL"
    
    # Run setup steps
    check_prerequisites
    setup_postgresql
    run_migrations
    setup_ssl_certificates
    setup_cloudflare_tunnel
    setup_backup_system
    validate_setup
    generate_env_file
    
    log "INFO" "Database setup completed successfully!"
    log "INFO" "Next steps:"
    log "INFO" "1. Copy .env.example to .env and update the values"
    log "INFO" "2. Test the database connection"
    log "INFO" "3. Configure your application to use the database"
    
    if [[ "$USE_CLOUDFLARE_TUNNEL" == "true" ]]; then
        log "INFO" "4. Configure Cloudflare Access policies for security"
        log "INFO" "5. Test external access through the tunnel"
    fi
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "PostgreSQL Database Setup with Cloudflare Integration"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h          Show this help message"
        echo "  --validate-only     Only run validation checks"
        echo "  --backup-only       Only setup backup system"
        echo "  --tunnel-only       Only setup Cloudflare tunnel"
        echo ""
        echo "Environment Variables:"
        echo "  DB_NAME             Database name (default: codegen-taskmaster-db)"
        echo "  DB_USER             Database user (default: software_developer)"
        echo "  DB_HOST             Database host (default: localhost)"
        echo "  DB_PORT             Database port (default: 5432)"
        echo "  DB_PASSWORD         Database password (required)"
        echo "  USE_CLOUDFLARE_TUNNEL Enable Cloudflare tunnel (default: false)"
        echo "  ENVIRONMENT         Environment (default: development)"
        echo ""
        exit 0
        ;;
    --validate-only)
        validate_setup
        exit 0
        ;;
    --backup-only)
        setup_backup_system
        exit 0
        ;;
    --tunnel-only)
        setup_cloudflare_tunnel
        exit 0
        ;;
    "")
        main
        ;;
    *)
        error_exit "Unknown option: $1. Use --help for usage information."
        ;;
esac

