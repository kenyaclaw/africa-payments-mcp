"""Africa Payments MCP Python SDK.

Async client for Africa Payments MCP API - enabling mobile money payments across Africa.
"""

__version__ = "1.0.0"
__author__ = "Africa Payments"
__email__ = "dev@africapayments.com"

from .client import AfricaPaymentsClient
from .config import PaymentConfig
from .models import (
    PaymentRequest,
    PaymentResponse,
    TransactionQuery,
    TransactionHistory,
    PaymentStatus,
    PaymentProvider,
    PaymentRegion,
    PaymentEnvironment,
    ProviderConfig,
    WebhookEvent,
)
from .exceptions import (
    AfricaPaymentsError,
    AuthenticationError,
    PaymentError,
    ValidationError,
    NotFoundError,
    ServerError,
)

__all__ = [
    # Client
    "AfricaPaymentsClient",
    # Config
    "PaymentConfig",
    # Models
    "PaymentRequest",
    "PaymentResponse",
    "TransactionQuery",
    "TransactionHistory",
    "PaymentStatus",
    "PaymentProvider",
    "PaymentRegion",
    "PaymentEnvironment",
    "ProviderConfig",
    "WebhookEvent",
    # Exceptions
    "AfricaPaymentsError",
    "AuthenticationError",
    "PaymentError",
    "ValidationError",
    "NotFoundError",
    "ServerError",
]
