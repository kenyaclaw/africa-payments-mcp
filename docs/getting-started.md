# Getting Started

Welcome to Africa Payments MCP! This guide will help you get up and running with payment processing in African markets.

## Prerequisites

Before you begin, make sure you have:

- **Node.js 18+** or **Bun** installed
- An account with at least one supported payment provider
- API credentials from your chosen provider(s)

## 1. Installation

### Using npx (Recommended)

The fastest way to get started is using npx:

```bash
npx -y @africa-payments/mcp-server
```

### Global Installation

```bash
npm install -g @africa-payments/mcp-server
```

### Local Installation

```bash
npm install @africa-payments/mcp-server
```

## 2. Configuration

### Environment Variables

Create a `.env` file or set environment variables for your chosen providers:

::: code-group

```bash [M-Pesa]
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_PASSKEY=your_passkey
MPESA_SHORTCODE=your_shortcode
```

```bash [Paystack]
PAYSTACK_SECRET_KEY=sk_live_your_secret_key
PAYSTACK_PUBLIC_KEY=pk_live_your_public_key
```

```bash [MTN MoMo]
MTN_MOMO_SUBSCRIPTION_KEY=your_subscription_key
MTN_MOMO_API_USER=your_api_user
MTN_MOMO_API_KEY=your_api_key
```

```bash [IntaSend]
INTASEND_PUBLIC_KEY=your_public_key
INTASEND_SECRET_KEY=your_secret_key
```

```bash [Airtel Money]
AIRTEL_MONEY_CLIENT_ID=your_client_id
AIRTEL_MONEY_CLIENT_SECRET=your_client_secret
```

:::

### Claude Desktop Setup

Add the MCP server to your Claude Desktop configuration:

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```bash
%APPDATA%\Claude\claude_desktop_config.json
```

**Configuration:**
```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "npx",
      "args": ["-y", "@africa-payments/mcp-server"],
      "env": {
        "MPESA_CONSUMER_KEY": "your_consumer_key",
        "MPESA_CONSUMER_SECRET": "your_consumer_secret",
        "MPESA_PASSKEY": "your_passkey",
        "MPESA_SHORTCODE": "your_shortcode"
      }
    }
  }
}
```

### Cursor IDE Setup

Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "npx",
      "args": ["-y", "@africa-payments/mcp-server"],
      "env": {
        "MPESA_CONSUMER_KEY": "your_consumer_key",
        "MPESA_CONSUMER_SECRET": "your_consumer_secret"
      }
    }
  }
}
```

## 3. First Payment

Once configured, you can start making payments! Here are some examples:

### Send Money (M-Pesa STK Push)

```typescript
// Ask Claude: "Send KES 1000 to +254712345678"
// Or use the unified tool directly:
const result = await client.callTool('unified_send_money', {
  recipient_phone: '+254712345678',
  amount: 1000,
  currency: 'KES',
  provider: 'mpesa'
});
```

### Request Payment (Paystack)

```typescript
// Create a payment request
const result = await client.callTool('paystack_initialize', {
  email: 'customer@example.com',
  amount: 500000, // Amount in kobo (5000 NGN)
  currency: 'NGN',
  reference: 'unique_transaction_ref',
  callback_url: 'https://yourapp.com/webhook/paystack'
});
```

### Check Transaction Status

```typescript
// Check status of any transaction
const status = await client.callTool('unified_check_status', {
  transaction_id: 'your_transaction_id',
  provider: 'mpesa'
});
```

## 4. Testing

### Sandbox Mode

All providers support sandbox/testing environments. Use test credentials to simulate transactions:

::: tip Testing Tips
- Use small amounts (KES 1-10) for initial tests
- Test both successful and failed scenarios
- Verify webhook handling with ngrok for local testing
:::

### Test Credentials

**M-Pesa Sandbox:**
- Consumer Key: `test_consumer_key`
- Consumer Secret: `test_consumer_secret`
- Shortcode: `174379`
- Passkey: `bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919`

**Paystack Test:**
- Secret Key: `YOUR_TEST_SECRET_KEY_HERE`
- Use test card: `4084084084084081`

### Running Tests

```bash
# Clone the repository
git clone https://github.com/kenyaclaw/africa-payments-mcp.git
cd africa-payments-mcp

# Install dependencies
npm install

# Run tests
npm test

# Run specific provider tests
npm test -- --grep "M-Pesa"
```

## Next Steps

- **[Configure Providers](./providers/)** - Set up your payment providers
- **[Learn the Tools](./tools/)** - Explore available payment tools
- **[Set up Webhooks](./webhooks.md)** - Handle payment notifications
- **[View Examples](./examples/)** - See more usage examples

## Troubleshooting

### Common Issues

**Issue:** Connection refused when starting MCP server
- **Solution:** Check that all required environment variables are set

**Issue:** Authentication errors with provider
- **Solution:** Verify your API credentials are correct and not expired

**Issue:** Webhooks not being received
- **Solution:** Ensure your webhook URL is publicly accessible and verify signatures

### Getting Help

- Check our [GitHub Issues](https://github.com/kenyaclaw/africa-payments-mcp/issues)
- Join our [Discord Community](https://discord.gg/africa-payments-mcp)
- Email us at [hello@kenyaclaw.com](mailto:hello@kenyaclaw.com)
