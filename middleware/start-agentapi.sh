#!/bin/bash

# AgentAPI Middleware Startup Script
# 
# This script starts the AgentAPI middleware server with proper configuration
# and environment setup.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
AGENTAPI_DIR="${SCRIPT_DIR}"
ENV_FILE="${AGENTAPI_DIR}/.env"
PID_FILE="${AGENTAPI_DIR}/agentapi.pid"
LOG_FILE="${AGENTAPI_DIR}/agentapi.log"

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

# Check if AgentAPI is already running
check_running() {
    if [[ -f "${PID_FILE}" ]]; then
        local pid=$(cat "${PID_FILE}")
        if ps -p "${pid}" > /dev/null 2>&1; then
            return 0  # Running
        else
            rm -f "${PID_FILE}"
            return 1  # Not running
        fi
    fi
    return 1  # Not running
}

# Start AgentAPI server
start_server() {
    log_info "Starting AgentAPI middleware server..."
    
    # Check if already running
    if check_running; then
        log_warning "AgentAPI is already running (PID: $(cat "${PID_FILE}"))"
        return 0
    fi
    
    # Check environment file
    if [[ ! -f "${ENV_FILE}" ]]; then
        log_warning "Environment file not found: ${ENV_FILE}"
        log_info "Creating from example..."
        cp "${AGENTAPI_DIR}/.env.example" "${ENV_FILE}"
        log_warning "Please edit ${ENV_FILE} with your configuration before starting"
        return 1
    fi
    
    # Load environment variables
    source "${ENV_FILE}"
    
    # Validate required variables
    if [[ -z "${ANTHROPIC_API_KEY:-}" && -z "${OPENAI_API_KEY:-}" ]]; then
        log_error "At least one API key (ANTHROPIC_API_KEY or OPENAI_API_KEY) must be configured"
        return 1
    fi
    
    # Create workspace directory
    local workspace_root="${WORKSPACE_ROOT:-/tmp/agentapi-workspaces}"
    mkdir -p "${workspace_root}"
    log_info "Workspace root: ${workspace_root}"
    
    # Start server in background
    cd "${AGENTAPI_DIR}"
    nohup node server.js > "${LOG_FILE}" 2>&1 &
    local pid=$!
    
    # Save PID
    echo "${pid}" > "${PID_FILE}"
    
    # Wait a moment and check if it started successfully
    sleep 2
    if ps -p "${pid}" > /dev/null 2>&1; then
        log_success "AgentAPI server started successfully (PID: ${pid})"
        log_info "Server running on http://${AGENTAPI_HOST:-localhost}:${AGENTAPI_PORT:-3285}"
        log_info "Web interface: http://${AGENTAPI_HOST:-localhost}:${AGENTAPI_PORT:-3285}"
        log_info "Logs: ${LOG_FILE}"
    else
        log_error "Failed to start AgentAPI server"
        rm -f "${PID_FILE}"
        return 1
    fi
}

# Stop AgentAPI server
stop_server() {
    log_info "Stopping AgentAPI middleware server..."
    
    if ! check_running; then
        log_warning "AgentAPI is not running"
        return 0
    fi
    
    local pid=$(cat "${PID_FILE}")
    
    # Try graceful shutdown first
    kill -TERM "${pid}" 2>/dev/null || true
    
    # Wait for graceful shutdown
    local count=0
    while ps -p "${pid}" > /dev/null 2>&1 && [[ ${count} -lt 10 ]]; do
        sleep 1
        ((count++))
    done
    
    # Force kill if still running
    if ps -p "${pid}" > /dev/null 2>&1; then
        log_warning "Graceful shutdown failed, forcing termination..."
        kill -KILL "${pid}" 2>/dev/null || true
    fi
    
    # Clean up PID file
    rm -f "${PID_FILE}"
    
    log_success "AgentAPI server stopped"
}

# Restart AgentAPI server
restart_server() {
    log_info "Restarting AgentAPI middleware server..."
    stop_server
    sleep 2
    start_server
}

