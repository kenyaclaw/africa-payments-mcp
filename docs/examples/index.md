# Examples

Practical examples for integrating Africa Payments MCP with various platforms and frameworks.

## Available Examples

- [Claude Desktop Setup](./claude.md) - Configure with Claude AI
- [Cursor IDE Setup](./cursor.md) - Use in Cursor editor
- [Node.js Usage](./nodejs.md) - Integrate in Node.js applications
- [Python Usage](./python.md) - Use with Python MCP client

## Quick Examples

### Natural Language Payments

With Africa Payments MCP configured, you can use natural language:

```
"Send KES 1000 to 0712345678"
"Check if payment for ORDER-123 was received"
"Request 5000 NGN from customer@example.com"
"What's my M-Pesa balance?"
```

### Code Examples

#### Send Money (Universal)

::: code-group

```typescript [TypeScript]
const result = await client.callTool('unified_send_money', {
  recipient_phone: '+254712345678',
  amount: 1000,
  currency: 'KES',
  reference: 'PAYOUT-001'
});

if (result.success) {
  console.log('Transaction ID:', result.data.transaction_id);
  console.log('Status:', result.data.status);
}
```

```python [Python]
result = await client.call_tool('unified_send_money', {
    'recipient_phone': '+254712345678',
    'amount': 1000,
    'currency': 'KES',
    'reference': 'PAYOUT-001'
})

if result.success:
    print(f"Transaction ID: {result.data['transaction_id']}")
    print(f"Status: {result.data['status']}")
```

```javascript [Node.js]
const result = await client.callTool('unified_send_money', {
  recipient_phone: '+254712345678',
  amount: 1000,
  currency: 'KES',
  reference: 'PAYOUT-001'
});

console.log('Transaction:', result.data);
```

:::

#### Request Payment (M-Pesa)

::: code-group

```typescript [TypeScript]
const result = await client.callTool('mpesa_stk_push', {
  phoneNumber: '254712345678',
  amount: 500,
  accountReference: 'INVOICE-123',
  transactionDesc: 'Payment for Invoice 123'
});

// Customer receives STK push on their phone
```

```python [Python]
result = await client.call_tool('mpesa_stk_push', {
    'phoneNumber': '254712345678',
    'amount': 500,
    'accountReference': 'INVOICE-123',
    'transactionDesc': 'Payment for Invoice 123'
})
```

:::

#### Paystack Payment

::: code-group

```typescript [TypeScript]
// Initialize payment
const result = await client.callTool('paystack_initialize', {
  email: 'customer@example.com',
  amount: 500000, // 5000 NGN in kobo
  currency: 'NGN',
  reference: 'ORDER-456',
  metadata: {
    order_id: 'ORDER-456',
    customer_name: 'John Doe'
  }
});

// Redirect customer to result.data.authorization_url
```

```python [Python]
result = await client.call_tool('paystack_initialize', {
    'email': 'customer@example.com',
    'amount': 500000,
    'currency': 'NGN',
    'reference': 'ORDER-456',
    'metadata': {
        'order_id': 'ORDER-456',
        'customer_name': 'John Doe'
    }
})
```

:::

### E-commerce Integration

Complete checkout flow:

```typescript
// 1. Create order
const order = await db.orders.create({
  items: cart.items,
  total: cart.total,
  status: 'pending'
});

// 2. Request payment based on customer preference
if (customer.country === 'KE') {
  // M-Pesa STK Push
  const payment = await client.callTool('mpesa_stk_push', {
    phoneNumber: customer.phone,
    amount: order.total,
    accountReference: `ORDER-${order.id}`,
    transactionDesc: `Payment for order ${order.id}`
  });
} else if (customer.country === 'NG') {
  // Paystack
  const payment = await client.callTool('paystack_initialize', {
    email: customer.email,
    amount: order.total * 100, // Convert to kobo
    currency: 'NGN',
    reference: `ORDER-${order.id}`
  });
  
  // Redirect to payment link
  return res.redirect(payment.data.authorization_url);
}

// 3. Webhook updates order status
// See webhooks.md for implementation
```

### Bulk Payouts

