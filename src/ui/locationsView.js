/**
 * Saved locations + radius filter UI.
 *
 * Lives in the header; users can add a location (label + lat/lon, or "use my
 * location"), pick which one is active, and adjust the radius. When a
 * location is active, the feed is filtered to products within `radiusMiles`.
 *
 * The filter logic itself lives in main.js — this module owns the UI surface.
 */
import store from '../state/store.js';
import { escapeHtml } from '../utils/formatting.js';
import { showToast } from './toast.js';

export function initLocationsView() {
  const host = document.getElementById('locations-host');
  if (!host) return;

  render();

  store.subscribe('savedLocations', render);
  store.subscribe('activeLocationId', render);
  store.subscribe('radiusMiles', render);

  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
}

function render() {
  const host = document.getElementById('locations-host');
  if (!host) return;

  const locations = store.get('savedLocations') || [];
  const activeId = store.get('activeLocationId');
  const radius = store.get('radiusMiles');

  const options = ['<option value="">All regions</option>']
    .concat(locations.map(l =>
      `<option value="${escapeHtml(l.id)}" ${l.id === activeId ? 'selected' : ''}>
        ${escapeHtml(l.label)}
      </option>`
    )).join('');

  host.innerHTML = `
    <div class="locations">
      <select id="location-select" class="locations__select"
              aria-label="Active location">
        ${options}
      </select>
      <input type="number" id="radius-input" class="locations__radius"
             min="10" max="2000" step="10" value="${radius}"
             aria-label="Radius in miles" />
      <span class="locations__unit" aria-hidden="true">mi</span>
      <button class="btn btn--ghost btn--sm" id="add-location-btn"
              aria-label="Add a saved location">+</button>
      ${activeId
        ? `<button class="btn btn--ghost btn--sm" id="remove-location-btn"
                  aria-label="Remove this location">×</button>`
        : ''}
    </div>
  `;
}

function onClick(e) {
  if (e.target.closest('#add-location-btn')) {
    openAddLocationDialog();
  } else if (e.target.closest('#remove-location-btn')) {
    removeActiveLocation();
  }
}

function onChange(e) {
  if (e.target.id === 'location-select') {
    const id = e.target.value || null;
    store.set('activeLocationId', id);
    document.dispatchEvent(new CustomEvent('tt:location-changed'));
  } else if (e.target.id === 'radius-input') {
    const r = Math.max(10, Math.min(2000, Number(e.target.value) || 100));
    store.set('radiusMiles', r);
    document.dispatchEvent(new CustomEvent('tt:location-changed'));
  }
}

function openAddLocationDialog() {
  const existing = document.getElementById('add-location-dialog');
  if (existing) existing.remove();

  const dlg = document.createElement('dialog');
  dlg.id = 'add-location-dialog';
  dlg.className = 'modal';
  dlg.setAttribute('aria-labelledby', 'add-location-title');
  dlg.innerHTML = `
    <form method="dialog" class="modal__form">
      <h2 class="modal__title" id="add-location-title">Add saved location</h2>
      <p class="modal__hint">Used only on this device to filter the feed by distance. Coordinates never leave your browser.</p>

      <label class="modal__field">
        <span class="modal__label">Label</span>
        <input type="text" name="label" class="modal__input" required maxlength="40"
               placeholder="Home, Tulsa, etc." />
      </label>

      <div class="modal__row">
        <label class="modal__field">
          <span class="modal__label">Latitude</span>
          <input type="number" name="lat" class="modal__input" step="any"
                 min="-90" max="90" placeholder="36.15" />
        </label>
        <label class="modal__field">
          <span class="modal__label">Longitude</span>
          <input type="number" name="lon" class="modal__input" step="any"
                 min="-180" max="180" placeholder="-95.99" />
        </label>
      </div>

      <p class="modal__error" id="add-location-error" role="alert" hidden></p>

      <div class="modal__actions">
        <button type="button" class="btn btn--ghost" data-action="gps">Use my location</button>
        <span class="modal__spacer"></span>
        <button type="button" class="btn btn--ghost" data-action="cancel">Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>
  `;
  document.body.appendChild(dlg);

  const form = dlg.querySelector('form');
  const errorEl = dlg.querySelector('#add-location-error');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  dlg.addEventListener('click', async (e) => {
    const action = e.target.dataset?.action;
    if (action === 'cancel') {
      dlg.close();
    } else if (action === 'gps') {
      if (!('geolocation' in navigator)) {
        showError('Geolocation is not available in this browser.');
        return;
      }
      e.target.disabled = true;
      e.target.textContent = 'Locating…';
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
        });
        form.lat.value = pos.coords.latitude.toFixed(4);
        form.lon.value = pos.coords.longitude.toFixed(4);
        if (!form.label.value) form.label.value = 'My location';
        errorEl.hidden = true;
      } catch (err) {
        showError(`Could not get location: ${err.message}`);
      } finally {
        e.target.disabled = false;
        e.target.textContent = 'Use my location';
      }
    }
  });

  form.addEventListener('submit', (e) => {
    const label = form.label.value.trim();
    const lat = parseFloat(form.lat.value);
    const lon = parseFloat(form.lon.value);

    if (!label) {
      e.preventDefault();
      showError('Please enter a label.');
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      e.preventDefault();
      showError('Please enter valid coordinates, or use “Use my location”.');
      return;
    }

    saveLocation({ label, lat, lon });
    showToast(`Saved “${label}”`);
    // Let dialog close naturally via method="dialog"
  });

  dlg.addEventListener('close', () => dlg.remove());

  if (typeof dlg.showModal === 'function') {
    dlg.showModal();
  } else {
    dlg.setAttribute('open', '');
  }

  // Move focus into the dialog for keyboard users
  setTimeout(() => form.label.focus(), 0);
}

function saveLocation({ label, lat, lon }) {
  const id = `loc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const locations = [...store.get('savedLocations'), { id, label, lat, lon }];
  store.update({ savedLocations: locations, activeLocationId: id });
  document.dispatchEvent(new CustomEvent('tt:location-changed'));
}

function removeActiveLocation() {
  const activeId = store.get('activeLocationId');
  if (!activeId) return;
  const locations = store.get('savedLocations').filter(l => l.id !== activeId);
  store.update({ savedLocations: locations, activeLocationId: null });
  document.dispatchEvent(new CustomEvent('tt:location-changed'));
}

export function getActiveLocation() {
  const id = store.get('activeLocationId');
  if (!id) return null;
  return store.get('savedLocations').find(l => l.id === id) || null;
}
