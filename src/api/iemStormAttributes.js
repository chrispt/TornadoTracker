/**
 * Iowa Environmental Mesonet — current NEXRAD storm-cell fetcher.
 *
 * IEM continuously parses NEXRAD Level III "Storm Tracking Information"
 * (NST) messages from every WSR-88D radar in the network and publishes
 * the full storm-attribute table as a public GeoJSON feed.
 *
 * Each storm cell carries Doppler-derived attributes:
 *   - max DBZ + height
 *   - storm top height
 *   - forecast motion (speed + direction)
 *   - hail probability + estimated max size
 *   - mesocyclone (MESO) flag
 *   - TVS (tornado vortex signature) flag
 *
 * This is the same data RadarOmega / WeatherWise / RadarScope show when
 * you tap a storm cell. We surface it as clickable markers on the map.
 *
 * URL note: IEM has several candidate endpoints for the aggregated
 * attribute table; we try them in order and use whichever returns a
 * parseable GeoJSON. Failure is non-fatal — the map keeps running, the
 * cell layer just stays empty.
 */

const URL_CANDIDATES = [
  'https://mesonet.agron.iastate.edu/geojson/nexrad_attr.geojson',
  'https://mesonet.agron.iastate.edu/geojson/storm_attr.geojson',
  'https://mesonet.agron.iastate.edu/cgi-bin/request/gis/nexrad_storm_attr.py?fmt=geojson'
];

/**
 * Fetch all currently-active NEXRAD storm cells with their attributes.
 * @returns {Promise<{cells: Array<StormCell>, error: Error|null}>}
 *
 * @typedef {Object} StormCell
 * @property {string} id           // storm_id from radar (e.g. "I9")
 * @property {number} lat
 * @property {number} lon
 * @property {string} radar        // KBMX, KOHX, etc.
 * @property {string|null} time    // ISO timestamp of the volume scan
 * @property {boolean} hasTvs
 * @property {boolean} hasMeso
 * @property {number|null} maxDbz       // dBZ
 * @property {number|null} maxDbzHeight // ft
 * @property {number|null} topHeight    // ft
 * @property {number|null} hailProb     // 0–100
 * @property {number|null} hailSize     // inches
 * @property {number|null} speed        // mph
 * @property {number|null} direction    // degrees, where the storm is heading
 */
export async function fetchStormCells() {
  let lastError = null;
  for (const url of URL_CANDIDATES) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) { lastError = new Error(`IEM ${res.status} for ${url}`); continue; }
      const data = await res.json();
      const cells = parseFeatureCollection(data);
      return { cells, error: null };
    } catch (e) {
      lastError = e;
    }
  }
  return { cells: [], error: lastError };
}

function parseFeatureCollection(data) {
  const features = data?.features;
  if (!Array.isArray(features)) return [];

  const cells = [];
  features.forEach(f => {
    const props = f?.properties || {};
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return;
    const [lon, lat] = coords;
    if (typeof lat !== 'number' || typeof lon !== 'number') return;

    const tvsField = (props.tvs ?? props.TVS ?? '').toString().toUpperCase();
    const mesoField = (props.meso ?? props.MESO ?? '').toString().toUpperCase();

    cells.push({
      id: props.storm_id || props.id || f.id || '',
      lat,
      lon,
      radar: props.nexrad || props.radar || props.STATION || 'NEXRAD',
      time: props.valid || props.utc_valid || props.observation_time || null,
      hasTvs: tvsField !== '' && tvsField !== 'NONE' && tvsField !== 'N/A' && tvsField !== '0',
      hasMeso: mesoField !== '' && mesoField !== 'NONE' && mesoField !== 'N/A' && mesoField !== '0',
      maxDbz: numOrNull(props.max_dbz ?? props.MAXDBZ),
      maxDbzHeight: numOrNull(props.max_dbz_height ?? props.MAX_DBZ_H),
      topHeight: numOrNull(props.top ?? props.TOP),
      hailProb: numOrNull(props.poh ?? props.HAILPROB ?? props.hail_prob),
      hailSize: numOrNull(props.maxhsize ?? props.HAILSIZE ?? props.hail_size),
      speed: numOrNull(props.forecast_speed ?? props.SPEED),
      direction: numOrNull(props.forecast_direction ?? props.DRCT)
    });
  });

  return cells;
}

function numOrNull(v) {
  if (v == null || v === '' || v === 'N/A') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
