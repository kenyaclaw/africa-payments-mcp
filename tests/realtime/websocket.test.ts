/**
 * WebSocket Server Tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createServer, Server as HttpServer } from 'http';
import { PaymentWebSocketServer, WebSocketConfig } from '../../src/realtime/websocket.js';
import { StructuredLogger } from '../../src/utils/structured-logger.js';
import jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';

// Increase test timeout
jest.setTimeout(30000);

describe('PaymentWebSocketServer', () => {
  let httpServer: HttpServer;
  let wsServer: PaymentWebSocketServer;
  const JWT_SECRET = 'test-secret-key';
  const TEST_PORT = 3333;
  const TEST_URL = `http://localhost:${TEST_PORT}`;

  const createTestToken = (payload: object): string => {
    return jwt.sign(payload, JWT_SECRET);
  };

  beforeEach((done) => {
    httpServer = createServer();
    httpServer.listen(TEST_PORT, () => {
      done();
    });
  });

  afterEach(async () => {
    if (wsServer) {
      await wsServer.close();
    }
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  });

  describe('Initialization', () => {
    it('should initialize with valid config', () => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
        corsOrigins: ['http://localhost:3000'],
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      expect(wsServer).toBeDefined();
      expect(wsServer.getConnectionCount()).toBe(0);
    });

    it('should allow connections with valid JWT token', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const token = createTestToken({
        userId: 'user-123',
        tenantId: 'tenant-456',
        roles: ['admin'],
      });

      const clientSocket = io(TEST_URL, {
        path: '/socket.io',
        auth: { token },
      });

      clientSocket.on('connect', () => {
        expect(wsServer.getConnectionCount()).toBe(1);
        clientSocket.disconnect();
        done();
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });

    it('should reject connections without token', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const clientSocket = io(TEST_URL, {
        path: '/socket.io',
      });

      clientSocket.on('connect_error', (err) => {
        expect(err.message).toContain('Authentication');
        clientSocket.disconnect();
        done();
      });
    });

    it('should reject connections with invalid token', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const clientSocket = io(TEST_URL, {
        path: '/socket.io',
        auth: { token: 'invalid-token' },
      });

      clientSocket.on('connect_error', (err) => {
        expect(err.message).toContain('Invalid');
        clientSocket.disconnect();
        done();
      });
    });
  });

  describe('Room Management', () => {
    it('should allow client to subscribe to events', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const token = createTestToken({
        userId: 'user-123',
        tenantId: 'tenant-456',
      });

      const clientSocket = io(TEST_URL, {
        path: '/socket.io',
        auth: { token },
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('subscribe', {
          eventTypes: ['payment.completed', 'payment.failed'],
        }, (response: { success: boolean }) => {
          expect(response.success).toBe(true);
          clientSocket.disconnect();
          done();
        });
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });

    it('should allow client to join tenant room', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const token = createTestToken({
        userId: 'user-123',
        tenantId: 'tenant-456',
      });

      const clientSocket = io(TEST_URL, {
        path: '/socket.io',
        auth: { token },
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('join-tenant', 'tenant-456', (response: { success: boolean }) => {
          expect(response.success).toBe(true);
          clientSocket.disconnect();
          done();
        });
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });

    it('should deny access to other tenant rooms', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const token = createTestToken({
        userId: 'user-123',
        tenantId: 'tenant-456',
        roles: ['user'],
      });

      const clientSocket = io(TEST_URL, {
        path: '/socket.io',
        auth: { token },
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('join-tenant', 'tenant-999', (response: { success: boolean; error?: string }) => {
          expect(response.success).toBe(false);
          expect(response.error).toBe('Access denied');
          clientSocket.disconnect();
          done();
        });
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });

    it('should allow admin to join any tenant room', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const token = createTestToken({
        userId: 'admin-123',
        tenantId: 'tenant-456',
        roles: ['admin'],
      });

      const clientSocket = io(TEST_URL, {
        path: '/socket.io',
        auth: { token },
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('join-tenant', 'tenant-999', (response: { success: boolean }) => {
          expect(response.success).toBe(true);
          clientSocket.disconnect();
          done();
        });
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });
  });

  describe('Broadcasting', () => {
    it('should broadcast events to subscribed clients', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const token = createTestToken({
        userId: 'user-123',
        tenantId: 'tenant-456',
      });

      const clientSocket = io(TEST_URL, {
        path: '/socket.io',
        auth: { token },
      });

      clientSocket.on('connect', () => {
        // Subscribe and then wait for event
        clientSocket.emit('subscribe', {
          eventTypes: ['payment.completed'],
        });

        // Wait for subscription to be processed
        setTimeout(() => {
          // Listen for the event
          clientSocket.on('payment.completed', (data: unknown) => {
            expect(data).toBeDefined();
            clientSocket.disconnect();
            done();
          });

          // Broadcast the event
          wsServer.broadcast('payment.completed', {
            transactionId: 'tx-123',
            amount: 1000,
          });
        }, 100);
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });

    it('should send events to specific user', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const token = createTestToken({
        userId: 'user-123',
        tenantId: 'tenant-456',
      });

      const clientSocket = io(TEST_URL, {
        path: '/socket.io',
        auth: { token },
      });

      clientSocket.on('connect', () => {
        clientSocket.on('custom-event', (data: unknown) => {
          expect(data).toBeDefined();
          expect((data as { payload: { message: string } }).payload.message).toBe('Hello user-123');
          clientSocket.disconnect();
          done();
        });

        setTimeout(() => {
          wsServer.sendToUser('user-123', 'custom-event', { message: 'Hello user-123' });
        }, 100);
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });

    it('should send events to specific tenant', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const token = createTestToken({
        userId: 'user-123',
        tenantId: 'tenant-456',
      });

      const clientSocket = io(TEST_URL, {
        path: '/socket.io',
        auth: { token },
      });

      clientSocket.on('connect', () => {
        clientSocket.on('tenant-event', (data: unknown) => {
          expect(data).toBeDefined();
          clientSocket.disconnect();
          done();
        });

        setTimeout(() => {
          wsServer.sendToTenant('tenant-456', 'tenant-event', { message: 'Hello tenant' });
        }, 100);
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
        rateLimitPerMinute: 5,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const token = createTestToken({
        userId: 'user-123',
        tenantId: 'tenant-456',
      });

      const clientSocket = io(TEST_URL, {
        path: '/socket.io',
        auth: { token },
      });

      let subscribeCount = 0;
      let errorReceived = false;

      clientSocket.on('connect', () => {
        // Send multiple subscribe requests
        for (let i = 0; i < 10; i++) {
          clientSocket.emit('subscribe', {
            eventTypes: ['payment.completed'],
          }, (response: { success: boolean; error?: string }) => {
            subscribeCount++;
            if (!response.success && response.error?.includes('Rate limit')) {
              errorReceived = true;
            }

            if (subscribeCount === 10) {
              expect(errorReceived).toBe(true);
              clientSocket.disconnect();
              done();
            }
          });
        }
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });
  });

  describe('Connection Limits', () => {
    it('should enforce max connections per user', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
        maxConnectionsPerUser: 2,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const token = createTestToken({
        userId: 'user-123',
        tenantId: 'tenant-456',
      });

      const socket1 = io(TEST_URL, { path: '/socket.io', auth: { token } });
      const socket2 = io(TEST_URL, { path: '/socket.io', auth: { token } });

      let connectedCount = 0;
      let errorReceived = false;

      const checkComplete = () => {
        if (connectedCount + (errorReceived ? 1 : 0) === 3) {
          socket1.disconnect();
          socket2.disconnect();
          done();
        }
      };

      socket1.on('connect', () => {
        connectedCount++;
        checkComplete();
      });

      socket2.on('connect', () => {
        connectedCount++;
        
        // Try third connection
        const socket3 = io(TEST_URL, { path: '/socket.io', auth: { token } });
        
        socket3.on('connect', () => {
          socket3.disconnect();
          checkComplete();
        });

        socket3.on('connect_error', (err) => {
          if (err.message.includes('Maximum connections')) {
            errorReceived = true;
          }
          checkComplete();
        });
      });
    });
  });

  describe('Disconnection', () => {
    it('should track disconnections correctly', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const token = createTestToken({
        userId: 'user-123',
        tenantId: 'tenant-456',
      });

      const clientSocket = io(TEST_URL, {
        path: '/socket.io',
        auth: { token },
      });

      clientSocket.on('connect', () => {
        expect(wsServer.getConnectionCount()).toBe(1);
        clientSocket.disconnect();

        setTimeout(() => {
          expect(wsServer.getConnectionCount()).toBe(0);
          done();
        }, 100);
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });

    it('should allow disconnecting specific user', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const token = createTestToken({
        userId: 'user-123',
        tenantId: 'tenant-456',
      });

      const clientSocket = io(TEST_URL, {
        path: '/socket.io',
        auth: { token },
      });

      clientSocket.on('connect', () => {
        expect(wsServer.getUserSockets('user-123').length).toBe(1);
        
        wsServer.disconnectUser('user-123', 'Test disconnection');

        setTimeout(() => {
          expect(wsServer.getUserSockets('user-123').length).toBe(0);
          done();
        }, 100);
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });
  });

  describe('Metrics', () => {
    it('should track connection metrics', (done) => {
      const config: WebSocketConfig = {
        jwtSecret: JWT_SECRET,
      };

      wsServer = new PaymentWebSocketServer(httpServer, config, new StructuredLogger());

      const token = createTestToken({
        userId: 'user-123',
        tenantId: 'tenant-456',
      });

      const clientSocket = io(TEST_URL, {
        path: '/socket.io',
        auth: { token },
      });

      clientSocket.on('connect', () => {
        const metrics = wsServer.getMetrics();
        
        expect(metrics.totalConnections).toBe(1);
        expect(metrics.authenticatedConnections).toBe(1);
        
        clientSocket.disconnect();
        done();
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });
  });
});
