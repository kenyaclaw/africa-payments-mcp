# Universal Tools

Universal tools provide a provider-agnostic interface for common payment operations. These tools abstract away provider-specific details and work across all supported payment providers.

## Available Tools

### unified_send_money

Send money to a recipient using the best available provider.

```typescript
const result = await client.callTool('unified_send_money', {
  // Required
  recipient_phone: '+254712345678',
  amount: 1000,
  currency: 'KES',
  
  // Optional
  provider: 'mpesa', // Auto-selected if not specified
  reference: 'PAYOUT-001',
  description: 'Payment for services',
  callback_url: 'https://yourapp.com/webhooks/send'
});
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `recipient_phone` | string | ✅ | Recipient phone number with country code |
| `amount` | number | ✅ | Amount to send |
| `currency` | string | ✅ | Currency code (e.g., 'KES', 'NGN') |
| `provider` | string | ❌ | Force specific provider |
| `reference` | string | ❌ | Your unique reference |
| `description` | string | ❌ | Transaction description |
| `callback_url` | string | ❌ | Webhook URL for updates |

**Response:**

```json
{
  "success": true,
  "data": {
    "transaction_id": "txn_123456",
    "provider": "mpesa",
    "provider_transaction_id": "LGR7CO7Z27",
    "status": "pending",
    "amount": 1000,
    "currency": "KES",
    "recipient": "+254712345678",
    "reference": "PAYOUT-001",
    "created_at": "2024-01-01T12:00:00Z"
  },
  "metadata": {
    "provider": "mpesa",
    "timestamp": "2024-01-01T12:00:00Z",
    "requestId": "req_abc123"
  }
}
```

### unified_request_payment

Request payment from a customer (STK Push, payment link, etc.).

```typescript
const result = await client.callTool('unified_request_payment', {
  // Required
  customer_phone: '+254712345678',
  amount: 1000,
  currency: 'KES',
  
  // Optional
  provider: 'mpesa',
  reference: 'ORDER-123',
  description: 'Payment for Order 123',
  email: 'customer@example.com',
  callback_url: 'https://yourapp.com/webhooks/payment',
  expires_in: 3600 // seconds
});
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customer_phone` | string | ✅ | Customer phone number |
| `amount` | number | ✅ | Amount to request |
| `currency` | string | ✅ | Currency code |
| `provider` | string | ❌ | Force specific provider |
| `reference` | string | ❌ | Your unique reference |
| `description` | string | ❌ | Payment description |
| `email` | string | ❌ | Customer email |
| `callback_url` | string | ❌ | Webhook URL |
| `expires_in` | number | ❌ | Expiration in seconds |

**Response:**

```json
{
  "success": true,
  "data": {
    "transaction_id": "txn_789012",
    "provider": "mpesa",
    "provider_checkout_id": "ws_CO_1234567890",
    "status": "pending",
    "amount": 1000,
    "currency": "KES",
    "customer": "+254712345678",
    "reference": "ORDER-123",
    "payment_url": null, // Some providers return a URL
    "expires_at": "2024-01-01T13:00:00Z"
  },
  "metadata": { ... }
}
```

### unified_check_status

Check the status of any transaction.

```typescript
const result = await client.callTool('unified_check_status', {
  // Required - one of
  transaction_id: 'txn_123456',
  provider_transaction_id: 'LGR7CO7Z27',
  reference: 'ORDER-123',
  
  // Optional
  provider: 'mpesa'
});
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `transaction_id` | string | ⚠️ | Internal transaction ID |
| `provider_transaction_id` | string | ⚠️ | Provider's transaction ID |
| `reference` | string | ⚠️ | Your reference |
| `provider` | string | ❌ | Provider to query |

::: tip Note
At least one identifier (transaction_id, provider_transaction_id, or reference) is required.
:::

**Response:**

```json
{
  "success": true,
  "data": {
    "transaction_id": "txn_123456",
    "provider": "mpesa",
    "provider_transaction_id": "LGR7CO7Z27",
    "status": "completed", // pending, completed, failed
    "amount": 1000,
    "currency": "KES",
    "recipient": "+254712345678",
    "reference": "PAYOUT-001",
    "completed_at": "2024-01-01T12:01:30Z",
    "failure_reason": null
  },
  "metadata": { ... }
}
```

