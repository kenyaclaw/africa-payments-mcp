# API Reference

Complete reference for all tools and functions available in Africa Payments MCP.

## Universal Tools

These tools work across all configured providers with automatic provider selection.

### unified_send_money

Send money to a recipient.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>unified_send_money</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `recipient_phone` | string | ✅ | Recipient phone with country code |
| `amount` | number | ✅ | Amount to send |
| `currency` | string | ✅ | Currency code (KES, NGN, GHS, etc.) |
| `provider` | string | ❌ | Force specific provider |
| `reference` | string | ❌ | Your unique reference |
| `description` | string | ❌ | Transaction description |
| `callback_url` | string | ❌ | Webhook URL |

**Response:**

```json
{
  "success": true,
  "data": {
    "transaction_id": "txn_123456",
    "provider": "mpesa",
    "provider_transaction_id": "LGR7CO7Z27",
    "status": "pending",
    "amount": 1000,
    "currency": "KES",
    "recipient": "+254712345678",
    "reference": "PAYOUT-001",
    "created_at": "2024-01-01T12:00:00Z"
  },
  "metadata": { ... }
}
```

**Errors:**

| Code | Description |
|------|-------------|
| `INSUFFICIENT_FUNDS` | Wallet balance too low |
| `INVALID_RECIPIENT` | Phone number invalid |
| `PROVIDER_ERROR` | Provider returned error |

---

### unified_request_payment

Request payment from a customer.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>unified_request_payment</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `customer_phone` | string | ✅ | Customer phone with country code |
| `amount` | number | ✅ | Amount to request |
| `currency` | string | ✅ | Currency code |
| `provider` | string | ❌ | Force specific provider |
| `reference` | string | ❌ | Your unique reference |
| `description` | string | ❌ | Payment description |
| `email` | string | ❌ | Customer email |
| `callback_url` | string | ❌ | Webhook URL |
| `expires_in` | number | ❌ | Expiration in seconds |

**Response:**

```json
{
  "success": true,
  "data": {
    "transaction_id": "txn_789012",
    "provider": "mpesa",
    "provider_checkout_id": "ws_CO_1234567890",
    "status": "pending",
    "amount": 1000,
    "currency": "KES",
    "customer": "+254712345678",
    "reference": "ORDER-123",
    "payment_url": "https://checkout...",
    "expires_at": "2024-01-01T13:00:00Z"
  }
}
```

---

### unified_check_status

Check transaction status.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>unified_check_status</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `transaction_id` | string | ⚠️ | Internal transaction ID |
| `provider_transaction_id` | string | ⚠️ | Provider's transaction ID |
| `reference` | string | ⚠️ | Your reference |
| `provider` | string | ❌ | Provider to query |

::: tip Note
At least one identifier is required.
:::

**Response:**

```json
{
  "success": true,
  "data": {
    "transaction_id": "txn_123456",
    "provider": "mpesa",
    "provider_transaction_id": "LGR7CO7Z27",
    "status": "completed",
    "amount": 1000,
    "currency": "KES",
    "recipient": "+254712345678",
    "reference": "PAYOUT-001",
    "completed_at": "2024-01-01T12:01:30Z",
    "failure_reason": null
  }
}
```

**Status Values:**

| Status | Description |
|--------|-------------|
| `pending` | Awaiting confirmation |
| `completed` | Successfully processed |
| `failed` | Failed or cancelled |

---

### unified_get_balance

Get wallet/account balance.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>unified_get_balance</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `provider` | string | ❌ | Filter by provider |
| `currency` | string | ❌ | Filter by currency |

**Response:**

```json
{
  "success": true,
  "data": {
    "balances": [
      {
        "provider": "mpesa",
        "currency": "KES",
        "available": 50000,
        "pending": 2000,
        "total": 52000
      }
    ]
  }
}
```

---

### unified_list_transactions

List transactions with filtering.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>unified_list_transactions</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `provider` | string | ❌ | Filter by provider |
| `status` | string | ❌ | Filter by status |
| `type` | string | ❌ | Filter by type |
| `currency` | string | ❌ | Filter by currency |
| `from` | string | ❌ | Start date (ISO 8601) |
| `to` | string | ❌ | End date (ISO 8601) |
| `limit` | number | ❌ | Max results (default: 50) |
| `offset` | number | ❌ | Pagination offset |

**Response:**

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "transaction_id": "txn_123",
        "provider": "mpesa",
        "status": "completed",
        "type": "send",
        "amount": 1000,
        "currency": "KES",
        "reference": "PAYOUT-001",
        "created_at": "2024-01-01T12:00:00Z"
      }
    ],
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

---

### unified_refund

Refund a completed transaction.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>unified_refund</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `transaction_id` | string | ⚠️ | Transaction ID |
| `reference` | string | ⚠️ | Transaction reference |
| `amount` | number | ❌ | Partial refund amount |
| `reason` | string | ❌ | Refund reason |

---

## M-Pesa Tools

### mpesa_stk_push

Send STK Push (Lipa na M-Pesa Online).

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>mpesa_stk_push</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `phoneNumber` | string | ✅ | Customer phone (254XXXXXXXXX) |
| `amount` | number | ✅ | Amount in KES |
| `accountReference` | string | ✅ | Account ref (max 12 chars) |
| `transactionDesc` | string | ❌ | Description (max 13 chars) |
| `callbackUrl` | string | ❌ | Override callback URL |

**Response:**

