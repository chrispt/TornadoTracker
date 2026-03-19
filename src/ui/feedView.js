import store from '../state/store.js';
import { renderProductCard } from './productCard.js';

/**
 * Initialize the feed view — renders product cards and handles selection.
 */
export function initFeedView() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  // Render on products change
  store.subscribe('products', renderFeed);
  store.subscribe('selectedProductId', renderFeed);

  // Card click delegation
  container.addEventListener('click', (e) => {
    const card = e.target.closest('.product-card');
    if (card) {
      const id = card.dataset.productId;
      store.set('selectedProductId', id);
      document.dispatchEvent(new CustomEvent('tt:product-selected', { detail: id }));
    }
  });
}

function renderFeed() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  const products = store.get('products');
  const selectedId = store.get('selectedProductId');
  const isLoading = store.get('isLoading');

  if (isLoading && products.length === 0) {
    container.innerHTML = `
      <div class="feed-loading">
        <div class="spinner"></div>
      </div>
    `;
    return;
  }

  if (!products || products.length === 0) {
    container.innerHTML = `
      <div class="feed-empty">
        <div class="feed-empty__icon">&#127786;</div>
        <div>No products found</div>
        <div style="font-size:12px;">Try selecting different product types or check back later</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="feed-list">
      ${products.map(p => renderProductCard(p, p.id === selectedId)).join('')}
    </div>
  `;
}
