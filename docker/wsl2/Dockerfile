# WSL2 Environment Dockerfile for Claude Code Integration
# Ubuntu 22.04 LTS base with development tools and runtime environments

FROM ubuntu:22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=20
ENV PYTHON_VERSION=3.11
ENV DOCKER_VERSION=24.0.7

# Set working directory
WORKDIR /workspace

# Update package lists and install basic dependencies
RUN apt-get update && apt-get install -y \
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
    vim \
    nano \
    htop \
    tree \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js LTS
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest \
    && npm install -g yarn pnpm

# Install Python 3.11 and pip
RUN add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y \
        python${PYTHON_VERSION} \
        python${PYTHON_VERSION}-dev \
        python${PYTHON_VERSION}-venv \
        python3-pip \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python${PYTHON_VERSION} 1 \
    && python3 -m pip install --upgrade pip setuptools wheel

# Install Docker CLI
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli=${DOCKER_VERSION}* \
    && rm -rf /var/lib/apt/lists/*

# Install development tools and linters
RUN npm install -g \
    eslint \
    @typescript-eslint/parser \
    @typescript-eslint/eslint-plugin \
    prettier \
    typescript \
    ts-node \
    jest \
    mocha \
    nyc \
    nodemon \
    pm2

# Install Python development tools
RUN python3 -m pip install \
    pylint \
    black \
    flake8 \
    pytest \
    pytest-cov \
    mypy \
    bandit \
    safety \
    semgrep

# Install additional language support
RUN apt-get update && apt-get install -y \
    openjdk-17-jdk \
    maven \
    gradle \
    golang-go \
    rustc \
    cargo \
    php \
    composer \
    ruby \
    ruby-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Go tools
RUN go install golang.org/x/tools/cmd/goimports@latest \
    && go install golang.org/x/lint/golint@latest \
    && go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# Install Rust tools
RUN cargo install cargo-audit cargo-outdated

# Install security scanning tools
RUN python3 -m pip install \
    semgrep \
    safety \
    bandit

# Install performance monitoring tools
RUN npm install -g \
    clinic \
    autocannon \
    0x

# Create directories for Claude Code integration
RUN mkdir -p /workspace/deployments \
    && mkdir -p /workspace/validation \
    && mkdir -p /workspace/tests \
    && mkdir -p /workspace/reports \
    && mkdir -p /workspace/backups \
    && mkdir -p /workspace/logs

# Set up Git configuration
RUN git config --global user.name "Claude Code WSL2" \
    && git config --global user.email "claude-code@wsl2.local" \
    && git config --global init.defaultBranch main \
    && git config --global pull.rebase false

# Create non-root user for security
RUN useradd -m -s /bin/bash claude \
    && usermod -aG sudo claude \
    && echo "claude ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Set up environment for claude user
USER claude
WORKDIR /home/claude

# Install user-specific tools
RUN npm config set prefix ~/.npm-global \
    && echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc \
    && echo 'export GOPATH=$HOME/go' >> ~/.bashrc \
    && echo 'export PATH=$GOPATH/bin:$PATH' >> ~/.bashrc

# Create workspace structure for claude user
RUN mkdir -p ~/workspace/deployments \
    && mkdir -p ~/workspace/validation \
    && mkdir -p ~/workspace/tests \
    && mkdir -p ~/workspace/reports \
    && mkdir -p ~/workspace/backups \
    && mkdir -p ~/workspace/logs \
    && mkdir -p ~/.cache/claude-code

# Install Claude Code specific dependencies
RUN python3 -m pip install --user \
    requests \
    aiohttp \
    asyncio \
    psutil \
    docker

# Set up environment variables for Claude Code
ENV CLAUDE_CODE_WORKSPACE=/home/claude/workspace
ENV CLAUDE_CODE_CACHE=/home/claude/.cache/claude-code
ENV CLAUDE_CODE_LOGS=/home/claude/workspace/logs
ENV NODE_ENV=development
ENV PYTHONPATH=/home/claude/workspace:$PYTHONPATH

# Create startup script
RUN echo '#!/bin/bash' > ~/startup.sh \
    && echo 'echo "Claude Code WSL2 Environment Ready"' >> ~/startup.sh \
    && echo 'echo "Node.js: $(node --version)"' >> ~/startup.sh \
    && echo 'echo "Python: $(python3 --version)"' >> ~/startup.sh \
    && echo 'echo "Docker: $(docker --version)"' >> ~/startup.sh \
    && echo 'echo "Git: $(git --version)"' >> ~/startup.sh \
    && echo 'echo "Workspace: $CLAUDE_CODE_WORKSPACE"' >> ~/startup.sh \
    && echo 'cd $CLAUDE_CODE_WORKSPACE' >> ~/startup.sh \
    && echo 'exec "$@"' >> ~/startup.sh \
    && chmod +x ~/startup.sh

# Health check script
RUN echo '#!/bin/bash' > ~/healthcheck.sh \
    && echo 'set -e' >> ~/healthcheck.sh \
    && echo 'node --version > /dev/null' >> ~/healthcheck.sh \
    && echo 'python3 --version > /dev/null' >> ~/healthcheck.sh \
    && echo 'git --version > /dev/null' >> ~/healthcheck.sh \
    && echo 'docker --version > /dev/null' >> ~/healthcheck.sh \
    && echo 'echo "Health check passed"' >> ~/healthcheck.sh \
    && chmod +x ~/healthcheck.sh

# Set up resource monitoring
RUN echo '#!/bin/bash' > ~/monitor.sh \
    && echo 'while true; do' >> ~/monitor.sh \
    && echo '  echo "$(date): CPU: $(top -bn1 | grep "Cpu(s)" | awk "{print \$2}" | cut -d"%" -f1)%, Memory: $(free | grep Mem | awk "{printf \"%.1f\", \$3/\$2 * 100.0}")%"' >> ~/monitor.sh \
    && echo '  sleep 30' >> ~/monitor.sh \
    && echo 'done' >> ~/monitor.sh \
    && chmod +x ~/monitor.sh

# Expose common development ports
EXPOSE 3000 3001 8000 8080 9000 5000 5432 27017

# Set default command
ENTRYPOINT ["./startup.sh"]
CMD ["bash"]

# Add labels for identification
LABEL maintainer="Claude Code Integration Team"
LABEL version="1.0.0"
LABEL description="WSL2 environment for Claude Code integration with comprehensive development tools"
LABEL org.opencontainers.image.title="Claude Code WSL2 Environment"
LABEL org.opencontainers.image.description="Ubuntu 22.04 based development environment for Claude Code integration"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="Claude Code"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD ./healthcheck.sh

