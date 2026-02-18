# Airtel Money

Airtel Money is a mobile money service by Airtel Africa, available in 14+ countries across the continent.

## Supported Countries

| Country | Code | Status |
|---------|------|--------|
| 🇰🇪 Kenya | KE | ✅ Available |
| 🇹🇿 Tanzania | TZ | ✅ Available |
| 🇺🇬 Uganda | UG | ✅ Available |
| 🇷🇼 Rwanda | RW | ✅ Available |
| 🇿🇲 Zambia | ZM | ✅ Available |
| 🇲🇼 Malawi | MW | ✅ Available |
| 🇲🇬 Madagascar | MG | ✅ Available |
| 🇨🇩 DRC | CD | ⚠️ Limited |
| 🇬🇦 Gabon | GA | ⚠️ Limited |
| 🇨🇬 Congo | CG | ⚠️ Limited |
| 🇳🇪 Niger | NE | ⚠️ Limited |
| 🇹🇩 Chad | TD | ⚠️ Limited |
| 🇸🇱 Sierra Leone | SL | ⚠️ Limited |
| 🇬🇳 Guinea | GN | ⚠️ Limited |

## Setup Instructions

### 1. Contact Airtel

Unlike other providers, Airtel Money requires direct partnership:

1. Contact your local Airtel Money business team
2. Complete business verification and KYC
3. Sign a commercial agreement
4. Receive API credentials

### 2. Get Your Credentials

After partnership approval, you'll receive:

- **Client ID**
- **Client Secret**
- **Base URL** (country-specific)
- **Environment** (sandbox/production)

::: warning Partnership Required
Airtel Money requires a formal business partnership. Individual developers cannot access the API directly.
:::

## Required Credentials

| Variable | Sandbox | Production | Description |
|----------|---------|------------|-------------|
| `AIRTEL_MONEY_CLIENT_ID` | ✅ | ✅ | OAuth client ID |
| `AIRTEL_MONEY_CLIENT_SECRET` | ✅ | ✅ | OAuth client secret |
| `AIRTEL_MONEY_COUNTRY` | ✅ | ✅ | Country code (KE, UG, TZ, etc.) |

## Sample Configuration

### Environment Variables

```bash
# Kenya
AIRTEL_MONEY_CLIENT_ID=your_client_id
AIRTEL_MONEY_CLIENT_SECRET=your_client_secret
AIRTEL_MONEY_COUNTRY=KE
AIRTEL_MONEY_ENVIRONMENT=production

# Tanzania
AIRTEL_MONEY_COUNTRY=TZ
AIRTEL_MONEY_ENVIRONMENT=production
```

### JavaScript Configuration

```javascript
{
  airtelMoney: {
    // Required
    clientId: process.env.AIRTEL_MONEY_CLIENT_ID,
    clientSecret: process.env.AIRTEL_MONEY_CLIENT_SECRET,
    countryCode: 'KE', // KE, UG, TZ, RW, ZM, etc.
    
    // Optional
    environment: 'production', // or 'sandbox'
    
    // Currency (auto-detected from country if not provided)
    currency: 'KES',
    
    // Callback configuration
    callbackUrl: 'https://yourapp.com/webhooks/airtel'
  }
}
```

## API Operations

### Get Access Token

Airtel Money uses OAuth 2.0 for authentication. The token is handled automatically, but you can also get it manually:

```typescript
const token = await client.callTool('airtel_money_token', {
  clientId: process.env.AIRTEL_MONEY_CLIENT_ID,
  clientSecret: process.env.AIRTEL_MONEY_CLIENT_SECRET
});
```

### Collect Money (Customer to Business)

Request payment from an Airtel Money customer:

```typescript
const result = await client.callTool('airtel_money_collect', {
  reference: 'ORDER-123',
  subscriber: {
    country: 'KE',
    currency: 'KES',
    msisdn: '254712345678'
  },
  transaction: {
    amount: 1000,
    country: 'KE',
    currency: 'KES',
    id: 'TXN-123456'
  }
});
```

### Refund Transaction

Refund a previous collection:

```typescript
const result = await client.callTool('airtel_money_refund', {
  reference: 'ORDER-123',
  transaction: {
    amount: 1000,
    id: 'TXN-123456'
  }
});
```

