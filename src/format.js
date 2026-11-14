// Formatting and small pure helpers shared by the views and the store.

export function num(value, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '–';
}

// 12 -> "12", 12.5 -> "12.5", 12.25 -> "12.25"
export function trimNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '–';
  return String(Math.round(n * 100) / 100);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value, step) {
  return Math.round(value / step) * step;
}

export function cap(text) {
  const s = String(text || '').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function firstSentence(text, max = 130) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const end = clean.search(/[.!?](\s|$)/);
  let sentence = end > 20 ? clean.slice(0, end + 1) : clean;
  if (sentence.length > max) sentence = sentence.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return sentence;
}

const DAY = 24 * 60 * 60 * 1000;

export function when(timestamp, now = new Date()) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  const day = date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} ${time}`;
}

export function ratio(dose, out) {
  const d = Number(dose);
  const o = Number(out);
  if (!(d > 0) || !(o > 0)) return '–';
  return `1 : ${(o / d).toFixed(1)}`;
}

// Objects merge key by key; arrays and plain values are replaced. This is how
// Decaid applies a PUT /workflow body, so local edits are applied the same way.
export function deepMerge(base, patch) {
  if (!isObject(patch)) return patch;
  const out = isObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isObject(value) ? deepMerge(out[key], value) : value;
  }
  return out;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Profile step temperatures arrive as numbers or numeric strings.
export function brewTemp(profile) {
  const first = Number(profile?.steps?.[0]?.temperature);
  return Number.isFinite(first) ? first : null;
}

// Move the whole temperature curve so the first step lands on `target`.
export function stepsAtTemp(profile, target) {
  const steps = profile?.steps;
  if (!Array.isArray(steps) || !steps.length) return null;
  const first = Number(steps[0].temperature);
  const shift = Number.isFinite(first) ? target - first : 0;
  return steps.map((step) => {
    const t = Number(step.temperature);
    const next = Number.isFinite(t) && Number.isFinite(first) ? t + shift : target;
    return { ...step, temperature: Math.round(next * 100) / 100 };
  });
}

// Turn a stored shot's measurements into chart samples and a short summary.
export function summarizeShot(shot) {
  const samples = [];
  let t0 = null;
  let lastWeight = null;
  for (const m of shot?.measurements || []) {
    const machine = m.machine || {};
    const sub = machine.state?.substate;
    if (sub !== 'preinfusion' && sub !== 'pouring') continue;
    const ts = Date.parse(machine.timestamp);
    if (!Number.isFinite(ts)) continue;
    if (t0 === null) t0 = ts;
    const weight = Number.isFinite(Number(m.scale?.weight)) ? Number(m.scale.weight) : null;
    if (weight !== null) lastWeight = weight;
    samples.push({ t: (ts - t0) / 1000, p: Number(machine.pressure) || 0, f: Number(machine.flow) || 0, w: weight });
  }
  const mise = shot?.annotations?.extras?.mise || {};
  const seconds = samples.length ? samples[samples.length - 1].t : (Number(mise.seconds) || null);
  const out = Number(shot?.annotations?.actualYield) || Number(mise.out) || lastWeight || null;
  return { samples, seconds, out };
}

export const TASTES = ['Sour', 'A bit sour', 'Just right', 'A bit bitter', 'Bitter'];
