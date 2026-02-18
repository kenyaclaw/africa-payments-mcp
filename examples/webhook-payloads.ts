/**
 * Example Webhook Payloads for Testing
 * Use these to test your webhook handlers
 */

// ==================== M-Pesa Payloads ====================

/**
 * M-Pesa STK Push Success Callback
 * Sent when customer completes STK Push payment
 */
export const mpesaStkSuccessPayload = {
  Body: {
    stkCallback: {
      MerchantRequestID: "29115-34620561-1",
      CheckoutRequestID: "ws_CO_191220191020363925",
      ResultCode: 0,
      ResultDesc: "The service request is processed successfully.",
      CallbackMetadata: {
        Item: [
          { Name: "Amount", Value: 1000.00 },
          { Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" },
          { Name: "TransactionDate", Value: 20191219102115 },
          { Name: "PhoneNumber", Value: 254712345678 }
        ]
      }
    }
  }
};

/**
 * M-Pesa STK Push Failed Callback
 * Sent when customer cancels or payment fails
 */
export const mpesaStkFailedPayload = {
  Body: {
    stkCallback: {
      MerchantRequestID: "29115-34620561-2",
      CheckoutRequestID: "ws_CO_191220191020363926",
      ResultCode: 1032,
      ResultDesc: "Request cancelled by user"
    }
  }
};

/**
 * M-Pesa C2B (Customer to Business) Callback
 * Sent when customer pays via Paybill or Buy Goods
 */
export const mpesaC2BPayload = {
  TransactionType: "Pay Bill",
  TransID: "NLJ7RT61SV",
  TransTime: "20191219102115",
  TransAmount: "1000.00",
  BusinessShortCode: "174379",
  BillRefNumber: "INV001",
  InvoiceNumber: "",
  OrgAccountBalance: "",
  ThirdPartyTransID: "",
  MSISDN: "254712345678",
  FirstName: "John",
  MiddleName: "Doe",
  LastName: ""
};

/**
 * M-Pesa B2C (Business to Customer) Success Callback
 * Sent when B2C transfer is successful
 */
export const mpesaB2CSuccessPayload = {
  Result: {
    ResultType: 0,
    ResultCode: 0,
    ResultDesc: "The service request is processed successfully.",
    OriginatorConversationID: "29115-34620561-1",
    ConversationID: "AG_20191219_00004e48a98f6391d54a",
    TransactionID: "NLJ7000000",
    ResultParameters: {
      ResultParameter: [
        { Key: "TransactionAmount", Value: "1000" },
        { Key: "TransactionReceipt", Value: "NLJ7RT61SV" },
        { Key: "B2CRecipientIsRegisteredCustomer", Value: "Y" },
        { Key: "B2CChargesAccountAvailableFunds", Value: "-45109.00" },
        { Key: "ReceiverPartyPublicName", Value: "254708374149 - John Doe" },
        { Key: "TransactionCompletedDateTime", Value: "19.12.2019 10:21:15" },
        { Key: "B2CUtilityAccountAvailableFunds", Value: "10116.00" },
        { Key: "B2CWorkingAccountAvailableFunds", Value: "100000.00" }
      ]
    },
    ReferenceData: {
      ReferenceItem: {
        Key: "QueueTimeoutURL",
        Value: "https://example.com/timeout"
      }
    }
  }
};

// ==================== Paystack Payloads ====================

/**
 * Paystack Charge Success Webhook
 * Sent when a payment is successful
 */
export const paystackChargeSuccessPayload = {
  event: "charge.success",
  data: {
    id: 3029612345,
    domain: "test",
    status: "success",
    reference: "7PVGX8MEk85t1Ep0",
    amount: 20000, // in kobo (200 NGN)
    message: null,
    gateway_response: "Successful",
    paid_at: "2023-10-01T12:00:00.000Z",
    created_at: "2023-10-01T11:59:50.000Z",
    channel: "card",
    currency: "NGN",
    ip_address: "41.242.60.36",
    metadata: {
      order_id: "ORDER_123",
      customer_id: "CUST_456"
    },
    fees: 100, // 1 NGN fee
    authorization: {
      authorization_code: "AUTH_8dfhjjdt",
      bin: "408408",
      last4: "4081",
      exp_month: "12",
      exp_year: "2030",
      channel: "card",
      card_type: "visa",
      bank: "Test Bank",
      country_code: "NG",
      brand: "visa",
      reusable: true,
      signature: "SIG_xxxx"
    },
    customer: {
      id: 123456,
      first_name: "John",
      last_name: "Doe",
      email: "john.doe@example.com",
      customer_code: "CUS_xxxxx",
      phone: "+2348012345678",
      metadata: null,
      risk_action: "default"
    },
    plan: {},
    requested_amount: 20000
  }
};

/**
 * Paystack Charge Failed Webhook
 * Sent when a payment fails
 */
export const paystackChargeFailedPayload = {
  event: "charge.failed",
  data: {
    id: 3029612346,
    domain: "test",
    status: "failed",
    reference: "7PVGX8MEk85t1Ep1",
    amount: 20000,
    message: "Insufficient funds",
    gateway_response: "Insufficient funds",
    paid_at: null,
    created_at: "2023-10-01T11:59:50.000Z",
    channel: "card",
    currency: "NGN",
    ip_address: "41.242.60.36",
    metadata: {},
    fees: 0,
    authorization: {
      authorization_code: "AUTH_8dfhjjdt",
      bin: "408408",
      last4: "4081",
      exp_month: "12",
      exp_year: "2030",
      channel: "card",
      card_type: "visa",
      bank: "Test Bank",
      country_code: "NG",
      brand: "visa",
      reusable: true
    },
    customer: {
      id: 123456,
      first_name: "John",
      last_name: "Doe",
      email: "john.doe@example.com",
      customer_code: "CUS_xxxxx",
      phone: "+2348012345678"
    }
  }
};

/**
 * Paystack Transfer Success Webhook
 * Sent when a transfer is completed
 */
export const paystackTransferSuccessPayload = {
  event: "transfer.success",
  data: {
    id: 1001,
    domain: "test",
    status: "success",
    reference: "TRF_123456",
    amount: 500000, // 5000 NGN
    currency: "NGN",
    source: "balance",
    source_details: null,
    reason: "Monthly salary payment",
    recipient: {
      id: 101,
      domain: "test",
      type: "nuban",
      currency: "NGN",
      name: "Jane Smith",
      details: {
        account_number: "0001234567",
        account_name: "Jane Smith",
        bank_code: "057",
        bank_name: "Zenith Bank"
      },
      description: "Jane Smith",
      metadata: null,
      recipient_code: "RCP_xxxxx"
    },
    created_at: "2023-10-01T10:00:00.000Z",
    updated_at: "2023-10-01T10:05:00.000Z",
    transferred_at: "2023-10-01T10:05:00.000Z"
  }
};

/**
 * Paystack Refund Processed Webhook
 * Sent when a refund is processed
 */
export const paystackRefundProcessedPayload = {
  event: "refund.processed",
  data: {
    id: 501,
    transaction: {
      id: 3029612345,
      reference: "7PVGX8MEk85t1Ep0",
      domain: "test",
      amount: 20000,
      currency: "NGN"
    },
    amount: 20000,
    currency: "NGN",
    status: "processed",
    refunded_by: "john.doe@example.com",
    refunded_at: "2023-10-02T10:00:00.000Z",
    expected_at: "2023-10-02T10:00:00.000Z",
    reason: "Customer request",
    created_at: "2023-10-02T09:00:00.000Z",
    updated_at: "2023-10-02T10:00:00.000Z"
  }
};

// ==================== MTN MoMo Payloads ====================

/**
 * MTN MoMo Request to Pay Success
 * Sent when a payment request is successful
 */
export const mtnMomoRequestToPaySuccessPayload = {
  amount: "1000",
  currency: "EUR", // MTN uses EUR in sandbox
  externalId: "EXT-123456",
  payer: {
    partyIdType: "MSISDN",
    partyId: "256774290817"
  },
  payerMessage: "Payment for invoice #123",
  payeeNote: "Thank you for your payment",
  status: "SUCCESSFUL",
  financialTransactionId: "1687923847"
};

/**
 * MTN MoMo Request to Pay Failed
 * Sent when a payment request fails
 */
export const mtnMomoRequestToPayFailedPayload = {
  amount: "1000",
  currency: "EUR",
  externalId: "EXT-123457",
  payer: {
    partyIdType: "MSISDN",
    partyId: "256774290817"
  },
  payerMessage: "Payment for invoice #124",
  payeeNote: "Thank you for your payment",
  status: "FAILED",
  reason: "Payer rejected the transaction"
};

/**
 * MTN MoMo Transfer Success
 * Sent when a transfer is completed
 */
export const mtnMomoTransferSuccessPayload = {
  amount: "5000",
  currency: "EUR",
  externalId: "TRF-789012",
  payee: {
    partyIdType: "MSISDN",
    partyId: "256774290818"
  },
  payerMessage: "Salary payment",
  payeeNote: "October salary",
  status: "SUCCESSFUL",
  financialTransactionId: "1687923848"
};

/**
 * MTN MoMo Collection Callback
 * Alternative format for collection notifications
 */
export const mtnMomoCollectionCallbackPayload = {
  transactionId: "1687923849",
  referenceId: "REF-987654",
  status: "SUCCESSFUL",
  amount: "2000",
  currency: "EUR",
  phoneNumber: "256774290817",
  message: "Payment received successfully"
};

// ==================== IntaSend Payloads ====================

/**
 * IntaSend Payment Success
 * Sent when a payment is completed
 */
export const intasendPaymentSuccessPayload = {
  invoice_id: "INV-2C8VXZ9P",
  state: "COMPLETE",
  provider: "M-PESA",
  charges: 25,
  net_amount: 975,
  currency: "KES",
  value: 1000,
  account: "254712345678",
  api_ref: "ORDER_123",
  clearing_status: "Cleared",
  failed_reason: null,
  failed_code: null,
  created_at: "2023-10-01T12:00:00.000Z",
  updated_at: "2023-10-01T12:01:30.000Z"
};

/**
 * IntaSend Payment Failed
 * Sent when a payment fails
 */
export const intasendPaymentFailedPayload = {
  invoice_id: "INV-2C8VXZ9Q",
  state: "FAILED",
  provider: "M-PESA",
  charges: 0,
  net_amount: 0,
  currency: "KES",
  value: 1000,
  account: "254712345678",
  api_ref: "ORDER_124",
  clearing_status: null,
  failed_reason: "Insufficient funds",
  failed_code: "INSUFFICIENT_FUNDS",
  created_at: "2023-10-01T12:00:00.000Z",
  updated_at: "2023-10-01T12:00:45.000Z"
};

/**
 * IntaSend Payout Success
 * Sent when a payout/transfer is completed
 */
export const intasendPayoutSuccessPayload = {
  transaction_id: "TRX-ABC123XYZ",
  status: "Completed",
  provider: "M-PESA",
  amount: 5000,
  currency: "KES",
  account: "254712345678",
  name: "John Doe",
  narration: "Monthly salary",
  reference: "SAL-OCT-2023",
  created_at: "2023-10-01T09:00:00.000Z",
  updated_at: "2023-10-01T09:02:15.000Z"
};

/**
 * IntaSend Refund Processed
 * Sent when a refund is completed
 */
export const intasendRefundProcessedPayload = {
  refund_id: "RFD-REF123",
  original_invoice_id: "INV-2C8VXZ9P",
  status: "Completed",
  amount: 1000,
  currency: "KES",
  reason: "Customer request",
  created_at: "2023-10-02T10:00:00.000Z",
  updated_at: "2023-10-02T10:05:30.000Z"
};

/**
 * IntaSend Wallet Update
 * Sent when wallet balance changes
 */
export const intasendWalletUpdatePayload = {
  wallet_id: "WAL-12345",
  transaction_type: "credit",
  amount: 1000,
  currency: "KES",
  description: "Payment received",
  balance_after: 15000,
  created_at: "2023-10-01T12:01:30.000Z"
};

// ==================== Test Helper Functions ====================

/**
 * Generate a Paystack signature for testing
 * Requires the webhook secret
 */
export function generatePaystackSignature(payload: any, secret: string): string {
  const crypto = require('crypto');
  return crypto
    .createHmac('sha512', secret)
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');
}

/**
 * Generate an IntaSend signature for testing
 * Requires the webhook secret
 */
export function generateIntasendSignature(payload: any, secret: string): string {
  const crypto = require('crypto');
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');
}

/**
 * Get all test payloads as an array
 */
export function getAllTestPayloads() {
  return [
    { provider: 'mpesa', type: 'stk_success', payload: mpesaStkSuccessPayload },
    { provider: 'mpesa', type: 'stk_failed', payload: mpesaStkFailedPayload },
    { provider: 'mpesa', type: 'c2b', payload: mpesaC2BPayload },
    { provider: 'mpesa', type: 'b2c', payload: mpesaB2CSuccessPayload },
    { provider: 'paystack', type: 'charge_success', payload: paystackChargeSuccessPayload },
    { provider: 'paystack', type: 'charge_failed', payload: paystackChargeFailedPayload },
    { provider: 'paystack', type: 'transfer_success', payload: paystackTransferSuccessPayload },
    { provider: 'paystack', type: 'refund', payload: paystackRefundProcessedPayload },
    { provider: 'mtn-momo', type: 'request_to_pay', payload: mtnMomoRequestToPaySuccessPayload },
    { provider: 'mtn-momo', type: 'request_to_pay_failed', payload: mtnMomoRequestToPayFailedPayload },
    { provider: 'mtn-momo', type: 'transfer', payload: mtnMomoTransferSuccessPayload },
    { provider: 'mtn-momo', type: 'collection', payload: mtnMomoCollectionCallbackPayload },
    { provider: 'intasend', type: 'payment_success', payload: intasendPaymentSuccessPayload },
    { provider: 'intasend', type: 'payment_failed', payload: intasendPaymentFailedPayload },
    { provider: 'intasend', type: 'payout', payload: intasendPayoutSuccessPayload },
    { provider: 'intasend', type: 'refund', payload: intasendRefundProcessedPayload },
    { provider: 'intasend', type: 'wallet', payload: intasendWalletUpdatePayload },
  ];
}