### unified_get_balance

Get wallet/account balance.

```typescript
const result = await client.callTool('unified_get_balance', {
  // Optional
  provider: 'mpesa',
  currency: 'KES'
});
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `provider` | string | ❌ | Specific provider |
| `currency` | string | ❌ | Filter by currency |

**Response:**

```json
{
  "success": true,
  "data": {
    "balances": [
      {
        "provider": "mpesa",
        "currency": "KES",
        "available": 50000,
        "pending": 2000,
        "total": 52000
      }
    ]
  },
  "metadata": { ... }
}
```

### unified_list_transactions

List transactions with filtering.

```typescript
const result = await client.callTool('unified_list_transactions', {
  // Optional filters
  provider: 'mpesa',
  status: 'completed',
  type: 'send', // send, request, refund
  currency: 'KES',
  from: '2024-01-01',
  to: '2024-01-31',
  limit: 50,
  offset: 0
});
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `provider` | string | ❌ | Filter by provider |
| `status` | string | ❌ | Filter by status |
| `type` | string | ❌ | Filter by type |
| `currency` | string | ❌ | Filter by currency |
| `from` | string | ❌ | Start date (ISO 8601) |
| `to` | string | ❌ | End date (ISO 8601) |
| `limit` | number | ❌ | Max results (default: 50) |
| `offset` | number | ❌ | Pagination offset |

### unified_refund

Refund a completed transaction.

```typescript
const result = await client.callTool('unified_refund', {
  // Required - one of
  transaction_id: 'txn_123456',
  reference: 'ORDER-123',
  
  // Optional
  amount: 1000, // Partial refund if specified
  reason: 'Customer request'
});
```

### unified_validate_phone

Validate if a phone number is registered with a mobile money provider.

```typescript
const result = await client.callTool('unified_validate_phone', {
  phone: '+254712345678',
  provider: 'mpesa' // Optional - checks all if not specified
});
```

**Response:**

```json
{
  "success": true,
  "data": {
    "valid": true,
    "provider": "mpesa",
    "phone": "+254712345678",
    "registered": true
  },
  "metadata": { ... }
}
```

## Smart Provider Routing

When you don't specify a provider, the system routes intelligently based on:

1. **Phone number prefix** - Detects country from phone number
2. **Currency** - Matches provider to currency
3. **Configuration** - Uses your routing preferences
4. **Availability** - Checks provider health/status

### Routing Configuration

```javascript
// africa-payments.config.js
export default {
  routing: {
    // By country code
    'KE': 'mpesa',
    'NG': 'paystack',
    'GH': 'paystack',
    'TZ': 'mpesa',
    'UG': 'mtnMomo',
    
    // By currency
    currencies: {
      'KES': 'mpesa',
      'NGN': 'paystack',
      'GHS': 'paystack',
      'UGX': 'mtnMomo'
    },
    
    // Default provider
    default: 'mpesa',
    
    // Fallback providers (in order)
    fallback: ['intasend', 'mpesa']
  }
};
```

## Error Codes

| Code | Description |
|------|-------------|
| `NO_PROVIDER_AVAILABLE` | No provider configured for this operation |
| `PROVIDER_NOT_CONFIGURED` | Specified provider is not configured |
| `INVALID_PHONE_NUMBER` | Phone number format is invalid |
| `INVALID_CURRENCY` | Currency not supported by provider |
| `AMOUNT_TOO_SMALL` | Below provider minimum |
| `AMOUNT_TOO_LARGE` | Above provider maximum |
| `ROUTING_FAILED` | Could not determine provider |

## Best Practices

1. **Always use references** - Include your own reference for easy tracking
2. **Handle pending status** - Transactions may start as pending
3. **Set up webhooks** - Don't rely solely on polling for status
4. **Validate phone numbers** - Use `unified_validate_phone` before sending
5. **Specify providers when needed** - For provider-specific features
