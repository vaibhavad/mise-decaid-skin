// Settings, in Mise's own look. It covers the everyday choices; the link at
// the end opens Decaid's complete settings page for everything else.

import { h, setText, show, setAttr, replaceKids, icon } from '../dom.js';
import {
  S, updateSettings, updatePresence, setBrightness, setSteam, setCleanInterval,
  openDecaidSettings, gatewayMode, openCity, setWeatherUnit, updateLayout, moveCard, toggleCard,
} from '../store.js';
import { num, clamp, deg } from '../format.js';
import { toggleRow, choiceRow, numberRow, card, sheetHead } from './parts.js';

const CARD_NAMES = { hotWater: 'Hot water', steam: 'Steam', flush: 'Flush and cleaning', scale: 'Scale' };

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

const MODE_HINTS = {
  tracking: 'Best for Mise. Decaid weighs the shot, stops it at your target and saves it to History, while Mise shows it.',
  full: 'The skin is expected to stop the shot itself. Mise does not, so shots will not stop at the target weight in this mode.',
  disabled: 'Decaid runs the machine itself and shows its own shot screen during a shot, in place of Mise.',
};

export function createSettings() {
  const setting = (key) => () => (S.settings && key in S.settings ? S.settings[key] : null);
  const steam = () => S.workflow?.steamSettings || null;
  let lastSteamTemp = 150;

  const rows = {
    mode: choiceRow({
      label: 'Gateway mode',
      hint: (v) => MODE_HINTS[v] || 'How Decaid shares control of the machine with a skin.',
      options: [{ label: 'Tracking', value: 'tracking' }, { label: 'Full', value: 'full' }, { label: 'Disabled', value: 'disabled' }],
      read: gatewayMode,
      write: (v) => updateSettings({ gatewayMode: v }),
    }),
    needScale: toggleRow({
      label: 'Require a scale',
      hint: 'Do not start a shot when no scale is connected.',
      read: setting('blockOnNoScale'), write: (v) => updateSettings({ blockOnNoScale: v }),
    }),
    lockTare: toggleRow({
      label: 'Lock the scale during a shot',
      hint: 'Ignore requests to zero the scale while a shot is running.',
      read: setting('blockTareDuringShot'), write: (v) => updateSettings({ blockTareDuringShot: v }),
    }),
    waterWeight: toggleRow({
      label: 'Stop hot water by weight',
      hint: 'With a scale connected, hot water stops at the amount you set, read as grams.',
      read: setting('stopHotWaterAtWeight'), write: (v) => updateSettings({ stopHotWaterAtWeight: v }),
    }),

    steamOn: toggleRow({
      label: 'Steam heater',
      hint: 'Turn it off if you only drink espresso. The machine heats up sooner.',
      read: () => (steam() ? Number(steam().targetTemperature) > 0 : null),
      write: (on) => setSteam({ targetTemperature: on ? lastSteamTemp : 0 }),
    }),
    steamTemp: numberRow({
      label: 'Steam temperature', hint: 'Hotter steam is drier and faster.',
      less: 'Lower steam temperature', more: 'Higher steam temperature',
      read: () => (steam() && Number(steam().targetTemperature) > 0 ? steam().targetTemperature : (steam() ? lastSteamTemp : null)),
      write: (v) => setSteam({ targetTemperature: clamp(Math.round(v), 130, 170) }),
      step: 1, format: (v) => deg(v),
      enabled: () => Number(steam()?.targetTemperature) > 0,
    }),
    steamFlow: numberRow({
      label: 'Steam flow', hint: 'Lower flow is gentler, for small jugs.',
      less: 'Less steam flow', more: 'More steam flow',
      read: () => (steam() ? steam().flow ?? null : null),
      write: (v) => setSteam({ flow: clamp(Math.round(v * 10) / 10, 0.4, 2.5) }),
      step: 0.1, format: (v) => `${num(v, 1)} ml/s`,
    }),

    autoSleep: toggleRow({
      label: 'Sleep when not in use',
      hint: 'Put the machine to sleep after a while without any touch.',
      read: () => (S.presence ? Boolean(S.presence.userPresenceEnabled) : null),
      write: (v) => updatePresence({ userPresenceEnabled: v }),
    }),
    sleepAfter: numberRow({
      label: 'Sleep after', hint: '',
      less: 'Sleep sooner', more: 'Sleep later',
      read: () => (S.presence ? S.presence.sleepTimeoutMinutes ?? null : null),
      write: (v) => updatePresence({ sleepTimeoutMinutes: clamp(Math.round(v / 5) * 5, 5, 240) }),
      step: 5, format: (v) => `${num(v, 0)} min`,
      enabled: () => Boolean(S.presence?.userPresenceEnabled),
    }),
    brightness: numberRow({
      label: 'Screen brightness', hint: 'At 100 the tablet manages brightness itself.',
      less: 'Dimmer', more: 'Brighter',
      read: () => (S.display && S.display.platformSupported?.brightness !== false ? S.display.requestedBrightness ?? S.display.brightness ?? null : null),
      write: setBrightness,
      step: 10, format: (v) => (v >= 100 ? 'Auto' : `${num(v, 0)}%`),
    }),
    scalePower: choiceRow({
      label: 'Scale when the machine sleeps',
      hint: 'Saves the scale\'s battery overnight.',
      options: [{ label: 'Leave on', value: 'disabled' }, { label: 'Screen off', value: 'displayOff' }, { label: 'Disconnect', value: 'disconnect' }],
      read: setting('scalePowerMode'), write: (v) => updateSettings({ scalePowerMode: v }),
    }),

    cleanEvery: numberRow({
      label: 'Cleaning reminder', hint: 'How many shots between reminders to clean the group.',
      less: 'Remind me sooner', more: 'Remind me later',
      read: () => S.cleaning.interval, write: setCleanInterval,
      step: 10, format: (v) => `${num(v, 0)} shots`,
    }),
  };

  const cityHint = h('span', { class: 'set-hint' });
  const cityRow = h('div', { class: 'set-row' },
    h('div', { class: 'set-text' }, h('span', { class: 'set-label', text: 'Weather city' }), cityHint),
    h('button', { class: 'btn btn-outline btn-small', type: 'button', onClick: openCity, text: 'Choose city' }));
  rows.weatherUnit = choiceRow({
    label: 'Temperature on the sleep screen', hint: '',
    options: [{ label: '°C', value: 'c' }, { label: '°F', value: 'f' }],
    read: () => (S.place ? S.place.unit || 'c' : null), write: setWeatherUnit,
  });

  rows.unit = choiceRow({
    label: 'Temperatures', hint: 'How Mise shows temperatures. The machine always works in °C.',
    options: [{ label: '°C', value: 'c' }, { label: '°F', value: 'f' }],
    read: () => S.layout.unit, write: (v) => updateLayout({ unit: v }),
  });
  rows.tank = toggleRow({ label: 'Water tank gauge', hint: 'The coloured bar on the left of the Brew screen.', read: () => S.layout.tank !== false, write: (v) => updateLayout({ tank: v }) });
  rows.last = toggleRow({ label: 'Last shot', hint: 'The strip under the recipes.', read: () => S.layout.last !== false, write: (v) => updateLayout({ last: v }) });
  rows.screenOff = numberRow({
    label: 'Screen off after', hint: 'While the machine sleeps, the clock goes dark after this long. Tap to bring it back.',
    less: 'Sooner', more: 'Later', read: () => S.layout.screenOff || 0,
    write: (v) => updateLayout({ screenOff: clamp(Math.round(v / 5) * 5, 0, 120) }),
    step: 5, format: (v) => (v > 0 ? `${num(v, 0)} min` : 'Never'),
  });
  const cardsList = homeCards();

  const unavailable = h('p', { class: 'set-note', text: 'Decaid\'s settings could not be read just now, so some switches are greyed out.' });
  const versions = h('span', { class: 'muted small' });

  const el = h('div', { class: 'sheet-body view-settings' },
    sheetHead({ title: 'Settings', sub: 'Changes are saved as you make them.' }).el,
    h('div', { class: 'settings-body' },
      h('div', { class: 'settings-col' },
        card('set-card', h('h2', { class: 'card-title', text: 'Brew screen' }),
          h('p', { class: 'set-hint', text: 'Show, hide and order the cards beside your recipes.' }),
          cardsList.el, rows.tank.el, rows.last.el, rows.unit.el),
        card('set-card', h('h2', { class: 'card-title', text: 'Shots' }), unavailable,
          rows.mode.el, rows.needScale.el, rows.lockTare.el, rows.waterWeight.el),
        card('set-card', h('h2', { class: 'card-title', text: 'Sleep screen' }), cityRow, rows.weatherUnit.el, rows.screenOff.el),
        card('set-card', h('h2', { class: 'card-title', text: 'Mise' }), rows.cleanEvery.el,
          h('div', { class: 'set-row' },
            h('div', { class: 'set-text' },
              h('span', { class: 'set-label', text: 'Everything else' }),
              h('span', { class: 'set-hint', text: 'Opens Decaid\'s own settings page. It looks different; its Back button returns here.' })),
            h('button', { class: 'btn btn-outline btn-small', type: 'button', onClick: openDecaidSettings, text: 'All Decaid settings' })),
          versions)),
      h('div', { class: 'settings-col' },
        card('set-card', h('h2', { class: 'card-title', text: 'Steam' }),
          rows.steamOn.el, rows.steamTemp.el, rows.steamFlow.el),
        card('set-card', h('h2', { class: 'card-title', text: 'Sleep and screen' }),
          rows.autoSleep.el, rows.sleepAfter.el, rows.brightness.el, rows.scalePower.el))));

  function update() {
    const t = Number(steam()?.targetTemperature);
    if (t > 0) lastSteamTemp = t;
    for (const r of Object.values(rows)) r.update();
    cardsList.update();
    show(unavailable, !S.settings);
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
