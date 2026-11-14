// Small DOM helpers. No framework: views build their elements once and
// then update text and attributes in place.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'line', 'circle', 'g', 'text', 'rect']);

export function h(tag, props, ...kids) {
  const el = SVG_TAGS.has(tag)
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'text') el.textContent = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
      else el.setAttribute(key, value === true ? '' : value);
    }
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    if (Array.isArray(kid)) append(el, kid);
    else el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
}

export function setText(el, value) {
  const text = String(value);
  if (el.__text !== text) {
    el.__text = text;
    el.textContent = text;
  }
}

export function setAttr(el, name, value) {
  const cache = el.__attrs || (el.__attrs = {});
  const next = value == null || value === false ? null : String(value === true ? '' : value);
  if (cache[name] === next) return;
  cache[name] = next;
  if (next === null) el.removeAttribute(name);
  else el.setAttribute(name, next);
}

export function show(el, visible) {
  setAttr(el, 'hidden', !visible);
}

export function replaceKids(el, kids) {
  el.replaceChildren();
  append(el, kids);
}

const ICONS = {
  brew: 'M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8z M16 10h2a2 2 0 0 1 0 4h-2',
  recipes: 'M5 6h14M5 12h14M5 18h9',
  water: 'M12 3.5c3 3.6 5.5 6.6 5.5 9.8a5.5 5.5 0 0 1-11 0c0-3.2 2.5-6.2 5.5-9.8z',
  history: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17z M12 7.5V12l3 2',
  settings: 'M5 8h9M18 8h1M5 16h1M10 16h9 M16 6a2 2 0 1 0 0 4a2 2 0 0 0 0-4z M8 14a2 2 0 1 0 0 4a2 2 0 0 0 0-4z',
  sleep: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z',
  star: 'M12 4l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z',
  check: 'M4.5 12.5l4.8 4.5L19.5 6.5',
  exit: 'M4 11.5l8-7 8 7 M6.5 10v9.5h11V10 M10 19.5v-5h4v5',
  pencil: 'M4.5 19.5h3.6L19 8.6 15.4 5 4.5 15.9v3.6z M13.4 7l3.6 3.6',
};

export function icon(name, cls = 'icon') {
  return h('svg', { class: cls, viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    h('path', { d: ICONS[name] }));
}

// A button that acts once on press and then repeats while held, so a value
// can be moved a long way without dozens of taps.
export function holdButton(label, ariaLabel, action) {
  const button = h('button', { class: 'step-btn', type: 'button', 'aria-label': ariaLabel, text: label });
  let delay = null;
  let repeat = null;
  const stop = () => {
    clearTimeout(delay);
    clearInterval(repeat);
    delay = repeat = null;
  };
  button.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    stop();
    action();
    delay = setTimeout(() => { repeat = setInterval(action, 90); }, 450);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) {
    button.addEventListener(type, stop);
  }
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); }
  });
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  return button;
}