### Send Money (Business to Customer)

Send money to an Airtel Money customer:

```typescript
const result = await client.callTool('airtel_money_send', {
  reference: 'PAYOUT-001',
  subscriber: {
    country: 'KE',
    currency: 'KES',
    msisdn: '254712345678'
  },
  transaction: {
    amount: 1000,
    country: 'KE',
    currency: 'KES',
    id: 'TXN-789012'
  }
});
```

### Check Transaction Status

```typescript
const status = await client.callTool('airtel_money_status', {
  reference: 'ORDER-123',
  id: 'TXN-123456'
});
```

### Get Balance

Check your Airtel Money wallet balance:

```typescript
const balance = await client.callTool('airtel_money_balance', {
  currency: 'KES'
});
```

### Get User Enquiry

Verify customer details:

```typescript
const user = await client.callTool('airtel_money_user_enquiry', {
  msisdn: '254712345678'
});
```

## Webhooks

Airtel Money sends webhook notifications for transaction updates.

### Callback URL Setup

Configure your callback URL during API onboarding or through your Airtel partner portal.

### Webhook Payload

```json
{
  "transaction": {
    "id": "TXN-123456",
    "status": "TS",
    "message": "Transaction successful"
  },
  "reference": "ORDER-123",
  "amount": 1000,
  "currency": "KES",
  "subscriber": {
    "country": "KE",
    "msisdn": "254712345678"
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Transaction Status Codes

| Code | Status | Description |
|------|--------|-------------|
| `TS` | Success | Transaction completed successfully |
| `TF` | Failed | Transaction failed |
| `TA` | Ambiguous | Transaction status unclear |
| `TP` | Pending | Transaction is being processed |

## Common Issues

### Issue: Authentication Failed

**Cause:** Invalid client credentials or expired token
**Solution:**
- Verify client ID and secret
- Check token hasn't expired
- Ensure correct environment (sandbox/production)

### Issue: Subscriber Not Found

**Cause:** Phone number not registered on Airtel Money
**Solution:**
- Verify the phone number is correct
- Ensure it's an active Airtel Money account
- Check the country code matches

### Issue: Insufficient Funds

**Causes:**
- Customer has insufficient balance (for collections)
- Your business account has insufficient balance (for sends)

### Issue: Transaction Failed

**Common Error Codes:**

| Error | Description | Solution |
|-------|-------------|----------|
| `500` | Internal server error | Retry or contact support |
| `401` | Unauthorized | Check credentials |
| `400` | Bad request | Verify request format |
| `403` | Forbidden | Check permissions |
| `404` | Not found | Verify transaction ID |

## Currency Support

| Country | Currency | Code |
|---------|----------|------|
| Kenya | Kenyan Shilling | KES |
| Tanzania | Tanzanian Shilling | TZS |
| Uganda | Ugandan Shilling | UGX |
| Rwanda | Rwandan Franc | RWF |
| Zambia | Zambian Kwacha | ZMW |
| Malawi | Malawian Kwacha | MWK |
| Madagascar | Malagasy Ariary | MGA |
| DRC | Congolese Franc | CDF |
| Gabon | CFA Franc BEAC | XAF |
| Congo | CFA Franc BEAC | XAF |

## Rate Limits

| Operation | Rate Limit |
|-----------|------------|
| Collection | 100/minute |
| Send Money | 50/minute |
| Status Check | 200/minute |
| Balance | 100/minute |

## Sandbox Testing

### Test Credentials

Contact your Airtel partner representative for sandbox access.

### Test Phone Numbers

| Country | Test Number | Result |
|---------|-------------|--------|
| Kenya | 254700000001 | Success |
| Kenya | 254700000002 | Insufficient funds |
| Kenya | 254700000003 | Not registered |

## Support

Since Airtel Money requires a partnership, support is provided through your:

- **Partner Manager** - Your primary contact
- **Technical Support** - Via partner portal
- **Email Support** - Provided during onboarding

## See Also

- [Configuration](../configuration.md)
- [Webhooks](../webhooks.md)
- [M-Pesa Provider](./mpesa.md)
