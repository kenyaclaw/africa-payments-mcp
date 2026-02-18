"""Flask decorators for Africa Payments."""

from functools import wraps
from typing import Any, Callable, TypeVar

from flask import abort, current_app, request

from africa_payments_mcp.flask_integration.client import AfricaPayments

F = TypeVar("F", bound=Callable[..., Any])


def payment_required(view_func: F) -> F:
    """Decorator to require a successful payment.
    
    Checks for a successful payment transaction before allowing
    access to the view. Transaction ID should be provided as a
    query parameter or in the request body.
    
    Args:
        view_func: View function to decorate
        
    Returns:
        Decorated view function
    """
    @wraps(view_func)
    async def _wrapped_view(*args: Any, **kwargs: Any) -> Any:
        # Get transaction ID from request
        transaction_id = (
            request.args.get("transaction_id") or
            request.form.get("transaction_id") or
            (request.get_json(silent=True) or {}).get("transaction_id")
        )
        
        if not transaction_id:
            abort(403, "Transaction ID required")
        
        # Get client
        payments: AfricaPayments = current_app.extensions["africa_payments"]
        client = payments.client
        
        try:
            async with client:
                tx = await client.get_transaction(transaction_id)
                if not tx.is_success:
                    abort(403, "Payment not successful")
                
                # Store in g for access in view
                from flask import g
                g.payment_transaction = tx
                
        except Exception:
            abort(403, "Invalid transaction")
        
        return await view_func(*args, **kwargs)
    
    return _wrapped_view  # type: ignore[return-value]
