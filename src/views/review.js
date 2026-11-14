// After the shot: what came out, how it compares with the previous one, and
// room for a taste tag and notes. Nothing here suggests changes.

import { h, setText, setAttr, show } from '../dom.js';
import { S, editReview, closeReview } from '../store.js';
import { num, ratio, when, trimNum, TASTES } from '../format.js';
import { createChart } from '../chart.js';
import { card } from './parts.js';

function stat(label) {
  const value = h('span', { class: 'stat-value' });
  return { value, el: h('div', { class: 'stat' }, h('span', { class: 'label', text: label }), value) };
}

export function createReview() {
  const sub = h('span', { class: 'page-sub' });
  const out = stat('Espresso out');
  const time = stat('Time');
  const dose = stat('Coffee in');
  const rat = stat('Ratio');
  const chart = createChart({ height: 330 });
  const compare = h('p', { class: 'compare' });
  const notes = h('input', { id: 'shot-notes', class: 'input', type: 'text', autocomplete: 'off', placeholder: 'For example: sweet, a little sharp at the end' });
  notes.addEventListener('input', () => editReview({ notes: notes.value }));
  const saved = h('span', { class: 'muted saved-line' });

  const tasteButtons = TASTES.map((label) => h('button', {
    class: 'seg', type: 'button', text: label,
    onClick: () => editReview({ taste: S.review?.taste === label ? null : label }),
  }));

  const fact = (label) => {
    const value = h('dd');
    return { value, el: h('div', { class: 'fact' }, h('dt', { text: label }), value) };
  };
  const fRecipe = fact('Recipe');
  const fCoffee = fact('Coffee');
  const fGrind = fact('Grinder setting');
  const fTarget = fact('Target');
  let drawn = null;

  const el = h('div', { class: 'view view-review' },
    h('header', { class: 'page-head' },
      h('div', { class: 'page-head-text' }, h('h1', { class: 'page-title', text: 'Shot finished' }), sub),
      h('button', { class: 'btn btn-primary btn-wide', type: 'button', onClick: closeReview, text: 'Done' })),
    h('div', { class: 'review-body' },
      card('review-main',
        h('div', { class: 'stat-grid' }, out.el, time.el, dose.el, rat.el),
        chart.el,
        compare,
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'shot-notes', text: 'Notes' }), notes, saved)),
      h('div', { class: 'review-side' },
        card('taste-card',
          h('h2', { class: 'card-title', text: 'How did it taste?' }),
          h('div', { class: 'seg-row', role: 'group', 'aria-label': 'Taste' }, tasteButtons),
          h('span', { class: 'muted', text: 'Optional. It is kept with the shot in History.' })),
        card('facts-card',
          h('h2', { class: 'card-title', text: 'What you used' }),
          h('dl', { class: 'facts' }, fRecipe.el, fCoffee.el, fGrind.el, fTarget.el)))));

  function update() {
    const r = S.review;
    if (!r) return;
    setText(sub, [r.title, r.coffee, when(r.startedAt)].filter(Boolean).join(' · '));
    setText(out.value, r.out != null ? `${num(r.out, 1)} g` : 'No scale');
    setText(time.value, `${Math.round(r.seconds)} s`);
    setText(dose.value, r.dose ? `${num(r.dose, 1)} g` : '–');
    setText(rat.value, r.out != null ? ratio(r.dose, r.out) : '–');
    if (drawn !== r) {
      drawn = r;
      notes.value = r.notes || '';
      chart.draw({ samples: r.samples, target: r.out != null ? r.target : 0 });
      setAttr(chart.el, 'aria-label', `Chart of the finished shot: ${Math.round(r.seconds)} seconds${r.out != null ? `, ${num(r.out, 1)} grams` : ''}.`);
    }
    const prev = r.previous;
    const line = prev && prev.seconds ? compareLine(r, prev) : '';
    show(compare, Boolean(line));
    setText(compare, line);
    tasteButtons.forEach((button, i) => setAttr(button, 'aria-pressed', r.taste === TASTES[i] ? 'true' : 'false'));
    setText(saved, {
      saved: 'Saved with this shot.',
      error: 'Could not save to this shot. It will try again when you change something.',
      unsaved: 'Decaid did not store this shot, so notes and taste cannot be kept.',
    }[r.saved] || '');
    setText(fRecipe.value, r.title);
    setText(fCoffee.value, r.coffee || '–');
    setText(fGrind.value, r.grind != null && r.grind !== '' ? trimNum(r.grind) === '–' ? String(r.grind) : trimNum(r.grind) : '–');
    setText(fTarget.value, r.target ? `${num(r.target, 0)} g` : 'No target');
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
