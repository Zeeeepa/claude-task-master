#!/bin/bash

# WSL2 PR Deployment Script
# Deploys a PR to a WSL2 environment for validation

set -e

# Configuration
PR_REPOSITORY=${1:-""}
PR_NUMBER=${2:-""}
PR_BRANCH=${3:-""}
ENVIRONMENT_NAME=${4:-"pr-${PR_NUMBER}-$(date +%s)"}
WORKSPACE_PATH=${5:-"/tmp/claude-deployments/$ENVIRONMENT_NAME"}

# Validate required parameters
if [ -z "$PR_REPOSITORY" ] || [ -z "$PR_NUMBER" ] || [ -z "$PR_BRANCH" ]; then
    echo "Usage: $0 <repository> <pr_number> <pr_branch> [environment_name] [workspace_path]"
    echo "Example: $0 owner/repo 123 feature-branch"
    exit 1
fi

echo "Deploying PR #$PR_NUMBER from $PR_REPOSITORY ($PR_BRANCH)"
echo "Environment: $ENVIRONMENT_NAME"
echo "Workspace: $WORKSPACE_PATH"

# Create workspace directory
mkdir -p "$WORKSPACE_PATH"
cd "$WORKSPACE_PATH"

# Create deployment info file
cat > "$WORKSPACE_PATH/deployment-info.json" << EOF
{
    "repository": "$PR_REPOSITORY",
    "prNumber": "$PR_NUMBER",
    "branch": "$PR_BRANCH",
    "environment": "$ENVIRONMENT_NAME",
    "workspace": "$WORKSPACE_PATH",
    "deployedAt": "$(date -Iseconds)",
    "deployedBy": "$(whoami)",
    "hostname": "$(hostname)",
    "status": "deploying"
}
EOF

# Function to update deployment status
update_status() {
    local status=$1
    local message=${2:-""}
    
    # Update JSON file
    jq --arg status "$status" --arg message "$message" --arg timestamp "$(date -Iseconds)" \
        '.status = $status | .lastUpdate = $timestamp | if $message != "" then .message = $message else . end' \
        "$WORKSPACE_PATH/deployment-info.json" > "$WORKSPACE_PATH/deployment-info.json.tmp"
    mv "$WORKSPACE_PATH/deployment-info.json.tmp" "$WORKSPACE_PATH/deployment-info.json"
    
    echo "[$(date -Iseconds)] Status: $status - $message"
}

# Function to log deployment steps
log_step() {
    local step=$1
    local message=$2
    
    echo "[$(date -Iseconds)] $step: $message"
    echo "$(date -Iseconds) - $step: $message" >> "$WORKSPACE_PATH/deployment.log"
}

# Start deployment
update_status "cloning" "Cloning repository"
log_step "CLONE" "Starting repository clone"

# Clone repository
REPO_PATH="$WORKSPACE_PATH/repo"
if [[ "$PR_REPOSITORY" == *"github.com"* ]]; then
    CLONE_URL="$PR_REPOSITORY"
else
    CLONE_URL="https://github.com/$PR_REPOSITORY.git"
fi

log_step "CLONE" "Cloning from $CLONE_URL"
git clone "$CLONE_URL" "$REPO_PATH"

cd "$REPO_PATH"

# Checkout PR branch
log_step "CHECKOUT" "Checking out branch $PR_BRANCH"
git checkout "$PR_BRANCH"

# Get commit information
COMMIT_SHA=$(git rev-parse HEAD)
COMMIT_MESSAGE=$(git log -1 --pretty=format:"%s")
COMMIT_AUTHOR=$(git log -1 --pretty=format:"%an <%ae>")

log_step "INFO" "Commit: $COMMIT_SHA"
log_step "INFO" "Message: $COMMIT_MESSAGE"
log_step "INFO" "Author: $COMMIT_AUTHOR"

# Update deployment info with commit details
jq --arg sha "$COMMIT_SHA" --arg message "$COMMIT_MESSAGE" --arg author "$COMMIT_AUTHOR" \
    '.commit = {sha: $sha, message: $message, author: $author}' \
    "$WORKSPACE_PATH/deployment-info.json" > "$WORKSPACE_PATH/deployment-info.json.tmp"
mv "$WORKSPACE_PATH/deployment-info.json.tmp" "$WORKSPACE_PATH/deployment-info.json"

# Detect project type
update_status "analyzing" "Analyzing project structure"
log_step "ANALYZE" "Detecting project type"

PROJECT_TYPE="generic"
if [ -f "package.json" ]; then
    PROJECT_TYPE="nodejs"
    log_step "ANALYZE" "Detected Node.js project"
elif [ -f "requirements.txt" ] || [ -f "pyproject.toml" ] || [ -f "setup.py" ]; then
    PROJECT_TYPE="python"
    log_step "ANALYZE" "Detected Python project"
