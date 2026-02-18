# Bitcoin Lightning

The Bitcoin Lightning Network enables instant, low-cost Bitcoin transactions perfect for African payments.

## Overview

Lightning Network is a Layer 2 solution on top of Bitcoin that enables:
- **Instant settlement** (sub-second confirmation)
- **Ultra-low fees** (~$0.001 per transaction)
- **Microtransactions** (as low as 1 satoshi)
- **No chargebacks** (final settlement)

## Supported Features

| Feature | Status |
|---------|--------|
| Generate Invoices | ✅ Available |
| Pay Invoices | ✅ Available |
| Check Balance | ✅ Available |
| Validate Invoices | ✅ Available |
| Webhook Notifications | ✅ Available |

## Supported Node Types

### LND (Lightning Network Daemon)

The most popular Lightning implementation, developed by Lightning Labs.

**Requirements:**
- LND node with REST API enabled
- macaroon for authentication
- TLS certificate for secure connection

### Core Lightning (c-lightning)

Developed by Blockstream, known for its flexibility and plugin system.

**Requirements:**
- Core Lightning node with REST plugin
- Rune for authentication

## Setup Instructions

### 1. Set Up Lightning Node

#### Option A: LND

```bash
# Install LND
# See: https://docs.lightning.engineering/lightning-network-tools/lnd/run-lnd

# Enable REST API
lnd --restlisten=localhost:8080
```

#### Option B: Core Lightning

```bash
# Install Core Lightning
# See: https://docs.corelightning.org/docs/installation

# Enable REST plugin
lightningd --plugin=/path/to/cln-rest-plugin
```

### 2. Get Credentials

#### For LND:

```bash
# Find macaroon (hex-encoded)
xxd -p ~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon | tr -d '\n'
```

#### For Core Lightning:

```bash
# Generate rune
lightning-cli commando-rune restrictions='[["time", {"le": 172800}]]'
```

### 3. Configure Adapter

```typescript
{
  bitcoin_lightning: {
    enabled: true,
    environment: 'production',
    nodeType: 'lnd', // or 'core_lightning'
    nodeUrl: 'https://your-node:8080',
    macaroonHex: 'your_macaroon_hex', // For LND
    // rune: 'your_rune', // For Core Lightning
    timeoutMs: 30000,
    retryAttempts: 3,
  }
}
```

## API Operations

### Generate Invoice

Create a Lightning invoice to receive payment:

```typescript
const result = await client.callTool('bitcoin_lightning_request_payment', {
  amount: 0.001, // BTC
  currency: 'BTC',
  description: 'Payment for Order #123',
  expiryMinutes: 60,
  metadata: {
    orderId: 'ORDER123',
    customerEmail: 'customer@example.com',
  },
});

// Response includes:
// - paymentRequest: The BOLT11 invoice string
// - qrCodeData: Same as paymentRequest (can be used for QR code)
// - expiresAt: Invoice expiration time
```

### Pay Invoice

Pay a Lightning invoice:

```typescript
const result = await client.callTool('bitcoin_lightning_send_money', {
  lightningInvoice: 'lnbc1m1p3w0de0pp5...',
  amount: 0.001,
  currency: 'BTC',
  description: 'Payment to merchant',
  metadata: {
    orderId: 'ORDER123',
  },
});

// Response includes:
// - paymentHash: Unique payment identifier
// - paymentPreimage: Proof of payment
// - feeSatoshis: Fee paid for routing
```

### Check Balance

Get available channel balance:

```typescript
const balance = await client.callTool('bitcoin_lightning_get_balance');

// Response: { amount: 0.5, currency: 'BTC' }
```

### Validate Invoice

Check if an invoice is valid before paying:

```typescript
const validation = await client.callTool('bitcoin_lightning_validate_invoice', {
  invoice: 'lnbc1m1p3w0de0pp5...',
});

// Response:
// {
//   valid: true,
//   amount: 0.001,
//   description: 'Payment for Order #123',
//   expiry: '2026-01-15T13:00:00Z'
// }
```

## Webhooks

Lightning nodes can send webhook notifications when:
- An invoice is settled (payment received)
- A payment is sent (outgoing payment)

### Webhook Configuration

Configure your Lightning node to send webhooks to:

```
POST https://your-server.com/webhooks/bitcoin-lightning
```

### Webhook Payload Example

```json
{
  "event": "invoice.settled",
  "data": {
    "payment_hash": "abc123...",
    "payment_request": "lnbc1m1p3w0de0pp5...",
    "amount_sat": 100000,
    "amount_msat": 100000000,
    "settled_at": "2026-01-15T12:00:00Z",
    "preimage": "def456...",
    "memo": "Payment for Order #123"
  },
  "node_id": "02abcdef...",
  "timestamp": "2026-01-15T12:00:00Z"
}
```

## Use Cases for Africa

### Cross-Border Remittances

Send money from diaspora to family in Africa:
1. Sender buys Bitcoin via exchange
2. Sends via Lightning to recipient's wallet
3. Recipient swaps to local currency or keeps as BTC

**Benefits:**
- 99% cheaper than traditional remittance (Western Union, MoneyGram)
- Instant settlement vs. 1-5 days
- No bank account required

### Merchant Payments

Accept Bitcoin payments in-store or online:
1. Generate invoice with amount
2. Show QR code to customer
3. Customer scans and pays
4. Payment confirmed in seconds

### Microtransactions

Enable pay-per-use services:
- Pay per article (news)
- Pay per minute (WiFi)
- Pay per play (gaming)
- Pay per API call

## Common Issues

### Issue: Payment Failed - No Route

**Cause:** No payment channel path to destination
**Solutions:**
- Try a different amount
- Wait for network to find a route
- Open a direct channel to destination

### Issue: Insufficient Balance

**Cause:** Not enough funds in payment channels
**Solution:**
- Add more funds to channels
- Wait for incoming payments
- Open new channels

### Issue: Invoice Expired

**Cause:** Payment took too long
**Solution:**
- Generate a new invoice
- Increase expiry time
- Use a faster wallet

## Security Best Practices

### Node Security

- Keep node behind firewall
- Use strong macaroon/rune restrictions
- Enable TLS for REST API
- Regular backups of channel state

### Key Management

- Store macaroons securely
- Use runes with time restrictions
- Never expose admin macaroon publicly
- Rotate credentials regularly

## Rate Limits

| Operation | Rate Limit |
|-----------|------------|
| Generate Invoice | 100/minute |
| Pay Invoice | 50/minute |
| Validate Invoice | 200/minute |
| Get Balance | 60/minute |

## Fees

Lightning fees are dynamic and typically:
- **Base fee:** 0-10 satoshis per payment
- **Fee rate:** 0.01%-0.5% of amount
- **Typical total:** ~$0.001 per transaction

## Testnet Testing

For testing, use Bitcoin Testnet:

```typescript
{
  bitcoin_lightning: {
    nodeUrl: 'https://testnet-node:8080',
    environment: 'sandbox',
    // Use testnet macaroon/rune
  }
}
```

Get testnet Bitcoin from:
- https://testnet-faucet.mempool.co/
- https://bitcoinfaucet.uo1.net/

## See Also

- [Configuration](../configuration.md)
- [Webhooks](../webhooks.md)
- [API Reference](../api/reference.md)
- [LND Documentation](https://docs.lightning.engineering/)
- [Core Lightning Documentation](https://docs.corelightning.org/)
