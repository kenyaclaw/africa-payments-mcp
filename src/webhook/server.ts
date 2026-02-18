/**
 * Webhook Server for Africa Payments MCP
 * Express server to receive and process webhooks from all payment providers
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { URL } from 'url';
import { ILogger, getGlobalLogger, StructuredLogger } from '../utils/structured-logger.js';
import { MetricsCollector, getGlobalMetrics } from '../utils/metrics.js';
import { CircuitBreakerRegistry, getGlobalCircuitBreakerRegistry } from '../utils/circuit-breaker.js';
import { IdempotencyStore, getGlobalIdempotencyStore } from '../utils/idempotency.js';
import { HealthMonitor, getGlobalHealthMonitor } from '../utils/health-check.js';
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
  logger?: ILogger;
  // Custom metrics collector (optional)
  metrics?: MetricsCollector;
  // Custom circuit breaker registry (optional)
  circuitBreakers?: CircuitBreakerRegistry;
  // Custom idempotency store (optional)
  idempotencyStore?: IdempotencyStore;
  // Custom health monitor (optional)
  healthMonitor?: HealthMonitor;
  // Critical providers for health checks
  criticalProviders?: string[];
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
  correlationId?: string;
}

// ==================== Webhook Server Class ====================

export class WebhookServer {
  private server: Server | null = null;
  private logger: ILogger;
  private eventEmitter: PaymentEventEmitter;
  private verifier: WebhookVerifier;
  private config: WebhookServerConfig;
  private requestLogs: WebhookLogEntry[] = [];
  private maxLogEntries: number = 1000;

  // Observability components
  private metrics: MetricsCollector;
  private circuitBreakers: CircuitBreakerRegistry;
  private idempotencyStore: IdempotencyStore;
  private healthMonitor: HealthMonitor;

  // Handler instances
  private mpesaHandler: MpesaWebhookHandler;
  private paystackHandler: PaystackWebhookHandler;
  private mtnMomoHandler: MTNMoMoWebhookHandler;
  private intasendHandler: IntaSendWebhookHandler;

  // Active connections counter
  private activeConnections = 0;

  constructor(config: WebhookServerConfig) {
    this.config = {
      host: '0.0.0.0',
      path: '/webhooks',
      ...config,
    };

    // Initialize observability components
    this.logger = config.logger || getGlobalLogger();
    this.metrics = config.metrics || getGlobalMetrics();
    this.circuitBreakers = config.circuitBreakers || getGlobalCircuitBreakerRegistry();
    this.idempotencyStore = config.idempotencyStore || getGlobalIdempotencyStore();
    this.healthMonitor = config.healthMonitor || getGlobalHealthMonitor({
      criticalProviders: config.criticalProviders,
    });

    this.eventEmitter = config.eventEmitter || getGlobalEventEmitter(this.logger);
    this.verifier = getGlobalVerifier(this.logger);

    // Register providers with circuit breakers
    this.registerCircuitBreakers();

    // Register health checks
    this.registerHealthChecks();

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

  private registerCircuitBreakers(): void {
    const providers = ['mpesa', 'paystack', 'mtn-momo', 'intasend'];
    for (const provider of providers) {
      const breaker = this.circuitBreakers.register(provider, {
        failureThreshold: 5,
        resetTimeoutMs: 30000,
        successThreshold: 3,
      });

      // Listen for circuit breaker events
      breaker.on('trip', ({ provider, failures }) => {
        this.logger.warn(`Circuit breaker tripped for ${provider}`, { failures });
        this.metrics.setCircuitBreakerState(provider, 1);
      });

      breaker.on('reset', ({ provider }) => {
        this.logger.info(`Circuit breaker reset for ${provider}`);
        this.metrics.setCircuitBreakerState(provider, 0);
      });

      breaker.on('state_change', ({ provider, from, to }) => {
        this.logger.info(`Circuit breaker state change for ${provider}: ${from} -> ${to}`);
        const stateValue = to === 'OPEN' ? 1 : to === 'HALF_OPEN' ? 0.5 : 0;
        this.metrics.setCircuitBreakerState(provider, stateValue as 0 | 0.5 | 1);
      });
    }
  }

  private registerHealthChecks(): void {
    // Register basic health checks for each provider
    const providers = ['mpesa', 'paystack', 'mtn-momo', 'intasend'];
    for (const provider of providers) {
      this.healthMonitor.registerProvider(provider, async () => {
        const breaker = this.circuitBreakers.get(provider);
        if (breaker && breaker.getState() === 'OPEN') {
          return {
            healthy: false,
            error: 'Circuit breaker is OPEN',
            metadata: { circuitBreakerState: breaker.getState() },
          };
        }
        return { healthy: true };
      });
    }

    // Start health monitoring
    this.healthMonitor.start();
  }

  /**
   * Start the webhook server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.listen(this.config.port, this.config.host, () => {
        this.logger.info(`🌐 Webhook server listening on ${this.config.host}:${this.config.port}`);
        this.logger.info(`   Health Check: GET /health`);
        this.logger.info(`   Metrics:      GET /metrics`);
        this.logger.info(`   M-Pesa:       POST ${this.config.path}/mpesa`);
        this.logger.info(`   Paystack:     POST ${this.config.path}/paystack`);
        this.logger.info(`   MTN MoMo:     POST ${this.config.path}/mtn-momo`);
        this.logger.info(`   IntaSend:     POST ${this.config.path}/intasend`);
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
      // Stop health monitoring
      this.healthMonitor.stop();

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
    const correlationId = req.headers['x-correlation-id'] as string || 
                          StructuredLogger.generateCorrelationId();
    const requestId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    // Increment active connections
    this.activeConnections++;
    this.metrics.incrementConnections();

    // Create child logger with correlation ID
    const logger = this.logger.child ? this.logger.child({ correlationId, requestId }) : this.logger;
    
    try {
      // Parse URL
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const method = req.method || 'GET';

      logger.debug(`${method} ${url.pathname}`, {
        http: { method, url: url.pathname, correlationId, requestId },
      });

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Paystack-Signature, X-Intasend-Signature, X-Correlation-Id, X-Request-Id, X-Idempotency-Key');

      // Handle preflight
      if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        this.decrementConnections();
        return;
      }

      // Health check endpoint
      if (url.pathname === '/health' || url.pathname === '/healthz') {
        await this.handleHealthCheck(res);
        this.logRequest(requestId, 'health', method, url.pathname, 200, Date.now() - startTime, true, undefined, correlationId);
        this.decrementConnections();
        return;
      }

      // Metrics endpoint
      if (url.pathname === '/metrics') {
        await this.handleMetrics(res);
        this.logRequest(requestId, 'metrics', method, url.pathname, 200, Date.now() - startTime, true, undefined, correlationId);
        this.decrementConnections();
        return;
      }

      // Circuit breaker reset endpoint
      if (url.pathname === '/circuit-breaker/reset' && method === 'POST') {
        await this.handleCircuitBreakerReset(req, res);
        this.logRequest(requestId, 'circuit-breaker', method, url.pathname, 200, Date.now() - startTime, true, undefined, correlationId);
        this.decrementConnections();
        return;
      }

      // Logs endpoint (for debugging)
      if (url.pathname === `${this.config.path}/logs` && method === 'GET') {
        this.handleLogsRequest(res);
        this.logRequest(requestId, 'logs', method, url.pathname, 200, Date.now() - startTime, true, undefined, correlationId);
        this.decrementConnections();
        return;
      }

      // Webhook endpoints - only accept POST
      if (method !== 'POST') {
        this.sendError(res, 405, 'Method not allowed');
        this.logRequest(requestId, 'unknown', method, url.pathname, 405, Date.now() - startTime, false, 'Method not allowed', correlationId);
        this.decrementConnections();
        return;
      }

      // Route to appropriate handler
      const basePath = this.config.path || '/webhooks';
      
      if (url.pathname === `${basePath}/mpesa`) {
        await this.handleMpesaWebhook(req, res, requestId, startTime, correlationId, logger);
      } else if (url.pathname === `${basePath}/paystack`) {
        await this.handlePaystackWebhook(req, res, requestId, startTime, correlationId, logger);
      } else if (url.pathname === `${basePath}/mtn-momo`) {
        await this.handleMTNMoMoWebhook(req, res, requestId, startTime, correlationId, logger);
      } else if (url.pathname === `${basePath}/intasend`) {
        await this.handleIntaSendWebhook(req, res, requestId, startTime, correlationId, logger);
      } else {
        this.sendError(res, 404, 'Not found');
        this.logRequest(requestId, 'unknown', method, url.pathname, 404, Date.now() - startTime, false, 'Not found', correlationId);
        this.decrementConnections();
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Request handling error: ${errorMessage}`, error as Error);
      this.sendError(res, 500, 'Internal server error');
      this.logRequest(requestId, 'unknown', req.method || 'UNKNOWN', req.url || '/', 500, Date.now() - startTime, false, errorMessage, correlationId);
      this.decrementConnections();
    }
  }

  private decrementConnections(): void {
    this.activeConnections--;
    this.metrics.decrementConnections();
  }

  /**
   * Handle M-Pesa webhook
   */
  private async handleMpesaWebhook(
    req: IncomingMessage, 
    res: ServerResponse,
    requestId: string,
    startTime: number,
    correlationId: string,
    logger: ILogger
  ): Promise<void> {
    const provider = 'mpesa';
    
    // Check circuit breaker
    if (!this.circuitBreakers.canExecute(provider)) {
      this.sendError(res, 503, 'Service temporarily unavailable - circuit breaker open');
      this.logRequest(requestId, provider, 'POST', req.url || '/', 503, Date.now() - startTime, false, 'Circuit breaker open', correlationId);
      this.decrementConnections();
      return;
    }

    try {
      const body = await this.parseJsonBody(req);
      
      // Process asynchronously - respond immediately
      this.respondOk(res, { received: true, requestId, correlationId });
      
      // Process webhook after response
      const processStart = Date.now();
      const result = await this.mpesaHandler.handleWebhook(body, req.headers as Record<string, string | string[]>);
      const duration = Date.now() - processStart;
      
      this.metrics.recordWebhook({
        provider,
        eventType: body.Body?.stkCallback ? 'stk_callback' : 'other',
        status: result.success ? 'success' : 'error',
        duration,
      });

      if (result.success) {
        this.circuitBreakers.recordSuccess(provider);
      } else {
        this.circuitBreakers.recordFailure(provider, new Error(result.message));
      }
      
      this.logRequest(requestId, provider, 'POST', req.url || '/', result.success ? 200 : 400, Date.now() - startTime, result.success, result.success ? undefined : result.message, correlationId);
      
      logger.info(`M-Pesa webhook processed: ${result.message}`, {
        provider,
        success: result.success,
        duration,
      });
    } catch (error) {
      this.respondOk(res, { received: true, requestId, correlationId }); // Still return 200 to prevent retries
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.circuitBreakers.recordFailure(provider, error as Error);
      this.metrics.recordWebhook({
        provider,
        eventType: 'unknown',
        status: 'error',
        duration: Date.now() - startTime,
      });
      this.logRequest(requestId, provider, 'POST', req.url || '/', 500, Date.now() - startTime, false, errorMessage, correlationId);
      logger.error(`M-Pesa webhook error: ${errorMessage}`, error as Error);
    } finally {
      this.decrementConnections();
    }
  }

  /**
   * Handle Paystack webhook
   */
  private async handlePaystackWebhook(
    req: IncomingMessage, 
    res: ServerResponse,
    requestId: string,
    startTime: number,
    correlationId: string,
    logger: ILogger
  ): Promise<void> {
    const provider = 'paystack';
    
    // Check circuit breaker
    if (!this.circuitBreakers.canExecute(provider)) {
      this.sendError(res, 503, 'Service temporarily unavailable - circuit breaker open');
      this.logRequest(requestId, provider, 'POST', req.url || '/', 503, Date.now() - startTime, false, 'Circuit breaker open', correlationId);
      this.decrementConnections();
      return;
    }

    try {
      const rawBody = await this.getRawBody(req);
      const body = JSON.parse(rawBody.toString('utf8'));
      
      // Extract signature from header
      const signature = this.extractHeader(req, 'x-paystack-signature');
      
      // Process asynchronously - respond immediately
      this.respondOk(res, { received: true, requestId, correlationId });
      
      // Process webhook after response
      const processStart = Date.now();
      const result = await this.paystackHandler.handleWebhook(body, signature, rawBody.toString('utf8'));
      const duration = Date.now() - processStart;
      
      const status = result.success ? 'success' : signature ? 'error' : 'invalid_signature';
      this.metrics.recordWebhook({
        provider,
        eventType: body.event || 'unknown',
        status,
        duration,
      });

      if (result.success) {
        this.circuitBreakers.recordSuccess(provider);
      } else {
        this.circuitBreakers.recordFailure(provider, new Error(result.message));
      }
      
      this.logRequest(requestId, provider, 'POST', req.url || '/', result.success ? 200 : 400, Date.now() - startTime, result.success, result.success ? undefined : result.message, correlationId);
      
      logger.info(`Paystack webhook processed: ${result.message}`, {
        provider,
        success: result.success,
        duration,
        event: body.event,
      });
    } catch (error) {
      this.respondOk(res, { received: true, requestId, correlationId }); // Still return 200 to prevent retries
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.circuitBreakers.recordFailure(provider, error as Error);
      this.metrics.recordWebhook({
        provider,
        eventType: 'unknown',
        status: 'error',
        duration: Date.now() - startTime,
      });
      this.logRequest(requestId, provider, 'POST', req.url || '/', 500, Date.now() - startTime, false, errorMessage, correlationId);
      logger.error(`Paystack webhook error: ${errorMessage}`, error as Error);
    } finally {
      this.decrementConnections();
    }
  }

  /**
   * Handle MTN MoMo webhook
   */
  private async handleMTNMoMoWebhook(
    req: IncomingMessage, 
    res: ServerResponse,
    requestId: string,
    startTime: number,
    correlationId: string,
    logger: ILogger
  ): Promise<void> {
    const provider = 'mtn-momo';
    
    // Check circuit breaker
    if (!this.circuitBreakers.canExecute(provider)) {
      this.sendError(res, 503, 'Service temporarily unavailable - circuit breaker open');
      this.logRequest(requestId, provider, 'POST', req.url || '/', 503, Date.now() - startTime, false, 'Circuit breaker open', correlationId);
      this.decrementConnections();
      return;
    }

    try {
      const body = await this.parseJsonBody(req);
      
      // Process asynchronously - respond immediately
      this.respondOk(res, { received: true, requestId, correlationId });
      
      // Process webhook after response
      const processStart = Date.now();
      const result = await this.mtnMomoHandler.handleWebhook(body, req.headers as Record<string, string | string[]>);
      const duration = Date.now() - processStart;
      
      this.metrics.recordWebhook({
        provider,
        eventType: body.status || 'unknown',
        status: result.success ? 'success' : 'error',
        duration,
      });

      if (result.success) {
        this.circuitBreakers.recordSuccess(provider);
      } else {
        this.circuitBreakers.recordFailure(provider, new Error(result.message));
      }
      
      this.logRequest(requestId, provider, 'POST', req.url || '/', result.success ? 200 : 400, Date.now() - startTime, result.success, result.success ? undefined : result.message, correlationId);
      
      logger.info(`MTN MoMo webhook processed: ${result.message}`, {
        provider,
        success: result.success,
        duration,
      });
    } catch (error) {
      this.respondOk(res, { received: true, requestId, correlationId });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.circuitBreakers.recordFailure(provider, error as Error);
      this.metrics.recordWebhook({
        provider,
        eventType: 'unknown',
        status: 'error',
        duration: Date.now() - startTime,
      });
      this.logRequest(requestId, provider, 'POST', req.url || '/', 500, Date.now() - startTime, false, errorMessage, correlationId);
      logger.error(`MTN MoMo webhook error: ${errorMessage}`, error as Error);
    } finally {
      this.decrementConnections();
    }
  }

  /**
   * Handle IntaSend webhook
   */
  private async handleIntaSendWebhook(
    req: IncomingMessage, 
    res: ServerResponse,
    requestId: string,
    startTime: number,
    correlationId: string,
    logger: ILogger
  ): Promise<void> {
    const provider = 'intasend';
    
    // Check circuit breaker
    if (!this.circuitBreakers.canExecute(provider)) {
      this.sendError(res, 503, 'Service temporarily unavailable - circuit breaker open');
      this.logRequest(requestId, provider, 'POST', req.url || '/', 503, Date.now() - startTime, false, 'Circuit breaker open', correlationId);
      this.decrementConnections();
      return;
    }

    try {
      const body = await this.parseJsonBody(req);
      
      // Extract signature from header
      const signature = this.extractHeader(req, 'x-intasend-signature') || this.extractHeader(req, 'x-signature');
      
      // Process asynchronously - respond immediately
      this.respondOk(res, { received: true, requestId, correlationId });
      
      // Process webhook after response
      const processStart = Date.now();
      const result = await this.intasendHandler.handleWebhook(body, signature);
      const duration = Date.now() - processStart;
      
      this.metrics.recordWebhook({
        provider,
        eventType: body.event || body.state || 'unknown',
        status: result.success ? 'success' : 'error',
        duration,
      });

      if (result.success) {
        this.circuitBreakers.recordSuccess(provider);
      } else {
        this.circuitBreakers.recordFailure(provider, new Error(result.message));
      }
      
      this.logRequest(requestId, provider, 'POST', req.url || '/', result.success ? 200 : 400, Date.now() - startTime, result.success, result.success ? undefined : result.message, correlationId);
      
      logger.info(`IntaSend webhook processed: ${result.message}`, {
        provider,
        success: result.success,
        duration,
      });
    } catch (error) {
      this.respondOk(res, { received: true, requestId, correlationId });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.circuitBreakers.recordFailure(provider, error as Error);
      this.metrics.recordWebhook({
        provider,
        eventType: 'unknown',
        status: 'error',
        duration: Date.now() - startTime,
      });
      this.logRequest(requestId, provider, 'POST', req.url || '/', 500, Date.now() - startTime, false, errorMessage, correlationId);
      logger.error(`IntaSend webhook error: ${errorMessage}`, error as Error);
    } finally {
      this.decrementConnections();
    }
  }

  /**
   * Handle health check
   */
  private async handleHealthCheck(res: ServerResponse): Promise<void> {
    const healthResult = this.healthMonitor.getHealthResult();
    const statusCode = this.healthMonitor.getHttpStatusCode();

    // Update circuit breaker statuses in health result
    for (const providerHealth of healthResult.providers) {
      const breakerStatus = this.circuitBreakers.getStatus(providerHealth.name);
      if (breakerStatus) {
        providerHealth.circuitBreaker = breakerStatus;
        // Mark as unhealthy if circuit is open
        if (breakerStatus.state === 'OPEN') {
          providerHealth.status = 'unhealthy';
          providerHealth.error = 'Circuit breaker is OPEN';
        }
      }
    }

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...healthResult,
      timestamp: healthResult.timestamp.toISOString(),
      activeConnections: this.activeConnections,
    }));
  }

  /**
   * Handle metrics request
   */
  private async handleMetrics(res: ServerResponse): Promise<void> {
    const metrics = await this.metrics.getMetrics();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(metrics);
  }

  /**
   * Handle circuit breaker reset request
   */
  private async handleCircuitBreakerReset(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.parseJsonBody(req);
      const { provider } = body;

      if (!provider) {
        this.sendError(res, 400, 'Missing provider parameter');
        return;
      }

      const success = this.circuitBreakers.reset(provider);
      
      if (success) {
        this.logger.info(`Circuit breaker manually reset for ${provider}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: `Circuit breaker reset for ${provider}`,
          provider,
        }));
      } else {
        this.sendError(res, 404, `Provider ${provider} not found`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Circuit breaker reset error: ${errorMessage}`, error as Error);
      this.sendError(res, 500, 'Internal server error');
    }
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
    error?: string,
    correlationId?: string
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
      correlationId,
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

  /**
   * Get observability components
   */
  getObservability() {
    return {
      logger: this.logger,
      metrics: this.metrics,
      circuitBreakers: this.circuitBreakers,
      idempotencyStore: this.idempotencyStore,
      healthMonitor: this.healthMonitor,
    };
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
  const logger = config.logger || getGlobalLogger();
  const eventEmitter = config.eventEmitter || getGlobalEventEmitter(logger);
  const verifier = getGlobalVerifier(logger);
  const circuitBreakers = config.circuitBreakers || getGlobalCircuitBreakerRegistry();

  const mpesaHandler = createMpesaWebhookHandler(logger, eventEmitter, verifier);
  const paystackHandler = createPaystackWebhookHandler(logger, eventEmitter, verifier, config.secrets?.paystack);
  const mtnMomoHandler = createMTNMoMoWebhookHandler(logger, eventEmitter, verifier, config.secrets?.['mtn-momo']);
  const intasendHandler = createIntaSendWebhookHandler(logger, eventEmitter, verifier, config.secrets?.intasend);

  return async (req: any, res: any, next: any) => {
    const provider = req.params.provider;
    const correlationId = req.headers['x-correlation-id'] || StructuredLogger.generateCorrelationId();
    const requestId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    try {
      // Check circuit breaker
      if (!circuitBreakers.canExecute(provider)) {
        res.status(503).json({ error: 'Service temporarily unavailable - circuit breaker open' });
        return;
      }

      // Always respond 200 immediately to prevent retries
      res.json({ received: true, requestId, correlationId });

      // Process asynchronously
      let result;
      switch (provider) {
        case 'mpesa':
          result = await mpesaHandler.handleWebhook(req.body, req.headers);
          break;
        case 'paystack':
          const paystackSig = req.headers['x-paystack-signature'];
          result = await paystackHandler.handleWebhook(req.body, paystackSig, JSON.stringify(req.body));
          break;
        case 'mtn-momo':
          result = await mtnMomoHandler.handleWebhook(req.body, req.headers);
          break;
        case 'intasend':
          const intasendSig = req.headers['x-intasend-signature'] || req.headers['x-signature'];
          result = await intasendHandler.handleWebhook(req.body, intasendSig);
          break;
        default:
          logger.warn(`Unknown provider: ${provider}`);
          return;
      }

      if (result.success) {
        circuitBreakers.recordSuccess(provider);
      } else {
        circuitBreakers.recordFailure(provider, new Error(result.message));
      }
    } catch (error) {
      logger.error(`Middleware error: ${error}`, error as Error);
      circuitBreakers.recordFailure(provider, error as Error);
    }
  };
}
