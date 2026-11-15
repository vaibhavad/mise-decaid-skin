// Settings, in Mise's own look, one section at a time. It covers Decaid's
// shot and tablet settings, the machine's own settings and Mise's layout.
// "All Decaid settings" opens Decaid's complete page for anything else.

import { h, setText, show, setAttr, replaceKids, icon } from '../dom.js';
import {
  S, updateSettings, updatePresence, setBrightness, setSteam, setHotWater, setRinse, setCleanInterval,
  openDecaidSettings, gatewayMode, openCity, setWeatherUnit, updateLayout, moveCard, toggleCard,
  updateMachineSetting,
} from '../store.js';
import { num, clamp, deg } from '../format.js';
import { toggleRow, choiceRow, numberRow, card, sheetHead } from './parts.js';

const CARD_NAMES = { hotWater: 'Hot water', steam: 'Steam', flush: 'Flush and cleaning', scale: 'Scale' };

const MODE_HINTS = {
  tracking: 'Best for Mise. Decaid weighs the shot, stops it at your target and saves it to History, while Mise shows it.',
  full: 'The skin is expected to stop the shot itself. Mise does not, so shots will not stop at the target weight in this mode.',
  disabled: 'Decaid runs the machine itself and shows its own shot screen during a shot, in place of Mise.',
};

const SECTIONS = [
  { key: 'brew', label: 'Brew screen' },
  { key: 'shots', label: 'Shots' },
  { key: 'water', label: 'Steam and water' },
  { key: 'machine', label: 'Machine' },
  { key: 'tablet', label: 'Tablet' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'mise', label: 'About' },
];

const clock = (minutes) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const d = new Date(2000, 0, 1, Math.floor(m / 60), m % 60);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

