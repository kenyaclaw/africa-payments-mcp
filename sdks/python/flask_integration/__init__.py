"""Flask integration for Africa Payments MCP SDK."""

from .client import AfricaPayments, init_app
from .decorators import payment_required
from .views import webhook_blueprint

__all__ = [
    "AfricaPayments",
    "init_app",
    "payment_required",
    "webhook_blueprint",
]
