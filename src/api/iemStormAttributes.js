/**
 * Iowa Environmental Mesonet — current NEXRAD storm-cell fetcher.
 *
 * IEM continuously parses NEXRAD Level III "Storm Tracking Information"
 * (NST) messages from every WSR-88D radar in the network and publishes
 * the full storm-attribute table as a public GeoJSON feed at:
 *
 *   https://mesonet.agron.iastate.edu/geojson/nexrad_attr.geojson
 *
 * Each feature's properties (verified against a real response):
 *   nexrad        radar ID (e.g. "DFW")
 *   storm_id      cell label assigned by the radar (e.g. "V0")
 *   azimuth       degrees from radar
 *   range         nautical miles from radar
 *   tvs           "NONE" | "TVS" | "ETVS"
 *   meso          "NONE" | "1".."9" (numeric strength when present)
 *   posh          probability of severe hail (>= 1"), 0–100
 *   poh           probability of any hail, 0–100
 *   max_size      max estimated hail size in inches
 *   vil           vertically integrated liquid (kg/m^2 proxy)
 *   max_dbz       max reflectivity in dBZ
 *   max_dbz_height  height of max DBZ in **thousands of feet** (kft)
 *   top           storm top in **thousands of feet** (kft)
 *   drct          forecast direction in degrees (heading)
 *   sknt          forecast speed in **knots**
 *   valid         ISO timestamp of the volume scan
 *
 * This is the same data RadarOmega / WeatherWise / RadarScope show when
 * you tap a storm cell. We surface it as clickable markers on the map.
 */

const KNOTS_TO_MPH = 1.15077945;

const URL_CANDIDATES = [
  'https://mesonet.agron.iastate.edu/geojson/nexrad_attr.geojson'
];

/**
 * Fetch all currently-active NEXRAD storm cells with their attributes.
 * @returns {Promise<{cells: Array<StormCell>, error: Error|null}>}
 *
 * @typedef {Object} StormCell
 * @property {string} id           // storm_id from radar (e.g. "V0")
 * @property {number} lat
 * @property {number} lon
 * @property {string} radar        // "DFW", "KOHX", etc.
 * @property {string|null} time    // ISO timestamp of the volume scan
 * @property {boolean} hasTvs
 * @property {boolean} hasMeso
 * @property {number|null} maxDbz       // dBZ
 * @property {number|null} maxDbzHeight // kft
 * @property {number|null} topHeight    // kft
 * @property {number|null} poh          // 0–100, prob of any hail
 * @property {number|null} posh         // 0–100, prob of severe hail (>= 1")
 * @property {number|null} hailSize     // inches
 * @property {number|null} vil          // VIL, storm-intensity proxy
 * @property {number|null} speed        // mph (converted from knots)
 * @property {number|null} direction    // degrees, heading
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

    // Speed: IEM returns knots; convert to mph at the parser boundary so
    // consumers can treat the value as plain mph.
    const sknt = numOrNull(props.sknt ?? props.forecast_speed ?? props.SPEED);
    const speedMph = sknt != null ? sknt * KNOTS_TO_MPH : null;

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
      poh: numOrNull(props.poh ?? props.HAILPROB ?? props.hail_prob),
      posh: numOrNull(props.posh),
      hailSize: numOrNull(props.max_size ?? props.maxhsize ?? props.HAILSIZE ?? props.hail_size),
      vil: numOrNull(props.vil),
      speed: speedMph,
      direction: numOrNull(props.drct ?? props.forecast_direction ?? props.DRCT)
    });
  });

  return cells;
}

function numOrNull(v) {
  if (v == null || v === '' || v === 'N/A') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

