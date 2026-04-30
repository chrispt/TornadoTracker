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

  // Build the static row once; paintChips() handles all subsequent state.
  // The bulk button is rendered inside the chips row by paintChips so it
  // sits at the end of the flow rather than vertically centered next to
  // a wrapping chip stack.
  container.innerHTML = `<div class="sidebar__chips-row" id="chips-row"></div>`;

  paintChips();

  const chipsRow = document.getElementById('chips-row');

  // Per-chip toggle: keep the existing "can't uncheck last chip" guard
  // so an accidental click into a zero state bounces back. The bulk
  // button is the explicit path to clear everything.
  chipsRow.addEventListener('change', (e) => {
    const checked = [...chipsRow.querySelectorAll('.type-filter-cb:checked')].map(cb => cb.value);
    if (checked.length === 0) {
      e.target.checked = true;
      return;
    }
    store.set('selectedCategories', checked);
    document.dispatchEvent(new CustomEvent('tt:categories-changed', { detail: checked }));
  });

  // Bulk action via event delegation (paintChips re-renders the button).
  chipsRow.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-chip__bulk')) return;
    const allKeys = Object.keys(CATEGORIES);
    const current = store.get('selectedCategories') || [];
    const next = current.length === allKeys.length ? [] : allKeys;
    store.set('selectedCategories', next);
    document.dispatchEvent(new CustomEvent('tt:categories-changed', { detail: next }));
  });

  // Keep visuals in sync if categories are changed from anywhere.
  store.subscribe('selectedCategories', paintChips);
}

function paintChips() {
  const chipsRow = document.getElementById('chips-row');
  if (!chipsRow) return;

  const selected = store.get('selectedCategories') || [];
  const selectedSet = new Set(selected);
  const allKeys = Object.keys(CATEGORIES);
  const allChecked = allKeys.every(k => selectedSet.has(k));

  const chips = Object.entries(CATEGORIES).map(([key, cat]) => {
    const isChecked = selectedSet.has(key);
    const checkedClass = isChecked ? 'filter-chip--checked' : '';
    const label = cat.shortLabel || cat.label;
    return `
      <label class="filter-chip ${checkedClass}" style="--filter-chip-color:${cat.color};">
        <input type="checkbox" value="${key}" ${isChecked ? 'checked' : ''}
               class="type-filter-cb sr-only"
               aria-label="${cat.label}" />
        <span class="filter-chip__dot" style="background:${cat.color};" aria-hidden="true"></span>
        <span>${label}</span>
      </label>
    `;
  }).join('');

  const bulkLabel = allChecked ? 'Clear all' : 'Select all';
  const bulkButton = `
    <button type="button" class="filter-chip__bulk"
            aria-label="${bulkLabel} category filters">${bulkLabel}</button>
  `;

  chipsRow.innerHTML = chips + bulkButton;
}
