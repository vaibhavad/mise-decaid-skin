// One recipe in full: its shape, every step in plain words, the numbers it
// aims for, and the last few shots pulled with it. "Load" puts it on the Brew
// screen.

import { h, setText, setAttr, show, replaceKids, icon } from '../dom.js';
import {
  S, go, visibleProfiles, favoriteIds, toggleFavorite, isInUse, nameOf, openRename, openDuplicate,
  loadRecipe, selectShot, findRecord, setHidden, openExport, openRecipe, loadLineage, resetRecipe, deleteCopy,
} from '../store.js';
import {
  num, trimNum, ratio, when, cap, brewTemp, stepControl, stepEnds, stepLimit, deg,
} from '../format.js';
import { profileChart } from '../chart.js';
import { card, sheetHead } from './parts.js';
import { kind as kindOf } from './recipes.js';

function stepItem(step, i) {
  const seconds = Number(step.seconds) || 0;
  const ends = stepEnds(step);
  let timing = seconds > 0 ? `For up to ${trimNum(seconds)} s` : '';
  if (ends.length) timing = timing ? `${timing}, or until ${ends.join(', or ')}` : `Until ${ends.join(', or ')}`;
  const limit = stepLimit(step);
  const temp = Number(step.temperature);
  return h('li', { class: 'step' },
    h('span', { class: 'step-index', 'data-pump': step.pump === 'pressure' ? 'pressure' : 'flow', text: String(i + 1) }),
    h('div', { class: 'step-text' },
      h('div', { class: 'step-top' },
        h('strong', { text: cap(step.name || `Step ${i + 1}`) }),
        Number.isFinite(temp) && temp > 0 ? h('span', { class: 'step-temp', text: deg(temp, 1) }) : null),
      h('span', { text: [stepControl(step), limit].filter(Boolean).join(' · ') }),
      timing ? h('span', { class: 'muted', text: timing }) : null));
}

