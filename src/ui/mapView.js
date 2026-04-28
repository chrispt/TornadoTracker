/**
 * Map view — renders TOR warning polygons, PNS tracks, LSR points, and
 * active alert polygons on a single Leaflet map.
 *
 * The map subscribes to `products` and re-renders incrementally. Selection
 * is bidirectional: clicking a marker selects the product, and selecting
 * from the feed pans/zooms the map.
 */
import L from 'leaflet';
import store from '../state/store.js';
import { CATEGORIES } from '../config/constants.js';
import { productCache } from '../modules/productCache.js';
import { getActiveLocation } from './locationsView.js';

let map = null;
let layerGroup = null;
let radiusLayer = null;
let hasFitOnce = false;
const markersById = new Map();

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '© OpenStreetMap';

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

  store.subscribe('products', renderMap);
  store.subscribe('selectedProductId', focusSelected);
  store.subscribe('activeLocationId', renderRadius);
  store.subscribe('radiusMiles', renderRadius);

  document.addEventListener('tt:map-toggled', () => {
    setTimeout(() => map.invalidateSize(), 50);
  });

  renderMap();
  renderRadius();
}

function renderMap() {
  if (!map || !layerGroup) return;

  layerGroup.clearLayers();
  markersById.clear();

  const products = store.get('products') || [];

  const bounds = L.latLngBounds([]);
  let added = 0;

  products.forEach(item => {
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

  // Only auto-fit on first render with data — after that, leave the user's
  // pan/zoom alone. Selection still drives focusSelected().
  if (!hasFitOnce && added > 0 && bounds.isValid()) {
    map.fitBounds(bounds.pad(0.1), { animate: false, maxZoom: 8 });
    hasFitOnce = true;
  }
}

function buildLayerFor(item) {
  const color = item._category && CATEGORIES[item._category]
    ? CATEGORIES[item._category].color
    : '#6b7280';

  // Active alert: polygon
  if (item._alert?.polygon?.length) {
    return polygonLayer(item, item._alert.polygon, color, item._isPDS ? 0.35 : 0.2);
  }

  // Cached parsed data — re-fetch from in-memory cache
  const cached = productCache.get(item.id);
  const tornadoes = cached?.parsedData?.tornadoes || [];

  // TOR warning with polygon
  const torWithPoly = tornadoes.find(t => t.polygon?.length);
  if (torWithPoly) {
    return polygonLayer(item, torWithPoly.polygon, color, item._isPDS ? 0.35 : 0.15);
  }

  // PNS damage survey with start/end track
  const trackTornado = tornadoes.find(t => t.startLat != null && t.endLat != null);
  if (trackTornado) {
    return trackLayer(item, trackTornado, color);
  }

  // Single-point: parsed lat/lon, or no parse but has lat from any source
  const point = tornadoes.find(t => t.lat != null);
  if (point) {
    return pointLayer(item, point.lat, point.lon, color);
  }

  return null;
}

function polygonLayer(item, polygon, color, fillOpacity) {
  const latLngs = polygon.map(p => [p.lat, p.lon]);
  const layer = L.polygon(latLngs, {
    color, weight: 2, fillColor: color, fillOpacity
  });
  bindClick(layer, item);
  return layer;
}

function trackLayer(item, t, color) {
  const line = L.polyline(
    [[t.startLat, t.startLon], [t.endLat, t.endLon]],
    { color, weight: 4, opacity: 0.85 }
  );
  // Attach start marker as an icon for clicking
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
