// Entry point: picks the gateway (or the demo), builds the shell, and shows
// what fits the moment: Brew underneath, a sheet over it when one is open,
// and the shot, steam or the sleep screen over everything when the machine
// is busy or asleep.

import { h, setText, setAttr, show, icon } from './dom.js';
import { gatewayHost, httpTransport, savedGateway, forgetGateway } from './api.js';
import { createSim } from './sim.js';
import {
  S, subscribe, connect, loadAll, go, requestState, heartbeat, toast, transport, reloadMachine, status, closeEditor,
} from './store.js';
import { deg } from './format.js';
import { watchViewport } from './viewport.js';
import { createHome } from './views/home.js';
import { createShot } from './views/shot.js';
import { createUtility } from './views/utility.js';
import { createRuler } from './views/ruler.js';
import { createRecipes } from './views/recipes.js';
import { createRecipe } from './views/recipe.js';
import { createHistory } from './views/history.js';
import { createSettings } from './views/settings.js';
import { createCoffees } from './views/coffees.js';
import { createSleep } from './views/sleep.js';
import { createDialogs } from './views/dialogs.js';

const VERSION = '0.7.0';
document.documentElement.dataset.miseVersion = VERSION;
watchViewport();
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
// A page can ask for the demo outright with <html data-demo>, for hosts that
// drop the query string.
const forcedDemo = document.documentElement.hasAttribute('data-demo');

// ── Demo panel ───────────────────────────────────────────────────────────

const ghcButton = h('button', { class: 'btn btn-outline', type: 'button', onClick: toggleGhc, text: 'Group-head buttons: on' });
const leaveButton = h('button', { class: 'btn btn-outline', type: 'button', onClick: () => { location.href = location.pathname; }, text: 'Leave the demo' });
const demoPanel = h('div', { class: 'demo-panel', hidden: true },
  h('strong', { text: 'Demo mode' }),
  h('span', { class: 'muted', text: 'A pretend machine and scale. Nothing here reaches a real machine.' }),
  h('button', { class: 'btn btn-outline', type: 'button', onClick: () => { transport().press('espresso'); show(demoPanel, false); }, text: 'Press the espresso button' }),
  h('button', { class: 'btn btn-outline', type: 'button', onClick: () => { transport().press('steam'); show(demoPanel, false); }, text: 'Press the steam button' }),
  h('button', { class: 'btn btn-outline', type: 'button', onClick: () => transport().cycleWater(), text: 'Change the water level' }),
  ghcButton, leaveButton);
const demoBadge = h('button', { class: 'demo-badge', type: 'button', hidden: true, onClick: () => show(demoPanel, demoPanel.hasAttribute('hidden')), text: 'Demo' });

function toggleGhc() {
  const sim = transport();
  sim.setGhc(!sim.ghc);
  setText(ghcButton, `Group-head buttons: ${sim.ghc ? 'on' : 'off'}`);
  reloadMachine();
}

// ── Top bar ──────────────────────────────────────────────────────────────

// Inside the Decaid app a skin fills the screen, and on tablets set to button
// navigation there is no edge swipe to leave it. Decaid gives embedded skins
// this hook; it is absent in an ordinary browser, where the button stays hidden.
function exitToDecaid() {
  try { window.decentApp.exitToDashboard(); } catch { toast('Use the Android Back button to return to Decaid.'); }
}

const pillText = h('span');
const pill = h('span', { class: 'status-pill', role: 'status' }, h('span', { class: 'status-dot', 'aria-hidden': 'true' }), pillText);
const topBtn = (name, label, onClick) => h('button', { class: 'top-btn', type: 'button', 'aria-label': label, onClick }, icon(name), h('span', { class: 'top-label', text: label }));
const historyBtn = topBtn('history', 'History', () => go('history'));
const settingsBtn = topBtn('settings', 'Settings', () => go('settings'));
const sleepBtn = topBtn('sleep', 'Sleep', () => requestState('sleeping'));
const exitBtn = topBtn('exit', 'Exit', exitToDecaid);
exitBtn.hidden = true;

const topbar = h('header', { class: 'topbar' },
  h('div', { class: 'top-left' }, h('span', { class: 'wordmark', text: 'mise' }), pill),
  h('div', { class: 'top-right' }, demoBadge, historyBtn, settingsBtn, sleepBtn, exitBtn));

function pillLine() {
  const st = status();
  const snap = S.snap;
  const group = Number(snap?.groupTemperature);
  const target = Number(snap?.targetGroupTemperature);
  const short = {
    ok: 'Ready', wait: st.title, busy: st.title, warn: st.title, off: st.title,
  }[st.tone] || st.title;
  let temp = '';
  if (S.machineConnected && Number.isFinite(group) && group > 0) {
    temp = st.tone === 'wait' && target > 0 ? `${deg(group)} of ${deg(target)}` : deg(group);
  }
  return { tone: st.tone, text: [short, temp].filter(Boolean).join(' · ') };
}

// ── Layers ───────────────────────────────────────────────────────────────

const home = createHome();
const shot = createShot();
const utility = createUtility();
const ruler = createRuler();
const sleep = createSleep();
const dialogs = createDialogs();
const sheetBox = h('div', { class: 'sheet' });
const sheetLayer = h('div', { class: 'sheet-layer', hidden: true }, sheetBox);
sheetLayer.addEventListener('pointerdown', (e) => { if (e.target === sheetLayer) go('home'); });
const toastEl = h('div', { class: 'toast', role: 'status', hidden: true });

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

const main = h('main', { class: 'main' }, topbar, home.el);
app.append(main, sheetLayer, shot.el, utility.el, ruler.el, dialogs.el, cover, sleep.el, demoPanel, toastEl);

const sheets = { recipes: createRecipes, recipe: createRecipe, history: createHistory, settings: createSettings, coffees: createCoffees };
const built = {};
let currentSheet = null;

function sheet(name) {
  if (!built[name]) built[name] = sheets[name]();
  return built[name];
}

// ── Render ───────────────────────────────────────────────────────────────

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
  show(exitBtn, Boolean(window.__DECENT_HOST__));
  const p = pillLine();
  setAttr(pill, 'data-tone', p.tone);
  setText(pillText, p.text);

  const asleep = !S.shot && S.snap?.state?.state === 'sleeping';
  sleep.update(asleep);

  const name = sheets[S.view] ? S.view : null;
  setAttr(app, 'data-screen', S.shot || S.review ? 'shot' : (name || 'home'));
  setAttr(historyBtn, 'aria-current', name === 'history' ? 'page' : null);
  setAttr(settingsBtn, 'aria-current', name === 'settings' ? 'page' : null);
  if (name !== currentSheet) {
    currentSheet = name;
    show(sheetLayer, Boolean(name));
    if (name) {
      sheetBox.replaceChildren(sheet(name).el);
      sheetBox.scrollTop = 0;
    } else {
      sheetBox.replaceChildren();
    }
  }
  home.update();
  if (name) sheet(name).update();
  shot.update();
  utility.update();
  ruler.update();
  dialogs.update();

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
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (S.editor) closeEditor(); else if (sheets[S.view]) go('home');
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (S.mode === 'live' || S.mode === 'demo')) loadAll();
});

if (forcedDemo) leaveButton.hidden = true;
start(params.has('demo') || forcedDemo);
