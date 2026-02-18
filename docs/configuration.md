# Configuration

Africa Payments MCP is highly configurable to support multiple providers and environments.

## Configuration Methods

### 1. Environment Variables (Recommended)

Set environment variables for simple configuration:

```bash
# M-Pesa
export MPESA_CONSUMER_KEY=your_consumer_key
export MPESA_CONSUMER_SECRET=your_consumer_secret
export MPESA_PASSKEY=your_passkey
export MPESA_SHORTCODE=your_shortcode

# Paystack
export PAYSTACK_SECRET_KEY=sk_live_your_secret_key
export PAYSTACK_PUBLIC_KEY=pk_live_your_public_key
```

### 2. Configuration File

Create a `africa-payments.config.js` or `africa-payments.config.json` file:

```javascript
// africa-payments.config.js
export default {
  providers: {
    mpesa: {
      consumerKey: process.env.MPESA_CONSUMER_KEY,
      consumerSecret: process.env.MPESA_CONSUMER_SECRET,
      passkey: process.env.MPESA_PASSKEY,
      shortcode: process.env.MPESA_SHORTCODE,
      environment: 'production' // or 'sandbox'
    },
    paystack: {
      secretKey: process.env.PAYSTACK_SECRET_KEY,
      publicKey: process.env.PAYSTACK_PUBLIC_KEY
    }
  },
  webhooks: {
    secret: process.env.WEBHOOK_SECRET,
    url: 'https://yourapp.com/webhooks'
  },
  defaults: {
    currency: 'KES',
    provider: 'mpesa'
  }
};
```