elif [ -f "Dockerfile" ] || [ -f "docker-compose.yml" ]; then
    PROJECT_TYPE="docker"
    log_step "ANALYZE" "Detected Docker project"
elif [ -f "pom.xml" ]; then
    PROJECT_TYPE="java"
    log_step "ANALYZE" "Detected Java project"
elif [ -f "go.mod" ]; then
    PROJECT_TYPE="go"
    log_step "ANALYZE" "Detected Go project"
fi

# Update deployment info with project type
jq --arg type "$PROJECT_TYPE" '.projectType = $type' \
    "$WORKSPACE_PATH/deployment-info.json" > "$WORKSPACE_PATH/deployment-info.json.tmp"
mv "$WORKSPACE_PATH/deployment-info.json.tmp" "$WORKSPACE_PATH/deployment-info.json"

# Setup environment based on project type
update_status "setup" "Setting up environment for $PROJECT_TYPE"
log_step "SETUP" "Setting up $PROJECT_TYPE environment"

case "$PROJECT_TYPE" in
    "nodejs")
        log_step "SETUP" "Installing Node.js dependencies"
        
        # Check Node.js version requirement
        if [ -f ".nvmrc" ]; then
            NODE_VERSION=$(cat .nvmrc)
            log_step "SETUP" "Required Node.js version: $NODE_VERSION"
        fi
        
        # Install dependencies
        if [ -f "package-lock.json" ]; then
            npm ci
        elif [ -f "yarn.lock" ]; then
            yarn install --frozen-lockfile
        else
            npm install
        fi
        
        log_step "SETUP" "Node.js dependencies installed"
        ;;
        
    "python")
        log_step "SETUP" "Setting up Python environment"
        
        # Create virtual environment
        python3 -m venv "$WORKSPACE_PATH/venv"
        source "$WORKSPACE_PATH/venv/bin/activate"
        
        # Upgrade pip
        pip install --upgrade pip
        
        # Install dependencies
        if [ -f "requirements.txt" ]; then
            pip install -r requirements.txt
        elif [ -f "pyproject.toml" ]; then
            pip install .
        elif [ -f "setup.py" ]; then
            pip install -e .
        fi
        
        log_step "SETUP" "Python environment setup completed"
        ;;
        
    "docker")
        log_step "SETUP" "Building Docker environment"
        
        # Build Docker image
        if [ -f "Dockerfile" ]; then
            docker build -t "$ENVIRONMENT_NAME" .
        fi
        
        # Start services if docker-compose exists
        if [ -f "docker-compose.yml" ]; then
            docker-compose up -d
        fi
        
        log_step "SETUP" "Docker environment setup completed"
        ;;
        
    "java")
        log_step "SETUP" "Setting up Java environment"
        
        # Build with Maven
        if [ -f "pom.xml" ]; then
            mvn clean compile
        fi
        
        log_step "SETUP" "Java environment setup completed"
        ;;
        
    "go")
        log_step "SETUP" "Setting up Go environment"
        
        # Download dependencies
        go mod download
        
        # Build project
        go build ./...
        
        log_step "SETUP" "Go environment setup completed"
        ;;
        
    *)
        log_step "SETUP" "Generic project setup"
        ;;
esac

# Run basic validation
update_status "validating" "Running basic validation"
log_step "VALIDATE" "Starting basic validation"

VALIDATION_RESULTS="$WORKSPACE_PATH/validation-results.json"
cat > "$VALIDATION_RESULTS" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "projectType": "$PROJECT_TYPE",
    "tests": {},
    "linting": {},
    "build": {},
    "security": {}
}
EOF

