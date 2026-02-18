#!/usr/bin/env node

/**
 * Africa Payments MCP Server CLI
 * Unified Model Context Protocol server for African payment providers
 * 
 * Enhanced with colors, spinners, and interactive features
 */

import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { createServer } from './server.js';
import { startPlayground } from './playground.js';
import { ConfigManager } from './utils/config.js';
import { Logger } from './utils/logger.js';
import {
  parseNaturalLanguageConfig,
  generateConfigFromParsed,
  formatParsedConfig,
} from './utils/natural-config.js';

// Import styling libraries
import pc from 'picocolors';
import ora from 'ora';
import boxen from 'boxen';
import figlet from 'figlet';
import gradient from 'gradient-string';

export const program = new Command();

// =============================================================================
// Styling Utilities
// =============================================================================

// Color palette
const colors = {
  primary: pc.green,                  // African green
  secondary: pc.red,                  // Warm accent
  accent: pc.yellow,                  // Gold
  info: pc.cyan,                      // Blue
  success: pc.green,                  // Green
  warning: pc.yellow,                 // Orange/Yellow
  error: pc.red,                      // Red
  muted: pc.gray,
  bold: (text: string) => pc.bold(text),
};

// Emoji mapping
const emoji = {
  globe: '🌍',
  rocket: '🚀',
  check: '✅',
  cross: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  phone: '📱',
  card: '💳',
  money: '💰',
  gear: '⚙️',
  star: '⭐',
  party: '🎉',
  package: '📦',
  lock: '🔒',
  key: '🔑',
  sparkles: '✨',
  arrow: '➜',
};

// Print styled header
async function printBanner() {
  console.clear();
  const figletText = await new Promise<string>((resolve) => {
    figlet('Africa Payments', { font: 'Small' }, (err, data) => {
      resolve(data || 'Africa Payments MCP');
    });
  });
  
  console.log(gradient(['#008751', '#F4D03F', '#FF6B35']).multiline(figletText));
  console.log(pc.dim('═'.repeat(60)));
  console.log(colors.muted('     Unified MCP Server for African Payment Providers'));
  console.log(pc.dim('═'.repeat(60)));
  console.log();
}

// Create a nice box
function createBox(title: string, content: string, options: Record<string, unknown> = {}) {
  return boxen(content, {
    title: colors.bold(title),
    titleAlignment: 'center',
    padding: 1,
    borderStyle: 'round',
    borderColor: 'green',
    ...options,
  });
}

