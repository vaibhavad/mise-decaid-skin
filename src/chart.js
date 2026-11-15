// Shot chart (pressure, flow, weight over time) and the small recipe-shape
// preview. Plain SVG, redrawn by replacing three path strings.

import { h, setAttr, replaceKids } from './dom.js';

const PAD = { left: 40, right: 50, top: 26, bottom: 28 };

// Shot chart: pressure (green), flow (blue) and weight in the cup (brown),
// with the recipe's targets dashed and numbered markers where each step
// starts. A second shot can be laid underneath, faint, to compare.
export function createChart({ width = 800, height = 430, live = false } = {}) {
  const W = width;
  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const grid = h('g', { class: 'chart-grid' });
  const marks = h('g', { class: 'chart-steps' });
  const targetLine = h('line', { class: 'chart-target', x1: 0, x2: plotW });
  const targetText = h('text', { class: 'chart-target-label', x: plotW - 6, 'text-anchor': 'end' });
  const path = (cls) => h('path', { class: cls });
  const ghost = { p: path('line ghost line-pressure'), f: path('line ghost line-flow'), w: path('line ghost line-weight') };
  const paths = {
    tp: path('line target line-pressure'), tf: path('line target line-flow'),
    p: path('line line-pressure'), f: path('line line-flow'), w: path('line line-weight'),
  };
  const dots = {
    p: h('circle', { class: 'dot dot-pressure', r: 5 }),
    f: h('circle', { class: 'dot dot-flow', r: 5 }),
    w: h('circle', { class: 'dot dot-weight', r: 6.5 }),
  };
  const now = h('line', { class: 'chart-now', y1: 0, y2: plotH });
  const el = h('svg', { class: 'chart', viewBox: `0 0 ${W} ${height}`, role: 'img', preserveAspectRatio: 'xMidYMid meet' },
    h('g', { transform: `translate(${PAD.left} ${PAD.top})` },
      grid, marks, targetLine, targetText, ghost.p, ghost.f, ghost.w,
      paths.tp, paths.tf, paths.p, paths.f, paths.w,
      live ? [now, dots.p, dots.f, dots.w] : null));

  let scaleKey = '';

  function draw({ samples = [], target = 0, compare = null, minSeconds = 30 } = {}) {
    let maxP = 0;
    let maxW = 0;
    let lastT = 0;
    for (const list of [samples, compare || []]) {
      for (const x of list) {
        maxP = Math.max(maxP, x.p, x.f, x.tp || 0, x.tf || 0);
        if (x.w != null) maxW = Math.max(maxW, x.w);
        lastT = Math.max(lastT, x.t);
      }
    }
    const yMax = Math.max(10, Math.ceil(Math.min(maxP, 16) / 2) * 2);
    const rows = yMax / 2;
    const wStep = rows * 5;
    const wMax = Math.max(wStep * 2, Math.ceil(Math.max(target * 1.15, maxW * 1.05) / wStep) * wStep);
    const tMax = Math.max(minSeconds, Math.ceil((lastT + 2) / 5) * 5);
    const x = (t) => (t / tMax) * plotW;
    const y = (v) => plotH - (Math.min(Math.max(v, 0), yMax) / yMax) * plotH;
    const yw = (v) => plotH - (Math.min(Math.max(v, 0), wMax) / wMax) * plotH;

    const key = `${yMax}|${wMax}|${tMax}`;
    if (key !== scaleKey) {
      scaleKey = key;
      const kids = [];
      for (let i = 0; i <= rows; i += 1) {
        const yy = plotH - (i / rows) * plotH;
        kids.push(h('line', { class: i === 0 ? 'axis' : 'gridline', x1: 0, x2: plotW, y1: yy, y2: yy }));
        kids.push(h('text', { class: 'tick', x: -8, y: yy + 4.5, 'text-anchor': 'end', text: String(Math.round((yMax * i) / rows)) }));
        kids.push(h('text', { class: 'tick tick-weight', x: plotW + 8, y: yy + 4.5, text: i === rows ? `${Math.round(wMax)} g` : String(Math.round((wMax * i) / rows)) }));
      }
      const every = tMax <= 45 ? 5 : 10;
      for (let t = 0; t <= tMax; t += every) {
        kids.push(h('text', { class: 'tick', x: x(t), y: plotH + 20, 'text-anchor': 'middle', text: t === tMax ? `${t} s` : String(t) }));
      }
      replaceKids(grid, kids);
    }

    const line = (list, get, scale) => {
      let d = '';
      let open = false;
      for (const s of list) {
        const v = get(s);
        if (v == null) { open = false; continue; }
        d += `${open ? 'L' : 'M'}${x(s.t).toFixed(1)},${scale(v).toFixed(1)}`;
        open = true;
      }
      return d || null;
    };
    setAttr(paths.p, 'd', line(samples, (s) => s.p, y));
    setAttr(paths.f, 'd', line(samples, (s) => s.f, y));
    setAttr(paths.w, 'd', line(samples, (s) => (s.w == null ? null : s.w), yw));
    setAttr(paths.tp, 'd', line(samples, (s) => (s.tp > 0 ? s.tp : null), y));
    setAttr(paths.tf, 'd', line(samples, (s) => (s.tf > 0 ? s.tf : null), y));
    const cmp = compare || [];
    setAttr(ghost.p, 'd', line(cmp, (s) => s.p, y));
    setAttr(ghost.f, 'd', line(cmp, (s) => s.f, y));
    setAttr(ghost.w, 'd', line(cmp, (s) => (s.w == null ? null : s.w), yw));

    // Numbered markers where each step begins.
    const edges = [];
    let prev = null;
    for (const s of samples) {
      if (s.s !== prev) { edges.push({ t: s.t, n: s.s + 1 }); prev = s.s; }
    }
    const markKey = `${edges.map((e) => `${e.n}@${e.t.toFixed(1)}`).join(',')}|${tMax}`;
    if (marks.__key !== markKey) {
      marks.__key = markKey;
      replaceKids(marks, edges.map((e) => h('g', null,
        e.t > 0.3 ? h('line', { class: 'step-edge', x1: x(e.t), x2: x(e.t), y1: 0, y2: plotH }) : null,
        h('circle', { class: 'step-dot', cx: x(e.t) + 9, cy: -13, r: 9 }),
        h('text', { class: 'step-dot-num', x: x(e.t) + 9, y: -9, 'text-anchor': 'middle', text: String(e.n) }))));
    }

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
        setAttr(dots.w, 'cx', lx); setAttr(dots.w, 'cy', yw(last.w ?? 0));
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
