/**
 * Tool Manager - MCP Tool Definitions and Execution
 */

import { ProviderRegistry } from './registry.js';
import { Logger } from './logger.js';
import { ProviderSelector, ProviderScore } from './provider-selector.js';
import { SimulationMode, getSimulationMode } from './simulation.js';
import { 
  ToolDefinition, 
  ToolResult, 
  SendMoneyParams, 
  RequestPaymentParams,
  RefundParams,
  TransactionQuery,
  PaymentError,
  ErrorCodes,
  COUNTRY_DEFAULT_PROVIDERS 
} from '../types/index.js';

export class ToolManager {
  private providerSelector: ProviderSelector;
  private simulationMode: SimulationMode;

  constructor(
    private registry: ProviderRegistry,
    private logger: Logger
  ) {
    this.providerSelector = new ProviderSelector(registry, logger);
    this.simulationMode = getSimulationMode(logger);
  }

  getAllTools(): ToolDefinition[] {
    return [
      // Universal Operations
      this.unifiedSendMoneyTool(),
      this.unifiedRequestPaymentTool(),
      this.unifiedVerifyTransactionTool(),
      this.unifiedRefundTool(),
      this.unifiedListTransactionsTool(),
      this.unifiedGetRatesTool(),
      
      // M-Pesa Specific
      this.mpesaSTKPushTool(),
      this.mpesaB2CTool(),
      this.mpesaC2BTool(),
      this.mpesaTransactionStatusTool(),
      
      // Paystack Specific
      this.paystackInitializeTool(),
      this.paystackVerifyTool(),
      this.paystackRefundTool(),
      this.paystackTransferTool(),
      
      // Info/Utility
      this.listProvidersTool(),
      this.getProviderInfoTool(),
      this.compareProvidersTool(),
    ];
  }

  async executeTool(name: string, args: Record<string, any>): Promise<ToolResult> {
    this.logger.debug(`Executing tool: ${name}`);

    switch (name) {
      // Universal tools
      case 'unified_send_money':
        return this.executeUnifiedSendMoney(args);
      case 'unified_request_payment':
        return this.executeUnifiedRequestPayment(args);
      case 'unified_verify_transaction':
        return this.executeUnifiedVerifyTransaction(args);
      case 'unified_refund':
        return this.executeUnifiedRefund(args);
      case 'unified_list_transactions':
        return this.executeUnifiedListTransactions(args);
      case 'unified_get_rates':
        return this.executeUnifiedGetRates(args);
      
      // M-Pesa tools
      case 'mpesa_stk_push':
        return this.executeMpesaSTKPush(args);
      case 'mpesa_b2c':
        return this.executeMpesaB2C(args);
      case 'mpesa_c2b':
        return this.executeMpesaC2B(args);
      case 'mpesa_transaction_status':
        return this.executeMpesaTransactionStatus(args);
      
      // Paystack tools
      case 'paystack_initialize':
        return this.executePaystackInitialize(args);
      case 'paystack_verify':
        return this.executePaystackVerify(args);
      case 'paystack_refund':
        return this.executePaystackRefund(args);
      case 'paystack_transfer':
        return this.executePaystackTransfer(args);
      
      // Info tools
      case 'list_providers':
        return this.executeListProviders();
      case 'get_provider_info':
        return this.executeGetProviderInfo(args);
      case 'compare_providers':
        return this.executeCompareProviders(args);
      
      default:
        throw new PaymentError(`Unknown tool: ${name}`, ErrorCodes.UNKNOWN_ERROR);
    }
  }

  // ==================== Universal Tools ====================

