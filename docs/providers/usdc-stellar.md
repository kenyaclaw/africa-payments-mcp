# USDC on Stellar

Fast, cheap, and borderless stablecoin payments powered by the Stellar blockchain.

## Overview

USDC on Stellar combines:
- **Stability:** 1 USDC = $1 USD
- **Speed:** 3-5 second settlement
- **Low cost:** < $0.001 per transaction
- **Global reach:** Available worldwide
- **Regulatory compliance:** Fully-backed, regulated stablecoin

## Supported Features

| Feature | Status |
|---------|--------|
| Send USDC | ✅ Available |
| Receive USDC | ✅ Available |
| Anchor Integration | ✅ Available |
| Cross-Border | ✅ Available |
| Webhook Notifications | ✅ Available |

## Why USDC on Stellar?

### For Africa

1. **Remittances:** Send dollars instantly across borders
2. **Savings:** Store value in USD to hedge local currency inflation
3. **Payments:** Accept stable payments from global customers
4. **Trading:** Access global crypto markets

### Comparison

| Feature | Traditional Bank | M-Pesa | USDC on Stellar |
|---------|-----------------|--------|-----------------|
| Settlement | 1-5 days | Instant | 3-5 seconds |
| Cross-border | Expensive (~5%) | Limited | Cheap (<0.1%) |
| Hours | Business only | 24/7 | 24/7 |
| Minimum | High ($100+) | Low ($1) | Very low ($0.01) |

## Setup Instructions

### 1. Create Stellar Account