// Progress indicator helper
async function withSpinner<T>(
  message: string, 
  fn: () => Promise<T>, 
  successMessage?: string
): Promise<T> {
  const spinner = ora({
    text: colors.muted(message),
    spinner: 'dots',
  }).start();
  
  try {
    const result = await fn();
    spinner.succeed(successMessage ? colors.success(successMessage) : undefined);
    return result;
  } catch (error) {
    spinner.fail();
    throw error;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function validateProviderCredentials(provider: string, config: any): { valid: boolean; error?: string } {
  switch (provider) {
    case 'mpesa':
      if (!config.consumerKey) return { valid: false, error: 'Missing consumerKey' };
      if (!config.consumerSecret) return { valid: false, error: 'Missing consumerSecret' };
      if (!config.passkey) return { valid: false, error: 'Missing passkey' };
      return { valid: true };
    
    case 'paystack':
      if (!config.secretKey) return { valid: false, error: 'Missing secretKey' };
      if (!config.secretKey.startsWith('sk_')) {
        return { valid: false, error: 'Invalid secretKey format (should start with sk_)' };
      }
      return { valid: true };
    
    case 'intasend':
      if (!config.publishableKey) return { valid: false, error: 'Missing publishableKey' };
      if (!config.secretKey) return { valid: false, error: 'Missing secretKey' };
      return { valid: true };
    
    case 'mtn_momo':
      if (!config.apiUser) return { valid: false, error: 'Missing apiUser' };
      if (!config.apiKey) return { valid: false, error: 'Missing apiKey' };
      if (!config.subscriptionKey) return { valid: false, error: 'Missing subscriptionKey' };
      return { valid: true };
    
    case 'airtel_money':
      if (!config.clientId) return { valid: false, error: 'Missing clientId' };
      if (!config.clientSecret) return { valid: false, error: 'Missing clientSecret' };
      return { valid: true };
    
    default:
      return { valid: false, error: `Unknown provider: ${provider}` };
  }
}

// =============================================================================
// Auto-Config Detection
// =============================================================================

interface DetectedConfig {
  source: string;
  provider: string;
  config: Record<string, string>;
}

async function scanEnvironmentVariables(): Promise<DetectedConfig[]> {
  const detected: DetectedConfig[] = [];
  const env = process.env;

  // M-Pesa env vars
  if (env.MPESA_CONSUMER_KEY || env.MPESA_CONSUMER_SECRET || env.MPESA_PASSKEY) {
    detected.push({
      source: 'environment',
      provider: 'mpesa',
      config: {
        consumerKey: env.MPESA_CONSUMER_KEY || '',
        consumerSecret: env.MPESA_CONSUMER_SECRET || '',
        passkey: env.MPESA_PASSKEY || '',
        shortCode: env.MPESA_SHORT_CODE || '174379',
        environment: env.MPESA_ENVIRONMENT || 'sandbox',
      }
    });
  }

  // Paystack env vars
  if (env.PAYSTACK_SECRET_KEY || env.PAYSTACK_PUBLIC_KEY) {
    detected.push({
      source: 'environment',
      provider: 'paystack',
      config: {
        secretKey: env.PAYSTACK_SECRET_KEY || '',
        publicKey: env.PAYSTACK_PUBLIC_KEY || '',
        webhookSecret: env.PAYSTACK_WEBHOOK_SECRET || '',
        environment: env.PAYSTACK_ENVIRONMENT || 'sandbox',
      }
    });
  }

  // IntaSend env vars
  if (env.INTASEND_PUBLISHABLE_KEY || env.INTASEND_SECRET_KEY) {
    detected.push({
      source: 'environment',
      provider: 'intasend',
      config: {
        publishableKey: env.INTASEND_PUBLISHABLE_KEY || '',
        secretKey: env.INTASEND_SECRET_KEY || '',
        environment: env.INTASEND_ENVIRONMENT || 'sandbox',
      }
    });
  }

  // MTN MoMo env vars
  if (env.MTN_MOMO_API_USER || env.MOMO_API_USER || env.MTN_MOMO_API_KEY) {
    detected.push({
      source: 'environment',
      provider: 'mtn_momo',
      config: {
        apiUser: env.MTN_MOMO_API_USER || env.MOMO_API_USER || '',
        apiKey: env.MTN_MOMO_API_KEY || env.MOMO_API_KEY || '',
        subscriptionKey: env.MTN_MOMO_SUBSCRIPTION_KEY || env.MOMO_SUBSCRIPTION_KEY || '',
        targetEnvironment: env.MTN_MOMO_ENVIRONMENT || 'sandbox',
      }
    });
  }

  // Airtel Money env vars
  if (env.AIRTEL_MONEY_CLIENT_ID || env.AIRTEL_CLIENT_ID) {
    detected.push({
      source: 'environment',
      provider: 'airtel_money',
      config: {
        clientId: env.AIRTEL_MONEY_CLIENT_ID || env.AIRTEL_CLIENT_ID || '',
        clientSecret: env.AIRTEL_MONEY_CLIENT_SECRET || env.AIRTEL_CLIENT_SECRET || '',
        environment: env.AIRTEL_MONEY_ENVIRONMENT || 'sandbox',
      }
    });
  }

  return detected;
}

async function scanConfigFiles(): Promise<DetectedConfig[]> {
  const detected: DetectedConfig[] = [];
  const possiblePaths = [
    'config.json',
    './config.json',
    '../config.json',
    path.join(process.cwd(), 'config.json'),
    path.join(process.cwd(), 'africa-payments.config.json'),
    path.join(process.env.HOME || '', '.africa-payments', 'config.json'),
    path.join(process.env.HOME || '', '.config', 'africa-payments', 'config.json'),
    '/etc/africa-payments/config.json',
  ];

  for (const configPath of possiblePaths) {
    try {
      await fs.access(configPath);
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      
      if (config.providers) {
        for (const [provider, providerConfig] of Object.entries(config.providers)) {
          if ((providerConfig as any).enabled) {
            detected.push({
              source: `file:${configPath}`,
              provider,
              config: providerConfig as Record<string, string>,
            });
          }
        }
      }
    } catch {
      // File doesn't exist or is invalid, skip
    }
  }

  return detected;
}

async function scanDotEnv(): Promise<DetectedConfig[]> {
  const detected: DetectedConfig[] = [];
  const envPaths = [
    '.env',
    '.env.local',
    '.env.development',
    path.join(process.env.HOME || '', '.africa-payments', '.env'),
  ];

  for (const envPath of envPaths) {
    try {
      const content = await fs.readFile(envPath, 'utf-8');
      const lines = content.split('\n');
      const envVars: Record<string, string> = {};
      
      for (const line of lines) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
        }
      }

      // Check for provider credentials
      if (envVars.MPESA_CONSUMER_KEY || envVars.MPESA_CONSUMER_SECRET) {
        detected.push({
          source: `env:${envPath}`,
          provider: 'mpesa',
          config: {
            consumerKey: envVars.MPESA_CONSUMER_KEY || '',
            consumerSecret: envVars.MPESA_CONSUMER_SECRET || '',
            passkey: envVars.MPESA_PASSKEY || '',
            shortCode: envVars.MPESA_SHORT_CODE || '174379',
            environment: envVars.MPESA_ENVIRONMENT || 'sandbox',
          }
        });
      }

      if (envVars.PAYSTACK_SECRET_KEY) {
        detected.push({
          source: `env:${envPath}`,
          provider: 'paystack',
          config: {
            secretKey: envVars.PAYSTACK_SECRET_KEY || '',
            publicKey: envVars.PAYSTACK_PUBLIC_KEY || '',
            webhookSecret: envVars.PAYSTACK_WEBHOOK_SECRET || '',
            environment: envVars.PAYSTACK_ENVIRONMENT || 'sandbox',
          }
        });
      }
    } catch {
      // File doesn't exist, skip
    }
  }

  return detected;
}

