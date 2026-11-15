// While steam, hot water or a flush runs: how long, how hot, and a Stop
// button. It closes by itself a moment after the machine finishes.

import { h, setText, show, setAttr } from '../dom.js';
import { S, requestState } from '../store.js';
import { num, deg } from '../format.js';

const TITLES = { steam: 'Steaming', hotWater: 'Pouring hot water', flush: 'Flushing the group' };

export function createUtility() {
  const title = h('h2', { class: 'util-title' });
  const secs = h('span', { class: 'big-num' });
  const of = h('span', { class: 'big-of' });
  const temp = h('span', { class: 'big-num big-num-small' });
  const tempOf = h('span', { class: 'big-of' });
  const bar = h('span', { class: 'progress-fill' });
  const progress = h('span', { class: 'progress' }, bar);
  const stop = h('button', { class: 'btn btn-stop btn-block', type: 'button', text: 'Stop', onClick: () => requestState('idle') });
  const done = h('p', { class: 'util-done', text: 'Done' });
  const panel = h('div', { class: 'util-panel', role: 'dialog', 'aria-live': 'polite' },
    title,
    h('div', { class: 'util-stats' },
      h('div', { class: 'big-stat' }, h('span', { class: 'val-label', text: 'Time' }), h('span', { class: 'big-row' }, secs, of)),
      h('div', { class: 'big-stat' }, h('span', { class: 'val-label', text: 'Temperature' }), h('span', { class: 'big-row' }, temp, tempOf))),
    progress, stop, done);
  const el = h('div', { class: 'scrim scrim-light', hidden: true }, panel);
  let ticker = null;

  function update() {
    const u = S.utility;
    show(el, Boolean(u));
    if (!u) { clearInterval(ticker); ticker = null; return; }
    if (!ticker) ticker = setInterval(update, 250);
    const wf = S.workflow || {};
    const snap = S.snap || {};
    setText(title, TITLES[u.state] || 'Running');
    const elapsed = ((u.ended ? u.endedAt : Date.now()) - u.startedAt) / 1000;
    const limit = u.state === 'steam' ? Number(wf.steamSettings?.duration)
      : u.state === 'hotWater' ? Number(wf.hotWaterData?.duration) : Number(wf.rinseData?.duration);
    setText(secs, num(elapsed, 0));
    setText(of, limit > 0 ? `/ ${num(limit, 0)} s` : 's');
    const live = u.state === 'steam' ? snap.steamTemperature : snap.mixTemperature;
    const target = u.state === 'steam' ? wf.steamSettings?.targetTemperature
      : u.state === 'hotWater' ? wf.hotWaterData?.targetTemperature : wf.rinseData?.targetTemperature;
    setText(temp, Number.isFinite(Number(live)) && Number(live) > 0 ? deg(live) : '–');
    setText(tempOf, target ? `of ${deg(target)}` : '');
    show(progress, limit > 0);
    if (limit > 0) bar.style.width = `${Math.min(100, (elapsed / limit) * 100).toFixed(1)}%`;
    show(stop, !u.ended);
    show(done, u.ended);
    setAttr(panel, 'data-ended', u.ended);
  }

  return { el, update };
}
