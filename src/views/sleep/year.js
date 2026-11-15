// A year in coffee: one dot for every day of the year in a ring around the
// clock, brighter on days you brewed more. Today glows; days to come are
// faint outlines.

import { h, setText, replaceKids } from '../../dom.js';
import { S } from '../../store.js';
import { timeText, dateText } from './common.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, text) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text) el.textContent = text;
  return el;
};
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function createYear() {
  const dots = svg('g');
  const labels = svg('g');
  const ring = svg('svg', { class: 'year-ring', viewBox: '-400 -400 800 800', 'aria-hidden': 'true' });
  ring.append(labels, dots);
  const clock = h('span', { class: 'year-clock' });
  const date = h('span', { class: 'year-date' });
  const total = h('span', { class: 'year-total' });
  const facts = h('span', { class: 'year-facts' });
  const el = h('div', { class: 'sleep-style year' },
    h('div', { class: 'year-wrap drift' }, ring,
      h('div', { class: 'year-centre' }, clock, date, total, facts)));

  let key = '';
  function update() {
    const now = new Date();
    setText(clock, timeText(now));
    setText(date, dateText(now));
    const shots = S.yearShots || [];
    const k = `${shots.length}|${dayKey(now)}`;
    if (k === key) return;
    key = k;

    const year = now.getFullYear();
    const start = new Date(year, 0, 1);
    const days = Math.round((new Date(year + 1, 0, 1) - start) / 86400000);
    const counts = {};
    for (const s of shots) {
      const d = dayKey(new Date(s.t));
      counts[d] = (counts[d] || 0) + 1;
    }
    const todayIndex = Math.floor((new Date(year, now.getMonth(), now.getDate()) - start) / 86400000);
    const R = 330;
    const kids = [];
    let busiest = 0;
    let streak = 0;
    let best = 0;
    for (let i = 0; i < days; i += 1) {
      const d = new Date(year, 0, 1 + i);
      const n = counts[dayKey(d)] || 0;
      busiest = Math.max(busiest, n);
      if (i <= todayIndex) { streak = n ? streak + 1 : 0; best = Math.max(best, streak); }
      const a = (i / days) * 2 * Math.PI - Math.PI / 2;
      const x = Math.cos(a) * R;
      const y = Math.sin(a) * R;
      const level = i > todayIndex ? 'future' : (n === 0 ? 'none' : `n${Math.min(n, 4)}`);
      kids.push(svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: n ? 2.6 + Math.min(n, 4) * 0.9 : 2.4, class: `yd ${level}${i === todayIndex ? ' today' : ''}` }));
    }
    replaceKids(dots, kids);
    replaceKids(labels, MONTHS.map((m, i) => {
      const a = ((new Date(year, i, 1) - start) / 86400000 / days) * 2 * Math.PI - Math.PI / 2;
      return svg('text', { x: (Math.cos(a) * (R + 34)).toFixed(1), y: (Math.sin(a) * (R + 34) + 5).toFixed(1), class: 'ym', 'text-anchor': 'middle' }, m);
    }));
    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeek = shots.filter((s) => s.t >= weekAgo).length;
    setText(total, shots.length ? `${shots.length} shots so far in ${year}` : `No shots yet in ${year}`);
    setText(facts, shots.length ? [`busiest day ${busiest}`, `longest streak ${best} ${best === 1 ? 'day' : 'days'}`, `${thisWeek} this week`].join(' · ') : '');
  }

  return { el, start() {}, stop() {}, update };
}
