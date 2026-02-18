/**
 * Cloudflare Worker for Africa Payments MCP
 * Edge-deployed MCP server with KV caching
 */

import { AfricaPaymentsMCPServer } from '../../../src/server.js';
import { ServerConfig } from '../../../src/types/index.js';

// Environment interface for Cloudflare Workers
export interface Env {
  // KV Namespaces
  CACHE_KV: KVNamespace;
  API_KEYS_KV: KVNamespace;
  IDEMPOTENCY_KV: KVNamespace;
  
  // Environment Variables
  NODE_ENV: string;
  LOG_LEVEL: string;
  
  // Provider Configuration
  MPESA_ENABLED: string;
  MPESA_SANDBOX: string;
  MPESA_CONSUMER_KEY: string;
  MPESA_CONSUMER_SECRET: string;
  MPESA_PASSKEY: string;
  MPESA_SHORT_CODE: string;
  
  PAYSTACK_ENABLED: string;
  PAYSTACK_SECRET_KEY: string;
  PAYSTACK_PUBLIC_KEY: string;
  PAYSTACK_SANDBOX: string;
  
  INTASEND_ENABLED: string;
  INTASEND_PUBLIC_KEY: string;
  INTASEND_SECRET_KEY: string;
  INTASEND_TEST_MODE: string;
  
  MTN_MOMO_ENABLED: string;
  MTN_MOMO_API_USER: string;
  MTN_MOMO_API_KEY: string;
  MTN_MOMO_SUBSCRIPTION_KEY: string;
  MTN_MOMO_ENV: string;
  
  AIRTEL_MONEY_ENABLED: string;
  AIRTEL_MONEY_CLIENT_ID: string;
  AIRTEL_MONEY_CLIENT_SECRET: string;
  AIRTEL_MONEY_ENV: string;
  
  // Security
  ENCRYPTION_KEY: string;
  WEBHOOK_SECRET: string;
  ALLOWED_IPS: string;
  
  // Defaults
  DEFAULT_CURRENCY: string;
  DEFAULT_COUNTRY: string;
  DEFAULT_PROVIDER: string;
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Access-Control-Max-Age': '86400',
};

/**
 * Build server configuration from environment
 */