// Which cards the Brew screen shows, and in what order.
function homeCards() {
  const list = h('div', { class: 'card-order' });
  let key = '';
  return {
    el: list,
    update() {
      const k = `${S.layout.cards.join(',')}|${S.layout.hidden.join(',')}`;
      if (k === key) return;
      key = k;
      const cards = S.layout.cards;
      replaceKids(list, cards.map((c, i) => {
        const on = !S.layout.hidden.includes(c);
        const sw = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': `Show ${CARD_NAMES[c]}`, onClick: () => toggleCard(c) },
          h('span', { class: 'switch-knob', 'aria-hidden': 'true' }));
        return h('div', { class: 'order-row', 'data-off': on ? null : 'true' },
          h('span', { class: 'set-label', text: CARD_NAMES[c] }),
          h('span', { class: 'order-btns' },
            h('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Move ${CARD_NAMES[c]} up`, disabled: i === 0, onClick: () => moveCard(c, -1) }, icon('up')),
            h('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Move ${CARD_NAMES[c]} down`, disabled: i === cards.length - 1, onClick: () => moveCard(c, 1) }, icon('down')),
            sw));
      }));
    },
  };
}

function infoRow(label, read) {
  const value = h('span', { class: 'mini-value' });
  const el = h('div', { class: 'set-row' }, h('div', { class: 'set-text' }, h('span', { class: 'set-label', text: label })), value);
  return { el, update() { setText(value, read() ?? '–'); } };
}

export function createSettings() {
  let section = 'brew';
  const setting = (key) => () => (S.settings && key in S.settings ? S.settings[key] : null);
  const ms = (key) => () => (S.machineSettings && key in S.machineSettings ? S.machineSettings[key] : null);
  const adv = (key) => () => (S.advanced && key in S.advanced ? S.advanced[key] : null);
  const steam = () => S.workflow?.steamSettings || null;
  const hot = () => S.workflow?.hotWaterData || null;
  const rinse = () => S.workflow?.rinseData || null;
  let lastSteamTemp = 150;

  const rows = {
    // Brew screen
    tank: toggleRow({ label: 'Water tank gauge', hint: 'The coloured bar on the left of the Brew screen.', read: () => S.layout.tank !== false, write: (v) => updateLayout({ tank: v }) }),
    last: toggleRow({ label: 'Last shot', hint: 'The strip under the recipes.', read: () => S.layout.last !== false, write: (v) => updateLayout({ last: v }) }),
    unit: choiceRow({
      label: 'Temperatures', hint: 'How Mise shows temperatures. The machine always works in °C.',
      options: [{ label: '°C', value: 'c' }, { label: '°F', value: 'f' }],
      read: () => S.layout.unit, write: (v) => updateLayout({ unit: v }),
    }),

    // Shots
    mode: choiceRow({
      label: 'Gateway mode',
      hint: (v) => MODE_HINTS[v] || 'How Decaid shares control of the machine with a skin.',
      options: [{ label: 'Tracking', value: 'tracking' }, { label: 'Full', value: 'full' }, { label: 'Disabled', value: 'disabled' }],
      read: gatewayMode, write: (v) => updateSettings({ gatewayMode: v }),
    }),
    needScale: toggleRow({ label: 'Require a scale', hint: 'Do not start a shot when no scale is connected.', read: setting('blockOnNoScale'), write: (v) => updateSettings({ blockOnNoScale: v }) }),
    lockTare: toggleRow({ label: 'Lock the scale during a shot', hint: 'Ignore requests to zero the scale while a shot is running.', read: setting('blockTareDuringShot'), write: (v) => updateSettings({ blockTareDuringShot: v }) }),
    scaleTimer: toggleRow({
      label: 'Scale timer follows the shot',
      hint: 'Zeroes, starts and stops your scale\'s timer with each shot. In Tracking mode Decaid already does this; Mise takes over in Full mode.',
      read: () => S.layout.scaleTimer !== false, write: (v) => updateLayout({ scaleTimer: v }),
    }),
    weightLead: numberRow({
      label: 'Stop by weight: timing', hint: 'How far ahead Decaid looks when stopping at your target. Raise it if shots overshoot, lower it if they stop short. Usually 1.0.',
      less: 'Stop later', more: 'Stop earlier', read: setting('weightFlowMultiplier'),
      write: (v) => updateSettings({ weightFlowMultiplier: clamp(Math.round(v * 10) / 10, 0, 3) }),
      step: 0.1, format: (v) => `× ${num(v, 1)}`,
    }),
    volumeLead: numberRow({
      label: 'Stop by volume: timing', hint: 'For recipes that stop by volume instead of weight. Usually 0.3 s.',
      less: 'Stop later', more: 'Stop earlier', read: setting('volumeFlowMultiplier'),
      write: (v) => updateSettings({ volumeFlowMultiplier: clamp(Math.round(v * 20) / 20, 0, 2) }),
      step: 0.05, format: (v) => `${num(v, 2)} s`,
    }),
    deduct: toggleRow({ label: 'Count down the coffee bag', hint: 'After each shot, take the dose off the bag in use, so Coffees shows what is left.', read: () => S.layout.deductDose !== false, write: (v) => updateLayout({ deductDose: v }) }),

    // Steam and water
    steamOn: toggleRow({
      label: 'Steam heater', hint: 'Turn it off if you only drink espresso. The machine heats up sooner.',
      read: () => (steam() ? Number(steam().targetTemperature) > 0 : null),
      write: (on) => setSteam({ targetTemperature: on ? lastSteamTemp : 0 }),
    }),
    steamTemp: numberRow({
      label: 'Steam temperature', hint: 'Hotter steam is drier and faster.', less: 'Lower steam temperature', more: 'Higher steam temperature',
      read: () => (steam() && Number(steam().targetTemperature) > 0 ? steam().targetTemperature : (steam() ? lastSteamTemp : null)),
      write: (v) => setSteam({ targetTemperature: clamp(Math.round(v), 130, 170) }), step: 1, format: (v) => deg(v),
      enabled: () => Number(steam()?.targetTemperature) > 0,
    }),
    steamFlow: numberRow({
      label: 'Steam flow', hint: 'Lower flow is gentler, for small jugs.', less: 'Less steam flow', more: 'More steam flow',
      read: () => (steam() ? steam().flow ?? null : null),
      write: (v) => setSteam({ flow: clamp(Math.round(v * 10) / 10, 0.4, 2.5) }), step: 0.1, format: (v) => `${num(v, 1)} ml/s`,
    }),
    purge: choiceRow({
      label: 'Stopping steam', hint: (v) => (v === 1 ? 'The first tap stops steam; a second tap purges the wand, so you can wipe it first.' : 'Steam stops and the wand purges in one go.'),
      options: [{ label: 'Stop and purge', value: 0 }, { label: 'Two taps', value: 1 }],
      read: ms('steamPurgeMode'), write: (v) => updateMachineSetting({ steamPurgeMode: v }),
    }),
    hwFlow: numberRow({
      label: 'Hot water flow', hint: 'How fast hot water pours.', less: 'Slower', more: 'Faster',
      read: () => (hot() ? hot().flow ?? null : null),
      write: (v) => setHotWater({ flow: clamp(Math.round(v * 2) / 2, 1, 10) }), step: 0.5, format: (v) => `${num(v, 1)} ml/s`,
    }),
    waterWeight: toggleRow({ label: 'Stop hot water by weight', hint: 'With a scale connected, hot water stops at the amount you set, read as grams.', read: setting('stopHotWaterAtWeight'), write: (v) => updateSettings({ stopHotWaterAtWeight: v }) }),
    hwLead: numberRow({
      label: 'Hot water by weight: timing', hint: 'Raise it if hot water overshoots the amount.', less: 'Stop later', more: 'Stop earlier',
      read: setting('hotWaterFlowMultiplier'), write: (v) => updateSettings({ hotWaterFlowMultiplier: clamp(Math.round(v * 20) / 20, 0, 2) }),
      step: 0.05, format: (v) => `${num(v, 2)} s`,
    }),
    flushTemp: numberRow({
      label: 'Flush temperature', hint: 'Water temperature for a flush.', less: 'Cooler', more: 'Hotter',
      read: () => (rinse() ? rinse().targetTemperature ?? null : null),
      write: (v) => setRinse({ targetTemperature: clamp(Math.round(v), 5, 95) }), step: 1, format: (v) => deg(v),
    }),
    flushFlow: numberRow({
      label: 'Flush flow', hint: 'How hard the flush runs.', less: 'Gentler', more: 'Harder',
      read: () => (rinse() ? rinse().flow ?? null : null),
      write: (v) => setRinse({ flow: clamp(Math.round(v * 2) / 2, 1, 8) }), step: 0.5, format: (v) => `${num(v, 1)} ml/s`,
    }),

    // Machine
    fan: numberRow({
      label: 'Fan comes on at', hint: 'The machine\'s cooling fan runs above this temperature. 50 °C is the most the machine allows.',
      less: 'Lower', more: 'Higher', read: ms('fan'), write: (v) => updateMachineSetting({ fan: clamp(Math.round(v), 0, 50) }),
      step: 1, format: (v) => deg(v),
    }),
    tankTemp: numberRow({
      label: 'Warm the tank water', hint: 'Keeps the water tank at least this warm, for steadier temperatures. Off saves power.',
      less: 'Cooler', more: 'Warmer', read: ms('tankTemp'),
      write: (v) => updateMachineSetting({ tankTemp: v < 10 ? 0 : clamp(Math.round(v), 10, 40) }),
      step: 1, format: (v) => (v > 0 ? deg(v) : 'Off'),
    }),
    refill: choiceRow({
      label: 'Refill kit', hint: 'For machines plumbed to a water line. Auto lets the machine detect it.',
      options: [{ label: 'Auto', value: 2 }, { label: 'On', value: 1 }, { label: 'Off', value: 0 }],
      read: adv('refillKitSetting'), write: (v) => updateMachineSetting({ refillKitSetting: v }, true),
    }),
    idleTemp: numberRow({
      label: 'Heater idle temperature', hint: 'How warm the heater stays between shots. Lower saves power but heats up slower.',
      less: 'Lower', more: 'Higher', read: adv('heaterIdleTemp'), write: (v) => updateMachineSetting({ heaterIdleTemp: clamp(Math.round(v), 0, 99) }, true),
      step: 1, format: (v) => deg(v),
    }),
    ph1: numberRow({
      label: 'Heater warm-up flow', hint: 'Water flow while the heater warms up for a shot.', less: 'Less', more: 'More',
      read: adv('heaterPh1Flow'), write: (v) => updateMachineSetting({ heaterPh1Flow: clamp(Math.round(v * 10) / 10, 0, 10) }, true),
      step: 0.1, format: (v) => `${num(v, 1)} ml/s`,
    }),
    ph2: numberRow({
      label: 'Heater test flow', hint: 'Water flow while the heater settles its temperature.', less: 'Less', more: 'More',
      read: adv('heaterPh2Flow'), write: (v) => updateMachineSetting({ heaterPh2Flow: clamp(Math.round(v * 10) / 10, 0, 10) }, true),
      step: 0.1, format: (v) => `${num(v, 1)} ml/s`,
    }),
    ph2t: numberRow({
      label: 'Heater test time', hint: 'How long the heater tries to settle its temperature.', less: 'Shorter', more: 'Longer',
      read: adv('heaterPh2Timeout'), write: (v) => updateMachineSetting({ heaterPh2Timeout: clamp(Math.round(v), 0, 60) }, true),
      step: 1, format: (v) => `${num(v, 0)} s`,
    }),
    voltage: infoRow('Mains voltage', () => (S.advanced?.heaterVoltage ? `${S.advanced.heaterVoltage} V` : null)),
    model: infoRow('Machine', () => [S.info?.model, S.info?.version ? `firmware ${S.info.version}` : null].filter(Boolean).join(' · ') || null),

    // Tablet
    keepAwake: toggleRow({
      label: 'Keep the screen on', hint: 'While Decaid is open the screen never turns off. When this is off, it stays on while the machine is awake and may turn off while it sleeps.',
      read: setting('keepAwake'), write: (v) => updateSettings({ keepAwake: v }),
    }),
    brightness: numberRow({
      label: 'Screen brightness', hint: 'At 100 the tablet manages brightness itself.', less: 'Dimmer', more: 'Brighter',
      read: () => (S.display && S.display.platformSupported?.brightness !== false ? S.display.requestedBrightness ?? S.display.brightness ?? null : null),
      write: setBrightness, step: 10, format: (v) => (v >= 100 ? 'Auto' : `${num(v, 0)}%`),
    }),
    lowBattery: toggleRow({ label: 'Dim when the battery is low', hint: 'Below 30% battery, brightness is capped at 20.', read: setting('lowBatteryBrightnessLimit'), write: (v) => updateSettings({ lowBatteryBrightnessLimit: v }) }),
    charging: choiceRow({
      label: 'Tablet charging', hint: (v) => ({
        disabled: 'The tablet always charges from the machine.',
        longevity: 'Keeps the battery around half full, which is kindest to it when the tablet lives on the machine.',
        balanced: 'Charges to a middle level and keeps it there.',
        highAvailability: 'Keeps the battery nearly full.',
      }[v] || 'How the machine charges the tablet over USB.'),
      options: [{ label: 'Always', value: 'disabled' }, { label: 'Longevity', value: 'longevity' }, { label: 'Balanced', value: 'balanced' }, { label: 'Keep full', value: 'highAvailability' }],
      read: setting('chargingMode'), write: (v) => updateSettings({ chargingMode: v }),
    }),
    night: toggleRow({ label: 'Night mode', hint: 'Sleeps the machine overnight between the times below.', read: setting('nightModeEnabled'), write: (v) => updateSettings({ nightModeEnabled: v }) }),
    nightStart: numberRow({
      label: 'Night starts', hint: '', less: 'Earlier', more: 'Later', read: setting('nightModeSleepTime'),
      write: (v) => updateSettings({ nightModeSleepTime: ((Math.round(v / 15) * 15) % 1440 + 1440) % 1440 }), step: 15, format: clock,
      enabled: () => Boolean(S.settings?.nightModeEnabled),
    }),
    nightEnd: numberRow({
      label: 'Morning starts', hint: '', less: 'Earlier', more: 'Later', read: setting('nightModeMorningTime'),
      write: (v) => updateSettings({ nightModeMorningTime: ((Math.round(v / 15) * 15) % 1440 + 1440) % 1440 }), step: 15, format: clock,
      enabled: () => Boolean(S.settings?.nightModeEnabled),
    }),
    scalePower: choiceRow({
      label: 'Scale when the machine sleeps', hint: 'Saves the scale\'s battery overnight.',
      options: [{ label: 'Leave on', value: 'disabled' }, { label: 'Screen off', value: 'displayOff' }, { label: 'Disconnect', value: 'disconnect' }],
      read: setting('scalePowerMode'), write: (v) => updateSettings({ scalePowerMode: v }),
    }),

    // Sleep
    autoSleep: toggleRow({
      label: 'Sleep when not in use', hint: 'Put the machine to sleep after a while without any touch.',
      read: () => (S.presence ? Boolean(S.presence.userPresenceEnabled) : null), write: (v) => updatePresence({ userPresenceEnabled: v }),
    }),
    sleepAfter: numberRow({
      label: 'Sleep after', hint: '', less: 'Sleep sooner', more: 'Sleep later',
      read: () => (S.presence ? S.presence.sleepTimeoutMinutes ?? null : null),
      write: (v) => updatePresence({ sleepTimeoutMinutes: clamp(Math.round(v / 5) * 5, 5, 240) }), step: 5, format: (v) => `${num(v, 0)} min`,
      enabled: () => Boolean(S.presence?.userPresenceEnabled),
    }),
    weatherUnit: choiceRow({
      label: 'Weather temperature', hint: '', options: [{ label: '°C', value: 'c' }, { label: '°F', value: 'f' }],
      read: () => (S.place ? S.place.unit || 'c' : null), write: setWeatherUnit,
    }),
    screenOff: numberRow({
      label: 'Screen off after', hint: 'While the machine sleeps, the clock goes dark after this long. Tap to bring it back; hold to wake the machine.',
      less: 'Sooner', more: 'Later', read: () => S.layout.screenOff || 0,
      write: (v) => updateLayout({ screenOff: clamp(Math.round(v / 5) * 5, 0, 120) }), step: 5, format: (v) => (v > 0 ? `${num(v, 0)} min` : 'Never'),
    }),

    // About
    cleanEvery: numberRow({
      label: 'Cleaning reminder', hint: 'How many shots between reminders to clean the group.', less: 'Remind me sooner', more: 'Remind me later',
      read: () => S.cleaning.interval, write: setCleanInterval, step: 10, format: (v) => `${num(v, 0)} shots`,
    }),
  };

  const cardsList = homeCards();
  const cityHint = h('span', { class: 'set-hint' });
  const cityRow = h('div', { class: 'set-row' },
    h('div', { class: 'set-text' }, h('span', { class: 'set-label', text: 'Weather city' }), cityHint),
    h('button', { class: 'btn btn-outline btn-small', type: 'button', onClick: openCity, text: 'Choose city' }));
  const unavailable = h('p', { class: 'set-note', text: 'Decaid\'s settings could not be read just now, so some switches are greyed out.' });
  const noMachine = h('p', { class: 'set-note', text: 'The machine\'s own settings could not be read. Check that it is connected.' });
  const versions = h('span', { class: 'muted small' });
  const decaidRow = h('div', { class: 'set-row' },
    h('div', { class: 'set-text' },
      h('span', { class: 'set-label', text: 'Everything else' }),
      h('span', { class: 'set-hint', text: 'Calibration, cleaning and descaling programs, firmware, connections. Opens Decaid\'s own page; its Back button returns here.' })),
    h('button', { class: 'btn btn-outline btn-small', type: 'button', onClick: openDecaidSettings, text: 'All Decaid settings' }));

  const t = (title, ...kids) => card('set-card', h('h2', { class: 'card-title', text: title }), ...kids);
  const pages = {
    brew: [
      t('Cards', h('p', { class: 'set-hint', text: 'Show, hide and order the cards beside your recipes.' }), cardsList.el),
      t('Display', rows.tank.el, rows.last.el, rows.unit.el),
    ],
    shots: [
      t('Shots', unavailable, rows.mode.el, rows.needScale.el, rows.lockTare.el, rows.scaleTimer.el),
      t('Stopping', rows.weightLead.el, rows.volumeLead.el, rows.deduct.el),
    ],
    water: [
      t('Steam', rows.steamOn.el, rows.steamTemp.el, rows.steamFlow.el, rows.purge.el),
      t('Hot water and flush', rows.hwFlow.el, rows.waterWeight.el, rows.hwLead.el, rows.flushTemp.el, rows.flushFlow.el),
    ],
    machine: [
      t('Machine', noMachine, rows.fan.el, rows.tankTemp.el, rows.refill.el, rows.model.el),
      t('Heater', h('p', { class: 'set-hint', text: 'For fine-tuning. The machine\'s own defaults suit most people.' }), rows.idleTemp.el, rows.ph1.el, rows.ph2.el, rows.ph2t.el, rows.voltage.el),
    ],
    tablet: [
      t('Screen', rows.keepAwake.el, rows.brightness.el, rows.lowBattery.el),
      t('Power', rows.charging.el, rows.night.el, rows.nightStart.el, rows.nightEnd.el, rows.scalePower.el),
    ],
    sleep: [
      t('Machine sleep', rows.autoSleep.el, rows.sleepAfter.el),
      t('Sleep screen', cityRow, rows.weatherUnit.el, rows.screenOff.el),
    ],
    mise: [
      t('Mise', rows.cleanEvery.el, decaidRow, versions),
    ],
  };

  const tabs = SECTIONS.map((s) => h('button', { class: 'filter', type: 'button', text: s.label, onClick: () => { section = s.key; render(); } }));
  const body = h('div', { class: 'settings-body' });
  const el = h('div', { class: 'sheet-body view-settings' },
    sheetHead({ title: 'Settings', sub: 'Changes are saved as you make them.' }).el,
    h('div', { class: 'filters' }, h('div', { class: 'filter-group settings-tabs', role: 'tablist' }, tabs)),
    body);
  let shownSection = null;

  function render() {
    tabs.forEach((b, i) => setAttr(b, 'aria-pressed', SECTIONS[i].key === section ? 'true' : 'false'));
    if (shownSection !== section) {
      shownSection = section;
      replaceKids(body, pages[section].map((c) => h('div', { class: 'settings-col' }, c)));
      body.scrollTop = 0;
    }
  }

  function update() {
    render();
    const tt = Number(steam()?.targetTemperature);
    if (tt > 0) lastSteamTemp = tt;
    for (const r of Object.values(rows)) r.update();
    cardsList.update();
    show(unavailable, !S.settings);
    show(noMachine, !S.machineSettings);
    setText(cityHint, S.place
      ? `${[S.place.name, S.place.region].filter(Boolean).join(', ')}. The sleep screen shows its weather.`
      : 'Not set. The sleep screen shows the time only.');
    const bits = [`Mise ${document.documentElement.dataset.miseVersion || ''}`.trim()];
    if (S.build?.fullVersion || S.build?.version) bits.push(`Decaid ${S.build.fullVersion || S.build.version}`);
    if (S.info?.model) bits.push(String(S.info.model));
    setText(versions, bits.join(' · '));
  }

  return { el, update };
}
