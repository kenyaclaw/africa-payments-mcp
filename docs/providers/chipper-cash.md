# Chipper Cash

Chipper Cash is a pan-African fintech platform offering cross-border P2P payments and business payment solutions.

## Supported Countries

| Country | Code | Status |
|---------|------|--------|
| 🇳🇬 Nigeria | NG | ✅ Available |
| 🇬🇭 Ghana | GH | ✅ Available |
| 🇰🇪 Kenya | KE | ✅ Available |
| 🇺🇬 Uganda | UG | ✅ Available |
| 🇿🇦 South Africa | ZA | ✅ Available |
| 🇬🇧 United Kingdom | GB | ✅ Available |
| 🇺🇸 United States | US | ✅ Available |

## Features

- **Instant P2P Transfers**: Send money to any Chipper Cash user instantly
- **Cross-Border Payments**: Transfer between different African countries
- **Business Payments**: Accept payments from customers
- **Payment Requests**: Request money from other users
- **Multi-Currency**: Support for local and international currencies

## Setup Instructions

### 1. Create Chipper Cash Business Account

1. Download the Chipper Cash app or visit [chippercash.com](https://chippercash.com)
2. Register for a business account
3. Complete KYC verification
4. Apply for API access

### 2. Get Your API Credentials

After approval, you'll receive:

- **API Key**
- **API Secret**
- **Webhook Secret** (optional, for verification)

### 3. Configure Webhooks

Set up webhooks in your Chipper Cash dashboard to receive payment notifications.

## Required Credentials

| Variable | Sandbox | Production | Description |
|----------|---------|------------|-------------|
| `CHIPPER_CASH_API_KEY` | ✅ | ✅ | API key |
| `CHIPPER_CASH_API_SECRET` | ✅ | ✅ | API secret |
| `CHIPPER_CASH_WEBHOOK_SECRET` | Optional | Optional | Webhook signature secret |

## Sample Configuration

### Environment Variables

```bash
CHIPPER_CASH_API_KEY=your_api_key
CHIPPER_CASH_API_SECRET=your_api_secret
CHIPPER_CASH_WEBHOOK_SECRET=your_webhook_secret
CHIPPER_CASH_ENVIRONMENT=sandbox
```

### JavaScript Configuration

```javascript
{
  chipper_cash: {
    // Required
    apiKey: process.env.CHIPPER_CASH_API_KEY,
    apiSecret: process.env.CHIPPER_CASH_API_SECRET,
    
    // Optional
    environment: 'production', // or 'sandbox'
    timeoutMs: 30000,
    retryAttempts: 3,
  }
}
```

## API Operations

### Send Money (Transfer)

Send money to another Chipper Cash user by phone, tag, or email:

```typescript
const result = await client.callTool('chipper_cash_send', {
  recipientPhone: '+254712345678',
  recipientName: 'John Doe',
  amount: 5000,
  currency: 'KES',
  description: 'Payment for services',
  metadata: { orderId: 'ORDER-123' }
});
```

Or using Chipper Tag:

```typescript
const result = await client.callTool('chipper_cash_send', {
  recipientTag: 'johndoe',
  amount: 10000,
  currency: 'NGN',
  description: 'Payment for Order 123'
});
```

### Request Payment

Request payment from another Chipper Cash user:

```typescript
const result = await client.callTool('chipper_cash_request', {
  customerPhone: '+2348012345678',
  amount: 15000,
  currency: 'NGN',
  description: 'Invoice #123',
  expiryMinutes: 1440, // 24 hours
  metadata: { invoiceId: 'INV-123' }
});
```

### Check Transaction Status

```typescript
const status = await client.callTool('chipper_cash_status', {
  transactionId: 'trf_123456'
});
```

### Get Balance

```typescript
const balance = await client.callTool('chipper_cash_balance', {});
```

### Get Profile

```typescript
const profile = await client.callTool('chipper_cash_profile', {});
```

## Webhooks

Chipper Cash sends webhook notifications for various events:

### Event Types

| Event | Description |
|-------|-------------|
| `transfer.completed` | Transfer successfully completed |
| `transfer.failed` | Transfer failed |
| `payment_request.paid` | Payment request was paid |
| `payment_request.expired` | Payment request expired |
| `refund.completed` | Refund processed |
| `refund.failed` | Refund failed |

### Webhook Payload Example

```json
{
  "event": "transfer.completed",
  "data": {
    "id": "trf_123456",
    "status": "completed",
    "amount": 5000,
    "currency": "KES",
    "sender": {
      "id": "user_sender",
      "tag": "sender",
      "displayName": "Sender Name"
    },
    "recipient": {
      "id": "user_recipient",
      "tag": "recipient",
      "displayName": "Recipient Name",
      "phone": "+254712345678"
    },
    "description": "Payment for services",
    "createdAt": "2026-01-15T12:00:00Z",
    "completedAt": "2026-01-15T12:00:00Z"
  },
  "timestamp": "2026-01-15T12:00:00Z",
  "signature": "..."
}
```

### Webhook Security

Verify webhook authenticity using HMAC-SHA256:

```typescript
const isValid = await client.callTool('chipper_cash_verify_webhook', {
  signature: req.headers['x-chipper-signature'],
  payload: req.body
});
```

## User Identification

Chipper Cash supports multiple ways to identify users:

| Method | Format | Example |
|--------|--------|---------|
| Phone Number | +[country][number] | +254712345678 |
| Chipper Tag | $[username] | $johndoe |
| Email | [user@domain.com] | john@example.com |
| User ID | UUID | user_abc123 |

## Phone Number Formats

| Country | Format | Example |
|---------|--------|---------|
| Nigeria | 23480XXXXXXXX | 2348012345678 |
| Ghana | 2335XXXXXXXX | 233501234567 |
| Kenya | 2547XXXXXXXX | 254712345678 |
| Uganda | 2567XXXXXXXX | 256712345678 |
| South Africa | 277XXXXXXXX | 27711234567 |
| UK | 447XXXXXXXX | 447912345678 |
| US | 1XXXXXXXXXX | 15551234567 |

## Currency Support

| Currency | Code | Available In |
|----------|------|--------------|
| Nigerian Naira | NGN | Nigeria |
| Ghana Cedi | GHS | Ghana |
| Kenyan Shilling | KES | Kenya |
| Ugandan Shilling | UGX | Uganda |
| South African Rand | ZAR | South Africa |
| US Dollar | USD | Global |
| British Pound | GBP | UK |

## Transaction Limits

| Type | Limit | Notes |
|------|-------|-------|
| Minimum Transfer | Local currency equivalent of $1 | Varies by country |
| Maximum Transfer | Varies by verification level | Contact Chipper Cash for limits |
| Daily Limit | Varies by account type | Business accounts have higher limits |

## Common Issues

### Issue: Recipient Not Found

**Cause:** The recipient doesn't have a Chipper Cash account
**Solution:**
- Ensure the recipient has an active Chipper Cash account
- Verify the phone number or tag is correct
- Ask the recipient to register if they haven't

### Issue: Insufficient Balance

**Cause:** Not enough funds in your Chipper Cash wallet
**Solution:**
- Top up your Chipper Cash wallet
- Link a bank card for automatic top-up

### Issue: Transfer Failed

**Common Error Codes:**

| Code | Description | Solution |
|------|-------------|----------|
| `completed` | Transfer successful | ✅ Success |
| `failed` | Transfer failed | Check failure reason |
| `cancelled` | Transfer cancelled | User cancelled |
| `pending` | Transfer pending | Wait for completion |

### Issue: Webhook Not Received

**Check:**
1. Webhook URL is publicly accessible (HTTPS)
2. URL is correctly configured in Chipper Cash dashboard
3. Firewall allows incoming requests
4. SSL certificate is valid

## Rate Limits

| Operation | Rate Limit |
|-----------|------------|
| Transfers | 100/minute |
| Payment Requests | 100/minute |
| Status Queries | 500/minute |
| Balance Queries | 100/minute |

## Support

- **Website**: [chippercash.com](https://chippercash.com)
- **Help Center**: In-app support
- **Email**: support@chippercash.com
- **Twitter**: [@chippercashapp](https://twitter.com/chippercashapp)

## See Also

- [Configuration](../configuration.md)
- [Webhooks](../webhooks.md)
- [API Reference](../api/reference.md)
