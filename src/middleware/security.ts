/**
 * Security Middleware for Africa Payments MCP
 * 
 * Express middleware for:
 * - IP whitelisting
 * - Webhook signature verification
 * - Rate limiting
 * - Request size limiting
 * - CORS configuration
 * - Security headers
 */

import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { 
  verifyWebhookSignature, 
  verifyPaystackSignature,
  RateLimiter,
  isValidIP,
  getSecurityHeaders,
} from '../utils/security.js';

// ============================================================================
// IP Whitelist Middleware
// ============================================================================

export interface IPWhitelistOptions {
  allowedIPs: string[];
  allowLocalhost?: boolean;
  provider?: 'paystack' | 'mpesa' | 'all';
}

const PROVIDER_IPS = {
  paystack: ['52.31.139.75', '52.49.173.169', '52.214.14.220'],
  mpesa: [], // Add M-Pesa IPs when available
};

/**
 * Create IP whitelist middleware
 */
export function createIPWhitelist(options: IPWhitelistOptions) {
  const { allowedIPs, allowLocalhost = false, provider } = options;
  
  // Combine user-provided IPs with provider IPs
  let whitelist = [...allowedIPs];
  
  if (provider && provider !== 'all') {
    whitelist = [...whitelist, ...PROVIDER_IPS[provider]];
  }
  
  if (allowLocalhost) {
    whitelist.push('127.0.0.1', '::1', '::ffff:127.0.0.1');
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = getClientIP(req);
    
    if (!clientIP) {
      res.status(403).json({
        status: 'error',
        message: 'Unable to determine client IP',
      });
      return;
    }

    if (!isValidIP(clientIP)) {
      res.status(403).json({
        status: 'error',
        message: 'Invalid IP address format',
      });
      return;
    }

    if (!whitelist.includes(clientIP)) {
      console.warn(`Blocked request from unauthorized IP: ${clientIP}`);
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    next();
  };
}

/**
 * Get client IP from request
 */
function getClientIP(req: Request): string | null {
  // Check X-Forwarded-For header (common with proxies)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) 
      ? forwarded[0] 
      : forwarded.split(',')[0].trim();
    return ips;
  }

  // Check X-Real-IP header
  const realIP = req.headers['x-real-ip'];
  if (realIP && typeof realIP === 'string') {
    return realIP;
  }

  // Fall back to connection remote address
  const remoteAddress = req.connection?.remoteAddress || req.socket?.remoteAddress;
  if (remoteAddress) {
    // Handle IPv4-mapped IPv6 addresses
    return remoteAddress.replace(/^::ffff:/, '');
  }

  return null;
}

// ============================================================================
// Webhook Signature Verification Middleware
// ============================================================================

export interface SignatureVerificationOptions {
  secret: string;
  algorithm?: 'sha256' | 'sha512';
  headerName?: string;
  provider?: 'paystack' | 'mpesa' | 'generic';
}

/**
 * Create webhook signature verification middleware
 */
export function createSignatureVerification(options: SignatureVerificationOptions) {
  const { 
    secret, 
    algorithm = 'sha256', 
    headerName = 'x-signature',
    provider = 'generic',
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.headers[headerName.toLowerCase()] as string;
    
    if (!signature) {
      res.status(401).json({
        status: 'error',
        message: 'Missing signature header',
      });
      return;
    }

    // Get raw body (should be attached by body parser)
    const payload = req.body;
    if (!payload) {
      res.status(400).json({
        status: 'error',
        message: 'Missing request body',
      });
      return;
    }

    let isValid = false;
    const payloadString = typeof payload === 'string' 
      ? payload 
      : JSON.stringify(payload);

    if (provider === 'paystack') {
      isValid = verifyPaystackSignature(payloadString, signature, secret);
    } else {
      isValid = verifyWebhookSignature(payloadString, signature, secret, algorithm);
    }

    if (!isValid) {
      console.warn('Invalid webhook signature received');
      res.status(401).json({
        status: 'error',
        message: 'Invalid signature',
      });
      return;
    }

    next();
  };
}

// ============================================================================
// Rate Limiting Middleware
// ============================================================================

export interface RateLimitMiddlewareOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  message?: string;
}

/**
 * Create rate limiting middleware
 */
export function createRateLimiter(options: RateLimitMiddlewareOptions) {
  const limiter = new RateLimiter({
    windowMs: options.windowMs,
    maxRequests: options.maxRequests,
  });

  const keyGenerator = options.keyGenerator || ((req: Request) => {
    return getClientIP(req) || 'unknown';
  });

  const message = options.message || 'Rate limit exceeded. Please try again later.';

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const result = limiter.check(key);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));
    res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    if (!result.allowed) {
      res.status(429).json({
        status: 'error',
        message,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      });
      return;
    }

    // Store result for potential skip logic
    (req as any).rateLimit = result;

    next();
  };
}

/**
 * Rate limiter with different limits for different endpoints
 */
