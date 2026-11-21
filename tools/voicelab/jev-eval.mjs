#!/usr/bin/env node
// Test 3 of the Mise voice lab: how often does Jev pick the right lever?
//
// Sends each phrase to TypeSafe's Jev with the machine's state and a set of
// typed questions (is this for the machine, which lever, which direction,
// which recipe/bag, what each number is), then scores the answers against
// the labels and simulates the act / ask / ignore policy a voice skin would use.
//
//   export TYPESAFE_API_KEY=...            (from console.typesafe.ai/keys)
//   node tools/voicelab/jev-eval.mjs --lab ~/Downloads/mise-voicelab-2026-11-21.json
//
// Options
//   --lab <file>     voice lab download: real recipe/bag names, plus your own
//                    phrases as Chrome heard them
//   --only seed|lab  run just the seed phrases or just yours
//   --model <name>   default jev-latest
//   --limit <n>      first n phrases (a cheap first run)
//   --out <dir>      where to write report.md and results.jsonl (default ./voicelab-out)
//   --dry            print the first request and exit (no key needed)
//
// What gets sent to TypeSafe: the phrase text and your recipe and coffee
// names. No audio, no account details.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { numberCandidates } from '../../lab/text.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const MODEL = args.model || 'jev-latest';
const BASE = (process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai').replace(/\/$/, '');
const KEY = process.env.TYPESAFE_API_KEY;
const OUT = resolve(args.out || 'voicelab-out');
const CONCURRENCY = 4;

function parseArgs(list) {
  const o = {};
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    if (k === 'dry') o.dry = true;
    else { o[k] = list[i + 1]; i += 1; }
  }
  return o;
}

// ------------------------------------------------------------ the decision space

const INTENTS = {
  dose: 'Change the amount of ground coffee in the basket (coffee in, dose)',
  yield: 'Change how much espresso ends up in the cup, the weight the shot stops at (espresso out, yield, target weight, pulling longer or shorter)',
  ratio: 'Change the brew ratio of espresso out to coffee in (1 to 2, ristretto, normale, lungo, tighter or longer ratio)',
  brew_temp: 'Change the water temperature for brewing espresso',
  grind: 'Record or change the grinder setting (grind finer, coarser, grind number)',
  recipe: 'Load or switch to a different recipe (also called a profile)',
  bag: 'Switch to a different coffee, bean or bag, or record that a new bag was opened',
  tare: 'Zero the scale',
  steam: 'Change milk steaming settings: steam time, temperature or flow',
  hot_water: 'Hot water for tea or an americano: get it, or change its amount or temperature',
  flush: 'Change how long the group flush (rinse) runs',
  stop: 'Stop whatever the machine is doing right now',
  sleep: 'Put the machine to sleep or turn it off',
  wake: 'Wake the machine up so it heats',
  taste: 'Say how the last shot tasted or came out',
  note: 'Add a written note to the last shot, not a taste verdict',
  query: 'Ask a question about the machine, the water tank, coffee left, temperature or the last shot',
  undo: 'Undo or revert the last change',
  repeat: 'Make the same shot again with the same settings as before',
  none: 'Not an instruction or question for the espresso machine',
};

const DIRECTIONS = {
  up: 'More, higher, longer, hotter or coarser than now',
  down: 'Less, lower, shorter, cooler or finer than now',
  set: 'Set to a specific value or named option',
  none: 'No change of amount is involved',
};

const TASTES = {
  sour: 'Sour, sharp, thin, under-extracted, ran too fast',
  bitter: 'Bitter, harsh, drying, astringent, over-extracted, ran too slow',
  weak: 'Weak, watery, lacking body',
  strong: 'Too strong or too intense',
  great: 'Good, balanced, sweet, excellent',
  none: 'Not about taste',
};

const FIELDS = {
  dose: 'Grams of ground coffee in the basket',
  yield: 'Grams of espresso in the cup',
  ratio: 'Part of a brew ratio such as 1 to 2',
  brew_temp: 'Brewing temperature in degrees',
  grind: 'Grinder setting or grind steps',
  steam_time: 'Seconds of steaming',
  water_amount: 'Millilitres of hot water',
  water_temp: 'Hot water temperature',
  flush_time: 'Seconds of flush',
  other: 'Something else, not a machine setting',
};

