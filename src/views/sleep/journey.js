// Bean journey: a slowly turning globe with the coffee belt (the band
// between the tropics where coffee grows) marked, and an arc from where each
// of your open bags was grown to your city. The list beside it says how far
// each one travelled.

import { h, setText, replaceKids } from '../../dom.js';
import { S, openBags, daysOffRoast } from '../../store.js';
import { timeText, originOf, distanceKm, loop, fitCanvas } from './common.js';

const RAD = Math.PI / 180;
const COLORS = ['#E3B06E', '#6BA4FF', '#4CC38A', '#E08A7A', '#C9A2F2'];

function vec(lat, lon) {
  return [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
}

// Points along the great circle between a and b.
function arcPoints(a, b, n = 64) {
  const p = vec(a.lat, a.lon);
  const q = vec(b.lat, b.lon);
  const dot = Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]));
  const om = Math.acos(dot) || 1e-6;
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const s1 = Math.sin((1 - t) * om) / Math.sin(om);
    const s2 = Math.sin(t * om) / Math.sin(om);
    const v = [p[0] * s1 + q[0] * s2, p[1] * s1 + q[1] * s2, p[2] * s1 + q[2] * s2];
    const lift = 1 + 0.05 * Math.sin(Math.PI * t);
    pts.push(v.map((c) => c * lift));
  }
  return pts;
}

