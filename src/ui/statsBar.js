import store from '../state/store.js';
import { PRODUCT_TYPES, EF_SCALE } from '../config/constants.js';

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

  // Count by product type
  const typeCounts = {};
  products.forEach(p => {
    const code = p.productCode || 'UNK';
    typeCounts[code] = (typeCounts[code] || 0) + 1;
  });

  // Count PDS products
  const pdsCount = products.filter(p => p._isPDS).length;

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

  // Product type counts
  Object.entries(typeCounts).forEach(([code, count]) => {
    const info = PRODUCT_TYPES[code];
    const color = info ? info.color : '#6b7280';
    html += `
      <div class="stats-bar__item">
        <span class="stats-bar__dot" style="background:${color};"></span>
        <span>${code}:</span>
        <span class="stats-bar__value">${count}</span>
      </div>
    `;
  });

  // PDS count (only show when > 0)
  if (pdsCount > 0) {
    html += `
      <div class="stats-bar__item">
        <span class="stats-bar__dot" style="background:#dc2626;"></span>
        <span>PDS:</span>
        <span class="stats-bar__value">${pdsCount}</span>
      </div>
    `;
  }

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
