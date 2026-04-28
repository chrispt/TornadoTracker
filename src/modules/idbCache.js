/**
 * IndexedDB-backed durable cache for product details.
 *
 * Schema:
 *   db: tornado-tracker
 *   store: products (keyPath: id)
 *     { id, detail, parsedData, fetchedAt }
 *   store: feedSnapshot (keyPath: key)
 *     { key: 'latest', products, savedAt }
 *
 * The in-memory ProductCache stays the hot path; IDB persists across sessions
 * and powers the offline experience.
 */

const DB_NAME = 'tornado-tracker';
const DB_VERSION = 1;
const PRODUCTS_STORE = 'products';
const SNAPSHOT_STORE = 'feedSnapshot';
const SNAPSHOT_KEY = 'latest';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.reject(new Error('IndexedDB not available'));
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PRODUCTS_STORE)) {
        db.createObjectStore(PRODUCTS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function asPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetProduct(id) {
  try {
    const db = await openDb();
    return await asPromise(tx(db, PRODUCTS_STORE).get(id));
  } catch {
    return null;
  }
}

export async function idbPutProduct(id, detail, parsedData) {
  try {
    const db = await openDb();
    await asPromise(tx(db, PRODUCTS_STORE, 'readwrite').put({
      id, detail, parsedData, fetchedAt: Date.now()
    }));
  } catch { /* swallow — cache is best-effort */ }
}

export async function idbAllProducts() {
  try {
    const db = await openDb();
    return await asPromise(tx(db, PRODUCTS_STORE).getAll());
  } catch {
    return [];
  }
}

export async function idbSaveFeedSnapshot(products) {
  try {
    const db = await openDb();
    // Strip large product._raw fields if present
    const slim = products.map(p => ({
      id: p.id,
      productCode: p.productCode,
      productName: p.productName,
      issuanceTime: p.issuanceTime,
      issuingOffice: p.issuingOffice,
      _subType: p._subType,
      _isPDS: p._isPDS,
      _category: p._category
    }));
    await asPromise(tx(db, SNAPSHOT_STORE, 'readwrite').put({
      key: SNAPSHOT_KEY,
      products: slim,
      savedAt: Date.now()
    }));
  } catch { /* swallow */ }
}

export async function idbLoadFeedSnapshot() {
  try {
    const db = await openDb();
    const snap = await asPromise(tx(db, SNAPSHOT_STORE).get(SNAPSHOT_KEY));
    return snap || null;
  } catch {
    return null;
  }
}

/** Delete entries older than maxAgeMs */
export async function idbPrune(maxAgeMs) {
  try {
    const db = await openDb();
    const cutoff = Date.now() - maxAgeMs;
    const store = tx(db, PRODUCTS_STORE, 'readwrite');
    const all = await asPromise(store.getAll());
    await Promise.all(
      all.filter(e => e.fetchedAt < cutoff)
         .map(e => asPromise(store.delete(e.id)))
    );
  } catch { /* swallow */ }
}
