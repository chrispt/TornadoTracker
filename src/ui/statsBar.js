import store from '../state/store.js';
import { CATEGORIES } from '../config/constants.js';
import {
  highestCategorical, categoricalName, categoricalColor, highestTornadoProb
} from '../api/spcOutlook.js';

/**
 * Stats bar — summary counts by category, the today's-outlook chip, and an
 * emphasized banner when an active tornado emergency is in the feed.
 */
export function initStatsBar() {
  store.subscribe('products', renderStats);
  store.subscribe('outlook', renderStats);
}

function renderStats() {
  const bar = document.getElementById('stats-bar');
  if (!bar) return;

  const products = store.get('products') || [];

  const catCounts = {};
  // Count radar status only on the live-alert pipeline (ALERT/EMERGENCY)
  // categories. Otherwise we double-count: every active warning has both a
  // /products/TOR entry (category WARNING/PDS) AND an /alerts/active entry
  // (category ALERT/EMERGENCY) — same event, two records.
  let radarConfirmed = 0;
  let radarIndicated = 0;
  products.forEach(p => {
    const cat = p._category || 'UNKNOWN';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
    const isAlertSource = cat === 'ALERT' || cat === 'EMERGENCY';
    if (!isAlertSource) return;
    if (p._radarStatus === 'CONFIRMED') radarConfirmed++;
    else if (p._radarStatus === 'INDICATED') radarIndicated++;
  });

  // Prefer true TVS markers from IEM if they're available; fall back to
  // the deduped warning-text-derived count.
  const tvsMarkers = store.get('tvsMarkers');
  if (Array.isArray(tvsMarkers) && tvsMarkers.length > 0) {
    radarIndicated = tvsMarkers.length;
  }

  let html = '';

  const emergencyCount = catCounts.EMERGENCY || 0;
  if (emergencyCount > 0) {
    html += `
      <div class="stats-bar__emergency" role="alert" aria-live="assertive">
        <span class="stats-bar__emergency-icon" aria-hidden="true">⚠</span>
        <span>${emergencyCount} Active Tornado Emergency${emergencyCount > 1 ? 's' : ''}</span>
      </div>
    `;
  }

  // Radar callout — separate from emergency; shows TVS / debris detections.
  // Confirmed wins display priority; Indicated only shown if no Confirmed.
  if (radarConfirmed > 0) {
    html += `
      <div class="stats-bar__radar stats-bar__radar--confirmed" role="alert" aria-live="assertive">
        <span class="stats-bar__radar-icon" aria-hidden="true">📡</span>
        <span><strong>${radarConfirmed}</strong> Radar Confirmed Tornado${radarConfirmed > 1 ? 'es' : ''}</span>
      </div>
    `;
  } else if (radarIndicated > 0) {
    html += `
      <div class="stats-bar__radar stats-bar__radar--indicated" role="status" aria-live="polite"
           title="Tornado Vortex Signature flagged by Doppler radar">
        <span class="stats-bar__radar-icon" aria-hidden="true">📡</span>
        <span><strong>${radarIndicated}</strong> TVS Detected</span>
      </div>
    `;
  }

  // SPC Day 1 outlook summary chip — "today's threat level"
  const outlook = store.get('outlook');
  if (outlook?.categorical?.length) {
    const cat = highestCategorical(outlook.categorical);
    const torProb = highestTornadoProb(outlook.tornado || []);
    if (cat) {
      const color = categoricalColor(cat);
      const label = categoricalName(cat);
      const torText = torProb > 0 ? ` · Tornado ${torProb}%` : '';
      html += `
        <div class="stats-bar__outlook"
             title="SPC Day 1 Convective Outlook${torText}">
          <span class="stats-bar__outlook-chip" style="background:${color};">SPC</span>
          <span>${label}${torText}</span>
        </div>
      `;
    }
  }

  html += `
    <div class="stats-bar__item">
      <span>Total:</span>
      <span class="stats-bar__value">${products.length}</span>
    </div>
  `;

  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    if (key === 'EMERGENCY') return; // shown via the banner instead
    const count = catCounts[key] || 0;
    if (count > 0) {
      html += `
        <div class="stats-bar__item">
          <span class="stats-bar__dot" style="background:${cat.color};" aria-hidden="true"></span>
          <span>${cat.label}:</span>
          <span class="stats-bar__value">${count}</span>
        </div>
      `;
    }
  });

  bar.innerHTML = html;
}