function buildConfig(env: Env): ServerConfig {
  return {
    environment: env.NODE_ENV || 'production',
    providers: {
      mpesa: {
        enabled: env.MPESA_ENABLED === 'true',
        sandbox: env.MPESA_SANDBOX !== 'false',
        consumerKey: env.MPESA_CONSUMER_KEY || '',
        consumerSecret: env.MPESA_CONSUMER_SECRET || '',
        passkey: env.MPESA_PASSKEY || '',
        shortCode: env.MPESA_SHORT_CODE || '',
        environment: (env.MPESA_ENV as any) || 'sandbox',
      },
      paystack: {
        enabled: env.PAYSTACK_ENABLED === 'true',
        secretKey: env.PAYSTACK_SECRET_KEY || '',
        publicKey: env.PAYSTACK_PUBLIC_KEY || '',
        sandbox: env.PAYSTACK_SANDBOX !== 'false',
      },
      intasend: {
        enabled: env.INTASEND_ENABLED === 'true',
        publicKey: env.INTASEND_PUBLIC_KEY || '',
        secretKey: env.INTASEND_SECRET_KEY || '',
        testMode: env.INTASEND_TEST_MODE !== 'false',
      },
      mtn_momo: {
        enabled: env.MTN_MOMO_ENABLED === 'true',
        apiUser: env.MTN_MOMO_API_USER || '',
        apiKey: env.MTN_MOMO_API_KEY || '',
        subscriptionKey: env.MTN_MOMO_SUBSCRIPTION_KEY || '',
        environment: (env.MTN_MOMO_ENV as any) || 'sandbox',
      },
      airtel_money: {
        enabled: env.AIRTEL_MONEY_ENABLED === 'true',
        clientId: env.AIRTEL_MONEY_CLIENT_ID || '',
        clientSecret: env.AIRTEL_MONEY_CLIENT_SECRET || '',
        environment: (env.AIRTEL_MONEY_ENV as any) || 'sandbox',
      },
    },
    security: {
      encryptionKey: env.ENCRYPTION_KEY,
      webhookSecret: env.WEBHOOK_SECRET,
      allowedIps: env.ALLOWED_IPS?.split(','),
    },
    cache: {
      enabled: true,
      ttl: 300,
    },
    defaults: {
      currency: env.DEFAULT_CURRENCY || 'KES',
      country: env.DEFAULT_COUNTRY || 'KE',
      provider: env.DEFAULT_PROVIDER || 'mpesa',
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
 * Validate API Key using KV storage
 */
async function validateApiKey(apiKey: string, env: Env): Promise<{ valid: boolean; tenantId?: string; permissions?: string[] }> {
  if (!apiKey) {
    return { valid: false };
  }
  
  try {
    const keyData = await env.API_KEYS_KV.get(`apikey:${apiKey}`, { type: 'json' }) as {
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
  } catch (error) {
    console.error('API key validation error:', error);
    return { valid: false };
  }
}

/**
 * Check idempotency key
 */
async function checkIdempotency(idempotencyKey: string, env: Env): Promise<{ exists: boolean; response?: any }> {
  if (!idempotencyKey) {
    return { exists: false };
  }
  
  try {
    const cached = await env.IDEMPOTENCY_KV.get(`idempotency:${idempotencyKey}`, { type: 'json' });
    if (cached) {
      return { exists: true, response: cached };
    }
  } catch (error) {
    console.error('Idempotency check error:', error);
  }
  
  return { exists: false };
}

/**
 * Store idempotency response
 */
async function storeIdempotency(idempotencyKey: string, response: any, env: Env, ttl: number = 86400): Promise<void> {
  try {
    await env.IDEMPOTENCY_KV.put(
      `idempotency:${idempotencyKey}`,
      JSON.stringify(response),
      { expirationTtl: ttl }
    );
  } catch (error) {
    console.error('Idempotency store error:', error);
  }
}

/**
 * Get cached tool list
 */
async function getCachedTools(server: AfricaPaymentsMCPServer, env: Env): Promise<any[]> {
  const cacheKey = 'tools:list';
  
  try {
    const cached = await env.CACHE_KV.get(cacheKey, { type: 'json' });
    if (cached) {
      return cached;
    }
  } catch (error) {
    console.error('Cache get error:', error);
  }
  
  // Get from server and cache
  const tools = (server as any).toolManager?.getAllTools() || [];
  
  try {
    await env.CACHE_KV.put(cacheKey, JSON.stringify(tools), { expirationTtl: 300 });
  } catch (error) {
    console.error('Cache put error:', error);
  }
  
  return tools;
}

/**
 * Main request handler
 */
async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
    if (path === '/health' && method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'healthy',
          service: 'africa-payments-mcp',
          version: '0.1.0',
          platform: 'cloudflare-workers',
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
    
    // Validate API Key for protected routes
    const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
    const auth = await validateApiKey(apiKey || '', env);
    
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
    const config = buildConfig(env);
    const server = new AfricaPaymentsMCPServer(config, env.LOG_LEVEL || 'info');
    await server.initialize();
    
    // List tools endpoint
    if (path === '/tools' && method === 'GET') {
      const tools = await getCachedTools(server, env);
      
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
    
    // Tool invocation endpoint
    if (path === '/invoke' && method === 'POST') {
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
        const idempotencyCheck = await checkIdempotency(idempotencyKey, env);
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
        ctx.waitUntil(storeIdempotency(idempotencyKey, result, env));
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
    if (path.startsWith('/webhook/') && method === 'POST') {
      const provider = path.replace('/webhook/', '');
      const signature = request.headers.get('X-Webhook-Signature') || '';
      
      // Store webhook for async processing
      const webhookData = {
        provider,
        signature,
        body: await request.text(),
        headers: Object.fromEntries(request.headers.entries()),
        timestamp: new Date().toISOString(),
      };
      
      ctx.waitUntil(
        env.CACHE_KV.put(
          `webhook:${provider}:${Date.now()}`,
          JSON.stringify(webhookData),
          { expirationTtl: 86400 }
        )
      );
      
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
    
    // Metrics endpoint
    if (path === '/metrics' && method === 'GET') {
      // Return basic metrics
      return new Response(
        JSON.stringify({
          service: 'africa-payments-mcp',
          version: '0.1.0',
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
    console.error('Worker error:', error);
    
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

/**
 * Cloudflare Worker entry point
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
};

/**
 * Scheduled job handler for background tasks
 */
export const scheduled: ExportedHandlerScheduledHandler<Env> = async (event, env, ctx) => {
  // Process pending webhooks
  if (event.cron === '*/5 * * * *') {
    // List and process webhooks from KV
    // This is a placeholder - implement based on your needs
    console.log('Running scheduled webhook processing');
  }
  
  // Clean up expired idempotency keys (KV handles TTL automatically)
  if (event.cron === '0 0 * * *') {
    console.log('Running daily cleanup');
  }
};
