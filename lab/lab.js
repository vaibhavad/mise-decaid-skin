// Mise voice lab: three tests to run in Chrome on the tablet before building
// voice control. 1) is the microphone loud enough over the machine's noise,
// 2) does speech-to-text get coffee words, names and numbers right, 3) collect
// the way you naturally phrase things, labelled, for the Jev test on the Mac.
// Results are kept in Decaid (/store/mise/voicelab) and can be downloaded.

import { keyHits, wordAccuracy } from './text.js';

const $ = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
};

const GATEWAY = `http://${location.hostname || 'localhost'}:8080/api/v1`;
const STORE = `${GATEWAY}/store/mise/voicelab`;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const VERSION = 1;

// ---------------------------------------------------------------- state

const data = {
  version: VERSION,
  startedAt: new Date().toISOString(),
  device: { userAgent: navigator.userAgent, language: navigator.language },
  context: { recipes: [], bags: [], current: {} },
  hearing: [],
  words: [],
  phrases: [],
};

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    data.savedAt = new Date().toISOString();
    fetch(STORE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .catch(() => toast('Could not save to Decaid. Download your results before leaving.'));
  }, 600);
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}

async function getJSON(path) {
  try {
    const r = await fetch(`${GATEWAY}${path}`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// Recipe and coffee names come from your machine, so the tests use words
// you will actually say. Defaults stand in when Decaid can't be reached.
async function loadContext() {
  const [saved, profiles, favorites, names, beans, batches, workflow] = await Promise.all([
    getJSON('/store/mise/voicelab'), getJSON('/profiles'), getJSON('/store/mise/favorites'),
    getJSON('/store/mise/names'), getJSON('/beans'), getJSON('/bean-batches'), getJSON('/workflow'),
  ]);
  if (saved && saved.version === VERSION) {
    for (const k of ['startedAt', 'hearing', 'words', 'phrases']) if (saved[k]) data[k] = saved[k];
  }
  const nameOf = (r) => (names && names[r.id]) || r.profile?.title;
  let recipes = [];
  if (Array.isArray(profiles)) {
    const visible = profiles.filter((r) => r?.profile?.title && (r.visibility || 'visible') === 'visible');
    const fav = Array.isArray(favorites) ? favorites : [];
    visible.sort((a, b) => {
      const fa = fav.indexOf(a.id); const fb = fav.indexOf(b.id);
      return (fa < 0 ? 999 : fa) - (fb < 0 ? 999 : fb);
    });
    recipes = [...new Set(visible.map(nameOf))];
  }
  let bags = [];
  if (Array.isArray(beans) && Array.isArray(batches)) {
    const open = batches.filter((b) => !b.archived);
    bags = [...new Set(open.map((b) => beans.find((x) => x.id === b.beanId)?.name).filter(Boolean))];
    if (!bags.length) bags = beans.filter((b) => !b.archived).map((b) => b.name).filter(Boolean);
  }
  data.context.fromMachine = recipes.length > 0;
  data.context.recipes = recipes.length ? recipes.slice(0, 40) : ['Blooming espresso', 'Adaptive', 'Turbo shot', 'Allongé', 'Gentle and sweet'];
  data.context.bags = bags.length ? bags.slice(0, 20) : ['Ethiopia Guji', 'Colombia Huila', 'Kenya Kiambu'];
  const ctx = workflow?.context || {};
  data.context.current = {
    recipe: workflow?.profile?.title || null,
    bag: ctx.coffeeName || null,
    dose: ctx.targetDoseWeight ?? null,
    yield: ctx.targetYield ?? null,
  };
}

// R(0) is your most-used recipe, B(0) your first open bag.
const R = (i) => data.context.recipes[i % data.context.recipes.length];
const B = (i) => data.context.bags[i % data.context.bags.length];

// ---------------------------------------------------------------- environment

function showEnv() {
  const inWebView = /; wv\)/.test(navigator.userAgent);
  const parts = [];
  parts.push(window.isSecureContext ? h('span', { class: 'good', text: 'Secure page' }) : h('span', { class: 'bad', text: 'Not a secure page: open it as http://localhost:3000/lab/' }));
  parts.push(navigator.mediaDevices?.getUserMedia ? h('span', { class: 'good', text: 'Microphone available' }) : h('span', { class: 'bad', text: 'No microphone access here' }));
  parts.push(SR ? h('span', { class: 'good', text: 'Speech recognition available' }) : h('span', { class: 'bad', text: 'No speech recognition here' }));
  if (inWebView) parts.push(h('span', { class: 'bad', text: 'You are inside Decaid. Open this page in Chrome instead.' }));
  parts.push(h('span', {}, 'Names from ', h('b', { text: data.context.fromMachine ? 'your machine' : 'examples (Decaid not reachable)' })));
  if (SR) parts.push(h('span', { text: 'Chrome sends speech to Google to transcribe it, so the tablet needs internet.' }));
  const env = $('env');
  env.replaceChildren();
  parts.forEach((p, i) => { if (i) env.append(' · '); env.append(p); });
}

// ---------------------------------------------------------------- tabs

function showTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.id !== `tab-${name}`; });
  if (name === 'results') renderResults();
}