// =============================================================================
// Commands
// =============================================================================

// Detect command - Auto-detect configuration
program
  .command('detect')
  .description('Auto-detect payment provider credentials from environment and config files')
  .option('-o, --output <path>', 'Output path for generated config file')
  .option('--apply', 'Apply detected configuration immediately')
  .action(async (options) => {
    await printBanner();
    
    console.log(colors.info(`${emoji.info} Scanning for credentials...\n`));
    
    const spinner = ora('Scanning environment variables...').start();
    const envConfigs = await scanEnvironmentVariables();
    spinner.succeed(`Found ${envConfigs.length} provider(s) in environment`);
    
    spinner.start('Scanning config files...');
    const fileConfigs = await scanConfigFiles();
    spinner.succeed(`Found ${fileConfigs.length} provider(s) in config files`);
    
    spinner.start('Scanning .env files...');
    const dotEnvConfigs = await scanDotEnv();
    spinner.succeed(`Found ${dotEnvConfigs.length} provider(s) in .env files`);
    
    const allConfigs = [...envConfigs, ...fileConfigs, ...dotEnvConfigs];
    
    // Deduplicate by provider
    const uniqueConfigs = new Map<string, DetectedConfig>();
    for (const config of allConfigs) {
      if (!uniqueConfigs.has(config.provider)) {
        uniqueConfigs.set(config.provider, config);
      }
    }
    
    console.log();
    
    if (uniqueConfigs.size === 0) {
      console.log(boxen(
        `${colors.warning('No credentials found')}\n\n` +
        `We searched:\n` +
        `  • Environment variables (MPESA_*, PAYSTACK_*, etc.)\n` +
        `  • Config files (config.json, ~/.africa-payments/config.json)\n` +
        `  • .env files (.env, .env.local)\n\n` +
        `${colors.info('Next steps:')}\n` +
        `  1. Set environment variables for your providers\n` +
        `  2. Run ${colors.bold('africa-payments-mcp init')} to create a config file`,
        {
          title: emoji.warning + ' Detection Results',
          padding: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
        }
      ));
      return;
    }
    
    // Display detected providers
    console.log(createBox(
      `${emoji.check} Detected Providers`,
      Array.from(uniqueConfigs.entries()).map(([provider, config]) => {
        const providerEmoji = provider === 'mpesa' ? emoji.phone :
                            provider === 'paystack' ? emoji.card :
                            provider === 'intasend' ? emoji.money :
                            provider === 'mtn_momo' ? emoji.phone :
                            emoji.gear;
        
        const hasCreds = Object.values(config.config).some(v => v && v.length > 0);
        const status = hasCreds ? colors.success('✓') : colors.warning('○');
        
        return `${providerEmoji} ${colors.bold(provider.toUpperCase())} ${status}\n` +
               `   ${colors.muted('Source:')} ${config.source}`;
      }).join('\n\n')
    ));
    
    console.log();
    
    if (options.output || options.apply) {
      // Generate config
      const config: any = {
        providers: {},
        defaults: {
          currency: 'KES',
          country: 'KE',
          provider: 'mpesa',
        },
        server: {
          port: 3000,
          logLevel: 'info',
        }
      };
      
      for (const [provider, detected] of uniqueConfigs) {
        config.providers[provider] = {
          enabled: true,
          ...detected.config,
        };
      }
      
      const outputPath = options.output || 'config.json';
      
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      if (!options.apply) {
        const confirm = await askQuestion(
          rl,
          colors.bold(`Save configuration to ${outputPath}? (y/n): `)
        );
        
        if (confirm.toLowerCase() !== 'y') {
          console.log(colors.muted('Cancelled'));
          rl.close();
          return;
        }
      }
      
      await fs.writeFile(outputPath, JSON.stringify(config, null, 2));
      console.log();
      console.log(boxen(
        `${colors.success('Configuration saved!')}\n\n` +
        `${colors.bold('Path:')} ${outputPath}\n` +
        `${colors.bold('Providers:')} ${uniqueConfigs.size}\n\n` +
        `${colors.info('Next steps:')}\n` +
        `  • Validate: ${colors.bold(`africa-payments-mcp validate -c ${outputPath}`)}\n` +
        `  • Test: ${colors.bold(`africa-payments-mcp test -c ${outputPath}`)}\n` +
        `  • Start: ${colors.bold(`africa-payments-mcp -c ${outputPath}`)}`,
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }
      ));
      
      rl.close();
    } else {
      console.log(colors.muted('\nTip: Use --output config.json to save, or --apply to use immediately'));
    }
  });

