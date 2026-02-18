# Cursor IDE Setup

Configure Africa Payments MCP with Cursor IDE to enable AI-powered payment operations directly in your editor.

## Installation

### 1. Install Cursor

Download and install [Cursor](https://cursor.sh/) if you haven't already.

### 2. Project Configuration

Create a `.cursor` directory in your project root:

```bash
mkdir -p .cursor
```

### 3. Create MCP Configuration

Create `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "npx",
      "args": ["-y", "@africa-payments/mcp-server"],
      "env": {
        "MPESA_CONSUMER_KEY": "${MPESA_CONSUMER_KEY}",
        "MPESA_CONSUMER_SECRET": "${MPESA_CONSUMER_SECRET}",
        "MPESA_PASSKEY": "${MPESA_PASSKEY}",
        "MPESA_SHORTCODE": "${MPESA_SHORTCODE}"
      }
    }
  }
}
```

### 4. Environment Variables

Create a `.env` file in your project root:

```bash
# .env
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_PASSKEY=your_passkey
MPESA_SHORTCODE=174379

# Optional: Other providers
PAYSTACK_SECRET_KEY=sk_live_your_key
INTASEND_PUBLIC_KEY=ISPubKey_live_your_key
INTASEND_SECRET_KEY=ISSecretKey_live_your_key
```

::: tip Variable Substitution
Cursor supports `${VAR}` syntax in mcp.json for environment variable substitution.
:::

## Alternative: Inline Configuration

For quick testing, you can include credentials directly (not recommended for production):

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "npx",
      "args": ["-y", "@africa-payments/mcp-server"],
      "env": {
        "MPESA_CONSUMER_KEY": "your_actual_key",
        "MPESA_CONSUMER_SECRET": "your_actual_secret",
        "MPESA_PASSKEY": "your_passkey",
        "MPESA_SHORTCODE": "174379",
        "MPESA_ENVIRONMENT": "sandbox"
      }
    }
  }
}
```

## Usage in Cursor

### Chat Interface

Open Cursor Chat (`Cmd+L` or `Ctrl+L`) and use natural language:

#### Development Scenarios

```
"Test a KES 100 payment to 254708374149 using sandbox"
"What's the code to check M-Pesa transaction status?"
"Generate a webhook handler for Paystack events"
"Create a function to send bulk payments via M-Pesa"
```

#### Code Generation

```
"Create a Next.js API route for M-Pesa payments"
"Generate a webhook verification middleware for Express"
"Write a function to validate Kenyan phone numbers"
"Create a React component for payment status display"
```

#### Debugging Help

```
"Why is this M-Pesa STK push failing?"
"Help me debug this webhook signature verification"
"What's wrong with this transaction status check?"
"Explain this payment error code"
```

### Inline Code Actions

Select code and ask Cursor to:

```
"Add error handling for insufficient funds"
"Implement idempotency for this webhook"
"Add logging for payment transactions"
"Create types for this payment response"
```

## Example Workflows

### Building a Payment Feature

1. **Generate boilerplate:**
   ```
   "Create an Express route for processing M-Pesa payments"
   ```

2. **Add business logic:**
   ```
   "Add order creation before payment request"
   ```

3. **Implement webhooks:**
   ```
   "Create a webhook handler to update order status"
   ```

4. **Add frontend:**
   ```
   "Generate a React payment form component"
   ```

5. **Test:**
   ```
   "Write tests for the payment flow"
   ```

### Debugging a Payment Issue

1. **Share error:**
   ```
   "I'm getting this error when sending money: [paste error]"
   ```

2. **Review code:**
   ```
   "Check if this phone number validation is correct"
   ```

3. **Test fix:**
   ```
   "Test this payment with sandbox credentials"
   ```

## Advanced Configuration

### Multiple Environments

Create separate configs for different environments:

```json
{
  "mcpServers": {
    "africa-payments-dev": {
      "command": "npx",
      "args": ["-y", "@africa-payments/mcp-server"],
      "env": {
        "MPESA_CONSUMER_KEY": "${MPESA_SANDBOX_KEY}",
        "MPESA_CONSUMER_SECRET": "${MPESA_SANDBOX_SECRET}",
        "MPESA_ENVIRONMENT": "sandbox"
      }
    },
    "africa-payments-prod": {
      "command": "npx",
      "args": ["-y", "@africa-payments/mcp-server"],
      "env": {
        "MPESA_CONSUMER_KEY": "${MPESA_PROD_KEY}",
        "MPESA_CONSUMER_SECRET": "${MPESA_PROD_SECRET}",
        "MPESA_ENVIRONMENT": "production"
      }
    }
  }
}
```

### With Custom Config File

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "npx",
      "args": [
        "-y",
        "@africa-payments/mcp-server",
        "--config",
        "${PWD}/config/payments.config.js"
      ]
    }
  }
}
```

### With Bun

If using Bun instead of Node.js:

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "bun",
      "args": ["x", "@africa-payments/mcp-server"],
      "env": {
        "MPESA_CONSUMER_KEY": "${MPESA_CONSUMER_KEY}",
        "MPESA_CONSUMER_SECRET": "${MPESA_CONSUMER_SECRET}"
      }
    }
  }
}
```

## Project Integration

### TypeScript Types

```typescript
// types/payments.ts
export interface PaymentRequest {
  phone: string;
  amount: number;
  currency: 'KES' | 'NGN' | 'GHS' | 'UGX';
  reference?: string;
  description?: string;
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  status: 'pending' | 'completed' | 'failed';
  provider: string;
  error?: {
    code: string;
    message: string;
  };
}
```

### Service Layer

```typescript
// lib/payments.ts
export class PaymentService {
  async sendMoney(request: PaymentRequest): Promise<PaymentResponse> {
    // Implementation using MCP tools
    // Cursor can help generate this
  }
  
  async requestPayment(request: PaymentRequest): Promise<PaymentResponse> {
    // Implementation using MCP tools
  }
  
  async checkStatus(transactionId: string): Promise<PaymentResponse> {
    // Implementation using MCP tools
  }
}
```

### API Routes

```typescript
// app/api/payments/route.ts
import { PaymentService } from '@/lib/payments';

export async function POST(request: Request) {
  const paymentService = new PaymentService();
  const body = await request.json();
  
  const result = await paymentService.requestPayment(body);
  
  return Response.json(result);
}
```

## Troubleshooting

### MCP Server Not Available

1. **Check Cursor version** - Update to latest
2. **Verify mcp.json syntax** - Use JSON validator
3. **Check env variables** - Ensure they're set in shell or .env
4. **Restart Cursor** - Cmd+Shift+P → "Developer: Reload Window"

### Command Not Found

```bash
# Ensure npx is available
which npx

# If using a specific Node version
nvm use 18
```

### Environment Variables Not Loading

1. **Check shell** - Cursor inherits from shell where launched
2. **Use .env** - Create `.env` in project root
3. **Hardcode for testing** - Temporarily use actual values

### Test with Direct Command

```bash
# Test if MCP server starts
npx -y @africa-payments/mcp-server

# With environment
MPESA_CONSUMER_KEY=test npx -y @africa-payments/mcp-server
```

## Tips

1. **Use specific prompts** - "Create M-Pesa STK push function" vs "Create payment function"
2. **Provide context** - Share error messages and relevant code
3. **Iterate** - Start simple and add complexity step by step
4. **Test in sandbox** - Always test with test credentials first
5. **Version control** - Keep `.cursor/mcp.json` in git (without secrets)
