import store from '../state/store.js';
import { CATEGORIES } from '../config/constants.js';
import { formatDate, timeAgo } from '../utils/formatting.js';

/**
 * Render the (now-minimal) app header: brand + offline pill + map toggle
 * + refresh + status. The category filter chips and scope (location +
 * office) controls live in the sidebar — see index.html.
 */
export function initHeader() {
  const header = document.getElementById('app-header');
  if (!header) return;

  header.innerHTML = `
    <div class="app-header__brand">
      <span class="app-header__mark" aria-hidden="true">&#x1F32A;</span>
      <span class="app-header__title">TornadoTracker</span>
    </div>
    <div class="app-header__actions">
      <span class="offline-pill hidden" id="offline-pill" role="status">
        Offline
      </span>
      <button class="btn btn--ghost btn--sm app-header__map-toggle" id="map-toggle-btn"
        aria-label="Toggle map" aria-pressed="true">
        Map
      </button>
      <button class="btn btn--primary btn--sm" id="refresh-btn" aria-label="Refresh now">
        Refresh
      </button>
      <span class="app-header__status" id="refresh-status"
        role="status" aria-live="polite"></span>
    </div>
  `;

  renderCategoryFilters();

  const officeInput = document.getElementById('office-filter');
  officeInput?.addEventListener('change', () => {
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
  if (store.get('isOffline')) document.getElementById('offline-pill')?.classList.remove('hidden');
}

function updateStatus() {
  const el = document.getElementById('refresh-status');
  if (!el) return;
  const time = store.get('lastFetchTime');
  if (!time) { el.textContent = ''; return; }
  const ago = timeAgo(time);
  if (store.get('isLoading')) {
    el.textContent = `Updating…`;
    el.title = `Last fetched ${ago}`;
  } else {
    el.textContent = ago;
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
