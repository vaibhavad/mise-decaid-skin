// Recipes: every recipe on the machine plus your copies. Search, filter,
// sort; tap one to see it in full. In Starred, arrows set the order of the
// Brew screen's carousel.

import { h, setAttr, replaceKids, icon, setText } from '../dom.js';
import {
  S, visibleProfiles, favoriteIds, toggleFavorite, openRecipe, isInUse, nameOf, moveFavorite, openImport, openExport, openMenu, openStepEditor,
} from '../store.js';
import { firstSentence, deg, num } from '../format.js';
import { profileCurve } from '../chart.js';
import { sheetHead } from './parts.js';

const FILTERS = ['All', 'Starred', 'Yours', 'Espresso', 'Filter and tea', 'Cleaning', 'Archived'];
const SORTS = [{ key: 'name', label: 'A–Z' }, { key: 'recent', label: 'Recently brewed' }];

export function kind(profile) {
  const type = String(profile.beverage_type || 'espresso').toLowerCase();
  const title = String(profile.title || '').toLowerCase();
  if (type === 'cleaning' || type === 'calibrate' || /clean|descale|flush/.test(title)) return 'Cleaning';
  if (type === 'pourover' || /tea|filter|pour.?over/.test(title)) return 'Filter and tea';
  return 'Espresso';
}

// A tap opens; pressing and holding (or a right-click) opens the menu.
function holdOrTap(tap, hold) {
  let timer = null;
  let held = false;
  const clear = () => { clearTimeout(timer); timer = null; };
  return {
    onPointerdown: () => { held = false; clear(); timer = setTimeout(() => { held = true; hold(); }, 480); },
    onPointerup: clear, onPointerleave: clear, onPointercancel: clear,
    onContextmenu: (e) => { e.preventDefault(); clear(); if (!held) { held = true; hold(); } },
    onClick: () => { if (held) { held = false; return; } tap(); },
  };
}

