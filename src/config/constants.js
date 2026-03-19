/** NWS API base URL */
export const API_BASE = 'https://api.weather.gov';

/** Product types relevant to tornado tracking */
export const PRODUCT_TYPES = {
  PNS: { code: 'PNS', label: 'Public Information Statement', color: '#3b82f6' },
  TOR: { code: 'TOR', label: 'Tornado Warning', color: '#ef4444' },
  LSR: { code: 'LSR', label: 'Local Storm Report', color: '#8b5cf6' }
};

/** EF Scale colors and labels */
export const EF_SCALE = {
  EF0: { label: 'EF0 (65-85 mph)', color: '#fde047', markerColor: '#fde047' },
  EF1: { label: 'EF1 (86-110 mph)', color: '#facc15', markerColor: '#facc15' },
  EF2: { label: 'EF2 (111-135 mph)', color: '#f97316', markerColor: '#f97316' },
  EF3: { label: 'EF3 (136-165 mph)', color: '#ef4444', markerColor: '#ef4444' },
  EF4: { label: 'EF4 (166-200 mph)', color: '#dc2626', markerColor: '#dc2626' },
  EF5: { label: 'EF5 (200+ mph)', color: '#991b1b', markerColor: '#991b1b' },
  UNKNOWN: { label: 'Unknown', color: '#6b7280', markerColor: '#6b7280' }
};

/** Marker color by product type (for non-EF-rated items) */
export const MARKER_COLORS = {
  TOR: '#a855f7',
  PNS: '#3b82f6',
  LSR: '#8b5cf6',
  DEFAULT: '#6b7280'
};

/** Sub-type labels for product cards */
export const PRODUCT_SUB_TYPES = {
  TOR:         'Tornado Warning',
  TOR_PDS:     'PDS Tornado Warning',
  PNS_SURVEY:  'NWS Damage Survey',
  PNS_TORNADO: 'Tornado Report',
  LSR:         'Local Storm Report',
};

/** localStorage keys */
export const STORAGE_KEYS = {
  SELECTED_PRODUCT_TYPES: 'tt_selectedProductTypes',
  REFRESH_INTERVAL: 'tt_refreshInterval'
};

/** Default polling interval in ms */
export const DEFAULT_REFRESH_INTERVAL = 120000;

/** Product list fetch limit */
export const PRODUCT_FETCH_LIMIT = 50;

/** Product cache TTL in ms (30 minutes) */
export const CACHE_TTL = 30 * 60 * 1000;

/** Maximum cache entries */
export const CACHE_MAX_ENTRIES = 100;