// ---------------------------------------------------------------- 1. hearing

const SITUATIONS = [
  { id: 'quiet', kind: 'noise', title: 'Quiet kitchen', sub: 'Machine idle, nobody talking' },
  { id: 'grinder', kind: 'noise', title: 'Grinder running', sub: 'Start the grinder, then measure' },
  { id: 'pump', kind: 'noise', title: 'Pump running', sub: 'Run a flush, then measure' },
  { id: 'steam', kind: 'noise', title: 'Steam wand', sub: 'Steam (into a jug or the drip tray), then measure' },
  { id: 'voice-stand', kind: 'voice', title: 'You, where you usually stand', sub: 'Talk normally for five seconds' },
  { id: 'voice-far', kind: 'voice', title: 'You, across the room', sub: 'Talk normally for five seconds' },
];

let audio = null; // { ctx, analyser, stream, buf }
let frames = null; // collecting dB values while measuring

async function startMic() {
  if (audio) return true;
  try {
    // Processing off, so the numbers are what the microphone really picks up.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    audio = { ctx, analyser, stream, buf: new Float32Array(analyser.fftSize) };
    $('mic-start').textContent = 'Microphone on';
    $('mic-start').disabled = true;
    $('rec-play').disabled = typeof MediaRecorder === 'undefined';
    tick();
    renderSituations();
    return true;
  } catch (e) {
    toast(e.name === 'NotAllowedError' ? 'Microphone blocked. Allow it in Chrome\'s site settings.' : `Microphone failed: ${e.message}`);
    return false;
  }
}

function levelDb() {
  audio.analyser.getFloatTimeDomainData(audio.buf);
  let sum = 0;
  for (const v of audio.buf) sum += v * v;
  const rms = Math.sqrt(sum / audio.buf.length);
  return Math.max(-100, 20 * Math.log10(rms || 1e-10));
}

function tick() {
  const db = levelDb();
  if (frames) frames.push(db);
  const pct = Math.min(100, Math.max(0, (db + 80) / 80 * 100));
  const fill = $('meter');
  fill.style.width = `${pct}%`;
  fill.style.background = db > -10 ? 'var(--bad)' : 'var(--good)';
  $('meter-db').textContent = `${db.toFixed(0)} dB`;
  setTimeout(tick, 50);
}

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
};

