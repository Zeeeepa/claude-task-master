#!/bin/bash

# WSL2 Setup Script for Claude Code Integration
# This script sets up the WSL2 environment for automated code validation and testing

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WSL2_DISTRO_NAME="claude-code-wsl2"
WSL2_IMAGE_NAME="claude-code/wsl2-env"
WSL2_CONTAINER_NAME="claude-code-wsl2-container"
DOCKER_NETWORK_NAME="claude-code-wsl2-network"
DOCKER_NETWORK_SUBNET="172.20.0.0/16"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if running on Windows with WSL2
check_wsl2_support() {
    log_info "Checking WSL2 support..."
    
    if ! command -v wsl &> /dev/null; then
        log_error "WSL is not available. Please install WSL2 on Windows."
        exit 1
    fi
    
    # Check WSL version
    WSL_VERSION=$(wsl --status | grep "Default Version" | awk '{print $3}' || echo "1")
    if [ "$WSL_VERSION" != "2" ]; then
        log_warning "WSL default version is not 2. Setting WSL2 as default..."
        wsl --set-default-version 2
    fi
    
    log_success "WSL2 support confirmed"
}

# Check Docker availability
check_docker() {
    log_info "Checking Docker availability..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not available. Please install Docker Desktop with WSL2 backend."
        exit 1
    fi
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker is not running. Please start Docker Desktop."
        exit 1
    fi
    
    log_success "Docker is available and running"
}

# Build WSL2 Docker image
build_wsl2_image() {
    log_info "Building WSL2 Docker image..."
    
    DOCKERFILE_PATH="$PROJECT_ROOT/docker/wsl2/Dockerfile"
    
    if [ ! -f "$DOCKERFILE_PATH" ]; then
        log_error "Dockerfile not found at $DOCKERFILE_PATH"
        exit 1
    fi
    
    # Build the image
    docker build -t "$WSL2_IMAGE_NAME:latest" -f "$DOCKERFILE_PATH" "$PROJECT_ROOT/docker/wsl2/"
    
    if [ $? -eq 0 ]; then
        log_success "WSL2 Docker image built successfully"
    else
        log_error "Failed to build WSL2 Docker image"
        exit 1
    fi
}

# Create Docker network
create_docker_network() {
    log_info "Creating Docker network for WSL2 environment..."
    
    # Check if network already exists
    if docker network ls | grep -q "$DOCKER_NETWORK_NAME"; then
        log_warning "Network $DOCKER_NETWORK_NAME already exists"
        return 0
    fi
    
    # Create the network
    docker network create \
        --driver bridge \
        --subnet="$DOCKER_NETWORK_SUBNET" \
        --opt com.docker.network.bridge.name="$DOCKER_NETWORK_NAME" \
        "$DOCKER_NETWORK_NAME"
    
    if [ $? -eq 0 ]; then
        log_success "Docker network created successfully"
    else
        log_error "Failed to create Docker network"
        exit 1
    fi
}

# Setup WSL2 distribution
setup_wsl2_distribution() {
    log_info "Setting up WSL2 distribution..."
    
    # Check if distribution already exists
    if wsl -l -v | grep -q "$WSL2_DISTRO_NAME"; then
        log_warning "WSL2 distribution $WSL2_DISTRO_NAME already exists"
        
        # Ask user if they want to recreate it
        read -p "Do you want to recreate the distribution? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "Unregistering existing distribution..."
            wsl --unregister "$WSL2_DISTRO_NAME"
        else
            log_info "Using existing distribution"
            return 0
        fi
    fi
    
    # Create a temporary container to export
    log_info "Creating temporary container for export..."
    docker run -d --name "$WSL2_CONTAINER_NAME-temp" "$WSL2_IMAGE_NAME:latest" tail -f /dev/null
    
    # Export container to tar file
    TEMP_TAR="/tmp/${WSL2_DISTRO_NAME}.tar"
    log_info "Exporting container to $TEMP_TAR..."
    docker export "$WSL2_CONTAINER_NAME-temp" -o "$TEMP_TAR"
    
    # Remove temporary container
    docker rm -f "$WSL2_CONTAINER_NAME-temp"
    
    # Import as WSL2 distribution
    WSL2_INSTALL_PATH="$HOME\\wsl\\$WSL2_DISTRO_NAME"
    log_info "Importing WSL2 distribution to $WSL2_INSTALL_PATH..."
    wsl --import "$WSL2_DISTRO_NAME" "$WSL2_INSTALL_PATH" "$TEMP_TAR" --version 2
    
    # Clean up tar file
    rm -f "$TEMP_TAR"
    
    if [ $? -eq 0 ]; then
        log_success "WSL2 distribution setup successfully"
    else
        log_error "Failed to setup WSL2 distribution"
        exit 1
    fi
}

