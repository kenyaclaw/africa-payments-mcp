/**
 * WebSocket Server for Real-time Payment Updates
 * Socket.io implementation with room-based broadcasting
 */

import { Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { ILogger, StructuredLogger } from '../utils/structured-logger.js';
import { PaymentEventData, PaymentEventType } from '../webhook/events.js';
import { Transaction } from '../types/index.js';

// ==================== Types & Interfaces ====================

export interface WebSocketConfig {
  /** JWT secret for authentication */
  jwtSecret: string;
  /** CORS origins allowed */
  corsOrigins?: string[];
  /** Namespace for payments */
  namespace?: string;
  /** Enable Redis adapter for multi-server scaling */
  redisUrl?: string;
  /** Ping timeout in ms */
  pingTimeout?: number;
  /** Ping interval in ms */
  pingInterval?: number;
  /** Enable per-message deflate compression */
  perMessageDeflate?: boolean;
  /** Maximum connections per user */
  maxConnectionsPerUser?: number;
  /** Rate limit: max events per minute per socket */
  rateLimitPerMinute?: number;
}

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  tenantId?: string;
  roles?: string[];
  isAuthenticated?: boolean;
  id: string;
}

export interface WebSocketEvent {
  type: PaymentEventType | 'connection.established' | 'connection.error';
  payload: unknown;
  timestamp: Date;
  tenantId?: string;
  userId?: string;
}

export interface SubscriptionRequest {
  eventTypes: PaymentEventType[];
  filters?: {
    providers?: string[];
    currencies?: string[];
    minAmount?: number;
    maxAmount?: number;
    countries?: string[];
  };
}

// ==================== Metrics Interface ====================

interface ConnectionMetrics {
  totalConnections: number;
  authenticatedConnections: number;
  connectionsByTenant: Map<string, number>;
  connectionsByUser: Map<string, number>;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
}

// ==================== WebSocket Server Class ====================

export class PaymentWebSocketServer {
  private io: Server;
  private logger: ILogger;
  private config: Required<WebSocketConfig>;
  private metrics: ConnectionMetrics;
  private userSocketMap: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private tenantSocketMap: Map<string, Set<string>> = new Map(); // tenantId -> socketIds
  private socketRateLimits: Map<string, number[]> = new Map(); // socketId -> timestamps

  private static readonly DEFAULT_CONFIG: Partial<WebSocketConfig> = {
    corsOrigins: ['*'],
    namespace: '/payments',
    pingTimeout: 60000,
    pingInterval: 25000,
    perMessageDeflate: true,
    maxConnectionsPerUser: 5,
    rateLimitPerMinute: 100,
  };

