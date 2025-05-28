#!/bin/bash

# WSL2 Setup Script for Claude Task Master AgentAPI Middleware
# 
# This script automates the setup and configuration of WSL2 instances
# for isolated code execution and deployment validation.
#
# Features:
# - WSL2 installation and configuration
# - Base distribution setup
# - Development environment configuration
# - Security hardening
# - Performance optimization
# - Monitoring setup

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/tmp/wsl2_setup_$(date +%Y%m%d_%H%M%S).log"
BASE_DISTRIBUTION="Ubuntu-22.04"
WORKSPACE_DIR="/workspace"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}" | tee -a "$LOG_FILE"
}

# Check if running on Windows
check_windows() {
    if [[ "$OSTYPE" != "msys" && "$OSTYPE" != "cygwin" && ! -f "/proc/version" ]]; then
        error "This script must be run on Windows with WSL2 support"
        exit 1
    fi
    
    if [[ -f "/proc/version" ]] && grep -q "Microsoft" /proc/version; then
        info "Running inside WSL2 environment"
        export WSL_ENVIRONMENT=true
    else
        info "Running on Windows host"
        export WSL_ENVIRONMENT=false
    fi
}

# Check WSL2 availability
check_wsl2() {
    log "Checking WSL2 availability..."
    
    if ! command -v wsl &> /dev/null; then
        error "WSL is not installed or not available in PATH"
        exit 1
    fi
    
    # Check WSL version
    local wsl_version
    wsl_version=$(wsl --status 2>/dev/null | grep -i "default version" | grep -o "[0-9]" || echo "1")
    
    if [[ "$wsl_version" != "2" ]]; then
        warn "WSL2 is not set as default version"
        log "Setting WSL2 as default version..."
        wsl --set-default-version 2
    fi
    
    log "WSL2 is available and configured"
}

# Install base distribution
install_base_distribution() {
    log "Installing base distribution: $BASE_DISTRIBUTION"
    
    # Check if distribution is already installed
    if wsl --list --verbose | grep -q "$BASE_DISTRIBUTION"; then
        info "Base distribution $BASE_DISTRIBUTION is already installed"
        return 0
    fi
    
    # Install from Microsoft Store or download
    log "Installing $BASE_DISTRIBUTION from Microsoft Store..."
    
    # This would typically use winget or direct download
    # For now, we'll assume the user has installed it manually
    warn "Please install $BASE_DISTRIBUTION from Microsoft Store manually if not already installed"
    
    # Wait for installation
    local max_wait=300 # 5 minutes
    local wait_time=0
    
    while ! wsl --list --verbose | grep -q "$BASE_DISTRIBUTION"; do
        if [[ $wait_time -ge $max_wait ]]; then
            error "Timeout waiting for $BASE_DISTRIBUTION installation"
            exit 1
        fi
        
        info "Waiting for $BASE_DISTRIBUTION installation... ($wait_time/$max_wait seconds)"
        sleep 10
        wait_time=$((wait_time + 10))
    done
    
    log "Base distribution $BASE_DISTRIBUTION installed successfully"
}

# Configure base distribution
configure_base_distribution() {
    log "Configuring base distribution..."
    
    # Update package lists
    wsl -d "$BASE_DISTRIBUTION" -- sudo apt-get update
    
    # Upgrade system packages
    wsl -d "$BASE_DISTRIBUTION" -- sudo apt-get upgrade -y
    
    # Install essential packages
    local packages=(
        "curl"
        "wget"
        "git"
        "build-essential"
        "python3"
        "python3-pip"
        "python3-venv"
        "nodejs"
        "npm"
        "docker.io"
        "docker-compose"
        "htop"
        "vim"
        "tmux"
        "jq"
        "unzip"
        "zip"
        "tree"
        "net-tools"
        "ufw"
        "fail2ban"
        "rsync"
        "openssh-server"
    )
    
    log "Installing essential packages: ${packages[*]}"
    wsl -d "$BASE_DISTRIBUTION" -- sudo apt-get install -y "${packages[@]}"
    
    # Install additional development tools
    install_development_tools
    
    # Configure services
    configure_services
    
    log "Base distribution configured successfully"
}

