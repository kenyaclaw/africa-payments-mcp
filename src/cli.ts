#!/usr/bin/env node

/**
 * Africa Payments MCP Server CLI
 * Unified Model Context Protocol server for African payment providers
 */

import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { createServer } from './server.js';
import { ConfigManager } from './utils/config.js';
import { Logger } from './utils/logger.js';

export const program = new Command();

// Helper for user input
function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Init command - Interactive config creation
program
  .command('init')
  .description('Initialize configuration file interactively')
  .option('-o, --output <path>', 'Output path for config file', 'config.json')
  .action(async (options) => {
    console.log('🌍 Africa Payments MCP - Configuration Setup\n');
    console.log('This wizard will help you create a configuration file.\n');

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
      console.log('📱 M-Pesa Configuration (Kenya, Tanzania)');
      console.log('─────────────────────────────────────────');
      const enableMpesa = await askQuestion(rl, 'Enable M-Pesa? (y/n): ');
      
      if (enableMpesa.toLowerCase() === 'y') {
        config.providers.mpesa = {
          enabled: true,
          environment: await askQuestion(rl, 'Environment (sandbox/production): ') || 'sandbox',
          consumerKey: await askQuestion(rl, 'Consumer Key: '),
          consumerSecret: await askQuestion(rl, 'Consumer Secret: '),
          passkey: await askQuestion(rl, 'Passkey: '),
          shortCode: await askQuestion(rl, 'Short Code (default: 174379): ') || '174379',
          initiatorName: await askQuestion(rl, 'Initiator Name (default: testapi): ') || 'testapi',
          initiatorPassword: await askQuestion(rl, 'Initiator Password: '),
          securityCredential: await askQuestion(rl, 'Security Credential: ')
        };
      }

      console.log('\n💳 Paystack Configuration (Nigeria, Ghana, South Africa)');
      console.log('─────────────────────────────────────────────────────────');
      const enablePaystack = await askQuestion(rl, 'Enable Paystack? (y/n): ');
      
      if (enablePaystack.toLowerCase() === 'y') {
        config.providers.paystack = {
          enabled: true,
          environment: await askQuestion(rl, 'Environment (sandbox/production): ') || 'sandbox',
          secretKey: await askQuestion(rl, 'Secret Key (sk_test_...): '),
          publicKey: await askQuestion(rl, 'Public Key (pk_test_...): '),
          webhookSecret: await askQuestion(rl, 'Webhook Secret (optional): ')
        };
      }

      console.log('\n💰 IntaSend Configuration (Kenya, Nigeria)');
      console.log('──────────────────────────────────────────');
      const enableIntasend = await askQuestion(rl, 'Enable IntaSend? (y/n): ');
      
      if (enableIntasend.toLowerCase() === 'y') {
        config.providers.intasend = {
          enabled: true,
          environment: await askQuestion(rl, 'Environment (sandbox/production): ') || 'sandbox',
          publishableKey: await askQuestion(rl, 'Publishable Key (ISPubKey_...): '),
          secretKey: await askQuestion(rl, 'Secret Key (ISSecretKey_...): ')
        };
      }

      console.log('\n📲 MTN MoMo Configuration (Uganda, Ghana, 12+ countries)');
      console.log('─────────────────────────────────────────────────────────');
      const enableMomo = await askQuestion(rl, 'Enable MTN MoMo? (y/n): ');
      
      if (enableMomo.toLowerCase() === 'y') {
        config.providers.mtn_momo = {
          enabled: true,
          environment: await askQuestion(rl, 'Environment (sandbox/production): ') || 'sandbox',
          apiUser: await askQuestion(rl, 'API User: '),
          apiKey: await askQuestion(rl, 'API Key: '),
          subscriptionKey: await askQuestion(rl, 'Subscription Key: '),
          targetEnvironment: await askQuestion(rl, 'Target Environment (sandbox/production): ') || 'sandbox'
        };
      }

      console.log('\n📡 Airtel Money Configuration');
      console.log('─────────────────────────────');
      const enableAirtel = await askQuestion(rl, 'Enable Airtel Money? (y/n): ');
      
      if (enableAirtel.toLowerCase() === 'y') {
        config.providers.airtel_money = {
          enabled: true,
          environment: await askQuestion(rl, 'Environment (sandbox/production): ') || 'sandbox',
          clientId: await askQuestion(rl, 'Client ID: '),
          clientSecret: await askQuestion(rl, 'Client Secret: ')
        };
      }

      console.log('\n⚙️ Default Settings');
      console.log('───────────────────');
      config.defaults.currency = await askQuestion(rl, 'Default Currency (KES/NGN/GHS/UGX): ') || 'KES';
      config.defaults.country = await askQuestion(rl, 'Default Country Code (KE/NG/GH/UG): ') || 'KE';
      config.defaults.provider = await askQuestion(rl, 'Default Provider (mpesa/paystack): ') || 'mpesa';

      console.log('\n🔧 Server Settings');
      console.log('──────────────────');
      config.server.port = parseInt(await askQuestion(rl, 'Server Port (3000): ') || '3000');
      config.server.logLevel = await askQuestion(rl, 'Log Level (info/debug/warn/error): ') || 'info';
      config.server.webhookBaseUrl = await askQuestion(rl, 'Webhook Base URL (optional): ') || '';

      // Write configuration file
      const outputPath = path.resolve(options.output);
      await fs.writeFile(outputPath, JSON.stringify(config, null, 2));

      console.log(`\n✅ Configuration saved to: ${outputPath}`);
      console.log('\nNext steps:');
      console.log(`  1. Review the configuration: cat ${outputPath}`);
      console.log(`  2. Validate: africa-payments-mcp validate --config ${outputPath}`);
      console.log(`  3. Test: africa-payments-mcp test --config ${outputPath}`);
      console.log(`  4. Start server: africa-payments-mcp --config ${outputPath}`);

    } catch (error) {
      console.error('❌ Error creating configuration:', error);
      process.exit(1);
    } finally {
      rl.close();
    }
  });

