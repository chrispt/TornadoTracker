/**
 * TornadoTracker — main orchestrator.
 * Initializes UI, manages polling, and coordinates view routing.
 */

import store from './state/store.js';
import { fetchMultipleProductTypes } from './api/nwsProducts.js';
import { fetchProductDetail } from './api/nwsProducts.js';
import { fetchActiveAlerts } from './api/nwsAlerts.js';
import { parseProductText } from './utils/textParser.js';
import { productCache } from './modules/productCache.js';
import { idbSaveFeedSnapshot, idbLoadFeedSnapshot } from './modules/idbCache.js';
import { PRODUCT_TYPES, SUB_TYPE_TO_CATEGORY, ALERT_ID_PREFIX } from './config/constants.js';
import { distanceMiles, productCoordinate } from './utils/geo.js';

import { initHeader } from './ui/header.js';
import { initFeedView } from './ui/feedView.js';
import { initDetailView } from './ui/detailView.js';
import { initSearchView } from './ui/searchView.js';
import { initStatsBar } from './ui/statsBar.js';
import { initMapView } from './ui/mapView.js';
import { initLocationsView, getActiveLocation } from './ui/locationsView.js';
import { initRouter } from './ui/router.js';

let pollTimer = null;
let alertsTimer = null;
let currentOffice = '';
let fetchGeneration = 0;
let allTornadoProducts = [];
let snapshotTimer = null;

const ALERTS_POLL_INTERVAL = 30000; // 30s — alerts cadence
const SNAPSHOT_DEBOUNCE_MS = 1000;

/** Debounced snapshot save — coalesces bursts of background-batch updates. */
function scheduleSnapshot() {
  if (snapshotTimer) return;
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null;
    idbSaveFeedSnapshot(allTornadoProducts.slice(0, 200));
  }, SNAPSHOT_DEBOUNCE_MS);
}

// ── Bootstrap ─────────────────────────────────

async function init() {
  initHeader();
  initLocationsView();
  initFeedView();
  initDetailView();
  initSearchView();
  initStatsBar();
  initMapView();
  initRouter();

  setupTabSwitching();
  setupEventListeners();
  setupOfflineDetection();
  registerServiceWorker();

  // Hydrate from IDB snapshot before first network fetch — instant feed
  await hydrateFromSnapshot();

  await Promise.allSettled([refreshProducts(), refreshAlerts()]);
  startPolling();
  startAlertsPolling();
}

async function hydrateFromSnapshot() {
  const snap = await idbLoadFeedSnapshot();
  if (snap?.products?.length) {
    allTornadoProducts = snap.products;
    applyFilterAndUpdateStore();
    store.set('lastFetchTime', new Date(snap.savedAt).toISOString());
  }
}

// ── Data Fetching ─────────────────────────────

const ALWAYS_TORNADO_TYPES = new Set(['TOR']);
const NEEDS_CONTENT_CHECK_TYPES = new Set(['PNS', 'LSR']);
const ALL_NWS_TYPES = Object.keys(PRODUCT_TYPES);

async function refreshProducts() {
  const generation = ++fetchGeneration;
  store.set('isLoading', true);
  store.set('error', null);

  const { products, errors } = await fetchMultipleProductTypes(ALL_NWS_TYPES, currentOffice);

  if (fetchGeneration !== generation) return; // stale

  if (errors.length > 0) {
    const msg = errors.map(e => `${e.type}: ${e.error.message}`).join('; ');
    store.set('error', msg);
    console.warn('Fetch errors:', msg);
  }

  const torProducts = [];
  const needsDetailCheck = [];

  products.forEach(product => {
    const code = product.productCode;
    if (ALWAYS_TORNADO_TYPES.has(code)) {
      product._subType = code;
      product._isPDS = false;
      product._category = SUB_TYPE_TO_CATEGORY[code] || null;
      torProducts.push(product);
    } else if (NEEDS_CONTENT_CHECK_TYPES.has(code)) {
      needsDetailCheck.push(product);
    }
  });

  // Merge: keep alerts & previously-confirmed PNS/LSR from prior cycle.
  // Alerts come from a separate polling loop so we leave them intact here.
  const previouslyConfirmed = allTornadoProducts.filter(p =>
    p._category && p._category !== 'WARNING' && !ALWAYS_TORNADO_TYPES.has(p.productCode)
  );
  allTornadoProducts = [...torProducts, ...previouslyConfirmed];
  dedupeAndSort();
  applyFilterAndUpdateStore();
  store.set('lastFetchTime', new Date().toISOString());
  store.set('isLoading', false);

  const allToProcess = [...needsDetailCheck, ...torProducts];
  fetchDetailsInBackground(allToProcess, generation);
}

