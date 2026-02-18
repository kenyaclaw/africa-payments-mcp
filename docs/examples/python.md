# Python Usage

Use Africa Payments MCP with Python applications using the official MCP Python SDK.

## Installation

### Install MCP SDK

```bash
pip install mcp
```

### Install Africa Payments MCP

```bash
# The MCP server is installed via npm/npx, but we call it from Python
# Ensure Node.js is installed on your system
```

## Basic Usage

### Direct Connection

```python
import asyncio
import os
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    # Configure server parameters
    server_params = StdioServerParameters(
        command="npx",
        args=["-y", "@africa-payments/mcp-server"],
        env={
            "MPESA_CONSUMER_KEY": os.environ["MPESA_CONSUMER_KEY"],
            "MPESA_CONSUMER_SECRET": os.environ["MPESA_CONSUMER_SECRET"],
            "MPESA_PASSKEY": os.environ["MPESA_PASSKEY"],
            "MPESA_SHORTCODE": os.environ["MPESA_SHORTCODE"],
        }
    )
    
    # Connect to server
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # Initialize
            await session.initialize()
            
            # List available tools
            tools = await session.list_tools()
            print("Available tools:", [tool.name for tool in tools.tools])
            
            # Request M-Pesa payment
            result = await session.call_tool(
                "mpesa_stk_push",
                {
                    "phoneNumber": "254712345678",
                    "amount": 1000,
                    "accountReference": "ORDER-123",
                    "transactionDesc": "Payment for Order 123"
                }
            )
            
            print("Payment result:", result)

if __name__ == "__main__":
    asyncio.run(main())
```

### With Multiple Providers

```python
import os
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def with_multiple_providers():
    server_params = StdioServerParameters(
        command="npx",
        args=["-y", "@africa-payments/mcp-server"],
        env={
            # M-Pesa
            "MPESA_CONSUMER_KEY": os.environ["MPESA_CONSUMER_KEY"],
            "MPESA_CONSUMER_SECRET": os.environ["MPESA_CONSUMER_SECRET"],
            "MPESA_PASSKEY": os.environ["MPESA_PASSKEY"],
            "MPESA_SHORTCODE": os.environ["MPESA_SHORTCODE"],
            # Paystack
            "PAYSTACK_SECRET_KEY": os.environ["PAYSTACK_SECRET_KEY"],
            # IntaSend
            "INTASEND_PUBLIC_KEY": os.environ["INTASEND_PUBLIC_KEY"],
            "INTASEND_SECRET_KEY": os.environ["INTASEND_SECRET_KEY"],
        }
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # Use universal tool - provider auto-selected
            result = await session.call_tool(
                "unified_request_payment",
                {
                    "customer_phone": "+254712345678",
                    "amount": 1000,
                    "currency": "KES"
                }
            )
            
            return result
```

## FastAPI Integration

### Payment API

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import os
import asyncio

app = FastAPI(title="Africa Payments API")

# Global session
mcp_session = None

@app.on_event("startup")
async def startup():
    global mcp_session
    server_params = StdioServerParameters(
        command="npx",
        args=["-y", "@africa-payments/mcp-server"],
        env=os.environ.copy()
    )
    
    # Note: In production, manage the client lifecycle properly
    # This is simplified for demonstration

class PaymentRequest(BaseModel):
    phone: str
    amount: int
    reference: str
    description: str = None
    provider: str = "mpesa"

class PayoutRequest(BaseModel):
    phone: str
    amount: int
    reference: str
    description: str = None

