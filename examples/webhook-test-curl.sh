#!/bin/bash
#
# Webhook Testing with curl
# Test your webhook endpoints locally
#

BASE_URL="http://localhost:3001"

echo "Africa Payments MCP - Webhook Test Script"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test health endpoint
echo "1. Testing Health Endpoint..."
curl -s "${BASE_URL}/health" | jq .
echo ""

# Test M-Pesa STK Success Webhook
echo "2. Testing M-Pesa STK Success Webhook..."
curl -s -X POST "${BASE_URL}/webhooks/mpesa" \
  -H "Content-Type: application/json" \
  -d '{
    "Body": {
      "stkCallback": {
        "MerchantRequestID": "29115-34620561-1",
        "CheckoutRequestID": "ws_CO_191220191020363925",
        "ResultCode": 0,
        "ResultDesc": "The service request is processed successfully.",
        "CallbackMetadata": {
          "Item": [
            {"Name": "Amount", "Value": 1000.00},
            {"Name": "MpesaReceiptNumber", "Value": "NLJ7RT61SV"},
            {"Name": "TransactionDate", "Value": 20191219102115},
            {"Name": "PhoneNumber", "Value": 254712345678}
          ]
        }
      }
    }
  }' | jq .
echo ""

# Test M-Pesa STK Failed Webhook
echo "3. Testing M-Pesa STK Failed Webhook..."
curl -s -X POST "${BASE_URL}/webhooks/mpesa" \
  -H "Content-Type: application/json" \
  -d '{
    "Body": {
      "stkCallback": {
        "MerchantRequestID": "29115-34620561-2",
        "CheckoutRequestID": "ws_CO_191220191020363926",
        "ResultCode": 1032,
        "ResultDesc": "Request cancelled by user"
      }
    }
  }' | jq .
echo ""

# Test M-Pesa C2B Webhook
echo "4. Testing M-Pesa C2B Webhook..."
curl -s -X POST "${BASE_URL}/webhooks/mpesa" \
  -H "Content-Type: application/json" \
  -d '{
    "TransactionType": "Pay Bill",
    "TransID": "NLJ7RT61SV",
    "TransTime": "20191219102115",
    "TransAmount": "1000.00",
    "BusinessShortCode": "174379",
    "BillRefNumber": "INV001",
    "MSISDN": "254712345678",
    "FirstName": "John",
    "MiddleName": "Doe",
    "LastName": ""
  }' | jq .
echo ""

# Test Paystack Charge Success (without signature)
echo "5. Testing Paystack Charge Success Webhook..."
curl -s -X POST "${BASE_URL}/webhooks/paystack" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "charge.success",
    "data": {
      "id": 3029612345,
      "domain": "test",
      "status": "success",
      "reference": "7PVGX8MEk85t1Ep0",
      "amount": 20000,
      "currency": "NGN",
      "channel": "card",
      "customer": {
        "id": 123456,
        "first_name": "John",
        "last_name": "Doe",
        "email": "john.doe@example.com",
        "phone": "+2348012345678"
      },
      "authorization": {
        "authorization_code": "AUTH_8dfhjjdt",
        "last4": "4081",
        "card_type": "visa"
      }
    }
  }' | jq .
echo ""

# Test Paystack Transfer Success
echo "6. Testing Paystack Transfer Success Webhook..."
curl -s -X POST "${BASE_URL}/webhooks/paystack" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "transfer.success",
    "data": {
      "id": 1001,
      "reference": "TRF_123456",
      "amount": 500000,
      "currency": "NGN",
      "status": "success",
      "reason": "Monthly salary payment",
      "recipient": {
        "name": "Jane Smith",
        "details": {
          "account_number": "0001234567",
          "bank_name": "Zenith Bank"
        }
      }
    }
  }' | jq .
echo ""

# Test MTN MoMo Request to Pay
echo "7. Testing MTN MoMo Request to Pay Webhook..."
curl -s -X POST "${BASE_URL}/webhooks/mtn-momo" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-api-key" \
  -d '{
    "amount": "1000",
    "currency": "EUR",
    "externalId": "EXT-123456",
    "payer": {
      "partyIdType": "MSISDN",
      "partyId": "256774290817"
    },
    "payerMessage": "Payment for invoice #123",
    "payeeNote": "Thank you for your payment",
    "status": "SUCCESSFUL",
    "financialTransactionId": "1687923847"
  }' | jq .
echo ""

# Test IntaSend Payment Success
echo "8. Testing IntaSend Payment Success Webhook..."
curl -s -X POST "${BASE_URL}/webhooks/intasend" \
  -H "Content-Type: application/json" \
  -d '{
    "invoice_id": "INV-2C8VXZ9P",
    "state": "COMPLETE",
    "provider": "M-PESA",
    "charges": 25,
    "net_amount": 975,
    "currency": "KES",
    "value": 1000,
    "account": "254712345678",
    "api_ref": "ORDER_123",
    "clearing_status": "Cleared"
  }' | jq .
echo ""

# Test IntaSend Payout
echo "9. Testing IntaSend Payout Webhook..."
curl -s -X POST "${BASE_URL}/webhooks/intasend" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "TRX-ABC123XYZ",
    "status": "Completed",
    "provider": "M-PESA",
    "amount": 5000,
    "currency": "KES",
    "account": "254712345678",
    "name": "John Doe",
    "narration": "Monthly salary"
  }' | jq .
echo ""

# View logs
echo "10. Fetching Webhook Logs..."
sleep 1
curl -s "${BASE_URL}/webhooks/logs" | jq .
echo ""

echo "=========================================="
echo "Test Complete!"
echo ""
echo "All webhooks return immediately with:"
echo '  { "received": true, "requestId": "..." }'
echo ""
echo "Check your event handlers for processed events."
