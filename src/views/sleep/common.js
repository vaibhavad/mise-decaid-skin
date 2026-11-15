// Shared pieces for the sleep screen styles.

import { S } from '../../store.js';

export const timeText = (d = new Date()) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const dateText = (d = new Date()) => d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
export const rand = (a, b) => a + Math.random() * (b - a);

// Crema-ish colours by roast level: [main, highlight].
export function roastColors(level) {
  switch (String(level || '').toLowerCase()) {
    case 'light': return ['#D9A766', '#F2D3A0'];
    case 'dark': return ['#6B4026', '#A9714A'];
    default: return ['#A86B3C', '#D69A62'];
  }
}

// Taste tags as coffee colours, from sour (pale) to bitter (dark).
export const TASTE_COLORS = {
  Sour: '#E6C76A', 'A bit sour': '#D9AE5F', 'Just right': '#C88B4E', 'A bit bitter': '#8A5A35', Bitter: '#5A3722',
};
export const NO_TASTE = '#9C7A5C';

// ── Sun and moon ──

function parseLocal(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(text || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}

// The next sunrise and sunset from the weather lookup, when a city is set.
export function sunTimes(now = new Date()) {
  const w = S.weather;
  if (!w?.sunrise?.length) return null;
  const rises = w.sunrise.map(parseLocal).filter(Boolean);
  const sets = (w.sunset || []).map(parseLocal).filter(Boolean);
  return {
    nextRise: rises.find((d) => d > now) || null,
    nextSet: sets.find((d) => d > now) || null,
    todayRise: rises[0] || null,
    todaySet: sets[0] || null,
  };
}

// Night, for warm night mode: between sunset and sunrise when known,
// otherwise from 9 pm to 6:30 am.
export function isNight(now = new Date()) {
  const sun = sunTimes(now);
  if (sun?.todayRise && sun?.todaySet) return now < sun.todayRise || now > sun.todaySet;
  const m = now.getHours() * 60 + now.getMinutes();
  return m >= 21 * 60 || m < 6 * 60 + 30;
}

const SYNODIC = 29.530588853;
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

export function moonPhase(now = new Date()) {
  const days = (now.getTime() - NEW_MOON) / 86400000;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const phase = age / SYNODIC;
  const lit = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  const name = names[Math.round(phase * 8) % 8];
  const toFull = ((0.5 - phase + 1) % 1) * SYNODIC;
  return { phase, lit, name, age, toFull };
}

export function countdown(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const hh = Math.floor(m / 60);
  return hh ? `${hh} h ${m % 60} min` : `${m} min`;
}

// ── Where coffee grows ──
// Rough centres of coffee-growing countries, [latitude, longitude].
const ORIGINS = {
  ethiopia: [8.6, 39.6], kenya: [-0.3, 37.6], rwanda: [-1.9, 29.9], burundi: [-3.4, 29.9], uganda: [1.4, 32.3],
  tanzania: [-6.4, 34.9], 'democratic republic of the congo': [-2.5, 28.8], congo: [-2.5, 28.8], malawi: [-13.3, 34.3],
  zambia: [-13.1, 27.8], cameroon: [5.9, 10.4], yemen: [15.4, 44.2], india: [12.9, 75.8], indonesia: [-0.6, 101.3],
  sumatra: [-0.6, 101.3], java: [-7.6, 110.2], sulawesi: [-2.5, 120.2], bali: [-8.3, 115.1], 'papua new guinea': [-6.3, 145.4],
  'timor-leste': [-8.8, 125.6], 'east timor': [-8.8, 125.6], vietnam: [12.7, 108.1], china: [24.5, 101.0], yunnan: [24.5, 101.0],
  myanmar: [21.0, 96.5], thailand: [18.8, 99.0], laos: [15.1, 106.4], philippines: [16.4, 120.6],
  brazil: [-19.0, -46.5], colombia: [2.5, -75.5], peru: [-6.0, -78.5], bolivia: [-16.3, -67.7], ecuador: [-3.2, -79.3],
  venezuela: [8.6, -71.1], guatemala: [14.6, -91.2], honduras: [14.5, -87.6], 'el salvador': [13.8, -89.2],
  nicaragua: [13.1, -86.0], 'costa rica': [9.9, -84.1], panama: [8.8, -82.4], mexico: [16.9, -96.7],
  jamaica: [18.1, -76.6], 'dominican republic': [19.0, -70.7], haiti: [18.5, -72.3], cuba: [20.0, -76.0],
  hawaii: [19.6, -155.9], 'united states': [19.6, -155.9], usa: [19.6, -155.9], australia: [-28.6, 153.3],
};

export function originOf(bean) {
  const text = `${bean?.country || ''} ${bean?.region || ''} ${bean?.name || ''}`.toLowerCase();
  let best = null;
  for (const [name, at] of Object.entries(ORIGINS)) {
    if (text.includes(name) && (!best || name.length > best.name.length)) best = { name, at };
  }
  if (!best) return null;
  const label = bean?.country || best.name.replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, lat: best.at[0], lon: best.at[1] };
}

export function distanceKm(a, b) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Canvas sized to its element, at the screen's pixel density.
export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 1340;
  const hgt = canvas.clientHeight || 800;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h: hgt };
}

// requestAnimationFrame loop that stops when asked, or when motion is reduced.
export function loop(draw) {
  let frame = null;
  let last = 0;
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    draw(dt, now / 1000);
    frame = still ? null : requestAnimationFrame(step);
  };
  return {
    start() { if (frame === null) { last = performance.now(); frame = requestAnimationFrame(step); } },
    stop() { if (frame !== null) cancelAnimationFrame(frame); frame = null; },
  };
}
