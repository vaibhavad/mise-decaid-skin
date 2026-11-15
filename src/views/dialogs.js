// Dialogs: rename or duplicate a recipe, choose the weather city, the forms
// for coffees and bags, and importing or exporting recipes.

import { h, setText, show, replaceKids } from '../dom.js';
import {
  S, nameOf, renameProfile, duplicateProfile, deleteCopy, openDuplicate, closeDialog,
  findPlaces, setPlace, importRecipes, toast, openRename, resetRecipe, toggleFavorite, favoriteIds,
  setHidden, openExport, openRecipe,
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
      ? `Makes a new recipe from "${nameOf(record)}" as it is now and switches to it. "${nameOf(record)}" stays as it is.`
      : record.copy ? 'This is a recipe of your own.'
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

  // ── General form (coffees, bags) ──
  // S.dialog = { kind: 'form', title, note, fields: [{ key, label, type, value, options, placeholder, wide }],
  //              submitLabel, submit(values) -> Promise<boolean>, danger: { label, action } }
  const formTitle = h('h2', { class: 'card-title', id: 'form-dialog-title' });
  const formNote = h('p', { class: 'muted small' });
  const formFields = h('div', { class: 'form-grid' });
  const formDanger = h('button', { class: 'link link-danger', type: 'button' });
  const formSave = h('button', { class: 'btn btn-primary', type: 'submit' });
  const genericForm = h('form', { class: 'dialog dialog-wide', 'aria-labelledby': 'form-dialog-title' },
    formTitle, formNote, formFields,
    h('div', { class: 'dialog-actions' },
      h('div', { class: 'dialog-links' }, formDanger),
      h('button', { class: 'btn btn-outline', type: 'button', onClick: closeDialog, text: 'Cancel' }),
      formSave));
  let inputs = {};
  let dangerArmed = false;

  function fillForm(dialog) {
    setText(formTitle, dialog.title);
    setText(formNote, dialog.note || '');
    show(formNote, Boolean(dialog.note));
    setText(formSave, dialog.submitLabel || 'Save');
    dangerArmed = false;
    show(formDanger, Boolean(dialog.danger));
    if (dialog.danger) setText(formDanger, dialog.danger.label);
    inputs = {};
    replaceKids(formFields, dialog.fields.map((f) => {
      const id = `form-${f.key}`;
      let control;
      if (f.type === 'choice') {
        control = h('div', { class: 'seg-row', role: 'group', 'aria-label': f.label });
        let current = f.value ?? '';
        const buttons = f.options.map((o) => h('button', {
          class: 'seg seg-small', type: 'button', text: o.label, 'aria-pressed': String(o.value === current),
          onClick: () => { current = current === o.value ? '' : o.value; buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(f.options[i].value === current))); },
        }));
        control.append(...buttons);
        inputs[f.key] = { read: () => current };
      } else if (f.type === 'textarea') {
        control = h('textarea', { id, class: 'input textarea', rows: '3', placeholder: f.placeholder || '' });
        control.value = f.value ?? '';
        inputs[f.key] = { read: () => control.value.trim() };
      } else {
        control = h('input', {
          id, class: 'input', type: f.type || 'text', autocomplete: 'off', placeholder: f.placeholder || '',
          inputmode: f.type === 'number' ? 'decimal' : null, step: f.type === 'number' ? 'any' : null,
        });
        control.value = f.value ?? '';
        inputs[f.key] = { read: () => (f.type === 'number' ? (control.value === '' ? null : Number(control.value)) : control.value.trim()) };
      }
      return h('div', { class: f.wide ? 'field field-wide' : 'field' }, h('label', { class: 'label', for: id, text: f.label }), control);
    }));
    const first = formFields.querySelector('input, textarea');
    if (first) first.focus();
  }

  genericForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const dialog = S.dialog;
    if (dialog?.kind !== 'form') return;
    const values = {};
    for (const [key, input] of Object.entries(inputs)) values[key] = input.read();
    formSave.disabled = true;
    const ok = await dialog.submit(values);
    formSave.disabled = false;
    if (ok !== false && S.dialog === dialog) closeDialog();
  });
  formDanger.addEventListener('click', async () => {
    const dialog = S.dialog;
    if (!dialog?.danger) return;
    if (!dangerArmed) { dangerArmed = true; setText(formDanger, dialog.danger.confirm || 'Tap again to confirm'); return; }
    closeDialog();
    await dialog.danger.action();
  });

  // ── Import recipes ──
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'file-input', id: 'import-file' });
  const pasteBox = h('textarea', { class: 'input textarea textarea-tall', placeholder: 'Or paste a recipe here (JSON from Decaid, de1app or Visualizer)', 'aria-label': 'Recipe JSON' });
  const importStatus = h('p', { class: 'muted small' });
  const importForm = h('form', { class: 'dialog dialog-wide', 'aria-labelledby': 'import-title' },
    h('h2', { class: 'card-title', id: 'import-title', text: 'Import recipes' }),
    h('p', { class: 'muted small', text: 'A file exported from Mise or Decaid, or a single recipe from de1app or Visualizer. Recipes that are already here are skipped.' }),
    h('label', { class: 'btn btn-outline file-label', for: 'import-file', text: 'Choose a file' }), fileInput,
    pasteBox, importStatus,
    h('div', { class: 'dialog-actions' },
      h('button', { class: 'btn btn-outline', type: 'button', onClick: closeDialog, text: 'Cancel' }),
      h('button', { class: 'btn btn-primary', type: 'submit', text: 'Import' })));
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    pasteBox.value = await file.text();
    setText(importStatus, `${file.name} is ready to import.`);
  });
  importForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!pasteBox.value.trim()) { setText(importStatus, 'Choose a file or paste a recipe first.'); return; }
    const result = await importRecipes(pasteBox.value);
    if (result) closeDialog();
  });

  // ── Export recipes ──
  const exportText = h('p', { class: 'muted small' });
  const exportForm = h('div', { class: 'dialog', role: 'dialog', 'aria-labelledby': 'export-title' },
    h('h2', { class: 'card-title', id: 'export-title' }), exportText,
    h('div', { class: 'dialog-actions' },
      h('button', { class: 'btn btn-outline', type: 'button', onClick: closeDialog, text: 'Close' }),
      h('button', { class: 'btn btn-outline', type: 'button', text: 'Copy', onClick: () => copyExport() }),
      h('button', { class: 'btn btn-primary', type: 'button', text: 'Download', onClick: () => downloadExport() })));
  const exportTitle = exportForm.firstChild;
  const exportJson = () => JSON.stringify(S.dialog?.data ?? [], null, 2);
  function downloadExport() {
    const url = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
    const a = h('a', { href: url, download: S.dialog?.filename || 'mise-recipes.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Download started. If nothing appears, use Copy and paste it somewhere safe.');
  }
  async function copyExport() {
    try {
      await navigator.clipboard.writeText(exportJson());
      toast('Copied. Paste it into a note or a message to keep it.');
    } catch {
      toast('Copying is not allowed here. Use Download instead.');
    }
  }

  // ── Recipe menu (press and hold) ──
  const menuTitle = h('h2', { class: 'card-title' });
  const menuItems = h('div', { class: 'menu-items' });
  const menuBox = h('div', { class: 'dialog dialog-menu', role: 'menu' }, menuTitle, menuItems);
  function fillMenu(record) {
    setText(menuTitle, nameOf(record));
    const starred = favoriteIds().includes(record.id);
    const item = (label, action, danger) => h('button', {
      class: danger ? 'menu-item menu-danger' : 'menu-item', type: 'button', role: 'menuitem', text: label,
      onClick: () => { closeDialog(); action(); },
    });
    replaceKids(menuItems, [
      item('Open', () => openRecipe(record.id)),
      item('Rename', () => openRename(record)),
      item('Duplicate', () => openDuplicate(record)),
      record.edited ? item('Reset to original', () => resetRecipe(record)) : null,
      item(starred ? 'Remove from the Brew screen' : 'Keep on the Brew screen', () => toggleFavorite(record.id)),
      item('Export', () => openExport(record)),
      record.copy ? item('Delete', () => deleteCopy(record), true) : item('Archive', () => setHidden(record, true)),
    ].filter(Boolean));
  }

  const el = h('div', { class: 'backdrop', hidden: true }, recipeForm, cityForm, genericForm, importForm, exportForm, menuBox);
  el.addEventListener('click', (e) => { if (e.target === el && S.dialog?.kind === 'menu') closeDialog(); });
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
    show(genericForm, dialog.kind === 'form');
    show(importForm, dialog.kind === 'import');
    show(exportForm, dialog.kind === 'export');
    show(menuBox, dialog.kind === 'menu');
    if (dialog.kind === 'menu') fillMenu(dialog.record);
    if (dialog.kind === 'recipe') fillRecipe(dialog);
    else if (dialog.kind === 'city') fillCity();
    else if (dialog.kind === 'form') fillForm(dialog);
    else if (dialog.kind === 'import') { pasteBox.value = ''; fileInput.value = ''; setText(importStatus, ''); }
    else if (dialog.kind === 'export') {
      const n = Array.isArray(dialog.data) ? dialog.data.length : 1;
      setText(exportTitle, dialog.title || 'Export recipes');
      setText(exportText, `${n} ${n === 1 ? 'recipe' : 'recipes'}, as JSON that Decaid, Mise and Visualizer can read. Download saves a file; Copy puts it on the clipboard.`);
    }
  }

  return { el, update };
}
