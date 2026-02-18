"""Django client for Africa Payments MCP."""

from typing import Optional

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from africa_payments_mcp import AfricaPaymentsClient, PaymentConfig


def get_client() -> AfricaPaymentsClient:
    """Get configured Africa Payments client.
    
    Returns:
        Configured client instance
        
    Raises:
        ImproperlyConfigured: If settings are missing
    """
    api_key = getattr(settings, "AFRICA_PAYMENTS_API_KEY", None)
    if not api_key:
        raise ImproperlyConfigured(
            "AFRICA_PAYMENTS_API_KEY must be set in settings"
        )
    
    environment = getattr(settings, "AFRICA_PAYMENTS_ENVIRONMENT", "sandbox")
    region = getattr(settings, "AFRICA_PAYMENTS_REGION", "ke")
    base_url = getattr(settings, "AFRICA_PAYMENTS_BASE_URL", None)
    timeout = getattr(settings, "AFRICA_PAYMENTS_TIMEOUT", 30.0)
    max_retries = getattr(settings, "AFRICA_PAYMENTS_MAX_RETRIES", 3)

    config = PaymentConfig(
        api_key=api_key,
        environment=environment,
        region=region,
        base_url=base_url,
        timeout=timeout,
        max_retries=max_retries,
    )

    return AfricaPaymentsClient.from_config(config)


class PaymentClientMiddleware:
    """Middleware to attach payment client to request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.payment_client = get_client()
        response = self.get_response(request)
        return response