# Install development tools
install_development_tools() {
    log "Installing development tools..."
    
    # Install Node.js LTS via NodeSource
    wsl -d "$BASE_DISTRIBUTION" -- bash -c "
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    "
    
    # Install Yarn
    wsl -d "$BASE_DISTRIBUTION" -- bash -c "
        curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
        echo 'deb https://dl.yarnpkg.com/debian/ stable main' | sudo tee /etc/apt/sources.list.d/yarn.list
        sudo apt-get update
        sudo apt-get install -y yarn
    "
    
    # Install Python tools
    wsl -d "$BASE_DISTRIBUTION" -- bash -c "
        python3 -m pip install --upgrade pip
        pip3 install virtualenv pipenv poetry pytest black flake8 mypy
    "
    
    # Install Rust
    wsl -d "$BASE_DISTRIBUTION" -- bash -c "
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source ~/.cargo/env
        rustup component add clippy rustfmt
    "
    
    # Install Go
    wsl -d "$BASE_DISTRIBUTION" -- bash -c "
        wget -q https://go.dev/dl/go1.21.0.linux-amd64.tar.gz
        sudo tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz
        echo 'export PATH=\$PATH:/usr/local/go/bin' >> ~/.bashrc
        rm go1.21.0.linux-amd64.tar.gz
    "
    
    # Install Docker Compose
    wsl -d "$BASE_DISTRIBUTION" -- bash -c "
        sudo curl -L 'https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m)' -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
    "
    
    log "Development tools installed successfully"
}

# Configure services
configure_services() {
    log "Configuring services..."
    
    # Configure Docker
    wsl -d "$BASE_DISTRIBUTION" -- bash -c "
        sudo usermod -aG docker \$USER
        sudo systemctl enable docker
        sudo systemctl start docker
    "
    
    # Configure SSH
    wsl -d "$BASE_DISTRIBUTION" -- bash -c "
        sudo systemctl enable ssh
        sudo systemctl start ssh
        
        # Configure SSH security
        sudo sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
        sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
        sudo sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config
        
        sudo systemctl restart ssh
    "
    
    # Configure firewall
    configure_firewall
    
    log "Services configured successfully"
}

# Configure firewall
configure_firewall() {
    log "Configuring firewall..."
    
    wsl -d "$BASE_DISTRIBUTION" -- bash -c "
        # Enable UFW
        sudo ufw --force enable
        
        # Default policies
        sudo ufw default deny incoming
        sudo ufw default allow outgoing
        
        # Allow SSH
        sudo ufw allow ssh
        
        # Allow common development ports
        sudo ufw allow 3000
        sudo ufw allow 8000
        sudo ufw allow 8080
        sudo ufw allow 9000
        
        # Allow Docker
        sudo ufw allow 2375
        sudo ufw allow 2376
        
        # Configure fail2ban
        sudo systemctl enable fail2ban
        sudo systemctl start fail2ban
    "
    
    log "Firewall configured successfully"
}

# Setup workspace
setup_workspace() {
    log "Setting up workspace directory..."
    
    wsl -d "$BASE_DISTRIBUTION" -- bash -c "
        # Create workspace directory
        sudo mkdir -p $WORKSPACE_DIR
        sudo chown \$USER:\$USER $WORKSPACE_DIR
        sudo chmod 755 $WORKSPACE_DIR
        
        # Create subdirectories
        mkdir -p $WORKSPACE_DIR/{repos,builds,logs,temp}
        
        # Setup Git configuration template
        cat > $WORKSPACE_DIR/.gitconfig-template << 'EOF'
[user]
    name = Claude Code CI
    email = claude-code@ci.local
[core]
    editor = vim
    autocrlf = input
[push]
    default = simple
[pull]
    rebase = false
EOF
        
        # Create workspace initialization script
        cat > $WORKSPACE_DIR/init.sh << 'EOF'
#!/bin/bash
# Workspace initialization script

set -euo pipefail

echo \"Initializing workspace...\"

# Copy Git configuration
cp $WORKSPACE_DIR/.gitconfig-template ~/.gitconfig

# Setup environment variables
export WORKSPACE_DIR=\"$WORKSPACE_DIR\"
export PATH=\"\$PATH:/usr/local/go/bin:\$HOME/.cargo/bin\"

# Create project-specific directories
mkdir -p \$WORKSPACE_DIR/current-project/{src,tests,docs,scripts}

echo \"Workspace initialized successfully\"
EOF
        
        chmod +x $WORKSPACE_DIR/init.sh
    "
    
    log "Workspace setup completed"
}

