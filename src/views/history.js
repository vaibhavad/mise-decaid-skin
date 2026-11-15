// History: your shots on the left, the chosen one on the right with its
// chart and steps. Compare lays a second shot underneath, faint.

import { h, setText, setAttr, show, replaceKids, icon } from '../dom.js';
import { S, selectShot, brewAgain, displayTitle, compareWith } from '../store.js';
import { num, ratio, when, trimNum, brewTemp, deg, stageStats } from '../format.js';
import { createChart } from '../chart.js';
import { sheetHead } from './parts.js';
import { stageCards } from './shot.js';

export function createHistory() {
  const head = sheetHead({ title: 'History', sub: 'Every shot is saved. Tap one to see it.' });
  const list = h('div', { class: 'shot-list' });
  let listKey = '';
  let picking = false;

  const dWhen = h('span', { class: 'val-label' });
  const dTitle = h('h2', { class: 'detail-title' });
  const stat = (label) => {
    const v = h('span', { class: 'stat-num' });
    return { v, el: h('div', { class: 'stat' }, h('span', { class: 'val-label', text: label }), v) };
  };
  const sOut = stat('Espresso out');
  const sTime = stat('Time');
  const sRatio = stat('Ratio');
  const sDose = stat('Coffee in');
  const sGrind = stat('Grind');
  const sTemp = stat('Temperature');
  const taste = h('span', { class: 'pill' });
  const notes = h('p', { class: 'detail-notes' });
  const chart = createChart({ width: 1000, height: 300 });
  const stages = h('ol', { class: 'stage-strip stage-strip-small' });
  const cmpText = h('span');
  const cmpBar = h('div', { class: 'compare-bar' }, icon('compare', 'icon'), cmpText,
    h('button', { class: 'link', type: 'button', text: 'Stop comparing', onClick: () => { picking = false; compareWith(null); } }));
  const compareBtn = h('button', { class: 'btn btn-outline', type: 'button', onClick: () => { picking = !picking; listKey = ''; update(); } }, icon('compare', 'icon'), h('span', { text: 'Compare' }));
  const again = h('button', { class: 'btn btn-primary', type: 'button', text: 'Brew this again' });
  const loading = h('p', { class: 'muted', text: 'Loading this shot…' });
  const empty = h('p', { class: 'muted empty', text: 'No shots yet. They appear here as you pull them.' });
  const detail = h('section', { class: 'detail' },
    h('div', { class: 'detail-top' },
      h('div', { class: 'detail-head' }, dWhen, h('div', { class: 'title-row' }, dTitle, taste)),
      h('div', { class: 'detail-actions' }, compareBtn, again)),
    h('div', { class: 'stat-row' }, sOut.el, sTime.el, sRatio.el, sDose.el, sGrind.el, sTemp.el),
    cmpBar,
    h('div', { class: 'legend' }, h('span', { class: 'c-pressure', text: 'Pressure' }), h('span', { class: 'c-flow', text: 'Flow' }), h('span', { class: 'c-weight', text: 'Weight' })),
    chart.el, loading, stages, notes);
  const pickHint = h('p', { class: 'pick-hint', text: 'Pick a shot to compare with' });

  const el = h('div', { class: 'sheet-body view-history' },
    head.el,
    h('div', { class: 'history-body' },
      h('div', { class: 'list-col' }, pickHint, list),
      detail, empty));

  function figures(shot) {
    const d = S.shotDetails[shot.id];
    const extra = shot.annotations?.extras?.mise || {};
    return {
      dose: Number(shot.annotations?.actualDoseWeight) || Number(shot.workflow?.context?.targetDoseWeight) || null,
      out: Number(shot.annotations?.actualYield) || Number(extra.out) || d?.out || null,
      seconds: d?.seconds || Number(extra.seconds) || null,
      taste: extra.taste || '',
    };
  }

  function updateList() {
    const shots = S.shots || [];
    const key = `${shots.map((s) => s.id).join(',')}|${S.selectedShot}|${S.compareShot}|${picking}|${Object.keys(S.shotDetails).length}`;
    if (key === listKey) return;
    listKey = key;
    replaceKids(list, shots.map((shot) => {
      const f = figures(shot);
      const isCmp = shot.id === S.compareShot;
      return h('button', {
        class: 'shot-row', type: 'button',
        'aria-pressed': shot.id === S.selectedShot ? 'true' : 'false',
        'data-compare': isCmp ? 'true' : null,
        onClick: () => {
          if (picking) { picking = false; compareWith(shot.id); listKey = ''; return; }
          selectShot(shot.id);
        },
      },
      h('span', { class: 'shot-row-top' }, h('strong', { text: when(shot.timestamp) }), f.taste ? h('span', { class: 'pill pill-quiet', text: f.taste }) : null),
      h('span', { class: 'muted', text: displayTitle(shot.workflow?.profile?.title) || 'Espresso' }),
      h('span', { class: 'shot-row-nums', text: [f.dose && f.out ? `${num(f.dose, 1)} → ${num(f.out, 1)} g` : (f.out ? `${num(f.out, 1)} g` : null), f.seconds ? `${Math.round(f.seconds)} s` : null].filter(Boolean).join(' · ') }));
    }));
  }

  let drawnKey = '';
  function update() {
    updateList();
    show(pickHint, picking);
    setAttr(compareBtn, 'aria-pressed', picking || S.compareShot ? 'true' : 'false');
    const shot = (S.shots || []).find((s) => s.id === S.selectedShot) || null;
    show(detail, Boolean(shot));
    show(empty, !shot && !(S.shots || []).length);
    if (!shot) return;
    const d = S.shotDetails[shot.id];
    const f = figures(shot);
    const ctx = shot.workflow?.context || {};
    setText(dWhen, when(shot.timestamp));
    setText(dTitle, displayTitle(shot.workflow?.profile?.title) || 'Espresso');
    show(taste, Boolean(f.taste));
    setText(taste, f.taste);
    setText(sOut.v, f.out ? `${num(f.out, 1)} g` : '–');
    setText(sTime.v, f.seconds ? `${num(f.seconds, 1)} s` : '–');
    setText(sRatio.v, ratio(f.dose, f.out));
    setText(sDose.v, f.dose ? `${num(f.dose, 1)} g` : '–');
    setText(sGrind.v, ctx.grinderSetting != null && ctx.grinderSetting !== '' ? (trimNum(ctx.grinderSetting) === '–' ? String(ctx.grinderSetting) : trimNum(ctx.grinderSetting)) : '–');
    const t = brewTemp(shot.workflow?.profile);
    setText(sTemp.v, t != null ? deg(t, 1) : '–');
    const note = shot.annotations?.espressoNotes || '';
    show(notes, Boolean(note));
    setText(notes, note);
    show(loading, !d);

    const cmpShot = S.compareShot ? (S.shots || []).find((s) => s.id === S.compareShot) : null;
    const cmp = cmpShot ? S.shotDetails[cmpShot.id] : null;
    show(cmpBar, Boolean(cmpShot));
    if (cmpShot) {
      const cf = figures(cmpShot);
      setText(cmpText, `Faint lines: ${when(cmpShot.timestamp)} · ${displayTitle(cmpShot.workflow?.profile?.title) || 'Espresso'}${cf.out ? ` · ${num(cf.out, 1)} g` : ''}${cf.seconds ? ` in ${Math.round(cf.seconds)} s` : ''}`);
    }
    const key = `${shot.id}|${Boolean(d)}|${S.compareShot}|${Boolean(cmp)}|${S.layout.unit}`;
    if (d && key !== drawnKey) {
      drawnKey = key;
      chart.draw({ samples: d.samples, target: 0, compare: cmp?.samples || null });
      setAttr(chart.el, 'aria-label', `Chart of the shot from ${when(shot.timestamp)}${cmpShot ? `, compared with ${when(cmpShot.timestamp)}` : ''}.`);
      replaceKids(stages, stageCards(stageStats(d.samples, shot.workflow?.profile?.steps || [])));
    }
    again.onclick = () => brewAgain(d?.record || shot);
  }

  return { el, update };
}