# Configure WSL2 environment
configure_wsl2_environment() {
    log_info "Configuring WSL2 environment..."
    
    # Set default user
    wsl -d "$WSL2_DISTRO_NAME" -u root -- usermod -aG sudo claude
    wsl -d "$WSL2_DISTRO_NAME" -- echo "claude" > /etc/wsl.conf
    
    # Configure WSL2 settings
    WSL_CONFIG_PATH="$HOME/.wslconfig"
    
    cat > "$WSL_CONFIG_PATH" << EOF
[wsl2]
memory=8GB
processors=4
swap=2GB
localhostForwarding=true

[$WSL2_DISTRO_NAME]
memory=8GB
processors=4
EOF
    
    log_success "WSL2 environment configured"
}

# Install Claude Code dependencies
install_claude_code_dependencies() {
    log_info "Installing Claude Code dependencies in WSL2..."
    
    # Copy project files to WSL2
    WSL2_WORKSPACE="/home/claude/workspace/claude-task-master"
    wsl -d "$WSL2_DISTRO_NAME" -u claude -- mkdir -p "$WSL2_WORKSPACE"
    
    # Install Node.js dependencies
    if [ -f "$PROJECT_ROOT/package.json" ]; then
        log_info "Installing Node.js dependencies..."
        wsl -d "$WSL2_DISTRO_NAME" -u claude -- bash -c "cd $WSL2_WORKSPACE && npm install"
    fi
    
    # Install Python dependencies
    if [ -f "$PROJECT_ROOT/requirements.txt" ]; then
        log_info "Installing Python dependencies..."
        wsl -d "$WSL2_DISTRO_NAME" -u claude -- bash -c "cd $WSL2_WORKSPACE && pip3 install -r requirements.txt"
    fi
    
    log_success "Claude Code dependencies installed"
}

# Setup monitoring and logging
setup_monitoring() {
    log_info "Setting up monitoring and logging..."
    
    # Create log directories
    wsl -d "$WSL2_DISTRO_NAME" -u claude -- mkdir -p /home/claude/workspace/logs
    wsl -d "$WSL2_DISTRO_NAME" -u claude -- mkdir -p /home/claude/workspace/reports
    wsl -d "$WSL2_DISTRO_NAME" -u claude -- mkdir -p /home/claude/workspace/backups
    
    # Setup log rotation
    LOG_ROTATE_CONFIG="/tmp/claude-code-logrotate"
    cat > "$LOG_ROTATE_CONFIG" << EOF
/home/claude/workspace/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    copytruncate
}
EOF
    
    wsl -d "$WSL2_DISTRO_NAME" -u root -- cp "$LOG_ROTATE_CONFIG" /etc/logrotate.d/claude-code
    rm -f "$LOG_ROTATE_CONFIG"
    
    log_success "Monitoring and logging setup complete"
}

# Test WSL2 environment
test_wsl2_environment() {
    log_info "Testing WSL2 environment..."
    
    # Test basic commands
    log_info "Testing Node.js..."
    NODE_VERSION=$(wsl -d "$WSL2_DISTRO_NAME" -u claude -- node --version)
    log_success "Node.js version: $NODE_VERSION"
    
    log_info "Testing Python..."
    PYTHON_VERSION=$(wsl -d "$WSL2_DISTRO_NAME" -u claude -- python3 --version)
    log_success "Python version: $PYTHON_VERSION"
    
    log_info "Testing Git..."
    GIT_VERSION=$(wsl -d "$WSL2_DISTRO_NAME" -u claude -- git --version)
    log_success "Git version: $GIT_VERSION"
    
    log_info "Testing Docker CLI..."
    DOCKER_VERSION=$(wsl -d "$WSL2_DISTRO_NAME" -u claude -- docker --version)
    log_success "Docker CLI version: $DOCKER_VERSION"
    
    # Test development tools
    log_info "Testing ESLint..."
    wsl -d "$WSL2_DISTRO_NAME" -u claude -- eslint --version > /dev/null
    log_success "ESLint is available"
    
    log_info "Testing Pytest..."
    wsl -d "$WSL2_DISTRO_NAME" -u claude -- python3 -m pytest --version > /dev/null
    log_success "Pytest is available"
    
    log_success "WSL2 environment test completed successfully"
}

