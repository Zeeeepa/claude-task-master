#!/bin/bash

# WSL2 Environment Setup Script
# Sets up a development environment for Claude Code validation

set -e

# Configuration
ENVIRONMENT_NAME=${1:-"claude-validation"}
ENVIRONMENT_TYPE=${2:-"nodejs"}
WORKSPACE_PATH=${3:-"/tmp/claude-environments/$ENVIRONMENT_NAME"}

echo "Setting up WSL2 environment: $ENVIRONMENT_NAME ($ENVIRONMENT_TYPE)"

# Create workspace directory
mkdir -p "$WORKSPACE_PATH"
cd "$WORKSPACE_PATH"

# Update system packages
echo "Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# Install common development tools
echo "Installing common development tools..."
sudo apt-get install -y \
    curl \
    wget \
    git \
    vim \
    nano \
    build-essential \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

# Setup environment based on type
case "$ENVIRONMENT_TYPE" in
    "nodejs")
        echo "Setting up Node.js environment..."
        
        # Install Node.js 18.x
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
        
        # Update npm to latest
        sudo npm install -g npm@latest
        
        # Install global packages
        sudo npm install -g \
            @anthropic-ai/claude-code \
            typescript \
            ts-node \
            eslint \
            prettier \
            jest
        
        # Verify installation
        node --version
        npm --version
        claude --version || echo "Claude Code installation may need manual setup"
        ;;
        
    "python")
        echo "Setting up Python environment..."
        
        # Install Python 3.10+
        sudo apt-get install -y \
            python3 \
            python3-pip \
            python3-venv \
            python3-dev \
            python3-setuptools
        
        # Create virtual environment
        python3 -m venv venv
        source venv/bin/activate
        
        # Upgrade pip
        pip install --upgrade pip
        
        # Install common packages
        pip install \
            pytest \
            flake8 \
            black \
            mypy \
            requests \
            numpy \
            pandas
        
        # Verify installation
        python3 --version
        pip --version
        ;;
        
    "docker")
        echo "Setting up Docker environment..."
        
        # Install Docker
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        sudo apt-get update
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        
        # Start Docker service
        sudo systemctl start docker
        sudo systemctl enable docker
        
        # Add user to docker group
        sudo usermod -aG docker $USER
        
        # Install Docker Compose
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
        
        # Verify installation
        docker --version
        docker-compose --version
        ;;
        
    "generic")
        echo "Setting up generic development environment..."
        
        # Install additional useful tools
        sudo apt-get install -y \
            htop \
            tree \
            jq \
            unzip \
            zip \
            rsync
        ;;
        
    *)
        echo "Unknown environment type: $ENVIRONMENT_TYPE"
        echo "Supported types: nodejs, python, docker, generic"
        exit 1
        ;;
esac

# Setup Git configuration (if not already configured)
if ! git config --global user.name > /dev/null 2>&1; then
    echo "Setting up Git configuration..."
    git config --global user.name "Claude Validation Bot"
    git config --global user.email "validation@claude-task-master.local"
    git config --global init.defaultBranch main
fi

# Create useful directories
mkdir -p "$WORKSPACE_PATH"/{projects,logs,tmp,scripts}

# Create environment info file
cat > "$WORKSPACE_PATH/environment-info.json" << EOF
{
    "name": "$ENVIRONMENT_NAME",
    "type": "$ENVIRONMENT_TYPE",
    "workspace": "$WORKSPACE_PATH",
    "created": "$(date -Iseconds)",
    "hostname": "$(hostname)",
    "user": "$(whoami)",
    "versions": {
        "os": "$(lsb_release -d | cut -f2)",
        "kernel": "$(uname -r)"
    }
}
EOF

# Add environment-specific version info
case "$ENVIRONMENT_TYPE" in
    "nodejs")
        echo "    \"node\": \"$(node --version)\"," >> "$WORKSPACE_PATH/environment-info.json.tmp"
        echo "    \"npm\": \"$(npm --version)\"" >> "$WORKSPACE_PATH/environment-info.json.tmp"
        ;;
    "python")
        echo "    \"python\": \"$(python3 --version | cut -d' ' -f2)\"," >> "$WORKSPACE_PATH/environment-info.json.tmp"
        echo "    \"pip\": \"$(pip --version | cut -d' ' -f2)\"" >> "$WORKSPACE_PATH/environment-info.json.tmp"
        ;;
    "docker")
        echo "    \"docker\": \"$(docker --version | cut -d' ' -f3 | tr -d ',')\"," >> "$WORKSPACE_PATH/environment-info.json.tmp"
        echo "    \"docker-compose\": \"$(docker-compose --version | cut -d' ' -f3 | tr -d ',')\"" >> "$WORKSPACE_PATH/environment-info.json.tmp"
        ;;
esac

# Merge version info if it exists
if [ -f "$WORKSPACE_PATH/environment-info.json.tmp" ]; then
    # Insert version info before the closing brace
    head -n -2 "$WORKSPACE_PATH/environment-info.json" > "$WORKSPACE_PATH/environment-info.json.new"
    echo "    }," >> "$WORKSPACE_PATH/environment-info.json.new"
    cat "$WORKSPACE_PATH/environment-info.json.tmp" >> "$WORKSPACE_PATH/environment-info.json.new"
    echo "  }" >> "$WORKSPACE_PATH/environment-info.json.new"
    echo "}" >> "$WORKSPACE_PATH/environment-info.json.new"
    mv "$WORKSPACE_PATH/environment-info.json.new" "$WORKSPACE_PATH/environment-info.json"
    rm "$WORKSPACE_PATH/environment-info.json.tmp"
