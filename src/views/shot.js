// The shot, full screen. It appears by itself when the machine starts
// brewing, whichever button started it, and stays up when the shot ends so
// you can read it, tag the taste and write a note. Close returns to Brew.

import { h, setText, setAttr, show, replaceKids } from '../dom.js';
import { S, requestState, displayTitle, gatewayMode, editReview, closeReview } from '../store.js';
import { num, cap, ratio, deg, stageStats, TASTES } from '../format.js';
import { createChart } from '../chart.js';

export function stageCards(stats, { current = -1 } = {}) {
  return stats.map((st) => h('li', { class: 'stage-c', 'data-current': st.index === current ? 'true' : null },
    h('div', { class: 'stage-c-head' },
      h('span', { class: 'step-index', 'data-pump': st.pump === 'pressure' ? 'pressure' : 'flow', text: String(st.index + 1) }),
      h('strong', { class: 'stage-c-name', text: cap(st.name) }),
      h('span', { class: 'stage-c-time', text: `${num(st.seconds, 1)} s` })),
    h('dl', { class: 'stage-c-stats' },
      h('div', null, h('dt', { text: 'In the cup' }), h('dd', { text: `${num(st.grams, 1)} g` })),
      h('div', null, h('dt', { text: 'Water' }), h('dd', { text: Number.isFinite(st.cMin) ? (Math.round(st.cMin) === Math.round(st.cMax) ? deg(st.cMin) : `${deg(st.cMin)}–${deg(st.cMax)}`) : '–' })),
      h('div', null, h('dt', { text: 'Pressure' }), h('dd', { text: `${num(st.pFirst, 1)} → ${num(st.pLast, 1)}` })))));
}

