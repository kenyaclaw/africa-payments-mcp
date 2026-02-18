/**
 * Security Middleware Tests
 */

import { Request, Response, NextFunction } from 'express';
import {
  createIPWhitelist,
  createSignatureVerification,
  createRateLimiter,
  createSizeLimit,
  createCORS,
  createHelmetMiddleware,
  validateContentType,
  sanitizeRequest,
  securityErrorHandler,
  applySecurityMiddleware,
} from '../security';

describe('Security Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      connection: { remoteAddress: '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
      path: '/test',
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };
    nextFunction = jest.fn();
  });

  describe('createIPWhitelist', () => {
    it('should allow whitelisted IPs', () => {
      const middleware = createIPWhitelist({
        allowedIPs: ['192.168.1.1', '10.0.0.1'],
        allowLocalhost: false,
      });

      mockReq.connection = { remoteAddress: '192.168.1.1' };
      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should block non-whitelisted IPs', () => {
      const middleware = createIPWhitelist({
        allowedIPs: ['192.168.1.1'],
        allowLocalhost: false,
      });

      mockReq.connection = { remoteAddress: '1.2.3.4' };
      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error' })
      );
    });

    it('should allow localhost when configured', () => {
      const middleware = createIPWhitelist({
        allowedIPs: [],
        allowLocalhost: true,
      });

      middleware(mockReq as Request, mockRes as Response, nextFunction);
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should handle X-Forwarded-For header', () => {
      const middleware = createIPWhitelist({
        allowedIPs: ['192.168.1.1'],
      });

      mockReq.headers = { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' };
      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should block requests with no IP', () => {
      const middleware = createIPWhitelist({
        allowedIPs: ['192.168.1.1'],
      });

      mockReq.connection = { remoteAddress: undefined };
      mockReq.socket = { remoteAddress: undefined };
      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe('createSignatureVerification', () => {
    it('should reject missing signature', () => {
      const middleware = createSignatureVerification({
        secret: 'test_secret',
        headerName: 'x-signature',
      });

      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Missing signature header' })
      );
    });

    it('should reject missing body', () => {
      const middleware = createSignatureVerification({
        secret: 'test_secret',
        headerName: 'x-signature',
      });

      mockReq.headers = { 'x-signature': 'some_sig' };
      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should verify valid signature', () => {
      const crypto = require('crypto');
      const secret = 'test_secret';
      const payload = '{"test":"data"}';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const middleware = createSignatureVerification({
        secret,
        headerName: 'x-signature',
      });

      mockReq.headers = { 'x-signature': signature };
      mockReq.body = payload;

      middleware(mockReq as Request, mockRes as Response, nextFunction);
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should reject invalid signature', () => {
      const middleware = createSignatureVerification({
        secret: 'test_secret',
        headerName: 'x-signature',
      });

      mockReq.headers = { 'x-signature': 'invalid_sig' };
      mockReq.body = '{"test":"data"}';

      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });

  describe('createRateLimiter', () => {
    it('should allow requests within limit', () => {
      const middleware = createRateLimiter({
        windowMs: 60000,
        maxRequests: 5,
      });

      middleware(mockReq as Request, mockRes as Response, nextFunction);
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should block requests over limit', () => {
      const middleware = createRateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      middleware(mockReq as Request, mockRes as Response, nextFunction);
      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(429);
    });

    it('should set rate limit headers', () => {
      const middleware = createRateLimiter({
        windowMs: 60000,
        maxRequests: 5,
      });

      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Limit',
        5
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        expect.any(Number)
      );
    });

    it('should use custom key generator', () => {
      const middleware = createRateLimiter({
        windowMs: 60000,
        maxRequests: 1,
        keyGenerator: (req) => req.headers['x-api-key'] as string || 'default',
      });

      mockReq.headers = { 'x-api-key': 'user1' };
      middleware(mockReq as Request, mockRes as Response, nextFunction);

      // Same API key should be rate limited
      expect(nextFunction).toHaveBeenCalledTimes(1);
    });
  });

  describe('createSizeLimit', () => {
    it('should allow requests under size limit', () => {
      const middleware = createSizeLimit({ maxSize: '1mb' });

      mockReq.headers = { 'content-length': '100' };
      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should block requests over size limit', () => {
      const middleware = createSizeLimit({ maxSize: '1kb' });

      mockReq.headers = { 'content-length': '2000' };
      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(413);
    });

    it('should handle missing content-length', () => {
      const middleware = createSizeLimit({ maxSize: '1mb' });

      mockReq.headers = {};
      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('validateContentType', () => {
    it('should allow valid content types', () => {
      const middleware = validateContentType(['application/json']);

      mockReq.method = 'POST';
      mockReq.headers = { 'content-type': 'application/json' };
      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should skip GET requests', () => {
      const middleware = validateContentType(['application/json']);

      mockReq.method = 'GET';
      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should reject invalid content types', () => {
      const middleware = validateContentType(['application/json']);

      mockReq.method = 'POST';
      mockReq.headers = { 'content-type': 'text/plain' };
      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(415);
    });
  });

  describe('sanitizeRequest', () => {
    it('should sanitize request body', () => {
      const middleware = sanitizeRequest();

      mockReq.body = {
        name: '<script>alert(1)</script>test',
        normal: 'value',
      };

      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockReq.body.name).toBe('alert(1)test');
      expect(mockReq.body.normal).toBe('value');
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should handle arrays in body', () => {
      const middleware = sanitizeRequest();

      mockReq.body = [
        { name: '<b>test</b>' },
        { name: 'normal' },
      ];

      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockReq.body[0].name).toBe('b/test/b');
    });

    it('should remove dangerous keys', () => {
      const middleware = sanitizeRequest();

      mockReq.body = {
        name: 'test',
        '$where': 'malicious',
        'nested.key': 'also bad',
      };

      middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockReq.body).not.toHaveProperty('$where');
      expect(mockReq.body).not.toHaveProperty('nested.key');
      expect(mockReq.body).toHaveProperty('name');
    });
  });

  describe('securityErrorHandler', () => {
    it('should handle security errors', () => {
      const error = new Error('CORS blocked');

      securityErrorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Access denied' })
      );
    });

    it('should handle generic errors in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Database connection failed');

      securityErrorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Internal server error' })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should include error details in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Detailed error');

      securityErrorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        nextFunction
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Detailed error',
          stack: expect.any(String),
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('applySecurityMiddleware', () => {
    it('should apply all middleware', () => {
      const app = {
        use: jest.fn(),
      };

      const result = applySecurityMiddleware(app as any, {
        helmet: true,
        cors: {
          allowedOrigins: ['http://localhost:3000'],
        },
        rateLimit: {
          windowMs: 60000,
          maxRequests: 100,
        },
        sizeLimit: {
          maxSize: '1mb',
        },
      });

      expect(app.use).toHaveBeenCalledTimes(4);
      expect(result).toBe(app);
    });

    it('should skip helmet when disabled', () => {
      const app = {
        use: jest.fn(),
      };

      applySecurityMiddleware(app as any, {
        helmet: false,
      });

      expect(app.use).not.toHaveBeenCalled();
    });
  });
});
