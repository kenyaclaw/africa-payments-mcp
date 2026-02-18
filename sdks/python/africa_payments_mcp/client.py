"""Async client for Africa Payments MCP API."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Callable, Optional

import httpx

from .config import PaymentConfig
from .exceptions import (
    AfricaPaymentsError,
    TimeoutError,
    raise_for_status,
)
from .models import (
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    RefundRequest,
    TransactionHistory,
    TransactionQuery,
    WebhookEvent,
)


class AfricaPaymentsClient:
    """Async client for Africa Payments MCP API.
    
    This client provides methods to interact with the Africa Payments API
    for processing mobile money payments across Africa.
    
    Example:
        ```python
        async with AfricaPaymentsClient(
            api_key="your-api-key",
            environment="sandbox",
            region="ke",
        ) as client:
            # Initialize payment
            response = await client.initiate_payment(
                PaymentRequest(
                    amount=1000.00,
                    currency="KES",
                    phone_number="254712345678",
                    reference="ORDER-123",
                )
            )
            print(f"Transaction ID: {response.transaction_id}")
        ```
    """

    def __init__(
        self,
        api_key: str,
        environment: str = "sandbox",
        region: str = "ke",
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
    ):
        """Initialize the client.
        
        Args:
            api_key: Your Africa Payments API key
            environment: API environment (sandbox or production)
            region: Target region (ke, ng, gh, za, tz, ug)
            base_url: Optional custom API base URL
            timeout: Request timeout in seconds
            max_retries: Maximum number of retries for failed requests
        """
        from .models import PaymentEnvironment, PaymentRegion

        self.config = PaymentConfig(
            api_key=api_key,
            environment=PaymentEnvironment(environment),
            region=PaymentRegion(region),
            base_url=base_url,
            timeout=timeout,
            max_retries=max_retries,
        )
        
        self._client: Optional[httpx.AsyncClient] = None
        self._event_handlers: list[Callable[[WebhookEvent], Any]] = []

    @classmethod
    def from_config(cls, config: PaymentConfig) -> AfricaPaymentsClient:
        """Create client from configuration object.
        
        Args:
            config: Payment configuration
            
        Returns:
            Configured client instance
        """
        instance = cls.__new__(cls)
        instance.config = config
        instance._client = None
        instance._event_handlers = []
        return instance

    async def __aenter__(self) -> AfricaPaymentsClient:
        """Async context manager entry."""
        await self._get_client()
        return self

    async def __aexit__(self, *args: Any) -> None:
        """Async context manager exit."""
        await self.close()

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.config.effective_base_url,
                headers=self.config.get_headers(),
                timeout=httpx.Timeout(self.config.timeout),
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _request(
        self,
        method: str,
        path: str,
        json_data: Optional[dict[str, Any]] = None,
        params: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Make an HTTP request with retries.
        
        Args:
            method: HTTP method
            path: API path
            json_data: Optional JSON body
            params: Optional query parameters
            
        Returns:
            Response JSON data
            
        Raises:
            AfricaPaymentsError: If request fails
        """
        client = await self._get_client()
        last_error: Optional[Exception] = None

        for attempt in range(self.config.max_retries + 1):
            try:
                response = await client.request(
                    method=method,
                    url=f"/v1{path}",
                    json=json_data,
                    params=params,
                )
                
                if response.status_code >= 400:
                    try:
                        error_data = response.json()
                    except Exception:
                        error_data = {"message": response.text}
                    raise_for_status(response.status_code, error_data)
                
                return response.json()
                
            except httpx.TimeoutException as e:
                last_error = TimeoutError(f"Request timed out after {self.config.timeout}s")
            except httpx.NetworkError as e:
                last_error = AfricaPaymentsError(f"Network error: {e}")
            except AfricaPaymentsError:
                raise
            except Exception as e:
                last_error = AfricaPaymentsError(f"Request failed: {e}")

            if attempt < self.config.max_retries:
                wait_time = 2 ** attempt  # Exponential backoff
                await asyncio.sleep(wait_time)

        raise last_error or AfricaPaymentsError("Request failed after retries")

    # Payment Operations

    async def initiate_payment(self, request: PaymentRequest) -> PaymentResponse:
        """Initiate a new payment.
        
        Args:
            request: Payment request details
            
        Returns:
            Payment response with transaction details
            
        Raises:
            ValidationError: If request is invalid
            PaymentError: If payment initiation fails
        """
        data = await self._request(
            "POST",
            "/payments",
            json_data=request.to_api_payload(),
        )
        return PaymentResponse.model_validate(data)

    async def get_transaction(self, transaction_id: str) -> PaymentResponse:
        """Get transaction details.
        
        Args:
            transaction_id: Transaction ID
            
        Returns:
            Transaction details
            
        Raises:
            NotFoundError: If transaction not found
        """
        data = await self._request("GET", f"/payments/{transaction_id}")
        return PaymentResponse.model_validate(data)

    async def get_transaction_history(
        self, query: Optional[TransactionQuery] = None
    ) -> TransactionHistory:
        """Get transaction history.
        
        Args:
            query: Optional query parameters
            
        Returns:
            Transaction history response
        """
        params = query.to_api_params() if query else {"limit": 20, "offset": 0}
        data = await self._request("GET", "/payments", params=params)
        return TransactionHistory.model_validate(data)

    async def refund(self, request: RefundRequest) -> PaymentResponse:
        """Refund a transaction.
        
        Args:
            request: Refund request details
            
        Returns:
            Refund transaction details
        """
        data = await self._request(
            "POST",
            "/refunds",
            json_data=request.to_api_payload(),
        )
        return PaymentResponse.model_validate(data)

    async def verify_payment(self, transaction_id: str) -> bool:
        """Verify if a payment was successful.
        
        Args:
            transaction_id: Transaction ID to verify
            
        Returns:
            True if payment was successful
        """
        try:
            transaction = await self.get_transaction(transaction_id)
            return transaction.is_success
        except Exception:
            return False

    # Polling

    async def poll_transaction_status(
        self,
        transaction_id: str,
        interval: float = 5.0,
        timeout: float = 300.0,
        callback: Optional[Callable[[PaymentResponse], Any]] = None,
    ) -> PaymentResponse:
        """Poll for transaction status until completion.
        
        Args:
            transaction_id: Transaction ID to poll
            interval: Polling interval in seconds
            timeout: Maximum polling time in seconds
            callback: Optional callback for status updates
            
        Returns:
            Final transaction status
            
        Raises:
            TimeoutError: If polling times out
        """
        start_time = asyncio.get_event_loop().time()
        
        while True:
            transaction = await self.get_transaction(transaction_id)
            
            if callback:
                callback(transaction)
            
            if transaction.status != PaymentStatus.PENDING:
                return transaction
            
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed >= timeout:
                raise TimeoutError(f"Polling timed out after {timeout}s")
            
            await asyncio.sleep(interval)

    # Webhook Handling

    def add_event_handler(self, handler: Callable[[WebhookEvent], Any]) -> None:
        """Add webhook event handler.
        
        Args:
            handler: Callback function for events
        """
        self._event_handlers.append(handler)

    def remove_event_handler(self, handler: Callable[[WebhookEvent], Any]) -> None:
        """Remove webhook event handler.
        
        Args:
            handler: Handler to remove
        """
        self._event_handlers.remove(handler)

    def verify_webhook_signature(
        self, payload: bytes, signature: str, secret: str
    ) -> bool:
        """Verify webhook signature.
        
        Args:
            payload: Raw request body
            signature: Signature from header
            secret: Webhook secret
            
        Returns:
            True if signature is valid
        """
        expected = hmac.new(
            secret.encode(),
            payload,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(signature, expected)

    async def handle_webhook(self, payload: dict[str, Any]) -> None:
        """Process incoming webhook.
        
        Args:
            payload: Webhook payload
        """
        event = WebhookEvent.model_validate(payload)
        for handler in self._event_handlers:
            try:
                result = handler(event)
                if asyncio.iscoroutine(result):
                    await result
            except Exception:
                # Log error but don't fail webhook processing
                pass

    # Utility Methods

    async def health_check(self) -> dict[str, Any]:
        """Check API health status.
        
        Returns:
            Health status response
        """
        return await self._request("GET", "/health")

    @asynccontextmanager
    async def batch(self) -> AsyncIterator[BatchOperations]:
        """Context manager for batch operations.
        
        Yields:
            BatchOperations instance for collecting operations
            
        Example:
            ```python
            async with client.batch() as batch:
                batch.add_payment(request1)
                batch.add_payment(request2)
                results = await batch.execute()
            ```
        """
        batch_ops = BatchOperations(self)
        try:
            yield batch_ops
        finally:
            pass


class BatchOperations:
    """Batch operations helper."""

    def __init__(self, client: AfricaPaymentsClient):
        self._client = client
        self._operations: list[tuple[str, Any]] = []

    def add_payment(self, request: PaymentRequest) -> None:
        """Add payment to batch."""
        self._operations.append(("payment", request))

    async def execute(self) -> list[Any]:
        """Execute all operations concurrently.
        
        Returns:
            List of operation results
        """
        tasks = []
        for op_type, data in self._operations:
            if op_type == "payment":
                tasks.append(self._client.initiate_payment(data))
        
        return await asyncio.gather(*tasks, return_exceptions=True)
