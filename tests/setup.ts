/**
 * Jest Test Setup
 * 
 * Global test configuration and mocks
 */

import { jest, beforeAll, afterAll, afterEach } from '@jest/globals';

// Mock axios globally
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    })),
  },
}));

// Mock console methods to reduce noise during tests
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress non-error console output during tests
  console.log = jest.fn() as any;
  console.info = jest.fn() as any;
  console.warn = jest.fn() as any;
  // Keep console.error for debugging
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.info = originalConsoleInfo;
  console.warn = originalConsoleWarn;
});

// Reset all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});
