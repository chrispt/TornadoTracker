import store from '../state/store.js';
import { renderProductCard } from './productCard.js';

/**
 * Initialize the feed view — renders product cards and handles selection.
 */
export function initFeedView() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  store.subscribe('products', renderFeed);
  store.subscribe('selectedProductId', updateSelection);
  store.subscribe('lastSeenAt', renderFeed);

  // Mark all as seen when the feed gains focus / scroll
  let markedThisRender = false;
  container.addEventListener('scroll', () => {
    if (!markedThisRender) {
      markSeen();
      markedThisRender = true;
    }
  }, { passive: true });
  // Also reset the gate when re-rendering
  store.subscribe('products', () => { markedThisRender = false; });

  container.addEventListener('click', (e) => {
    const card = e.target.closest('.product-card');
    if (card) selectCard(card);
  });

  // Document-level keyboard nav: j/k for next/prev like a mail client
  document.addEventListener('keydown', (e) => {
    if (isTypingInForm(e.target)) return;
    if (e.key === 'j') { focusAdjacent(1); e.preventDefault(); }
    else if (e.key === 'k') { focusAdjacent(-1); e.preventDefault(); }
    else if (e.key === '/') { focusSearchTab(); e.preventDefault(); }
    else if (e.key === 'Escape' && store.get('selectedProductDetail')) {
      store.update({ selectedProductId: null, selectedProductDetail: null, parsedTornadoData: null });
    } else if (e.key === 'r' && (e.metaKey || e.ctrlKey)) {
      // leave Ctrl/Cmd-R alone for browser reload
    } else if (e.key === 'r') {
      document.dispatchEvent(new CustomEvent('tt:refresh-requested'));
      e.preventDefault();
    }
  });

  container.addEventListener('keydown', (e) => {
    const card = e.target.closest('.product-card');
    if (!card) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectCard(card);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = card.nextElementSibling;
      if (next && next.classList.contains('product-card')) next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = card.previousElementSibling;
      if (prev && prev.classList.contains('product-card')) prev.focus();
    }
  });
}

function isTypingInForm(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function focusAdjacent(delta) {
  const container = document.getElementById('feed-container');
  if (!container) return;
  const cards = [...container.querySelectorAll('.product-card')];
  if (cards.length === 0) return;
  const active = document.activeElement;
  const idx = cards.indexOf(active);
  const next = cards[Math.max(0, Math.min(cards.length - 1, idx + delta))] || cards[0];
  next.focus();
}

function focusSearchTab() {
  const tab = document.querySelector('.sidebar__tab[data-tab="search"]');
  if (tab) tab.click();
  setTimeout(() => document.getElementById('search-keyword')?.focus(), 50);
}

function markSeen() {
  const products = store.get('products') || [];
  if (products.length === 0) return;
  const newest = products.reduce((max, p) => {
    const t = p.issuanceTime ? new Date(p.issuanceTime).getTime() : 0;
    return t > max ? t : max;
  }, 0);
  if (newest > store.get('lastSeenAt')) {
    store.set('lastSeenAt', newest);
  }
}

function selectCard(card) {
  const id = card.dataset.productId;
  store.set('selectedProductId', id);
  document.dispatchEvent(new CustomEvent('tt:product-selected', { detail: id }));
}

function renderFeed() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  const products = store.get('products');
  const selectedId = store.get('selectedProductId');
  const isLoading = store.get('isLoading');

  if (isLoading && products.length === 0) {
    container.innerHTML = `
      <div class="feed-loading">
        <div class="spinner"></div>
      </div>
    `;
    return;
  }

  if (!products || products.length === 0) {
    container.innerHTML = `
      <div class="feed-empty">
        <div class="feed-empty__icon">&#127786;</div>
        <div class="feed-empty__title">No tornado products found</div>
        <div class="feed-empty__subtitle">Try selecting different categories or check back later for new reports</div>
      </div>
    `;
    return;
  }

  const lastSeenAt = store.get('lastSeenAt');
  container.innerHTML = `
    <div class="feed-list">
      ${products.map(p => renderProductCard(p, p.id === selectedId, { lastSeenAt })).join('')}
    </div>
  `;
}

function updateSelection(newId, oldId) {
  const container = document.getElementById('feed-container');
  if (!container) return;

  if (oldId) {
    const prev = container.querySelector(`[data-product-id="${CSS.escape(oldId)}"]`);
    if (prev) prev.classList.remove('product-card--selected');
  }
  if (newId) {
    const next = container.querySelector(`[data-product-id="${CSS.escape(newId)}"]`);
    if (next) next.classList.add('product-card--selected');
  }
}
