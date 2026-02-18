"""Flask views/blueprints for Africa Payments."""

from flask import Blueprint, current_app, jsonify, request

from africa_payments_mcp import WebhookEvent
from africa_payments_mcp.flask_integration.client import AfricaPayments

webhook_blueprint = Blueprint("africa_payments", __name__, url_prefix="/payments")


@webhook_blueprint.route("/webhook", methods=["POST"])
async def webhook() -> tuple:
    """Handle payment webhooks.
    
    Receives and processes webhook events from Africa Payments.
    
    Returns:
        JSON response with status
    """
    try:
        payload = request.get_json()
        if not payload:
            return jsonify({"error": "Invalid JSON"}), 400
        
        signature = request.headers.get("X-Webhook-Signature", "")
        
        # Validate signature if secret is configured
        webhook_secret = current_app.config.get("AFRICA_PAYMENTS_WEBHOOK_SECRET")
        if webhook_secret:
            payments: AfricaPayments = current_app.extensions["africa_payments"]
            client = payments.client
            
            is_valid = client.verify_webhook_signature(
                request.data,
                signature,
                webhook_secret,
            )
            if not is_valid:
                return jsonify({"error": "Invalid signature"}), 401
        
        # Process webhook
        event = WebhookEvent.model_validate(payload)
        
        # Store event (application should handle this)
        current_app.logger.info(f"Received webhook: {event.event_type}")
        
        # Call registered handlers
        await _handle_webhook_event(event)
        
        return jsonify({"status": "ok"}), 200
        
    except Exception as e:
        current_app.logger.error(f"Webhook error: {e}")
        return jsonify({"error": str(e)}), 500


@webhook_blueprint.route("/status/<transaction_id>", methods=["GET"])
async def payment_status(transaction_id: str) -> tuple:
    """Get payment status.
    
    Args:
        transaction_id: Transaction ID to check
        
    Returns:
        JSON response with transaction details
    """
    try:
        payments: AfricaPayments = current_app.extensions["africa_payments"]
        client = payments.client
        
        async with client:
            response = await client.get_transaction(transaction_id)
            return jsonify({
                "transaction_id": response.transaction_id,
                "status": response.status.value,
                "reference": response.reference,
                "amount": str(response.amount),
                "currency": response.currency,
                "created_at": response.created_at.isoformat(),
                "receipt_url": response.receipt_url,
            }), 200
            
    except Exception as e:
        return jsonify({"error": str(e)}), 404


async def _handle_webhook_event(event: WebhookEvent) -> None:
    """Handle webhook event with registered callbacks.
    
    Args:
        event: Webhook event
    """
    # Get registered handlers from app config
    handlers = current_app.config.get("AFRICA_PAYMENTS_WEBHOOK_HANDLERS", [])
    
    for handler in handlers:
        try:
            result = handler(event)
            if hasattr(result, "__await__"):
                await result
        except Exception as e:
            current_app.logger.error(f"Webhook handler error: {e}")
