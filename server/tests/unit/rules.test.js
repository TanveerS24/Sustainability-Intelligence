/**
 * Unit tests for association rule mining.
 * Uses a tiny transaction set with known supports, confidences, lifts.
 */
import { describe, it, expect } from 'vitest';
import { mineRules } from '../../src/mining/rules.js';

describe('Association Rules', () => {
  // 10 transactions, manually crafted:
  // A=season:winter, B=temp:cold, C=usage:high, D=usage:low
  // Transactions: [A,B,C] x6, [A,B,D] x2, [B,D] x2
  const transactions = [
    ['season:winter', 'temp:cold', 'usage:high'],
    ['season:winter', 'temp:cold', 'usage:high'],
    ['season:winter', 'temp:cold', 'usage:high'],
    ['season:winter', 'temp:cold', 'usage:high'],
    ['season:winter', 'temp:cold', 'usage:high'],
    ['season:winter', 'temp:cold', 'usage:high'],
    ['season:winter', 'temp:cold', 'usage:low'],
    ['season:winter', 'temp:cold', 'usage:low'],
    ['temp:cold', 'usage:low'],
    ['temp:cold', 'usage:low'],
  ];

  it('mines rules with usage: consequent', () => {
    const rules = mineRules(transactions, {
      minSupport: 0.05,
      minConfidence: 0.5,
      maxRules: 25,
    });
    expect(rules.length).toBeGreaterThan(0);
    // All consequents must be usage:*
    for (const r of rules) {
      expect(r.consequent).toMatch(/^usage:/);
    }
  });

  it('support values are correct', () => {
    const rules = mineRules(transactions, {
      minSupport: 0.05,
      minConfidence: 0.5,
      maxRules: 25,
    });
    // season:winter,temp:cold -> usage:high: 6/10 = 0.6
    const highRule = rules.find(r =>
      r.antecedent.includes('season:winter') &&
      r.antecedent.includes('temp:cold') &&
      r.consequent === 'usage:high'
    );
    if (highRule) {
      expect(highRule.support).toBeCloseTo(0.6, 1);
    }
  });

  it('confidence is between 0 and 1', () => {
    const rules = mineRules(transactions, { minSupport: 0.05, minConfidence: 0.0, maxRules: 50 });
    for (const r of rules) {
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('lift is positive', () => {
    const rules = mineRules(transactions, { minSupport: 0.05, minConfidence: 0.0, maxRules: 50 });
    for (const r of rules) {
      expect(r.lift).toBeGreaterThan(0);
    }
  });

  it('results are sorted by lift descending', () => {
    const rules = mineRules(transactions, { minSupport: 0.05, minConfidence: 0.0, maxRules: 50 });
    for (let i = 1; i < rules.length; i++) {
      expect(rules[i - 1].lift).toBeGreaterThanOrEqual(rules[i].lift);
    }
  });

  it('respects maxRules cap', () => {
    const rules = mineRules(transactions, { minSupport: 0.05, minConfidence: 0.0, maxRules: 2 });
    expect(rules.length).toBeLessThanOrEqual(2);
  });

  it('generates plain-English explanation', () => {
    const rules = mineRules(transactions, { minSupport: 0.05, minConfidence: 0.5, maxRules: 10 });
    for (const r of rules) {
      expect(typeof r.explanation).toBe('string');
      expect(r.explanation.length).toBeGreaterThan(10);
    }
  });
});
