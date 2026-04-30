/**
 * Map view — renders TOR warning polygons, PNS tracks, LSR points, alert
 * polygons (warnings + watches + emergencies), and an optional NEXRAD
 * radar overlay on a single Leaflet map.
 *
 * Z-order (bottom → top):
 *   base tiles → radar tiles → alert/feature layers
 *
 * Selection is bidirectional: clicking a marker selects the product, and
 * selecting from the feed pans/zooms the map.
 */
import L from 'leaflet';
import store from '../state/store.js';
import { CATEGORIES } from '../config/constants.js';
import { productCache } from '../modules/productCache.js';
import { getActiveLocation } from './locationsView.js';
import { categoricalColor, categoricalName } from '../api/spcOutlook.js';

let map = null;
let layerGroup = null;
let outlookLayer = null;
let radarLayer = null;
let stormCellsLayer = null;
let radiusLayer = null;
let hasFitOnce = false;
const markersById = new Map();

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '© OpenStreetMap';

// NEXRAD CONUS reflectivity (N0Q product) via Iowa Environmental Mesonet's
// public tile cache. Updates every ~5 min; reliable academic source.
const NEXRAD_TILE_URL = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png';
const NEXRAD_ATTR = 'NEXRAD radar via <a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noopener">Iowa Environmental Mesonet</a>';

export function initMapView() {
  const container = document.getElementById('map-panel');
  if (!container) return;

  map = L.map(container, {
    center: [37.5, -95],
    zoom: 4,
    preferCanvas: true
  });
  L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 12 }).addTo(map);
  layerGroup = L.layerGroup().addTo(map);

  applyRadarVisibility();
  addRadarControl();
  addOutlookControl();

  store.subscribe('products', renderMap);
  store.subscribe('selectedProductId', focusSelected);
  store.subscribe('activeLocationId', renderRadius);
  store.subscribe('radiusMiles', renderRadius);
  store.subscribe('radarVisible', applyRadarVisibility);
  store.subscribe('outlook', renderOutlook);
  store.subscribe('outlookVisible', renderOutlook);
  store.subscribe('stormCells', renderStormCells);

  document.addEventListener('tt:map-toggled', () => {
    setTimeout(() => map.invalidateSize(), 50);
  });

  window.addEventListener('tt:map-resized', () => map.invalidateSize());

  renderMap();
  renderRadius();
}

function renderMap() {
  if (!map || !layerGroup) return;

  layerGroup.clearLayers();
  markersById.clear();

  const products = store.get('products') || [];

  // Z-order: watches first (background), then warnings/PDS/alerts, then
  // emergencies (top). Surveys/LSR points last so they're clickable above.
  const sorted = [...products].sort((a, b) => layerOrder(a) - layerOrder(b));

  const bounds = L.latLngBounds([]);
  let added = 0;

  sorted.forEach(item => {
    const layer = buildLayerFor(item);
    if (!layer) return;
    layer.addTo(layerGroup);
    markersById.set(item.id, layer);
    added++;

    if (layer.getBounds) {
      bounds.extend(layer.getBounds());
    } else if (layer.getLatLng) {
      bounds.extend(layer.getLatLng());
    }
  });

  if (!hasFitOnce && added > 0 && bounds.isValid()) {
    map.fitBounds(bounds.pad(0.1), { animate: false, maxZoom: 8 });
    hasFitOnce = true;
  }
}

/**
 * Render priority — lower numbers render first (bottom of the stack).
 * Watches are background context; emergencies should be drawn on top.
 */
function layerOrder(item) {
  switch (item._category) {
    case 'WATCH':     return 0;
    case 'WARNING':   return 1;
    case 'PDS':       return 2;
    case 'ALERT':     return 3;
    case 'EMERGENCY': return 4;
    case 'SURVEY':    return 5;
    case 'LSR':       return 6;
    default:          return 1;
  }
}

