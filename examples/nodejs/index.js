/**
 * Africa Payments MCP - Node.js Example
 * 
 * This example shows how to use the Africa Payments MCP SDK
 * programmatically in a Node.js application.
 */

import express from 'express';
import dotenv from 'dotenv';
import { AfricaPaymentsClient } from '@kenyaclaw/africa-payments-mcp/sdk';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

// Initialize the Africa Payments client
const payments = new AfricaPaymentsClient({
  configPath: process.env.CONFIG_PATH || './config.json',
  environment: process.env.NODE_ENV || 'development'
});

// Initialize providers on startup
await payments.initialize();

console.log('✅ Africa Payments SDK initialized');
console.log(`   Providers: ${payments.getProviderNames().join(', ')}`);

/**
 * Route: Send money via M-Pesa
 * POST /api/payments/send
 * 
 * Body: {
 *   phoneNumber: string,
 *   amount: number,
 *   provider: 'mpesa' | 'paystack' | 'mtn_momo'
 * }
 */
app.post('/api/payments/send', async (req, res) => {
  try {
    const { phoneNumber, amount, provider = 'mpesa' } = req.body;

    // Validate input
    if (!phoneNumber || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and amount are required'
      });
    }

    // Send money using the unified interface
    const result = await payments.sendMoney({
      to: phoneNumber,
      amount: amount,
      currency: 'KES',
      provider: provider,
      reason: 'Payment from example app'
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Route: Request payment (STK Push for M-Pesa)
 * POST /api/payments/request
 */
app.post('/api/payments/request', async (req, res) => {
  try {
    const { phoneNumber, amount, accountReference, description } = req.body;

    const result = await payments.requestPayment({
      from: phoneNumber,
      amount: amount,
      currency: 'KES',
      provider: 'mpesa',
      accountReference: accountReference || 'TEST',
      description: description || 'Payment request'
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Payment request error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Route: Verify transaction
 * GET /api/payments/verify/:transactionId
 */
app.get('/api/payments/verify/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { provider = 'mpesa' } = req.query;

    const result = await payments.verifyTransaction({
      transactionId,
      provider
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Route: Check balance
 * GET /api/balance/:provider
 */
app.get('/api/balance/:provider', async (req, res) => {
  try {
    const { provider } = req.params;

    const result = await payments.checkBalance({
      provider
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Balance check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Route: Process refund
 * POST /api/payments/refund
 */
app.post('/api/payments/refund', async (req, res) => {
  try {
    const { transactionId, provider = 'paystack', amount } = req.body;

    const result = await payments.refund({
      transactionId,
      provider,
      amount // Optional: partial refund
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Route: Get transaction history
 * GET /api/payments/history
 */
app.get('/api/payments/history', async (req, res) => {
  try {
    const { provider, startDate, endDate, status } = req.query;

    const result = await payments.getTransactions({
      provider,
      startDate,
      endDate,
      status
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Route: Create Paystack payment page
 * POST /api/payments/paystack/initialize
 */
app.post('/api/payments/paystack/initialize', async (req, res) => {
  try {
    const { email, amount, currency = 'NGN', callbackUrl } = req.body;

    const result = await payments.paystack.initialize({
      email,
      amount: amount * 100, // Paystack uses kobo/cents
      currency,
      callbackUrl
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Paystack initialize error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Webhook handler for payment notifications
 * POST /webhooks/:provider
 */
app.post('/webhooks/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const signature = req.headers['x-signature'];

    // Verify webhook signature
    const isValid = await payments.verifyWebhook({
      provider,
      signature,
      payload: req.body
    });

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Process the webhook event
    const event = req.body;
    console.log(`Received ${provider} webhook:`, event);

    // Handle different event types
    switch (event.event) {
      case 'payment.success':
        // Update order status, send confirmation email, etc.
        console.log('Payment successful:', event.data);
        break;
      case 'payment.failed':
        // Log failure, notify customer, etc.
        console.log('Payment failed:', event.data);
        break;
      case 'transfer.completed':
        // Update transfer status
        console.log('Transfer completed:', event.data);
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    providers: payments.getProviderNames(),
    uptime: process.uptime()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Africa Payments API Server running on port ${PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  POST /api/payments/send        - Send money`);
  console.log(`  POST /api/payments/request     - Request payment (STK Push)`);
  console.log(`  GET  /api/payments/verify/:id  - Verify transaction`);
  console.log(`  GET  /api/balance/:provider    - Check balance`);
  console.log(`  POST /api/payments/refund      - Process refund`);
  console.log(`  GET  /api/payments/history     - Transaction history`);
  console.log(`  POST /webhooks/:provider       - Webhook handler`);
  console.log(`  GET  /health                   - Health check`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await payments.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await payments.close();
  process.exit(0);
});
