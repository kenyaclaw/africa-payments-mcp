/**
 * Logger Tests
 * 
 * Test suite for the Logger utility.
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { Logger } from '../../src/utils/logger.js';

describe('Logger', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('log levels', () => {
    it('should log debug messages when level is debug', () => {
      const logger = new Logger('debug');
      logger.debug('Test debug message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test debug message')
      );
    });

    it('should not log debug messages when level is info', () => {
      const logger = new Logger('info');
      logger.debug('Test debug message');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log info messages when level is info', () => {
      const logger = new Logger('info');
      logger.info('Test info message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]')
      );
    });

    it('should log info messages when level is debug', () => {
      const logger = new Logger('debug');
      logger.info('Test info message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]')
      );
    });

    it('should not log info messages when level is warn', () => {
      const logger = new Logger('warn');
      logger.info('Test info message');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log warn messages when level is warn', () => {
      const logger = new Logger('warn');
      logger.warn('Test warn message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]')
      );
    });

    it('should log warn messages when level is info', () => {
      const logger = new Logger('info');
      logger.warn('Test warn message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]')
      );
    });

    it('should log error messages at all levels', () => {
      const levels: Array<'debug' | 'info' | 'warn' | 'error'> = [
        'debug', 'info', 'warn', 'error'
      ];

      for (const level of levels) {
        consoleErrorSpy.mockClear();
        const logger = new Logger(level);
        logger.error('Test error message');

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[ERROR]')
        );
      }
    });
  });

  describe('timestamp', () => {
    it('should include ISO timestamp in logs', () => {
      const logger = new Logger('debug');
      logger.info('Test message');

      const callArg = consoleErrorSpy.mock.calls[0][0];
      expect(callArg).toMatch(
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/
      );
    });
  });

  describe('default level', () => {
    it('should default to info level', () => {
      const logger = new Logger();
      logger.info('Test message');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
