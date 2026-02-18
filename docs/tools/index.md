# Tools Overview

Africa Payments MCP provides a comprehensive set of tools for payment operations. Tools are organized into two categories:

## Tool Categories

### Universal Tools
Provider-agnostic tools that work across all payment providers with a unified interface.

### Provider-Specific Tools
Native tools that expose each provider's full API capabilities.

## Quick Reference

### Universal Tools

| Tool | Description | Providers |
|------|-------------|-----------|
| `unified_send_money` | Send money to a recipient | All |
| `unified_request_payment` | Request payment from a customer | All |
| `unified_check_status` | Check transaction status | All |
| `unified_get_balance` | Get wallet balance | All |

### Provider-Specific Tools

| Provider | Tools Available |
|----------|-----------------|
| [M-Pesa](./provider-specific.md#m-pesa) | `mpesa_stk_push`, `mpesa_b2c`, `mpesa_transaction_status`, `mpesa_account_balance` |
| [Paystack](./provider-specific.md#paystack) | `paystack_initialize`, `paystack_verify`, `paystack_transfer`, `paystack_list_transactions` |
| [MTN MoMo](./provider-specific.md#mtn-momo) | `mtn_momo_request_payment`, `mtn_momo_transfer`, `mtn_momo_balance` |
| [IntaSend](./provider-specific.md#intasend) | `intasend_collect`, `intasend_payout`, `intasend_payment_link` |
| [Airtel Money](./provider-specific.md#airtel-money) | `airtel_money_collect`, `airtel_money_send`, `airtel_money_balance` |

## When to Use Which?

### Use Universal Tools When:
- You want provider-agnostic code
- You need simple payment operations
- You may switch providers in the future
- You're building multi-country applications

### Use Provider-Specific Tools When:
- You need provider-specific features
- You want maximum control over the API
- You're optimizing for a specific market
- You need advanced features like split payments

## Example: Sending Money

### Universal Approach

```typescript
// Works with any configured provider
const result = await client.callTool('unified_send_money', {
  recipient_phone: '+254712345678',
  amount: 1000,
  currency: 'KES'
});
```

### Provider-Specific Approach

```typescript
// M-Pesa specific
const result = await client.callTool('mpesa_b2c', {
  phoneNumber: '254712345678',
  amount: 1000,
  occasion: 'Payment'
});

// Paystack specific
const result = await client.callTool('paystack_transfer', {
  source: 'balance',
  amount: 100000, // in kobo
  recipient: 'RCP_abc123'
});
```

## Tool Response Format

All tools return a standardized response:

```typescript
{
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: {
    provider: string;
    timestamp: string;
    requestId: string;
  };
}
```

## Error Handling

Common error codes across all tools:

| Code | Description |
|------|-------------|
| `AUTH_FAILED` | Authentication with provider failed |
| `INSUFFICIENT_FUNDS` | Not enough balance for transaction |
| `INVALID_RECIPIENT` | Recipient information is invalid |
| `PROVIDER_ERROR` | Error from payment provider |
| `TIMEOUT` | Request timed out |
| `VALIDATION_ERROR` | Input validation failed |

## Next Steps

- Learn about [Universal Tools](./universal.md)
- Explore [Provider-Specific Tools](./provider-specific.md)
- See [Examples](../examples/)
