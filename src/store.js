// Application state and every action that changes it. Views read `S` and are
// told to refresh through subscribe(); they never talk to the gateway directly.

import { clamp, roundTo, deepMerge, brewTemp, stepsAtTemp, summarizeShot } from './format.js';
import { fetchWeather, searchPlaces, demoWeather, demoPlaces } from './weather.js';

export const S = {
  mode: 'connecting',        // connecting | live | demo | offline
  host: '',
  machineConnected: false,
  scaleConnected: false,
  snap: null,                // latest machine snapshot
  info: null,                // { GHC, model, ... }
  water: null,               // { currentLevel, refillLevel } in mm
  scale: { weight: null, flow: null },
  workflow: null,
  profiles: null,
  favorites: null,           // profile ids, at most five
  shots: null,               // recent shots, newest first, without measurements
  shotsTotal: null,
  shotDetails: {},           // id -> full record
  selectedShot: null,
  cleaning: { interval: 50, totalAtClean: null, cleanedAt: null },
  view: 'home',              // home | recipes | water | history | review
  shot: null,                // live shot being pulled
  review: null,              // the shot that just finished
  saving: '',                // '' | saving | saved | error
  toast: null,
  settings: null,            // Decaid's own settings (gateway mode and so on)
  presence: null,            // auto-sleep settings
  display: null,             // screen brightness state
  build: null,               // Decaid version info
  names: {},                 // profile id -> name shown in Mise for built-in recipes
  dialog: null,              // { kind: 'recipe' | 'city', ... } while a dialog is open
  copies: [],                // your duplicated recipes, kept by Mise
  place: null,               // weather city: { name, region, latitude, longitude, unit }
  weather: null,             // latest weather for the sleep screen
};

let T = null;                // transport: { request, stream, demo }
const subscribers = new Set();
let queued = false;

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function emit() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    for (const fn of subscribers) fn(S);
  });
}

export function transport() {
  return T;
}

let toastTimer = null;
export function toast(message) {
  S.toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { S.toast = null; emit(); }, 4000);
  emit();
}

const api = (path) => `/api/v1${path}`;
const quiet = (promise) => promise.catch(() => null);

// ── Connecting ───────────────────────────────────────────────────────────

let closers = [];

export async function connect(newTransport) {
  for (const close of closers) close();
  closers = [];
  T = newTransport;
  S.host = T.host;
  S.mode = 'connecting';
  emit();
  try {
    await T.request('GET', api('/devices'), undefined, 4000);
  } catch {
    S.mode = 'offline';
    emit();
    return false;
  }
  S.mode = T.demo ? 'demo' : 'live';
  openStreams();
  await loadAll();
  return true;
}

export async function loadAll() {
  await Promise.all([
    loadMachine(),
    loadWorkflow(),
    quiet(T.request('GET', api('/profiles'))).then((list) => { if (Array.isArray(list)) S.profiles = list; }),
    loadShots(),
    quiet(T.request('GET', api('/store/mise/favorites'))).then((ids) => { if (Array.isArray(ids)) S.favorites = ids; }),
    quiet(T.request('GET', api('/store/mise/cleaning'))).then((c) => { if (c && typeof c === 'object') S.cleaning = { ...S.cleaning, ...c }; }),
    quiet(T.request('GET', api('/store/mise/names'))).then((n) => { if (n && typeof n === 'object' && !Array.isArray(n)) S.names = n; }),
    quiet(T.request('GET', api('/settings'))).then((s) => { if (s && typeof s === 'object') S.settings = s; }),
    quiet(T.request('GET', api('/store/mise/recipes'))).then((c) => { if (Array.isArray(c)) S.copies = c.filter((x) => x?.id && x?.profile?.title); }),
    quiet(T.request('GET', api('/store/mise/weather'))).then((p) => { if (p && typeof p.latitude === 'number') S.place = p; }),
  ]);
  if (S.cleaning.totalAtClean == null && S.shotsTotal != null) {
    S.cleaning.totalAtClean = S.shotsTotal;
    saveCleaning();
  }
  emit();
}

