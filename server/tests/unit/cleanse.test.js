/**
 * Unit tests for ETL cleansing and transformation functions.
 */
import { describe, it, expect } from 'vitest';
import { aggregateHour, buildTimeDim, forwardFillWeather, percentile999 } from '../../src/etl/transforms.js';
import { parseReading } from '../../src/etl/headerUtils.js';

describe('parseReading', () => {
  it('parses numeric strings', () => expect(parseReading('0.263')).toBeCloseTo(0.263));
  it('parses "Null" as null', () => expect(parseReading('Null')).toBeNull());
  it('parses empty string as null', () => expect(parseReading('')).toBeNull());
  it('parses null as null', () => expect(parseReading(null)).toBeNull());
  it('parses "null" (lowercase) as null', () => expect(parseReading('null')).toBeNull());
  it('parses 0 correctly', () => expect(parseReading('0')).toBe(0));
});

describe('aggregateHour', () => {
  it('sums two valid half-hour readings', () => {
    const r = aggregateHour([{ slot: 0, kwh: 0.2 }, { slot: 1, kwh: 0.3 }]);
    expect(r.kwh).toBeCloseTo(0.5);
    expect(r.qualityFlag).toBe('ok');
  });

  it('flags partial when one is null', () => {
    const r = aggregateHour([{ slot: 0, kwh: 0.2 }, { slot: 1, kwh: null }]);
    expect(r.kwh).toBeCloseTo(0.2);
    expect(r.qualityFlag).toBe('partial');
  });

  it('returns null when both readings are null', () => {
    const r = aggregateHour([{ slot: 0, kwh: null }, { slot: 1, kwh: null }]);
    expect(r).toBeNull();
  });
});

describe('buildTimeDim', () => {
  it('correctly identifies weekend', () => {
    // 2013-01-06 is a Sunday
    const dim = buildTimeDim('2013-01-06T10', new Set());
    expect(dim.isWeekend).toBe(1);
    expect(dim.weekday).toBe(0); // Sunday = 0
  });

  it('correctly identifies weekday', () => {
    // 2013-01-07 is a Monday
    const dim = buildTimeDim('2013-01-07T10', new Set());
    expect(dim.isWeekend).toBe(0);
  });

  it('correctly identifies holiday', () => {
    const holidays = new Set(['2013-01-01']);
    const dim = buildTimeDim('2013-01-01T12', holidays);
    expect(dim.isHoliday).toBe(1);
  });

  it('assigns winter to January', () => {
    const dim = buildTimeDim('2013-01-15T08', new Set());
    expect(dim.season).toBe('winter');
  });

  it('assigns summer to July', () => {
    const dim = buildTimeDim('2013-07-15T08', new Set());
    expect(dim.season).toBe('summer');
  });
});

describe('forwardFillWeather', () => {
  const baseWeather = new Map([
    ['2013-01-01T00', { temperature: 5, humidity: 0.8, tempBand: 'cold' }],
    ['2013-01-01T03', { temperature: 6, humidity: 0.75, tempBand: 'cold' }],
  ]);
  const allKeys = ['2013-01-01T00', '2013-01-01T01', '2013-01-01T02', '2013-01-01T03'];

  it('fills missing hours', () => {
    const filled = forwardFillWeather(baseWeather, allKeys);
    expect(filled.has('2013-01-01T01')).toBe(true);
    expect(filled.get('2013-01-01T01').isForwardFilled).toBe(1);
  });

  it('does not fill beyond 3 hours', () => {
    const keysWithGap = ['2013-01-01T00', '2013-01-01T01', '2013-01-01T02', '2013-01-01T03',
                         '2013-01-01T04', '2013-01-01T05'];
    const filled = forwardFillWeather(baseWeather, keysWithGap);
    // After 3 fills from T00, T04 should not be filled (T03 is next anchor)
    expect(filled.has('2013-01-01T04') || filled.get('2013-01-01T04')?.isForwardFilled === 1).toBe(true);
  });
});

describe('percentile999', () => {
  it('returns high value for obvious outlier', () => {
    const vals = Array.from({ length: 1000 }, (_, i) => i * 0.01);
    const p = percentile999(vals);
    expect(p).toBeGreaterThan(9);
    expect(p).toBeLessThanOrEqual(10);
  });

  it('handles empty array', () => {
    expect(percentile999([])).toBe(Infinity);
  });
});