fi

# Create activation script
cat > "$WORKSPACE_PATH/activate.sh" << EOF
#!/bin/bash
# Environment activation script for $ENVIRONMENT_NAME

export CLAUDE_ENVIRONMENT_NAME="$ENVIRONMENT_NAME"
export CLAUDE_ENVIRONMENT_TYPE="$ENVIRONMENT_TYPE"
export CLAUDE_WORKSPACE_PATH="$WORKSPACE_PATH"

# Add workspace bin to PATH
export PATH="$WORKSPACE_PATH/bin:\$PATH"

# Environment-specific activation
case "$ENVIRONMENT_TYPE" in
    "python")
        if [ -f "$WORKSPACE_PATH/venv/bin/activate" ]; then
            source "$WORKSPACE_PATH/venv/bin/activate"
            echo "Python virtual environment activated"
        fi
        ;;
    "nodejs")
        # Set npm cache to workspace
        export NPM_CONFIG_CACHE="$WORKSPACE_PATH/.npm"
        ;;
esac

echo "Claude validation environment '$ENVIRONMENT_NAME' activated"
echo "Workspace: $WORKSPACE_PATH"
echo "Type: $ENVIRONMENT_TYPE"
EOF

chmod +x "$WORKSPACE_PATH/activate.sh"

# Create cleanup script
cat > "$WORKSPACE_PATH/cleanup.sh" << EOF
#!/bin/bash
# Cleanup script for $ENVIRONMENT_NAME

echo "Cleaning up environment: $ENVIRONMENT_NAME"

# Stop any running processes
pkill -f "$WORKSPACE_PATH" || true

# Clean temporary files
rm -rf "$WORKSPACE_PATH/tmp/*"
rm -rf "$WORKSPACE_PATH/logs/*"

# Environment-specific cleanup
case "$ENVIRONMENT_TYPE" in
    "docker")
        # Stop and remove containers
        docker ps -q --filter "label=claude-environment=$ENVIRONMENT_NAME" | xargs -r docker stop
        docker ps -aq --filter "label=claude-environment=$ENVIRONMENT_NAME" | xargs -r docker rm
        
        # Remove images if needed
        # docker images -q --filter "label=claude-environment=$ENVIRONMENT_NAME" | xargs -r docker rmi
        ;;
    "python")
        # Deactivate virtual environment if active
        if [ -n "\$VIRTUAL_ENV" ]; then
            deactivate
        fi
        ;;
esac

echo "Environment cleanup completed"
EOF

chmod +x "$WORKSPACE_PATH/cleanup.sh"

# Create health check script
cat > "$WORKSPACE_PATH/health-check.sh" << EOF
#!/bin/bash
# Health check script for $ENVIRONMENT_NAME

echo "Performing health check for environment: $ENVIRONMENT_NAME"

# Check workspace directory
if [ ! -d "$WORKSPACE_PATH" ]; then
    echo "ERROR: Workspace directory not found: $WORKSPACE_PATH"
    exit 1
fi

# Check environment-specific health
case "$ENVIRONMENT_TYPE" in
    "nodejs")
        node --version > /dev/null 2>&1 || { echo "ERROR: Node.js not available"; exit 1; }
        npm --version > /dev/null 2>&1 || { echo "ERROR: npm not available"; exit 1; }
        echo "Node.js environment: OK"
        ;;
    "python")
        python3 --version > /dev/null 2>&1 || { echo "ERROR: Python not available"; exit 1; }
        pip --version > /dev/null 2>&1 || { echo "ERROR: pip not available"; exit 1; }
        echo "Python environment: OK"
        ;;
    "docker")
        docker --version > /dev/null 2>&1 || { echo "ERROR: Docker not available"; exit 1; }
        docker-compose --version > /dev/null 2>&1 || { echo "ERROR: Docker Compose not available"; exit 1; }
        echo "Docker environment: OK"
        ;;
esac

# Check disk space
DISK_USAGE=\$(df "$WORKSPACE_PATH" | tail -1 | awk '{print \$5}' | sed 's/%//')
if [ "\$DISK_USAGE" -gt 90 ]; then
    echo "WARNING: Disk usage is high: \${DISK_USAGE}%"
fi

# Check memory usage
MEMORY_USAGE=\$(free | grep Mem | awk '{printf "%.0f", \$3/\$2 * 100.0}')
if [ "\$MEMORY_USAGE" -gt 90 ]; then
    echo "WARNING: Memory usage is high: \${MEMORY_USAGE}%"
fi

echo "Health check completed successfully"
echo "Environment: $ENVIRONMENT_NAME ($ENVIRONMENT_TYPE)"
echo "Workspace: $WORKSPACE_PATH"
echo "Disk usage: \${DISK_USAGE}%"
echo "Memory usage: \${MEMORY_USAGE}%"
EOF

chmod +x "$WORKSPACE_PATH/health-check.sh"

echo ""
echo "Environment setup completed successfully!"
echo "Environment: $ENVIRONMENT_NAME"
echo "Type: $ENVIRONMENT_TYPE"
echo "Workspace: $WORKSPACE_PATH"
echo ""
echo "To activate the environment, run:"
echo "  source $WORKSPACE_PATH/activate.sh"
echo ""
echo "To perform a health check, run:"
echo "  $WORKSPACE_PATH/health-check.sh"
echo ""
echo "To cleanup the environment, run:"
echo "  $WORKSPACE_PATH/cleanup.sh"

