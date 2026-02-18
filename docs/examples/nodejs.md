# Node.js Usage

Integrate Africa Payments MCP into your Node.js applications.

## Installation

### Using MCP SDK

```bash
npm install @modelcontextprotocol/sdk
```

### Using Africa Payments MCP Server

```bash
# As a dependency
npm install @africa-payments/mcp-server

# Or run directly with npx
npx @africa-payments/mcp-server
```

## Basic Usage

### Direct Server Connection

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Create MCP client
const client = new Client(
  { name: 'my-app', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Connect to Africa Payments MCP server
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@africa-payments/mcp-server'],
  env: {
    MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
    MPESA_PASSKEY: process.env.MPESA_PASSKEY,
    MPESA_SHORTCODE: process.env.MPESA_SHORTCODE,
  }
});

await client.connect(transport);

// List available tools
const tools = await client.listTools();
console.log('Available tools:', tools.tools.map(t => t.name));

// Send money via M-Pesa
const result = await client.callTool('mpesa_stk_push', {
  phoneNumber: '254712345678',
  amount: 1000,
  accountReference: 'ORDER-123',
  transactionDesc: 'Payment for Order 123'
});

console.log('Payment result:', result);
```

### With Configuration File

```typescript
const transport = new StdioClientTransport({
  command: 'npx',
  args: [
    '-y', 
    '@africa-payments/mcp-server',
    '--config',
    './payments.config.js'
  ]
});

await client.connect(transport);
```

## Express.js Integration

### Payment API Routes

```typescript
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const app = express();
app.use(express.json());

// Initialize MCP client
let mcpClient: Client;

async function initMCP() {
  const client = new Client(
    { name: 'express-app', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@africa-payments/mcp-server'],
    env: process.env as Record<string, string>
  });
  
  await client.connect(transport);
  return client;
}

// Request payment
app.post('/api/payments/request', async (req, res) => {
  try {
    const { phone, amount, provider = 'mpesa' } = req.body;
    
    if (!mcpClient) {
      mcpClient = await initMCP();
    }
    
    const result = await mcpClient.callTool('unified_request_payment', {
      customer_phone: phone,
      amount: parseInt(amount),
      currency: 'KES',
      provider
    });
    
    res.json(result);
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: 'Payment request failed' });
  }
});

// Send money (payout)
app.post('/api/payments/send', async (req, res) => {
  try {
    const { phone, amount, reference } = req.body;
    
    const result = await mcpClient.callTool('unified_send_money', {
      recipient_phone: phone,
      amount: parseInt(amount),
      currency: 'KES',
      reference
    });
    
    res.json(result);
  } catch (error) {
    console.error('Send error:', error);
    res.status(500).json({ error: 'Send failed' });
  }
});

// Check status
app.get('/api/payments/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await mcpClient.callTool('unified_check_status', {
      transaction_id: id
    });
    
    res.json(result);
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Status check failed' });
  }
});

