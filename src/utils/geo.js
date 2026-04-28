/**
 * Geographic utilities — distance + simple polygon helpers.
 *
 * No proj dependency: haversine is good enough for tornado-scale distances
 * (typically <1000 mi) within ~0.5%.
 */

const EARTH_RADIUS_MI = 3958.8;

/**
 * Great-circle distance between two lat/lon points, in miles.
 */
export function distanceMiles(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lat2 == null) return Infinity;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Get a representative lat/lon for a product/alert. Looks at:
 *   - parsed tornadoes[0].lat/lon
 *   - parsed.tornadoes[0].polygon centroid
 *   - alert.centroid
 *
 * @param {Object} product - Product with optional _alert and _parsed
 * @returns {{lat: number, lon: number}|null}
 */
export function productCoordinate(product) {
  if (!product) return null;

  if (product._alert?.centroid) return product._alert.centroid;

  const tornado = product._parsed?.tornadoes?.[0];
  if (tornado) {
    if (tornado.lat != null && tornado.lon != null) {
      return { lat: tornado.lat, lon: tornado.lon };
    }
    if (tornado.polygon?.length) {
      return centroidOf(tornado.polygon);
    }
  }
  return null;
}

export function centroidOf(points) {
  if (!points?.length) return null;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lon: points.reduce((s, p) => s + p.lon, 0) / points.length
  };
}
