# Claude Desktop Configuration Guide

Complete guide for using Africa Payments MCP with Claude Desktop.

## Installation

### Step 1: Install the MCP Server

```bash
npm install -g @kenyaclaw/africa-payments-mcp
```

### Step 2: Create Configuration File

Create a configuration file with your payment provider credentials:

```bash
# Using the interactive init command
africa-payments-mcp init

# Or manually create
mkdir -p ~/.config/africa-payments
cp config.example.json ~/.config/africa-payments/config.json
```

Edit `~/.config/africa-payments/config.json` with your API keys.

### Step 3: Configure Claude Desktop

Open Claude Desktop settings:

**macOS:**
```bash
open ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%/Claude/claude_desktop_config.json
```

**Linux:**
```bash
~/.config/Claude/claude_desktop_config.json
```

Add the MCP server configuration:

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "africa-payments-mcp",
      "args": [
        "--config",
        "/Users/your-username/.config/africa-payments/config.json"
      ]
    }
  }
}
```

> ⚠️ **Important:** Use the absolute path to your config file.

### Step 4: Restart Claude Desktop

1. Quit Claude Desktop completely
2. Reopen Claude Desktop
3. Look for the Africa Payments tools in the tool selector

## Example Prompts

### M-Pesa Operations

#### Send Money via STK Push
```
Send KES 1,000 to 254712345678 via M-Pesa
```

#### Check Transaction Status
```
Check the status of M-Pesa transaction MPESA_123456789
```

#### Process B2C Payment
```
Send KES 5,000 from my business account to 254723456789
```

### Paystack Operations

#### Initialize Payment
```
Create a Paystack payment link for $50 USD for customer@email.com
```

#### Verify Transaction
```
Verify if Paystack transaction reference PS_abc123 was successful
```

#### Process Refund
```
Refund the Paystack transaction for customer@example.com from yesterday
```

#### Check Balance
```
What's my Paystack balance in NGN?
```

### Universal Operations

#### Send Money (Provider Auto-Detected)
```
Send 10,000 naira to 08012345678
```
Claude will automatically detect Nigeria and use Paystack.

#### Cross-Border Transfer
```
Send $100 worth of Kenyan Shillings to 254712345678
```

#### Check Rates
```
What's the current USD to KES exchange rate?
```

### Multi-Step Workflows

#### Refund Workflow
```
Find all failed transactions from today and refund them
```

#### Reporting
```
Generate a summary of all M-Pesa transactions this week
```

## Screenshots

### Tool Selection

```
┌─────────────────────────────────────────────────────────────┐
│  🛠️ Available Tools                                          │
├─────────────────────────────────────────────────────────────┤
│  ☑️ unified_send_money      Send money via any provider     │
│  ☑️ unified_request_payment Request payment from anyone     │
│  ☑️ mpesa_stk_push          M-Pesa STK Push                 │
│  ☑️ paystack_initialize     Create Paystack payment         │
│  ☑️ paystack_verify         Verify Paystack transaction     │
└─────────────────────────────────────────────────────────────┘
```

### Payment Confirmation

```
User: Send KES 5,000 to John via M-Pesa (254712345678)

Claude: I'll send KES 5,000 to John via M-Pesa.

[Calling mpesa_stk_push...]

✅ STK Push sent successfully!
📱 Phone: 254712345678
💰 Amount: KES 5,000.00
🆔 Transaction: MPESA_20240216143022
⏳ Waiting for customer confirmation...

✅ Payment confirmed!
📅 Completed: 2024-02-16 14:30:45
💰 KES 5,000.00 sent to John
```

## Troubleshooting

### Tools Not Appearing

1. Check Claude Desktop logs:
   ```bash
   tail -f ~/Library/Logs/Claude/mcp*.log
   ```

2. Verify the MCP server starts correctly:
   ```bash
   africa-payments-mcp --config /path/to/config.json
   ```

3. Ensure the config path is absolute, not relative

### Permission Errors

If you see permission errors:

```bash
# Fix npm permissions
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# Or use npx instead
npx -y @kenyaclaw/africa-payments-mcp --config config.json
```

### Configuration Errors

Run the validation command:

```bash
africa-payments-mcp validate --config /path/to/config.json
```

## Advanced Configuration

### Multiple Provider Setup

Configure multiple providers for automatic fallback:

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "africa-payments-mcp",
      "args": [
        "--config",
        "/Users/your-username/.config/africa-payments/config.json",
        "--log-level",
        "debug"
      ]
    }
  }
}
```

### Environment Variables

For better security, use environment variables:

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "bash",
      "args": [
        "-c",
        "export MPESA_CONSUMER_KEY=$MPESA_KEY && africa-payments-mcp --config /path/to/config.json"
      ],
      "env": {
        "MPESA_KEY": "your-consumer-key"
      }
    }
  }
}
```

## Tips and Best Practices

1. **Start with Sandbox**: Always test in sandbox mode first
2. **Use Absolute Paths**: Always use absolute paths in configuration
3. **Monitor Logs**: Check Claude logs for debugging
4. **Validate Config**: Run validation before starting
5. **Secure Credentials**: Never commit credentials to version control

## Next Steps

- Try the example prompts above
- Explore provider-specific features
- Set up webhooks for real-time notifications
- Read the [main documentation](../README.md)
