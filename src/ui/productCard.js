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
  const preview = escapeHtml(product.productName || '');
  const selectedClass = isSelected ? 'product-card--selected' : '';
  const subTypeLabel = product._subType ? PRODUCT_SUB_TYPES[product._subType] : null;

  const issuedMs = product.issuanceTime ? new Date(product.issuanceTime).getTime() : 0;
  const isNew = opts.lastSeenAt && issuedMs > opts.lastSeenAt;
  const newClass = isNew ? 'product-card--new' : '';
  const emergencyClass = product._category === 'EMERGENCY' ? 'product-card--emergency' : '';
  const watchClass = product._category === 'WATCH' ? 'product-card--watch' : '';

  const namePart = product._eventName ? `, ${product._eventName}` : '';
  const ariaLabel = `${badgeLabel} from ${office}${namePart}, ${time}${isNew ? ', new' : ''}`;

  return `
    <div class="product-card ${selectedClass} ${newClass} ${emergencyClass} ${watchClass}" data-product-id="${escapeHtml(product.id)}" tabindex="0" role="article" aria-label="${escapeHtml(ariaLabel)}">
      <span class="product-card__type-badge" style="background:${badgeColor};">${escapeHtml(badgeLabel)}</span>
      ${isNew ? '<span class="product-card__new-dot" aria-hidden="true"></span>' : ''}
      <div class="product-card__body">
        <div class="product-card__office">${office}</div>
        ${subTypeLabel ? `<div class="product-card__subtype">${subTypeLabel}</div>` : ''}
        ${product._eventName ? `<div class="product-card__event-name">${escapeHtml(product._eventName)}</div>` : ''}
        <div class="product-card__time">${time}</div>
        <div class="product-card__preview">${preview}</div>
      </div>
    </div>
  `;
}
