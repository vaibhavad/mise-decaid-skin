// Coffees: your coffees and their bags, kept in Decaid. Pick the bag you are
// using and every shot records it; Mise takes each dose off the bag.

import { h, setText, setAttr, replaceKids } from '../dom.js';
import {
  S, useBatch, clearCoffee, saveBean, saveBatch, setFrozen, archiveBatch, archiveBean, deleteBean,
  daysOffRoast, openForm, currentBatch, filterHistory, go, toast,
} from '../store.js';
import { num } from '../format.js';
import { sheetHead } from './parts.js';

const PROCESS = [
  { label: 'Washed', value: 'washed' }, { label: 'Natural', value: 'natural' },
  { label: 'Honey', value: 'honey' }, { label: 'Anaerobic', value: 'anaerobic' },
];
const ROAST = [{ label: 'Light', value: 'light' }, { label: 'Medium', value: 'medium' }, { label: 'Dark', value: 'dark' }];
const cap1 = (t) => (t ? t[0].toUpperCase() + t.slice(1) : '');
const day = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

// A short line for the Brew screen: the coffee, its day off roast, and what
// is left in the bag.
export function coffeeLine(batch, bean) {
  if (!batch || !bean) return '';
  const age = daysOffRoast(batch);
  const left = Number(batch.weightRemaining ?? batch.weight);
  return [bean.name,
    batch.frozen ? 'frozen' : (age != null ? `day ${age}` : null),
    Number.isFinite(left) ? `${num(left, 0)} g` : null].filter(Boolean).join(' · ');
}

function beanForm(bean = null) {
  openForm({
    title: bean ? `Edit ${bean.name}` : 'Add a coffee',
    note: bean ? '' : 'Then add a bag to it: the roast date and how much you bought.',
    submitLabel: bean ? 'Save' : 'Add coffee',
    fields: [
      { key: 'name', label: 'Coffee', value: bean?.name, placeholder: 'Ethiopia Guji, washed', wide: true },
      { key: 'roaster', label: 'Roaster', value: bean?.roaster, placeholder: 'Who roasted it' },
      { key: 'country', label: 'Country', value: bean?.country, placeholder: 'Ethiopia' },
      { key: 'processing', label: 'Process', type: 'choice', options: PROCESS, value: bean?.processing || '', wide: true },
      { key: 'notes', label: 'Tasting notes', type: 'textarea', value: bean?.notes, placeholder: 'Peach, jasmine, black tea', wide: true },
    ],
    async submit(v) {
      if (!v.name || !v.roaster) { toast('A coffee needs a name and a roaster.'); return false; }
      const saved = await saveBean({ name: v.name, roaster: v.roaster, country: v.country || null, processing: v.processing || null, notes: v.notes || null }, bean?.id);
      if (saved && !bean) setTimeout(() => batchForm(saved), 50);
      return Boolean(saved);
    },
    danger: bean ? { label: 'Delete this coffee', confirm: 'Tap again: deletes it and all its bags', action: () => deleteBean(bean) } : null,
  });
}

function batchForm(bean, batch = null) {
  openForm({
    title: batch ? 'Edit bag' : `New bag of ${bean.name}`,
    submitLabel: batch ? 'Save' : 'Add bag',
    fields: [
      { key: 'roastDate', label: 'Roasted on', type: 'date', value: batch?.roastDate?.slice(0, 10) },
      { key: 'roastLevel', label: 'Roast', type: 'choice', options: ROAST, value: batch?.roastLevel || '' },
      { key: 'weight', label: 'Bag size, g', type: 'number', value: batch?.weight ?? 250 },
      batch ? { key: 'weightRemaining', label: 'Left in the bag, g', type: 'number', value: batch?.weightRemaining ?? batch?.weight } : null,
      { key: 'notes', label: 'Notes', type: 'textarea', value: batch?.notes, wide: true },
    ].filter(Boolean),
    async submit(v) {
      const fields = { roastDate: v.roastDate || null, roastLevel: v.roastLevel || null, weight: v.weight, notes: v.notes || null };
      if (batch) fields.weightRemaining = v.weightRemaining;
      const saved = await saveBatch(bean.id, fields, batch?.id);
      if (saved && !batch && !currentBatch()) useBatch(saved);
      return Boolean(saved);
    },
    danger: batch ? { label: 'Mark as finished', confirm: 'Tap again: moves it to finished bags', action: () => archiveBatch(batch) } : null,
  });
}