export function createTieredRateLimiter(tiers: {
  webhooks: RateLimitMiddlewareOptions;
  api: RateLimitMiddlewareOptions;
  health: RateLimitMiddlewareOptions;
}) {
  const webhookLimiter = createRateLimiter(tiers.webhooks);
  const apiLimiter = createRateLimiter(tiers.api);
  const healthLimiter = createRateLimiter(tiers.health);

  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path;

    if (path.includes('/webhook')) {
      return webhookLimiter(req, res, next);
    }
    
    if (path.includes('/health')) {
      return healthLimiter(req, res, next);
    }

    return apiLimiter(req, res, next);
  };
}

// ============================================================================
// Request Size Limiting
// ============================================================================

export interface SizeLimitOptions {
  maxSize: string | number;  // e.g., '1mb', 1024*1024
  message?: string;
}

/**
 * Create request size limit middleware
 */
export function createSizeLimit(options: SizeLimitOptions) {
  const maxSize = typeof options.maxSize === 'string' 
    ? parseSize(options.maxSize) 
    : options.maxSize;

  const message = options.message || 'Request entity too large';

  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    
    if (contentLength > maxSize) {
      res.status(413).json({
        status: 'error',
        message,
        maxSize: formatSize(maxSize),
      });
      return;
    }

    next();
  };
}

function parseSize(size: string): number {
  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';

  return value * units[unit];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}b`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}kb`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}mb`;
  return `${Math.round(bytes / (1024 * 1024 * 1024))}gb`;
}

// ============================================================================
// CORS Configuration
// ============================================================================

export interface CORSOptions {
  allowedOrigins: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  allowCredentials?: boolean;
  maxAge?: number;
}

/**
 * Create CORS middleware with strict configuration
 */
export function createCORS(options: CORSOptions) {
  const {
    allowedOrigins,
    allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With'],
    allowCredentials = true,
    maxAge = 86400,
  } = options;

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: allowedMethods,
    allowedHeaders,
    credentials: allowCredentials,
    maxAge,
  });
}

// ============================================================================
// Security Headers Middleware
// ============================================================================

/**
 * Configure Helmet with recommended security headers
 */
export function createHelmetMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginOpenerPolicy: { policy: 'same-origin' as any },
    crossOriginResourcePolicy: { policy: 'cross-origin' as any },
    dnsPrefetchControl: { allow: false },
    // expectCt removed - deprecated in Helmet v7+
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  });
}

// ============================================================================
// Request Validation Middleware
// ============================================================================

/**
 * Validate request content type
 */
export function validateContentType(allowedTypes: string[] = ['application/json']) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      return next();
    }

    const contentType = req.headers['content-type'] || '';
    
    const isAllowed = allowedTypes.some(type => 
      contentType.toLowerCase().includes(type.toLowerCase())
    );

    if (!isAllowed) {
      res.status(415).json({
        status: 'error',
        message: `Unsupported Media Type. Allowed types: ${allowedTypes.join(', ')}`,
      });
      return;
    }

    next();
  };
}

/**
 * Sanitize request body
 */
export function sanitizeRequest() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    next();
  };
}

function sanitizeObject(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Remove potentially dangerous keys
      if (key.startsWith('$') || key.includes('.')) {
        continue;
      }
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  if (typeof obj === 'string') {
    // Basic XSS prevention
    return obj
      .replace(/[<>]/g, '')
      .trim()
      .slice(0, 10000);
  }

  return obj;
}

// ============================================================================
// Combined Security Middleware
// ============================================================================

export interface SecurityMiddlewareOptions {
  helmet?: boolean;
  cors?: CORSOptions;
  rateLimit?: RateLimitMiddlewareOptions;
  sizeLimit?: SizeLimitOptions;
}

/**
 * Apply all security middleware
 */
export function applySecurityMiddleware(app: any, options: SecurityMiddlewareOptions = {}) {
  // Apply Helmet
  if (options.helmet !== false) {
    app.use(createHelmetMiddleware());
  }

  // Apply CORS
  if (options.cors) {
    app.use(createCORS(options.cors));
  }

  // Apply size limiting
  if (options.sizeLimit) {
    app.use(createSizeLimit(options.sizeLimit));
  }

  // Apply rate limiting
  if (options.rateLimit) {
    app.use(createRateLimiter(options.rateLimit));
  }

  return app;
}

// ============================================================================
// Error Handling Middleware
// ============================================================================

/**
 * Security-focused error handler
 * Prevents information leakage in error responses
 */
export function securityErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log full error internally
  console.error('Security error:', err);

  // Determine if this is a security-related error
  const isSecurityError = err.message?.includes('CORS') || 
                          err.message?.includes('signature') ||
                          err.message?.includes('unauthorized');

  if (isSecurityError) {
    res.status(403).json({
      status: 'error',
      message: 'Access denied',
    });
    return;
  }

  // For other errors, return generic message in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    status: 'error',
    message: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack }),
  });
}