async function measure(sit, button) {
  if (!(await startMic())) return;
  document.querySelectorAll('.sit button').forEach((b) => { b.disabled = true; });
  // Voice: a few seconds to walk to your spot before it listens.
  if (sit.kind === 'voice') {
    for (let s = 4; s > 0; s -= 1) {
      button.textContent = `Go… ${s}`;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  frames = [];
  let left = 5;
  button.textContent = `${left} s`;
  await new Promise((done) => {
    const iv = setInterval(() => {
      left -= 1;
      button.textContent = `${left} s`;
      if (left <= 0) { clearInterval(iv); done(); }
    }, 1000);
  });
  const got = frames;
  frames = null;
  // Noise: the typical level (median). Voice: the loud part of speech (90th
  // percentile), since speech has gaps between words.
  const entry = {
    id: sit.id, kind: sit.kind, title: sit.title,
    median: Math.round(pct(got, 0.5) * 10) / 10,
    p90: Math.round(pct(got, 0.9) * 10) / 10,
    at: new Date().toISOString(),
  };
  data.hearing = data.hearing.filter((x) => x.id !== sit.id).concat(entry);
  save();
  renderSituations();
  renderMargins();
}

function renderSituations() {
  $('situations').replaceChildren(...SITUATIONS.map((sit) => {
    const got = data.hearing.find((x) => x.id === sit.id);
    const val = got ? `${(sit.kind === 'voice' ? got.p90 : got.median).toFixed(0)} dB` : '';
    const btn = h('button', { class: 'btn btn-outline', text: got ? 'Again' : 'Measure' });
    btn.addEventListener('click', () => measure(sit, btn));
    return h('div', { class: 'sit' },
      h('div', { class: 'what' }, sit.title, h('small', { text: sit.sub })),
      h('div', { class: 'val', text: val }),
      btn);
  }));
}

function renderMargins() {
  const voices = data.hearing.filter((x) => x.kind === 'voice');
  const noises = data.hearing.filter((x) => x.kind === 'noise');
  const table = $('margins');
  if (!voices.length || !noises.length) {
    table.replaceChildren(h('tr', {}, h('td', { class: 'muted', text: 'Measure at least one noise and your voice.' })));
    return;
  }
  const head = h('tr', {}, h('th', { text: '' }), ...voices.map((v) => h('th', { text: v.title.replace('You, ', '') })));
  const rows = noises.map((n) => h('tr', {}, h('td', { text: n.title }), ...voices.map((v) => {
    const m = v.p90 - n.median;
    const cls = m >= 15 ? 'good' : m >= 6 ? 'mid' : 'bad';
    return h('td', { class: cls, text: `${m >= 0 ? '+' : ''}${m.toFixed(0)} dB` });
  })));
  table.replaceChildren(head, ...rows);
}

async function recordAndPlay() {
  if (!(await startMic())) return;
  const btn = $('rec-play');
  const rec = new MediaRecorder(audio.stream);
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => {
    const player = $('playback');
    player.src = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }));
    player.hidden = false;
    player.play().catch(() => {});
    btn.textContent = 'Record 5 s and play it back';
    btn.disabled = false;
  };
  btn.disabled = true;
  btn.textContent = 'Recording…';
  rec.start();
  setTimeout(() => rec.stop(), 5000);
}

// ---------------------------------------------------------------- speech recognition

// One recognition attempt. Resolves with the final transcript, the
// alternatives and how long the result took after you stopped talking.
function listen({ onInterim, hints = [] } = {}) {
  return new Promise((resolve) => {
    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = false;
    let usedHints = false;
    if (hints.length && 'phrases' in rec && window.SpeechRecognitionPhrase) {
      try { rec.phrases = hints.map((p) => new window.SpeechRecognitionPhrase(p, 5)); usedHints = true; } catch { /* older Chrome */ }
    }
    let speechEnd = null;
    let result = null;
    let error = null;
    const started = performance.now();
    rec.onspeechend = () => { speechEnd = performance.now(); };
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      if (r.isFinal) {
        result = {
          transcript: r[0].transcript.trim(),
          confidence: Math.round((r[0].confidence || 0) * 100) / 100,
          alternatives: Array.from(r).slice(1).map((a) => a.transcript.trim()),
          latencyMs: Math.round(performance.now() - (speechEnd || started)),
        };
      } else if (onInterim) {
        onInterim(Array.from(e.results).map((x) => x[0].transcript).join(' '));
      }
    };
    rec.onerror = (e) => { error = e.error; };
    rec.onend = () => resolve({ ...(result || { transcript: '', confidence: 0, alternatives: [], latencyMs: null }), error, usedHints });
    try { rec.start(); } catch (e) { resolve({ transcript: '', alternatives: [], error: e.message, usedHints }); }
    listen.stop = () => { try { rec.stop(); } catch { /* already stopped */ } };
  });
}

