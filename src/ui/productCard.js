import { PRODUCT_TYPES, PRODUCT_SUB_TYPES } from '../config/constants.js';
import { timeAgo, truncate, escapeHtml, extractOfficeCode } from '../utils/formatting.js';

/**
 * Render a single product card HTML string.
 * @param {Object} product - NWS product summary
 * @param {boolean} isSelected - Whether this card is currently selected
 * @returns {string} HTML string
 */
export function renderProductCard(product, isSelected = false) {
  const type = product.productCode || product['@type'] || 'UNK';
  const typeInfo = PRODUCT_TYPES[type] || { color: '#6b7280', label: type };
  const office = extractOfficeCode(product.issuingOffice);
  const time = timeAgo(product.issuanceTime);
  const name = escapeHtml(product.productName || typeInfo.label);
  const preview = escapeHtml(truncate(product.productName || '', 60));
  const selectedClass = isSelected ? 'product-card--selected' : '';
  const subTypeLabel = product._subType ? PRODUCT_SUB_TYPES[product._subType] : null;

  return `
    <div class="product-card ${selectedClass}" data-product-id="${escapeHtml(product.id)}">
      <span class="product-card__type-badge" style="background:${typeInfo.color};">${type}</span>
      <div class="product-card__body">
        <div class="product-card__office">${office}</div>
        ${subTypeLabel ? `<div class="product-card__subtype">${subTypeLabel}</div>` : ''}
        <div class="product-card__time">${time}</div>
        <div class="product-card__preview">${preview}</div>
      </div>
    </div>
  `;
}
