import store from '../state/store.js';
import { CATEGORIES } from '../config/constants.js';

/**
 * Stats bar — summary counts by category. When an active tornado emergency
 * is in the feed, render an emphasized banner at the front of the bar
 * with role=alert / aria-live=assertive so screen readers announce it.
 */
export function initStatsBar() {
  store.subscribe('products', renderStats);
}

function renderStats() {
  const bar = document.getElementById('stats-bar');
  if (!bar) return;

  const products = store.get('products') || [];

  const catCounts = {};
  products.forEach(p => {
    const cat = p._category || 'UNKNOWN';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });

  let html = '';

  const emergencyCount = catCounts.EMERGENCY || 0;
  if (emergencyCount > 0) {
    html += `
      <div class="stats-bar__emergency" role="alert" aria-live="assertive">
        <span class="stats-bar__emergency-icon" aria-hidden="true">⚠</span>
        <span>${emergencyCount} Active Tornado Emergency${emergencyCount > 1 ? 's' : ''}</span>
      </div>
    `;
  }

  html += `
    <div class="stats-bar__item">
      <span>Total:</span>
      <span class="stats-bar__value">${products.length}</span>
    </div>
  `;

  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    if (key === 'EMERGENCY') return; // shown via the banner instead
    const count = catCounts[key] || 0;
    if (count > 0) {
      html += `
        <div class="stats-bar__item">
          <span class="stats-bar__dot" style="background:${cat.color};" aria-hidden="true"></span>
          <span>${cat.label}:</span>
          <span class="stats-bar__value">${count}</span>
        </div>
      `;
    }
  });

  bar.innerHTML = html;
}
