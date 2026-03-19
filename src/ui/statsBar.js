import store from '../state/store.js';
import { CATEGORIES } from '../config/constants.js';

/**
 * Initialize the stats bar — summary counts of products by category.
 * Progressively updates as background fetches add products.
 */
export function initStatsBar() {
  store.subscribe('products', renderStats);
}

function renderStats() {
  const bar = document.getElementById('stats-bar');
  if (!bar) return;

  const products = store.get('products') || [];

  // Count by category
  const catCounts = {};
  products.forEach(p => {
    const cat = p._category || 'UNKNOWN';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });

  let html = `
    <div class="stats-bar__item">
      <span>Total:</span>
      <span class="stats-bar__value">${products.length}</span>
    </div>
  `;

  // Category counts
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const count = catCounts[key] || 0;
    if (count > 0) {
      html += `
        <div class="stats-bar__item">
          <span class="stats-bar__dot" style="background:${cat.color};"></span>
          <span>${cat.label}:</span>
          <span class="stats-bar__value">${count}</span>
        </div>
      `;
    }
  });

  bar.innerHTML = html;
}