# Project-specific validation
case "$PROJECT_TYPE" in
    "nodejs")
        log_step "VALIDATE" "Running Node.js validation"
        
        # Run tests if available
        if npm run test --silent > /dev/null 2>&1; then
            log_step "VALIDATE" "Running tests"
            if npm test > "$WORKSPACE_PATH/test-output.log" 2>&1; then
                jq '.tests = {status: "passed", output: "test-output.log"}' "$VALIDATION_RESULTS" > "$VALIDATION_RESULTS.tmp"
                mv "$VALIDATION_RESULTS.tmp" "$VALIDATION_RESULTS"
                log_step "VALIDATE" "Tests passed"
            else
                jq '.tests = {status: "failed", output: "test-output.log"}' "$VALIDATION_RESULTS" > "$VALIDATION_RESULTS.tmp"
                mv "$VALIDATION_RESULTS.tmp" "$VALIDATION_RESULTS"
                log_step "VALIDATE" "Tests failed"
            fi
        fi
        
        # Run linting if available
        if npm run lint --silent > /dev/null 2>&1; then
            log_step "VALIDATE" "Running linting"
            if npm run lint > "$WORKSPACE_PATH/lint-output.log" 2>&1; then
                jq '.linting = {status: "passed", output: "lint-output.log"}' "$VALIDATION_RESULTS" > "$VALIDATION_RESULTS.tmp"
                mv "$VALIDATION_RESULTS.tmp" "$VALIDATION_RESULTS"
                log_step "VALIDATE" "Linting passed"
            else
                jq '.linting = {status: "failed", output: "lint-output.log"}' "$VALIDATION_RESULTS" > "$VALIDATION_RESULTS.tmp"
                mv "$VALIDATION_RESULTS.tmp" "$VALIDATION_RESULTS"
                log_step "VALIDATE" "Linting failed"
            fi
        fi
        
        # Run build if available
        if npm run build --silent > /dev/null 2>&1; then
            log_step "VALIDATE" "Running build"
            if npm run build > "$WORKSPACE_PATH/build-output.log" 2>&1; then
                jq '.build = {status: "passed", output: "build-output.log"}' "$VALIDATION_RESULTS" > "$VALIDATION_RESULTS.tmp"
                mv "$VALIDATION_RESULTS.tmp" "$VALIDATION_RESULTS"
                log_step "VALIDATE" "Build passed"
            else
                jq '.build = {status: "failed", output: "build-output.log"}' "$VALIDATION_RESULTS" > "$VALIDATION_RESULTS.tmp"
                mv "$VALIDATION_RESULTS.tmp" "$VALIDATION_RESULTS"
                log_step "VALIDATE" "Build failed"
            fi
        fi
        ;;
        
    "python")
        log_step "VALIDATE" "Running Python validation"
        
        # Activate virtual environment
        source "$WORKSPACE_PATH/venv/bin/activate"
        
        # Run tests with pytest
        if command -v pytest > /dev/null 2>&1; then
            log_step "VALIDATE" "Running pytest"
            if pytest > "$WORKSPACE_PATH/test-output.log" 2>&1; then
                jq '.tests = {status: "passed", output: "test-output.log"}' "$VALIDATION_RESULTS" > "$VALIDATION_RESULTS.tmp"
                mv "$VALIDATION_RESULTS.tmp" "$VALIDATION_RESULTS"
                log_step "VALIDATE" "Tests passed"
            else
                jq '.tests = {status: "failed", output: "test-output.log"}' "$VALIDATION_RESULTS" > "$VALIDATION_RESULTS.tmp"
                mv "$VALIDATION_RESULTS.tmp" "$VALIDATION_RESULTS"
                log_step "VALIDATE" "Tests failed"
            fi
        fi
        
        # Run linting with flake8
        if command -v flake8 > /dev/null 2>&1; then
            log_step "VALIDATE" "Running flake8"
            if flake8 . > "$WORKSPACE_PATH/lint-output.log" 2>&1; then
                jq '.linting = {status: "passed", output: "lint-output.log"}' "$VALIDATION_RESULTS" > "$VALIDATION_RESULTS.tmp"
                mv "$VALIDATION_RESULTS.tmp" "$VALIDATION_RESULTS"
                log_step "VALIDATE" "Linting passed"
            else
                jq '.linting = {status: "failed", output: "lint-output.log"}' "$VALIDATION_RESULTS" > "$VALIDATION_RESULTS.tmp"
                mv "$VALIDATION_RESULTS.tmp" "$VALIDATION_RESULTS"
                log_step "VALIDATE" "Linting failed"
            fi
        fi
        ;;
        
    "docker")
        log_step "VALIDATE" "Running Docker validation"
        
        # Check if containers are running
        if docker-compose ps | grep -q "Up"; then
            jq '.tests = {status: "passed", message: "Containers are running"}' "$VALIDATION_RESULTS" > "$VALIDATION_RESULTS.tmp"
            mv "$VALIDATION_RESULTS.tmp" "$VALIDATION_RESULTS"
            log_step "VALIDATE" "Docker containers are running"
        else
            jq '.tests = {status: "failed", message: "Containers failed to start"}' "$VALIDATION_RESULTS" > "$VALIDATION_RESULTS.tmp"
            mv "$VALIDATION_RESULTS.tmp" "$VALIDATION_RESULTS"
            log_step "VALIDATE" "Docker containers failed to start"
        fi
        ;;
esac

# Run security scan
log_step "VALIDATE" "Running security scan"
SECURITY_ISSUES=0

# Check for common security issues
if grep -r "password\|secret\|key" . --include="*.js" --include="*.py" --include="*.java" --include="*.go" | grep -v node_modules | grep -v ".git" > "$WORKSPACE_PATH/security-scan.log" 2>&1; then
    SECURITY_ISSUES=$(wc -l < "$WORKSPACE_PATH/security-scan.log")