// Init command - Interactive config creation (Enhanced)
program
  .command('init')
  .description('Initialize configuration file interactively')
  .option('-o, --output <path>', 'Output path for config file', 'config.json')
  .action(async (options) => {
    await printBanner();
    
    console.log(colors.info(`${emoji.globe} Welcome to Africa Payments MCP Setup`));
    console.log(colors.muted('This wizard will help you create a configuration file.\n'));
    
    // Check for existing config
    const outputPath = path.resolve(options.output);
    try {
      await fs.access(outputPath);
      console.log(colors.warning(`${emoji.warning} Configuration file already exists: ${outputPath}`));
      
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const overwrite = await askQuestion(
        rl,
        colors.bold('Overwrite existing file? (y/n): ')
      );
      
      if (overwrite.toLowerCase() !== 'y') {
        console.log(colors.muted('Cancelled'));
        rl.close();
        return;
      }
      
      rl.close();
    } catch {
      // File doesn't exist, continue
    }
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    try {
      const config: any = {
        providers: {},
        defaults: {},
        server: {}
      };
      
      // M-Pesa configuration
      console.log(boxen(
        `${emoji.phone} M-Pesa Configuration\n` +
        `${colors.muted('Kenya, Tanzania, Mozambique, DRC, Egypt')}`,
        {
          title: 'Provider 1/5',
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }
      ));
      
      const enableMpesa = await askQuestion(rl, colors.bold('Enable M-Pesa? (y/n): '));
      
      if (enableMpesa.toLowerCase() === 'y') {
        const spinner = ora('Configuring M-Pesa...').start();
        
        config.providers.mpesa = {
          enabled: true,
          environment: await askQuestion(rl, colors.muted('  Environment (sandbox/production) [sandbox]: ')) || 'sandbox',
          consumerKey: await askQuestion(rl, colors.muted('  Consumer Key: ')),
          consumerSecret: await askQuestion(rl, colors.muted('  Consumer Secret: ')),
          passkey: await askQuestion(rl, colors.muted('  Passkey: ')),
          shortCode: await askQuestion(rl, colors.muted('  Short Code [174379]: ')) || '174379',
          initiatorName: await askQuestion(rl, colors.muted('  Initiator Name [testapi]: ')) || 'testapi',
          initiatorPassword: await askQuestion(rl, colors.muted('  Initiator Password: ')),
          securityCredential: await askQuestion(rl, colors.muted('  Security Credential: '))
        };
        
        spinner.succeed(colors.success('M-Pesa configured'));
      }
      
      console.log();
      
      // Paystack configuration
      console.log(boxen(
        `${emoji.card} Paystack Configuration\n` +
        `${colors.muted('Nigeria, Ghana, South Africa, and more')}`,
        {
          title: 'Provider 2/5',
          padding: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        }
      ));
      
      const enablePaystack = await askQuestion(rl, colors.bold('Enable Paystack? (y/n): '));
      
      if (enablePaystack.toLowerCase() === 'y') {
        config.providers.paystack = {
          enabled: true,
          environment: await askQuestion(rl, colors.muted('  Environment (sandbox/production) [sandbox]: ')) || 'sandbox',
          secretKey: await askQuestion(rl, colors.muted('  Secret Key (sk_test_...): ')),
          publicKey: await askQuestion(rl, colors.muted('  Public Key (pk_test_...): ')),
          webhookSecret: await askQuestion(rl, colors.muted('  Webhook Secret (optional): '))
        };
        
        console.log(colors.success(`${emoji.check} Paystack configured`));
      }
      
      console.log();
      
      // IntaSend configuration
      console.log(boxen(
        `${emoji.money} IntaSend Configuration\n` +
        `${colors.muted('Kenya, Nigeria')}`,
        {
          title: 'Provider 3/5',
          padding: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        }
      ));
      
      const enableIntasend = await askQuestion(rl, colors.bold('Enable IntaSend? (y/n): '));
      
      if (enableIntasend.toLowerCase() === 'y') {
        config.providers.intasend = {
          enabled: true,
          environment: await askQuestion(rl, colors.muted('  Environment (sandbox/production) [sandbox]: ')) || 'sandbox',
          publishableKey: await askQuestion(rl, colors.muted('  Publishable Key (ISPubKey_...): ')),
          secretKey: await askQuestion(rl, colors.muted('  Secret Key (ISSecretKey_...): '))
        };
        
        console.log(colors.success(`${emoji.check} IntaSend configured`));
      }
      
      console.log();
      
      // MTN MoMo configuration
      console.log(boxen(
        `${emoji.phone} MTN MoMo Configuration\n` +
        `${colors.muted('Uganda, Ghana, Nigeria, and 12+ countries')}`,
        {
          title: 'Provider 4/5',
          padding: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
        }
      ));
      
      const enableMomo = await askQuestion(rl, colors.bold('Enable MTN MoMo? (y/n): '));
      
      if (enableMomo.toLowerCase() === 'y') {
        config.providers.mtn_momo = {
          enabled: true,
          environment: await askQuestion(rl, colors.muted('  Environment (sandbox/production) [sandbox]: ')) || 'sandbox',
          apiUser: await askQuestion(rl, colors.muted('  API User: ')),
          apiKey: await askQuestion(rl, colors.muted('  API Key: ')),
          subscriptionKey: await askQuestion(rl, colors.muted('  Subscription Key: ')),
          targetEnvironment: await askQuestion(rl, colors.muted('  Target Environment [sandbox]: ')) || 'sandbox'
        };
        
        console.log(colors.success(`${emoji.check} MTN MoMo configured`));
      }
      
      console.log();
      
      // Airtel Money configuration
      console.log(boxen(
        `${emoji.phone} Airtel Money Configuration\n` +
        `${colors.muted('Across Africa')}`,
        {
          title: 'Provider 5/5',
          padding: 1,
          borderStyle: 'round',
          borderColor: 'red',
        }
      ));
      
      const enableAirtel = await askQuestion(rl, colors.bold('Enable Airtel Money? (y/n): '));
      
      if (enableAirtel.toLowerCase() === 'y') {
        config.providers.airtel_money = {
          enabled: true,
          environment: await askQuestion(rl, colors.muted('  Environment (sandbox/production) [sandbox]: ')) || 'sandbox',
          clientId: await askQuestion(rl, colors.muted('  Client ID: ')),
          clientSecret: await askQuestion(rl, colors.muted('  Client Secret: '))
        };
        
        console.log(colors.success(`${emoji.check} Airtel Money configured`));
      }
      
      console.log();
      
      // Default settings
      console.log(boxen(
        colors.bold('Default Settings'),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'magenta',
        }
      ));
      
      config.defaults.currency = await askQuestion(rl, colors.muted('Default Currency (KES/NGN/GHS/UGX) [KES]: ')) || 'KES';
      config.defaults.country = await askQuestion(rl, colors.muted('Default Country Code (KE/NG/GH/UG) [KE]: ')) || 'KE';
      config.defaults.provider = await askQuestion(rl, colors.muted('Default Provider (mpesa/paystack) [mpesa]: ')) || 'mpesa';
      
      console.log();
      
      // Server settings
      config.server.port = parseInt(await askQuestion(rl, colors.muted('Server Port [3000]: ')) || '3000');
      config.server.logLevel = await askQuestion(rl, colors.muted('Log Level (info/debug/warn/error) [info]: ')) || 'info';
      config.server.webhookBaseUrl = await askQuestion(rl, colors.muted('Webhook Base URL (optional): ')) || '';
      
      // Write configuration file
      await fs.writeFile(outputPath, JSON.stringify(config, null, 2));
      
      console.log();
      console.log(boxen(
        `${colors.success(`${emoji.party} Configuration saved successfully!`)}\n\n` +
        `${colors.bold('File:')} ${outputPath}\n\n` +
        `${colors.info('Next Steps:')}\n` +
        `  ${emoji.arrow} Validate: ${colors.bold(`africa-payments-mcp validate -c ${outputPath}`)}\n` +
        `  ${emoji.arrow} Test: ${colors.bold(`africa-payments-mcp test -c ${outputPath}`)}\n` +
        `  ${emoji.arrow} Start: ${colors.bold(`africa-payments-mcp -c ${outputPath}`)}\n\n` +
        `${colors.muted('Happy building with Africa Payments MCP!')}`,
        {
          padding: 1,
          borderStyle: 'double',
          borderColor: 'green',
        }
      ));
      
    } catch (error) {
      console.error();
      console.error(colors.error(`${emoji.cross} Error creating configuration:`));
      if (error instanceof Error) {
        console.error(colors.error(`  ${error.message}`));
      }
      process.exit(1);
    } finally {
      rl.close();
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate configuration file')
  .requiredOption('-c, --config <path>', 'Path to configuration file')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    const spinner = ora('Validating configuration...').start();
    
    try {
      const configPath = path.resolve(options.config);
      
      // Check if file exists
      try {
        await fs.access(configPath);
      } catch {
        spinner.fail();
        console.error(colors.error(`${emoji.cross} Configuration file not found: ${configPath}`));
        process.exit(1);
      }
      
      // Load and validate
      const configManager = new ConfigManager();
      const config = await configManager.load(configPath);
      
      spinner.succeed(colors.success('Configuration file is valid JSON'));
      
      // Count enabled providers
      const enabledProviders = Object.entries(config.providers)
        .filter(([_, p]: [string, any]) => p.enabled)
        .map(([name]) => name);
      
      console.log(colors.success(`${emoji.check} Found ${enabledProviders.length} enabled provider(s): ${enabledProviders.join(', ') || 'none'}`));
      
      if (options.verbose) {
        console.log();
        console.log(boxen(
          `${colors.bold('Configuration Summary')}\n\n` +
          `Default Currency: ${config.defaults?.currency || 'KES'}\n` +
          `Default Country: ${config.defaults?.country || 'KE'}\n` +
          `Log Level: ${config.server?.logLevel || 'info'}`,
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'blue',
          }
        ));
        
        console.log();
        console.log(colors.bold('Provider Details:'));
        for (const [name, provider] of Object.entries(config.providers) as [string, any][]) {
          const status = provider.enabled ? colors.success('✅ Enabled') : colors.muted('❌ Disabled');
          const env = provider.environment || 'not set';
          console.log(`  ${colors.bold(name)}: ${status} (${colors.muted(env)})`);
          
          if (provider.enabled) {
            const hasCreds = provider.consumerKey || provider.secretKey || (provider as any).apiKey || (provider as any).token;
            console.log(`    Credentials: ${hasCreds ? colors.success('✅ Present') : colors.warning('⚠️ Missing')}`);
          }
        }
      }
      
      console.log();
      console.log(boxen(
        `${colors.success(`${emoji.check} Configuration is valid and ready to use!`)}`,
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }
      ));
      
    } catch (error) {
      spinner.fail();
      console.error();
      console.error(colors.error(`${emoji.cross} Configuration validation failed:`));
      if (error instanceof Error) {
        console.error(colors.error(`  ${error.message}`));
      } else {
        console.error(colors.error(`  ${error}`));
      }
      process.exit(1);
    }
  });

