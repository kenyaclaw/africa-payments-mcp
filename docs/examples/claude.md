# Claude Desktop Setup

Configure Africa Payments MCP with Claude Desktop for natural language payment operations.

## Installation

### 1. Install Claude Desktop

Download and install [Claude Desktop](https://claude.ai/download) for your operating system.

### 2. Configure MCP Server

Add Africa Payments MCP to your Claude Desktop configuration:

**macOS:**
```bash
# Edit config file
vim ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows:**
```bash
# Edit config file
notepad %APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```bash
# Edit config file
vim ~/.config/Claude/claude_desktop_config.json
```

### 3. Configuration Examples

#### M-Pesa Only

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
        "MPESA_SHORTCODE": "174379",
        "MPESA_ENVIRONMENT": "production"
      }
    }
  }
}
```

#### Multiple Providers

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "npx",
      "args": ["-y", "@africa-payments/mcp-server"],
      "env": {
        "MPESA_CONSUMER_KEY": "your_mpesa_key",
        "MPESA_CONSUMER_SECRET": "your_mpesa_secret",
        "MPESA_PASSKEY": "your_passkey",
        "MPESA_SHORTCODE": "174379",
        "PAYSTACK_SECRET_KEY": "sk_live_your_key",
        "INTASEND_PUBLIC_KEY": "ISPubKey_live_your_key",
        "INTASEND_SECRET_KEY": "ISSecretKey_live_your_key"
      }
    }
  }
}
```

#### With Config File

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "npx",
      "args": [
        "-y", 
        "@africa-payments/mcp-server",
        "--config",
        "/path/to/africa-payments.config.js"
      ],
      "env": {
        "WEBHOOK_SECRET": "your_webhook_secret"
      }
    }
  }
}
```

## Usage

### Natural Language Commands

Once configured, you can use natural language with Claude:

#### Send Money

```
"Send KES 1000 to 0712345678"
"Pay 5000 shillings to +254723456789"
"Transfer 2000 KES to John at 0734567890"
```

#### Request Payment

```
"Request 1500 KES from 0712345678"
"Ask customer at +254723456789 to pay 3000"
"Send payment request for 5000 to this phone: 0700123456"
```

#### Check Status

```
"Check if payment ORDER-123 was received"
"What's the status of transaction txn_456?"
"Did John pay his invoice?"
```

#### Get Balance

```
"What's my M-Pesa balance?"
"Check my wallet balance"
"How much money do I have?"
```

#### Multi-Currency

```
"Send 5000 NGN to +2348012345678"
"Request 100 GHS from customer in Ghana"
"Check Paystack balance in Nigeria"
```

### Example Conversations

#### Business Payment

```
You: Send KES 5000 to my supplier at 0722123456 for invoice INV-2024-001

Claude: I'll send KES 5,000 to +254722123456 for invoice INV-2024-001.

Transaction Details:
- Amount: KES 5,000
- Recipient: +254722123456
- Reference: INV-2024-001
- Provider: M-Pesa

Confirm to proceed? (Yes/No)

You: Yes

Claude: ✅ Payment sent successfully!

Transaction ID: LGR7CO7Z27
Status: Pending
Recipient will receive the funds shortly.
```

#### Payment Collection

```
You: Request KES 1,500 from customer 0712345678 for order #1234

Claude: I'll request KES 1,500 from +254712345678 for order #1234.

The customer will receive an M-Pesa STK push on their phone to complete the payment.

Transaction initiated:
- Amount: KES 1,500
- Customer: +254712345678
- Order: #1234
- Status: Awaiting customer confirmation
```

#### Balance Check

```
You: What's my balance across all providers?

Claude: Here's your current balance:

🇰🇪 M-Pesa (Kenya): KES 125,430
🇳🇬 Paystack (Nigeria): NGN 850,000  
🇰🇪 IntaSend: KES 45,200

Total in KES: ~KES 232,650
(Exchange rates applied for NGN conversion)
```

## Advanced Configuration

### With Smart Routing

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "npx",
      "args": ["-y", "@africa-payments/mcp-server"],
      "env": {
        "MPESA_CONSUMER_KEY": "...",
        "MPESA_CONSUMER_SECRET": "...",
        "PAYSTACK_SECRET_KEY": "...",
        "MTN_MOMO_SUBSCRIPTION_KEY": "...",
        "MTN_MOMO_API_USER": "...",
        "MTN_MOMO_API_KEY": "...",
        "DEFAULT_COUNTRY": "KE",
        "DEFAULT_PROVIDER": "mpesa"
      }
    }
  }
}
```

### With Webhooks

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "npx",
      "args": ["-y", "@africa-payments/mcp-server"],
      "env": {
        "MPESA_CONSUMER_KEY": "...",
        "MPESA_CONSUMER_SECRET": "...",
        "WEBHOOK_SECRET": "your_webhook_secret",
        "WEBHOOK_URL": "https://yourapp.com/webhooks"
      }
    }
  }
}
```

## Troubleshooting

### MCP Server Not Showing

1. **Restart Claude Desktop** completely
2. **Check config file syntax** - Valid JSON required
3. **Check server logs** - View Claude Desktop logs:
   - macOS: `~/Library/Logs/Claude/`
   - Windows: `%APPDATA%\Claude\logs\`

### Authentication Errors

```
Error: Invalid M-Pesa credentials
```

**Solution:**
- Verify consumer key and secret
- Check environment (sandbox vs production)
- Ensure passkey matches shortcode

### Transaction Failures

```
Error: Insufficient funds
```

**Solution:**
- Check wallet balance
- Verify B2C is enabled (for payouts)
- Contact provider support

## Security Best Practices

1. **Use environment variables** - Don't hardcode credentials
2. **Restrict permissions** - Only configure needed providers
3. **Enable webhooks** - For secure transaction confirmations
4. **Monitor logs** - Watch for suspicious activity
5. **Use test mode** - Test thoroughly before production

## Tips for Best Results

1. **Be specific with amounts** - "KES 1000" not just "1000"
2. **Include country codes** - "+254712345678" not "0712345678"
3. **Use references** - Mention order/invoice numbers
4. **Confirm before sending** - Always review Claude's summary
5. **Check status after** - Verify large transactions completed
