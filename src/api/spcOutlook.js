/**
 * SPC Day 1 Convective Outlook fetcher.
 *
 * The Storm Prediction Center publishes their daily outlook as static
 * GeoJSON layers. We fetch the categorical risk layer and the
 * tornado-probability layer in parallel; the rest (wind, hail) is out of
 * scope for a tornado-focused tracker.
 *
 * Categorical levels (LABEL field), low → high:
 *   TSTM  General Thunder
 *   MRGL  Marginal (level 1)
 *   SLGT  Slight   (level 2)
 *   ENH   Enhanced (level 3)
 *   MDT   Moderate (level 4)
 *   HIGH  High     (level 5)
 *
 * Tornado probability contours (LABEL field): "2", "5", "10", "15", "30",
 * "45", "60", and "SIGN" (significant 10%+).
 */
const BASE = 'https://www.spc.noaa.gov/products/outlook';

/** Day 1 categorical risk + tornado probability layers. */
const URLS = {
  categorical: `${BASE}/day1otlk_cat.lyr.geojson`,
  tornado:     `${BASE}/day1otlk_torn.lyr.geojson`
};

/**
 * Fetch the Day 1 outlook layers in parallel.
 * Failure is non-fatal — returns empty arrays so the app keeps running.
 *
 * @returns {Promise<{categorical: Array, tornado: Array, validIssue: string|null, error: Error|null}>}
 */
export async function fetchDay1Outlook() {
  const results = await Promise.allSettled(
    Object.values(URLS).map(url => fetchJson(url))
  );

  const categorical = results[0].status === 'fulfilled' ? (results[0].value?.features || []) : [];
  const tornado     = results[1].status === 'fulfilled' ? (results[1].value?.features || []) : [];
  const error       = results.find(r => r.status === 'rejected')?.reason || null;

  // SPC includes ISSUE/EXPIRE timestamps on each feature's properties
  const validIssue = categorical[0]?.properties?.ISSUE
    || categorical[0]?.properties?.VALID
    || tornado[0]?.properties?.ISSUE
    || null;

  return { categorical, tornado, validIssue, error };
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`SPC ${res.status}`);
  return res.json();
}

/**
 * SPC's standard categorical risk colors.
 * @param {string} label - Outlook LABEL property (TSTM/MRGL/SLGT/ENH/MDT/HIGH)
 */
export function categoricalColor(label) {
  switch ((label || '').toUpperCase()) {
    case 'TSTM': return '#80c580';
    case 'MRGL': return '#7fc97f';
    case 'SLGT': return '#f7e07f';
    case 'ENH':  return '#e6a06c';
    case 'MDT':  return '#e25c5c';
    case 'HIGH': return '#d846d8';
    default:     return '#cccccc';
  }
}

/** Human-readable label for a categorical risk code. */
export function categoricalName(label) {
  switch ((label || '').toUpperCase()) {
    case 'TSTM': return 'General Thunder';
    case 'MRGL': return 'Marginal Risk';
    case 'SLGT': return 'Slight Risk';
    case 'ENH':  return 'Enhanced Risk';
    case 'MDT':  return 'Moderate Risk';
    case 'HIGH': return 'High Risk';
    default:     return label || 'Unknown';
  }
}

/** Numeric severity rank (0 = lowest, 5 = highest). */
export function categoricalRank(label) {
  switch ((label || '').toUpperCase()) {
    case 'TSTM': return 0;
    case 'MRGL': return 1;
    case 'SLGT': return 2;
    case 'ENH':  return 3;
    case 'MDT':  return 4;
    case 'HIGH': return 5;
    default:     return -1;
  }
}

/** Highest categorical risk in a feature collection. */
export function highestCategorical(features) {
  let best = null;
  let bestRank = -1;
  features.forEach(f => {
    const lbl = f?.properties?.LABEL;
    const r = categoricalRank(lbl);
    if (r > bestRank) { bestRank = r; best = lbl; }
  });
  return best;
}

/** Highest tornado probability (numeric) in a feature collection. */
export function highestTornadoProb(features) {
  let best = 0;
  features.forEach(f => {
    const lbl = f?.properties?.LABEL;
    if (lbl === 'SIGN') return; // significant — separate flag
    const n = parseInt(lbl, 10);
    if (Number.isFinite(n) && n > best) best = n;
  });
  return best;
}