export function createJourney() {
  const canvas = h('canvas', { class: 'jr-canvas', 'aria-hidden': 'true' });
  const clock = h('span', { class: 'jr-clock' });
  const list = h('div', { class: 'jr-list' });
  const note = h('p', { class: 'jr-note' });
  const el = h('div', { class: 'sleep-style journey' },
    canvas,
    h('div', { class: 'jr-side drift' }, clock, h('span', { class: 'jr-title', text: 'Where your coffee came from' }), list, note,
      h('span', { class: 'jr-belt' }, h('i'), 'The coffee belt, between the tropics')));

  let routes = [];
  let home = null;
  let centreLon = 0;
  let key = '';

  const anim = loop((dt, t) => {
    const { ctx, w, h: hgt } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, hgt);
    const R = Math.min(hgt * 0.4, w * 0.26);
    const cx = w * 0.31;
    const cy = hgt * 0.52;
    const lon0 = centreLon + Math.sin(t * 0.03) * 35;
    const lat0 = 12;
    // Orthographic projection, tilted to latitude lat0 and turned to lon0.
    const project = (v) => {
      const lon = Math.atan2(v[1], v[0]) / RAD - lon0;
      const len = Math.hypot(v[0], v[1], v[2]);
      const lat = Math.asin(v[2] / len) / RAD;
      const x = Math.cos(lat * RAD) * Math.sin(lon * RAD);
      const y = Math.cos(lat0 * RAD) * Math.sin(lat * RAD) - Math.sin(lat0 * RAD) * Math.cos(lat * RAD) * Math.cos(lon * RAD);
      const z = Math.sin(lat0 * RAD) * Math.sin(lat * RAD) + Math.cos(lat0 * RAD) * Math.cos(lat * RAD) * Math.cos(lon * RAD);
      return { x: cx + x * R * len, y: cy - y * R * len, front: z > -0.05 };
    };
    const ll = (lat, lon) => project(vec(lat, lon));

    // The globe.
    const grad = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    grad.addColorStop(0, '#1C2A3D');
    grad.addColorStop(1, '#080C14');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(150, 175, 210, 0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.stroke();

    // The coffee belt, between the tropics.
    for (let lat = -23; lat <= 23; lat += 2) {
      for (let lon = -180; lon < 180; lon += 4) {
        const p = ll(lat, lon);
        if (!p.front) continue;
        ctx.fillStyle = `rgba(217, 160, 102, ${Math.abs(lat) > 21 ? 0.75 : 0.32})`;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
    }
    // A dotted grid for the rest of the globe.
    ctx.fillStyle = 'rgba(170, 190, 220, 0.3)';
    for (let lat = -75; lat <= 75; lat += 15) {
      for (let lon = -180; lon < 180; lon += 3) {
        const p = ll(lat, lon);
        if (p.front) ctx.fillRect(p.x - 0.6, p.y - 0.6, 1.2, 1.2);
      }
    }
    for (let lon = -180; lon < 180; lon += 30) {
      for (let lat = -85; lat <= 85; lat += 3) {
        const p = ll(lat, lon);
        if (p.front) ctx.fillRect(p.x - 0.6, p.y - 0.6, 1.2, 1.2);
      }
    }

    // Routes from each origin to home, with a bead travelling along.
    ctx.lineCap = 'round';
    routes.forEach((r, i) => {
      const color = COLORS[i % COLORS.length];
      if (r.arc) {
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
        ctx.beginPath();
        let open = false;
        for (const v of r.arc) {
          const p = project(v);
          if (!p.front) { open = false; continue; }
          if (open) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
          open = true;
        }
        ctx.stroke();
        const k = Math.floor(((t * 0.12 + i * 0.3) % 1) * (r.arc.length - 1));
        const b = project(r.arc[k]);
        if (b.front) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, 6.283); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      const o = ll(r.origin.lat, r.origin.lon);
      if (o.front) {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(o.x, o.y, 6, 0, 6.283); ctx.fill();
        ctx.font = '600 14px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(236, 238, 234, 0.9)';
        ctx.fillText(r.origin.label, o.x + 10, o.y + 5);
      }
    });
    if (home) {
      const p = ll(home.lat, home.lon);
      if (p.front) {
        ctx.strokeStyle = '#ECEEEA'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 7 + Math.sin(t * 2) * 1.5, 0, 6.283); ctx.stroke();
        ctx.font = '600 14px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#ECEEEA';
        ctx.fillText(home.label, p.x + 12, p.y + 5);
      }
    }
  });

  function update() {
    setText(clock, timeText());
    home = S.place ? { lat: S.place.latitude, lon: S.place.longitude, label: S.place.name }
      : (S.mode === 'demo' ? { lat: 43.7, lon: -79.42, label: 'Toronto' } : null);
    const bags = openBags();
    const k = `${bags.map((b) => `${b.batch.id}:${b.bean.country}`).join(',')}|${home?.label}`;
    if (k === key) return;
    key = k;
    routes = [];
    const rows = [];
    bags.forEach((b) => {
      const origin = originOf(b.bean);
      const age = daysOffRoast(b.batch);
      if (origin) routes.push({ origin, arc: home ? arcPoints(origin, home) : null });
      const color = origin ? COLORS[(routes.length - 1) % COLORS.length] : 'var(--muted)';
      const far = origin && home ? `${Math.round(distanceKm(origin, home)).toLocaleString()} km to your cup` : null;
      rows.push(h('div', { class: 'jr-row' },
        h('i', { style: `background:${color}` }),
        h('div', null,
          h('strong', { text: b.bean.name }),
          h('span', { text: [origin ? `Grown in ${origin.label}` : 'Origin not known', far].filter(Boolean).join(' · ') }),
          h('span', { class: 'jr-dim', text: [b.bean.processing, b.bean.notes, age != null ? `day ${age} off roast` : null].filter(Boolean).join(' · ') }))));
    });
    replaceKids(list, rows);
    const lons = routes.map((r) => r.origin.lon).concat(home ? [home.lon] : []);
    centreLon = lons.length ? lons.reduce((a, b) => a + b, 0) / lons.length : 0;
    setText(note, !bags.length ? 'Open a bag in Coffees to see where it came from.'
      : !home ? 'Choose a weather city in Settings to see the trip to your cup.'
        : routes.length < bags.length ? 'Add a country to a coffee to put it on the globe.' : '');
  }

  return { el, start() { anim.start(); }, stop() { anim.stop(); }, update };
}
