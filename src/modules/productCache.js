import { CACHE_TTL, CACHE_MAX_ENTRIES } from '../config/constants.js';
import {
  idbGetProduct, idbPutProduct, idbPrune
} from './idbCache.js';

/**
 * Two-tier cache for product details:
 *   - hot: in-memory Map with TTL + LRU eviction
 *   - cold: IndexedDB (durable across sessions, powers offline)
 *
 * Get: memory → IDB hydration → null
 * Set: writes both tiers
 */
class ProductCache {
  constructor() {
    this._cache = new Map();
    // Background prune of stale IDB entries — keep 24h
    idbPrune(24 * 60 * 60 * 1000);
  }

  /** Synchronous memory-only lookup (used by hot paths during render). */
  get(id) {
    const entry = this._cache.get(id);
    if (!entry) return null;

    if (Date.now() - entry.fetchedAt > CACHE_TTL) {
      this._cache.delete(id);
      return null;
    }
    return entry;
  }

  /**
   * Async lookup that falls back to IDB. Use when a sync miss is acceptable
   * to wait on (detail loads, offline boot).
   */
  async getAsync(id) {
    const hit = this.get(id);
    if (hit) return hit;
    const cold = await idbGetProduct(id);
    if (!cold) return null;
    // Re-hydrate hot tier without TTL gating — IDB is the source of truth
    const entry = {
      detail: cold.detail,
      parsedData: cold.parsedData,
      fetchedAt: cold.fetchedAt
    };
    this._cache.set(id, entry);
    return entry;
  }

  set(id, detail, parsedData = null) {
    if (this._cache.size >= CACHE_MAX_ENTRIES && !this._cache.has(id)) {
      const oldestKey = this._cache.keys().next().value;
      this._cache.delete(oldestKey);
    }

    const entry = { detail, parsedData, fetchedAt: Date.now() };
    this._cache.set(id, entry);
    idbPutProduct(id, detail, parsedData);
  }

  has(id) {
    return this.get(id) !== null;
  }

  clear() {
    this._cache.clear();
  }

  get size() {
    return this._cache.size;
  }
}

export const productCache = new ProductCache();
export default productCache;
