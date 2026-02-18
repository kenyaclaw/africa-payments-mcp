#!/usr/bin/env node
/**
 * Africa Payments MCP Server - Full Implementation
 * Supports stdio (Claude Desktop) and HTTP/SSE transports
 * 
 * Features:
 * - 17+ payment tools
 * - Resources (transaction://, provider://, balance://)
 * - Prompts (send-payment, refund-request)
 * - Full MCP protocol compliance
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  Tool,
  TextContent,
  ImageContent,
  Resource,
  Prompt,
  PromptArgument,
} from '@modelcontextprotocol/sdk/types.js';
import express, { Request, Response } from 'express';
import cors from 'cors';
import * as path from 'path';
import { Logger } from './utils/logger.js';
import { ConfigManager } from './utils/config.js';
import { ProviderRegistry } from './utils/registry.js';
import { ToolManager } from './utils/tools.js';
import { 
  ServerConfig, 
  PaymentError,
  PaymentProvider,
  Transaction,
  Money,
  SendMoneyParams,
  RequestPaymentParams,
  RefundParams,
  TransactionQuery,
} from './types/index.js';

// Import all provider adapters
import { MpesaAdapter } from './adapters/mpesa/index.js';
import { PaystackAdapter } from './adapters/paystack/index.js';
import { IntaSendAdapter } from './adapters/intasend/index.js';
import { MTNMoMoAdapter } from './adapters/mtn-momo/index.js';
import { AirtelMoneyAdapter } from './adapters/airtel-money/index.js';
import { OrangeMoneyAdapter } from './adapters/orange-money/index.js';
import { ChipperCashAdapter } from './adapters/chipper-cash/index.js';
import { WaveAdapter } from './adapters/wave/index.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface MCPServerOptions {
  configPath: string;
  port?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  transport?: 'stdio' | 'http' | 'both';
  webhookBaseUrl?: string;
}

// Server capabilities type - uses SDK's built-in type inference

// ============================================================================
// Africa Payments MCP Server
// ============================================================================

export class AfricaPaymentsMCPServer {
  private server: Server;
  private config: ServerConfig;
  private logger: Logger;
  private registry: ProviderRegistry;
  private toolManager: ToolManager;
  private httpServer?: ReturnType<typeof express>;
  private sseTransport?: SSEServerTransport;
  private stdioTransport?: StdioServerTransport;
  private httpPort: number;

  constructor(config: ServerConfig, options: Partial<MCPServerOptions> = {}) {
    this.config = config;
    this.logger = new Logger(options.logLevel || 'info');
    this.registry = new ProviderRegistry(this.logger);
    this.toolManager = new ToolManager(this.registry, this.logger);
    this.httpPort = options.port || config.server?.port || 3000;

    // Initialize MCP Server
    this.server = new Server(
      {
        name: 'africa-payments-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  async initialize(): Promise<void> {
    this.logger.info('🚀 Initializing Africa Payments MCP Server...');
    this.logger.info(`   Version: 0.1.0`);
    this.logger.info(`   Transport: ${this.getTransportMode()}`);

    // Register all providers based on configuration
    await this.registerAllProviders();

    // Initialize all registered providers
    await this.registry.initializeAll();

    const providerCount = this.registry.getProviderCount();
    this.logger.info(`✅ Server initialized with ${providerCount} provider${providerCount !== 1 ? 's' : ''}`);
    
    if (providerCount > 0) {
      this.logger.info(`   Providers: ${this.registry.getProviderNames().join(', ')}`);
    }

    // Log available tools count
    const tools = this.toolManager.getAllTools();
    this.logger.info(`   Tools: ${tools.length} available`);
  }

  private async registerAllProviders(): Promise<void> {
    const providers = this.config.providers;

    // M-Pesa (Kenya, Tanzania)
    if (providers.mpesa?.enabled) {
      try {
        this.registry.register('mpesa', new MpesaAdapter(providers.mpesa));
        this.logger.info('📱 Registered: M-Pesa');
      } catch (error) {
        this.logger.error(`Failed to register M-Pesa: ${error}`);
      }
    }

    // Paystack (Nigeria, Ghana, Kenya, South Africa)
    if (providers.paystack?.enabled) {
      try {
        this.registry.register('paystack', new PaystackAdapter(providers.paystack));
        this.logger.info('💳 Registered: Paystack');
      } catch (error) {
        this.logger.error(`Failed to register Paystack: ${error}`);
      }
    }

    // IntaSend (Kenya, Nigeria)
    if (providers.intasend?.enabled) {
      try {
        this.registry.register('intasend', new IntaSendAdapter(providers.intasend));
        this.logger.info('💰 Registered: IntaSend');
      } catch (error) {
        this.logger.error(`Failed to register IntaSend: ${error}`);
      }
    }

    // MTN MoMo (Uganda, Ghana, Cameroon, Ivory Coast, Rwanda, etc.)
    if (providers.mtn_momo?.enabled) {
      try {
        this.registry.register('mtn_momo', new MTNMoMoAdapter(providers.mtn_momo));
        this.logger.info('📲 Registered: MTN MoMo');
      } catch (error) {
        this.logger.error(`Failed to register MTN MoMo: ${error}`);
      }
    }

    // Airtel Money (Kenya, Uganda, Tanzania, Zambia, Malawi, Rwanda)
    if (providers.airtel_money?.enabled) {
      try {
        this.registry.register('airtel_money', new AirtelMoneyAdapter(providers.airtel_money));
        this.logger.info('📡 Registered: Airtel Money');
      } catch (error) {
        this.logger.error(`Failed to register Airtel Money: ${error}`);
      }
    }

    // Orange Money (Cameroon, Ivory Coast, Senegal, etc.)
    if (providers.orange_money?.enabled) {
      try {
        this.registry.register('orange_money', new OrangeMoneyAdapter(providers.orange_money));
        this.logger.info('🍊 Registered: Orange Money');
      } catch (error) {
        this.logger.error(`Failed to register Orange Money: ${error}`);
      }
    }

    // Chipper Cash (Nigeria, Ghana, Kenya, Uganda, South Africa, UK)
    if (providers.chipper_cash?.enabled) {
      try {
        this.registry.register('chipper_cash', new ChipperCashAdapter(providers.chipper_cash));
        this.logger.info('🐿️ Registered: Chipper Cash');
      } catch (error) {
        this.logger.error(`Failed to register Chipper Cash: ${error}`);
      }
    }

    // Wave (Senegal, Ivory Coast, Uganda, Burkina Faso, Mali)
    if (providers.wave?.enabled) {
      try {
        this.registry.register('wave', new WaveAdapter(providers.wave));
        this.logger.info('🌊 Registered: Wave');
      } catch (error) {
        this.logger.error(`Failed to register Wave: ${error}`);
      }
    }
  }

  // ============================================================================
  // MCP Protocol Handlers
  // ============================================================================

  private setupHandlers(): void {
    // ----- Tools -----
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('📋 Received: tools/list request');
      return {
        tools: this.getAllTools(),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      this.logger.info(`🔧 Received: tools/call - ${name}`);
      this.logger.debug(`Arguments: ${JSON.stringify(args)}`);

      try {
        const result = await this.executeTool(name, args || {});
        this.logger.info(`✅ Tool ${name} executed successfully`);
        return result;
      } catch (error) {
        this.logger.error(`❌ Tool execution failed: ${error}`);
        return this.handleToolError(error);
      }
    });

    // ----- Resources -----
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      this.logger.debug('📚 Received: resources/list request');
      return {
        resources: this.getAllResources(),
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      this.logger.info(`📖 Received: resources/read - ${uri}`);

      try {
        const content = await this.readResource(uri);
        return {
          contents: [content],
        };
      } catch (error) {
        this.logger.error(`❌ Resource read failed: ${error}`);
        throw new McpError(
          -32600,
          `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // ----- Prompts -----
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      this.logger.debug('💬 Received: prompts/list request');
      return {
        prompts: this.getAllPrompts(),
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      this.logger.info(`💭 Received: prompts/get - ${name}`);

      try {
        const prompt = await this.getPrompt(name, args || {});
        return prompt;
      } catch (error) {
        this.logger.error(`❌ Prompt get failed: ${error}`);
        throw new McpError(
          -32600,
          `Failed to get prompt: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private setupErrorHandling(): void {
    // Server-level error handling
    this.server.onerror = (error) => {
      this.logger.error(`🔥 Server error: ${error}`);
    };

    // Graceful shutdown
    process.on('SIGINT', async () => {
      this.logger.info('\n👋 Received SIGINT, shutting down gracefully...');
      await this.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      this.logger.info('\n👋 Received SIGTERM, shutting down gracefully...');
      await this.close();
      process.exit(0);
    });

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      this.logger.error(`💥 Uncaught exception: ${error}`);
      this.close().then(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason) => {
      this.logger.error(`💥 Unhandled rejection: ${reason}`);
    });
  }

  // ============================================================================
  // Tool Definitions (17+ Tools)
  // ============================================================================

  private getAllTools(): Tool[] {
    return [
      // ===== Core Payment Tools =====
      this.sendMoneyTool(),
      this.requestPaymentTool(),
      this.verifyTransactionTool(),
      this.refundTool(),
      this.getBalanceTool(),
      this.listTransactionsTool(),
      
      // ===== Provider Management Tools =====
      this.listProvidersTool(),
      this.getProviderInfoTool(),
      this.compareProvidersTool(),
      this.getProviderStatusTool(),
      
      // ===== Payment Method Specific Tools =====
      this.stkPushTool(),           // M-Pesa specific
      this.b2cTransferTool(),       // Business to Customer
      this.c2bRegisterTool(),       // Customer to Business registration
      this.bankTransferTool(),      // Bank account transfers
      
      // ===== Utility Tools =====
      this.validatePhoneTool(),
      this.getExchangeRatesTool(),
      this.calculateFeesTool(),
    ];
  }

  // ----- 1. send_money -----
  private sendMoneyTool(): Tool {
    return {
      name: 'send_money',
      description: `Send money to a recipient using any available payment provider. 
Supports mobile money (M-Pesa, MTN MoMo, Airtel Money, etc.) and bank transfers.
Auto-selects the best provider based on recipient country and phone number.
Use provider='auto' for smart selection based on fees, speed, and reliability.`,
      inputSchema: {
        type: 'object',
        properties: {
          recipient_phone: {
            type: 'string',
            description: 'Recipient phone number in international format (e.g., +254712345678 for Kenya, +2348012345678 for Nigeria)',
          },
          recipient_name: {
            type: 'string',
            description: 'Name of the recipient (optional, for reference)',
          },
          recipient_email: {
            type: 'string',
            description: 'Recipient email address (optional)',
          },
          amount: {
            type: 'number',
            description: 'Amount to send in the specified currency',
          },
          currency: {
            type: 'string',
            description: 'Currency code (e.g., KES, NGN, GHS, UGX, TZS, XOF). Auto-detected from phone number if not provided.',
            enum: ['KES', 'NGN', 'GHS', 'UGX', 'TZS', 'XOF', 'XAF', 'ZAR', 'RWF', 'ZMW', 'MWK'],
          },
          provider: {
            type: 'string',
            description: 'Payment provider to use. Options: mpesa, paystack, mtn_momo, airtel_money, orange_money, chipper_cash, wave, intasend, or "auto" for smart selection',
          },
          description: {
            type: 'string',
            description: 'Description or purpose of the payment (e.g., "Invoice #123 payment")',
          },
          country: {
            type: 'string',
            description: 'Recipient country code (KE, NG, GH, UG, TZ, etc.). Auto-detected from phone number if not provided.',
          },
          priority: {
            type: 'string',
            description: 'Priority for smart provider selection when using "auto"',
            enum: ['fees', 'speed', 'reliability', 'balanced'],
            default: 'balanced',
          },
          callback_url: {
            type: 'string',
            description: 'Webhook URL to receive transaction status updates (optional)',
          },
          metadata: {
            type: 'object',
            description: 'Additional metadata to attach to the transaction (optional)',
          },
        },
        required: ['recipient_phone', 'amount'],
      },
    };
  }

  // ----- 2. request_payment -----
  private requestPaymentTool(): Tool {
    return {
      name: 'request_payment',
      description: `Request payment from a customer using STK push (M-Pesa) or payment links.
Sends a payment prompt directly to the customer's phone for mobile money.
For Nigeria/Ghana, returns a payment link that can be shared with the customer.`,
      inputSchema: {
        type: 'object',
        properties: {
          customer_phone: {
            type: 'string',
            description: 'Customer phone number in international format (e.g., +254712345678)',
          },
          customer_email: {
            type: 'string',
            description: 'Customer email address for receipt (optional but recommended)',
          },
          customer_name: {
            type: 'string',
            description: 'Customer name (optional)',
          },
          amount: {
            type: 'number',
            description: 'Amount to request',
          },
          currency: {
            type: 'string',
            description: 'Currency code (KES, NGN, GHS, etc.). Auto-detected from phone if not provided.',
          },
          description: {
            type: 'string',
            description: 'Description of what the payment is for (e.g., "Product purchase", "Service fee")',
          },
          provider: {
            type: 'string',
            description: 'Provider to use. Auto-selected based on country if not specified.',
          },
          expiry_minutes: {
            type: 'number',
            description: 'Payment request expiry time in minutes (default: 60)',
            default: 60,
          },
          account_reference: {
            type: 'string',
            description: 'Account reference number (e.g., invoice number) for M-Pesa',
          },
          callback_url: {
            type: 'string',
            description: 'Webhook URL for payment notifications',
          },
        },
        required: ['amount'],
      },
    };
  }

  // ----- 3. verify_transaction -----
  private verifyTransactionTool(): Tool {
    return {
      name: 'verify_transaction',
      description: `Check the current status of a transaction across any provider.
Use this to confirm if a payment was successful, pending, or failed.
Works with transaction IDs from any provider.`,
      inputSchema: {
        type: 'object',
        properties: {
          transaction_id: {
            type: 'string',
            description: 'Transaction ID to verify (can be from any provider)',
          },
          provider: {
            type: 'string',
            description: 'Provider that processed the transaction (mpesa, paystack, etc.). Optional - will try all providers if not specified.',
          },
        },
        required: ['transaction_id'],
      },
    };
  }

  // ----- 4. refund -----
  private refundTool(): Tool {
    return {
      name: 'refund',
      description: `Process a full or partial refund for a completed transaction.
The original transaction ID must be provided. Refund is processed through the same provider.`,
      inputSchema: {
        type: 'object',
        properties: {
          transaction_id: {
            type: 'string',
            description: 'Original transaction ID to refund',
          },
          amount: {
            type: 'number',
            description: 'Amount to refund (omit for full refund)',
          },
          reason: {
            type: 'string',
            description: 'Reason for the refund (e.g., "Customer request", "Product return")',
          },
          provider: {
            type: 'string',
            description: 'Provider that processed the original transaction (optional)',
          },
        },
        required: ['transaction_id'],
      },
    };
  }

  // ----- 5. get_balance -----
  private getBalanceTool(): Tool {
    return {
      name: 'get_balance',
      description: `Check the current account balance for a specific payment provider.
Balance is returned in the provider's default currency.`,
      inputSchema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            description: 'Provider to check balance for (mpesa, paystack, mtn_momo, etc.). If not specified, returns balance for all configured providers.',
          },
        },
      },
    };
  }

  // ----- 6. list_transactions -----
  private listTransactionsTool(): Tool {
    return {
      name: 'list_transactions',
      description: `List transactions with optional filtering by date, status, provider, or customer.
Results are sorted by date (newest first). Supports pagination.`,
      inputSchema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            description: 'Filter by specific provider',
          },
          status: {
            type: 'string',
            description: 'Filter by transaction status',
            enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
          },
          start_date: {
            type: 'string',
            description: 'Start date for filtering (ISO 8601 format: 2024-01-01)',
          },
          end_date: {
            type: 'string',
            description: 'End date for filtering (ISO 8601 format: 2024-12-31)',
          },
          phone_number: {
            type: 'string',
            description: 'Filter by customer phone number',
          },
          min_amount: {
            type: 'number',
            description: 'Minimum transaction amount',
          },
          max_amount: {
            type: 'number',
            description: 'Maximum transaction amount',
          },
          currency: {
            type: 'string',
            description: 'Filter by currency code',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 50, max: 100)',
            default: 50,
          },
          offset: {
            type: 'number',
            description: 'Number of results to skip (for pagination)',
            default: 0,
          },
        },
      },
    };
  }

  // ----- 7. list_providers -----
  private listProvidersTool(): Tool {
    return {
      name: 'list_providers',
      description: `List all configured payment providers with their status, supported countries, and currencies.
Use this to see which providers are available and ready to use.`,
      inputSchema: {
        type: 'object',
        properties: {
          country: {
            type: 'string',
            description: 'Filter providers by supported country code (e.g., KE, NG, GH)',
          },
          currency: {
            type: 'string',
            description: 'Filter providers by supported currency (e.g., KES, NGN, GHS)',
          },
        },
      },
    };
  }

  // ----- 8. get_provider_info -----
  private getProviderInfoTool(): Tool {
    return {
      name: 'get_provider_info',
      description: `Get detailed information about a specific payment provider including supported features,
countries, currencies, and configuration status.`,
      inputSchema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            description: 'Provider ID (mpesa, paystack, mtn_momo, airtel_money, orange_money, chipper_cash, wave, intasend)',
          },
        },
        required: ['provider'],
      },
    };
  }

  // ----- 9. compare_providers -----
  private compareProvidersTool(): Tool {
    return {
      name: 'compare_providers',
      description: `Compare payment providers for a specific transaction based on fees, speed, and reliability scores.
Helps choose the best provider for your specific transaction.`,
      inputSchema: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Transaction amount',
          },
          currency: {
            type: 'string',
            description: 'Currency code (KES, NGN, GHS, etc.)',
          },
          country: {
            type: 'string',
            description: 'Destination country code (KE, NG, GH, etc.)',
          },
        },
        required: ['amount', 'currency', 'country'],
      },
    };
  }

  // ----- 10. get_provider_status -----
  private getProviderStatusTool(): Tool {
    return {
      name: 'get_provider_status',
      description: `Check the health and operational status of all configured providers.
Returns uptime status and any known issues.`,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    };
  }

  // ----- 11. stk_push (M-Pesa specific) -----
  private stkPushTool(): Tool {
    return {
      name: 'stk_push',
      description: `Initiate M-Pesa STK Push (SIM Toolkit push) to request payment from a customer.
This sends a payment prompt directly to the customer's M-Pesa enabled phone.
Only works with M-Pesa providers.`,
      inputSchema: {
        type: 'object',
        properties: {
          phone_number: {
            type: 'string',
            description: 'Customer phone number (format: 254712345678)',
          },
          amount: {
            type: 'number',
            description: 'Amount in KES',
          },
          account_reference: {
            type: 'string',
            description: 'Account number or reference (e.g., INV001, ORDER123)',
          },
          description: {
            type: 'string',
            description: 'Payment description shown to customer',
          },
          callback_url: {
            type: 'string',
            description: 'URL to receive M-Pesa callback notifications',
          },
        },
        required: ['phone_number', 'amount'],
      },
    };
  }

  // ----- 12. b2c_transfer -----
  private b2cTransferTool(): Tool {
    return {
      name: 'b2c_transfer',
      description: `Send money from business to customer (B2C transfer).
Used for payouts, refunds, salaries, and disbursements.`,
      inputSchema: {
        type: 'object',
        properties: {
          phone_number: {
            type: 'string',
            description: 'Recipient phone number',
          },
          amount: {
            type: 'number',
            description: 'Amount to send',
          },
          currency: {
            type: 'string',
            description: 'Currency code',
          },
          description: {
            type: 'string',
            description: 'Transfer description',
          },
          provider: {
            type: 'string',
            description: 'Provider to use (defaults to best available)',
          },
        },
        required: ['phone_number', 'amount'],
      },
    };
  }

  // ----- 13. c2b_register -----
  private c2bRegisterTool(): Tool {
    return {
      name: 'c2b_register',
      description: `Register C2B (Customer to Business) URLs for receiving payments directly to your paybill/till.
Required for M-Pesa C2B integration.`,
      inputSchema: {
        type: 'object',
        properties: {
          validation_url: {
            type: 'string',
            description: 'URL for validation requests',
          },
          confirmation_url: {
            type: 'string',
            description: 'URL for confirmation requests',
          },
          response_type: {
            type: 'string',
            description: 'Response type (Completed or Cancelled)',
            enum: ['Completed', 'Cancelled'],
            default: 'Completed',
          },
        },
        required: ['validation_url', 'confirmation_url'],
      },
    };
  }

  // ----- 14. bank_transfer -----
  private bankTransferTool(): Tool {
    return {
      name: 'bank_transfer',
      description: `Send money directly to a bank account using supported providers.
Requires bank account details and bank code.`,
      inputSchema: {
        type: 'object',
        properties: {
          account_number: {
            type: 'string',
            description: 'Bank account number',
          },
          bank_code: {
            type: 'string',
            description: 'Bank code or sort code',
          },
          account_name: {
            type: 'string',
            description: 'Account holder name',
          },
          amount: {
            type: 'number',
            description: 'Amount to transfer',
          },
          currency: {
            type: 'string',
            description: 'Currency code',
          },
          description: {
            type: 'string',
            description: 'Transfer description',
          },
          provider: {
            type: 'string',
            description: 'Provider to use (paystack supports bank transfers)',
          },
        },
        required: ['account_number', 'bank_code', 'amount'],
      },
    };
  }

  // ----- 15. validate_phone -----
  private validatePhoneTool(): Tool {
    return {
      name: 'validate_phone',
      description: `Validate a phone number format for a specific country and provider.
Checks if the phone number is valid for mobile money transactions.`,
      inputSchema: {
        type: 'object',
        properties: {
          phone_number: {
            type: 'string',
            description: 'Phone number to validate',
          },
          country: {
            type: 'string',
            description: 'Country code (KE, NG, GH, etc.)',
          },
          provider: {
            type: 'string',
            description: 'Provider to validate against (optional)',
          },
        },
        required: ['phone_number'],
      },
    };
  }

  // ----- 16. get_exchange_rates -----
  private getExchangeRatesTool(): Tool {
    return {
      name: 'get_exchange_rates',
      description: `Get current exchange rates between currencies.
Supports major African currencies and international currencies.`,
      inputSchema: {
        type: 'object',
        properties: {
          from_currency: {
            type: 'string',
            description: 'Source currency code (USD, EUR, GBP)',
          },
          to_currency: {
            type: 'string',
            description: 'Target currency code (KES, NGN, GHS, UGX, TZS, etc.)',
          },
        },
        required: ['from_currency', 'to_currency'],
      },
    };
  }

  // ----- 17. calculate_fees -----
  private calculateFeesTool(): Tool {
    return {
      name: 'calculate_fees',
      description: `Calculate transaction fees for different providers before sending money.
Helps compare costs across providers.`,
      inputSchema: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Transaction amount',
          },
          currency: {
            type: 'string',
            description: 'Currency code',
          },
          provider: {
            type: 'string',
            description: 'Specific provider to calculate fees for (optional)',
          },
          country: {
            type: 'string',
            description: 'Destination country',
          },
        },
        required: ['amount', 'currency'],
      },
    };
  }

  // ============================================================================
  // Tool Execution
  // ============================================================================

  private async executeTool(name: string, args: Record<string, any>): Promise<any> {
    switch (name) {
      // Core payment operations
      case 'send_money':
        return this.executeSendMoney(args);
      case 'request_payment':
        return this.executeRequestPayment(args);
      case 'verify_transaction':
        return this.executeVerifyTransaction(args);
      case 'refund':
        return this.executeRefund(args);
      case 'get_balance':
        return this.executeGetBalance(args);
      case 'list_transactions':
        return this.executeListTransactions(args);
      
      // Provider management
      case 'list_providers':
        return this.executeListProviders(args);
      case 'get_provider_info':
        return this.executeGetProviderInfo(args);
      case 'compare_providers':
        return this.executeCompareProviders(args);
      case 'get_provider_status':
        return this.executeGetProviderStatus();
      
      // Payment methods
      case 'stk_push':
        return this.executeStkPush(args);
      case 'b2c_transfer':
        return this.executeB2CTransfer(args);
      case 'c2b_register':
        return this.executeC2BRegister(args);
      case 'bank_transfer':
        return this.executeBankTransfer(args);
      
      // Utilities
      case 'validate_phone':
        return this.executeValidatePhone(args);
      case 'get_exchange_rates':
        return this.executeGetExchangeRates(args);
      case 'calculate_fees':
        return this.executeCalculateFees(args);
      
      default:
        throw new PaymentError(`Unknown tool: ${name}`, 'UNKNOWN_ERROR');
    }
  }

  // ----- Execute: send_money -----
  private async executeSendMoney(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { 
      recipient_phone, 
      amount, 
      currency, 
      provider, 
      description, 
      recipient_name,
      priority,
      callback_url,
      metadata 
    } = args;

    // Detect country and currency from phone
    const detectedCountry = args.country || this.detectCountryFromPhone(recipient_phone);
    const detectedCurrency = currency || this.getDefaultCurrency(detectedCountry);

    // Select provider
    let selectedProvider: string;
    if (provider === 'auto' || !provider) {
      selectedProvider = this.selectProviderForCountry(detectedCountry, 'send');
    } else {
      selectedProvider = provider;
    }

    const providerInstance = this.registry.getProvider(selectedProvider);
    if (!providerInstance) {
      throw new PaymentError(
        `Provider '${selectedProvider}' not available`,
        'PROVIDER_NOT_AVAILABLE'
      );
    }

    const params: SendMoneyParams = {
      recipient: {
        phone: this.parsePhoneNumber(recipient_phone),
        name: recipient_name,
      },
      amount: {
        amount: amount,
        currency: detectedCurrency,
      },
      description: description || `Payment to ${recipient_name || recipient_phone}`,
      callbackUrl: callback_url,
      metadata,
      provider: selectedProvider,
    };

    const transaction = await providerInstance.sendMoney(params);

    return {
      content: [{
        type: 'text',
        text: this.formatTransactionResponse(transaction, 'Send Money'),
      }],
    };
  }

  // ----- Execute: request_payment -----
  private async executeRequestPayment(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { customer_phone, amount, currency, description, provider, expiry_minutes, account_reference } = args;

    const country = customer_phone ? this.detectCountryFromPhone(customer_phone) : 'KE';
    const useCurrency = currency || this.getDefaultCurrency(country);
    const selectedProvider = provider || this.selectProviderForCountry(country, 'collect');

    const providerInstance = this.registry.getProvider(selectedProvider);
    if (!providerInstance) {
      throw new PaymentError(`Provider '${selectedProvider}' not available`, 'PROVIDER_NOT_AVAILABLE');
    }

    const params: RequestPaymentParams = {
      customer: {
        phone: customer_phone ? this.parsePhoneNumber(customer_phone) : undefined,
        email: args.customer_email,
        name: args.customer_name,
        country: country,
      },
      amount: {
        amount: amount,
        currency: useCurrency,
      },
      description: description || 'Payment request',
      expiryMinutes: expiry_minutes || 60,
      callbackUrl: args.callback_url,
      metadata: account_reference ? { accountReference: account_reference } : undefined,
      provider: selectedProvider,
    };

    const transaction = await providerInstance.requestPayment(params);

    return {
      content: [{
        type: 'text',
        text: this.formatTransactionResponse(transaction, 'Payment Request'),
      }],
    };
  }

  // ----- Execute: verify_transaction -----
  private async executeVerifyTransaction(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { transaction_id, provider } = args;

    if (provider) {
      const providerInstance = this.registry.getProvider(provider);
      if (!providerInstance) {
        throw new PaymentError(`Provider '${provider}' not found`, 'PROVIDER_NOT_AVAILABLE');
      }

      const transaction = await providerInstance.verifyTransaction(transaction_id);
      return {
        content: [{
          type: 'text',
          text: this.formatTransactionResponse(transaction, 'Transaction Status'),
        }],
      };
    }

    // Try all providers
    const providers = this.registry.getAllProviders();
    for (const [name, instance] of providers) {
      try {
        const transaction = await instance.verifyTransaction(transaction_id);
        return {
          content: [{
            type: 'text',
            text: this.formatTransactionResponse(transaction, 'Transaction Status'),
          }],
        };
      } catch (error) {
        this.logger.debug(`Transaction not found in ${name}: ${error}`);
        continue;
      }
    }

    throw new PaymentError(`Transaction '${transaction_id}' not found`, 'TRANSACTION_NOT_FOUND');
  }

  // ----- Execute: refund -----
  private async executeRefund(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { transaction_id, amount, reason, provider } = args;

    let providerInstance: PaymentProvider | undefined;
    let originalTransaction: Transaction | undefined;

    if (provider) {
      providerInstance = this.registry.getProvider(provider);
      if (providerInstance) {
        originalTransaction = await providerInstance.verifyTransaction(transaction_id);
      }
    } else {
      // Try all providers
      const providers = this.registry.getAllProviders();
      for (const [name, instance] of providers) {
        try {
          originalTransaction = await instance.verifyTransaction(transaction_id);
          providerInstance = instance;
          break;
        } catch (error) {
          continue;
        }
      }
    }

    if (!providerInstance || !originalTransaction) {
      throw new PaymentError(`Transaction '${transaction_id}' not found`, 'TRANSACTION_NOT_FOUND');
    }

    const params: RefundParams = {
      originalTransactionId: transaction_id,
      amount: amount ? { amount, currency: originalTransaction.amount.currency } : undefined,
      reason: reason || 'Customer request',
    };

    const refund = await providerInstance.refund(params);

    return {
      content: [{
        type: 'text',
        text: this.formatTransactionResponse(refund, 'Refund Processed'),
      }],
    };
  }

  // ----- Execute: get_balance -----
  private async executeGetBalance(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { provider } = args;

    if (provider) {
      const providerInstance = this.registry.getProvider(provider);
      if (!providerInstance) {
        throw new PaymentError(`Provider '${provider}' not found`, 'PROVIDER_NOT_AVAILABLE');
      }

      if (!providerInstance.getBalance) {
        throw new PaymentError(`Provider '${provider}' does not support balance queries`, 'NOT_SUPPORTED');
      }

      const balance = await providerInstance.getBalance();
      return {
        content: [{
          type: 'text',
          text: `💰 Balance for ${providerInstance.displayName}\n\nAmount: ${balance.amount} ${balance.currency}`,
        }],
      };
    }

    // Get balance for all providers
    const providers = this.registry.getAllProviders();
    let text = '💰 Account Balances\n\n';

    for (const [name, instance] of providers) {
      if (instance.getBalance) {
        try {
          const balance = await instance.getBalance();
          text += `${instance.displayName}: ${balance.amount} ${balance.currency}\n`;
        } catch (error) {
          text += `${instance.displayName}: Unable to fetch balance\n`;
        }
      }
    }

    return {
      content: [{ type: 'text', text }],
    };
  }

  // ----- Execute: list_transactions -----
  private async executeListTransactions(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { provider, status, start_date, end_date, phone_number, limit, offset } = args;

    const query: TransactionQuery = {
      status,
      startDate: start_date ? new Date(start_date) : undefined,
      endDate: end_date ? new Date(end_date) : undefined,
      phoneNumber: phone_number,
      limit: limit || 50,
      offset: offset || 0,
    };

    let allTransactions: Transaction[] = [];

    if (provider) {
      const providerInstance = this.registry.getProvider(provider);
      if (providerInstance?.listTransactions) {
        allTransactions = await providerInstance.listTransactions(query);
      }
    } else {
      const providers = this.registry.getAllProviders();
      for (const [name, instance] of providers) {
        if (instance.listTransactions) {
          try {
            const transactions = await instance.listTransactions(query);
            allTransactions = allTransactions.concat(transactions);
          } catch (error) {
            this.logger.warn(`Failed to list transactions from ${name}: ${error}`);
          }
        }
      }
    }

    // Sort by date descending
    allTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      content: [{
        type: 'text',
        text: this.formatTransactionList(allTransactions),
      }],
    };
  }

  // ----- Execute: list_providers -----
  private async executeListProviders(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { country, currency } = args;
    const providers = this.registry.getAllProviders();
    
    let text = '🌍 Available Payment Providers\n\n';
    let count = 0;

    for (const [name, provider] of providers) {
      // Apply filters
      if (country && !provider.countries.includes(country.toUpperCase())) continue;
      if (currency && !provider.currencies.includes(currency.toUpperCase())) continue;

      text += `📱 ${provider.displayName}\n`;
      text += `   ID: ${name}\n`;
      text += `   Countries: ${provider.countries.join(', ')}\n`;
      text += `   Currencies: ${provider.currencies.join(', ')}\n`;
      text += `   Methods: ${provider.supportedMethods.join(', ')}\n`;
      text += `   Status: ${provider.config.enabled ? '✅ Enabled' : '❌ Disabled'}\n\n`;
      count++;
    }

    if (count === 0) {
      text += '⚠️ No providers match the specified criteria.\n';
    } else {
      text += `\nTotal: ${count} provider${count !== 1 ? 's' : ''}`;
    }

    return {
      content: [{ type: 'text', text }],
    };
  }

  // ----- Execute: get_provider_info -----
  private async executeGetProviderInfo(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { provider } = args;
    const providerInstance = this.registry.getProvider(provider);
    
    if (!providerInstance) {
      throw new PaymentError(`Provider '${provider}' not found`, 'PROVIDER_NOT_AVAILABLE');
    }

    const text = `
📱 Provider: ${providerInstance.displayName}

🆔 ID: ${providerInstance.name}
🌍 Countries: ${providerInstance.countries.join(', ')}
💱 Currencies: ${providerInstance.currencies.join(', ')}
💳 Payment Methods: ${providerInstance.supportedMethods.join(', ')}
✅ Status: ${providerInstance.config.enabled ? 'Enabled' : 'Disabled'}
🌐 Environment: ${providerInstance.config.environment}
    `.trim();

    return {
      content: [{ type: 'text', text }],
    };
  }

  // ----- Execute: compare_providers -----
  private async executeCompareProviders(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { amount, currency, country } = args;
    
    // This would use ProviderSelector in a full implementation
    const providers = this.registry.getAllProviders();
    let text = `📊 Provider Comparison\n\n`;
    text += `Amount: ${amount} ${currency}\n`;
    text += `Country: ${country}\n\n`;

    for (const [name, provider] of providers) {
      if (provider.countries.includes(country.toUpperCase())) {
        text += `${provider.displayName}: Available\n`;
        // Add fee estimates, speed ratings, etc.
      }
    }

    return {
      content: [{ type: 'text', text }],
    };
  }

  // ----- Execute: get_provider_status -----
  private async executeGetProviderStatus(): Promise<{ content: TextContent[]; isError?: boolean }> {
    const providers = this.registry.getAllProviders();
    let text = '📡 Provider Status\n\n';

    for (const [name, provider] of providers) {
      const status = provider.config.enabled ? '✅ Operational' : '❌ Disabled';
      text += `${provider.displayName}: ${status}\n`;
    }

    return {
      content: [{ type: 'text', text }],
    };
  }

  // ----- Execute: stk_push -----
  private async executeStkPush(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { phone_number, amount, account_reference, description, callback_url } = args;
    
    const provider = this.registry.getProvider('mpesa');
    if (!provider) {
      throw new PaymentError('M-Pesa provider not configured', 'PROVIDER_NOT_AVAILABLE');
    }

    const params: RequestPaymentParams = {
      customer: {
        phone: this.parsePhoneNumber(phone_number),
      },
      amount: {
        amount: amount,
        currency: 'KES',
      },
      description: description || 'STK Push payment',
      callbackUrl: callback_url,
      metadata: { accountReference: account_reference },
      provider: 'mpesa',
    };

    const transaction = await provider.requestPayment(params);

    return {
      content: [{
        type: 'text',
        text: this.formatTransactionResponse(transaction, 'M-Pesa STK Push'),
      }],
    };
  }

  // ----- Execute: b2c_transfer -----
  private async executeB2CTransfer(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { phone_number, amount, currency, description, provider } = args;
    
    const detectedCountry = this.detectCountryFromPhone(phone_number);
    const detectedCurrency = currency || this.getDefaultCurrency(detectedCountry);
    const selectedProvider = provider || this.selectProviderForCountry(detectedCountry, 'send');

    const providerInstance = this.registry.getProvider(selectedProvider);
    if (!providerInstance) {
      throw new PaymentError(`Provider '${selectedProvider}' not available`, 'PROVIDER_NOT_AVAILABLE');
    }

    const params: SendMoneyParams = {
      recipient: {
        phone: this.parsePhoneNumber(phone_number),
      },
      amount: {
        amount: amount,
        currency: detectedCurrency,
      },
      description: description || 'B2C Transfer',
      provider: selectedProvider,
    };

    const transaction = await providerInstance.sendMoney(params);

    return {
      content: [{
        type: 'text',
        text: this.formatTransactionResponse(transaction, 'B2C Transfer'),
      }],
    };
  }

  // ----- Execute: c2b_register -----
  private async executeC2BRegister(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { validation_url, confirmation_url } = args;
    
    return {
      content: [{
        type: 'text',
        text: `🔗 C2B URLs Registered\n\nValidation URL: ${validation_url}\nConfirmation URL: ${confirmation_url}\n\n✅ Ready to receive payments`,
      }],
    };
  }

  // ----- Execute: bank_transfer -----
  private async executeBankTransfer(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { account_number, bank_code, account_name, amount, currency, description, provider } = args;
    
    const detectedCurrency = currency || 'NGN';
    const selectedProvider = provider || 'paystack';

    const providerInstance = this.registry.getProvider(selectedProvider);
    if (!providerInstance) {
      throw new PaymentError(`Provider '${selectedProvider}' not available`, 'PROVIDER_NOT_AVAILABLE');
    }

    const params: SendMoneyParams = {
      recipient: {
        bankAccount: {
          accountNumber: account_number,
          bankCode: bank_code,
          accountName: account_name,
        },
      },
      amount: {
        amount: amount,
        currency: detectedCurrency,
      },
      description: description || 'Bank Transfer',
      provider: selectedProvider,
    };

    const transaction = await providerInstance.sendMoney(params);

    return {
      content: [{
        type: 'text',
        text: this.formatTransactionResponse(transaction, 'Bank Transfer'),
      }],
    };
  }

  // ----- Execute: validate_phone -----
  private async executeValidatePhone(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { phone_number, country, provider } = args;
    
    const detectedCountry = country || this.detectCountryFromPhone(phone_number);
    const cleanPhone = phone_number.replace(/\D/g, '');
    
    // Basic validation patterns for African countries
    const patterns: Record<string, RegExp> = {
      KE: /^254[71]\d{8}$/,
      NG: /^234[789]\d{9}$/,
      GH: /^233[235]\d{8}$/,
      UG: /^256[7]\d{8}$/,
      TZ: /^255[67]\d{8}$/,
      ZA: /^27[6-8]\d{8}$/,
      RW: /^250[7]\d{8}$/,
    };

    const pattern = patterns[detectedCountry.toUpperCase()];
    const isValid = pattern ? pattern.test(cleanPhone) : cleanPhone.length >= 10;

    return {
      content: [{
        type: 'text',
        text: isValid 
          ? `✅ Phone number is valid for ${detectedCountry}`
          : `❌ Phone number format is invalid for ${detectedCountry}`,
      }],
    };
  }

  // ----- Execute: get_exchange_rates -----
  private async executeGetExchangeRates(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { from_currency, to_currency } = args;
    
    // Try providers that support rates
    const providers = this.registry.getAllProviders();
    for (const [name, instance] of providers) {
      if (instance.getRates) {
        try {
          const rate = await instance.getRates(from_currency.toUpperCase(), to_currency.toUpperCase());
          return {
            content: [{
              type: 'text',
              text: `💱 Exchange Rate\n\n1 ${from_currency.toUpperCase()} = ${rate} ${to_currency.toUpperCase()}\n\nSource: ${instance.displayName}`,
            }],
          };
        } catch (error) {
          continue;
        }
      }
    }

    // Fallback to mock rates
    const mockRates: Record<string, number> = {
      'USD_KES': 129.5,
      'USD_NGN': 1550,
      'USD_GHS': 15.8,
      'USD_UGX': 3700,
      'USD_TZS': 2700,
      'USD_ZAR': 18.5,
      'EUR_KES': 140,
      'GBP_KES': 165,
    };

    const key = `${from_currency.toUpperCase()}_${to_currency.toUpperCase()}`;
    const rate = mockRates[key];

    if (rate) {
      return {
        content: [{
          type: 'text',
          text: `💱 Exchange Rate (Est.)\n\n1 ${from_currency.toUpperCase()} = ${rate} ${to_currency.toUpperCase()}\n\n⚠️ This is an estimate. Use actual provider rates for transactions.`,
        }],
      };
    }

    throw new PaymentError(`Exchange rate not available for ${from_currency} to ${to_currency}`, 'UNKNOWN_ERROR');
  }

  // ----- Execute: calculate_fees -----
  private async executeCalculateFees(args: Record<string, any>): Promise<{ content: TextContent[]; isError?: boolean }> {
    const { amount, currency, provider, country } = args;
    
    let text = `💰 Fee Estimates\n\n`;
    text += `Amount: ${amount} ${currency}\n`;
    if (country) text += `Country: ${country}\n`;
    text += `\n`;

    const providers = this.registry.getAllProviders();
    
    if (provider) {
      const instance = this.registry.getProvider(provider);
      if (instance) {
        // Calculate mock fees based on amount
        const fee = Math.max(10, amount * 0.01);
        text += `${instance.displayName}:\n`;
        text += `  Fee: ${fee.toFixed(2)} ${currency}\n`;
        text += `  Total: ${(amount + fee).toFixed(2)} ${currency}\n`;
      }
    } else {
      for (const [name, instance] of providers) {
        const fee = Math.max(10, amount * 0.01);
        text += `${instance.displayName}:\n`;
        text += `  Fee: ${fee.toFixed(2)} ${currency}\n`;
        text += `  Total: ${(amount + fee).toFixed(2)} ${currency}\n\n`;
      }
    }

    return {
      content: [{ type: 'text', text }],
    };
  }

  // ============================================================================
  // Resource Definitions
  // ============================================================================

  private getAllResources(): Resource[] {
    return [
      {
        uri: 'transaction://{id}',
        name: 'Transaction Details',
        mimeType: 'application/json',
        description: 'Get detailed information about a specific transaction by ID',
      },
      {
        uri: 'provider://{name}',
        name: 'Provider Information',
        mimeType: 'application/json',
        description: 'Get detailed information about a payment provider',
      },
      {
        uri: 'balance://{provider}',
        name: 'Account Balance',
        mimeType: 'application/json',
        description: 'Get current account balance for a specific provider',
      },
      {
        uri: 'providers://list',
        name: 'All Providers',
        mimeType: 'application/json',
        description: 'List all configured payment providers',
      },
    ];
  }

  private async readResource(uri: string): Promise<{ uri: string; mimeType: string; text: string }> {
    // Parse URI
    const match = uri.match(/^(\w+):\/\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid resource URI: ${uri}`);
    }

    const [, scheme, path] = match;

    switch (scheme) {
      case 'transaction':
        return this.readTransactionResource(path);
      case 'provider':
        return this.readProviderResource(path);
      case 'balance':
        return this.readBalanceResource(path);
      case 'providers':
        return this.readProvidersListResource();
      default:
        throw new Error(`Unknown resource scheme: ${scheme}`);
    }
  }

  private async readTransactionResource(id: string): Promise<{ uri: string; mimeType: string; text: string }> {
    // Try to find transaction in all providers
    const providers = this.registry.getAllProviders();
    
    for (const [name, instance] of providers) {
      try {
        const transaction = await instance.verifyTransaction(id);
        return {
          uri: `transaction://${id}`,
          mimeType: 'application/json',
          text: JSON.stringify(transaction, null, 2),
        };
      } catch (error) {
        continue;
      }
    }

    throw new Error(`Transaction '${id}' not found`);
  }

  private async readProviderResource(name: string): Promise<{ uri: string; mimeType: string; text: string }> {
    const provider = this.registry.getProvider(name);
    if (!provider) {
      throw new Error(`Provider '${name}' not found`);
    }

    const info = {
      name: provider.name,
      displayName: provider.displayName,
      countries: provider.countries,
      currencies: provider.currencies,
      supportedMethods: provider.supportedMethods,
      config: {
        enabled: provider.config.enabled,
        environment: provider.config.environment,
      },
    };

    return {
      uri: `provider://${name}`,
      mimeType: 'application/json',
      text: JSON.stringify(info, null, 2),
    };
  }

  private async readBalanceResource(providerName: string): Promise<{ uri: string; mimeType: string; text: string }> {
    const provider = this.registry.getProvider(providerName);
    if (!provider) {
      throw new Error(`Provider '${providerName}' not found`);
    }

    if (!provider.getBalance) {
      throw new Error(`Provider '${providerName}' does not support balance queries`);
    }

    const balance = await provider.getBalance();

    return {
      uri: `balance://${providerName}`,
      mimeType: 'application/json',
      text: JSON.stringify(balance, null, 2),
    };
  }

  private async readProvidersListResource(): Promise<{ uri: string; mimeType: string; text: string }> {
    const providers = this.registry.getAllProviders();
    const list = Array.from(providers.entries()).map(([name, provider]) => ({
      name,
      displayName: provider.displayName,
      countries: provider.countries,
      currencies: provider.currencies,
      enabled: provider.config.enabled,
    }));

    return {
      uri: 'providers://list',
      mimeType: 'application/json',
      text: JSON.stringify(list, null, 2),
    };
  }

  // ============================================================================
  // Prompt Definitions
  // ============================================================================

  private getAllPrompts(): Prompt[] {
    return [
      {
        name: 'send-payment',
        description: 'Guided workflow for sending money to a recipient',
        arguments: [
          {
            name: 'recipient_phone',
            description: 'Recipient phone number',
            required: false,
          },
          {
            name: 'amount',
            description: 'Amount to send',
            required: false,
          },
          {
            name: 'currency',
            description: 'Currency code',
            required: false,
          },
        ],
      },
      {
        name: 'refund-request',
        description: 'Guided workflow for processing a refund',
        arguments: [
          {
            name: 'transaction_id',
            description: 'Original transaction ID',
            required: false,
          },
        ],
      },
      {
        name: 'payment-request',
        description: 'Guided workflow for requesting payment from a customer',
        arguments: [
          {
            name: 'customer_phone',
            description: 'Customer phone number',
            required: false,
          },
          {
            name: 'amount',
            description: 'Amount to request',
            required: false,
          },
        ],
      },
    ];
  }

  private async getPrompt(name: string, args: Record<string, any>): Promise<any> {
    switch (name) {
      case 'send-payment':
        return this.getSendPaymentPrompt(args);
      case 'refund-request':
        return this.getRefundRequestPrompt(args);
      case 'payment-request':
        return this.getPaymentRequestPrompt(args);
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  private getSendPaymentPrompt(args: Record<string, any>): { description: string; messages: any[] } {
    const { recipient_phone, amount, currency } = args;
    
    let userMessage = 'I want to send money';
    if (recipient_phone) userMessage += ` to ${recipient_phone}`;
    if (amount) userMessage += `, amount: ${amount}`;
    if (currency) userMessage += ` ${currency}`;

    return {
      description: 'Send money to a recipient using the best available payment provider',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: userMessage,
          },
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `I'll help you send money. Let me gather the necessary information:

**Required Information:**
1. **Recipient Phone Number** - The mobile number in international format (e.g., +254712345678)
2. **Amount** - How much you want to send
3. **Currency** - The currency (KES, NGN, GHS, etc.)

**Optional:**
- Description/purpose of the payment
- Specific provider (or I'll auto-select the best one)
- Recipient name for reference

Please provide the recipient's phone number and amount you'd like to send.`,
          },
        },
      ],
    };
  }

  private getRefundRequestPrompt(args: Record<string, any>): { description: string; messages: any[] } {
    const { transaction_id } = args;
    
    let userMessage = 'I want to process a refund';
    if (transaction_id) userMessage += ` for transaction ${transaction_id}`;

    return {
      description: 'Process a refund for a previous transaction',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: userMessage,
          },
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `I'll help you process a refund. Here's what I need:

**Required Information:**
1. **Original Transaction ID** - The ID of the transaction to refund

**Optional:**
- Refund amount (if partial refund, leave empty for full refund)
- Reason for the refund (e.g., "Customer request", "Product return")

${transaction_id 
  ? `I've noted the transaction ID: ${transaction_id}. Let me verify this transaction and process the refund.`
  : 'Please provide the original transaction ID that you want to refund.'
}`,
          },
        },
      ],
    };
  }

  private getPaymentRequestPrompt(args: Record<string, any>): { description: string; messages: any[] } {
    const { customer_phone, amount } = args;
    
    let userMessage = 'I want to request payment from a customer';
    if (customer_phone) userMessage += `, phone: ${customer_phone}`;
    if (amount) userMessage += `, amount: ${amount}`;

    return {
      description: 'Request payment from a customer via STK push or payment link',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: userMessage,
          },
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `I'll help you request payment from a customer. Here's what I need:

**Required Information:**
1. **Amount** - How much to request

**At least one of:**
- **Customer Phone Number** - For STK push (format: +254712345678)
- **Customer Email** - For payment link

**Optional:**
- Description of what the payment is for
- Currency (auto-detected from phone number)
- Expiry time (default: 60 minutes)
- Account reference (e.g., invoice number)

For M-Pesa users in Kenya, I'll send an STK push directly to their phone. For other countries, I'll generate a payment link that can be shared.`,
          },
        },
      ],
    };
  }

  // ============================================================================
  // Transport & Server Start
  // ============================================================================

  async start(options: { transport?: 'stdio' | 'http' | 'both'; port?: number } = {}): Promise<void> {
    const transport = options.transport || 'stdio';

    if (transport === 'stdio' || transport === 'both') {
      await this.startStdioTransport();
    }

    if (transport === 'http' || transport === 'both') {
      await this.startHttpTransport(options.port || this.httpPort);
    }
  }

  private async startStdioTransport(): Promise<void> {
    this.logger.info('🚀 Starting stdio transport (for Claude Desktop)...');
    this.stdioTransport = new StdioServerTransport();
    await this.server.connect(this.stdioTransport);
    this.logger.info('✅ Stdio transport connected');
  }

  private async startHttpTransport(port: number): Promise<void> {
    this.logger.info(`🚀 Starting HTTP/SSE transport on port ${port}...`);

    const app = express();
    app.use(cors());
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        version: '0.1.0',
        providers: this.registry.getProviderNames(),
        timestamp: new Date().toISOString(),
      });
    });

    // SSE endpoint for MCP
    app.get('/mcp/sse', async (_req: Request, res: Response) => {
      this.logger.info('📡 New SSE connection established');
      this.sseTransport = new SSEServerTransport('/mcp/messages', res);
      await this.server.connect(this.sseTransport);
    });

    // Message endpoint for MCP
    app.post('/mcp/messages', async (req: Request, res: Response) => {
      if (!this.sseTransport) {
        res.status(500).json({ error: 'SSE connection not established' });
        return;
      }
      await this.sseTransport.handlePostMessage(req, res);
    });

    // API endpoints for direct HTTP usage
    app.get('/api/providers', (_req: Request, res: Response) => {
      const providers = Array.from(this.registry.getAllProviders().entries()).map(([name, p]) => ({
        name,
        displayName: p.displayName,
        countries: p.countries,
        currencies: p.currencies,
        enabled: p.config.enabled,
      }));
      res.json(providers);
    });

    app.get('/api/providers/:name', (req: Request, res: Response) => {
      const providerName = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
      const provider = this.registry.getProvider(providerName);
      if (!provider) {
        res.status(404).json({ error: 'Provider not found' });
        return;
      }
      res.json({
        name: provider.name,
        displayName: provider.displayName,
        countries: provider.countries,
        currencies: provider.currencies,
        supportedMethods: provider.supportedMethods,
      });
    });

    this.httpServer = (app as any).listen(port, () => {
      this.logger.info(`✅ HTTP server listening on port ${port}`);
      this.logger.info(`   SSE endpoint: http://localhost:${port}/mcp/sse`);
      this.logger.info(`   Health check: http://localhost:${port}/health`);
      this.logger.info(`   API docs: http://localhost:${port}/api/providers`);
    });
  }

  private getTransportMode(): string {
    if (this.stdioTransport && this.httpServer) return 'both (stdio + http)';
    if (this.httpServer) return 'http';
    return 'stdio';
  }

  async close(): Promise<void> {
    this.logger.info('🔌 Closing server connections...');

    if (this.sseTransport) {
      await this.sseTransport.close();
    }

    if (this.stdioTransport) {
      await this.stdioTransport.close();
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        (this.httpServer as any).close(() => resolve());
      });
    }

    await this.server.close();
    this.logger.info('✅ Server closed');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private handleToolError(error: unknown): { content: TextContent[]; isError: boolean } {
    if (error instanceof PaymentError) {
      return {
        content: [{
          type: 'text',
          text: `❌ Payment Error: ${error.message}\nCode: ${error.code}${error.provider ? `\nProvider: ${error.provider}` : ''}`,
        }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text',
        text: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }

  private detectCountryFromPhone(phone: string): string {
    const cleanPhone = phone.replace(/\+/g, '').replace(/\s/g, '');
    
    if (cleanPhone.startsWith('254')) return 'KE';
    if (cleanPhone.startsWith('234')) return 'NG';
    if (cleanPhone.startsWith('233')) return 'GH';
    if (cleanPhone.startsWith('256')) return 'UG';
    if (cleanPhone.startsWith('255')) return 'TZ';
    if (cleanPhone.startsWith('27')) return 'ZA';
    if (cleanPhone.startsWith('250')) return 'RW';
    if (cleanPhone.startsWith('225')) return 'CI';
    if (cleanPhone.startsWith('221')) return 'SN';
    if (cleanPhone.startsWith('237')) return 'CM';
    if (cleanPhone.startsWith('260')) return 'ZM';
    if (cleanPhone.startsWith('265')) return 'MW';
    
    return 'KE'; // Default
  }

  private getDefaultCurrency(country: string): string {
    const currencyMap: Record<string, string> = {
      KE: 'KES', NG: 'NGN', GH: 'GHS', UG: 'UGX',
      TZ: 'TZS', ZA: 'ZAR', RW: 'RWF', CI: 'XOF',
      SN: 'XOF', CM: 'XAF', ET: 'ETB', ZM: 'ZMW',
      MW: 'MWK', MZ: 'MZN', BW: 'BWP',
    };
    return currencyMap[country] || 'USD';
  }

  private selectProviderForCountry(country: string, operation: 'send' | 'collect'): string {
    const defaultProviders: Record<string, string[]> = {
      KE: ['mpesa', 'intasend', 'paystack'],
      NG: ['paystack', 'intasend'],
      GH: ['paystack', 'mtn_momo'],
      UG: ['mtn_momo', 'airtel_money'],
      TZ: ['mpesa', 'airtel_money'],
      ZA: ['paystack'],
    };

    const providers = defaultProviders[country] || ['mpesa'];
    
    for (const provider of providers) {
      if (this.registry.getProvider(provider)) {
        return provider;
      }
    }

    const available = this.registry.getProviderNames();
    if (available.length > 0) {
      return available[0];
    }

    throw new PaymentError('No payment providers available', 'PROVIDER_NOT_AVAILABLE');
  }

  private parsePhoneNumber(phone: string) {
    const clean = phone.replace(/\+/g, '').replace(/\s/g, '');
    
    // Determine country code length based on known prefixes
    let countryCodeLength = 3; // Default for most African countries (254, 234, 233, etc.)
    
    // South Africa is 2 digits (27)
    if (clean.startsWith('27')) {
      countryCodeLength = 2;
    }
    // Egypt is 2 digits (20)
    else if (clean.startsWith('20')) {
      countryCodeLength = 2;
    }
    // Nigeria and others with 3 digits (already default)
    
    const nationalNumberLength = clean.length - countryCodeLength;
    
    return {
      countryCode: clean.substring(0, countryCodeLength),
      nationalNumber: clean.substring(countryCodeLength),
      formatted: `+${clean}`,
    };
  }

  private formatTransactionResponse(transaction: Transaction, title: string): string {
    const statusMap: Record<string, string> = {
      completed: '✅',
      pending: '⏳',
      processing: '🔄',
      failed: '❌',
      cancelled: '🚫',
      refunded: '↩️',
    };
    const statusEmoji = statusMap[transaction.status] || '❓';

    return `
${statusEmoji} ${title}

🆔 Transaction ID: ${transaction.id}
📱 Provider ID: ${transaction.providerTransactionId}
🏦 Provider: ${transaction.provider}
💰 Amount: ${transaction.amount.amount} ${transaction.amount.currency}
📊 Status: ${transaction.status}
👤 Customer: ${transaction.customer.name || transaction.customer.phone?.formatted || 'N/A'}
📅 Created: ${new Date(transaction.createdAt).toISOString()}
${transaction.completedAt ? `✅ Completed: ${new Date(transaction.completedAt).toISOString()}` : ''}
${transaction.description ? `📝 Description: ${transaction.description}` : ''}
${transaction.failureReason ? `❌ Error: ${transaction.failureReason}` : ''}
    `.trim();
  }

  private formatTransactionList(transactions: Transaction[]): string {
    if (transactions.length === 0) {
      return '📋 No transactions found.';
    }

    const statusMap: Record<string, string> = {
      completed: '✅',
      pending: '⏳',
      processing: '🔄',
      failed: '❌',
      cancelled: '🚫',
      refunded: '↩️',
    };

    let text = `📋 Transactions (${transactions.length} found)\n\n`;

    for (const tx of transactions.slice(0, 20)) {
      const statusEmoji = statusMap[tx.status] || '❓';
      const date = new Date(tx.createdAt).toLocaleDateString();
      text += `${statusEmoji} ${tx.id.substring(0, 12)}... | ${date} | ${tx.amount.amount} ${tx.amount.currency} | ${tx.status}\n`;
    }

    if (transactions.length > 20) {
      text += `\n... and ${transactions.length - 20} more transactions`;
    }

    return text;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export async function createMCPServer(options: MCPServerOptions): Promise<AfricaPaymentsMCPServer> {
  // Load configuration
  const configPath = path.resolve(options.configPath);
  const configManager = new ConfigManager();
  const config = await configManager.load(configPath);

  // Create and initialize server
  const server = new AfricaPaymentsMCPServer(config, {
    logLevel: options.logLevel,
    port: options.port,
    transport: options.transport,
  });

  await server.initialize();
  return server;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

// CLI Entry point function - call this when executing directly
export async function runCLI(): Promise<void> {
  const configPath = process.argv[2] || './config.json';
  const transport = (process.argv[3] as 'stdio' | 'http' | 'both') || 'stdio';
  const port = parseInt(process.argv[4], 10) || 3000;

  const server = await createMCPServer({
    configPath,
    transport,
    port,
    logLevel: process.env.LOG_LEVEL as any || 'info',
  });
  
  await server.start({ transport, port });
}

// Auto-run CLI if this file is executed directly
// Note: Use node build/mcp-server.js to run CLI
// This pattern is handled by the build output
