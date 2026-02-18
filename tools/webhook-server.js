#!/usr/bin/env node

/**
 * Africa Payments MCP - Webhook Testing Server
 * 
 * Usage:
 *   node tools/webhook-server.js [port]
 * 
 * Features:
 *   - Serves the webhook testing dashboard
 *   - Receives webhooks on /webhook endpoint
 *   - WebSocket for real-time updates
 *   - Supports all major African payment providers
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv[2]) || 3456;

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

// Store recent webhooks (last 100)
const recentWebhooks = [];
const MAX_WEBHOOKS = 100;

// HTTP Server
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Webhook endpoint - receive webhooks from payment providers
  if (url.pathname === '/webhook') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const webhook = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            receivedAt: new Date().toISOString(),
            method: req.method,
            headers: req.headers,
            payload: payload,
            provider: detectProvider(payload, req.headers)
          };

          // Store webhook
          recentWebhooks.unshift(webhook);
          if (recentWebhooks.length > MAX_WEBHOOKS) {
            recentWebhooks.pop();
          }

          // Broadcast to WebSocket clients
          broadcast({
            type: 'webhook',
            ...webhook
          });

          console.log(`📥 Webhook received from ${webhook.provider} at ${new Date().toLocaleTimeString()}`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            message: 'Webhook received',
            id: webhook.id
          }));
        } catch (error) {
          console.error('Error parsing webhook:', error.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Invalid JSON payload' 
          }));
        }
      });
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
    return;
  }

  // API endpoint - get recent webhooks
  if (url.pathname === '/api/webhooks') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(recentWebhooks));
    return;
  }

  // Serve static files (the dashboard)
  let filePath = url.pathname === '/' 
    ? path.join(__dirname, 'webhook-tester.html')
    : path.join(__dirname, url.pathname);

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// WebSocket Server
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('🌐 Dashboard connected');
  
  // Send recent webhooks to new client
  ws.send(JSON.stringify({
    type: 'history',
    webhooks: recentWebhooks
  }));

  ws.on('close', () => {
    console.log('🌐 Dashboard disconnected');
  });
});

// Detect provider from payload/headers
function detectProvider(payload, headers) {
  const payloadStr = JSON.stringify(payload).toLowerCase();
  const headerStr = JSON.stringify(headers).toLowerCase();
  
  if (payloadStr.includes('mpesa') || headerStr.includes('mpesa')) return 'mpesa';
  if (payloadStr.includes('paystack') || headerStr.includes('x-paystack')) return 'paystack';
  if (payloadStr.includes('momo') || headerStr.includes('momo') || headerStr.includes('mtn')) return 'mtn_momo';
  if (payloadStr.includes('airtel') || headerStr.includes('airtel')) return 'airtel_money';
  if (payloadStr.includes('intasend') || headerStr.includes('intasend')) return 'intasend';
  
  // Detect from payload structure
  if (payload.Body?.stkCallback || payload.Body?.callbackMetadata) return 'mpesa';
  if (payload.event?.startsWith('charge.') || payload.data?.reference) return 'paystack';
  
  return 'unknown';
}

// Start server
server.listen(PORT, () => {
  console.log(`
🌍 Africa Payments MCP - Webhook Testing Server
═══════════════════════════════════════════════════

📊 Dashboard:    http://localhost:${PORT}
📥 Webhook URL:  http://localhost:${PORT}/webhook
🔌 WebSocket:    ws://localhost:${PORT}/ws

Supported Providers:
  • M-Pesa (Kenya, Tanzania)
  • Paystack (Nigeria, Ghana, South Africa)
  • MTN MoMo (Uganda, Ghana, 12+ countries)
  • Airtel Money
  • IntaSend

Press Ctrl+C to stop
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
