/**
 * Visual Retry Indicator
 * Progress bars and visual feedback for retry attempts
 */

import { Logger } from './logger.js';

export interface RetryIndicatorConfig {
  showProgressBar?: boolean;
  showSpinner?: boolean;
  useColors?: boolean;
}

export class RetryIndicator {
  private config: RetryIndicatorConfig;
  private currentAttempt: number = 0;
  private maxRetries: number = 0;
  private operation: string = '';

  constructor(config: RetryIndicatorConfig = {}) {
    this.config = {
      showProgressBar: config.showProgressBar ?? true,
      showSpinner: config.showSpinner ?? false,
      useColors: config.useColors ?? true,
    };
  }

  /**
   * Start tracking a retry operation
   */
  start(operation: string, maxRetries: number): void {
    this.operation = operation;
    this.maxRetries = maxRetries;
    this.currentAttempt = 0;
  }

  /**
   * Update progress for the next attempt
   */
  nextAttempt(error?: Error): void {
    this.currentAttempt++;
    
    if (this.config.showProgressBar) {
      const progressBar = this.renderProgressBar();
      const message = this.renderMessage(error);
      process.stderr.write(`\r${progressBar} ${message}`);
    }
  }

  /**
   * Mark the operation as successful
   */
  success(): void {
    if (this.config.showProgressBar) {
      const successMessage = this.config.useColors 
        ? `\r✓ ${this.operation} successful after ${this.currentAttempt} attempt(s)${' '.repeat(30)}\n`
        : `\r[SUCCESS] ${this.operation} completed after ${this.currentAttempt} attempt(s)\n`;
      process.stderr.write(successMessage);
    }
    this.reset();
  }

  /**
   * Mark the operation as failed after all retries
   */
  failure(finalError: Error): void {
    if (this.config.showProgressBar) {
      const failMessage = this.config.useColors
        ? `\r✗ ${this.operation} failed after ${this.maxRetries} retries: ${finalError.message}${' '.repeat(20)}\n`
        : `\r[FAILED] ${this.operation} failed after ${this.maxRetries} retries: ${finalError.message}\n`;
      process.stderr.write(failMessage);
    }
    this.reset();
  }

  /**
   * Render a progress bar
   */
  private renderProgressBar(): string {
    const width = 20;
    const filled = Math.round((this.currentAttempt / this.maxRetries) * width);
    const empty = width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    if (this.config.useColors) {
      // Use different colors based on attempt number
      if (this.currentAttempt === 1) {
        return `\x1b[33m[${bar}]\x1b[0m`; // Yellow for first attempt
      } else if (this.currentAttempt >= this.maxRetries) {
        return `\x1b[31m[${bar}]\x1b[0m`; // Red for last attempt
      } else {
        return `\x1b[36m[${bar}]\x1b[0m`; // Cyan for intermediate
      }
    }
    
    return `[${bar}]`;
  }

  /**
   * Render the retry message
   */
  private renderMessage(error?: Error): string {
    const attemptStr = `Retrying ${this.currentAttempt}/${this.maxRetries}`;
    
    if (error && this.config.useColors) {
      return `${attemptStr} (${this.colorizeError(error.message)})`;
    }
    
    return attemptStr;
  }

  /**
   * Colorize error message (truncate if too long)
   */
  private colorizeError(message: string): string {
    const maxLen = 30;
    let truncated = message;
    
    if (message.length > maxLen) {
      truncated = message.substring(0, maxLen - 3) + '...';
    }
    
    return this.config.useColors ? `\x1b[90m${truncated}\x1b[0m` : truncated;
  }

  /**
   * Reset the indicator state
   */
  private reset(): void {
    this.currentAttempt = 0;
    this.maxRetries = 0;
    this.operation = '';
  }

  /**
   * Create a spinner character for the current attempt
   */
  private getSpinner(): string {
    const spinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    return spinners[this.currentAttempt % spinners.length];
  }

  /**
   * Format a retry attempt for logging
   */
  static formatRetryAttempt(attempt: number, maxRetries: number, error?: Error): string {
    const progress = `[${attempt}/${maxRetries}]`;
    const bar = RetryIndicator.renderAsciiProgress(attempt, maxRetries);
    
    let message = `${bar} Retrying ${progress}`;
    
    if (error) {
      message += ` - ${error.message}`;
    }
    
    return message;
  }

  /**
   * Render ASCII progress bar (static version)
   */
  static renderAsciiProgress(current: number, total: number, width: number = 15): string {
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    return '[' + '='.repeat(filled) + '>'.repeat(filled > 0 ? 0 : 0) + ' '.repeat(empty) + ']';
  }

  /**
   * Format success message
   */
  static formatSuccess(operation: string, attempts: number): string {
    return `✓ ${operation} succeeded after ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}`;
  }

  /**
   * Format failure message
   */
  static formatFailure(operation: string, maxRetries: number, error: Error): string {
    return `✗ ${operation} failed after ${maxRetries} retries: ${error.message}`;
  }
}

/**
 * Retry with visual indicator wrapper
 */
export async function withRetryIndicator<T>(
  operation: string,
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    shouldRetry?: (error: Error) => boolean;
    logger?: Logger;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const delayMs = options.delayMs ?? 1000;
  const shouldRetry = options.shouldRetry ?? (() => true);
  const logger = options.logger;
  
  const indicator = new RetryIndicator();
  indicator.start(operation, maxRetries);
  
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        indicator.nextAttempt(lastError);
        logger?.warn(RetryIndicator.formatRetryAttempt(attempt - 1, maxRetries, lastError));
      }
      
      const result = await fn();
      indicator.success();
      logger?.info(RetryIndicator.formatSuccess(operation, attempt));
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries || !shouldRetry(lastError)) {
        indicator.failure(lastError);
        logger?.error(RetryIndicator.formatFailure(operation, maxRetries, lastError));
        throw lastError;
      }
      
      // Wait before retrying
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt)); // Exponential backoff
      }
    }
  }
  
  throw lastError;
}