// Webhook handler
app.post('/webhooks/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    
    // Verify webhook
    const verificationTool = `${provider}_verify_webhook`;
    const isValid = await mcpClient.callTool(verificationTool, {
      signature: req.headers['x-' + provider + '-signature'],
      payload: req.body
    });
    
    if (!isValid.success) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // Process webhook
    await processWebhook(req.body, provider);
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function processWebhook(payload: any, provider: string) {
  // Implement your webhook processing logic
  console.log(`Processing ${provider} webhook:`, payload);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

## Next.js Integration

### API Routes (App Router)

```typescript
// app/api/payments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let mcpClient: Client | null = null;

async function getMCPClient() {
  if (!mcpClient) {
    const client = new Client(
      { name: 'nextjs-app', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@africa-payments/mcp-server'],
      env: {
        MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY!,
        MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET!,
        MPESA_PASSKEY: process.env.MPESA_PASSKEY!,
        MPESA_SHORTCODE: process.env.MPESA_SHORTCODE!,
      }
    });
    
    await client.connect(transport);
    mcpClient = client;
  }
  
  return mcpClient;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, amount, action = 'request' } = body;
    
    const client = await getMCPClient();
    
    let result;
    if (action === 'request') {
      result = await client.callTool('mpesa_stk_push', {
        phoneNumber: phone.replace('+', ''),
        amount: parseInt(amount),
        accountReference: `ORDER-${Date.now()}`,
        transactionDesc: 'Payment for order'
      });
    } else if (action === 'send') {
      result = await client.callTool('mpesa_b2c', {
        phoneNumber: phone.replace('+', ''),
        amount: parseInt(amount),
        remarks: 'Payout'
      });
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Payment error:', error);
    return NextResponse.json(
      { error: 'Payment failed' },
      { status: 500 }
    );
  }
}
```

### Webhook Route

```typescript
// app/api/webhooks/mpesa/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Get MCP client
    const client = await getMCPClient();
    
    // Process M-Pesa callback
    const { Body } = body;
    const resultCode = Body?.stkCallback?.ResultCode;
    
    if (resultCode === 0) {
      // Success - update order
      const metadata = Body.stkCallback.CallbackMetadata.Item;
      const amount = metadata.find((i: any) => i.Name === 'Amount')?.Value;
      const receipt = metadata.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value;
      const phone = metadata.find((i: any) => i.Name === 'PhoneNumber')?.Value;
      
      // Update database
      await updateOrderStatus(receipt, { amount, phone, status: 'paid' });
    }
    
    // Always return success to M-Pesa
    return NextResponse.json({ 
      ResultCode: 0, 
      ResultDesc: 'Success' 
    });
  } catch (error) {
    console.error('Webhook error:', error);
    // Still return 200 to prevent retries
    return NextResponse.json({ 
      ResultCode: 0, 
      ResultDesc: 'Success' 
    });
  }
}
```

## Payment Service Class

```typescript
// lib/payment-service.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export class PaymentService {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect() {
    if (this.client) return this.client;
    
    this.client = new Client(
      { name: 'payment-service', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    
    this.transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@africa-payments/mcp-server'],
      env: process.env as Record<string, string>
    });
    
    await this.client.connect(this.transport);
    return this.client;
  }

  async requestPayment(params: {
    phone: string;
    amount: number;
    reference: string;
    description?: string;
    provider?: string;
  }) {
    const client = await this.connect();
    
    return client.callTool('unified_request_payment', {
      customer_phone: params.phone,
      amount: params.amount,
      currency: this.getCurrency(params.provider),
      provider: params.provider,
      reference: params.reference,
      description: params.description
    });
  }

  async sendMoney(params: {
    phone: string;
    amount: number;
    reference: string;
    description?: string;
    provider?: string;
  }) {
    const client = await this.connect();
    
    return client.callTool('unified_send_money', {
      recipient_phone: params.phone,
      amount: params.amount,
      currency: this.getCurrency(params.provider),
      provider: params.provider,
      reference: params.reference,
      description: params.description
    });
  }

  async checkStatus(transactionId: string) {
    const client = await this.connect();
    
    return client.callTool('unified_check_status', {
      transaction_id: transactionId
    });
  }

  async getBalance() {
    const client = await this.connect();
    
    return client.callTool('unified_get_balance', {});
  }

  private getCurrency(provider?: string): string {
    const currencyMap: Record<string, string> = {
      mpesa: 'KES',
      paystack: 'NGN',
      intasend: 'KES',
      mtnMomo: 'GHS',
      airtelMoney: 'KES'
    };
    
    return currencyMap[provider || 'mpesa'] || 'KES';
  }

  async disconnect() {
    if (this.transport) {
      await this.transport.close();
      this.client = null;
      this.transport = null;
    }
  }
}

// Usage
const paymentService = new PaymentService();

// Request payment
await paymentService.requestPayment({
  phone: '+254712345678',
  amount: 1000,
  reference: 'ORDER-123',
  description: 'Payment for Order 123'
});

// Cleanup
await paymentService.disconnect();
```

## Error Handling

```typescript
async function handlePaymentError(error: any) {
  if (error.code === 'PROVIDER_ERROR') {
    // Provider-specific error
    console.error('Provider error:', error.message);
    
    // Check if retryable
    if (error.retryable) {
      // Retry with exponential backoff
    }
  } else if (error.code === 'VALIDATION_ERROR') {
    // Input validation failed
    console.error('Validation error:', error.details);
  } else if (error.code === 'AUTH_FAILED') {
    // Authentication error
    console.error('Check your API credentials');
  }
}
```

## Testing

```typescript
// tests/payments.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PaymentService } from '../lib/payment-service';

describe('PaymentService', () => {
  let service: PaymentService;

  beforeAll(async () => {
    service = new PaymentService();
    await service.connect();
  });

  afterAll(async () => {
    await service.disconnect();
  });

  it('should request payment', async () => {
    const result = await service.requestPayment({
      phone: '254708374149', // Test number
      amount: 10,
      reference: 'TEST-001'
    });
    
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('pending');
  });
});
```
