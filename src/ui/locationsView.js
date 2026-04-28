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
      <select id="location-select" class="locations__select" title="Active location">
        ${options}
      </select>
      <input type="number" id="radius-input" class="locations__radius"
             min="10" max="2000" step="10" value="${radius}"
             title="Radius (miles)" />
      <span class="locations__unit">mi</span>
      <button class="btn btn--ghost btn--sm" id="add-location-btn" title="Add a saved location">+</button>
      ${activeId ? `<button class="btn btn--ghost btn--sm" id="remove-location-btn" title="Remove this location">×</button>` : ''}
    </div>
  `;
}

function onClick(e) {
  if (e.target.closest('#add-location-btn')) {
    addLocation();
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

async function addLocation() {
  const useGps = confirm('Use my current location? (Cancel to enter coordinates manually.)');
  if (useGps && 'geolocation' in navigator) {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
      });
      const label = prompt('Label for this location:', 'Home') || 'My location';
      saveLocation({ label, lat: pos.coords.latitude, lon: pos.coords.longitude });
      return;
    } catch (e) {
      alert('Could not get location: ' + e.message);
    }
  }

  const label = prompt('Location label (e.g. "Tulsa"):');
  if (!label) return;
  const latStr = prompt('Latitude (e.g. 36.15):');
  const lonStr = prompt('Longitude (e.g. -95.99):');
  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    alert('Invalid coordinates.');
    return;
  }
  saveLocation({ label, lat, lon });
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

/** Get the currently active location object, or null. */
export function getActiveLocation() {
  const id = store.get('activeLocationId');
  if (!id) return null;
  return store.get('savedLocations').find(l => l.id === id) || null;
}
