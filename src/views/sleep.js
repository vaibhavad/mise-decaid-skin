// The sleep screen. It shows one of several styles, chosen in Settings, and
// takes care of what they all share: waking the machine (hold anywhere, or
// the Wake up button), the screen going dark after a while, the preview
// from Settings, warm night mode and a gentle drift against screen burn-in.

import { h, setText, setAttr, show } from '../dom.js';
import {
  S, requestState, loadWeather, loadYear, loadSchedules, loadCoffees, previewSleep, setSleepStyle, SLEEP_STYLES,
} from '../store.js';
import { isNight } from './sleep/common.js';
import { createWeather } from './sleep/weather.js';
import { createPet } from './sleep/pet.js';
import { createHourglass } from './sleep/hourglass.js';
import { createFingerprints } from './sleep/fingerprints.js';
import { createLava } from './sleep/lava.js';
import { createYear } from './sleep/year.js';
import { createJourney } from './sleep/journey.js';
import { createBoard } from './sleep/board.js';
import { createMoon } from './sleep/moon.js';

const FACTORIES = {
  weather: createWeather, pet: createPet, hourglass: createHourglass, fingerprints: createFingerprints,
  lava: createLava, year: createYear, journey: createJourney, board: createBoard, moon: createMoon,
};

export function createSleep() {
  const stage = h('div', { class: 'sleep-stage' });
  const warm = h('div', { class: 'sleep-warm', hidden: true, 'aria-hidden': 'true' });
  const black = h('div', { class: 'sleep-black', hidden: true, 'aria-hidden': 'true' });
  const wake = h('button', { class: 'btn btn-glass btn-small sleep-wake', type: 'button', onClick: () => requestState('idle'), text: 'Wake up' });
  const hint = h('span', { class: 'sleep-hold', text: 'Hold anywhere to wake the machine' });
  const footer = h('div', { class: 'sleep-footer' }, hint, wake);

  const previewName = h('strong');
  const step = (by) => {
    const i = SLEEP_STYLES.findIndex((s) => s.key === current);
    setSleepStyle(SLEEP_STYLES[(i + by + SLEEP_STYLES.length) % SLEEP_STYLES.length].key);
  };
  const previewBar = h('div', { class: 'sleep-preview' },
    h('span', { class: 'sleep-preview-text' }, 'Preview · ', previewName),
    h('button', { class: 'btn btn-glass btn-small', type: 'button', text: 'Previous', onClick: () => step(-1) }),
    h('button', { class: 'btn btn-glass btn-small', type: 'button', text: 'Next style', onClick: () => step(1) }),
    h('button', { class: 'btn btn-glass btn-small', type: 'button', text: 'Close', onClick: () => previewSleep(false) }));

  const el = h('div', { class: 'cover sleep', hidden: true }, stage, warm, footer, previewBar, black);

  const built = {};
  let current = null;
  let style = null;
  let visible = false;
  let ticker = null;
  let refresher = null;
  let drifter = null;
  let lastUpdate = 0;

  function mount(key) {
    if (style) style.stop();
    current = FACTORIES[key] ? key : 'weather';
    if (!built[current]) built[current] = FACTORIES[current]();
    style = built[current];
    stage.replaceChildren(style.el);
    setAttr(el, 'data-style', current);
    style.start();
    style.update();
  }

  // Gentle drift: everything moves a few pixels every couple of minutes, so
  // nothing stays lit in one place all night.
  function drift() {
    if (S.layout.drift === false) { stage.style.transform = ''; return; }
    const x = Math.round((Math.random() * 2 - 1) * 16);
    const y = Math.round((Math.random() * 2 - 1) * 12);
    stage.style.transform = `translate(${x}px, ${y}px)`;
  }

  function refresh() {
    loadWeather();
    loadYear();
    loadSchedules();
    loadCoffees();
  }

  // ── Touch: a tap goes to the style (or brings back a dark screen); holding
  // for a second wakes the machine. ──
  let holdTimer = null;
  let downAt = 0;
  el.addEventListener('pointerdown', (e) => {
    downAt = 0;
    if (e.target.closest('button')) return;
    if (!black.hasAttribute('hidden')) { e.preventDefault(); show(black, false); armDark(); return; }
    downAt = Date.now();
    if (!S.sleepPreview) holdTimer = setTimeout(() => { holdTimer = null; downAt = 0; requestState('idle'); }, 1000);
  });
  el.addEventListener('pointerup', (e) => {
    clearTimeout(holdTimer);
    holdTimer = null;
    if (downAt && Date.now() - downAt < 600 && !e.target.closest('button')) style?.tap?.(e);
    downAt = 0;
  });
  for (const type of ['pointercancel', 'pointerleave']) el.addEventListener(type, () => { clearTimeout(holdTimer); holdTimer = null; downAt = 0; });

  // Screen off: after the delay set in Settings the screen goes dark.
  let darkTimer = null;
  function armDark() {
    clearTimeout(darkTimer);
    const minutes = Number(S.layout?.screenOff) || 0;
    if (visible && !S.sleepPreview && minutes > 0) darkTimer = setTimeout(() => show(black, true), minutes * 60 * 1000);
  }
  let darkFor = null;

  function update(asleep) {
    const want = Boolean(asleep || S.sleepPreview) && !S.shot;
    if (want !== visible) {
      visible = want;
      show(el, want);
      show(black, false);
      clearInterval(ticker);
      clearInterval(refresher);
      clearInterval(drifter);
      if (want) {
        refresh();
        mount(S.layout.sleepStyle);
        ticker = setInterval(() => { style?.update(); paint(); }, 5000);
        refresher = setInterval(refresh, 15 * 60 * 1000);
        drifter = setInterval(drift, 2.5 * 60 * 1000);
        drift();
        darkFor = S.layout.screenOff;
        armDark();
      } else {
        style?.stop();
        clearTimeout(darkTimer);
      }
    }
    if (!visible) return;
    if (darkFor !== S.layout.screenOff) { darkFor = S.layout.screenOff; armDark(); }
    if ((S.layout.sleepStyle || 'weather') !== current) mount(S.layout.sleepStyle);
    // The rest of the app redraws many times a second; the styles do not need to.
    if (performance.now() - lastUpdate > 1000) { lastUpdate = performance.now(); style.update(); }
    paint();
  }

  function paint() {
    show(warm, S.layout.warmNight !== false && isNight());
    show(previewBar, S.sleepPreview);
    show(footer, !S.sleepPreview);
    show(wake, S.snap?.state?.state === 'sleeping');
    setText(previewName, SLEEP_STYLES.find((s) => s.key === current)?.label || '');
    if (S.layout.drift === false && stage.style.transform) stage.style.transform = '';
  }

  return { el, update };
}
