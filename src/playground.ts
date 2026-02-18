#!/usr/bin/env node

/**
 * Africa Payments MCP - Interactive Playground/REPL
 * 
 * Usage:
 *   africa-payments-mcp playground [--config <path>]
 * 
 * Features:
 *   - Pre-loaded with SDK
 *   - Tab completion
 *   - Built-in examples
 *   - History persistence
 *   - Syntax highlighting
 */

import repl from 'repl';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { AfricaPaymentsClient, AfricaPaymentsMCPServer } from './server.js';
import { ConfigManager } from './utils/config.js';
import { Logger } from './utils/logger.js';
import { ProviderRegistry } from './utils/registry.js';
import { ToolManager } from './utils/tools.js';
import * as types from './types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(os.homedir(), '.africa-payments-mcp-repl-history');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    crimson: '\x1b[38m'
  },
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m',
    crimson: '\x1b[48m'
  }
};

const c = {
  ...colors.fg,
  dim: colors.dim,
  bright: colors.bright,
};

// Welcome banner
function printBanner() {
  console.log(`
${c.cyan}╔═══════════════════════════════════════════════════════════════╗${colors.reset}
${c.cyan}║${colors.reset}                                                               ${c.cyan}║${colors.reset}
${c.cyan}║${colors.reset}   🌍 ${colors.bright}Africa Payments MCP${colors.reset} - Interactive Playground           ${c.cyan}║${colors.reset}
${c.cyan}║${colors.reset}                                                               ${c.cyan}║${colors.reset}
${c.cyan}║${colors.reset}   ${colors.dim}Pre-loaded with SDK. Type .help for commands.${colors.reset}              ${c.cyan}║${colors.reset}
${c.cyan}║${colors.reset}                                                               ${c.cyan}║${colors.reset}
${c.cyan}╚═══════════════════════════════════════════════════════════════╝${colors.reset}
`);
}

// Help text
const HELP_TEXT = `
${colors.bright}Available Commands:${colors.reset}
  ${c.green}.help${colors.reset}           Show this help message
  ${c.green}.examples${colors.reset}       Show example commands
  ${c.green}.providers${colors.reset}      List available providers
  ${c.green}.tools${colors.reset}          List available MCP tools
  ${c.green}.config${colors.reset}         Show current configuration
  ${c.green}.history${colors.reset}        Show command history
  ${c.green}.clear${colors.reset}          Clear the screen
  ${c.green}.save${colors.reset} <file>    Save session to file
  ${c.green}.load${colors.reset} <file>    Load session from file
  ${c.green}.exit${colors.reset}           Exit the playground

${colors.bright}Quick Variables:${colors.reset}
  ${c.yellow}sdk${colors.reset}            AfricaPaymentsClient instance
  ${c.yellow}registry${colors.reset}       ProviderRegistry instance
  ${c.yellow}tools${colors.reset}          ToolManager instance
  ${c.yellow}types${colors.reset}          All type definitions

${colors.bright}Example Usage:${colors.reset}
  ${c.dim}// Send money using unified API${colors.reset}
  ${c.cyan}await${colors.reset} sdk.sendMoney({
    recipientPhone: ${c.green}"+254712345678"${colors.reset},
    amount: ${c.yellow}1000${colors.reset},
    currency: ${c.green}"KES"${colors.reset}
  });

  ${c.dim}// List available providers${colors.reset}
  registry.getProviderNames();

  ${c.dim}// Execute a tool directly${colors.reset}
  ${c.cyan}await${colors.reset} tools.executeTool(${c.green}'list_providers'${colors.reset}, {});
`;

