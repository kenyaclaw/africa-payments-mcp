#!/usr/bin/env node
/**
 * Webhook Server Test Script
 * 
 * This script demonstrates how to:
 * 1. Start the webhook server
 * 2. Register event handlers
 * 3. Test webhooks with sample payloads
 * 
 * Usage: npx ts-node examples/webhook-test.ts
 */

import { Logger } from '../src/utils/logger.js';
import { 
  createWebhookServer,
  getGlobalEventEmitter,
  PaymentEventData 
} from '../src/webhook/index.js';
import {
  mpesaStkSuccessPayload,
  paystackChargeSuccessPayload,
  mtnMomoRequestToPaySuccessPayload,
  intasendPaymentSuccessPayload,
  generatePaystackSignature,
  generateIntasendSignature
} from './webhook-payloads.js';

// Configuration
const PORT = 3001;
const WEBHOOK_SECRETS = {
  paystack: 'sk_test_xxxxxxxxxxxxxxxx',
  intasend: 'ints_test_xxxxxxxxxxxxxx',
};

async function main() {
  const logger = new Logger('debug');
  
  console.log('🚀 Starting Webhook Server Test...\n');

  // Get the global event emitter and register handlers
  const eventEmitter = getGlobalEventEmitter(logger);

  // Register event handlers
  eventEmitter
    .onPaymentEvent('payment.success', (data: PaymentEventData) => {
      console.log('✅ Payment Success Event:');
      console.log(`   Provider: ${data.provider}`);
      console.log(`   Transaction ID: ${data.transaction?.providerTransactionId}`);
      console.log(`   Amount: ${data.transaction?.amount.amount} ${data.transaction?.amount.currency}`);
      console.log(`   Customer: ${data.transaction?.customer.name || data.transaction?.customer.phone?.formatted || 'N/A'}`);
      console.log();
    })
    .onPaymentEvent('payment.failed', (data: PaymentEventData) => {
      console.log('❌ Payment Failed Event:');
      console.log(`   Provider: ${data.provider}`);
      console.log(`   Reason: ${data.transaction?.failureReason || 'Unknown'}`);
      console.log();
    })
    .onPaymentEvent('transfer.success', (data: PaymentEventData) => {
      console.log('💸 Transfer Success Event:');
      console.log(`   Provider: ${data.provider}`);
      console.log(`   Amount: ${data.transaction?.amount.amount} ${data.transaction?.amount.currency}`);
      console.log();
    })
    .onWebhookReceived((event) => {
      console.log(`📨 Webhook Received: ${event.provider} - ${event.eventType}`);
    })
    .onWebhookError((data) => {
      console.log(`🚨 Webhook Error: ${data.provider} - ${data.error}`);
    });

  // Create and start the webhook server
  const server = createWebhookServer({
    port: PORT,
    secrets: WEBHOOK_SECRETS,
    logger,
    eventEmitter,
  });

  await server.start();

  // Test webhooks using curl commands
  console.log('\n📡 Testing Webhooks...\n');

  // Test M-Pesa webhook
  console.log('Testing M-Pesa webhook...');
  await testMpesaWebhook();

  // Wait a bit between tests
  await sleep(500);

  // Test Paystack webhook
  console.log('Testing Paystack webhook...');
  await testPaystackWebhook();

  await sleep(500);

  // Test MTN MoMo webhook
  console.log('Testing MTN MoMo webhook...');
  await testMtnMomoWebhook();

  await sleep(500);

  // Test IntaSend webhook
  console.log('Testing IntaSend webhook...');
  await testIntasendWebhook();

  console.log('\n✅ All tests completed!');
  console.log(`\n📊 View logs at: http://localhost:${PORT}/webhooks/logs`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log('\nPress Ctrl+C to stop the server\n');
}

// Test functions using fetch (Node 18+)
async function testMpesaWebhook() {
  try {
    const response = await fetch(`http://localhost:${PORT}/webhooks/mpesa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mpesaStkSuccessPayload),
    });
    const data = await response.json();
    console.log(`   Response: ${JSON.stringify(data)}\n`);
  } catch (error) {
    console.error('   Error:', error);
  }
}

async function testPaystackWebhook() {
  try {
    const payload = paystackChargeSuccessPayload;
    const signature = generatePaystackSignature(payload, WEBHOOK_SECRETS.paystack);
    
    const response = await fetch(`http://localhost:${PORT}/webhooks/paystack`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Paystack-Signature': signature,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    console.log(`   Response: ${JSON.stringify(data)}\n`);
  } catch (error) {
    console.error('   Error:', error);
  }
}

async function testMtnMomoWebhook() {
  try {
    const response = await fetch(`http://localhost:${PORT}/webhooks/mtn-momo`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-API-Key': 'test-api-key',
      },
      body: JSON.stringify(mtnMomoRequestToPaySuccessPayload),
    });
    const data = await response.json();
    console.log(`   Response: ${JSON.stringify(data)}\n`);
  } catch (error) {
    console.error('   Error:', error);
  }
}

async function testIntasendWebhook() {
  try {
    const payload = intasendPaymentSuccessPayload;
    const signature = generateIntasendSignature(payload, WEBHOOK_SECRETS.intasend);
    
    const response = await fetch(`http://localhost:${PORT}/webhooks/intasend`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Intasend-Signature': signature,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    console.log(`   Response: ${JSON.stringify(data)}\n`);
  } catch (error) {
    console.error('   Error:', error);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
main().catch(console.error);
