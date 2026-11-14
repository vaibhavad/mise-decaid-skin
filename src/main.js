// Entry point: picks the gateway (or the demo), builds the shell, and swaps
// screens as the state changes.

import { h, setText, setAttr, show, icon } from './dom.js';
import { gatewayHost, httpTransport, savedGateway, forgetGateway } from './api.js';
import { createSim } from './sim.js';
import {
  S, subscribe, connect, loadAll, go, requestState, heartbeat, toast, transport, reloadMachine, closeReview,
  nameOf, renameProfile, closeDialog,
} from './store.js';
import { createHome } from './views/home.js';
import { createBrewing } from './views/brewing.js';
import { createReview } from './views/review.js';
import { createRecipes } from './views/recipes.js';
import { createWater } from './views/water.js';
import { createHistory } from './views/history.js';
import { createSettings } from './views/settings.js';

const VERSION = '0.2.0';
document.documentElement.dataset.miseVersion = VERSION;
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
// A page can ask for the demo outright with <html data-demo>, for hosts that
// drop the query string.
const forcedDemo = document.documentElement.hasAttribute('data-demo');

// ── Shell ────────────────────────────────────────────────────────────────

const NAV = [
  { view: 'home', label: 'Brew', icon: 'brew' },
  { view: 'recipes', label: 'Recipes', icon: 'recipes' },
  { view: 'water', label: 'Milk & water', icon: 'water' },
  { view: 'history', label: 'History', icon: 'history' },
];

const navButtons = NAV.map((item) => h('button', {
  class: 'rail-item', type: 'button',
  onClick: () => { if (S.view === 'review') closeReview(); go(item.view); },
}, icon(item.icon), h('span', { text: item.label })));

const demoPanel = h('div', { class: 'demo-panel', hidden: true },
  h('strong', { text: 'Demo mode' }),
  h('span', { class: 'muted', text: 'A pretend machine and scale. Nothing here reaches a real machine.' }),
  h('button', { class: 'btn btn-outline', type: 'button', onClick: () => { transport().press('espresso'); show(demoPanel, false); }, text: 'Press the espresso button' }),
  h('button', { class: 'btn btn-outline', type: 'button', onClick: toggleGhc, text: 'Group-head buttons: on' }),
  h('button', { class: 'btn btn-outline', type: 'button', onClick: leaveDemo, text: 'Leave the demo' }));
const ghcButton = demoPanel.children[3];
const demoBadge = h('button', { class: 'demo-badge', type: 'button', hidden: true, onClick: () => show(demoPanel, demoPanel.hasAttribute('hidden')), text: 'Demo' });

function toggleGhc() {
  const sim = transport();
  sim.setGhc(!sim.ghc);
  setText(ghcButton, `Group-head buttons: ${sim.ghc ? 'on' : 'off'}`);
  reloadMachine();
}

function leaveDemo() {
  location.href = location.pathname;
}


// Inside the Decaid app a skin fills the screen, and on tablets set to button
// navigation there is no edge swipe to leave it. Decaid gives embedded skins
// this hook; it is absent in an ordinary browser, where the button stays hidden.
function exitToDecaid() {
  try { window.decentApp.exitToDashboard(); } catch { toast('Use the Android Back button to return to Decaid.'); }
}
const exitButton = h('button', { class: 'rail-item', type: 'button', hidden: true, 'aria-label': 'Exit to the Decaid dashboard', onClick: exitToDecaid }, icon('exit'), h('span', { text: 'Exit' }));

const settingsButton = h('button', {
  class: 'rail-item', type: 'button',
  onClick: () => { if (S.view === 'review') closeReview(); go('settings'); },
}, icon('settings'), h('span', { text: 'Settings' }));

const rail = h('nav', { class: 'rail', 'aria-label': 'Main' },
  h('div', { class: 'rail-group' }, h('div', { class: 'wordmark', text: 'mise' }), navButtons),
  h('div', { class: 'rail-group' },
    demoBadge,
    settingsButton,
    exitButton,
    h('button', { class: 'rail-item', type: 'button', onClick: () => requestState('sleeping') }, icon('sleep'), h('span', { text: 'Sleep' }))));

const main = h('main', { class: 'main' });
const toastEl = h('div', { class: 'toast', role: 'status', hidden: true });

// Sleep screen
const clock = h('span', { class: 'sleep-clock' });
const sleepScreen = h('div', { class: 'cover sleep', hidden: true },
  clock,
  h('span', { class: 'sleep-text', text: 'The machine is asleep' }),
  h('button', { class: 'btn btn-outline btn-big', type: 'button', onClick: () => requestState('idle'), text: 'Wake up' }));

// Connection screens
const coverTitle = h('h1', { class: 'page-title' });
const coverText = h('p', { class: 'muted cover-text' });
const retry = h('button', { class: 'btn btn-primary btn-big', type: 'button', onClick: () => start(false), text: 'Try again' });
const tryDemo = h('button', { class: 'btn btn-outline btn-big', type: 'button', onClick: () => start(true), text: 'Open the demo' });
// Shown only when an address was saved with ?gateway=, so a wrong one is easy to undo.
const forget = h('button', { class: 'btn btn-outline btn-big', type: 'button', onClick: () => { forgetGateway(); location.href = location.pathname; }, text: 'Use this tablet' });
const cover = h('div', { class: 'cover', hidden: true },
  h('div', { class: 'wordmark wordmark-big', text: 'mise' }), coverTitle, coverText,
  h('div', { class: 'cover-actions' }, retry, forget, tryDemo),
  h('span', { class: 'muted small', text: `Version ${VERSION}` }));

