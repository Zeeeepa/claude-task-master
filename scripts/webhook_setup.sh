#!/bin/bash

# Webhook Setup Script
# Sets up GitHub webhooks and configures the webhook architecture

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="${PROJECT_ROOT}/config/webhook_config.json"
ENV_FILE="${PROJECT_ROOT}/.env"

# Default values
DEFAULT_WEBHOOK_PORT=3001
DEFAULT_REDIS_HOST="localhost"
DEFAULT_REDIS_PORT=6379
DEFAULT_AGENTAPI_URL="http://localhost:8000"

# Functions
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

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_deps=()
    
    if ! command_exists node; then
        missing_deps+=("node")
    fi
    
    if ! command_exists npm; then
        missing_deps+=("npm")
    fi
    
    if ! command_exists redis-cli; then
        log_warning "redis-cli not found. Redis server may not be installed."
    fi
    
    if ! command_exists curl; then
        missing_deps+=("curl")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_error "Please install the missing dependencies and try again."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Check if Redis is running
check_redis() {
    log_info "Checking Redis connection..."
    
    local redis_host="${REDIS_HOST:-$DEFAULT_REDIS_HOST}"
    local redis_port="${REDIS_PORT:-$DEFAULT_REDIS_PORT}"
    
    if command_exists redis-cli; then
        if redis-cli -h "$redis_host" -p "$redis_port" ping >/dev/null 2>&1; then
            log_success "Redis is running and accessible"
        else
            log_warning "Redis is not accessible at $redis_host:$redis_port"
            log_info "You may need to start Redis or update the connection settings"
        fi
    else
        log_warning "redis-cli not available, skipping Redis check"
    fi
}

# Setup environment variables
setup_environment() {
    log_info "Setting up environment variables..."
    
    # Create .env file if it doesn't exist
    if [ ! -f "$ENV_FILE" ]; then
        touch "$ENV_FILE"
        log_info "Created .env file"
    fi
    
    # Function to set environment variable
    set_env_var() {
        local var_name="$1"
        local var_value="$2"
        local description="$3"
        
        if grep -q "^${var_name}=" "$ENV_FILE"; then
            log_info "$var_name already set in .env file"
        else
            echo "# $description" >> "$ENV_FILE"
            echo "${var_name}=${var_value}" >> "$ENV_FILE"
            echo "" >> "$ENV_FILE"
            log_success "Added $var_name to .env file"
        fi
    }
    
    # Prompt for GitHub webhook secret
    if [ -z "$GITHUB_WEBHOOK_SECRET" ]; then
        echo -n "Enter GitHub webhook secret (leave empty to generate): "
        read -r github_secret
        
        if [ -z "$github_secret" ]; then
            github_secret=$(openssl rand -hex 32)
            log_info "Generated GitHub webhook secret: $github_secret"
        fi
        
        set_env_var "GITHUB_WEBHOOK_SECRET" "$github_secret" "GitHub webhook secret for signature verification"
    fi
    
    # Set other environment variables
    set_env_var "WEBHOOK_PORT" "$DEFAULT_WEBHOOK_PORT" "Port for webhook server"
    set_env_var "REDIS_HOST" "$DEFAULT_REDIS_HOST" "Redis host for event queue"
    set_env_var "REDIS_PORT" "$DEFAULT_REDIS_PORT" "Redis port"
    set_env_var "AGENTAPI_BASE_URL" "$DEFAULT_AGENTAPI_URL" "AgentAPI base URL"
    
    # Prompt for optional variables
    if [ -z "$AGENTAPI_API_KEY" ]; then
        echo -n "Enter AgentAPI key (optional): "
        read -r agentapi_key
        if [ -n "$agentapi_key" ]; then
            set_env_var "AGENTAPI_API_KEY" "$agentapi_key" "AgentAPI authentication key"
        fi
    fi
    
    if [ -z "$LINEAR_API_KEY" ]; then
        echo -n "Enter Linear API key (optional): "
        read -r linear_key
        if [ -n "$linear_key" ]; then
            set_env_var "LINEAR_API_KEY" "$linear_key" "Linear API key for ticket updates"
        fi
    fi
    
    if [ -z "$DATABASE_URL" ]; then
        echo -n "Enter database URL (optional): "
        read -r db_url
        if [ -n "$db_url" ]; then
            set_env_var "DATABASE_URL" "$db_url" "Database connection string"
        fi
    fi
    
    log_success "Environment setup completed"
}