# Configure resource limits
configure_resource_limits() {
    log "Configuring resource limits..."
    
    # Create .wslconfig file
    local wslconfig_path="$HOME/.wslconfig"
    
    cat > "$wslconfig_path" << EOF
[wsl2]
# Limit memory to 8GB
memory=8GB

# Limit CPU cores to 4
processors=4

# Disable swap
swap=0

# Enable localhost forwarding
localhostForwarding=true

# Set custom kernel parameters
kernelCommandLine=cgroup_enable=memory swapaccount=1

[experimental]
# Enable sparse VHD
sparseVhd=true

# Enable memory reclaim
autoMemoryReclaim=gradual
EOF
    
    log "Resource limits configured in $wslconfig_path"
    warn "WSL2 restart required for resource limits to take effect"
}

# Setup monitoring
setup_monitoring() {
    log "Setting up monitoring..."
    
    wsl -d "$BASE_DISTRIBUTION" -- bash -c "
        # Install monitoring tools
        sudo apt-get install -y htop iotop nethogs sysstat
        
        # Create monitoring script
        cat > $WORKSPACE_DIR/monitor.sh << 'EOF'
#!/bin/bash
# System monitoring script

echo \"=== System Resources ===\"
echo \"Memory Usage:\"
free -h

echo -e \"\nDisk Usage:\"
df -h

echo -e \"\nCPU Usage:\"
top -bn1 | grep \"Cpu(s)\"

echo -e \"\nNetwork Connections:\"
ss -tuln

echo -e \"\nDocker Status:\"
docker ps --format \"table {{.Names}}\t{{.Status}}\t{{.Ports}}\"

echo -e \"\nProcess Tree:\"
pstree -p | head -20
EOF
        
        chmod +x $WORKSPACE_DIR/monitor.sh
        
        # Setup log rotation
        sudo tee /etc/logrotate.d/workspace << 'EOF'
$WORKSPACE_DIR/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    copytruncate
}
EOF
    "
    
    log "Monitoring setup completed"
}

# Create instance template
create_instance_template() {
    log "Creating instance template..."
    
    # Export configured distribution as template
    local template_path="/tmp/claude-task-master-template.tar"
    
    log "Exporting configured distribution as template..."
    wsl --export "$BASE_DISTRIBUTION" "$template_path"
    
    # Compress template
    gzip "$template_path"
    
    log "Instance template created: ${template_path}.gz"
    info "Template can be used to quickly create new instances"
}

# Validate installation
validate_installation() {
    log "Validating installation..."
    
    local validation_errors=0
    
    # Check WSL2 status
    if ! wsl --list --verbose | grep -q "$BASE_DISTRIBUTION.*Running"; then
        error "Base distribution is not running"
        ((validation_errors++))
    fi
    
    # Check essential commands
    local commands=("git" "node" "npm" "python3" "docker" "curl" "wget")
    
    for cmd in "${commands[@]}"; do
        if ! wsl -d "$BASE_DISTRIBUTION" -- command -v "$cmd" &> /dev/null; then
            error "Command not found: $cmd"
            ((validation_errors++))
        fi
    done
    
    # Check services
    local services=("docker" "ssh")
    
    for service in "${services[@]}"; do
        if ! wsl -d "$BASE_DISTRIBUTION" -- sudo systemctl is-active --quiet "$service"; then
            warn "Service not active: $service"
        fi
    done
    
    # Check workspace
    if ! wsl -d "$BASE_DISTRIBUTION" -- test -d "$WORKSPACE_DIR"; then
        error "Workspace directory not found: $WORKSPACE_DIR"
        ((validation_errors++))
    fi
    
    if [[ $validation_errors -eq 0 ]]; then
        log "Validation completed successfully"
        return 0
    else
        error "Validation failed with $validation_errors errors"
        return 1
    fi
}

