"""Basic usage example for Africa Payments MCP SDK."""

import asyncio

from africa_payments_mcp import (
    AfricaPaymentsClient,
    PaymentRequest,
    PaymentStatus,
    RefundRequest,
    TransactionQuery,
)


async def basic_payment_example():
    """Example: Basic payment flow."""
    print("=== Basic Payment Example ===\n")
    
    async with AfricaPaymentsClient(
        api_key="your-api-key",
        environment="sandbox",
        region="ke",
    ) as client:
        # 1. Initiate payment
        print("1. Initiating payment...")
        request = PaymentRequest(
            amount=1000.00,
            currency="KES",
            phone_number="254712345678",
            reference="ORDER-123",
            description="Payment for Order #123",
        )
        
        response = await client.initiate_payment(request)
        print(f"   Transaction ID: {response.transaction_id}")
        print(f"   Status: {response.status.value}")
        print(f"   Reference: {response.reference}\n")
        
        # 2. Poll for status (in real app, use webhooks)
        print("2. Polling for status...")
        final = await client.poll_transaction_status(
            response.transaction_id,
            interval=2.0,
            timeout=30.0,
        )
        
        if final.is_success:
            print(f"   ✅ Payment successful!")
            print(f"   Receipt: {final.receipt_url}\n")
        else:
            print(f"   ❌ Payment failed: {final.failure_reason}\n")


async def transaction_history_example():
    """Example: Query transaction history."""
    print("=== Transaction History Example ===\n")
    
    async with AfricaPaymentsClient(
        api_key="your-api-key",
        environment="sandbox",
        region="ke",
    ) as client:
        # Query successful transactions
        print("1. Querying transaction history...")
        query = TransactionQuery(
            status=PaymentStatus.SUCCESS,
            limit=10,
        )
        
        history = await client.get_transaction_history(query)
        print(f"   Found {history.total} transactions:\n")
        
        for tx in history.transactions:
            print(f"   - {tx.reference}: {tx.currency} {tx.amount}")
            print(f"     Status: {tx.status.value}")
            print(f"     Phone: {tx.phone_number}\n")


async def refund_example():
    """Example: Process a refund."""
    print("=== Refund Example ===\n")
    
    async with AfricaPaymentsClient(
        api_key="your-api-key",
        environment="sandbox",
        region="ke",
    ) as client:
        # Full refund
        print("1. Processing full refund...")
        full_refund = await client.refund(
            RefundRequest(transaction_id="tx-123", reason="Customer request")
        )
        print(f"   Refund ID: {full_refund.transaction_id}")
        print(f"   Amount: {full_refund.currency} {full_refund.amount}\n")
        
        # Partial refund
        print("2. Processing partial refund...")
        partial_refund = await client.refund(
            RefundRequest(
                transaction_id="tx-123",
                amount=500.00,
                reason="Partial refund",
            )
        )
        print(f"   Refund ID: {partial_refund.transaction_id}")
        print(f"   Amount: {partial_refund.currency} {partial_refund.amount}\n")


async def webhook_handling_example():
    """Example: Handle webhook events."""
    print("=== Webhook Handling Example ===\n")
    
    client = AfricaPaymentsClient(
        api_key="your-api-key",
        environment="sandbox",
        region="ke",
    )
    
    # Add event handlers
    async def on_payment_success(event):
        print(f"✅ Payment success: {event.data.transaction_id}")
        # Update order status, send email, etc.
    
    async def on_payment_failed(event):
        print(f"❌ Payment failed: {event.data.transaction_id}")
        print(f"   Reason: {event.data.failure_reason}")
    
    client.add_event_handler(on_payment_success)
    client.add_event_handler(on_payment_failed)
    
    # Simulate webhook (normally this comes from HTTP request)
    webhook_payload = {
        "eventType": "payment.success",
        "data": {
            "transactionId": "tx-123",
            "status": "success",
            "reference": "ORDER-123",
            "amount": 1000.00,
            "currency": "KES",
            "phoneNumber": "254712345678",
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-01T00:00:00Z",
        },
        "timestamp": "2024-01-01T00:00:00Z",
        "signature": "abc123",
    }
    
    print("1. Processing webhook event...")
    await client.handle_webhook(webhook_payload)
    print()


async def error_handling_example():
    """Example: Handle errors gracefully."""
    print("=== Error Handling Example ===\n")
    
    from africa_payments_mcp import (
        AuthenticationError,
        NotFoundError,
        PaymentError,
        ValidationError,
    )
    
    async with AfricaPaymentsClient(
        api_key="invalid-key",
        environment="sandbox",
        region="ke",
    ) as client:
        try:
            await client.initiate_payment(
                PaymentRequest(
                    amount=1000,
                    currency="KES",
                    phone_number="254712345678",
                    reference="ORDER-123",
                )
            )
        except AuthenticationError as e:
            print(f"🔐 Authentication failed: {e.message}")
        except ValidationError as e:
            print(f"⚠️  Validation error: {e.details}")
        except PaymentError as e:
            print(f"💳 Payment error: {e.message}")
        except NotFoundError as e:
            print(f"🔍 Not found: {e.message}")
        except Exception as e:
            print(f"❌ Unexpected error: {e}")


async def main():
    """Run all examples."""
    print("=" * 50)
    print("Africa Payments MCP Python SDK Examples")
    print("=" * 50 + "\n")
    
    try:
        await basic_payment_example()
    except Exception as e:
        print(f"Basic example failed: {e}\n")
    
    try:
        await transaction_history_example()
    except Exception as e:
        print(f"History example failed: {e}\n")
    
    try:
        await refund_example()
    except Exception as e:
        print(f"Refund example failed: {e}\n")
    
    try:
        await webhook_handling_example()
    except Exception as e:
        print(f"Webhook example failed: {e}\n")
    
    try:
        await error_handling_example()
    except Exception as e:
        print(f"Error handling example failed: {e}\n")
    
    print("=" * 50)
    print("Examples completed!")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
