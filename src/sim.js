// A simulated Decaid gateway with a pretend machine and scale. It powers demo
// mode in the browser and the mock gateway used for testing (tools/). It
// answers the same REST paths and stream names the real gateway does, so the
// rest of the skin cannot tell the difference.
//
// No DOM access in this file: it also runs under Node.

import { deepMerge } from './format.js';

function step(name, pump, value, seconds, extra = {}) {
  return {
    name, pump, transition: 'fast', volume: 0, seconds, weight: 0,
    temperature: 93, sensor: 'coffee', [pump]: value, ...extra,
  };
}

function profile(title, notes, steps, extra = {}) {
  return {
    version: '2', title, author: 'Mise demo', notes, beverage_type: 'espresso', steps,
    target_volume: 0, target_weight: 36, target_volume_count_start: 0, tank_temperature: 0, ...extra,
  };
}

const overPressure = (value) => ({ exit: { type: 'pressure', condition: 'over', value } });

export const DEMO_PROFILES = [
  profile('Classic 9 bar', 'A gentle soak, then a steady 9 bar that eases off towards the end. A good everyday starting point for medium roasts.', [
    step('soak', 'flow', 4, 10, overPressure(4)),
    step('rise and hold', 'pressure', 9, 8),
    step('ease off', 'pressure', 6, 30, { transition: 'smooth' }),
  ]),
  profile('Soft 6 bar', 'Low pressure and a soft body. The easiest recipe to get right, and kind to darker roasts.', [
    step('soak', 'flow', 4, 12, { ...overPressure(3), temperature: 90 }),
    step('rise', 'pressure', 6, 8, { transition: 'smooth', temperature: 90 }),
    step('ease off', 'pressure', 4.5, 45, { transition: 'smooth', temperature: 88 }),
  ]),
  profile('Lever style', 'In the manner of a spring lever machine: a long quiet soak, a firm push, then pressure that falls away.', [
    step('fill', 'flow', 6, 8, overPressure(3)),
    step('soak', 'pressure', 3, 9),
    step('push', 'pressure', 9, 4),
    step('fall away', 'pressure', 5, 30, { transition: 'smooth' }),
  ], { target_weight: 38 }),
  profile('Bloom and pour', 'Wets the coffee, pauses so it can bloom, then pours at a steady flow. Made for light roasts.', [
    step('fill', 'flow', 4, 10, { ...overPressure(3), temperature: 95 }),
    step('bloom', 'flow', 0, 12, { temperature: 95 }),
    step('pour', 'flow', 2.2, 40, { temperature: 94, transition: 'smooth' }),
  ], { target_weight: 40 }),
  profile('Long and light', 'A long, light cup at high flow. Closer to filter coffee than to espresso.', [
    step('pour', 'flow', 4.5, 45, { temperature: 94 }),
  ], { target_weight: 72, beverage_type: 'pourover' }),
  profile('Group rinse cycle', 'Three short bursts of water to clean the group. Use with a blind basket and detergent.', [
    step('burst', 'flow', 6, 5),
    step('rest', 'flow', 0, 5),
    step('burst again', 'flow', 6, 5),
  ], { target_weight: 0, beverage_type: 'cleaning' }),
];

// The physics are a rough sketch, good enough to draw believable curves.
export class ShotSim {
  constructor(profileData, targetYield) {
    this.steps = profileData.steps.map((s) => ({
      ...s,
      seconds: Number(s.seconds) || 1,
      pressure: Number(s.pressure) || 0,
      flow: Number(s.flow) || 0,
      exit: s.exit ? { ...s.exit, value: Number(s.exit.value) } : null,
    }));
    this.target = Number(targetYield) || 0;
    this.t = 0;
    this.index = 0;
    this.stepT = 0;
    this.from = 0;
    this.p = 0;
    this.f = 0;
    this.sat = 0;
    this.w = 0;
    this.wf = 0;
    this.volume = 0;
    this.done = false;
  }

