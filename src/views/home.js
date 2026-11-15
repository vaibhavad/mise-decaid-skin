// Brew: everything on one screen. Water tank on the left, the small jobs
// (hot water, steam, flush, scale) beside it, and in the middle your recipes
// on a carousel with the four numbers you change most. Swipe to load a
// recipe; tap the one in the middle to see it in full; tap any number to
// change it.

import { h, setText, setAttr, show, replaceKids, icon } from '../dom.js';
import {
  S, status, values, go, requestState, transport, tare, scan, toast, useProfile, carouselRecords, nameOf,
  openRecipe, cleaningDue, shotsSinceClean, markCleaned, selectShot, gatewayMode, waterLabel, setSteam,
  currentBatch, beanOf,
} from '../store.js';
import { coffeeLine } from './coffees.js';
import { num, trimNum, ratio, when, deg } from '../format.js';
import { profileCurve, miniChart } from '../chart.js';
import { edit } from './edits.js';

const LABELS = { hotWater: 'Hot water', steam: 'Steam', flush: 'Flush', scale: 'Scale' };
const ICONS = { hotWater: 'water', steam: 'steam', flush: 'flush', scale: 'scale' };

// A number you can tap to change.
function value(label, onTap, { big = false } = {}) {
  const v = h('span', { class: 'val-num' });
  const u = h('span', { class: 'val-unit' });
  const sub = h('span', { class: 'val-sub' });
  const el = h('button', { class: big ? 'val val-big' : 'val', type: 'button', onClick: onTap },
    h('span', { class: 'val-label' }, label, icon('chevron', 'icon val-chev')),
    h('span', { class: 'val-read' }, v, u), sub);
  return {
    el,
    set(num0, unit = '', subText = '') { setText(v, num0); setText(u, unit); setText(sub, subText); show(sub, Boolean(subText)); },
  };
}

