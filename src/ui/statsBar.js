import store from '../state/store.js';
import { CATEGORIES, EF_SCALE } from '../config/constants.js';

/**
 * Initialize the stats bar — summary counts of products and tornado data.
 */
export function initStatsBar() {
  store.subscribe('products', renderStats);
  store.subscribe('tornadoMarkers', renderStats);
}

function renderStats() {
  const bar = document.getElementById('stats-bar');
  if (!bar) return;

  const products = store.get('products') || [];
  const markers = store.get('tornadoMarkers') || [];

  // Count by category
  const catCounts = {};
  products.forEach(p => {
    const cat = p._category || 'UNKNOWN';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });

  // Count by EF rating from markers
  const efCounts = {};
  markers.forEach(m => {
    if (m.efRating) {
      efCounts[m.efRating] = (efCounts[m.efRating] || 0) + 1;
    }
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

  // Tornado markers count
  if (markers.length > 0) {
    html += `
      <div class="stats-bar__item" style="border-left:1px solid var(--border-color);padding-left:var(--space-md);">
        <span>Tornadoes:</span>
        <span class="stats-bar__value">${markers.length}</span>
      </div>
    `;

    // EF breakdown
    Object.entries(efCounts).forEach(([ef, count]) => {
      const info = EF_SCALE[ef] || EF_SCALE.UNKNOWN;
      html += `
        <div class="stats-bar__item">
          <span class="stats-bar__dot" style="background:${info.color};"></span>
          <span>${ef}:</span>
          <span class="stats-bar__value">${count}</span>
        </div>
      `;
    });
  }

  bar.innerHTML = html;
}
