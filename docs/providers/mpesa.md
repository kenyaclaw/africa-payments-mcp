# M-Pesa

M-Pesa is Africa's leading mobile money service, operated by Safaricom in Kenya and Vodacom in other countries.

## Supported Countries

| Country | Operator | Status |
|---------|----------|--------|
| 🇰🇪 Kenya | Safaricom | ✅ Available |
| 🇹🇿 Tanzania | Vodacom | ✅ Available |
| 🇺🇬 Uganda | MTN/Safaricom | ⚠️ Limited |
| 🇨🇩 DRC | Vodacom | ⚠️ Limited |
| 🇲🇿 Mozambique | Vodacom | ⚠️ Limited |
| 🇱🇸 Lesotho | Vodacom | ⚠️ Limited |

## Setup Instructions

::: tip New to M-Pesa?
For a detailed step-by-step guide with screenshots and troubleshooting, see our [M-Pesa Sandbox Setup Guide](./mpesa-sandbox-setup.md).
:::

### 1. Create Daraja API Account

1. Visit [Daraja Portal](https://developer.safaricom.co.ke/)
2. Register for a developer account
3. Create a new app
4. Select **Lipa na M-Pesa Online** product

For detailed instructions with screenshots, see the [Sandbox Setup Guide](./mpesa-sandbox-setup.md#step-1-create-a-daraja-developer-account).

### 2. Get Your Credentials

After creating your app, you'll receive:

- **Consumer Key**
- **Consumer Secret**
- **Passkey** (for STK Push)
- **Shortcode** (Paybill or Till Number)

### 3. Go Live (Production)

For production access:

1. Complete business verification
2. Submit KYC documents
3. Get approval from Safaricom
4. Receive production credentials

::: warning Production Note
Sandbox and production use different credentials. Never use sandbox credentials in production.
:::

## Required Credentials

| Variable | Sandbox | Production | Description |
|----------|---------|------------|-------------|
| `MPESA_CONSUMER_KEY` | ✅ | ✅ | API consumer key |
| `MPESA_CONSUMER_SECRET` | ✅ | ✅ | API consumer secret |
| `MPESA_PASSKEY` | ✅ | ✅ | Lipa na M-Pesa passkey |
| `MPESA_SHORTCODE` | ✅ | ✅ | Paybill/Till number |

## Sample Configuration

### Environment Variables

```bash
# For Kenya
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
MPESA_SHORTCODE=174379
MPESA_ENVIRONMENT=sandbox
```

### JavaScript Configuration

```javascript
{
  mpesa: {
    // Required
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    passkey: process.env.MPESA_PASSKEY,
    shortcode: process.env.MPESA_SHORTCODE,
    
    // Optional
    environment: 'production', // or 'sandbox'
    
    // Callback URLs (must be HTTPS)
    callbackUrl: 'https://yourapp.com/webhooks/mpesa',
    timeoutUrl: 'https://yourapp.com/webhooks/mpesa/timeout',
    
    // Account reference (appears on customer's M-Pesa message)
    accountReference: 'YOURCOMPANY',
    
    // Transaction description
    transactionDesc: 'Payment for services'
  }
}
```

## API Operations

### STK Push (Customer Prompt)

Prompt customer to enter M-Pesa PIN:

```typescript
const result = await client.callTool('mpesa_stk_push', {
  phoneNumber: '254712345678',
  amount: 1000,
  accountReference: 'ORDER-123',
  transactionDesc: 'Payment for Order 123'
});
```

### B2C (Business to Customer)

Send money from business to customer:

```typescript
const result = await client.callTool('mpesa_b2c', {
  phoneNumber: '254712345678',
  amount: 1000,
  occasion: 'Salary Payment',
  remarks: 'Monthly salary'
});
```

### Transaction Status Query

Check transaction status:

```typescript
const status = await client.callTool('mpesa_transaction_status', {
  transactionId: 'YOUR_TRANSACTION_ID',
  originatorConversationId: 'ORIGINAL_CONVERSATION_ID'
});
```

### Account Balance

Check account balance:

```typescript
const balance = await client.callTool('mpesa_account_balance', {
  commandId: 'AccountBalance'
});
```

## Webhooks

M-Pesa sends notifications to your callback URLs. Configure webhook handling:

### Callback Payload

```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "12345-67890",
      "CheckoutRequestID": "ws_CO_1234567890",
      "ResultCode": 0,
      "ResultDesc": "The service request is processed successfully.",
      "CallbackMetadata": {
        "Item": [
          { "Name": "Amount", "Value": 1000 },
          { "Name": "MpesaReceiptNumber", "Value": "LGR7CO7Z27" },
          { "Name": "TransactionDate", "Value": 20240101120000 },
          { "Name": "PhoneNumber", "Value": 254712345678 }
        ]
      }
    }
  }
}
```

### Webhook Security

Verify webhook authenticity:

```typescript
const isValid = await client.callTool('mpesa_verify_webhook', {
  signature: req.headers['x-mpesa-signature'],
  payload: req.body
});
```

## Common Issues

### Issue: Invalid Security Credential

**Cause:** Wrong passkey or malformed password
**Solution:** 
- Verify your passkey is correct
- Ensure shortcode matches your passkey
- Check environment (sandbox vs production)

### Issue: Transaction Failed

**Common Error Codes:**

| Code | Description | Solution |
|------|-------------|----------|
| `0` | Success | ✅ Transaction completed |
| `1` | Insufficient funds | Customer needs to top up |
| `2` | Less than minimum | Amount below minimum (KES 1) |
| `6` | Transaction exists | Duplicate transaction |
| `2001` | Wrong credentials | Check consumer key/secret |
| `1032` | Cancelled by user | Customer cancelled |
| `1037` | Timeout | Transaction timed out |

### Issue: Callback Not Received

**Check:**
1. Callback URL is publicly accessible (HTTPS)
2. URL is correctly registered in Daraja portal
3. No firewall blocking requests
4. SSL certificate is valid

### Issue: B2C Not Working

**Requirements:**
- B2C must be enabled on your shortcode
- Sufficient balance in M-Pesa account
- Proper initiator credentials configured

## Test Credentials

Use these for sandbox testing. For detailed testing instructions, see the [Sandbox Setup Guide](./mpesa-sandbox-setup.md#step-5-sandbox-test-credentials).

```bash
# Sandbox Test Credentials
MPESA_CONSUMER_KEY=test_consumer_key
MPESA_CONSUMER_SECRET=test_consumer_secret
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
MPESA_SHORTCODE=174379

# Test Phone Numbers
# For successful: 254708374149
# For insufficient funds: 254708374150
```

## Rate Limits

| Operation | Rate Limit |
|-----------|------------|
| STK Push | 500/minute |
| B2C | 100/minute |
| Status Query | 1000/minute |
| Balance Query | 100/minute |

## Support

- **Kenya**: [Safaricom Developer Portal](https://developer.safaricom.co.ke/)
- **Documentation**: [Daraja API Docs](https://developer.safaricom.co.ke/docs)
- **Support Email**: apisupport@safaricom.co.ke

## See Also

- [M-Pesa Sandbox Setup Guide](./mpesa-sandbox-setup.md) - Detailed guide for obtaining sandbox credentials
- [Configuration](../configuration.md)
- [Webhooks](../webhooks.md)
- [API Reference](../api/reference.md)
