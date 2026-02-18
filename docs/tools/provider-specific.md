# Provider-Specific Tools

Provider-specific tools give you direct access to each payment provider's native API features. Use these when you need advanced functionality or provider-specific optimizations.

## M-Pesa

### mpesa_stk_push

Send an STK Push (Lipa na M-Pesa Online) to a customer's phone.

```typescript
const result = await client.callTool('mpesa_stk_push', {
  phoneNumber: '254712345678',
  amount: 1000,
  accountReference: 'ORDER-123',
  transactionDesc: 'Payment for Order 123',
  callbackUrl: 'https://yourapp.com/webhooks/mpesa'
});
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `phoneNumber` | string | ✅ | Customer phone (format: 254XXXXXXXXX) |
| `amount` | number | ✅ | Amount in KES |
| `accountReference` | string | ✅ | Account reference (max 12 chars) |
| `transactionDesc` | string | ❌ | Description (max 13 chars) |
| `callbackUrl` | string | ❌ | Override default callback URL |

### mpesa_b2c

Business to Customer - Send money from business to customer.

```typescript
const result = await client.callTool('mpesa_b2c', {
  phoneNumber: '254712345678',
  amount: 1000,
  commandId: 'BusinessPayment', // or 'SalaryPayment', 'PromotionPayment'
  remarks: 'Payment for services',
  occasion: 'Monthly payout',
  timeoutUrl: 'https://yourapp.com/webhooks/mpesa/timeout'
});
```

### mpesa_transaction_status

Query the status of a transaction.

```typescript
const result = await client.callTool('mpesa_transaction_status', {
  transactionId: 'LGR7CO7Z27',
  commandId: 'TransactionStatusQuery',
  remarks: 'Check status'
});
```

### mpesa_account_balance

Check M-Pesa account balance.

```typescript
const result = await client.callTool('mpesa_account_balance', {
  commandId: 'AccountBalance',
  remarks: 'Balance inquiry'
});
```

### mpesa_c2b_register

Register C2B URLs for receiving payments.

```typescript
const result = await client.callTool('mpesa_c2b_register', {
  validationUrl: 'https://yourapp.com/webhooks/mpesa/validate',
  confirmationUrl: 'https://yourapp.com/webhooks/mpesa/confirm',
  responseType: 'Completed', // or 'Cancelled'
  shortCode: '174379'
});
```

### mpesa_c2b_simulate

Simulate a C2B transaction (sandbox only).

```typescript
const result = await client.callTool('mpesa_c2b_simulate', {
  phoneNumber: '254708374149',
  amount: 1000,
  billRefNumber: 'ORDER-123',
  commandId: 'CustomerPayBillOnline',
  shortCode: '174379'
});
```

## Paystack

### paystack_initialize

Initialize a transaction.

```typescript
const result = await client.callTool('paystack_initialize', {
  email: 'customer@example.com',
  amount: 500000, // Amount in kobo (5000 NGN)
  currency: 'NGN',
  reference: 'ORDER-123',
  callback_url: 'https://yourapp.com/payment/callback',
  metadata: {
    order_id: 'ORDER-123',
    customer_id: 'CUST-456',
    custom_fields: [
      { display_name: 'Order ID', variable_name: 'order_id', value: 'ORDER-123' }
    ]
  },
  // Split payment
  split_code: 'SPL_abc123',
  // Subaccount
  subaccount: 'ACCT_abc123',
  transaction_charge: 100 // in kobo
});
```

### paystack_verify

Verify a transaction.

```typescript
const result = await client.callTool('paystack_verify', {
  reference: 'ORDER-123'
});
```

### paystack_list_transactions

List all transactions.

```typescript
const result = await client.callTool('paystack_list_transactions', {
  perPage: 50,
  page: 1,
  customer: 'customer@example.com',
  status: 'success',
  from: '2024-01-01T00:00:00.000Z',
  to: '2024-01-31T23:59:59.000Z'
});
```

### paystack_create_recipient

Create a transfer recipient.

```typescript
// Bank Transfer
const result = await client.callTool('paystack_create_recipient', {
  type: 'nuban',
  name: 'John Doe',
  account_number: '0123456789',
  bank_code: '057', // Zenith Bank
  currency: 'NGN'
});

