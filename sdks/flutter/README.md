# Africa Payments MCP Flutter SDK

Official Flutter SDK for Africa Payments MCP - enabling mobile money payments (M-Pesa, MTN Mobile Money, Airtel Money, etc.) across Africa.

## Features

- 🌍 **Multi-Region Support**: Kenya, Nigeria, Ghana, Tanzania, Uganda, South Africa
- 📱 **Cross-Platform**: iOS & Android
- 🎨 **Beautiful UI Widgets**: `PaymentButton`, `PaymentSheet`
- 🔧 **Flexible**: Use widgets or direct service calls
- 📊 **Transaction Management**: Query, history, refunds
- 🔔 **Real-time Events**: Payment status updates

## Installation

Add to your `pubspec.yaml`:

```yaml
dependencies:
  africa_payments_mcp: ^1.0.0
```

Run:
```bash
flutter pub get
```

## Quick Start

### Using PaymentButton Widget

```dart
import 'package:africa_payments_mcp/africa_payments_mcp.dart';

class CheckoutPage extends StatelessWidget {
  final config = const PaymentConfig(
    apiKey: 'your-api-key',
    environment: PaymentEnvironment.sandbox,
    region: PaymentRegion.kenya,
  );

  @override
  Widget build(BuildContext context) {
    return PaymentButton(
      config: config,
      request: PaymentRequest(
        amount: 1000.0,
        currency: 'KES',
        phoneNumber: '254712345678',
        reference: 'ORDER-123',
        description: 'Payment for Order #123',
      ),
      title: 'Pay with M-Pesa',
      onSuccess: (response) {
        print('Payment successful: ${response.transactionId}');
      },
      onError: (error) {
        print('Payment failed: $error');
      },
    );
  }
}
```

### Using PaymentSheet

```dart
class CheckoutPage extends StatelessWidget {
  void _showPayment(BuildContext context) {
    PaymentSheet.show(
      context: context,
      config: PaymentConfig(
        apiKey: 'your-api-key',
        environment: PaymentEnvironment.sandbox,
        region: PaymentRegion.kenya,
      ),
      amount: 2500.0,
      currency: 'KES',
      reference: 'ORDER-123',
      description: 'Premium subscription',
      title: 'Complete Your Purchase',
      onSuccess: (response) {
        print('Paid! TX: ${response.transactionId}');
      },
      onError: (error) {
        print('Error: $error');
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: () => _showPayment(context),
      child: Text('Pay Now'),
    );
  }
}
```

### Using PaymentService Directly

```dart
class PaymentController {
  final _service = PaymentService();
  
  Future<void> initialize() async {
    await _service.initialize(PaymentConfig(
      apiKey: 'your-api-key',
      environment: PaymentEnvironment.sandbox,
      region: PaymentRegion.kenya,
    ));
  }
  
  Future<void> makePayment() async {
    try {
      final response = await _service.initiatePayment(
        PaymentRequest(
          amount: 1000.0,
          currency: 'KES',
          phoneNumber: '254712345678',
          reference: 'ORDER-123',
        ),
      );
      
      if (response.isSuccess) {
        print('Success: ${response.transactionId}');
      }
    } on PaymentException catch (e) {
      print('Error: ${e.message}');
    }
  }
  
  Future<void> getHistory() async {
    final history = await _service.getTransactionHistory(
      TransactionQuery(limit: 10),
    );
    
    for (final tx in history.transactions) {
      print('${tx.reference}: ${tx.status}');
    }
  }
  
  void dispose() {
    _service.dispose();
  }
}
```

## API Reference

### PaymentConfig

| Property | Type | Description |
|----------|------|-------------|
| `apiKey` | `String` | Your Africa Payments API key |
| `environment` | `PaymentEnvironment` | `sandbox` or `production` |
| `region` | `PaymentRegion` | Target region |
| `timeoutSeconds` | `int` | Request timeout (default: 30) |

### PaymentRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `amount` | `double` | Yes | Payment amount |
| `currency` | `String` | Yes | Currency code |
| `phoneNumber` | `String` | Yes | Customer phone |
| `reference` | `String` | Yes | Unique order reference |
| `description` | `String` | No | Payment description |
| `metadata` | `Map<String, dynamic>` | No | Additional data |

### PaymentResponse

| Property | Type | Description |
|----------|------|-------------|
| `transactionId` | `String` | Unique transaction ID |
| `status` | `PaymentStatus` | `pending`, `success`, `failed`, `cancelled` |
| `reference` | `String` | Order reference |
| `amount` | `double` | Payment amount |
| `currency` | `String` | Currency code |
| `receiptUrl` | `String?` | Receipt download URL |

## Running the Example

```bash
cd example
flutter pub get
flutter run
```

## Testing

```bash
flutter test
```

## License

MIT © Africa Payments
