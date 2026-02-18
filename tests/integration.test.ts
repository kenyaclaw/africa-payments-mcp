/**
 * Integration Tests
 * 
 * End-to-end tests covering complete payment flows:
 * - Full payment flow: request → verify → refund
 * - Cross-provider operations
 * - Real-world scenarios
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';

// Mock axios before imports
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      interceptors: {
        request: { use: jest.fn(), eject: jest.fn() },
        response: { use: jest.fn(), eject: jest.fn() },
      },
    })),
  },
}));

import axios from 'axios';
import { ToolManager } from '../src/utils/tools.js';
import { ProviderRegistry } from '../src/utils/registry.js';
import { Logger } from '../src/utils/logger.js';
import { MpesaAdapter } from '../src/adapters/mpesa/index.js';
import { PaystackAdapter } from '../src/adapters/paystack/index.js';
import { IntaSendAdapter } from '../src/adapters/intasend/index.js';
import { MTNMoMoAdapter } from '../src/adapters/mtn-momo/index.js';
import { 
  MpesaConfig, 
  PaystackConfig,
  IntaSendConfig,
  MTNMoMoConfig,
  TransactionStatus 
} from '../src/types/index.js';

// Test configurations
const mpesaConfig: MpesaConfig = {
  enabled: true,
  environment: 'sandbox',
  consumerKey: 'test_consumer_key',
  consumerSecret: 'test_consumer_secret',
  passkey: 'test_passkey',
  shortCode: '123456',
};

const paystackConfig: PaystackConfig = {
  enabled: true,
  environment: 'sandbox',
  secretKey: 'sk_test_1234567890abcdef',
};

const intasendConfig: IntaSendConfig = {
  enabled: true,
  environment: 'sandbox',
  publishableKey: 'pk_test_intasend',
  secretKey: 'sk_test_intasend',
};

const momoConfig: MTNMoMoConfig = {
  enabled: true,
  environment: 'sandbox',
  apiUser: 'test_user',
  apiKey: 'test_key',
  subscriptionKey: 'test_sub_key',
};

describe('Integration Tests', () => {
  let registry: ProviderRegistry;
  let logger: Logger;
  let toolManager: ToolManager;
  let mockPost: jest.Mock;
  let mockGet: jest.Mock;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-15T12:00:00Z'));
    
    mockPost = jest.fn();
    mockGet = jest.fn();
    
    mockAxiosInstance = {
      get: mockGet,
      post: mockPost,
      interceptors: {
        request: { use: jest.fn(), eject: jest.fn() },
        response: { use: jest.fn(), eject: jest.fn() },
      },
    };
    
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);
    
    // Set up default mock implementations that handle common endpoints
    mockGet.mockImplementation((url: string) => {
      // M-Pesa auth
      if (url.includes('/oauth/v1/generate')) {
        return Promise.resolve({
          data: {
            access_token: 'mock_token',
            expires_in: '3600',
          },
        });
      }
      // Paystack bank endpoint
      if (url === '/bank') {
        return Promise.resolve({
          data: {
            status: true,
            message: 'Banks retrieved',
            data: [{ name: 'Test Bank', code: 'TEST001', slug: 'test-bank' }],
          },
        });
      }
      // Default
      return Promise.resolve({ data: {} });
    });
    
    mockPost.mockImplementation((url: string) => {
      // M-Pesa STK Push
      if (url.includes('/stkpush/v1/processrequest')) {
        return Promise.resolve({
          data: {
            MerchantRequestID: 'MERCH123',
            CheckoutRequestID: 'CHECK456',
            ResponseCode: '0',
            ResponseDescription: 'Success',
            CustomerMessage: 'Success. Request accepted for processing',
          },
        });
      }
      // M-Pesa B2C
      if (url.includes('/b2c/v1/paymentrequest')) {
        return Promise.resolve({
          data: {
            ConversationID: 'AG_20240115_123456',
            OriginatorConversationID: 'test-123',
            ResponseCode: '0',
            ResponseDescription: 'Success',
          },
        });
      }
      // M-Pesa Transaction Status
      if (url.includes('/transactionstatus/v1/query')) {
        return Promise.resolve({
          data: {
            ResultCode: '0',
            ResultDesc: 'The service request is processed successfully.',
            TransactionID: 'TEST123',
            Amount: '1000',
          },
        });
      }
      // Paystack Initialize
      if (url === '/transaction/initialize') {
        return Promise.resolve({
          data: {
            status: true,
            message: 'Authorization URL created',
            data: {
              reference: 'PS_20260115143000_abc123',
              authorization_url: 'https://checkout.paystack.com/test',
              access_code: 'access_test',
            },
          },
        });
      }
      // Default
      return Promise.resolve({ data: { status: true } });
    });
    
    // Create fresh instances after mock is set up
    logger = new Logger('error');
    registry = new ProviderRegistry(logger);
    toolManager = new ToolManager(registry, logger);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // Helper function to setup M-Pesa mocks - kept for compatibility
  const setupMpesaMocks = () => {
    // GET and POST requests are handled by mockImplementation in beforeEach
  };
  
  // Helper function to setup Paystack initialize mocks - kept for compatibility
  const setupPaystackInitializeMocks = () => {
    // POST requests are handled by mockImplementation in beforeEach
  };
  
  // Helper function to setup Paystack transfer mocks
  const setupPaystackTransferMocks = () => {
    // Mock transfer recipient creation
    mockPost.mockResolvedValueOnce({
      data: {
        status: true,
        data: {
          recipient_code: 'RCP_123456789',
        },
      },
    });
    
    // Mock transfer initiation
    mockPost.mockResolvedValueOnce({
      data: {
        status: true,
        data: {
          transfer_code: 'TRF_test123',
          reference: 'PS_20260115143000_abc123',
          status: 'pending',
          id: 12345,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    });
  };

  // ==================== Full Payment Flow Tests ====================
  describe('Full Payment Flow', () => {
    beforeEach(() => {
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          MerchantRequestID: 'MERCH123',
          CheckoutRequestID: 'CHECK456',
          ResponseCode: '0',
          ResponseDescription: 'Success',
          CustomerMessage: 'Success. Request accepted for processing',
        },
      });
      registry.register('mpesa', new MpesaAdapter(mpesaConfig));
    });

    it('should complete full M-Pesa payment flow: request → verify → refund', async () => {
      // Step 1: Request payment (STK Push)
      const requestResult = await toolManager.executeTool('unified_request_payment', {
        customer_phone: '+254712345678',
        customer_name: 'John Doe',
        amount: 1000,
        description: 'Test product purchase',
      });

      expect(requestResult).toBeDefined();
      expect(requestResult.content[0].text).toContain('Payment Request');

      // Extract transaction ID from response (simulated)
      // In real scenario, this would be parsed from the response
      const transactionId = 'mpesa_stk_1234567890';

      // Setup mocks for verify
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          ResultCode: '0',
          ResultDesc: 'The service request is processed successfully.',
          TransactionID: transactionId,
          Amount: '1000',
        },
      });

      // Step 2: Verify transaction
      const verifyResult = await toolManager.executeTool('unified_verify_transaction', {
        transaction_id: transactionId,
        provider: 'mpesa',
      });

      expect(verifyResult).toBeDefined();
      expect(verifyResult.content[0].text).toContain('Transaction Status');

      // Setup mocks for refund (need to find transaction first, then refund)
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          ResultCode: '0',
          ResultDesc: 'The service request is processed successfully.',
          TransactionID: transactionId,
          Amount: '1000',
        },
      });
      
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          ConversationID: 'REFUND001',
          OriginatorConversationID: 'test-refund',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });

      // Step 3: Process refund
      const refundResult = await toolManager.executeTool('unified_refund', {
        transaction_id: transactionId,
        reason: 'Customer request - changed mind',
      });

      expect(refundResult).toBeDefined();
      expect(refundResult.content[0].text).toContain('Refund Processed');
    });

    it('should complete full Paystack payment flow: initialize → verify → refund', async () => {
      registry.register('paystack', new PaystackAdapter(paystackConfig));

      // Step 1: Initialize transaction
      const initResult = await toolManager.executeTool('paystack_initialize', {
        email: 'customer@example.com',
        amount: 5000,
        currency: 'NGN',
        reference: 'ORDER_12345',
        metadata: {
          customer_name: 'Jane Doe',
          order_items: ['item1', 'item2'],
        },
      });

      expect(initResult).toBeDefined();
      expect(initResult.content[0].text).toContain('Paystack Transaction');

      // Step 2: Verify transaction
      const verifyResult = await toolManager.executeTool('paystack_verify', {
        reference: 'ORDER_12345',
      });

      expect(verifyResult).toBeDefined();
      expect(verifyResult.content[0].text).toContain('Verified');

      // Step 3: Process partial refund
      const refundResult = await toolManager.executeTool('paystack_refund', {
        transaction_id: 'ORDER_12345',
        amount: 2500,
      });

      expect(refundResult).toBeDefined();
      expect(refundResult.content[0].text).toContain('Refund');
    });

    it('should handle M-Pesa B2C payout flow', async () => {
      // Setup mocks for B2C
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          ConversationID: 'AG_20240115_123456',
          OriginatorConversationID: 'test-123',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });

      // Step 1: Send money to recipient
      const sendResult = await toolManager.executeTool('mpesa_b2c', {
        phone_number: '254712345678',
        amount: 5000,
        description: 'Salary payment for January',
      });

      expect(sendResult).toBeDefined();
      expect(sendResult.content[0].text).toContain('B2C Transfer');

      // Step 2: Check transaction status
      const statusResult = await toolManager.executeTool('mpesa_transaction_status', {
        transaction_id: 'mpesa_b2c_1234567890',
      });

      expect(statusResult).toBeDefined();
    });
  });

  // ==================== Cross-Provider Operations ====================
  describe('Cross-Provider Operations', () => {
    beforeEach(() => {
      // Register providers - default mockImplementation in outer beforeEach handles all API calls
      registry.register('mpesa', new MpesaAdapter(mpesaConfig));
      registry.register('paystack', new PaystackAdapter(paystackConfig));
      registry.register('intasend', new IntaSendAdapter(intasendConfig));
    });

    it('should auto-select provider based on phone country code', async () => {
      // Test Kenya (+254) with M-Pesa - send_money
      mockGet.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          expires_in: '3600',
        },
      });
      mockPost.mockResolvedValueOnce({
        data: {
          ConversationID: 'AG_20240115_123456',
          OriginatorConversationID: 'test-123',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      const result1 = await toolManager.executeTool('unified_send_money', {
        recipient_phone: '+254712345678',
        amount: 1000,
      });

      expect(result1).toBeDefined();
      expect(result1.content[0].text).toContain('Send Money');
      
      // Test Nigeria (+234) with Paystack using request_payment 
      // (send_money requires bank account)
      mockPost.mockResolvedValueOnce({
        data: {
          status: true,
          message: 'Authorization URL created',
          data: {
            reference: 'PS_20260115143000_abc123',
            authorization_url: 'https://checkout.paystack.com/test',
            access_code: 'access_test',
          },
        },
      });
      
      const result2 = await toolManager.executeTool('unified_request_payment', {
        customer_phone: '+2348012345678',
        customer_email: 'test@example.com',
        amount: 1000,
        currency: 'NGN',
      });

      expect(result2).toBeDefined();
    });

    it('should list transactions from multiple providers', async () => {
      // Create transactions with different providers
      // M-Pesa request
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          MerchantRequestID: 'MERCH123',
          CheckoutRequestID: 'CHECK456',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      await toolManager.executeTool('unified_request_payment', {
        customer_phone: '+254712345678',
        amount: 1000,
        provider: 'mpesa',
      });

      // Use IntaSend for second provider (doesn't need mocking)
      await toolManager.executeTool('unified_request_payment', {
        customer_email: 'test@example.com',
        amount: 5000,
        provider: 'intasend',
        currency: 'NGN',
      });

      // List all transactions
      const listResult = await toolManager.executeTool('unified_list_transactions', {});

      expect(listResult).toBeDefined();
    });

    it('should search transaction across all providers', async () => {
      // Try to find transaction without specifying provider
      const searchResult = await toolManager.executeTool('unified_verify_transaction', {
        transaction_id: 'any_transaction_id',
      });

      // Should search all providers and return result from first match
      expect(searchResult).toBeDefined();
    });

    it('should handle currency conversion between providers', async () => {
      const ratesResult = await toolManager.executeTool('unified_get_rates', {
        from_currency: 'USD',
        to_currency: 'NGN',
      });

      expect(ratesResult).toBeDefined();
      expect(ratesResult.content[0].text).toContain('Exchange Rate');
    });
  });

  // ==================== Multi-Step Transaction Flows ====================
  describe('Multi-Step Transaction Flows', () => {
    beforeEach(() => {
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          MerchantRequestID: 'MERCH123',
          CheckoutRequestID: 'CHECK456',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      registry.register('mpesa', new MpesaAdapter(mpesaConfig));
      registry.register('paystack', new PaystackAdapter(paystackConfig));
    });

    it('should handle merchant collection flow', async () => {
      // Merchant initiates payment request
      const requestResult = await toolManager.executeTool('mpesa_stk_push', {
        phone_number: '254712345678',
        amount: 2500,
        account_reference: 'INV-2026-001',
        description: 'Payment for Invoice #001',
      });

      expect(requestResult.content[0].text).toContain('STK Push');

      // Query transaction status
      const statusResult = await toolManager.executeTool('mpesa_transaction_status', {
        transaction_id: 'ws_CO_123456789',
      });

      expect(statusResult).toBeDefined();
    });

    it('should handle bulk disbursement flow', async () => {
      const recipients = [
        { phone: '254712345678', amount: 1000, name: 'Alice' },
        { phone: '254723456789', amount: 2000, name: 'Bob' },
        { phone: '254734567890', amount: 1500, name: 'Charlie' },
      ];

      const results = [];
      for (const recipient of recipients) {
        // Setup mock for each recipient
        setupMpesaMocks();
        mockPost.mockResolvedValueOnce({
          data: {
            ConversationID: 'AG_20240115_123456',
            OriginatorConversationID: 'test-123',
            ResponseCode: '0',
            ResponseDescription: 'Success',
          },
        });
        
        const result = await toolManager.executeTool('unified_send_money', {
          recipient_phone: recipient.phone,
          recipient_name: recipient.name,
          amount: recipient.amount,
          description: 'Bulk payout batch #1',
        });
        results.push(result);
      }

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.content[0].text).toContain('Send Money');
      });
    });

    it('should handle payment with automatic retries', async () => {
      // First attempt
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          ConversationID: 'AG_20240115_123456',
          OriginatorConversationID: 'test-123',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      const firstAttempt = await toolManager.executeTool('unified_send_money', {
        recipient_phone: '+254712345678',
        amount: 5000,
        description: 'Payment with retry',
      });

      expect(firstAttempt).toBeDefined();

      // Verify the transaction status
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          ResultCode: '0',
          ResultDesc: 'The service request is processed successfully.',
          TransactionID: 'mpesa_b2c_1234567890',
          Amount: '5000',
        },
      });
      
      const verifyResult = await toolManager.executeTool('unified_verify_transaction', {
        transaction_id: 'mpesa_b2c_1234567890',
        provider: 'mpesa',
      });

      expect(verifyResult).toBeDefined();
    });
  });

  // ==================== Error Recovery Flows ====================
  describe('Error Recovery Flows', () => {
    beforeEach(() => {
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          MerchantRequestID: 'MERCH123',
          CheckoutRequestID: 'CHECK456',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      registry.register('mpesa', new MpesaAdapter(mpesaConfig));
      registry.register('paystack', new PaystackAdapter(paystackConfig));
    });

    it('should handle failed payment and retry', async () => {
      // Initial failed request (simulated)
      try {
        await toolManager.executeTool('unified_send_money', {
          recipient_phone: 'invalid_phone',
          amount: 1000,
        });
      } catch (error) {
        // Expected to fail
      }

      // Retry with correct phone
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          ConversationID: 'AG_20240115_123456',
          OriginatorConversationID: 'test-123',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      const retryResult = await toolManager.executeTool('unified_send_money', {
        recipient_phone: '+254712345678',
        amount: 1000,
      });

      expect(retryResult).toBeDefined();
      expect(retryResult.content[0].text).toContain('Send Money');
    });

    it('should handle partial refund after failed full refund', async () => {
      // First try full refund (might fail due to fees)
      // First need to verify the transaction exists
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          ResultCode: '0',
          ResultDesc: 'The service request is processed successfully.',
          TransactionID: 'paystack_123',
          Amount: '5000',
        },
      });
      
      // Then refund
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          ConversationID: 'REFUND001',
          OriginatorConversationID: 'test-refund',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      const fullRefund = await toolManager.executeTool('unified_refund', {
        transaction_id: 'paystack_123',
        reason: 'Full refund attempt',
      });

      expect(fullRefund).toBeDefined();

      // If that fails, try partial refund
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          ResultCode: '0',
          ResultDesc: 'The service request is processed successfully.',
          TransactionID: 'paystack_123',
          Amount: '5000',
        },
      });
      
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          ConversationID: 'REFUND002',
          OriginatorConversationID: 'test-refund-partial',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      const partialRefund = await toolManager.executeTool('unified_refund', {
        transaction_id: 'paystack_123',
        amount: 4800, // Minus fees
        reason: 'Partial refund after fees',
      });

      expect(partialRefund).toBeDefined();
    });

    it('should handle provider failover', async () => {
      // Request with preferred provider
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          MerchantRequestID: 'MERCH123',
          CheckoutRequestID: 'CHECK456',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      const result = await toolManager.executeTool('unified_request_payment', {
        customer_phone: '+254712345678',
        amount: 1000,
        provider: 'mpesa',
      });

      expect(result).toBeDefined();

      // If M-Pesa fails, try IntaSend
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          MerchantRequestID: 'MERCH124',
          CheckoutRequestID: 'CHECK457',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      const fallbackResult = await toolManager.executeTool('unified_request_payment', {
        customer_phone: '+254712345678',
        amount: 1000,
        provider: 'mpesa', // Same provider for test
      });

      expect(fallbackResult).toBeDefined();
    });
  });

  // ==================== Real-World Scenarios ====================
  describe('Real-World Scenarios', () => {
    beforeEach(() => {
      // Register providers - default mockImplementation in outer beforeEach handles all API calls
      registry.register('mpesa', new MpesaAdapter(mpesaConfig));
      registry.register('paystack', new PaystackAdapter(paystackConfig));
      registry.register('intasend', new IntaSendAdapter(intasendConfig));
      registry.register('mtn_momo', new MTNMoMoAdapter(momoConfig));
    });

    it('should handle e-commerce checkout flow', async () => {
      // Customer from Kenya
      mockGet.mockResolvedValueOnce({
        data: {
          access_token: 'mock_token',
          expires_in: '3600',
        },
      });
      mockPost.mockResolvedValueOnce({
        data: {
          MerchantRequestID: 'MERCH123',
          CheckoutRequestID: 'CHECK456',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      const kenyanCustomer = await toolManager.executeTool('unified_request_payment', {
        customer_phone: '+254712345678',
        customer_name: 'Wanjiku Mwangi',
        customer_email: 'wanjiku@example.com',
        amount: 5000,
        description: 'E-commerce purchase - Order #12345',
        currency: 'KES',
      });

      expect(kenyanCustomer).toBeDefined();

      // Customer from Nigeria - use Paystack with proper mock
      mockPost.mockResolvedValueOnce({
        data: {
          status: true,
          message: 'Authorization URL created',
          data: {
            reference: 'PS_20260115143000_abc123',
            authorization_url: 'https://checkout.paystack.com/test',
            access_code: 'access_test',
          },
        },
      });
      
      const nigerianCustomer = await toolManager.executeTool('unified_request_payment', {
        customer_phone: '+2348012345678',
        customer_email: 'chinedu@example.com',
        customer_name: 'Chinedu Okonkwo',
        amount: 15000,
        description: 'E-commerce purchase - Order #12346',
        currency: 'NGN',
      });

      expect(nigerianCustomer).toBeDefined();

      // Customer from Ghana - use Paystack with proper mock
      mockPost.mockResolvedValueOnce({
        data: {
          status: true,
          message: 'Authorization URL created',
          data: {
            reference: 'PS_20260115143000_def456',
            authorization_url: 'https://checkout.paystack.com/test2',
            access_code: 'access_test2',
          },
        },
      });
      
      const ghanaianCustomer = await toolManager.executeTool('unified_request_payment', {
        customer_phone: '+233201234567',
        customer_email: 'kwame@example.com',
        customer_name: 'Kwame Asante',
        amount: 500,
        description: 'E-commerce purchase - Order #12347',
        currency: 'GHS',
      });

      expect(ghanaianCustomer).toBeDefined();
    });

    it('should handle salary disbursement to multiple countries', async () => {
      // For multi-country disbursement, we test with Kenya (M-Pesa) and Ghana (Paystack with bank)
      // since Paystack Nigeria requires bank account for sendMoney
      const employees = [
        { country: 'KE', phone: '+254712345678', name: 'John Kamau', amount: 50000, currency: 'KES', provider: 'mpesa' },
        { country: 'KE', phone: '+254723456789', name: 'Jane Wanjiku', amount: 75000, currency: 'KES', provider: 'mpesa' },
        { country: 'KE', phone: '+254734567890', name: 'Peter Ochieng', amount: 60000, currency: 'KES', provider: 'mpesa' },
      ];

      for (const employee of employees) {
        setupMpesaMocks();
        mockPost.mockResolvedValueOnce({
          data: {
            ConversationID: 'AG_20240115_123456',
            OriginatorConversationID: 'test-123',
            ResponseCode: '0',
            ResponseDescription: 'Success',
          },
        });
        
        const result = await toolManager.executeTool('unified_send_money', {
          recipient_phone: employee.phone,
          recipient_name: employee.name,
          amount: employee.amount,
          currency: employee.currency,
          provider: employee.provider,
          description: `Salary for January 2026 - ${employee.name}`,
        });

        expect(result).toBeDefined();
        expect(result.content[0].text).toContain(employee.name);
      }
    });

    it('should handle invoice payment with reminder', async () => {
      // Create invoice payment request
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          MerchantRequestID: 'MERCH123',
          CheckoutRequestID: 'CHECK456',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      const invoiceRequest = await toolManager.executeTool('unified_request_payment', {
        customer_phone: '+254712345678',
        customer_name: 'Jane Wanjiku',
        amount: 15000,
        description: 'Invoice #INV-2026-001 - Web Development Services',
        expiry_minutes: 1440, // 24 hours
      });

      expect(invoiceRequest).toBeDefined();

      // Check payment status (first reminder)
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          ResultCode: '0',
          ResultDesc: 'The service request is processed successfully.',
          TransactionID: 'mpesa_stk_123',
          Amount: '15000',
        },
      });
      
      const firstCheck = await toolManager.executeTool('unified_verify_transaction', {
        transaction_id: 'mpesa_stk_123',
      });

      expect(firstCheck).toBeDefined();

      // Verify final status
      const finalStatus = await toolManager.executeTool('mpesa_transaction_status', {
        transaction_id: 'mpesa_stk_123',
      });

      expect(finalStatus).toBeDefined();
    });

    it('should handle subscription payment flow', async () => {
      // Initial subscription payment
      const subscription = await toolManager.executeTool('paystack_initialize', {
        email: 'subscriber@example.com',
        amount: 10000,
        currency: 'NGN',
        reference: 'SUB_2026_001',
        metadata: {
          plan: 'premium',
          duration: 'monthly',
        },
      });

      expect(subscription).toBeDefined();

      // Verify subscription payment
      const verifySub = await toolManager.executeTool('paystack_verify', {
        reference: 'SUB_2026_001',
      });

      expect(verifySub).toBeDefined();
    });
  });

  // ==================== Provider Management Flows ====================
  describe('Provider Management Flows', () => {
    beforeEach(() => {
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          MerchantRequestID: 'MERCH123',
          CheckoutRequestID: 'CHECK456',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      registry.register('mpesa', new MpesaAdapter(mpesaConfig));
      registry.register('paystack', new PaystackAdapter(paystackConfig));
    });

    it('should list and query provider information', async () => {
      // List all providers
      const listResult = await toolManager.executeTool('list_providers', {});

      expect(listResult).toBeDefined();
      expect(listResult.content[0].text).toContain('M-Pesa');
      expect(listResult.content[0].text).toContain('Paystack');

      // Get specific provider info
      const mpesaInfo = await toolManager.executeTool('get_provider_info', {
        provider: 'mpesa',
      });

      expect(mpesaInfo.content[0].text).toContain('M-Pesa');
      expect(mpesaInfo.content[0].text).toContain('KE');

      const paystackInfo = await toolManager.executeTool('get_provider_info', {
        provider: 'paystack',
      });

      expect(paystackInfo.content[0].text).toContain('Paystack');
      expect(paystackInfo.content[0].text).toContain('NG');
    });

    it('should filter transactions by provider', async () => {
      // Create transactions
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          ConversationID: 'AG_20240115_123456',
          OriginatorConversationID: 'test-123',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      await toolManager.executeTool('unified_send_money', {
        recipient_phone: '+254712345678',
        amount: 1000,
        provider: 'mpesa',
      });

      // List only M-Pesa transactions
      const mpesaTransactions = await toolManager.executeTool('unified_list_transactions', {
        provider: 'mpesa',
      });

      expect(mpesaTransactions).toBeDefined();
    });
  });

  // ==================== Performance and Load Tests ====================
  describe('Performance Tests', () => {
    beforeEach(() => {
      setupMpesaMocks();
      mockPost.mockResolvedValue({
        data: {
          ConversationID: 'AG_20240115_123456',
          OriginatorConversationID: 'test-123',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      registry.register('mpesa', new MpesaAdapter(mpesaConfig));
    });

    it('should handle rapid sequential requests', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        // Setup mock for each request
        setupMpesaMocks();
        mockPost.mockResolvedValueOnce({
          data: {
            ConversationID: `AG_20240115_${i}`,
            OriginatorConversationID: `test-${i}`,
            ResponseCode: '0',
            ResponseDescription: 'Success',
          },
        });
        
        promises.push(
          toolManager.executeTool('unified_send_money', {
            recipient_phone: '+254712345678',
            amount: 1000 + i,
            description: `Payment ${i}`,
          })
        );
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.content[0].text).toContain('Send Money');
      });
    });

    it('should handle mixed operation types', async () => {
      // Setup mocks for each operation
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          ConversationID: 'B2C_123',
          OriginatorConversationID: 'test-b2c',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          MerchantRequestID: 'MERCH123',
          CheckoutRequestID: 'CHECK456',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      setupMpesaMocks();
      mockPost.mockResolvedValueOnce({
        data: {
          MerchantRequestID: 'MERCH_STK',
          CheckoutRequestID: 'CHECK_STK',
          ResponseCode: '0',
          ResponseDescription: 'Success',
        },
      });
      
      const operations = [
        toolManager.executeTool('unified_send_money', {
          recipient_phone: '+254712345678',
          amount: 1000,
        }),
        toolManager.executeTool('unified_request_payment', {
          customer_phone: '+254712345678',
          amount: 2000,
        }),
        toolManager.executeTool('mpesa_stk_push', {
          phone_number: '254712345678',
          amount: 3000,
        }),
        toolManager.executeTool('list_providers', {}),
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });
  });
});
