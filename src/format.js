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

// ── Water tank ───────────────────────────────────────────────────────────
// The machine reports the water height in millimetres. This table turns that
// into millilitres; it comes from the original Decent app (by way of the
// Streamline skin), so every skin shows the same amount. Index = mm.
const MM_TO_ML = [
  0, 16, 43, 70, 97, 124, 151, 179, 206, 233,
  261, 288, 316, 343, 371, 398, 426, 453, 481, 509,
  537, 564, 592, 620, 648, 676, 704, 732, 760, 788,
  816, 844, 872, 900, 929, 957, 985, 1013, 1042, 1070,
  1104, 1138, 1172, 1207, 1242, 1277, 1312, 1347, 1382, 1417,
  1453, 1488, 1523, 1559, 1594, 1630, 1665, 1701, 1736, 1772,
  1808, 1843, 1879, 1915, 1951, 1986, 2022, 2058,
];
export const TANK_ML = MM_TO_ML[MM_TO_ML.length - 1];

export function tankMl(mm) {
  const value = Number(mm);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const i = Math.floor(value);
  if (i >= MM_TO_ML.length - 1) return TANK_ML;
  return Math.round(MM_TO_ML[i] + (MM_TO_ML[i + 1] - MM_TO_ML[i]) * (value - i));
}

export function litres(ml) {
  if (ml >= 1000) return `${(Math.floor(ml / 100) / 10).toFixed(1)} L`;
  return `${Math.round(ml / 10) * 10} ml`;
}

// ── Recipe steps in plain words ──────────────────────────────────────────

const n = (v) => Number(v) || 0;

export function stepControl(step) {
  const smooth = step.transition === 'smooth';
  if (step.pump === 'pressure') {
    const bar = `${trimNum(roundTo(n(step.pressure), 0.1))} bar`;
    return smooth ? `Pressure eases to ${bar}` : `Pressure at ${bar}`;
  }
  const flow = n(step.flow);
  if (flow === 0) return 'Pause, no water flowing';
  const ml = `${trimNum(roundTo(flow, 0.1))} ml/s`;
  return smooth ? `Flow eases to ${ml}` : `Flow at ${ml}`;
}

// The ways a step can end early, besides its time running out.
export function stepEnds(step) {
  const ends = [];
  const exit = step.exit;
  if (exit && exit.type && n(exit.value) > 0) {
    const unit = exit.type === 'pressure' ? 'bar' : 'ml/s';
    const word = exit.condition === 'under' ? 'drops below' : 'rises above';
    ends.push(`${exit.type} ${word} ${trimNum(roundTo(n(exit.value), 0.1))} ${unit}`);
  }
  if (n(step.weight) > 0) ends.push(`${trimNum(roundTo(n(step.weight), 0.1))} g is in the cup`);
  if (n(step.volume) > 0) ends.push(`${Math.round(n(step.volume))} ml has gone through`);
  return ends;
}

export function stepLimit(step) {
  const value = n(step.limiter?.value);
  if (value <= 0) return '';
  return step.pump === 'pressure'
    ? `Flow kept under ${trimNum(roundTo(value, 0.1))} ml/s`
    : `Pressure kept under ${trimNum(roundTo(value, 0.1))} bar`;
}
