// History: recent shots on the left, the selected one on the right.

import { h, setText, show, replaceKids } from '../dom.js';
import { S, selectShot, brewAgain, displayTitle } from '../store.js';
import { num, ratio, when, trimNum, brewTemp } from '../format.js';
import { createChart } from '../chart.js';
import { card } from './parts.js';

export function createHistory() {
  const list = h('div', { class: 'shot-list' });
  let listKey = '';

  const dWhen = h('span', { class: 'label' });
  const dOut = h('span', { class: 'detail-out' });
  const dTime = h('span', { class: 'muted' });
  const chart = createChart({ width: 470, height: 250 });
  const fact = (label, wide) => {
    const value = h('dd');
    return { value, el: h('div', { class: wide ? 'fact fact-wide' : 'fact' }, h('dt', { text: label }), value) };
  };
  const fDose = fact('Coffee in');
  const fRatio = fact('Ratio');
  const fGrind = fact('Grinder setting');
  const fTemp = fact('Temperature');
  const fCoffee = fact('Coffee', true);
  const fTaste = fact('Taste');
  const fNotes = fact('Notes', true);
  const again = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Brew this again' });
  const loading = h('p', { class: 'muted', text: 'Loading this shot…' });
  const detailBody = h('div', { class: 'detail-body' },
    h('div', { class: 'detail-head' }, dWhen, h('div', { class: 'detail-figures' }, dOut, dTime)),
    chart.el,
    h('div', { class: 'legend' },
      h('span', { class: 'c-pressure', text: 'Pressure' }), h('span', { class: 'c-flow', text: 'Flow' }), h('span', { class: 'c-weight', text: 'Weight' })),
    loading,
    h('dl', { class: 'facts' }, fDose.el, fRatio.el, fGrind.el, fTemp.el, fCoffee.el, fTaste.el, fNotes.el));
  const detailEmpty = h('p', { class: 'muted', text: 'Tap a shot to see it here.' });
  let drawnFor = null;

  const el = h('div', { class: 'view view-history' },
    h('header', { class: 'page-head' },
      h('div', { class: 'page-head-text' }, h('h1', { class: 'page-title', text: 'History' }),
        h('span', { class: 'page-sub', text: 'Every shot is saved. Tap one to see it, or to brew it again.' }))),
    h('div', { class: 'history-body' },
      card('list-card',
        h('div', { class: 'shot-row shot-head', 'aria-hidden': 'true' },
          h('span', { text: 'When' }), h('span', { text: 'Recipe' }), h('span', { text: 'In → out' }), h('span', { text: 'Time' }), h('span', { text: 'Taste' })),
        list),
      card('detail-card', detailBody, detailEmpty, again)));

  function figures(shot) {
    const detail = S.shotDetails[shot.id];
    const extra = shot.annotations?.extras?.mise || {};
    return {
      dose: Number(shot.annotations?.actualDoseWeight) || Number(shot.workflow?.context?.targetDoseWeight) || null,
      out: Number(shot.annotations?.actualYield) || Number(extra.out) || detail?.out || null,
      seconds: detail?.seconds || Number(extra.seconds) || null,
      taste: extra.taste || '',
    };
  }

  function updateList() {
    const shots = S.shots;
    const key = !shots ? 'loading' : shots.map((s) => {
      const f = figures(s);
      return `${s.id}:${f.out}:${f.seconds}:${f.taste}`;
    }).join('|') + `#${S.selectedShot}#${Object.values(S.names).join(',')}`;
    if (key === listKey) return;
    listKey = key;
    if (!shots) { replaceKids(list, [h('p', { class: 'muted empty', text: 'Loading shots…' })]); return; }
    if (!shots.length) { replaceKids(list, [h('p', { class: 'muted empty', text: 'No shots yet. Your first one will appear here.' })]); return; }
    replaceKids(list, shots.map((shot) => {
      const f = figures(shot);
      return h('button', {
        class: 'shot-row', type: 'button', 'aria-pressed': shot.id === S.selectedShot ? 'true' : 'false',
        onClick: () => selectShot(shot.id),
      },
      h('strong', { text: when(shot.timestamp) }),
      h('strong', { class: 'clip', text: displayTitle(shot.workflow?.profile?.title) || shot.workflow?.name || 'Espresso' }),
      h('span', { text: `${f.dose ? num(f.dose, 1) : '–'} → ${f.out ? `${num(f.out, 1)} g` : '–'}` }),
      h('span', { text: f.seconds ? `${Math.round(f.seconds)} s` : '–' }),
      f.taste
        ? h('span', { class: f.taste === 'Just right' ? 'pill pill-solid' : 'pill', text: f.taste })
        : h('span', { class: 'muted small', text: 'Not rated' }));
    }));
  }

  function updateDetail() {
    const shot = (S.shots || []).find((s) => s.id === S.selectedShot);
    show(detailBody, Boolean(shot));
    show(detailEmpty, !shot);
    show(again, Boolean(shot));
    if (!shot) return;
    const detail = S.shotDetails[shot.id];
    const f = figures(shot);
    const context = shot.workflow?.context || {};
    setText(dWhen, `${when(shot.timestamp)} · ${displayTitle(shot.workflow?.profile?.title) || 'Espresso'}`);
    setText(dOut, f.out ? `${num(f.out, 1)} g` : '–');
    setText(dTime, f.seconds ? `in ${Math.round(f.seconds)} s` : '');
    show(loading, !detail);
    if (detail && drawnFor !== detail) {
      drawnFor = detail;
      chart.draw({ samples: detail.samples, target: 0 });
      chart.el.setAttribute('aria-label', `Chart of the shot from ${when(shot.timestamp)}.`);
    } else if (!detail && drawnFor !== null) {
      drawnFor = null;
      chart.draw({ samples: [], target: 0 });
    }
    const temp = brewTemp(shot.workflow?.profile);
    const grind = context.grinderSetting;
    setText(fDose.value, f.dose ? `${num(f.dose, 1)} g` : '–');
    setText(fRatio.value, ratio(f.dose, f.out));
    setText(fGrind.value, grind != null && grind !== '' ? (trimNum(grind) === '–' ? String(grind) : trimNum(grind)) : '–');
    setText(fTemp.value, temp != null ? `${trimNum(temp)} °C` : '–');
    setText(fCoffee.value, [context.coffeeName, context.coffeeRoaster].filter(Boolean).join(' · ') || '–');
    setText(fTaste.value, f.taste || 'Not rated');
    setText(fNotes.value, shot.annotations?.espressoNotes || '–');
    again.onclick = () => brewAgain(detail?.record || shot);
  }

  function update() {
    updateList();
    updateDetail();
  }

  return { el, update };
}