export function createRecipes() {
  let filter = 'All';
  let sort = 'name';
  let query = '';
  let key = '';

  const search = h('input', { class: 'input input-search', type: 'search', autocomplete: 'off', placeholder: 'Search recipes', 'aria-label': 'Search recipes' });
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); update(); });
  const head = sheetHead({ title: 'Recipes', right: [
    search,
    h('button', { class: 'btn btn-primary btn-small', type: 'button', text: 'New recipe', onClick: () => openStepEditor() }),
    h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Import', onClick: openImport }),
    h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Export', onClick: () => openExport() }),
  ] });
  const chips = FILTERS.map((name) => h('button', { class: 'filter', type: 'button', text: name, onClick: () => { filter = name; update(); } }));
  const sorts = SORTS.map((s) => h('button', { class: 'filter filter-quiet', type: 'button', text: s.label, onClick: () => { sort = s.key; update(); } }));
  const grid = h('div', { class: 'recipe-grid' });
  const tip = h('p', { class: 'muted small grid-tip' });

  const el = h('div', { class: 'sheet-body view-recipes' },
    head.el,
    h('div', { class: 'filters' }, h('div', { class: 'filter-group', role: 'group', 'aria-label': 'Filter' }, chips),
      h('div', { class: 'filter-group', role: 'group', 'aria-label': 'Sort' }, sorts)),
    tip, grid);

  function lastBrewed() {
    const map = {};
    for (const shot of S.shots || []) {
      const t = shot.workflow?.profile?.title;
      const ts = Date.parse(shot.timestamp);
      if (t && Number.isFinite(ts) && !(map[t] > ts)) map[t] = ts;
    }
    return map;
  }

  function update() {
    chips.forEach((c, i) => setAttr(c, 'aria-pressed', FILTERS[i] === filter ? 'true' : 'false'));
    sorts.forEach((c, i) => setAttr(c, 'aria-pressed', SORTS[i].key === sort ? 'true' : 'false'));
    const all = visibleProfiles();
    const favs = favoriteIds();
    const current = S.workflow?.profile?.title || '';
    const next = `${JSON.stringify(S.edits)}|${S.hiddenProfiles.map((r) => r.id).join(',')}|${S.profiles ? all.length : 'loading'}|${favs.join(',')}|${current}|${filter}|${sort}|${query}|${all.map(nameOf).join('\u0001')}|${(S.shots || []).length}|${S.layout.unit}`;
    if (next === key) return;
    key = next;
    setText(head.subEl, S.profiles ? `${all.length} recipes · ${favs.length} of 5 starred for the Brew screen` : '');
    setText(tip, filter === 'Starred' ? 'Use the arrows to set the order they appear on the Brew screen.'
      : filter === 'Archived' ? 'Recipes you archived. Open one to bring it back.'
        : 'Tap a recipe to open it. Press and hold for rename, duplicate and more.');

    if (!S.profiles) { replaceKids(grid, [h('p', { class: 'muted empty', text: 'Loading recipes…' })]); return; }
    const recent = lastBrewed();
    let shown = (filter === 'Archived' ? S.hiddenProfiles : all).filter((record) => {
      const p = record.profile;
      if (filter === 'Starred' && !favs.includes(record.id)) return false;
      if (filter === 'Yours' && !record.copy) return false;
      if (['Espresso', 'Filter and tea', 'Cleaning'].includes(filter) && kind(p) !== filter) return false;
      if (query && !`${nameOf(record)} ${p.title} ${p.notes || ''} ${p.author || ''}`.toLowerCase().includes(query)) return false;
      return true;
    });
    if (filter === 'Starred') shown.sort((a, b) => favs.indexOf(a.id) - favs.indexOf(b.id));
    else if (sort === 'recent') shown.sort((a, b) => (recent[b.profile.title] || 0) - (recent[a.profile.title] || 0) || nameOf(a).localeCompare(nameOf(b)));
    else shown.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

    if (!shown.length) {
      replaceKids(grid, [h('p', { class: 'muted empty', text: filter === 'Starred' ? 'Nothing starred yet. Tap a star to add a recipe to the Brew screen.' : filter === 'Yours' ? 'No recipes of your own yet. Duplicate one to start.' : filter === 'Archived' ? 'Nothing archived. Press and hold a recipe you never use to archive it.' : 'No recipes match.' })]);
      return;
    }
    replaceKids(grid, shown.map((record, i) => {
      const p = record.profile;
      const starred = favs.includes(record.id);
      const hidden = filter === 'Archived';
      const inUse = isInUse(record);
      const t = Number(p.steps?.[0]?.temperature);
      const out = record.copy && record.out != null ? Number(record.out) : Number(p.target_weight) || 0;
      const order = filter === 'Starred' ? h('div', { class: 'order' },
        h('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Move ${nameOf(record)} earlier`, disabled: i === 0, onClick: () => moveFavorite(record.id, -1) }, icon('back')),
        h('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Move ${nameOf(record)} later`, disabled: i === shown.length - 1, onClick: () => moveFavorite(record.id, 1) }, icon('chevron'))) : null;
      return h('article', { class: 'recipe', 'data-in-use': inUse ? 'true' : null },
        h('button', { class: 'recipe-main', type: 'button', ...holdOrTap(() => openRecipe(record.id), () => openMenu(record)) },
          profileCurve(p, 'curve recipe-curve'),
          h('span', { class: 'recipe-card-title', text: nameOf(record) }),
          h('span', { class: 'recipe-card-meta', text: [Number.isFinite(t) ? deg(t, 1) : null, out > 0 ? `${num(out, 0)} g` : null].filter(Boolean).join(' · ') }),
          h('span', { class: 'recipe-card-text', text: firstSentence(p.notes, 100) || 'No description.' }),
          h('span', { class: 'tags' },
            inUse ? h('span', { class: 'pill pill-solid', text: 'In use' }) : null,
            record.copy ? h('span', { class: 'pill', text: 'Yours' }) : null,
            record.edited ? h('span', { class: 'pill pill-edited', text: 'Edited' }) : null,
            h('span', { class: 'pill pill-quiet', text: kind(p) }))),
        hidden ? null : h('button', {
          class: 'star', type: 'button', 'aria-pressed': starred ? 'true' : 'false',
          'aria-label': `${starred ? 'Remove star from' : 'Star'} ${nameOf(record)}`,
          onClick: () => toggleFavorite(record.id),
        }, icon('star', 'icon icon-star')),
        order);
    }));
  }

  return { el, update };
}
