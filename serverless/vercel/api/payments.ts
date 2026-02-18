/**
 * Vercel Edge Function for Africa Payments MCP
 * Runs on Vercel's Edge Network with Node.js runtime
 */

import type { NextRequest, NextResponse } from 'next/server.js';
import { AfricaPaymentsMCPServer } from '../../../src/server.js';
import { ServerConfig } from '../../../src/types/index.js';

// Edge runtime configuration
export const config = {
  runtime: 'edge',
  regions: ['iad1', 'cdg1', 'bom1', 'hkg1'], // US East, EU West, India, Asia
};

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Idempotency-Key',
  'Access-Control-Max-Age': '86400',
};

/**
 * Build configuration from environment variables
 */
function buildConfig(): ServerConfig {
  return {
    environment: process.env.NODE_ENV || 'production',
    providers: {
      mpesa: {
        enabled: process.env.MPESA_ENABLED === 'true',
        sandbox: process.env.MPESA_SANDBOX !== 'false',
        consumerKey: process.env.MPESA_CONSUMER_KEY || '',
        consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
        passkey: process.env.MPESA_PASSKEY || '',
        shortCode: process.env.MPESA_SHORT_CODE || '',
        environment: (process.env.MPESA_ENV as any) || 'sandbox',
      },
      paystack: {
        enabled: process.env.PAYSTACK_ENABLED === 'true',
        secretKey: process.env.PAYSTACK_SECRET_KEY || '',
        publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
        sandbox: process.env.PAYSTACK_SANDBOX !== 'false',
      },
      intasend: {
        enabled: process.env.INTASEND_ENABLED === 'true',
        publicKey: process.env.INTASEND_PUBLIC_KEY || '',
        secretKey: process.env.INTASEND_SECRET_KEY || '',
        testMode: process.env.INTASEND_TEST_MODE !== 'false',
      },
      mtn_momo: {
        enabled: process.env.MTN_MOMO_ENABLED === 'true',
        apiUser: process.env.MTN_MOMO_API_USER || '',
        apiKey: process.env.MTN_MOMO_API_KEY || '',
        subscriptionKey: process.env.MTN_MOMO_SUBSCRIPTION_KEY || '',
        environment: (process.env.MTN_MOMO_ENV as any) || 'sandbox',
      },
      airtel_money: {
        enabled: process.env.AIRTEL_MONEY_ENABLED === 'true',
        clientId: process.env.AIRTEL_MONEY_CLIENT_ID || '',
        clientSecret: process.env.AIRTEL_MONEY_CLIENT_SECRET || '',
        environment: (process.env.AIRTEL_MONEY_ENV as any) || 'sandbox',
      },
    },
    security: {
      encryptionKey: process.env.ENCRYPTION_KEY,
      webhookSecret: process.env.WEBHOOK_SECRET,
      allowedIps: process.env.ALLOWED_IPS?.split(','),
      rateLimitRequests: parseInt(process.env.RATE_LIMIT_REQUESTS || '100'),
      rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'),
    },
    cache: {
      enabled: true,
      ttl: 300,
    },
    defaults: {
      currency: process.env.DEFAULT_CURRENCY || 'KES',
      country: process.env.DEFAULT_COUNTRY || 'KE',
      provider: process.env.DEFAULT_PROVIDER || 'mpesa',
    },
    features: {
      webhooks: {
        enabled: true,
        url: '',
        events: ['payment.success', 'payment.failed'],
        retryAttempts: 3,
        retryDelay: 5000,
      },
      idempotency: {
        enabled: true,
        keyHeader: 'Idempotency-Key',
        ttl: 86400,
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 30000,
      },
    },
  };
}

/**
 * Validate API Key using Vercel Edge Config
 */
async function validateApiKey(apiKey: string): Promise<{ valid: boolean; tenantId?: string; permissions?: string[] }> {
  if (!apiKey) {
    return { valid: false };
  }
  
  try {
    // Try to get from Edge Config if available
    if (process.env.EDGE_CONFIG) {
      const { get } = await import('@vercel/edge-config');
      const keyData = await get(`apikey:${apiKey}`) as {
        tenantId: string;
        permissions: string[];
        active: boolean;
        expiresAt?: number;
      } | null;
      
      if (!keyData || !keyData.active) {
        return { valid: false };
      }
      
      if (keyData.expiresAt && keyData.expiresAt < Date.now()) {
        return { valid: false };
      }
      
      return {
        valid: true,
        tenantId: keyData.tenantId,
        permissions: keyData.permissions,
      };
    }
    
    // Fallback: Check against environment variable for simple setups
    const validKeys = process.env.API_KEYS?.split(',') || [];
    if (validKeys.includes(apiKey)) {
      return {
        valid: true,
        tenantId: 'default',
        permissions: ['payments:read', 'payments:write'],
      };
    }
    
    return { valid: false };
  } catch (error) {
    console.error('API key validation error:', error);
    return { valid: false };
  }
}