# Install dependencies
install_dependencies() {
    log_info "Installing Node.js dependencies..."
    
    cd "$PROJECT_ROOT"
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        log_error "package.json not found in project root"
        exit 1
    fi
    
    # Install dependencies
    npm install
    
    log_success "Dependencies installed"
}

# Setup Redis queues
setup_redis_queues() {
    log_info "Setting up Redis queues..."
    
    local redis_host="${REDIS_HOST:-$DEFAULT_REDIS_HOST}"
    local redis_port="${REDIS_PORT:-$DEFAULT_REDIS_PORT}"
    
    if command_exists redis-cli && redis-cli -h "$redis_host" -p "$redis_port" ping >/dev/null 2>&1; then
        # Create queue monitoring keys
        redis-cli -h "$redis_host" -p "$redis_port" <<EOF
SET webhook:setup:timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SET webhook:setup:version "1.0.0"
SADD webhook:queues "webhook:events:default"
SADD webhook:queues "webhook:events:deployment"
SADD webhook:queues "webhook:events:validation"
SADD webhook:queues "webhook:events:workflow"
SADD webhook:queues "webhook:events:recovery"
SADD webhook:queues "webhook:events:dead_letter"
EOF
        log_success "Redis queues initialized"
    else
        log_warning "Redis not accessible, skipping queue setup"
    fi
}

# Test webhook endpoint
test_webhook_endpoint() {
    log_info "Testing webhook endpoint..."
    
    local webhook_port="${WEBHOOK_PORT:-$DEFAULT_WEBHOOK_PORT}"
    local webhook_url="http://localhost:${webhook_port}/health"
    
    # Start webhook server in background for testing
    log_info "Starting webhook server for testing..."
    cd "$PROJECT_ROOT"
    
    # Create a simple test script
    cat > test_webhook.js << 'EOF'
const { GitHubWebhookHandler } = require('./src/ai_cicd_system/webhooks/github_webhook_handler.js');

async function testWebhook() {
    const handler = new GitHubWebhookHandler({
        port: process.env.WEBHOOK_PORT || 3001,
        secret: process.env.GITHUB_WEBHOOK_SECRET || 'test-secret'
    });
    
    try {
        await handler.initialize();
        await handler.start();
        console.log('Webhook server started successfully');
        
        // Stop after 5 seconds
        setTimeout(async () => {
            await handler.stop();
            console.log('Webhook server stopped');
            process.exit(0);
        }, 5000);
        
    } catch (error) {
        console.error('Webhook test failed:', error.message);
        process.exit(1);
    }
}

testWebhook();
EOF
    
    # Run test
    if timeout 10 node test_webhook.js; then
        log_success "Webhook endpoint test passed"
    else
        log_warning "Webhook endpoint test failed or timed out"
    fi
    
    # Clean up test file
    rm -f test_webhook.js
}

# Generate GitHub webhook configuration
generate_github_config() {
    log_info "Generating GitHub webhook configuration..."
    
    local webhook_port="${WEBHOOK_PORT:-$DEFAULT_WEBHOOK_PORT}"
    local webhook_secret="${GITHUB_WEBHOOK_SECRET}"
    
    cat > github_webhook_config.json << EOF
{
  "name": "AI CI/CD Webhook",
  "config": {
    "url": "https://your-domain.com/webhook/github",
    "content_type": "json",
    "secret": "${webhook_secret}",
    "insecure_ssl": "0"
  },
  "events": [
    "pull_request",
    "push",
    "check_run",
    "check_suite",
    "pull_request_review",
    "pull_request_review_comment",
    "status"
  ],
  "active": true
}
EOF
    
    log_success "GitHub webhook configuration saved to github_webhook_config.json"
    log_info "Use this configuration to set up your GitHub webhook"
    log_info "Remember to update the URL to your actual domain"
}

