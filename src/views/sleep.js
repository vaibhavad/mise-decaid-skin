// Sleep screen: the time, the weather, and a sky that matches it.
// The sky is a gradient with drifting clouds (CSS) and rain, snow or stars
// drawn on a canvas. Nothing animates while the screen is hidden.

import { h, setText, setAttr, show } from '../dom.js';
import { S, requestState, loadWeather, nextDemoWeather } from '../store.js';

// [top of sky, horizon] by weather and by day or night.
const SKY = {
  clear: { day: ['#2A66A8', '#7DAEDB'], night: ['#04060D', '#111C38'] },
  partly: { day: ['#356A9E', '#86A9C8'], night: ['#060911', '#18233C'] },
  cloudy: { day: ['#4E5A67', '#808C98'], night: ['#0B0E12', '#20262E'] },
  fog: { day: ['#646C73', '#959DA3'], night: ['#111416', '#2A2F33'] },
  drizzle: { day: ['#445262', '#6F7D88'], night: ['#090D12', '#1B242D'] },
  rain: { day: ['#334150', '#586673'], night: ['#070A0F', '#17202A'] },
  snow: { day: ['#5B6A7E', '#98A6B5'], night: ['#0D1219', '#27313E'] },
  storm: { day: ['#212835', '#414958'], night: ['#05070B', '#151A24'] },
};
const CLOUDS = { clear: 0, partly: 1, cloudy: 3, fog: 3, drizzle: 2, rain: 3, snow: 2, storm: 3 };

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function createSleep() {
  const canvas = h('canvas', { class: 'sleep-canvas', 'aria-hidden': 'true' });
  const orb = h('div', { class: 'sleep-orb', 'aria-hidden': 'true' });
  const clouds = h('div', { class: 'sleep-clouds', 'aria-hidden': 'true' },
    h('span', { class: 'cloud cloud-a' }), h('span', { class: 'cloud cloud-b' }),
    h('span', { class: 'cloud cloud-c' }), h('span', { class: 'cloud cloud-d' }));

  const clock = h('span', { class: 'sleep-clock' });
  const date = h('span', { class: 'sleep-date' });
  const temp = h('span', { class: 'sleep-temp' });
  const cond = h('span', { class: 'sleep-cond' });
  const place = h('span', { class: 'sleep-place' });
  const weather = h('div', { class: 'sleep-weather' }, temp, h('div', { class: 'sleep-weather-text' }, cond, place));
  const hint = h('span', { class: 'sleep-hint', text: 'Choose a city in Settings to show the weather here.' });
  const demoButton = h('button', { class: 'btn btn-glass', type: 'button', onClick: nextDemoWeather, text: 'Demo: change the weather' });
  const credit = h('span', { class: 'sleep-credit', text: 'Weather data by Open-Meteo.com' });

  const el = h('div', { class: 'cover sleep', hidden: true },
    canvas, orb, clouds,
    h('div', { class: 'sleep-content' },
      clock, date, weather, hint,
      h('span', { class: 'sleep-state', text: 'The machine is asleep' }),
      h('div', { class: 'sleep-actions' },
        h('button', { class: 'btn btn-glass btn-big', type: 'button', onClick: () => requestState('idle'), text: 'Wake up' }),
        demoButton)),
    credit);

  // ── Canvas particles ──
  const ctx = canvas.getContext('2d');
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let particles = [];
  let scene = '';
  let frame = null;
  let last = 0;
  let flash = 0;
  let nextFlash = 0;

  function build(kind, isDay) {
    const w = canvas.width;
    const hgt = canvas.height;
    particles = [];
    if (kind === 'rain' || kind === 'storm' || kind === 'drizzle') {
      const light = kind === 'drizzle';
      for (let i = 0; i < (light ? 70 : 150); i += 1) {
        particles.push({ type: 'rain', x: rand(0, w), y: rand(0, hgt), len: light ? rand(8, 14) : rand(14, 28), speed: light ? rand(380, 520) : rand(760, 1050) });
      }
    } else if (kind === 'snow') {
      for (let i = 0; i < 120; i += 1) {
        particles.push({ type: 'snow', x: rand(0, w), y: rand(0, hgt), r: rand(1.2, 3.4), speed: rand(28, 78), phase: rand(0, 6.28) });
      }
    } else if (!isDay && (kind === 'clear' || kind === 'partly')) {
      for (let i = 0; i < (kind === 'clear' ? 110 : 60); i += 1) {
        particles.push({ type: 'star', x: rand(0, w), y: rand(0, hgt * 0.8), r: rand(0.5, 1.6), phase: rand(0, 6.28), rate: rand(0.4, 1.4) });
      }
    }
    flash = 0;
    nextFlash = rand(3, 7);
  }

  function draw(now) {
    frame = requestAnimationFrame(draw);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    const w = canvas.width;
    const hgt = canvas.height;
    ctx.clearRect(0, 0, w, hgt);

    if (scene.startsWith('storm')) {
      nextFlash -= dt;
      if (nextFlash <= 0) { flash = 1; nextFlash = rand(4, 10); }
      if (flash > 0.01) {
        ctx.fillStyle = `rgba(214, 226, 255, ${(flash * 0.32).toFixed(3)})`;
        ctx.fillRect(0, 0, w, hgt);
        flash *= Math.pow(0.02, dt);
      }
    }

    ctx.lineCap = 'round';
    for (const p of particles) {
      if (p.type === 'rain') {
        p.y += p.speed * dt;
        p.x -= p.speed * 0.12 * dt;
        if (p.y > hgt + 30) { p.y = -30; p.x = rand(0, w * 1.1); }
        ctx.strokeStyle = 'rgba(205, 220, 235, 0.42)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.len * 0.12, p.y - p.len);
        ctx.stroke();
      } else if (p.type === 'snow') {
        p.y += p.speed * dt;
        p.phase += dt * 0.9;
        p.x += Math.sin(p.phase) * 14 * dt;
        if (p.y > hgt + 6) { p.y = -6; p.x = rand(0, w); }
        ctx.fillStyle = 'rgba(245, 248, 252, 0.82)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fill();
      } else {
        p.phase += dt * p.rate;
        ctx.fillStyle = `rgba(232, 238, 255, ${(0.35 + 0.45 * (0.5 + 0.5 * Math.sin(p.phase))).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fill();
      }
    }
    if (still) { cancelAnimationFrame(frame); frame = null; }
  }

  function start() {
    if (frame !== null) return;
    last = performance.now();
    frame = requestAnimationFrame(draw);
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  // ── Clock and weather refresh while the screen is up ──
  let ticker = null;
  let refresher = null;
  let visible = false;

  function tick() {
    const now = new Date();
    setText(clock, now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    setText(date, now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }));
  }

  function update(asleep) {
    if (asleep !== visible) {
      visible = asleep;
      show(el, asleep);
      clearInterval(ticker);
      clearInterval(refresher);
      if (asleep) {
        tick();
        ticker = setInterval(tick, 5000);
        refresher = setInterval(() => loadWeather(true), 15 * 60 * 1000);
        loadWeather();
        scene = '';
      } else {
        stop();
      }
    }
    if (!asleep) return;

    const w = S.weather;
    // Without weather, the sky still follows the time of day.
    const hour = new Date().getHours();
    const isDay = w ? w.isDay : hour >= 7 && hour < 19;
    const kind = w ? w.kind : 'clear';
    const key = `${kind}-${isDay ? 'day' : 'night'}`;
    if (key !== scene || canvas.width !== el.clientWidth || canvas.height !== el.clientHeight) {
      scene = key;
      canvas.width = el.clientWidth || 1340;
      canvas.height = el.clientHeight || 800;
      const [top, bottom] = SKY[kind][isDay ? 'day' : 'night'];
      el.style.setProperty('--sky-top', top);
      el.style.setProperty('--sky-bottom', bottom);
      setAttr(el, 'data-kind', kind);
      setAttr(el, 'data-time', isDay ? 'day' : 'night');
      setAttr(el, 'data-clouds', String(CLOUDS[kind]));
      build(kind, isDay);
      stop();
      start();
    }

    show(weather, Boolean(w));
    show(credit, Boolean(w) && S.mode !== 'demo');
    show(hint, !w && !S.place && S.mode !== 'demo');
    show(demoButton, S.mode === 'demo');
    if (w) {
      const deg = (v) => `${Math.round(v)}°`.replace('-', '−');
      setText(temp, deg(w.temp));
      setText(cond, w.label);
      const bits = [w.place];
      if (w.hi != null && w.lo != null) bits.push(`High ${deg(w.hi)}`, `Low ${deg(w.lo)}`);
      setText(place, bits.filter(Boolean).join(' · '));
    }
  }

  return { el, update };
}
