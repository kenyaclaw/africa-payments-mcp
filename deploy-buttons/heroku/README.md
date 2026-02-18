# Deploy to Heroku

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

## One-Click Deploy

Click the button above to deploy Africa Payments MCP to Heroku instantly.

## Manual Setup

```bash
# 1. Create Heroku app
heroku create your-app-name

# 2. Add PostgreSQL
heroku addons:create heroku-postgresql:mini

# 3. Add Redis
heroku addons:create heroku-redis:mini

# 4. Set environment variables
heroku config:set NODE_ENV=production
heroku config:set LOG_LEVEL=info

# 5. Deploy
git push heroku main

# 6. Scale dynos
heroku ps:scale web=1
```

## Configuration

After deployment, configure payment providers:

```bash
# M-Pesa
heroku config:set MPESA_ENABLED=true
heroku config:set MPESA_CONSUMER_KEY=your_key
heroku config:set MPESA_CONSUMER_SECRET=your_secret
heroku config:set MPESA_PASSKEY=your_passkey
heroku config:set MPESA_SHORT_CODE=your_shortcode

# Paystack
heroku config:set PAYSTACK_ENABLED=true
heroku config:set PAYSTACK_SECRET_KEY=sk_test_...

# Generate API key for clients
heroku config:set API_KEYS="your-secure-api-key"
```

## Scaling

```bash
# Scale web dynos
heroku ps:scale web=2

# Scale worker dynos (for background jobs)
heroku ps:scale worker=1
```

## Logs

```bash
# Tail logs
heroku logs --tail

# View recent logs
heroku logs
```

## Database

```bash
# Open PostgreSQL console
heroku pg:psql

# Run migrations
heroku run npm run migrate

# Backup database
heroku pg:backups:capture
```
