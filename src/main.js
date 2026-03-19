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

let pollTimer = null;
let currentOffice = '';
let fetchGeneration = 0;
let allTornadoProducts = [];

// ── Bootstrap ─────────────────────────────────

async function init() {
  initHeader();
  initFeedView();
  initDetailView();
  initSearchView();
  initStatsBar();

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
  const generation = ++fetchGeneration;
  store.set('isLoading', true);
  store.set('error', null);

  // Always fetch all 3 NWS types regardless of category filter
  const { products, errors } = await fetchMultipleProductTypes(ALL_NWS_TYPES, currentOffice);

  if (fetchGeneration !== generation) return; // stale

  if (errors.length > 0) {
    const msg = errors.map(e => `${e.type}: ${e.error.message}`).join('; ');
    store.set('error', msg);
    console.warn('Fetch errors:', msg);
  }

  // Stage 1: TOR products go into the feed immediately (no detail fetch needed)
  const torProducts = [];
  const needsDetailCheck = [];

  products.forEach(product => {
    const code = product.productCode;
    if (ALWAYS_TORNADO_TYPES.has(code)) {
      // Assign default category — will be upgraded to PDS in background if applicable
      product._subType = code;
      product._isPDS = false;
      product._category = SUB_TYPE_TO_CATEGORY[code] || null;
      torProducts.push(product);
    } else if (NEEDS_CONTENT_CHECK_TYPES.has(code)) {
      needsDetailCheck.push(product);
    }
  });

  // Show TOR products in feed immediately
  allTornadoProducts = [...torProducts];
  applyFilterAndUpdateStore();
  store.set('lastFetchTime', new Date().toISOString());
  store.set('isLoading', false);

  // Stage 2: Fetch PNS/LSR details in background batches, plus back-fill TOR details
  const allToProcess = [...needsDetailCheck, ...torProducts];
  fetchDetailsInBackground(allToProcess, generation);
}

/**
 * Process products in batches, appending confirmed tornado products to the feed.
 * Also back-fills TOR detail (upgrades _category to PDS if applicable).
 */
async function fetchDetailsInBackground(products, generation) {
  const BATCH_SIZE = 10;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    if (fetchGeneration !== generation) return; // stale

    const batch = products.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(p => fetchAndParseProduct(p).then(cached => ({ product: p, cached })))
    );

    if (fetchGeneration !== generation) return; // stale

    let changed = false;
    results.forEach(r => {
      if (r.status !== 'fulfilled' || !r.value) return;
      const { product, cached } = r.value;
      const code = product.productCode;

      if (ALWAYS_TORNADO_TYPES.has(code)) {
        // Back-fill: upgrade category if PDS
        if (cached?.parsedData) {
          product._subType = cached.parsedData.subType || product._subType;
          product._isPDS = cached.parsedData.isPDS || false;
          product._category = SUB_TYPE_TO_CATEGORY[product._subType] || SUB_TYPE_TO_CATEGORY[code] || null;
          changed = true;
        }
      } else if (NEEDS_CONTENT_CHECK_TYPES.has(code)) {
        if (cached?.parsedData?.hasTornadoContent) {
          product._subType = cached.parsedData.subType || null;
          product._isPDS = cached.parsedData.isPDS || false;
          product._category = SUB_TYPE_TO_CATEGORY[product._subType] || SUB_TYPE_TO_CATEGORY[code] || null;
          // Add to the master list if not already present
          if (!allTornadoProducts.some(p => p.id === product.id)) {
            allTornadoProducts.push(product);
            changed = true;
          }
        }
      }
    });

    if (changed && fetchGeneration === generation) {
      allTornadoProducts.sort((a, b) => new Date(b.issuanceTime) - new Date(a.issuanceTime));
      applyFilterAndUpdateStore();
    }
  }
}

/**
 * Apply category filter to allTornadoProducts and update the store.
 */
function applyFilterAndUpdateStore() {
  const selectedCats = store.get('selectedCategories');
  const filtered = allTornadoProducts.filter(p => p._category && selectedCats.includes(p._category));
  store.set('products', filtered);
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
    // Re-filter from cached products instead of re-fetching
    applyFilterAndUpdateStore();
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
