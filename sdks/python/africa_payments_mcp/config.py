"""Configuration for Africa Payments MCP SDK."""

from dataclasses import dataclass
from typing import Optional

from .models import PaymentEnvironment, PaymentRegion


@dataclass
class PaymentConfig:
    """Configuration for the Africa Payments SDK.
    
    Attributes:
        api_key: Your Africa Payments API key
        environment: API environment (sandbox or production)
        region: Target region for payments
        base_url: Optional custom API base URL
        timeout: Request timeout in seconds
        max_retries: Maximum number of retries for failed requests
    """

    api_key: str
    environment: PaymentEnvironment = PaymentEnvironment.SANDBOX
    region: PaymentRegion = PaymentRegion.KE
    base_url: Optional[str] = None
    timeout: float = 30.0
    max_retries: int = 3

    def __post_init__(self) -> None:
        """Validate configuration."""
        if not self.api_key:
            raise ValueError("API key is required")
        if self.timeout <= 0:
            raise ValueError("Timeout must be positive")
        if self.max_retries < 0:
            raise ValueError("Max retries must be non-negative")

    @property
    def effective_base_url(self) -> str:
        """Get the effective base URL."""
        if self.base_url:
            return self.base_url
        
        if self.environment == PaymentEnvironment.PRODUCTION:
            return "https://api.africapayments.com"
        return "https://api.sandbox.africapayments.com"

    def get_headers(self) -> dict[str, str]:
        """Get default HTTP headers."""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Region": self.region.value,
        }
