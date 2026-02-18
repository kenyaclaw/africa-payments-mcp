# Africa Payments MCP Server

A full-featured Model Context Protocol (MCP) server implementation for African payment providers including M-Pesa, Paystack, MTN MoMo, Airtel Money, Orange Money, Chipper Cash, Wave, and IntaSend.

## Features

### 🛠️ 17+ MCP Tools

| Tool | Description |
|------|-------------|
| `send_money` | Send money via any provider (auto-detects country/currency) |
| `request_payment` | Request payment via STK push or payment links |
| `verify_transaction` | Check transaction status across all providers |
| `refund` | Process full or partial refunds |
| `get_balance` | Check account balance for any provider |
| `list_transactions` | List transactions with filtering options |
| `list_providers` | List all configured providers |
| `get_provider_info` | Get detailed provider information |
| `compare_providers` | Compare providers by fees, speed, reliability |
| `get_provider_status` | Check provider health status |
| `stk_push` | M-Pesa STK Push for payment requests |
| `b2c_transfer` | Business-to-customer transfers |
| `c2b_register` | Register C2B URLs for receiving payments |
| `bank_transfer` | Send money to bank accounts |
| `validate_phone` | Validate phone numbers for mobile money |
| `get_exchange_rates` | Get currency exchange rates |
| `calculate_fees` | Calculate transaction fees |

### 📚 Resources

Access payment data via MCP resources:

- `transaction://{id}` - Get transaction details
- `provider://{name}` - Get provider information
- `balance://{provider}` - Get account balance
- `providers://list` - List all providers

### 💬 Prompts

Guided workflows for common tasks:

- `send-payment` - Step-by-step payment sending
- `refund-request` - Guided refund processing
- `payment-request` - Customer payment request workflow

### 🌐 Transports

- **stdio** - For Claude Desktop integration
- **HTTP/SSE** - For web clients and external integrations

## Installation

```bash
npm install @kenyaclaw/africa-payments-mcp
```

Or clone and build from source:

```bash
git clone https://github.com/kenyaclaw/africa-payments-mcp.git
cd africa-payments-mcp
npm install
npm run build
```

## Configuration

Create a `config.json` file:

```json
{
  "providers": {
    "mpesa": {
      "enabled": true,
      "environment": "sandbox",
      "consumerKey": "your-consumer-key",
      "consumerSecret": "your-consumer-secret",
      "passkey": "your-passkey",
      "shortCode": "174379"
    },
    "paystack": {
      "enabled": true,
      "environment": "sandbox",
      "secretKey": "your-secret-key"
    },
    "mtn_momo": {
      "enabled": true,
      "environment": "sandbox",
      "apiUser": "your-api-user",
      "apiKey": "your-api-key",
      "subscriptionKey": "your-subscription-key"
    }
  },
  "defaults": {
    "currency": "KES",
    "country": "KE"
  },
  "server": {
    "port": 3000,
    "logLevel": "info"
  }
}
```

## Usage

### With Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "node",
      "args": [
        "/path/to/africa-payments-mcp/build/mcp-server.js",
        "/path/to/your/config.json"
      ]
    }
  }
}
```

Location of config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Command Line

```bash
# Run with stdio transport (default)
node build/mcp-server.js ./config.json

# Run with HTTP transport
node build/mcp-server.js ./config.json http 3000

# Run with both transports
node build/mcp-server.js ./config.json both 3000
```

### Programmatic Usage

```typescript
import { createMCPServer } from '@kenyaclaw/africa-payments-mcp';

const server = await createMCPServer({
  configPath: './config.json',
  transport: 'stdio',
  logLevel: 'info',
});

await server.start({ transport: 'stdio' });
```

### HTTP API

When running with HTTP transport:

```bash
# Health check
curl http://localhost:3000/health

# List providers
curl http://localhost:3000/api/providers

# Get provider details
curl http://localhost:3000/api/providers/mpesa

# MCP SSE endpoint
curl http://localhost:3000/mcp/sse
```

## Examples

### Send Money

```json
{
  "name": "send_money",
  "arguments": {
    "recipient_phone": "+254712345678",
    "amount": 1000,
    "description": "Payment for invoice #123"
  }
}
```

### Request Payment (STK Push)

```json
{
  "name": "request_payment",
  "arguments": {
    "customer_phone": "+254712345678",
    "amount": 500,
    "description": "Payment for services",
    "account_reference": "INV-001"
  }
}
```

### Verify Transaction

```json
{
  "name": "verify_transaction",
  "arguments": {
    "transaction_id": "tx-abc123"
  }
}
```

### Process Refund

```json
{
  "name": "refund",
  "arguments": {
    "transaction_id": "tx-abc123",
    "reason": "Customer request"
  }
}
```

## Supported Providers

| Provider | Countries | Currencies | Methods |
|----------|-----------|------------|---------|
| M-Pesa | Kenya, Tanzania | KES, TZS | Mobile Money |
| Paystack | Nigeria, Ghana, Kenya, South Africa | NGN, GHS, KES, ZAR | Card, Bank, Mobile Money |
| MTN MoMo | Uganda, Ghana, Cameroon, Ivory Coast, Rwanda, etc. | UGX, GHS, XOF, XAF, RWF | Mobile Money |
| Airtel Money | Kenya, Uganda, Tanzania, Zambia, Malawi, Rwanda | KES, UGX, TZS, ZMW, MWK, RWF | Mobile Money |
| Orange Money | Cameroon, Ivory Coast, Senegal, etc. | XAF, XOF | Mobile Money |
| Chipper Cash | Nigeria, Ghana, Kenya, Uganda, South Africa, UK | NGN, GHS, KES, UGX, ZAR, GBP | Mobile Money |
| Wave | Senegal, Ivory Coast, Uganda, Burkina Faso, Mali | XOF, UGX | Mobile Money |
| IntaSend | Kenya, Nigeria | KES, NGN | Mobile Money |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |
| `NODE_ENV` | Environment (development, production) | `development` |

## Testing

```bash
# Run MCP server tests
npm test -- tests/mcp-server.test.ts

# Run all tests
npm test
```

## Troubleshooting

### Claude Desktop not detecting server
- Ensure the path to `mcp-server.js` is absolute
- Check that `config.json` exists and is valid JSON
- Verify provider credentials are correct

### Connection errors
- Check network connectivity to provider APIs
- Verify firewall settings allow outbound connections
- Check provider API status pages

### Authentication failures
- Verify consumer keys, secrets, and passkeys
- Check if credentials are for the correct environment (sandbox/production)
- Ensure short codes and other identifiers are correct

## License

MIT License - see LICENSE file for details.

## Support

- GitHub Issues: https://github.com/kenyaclaw/africa-payments-mcp/issues
- Documentation: https://docs.kenyaclaw.com/africa-payments-mcp