# Create management scripts
create_management_scripts() {
    log_info "Creating management scripts..."
    
    # Create start script
    cat > "$PROJECT_ROOT/scripts/start-wsl2.sh" << EOF
#!/bin/bash
# Start Claude Code WSL2 environment

echo "Starting Claude Code WSL2 environment..."
wsl -d "$WSL2_DISTRO_NAME" -u claude
EOF
    chmod +x "$PROJECT_ROOT/scripts/start-wsl2.sh"
    
    # Create stop script
    cat > "$PROJECT_ROOT/scripts/stop-wsl2.sh" << EOF
#!/bin/bash
# Stop Claude Code WSL2 environment

echo "Stopping Claude Code WSL2 environment..."
wsl --terminate "$WSL2_DISTRO_NAME"
EOF
    chmod +x "$PROJECT_ROOT/scripts/stop-wsl2.sh"
    
    # Create status script
    cat > "$PROJECT_ROOT/scripts/status-wsl2.sh" << EOF
#!/bin/bash
# Check Claude Code WSL2 environment status

echo "Claude Code WSL2 Environment Status:"
echo "======================================"
wsl -l -v | grep "$WSL2_DISTRO_NAME" || echo "Distribution not found"
echo ""
echo "Docker Network Status:"
docker network ls | grep "$DOCKER_NETWORK_NAME" || echo "Network not found"
echo ""
echo "Docker Image Status:"
docker images | grep "$WSL2_IMAGE_NAME" || echo "Image not found"
EOF
    chmod +x "$PROJECT_ROOT/scripts/status-wsl2.sh"
    
    # Create cleanup script
    cat > "$PROJECT_ROOT/scripts/cleanup-wsl2.sh" << EOF
#!/bin/bash
# Cleanup Claude Code WSL2 environment

echo "Cleaning up Claude Code WSL2 environment..."

# Stop WSL2 distribution
wsl --terminate "$WSL2_DISTRO_NAME" 2>/dev/null || true

# Unregister WSL2 distribution
read -p "Remove WSL2 distribution? (y/N): " -n 1 -r
echo
if [[ \$REPLY =~ ^[Yy]\$ ]]; then
    wsl --unregister "$WSL2_DISTRO_NAME"
    echo "WSL2 distribution removed"
fi

# Remove Docker network
read -p "Remove Docker network? (y/N): " -n 1 -r
echo
if [[ \$REPLY =~ ^[Yy]\$ ]]; then
    docker network rm "$DOCKER_NETWORK_NAME" 2>/dev/null || true
    echo "Docker network removed"
fi

# Remove Docker image
read -p "Remove Docker image? (y/N): " -n 1 -r
echo
if [[ \$REPLY =~ ^[Yy]\$ ]]; then
    docker rmi "$WSL2_IMAGE_NAME:latest" 2>/dev/null || true
    echo "Docker image removed"
fi

echo "Cleanup completed"
EOF
    chmod +x "$PROJECT_ROOT/scripts/cleanup-wsl2.sh"
    
    log_success "Management scripts created"
}

# Print usage information
print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --build-only     Only build the Docker image"
    echo "  --test-only      Only test the existing environment"
    echo "  --cleanup        Cleanup the WSL2 environment"
    echo "  --help           Show this help message"
    echo ""
    echo "This script sets up a complete WSL2 environment for Claude Code integration."
}

# Main execution
main() {
    log_info "Starting WSL2 setup for Claude Code integration..."
    
    # Parse command line arguments
    case "${1:-}" in
        --build-only)
            check_docker
            build_wsl2_image
            log_success "Docker image build completed"
            exit 0
            ;;
        --test-only)
            test_wsl2_environment
            exit 0
            ;;
        --cleanup)
            bash "$PROJECT_ROOT/scripts/cleanup-wsl2.sh"
            exit 0
            ;;
        --help)
            print_usage
            exit 0
            ;;
        "")
            # Continue with full setup
            ;;
        *)
            log_error "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
    
    # Full setup process
    check_wsl2_support
    check_docker
    build_wsl2_image
    create_docker_network
    setup_wsl2_distribution
    configure_wsl2_environment
    install_claude_code_dependencies
    setup_monitoring
    create_management_scripts
    test_wsl2_environment
    
    log_success "WSL2 setup completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Start the environment: ./scripts/start-wsl2.sh"
    echo "2. Check status: ./scripts/status-wsl2.sh"
    echo "3. Stop the environment: ./scripts/stop-wsl2.sh"
    echo "4. Cleanup (if needed): ./scripts/cleanup-wsl2.sh"
    echo ""
    echo "The WSL2 environment is now ready for Claude Code integration."
}

# Run main function
main "$@"

