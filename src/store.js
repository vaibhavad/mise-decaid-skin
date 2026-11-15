// Application state and every action that changes it. Views read `S` and are
// told to refresh through subscribe(); they never talk to the gateway directly.

import { clamp, roundTo, deepMerge, brewTemp, stepsAtTemp, summarizeShot, sampleFrom, tankMl, litres, TANK_ML, setTempUnit } from './format.js';
import { fetchWeather, searchPlaces, demoWeather, demoPlaces } from './weather.js';

export const UTILITY_CARDS = ['hotWater', 'steam', 'flush', 'scale'];
export const DEFAULT_LAYOUT = { cards: UTILITY_CARDS.slice(), hidden: [], tank: true, last: true, unit: 'c', screenOff: 0, deductDose: true, scaleTimer: true };

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
  view: 'home',              // home, or a sheet over it: recipes | recipe | history | settings
  recipeId: null,            // the recipe open in the detail page
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
  layout: { ...DEFAULT_LAYOUT }, // what the Brew screen shows, units, screen off
  editor: null,              // the value being edited with the ruler
  utility: null,             // steam, hot water or flush while it runs
  compareShot: null,         // shot laid under the selected one in History
  beans: [],                 // coffee library (archived ones included)
  batches: [],               // bags of each coffee (archived ones included)
  historyBean: null,         // History shows only this coffee's shots
  hiddenProfiles: [],        // recipes you hid
  lineage: {},               // recipe id -> its versions
  machineSettings: null,     // fan, tank, purge mode…
  advanced: null,            // heater settings
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
    quiet(T.request('GET', api('/store/mise/layout'))).then((l) => { if (l && typeof l === 'object' && !Array.isArray(l)) applyLayout(l); }),
    loadCoffees(),
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
  const filter = S.historyBean ? `&beanId=${encodeURIComponent(S.historyBean)}` : '';
  const page = await quiet(T.request('GET', api(`/shots?limit=30&offset=0${filter}`)));
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
      scaleTimer('reset');
    }
    const shot = S.shot;
    if (sub === 'preinfusion' || sub === 'pouring') {
      if (shot.t0 === null) { shot.t0 = ts; scaleTimer('start'); }
      shot.phase = 'running';
      shot.seconds = Math.max(0, (ts - shot.t0) / 1000);
      shot.frame = Number(snap.profileFrame) || 0;
      // Decaid zeroes the scale as the shot starts; skip the first second so a
      // cup's weight from before the tare never reaches the chart.
      const weight = shot.seconds < 1 || S.scale.weight == null ? null : Math.max(0, S.scale.weight);
      shot.samples.push(sampleFrom(snap, shot.seconds, weight));
    } else if (shot.phase === 'running') {
      shot.phase = 'ending';
      scaleTimer('stop');
    }
  } else if (S.shot) {
    finishShot();
  }
  trackUtility(state);
  emit();
}

// Steam, hot water and flush: how long the current one has been running.
// The card stays up for a moment after it ends, so the last reading shows.
let utilityTimer = null;
function trackUtility(state) {
  const running = ['steam', 'hotWater', 'flush'].includes(state);
  if (running) {
    clearTimeout(utilityTimer);
    if (!S.utility || S.utility.state !== state || S.utility.ended) S.utility = { state, startedAt: Date.now(), ended: false };
  } else if (S.utility && !S.utility.ended) {
    S.utility.ended = true;
    S.utility.endedAt = Date.now();
    utilityTimer = setTimeout(() => { S.utility = null; emit(); }, 1200);
  }
}

// Decaid runs the scale's timer with the shot by itself, except in Full
// gateway mode, where it leaves the shot to the skin. Then Mise does it.
function scaleTimer(action) {
  if (S.layout.scaleTimer === false || gatewayMode() !== 'full' || !S.scaleConnected) return;
  quiet(T.request('PUT', api(`/scale/timer/${action}`)));
}

function finishShot() {
  const shot = S.shot;
  if (shot.phase === 'running') scaleTimer('stop');
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
    steps: S.workflow?.profile?.steps || [],
    batchId: context.beanBatchId || null,
    id: shot.id,
    notes: '',
    taste: null,
    saved: '',
    previous: previous ? { seconds: previous.seconds, out: previous.out } : null,
  };
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
    deductDose(review);
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
  const saved = record.copy ? record : (record.metadata?.mise || {});
  if (record.copy && record.out != null) context.targetYield = record.out;
  else if (target > 0) context.targetYield = target;
  if (saved.dose) context.targetDoseWeight = saved.dose;
  if (saved.grind != null && saved.grind !== '') context.grinderSetting = String(saved.grind);
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
      dose: c.dose ?? null, grind: c.grind ?? null, out: c.out ?? null, from: c.from || '', fromId: c.fromId || null,
    })));
  return listCache;
}

