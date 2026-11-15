// Machine pet: a little espresso machine asleep on the counter. Its mood
// follows the real machine: thirsty when the tank is low, grumpy when the
// group needs cleaning, hungry when a bag is nearly empty, proud after a
// shot you liked. A tap makes it stir.

import { h, setText, setAttr } from '../../dom.js';
import { S, waterLabel, cleaningDue, shotsSinceClean, openBags, displayTitle, values } from '../../store.js';
import { timeText, dateText } from './common.js';

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const k of kids) if (k) el.append(k);
  return el;
}

function mood() {
  const w = waterLabel();
  if (w.level === 'empty' || w.level === 'low') return { key: 'thirsty', text: `Thirsty. The water tank is ${w.level === 'empty' ? 'empty' : 'low'}.` };
  if (cleaningDue()) return { key: 'grumpy', text: `A little grumpy: ${shotsSinceClean()} shots since the group was cleaned.` };
  const dose = values.dose() || 18;
  const low = openBags().find((b) => Number(b.batch.weightRemaining ?? b.batch.weight) < dose * 3);
  if (low) {
    const n = Math.floor(Number(low.batch.weightRemaining ?? 0) / dose);
    return { key: 'hungry', text: `Hungry. Only about ${n} ${n === 1 ? 'shot' : 'shots'} left of ${low.bean.name}.` };
  }
  const last = S.shots?.[0];
  const taste = last?.annotations?.extras?.mise?.taste;
  if (last && taste === 'Just right' && Date.now() - Date.parse(last.timestamp) < 18 * 3600 * 1000) {
    return { key: 'proud', text: 'Proud of today\'s shot. You said it was just right.' };
  }
  const recipe = displayTitle(S.workflow?.profile?.title);
  return { key: 'dreamy', text: recipe ? `Dreaming of your next ${recipe}.` : 'Dreaming of coffee.' };
}

