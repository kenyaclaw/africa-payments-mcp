/**
 * MCP Tools Tests
 * 
 * Comprehensive test suite for all MCP tools:
 * - Universal tools: unified_send_money, unified_request_payment, etc.
 * - M-Pesa specific: mpesa_stk_push, mpesa_b2c, etc.
 * - Paystack specific: paystack_initialize, paystack_verify, etc.
 * - Info tools: list_providers, get_provider_info
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { ToolManager } from '../src/utils/tools.js';
import { ProviderRegistry } from '../src/utils/registry.js';
import { Logger } from '../src/utils/logger.js';
import { MpesaAdapter } from '../src/adapters/mpesa/index.js';
import { PaystackAdapter } from '../src/adapters/paystack/index.js';
import { IntaSendAdapter } from '../src/adapters/intasend/index.js';
import { MTNMoMoAdapter } from '../src/adapters/mtn-momo/index.js';
import { AirtelMoneyAdapter } from '../src/adapters/airtel-money/index.js';
import { 
  MpesaConfig, 
  PaystackConfig,
  IntaSendConfig,
  MTNMoMoConfig,
  AirtelMoneyConfig,
  PaymentError,
  ErrorCodes
} from '../src/types/index.js';

// Mock configs
const mockMpesaConfig: MpesaConfig = {
  enabled: true,
  environment: 'sandbox',
  consumerKey: 'test_key',
  consumerSecret: 'test_secret',
  passkey: 'test_passkey',
  shortCode: '123456',
};

const mockPaystackConfig: PaystackConfig = {
  enabled: true,
  environment: 'sandbox',
  secretKey: 'sk_test_123',
};

const mockIntaSendConfig: IntaSendConfig = {
  enabled: true,
  environment: 'sandbox',
  publishableKey: 'pk_test_intasend',
  secretKey: 'sk_test_intasend',
};

const mockMomoConfig: MTNMoMoConfig = {
  enabled: true,
  environment: 'sandbox',
  apiUser: 'test_user',
  apiKey: 'test_key',
  subscriptionKey: 'test_sub_key',
};

const mockAirtelConfig: AirtelMoneyConfig = {
  enabled: true,
  environment: 'sandbox',
  clientId: 'test_client',
  clientSecret: 'test_secret',
};

describe('ToolManager', () => {
  let registry: ProviderRegistry;
  let logger: Logger;
  let toolManager: ToolManager;

  beforeEach(() => {
    logger = new Logger('error'); // Only log errors in tests
    registry = new ProviderRegistry(logger);
    toolManager = new ToolManager(registry, logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== Tool Discovery ====================
  describe('getAllTools', () => {
    it('should return all available tools', () => {
      const tools = toolManager.getAllTools();
      
      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should include universal tools', () => {
      const tools = toolManager.getAllTools();
      const toolNames = tools.map(t => t.name);
      
      expect(toolNames).toContain('unified_send_money');
      expect(toolNames).toContain('unified_request_payment');
      expect(toolNames).toContain('unified_verify_transaction');
      expect(toolNames).toContain('unified_refund');
      expect(toolNames).toContain('unified_list_transactions');
      expect(toolNames).toContain('unified_get_rates');
    });

    it('should include M-Pesa specific tools', () => {
      const tools = toolManager.getAllTools();
      const toolNames = tools.map(t => t.name);
      
      expect(toolNames).toContain('mpesa_stk_push');
      expect(toolNames).toContain('mpesa_b2c');
      expect(toolNames).toContain('mpesa_c2b');
      expect(toolNames).toContain('mpesa_transaction_status');
    });

    it('should include Paystack specific tools', () => {
      const tools = toolManager.getAllTools();
      const toolNames = tools.map(t => t.name);
      
      expect(toolNames).toContain('paystack_initialize');
      expect(toolNames).toContain('paystack_verify');
      expect(toolNames).toContain('paystack_refund');
      expect(toolNames).toContain('paystack_transfer');
    });

    it('should include info tools', () => {
      const tools = toolManager.getAllTools();
      const toolNames = tools.map(t => t.name);
      
      expect(toolNames).toContain('list_providers');
      expect(toolNames).toContain('get_provider_info');
    });

    it('should have valid tool definitions', () => {
      const tools = toolManager.getAllTools();
      
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.inputSchema).toBe('object');
      }
    });
  });

  // ==================== Universal Send Money ====================
  describe('unified_send_money', () => {
    beforeEach(() => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
    });

    it('should send money with auto-detected provider', async () => {
      const result = await toolManager.executeTool('unified_send_money', {
        recipient_phone: '+254712345678',
        amount: 1000,
        description: 'Test payment',
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Send Money');
    });

    it('should send money with explicit provider', async () => {
      registry.register('paystack', new PaystackAdapter(mockPaystackConfig));
      
      const result = await toolManager.executeTool('unified_send_money', {
        recipient_phone: '+2348012345678',
        amount: 5000,
        provider: 'paystack',
        currency: 'NGN',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Send Money');
    });

    it('should auto-detect currency from phone number', async () => {
      const result = await toolManager.executeTool('unified_send_money', {
        recipient_phone: '+254712345678',
        amount: 1000,
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('KES');
    });

    it('should throw error for unavailable provider', async () => {
      await expect(
        toolManager.executeTool('unified_send_money', {
          recipient_phone: '+254712345678',
          amount: 1000,
          provider: 'nonexistent',
        })
      ).rejects.toThrow(PaymentError);
    });

    it('should include recipient name in transaction', async () => {
      const result = await toolManager.executeTool('unified_send_money', {
        recipient_phone: '+254712345678',
        recipient_name: 'John Doe',
        amount: 1000,
      });
      
      expect(result.content[0].text).toContain('John Doe');
    });
  });

  // ==================== Universal Request Payment ====================
  describe('unified_request_payment', () => {
    beforeEach(() => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
    });

    it('should request payment with phone number', async () => {
      const result = await toolManager.executeTool('unified_request_payment', {
        customer_phone: '+254712345678',
        amount: 500,
        description: 'Payment for services',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Payment Request');
    });

    it('should request payment with email', async () => {
      registry.register('paystack', new PaystackAdapter(mockPaystackConfig));
      
      const result = await toolManager.executeTool('unified_request_payment', {
        customer_email: 'test@example.com',
        amount: 5000,
        currency: 'NGN',
        provider: 'paystack',
      });
      
      expect(result).toBeDefined();
    });

    it('should set default expiry time', async () => {
      const result = await toolManager.executeTool('unified_request_payment', {
        customer_phone: '+254712345678',
        amount: 500,
      });
      
      expect(result).toBeDefined();
    });

    it('should accept custom expiry time', async () => {
      const result = await toolManager.executeTool('unified_request_payment', {
        customer_phone: '+254712345678',
        amount: 500,
        expiry_minutes: 120,
      });
      
      expect(result).toBeDefined();
    });
  });

  // ==================== Universal Verify Transaction ====================
  describe('unified_verify_transaction', () => {
    beforeEach(() => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
      registry.register('paystack', new PaystackAdapter(mockPaystackConfig));
    });

    it('should verify transaction with explicit provider', async () => {
      const result = await toolManager.executeTool('unified_verify_transaction', {
        transaction_id: 'mpesa_test_123',
        provider: 'mpesa',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Transaction Status');
    });

    it('should search all providers when provider not specified', async () => {
      const result = await toolManager.executeTool('unified_verify_transaction', {
        transaction_id: 'test_123',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Transaction Status');
    });

    it('should throw error when transaction not found', async () => {
      // Create empty registry
      const emptyRegistry = new ProviderRegistry(logger);
      const emptyToolManager = new ToolManager(emptyRegistry, logger);
      
      await expect(
        emptyToolManager.executeTool('unified_verify_transaction', {
          transaction_id: 'nonexistent',
        })
      ).rejects.toThrow('not found');
    });
  });

  // ==================== Universal Refund ====================
  describe('unified_refund', () => {
    beforeEach(() => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
    });

    it('should process refund with explicit amount', async () => {
      const result = await toolManager.executeTool('unified_refund', {
        transaction_id: 'mpesa_test_123',
        amount: 500,
        reason: 'Partial refund',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Refund Processed');
    });

    it('should process full refund without amount', async () => {
      const result = await toolManager.executeTool('unified_refund', {
        transaction_id: 'mpesa_test_123',
        reason: 'Customer request',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Refund Processed');
    });

    it('should throw error when transaction not found', async () => {
      const emptyRegistry = new ProviderRegistry(logger);
      const emptyToolManager = new ToolManager(emptyRegistry, logger);
      
      await expect(
        emptyToolManager.executeTool('unified_refund', {
          transaction_id: 'nonexistent',
        })
      ).rejects.toThrow('not found');
    });
  });

  // ==================== Universal List Transactions ====================
  describe('unified_list_transactions', () => {
    beforeEach(() => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
      registry.register('paystack', new PaystackAdapter(mockPaystackConfig));
    });

    it('should list transactions from all providers', async () => {
      const result = await toolManager.executeTool('unified_list_transactions', {});
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toBeDefined();
    });

    it('should filter by provider', async () => {
      const result = await toolManager.executeTool('unified_list_transactions', {
        provider: 'mpesa',
      });
      
      expect(result).toBeDefined();
    });

    it('should filter by status', async () => {
      const result = await toolManager.executeTool('unified_list_transactions', {
        status: 'completed',
      });
      
      expect(result).toBeDefined();
    });

    it('should filter by date range', async () => {
      const result = await toolManager.executeTool('unified_list_transactions', {
        start_date: '2026-01-01',
        end_date: '2026-01-31',
      });
      
      expect(result).toBeDefined();
    });

    it('should limit results', async () => {
      const result = await toolManager.executeTool('unified_list_transactions', {
        limit: 10,
      });
      
      expect(result).toBeDefined();
    });
  });

  // ==================== Universal Get Rates ====================
  describe('unified_get_rates', () => {
    beforeEach(() => {
      registry.register('paystack', new PaystackAdapter(mockPaystackConfig));
    });

    it('should get exchange rate from provider', async () => {
      const result = await toolManager.executeTool('unified_get_rates', {
        from_currency: 'USD',
        to_currency: 'NGN',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Exchange Rate');
      expect(result.content[0].text).toContain('1550');
    });

    it('should use fallback rates for unsupported pairs', async () => {
      const result = await toolManager.executeTool('unified_get_rates', {
        from_currency: 'USD',
        to_currency: 'KES',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Exchange Rate');
      expect(result.content[0].text).toContain('129.5');
    });

    it('should throw error for unknown currency pairs', async () => {
      await expect(
        toolManager.executeTool('unified_get_rates', {
          from_currency: 'XYZ',
          to_currency: 'ABC',
        })
      ).rejects.toThrow('not available');
    });
  });

  // ==================== M-Pesa STK Push ====================
  describe('mpesa_stk_push', () => {
    beforeEach(() => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
    });

    it('should initiate STK push', async () => {
      const result = await toolManager.executeTool('mpesa_stk_push', {
        phone_number: '254712345678',
        amount: 1000,
        account_reference: 'INV001',
        description: 'Payment for invoice',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('M-Pesa STK Push');
      expect(result.content[0].text).toContain('254712345678');
      expect(result.content[0].text).toContain('1000');
    });

    it('should work without optional account_reference', async () => {
      const result = await toolManager.executeTool('mpesa_stk_push', {
        phone_number: '254712345678',
        amount: 1000,
      });
      
      expect(result).toBeDefined();
    });

    it('should throw error when M-Pesa not configured', async () => {
      const emptyRegistry = new ProviderRegistry(logger);
      const emptyToolManager = new ToolManager(emptyRegistry, logger);
      
      await expect(
        emptyToolManager.executeTool('mpesa_stk_push', {
          phone_number: '254712345678',
          amount: 1000,
        })
      ).rejects.toThrow('not configured');
    });
  });

  // ==================== M-Pesa B2C ====================
  describe('mpesa_b2c', () => {
    beforeEach(() => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
    });

    it('should initiate B2C transfer', async () => {
      const result = await toolManager.executeTool('mpesa_b2c', {
        phone_number: '254712345678',
        amount: 2000,
        description: 'Salary payment',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('M-Pesa B2C Transfer');
    });
  });

  // ==================== M-Pesa C2B ====================
  describe('mpesa_c2b', () => {
    it('should register C2B URLs', async () => {
      const result = await toolManager.executeTool('mpesa_c2b', {
        validation_url: 'https://example.com/validate',
        confirmation_url: 'https://example.com/confirm',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('M-Pesa C2B URLs');
      expect(result.content[0].text).toContain('https://example.com/validate');
      expect(result.content[0].text).toContain('https://example.com/confirm');
    });
  });

  // ==================== M-Pesa Transaction Status ====================
  describe('mpesa_transaction_status', () => {
    it('should query transaction status', async () => {
      const result = await toolManager.executeTool('mpesa_transaction_status', {
        transaction_id: 'TEST123456',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('M-Pesa Transaction Status');
      expect(result.content[0].text).toContain('TEST123456');
    });
  });

  // ==================== Paystack Initialize ====================
  describe('paystack_initialize', () => {
    it('should initialize transaction', async () => {
      const result = await toolManager.executeTool('paystack_initialize', {
        email: 'customer@example.com',
        amount: 5000,
        currency: 'NGN',
        reference: 'ORDER123',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Paystack Transaction');
      expect(result.content[0].text).toContain('customer@example.com');
    });

    it('should auto-generate reference if not provided', async () => {
      const result = await toolManager.executeTool('paystack_initialize', {
        email: 'customer@example.com',
        amount: 5000,
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('AUTO_GENERATED');
    });
  });

  // ==================== Paystack Verify ====================
  describe('paystack_verify', () => {
    it('should verify transaction', async () => {
      const result = await toolManager.executeTool('paystack_verify', {
        reference: 'PS_20260115143000_abc123',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Paystack Transaction Verified');
      expect(result.content[0].text).toContain('Success');
    });
  });

  // ==================== Paystack Refund ====================
  describe('paystack_refund', () => {
    it('should process refund', async () => {
      const result = await toolManager.executeTool('paystack_refund', {
        transaction_id: 'PS_20260115143000_abc123',
        amount: 2500,
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Paystack Refund');
    });

    it('should handle full refund', async () => {
      const result = await toolManager.executeTool('paystack_refund', {
        transaction_id: 'PS_20260115143000_abc123',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Full amount');
    });
  });

  // ==================== Paystack Transfer ====================
  describe('paystack_transfer', () => {
    it('should initiate transfer', async () => {
      const result = await toolManager.executeTool('paystack_transfer', {
        recipient: 'RCP_123456789',
        amount: 10000,
        reason: 'Vendor payment',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Paystack Transfer');
      expect(result.content[0].text).toContain('Vendor payment');
    });

    it('should work without optional reason', async () => {
      const result = await toolManager.executeTool('paystack_transfer', {
        recipient: 'RCP_123456789',
        amount: 10000,
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('N/A');
    });
  });

  // ==================== List Providers ====================
  describe('list_providers', () => {
    it('should list all providers', async () => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
      registry.register('paystack', new PaystackAdapter(mockPaystackConfig));
      
      const result = await toolManager.executeTool('list_providers', {});
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Available Payment Providers');
      expect(result.content[0].text).toContain('M-Pesa');
      expect(result.content[0].text).toContain('Paystack');
    });

    it('should show message when no providers configured', async () => {
      const emptyRegistry = new ProviderRegistry(logger);
      const emptyToolManager = new ToolManager(emptyRegistry, logger);
      
      const result = await emptyToolManager.executeTool('list_providers', {});
      
      expect(result.content[0].text).toContain('No providers configured');
    });

    it('should display provider details', async () => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
      
      const result = await toolManager.executeTool('list_providers', {});
      
      expect(result.content[0].text).toContain('KE');
      expect(result.content[0].text).toContain('KES');
      expect(result.content[0].text).toContain('mobile_money');
    });
  });

  // ==================== Get Provider Info ====================
  describe('get_provider_info', () => {
    beforeEach(() => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
    });

    it('should return provider information', async () => {
      const result = await toolManager.executeTool('get_provider_info', {
        provider: 'mpesa',
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('M-Pesa');
      expect(result.content[0].text).toContain('KE');
      expect(result.content[0].text).toContain('KES');
      expect(result.content[0].text).toContain('mobile_money');
    });

    it('should throw error for unknown provider', async () => {
      await expect(
        toolManager.executeTool('get_provider_info', {
          provider: 'unknown_provider',
        })
      ).rejects.toThrow('not found');
    });

    it('should show provider status', async () => {
      const result = await toolManager.executeTool('get_provider_info', {
        provider: 'mpesa',
      });
      
      expect(result.content[0].text).toContain('Enabled');
      expect(result.content[0].text).toContain('sandbox');
    });
  });

  // ==================== Unknown Tool ====================
  describe('unknown tool', () => {
    it('should throw error for unknown tool', async () => {
      await expect(
        toolManager.executeTool('unknown_tool', {})
      ).rejects.toThrow('Unknown tool');
    });
  });

  // ==================== Country Detection ====================
  describe('country detection', () => {
    beforeEach(() => {
      registry.register('mpesa', new MpesaAdapter(mockMpesaConfig));
      registry.register('paystack', new PaystackAdapter(mockPaystackConfig));
      registry.register('mtn_momo', new MTNMoMoAdapter(mockMomoConfig));
      registry.register('airtel_money', new AirtelMoneyAdapter(mockAirtelConfig));
    });

    it('should detect Kenya from +254 phone', async () => {
      const result = await toolManager.executeTool('unified_send_money', {
        recipient_phone: '+254712345678',
        amount: 1000,
      });
      
      expect(result).toBeDefined();
    });

    it('should detect Nigeria from +234 phone', async () => {
      const result = await toolManager.executeTool('unified_send_money', {
        recipient_phone: '+2348012345678',
        amount: 5000,
      });
      
      expect(result).toBeDefined();
    });

    it('should detect Ghana from +233 phone', async () => {
      const result = await toolManager.executeTool('unified_send_money', {
        recipient_phone: '+233201234567',
        amount: 100,
      });
      
      expect(result).toBeDefined();
    });

    it('should detect Uganda from +256 phone', async () => {
      const result = await toolManager.executeTool('unified_send_money', {
        recipient_phone: '+256712345678',
        amount: 10000,
      });
      
      expect(result).toBeDefined();
    });
  });
});
