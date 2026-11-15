// Building blocks shared by several screens.

import { h, setText, setAttr, holdButton, icon } from '../dom.js';
import { go } from '../store.js';

// The top of a sheet: an optional back button, the title, anything else on
// the right, and a close button that returns to Brew.
export function sheetHead({ title, sub = null, back = null, right = [] }) {
  const titleEl = h('h1', { class: 'page-title', text: title || '' });
  const subEl = h('span', { class: 'page-sub' });
  if (sub) setText(subEl, sub);
  const el = h('header', { class: 'sheet-head' },
    back ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': back.label, onClick: back.onClick }, icon('back')) : null,
    h('div', { class: 'page-head-text' }, titleEl, subEl),
    h('div', { class: 'sheet-right' }, right),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onClick: () => go('home') }, icon('close')));
  return { el, titleEl, subEl };
}

export function card(cls, ...kids) {
  return h('section', { class: `card ${cls}` }, ...kids);
}

// ── Settings rows ────────────────────────────────────────────────────────

function row(label, hint, control) {
  const hintEl = h('span', { class: 'set-hint', text: hint || '' });
  const el = h('div', { class: 'set-row' },
    h('div', { class: 'set-text' }, h('span', { class: 'set-label', text: label }), hintEl),
    control);
  return { el, hintEl };
}

// On/off switch. `read` returns true, false, or null when the value is unknown.
export function toggleRow({ label, hint, read, write }) {
  const button = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': label },
    h('span', { class: 'switch-knob', 'aria-hidden': 'true' }));
  button.addEventListener('click', () => { const v = read(); if (v !== null) write(!v); });
  const r = row(label, hint, button);
  return {
    el: r.el,
    update() {
      const v = read();
      setAttr(button, 'aria-checked', v ? 'true' : 'false');
      setAttr(button, 'disabled', v === null);
    },
  };
}

// A few named choices. `hint` may be a function of the current value.
export function choiceRow({ label, hint, options, read, write }) {
  const buttons = options.map((o) => h('button', { class: 'seg seg-small', type: 'button', text: o.label, onClick: () => write(o.value) }));
  const r = row(label, typeof hint === 'string' ? hint : '', h('div', { class: 'seg-row', role: 'group', 'aria-label': label }, buttons));
  r.el.classList.add('set-row-stack');
  return {
    el: r.el,
    update() {
      const v = read();
      buttons.forEach((b, i) => {
        setAttr(b, 'aria-pressed', options[i].value === v ? 'true' : 'false');
        setAttr(b, 'disabled', v === null);
      });
      if (typeof hint === 'function') setText(r.hintEl, hint(v));
    },
  };
}

// A number with small minus and plus buttons, for a settings row.
export function numberRow({ label, hint, less, more, read, write, step, format, enabled }) {
  const value = h('span', { class: 'mini-value' });
  const minus = holdButton('−', less, () => change(-step));
  const plus = holdButton('+', more, () => change(step));
  minus.classList.add('step-small');
  plus.classList.add('step-small');
  const r = row(label, hint, h('div', { class: 'mini-stepper' }, minus, value, plus));
  function change(by) {
    const current = Number(read());
    if (Number.isFinite(current)) write(current + by);
  }
  return {
    el: r.el,
    update() {
      const raw = read();
      const known = raw !== null && raw !== '' && raw !== undefined && Number.isFinite(Number(raw));
      const on = known && (!enabled || enabled());
      setText(value, known ? format(Number(raw)) : '–');
      setAttr(minus, 'disabled', !on);
      setAttr(plus, 'disabled', !on);
      setAttr(r.el, 'data-off', !on);
    },
  };
}
