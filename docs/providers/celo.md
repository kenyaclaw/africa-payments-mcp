# Celo

Mobile-first blockchain designed for the real world - perfect for African payments.

## Overview

Celo is a blockchain platform focused on:
- **Mobile-first:** Designed for smartphone users
- **Stable value:** cUSD and cEUR stablecoins
- **Ultra-low fees:** ~$0.001 per transaction
- **Fast finality:** ~5 second blocks
- **Phone-based addressing:** Send to phone numbers

## Supported Features

| Feature | Status |
|---------|--------|
| Send cUSD/cEUR | ✅ Available |
| Receive cUSD/cEUR | ✅ Available |
| Valora Integration | ✅ Available |
| Phone-based Payments | ✅ Available |
| Webhook Notifications | ✅ Available |

## Why Celo for Africa?

### Designed for Emerging Markets

1. **Works on low-end phones** - Optimized for 2G/3G networks
2. **Ultra-low data usage** - Minimal bandwidth requirements
3. **No bank needed** - Just a phone number
4. **Local stablecoins** - cUSD protects against inflation
5. **Growing ecosystem** - Strong presence in Africa

### African Presence

- **Celo Camp Africa:** Startup accelerator
- **Grameen Foundation:** Financial inclusion partner
- **Mercy Corps:** Humanitarian payments
- **Valora:** Popular wallet across Africa

## Setup Instructions

### 1. Create Celo Wallet

