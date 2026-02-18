"""Django decorators for Africa Payments."""

from functools import wraps
from typing import Any, Callable, TypeVar

from django.http import HttpResponseForbidden

from .client import get_client

F = TypeVar("F", bound=Callable[..., Any])


def payment_required(view_func: F) -> F:
    """Decorator to require a successful payment.
    
    This decorator checks if a payment transaction exists and was successful
    before allowing access to the view.
    
    Args:
        view_func: View function to decorate
        
    Returns:
        Decorated view function
    """
    @wraps(view_func)
    async def _wrapped_view(request, *args: Any, **kwargs: Any) -> Any:
        transaction_id = request.GET.get("transaction_id") or request.POST.get("transaction_id")
        
        if not transaction_id:
            return HttpResponseForbidden("Transaction ID required")
        
        try:
            from .models import PaymentTransaction
            tx = await PaymentTransaction.objects.aget(
                transaction_id=transaction_id
            )
            if not tx.is_successful:
                return HttpResponseForbidden("Payment not successful")
            
            # Attach transaction to request
            request.payment_transaction = tx
            
        except PaymentTransaction.DoesNotExist:
            # Check with API
            client = get_client()
            async with client:
                try:
                    response = await client.get_transaction(transaction_id)
                    if not response.is_success:
                        return HttpResponseForbidden("Payment not successful")
                except Exception:
                    return HttpResponseForbidden("Invalid transaction")
        
        return await view_func(request, *args, **kwargs)
    
    return _wrapped_view  # type: ignore[return-value]
