import store from '../state/store.js';
import { EF_SCALE } from '../config/constants.js';
import { formatDate, escapeHtml, extractOfficeCode } from '../utils/formatting.js';
import { showToast } from './toast.js';

/**
 * Initialize the detail view — shows full product detail with parsed highlights.
 */
export function initDetailView() {
  store.subscribe('selectedProductDetail', renderDetail);
  store.subscribe('parsedTornadoData', renderDetail);

  // Back / copy / share button delegation
  document.getElementById('detail-panel')?.addEventListener('click', (e) => {
    if (e.target.closest('.detail-view__back')) {
      store.update({
        selectedProductId: null,
        selectedProductDetail: null,
        parsedTornadoData: null
      });
    } else if (e.target.closest('.detail-view__copy')) {
      copyText();
    } else if (e.target.closest('.detail-view__share')) {
      shareLink();
    }
  });

  renderDetail();
}

async function copyText() {
  const detail = store.get('selectedProductDetail');
  if (!detail?.productText) return;
  try {
    await navigator.clipboard.writeText(detail.productText);
    showToast('Copied to clipboard');
  } catch {
    showToast('Copy failed');
  }
}

async function shareLink() {
  const id = store.get('selectedProductId');
  if (!id) return;
  const url = `${location.origin}${location.pathname}#/p/${encodeURIComponent(id)}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'TornadoTracker', url }); return; } catch {}
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied');
  } catch {
    showToast('Copy failed');
  }
}

function renderDetail() {
  const panel = document.getElementById('detail-panel');
  if (!panel) return;

  const detail = store.get('selectedProductDetail');
  if (!detail) {
    panel.innerHTML = `
      <div class="detail-empty-state">
        <div class="detail-empty-state__icon" aria-hidden="true">&#x1F32A;</div>
        <div class="detail-empty-state__text">Select a product to view details</div>
        <div class="detail-empty-state__hint">
          Tap a card or a polygon on the map to see the full report,
          parsed highlights, and a shareable link.
        </div>
      </div>
    `;
    return;
  }

  const parsed = store.get('parsedTornadoData');
  const office = extractOfficeCode(detail.issuingOffice);
  const type = detail.productCode || '';
  const time = formatDate(detail.issuanceTime);

  let pdsBannerHtml = '';
  if ((parsed && parsed.isPDS) || detail._alert?.severity === 'Extreme') {
    pdsBannerHtml = `
      <div class="detail-view__pds-banner">
        ${detail._isPDS || parsed?.isPDS ? 'Particularly Dangerous Situation' : 'Extreme Severity'}
      </div>
    `;
  }

  // Active alert: render alert payload directly
  let alertHtml = '';
  if (detail._alert) {
    alertHtml = renderAlert(detail._alert);
  }

  let highlightsHtml = '';
  if (parsed && parsed.tornadoes && parsed.tornadoes.length > 0) {
    highlightsHtml = parsed.tornadoes.map((t, i) => renderTornadoHighlight(t, i)).join('');
  } else if (parsed && parsed.hasTornadoContent) {
    highlightsHtml = `
      <div class="tornado-highlights">
        <div class="tornado-highlights__title">Tornado Content Detected</div>
        <p style="font-size:13px;color:var(--text-secondary);">
          This product mentions tornadoes but structured data could not be extracted.
        </p>
      </div>
    `;
  }

  panel.innerHTML = `
    <div class="detail-view">
      <div class="detail-view__header">
        <button class="btn btn--ghost btn--sm detail-view__back">&larr; Back</button>
        <div class="detail-view__title">${escapeHtml(detail.productName || type)}</div>
        <div class="detail-view__actions">
          <button class="btn btn--ghost btn--sm detail-view__share" title="Share link">Share</button>
          ${detail.productText ? `<button class="btn btn--ghost btn--sm detail-view__copy" title="Copy text">Copy</button>` : ''}
        </div>
      </div>
      <div class="detail-view__meta">
        <span>${type} &middot; ${office}</span>
        <span>${time}</span>
      </div>
      ${pdsBannerHtml}
      ${alertHtml}
      ${highlightsHtml}
      ${detail.productText ? `<div class="detail-view__raw">${escapeHtml(detail.productText)}</div>` : ''}
    </div>
  `;
}

function renderRadarBanner(status) {
  if (!status) return '';
  const isConfirmed = status === 'CONFIRMED';
  const label = isConfirmed ? 'Radar Confirmed Tornado' : 'TVS Detected';
  const detail = isConfirmed
    ? 'Doppler radar shows a debris signature or has been confirmed visually.'
    : 'Tornado Vortex Signature flagged by Doppler radar — rotation aloft, no visual confirmation yet.';
  const cls = isConfirmed ? 'radar-banner--confirmed' : 'radar-banner--indicated';
  return `
    <div class="radar-banner ${cls}" role="note">
      <span class="radar-banner__icon" aria-hidden="true">📡</span>
      <div>
        <div class="radar-banner__label">${label}</div>
        <div class="radar-banner__detail">${detail}</div>
      </div>
    </div>
  `;
}

function renderAlert(alert) {
  const fields = [
    { label: 'Severity', value: alert.severity },
    { label: 'Certainty', value: alert.certainty },
    { label: 'Urgency', value: alert.urgency },
    { label: 'Onset', value: alert.onset ? formatDate(alert.onset) : null },
    { label: 'Expires', value: alert.expires ? formatDate(alert.expires) : null }
  ].filter(f => f.value);

  const radarBanner = renderRadarBanner(alert.radarStatus);

  return `
    <div class="tornado-highlights">
      <div class="tornado-highlights__title">Active Tornado Warning</div>
      ${radarBanner}
      ${alert.headline ? `<p style="font-weight:600;margin-bottom:var(--space-xs);">${escapeHtml(alert.headline)}</p>` : ''}
      ${alert.areaDesc ? `<p style="font-size:13px;color:var(--text-secondary);margin-bottom:var(--space-sm);">${escapeHtml(alert.areaDesc)}</p>` : ''}
      <div class="tornado-highlights__grid">
        ${fields.map(f => `
          <div class="tornado-highlights__item">
            <span class="tornado-highlights__label">${f.label}</span>
            <span class="tornado-highlights__value">${escapeHtml(f.value)}</span>
          </div>
        `).join('')}
      </div>
      ${alert.description ? `<p style="margin-top:var(--space-sm);font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(alert.description)}</p>` : ''}
      ${alert.instruction ? `<p style="margin-top:var(--space-sm);font-size:13px;line-height:1.5;font-weight:500;color:var(--danger);">${escapeHtml(alert.instruction)}</p>` : ''}
    </div>
  `;
}

function renderTornadoHighlight(tornado, index) {
  const ef = tornado.efRating || 'UNKNOWN';
  const efInfo = EF_SCALE[ef] || EF_SCALE.UNKNOWN;

  const fields = [
    { label: 'EF Rating', value: ef, color: efInfo.color },
    { label: 'Path Length', value: tornado.pathLength },
    { label: 'Path Width', value: tornado.pathWidth },
    { label: 'Peak Winds', value: tornado.peakWinds },
    { label: 'County', value: tornado.county },
    { label: 'State', value: tornado.state },
    { label: 'Source', value: tornado.source },
    { label: 'Until', value: tornado.endTime },
    { label: 'Location', value: tornado.location },
    { label: 'Fatalities', value: tornado.fatalities !== null ? String(tornado.fatalities) : null },
    { label: 'Injuries', value: tornado.injuries !== null ? String(tornado.injuries) : null },
    { label: 'Coordinates', value: tornado.lat ? (
      tornado.startLat && tornado.endLat
        ? `${tornado.startLat.toFixed(2)}, ${tornado.startLon.toFixed(2)} → ${tornado.endLat.toFixed(2)}, ${tornado.endLon.toFixed(2)}`
        : `${tornado.lat.toFixed(2)}, ${tornado.lon.toFixed(2)}`
    ) : null }
  ].filter(f => f.value);

  // Longer text fields shown as paragraphs below the grid
  const paragraphs = [
    tornado.impact,
    tornado.motionDescription
  ].filter(Boolean);

  return `
    <div class="tornado-highlights">
      <div class="tornado-highlights__title">
        ${tornado.eventName ? escapeHtml(tornado.eventName) : `Tornado Report${index > 0 ? ` #${index + 1}` : ''}`}
      </div>
      ${tornado.eventName && index > 0 ? `<div class="tornado-highlights__subtitle">Tornado #${index + 1}</div>` : ''}
      ${renderRadarBanner(tornado.radarStatus)}
      <div class="tornado-highlights__grid">
        ${fields.map(f => `
          <div class="tornado-highlights__item">
            <span class="tornado-highlights__label">${f.label}</span>
            <span class="tornado-highlights__value" ${f.color ? `style="color:${f.color}"` : ''}>
              ${escapeHtml(f.value)}
            </span>
          </div>
        `).join('')}
      </div>
      ${tornado.summary ? `<p style="margin-top:var(--space-sm);font-size:12px;color:var(--text-secondary);">${escapeHtml(tornado.summary)}</p>` : ''}
      ${paragraphs.map(p => `<p style="margin-top:var(--space-xs);font-size:12px;color:var(--text-secondary);line-height:1.4;">${escapeHtml(p)}</p>`).join('')}
    </div>
  `;
}
