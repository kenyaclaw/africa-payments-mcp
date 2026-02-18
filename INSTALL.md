# Installation Guide

Complete installation and setup guide for the Africa Payments MCP Server.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
- [Configuration](#configuration)
- [Testing the Installation](#testing-the-installation)
- [Client Configuration](#client-configuration)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **NPM**: Version 8.0.0 or higher (included with Node.js)
- **API Keys**: At least one payment provider account (M-Pesa, Paystack, etc.)

Check your Node.js version:
```bash
node --version
```

## Installation Methods

### Method 1: Global Installation (Recommended)

Install the package globally for system-wide access:

```bash
npm install -g @kenyaclaw/africa-payments-mcp
```

After installation, the `africa-payments-mcp` command will be available everywhere:

```bash
# Check version
africa-payments-mcp --version

# Get help
africa-payments-mcp --help
```

**Pros:**
- Available system-wide
- Easy to use in MCP clients
- Simple configuration

**Cons:**
- Requires global permissions (may need `sudo` on some systems)
- Single version across all projects

### Method 2: Local Installation (Project-specific)

Install in a specific project directory:

```bash
# Create project directory
mkdir my-africa-payments
cd my-africa-payments

# Initialize npm
npm init -y

# Install locally
npm install @kenyaclaw/africa-payments-mcp
```

Use with `npx`:
```bash
npx africa-payments-mcp --config config.json
```

**Pros:**
- Version controlled per project
- No global permission issues
- Better for CI/CD pipelines

**Cons:**
- Must prefix with `npx` or use npm scripts
- Takes up space in each project

### Method 3: NPX (No Installation)

Run directly without installing:

```bash
npx -y @kenyaclaw/africa-payments-mcp --config config.json
```

**Pros:**
- No installation required
- Always uses latest version
- Great for quick testing

**Cons:**
- Slower startup (downloads each time)
- Requires internet connection

## Configuration

### Step 1: Create Configuration File

Create a `config.json` file:

```bash
# Using the init command (interactive)
npx @kenyaclaw/africa-payments-mcp init

# Or manually copy the example
cp config.example.json config.json
```

### Step 2: Configure Payment Providers

Edit `config.json` with your API credentials:

#### M-Pesa (Kenya, Tanzania)

```json
{
  "providers": {
    "mpesa": {
      "enabled": true,
      "environment": "sandbox",
      "consumerKey": "your-consumer-key",
      "consumerSecret": "your-consumer-secret",
      "passkey": "your-passkey",
      "shortCode": "174379",
      "initiatorName": "testapi",
      "initiatorPassword": "your-password",
      "securityCredential": "your-credential"
    }
  }
}
```

**Getting M-Pesa credentials:**
1. Register at [Safaricom Developer Portal](https://developer.safaricom.co.ke/)
2. Create a new app
3. Copy Consumer Key and Consumer Secret
4. Generate Passkey from your account settings

#### Paystack (Nigeria, Ghana, South Africa)

```json
{
  "providers": {
    "paystack": {
      "enabled": true,
      "environment": "sandbox",
      "secretKey": "sk_test_your_secret_key",
      "publicKey": "pk_test_your_public_key",
      "webhookSecret": "whsec_your_webhook_secret"
    }
  }
}
```

**Getting Paystack credentials:**
1. Register at [Paystack](https://paystack.com/)
2. Go to Settings > API Keys & Webhooks
3. Copy your Secret and Public keys
4. Set up webhook secret for production

#### IntaSend (Kenya, Nigeria)

```json
{
  "providers": {
    "intasend": {
      "enabled": true,
      "environment": "sandbox",
      "publishableKey": "ISPubKey_test_your_key",
      "secretKey": "ISSecretKey_test_your_key"
    }
  }
}
```

#### MTN MoMo (Uganda, Ghana, 12 others)

```json
{
  "providers": {
    "mtn_momo": {
      "enabled": true,
      "environment": "sandbox",
      "apiUser": "your-api-user",
      "apiKey": "your-api-key",
      "subscriptionKey": "your-subscription-key",
      "targetEnvironment": "sandbox"
    }
  }
}
```

### Step 3: Validate Configuration

Test your configuration:

```bash
# Validate config file
africa-payments-mcp validate --config config.json

# Test provider connections
africa-payments-mcp test --config config.json

# Test specific provider
africa-payments-mcp test --config config.json --provider mpesa
```

### Step 4: Run Diagnostics

If you encounter issues, run the doctor command:

```bash
africa-payments-mcp doctor --config config.json
```

This will check:
- Node.js version compatibility
- Configuration file syntax
- API credentials validity
- Network connectivity
- Required permissions

## Testing the Installation

### Test 1: Version Check

```bash
africa-payments-mcp --version
```

Expected output:
```
0.1.0
```

### Test 2: Help Command

```bash
africa-payments-mcp --help
```

### Test 3: Validate Config

```bash
africa-payments-mcp validate --config config.json
```

Expected output:
```
✅ Configuration is valid
   Providers enabled: mpesa, paystack
```

### Test 4: Start Server

```bash
africa-payments-mcp --config config.json
```

Expected output:
```
Starting Africa Payments MCP Server...
Transport: stdio
✅ Server running and ready for connections
```

Press `Ctrl+C` to stop the server.

## Client Configuration

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "africa-payments-mcp",
      "args": ["--config", "/path/to/config.json"]
    }
  }
}
```

**Windows:** `%APPDATA%/Claude/claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

### Cursor IDE

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "africa-payments-mcp",
      "args": ["--config", "/path/to/config.json"]
    }
  }
}
```

### VS Code with Cline

Add to Cline settings:

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "africa-payments-mcp",
      "args": ["--config", "/path/to/config.json"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Troubleshooting

### Issue: "command not found: africa-payments-mcp"

**Solution 1:** If globally installed, ensure npm global bin is in PATH:

```bash
# Check npm global prefix
npm config get prefix

