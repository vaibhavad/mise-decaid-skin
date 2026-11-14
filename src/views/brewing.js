// Full-screen view while a shot is running. Appears by itself when the
// machine starts brewing, whichever button started it.

import { h, setText, setAttr, show, replaceKids } from '../dom.js';
import { S, requestState, displayTitle, gatewayMode } from '../store.js';
import { num, cap } from '../format.js';
import { createChart } from '../chart.js';

export function createBrewing() {
  const title = h('h1', { class: 'page-title' });
  const sub = h('span', { class: 'page-sub' });
  const stages = h('ol', { class: 'stages', 'aria-label': 'Shot stages' });
  let stageKey = '';

  const reading = (cls, label) => {
    const value = h('span', { class: `reading-value ${cls}` });
    return { value, el: h('div', { class: 'reading' }, h('span', { class: `swatch ${cls}`, 'aria-hidden': 'true' }), h('span', { class: 'muted', text: label }), value) };
  };
  const pressure = reading('c-pressure', 'Pressure');
  const flow = reading('c-flow', 'Flow');
  const weight = reading('c-weight', 'Weight');
  const waterTemp = h('span', { class: 'reading-value' });
  const chart = createChart({ height: 440, live: true });

  const time = h('span', { class: 'big-time' });
  const cup = h('span', { class: 'big-weight' });
  const cupOf = h('span', { class: 'muted cup-of' });
  const bar = h('div', { class: 'progress-fill' });
  const progress = h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Progress to target weight', 'aria-valuemin': '0' }, bar);
  const cupNote = h('span', { class: 'muted' });

  const stop = h('button', { class: 'stop', type: 'button', onClick: () => requestState('idle') },
    h('span', { class: 'stop-title', text: 'Stop now' }),
    h('span', { class: 'stop-sub', text: 'or press the button on the machine' }));

  const el = h('div', { class: 'view view-brewing' },
    h('header', { class: 'page-head' }, h('div', { class: 'page-head-text' }, title, sub), stages),
    h('div', { class: 'brew-body' },
      h('section', { class: 'card chart-card', 'aria-label': 'Live chart' },
        h('div', { class: 'readings' }, pressure.el, flow.el, weight.el,
          h('div', { class: 'reading reading-right' }, h('span', { class: 'muted', text: 'Water' }), waterTemp)),
        chart.el,
        h('p', { class: 'muted chart-note', text: 'Left scale: bar and ml/s. Right scale: grams in the cup.' })),
      h('div', { class: 'brew-side' },
        h('section', { class: 'card time-card', 'aria-label': 'Time' },
          h('span', { class: 'label', text: 'Time' }),
          h('div', { class: 'big-row' }, time, h('span', { class: 'big-unit', text: 's' }))),
        h('section', { class: 'card cup-card', 'aria-label': 'Weight in the cup' },
          h('span', { class: 'label', text: 'In the cup' }),
          h('div', { class: 'big-row' }, cup, cupOf),
          progress, cupNote),
        stop)));

  function updateStages(shot) {
    const steps = S.workflow?.profile?.steps || [];
    const frame = Math.min(shot.frame, Math.max(0, steps.length - 1));
    const key = `${steps.length}|${frame}|${S.workflow?.profile?.title}`;
    if (key === stageKey) return;
    stageKey = key;
    if (!steps.length) { replaceKids(stages, []); return; }
    if (steps.length > 5) {
      replaceKids(stages, [h('li', { class: 'stage', 'aria-current': 'step', text: `Step ${frame + 1} of ${steps.length} · ${cap(steps[frame].name)}` })]);
      return;
    }
    replaceKids(stages, steps.map((step, i) => h('li', {
      class: 'stage', 'data-done': i < frame ? 'true' : null, 'aria-current': i === frame ? 'step' : null,
      text: cap(step.name) || `Step ${i + 1}`,
    })));
  }

  function update() {
    const shot = S.shot;
    if (!shot) return;
    const snap = S.snap || {};
    const context = S.workflow?.context || {};
    const target = Number(context.targetYield) || 0;
    const sub0 = snap.state?.substate;
    setText(title, shot.phase === 'prep' ? 'Getting ready'
      : shot.phase === 'ending' ? 'Finishing'
        : sub0 === 'preinfusion' ? 'Soaking the coffee' : 'Pouring');
    const bits = [displayTitle(S.workflow?.profile?.title)];
    if (context.targetDoseWeight) bits.push(`${num(context.targetDoseWeight, 1)} g in`);
    if (target > 0) bits.push(`aiming for ${num(target, 0)} g out`);
    setText(sub, bits.filter(Boolean).join(' · '));
    updateStages(shot);

    setText(pressure.value, `${num(snap.pressure, 1)} bar`);
    setText(flow.value, `${num(snap.flow, 1)} ml/s`);
    const hasScale = S.scaleConnected && S.scale.weight != null;
    const grams = hasScale ? Math.max(0, S.scale.weight) : null;
    setText(weight.value, hasScale ? `${num(grams, 1)} g` : 'No scale');
    setText(waterTemp, Number.isFinite(snap.mixTemperature) ? `${num(snap.mixTemperature, 1)} °C` : '–');
    chart.draw({ samples: shot.samples, target: hasScale ? target : 0 });
    setAttr(chart.el, 'aria-label', `Live shot chart at ${Math.round(shot.seconds)} seconds. Pressure ${num(snap.pressure, 1)} bar, flow ${num(snap.flow, 1)} millilitres per second${hasScale ? `, weight ${num(grams, 1)} grams` : ''}.`);

    setText(time, String(Math.floor(shot.seconds)));
    setText(cup, hasScale ? num(grams, 1) : '–');
    setText(cupOf, hasScale && target > 0 ? `of ${num(target, 0)} g` : (hasScale ? 'g' : ''));
    const full = gatewayMode() === 'full';
    const usable = hasScale && target > 0;
    show(progress, usable);
    if (usable) {
      bar.style.width = `${Math.min(100, (grams / target) * 100).toFixed(1)}%`;
      setAttr(progress, 'aria-valuemax', target);
      setAttr(progress, 'aria-valuenow', num(grams, 1));
      const left = Math.max(0, target - grams);
      setText(cupNote, full ? `${num(left, 1)} g to go. Stop it yourself (gateway mode is Full).`
        : left > 0.05 ? `${num(left, 1)} g to go. Stops by itself.` : 'Target reached.');
    } else {
      setText(cupNote, hasScale ? 'No target weight set. Stop the shot yourself.' : 'No scale connected. Stop the shot yourself.');
    }
  }

  return { el, update };
}
