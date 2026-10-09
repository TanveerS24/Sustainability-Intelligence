/**
 * Synthetic data generator for demo mode and tests.
 * Produces realistic household electricity consumption data
 * with daily load shapes, temperature effects, Std/ToU tariffs,
 * multiple ACORN groups. Seeded for determinism.
 */
import { makeRng } from './sampler.js';

const SEED = 42;

const ACORN_GROUPS = ['Affluent', 'Comfortable', 'Adversity', 'ACORN-U'];
const TARIFFS = ['Std', 'ToU'];

// 24h base load shapes (kWh/hour, unnormalised)
const SHAPES = {
  evening_peak: [0.1,0.1,0.08,0.08,0.08,0.09,0.15,0.25,0.3,0.25,0.22,0.22,
                 0.22,0.2,0.2,0.22,0.35,0.55,0.7,0.65,0.5,0.35,0.2,0.12],
  morning_peak: [0.1,0.08,0.07,0.07,0.08,0.15,0.45,0.65,0.5,0.3,0.2,0.18,
                 0.2,0.18,0.18,0.2,0.3,0.35,0.3,0.25,0.2,0.18,0.15,0.12],
  flat:         [0.2,0.18,0.17,0.17,0.18,0.19,0.22,0.26,0.28,0.27,0.26,0.26,
                 0.25,0.25,0.25,0.26,0.29,0.32,0.33,0.31,0.28,0.25,0.23,0.21],
  night_heavy:  [0.4,0.38,0.35,0.33,0.3,0.28,0.15,0.12,0.1,0.1,0.1,0.12,
                 0.12,0.12,0.12,0.15,0.2,0.25,0.3,0.28,0.25,0.35,0.38,0.4],
  low_steady:   [0.06,0.05,0.05,0.05,0.05,0.06,0.08,0.12,0.13,0.12,0.11,0.11,
                 0.11,0.11,0.11,0.12,0.14,0.18,0.2,0.18,0.15,0.12,0.09,0.07],
};

const SHAPE_NAMES = Object.keys(SHAPES);
const SHAPE_ARRAYS = Object.values(SHAPES);

export function generateSyntheticData(opts = {}) {
  const {
    nHouseholds = 60,
    dateFrom = '2013-01-01',
    dateTo = '2013-03-31',
  } = opts;

  const rng = makeRng(SEED);
  const households = [];
  const readings = []; // { lclid, ts, kwh }

  // Generate households
  for (let i = 0; i < nHouseholds; i++) {
    const acornGroup = ACORN_GROUPS[Math.floor(rng() * ACORN_GROUPS.length)];
    const tariff = rng() < 0.2 ? 'ToU' : 'Std';
    const shapeIdx = Math.floor(rng() * SHAPE_NAMES.length);
    const baseMult = 0.5 + rng() * 1.5; // household scale factor
    const lclid = `SYN${String(i).padStart(6, '0')}`;
    households.push({
      lclid,
      tariff,
      acorn: `ACORN-${String.fromCharCode(65 + (i % 6))}`,
      acornGrouped: acornGroup,
      file: 'synthetic',
      shapeIdx,
      baseMult,
    });
  }

  // Generate hourly readings over date range
  const start = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T23:00:00Z`);

  for (const hh of households) {
    const shape = SHAPE_ARRAYS[hh.shapeIdx];
    let cursor = new Date(start);
    while (cursor <= end) {
      const month = cursor.getUTCMonth() + 1;
      const tempEffect = month <= 2 || month === 12 ? 1.3 : month <= 5 ? 1.1 : 0.9;
      const dayOfWeek = cursor.getUTCDay();
      const weekendMult = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.15 : 1.0;

      for (let hour = 0; hour < 24; hour++) {
        const base = shape[hour] * hh.baseMult * tempEffect * weekendMult;
        const noise = 1 + (rng() - 0.5) * 0.2;
        const kwh = Math.max(0, base * noise);

        const ds = cursor.toISOString().substring(0, 10);
        const hh2 = String(hour).padStart(2, '0');
        const ts = `${ds}T${hh2}:00`;

        // Occasionally introduce nulls (2%)
        readings.push({ lclid: hh.lclid, ts, kwh: rng() < 0.02 ? null : kwh });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return { households, readings };
}

/**
 * Generate synthetic weather for a date range.
 * Returns Map<"YYYY-MM-DDTHH", { temperature, humidity, tempBand }>
 */
export function generateSyntheticWeather(dateFrom = '2013-01-01', dateTo = '2013-03-31') {
  const rng = makeRng(SEED + 1);
  const result = new Map();
  const start = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T23:00:00Z`);
  let cursor = new Date(start);

  while (cursor <= end) {
    const month = cursor.getUTCMonth() + 1;
    const baseTemp = month <= 2 || month === 12 ? 5 : month <= 5 ? 12 : month <= 8 ? 18 : 10;
    const hour = cursor.getUTCHours();
    const diurnal = Math.sin((hour - 6) / 24 * Math.PI * 2) * 3;
    const temp = baseTemp + diurnal + (rng() - 0.5) * 4;
    const humidity = 0.6 + rng() * 0.3;
    const tempBand = temp < 8 ? 'cold' : temp < 16 ? 'mild' : 'warm';
    const key = cursor.toISOString().substring(0, 13);
    result.set(key, { temperature: temp, humidity, tempBand });
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }
  return result;
}

/** Generate holiday set for testing (just a few known dates) */
export function generateSyntheticHolidays() {
  return new Set(['2013-01-01', '2013-03-29', '2013-04-01']);
}
