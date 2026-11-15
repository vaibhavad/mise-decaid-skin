// Shot chart (pressure, flow, weight over time) and the small recipe-shape
// preview. Plain SVG, redrawn by replacing three path strings.

import { h, setAttr, replaceKids } from './dom.js';

const PAD = { left: 40, right: 46, top: 14, bottom: 28 };

export function createChart({ width = 800, height = 430, live = false } = {}) {
  const W = width;
  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const grid = h('g', { class: 'chart-grid' });
  const targetLine = h('line', { class: 'chart-target', x1: 0, x2: plotW });
  const targetText = h('text', { class: 'chart-target-label', x: plotW - 6, 'text-anchor': 'end' });
  const paths = {
    p: h('path', { class: 'line line-pressure' }),
    f: h('path', { class: 'line line-flow' }),
    w: h('path', { class: 'line line-weight' }),
  };
  const dots = {
    p: h('circle', { class: 'dot dot-pressure', r: 5 }),
    f: h('circle', { class: 'dot dot-flow', r: 5 }),
    w: h('circle', { class: 'dot dot-weight', r: 6.5 }),
  };
  const now = h('line', { class: 'chart-now', y1: 0, y2: plotH });
  const el = h('svg', { class: 'chart', viewBox: `0 0 ${W} ${height}`, role: 'img', preserveAspectRatio: 'xMidYMid meet' },
    h('g', { transform: `translate(${PAD.left} ${PAD.top})` },
      grid, targetLine, targetText, paths.p, paths.f, paths.w,
      live ? [now, dots.p, dots.f, dots.w] : null));

  let scaleKey = '';

  function draw({ samples = [], target = 0 } = {}) {
    let maxP = 0;
    let maxW = 0;
    let lastT = 0;
    for (const s of samples) {
      if (s.p > maxP) maxP = s.p;
      if (s.f > maxP) maxP = s.f;
      if (s.w != null && s.w > maxW) maxW = s.w;
      lastT = s.t;
    }
    const yMax = Math.max(10, Math.ceil(maxP / 2) * 2);
    const wMax = Math.max(50, Math.ceil(Math.max(target * 1.2, maxW * 1.08) / 25) * 25);
    const tMax = Math.max(30, Math.ceil((lastT + 2) / 10) * 10);
    const x = (t) => (t / tMax) * plotW;
    const y = (v) => plotH - (Math.min(v, yMax) / yMax) * plotH;
    const yw = (v) => plotH - (Math.min(v, wMax) / wMax) * plotH;

    const key = `${yMax}|${wMax}|${tMax}`;
    if (key !== scaleKey) {
      scaleKey = key;
      const kids = [];
      const rows = 5;
      for (let i = 0; i <= rows; i += 1) {
        const yy = plotH - (i / rows) * plotH;
        kids.push(h('line', { class: i === 0 ? 'axis' : 'gridline', x1: 0, x2: plotW, y1: yy, y2: yy }));
        kids.push(h('text', { class: 'tick', x: -8, y: yy + 4.5, 'text-anchor': 'end', text: String(Math.round((yMax * i) / rows)) }));
        kids.push(h('text', { class: 'tick tick-weight', x: plotW + 8, y: yy + 4.5, text: i === rows ? `${Math.round(wMax)} g` : String(Math.round((wMax * i) / rows)) }));
      }
      const every = tMax <= 40 && W >= 700 ? 5 : 10;
      for (let t = 0; t <= tMax; t += every) {
        kids.push(h('text', { class: 'tick', x: x(t), y: plotH + 20, 'text-anchor': 'middle', text: t === tMax ? `${t} s` : String(t) }));
      }
      replaceKids(grid, kids);
    }

    let dp = '';
    let df = '';
    let dw = '';
    let weightStarted = false;
    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i];
      const xx = x(s.t).toFixed(1);
      dp += `${i ? 'L' : 'M'}${xx},${y(s.p).toFixed(1)}`;
      df += `${i ? 'L' : 'M'}${xx},${y(s.f).toFixed(1)}`;
      if (s.w != null) {
        dw += `${weightStarted ? 'L' : 'M'}${xx},${yw(Math.max(0, s.w)).toFixed(1)}`;
        weightStarted = true;
      }
    }
    setAttr(paths.p, 'd', dp || null);
    setAttr(paths.f, 'd', df || null);
    setAttr(paths.w, 'd', dw || null);

    const showTarget = target > 0;
    setAttr(targetLine, 'visibility', showTarget ? 'visible' : 'hidden');
    setAttr(targetText, 'visibility', showTarget ? 'visible' : 'hidden');
    if (showTarget) {
      const ty = yw(target);
      setAttr(targetLine, 'y1', ty);
      setAttr(targetLine, 'y2', ty);
      setAttr(targetText, 'y', ty - 8);
      if (targetText.__label !== target) { targetText.__label = target; targetText.textContent = `Stops at ${Math.round(target)} g`; }
    }

    if (live) {
      const last = samples[samples.length - 1];
      const vis = last ? 'visible' : 'hidden';
      for (const node of [now, dots.p, dots.f, dots.w]) setAttr(node, 'visibility', vis);
      if (last) {
        const lx = x(last.t);
        setAttr(now, 'x1', lx);
        setAttr(now, 'x2', lx);
        setAttr(dots.p, 'cx', lx); setAttr(dots.p, 'cy', y(last.p));
        setAttr(dots.f, 'cx', lx); setAttr(dots.f, 'cy', y(last.f));
        setAttr(dots.w, 'cx', lx); setAttr(dots.w, 'cy', yw(Math.max(0, last.w ?? 0)));
        setAttr(dots.w, 'visibility', last.w == null ? 'hidden' : 'visible');
      }
    }
  }

  return { el, draw };
}

