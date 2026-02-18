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
export { AfricaPaymentsMCPServer as AfricaPaymentsMCPFullServer, createMCPServer } from './mcp-server.js';
export * from './types/index.js';

// Export observability utilities
export * from './utils/observability.js';
export { WebhookServer, createWebhookServer } from './webhook/server.js';

// Export The Continental Agent Swarm
export * from './agents/index.js';

// Export Autonomous Operations
export * from './autonomous/index.js';
