import store from '../state/store.js';
import { PRODUCT_TYPES } from '../config/constants.js';
import { formatDate } from '../utils/formatting.js';

/**
 * Render the app header with title, product type filters, and refresh controls.
 */
export function initHeader() {
  const header = document.getElementById('app-header');
  if (!header) return;

  header.innerHTML = `
    <div class="app-header__title">TornadoTracker</div>
    <div class="app-header__controls">
      <div class="app-header__filters" id="type-filters"></div>
      <input type="text" id="office-filter" placeholder="Office (e.g. KBMX)"
        style="width:130px;" title="Filter by NWS office code" />
      <button class="btn btn--primary btn--sm" id="refresh-btn" title="Refresh now">
        Refresh
      </button>
      <span class="app-header__status" id="refresh-status"></span>
    </div>
  `;

  renderTypeFilters();

  // Office filter
  const officeInput = document.getElementById('office-filter');
  officeInput.addEventListener('change', () => {
    const value = officeInput.value.trim().toUpperCase();
    officeInput.value = value;
    // Dispatch custom event for main.js to handle
    document.dispatchEvent(new CustomEvent('tt:office-changed', { detail: value }));
  });

  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('tt:refresh-requested'));
  });

  // Update status on fetch
  store.subscribe('lastFetchTime', (time) => {
    const el = document.getElementById('refresh-status');
    if (el && time) el.textContent = `Updated ${formatDate(time)}`;
  });

  store.subscribe('isLoading', (loading) => {
    const btn = document.getElementById('refresh-btn');
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? 'Loading...' : 'Refresh';
    }
  });
}

function renderTypeFilters() {
  const container = document.getElementById('type-filters');
  if (!container) return;

  const selected = store.get('selectedProductTypes');

  container.innerHTML = Object.entries(PRODUCT_TYPES).map(([code, info]) => {
    const checked = selected.includes(code) ? 'checked' : '';
    return `
      <label style="display:inline-flex;align-items:center;gap:3px;font-size:12px;cursor:pointer;">
        <input type="checkbox" value="${code}" ${checked} class="type-filter-cb" />
        <span style="color:${info.color};font-weight:600;font-family:var(--font-mono);">${code}</span>
      </label>
    `;
  }).join('');

  container.addEventListener('change', () => {
    const checked = [...container.querySelectorAll('.type-filter-cb:checked')].map(cb => cb.value);
    if (checked.length > 0) {
      store.set('selectedProductTypes', checked);
      document.dispatchEvent(new CustomEvent('tt:types-changed', { detail: checked }));
    }
  });
}
