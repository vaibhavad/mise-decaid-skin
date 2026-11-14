// Recipes: every profile on the machine, described in plain words. Tap one to
// use it; star up to five to keep them on the Brew screen.

import { h, setAttr, replaceKids, icon } from '../dom.js';
import { S, visibleProfiles, favoriteIds, toggleFavorite, useProfile, isInUse } from '../store.js';
import { firstSentence } from '../format.js';
import { profileCurve } from '../chart.js';

const FILTERS = ['All', 'Starred', 'Espresso', 'Filter and tea', 'Cleaning'];

function kind(profile) {
  const type = String(profile.beverage_type || 'espresso').toLowerCase();
  const title = String(profile.title || '').toLowerCase();
  if (type === 'cleaning' || type === 'calibrate' || /clean|descale|flush/.test(title)) return 'Cleaning';
  if (type === 'pourover' || /tea|filter|pour.?over/.test(title)) return 'Filter and tea';
  return 'Espresso';
}

export function createRecipes() {
  let filter = 'All';
  let query = '';
  let key = '';

  const search = h('input', { id: 'recipe-search', class: 'input input-search', type: 'search', autocomplete: 'off', placeholder: 'Name or description' });
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); update(); });
  const chips = FILTERS.map((name) => h('button', {
    class: 'filter', type: 'button', text: name, onClick: () => { filter = name; update(); },
  }));
  const grid = h('div', { class: 'recipe-grid' });
  const count = h('span', { class: 'page-sub' });

  const el = h('div', { class: 'view view-recipes' },
    h('header', { class: 'page-head' },
      h('div', { class: 'page-head-text' }, h('h1', { class: 'page-title', text: 'Recipes' }), count),
      h('div', { class: 'search' }, h('label', { class: 'label', for: 'recipe-search', text: 'Search' }), search)),
    h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter recipes' }, chips),
    grid);

  function update() {
    chips.forEach((chip, i) => setAttr(chip, 'aria-pressed', FILTERS[i] === filter ? 'true' : 'false'));
    const all = visibleProfiles();
    const favs = favoriteIds();
    const current = S.workflow?.profile?.title || '';
    const next = `${S.profiles ? all.length : 'loading'}|${favs.join(',')}|${current}|${filter}|${query}`;
    if (next === key) return;
    key = next;
    count.textContent = 'Tap a recipe to use it. Star up to five to keep them on the Brew screen.';

    if (!S.profiles) {
      replaceKids(grid, [h('p', { class: 'muted empty', text: 'Loading recipes…' })]);
      return;
    }
    const shown = all.filter((record) => {
      const p = record.profile;
      if (filter === 'Starred' && !favs.includes(record.id)) return false;
      if (filter !== 'All' && filter !== 'Starred' && kind(p) !== filter) return false;
      if (query && !`${p.title} ${p.notes || ''} ${p.author || ''}`.toLowerCase().includes(query)) return false;
      return true;
    }).sort((a, b) => a.profile.title.localeCompare(b.profile.title));

    if (!shown.length) {
      replaceKids(grid, [h('p', { class: 'muted empty', text: filter === 'Starred' ? 'No starred recipes yet. Tap a star to add one.' : 'No recipes match.' })]);
      return;
    }
    replaceKids(grid, shown.map((record) => {
      const p = record.profile;
      const starred = favs.includes(record.id);
      const inUse = isInUse(record);
      return h('article', { class: 'recipe', 'data-in-use': inUse ? 'true' : null },
        h('button', { class: 'recipe-main', type: 'button', onClick: () => useProfile(record) },
          profileCurve(p),
          h('span', { class: 'recipe-card-title', text: p.title }),
          h('span', { class: 'recipe-card-text muted', text: firstSentence(p.notes, 120) || 'No description.' }),
          h('span', { class: 'tags' },
            inUse ? h('span', { class: 'pill pill-solid', text: 'In use' }) : null,
            h('span', { class: 'pill pill-quiet', text: kind(p) }))),
        h('button', {
          class: 'star', type: 'button', 'aria-pressed': starred ? 'true' : 'false',
          'aria-label': `${starred ? 'Remove star from' : 'Star'} ${p.title}`,
          onClick: () => toggleFavorite(record.id),
        }, icon('star', 'icon icon-star')));
    }));
  }

  return { el, update };
}