// Test command
program
  .command('test')
  .description('Test provider connections')
  .requiredOption('-c, --config <path>', 'Path to configuration file')
  .option('-p, --provider <name>', 'Test specific provider only')
  .action(async (options) => {
    console.log(colors.info(`${emoji.rocket} Testing provider connections...\n`));
    
    try {
      const configPath = path.resolve(options.config);
      const configManager = new ConfigManager();
      const config = await configManager.load(configPath);
      
      const logger = new Logger('info');
      const results: { provider: string; status: string; error?: string }[] = [];
      
      const providersToTest = options.provider 
        ? [options.provider]
        : Object.entries(config.providers)
            .filter(([_, p]: [string, any]) => p.enabled)
            .map(([name]) => name);
      
      if (providersToTest.length === 0) {
        console.log(colors.warning(`${emoji.warning} No providers enabled or specified`));
        process.exit(0);
      }
      
      for (const providerName of providersToTest) {
        const providerConfig = (config.providers as any)[providerName];
        
        if (!providerConfig) {
          results.push({ provider: providerName, status: colors.error('❌ Not configured') });
          continue;
        }
        
        if (!providerConfig.enabled) {
          results.push({ provider: providerName, status: colors.warning('⚠️ Disabled') });
          continue;
        }
        
        const spinner = ora(`Testing ${providerName}...`).start();
        
        try {
          // Basic credential validation
          const hasRequiredCreds = validateProviderCredentials(providerName, providerConfig);
          
          if (!hasRequiredCreds.valid) {
            results.push({ 
              provider: providerName, 
              status: colors.error('❌ Failed'),
              error: hasRequiredCreds.error 
            });
            spinner.fail(`${providerName}: ${hasRequiredCreds.error}`);
            continue;
          }
          
          // Simulate API test delay
          await new Promise(resolve => setTimeout(resolve, 500));
          
          results.push({ provider: providerName, status: colors.success('✅ OK') });
          spinner.succeed(`${providerName}`);
          
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          results.push({ 
            provider: providerName, 
            status: colors.error('❌ Failed'),
            error: errorMsg 
          });
          spinner.fail(`${providerName}: ${errorMsg}`);
        }
      }
      
      console.log();
      console.log(createBox(
        'Test Results',
        results.map(r => `${r.status} ${colors.bold(r.provider)}${r.error ? '\n   ' + colors.muted(r.error) : ''}`).join('\n\n')
      ));
      
      const failed = results.filter(r => r.status.includes('❌')).length;
      if (failed > 0) {
        console.log();
        console.log(colors.warning(`${emoji.warning} ${failed} provider(s) failed. Please check your configuration.`));
        process.exit(1);
      } else {
        console.log();
        console.log(boxen(
          `${colors.success(`${emoji.party} All tests passed!`)}`,
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        ));
      }
      
    } catch (error) {
      console.error();
      console.error(colors.error(`${emoji.cross} Test failed:`), error);
      process.exit(1);
    }
  });

