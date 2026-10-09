/**
 * Unit tests for discretisation functions.
 */
import { describe, it, expect } from 'vitest';
import {
  monthToSeason, tempToBand, usageLevel, computePercentiles,
  peakShareBand, buildTransaction
} from '../../src/mining/discretise.js';

describe('monthToSeason', () => {
  it('maps December to winter', () => expect(monthToSeason(12)).toBe('winter'));
  it('maps January to winter', () => expect(monthToSeason(1)).toBe('winter'));
  it('maps March to spring', () => expect(monthToSeason(3)).toBe('spring'));
  it('maps June to summer', () => expect(monthToSeason(6)).toBe('summer'));
  it('maps October to autumn', () => expect(monthToSeason(10)).toBe('autumn'));
});

describe('tempToBand', () => {
  it('cold below 8', () => expect(tempToBand(5)).toBe('cold'));
  it('mild at 8', () => expect(tempToBand(8)).toBe('mild'));
  it('warm above 16', () => expect(tempToBand(20)).toBe('warm'));
  it('null returns null', () => expect(tempToBand(null)).toBeNull());
});

describe('usageLevel', () => {
  it('low below p33', () => expect(usageLevel(1, 3, 7)).toBe('usage:low'));
  it('medium between p33 and p67', () => expect(usageLevel(5, 3, 7)).toBe('usage:medium'));
  it('high above p67', () => expect(usageLevel(9, 3, 7)).toBe('usage:high'));
});

describe('computePercentiles', () => {
  it('returns p33 and p67', () => {
    const { p33, p67 } = computePercentiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(p33).toBeGreaterThan(0);
    expect(p67).toBeGreaterThan(p33);
  });

  it('handles empty array', () => {
    const { p33, p67 } = computePercentiles([]);
    expect(p33).toBe(0);
    expect(p67).toBe(0);
  });
});

describe('peakShareBand', () => {
  it('low when peak is less than 25%', () => expect(peakShareBand(0.1, 1.0)).toBe('peak_share:low'));
  it('medium when peak is 25-50%', () => expect(peakShareBand(0.3, 1.0)).toBe('peak_share:medium'));
  it('high when peak is above 50%', () => expect(peakShareBand(0.6, 1.0)).toBe('peak_share:high'));
  it('low when total is zero', () => expect(peakShareBand(0, 0)).toBe('peak_share:low'));
});

describe('buildTransaction', () => {
  it('returns array of strings', () => {
    const items = buildTransaction({
      weekday: 1, isHoliday: 0, season: 'winter', tempBand: 'cold',
      usageLvl: 'usage:high', peakShareBand: 'peak_share:high',
      tariff: 'Std', acornGroup: 'Affluent',
    });
    expect(Array.isArray(items)).toBe(true);
    expect(items.every(i => typeof i === 'string')).toBe(true);
  });

  it('includes daytype:weekday for weekday', () => {
    const items = buildTransaction({
      weekday: 2, isHoliday: 0, season: 'summer', tempBand: 'warm',
      usageLvl: 'usage:low', peakShareBand: 'peak_share:low',
      tariff: 'ToU', acornGroup: 'Comfortable',
    });
    expect(items).toContain('daytype:weekday');
  });

  it('includes daytype:holiday when isHoliday=1', () => {
    const items = buildTransaction({
      weekday: 2, isHoliday: 1, season: 'spring', tempBand: 'mild',
      usageLvl: 'usage:medium', peakShareBand: 'peak_share:medium',
      tariff: 'Std', acornGroup: 'Adversity',
    });
    expect(items).toContain('daytype:holiday');
  });
});
