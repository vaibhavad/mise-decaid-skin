// Text helpers shared by the voice lab page and the Jev test script:
// turning a transcript into comparable tokens, reading spoken numbers, and
// fuzzy matching of names. No DOM, so Node can import it too.

const ONES = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const DIGIT = { ...ONES };

// Units are dropped when comparing, so "18 g", "18 grams" and "eighteen" agree.
const UNITS = new Set([
  'g', 'gram', 'grams', 'gm', 'gms', 'degree', 'degrees', 'deg', 'c', 'celsius', 'f', 'fahrenheit',
  's', 'sec', 'secs', 'mil', 'mils', 'second', 'seconds', 'ml', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters',
]);

function isNumWord(w) { return w in ONES || w in TENS || w === 'hundred'; }

// Lowercase, strip accents and punctuation, split digits from units ("18g"),
// and turn spoken numbers into digits: "eighteen and a half" -> "18.5",
// "ninety three" -> "93", "one point two" -> "1.2", "a hundred and twenty" -> "120".
export function tokens(text) {
  const raw = String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/°/g, ' degrees ')
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9.'\s:/-]/g, ' ')
    .replace(/(\d)\s*:\s*(\d)/g, '$1 to $2')
    .replace(/[-/]/g, ' ')
    .replace(/'s\b/g, 's')
    .replace(/'/g, '')
    .split(/\s+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean);

  const out = [];
  let i = 0;
  const peek = (k) => raw[i + k];
  while (i < raw.length) {
    const w = raw[i];
    const startsNumber = /^\d+(\.\d+)?$/.test(w) || isNumWord(w) || (w === 'a' && peek(1) === 'hundred');
    if (w === 'half' && (raw[i + 1] === 'a' || raw[i + 1] === 'an')) {
      out.push('0.5');
      i += 1;
      continue;
    }
    if (!startsNumber) {
      out.push(w);
      i += 1;
      continue;
    }
    // Read one number.
    let value = 0;
    let current = 0;
    let seen = false;
    if (/^\d+(\.\d+)?$/.test(w)) { current = Number(w); seen = true; i += 1; }
    else {
      while (i < raw.length) {
        const t = raw[i];
        if (t in ONES) { current += ONES[t]; seen = true; i += 1; }
        else if (t in TENS) { current += TENS[t]; seen = true; i += 1; }
        else if (t === 'hundred') { current = (current || 1) * 100; seen = true; i += 1; }
        else if (t === 'a' && raw[i + 1] === 'hundred') { i += 1; }
        else if (t === 'and' && seen && (isNumWord(raw[i + 1] || '') && !(raw[i + 1] in DIGIT && raw[i + 2] === 'to')) && current >= 100) { i += 1; }
        else break;
      }
    }
    value += current;
    // Fractions: "point five", "point two five", "and a half", ".5"
    if (raw[i] === 'point' && (raw[i + 1] in DIGIT || /^\d+$/.test(raw[i + 1] || ''))) {
      i += 1;
      let frac = '';
      while (i < raw.length && (raw[i] in DIGIT || /^\d+$/.test(raw[i]))) {
        frac += raw[i] in DIGIT ? String(DIGIT[raw[i]]) : raw[i];
        i += 1;
      }
      value = Number(`${Math.trunc(value)}.${frac}`);
    } else if (raw[i] === 'and' && raw[i + 1] === 'a' && raw[i + 2] === 'half') {
      value += 0.5; i += 3;
    } else if (raw[i] === 'and' && raw[i + 1] === 'half') {
      value += 0.5; i += 2;
    } else if (raw[i] === 'half' && !seen) {
      i += 1;
    }
    out.push(String(Math.round(value * 100) / 100));
  }
  return out;
}

// Tokens without units, for word-level comparison.
export function words(text) {
  return tokens(text).filter((t) => !UNITS.has(t));
}

export function numbers(text) {
  return tokens(text).filter((t) => /^\d+(\.\d+)?$/.test(t)).map(Number);
}

export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Share of expected words recovered: 1 - word error rate, floored at 0.
export function wordAccuracy(expected, heard) {
  const e = words(expected);
  const h = words(heard);
  if (!e.length) return h.length ? 0 : 1;
  return Math.max(0, 1 - levenshtein(e, h) / e.length);
}

// Is `needle` somewhere in `hay`, allowing about one typo per six letters?
// Both are compared with spaces removed, so "pre infusion" finds "preinfusion".
export function fuzzyContains(hay, needle) {
  const h = words(hay).join('');
  const n = words(needle).join('');
  if (!n) return true;
  const allowed = Math.floor(n.length / 6);
  // Sellers: edit distance of n against the best substring of h.
  let prev = new Array(h.length + 1).fill(0);
  for (let i = 1; i <= n.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= h.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (n[i - 1] === h[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.min(...prev) <= allowed;
}

// Did the transcript get the parts that matter? Keys are names/words
// (fuzzy) or numbers (exact).
export function keyHits(keys, heard) {
  const nums = numbers(heard);
  return keys.map((k) => {
    if (typeof k === 'number') return nums.some((n) => Math.abs(n - k) < 1e-6);
    return fuzzyContains(heard, k);
  });
}

// Numbers in a transcript with a little context, for Jev's
// "which field is this number" questions (TypeSafe's pre-parsed value pattern).
export function numberCandidates(text) {
  const t = tokens(text);
  const out = [];
  t.forEach((tok, i) => {
    if (!/^\d+(\.\d+)?$/.test(tok)) return;
    const before = t.slice(Math.max(0, i - 3), i).join(' ');
    const after = t.slice(i + 1, i + 3).join(' ');
    out.push({ value: Number(tok), index: out.length, context: `${before} [${tok}] ${after}`.trim() });
  });
  return out;
}
