/**
 * Discretisation — maps household-day features to item strings for association rules.
 * Items only from available data (no appliance items).
 */
import cfg from '../config.js';

/**
 * Determine season from month number.
 */
export function monthToSeason(month) {
  if (month <= 2 || month === 12) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

/**
 * Map temperature to band.
 */
export function tempToBand(temp) {
  if (temp === null || temp === undefined) return null;
  if (temp < cfg.TEMP_COLD_MAX) return 'cold';
  if (temp < cfg.TEMP_MILD_MAX) return 'mild';
  return 'warm';
}

/**
 * Discretise daily kWh into usage level (low/medium/high)
 * relative to the household's own distribution (p33/p67).
 */
export function usageLevel(kwh, p33, p67) {
  if (kwh <= p33) return 'usage:low';
  if (kwh <= p67) return 'usage:medium';
  return 'usage:high';
}

/**
 * Compute p33 and p67 percentiles from an array of values.
 */
export function computePercentiles(values) {
  if (values.length === 0) return { p33: 0, p67: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const p33 = sorted[Math.floor(sorted.length * 0.33)];
  const p67 = sorted[Math.floor(sorted.length * 0.67)];
  return { p33, p67 };
}

/**
 * Compute peak-share band: low (<25%), medium (25-50%), high (>50%).
 */
export function peakShareBand(peakKwh, totalKwh) {
  if (!totalKwh || totalKwh === 0) return 'peak_share:low';
  const share = peakKwh / totalKwh;
  if (share < 0.25) return 'peak_share:low';
  if (share < 0.50) return 'peak_share:medium';
  return 'peak_share:high';
}

/**
 * Build a transaction (set of items) for a household-day.
 */
export function buildTransaction(opts) {
  const {
    weekday, isHoliday, season, tempBand,
    usageLvl, peakShareBand: psb, tariff, acornGroup
  } = opts;

  const items = new Set();

  // Day type
  if (weekday === 0 || weekday === 6) items.add('daytype:weekend');
  else items.add('daytype:weekday');
  if (isHoliday) items.add('daytype:holiday');

  // Season
  items.add(`season:${season}`);

  // Temperature band
  if (tempBand) items.add(`temp:${tempBand}`);

  // Usage level
  if (usageLvl) items.add(usageLvl);

  // Peak share
  if (psb) items.add(psb);

  // Tariff
  if (tariff) items.add(`tariff:${tariff.toLowerCase()}`);

  // ACORN group (first word)
  if (acornGroup) {
    const grp = acornGroup.split(/[\s-]/)[0].toLowerCase();
    items.add(`acorn:${grp}`);
  }

  return [...items];
}
