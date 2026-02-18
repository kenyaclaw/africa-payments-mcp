# IntaSend

IntaSend is a modern payment API platform that simplifies M-Pesa, bank, and card payments for businesses in Africa.

## Supported Countries

| Country | M-Pesa | Bank | Card | Status |
|---------|--------|------|------|--------|
| 🇰🇪 Kenya | ✅ | ✅ | ✅ | Full |
| 🇳🇬 Nigeria | ❌ | ✅ | ✅ | Partial |
| 🇬🇭 Ghana | ❌ | ✅ | ✅ | Partial |

## Setup Instructions

### 1. Create IntaSend Account

1. Visit [IntaSend](https://intasend.com/)
2. Sign up for a business account
3. Complete business verification
4. Go to **API** → **API Keys**

### 2. Get Your Credentials

From your IntaSend dashboard:

1. Copy your **Public Key** (starts with `ISPubKey_`)
2. Copy your **Secret Key** (starts with `ISSecretKey_`)
3. Note your **Publishable Key** for client-side use

::: tip Test Mode
IntaSend provides separate keys for test and live environments. Use test keys during development.
:::

### 3. Configure Webhooks

1. Go to **API** → **Webhooks**
2. Add your webhook URL
3. Select events to receive

## Required Credentials

| Variable | Test | Live | Description |
|----------|------|------|-------------|
| `INTASEND_PUBLIC_KEY` | ✅ | ✅ | Your public API key |
| `INTASEND_SECRET_KEY` | ✅ | ✅ | Your secret API key |

## Sample Configuration

### Environment Variables

```bash
# Test Mode
INTASEND_PUBLIC_KEY=ISPubKey_test_xxxxxxxxxxxxxxxxxxx
INTASEND_SECRET_KEY=ISSecretKey_test_xxxxxxxxxxxxxxxx

# Live Mode
INTASEND_PUBLIC_KEY=ISPubKey_live_xxxxxxxxxxxxxxxxxxx
INTASEND_SECRET_KEY=ISSecretKey_live_xxxxxxxxxxxxxxxx
```

### JavaScript Configuration

```javascript
{
  intasend: {
    // Required
    publicKey: process.env.INTASEND_PUBLIC_KEY,
    secretKey: process.env.INTASEND_SECRET_KEY,
    
    // Optional
    testMode: false, // Set to true for test environment
    
    // Default currency
    currency: 'KES',
    
    // Webhook configuration
    webhookSecret: process.env.INTASEND_WEBHOOK_SECRET
  }
}
```

## API Operations

### Collect Payment (M-Pesa STK Push)

Request payment via M-Pesa:

```typescript
const result = await client.callTool('intasend_collect', {
  currency: 'KES',
  amount: 1000,
  phone_number: '254712345678',
  api_ref: 'ORDER-123',
  email: 'customer@example.com',
  name: 'John Doe'
});

// Response:
// {
//   "invoice": {
//     "invoice_id": "INV-123456",
//     "state": "PENDING",
//     "provider": "M-PESA",
//     "amount": 1000,
//     "currency": "KES"
//   }
// }
```

### Check Collection Status

```typescript
const status = await client.callTool('intasend_check_collection', {
  invoice_id: 'INV-123456'
});
```

### Send Money (Payout)

Send money to M-Pesa or bank account:

```typescript
// M-Pesa Payout
const result = await client.callTool('intasend_payout', {
  currency: 'KES',
  amount: 1000,
  account: '254712345678',
  name: 'John Doe',
  narration: 'Payment for services'
});

// Bank Payout
const result = await client.callTool('intasend_payout', {
  currency: 'KES',
  amount: 5000,
  account: '1234567890',
  bank_code: '01', // KCB Bank
  name: 'John Doe',
  narration: 'Salary payment'
});
```

### Check Payout Status

```typescript
const status = await client.callTool('intasend_check_payout', {
  transaction_id: 'TRX-123456'
});
```

### Bank Payouts

Send money to bank accounts:

```typescript
const result = await client.callTool('intasend_bank_payout', {
  currency: 'KES',
  amount: 10000,
  bank_account: {
    account_number: '1234567890',
    bank_code: '01', // KCB Bank
    account_name: 'John Doe'
  },
  narration: 'Invoice payment'
});
```

### Get Wallet Balance

```typescript
const balance = await client.callTool('intasend_balance', {
  currency: 'KES'
});
```

### Create Payment Link

Generate a shareable payment link:

```typescript
const result = await client.callTool('intasend_payment_link', {
  currency: 'KES',
  amount: 2500,
  api_ref: 'ORDER-123',
  redirect_url: 'https://yourapp.com/payment/success',
  comment: 'Payment for Order 123'
});
```

## Webhooks

IntaSend sends webhooks for transaction updates.

### Webhook Events

| Event | Description |
|-------|-------------|
| `payment.completed` | Payment successfully completed |
| `payment.failed` | Payment failed |
| `payout.completed` | Payout successfully processed |
| `payout.failed` | Payout failed |
| `refund.completed` | Refund processed |

### Webhook Payload

```json
{
  "event": "payment.completed",
  "invoice": {
    "invoice_id": "INV-123456",
    "state": "COMPLETE",
    "provider": "M-PESA",
    "charges": 25,
    "net_amount": 975,
    "currency": "KES",
    "value": 1000,
    "account": "254712345678",
    "api_ref": "ORDER-123",
    "created_at": "2024-01-01T12:00:00+03:00",
    "updated_at": "2024-01-01T12:01:30+03:00"
  }
}
```

### Webhook Verification

Verify webhook authenticity:

```typescript
const isValid = await client.callTool('intasend_verify_webhook', {
  signature: req.headers['x-intasend-signature'],
  payload: req.body,
  secret: process.env.INTASEND_WEBHOOK_SECRET
});
```

## Bank Codes (Kenya)

| Code | Bank Name |
|------|-----------|
| `01` | KCB Bank |
| `02` | Standard Chartered |
| `03` | Barclays Bank |
| `07` | Citi Bank |
| `10` | Prime Bank |
| `11` | Co-operative Bank |
| `12` | National Bank |
| `16` | CBA Bank |
| `25` | Credit Bank |
| `31` | Stanbic Bank |
| `35` | NIC Bank |
| `50` | Family Bank |
| `51` | DTB Bank |
| `55` | K-Rep Bank |
| `57` | Equity Bank |
| `63` | Diamond Trust Bank |
| `66` | SBM Bank |
| `68` | Ecobank |
| `70` | Spire Bank |
| `72` | UBA Bank |
| `74` | M-Oriental Bank |
| `76` | Consolidated Bank |
| `78` | Access Bank |
| `99` | PayPal |

## Common Issues

### Issue: Insufficient Funds

**Cause:** Your IntaSend wallet doesn't have enough balance
**Solution:**
- Top up your IntaSend wallet via M-Pesa Paybill
- Or link a bank account for automatic top-ups

### Issue: Transaction Failed

**Common Reasons:**

| Error | Solution |
|-------|----------|
| `INSUFFICIENT_FUNDS` | Customer has insufficient M-Pesa balance |
| `INVALID_ACCOUNT` | Phone number format is incorrect |
| `TRANSACTION_EXPIRED` | Customer didn't complete in time |
| `API_ERROR` | Contact IntaSend support |

### Issue: Payout Delayed

**Causes:**
- Bank processing delays
- M-Pesa network issues
- Large transaction requiring review

**Solution:**
- Check status after 30 minutes
- Contact IntaSend support if still pending

## Test Mode

Use these test credentials:

```bash
INTASEND_PUBLIC_KEY=ISPubKey_test_xxxxxxxx
INTASEND_SECRET_KEY=ISSecretKey_test_xxxxxxxx
```

### Test Phone Numbers

| Phone | Result |
|-------|--------|
| `254712345678` | Success |
| `254700000001` | Insufficient funds |
| `254700000002` | Timeout |

## Fees

| Transaction Type | Fee |
|-----------------|-----|
| M-Pesa Collection | 1.5% |
| M-Pesa Payout | KES 25-35 |
| Bank Transfer | KES 50-150 |
| Card Payment | 3.5% |

## Rate Limits

| Operation | Rate Limit |
|-----------|------------|
| Collection | 100/minute |
| Payout | 50/minute |
| Status Check | 200/minute |

## Support

- **Documentation**: [IntaSend Docs](https://intasend.com/docs)
- **Support Email**: support@intasend.com
- **Dashboard**: [IntaSend Dashboard](https://dashboard.intasend.com)

## See Also

- [Configuration](../configuration.md)
- [Webhooks](../webhooks.md)
- [M-Pesa Provider](./mpesa.md)