  constructor(
    server: HttpServer | HttpsServer,
    config: WebSocketConfig,
    logger?: ILogger
  ) {
    this.config = { ...PaymentWebSocketServer.DEFAULT_CONFIG, ...config } as Required<WebSocketConfig>;
    this.logger = logger || new StructuredLogger();
    this.metrics = {
      totalConnections: 0,
      authenticatedConnections: 0,
      connectionsByTenant: new Map(),
      connectionsByUser: new Map(),
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
    };

    this.io = new Server(server, {
      path: '/socket.io',
      cors: {
        origin: this.config.corsOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: this.config.pingTimeout,
      pingInterval: this.config.pingInterval,
      perMessageDeflate: this.config.perMessageDeflate,
      transports: ['websocket', 'polling'],
    });

    this.setupMiddleware();
    this.setupConnectionHandlers();
    this.startMetricsReporting();

    this.logger.info('🔌 WebSocket server initialized', {
      namespace: this.config.namespace,
      corsOrigins: this.config.corsOrigins,
    });
  }

  // ==================== Middleware ====================

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket: Socket, next) => {
      try {
        const token = this.extractToken(socket);
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, this.config.jwtSecret) as {
          userId: string;
          tenantId: string;
          roles?: string[];
        };

        const authSocket = socket as AuthenticatedSocket;
        authSocket.userId = decoded.userId;
        authSocket.tenantId = decoded.tenantId;
        authSocket.roles = decoded.roles || [];
        authSocket.isAuthenticated = true;

        // Check connection limits per user
        if (this.config.maxConnectionsPerUser > 0) {
          const userSockets = this.userSocketMap.get(decoded.userId) || new Set();
          if (userSockets.size >= this.config.maxConnectionsPerUser) {
            return next(new Error('Maximum connections exceeded'));
          }
        }

        next();
      } catch (error) {
        this.logger.warn('WebSocket authentication failed', { error: (error as Error).message });
        next(new Error('Invalid token'));
      }
    });

    // Rate limiting middleware
    this.io.use((socket: Socket, next) => {
      const socketId = socket.id;
      
      if (!this.checkRateLimit(socketId)) {
        return next(new Error('Rate limit exceeded'));
      }

      next();
    });
  }

  private extractToken(socket: Socket): string | null {
    // Try multiple sources for the token
    const authHeader = socket.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    const token = socket.handshake.auth?.token;
    if (token) return token;

    const queryToken = socket.handshake.query?.token as string;
    if (queryToken) return queryToken;

    return null;
  }

  private checkRateLimit(socketId: string): boolean {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    let timestamps = this.socketRateLimits.get(socketId) || [];
    timestamps = timestamps.filter(t => t > windowStart);
    
    if (timestamps.length >= this.config.rateLimitPerMinute) {
      return false;
    }
    
    timestamps.push(now);
    this.socketRateLimits.set(socketId, timestamps);
    return true;
  }

  // ==================== Connection Handlers ====================

  private setupConnectionHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      const authSocket = socket as AuthenticatedSocket;
      
      this.handleConnection(authSocket);

      // Subscribe to events
      socket.on('subscribe', (data: SubscriptionRequest, callback) => {
        this.handleSubscribe(authSocket, data, callback);
      });

      // Unsubscribe from events
      socket.on('unsubscribe', (eventTypes: PaymentEventType[], callback) => {
        this.handleUnsubscribe(authSocket, eventTypes, callback);
      });

      // Join tenant room
      socket.on('join-tenant', (tenantId: string, callback) => {
        this.handleJoinTenant(authSocket, tenantId, callback);
      });

      // Leave tenant room
      socket.on('leave-tenant', (tenantId: string, callback) => {
        this.handleLeaveTenant(authSocket, tenantId, callback);
      });

      // Ping/pong for connection health
      socket.on('ping', (callback) => {
        if (callback) callback({ timestamp: new Date().toISOString() });
      });

      // Disconnect handler
      socket.on('disconnect', (reason) => {
        this.handleDisconnect(authSocket, reason);
      });

      // Error handler
      socket.on('error', (error) => {
        this.handleError(authSocket, error);
      });
    });
  }

  private handleConnection(socket: AuthenticatedSocket): void {
    this.metrics.totalConnections++;
    
    if (socket.isAuthenticated) {
      this.metrics.authenticatedConnections++;
      
      // Track user connections
      if (socket.userId) {
        const userSockets = this.userSocketMap.get(socket.userId) || new Set();
        userSockets.add(socket.id);
        this.userSocketMap.set(socket.userId, userSockets);
        
        this.metrics.connectionsByUser.set(
          socket.userId,
          (this.metrics.connectionsByUser.get(socket.userId) || 0) + 1
        );

        // Join user-specific room
        socket.join(`user:${socket.userId}`);
      }

      // Track tenant connections
      if (socket.tenantId) {
        const tenantSockets = this.tenantSocketMap.get(socket.tenantId) || new Set();
        tenantSockets.add(socket.id);
        this.tenantSocketMap.set(socket.tenantId, tenantSockets);
        
        this.metrics.connectionsByTenant.set(
          socket.tenantId,
          (this.metrics.connectionsByTenant.get(socket.tenantId) || 0) + 1
        );

        // Join tenant room
        socket.join(`tenant:${socket.tenantId}`);
      }

      // Send connection acknowledgment
      socket.emit('connection.established', {
        socketId: socket.id,
        userId: socket.userId,
        tenantId: socket.tenantId,
        timestamp: new Date().toISOString(),
      });

      this.logger.info('🔌 Client connected', {
        socketId: socket.id,
        userId: socket.userId,
        tenantId: socket.tenantId,
      });
    }
  }

  private handleSubscribe(
    socket: AuthenticatedSocket,
    request: SubscriptionRequest,
    callback?: (response: { success: boolean; error?: string }) => void
  ): void {
    try {
      const { eventTypes, filters } = request;
      
      eventTypes.forEach(eventType => {
        // Create room name based on event type and filters
        const roomName = this.buildRoomName(eventType, filters);
        socket.join(roomName);
      });

      this.metrics.messagesReceived++;
      
      this.logger.debug('📡 Subscribed to events', {
        socketId: socket.id,
        eventTypes,
        filters,
      });

      if (callback) {
        callback({ success: true });
      }
    } catch (error) {
      this.logger.error('Subscribe error', { error: (error as Error).message });
      if (callback) {
        callback({ success: false, error: (error as Error).message });
      }
    }
  }

  private handleUnsubscribe(
    socket: AuthenticatedSocket,
    eventTypes: PaymentEventType[],
    callback?: (response: { success: boolean }) => void
  ): void {
    eventTypes.forEach(eventType => {
      const rooms = Array.from(socket.rooms);
      rooms.forEach(room => {
        if (room.startsWith(`event:${eventType}`)) {
          socket.leave(room);
        }
      });
    });

    this.metrics.messagesReceived++;

    if (callback) {
      callback({ success: true });
    }
  }

  private handleJoinTenant(
    socket: AuthenticatedSocket,
    tenantId: string,
    callback?: (response: { success: boolean; error?: string }) => void
  ): void {
    // Verify user has access to this tenant
    if (socket.tenantId !== tenantId && !socket.roles?.includes('admin')) {
      if (callback) {
        callback({ success: false, error: 'Access denied' });
      }
      return;
    }

    socket.join(`tenant:${tenantId}`);
    
    this.logger.debug('Joined tenant room', {
      socketId: socket.id,
      tenantId,
    });

    if (callback) {
      callback({ success: true });
    }
  }

  private handleLeaveTenant(
    socket: AuthenticatedSocket,
    tenantId: string,
    callback?: (response: { success: boolean }) => void
  ): void {
    socket.leave(`tenant:${tenantId}`);

    if (callback) {
      callback({ success: true });
    }
  }

  private handleDisconnect(socket: AuthenticatedSocket, reason: string): void {
    this.metrics.totalConnections--;

    if (socket.isAuthenticated) {
      this.metrics.authenticatedConnections--;

      if (socket.userId) {
        const userSockets = this.userSocketMap.get(socket.userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            this.userSocketMap.delete(socket.userId);
          }
        }

        const currentCount = this.metrics.connectionsByUser.get(socket.userId) || 0;
        if (currentCount > 0) {
          this.metrics.connectionsByUser.set(socket.userId, currentCount - 1);
        }
      }

      if (socket.tenantId) {
        const tenantSockets = this.tenantSocketMap.get(socket.tenantId);
        if (tenantSockets) {
          tenantSockets.delete(socket.id);
          if (tenantSockets.size === 0) {
            this.tenantSocketMap.delete(socket.tenantId);
          }
        }

        const currentCount = this.metrics.connectionsByTenant.get(socket.tenantId) || 0;
        if (currentCount > 0) {
          this.metrics.connectionsByTenant.set(socket.tenantId, currentCount - 1);
        }
      }
    }

    // Clean up rate limit tracking
    this.socketRateLimits.delete(socket.id);

    this.logger.info('🔌 Client disconnected', {
      socketId: socket.id,
      userId: socket.userId,
      reason,
    });
  }

  private handleError(socket: AuthenticatedSocket, error: Error): void {
    this.metrics.errors++;
    this.logger.error('WebSocket error', {
      socketId: socket.id,
      userId: socket.userId,
      error: error.message,
    });
  }

  // ==================== Broadcasting Methods ====================

  /**
   * Broadcast payment event to relevant rooms
   */
  broadcastPaymentEvent(event: PaymentEventData): void {
    const eventType = event.eventType;
    const transaction = event.transaction;
    const tenantId = event.metadata?.tenantId as string;
    const userId = event.metadata?.userId as string;

    const payload: WebSocketEvent = {
      type: eventType,
      payload: {
        transaction,
        provider: event.provider,
        rawPayload: event.rawPayload,
        processedAt: event.processedAt,
      },
      timestamp: new Date(),
      tenantId,
      userId,
    };

    // Broadcast to event-specific room
    this.io.to(`event:${eventType}`).emit(eventType, payload);

    // Broadcast to tenant room if specified
    if (tenantId) {
      this.io.to(`tenant:${tenantId}`).emit(eventType, payload);
    }

    // Broadcast to user room if specified
    if (userId) {
      this.io.to(`user:${userId}`).emit(eventType, payload);
    }

    // Broadcast to provider-specific room
    this.io.to(`provider:${event.provider}`).emit(eventType, payload);

    this.metrics.messagesSent++;

    this.logger.debug('📡 Broadcasted payment event', {
      eventType,
      tenantId,
      userId,
      provider: event.provider,
    });
  }

  /**
   * Send event to specific user
   */
  sendToUser(userId: string, eventType: string, payload: unknown): void {
    this.io.to(`user:${userId}`).emit(eventType, {
      type: eventType,
      payload,
      timestamp: new Date(),
      userId,
    });
    this.metrics.messagesSent++;
  }

  /**
   * Send event to specific tenant
   */
  sendToTenant(tenantId: string, eventType: string, payload: unknown): void {
    this.io.to(`tenant:${tenantId}`).emit(eventType, {
      type: eventType,
      payload,
      timestamp: new Date(),
      tenantId,
    });
    this.metrics.messagesSent++;
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(eventType: string, payload: unknown): void {
    this.io.emit(eventType, {
      type: eventType,
      payload,
      timestamp: new Date(),
    });
    this.metrics.messagesSent += this.metrics.totalConnections;
  }

  // ==================== Utility Methods ====================

  private buildRoomName(eventType: string, filters?: SubscriptionRequest['filters']): string {
    if (!filters) {
      return `event:${eventType}`;
    }

    const parts: string[] = [eventType];
    
    if (filters.providers?.length) {
      parts.push(`providers:${filters.providers.join(',')}`);
    }
    if (filters.currencies?.length) {
      parts.push(`currencies:${filters.currencies.join(',')}`);
    }
    if (filters.countries?.length) {
      parts.push(`countries:${filters.countries.join(',')}`);
    }
    if (filters.minAmount !== undefined) {
      parts.push(`min:${filters.minAmount}`);
    }
    if (filters.maxAmount !== undefined) {
      parts.push(`max:${filters.maxAmount}`);
    }

    return `event:${parts.join(':')}`;
  }

  private startMetricsReporting(): void {
    setInterval(() => {
      this.logger.info('📊 WebSocket Metrics', {
        totalConnections: this.metrics.totalConnections,
        authenticatedConnections: this.metrics.authenticatedConnections,
        messagesSent: this.metrics.messagesSent,
        messagesReceived: this.metrics.messagesReceived,
        errors: this.metrics.errors,
        uniqueUsers: this.userSocketMap.size,
        uniqueTenants: this.tenantSocketMap.size,
      });
    }, 60000); // Report every minute
  }

  // ==================== Public API ====================

  /**
   * Get current metrics
   */
  getMetrics(): Readonly<ConnectionMetrics> {
    return { ...this.metrics };
  }

  /**
   * Get connected socket count
   */
  getConnectionCount(): number {
    return this.metrics.totalConnections;
  }

  /**
   * Get sockets for a specific user
   */
  getUserSockets(userId: string): string[] {
    return Array.from(this.userSocketMap.get(userId) || []);
  }

  /**
   * Get sockets for a specific tenant
   */
  getTenantSockets(tenantId: string): string[] {
    return Array.from(this.tenantSocketMap.get(tenantId) || []);
  }

  /**
   * Disconnect all sockets for a user
   */
  disconnectUser(userId: string, reason?: string): void {
    const socketIds = this.userSocketMap.get(userId);
    if (socketIds) {
      socketIds.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      });
    }
    
    this.logger.info('👤 User disconnected', { userId, reason });
  }

  /**
   * Disconnect all sockets for a tenant
   */
  disconnectTenant(tenantId: string, reason?: string): void {
    const socketIds = this.tenantSocketMap.get(tenantId);
    if (socketIds) {
      socketIds.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      });
    }
    
    this.logger.info('🏢 Tenant disconnected', { tenantId, reason });
  }

  /**
   * Close the WebSocket server
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.io.close(() => {
        this.logger.info('🔌 WebSocket server closed');
        resolve();
      });
    });
  }
}

// ==================== Singleton Instance ====================

let globalWebSocketServer: PaymentWebSocketServer | null = null;

export function initializeWebSocketServer(
  server: HttpServer | HttpsServer,
  config: WebSocketConfig,
  logger?: ILogger
): PaymentWebSocketServer {
  globalWebSocketServer = new PaymentWebSocketServer(server, config, logger);
  return globalWebSocketServer;
}

export function getWebSocketServer(): PaymentWebSocketServer | null {
  return globalWebSocketServer;
}

export function setWebSocketServer(server: PaymentWebSocketServer): void {
  globalWebSocketServer = server;
}
