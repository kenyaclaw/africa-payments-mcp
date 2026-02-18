"""Tests for Africa Payments MCP client."""

import pytest
import respx
from httpx import Response

from africa_payments_mcp import (
    AfricaPaymentsClient,
    AuthenticationError,
    NotFoundError,
    PaymentConfig,
    PaymentError,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    RefundRequest,
    TransactionHistory,
    TransactionQuery,
    ValidationError,
)


@pytest.fixture
def client():
    """Create test client."""
    return AfricaPaymentsClient(
        api_key="test-api-key",
        environment="sandbox",
        region="ke",
    )


@pytest.fixture
def base_url():
    """Base URL for sandbox API."""
    return "https://api.sandbox.africapayments.com/v1"


class TestClientInitialization:
    """Test client initialization."""

    def test_client_creation(self):
        client = AfricaPaymentsClient(api_key="test-key")
        assert client.config.api_key == "test-key"
        assert client.config.environment.value == "sandbox"

    def test_client_from_config(self):
        config = PaymentConfig(api_key="test-key", environment="production", region="ng")
        client = AfricaPaymentsClient.from_config(config)
        assert client.config == config

    def test_invalid_config(self):
        with pytest.raises(ValueError, match="API key is required"):
            PaymentConfig(api_key="")


class TestInitiatePayment:
    """Test payment initiation."""

    @respx.mock
    async def test_successful_payment(self, client, base_url):
        route = respx.post(f"{base_url}/payments").mock(
            return_value=Response(
                201,
                json={
                    "transactionId": "tx-123",
                    "status": "pending",
                    "reference": "REF-001",
                    "amount": 1000.00,
                    "currency": "KES",
                    "phoneNumber": "254712345678",
                    "createdAt": "2024-01-01T00:00:00Z",
                    "updatedAt": "2024-01-01T00:00:00Z",
                },
            )
        )

        request = PaymentRequest(
            amount=1000.00,
            currency="KES",
            phone_number="254712345678",
            reference="REF-001",
        )

        async with client:
            response = await client.initiate_payment(request)

        assert isinstance(response, PaymentResponse)
        assert response.transaction_id == "tx-123"
        assert response.status == PaymentStatus.PENDING
        assert response.amount == 1000.00
        assert route.called

    @respx.mock
    async def test_validation_error(self, client, base_url):
        respx.post(f"{base_url}/payments").mock(
            return_value=Response(
                400,
                json={"message": "Invalid phone number", "code": "INVALID_PHONE"},
            )
        )

        request = PaymentRequest(
            amount=1000.00,
            currency="KES",
            phone_number="invalid",
            reference="REF-001",
        )

        async with client:
            with pytest.raises(ValidationError) as exc_info:
                await client.initiate_payment(request)
        
        assert "Invalid phone number" in str(exc_info.value)

    @respx.mock
    async def test_authentication_error(self, client, base_url):
        respx.post(f"{base_url}/payments").mock(
            return_value=Response(
                401,
                json={"message": "Invalid API key"},
            )
        )

        request = PaymentRequest(
            amount=1000.00,
            currency="KES",
            phone_number="254712345678",
            reference="REF-001",
        )

        async with client:
            with pytest.raises(AuthenticationError):
                await client.initiate_payment(request)


class TestGetTransaction:
    """Test get transaction."""

    @respx.mock
    async def test_get_transaction_success(self, client, base_url):
        respx.get(f"{base_url}/payments/tx-123").mock(
            return_value=Response(
                200,
                json={
                    "transactionId": "tx-123",
                    "status": "success",
                    "reference": "REF-001",
                    "amount": 1000.00,
                    "currency": "KES",
                    "phoneNumber": "254712345678",
                    "createdAt": "2024-01-01T00:00:00Z",
                    "updatedAt": "2024-01-01T00:00:00Z",
                    "receiptUrl": "https://example.com/receipt",
                },
            )
        )

        async with client:
            response = await client.get_transaction("tx-123")

        assert response.transaction_id == "tx-123"
        assert response.is_success
        assert response.receipt_url == "https://example.com/receipt"

    @respx.mock
    async def test_transaction_not_found(self, client, base_url):
        respx.get(f"{base_url}/payments/tx-999").mock(
            return_value=Response(
                404,
                json={"message": "Transaction not found"},
            )
        )

        async with client:
            with pytest.raises(NotFoundError):
                await client.get_transaction("tx-999")