export function createHome() {
  // ── Water tank ──
  const tankFill = h('span', { class: 'tank-bar-fill' });
  const tankText = h('span', { class: 'tank-bar-text' });
  const tank = h('button', {
    class: 'tank-bar', type: 'button',
    onClick: () => {
      const w = waterLabel();
      toast(w.level ? `Water tank: ${w.text}, ${w.word.toLowerCase()}. A full tank holds about 2 litres.` : 'Water level not known yet.');
    },
  }, tankFill, tankText);

  // ── Utility cards ──
  const startBtn = (state, noun) => h('button', { class: 'mini-btn', type: 'button', onClick: () => requestState(state), text: 'Start', 'aria-label': `Start ${noun}` });

  const hwVol = value('Amount', edit.waterVolume);
  const hwTemp = value('Temperature', edit.waterTemp);
  const hwStart = startBtn('hotWater', 'hot water');

  const stTemp = value('Temperature', edit.steamTemp);
  const stTime = value('Stops after', edit.steamTime);
  const stStart = startBtn('steam', 'steam');
  let lastSteam = 150;
  const stSwitch = h('button', {
    class: 'switch switch-small', type: 'button', role: 'switch', 'aria-label': 'Steam heater',
    onClick: () => {
      const on = Number(S.workflow?.steamSettings?.targetTemperature) > 0;
      setSteam({ targetTemperature: on ? 0 : lastSteam });
    },
  }, h('span', { class: 'switch-knob', 'aria-hidden': 'true' }));

  const flTime = value('Runs for', edit.flushTime);
  const flStart = startBtn('flush', 'flush');
  const cleanText = h('span');
  const cleanBtn = h('button', { class: 'mini-btn', type: 'button', text: 'Cleaned', onClick: markCleaned, 'aria-label': 'I have cleaned the group' });
  const clean = h('div', { class: 'clean-note' }, cleanText, cleanBtn);

  const scWeight = h('span', { class: 'val-num' });
  const scUnit = h('span', { class: 'val-unit' });
  const scHint = h('span', { class: 'val-label' });
  const scRead = h('button', { class: 'val val-big', type: 'button', onClick: tare }, scHint, h('span', { class: 'val-read' }, scWeight, scUnit));
  const scSearch = h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Search', onClick: scan });
  const scOff = h('div', { class: 'scale-off' }, h('span', { class: 'muted', text: 'Not connected' }), scSearch);

  const cardHead = (key, ...right) => h('div', { class: 'u-head' },
    h('span', { class: 'u-title' }, icon(ICONS[key], 'icon u-icon'), LABELS[key]), h('span', { class: 'u-right' }, right));
  const cards = {
    hotWater: h('section', { class: 'u-card', 'data-card': 'hotWater' }, cardHead('hotWater', hwStart), h('div', { class: 'u-vals' }, hwVol.el, hwTemp.el)),
    steam: h('section', { class: 'u-card', 'data-card': 'steam' }, cardHead('steam', stStart, stSwitch), h('div', { class: 'u-vals' }, stTemp.el, stTime.el)),
    flush: h('section', { class: 'u-card', 'data-card': 'flush' }, cardHead('flush', flStart), h('div', { class: 'u-vals' }, flTime.el), clean),
    scale: h('section', { class: 'u-card', 'data-card': 'scale' }, cardHead('scale'), scRead, scOff),
  };
  const utilCol = h('div', { class: 'u-col' });
  let cardKey = '';

  // ── Recipe carousel ──
  const track = h('div', { class: 'carousel', 'aria-roledescription': 'carousel', 'aria-label': 'Your recipes' });
  const dots = h('div', { class: 'dots', 'aria-hidden': 'true' });
  const allLink = h('button', { class: 'link', type: 'button', onClick: () => go('recipes') }, 'All recipes', icon('chevron', 'icon link-chev'));
  const coffeeText = h('span', { class: 'coffee-btn-text' });
  const coffeeBtn = h('button', { class: 'coffee-btn', type: 'button', onClick: () => go('coffees') }, icon('bean', 'icon coffee-icon'), coffeeText);
  const prevBtn = h('button', { class: 'nav-arrow', type: 'button', 'aria-label': 'Previous recipe', onClick: () => step(-1) }, icon('back'));
  const nextBtn = h('button', { class: 'nav-arrow', type: 'button', 'aria-label': 'Next recipe', onClick: () => step(1) }, icon('chevron'));
  const emptyCarousel = h('div', { class: 'carousel-empty' },
    h('p', { class: 'muted', text: 'No recipe loaded yet.' }),
    h('button', { class: 'btn btn-primary', type: 'button', text: 'Choose a recipe', onClick: () => go('recipes') }));

  let records = [];
  let idx = 0;
  let cardEls = [];
  let listKey = '';
  let pending = null;   // a load waiting for the swiping to stop
  let pendingTimer = null;

  function buildCards() {
    cardEls = records.map((record, i) => {
      const copy = record.copy ? h('span', { class: 'pill pill-quiet', text: 'Your copy' }) : null;
      return h('button', {
        class: 'r-card', type: 'button', 'data-i': i,
        'aria-label': nameOf(record),
      },
      h('span', { class: 'r-top' }, h('span', { class: 'r-name', text: nameOf(record) }), copy),
      profileCurve(record.profile, 'curve r-curve'),
      h('span', { class: 'r-meta' }, metaLine(record)));
    });
    replaceKids(track, cardEls);
    replaceKids(dots, records.map(() => h('span', { class: 'dot-i' })));
  }

  function metaLine(record) {
    const p = record.profile;
    const out = record.copy && record.out != null ? Number(record.out) : Number(p.target_weight) || 0;
    const t = Number(p.steps?.[0]?.temperature);
    return [Number.isFinite(t) ? deg(t, 1) : null, out > 0 ? `${num(out, 0)} g out` : null, `${p.steps?.length || 0} steps`].filter(Boolean).join(' · ');
  }

  function place(dx = 0) {
    const w = track.clientWidth || 600;
    cardEls.forEach((card, i) => {
      const d = i - idx + dx / (w * 0.42);
      const ad = Math.abs(d);
      const x = d * w * 0.42;
      const scale = 1 - Math.min(ad, 1.5) * 0.16;
      card.style.transform = `translateX(calc(-50% + ${x.toFixed(1)}px)) scale(${scale.toFixed(3)})`;
      card.style.opacity = String(Math.max(0, 1 - ad * 0.5).toFixed(2));
      card.style.zIndex = String(10 - Math.round(ad * 2));
      setAttr(card, 'data-centre', Math.round(ad * 10) === 0 ? 'true' : null);
      setAttr(card, 'tabindex', ad < 0.5 ? '0' : '-1');
    });
    [...dots.children].forEach((dot, i) => setAttr(dot, 'data-on', i === idx ? 'true' : null));
    setAttr(prevBtn, 'disabled', idx <= 0);
    setAttr(nextBtn, 'disabled', idx >= records.length - 1);
  }

  function step(by) {
    const next = Math.max(0, Math.min(records.length - 1, idx + by));
    if (next === idx) { place(); return; }
    idx = next;
    place();
    pending = records[idx];
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      const record = pending;
      pending = null;
      if (record) useProfile(record, `Loaded ${nameOf(record)}`);
    }, 450);
  }

  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    if (!records.length) return;
    drag = { x: e.clientX, dx: 0, id: e.pointerId, moved: false };
  });
  track.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.dx = e.clientX - drag.x;
    if (Math.abs(drag.dx) > 8 && !drag.moved) {
      drag.moved = true;
      track.setPointerCapture(drag.id);
      track.classList.add('dragging');
    }
    if (drag.moved) place(drag.dx);
  });
  const endDrag = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    track.classList.remove('dragging');
    if (d.moved) {
      const w = track.clientWidth || 600;
      const by = Math.round(-d.dx / (w * 0.42)) || (Math.abs(d.dx) > 50 ? -Math.sign(d.dx) : 0);
      if (by) step(by); else place();
      return;
    }
    const card = e.target.closest?.('.r-card');
    if (!card) return;
    const i = Number(card.dataset.i);
    if (i === idx) openRecipe(records[i].id); else step(i - idx);
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', () => { drag = null; track.classList.remove('dragging'); place(); });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'Enter' && records[idx]) openRecipe(records[idx].id);
  });
  window.addEventListener('resize', () => place());

  // ── The four numbers ──
  const vTemp = value('Temperature', edit.temp, { big: true });
  const vGrind = value('Grind', edit.grind, { big: true });
  const vDose = value('Coffee in', edit.dose, { big: true });
  const vOut = value('Espresso out', edit.out, { big: true });
  const saving = h('span', { class: 'saving' });

  // ── Next step ──
  const nextText = h('span', { class: 'next-text' });
  const startShot = h('button', { class: 'btn btn-primary btn-start', type: 'button', text: 'Start espresso', onClick: () => requestState('espresso') });
  const demoPress = h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Demo: press the machine button', onClick: () => transport().press('espresso') });
  const warnText = h('span');
  const warn = h('button', { class: 'warn-line', type: 'button', onClick: () => go('settings') }, warnText, icon('chevron', 'icon link-chev'));

  const nextRow = h('div', { class: 'next-row' }, nextText, saving, startShot, demoPress);
  const isVisible = (node) => !node.hasAttribute('hidden');
  const stage = h('section', { class: 'stage-card' },
    h('div', { class: 'carousel-wrap' }, prevBtn, track, emptyCarousel, nextBtn),
    h('div', { class: 'carousel-foot' }, coffeeBtn, dots, allLink),
    h('div', { class: 'vals-row' }, vTemp.el, vGrind.el, vDose.el, vOut.el),
    nextRow,
    warn);

  // ── Last shot ──
  const lastWhen = h('span', { class: 'val-label' });
  const lastOut = h('span', { class: 'last-out' });
  const lastTaste = h('span', { class: 'pill pill-quiet' });
  const mini = miniChart();
  const last = h('button', { class: 'last-strip', type: 'button' },
    h('span', { class: 'last-text' }, lastWhen, lastOut), mini.el, lastTaste, icon('chevron', 'icon link-chev'));

  const el = h('div', { class: 'view view-home' },
    tank, utilCol,
    h('div', { class: 'home-main' }, stage, last));

  function updateCards() {
    const shown = S.layout.cards.filter((c) => !S.layout.hidden.includes(c));
    const key = shown.join(',');
    if (key !== cardKey) {
      cardKey = key;
      replaceKids(utilCol, shown.map((c) => cards[c]));
    }
    show(utilCol, shown.length > 0);
    show(tank, S.layout.tank !== false);
    setAttr(el, 'data-cols', `${S.layout.tank !== false ? 't' : ''}${shown.length ? 'u' : ''}`);

    const st = S.snap?.state?.state;
    const canStart = S.info?.GHC === false && st === 'idle';
    show(hwStart, canStart);
    show(stStart, canStart && Number(S.workflow?.steamSettings?.targetTemperature) > 0);
    show(flStart, canStart);

    const hw = S.workflow?.hotWaterData || {};
    hwVol.set(hw.volume != null ? num(hw.volume, 0) : '–', 'ml');
    hwTemp.set(hw.targetTemperature != null ? deg(hw.targetTemperature) : '–');

    const steam = S.workflow?.steamSettings || {};
    const on = Number(steam.targetTemperature) > 0;
    if (on) lastSteam = Number(steam.targetTemperature);
    setAttr(stSwitch, 'aria-checked', on ? 'true' : 'false');
    setAttr(cards.steam, 'data-off', !on);
    stTemp.set(on ? deg(steam.targetTemperature) : 'Off');
    stTime.set(steam.duration != null ? num(steam.duration, 0) : '–', 's');

    const rinse = S.workflow?.rinseData || {};
    flTime.set(rinse.duration != null ? num(rinse.duration, 0) : '–', 's');
    const since = shotsSinceClean();
    const due = cleaningDue();
    setAttr(clean, 'data-due', due);
    setText(cleanText, since == null ? 'Cleaning count starts with your next shot'
      : due ? `Clean the group · ${since} shots` : `${since} ${since === 1 ? 'shot' : 'shots'} since cleaning`);
    show(cleanBtn, due);

    const scaleOn = S.scaleConnected && S.scale.weight != null;
    show(scRead, scaleOn);
    show(scOff, !scaleOn);
    setText(scHint, 'Tap to zero');
    setText(scWeight, scaleOn ? num(S.scale.weight, 1) : '–');
    setText(scUnit, 'g');

    const w = waterLabel();
    setAttr(tank, 'data-level', w.level);
    tankFill.style.height = `${Math.round(w.pct * 100)}%`;
    setText(tankText, w.text);
    setAttr(tank, 'aria-label', w.level ? `Water tank ${w.text}, ${w.word}` : 'Water tank');
  }

  function updateCarousel() {
    const list = carouselRecords();
    const key = list.map((r) => `${r.id}:${nameOf(r)}:${r.profile.steps?.length}:${r.out}`).join('|');
    if (key !== listKey) {
      listKey = key;
      records = list;
      buildCards();
    }
    show(emptyCarousel, !records.length);
    show(prevBtn, records.length > 1);
    show(nextBtn, records.length > 1);
    if (!pending && !drag) {
      const title = S.workflow?.profile?.title;
      const i = records.findIndex((r) => r.profile.title === title);
      if (i >= 0) idx = i;
      idx = Math.max(0, Math.min(idx, records.length - 1));
    }
    if (!drag) place();
  }

  function updateValues() {
    const t = values.temp();
    vTemp.set(t != null ? deg(t, 1) : '–');
    const g = values.grind();
    vGrind.set(g === '' ? '–' : (trimNum(g) === '–' ? String(g) : trimNum(g)));
    const dose = values.dose();
    vDose.set(dose ? num(dose, 1) : '–', 'g');
    const out = values.out();
    vOut.set(out > 0 ? num(out, 0) : 'Off', out > 0 ? 'g' : '', out > 0 && dose ? ratio(dose, out) : '');
    setText(saving, { saving: 'Saving…', saved: 'Saved', error: 'Not saved' }[S.saving] || '');
    setAttr(saving, 'data-state', S.saving || null);
  }

  function updateNext() {
    const st = status();
    const ghc = S.info?.GHC !== false;
    const ready = st.tone === 'ok';
    setAttr(stage, 'data-tone', st.tone);
    show(startShot, ready && !ghc);
    show(demoPress, S.mode === 'demo' && ready && ghc);
    // No coaching: the status pill already says what the machine is doing.
    // Only what changes how the shot will go is mentioned here.
    let text = '';
    if (S.machineConnected && ready && !S.scaleConnected) text = 'No scale connected, so the shot will not stop by weight.';
    setText(nextText, text);
    show(nextRow, Boolean(text) || isVisible(startShot) || isVisible(demoPress) || Boolean(S.saving));

    const mode = gatewayMode();
    show(warn, mode === 'full' || mode === 'disabled');
    setText(warnText, mode === 'disabled'
      ? 'Gateway mode is Disabled, so Decaid shows its own shot screen. Switch to Tracking'
      : 'Gateway mode is Full, so shots will not stop by weight. Switch to Tracking');
  }

  function updateCoffee() {
    const batch = currentBatch();
    const bean = beanOf(batch);
    const name = S.workflow?.context?.coffeeName;
    setText(coffeeText, bean ? coffeeLine(batch, bean) : (name || 'Choose a coffee'));
    setAttr(coffeeBtn, 'data-empty', !bean && !name);
    const left = Number(batch?.weightRemaining);
    setAttr(coffeeBtn, 'data-low', Number.isFinite(left) && left < (values.dose() || 18) * 2);
  }

  function updateLast() {
    const shot = S.shots?.[0];
    show(last, Boolean(shot) && S.layout.last !== false);
    if (!shot) return;
    const detail = S.shotDetails[shot.id];
    const extra = shot.annotations?.extras?.mise || {};
    const out = Number(shot.annotations?.actualYield) || Number(extra.out) || detail?.out;
    const seconds = detail?.seconds || Number(extra.seconds);
    setText(lastWhen, `Last shot · ${when(shot.timestamp)}`);
    setText(lastOut, [out ? `${num(out, 1)} g` : null, seconds ? `in ${Math.round(seconds)} s` : null].filter(Boolean).join(' ') || '–');
    show(lastTaste, Boolean(extra.taste));
    setText(lastTaste, extra.taste || '');
    mini.draw(detail?.samples || null);
    last.onclick = () => { selectShot(shot.id); go('history'); };
  }

  function update() {
    updateCards();
    updateCarousel();
    updateValues();
    updateNext();
    updateCoffee();
    updateLast();
  }

  return { el, update };
}
