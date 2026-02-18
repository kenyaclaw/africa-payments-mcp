#!/bin/bash

# Africa Payments MCP - AWS Lambda Deployment Script
# Usage: ./deploy.sh [environment] [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-production}"
AWS_REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="africa-payments-mcp-${ENVIRONMENT}"
S3_BUCKET="${S3_BUCKET:-}"

# Help message
show_help() {
    echo "Africa Payments MCP - AWS Lambda Deployment"
    echo ""
    echo "Usage: ./deploy.sh [environment] [options]"
    echo ""
    echo "Environments:"
    echo "  development    Deploy to development environment"
    echo "  staging        Deploy to staging environment"
    echo "  production     Deploy to production environment (default)"
    echo ""
    echo "Options:"
    echo "  --guided       Run SAM guided deployment"
    echo "  --local        Test locally with SAM local"
    echo "  --logs         Tail CloudWatch logs"
    echo "  --delete       Delete the stack"
    echo "  --help         Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  AWS_REGION     AWS region (default: us-east-1)"
    echo "  S3_BUCKET      S3 bucket for SAM artifacts"
}

# Log functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check SAM CLI
    if ! command -v sam &> /dev/null; then
        log_error "AWS SAM CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured. Please run 'aws configure'."
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install it first."
        exit 1
    fi
    
    log_success "All prerequisites met"
}

# Install dependencies
install_deps() {
    log_info "Installing dependencies..."
    npm ci
    log_success "Dependencies installed"
}

# Build the function
build_function() {
    log_info "Building Lambda function..."
    npm run build
    log_success "Build complete"
}

# Package the function
package_function() {
    log_info "Packaging Lambda function..."
    
    if [ -z "$S3_BUCKET" ]; then
        log_warning "No S3 bucket specified. SAM will create one automatically."
    fi
    
    sam package \
        --template-file template.yaml \
        --output-template-file packaged.yaml \
        ${S3_BUCKET:+--s3-bucket "$S3_BUCKET"} \
        --region "$AWS_REGION"
    
    log_success "Packaging complete"
}

# Deploy the stack
deploy_stack() {
    log_info "Deploying stack: $STACK_NAME"
    
    if [ "$2" = "--guided" ]; then
        sam deploy --guided \
            --template-file packaged.yaml \
            --stack-name "$STACK_NAME" \
            --region "$AWS_REGION" \
            --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND
    else
        sam deploy \
            --template-file packaged.yaml \
            --stack-name "$STACK_NAME" \
            --region "$AWS_REGION" \
            --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
            --no-fail-on-empty-changeset \
            --parameter-overrides "Environment=$ENVIRONMENT"
    fi
    
    log_success "Deployment complete!"
    
    # Get API endpoint
    API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
        --output text \
        --region "$AWS_REGION" 2>/dev/null || echo "")
    
    if [ -n "$API_URL" ]; then
        log_info "API Endpoint: $API_URL"
    fi
}

# Test locally
test_local() {
    log_info "Starting local API Gateway..."
    log_info "Press Ctrl+C to stop"
    
    sam local start-api \
        --template template.yaml \
        --env-vars env.json \
        --warm-containers EAGER
}

# Invoke function locally
invoke_local() {
    log_info "Invoking function locally..."
    
    # Create test event if it doesn't exist
    if [ ! -f "event.json" ]; then
        cat > event.json << 'EOF'
{
  "httpMethod": "GET",
  "path": "/health",
  "headers": {},
  "queryStringParameters": {},
  "body": null
}
EOF
    fi
    
    sam local invoke AfricaPaymentsFunction \
        --template template.yaml \
        --env-vars env.json \
        --event event.json
}

# Tail logs
tail_logs() {
    log_info "Tailing CloudWatch logs..."
    log_info "Press Ctrl+C to stop"
    
    aws logs tail "/aws/lambda/africa-payments-mcp-$ENVIRONMENT" \
        --follow \
        --region "$AWS_REGION"
}

# Delete stack
delete_stack() {
    log_warning "Are you sure you want to delete stack: $STACK_NAME? (yes/no)"
    read -r confirm
    
    if [ "$confirm" = "yes" ]; then
        log_info "Deleting stack..."
        aws cloudformation delete-stack \
            --stack-name "$STACK_NAME" \
            --region "$AWS_REGION"
        
        log_info "Waiting for stack deletion..."
        aws cloudformation wait stack-delete-complete \
            --stack-name "$STACK_NAME" \
            --region "$AWS_REGION"
        
        log_success "Stack deleted"
    else
        log_info "Deletion cancelled"
    fi
}

# Quick deploy (build, package, deploy)
quick_deploy() {
    check_prerequisites
    install_deps
    build_function
    package_function
    deploy_stack "$@"
}

# Main execution
case "${2:-}" in
    --help|-h)
        show_help
        exit 0
        ;;
    --local)
        test_local
        exit 0
        ;;
    --invoke)
        invoke_local
        exit 0
        ;;
    --logs)
        tail_logs
        exit 0
        ;;
    --delete)
        delete_stack
        exit 0
        ;;
    --guided)
        check_prerequisites
        install_deps
        build_function
        deploy_stack "$@"
        exit 0
        ;;
    *)
        quick_deploy "$@"
        ;;
esac
