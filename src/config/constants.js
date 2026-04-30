/** NWS API base URL */
export const API_BASE = 'https://api.weather.gov';

/** Product types relevant to tornado tracking (used for API fetching) */
export const PRODUCT_TYPES = {
  PNS: { code: 'PNS', label: 'Public Information Statement', color: '#3b82f6' },
  TOR: { code: 'TOR', label: 'Tornado Warning', color: '#ef4444' },
  LSR: { code: 'LSR', label: 'Local Storm Report', color: '#8b5cf6' }
};

/** User-facing tornado categories — ordered by severity for the UI.
 *  `label` is the full human-readable name (used in the stats bar and on
 *  card badges); `shortLabel` is the chip-friendly form that drops the
 *  redundant "Tornado" prefix where context already implies it. */
export const CATEGORIES = {
  EMERGENCY: { key: 'EMERGENCY', label: 'Tornado Emergency', shortLabel: 'Emergency', color: '#dc2626' },
  ALERT:     { key: 'ALERT',     label: 'Active Alerts',     shortLabel: 'Alerts',    color: '#f43f5e' },
  WATCH:     { key: 'WATCH',     label: 'Tornado Watches',   shortLabel: 'Watches',   color: '#f59e0b' },
  WARNING:   { key: 'WARNING',   label: 'Tornado Warnings',  shortLabel: 'Warnings',  color: '#a855f7' },
  PDS:       { key: 'PDS',       label: 'PDS Warnings',      shortLabel: 'PDS',       color: '#ef4444' },
  SURVEY:    { key: 'SURVEY',    label: 'Damage Surveys',    shortLabel: 'Surveys',   color: '#3b82f6' },
  LSR:       { key: 'LSR',       label: 'Storm Reports',     shortLabel: 'Reports',   color: '#8b5cf6' }
};

/** Map NWS sub-type → user-facing category */
export const SUB_TYPE_TO_CATEGORY = {
  ALERT_TOR_EMERGENCY: 'EMERGENCY',
  TOR_EMERGENCY:       'EMERGENCY',
  ALERT_TOR_PDS:       'ALERT',
  ALERT_TOR:           'ALERT',
  WATCH_TOR_PDS:       'WATCH',
  WATCH_TOR:           'WATCH',
  PNS_SURVEY:          'SURVEY',
  PNS_TORNADO:         'SURVEY',
  LSR:                 'LSR',
  TOR_PDS:             'PDS',
  TOR:                 'WARNING'
};

/** EF Scale colors and labels */
export const EF_SCALE = {
  EF0: { label: 'EF0 (65-85 mph)', color: '#fde047' },
  EF1: { label: 'EF1 (86-110 mph)', color: '#facc15' },
  EF2: { label: 'EF2 (111-135 mph)', color: '#f97316' },
  EF3: { label: 'EF3 (136-165 mph)', color: '#ef4444' },
  EF4: { label: 'EF4 (166-200 mph)', color: '#dc2626' },
  EF5: { label: 'EF5 (200+ mph)', color: '#991b1b' },
  UNKNOWN: { label: 'Unknown', color: '#6b7280' }
};

/** Sub-type labels for product cards */
export const PRODUCT_SUB_TYPES = {
  ALERT_TOR_EMERGENCY: 'Active Tornado Emergency',
  TOR_EMERGENCY:       'Tornado Emergency',
  ALERT_TOR_PDS:       'PDS Tornado Warning (Active)',
  ALERT_TOR:           'Active Tornado Warning',
  WATCH_TOR_PDS:       'PDS Tornado Watch',
  WATCH_TOR:           'Tornado Watch',
  TOR:                 'Tornado Warning',
  TOR_PDS:             'PDS Tornado Warning',
  PNS_SURVEY:          'NWS Damage Survey',
  PNS_TORNADO:         'Tornado Report',
  LSR:                 'Local Storm Report'
};

/** localStorage keys */
export const STORAGE_KEYS = {
  SELECTED_CATEGORIES: 'tt_selectedCategories',
  REFRESH_INTERVAL:    'tt_refreshInterval',
  SAVED_LOCATIONS:     'tt_savedLocations',
  ACTIVE_LOCATION:     'tt_activeLocation',
  RADIUS_MILES:        'tt_radiusMiles',
  LAST_SEEN_AT:        'tt_lastSeenAt',
  RADAR_VISIBLE:       'tt_radarVisible',
  OUTLOOK_VISIBLE:     'tt_outlookVisible'
};

/** Default polling interval in ms */
export const DEFAULT_REFRESH_INTERVAL = 120000;

/** Default radius (miles) for "near me" filter */
export const DEFAULT_RADIUS_MILES = 100;

/** Product list fetch limit */
export const PRODUCT_FETCH_LIMIT = 250;

/** Product cache TTL in ms (30 minutes) */
export const CACHE_TTL = 30 * 60 * 1000;

/** Maximum cache entries */
export const CACHE_MAX_ENTRIES = 100;

/** Prefix for alert-derived product IDs (no backing /products entry) */
export const ALERT_ID_PREFIX = 'alert:';