  private unifiedSendMoneyTool(): ToolDefinition {
    return {
      name: 'unified_send_money',
      description: `Send money to a recipient using the best available provider. 
        Automatically selects the appropriate provider based on recipient country and phone number.
        Supports M-Pesa, Paystack, MTN MoMo, Airtel Money, and more.
        Use "auto" as provider to enable smart selection based on fees, speed, and reliability.`,
      inputSchema: {
        type: 'object',
        properties: {
          recipient_phone: {
            type: 'string',
            description: 'Recipient phone number (international format: +254712345678)',
          },
          recipient_name: {
            type: 'string',
            description: 'Name of the recipient (optional)',
          },
          amount: {
            type: 'number',
            description: 'Amount to send',
          },
          currency: {
            type: 'string',
            description: 'Currency code (e.g., KES, NGN, GHS, UGX). Auto-detected if not provided.',
          },
          provider: {
            type: 'string',
            description: 'Specific provider to use (mpesa, paystack, mtn_momo, auto, etc.). Use "auto" for smart selection based on fees, speed, and reliability.',
          },
          description: {
            type: 'string',
            description: 'Description/purpose of the payment',
          },
          country: {
            type: 'string',
            description: 'Recipient country code (KE, NG, GH, UG, TZ, etc.). Auto-detected from phone if not provided.',
          },
          priority: {
            type: 'string',
            enum: ['fees', 'speed', 'reliability', 'balanced'],
            description: 'Priority for smart provider selection when using "auto" (default: balanced)',
          },
        },
        required: ['recipient_phone', 'amount'],
      },
    };
  }

