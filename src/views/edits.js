// Every editable number, described once, so any card can open the ruler
// for it. Temperatures are stored in °C and shown in the chosen unit.

import {
  S, values, setDose, setOut, setTemp, setGrind, setSteam, setHotWater, setRinse, openEditor, toast,
} from '../store.js';
import { toShown, fromShown, tempUnit, trimNum } from '../format.js';

export function tempSpec({ label, hint, c, min, max, presets = [], save }) {
  const f = tempUnit() === 'f';
  const step = f ? 1 : 0.5;
  return {
    label, hint, unit: f ? '°F' : '°C',
    value: toShown(c),
    min: Math.round(toShown(min)), max: Math.round(toShown(max)),
    step, major: f ? 5 : 10, digits: f ? 0 : 1,
    format: (v) => (f ? String(Math.round(v)) : trimNum(v)),
    presets: presets.map((p) => ({ label: p.label, value: Math.round(toShown(p.c) / step) * step, detail: p.detail })),
    save: (v) => save(fromShown(v)),
  };
}

const steam = () => S.workflow?.steamSettings || {};
const hot = () => S.workflow?.hotWaterData || {};
const rinse = () => S.workflow?.rinseData || {};

export const edit = {
  temp() {
    const c = values.temp();
    if (c == null) { toast('Load a recipe first.'); return; }
    openEditor(tempSpec({
      label: 'Brew temperature', c, min: 75, max: 100,
      hint: 'Moves every step of the recipe by the same amount.',
      presets: [{ label: 'Dark', c: 88 }, { label: 'Medium', c: 92 }, { label: 'Light', c: 95 }],
      save: setTemp,
    }));
  },
  grind() {
    const g = Number(values.grind());
    openEditor({
      label: 'Grinder setting', hint: 'Kept with each shot so you can find it again.',
      value: Number.isFinite(g) ? g : 10, min: 0, max: Math.max(60, Math.ceil((g || 0) / 10) * 10 + 20),
      step: 0.1, major: 10, digits: 1, format: (v) => trimNum(v), save: setGrind,
    });
  },
  dose() {
    openEditor({
      label: 'Coffee in', unit: 'g', value: values.dose() || 18, min: 5, max: 30, step: 0.1, major: 10, digits: 1,
      presets: [{ label: 'Single', value: 9 }, { label: 'Double', value: 18 }, { label: 'Triple', value: 21 }],
      save: setDose,
    });
  },
  out() {
    const dose = values.dose() || 18;
    const r = (x) => Math.round(dose * x);
    openEditor({
      label: 'Espresso out', unit: 'g', hint: 'The shot stops by itself at this weight. Set 0 to stop it yourself.',
      // Decaid sets no upper limit; 1000 g covers long drinks and filter.
      value: values.out(), min: 0, max: 1000, step: 1, major: 10, digits: 0,
      presets: [
        { label: 'Ristretto', value: r(1.5), detail: '1 : 1.5' },
        { label: 'Normale', value: r(2), detail: '1 : 2' },
        { label: 'Lungo', value: r(3), detail: '1 : 3' },
        { label: 'Allongé', value: r(5), detail: '1 : 5' },
        { label: 'Filter', value: r(16), detail: '1 : 16' },
      ],
      save: setOut,
    });
  },
  waterVolume() {
    openEditor({
      label: 'Hot water amount', unit: 'ml', value: Number(hot().volume) || 120, min: 10, max: 500, step: 10, major: 5, digits: 0,
      presets: [{ label: 'Cup', value: 60 }, { label: 'Americano', value: 120 }, { label: 'Tea', value: 250 }],
      save: (v) => setHotWater({ volume: Math.round(v) }),
    });
  },
  waterTemp() {
    openEditor(tempSpec({
      label: 'Hot water temperature', c: Number(hot().targetTemperature) || 90, min: 40, max: 100,
      presets: [{ label: 'Green tea', c: 80 }, { label: 'Americano', c: 90 }, { label: 'Black tea', c: 96 }],
      save: (c) => setHotWater({ targetTemperature: Math.round(c) }),
    }));
  },
  steamTemp() {
    openEditor(tempSpec({
      label: 'Steam temperature', hint: 'Hotter steam is drier and faster.', c: Number(steam().targetTemperature) || 150, min: 130, max: 170,
      save: (c) => setSteam({ targetTemperature: Math.round(c) }),
    }));
  },
  steamTime() {
    openEditor({
      label: 'Steam stops after', unit: 's', value: Number(steam().duration) || 45, min: 5, max: 120, step: 1, major: 10, digits: 0,
      presets: [{ label: 'Small jug', value: 30 }, { label: 'Medium jug', value: 45 }, { label: 'Large jug', value: 60 }],
      save: (v) => setSteam({ duration: Math.round(v) }),
    });
  },
  steamFlow() {
    openEditor({
      label: 'Steam flow', unit: 'ml/s', hint: 'Lower flow is gentler, for small jugs.',
      value: Number(steam().flow) || 0.8, min: 0.4, max: 2.5, step: 0.1, major: 5, digits: 1,
      save: (v) => setSteam({ flow: Math.round(v * 10) / 10 }),
    });
  },
  flushTime() {
    openEditor({
      label: 'Flush runs for', unit: 's', value: Number(rinse().duration) || 5, min: 1, max: 30, step: 1, major: 5, digits: 0,
      save: (v) => setRinse({ duration: Math.round(v) }),
    });
  },
};