async function loadMachine() {
  const [devices, info, snap, water] = await Promise.all([
    quiet(T.request('GET', api('/devices'))),
    quiet(T.request('GET', api('/machine/info'))),
    quiet(T.request('GET', api('/machine/state'))),
    quiet(T.request('GET', api('/machine/waterLevels'))),
  ]);
  if (Array.isArray(devices)) applyDevices(devices);
  if (info) S.info = info;
  if (snap?.state) S.snap = snap;
  if (water) S.water = water;
}

export async function reloadMachine() {
  await loadMachine();
  emit();
}

async function loadWorkflow() {
  const workflow = await quiet(T.request('GET', api('/workflow')));
  if (workflow) S.workflow = workflow;
}

export async function loadShots() {
  const page = await quiet(T.request('GET', api('/shots?limit=30&offset=0')));
  const items = Array.isArray(page) ? page : page?.items;
  if (!Array.isArray(items)) return;
  S.shots = items.slice().sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  S.shotsTotal = Number.isFinite(page?.total) ? page.total : S.shots.length;
  if (S.shots[0]) loadShotDetail(S.shots[0].id);
  emit();
}

export async function loadShotDetail(id) {
  if (!id || S.shotDetails[id]) return S.shotDetails[id];
  const shot = await quiet(T.request('GET', api(`/shots/${encodeURIComponent(id)}`)));
  if (shot) {
    S.shotDetails[id] = { record: shot, ...summarizeShot(shot) };
    emit();
  }
  return S.shotDetails[id];
}

function applyDevices(devices) {
  const connected = (type) => devices.some((d) => d.type === type && d.state === 'connected');
  const hadMachine = S.machineConnected;
  S.machineConnected = connected('machine');
  S.scaleConnected = connected('scale');
  if (!S.scaleConnected) S.scale = { weight: null, flow: null };
  if (S.machineConnected && !hadMachine && S.mode !== 'connecting') {
    loadMachine().then(loadWorkflow).then(emit);
  }
  if (!S.machineConnected) S.snap = null;
}

function openStreams() {
  closers = [
    T.stream('/ws/v1/devices', (m) => { if (Array.isArray(m.devices)) { applyDevices(m.devices); emit(); } }),
    T.stream('/ws/v1/machine/snapshot', onSnapshot),
    T.stream('/ws/v1/scale/snapshot', (m) => {
      if (m.status) {
        S.scaleConnected = m.status === 'connected';
        if (!S.scaleConnected) S.scale = { weight: null, flow: null };
      } else if (typeof m.weight === 'number') {
        S.scaleConnected = true;
        S.scale = { weight: m.weight, flow: typeof m.weightFlow === 'number' ? m.weightFlow : null };
        if (S.review && Date.now() - S.review.endedAt < 8000 && m.weight > S.review.out) S.review.out = m.weight;
      }
      emit();
    }),
    T.stream('/ws/v1/machine/waterLevels', (m) => { if (typeof m.currentLevel === 'number') { S.water = m; emit(); } }),
    T.stream('/ws/v1/machine/shotState', (m) => { if (m.shotId && S.shot) S.shot.id = m.shotId; }),
  ];
}

// ── Live shot tracking ───────────────────────────────────────────────────

function onSnapshot(snap) {
  if (!snap?.state) return;
  S.snap = snap;
  S.machineConnected = true;
  const state = snap.state.state;
  const sub = snap.state.substate;
  const ts = Date.parse(snap.timestamp) || Date.now();

  if (state === 'espresso') {
    if (!S.shot) {
      S.shot = { phase: 'prep', t0: null, seconds: 0, samples: [], frame: 0, id: null, startedAt: Date.now() };
    }
    const shot = S.shot;
    if (sub === 'preinfusion' || sub === 'pouring') {
      if (shot.t0 === null) shot.t0 = ts;
      shot.phase = 'running';
      shot.seconds = Math.max(0, (ts - shot.t0) / 1000);
      shot.frame = Number(snap.profileFrame) || 0;
      // Decaid zeroes the scale as the shot starts; skip the first second so a
      // cup's weight from before the tare never reaches the chart.
      const weight = shot.seconds < 1 || S.scale.weight == null ? null : Math.max(0, S.scale.weight);
      shot.samples.push({ t: shot.seconds, p: snap.pressure || 0, f: snap.flow || 0, w: weight });
    } else if (shot.phase === 'running') {
      shot.phase = 'ending';
    }
  } else if (S.shot) {
    finishShot();
  }
  emit();
}