export function createRecipe() {
  const star = h('button', { class: 'btn btn-outline btn-small btn-icon', type: 'button' }, icon('star', 'icon icon-star'), h('span'));
  const rename = h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Rename' });
  const dup = h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Duplicate' });
  const tags = h('div', { class: 'tags tags-head' });
  const head = sheetHead({ title: 'Recipe', back: { label: 'All recipes', onClick: () => go('recipes') }, right: [tags, star, rename, dup] });
  const title = head.titleEl;

  const chartBox = h('div', { class: 'profile-chart-box' });
  const steps = h('ol', { class: 'step-list' });
  const facts = h('dl', { class: 'facts' });
  const notes = h('p', { class: 'recipe-notes' });
  const shotsBox = h('div', { class: 'recipe-shots' });
  const load = h('button', { class: 'btn btn-primary btn-big btn-block', type: 'button' });
  const loadHint = h('span', { class: 'muted small load-hint' });
  const missing = h('p', { class: 'muted empty', text: 'This recipe is no longer on the machine.' });
  const versions = h('div', { class: 'recipe-shots' });
  const versionsBox = h('div', { class: 'notes-box' }, h('span', { class: 'label', text: 'Versions' }), versions);
  const mExport = h('button', { class: 'link', type: 'button', text: 'Export as a file' });
  const mHide = h('button', { class: 'link', type: 'button' });
  const mDelete = h('button', { class: 'link', type: 'button', text: 'Delete this recipe' });
  const changeList = h('div', { class: 'chg' });
  const reset = h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Reset to original' });
  const changesBox = h('div', { class: 'notes-box changes-box' }, h('span', { class: 'label', text: 'Your changes' }), changeList, reset);
  const manageNote = h('span', { class: 'muted small' });
  const manage = h('div', { class: 'notes-box' }, h('span', { class: 'label', text: 'Manage' }),
    h('div', { class: 'manage-links' }, mExport, mHide, mDelete), manageNote);

  const body = h('div', { class: 'recipe-page' },
    card('recipe-shape-card',
      h('div', { class: 'shape-head' },
        h('h2', { class: 'card-title', text: 'Shape' }),
        h('div', { class: 'legend' }, h('span', { class: 'c-pressure', text: 'Pressure, bar' }), h('span', { class: 'c-flow', text: 'Flow, ml/s' }))),
      chartBox,
      h('h2', { class: 'card-title', text: 'Steps' }),
      steps),
    h('div', { class: 'recipe-aside' },
      card('recipe-facts-card',
        facts, changesBox,
        h('div', { class: 'notes-box' }, h('span', { class: 'label', text: 'About this recipe' }), notes),
        h('div', { class: 'notes-box' }, h('span', { class: 'label', text: 'Recent shots' }), shotsBox),
        versionsBox, manage),
      h('div', { class: 'load-box' }, load, loadHint)));

  const el = h('div', { class: 'sheet-body view-recipe' }, head.el, body, missing);

  let key = '';
  let record = null;

  star.addEventListener('click', () => record && toggleFavorite(record.id));
  rename.addEventListener('click', () => record && openRename(record));
  dup.addEventListener('click', () => record && openDuplicate(record));
  mExport.addEventListener('click', () => record && openExport(record));
  mHide.addEventListener('click', () => record && setHidden(record, record.visibility !== 'hidden'));
  mDelete.addEventListener('click', () => record && deleteCopy(record));
  reset.addEventListener('click', () => record && resetRecipe(record));
  load.addEventListener('click', () => {
    if (!record) return;
    if (isInUse(record)) go('home'); else loadRecipe(record);
  });

  function fact(label, value, wide) {
    return h('div', { class: wide ? 'fact fact-wide' : 'fact' }, h('dt', { text: label }), h('dd', { text: value }));
  }

  function recentShots(p) {
    const mine = (S.shots || []).filter((s) => s.workflow?.profile?.title === p.title).slice(0, 3);
    if (!mine.length) return [h('span', { class: 'muted small', text: 'None yet.' })];
    return mine.map((shot) => {
      const extra = shot.annotations?.extras?.mise || {};
      const dose = Number(shot.annotations?.actualDoseWeight) || Number(shot.workflow?.context?.targetDoseWeight) || null;
      const out = Number(shot.annotations?.actualYield) || Number(extra.out) || S.shotDetails[shot.id]?.out || null;
      const secs = Number(extra.seconds) || S.shotDetails[shot.id]?.seconds || null;
      const parts = [dose && out ? `${num(dose, 1)} → ${num(out, 1)} g` : (out ? `${num(out, 1)} g` : ''), secs ? `${Math.round(secs)} s` : '', extra.taste || ''].filter(Boolean);
      return h('button', { class: 'mini-shot', type: 'button', onClick: () => { selectShot(shot.id); go('history'); } },
        h('strong', { text: when(shot.timestamp) }), h('span', { class: 'muted', text: parts.join(' · ') }));
    });
  }

  function update() {
    record = findRecord(S.recipeId);
    show(body, Boolean(record));
    show(missing, !record);
    for (const b of [star, rename, dup]) setAttr(b, 'disabled', !record);
    if (!record) { setText(title, 'Recipe'); replaceKids(tags, []); return; }
    updateManage();

    const p = record.profile;
    const inUse = isInUse(record);
    const starred = favoriteIds().includes(record.id);
    setAttr(star, 'aria-pressed', starred ? 'true' : 'false');
    setText(star.lastChild, starred ? 'Starred' : 'Star');
    setText(load, inUse ? 'Go to Brew' : 'Load this recipe');
    setText(loadHint, inUse ? 'This recipe is already on the Brew screen.' : 'Puts it on the Brew screen, ready for your next shot.');

    const shotKey = (S.shots || []).slice(0, 40).map((s) => s.id).join(',');
    const next = `${JSON.stringify(S.edits[record.id] || null)}|${record.id}|${nameOf(record)}|${inUse}|${JSON.stringify(p.steps)}|${record.dose}|${record.out}|${record.grind}|${shotKey}|${Object.keys(S.shotDetails).length}|${S.layout.unit}`;
    if (next === key) return;
    key = next;

    setText(title, nameOf(record));
    replaceKids(tags, [
      inUse ? h('span', { class: 'pill pill-solid', text: 'In use' }) : null,
      record.copy ? h('span', { class: 'pill', text: 'Yours' }) : null,
      record.edited ? h('span', { class: 'pill pill-edited', text: 'Edited' }) : null,
      h('span', { class: 'pill pill-quiet', text: kindOf(p) }),
    ].filter(Boolean));

    replaceKids(chartBox, [profileChart(p)]);
    const list = Array.isArray(p.steps) ? p.steps : [];
    replaceKids(steps, list.length ? list.map(stepItem) : [h('li', { class: 'muted', text: 'This recipe has no steps.' })]);

    const target = Number(p.target_weight) || 0;
    const own = record.copy || record.hasEdit;
    const out = own && record.out != null ? Number(record.out) : target;
    const dose = own ? Number(record.dose) || null : null;
    const temp = brewTemp(p);
    const rows = [
      fact('Espresso out', out > 0 ? `${num(out, 0)} g` : 'No stop by weight'),
      fact('Temperature', Number.isFinite(temp) ? deg(temp, 1) : '–'),
    ];
    if (dose) rows.push(fact('Coffee in', `${num(dose, 1)} g`));
    if (dose && out > 0) rows.push(fact('Ratio', ratio(dose, out)));
    if (own && record.grind != null && record.grind !== '') rows.push(fact('Grinder setting', String(record.grind)));
    rows.push(fact('Steps', String(list.length)));
    if (record.copy && record.from) rows.push(fact('Copied from', record.from, true));
    else if (p.author) rows.push(fact('Made by', p.author, true));
    if (nameOf(record) !== p.title && !record.copy) rows.push(fact('Original name', p.title, true));
    replaceKids(facts, rows);

    setText(notes, String(p.notes || '').trim() || 'No description.');
    replaceKids(shotsBox, recentShots(p));
  }

  let lineageFor = null;
  function updateManage() {
    const hidden = record.visibility === 'hidden';
    setText(mHide, hidden ? 'Bring it back to Recipes' : 'Archive this recipe');
    show(mHide, !record.copy);
    show(mDelete, Boolean(record.copy));
    setText(manageNote, 'Anything you change on the Brew screen is saved into this recipe.');
    show(changesBox, Boolean(record.edited));
    if (record.edited) {
      const rows = [];
      const c = record.changes;
      if (c.temp) rows.push(h('span', { text: 'Temperature' }), h('s', { text: deg(c.temp[0], 1) }), h('b', { text: deg(c.temp[1], 1) }));
      if (c.out) rows.push(h('span', { text: 'Espresso out' }), h('s', { text: c.out[0] > 0 ? `${num(c.out[0], 0)} g` : 'Off' }), h('b', { text: c.out[1] > 0 ? `${num(c.out[1], 0)} g` : 'Off' }));
      replaceKids(changeList, rows);
    }

    if (lineageFor !== record.id) { lineageFor = record.id; loadLineage(record.id); }
    const line = S.lineage[record.id] || [];
    const others = line.filter((r) => r.id !== record.id);
    show(versionsBox, others.length > 0);
    const lk = others.map((r) => r.id).join(',');
    if (versions.__key !== lk) {
      versions.__key = lk;
      replaceKids(versions, others.map((r) => h('button', {
        class: 'mini-shot', type: 'button', onClick: () => openRecipe(r.id),
      }, h('strong', { text: nameOf(r) }), h('span', { class: 'muted', text: r.id === record.parentId ? 'Made from this one' : (r.parentId === record.id ? 'Made from this recipe' : 'Earlier version') }))));
    }
  }

  return { el, update };
}
