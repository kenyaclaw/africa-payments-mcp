"""Tests for Africa Payments MCP models."""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from africa_payments_mcp.models import (
    PaymentProvider,
    PaymentRegion,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    ProviderConfig,
    TransactionQuery,
)


class TestPaymentRequest:
    """Test PaymentRequest model."""

    def test_valid_request(self):
        request = PaymentRequest(
            amount=Decimal("1000.00"),
            currency="KES",
            phone_number="254712345678",
            reference="REF-001",
        )
        assert request.amount == Decimal("1000.00")
        assert request.currency == "KES"
        assert request.phone_number == "254712345678"
        assert request.is_valid

    def test_phone_number_cleaning(self):
        request = PaymentRequest(
            amount=Decimal("1000.00"),
            currency="KES",
            phone_number="+254 (712) 345-678",
            reference="REF-001",
        )
        assert request.phone_number == "254712345678"
        assert request.clean_phone_number == "254712345678"

    def test_invalid_amount(self):
        with pytest.raises(ValidationError):
            PaymentRequest(
                amount=Decimal("-100"),
                currency="KES",
                phone_number="254712345678",
                reference="REF-001",
            )

    def test_invalid_phone(self):
        with pytest.raises(ValidationError):
            PaymentRequest(
                amount=Decimal("1000"),
                currency="KES",
                phone_number="123",  # Too short
                reference="REF-001",
            )

    def test_currency_uppercase(self):
        request = PaymentRequest(
            amount=Decimal("1000"),
            currency="kes",  # lowercase
            phone_number="254712345678",
            reference="REF-001",
        )
        assert request.currency == "KES"

    def test_to_api_payload(self):
        request = PaymentRequest(
            amount=Decimal("1000.50"),
            currency="KES",
            phone_number="254712345678",
            reference="REF-001",
            description="Test payment",
        )
        payload = request.to_api_payload()
        assert payload["amount"] == 1000.50
        assert payload["currency"] == "KES"
        assert payload["phoneNumber"] == "254712345678"
        assert payload["reference"] == "REF-001"


class TestPaymentResponse:
    """Test PaymentResponse model."""

    def test_success_status(self):
        from datetime import datetime
        
        response = PaymentResponse(
            transaction_id="tx-123",
            status=PaymentStatus.SUCCESS,
            reference="REF-001",
            amount=Decimal("1000"),
            currency="KES",
            phone_number="254712345678",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert response.is_success
        assert not response.is_pending
        assert not response.is_failed

    def test_pending_status(self):
        from datetime import datetime
        
        response = PaymentResponse(
            transaction_id="tx-123",
            status=PaymentStatus.PENDING,
            reference="REF-001",
            amount=Decimal("1000"),
            currency="KES",
            phone_number="254712345678",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert not response.is_success
        assert response.is_pending


class TestTransactionQuery:
    """Test TransactionQuery model."""

    def test_default_values(self):
        query = TransactionQuery()
        assert query.limit == 20
        assert query.offset == 0

    def test_limit_validation(self):
        with pytest.raises(ValidationError):
            TransactionQuery(limit=0)  # Too low
        
        with pytest.raises(ValidationError):
            TransactionQuery(limit=200)  # Too high

    def test_to_api_params(self):
        from datetime import datetime
        
        query = TransactionQuery(
            status=PaymentStatus.SUCCESS,
            limit=50,
            offset=10,
        )
        params = query.to_api_params()
        assert params["limit"] == 50
        assert params["offset"] == 10
        assert params["status"] == "success"


class TestProviderConfig:
    """Test ProviderConfig model."""

    def test_display_names(self):
        providers = [
            (PaymentProvider.MPESA, "M-Pesa"),
            (PaymentProvider.MTN, "MTN Mobile Money"),
            (PaymentProvider.AIRTEL, "Airtel Money"),
            (PaymentProvider.BANK, "Bank Transfer"),
        ]
        
        for provider, expected_name in providers:
            config = ProviderConfig(provider=provider)
            assert config.display_name == expected_name

    def test_default_enabled(self):
        config = ProviderConfig(provider=PaymentProvider.MPESA)
        assert config.enabled is True


class TestEnums:
    """Test enum values."""

    def test_payment_region_values(self):
        assert PaymentRegion.KE.value == "ke"
        assert PaymentRegion.NG.value == "ng"
        assert PaymentRegion.GH.value == "gh"

    def test_payment_status_values(self):
        assert PaymentStatus.PENDING.value == "pending"
        assert PaymentStatus.SUCCESS.value == "success"
        assert PaymentStatus.FAILED.value == "failed"

    def test_payment_provider_values(self):
        assert PaymentProvider.MPESA.value == "mpesa"
        assert PaymentProvider.MTN.value == "mtn"
        assert PaymentProvider.CARD.value == "card"
