import { format, formatDistanceToNow, parseISO } from 'date-fns';

/**
 * Format an ISO date string for display.
 */
export function formatDate(isoString) {
  if (!isoString) return '';
  try {
    return format(parseISO(isoString), 'MMM d, yyyy h:mm a');
  } catch {
    return isoString;
  }
}

/**
 * Format a relative time string (e.g. "5 minutes ago").
 */
export function timeAgo(isoString) {
  if (!isoString) return '';
  try {
    return formatDistanceToNow(parseISO(isoString), { addSuffix: true });
  } catch {
    return '';
  }
}

/**
 * Escape HTML to prevent XSS.
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Truncate text to a maximum length with ellipsis.
 */
export function truncate(str, maxLen = 80) {
  if (!str || str.length <= maxLen) return str || '';
  return str.slice(0, maxLen) + '...';
}

/**
 * Extract the issuing office from a product's issuingOffice string.
 * e.g. "https://api.weather.gov/offices/KBMX" → "KBMX"
 */
export function extractOfficeCode(issuingOffice) {
  if (!issuingOffice) return 'UNK';
  const match = issuingOffice.match(/\/offices\/(\w+)$/);
  return match ? match[1] : issuingOffice;
}
