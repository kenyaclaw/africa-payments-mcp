# Wave

Wave is a mobile money platform focused on Francophone Africa, offering QR code payments and mobile money transfers with no fees.

## Supported Countries

| Country | Code | Status |
|---------|------|--------|
| 🇸🇳 Senegal | SN | ✅ Available |
| 🇨🇮 Ivory Coast | CI | ✅ Available |
| 🇧🇫 Burkina Faso | BF | ✅ Available |
| 🇲🇱 Mali | ML | ✅ Available |
| 🇺🇬 Uganda | UG | ✅ Available |

## Features

- **QR Code Payments**: Scan and pay with QR codes
- **Mobile Money Transfers**: Send money to any mobile phone
- **No Transfer Fees**: Free transfers for personal accounts
- **Instant Settlement**: Real-time transaction processing
- **Business Payments**: Accept payments from Wave users

## Setup Instructions

### 1. Create Wave Business Account

1. Download the Wave app or visit [wave.com](https://wave.com)
2. Register for a business/merchant account
3. Complete business verification
4. Apply for API access

### 2. Get Your API Credentials

After approval, you'll receive:

- **API Key**
- **API Secret**
- **Merchant ID**
- **Webhook Secret** (optional, for verification)

### 3. Configure Webhooks

Set up webhooks in your Wave merchant dashboard to receive payment notifications.

## Required Credentials

| Variable | Sandbox | Production | Description |
|----------|---------|------------|-------------|
| `WAVE_API_KEY` | ✅ | ✅ | API key |
| `WAVE_API_SECRET` | ✅ | ✅ | API secret |
| `WAVE_MERCHANT_ID` | ✅ | ✅ | Merchant identifier |
| `WAVE_WEBHOOK_SECRET` | Optional | Optional | Webhook signature secret |

## Sample Configuration

### Environment Variables

```bash
WAVE_API_KEY=your_api_key
WAVE_API_SECRET=your_api_secret
WAVE_MERCHANT_ID=your_merchant_id
WAVE_WEBHOOK_SECRET=your_webhook_secret
WAVE_ENVIRONMENT=sandbox
```

### JavaScript Configuration

```javascript
{
  wave: {
    // Required
    apiKey: process.env.WAVE_API_KEY,
    apiSecret: process.env.WAVE_API_SECRET,
    merchantId: process.env.WAVE_MERCHANT_ID,
    
    // Optional
    environment: 'production', // or 'sandbox'
    timeoutMs: 30000,
    retryAttempts: 3,
  }
}
```

## API Operations

### Send Money (Transfer)

Send money to a mobile money wallet:

```typescript
const result = await client.callTool('wave_send', {
  recipientPhone: '+221701234567',
  recipientName: 'Moussa Diop',
  amount: 10000,
  currency: 'XOF',
  description: 'Payment for services',
  clientReference: 'ORDER-123',
  callbackUrl: 'https://yourapp.com/webhooks/wave'
});
```

### Request Payment (QR Code)

Create a payment request with QR code:

```typescript
const result = await client.callTool('wave_request', {
  amount: 15000,
  currency: 'XOF',
  description: 'Invoice #123',
  expiryMinutes: 30,
  callbackUrl: 'https://yourapp.com/webhooks/wave'
});

// The response includes:
// - qrCode: QR code data for display
// - paymentUrl: URL for customer to pay
// - paymentId: ID to track the payment
```

### Request Payment (Targeted)

Request payment from a specific customer:

```typescript
const result = await client.callTool('wave_request', {
  customerPhone: '+225712345678',
  amount: 20000,
  currency: 'XOF',
  description: 'Payment for Order #456',
  expiryMinutes: 30
});
```

### Generate QR Code

Generate a standalone QR code for display:

```typescript
const qrResult = await client.callTool('wave_qr_code', {
  amount: 5000,
  currency: 'XOF',
  description: 'QR Payment',
  expiryMinutes: 30
});

// qrResult contains:
// - qrCodeData: The QR code data
// - qrCodeImageUrl: URL to the QR code image
// - paymentId: ID to track payments
// - expiryTime: When the QR code expires
```

### Check Transaction Status

```typescript
const status = await client.callTool('wave_status', {
  transactionId: 'wave_pay_123456'
});
```

### Get Balance

```typescript
const balance = await client.callTool('wave_balance', {});
```

## Webhooks

Wave sends webhook notifications for transaction events:

### Event Types

| Event | Description |
|-------|-------------|
| `payment_request.succeeded` | Payment was successful |
| `payment_request.failed` | Payment failed |
| `payment_request.cancelled` | Payment was cancelled |
| `transfer.succeeded` | Transfer completed |
| `transfer.failed` | Transfer failed |
| `transfer.cancelled` | Transfer cancelled |
| `refund.succeeded` | Refund processed |
| `refund.failed` | Refund failed |

### Webhook Payload Example - Payment

```json
{
  "event": "payment_request.succeeded",
  "data": {
    "id": "wave_pay_123456",
    "type": "payment_request",
    "status": "succeeded",
    "amount": 15000,
    "currency": "XOF",
    "fee": 0,
    "tax": 0,
    "totalAmount": 15000,
    "customer": {
      "phone": "225712345678",
      "name": "Amadou Diallo"
    },
    "clientReference": "ORDER-123",
    "description": "Invoice #123",
    "qrCodeData": "WAVE_QR_DATA...",
    "createdAt": "2026-01-15T12:00:00Z",
    "completedAt": "2026-01-15T12:00:00Z"
  },
  "timestamp": "2026-01-15T12:00:00Z",
  "signature": "..."
}
```

### Webhook Payload Example - Transfer

```json
{
  "event": "transfer.succeeded",
  "data": {
    "id": "wave_trf_123456",
    "type": "transfer",
    "status": "succeeded",
    "amount": 10000,
    "currency": "XOF",
    "fee": 0,
    "recipient": {
      "phone": "221701234567",
      "name": "Moussa Diop"
    },
    "clientReference": "ORDER-123",
    "description": "Payment for services",
    "createdAt": "2026-01-15T12:00:00Z",
    "completedAt": "2026-01-15T12:00:00Z"
  },
  "timestamp": "2026-01-15T12:00:00Z"
}
```

### Webhook Security

Verify webhook authenticity:

```typescript
const isValid = await client.callTool('wave_verify_webhook', {
  signature: req.headers['x-wave-signature'],
  payload: req.body
});
```

## QR Code Payments

Wave's QR code payment flow:

1. **Generate QR Code**: Merchant generates a QR code
2. **Customer Scans**: Customer scans QR code with Wave app
3. **Payment Approval**: Customer confirms payment in app
4. **Webhook Notification**: Merchant receives payment confirmation

### QR Code Display

```typescript
const qr = await client.callTool('wave_qr_code', {
  amount: 5000,
  currency: 'XOF'
});

// Display qr.qrCodeImageUrl in your app
// Or generate QR code from qr.qrCodeData
```

## Phone Number Formats

| Country | Format | Example |
|---------|--------|---------|
| Senegal | 2217XXXXXXXX | 221701234567 |
| Ivory Coast | 225XXXXXXXX | 225712345678 |
| Burkina Faso | 226XXXXXXXX | 22670123456 |
| Mali | 223XXXXXXXX | 22371234567 |
| Uganda | 2567XXXXXXXX | 256712345678 |

## Currency Support

| Currency | Code | Countries |
|----------|------|-----------|
| West African CFA franc | XOF | SN, CI, BF, ML |
| Central African CFA franc | XAF | (future expansion) |
| Ugandan Shilling | UGX | UG |

## Transaction Limits

| Type | Minimum | Maximum | Notes |
|------|---------|---------|-------|
| Payment Request | 100 XOF | Varies by merchant tier | Business accounts only |
| Transfer | 100 XOF | Varies by verification | Personal accounts: free |
| Daily Volume | - | Varies by merchant tier | Contact Wave for increases |

## Fees

| Operation | Fee |
|-----------|-----|
| Personal Transfers | Free |
| Business Payments | Contact Wave for rates |
| Cash Out | Varies by agent |

## Common Issues

### Issue: QR Code Not Scanning

**Cause:** QR code expired or invalid
**Solution:**
- Check that the QR code hasn't expired
- Generate a new QR code if needed
- Ensure the QR code is clearly displayed

### Issue: Payment Failed

**Common Error Codes:**

| Code | Description | Solution |
|------|-------------|----------|
| `succeeded` | Payment successful | ✅ Success |
| `failed` | Payment failed | Check failure reason |
| `cancelled` | Payment cancelled | Customer cancelled |
| `expired` | Payment expired | Generate new request |

### Issue: Transfer Failed

**Causes:**
- Recipient phone number not registered
- Insufficient balance
- Network issues

**Solution:**
- Verify recipient has Wave account
- Check your balance
- Retry the transfer

### Issue: Webhook Not Received

**Check:**
1. Webhook URL is publicly accessible (HTTPS)
2. URL is correctly configured in Wave dashboard
3. No firewall blocking requests
4. SSL certificate is valid

## Rate Limits

| Operation | Rate Limit |
|-----------|------------|
| Payment Requests | 100/minute |
| Transfers | 100/minute |
| QR Code Generation | 100/minute |
| Status Queries | 500/minute |
| Balance Queries | 100/minute |

## Security Best Practices

1. **Store credentials securely**: Use environment variables
2. **Verify webhooks**: Always validate webhook signatures
3. **Use HTTPS**: All callback URLs must use HTTPS
4. **Implement idempotency**: Handle duplicate webhooks
5. **Monitor transactions**: Set up alerts for suspicious activity

## Support

- **Website**: [wave.com](https://wave.com)
- **Merchant Support**: Contact your Wave business representative
- **In-App Support**: Available in the Wave app

## See Also

- [Configuration](../configuration.md)
- [Webhooks](../webhooks.md)
- [API Reference](../api/reference.md)
