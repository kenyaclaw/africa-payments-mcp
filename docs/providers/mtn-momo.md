# MTN MoMo

MTN Mobile Money is the largest mobile money platform in Africa, available in 16+ countries across the continent.

## Supported Countries

| Country | Code | Status |
|---------|------|--------|
| 🇬🇭 Ghana | GH | ✅ Available |
| 🇺🇬 Uganda | UG | ✅ Available |
| 🇨🇮 Ivory Coast | CI | ✅ Available |
| 🇨🇲 Cameroon | CM | ✅ Available |
| 🇷🇼 Rwanda | RW | ✅ Available |
| 🇿🇲 Zambia | ZM | ✅ Available |
| 🇧🇯 Benin | BJ | ✅ Available |
| 🇨🇬 Congo | CG | ✅ Available |
| 🇬🇳 Guinea | GN | ✅ Available |
| 🇱🇷 Liberia | LR | ⚠️ Limited |
| 🇸🇱 Sierra Leone | SL | ⚠️ Limited |
| 🇸🇸 South Sudan | SS | ⚠️ Limited |
| 🇸🇿 Eswatini | SZ | ⚠️ Limited |
| 🇬🇦 Gabon | GA | ⚠️ Limited |
| 🇬🇶 Equatorial Guinea | GQ | ⚠️ Limited |
| 🇾🇹 Mayotte | YT | ⚠️ Limited |

## Setup Instructions

### 1. Create MTN Developer Account