Pay multiple recipients:

```typescript
const recipients = [
  { phone: '+254712345678', amount: 1000 },
  { phone: '+254723456789', amount: 2000 },
  { phone: '+254734567890', amount: 1500 }
];

// Using Paystack bulk transfer
const result = await client.callTool('paystack_bulk_transfer', {
  currency: 'KES',
  transfers: recipients.map((r, i) => ({
    amount: r.amount * 100,
    recipient: r.phone, // Must be pre-registered recipient code
    reference: `PAYOUT-${i + 1}`,
    reason: 'Weekly payout'
  }))
});

// Or using individual M-Pesa B2C
for (const recipient of recipients) {
  await client.callTool('mpesa_b2c', {
    phoneNumber: recipient.phone.replace('+', ''),
    amount: recipient.amount,
    remarks: 'Weekly payout'
  });
}
```

### Subscription Management

Recurring payments with Paystack:

```typescript
// Create subscription
const subscription = await client.callTool('paystack_create_subscription', {
  customer: 'customer@example.com',
  plan: 'PLN_monthly_plan',
  authorization: 'AUTH_abc123' // From previous payment
});

// List subscriptions
const subscriptions = await client.callTool('paystack_list_subscriptions', {
  customer: 'customer@example.com'
});

// Disable subscription
await client.callTool('paystack_disable_subscription', {
  code: 'SUB_abc123',
  token: 'subscription_token'
});
```

## Framework Integrations

### Express.js

```typescript
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk';

const app = express();

// Initialize MCP client
const mcpClient = new Client();
await mcpClient.connect({
  transport: new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@africa-payments/mcp-server']
  })
});

// Payment endpoint
app.post('/api/payments', async (req, res) => {
  const { phone, amount, provider } = req.body;
  
  const result = await mcpClient.callTool('unified_request_payment', {
    customer_phone: phone,
    amount,
    currency: 'KES',
    provider
  });
  
  res.json(result);
});

// Webhook endpoint
app.post('/webhooks/payments', async (req, res) => {
  // Process webhook
  res.sendStatus(200);
});
```

### Next.js API Routes

```typescript
// app/api/payments/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { phone, amount } = await req.json();
  
  const result = await mcpClient.callTool('mpesa_stk_push', {
    phoneNumber: phone,
    amount,
    accountReference: `ORDER-${Date.now()}`,
    transactionDesc: 'Payment for order'
  });
  
  return NextResponse.json(result);
}
```

### Python FastAPI

```python
from fastapi import FastAPI
from mcp import Client

app = FastAPI()
mcp_client = Client()

@app.post("/payments")
async def create_payment(phone: str, amount: int):
    result = await mcp_client.call_tool(
        'unified_request_payment',
        {
            'customer_phone': phone,
            'amount': amount,
            'currency': 'KES'
        }
    )
    return result

@app.post("/webhooks/mpesa")
async def mpesa_webhook(request: Request):
    payload = await request.json()
    # Process webhook
    return {"status": "ok"}
```

## Error Handling

```typescript
async function processPayment(phone: string, amount: number) {
  try {
    const result = await client.callTool('unified_send_money', {
      recipient_phone: phone,
      amount,
      currency: 'KES'
    });
    
    if (!result.success) {
      switch (result.error?.code) {
        case 'INSUFFICIENT_FUNDS':
          throw new Error('Wallet has insufficient balance');
        case 'INVALID_RECIPIENT':
          throw new Error('Invalid phone number');
        case 'PROVIDER_ERROR':
          throw new Error('Payment provider error. Please try again.');
        default:
          throw new Error(result.error?.message || 'Payment failed');
      }
    }
    
    return result.data;
  } catch (error) {
    console.error('Payment error:', error);
    throw error;
  }
}
```

## Testing

```typescript
// Test utilities
describe('Payments', () => {
  it('should send money via M-Pesa', async () => {
    const result = await client.callTool('mpesa_b2c', {
      phoneNumber: '254708374149', // Test number
      amount: 10, // Small test amount
      remarks: 'Test payment'
    });
    
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('pending');
  });
});
```
