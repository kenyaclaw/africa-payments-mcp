# Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/your-template-id)

## One-Click Deploy

Click the button above to deploy Africa Payments MCP to Railway instantly.

## Manual Setup

### Using Railway CLI

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Create project
railway init

# 4. Add PostgreSQL
railway add --database postgres

# 5. Add Redis
railway add --database redis

# 6. Deploy
railway up

# 7. Set environment variables
railway variables set NODE_ENV=production
railway variables set LOG_LEVEL=info
```

### Using Railway Dashboard

1. Fork/clone this repository
2. Create a new project in Railway
3. Connect your GitHub repository
4. Add PostgreSQL and Redis plugins
5. Configure environment variables
6. Deploy

## Configuration

Set environment variables in Railway Dashboard or via CLI:

```bash
# Payment Providers
railway variables set MPESA_ENABLED=true
railway variables set MPESA_CONSUMER_KEY=your_key
railway variables set MPESA_CONSUMER_SECRET=your_secret

railway variables set PAYSTACK_ENABLED=true
railway variables set PAYSTACK_SECRET_KEY=sk_test_...

# Security
railway variables set API_KEYS="your-secure-api-key"
railway variables set ENCRYPTION_KEY="your-encryption-key"
```

## Features on Railway

- 🚀 **Auto-deploy** from GitHub
- 📊 **Metrics** dashboard
- 📝 **Logs** streaming
- 🔒 **Encrypted** environment variables
- 💾 **Persistent** volumes (optional)
- 🌐 **Custom domains**

## Scaling

Railway automatically scales based on traffic. You can also configure:

- Number of replicas
- CPU/RAM limits
- Auto-sleep settings

## Local Development with Railway

```bash
# Link local project to Railway
railway link

# Run locally with Railway environment
railway run npm run dev
```
