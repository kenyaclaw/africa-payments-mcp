/**
 * Webhook Server for Africa Payments MCP
 * Express server to receive and process webhooks from all payment providers
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { URL } from 'url';
import { Logger } from '../utils/logger.js';
import { 
  PaymentEventEmitter, 
  getGlobalEventEmitter,
  WebhookEvent 
} from './events.js';
import { WebhookVerifier, getGlobalVerifier } from './verifier.js';
import { MpesaWebhookHandler, createMpesaWebhookHandler } from './handlers/mpesa.js';
import { PaystackWebhookHandler, createPaystackWebhookHandler } from './handlers/paystack.js';
import { MTNMoMoWebhookHandler, createMTNMoMoWebhookHandler } from './handlers/mtn-momo.js';
import { IntaSendWebhookHandler, createIntaSendWebhookHandler } from './handlers/intasend.js';

// ==================== Configuration Types ====================

export interface WebhookServerConfig {
  port: number;
  host?: string;
  path?: string;
  secrets?: {
    paystack?: string;
    intasend?: string;
    'mtn-momo'?: string;
    'airtel-money'?: string;
  };
  // Callback to get raw body for signature verification
  getRawBody?: (req: IncomingMessage) => Promise<Buffer>;
  // Custom event emitter (optional)
  eventEmitter?: PaymentEventEmitter;
  // Custom logger (optional)
  logger?: Logger;
}

export interface WebhookLogEntry {
  id: string;
  timestamp: Date;
  provider: string;
  method: string;
  path: string;
  statusCode: number;
  processingTimeMs: number;
  success: boolean;
  error?: string;
}

// ==================== Webhook Server Class ====================

export class WebhookServer {
  private server: Server | null = null;
  private logger: Logger;
  private eventEmitter: PaymentEventEmitter;
  private verifier: WebhookVerifier;
  private config: WebhookServerConfig;
  private requestLogs: WebhookLogEntry[] = [];
  private maxLogEntries: number = 1000;

  // Handler instances
  private mpesaHandler: MpesaWebhookHandler;
  private paystackHandler: PaystackWebhookHandler;
  private mtnMomoHandler: MTNMoMoWebhookHandler;
  private intasendHandler: IntaSendWebhookHandler;

  constructor(config: WebhookServerConfig) {
    this.config = {
      host: '0.0.0.0',
      path: '/webhooks',
      ...config,
    };

    this.logger = config.logger || new Logger();
    this.eventEmitter = config.eventEmitter || getGlobalEventEmitter(this.logger);
    this.verifier = getGlobalVerifier(this.logger);

    // Initialize handlers
    this.mpesaHandler = createMpesaWebhookHandler(this.logger, this.eventEmitter, this.verifier);
    this.paystackHandler = createPaystackWebhookHandler(
      this.logger, 
      this.eventEmitter, 
      this.verifier, 
      config.secrets?.paystack
    );
    this.mtnMomoHandler = createMTNMoMoWebhookHandler(
      this.logger, 
      this.eventEmitter, 
      this.verifier, 
      config.secrets?.['mtn-momo']
    );
    this.intasendHandler = createIntaSendWebhookHandler(
      this.logger, 
      this.eventEmitter, 
      this.verifier, 
      config.secrets?.intasend
    );
  }

  /**
   * Start the webhook server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.listen(this.config.port, this.config.host, () => {
        this.logger.info(`🌐 Webhook server listening on ${this.config.host}:${this.config.port}`);
        this.logger.info(`   M-Pesa:     POST ${this.config.path}/mpesa`);
        this.logger.info(`   Paystack:   POST ${this.config.path}/paystack`);
        this.logger.info(`   MTN MoMo:   POST ${this.config.path}/mtn-momo`);
        this.logger.info(`   IntaSend:   POST ${this.config.path}/intasend`);
        resolve();
      });

      this.server.on('error', (error) => {
        this.logger.error(`Webhook server error: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * Stop the webhook server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('Webhook server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming HTTP request
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = Date.now();
    const requestId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    try {
      // Parse URL
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const method = req.method || 'GET';

      this.logger.debug(`[${requestId}] ${method} ${url.pathname}`);

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Paystack-Signature, X-Intasend-Signature');

      // Handle preflight
      if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Health check endpoint
      if (url.pathname === '/health' || url.pathname === '/healthz') {
        this.handleHealthCheck(res);
        this.logRequest(requestId, 'health', method, url.pathname, 200, Date.now() - startTime, true);
        return;
      }

      // Webhook endpoints - only accept POST
      if (method !== 'POST') {
        this.sendError(res, 405, 'Method not allowed');
        this.logRequest(requestId, 'unknown', method, url.pathname, 405, Date.now() - startTime, false, 'Method not allowed');
        return;
      }

      // Route to appropriate handler
      const basePath = this.config.path || '/webhooks';
      
      if (url.pathname === `${basePath}/mpesa`) {
        await this.handleMpesaWebhook(req, res, requestId, startTime);
      } else if (url.pathname === `${basePath}/paystack`) {
        await this.handlePaystackWebhook(req, res, requestId, startTime);
      } else if (url.pathname === `${basePath}/mtn-momo`) {
        await this.handleMTNMoMoWebhook(req, res, requestId, startTime);
      } else if (url.pathname === `${basePath}/intasend`) {
        await this.handleIntaSendWebhook(req, res, requestId, startTime);
      } else if (url.pathname === `${basePath}/logs`) {
        this.handleLogsRequest(res);
        this.logRequest(requestId, 'logs', method, url.pathname, 200, Date.now() - startTime, true);
      } else {
        this.sendError(res, 404, 'Not found');
        this.logRequest(requestId, 'unknown', method, url.pathname, 404, Date.now() - startTime, false, 'Not found');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[${requestId}] Request handling error: ${errorMessage}`);
      this.sendError(res, 500, 'Internal server error');
      this.logRequest(requestId, 'unknown', req.method || 'UNKNOWN', req.url || '/', 500, Date.now() - startTime, false, errorMessage);
    }
  }

  /**
   * Handle M-Pesa webhook
   */
  private async handleMpesaWebhook(
    req: IncomingMessage, 
    res: ServerResponse,
    requestId: string,
    startTime: number
  ): Promise<void> {
    try {
      // Parse body
      const body = await this.parseJsonBody(req);
      
      // Process asynchronously - respond immediately
      this.respondOk(res, { received: true, requestId });
      
      // Process webhook after response
      const result = await this.mpesaHandler.handleWebhook(body, req.headers as Record<string, string | string[]>);
      
      this.logRequest(requestId, 'mpesa', 'POST', req.url || '/', result.success ? 200 : 400, Date.now() - startTime, result.success, result.success ? undefined : result.message);
      
      this.logger.info(`[${requestId}] M-Pesa webhook processed: ${result.message}`);
    } catch (error) {
      this.respondOk(res, { received: true, requestId }); // Still return 200 to prevent retries
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logRequest(requestId, 'mpesa', 'POST', req.url || '/', 500, Date.now() - startTime, false, errorMessage);
      this.logger.error(`[${requestId}] M-Pesa webhook error: ${errorMessage}`);
    }
  }

  /**
   * Handle Paystack webhook
   */
  private async handlePaystackWebhook(
    req: IncomingMessage, 
    res: ServerResponse,
    requestId: string,
    startTime: number
  ): Promise<void> {
    try {
      // Get raw body for signature verification
      const rawBody = await this.getRawBody(req);
      const body = JSON.parse(rawBody.toString('utf8'));
      
      // Extract signature from header
      const signature = this.extractHeader(req, 'x-paystack-signature');
      
      // Process asynchronously - respond immediately
      this.respondOk(res, { received: true, requestId });
      
      // Process webhook after response
      const result = await this.paystackHandler.handleWebhook(body, signature, rawBody.toString('utf8'));
      
      this.logRequest(requestId, 'paystack', 'POST', req.url || '/', result.success ? 200 : 400, Date.now() - startTime, result.success, result.success ? undefined : result.message);
      
      this.logger.info(`[${requestId}] Paystack webhook processed: ${result.message}`);
    } catch (error) {
      this.respondOk(res, { received: true, requestId }); // Still return 200 to prevent retries
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logRequest(requestId, 'paystack', 'POST', req.url || '/', 500, Date.now() - startTime, false, errorMessage);
      this.logger.error(`[${requestId}] Paystack webhook error: ${errorMessage}`);
    }
  }

  /**
   * Handle MTN MoMo webhook
   */
  private async handleMTNMoMoWebhook(
    req: IncomingMessage, 
    res: ServerResponse,
    requestId: string,
    startTime: number
  ): Promise<void> {
    try {
      const body = await this.parseJsonBody(req);
      
      // Process asynchronously - respond immediately
      this.respondOk(res, { received: true, requestId });
      
      // Process webhook after response
      const result = await this.mtnMomoHandler.handleWebhook(body, req.headers as Record<string, string | string[]>);
      
      this.logRequest(requestId, 'mtn-momo', 'POST', req.url || '/', result.success ? 200 : 400, Date.now() - startTime, result.success, result.success ? undefined : result.message);
      
      this.logger.info(`[${requestId}] MTN MoMo webhook processed: ${result.message}`);
    } catch (error) {
      this.respondOk(res, { received: true, requestId });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logRequest(requestId, 'mtn-momo', 'POST', req.url || '/', 500, Date.now() - startTime, false, errorMessage);
      this.logger.error(`[${requestId}] MTN MoMo webhook error: ${errorMessage}`);
    }
  }

  /**
   * Handle IntaSend webhook
   */
  private async handleIntaSendWebhook(
    req: IncomingMessage, 
    res: ServerResponse,
    requestId: string,
    startTime: number
  ): Promise<void> {
    try {
      const body = await this.parseJsonBody(req);
      
      // Extract signature from header
      const signature = this.extractHeader(req, 'x-intasend-signature') || this.extractHeader(req, 'x-signature');
      
      // Process asynchronously - respond immediately
      this.respondOk(res, { received: true, requestId });
      
      // Process webhook after response
      const result = await this.intasendHandler.handleWebhook(body, signature);
      
      this.logRequest(requestId, 'intasend', 'POST', req.url || '/', result.success ? 200 : 400, Date.now() - startTime, result.success, result.success ? undefined : result.message);
      
      this.logger.info(`[${requestId}] IntaSend webhook processed: ${result.message}`);
    } catch (error) {
      this.respondOk(res, { received: true, requestId });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logRequest(requestId, 'intasend', 'POST', req.url || '/', 500, Date.now() - startTime, false, errorMessage);
      this.logger.error(`[${requestId}] IntaSend webhook error: ${errorMessage}`);
    }
  }

  /**
   * Handle health check
   */
  private handleHealthCheck(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }));
  }

  /**
   * Handle logs request
   */
  private handleLogsRequest(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      logs: this.requestLogs.slice(-100), // Last 100 entries
      total: this.requestLogs.length,
    }));
  }

  // ==================== Helper Methods ====================

  /**
   * Parse JSON body from request
   */
  private parseJsonBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          if (!body) {
            resolve({});
            return;
          }
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Get raw body buffer from request
   */
  private getRawBody(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      req.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      req.on('error', reject);
    });
  }

  /**
   * Extract header value (case-insensitive)
   */
  private extractHeader(req: IncomingMessage, name: string): string | undefined {
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() === lowerName) {
        return Array.isArray(value) ? value[0] : value;
      }
    }
    return undefined;
  }

  /**
   * Send error response
   */
  private sendError(res: ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }

  /**
   * Send OK response
   */
  private respondOk(res: ServerResponse, data: any): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Log request for monitoring
   */
  private logRequest(
    id: string,
    provider: string,
    method: string,
    path: string,
    statusCode: number,
    processingTimeMs: number,
    success: boolean,
    error?: string
  ): void {
    const entry: WebhookLogEntry = {
      id,
      timestamp: new Date(),
      provider,
      method,
      path,
      statusCode,
      processingTimeMs,
      success,
      error,
    };

    this.requestLogs.push(entry);

    // Prevent memory leak
    if (this.requestLogs.length > this.maxLogEntries) {
      this.requestLogs = this.requestLogs.slice(-this.maxLogEntries / 2);
    }
  }

  /**
   * Get recent request logs
   */
  getLogs(limit: number = 100): WebhookLogEntry[] {
    return this.requestLogs.slice(-limit);
  }

  /**
   * Clear request logs
   */
  clearLogs(): void {
    this.requestLogs = [];
  }

  /**
   * Get event emitter for registering handlers
   */
  getEventEmitter(): PaymentEventEmitter {
    return this.eventEmitter;
  }
}