const MACHINE_STATES = {
  idle: 'ready and waiting',
  espresso: 'pulling an espresso shot right now',
  steam: 'steaming milk right now',
  hotWater: 'pouring hot water right now',
  flush: 'flushing the group right now',
  sleeping: 'asleep',
};

function buildRequest(item, ctx) {
  const state = {
    heard: item.text,
    machine: MACHINE_STATES[item.state || 'idle'],
    current_recipe: ctx.recipes[0],
    current_coffee: ctx.bags[0],
    coffee_in_g: 18,
    espresso_out_g: 36,
    brew_temp_c: 93,
    recipes: ctx.recipes,
    coffees: ctx.bags,
  };
  const questions = {
    addressed: {
      type: 'noul',
      instructions: 'The words in "heard" are an instruction or question for the espresso machine, not something said to another person.',
    },
    intent: {
      type: 'choice',
      instructions: 'What does the person in "heard" want the espresso machine to do? Consider what the machine is doing right now.',
      criteria: INTENTS,
    },
    direction: {
      type: 'choice',
      instructions: 'Does "heard" ask to raise, lower or set a value?',
      criteria: DIRECTIONS,
    },
    taste: {
      type: 'choice',
      instructions: 'If "heard" describes how the last shot tasted, which description fits?',
      criteria: TASTES,
    },
    recipe: {
      type: 'choice',
      instructions: 'Which of the recipes listed in "recipes" does "heard" name? Pick none if it names no recipe.',
      criteria: Object.fromEntries([...ctx.recipes.map((r) => [r, null]), ['none', 'No recipe named']]),
    },
    coffee: {
      type: 'choice',
      instructions: 'Which of the coffees listed in "coffees" does "heard" name? Pick none if it names no coffee.',
      criteria: Object.fromEntries([...ctx.bags.map((b) => [b, null]), ['none', 'No coffee named']]),
    },
  };
  // Numbers are found by code, and Jev says what each one is.
  const cands = numberCandidates(item.text);
  cands.forEach((c) => {
    questions[`number_${c.index}`] = {
      type: 'choice',
      instructions: `In "heard", what does the number marked in "${c.context}" refer to?`,
      criteria: FIELDS,
    };
  });
  return { body: { model: MODEL, state, questions }, cands };
}

// ------------------------------------------------------------ data

function fill(text, ctx) {
  return text.replace(/\{R(\d)\}/g, (_, i) => ctx.recipes[Number(i)] ?? ctx.recipes[0])
    .replace(/\{B(\d)\}/g, (_, i) => ctx.bags[Number(i)] ?? ctx.bags[0]);
}

async function loadItems() {
  const seed = JSON.parse(await readFile(join(here, 'phrases.json'), 'utf8')).phrases;
  let lab = null;
  if (args.lab) lab = JSON.parse(await readFile(resolve(args.lab.replace(/^~/, process.env.HOME)), 'utf8'));
  const ctx = {
    recipes: lab?.context?.recipes?.length ? lab.context.recipes.slice(0, 30) : ['Blooming espresso', 'Adaptive', 'Turbo shot', 'Allongé', 'Gentle and sweet'],
    bags: lab?.context?.bags?.length ? lab.context.bags.slice(0, 15) : ['Ethiopia Guji', 'Colombia Huila', 'Kenya Kiambu'],
  };
  const items = [];
  if (args.only !== 'lab') {
    for (const p of seed) {
      items.push({
        source: 'seed', text: fill(p.t, ctx), state: p.state, hard: !!p.hard,
        expect: {
          addressed: p.a !== false, intent: p.i, direction: p.d,
          recipe: p.r != null ? ctx.recipes[p.r] : undefined,
          coffee: p.b != null ? ctx.bags[p.b] : undefined,
          taste: p.taste, numbers: p.n,
        },
      });
    }
  }
  if (lab && args.only !== 'seed') {
    for (const p of lab.phrases || []) {
      const l = p.label || {};
      const numbers = l.value != null ? { [String(l.value)]: ({ dose: 'dose', yield: 'yield', ratio: 'ratio', brew_temp: 'brew_temp' })[l.intent] } : undefined;
      items.push({
        source: 'lab', text: p.transcript, scene: p.scene, hard: false,
        expect: {
          addressed: l.addressed !== false, intent: l.intent, direction: l.direction,
          recipe: l.recipe, coffee: l.bag, taste: l.taste,
          numbers: numbers && Object.values(numbers)[0] ? numbers : undefined,
        },
      });
    }
  }
  return { items: args.limit ? items.slice(0, Number(args.limit)) : items, ctx };
}