const ERRORS = {
  'no-speech': 'Heard nothing. Try again, a little louder.',
  network: 'No internet: Chrome needs it to turn speech into text.',
  'not-allowed': 'Microphone blocked. Allow it in Chrome\'s site settings.',
  'audio-capture': 'No microphone found.',
  aborted: 'Stopped.',
};

function showHeard(el, res) {
  el.replaceChildren();
  if (res.error && !res.transcript) { el.append(h('span', { class: 'bad', text: ERRORS[res.error] || res.error })); return; }
  el.append(h('span', { text: `“${res.transcript}”` }));
  res.alternatives.slice(0, 3).forEach((a) => el.append(h('span', { class: 'alt', text: `or “${a}”` })));
}

function hintWords() {
  return [...data.context.recipes.slice(0, 10), ...data.context.bags, 'tare', 'ristretto', 'allongé', 'lungo', 'preinfusion', 'espresso out', 'coffee in', 'ratio'];
}

// ---------------------------------------------------------------- 2. words

// What to read aloud, and the parts that must come through.
function wordList() {
  return [
    { say: `Load ${R(0)}`, keys: [R(0)] },
    { say: `Switch to ${R(1)}`, keys: [R(1)] },
    { say: 'Eighteen and a half in', keys: [18.5] },
    { say: 'Forty grams out', keys: [40] },
    { say: 'Ratio one to two point two', keys: [1, 2.2] },
    { say: 'Two degrees hotter', keys: [2, 'hotter'] },
    { say: 'Brew at ninety three degrees', keys: [93] },
    { say: 'Grind setting eleven point five', keys: ['grind', 11.5] },
    { say: `Use the ${B(0)}`, keys: [B(0)] },
    { say: `New bag of ${B(1)}`, keys: ['bag', B(1)] },
    { say: 'Tare the scale', keys: ['tare'] },
    { say: 'That was sour', keys: ['sour'] },
    { say: 'Bitter and a bit astringent', keys: ['bitter', 'astringent'] },
    { say: 'Make it a ristretto', keys: ['ristretto'] },
    { say: 'Allongé, one to five', keys: ['allonge', 1, 5] },
    { say: 'Steam for forty five seconds', keys: ['steam', 45] },
    { say: 'Two hundred and fifty millilitres of hot water', keys: [250, 'hot water'] },
    { say: 'Flush for five seconds', keys: ['flush', 5] },
    { say: 'Stop', keys: ['stop'] },
    { say: 'How much water is left', keys: ['water', 'left'] },
    { say: 'How much is left in the bag', keys: ['left', 'bag'] },
    { say: 'Undo that', keys: ['undo'] },
    { say: 'Same as the last shot', keys: ['same', 'last'] },
    { say: 'Longer preinfusion', keys: ['longer', 'preinfusion'] },
    { say: `${R(2)}, eighteen in, thirty six out`, keys: [R(2), 18, 36] },
    { say: 'Go to sleep', keys: ['sleep'] },
  ];
}

let wIndex = 0;
let wLast = null;

function renderWord() {
  const list = wordList();
  const item = list[wIndex % list.length];
  $('w-count').textContent = `Phrase ${(wIndex % list.length) + 1} of ${list.length} · read it as written`;
  $('w-say').textContent = item.say;
  $('w-heard').replaceChildren();
  $('w-score').replaceChildren();
  wLast = null;
  renderWordSummary();
}