# Create systemd service (Linux only)
create_systemd_service() {
    if [ "$(uname)" != "Linux" ]; then
        log_info "Skipping systemd service creation (not on Linux)"
        return
    fi
    
    log_info "Creating systemd service..."
    
    local service_file="/etc/systemd/system/ai-cicd-webhook.service"
    local user="$(whoami)"
    local webhook_port="${WEBHOOK_PORT:-$DEFAULT_WEBHOOK_PORT}"
    
    # Check if we can write to systemd directory
    if [ ! -w "/etc/systemd/system" ]; then
        log_warning "Cannot write to /etc/systemd/system (need sudo)"
        log_info "Creating service file in current directory instead"
        service_file="./ai-cicd-webhook.service"
    fi
    
    cat > "$service_file" << EOF
[Unit]
Description=AI CI/CD Webhook Server
After=network.target redis.service
Wants=redis.service

[Service]
Type=simple
User=$user
WorkingDirectory=$PROJECT_ROOT
Environment=NODE_ENV=production
Environment=WEBHOOK_PORT=$webhook_port
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node src/ai_cicd_system/webhooks/github_webhook_handler.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=ai-cicd-webhook

[Install]
WantedBy=multi-user.target
EOF
    
    if [ "$service_file" = "/etc/systemd/system/ai-cicd-webhook.service" ]; then
        log_success "Systemd service created at $service_file"
        log_info "Run 'sudo systemctl enable ai-cicd-webhook' to enable auto-start"
        log_info "Run 'sudo systemctl start ai-cicd-webhook' to start the service"
    else
        log_success "Systemd service file created at $service_file"
        log_info "Copy to /etc/systemd/system/ with sudo to install"
    fi
}

# Create Docker configuration
create_docker_config() {
    log_info "Creating Docker configuration..."
    
    # Dockerfile
    cat > Dockerfile.webhook << 'EOF'
FROM node:18-alpine

# Install dependencies
RUN apk add --no-cache redis

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S webhook -u 1001

# Change ownership
RUN chown -R webhook:nodejs /app
USER webhook

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start webhook server
CMD ["node", "src/ai_cicd_system/webhooks/github_webhook_handler.js"]
EOF
    
    # Docker Compose
    cat > docker-compose.webhook.yml << 'EOF'
version: '3.8'

services:
  webhook:
    build:
      context: .
      dockerfile: Dockerfile.webhook
    ports:
      - "${WEBHOOK_PORT:-3001}:3001"
    environment:
      - NODE_ENV=production
      - WEBHOOK_PORT=3001
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}
      - AGENTAPI_BASE_URL=${AGENTAPI_BASE_URL}
      - AGENTAPI_API_KEY=${AGENTAPI_API_KEY}
      - LINEAR_API_KEY=${LINEAR_API_KEY}
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - webhook-network

  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - webhook-network
    command: redis-server --appendonly yes

  redis-commander:
    image: rediscommander/redis-commander:latest
    environment:
      - REDIS_HOSTS=local:redis:6379
    ports:
      - "8081:8081"
    depends_on:
      - redis
    networks:
      - webhook-network

volumes:
  redis-data:

networks:
  webhook-network:
    driver: bridge
EOF
    
    log_success "Docker configuration created"
    log_info "Use 'docker-compose -f docker-compose.webhook.yml up' to start"
}

# Create monitoring scripts
create_monitoring_scripts() {
    log_info "Creating monitoring scripts..."
    
    # Health check script
    cat > scripts/webhook_health_check.sh << 'EOF'
#!/bin/bash

# Webhook Health Check Script

WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:3001}"
TIMEOUT="${TIMEOUT:-10}"

check_endpoint() {
    local endpoint="$1"
    local description="$2"
    
    echo -n "Checking $description... "
    
    if curl -s --max-time "$TIMEOUT" "$WEBHOOK_URL$endpoint" > /dev/null; then
        echo "✓ OK"
        return 0
    else
        echo "✗ FAILED"
        return 1
    fi
}

