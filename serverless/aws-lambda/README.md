# Africa Payments MCP - AWS Lambda Deployment

Serverless deployment for Africa Payments MCP using AWS Lambda and API Gateway.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Deploy with SAM (guided)
./deploy.sh production --guided

# Or deploy automatically
./deploy.sh production
```

## Features

- ⚡ **Lambda Function** - Node.js 20.x runtime with optimized cold starts
- 🌐 **API Gateway** - REST API with CORS support
- 🔐 **API Key Authorization** - DynamoDB-backed API key validation
- 💾 **DynamoDB Tables** - Idempotency, circuit breaker, and API key storage
- 🔒 **Secrets Manager** - Secure configuration storage option
- 📊 **CloudWatch** - Monitoring and alarms
- 🚀 **Provisioned Concurrency** - For production environments

## Architecture

```
Client → API Gateway → Lambda Authorizer → Lambda Function → Payment Providers
                           ↓
                    DynamoDB (API Keys)
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/tools` | List available MCP tools |
| POST | `/invoke` | Execute MCP tool |
| POST | `/webhook/{provider}` | Receive provider webhooks |

## Configuration

### Environment Variables

Set these in `template.yaml` or via AWS Secrets Manager:

```bash
# Provider Configuration
MPESA_ENABLED=true
MPESA_CONSUMER_KEY=your_key
MPESA_CONSUMER_SECRET=your_secret
PAYSTACK_ENABLED=true
PAYSTACK_SECRET_KEY=sk_test_...

# Security
ENCRYPTION_KEY=your_encryption_key
WEBHOOK_SECRET=your_webhook_secret
```

### Using AWS Secrets Manager

1. Set `UseSecretsManager=true` during deployment
2. Update the secret with your config:

```bash
aws secretsmanager put-secret-value \
  --secret-id africa-payments-mcp/config-production \
  --secret-string file://config.json
```

## API Key Management

Add API keys to DynamoDB:

```bash
aws dynamodb put-item \
  --table-name africa-payments-apikeys-production \
  --item '{
    "apiKey": {"S": "your-secure-api-key"},
    "tenantId": {"S": "tenant-123"},
    "name": {"S": "Production Key"},
    "permissions": {"SS": ["payments:read", "payments:write"]},
    "rateLimit": {"N": "1000"},
    "active": {"BOOL": true}
  }'
```

## Local Development

```bash
# Install dependencies
npm install

# Create local environment file
cat > env.json << 'EOF'
{
  "AfricaPaymentsFunction": {
    "NODE_ENV": "development",
    "MPESA_ENABLED": "false",
    "PAYSTACK_ENABLED": "false"
  }
}
EOF

# Run locally
npm run local

# Or use the script
./deploy.sh --local
```

## Deployment Scripts

| Command | Description |
|---------|-------------|
| `./deploy.sh production` | Deploy to production |
| `./deploy.sh staging` | Deploy to staging |
| `./deploy.sh --local` | Test locally |
| `./deploy.sh --logs` | Tail CloudWatch logs |
| `./deploy.sh --delete` | Delete stack |

## Monitoring

View CloudWatch logs:
```bash
aws logs tail /aws/lambda/africa-payments-mcp-production --follow
```

Check metrics:
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=africa-payments-mcp-production \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Average
```

## Cost Optimization

- Use `AWS::Serverless::Function` with `AutoPublishAlias` for gradual deployments
- Enable provisioned concurrency only in production
- Use DynamoDB on-demand for unpredictable workloads
- Configure CloudWatch retention periods appropriately

## Troubleshooting

**Cold Start Issues:**
- Enable provisioned concurrency
- Use Lambda SnapStart (Java only)
- Optimize bundle size

**Timeouts:**
- Increase `Timeout` in template.yaml
- Check provider API latency

**Authorization Errors:**
- Verify API key in DynamoDB
- Check authorizer logs
