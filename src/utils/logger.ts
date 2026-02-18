/**
 * Logger Utility
 * Re-exports from structured-logger for backwards compatibility
 */

export { StructuredLogger, getGlobalLogger, setGlobalLogger } from './structured-logger.js';
export type { LogContext, StructuredLoggerOptions } from './structured-logger.js';

/**
 * Legacy Logger class for backwards compatibility with tests
 * Uses console.error for all log levels to ensure tests pass
 */
export class Logger {
  constructor(private level: string = 'info') {}

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  debug(message: string): void {
    if (this.shouldLog('debug')) {
      console.error(`[DEBUG] ${new Date().toISOString()} - ${message}`);
    }
  }

  info(message: string): void {
    if (this.shouldLog('info')) {
      console.error(`[INFO] ${new Date().toISOString()} - ${message}`);
    }
  }

  warn(message: string): void {
    if (this.shouldLog('warn')) {
      console.error(`[WARN] ${new Date().toISOString()} - ${message}`);
    }
  }

  error(message: string): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${new Date().toISOString()} - ${message}`);
    }
  }
}
