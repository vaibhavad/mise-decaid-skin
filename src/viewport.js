// The on-screen keyboard as an overlay.
//
// Inside the Decaid app, opening the keyboard shrinks the page to the space
// above it. Mise sizes everything from the screen, so without this the whole
// skin would shrink and reflow. Instead the layout keeps the full-screen size
// it had before the keyboard opened, the keyboard simply covers the bottom,
// and if the field you are typing in would be hidden, only the layer holding
// it slides up until the field is visible.

const root = document.documentElement;
let stableW = 0;
let stableH = 0;
let panned = null;

function editable(el) {
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'file', 'submit'].includes(el.type);
}

// The part of the screen not covered by the keyboard.
function visibleHeight() {
  const vv = window.visualViewport;
  return Math.round(Math.min(window.innerHeight, vv ? vv.height + vv.offsetTop : Infinity));
}

function measure() {
  const w = window.innerWidth;
  const hgt = window.innerHeight;
  // A new width (rotation, split screen) or a taller page is a real change of
  // size. The page getting shorter at the same width is the keyboard: ignore it.
  if (!stableH || w !== stableW || hgt > stableH) {
    stableW = w;
    stableH = hgt;
    root.style.setProperty('--app-w', `${stableW}px`);
    root.style.setProperty('--app-h', `${stableH}px`);
    root.style.fontSize = `${Math.min(stableW / 83.75, stableH / 50)}px`;
  }
  pan();
}

function offsetOf(layer) {
  const t = getComputedStyle(layer).transform;
  if (!t || t === 'none') return 0;
  try { return new DOMMatrixReadOnly(t).m42; } catch { return 0; }
}

function pan() {
  // The browser may scroll the page to show the field; the layer moves instead.
  if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
  const el = document.activeElement;
  const layer = editable(el) ? el.closest('.backdrop, .scrim, .shot-view, .sheet, .main') : null;
  let shift = 0;
  const visible = visibleHeight();
  if (layer && visible < stableH - 8) {
    // Where the field sits with the layer unmoved, even mid-slide.
    const now = offsetOf(layer);
    const rect = el.getBoundingClientRect();
    const margin = 16;
    const over = rect.bottom - now + margin - visible;
    if (over > 0) shift = Math.min(over, Math.max(0, rect.top - now - margin));
  }
  if (panned && panned !== layer) panned.style.transform = '';
  if (layer && shift > 0) {
    layer.style.transform = `translateY(${-Math.round(shift)}px)`;
    panned = layer;
  } else {
    if (layer) layer.style.transform = '';
    panned = null;
  }
}

export function watchViewport() {
  measure();
  window.addEventListener('resize', measure);
  window.visualViewport?.addEventListener('resize', measure);
  window.addEventListener('scroll', () => { if (window.scrollY || window.scrollX) window.scrollTo(0, 0); });
  document.addEventListener('focusin', () => setTimeout(pan, 60));
  document.addEventListener('focusout', () => setTimeout(pan, 60));
}