function buildLayerFor(item) {
  const color = item._category && CATEGORIES[item._category]
    ? CATEGORIES[item._category].color
    : '#6b7280';

  // Watch (broad multi-county polygon) — distinct dashed amber outline
  if (item._category === 'WATCH' && item._alert?.polygon?.length) {
    return polygonLayer(item, item._alert.polygon, color, {
      weight: 1.5,
      dashArray: '6,6',
      fillOpacity: 0.05
    });
  }

  // Active emergency — heavier stroke + higher fill opacity
  if (item._category === 'EMERGENCY' && item._alert?.polygon?.length) {
    return polygonLayer(item, item._alert.polygon, color, {
      weight: 3,
      fillOpacity: 0.4
    });
  }

  // Active warning / PDS warning
  if (item._alert?.polygon?.length) {
    return polygonLayer(item, item._alert.polygon, color, {
      weight: 2,
      fillOpacity: item._isPDS ? 0.35 : 0.2
    });
  }

  // Cached parsed data — re-fetch from in-memory cache
  const cached = productCache.get(item.id);
  const tornadoes = cached?.parsedData?.tornadoes || [];

  // TOR warning with polygon
  const torWithPoly = tornadoes.find(t => t.polygon?.length);
  if (torWithPoly) {
    return polygonLayer(item, torWithPoly.polygon, color, {
      weight: 2,
      fillOpacity: item._isPDS ? 0.35 : 0.15
    });
  }

  const trackTornado = tornadoes.find(t => t.startLat != null && t.endLat != null);
  if (trackTornado) {
    return trackLayer(item, trackTornado, color);
  }

  const point = tornadoes.find(t => t.lat != null);
  if (point) {
    return pointLayer(item, point.lat, point.lon, color);
  }

  return null;
}

function polygonLayer(item, polygon, color, opts = {}) {
  const latLngs = polygon.map(p => [p.lat, p.lon]);
  const layer = L.polygon(latLngs, {
    color,
    weight: opts.weight ?? 2,
    fillColor: color,
    fillOpacity: opts.fillOpacity ?? 0.2,
    dashArray: opts.dashArray
  });
  bindClick(layer, item);
  return layer;
}

function trackLayer(item, t, color) {
  const line = L.polyline(
    [[t.startLat, t.startLon], [t.endLat, t.endLon]],
    { color, weight: 4, opacity: 0.85 }
  );
  const start = L.circleMarker([t.startLat, t.startLon], {
    color, fillColor: color, fillOpacity: 0.9, weight: 1, radius: 6
  });
  bindClick(start, item);
  bindClick(line, item);
  const group = L.featureGroup([line, start]);
  group._proxyClick = () => bindClick(group, item);
  return group;
}

function pointLayer(item, lat, lon, color) {
  const m = L.circleMarker([lat, lon], {
    color, fillColor: color, fillOpacity: 0.85, weight: 1.5, radius: 7
  });
  bindClick(m, item);
  return m;
}

function bindClick(layer, item) {
  const cat = item._category && CATEGORIES[item._category]?.label;
  layer.bindTooltip(`${cat || item.productCode}: ${item.productName || ''}`);
  layer.on('click', () => {
    store.set('selectedProductId', item.id);
    document.dispatchEvent(new CustomEvent('tt:product-selected', { detail: item.id }));
  });
}

function focusSelected(id) {
  if (!map || !id) return;
  const layer = markersById.get(id);
  if (!layer) return;
  if (layer.getBounds) {
    map.fitBounds(layer.getBounds().pad(0.5), { maxZoom: 10 });
  } else if (layer.getLatLng) {
    map.setView(layer.getLatLng(), Math.max(map.getZoom(), 7));
  }
}