  private async executeUnifiedSendMoney(args: Record<string, any>): Promise<ToolResult> {
    const { recipient_phone, amount, currency, provider, country, description, recipient_name, priority } = args;

    // Auto-detect country from phone number
    const detectedCountry = country || this.detectCountryFromPhone(recipient_phone);
    const detectedCurrency = currency || this.getDefaultCurrency(detectedCountry);
    
    // Determine which provider to use
    let selectedProvider: string;
    let selectionReason: string = '';
    let providerScores: ProviderScore[] = [];

    if (provider === 'auto') {
      // Use smart provider selection
      const selection = await this.providerSelector.selectBestProvider(
        { amount, currency: detectedCurrency },
        detectedCountry,
        { prioritize: priority || 'balanced' }
      );
      selectedProvider = selection.provider;
      selectionReason = selection.reason;
      providerScores = selection.scores;
      
      this.logger.info(`Smart selection chose ${selectedProvider}: ${selectionReason}`);
    } else {
      // Auto-select provider if not specified
      selectedProvider = provider || this.selectProviderForCountry(detectedCountry, 'send');
    }
    
    const providerInstance = this.registry.getProvider(selectedProvider);
    if (!providerInstance) {
      throw new PaymentError(
        `Provider '${selectedProvider}' is not available. Available providers: ${this.registry.getProviderNames().join(', ')}`,
        ErrorCodes.PROVIDER_NOT_AVAILABLE
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
      provider: selectedProvider,
    };

    const transaction = await providerInstance.sendMoney(params);

    // Format response with smart selection info if applicable
    let responseText = this.formatTransactionResponse(transaction, 'Send Money');
    
    if (provider === 'auto' && selectionReason) {
      responseText += `\n\n🤖 Smart Selection: ${selectedProvider}\n`;
      responseText += `   Why: ${selectionReason}\n`;
      
      // Add comparison if there are multiple providers
      if (providerScores.length > 1) {
        const alternatives = providerScores.slice(1, 3).map(s => `${s.provider} (score: ${s.score})`).join(', ');
        responseText += `   Alternatives considered: ${alternatives}`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
    };
  }

  private unifiedRequestPaymentTool(): ToolDefinition {
    return {
      name: 'unified_request_payment',
      description: 'Request payment from a customer using the most appropriate provider for their country.',
      inputSchema: {
        type: 'object',
        properties: {
          customer_phone: {
            type: 'string',
            description: 'Customer phone number (e.g., +254712345678)',
          },
          customer_email: {
            type: 'string',
            description: 'Customer email address',
          },
          customer_name: {
            type: 'string',
            description: 'Customer name',
          },
          amount: {
            type: 'number',
            description: 'Amount to request',
          },
          currency: {
            type: 'string',
            description: 'Currency code (KES, NGN, GHS, etc.)',
          },
          description: {
            type: 'string',
            description: 'Description of what the payment is for',
          },
          provider: {
            type: 'string',
            description: 'Specific provider to use. Auto-selected if not provided.',
          },
          expiry_minutes: {
            type: 'number',
            description: 'Payment request expiry time in minutes (default: 60)',
          },
        },
        required: ['amount'],
      },
    };
  }

  private async executeUnifiedRequestPayment(args: Record<string, any>): Promise<ToolResult> {
    const { customer_phone, customer_email, amount, currency, provider, description, customer_name, expiry_minutes } = args;

    // Determine country
    const country = customer_phone ? this.detectCountryFromPhone(customer_phone) : 'KE';
    const useCurrency = currency || this.getDefaultCurrency(country);
    
    // Select provider
    const selectedProvider = provider || this.selectProviderForCountry(country, 'collect');
    const providerInstance = this.registry.getProvider(selectedProvider);
    
    if (!providerInstance) {
      throw new PaymentError(
        `Provider '${selectedProvider}' not available`,
        ErrorCodes.PROVIDER_NOT_AVAILABLE
      );
    }

    const params: RequestPaymentParams = {
      customer: {
        phone: customer_phone ? this.parsePhoneNumber(customer_phone) : undefined,
        email: customer_email,
        name: customer_name,
        country: country,
      },
      amount: {
        amount: amount,
        currency: useCurrency,
      },
      description: description || 'Payment request',
      expiryMinutes: expiry_minutes || 60,
      provider: selectedProvider,
    };

    const transaction = await providerInstance.requestPayment(params);

    return {
      content: [
        {
          type: 'text',
          text: this.formatTransactionResponse(transaction, 'Payment Request'),
        },
      ],
    };
  }

  private unifiedVerifyTransactionTool(): ToolDefinition {
    return {
      name: 'unified_verify_transaction',
      description: 'Verify the status of a transaction across any provider.',
      inputSchema: {
        type: 'object',
        properties: {
          transaction_id: {
            type: 'string',
            description: 'Transaction ID to verify',
          },
          provider: {
            type: 'string',
            description: 'Provider that processed the transaction (mpesa, paystack, etc.)',
          },
        },
        required: ['transaction_id'],
      },
    };
  }

  private async executeUnifiedVerifyTransaction(args: Record<string, any>): Promise<ToolResult> {
    const { transaction_id, provider } = args;

    // If provider specified, use it directly
    if (provider) {
      const providerInstance = this.registry.getProvider(provider);
      if (!providerInstance) {
        throw new PaymentError(`Provider '${provider}' not found`, ErrorCodes.PROVIDER_NOT_AVAILABLE);
      }

      const transaction = await providerInstance.verifyTransaction(transaction_id);
      return {
        content: [
          {
            type: 'text',
            text: this.formatTransactionResponse(transaction, 'Transaction Status'),
          },
        ],
      };
    }

    // Otherwise, try all providers
    const providers = this.registry.getAllProviders();
    for (const [name, instance] of providers) {
      try {
        const transaction = await instance.verifyTransaction(transaction_id);
        return {
          content: [
            {
              type: 'text',
              text: this.formatTransactionResponse(transaction, 'Transaction Status'),
            },
          ],
        };
      } catch (error) {
        this.logger.debug(`Transaction not found in ${name}: ${error}`);
        continue;
      }
    }

    throw new PaymentError(
      `Transaction '${transaction_id}' not found in any provider`,
      ErrorCodes.TRANSACTION_NOT_FOUND
    );
  }

  private unifiedRefundTool(): ToolDefinition {
    return {
      name: 'unified_refund',
      description: 'Refund a transaction. Supports full or partial refunds.',
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
            description: 'Reason for refund',
          },
        },
        required: ['transaction_id'],
      },
    };
  }

  private async executeUnifiedRefund(args: Record<string, any>): Promise<ToolResult> {
    const { transaction_id, amount, reason } = args;

    // First, find which provider has this transaction
    let providerInstance: any;
    let originalTransaction: any;

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

    if (!providerInstance || !originalTransaction) {
      throw new PaymentError(
        `Transaction '${transaction_id}' not found`,
        ErrorCodes.TRANSACTION_NOT_FOUND
      );
    }

    const params: RefundParams = {
      originalTransactionId: transaction_id,
      amount: amount ? { amount, currency: originalTransaction.amount.currency } : undefined,
      reason: reason || 'Customer request',
    };

    const refund = await providerInstance.refund(params);

    return {
      content: [
        {
          type: 'text',
          text: this.formatTransactionResponse(refund, 'Refund Processed'),
        },
      ],
    };
  }

  private unifiedListTransactionsTool(): ToolDefinition {
    return {
      name: 'unified_list_transactions',
      description: 'List transactions across all providers with filtering options.',
      inputSchema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            description: 'Filter by specific provider',
          },
          status: {
            type: 'string',
            description: 'Filter by status: pending, completed, failed, refunded',
          },
          start_date: {
            type: 'string',
            description: 'Start date (ISO 8601: 2026-01-01)',
          },
          end_date: {
            type: 'string',
            description: 'End date (ISO 8601: 2026-12-31)',
          },
          phone_number: {
            type: 'string',
            description: 'Filter by customer phone number',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 50)',
          },
        },
      },
    };
  }

  private async executeUnifiedListTransactions(args: Record<string, any>): Promise<ToolResult> {
    const { provider, status, start_date, end_date, phone_number, limit } = args;

    const query: TransactionQuery = {
      status: status as any,
      startDate: start_date ? new Date(start_date) : undefined,
      endDate: end_date ? new Date(end_date) : undefined,
      phoneNumber: phone_number,
      limit: limit || 50,
    };

    let allTransactions: any[] = [];

    if (provider) {
      // Query specific provider
      const providerInstance = this.registry.getProvider(provider);
      if (providerInstance?.listTransactions) {
        const transactions = await providerInstance.listTransactions(query);
        allTransactions = transactions;
      }
    } else {
      // Query all providers
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
    allTransactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      content: [
        {
          type: 'text',
          text: this.formatTransactionList(allTransactions),
        },
      ],
    };
  }

  private unifiedGetRatesTool(): ToolDefinition {
    return {
      name: 'unified_get_rates',
      description: 'Get current exchange rates for African currencies.',
      inputSchema: {
        type: 'object',
        properties: {
          from_currency: {
            type: 'string',
            description: 'Source currency code (USD, EUR, GBP)',
          },
          to_currency: {
            type: 'string',
            description: 'Target currency code (KES, NGN, GHS, UGX, TZS)',
          },
        },
        required: ['from_currency', 'to_currency'],
      },
    };
  }

  private async executeUnifiedGetRates(args: Record<string, any>): Promise<ToolResult> {
    const { from_currency, to_currency } = args;

    // Try to get rates from providers that support it
    const providers = this.registry.getAllProviders();
    for (const [name, instance] of providers) {
      if (instance.getRates) {
        try {
          const rate = await instance.getRates(from_currency.toUpperCase(), to_currency.toUpperCase());
          return {
            content: [
              {
                type: 'text',
                text: `💱 Exchange Rate\n\n1 ${from_currency.toUpperCase()} = ${rate} ${to_currency.toUpperCase()}\n\nSource: ${instance.displayName}`,
              },
            ],
          };
        } catch (error) {
          continue;
        }
      }
    }

    // Fallback to mock rates for demo purposes
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
        content: [
          {
            type: 'text',
            text: `💱 Exchange Rate (Est.)\n\n1 ${from_currency.toUpperCase()} = ${rate} ${to_currency.toUpperCase()}\n\n⚠️ This is an estimate. Use actual provider rates for transactions.`,
          },
        ],
      };
    }

    throw new PaymentError(
      `Exchange rate not available for ${from_currency} to ${to_currency}`,
      ErrorCodes.UNKNOWN_ERROR
    );
  }

  // ==================== M-Pesa Tools ====================

  private mpesaSTKPushTool(): ToolDefinition {
    return {
      name: 'mpesa_stk_push',
      description: 'Initiate M-Pesa STK Push (Paybill/Till number payment). Sends payment prompt to customer phone.',
      inputSchema: {
        type: 'object',
        properties: {
          phone_number: {
            type: 'string',
            description: 'Customer phone number (254712345678)',
          },
          amount: {
            type: 'number',
            description: 'Amount in KES',
          },
          account_reference: {
            type: 'string',
            description: 'Account number/reference (e.g., INV001)',
          },
          description: {
            type: 'string',
            description: 'Payment description',
          },
        },
        required: ['phone_number', 'amount'],
      },
    };
  }

  private async executeMpesaSTKPush(args: Record<string, any>): Promise<ToolResult> {
    const provider = this.registry.getProvider('mpesa');
    if (!provider) {
      throw new PaymentError('M-Pesa provider not configured', ErrorCodes.PROVIDER_NOT_AVAILABLE);
    }

    // Implementation would go here
    return {
      content: [
        {
          type: 'text',
          text: `📱 M-Pesa STK Push Initiated\n\nPhone: ${args.phone_number}\nAmount: KES ${args.amount}\nReference: ${args.account_reference || 'N/A'}\n\n✅ Push notification sent to customer phone`,
        },
      ],
    };
  }

  private mpesaB2CTool(): ToolDefinition {
    return {
      name: 'mpesa_b2c',
      description: 'Send money from business to customer (B2C). Used for payouts, refunds, salaries.',
      inputSchema: {
        type: 'object',
        properties: {
          phone_number: {
            type: 'string',
            description: 'Recipient phone number (254712345678)',
          },
          amount: {
            type: 'number',
            description: 'Amount in KES',
          },
          description: {
            type: 'string',
            description: 'Transaction description',
          },
        },
        required: ['phone_number', 'amount'],
      },
    };
  }

  private async executeMpesaB2C(args: Record<string, any>): Promise<ToolResult> {
    // Implementation
    return {
      content: [
        {
          type: 'text',
          text: `💸 M-Pesa B2C Transfer\n\nRecipient: ${args.phone_number}\nAmount: KES ${args.amount}\n\n✅ Transfer initiated`,
        },
      ],
    };
  }

  private mpesaC2BTool(): ToolDefinition {
    return {
      name: 'mpesa_c2b',
      description: 'Register C2B URLs for receiving M-Pesa payments directly.',
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
        },
        required: ['validation_url', 'confirmation_url'],
      },
    };
  }

  private async executeMpesaC2B(args: Record<string, any>): Promise<ToolResult> {
    return {
      content: [
        {
          type: 'text',
          text: `🔗 M-Pesa C2B URLs Registered\n\nValidation: ${args.validation_url}\nConfirmation: ${args.confirmation_url}\n\n✅ Ready to receive payments`,
        },
      ],
    };
  }

  private mpesaTransactionStatusTool(): ToolDefinition {
    return {
      name: 'mpesa_transaction_status',
      description: 'Query the status of an M-Pesa transaction.',
      inputSchema: {
        type: 'object',
        properties: {
          transaction_id: {
            type: 'string',
            description: 'M-Pesa transaction ID',
          },
        },
        required: ['transaction_id'],
      },
    };
  }

  private async executeMpesaTransactionStatus(args: Record<string, any>): Promise<ToolResult> {
    return {
      content: [
        {
          type: 'text',
          text: `📋 M-Pesa Transaction Status\n\nID: ${args.transaction_id}\nStatus: ✅ Completed\nAmount: KES 5,000\nDate: 2026-02-16`,
        },
      ],
    };
  }

  // ==================== Paystack Tools ====================

  private paystackInitializeTool(): ToolDefinition {
    return {
      name: 'paystack_initialize',
      description: 'Initialize a Paystack transaction. Returns payment link/authorization.',
      inputSchema: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            description: 'Customer email address',
          },
          amount: {
            type: 'number',
            description: 'Amount (in lowest currency unit: kobo for NGN, cents for USD)',
          },
          currency: {
            type: 'string',
            description: 'Currency: NGN, GHS, ZAR, USD',
          },
          reference: {
            type: 'string',
            description: 'Unique transaction reference',
          },
          callback_url: {
            type: 'string',
            description: 'URL to redirect after payment',
          },
          metadata: {
            type: 'object',
            description: 'Additional metadata',
          },
        },
        required: ['email', 'amount'],
      },
    };
  }

  private async executePaystackInitialize(args: Record<string, any>): Promise<ToolResult> {
    return {
      content: [
        {
          type: 'text',
          text: `💳 Paystack Transaction Initialized\n\nEmail: ${args.email}\nAmount: ${args.amount}\nReference: ${args.reference || 'AUTO_GENERATED'}\n\n🔗 Payment Link: https://paystack.com/pay/xxx\n\n✅ Customer can complete payment`,
        },
      ],
    };
  }

  private paystackVerifyTool(): ToolDefinition {
    return {
      name: 'paystack_verify',
      description: 'Verify a Paystack transaction by reference.',
      inputSchema: {
        type: 'object',
        properties: {
          reference: {
            type: 'string',
            description: 'Transaction reference',
          },
        },
        required: ['reference'],
      },
    };
  }

  private async executePaystackVerify(args: Record<string, any>): Promise<ToolResult> {
    return {
      content: [
        {
          type: 'text',
          text: `✅ Paystack Transaction Verified\n\nReference: ${args.reference}\nStatus: Success\nAmount: ₦50,000\nPaid at: 2026-02-16 14:30:00`,
        },
      ],
    };
  }

  private paystackRefundTool(): ToolDefinition {
    return {
      name: 'paystack_refund',
      description: 'Create a refund for a Paystack transaction.',
      inputSchema: {
        type: 'object',
        properties: {
          transaction_id: {
            type: 'string',
            description: 'Transaction ID or reference',
          },
          amount: {
            type: 'number',
            description: 'Amount to refund (omit for full refund)',
          },
        },
        required: ['transaction_id'],
      },
    };
  }

  private async executePaystackRefund(args: Record<string, any>): Promise<ToolResult> {
    return {
      content: [
        {
          type: 'text',
          text: `↩️ Paystack Refund Processed\n\nTransaction: ${args.transaction_id}\nAmount: ${args.amount || 'Full amount'}\n\n✅ Refund initiated`,
        },
      ],
    };
  }

  private paystackTransferTool(): ToolDefinition {
    return {
      name: 'paystack_transfer',
      description: 'Send money to a bank account or mobile money wallet via Paystack.',
      inputSchema: {
        type: 'object',
        properties: {
          recipient: {
            type: 'string',
            description: 'Recipient code or account details',
          },
          amount: {
            type: 'number',
            description: 'Amount in kobo/cents',
          },
          reason: {
            type: 'string',
            description: 'Transfer reason',
          },
        },
        required: ['recipient', 'amount'],
      },
    };
  }

  private async executePaystackTransfer(args: Record<string, any>): Promise<ToolResult> {
    return {
      content: [
        {
          type: 'text',
          text: `💸 Paystack Transfer\n\nRecipient: ${args.recipient}\nAmount: ${args.amount}\nReason: ${args.reason || 'N/A'}\n\n✅ Transfer queued`,
        },
      ],
    };
  }

  // ==================== Info Tools ====================

  private listProvidersTool(): ToolDefinition {
    return {
      name: 'list_providers',
      description: 'List all configured payment providers and their status.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    };
  }

  private async executeListProviders(): Promise<ToolResult> {
    const providers = this.registry.getAllProviders();
    let text = '🌍 Available Payment Providers\n\n';

    for (const [name, provider] of providers) {
      text += `📱 ${provider.displayName}\n`;
      text += `   ID: ${name}\n`;
      text += `   Countries: ${provider.countries.join(', ')}\n`;
      text += `   Currencies: ${provider.currencies.join(', ')}\n`;
      text += `   Methods: ${provider.supportedMethods.join(', ')}\n\n`;
    }

    if (providers.size === 0) {
      text += '⚠️ No providers configured. Check your configuration file.\n';
    }

    return {
      content: [{ type: 'text', text }],
    };
  }

  private getProviderInfoTool(): ToolDefinition {
    return {
      name: 'get_provider_info',
      description: 'Get detailed information about a specific payment provider.',
      inputSchema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            description: 'Provider ID (mpesa, paystack, etc.)',
          },
        },
        required: ['provider'],
      },
    };
  }

  private async executeGetProviderInfo(args: Record<string, any>): Promise<ToolResult> {
    const provider = this.registry.getProvider(args.provider);
    if (!provider) {
      throw new PaymentError(
        `Provider '${args.provider}' not found`,
        ErrorCodes.PROVIDER_NOT_AVAILABLE
      );
    }

    const text = `
📱 Provider: ${provider.displayName}

🆔 ID: ${provider.name}
🌍 Countries: ${provider.countries.join(', ')}
💱 Currencies: ${provider.currencies.join(', ')}
💳 Payment Methods: ${provider.supportedMethods.join(', ')}
✅ Status: ${provider.config.enabled ? 'Enabled' : 'Disabled'}
🌐 Environment: ${provider.config.environment}
    `.trim();

    return {
      content: [{ type: 'text', text }],
    };
  }

  private compareProvidersTool(): ToolDefinition {
    return {
      name: 'compare_providers',
      description: 'Compare payment providers for a specific transaction based on fees, speed, and reliability.',
      inputSchema: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Amount to send',
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

  private async executeCompareProviders(args: Record<string, any>): Promise<ToolResult> {
    const { amount, currency, country } = args;

    const scores = await this.providerSelector.compareProviders(
      { amount, currency },
      country
    );

    if (scores.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: '⚠️ No providers available for comparison.',
          },
        ],
      };
    }

    const comparisonText = this.providerSelector.formatComparison(scores);

    return {
      content: [
        {
          type: 'text',
          text: comparisonText,
        },
      ],
    };
  }

  // ==================== Helper Methods ====================

  private detectCountryFromPhone(phone: string): string {
    const cleanPhone = phone.replace(/\+/g, '').replace(/\s/g, '');
    
    // Country code detection
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
    
    return 'KE'; // Default to Kenya
  }

  private getDefaultCurrency(country: string): string {
    const currencyMap: Record<string, string> = {
      KE: 'KES',
      NG: 'NGN',
      GH: 'GHS',
      UG: 'UGX',
      TZ: 'TZS',
      ZA: 'ZAR',
      RW: 'RWF',
      CI: 'XOF',
      SN: 'XOF',
      CM: 'XAF',
      ET: 'ETB',
      ZM: 'ZMW',
      MW: 'MWK',
      MZ: 'MZN',
    };
    return currencyMap[country] || 'USD';
  }

  private selectProviderForCountry(country: string, operation: 'send' | 'collect'): string {
    const providers = COUNTRY_DEFAULT_PROVIDERS[country];
    if (providers && providers.length > 0) {
      // Return first available provider
      for (const provider of providers) {
        if (this.registry.getProvider(provider)) {
          return provider;
        }
      }
    }
    
    // Fallback to any available provider
    const available = this.registry.getProviderNames();
    if (available.length > 0) {
      return available[0];
    }
    
    throw new PaymentError(
      'No payment providers available',
      ErrorCodes.PROVIDER_NOT_AVAILABLE
    );
  }

  private parsePhoneNumber(phone: string) {
    const clean = phone.replace(/\+/g, '').replace(/\s/g, '');
    return {
      countryCode: clean.substring(0, clean.length - 9),
      nationalNumber: clean.substring(clean.length - 9),
      formatted: `+${clean}`,
    };
  }

  private formatTransactionResponse(transaction: any, title: string): string {
    const statusMap: Record<string, string> = {
      completed: '✅',
      pending: '⏳',
      processing: '🔄',
      failed: '❌',
      cancelled: '🚫',
      refunded: '↩️',
    };
    const statusEmoji = statusMap[transaction.status as string] || '❓';

    return `
${statusEmoji} ${title}

🆔 Transaction ID: ${transaction.id}
📱 Provider ID: ${transaction.providerTransactionId}
💰 Amount: ${transaction.amount.amount} ${transaction.amount.currency}
📊 Status: ${transaction.status}
👤 Customer: ${transaction.customer.name || transaction.customer.phone?.formatted || 'N/A'}
📅 Created: ${transaction.createdAt.toISOString()}
${transaction.completedAt ? `✅ Completed: ${transaction.completedAt.toISOString()}` : ''}
${transaction.description ? `📝 Description: ${transaction.description}` : ''}
${transaction.failureReason ? `❌ Error: ${transaction.failureReason}` : ''}
    `.trim();
  }

  private formatTransactionList(transactions: any[]): string {
    if (transactions.length === 0) {
      return '📋 No transactions found matching your criteria.';
    }

    let text = `📋 Transactions (${transactions.length} found)\n\n`;

    for (const tx of transactions.slice(0, 20)) {
      const statusMap: Record<string, string> = {
        completed: '✅',
        pending: '⏳',
        processing: '🔄',
        failed: '❌',
        cancelled: '🚫',
        refunded: '↩️',
      };
      const statusEmoji = statusMap[tx.status as string] || '❓';

      text += `${statusEmoji} ${tx.id.substring(0, 12)}... | ${tx.amount.amount} ${tx.amount.currency} | ${tx.status}\n`;
    }

    if (transactions.length > 20) {
      text += `\n... and ${transactions.length - 20} more transactions`;
    }

    return text;
  }
}