# Show server status
show_status() {
    if check_running; then
        local pid=$(cat "${PID_FILE}")
        log_success "AgentAPI is running (PID: ${pid})"
        
        # Show basic info
        echo
        echo "Server Information:"
        echo "  PID: ${pid}"
        echo "  Log file: ${LOG_FILE}"
        echo "  Config file: ${ENV_FILE}"
        
        # Try to get health status
        local host="${AGENTAPI_HOST:-localhost}"
        local port="${AGENTAPI_PORT:-3285}"
        
        if command -v curl > /dev/null 2>&1; then
            echo
            echo "Health Check:"
            if curl -s "http://${host}:${port}/health" > /dev/null; then
                echo "  Status: ✅ Healthy"
                echo "  URL: http://${host}:${port}"
            else
                echo "  Status: ❌ Not responding"
            fi
        fi
    else
        log_warning "AgentAPI is not running"
    fi
}

# Show logs
show_logs() {
    if [[ -f "${LOG_FILE}" ]]; then
        if [[ "${1:-}" == "-f" ]]; then
            log_info "Following logs (Ctrl+C to stop)..."
            tail -f "${LOG_FILE}"
        else
            log_info "Showing last 50 lines of logs..."
            tail -n 50 "${LOG_FILE}"
        fi
    else
        log_warning "Log file not found: ${LOG_FILE}"
    fi
}

# Health check
health_check() {
    local host="${AGENTAPI_HOST:-localhost}"
    local port="${AGENTAPI_PORT:-3285}"
    
    log_info "Performing health check..."
    
    if ! check_running; then
        log_error "AgentAPI is not running"
        return 1
    fi
    
    if command -v curl > /dev/null 2>&1; then
        if curl -s "http://${host}:${port}/health" > /dev/null; then
            log_success "Health check passed"
            
            # Get detailed health info
            local health_data=$(curl -s "http://${host}:${port}/health" | head -c 1000)
            echo "Health Data: ${health_data}"
        else
            log_error "Health check failed - server not responding"
            return 1
        fi
    else
        log_warning "curl not available, cannot perform HTTP health check"
    fi
}

# Setup function
setup() {
    log_info "Setting up AgentAPI middleware..."
    
    # Check Node.js
    if ! command -v node > /dev/null 2>&1; then
        log_error "Node.js is not installed"
        return 1
    fi
    
    local node_version=$(node --version)
    log_info "Node.js version: ${node_version}"
    
    # Check npm dependencies
    if [[ ! -d "${PROJECT_ROOT}/node_modules" ]]; then
        log_info "Installing npm dependencies..."
        cd "${PROJECT_ROOT}"
        npm install
    fi
    
    # Create environment file if it doesn't exist
    if [[ ! -f "${ENV_FILE}" ]]; then
        log_info "Creating environment file..."
        cp "${AGENTAPI_DIR}/.env.example" "${ENV_FILE}"
        log_warning "Please edit ${ENV_FILE} with your configuration"
    fi
    
    # Create workspace directory
    local workspace_root="${WORKSPACE_ROOT:-/tmp/agentapi-workspaces}"
    mkdir -p "${workspace_root}"
    
    log_success "Setup completed"
    log_info "Next steps:"
    log_info "1. Edit ${ENV_FILE} with your API keys and configuration"
    log_info "2. Run: $0 start"
}

# Show usage
show_usage() {
    echo "Usage: $0 {start|stop|restart|status|logs|health|setup}"
    echo
    echo "Commands:"
    echo "  start    - Start the AgentAPI server"
    echo "  stop     - Stop the AgentAPI server"
    echo "  restart  - Restart the AgentAPI server"
    echo "  status   - Show server status"
    echo "  logs     - Show recent logs"
    echo "  logs -f  - Follow logs in real-time"
    echo "  health   - Perform health check"
    echo "  setup    - Initial setup and configuration"
    echo
    echo "Examples:"
    echo "  $0 setup     # Initial setup"
    echo "  $0 start     # Start server"
    echo "  $0 logs -f   # Follow logs"
    echo "  $0 health    # Check health"
}

# Main function
main() {
    case "${1:-}" in
        start)
            start_server
            ;;
        stop)
            stop_server
            ;;
        restart)
            restart_server
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs "${2:-}"
            ;;
        health)
            health_check
            ;;
        setup)
            setup
            ;;
        *)
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"

