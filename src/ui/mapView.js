import store from '../state/store.js';
import { MARKER_COLORS, CATEGORIES } from '../config/constants.js';
import { escapeHtml } from '../utils/formatting.js';

let map = null;
let markerLayer = null;
let polygonLayer = null;
let currentTileLayer = null;
let highlightLayer = null;

const MAP_TILES = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar',
    maxZoom: 18
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19
  }
};

const TILE_ORDER = ['dark', 'satellite', 'light'];
let currentTileIndex = 0;

/**
 * Initialize the Leaflet map centered on CONUS.
 */
export function initMap() {
  map = L.map('map-container', {
    center: [39.0, -95.0],
    zoom: 4,
    zoomControl: true
  });

  switchTileLayer('dark');
  addTileToggleControl();

  // Layer groups for markers, polygons, and highlights
  markerLayer = L.layerGroup().addTo(map);
  polygonLayer = L.layerGroup().addTo(map);
  highlightLayer = L.layerGroup().addTo(map);

  // React to marker data changes
  store.subscribe('tornadoMarkers', updateMarkers);

  // Popup click delegation for "View Details" links
  map.on('popupopen', (e) => {
    const popup = e.popup.getElement();
    if (!popup) return;
    popup.addEventListener('click', (ev) => {
      const link = ev.target.closest('.popup-detail-link');
      if (link) {
        const id = link.dataset.productId;
        store.set('selectedProductId', id);
        document.dispatchEvent(new CustomEvent('tt:product-selected', { detail: id }));
      }
    });
  });
}

function switchTileLayer(mode) {
  const config = MAP_TILES[mode] || MAP_TILES.dark;
  if (currentTileLayer) map.removeLayer(currentTileLayer);
  currentTileLayer = L.tileLayer(config.url, {
    attribution: config.attribution,
    maxZoom: config.maxZoom
  }).addTo(map);
}

function addTileToggleControl() {
  const TileControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-style-control');
      const btn = L.DomUtil.create('a', '', container);
      btn.href = '#';
      btn.title = 'Change map style';
      btn.innerHTML = '<span class="map-style-icon">Map</span>';
      btn.setAttribute('role', 'button');
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(btn, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        currentTileIndex = (currentTileIndex + 1) % TILE_ORDER.length;
        switchTileLayer(TILE_ORDER[currentTileIndex]);
      });
      return container;
    }
  });
  map.addControl(new TileControl());
}

/**
 * Get the shape CSS class modifier for a category.
 */
function shapeClass(category) {
  const shape = CATEGORIES[category]?.shape;
  switch (shape) {
    case 'diamond':  return 'tornado-marker__pin--diamond';
    case 'square':   return 'tornado-marker__pin--square';
    case 'triangle': return 'tornado-marker__pin--triangle';
    default:         return '';
  }
}

/**
 * Update map markers based on tornadoMarkers in store.
 */
