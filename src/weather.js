// Weather for the sleep screen, from Open-Meteo (open-meteo.com). No account
// or key is needed. The only thing sent is the latitude and longitude of the
// city chosen in Settings. Data is licensed CC BY 4.0, hence the credit line
// on the sleep screen.

// WMO weather codes, grouped into the scenes the sleep screen can draw.
const CODES = [
  [[0], 'clear', 'Clear'],
  [[1], 'clear', 'Mostly clear'],
  [[2], 'partly', 'Partly cloudy'],
  [[3], 'cloudy', 'Overcast'],
  [[45, 48], 'fog', 'Fog'],
  [[51, 53, 55, 56, 57], 'drizzle', 'Drizzle'],
  [[61, 63, 65, 66, 67], 'rain', 'Rain'],
  [[80, 81, 82], 'rain', 'Showers'],
  [[71, 73, 75, 77], 'snow', 'Snow'],
  [[85, 86], 'snow', 'Snow showers'],
  [[95, 96, 99], 'storm', 'Thunderstorm'],
];

export function describe(code) {
  for (const [codes, kind, label] of CODES) {
    if (codes.includes(Number(code))) return { kind, label };
  }
  return { kind: 'cloudy', label: 'Cloudy' };
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Weather request failed with ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWeather(place) {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,weather_code,is_day',
    daily: 'temperature_2m_max,temperature_2m_min,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '2',
  });
  if (place.unit === 'f') params.set('temperature_unit', 'fahrenheit');
  const data = await getJson(`https://api.open-meteo.com/v1/forecast?${params}`);
  const current = data?.current || {};
  if (typeof current.temperature_2m !== 'number') throw new Error('Weather response had no temperature');
  const num = (v) => (typeof v === 'number' ? v : null);
  return {
    ...describe(current.weather_code),
    temp: current.temperature_2m,
    isDay: current.is_day !== 0,
    hi: num(data.daily?.temperature_2m_max?.[0]),
    lo: num(data.daily?.temperature_2m_min?.[0]),
    // Local times for today and tomorrow, as "2026-11-15T07:01".
    sunrise: (data.daily?.sunrise || []).filter(Boolean),
    sunset: (data.daily?.sunset || []).filter(Boolean),
    tempC: place.unit === 'f' ? (current.temperature_2m - 32) * 5 / 9 : current.temperature_2m,
    place: place.name,
    at: Date.now(),
  };
}

export async function searchPlaces(query) {
  const params = new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' });
  const data = await getJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  return (data?.results || [])
    .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
    .map((r) => ({
      name: r.name,
      region: [r.admin1, r.country].filter(Boolean).join(', '),
      latitude: r.latitude,
      longitude: r.longitude,
    }));
}

// ── Demo mode: no network, a fixed set of skies to step through ──

const DEMO = [
  { code: 0, temp: -4, isDay: false, hi: 1, lo: -7 },
  { code: 71, temp: -2, isDay: true, hi: 1, lo: -6 },
  { code: 0, temp: 21, isDay: true, hi: 24, lo: 13 },
  { code: 2, temp: 17, isDay: true, hi: 19, lo: 11 },
  { code: 63, temp: 9, isDay: true, hi: 11, lo: 6 },
  { code: 95, temp: 18, isDay: false, hi: 24, lo: 16 },
  { code: 45, temp: 4, isDay: true, hi: 8, lo: 2 },
  { code: 0, temp: 12, isDay: false, hi: 19, lo: 9 },
  { code: 3, temp: 6, isDay: false, hi: 9, lo: 3 },
];

export function demoWeather(index, unit) {
  const d = DEMO[index % DEMO.length];
  const t = (c) => (unit === 'f' ? Math.round(c * 9 / 5 + 32) : c);
  const day = (offset, hh, mm) => {
    const x = new Date();
    x.setDate(x.getDate() + offset);
    x.setHours(hh, mm, 0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(hh)}:${pad(mm)}`;
  };
  return {
    ...describe(d.code), temp: t(d.temp), tempC: d.temp, isDay: d.isDay, hi: t(d.hi), lo: t(d.lo), place: 'Demo city', at: Date.now(),
    sunrise: [day(0, 7, 2), day(1, 7, 3)], sunset: [day(0, 16, 51), day(1, 16, 50)],
  };
}

export async function demoPlaces(query) {
  const places = [
    { name: 'Toronto', region: 'Ontario, Canada', latitude: 43.70011, longitude: -79.4163 },
    { name: 'Vancouver', region: 'British Columbia, Canada', latitude: 49.24966, longitude: -123.11934 },
    { name: 'London', region: 'England, United Kingdom', latitude: 51.50853, longitude: -0.12574 },
    { name: 'Tokyo', region: 'Tokyo, Japan', latitude: 35.6895, longitude: 139.69171 },
  ];
  const q = String(query || '').trim().toLowerCase();
  return places.filter((p) => !q || p.name.toLowerCase().includes(q));
}
