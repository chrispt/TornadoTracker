import store from '../state/store.js';
import { renderProductCard } from './productCard.js';
import { zoomToLocation, zoomToLocations } from './mapView.js';

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
    if (card) {
      const id = card.dataset.productId;
      store.set('selectedProductId', id);
      document.dispatchEvent(new CustomEvent('tt:product-selected', { detail: id }));

      // Immediately zoom map to any existing markers for this product
      const allMarkers = store.get('tornadoMarkers') || [];
      const matching = allMarkers.filter(m => m.productId === id && m.lat && m.lon);
      if (matching.length === 1) {
        zoomToLocation({ lat: matching[0].lat, lon: matching[0].lon, polygon: matching[0].polygon });
      } else if (matching.length > 1) {
        zoomToLocations(matching);
      }
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
