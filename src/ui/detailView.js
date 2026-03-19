import store from '../state/store.js';
import { EF_SCALE } from '../config/constants.js';
import { formatDate, escapeHtml, extractOfficeCode } from '../utils/formatting.js';

/**
 * Initialize the detail view — shows full product detail with parsed highlights.
 */
export function initDetailView() {
  store.subscribe('selectedProductDetail', renderDetail);
  store.subscribe('parsedTornadoData', renderDetail);

  // Back button delegation
  document.getElementById('detail-panel')?.addEventListener('click', (e) => {
    if (e.target.closest('.detail-view__back')) {
      store.update({
        selectedProductId: null,
        selectedProductDetail: null,
        parsedTornadoData: null
      });
      document.getElementById('detail-panel').classList.add('hidden');
      document.getElementById('map-panel').classList.remove('hidden');
    }
  });
}

function renderDetail() {
  const panel = document.getElementById('detail-panel');
  const mapPanel = document.getElementById('map-panel');
  if (!panel) return;

  const detail = store.get('selectedProductDetail');
  if (!detail) {
    panel.classList.add('hidden');
    mapPanel?.classList.remove('hidden');
    return;
  }

  panel.classList.remove('hidden');
  mapPanel?.classList.add('hidden');

  const parsed = store.get('parsedTornadoData');
  const office = extractOfficeCode(detail.issuingOffice);
  const type = detail.productCode || '';
  const time = formatDate(detail.issuanceTime);

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
      </div>
      <div class="detail-view__meta">
        <span>${type} &middot; ${office}</span>
        <span>${time}</span>
      </div>
      ${highlightsHtml}
      <div class="detail-view__raw">${escapeHtml(detail.productText || 'No text available.')}</div>
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
    { label: 'Fatalities', value: tornado.fatalities !== null ? String(tornado.fatalities) : null },
    { label: 'Injuries', value: tornado.injuries !== null ? String(tornado.injuries) : null },
    { label: 'Location', value: tornado.lat ? `${tornado.lat.toFixed(2)}, ${tornado.lon.toFixed(2)}` : null }
  ].filter(f => f.value);

  return `
    <div class="tornado-highlights">
      <div class="tornado-highlights__title">
        Tornado Report ${index > 0 ? `#${index + 1}` : ''}
      </div>
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
    </div>
  `;
}
