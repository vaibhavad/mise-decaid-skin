// Milk and water: steam, hot water and rinse, plus the cleaning reminder.

import { h, setText, setAttr, show } from '../dom.js';
import {
  S, setSteam, setHotWater, setRinse, requestState, markCleaned, setCleanInterval,
  shotsSinceClean, cleaningDue, go,
} from '../store.js';
import { num } from '../format.js';
import { stepper, header, card } from './parts.js';

function presets(label, items, isActive, apply) {
  const buttons = items.map((item) => h('button', { class: 'preset', type: 'button', onClick: () => apply(item) },
    h('span', { text: item.name }), h('span', { class: 'preset-detail', text: item.detail })));
  return {
    el: h('div', { class: 'presets', role: 'group', 'aria-label': label }, buttons),
    update() { buttons.forEach((b, i) => setAttr(b, 'aria-pressed', isActive(items[i]) ? 'true' : 'false')); },
  };
}

// The strip at the bottom of each card: how to start it, or a stop button
// while it is running.
function action(stateName, noun) {
  const hint = h('p', { class: 'start-hint' });
  const start = h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: () => requestState(stateName), text: `Start ${noun}` });
  const stop = h('button', { class: 'btn btn-stop btn-block', type: 'button', onClick: () => requestState('idle'), text: `Stop ${noun}` });
  return {
    el: h('div', { class: 'card-action' }, hint, start, stop),
    update() {
      const running = S.snap?.state?.state === stateName;
      const idle = S.snap?.state?.state === 'idle';
      const ghc = S.info?.GHC !== false;
      show(stop, running);
      show(start, !running && !ghc && idle);
      show(hint, !running && (ghc || !idle));
      setText(hint, !S.machineConnected ? 'Machine not connected'
        : !idle ? 'Available when the machine is ready'
          : `Press ${noun} on the machine to start`);
    },
  };
}

export function createWater() {
  const head = header({ title: 'Milk and water', chips: ['steam', 'water'], sub: (st) => (st.tone === 'ok' ? 'Ready' : st.title) });

  const steam = () => S.workflow?.steamSettings || {};
  const hot = () => S.workflow?.hotWaterData || {};
  const rinse = () => S.workflow?.rinseData || {};
  const whole = (v) => num(v, 0);

  const steamTime = stepper({ label: 'Stop after', unit: 's', less: 'Shorter steam time', more: 'Longer steam time', read: () => steam().duration ?? '', write: (v) => setSteam({ duration: Math.round(Math.min(120, Math.max(5, v))) }), step: 5, format: whole });
  const steamPresets = presets('Steam presets', [
    { name: 'Small jug', detail: '30 s', duration: 30 },
    { name: 'Medium jug', detail: '45 s', duration: 45 },
    { name: 'Large jug', detail: '60 s', duration: 60 },
  ], (item) => Number(steam().duration) === item.duration, (item) => setSteam({ duration: item.duration }));
  const steamOff = h('p', { class: 'muted', text: 'The steam heater is switched off. Turn it on in Settings.' });
  const steamAction = action('steam', 'steam');

  const waterAmount = stepper({ label: 'Amount', unit: 'ml', less: 'Less water', more: 'More water', read: () => hot().volume ?? '', write: (v) => setHotWater({ volume: Math.round(Math.min(500, Math.max(10, v))) }), step: 10, format: whole });
  const waterTemp = stepper({ label: 'Temperature', unit: '°C', less: 'Cooler water', more: 'Hotter water', read: () => hot().targetTemperature ?? '', write: (v) => setHotWater({ targetTemperature: Math.round(Math.min(100, Math.max(40, v))) }), step: 1, format: whole });
  const waterPresets = presets('Hot water presets', [
    { name: 'Americano', detail: '120 ml · 90 °C', volume: 120, temp: 90 },
    { name: 'Tea', detail: '250 ml · 80 °C', volume: 250, temp: 80 },
    { name: 'Warm the cup', detail: '60 ml · 90 °C', volume: 60, temp: 90 },
  ], (item) => Number(hot().volume) === item.volume && Number(hot().targetTemperature) === item.temp,
  (item) => setHotWater({ volume: item.volume, targetTemperature: item.temp }));
  const waterAction = action('hotWater', 'hot water');

  const rinseTime = stepper({ label: 'Run for', unit: 's', less: 'Shorter rinse', more: 'Longer rinse', read: () => rinse().duration ?? '', write: (v) => setRinse({ duration: Math.round(Math.min(30, Math.max(1, v))) }), step: 1, format: whole });
  const rinseAction = action('flush', 'flush');

  const cleanLine = h('span', { class: 'clean-line' });
  const every = h('span', { class: 'clean-every' });
  const cleanBox = h('div', { class: 'clean-box' },
    h('span', { class: 'label', text: 'Cleaning reminder' }),
    cleanLine,
    h('div', { class: 'clean-row' },
      h('button', { class: 'step-btn step-small', type: 'button', 'aria-label': 'Remind me sooner', onClick: () => setCleanInterval(S.cleaning.interval - 10), text: '−' }),
      every,
      h('button', { class: 'step-btn step-small', type: 'button', 'aria-label': 'Remind me later', onClick: () => setCleanInterval(S.cleaning.interval + 10), text: '+' })),
    h('div', { class: 'clean-actions' },
      h('button', { class: 'btn btn-outline', type: 'button', onClick: markCleaned, text: 'I have cleaned it' }),
      h('button', { class: 'link', type: 'button', onClick: () => go('recipes'), text: 'Cleaning recipes' })));

  const el = h('div', { class: 'view view-water' },
    head.el,
    h('div', { class: 'water-body' },
      card('water-card',
        h('div', { class: 'card-intro' }, h('h2', { class: 'card-title', text: 'Steam milk' }),
          h('p', { class: 'muted', text: 'Steam switches off by itself, so you can keep both hands on the jug.' })),
        steamTime.el, steamPresets.el, steamOff, steamAction.el),
      card('water-card',
        h('div', { class: 'card-intro' }, h('h2', { class: 'card-title', text: 'Hot water' }),
          h('p', { class: 'muted', text: 'For an americano, tea, or warming a cup. Pours the amount you set, then stops.' })),
        h('div', { class: 'stepper-pair' }, waterAmount.el, waterTemp.el), waterPresets.el, waterAction.el),
      card('water-card',
        h('div', { class: 'card-intro' }, h('h2', { class: 'card-title', text: 'Rinse' }),
          h('p', { class: 'muted', text: 'A short burst of water through the group. Clears old coffee before your next shot.' })),
        rinseTime.el, cleanBox, rinseAction.el)));

  function update() {
    head.update();
    steamTime.update(); steamPresets.update(); steamAction.update();
    show(steamOff, Number(steam().targetTemperature) === 0);
    waterAmount.update(); waterTemp.update(); waterPresets.update(); waterAction.update();
    rinseTime.update(); rinseAction.update();
    const since = shotsSinceClean();
    const due = cleaningDue();
    setAttr(cleanBox, 'data-due', due);
    setText(cleanLine, since == null ? 'Counting starts with your next shot.'
      : due ? `Time to clean the group: ${since} shots since the last clean.`
        : `${since} ${since === 1 ? 'shot' : 'shots'} since the last clean. Due in about ${S.cleaning.interval - since}.`);
    setText(every, `Remind me every ${S.cleaning.interval} shots`);
  }

  return { el, update };
}