// Mobile Money
const result = await client.callTool('paystack_create_recipient', {
  type: 'mobile_money',
  name: 'John Doe',
  account_number: '0541234567',
  bank_code: 'MTN', // or 'VOD', 'TGO'
  currency: 'GHS'
});
```

### paystack_transfer

Initiate a transfer.

```typescript
const result = await client.callTool('paystack_transfer', {
  source: 'balance',
  amount: 500000,
  recipient: 'RCP_abc123',
  reason: 'Payment for Order 123',
  reference: 'TRF-001'
});
```

### paystack_bulk_transfer

Send money to multiple recipients.

```typescript
const result = await client.callTool('paystack_bulk_transfer', {
  currency: 'NGN',
  source: 'balance',
  transfers: [
    {
      amount: 50000,
      recipient: 'RCP_abc123',
      reference: 'TRF-001',
      reason: 'Payment 1'
    },
    {
      amount: 100000,
      recipient: 'RCP_def456',
      reference: 'TRF-002',
      reason: 'Payment 2'
    }
  ]
});
```

### paystack_fetch_banks

Get list of supported banks.

```typescript
const result = await client.callTool('paystack_fetch_banks', {
  country: 'nigeria', // or 'ghana', 'south africa', 'kenya'
  currency: 'NGN',
  pay_with_bank: true,
  perPage: 100
});
```

## MTN MoMo

### mtn_momo_request_payment

Request payment from a customer (Collection).

```typescript
const result = await client.callTool('mtn_momo_request_payment', {
  amount: '1000',
  currency: 'GHS',
  externalId: 'ORDER-123',
  payer: {
    partyIdType: 'MSISDN',
    partyId: '233123456789'
  },
  payerMessage: 'Payment for Order 123',
  payeeNote: 'Thank you for your purchase'
});
```

### mtn_momo_transfer

Send money to a customer (Disbursement).

```typescript
const result = await client.callTool('mtn_momo_transfer', {
  amount: '1000',
  currency: 'GHS',
  externalId: 'PAYOUT-001',
  payee: {
    partyIdType: 'MSISDN',
    partyId: '233123456789'
  },
  payerMessage: 'Payout for services',
  payeeNote: 'Thank you'
});
```

### mtn_momo_transaction_status

Check transaction status.

```typescript
const result = await client.callTool('mtn_momo_transaction_status', {
  referenceId: 'ref-123456',
  type: 'collection' // or 'disbursement'
});
```

### mtn_momo_balance

Get account balance.

```typescript
const result = await client.callTool('mtn_momo_balance', {
  type: 'collection' // or 'disbursement'
});
```

### mtn_momo_validate_account

Validate if phone number has MoMo account.

```typescript
const result = await client.callTool('mtn_momo_validate_account', {
  accountHolderIdType: 'msisdn',
  accountHolderId: '233123456789'
});
```

## IntaSend

### intasend_collect

Request payment via M-Pesa STK Push.

```typescript
const result = await client.callTool('intasend_collect', {
  currency: 'KES',
  amount: 1000,
  phone_number: '254712345678',
  api_ref: 'ORDER-123',
  email: 'customer@example.com',
  name: 'John Doe',
  method: 'M-PESA' // or 'CARD', 'BANK'
});
```

### intasend_check_collection

Check collection status.

```typescript
const result = await client.callTool('intasend_check_collection', {
  invoice_id: 'INV-123456',
  tracking_id: 'TRK-789' // Alternative
});
```

### intasend_payout

Send money (M-Pesa or Bank).

```typescript
// M-Pesa Payout
const result = await client.callTool('intasend_payout', {
  currency: 'KES',
  amount: 1000,
  account: '254712345678',
  name: 'John Doe',
  narration: 'Payment for services'
});