### 3. Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "npx",
      "args": ["-y", "@africa-payments/mcp-server", "--config", "/path/to/config.js"],
      "env": {
        "MPESA_CONSUMER_KEY": "your_consumer_key",
        "MPESA_CONSUMER_SECRET": "your_consumer_secret"
      }
    }
  }
}
```

## Provider Configuration

### M-Pesa

| Variable | Required | Description |
|----------|----------|-------------|
| `MPESA_CONSUMER_KEY` | ✅ | Your Daraja API consumer key |
| `MPESA_CONSUMER_SECRET` | ✅ | Your Daraja API consumer secret |
| `MPESA_PASSKEY` | ✅ | Lipa na M-Pesa passkey |
| `MPESA_SHORTCODE` | ✅ | Your M-Pesa shortcode |
| `MPESA_ENVIRONMENT` | ❌ | `sandbox` or `production` (default: sandbox) |

```javascript
{
  mpesa: {
    consumerKey: 'your_consumer_key',
    consumerSecret: 'your_consumer_secret',
    passkey: 'your_passkey',
    shortcode: '174379',
    environment: 'production',
    // Optional: Custom callback URLs
    callbackUrl: 'https://yourapp.com/webhooks/mpesa',
    timeoutUrl: 'https://yourapp.com/webhooks/mpesa/timeout'
  }
}
```

### Paystack

| Variable | Required | Description |
|----------|----------|-------------|
| `PAYSTACK_SECRET_KEY` | ✅ | Your Paystack secret key |
| `PAYSTACK_PUBLIC_KEY` | ❌ | Your Paystack public key (for client-side) |

```javascript
{
  paystack: {
    secretKey: 'sk_live_xxxxxxxxxxxxxxxx',
    publicKey: 'pk_live_xxxxxxxxxxxxxxxx',
    // Optional: Split payment configuration
    subaccount: 'ACCT_xxxxxxxxxxxxx',
    transactionCharge: 100 // in kobo
  }
}
```

### MTN MoMo

| Variable | Required | Description |
|----------|----------|-------------|
| `MTN_MOMO_SUBSCRIPTION_KEY` | ✅ | Your MTN API subscription key |
| `MTN_MOMO_API_USER` | ✅ | Your API user ID |
| `MTN_MOMO_API_KEY` | ✅ | Your API key |
| `MTN_MOMO_ENVIRONMENT` | ❌ | `sandbox` or `production` |

```javascript
{
  mtnMomo: {
    subscriptionKey: 'your_subscription_key',
    apiUser: 'your_api_user',
    apiKey: 'your_api_key',
    environment: 'production',
    targetEnvironment: 'mtnghana', // Country-specific
    callbackUrl: 'https://yourapp.com/webhooks/momo'
  }
}
```

### IntaSend

| Variable | Required | Description |
|----------|----------|-------------|
| `INTASEND_PUBLIC_KEY` | ✅ | Your IntaSend public key |
| `INTASEND_SECRET_KEY` | ✅ | Your IntaSend secret key |

```javascript
{
  intasend: {
    publicKey: 'ISPubKey_test_xxxxxxxx',
    secretKey: 'ISSecretKey_test_xxxxxxxx',
    testMode: false
  }
}
```

### Airtel Money

| Variable | Required | Description |
|----------|----------|-------------|
| `AIRTEL_MONEY_CLIENT_ID` | ✅ | Your Airtel Money client ID |
| `AIRTEL_MONEY_CLIENT_SECRET` | ✅ | Your Airtel Money client secret |

```javascript
{
  airtelMoney: {
    clientId: 'your_client_id',
    clientSecret: 'your_client_secret',
    environment: 'production',
    countryCode: 'KE' // KE, UG, TZ, etc.
  }
}
```

## Advanced Configuration

### Multiple Provider Setup

Configure multiple providers and let the system route intelligently:

```javascript
export default {
  providers: {
    mpesa: { /* ... */ },
    paystack: { /* ... */ },
    mtnMomo: { /* ... */ }
  },
  routing: {
    // Route by country
    'KE': 'mpesa',
    'NG': 'paystack',
    'GH': 'paystack',
    'TZ': 'mpesa',
    'UG': 'mtnMomo',
    // Default provider
    default: 'mpesa'
  }
};
```

### Webhook Configuration

```javascript
{
  webhooks: {
    // Global webhook secret for signature verification
    secret: process.env.WEBHOOK_SECRET,
    
    // Provider-specific webhook settings
    providers: {
      mpesa: {
        path: '/webhooks/mpesa',
        verification: 'signature'
      },
      paystack: {
        path: '/webhooks/paystack',
        verification: 'signature'
      }
    },
    
    // Retry configuration
    retries: 3,
    retryDelay: 5000 // milliseconds
  }
}
```

### Logging Configuration

```javascript
{
  logging: {
    level: 'info', // debug, info, warn, error
    format: 'json', // json or pretty
    destination: 'stdout', // stdout, stderr, or file path
    
    // Redact sensitive fields
    redact: ['password', 'secret', 'token', 'authorization']
  }
}
```

### Timeout and Retry Settings

```javascript
{
  http: {
    timeout: 30000, // 30 seconds
    retries: 3,
    retryDelay: 1000,
    maxRetryDelay: 10000
  }
}
```

## Environment-Specific Configuration

### Development

```javascript
// config.development.js
export default {
  providers: {
    mpesa: {
      environment: 'sandbox',
      // Sandbox credentials
      consumerKey: 'test_consumer_key',
      consumerSecret: 'test_consumer_secret'
    }
  },
  logging: {
    level: 'debug'
  }
};
```

### Production

```javascript
// config.production.js
export default {
  providers: {
    mpesa: {
      environment: 'production',
      // Production credentials from env vars
      consumerKey: process.env.MPESA_CONSUMER_KEY,
      consumerSecret: process.env.MPESA_CONSUMER_SECRET
    }
  },
  logging: {
    level: 'warn',
    format: 'json'
  },
  webhooks: {
    secret: process.env.WEBHOOK_SECRET
  }
};
```

## Validation

Validate your configuration before starting:

```bash
npx @africa-payments/mcp-server --validate-config
```

This will check:
- Required fields are present
- Credentials format is valid
- Webhook URLs are accessible
- Provider connections work

## Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `providers` | Object | `{}` | Provider configurations |
| `routing` | Object | `{}` | Smart routing rules |
| `webhooks` | Object | `{}` | Webhook settings |
| `logging` | Object | `{ level: 'info' }` | Logging configuration |
| `http` | Object | `{ timeout: 30000 }` | HTTP client settings |
| `defaults` | Object | `{}` | Default values |