function renderRadius() {
  if (!map) return;
  if (radiusLayer) {
    map.removeLayer(radiusLayer);
    radiusLayer = null;
  }
  const loc = getActiveLocation();
  if (!loc) return;
  const radiusMeters = (store.get('radiusMiles') || 100) * 1609.34;
  radiusLayer = L.circle([loc.lat, loc.lon], {
    radius: radiusMeters,
    color: '#0ea5e9',
    weight: 1.5,
    fillColor: '#0ea5e9',
    fillOpacity: 0.05
  }).addTo(map);
}

// ── Radar overlay ─────────────────────────────────────────────────────

function applyRadarVisibility() {
  if (!map) return;
  const visible = !!store.get('radarVisible');
  if (visible && !radarLayer) {
    radarLayer = L.tileLayer(NEXRAD_TILE_URL, {
      attribution: NEXRAD_ATTR,
      opacity: 0.6,
      maxZoom: 12,
      updateWhenIdle: true
    });
    radarLayer.addTo(map);
    // Keep the radar below the alert/feature layers
    if (radarLayer.getContainer) {
      const el = radarLayer.getContainer();
      if (el) el.style.zIndex = 250;
    }
  } else if (!visible && radarLayer) {
    map.removeLayer(radarLayer);
    radarLayer = null;
  }
  refreshRadarControl();
}

function addRadarControl() {
  const RadarControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control radar-toggle');
      btn.type = 'button';
      btn.title = 'Toggle NEXRAD radar';
      btn.setAttribute('aria-pressed', String(!!store.get('radarVisible')));
      btn.textContent = 'Radar';
      L.DomEvent.on(btn, 'click', (e) => {
        L.DomEvent.stopPropagation(e);
        const next = !store.get('radarVisible');
        store.set('radarVisible', next);
      });
      this._btn = btn;
      return btn;
    }
  });
  const ctrl = new RadarControl();
  ctrl.addTo(map);
  // Stash the button so refreshRadarControl can update aria-pressed
  map._radarControlBtn = ctrl._btn;
  refreshRadarControl();
}

function refreshRadarControl() {
  const btn = map?._radarControlBtn;
  if (!btn) return;
  const visible = !!store.get('radarVisible');
  btn.setAttribute('aria-pressed', String(visible));
  btn.classList.toggle('radar-toggle--on', visible);
}

// ── SPC outlook overlay ────────────────────────────────────────────────

function renderOutlook() {
  if (!map) return;

  if (outlookLayer) {
    map.removeLayer(outlookLayer);
    outlookLayer = null;
  }
  refreshOutlookControl();

  if (!store.get('outlookVisible')) return;
  const outlook = store.get('outlook');
  const features = outlook?.categorical || [];
  if (features.length === 0) return;

  outlookLayer = L.layerGroup();
  features.forEach(feature => {
    const lbl = feature?.properties?.LABEL;
    const color = categoricalColor(lbl);
    const layer = geoJsonToLayers(feature.geometry, {
      color,
      weight: 1,
      fillColor: color,
      fillOpacity: 0.18
    });
    if (layer) {
      layer.bindTooltip(`SPC ${categoricalName(lbl)}`);
      outlookLayer.addLayer(layer);
    }
  });
  outlookLayer.addTo(map);

  // Z-order: outlook above base + radar but below alert/feature layers
  if (outlookLayer.getLayers().length) {
    outlookLayer.getLayers().forEach(l => l.bringToBack());
  }
  if (radarLayer?.getContainer) {
    // Keep radar below outlook
    radarLayer.getContainer().style.zIndex = 250;
  }
}

/**
 * Convert a GeoJSON Polygon/MultiPolygon geometry into a Leaflet layer.
 * Used for SPC outlook features which can be either type.
 */
function geoJsonToLayers(geometry, style) {
  if (!geometry) return null;
  if (geometry.type === 'Polygon') {
    const ring = (geometry.coordinates?.[0] || []).map(([lon, lat]) => [lat, lon]);
    return ring.length ? L.polygon(ring, style) : null;
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = (geometry.coordinates || [])
      .map(poly => (poly?.[0] || []).map(([lon, lat]) => [lat, lon]))
      .filter(ring => ring.length);
    return polys.length ? L.polygon(polys, style) : null;
  }
  return null;
}