Use any Stellar wallet:
- [LOBSTR](https://lobstr.co/) (Mobile)
- [Solar](https://solarwallet.io/) (Desktop/Mobile)
- [Freighter](https://www.freighter.app/) (Browser extension)

Or programmatically:

```javascript
const StellarSdk = require('stellar-sdk');
const pair = StellarSdk.Keypair.random();
console.log('Public Key:', pair.publicKey());
console.log('Secret Key:', pair.secret());
```

### 2. Fund Account (Testnet)

For testing, use the [Stellar Laboratory Friendbot](https://laboratory.stellar.org/#account-creator?network=test):

```bash
curl "https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY"
```

### 3. Establish USDC Trustline

Before receiving USDC, you need a trustline:

```javascript
const transaction = new StellarSdk.TransactionBuilder(account, {
  fee: StellarSdk.BASE_FEE,
  networkPassphrase: StellarSdk.Networks.PUBLIC,
})
  .addOperation(StellarSdk.Operation.changeTrust({
    asset: new StellarSdk.Asset('USDC', 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'),
  }))
  .setTimeout(30)
  .build();
```

### 4. Configure Adapter

```typescript
{
  usdc_stellar: {
    enabled: true,
    environment: 'production',
    sourceAccount: 'GAA2QQ2WTHKR2VHV3AKMXLYPZHY2XRPNKXNMOQ4FEUF2DQZTOM2JNRFX',
    // Optional: For signing transactions
    // secretKey: process.env.STELLAR_SECRET_KEY,
    horizonUrl: 'https://horizon.stellar.org', // or testnet
    timeoutMs: 30000,
    retryAttempts: 3,
    // Optional: For on/off-ramp
    // useAnchor: true,
    // anchorUrl: 'https://anchor.example.com',
  }
}
```

## API Operations

### Send USDC

Send USDC to another Stellar address:

```typescript
const result = await client.callTool('usdc_stellar_send_money', {
  amount: 100,
  currency: 'USDC',
  description: 'Payment for services',
  metadata: {
    stellarAddress: 'GBZXC7VE7P5UBSW6SNUZ3EFR7F4XJH2JCJGHWHY2PUNPYD4PTILVFW5B',
    memo: 'Invoice-123', // Optional: helps recipient identify payment
    memoType: 'text', // 'text', 'id', 'hash', or 'return'
  },
});

// Note: The adapter returns a pending transaction.
// In production, integrate with Stellar SDK to sign and submit.
```

### Request Payment

Generate a payment request:

```typescript
const result = await client.callTool('usdc_stellar_request_payment', {
  amount: 250,
  currency: 'USDC',
  description: 'Payment for Order #456',
  customer: {
    name: 'John Doe',
    email: 'john@example.com',
  },
  metadata: {
    orderId: 'ORDER456',
  },
});

// Response includes:
// - destinationAddress: Your Stellar address
// - memo: Unique identifier for this payment
// - instructions: Human-readable payment instructions
// - networkPassphrase: For wallet integration
```

### Check Balance

Get USDC and XLM balances:

```typescript
const balance = await client.callTool('usdc_stellar_get_balance');

// Response: { amount: 1000.50, currency: 'USDC' }
```

### Verify Transaction

Check transaction status:

```typescript
const status = await client.callTool('usdc_stellar_verify_transaction', {
  transactionId: 'tx_hash_123',
});
```

### Validate Address

Check if a Stellar address is valid:

```typescript
const validation = await client.callTool('usdc_stellar_validate_address', {
  address: 'GBZXC7VE7P5UBSW6SNUZ3EFR7F4XJH2JCJGHWHY2PUNPYD4PTILVFW5B',
});

// Response: { valid: true }
```

## Anchor Integration

Anchors bridge fiat and crypto on Stellar. Popular African anchors:

| Anchor | Countries | Fiat | Crypto |
|--------|-----------|------|--------|
| Cowrie | Nigeria | NGN | USDC, XLM |
| ClickPesa | Tanzania | TZS | USDC, XLM |
| Leaf Global | Rwanda | RWF | USDC, XLM |
| MoneyGram International | Global | USD, EUR | USDC |

### Using Anchors

Enable anchor integration:

```typescript
{
  usdc_stellar: {
    useAnchor: true,
    anchorUrl: 'https://api.anchor.example.com',
  }
}
```

Then request payments will use the anchor's deposit flow.

## Webhooks

Stellar webhooks notify you of:
- Incoming payments
- Transaction confirmations
- Anchor status updates

### Configuration

Set up webhook endpoint:

```
POST https://your-server.com/webhooks/usdc-stellar
```

### Payload Examples

**Payment Received:**
```json
{
  "type": "payment",
  "id": "op_123",
  "source_account": "GBZXC7VE7P5UBSW6SNUZ3EFR7F4XJH2JCJGHWHY2PUNPYD4PTILVFW5B",
  "created_at": "2026-01-15T12:00:00Z",
  "transaction_hash": "tx_abc123",
  "transaction_successful": true,
  "asset_type": "credit_alphanum4",
  "asset_code": "USDC",
  "from": "GBZXC7VE7P5UBSW6SNUZ3EFR7F4XJH2JCJGHWHY2PUNPYD4PTILVFW5B",
  "to": "YOUR_ADDRESS",
  "amount": "100.0000000"
}
```

**Anchor Transaction Update:**
```json
{
  "eventType": "transaction.status_changed",
  "transaction": {
    "id": "anchor_tx_123",
    "kind": "deposit",
    "status": "completed",
    "amount_in": "1000.00",
    "amount_out": "995.00",
    "amount_fee": "5.00",
    "started_at": "2026-01-15T12:00:00Z",
    "completed_at": "2026-01-15T12:05:00Z"
  }
}
```

## Use Cases

### Cross-Border Payments

A business in Kenya paying a supplier in Nigeria:

```typescript
// Kenyan business sends USDC
const payment = await client.callTool('usdc_stellar_send_money', {
  amount: 5000,
  currency: 'USDC',
  metadata: {
    stellarAddress: 'NIGERIAN_SUPPLIER_ADDRESS',
    description: 'Invoice #123 - Goods',
  },
});

// Nigerian supplier receives in 5 seconds
// Can hold USDC or convert to NGN via anchor
```

### Remittances

Diaspora sending money home:

```typescript
// Request payment (family gets instructions)
const request = await client.callTool('usdc_stellar_request_payment', {
  amount: 200,
  currency: 'USDC',
  description: 'Family support - January',
  metadata: {
    // Family uses anchor to convert to local currency
  },
});
```

### Freelancer Payments

Pay remote workers in Africa:

```typescript
// Worker invoices in USDC
// Employer pays directly
// Worker can:
// 1. Hold as savings (USD stability)
// 2. Convert to local currency via anchor
// 3. Transfer to crypto exchange
```

## Common Issues

### Issue: Account Not Found

**Cause:** Account hasn't been created on Stellar
**Solution:** Fund account with at least 1 XLM

### Issue: No Trustline

**Cause:** Recipient hasn't established USDC trustline
**Solution:** Ask recipient to add USDC asset in their wallet

### Issue: Insufficient XLM

**Cause:** Not enough XLM for transaction fees
**Solution:** Maintain minimum 2 XLM balance

### Issue: Invalid Memo

**Cause:** Memo too long or wrong format
**Solution:**
- Text memo: Max 28 bytes
- ID memo: Must be numeric
- Hash: Must be 32 bytes hex

## Fees

| Type | Cost |
|------|------|
| Transaction | 0.00001 XLM (~$0.000001) |
| Path Payment | 0.00001 XLM + spread |
| Anchor Deposit | 0.1% - 1% |
| Anchor Withdrawal | 0.1% - 1% |

## Testnet Testing

Use Stellar testnet for development:

```typescript
{
  usdc_stellar: {
    sourceAccount: 'TESTNET_ADDRESS',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    environment: 'sandbox',
  }
}
```

Testnet USDC issuer: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`

## Security

### Best Practices

1. **Use multisig** for large accounts
2. **Store secret keys securely** (HSM, KMS)
3. **Validate addresses** before sending
4. **Use memos** to track payments
5. **Monitor accounts** for unauthorized activity

### Account Recovery

If secret key is lost, funds are unrecoverable. Options:
- Use multisig with recovery signers
- Split key using Shamir's Secret Sharing
- Use custodial wallet for non-technical users

## Resources

- [Stellar Developers](https://developers.stellar.org/)
- [Stellar Laboratory](https://laboratory.stellar.org/)
- [Stellar Expert Explorer](https://stellar.expert/)
- [USDC on Stellar](https://www.circle.com/en/usdc-multichain/stellar)

## See Also

- [Configuration](../configuration.md)
- [Webhooks](../webhooks.md)
- [API Reference](../api/reference.md)
- [Celo Provider](./celo.md)
- [M-Pesa Bridge](./mpesa-crypto-bridge.md)
