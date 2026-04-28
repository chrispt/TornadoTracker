import {
  STORAGE_KEYS,
  DEFAULT_REFRESH_INTERVAL,
  DEFAULT_RADIUS_MILES
} from '../config/constants.js';

const initialState = {
  products: [],
  selectedProductId: null,
  selectedProductDetail: null,
  parsedTornadoData: null,
  searchResults: [],
  searchFilters: { type: 'PNS', office: '', startDate: '', endDate: '', keyword: '' },
  activeView: 'feed',
  selectedCategories: ['EMERGENCY', 'ALERT', 'WATCH', 'WARNING', 'PDS', 'SURVEY', 'LSR'],
  refreshInterval: DEFAULT_REFRESH_INTERVAL,
  isLoading: false,
  error: null,
  lastFetchTime: null,
  // New: saved locations (array) and selected location id (or null = all)
  savedLocations: [],
  activeLocationId: null,
  radiusMiles: DEFAULT_RADIUS_MILES,
  // New: ms timestamp of last user "seen" event — drives unseen badge
  lastSeenAt: 0,
  // New: map panel visibility
  mapVisible: true,
  // New: NEXRAD radar overlay visibility (off by default — bandwidth)
  radarVisible: false,
  // New: SPC Day 1 categorical outlook overlay (on by default — light)
  outlookVisible: true,
  // New: most recent outlook payload from SPC
  outlook: null,
  // New: current TVS markers from Iowa Environmental Mesonet's NEXRAD feed
  tvsMarkers: [],
  // New: offline mode flag
  isOffline: false
};

const PERSISTED_KEYS = [
  'selectedCategories',
  'refreshInterval',
  'savedLocations',
  'activeLocationId',
  'radiusMiles',
  'lastSeenAt',
  'radarVisible',
  'outlookVisible'
];

const KEY_TO_STORAGE = {
  selectedCategories: STORAGE_KEYS.SELECTED_CATEGORIES,
  refreshInterval: STORAGE_KEYS.REFRESH_INTERVAL,
  savedLocations: STORAGE_KEYS.SAVED_LOCATIONS,
  activeLocationId: STORAGE_KEYS.ACTIVE_LOCATION,
  radiusMiles: STORAGE_KEYS.RADIUS_MILES,
  lastSeenAt: STORAGE_KEYS.LAST_SEEN_AT,
  radarVisible: STORAGE_KEYS.RADAR_VISIBLE,
  outlookVisible: STORAGE_KEYS.OUTLOOK_VISIBLE
};

class Store {
  constructor() {
    this._state = { ...initialState };
    this._listeners = new Map();
    this._migrateOldKeys();
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

  _migrateOldKeys() {
    try {
      const old = localStorage.getItem('tt_selectedProductTypes');
      if (old) localStorage.removeItem('tt_selectedProductTypes');
    } catch { /* ignore */ }
  }

  _hydrateFromStorage() {
    const tryParse = (storageKey, fallback) => {
      try {
        const v = localStorage.getItem(storageKey);
        return v != null ? JSON.parse(v) : fallback;
      } catch { return fallback; }
    };

    const cats = tryParse(STORAGE_KEYS.SELECTED_CATEGORIES, null);
    if (Array.isArray(cats)) this._state.selectedCategories = cats;

    const interval = tryParse(STORAGE_KEYS.REFRESH_INTERVAL, null);
    if (typeof interval === 'number') this._state.refreshInterval = interval;

    const locs = tryParse(STORAGE_KEYS.SAVED_LOCATIONS, null);
    if (Array.isArray(locs)) this._state.savedLocations = locs;

    const active = tryParse(STORAGE_KEYS.ACTIVE_LOCATION, null);
    if (active === null || typeof active === 'string') this._state.activeLocationId = active;

    const radius = tryParse(STORAGE_KEYS.RADIUS_MILES, null);
    if (typeof radius === 'number') this._state.radiusMiles = radius;

    const seen = tryParse(STORAGE_KEYS.LAST_SEEN_AT, null);
    if (typeof seen === 'number') this._state.lastSeenAt = seen;

    const radar = tryParse(STORAGE_KEYS.RADAR_VISIBLE, null);
    if (typeof radar === 'boolean') this._state.radarVisible = radar;

    const outlook = tryParse(STORAGE_KEYS.OUTLOOK_VISIBLE, null);
    if (typeof outlook === 'boolean') this._state.outlookVisible = outlook;
  }

  _persistToStorage(key, value) {
    try {
      const storageKey = KEY_TO_STORAGE[key] || key;
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (e) {
      console.error(`Failed to persist "${key}":`, e);
    }
  }
}

export const store = new Store();
export default store;
