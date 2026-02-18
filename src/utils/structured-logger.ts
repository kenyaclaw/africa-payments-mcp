/**
 * Structured Logger with Correlation IDs and JSON format support
 */

import winston from 'winston';

export interface LogContext {
  correlationId?: string;
  requestId?: string;
  provider?: string;
  operation?: string;
  transactionId?: string;
  [key: string]: any;
}

export interface StructuredLoggerOptions {
  level?: string;
  format?: 'json' | 'text';
  service?: string;
  version?: string;
  defaultMeta?: Record<string, any>;
}

export class StructuredLogger {
  private logger: winston.Logger;
  private correlationId: string | undefined;

  constructor(options: StructuredLoggerOptions = {}) {
    const level = options.level || process.env.LOG_LEVEL || 'info';
    const format = options.format || (process.env.LOG_FORMAT === 'json' ? 'json' : 'text');
    const service = options.service || 'africa-payments-mcp';
    const version = options.version || '0.1.0';

    const formats: winston.Logform.Format[] = [
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
    ];

    if (format === 'json') {
      formats.push(
        winston.format.json({
          space: process.env.NODE_ENV === 'development' ? 2 : undefined,
        })
      );
    } else {
      formats.push(
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const ctx = meta.context ? `[${Object.entries(meta.context)
            .filter(([k]) => !['timestamp', 'service', 'version'].includes(k))
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}]` : '';
          const metaStr = Object.keys(meta).length > 0 && !meta.context 
            ? ` ${JSON.stringify(meta)}` 
            : '';
          return `${timestamp} [${level.toUpperCase()}]${ctx ? ` ${ctx}` : ''}: ${message}${metaStr}`;
        })
      );
    }

    this.logger = winston.createLogger({
      level,
      defaultMeta: {
        service,
        version,
        environment: process.env.NODE_ENV || 'production',
        ...options.defaultMeta,
      },
      format: winston.format.combine(...formats),
      transports: [
        new winston.transports.Console({
          stderrLevels: ['error', 'warn', 'info', 'debug'],
        }),
      ],
    });
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): StructuredLogger {
    const childLogger = new StructuredLogger({
      level: this.logger.level,
      format: this.getFormat(),
    });
    childLogger.logger = this.logger.child({ context });
    childLogger.correlationId = context.correlationId || this.correlationId;
    return childLogger;
  }

  /**
   * Set correlation ID for the current context
   */
  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId(): string | undefined {
    return this.correlationId;
  }

  /**
   * Generate a new correlation ID
   */
  static generateCorrelationId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private getFormat(): 'json' | 'text' {
    // Check if the logger is using JSON format
    const formatters = (this.logger.format as any)?.options?.format || [];
    return formatters.some((f: any) => f && f.name === 'json') ? 'json' : 'text';
  }

  private log(level: string, message: string, meta: Record<string, any> = {}): void {
    const logData: Record<string, any> = {
      message,
      ...meta,
    };

    if (this.correlationId && !meta.correlationId) {
      logData.correlationId = this.correlationId;
    }

    this.logger.log(level, message, logData);
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, any>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.log('warn', message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, any>): void {
    const errorMeta: Record<string, any> = { ...meta };
    
    if (error) {
      errorMeta.error = {
        message: error.message,
        name: error.name,
        stack: error.stack,
      };
    }
    
    this.log('error', message, errorMeta);
  }

  /**
   * Log HTTP request
   */
  logRequest(req: {
    method: string;
    url: string;
    headers?: Record<string, any>;
    body?: any;
    ip?: string;
  }, context?: LogContext): void {
    this.info('HTTP Request', {
      http: {
        method: req.method,
        url: req.url,
        requestId: context?.requestId,
        correlationId: context?.correlationId,
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
      },
      ...context,
    });
  }

  /**
   * Log HTTP response
   */
  logResponse(res: {
    statusCode: number;
    duration: number;
    body?: any;
  }, context?: LogContext): void {
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    this.log(level, 'HTTP Response', {
      http: {
        statusCode: res.statusCode,
        duration: res.duration,
        requestId: context?.requestId,
        correlationId: context?.correlationId,
      },
      ...context,
    });
  }

  /**
   * Log provider operation
   */
  logProviderOperation(
    provider: string,
    operation: string,
    params: {
      success: boolean;
      duration: number;
      transactionId?: string;
      error?: Error;
      metadata?: Record<string, any>;
    }
  ): void {
    const { success, duration, transactionId, error, metadata } = params;
    const level = success ? 'info' : 'error';
    
    this.log(level, `Provider ${operation}`, {
      provider,
      operation,
      success,
      duration,
      transactionId,
      error: error ? {
        message: error.message,
        name: error.name,
        code: (error as any).code,
      } : undefined,
      ...metadata,
    });
  }
}

// Create a global logger instance
let globalLogger: StructuredLogger | null = null;

export function getGlobalLogger(options?: StructuredLoggerOptions): StructuredLogger {
  if (!globalLogger) {
    globalLogger = new StructuredLogger(options);
  }
  return globalLogger;
}

export function setGlobalLogger(logger: StructuredLogger): void {
  globalLogger = logger;
}

// Keep backwards compatibility with the old Logger class
export class Logger {
  private structuredLogger: StructuredLogger;

  constructor(level: string = 'info') {
    this.structuredLogger = new StructuredLogger({
      level,
      format: process.env.LOG_FORMAT === 'json' ? 'json' : 'text',
    });
  }

  debug(message: string): void {
    this.structuredLogger.debug(message);
  }

  info(message: string): void {
    this.structuredLogger.info(message);
  }

  warn(message: string): void {
    this.structuredLogger.warn(message);
  }

  error(message: string): void {
    this.structuredLogger.error(message);
  }

  static generateCorrelationId(): string {
    return StructuredLogger.generateCorrelationId();
  }
}