# Print usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

WSL2 Setup Script for Claude Task Master AgentAPI Middleware

OPTIONS:
    -h, --help              Show this help message
    -d, --distribution      Base distribution name (default: $BASE_DISTRIBUTION)
    -w, --workspace         Workspace directory (default: $WORKSPACE_DIR)
    -v, --verbose           Enable verbose output
    --skip-validation       Skip installation validation
    --template-only         Only create instance template
    --cleanup               Cleanup existing installation

EXAMPLES:
    $0                      # Full installation with defaults
    $0 -d Ubuntu-20.04      # Use Ubuntu 20.04 as base
    $0 --template-only      # Only create template
    $0 --cleanup            # Cleanup existing installation

EOF
}

# Cleanup existing installation
cleanup_installation() {
    log "Cleaning up existing installation..."
    
    # Stop and unregister distribution
    wsl --terminate "$BASE_DISTRIBUTION" 2>/dev/null || true
    wsl --unregister "$BASE_DISTRIBUTION" 2>/dev/null || true
    
    # Remove configuration files
    rm -f "$HOME/.wslconfig"
    
    # Remove templates
    rm -f /tmp/claude-task-master-template.tar*
    
    log "Cleanup completed"
}

# Main function
main() {
    local skip_validation=false
    local template_only=false
    local cleanup=false
    local verbose=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -d|--distribution)
                BASE_DISTRIBUTION="$2"
                shift 2
                ;;
            -w|--workspace)
                WORKSPACE_DIR="$2"
                shift 2
                ;;
            -v|--verbose)
                verbose=true
                shift
                ;;
            --skip-validation)
                skip_validation=true
                shift
                ;;
            --template-only)
                template_only=true
                shift
                ;;
            --cleanup)
                cleanup=true
                shift
                ;;
            *)
                error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    # Enable verbose output if requested
    if [[ "$verbose" == true ]]; then
        set -x
    fi
    
    log "Starting WSL2 setup for Claude Task Master AgentAPI Middleware"
    log "Log file: $LOG_FILE"
    
    # Cleanup if requested
    if [[ "$cleanup" == true ]]; then
        cleanup_installation
        exit 0
    fi
    
    # Check prerequisites
    check_windows
    check_wsl2
    
    # Template-only mode
    if [[ "$template_only" == true ]]; then
        if wsl --list --verbose | grep -q "$BASE_DISTRIBUTION"; then
            create_instance_template
        else
            error "Base distribution $BASE_DISTRIBUTION not found"
            exit 1
        fi
        exit 0
    fi
    
    # Full installation
    install_base_distribution
    configure_base_distribution
    setup_workspace
    configure_resource_limits
    setup_monitoring
    create_instance_template
    
    # Validation
    if [[ "$skip_validation" != true ]]; then
        if ! validate_installation; then
            error "Installation validation failed"
            exit 1
        fi
    fi
    
    log "WSL2 setup completed successfully!"
    info "Instance template available for quick deployment"
    info "Restart WSL2 to apply resource limits: wsl --shutdown"
    
    # Print summary
    cat << EOF

=== Setup Summary ===
Base Distribution: $BASE_DISTRIBUTION
Workspace Directory: $WORKSPACE_DIR
Log File: $LOG_FILE
Template: /tmp/claude-task-master-template.tar.gz

Next Steps:
1. Restart WSL2: wsl --shutdown
2. Test the installation: wsl -d $BASE_DISTRIBUTION
3. Initialize workspace: $WORKSPACE_DIR/init.sh

EOF
}

# Run main function with all arguments
main "$@"

