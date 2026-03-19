/**
 * TornadoTracker — main orchestrator.
 * Initializes UI, manages polling, and coordinates view routing.
 */

import store from './state/store.js';
import { fetchMultipleProductTypes } from './api/nwsProducts.js';
import { fetchProductDetail } from './api/nwsProducts.js';
import { parseProductText } from './utils/textParser.js';
import { productCache } from './modules/productCache.js';

import { initHeader } from './ui/header.js';
import { initFeedView } from './ui/feedView.js';
import { initDetailView } from './ui/detailView.js';
import { initSearchView } from './ui/searchView.js';
import { initStatsBar } from './ui/statsBar.js';
import { initMap } from './ui/mapView.js';

let pollTimer = null;
let currentOffice = '';

// ── Bootstrap ─────────────────────────────────

async function init() {
  initHeader();
  initFeedView();
  initDetailView();
  initSearchView();
  initStatsBar();
  initMap();

  setupTabSwitching();
  setupEventListeners();

  // Initial fetch
  await refreshProducts();
  startPolling();
}

// ── Data Fetching ─────────────────────────────

/** Types that are tornado-related by definition — no content check needed */
const ALWAYS_TORNADO_TYPES = new Set(['TOR']);

/** Types that need a content check to confirm tornado relevance */
const NEEDS_CONTENT_CHECK_TYPES = new Set(['PNS', 'SVS', 'SVR', 'LSR']);

async function refreshProducts() {
  const types = store.get('selectedProductTypes');
  if (!types || types.length === 0) return;

  store.set('isLoading', true);
  store.set('error', null);

  const { products, errors } = await fetchMultipleProductTypes(types, currentOffice);

  if (errors.length > 0) {
    const msg = errors.map(e => `${e.type}: ${e.error.message}`).join('; ');
    store.set('error', msg);
    console.warn('Fetch errors:', msg);
  }

  // Filter to tornado-only and build markers in a single pass
  const filtered = [];
  const markers = [];

  const filterPromises = products.map(async (product) => {
    const code = product.productCode;

    // TOR/LSR are always tornado-relevant
    if (ALWAYS_TORNADO_TYPES.has(code)) {
      const cached = await fetchAndParseProduct(product);
      product._subType = cached?.parsedData?.subType || null;
      collectMarkers(markers, product, cached);
      return product;
    }

    // PNS/SVS need a content check
    if (NEEDS_CONTENT_CHECK_TYPES.has(code)) {
      const cached = await fetchAndParseProduct(product);
      if (cached?.parsedData?.hasTornadoContent) {
        product._subType = cached?.parsedData?.subType || null;
        collectMarkers(markers, product, cached);
        return product;
      }
      return null; // Not tornado-relevant
    }

    // Other types (e.g. SVR) — keep in feed but no marker extraction
    return product;
  });

  const results = await Promise.allSettled(filterPromises);
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value) {
      filtered.push(r.value);
    }
  });

  // Re-sort since Promise.allSettled may resolve out of order
  filtered.sort((a, b) => new Date(b.issuanceTime) - new Date(a.issuanceTime));

  store.set('products', filtered);
  store.set('tornadoMarkers', markers);
  store.set('lastFetchTime', new Date().toISOString());
  store.set('isLoading', false);
}

/**
 * Fetch detail and parse a product, using cache when available.
 * @returns {{ detail: Object, parsedData: Object } | null}
 */
async function fetchAndParseProduct(product) {
  try {
    let cached = productCache.get(product.id);
    if (cached) return cached;

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

/**
 * Extract tornado markers from parsed product data and push to array.
 */
function collectMarkers(markers, product, cached) {
  if (!cached?.parsedData?.tornadoes) return;
  cached.parsedData.tornadoes.forEach(t => {
    if (t.lat && t.lon) {
      markers.push({
        lat: t.lat,
        lon: t.lon,
        efRating: t.efRating,
        productId: product.id,
        label: product.productName || '',
        county: t.county,
        pathLength: t.pathLength,
        type: product.productCode,
        polygon: t.polygon || null
      });
    }
  });
}

// ── Product Detail Loading ────────────────────

async function loadProductDetail(id) {
  // Check cache
  let cached = productCache.get(id);
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
  });

  document.addEventListener('tt:types-changed', () => {
    refreshProducts();
    startPolling(); // Reset polling timer
  });

  document.addEventListener('tt:office-changed', (e) => {
    currentOffice = e.detail;
    refreshProducts();
  });

  document.addEventListener('tt:product-selected', (e) => {
    loadProductDetail(e.detail);
  });
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
