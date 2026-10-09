import cfg from '../config.js';

// Build dim_time entries for a set of hour keys.
const SEASONS = {
  12: 'winter', 1: 'winter', 2: 'winter',
  3: 'spring', 4: 'spring', 5: 'spring',
  6: 'summer', 7: 'summer', 8: 'summer',
  9: 'autumn', 10: 'autumn', 11: 'autumn',
};

/**
 * Parse an ISO hour key "YYYY-MM-DDTHH" into a time dimension row.
 */
export function buildTimeDim(hourKey, holidays) {
  const [datePart, hourPart] = hourKey.split('T');
  const hour = parseInt(hourPart, 10);
  const d = new Date(`${datePart}T00:00:00Z`);
  const weekday = d.getUTCDay(); // 0=Sun
  const isWeekend = weekday === 0 || weekday === 6 ? 1 : 0;
  const month = d.getUTCMonth() + 1;
  const season = SEASONS[month] || 'unknown';
  const isHoliday = holidays.has(datePart) ? 1 : 0;

  return { hourKey, date: datePart, hour, weekday, isWeekend, month, season, isHoliday };
}

/**
 * Determine whether an hour is a peak hour.
 */
export function isPeakHour(hour) {
  return hour >= cfg.PEAK_START_HOUR && hour < cfg.PEAK_END_HOUR ? 1 : 0;
}

/**
 * Build a set of hourly aggregates from half-hourly slot readings.
 * readings: Array<{ slot: 0-47, kwh: number|null }>
 * Returns { kwh, qualityFlag } where qualityFlag is 'ok'|'partial'|'missing'.
 */
export function aggregateHour(readings) {
  const valid = readings.filter(r => r.kwh !== null);
  if (valid.length === 0) return null; // no fact row
  const kwh = valid.reduce((s, r) => s + r.kwh, 0);
  const qualityFlag = valid.length < readings.length ? 'partial' : 'ok';
  return { kwh, qualityFlag };
}

/**
 * Forward-fill a weather Map for missing hours.
 * Returns a new Map with filled entries and marks isForwardFilled=1.
 */
export function forwardFillWeather(weatherMap, allHourKeys) {
  const filled = new Map(weatherMap);
  let last = null;
  let fillCount = 0;

  const sorted = [...allHourKeys].sort();
  for (const hk of sorted) {
    if (filled.has(hk)) {
      last = { ...filled.get(hk), isForwardFilled: 0 };
      fillCount = 0;
    } else if (last && fillCount < 3) {
      filled.set(hk, { ...last, isForwardFilled: 1 });
      fillCount++;
    }
  }
  return filled;
}

/**
 * Compute the 99.9th percentile of an array of numbers.
 */
export function percentile999(values) {
  if (values.length === 0) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.999);
  return sorted[Math.min(idx, sorted.length - 1)];
}