async function refreshAlerts() {
  const { alerts } = await fetchActiveAlerts();
  const nonAlerts = allTornadoProducts.filter(p => p._category !== 'ALERT');
  allTornadoProducts = [...alerts, ...nonAlerts];
  dedupeAndSort();
  applyFilterAndUpdateStore();
  scheduleSnapshot();
}

function dedupeAndSort() {
  const seen = new Set();
  allTornadoProducts = allTornadoProducts.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  allTornadoProducts.sort((a, b) => new Date(b.issuanceTime) - new Date(a.issuanceTime));
}

async function fetchDetailsInBackground(products, generation) {
  const BATCH_SIZE = 10;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    if (fetchGeneration !== generation) return;

    const batch = products.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(p => fetchAndParseProduct(p).then(cached => ({ product: p, cached })))
    );

    if (fetchGeneration !== generation) return;

    let changed = false;
    results.forEach(r => {
      if (r.status !== 'fulfilled' || !r.value) return;
      const { product, cached } = r.value;
      const code = product.productCode;

      if (ALWAYS_TORNADO_TYPES.has(code)) {
        if (cached?.parsedData) {
          product._subType = cached.parsedData.subType || product._subType;
          product._isPDS = cached.parsedData.isPDS || false;
          product._category = SUB_TYPE_TO_CATEGORY[product._subType] || SUB_TYPE_TO_CATEGORY[code] || null;
          product._parsed = cached.parsedData;
          changed = true;
        }
      } else if (NEEDS_CONTENT_CHECK_TYPES.has(code)) {
        if (cached?.parsedData?.hasTornadoContent) {
          product._subType = cached.parsedData.subType || null;
          product._isPDS = cached.parsedData.isPDS || false;
          product._category = SUB_TYPE_TO_CATEGORY[product._subType] || SUB_TYPE_TO_CATEGORY[code] || null;
          product._parsed = cached.parsedData;
          if (!allTornadoProducts.some(p => p.id === product.id)) {
            allTornadoProducts.push(product);
            changed = true;
          }
        }
      }
    });

    if (changed && fetchGeneration === generation) {
      dedupeAndSort();
      applyFilterAndUpdateStore();
      scheduleSnapshot();
    }
  }
}

/** Apply category + radius filters and update the store. */
function applyFilterAndUpdateStore() {
  const selectedCats = store.get('selectedCategories');
  const radius = store.get('radiusMiles');
  const loc = getActiveLocation();

  let filtered = allTornadoProducts.filter(p =>
    p._category && selectedCats.includes(p._category)
  );

  if (loc) {
    filtered = filtered.filter(p => {
      const c = productCoordinate(p);
      if (!c) return true; // keep if we can't tell — better than hiding
      return distanceMiles(loc.lat, loc.lon, c.lat, c.lon) <= radius;
    });
  }

  store.set('products', filtered);
}

async function fetchAndParseProduct(product) {
  try {
    let cached = productCache.get(product.id);
    if (cached) return cached;

    // Try IDB before network
    const cold = await productCache.getAsync(product.id);
    if (cold) return cold;

    const { data } = await fetchProductDetail(product.id);
    if (data && data.productText) {
      const parsed = parseProductText(data.productText, product.productCode);
      productCache.set(product.id, data, parsed);
      return { detail: data, parsedData: parsed };
    }
  } catch (e) {
    console.warn(`Failed to parse product ${product.id}:`, e);
  }
  return null;
}

// ── Product Detail Loading ────────────────────

