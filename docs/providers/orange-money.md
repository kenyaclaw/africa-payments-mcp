# Orange Money

Orange Money is a mobile money service by Orange, available in multiple countries across Francophone Africa.

## Supported Countries

| Country | Code | Status |
|---------|------|--------|
| 🇨🇮 Ivory Coast | CI | ✅ Available |
| 🇸🇳 Senegal | SN | ✅ Available |
| 🇲🇱 Mali | ML | ✅ Available |
| 🇧🇫 Burkina Faso | BF | ✅ Available |
| 🇬🇳 Guinea | GN | ✅ Available |
| 🇨🇬 Congo | CG | ✅ Available |
| 🇲🇬 Madagascar | MG | ✅ Available |

## Setup Instructions

### 1. Create Orange Developer Account

1. Visit [Orange Developer Portal](https://developer.orange.com/)
2. Register for a developer account
3. Create a new application
4. Subscribe to the Orange Money API

### 2. Get Your Credentials

After creating your application, you'll receive:

- **Client ID**
- **Client Secret**
- **Merchant ID** (for business accounts)

### 3. Request Production Access

For production access:

1. Complete business verification
2. Submit KYC documents
3. Get approval from Orange
4. Receive production credentials

::: warning Production Note
Sandbox and production use different credentials. Never use sandbox credentials in production.
:::

## Required Credentials

| Variable | Sandbox | Production | Description |
|----------|---------|------------|-------------|
| `ORANGE_MONEY_CLIENT_ID` | ✅ | ✅ | API client ID |
| `ORANGE_MONEY_CLIENT_SECRET` | ✅ | ✅ | API client secret |
| `ORANGE_MONEY_MERCHANT_ID` | ✅ | ✅ | Merchant identifier |

## Sample Configuration

### Environment Variables

```bash
# For Ivory Coast
ORANGE_MONEY_CLIENT_ID=your_client_id
ORANGE_MONEY_CLIENT_SECRET=your_client_secret
ORANGE_MONEY_MERCHANT_ID=your_merchant_id
ORANGE_MONEY_ENVIRONMENT=sandbox
```

### JavaScript Configuration

```javascript
{
  orange_money: {
    // Required
    clientId: process.env.ORANGE_MONEY_CLIENT_ID,
    clientSecret: process.env.ORANGE_MONEY_CLIENT_SECRET,
    merchantId: process.env.ORANGE_MONEY_MERCHANT_ID,
    
    // Optional
    environment: 'production', // or 'sandbox'
    timeoutMs: 30000,
    retryAttempts: 3,
  }
}
```

## API Operations

### Send Money (Transfer)

Transfer money to a mobile money wallet:

```typescript
const result = await client.callTool('orange_money_send', {
  recipientPhone: '+225712345678',
  recipientName: 'Amadou Diallo',
  amount: 5000,
  currency: 'XOF',
  description: 'Payment for services',
  reference: 'ORDER-123'
});
```

### Request Payment

Request payment from a customer:

```typescript
const result = await client.callTool('orange_money_request', {
  customerPhone: '+221701234567',
  customerCountry: 'SN',
  amount: 10000,
  currency: 'XOF',
  description: 'Invoice #123',
  expiryMinutes: 30,
  callbackUrl: 'https://yourapp.com/webhooks/orange-money'
});
```

### Transaction Status

Check transaction status:

```typescript
const status = await client.callTool('orange_money_status', {
  transactionId: 'your_transaction_id'
});
```

### Account Balance

Check account balance:

```typescript
const balance = await client.callTool('orange_money_balance', {});
```

## Webhooks

Orange Money sends notifications to your callback URLs. Configure webhook handling:

### Callback Payload - Payment

```json
{
  "paymentToken": "PAY_TOKEN_123",
  "status": "SUCCESS",
  "amount": {
    "value": 10000,
    "currency": "XOF"
  },
  "subscriber": {
    "number": "225712345678",
    "country": "CI"
  },
  "reference": "ORDER-123",
  "transactionId": "OM_TRX_123456"
}
```

### Callback Payload - Transfer

```json
{
  "transactionId": "OM_TRX_123456",
  "status": "SUCCESS",
  "amount": {
    "value": 5000,
    "currency": "XOF"
  },
  "receiver": {
    "number": "221701234567",
    "name": "Moussa Diop"
  },
  "reference": "TRANSFER-123"
}
```

## Phone Number Formats

Orange Money uses international phone number formats:

| Country | Format | Example |
|---------|--------|---------|
| Ivory Coast | 225XXXXXXXX | 225712345678 |
| Senegal | 2217XXXXXXXX | 221701234567 |
| Mali | 223XXXXXXXX | 22371234567 |
| Burkina Faso | 226XXXXXXXX | 22670123456 |
| Guinea | 224XXXXXXXX | 22471234567 |
| Congo | 242XXXXXXXX | 24271234567 |
| Madagascar | 261XXXXXXXX | 26171234567 |

## Common Issues

### Issue: Authentication Failed

**Cause:** Invalid client credentials
**Solution:**
- Verify your client ID and secret
- Ensure you're using the correct environment (sandbox vs production)
- Check that your application is subscribed to the Orange Money API

### Issue: Transaction Failed

**Common Error Codes:**

| Code | Description | Solution |
|------|-------------|----------|
| `SUCCESS` | Transaction completed | ✅ Success |
| `PENDING` | Transaction in progress | Wait for callback |
| `FAILED` | Transaction failed | Check failure reason |
| `CANCELLED` | Transaction cancelled | User cancelled or expired |

### Issue: Callback Not Received

**Check:**
1. Callback URL is publicly accessible (HTTPS)
2. URL is correctly configured in the developer portal
3. No firewall blocking requests
4. SSL certificate is valid

## Rate Limits

| Operation | Rate Limit |
|-----------|------------|
| Send Money | 100/minute |
| Request Payment | 100/minute |
| Status Query | 500/minute |
| Balance Query | 100/minute |

## Currency Support

| Currency | Code | Countries |
|----------|------|-----------|
| West African CFA franc | XOF | CI, SN, BF, ML, GN |
| Central African CFA franc | XAF | CG |
| Guinean franc | GNF | GN |
| Malagasy ariary | MGA | MG |

## Support

- **Orange Developer Portal**: [developer.orange.com](https://developer.orange.com/)
- **Documentation**: [Orange Money API Docs](https://developer.orange.com/apis/payment-webdev/)
- **Support**: Contact your Orange business representative

## See Also

- [Configuration](../configuration.md)
- [Webhooks](../webhooks.md)
- [API Reference](../api/reference.md)