export function createShot() {
  const title = h('h1', { class: 'shot-title' });
  const sub = h('span', { class: 'shot-sub' });
  const time = h('span', { class: 'big-num' });
  const cup = h('span', { class: 'big-num' });
  const cupOf = h('span', { class: 'big-of' });
  const bar = h('span', { class: 'progress-fill' });
  const progress = h('span', { class: 'progress' }, bar);
  const ratioEl = h('span', { class: 'big-of' });

  const stop = h('button', { class: 'btn btn-stop btn-shot', type: 'button', text: 'Stop', onClick: () => requestState('idle') });
  const close = h('button', { class: 'btn btn-primary btn-shot', type: 'button', text: 'Close', onClick: closeReview });

  const legend = h('div', { class: 'legend' },
    h('span', { class: 'c-pressure', text: 'Pressure, bar' }), h('span', { class: 'c-flow', text: 'Flow, ml/s' }),
    h('span', { class: 'c-weight', text: 'Weight, g' }), h('span', { class: 'muted', text: 'Dashed: what the recipe asks for' }));
  const chart = createChart({ width: 1180, height: 380, live: true });
  const stages = h('ol', { class: 'stage-strip', 'aria-label': 'Steps' });
  const note = h('p', { class: 'shot-note' });

  // After the shot
  const tasteButtons = TASTES.map((label) => h('button', {
    class: 'chip-btn', type: 'button', text: label,
    onClick: () => editReview({ taste: S.review?.taste === label ? null : label }),
  }));
  const notes = h('input', { class: 'input notes-input', type: 'text', autocomplete: 'off', placeholder: 'Notes: sweet, a little sharp at the end…', 'aria-label': 'Notes' });
  notes.addEventListener('input', () => editReview({ notes: notes.value }));
  const saved = h('span', { class: 'muted small' });
  const after = h('div', { class: 'after-row' },
    h('span', { class: 'val-label', text: 'How did it taste?' }),
    h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Taste' }, tasteButtons),
    notes, saved);

  const el = h('div', { class: 'shot-view', hidden: true },
    h('header', { class: 'shot-head' },
      h('div', { class: 'shot-head-text' }, title, sub),
      h('div', { class: 'big-stat' }, h('span', { class: 'val-label', text: 'Time' }), h('span', { class: 'big-row' }, time, h('span', { class: 'big-of', text: 's' }))),
      h('div', { class: 'big-stat big-stat-cup' }, h('span', { class: 'val-label', text: 'In the cup' }), h('span', { class: 'big-row' }, cup, cupOf, ratioEl), progress),
      stop, close),
    h('section', { class: 'shot-chart' }, legend, chart.el, note),
    stages,
    after);

  let stageKey = '';
  let drawnReview = null;

  function updateStages(samples, steps, current) {
    const stats = stageStats(samples, steps);
    const key = `${stats.length}|${current}|${stats.map((s) => `${s.seconds.toFixed(0)}:${s.grams.toFixed(0)}`).join(',')}`;
    if (key === stageKey) return;
    stageKey = key;
    replaceKids(stages, stats.length ? stageCards(stats, { current }) : [h('li', { class: 'muted stage-empty', text: 'Each step shows here as the shot reaches it.' })]);
    const live = stages.querySelector('[data-current]');
    if (live) live.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  function updateLive(shot) {
    const snap = S.snap || {};
    const context = S.workflow?.context || {};
    const steps = S.workflow?.profile?.steps || [];
    const target = Number(context.targetYield) || 0;
    const frame = Math.min(shot.frame, Math.max(0, steps.length - 1));
    setText(title, shot.phase === 'prep' ? 'Getting ready' : shot.phase === 'ending' ? 'Finishing'
      : snap.state?.substate === 'preinfusion' ? 'Soaking the coffee' : 'Pouring');
    const stepText = steps.length && shot.phase === 'running' ? `Step ${frame + 1} of ${steps.length} · ${cap(steps[frame]?.name || '')}` : '';
    setText(sub, [displayTitle(S.workflow?.profile?.title), stepText].filter(Boolean).join(' · '));
    const hasScale = S.scaleConnected && S.scale.weight != null;
    const grams = hasScale ? Math.max(0, S.scale.weight) : null;
    setText(time, num(shot.seconds, 1));
    setText(cup, hasScale ? num(grams, 1) : '–');
    setText(cupOf, hasScale && target > 0 ? `/ ${num(target, 0)} g` : (hasScale ? 'g' : 'no scale'));
    setText(ratioEl, '');
    show(progress, hasScale && target > 0);
    if (hasScale && target > 0) bar.style.width = `${Math.min(100, (grams / target) * 100).toFixed(1)}%`;
    chart.draw({ samples: shot.samples, target: hasScale ? target : 0 });
    setAttr(chart.el, 'aria-label', `Live shot chart at ${Math.round(shot.seconds)} seconds.`);
    const full = gatewayMode() === 'full';
    setText(note, !hasScale ? 'No scale connected: stop the shot yourself.'
      : target <= 0 ? 'No target weight: stop the shot yourself.'
        : full ? 'Gateway mode is Full: stop the shot yourself at the target.' : '');
    show(note, Boolean(note.textContent));
    updateStages(shot.samples, steps, shot.phase === 'running' ? frame : -1);
  }

  function updateReview(r) {
    setText(title, 'Shot finished');
    setText(sub, [r.title, r.coffee].filter(Boolean).join(' · '));
    setText(time, num(r.seconds, 1));
    setText(cup, r.out != null ? num(r.out, 1) : '–');
    setText(cupOf, r.out != null ? 'g' : 'no scale');
    setText(ratioEl, r.out != null && r.dose ? ratio(r.dose, r.out) : '');
    show(progress, false);
    if (drawnReview !== r) {
      drawnReview = r;
      notes.value = r.notes || '';
      chart.draw({ samples: r.samples, target: r.out != null ? r.target : 0 });
      setAttr(chart.el, 'aria-label', `Chart of the finished shot: ${Math.round(r.seconds)} seconds.`);
    }
    const prev = r.previous;
    const line = prev && prev.seconds ? compareLine(r, prev) : '';
    setText(note, line);
    show(note, Boolean(line));
    updateStages(r.samples, r.steps || S.workflow?.profile?.steps || [], -1);
    tasteButtons.forEach((b, i) => setAttr(b, 'aria-pressed', r.taste === TASTES[i] ? 'true' : 'false'));
    setText(saved, {
      saved: 'Saved with the shot',
      error: 'Not saved yet. It tries again when you change something.',
      unsaved: 'Decaid did not store this shot, so notes cannot be kept.',
    }[r.saved] || '');
  }

  function update() {
    const shot = S.shot;
    const review = !shot ? S.review : null;
    show(el, Boolean(shot || review));
    if (!shot && !review) { drawnReview = null; return; }
    setAttr(el, 'data-phase', shot ? 'live' : 'done');
    show(stop, Boolean(shot));
    show(close, Boolean(review));
    show(after, Boolean(review));
    if (shot) updateLive(shot); else updateReview(review);
  }

  return { el, update };
}

function compareLine(r, prev) {
  const dt = Math.round(r.seconds) - Math.round(prev.seconds);
  const parts = [dt === 0 ? 'the same time' : `${Math.abs(dt)} s ${dt > 0 ? 'longer' : 'shorter'}`];
  if (r.out != null && prev.out) {
    const dw = r.out - prev.out;
    parts.push(Math.abs(dw) < 0.3 ? 'the same weight' : `${num(Math.abs(dw), 1)} g ${dw > 0 ? 'more' : 'less'}`);
  }
  return `Compared with your previous shot: ${parts.join(', ')}.`;
}