async function listenWord() {
  const btn = $('w-listen');
  if (btn.classList.contains('live')) { listen.stop?.(); return; }
  const item = wordList()[wIndex % wordList().length];
  btn.classList.add('live');
  btn.textContent = 'Listening… tap to stop';
  const heard = $('w-heard');
  heard.replaceChildren(h('span', { class: 'interim', text: '…' }));
  const res = await listen({
    hints: $('w-hints').checked ? hintWords() : [],
    onInterim: (t) => heard.replaceChildren(h('span', { class: 'interim', text: t })),
  });
  btn.classList.remove('live');
  btn.textContent = 'Listen again';
  showHeard(heard, res);
  if (!res.transcript) return;
  // Score the best of the alternatives too, since a decision model could use them.
  const hits = keyHits(item.keys, res.transcript);
  const anyAlt = [res.transcript, ...res.alternatives].map((t) => keyHits(item.keys, t).every(Boolean)).some(Boolean);
  const entry = {
    say: item.say, keys: item.keys,
    condition: $('w-cond').value, distance: $('w-dist').value,
    transcript: res.transcript, alternatives: res.alternatives, confidence: res.confidence,
    latencyMs: res.latencyMs, hints: res.usedHints,
    keysRight: hits.filter(Boolean).length, keysTotal: hits.length,
    allKeys: hits.every(Boolean), allKeysInAlternatives: anyAlt,
    wordAccuracy: Math.round(wordAccuracy(item.say, res.transcript) * 100) / 100,
    at: new Date().toISOString(),
  };
  // A retry replaces the previous attempt at this phrase in this situation.
  if (wLast) data.words.splice(data.words.indexOf(wLast), 1);
  data.words.push(entry);
  wLast = entry;
  save();
  const missed = item.keys.filter((_, i) => !hits[i]);
  $('w-score').replaceChildren(
    h('b', { class: entry.allKeys ? 'good' : 'bad', text: entry.allKeys ? 'Key words right' : `Missed: ${missed.join(', ')}` }),
    ` · words ${Math.round(entry.wordAccuracy * 100)}%`,
    res.latencyMs != null ? ` · ${(res.latencyMs / 1000).toFixed(1)} s` : '',
    !entry.allKeys && anyAlt ? ' · right in an alternative' : '',
  );
  renderWordSummary();
}

function renderWordSummary() {
  const groups = new Map();
  for (const w of data.words) {
    const k = `${w.condition}|${w.distance}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(w);
  }
  const label = { quiet: 'Quiet', grinder: 'Grinder', pump: 'Pump', steam: 'Steam', talk: 'Music or talk', near: 'close', stand: 'usual spot', far: 'across the room' };
  const table = $('w-summary');
  if (!groups.size) { table.replaceChildren(h('tr', {}, h('td', { class: 'muted', text: 'Nothing yet.' }))); return; }
  const head = h('tr', {}, ...['Situation', 'Phrases', 'Key words', 'Words', 'Delay'].map((t) => h('th', { text: t })));
  const rows = [...groups.entries()].map(([k, list]) => {
    const [c, d] = k.split('|');
    const keys = list.filter((w) => w.allKeys).length / list.length;
    const acc = list.reduce((s, w) => s + w.wordAccuracy, 0) / list.length;
    const lat = list.filter((w) => w.latencyMs != null);
    const delay = lat.length ? lat.reduce((s, w) => s + w.latencyMs, 0) / lat.length / 1000 : null;
    const cls = keys >= 0.9 ? 'good' : keys >= 0.7 ? 'mid' : 'bad';
    return h('tr', {},
      h('td', { text: `${label[c]}, ${label[d]}` }),
      h('td', { text: String(list.length) }),
      h('td', { class: cls, text: `${Math.round(keys * 100)}%` }),
      h('td', { text: `${Math.round(acc * 100)}%` }),
      h('td', { text: delay != null ? `${delay.toFixed(1)} s` : '—' }));
  });
  table.replaceChildren(head, ...rows);
}

// ---------------------------------------------------------------- 3. your phrases

// Each card describes an intent without giving the words. The label is
// what the test expects Jev to decide.
function scenes() {
  return [
    { text: 'You want a little more coffee in the basket.', label: { intent: 'dose', direction: 'up' } },
    { text: 'You want exactly 18.5 g of coffee in.', label: { intent: 'dose', direction: 'set', value: 18.5 } },
    { text: 'You want more espresso in the cup next time.', label: { intent: 'yield', direction: 'up' } },
    { text: 'You want 40 g of espresso out.', label: { intent: 'yield', direction: 'set', value: 40 } },
    { text: 'You want a 1 : 2.5 ratio.', label: { intent: 'ratio', direction: 'set', value: 2.5 } },
    { text: 'You want the next shot a touch hotter.', label: { intent: 'brew_temp', direction: 'up' } },
    { text: 'You want to brew at 92 °C.', label: { intent: 'brew_temp', direction: 'set', value: 92 } },
    { text: 'You want to note that you ground finer.', label: { intent: 'grind', direction: 'down' } },
    { text: `You want to switch to the recipe “${R(1)}”.`, label: { intent: 'recipe', recipe: R(1) } },
    { text: `You want to go back to “${R(0)}”.`, label: { intent: 'recipe', recipe: R(0) } },
    { text: `You just opened a new bag of ${B(1)}.`, label: { intent: 'bag', bag: B(1) } },
    { text: `You're switching to the ${B(0)}.`, label: { intent: 'bag', bag: B(0) } },
    { text: 'The cup is on the scale and you want it zeroed.', label: { intent: 'tare' } },
    { text: 'The last shot tasted sour.', label: { intent: 'taste', taste: 'sour' } },
    { text: 'The last shot tasted bitter.', label: { intent: 'taste', taste: 'bitter' } },
    { text: 'The last shot was excellent.', label: { intent: 'taste', taste: 'great' } },
    { text: 'You want to note that the puck had a channel.', label: { intent: 'note' } },
    { text: 'Something is going wrong: stop the machine.', label: { intent: 'stop' } },
    { text: 'You are done for the day.', label: { intent: 'sleep' } },
    { text: 'It is morning and the machine is asleep.', label: { intent: 'wake' } },
    { text: 'You wonder how much water is in the tank.', label: { intent: 'query' } },
    { text: 'You wonder how much coffee is left in the bag.', label: { intent: 'query' } },
    { text: 'You wonder whether the machine is ready.', label: { intent: 'query' } },
    { text: 'You changed something by mistake.', label: { intent: 'undo' } },
    { text: 'You want exactly the same shot as last time.', label: { intent: 'repeat' } },
    { text: 'You want the steam to run a bit longer.', label: { intent: 'steam', direction: 'up' } },
    { text: 'You want hot water for tea.', label: { intent: 'hot_water' } },
    { text: 'You want a shorter flush.', label: { intent: 'flush', direction: 'down' } },
    { text: 'Ask someone else in the kitchen if they want a coffee.', label: { intent: 'none', addressed: false } },
    { text: 'Tell someone about your day (not the machine).', label: { intent: 'none', addressed: false } },
    { text: 'Comment on the weather to someone.', label: { intent: 'none', addressed: false } },
  ];
}

