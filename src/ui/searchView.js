import store from '../state/store.js';
import { PRODUCT_TYPES } from '../config/constants.js';
import { fetchProductList, fetchProductDetail } from '../api/nwsProducts.js';
import { renderProductCard } from './productCard.js';
import { parseProductText } from '../utils/textParser.js';
import { productCache } from '../modules/productCache.js';
import { escapeHtml } from '../utils/formatting.js';

/**
 * Initialize the search view with form and results.
 */
export function initSearchView() {
  const container = document.getElementById('search-container');
  if (!container) return;

  container.innerHTML = `
    <div class="search-form">
      <div class="search-form__row">
        <label class="search-form__label" for="search-type">Type</label>
        <select id="search-type" class="search-form__input">
          ${Object.entries(PRODUCT_TYPES).map(([code, info]) =>
            `<option value="${code}">${code} - ${info.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="search-form__row">
        <label class="search-form__label" for="search-office">Office</label>
        <input type="text" id="search-office" placeholder="e.g. KBMX" class="search-form__input" />
      </div>
      <div class="search-form__row">
        <label class="search-form__label" for="search-keyword">Keyword</label>
        <input type="text" id="search-keyword" placeholder="e.g. tornado, EF3" class="search-form__input" />
      </div>
      <div class="search-form__row">
        <button class="btn btn--primary" id="search-btn">Search</button>
      </div>
    </div>
    <div class="search-results" id="search-results" aria-live="polite"></div>
  `;

  document.getElementById('search-btn').addEventListener('click', handleSearch);

  // Card click delegation in search results
  document.getElementById('search-results').addEventListener('click', (e) => {
    const card = e.target.closest('.product-card');
    if (card) {
      const id = card.dataset.productId;
      store.set('selectedProductId', id);
      document.dispatchEvent(new CustomEvent('tt:product-selected', { detail: id }));
    }
  });
}

async function handleSearch() {
  const type = document.getElementById('search-type').value;
  const office = document.getElementById('search-office').value.trim().toUpperCase();
  const keyword = document.getElementById('search-keyword').value.trim().toLowerCase();
  const resultsContainer = document.getElementById('search-results');

  resultsContainer.innerHTML = '<div class="feed-loading"><div class="spinner"></div></div>';

  const { data, error } = await fetchProductList({ type, office, limit: 50 });

  if (error) {
    resultsContainer.innerHTML = `<div class="error-banner" role="alert">${escapeHtml(error.message)}</div>`;
    return;
  }

  let results = data || [];

  // Client-side keyword filtering
  if (keyword) {
    results = results.filter(p => {
      const name = (p.productName || '').toLowerCase();
      return name.includes(keyword);
    });
  }

  // Filter PNS to tornado-only content
  const needsCheck = new Set(['PNS']);
  if (needsCheck.has(type)) {
    const checkPromises = results.map(async (product) => {
      try {
        let cached = productCache.get(product.id);
        if (!cached) {
          const { data: detail } = await fetchProductDetail(product.id);
          if (detail && detail.productText) {
            const parsed = parseProductText(detail.productText, product.productCode || type);
            productCache.set(product.id, detail, parsed);
            cached = { detail, parsedData: parsed };
          }
        }
        return cached?.parsedData?.hasTornadoContent ? product : null;
      } catch {
        return null;
      }
    });

    const checked = await Promise.allSettled(checkPromises);
    results = checked
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);
  }

  store.set('searchResults', results);

  resultsContainer.innerHTML = `
    <div class="search-results__count">${results.length} result${results.length !== 1 ? 's' : ''}</div>
    <div class="feed-list">
      ${results.map(p => renderProductCard(p)).join('')}
    </div>
  `;

  if (results.length === 0) {
    resultsContainer.innerHTML += `
      <div class="feed-empty">
        <div>No matching products found</div>
      </div>
    `;
  }
}
