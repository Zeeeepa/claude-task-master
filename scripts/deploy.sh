#!/bin/bash

# Claude Task Master Deployment Script
# Production-ready deployment with health checks and rollback capability

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_ID="deploy-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="/tmp/claude-task-master-deploy-${DEPLOYMENT_ID}.log"

# Default values
ENVIRONMENT="${ENVIRONMENT:-staging}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY="${REGISTRY:-ghcr.io/zeeeepa/claude-task-master}"
NAMESPACE="${NAMESPACE:-default}"
TIMEOUT="${TIMEOUT:-600}"
DRY_RUN="${DRY_RUN:-false}"
ROLLBACK="${ROLLBACK:-false}"
BACKUP_ENABLED="${BACKUP_ENABLED:-true}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" | tee -a "$LOG_FILE"
}

# Error handling
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log_error "Deployment failed with exit code $exit_code"
        log "Check logs at: $LOG_FILE"
        
        if [ "$ROLLBACK" = "true" ]; then
            log "Initiating automatic rollback..."
            rollback_deployment
        fi
    fi
    exit $exit_code
}

trap cleanup EXIT

# Help function
show_help() {
    cat << EOF
Claude Task Master Deployment Script

Usage: $0 [OPTIONS]

Options:
    -e, --environment ENVIRONMENT    Target environment (staging|production) [default: staging]
    -t, --tag TAG                   Docker image tag [default: latest]
    -r, --registry REGISTRY         Container registry [default: ghcr.io/zeeeepa/claude-task-master]
    -n, --namespace NAMESPACE       Kubernetes namespace [default: default]
    -T, --timeout TIMEOUT          Deployment timeout in seconds [default: 600]
    -d, --dry-run                   Perform a dry run without making changes
    -R, --rollback                  Enable automatic rollback on failure
    -B, --no-backup                 Disable backup creation
    -h, --help                      Show this help message

Environment Variables:
    ENVIRONMENT                     Same as --environment
    IMAGE_TAG                       Same as --tag
    REGISTRY                        Same as --registry
    NAMESPACE                       Same as --namespace
    TIMEOUT                         Same as --timeout
    DRY_RUN                         Same as --dry-run (true|false)
    ROLLBACK                        Same as --rollback (true|false)
    BACKUP_ENABLED                  Same as --no-backup (true|false)

Examples:
    # Deploy to staging
    $0 --environment staging --tag v1.2.3

    # Deploy to production with rollback enabled
    $0 --environment production --tag v1.2.3 --rollback

    # Dry run deployment
    $0 --environment staging --tag v1.2.3 --dry-run

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -t|--tag)
                IMAGE_TAG="$2"
                shift 2
                ;;
            -r|--registry)
                REGISTRY="$2"
                shift 2
                ;;
            -n|--namespace)
                NAMESPACE="$2"
                shift 2
                ;;
            -T|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN="true"
                shift
                ;;
            -R|--rollback)
                ROLLBACK="true"
                shift
                ;;
            -B|--no-backup)
                BACKUP_ENABLED="false"
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Validation functions
validate_environment() {
    if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
        exit 1
    fi
}

