# Africa Payments MCP Python SDK

Official Python SDK for Africa Payments MCP - Async client for mobile money payments (M-Pesa, MTN Mobile Money, Airtel Money, etc.) across Africa.

## Features

- 🌍 **Multi-Region Support**: Kenya, Nigeria, Ghana, Tanzania, Uganda, South Africa
- ⚡ **Async/Await**: Full async support with `httpx`
- 🔒 **Type Safe**: Built with Pydantic models
- 🔧 **Webhooks**: Built-in webhook handling and signature verification
- 🎯 **Django/Flask**: Ready-to-use framework integrations
- 📊 **Batch Operations**: Process multiple payments efficiently
- 🔄 **Polling**: Automatic status polling for pending transactions

## Installation

```bash
pip install africa-payments-mcp
```

### With Framework Support

```bash
# Django
pip install africa-payments-mcp[django]

# Flask
pip install africa-payments-mcp[flask]

# Development
pip install africa-payments-mcp[dev]
```

## Quick Start

### Basic Usage

```python
import asyncio
from africa_payments_mcp import AfricaPaymentsClient, PaymentRequest

async def main():
    async with AfricaPaymentsClient(
        api_key="your-api-key",
        environment="sandbox",
        region="ke",
    ) as client:
        # Initiate payment
        response = await client.initiate_payment(
            PaymentRequest(
                amount=1000.00,
                currency="KES",
                phone_number="254712345678",
                reference="ORDER-123",
                description="Payment for Order #123",
            )
        )
        
        print(f"Transaction ID: {response.transaction_id}")
        print(f"Status: {response.status}")
        
        # Poll for status
        final = await client.poll_transaction_status(
            response.transaction_id,
            interval=5.0,
            timeout=300.0,
        )
        
        if final.is_success:
            print("Payment successful!")

asyncio.run(main())
```

### Transaction History

```python
from africa_payments_mcp import TransactionQuery

async def get_history(client):
    history = await client.get_transaction_history(
        TransactionQuery(
            limit=20,
            status=PaymentStatus.SUCCESS,
        )
    )
    
    for tx in history.transactions:
        print(f"{tx.reference}: {tx.amount} {tx.currency} - {tx.status}")
```

### Refunds

```python
from africa_payments_mcp import RefundRequest

async def refund_payment(client, transaction_id):
    refund = await client.refund(
        RefundRequest(
            transaction_id=transaction_id,
            amount=500.00,  # Partial refund
            reason="Customer request",
        )
    )
    print(f"Refund ID: {refund.transaction_id}")
```

## Django Integration

### Settings

```python
# settings.py
AFRICA_PAYMENTS_API_KEY = "your-api-key"
AFRICA_PAYMENTS_ENVIRONMENT = "sandbox"  # or "production"
AFRICA_PAYMENTS_REGION = "ke"
AFRICA_PAYMENTS_TIMEOUT = 30.0
```

### Models

```python
# models.py (optional - for storing transactions)
from africa_payments_mcp.django_integration import PaymentTransaction

class Order(models.Model):
    # ... your fields
    payment = models.ForeignKey(
        PaymentTransaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
```

### Views

```python
# views.py
from django.http import JsonResponse
from africa_payments_mcp.django_integration import get_client
from africa_payments_mcp import PaymentRequest

async def create_payment(request):
    client = get_client()
    
    async with client:
        response = await client.initiate_payment(
            PaymentRequest(
                amount=1000.00,
                currency="KES",
                phone_number=request.POST.get("phone"),
                reference=f"ORDER-{order.id}",
            )
        )
        
        # Save to database
        await PaymentTransaction.objects.acreate(
            transaction_id=response.transaction_id,
            reference=response.reference,
            amount=response.amount,
            currency=response.currency,
            phone_number=response.phone_number,
            status=response.status.value,
        )
        
        return JsonResponse({
            "transaction_id": response.transaction_id,
            "status": response.status.value,
        })
```

### Webhook Setup

```python
# urls.py
from africa_payments_mcp.django_integration import PaymentWebhookView

urlpatterns = [
    path("webhook/payments/", PaymentWebhookView.as_view()),
]
```

## Flask Integration

### Setup

```python
from flask import Flask
from africa_payments_mcp.flask_integration import AfricaPayments, webhook_blueprint

app = Flask(__name__)
app.config["AFRICA_PAYMENTS_API_KEY"] = "your-api-key"
app.config["AFRICA_PAYMENTS_ENVIRONMENT"] = "sandbox"

payments = AfricaPayments(app)
app.register_blueprint(webhook_blueprint)
```

### Usage

```python
@app.route("/pay", methods=["POST"])
async def pay():
    client = payments.client
    
    async with client:
        response = await client.initiate_payment(
            PaymentRequest(
                amount=1000.00,
                currency="KES",
                phone_number=request.form.get("phone"),
                reference="ORDER-123",
            )
        )
        return jsonify({
            "transaction_id": response.transaction_id,
            "status": response.status.value,
        })

# Protect a route with payment check
from africa_payments_mcp.flask_integration import payment_required

@app.route("/download")
@payment_required
async def download():
    # Only accessible with successful payment
    return send_file("file.pdf")
```

## Webhook Handling

### Verify Webhook Signature

```python
async def webhook_handler(request):
    payload = await request.body()
    signature = request.headers.get("X-Webhook-Signature")
    
    async with AfricaPaymentsClient(...) as client:
        is_valid = client.verify_webhook_signature(
            payload,
            signature,
            webhook_secret="your-webhook-secret",
        )
        
        if is_valid:
            event = WebhookEvent.model_validate_json(payload)
            # Process event
```

### Event Handlers

```python
async def handle_payment_success(event: WebhookEvent):
    print(f"Payment {event.data.transaction_id} succeeded!")
    # Update order, send email, etc.

client.add_event_handler(handle_payment_success)
```

## Error Handling

```python
from africa_payments_mcp import (
    AuthenticationError,
    PaymentError,
    ValidationError,
    NotFoundError,
    ServerError,
)

async def safe_payment(client, request):
    try:
        return await client.initiate_payment(request)
    except AuthenticationError:
        print("Invalid API key")
    except ValidationError as e:
        print(f"Invalid request: {e.details}")
    except PaymentError as e:
        print(f"Payment failed: {e.message}")
    except NotFoundError:
        print("Transaction not found")
    except ServerError:
        print("Server error, please retry")
```

## API Reference

### AfricaPaymentsClient

| Method | Description |
|--------|-------------|
| `initiate_payment(request)` | Create a new payment |
| `get_transaction(id)` | Get transaction details |
| `get_transaction_history(query)` | List transactions |
| `refund(request)` | Refund a transaction |
| `verify_payment(id)` | Check if payment succeeded |
| `poll_transaction_status(id)` | Poll until completion |

### Models

| Model | Description |
|-------|-------------|
| `PaymentRequest` | Payment initiation request |
| `PaymentResponse` | Payment response data |
| `TransactionQuery` | History query parameters |
| `RefundRequest` | Refund request data |
| `WebhookEvent` | Webhook payload |

## Testing

```bash
# Run tests
pytest

# With coverage
pytest --cov=africa_payments_mcp

# Run specific test
pytest tests/test_client.py::test_initiate_payment
```

## License

MIT © Africa Payments
