/**
 * Pluggable cache adapter.
 *
 * Abstracts key-value caching so services don't depend on a specific
 * store. The default implementation uses Redis; MemoryCacheAdapter is
 * provided for tests and single-process deployments.
 */

import type Redis from "ioredis";

export interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Get-or-set: if key is missing, call `fn`, cache the result, and return it. */
  getOrSet(
    key: string,
    fn: () => Promise<string>,
    ttlSeconds?: number,
  ): Promise<string>;
}

// ---------------------------------------------------------------------------
// Redis implementation
// ---------------------------------------------------------------------------

export class RedisCacheAdapter implements CacheAdapter {
  constructor(private redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.redis.set(key, value, "EX", ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async getOrSet(
    key: string,
    fn: () => Promise<string>,
    ttlSeconds?: number,
  ): Promise<string> {
    const cached = await this.get(key);
    if (cached !== null) return cached;
    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}

// ---------------------------------------------------------------------------
// In-memory implementation (tests / single-process)
// ---------------------------------------------------------------------------

interface MemoryEntry {
  value: string;
  expiresAt: number | null;
}

export class MemoryCacheAdapter implements CacheAdapter {
  private store = new Map<string, MemoryEntry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async getOrSet(
    key: string,
    fn: () => Promise<string>,
    ttlSeconds?: number,
  ): Promise<string> {
    const cached = await this.get(key);
    if (cached !== null) return cached;
    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
