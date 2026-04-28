import { CATEGORIES, PRODUCT_SUB_TYPES } from '../config/constants.js';
import { timeAgo, escapeHtml, extractOfficeCode } from '../utils/formatting.js';

/**
 * Render a single product card HTML string.
 * @param {Object} product - NWS product summary
 * @param {boolean} isSelected - Whether this card is currently selected
 * @param {Object} [opts]
 * @param {number} [opts.lastSeenAt] - ms timestamp of last "seen" event; used
 *   to flag a card as new (issued after).
 * @returns {string} HTML string
 */
export function renderProductCard(product, isSelected = false, opts = {}) {
  const category = product._category ? CATEGORIES[product._category] : null;
  const badgeColor = category ? category.color : '#6b7280';
  const badgeLabel = category ? category.label : product.productCode;
  const office = extractOfficeCode(product.issuingOffice);
  const time = timeAgo(product.issuanceTime);
  const subTypeLabel = product._subType ? PRODUCT_SUB_TYPES[product._subType] : null;

  // Build the headline — what this card is actually about. Falls back through:
  //   1. Damage-survey event name (e.g. "Greens Creek Tornado")
  //   2. LSR location + county (e.g. "2 NNE Greenfield, Craighead County AR")
  //   3. Active-alert area description
  //   4. Product name (if it's distinct from the sub-type label)
  const headline = buildHeadline(product, subTypeLabel);

  const selectedClass = isSelected ? 'product-card--selected' : '';
  const issuedMs = product.issuanceTime ? new Date(product.issuanceTime).getTime() : 0;
  const isNew = opts.lastSeenAt && issuedMs > opts.lastSeenAt;
  const newClass = isNew ? 'product-card--new' : '';
  const emergencyClass = product._category === 'EMERGENCY' ? 'product-card--emergency' : '';
  const watchClass = product._category === 'WATCH' ? 'product-card--watch' : '';

  const radarLabel = product._radarStatus === 'CONFIRMED'
    ? 'radar confirmed'
    : product._radarStatus === 'INDICATED' ? 'radar indicated' : null;
  const ariaLabel = [badgeLabel, radarLabel, headline, `from ${office}`, time, isNew && 'new']
    .filter(Boolean).join(', ');

  const radarPill = renderRadarPill(product._radarStatus);

  return `
    <div class="product-card ${selectedClass} ${newClass} ${emergencyClass} ${watchClass}"
         data-product-id="${escapeHtml(product.id)}" tabindex="0" role="article"
         aria-label="${escapeHtml(ariaLabel)}">
      <span class="product-card__type-badge" style="background:${badgeColor};">
        ${escapeHtml(badgeLabel)}
      </span>
      ${isNew ? '<span class="product-card__new-dot" aria-hidden="true"></span>' : ''}
      <div class="product-card__body">
        <div class="product-card__top-row">
          <span class="product-card__office">${office}</span>
          ${subTypeLabel ? `<span class="product-card__subtype">${subTypeLabel}</span>` : ''}
          ${radarPill}
        </div>
        ${headline ? `<div class="product-card__headline">${escapeHtml(headline)}</div>` : ''}
        <div class="product-card__time">${time}</div>
      </div>
    </div>
  `;
}

function renderRadarPill(status) {
  if (!status) return '';
  const label = status === 'CONFIRMED' ? 'Radar Confirmed' : 'Radar Indicated';
  const cls = status === 'CONFIRMED' ? 'radar-pill--confirmed' : 'radar-pill--indicated';
  return `<span class="radar-pill ${cls}" title="Radar-detected tornado signature (TVS)">
    <span class="radar-pill__icon" aria-hidden="true">📡</span>${label}
  </span>`;
}

function buildHeadline(product, subTypeLabel) {
  if (product._eventName) return product._eventName;

  // LSR with parsed location + county
  const parsed = product._parsed?.tornadoes?.[0];
  if (parsed?.location || parsed?.county) {
    const parts = [];
    if (parsed.location) parts.push(parsed.location);
    if (parsed.county) {
      parts.push(`${parsed.county} County${parsed.state ? ', ' + parsed.state : ''}`);
    }
    return parts.join(' · ');
  }

  // Active alert area description (e.g. "Northern Tuscaloosa County, AL")
  if (product._alert?.areaDesc) return product._alert.areaDesc;

  // Product name only if it's meaningfully different from the sub-type label
  const name = product.productName || '';
  if (name && subTypeLabel && name.toLowerCase().includes(subTypeLabel.toLowerCase())) {
    return null; // would just duplicate the sub-type
  }
  return name || null;
}
