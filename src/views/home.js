// Home: the current recipe, the four numbers people change, and what to do next.

import { h, setText, setAttr, show, replaceKids } from '../dom.js';
import {
  S, status, values, setDose, setOut, setTemp, setGrind, go, requestState, scan, transport,
  visibleProfiles, favoriteIds, useProfile, isInUse, cleaningDue, shotsSinceClean, selectShot,
} from '../store.js';
import { num, trimNum, ratio, firstSentence, when } from '../format.js';
import { profileCurve, miniChart } from '../chart.js';
import { stepper, header, card } from './parts.js';

export function createHome() {
  const head = header();

  // Recipe card
  const title = h('h2', { class: 'recipe-title' });
  const coffee = h('span', { class: 'muted' });
  const curveBox = h('div', { class: 'recipe-curve' });
  const blurb = h('span', { class: 'recipe-blurb muted' });
  let curveFor = null;

  const steppers = [
    stepper({ label: 'Coffee in', unit: 'g', less: 'Less coffee', more: 'More coffee', read: values.dose, write: setDose, step: 0.1, format: (v) => num(v, 1) }),
    stepper({ label: 'Espresso out', unit: 'g', less: 'Less espresso', more: 'More espresso', read: values.out, write: setOut, step: 1, format: (v) => (v > 0 ? num(v, 0) : 'Off') }),
    stepper({ label: 'Temperature', unit: '°C', less: 'Cooler', more: 'Hotter', read: () => values.temp() ?? '', write: setTemp, step: 0.5, format: (v) => trimNum(v) }),
    stepper({ label: 'Grinder setting', less: 'Lower grinder setting', more: 'Higher grinder setting', read: values.grind, write: setGrind, step: 0.1, format: (v) => trimNum(v) }),
  ];

  const ratioEl = h('strong');
  const stopNote = h('span');
  const saving = h('span', { class: 'saving' });
  const favRow = h('div', { class: 'fav-row' });
  let favKey = '';

  const recipe = card('recipe-card',
    h('div', { class: 'recipe-top' },
      h('div', { class: 'recipe-name' }, h('span', { class: 'label', text: 'Recipe' }), title, coffee),
      h('div', { class: 'recipe-shape' }, curveBox, blurb)),
    h('div', { class: 'stepper-grid' }, steppers.map((s) => s.el)),
    h('div', { class: 'ratio-line muted' }, h('span', { text: 'Ratio' }), ratioEl, h('span', { 'aria-hidden': 'true', text: '·' }), stopNote, saving),
    h('div', { class: 'favs' },
      h('div', { class: 'favs-head' },
        h('span', { class: 'label', text: 'Your recipes' }),
        h('button', { class: 'link', type: 'button', onClick: () => go('recipes'), text: 'All recipes' })),
      favRow));

  // Next step
  const nextTitle = h('p', { class: 'next-title' });
  const nextSub = h('p', { class: 'next-sub' });
  const startBtn = h('button', { class: 'btn btn-inverse btn-big', type: 'button', onClick: () => requestState('espresso'), text: 'Start espresso' });
  const stopBtn = h('button', { class: 'btn btn-inverse btn-big', type: 'button', onClick: () => requestState('idle'), text: 'Stop' });
  const scanBtn = h('button', { class: 'btn btn-inverse btn-big', type: 'button', onClick: scan, text: 'Look again' });
  const demoBtn = h('button', { class: 'btn btn-inverse-outline', type: 'button', onClick: () => transport().press('espresso'), text: 'Demo: press the machine button' });
  const next = h('section', { class: 'next', 'aria-label': 'Next step' },
    h('span', { class: 'label', text: 'Next step' }), nextTitle, startBtn, stopBtn, scanBtn, nextSub, demoBtn);

  // Cleaning reminder
  const cleanText = h('span');
  const clean = h('button', { class: 'clean-banner', type: 'button', onClick: () => go('water') },
    h('strong', { text: 'Time to clean the group' }), cleanText);

  // Last shot
  const lastWhen = h('span', { class: 'label' });
  const lastTag = h('span', { class: 'pill' });
  const lastOut = h('span', { class: 'last-out' });
  const lastTime = h('span', { class: 'muted' });
  const lastNote = h('p', { class: 'muted last-note' });
  const mini = miniChart();
  const lastOpen = h('button', { class: 'link', type: 'button', text: 'Open in History' });
  const lastBody = h('div', { class: 'last-body' },
    h('div', { class: 'last-head' }, lastWhen, lastTag),
    h('div', { class: 'last-figures' }, lastOut, lastTime),
    mini.el, lastNote, lastOpen);
  const lastEmpty = h('p', { class: 'muted', text: 'Your shots will appear here once you have pulled one.' });
  const last = card('last-card', lastBody, lastEmpty);

  const el = h('div', { class: 'view view-home' },
    head.el,
    h('div', { class: 'home-body' }, recipe, h('div', { class: 'home-side' }, next, clean, last)));

  function updateFavorites() {
    const ids = favoriteIds();
    const all = visibleProfiles();
    const current = S.workflow?.profile?.title || '';
    const key = `${ids.join(',')}|${current}|${all.length}`;
    if (key === favKey) return;
    favKey = key;
    const records = ids.map((id) => all.find((r) => r.id === id)).filter(Boolean);
    if (!records.length) {
      replaceKids(favRow, [h('span', { class: 'muted', text: 'Star recipes in All recipes to keep them here.' })]);
      return;
    }
    replaceKids(favRow, records.map((record) => h('button', {
      class: 'fav', type: 'button', 'aria-pressed': isInUse(record) ? 'true' : 'false',
      onClick: () => useProfile(record), text: record.profile.title,
    })));
  }

  function updateNext(st) {
    const ghc = S.info?.GHC !== false;
    const ready = st.tone === 'ok';
    const busy = ['steam', 'hotWater', 'flush'].includes(S.snap?.state?.state);
    show(startBtn, ready && !ghc);
    show(stopBtn, busy);
    show(scanBtn, !S.machineConnected);
    show(demoBtn, S.mode === 'demo' && ready && ghc);
    if (!S.machineConnected) {
      setText(nextTitle, 'Switch the machine on');
      setText(nextSub, 'It connects by itself once it is in range.');
    } else if (busy) {
      setText(nextTitle, `${st.title}. Wait for it to finish, or stop it here.`);
      setText(nextSub, '');
    } else if (!ready) {
      setText(nextTitle, st.tone === 'warn' ? st.sub : 'Wait for the machine to heat up');
      setText(nextSub, st.tone === 'warn' ? '' : st.sub);
    } else {
      setText(nextTitle, ghc ? 'Lock in the portafilter, then press espresso on the machine' : 'Lock in the portafilter');
      setText(nextSub, S.scaleConnected
        ? 'The scale zeroes itself when the shot starts.'
        : 'No scale connected, so stop the shot yourself.');
    }
  }

  function updateLast() {
    const shot = S.shots?.[0];
    show(lastBody, Boolean(shot));
    show(lastEmpty, !shot);
    if (!shot) return;
    const detail = S.shotDetails[shot.id];
    const extra = shot.annotations?.extras?.mise || {};
    const out = Number(shot.annotations?.actualYield) || Number(extra.out) || detail?.out;
    const seconds = detail?.seconds || Number(extra.seconds);
    setText(lastWhen, `Last shot · ${when(shot.timestamp)}`);
    setText(lastOut, out ? `${num(out, 1)} g` : '–');
    setText(lastTime, seconds ? `in ${Math.round(seconds)} s` : '');
    show(lastTag, Boolean(extra.taste));
    setText(lastTag, extra.taste || '');
    const note = shot.annotations?.espressoNotes || '';
    show(lastNote, Boolean(note));
    setText(lastNote, note);
    mini.draw(detail?.samples || null);
    lastOpen.onclick = () => { selectShot(shot.id); go('history'); };
  }

  function update() {
    head.update();
    const st = status();
    const profile = S.workflow?.profile;
    setText(title, profile?.title || 'No recipe loaded');
    const context = S.workflow?.context || {};
    setText(coffee, [context.coffeeName, context.coffeeRoaster].filter(Boolean).join(' · '));
    if (profile !== curveFor) {
      curveFor = profile;
      replaceKids(curveBox, profile ? [profileCurve(profile, 'curve curve-large')] : []);
      setText(blurb, firstSentence(profile?.notes, 110));
    }
    for (const s of steppers) s.update();
    const out = values.out();
    setText(ratioEl, ratio(values.dose(), out));
    setText(stopNote, out > 0
      ? (S.scaleConnected ? `Stops by itself when the scale reads ${num(out, 0)} g` : 'Connect a scale to stop by weight')
      : 'Stop by weight is off');
    setText(saving, { saving: 'Saving…', saved: 'Saved', error: 'Not saved' }[S.saving] || '');
    setAttr(saving, 'data-state', S.saving || null);
    updateFavorites();
    updateNext(st);
    const due = cleaningDue();
    show(clean, due);
    if (due) setText(cleanText, `${shotsSinceClean()} shots since the last clean`);
    updateLast();
  }

  return { el, update };
}