function finishShot() {
  const shot = S.shot;
  S.shot = null;
  if (shot.t0 === null || shot.seconds < 5) return; // never really poured
  const previous = S.shots?.[0] ? S.shotDetails[S.shots[0].id] : null;
  const context = S.workflow?.context || {};
  S.review = {
    endedAt: Date.now(),
    startedAt: shot.startedAt,
    title: displayTitle(S.workflow?.profile?.title) || 'Espresso',
    coffee: context.coffeeName || '',
    dose: Number(context.targetDoseWeight) || null,
    target: Number(context.targetYield) || null,
    grind: context.grinderSetting ?? null,
    seconds: shot.seconds,
    out: S.scaleConnected && S.scale.weight != null ? S.scale.weight : null,
    samples: shot.samples,
    id: shot.id,
    notes: '',
    taste: null,
    saved: '',
    previous: previous ? { seconds: previous.seconds, out: previous.out } : null,
  };
  S.view = 'review';
  findSavedShot(0);
}

// Decaid stores the shot a moment after it ends. Find that record so notes
// and the taste tag can be attached to it.
function findSavedShot(attempt) {
  const review = S.review;
  const waits = [3000, 3000, 5000];
  if (!review || attempt >= waits.length) {
    if (review && !review.recordFound) { review.saved = 'unsaved'; emit(); }
    return;
  }
  setTimeout(async () => {
    if (S.review !== review) return;
    await loadShots();
    const match = (S.shots || []).find((s) => (review.id && s.id === review.id)
      || Math.abs(Date.parse(s.timestamp) - review.startedAt) < 120000);
    if (!match) { findSavedShot(attempt + 1); return; }
    review.id = match.id;
    review.recordFound = true;
    await saveReview();
  }, waits[attempt]);
}

async function saveReview() {
  const review = S.review;
  if (!review?.recordFound) return;
  const annotations = {
    extras: { mise: { seconds: Math.round(review.seconds * 10) / 10, out: review.out, taste: review.taste } },
  };
  if (review.notes) annotations.espressoNotes = review.notes;
  try {
    await T.request('PUT', api(`/shots/${encodeURIComponent(review.id)}`), { annotations });
    delete S.shotDetails[review.id];
    review.saved = 'saved';
    loadShots();
  } catch {
    review.saved = 'error';
  }
  emit();
}

let reviewTimer = null;
export function editReview(patch) {
  if (!S.review) return;
  Object.assign(S.review, patch);
  clearTimeout(reviewTimer);
  reviewTimer = setTimeout(saveReview, 700);
  emit();
}

export function closeReview() {
  clearTimeout(reviewTimer);
  if (S.review?.recordFound) saveReview();
  S.review = null;
  S.view = 'home';
  emit();
}

// ── Recipe settings (the workflow) ───────────────────────────────────────

let pending = {};
let saveTimer = null;
let saveSeq = 0;

function queuePatch(patch) {
  if (!S.workflow) return;
  pending = deepMerge(pending, patch);
  S.workflow = deepMerge(S.workflow, patch);
  S.saving = 'saving';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPatch, 500);
  emit();
}

async function flushPatch() {
  const body = pending;
  pending = {};
  const seq = ++saveSeq;
  try {
    const workflow = await T.request('PUT', api('/workflow'), body);
    if (seq !== saveSeq || Object.keys(pending).length) return;
    if (workflow?.profile) S.workflow = workflow;
    S.saving = 'saved';
    setTimeout(() => { if (S.saving === 'saved') { S.saving = ''; emit(); } }, 1500);
  } catch {
    S.saving = 'error';
    toast('That change did not reach the machine. Check the connection and try again.');
    await loadWorkflow();
  }
  emit();
}

export const values = {
  dose: () => Number(S.workflow?.context?.targetDoseWeight) || 0,
  out: () => Number(S.workflow?.context?.targetYield) || 0,
  temp: () => brewTemp(S.workflow?.profile),
  grind: () => S.workflow?.context?.grinderSetting ?? '',
};

