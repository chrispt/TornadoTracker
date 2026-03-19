import store from '../state/store.js';
import { EF_SCALE, MARKER_COLORS } from '../config/constants.js';
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

    // Determine color
    let color;
    if (m.efRating && EF_SCALE[m.efRating]) {
      color = EF_SCALE[m.efRating].markerColor;
    } else {
      color = MARKER_COLORS[m.type] || MARKER_COLORS.DEFAULT;
    }

    // Create marker with custom icon
    const icon = L.divIcon({
      className: 'tornado-marker',
      html: `<div class="tornado-marker__pin" style="background:${color};box-shadow:0 0 12px ${color}80;">
        ${m.efRating ? m.efRating.replace('EF', '') : '?'}
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
      const poly = L.polygon(latlngs, {
        color: MARKER_COLORS.TOR || '#a855f7',
        weight: 2,
        fillOpacity: 0.15,
        className: 'warning-polygon'
      });
      polygonLayer.addLayer(poly);
    }
  });

  // Auto-fit map to markers
  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  }
}

/**
 * Zoom the map to a specific location or polygon.
 * @param {{ lat?: number, lon?: number, polygon?: Array<{lat: number, lon: number}> }} opts
 */
export function zoomToLocation({ lat, lon, polygon } = {}) {
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
