# M-Pesa Crypto Bridge

The bridge between Africa's most popular payment method and the future of global finance.

## Overview

The M-Pesa Crypto Bridge enables seamless conversion between:
- **M-Pesa** (mobile money) 
- **Cryptocurrency** (USDC, USDT, BTC, etc.)

This is the **FUTURE** of African payments - combining the reach of M-Pesa with the global accessibility of crypto.

## How It Works

### On-Ramp: M-Pesa → Crypto

```
1. User sends M-Pesa to bridge's Paybill
2. Bridge receives KES
3. Bridge sends USDC to user's wallet
4. User receives crypto in minutes
```

### Off-Ramp: Crypto → M-Pesa

```
1. User sends USDC to bridge's wallet
2. Bridge receives crypto
3. Bridge sends M-Pesa to user's phone
4. User receives KES in minutes
```

## Supported Bridge Providers

| Provider | Countries | KES → Crypto | Crypto → KES | Website |
|----------|-----------|--------------|--------------|---------|
| **Kotani Pay** | Kenya, Ghana, Zambia | ✅ | ✅ | [kotanipay.com](https://kotanipay.com/) |
| **Yellow Card** | 16+ African countries | ✅ | ✅ | [yellowcard.io](https://yellowcard.io/) |
| **Local Exchanges** | Varies | ✅ | ✅ | Custom |

## Supported Features

| Feature | Status |
|---------|--------|
| M-Pesa → USDC | ✅ Available |
| USDC → M-Pesa | ✅ Available |
| Rate Quotes | ✅ Available |
| Webhook Notifications | ✅ Available |
| Refunds | ✅ Available |

## Setup Instructions

### 1. Choose Bridge Provider

**Kotani Pay** (Recommended for Kenya)
- Focused on East Africa
- Competitive rates
- Fast settlement
- WhatsApp/SMS interface

**Yellow Card**
- Wider African coverage
- More currencies
- Established infrastructure
- Bank integration

### 2. Get API Credentials

Contact your chosen provider:

**Kotani Pay:**
1. Visit [kotanipay.com](https://kotanipay.com/)
2. Apply for API access
3. Complete KYC/AML
4. Receive API keys

**Yellow Card:**
1. Visit [yellowcard.io](https://yellowcard.io/)
2. Sign up for business account
3. Apply for API access
4. Receive API keys

### 3. Configure Adapter

```typescript
{
  mpesa_crypto_bridge: {
    enabled: true,
    environment: 'production',
    bridgeProvider: 'kotani', // or 'yellowcard', 'custom'
    apiKey: process.env.BRIDGE_API_KEY,
    apiSecret: process.env.BRIDGE_API_SECRET,
    baseUrl: 'https://api.kotanipay.com/v1', // Provider-specific
    webhookSecret: process.env.BRIDGE_WEBHOOK_SECRET,
    timeoutMs: 60000, // Crypto bridges take longer
    retryAttempts: 3,
  }
}
```

## API Operations

### Get Quote

Get current exchange rate before initiating:

```typescript
const quote = await client.callTool('mpesa_crypto_bridge_get_rates', {
  from: 'KES',
  to: 'USDC',
  amount: 10000,
});

// Response:
// {
//   exchangeRate: 0.0077, // 1 KES = 0.0077 USDC
//   estimatedAmount: 77, // You'll receive ~77 USDC
//   fee: 200, // 200 KES fee
//   expiresAt: '2026-01-15T12:05:00Z' // Quote valid for 5 min
// }
```

### On-Ramp: M-Pesa to USDC

Convert M-Pesa to cryptocurrency:

```typescript
const result = await client.callTool('mpesa_crypto_bridge_request_payment', {
  amount: 10000,
  currency: 'KES',
  description: 'Buy USDC',
  customer: {
    name: 'John Doe',
    phone: {
      countryCode: '254',
      nationalNumber: '712345678',
    },
  },
  metadata: {
    walletAddress: '0xYourWalletAddress123...', // Required!
  },
});

// Response includes:
// - paybillNumber: M-Pesa Paybill to send to
// - accountNumber: Your reference number
// - instructions: Step-by-step M-Pesa payment instructions
// - quoteId: Reference for the exchange rate

// User then:
// 1. Opens M-Pesa on phone
// 2. Selects "Lipa na M-Pesa" → "Paybill"
// 3. Enters Paybill number from response
// 4. Enters Account number from response
// 5. Enters Amount: 10000
// 6. Confirms with PIN
// 7. Receives USDC in wallet (usually within 5-10 minutes)
```

### Off-Ramp: USDC to M-Pesa

Convert cryptocurrency to M-Pesa:

```typescript
const result = await client.callTool('mpesa_crypto_bridge_send_money', {
  amount: 100,
  currency: 'USDC',
  description: 'Sell USDC for M-Pesa',
  recipient: {
    name: 'Jane Smith',
    phone: {
      countryCode: '254',
      nationalNumber: '798765432',
    },
  },
  metadata: {
    lightningInvoice: 'lnbc...', // If using Lightning
    // OR for direct crypto:
    walletAddress: '0xBridgeWalletAddress...',
  },
});

// Response includes:
// - walletAddress: Send USDC to this address
// - amountToSend: Exact amount to send
// - instructions: How to complete the transfer
// - eta: Estimated time to receive KES

// User then:
// 1. Sends USDC to provided wallet address
// 2. Bridge confirms receipt on blockchain
// 3. Bridge sends M-Pesa to phone number
// 4. User receives KES (usually within 5-10 minutes)
```

### Check Transaction Status

Track your on/off-ramp transaction:

```typescript
const status = await client.callTool('mpesa_crypto_bridge_verify_transaction', {
  transactionId: 'bridge_tx_123',
});

// Response shows:
// - Current status (pending/processing/completed/failed)
// - Amounts sent and received
// - External transaction IDs (M-Pesa reference)
// - Any failure reasons
```

### Get Supported Trading Pairs

See available conversion options:

```typescript
const pairs = await client.callTool('mpesa_crypto_bridge_get_supported_pairs');

// Returns array of:
// {
//   from: 'KES',
//   to: 'USDC',
//   minAmount: 100,
//   maxAmount: 1000000,
//   feePercentage: 2
// }
```

## Webhooks

Real-time notifications for bridge transactions.

### Configuration

Set up webhook endpoint:

```
POST https://your-server.com/webhooks/mpesa-crypto-bridge
```

Configure webhook URL with your bridge provider.

### Webhook Events

| Event | Description |
|-------|-------------|
| `transaction.created` | Transaction initiated |
| `transaction.processing` | Payment received, processing |
| `transaction.completed` | Conversion complete |
| `transaction.failed` | Transaction failed |
| `transaction.refunded` | Refund processed |

### Payload Example

```json
{
  "event": "transaction.completed",
  "data": {
    "transactionId": "bridge_tx_123",
    "type": "onramp",
    "status": "completed",
    "fromAmount": 10000,
    "fromCurrency": "KES",
    "toAmount": 77,
    "toCurrency": "USDC",
    "phoneNumber": "254712345678",
    "walletAddress": "0xuserwallet...",
    "externalTransactionId": "MPESA123456",
    "createdAt": "2026-01-15T12:00:00Z",
    "updatedAt": "2026-01-15T12:08:00Z",
    "completedAt": "2026-01-15T12:08:00Z"
  },
  "timestamp": "2026-01-15T12:08:00Z",
  "signature": "webhook_signature_for_verification"
}
```

### Verifying Webhooks

```typescript
// The adapter automatically verifies webhook signatures
// if webhookSecret is configured

const isValid = await client.callTool('mpesa_crypto_bridge_verify_webhook', {
  payload: req.body,
  signature: req.headers['x-webhook-signature'],
});
```

## Use Cases

### Remittances

Diaspora sending money home:

```typescript
// Abroad: Buy USDC on Coinbase/Binance
// Send USDC to bridge
// Family receives KES on M-Pesa

const offramp = await client.callTool('mpesa_crypto_bridge_send_money', {
  amount: 500, // USDC
  recipient: {
    name: 'Family Member',
    phone: { countryCode: '254', nationalNumber: '712345678' },
  },
});

// Cost: ~2% vs 5-10% for traditional remittance
// Time: 5-10 minutes vs 1-5 days
```

### Freelancer Payments

Pay African freelancers:

```typescript
// Client pays in USDC
// Freelancer receives KES
// No bank account needed
```

### Import/Export

Pay international suppliers:

```typescript
// Kenyan business:
// 1. Converts KES to USDC via bridge
// 2. Sends USDC to supplier in China/US/Europe
// 3. Supplier receives in minutes
// 4. Cost: ~2% vs 5%+ for bank wire
```

### Savings

Protect against inflation:

```typescript
// Convert KES to USDC
// Hold USD-stable savings
// Convert back to KES when needed
```

### Merchant Settlements

Accept crypto, receive M-Pesa:

```typescript
// Customer pays with USDC
// Merchant receives KES
// Daily settlement to M-Pesa
```

## Common Issues

### Issue: Transaction Pending Too Long

**Causes:**
- M-Pesa network delay
- Blockchain congestion
- Manual review required

**Solutions:**
- Wait up to 30 minutes
- Contact support with transaction ID
- Check M-Pesa confirmation SMS

### Issue: Wrong Amount Sent

**Causes:**
- User sent different amount than quoted
- Exchange rate changed

**Solutions:**
- Amount difference refunded or additional amount requested
- Contact support to resolve

### Issue: Wallet Address Error

**Causes:**
- Invalid wallet address format
- Wrong network (e.g., sent BSC USDC instead of Ethereum)

**Solutions:**
- Double-check address before sending
- Use provided exact address
- Contact support if sent to wrong address

### Issue: M-Pesa Not Received

**Causes:**
- Phone number incorrect
- M-Pesa account issues
- Network delays

**Solutions:**
- Verify phone number format (+254...)
- Check M-Pesa balance
- Wait 10-15 minutes
- Contact support

## Fees

| Provider | KES → Crypto | Crypto → KES | Minimum |
|----------|-------------|--------------|---------|
| Kotani Pay | 1.5-2.5% | 1.5-2.5% | 100 KES |
| Yellow Card | 2-3% | 2-3% | 500 KES |

Additional blockchain network fees may apply.

## Limits

| Provider | Daily Limit | Monthly Limit | KYC Required |
|----------|-------------|---------------|--------------|
| Kotani Pay | 1M KES | 10M KES | Yes |
| Yellow Card | Varies | Varies | Yes |

## Security

### Best Practices

1. **Verify webhook signatures** - Prevent spoofing
2. **Use unique account numbers** - Track payments
3. **Monitor transactions** - Detect anomalies
4. **Secure API keys** - Rotate regularly
5. **Validate phone numbers** - Ensure correct format

### Compliance

Bridge providers handle:
- KYC/AML verification
- Transaction monitoring
- Regulatory reporting
- Suspicious activity detection

## Test Mode

For testing without real money:

```typescript
{
  mpesa_crypto_bridge: {
    environment: 'sandbox',
    // Use test API keys from provider
  }
}
```

Test transactions use fake funds and don't affect real balances.

## Provider-Specific Notes

### Kotani Pay

- **Settlement time:** 5-10 minutes
- **Support:** WhatsApp, SMS, Email
- **Coverage:** Kenya, Ghana, Zambia
- **WhatsApp:** +254 711 082 399

### Yellow Card

- **Settlement time:** 5-15 minutes  
- **Support:** Email, In-app chat
- **Coverage:** 16+ countries
- **App:** Available on iOS/Android

## Comparison with Traditional Methods

| Method | Fee | Time | Bank Account | Global Reach |
|--------|-----|------|--------------|--------------|
| Bank Wire | 3-5% | 1-5 days | Required | Limited |
| MoneyGram | 5-10% | Instant-1 day | No | Limited |
| M-Pesa | 1-2% | Instant | No | Limited |
| **Bridge** | **2-3%** | **5-10 min** | **No** | **Global** |

## Resources

- [Kotani Pay](https://kotanipay.com/)
- [Yellow Card](https://yellowcard.io/)
- [Celo Bridge](https://app.optics.app/)
- [Stellar Anchors](https://stellar.org/anchors)

## The Future is Here 🚀

This is the **game-changer** for African payments:

1. **1.5 billion** people use mobile money in emerging markets
2. **$1 trillion** processed annually via mobile money
3. **Crypto** enables global access to financial services
4. **Bridges** connect these two worlds

**The result:** Anyone with a basic phone can participate in the global economy.

## See Also

- [Configuration](../configuration.md)
- [Webhooks](../webhooks.md)
- [API Reference](../api/reference.md)
- [M-Pesa](./mpesa.md)
- [Bitcoin Lightning](./bitcoin-lightning.md)
- [USDC Stellar](./usdc-stellar.md)
- [Celo](./celo.md)
