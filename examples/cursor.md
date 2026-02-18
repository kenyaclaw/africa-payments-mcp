# Cursor IDE Configuration Guide

Complete guide for using Africa Payments MCP with Cursor IDE.

## Overview

Cursor IDE supports MCP (Model Context Protocol) servers, allowing you to interact with African payment providers directly from your editor.

## Installation

### Step 1: Install the MCP Server

```bash
npm install -g @kenyaclaw/africa-payments-mcp
```

Or use locally in your project:

```bash
npm install --save-dev @kenyaclaw/africa-payments-mcp
```

### Step 2: Create Configuration

```bash
# Create config directory
mkdir -p ~/.cursor

# Initialize config interactively
africa-payments-mcp init --output ~/.cursor/africa-payments-config.json

# Or copy example
cp config.example.json ~/.cursor/africa-payments-config.json
```

Edit the config file with your API credentials.

### Step 3: Configure Cursor MCP

Create or edit the MCP configuration file:

**macOS/Linux:**
```bash
~/.cursor/mcp.json
```

**Windows:**
```
%USERPROFILE%\.cursor\mcp.json
```

Add the following configuration:

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "africa-payments-mcp",
      "args": [
        "--config",
        "/Users/your-username/.cursor/africa-payments-config.json"
      ],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

> **Note:** Replace `/Users/your-username` with your actual home directory path.

### Step 4: Restart Cursor

1. Close Cursor completely
2. Reopen Cursor
3. Open the Composer (Cmd/Ctrl + I)
4. The Africa Payments tools should now be available

## Usage in Cursor

### Using Composer

Open the Composer (Cmd/Ctrl + I) and type natural language prompts:

```
Send KES 1,000 to 254712345678 via M-Pesa
```

Cursor will:
1. Detect the available `unified_send_money` tool
2. Extract the amount (KES 1,000)
3. Extract the phone number (254712345678)
4. Detect the provider (M-Pesa)
5. Execute the payment

### Using Chat

In the Cursor Chat panel, you can ask:

```
What's my Paystack balance?
```

```
Create a payment link for $100 for a customer in Nigeria
```

```
Check if transaction MPESA_123456 was successful
```

### Context-Aware Commands

Cursor can use payment data from your code:

```javascript
// In your code
const order = {
  amount: 5000,
  currency: 'KES',
  phoneNumber: '254712345678'
};
```

Then in Composer:
```
Process payment for this order using M-Pesa
```

## Example Workflows

### E-commerce Integration

```javascript
// Your e-commerce checkout code
async function processCheckout(order) {
  // Cursor can help implement this function
}
```

Ask Cursor:
```
Implement the processCheckout function using M-Pesa STK Push
with proper error handling and transaction verification
```

### Refund Processing

```javascript
// Transaction data in your code
const transaction = {
  id: 'PS_abc123',
  provider: 'paystack',
  amount: 5000,
  currency: 'NGN'
};
```

Ask Cursor:
```
Process a refund for this transaction using the appropriate provider
```

### Multi-Provider Setup

```javascript
// Config file in your project
const config = {
  kenya: { provider: 'mpesa' },
  nigeria: { provider: 'paystack' },
  ghana: { provider: 'paystack' }
};
```

Ask Cursor:
```
Create a function that routes payments to the correct 
provider based on the customer's country
```

## Project-Specific Configuration

For team projects, add the MCP config to your project:

```json
// .cursor/mcp.json (in your project root)
{
  "mcpServers": {
    "africa-payments": {
      "command": "npx",
      "args": [
        "-y",
        "@kenyaclaw/africa-payments-mcp",
        "--config",
        "${workspaceFolder}/config/payments.json"
      ],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Add to `.gitignore`:
```
config/payments.json
.env
```

## Debugging

### Check MCP Status

In Cursor, open the Command Palette (Cmd/Ctrl + Shift + P) and search for "MCP" to see:
- Connected MCP servers
- Available tools
- Connection status

### View Logs

Cursor MCP logs are available in:

**macOS:**
```bash
tail -f ~/Library/Application\ Support/Cursor/logs/mcp.log
```

**Linux:**
```bash
tail -f ~/.config/Cursor/logs/mcp.log
```

**Windows:**
```
%APPDATA%\Cursor\logs\mcp.log
```

### Common Issues

**Issue: "africa-payments-mcp command not found"**

Solution: Use npx or specify full path:
```json
{
  "command": "npx",
  "args": ["-y", "@kenyaclaw/africa-payments-mcp", "--config", "config.json"]
}
```

**Issue: "Configuration file not found"**

Solution: Use absolute path:
```json
{
  "args": ["--config", "/absolute/path/to/config.json"]
}
```

**Issue: Tools don't appear**

1. Restart Cursor completely
2. Check MCP settings in Cursor preferences
3. Verify the config file is valid:
   ```bash
   africa-payments-mcp validate --config /path/to/config.json
   ```

## Best Practices

### 1. Use Workspace Configuration

Keep payment config in your project for team consistency:

```
project/
├── .cursor/
│   └── mcp.json          # MCP server config
├── config/
│   └── payments.json     # Payment provider credentials
└── src/
    └── payments/
        └── index.js      # Your payment code
```

### 2. Environment Variables

Never hardcode API keys. Use environment variables:

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "bash",
      "args": [
        "-c",
        "africa-payments-mcp --config <(envsubst < config/payments.template.json)"
      ]
    }
  }
}
```

### 3. Sandbox Testing

Always use sandbox credentials during development:

```json
{
  "providers": {
    "mpesa": {
      "enabled": true,
      "environment": "sandbox"
    }
  }
}
```

### 4. Version Pinning

Pin to specific version for team consistency:

```json
{
  "command": "npx",
  "args": ["-y", "@kenyaclaw/africa-payments-mcp@0.1.0", "--config", "config.json"]
}
```

## Example Project Structure

```
my-african-app/
├── .cursor/
│   └── mcp.json
├── config/
│   ├── payments.json          # Git-ignored credentials
│   └── payments.example.json  # Example for team
├── src/
│   ├── payments/
│   │   ├── index.js
│   │   └── handlers.js
│   └── app.js
└── package.json
```

## Tips for Development

1. **Test in Sandbox**: Always test payment flows in sandbox mode
2. **Use Auto-Approve Carefully**: Only auto-approve safe operations in development
3. **Log Everything**: Use debug logging to trace payment flows
4. **Handle Errors**: Implement proper error handling in your code
5. **Verify Transactions**: Always verify transactions before marking orders complete

## Next Steps

- Read the [API documentation](../docs/API.md)
- Check out [Node.js examples](./nodejs/)
- Review [Claude Desktop setup](./claude-desktop.md)
- Explore provider-specific features in the main [README](../README.md)