// ------------------------------------------------------------ calling Jev

async function callJev(body) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const started = performance.now();
    let res;
    try {
      res = await fetch(`${BASE}/v1/systemone`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    const ms = Math.round(performance.now() - started);
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * 2 ** attempt); continue; }
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json?.detail ?? json).slice(0, 300)}`);
    return { json, ms };
  }
  throw new Error('Gave up after retries');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ scoring

const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

function score(item, answers, cands) {
  const e = item.expect;
  const pick = (q) => answers[q]?.choice;
  const prob = (q) => (answers[q]?.probabilities || {})[answers[q]?.choice] ?? 0;
  const addressedP = answers.addressed?.noul ?? null;
  const r = {
    intent: pick('intent'),
    intentP: Math.round(prob('intent') * 1000) / 1000,
    addressedP: addressedP != null ? Math.round(addressedP * 1000) / 1000 : null,
    checks: {},
  };
  r.checks.intent = r.intent === e.intent;
  if (addressedP != null) r.checks.addressed = (addressedP >= 0.5) === e.addressed;
  if (e.direction) r.checks.direction = pick('direction') === e.direction;
  if (e.recipe) r.checks.recipe = pick('recipe') === e.recipe;
  if (e.coffee) r.checks.coffee = pick('coffee') === e.coffee;
  if (e.taste) r.checks.taste = pick('taste') === e.taste;
  if (e.numbers) {
    for (const [val, field] of Object.entries(e.numbers)) {
      const c = cands.find((x) => near(x.value, val));
      r.checks[`number ${val}`] = c ? pick(`number_${c.index}`) === field : false;
    }
  }
  r.got = {
    direction: pick('direction'), taste: pick('taste'), recipe: pick('recipe'), coffee: pick('coffee'),
    numbers: Object.fromEntries(cands.map((c) => [c.value, pick(`number_${c.index}`)])),
  };
  r.allRight = Object.values(r.checks).every(Boolean);
  return r;
}

// What a voice skin would do: act when sure, ask when unsure, ignore the rest.
// "none" and low addressed-probability both mean ignore.
function policy(r, act, ask) {
  const forMachine = r.intent !== 'none' && (r.addressedP == null || r.addressedP >= 0.5);
  if (!forMachine) return 'ignore';
  if (r.intentP >= act) return 'act';
  if (r.intentP >= ask) return 'ask';
  return 'ignore';
}

// A deliberately simple keyword baseline, to see what Jev adds over rules.
function keywordIntent(text) {
  const t = text.toLowerCase();
  const rules = [
    ['stop', /\b(stop|kill|enough|cancel)\b/], ['tare', /\b(tare|zero|reset the scale)\b/],
    ['undo', /\b(undo|put that back|go back to what)\b/], ['repeat', /\b(same|repeat)\b/],
    ['sleep', /\b(sleep|turn off|good night|done for)\b/], ['wake', /\b(wake|warm up|start heating)\b/],
    ['query', /^(how|what|is it|do i|when)\b/], ['note', /\b(note|remember)\b/],
    ['hot_water', /\b(hot water|tea|americano)\b/], ['steam', /\b(steam|jug|milk)\b/], ['flush', /\bflush\b/],
    ['taste', /\b(sour|bitter|watery|perfect|lovely|harsh|thin|stars|gushed|sweet)\b/],
    ['ratio', /\b(ratio|ristretto|lungo|\d+ to \d+|one to)\b/], ['brew_temp', /\b(degrees|hotter|cooler|temperature|hot)\b/],
    ['grind', /\b(grind|finer|coarser|grinder)\b/], ['bag', /\b(bag|beans?)\b/],
    ['yield', /\b(out|cup|yield|target|longer|shorter)\b/], ['dose', /\b(in|dose|basket|coffee)\b/],
    ['recipe', /\b(load|switch|profile|usual)\b/],
  ];
  for (const [intent, re] of rules) if (re.test(t)) return intent;
  return 'none';
}

// ------------------------------------------------------------ report

const pctS = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—');

function report(rows, ctx, meta) {
  const L = [];
  const ok = rows.filter((r) => !r.error);
  L.push(`# Jev lever test`, '');
  L.push(`Model ${meta.model} · ${ok.length} phrases (${rows.length - ok.length} failed) · ${new Date().toLocaleString()}`);
  L.push(`Recipes: ${ctx.recipes.slice(0, 6).join(', ')}${ctx.recipes.length > 6 ? '…' : ''} · Coffees: ${ctx.bags.join(', ')}`, '');

  const groups = [['All', ok], ['Seed phrases', ok.filter((r) => r.source === 'seed')], ['Your phrases (as Chrome heard them)', ok.filter((r) => r.source === 'lab')],
    ['Plain', ok.filter((r) => !r.hard)], ['Hard or indirect', ok.filter((r) => r.hard)]].filter(([, g]) => g.length);
  L.push('## Accuracy', '', '| | Phrases | Right lever | Everything right | Keyword rules |', '|---|---|---|---|---|');
  for (const [name, g] of groups) {
    L.push(`| ${name} | ${g.length} | ${pctS(g.filter((r) => r.checks.intent).length, g.length)} | ${pctS(g.filter((r) => r.allRight).length, g.length)} | ${pctS(g.filter((r) => r.keyword === r.expect.intent).length, g.length)} |`);
  }
  L.push('', '"Everything right" also needs the direction, recipe, coffee, taste and every number to be right where the phrase has them.');
  L.push('The keyword rules were written alongside the seed phrases, so they flatter themselves there. Compare on your own phrases.', '');

  L.push('## What a voice skin would do', '', 'Act when Jev\'s probability for the lever is at least the threshold, ask "Did you mean…?" between the two thresholds, ignore below. "Acted wrongly" is the number that matters most.', '');
  L.push('| Act at | Ask at | Acted rightly | Acted wrongly | Asked | Ignored a real request | Ignored chatter |', '|---|---|---|---|---|---|---|');
  for (const [act, ask] of [[0.5, 0.5], [0.7, 0.4], [0.8, 0.5], [0.9, 0.5], [0.95, 0.6]]) {
    let right = 0; let wrong = 0; let asked = 0; let missed = 0; let chatter = 0;
    for (const r of ok) {
      const real = r.expect.intent !== 'none';
      const p = policy(r, act, ask);
      if (p === 'act') { if (real && r.allRight) right += 1; else wrong += 1; }
      else if (p === 'ask') asked += 1;
      else if (real) missed += 1; else chatter += 1;
    }
    L.push(`| ${act} | ${ask} | ${right} | ${wrong} | ${asked} | ${missed} | ${chatter} |`);
  }
  L.push('');

  L.push('## By lever', '', '| Lever | Phrases | Right lever | Everything right | Usually confused with |', '|---|---|---|---|---|');
  const byIntent = {};
  for (const r of ok) (byIntent[r.expect.intent] ||= []).push(r);
  for (const [k, g] of Object.entries(byIntent).sort((a, b) => a[0].localeCompare(b[0]))) {
    const wrong = {};
    g.filter((r) => !r.checks.intent).forEach((r) => { wrong[r.intent] = (wrong[r.intent] || 0) + 1; });
    const conf = Object.entries(wrong).sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w} (${n})`).join(', ');
    L.push(`| ${k} | ${g.length} | ${pctS(g.filter((r) => r.checks.intent).length, g.length)} | ${pctS(g.filter((r) => r.allRight).length, g.length)} | ${conf} |`);
  }
  L.push('');

  const parts = ['direction', 'recipe', 'coffee', 'taste'];
  L.push('## Details', '', '| Part | Checked | Right |', '|---|---|---|');
  for (const p of [...parts, 'numbers', 'addressed']) {
    const vals = ok.flatMap((r) => Object.entries(r.checks).filter(([k]) => (p === 'numbers' ? k.startsWith('number') : k === p)).map(([, v]) => v));
    if (vals.length) L.push(`| ${p} | ${vals.length} | ${pctS(vals.filter(Boolean).length, vals.length)} |`);
  }
  const lat = ok.map((r) => r.ms).sort((a, b) => a - b);
  const q = (p) => lat[Math.min(lat.length - 1, Math.floor(p * (lat.length - 1)))];
  const tokens = ok.reduce((s, r) => s + (r.inputTokens || 0), 0);
  L.push('', `Round trip from this computer: median ${q(0.5)} ms, slowest 5% over ${q(0.95)} ms. Input tokens: ${tokens} (about $${(tokens * 0.042 / 1e6).toFixed(5)} at the published $0.042 per million).`, '');

  const misses = ok.filter((r) => !r.allRight);
  L.push(`## Misses (${misses.length})`, '', '| Said | Expected | Jev | p | What else was off |', '|---|---|---|---|---|');
  for (const r of misses) {
    const off = Object.entries(r.checks).filter(([k, v]) => !v && k !== 'intent').map(([k]) => `${k}: ${k.startsWith('number') ? r.got.numbers[k.split(' ')[1]] : r.got[k] ?? (k === 'addressed' ? r.addressedP : '')}`).join('; ');
    L.push(`| ${r.text.replace(/\|/g, '/')}${r.state ? ` _(while ${r.state})_` : ''} | ${r.expect.intent}${r.expect.direction ? ` ${r.expect.direction}` : ''} | ${r.intent} | ${r.intentP.toFixed(2)} | ${off} |`);
  }
  const failed = rows.filter((r) => r.error);
  if (failed.length) {
    L.push('', `## Failed calls (${failed.length})`, '');
    failed.slice(0, 10).forEach((r) => L.push(`- “${r.text}”: ${r.error}`));
  }
  return L.join('\n');
}

