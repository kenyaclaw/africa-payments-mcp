/**
 * Vercel Edge Middleware
 * Handles authentication, rate limiting, and security headers
 */

import { NextResponse } from 'next/server.js';
import type { NextRequest } from 'next/server.js';

// Rate limiting storage (in-memory, per-region)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Idempotency-Key',
  'Access-Control-Max-Age': '86400',
};

// Security headers
const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'none'; object-src 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
};

/**
 * Check rate limit for a given key
 */
function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  
  if (!record || now > record.resetTime) {
    // New window
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      allowed: true,
      remaining: limit - 1,
      reset: Math.ceil((now + windowMs) / 1000),
    };
  }
  
  if (record.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      reset: Math.ceil(record.resetTime / 1000),
    };
  }
  
  record.count++;
  return {
    allowed: true,
    remaining: limit - record.count,
    reset: Math.ceil(record.resetTime / 1000),
  };
}

/**
 * Main middleware function
 */
export async function middleware(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...corsHeaders,
      },
    });
  }
  
  // Skip middleware for health checks
  if (path === '/api/payments/health') {
    const response = NextResponse.next();
    
    // Add security headers
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    return response;
  }
  
  // Get client IP
  const ip = request.ip || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  
  // Check IP allowlist if configured
  const allowedIps = process.env.ALLOWED_IPS?.split(',') || [];
  if (allowedIps.length > 0 && !allowedIps.includes(ip)) {
    return new NextResponse(
      JSON.stringify({ error: 'Forbidden - IP not allowed' }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
  
  // Rate limiting by IP
  const rateLimit = checkRateLimit(
    `ip:${ip}`,
    parseInt(process.env.RATE_LIMIT_REQUESTS || '100'),
    parseInt(process.env.RATE_LIMIT_WINDOW || '60000')
  );
  
  if (!rateLimit.allowed) {
    return new NextResponse(
      JSON.stringify({ error: 'Too many requests' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': process.env.RATE_LIMIT_REQUESTS || '100',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimit.reset),
          ...corsHeaders,
        },
      }
    );
  }
  
  // Validate API Key for protected routes
  if (path.startsWith('/api/payments/')) {
    const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!apiKey) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized - API Key required' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
    
    // Check against environment variable (simple validation)
    const validKeys = process.env.API_KEYS?.split(',') || [];
    if (validKeys.length > 0 && !validKeys.includes(apiKey)) {
      return new NextResponse(
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
    
    // Rate limiting by API Key (stricter)
    const keyRateLimit = checkRateLimit(
      `key:${apiKey}`,
      parseInt(process.env.API_KEY_RATE_LIMIT || '1000'),
      60000
    );
    
    if (!keyRateLimit.allowed) {
      return new NextResponse(
        JSON.stringify({ error: 'API Key rate limit exceeded' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': process.env.API_KEY_RATE_LIMIT || '1000',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(keyRateLimit.reset),
            ...corsHeaders,
          },
        }
      );
    }
  }
  
  // Continue to the route handler
  const response = NextResponse.next();
  
  // Add rate limit headers
  response.headers.set('X-RateLimit-Limit', process.env.RATE_LIMIT_REQUESTS || '100');
  response.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
  response.headers.set('X-RateLimit-Reset', String(rateLimit.reset));
  
  // Add CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  // Add security headers
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  return response;
}

/**
 * Configure which paths the middleware runs on
 */
export const config = {
  matcher: [
    '/api/payments/:path*',
    '/api/health',
  ],
};