// Example commands
const EXAMPLES = [
  {
    title: 'Send Money (M-Pesa)',
    code: `await sdk.sendMoney({
  recipientPhone: "+254712345678",
  amount: 1000,
  currency: "KES",
  description: "Test payment"
});`
  },
  {
    title: 'Request Payment (STK Push)',
    code: `await sdk.requestPayment({
  customerPhone: "+254712345678",
  amount: 500,
  currency: "KES",
  description: "Invoice #1234"
});`
  },
  {
    title: 'Verify Transaction',
    code: `await sdk.verifyTransaction("TRANSACTION_ID");`
  },
  {
    title: 'Refund Transaction',
    code: `await sdk.refund({
  transactionId: "TRANSACTION_ID",
  amount: 500,
  reason: "Customer request"
});`
  },
  {
    title: 'List Providers',
    code: `registry.getProviderNames()`
  },
  {
    title: 'Get Provider Info',
    code: `const mpesa = registry.getProvider('mpesa');
console.log(mpesa.displayName, mpesa.countries);`
  },
  {
    title: 'Execute Tool',
    code: `await tools.executeTool('unified_get_rates', {
  from_currency: 'USD',
  to_currency: 'KES'
});`
  },
  {
    title: 'List Transactions',
    code: `await sdk.listTransactions({
  provider: 'mpesa',
  limit: 10
});`
  }
];

function printExamples() {
  console.log(`\n${colors.bright}Example Commands:${colors.reset}\n`);
  EXAMPLES.forEach((ex, i) => {
    console.log(`${c.yellow}${i + 1}.${colors.reset} ${colors.bright}${ex.title}${colors.reset}`);
    console.log(`${c.dim}${'─'.repeat(50)}${colors.reset}`);
    console.log(ex.code);
    console.log();
  });
}

// Custom writer for pretty output
function writer(output: any): string {
  if (output === undefined) return '';
  
  if (output instanceof Error) {
    return `${c.red}Error: ${output.message}${colors.reset}`;
  }
  
  if (typeof output === 'string') {
    return output;
  }
  
  // Pretty print objects with colors
  const json = JSON.stringify(output, null, 2);
  return json
    .replace(/"([^"]+)":/g, `${c.cyan}"$1"${colors.reset}:`)
    .replace(/: "([^"]+)"/g, `: ${c.green}"$1"${colors.reset}`)
    .replace(/: (\d+)/g, `: ${c.yellow}$1${colors.reset}`)
    .replace(/: (true|false)/g, `: ${c.magenta}$1${colors.reset}`)
    .replace(/: (null)/g, `: ${c.dim}$1${colors.reset}`);
}

// Tab completion
function completer(line: string): [string[], string] {
  const completions = [
    // SDK methods
    'sdk.', 'sdk.sendMoney', 'sdk.requestPayment', 'sdk.verifyTransaction', 
    'sdk.refund', 'sdk.listTransactions', 'sdk.getBalance',
    // Registry methods
    'registry.', 'registry.getProvider', 'registry.getProviderNames',
    'registry.getAllProviders', 'registry.hasProvider',
    // Tools
    'tools.', 'tools.executeTool', 'tools.getAllTools',
    // Commands
    '.help', '.examples', '.providers', '.tools', '.config', 
    '.history', '.clear', '.save', '.load', '.exit',
    // Types
    'types.', 'types.PaymentError', 'types.ErrorCodes',
    // Keywords
    'await', 'async', 'const', 'let', 'var', 'function', 'return',
    'if', 'else', 'for', 'while', 'try', 'catch', 'throw', 'new',
    'console.log', 'console.error', 'console.warn',
    // Common values
    'mpesa', 'paystack', 'mtn_momo', 'airtel_money', 'intasend',
    'KES', 'NGN', 'GHS', 'UGX', 'TZS', 'ZAR',
    'sandbox', 'production'
  ];
  
  const hits = completions.filter(c => c.startsWith(line));
  return [hits.length ? hits : completions, line];
}