fi

jq --arg issues "$SECURITY_ISSUES" '.security = {issues: ($issues | tonumber), output: "security-scan.log"}' "$VALIDATION_RESULTS" > "$VALIDATION_RESULTS.tmp"
mv "$VALIDATION_RESULTS.tmp" "$VALIDATION_RESULTS"

if [ "$SECURITY_ISSUES" -gt 0 ]; then
    log_step "VALIDATE" "Found $SECURITY_ISSUES potential security issues"
else
    log_step "VALIDATE" "No obvious security issues found"
fi

# Generate deployment summary
update_status "completed" "Deployment completed successfully"
log_step "COMPLETE" "Generating deployment summary"

# Calculate deployment duration
DEPLOYMENT_START=$(jq -r '.deployedAt' "$WORKSPACE_PATH/deployment-info.json")
DEPLOYMENT_END=$(date -Iseconds)
DURATION=$(( $(date -d "$DEPLOYMENT_END" +%s) - $(date -d "$DEPLOYMENT_START" +%s) ))

# Update final deployment info
jq --arg status "completed" --arg end "$DEPLOYMENT_END" --arg duration "$DURATION" \
    '.status = $status | .completedAt = $end | .duration = ($duration | tonumber)' \
    "$WORKSPACE_PATH/deployment-info.json" > "$WORKSPACE_PATH/deployment-info.json.tmp"
mv "$WORKSPACE_PATH/deployment-info.json.tmp" "$WORKSPACE_PATH/deployment-info.json"

# Create deployment summary
cat > "$WORKSPACE_PATH/deployment-summary.md" << EOF
# PR Deployment Summary

## Deployment Information
- **Repository**: $PR_REPOSITORY
- **PR Number**: #$PR_NUMBER
- **Branch**: $PR_BRANCH
- **Environment**: $ENVIRONMENT_NAME
- **Workspace**: $WORKSPACE_PATH

## Commit Information
- **SHA**: $COMMIT_SHA
- **Message**: $COMMIT_MESSAGE
- **Author**: $COMMIT_AUTHOR

## Project Information
- **Type**: $PROJECT_TYPE
- **Deployed At**: $DEPLOYMENT_START
- **Completed At**: $DEPLOYMENT_END
- **Duration**: ${DURATION}s

## Validation Results
$(cat "$VALIDATION_RESULTS" | jq -r '
if .tests.status then "- **Tests**: " + .tests.status else "" end,
if .linting.status then "- **Linting**: " + .linting.status else "" end,
if .build.status then "- **Build**: " + .build.status else "" end,
if .security.issues then "- **Security Issues**: " + (.security.issues | tostring) else "" end
' | grep -v "^$")

## Files Generated
- \`deployment-info.json\` - Deployment metadata
- \`validation-results.json\` - Validation results
- \`deployment.log\` - Deployment log
- \`deployment-summary.md\` - This summary

## Next Steps
1. Review validation results
2. Address any failed tests or linting issues
3. Review security scan results
4. Run additional validation if needed

---
*Generated by claude-task-master WSL2 deployment system*
EOF

echo ""
echo "=============================================="
echo "PR Deployment Completed Successfully!"
echo "=============================================="
echo "Repository: $PR_REPOSITORY"
echo "PR: #$PR_NUMBER ($PR_BRANCH)"
echo "Environment: $ENVIRONMENT_NAME"
echo "Workspace: $WORKSPACE_PATH"
echo "Duration: ${DURATION}s"
echo ""
echo "Summary available at: $WORKSPACE_PATH/deployment-summary.md"
echo "Validation results: $WORKSPACE_PATH/validation-results.json"
echo "Deployment log: $WORKSPACE_PATH/deployment.log"
echo ""

# Create cleanup script for this deployment
cat > "$WORKSPACE_PATH/cleanup-deployment.sh" << EOF
#!/bin/bash
# Cleanup script for deployment $ENVIRONMENT_NAME

echo "Cleaning up deployment: $ENVIRONMENT_NAME"

# Stop any running processes
pkill -f "$WORKSPACE_PATH" || true

# Docker cleanup if applicable
if [ "$PROJECT_TYPE" = "docker" ]; then
    cd "$REPO_PATH"
    docker-compose down || true
    docker rmi "$ENVIRONMENT_NAME" || true
fi

# Remove workspace
read -p "Remove workspace directory $WORKSPACE_PATH? (y/N): " -n 1 -r
echo
if [[ \$REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$WORKSPACE_PATH"
    echo "Workspace removed"
else
    echo "Workspace preserved"
fi
EOF

chmod +x "$WORKSPACE_PATH/cleanup-deployment.sh"

echo "To cleanup this deployment later, run:"
echo "  $WORKSPACE_PATH/cleanup-deployment.sh"

