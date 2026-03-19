import store from '../state/store.js';
import { renderProductCard } from './productCard.js';

/**
 * Initialize the feed view — renders product cards and handles selection.
 */
export function initFeedView() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  // Full re-render only when the product list itself changes
  store.subscribe('products', renderFeed);
  // Selection change: just toggle CSS classes instead of re-rendering everything
  store.subscribe('selectedProductId', updateSelection);

  // Card click delegation
  container.addEventListener('click', (e) => {
    const card = e.target.closest('.product-card');
    if (card) selectCard(card);
  });

  // Keyboard navigation
  container.addEventListener('keydown', (e) => {
    const card = e.target.closest('.product-card');
    if (!card) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectCard(card);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = card.nextElementSibling;
      if (next && next.classList.contains('product-card')) next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = card.previousElementSibling;
      if (prev && prev.classList.contains('product-card')) prev.focus();
    }
  });
}

function selectCard(card) {
  const id = card.dataset.productId;
  store.set('selectedProductId', id);
  document.dispatchEvent(new CustomEvent('tt:product-selected', { detail: id }));
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
        <div class="feed-empty__title">No tornado products found</div>
        <div class="feed-empty__subtitle">Try selecting different categories or check back later for new reports</div>
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

function updateSelection(newId, oldId) {
  const container = document.getElementById('feed-container');
  if (!container) return;

  if (oldId) {
    const prev = container.querySelector(`[data-product-id="${CSS.escape(oldId)}"]`);
    if (prev) prev.classList.remove('product-card--selected');
  }
  if (newId) {
    const next = container.querySelector(`[data-product-id="${CSS.escape(newId)}"]`);
    if (next) next.classList.add('product-card--selected');
  }
}