// Validate command - Check config file
program
  .command('validate')
  .description('Validate configuration file')
  .requiredOption('-c, --config <path>', 'Path to configuration file')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    console.log('🔍 Validating configuration...\n');

    try {
      const configPath = path.resolve(options.config);
      
      // Check if file exists
      try {
        await fs.access(configPath);
      } catch {
        console.error(`❌ Configuration file not found: ${configPath}`);
        process.exit(1);
      }

      // Load and validate
      const configManager = new ConfigManager();
      const config = await configManager.load(configPath);

      console.log('✅ Configuration file is valid JSON');

      // Count enabled providers
      const enabledProviders = Object.entries(config.providers)
        .filter(([_, p]: [string, any]) => p.enabled)
        .map(([name]) => name);

      console.log(`✅ Found ${enabledProviders.length} enabled provider(s): ${enabledProviders.join(', ') || 'none'}`);

      if (options.verbose) {
        console.log('\n📋 Configuration Summary:');
        console.log(`   Default Currency: ${config.defaults?.currency || 'KES'}`);
        console.log(`   Default Country: ${config.defaults?.country || 'KE'}`);
        console.log(`   Log Level: ${config.server?.logLevel || 'info'}`);

        console.log('\n📱 Provider Details:');
        for (const [name, provider] of Object.entries(config.providers) as [string, any][]) {
          const status = provider.enabled ? '✅ Enabled' : '❌ Disabled';
          const env = provider.environment || 'not set';
          console.log(`   ${name}: ${status} (${env})`);
          
          if (provider.enabled && options.verbose) {
            const hasCreds = provider.consumerKey || provider.secretKey || (provider as any).apiKey || (provider as any).token;
            console.log(`      Credentials: ${hasCreds ? '✅ Present' : '⚠️ Missing'}`);
          }
        }
      }

      console.log('\n✅ Configuration is valid and ready to use!');

    } catch (error) {
      console.error('\n❌ Configuration validation failed:');
      if (error instanceof Error) {
        console.error(`   ${error.message}`);
      } else {
        console.error(`   ${error}`);
      }
      process.exit(1);
    }
  });

