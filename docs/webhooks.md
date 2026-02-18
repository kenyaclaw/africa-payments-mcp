# Webhooks

Webhooks allow Africa Payments MCP to notify your application about payment events in real-time. Instead of polling for updates, your application receives HTTP POST requests when events occur.

## Why Webhooks?

- **Real-time updates** - Instant notification of payment status
- **Reliability** - No missed events due to polling intervals
- **Efficiency** - Reduces API calls and server load
- **Better UX** - Faster order processing and notifications

## Supported Events

### Payment Events

| Event | Description | Providers |
|-------|-------------|-----------|
| `payment.success` | Payment completed successfully | All |
| `payment.failed` | Payment failed | All |
| `payment.pending` | Payment is being processed | All |
| `payment.cancelled` | Payment was cancelled | M-Pesa, Paystack |

### Payout Events

| Event | Description | Providers |
|-------|-------------|-----------|
| `payout.success` | Payout completed | All |
| `payout.failed` | Payout failed | All |
| `payout.pending` | Payout is being processed | All |

### Refund Events

| Event | Description | Providers |
|-------|-------------|-----------|
| `refund.success` | Refund processed | Paystack, IntaSend |
| `refund.failed` | Refund failed | Paystack, IntaSend |

## Webhook Setup

### 1. Configure Webhook URL

Add your webhook URL to the configuration:

```javascript
// africa-payments.config.js
export default {
  webhooks: {
    url: 'https://yourapp.com/webhooks/africa-payments',
    secret: process.env.WEBHOOK_SECRET,
    
    // Provider-specific settings
    providers: {
      mpesa: {
        path: '/webhooks/mpesa',
        verification: 'signature'
      },
      paystack: {
        path: '/webhooks/paystack',
        verification: 'signature'
      }
    }
  }
};
```

### 2. Environment Variables

```bash
# Global webhook secret
WEBHOOK_SECRET=your_webhook_signing_secret

# Provider-specific secrets
MPESA_WEBHOOK_SECRET=mpesa_secret
PAYSTACK_WEBHOOK_SECRET=paystack_secret
INTASEND_WEBHOOK_SECRET=intasend_secret
```

### 3. Register with Providers

Each provider requires webhook registration in their portal:

- **M-Pesa**: Set callback URLs in Daraja Portal
- **Paystack**: Add webhook URL in Dashboard → Settings → Webhooks
- **MTN MoMo**: Set `providerCallbackHost` when creating API user
- **IntaSend**: Add webhook URL in Dashboard → API → Webhooks
- **Airtel Money**: Configure during API onboarding

## Webhook Handler Implementation

### Express.js Example

```typescript
import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.raw({ type: 'application/json' }));

// M-Pesa Webhook
app.post('/webhooks/mpesa', async (req, res) => {
  try {
    // Verify signature
    const isValid = await verifyMpesaWebhook(req);
    if (!isValid) {
      return res.status(401).send('Invalid signature');
    }

    const payload = JSON.parse(req.body);
    
    // Process the callback
    await processMpesaCallback(payload);
    
    // Always return 200 for M-Pesa
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
  }
});

// Paystack Webhook
app.post('/webhooks/paystack', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET)
      .update(req.body)
      .digest('hex');
    
    if (hash !== signature) {
      return res.status(401).send('Invalid signature');
    }

    const event = JSON.parse(req.body);
    await processPaystackEvent(event);
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});
```

### Next.js API Route Example

```typescript
// app/api/webhooks/paystack/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-paystack-signature');
  const body = await req.text();
  
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex');
  
  if (hash !== signature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  const event = JSON.parse(body);
  
  // Process event
  switch (event.event) {
    case 'charge.success':
      await handlePaymentSuccess(event.data);
      break;
    case 'charge.failed':
      await handlePaymentFailed(event.data);
      break;
    case 'transfer.success':
      await handleTransferSuccess(event.data);
      break;
  }
  
  return NextResponse.json({ received: true });
}
```

## Webhook Verification

### Using MCP Tools

```typescript
// M-Pesa
const isValid = await client.callTool('mpesa_verify_webhook', {
  signature: req.headers['x-mpesa-signature'],
  payload: req.body
});

// Paystack
const isValid = await client.callTool('paystack_verify_webhook', {
  signature: req.headers['x-paystack-signature'],
  payload: req.body,
  secret: process.env.PAYSTACK_WEBHOOK_SECRET
});

// IntaSend
const isValid = await client.callTool('intasend_verify_webhook', {
  signature: req.headers['x-intasend-signature'],
  payload: req.body,
  secret: process.env.INTASEND_WEBHOOK_SECRET
});
```

### Manual Verification

#### M-Pesa

M-Pesa uses no signature verification; rely on HTTPS and validate the payload structure.

#### Paystack

```typescript
import crypto from 'crypto';

function verifyPaystackWebhook(body: string, signature: string, secret: string): boolean {
  const hash = crypto
    .createHmac('sha512', secret)
    .update(body)
    .digest('hex');
  return hash === signature;
}
```

