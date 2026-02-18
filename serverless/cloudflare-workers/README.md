# Africa Payments MCP - Cloudflare Workers

Edge-deployed MCP server running on Cloudflare's global network. Ultra-low latency for African payment operations.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Login to Cloudflare
npx wrangler login

# 3. Create KV namespaces
npx wrangler kv:namespace create "CACHE_KV"
npx wrangler kv:namespace create "API_KEYS_KV"
npx wrangler kv:namespace create "IDEMPOTENCY_KV"

# 4. Update wrangler.toml with namespace IDs

# 5. Set secrets
npx wrangler secret put MPESA_CONSUMER_KEY
npx wrangler secret put MPESA_CONSUMER_SECRET
npx wrangler secret put PAYSTACK_SECRET_KEY

# 6. Deploy
npm run deploy
```

## Features

- 🌍 **Global Edge Network** - Deployed to 300+ locations worldwide
- ⚡ **Ultra-Low Latency** - Sub-50ms response times
- 💾 **KV Storage** - Edge-cached configuration and API keys
- 🔐 **Idempotency** - Automatic deduplication at the edge
- 📊 **Analytics** - Built-in observability and logging
- 🔄 **Background Jobs** - Scheduled tasks via Cron Triggers

## Architecture

```
Client → Cloudflare Edge → Worker → Payment Provider API
              ↓
          KV Storage (Cache, Keys, Idempotency)
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/tools` | List available MCP tools |
| POST | `/invoke` | Execute MCP tool |
| POST | `/webhook/{provider}` | Receive provider webhooks |
| GET | `/metrics` | Service metrics |

## KV Storage Schema

### API Keys (`API_KEYS_KV`)

```json
{
  "apikey:{key}": {
    "tenantId": "tenant-123",
    "permissions": ["payments:read", "payments:write"],
    "active": true,
    "expiresAt": 1704067200000
  }
}
```

### Cache (`CACHE_KV`)

```json
{
  "tools:list": [...],
  "provider:{name}:token": "...",
  "webhook:{provider}:{timestamp}": {...}
}
```

### Idempotency (`IDEMPOTENCY_KV`)

```json
{
  "idempotency:{key}": {
    "status": "success",
    "data": {...}
  }
}
```

## Configuration

### Environment Variables

Set in `wrangler.toml` [vars] section:

```toml
[vars]
NODE_ENV = "production"
LOG_LEVEL = "info"
DEFAULT_CURRENCY = "KES"
DEFAULT_COUNTRY = "KE"
```

### Secrets

Set with `wrangler secret put`:

```bash
# M-Pesa
npx wrangler secret put MPESA_CONSUMER_KEY
npx wrangler secret put MPESA_CONSUMER_SECRET
npx wrangler secret put MPESA_PASSKEY

# Paystack
npx wrangler secret put PAYSTACK_SECRET_KEY
npx wrangler secret put PAYSTACK_PUBLIC_KEY

# IntaSend
npx wrangler secret put INTASEND_SECRET_KEY

# MTN MoMo
npx wrangler secret put MTN_MOMO_API_KEY
npx wrangler secret put MTN_MOMO_SUBSCRIPTION_KEY

# Airtel Money
npx wrangler secret put AIRTEL_MONEY_CLIENT_SECRET

# Security
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put WEBHOOK_SECRET
```

## Managing API Keys

### Add API Key

```bash
npx wrangler kv:key put --binding API_KEYS_KV "apikey:your-secure-key" '{
  "tenantId": "tenant-123",
  "permissions": ["payments:read", "payments:write"],
  "active": true
}'
```

### List API Keys

```bash
npx wrangler kv:key list --binding API_KEYS_KV
```

### Bulk Import

Create `seed-keys.json`:

```json
[
  {
    "key": "apikey:key-1",
    "value": "{\"tenantId\":\"tenant-1\",\"permissions\":[\"payments:read\"],\"active\":true}"
  },
  {
    "key": "apikey:key-2", 
    "value": "{\"tenantId\":\"tenant-2\",\"permissions\":[\"payments:read\",\"payments:write\"],\"active\":true}"
  }
]
```

```bash
npx wrangler kv:bulk put --binding API_KEYS_KV seed-keys.json
```

## Development

```bash
# Local development
npm run dev

# Remote development (uses actual KV)
npm run dev:remote

# Type check
npm run typecheck

# Run tests
npm run test
```

## Deployment

```bash
# Deploy to default environment
npm run deploy

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production
```

## Monitoring

### Real-time Logs

```bash
# Stream logs
npx wrangler tail

# Stream staging logs
npx wrangler tail --env staging
```

### Analytics

View metrics in Cloudflare Dashboard:
- Requests per minute
- Error rates
- CPU time
- Subrequests

## Advanced Configuration

### Custom Domains

```toml
[[routes]]
pattern = "payments.yourdomain.com"
custom_domain = true
```

### Rate Limiting

```toml
[[unsafe.bindings]]
name = "RATE_LIMITER"
type = "ratelimit"
namespace_id = "1001"
simple = { limit = 100, period = 60 }
```

### Cron Triggers

```toml
[triggers]
crons = ["*/5 * * * *", "0 0 * * *"]
```

## Performance Optimization

1. **Bundle Size**: Keep worker bundle under 1MB
2. **Cold Starts**: Minimal - Cloudflare Workers have no cold start
3. **Caching**: Aggressively cache tool lists and tokens
4. **Subrequests**: Minimize external API calls

## Troubleshooting

**Module Not Found:**
```bash
# Regenerate types
npm run cf-typegen
```

**KV Not Found:**
```bash
# Verify namespace ID in wrangler.toml
npx wrangler kv:namespace list
```

**Secret Not Set:**
```bash
# List secrets
npx wrangler secret list

# Set missing secret
npx wrangler secret put SECRET_NAME
```

## Pricing

Cloudflare Workers free tier includes:
- 100,000 requests/day
- 10ms CPU time per invocation
- 1GB KV storage

Paid plans offer:
- Unlimited requests
- 50ms CPU time
- 1GB+ KV storage
