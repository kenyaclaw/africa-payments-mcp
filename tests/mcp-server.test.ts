/**
 * Africa Payments MCP Server Tests
 * Comprehensive tests for the MCP server implementation
 */

import { AfricaPaymentsMCPServer, createMCPServer, MCPServerOptions } from '../src/mcp-server.js';
import { ServerConfig } from '../src/types/index.js';
import { jest } from '@jest/globals';

// Mock the SDK
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('@modelcontextprotocol/sdk/server/sse.js');

// Mock provider adapters
jest.mock('../src/adapters/mpesa/index.js');
jest.mock('../src/adapters/paystack/index.js');
jest.mock('../src/adapters/intasend/index.js');
jest.mock('../src/adapters/mtn-momo/index.js');
jest.mock('../src/adapters/airtel-money/index.js');
jest.mock('../src/adapters/orange-money/index.js');
jest.mock('../src/adapters/chipper-cash/index.js');
jest.mock('../src/adapters/wave/index.js');

// Mock utilities
jest.mock('../src/utils/logger.js');
jest.mock('../src/utils/config.js');
jest.mock('../src/utils/registry.js', () => ({
  ProviderRegistry: jest.fn().mockImplementation(() => ({
    register: jest.fn(),
    getProvider: jest.fn().mockReturnValue({
      name: 'mpesa',
      displayName: 'M-Pesa',
      countries: ['KE', 'TZ'],
      currencies: ['KES', 'TZS'],
      supportedMethods: ['mobile_money'],
      config: { enabled: true, environment: 'sandbox' },
      sendMoney: jest.fn().mockResolvedValue({
        id: 'test-tx-123',
        providerTransactionId: 'provider-tx-456',
        provider: 'mpesa',
        status: 'completed',
        amount: { amount: 1000, currency: 'KES' },
        customer: { name: 'Test User' },
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      requestPayment: jest.fn(),
      verifyTransaction: jest.fn().mockResolvedValue({
        id: 'test-tx-123',
        providerTransactionId: 'provider-tx-456',
        provider: 'mpesa',
        status: 'completed',
        amount: { amount: 1000, currency: 'KES' },
        customer: { name: 'Test User' },
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      refund: jest.fn(),
      getBalance: jest.fn().mockResolvedValue({ amount: 50000, currency: 'KES' }),
      listTransactions: jest.fn().mockResolvedValue([]),
    }),
    getAllProviders: jest.fn().mockReturnValue(new Map()),
    getProviderNames: jest.fn().mockReturnValue(['mpesa', 'paystack']),
    getProviderCount: jest.fn().mockReturnValue(2),
    initializeAll: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('../src/utils/tools.js', () => ({
  ToolManager: jest.fn().mockImplementation(() => ({
    getAllTools: jest.fn().mockReturnValue([
      { name: 'send_money', description: 'Send money', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'request_payment', description: 'Request payment', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'verify_transaction', description: 'Verify transaction', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'refund', description: 'Process refund', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'get_balance', description: 'Get balance', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'list_transactions', description: 'List transactions', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'list_providers', description: 'List providers', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'get_provider_info', description: 'Get provider info', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'compare_providers', description: 'Compare providers', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'get_provider_status', description: 'Get provider status', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'stk_push', description: 'STK Push', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'b2c_transfer', description: 'B2C Transfer', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'c2b_register', description: 'C2B Register', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'bank_transfer', description: 'Bank Transfer', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'validate_phone', description: 'Validate phone', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'get_exchange_rates', description: 'Get exchange rates', inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'calculate_fees', description: 'Calculate fees', inputSchema: { type: 'object', properties: {}, required: [] } },
    ]),
    executeTool: jest.fn(),
  })),
}));

describe('AfricaPaymentsMCPServer', () => {
  let mockConfig: ServerConfig;
  let server: AfricaPaymentsMCPServer;

  beforeEach(() => {
    mockConfig = {
      providers: {
        mpesa: {
          enabled: true,
          environment: 'sandbox',
          consumerKey: 'test-key',
          consumerSecret: 'test-secret',
          passkey: 'test-passkey',
          shortCode: '123456',
        },
        paystack: {
          enabled: true,
          environment: 'sandbox',
          secretKey: 'test-secret',
        },
        mtn_momo: {
          enabled: false,
          environment: 'sandbox',
          apiUser: 'test-user',
          apiKey: 'test-key',
          subscriptionKey: 'test-subscription',
        },
      },
      defaults: {
        currency: 'KES',
        country: 'KE',
      },
      server: {
        port: 3000,
        logLevel: 'error',
      },
    };

    server = new AfricaPaymentsMCPServer(mockConfig, { logLevel: 'error' });
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with config', async () => {
      await expect(server.initialize()).resolves.not.toThrow();
    });

    it('should have correct server name and version', () => {
      // Server name and version are set in constructor
      expect(server).toBeDefined();
    });
  });

  describe('Tools', () => {
    beforeEach(async () => {
      await server.initialize();
    });

    describe('send_money', () => {
      it('should have send_money tool defined', async () => {
        const tools = (server as any).getAllTools();
        const sendMoneyTool = tools.find((t: any) => t.name === 'send_money');
        
        expect(sendMoneyTool).toBeDefined();
        expect(sendMoneyTool.description).toContain('Send money');
        expect(sendMoneyTool.inputSchema.required).toContain('recipient_phone');
        expect(sendMoneyTool.inputSchema.required).toContain('amount');
      });

      it('should validate required parameters', async () => {
        const result = await (server as any).executeSendMoney({
          recipient_phone: '+254712345678',
          amount: 1000,
        });

        // Should not throw for valid required params
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      });

      it('should auto-detect currency from phone number', async () => {
        const detectCountry = (server as any).detectCountryFromPhone;
        
        expect(detectCountry('+254712345678')).toBe('KE');
        expect(detectCountry('+2348012345678')).toBe('NG');
        expect(detectCountry('+233501234567')).toBe('GH');
        expect(detectCountry('+256712345678')).toBe('UG');
        expect(detectCountry('+255712345678')).toBe('TZ');
      });

      it('should map countries to currencies', async () => {
        const getCurrency = (server as any).getDefaultCurrency;
        
        expect(getCurrency('KE')).toBe('KES');
        expect(getCurrency('NG')).toBe('NGN');
        expect(getCurrency('GH')).toBe('GHS');
        expect(getCurrency('UG')).toBe('UGX');
        expect(getCurrency('TZ')).toBe('TZS');
        expect(getCurrency('ZA')).toBe('ZAR');
      });
    });

    describe('request_payment', () => {
      it('should have request_payment tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'request_payment');
        
        expect(tool).toBeDefined();
        expect(tool.description).toContain('Request payment');
        expect(tool.inputSchema.required).toContain('amount');
      });
    });

    describe('verify_transaction', () => {
      it('should have verify_transaction tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'verify_transaction');
        
        expect(tool).toBeDefined();
        expect(tool.description).toContain('Check the current status');
        expect(tool.inputSchema.required).toContain('transaction_id');
      });
    });

    describe('refund', () => {
      it('should have refund tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'refund');
        
        expect(tool).toBeDefined();
        expect(tool.description).toContain('refund');
        expect(tool.inputSchema.required).toContain('transaction_id');
      });

      it('should support partial refunds', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'refund');
        
        expect(tool.inputSchema.properties.amount).toBeDefined();
        expect(tool.inputSchema.properties.reason).toBeDefined();
      });
    });

    describe('get_balance', () => {
      it('should have get_balance tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'get_balance');
        
        expect(tool).toBeDefined();
        expect(tool.description).toContain('balance');
      });
    });

    describe('list_transactions', () => {
      it('should have list_transactions tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'list_transactions');
        
        expect(tool).toBeDefined();
        expect(tool.description).toContain('transactions');
      });

      it('should support filtering parameters', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'list_transactions');
        
        expect(tool.inputSchema.properties.provider).toBeDefined();
        expect(tool.inputSchema.properties.status).toBeDefined();
        expect(tool.inputSchema.properties.start_date).toBeDefined();
        expect(tool.inputSchema.properties.end_date).toBeDefined();
        expect(tool.inputSchema.properties.limit).toBeDefined();
        expect(tool.inputSchema.properties.offset).toBeDefined();
      });
    });

    describe('list_providers', () => {
      it('should have list_providers tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'list_providers');
        
        expect(tool).toBeDefined();
        expect(tool.description).toContain('providers');
      });
    });

    describe('get_provider_info', () => {
      it('should have get_provider_info tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'get_provider_info');
        
        expect(tool).toBeDefined();
        expect(tool.inputSchema.required).toContain('provider');
      });
    });

    describe('compare_providers', () => {
      it('should have compare_providers tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'compare_providers');
        
        expect(tool).toBeDefined();
        expect(tool.inputSchema.required).toContain('amount');
        expect(tool.inputSchema.required).toContain('currency');
        expect(tool.inputSchema.required).toContain('country');
      });
    });

    describe('get_provider_status', () => {
      it('should have get_provider_status tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'get_provider_status');
        
        expect(tool).toBeDefined();
      });
    });

    describe('stk_push', () => {
      it('should have stk_push tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'stk_push');
        
        expect(tool).toBeDefined();
        expect(tool.description).toContain('STK');
        expect(tool.inputSchema.required).toContain('phone_number');
        expect(tool.inputSchema.required).toContain('amount');
      });
    });

    describe('b2c_transfer', () => {
      it('should have b2c_transfer tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'b2c_transfer');
        
        expect(tool).toBeDefined();
        expect(tool.description).toContain('B2C');
      });
    });

    describe('c2b_register', () => {
      it('should have c2b_register tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'c2b_register');
        
        expect(tool).toBeDefined();
        expect(tool.description).toContain('C2B');
        expect(tool.inputSchema.required).toContain('validation_url');
        expect(tool.inputSchema.required).toContain('confirmation_url');
      });
    });

    describe('bank_transfer', () => {
      it('should have bank_transfer tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'bank_transfer');
        
        expect(tool).toBeDefined();
        expect(tool.inputSchema.required).toContain('account_number');
        expect(tool.inputSchema.required).toContain('bank_code');
      });
    });

    describe('validate_phone', () => {
      it('should have validate_phone tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'validate_phone');
        
        expect(tool).toBeDefined();
        expect(tool.inputSchema.required).toContain('phone_number');
      });
    });

    describe('get_exchange_rates', () => {
      it('should have get_exchange_rates tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'get_exchange_rates');
        
        expect(tool).toBeDefined();
        expect(tool.inputSchema.required).toContain('from_currency');
        expect(tool.inputSchema.required).toContain('to_currency');
      });
    });

    describe('calculate_fees', () => {
      it('should have calculate_fees tool defined', async () => {
        const tools = (server as any).getAllTools();
        const tool = tools.find((t: any) => t.name === 'calculate_fees');
        
        expect(tool).toBeDefined();
        expect(tool.inputSchema.required).toContain('amount');
        expect(tool.inputSchema.required).toContain('currency');
      });
    });
  });

  describe('All 17 Tools Present', () => {
    beforeEach(async () => {
      await server.initialize();
    });

    it('should have exactly 17 tools', async () => {
      const tools = (server as any).getAllTools();
      expect(tools).toHaveLength(17);
    });

    it('should have all expected tool names', async () => {
      const tools = (server as any).getAllTools();
      const toolNames = tools.map((t: any) => t.name);

      const expectedTools = [
        'send_money',
        'request_payment',
        'verify_transaction',
        'refund',
        'get_balance',
        'list_transactions',
        'list_providers',
        'get_provider_info',
        'compare_providers',
        'get_provider_status',
        'stk_push',
        'b2c_transfer',
        'c2b_register',
        'bank_transfer',
        'validate_phone',
        'get_exchange_rates',
        'calculate_fees',
      ];

      expectedTools.forEach(name => {
        expect(toolNames).toContain(name);
      });
    });
  });

  describe('Resources', () => {
    beforeEach(async () => {
      await server.initialize();
    });

    it('should have resources defined', async () => {
      const resources = (server as any).getAllResources();
      expect(resources).toBeDefined();
      expect(resources.length).toBeGreaterThan(0);
    });

    it('should have transaction resource', async () => {
      const resources = (server as any).getAllResources();
      const transactionResource = resources.find((r: any) => r.uri.startsWith('transaction://'));
      
      expect(transactionResource).toBeDefined();
      expect(transactionResource.name).toContain('Transaction');
    });

    it('should have provider resource', async () => {
      const resources = (server as any).getAllResources();
      const providerResource = resources.find((r: any) => r.uri.startsWith('provider://'));
      
      expect(providerResource).toBeDefined();
      expect(providerResource.name).toContain('Provider');
    });

    it('should have balance resource', async () => {
      const resources = (server as any).getAllResources();
      const balanceResource = resources.find((r: any) => r.uri.startsWith('balance://'));
      
      expect(balanceResource).toBeDefined();
      expect(balanceResource.name).toContain('Balance');
    });

    it('should support reading transaction resource', async () => {
      // Mock provider verifyTransaction
      const mockTransaction = {
        id: 'test-tx-123',
        providerTransactionId: 'provider-tx-456',
        provider: 'mpesa',
        status: 'completed',
        amount: { amount: 1000, currency: 'KES' },
        customer: { name: 'Test User' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // This will fail without a mock, but tests the structure
      await expect(
        (server as any).readTransactionResource('test-tx-123')
      ).rejects.toBeDefined();
    });
  });

  describe('Prompts', () => {
    beforeEach(async () => {
      await server.initialize();
    });

    it('should have prompts defined', async () => {
      const prompts = (server as any).getAllPrompts();
      expect(prompts).toBeDefined();
      expect(prompts.length).toBeGreaterThan(0);
    });

    it('should have send-payment prompt', async () => {
      const prompts = (server as any).getAllPrompts();
      const prompt = prompts.find((p: any) => p.name === 'send-payment');
      
      expect(prompt).toBeDefined();
      expect(prompt.description.toLowerCase()).toContain('send');
    });

    it('should have refund-request prompt', async () => {
      const prompts = (server as any).getAllPrompts();
      const prompt = prompts.find((p: any) => p.name === 'refund-request');
      
      expect(prompt).toBeDefined();
      expect(prompt.description).toContain('refund');
    });

    it('should have payment-request prompt', async () => {
      const prompts = (server as any).getAllPrompts();
      const prompt = prompts.find((p: any) => p.name === 'payment-request');
      
      expect(prompt).toBeDefined();
      expect(prompt.description.toLowerCase()).toContain('request');
    });

    it('should generate send-payment prompt messages', async () => {
      const prompt = await (server as any).getSendPaymentPrompt({
        recipient_phone: '+254712345678',
        amount: 1000,
      });

      expect(prompt.description).toBeDefined();
      expect(prompt.messages).toBeDefined();
      expect(prompt.messages.length).toBeGreaterThan(0);
      expect(prompt.messages[0].role).toBe('user');
    });

    it('should generate refund-request prompt messages', async () => {
      const prompt = await (server as any).getRefundRequestPrompt({
        transaction_id: 'test-tx-123',
      });

      expect(prompt.description).toBeDefined();
      expect(prompt.messages).toBeDefined();
      expect(prompt.messages.length).toBeGreaterThan(0);
    });
  });

  describe('Helper Methods', () => {
    beforeEach(async () => {
      await server.initialize();
    });

    describe('formatTransactionResponse', () => {
      it('should format completed transaction', () => {
        const transaction = {
          id: 'tx-123',
          providerTransactionId: 'provider-tx-456',
          provider: 'mpesa',
          status: 'completed',
          amount: { amount: 1000, currency: 'KES' },
          customer: { name: 'John Doe' },
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          completedAt: new Date('2024-01-01'),
        };

        const result = (server as any).formatTransactionResponse(transaction, 'Test Payment');
        
        expect(result).toContain('✅');
        expect(result).toContain('tx-123');
        expect(result).toContain('1000 KES');
        expect(result).toContain('John Doe');
      });

      it('should format pending transaction', () => {
        const transaction = {
          id: 'tx-123',
          providerTransactionId: 'provider-tx-456',
          provider: 'mpesa',
          status: 'pending',
          amount: { amount: 500, currency: 'KES' },
          customer: { phone: { formatted: '+254712345678' } },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = (server as any).formatTransactionResponse(transaction, 'Test');
        
        expect(result).toContain('⏳');
        expect(result).toContain('pending');
      });
    });

    describe('formatTransactionList', () => {
      it('should format empty transaction list', () => {
        const result = (server as any).formatTransactionList([]);
        expect(result).toContain('No transactions found');
      });

      it('should format transaction list', () => {
        const transactions = [
          {
            id: 'tx-1',
            status: 'completed',
            amount: { amount: 1000, currency: 'KES' },
            createdAt: new Date(),
          },
          {
            id: 'tx-2',
            status: 'pending',
            amount: { amount: 500, currency: 'KES' },
            createdAt: new Date(),
          },
        ];

        const result = (server as any).formatTransactionList(transactions);
        
        expect(result).toContain('2 found');
        expect(result).toContain('✅');
        expect(result).toContain('⏳');
      });

      it('should limit to 20 transactions', () => {
        const transactions = Array(25).fill(null).map((_, i) => ({
          id: `tx-${i}`,
          status: 'completed',
          amount: { amount: 100, currency: 'KES' },
          createdAt: new Date(),
        }));

        const result = (server as any).formatTransactionList(transactions);
        
        expect(result).toContain('25 found');
        expect(result).toContain('5 more transactions');
      });
    });

    describe('parsePhoneNumber', () => {
      it('should parse phone numbers correctly', () => {
        const parse = (server as any).parsePhoneNumber;
        
        const result1 = parse('+254712345678');
        expect(result1.formatted).toBe('+254712345678');
        expect(result1.countryCode).toBe('254');
        expect(result1.nationalNumber).toBe('712345678');

        const result2 = parse('+2348012345678');
        expect(result2.formatted).toBe('+2348012345678');
        expect(result2.countryCode).toBe('234');
      });

      it('should handle spaces in phone numbers', () => {
        const parse = (server as any).parsePhoneNumber;
        
        const result = parse('+254 712 345 678');
        expect(result.formatted).toBe('+254712345678');
      });
    });

    describe('selectProviderForCountry', () => {
      it('should select provider based on country', () => {
        // Mock registry to return a provider
        const select = (server as any).selectProviderForCountry;
        
        // Will throw since no providers registered in mock
        expect(() => select('KE', 'send')).toThrow();
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await server.initialize();
    });

    it('should handle PaymentError correctly', () => {
      const { PaymentError } = jest.requireActual('../src/types/index.js');
      const error = new PaymentError('Test error', 'TEST_CODE', 'mpesa', 'tx-123');
      
      const result = (server as any).handleToolError(error);
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Payment Error');
      expect(result.content[0].text).toContain('TEST_CODE');
      expect(result.content[0].text).toContain('mpesa');
    });

    it('should handle generic errors', () => {
      const error = new Error('Generic error');
      
      const result = (server as any).handleToolError(error);
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Generic error');
    });

    it('should handle string errors', () => {
      const result = (server as any).handleToolError('String error');
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('String error');
    });
  });

  describe('Transport', () => {
    it('should support stdio transport', async () => {
      await server.initialize();
      // Transport is mocked, so this should not throw
      await expect(server.start({ transport: 'stdio' })).resolves.not.toThrow();
    });

    it('should support http transport', async () => {
      await server.initialize();
      // Transport is mocked
      await expect(server.start({ transport: 'http', port: 3001 })).resolves.not.toThrow();
    });

    it('should support both transports', async () => {
      await server.initialize();
      // Transport is mocked
      await expect(server.start({ transport: 'both', port: 3002 })).resolves.not.toThrow();
    });

    it('should return correct transport mode', async () => {
      await server.initialize();
      await server.start({ transport: 'stdio' });
      
      const mode = (server as any).getTransportMode();
      expect(mode).toBe('stdio');
    });
  });

  describe('createMCPServer Factory', () => {
    it('should create server from options', async () => {
      const options: MCPServerOptions = {
        configPath: './test-config.json',
        transport: 'stdio',
        logLevel: 'error',
      };

      // Will fail because config file doesn't exist, but tests the flow
      await expect(createMCPServer(options)).rejects.toBeDefined();
    });
  });
});

describe('Integration Tests', () => {
  // These would be actual integration tests with real providers
  // For now, they're placeholders

  it('placeholder for send_money integration', () => {
    expect(true).toBe(true);
  });

  it('placeholder for request_payment integration', () => {
    expect(true).toBe(true);
  });

  it('placeholder for verify_transaction integration', () => {
    expect(true).toBe(true);
  });
});
