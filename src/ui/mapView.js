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

  // If the user already selected a product (e.g. from the feed) but its
  // GPS layer wasn't on the map yet, the focus event was a no-op. Now
  // that markersById is fresh, retry — handles the click-before-parsed
  // race when detail loads asynchronously.
  const selectedId = store.get('selectedProductId');
  if (selectedId && markersById.has(selectedId)) {
    focusSelected(selectedId);
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
  // flyTo / flyToBounds give a smooth animated pan rather than the abrupt
  // jump of setView / fitBounds — better UX when bouncing between feed cards.
  if (layer.getBounds) {
    map.flyToBounds(layer.getBounds().pad(0.5), { maxZoom: 10, duration: 0.6 });
  } else if (layer.getLatLng) {
    map.flyTo(layer.getLatLng(), Math.max(map.getZoom(), 9), { duration: 0.6 });
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