// ==================== Factory Functions ====================

export function createWebhookServer(config: WebhookServerConfig): WebhookServer {
  return new WebhookServer(config);
}

// ==================== Express-compatible Middleware (optional) ====================

/**
 * Create Express middleware for handling webhooks
 * Usage: app.post('/webhooks/:provider', createWebhookMiddleware(config));
 */
export function createWebhookMiddleware(config: Omit<WebhookServerConfig, 'port' | 'host'>) {
  const logger = config.logger || new Logger();
  const eventEmitter = config.eventEmitter || getGlobalEventEmitter(logger);
  const verifier = getGlobalVerifier(logger);

  const mpesaHandler = createMpesaWebhookHandler(logger, eventEmitter, verifier);
  const paystackHandler = createPaystackWebhookHandler(logger, eventEmitter, verifier, config.secrets?.paystack);
  const mtnMomoHandler = createMTNMoMoWebhookHandler(logger, eventEmitter, verifier, config.secrets?.['mtn-momo']);
  const intasendHandler = createIntaSendWebhookHandler(logger, eventEmitter, verifier, config.secrets?.intasend);

  return async (req: any, res: any, next: any) => {
    const provider = req.params.provider;
    const requestId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    try {
      // Always respond 200 immediately to prevent retries
      res.json({ received: true, requestId });

      // Process asynchronously
      switch (provider) {
        case 'mpesa':
          await mpesaHandler.handleWebhook(req.body, req.headers);
          break;
        case 'paystack':
          const paystackSig = req.headers['x-paystack-signature'];
          await paystackHandler.handleWebhook(req.body, paystackSig, JSON.stringify(req.body));
          break;
        case 'mtn-momo':
          await mtnMomoHandler.handleWebhook(req.body, req.headers);
          break;
        case 'intasend':
          const intasendSig = req.headers['x-intasend-signature'] || req.headers['x-signature'];
          await intasendHandler.handleWebhook(req.body, intasendSig);
          break;
        default:
          logger.warn(`Unknown provider: ${provider}`);
      }
    } catch (error) {
      logger.error(`Middleware error: ${error}`);
    }
  };
}