function addOutlookControl() {
  const OutlookControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control outlook-toggle');
      btn.type = 'button';
      btn.title = 'Toggle SPC Day 1 outlook';
      btn.setAttribute('aria-pressed', String(!!store.get('outlookVisible')));
      btn.textContent = 'Outlook';
      L.DomEvent.on(btn, 'click', (e) => {
        L.DomEvent.stopPropagation(e);
        store.set('outlookVisible', !store.get('outlookVisible'));
      });
      this._btn = btn;
      return btn;
    }
  });
  const ctrl = new OutlookControl();
  ctrl.addTo(map);
  map._outlookControlBtn = ctrl._btn;
  refreshOutlookControl();
}

function refreshOutlookControl() {
  const btn = map?._outlookControlBtn;
  if (!btn) return;
  const visible = !!store.get('outlookVisible');
  btn.setAttribute('aria-pressed', String(visible));
  btn.classList.toggle('outlook-toggle--on', visible);
}

// ── Radar storm cells ────────────────────────────────────────────────
//
// Each NEXRAD volume scan publishes a Storm Tracking Information table
// (storm cells with attributes — dBZ, top, motion, hail, mesocyclone,
// TVS). We render every cell as a small marker color-coded by its
// highest-severity flag; clicking opens a popup with the full readout
// — the same surface RadarOmega/WeatherWise show.

// Cells whose volume scan is older than this are considered stale —
// the storm has likely dissipated, the radar went offline, or the cell
// moved beyond range. NEXRAD scans every ~5 min so 15 min is a safe
// "still currently active" window.
const STALE_CELL_MS = 15 * 60 * 1000;

function renderStormCells() {
  if (!map) return;

  if (stormCellsLayer) {
    map.removeLayer(stormCellsLayer);
    stormCellsLayer = null;
  }

  const cells = store.get('stormCells') || [];
  if (cells.length === 0) return;

  // Two render-time filters:
  //   - drop the 'plain' tier (no TVS, no meso, no severe hail) — those
  //     are weak non-rotating cells that just add visual noise
  //   - drop stale cells whose last NEXRAD scan was > 15 min ago.
  //     Cells without a parseable timestamp are treated as stale too —
  //     we can't verify they're current, so don't put them on the map.
  // The full IEM payload is still in the store for the stats-bar count.
  const now = Date.now();
  const visibleCells = cells.filter(c => {
    if (cellTier(c) === 'plain') return false;
    const scanMs = c.time ? new Date(c.time).getTime() : NaN;
    if (!Number.isFinite(scanMs)) return false;
    if (now - scanMs > STALE_CELL_MS) return false;
    return true;
  });
  if (visibleCells.length === 0) return;

  stormCellsLayer = L.layerGroup();
  visibleCells.forEach(cell => {
    const marker = buildStormCellMarker(cell);
    if (marker) stormCellsLayer.addLayer(marker);
  });
  stormCellsLayer.addTo(map);
}

function buildStormCellMarker(cell) {
  const tier = cellTier(cell);
  // Larger markers for higher-tier cells; the tap-target ends up larger
  // than the visible radius thanks to Leaflet's touch tolerance.
  const radius = tier === 'tvs' ? 11
               : tier === 'meso' ? 8
               : tier === 'hail' ? 7
               : 6;
  const marker = L.circleMarker([cell.lat, cell.lon], {
    radius,
    color: tier === 'tvs' ? '#ef4444'
         : tier === 'meso' ? '#f97316'
         : tier === 'hail' ? '#facc15'
         : '#94a3b8',
    weight: tier === 'tvs' ? 2.5 : 1.5,
    fillColor: tier === 'tvs' ? '#ef4444'
             : tier === 'meso' ? '#f97316'
             : tier === 'hail' ? '#facc15'
             : '#cbd5e1',
    fillOpacity: tier === 'tvs' ? 0.55 : tier === 'plain' ? 0.25 : 0.45,
    className: tier === 'tvs' ? 'storm-cell storm-cell--tvs' : 'storm-cell'
  });

  marker.bindPopup(renderStormCellPopup(cell), {
    className: 'storm-cell-popup',
    minWidth: 220,
    maxWidth: 260
  });

  return marker;
}

