/**
 * Idempotency and Request Deduplication Module
 * Prevents double charges and duplicate transactions
 */

import { EventEmitter } from 'events';

export interface IdempotencyEntry {
  key: string;
  request: {
    method: string;
    params: any;
    timestamp: Date;
  };
  response: {
    status: 'success' | 'error' | 'pending';
    data: any;
    timestamp: Date;
  };
  expiresAt: Date;
}

export interface IdempotencyConfig {
  /** Default TTL in milliseconds for cache entries */
  defaultTtlMs: number;
  /** Maximum number of entries to store */
  maxEntries: number;
  /** Maximum size of stored response data (in bytes) */
  maxResponseSize: number;
}

export interface IdempotencyResult {
  /** Whether this is a duplicate request */
  isDuplicate: boolean;
  /** The stored response (if duplicate) */
  response?: any;
  /** The stored entry (if duplicate) */
  entry?: IdempotencyEntry;
}

const DEFAULT_CONFIG: IdempotencyConfig = {
  defaultTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  maxEntries: 10000,
  maxResponseSize: 1024 * 1024, // 1MB
};

export class IdempotencyStore extends EventEmitter {
  private entries = new Map<string, IdempotencyEntry>();
  private config: IdempotencyConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<IdempotencyConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupInterval();
  }

  /**
   * Check if a key exists and return the stored response
   */
  check(key: string): IdempotencyResult {
    const entry = this.entries.get(key);
    
    if (!entry) {
      return { isDuplicate: false };
    }

    // Check if entry has expired
    if (new Date() > entry.expiresAt) {
      this.entries.delete(key);
      this.emit('expired', { key, entry });
      return { isDuplicate: false };
    }

    return {
      isDuplicate: true,
      response: entry.response.data,
      entry,
    };
  }

  /**
   * Store a request and response
   */
  store(
    key: string,
    request: { method: string; params: any },
    response: { status: 'success' | 'error' | 'pending'; data: any },
    ttlMs?: number
  ): void {
    // Evict oldest entries if at capacity
    if (this.entries.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    // Validate response size
    const responseSize = JSON.stringify(response.data).length;
    if (responseSize > this.config.maxResponseSize) {
      this.emit('error', {
        key,
        error: 'Response too large to store',
        size: responseSize,
      });
      return;
    }

    const now = new Date();
    const entry: IdempotencyEntry = {
      key,
      request: {
        ...request,
        timestamp: now,
      },
      response: {
        ...response,
        timestamp: now,
      },
      expiresAt: new Date(now.getTime() + (ttlMs || this.config.defaultTtlMs)),
    };

    this.entries.set(key, entry);
    this.emit('stored', { key, entry });
  }

  /**
   * Update an existing entry (e.g., when a pending transaction completes)
   */
  update(
    key: string,
    response: { status: 'success' | 'error' | 'pending'; data: any }
  ): boolean {
    const entry = this.entries.get(key);
    
    if (!entry) {
      return false;
    }

    entry.response = {
      ...response,
      timestamp: new Date(),
    };

    this.entries.set(key, entry);
    this.emit('updated', { key, entry });
    return true;
  }

  /**
   * Delete an entry
   */
  delete(key: string): boolean {
    const existed = this.entries.delete(key);
    if (existed) {
      this.emit('deleted', { key });
    }
    return existed;
  }

  /**
   * Get all entries (for debugging/monitoring)
   */
  getAll(): IdempotencyEntry[] {
    this.cleanup(); // Remove expired entries first
    return Array.from(this.entries.values());
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalEntries: number;
    successCount: number;
    errorCount: number;
    pendingCount: number;
  } {
    this.cleanup();
    
    let successCount = 0;
    let errorCount = 0;
    let pendingCount = 0;

    for (const entry of this.entries.values()) {
      switch (entry.response.status) {
        case 'success':
          successCount++;
          break;
        case 'error':
          errorCount++;
          break;
        case 'pending':
          pendingCount++;
          break;
      }
    }

    return {
      totalEntries: this.entries.size,
      successCount,
      errorCount,
      pendingCount,
    };
  }

  /**
   * Clear all entries
   */
  clear(): void {
    const count = this.entries.size;
    this.entries.clear();
    this.emit('cleared', { count });
  }

  /**
   * Generate a consistent idempotency key from request parameters
   */
  static generateKey(params: {
    provider: string;
    operation: string;
    amount: number;
    currency: string;
    recipient?: string;
    customer?: string;
    metadata?: Record<string, any>;
  }): string {
    const keyData = {
      provider: params.provider,
      operation: params.operation,
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      recipient: params.recipient,
      customer: params.customer,
      // Include a subset of metadata that identifies the transaction
      meta: params.metadata?.reference || params.metadata?.orderId || params.metadata?.invoiceId,
    };

    // Create a deterministic string representation
    const keyString = JSON.stringify(keyData, Object.keys(keyData).sort());
    
    // Use a simple hash for the key
    return `idemp_${hashString(keyString)}`;
  }

  /**
   * Dispose of the store and stop cleanup interval
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.entries.clear();
    this.removeAllListeners();
  }

  private startCleanupInterval(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup(): number {
    const now = new Date();
    let removed = 0;

    for (const [key, entry] of this.entries) {
      if (now > entry.expiresAt) {
        this.entries.delete(key);
        this.emit('expired', { key, entry });
        removed++;
      }
    }

    return removed;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.entries) {
      const entryTime = entry.request.timestamp.getTime();
      if (entryTime < oldestTime) {
        oldestTime = entryTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.entries.delete(oldestKey);
      this.emit('evicted', { key: oldestKey });
    }
  }
}

/**
 * Simple string hash function
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to base36 and ensure positive
  return Math.abs(hash).toString(36);
}

// Global idempotency store
let globalStore: IdempotencyStore | null = null;

export function getGlobalIdempotencyStore(config?: Partial<IdempotencyConfig>): IdempotencyStore {
  if (!globalStore) {
    globalStore = new IdempotencyStore(config);
  }
  return globalStore;
}

export function setGlobalIdempotencyStore(store: IdempotencyStore): void {
  globalStore = store;
}

/**
 * Transaction ID deduplication cache
 * Simple in-memory cache for tracking processed transaction IDs
 */
export class TransactionIdCache {
  private cache = new Set<string>();
  private timestamps = new Map<string, number>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize = 10000, ttlMs = 7 * 24 * 60 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Check if a transaction ID has been processed
   */
  has(transactionId: string): boolean {
    this.cleanup();
    return this.cache.has(transactionId);
  }

  /**
   * Add a transaction ID to the cache
   */
  add(transactionId: string): boolean {
    if (this.cache.has(transactionId)) {
      return false;
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.add(transactionId);
    this.timestamps.set(transactionId, Date.now());
    return true;
  }

  /**
   * Get cache size
   */
  size(): number {
    this.cleanup();
    return this.cache.size;
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.timestamps.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, timestamp] of this.timestamps) {
      if (now - timestamp > this.ttlMs) {
        expired.push(id);
      }
    }

    for (const id of expired) {
      this.cache.delete(id);
      this.timestamps.delete(id);
    }
  }

  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTime = Date.now();

    for (const [id, timestamp] of this.timestamps) {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.cache.delete(oldestId);
      this.timestamps.delete(oldestId);
    }
  }
}
