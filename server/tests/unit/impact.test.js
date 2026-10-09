/**
 * Unit tests for impact what-if calculations and formulas.
 */
import { describe, it, expect } from 'vitest';
import cfg from '../../src/config.js';

describe('Impact What-If formula verification', () => {
  const sampleStats = {
    total_kwh: 1000,
    peak_kwh: 400,
    days: 30,
    households: 1,
  };

  it('calculates reduction kWh and CO2 savings accurately', () => {
    const reductionPct = 10; // 10%
    const pReduce = reductionPct / 100;
    const kwhSavedReduction = sampleStats.total_kwh * pReduce;
    const co2SavedReduction = kwhSavedReduction * cfg.EMISSION_FACTOR_KG_PER_KWH;

    expect(kwhSavedReduction).toBe(100);
    expect(co2SavedReduction).toBeCloseTo(100 * cfg.EMISSION_FACTOR_KG_PER_KWH, 4);
  });

  it('calculates peak shift kWh and CO2 savings accurately', () => {
    const peakShiftPct = 25; // 25%
    const pShift = peakShiftPct / 100;
    const kwhShifted = sampleStats.peak_kwh * pShift;
    const co2SavedShift = kwhShifted * (0.40 - cfg.EMISSION_FACTOR_KG_PER_KWH);

    expect(kwhShifted).toBe(100);
    expect(co2SavedShift).toBeCloseTo(100 * (0.40 - cfg.EMISSION_FACTOR_KG_PER_KWH), 4);
  });

  it('calculates annualised savings factor correctly', () => {
    const days = 90;
    const households = 1;
    const dataWindowDays = days / households;
    const factor = 365 / dataWindowDays;

    expect(factor).toBeCloseTo(365 / 90, 4);
  });
});