// Any recipe by id, including ones you hid.
export function findRecord(id) {
  return visibleProfiles().find((r) => r.id === id) || S.hiddenProfiles.find((r) => r.id === id) || null;
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

// The recipes on the Brew screen's carousel: your starred ones, plus the one
// in use when it is not starred.
export function carouselRecords() {
  const all = visibleProfiles();
  const list = favoriteIds().map((id) => all.find((r) => r.id === id)).filter(Boolean);
  const title = S.workflow?.profile?.title;
  if (title && !list.some((r) => r.profile.title === title)) {
    const current = all.find((r) => r.profile.title === title);
    if (current) list.push(current);
  }
  return list;
}

export function moveFavorite(id, by) {
  const list = favoriteIds().slice();
  const i = list.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  S.favorites = list;
  emit();
  T.request('POST', api('/store/mise/favorites'), list).catch(() => toast('Could not save the order.'));
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
  if (view === 'coffees') loadCoffees();
  if (view === 'recipes') loadHidden();
  if (view === 'recipe') loadLineage(S.recipeId);
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

// The full page for one recipe, and loading it from there.
export function openRecipe(id) {
  S.recipeId = id;
  go('recipe');
}

export async function loadRecipe(record) {
  S.view = 'home';
  emit();
  await useProfile(record, `Loaded ${nameOf(record)}`);
}

export function compareWith(id) {
  S.compareShot = id && id !== S.selectedShot ? id : null;
  if (S.compareShot) loadShotDetail(S.compareShot);
  emit();
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

// How full the tank is, in millilitres and as one of four bands, each with
// its own colour: high (green), medium (amber), low (red) and empty.
export function waterLabel() {
  const w = S.water;
  if (!w || typeof w.currentLevel !== 'number') return { text: '–', level: null, word: '', pct: 0, low: false };
  const refill = Number(w.refillLevel) || 0;
  const ml = tankMl(w.currentLevel);
  const pct = Math.max(0, Math.min(1, ml / TANK_ML));
  let level = 'high';
  if (w.currentLevel <= refill) level = 'empty';
  else if (ml < 500 || w.currentLevel <= refill + 6) level = 'low';
  else if (ml < 1100) level = 'medium';
  const word = { high: 'High', medium: 'Medium', low: 'Low', empty: 'Refill' }[level];
  return { text: level === 'empty' ? 'Empty' : litres(ml), ml, level, word, pct, low: level === 'low' || level === 'empty' };
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
      if (S.recipeId === record.id) S.recipeId = next.id;
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

// The ruler: one editor for every number. `spec` holds label, unit, value,
// min, max, step, presets and a save(value) function.
export function openEditor(spec) {
  S.editor = spec;
  emit();
}

export function closeEditor() {
  S.editor = null;
  emit();
}

// ── Brew screen layout and units ─────────────────────────────────────────

function applyLayout(saved) {
  const cards = Array.isArray(saved.cards) ? saved.cards.filter((c) => UTILITY_CARDS.includes(c)) : [];
  for (const c of UTILITY_CARDS) if (!cards.includes(c)) cards.push(c);
  S.layout = {
    ...DEFAULT_LAYOUT, ...saved, cards,
    hidden: Array.isArray(saved.hidden) ? saved.hidden.filter((c) => UTILITY_CARDS.includes(c)) : [],
  };
  setTempUnit(S.layout.unit);
}

export function updateLayout(patch) {
  applyLayout({ ...S.layout, ...patch });
  emit();
  quiet(T.request('POST', api('/store/mise/layout'), S.layout));
}

export function moveCard(card, by) {
  const cards = S.layout.cards.slice();
  const i = cards.indexOf(card);
  const j = i + by;
  if (i < 0 || j < 0 || j >= cards.length) return;
  [cards[i], cards[j]] = [cards[j], cards[i]];
  updateLayout({ cards });
}

export function toggleCard(card) {
  const hidden = S.layout.hidden.includes(card) ? S.layout.hidden.filter((c) => c !== card) : [...S.layout.hidden, card];
  updateLayout({ hidden });
}

export function openForm(spec) {
  S.dialog = { kind: 'form', ...spec };
  emit();
}

export function openImport() {
  S.dialog = { kind: 'import' };
  emit();
}

export async function openExport(record = null) {
  if (record) {
    const name = (record.profile.title || 'recipe').replace(/[^\w\- ]+/g, '').trim() || 'recipe';
    S.dialog = { kind: 'export', title: `Export ${nameOf(record)}`, data: record.profile, filename: `${name}.json` };
  } else {
    const data = await exportRecipes();
    S.dialog = { kind: 'export', title: 'Export all recipes', data, filename: `mise-recipes-${new Date().toISOString().slice(0, 10)}.json` };
  }
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
  loadMachineSettings();
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
    fromId: record.copy ? (record.fromId || null) : record.id,
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
  if (S.view === 'recipe') S.recipeId = copy.id;
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
  if (S.view === 'recipe' && S.recipeId === record.id) S.view = 'recipes';
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


// ── Coffee library ───────────────────────────────────────────────────────
// Coffees and their bags live in Decaid (/beans and /bean-batches), so every
// skin and Visualizer uploads see the same library. The bag in use is linked
// through the workflow (context.beanBatchId), so each shot records it.

export async function loadCoffees() {
  const [beans, batches] = await Promise.all([
    quiet(T.request('GET', api('/beans?includeArchived=true'))),
    quiet(T.request('GET', api('/bean-batches?includeArchived=true'))),
  ]);
  if (Array.isArray(beans)) S.beans = beans;
  if (Array.isArray(batches)) S.batches = batches;
  emit();
}

export function currentBatch() {
  const id = S.workflow?.context?.beanBatchId;
  return id ? S.batches.find((b) => b.id === id) || null : null;
}

export function beanOf(batch) {
  return batch ? S.beans.find((b) => b.id === batch.beanId) || null : null;
}

// Days since roasting, leaving out any time the bag spent in the freezer.
export function daysOffRoast(batch, at = Date.now()) {
  const roast = Date.parse(batch?.roastDate || '');
  if (!Number.isFinite(roast)) return null;
  let frozen = 0;
  const f = Date.parse(batch.freezeDate || '');
  if (Number.isFinite(f) && f >= roast) {
    const u = batch.frozen ? at : Date.parse(batch.unfreezeDate || '');
    if (Number.isFinite(u) && u > f) frozen = u - f;
  }
  return Math.max(0, Math.floor((at - roast - frozen) / 86400000));
}

export async function useBatch(batch) {
  const bean = beanOf(batch);
  if (!bean) return;
  await putWorkflow({ context: { beanBatchId: batch.id, coffeeName: bean.name, coffeeRoaster: bean.roaster } }, `Now using ${bean.name}`);
}

export async function clearCoffee() {
  await putWorkflow({ context: { beanBatchId: null, coffeeName: '', coffeeRoaster: '' } }, 'No coffee selected');
}

const today = () => new Date().toISOString().slice(0, 10);

export async function saveBean(fields, id = null) {
  try {
    const bean = id
      ? await T.request('PUT', api(`/beans/${encodeURIComponent(id)}`), fields)
      : await T.request('POST', api('/beans'), fields);
    await loadCoffees();
    toast(id ? 'Coffee saved' : `Added ${fields.name}`);
    return bean;
  } catch {
    toast('That coffee could not be saved. Check the connection and try again.');
    return null;
  }
}

export async function saveBatch(beanId, fields, id = null) {
  try {
    const batch = id
      ? await T.request('PUT', api(`/bean-batches/${encodeURIComponent(id)}`), fields)
      : await T.request('POST', api(`/beans/${encodeURIComponent(beanId)}/batches`), fields);
    await loadCoffees();
    toast(id ? 'Bag saved' : 'Bag added');
    return batch;
  } catch {
    toast('That bag could not be saved. Check the connection and try again.');
    return null;
  }
}

export function setFrozen(batch, frozen) {
  return saveBatch(batch.beanId, frozen ? { frozen: true, freezeDate: today(), unfreezeDate: null } : { frozen: false, unfreezeDate: today() }, batch.id);
}

export function archiveBatch(batch, archived = true) {
  return saveBatch(batch.beanId, { archived }, batch.id);
}

export function archiveBean(bean, archived = true) {
  return saveBean({ archived }, bean.id);
}

export async function deleteBean(bean) {
  try {
    await T.request('DELETE', api(`/beans/${encodeURIComponent(bean.id)}`));
    if (S.historyBean === bean.id) S.historyBean = null;
    await loadCoffees();
    toast(`Deleted ${bean.name}`);
  } catch {
    toast('That coffee could not be deleted.');
  }
}

// Decaid keeps how much is left in each bag but does not count it down, so
// Mise takes each shot's dose off the bag it was pulled with.
async function deductDose(review) {
  if (review.deducted || S.layout.deductDose === false) return;
  review.deducted = true;
  const batch = review.batchId ? S.batches.find((b) => b.id === review.batchId) : null;
  const dose = Number(review.dose);
  if (!batch || !(dose > 0)) return;
  const left = Number(batch.weightRemaining ?? batch.weight);
  if (!Number.isFinite(left)) return;
  const next = Math.max(0, Math.round((left - dose) * 10) / 10);
  try {
    await T.request('PUT', api(`/bean-batches/${encodeURIComponent(batch.id)}`), { weightRemaining: next });
    batch.weightRemaining = next;
    emit();
  } catch { /* the next shot tries again with fresh numbers */ }
}

export function filterHistory(beanId) {
  S.historyBean = beanId || null;
  S.selectedShot = null;
  S.compareShot = null;
  loadShots().then(() => { if (S.shots?.[0]) selectShot(S.shots[0].id); });
  emit();
}

// ── Recipe management ────────────────────────────────────────────────────

export async function loadHidden() {
  const list = await quiet(T.request('GET', api('/profiles?visibility=hidden')));
  if (Array.isArray(list)) { S.hiddenProfiles = list; emit(); }
}

async function reloadProfiles() {
  const list = await quiet(T.request('GET', api('/profiles')));
  if (Array.isArray(list)) S.profiles = list;
  await loadHidden();
  emit();
}

export async function setHidden(record, hidden) {
  try {
    await T.request('PUT', api(`/profiles/${encodeURIComponent(record.id)}/visibility`), { visibility: hidden ? 'hidden' : 'visible' });
    if (hidden && Array.isArray(S.favorites) && S.favorites.includes(record.id)) {
      S.favorites = S.favorites.filter((id) => id !== record.id);
      quiet(T.request('POST', api('/store/mise/favorites'), S.favorites));
    }
    await reloadProfiles();
    toast(hidden ? `Hid ${nameOf(record)}. Find it under Hidden in Recipes.` : `${nameOf(record)} is back in your recipes`);
  } catch {
    toast('That recipe could not be changed.');
  }
}

export async function loadLineage(id) {
  if (!id || id.startsWith('mise:')) return;
  const list = await quiet(T.request('GET', api(`/profiles/${encodeURIComponent(id)}/lineage`)));
  if (Array.isArray(list)) { S.lineage = { ...S.lineage, [id]: list }; emit(); }
}

// A tuned copy becomes a real Decaid recipe, linked to the recipe it came
// from, so other skins and Visualizer see it. Its dose and grind travel in
// the recipe's metadata. Decaid gives identical recipes the same ID, so a
// copy that has not been changed yet cannot be saved on its own.
export async function saveCopyToDecaid(record) {
  if (!record?.copy) return false;
  const all = visibleProfiles();
  const parent = (record.fromId && all.find((r) => r.id === record.fromId)) || all.find((r) => !r.copy && (r.profile.title === record.from || nameOf(r) === record.from));
  try {
    const made = await T.request('POST', api('/profiles'), {
      profile: record.profile,
      parentId: parent?.id || null,
      metadata: { mise: { dose: record.dose ?? null, grind: record.grind ?? null } },
    });
    if (!made?.id || made.profile?.title !== record.profile.title) {
      toast(`This copy is still the same as ${made?.profile?.title || 'another recipe'}. Change its temperature or espresso out first.`);
      return false;
    }
    S.copies = S.copies.filter((c) => c.id !== record.id);
    saveCopies();
    if (Array.isArray(S.favorites) && S.favorites.includes(record.id)) {
      S.favorites = S.favorites.map((id) => (id === record.id ? made.id : id));
      quiet(T.request('POST', api('/store/mise/favorites'), S.favorites));
    }
    if (S.recipeId === record.id) S.recipeId = made.id;
    await reloadProfiles();
    toast(`${record.profile.title} is now a Decaid recipe`);
    return true;
  } catch {
    toast('Decaid could not save that recipe.');
    return false;
  }
}

// For a recipe you made in Decaid: write the Brew screen's temperature and
// espresso out (and dose and grind) back into it.
export function brewChanges(record) {
  if (!record || record.copy || record.isDefault !== false || !isInUse(record)) return false;
  const wf = S.workflow?.profile;
  if (!wf) return false;
  const stored = record.profile;
  const t1 = Number(stored.steps?.[0]?.temperature);
  const t2 = Number(wf.steps?.[0]?.temperature);
  const out = values.out();
  const m = record.metadata?.mise || {};
  return Math.abs(t1 - t2) > 0.01 || (out > 0 && out !== Number(stored.target_weight))
    || (values.dose() && values.dose() !== Number(m.dose)) || (String(values.grind()) !== String(m.grind ?? ''));
}

export async function saveBrewChanges(record) {
  const out = values.out();
  const profile = { ...record.profile, steps: S.workflow.profile.steps };
  if (out > 0) profile.target_weight = out;
  const grind = values.grind();
  try {
    const updated = await T.request('PUT', api(`/profiles/${encodeURIComponent(record.id)}`), {
      profile,
      metadata: { ...(record.metadata || {}), mise: { dose: values.dose() || null, grind: grind === '' ? null : String(grind) } },
    });
    const next = updated?.profile ? updated : { ...record, profile };
    S.profiles = (S.profiles || []).map((r) => (r.id === record.id ? next : r));
    if (next.id !== record.id) {
      if (Array.isArray(S.favorites)) S.favorites = S.favorites.map((id) => (id === record.id ? next.id : id));
      quiet(T.request('POST', api('/store/mise/favorites'), S.favorites));
      if (S.recipeId === record.id) S.recipeId = next.id;
    }
    toast(`Saved your Brew screen changes into ${nameOf(next)}`);
    emit();
  } catch {
    toast('Decaid could not save those changes.');
  }
}

export async function exportRecipes() {
  const list = await quiet(T.request('GET', api('/profiles/export')));
  const records = Array.isArray(list) ? list : [];
  for (const c of S.copies) records.push({ profile: c.profile, parentId: c.fromId || null, metadata: { mise: { dose: c.dose, grind: c.grind, copy: true } } });
  return records;
}

// Accepts Decaid's export (an array of records), a list of plain recipes, or
// one recipe as de1app, Visualizer and Decaid write it.
export async function importRecipes(text) {
  let data;
  try { data = JSON.parse(text); } catch { toast('That is not a recipe file. It should be JSON.'); return null; }
  const items = Array.isArray(data) ? data : [data];
  const records = items
    .map((x) => (x && x.profile && Array.isArray(x.profile.steps) ? x : (x && Array.isArray(x.steps) ? { profile: x } : null)))
    .filter(Boolean);
  if (!records.length) { toast('No recipes found in that file.'); return null; }
  try {
    const result = await T.request('POST', api('/profiles/import'), records);
    await reloadProfiles();
    const added = Number(result?.imported) || 0;
    const skipped = Number(result?.skipped) || 0;
    toast(`${added} ${added === 1 ? 'recipe' : 'recipes'} added${skipped ? `, ${skipped} already here` : ''}`);
    return result;
  } catch {
    toast('Decaid could not import those recipes.');
    return null;
  }
}

// ── Machine settings ─────────────────────────────────────────────────────

export async function loadMachineSettings() {
  const [m, a] = await Promise.all([
    quiet(T.request('GET', api('/machine/settings'))),
    quiet(T.request('GET', api('/machine/settings/advanced'))),
  ]);
  if (m && typeof m === 'object') S.machineSettings = m;
  if (a && typeof a === 'object') S.advanced = a;
  emit();
}

export async function updateMachineSetting(patch, advanced = false) {
  const key = advanced ? 'advanced' : 'machineSettings';
  if (!S[key]) return;
  const before = S[key];
  S[key] = { ...before, ...patch };
  emit();
  try {
    await T.request('POST', api(advanced ? '/machine/settings/advanced' : '/machine/settings'), patch);
  } catch {
    S[key] = before;
    toast(NOT_SAVED);
  }
  emit();
}
