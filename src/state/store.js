import { STORAGE_KEYS, DEFAULT_REFRESH_INTERVAL } from '../config/constants.js';

const initialState = {
  products: [],
  selectedProductId: null,
  selectedProductDetail: null,
  parsedTornadoData: null,
  searchResults: [],
  searchFilters: { type: 'PNS', office: '', startDate: '', endDate: '', keyword: '' },
  tornadoMarkers: [],
  activeView: 'feed',
  selectedProductTypes: ['PNS', 'TOR', 'LSR'],
  refreshInterval: DEFAULT_REFRESH_INTERVAL,
  isLoading: false,
  error: null,
  lastFetchTime: null
};

const PERSISTED_KEYS = ['selectedProductTypes', 'refreshInterval'];

class Store {
  constructor() {
    this._state = { ...initialState };
    this._listeners = new Map();
    this._hydrateFromStorage();
  }

  getState() {
    return { ...this._state };
  }

  get(key) {
    return this._state[key];
  }

  set(key, value) {
    const oldValue = this._state[key];
    if (oldValue === value) return;

    this._state[key] = value;
    this._notifyListeners(key, value, oldValue);

    if (PERSISTED_KEYS.includes(key)) {
      this._persistToStorage(key, value);
    }
  }

  update(updates) {
    Object.entries(updates).forEach(([key, value]) => {
      this.set(key, value);
    });
  }

  subscribe(key, callback) {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key).add(callback);
    return () => {
      const listeners = this._listeners.get(key);
      if (listeners) listeners.delete(callback);
    };
  }

  subscribeAll(callback) {
    const key = '*';
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key).add(callback);
    return () => {
      const listeners = this._listeners.get(key);
      if (listeners) listeners.delete(callback);
    };
  }

  _notifyListeners(key, newValue, oldValue) {
    if (this._listeners.has(key)) {
      this._listeners.get(key).forEach(cb => {
        try { cb(newValue, oldValue, key); }
        catch (e) { console.error(`Store listener error for "${key}":`, e); }
      });
    }
    if (this._listeners.has('*')) {
      this._listeners.get('*').forEach(cb => {
        try { cb(newValue, oldValue, key); }
        catch (e) { console.error('Store global listener error:', e); }
      });
    }
  }

  _hydrateFromStorage() {
    try {
      const types = localStorage.getItem(STORAGE_KEYS.SELECTED_PRODUCT_TYPES);
      if (types) this._state.selectedProductTypes = JSON.parse(types);
    } catch { /* use default */ }

    try {
      const interval = localStorage.getItem(STORAGE_KEYS.REFRESH_INTERVAL);
      if (interval) this._state.refreshInterval = Number(interval);
    } catch { /* use default */ }
  }

  _persistToStorage(key, value) {
    try {
      const storageKey = STORAGE_KEYS[key.replace(/([A-Z])/g, '_$1').toUpperCase()] || key;
      localStorage.setItem(storageKey, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (e) {
      console.error(`Failed to persist "${key}":`, e);
    }
  }
}

export const store = new Store();
export default store;
