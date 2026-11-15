// Building blocks shared by several screens.

import { h, setText, setAttr, holdButton } from '../dom.js';
import { S, status, waterLabel, tare, scan } from '../store.js';
import { num } from '../format.js';

// A labelled value with minus and plus buttons.
export function stepper({ label, unit = '', less, more, read, write, step, format }) {
  const value = h('span', { class: 'stepper-value' });
  const unitEl = h('span', { class: 'stepper-unit', text: unit });
  const minus = holdButton('−', less, () => change(-step));
  const plus = holdButton('+', more, () => change(step));
  const el = h('div', { class: 'stepper' },
    h('span', { class: 'label', text: label }),
    h('div', { class: 'stepper-read' }, value, unitEl),
    h('div', { class: 'stepper-buttons' }, minus, plus));

  function change(by) {
    const current = Number(read());
    if (!Number.isFinite(current)) return;
    write(current + by);
  }

  function update() {
    const raw = read();
    const numeric = raw !== '' && raw != null && Number.isFinite(Number(raw));
    setText(value, numeric ? format(Number(raw)) : (raw ? String(raw) : '–'));
    const locked = !numeric && raw !== '' && raw != null;
    setAttr(minus, 'disabled', locked);
    setAttr(plus, 'disabled', locked);
  }

  return { el, update };
}

// Screen heading with the machine's status line and a few live readings.
export function header({ title = null, sub = null, chips = ['group', 'water', 'scale'] } = {}) {
  const dot = h('span', { class: 'status-dot', 'aria-hidden': 'true' });
  const titleEl = h('h1', { class: 'page-title' });
  const subEl = h('span', { class: 'page-sub' });
  const look = h('button', { class: 'btn btn-outline btn-small', type: 'button', onClick: scan, text: 'Look again' });

  const chipEls = {};
  const chipRow = h('div', { class: 'chips' });
  for (const name of chips) {
    const valueEl = h('span', { class: 'chip-value' });
    if (name === 'scale') {
      chipEls.scaleLabel = h('span', { class: 'chip-label', text: 'Scale' });
      chipEls.scale = valueEl;
      chipEls.scaleBtn = h('button', { class: 'chip chip-button', type: 'button', onClick: tare }, chipEls.scaleLabel, valueEl);
      chipRow.append(chipEls.scaleBtn);
    } else {
      const labels = { group: 'Group', water: 'Water tank', steam: 'Steam' };
      chipEls[name] = valueEl;
      if (name === 'water') {
        // A small tank that fills and changes colour with the level.
        chipEls.tankFill = h('span', { class: 'tank-fill' });
        chipEls.waterWord = h('span', { class: 'chip-word' });
        chipEls[`${name}Box`] = h('div', { class: 'chip chip-water' },
          h('span', { class: 'tank', 'aria-hidden': 'true' }, chipEls.tankFill),
          h('span', { class: 'chip-stack' },
            h('span', { class: 'chip-label', text: labels[name] }),
            h('span', { class: 'chip-line' }, valueEl, chipEls.waterWord)));
      } else {
        chipEls[`${name}Box`] = h('div', { class: 'chip' }, h('span', { class: 'chip-label', text: labels[name] }), valueEl);
      }
      chipRow.append(chipEls[`${name}Box`]);
    }
  }

  const el = h('header', { class: 'page-head' },
    h('div', { class: 'page-head-left' }, dot, h('div', { class: 'page-head-text' }, titleEl, subEl), look),
    chipRow);

  function update() {
    const st = status();
    setAttr(dot, 'data-tone', st.tone);
    setText(titleEl, title || st.title);
    setText(subEl, title ? (typeof sub === 'function' ? sub(st) : (sub || st.title)) : st.sub);
    setAttr(look, 'hidden', S.machineConnected);
    const snap = S.snap;
    if (chipEls.group) setText(chipEls.group, snap ? `${num(snap.groupTemperature, 0)} °C` : '–');
    if (chipEls.steam) setText(chipEls.steam, snap && snap.steamTemperature > 0 ? `${num(snap.steamTemperature, 0)} °C` : '–');
    if (chipEls.water) {
      const water = waterLabel();
      setText(chipEls.water, water.text);
      setText(chipEls.waterWord, water.level && water.level !== 'empty' ? water.word : '');
      setAttr(chipEls.waterBox, 'data-level', water.level);
      setAttr(chipEls.waterBox, 'aria-label', water.level ? `Water tank: ${water.text}, ${water.word.toLowerCase()}` : 'Water tank: unknown');
      chipEls.tankFill.style.height = `${Math.round(water.pct * 100)}%`;
    }
    if (chipEls.scale) {
      const on = S.scaleConnected && S.scale.weight != null;
      setText(chipEls.scaleLabel, on ? 'Scale · tap to zero' : 'Scale');
      setText(chipEls.scale, on ? `${num(S.scale.weight, 1)} g` : 'Not connected');
      setAttr(chipEls.scaleBtn, 'disabled', !on);
    }
  }

  return { el, update };
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
