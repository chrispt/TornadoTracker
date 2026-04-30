const STORAGE_KEY = 'tt-layout';
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 700;
const SIDEBAR_DEFAULT = 380;
const MAP_FRAC_MIN = 0.12;
const MAP_FRAC_MAX = 0.88;
const MAP_FRAC_DEFAULT = 0.40;

export function initResizeHandles() {
  if (!isMobile()) applyLayout(loadLayout());

  initColResizer(document.getElementById('sidebar-resizer'));
  initRowResizer(document.getElementById('map-resizer'));

  // Switch between mobile (clear custom props → CSS takes over) and desktop
  window.matchMedia('(max-width: 768px)').addEventListener('change', (e) => {
    if (e.matches) {
      document.getElementById('app')?.style.removeProperty('--sidebar-w');
      document.getElementById('main-panel')?.style.removeProperty('--map-h');
    } else {
      applyLayout(loadLayout());
    }
  });
}

function isMobile() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function loadLayout() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function saveLayout(patch) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadLayout(), ...patch }));
  } catch {}
}

function applyLayout({ sidebarW, mapFrac } = {}) {
  setSidebarWidth(sidebarW ?? SIDEBAR_DEFAULT);
  setMapFrac(mapFrac ?? MAP_FRAC_DEFAULT);
}

function setSidebarWidth(w) {
  const clamped = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, w));
  document.getElementById('app')?.style.setProperty('--sidebar-w', `${clamped}px`);
}

function setMapFrac(frac) {
  const clamped = Math.max(MAP_FRAC_MIN, Math.min(MAP_FRAC_MAX, frac));
  document.getElementById('main-panel')?.style.setProperty('--map-h', `${(clamped * 100).toFixed(1)}%`);
}

function notifyMapResized() {
  window.dispatchEvent(new CustomEvent('tt:map-resized'));
}

function initColResizer(handle) {
  if (!handle) return;
  let startX, startW, raf;

  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    startX = e.clientX ?? e.touches?.[0]?.clientX;
    startW = document.getElementById('sidebar')?.getBoundingClientRect().width ?? SIDEBAR_DEFAULT;
    handle.classList.add('resize-handle--dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  function onMove(e) {
    if (e.cancelable) e.preventDefault();
    const x = e.clientX ?? e.touches?.[0]?.clientX;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => setSidebarWidth(startW + (x - startX)));
  }

  function onUp() {
    handle.classList.remove('resize-handle--dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    cancelAnimationFrame(raf);
    const w = document.getElementById('sidebar')?.getBoundingClientRect().width;
    if (w) saveLayout({ sidebarW: Math.round(w) });
    notifyMapResized();
  }

  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, { passive: false });
  // Double-click resets to default
  handle.addEventListener('dblclick', () => {
    setSidebarWidth(SIDEBAR_DEFAULT);
    saveLayout({ sidebarW: SIDEBAR_DEFAULT });
    notifyMapResized();
  });
}

function initRowResizer(handle) {
  if (!handle) return;
  let startY, startH, panelH, raf;

  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    startY = e.clientY ?? e.touches?.[0]?.clientY;
    startH = document.getElementById('map-panel-wrapper')?.getBoundingClientRect().height ?? 0;
    panelH = document.getElementById('main-panel')?.getBoundingClientRect().height ?? 1;
    handle.classList.add('resize-handle--dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  function onMove(e) {
    if (e.cancelable) e.preventDefault();
    const y = e.clientY ?? e.touches?.[0]?.clientY;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      setMapFrac((startH + (y - startY)) / panelH);
      notifyMapResized();
    });
  }

  function onUp() {
    handle.classList.remove('resize-handle--dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    cancelAnimationFrame(raf);
    const h = document.getElementById('map-panel-wrapper')?.getBoundingClientRect().height ?? 0;
    const ph = document.getElementById('main-panel')?.getBoundingClientRect().height ?? 1;
    if (ph > 0) saveLayout({ mapFrac: h / ph });
  }

  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, { passive: false });
  // Double-click resets to default split
  handle.addEventListener('dblclick', () => {
    setMapFrac(MAP_FRAC_DEFAULT);
    saveLayout({ mapFrac: MAP_FRAC_DEFAULT });
    notifyMapResized();
  });
}
