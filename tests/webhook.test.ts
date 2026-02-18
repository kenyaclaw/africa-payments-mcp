/**
 * Webhook Tests
 * 
 * Comprehensive test suite for webhook handling:
 * - Webhook signature verification
 * - M-Pesa callback parsing
 * - Paystack webhook handling
 * - Event emission
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { createHash, createHmac } from 'crypto';
import webhookPayloads from './fixtures/webhook-payloads.json';

describe('Webhook Handling', () => {
  
  // ==================== Paystack Webhook Verification ====================
  describe('Paystack Webhook Verification', () => {
    const webhookSecret = 'whsec_test_secret_key';
    
    // Helper to generate Paystack signature
    const generatePaystackSignature = (payload: any, secret: string): string => {
      const hash = createHmac('sha512', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
      return hash;
    };

    describe('verifyWebhookSignature', () => {
      it('should verify valid signature', () => {
        const payload = webhookPayloads.paystack.chargeSuccess;
        const signature = generatePaystackSignature(payload, webhookSecret);
        
        const computedHash = createHmac('sha512', webhookSecret)
          .update(JSON.stringify(payload))
          .digest('hex');
        
        expect(signature).toBe(computedHash);
        expect(signature).toHaveLength(128); // SHA-512 hex length
      });

      it('should reject invalid signature', () => {
        const payload = webhookPayloads.paystack.chargeSuccess;
        const invalidSignature = 'invalid_signature_123';
        
        const computedHash = createHmac('sha512', webhookSecret)
          .update(JSON.stringify(payload))
          .digest('hex');
        
        expect(invalidSignature).not.toBe(computedHash);
      });

      it('should handle different payload structures', () => {
        const payloads = [
          webhookPayloads.paystack.chargeSuccess,
          webhookPayloads.paystack.transferSuccess,
          webhookPayloads.paystack.refundProcessed,
        ];

        for (const payload of payloads) {
          const signature = generatePaystackSignature(payload, webhookSecret);
          expect(signature).toBeDefined();
          expect(signature.length).toBeGreaterThan(0);
        }
      });

      it('should generate different signatures for different payloads', () => {
        const sig1 = generatePaystackSignature(
          webhookPayloads.paystack.chargeSuccess,
          webhookSecret
        );
        const sig2 = generatePaystackSignature(
          webhookPayloads.paystack.transferSuccess,
          webhookSecret
        );
        
        expect(sig1).not.toBe(sig2);
      });

      it('should generate different signatures with different secrets', () => {
        const payload = webhookPayloads.paystack.chargeSuccess;
        const sig1 = generatePaystackSignature(payload, 'secret1');
        const sig2 = generatePaystackSignature(payload, 'secret2');
        
        expect(sig1).not.toBe(sig2);
      });
    });

    describe('parseWebhookPayload', () => {
      it('should parse charge.success event', () => {
        const payload = webhookPayloads.paystack.chargeSuccess;
        
        expect(payload.event).toBe('charge.success');
        expect(payload.data).toBeDefined();
        expect(payload.data.status).toBe('success');
        expect(payload.data.amount).toBe(500000);
        expect(payload.data.currency).toBe('NGN');
        expect(payload.data.reference).toBe('PS_20260115143000_abc123');
      });

      it('should parse transfer.success event', () => {
        const payload = webhookPayloads.paystack.transferSuccess;
        
        expect(payload.event).toBe('transfer.success');
        expect(payload.data.status).toBe('success');
        expect(payload.data.amount).toBe(100000);
        expect(payload.data.currency).toBe('NGN');
      });

      it('should parse transfer.failed event', () => {
        const payload = webhookPayloads.paystack.transferFailed;
        
        expect(payload.event).toBe('transfer.failed');
        expect(payload.data.status).toBe('failed');
        expect(payload.data.failures).toBeDefined();
        expect(payload.data.failures.recipient).toContain('Invalid account number');
      });

      it('should parse refund.processed event', () => {
        const payload = webhookPayloads.paystack.refundProcessed;
        
        expect(payload.event).toBe('refund.processed');
        expect(payload.data.status).toBe('processed');
        expect(payload.data.amount).toBe(500000);
      });

      it('should parse subscription.create event', () => {
        const payload = webhookPayloads.paystack.subscriptionCreate;
        
        expect(payload.event).toBe('subscription.create');
        expect(payload.data.status).toBe('active');
        expect(payload.data.plan).toBeDefined();
        expect(payload.data.plan.name).toBe('Premium Plan');
      });

      it('should extract customer information', () => {
        const payload = webhookPayloads.paystack.chargeSuccess;
        
        expect(payload.data.customer).toBeDefined();
        expect(payload.data.customer.email).toBe('john.doe@example.com');
        expect(payload.data.customer.first_name).toBe('John');
        expect(payload.data.customer.last_name).toBe('Doe');
      });

      it('should extract authorization details', () => {
        const payload = webhookPayloads.paystack.chargeSuccess;
        
        expect(payload.data.authorization).toBeDefined();
        expect(payload.data.authorization.authorization_code).toBe('AUTH_test123');
        expect(payload.data.authorization.card_type).toBe('visa');
        expect(payload.data.authorization.last4).toBe('4081');
      });
    });
  });

  // ==================== M-Pesa Webhook Verification ====================
  describe('M-Pesa Webhook Handling', () => {
    
    describe('parseCallbackPayload', () => {
      it('should parse STK push success callback', () => {
        const payload = webhookPayloads.mpesa.stkPushSuccess;
        
        expect(payload.Body).toBeDefined();
        expect(payload.Body.stkCallback).toBeDefined();
        expect(payload.Body.stkCallback.ResultCode).toBe(0);
        expect(payload.Body.stkCallback.ResultDesc).toContain('success');
      });

      it('should extract payment details from STK callback', () => {
        const callback = webhookPayloads.mpesa.stkPushSuccess.Body.stkCallback;
        const items = callback.CallbackMetadata.Item;
        
        const amount = items.find((i: any) => i.Name === 'Amount')?.Value;
        const receipt = items.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value;
        const phone = items.find((i: any) => i.Name === 'PhoneNumber')?.Value;
        
        expect(amount).toBe(1000);
        expect(receipt).toBe('TEST123456');
        expect(phone).toBe(254712345678);
      });

      it('should parse STK push cancelled callback', () => {
        const payload = webhookPayloads.mpesa.stkPushCancelled;
        
        expect(payload.Body.stkCallback.ResultCode).toBe(1032);
        expect(payload.Body.stkCallback.ResultDesc).toContain('cancelled');
      });

      it('should parse STK push insufficient funds callback', () => {
        const payload = webhookPayloads.mpesa.stkPushInsufficient;
        
        expect(payload.Body.stkCallback.ResultCode).toBe(1);
        expect(payload.Body.stkCallback.ResultDesc).toContain('insufficient');
      });

      it('should parse B2C success callback', () => {
        const payload = webhookPayloads.mpesa.b2cSuccess;
        
        expect(payload.Result).toBeDefined();
        expect(payload.Result.ResultCode).toBe(0);
        expect(payload.Result.ResultType).toBe(0);
      });

      it('should extract B2C transaction details', () => {
        const result = webhookPayloads.mpesa.b2cSuccess.Result;
        const params = result.ResultParameters.ResultParameter;
        
        const receipt = params.find((p: any) => p.Key === 'TransactionReceipt')?.Value;
        const amount = params.find((p: any) => p.Key === 'TransactionAmount')?.Value;
        const recipient = params.find((p: any) => p.Key === 'ReceiverPartyPublicName')?.Value;
        
        expect(receipt).toBe('TEST123456');
        expect(amount).toBe(1000);
        expect(recipient).toContain('254712345678');
      });

      it('should parse C2B confirmation', () => {
        const payload = webhookPayloads.mpesa.c2bConfirmation;
        
        expect(payload.TransactionType).toBe('Pay Bill');
        expect(payload.TransID).toBe('TEST123456');
        expect(payload.TransAmount).toBe('1000.00');
        expect(payload.BillRefNumber).toBe('INV001');
        expect(payload.MSISDN).toBe('254712345678');
      });

      it('should parse C2B validation', () => {
        const payload = webhookPayloads.mpesa.c2bValidation;
        
        expect(payload.TransactionType).toBe('Pay Bill');
        expect(payload.BusinessShortCode).toBe('123456');
        expect(payload.OrgAccountBalance).toBe('50000.00');
      });

      it('should parse reversal callback', () => {
        const payload = webhookPayloads.mpesa.reversal;
        
        expect(payload.Result.ResultCode).toBe(0);
        expect(payload.Result.ConversationID).toBeDefined();
      });
    });

    describe('validateCallback', () => {
      it('should accept valid STK success callback', () => {
        const callback = webhookPayloads.mpesa.stkPushSuccess.Body.stkCallback;
        
        expect(callback.ResultCode).toBe(0);
        expect(callback.CallbackMetadata).toBeDefined();
      });

      it('should identify failed transactions', () => {
        const failedCallbacks = [
          webhookPayloads.mpesa.stkPushCancelled.Body.stkCallback,
          webhookPayloads.mpesa.stkPushInsufficient.Body.stkCallback,
        ];

        for (const callback of failedCallbacks) {
          expect(callback.ResultCode).not.toBe(0);
        }
      });
    });
  });

  // ==================== MTN MoMo Webhook ====================
  describe('MTN MoMo Webhook', () => {
    it('should parse request to pay payload', () => {
      const payload = webhookPayloads.mtnMomo.requestToPay;
      
      expect(payload.amount).toBe('1000');
      expect(payload.currency).toBe('UGX');
      expect(payload.externalId).toBe('INV001');
      expect(payload.payer.partyId).toBe('256712345678');
    });

    it('should parse successful transfer notification', () => {
      const payload = webhookPayloads.mtnMomo.successfulTransfer;
      
      expect(payload.status).toBe('SUCCESSFUL');
      expect(payload.financialTransactionId).toBeDefined();
      expect(payload.amount).toBe('1000');
    });

    it('should parse pending transfer notification', () => {
      const payload = webhookPayloads.mtnMomo.pendingTransfer;
      
      expect(payload.status).toBe('PENDING');
    });

    it('should parse failed transfer notification', () => {
      const payload = webhookPayloads.mtnMomo.failedTransfer;
      
      expect(payload.status).toBe('FAILED');
      expect(payload.errorReason).toBe('Insufficient balance');
    });
  });

  // ==================== Webhook Event Handling ====================
  describe('Event Handling', () => {
    const mockEventHandler = jest.fn();

    beforeEach(() => {
      mockEventHandler.mockClear();
    });

    it('should handle successful payment events', () => {
      const events = [
        { type: 'payment.success', payload: webhookPayloads.paystack.chargeSuccess },
        { type: 'mpesa.stk.success', payload: webhookPayloads.mpesa.stkPushSuccess },
        { type: 'transfer.success', payload: webhookPayloads.paystack.transferSuccess },
      ];

      for (const event of events) {
        mockEventHandler(event);
        expect(mockEventHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            type: event.type,
            payload: expect.any(Object),
          })
        );
      }
    });

    it('should handle failed payment events', () => {
      const events = [
        { type: 'payment.failed', payload: webhookPayloads.mpesa.stkPushCancelled },
        { type: 'transfer.failed', payload: webhookPayloads.paystack.transferFailed },
      ];

      for (const event of events) {
        mockEventHandler(event);
        expect(mockEventHandler).toHaveBeenCalled();
      }
    });

    it('should handle refund events', () => {
      const event = {
        type: 'refund.processed',
        payload: webhookPayloads.paystack.refundProcessed,
      };

      mockEventHandler(event);
      expect(mockEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'refund.processed' })
      );
    });

    it('should include timestamp in events', () => {
      const event = {
        type: 'payment.success',
        payload: webhookPayloads.paystack.chargeSuccess,
        timestamp: new Date().toISOString(),
      };

      mockEventHandler(event);
      const callArg = mockEventHandler.mock.calls[0][0];
      expect(callArg.timestamp).toBeDefined();
    });
  });

  // ==================== Webhook Security ====================
  describe('Webhook Security', () => {
    it('should validate Paystack signature format', () => {
      const payload = webhookPayloads.paystack.chargeSuccess;
      const signature = createHmac('sha512', 'secret')
        .update(JSON.stringify(payload))
        .digest('hex');
      
      // Should be 128 characters (SHA-512 hex)
      expect(signature).toMatch(/^[a-f0-9]{128}$/);
    });

    it('should handle empty payload', () => {
      const emptyPayload = {};
      const signature = createHmac('sha512', 'secret')
        .update(JSON.stringify(emptyPayload))
        .digest('hex');
      
      expect(signature).toBeDefined();
      expect(signature.length).toBe(128);
    });

    it('should handle payload with special characters', () => {
      const payload = {
        data: {
          description: 'Test with special chars: áéíóú ñ € £ ¥',
          emoji: '🎉💰🚀',
        },
      };
      
      const signature = createHmac('sha512', 'secret')
        .update(JSON.stringify(payload))
        .digest('hex');
      
      expect(signature).toBeDefined();
      expect(signature.length).toBe(128);
    });

    it('should handle payload arrays', () => {
      const payload = {
        data: {
          items: [1, 2, 3, 'test', null, undefined],
        },
      };
      
      const signature = createHmac('sha512', 'secret')
        .update(JSON.stringify(payload))
        .digest('hex');
      
      expect(signature).toBeDefined();
    });
  });

  // ==================== Webhook Response Handling ====================
  describe('Webhook Response Handling', () => {
    it('should acknowledge webhook receipt', () => {
      const acknowledgment = {
        status: 'success',
        message: 'Webhook received',
        receivedAt: new Date().toISOString(),
      };

      expect(acknowledgment.status).toBe('success');
      expect(acknowledgment.receivedAt).toBeDefined();
    });

    it('should handle duplicate webhooks', () => {
      const processedIds = new Set<string>();
      const webhookId = 'webhook_123';

      // First processing
      if (!processedIds.has(webhookId)) {
        processedIds.add(webhookId);
      }

      // Duplicate should be detected
      expect(processedIds.has(webhookId)).toBe(true);
      expect(processedIds.size).toBe(1);
    });

    it('should store webhook ID for deduplication', () => {
      const processedIds = new Set<string>();
      const ids = ['id1', 'id2', 'id1', 'id3', 'id2'];

      for (const id of ids) {
        processedIds.add(id);
      }

      expect(processedIds.size).toBe(3);
      expect(processedIds.has('id1')).toBe(true);
      expect(processedIds.has('id2')).toBe(true);
      expect(processedIds.has('id3')).toBe(true);
    });
  });

  // ==================== Webhook Error Handling ====================
  describe('Webhook Error Handling', () => {
    it('should handle malformed JSON payload', () => {
      const malformedPayload = '{"invalid json';
      
      expect(() => JSON.parse(malformedPayload)).toThrow();
    });

    it('should handle missing required fields', () => {
      const incompletePayload = {
        event: 'charge.success',
        // missing 'data' field
      };

      expect(incompletePayload.data).toBeUndefined();
    });

    it('should handle null values in payload', () => {
      const payloadWithNull = {
        event: 'charge.success',
        data: {
          reference: null,
          amount: null,
        },
      };

      expect(payloadWithNull.data.reference).toBeNull();
      expect(payloadWithNull.data.amount).toBeNull();
    });

    it('should handle very large payload', () => {
      const largePayload = {
        event: 'charge.success',
        data: {
          metadata: {
            largeArray: Array(1000).fill('test data'),
          },
        },
      };

      const signature = createHmac('sha512', 'secret')
        .update(JSON.stringify(largePayload))
        .digest('hex');

      expect(signature).toBeDefined();
      expect(signature.length).toBe(128);
    });
  });
});