// Main playground function
export async function startPlayground(configPath?: string) {
  printBanner();
  
  // Load configuration
  let config: any = null;
  let sdk: AfricaPaymentsClient | null = null;
  let registry: ProviderRegistry | null = null;
  let tools: ToolManager | null = null;
  
  if (configPath) {
    try {
      const configManager = new ConfigManager();
      config = await configManager.load(configPath);
      
      const logger = new Logger('info');
      registry = new ProviderRegistry(logger);
      // Provider initialization would go here
      
      tools = new ToolManager(registry, logger);
      
      // Create SDK client
      sdk = new AfricaPaymentsClient({
        configPath
      });
      
      console.log(`${c.green}✓${colors.reset} Configuration loaded: ${c.cyan}${configPath}${colors.reset}`);
      console.log(`${c.green}✓${colors.reset} Providers: ${c.yellow}${registry.getProviderNames().join(', ') || 'none'}${colors.reset}\n`);
    } catch (error) {
      console.log(`${c.yellow}⚠${colors.reset} Could not load config: ${error instanceof Error ? error.message : error}`);
      console.log(`${c.dim}  Run without config or use: playground --config <path>${colors.reset}\n`);
    }
  } else {
    console.log(`${c.dim}ℹ No config provided. Using sandbox mode.${colors.reset}\n`);
  }

  // Create REPL
  const replServer = repl.start({
    prompt: `${c.green}🌍 african-payments${colors.reset}> `,
    writer,
    completer,
    useColors: true,
    useGlobal: true
  });

  // Expose SDK and utilities in the REPL context
  replServer.context.sdk = sdk || createMockSDK();
  replServer.context.registry = registry || createMockRegistry();
  replServer.context.tools = tools || createMockTools();
  replServer.context.types = types;
  replServer.context.config = config;
  
  // Custom commands
  replServer.defineCommand('help', {
    help: 'Show help information',
    action() {
      console.log(HELP_TEXT);
      this.displayPrompt();
    }
  });

  replServer.defineCommand('examples', {
    help: 'Show example commands',
    action() {
      printExamples();
      this.displayPrompt();
    }
  });

  replServer.defineCommand('providers', {
    help: 'List available providers',
    action() {
      const reg = replServer.context.registry as ProviderRegistry;
      const names = reg.getProviderNames();
      
      if (names.length === 0) {
        console.log(`${c.yellow}No providers configured${colors.reset}`);
      } else {
        console.log(`\n${colors.bright}Available Providers:${colors.reset}\n`);
        names.forEach(name => {
          const provider = reg.getProvider(name);
          console.log(`  ${c.green}●${colors.reset} ${colors.bright}${provider?.displayName || name}${colors.reset}`);
          console.log(`    Countries: ${c.cyan}${provider?.countries.join(', ')}${colors.reset}`);
          console.log(`    Currencies: ${c.yellow}${provider?.currencies.join(', ')}${colors.reset}`);
          console.log();
        });
      }
      this.displayPrompt();
    }
  });

  replServer.defineCommand('tools', {
    help: 'List available MCP tools',
    action() {
      const tm = replServer.context.tools as ToolManager;
      const allTools = tm.getAllTools();
      
      console.log(`\n${colors.bright}Available MCP Tools:${colors.reset}\n`);
      
      const categories = {
        'Universal Operations': ['unified_send_money', 'unified_request_payment', 'unified_verify_transaction', 'unified_refund', 'unified_list_transactions', 'unified_get_rates'],
        'M-Pesa Operations': ['mpesa_stk_push', 'mpesa_b2c', 'mpesa_c2b', 'mpesa_transaction_status'],
        'Paystack Operations': ['paystack_initialize', 'paystack_verify', 'paystack_refund', 'paystack_transfer'],
        'Info/Utility': ['list_providers', 'get_provider_info']
      };
      
      Object.entries(categories).forEach(([category, toolNames]) => {
        const categoryTools = allTools.filter(t => toolNames.includes(t.name));
        if (categoryTools.length > 0) {
          console.log(`${c.cyan}${category}:${colors.reset}`);
          categoryTools.forEach(tool => {
            console.log(`  ${c.green}•${colors.reset} ${colors.bright}${tool.name}${colors.reset}`);
            console.log(`    ${c.dim}${tool.description.substring(0, 70)}${tool.description.length > 70 ? '...' : ''}${colors.reset}`);
          });
          console.log();
        }
      });
      
      this.displayPrompt();
    }
  });

  replServer.defineCommand('config', {
    help: 'Show current configuration',
    action() {
      const cfg = replServer.context.config;
      if (!cfg) {
        console.log(`${c.yellow}No configuration loaded${colors.reset}`);
      } else {
        console.log(`\n${colors.bright}Current Configuration:${colors.reset}\n`);
        console.log(writer(cfg));
      }
      this.displayPrompt();
    }
  });

  replServer.defineCommand('history', {
    help: 'Show command history',
    action() {
      console.log(`\n${colors.bright}Command History:${colors.reset}\n`);
      (replServer as any).history.forEach((cmd: string, i: number) => {
        console.log(`  ${c.dim}${i + 1}.${colors.reset} ${cmd}`);
      });
      this.displayPrompt();
    }
  });

  replServer.defineCommand('clear', {
    help: 'Clear the screen',
    action() {
      console.clear();
      printBanner();
      this.displayPrompt();
    }
  });

  replServer.defineCommand('save', {
    help: 'Save session to file',
    action(file: string) {
      if (!file) {
        console.log(`${c.red}Usage: .save <filename>${colors.reset}`);
        this.displayPrompt();
        return;
      }
      
      const session = {
        timestamp: new Date().toISOString(),
        config: replServer.context.config,
        history: (replServer as any).history
      };
      
      fs.writeFile(file, JSON.stringify(session, null, 2))
        .then(() => {
          console.log(`${c.green}✓ Session saved to ${file}${colors.reset}`);
        })
        .catch(err => {
          console.log(`${c.red}Error saving: ${err.message}${colors.reset}`);
        })
        .finally(() => {
          this.displayPrompt();
        });
    }
  });

  replServer.defineCommand('load', {
    help: 'Load session from file',
    action(file: string) {
      if (!file) {
        console.log(`${c.red}Usage: .load <filename>${colors.reset}`);
        this.displayPrompt();
        return;
      }
      
      fs.readFile(file, 'utf-8')
        .then(content => {
          const session = JSON.parse(content);
          console.log(`${c.green}✓ Session loaded from ${file}${colors.reset}`);
          console.log(`${c.dim}  Saved: ${session.timestamp}${colors.reset}`);
        })
        .catch(err => {
          console.log(`${c.red}Error loading: ${err.message}${colors.reset}`);
        })
        .finally(() => {
          this.displayPrompt();
        });
    }
  });

  // Load history
  try {
    const history = await fs.readFile(HISTORY_FILE, 'utf-8');
    (replServer as any).history = history.split('\n').filter(Boolean).reverse();
  } catch {
    // No history file yet
  }

  // Save history on exit
  replServer.on('exit', async () => {
    try {
      const history = ((replServer as any).history as string[]).slice().reverse().join('\n');
      await fs.writeFile(HISTORY_FILE, history);
    } catch {
      // Ignore write errors
    }
    console.log(`\n${c.green}👋 Goodbye!${colors.reset}\n`);
    process.exit(0);
  });

  return replServer;
}