class TestTransactionHistory:
    """Test transaction history."""

    @respx.mock
    async def test_get_history(self, client, base_url):
        respx.get(f"{base_url}/payments").mock(
            return_value=Response(
                200,
                json={
                    "transactions": [
                        {
                            "transactionId": "tx-001",
                            "status": "success",
                            "reference": "REF-001",
                            "amount": 1000.00,
                            "currency": "KES",
                            "phoneNumber": "254712345678",
                            "createdAt": "2024-01-01T00:00:00Z",
                            "updatedAt": "2024-01-01T00:00:00Z",
                        }
                    ],
                    "total": 1,
                    "hasMore": False,
                },
            )
        )

        async with client:
            history = await client.get_transaction_history(
                TransactionQuery(limit=10)
            )

        assert isinstance(history, TransactionHistory)
        assert len(history.transactions) == 1
        assert history.total == 1
        assert not history.has_more


class TestRefund:
    """Test refunds."""

    @respx.mock
    async def test_full_refund(self, client, base_url):
        respx.post(f"{base_url}/refunds").mock(
            return_value=Response(
                200,
                json={
                    "transactionId": "refund-123",
                    "status": "success",
                    "reference": "REFUND-001",
                    "amount": 1000.00,
                    "currency": "KES",
                    "phoneNumber": "254712345678",
                    "createdAt": "2024-01-01T00:00:00Z",
                    "updatedAt": "2024-01-01T00:00:00Z",
                },
            )
        )

        request = RefundRequest(transaction_id="tx-123")

        async with client:
            response = await client.refund(request)

        assert response.transaction_id == "refund-123"
        assert response.is_success

    @respx.mock
    async def test_partial_refund(self, client, base_url):
        respx.post(f"{base_url}/refunds").mock(
            return_value=Response(
                200,
                json={
                    "transactionId": "refund-123",
                    "status": "success",
                    "reference": "REFUND-001",
                    "amount": 500.00,
                    "currency": "KES",
                    "phoneNumber": "254712345678",
                    "createdAt": "2024-01-01T00:00:00Z",
                    "updatedAt": "2024-01-01T00:00:00Z",
                },
            )
        )

        request = RefundRequest(transaction_id="tx-123", amount=500.00)

        async with client:
            response = await client.refund(request)

        assert response.amount == 500.00


class TestVerifyPayment:
    """Test payment verification."""

    @respx.mock
    async def test_verify_success(self, client, base_url):
        respx.get(f"{base_url}/payments/tx-123").mock(
            return_value=Response(
                200,
                json={
                    "transactionId": "tx-123",
                    "status": "success",
                    "reference": "REF-001",
                    "amount": 1000.00,
                    "currency": "KES",
                    "phoneNumber": "254712345678",
                    "createdAt": "2024-01-01T00:00:00Z",
                    "updatedAt": "2024-01-01T00:00:00Z",
                },
            )
        )

        async with client:
            is_success = await client.verify_payment("tx-123")

        assert is_success is True

    @respx.mock
    async def test_verify_failed(self, client, base_url):
        respx.get(f"{base_url}/payments/tx-123").mock(
            return_value=Response(
                200,
                json={
                    "transactionId": "tx-123",
                    "status": "failed",
                    "reference": "REF-001",
                    "amount": 1000.00,
                    "currency": "KES",
                    "phoneNumber": "254712345678",
                    "createdAt": "2024-01-01T00:00:00Z",
                    "updatedAt": "2024-01-01T00:00:00Z",
                    "failureReason": "Insufficient funds",
                },
            )
        )

        async with client:
            is_success = await client.verify_payment("tx-123")

        assert is_success is False


class TestWebhook:
    """Test webhook functionality."""

    def test_verify_webhook_signature(self, client):
        payload = b'{"test": "data"}'
        secret = "webhook-secret"
        
        # Generate valid signature
        import hmac
        import hashlib
        expected_sig = hmac.new(
            secret.encode(),
            payload,
            hashlib.sha256,
        ).hexdigest()

        is_valid = client.verify_webhook_signature(payload, expected_sig, secret)
        assert is_valid is True

        is_invalid = client.verify_webhook_signature(payload, "invalid", secret)
        assert is_invalid is False