// ------------------------------------------------------------ main

async function main() {
  const { items, ctx } = await loadItems();
  if (args.dry) {
    const ex = items.find((x) => /\d/.test(x.text)) || items[0];
    console.log(JSON.stringify(buildRequest(ex, ctx).body, null, 2));
    console.log(`\n${items.length} phrases would be sent.`);
    return;
  }
  if (!KEY) {
    console.error('Set TYPESAFE_API_KEY first (from https://console.typesafe.ai/keys), or use --dry to see a request.');
    process.exit(1);
  }
  console.log(`Sending ${items.length} phrases to ${MODEL}…`);
  const rows = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next; next += 1;
      const item = items[i];
      const { body, cands } = buildRequest(item, ctx);
      const base = { ...item, keyword: keywordIntent(item.text) };
      try {
        const { json, ms } = await callJev(body);
        rows[i] = { ...base, ...score(item, json.answers || {}, cands), ms, model: json.model, inputTokens: json.usage?.input_tokens };
      } catch (e) {
        rows[i] = { ...base, error: String(e.message || e), checks: {} };
      }
      done += 1;
      if (done % 10 === 0 || done === items.length) process.stdout.write(`  ${done}/${items.length}\n`);
      if (done === 1 && rows[i].error) console.error(`  first call failed: ${rows[i].error}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const model = rows.find((r) => r.model)?.model || MODEL;
  const md = report(rows, ctx, { model });
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'report.md'), md);
  await writeFile(join(OUT, 'results.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n'));
  console.log(`\n${md.split('## By lever')[0]}`);
  console.log(`Full report: ${join(OUT, 'report.md')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