export function createPet() {
  const clock = h('span', { class: 'pet-clock' });
  const date = h('span', { class: 'pet-date' });
  const say = h('p', { class: 'pet-say' });

  // The machine, drawn on a 16 px grid so it reads as pixel art.
  const eyesShut = svg('g', { class: 'eyes-shut' },
    svg('path', { d: 'M108 150 q12 10 24 0', class: 'pet-line' }), svg('path', { d: 'M168 150 q12 10 24 0', class: 'pet-line' }));
  const eyesOpen = svg('g', { class: 'eyes-open' },
    svg('rect', { x: 112, y: 140, width: 16, height: 18, rx: 3, class: 'pet-eye' }), svg('rect', { x: 172, y: 140, width: 16, height: 18, rx: 3, class: 'pet-eye' }));
  const brows = svg('g', { class: 'pet-brows' },
    svg('path', { d: 'M104 132 l26 8', class: 'pet-line' }), svg('path', { d: 'M196 132 l-26 8', class: 'pet-line' }));
  const blush = svg('g', { class: 'pet-blush' },
    svg('ellipse', { cx: 104, cy: 170, rx: 11, ry: 6 }), svg('ellipse', { cx: 196, cy: 170, rx: 11, ry: 6 }));
  const mouth = svg('path', { d: 'M140 178 q10 6 20 0', class: 'pet-line pet-mouth' });
  const sweat = svg('path', { d: 'M222 112 q8 14 0 20 q-8 -6 0 -20z', class: 'pet-sweat' });
  const bubble = svg('g', { class: 'pet-bubble' },
    svg('circle', { cx: 262, cy: 72, r: 6 }), svg('circle', { cx: 282, cy: 50, r: 10 }),
    svg('ellipse', { cx: 330, cy: 18, rx: 46, ry: 34 }));
  const thought = svg('g', { class: 'pet-thought' });
  const zzz = svg('g', { class: 'pet-zzz' },
    svg('text', { x: 236, y: 120, class: 'z z1' }, document.createTextNode('z')),
    svg('text', { x: 250, y: 96, class: 'z z2' }, document.createTextNode('z')),
    svg('text', { x: 266, y: 70, class: 'z z3' }, document.createTextNode('Z')));

  const body = svg('g', { class: 'pet-body' },
    svg('rect', { x: 64, y: 52, width: 176, height: 20, rx: 4, class: 'pet-top' }),
    svg('rect', { x: 84, y: 40, width: 22, height: 14, rx: 3, class: 'pet-cup' }),
    svg('rect', { x: 112, y: 36, width: 22, height: 18, rx: 3, class: 'pet-cup' }),
    svg('rect', { x: 56, y: 70, width: 192, height: 168, rx: 18, class: 'pet-shell' }),
    svg('rect', { x: 80, y: 104, width: 144, height: 96, rx: 14, class: 'pet-face' }),
    eyesShut, eyesOpen, brows, blush, mouth,
    svg('rect', { x: 128, y: 238, width: 48, height: 18, rx: 4, class: 'pet-group' }),
    svg('rect', { x: 118, y: 256, width: 68, height: 14, rx: 5, class: 'pet-basket' }),
    svg('rect', { x: 186, y: 258, width: 64, height: 10, rx: 5, class: 'pet-handle' }),
    svg('rect', { x: 40, y: 286, width: 224, height: 16, rx: 6, class: 'pet-tray' }),
    svg('rect', { x: 70, y: 302, width: 22, height: 12, rx: 3, class: 'pet-foot' }),
    svg('rect', { x: 212, y: 302, width: 22, height: 12, rx: 3, class: 'pet-foot' }),
    sweat);
  const art = svg('svg', { class: 'pet-art', viewBox: '0 -30 400 360', 'aria-hidden': 'true' },
    svg('ellipse', { cx: 152, cy: 318, rx: 130, ry: 10, class: 'pet-shadow' }), body, zzz, bubble, thought);

  const el = h('div', { class: 'sleep-style pet' },
    h('div', { class: 'pet-stars', 'aria-hidden': 'true' }),
    h('div', { class: 'pet-head drift' }, clock, date),
    h('div', { class: 'pet-scene' }, art, say));

  let wokeUntil = 0;
  let wakeTimer = null;
  let thoughtKey = '';

  function drawThought(key) {
    if (key === thoughtKey) return;
    thoughtKey = key;
    thought.replaceChildren();
    const at = (x, y, ...k) => svg('g', { transform: `translate(${x} ${y})` }, ...k);
    if (key === 'thirsty') thought.append(at(330, 18, svg('path', { d: 'M0 -20 q14 18 14 26 a14 14 0 0 1 -28 0 q0 -8 14 -26z', class: 'th-water' })));
    else if (key === 'grumpy') thought.append(at(330, 18, svg('circle', { cx: -12, cy: 4, r: 9, class: 'th-soap' }), svg('circle', { cx: 8, cy: -6, r: 12, class: 'th-soap' }), svg('circle', { cx: 16, cy: 12, r: 6, class: 'th-soap' })));
    else if (key === 'hungry') thought.append(at(330, 18, svg('ellipse', { rx: 16, ry: 22, transform: 'rotate(30)', class: 'th-bean' }), svg('path', { d: 'M-6 -16 q12 16 0 32', transform: 'rotate(30)', class: 'th-bean-line' })));
    else if (key === 'proud') thought.append(at(330, 18, svg('path', { d: 'M0 -22 l6 14 15 1 -12 9 4 15 -13 -8 -13 8 4 -15 -12 -9 15 -1z', class: 'th-star' })));
    else thought.append(at(330, 22, svg('path', { d: 'M-18 -12 h30 v14 a14 14 0 0 1 -14 14 h-2 a14 14 0 0 1 -14 -14z', class: 'th-cup' }), svg('path', { d: 'M12 -8 h5 a6 6 0 0 1 0 12 h-5', class: 'th-cup-line' }), svg('path', { d: 'M-8 -20 q4 -6 0 -12 M2 -20 q4 -6 0 -12', class: 'th-steam' })));
  }

  function tap() {
    wokeUntil = Date.now() + 3500;
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(update, 3600);
    update();
  }

  function update() {
    setText(clock, timeText());
    setText(date, dateText());
    const m = mood();
    const awake = Date.now() < wokeUntil;
    setAttr(el, 'data-mood', m.key);
    setAttr(el, 'data-awake', awake);
    drawThought(m.key);
    setText(say, awake ? 'Oh, hello! Hold anywhere to wake me up properly.' : m.text);
  }

  return { el, start() {}, stop() { clearTimeout(wakeTimer); }, update, tap };
}
