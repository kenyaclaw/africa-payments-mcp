"""Flask extension for Africa Payments MCP."""

from typing import Optional

from flask import Flask, current_app, g

from africa_payments_mcp import AfricaPaymentsClient, PaymentConfig


class AfricaPayments:
    """Flask extension for Africa Payments MCP.
    
    Example:
        ```python
        from flask import Flask
        from africa_payments_mcp.flask_integration import AfricaPayments
        
        app = Flask(__name__)
        app.config["AFRICA_PAYMENTS_API_KEY"] = "your-api-key"
        app.config["AFRICA_PAYMENTS_ENVIRONMENT"] = "sandbox"
        
        payments = AfricaPayments(app)
        
        @app.route("/pay", methods=["POST"])
        async def pay():
            client = payments.client
            # Use client...
        ```
    """

    def __init__(self, app: Optional[Flask] = None):
        self.app = app
        if app is not None:
            self.init_app(app)

    def init_app(self, app: Flask) -> None:
        """Initialize the extension with a Flask app.
        
        Args:
            app: Flask application instance
        """
        app.extensions = getattr(app, "extensions", {})
        app.extensions["africa_payments"] = self
        
        # Register teardown
        app.teardown_appcontext(self._teardown)

    def _teardown(self, exception: Optional[BaseException]) -> None:
        """Clean up resources."""
        client = getattr(g, "_africa_payments_client", None)
        if client is not None:
            # Note: can't use await in teardown, client should be
            # closed manually or use context managers
            pass

    @property
    def client(self) -> AfricaPaymentsClient:
        """Get or create client for current request context.
        
        Returns:
            Configured client instance
        """
        if "_africa_payments_client" not in g:
            g._africa_payments_client = self._create_client()
        return g._africa_payments_client

    def _create_client(self) -> AfricaPaymentsClient:
        """Create client from Flask config."""
        api_key = current_app.config.get("AFRICA_PAYMENTS_API_KEY")
        if not api_key:
            raise RuntimeError("AFRICA_PAYMENTS_API_KEY not configured")
        
        environment = current_app.config.get(
            "AFRICA_PAYMENTS_ENVIRONMENT", "sandbox"
        )
        region = current_app.config.get("AFRICA_PAYMENTS_REGION", "ke")
        base_url = current_app.config.get("AFRICA_PAYMENTS_BASE_URL")
        timeout = current_app.config.get("AFRICA_PAYMENTS_TIMEOUT", 30.0)
        max_retries = current_app.config.get("AFRICA_PAYMENTS_MAX_RETRIES", 3)

        config = PaymentConfig(
            api_key=api_key,
            environment=environment,
            region=region,
            base_url=base_url,
            timeout=timeout,
            max_retries=max_retries,
        )

        return AfricaPaymentsClient.from_config(config)


def init_app(app: Flask) -> AfricaPayments:
    """Initialize Africa Payments extension.
    
    Args:
        app: Flask application
        
    Returns:
        Configured extension instance
    """
    return AfricaPayments(app)