// Mock SDK for when no config is provided
function createMockSDK(): AfricaPaymentsClient {
  return {
    sendMoney: async (params: any) => ({
      mock: true,
      operation: 'sendMoney',
      params,
      message: 'This is a mock response. Use --config to connect to real providers.'
    }),
    requestPayment: async (params: any) => ({
      mock: true,
      operation: 'requestPayment',
      params,
      message: 'This is a mock response. Use --config to connect to real providers.'
    }),
    verifyTransaction: async (id: string) => ({
      mock: true,
      operation: 'verifyTransaction',
      id,
      status: 'completed'
    }),
    refund: async (params: any) => ({
      mock: true,
      operation: 'refund',
      params,
      message: 'Refund processed (mock)'
    }),
    listTransactions: async (query: any) => [
      { mock: true, query, message: 'Mock transaction list' }
    ],
    getBalance: async () => ({ amount: 100000, currency: 'KES', mock: true })
  } as any;
}

function createMockRegistry(): ProviderRegistry {
  return {
    getProvider: () => null,
    getProviderNames: () => ['mpesa (mock)', 'paystack (mock)'],
    getAllProviders: () => new Map(),
    hasProvider: () => true,
    initializeAll: async () => {}
  } as any;
}

function createMockTools(): ToolManager {
  return {
    getAllTools: () => [
      { name: 'unified_send_money', description: 'Send money (mock mode)' },
      { name: 'list_providers', description: 'List providers (mock mode)' }
    ],
    executeTool: async (name: string, args: any) => ({
      content: [{ type: 'text', text: `Mock execution of ${name}` }]
    })
  } as any;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const configArg = process.argv.find(arg => arg === '--config');
  const configPath = configArg 
    ? process.argv[process.argv.indexOf(configArg) + 1]
    : process.argv[2];
  
  startPlayground(configPath).catch(err => {
    console.error('Failed to start playground:', err);
    process.exit(1);
  });
}
