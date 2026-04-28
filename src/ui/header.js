import store from '../state/store.js';
import { CATEGORIES } from '../config/constants.js';
import { formatDate, timeAgo } from '../utils/formatting.js';

export function initHeader() {
  const header = document.getElementById('app-header');
  if (!header) return;

  header.innerHTML = `
    <div class="app-header__title">TornadoTracker</div>
    <div class="app-header__controls">
      <div class="app-header__filters" id="type-filters" role="group" aria-label="Category filters"></div>
      <div id="locations-host"></div>
      <input type="text" id="office-filter" placeholder="Office (e.g. KBMX)"
        aria-label="Filter by NWS office code"
        style="width:130px;" />
      <button class="btn btn--ghost btn--sm app-header__map-toggle" id="map-toggle-btn"
        aria-label="Toggle map" aria-pressed="true">
        Map
      </button>
      <button class="btn btn--primary btn--sm" id="refresh-btn" aria-label="Refresh now">
        Refresh
      </button>
      <span class="offline-pill hidden" id="offline-pill" role="status">
        Offline — cached data
      </span>
      <span class="app-header__status" id="refresh-status"
        role="status" aria-live="polite"></span>
    </div>
  `;

  renderCategoryFilters();

  const officeInput = document.getElementById('office-filter');
  officeInput.addEventListener('change', () => {
    const value = officeInput.value.trim().toUpperCase();
    officeInput.value = value;
    document.dispatchEvent(new CustomEvent('tt:office-changed', { detail: value }));
  });

  document.getElementById('refresh-btn').addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('tt:refresh-requested'));
  });

  document.getElementById('map-toggle-btn').addEventListener('click', (e) => {
    const visible = !store.get('mapVisible');
    store.set('mapVisible', visible);
    const panel = document.getElementById('map-panel-wrapper');
    if (panel) panel.classList.toggle('hidden', !visible);
    e.currentTarget.setAttribute('aria-pressed', String(visible));
    document.dispatchEvent(new CustomEvent('tt:map-toggled', { detail: visible }));
  });

  store.subscribe('lastFetchTime', updateStatus);
  store.subscribe('isLoading', (loading) => {
    const btn = document.getElementById('refresh-btn');
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? 'Loading…' : 'Refresh';
    }
    updateStatus();
  });

  store.subscribe('isOffline', (offline) => {
    const pill = document.getElementById('offline-pill');
    if (pill) pill.classList.toggle('hidden', !offline);
  });
  // Initial paint
  const initOffline = store.get('isOffline');
  if (initOffline) document.getElementById('offline-pill')?.classList.remove('hidden');
}

function updateStatus() {
  const el = document.getElementById('refresh-status');
  if (!el) return;
  const time = store.get('lastFetchTime');
  if (!time) {
    el.textContent = '';
    return;
  }
  const ago = timeAgo(time);
  if (store.get('isLoading')) {
    el.textContent = `Updating… (last ${ago})`;
  } else {
    el.textContent = `Updated ${ago}`;
    el.title = formatDate(time);
  }
}

function renderCategoryFilters() {
  const container = document.getElementById('type-filters');
  if (!container) return;

  const selected = store.get('selectedCategories');

  container.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => {
    const isChecked = selected.includes(key);
    const checkedClass = isChecked ? 'filter-chip--checked' : '';
    return `
      <label class="filter-chip ${checkedClass}" style="--filter-chip-color:${cat.color};">
        <input type="checkbox" value="${key}" ${isChecked ? 'checked' : ''}
               class="type-filter-cb sr-only"
               aria-label="${cat.label}" />
        <span class="filter-chip__dot" style="background:${cat.color};" aria-hidden="true"></span>
        <span>${cat.label}</span>
      </label>
    `;
  }).join('');

  container.addEventListener('change', (e) => {
    const checked = [...container.querySelectorAll('.type-filter-cb:checked')].map(cb => cb.value);
    if (checked.length > 0) {
      store.set('selectedCategories', checked);
      document.dispatchEvent(new CustomEvent('tt:categories-changed', { detail: checked }));
    } else {
      e.target.checked = true;
      return;
    }
    container.querySelectorAll('.filter-chip').forEach(chip => {
      const cb = chip.querySelector('.type-filter-cb');
      chip.classList.toggle('filter-chip--checked', cb.checked);
    });
  });
}
