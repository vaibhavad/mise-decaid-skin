// Shot fingerprints: each shot's pressure, flow and weight curves wrapped
// around a centre and repeated, so every shot makes its own slowly turning
// pattern. Today's shots, or your latest ones if you have not brewed today.

import { h, setText, replaceKids } from '../../dom.js';
import { S, loadShotDetail, displayTitle } from '../../store.js';
import { timeText, dateText, loop, fitCanvas } from './common.js';

const PETALS = 6;

function polar(samples, value, max, r0, r1) {
  const T = samples[samples.length - 1].t || 1;
  return samples.map((s) => {
    const v = value(s);
    return { a: (s.t / T) * (2 * Math.PI / PETALS), r: r0 + (r1 - r0) * Math.min(1, Math.max(0, v / max)) };
  });
}

function drawFlower(ctx, pts, color, width, spin, R) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let k = 0; k < PETALS; k += 1) {
    for (const mirror of [1, -1]) {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const a = spin + k * (2 * Math.PI / PETALS) + mirror * p.a;
        const x = Math.cos(a) * p.r * R;
        const y = Math.sin(a) * p.r * R;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
  }
}

export function createFingerprints() {
  const clock = h('span', { class: 'fp-clock' });
  const title = h('span', { class: 'fp-title' });
  const canvas = h('canvas', { class: 'fp-canvas', 'aria-hidden': 'true' });
  const captions = h('div', { class: 'fp-captions' });
  const empty = h('p', { class: 'fp-empty', hidden: true, text: 'Your shots will bloom here once you have pulled a few.' });
  const el = h('div', { class: 'sleep-style fingerprints' },
    canvas,
    h('div', { class: 'fp-head drift' }, clock, title),
    captions, empty);

  let shots = [];
  let built = '';
  let pending = '';

  function pick() {
    const all = (S.yearShots || []).slice().sort((a, b) => b.t - a.t);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    let list = all.filter((s) => s.t >= start.getTime());
    let label = 'Today\'s shots';
    if (!list.length) {
      // Your latest shots; ones without a recording are skipped when drawing.
      list = all.slice(0, 12);
      label = 'Your latest shots';
    }
    return { list: list.slice(0, 12), label };
  }

  const anim = loop((dt, t) => {
    const { ctx, w, h: hgt } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, hgt);
    const ready = shots.filter((s) => s.samples?.length > 3).slice(0, 6);
    if (!ready.length) return;
    const cols = ready.length <= 3 ? ready.length : 3;
    const rows = Math.ceil(ready.length / cols);
    const cellW = w / cols;
    const cellH = (hgt - 150) / rows;
    const R = Math.min(cellW, cellH) * 0.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ready.forEach((shot, i) => {
      const cx = cellW * (i % cols + 0.5);
      const cy = 110 + cellH * (Math.floor(i / cols) + 0.5) - 14;
      const spin = t * 0.05 * (i % 2 ? -1 : 1) + i;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(76,195,138,0.5)';
      drawFlower(ctx, shot.p, 'rgba(76,195,138,0.55)', 1.6, spin, R);
      ctx.shadowColor = 'rgba(107,164,255,0.5)';
      drawFlower(ctx, shot.f, 'rgba(107,164,255,0.55)', 1.4, -spin * 0.7, R);
      if (shot.w) {
        ctx.shadowColor = 'rgba(217,160,102,0.5)';
        drawFlower(ctx, shot.w, 'rgba(217,160,102,0.5)', 1.2, spin * 0.4, R);
      }
      ctx.restore();
    });
  });

  async function prepare(list) {
    for (const s of list) if (!S.shotDetails[s.id]) await loadShotDetail(s.id);
    shots = list.map((s) => {
      const d = S.shotDetails[s.id];
      const samples = d?.samples || [];
      if (samples.length < 4) return { id: s.id, samples };
      let maxW = 1;
      for (const x of samples) if (x.w != null && x.w > maxW) maxW = x.w;
      // Radii on a unit scale; drawing multiplies them by the cell size.
      return {
        id: s.id, samples, at: s.t, out: d.out, seconds: d.seconds, title: displayTitle(d.record?.workflow?.profile?.title),
        p: polar(samples, (x) => x.p, 11, 0.18, 1),
        f: polar(samples, (x) => x.f, 8, 0.12, 0.85),
        w: samples.some((x) => x.w != null) ? polar(samples, (x) => x.w ?? 0, maxW, 0.05, 0.55) : null,
      };
    });
    built = '';
    update();
  }

  function update() {
    setText(clock, timeText());
    const { list, label } = pick();
    setText(title, `${label} · ${dateText()}`);
    const key = list.map((s) => s.id).join(',');
    if (key !== shots.map((s) => s.id).join(',') && key !== pending) {
      pending = key;
      prepare(list).finally(() => { pending = ''; });
    }
    const ready = shots.filter((s) => s.samples?.length > 3).slice(0, 6);
    empty.hidden = ready.length > 0;
    const k2 = ready.map((s) => s.id).join(',');
    if (k2 !== built) {
      built = k2;
      captions.dataset.cols = String(ready.length <= 3 ? ready.length : 3);
      replaceKids(captions, ready.map((s) => h('div', { class: 'fp-cap' },
        h('strong', { text: new Date(s.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }),
        h('span', { text: [s.title, s.out ? `${s.out.toFixed(1)} g` : null, s.seconds ? `${Math.round(s.seconds)} s` : null].filter(Boolean).join(' · ') }))));
    }
  }

  return { el, start() { anim.start(); }, stop() { anim.stop(); }, update };
}