**Option A: Valora (Recommended)**
- Download from [valoraapp.com](https://valoraapp.com/)
- Available on iOS and Android
- Simple phone number verification

**Option B: MetaMask**
- Add Celo network
- Network details:
  - **Mainnet:**
    - RPC: `https://forno.celo.org`
    - Chain ID: `42220`
    - Currency: `CELO`
  - **Alfajores (Testnet):**
    - RPC: `https://alfajores-forno.celo-testnet.org`
    - Chain ID: `44787`
    - Currency: `CELO`

### 2. Get Testnet CELO

For testing on Alfajores:

1. Visit [Alfajores Faucet](https://faucet.celo.org/)
2. Enter your wallet address
3. Receive test CELO

### 3. Configure Adapter

```typescript
{
  celo: {
    enabled: true,
    environment: 'production', // or 'sandbox' for Alfajores
    fromAddress: '0x1234567890abcdef1234567890abcdef12345678',
    // Optional: For signing transactions
    // privateKey: process.env.CELO_PRIVATE_KEY,
    rpcUrl: 'https://forno.celo.org', // or Alfajores for testing
    useValora: true, // Generate Valora deep links
    timeoutMs: 30000,
    retryAttempts: 3,
  }
}
```

## API Operations

### Send cUSD

Send cUSD to a Celo address:

```typescript
const result = await client.callTool('celo_send_money', {
  amount: 50,
  currency: 'cUSD',
  description: 'Payment for services',
  recipient: {
    name: 'John Doe',
  },
  metadata: {
    celoAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
    orderId: 'ORDER123',
  },
});

// Note: Returns pending transaction.
// In production, sign and submit using ContractKit.
```

### Send CELO

Send native CELO token:

```typescript
const result = await client.callTool('celo_send_money', {
  amount: 10,
  currency: 'CELO',
  description: 'Transfer CELO',
  metadata: {
    celoAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
  },
});
```

### Request Payment

Generate a payment request with Valora deep link:

```typescript
const result = await client.callTool('celo_request_payment', {
  amount: 100,
  currency: 'cUSD',
  description: 'Payment for Order #456',
  customer: {
    name: 'Jane Smith',
    phone: {
      countryCode: '254',
      nationalNumber: '712345678',
    },
  },
  expiryMinutes: 60,
  metadata: {
    orderId: 'ORDER456',
  },
});

// Response includes:
// - valoraDeeplink: Direct link to Valora app
// - qrCodeData: For QR code generation
// - instructions: Human-readable instructions
```

### Check Balance

Get CELO and stablecoin balances:

```typescript
// Get primary balance
const balance = await client.callTool('celo_get_balance');

// Get all token balances
const allBalances = await client.callTool('celo_get_all_balances');
// Returns: [
//   { amount: 25.5, currency: 'CELO' },
//   { amount: 150, currency: 'cUSD' },
//   { amount: 50, currency: 'cEUR' }
// ]
```

### Verify Transaction

Check transaction status:

```typescript
const status = await client.callTool('celo_verify_transaction', {
  transactionId: '0xtx_hash_123',
});
```

### Validate Address

Check if address is valid:

```typescript
const validation = await client.callTool('celo_validate_address', {
  address: '0x1234567890abcdef1234567890abcdef12345678',
});
```

### Estimate Gas

Get transaction fee estimate:

```typescript
const estimate = await client.callTool('celo_estimate_gas', {
  to: '0xabcdef1234567890abcdef1234567890abcdef12',
  amount: 10,
  currency: 'cUSD',
});

// Response includes gas amount and estimated fee
// Typical cUSD transfer: ~$0.001
```

## Webhooks

Celo webhooks notify you of:
- Incoming payments
- Transaction confirmations
- Smart contract events

### Configuration

Set up webhook endpoint:

```
POST https://your-server.com/webhooks/celo
```

### Payload Examples

**Transfer Event:**
```json
{
  "event": "transfer",
  "transaction": {
    "hash": "0xtx_hash_123",
    "from": "0xfrom_address",
    "to": "0xto_address",
    "value": "50000000000000000000",
    "gasPrice": "1000000000",
    "gasUsed": "25000",
    "timestamp": "2026-01-15T12:00:00Z",
    "blockNumber": 12345678,
    "status": "success",
    "feeCurrency": "0x765DE816845861e75A25fCA122bb6898B8B1282a"
  },
  "token": {
    "address": "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    "symbol": "cUSD",
    "name": "Celo Dollar",
    "decimals": 18
  }
}
```

**Valora Payment Notification:**
```json
{
  "type": "payment_received",
  "transactionHash": "0xtx_hash_456",
  "amount": "100",
  "currency": "cUSD",
  "fromAddress": "0xsender_address",
  "toAddress": "0xyour_address",
  "timestamp": "2026-01-15T12:00:00Z",
  "comment": "Payment for lunch"
}
```

## Use Cases

### Merchant Payments

Accept cUSD payments in-store:

```typescript
// Generate payment request
const request = await client.callTool('celo_request_payment', {
  amount: 25,
  currency: 'cUSD',
  description: 'Grocery purchase',
});

// Show QR code to customer
// Customer scans with Valora
// Payment confirmed in 5 seconds
```

### Cross-Border Payments

Send money between African countries:

```typescript
// Kenya to Nigeria
const payment = await client.callTool('celo_send_money', {
  amount: 100,
  currency: 'cUSD',
  description: 'Remittance',
  metadata: {
    celoAddress: '0xnigeria_recipient',
  },
});

// Recipient in Nigeria:
// - Keeps as cUSD (USD stability)
// - Swaps to cEUR if needed
// - Withdraws to local bank via anchor
```

### Savings

Protect against inflation:

```typescript
// Convert local currency to cUSD
// Hold stable value
// Can earn yield via Moola, Ubeswap, etc.
```

### Payroll

Pay remote workers:

```typescript
// Pay employees in cUSD
// Low fees vs. traditional bank transfers
// Instant settlement
// Workers can:
// - Spend with Valora
// - Save as cUSD
// - Cash out locally
```

## Common Issues

### Issue: Insufficient CELO for Gas

**Cause:** Need CELO to pay transaction fees
**Solution:** 
- Keep small amount of CELO (2-5 CELO)
- cUSD transfers use cUSD for fees (fee abstraction)

### Issue: Transaction Failed

**Common causes:**
- Insufficient balance
- Invalid recipient address
- Network congestion

**Solutions:**
- Check balance
- Verify address format
- Increase gas price

### Issue: Valora Link Not Working

**Causes:**
- Valora not installed
- Invalid address format
- Deep link blocked

**Solutions:**
- Provide direct address as fallback
- Use QR code instead
- Check app permissions

## Fees

| Operation | Fee |
|-----------|-----|
| cUSD Transfer | ~$0.001 (paid in cUSD) |
| CELO Transfer | ~$0.001 (paid in CELO) |
| Smart Contract | Variable |
| Valora Swap | 0.5% - 1% |

## Token Addresses (Mainnet)

| Token | Address |
|-------|---------|
| CELO (native) | - |
| cUSD | `0x765DE816845861e75A25fCA122bb6898B8B1282a` |
| cEUR | `0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73` |
| cREAL | `0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787` |

## Valora Deep Links

### Format

```
https://valoraapp.com/pay?address={recipient}&amount={amount}&token={token}&comment={description}
```

### Examples

**Pay 10 cUSD:**
```
https://valoraapp.com/pay?address=0x1234...&amount=10&token=cUSD&comment=Payment
```

**Pay 5 CELO:**
```
https://valoraapp.com/pay?address=0x1234...&amount=5&token=CELO
```

## Resources

- [Celo Developers](https://docs.celo.org/)
- [Valora](https://valoraapp.com/)
- [Celo Explorer](https://explorer.celo.org/)
- [Celo Camp](https://www.celocamp.com/)
- [Alfajores Faucet](https://faucet.celo.org/)

## See Also

- [Configuration](../configuration.md)
- [Webhooks](../webhooks.md)
- [API Reference](../api/reference.md)
- [USDC Stellar](./usdc-stellar.md)
- [M-Pesa Bridge](./mpesa-crypto-bridge.md)