#### IntaSend

```typescript
import crypto from 'crypto';

function verifyIntasendWebhook(body: string, signature: string, secret: string): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return hash === signature;
}
```

## Webhook Payload Examples

### M-Pesa STK Push Callback

```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "12345-67890-1",
      "CheckoutRequestID": "ws_CO_1234567890",
      "ResultCode": 0,
      "ResultDesc": "The service request is processed successfully.",
      "CallbackMetadata": {
        "Item": [
          { "Name": "Amount", "Value": 1000 },
          { "Name": "MpesaReceiptNumber", "Value": "LGR7CO7Z27" },
          { "Name": "Balance" },
          { "Name": "TransactionDate", "Value": 20240101120000 },
          { "Name": "PhoneNumber", "Value": 254712345678 }
        ]
      }
    }
  }
}
```

### Paystack Payment Success

```json
{
  "event": "charge.success",
  "data": {
    "id": 123456789,
    "domain": "test",
    "status": "success",
    "reference": "ORDER-123",
    "amount": 500000,
    "message": null,
    "gateway_response": "Approved",
    "paid_at": "2024-01-01T12:00:00.000Z",
    "created_at": "2024-01-01T11:59:00.000Z",
    "channel": "card",
    "currency": "NGN",
    "ip_address": "192.168.1.1",
    "metadata": {
      "order_id": "ORDER-123"
    },
    "fees": 7500,
    "customer": {
      "id": 12345,
      "email": "customer@example.com",
      "customer_code": "CUS_abc123"
    },
    "authorization": {
      "authorization_code": "AUTH_abc123",
      "card_type": "visa",
      "last4": "4081",
      "exp_month": "12",
      "exp_year": "2025"
    }
  }
}
```

### IntaSend Payment Completed

```json
{
  "event": "payment.completed",
  "invoice": {
    "invoice_id": "INV-123456",
    "state": "COMPLETE",
    "provider": "M-PESA",
    "charges": 25,
    "net_amount": 975,
    "currency": "KES",
    "value": 1000,
    "account": "254712345678",
    "api_ref": "ORDER-123",
    "mpesa_reference": "LGR7CO7Z27",
    "created_at": "2024-01-01T12:00:00+03:00",
    "updated_at": "2024-01-01T12:01:30+03:00"
  }
}
```

## Best Practices

### 1. Respond Quickly

Always respond with HTTP 200 immediately, then process asynchronously:

```typescript
app.post('/webhooks/paystack', async (req, res) => {
  // Respond immediately
  res.sendStatus(200);
  
  // Process asynchronously
  await processEvent(req.body).catch(console.error);
});
```

### 2. Idempotency

Handle duplicate webhooks gracefully:

```typescript
async function processPayment(event: any) {
  const paymentId = event.data.reference;
  
  // Check if already processed
  const existing = await db.payments.findOne({ reference: paymentId });
  if (existing?.status === 'completed') {
    console.log('Payment already processed:', paymentId);
    return;
  }
  
  // Process payment
  await db.payments.updateOne(
    { reference: paymentId },
    { 
      $set: { 
        status: 'completed',
        processedAt: new Date()
      }
    }
  );
}
```

### 3. Retry Logic

Providers retry failed webhooks:

| Provider | Retry Policy |
|----------|--------------|
| M-Pesa | No retries - must always return 200 |
| Paystack | Retries 3 times over 24 hours |
| IntaSend | Retries 5 times with backoff |
| MTN MoMo | Retries based on configuration |

### 4. Local Development with ngrok

```bash
# Install ngrok
npm install -g ngrok

# Expose local server
ngrok http 3000

# Use the HTTPS URL as your webhook URL
# https://abc123.ngrok.io/webhooks/paystack
```

### 5. Logging

Always log webhooks for debugging:

```typescript
app.post('/webhooks/:provider', async (req, res) => {
  // Log webhook
  await db.webhooks.insertOne({
    provider: req.params.provider,
    headers: req.headers,
    body: req.body,
    receivedAt: new Date()
  });
  
  // Process...
});
```

## Troubleshooting

### Webhooks Not Received

1. **Check URL is public** - Use ngrok for local development
2. **Verify HTTPS** - Most providers require HTTPS
3. **Check firewall** - Ensure not blocking provider IPs
4. **Test manually** - Use curl to POST to your endpoint

### Invalid Signature

1. **Check secret** - Ensure using correct webhook secret
2. **Raw body** - Don't parse JSON before verification
3. **Encoding** - Ensure UTF-8 encoding

### Duplicate Events

- Implement idempotency checks
- Use database unique constraints
- Log processed event IDs

## Testing Webhooks

### Paystack Test Events

```bash
curl https://api.paystack.co/simulate/webhook \
  -H "Authorization: Bearer YOUR_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "charge.success",
    "url": "https://yourapp.com/webhooks/paystack"
  }'
```

### Local Webhook Testing

```bash
# Use stripe-cli style tool (for any webhook)
npx webhook-cli listen --forward-to http://localhost:3000/webhooks
```
