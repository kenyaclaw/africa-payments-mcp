# Deployment Guide for Africa Payments MCP

Complete deployment options for Africa Payments MCP - from serverless functions to full infrastructure.

## Deployment Options

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SERVERLESS / EDGE                                │
├──────────────┬──────────────┬──────────────┬────────────────────────┤
│ AWS Lambda   │ Cloudflare   │ Vercel       │ Other FaaS             │
│              │ Workers      │ Edge         │                        │
├──────────────┴──────────────┴──────────────┴────────────────────────┤
│                    CONTAINER PLATFORMS                              │
├──────────────┬──────────────┬──────────────┬────────────────────────┤
│ AWS ECS      │ GCP Cloud    │ Azure        │ Hetzner Cloud          │
│ (Fargate)    │ Run          │ Container    │ (VMs + Docker)         │
│              │              │ Apps         │                        │
├──────────────┴──────────────┴──────────────┴────────────────────────┤
│                    PAAS / ONE-CLICK                                  │
├──────────────┬──────────────┬──────────────┬────────────────────────┤
│ Heroku       │ Railway      │ Render       │ DigitalOcean           │
│              │              │              │ App Platform           │
└──────────────┴──────────────┴──────────────┴────────────────────────┘
```

## Quick Deploy

### Serverless (Zero Cold Start)

| Platform | Deploy Command | Free Tier |
|----------|---------------|-----------|
| **Cloudflare Workers** | `cd serverless/cloudflare-workers && npm i && npx wrangler deploy` | 100K/day |
| **Vercel** | `cd serverless/vercel && vercel --prod` | 1M/mo |
| **AWS Lambda** | `cd serverless/aws-lambda && ./deploy.sh` | 1M/mo |

### PaaS (One-Click)

| Platform | Button |
|----------|--------|
| **Heroku** | [![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy) |
| **Railway** | [![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template) |
| **Render** | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy) |

### Infrastructure (Terraform)

| Provider | Command |
|----------|---------|
| **AWS** | `cd infrastructure/terraform-modules/aws && terraform apply` |
| **GCP** | `cd infrastructure/terraform-modules/gcp && terraform apply` |
| **Azure** | `cd infrastructure/terraform-modules/azure && terraform apply` |
| **Hetzner** | `cd infrastructure/terraform-modules/hetzner && terraform apply` |

## Directory Structure

```
africa-payments-mcp/
├── serverless/
│   ├── aws-lambda/          # AWS Lambda + API Gateway
│   ├── cloudflare-workers/  # Cloudflare Workers (Edge)
│   ├── vercel/              # Vercel Edge Functions
│   └── README.md            # Serverless comparison & guide
├── infrastructure/
│   └── terraform-modules/
│       ├── aws/             # ECS, RDS, ElastiCache
│       ├── gcp/             # Cloud Run, Cloud SQL
│       ├── azure/           # Container Apps, PostgreSQL
│       ├── hetzner/         # VMs, Load Balancer
│       └── README.md        # IaC comparison & guide
├── deploy-buttons/
│   ├── heroku/              # Heroku deployment
│   ├── railway/             # Railway deployment
│   ├── render/              # Render deployment
│   └── README.md            # PaaS comparison
└── DEPLOY.md                # This file
```

## Choosing a Deployment Method

### Decision Tree

```
Need sub-100ms latency globally?
├── YES → Cloudflare Workers or Vercel Edge
└── NO → Need managed database?
    ├── YES → PaaS (Heroku/Railway/Render)
    └── NO → Need cost optimization?
        ├── YES → Hetzner Cloud
        └── NO → AWS/GCP/Azure
```

### By Use Case

| Use Case | Recommended Platform | Why |
|----------|---------------------|-----|
| **Startup / MVP** | Heroku, Railway, Render | Fastest time to market |
| **Global API** | Cloudflare Workers | Edge-deployed, 300+ locations |
| **Enterprise** | AWS ECS or GCP Cloud Run | Full control, compliance |
| **Cost-conscious** | Hetzner Cloud | 10x cheaper than AWS |
| **Next.js app** | Vercel | Native integration |
| **AI/ML workloads** | AWS Lambda | GPU support |

## Environment Variables

All deployments require these environment variables:

### Required
```bash
NODE_ENV=production
LOG_LEVEL=info
```

### Payment Providers (enable as needed)
```bash
# M-Pesa
MPESA_ENABLED=true
MPESA_CONSUMER_KEY=your_key
MPESA_CONSUMER_SECRET=your_secret
MPESA_PASSKEY=your_passkey
MPESA_SHORT_CODE=174379

# Paystack
PAYSTACK_ENABLED=true
PAYSTACK_SECRET_KEY=sk_test_...

