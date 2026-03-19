/**
 * TornadoTracker — main orchestrator.
 * Initializes UI, manages polling, and coordinates view routing.
 */

import store from './state/store.js';
import { fetchMultipleProductTypes } from './api/nwsProducts.js';
import { fetchProductDetail } from './api/nwsProducts.js';
import { parseProductText } from './utils/textParser.js';
import { productCache } from './modules/productCache.js';
import { PRODUCT_TYPES, SUB_TYPE_TO_CATEGORY } from './config/constants.js';

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
const NEEDS_CONTENT_CHECK_TYPES = new Set(['PNS', 'LSR']);

/** All NWS types to always fetch */
const ALL_NWS_TYPES = Object.keys(PRODUCT_TYPES);

async function refreshProducts() {
  store.set('isLoading', true);
  store.set('error', null);

  // Always fetch all 3 NWS types regardless of category filter
  const { products, errors } = await fetchMultipleProductTypes(ALL_NWS_TYPES, currentOffice);

  if (errors.length > 0) {
    const msg = errors.map(e => `${e.type}: ${e.error.message}`).join('; ');
    store.set('error', msg);
    console.warn('Fetch errors:', msg);
  }

  // Filter to tornado-only, assign category, and build markers
  const allTornado = [];
  const markers = [];

  const filterPromises = products.map(async (product) => {
    const code = product.productCode;

    // TOR products are always tornado-relevant
    if (ALWAYS_TORNADO_TYPES.has(code)) {
      const cached = await fetchAndParseProduct(product);
      product._subType = cached?.parsedData?.subType || null;
      product._isPDS = cached?.parsedData?.isPDS || false;
      product._category = SUB_TYPE_TO_CATEGORY[product._subType] || SUB_TYPE_TO_CATEGORY[code] || null;
      collectMarkers(markers, product, cached);
      return product;
    }

    // PNS/LSR need a content check
    if (NEEDS_CONTENT_CHECK_TYPES.has(code)) {
      const cached = await fetchAndParseProduct(product);
      if (cached?.parsedData?.hasTornadoContent) {
        product._subType = cached?.parsedData?.subType || null;
        product._isPDS = cached?.parsedData?.isPDS || false;
        product._category = SUB_TYPE_TO_CATEGORY[product._subType] || SUB_TYPE_TO_CATEGORY[code] || null;
        collectMarkers(markers, product, cached);
        return product;
      }
      return null; // Not tornado-relevant
    }

    return product;
  });

  const results = await Promise.allSettled(filterPromises);
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value) {
      allTornado.push(r.value);
    }
  });

  // Re-sort since Promise.allSettled may resolve out of order
  allTornado.sort((a, b) => new Date(b.issuanceTime) - new Date(a.issuanceTime));

  // Client-side filter by selected categories
  const selectedCats = store.get('selectedCategories');
  const filtered = allTornado.filter(p => p._category && selectedCats.includes(p._category));
  const filteredMarkers = markers.filter(m => selectedCats.includes(m.category));

  store.set('products', filtered);
  store.set('tornadoMarkers', filteredMarkers);
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
        category: product._category,
        polygon: t.polygon || null,
        pathLine: (t.startLat && t.endLat) ? [
          { lat: t.startLat, lon: t.startLon },
          { lat: t.endLat, lon: t.endLon }
        ] : null
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

  document.addEventListener('tt:categories-changed', () => {
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
