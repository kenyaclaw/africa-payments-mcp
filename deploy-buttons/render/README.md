# Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

## One-Click Deploy

Click the button above to deploy Africa Payments MCP to Render using the blueprint.

## Manual Setup

### Using Render Dashboard

1. Create a new **Web Service**
2. Connect your GitHub/GitLab repository
3. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Add PostgreSQL database
5. Add Redis instance
6. Configure environment variables
7. Deploy

### Using Render CLI

```bash
# Install Render CLI
curl -fsSL https://render.com/static/cli/install.sh | bash

# Login
render login

# Deploy from blueprint
render blueprint apply
```

## Configuration

Configure environment variables in the Render Dashboard:

```
NODE_ENV=production
LOG_LEVEL=info
DEFAULT_CURRENCY=KES
DEFAULT_COUNTRY=KE

# M-Pesa
MPESA_ENABLED=true
MPESA_CONSUMER_KEY=your_key
MPESA_CONSUMER_SECRET=your_secret
MPESA_PASSKEY=your_passkey

# Paystack
PAYSTACK_ENABLED=true
PAYSTACK_SECRET_KEY=sk_test_...

# Security
API_KEYS=your-secure-api-key
ENCRYPTION_KEY=your-encryption-key
```

## Blueprint Features

The `render.yaml` blueprint includes:

- 🌐 **Web Service** - Main API server
- 👷 **Worker** - Background job processor
- 🗄️ **PostgreSQL** - Primary database
- ⚡ **Redis** - Caching and sessions

## Scaling

Upgrade your plan in the Render Dashboard:

| Plan | CPU | RAM | Price |
|------|-----|-----|-------|
| Free | Shared | 512 MB | Free |
| Starter | 1 | 2 GB | $7/mo |
| Standard | 2 | 4 GB | $25/mo |
| Pro | 4 | 8 GB | $85/mo |

## Custom Domains

Add a custom domain in the Render Dashboard:

1. Go to Settings → Custom Domains
2. Add your domain
3. Configure DNS records as instructed
4. SSL certificate is auto-provisioned

## Monitoring

- **Logs**: Available in real-time in the Dashboard
- **Metrics**: CPU, memory, and request metrics
- **Alerts**: Configure email/webhook alerts
