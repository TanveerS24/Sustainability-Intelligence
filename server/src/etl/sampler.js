import cfg from '../config.js';

// Seeded LCG pseudo-random number generator (reproducible)
export function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = Math.imul(1664525, s) + 1013904223 >>> 0;
    return s / 4294967296;
  };
}

/**
 * Stratified deterministic sample of households.
 * Stratifies by tariff × acorn_grouped.
 * Excludes households with fewer than minReadings valid readings in window.
 *
 * @param {Map} hhInfo  Map<lclid, { tariff, acorn, acornGrouped, file }>
 * @param {Map} readingCounts Map<lclid, number>
 * @param {number} n  target sample size
 * @returns {Set<string>} selected lclids
 */
export function stratifiedSample(hhInfo, readingCounts, n) {
  const rng = makeRng(cfg.RANDOM_SEED);
  const minReadings = cfg.MIN_READINGS_PER_HH;

  // Filter eligible households
  const eligible = [];
  for (const [lclid, info] of hhInfo) {
    const cnt = readingCounts.get(lclid) || 0;
    if (cnt >= minReadings) eligible.push({ lclid, ...info });
  }

  // Group by stratum key
  const strata = new Map();
  for (const hh of eligible) {
    const key = `${hh.tariff}||${hh.acornGrouped}`;
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key).push(hh);
  }

  // Shuffle each stratum deterministically
  for (const arr of strata.values()) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // Proportional allocation
  const total = eligible.length;
  const selected = new Set();
  const stratumEntries = [...strata.entries()];

  // First pass: proportional floor
  const allocations = stratumEntries.map(([, arr]) => ({
    arr,
    alloc: Math.floor((arr.length / total) * n),
    remainder: ((arr.length / total) * n) % 1,
  }));

  let allocated = allocations.reduce((s, a) => s + a.alloc, 0);

  // Sort by remainder desc to distribute remaining slots
  allocations.sort((a, b) => b.remainder - a.remainder);
  for (const a of allocations) {
    if (allocated >= n) break;
    a.alloc++;
    allocated++;
  }

  // Pick from each stratum
  for (const a of allocations) {
    const take = Math.min(a.alloc, a.arr.length);
    for (let i = 0; i < take; i++) {
      selected.add(a.arr[i].lclid);
    }
  }

  return selected;
}

/**
 * Given a Map<lclid, count>, return how many households pass minReadings threshold
 * for a quick preview before full sample.
 */
export function countEligible(hhInfo, readingCounts) {
  let count = 0;
  for (const lclid of hhInfo.keys()) {
    if ((readingCounts.get(lclid) || 0) >= cfg.MIN_READINGS_PER_HH) count++;
  }
  return count;
}