export function setDose(value) {
  const dose = Math.round(clamp(value, 5, 30) * 10) / 10;
  queuePatch({ context: { targetDoseWeight: dose } });
  tuneCopy((copy) => { copy.dose = dose; });
}

export function setOut(value) {
  const out = Math.round(clamp(value, 0, 250));
  const patch = { context: { targetYield: out } };
  if (out > 0) patch.profile = { target_weight: out };
  queuePatch(patch);
  tuneCopy((copy) => {
    copy.out = out;
    if (out > 0) copy.profile = { ...copy.profile, target_weight: out };
  });
}

export function setTemp(value) {
  const steps = stepsAtTemp(S.workflow?.profile, roundTo(clamp(value, 70, 105), 0.5));
  if (!steps) return;
  queuePatch({ profile: { steps } });
  tuneCopy((copy) => { copy.profile = { ...copy.profile, steps }; });
}

export function setGrind(value) {
  const grind = String(Math.round(clamp(value, 0, 999) * 100) / 100);
  queuePatch({ context: { grinderSetting: grind } });
  tuneCopy((copy) => { copy.grind = grind; });
}

export function setSteam(patch) { queuePatch({ steamSettings: patch }); }
export function setHotWater(patch) { queuePatch({ hotWaterData: patch }); }
export function setRinse(patch) { queuePatch({ rinseData: patch }); }

async function putWorkflow(body, done) {
  clearTimeout(saveTimer);
  pending = {};
  saveSeq += 1;
  try {
    const workflow = await T.request('PUT', api('/workflow'), body);
    if (workflow?.profile) S.workflow = workflow; else await loadWorkflow();
    if (done) toast(done);
  } catch {
    toast('That did not reach the machine. Check the connection and try again.');
  }
  emit();
}

export function useProfile(record, message) {
  const target = Number(record.profile?.target_weight);
  const body = { profile: record.profile };
  const context = {};
  if (record.copy && record.out != null) context.targetYield = record.out;
  else if (target > 0) context.targetYield = target;
  if (record.copy && record.dose) context.targetDoseWeight = record.dose;
  if (record.copy && record.grind != null && record.grind !== '') context.grinderSetting = String(record.grind);
  if (Object.keys(context).length) body.context = context;
  S.workflow = deepMerge(S.workflow || {}, body);
  emit();
  return putWorkflow(body, message || `Now using ${nameOf(record)}`);
}

export function brewAgain(shot) {
  const source = shot?.workflow;
  if (!source?.profile) { toast('This shot has no recipe stored with it.'); return; }
  const context = {};
  for (const key of ['targetDoseWeight', 'targetYield', 'grinderSetting', 'grinderModel', 'coffeeName', 'coffeeRoaster']) {
    if (source.context?.[key] != null) context[key] = source.context[key];
  }
  if (context.targetYield == null) context.targetYield = 0;
  S.view = 'home';
  return putWorkflow({ profile: source.profile, context }, 'Loaded the settings from that shot');
}

// ── Recipes and favourites ───────────────────────────────────────────────

// Decaid's recipes followed by your own copies, in one list. A copy looks like
// a Decaid profile record with `copy: true` and its own dose, yield and grind.
let listProfiles = null;
let listCopies = null;
let listCache = [];
export function visibleProfiles() {
  if (listProfiles === S.profiles && listCopies === S.copies) return listCache;
  listProfiles = S.profiles;
  listCopies = S.copies;
  listCache = (S.profiles || [])
    .filter((r) => r?.profile?.title && (r.visibility || 'visible') === 'visible')
    .concat(S.copies.map((c) => ({
      id: c.id, profile: c.profile, isDefault: false, copy: true,
      dose: c.dose ?? null, grind: c.grind ?? null, out: c.out ?? null, from: c.from || '',
    })));
  return listCache;
}

export function favoriteIds() {
  const all = visibleProfiles();
  if (Array.isArray(S.favorites)) {
    const known = new Set(all.map((r) => r.id));
    return S.favorites.filter((id) => known.has(id)).slice(0, 5);
  }
  return all.filter((r) => (r.profile.beverage_type || 'espresso') === 'espresso').slice(0, 5).map((r) => r.id);
}

