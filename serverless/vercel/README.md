# Africa Payments MCP - Vercel Edge Functions

Edge-deployed MCP server running on Vercel's global network with Edge Middleware for security and rate limiting.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install Vercel CLI
npm install -g vercel

# 3. Login to Vercel
vercel login

# 4. Set environment variables
vercel env add MPESA_CONSUMER_KEY
vercel env add MPESA_CONSUMER_SECRET
vercel env add PAYSTACK_SECRET_KEY

# 5. Deploy
vercel --prod
```

## Features

- 🌍 **Global Edge Network** - Deployed to 100+ edge locations
- ⚡ **Edge Middleware** - Authentication and rate limiting at the edge
- 💾 **Vercel KV** - Redis-compatible storage for idempotency
- 🔧 **Edge Config** - Low-latency configuration store
- 🔐 **Security Headers** - Built-in security hardening
- 📊 **Analytics** - Built-in observability

## Architecture

```
Client → Vercel Edge → Middleware → Edge Function → Payment Provider
                        ↓
                   Edge Config (API Keys)
                   Vercel KV (Idempotency)
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (no auth) |
| GET | `/api/payments/health` | Health check (via middleware) |
| GET | `/api/payments/tools` | List MCP tools |
| POST | `/api/payments/invoke` | Execute MCP tool |
| POST | `/api/payments/webhook/{provider}` | Receive webhooks |

## Middleware Features

The Edge Middleware (`middleware.ts`) provides:

- ✅ **CORS handling**
- ✅ **IP allowlisting**
- ✅ **Rate limiting by IP**
- ✅ **Rate limiting by API Key**
- ✅ **API Key validation**
- ✅ **Security headers**

## Configuration

### Environment Variables

Set via `vercel env add` or Vercel Dashboard:

```bash
# Required
vercel env add NODE_ENV production
vercel env add LOG_LEVEL info

# Provider Configuration
vercel env add MPESA_ENABLED true
vercel env add MPESA_CONSUMER_KEY
vercel env add MPESA_CONSUMER_SECRET

vercel env add PAYSTACK_ENABLED true
vercel env add PAYSTACK_SECRET_KEY

# Security
vercel env add API_KEYS "key1,key2,key3"
vercel env add ALLOWED_IPS "1.2.3.4,5.6.7.8"
vercel env add RATE_LIMIT_REQUESTS 100
vercel env add RATE_LIMIT_WINDOW 60000

# Vercel KV (automatically set if you link KV)
# KV_REST_API_URL
# KV_REST_API_TOKEN

# Edge Config (automatically set if you link Edge Config)
# EDGE_CONFIG
```

### Edge Config for API Keys

1. Create Edge Config store:
```bash
vercel edge-config add-key my-api-keys apikey:your-key '{"tenantId":"tenant-1","permissions":["payments:read"],"active":true}'
```

2. Link to project:
```bash
vercel link
```

3. Select Edge Config store when prompted.

## Vercel KV Setup

1. Create KV database:
```bash
vercel kv create my-payments-kv
```

2. Link to project:
```bash
vercel link
```

3. Select KV database when prompted.

## Local Development

```bash
# Pull environment variables
vercel env pull .env.local

# Run development server
npm run dev

# Test endpoints
curl http://localhost:3000/api/health
curl -H "X-API-Key: your-key" http://localhost:3000/api/payments/tools
```

## Deployment

```bash
# Preview deployment
vercel

# Production deployment
vercel --prod

# Or use npm scripts
npm run deploy
npm run deploy:prod
```

## Regional Deployment

Configure regions in `vercel.json`:

```json
{
  "regions": ["iad1", "cdg1", "bom1", "hkg1"]
}
```

Available regions:
- `iad1` - US East (Washington, D.C.)
- `cdg1` - EU West (Paris)
- `bom1` - India West (Mumbai)
- `hkg1` - Asia East (Hong Kong)
- `syd1` - Oceania (Sydney)
- `gru1` - South America (São Paulo)

## Cron Jobs

Configure scheduled tasks in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/payments/cleanup",
      "schedule": "0 0 * * *"
    }
  ]
}
```

## Monitoring

### Vercel Dashboard

- Function invocations
- Error rates
- Duration
- Cold starts

### Logs

```bash
# Stream logs
vercel logs --json

# Follow logs
vercel logs --follow
```

## Security Best Practices

1. **Use Edge Config for API Keys** - Separate from code
2. **Enable IP Allowlisting** - Restrict access by IP
3. **Set Rate Limits** - Prevent abuse
4. **Use Strong API Keys** - Minimum 32 characters
5. **Enable HTTPS Only** - Vercel handles this automatically

## Troubleshooting

**Build Errors:**
```bash
# Clear cache
rm -rf .next
npm run build
```

**Environment Variables Not Loading:**
```bash
# Re-pull environment
vercel env pull .env.local --yes
```

**KV Connection Errors:**
```bash
# Verify KV is linked
vercel integrations
```

## Pricing

Vercel free tier includes:
- 100GB bandwidth
- 1000 edge function invocations/day
- 1000 KV reads/day
- 100 KV writes/day

Paid plans offer:
- Unlimited invocations
- Higher KV limits
- Priority support

## Additional Resources

- [Vercel Edge Functions](https://vercel.com/docs/functions/edge-functions)
- [Vercel KV](https://vercel.com/docs/storage/vercel-kv)
- [Vercel Edge Config](https://vercel.com/docs/storage/edge-config)
- [Edge Middleware](https://vercel.com/docs/functions/edge-middleware)
