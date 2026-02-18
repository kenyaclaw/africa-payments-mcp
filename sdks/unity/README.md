# Africa Payments MCP Unity SDK

Official Unity SDK for Africa Payments MCP - enabling mobile money payments (M-Pesa, MTN Mobile Money, Airtel Money, etc.) across Africa in your games.

## Features

- 🌍 **Multi-Region Support**: Kenya, Nigeria, Ghana, Tanzania, Uganda, South Africa
- 🎮 **Unity IAP Integration**: Seamless integration with Unity's IAP system
- 🎨 **UI Components**: Ready-to-use PaymentButton and PaymentModal prefabs
- 📱 **Cross-Platform**: iOS & Android support
- 🔄 **Status Polling**: Automatic transaction status polling
- 🎯 **Type-Safe**: Full C# type support

## Installation

### Option 1: Unity Package Manager (UPM)

```
Window → Package Manager → Add package from git URL
https://github.com/africa-payments/africa-payments-mcp-unity.git
```

### Option 2: Manual Installation

1. Download the latest release `.unitypackage`
2. Import into your project: `Assets → Import Package → Custom Package`

### Option 3: Asset Store

Search for "Africa Payments MCP" in the Unity Asset Store.

## Quick Start

### 1. Configure the SDK

Create a `PaymentConfig` asset in your project:

```csharp
// Create via menu: Assets → Create → Africa Payments → Config
[CreateAssetMenu(fileName = "PaymentConfig", menuName = "Africa Payments/Config")]
public class PaymentConfig : ScriptableObject
{
    public string apiKey = "your-api-key";
    public PaymentEnvironment environment = PaymentEnvironment.Sandbox;
    public PaymentRegion region = PaymentRegion.Kenya;
}
```

### 2. Add Payment Button

Add the `PaymentButton` component to a UI Button:

```csharp
using AfricaPaymentsMcp.UI;
using AfricaPaymentsMcp.Models;

public class ShopController : MonoBehaviour
{
    [SerializeField] private PaymentConfig config;
    [SerializeField] private PaymentButton paymentButton;

    void Start()
    {
        paymentButton.SetConfig(config);
        paymentButton.SetAmount(1000);
        
        paymentButton.onPaymentSuccess.AddListener(OnPaymentSuccess);
        paymentButton.onPaymentFailed.AddListener(OnPaymentFailed);
    }

    void OnPaymentSuccess(PaymentResponse response)
    {
        Debug.Log($"Payment successful! TX: {response.TransactionId}");
        // Grant item to player
    }

    void OnPaymentFailed(PaymentResponse response)
    {
        Debug.Log("Payment failed");
    }
}
```

### 3. Use Payment Modal

Show the payment modal programmatically:

```csharp
using AfricaPaymentsMcp.UI;
using AfricaPaymentsMcp.Models;

public void ShowPayment()
{
    var request = new PaymentRequest
    {
        Amount = 2500,
        Currency = "KES",
        Reference = $"ORDER-{System.DateTime.Now.Ticks}",
        Description = "Premium Gems Pack"
    };

    PaymentModal.Show(config, request, (response, error) =>
    {
        if (response?.IsSuccess == true)
        {
            Debug.Log($"Paid! TX: {response.TransactionId}");
            GrantGems(100);
        }
        else
        {
            Debug.LogError($"Payment error: {error}");
        }
    });
}
```

## Unity IAP Integration

### Setup

1. Enable Unity IAP in your project: `Window → Services → In-App Purchasing`
2. Add the `AfricaPaymentsIAP` component to your scene
3. Configure with your `PaymentConfig`

### Usage

```csharp
public class GameStore : MonoBehaviour
{
    [SerializeField] private AfricaPaymentsIAP iap;

    public void BuyGemsPack()
    {
        // Use mobile money on Android/iOS
        #if UNITY_ANDROID || UNITY_IOS
        iap.PurchaseWithMobileMoney(
            productId: "gems_pack_100",
            amount: 1000,
            currency: "KES",
            phoneNumber: playerPhoneNumber,
            callback: (success, transactionId) =>
            {
                if (success)
                    Debug.Log($"Bought gems! TX: {transactionId}");
            }
        );
        #else
        // Use standard Unity IAP on other platforms
        iap.PurchaseWithUnityIAP("gems_pack_100", callback);
        #endif
    }
}
```

## API Reference

### PaymentService

```csharp
// Get singleton instance
var service = PaymentService.Instance;

// Initialize
service.Initialize(config);

// Initiate payment
service.InitiatePayment(request, (response, error) => {
    // Handle response
});

// Poll for status
service.PollTransactionStatus(
    transactionId: "tx-123",
    interval: 5f,
    timeout: 300f,
    onUpdate: (response, error) => {
        // Handle update
    }
);

// Get transaction
service.GetTransaction(transactionId, (response, error) => {
    // Handle response
});
```

### Models

| Class | Description |
|-------|-------------|
| `PaymentConfig` | SDK configuration (API key, environment, region) |
| `PaymentRequest` | Payment initiation request |
| `PaymentResponse` | Payment response data |
| `PaymentStatus` | Enum: Pending, Success, Failed, Cancelled |
| `PaymentRegion` | Enum: Kenya, Nigeria, Ghana, etc. |

## UI Prefabs

### PaymentButton

A pre-styled button for initiating payments.

**Properties:**
- `Config`: Payment configuration
- `Amount`: Payment amount
- `Currency`: Currency code
- `Reference`: Order reference
- `OnPaymentSuccess`: Success event
- `OnPaymentFailed`: Failure event

### PaymentModal

A full-screen modal for collecting payment information.

**Features:**
- Phone number input
- Amount display
- Loading state
- Success/error feedback
- Auto-polling for status

## Platform Configuration

### Android

No additional configuration needed.

### iOS

Add to `Info.plist`:
```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

## Testing

### Sandbox Mode

Set `environment = PaymentEnvironment.Sandbox` in your config to test without real money.

### Test Phone Numbers

| Region | Test Number |
|--------|-------------|
| Kenya | 254708374149 |
| Nigeria | 2347012345678 |
| Ghana | 233501234567 |

## Example Scenes

The SDK includes example scenes demonstrating:
- Basic payment flow
- Unity IAP integration
- Transaction history
- Custom UI implementation

## Troubleshooting

### "SDK not properly configured"
- Check that your API key is set correctly
- Verify the PaymentConfig asset is assigned

### "Network error"
- Check internet connectivity
- Verify firewall/proxy settings
- Ensure correct base URL for environment

### "Invalid phone number"
- Phone number should include country code
- Example: 254712345678 (Kenya)

## Support

- Documentation: https://docs.africapayments.com/unity
- Issues: https://github.com/africa-payments/africa-payments-mcp-unity/issues
- Email: support@africapayments.com

## License

MIT © Africa Payments
