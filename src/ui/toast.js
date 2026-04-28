/**
 * Toast notifications — small, transient status messages.
 *
 * Announced to assistive tech via aria-live, dismissable by clicking the ×,
 * and auto-dismissed after `duration` ms.
 */

const DEFAULT_DURATION = 3000;

export function showToast(msg, opts = {}) {
  const duration = opts.duration ?? DEFAULT_DURATION;
  const variant = opts.variant || 'info';

  const el = document.createElement('div');
  el.className = `toast toast--${variant}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');

  const text = document.createElement('span');
  text.textContent = msg;
  el.appendChild(text);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast__close';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.textContent = '×';
  close.addEventListener('click', () => dismiss());
  el.appendChild(close);

  document.body.appendChild(el);

  let timer = setTimeout(dismiss, duration);

  function dismiss() {
    clearTimeout(timer);
    el.classList.add('toast--dismissing');
    setTimeout(() => el.remove(), 180);
  }

  return dismiss;
}