validate_prerequisites() {
    log "Validating prerequisites..."
    
    # Check required tools
    local required_tools=("kubectl" "docker" "curl" "jq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "Required tool '$tool' is not installed"
            exit 1
        fi
    done
    
    # Check kubectl connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    # Check namespace exists
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_warning "Namespace '$NAMESPACE' does not exist, creating it..."
        if [ "$DRY_RUN" = "false" ]; then
            kubectl create namespace "$NAMESPACE"
        fi
    fi
    
    log_success "Prerequisites validated"
}

# Docker functions
build_docker_image() {
    log "Building Docker image..."
    
    local image_name="${REGISTRY}:${IMAGE_TAG}"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would build image: $image_name"
        return 0
    fi
    
    cd "$PROJECT_ROOT"
    
    docker build \
        -f docker/Dockerfile \
        -t "$image_name" \
        --build-arg NODE_ENV="$ENVIRONMENT" \
        --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        --build-arg VCS_REF="$(git rev-parse HEAD)" \
        .
    
    log_success "Docker image built: $image_name"
}

push_docker_image() {
    log "Pushing Docker image to registry..."
    
    local image_name="${REGISTRY}:${IMAGE_TAG}"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would push image: $image_name"
        return 0
    fi
    
    docker push "$image_name"
    
    log_success "Docker image pushed: $image_name"
}

# Backup functions
create_backup() {
    if [ "$BACKUP_ENABLED" = "false" ]; then
        log "Backup disabled, skipping..."
        return 0
    fi
    
    log "Creating deployment backup..."
    
    local backup_dir="/tmp/claude-task-master-backup-${DEPLOYMENT_ID}"
    mkdir -p "$backup_dir"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would create backup in: $backup_dir"
        return 0
    fi
    
    # Backup current deployment
    kubectl get deployment claude-task-master -n "$NAMESPACE" -o yaml > "$backup_dir/deployment.yaml" 2>/dev/null || true
    kubectl get service claude-task-master-service -n "$NAMESPACE" -o yaml > "$backup_dir/service.yaml" 2>/dev/null || true
    kubectl get configmap claude-task-master-config -n "$NAMESPACE" -o yaml > "$backup_dir/configmap.yaml" 2>/dev/null || true
    
    # Backup database
    if command -v pg_dump &> /dev/null && [ -n "${DATABASE_URL:-}" ]; then
        log "Creating database backup..."
        pg_dump "$DATABASE_URL" > "$backup_dir/database-backup.sql"
    fi
    
    echo "$backup_dir" > "/tmp/claude-task-master-last-backup.txt"
    
    log_success "Backup created: $backup_dir"
}

# Deployment functions
apply_kubernetes_manifests() {
    log "Applying Kubernetes manifests..."
    
    local manifests_dir="$PROJECT_ROOT/k8s"
    local image_name="${REGISTRY}:${IMAGE_TAG}"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would apply manifests from: $manifests_dir"
        log "DRY RUN: Would use image: $image_name"
        return 0
    fi
    
    # Apply ConfigMap first
    kubectl apply -f "$manifests_dir/configmap.yaml" -n "$NAMESPACE"
    
    # Apply Secrets (if they don't exist)
    if ! kubectl get secret claude-task-master-secrets -n "$NAMESPACE" &> /dev/null; then
        log_warning "Secrets not found. Please create them manually before deployment."
    fi
    
    # Update deployment with new image
    kubectl set image deployment/claude-task-master app="$image_name" -n "$NAMESPACE" || {
        log "Deployment not found, creating new one..."
        # Replace image in deployment manifest and apply
        sed "s|image: claude-task-master:latest|image: $image_name|g" "$manifests_dir/deployment.yaml" | \
        kubectl apply -f - -n "$NAMESPACE"
    }
    
    # Apply service
    kubectl apply -f "$manifests_dir/service.yaml" -n "$NAMESPACE"
    
    # Apply ingress
    kubectl apply -f "$manifests_dir/ingress.yaml" -n "$NAMESPACE"
    
    log_success "Kubernetes manifests applied"
}

wait_for_deployment() {
    log "Waiting for deployment to complete..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would wait for deployment to complete"
        return 0
    fi
    
    # Wait for rollout to complete
    if ! kubectl rollout status deployment/claude-task-master -n "$NAMESPACE" --timeout="${TIMEOUT}s"; then
        log_error "Deployment rollout failed or timed out"
        return 1
    fi
    
    # Wait for pods to be ready
    if ! kubectl wait --for=condition=ready pod -l app=claude-task-master -n "$NAMESPACE" --timeout="${TIMEOUT}s"; then
        log_error "Pods failed to become ready"
        return 1
    fi
    
    log_success "Deployment completed successfully"
}

# Health check functions
run_health_checks() {
    log "Running health checks..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would run health checks"
        return 0
    fi
    
    # Internal health check
    log "Running internal health check..."
    if ! kubectl exec -n "$NAMESPACE" deployment/claude-task-master -- curl -f http://localhost:3000/health; then
        log_error "Internal health check failed"
        return 1
    fi
    
    # External health check (if ingress is configured)
    local service_url
    service_url=$(kubectl get service claude-task-master-service -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
    
    if [ -n "$service_url" ]; then
        log "Running external health check..."
        local max_attempts=30
        local attempt=1
        
        while [ $attempt -le $max_attempts ]; do
            if curl -f "http://${service_url}/health" &> /dev/null; then
                log_success "External health check passed"
                break
            fi
            
            log "Health check attempt $attempt/$max_attempts failed, retrying in 10 seconds..."
            sleep 10
            ((attempt++))
        done
        
        if [ $attempt -gt $max_attempts ]; then
            log_error "External health check failed after $max_attempts attempts"
            return 1
        fi
    fi
    
    log_success "All health checks passed"
}

run_smoke_tests() {
    log "Running smoke tests..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would run smoke tests"
        return 0
    fi
    
    # Basic API tests
    local service_url
    service_url=$(kubectl get service claude-task-master-service -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "localhost")
    
    # Test health endpoint
    if ! curl -f "http://${service_url}/health"; then
        log_error "Health endpoint test failed"
        return 1
    fi
    
    # Test metrics endpoint
    if ! curl -f "http://${service_url}:8000/metrics"; then
        log_error "Metrics endpoint test failed"
        return 1
    fi
    
    # Test API status endpoint
    if ! curl -f "http://${service_url}/api/v1/status"; then
        log_error "API status endpoint test failed"
        return 1
    fi
    
    log_success "Smoke tests passed"
}

# Rollback functions
rollback_deployment() {
    log "Rolling back deployment..."
    
    local backup_file="/tmp/claude-task-master-last-backup.txt"
    if [ ! -f "$backup_file" ]; then
        log_error "No backup found for rollback"
        return 1
    fi
    
    local backup_dir
    backup_dir=$(cat "$backup_file")
    
    if [ ! -d "$backup_dir" ]; then
        log_error "Backup directory not found: $backup_dir"
        return 1
    fi
    
    log "Restoring from backup: $backup_dir"
    
    # Restore deployment
    if [ -f "$backup_dir/deployment.yaml" ]; then
        kubectl apply -f "$backup_dir/deployment.yaml" -n "$NAMESPACE"
    fi
    
    # Wait for rollback to complete
    kubectl rollout status deployment/claude-task-master -n "$NAMESPACE" --timeout="${TIMEOUT}s"
    
    log_success "Rollback completed"
}

# Monitoring functions
setup_monitoring() {
    log "Setting up monitoring..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would setup monitoring"
        return 0
    fi
    
    # Apply monitoring configuration
    local monitoring_dir="$PROJECT_ROOT/monitoring"
    if [ -d "$monitoring_dir" ]; then
        kubectl apply -f "$monitoring_dir/" -n "$NAMESPACE" || true
    fi
    
    log_success "Monitoring setup completed"
}

# Notification functions
send_notification() {
    local status="$1"
    local message="$2"
    
    if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
        local emoji="✅"
        local color="good"
        
        if [ "$status" = "failure" ]; then
            emoji="❌"
            color="danger"
        elif [ "$status" = "warning" ]; then
            emoji="⚠️"
            color="warning"
        fi
        
        local payload=$(cat << EOF
{
    "attachments": [
        {
            "color": "$color",
            "title": "$emoji Claude Task Master Deployment",
            "fields": [
                {
                    "title": "Environment",
                    "value": "$ENVIRONMENT",
                    "short": true
                },
                {
                    "title": "Image Tag",
                    "value": "$IMAGE_TAG",
                    "short": true
                },
                {
                    "title": "Status",
                    "value": "$message",
                    "short": false
                }
            ],
            "footer": "Deployment ID: $DEPLOYMENT_ID",
            "ts": $(date +%s)
        }
    ]
}
EOF
        )
        
        curl -X POST -H 'Content-type: application/json' \
            --data "$payload" \
            "$SLACK_WEBHOOK_URL" &> /dev/null || true
    fi
}

# Main deployment function
main() {
    log "Starting Claude Task Master deployment"
    log "Deployment ID: $DEPLOYMENT_ID"
    log "Environment: $ENVIRONMENT"
    log "Image Tag: $IMAGE_TAG"
    log "Registry: $REGISTRY"
    log "Namespace: $NAMESPACE"
    log "Dry Run: $DRY_RUN"
    
    # Validate inputs
    validate_environment
    validate_prerequisites
    
    # Create backup
    create_backup
    
    # Build and push image
    build_docker_image
    push_docker_image
    
    # Deploy to Kubernetes
    apply_kubernetes_manifests
    wait_for_deployment
    
    # Run tests
    run_health_checks
    run_smoke_tests
    
    # Setup monitoring
    setup_monitoring
    
    # Send success notification
    send_notification "success" "Deployment completed successfully"
    
    log_success "Deployment completed successfully!"
    log "Deployment ID: $DEPLOYMENT_ID"
    log "Logs available at: $LOG_FILE"
}

# Parse arguments and run main function
parse_args "$@"
main

