# Africa Payments MCP React Native SDK

Official React Native SDK for Africa Payments MCP - enabling mobile money payments (M-Pesa, MTN Mobile Money, Airtel Money, etc.) across Africa.

## Features

- 🌍 **Multi-Region Support**: Kenya (M-Pesa), Nigeria, Ghana, Tanzania, Uganda, South Africa
- 📱 **Cross-Platform**: iOS & Android native modules
- 🎣 **React Hooks**: `usePayment`, `useTransaction`
- 🎨 **UI Components**: `PaymentButton`, `PaymentModal`
- 🔒 **Secure**: Built-in API key authentication
- 📊 **Transaction Management**: Query, history, refunds
- 🔔 **Real-time Events**: Payment status updates

## Installation

```bash
npm install africa-payments-mcp-rn
# or
yarn add africa-payments-mcp-rn
```

### iOS Setup

```bash
cd ios && pod install
```

### Android Setup

No additional setup required. The SDK works out of the box.

## Quick Start

```typescript
import { 
  PaymentButton, 
  PaymentModal, 
  usePayment,
  useTransaction 
} from 'africa-payments-mcp-rn';

// Configure the SDK
const config = {
  apiKey: 'your-api-key',
  environment: 'sandbox', // or 'production'
  region: 'ke', // 'ke', 'ng', 'gh', 'za', 'tz', 'ug'
};

// Using PaymentButton component
function CheckoutScreen() {
  return (
    <PaymentButton
      config={config}
      request={{
        amount: 1000,
        currency: 'KES',
        phoneNumber: '254712345678',
        reference: 'ORDER-123',
        description: 'Payment for Order #123',
      }}
      title="Pay with M-Pesa"
      onSuccess={(response) => console.log('Payment successful:', response)}
      onError={(error) => console.error('Payment failed:', error)}
    />
  );
}

// Using PaymentModal component
function CheckoutWithModal() {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Button title="Pay Now" onPress={() => setVisible(true)} />
      
      <PaymentModal
        visible={visible}
        onClose={() => setVisible(false)}
        config={config}
        amount={1000}
        currency="KES"
        reference="ORDER-123"
        description="Payment for Order #123"
        onSuccess={(response) => {
          console.log('Payment successful:', response);
          setVisible(false);
        }}
      />
    </>
  );
}
```

## Hooks

### usePayment

```typescript
import { usePayment } from 'africa-payments-mcp-rn';

function CustomPayment() {
  const { pay, loading, error, response, reset } = usePayment({
    config: {
      apiKey: 'your-api-key',
      environment: 'sandbox',
      region: 'ke',
    },
    onSuccess: (response) => console.log('Success:', response),
    onError: (error) => console.error('Error:', error),
    onPending: (response) => console.log('Pending:', response),
  });

  const handlePayment = async () => {
    try {
      const result = await pay({
        amount: 1000,
        currency: 'KES',
        phoneNumber: '254712345678',
        reference: 'ORDER-123',
      });
      console.log('Payment result:', result);
    } catch (err) {
      console.error('Payment failed:', err);
    }
  };

  return (
    <View>
      {loading && <ActivityIndicator />}
      {error && <Text>Error: {error.message}</Text>}
      {response?.status === 'success' && (
        <Text>Payment Successful! TX: {response.transactionId}</Text>
      )}
      <Button title="Pay" onPress={handlePayment} disabled={loading} />
    </View>
  );
}
```

### useTransaction

```typescript
import { useTransaction } from 'africa-payments-mcp-rn';

function TransactionHistory() {
  const { 
    transaction, 
    history, 
    loading, 
    error,
    fetchTransaction,
    fetchHistory,
    refund,
    refresh 
  } = useTransaction({
    config: {
      apiKey: 'your-api-key',
      environment: 'sandbox',
      region: 'ke',
    },
    autoFetch: true,
    query: { limit: 20 },
    pollingInterval: 5000, // Poll every 5 seconds for pending transactions
  });

  const handleRefund = async (transactionId: string) => {
    try {
      const result = await refund(transactionId, 500); // Partial refund
      console.log('Refund successful:', result);
    } catch (err) {
      console.error('Refund failed:', err);
    }
  };

  return (
    <View>
      {loading && <ActivityIndicator />}
      <FlatList
        data={history?.transactions || []}
        renderItem={({ item }) => (
          <View>
            <Text>{item.reference} - {item.amount} {item.currency}</Text>
            <Text>Status: {item.status}</Text>
            {item.status === 'success' && (
              <Button 
                title="Refund" 
                onPress={() => handleRefund(item.transactionId)} 
              />
            )}
          </View>
        )}
      />
    </View>
  );
}
```

## API Reference

### PaymentConfig

| Property | Type | Description |
|----------|------|-------------|
| `apiKey` | `string` | Your Africa Payments API key |
| `environment` | `'sandbox' \| 'production'` | API environment |
| `region` | `'ke' \| 'ng' \| 'gh' \| 'za' \| 'tz' \| 'ug'` | Target region |

### PaymentRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `amount` | `number` | Yes | Payment amount |
| `currency` | `string` | Yes | Currency code (e.g., 'KES', 'NGN') |
| `phoneNumber` | `string` | Yes | Customer phone number |
| `reference` | `string` | Yes | Unique order reference |
| `description` | `string` | No | Payment description |
| `callbackUrl` | `string` | No | Webhook URL for notifications |
| `metadata` | `object` | No | Additional metadata |

### PaymentResponse

| Property | Type | Description |
|----------|------|-------------|
| `transactionId` | `string` | Unique transaction ID |
| `status` | `'pending' \| 'success' \| 'failed' \| 'cancelled'` | Payment status |
| `reference` | `string` | Order reference |
| `amount` | `number` | Payment amount |
| `currency` | `string` | Currency code |
| `phoneNumber` | `string` | Customer phone number |
| `createdAt` | `string` | Transaction creation timestamp |
| `updatedAt` | `string` | Last update timestamp |
| `receiptUrl` | `string` | Receipt download URL |
| `failureReason` | `string` | Reason for failure (if applicable) |

## Running the Example

```bash
cd example
npm install
# iOS
cd ios && pod install && cd ..
npx react-native run-ios
# Android
npx react-native run-android
```

## Testing

```bash
npm test
```

## Contributing

Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a Pull Request.

## License

MIT © Africa Payments