export function createCoffees() {
  let showOld = false;
  const addBtn = h('button', { class: 'btn btn-primary btn-small', type: 'button', text: 'Add coffee', onClick: () => beanForm() });
  const oldBtn = h('button', { class: 'filter filter-quiet', type: 'button', text: 'Finished', onClick: () => { showOld = !showOld; key = ''; update(); } });
  const head = sheetHead({ title: 'Coffees', right: [oldBtn, addBtn] });
  const grid = h('div', { class: 'coffee-grid' });
  const el = h('div', { class: 'sheet-body view-coffees' }, head.el, grid);
  let key = '';

  function bagRow(batch, bean, inUse) {
    const age = daysOffRoast(batch);
    const left = Number(batch.weightRemaining ?? batch.weight);
    const size = Number(batch.weight);
    const pct = size > 0 && Number.isFinite(left) ? Math.max(0, Math.min(1, left / size)) : null;
    const bar = h('span', { class: 'bag-bar' }, h('span', { class: 'bag-fill', style: `width:${pct == null ? 0 : Math.round(pct * 100)}%` }));
    return h('div', { class: 'bag', 'data-in-use': inUse ? 'true' : null, 'data-old': batch.archived ? 'true' : null },
      h('div', { class: 'bag-main' },
        h('div', { class: 'bag-top' },
          h('strong', { text: batch.roastDate ? `Roasted ${day(batch.roastDate)}` : 'Roast date not set' }),
          batch.frozen ? h('span', { class: 'pill pill-quiet', text: 'Frozen' }) : null,
          batch.archived ? h('span', { class: 'pill pill-quiet', text: 'Finished' }) : null,
          inUse ? h('span', { class: 'pill pill-solid', text: 'In use' }) : null),
        h('span', { class: 'muted small', text: [batch.roastLevel ? `${cap1(batch.roastLevel)} roast` : null, age != null && !batch.archived ? `${age} days off roast` : null, Number.isFinite(left) ? `${num(left, 0)} of ${num(size, 0)} g left` : null].filter(Boolean).join(' · ') }),
        pct != null ? bar : null),
      h('div', { class: 'bag-actions' },
        batch.archived
          ? h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Restore', onClick: () => archiveBatch(batch, false) })
          : [
            inUse ? null : h('button', { class: 'btn btn-primary btn-small', type: 'button', text: 'Use', onClick: () => { useBatch(batch); go('home'); } }),
            h('button', { class: 'btn btn-outline btn-small', type: 'button', text: batch.frozen ? 'Thaw' : 'Freeze', onClick: () => setFrozen(batch, !batch.frozen) }),
            h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Edit', onClick: () => batchForm(bean, batch) }),
          ]));
  }

  function update() {
    setAttr(oldBtn, 'aria-pressed', showOld ? 'true' : 'false');
    const cur = currentBatch();
    const next = `${JSON.stringify(S.beans)}|${JSON.stringify(S.batches)}|${cur?.id}|${showOld}`;
    if (next === key) return;
    key = next;
    const beans = S.beans.filter((b) => showOld || !b.archived);
    setText(head.subEl, cur ? `In use: ${S.beans.find((b) => b.id === cur.beanId)?.name || ''}` : 'Choose the bag you are brewing with. Each shot records it.');
    if (!beans.length) {
      replaceKids(grid, [h('div', { class: 'empty coffee-empty' },
        h('p', { text: 'No coffees yet.' }),
        h('p', { class: 'muted', text: 'Add the coffee you are using, with its roast date and bag size. Shots then record it, and Mise counts down what is left in the bag.' }),
        h('button', { class: 'btn btn-primary', type: 'button', text: 'Add coffee', onClick: () => beanForm() }))]);
      return;
    }
    replaceKids(grid, beans.map((bean) => {
      const bags = S.batches.filter((b) => b.beanId === bean.id && (showOld || !b.archived))
        .sort((a, b) => Date.parse(b.roastDate || 0) - Date.parse(a.roastDate || 0));
      return h('section', { class: 'coffee', 'data-old': bean.archived ? 'true' : null },
        h('div', { class: 'coffee-head' },
          h('div', { class: 'coffee-title' },
            h('h2', { class: 'card-title', text: bean.name }),
            h('span', { class: 'muted small', text: [bean.roaster, bean.country, bean.processing ? cap1(bean.processing) : null].filter(Boolean).join(' · ') })),
          h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Edit', onClick: () => beanForm(bean) })),
        bean.notes ? h('p', { class: 'coffee-notes', text: bean.notes }) : null,
        h('div', { class: 'bags' }, bags.length ? bags.map((b) => bagRow(b, bean, cur?.id === b.id)) : h('p', { class: 'muted small', text: 'No bags. Add one to start using this coffee.' })),
        h('div', { class: 'coffee-foot' },
          h('button', { class: 'link', type: 'button', text: 'Add a bag', onClick: () => batchForm(bean) }),
          h('button', { class: 'link', type: 'button', text: 'See its shots', onClick: () => { filterHistory(bean.id); go('history'); } }),
          bean.archived
            ? h('button', { class: 'link', type: 'button', text: 'Bring back', onClick: () => archiveBean(bean, false) })
            : h('button', { class: 'link link-quiet', type: 'button', text: 'Finished with this coffee', onClick: () => archiveBean(bean) })));
    }).concat(cur ? [h('button', { class: 'link coffee-none', type: 'button', text: 'Brew without a coffee selected', onClick: clearCoffee })] : []));
  }

  return { el, update };
}