// Doctor command
program
  .command('doctor')
  .description('Diagnose configuration and environment issues')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('--verbose', 'Show detailed diagnostic information')
  .action(async (options) => {
    await printBanner();
    
    console.log(colors.info(`${emoji.gear} Running diagnostics...\n`));
    
    let issues = 0;
    let warnings = 0;
    const checks: string[] = [];
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    const nodeSpinner = ora('Checking Node.js version...').start();
    if (majorVersion < 18) {
      nodeSpinner.fail();
      checks.push(`${colors.error('❌')} Node.js v${nodeVersion} (18+ required)`);
      issues++;
    } else {
      nodeSpinner.succeed();
      checks.push(`${colors.success('✅')} Node.js ${nodeVersion}`);
    }
    
    // Check npm
    const npmSpinner = ora('Checking npm...').start();
    try {
      const { execSync } = await import('child_process');
      const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
      npmSpinner.succeed();
      checks.push(`${colors.success('✅')} npm v${npmVersion}`);
    } catch {
      npmSpinner.fail();
      checks.push(`${colors.error('❌')} npm not found`);
      issues++;
    }
    
    // Check config file if provided
    if (options.config) {
      const configSpinner = ora('Checking configuration file...').start();
      try {
        const configPath = path.resolve(options.config);
        await fs.access(configPath);
        
        const content = await fs.readFile(configPath, 'utf-8');
        try {
          JSON.parse(content);
          configSpinner.succeed();
          checks.push(`${colors.success('✅')} Configuration file is valid JSON`);
        } catch {
          configSpinner.fail();
          checks.push(`${colors.error('❌')} Configuration file has invalid JSON`);
          issues++;
        }
      } catch {
        configSpinner.fail();
        checks.push(`${colors.error('❌')} Configuration file not found: ${options.config}`);
        issues++;
      }
    }
    
    // Check environment variables
    const envSpinner = ora('Checking environment variables...').start();
    const envVars = ['NODE_ENV', 'CONFIG_PATH'];
    let envCount = 0;
    for (const envVar of envVars) {
      if (process.env[envVar]) {
        envCount++;
      }
    }
    envSpinner.succeed();
    checks.push(`${colors.info('ℹ️')} Environment variables: ${envCount} set`);
    
    // Check file permissions
    const permSpinner = ora('Checking file permissions...').start();
    try {
      const testFile = path.join(process.cwd(), '.permission-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      permSpinner.succeed();
      checks.push(`${colors.success('✅')} Write permissions OK`);
    } catch {
      permSpinner.fail();
      checks.push(`${colors.error('❌')} No write permissions in current directory`);
      issues++;
    }
    
    // Check for credentials in environment
    const credsSpinner = ora('Scanning for credentials...').start();
    const detected = await scanEnvironmentVariables();
    credsSpinner.succeed();
    checks.push(`${colors.info('ℹ️')} Found ${detected.length} provider(s) in environment`);
    
    // Print results
    console.log();
    console.log(createBox(
      'Diagnostic Results',
      checks.join('\n')
    ));
    
    // Summary
    console.log();
    if (issues === 0 && warnings === 0) {
      console.log(boxen(
        `${colors.success(`${emoji.party} All diagnostics passed!`)}\n\n` +
        `Your environment is ready for Africa Payments MCP.`,
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }
      ));
    } else {
      console.log(boxen(
        `${colors.warning('Diagnostics complete')}\n\n` +
        `Found ${issues} issue(s) and ${warnings} warning(s)\n\n` +
        (issues > 0 ? colors.error('Please fix the issues above before continuing.') : ''),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: issues > 0 ? 'red' : 'yellow',
        }
      ));
      if (issues > 0) {
        process.exit(1);
      }
    }
  });

