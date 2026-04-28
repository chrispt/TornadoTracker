/**
 * Iowa Environmental Mesonet — current NEXRAD storm-attribute fetcher.
 *
 * IEM continuously parses NEXRAD Level III "Storm Tracking Information"
 * (NST) messages from every WSR-88D radar in the network and publishes
 * the attribute table — including TVS (Tornado Vortex Signature),
 * mesocyclone (MESO), and hail-detection markers — as a public JSON /
 * GeoJSON feed.
 *
 * This is the genuine radar-detection signal: each TVS is a
 * Doppler-derived rotation marker tagged at a specific lat/lon,
 * regardless of whether NWS has yet upgraded that detection into a
 * Tornado Warning. So the count here can lead the warning stream by
 * ~30–60 s and may differ from the warning count in either direction.
 *
 * URL note: the exact IEM endpoint for the aggregated current-attribute
 * table is something I'm not 100% confident on, so this module fetches
 * defensively and falls back gracefully if the endpoint returns an
 * unexpected shape or fails. See URL_CANDIDATES below — the first one
 * that returns a usable GeoJSON wins.
 */

const URL_CANDIDATES = [
  // Most likely canonical: aggregated current radar attributes as GeoJSON
  'https://mesonet.agron.iastate.edu/geojson/nexrad_attr.geojson',
  // Alternate naming sometimes seen in IEM's published lists
  'https://mesonet.agron.iastate.edu/geojson/storm_attr.geojson',
  // CGI-style endpoint
  'https://mesonet.agron.iastate.edu/cgi-bin/request/gis/nexrad_storm_attr.py?fmt=geojson'
];

/**
 * Fetch all currently-active radar storm attributes and filter to TVS
 * detections. Each marker has lat/lon, the radar that observed it, and
 * an issuance timestamp.
 *
 * @returns {Promise<{markers: Array<{lat:number, lon:number, radar:string, time:string, type:'TVS'}>, error: Error|null}>}
 */
export async function fetchTvsMarkers() {
  let lastError = null;
  for (const url of URL_CANDIDATES) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) { lastError = new Error(`IEM ${res.status} for ${url}`); continue; }
      const data = await res.json();
      const markers = parseFeatureCollection(data);
      // Empty result is a legitimate response (no TVS anywhere right now).
      // Anything that *parses* — even to zero — is preferred over a 404.
      return { markers, error: null };
    } catch (e) {
      lastError = e;
    }
  }
  return { markers: [], error: lastError };
}

/**
 * Pull TVS-typed markers out of an IEM GeoJSON FeatureCollection.
 * IEM uses a `storm_id` / `nexrad` / `attribute` / `valid` property
 * scheme; the type field varies between endpoints (sometimes `attr`,
 * sometimes `event_type`, sometimes baked into a `type` field). We
 * accept any of these.
 */
function parseFeatureCollection(data) {
  const features = data?.features;
  if (!Array.isArray(features)) return [];

  const markers = [];
  features.forEach(f => {
    const props = f?.properties || {};
    const type = (props.attr || props.event_type || props.type || props.AZIMUTH || '').toString().toUpperCase();
    if (!type.includes('TVS')) return;

    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return;
    const [lon, lat] = coords;
    if (typeof lat !== 'number' || typeof lon !== 'number') return;

    markers.push({
      lat,
      lon,
      radar: props.nexrad || props.radar || props.STATION || 'NEXRAD',
      time: props.valid || props.utc_valid || props.observation_time || null,
      type: 'TVS'
    });
  });

  return markers;
}
