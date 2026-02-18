"""Data models for Africa Payments MCP SDK."""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PaymentStatus(str, Enum):
    """Payment transaction status."""

    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PaymentProvider(str, Enum):
    """Available payment providers."""

    MPESA = "mpesa"
    MTN = "mtn"
    VODAFONE = "vodafone"
    AIRTEL = "airtel"
    BANK = "bank"
    CARD = "card"


class PaymentRegion(str, Enum):
    """Supported regions for payments."""

    KE = "ke"  # Kenya
    NG = "ng"  # Nigeria
    GH = "gh"  # Ghana
    ZA = "za"  # South Africa
    TZ = "tz"  # Tanzania
    UG = "ug"  # Uganda


class PaymentEnvironment(str, Enum):
    """API environment types."""

    SANDBOX = "sandbox"
    PRODUCTION = "production"


class PaymentRequest(BaseModel):
    """Request to initiate a payment.
    
    Attributes:
        amount: Payment amount
        currency: Currency code (e.g., KES, NGN)
        phone_number: Customer phone number
        reference: Unique order reference
        description: Optional payment description
        callback_url: Optional webhook URL
        metadata: Optional additional data
        provider: Preferred payment provider
    """

    model_config = ConfigDict(populate_by_name=True)

    amount: Decimal = Field(gt=0, description="Payment amount")
    currency: str = Field(min_length=3, max_length=3, description="Currency code")
    phone_number: str = Field(alias="phoneNumber", description="Customer phone number")
    reference: str = Field(min_length=1, description="Unique order reference")
    description: Optional[str] = Field(default=None, description="Payment description")
    callback_url: Optional[str] = Field(
        alias="callbackUrl", default=None, description="Webhook URL"
    )
    metadata: Optional[dict[str, Any]] = Field(
        default=None, description="Additional metadata"
    )
    provider: Optional[PaymentProvider] = Field(
        default=None, description="Preferred payment provider"
    )

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, v: str) -> str:
        """Validate and clean phone number."""
        # Remove non-digit characters
        cleaned = "".join(c for c in v if c.isdigit())
        if len(cleaned) < 9 or len(cleaned) > 15:
            raise ValueError("Invalid phone number length")
        return cleaned

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        """Validate currency code."""
        return v.upper()

    def to_api_payload(self) -> dict[str, Any]:
        """Convert to API payload format."""
        data = self.model_dump(by_alias=True, exclude_none=True)
        data["amount"] = float(self.amount)
        return data


class PaymentResponse(BaseModel):
    """Response from a payment operation.
    
    Attributes:
        transaction_id: Unique transaction ID
        status: Payment status
        reference: Order reference
        amount: Payment amount
        currency: Currency code
        phone_number: Customer phone number
        created_at: Transaction creation timestamp
        updated_at: Last update timestamp
        receipt_url: Optional receipt download URL
        failure_reason: Reason for failure if applicable
    """

    model_config = ConfigDict(populate_by_name=True)

    transaction_id: str = Field(alias="transactionId")
    status: PaymentStatus
    reference: str
    amount: Decimal
    currency: str
    phone_number: str = Field(alias="phoneNumber")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    receipt_url: Optional[str] = Field(alias="receiptUrl", default=None)
    failure_reason: Optional[str] = Field(alias="failureReason", default=None)

    @property
    def is_success(self) -> bool:
        """Check if payment was successful."""
        return self.status == PaymentStatus.SUCCESS

    @property
    def is_pending(self) -> bool:
        """Check if payment is pending."""
        return self.status == PaymentStatus.PENDING

    @property
    def is_failed(self) -> bool:
        """Check if payment failed."""
        return self.status == PaymentStatus.FAILED


class TransactionQuery(BaseModel):
    """Query parameters for transaction history.
    
    Attributes:
        transaction_id: Filter by transaction ID
        reference: Filter by reference
        start_date: Filter by start date
        end_date: Filter by end date
        status: Filter by status
        limit: Number of results to return
        offset: Offset for pagination
    """

    model_config = ConfigDict(populate_by_name=True)

    transaction_id: Optional[str] = Field(alias="transactionId", default=None)
    reference: Optional[str] = None
    start_date: Optional[datetime] = Field(alias="startDate", default=None)
    end_date: Optional[datetime] = Field(alias="endDate", default=None)
    status: Optional[PaymentStatus] = None
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)

    def to_api_params(self) -> dict[str, Any]:
        """Convert to API query parameters."""
        params: dict[str, Any] = {
            "limit": self.limit,
            "offset": self.offset,
        }
        if self.transaction_id:
            params["transactionId"] = self.transaction_id
        if self.reference:
            params["reference"] = self.reference
        if self.start_date:
            params["startDate"] = self.start_date.isoformat()
        if self.end_date:
            params["endDate"] = self.end_date.isoformat()
        if self.status:
            params["status"] = self.status.value
        return params


class TransactionHistory(BaseModel):
    """Transaction history response.
    
    Attributes:
        transactions: List of transactions
        total: Total count of transactions
        has_more: Whether there are more results
    """

    model_config = ConfigDict(populate_by_name=True)

    transactions: list[PaymentResponse]
    total: int
    has_more: bool = Field(alias="hasMore")


class ProviderConfig(BaseModel):
    """Configuration for a payment provider.
    
    Attributes:
        provider: The payment provider
        enabled: Whether this provider is enabled
        config: Provider-specific configuration
    """

    provider: PaymentProvider
    enabled: bool = True
    config: Optional[dict[str, Any]] = None

    @property
    def display_name(self) -> str:
        """Get display name for the provider."""
        names = {
            PaymentProvider.MPESA: "M-Pesa",
            PaymentProvider.MTN: "MTN Mobile Money",
            PaymentProvider.VODAFONE: "Vodafone Cash",
            PaymentProvider.AIRTEL: "Airtel Money",
            PaymentProvider.BANK: "Bank Transfer",
            PaymentProvider.CARD: "Card Payment",
        }
        return names.get(self.provider, self.provider.value)


class WebhookEvent(BaseModel):
    """Webhook event payload.
    
    Attributes:
        event_type: Type of event
        data: Event data
        timestamp: Event timestamp
        signature: Webhook signature for verification
    """

    model_config = ConfigDict(populate_by_name=True)

    event_type: str = Field(alias="eventType")
    data: PaymentResponse
    timestamp: datetime
    signature: str

    @property
    def event_id(self) -> str:
        """Generate event ID from data."""
        return f"{self.event_type}:{self.data.transaction_id}"


class RefundRequest(BaseModel):
    """Request to refund a transaction.
    
    Attributes:
        transaction_id: Transaction to refund
        amount: Optional partial refund amount
        reason: Refund reason
    """

    transaction_id: str = Field(alias="transactionId")
    amount: Optional[Decimal] = Field(default=None, gt=0)
    reason: Optional[str] = None

    def to_api_payload(self) -> dict[str, Any]:
        """Convert to API payload format."""
        data: dict[str, Any] = {"transactionId": self.transaction_id}
        if self.amount:
            data["amount"] = float(self.amount)
        if self.reason:
            data["reason"] = self.reason
        return data