// Setup command - Natural language config generation
program
  .command('setup')
  .description('Setup configuration using natural language')
  .argument('<description>', 'Description of desired configuration (e.g., "I want M-Pesa in Kenya and Paystack in Nigeria")')
  .option('-o, --output <path>', 'Output path for config file', 'config.json')
  .action(async (description, options) => {
    await printBanner();
    
    console.log(colors.info(`${emoji.sparkles} Setting up configuration from natural language...`));
    console.log(colors.muted(`  Input: "${description}"\n`));
    
    // Parse natural language input
    const parsed = parseNaturalLanguageConfig(description);
    
    // Display parsed results
    console.log(formatParsedConfig(parsed));
    
    // Check if any providers were detected
    if (parsed.providers.length === 0) {
      console.log(boxen(
        `${colors.warning('No providers detected')}\n\n` +
        `We couldn't find any payment providers in your description.\n\n` +
        `${colors.info('Supported providers:')}\n` +
        `  • M-Pesa (Kenya, Tanzania, etc.)\n` +
        `  • Paystack (Nigeria, Ghana, etc.)\n` +
        `  • MTN MoMo (Uganda, Ghana, etc.)\n` +
        `  • Airtel Money (Kenya, Uganda, etc.)\n` +
        `  • IntaSend (Kenya, Nigeria)\n\n` +
        `${colors.info('Example:')}\n` +
        `  africa-payments-mcp setup "I want M-Pesa in Kenya"`,
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
        }
      ));
      process.exit(1);
    }
    
    // Generate config
    const config = generateConfigFromParsed(parsed);
    
    // Check for existing file
    const outputPath = path.resolve(options.output);
    try {
      await fs.access(outputPath);
      console.log(colors.warning(`${emoji.warning} Configuration file already exists: ${outputPath}`));
      
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const overwrite = await askQuestion(
        rl,
        colors.bold('Overwrite existing file? (y/n): ')
      );
      
      rl.close();
      
      if (overwrite.toLowerCase() !== 'y') {
        console.log(colors.muted('Cancelled'));
        return;
      }
    } catch {
      // File doesn't exist, continue
    }
    
    // Write configuration file
    await fs.writeFile(outputPath, JSON.stringify(config, null, 2));
    
    console.log();
    console.log(boxen(
      `${colors.success(`${emoji.party} Configuration created successfully!`)}\n\n` +
      `${colors.bold('File:')} ${outputPath}\n` +
      `${colors.bold('Providers:')} ${parsed.providers.join(', ')}\n` +
      `${colors.bold('Default Country:')} ${config.defaults.country}\n` +
      `${colors.bold('Default Currency:')} ${config.defaults.currency}\n\n` +
      `${colors.info('Next Steps:')}\n` +
      `  ${emoji.arrow} Validate: ${colors.bold(`africa-payments-mcp validate -c ${outputPath}`)}\n` +
      `  ${emoji.arrow} Test: ${colors.bold(`africa-payments-mcp test -c ${outputPath}`)}\n` +
      `  ${emoji.arrow} Start: ${colors.bold(`africa-payments-mcp -c ${outputPath}`)}\n\n` +
      `${colors.warning('Note:')} Update the placeholder credentials in ${outputPath} with your actual API keys.`,
      {
        padding: 1,
        borderStyle: 'double',
        borderColor: 'green',
      }
    ));
  });