1. Visit [MTN Developer Portal](https://developer.mtn.com/)
2. Register for a developer account
3. Create a new app
4. Subscribe to the MoMo API product

### 2. Get Your Credentials

After creating your app, you'll receive:

- **Subscription Key** (Primary and Secondary)
- **API User** (create via API)
- **API Key** (generated for your API User)

### 3. Create API User

```bash
curl -X POST https://sandbox.momodeveloper.mtn.com/v1_0/apiuser \
  -H "Ocp-Apim-Subscription-Key: YOUR_SUBSCRIPTION_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "providerCallbackHost": "yourapp.com"
  }'
```

### 4. Create API Key

```bash
curl -X POST https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/USER_ID/apikey \
  -H "Ocp-Apim-Subscription-Key: YOUR_SUBSCRIPTION_KEY"
```

## Required Credentials

| Variable | Sandbox | Production | Description |
|----------|---------|------------|-------------|
| `MTN_MOMO_SUBSCRIPTION_KEY` | ✅ | ✅ | API subscription key |
| `MTN_MOMO_API_USER` | ✅ | ✅ | Your API user ID |
| `MTN_MOMO_API_KEY` | ✅ | ✅ | Your API key |

## Sample Configuration

### Environment Variables

```bash
# Common settings
MTN_MOMO_SUBSCRIPTION_KEY=your_subscription_key
MTN_MOMO_API_USER=your_api_user
MTN_MOMO_API_KEY=your_api_key
MTN_MOMO_ENVIRONMENT=sandbox

# Country-specific (for routing)
MTN_MOMO_COUNTRY=GH
MTN_MOMO_CURRENCY=EUR # GHS for production
```

### JavaScript Configuration

```javascript
{
  mtnMomo: {
    // Required
    subscriptionKey: process.env.MTN_MOMO_SUBSCRIPTION_KEY,
    apiUser: process.env.MTN_MOMO_API_USER,
    apiKey: process.env.MTN_MOMO_API_KEY,
    
    // Optional
    environment: 'production', // or 'sandbox'
    
    // Target environment (country-specific)
    targetEnvironment: 'mtnghana', // mtnuganda, mtnci, etc.
    
    // Currency (EUR for sandbox, GHS/XAF/etc for production)
    currency: 'GHS',
    
    // Callback configuration
    callbackUrl: 'https://yourapp.com/webhooks/momo',
    
    // Collection settings
    collection: {
      primaryKey: process.env.MTN_MOMO_COLLECTION_KEY
    },
    
    // Disbursement settings
    disbursement: {
      primaryKey: process.env.MTN_MOMO_DISBURSEMENT_KEY
    }
  }
}
```

## API Operations

### Request Payment (Collection)

Request payment from a customer:

```typescript
const result = await client.callTool('mtn_momo_request_payment', {
  amount: '1000',
  currency: 'GHS',
  externalId: 'ORDER-123',
  payer: {
    partyIdType: 'MSISDN',
    partyId: '233123456789'
  },
  payerMessage: 'Payment for Order 123',
  payeeNote: 'Thank you for your purchase'
});
```

### Transfer (Disbursement)

Send money to a customer:

```typescript
const result = await client.callTool('mtn_momo_transfer', {
  amount: '1000',
  currency: 'GHS',
  externalId: 'PAYOUT-001',
  payee: {
    partyIdType: 'MSISDN',
    partyId: '233123456789'
  },
  payerMessage: 'Payout for services',
  payeeNote: 'Thank you for your service'
});
```

### Check Transaction Status

```typescript
const status = await client.callTool('mtn_momo_transaction_status', {
  referenceId: 'transaction-reference-id',
  type: 'collection' // or 'disbursement'
});
```

### Get Account Balance

```typescript
const balance = await client.callTool('mtn_momo_balance', {
  type: 'collection' // or 'disbursement'
});
```

### Validate Account Holder

Verify if a phone number has an active MoMo account:

```typescript
const result = await client.callTool('mtn_momo_validate_account', {
  accountHolderIdType: 'msisdn',
  accountHolderId: '233123456789'
});
```

## Webhooks

MTN MoMo sends notifications to your callback URL.

### Callback Configuration

Set your callback host when creating the API user:

```json
{
  "providerCallbackHost": "yourapp.com"
}
```

### Request to Pay Callback

```json
{
  "financialTransactionId": "123456789",
  "externalId": "ORDER-123",
  "amount": "1000",
  "currency": "GHS",
  "payer": {
    "partyIdType": "MSISDN",
    "partyId": "233123456789"
  },
  "payerMessage": "Payment for Order 123",
  "payeeNote": "Thank you",
  "status": "SUCCESSFUL"
}
```

### Transfer Callback

```json
{
  "financialTransactionId": "987654321",
  "externalId": "PAYOUT-001",
  "amount": "1000",
  "currency": "GHS",
  "payee": {
    "partyIdType": "MSISDN",
    "partyId": "233123456789"
  },
  "status": "SUCCESSFUL"
}
```

## Common Issues

### Issue: 401 Unauthorized

**Causes:**
- Invalid subscription key
- API User doesn't exist
- Wrong API Key

**Solution:**
- Verify subscription key is correct
- Ensure API User was created successfully
- Regenerate API Key if needed

### Issue: 404 Not Found

**Cause:** Resource doesn't exist
**Solution:**
- Check transaction reference ID
- Verify API endpoint is correct
- Ensure environment (sandbox/prod) matches

### Issue: Currency Mismatch

**Important:** Sandbox always uses EUR, production uses local currency.

| Environment | Ghana | Uganda | Ivory Coast |
|-------------|-------|--------|-------------|
| Sandbox | EUR | EUR | EUR |
| Production | GHS | UGX | XOF |

### Issue: Transaction Failed

**Common Status Codes:**

| Status | Description |
|--------|-------------|
| `PENDING` | Transaction is being processed |
| `SUCCESSFUL` | Transaction completed |
| `FAILED` | Transaction failed |

## Test Credentials

### Sandbox Environment

```bash
# API Base URL: https://sandbox.momodeveloper.mtn.com

# Test Phone Numbers
# For Ghana: 233123456789
# For Uganda: 256123456789

# Test Currency: EUR (always in sandbox)
```

### API Endpoints by Product

| Product | Sandbox URL |
|---------|-------------|
| Collection | `https://sandbox.momodeveloper.mtn.com/collection/v1_0` |
| Disbursement | `https://sandbox.momodeveloper.mtn.com/disbursement/v1_0` |
| Remittance | `https://sandbox.momodeveloper.mtn.com/remittance/v1_0` |

## Country-Specific Notes

### Ghana
- **Currency:** GHS (Cedi)
- **Format:** 233XXXXXXXXX
- **Products:** Collection, Disbursement, Remittance

### Uganda
- **Currency:** UGX (Shilling)
- **Format:** 256XXXXXXXXX
- **Products:** Collection, Disbursement

### Ivory Coast
- **Currency:** XOF (CFA Franc)
- **Format:** 225XXXXXXXX
- **Products:** Collection, Disbursement

## Rate Limits

| Operation | Rate Limit |
|-----------|------------|
| Request Payment | 100/minute |
| Transfer | 50/minute |
| Status Check | 200/minute |
| Balance | 100/minute |

## Support

- **Documentation**: [MTN Developer Portal](https://developer.mtn.com/)
- **Support**: Via developer portal
- **Status**: Check MTN MoMo app for service status

## See Also

- [Configuration](../configuration.md)
- [Webhooks](../webhooks.md)
- [API Reference](../api/reference.md)
