#!/bin/bash

# Cloudflare Database Proxy Deployment Script
# This script deploys the database proxy worker to Cloudflare

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
WORKER_NAME="claude-task-master-db-proxy"
ENVIRONMENT=${1:-staging}

echo -e "${BLUE}🚀 Deploying Cloudflare Database Proxy Worker${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ Wrangler CLI is not installed${NC}"
    echo -e "${YELLOW}Please install it with: npm install -g wrangler${NC}"
    exit 1
fi

# Check if user is logged in
if ! wrangler whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Cloudflare${NC}"
    echo -e "${BLUE}Please run: wrangler login${NC}"
    exit 1
fi

# Navigate to cloudflare directory
cd "$(dirname "$0")"

echo -e "${BLUE}📋 Pre-deployment checklist:${NC}"

# Check if required environment variables are set
echo -e "${YELLOW}Checking environment variables...${NC}"

REQUIRED_SECRETS=(
    "DB_HOST"
    "DB_PORT"
    "DB_NAME"
    "DB_USER"
    "DB_PASSWORD"
    "VALID_API_TOKENS"
)

MISSING_SECRETS=()

for secret in "${REQUIRED_SECRETS[@]}"; do
    if ! wrangler secret list --env "$ENVIRONMENT" 2>/dev/null | grep -q "$secret"; then
        MISSING_SECRETS+=("$secret")
    fi
done

if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
    echo -e "${RED}❌ Missing required secrets:${NC}"
    for secret in "${MISSING_SECRETS[@]}"; do
        echo -e "${RED}  - $secret${NC}"
    done
    echo ""
    echo -e "${YELLOW}Please set these secrets using:${NC}"
    for secret in "${MISSING_SECRETS[@]}"; do
        echo -e "${BLUE}  wrangler secret put $secret --env $ENVIRONMENT${NC}"
    done
    echo ""
    read -p "Do you want to set these secrets now? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        for secret in "${MISSING_SECRETS[@]}"; do
            echo -e "${BLUE}Setting $secret...${NC}"
            wrangler secret put "$secret" --env "$ENVIRONMENT"
        done
    else
        echo -e "${RED}❌ Deployment cancelled. Please set required secrets first.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ All required secrets are set${NC}"

# Check KV namespaces
echo -e "${YELLOW}Checking KV namespaces...${NC}"

# Create KV namespaces if they don't exist
if ! wrangler kv:namespace list | grep -q "rate-limit"; then
    echo -e "${BLUE}Creating rate limit KV namespace...${NC}"
    wrangler kv:namespace create "rate-limit" --env "$ENVIRONMENT"
fi

if ! wrangler kv:namespace list | grep -q "audit-log"; then
    echo -e "${BLUE}Creating audit log KV namespace...${NC}"
    wrangler kv:namespace create "audit-log" --env "$ENVIRONMENT"
fi

echo -e "${GREEN}✅ KV namespaces are ready${NC}"

# Validate wrangler.toml
echo -e "${YELLOW}Validating configuration...${NC}"
if [ ! -f "wrangler.toml" ]; then
    echo -e "${RED}❌ wrangler.toml not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Configuration is valid${NC}"

# Deploy the worker
echo -e "${BLUE}🚀 Deploying worker...${NC}"
wrangler deploy --env "$ENVIRONMENT"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Worker deployed successfully!${NC}"
    
    # Get the worker URL
    WORKER_URL=$(wrangler subdomain get 2>/dev/null | grep -o 'https://.*\.workers\.dev' || echo "https://$WORKER_NAME.your-subdomain.workers.dev")
    
    echo ""
    echo -e "${GREEN}🎉 Deployment Complete!${NC}"
    echo -e "${BLUE}Worker URL: $WORKER_URL${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "${BLUE}1. Update your application configuration with the worker URL${NC}"
    echo -e "${BLUE}2. Test the connection using the health check endpoint${NC}"
    echo -e "${BLUE}3. Configure custom domain if needed${NC}"
    echo ""
    echo -e "${YELLOW}Test the deployment:${NC}"
    echo -e "${BLUE}curl -X POST $WORKER_URL \\${NC}"
    echo -e "${BLUE}  -H \"Content-Type: application/json\" \\${NC}"
    echo -e "${BLUE}  -H \"Authorization: Bearer YOUR_API_TOKEN\" \\${NC}"
    echo -e "${BLUE}  -d '{\"query\": \"SELECT 1 as health_check\"}'${NC}"
    
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

# Optional: Run a quick health check
read -p "Do you want to run a health check? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Running health check...${NC}"
    
    # This would require the API token to be available
    echo -e "${YELLOW}Please run the health check manually with your API token${NC}"
    echo -e "${BLUE}curl -X POST $WORKER_URL \\${NC}"
    echo -e "${BLUE}  -H \"Content-Type: application/json\" \\${NC}"
    echo -e "${BLUE}  -H \"Authorization: Bearer YOUR_API_TOKEN\" \\${NC}"
    echo -e "${BLUE}  -d '{\"query\": \"SELECT 1 as health_check\"}'${NC}"
fi

echo ""
echo -e "${GREEN}🎯 Deployment script completed!${NC}"

