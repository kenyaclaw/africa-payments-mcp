# Africa Payments MCP - Serverless Deployments

This directory contains serverless and edge deployment configurations for the Africa Payments MCP server.

## Available Deployments

### AWS Lambda (`aws-lambda/`)
- **Runtime**: Node.js 20.x
- **Features**: API Gateway, DynamoDB, ElastiCache, CloudWatch
- **Deployment**: SAM CLI or Serverless Framework
- **Best for**: Enterprise AWS environments

### Cloudflare Workers (`cloudflare-workers/`)
- **Runtime**: Edge (V8 isolates)
- **Features**: KV storage, global edge network, sub-50ms latency
- **Deployment**: Wrangler CLI
- **Best for**: Ultra-low latency, global distribution

### Vercel Edge Functions (`vercel/`)
- **Runtime**: Edge (Node.js compatible)
- **Features**: Edge Middleware, KV, Edge Config
- **Deployment**: Vercel CLI
- **Best for**: Frontend-integrated deployments

## Quick Comparison

| Feature | AWS Lambda | Cloudflare Workers | Vercel |
|---------|------------|-------------------|---------|
| Cold Start | ~100-500ms | 0ms | 0ms |
| Global Regions | 30+ | 300+ | 100+ |
| Max Execution | 15 min | 50ms CPU | 30s |
| Storage | DynamoDB | KV | KV + Edge Config |
| Pricing | Per request + duration | Per request | Per request |
| Free Tier | 1M requests/mo | 100K requests/day | 1M requests/mo |

## Choosing a Platform

### Choose AWS Lambda if:
- You're already on AWS
- You need long-running functions (> 30s)
- You need AWS integrations (S3, SQS, etc.)
- You need VPC networking

### Choose Cloudflare Workers if:
- You need ultra-low latency globally
- You want zero cold starts
- You need edge caching
- You want simple deployment

### Choose Vercel if:
- You're deploying a full-stack app
- You need preview deployments
- You want integrated analytics
- You're already using Next.js

## Deployment Guides

Each subdirectory contains its own detailed README:

- [AWS Lambda Guide](./aws-lambda/README.md)
- [Cloudflare Workers Guide](./cloudflare-workers/README.md)
- [Vercel Edge Functions Guide](./vercel/README.md)

## Environment Variables

All deployments support the same environment variables:

### Required
- `NODE_ENV` - Environment (development/production)
- `LOG_LEVEL` - Logging level (debug/info/warn/error)

### Provider Configuration
- `MPESA_ENABLED` - Enable M-Pesa
- `MPESA_CONSUMER_KEY` - M-Pesa OAuth key
- `MPESA_CONSUMER_SECRET` - M-Pesa OAuth secret
- `PAYSTACK_ENABLED` - Enable Paystack
- `PAYSTACK_SECRET_KEY` - Paystack secret key
- `INTASEND_ENABLED` - Enable IntaSend
- `INTASEND_SECRET_KEY` - IntaSend secret key
- `MTN_MOMO_ENABLED` - Enable MTN MoMo
- `MTN_MOMO_API_KEY` - MTN MoMo API key
- `AIRTEL_MONEY_ENABLED` - Enable Airtel Money

### Security
- `ENCRYPTION_KEY` - Key for encrypting sensitive data
- `WEBHOOK_SECRET` - Secret for webhook validation
- `API_KEYS` - Comma-separated valid API keys

### Feature Flags
- `CACHE_ENABLED` - Enable caching
- `IDEMPOTENCY_ENABLED` - Enable idempotency
- `CIRCUIT_BREAKER_ENABLED` - Enable circuit breaker

## Common Issues

### AWS Lambda
**Cold start latency**: Use provisioned concurrency for production.
**Timeout**: Increase timeout in `template.yaml` (max 15 min).

### Cloudflare Workers
**Bundle size limit**: Keep under 1MB.
**KV eventual consistency**: Design for eventual consistency.

### Vercel
**Edge Middleware timeout**: Limited to 30s.
**KV connection**: Ensure KV is properly linked.

## Testing

Each deployment includes test configurations:

```bash
# AWS Lambda
npm run local        # SAM local
npm run invoke       # Invoke locally

# Cloudflare Workers
npm run dev          # Wrangler dev
npm run dev:remote   # Remote dev with real KV

# Vercel
vercel dev           # Local dev server
```

## Monitoring

### AWS Lambda
- CloudWatch Logs
- CloudWatch Metrics
- X-Ray tracing

### Cloudflare Workers
- Workers Analytics
- Real-time logs with `wrangler tail`
- Trace ID propagation

### Vercel
- Vercel Analytics
- Real-time logs
- Performance insights

## Security Considerations

1. **API Keys**: Store in secure secret management (AWS Secrets Manager, CF Workers secrets, Vercel env)
2. **CORS**: Configure allowed origins in deployment configs
3. **Rate Limiting**: Implemented at edge/middleware level
4. **Encryption**: Use `ENCRYPTION_KEY` for sensitive data

## Cost Optimization

### AWS Lambda
- Use Graviton2 (ARM) for 20% cost savings
- Enable provisioned concurrency for predictable latency
- Use DynamoDB on-demand for unpredictable traffic

### Cloudflare Workers
- Use Cache API for repeated lookups
- Minimize KV read/writes
- Bundle efficiently

### Vercel
- Use Edge Functions for API routes
- Cache aggressively
- Optimize function size

## Contributing

When adding new serverless platforms:

1. Create a new subdirectory with the platform name
2. Include a complete `README.md` with setup instructions
3. Add example environment files
4. Include deployment scripts where applicable
5. Update this main README

## License

MIT - See LICENSE in project root