// The intended shape of a recipe, drawn from its steps: pressure-controlled
// steps in green, flow-controlled steps in blue.
export function profileCurve(profile, cls = 'curve') {
  const steps = Array.isArray(profile?.steps) ? profile.steps : [];
  const w = 120;
  const hgt = 44;
  const durations = steps.map((s) => Math.max(2, Math.min(Number(s.seconds) || 0, 14)));
  const total = durations.reduce((a, b) => a + b, 0) || 1;
  const y = (v, max) => hgt - 4 - (Math.min(v, max) / max) * (hgt - 8);
  let dp = '';
  let df = '';
  let t = 0;
  let lastP = null;
  let lastF = null;
  steps.forEach((s, i) => {
    const x0 = 2 + (t / total) * (w - 4);
    t += durations[i];
    const x1 = 2 + (t / total) * (w - 4);
    const smooth = s.transition === 'smooth';
    if (s.pump === 'pressure') {
      const v = y(Number(s.pressure) || 0, 11);
      dp += lastP === null ? `M${x0.toFixed(1)},${v.toFixed(1)}` : (smooth ? '' : `L${x0.toFixed(1)},${v.toFixed(1)}`);
      dp += `L${x1.toFixed(1)},${v.toFixed(1)}`;
      lastP = v;
      lastF = null;
    } else {
      const v = y(Number(s.flow) || 0, 8);
      df += lastF === null ? `M${x0.toFixed(1)},${v.toFixed(1)}` : (smooth ? '' : `L${x0.toFixed(1)},${v.toFixed(1)}`);
      df += `L${x1.toFixed(1)},${v.toFixed(1)}`;
      lastF = v;
      lastP = null;
    }
  });
  return h('svg', { class: cls, viewBox: `0 0 ${w} ${hgt}`, 'aria-hidden': 'true' },
    h('line', { class: 'curve-base', x1: 2, x2: w - 2, y1: hgt - 4, y2: hgt - 4 }),
    dp ? h('path', { class: 'curve-pressure', d: dp }) : null,
    df ? h('path', { class: 'curve-flow', d: df }) : null);
}