# Add to PATH (Linux/macOS)
export PATH="$PATH:$(npm config get prefix)/bin"

# Or use npx
npx africa-payments-mcp --config config.json
```

**Solution 2:** Use the full path:

```bash
$(npm config get prefix)/bin/africa-payments-mcp --config config.json
```

### Issue: "Cannot find module '@modelcontextprotocol/sdk'"

**Solution:** Reinstall dependencies:

```bash
npm install -g @kenyaclaw/africa-payments-mcp
```

### Issue: "Configuration file not found"

**Solution:** Use absolute path:

```bash
africa-payments-mcp --config /absolute/path/to/config.json
```

### Issue: "Invalid API credentials"

**Solution:**
1. Run `africa-payments-mcp doctor` to diagnose
2. Verify credentials in provider dashboard
3. Ensure you're using the correct environment (sandbox/production)
4. Check if credentials are expired

### Issue: Server starts but client can't connect

**Solution:**
1. Check MCP client logs
2. Verify the config path is correct in client settings
3. Ensure file permissions allow reading the config
4. Try running with full path to executable

### Issue: "EACCES: permission denied"

**Solution (macOS/Linux):**

```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Reinstall
npm install -g @kenyaclaw/africa-payments-mcp
```

### Getting Help

If you continue to have issues:

1. Run diagnostics: `africa-payments-mcp doctor --verbose`
2. Check logs in the console
3. Open an issue: https://github.com/kenyaclaw/africa-payments-mcp/issues

Include:
- Node.js version (`node --version`)
- NPM version (`npm --version`)
- Package version (`africa-payments-mcp --version`)
- Operating system
- Full error message

## Next Steps

- Read the [README.md](README.md) for usage examples
- Check [examples/claude-desktop.md](examples/claude-desktop.md) for Claude-specific setup
- Check [examples/cursor.md](examples/cursor.md) for Cursor IDE setup
- Explore the [examples/nodejs/](examples/nodejs/) directory for programmatic usage
