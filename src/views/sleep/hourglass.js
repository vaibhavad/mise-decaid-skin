// Grounds hourglass: grounds trickle through an hourglass as the hour goes
// by. The pile at the bottom is this week's shots, one layer per shot,
// coloured by how you said it tasted.

import { h, setText, replaceKids } from '../../dom.js';
import { S } from '../../store.js';
import { timeText, dateText, TASTE_COLORS, NO_TASTE, loop, fitCanvas, rand } from './common.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const k of kids) if (k) el.append(k);
  return el;
};

// The glass, in a 300 x 460 box: two bulbs joined at a narrow neck.
const TOP = 'M40 20 H260 C260 120 200 170 158 222 H142 C100 170 40 120 40 20 Z';
const BOTTOM = 'M142 238 H158 C200 290 260 340 260 440 H40 C40 340 100 290 142 238 Z';

function weekStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function createHourglass() {
  const clock = h('span', { class: 'hg-clock' });
  const date = h('span', { class: 'hg-date' });
  const minutesLeft = h('span', { class: 'hg-left' });
  const count = h('span', { class: 'hg-count' });
  const legend = h('div', { class: 'hg-legend' });

  const topSand = svg('rect', { x: 0, y: 0, width: 300, height: 0, class: 'hg-sand' });
  const layers = svg('g');
  const glass = svg('svg', { class: 'hg-glass', viewBox: '0 0 300 460', 'aria-hidden': 'true' },
    svg('defs', {},
      svg('clipPath', { id: 'hg-top' }, svg('path', { d: TOP })),
      svg('clipPath', { id: 'hg-bottom' }, svg('path', { d: BOTTOM }))),
    svg('g', { 'clip-path': 'url(#hg-top)' }, topSand),
    svg('g', { 'clip-path': 'url(#hg-bottom)' }, layers),
    svg('path', { d: TOP, class: 'hg-outline' }), svg('path', { d: BOTTOM, class: 'hg-outline' }),
    svg('rect', { x: 30, y: 4, width: 240, height: 16, rx: 6, class: 'hg-cap' }),
    svg('rect', { x: 30, y: 440, width: 240, height: 16, rx: 6, class: 'hg-cap' }));
  const stream = h('canvas', { class: 'hg-stream', 'aria-hidden': 'true' });

  const el = h('div', { class: 'sleep-style hourglass' },
    h('div', { class: 'hg-wrap' }, glass, stream),
    h('div', { class: 'hg-text drift' }, clock, date, minutesLeft,
      h('div', { class: 'hg-week' }, count, legend)));

  // A thin stream of falling grains through the neck.
  let grains = [];
  let pileTop = 440;
  const anim = loop((dt) => {
    const { ctx, w, h: hgt } = fitCanvas(stream);
    ctx.clearRect(0, 0, w, hgt);
    const scale = hgt / 460;
    const cx = w / 2;
    if (grains.length < 40) grains.push({ y: 228 + rand(0, 10), x: rand(-1.6, 1.6), v: rand(40, 80) });
    ctx.fillStyle = '#C79A66';
    for (const g of grains) {
      g.v += 260 * dt;
      g.y += g.v * dt;
      if (g.y > pileTop) { g.y = 228; g.v = rand(30, 70); g.x = rand(-1.6, 1.6); }
      ctx.beginPath();
      ctx.arc(cx + g.x * scale, g.y * scale, 1.6 * scale, 0, 6.283);
      ctx.fill();
    }
  });

  let key = '';
  function update() {
    const now = new Date();
    setText(clock, timeText(now));
    setText(date, dateText(now));
    const left = 60 - now.getMinutes();
    setText(minutesLeft, `${left} ${left === 1 ? 'minute' : 'minutes'} left in this hour`);
    // Top bulb: full at the start of the hour, empty at the end.
    const frac = 1 - (now.getMinutes() * 60 + now.getSeconds()) / 3600;
    const sandH = 200 * frac;
    topSand.setAttribute('y', String(222 - sandH));
    topSand.setAttribute('height', String(sandH));

    const since = weekStart(now);
    const week = (S.yearShots || []).filter((s) => s.t >= since).sort((a, b) => a.t - b.t);
    const k = `${week.length}|${week.map((s) => s.taste).join(',')}`;
    if (k !== key) {
      key = k;
      const each = week.length ? Math.min(14, 190 / week.length) : 0;
      replaceKids(layers, week.map((s, i) => svg('rect', {
        x: 0, y: String(440 - (i + 1) * each), width: 300, height: String(each + 0.6),
        fill: TASTE_COLORS[s.taste] || NO_TASTE, class: 'hg-layer',
      })));
      pileTop = 440 - week.length * each;
      setText(count, week.length ? `This week: ${week.length} ${week.length === 1 ? 'shot' : 'shots'}` : 'No shots yet this week');
      const tally = {};
      for (const s of week) tally[s.taste || 'No taste'] = (tally[s.taste || 'No taste'] || 0) + 1;
      replaceKids(legend, Object.entries(tally).map(([name, n]) => h('span', { class: 'hg-key' },
        h('i', { style: `background:${TASTE_COLORS[name] || NO_TASTE}` }), `${name} · ${n}`)));
    }
  }

  return { el, start() { anim.start(); }, stop() { anim.stop(); }, update };
}
