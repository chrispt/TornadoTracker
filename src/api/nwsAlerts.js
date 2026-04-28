/**
 * NWS active alerts feed.
 *
 * /alerts/active returns currently-effective alerts as GeoJSON Features. We
 * filter to event === "Tornado Warning" and adapt them to the shape used by
 * the rest of the app (a "product"-like object with an _alert payload).
 *
 * Alert IDs and product IDs share a flat namespace via the `id` field — the
 * detail panel will render an alert-typed entry without needing to fetch a
 * separate productText.
 */
import { API_BASE, ALERT_ID_PREFIX } from '../config/constants.js';
import { fetchWithErrorHandling } from './client.js';
import { detectPDS } from '../utils/textParser.js';
import { centroidOf } from '../utils/geo.js';

/**
 * Fetch all currently active tornado warnings.
 * @returns {Promise<{alerts: Array, error: import('./client.js').ApiError|null}>}
 */
export async function fetchActiveAlerts() {
  const url = `${API_BASE}/alerts/active?event=Tornado%20Warning`;
  const { data, error } = await fetchWithErrorHandling(url);
  if (error) return { alerts: [], error };

  const features = data?.features || [];
  const alerts = features.map(featureToAlert).filter(Boolean);
  return { alerts, error: null };
}

/**
 * Adapt a GeoJSON Alert feature into our internal product-like shape so the
 * existing feed/detail/store code can render it without special-casing.
 */
function featureToAlert(feature) {
  const props = feature?.properties;
  if (!props) return null;

  const isPDS = detectPDS(`${props.description || ''} ${props.parameters?.NWSheadline?.[0] || ''}`);
  const subType = isPDS ? 'ALERT_TOR_PDS' : 'ALERT_TOR';
  const polygon = extractPolygon(feature.geometry);
  const centroid = centroidOf(polygon);

  return {
    id: `${ALERT_ID_PREFIX}${props.id || feature.id}`,
    productCode: 'TOR',
    productName: props.headline || 'Tornado Warning',
    issuanceTime: props.sent || props.effective || new Date().toISOString(),
    issuingOffice: props.senderName ? `https://api.weather.gov/offices/${officeFromSender(props.senderName)}` : null,
    // Pre-tagged for the feed pipeline
    _subType: subType,
    _isPDS: isPDS,
    _category: 'ALERT',
    // Alert payload for detail rendering
    _alert: {
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
    // Use the first polygon for centroid/bounds purposes
    return (geometry.coordinates?.[0]?.[0] || []).map(([lon, lat]) => ({ lat, lon }));
  }
  return [];
}

function officeFromSender(senderName) {
  // "NWS Birmingham AL" → "BMX" isn't trivial; we just keep the sender as-is
  // and let the formatter fall back. Use first 4 letters as a placeholder.
  const m = senderName.match(/NWS\s+(\w+)/i);
  return m ? m[1].slice(0, 4).toUpperCase() : 'NWS';
}
