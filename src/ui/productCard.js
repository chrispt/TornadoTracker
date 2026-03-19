import { CATEGORIES, PRODUCT_SUB_TYPES } from '../config/constants.js';
import { timeAgo, escapeHtml, extractOfficeCode } from '../utils/formatting.js';

/**
 * Render a single product card HTML string.
 * @param {Object} product - NWS product summary
 * @param {boolean} isSelected - Whether this card is currently selected
 * @returns {string} HTML string
 */
export function renderProductCard(product, isSelected = false) {
  const category = product._category ? CATEGORIES[product._category] : null;
  const badgeColor = category ? category.color : '#6b7280';
  const badgeLabel = category ? category.label : product.productCode;
  const office = extractOfficeCode(product.issuingOffice);
  const time = timeAgo(product.issuanceTime);
  const preview = escapeHtml(product.productName || '');
  const selectedClass = isSelected ? 'product-card--selected' : '';
  const subTypeLabel = product._subType ? PRODUCT_SUB_TYPES[product._subType] : null;

  return `
    <div class="product-card ${selectedClass}" data-product-id="${escapeHtml(product.id)}">
      <span class="product-card__type-badge" style="background:${badgeColor};">${escapeHtml(badgeLabel)}</span>
      <div class="product-card__body">
        <div class="product-card__office">${office}</div>
        ${subTypeLabel ? `<div class="product-card__subtype">${subTypeLabel}</div>` : ''}
        <div class="product-card__time">${time}</div>
        <div class="product-card__preview">${preview}</div>
      </div>
    </div>
  `;
}