let yIndex = 0;
let yLast = null;

function renderScene() {
  const list = scenes();
  if (yIndex >= list.length) {
    $('y-count').textContent = `All ${list.length} done`;
    $('y-scene').textContent = 'That\'s every card. Use “Another way” on any card to add more phrasings, or go to Results.';
    ['y-listen', 'y-next', 'y-skip', 'y-again'].forEach((id) => { $(id).disabled = id !== 'y-again'; });
    return;
  }
  ['y-listen', 'y-next', 'y-skip', 'y-again'].forEach((id) => { $(id).disabled = false; });
  $('y-count').textContent = `Card ${yIndex + 1} of ${list.length}`;
  $('y-scene').textContent = list[yIndex].text;
  $('y-heard').replaceChildren();
  $('y-listen').textContent = 'Listen';
  yLast = null;
}

async function listenScene() {
  const btn = $('y-listen');
  if (btn.classList.contains('live')) { listen.stop?.(); return; }
  const scene = scenes()[Math.min(yIndex, scenes().length - 1)];
  btn.classList.add('live');
  btn.textContent = 'Listening… tap to stop';
  const heard = $('y-heard');
  heard.replaceChildren(h('span', { class: 'interim', text: '…' }));
  const res = await listen({ hints: hintWords(), onInterim: (t) => heard.replaceChildren(h('span', { class: 'interim', text: t })) });
  btn.classList.remove('live');
  btn.textContent = 'Say it again';
  showHeard(heard, res);
  if (!res.transcript) return;
  const entry = {
    scene: scene.text, label: { addressed: true, ...scene.label },
    transcript: res.transcript, alternatives: res.alternatives, confidence: res.confidence,
    at: new Date().toISOString(),
  };
  if (yLast) data.phrases.splice(data.phrases.indexOf(yLast), 1);
  data.phrases.push(entry);
  yLast = entry;
  save();
  renderCollected();
}

