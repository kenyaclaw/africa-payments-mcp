# Africa Payments MCP - Node.js Example

This example demonstrates how to use the Africa Payments MCP SDK in a Node.js/Express application.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create configuration file:**
   ```bash
   cp config.example.json config.json
   ```

3. **Edit `config.json`** with your API credentials.

4. **Set up environment variables (optional):**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

## Running the Application

### Development mode:
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

## API Endpoints

### Send Money
```bash
curl -X POST http://localhost:3000/api/payments/send \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "254712345678",
    "amount": 1000,
    "provider": "mpesa"
  }'
```

### Request Payment (STK Push)
```bash
curl -X POST http://localhost:3000/api/payments/request \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "254712345678",
    "amount": 500,
    "accountReference": "INV001",
    "description": "Payment for invoice #001"
  }'
```

### Verify Transaction
```bash
curl http://localhost:3000/api/payments/verify/MPESA_123456?provider=mpesa
```

### Check Balance
```bash
curl http://localhost:3000/api/balance/mpesa
```

### Process Refund
```bash
curl -X POST http://localhost:3000/api/payments/refund \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "PS_abc123",
    "provider": "paystack",
    "amount": 5000
  }'
```

### Get Transaction History
```bash
curl "http://localhost:3000/api/payments/history?provider=paystack&startDate=2024-01-01"
```

### Initialize Paystack Payment
```bash
curl -X POST http://localhost:3000/api/payments/paystack/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "amount": 5000,
    "currency": "NGN",
    "callbackUrl": "https://yourapp.com/callback"
  }'
```

## Webhook Setup

Configure webhooks in your payment provider dashboard to point to:

```
https://your-domain.com/webhooks/{provider}
```

Examples:
- M-Pesa: `https://your-domain.com/webhooks/mpesa`
- Paystack: `https://your-domain.com/webhooks/paystack`

## Project Structure

```
.
├── index.js           # Main application entry
├── package.json       # Dependencies
├── config.json        # Payment provider config (git-ignored)
├── .env               # Environment variables (git-ignored)
└── README.md          # This file
```

## Next Steps

- Add database integration for transaction persistence
- Implement user authentication
- Add rate limiting for API endpoints
- Set up proper error monitoring (Sentry, etc.)
- Add request validation middleware
- Implement idempotency keys for safe retries