/** Highest-severity tier that's set on the cell. */
function cellTier(cell) {
  if (cell.hasTvs) return 'tvs';
  if (cell.hasMeso) return 'meso';
  // POSH (severe hail prob) and POH (any hail prob) are both 0-100;
  // POSH crossing 50% is a meaningful threshold for severe-criteria hail.
  const severeHail = (cell.posh != null && cell.posh >= 50)
    || (cell.poh != null && cell.poh >= 70)
    || (cell.hailSize != null && cell.hailSize >= 1);
  if (severeHail) return 'hail';
  return 'plain';
}

function renderStormCellPopup(cell) {
  const fields = [];

  if (cell.hasTvs) {
    fields.push({ label: 'TVS', value: 'Detected', highlight: 'tvs' });
  }
  if (cell.hasMeso) {
    fields.push({ label: 'Mesocyclone', value: 'Detected', highlight: 'meso' });
  }
  if (cell.maxDbz != null) {
    fields.push({ label: 'Max reflectivity', value: `${cell.maxDbz.toFixed(0)} dBZ` });
  }
  if (cell.topHeight != null) {
    // IEM reports `top` in thousands of feet — multiply to render in ft.
    fields.push({ label: 'Storm top', value: `${(cell.topHeight * 1000).toLocaleString()} ft` });
  }
  // Skip motion when speed AND direction are both zero — IEM's marker for
  // "stationary or unknown movement" rather than "actually 0 mph at 0°".
  const isMotionless = (cell.speed == null || cell.speed === 0)
    && (cell.direction == null || cell.direction === 0);
  if (!isMotionless && cell.speed != null && cell.direction != null) {
    fields.push({ label: 'Motion', value: `${cell.direction.toFixed(0)}° at ${cell.speed.toFixed(0)} mph` });
  } else if (!isMotionless && cell.speed != null) {
    fields.push({ label: 'Speed', value: `${cell.speed.toFixed(0)} mph` });
  }
  if (cell.poh != null && cell.poh > 0) {
    const sizePart = cell.hailSize != null && cell.hailSize >= 0.25
      ? ` · max ${cell.hailSize.toFixed(2)}″`
      : '';
    fields.push({ label: 'Hail prob', value: `${cell.poh}%${sizePart}` });
  }
  if (cell.posh != null && cell.posh > 0) {
    fields.push({ label: 'Severe hail prob', value: `${cell.posh}%`, highlight: cell.posh >= 50 ? 'hail' : null });
  }
  if (cell.vil != null) {
    fields.push({ label: 'VIL', value: `${cell.vil} kg/m²` });
  }

  const cellId = cell.id ? escape(cell.id) : '?';
  const radar = escape(cell.radar);
  const tier = cellTier(cell);

  return `
    <div class="storm-cell-popup__inner">
      <div class="storm-cell-popup__header storm-cell-popup__header--${tier}">
        <strong>Cell ${cellId}</strong>
        <span class="storm-cell-popup__radar">${radar}</span>
      </div>
      <table class="storm-cell-popup__grid">
        ${fields.map(f => `
          <tr>
            <td>${f.label}</td>
            <td class="${f.highlight ? 'storm-cell-popup__hl-' + f.highlight : ''}">${escape(String(f.value))}</td>
          </tr>
        `).join('')}
      </table>
      ${cell.time ? `<div class="storm-cell-popup__time">Updated ${escape(cell.time)}</div>` : ''}
    </div>
  `;
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