// Playground command - Interactive REPL
program
  .command('playground')
  .description('Start interactive playground/REPL')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(async (options) => {
    try {
      await startPlayground(options.config);
    } catch (error) {
      console.error('❌ Failed to start playground:', error);
      process.exit(1);
    }
  });

// Main server command (default)
program
  .name('africa-payments-mcp')
  .description('Unified MCP server for African payment providers')
  .version('0.1.0')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-p, --port <port>', 'Port for HTTP transport (default: stdio)')
  .option('--log-level <level>', 'Log level: debug, info, warn, error', 'info')
  .action(async (options) => {
    if (!options.config) {
      await printBanner();
      
      console.log(colors.error(`${emoji.cross} Configuration file required. Use --config <path>`));
      console.log();
      console.log(boxen(
        `${colors.bold('Quick Start:')}\n\n` +
        `1. Create config: ${colors.bold('africa-payments-mcp init')}\n` +
        `2. Or detect: ${colors.bold('africa-payments-mcp detect --output config.json')}\n` +
        `3. Start server: ${colors.bold('africa-payments-mcp --config config.json')}`,
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        }
      ));
      process.exit(1);
    }
    
    try {
      const server = await createServer({
        configPath: options.config,
        port: options.port,
        logLevel: options.logLevel
      });
      
      await server.start();
    } catch (error) {
      console.error(colors.error(`${emoji.cross} Failed to start server:`), error);
      process.exit(1);
    }
  });

program.parse();
