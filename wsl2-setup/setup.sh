#!/bin/bash

# WSL2 Environment Setup Script for AgentAPI
# 
# This script sets up a complete WSL2 environment for running AgentAPI middleware
# with support for Claude Code, Goose, Aider, and Codex agents.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AGENTAPI_USER=${AGENTAPI_USER:-"agentapi"}
AGENTAPI_HOME="/home/${AGENTAPI_USER}"
NODE_VERSION=${NODE_VERSION:-"20"}
PYTHON_VERSION=${PYTHON_VERSION:-"3.11"}
GO_VERSION=${GO_VERSION:-"1.21.5"}

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

# Check if running in WSL2
check_wsl2() {
    log_info "Checking WSL2 environment..."
    
    if [[ ! -f /proc/version ]] || ! grep -qi "microsoft" /proc/version; then
        log_error "This script must be run in WSL2"
        exit 1
    fi
    
    if ! grep -qi "WSL2" /proc/version; then
        log_warning "WSL version detection unclear, proceeding anyway..."
    fi
    
    log_success "WSL2 environment detected"
}

# Update system packages
update_system() {
    log_info "Updating system packages..."
    
    sudo apt-get update -y
    sudo apt-get upgrade -y
    
    # Install essential packages
    sudo apt-get install -y \
        curl \
        wget \
        git \
        build-essential \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        unzip \
        zip \
        jq \
        htop \
        tree \
        vim \
        nano \
        tmux \
        screen
    
    log_success "System packages updated"
}

# Create AgentAPI user
create_user() {
    log_info "Setting up AgentAPI user..."
    
    if id "${AGENTAPI_USER}" &>/dev/null; then
        log_warning "User ${AGENTAPI_USER} already exists"
    else
        sudo useradd -m -s /bin/bash "${AGENTAPI_USER}"
        sudo usermod -aG sudo "${AGENTAPI_USER}"
        log_success "Created user ${AGENTAPI_USER}"
    fi
    
    # Set up SSH directory
    sudo -u "${AGENTAPI_USER}" mkdir -p "${AGENTAPI_HOME}/.ssh"
    sudo -u "${AGENTAPI_USER}" chmod 700 "${AGENTAPI_HOME}/.ssh"
}

# Install Node.js
install_nodejs() {
    log_info "Installing Node.js ${NODE_VERSION}..."
    
    # Install Node.js via NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # Install global packages
    sudo npm install -g \
        npm@latest \
        yarn \
        pnpm \
        pm2 \
        typescript \
        ts-node \
        eslint \
        prettier
    
    # Verify installation
    node_version=$(node --version)
    npm_version=$(npm --version)
    
    log_success "Node.js ${node_version} and npm ${npm_version} installed"
}

# Install Python
install_python() {
    log_info "Installing Python ${PYTHON_VERSION}..."
    
    # Add deadsnakes PPA for latest Python versions
    sudo add-apt-repository ppa:deadsnakes/ppa -y
    sudo apt-get update
    
    # Install Python and related packages
    sudo apt-get install -y \
        python${PYTHON_VERSION} \
        python${PYTHON_VERSION}-dev \
        python${PYTHON_VERSION}-venv \
        python${PYTHON_VERSION}-pip \
        python3-pip \
        pipx
    
    # Set up alternatives
    sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python${PYTHON_VERSION} 1
    sudo update-alternatives --install /usr/bin/python python /usr/bin/python${PYTHON_VERSION} 1
    
    # Install common Python packages
    python3 -m pip install --upgrade pip setuptools wheel
    python3 -m pip install \
        virtualenv \
        pipenv \
        poetry \
        black \
        flake8 \
        mypy \
        pytest \
        requests \
        aiohttp
    
    # Verify installation
    python_version=$(python3 --version)
    pip_version=$(python3 -m pip --version)
    
    log_success "Python ${python_version} and pip ${pip_version} installed"
}

# Install Go
install_go() {
    log_info "Installing Go ${GO_VERSION}..."
    
    # Download and install Go
    wget -q "https://golang.org/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
    sudo rm -rf /usr/local/go
    sudo tar -C /usr/local -xzf /tmp/go.tar.gz
    rm /tmp/go.tar.gz
    
    # Set up Go environment
    echo 'export PATH=$PATH:/usr/local/go/bin' | sudo tee -a /etc/profile
    echo 'export GOPATH=$HOME/go' | sudo tee -a /etc/profile
    echo 'export PATH=$PATH:$GOPATH/bin' | sudo tee -a /etc/profile
    
    # Verify installation
    export PATH=$PATH:/usr/local/go/bin
    go_version=$(go version)
    
    log_success "Go ${go_version} installed"
}