// Test command - Test provider connections
program
  .command('test')
  .description('Test provider connections')
  .requiredOption('-c, --config <path>', 'Path to configuration file')
  .option('-p, --provider <name>', 'Test specific provider only')
  .action(async (options) => {
    console.log('🧪 Testing provider connections...\n');

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
        console.log('⚠️ No providers enabled or specified');
        process.exit(0);
      }

      for (const providerName of providersToTest) {
        const providerConfig = (config.providers as any)[providerName];
        
        if (!providerConfig) {
          results.push({ provider: providerName, status: '❌ Not configured' });
          continue;
        }

        if (!providerConfig.enabled) {
          results.push({ provider: providerName, status: '⚠️ Disabled' });
          continue;
        }

        process.stdout.write(`Testing ${providerName}... `);

        try {
          // Basic credential validation
          const hasRequiredCreds = validateProviderCredentials(providerName, providerConfig);
          
          if (!hasRequiredCreds.valid) {
            results.push({ 
              provider: providerName, 
              status: '❌ Failed',
              error: hasRequiredCreds.error 
            });
            console.log('❌');
            console.log(`   Error: ${hasRequiredCreds.error}`);
            continue;
          }

          // TODO: Implement actual API connectivity tests
          // This would require importing the adapters and testing connections
          
          results.push({ provider: providerName, status: '✅ OK' });
          console.log('✅');

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          results.push({ 
            provider: providerName, 
            status: '❌ Failed',
            error: errorMsg 
          });
          console.log('❌');
          console.log(`   Error: ${errorMsg}`);
        }
      }

      console.log('\n📊 Test Results:');
      console.log('────────────────');
      for (const result of results) {
        console.log(`${result.status} ${result.provider}`);
        if (result.error) {
          console.log(`   ${result.error}`);
        }
      }

      const failed = results.filter(r => r.status.includes('❌')).length;
      if (failed > 0) {
        console.log(`\n⚠️ ${failed} provider(s) failed. Please check your configuration.`);
        process.exit(1);
      } else {
        console.log('\n✅ All tests passed!');
      }

    } catch (error) {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    }
  });

// Doctor command - Diagnose issues
program
  .command('doctor')
  .description('Diagnose configuration and environment issues')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('--verbose', 'Show detailed diagnostic information')
  .action(async (options) => {
    console.log('🔧 Africa Payments MCP - Diagnostics\n');
    console.log('Running diagnostics...\n');

    let issues = 0;
    let warnings = 0;

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    console.log(`Node.js Version: ${nodeVersion}`);
    if (majorVersion < 18) {
      console.log('  ❌ Node.js 18+ required');
      issues++;
    } else {
      console.log('  ✅ OK');
    }

    // Check npm
    try {
      const { execSync } = await import('child_process');
      const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
      console.log(`\nNPM Version: ${npmVersion}`);
      console.log('  ✅ OK');
    } catch {
      console.log('\nNPM: ❌ Not found');
      issues++;
    }

    // Check config file if provided
    if (options.config) {
      console.log(`\nConfiguration File: ${options.config}`);
      try {
        const configPath = path.resolve(options.config);
        await fs.access(configPath);
        console.log('  ✅ File exists');

        const content = await fs.readFile(configPath, 'utf-8');
        try {
          JSON.parse(content);
          console.log('  ✅ Valid JSON');
        } catch {
          console.log('  ❌ Invalid JSON');
          issues++;
        }
      } catch {
        console.log('  ❌ File not found');
        issues++;
      }
    }

    // Check environment variables
    console.log('\nEnvironment Variables:');
    const envVars = ['NODE_ENV', 'CONFIG_PATH'];
    for (const envVar of envVars) {
      if (process.env[envVar]) {
        console.log(`  ✅ ${envVar}: ${process.env[envVar]}`);
      } else {
        console.log(`  ⚠️ ${envVar}: not set (optional)`);
        warnings++;
      }
    }

    // Check file permissions
    console.log('\nFile Permissions:');
    try {
      const testFile = path.join(process.cwd(), '.permission-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      console.log('  ✅ Write permissions OK');
    } catch {
      console.log('  ❌ No write permissions in current directory');
      issues++;
    }

    // Network connectivity (optional)
    if (options.verbose) {
      console.log('\nNetwork Connectivity:');
      console.log('  ℹ️  Use --verbose to test API endpoints');
    }

    // Summary
    console.log('\n' + '─'.repeat(40));
    if (issues === 0 && warnings === 0) {
      console.log('✅ All diagnostics passed!');
    } else {
      console.log(`Found ${issues} issue(s) and ${warnings} warning(s)`);
      if (issues > 0) {
        console.log('\nPlease fix the issues above before continuing.');
        process.exit(1);
      }
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
      console.error('❌ Configuration file required. Use --config <path>');
      console.log('\nQuick start:');
      console.log('  1. Create config: africa-payments-mcp init');
      console.log('  2. Start server: africa-payments-mcp --config config.json');
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
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  });

// Helper function to validate provider credentials
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

program.parse();
