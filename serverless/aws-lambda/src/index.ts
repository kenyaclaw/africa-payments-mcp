/**
 * AWS Lambda Handler for Africa Payments MCP
 * Supports API Gateway v1 (REST API) and v2 (HTTP API)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { AfricaPaymentsMCPServer } from '../../../src/server.js';
import { ServerConfig } from '../../../src/types/index.js';

// Cache the server instance for reuse across invocations
let cachedServer: AfricaPaymentsMCPServer | null = null;
let cachedConfig: ServerConfig | null = null;

/**
 * Load configuration from environment variables
 * AWS Secrets Manager can be used for sensitive values
 */
async function loadConfig(): Promise<ServerConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Check if using AWS Secrets Manager
  const secretArn = process.env.CONFIG_SECRET_ARN;
  
  if (secretArn) {
    // Load from Secrets Manager (requires aws-sdk)
    const { SecretsManager } = await import('@aws-sdk/client-secrets-manager');
    const secretsClient = new SecretsManager({});
    const secret = await secretsClient.getSecretValue({ SecretId: secretArn });
    cachedConfig = JSON.parse(secret.SecretString || '{}');
    return cachedConfig!;
  }

  // Build config from environment variables
  cachedConfig = {
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
      enabled: process.env.CACHE_ENABLED !== 'false',
      ttl: parseInt(process.env.CACHE_TTL || '300'),
    },
    audit: {
      enabled: process.env.AUDIT_ENABLED === 'true',
      logDestination: process.env.AUDIT_LOG_DESTINATION || 'cloudwatch',
      sensitiveFields: process.env.AUDIT_SENSITIVE_FIELDS?.split(',') || ['password', 'secret', 'token'],
    },
    defaults: {
      currency: process.env.DEFAULT_CURRENCY || 'KES',
      country: process.env.DEFAULT_COUNTRY || 'KE',
      provider: process.env.DEFAULT_PROVIDER || 'mpesa',
    },
    features: {
      webhooks: {
        enabled: process.env.WEBHOOKS_ENABLED === 'true',
        url: process.env.WEBHOOK_URL || '',
        events: (process.env.WEBHOOK_EVENTS?.split(',') as any[]) || ['payment.success', 'payment.failed'],
        retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3'),
        retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY || '5000'),
      },
      idempotency: {
        enabled: process.env.IDEMPOTENCY_ENABLED !== 'false',
        keyHeader: process.env.IDEMPOTENCY_KEY_HEADER || 'Idempotency-Key',
        ttl: parseInt(process.env.IDEMPOTENCY_TTL || '86400'),
      },
      circuitBreaker: {
        enabled: process.env.CIRCUIT_BREAKER_ENABLED !== 'false',
        failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
        resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '30000'),
      },
    },
    compliance: {
      pciDss: {
        enabled: process.env.PCI_DSS_ENABLED === 'true',
        level: parseInt(process.env.PCI_DSS_LEVEL || '1'),
      },
      gdpr: {
        enabled: process.env.GDPR_ENABLED === 'true',
        dataRetentionDays: parseInt(process.env.GDPR_DATA_RETENTION_DAYS || '2555'),
      },
    },
  };

  return cachedConfig;
}

/**
 * Initialize the MCP server
 */
async function getServer(): Promise<AfricaPaymentsMCPServer> {
  if (cachedServer) {
    return cachedServer;
  }

  const config = await loadConfig();
  cachedServer = new AfricaPaymentsMCPServer(config, process.env.LOG_LEVEL || 'info');
  await cachedServer.initialize();
  
  return cachedServer;
}

/**
 * MCP Tool Request Handler
 * Processes payment tool invocations via HTTP
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  // Set context for async operations
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    const path = event.path || event.requestContext?.http?.path || '/';
    const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';

    // Health check endpoint
    if (path === '/health' && httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
          'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
        },
        body: JSON.stringify({
          status: 'healthy',
          service: 'africa-payments-mcp',
          version: '0.1.0',
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // MCP Tools list endpoint
    if (path === '/tools' && httpMethod === 'GET') {
      const server = await getServer();
      // Access the tool manager through the server
      const tools = (server as any).toolManager?.getAllTools() || [];
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ tools }),
      };
    }

    // MCP Tool execution endpoint
    if (path === '/invoke' && httpMethod === 'POST') {
      const server = await getServer();
      const body = JSON.parse(event.body || '{}');
      const { name, arguments: args } = body;

      if (!name) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Tool name is required' }),
        };
      }

      // Execute the tool
      const toolManager = (server as any).toolManager;
      const result = await toolManager.executeTool(name, args || {});

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(result),
      };
    }

    // Webhook endpoint for receiving provider callbacks
    if (path.startsWith('/webhook/') && httpMethod === 'POST') {
      const provider = path.replace('/webhook/', '');
      const signature = event.headers['X-Webhook-Signature'] || event.headers['x-webhook-signature'];
      
      // Process webhook
      const body = event.body || '{}';
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received: true,
          provider,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // Handle OPTIONS for CORS
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
          'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
        },
        body: '',
      };
    }

    // Default 404
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not found' }),
    };

  } catch (error) {
    console.error('Lambda handler error:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

// Export for ES modules compatibility
export default handler;