// Rename dialog
const renameInput = h('input', { id: 'rename-input', class: 'input', type: 'text', autocomplete: 'off', maxlength: '60' });
const renameNote = h('p', { class: 'muted small' });
const renameOriginal = h('button', { class: 'link', type: 'button', text: 'Use the original name' });
const renameSave = h('button', { class: 'btn btn-primary', type: 'submit', text: 'Save' });
const renameForm = h('form', { class: 'dialog', 'aria-labelledby': 'rename-title' },
  h('h2', { class: 'card-title', id: 'rename-title', text: 'Rename recipe' }),
  h('div', { class: 'field' }, h('label', { class: 'label', for: 'rename-input', text: 'Name' }), renameInput),
  renameNote,
  h('div', { class: 'dialog-actions' },
    renameOriginal,
    h('button', { class: 'btn btn-outline', type: 'button', onClick: closeDialog, text: 'Cancel' }),
    renameSave));
const dialogBackdrop = h('div', { class: 'backdrop', hidden: true }, renameForm);
let dialogFor = null;

async function submitRename(value) {
  const record = S.dialog?.record;
  if (!record) return;
  renameSave.disabled = true;
  const ok = await renameProfile(record, value);
  renameSave.disabled = false;
  if (ok) closeDialog();
}
renameForm.addEventListener('submit', (event) => { event.preventDefault(); submitRename(renameInput.value); });
renameOriginal.addEventListener('click', () => submitRename(S.dialog?.record?.profile?.title));
dialogBackdrop.addEventListener('pointerdown', (event) => { if (event.target === dialogBackdrop) closeDialog(); });

function renderDialog() {
  const dialog = S.dialog;
  show(dialogBackdrop, Boolean(dialog));
  if (!dialog) { dialogFor = null; return; }
  if (dialogFor === dialog) return;
  dialogFor = dialog;
  const record = dialog.record;
  renameInput.value = nameOf(record);
  const builtIn = record.isDefault !== false;
  setText(renameNote, builtIn
    ? `This is one of Decaid's built-in recipes, called "${record.profile.title}". Decaid does not let them be renamed, so the new name is used in Mise only.`
    : 'This is a recipe you made, so the name changes in Decaid and other skins too.');
  show(renameOriginal, Boolean(S.names[record.id]));
  renameInput.focus();
  renameInput.select();
}

app.append(rail, main, cover, sleepScreen, demoPanel, dialogBackdrop, toastEl);

// ── Screens ──────────────────────────────────────────────────────────────

const factories = {
  home: createHome, recipes: createRecipes, water: createWater,
  history: createHistory, review: createReview, brewing: createBrewing, settings: createSettings,
};
const screens = {};
let current = null;

function screen(name) {
  if (!screens[name]) screens[name] = factories[name]();
  return screens[name];
}

function render() {
  const connecting = S.mode === 'connecting';
  const offline = S.mode === 'offline';
  show(cover, connecting || offline);
  if (connecting) {
    setText(coverTitle, 'Connecting to Decaid');
    setText(coverText, 'One moment.');
  } else if (offline) {
    setText(coverTitle, 'Cannot reach Decaid');
    setText(coverText, `No answer from ${S.host}. Make sure the Decaid app is open on the tablet, then try again.`);
  }
  show(retry, offline);
  show(tryDemo, offline);
  show(forget, offline && Boolean(savedGateway()));
  if (connecting || offline) return;

  show(demoBadge, S.mode === 'demo');
  show(exitButton, Boolean(window.__DECENT_HOST__));
  const brewing = Boolean(S.shot);
  const asleep = !brewing && S.snap?.state?.state === 'sleeping';
  show(sleepScreen, asleep);
  if (asleep) setText(clock, new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));

  const name = brewing ? 'brewing' : (S.view === 'review' && !S.review ? 'home' : S.view);
  setAttr(app, 'data-screen', name);
  if (current !== name) {
    current = name;
    main.replaceChildren(screen(name).el);
    main.scrollTop = 0;
  }
  NAV.forEach((item, i) => {
    const active = item.view === name || (name === 'review' && item.view === 'home');
    setAttr(navButtons[i], 'aria-current', active ? 'page' : null);
  });
  setAttr(settingsButton, 'aria-current', name === 'settings' ? 'page' : null);
  screen(name).update();
  renderDialog();

  show(toastEl, Boolean(S.toast));
  if (S.toast) setText(toastEl, S.toast);
}

subscribe(render);

// ── Start-up ─────────────────────────────────────────────────────────────

async function start(demo) {
  let storage = null;
  try { storage = window.localStorage; } catch { /* storage unavailable */ }
  const t = demo
    ? createSim({ ghc: params.get('ghc') === '1', storage })
    : httpTransport(gatewayHost());
  if (demo) setText(ghcButton, `Group-head buttons: ${t.ghc ? 'on' : 'off'}`);
  render();
  await connect(t);
  render();
}

document.addEventListener('pointerdown', heartbeat, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (S.mode === 'live' || S.mode === 'demo')) loadAll();
});
setInterval(() => { if (S.snap?.state?.state === 'sleeping') render(); }, 30000);

if (forcedDemo) demoPanel.lastElementChild.hidden = true;
start(params.has('demo') || forcedDemo);
