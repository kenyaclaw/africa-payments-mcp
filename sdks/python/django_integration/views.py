"""Django views for Africa Payments."""

import json
from typing import Any

from django.http import HttpResponse, JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from africa_payments_mcp import WebhookEvent

from .client import get_client
from .models import PaymentTransaction, WebhookLog


@method_decorator(csrf_exempt, name="dispatch")
class PaymentWebhookView(View):
    """View to handle payment webhooks."""

    async def post(self, request, *args: Any, **kwargs: Any) -> HttpResponse:
        """Handle incoming webhook."""
        try:
            payload = json.loads(request.body)
            signature = request.headers.get("X-Webhook-Signature", "")
            
            # Log webhook
            await self._log_webhook(payload, signature)
            
            # Process webhook
            client = get_client()
            await client.handle_webhook(payload)
            
            # Update transaction status
            await self._update_transaction(payload)
            
            return JsonResponse({"status": "ok"})
            
        except json.JSONDecodeError:
            return JsonResponse(
                {"error": "Invalid JSON"}, status=400
            )
        except Exception as e:
            return JsonResponse(
                {"error": str(e)}, status=500
            )

    async def _log_webhook(self, payload: dict, signature: str) -> None:
        """Log webhook event."""
        try:
            event = WebhookEvent.model_validate(payload)
            await WebhookLog.objects.acreate(
                event_id=event.event_id,
                event_type=event.event_type,
                payload=payload,
                signature=signature,
            )
        except Exception:
            pass  # Don't fail webhook processing

    async def _update_transaction(self, payload: dict) -> None:
        """Update transaction status from webhook."""
        try:
            event = WebhookEvent.model_validate(payload)
            transaction_id = event.data.transaction_id
            status = event.data.status.value
            
            await PaymentTransaction.objects.filter(
                transaction_id=transaction_id
            ).aupdate(
                status=status,
                receipt_url=event.data.receipt_url or "",
            )
        except Exception:
            pass


class PaymentStatusView(View):
    """View to check payment status."""

    async def get(self, request, transaction_id: str, *args: Any, **kwargs: Any) -> JsonResponse:
        """Get payment status."""
        try:
            # Try database first
            try:
                tx = await PaymentTransaction.objects.aget(
                    transaction_id=transaction_id
                )
                return JsonResponse({
                    "transaction_id": tx.transaction_id,
                    "status": tx.status,
                    "reference": tx.reference,
                    "amount": str(tx.amount),
                    "currency": tx.currency,
                    "created_at": tx.created_at.isoformat(),
                })
            except PaymentTransaction.DoesNotExist:
                pass
            
            # Fallback to API
            client = get_client()
            async with client:
                response = await client.get_transaction(transaction_id)
                return JsonResponse({
                    "transaction_id": response.transaction_id,
                    "status": response.status.value,
                    "reference": response.reference,
                    "amount": str(response.amount),
                    "currency": response.currency,
                    "created_at": response.created_at.isoformat(),
                })
                
        except Exception as e:
            return JsonResponse(
                {"error": str(e)}, status=404
            )
