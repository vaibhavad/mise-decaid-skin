// The ruler: one way to change any number. Drag the scale, tap a preset, or
// nudge with − and +; nothing reaches the machine until Save.
//
// S.editor = { label, unit, value, min, max, step, digits, presets: [{ label, value }],
//              hint, save(value) }

import { h, setText, setAttr, show, replaceKids } from '../dom.js';
import { S, closeEditor } from '../store.js';
import { clamp } from '../format.js';

const PX = 18; // pixels per step on the scale

export function createRuler() {
  const title = h('h2', { class: 'ruler-title' });
  const hint = h('p', { class: 'ruler-hint' });
  const value = h('span', { class: 'ruler-value' });
  const unit = h('span', { class: 'ruler-unit' });
  const ticks = h('div', { class: 'ruler-ticks', 'aria-hidden': 'true' });
  const track = h('div', { class: 'ruler-track', role: 'slider', tabindex: '0' }, ticks, h('span', { class: 'ruler-needle' }));
  const minus = nudgeButton('−', 'Less', -1);
  const plus = nudgeButton('+', 'More', 1);
  const presets = h('div', { class: 'ruler-presets' });
  const cancel = h('button', { class: 'btn btn-outline', type: 'button', text: 'Cancel', onClick: closeEditor });
  const save = h('button', { class: 'btn btn-primary', type: 'button', text: 'Save', onClick: commit });

  const panel = h('div', { class: 'ruler', role: 'dialog', 'aria-modal': 'true' },
    title, hint,
    h('div', { class: 'ruler-read' }, minus, h('div', { class: 'ruler-number' }, value, unit), plus),
    track, presets,
    h('div', { class: 'ruler-actions' }, cancel, save));
  const el = h('div', { class: 'scrim', hidden: true }, panel);
  el.addEventListener('pointerdown', (e) => { if (e.target === el) closeEditor(); });

  let spec = null;
  let current = 0;
  let built = null;

  const snap = (v) => {
    const n = Math.round((v - spec.min) / spec.step);
    return clamp(spec.min + n * spec.step, spec.min, spec.max);
  };
  const fmt = (v) => (spec.format ? spec.format(v) : v.toFixed(spec.digits ?? 0));

  function set(v) {
    current = snap(v);
    render();
  }
  function nudge(dir, by = 1) { set(current + dir * by * spec.step); }

  // − and +: one step per tap. Held, they repeat, and speed up the longer
  // you hold, so large ranges (espresso out goes to 1000 g) are quick.
  function nudgeButton(label, aria, dir) {
    const button = h('button', { class: 'ruler-nudge', type: 'button', 'aria-label': aria, text: label });
    let delay = null;
    let repeat = null;
    let started = 0;
    const stop = () => { clearTimeout(delay); clearInterval(repeat); delay = repeat = null; };
    button.addEventListener('pointerdown', (event) => {
      if (event.button > 0) return;
      stop();
      nudge(dir);
      started = Date.now();
      delay = setTimeout(() => {
        repeat = setInterval(() => {
          const held = Date.now() - started;
          nudge(dir, held > 3000 ? 10 : held > 1500 ? 5 : 1);
        }, 90);
      }, 450);
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) button.addEventListener(type, stop);
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); nudge(dir); }
    });
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    return button;
  }
  function commit() {
    const s = spec;
    const v = current;
    closeEditor();
    s.save(Number(v.toFixed(6)));
  }

  function buildTicks() {
    const count = Math.round((spec.max - spec.min) / spec.step);
    const major = spec.major || 10;
    const kids = [];
    for (let i = 0; i <= count; i += 1) {
      const v = spec.min + i * spec.step;
      // Mark round values (0, 5, 10…), not every fifth tick from wherever
      // the range happens to start.
      const n = Math.round(v / spec.step);
      const big = n % major === 0;
      const mid = major % 2 === 0 && n % (major / 2) === 0;
      kids.push(h('span', { class: big ? 'tick-mark big' : (mid ? 'tick-mark mid' : 'tick-mark'), style: `left:${i * PX}px` },
        big ? h('span', { class: 'tick-label', text: fmt(v) }) : null));
    }
    ticks.style.width = `${count * PX}px`;
    replaceKids(ticks, kids);
  }

  function render() {
    setText(value, fmt(current));
    const offset = ((current - spec.min) / spec.step) * PX;
    ticks.style.transform = `translateX(${-offset}px)`;
    setAttr(track, 'aria-valuenow', current);
    setAttr(track, 'aria-valuetext', `${fmt(current)} ${spec.unit || ''}`.trim());
    for (const b of presets.children) setAttr(b, 'aria-pressed', Math.abs(Number(b.dataset.v) - current) < spec.step / 2 ? 'true' : 'false');
  }

  // Drag the scale: moving left raises the value, like turning a dial.
  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, v: current };
    track.setPointerCapture(e.pointerId);
    ticks.classList.add('dragging');
  });
  track.addEventListener('pointermove', (e) => {
    if (!drag) return;
    set(drag.v + ((drag.x - e.clientX) / PX) * spec.step);
  });
  const end = () => { drag = null; ticks.classList.remove('dragging'); };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); nudge(-1); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); nudge(1); }
    if (e.key === 'Enter') commit();
  });

  function update() {
    const open = Boolean(S.editor);
    show(el, open);
    if (!open) { spec = null; built = null; return; }
    if (built === S.editor) return;
    built = S.editor;
    spec = S.editor;
    setText(title, spec.label);
    setText(hint, spec.hint || '');
    show(hint, Boolean(spec.hint));
    setText(unit, spec.unit || '');
    setAttr(track, 'aria-label', spec.label);
    setAttr(track, 'aria-valuemin', spec.min);
    setAttr(track, 'aria-valuemax', spec.max);
    buildTicks();
    replaceKids(presets, (spec.presets || []).map((p) => h('button', {
      class: 'chip-btn', type: 'button', 'data-v': p.value, onClick: () => set(p.value),
    }, h('span', { text: p.label }), p.detail ? h('span', { class: 'chip-detail', text: p.detail }) : null)));
    show(presets, Boolean(spec.presets?.length));
    current = snap(Number(spec.value) || spec.min);
    render();
    requestAnimationFrame(() => track.focus({ preventScroll: true }));
  }

  return { el, update };
}