export function toggleFavorite(id) {
  const current = favoriteIds();
  let next;
  if (current.includes(id)) next = current.filter((x) => x !== id);
  else if (current.length >= 5) { toast('Five recipes are starred already. Remove a star first.'); return; }
  else next = [...current, id];
  S.favorites = next;
  emit();
  T.request('POST', api('/store/mise/favorites'), next).catch(() => toast('Could not save your starred recipes.'));
}

export function isInUse(record) {
  return Boolean(S.workflow?.profile?.title) && record.profile.title === S.workflow.profile.title;
}

// ── Machine actions ──────────────────────────────────────────────────────

export async function requestState(state) {
  try {
    await T.request('PUT', api(`/machine/state/${state}`));
  } catch {
    toast('The machine did not accept that. Check the connection.');
  }
}

export async function tare() {
  try {
    await T.request('PUT', api('/scale/tare'));
  } catch (error) {
    toast(error.status === 400 ? 'The scale cannot be zeroed during a shot.' : 'The scale did not respond.');
  }
}

export function scan() {
  quiet(T.request('GET', api('/devices/scan?quick=true')));
  toast('Looking for the machine…');
}

let lastBeat = 0;
export function heartbeat() {
  if (!T || S.mode === 'offline' || Date.now() - lastBeat < 60000) return;
  lastBeat = Date.now();
  quiet(T.request('POST', api('/machine/heartbeat')));
}

// ── Cleaning reminder ────────────────────────────────────────────────────

export function shotsSinceClean() {
  if (S.shotsTotal == null || S.cleaning.totalAtClean == null) return null;
  return Math.max(0, S.shotsTotal - S.cleaning.totalAtClean);
}

export function cleaningDue() {
  const since = shotsSinceClean();
  return since != null && since >= S.cleaning.interval;
}

function saveCleaning() {
  quiet(T.request('POST', api('/store/mise/cleaning'), S.cleaning));
}

export function markCleaned() {
  S.cleaning = { ...S.cleaning, totalAtClean: S.shotsTotal ?? 0, cleanedAt: new Date().toISOString() };
  saveCleaning();
  toast('Noted. The count starts again from zero.');
}

export function setCleanInterval(value) {
  S.cleaning = { ...S.cleaning, interval: clamp(Math.round(value / 10) * 10, 10, 200) };
  saveCleaning();
  emit();
}

// ── Navigation and status ────────────────────────────────────────────────

export function go(view) {
  S.view = view;
  if (view === 'settings') loadSettings();
  if (view === 'history') {
    if (!S.selectedShot && S.shots?.[0]) selectShot(S.shots[0].id);
    backfillTimes();
  }
  emit();
}

// Shots pulled with another skin carry no stored time. Read the first few
// in full, one at a time, so the History list can show how long they took.
let backfilling = false;
async function backfillTimes() {
  if (backfilling) return;
  backfilling = true;
  try {
    for (const shot of (S.shots || []).slice(0, 12)) {
      if (S.view !== 'history') break;
      if (S.shotDetails[shot.id] || shot.annotations?.extras?.mise?.seconds) continue;
      await loadShotDetail(shot.id);
    }
  } finally {
    backfilling = false;
  }
}

export function selectShot(id) {
  S.selectedShot = id;
  loadShotDetail(id);
  emit();
}

