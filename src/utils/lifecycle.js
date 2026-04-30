/**
 * Product-lifecycle helpers.
 *
 * NWS warnings stay in /products/TOR for hours after they expire as a
 * historical record, but for "is this thing still happening right now"
 * UI surfaces (TVS pills, the top-of-page TVS callout, the radar banner
 * in the detail view) we only want to count truly-active items.
 *
 * Truth source for "active":
 *   1. Alert-derived products carry an explicit `_alert.expires` (or
 *      `_alert.ends`) timestamp from the CAP feed — that's authoritative.
 *   2. /products/TOR entries don't have an expires field; we fall back to
 *      "issued within the last hour" since standard NWS tornado warnings
 *      run 30–45 minutes (1h gives a small grace window).
 */

const TOR_WARNING_DURATION_MS = 60 * 60 * 1000;

/**
 * Is this product still in effect right now?
 * @param {Object} product
 * @returns {boolean}
 */
export function isProductActive(product) {
  if (!product) return false;

  // Alert-derived products: trust the CAP `expires` / `ends` field.
  const expiresIso = product._alert?.expires || product._alert?.ends;
  if (expiresIso) {
    const expiresMs = new Date(expiresIso).getTime();
    if (Number.isFinite(expiresMs)) return expiresMs > Date.now();
  }

  // /products/TOR fall back to issuance + typical warning duration.
  if (product.productCode === 'TOR' && product.issuanceTime) {
    const issuedMs = new Date(product.issuanceTime).getTime();
    if (Number.isFinite(issuedMs)) {
      return Date.now() - issuedMs < TOR_WARNING_DURATION_MS;
    }
  }

  // Surveys, LSRs, watches without expires — not "active warnings" in
  // the sense the TVS callout cares about.
  return false;
}

/**
 * Does this product have a radar-detected tornado signature AND is the
 * underlying warning still in effect? Used by the TVS pill, the
 * top-of-page callout count, and the detail-view radar banner so old
 * warnings don't pollute "right now" UI.
 */
export function hasActiveRadarSignature(product) {
  if (!product?._radarStatus) return false;
  return isProductActive(product);
}