/**
 * Check idempotency using Vercel KV
 */
async function checkIdempotency(idempotencyKey: string): Promise<{ exists: boolean; response?: any }> {
  if (!idempotencyKey) {
    return { exists: false };
  }
  
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { createClient } = await import('@vercel/kv');
      const kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
      
      const cached = await kv.get(`idempotency:${idempotencyKey}`);
      if (cached) {
        return { exists: true, response: cached };
      }
    }
  } catch (error) {
    console.error('Idempotency check error:', error);
  }
  
  return { exists: false };
}

/**
 * Store idempotency response
 */
async function storeIdempotency(idempotencyKey: string, response: any, ttl: number = 86400): Promise<void> {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { createClient } = await import('@vercel/kv');
      const kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
      
      await kv.set(`idempotency:${idempotencyKey}`, response, { ex: ttl });
    }
  } catch (error) {
    console.error('Idempotency store error:', error);
  }
}

/**
 * Get cached tool list using Vercel Cache API
 */
async function getCachedTools(server: AfricaPaymentsMCPServer, request: NextRequest): Promise<any[]> {
  // Try Cache API first
  const cache = caches.default;
  const cacheKey = new URL('/cache/tools', request.url);
  const cached = await cache.match(cacheKey);
  
  if (cached) {
    return await cached.json();
  }
  
  // Get from server
  const tools = (server as any).toolManager?.getAllTools() || [];
  
  // Store in cache
  const response = new Response(JSON.stringify(tools), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
  await cache.put(cacheKey, response.clone());
  
  return tools;
}

/**
 * Main handler function
 */
export default async function handler(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  
  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }
  
  try {
    // Health check (no auth required)
    if (path === '/api/payments/health' && method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'healthy',
          service: 'africa-payments-mcp',
          version: '0.1.0',
          platform: 'vercel-edge',
          region: process.env.VERCEL_REGION || 'unknown',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
    
    // Tools list endpoint
    if (path === '/api/payments/tools' && method === 'GET') {
      // Initialize server
      const config = buildConfig();
      const server = new AfricaPaymentsMCPServer(config, process.env.LOG_LEVEL || 'info');
      await server.initialize();
      
      const tools = await getCachedTools(server, request);
      
      return new Response(
        JSON.stringify({ tools }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
            ...corsHeaders,
          },
        }
      );
    }
    
    // Validate API Key for protected routes
    const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
    const auth = await validateApiKey(apiKey || '');
    
    if (!auth.valid) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid API Key' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
    
    // Initialize server
    const config = buildConfig();
    const server = new AfricaPaymentsMCPServer(config, process.env.LOG_LEVEL || 'info');
    await server.initialize();
    
    // Tool invocation endpoint
    if (path === '/api/payments/invoke' && method === 'POST') {
      const body = await request.json() as { name: string; arguments?: Record<string, any>; idempotencyKey?: string };
      const { name, arguments: args, idempotencyKey } = body;
      
      if (!name) {
        return new Response(
          JSON.stringify({ error: 'Tool name is required' }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }
      
      // Check idempotency
      if (idempotencyKey) {
        const idempotencyCheck = await checkIdempotency(idempotencyKey);
        if (idempotencyCheck.exists) {
          return new Response(
            JSON.stringify(idempotencyCheck.response),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'X-Idempotency-Replay': 'true',
                ...corsHeaders,
              },
            }
          );
        }
      }
      
      // Execute tool
      const toolManager = (server as any).toolManager;
      const result = await toolManager.executeTool(name, args || {});
      
      // Store idempotency response
      if (idempotencyKey) {
        // Fire and forget
        storeIdempotency(idempotencyKey, result);
      }
      
      return new Response(
        JSON.stringify(result),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
    
    // Webhook endpoint
    if (path.startsWith('/api/payments/webhook/') && method === 'POST') {
      const provider = path.replace('/api/payments/webhook/', '');
      const signature = request.headers.get('X-Webhook-Signature') || '';
      
      // Store webhook for async processing if KV is available
      if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        try {
          const { createClient } = await import('@vercel/kv');
          const kv = createClient({
            url: process.env.KV_REST_API_URL,
            token: process.env.KV_REST_API_TOKEN,
          });
          
          const webhookData = {
            provider,
            signature,
            body: await request.text(),
            timestamp: new Date().toISOString(),
          };
          
          await kv.set(`webhook:${provider}:${Date.now()}`, webhookData, { ex: 86400 });
        } catch (error) {
          console.error('Webhook store error:', error);
        }
      }
      
      return new Response(
        JSON.stringify({
          received: true,
          provider,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
    
    // 404 Not Found
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
    
  } catch (error) {
    console.error('Edge function error:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
}