// One plain-language line about what the machine is doing right now.
export function status() {
  if (!S.machineConnected) return { tone: 'off', title: 'Machine not connected', sub: 'Check that it is switched on. Decaid keeps looking for it.' };
  const snap = S.snap;
  if (!snap) return { tone: 'wait', title: 'Connecting to the machine', sub: 'One moment' };
  const state = snap.state.state;
  const group = Number(snap.groupTemperature);
  const target = Number(snap.targetGroupTemperature);
  switch (state) {
    case 'sleeping': return { tone: 'off', title: 'Machine is asleep', sub: 'Tap Wake to heat it up' };
    case 'needsWater': return { tone: 'warn', title: 'Water tank is empty', sub: 'Fill the tank to carry on' };
    case 'error': return { tone: 'warn', title: 'The machine reports a problem', sub: 'Open Settings for the details' };
    case 'booting': return { tone: 'wait', title: 'Starting up', sub: 'One moment' };
    case 'heating':
    case 'preheating':
      return { tone: 'wait', title: 'Heating up', sub: heatLine(group, target) };
    case 'steam': return { tone: 'busy', title: 'Steaming', sub: 'Stops by itself' };
    case 'hotWater': return { tone: 'busy', title: 'Pouring hot water', sub: 'Stops by itself' };
    case 'flush': return { tone: 'busy', title: 'Rinsing the group', sub: 'Stops by itself' };
    case 'cleaning':
    case 'descaling': return { tone: 'busy', title: 'Cleaning cycle running', sub: 'Leave the machine until it finishes' };
    case 'espresso': return { tone: 'busy', title: 'Brewing', sub: '' };
    default:
      if (target > 0 && Number.isFinite(group) && group < target - 2.5) {
        return { tone: 'wait', title: 'Heating up', sub: heatLine(group, target) };
      }
      return { tone: 'ok', title: 'Ready to brew', sub: 'The machine is at temperature' };
  }
}

function heatLine(group, target) {
  if (!Number.isFinite(group)) return 'A few minutes';
  return target > 0 ? `${Math.round(group)} °C of ${Math.round(target)} °C` : `${Math.round(group)} °C`;
}

export function waterLabel() {
  const w = S.water;
  if (!w || typeof w.currentLevel !== 'number') return { text: '–', low: false };
  const refill = Number(w.refillLevel) || 0;
  if (w.currentLevel <= refill) return { text: 'Empty', low: true };
  if (w.currentLevel <= refill + 8) return { text: 'Low', low: true };
  return { text: 'OK', low: false };
}

// ── Recipe names ─────────────────────────────────────────────────────────
// Decaid lets a skin rename recipes you made yourself. Its built-in recipes
// cannot be changed, so for those Mise keeps the new name itself (in Decaid's
// key-value store) and shows it wherever the recipe appears.

export function nameOf(record) {
  return S.names[record.id] || record.profile.title;
}

let titleMap = {};
let titleMapProfiles = null;
let titleMapNames = null;

// For places that only know a recipe's original title (the current workflow,
// saved shots).
export function displayTitle(title) {
  if (!title) return title;
  if (titleMapProfiles !== S.profiles || titleMapNames !== S.names) {
    titleMapProfiles = S.profiles;
    titleMapNames = S.names;
    titleMap = {};
    for (const record of S.profiles || []) {
      const alias = S.names[record.id];
      if (alias && record.profile?.title) titleMap[record.profile.title] = alias;
    }
  }
  return titleMap[title] || title;
}

function saveNames() {
  T.request('POST', api('/store/mise/names'), S.names).catch(() => toast('Could not save the recipe name.'));
}

function setAlias(record, name) {
  const names = { ...S.names };
  if (!name || name === record.profile.title) delete names[record.id];
  else names[record.id] = name;
  S.names = names;
  saveNames();
}

export async function renameProfile(record, input) {
  const name = cleanName(input);
  if (!name) { toast('Type a name first.'); return false; }
  const original = record.profile.title;
  if (record.copy) return renameCopy(record, name);

  if (record.isDefault === false && name !== original) {
    try {
      const updated = await T.request('PUT', api(`/profiles/${encodeURIComponent(record.id)}`), {
        profile: { ...record.profile, title: name },
      });
      const next = updated?.profile ? updated : { ...record, profile: { ...record.profile, title: name } };
      S.profiles = (S.profiles || []).map((r) => (r.id === record.id ? next : r));
      if (next.id !== record.id && Array.isArray(S.favorites) && S.favorites.includes(record.id)) {
        S.favorites = S.favorites.map((id) => (id === record.id ? next.id : id));
        quiet(T.request('POST', api('/store/mise/favorites'), S.favorites));
      }
      if (S.names[record.id]) setAlias(record, null);
      if (S.workflow?.profile?.title === original) queuePatch({ profile: { title: name } });
      toast(`Renamed to ${name}`);
      emit();
      return true;
    } catch {
      // Decaid refused; keep the name in Mise instead.
    }
  }
  setAlias(record, name);
  toast(name === original ? 'Back to the original name' : `Renamed to ${name}`);
  emit();
  return true;
}

