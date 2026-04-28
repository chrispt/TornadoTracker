/**
 * Tiny hash-based router for deep-link product URLs.
 *
 *   #/p/{id}    — open the detail view for a specific product
 *   #/          — feed
 *
 * Hash routing avoids needing server-side rewrites — the static Vite build
 * serves a single index.html.
 */
import store from '../state/store.js';

let isApplyingExternalChange = false;

export function initRouter() {
  window.addEventListener('hashchange', applyHash);

  // Mirror selection back into the URL
  store.subscribe('selectedProductId', (id) => {
    if (isApplyingExternalChange) return;
    const target = id ? `#/p/${encodeURIComponent(id)}` : '#/';
    if (location.hash !== target) {
      history.replaceState(null, '', target);
    }
  });

  applyHash();
}

function applyHash() {
  const hash = location.hash || '';
  const m = hash.match(/^#\/p\/(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (store.get('selectedProductId') !== id) {
      isApplyingExternalChange = true;
      store.set('selectedProductId', id);
      document.dispatchEvent(new CustomEvent('tt:product-selected', { detail: id }));
      isApplyingExternalChange = false;
    }
  }
}

/** Programmatic navigation. */
export function routeToProduct(id) {
  location.hash = id ? `#/p/${encodeURIComponent(id)}` : '#/';
}
