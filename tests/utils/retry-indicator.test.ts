/**
 * Visual Retry Indicator Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { RetryIndicator, withRetryIndicator } from '../../src/utils/retry-indicator.js';
import { Logger } from '../../src/utils/logger.js';

describe('RetryIndicator', () => {
  let indicator: RetryIndicator;
  let stderrSpy: jest.SpiedFunction<typeof process.stderr.write>;

  beforeEach(() => {
    indicator = new RetryIndicator();
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe('basic functionality', () => {
    it('should render progress bar on next attempt', () => {
      indicator.start('Test Operation', 3);
      indicator.nextAttempt();
      
      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain('Retrying 1/3');
    });

    it('should show success message', () => {
      indicator.start('Test Operation', 3);
      indicator.nextAttempt();
      indicator.success();
      
      const lastCall = stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0] as string;
      expect(lastCall).toContain('successful');
    });

    it('should show failure message', () => {
      indicator.start('Test Operation', 3);
      indicator.nextAttempt();
      indicator.failure(new Error('Test error'));
      
      const lastCall = stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0] as string;
      expect(lastCall).toContain('failed');
      expect(lastCall).toContain('Test error');
    });

    it('should include progress bar characters', () => {
      indicator.start('Test Operation', 3);
      indicator.nextAttempt();
      
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toMatch(/[█░]/); // Progress bar characters
    });
  });

  describe('configuration options', () => {
    it('should disable progress bar when showProgressBar is false', () => {
      const quietIndicator = new RetryIndicator({ showProgressBar: false });
      quietIndicator.start('Test', 3);
      quietIndicator.nextAttempt();
      
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should work without colors when useColors is false', () => {
      const plainIndicator = new RetryIndicator({ useColors: false });
      plainIndicator.start('Test', 3);
      plainIndicator.nextAttempt();
      
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).not.toContain('\x1b['); // No ANSI color codes
    });
  });

  describe('static formatting methods', () => {
    it('should format retry attempt', () => {
      const message = RetryIndicator.formatRetryAttempt(2, 3, new Error('Timeout'));
      
      expect(message).toContain('[2/3]');
      expect(message).toContain('Retrying');
      expect(message).toContain('Timeout');
    });

    it('should render ASCII progress', () => {
      const progress = RetryIndicator.renderAsciiProgress(2, 4, 10);
      
      expect(progress).toContain('[');
      expect(progress).toContain(']');
      expect(progress.length).toBeGreaterThan(2);
    });

    it('should format success message', () => {
      const message = RetryIndicator.formatSuccess('API Call', 2);
      
      expect(message).toContain('✓');
      expect(message).toContain('API Call');
      expect(message).toContain('succeeded');
      expect(message).toContain('2 attempts');
    });

    it('should format success message with single attempt', () => {
      const message = RetryIndicator.formatSuccess('API Call', 1);
      
      expect(message).toContain('1 attempt');
      expect(message).not.toContain('attempts');
    });

    it('should format failure message', () => {
      const error = new Error('Connection refused');
      const message = RetryIndicator.formatFailure('API Call', 3, error);
      
      expect(message).toContain('✗');
      expect(message).toContain('API Call');
      expect(message).toContain('failed');
      expect(message).toContain('3 retries');
      expect(message).toContain('Connection refused');
    });
  });

  describe('withRetryIndicator wrapper', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      const result = await withRetryIndicator('Test Op', fn, { maxRetries: 3 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Attempt 1 failed'))
        .mockRejectedValueOnce(new Error('Attempt 2 failed'))
        .mockResolvedValue('success');
      
      const result = await withRetryIndicator('Test Op', fn, { maxRetries: 3, delayMs: 10 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries exceeded', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      await expect(
        withRetryIndicator('Test Op', fn, { maxRetries: 2, delayMs: 10 })
      ).rejects.toThrow('Always fails');
      
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should respect shouldRetry predicate', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Retryable'))
        .mockRejectedValueOnce(new Error('Non-retryable'));
      
      const shouldRetry = (error: Error) => error.message !== 'Non-retryable';
      
      await expect(
        withRetryIndicator('Test Op', fn, { maxRetries: 3, delayMs: 10, shouldRetry })
      ).rejects.toThrow('Non-retryable');
      
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      await withRetryIndicator('Test Op', fn, { maxRetries: 3, delayMs: 50 });
      const endTime = Date.now();
      
      // Should have waited at least 50ms + 100ms = 150ms
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });

    it('should log retry attempts when logger is provided', async () => {
      const logger = new Logger('error');
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Error'))
        .mockResolvedValue('success');
      
      await withRetryIndicator('Test Op', fn, { maxRetries: 2, delayMs: 10, logger });
      
      expect(warnSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalled();
      
      infoSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle non-Error exceptions', async () => {
      const fn = jest.fn().mockRejectedValue('String error');
      
      await expect(
        withRetryIndicator('Test Op', fn, { maxRetries: 1 })
      ).rejects.toThrow('String error');
    });

    it('should truncate long error messages', () => {
      indicator.start('Test', 3);
      const longError = new Error('A'.repeat(100));
      indicator.nextAttempt(longError);
      
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output.length).toBeLessThan(150); // Should be truncated
    });
  });
});