  tick(dt) {
    const s = this.steps[this.index];
    const blend = s.transition === 'smooth' ? Math.min(1, this.stepT / Math.max(1, Math.min(s.seconds, 10))) : 1;
    const resistance = 4.3 * (1 - 0.004 * this.t);
    let targetPressure = 0;
    let targetFlow = 0;
    if (s.pump === 'pressure') {
      targetPressure = this.from + (s.pressure - this.from) * blend;
      this.p += (targetPressure - this.p) * Math.min(1, dt / 0.7);
      const throughPuck = this.p / resistance;
      const filling = (1 - this.sat) * 5 * Math.min(1, this.p / 2 + 0.3);
      const want = this.sat < 1 ? Math.max(filling, throughPuck) : throughPuck;
      this.f += (want - this.f) * Math.min(1, dt / 0.5);
    } else {
      targetFlow = this.from + (s.flow - this.from) * blend;
      this.f += (targetFlow - this.f) * Math.min(1, dt / 0.4);
      const full = this.f * resistance;
      const want = Math.min(8.5, this.sat < 1 ? full * this.sat * this.sat * 0.6 : full);
      this.p += (want - this.p) * Math.min(1, dt / 0.6);
      // The pump cannot push more than the puck lets through at that pressure.
      if (this.sat >= 1 && this.f > 8.5 / resistance) this.f = 8.5 / resistance;
    }
    this.sat = Math.min(1, this.sat + (this.f * dt) / 28);
    const drip = this.sat >= 1 ? this.f * 0.93 : 0;
    this.wf += (drip - this.wf) * Math.min(1, dt / 1.2);
    this.w += this.wf * dt;
    this.volume += this.f * dt;
    this.t += dt;
    this.stepT += dt;

    let advance = this.stepT >= s.seconds;
    if (s.exit && this.stepT > 0.6) {
      const value = s.exit.type === 'pressure' ? this.p : this.f;
      if (s.exit.condition === 'over' ? value >= s.exit.value : value <= s.exit.value) advance = true;
    }
    const frame = this.index;
    if (advance) {
      this.index += 1;
      this.stepT = 0;
      if (this.index >= this.steps.length) {
        this.done = true;
        this.index = this.steps.length - 1;
      } else {
        this.from = this.steps[this.index].pump === 'pressure' ? this.p : this.f;
      }
    }
    if (this.target > 0 && this.w + this.wf * 0.6 >= this.target) this.done = true;
    if (this.t > 90) this.done = true;

    return {
      substate: this.sat < 1 ? 'preinfusion' : 'pouring',
      pressure: this.p, flow: this.f, targetPressure, targetFlow,
      weight: this.w, weightFlow: this.wf, frame, temperature: Number(s.temperature) || 93,
    };
  }
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const iso = (ms) => new Date(ms).toISOString();

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function createSim(options = {}) {
  const now = () => Date.now();
  const subscribers = new Map();
  const kv = new Map();
  const persist = options.storage || null;
  if (persist) {
    try {
      for (const [key, value] of Object.entries(JSON.parse(persist.getItem('miseDemoStore') || '{}'))) kv.set(key, value);
    } catch { /* start empty */ }
  }

  const profiles = DEMO_PROFILES.map((p, i) => ({
    id: `profile:demo${i + 1}`, profile: clone(p), parentId: null,
    // One user-made recipe, so both kinds of rename can be tried in the demo.
    visibility: 'visible', isDefault: p.title !== 'Long and light', metadata: {},
  }));

  let workflow = {
    id: 'demo-workflow', name: 'Demo', description: '',
    profile: clone(DEMO_PROFILES[0]),
    context: {
      targetDoseWeight: 18, targetYield: 36, grinderModel: 'Demo grinder', grinderSetting: '12',
      coffeeName: 'Ethiopia Guji, washed', coffeeRoaster: 'Demo roaster', finalBeverageType: 'espresso',
    },
    steamSettings: { targetTemperature: 150, duration: 45, flow: 0.8 },
    hotWaterData: { targetTemperature: 90, duration: 30, volume: 120, flow: 6 },
    rinseData: { targetTemperature: 90, duration: 5, flow: 6 },
  };

  let settings = {
    gatewayMode: 'tracking', logLevel: 'INFO', weightFlowMultiplier: 1, volumeFlowMultiplier: 0.3,
    hotWaterFlowMultiplier: 0.3, scalePowerMode: 'disconnect', blockOnNoScale: false,
    blockTareDuringShot: false, stopHotWaterAtWeight: true, themeMode: 'system',
  };
  let presence = { userPresenceEnabled: true, sleepTimeoutMinutes: 30 };
  const display = {
    wakeLockEnabled: true, wakeLockOverride: false, brightness: 100, requestedBrightness: 100,
    lowBatteryBrightnessActive: false, platformSupported: { brightness: true, wakeLock: true },
  };

  const machine = {
    ghc: options.ghc !== false,
    state: 'idle', substate: 'idle',
    pressure: 0, flow: 0, targetPressure: 0, targetFlow: 0,
    group: 93, steam: 148, frame: 0,
    water: 62, refill: 10,
    weight: 0, weightFlow: 0,
    shot: null, measurements: [], shotStart: 0, shotId: null,
    op: null, drip: 0, cooldown: 0,
  };

  const shots = seedHistory();

  function seedHistory() {
    const plan = [
      { hoursAgo: 23.9, p: 0, yield: 36, grind: '12.5' },
      { hoursAgo: 40.5, p: 1, yield: 38, grind: '12.5' },
      { hoursAgo: 48.1, p: 0, yield: 36, grind: '13' },
      { hoursAgo: 71.8, p: 2, yield: 38, grind: '13' },
      { hoursAgo: 96.2, p: 2, yield: 38, grind: '13' },
      { hoursAgo: 120.0, p: 3, yield: 40, grind: '13.5' },
    ];
    return plan.map((item) => {
      const start = now() - item.hoursAgo * 3600 * 1000;
      const sim = new ShotSim(DEMO_PROFILES[item.p], item.yield);
      const measurements = [];
      let t = 0;
      while (!sim.done) {
        const s = sim.tick(0.1);
        t += 0.1;
        if (Math.round(t * 10) % 2) continue;
        const ts = iso(start + t * 1000);
        measurements.push({
          machine: { timestamp: ts, state: { state: 'espresso', substate: s.substate }, flow: s.flow, pressure: s.pressure, mixTemperature: s.temperature, profileFrame: s.frame },
          scale: { timestamp: ts, weight: s.weight, weightFlow: s.weightFlow },
          volume: sim.volume,
        });
      }
      return {
        id: `shot-${iso(start)}`,
        timestamp: iso(start),
        measurements,
        workflow: {
          name: 'Demo',
          profile: clone(DEMO_PROFILES[item.p]),
          context: { ...workflow.context, targetYield: item.yield, grinderSetting: item.grind },
        },
        annotations: { actualDoseWeight: 18, actualYield: Math.round((sim.w + 1.1) * 10) / 10 },
        stopReason: 'targetWeight',
      };
    });
  }

  function publish(path, message) {
    for (const fn of subscribers.get(path) || []) fn(message);
  }

  function snapshot() {
    return {
      timestamp: iso(now()),
      state: { state: machine.state, substate: machine.substate },
      flow: machine.flow, pressure: machine.pressure,
      targetFlow: machine.targetFlow, targetPressure: machine.targetPressure,
      mixTemperature: machine.group - 0.4, groupTemperature: machine.group,
      targetMixTemperature: 93, targetGroupTemperature: Number(workflow.profile.steps[0]?.temperature) || 93,
      profileFrame: machine.frame, steamTemperature: machine.steam,
    };
  }

  function devices() {
    return [
      { name: 'DE1 (demo)', id: 'DE:MO:00:00:00:01', state: 'connected', type: 'machine', available: true },
      { name: 'Scale (demo)', id: 'DE:MO:00:00:00:02', state: 'connected', type: 'scale', available: true, connectionRole: 'primary' },
    ];
  }

  function devicesState() {
    return { timestamp: iso(now()), devices: devices(), scanning: false, connectionStatus: { phase: 'ready', error: null } };
  }

  function shotState(state) {
    publish('/ws/v1/machine/shotState', {
      event: 'state', timestamp: iso(now()), shotId: machine.shotId, state,
      machineState: machine.state, machineSubstate: machine.substate, profileFrame: machine.frame,
      scaleConnected: true, scaleLost: false, machineHasAutonomousSAW: false, decision: null,
    });
  }

  function toIdle() {
    machine.state = 'idle';
    machine.substate = 'idle';
    machine.pressure = machine.flow = machine.targetPressure = machine.targetFlow = 0;
    machine.frame = 0;
    machine.op = null;
  }

  function startShot() {
    machine.state = 'espresso';
    machine.substate = 'preparingForShot';
    machine.shot = new ShotSim(workflow.profile, workflow.context?.targetYield);
    machine.measurements = [];
    machine.shotStart = now();
    machine.shotId = `shot-${iso(machine.shotStart)}`;
    machine.op = { kind: 'prep', left: 1.5 };
    machine.weight = 0;
    machine.weightFlow = 0;
    shotState('preheating');
  }

  function endShot() {
    if (machine.state !== 'espresso') return;
    const poured = machine.measurements.length > 20;
    machine.substate = 'pouringDone';
    machine.op = { kind: 'done', left: 1 };
    machine.drip = poured ? 1.1 : 0;
    machine.weightFlow = 0;
    shotState('stopping');
    if (!poured) { machine.shotId = null; return; }
    const record = {
      id: machine.shotId,
      timestamp: iso(machine.shotStart),
      measurements: machine.measurements,
      workflow: clone(workflow),
      annotations: { actualDoseWeight: workflow.context?.targetDoseWeight ?? null, actualYield: null },
      stopReason: 'targetWeight',
    };
    setTimeout(() => {
      record.annotations.actualYield = Math.round(machine.weight * 10) / 10;
      shots.unshift(record);
      machine.shotId = null;
      shotState('idle');
    }, 2500);
  }

  function startTimed(state, seconds) {
    machine.state = state;
    machine.substate = 'pouring';
    machine.op = { kind: state, left: seconds };
    if (state === 'hotWater') machine.weight = 0;
  }

  function begin(target) {
    if (machine.state !== 'idle') return;
    if (target === 'espresso') startShot();
    else if (target === 'steam') startTimed('steam', Number(workflow.steamSettings?.duration) || 30);
    else if (target === 'hotWater') startTimed('hotWater', Math.min(Number(workflow.hotWaterData?.duration) || 30, (Number(workflow.hotWaterData?.volume) || 100) / 6));
    else if (target === 'flush') startTimed('flush', Number(workflow.rinseData?.duration) || 5);
  }

  function tick() {
    const dt = 0.1;
    const op = machine.op;
    if (machine.state === 'espresso' && op) {
      if (op.kind === 'prep') {
        op.left -= dt;
        if (op.left <= 0) { machine.op = { kind: 'pour' }; shotState('pouring'); }
      } else if (op.kind === 'pour') {
        const s = machine.shot.tick(dt);
        Object.assign(machine, {
          substate: s.substate, pressure: s.pressure, flow: s.flow,
          targetPressure: s.targetPressure, targetFlow: s.targetFlow,
          weight: s.weight, weightFlow: s.weightFlow, frame: s.frame,
        });
        const snap = snapshot();
        machine.measurements.push({
          machine: snap,
          scale: { timestamp: snap.timestamp, weight: s.weight, weightFlow: s.weightFlow },
          volume: machine.shot.volume,
        });
        machine.water = Math.max(12, machine.water - s.flow * dt * 0.02);
        if (machine.shot.done) endShot();
      } else if (op.kind === 'done') {
        op.left -= dt;
        machine.pressure *= 0.6;
        machine.flow *= 0.5;
        if (op.left <= 0) toIdle();
      }
    } else if (op && (op.kind === 'steam' || op.kind === 'hotWater' || op.kind === 'flush')) {
      op.left -= dt;
      if (op.kind === 'hotWater') { machine.flow = 6; machine.weight += 6 * dt; }
      if (op.kind === 'flush') machine.flow = 6;
      if (op.kind === 'steam') machine.pressure = 1.4;
      if (op.left <= 0) toIdle();
    } else if (machine.state === 'heating') {
      machine.group = Math.min(93, machine.group + 0.25);
      if (machine.group >= 92.5) toIdle();
    }
    if (machine.drip > 0) {
      const add = Math.min(machine.drip, 0.04);
      machine.drip -= add;
      machine.weight += add;
    }
    publish('/ws/v1/machine/snapshot', snapshot());
    publish('/ws/v1/scale/snapshot', { timestamp: iso(now()), weight: Math.round(machine.weight * 10) / 10, weightFlow: machine.weightFlow, battery: 84, timerValue: null });
  }

  let waterTicks = 0;
  const timer = setInterval(() => {
    tick();
    if (++waterTicks % 20 === 0) publish('/ws/v1/machine/waterLevels', { currentLevel: machine.water, refillLevel: machine.refill });
  }, 100);
  if (timer.unref) timer.unref();

  function listItem(shot) {
    const { measurements, ...rest } = shot;
    return rest;
  }

  async function request(method, fullPath, body) {
    await new Promise((resolve) => setTimeout(resolve, 30));
    const [path, query = ''] = fullPath.split('?');
    const params = new URLSearchParams(query);
    const route = `${method} ${path}`;
    const parts = path.split('/').filter(Boolean).slice(2);

    if (route === 'GET /api/v1/devices' || route === 'GET /api/v1/devices/scan') return devices();
    if (route === 'GET /api/v1/machine/info') return { version: 'demo', model: 'DE1 (simulated)', serialNumber: 'DEMO-0001', GHC: machine.ghc, extra: {} };
    if (route === 'GET /api/v1/machine/state') return snapshot();
    if (route === 'GET /api/v1/machine/waterLevels') return { currentLevel: machine.water, refillLevel: machine.refill };
    if (route === 'POST /api/v1/machine/heartbeat') return { timeout: 1800 };
    if (route === 'GET /api/v1/settings') return clone(settings);
    if (route === 'POST /api/v1/settings') { settings = { ...settings, ...(body || {}) }; return clone(settings); }
    if (route === 'GET /api/v1/presence/settings') return { ...presence, schedules: [] };
    if (route === 'POST /api/v1/presence/settings') { presence = { ...presence, ...(body || {}) }; return clone(presence); }
    if (route === 'GET /api/v1/display') return clone(display);
    if (route === 'PUT /api/v1/display/brightness') {
      const value = Number(body?.brightness);
      if (!(value >= 0 && value <= 100)) throw httpError(400, 'brightness must be 0-100');
      display.brightness = display.requestedBrightness = value;
      return clone(display);
    }
    if (route === 'GET /api/v1/info') return { version: 'demo', fullVersion: 'demo', commitShort: 'demo', branch: 'demo' };
    if (route === 'GET /api/v1/workflow') return clone(workflow);
    if (route === 'PUT /api/v1/workflow') {
      if (body?.context === null) throw httpError(400, 'context must not be null');
      workflow = deepMerge(workflow, body || {});
      return clone(workflow);
    }
    if (route === 'GET /api/v1/profiles') return clone(profiles);
    if (method === 'PUT' && parts[0] === 'profiles' && parts.length === 2) {
      const record = profiles.find((r) => r.id === decodeURIComponent(parts[1]));
      if (!record) throw httpError(400, 'Profile not found');
      if (record.isDefault && body?.profile) throw httpError(400, 'Cannot modify default profile content');
      if (body?.profile) record.profile = clone(body.profile);
      return clone(record);
    }
    if (route === 'PUT /api/v1/scale/tare') { machine.weight = 0; return null; }
    if (method === 'PUT' && parts[0] === 'machine' && parts[1] === 'state') {
      const target = parts[2];
      if (target === 'idle') {
        if (machine.state === 'espresso') endShot();
        else if (machine.state === 'sleeping') { machine.state = 'heating'; machine.substate = 'idle'; machine.group = 84; }
        else if (machine.state !== 'heating') toIdle();
      } else if (target === 'sleeping') {
        if (machine.state === 'espresso') throw httpError(400, 'busy');
        toIdle();
        machine.state = 'sleeping';
      } else if (['espresso', 'steam', 'hotWater', 'flush'].includes(target)) {
        // With group-head buttons the firmware ignores a remote start.
        if (!machine.ghc) begin(target);
      } else {
        throw httpError(400, 'unknown state');
      }
      return null;
    }
    if (parts[0] === 'shots') {
      if (method === 'GET' && parts.length === 1) {
        const limit = Number(params.get('limit')) || 20;
        const offset = Number(params.get('offset')) || 0;
        return { items: shots.slice(offset, offset + limit).map(listItem), total: shots.length, limit, offset };
      }
      if (method === 'GET' && parts[1] === 'latest') {
        if (!shots.length) throw httpError(404, 'no shots');
        return listItem(shots[0]);
      }
      const shot = shots.find((s) => s.id === decodeURIComponent(parts[1] || ''));
      if (!shot) throw httpError(404, 'shot not found');
      if (method === 'GET') return clone(shot);
      if (method === 'PUT') {
        shot.annotations = deepMerge(shot.annotations || {}, body?.annotations || {});
        return clone(shot);
      }
    }
    if (parts[0] === 'store' && parts.length === 3) {
      const key = `${parts[1]}/${parts[2]}`;
      if (method === 'GET') {
        if (!kv.has(key)) throw httpError(404, 'no such key');
        return clone(kv.get(key));
      }
      if (method === 'POST') {
        kv.set(key, clone(body));
        if (persist) {
          try { persist.setItem('miseDemoStore', JSON.stringify(Object.fromEntries(kv))); } catch { /* ignore */ }
        }
        return null;
      }
    }
    throw httpError(404, `No demo route for ${route}`);
  }

  function stream(path, onMessage) {
    if (!subscribers.has(path)) subscribers.set(path, new Set());
    subscribers.get(path).add(onMessage);
    setTimeout(() => {
      if (path === '/ws/v1/devices') onMessage(devicesState());
      if (path === '/ws/v1/scale/snapshot') onMessage({ status: 'connected' });
      if (path === '/ws/v1/machine/waterLevels') onMessage({ currentLevel: machine.water, refillLevel: machine.refill });
    }, 0);
    return () => subscribers.get(path)?.delete(onMessage);
  }

  return {
    request, stream, host: 'demo', demo: true,
    // Stand-ins for the physical buttons on the machine.
    press(target) {
      if (target === 'stop') {
        if (machine.state === 'espresso') endShot(); else toIdle();
      } else {
        begin(target);
      }
    },
    setGhc(value) { machine.ghc = Boolean(value); },
    get ghc() { return machine.ghc; },
  };
}