export function openRename(record) {
  S.dialog = { kind: 'recipe', mode: 'rename', record };
  emit();
}

export function openDuplicate(record) {
  S.dialog = { kind: 'recipe', mode: 'duplicate', record };
  emit();
}

export function openCity() {
  S.dialog = { kind: 'city' };
  emit();
}

export function closeDialog() {
  S.dialog = null;
  emit();
}

// ── Settings ─────────────────────────────────────────────────────────────

export async function loadSettings() {
  const [settings, presence, display, build] = await Promise.all([
    quiet(T.request('GET', api('/settings'))),
    quiet(T.request('GET', api('/presence/settings'))),
    quiet(T.request('GET', api('/display'))),
    quiet(T.request('GET', api('/info'))),
  ]);
  if (settings && typeof settings === 'object') S.settings = settings;
  if (presence && typeof presence === 'object') S.presence = presence;
  if (display && typeof display === 'object') S.display = display;
  if (build && typeof build === 'object') S.build = build;
  emit();
}

const NOT_SAVED = 'That setting could not be saved. Check the connection and try again.';

export async function updateSettings(patch) {
  if (!S.settings) return;
  const before = S.settings;
  S.settings = { ...before, ...patch };
  emit();
  try {
    const result = await T.request('POST', api('/settings'), patch);
    if (result && typeof result === 'object' && 'gatewayMode' in result) S.settings = { ...S.settings, ...result };
  } catch {
    S.settings = before;
    toast(NOT_SAVED);
  }
  emit();
}

export async function updatePresence(patch) {
  if (!S.presence) return;
  const before = S.presence;
  S.presence = { ...before, ...patch };
  emit();
  try {
    await T.request('POST', api('/presence/settings'), patch);
  } catch {
    S.presence = before;
    toast(NOT_SAVED);
  }
  emit();
}

export async function setBrightness(value) {
  if (!S.display) return;
  const brightness = clamp(Math.round(value / 10) * 10, 10, 100);
  const before = S.display;
  S.display = { ...before, brightness, requestedBrightness: brightness };
  emit();
  try {
    const result = await T.request('PUT', api('/display/brightness'), { brightness });
    if (result && typeof result === 'object' && 'brightness' in result) S.display = result;
  } catch {
    S.display = before;
    toast(NOT_SAVED);
  }
  emit();
}

// Decaid's own, complete settings page. It is a separate page with its own
// look; its Back button returns here.
export function openDecaidSettings() {
  if (S.mode !== 'live') { toast('That page belongs to Decaid. It is not part of the demo.'); return; }
  location.href = `http://${S.host}/api/v1/plugins/settings.reaplugin/ui?backName=Mise`;
}

export function gatewayMode() {
  return S.settings?.gatewayMode || null;
}

// ── Your copies of recipes ───────────────────────────────────────────────
// Decaid identifies a recipe by its steps, so it cannot hold two recipes that
// are identical. A copy you are about to tune starts out identical, so Mise
// keeps copies itself (key-value store, mise/recipes). Each copy carries the
// whole recipe plus its own dose, yield and grinder setting, and whatever you
// change on the Brew screen while a copy is in use is saved back to it.