async function loadProductDetail(id) {
  // Active alert IDs don't have a backing /products entry — render the
  // alert payload directly from the merged in-memory list.
  if (id.startsWith(ALERT_ID_PREFIX)) {
    const alert = allTornadoProducts.find(p => p.id === id);
    if (alert) {
      store.update({
        selectedProductDetail: alert,
        parsedTornadoData: {
          tornadoes: [], hasTornadoContent: true,
          isPDS: alert._isPDS, subType: alert._subType
        }
      });
    }
    return;
  }

  // Hot/cold cache check
  const cached = await productCache.getAsync(id);
  if (cached) {
    store.update({
      selectedProductDetail: cached.detail,
      parsedTornadoData: cached.parsedData
    });
    return;
  }

  store.set('isLoading', true);
  const { data, error } = await fetchProductDetail(id);
  store.set('isLoading', false);

  if (error) {
    store.set('error', error.message);
    return;
  }

  const parsed = parseProductText(data.productText, data.productCode);
  productCache.set(id, data, parsed);

  store.update({
    selectedProductDetail: data,
    parsedTornadoData: parsed
  });
}

// ── Polling ───────────────────────────────────

function startPolling() {
  stopPolling();
  const interval = store.get('refreshInterval');
  pollTimer = setInterval(() => refreshProducts(), interval);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startAlertsPolling() {
  if (alertsTimer) clearInterval(alertsTimer);
  alertsTimer = setInterval(() => refreshAlerts(), ALERTS_POLL_INTERVAL);
}

// ── Tab Switching ─────────────────────────────

function setupTabSwitching() {
  const tabs = document.querySelectorAll('.sidebar__tab');
  const feedContainer = document.getElementById('feed-container');
  const searchContainer = document.getElementById('search-container');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('sidebar__tab--active'));
      tab.classList.add('sidebar__tab--active');

      const target = tab.dataset.tab;
      if (target === 'feed') {
        feedContainer.classList.remove('hidden');
        searchContainer.classList.add('hidden');
        store.set('activeView', 'feed');
      } else {
        feedContainer.classList.add('hidden');
        searchContainer.classList.remove('hidden');
        store.set('activeView', 'search');
      }
    });
  });
}

// ── Event Listeners ───────────────────────────

function setupEventListeners() {
  document.addEventListener('tt:refresh-requested', () => {
    refreshProducts();
    refreshAlerts();
  });

  document.addEventListener('tt:categories-changed', () => {
    applyFilterAndUpdateStore();
  });

  document.addEventListener('tt:office-changed', (e) => {
    currentOffice = e.detail;
    refreshProducts();
  });

  document.addEventListener('tt:location-changed', () => {
    applyFilterAndUpdateStore();
  });

  document.addEventListener('tt:product-selected', (e) => {
    loadProductDetail(e.detail);
    showDetailOnMobile();
  });

  store.subscribe('selectedProductDetail', () => {
    if (!store.get('selectedProductDetail')) {
      showFeedOnMobile();
    }
  });
}

function setupOfflineDetection() {
  const update = () => store.set('isOffline', !navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Vite serves /public at the root in dev and includes it in builds
  navigator.serviceWorker.register('/sw.js').catch(err => {
    console.warn('SW registration failed:', err);
  });
}

// ── Mobile Panel Toggling ──────────────────────

function showDetailOnMobile() {
  const sidebar = document.getElementById('sidebar');
  const mainPanel = document.getElementById('main-panel');
  if (!sidebar || !mainPanel) return;
  sidebar.classList.add('sidebar--hidden');
  mainPanel.classList.add('main-panel--visible');
}

function showFeedOnMobile() {
  const sidebar = document.getElementById('sidebar');
  const mainPanel = document.getElementById('main-panel');
  if (!sidebar || !mainPanel) return;
  sidebar.classList.remove('sidebar--hidden');
  mainPanel.classList.remove('main-panel--visible');
}

// ── Go ────────────────────────────────────────

init().catch(err => {
  console.error('TornadoTracker init failed:', err);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `<div class="error-banner" style="margin:var(--space-lg);">
      Failed to initialize: ${err.message}
    </div>`;
  }
});