// Bank Payout
const result = await client.callTool('intasend_payout', {
  currency: 'KES',
  amount: 5000,
  account: '1234567890',
  bank_code: '01', // KCB Bank
  name: 'John Doe',
  narration: 'Salary payment'
});
```

### intasend_check_payout

Check payout status.

```typescript
const result = await client.callTool('intasend_check_payout', {
  transaction_id: 'TRX-123456'
});
```

### intasend_payment_link

Create a shareable payment link.

```typescript
const result = await client.callTool('intasend_payment_link', {
  currency: 'KES',
  amount: 2500,
  api_ref: 'ORDER-123',
  redirect_url: 'https://yourapp.com/payment/success',
  comment: 'Payment for Order 123',
  methods: ['M-PESA', 'CARD'],
  wallet_id: null
});
```

### intasend_balance

Get wallet balance.

```typescript
const result = await client.callTool('intasend_balance', {
  currency: 'KES' // Optional filter
});
```

### intasend_exchange_rates

Get current exchange rates.

```typescript
const result = await client.callTool('intasend_exchange_rates', {
  from: 'USD',
  to: 'KES'
});
```

## Airtel Money

### airtel_money_token

Get OAuth access token.

```typescript
const result = await client.callTool('airtel_money_token', {
  clientId: process.env.AIRTEL_MONEY_CLIENT_ID,
  clientSecret: process.env.AIRTEL_MONEY_CLIENT_SECRET
});
```

### airtel_money_collect

Request payment from customer.

```typescript
const result = await client.callTool('airtel_money_collect', {
  reference: 'ORDER-123',
  subscriber: {
    country: 'KE',
    currency: 'KES',
    msisdn: '254712345678'
  },
  transaction: {
    amount: 1000,
    country: 'KE',
    currency: 'KES',
    id: 'TXN-123456'
  }
});
```

### airtel_money_refund

Refund a transaction.

```typescript
const result = await client.callTool('airtel_money_refund', {
  reference: 'ORDER-123',
  transaction: {
    amount: 1000,
    id: 'TXN-123456'
  }
});
```

### airtel_money_send

Send money to customer.

```typescript
const result = await client.callTool('airtel_money_send', {
  reference: 'PAYOUT-001',
  subscriber: {
    country: 'KE',
    currency: 'KES',
    msisdn: '254712345678'
  },
  transaction: {
    amount: 1000,
    country: 'KE',
    currency: 'KES',
    id: 'TXN-789012'
  }
});
```

### airtel_money_status

Check transaction status.

```typescript
const result = await client.callTool('airtel_money_status', {
  reference: 'ORDER-123',
  id: 'TXN-123456'
});
```

### airtel_money_balance

Get wallet balance.

```typescript
const result = await client.callTool('airtel_money_balance', {
  currency: 'KES'
});
```

### airtel_money_user_enquiry

Verify customer details.

```typescript
const result = await client.callTool('airtel_money_user_enquiry', {
  msisdn: '254712345678'
});
```

## Webhook Verification Tools

Each provider has a webhook verification tool:

```typescript
// M-Pesa
await client.callTool('mpesa_verify_webhook', {
  signature: req.headers['x-mpesa-signature'],
  payload: req.body
});

// Paystack
await client.callTool('paystack_verify_webhook', {
  signature: req.headers['x-paystack-signature'],
  payload: req.body,
  secret: process.env.PAYSTACK_WEBHOOK_SECRET
});

// MTN MoMo - Uses callback URL verification
// IntaSend
await client.callTool('intasend_verify_webhook', {
  signature: req.headers['x-intasend-signature'],
  payload: req.body,
  secret: process.env.INTASEND_WEBHOOK_SECRET
});

// Airtel Money - Uses OAuth validation
```
