/**
 * NWS active alerts feed.
 *
 * /alerts/active returns currently-effective alerts as GeoJSON Features. We
 * fetch both Tornado Warnings and Tornado Watches in parallel and adapt
 * each into our internal product-like shape so the same feed/detail/map
 * code can render them without special-casing.
 *
 * Tier from highest to lowest severity:
 *   ALERT_TOR_EMERGENCY  — Tornado Warning + "TORNADO EMERGENCY" text
 *   ALERT_TOR_PDS        — Tornado Warning + PDS text
 *   ALERT_TOR            — Tornado Warning
 *   WATCH_TOR_PDS        — Tornado Watch + PDS text
 *   WATCH_TOR            — Tornado Watch
 */
import { API_BASE, ALERT_ID_PREFIX } from '../config/constants.js';
import { fetchWithErrorHandling } from './client.js';
import { detectPDS, detectEmergency } from '../utils/textParser.js';
import { centroidOf } from '../utils/geo.js';

const EVENTS = ['Tornado Warning', 'Tornado Watch'];

/**
 * Fetch all currently active tornado warnings AND watches in parallel.
 * @returns {Promise<{alerts: Array, error: import('./client.js').ApiError|null}>}
 */
export async function fetchActiveAlerts() {
  const results = await Promise.allSettled(
    EVENTS.map(event =>
      fetchWithErrorHandling(`${API_BASE}/alerts/active?event=${encodeURIComponent(event)}`)
    )
  );

  const alerts = [];
  let firstError = null;

  results.forEach((result) => {
    if (result.status !== 'fulfilled') {
      firstError = firstError || result.reason;
      return;
    }
    const { data, error } = result.value;
    if (error) { firstError = firstError || error; return; }
    const features = data?.features || [];
    features.forEach(f => {
      const alert = featureToAlert(f);
      if (alert) alerts.push(alert);
    });
  });

  return { alerts, error: firstError };
}

/**
 * Adapt a GeoJSON Alert feature into our internal product-like shape.
 */
function featureToAlert(feature) {
  const props = feature?.properties;
  if (!props) return null;

  const event = props.event || '';
  const isWatch = /Tornado\s+Watch/i.test(event);
  const isWarning = /Tornado\s+Warning/i.test(event);
  if (!isWatch && !isWarning) return null;

  const haystack = [
    props.description,
    props.headline,
    props.parameters?.NWSheadline?.[0]
  ].filter(Boolean).join(' ');
  const isPDS = detectPDS(haystack);
  // Emergency only applies to warnings, not watches.
  const isEmergency = !isWatch && detectEmergency(haystack);

  const subType = isWatch
    ? (isPDS ? 'WATCH_TOR_PDS' : 'WATCH_TOR')
    : (isEmergency
        ? 'ALERT_TOR_EMERGENCY'
        : (isPDS ? 'ALERT_TOR_PDS' : 'ALERT_TOR'));

  const category = isWatch ? 'WATCH'
    : (isEmergency ? 'EMERGENCY' : 'ALERT');

  const polygon = extractPolygon(feature.geometry);
  const centroid = centroidOf(polygon);

  return {
    id: `${ALERT_ID_PREFIX}${props.id || feature.id}`,
    productCode: 'TOR',
    productName: props.headline || event,
    issuanceTime: props.sent || props.effective || new Date().toISOString(),
    issuingOffice: props.senderName ? `https://api.weather.gov/offices/${officeFromSender(props.senderName)}` : null,
    _subType: subType,
    _isPDS: isPDS,
    _isEmergency: isEmergency,
    _category: category,
    _alert: {
      event,
      headline: props.headline,
      description: props.description,
      instruction: props.instruction,
      areaDesc: props.areaDesc,
      severity: props.severity,
      certainty: props.certainty,
      urgency: props.urgency,
      onset: props.onset,
      expires: props.expires,
      ends: props.ends,
      polygon,
      centroid
    }
  };
}

function extractPolygon(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    return (geometry.coordinates?.[0] || []).map(([lon, lat]) => ({ lat, lon }));
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates?.[0]?.[0] || []).map(([lon, lat]) => ({ lat, lon }));
  }
  return [];
}

function officeFromSender(senderName) {
  const m = senderName.match(/NWS\s+(\w+)/i);
  return m ? m[1].slice(0, 4).toUpperCase() : 'NWS';
}
