// Moon and sunrise: tonight's moon in its real phase over a starry sky, a
// countdown to sunrise (or sunset by day), and an aurora on clear, cold
// nights.

import { h, setText } from '../../dom.js';
import { S } from '../../store.js';
import { timeText, dateText, moonPhase, sunTimes, countdown, isNight, rand, loop, fitCanvas } from './common.js';

export function createMoon() {
  const canvas = h('canvas', { class: 'moon-canvas', 'aria-hidden': 'true' });
  const clock = h('span', { class: 'moon-clock' });
  const date = h('span', { class: 'moon-date' });
  const phaseEl = h('span', { class: 'moon-phase' });
  const sunEl = h('span', { class: 'moon-sun' });
  const hint = h('span', { class: 'moon-hint' });
  const el = h('div', { class: 'sleep-style moon' },
    canvas,
    h('div', { class: 'moon-text drift' }, clock, date, phaseEl, sunEl, hint));

  let stars = [];
  let size = '';
  let aurora = false;

  const anim = loop((dt, t) => {
    const { ctx, w, h: hgt } = fitCanvas(canvas);
    if (size !== `${w}x${hgt}`) {
      size = `${w}x${hgt}`;
      stars = Array.from({ length: 160 }, () => ({ x: rand(0, w), y: rand(0, hgt * 0.85), r: rand(0.4, 1.5), p: rand(0, 6.28), s: rand(0.3, 1.2) }));
    }
    const sky = ctx.createLinearGradient(0, 0, 0, hgt);
    sky.addColorStop(0, '#03050B');
    sky.addColorStop(1, '#0E1A33');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, hgt);

    for (const s of stars) {
      s.p += dt * s.s;
      ctx.fillStyle = `rgba(230, 236, 255, ${(0.3 + 0.5 * (0.5 + 0.5 * Math.sin(s.p))).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }

    // Aurora: soft curtains of green and violet that sway.
    if (aurora) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let band = 0; band < 3; band += 1) {
        const base = hgt * (0.24 + band * 0.07);
        for (let x = 0; x < w; x += 4) {
          const wave = Math.sin(x * 0.004 + t * 0.25 + band) * 40 + Math.sin(x * 0.011 - t * 0.4 + band * 2) * 18;
          const top = base + wave;
          const height = 140 + Math.sin(x * 0.007 + t * 0.3 + band) * 60;
          const g = ctx.createLinearGradient(0, top, 0, top + height);
          const alpha = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(x * 0.02 + t * 0.6 + band));
          g.addColorStop(0, `rgba(150, 90, 230, 0)`);
          g.addColorStop(0.35, `rgba(140, 110, 255, ${(alpha * 0.6).toFixed(3)})`);
          g.addColorStop(0.75, `rgba(80, 230, 150, ${alpha.toFixed(3)})`);
          g.addColorStop(1, 'rgba(80, 230, 150, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(x, top, 4, height);
        }
      }
      ctx.restore();
    }

    // The moon, lit to its phase.
    const m = moonPhase();
    const R = Math.min(w, hgt) * 0.15;
    const cx = w * 0.7;
    const cy = hgt * 0.38;
    const glow = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 2.6);
    glow.addColorStop(0, `rgba(210, 222, 255, ${(0.12 * m.lit + 0.02).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(210, 222, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, R * 2.6, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#1A2133';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
    // Lit part: half the disc on the lit side, plus or minus an ellipse.
    const waxing = m.phase < 0.5;
    const k = Math.cos(2 * Math.PI * m.phase); // 1 new, 0 quarter, -1 full
    ctx.fillStyle = '#E9EDF6';
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, !waxing);
    ctx.ellipse(cx, cy, Math.abs(k) * R, R, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing);
    ctx.fill();
    // A few soft maria.
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#5A6378';
    for (const [dx, dy, r] of [[-0.3, -0.2, 0.22], [0.15, 0.1, 0.28], [-0.1, 0.4, 0.15], [0.35, -0.35, 0.12]]) {
      ctx.beginPath(); ctx.arc(cx + dx * R, cy + dy * R, r * R, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  });

  function update() {
    const now = new Date();
    setText(clock, timeText(now));
    setText(date, dateText(now));
    const m = moonPhase(now);
    const full = Math.round(m.toFull);
    setText(phaseEl, `${m.name} · ${Math.round(m.lit * 100)}% lit${m.name === 'Full moon' ? '' : ` · full moon in ${full} ${full === 1 ? 'day' : 'days'}`}`);
    const sun = sunTimes(now);
    if (sun?.nextRise && (isNight(now) || !sun.nextSet || sun.nextRise < sun.nextSet)) {
      setText(sunEl, `Sunrise in ${countdown(sun.nextRise - now)} · ${timeText(sun.nextRise)}`);
    } else if (sun?.nextSet) {
      setText(sunEl, `Sunset in ${countdown(sun.nextSet - now)} · ${timeText(sun.nextSet)}`);
    } else {
      setText(sunEl, '');
    }
    setText(hint, sun ? '' : 'Choose a weather city in Settings for sunrise times.');
    const w = S.weather;
    const cold = w && Number.isFinite(w.tempC) ? w.tempC <= 2 : false;
    aurora = Boolean(w && (w.kind === 'clear' || w.kind === 'partly') && cold && isNight(now));
  }

  return { el, start() { anim.start(); }, stop() { anim.stop(); }, update };
}