```json
{
  "success": true,
  "data": {
    "MerchantRequestID": "12345-67890-1",
    "CheckoutRequestID": "ws_CO_1234567890",
    "ResponseCode": "0",
    "ResponseDescription": "Success"
  }
}
```

---

### mpesa_b2c

Business to Customer payment.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>mpesa_b2c</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `phoneNumber` | string | ✅ | Recipient phone |
| `amount` | number | ✅ | Amount in KES |
| `commandId` | string | ❌ | BusinessPayment/SalaryPayment/PromotionPayment |
| `remarks` | string | ❌ | Transaction remarks |
| `occasion` | string | ❌ | Occasion description |

---

### mpesa_transaction_status

Query transaction status.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>mpesa_transaction_status</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `transactionId` | string | ✅ | M-Pesa receipt number |
| `commandId` | string | ❌ | Command ID |
| `remarks` | string | ❌ | Remarks |

---

### mpesa_account_balance

Check account balance.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>mpesa_account_balance</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `commandId` | string | ❌ | Command ID |
| `remarks` | string | ❌ | Remarks |

---

## Paystack Tools

### paystack_initialize

Initialize a transaction.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>paystack_initialize</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `email` | string | ✅ | Customer email |
| `amount` | number | ✅ | Amount in kobo/cents |
| `currency` | string | ❌ | Currency code (default: NGN) |
| `reference` | string | ❌ | Unique reference |
| `callback_url` | string | ❌ | Callback URL |
| `metadata` | object | ❌ | Additional metadata |
| `split_code` | string | ❌ | Split payment code |
| `subaccount` | string | ❌ | Subaccount code |
| `transaction_charge` | number | ❌ | Transaction charge |

**Response:**

```json
{
  "success": true,
  "data": {
    "authorization_url": "https://checkout.paystack.com/abc123",
    "access_code": "access_code",
    "reference": "ORDER-123"
  }
}
```

---

### paystack_verify

Verify a transaction.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>paystack_verify</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `reference` | string | ✅ | Transaction reference |

---

### paystack_transfer

Initiate a transfer.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>paystack_transfer</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | string | ✅ | Source (balance) |
| `amount` | number | ✅ | Amount in kobo |
| `recipient` | string | ✅ | Recipient code |
| `reason` | string | ❌ | Transfer reason |
| `reference` | string | ❌ | Unique reference |

---

### paystack_create_recipient

Create a transfer recipient.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>paystack_create_recipient</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `type` | string | ✅ | nuban/mobile_money |
| `name` | string | ✅ | Recipient name |
| `account_number` | string | ✅ | Account/phone number |
| `bank_code` | string | ✅ | Bank/Mobile code |
| `currency` | string | ✅ | Currency code |

---

## MTN MoMo Tools

### mtn_momo_request_payment

Request payment (Collection).

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>mtn_momo_request_payment</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `amount` | string | ✅ | Amount |
| `currency` | string | ✅ | Currency |
| `externalId` | string | ✅ | External ID |
| `payer` | object | ✅ | { partyIdType, partyId } |
| `payerMessage` | string | ❌ | Message to payer |
| `payeeNote` | string | ❌ | Note to payee |

---

### mtn_momo_transfer

Send money (Disbursement).

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>mtn_momo_transfer</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `amount` | string | ✅ | Amount |
| `currency` | string | ✅ | Currency |
| `externalId` | string | ✅ | External ID |
| `payee` | object | ✅ | { partyIdType, partyId } |
| `payerMessage` | string | ❌ | Message |
| `payeeNote` | string | ❌ | Note |

---

## IntaSend Tools

### intasend_collect

Request payment.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>intasend_collect</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `currency` | string | ✅ | Currency (KES) |
| `amount` | number | ✅ | Amount |
| `phone_number` | string | ✅ | Phone number |
| `api_ref` | string | ❌ | Your reference |
| `email` | string | ❌ | Customer email |
| `name` | string | ❌ | Customer name |
| `method` | string | ❌ | M-PESA/CARD/BANK |

---

### intasend_payout

Send money.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>intasend_payout</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `currency` | string | ✅ | Currency |
| `amount` | number | ✅ | Amount |
| `account` | string | ✅ | Phone/account number |
| `name` | string | ✅ | Recipient name |
| `narration` | string | ✅ | Narration |
| `bank_code` | string | ❌ | Bank code (for bank) |

---

## Airtel Money Tools

### airtel_money_collect

Request payment.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>airtel_money_collect</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `reference` | string | ✅ | Your reference |
| `subscriber` | object | ✅ | { country, currency, msisdn } |
| `transaction` | object | ✅ | { amount, country, currency, id } |

---

### airtel_money_send

Send money.

<div class="api-endpoint">
  <span class="api-method post">TOOL</span>
  <span>airtel_money_send</span>
</div>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `reference` | string | ✅ | Your reference |
| `subscriber` | object | ✅ | { country, currency, msisdn } |
| `transaction` | object | ✅ | { amount, country, currency, id } |

---

## Common Response Format

All tools return a standardized response:

```typescript
{
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: {
    provider: string;
    timestamp: string;
    requestId: string;
  };
}
```

## Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `AUTH_FAILED` | Authentication failed | No |
| `INSUFFICIENT_FUNDS` | Not enough balance | No |
| `INVALID_RECIPIENT` | Invalid recipient info | No |
| `INVALID_AMOUNT` | Amount out of range | No |
| `PROVIDER_ERROR` | Provider API error | Yes |
| `TIMEOUT` | Request timed out | Yes |
| `RATE_LIMITED` | Too many requests | Yes |
| `VALIDATION_ERROR` | Input validation failed | No |
