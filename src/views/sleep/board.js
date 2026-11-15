// Departure board: the next morning on flipping letters, like a station
// board. Next wake, the recipe that will be waiting, every open bag, the
// cleaning reminder, the water tank and the last shot.

import { h } from '../../dom.js';
import {
  S, nextWake, openBags, daysOffRoast, values, displayTitle, shotsSinceClean, cleaningDue, waterLabel,
} from '../../store.js';

const WIDTH = 32;
const LABEL = 7;
const CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-·>~/';
const clean = (t) => String(t || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^ A-Z0-9:.\-·>~/]/g, ' ');
const pad = (t, n) => clean(t).slice(0, n).padEnd(n, ' ');
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// "LABEL  VALUE", label in the first columns.
const row = (label, value) => pad(label, LABEL) + pad(value, WIDTH - LABEL);

function shortName(bean) {
  // "Ethiopia Guji, washed" from Ethiopia -> "GUJI"
  let name = String(bean.name || '').split(',')[0].trim();
  const country = String(bean.country || '').trim();
  if (country && name.toLowerCase().startsWith(country.toLowerCase()) && name.length > country.length + 1) name = name.slice(country.length).trim();
  return clean(name);
}

function lines(now = new Date()) {
  const out = [];
  const wake = nextWake(now);
  if (wake) {
    const d = wake.at;
    const day = d.toDateString() === now.toDateString() ? 'TODAY' : (d - now < 2 * 86400000 && d.getDate() === new Date(now.getTime() + 86400000).getDate() ? 'TOMORROW' : DAYS[d.getDay()]);
    out.push(row('WAKE', `${hhmm(d)} ${day}`));
  } else {
    out.push(row('WAKE', 'WHEN YOU TAP'));
  }
  const recipe = displayTitle(S.workflow?.profile?.title);
  if (recipe) out.push(row('RECIPE', recipe));
  const dose = values.dose();
  const yieldG = values.out();
  const grind = values.grind();
  if (dose || yieldG) out.push(row('DOSE', [dose ? `${dose.toFixed(1)}G` : null, yieldG ? `> ${Math.round(yieldG)}G` : null, grind !== '' ? `GRIND ${grind}` : null].filter(Boolean).join(' ')));
  for (const b of openBags().slice(0, 4)) {
    const age = daysOffRoast(b.batch);
    const left = Number(b.batch.weightRemaining ?? b.batch.weight);
    const shots = dose && Number.isFinite(left) ? Math.floor(left / dose) : null;
    const tail = [age != null ? `D${age}` : null, Number.isFinite(left) ? `${Math.round(left)}G` : null, shots != null ? `~${shots}` : null].filter(Boolean).join(' ');
    const room = WIDTH - LABEL - tail.length - 1;
    const name = shortName(b.bean).slice(0, room);
    out.push(row(b.inUse ? 'BAG >' : 'BAG', `${name.padEnd(room + 1)}${tail}`));
  }
  const since = shotsSinceClean();
  if (since != null) out.push(row('CLEAN', cleaningDue() ? 'DUE NOW' : `IN ${Math.max(0, S.cleaning.interval - since)} SHOTS`));
  const w = waterLabel();
  if (w.level) out.push(row('WATER', `${w.text} ${w.word}`));
  const last = S.shots?.[0];
  if (last) {
    const extra = last.annotations?.extras?.mise || {};
    const yieldOut = Number(last.annotations?.actualYield) || Number(extra.out) || null;
    const secs = Number(extra.seconds) || S.shotDetails[last.id]?.seconds || null;
    out.push(row('LAST', [hhmm(new Date(last.timestamp)), yieldOut ? `${yieldOut.toFixed(1)}G` : null, secs ? `${Math.round(secs)}S` : null, extra.taste].filter(Boolean).join(' ')));
  }
  return out.slice(0, 10);
}

export function createBoard() {
  const head = h('div', { class: 'board-row board-head' });
  const rowsEl = h('div', { class: 'board-rows' });
  const el = h('div', { class: 'sleep-style board' },
    h('div', { class: 'board-frame drift' }, head, rowsEl));

  // Each cell flips through a few letters before landing on its new one.
  const cells = new Map();
  function cell(id) {
    if (!cells.has(id)) {
      const node = h('span', { class: 'flap' }, h('span', { class: 'flap-char' }));
      cells.set(id, { node, char: ' ', timer: null });
    }
    return cells.get(id);
  }
  function setChar(c, next, delay) {
    if (c.char === next) return;
    clearTimeout(c.timer);
    let steps = 3 + Math.floor(Math.random() * 4);
    const tick = () => {
      const ch = steps > 0 ? CHARS[Math.floor(Math.random() * CHARS.length)] : next;
      c.node.firstChild.textContent = ch;
      c.node.classList.remove('flipping');
      void c.node.offsetWidth;
      c.node.classList.add('flipping');
      if (steps-- > 0) c.timer = setTimeout(tick, 70);
      else c.char = next;
    };
    c.timer = setTimeout(tick, delay);
  }
  function paint(container, prefix, text, count) {
    if (container.childElementCount !== count) {
      container.replaceChildren(...Array.from({ length: count }, (_, i) => cell(`${prefix}${i}`).node));
    }
    for (let i = 0; i < count; i += 1) setChar(cell(`${prefix}${i}`), text[i] || ' ', i * 18);
  }

  function update() {
    const now = new Date();
    paint(head, 'h', pad('MISE', WIDTH - 5) + hhmm(now), WIDTH);
    const list = lines(now);
    while (rowsEl.childElementCount < list.length) rowsEl.append(h('div', { class: 'board-row' }));
    while (rowsEl.childElementCount > list.length) rowsEl.lastChild.remove();
    list.forEach((text, r) => paint(rowsEl.children[r], `r${r}-`, text, WIDTH));
  }

  return { el, start() {}, stop() { for (const c of cells.values()) clearTimeout(c.timer); }, update };
}