# Install Docker
install_docker() {
    log_info "Installing Docker..."
    
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Add Docker repository
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Add user to docker group
    sudo usermod -aG docker "${AGENTAPI_USER}"
    
    # Start Docker service
    sudo systemctl enable docker
    sudo systemctl start docker
    
    log_success "Docker installed and configured"
}

# Install coding agents
install_agents() {
    log_info "Installing coding agents..."
    
    # Install Claude Code (if available)
    if command -v claude &> /dev/null; then
        log_success "Claude Code already installed"
    else
        log_warning "Claude Code not found - please install manually"
        log_info "Visit: https://github.com/anthropics/claude-code"
    fi
    
    # Install Goose
    if command -v goose &> /dev/null; then
        log_success "Goose already installed"
    else
        log_info "Installing Goose..."
        python3 -m pip install goose-ai
        log_success "Goose installed"
    fi
    
    # Install Aider
    if command -v aider &> /dev/null; then
        log_success "Aider already installed"
    else
        log_info "Installing Aider..."
        python3 -m pip install aider-chat
        log_success "Aider installed"
    fi
    
    # Install Codex (placeholder - adjust based on actual availability)
    if command -v codex &> /dev/null; then
        log_success "Codex already installed"
    else
        log_warning "Codex not found - please install manually if available"
    fi
    
    # Install AgentAPI
    log_info "Installing AgentAPI..."
    if [[ -f "/tmp/agentapi" ]]; then
        sudo cp /tmp/agentapi /usr/local/bin/agentapi
        sudo chmod +x /usr/local/bin/agentapi
        log_success "AgentAPI binary installed"
    else
        log_info "Downloading AgentAPI..."
        # This would download the actual AgentAPI binary
        # For now, we'll create a placeholder
        sudo tee /usr/local/bin/agentapi > /dev/null << 'EOF'
#!/bin/bash
echo "AgentAPI placeholder - replace with actual binary"
EOF
        sudo chmod +x /usr/local/bin/agentapi
        log_warning "AgentAPI placeholder installed - replace with actual binary"
    fi
}

# Set up workspace directories
setup_workspaces() {
    log_info "Setting up workspace directories..."
    
    # Create workspace directories
    sudo -u "${AGENTAPI_USER}" mkdir -p "${AGENTAPI_HOME}/agentapi"
    sudo -u "${AGENTAPI_USER}" mkdir -p "${AGENTAPI_HOME}/agentapi/workspaces"
    sudo -u "${AGENTAPI_USER}" mkdir -p "${AGENTAPI_HOME}/agentapi/logs"
    sudo -u "${AGENTAPI_USER}" mkdir -p "${AGENTAPI_HOME}/agentapi/config"
    sudo -u "${AGENTAPI_USER}" mkdir -p "${AGENTAPI_HOME}/agentapi/scripts"
    
    # Set permissions
    sudo chown -R "${AGENTAPI_USER}:${AGENTAPI_USER}" "${AGENTAPI_HOME}/agentapi"
    sudo chmod -R 755 "${AGENTAPI_HOME}/agentapi"
    
    log_success "Workspace directories created"
}

# Configure environment variables
setup_environment() {
    log_info "Setting up environment configuration..."
    
    # Create environment file
    sudo -u "${AGENTAPI_USER}" tee "${AGENTAPI_HOME}/.agentapi_env" > /dev/null << 'EOF'
# AgentAPI Environment Configuration
export AGENTAPI_HOST=localhost
export AGENTAPI_PORT=3285
export WORKSPACE_ROOT=/home/agentapi/agentapi/workspaces
export LOG_LEVEL=info
export NODE_ENV=production

# Agent Configuration
export CLAUDE_TIMEOUT=30000
export GOOSE_TIMEOUT=30000
export AIDER_TIMEOUT=30000
export CODEX_TIMEOUT=30000

# Resource Limits
export MAX_CONCURRENT_WORKSPACES=10
export MAX_CONCURRENT_DEPLOYMENTS=5

# Monitoring
export HEALTH_CHECK_INTERVAL=30000
export METRICS_RETENTION=86400000

# WSL2 Configuration
export WSL2_ENABLED=true
export WSL2_MEMORY_LIMIT=4g
export WSL2_PROCESSORS=2
EOF
    
    # Add to bashrc
    echo "source ~/.agentapi_env" | sudo -u "${AGENTAPI_USER}" tee -a "${AGENTAPI_HOME}/.bashrc"
    
    log_success "Environment configuration created"
}

# Create systemd service
create_service() {
    log_info "Creating AgentAPI systemd service..."
    
    sudo tee /etc/systemd/system/agentapi.service > /dev/null << EOF
[Unit]
Description=AgentAPI Middleware Server
After=network.target
Wants=network.target

[Service]
Type=simple
User=${AGENTAPI_USER}
Group=${AGENTAPI_USER}
WorkingDirectory=${AGENTAPI_HOME}/agentapi
Environment=NODE_ENV=production
EnvironmentFile=${AGENTAPI_HOME}/.agentapi_env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=agentapi

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable agentapi
    
    log_success "AgentAPI systemd service created"
}

