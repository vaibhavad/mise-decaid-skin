// Step editor: build a recipe from scratch or change the steps of one you
// have. The chart at the top redraws as you edit; nothing is saved until
// you tap Save.

import { h, setText, setAttr, show, replaceKids, icon } from '../dom.js';
import { S, go, draftChange, saveDraft, newStep, openEditor, openRecipe, MAX_STEPS } from '../store.js';
import { num, trimNum, deg, stepControl, stepEnds, stepLimit, cap } from '../format.js';
import { profileChart } from '../chart.js';
import { tempSpec } from './edits.js';

const EXITS = [
  { label: 'Only the time', value: 'none' },
  { label: 'Pressure above', value: 'pressure-over' }, { label: 'Pressure below', value: 'pressure-under' },
  { label: 'Flow above', value: 'flow-over' }, { label: 'Flow below', value: 'flow-under' },
];

export function createEditor() {
  const name = h('input', { class: 'input ed-name', type: 'text', autocomplete: 'off', placeholder: 'Recipe name', 'aria-label': 'Recipe name' });
  name.addEventListener('input', () => { if (S.draft) { S.draft.name = name.value; S.draft.dirty = true; } });
  const save = h('button', { class: 'btn btn-primary', type: 'button', text: 'Save', onClick: () => saveDraft() });
  let armed = false;
  const cancel = h('button', { class: 'btn btn-outline', type: 'button', text: 'Cancel', onClick: () => {
    if (S.draft?.dirty && !armed) { armed = true; setText(cancel, 'Discard changes?'); return; }
    leave();
  } });
  const leave = () => { const id = S.draft?.sourceId; if (id) openRecipe(id); else go('recipes'); };
  const title = h('h1', { class: 'page-title' });

  const chartBox = h('div', { class: 'ed-chart' });
  const list = h('ol', { class: 'ed-steps' });
  const add = h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Add a step', onClick: () => draftChange((d) => {
    const at = d.selected + 1;
    d.profile.steps.splice(at, 0, newStep(d.profile.steps[d.selected]));
    d.selected = at;
  }) });
  const outBtn = valueButton('Espresso out', () => {
    const d = S.draft;
    openEditor({
      label: 'Espresso out', unit: 'g', hint: 'The shot stops by itself at this weight. 0 means you stop it yourself.',
      value: Number(d.profile.target_weight) || 0, min: 0, max: 1000, step: 1, major: 10, digits: 0,
      save: (v) => draftChange((x) => { x.profile.target_weight = Math.round(v); }),
    });
  });
  const notes = h('textarea', { class: 'input textarea ed-notes', rows: '2', placeholder: 'What is this recipe for? (optional)', 'aria-label': 'Description' });
  notes.addEventListener('input', () => { if (S.draft) { S.draft.profile.notes = notes.value; S.draft.dirty = true; } });

  // The selected step
  const stepTitle = h('span', { class: 'label' });
  const stepName = h('input', { class: 'input', type: 'text', autocomplete: 'off', 'aria-label': 'Step name' });
  stepName.addEventListener('input', () => {
    const d = S.draft;
    if (!d) return;
    d.profile.steps[d.selected].name = stepName.value;
    d.dirty = true;
    const row = list.children[d.selected]?.querySelector('.ed-step-name');
    if (row) row.textContent = stepName.value || `Step ${d.selected + 1}`;
  });
  const step = () => S.draft.profile.steps[S.draft.selected];
  const change = (fn) => draftChange((d) => fn(d.profile.steps[d.selected]));

  const pump = choice('The pump holds', [{ label: 'Pressure', value: 'pressure' }, { label: 'Flow', value: 'flow' }], (v) => change((x) => {
    x.pump = v;
    if (v === 'pressure' && !(Number(x.pressure) > 0)) x.pressure = 9;
    if (v === 'flow' && !(Number(x.flow) > 0)) x.flow = 2;
    delete x.limiter;
  }));
  const target = valueButton('', () => {
    const x = step();
    const p = x.pump === 'pressure';
    openEditor({
      label: p ? 'Pressure' : 'Flow', unit: p ? 'bar' : 'ml/s', value: Number(p ? x.pressure : x.flow) || 0,
      min: 0, max: p ? 12 : 8, step: 0.1, major: 10, digits: 1,
      save: (v) => change((y) => { y[p ? 'pressure' : 'flow'] = Math.round(v * 10) / 10; }),
    });
  });
  const ramp = choice('Getting there', [{ label: 'At once', value: 'fast' }, { label: 'Gradually', value: 'smooth' }], (v) => change((x) => { x.transition = v; }));
  const temp = valueButton('Water temperature', () => openEditor(tempSpec({
    label: 'Water temperature for this step', c: Number(step().temperature) || 93, min: 20, max: 105,
    save: (c) => change((y) => { y.temperature = Math.round(c * 2) / 2; }),
  })));
  const secs = valueButton('Lasts up to', () => openEditor({
    label: 'This step lasts up to', unit: 's', value: Number(step().seconds) || 0, min: 0, max: 120, step: 1, major: 10, digits: 0,
    save: (v) => change((y) => { y.seconds = Math.round(v); }),
  }));
  const limit = valueButton('', () => {
    const x = step();
    const p = x.pump === 'pressure';
    openEditor({
      label: p ? 'Keep the flow under' : 'Keep the pressure under', unit: p ? 'ml/s' : 'bar', hint: '0 means no limit.',
      value: Number(x.limiter?.value) || 0, min: 0, max: p ? 8 : 12, step: 0.1, major: 10, digits: 1,
      save: (v) => change((y) => { if (v > 0) y.limiter = { value: Math.round(v * 10) / 10, range: Number(y.limiter?.range) || 0.6 }; else delete y.limiter; }),
    });
  });
  const exitKind = choice('Move on early when', EXITS, (v) => change((x) => {
    if (v === 'none') { delete x.exit; return; }
    const [type, condition] = v.split('-');
    x.exit = { type, condition, value: Number(x.exit?.value) > 0 && x.exit?.type === type ? x.exit.value : (type === 'pressure' ? 4 : 2) };
  }));
  const exitValue = valueButton('', () => {
    const x = step();
    const p = x.exit.type === 'pressure';
    openEditor({
      label: `Move on when ${p ? 'pressure' : 'flow'} is ${x.exit.condition === 'under' ? 'below' : 'above'}`, unit: p ? 'bar' : 'ml/s',
      value: Number(x.exit.value) || 0, min: 0.1, max: p ? 12 : 8, step: 0.1, major: 10, digits: 1,
      save: (v) => change((y) => { y.exit = { ...y.exit, value: Math.round(v * 10) / 10 }; }),
    });
  });
  const cupWeight = valueButton('Or when the cup holds', () => openEditor({
    label: 'Move on when the cup holds', unit: 'g', hint: 'Needs a scale. 0 means not used.',
    value: Number(step().weight) || 0, min: 0, max: 200, step: 1, major: 10, digits: 0,
    save: (v) => change((y) => { y.weight = Math.round(v); }),
  }));

  const tool = (name0, label, fn) => h('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': label, onClick: fn }, icon(name0));
  const moveUp = tool('up', 'Move this step earlier', () => draftChange((d) => { const i = d.selected; if (i > 0) { const s = d.profile.steps; [s[i - 1], s[i]] = [s[i], s[i - 1]]; d.selected = i - 1; } }));
  const moveDown = tool('down', 'Move this step later', () => draftChange((d) => { const i = d.selected; const s = d.profile.steps; if (i < s.length - 1) { [s[i + 1], s[i]] = [s[i], s[i + 1]]; d.selected = i + 1; } }));
  const copyStep = h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Copy step', onClick: () => draftChange((d) => { d.profile.steps.splice(d.selected + 1, 0, { ...JSON.parse(JSON.stringify(d.profile.steps[d.selected])) }); d.selected += 1; }) });
  const removeStep = h('button', { class: 'btn btn-outline btn-small ed-remove', type: 'button', text: 'Remove', onClick: () => draftChange((d) => { d.profile.steps.splice(d.selected, 1); }) });

  const detail = h('section', { class: 'card ed-detail' },
    h('div', { class: 'ed-detail-head' }, stepTitle, h('span', { class: 'ed-tools' }, moveUp, moveDown, copyStep, removeStep)),
    stepName,
    h('div', { class: 'ed-grid' }, pump.el, target.el, ramp.el, temp.el, secs.el, limit.el),
    exitKind.el,
    h('div', { class: 'ed-grid' }, exitValue.el, cupWeight.el));

  const el = h('div', { class: 'sheet-body view-editor' },
    h('header', { class: 'sheet-head' }, h('div', { class: 'page-head-text' }, title), name, cancel, save),
    h('div', { class: 'ed-body' },
      h('div', { class: 'ed-left' },
        h('section', { class: 'card ed-shape' }, chartBox),
        h('div', { class: 'ed-list-head' }, h('span', { class: 'label', text: 'Steps' }), add),
        list,
        h('div', { class: 'ed-foot' }, outBtn.el, notes)),
      detail));

  function valueButton(label, onTap) {
    const l = h('span', { class: 'val-label' });
    const v = h('span', { class: 'ed-val' });
    setText(l, label);
    const b = h('button', { class: 'ed-field', type: 'button', onClick: onTap }, l, v);
    return { el: b, set(text, lab) { setText(v, text); if (lab != null) setText(l, lab); } };
  }
  function choice(label, options, onPick) {
    const buttons = options.map((o) => h('button', { class: 'seg seg-small', type: 'button', text: o.label, onClick: () => onPick(o.value) }));
    const box = h('div', { class: 'ed-choice' }, h('span', { class: 'val-label', text: label }), h('div', { class: 'seg-row' }, buttons));
    return { el: box, set(value) { buttons.forEach((b, i) => setAttr(b, 'aria-pressed', options[i].value === value ? 'true' : 'false')); } };
  }

  let token = null;
  let key = '';
  let lastSelected = -1;
  function update() {
    const d = S.draft;
    if (!d) return;
    if (d.token !== token) {
      token = d.token;
      key = '';
      lastSelected = -1;
      armed = false;
      setText(cancel, 'Cancel');
      name.value = d.name;
      notes.value = d.profile.notes || '';
      setText(title, d.kind === 'new' ? 'New recipe' : 'Edit steps');
    }
    const steps = d.profile.steps;
    const k = `${JSON.stringify(steps)}|${d.selected}|${d.profile.target_weight}|${S.layout.unit}`;
    if (k === key) return;
    const sameStep = lastSelected === d.selected;
    lastSelected = d.selected;
    key = k;
    replaceKids(chartBox, [profileChart(d.profile, { width: 760, height: 190 })]);
    replaceKids(list, steps.map((x, i) => h('li', null, h('button', {
      class: 'ed-step', type: 'button', 'aria-pressed': i === d.selected ? 'true' : 'false',
      onClick: () => draftChange((y) => { y.selected = i; y.dirty = d.dirty; }),
    },
    h('span', { class: 'step-index', 'data-pump': x.pump === 'pressure' ? 'pressure' : 'flow', text: String(i + 1) }),
    h('span', { class: 'ed-step-text' },
      h('strong', { class: 'ed-step-name', text: cap(x.name || `Step ${i + 1}`) }),
      h('span', { class: 'muted', text: [stepControl(x), stepLimit(x), `${deg(Number(x.temperature), 1)}`, `up to ${trimNum(Number(x.seconds) || 0)} s`, stepEnds(x).length ? `or ${stepEnds(x).join(', or ')}` : null].filter(Boolean).join(' · ') }))))));
    show(add, steps.length < MAX_STEPS);
    outBtn.set(Number(d.profile.target_weight) > 0 ? `${num(d.profile.target_weight, 0)} g` : 'Off');

    const x = steps[d.selected];
    show(detail, Boolean(x));
    if (!x) return;
    const p = x.pump === 'pressure';
    setText(stepTitle, `Step ${d.selected + 1} of ${steps.length}`);
    if (!sameStep || document.activeElement !== stepName) stepName.value = x.name || '';
    pump.set(x.pump === 'pressure' ? 'pressure' : 'flow');
    target.set(p ? `${num(x.pressure, 1)} bar` : `${num(x.flow, 1)} ml/s`, p ? 'Pressure' : 'Flow');
    ramp.set(x.transition === 'smooth' ? 'smooth' : 'fast');
    temp.set(deg(Number(x.temperature), 1));
    secs.set(`${trimNum(Number(x.seconds) || 0)} s`);
    limit.set(Number(x.limiter?.value) > 0 ? `${num(x.limiter.value, 1)} ${p ? 'ml/s' : 'bar'}` : 'No limit', p ? 'Keep the flow under' : 'Keep the pressure under');
    const ek = x.exit?.type ? `${x.exit.type}-${x.exit.condition === 'under' ? 'under' : 'over'}` : 'none';
    exitKind.set(ek);
    show(exitValue.el, ek !== 'none');
    if (ek !== 'none') exitValue.set(`${num(x.exit.value, 1)} ${x.exit.type === 'pressure' ? 'bar' : 'ml/s'}`, x.exit.type === 'pressure' ? 'At this pressure' : 'At this flow');
    cupWeight.set(Number(x.weight) > 0 ? `${num(x.weight, 0)} g` : 'Not used');
    setAttr(moveUp, 'disabled', d.selected === 0);
    setAttr(moveDown, 'disabled', d.selected === steps.length - 1);
    setAttr(removeStep, 'disabled', steps.length <= 1);
  }

  return { el, update };
}