# IntaSend
INTASEND_ENABLED=true
INTASEND_SECRET_KEY=...

# MTN MoMo
MTN_MOMO_ENABLED=true
MTN_MOMO_API_KEY=...

# Airtel Money
AIRTEL_MONEY_ENABLED=true
AIRTEL_MONEY_CLIENT_SECRET=...
```

### Security
```bash
ENCRYPTION_KEY=your_32_char_key
WEBHOOK_SECRET=your_webhook_secret
API_KEYS="api-key-1,api-key-2"
```

## Deployment Steps

### 1. Cloudflare Workers (Recommended for APIs)

```bash
cd serverless/cloudflare-workers

# Install dependencies
npm install

# Login to Cloudflare
npx wrangler login

# Create KV namespaces
npx wrangler kv:namespace create "CACHE_KV"
npx wrangler kv:namespace create "API_KEYS_KV"
npx wrangler kv:namespace create "IDEMPOTENCY_KV"

# Update wrangler.toml with namespace IDs

# Set secrets
npx wrangler secret put MPESA_CONSUMER_KEY
npx wrangler secret put PAYSTACK_SECRET_KEY

# Deploy
npm run deploy
```

### 2. Vercel (Recommended for Full-Stack)

```bash
cd serverless/vercel

# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link and deploy
vercel --prod

# Set environment variables
vercel env add MPESA_CONSUMER_KEY
vercel env add PAYSTACK_SECRET_KEY
```

### 3. AWS Lambda (Recommended for AWS Ecosystem)

```bash
cd serverless/aws-lambda

# Install dependencies
npm install

# Deploy with SAM
./deploy.sh production --guided

# Or deploy automatically
./deploy.sh production
```

### 4. Heroku (Recommended for Simplicity)

```bash
# Click the Heroku Deploy button
# Or manually:

heroku create your-app-name
heroku addons:create heroku-postgresql:mini
heroku addons:create heroku-redis:mini
heroku config:set MPESA_ENABLED=true ...
git push heroku main
```

### 5. AWS ECS (Recommended for Scale)

```bash
cd infrastructure/terraform-modules/aws

# Configure backend
cat > backend.tf << 'EOF'
terraform {
  backend "s3" {
    bucket = "your-terraform-state"
    key    = "africa-payments/production"
    region = "us-east-1"
  }
}
EOF

# Deploy
terraform init
terraform apply
```

## Monitoring

### Serverless

| Platform | Monitoring Tool |
|----------|----------------|
| Cloudflare Workers | `wrangler tail`, Workers Analytics |
| Vercel | Vercel Analytics, Real-time logs |
| AWS Lambda | CloudWatch Logs, X-Ray |

### Infrastructure

| Platform | Monitoring Tool |
|----------|----------------|
| AWS ECS | CloudWatch Container Insights |
| GCP Cloud Run | Cloud Monitoring |
| Azure Container Apps | Application Insights |
| Hetzner | Basic metrics, need external |

### PaaS

| Platform | Monitoring Tool |
|----------|----------------|
| Heroku | Papertrail, Metrics |
| Railway | Built-in logs and metrics |
| Render | Built-in logs and metrics |

## Security Checklist

- [ ] API Keys stored in secret management
- [ ] Webhook secrets configured
- [ ] HTTPS enforced
- [ ] CORS configured appropriately
- [ ] Rate limiting enabled
- [ ] Encryption key set
- [ ] Database encrypted at rest
- [ ] Backups configured
- [ ] Access logs enabled

## Cost Estimation

### Serverless (1M requests/month)

| Platform | Estimated Cost |
|----------|---------------|
| Cloudflare Workers | Free |
| Vercel | Free |
| AWS Lambda | ~$2 |

### PaaS (Standard Usage)

| Platform | Estimated Cost |
|----------|---------------|
| Heroku | $7-50/mo |
| Railway | $5-25/mo |
| Render | Free - $25/mo |

### Infrastructure (Production)

| Platform | Estimated Cost |
|----------|---------------|
| AWS ECS | $175-250/mo |
| GCP Cloud Run | $100-150/mo |
| Azure | $115-150/mo |
| Hetzner | $36/mo |

## Troubleshooting

### Common Issues

**Build fails**: Check Node.js version (>= 18)
**Database connection refused**: Check security groups/firewall
**API key invalid**: Verify key in KV/database
**Timeout errors**: Increase function timeout settings

### Getting Help

1. Check the specific deployment README in each directory
2. Review platform documentation
3. Open an issue on GitHub

## Contributing

When adding new deployment options:

1. Create a new directory under appropriate category
2. Include a complete README with setup instructions
3. Add environment variable examples
4. Include deployment scripts where applicable
5. Update this main DEPLOY.md

## License

MIT - See LICENSE in project root
