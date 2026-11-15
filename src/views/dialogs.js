// Dialogs: rename or duplicate a recipe, and choose the weather city.

import { h, setText, show, replaceKids } from '../dom.js';
import {
  S, nameOf, renameProfile, duplicateProfile, deleteCopy, openDuplicate, closeDialog,
  findPlaces, setPlace,
} from '../store.js';

export function createDialogs() {
  // ── Recipe: rename, duplicate, delete a copy ──
  const title = h('h2', { class: 'card-title', id: 'recipe-dialog-title' });
  const input = h('input', { id: 'recipe-name', class: 'input', type: 'text', autocomplete: 'off', maxlength: '60' });
  const note = h('p', { class: 'muted small' });
  const original = h('button', { class: 'link', type: 'button', text: 'Use the original name' });
  const remove = h('button', { class: 'link link-danger', type: 'button' });
  const duplicate = h('button', { class: 'btn btn-outline', type: 'button', text: 'Duplicate' });
  const save = h('button', { class: 'btn btn-primary', type: 'submit' });
  const recipeForm = h('form', { class: 'dialog', 'aria-labelledby': 'recipe-dialog-title' },
    title,
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'recipe-name', text: 'Name' }), input),
    note,
    h('div', { class: 'dialog-actions' },
      h('div', { class: 'dialog-links' }, original, remove),
      duplicate,
      h('button', { class: 'btn btn-outline', type: 'button', onClick: closeDialog, text: 'Cancel' }),
      save));
  let armed = false;

  async function submitRecipe(value) {
    const dialog = S.dialog;
    if (!dialog?.record) return;
    save.disabled = true;
    const ok = dialog.mode === 'duplicate'
      ? await duplicateProfile(dialog.record, value)
      : await renameProfile(dialog.record, value);
    save.disabled = false;
    if (ok && S.dialog === dialog) closeDialog();
  }
  recipeForm.addEventListener('submit', (event) => { event.preventDefault(); submitRecipe(input.value); });
  original.addEventListener('click', () => submitRecipe(S.dialog?.record?.profile?.title));
  duplicate.addEventListener('click', () => { if (S.dialog?.record) openDuplicate(S.dialog.record); });
  remove.addEventListener('click', () => {
    const record = S.dialog?.record;
    if (!record) return;
    if (!armed) { armed = true; setText(remove, 'Tap again to delete it for good'); return; }
    deleteCopy(record);
    closeDialog();
  });

  function fillRecipe(dialog) {
    const record = dialog.record;
    const making = dialog.mode === 'duplicate';
    armed = false;
    setText(title, making ? 'Duplicate recipe' : 'Rename recipe');
    setText(save, making ? 'Make the copy' : 'Save');
    setText(remove, 'Delete this copy');
    input.value = making ? `${nameOf(record)} copy` : nameOf(record);
    setText(note, making
      ? `Makes your own copy of "${nameOf(record)}" and switches to it. What you change on the Brew screen is saved to the copy, and the original stays as it is. Copies are kept by Mise, so other skins do not list them.`
      : record.copy ? 'This is your own copy, kept by Mise.'
        : record.isDefault !== false
          ? `This is one of Decaid's built-in recipes, called "${record.profile.title}". Decaid does not let them be renamed, so the new name is used in Mise only.`
          : 'This is a recipe you made in Decaid, so the name changes there and in other skins too.');
    show(original, !making && Boolean(S.names[record.id]));
    show(remove, !making && Boolean(record.copy));
    show(duplicate, !making);
    input.focus();
    input.select();
  }

  // ── Weather city ──
  const cityInput = h('input', { id: 'city-name', class: 'input', type: 'text', autocomplete: 'off', placeholder: 'For example: Toronto' });
  const cityStatus = h('p', { class: 'muted small' });
  const cityResults = h('div', { class: 'city-results' });
  const cityRemove = h('button', { class: 'link', type: 'button', text: 'Remove the city', onClick: () => { setPlace(null); closeDialog(); } });
  const cityForm = h('form', { class: 'dialog', 'aria-labelledby': 'city-dialog-title' },
    h('h2', { class: 'card-title', id: 'city-dialog-title', text: 'Weather city' }),
    h('div', { class: 'city-search' },
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'city-name', text: 'City' }), cityInput),
      h('button', { class: 'btn btn-primary', type: 'submit', text: 'Search' })),
    cityStatus, cityResults,
    h('div', { class: 'dialog-actions' },
      h('div', { class: 'dialog-links' }, cityRemove),
      h('button', { class: 'btn btn-outline', type: 'button', onClick: closeDialog, text: 'Cancel' })));
  let searchId = 0;

  cityForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = cityInput.value.trim();
    if (query.length < 2) { setText(cityStatus, 'Type at least two letters.'); return; }
    const id = ++searchId;
    setText(cityStatus, 'Searching…');
    replaceKids(cityResults, []);
    let places = null;
    try { places = await findPlaces(query); } catch { places = null; }
    if (id !== searchId) return;
    if (!places) { setText(cityStatus, 'Could not search. Check that the tablet has an internet connection.'); return; }
    if (!places.length) { setText(cityStatus, 'No place found with that name.'); return; }
    setText(cityStatus, 'Tap your city.');
    replaceKids(cityResults, places.map((p) => h('button', {
      class: 'preset', type: 'button', onClick: () => { setPlace(p); closeDialog(); },
    }, h('span', { text: p.name }), h('span', { class: 'preset-detail', text: p.region }))));
  });

  function fillCity() {
    searchId += 1;
    cityInput.value = '';
    replaceKids(cityResults, []);
    setText(cityStatus, 'The city\'s coordinates are sent to Open-Meteo to fetch the weather. Nothing else is shared.');
    show(cityRemove, Boolean(S.place));
    cityInput.focus();
  }

  const el = h('div', { class: 'backdrop', hidden: true }, recipeForm, cityForm);
  el.addEventListener('pointerdown', (event) => { if (event.target === el) closeDialog(); });
  let shown = null;

  function update() {
    const dialog = S.dialog;
    show(el, Boolean(dialog));
    if (!dialog) { shown = null; return; }
    if (shown === dialog) return;
    shown = dialog;
    show(recipeForm, dialog.kind === 'recipe');
    show(cityForm, dialog.kind === 'city');
    if (dialog.kind === 'recipe') fillRecipe(dialog);
    else fillCity();
  }

  return { el, update };
}