@app.post("/payments/request")
async def request_payment(request: PaymentRequest):
    """Request payment from customer"""
    try:
        server_params = StdioServerParameters(
            command="npx",
            args=["-y", "@africa-payments/mcp-server"],
            env=os.environ.copy()
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                if request.provider == "mpesa":
                    result = await session.call_tool(
                        "mpesa_stk_push",
                        {
                            "phoneNumber": request.phone.replace("+", ""),
                            "amount": request.amount,
                            "accountReference": request.reference,
                            "transactionDesc": request.description or "Payment"
                        }
                    )
                elif request.provider == "paystack":
                    result = await session.call_tool(
                        "paystack_initialize",
                        {
                            "email": f"customer@{request.reference}.com",
                            "amount": request.amount * 100,  # kobo
                            "currency": "NGN",
                            "reference": request.reference
                        }
                    )
                else:
                    result = await session.call_tool(
                        "unified_request_payment",
                        {
                            "customer_phone": request.phone,
                            "amount": request.amount,
                            "reference": request.reference,
                            "description": request.description,
                            "provider": request.provider
                        }
                    )
                
                return {
                    "success": result.isError is False,
                    "data": result.content[0].text if result.content else None
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/payments/send")
async def send_payment(request: PayoutRequest):
    """Send money to customer"""
    try:
        server_params = StdioServerParameters(
            command="npx",
            args=["-y", "@africa-payments/mcp-server"],
            env=os.environ.copy()
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                result = await session.call_tool(
                    "unified_send_money",
                    {
                        "recipient_phone": request.phone,
                        "amount": request.amount,
                        "currency": "KES",
                        "reference": request.reference,
                        "description": request.description
                    }
                )
                
                return {
                    "success": result.isError is False,
                    "data": result.content[0].text if result.content else None
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/payments/{transaction_id}/status")
async def check_status(transaction_id: str):
    """Check payment status"""
    try:
        server_params = StdioServerParameters(
            command="npx",
            args=["-y", "@africa-payments/mcp-server"],
            env=os.environ.copy()
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                result = await session.call_tool(
                    "unified_check_status",
                    {"transaction_id": transaction_id}
                )
                
                return {
                    "success": result.isError is False,
                    "data": result.content[0].text if result.content else None
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/balance")
async def get_balance():
    """Get wallet balance"""
    try:
        server_params = StdioServerParameters(
            command="npx",
            args=["-y", "@africa-payments/mcp-server"],
            env=os.environ.copy()
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                result = await session.call_tool(
                    "unified_get_balance",
                    {}
                )
                
                return {
                    "success": result.isError is False,
                    "data": result.content[0].text if result.content else None
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Webhook Handler

```python
from fastapi import Request, Header

@app.post("/webhooks/mpesa")
async def mpesa_webhook(request: Request):
    """Handle M-Pesa webhook"""
    body = await request.json()
    
    # Process callback
    stk_callback = body.get("Body", {}).get("stkCallback", {})
    result_code = stk_callback.get("ResultCode")
    
    if result_code == 0:
        # Success
        metadata = stk_callback.get("CallbackMetadata", {}).get("Item", [])
        
        amount = next((i.get("Value") for i in metadata if i.get("Name") == "Amount"), None)
        receipt = next((i.get("Value") for i in metadata if i.get("Name") == "MpesaReceiptNumber"), None)
        phone = next((i.get("Value") for i in metadata if i.get("Name") == "PhoneNumber"), None)
        
        # Update your database
        await update_payment_status(receipt, {
            "status": "completed",
            "amount": amount,
            "phone": phone
        })
    
    # Always return 200
    return {"ResultCode": 0, "ResultDesc": "Success"}

@app.post("/webhooks/paystack")
async def paystack_webhook(
    request: Request,
    x_paystack_signature: str = Header(None)
):
    """Handle Paystack webhook"""
    body = await request.body()
    
    # Verify signature
    import hmac
    import hashlib
    
    secret = os.environ["PAYSTACK_WEBHOOK_SECRET"].encode()
    expected = hmac.new(secret, body, hashlib.sha512).hexdigest()
    
    if not hmac.compare_digest(expected, x_paystack_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    event = await request.json()
    
    # Process event
    if event["event"] == "charge.success":
        data = event["data"]
        await update_payment_status(data["reference"], {
            "status": "completed",
            "amount": data["amount"] / 100,
            "provider": "paystack"
        })
    
    return {"received": True}

async def update_payment_status(reference: str, data: dict):
    """Update payment status in database"""
    # Implement your database update logic
    print(f"Updating {reference}:", data)
```

## Django Integration

### Views

```python
# payments/views.py
import json
import os
from django.http import JsonResponse
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import asyncio

class PaymentView(View):
    async def post(self, request):
        data = json.loads(request.body)
        phone = data.get("phone")
        amount = data.get("amount")
        reference = data.get("reference")
        
        server_params = StdioServerParameters(
            command="npx",
            args=["-y", "@africa-payments/mcp-server"],
            env=os.environ.copy()
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                result = await session.call_tool(
                    "unified_request_payment",
                    {
                        "customer_phone": phone,
                        "amount": amount,
                        "currency": "KES",
                        "reference": reference
                    }
                )
                
                return JsonResponse({
                    "success": result.isError is False,
                    "data": result.content[0].text if result.content else None
                })

@method_decorator(csrf_exempt, name="dispatch")
class MpesaWebhookView(View):
    async def post(self, request):
        body = json.loads(request.body)
        
        # Process M-Pesa callback
        stk_callback = body.get("Body", {}).get("stkCallback", {})
        result_code = stk_callback.get("ResultCode")
        
        if result_code == 0:
            # Update order
            pass
        
        return JsonResponse({"ResultCode": 0, "ResultDesc": "Success"})
```

### URLs

```python
# payments/urls.py
from django.urls import path
from .views import PaymentView, MpesaWebhookView

urlpatterns = [
    path("request/", PaymentView.as_view(), name="request_payment"),
    path("webhooks/mpesa/", MpesaWebhookView.as_view(), name="mpesa_webhook"),
]
```

## Payment Service Class

```python
# services/payments.py
import os
from typing import Optional, Dict, Any
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

class PaymentService:
    def __init__(self):
        self.server_params = StdioServerParameters(
            command="npx",
            args=["-y", "@africa-payments/mcp-server"],
            env=os.environ.copy()
        )
    
    async def request_payment(
        self,
        phone: str,
        amount: int,
        reference: str,
        description: Optional[str] = None,
        provider: str = "mpesa",
        currency: str = "KES"
    ) -> Dict[str, Any]:
        """Request payment from customer"""
        async with stdio_client(self.server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                result = await session.call_tool(
                    "unified_request_payment",
                    {
                        "customer_phone": phone,
                        "amount": amount,
                        "currency": currency,
                        "reference": reference,
                        "description": description,
                        "provider": provider
                    }
                )
                
                return {
                    "success": result.isError is False,
                    "data": result.content[0].text if result.content else None,
                    "error": result.content[0].text if result.isError else None
                }
    
    async def send_money(
        self,
        phone: str,
        amount: int,
        reference: str,
        description: Optional[str] = None,
        provider: str = "mpesa",
        currency: str = "KES"
    ) -> Dict[str, Any]:
        """Send money to recipient"""
        async with stdio_client(self.server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                result = await session.call_tool(
                    "unified_send_money",
                    {
                        "recipient_phone": phone,
                        "amount": amount,
                        "currency": currency,
                        "reference": reference,
                        "description": description,
                        "provider": provider
                    }
                )
                
                return {
                    "success": result.isError is False,
                    "data": result.content[0].text if result.content else None
                }
    
    async def check_status(self, transaction_id: str) -> Dict[str, Any]:
        """Check transaction status"""
        async with stdio_client(self.server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                result = await session.call_tool(
                    "unified_check_status",
                    {"transaction_id": transaction_id}
                )
                
                return {
                    "success": result.isError is False,
                    "data": result.content[0].text if result.content else None
                }
    
    async def get_balance(self) -> Dict[str, Any]:
        """Get wallet balance"""
        async with stdio_client(self.server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                result = await session.call_tool(
                    "unified_get_balance",
                    {}
                )
                
                return {
                    "success": result.isError is False,
                    "data": result.content[0].text if result.content else None
                }

# Usage
service = PaymentService()

async def main():
    result = await service.request_payment(
        phone="+254712345678",
        amount=1000,
        reference="ORDER-123"
    )
    print(result)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
```

## Testing

```python
# tests/test_payments.py
import pytest
import os
from services.payments import PaymentService

@pytest.fixture
async def payment_service():
    return PaymentService()

@pytest.mark.asyncio
async def test_request_payment(payment_service):
    result = await payment_service.request_payment(
        phone="254708374149",  # Test number
        amount=10,
        reference="TEST-001"
    )
    
    assert result["success"] is True

@pytest.mark.asyncio
async def test_send_money(payment_service):
    result = await payment_service.send_money(
        phone="254708374149",
        amount=10,
        reference="PAYOUT-001"
    )
    
    assert result["success"] is True
```

## Environment Setup

```bash
# .env file
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_PASSKEY=your_passkey
MPESA_SHORTCODE=174379
PAYSTACK_SECRET_KEY=sk_test_your_key
```

```python
# Load environment variables
from dotenv import load_dotenv

load_dotenv()
```
