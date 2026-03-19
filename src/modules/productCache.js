import { CACHE_TTL, CACHE_MAX_ENTRIES } from '../config/constants.js';

/**
 * In-memory cache for product details with TTL and size cap.
 */
class ProductCache {
  constructor() {
    this._cache = new Map();
  }

  get(id) {
    const entry = this._cache.get(id);
    if (!entry) return null;

    if (Date.now() - entry.fetchedAt > CACHE_TTL) {
      this._cache.delete(id);
      return null;
    }
    return entry;
  }

  set(id, detail, parsedData = null) {
    // Evict oldest if at capacity
    if (this._cache.size >= CACHE_MAX_ENTRIES && !this._cache.has(id)) {
      const oldestKey = this._cache.keys().next().value;
      this._cache.delete(oldestKey);
    }

    this._cache.set(id, {
      detail,
      parsedData,
      fetchedAt: Date.now()
    });
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