function renderCollected() {
  $('y-list').replaceChildren(...data.phrases.slice().reverse().map((p) => h('li', {},
    `“${p.transcript}”`, h('small', { text: `${p.label.intent}${p.label.direction ? ` · ${p.label.direction}` : ''}${p.label.value != null ? ` · ${p.label.value}` : ''}${p.label.recipe ? ` · ${p.label.recipe}` : ''}${p.label.bag ? ` · ${p.label.bag}` : ''}${p.label.taste ? ` · ${p.label.taste}` : ''}` }))));
}

// ---------------------------------------------------------------- results

function summaryText() {
  const lines = [];
  lines.push(`Mise voice lab · ${new Date().toLocaleString()}`);
  lines.push(`Recipes: ${data.context.recipes.length} · Bags: ${data.context.bags.length} · from ${data.context.fromMachine ? 'machine' : 'examples'}`);
  lines.push('');
  lines.push('1. Hearing (dB, higher is louder)');
  if (!data.hearing.length) lines.push('   not measured');
  for (const x of data.hearing) lines.push(`   ${x.title.padEnd(32)} ${x.kind === 'voice' ? `voice ${x.p90}` : `noise ${x.median}`}`);
  lines.push('');
  lines.push('2. Words');
  if (!data.words.length) lines.push('   not tested');
  const groups = {};
  for (const w of data.words) (groups[`${w.condition}, ${w.distance}`] ||= []).push(w);
  for (const [k, list] of Object.entries(groups)) {
    const keys = list.filter((w) => w.allKeys).length;
    const alt = list.filter((w) => w.allKeysInAlternatives).length;
    lines.push(`   ${k.padEnd(20)} ${keys}/${list.length} key words right (${alt}/${list.length} counting alternatives)`);
  }
  const misses = data.words.filter((w) => !w.allKeys).slice(-12);
  if (misses.length) {
    lines.push('   Recent misses:');
    for (const m of misses) lines.push(`     said “${m.say}” → heard “${m.transcript}”`);
  }
  lines.push('');
  lines.push(`3. Your phrases: ${data.phrases.length} collected`);
  return lines.join('\n');
}

function renderResults() {
  $('r-summary').textContent = summaryText();
}

function download() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `mise-voicelab-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
}

async function copy() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(data));
    toast('Copied.');
  } catch { toast('Could not copy. Use Download instead.'); }
}

function clearAll() {
  if (!confirm('Clear all lab results, here and in Decaid?')) return;
  data.hearing = []; data.words = []; data.phrases = [];
  data.startedAt = new Date().toISOString();
  save();
  renderSituations(); renderMargins(); renderWord(); renderCollected(); renderResults();
}

// ---------------------------------------------------------------- start

async function start() {
  await loadContext();
  showEnv();
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('mic-start').addEventListener('click', startMic);
  $('rec-play').addEventListener('click', recordAndPlay);
  renderSituations();
  renderMargins();

  const noSR = !SR;
  ['w-listen', 'y-listen'].forEach((id) => { $(id).disabled = noSR; });
  $('hint-wrap').hidden = !(SR && window.SpeechRecognitionPhrase);
  $('w-listen').addEventListener('click', listenWord);
  $('w-next').addEventListener('click', () => { wIndex += 1; renderWord(); });
  $('w-skip').addEventListener('click', () => { wIndex += 1; renderWord(); });
  renderWord();

  $('y-listen').addEventListener('click', listenScene);
  $('y-next').addEventListener('click', () => { yIndex += 1; renderScene(); });
  $('y-skip').addEventListener('click', () => { yIndex += 1; renderScene(); });
  $('y-again').addEventListener('click', () => {
    if (yIndex >= scenes().length) yIndex = scenes().length - 1;
    yLast = null; $('y-heard').replaceChildren(); $('y-listen').textContent = 'Listen';
    ['y-listen', 'y-next', 'y-skip'].forEach((id) => { $(id).disabled = false; });
  });
  // Pick up where you left off.
  yIndex = Math.min(new Set(data.phrases.map((p) => p.scene)).size, scenes().length);
  renderScene();
  renderCollected();

  $('r-download').addEventListener('click', download);
  $('r-copy').addEventListener('click', copy);
  $('r-clear').addEventListener('click', clearAll);
}

start();
