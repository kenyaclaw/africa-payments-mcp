/**
 * Config Manager Tests
 * 
 * Test suite for the ConfigManager utility.
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { ConfigManager } from '../../src/utils/config.js';
import fs from 'fs/promises';

// Mock fs/promises
jest.mock('fs/promises');

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let readFileMock: jest.SpiedFunction<typeof fs.readFile>;

  beforeEach(() => {
    configManager = new ConfigManager();
    readFileMock = jest.spyOn(fs, 'readFile');
  });

  afterEach(() => {
    readFileMock.mockRestore();
  });

  describe('load', () => {
    it('should load and parse valid config file', async () => {
      const mockConfig = {
        providers: {
          mpesa: {
            enabled: true,
            environment: 'sandbox',
            consumerKey: 'test_key',
            consumerSecret: 'test_secret',
            passkey: 'test_passkey',
            shortCode: '123456',
          },
        },
        defaults: {
          currency: 'KES',
          country: 'KE',
        },
        server: {
          port: 3000,
          logLevel: 'info',
        },
      };

      readFileMock.mockResolvedValue(JSON.stringify(mockConfig));

      const config = await configManager.load('/path/to/config.json');

      expect(config).toEqual(mockConfig);
      expect(readFileMock).toHaveBeenCalledWith('/path/to/config.json', 'utf-8');
    });

    it('should set default defaults when missing', async () => {
      const mockConfig = {
        providers: {},
      };

      readFileMock.mockResolvedValue(JSON.stringify(mockConfig));

      const config = await configManager.load('/path/to/config.json');

      expect(config.defaults).toEqual({
        currency: 'KES',
        country: 'KE',
      });
    });

    it('should set default server config when missing', async () => {
      const mockConfig = {
        providers: {},
        defaults: {},
      };

      readFileMock.mockResolvedValue(JSON.stringify(mockConfig));

      const config = await configManager.load('/path/to/config.json');

      expect(config.server).toEqual({
        logLevel: 'info',
      });
    });

    it('should throw error when providers section is missing', async () => {
      const mockConfig = {
        defaults: {},
      };

      readFileMock.mockResolvedValue(JSON.stringify(mockConfig));

      await expect(configManager.load('/path/to/config.json')).rejects.toThrow(
        'providers'
      );
    });

    it('should throw error for invalid JSON', async () => {
      readFileMock.mockResolvedValue('invalid json');

      await expect(configManager.load('/path/to/config.json')).rejects.toThrow();
    });

    it('should throw error when file cannot be read', async () => {
      readFileMock.mockRejectedValue(new Error('File not found'));

      await expect(configManager.load('/path/to/config.json')).rejects.toThrow(
        'File not found'
      );
    });
  });

  describe('configuration structure', () => {
    it('should preserve all provider configurations', async () => {
      const mockConfig = {
        providers: {
          mpesa: {
            enabled: true,
            environment: 'sandbox',
            consumerKey: 'mpesa_key',
            consumerSecret: 'mpesa_secret',
            passkey: 'passkey',
            shortCode: '123456',
          },
          paystack: {
            enabled: true,
            environment: 'sandbox',
            secretKey: 'paystack_key',
          },
        },
        defaults: {
          currency: 'KES',
          country: 'KE',
        },
        server: {
          port: 3000,
          logLevel: 'debug',
        },
      };

      readFileMock.mockResolvedValue(JSON.stringify(mockConfig));

      const config = await configManager.load('/path/to/config.json');

      expect(config.providers.mpesa).toBeDefined();
      expect(config.providers.paystack).toBeDefined();
      expect(config.providers.mpesa.consumerKey).toBe('mpesa_key');
      expect(config.providers.paystack.secretKey).toBe('paystack_key');
    });
  });
});
