"""Exceptions for Africa Payments MCP SDK."""

from typing import Any, Optional


class AfricaPaymentsError(Exception):
    """Base exception for Africa Payments SDK."""

    def __init__(
        self,
        message: str,
        code: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}

    def __str__(self) -> str:
        if self.code:
            return f"[{self.code}] {self.message}"
        return self.message


class AuthenticationError(AfricaPaymentsError):
    """Raised when authentication fails."""

    def __init__(self, message: str = "Authentication failed", **kwargs: Any):
        super().__init__(message, code="AUTH_ERROR", **kwargs)


class PaymentError(AfricaPaymentsError):
    """Raised when a payment operation fails."""

    def __init__(self, message: str = "Payment failed", **kwargs: Any):
        super().__init__(message, code="PAYMENT_ERROR", **kwargs)


class ValidationError(AfricaPaymentsError):
    """Raised when request validation fails."""

    def __init__(self, message: str = "Validation failed", **kwargs: Any):
        super().__init__(message, code="VALIDATION_ERROR", **kwargs)


class NotFoundError(AfricaPaymentsError):
    """Raised when a resource is not found."""

    def __init__(self, message: str = "Resource not found", **kwargs: Any):
        super().__init__(message, code="NOT_FOUND", **kwargs)


class ServerError(AfricaPaymentsError):
    """Raised when server returns an error."""

    def __init__(self, message: str = "Server error", **kwargs: Any):
        super().__init__(message, code="SERVER_ERROR", **kwargs)


class RateLimitError(AfricaPaymentsError):
    """Raised when rate limit is exceeded."""

    def __init__(self, message: str = "Rate limit exceeded", **kwargs: Any):
        super().__init__(message, code="RATE_LIMIT", **kwargs)


class TimeoutError(AfricaPaymentsError):
    """Raised when request times out."""

    def __init__(self, message: str = "Request timeout", **kwargs: Any):
        super().__init__(message, code="TIMEOUT", **kwargs)


def raise_for_status(status_code: int, response_data: dict[str, Any]) -> None:
    """Raise appropriate exception based on status code.
    
    Args:
        status_code: HTTP status code
        response_data: Response JSON data
        
    Raises:
        AfricaPaymentsError: Appropriate exception for the status code
    """
    message = response_data.get("message", "Unknown error")
    code = response_data.get("code")
    details = response_data.get("details", {})

    if status_code == 400:
        raise ValidationError(message, code=code, details=details)
    elif status_code == 401:
        raise AuthenticationError(message, code=code, details=details)
    elif status_code == 404:
        raise NotFoundError(message, code=code, details=details)
    elif status_code == 409:
        raise PaymentError(message, code=code, details=details)
    elif status_code == 429:
        raise RateLimitError(message, code=code, details=details)
    elif status_code >= 500:
        raise ServerError(message, code=code, details=details)
    elif status_code >= 400:
        raise AfricaPaymentsError(message, code=code, details=details)