function cleanName(input) {
  return String(input || '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function uniqueTitle(wanted, exceptId) {
  const taken = new Set();
  for (const r of visibleProfiles()) {
    if (r.id === exceptId) continue;
    taken.add(r.profile.title.toLowerCase());
    taken.add(nameOf(r).toLowerCase());
  }
  let title = wanted;
  for (let n = 2; taken.has(title.toLowerCase()); n += 1) title = `${wanted} ${n}`;
  return title;
}

function saveCopies() {
  clearTimeout(copyTimer);
  T.request('POST', api('/store/mise/recipes'), S.copies).catch(() => toast('Could not save your copy. Check the connection.'));
}

function activeCopy() {
  const title = S.workflow?.profile?.title;
  return title ? S.copies.find((c) => c.profile.title === title) || null : null;
}

export function copyInUse() {
  return Boolean(activeCopy());
}

let copyTimer = null;
function tuneCopy(change) {
  const copy = activeCopy();
  if (!copy) return;
  const next = { ...copy };
  change(next);
  S.copies = S.copies.map((c) => (c === copy ? next : c));
  clearTimeout(copyTimer);
  copyTimer = setTimeout(saveCopies, 800);
}

export async function duplicateProfile(record, input) {
  const wanted = cleanName(input);
  if (!wanted) { toast('Type a name for the copy first.'); return false; }
  const inUse = isInUse(record);
  const base = inUse && S.workflow?.profile ? S.workflow.profile : record.profile;
  const title = uniqueTitle(wanted);
  const grind = values.grind();
  const copy = {
    id: `mise:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    profile: { ...JSON.parse(JSON.stringify(base)), title },
    dose: inUse ? (values.dose() || null) : record.dose ?? null,
    out: inUse ? values.out() : record.out ?? null,
    grind: inUse ? (grind === '' ? null : String(grind)) : record.grind ?? null,
    from: nameOf(record),
    createdAt: new Date().toISOString(),
  };
  const starred = favoriteIds();
  S.copies = [...S.copies, copy];
  saveCopies();
  // Keep the new copy on the Brew screen when there is room for it.
  if (starred.length < 5) {
    S.favorites = [...starred, copy.id];
    quiet(T.request('POST', api('/store/mise/favorites'), S.favorites));
  }
  const made = visibleProfiles().find((r) => r.id === copy.id);
  await useProfile(made, `Now using your copy, ${title}. Changes on the Brew screen are saved to it.`);
  return true;
}

function renameCopy(record, name) {
  const original = record.profile.title;
  const title = uniqueTitle(name, record.id);
  S.copies = S.copies.map((c) => (c.id === record.id ? { ...c, profile: { ...c.profile, title } } : c));
  if (S.workflow?.profile?.title === original) queuePatch({ profile: { title } });
  saveCopies();
  toast(`Renamed to ${title}`);
  emit();
  return true;
}

export function deleteCopy(record) {
  S.copies = S.copies.filter((c) => c.id !== record.id);
  saveCopies();
  if (Array.isArray(S.favorites) && S.favorites.includes(record.id)) {
    S.favorites = S.favorites.filter((id) => id !== record.id);
    quiet(T.request('POST', api('/store/mise/favorites'), S.favorites));
  }
  toast(`Deleted your copy, ${record.profile.title}`);
  emit();
}

// ── Weather for the sleep screen ─────────────────────────────────────────

let demoWeatherIndex = 0;
let weatherBusy = false;

export async function loadWeather(force = false) {
  const demo = S.mode === 'demo';
  if (!S.place && !demo) { if (S.weather) { S.weather = null; emit(); } return; }
  if (weatherBusy) return;
  if (!force && S.weather && Date.now() - S.weather.at < 10 * 60 * 1000) return;
  weatherBusy = true;
  try {
    S.weather = demo ? demoWeather(demoWeatherIndex, S.place?.unit) : await fetchWeather(S.place);
  } catch {
    // Keep showing the last reading for a couple of hours, then drop it.
    if (S.weather && Date.now() - S.weather.at > 2 * 60 * 60 * 1000) S.weather = null;
  }
  weatherBusy = false;
  emit();
}

export function nextDemoWeather() {
  demoWeatherIndex += 1;
  loadWeather(true);
}

export function findPlaces(query) {
  return S.mode === 'demo' ? demoPlaces(query) : searchPlaces(query);
}

function savePlace() {
  T.request('POST', api('/store/mise/weather'), S.place).catch(() => toast('Could not save the weather city.'));
}

export function setPlace(place) {
  S.place = place ? { ...place, unit: S.place?.unit || 'c' } : null;
  S.weather = null;
  savePlace();
  emit();
  loadWeather(true);
}

export function setWeatherUnit(unit) {
  if (!S.place) return;
  S.place = { ...S.place, unit };
  S.weather = null;
  savePlace();
  emit();
  loadWeather(true);
}
