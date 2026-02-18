# One-Click Deploy Buttons

Deploy Africa Payments MCP to popular PaaS platforms with a single click.

## Available Platforms

| Platform | Button | Free Tier |
|----------|--------|-----------|
| Heroku | [![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/kenyaclaw/africa-payments-mcp) | 550 dyno hours/mo |
| Railway | [![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template) | $5 credit/mo |
| Render | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy) | Always free |

## Quick Start

### Heroku

1. Click the **Deploy to Heroku** button
2. Fill in environment variables
3. Click **Deploy app**
4. Access your app at `https://your-app-name.herokuapp.com`

### Railway

1. Click the **Deploy on Railway** button
2. Connect your GitHub account
3. Add required environment variables
4. Deploy automatically

### Render

1. Click the **Deploy to Render** button
2. Connect your GitHub account
3. Configure environment variables
4. Deploy using the blueprint

## Platform Comparison

| Feature | Heroku | Railway | Render |
|---------|--------|---------|--------|
| Free Tier | 550 hrs/mo | $5 credit | Unlimited |
| Sleep Mode | After 30 min | Never | After 15 min |
| Custom Domain | Yes | Yes | Yes |
| SSL Included | Yes | Yes | Yes |
| PostgreSQL | Yes | Yes | Yes |
| Redis | Yes | Yes | Yes |
| Auto Deploy | Yes | Yes | Yes |
| Preview Envs | No | Yes | Yes |

## Post-Deployment Configuration

### Setting Environment Variables

#### Heroku
```bash
heroku config:set KEY=value -a your-app-name
```

#### Railway
```bash
railway variables set KEY=value
```

#### Render
Use the dashboard: Settings → Environment Variables

### Adding Payment Providers

After deployment, add your payment provider credentials:

```bash
# M-Pesa
KEY=MPESA_CONSUMER_KEY VALUE=your_key
KEY=MPESA_CONSUMER_SECRET VALUE=your_secret
KEY=MPESA_ENABLED VALUE=true

# Paystack
KEY=PAYSTACK_SECRET_KEY VALUE=sk_test_...
KEY=PAYSTACK_ENABLED VALUE=true
```

### Generating API Keys

Generate a secure API key for client access:

```bash
# On macOS/Linux
API_KEY=$(openssl rand -hex 32)

# Set the API key
heroku config:set API_KEYS="$API_KEY" -a your-app-name
```

## Health Check

After deployment, verify your installation:

```bash
curl https://your-app-domain/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "africa-payments-mcp",
  "version": "0.1.0"
}
```

## Troubleshooting

### Build Failures

**Heroku**: Check buildpack configuration in `app.json`
**Railway**: Verify `railway.json` and `nixpacks.toml`
**Render**: Check `render.yaml` syntax

### Application Errors

Check platform-specific logs:

```bash
# Heroku
heroku logs --tail -a your-app-name

# Railway
railway logs

# Render
# Use the Dashboard → Logs
```

### Database Connection Issues

Verify `DATABASE_URL` is set correctly:

```bash
# Heroku
heroku config:get DATABASE_URL -a your-app-name

# Railway
railway variables get DATABASE_URL

# Render
# Check in Dashboard → Environment Variables
```

## Upgrading

### Heroku
```bash
git push heroku main
```

### Railway
```bash
railway up
```

### Render
Automatic on git push (or manual deploy in dashboard)

## Security Best Practices

1. **Rotate secrets regularly**
2. **Use strong API keys** (32+ characters)
3. **Enable 2FA** on your platform accounts
4. **Use private repositories** for sensitive configs
5. **Review access logs** regularly

## Support

For platform-specific issues:
- **Heroku**: https://help.heroku.com
- **Railway**: https://railway.app/help
- **Render**: https://render.com/docs

For application issues, open an issue on GitHub.
