# Africa Payments MCP SDKs

Multi-platform SDKs for Africa Payments MCP - enabling mobile money payments (M-Pesa, MTN Mobile Money, Airtel Money, etc.) across Africa.

## Available SDKs

### 1. React Native SDK (`react-native/`)

Official React Native SDK for cross-platform mobile apps.

**Features:**
- iOS & Android native modules
- React Hooks: `usePayment`, `useTransaction`
- UI Components: `PaymentButton`, `PaymentModal`
- Real-time payment events

**Installation:**
```bash
npm install africa-payments-mcp-rn
cd ios && pod install
```

**Quick Start:**
```typescript
import { PaymentButton, usePayment } from 'africa-payments-mcp-rn';

<PaymentButton
  config={{ apiKey: 'key', environment: 'sandbox', region: 'ke' }}
  request={{ amount: 1000, currency: 'KES', phoneNumber: '254...', reference: 'ORDER-123' }}
  onSuccess={(res) => console.log(res.transactionId)}
/>
```

[Read more](./react-native/README.md)

---

### 2. Flutter SDK (`flutter/`)

Official Flutter SDK for cross-platform mobile apps.

**Features:**
- Dart package with platform channels
- Widgets: `PaymentButton`, `PaymentSheet`
- Async service API
- State management support

**Installation:**
```yaml
dependencies:
  africa_payments_mcp: ^1.0.0
```

**Quick Start:**
```dart
import 'package:africa_payments_mcp/africa_payments_mcp.dart';

PaymentButton(
  config: PaymentConfig(apiKey: 'key', environment: PaymentEnvironment.sandbox, region: PaymentRegion.kenya),
  request: PaymentRequest(amount: 1000, currency: 'KES', phoneNumber: '254...', reference: 'ORDER-123'),
  onSuccess: (res) => print(res.transactionId),
)
```

[Read more](./flutter/README.md)

---

### 3. Python SDK (`python/`)

Official Python SDK with async/await support.

**Features:**
- Async client with `httpx`
- Pydantic models for type safety
- Django & Flask integrations
- Webhook handling with signature verification

**Installation:**
```bash
pip install africa-payments-mcp
```

**Quick Start:**
```python
from africa_payments_mcp import AfricaPaymentsClient, PaymentRequest

async with AfricaPaymentsClient(api_key='key', environment='sandbox', region='ke') as client:
    response = await client.initiate_payment(
        PaymentRequest(amount=1000, currency='KES', phone_number='254...', reference='ORDER-123')
    )
    print(response.transaction_id)
```

[Read more](./python/README.md)

---

### 4. Unity SDK (`unity/`)

Official Unity SDK for game development.

**Features:**
- C# client with coroutine support
- UI prefabs: `PaymentButton`, `PaymentModal`
- Unity IAP integration
- In-game purchase support

**Installation:**
```
Window → Package Manager → Add package from git URL
https://github.com/africa-payments/africa-payments-mcp-unity.git
```

**Quick Start:**
```csharp
using AfricaPaymentsMcp.UI;

PaymentModal.Show(
    config: paymentConfig,
    request: new PaymentRequest { Amount = 1000, Currency = "KES", Reference = "ORDER-123" },
    callback: (response, error) => {
        if (response?.IsSuccess == true) {
            GrantItemToPlayer();
        }
    }
);
```

[Read more](./unity/README.md)

---

## Supported Regions

| Region | Code | Currency | Providers |
|--------|------|----------|-----------|
| Kenya | `ke` | KES | M-Pesa |
| Nigeria | `ng` | NGN | MTN, Airtel |
| Ghana | `gh` | GHS | MTN, Vodafone, Airtel |
| South Africa | `za` | ZAR | Bank, Card |
| Tanzania | `tz` | TZS | M-Pesa, Tigo Pesa |
| Uganda | `ug` | UGX | MTN, Airtel |

## API Environments

- **Sandbox**: `https://api.sandbox.africapayments.com`
- **Production**: `https://api.africapayments.com`

## Common Features Across SDKs

All SDKs provide:
- ✅ Payment initiation (STK Push)
- ✅ Transaction status querying
- ✅ Transaction history
- ✅ Refunds
- ✅ Real-time status polling
- ✅ Webhook handling
- ✅ Type-safe models
- ✅ Comprehensive error handling

## Documentation

- [API Reference](https://docs.africapayments.com)
- [Webhook Guide](https://docs.africapayments.com/webhooks)
- [Testing Guide](https://docs.africapayments.com/testing)

## Support

- 📧 Email: dev@africapayments.com
- 💬 Discord: [Join our community](https://discord.gg/africapayments)
- 🐛 Issues: [GitHub Issues](https://github.com/africa-payments/africa-payments-mcp/issues)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

All SDKs are licensed under the MIT License. See individual SDK directories for license details.

---

Built with ❤️ by Africa Payments
