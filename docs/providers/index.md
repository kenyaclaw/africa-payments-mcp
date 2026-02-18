# Payment Providers

Africa Payments MCP supports all major payment providers across the African continent. Choose the provider that best fits your business needs and target markets.

## Supported Providers

<div class="providers-list">

### [M-Pesa](./mpesa.md) <Badge type="tip" text="Ready" />

<div class="provider-card">
  <div class="provider-icon" style="background: #00a650;">🦁</div>
  <div>
    <strong>Safaricom M-Pesa</strong><br/>
    Mobile money leader in East Africa. Best for Kenya, Tanzania, Uganda, DRC, Mozambique, and Lesotho.
  </div>
</div>

### [Paystack](./paystack.md) <Badge type="tip" text="Ready" />

<div class="provider-card">
  <div class="provider-icon" style="background: #011b33;">💳</div>
  <div>
    <strong>Paystack</strong><br/>
    Modern payment infrastructure for Africa. Card payments, bank transfers, and mobile money. Best for Nigeria and Ghana.
  </div>
</div>

### [MTN MoMo](./mtn-momo.md) <Badge type="tip" text="Ready" />

<div class="provider-card">
  <div class="provider-icon" style="background: #ffcc00; color: #000;">📱</div>
  <div>
    <strong>MTN Mobile Money</strong><br/>
    The largest mobile money platform in Africa. Available in 16+ countries across West, Central, and East Africa.
  </div>
</div>

### [IntaSend](./intasend.md) <Badge type="tip" text="Ready" />

<div class="provider-card">
  <div class="provider-icon" style="background: #6366f1;">⚡</div>
  <div>
    <strong>IntaSend</strong><br/>
    Modern payment APIs for African businesses. M-Pesa, Bank, and Card payments with simple integration.
  </div>
</div>

### [Airtel Money](./airtel-money.md) <Badge type="tip" text="Ready" />

<div class="provider-card">
  <div class="provider-icon" style="background: #e60000;">📲</div>
  <div>
    <strong>Airtel Money</strong><br/>
    Mobile money service from Airtel Africa. Available in 14+ African countries.
  </div>
</div>

</div>

## Provider Comparison

| Feature | M-Pesa | Paystack | MTN MoMo | IntaSend | Airtel Money |
|---------|--------|----------|----------|----------|--------------|
| Card Payments | ❌ | ✅ | ❌ | ✅ | ❌ |
| Bank Transfer | ❌ | ✅ | ❌ | ✅ | ❌ |
| Mobile Money | ✅ | ✅ | ✅ | ✅ | ✅ |
| International | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Payouts/B2B | ✅ | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sandbox | ✅ | ✅ | ✅ | ✅ | ✅ |

## Coverage Map

### East Africa
- **Kenya**: M-Pesa, IntaSend, Airtel Money
- **Tanzania**: M-Pesa, MTN MoMo, Airtel Money
- **Uganda**: MTN MoMo, Airtel Money
- **Rwanda**: MTN MoMo, Airtel Money

### West Africa
- **Nigeria**: Paystack, MTN MoMo, Airtel Money
- **Ghana**: Paystack, MTN MoMo, Airtel Money
- **Ivory Coast**: MTN MoMo, Orange Money
- **Senegal**: Wave, Orange Money

### Southern Africa
- **South Africa**: Paystack
- **Zambia**: MTN MoMo, Airtel Money
- **Malawi**: Airtel Money
- **DRC**: M-Pesa, Airtel Money

### Central Africa
- **Cameroon**: MTN MoMo, Orange Money
- **Gabon**: Airtel Money
- **Congo**: Airtel Money

## Choosing a Provider

### For Kenya
1. **M-Pesa** - Best coverage and reliability
2. **IntaSend** - Easier API, good for startups
3. **Airtel Money** - Alternative for Airtel users

### For Nigeria
1. **Paystack** - Full-featured, excellent documentation
2. **MTN MoMo** - Mobile money option
3. **Airtel Money** - Growing network

### For Ghana
1. **Paystack** - Cards and mobile money
2. **MTN MoMo** - Dominant mobile money provider

### For Multi-Country
Consider using multiple providers:
```javascript
{
  routing: {
    'KE': 'mpesa',
    'NG': 'paystack',
    'GH': 'paystack'
  }
}
```

## Provider Credentials

Each provider requires different credentials. See individual provider pages for details on how to obtain:

- API Keys
- OAuth credentials
- Webhook secrets
- Sandbox access

## Adding New Providers

Africa Payments MCP is designed to be extensible. To add a new provider:

1. Create a provider adapter
2. Implement required interfaces
3. Add configuration schema
4. Submit a PR

See [Contributing](../contributing.md) for details.
