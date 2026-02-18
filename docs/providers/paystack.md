# Paystack

Paystack is a modern payments infrastructure for Africa, providing businesses with a simple way to accept payments via cards, bank transfers, and mobile money.

## Supported Countries

| Country | Card | Bank Transfer | Mobile Money | Status |
|---------|------|---------------|--------------|--------|
| 🇳🇬 Nigeria | ✅ | ✅ | ✅ | Full |
| 🇬🇭 Ghana | ✅ | ✅ | ✅ | Full |
| 🇿🇦 South Africa | ✅ | ✅ | ❌ | Partial |
| 🇰🇪 Kenya | ⚠️ | ⚠️ | ⚠️ | Limited |

## Setup Instructions

### 1. Create Paystack Account

1. Visit [Paystack](https://paystack.com/)
2. Sign up for a business account
3. Complete business verification (KYC)
4. Activate your account

### 2. Get API Keys

1. Go to **Settings** → **API Keys**
2. Copy your **Secret Key** (starts with `sk_`)
3. Copy your **Public Key** (starts with `pk_`)

::: warning Keep Secrets Safe
Never expose your secret key in client-side code. Use it only on your server or in secure MCP server configuration.
:::

### 3. Configure Webhooks

1. Go to **Settings** → **Webhooks**
2. Add your webhook URL: `https://yourapp.com/webhooks/paystack`
3. Select events: `charge.success`, `charge.failed`, `transfer.success`, etc.

## Required Credentials

| Variable | Test | Live | Description |
|----------|------|------|-------------|
| `PAYSTACK_SECRET_KEY` | ✅ | ✅ | Your secret API key |
| `PAYSTACK_PUBLIC_KEY` | ❌ | ❌ | Public key (client-side only) |

## Sample Configuration

### Environment Variables

```bash
# Test Mode
PAYSTACK_SECRET_KEY=YOUR_TEST_SECRET_KEY_HERE

# Live Mode
PAYSTACK_SECRET_KEY=YOUR_LIVE_SECRET_KEY_HERE
```

### JavaScript Configuration

```javascript
{
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY,
    
    // Optional: Split payments
    subaccount: 'ACCT_xxxxxxxxxxxxx',
    transactionCharge: 100, // in kobo
    bearer: 'subaccount', // who bears the charges
    
    // Webhook configuration
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET
  }
}
```

## API Operations

### Initialize Transaction

Create a payment request:

```typescript
const result = await client.callTool('paystack_initialize', {
  email: 'customer@example.com',
  amount: 500000, // Amount in kobo/cents (5000 NGN)
  currency: 'NGN',
  reference: 'ORDER-123-UNIQUE',
  callback_url: 'https://yourapp.com/payment/callback',
  metadata: {
    order_id: 'ORDER-123',
    customer_id: 'CUST-456'
  }
});

// Response includes authorization_url for customer to complete payment
// {
//   "status": true,
//   "message": "Authorization URL created",
//   "data": {
//     "authorization_url": "https://checkout.paystack.com/xyz",
//     "access_code": "access_code",
//     "reference": "ORDER-123-UNIQUE"
//   }
// }
```

### Verify Transaction

Verify payment status:

```typescript
const result = await client.callTool('paystack_verify', {
  reference: 'ORDER-123-UNIQUE'
});

// Returns full transaction details including status
```

### List Transactions

Get transaction history:

```typescript
const result = await client.callTool('paystack_list_transactions', {
  perPage: 50,
  page: 1,
  from: '2024-01-01',
  to: '2024-12-31'
});
```

### Create Transfer Recipient

Add a recipient for payouts:

```typescript
const result = await client.callTool('paystack_create_recipient', {
  type: 'nuban', // Nigerian bank account
  name: 'John Doe',
  account_number: '0123456789',
  bank_code: '057', // Zenith Bank
  currency: 'NGN'
});
```

### Initiate Transfer

Send money to a recipient:

```typescript
const result = await client.callTool('paystack_transfer', {
  source: 'balance',
  amount: 500000, // 5000 NGN in kobo
  recipient: 'recipient_code_from_previous_step',
  reason: 'Payout for Order 123'
});
```

### Bulk Transfer

Send to multiple recipients:

```typescript
const result = await client.callTool('paystack_bulk_transfer', {
  transfers: [
    {
      amount: 50000,
      recipient: 'RCP_abc123',
      reference: 'ref-001'
    },
    {
      amount: 100000,
      recipient: 'RCP_def456',
      reference: 'ref-002'
    }
  ]
});
```

## Webhooks

Paystack sends webhooks for various events:

### Webhook Events

| Event | Description |
|-------|-------------|
| `charge.success` | Payment completed successfully |
| `charge.failed` | Payment failed |
| `transfer.success` | Transfer completed |
| `transfer.failed` | Transfer failed |
| `transfer.reversed` | Transfer was reversed |
| `subscription.create` | New subscription created |
| `subscription.disable` | Subscription disabled |

### Webhook Payload Example

```json
{
  "event": "charge.success",
  "data": {
    "id": 123456789,
    "domain": "test",
    "status": "success",
    "reference": "ORDER-123",
    "amount": 500000,
    "currency": "NGN",
    "paid_at": "2024-01-01T12:00:00.000Z",
    "channel": "card",
    "customer": {
      "email": "customer@example.com"
    }
  }
}
```

### Webhook Verification

Verify webhook signature:

```typescript
const isValid = await client.callTool('paystack_verify_webhook', {
  signature: req.headers['x-paystack-signature'],
  payload: req.body,
  secret: process.env.PAYSTACK_WEBHOOK_SECRET
});
```

## Common Issues

### Issue: Authentication Failed

**Cause:** Invalid or expired API key
**Solution:**
- Verify your secret key is correct
- Check if using test key in production (or vice versa)
- Ensure key hasn't been revoked

### Issue: Transaction Failed

**Common Reasons:**

| Error | Solution |
|-------|----------|
| `insufficient_funds` | Customer needs to add funds |
| `incorrect_pin` | Customer entered wrong PIN |
| `transaction_not_allowed` | Card doesn't support online payments |
| `expired_card` | Customer needs to use a valid card |

### Issue: Transfer Failed

**Requirements for Transfers:**
- Account must have transfer feature enabled
- Sufficient balance
- Valid recipient code
- Transfer amount within limits

### Issue: Webhook Not Received

**Check:**
1. Webhook URL is publicly accessible (HTTPS)
2. URL returns 200 status code
3. No firewall blocking Paystack IPs
4. Correct events are subscribed

## Test Credentials

### Test Cards

| Card Number | Type | Scenario |
|-------------|------|----------|
| `4084084084084081` | Visa | Success |
| `506066506066506066` | Verve | Success |
| `507850785078507812` | Verve | Insufficient funds |
| `4084080000000008` | Visa | Declined |

### Test Bank Accounts (Nigeria)

| Bank | Account Number | Description |
|------|----------------|-------------|
| Test Bank | `0000000000` | Success |
| Test Bank | `0000000001` | Failure |

## Currency Support

| Currency | Code | Decimal Places |
|----------|------|----------------|
| Nigerian Naira | NGN | 2 (kobo) |
| Ghana Cedi | GHS | 2 (pesewas) |
| South African Rand | ZAR | 2 (cents) |
| Kenyan Shilling | KES | 2 (cents) |

## Rate Limits

| Endpoint | Rate Limit |
|----------|------------|
| Initialize | 100/minute |
| Verify | 100/minute |
| Transfers | 50/minute |
| List | 200/minute |

## Support

- **Documentation**: [Paystack Docs](https://paystack.com/docs)
- **Support Email**: support@paystack.com
- **Status Page**: [status.paystack.com](https://status.paystack.com)

## See Also

- [Configuration](../configuration.md)
- [Webhooks](../webhooks.md)
- [API Reference](../api/reference.md)