echo "=== Webhook Health Check ==="
echo "URL: $WEBHOOK_URL"
echo "Timeout: ${TIMEOUT}s"
echo ""

failed=0

check_endpoint "/health" "Health endpoint" || ((failed++))
check_endpoint "/metrics" "Metrics endpoint" || ((failed++))

echo ""
if [ $failed -eq 0 ]; then
    echo "✓ All checks passed"
    exit 0
else
    echo "✗ $failed check(s) failed"
    exit 1
fi
EOF
    
    # Queue monitoring script
    cat > scripts/webhook_queue_monitor.sh << 'EOF'
#!/bin/bash

# Webhook Queue Monitor Script

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_CLI="redis-cli -h $REDIS_HOST -p $REDIS_PORT"

echo "=== Webhook Queue Monitor ==="
echo "Redis: $REDIS_HOST:$REDIS_PORT"
echo ""

# Check Redis connection
if ! $REDIS_CLI ping > /dev/null 2>&1; then
    echo "✗ Cannot connect to Redis"
    exit 1
fi

echo "✓ Redis connection OK"
echo ""

# Queue sizes
echo "Queue Sizes:"
for queue in default deployment validation workflow recovery dead_letter; do
    size=$($REDIS_CLI zcard "webhook:events:$queue" 2>/dev/null || echo "0")
    printf "  %-12s: %s\n" "$queue" "$size"
done

echo ""

# Dead letter queue details
dead_letter_size=$($REDIS_CLI llen "webhook:events:dead_letter" 2>/dev/null || echo "0")
if [ "$dead_letter_size" -gt 0 ]; then
    echo "⚠ Dead letter queue has $dead_letter_size items"
    echo "Recent dead letter items:"
    $REDIS_CLI lrange "webhook:events:dead_letter" 0 4 | head -5
fi

# Correlation stats
echo ""
echo "Correlation Stats:"
workflow_count=$($REDIS_CLI keys "webhook:correlation:workflows:*" | wc -l)
event_count=$($REDIS_CLI keys "webhook:correlation:events:*" | wc -l)
printf "  %-12s: %s\n" "Workflows" "$workflow_count"
printf "  %-12s: %s\n" "Events" "$event_count"
EOF
    
    # Make scripts executable
    chmod +x scripts/webhook_health_check.sh
    chmod +x scripts/webhook_queue_monitor.sh
    
    log_success "Monitoring scripts created"
}

# Main setup function
main() {
    echo "=== AI CI/CD Webhook Setup ==="
    echo ""
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-deps)
                SKIP_DEPS=true
                shift
                ;;
            --skip-test)
                SKIP_TEST=true
                shift
                ;;
            --docker-only)
                DOCKER_ONLY=true
                shift
                ;;
            --help)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --skip-deps    Skip dependency installation"
                echo "  --skip-test    Skip webhook endpoint testing"
                echo "  --docker-only  Only create Docker configuration"
                echo "  --help         Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Run setup steps
    check_prerequisites
    
    if [ "$DOCKER_ONLY" = true ]; then
        setup_environment
        create_docker_config
        log_success "Docker-only setup completed"
        exit 0
    fi
    
    setup_environment
    
    if [ "$SKIP_DEPS" != true ]; then
        install_dependencies
    fi
    
    check_redis
    setup_redis_queues
    
    if [ "$SKIP_TEST" != true ]; then
        test_webhook_endpoint
    fi
    
    generate_github_config
    create_systemd_service
    create_docker_config
    create_monitoring_scripts
    
    echo ""
    log_success "=== Webhook setup completed successfully! ==="
    echo ""
    echo "Next steps:"
    echo "1. Review and update .env file with your configuration"
    echo "2. Set up GitHub webhook using github_webhook_config.json"
    echo "3. Start the webhook server:"
    echo "   - Directly: node src/ai_cicd_system/webhooks/github_webhook_handler.js"
    echo "   - With Docker: docker-compose -f docker-compose.webhook.yml up"
    echo "   - With systemd: sudo systemctl start ai-cicd-webhook"
    echo "4. Monitor with: ./scripts/webhook_health_check.sh"
    echo ""
}

# Run main function
main "$@"

