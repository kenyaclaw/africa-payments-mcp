#!/usr/bin/env node

/**
 * Africa Payments MCP Server
 * Main entry point - delegates to CLI
 */

import { program } from './cli.js';

// Run the CLI
program.parse();

// Export SDK for programmatic usage
export { AfricaPaymentsClient, createServer, AfricaPaymentsMCPServer } from './server.js';
export * from './types/index.js';