// A small chart without axes, for cards.
export function miniChart() {
  const paths = {
    p: h('path', { class: 'line line-pressure' }),
    f: h('path', { class: 'line line-flow' }),
    w: h('path', { class: 'line line-weight' }),
  };
  const el = h('svg', { class: 'mini-chart', viewBox: '0 0 600 200', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    h('line', { class: 'axis', x1: 0, x2: 600, y1: 198, y2: 198 }), paths.p, paths.f, paths.w);
  let drawn = null;
  function draw(samples) {
    if (samples === drawn) return;
    drawn = samples;
    const list = samples || [];
    const tMax = Math.max(20, list.length ? list[list.length - 1].t : 0);
    let wMax = 40;
    for (const s of list) if (s.w != null && s.w > wMax) wMax = s.w;
    let dp = '';
    let df = '';
    let dw = '';
    let started = false;
    list.forEach((s, i) => {
      const xx = ((s.t / tMax) * 600).toFixed(1);
      dp += `${i ? 'L' : 'M'}${xx},${(196 - (Math.min(s.p, 11) / 11) * 190).toFixed(1)}`;
      df += `${i ? 'L' : 'M'}${xx},${(196 - (Math.min(s.f, 11) / 11) * 190).toFixed(1)}`;
      if (s.w != null) {
        dw += `${started ? 'L' : 'M'}${xx},${(196 - (Math.max(0, s.w) / (wMax * 1.1)) * 190).toFixed(1)}`;
        started = true;
      }
    });
    setAttr(paths.p, 'd', dp || null);
    setAttr(paths.f, 'd', df || null);
    setAttr(paths.w, 'd', dw || null);
  }
  return { el, draw };
}

// The recipe's shape at full size, for the recipe page: one band per step,
// numbered to match the step list, with pressure and flow on a shared scale.
// Long steps are drawn shorter so the early, busy part of a recipe stays
// readable; the width of a band is a guide, not a clock.
export function profileChart(profile, { width = 760, height = 250 } = {}) {
  const steps = Array.isArray(profile?.steps) ? profile.steps : [];
  const pad = { left: 34, right: 12, top: 30, bottom: 12 };
  const pw = width - pad.left - pad.right;
  const ph = height - pad.top - pad.bottom;
  const durations = steps.map((s) => Math.max(3, Math.min(Number(s.seconds) || 0, 25)));
  const total = durations.reduce((a, b) => a + b, 0) || 1;
  let yMax = 10;
  for (const s of steps) yMax = Math.max(yMax, Number(s.pressure) || 0, Number(s.flow) || 0);
  yMax = Math.ceil(yMax / 2) * 2;
  const y = (v) => ph - (Math.min(Math.max(v, 0), yMax) / yMax) * ph;

  const grid = [];
  for (let v = 0; v <= yMax; v += 2) {
    grid.push(h('line', { class: v === 0 ? 'axis' : 'gridline', x1: 0, x2: pw, y1: y(v), y2: y(v) }));
    grid.push(h('text', { class: 'tick', x: -8, y: y(v) + 4.5, 'text-anchor': 'end', text: String(v) }));
  }
  const bands = [];
  let dp = '';
  let df = '';
  let t = 0;
  let lastP = null;
  let lastF = null;
  steps.forEach((s, i) => {
    const x0 = (t / total) * pw;
    t += durations[i];
    const x1 = (t / total) * pw;
    if (i % 2 === 0) bands.push(h('rect', { class: 'step-band', x: x0, y: 0, width: x1 - x0, height: ph }));
    if (i) bands.push(h('line', { class: 'step-edge', x1: x0, x2: x0, y1: 0, y2: ph }));
    bands.push(h('text', { class: 'step-num', x: (x0 + x1) / 2, y: -10, 'text-anchor': 'middle', text: String(i + 1) }));
    const smooth = s.transition === 'smooth';
    if (s.pump === 'pressure') {
      const v = y(Number(s.pressure) || 0);
      dp += lastP === null ? `M${x0.toFixed(1)},${v.toFixed(1)}` : (smooth ? '' : `L${x0.toFixed(1)},${v.toFixed(1)}`);
      dp += `L${x1.toFixed(1)},${v.toFixed(1)}`;
      lastP = v;
      lastF = null;
    } else {
      const v = y(Number(s.flow) || 0);
      df += lastF === null ? `M${x0.toFixed(1)},${v.toFixed(1)}` : (smooth ? '' : `L${x0.toFixed(1)},${v.toFixed(1)}`);
      df += `L${x1.toFixed(1)},${v.toFixed(1)}`;
      lastF = v;
      lastP = null;
    }
  });
  return h('svg', { class: 'profile-chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'The shape of this recipe', preserveAspectRatio: 'xMidYMid meet' },
    h('g', { transform: `translate(${pad.left} ${pad.top})` },
      bands, grid,
      dp ? h('path', { class: 'line line-pressure', d: dp }) : null,
      df ? h('path', { class: 'line line-flow', d: df }) : null));
}