# Configure firewall
setup_firewall() {
    log_info "Configuring firewall..."
    
    # Install and configure UFW
    sudo apt-get install -y ufw
    
    # Default policies
    sudo ufw default deny incoming
    sudo ufw default allow outgoing
    
    # Allow SSH
    sudo ufw allow ssh
    
    # Allow AgentAPI port
    sudo ufw allow 3285/tcp
    
    # Allow HTTP/HTTPS for webhooks
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    
    # Enable firewall
    sudo ufw --force enable
    
    log_success "Firewall configured"
}

# Install monitoring tools
install_monitoring() {
    log_info "Installing monitoring tools..."
    
    # Install system monitoring tools
    sudo apt-get install -y \
        htop \
        iotop \
        nethogs \
        ncdu \
        dstat \
        sysstat
    
    # Install log rotation
    sudo apt-get install -y logrotate
    
    # Configure log rotation for AgentAPI
    sudo tee /etc/logrotate.d/agentapi > /dev/null << EOF
${AGENTAPI_HOME}/agentapi/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 ${AGENTAPI_USER} ${AGENTAPI_USER}
    postrotate
        systemctl reload agentapi || true
    endscript
}
EOF
    
    log_success "Monitoring tools installed"
}

# Create maintenance scripts
create_scripts() {
    log_info "Creating maintenance scripts..."
    
    # Cleanup script
    sudo -u "${AGENTAPI_USER}" tee "${AGENTAPI_HOME}/agentapi/scripts/cleanup.sh" > /dev/null << 'EOF'
#!/bin/bash
# AgentAPI Cleanup Script

WORKSPACE_ROOT="${WORKSPACE_ROOT:-/home/agentapi/agentapi/workspaces}"
MAX_AGE_DAYS="${MAX_AGE_DAYS:-7}"

echo "Cleaning up workspaces older than ${MAX_AGE_DAYS} days..."

# Remove old workspaces
find "${WORKSPACE_ROOT}" -type d -name "pr-*" -mtime +${MAX_AGE_DAYS} -exec rm -rf {} \; 2>/dev/null || true

# Clean up logs
find "${HOME}/agentapi/logs" -name "*.log" -mtime +30 -delete 2>/dev/null || true

# Clean up temporary files
find /tmp -name "agentapi-*" -mtime +1 -delete 2>/dev/null || true

echo "Cleanup completed"
EOF
    
    # Health check script
    sudo -u "${AGENTAPI_USER}" tee "${AGENTAPI_HOME}/agentapi/scripts/health-check.sh" > /dev/null << 'EOF'
#!/bin/bash
# AgentAPI Health Check Script

AGENTAPI_URL="${AGENTAPI_URL:-http://localhost:3285}"

echo "Checking AgentAPI health..."

# Check if service is running
if ! systemctl is-active --quiet agentapi; then
    echo "ERROR: AgentAPI service is not running"
    exit 1
fi

# Check HTTP endpoint
if ! curl -s "${AGENTAPI_URL}/health" > /dev/null; then
    echo "ERROR: AgentAPI health endpoint not responding"
    exit 1
fi

echo "AgentAPI is healthy"
EOF
    
    # Make scripts executable
    sudo chmod +x "${AGENTAPI_HOME}/agentapi/scripts/"*.sh
    
    # Create cron jobs
    sudo -u "${AGENTAPI_USER}" crontab -l 2>/dev/null | {
        cat
        echo "0 2 * * * ${AGENTAPI_HOME}/agentapi/scripts/cleanup.sh"
        echo "*/5 * * * * ${AGENTAPI_HOME}/agentapi/scripts/health-check.sh"
    } | sudo -u "${AGENTAPI_USER}" crontab -
    
    log_success "Maintenance scripts created"
}

# Main installation function
main() {
    log_info "Starting AgentAPI WSL2 setup..."
    
    check_wsl2
    update_system
    create_user
    install_nodejs
    install_python
    install_go
    install_docker
    install_agents
    setup_workspaces
    setup_environment
    create_service
    setup_firewall
    install_monitoring
    create_scripts
    
    log_success "AgentAPI WSL2 setup completed successfully!"
    log_info "Next steps:"
    log_info "1. Copy your AgentAPI server files to ${AGENTAPI_HOME}/agentapi/"
    log_info "2. Configure your API keys in ${AGENTAPI_HOME}/.agentapi_env"
    log_info "3. Start the service: sudo systemctl start agentapi"
    log_info "4. Check status: sudo systemctl status agentapi"
    log_info "5. View logs: journalctl -u agentapi -f"
}

# Run main function
main "$@"

