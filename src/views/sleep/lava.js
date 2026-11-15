// Crema lava lamp: slow blobs of crema that merge and part. Each bag you
// have open gets its own colour from its roast: pale gold for light, warm
// brown for medium, dark chocolate for dark.

import { h, setText, replaceKids } from '../../dom.js';
import { openBags } from '../../store.js';
import { timeText, dateText, roastColors, rand, loop } from './common.js';

const BLOBS = 11;

export function createLava() {
  const goo = h('div', { class: 'lava-goo', 'aria-hidden': 'true' });
  // Blur the blobs, then sharpen only their edges (alpha), so touching blobs
  // merge like wax while keeping their own colours.
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  filter.setAttribute('class', 'lava-defs');
  filter.innerHTML = '<filter id="lava-goo"><feGaussianBlur in="SourceGraphic" stdDeviation="22" result="b"/>'
    + '<feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -11" result="g"/>'
    + '<feComposite in="SourceGraphic" in2="g" operator="atop"/></filter>';
  const clock = h('span', { class: 'lava-clock' });
  const date = h('span', { class: 'lava-date' });
  const legend = h('div', { class: 'lava-legend' });
  const el = h('div', { class: 'sleep-style lava' },
    filter, goo, h('div', { class: 'lava-gloss', 'aria-hidden': 'true' }),
    h('div', { class: 'lava-text drift' }, clock, date), legend);

  let blobs = [];
  let key = '';

  function build(colors) {
    blobs = [];
    const kids = [];
    for (let i = 0; i < BLOBS; i += 1) {
      const [main, light] = colors[i % colors.length];
      const size = rand(9, 19);
      const node = h('span', { class: 'blob', style: `width:${size}rem;height:${size}rem;background:radial-gradient(circle at 35% 30%, ${light}, ${main} 70%)` });
      kids.push(node);
      blobs.push({
        node, x: rand(0.1, 0.9), y: rand(0.1, 0.9), size,
        fx: rand(0.02, 0.06), fy: rand(0.03, 0.08), px: rand(0, 6.28), py: rand(0, 6.28), ax: rand(0.12, 0.32), ay: rand(0.25, 0.42),
      });
    }
    replaceKids(goo, kids);
  }

  const anim = loop((dt, t) => {
    const w = goo.clientWidth || 1340;
    const hgt = goo.clientHeight || 800;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    for (const b of blobs) {
      // Blobs rise and sink slowly, like wax in a lamp.
      const x = (b.x + Math.sin(t * b.fx + b.px) * b.ax) * w;
      const y = (0.5 + Math.sin(t * b.fy + b.py) * b.ay) * hgt;
      const r = (b.size * rem) / 2;
      b.node.style.transform = `translate(${(x - r).toFixed(1)}px, ${(y - r).toFixed(1)}px)`;
    }
  });

  function update() {
    setText(clock, timeText());
    setText(date, dateText());
    const bags = openBags();
    const colors = bags.length ? bags.map((b) => roastColors(b.batch.roastLevel)) : [roastColors('light'), roastColors('medium')];
    const k = bags.map((b) => `${b.batch.id}:${b.batch.roastLevel}`).join(',') || 'none';
    if (k !== key) {
      key = k;
      build(colors);
      replaceKids(legend, bags.map((b) => h('span', { class: 'lava-key' },
        h('i', { style: `background:${roastColors(b.batch.roastLevel)[0]}` }), b.bean.name)));
    }
  }

  return { el, start() { anim.start(); }, stop() { anim.stop(); }, update };
}