function updateMarkers() {
  if (!map || !markerLayer || !polygonLayer) return;

  markerLayer.clearLayers();
  polygonLayer.clearLayers();

  const markers = store.get('tornadoMarkers') || [];
  if (markers.length === 0) return;

  const bounds = [];

  markers.forEach(m => {
    if (!m.lat || !m.lon) return;

    bounds.push([m.lat, m.lon]);

    // Color by category type
    const color = MARKER_COLORS[m.category] || MARKER_COLORS.DEFAULT;

    const extraClass = shapeClass(m.category);
    const letter = CATEGORIES[m.category]?.letter || '?';

    // Create marker with custom icon
    const icon = L.divIcon({
      className: 'tornado-marker',
      html: `<div class="tornado-marker__pin ${extraClass}" style="background:${color};box-shadow:0 0 12px ${color}80;">
        ${letter}
      </div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -11]
    });

    const marker = L.marker([m.lat, m.lon], { icon });

    // Popup content
    const popupParts = [];
    if (m.efRating) popupParts.push(`<strong style="color:${color}">${m.efRating}</strong>`);
    if (m.label) popupParts.push(escapeHtml(m.label));
    if (m.county) popupParts.push(`${escapeHtml(m.county)} County`);
    if (m.pathLength) popupParts.push(`Path: ${escapeHtml(m.pathLength)}`);
    popupParts.push(`<span class="popup-detail-link" data-product-id="${escapeHtml(m.productId)}">View Details &rarr;</span>`);

    marker.bindPopup(popupParts.join('<br>'));
    markerLayer.addLayer(marker);

    // Draw polygon if available (TOR warnings)
    if (m.polygon && m.polygon.length >= 3) {
      const latlngs = m.polygon.map(p => [p.lat, p.lon]);
      const polyColor = MARKER_COLORS[m.category] || MARKER_COLORS.WARNING;
      const poly = L.polygon(latlngs, {
        color: polyColor,
        weight: 2,
        fillOpacity: 0.15,
        className: 'warning-polygon'
      });
      polygonLayer.addLayer(poly);
    }

    // Draw damage survey path line
    if (m.pathLine && m.pathLine.length === 2) {
      const latlngs = m.pathLine.map(p => [p.lat, p.lon]);
      const lineColor = MARKER_COLORS[m.category] || MARKER_COLORS.DEFAULT;
      const polyline = L.polyline(latlngs, {
        color: lineColor, weight: 3, opacity: 0.8, dashArray: '8, 4'
      });
      polygonLayer.addLayer(polyline);
      bounds.push([m.pathLine[1].lat, m.pathLine[1].lon]);
    }
  });

  // Auto-fit map to markers
  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  }
}

/**
 * Zoom the map to a specific location, polygon, or path line.
 * @param {{ lat?: number, lon?: number, polygon?: Array, pathLine?: Array }} opts
 */
export function zoomToLocation({ lat, lon, polygon, pathLine } = {}) {
  if (!map) return;
  clearHighlight();

  if (polygon && polygon.length >= 3) {
    const latlngs = polygon.map(p => [p.lat, p.lon]);
    const poly = L.polygon(latlngs, {
      color: '#f59e0b',
      weight: 3,
      fillOpacity: 0.2
    });
    highlightLayer.addLayer(poly);
    map.fitBounds(poly.getBounds(), { padding: [40, 40] });
  } else if (pathLine && pathLine.length === 2) {
    const latlngs = pathLine.map(p => [p.lat, p.lon]);
    const line = L.polyline(latlngs, {
      color: '#f59e0b', weight: 4, opacity: 0.9, dashArray: '8, 4'
    });
    highlightLayer.addLayer(line);
    map.fitBounds(line.getBounds(), { padding: [40, 40], maxZoom: 12 });
  } else if (lat && lon) {
    map.setView([lat, lon], 10);
    const marker = L.circleMarker([lat, lon], {
      radius: 10,
      color: '#f59e0b',
      weight: 3,
      fillOpacity: 0.3
    });
    highlightLayer.addLayer(marker);
  }
}

/**
 * Zoom the map to fit multiple tornado locations, highlighting each.
 * @param {Array<{lat: number, lon: number, polygon?: Array}>} tornadoes
 */
export function zoomToLocations(tornadoes) {
  if (!map || !tornadoes?.length) return;
  clearHighlight();

  const bounds = [];

  tornadoes.forEach(t => {
    if (t.polygon && t.polygon.length >= 3) {
      const latlngs = t.polygon.map(p => [p.lat, p.lon]);
      const poly = L.polygon(latlngs, {
        color: '#f59e0b',
        weight: 3,
        fillOpacity: 0.2
      });
      highlightLayer.addLayer(poly);
      bounds.push(...latlngs);
    } else if (t.startLat && t.endLat) {
      const latlngs = [[t.startLat, t.startLon], [t.endLat, t.endLon]];
      const line = L.polyline(latlngs, {
        color: '#f59e0b', weight: 4, opacity: 0.9, dashArray: '8, 4'
      });
      highlightLayer.addLayer(line);
      bounds.push(...latlngs);
    } else if (t.lat && t.lon) {
      const marker = L.circleMarker([t.lat, t.lon], {
        radius: 10,
        color: '#f59e0b',
        weight: 3,
        fillOpacity: 0.3
      });
      highlightLayer.addLayer(marker);
      bounds.push([t.lat, t.lon]);
    }
  });

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }
}

/**
 * Clear highlight layer.
 */
export function clearHighlight() {
  if (highlightLayer) highlightLayer.clearLayers();
}

/**
 * Tell Leaflet to recalculate its container size after a CSS layout change.
 */
export function invalidateMapSize() {
  if (!map) return;
  setTimeout(() => map.invalidateSize(), 50);
}

/**
 * Get the map instance (for external use).
 */
export function getMap() {
  return map;
}
