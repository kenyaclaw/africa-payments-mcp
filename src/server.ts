/**
 * Africa Payments MCP Server
 * Main server implementation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { Logger } from './utils/logger.js';
import { ConfigManager } from './utils/config.js';
import { ProviderRegistry } from './utils/registry.js';
import { ToolManager } from './utils/tools.js';
import { 
  ServerConfig, 
  PaymentError 
} from './types/index.js';

// Import provider adapters
import { MpesaAdapter } from './adapters/mpesa/index.js';
import { PaystackAdapter } from './adapters/paystack/index.js';
import { IntaSendAdapter } from './adapters/intasend/index.js';
import { MTNMoMoAdapter } from './adapters/mtn-momo/index.js';
import { AirtelMoneyAdapter } from './adapters/airtel-money/index.js';

export interface ServerOptions {
  configPath: string;
  port?: string;
  logLevel?: string;
}

export class AfricaPaymentsMCPServer {
  private server: Server;
  private config: ServerConfig;
  private logger: Logger;
  private registry: ProviderRegistry;
  private toolManager: ToolManager;

  constructor(config: ServerConfig, logLevel: string = 'info') {
    this.config = config;
    this.logger = new Logger(logLevel);
    this.registry = new ProviderRegistry(this.logger);
    this.toolManager = new ToolManager(this.registry, this.logger);

    this.server = new Server(
      {
        name: 'africa-payments-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Africa Payments MCP Server...');

    // Register providers based on config
    await this.registerProviders();

    // Initialize all registered providers
    await this.registry.initializeAll();

    this.logger.info(`✅ Server initialized with ${this.registry.getProviderCount()} providers`);
    this.logger.info(`   Available providers: ${this.registry.getProviderNames().join(', ')}`);
  }

  private async registerProviders(): Promise<void> {
    // M-Pesa
    if (this.config.providers.mpesa?.enabled) {
      this.registry.register('mpesa', new MpesaAdapter(this.config.providers.mpesa));
      this.logger.info('📱 Registered: M-Pesa');
    }

    // Paystack
    if (this.config.providers.paystack?.enabled) {
      this.registry.register('paystack', new PaystackAdapter(this.config.providers.paystack));
      this.logger.info('💳 Registered: Paystack');
    }

    // IntaSend
    if (this.config.providers.intasend?.enabled) {
      this.registry.register('intasend', new IntaSendAdapter(this.config.providers.intasend));
      this.logger.info('💰 Registered: IntaSend');
    }

    // MTN MoMo
    if (this.config.providers.mtn_momo?.enabled) {
      this.registry.register('mtn_momo', new MTNMoMoAdapter(this.config.providers.mtn_momo));
      this.logger.info('📲 Registered: MTN MoMo');
    }

    // Airtel Money
    if (this.config.providers.airtel_money?.enabled) {
      this.registry.register('airtel_money', new AirtelMoneyAdapter(this.config.providers.airtel_money));
      this.logger.info('📡 Registered: Airtel Money');
    }
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('Received: tools/list request');
      return {
        tools: this.toolManager.getAllTools(),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      this.logger.info(`Received: tools/call - ${name}`);
      this.logger.debug(`Arguments: ${JSON.stringify(args)}`);

      try {
        const result = await this.toolManager.executeTool(name, args || {});
        return result as any;
      } catch (error) {
        this.logger.error(`Tool execution failed: ${error}`);
        
        if (error instanceof PaymentError) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Payment Error: ${error.message}\nCode: ${error.code}${error.provider ? `\nProvider: ${error.provider}` : ''}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `❌ Unexpected Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });

    // Error handling
    this.server.onerror = (error) => {
      this.logger.error(`Server error: ${error}`);
    };

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await this.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.close();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    this.logger.info('Starting Africa Payments MCP Server...');
    this.logger.info('Transport: stdio');
    
    await this.server.connect(transport);
    this.logger.info('✅ Server running and ready for connections');
  }

  async close(): Promise<void> {
    this.logger.info('Shutting down server...');
    await this.server.close();
  }
}

export async function createServer(options: ServerOptions): Promise<AfricaPaymentsMCPServer> {
  // Load configuration
  const configPath = path.resolve(options.configPath);
  const configManager = new ConfigManager();
  const config = await configManager.load(configPath);

  // Create and initialize server
  const server = new AfricaPaymentsMCPServer(config, options.logLevel);
  await server.initialize();
  
  return server;
}

// SDK Client for programmatic usage
export class AfricaPaymentsClient {
  private config: ServerConfig;
  private logger: Logger;
  private registry: ProviderRegistry;

  constructor(options: { configPath: string; environment?: string }) {
    this.logger = new Logger('info');
    this.registry = new ProviderRegistry(this.logger);
    // Config will be loaded in initialize()
    this.config = {} as ServerConfig;
  }

  async initialize(): Promise<void> {
    // Load and initialize providers
    // This is a placeholder - full implementation would initialize the SDK client
    this.logger.info('SDK Client initialized');
  }

  getProviderNames(): string[] {
    return this.registry.getProviderNames();
  }

  async sendMoney(params: any): Promise<any> {
    // Placeholder for SDK implementation
    throw new Error('SDK method not yet implemented');
  }

  async requestPayment(params: any): Promise<any> {
    throw new Error('SDK method not yet implemented');
  }

  async verifyTransaction(params: any): Promise<any> {
    throw new Error('SDK method not yet implemented');
  }

  async checkBalance(params: any): Promise<any> {
    throw new Error('SDK method not yet implemented');
  }

  async refund(params: any): Promise<any> {
    throw new Error('SDK method not yet implemented');
  }

  async getTransactions(params: any): Promise<any> {
    throw new Error('SDK method not yet implemented');
  }

  async verifyWebhook(params: any): Promise<boolean> {
    throw new Error('SDK method not yet implemented');
  }

  async close(): Promise<void> {
    // Cleanup
  }
}
